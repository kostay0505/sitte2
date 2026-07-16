
import { Injectable } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { CuesaleRepository } from './cuesale.repository';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';

const SITEMAP_URLS = [
  'https://cuesale.com/product-sitemap.xml',
  'https://cuesale.com/product-sitemap2.xml',
  'https://cuesale.com/product-sitemap3.xml',
  'https://cuesale.com/product-sitemap4.xml',
  'https://cuesale.com/product-sitemap5.xml',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const DELAY_MS = 2500;

@Injectable()
export class CuesaleService {
  constructor(
        private readonly parserSettings: ParserSettingsService,private readonly repo: CuesaleRepository) {}

  @Cron('0 11 * * *')
  async scheduledParse(): Promise<void> {
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    if (!(await this.parserSettings.isEnabled('cuesale'))) return;
    await this.parseAndSave();
  }

  async parseAndSave(): Promise<void> {
    const existingIds = await this.repo.getAllExternalIds();
    const urls = await this.collectProductUrls();

    // Mark items no longer in sitemap as archived
    const foundSlugs = new Set(
      urls.map(u => this.extractSlug(u)).filter((s): s is string => s !== null)
    );
    for (const id of existingIds) {
      if (!foundSlugs.has(id)) {
        await this.repo.markNotFound(id);
      }
    }

    for (const url of urls) {
      const slug = this.extractSlug(url);
      if (!slug) continue;

      if (existingIds.has(slug)) {
        // Restore if previously archived
        await this.repo.markAvailable(slug);
        // Re-check existing to update stock/price
        try {
          await this.delay(DELAY_MS);
          const html = await this.fetchText(url);
          if (!html) continue;
          const jsonLd = this.extractJsonLd(html);
          if (!jsonLd) continue;
          const availability = (jsonLd.offers?.[0]?.availability ?? jsonLd.offers?.availability ?? '');
          const siteStatus = availability.includes('OutOfStock') ? 'not_found' : 'available';
          const price = String(jsonLd.offers?.[0]?.price ?? jsonLd.offers?.price ?? '').trim();
          const stockQuantity = this.extractStockQuantity(html);
          await this.repo.update(slug, { siteStatus, price, stockQuantity: stockQuantity ?? undefined });
        } catch { /* skip */ }
        continue;
      }

      try {
        await this.delay(DELAY_MS);
        const html = await this.fetchText(url);
        if (!html) continue;

        const jsonLd = this.extractJsonLd(html);
        if (!jsonLd) continue;

        const title = (jsonLd.name ?? '').trim();
        const description = (jsonLd.description ?? '').replace(/\r/g, '').replace(/\t/g, '').trim();
        const offersArr = Array.isArray(jsonLd.offers) ? jsonLd.offers : (jsonLd.offers ? [jsonLd.offers] : []);
        const offer = offersArr[0] ?? {};
        const price = String(offer.price ?? '').trim();
        const currency = (offer.priceCurrency ?? '').trim();
        const availability = (offer.availability ?? '');
        const siteStatus: 'available' | 'not_found' = availability.includes('OutOfStock') ? 'not_found' : 'available';
        const brand = this.extractBrand(html) ?? (jsonLd.brand?.name ?? null);
        const stockQuantity = this.extractStockQuantity(html);
        const images = this.extractImages(html);

        await this.repo.create({
          id: crypto.randomUUID(),
          externalId: slug,
          url,
          title: title || null,
          description: description || null,
          price: price || null,
          currency: currency || null,
          brand: brand || '—',
          stockQuantity: stockQuantity ?? null,
          images: images.length > 0 ? images : null,
          status: 'active',
          siteStatus,
          isNew: true,
          imagesDownloaded: false,
          localImages: null,
          driveFolderId: null,
          lastCheckedAt: null,
          baseItemId: null,
        });

        existingIds.add(slug);
      } catch (e) {
        // skip individual failures
      }
    }
  }

  async downloadPhotos(id: string): Promise<{ count: number; dir: string; driveId: string | null }> {
    const product = await this.repo.findById(id);
    if (!product) throw new Error('Product not found');
    if (!product.images || product.images.length === 0) throw new Error('No images');

    const db: any = (this.repo as any).db;
    const uploadsDir = path.join(process.cwd(), 'uploads', 'cuesale', id);
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const saved: string[] = [];
    for (const imgUrl of product.images) {
      try {
        const ext = path.extname(imgUrl.split('?')[0]) || '.jpg';
        const filename = `${crypto.randomUUID()}${ext}`;
        const dest = path.join(uploadsDir, filename);
        await this.downloadFile(imgUrl, dest);
        saved.push(filename);
      } catch { /* skip */ }
    }

    // Save to Drive
    let driveFolderId: string | null = null;
    try {
      const folderName = `CueSale — ${product.title ?? product.externalId}`;
      const folderId = crypto.randomUUID();
      await db.execute(sql`
        INSERT INTO DriveFolders (id, name, parentId, createdBy, createdAt, updatedAt)
        VALUES (${folderId}, ${folderName}, NULL, 'parser', NOW(), NOW())
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `);
      for (const filename of saved) {
        const fileId = crypto.randomUUID();
        await db.execute(sql`
          INSERT INTO DriveFiles (id, folderId, name, originalName, mimeType, size, uploadedBy, createdAt, updatedAt)
          VALUES (${fileId}, ${folderId}, ${filename}, ${filename}, 'image/jpeg', 0, 'parser', NOW(), NOW())
        `);
      }
      driveFolderId = folderId;
    } catch { /* Drive not critical */ }

    await this.repo.setLocalImages(id, saved, driveFolderId);

    return { count: saved.length, dir: uploadsDir, driveId: driveFolderId };
  }

  // ─── helpers ───

  private async collectProductUrls(): Promise<string[]> {
    const urls: string[] = [];
    for (const sitemapUrl of SITEMAP_URLS) {
      try {
        const xml = await this.fetchText(sitemapUrl);
        const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
        for (const m of matches) {
          const u = m[1].trim();
          if (u.includes('/product/')) urls.push(u);
        }
      } catch { /* skip failed sitemap */ }
    }
    // deduplicate
    return [...new Set(urls)];
  }

  private extractSlug(url: string): string | null {
    const m = url.match(/\/product\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  private extractJsonLd(html: string): any {
    const matches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of matches) {
      try {
        const parsed = JSON.parse(m[1]);
        // Handle @graph array
        if (parsed['@graph']) {
          const product = parsed['@graph'].find((n: any) => n['@type'] === 'Product');
          if (product) return product;
        }
        if (parsed['@type'] === 'Product') return parsed;
      } catch { /* malformed */ }
    }
    return null;
  }

  private extractBrand(html: string): string | null {
    // <a href="...filter_brand=xxx"><img ... alt="Brand Name" ...>
    const m = html.match(/filter_brand=[^"']+["'][^>]*>\s*<img[^>]+(?:alt|title)="([^"]+)"/i);
    if (m) return m[1].trim();
    // Fallback: .product_meta brand span
    const m2 = html.match(/class="[^"]*brand[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
    if (m2) return m2[1].trim();
    return null;
  }

  private extractStockQuantity(html: string): string | null {
    // <p class="stock in-stock">2 in stock</p>
    // <p class="stock out-of-stock">Out of stock</p>
    const m = html.match(/<p[^>]+class="[^"]*stock[^"]*"[^>]*>([^<]+)<\/p>/i);
    if (m) return m[1].trim();
    return null;
  }

  private extractImages(html: string): string[] {
    const seen = new Set<string>();
    const results: string[] = [];

    // WooCommerce gallery: data-large_image="URL"
    const largeMatches = html.matchAll(/data-large_image="([^"]+)"/g);
    for (const m of largeMatches) {
      const u = m[1];
      if (!seen.has(u)) { seen.add(u); results.push(u); }
    }

    // Fallback: img src from gallery div
    if (results.length === 0) {
      const galleryMatch = html.match(/<div[^>]+class="[^"]*woocommerce-product-gallery[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
      if (galleryMatch) {
        const imgMatches = galleryMatch[1].matchAll(/<img[^>]+src="([^"]+wp-content\/uploads[^"]+)"/g);
        for (const m of imgMatches) {
          const u = m[1];
          if (!seen.has(u)) { seen.add(u); results.push(u); }
        }
      }
    }

    // Fallback: JSON-LD image already extracted separately; also check og:image
    if (results.length === 0) {
      const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
      if (og) results.push(og[1]);
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  private fetchText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 20000,
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (loc) return this.fetchText(loc).then(resolve).catch(reject);
          return reject(new Error('Redirect without location'));
        }
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(dest);
      const req = lib.get(url, { headers: { 'User-Agent': UA }, timeout: 30000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlink(dest, () => {});
          const loc = res.headers.location;
          if (loc) return this.downloadFile(loc, dest).then(resolve).catch(reject);
          return reject(new Error('Redirect without location'));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }
}
