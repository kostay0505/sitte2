import { Injectable } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { JsFranceRepository } from './jsfrance.repository';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'https://www.jsfrance.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const DELAY_MS = 1500;

// SSL agent that ignores cert errors (jsfrance has cert chain issue)
const SSL_AGENT = new https.Agent({ rejectUnauthorized: false });

@Injectable()
export class JsFranceService {
    constructor(
        private readonly parserSettings: ParserSettingsService,private readonly repo: JsFranceRepository) {}

    @Cron('0 14 * * *')
    async scheduledParse(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('jsfrance'))) return;
        await this.parseAndSave();
    }

    async parseAndSave(): Promise<void> {
        const existingIds = await this.repo.getAllExternalIds();

        // Step 1: collect all category URLs from main menu
        const categoryUrls = await this.collectCategoryUrls();
        console.log(`[JsFrance] found ${categoryUrls.length} categories`);

        // Step 2: for each category, paginate and collect product URLs
        const productUrls = new Set<string>();
        for (const catUrl of categoryUrls) {
            const urls = await this.collectProductUrlsFromCategory(catUrl);
            urls.forEach(u => productUrls.add(u));
            await this.delay(DELAY_MS);
        }
        console.log(`[JsFrance] found ${productUrls.size} product URLs`);

        // Mark items no longer on site as archived
        const foundIds = new Set<string>();
        for (const url of productUrls) {
            const id = this.extractExternalId(url);
            if (id) foundIds.add(id);
        }
        for (const id of existingIds) {
            if (!foundIds.has(id)) {
                await this.repo.markNotFound(id);
            }
        }

        // Step 3: for each product URL, fetch details and save
        let newCount = 0;
        let errorCount = 0;
        for (const url of productUrls) {
            const externalId = this.extractExternalId(url);
            if (!externalId) continue;

            if (existingIds.has(externalId)) {
                // Restore if previously archived
                await this.repo.markAvailable(externalId);
                // Re-check price/condition
                try {
                    await this.delay(DELAY_MS);
                    const html = await this.fetchText(url);
                    const priceHt = this.extractPriceHt(html);
                    const priceTtc = this.extractPriceTtc(html);
                    const condition = this.extractCondition(html);
                    await this.repo.update(externalId, { priceHt, priceTtc, condition, siteStatus: 'available' });
                } catch { /* skip */ }
                continue;
            }

            try {
                await this.delay(DELAY_MS);
                const html = await this.fetchText(url);
                const title = this.extractTitle(html);
                const description = this.extractDescription(html);
                const priceHt = this.extractPriceHt(html);
                const priceTtc = this.extractPriceTtc(html);
                const condition = this.extractCondition(html);
                const sku = this.extractSku(html);
                const brand = this.extractBrand(title);
                const images = this.extractImages(html);
                const categoryName = this.extractCategoryFromUrl(url);

                await this.repo.create({
                    id: crypto.randomUUID(),
                    externalId,
                    url,
                    title,
                    description,
                    priceHt,
                    priceTtc,
                    brand,
                    condition,
                    sku,
                    categoryName,
                    images,
                });

                existingIds.add(externalId);
                newCount++;
            } catch {
                errorCount++;
            }
        }

        console.log(`[JsFrance] done: +${newCount} new, ${errorCount} errors`);
    }

    async downloadPhotos(id: string): Promise<{ count: number }> {
        const product = await this.repo.findById(id);
        if (!product) throw new Error('Product not found');
        if (!product.images || product.images.length === 0) throw new Error('No images');

        const uploadsDir = path.join(process.cwd(), 'uploads', 'jsfrance', id);
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        const saved: string[] = [];
        for (const imgUrl of product.images.slice(0, 20)) {
            try {
                const ext = path.extname(imgUrl.split('?')[0]) || '.jpg';
                const filename = `${crypto.randomUUID()}${ext}`;
                await this.downloadFile(imgUrl, path.join(uploadsDir, filename));
                saved.push(filename);
            } catch { /* skip */ }
        }

        await this.repo.setLocalImages(id, saved, null);
        return { count: saved.length };
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private async collectCategoryUrls(): Promise<string[]> {
        try {
            const html = await this.fetchText(`${BASE_URL}/en/`);
            const seen = new Set<string>();
            const results: string[] = [];
            // Match all /en/NNN-slug links from menu
            const matches = html.matchAll(/href="https?:\/\/www\.jsfrance\.com(\/en\/\d+[\w-]+)"/g);
            for (const m of matches) {
                const path = m[1];
                // Skip if it looks like a product page (contains dot)
                if (path.includes('.html')) continue;
                // Must match /en/digits-slug pattern
                if (!/\/en\/\d+/.test(path)) continue;
                const full = `${BASE_URL}${path}`;
                if (!seen.has(full)) {
                    seen.add(full);
                    results.push(full);
                }
            }
            return results;
        } catch {
            return [];
        }
    }

    private async collectProductUrlsFromCategory(categoryUrl: string): Promise<string[]> {
        const urls: string[] = [];
        let page = 1;

        while (true) {
            const pageUrl = page === 1 ? categoryUrl : `${categoryUrl}?p=${page}`;
            try {
                await this.delay(DELAY_MS);
                const html = await this.fetchText(pageUrl);

                // Extract product URLs from li.ajax_block_product h3 a href
                const found: string[] = [];
                const matches = html.matchAll(/class="ajax_block_product[^"]*"[\s\S]*?href="([^"]+\.html)"/g);
                for (const m of matches) {
                    const u = m[1].startsWith('http') ? m[1] : `${BASE_URL}${m[1]}`;
                    found.push(u);
                }

                if (found.length === 0) break;
                found.forEach(u => urls.push(u));

                // Check if there's a next page
                if (!html.includes('id="pagination_next"') || html.includes('class="disabled" id="pagination_next"')) {
                    break;
                }
                page++;
                if (page > 100) break; // safety limit
            } catch {
                break;
            }
        }

        return urls;
    }

    private extractExternalId(url: string): string | null {
        // /en/category/12345-slug.html → "12345"
        const m = url.match(/\/(\d+)-[^/]+\.html/);
        return m ? m[1] : null;
    }

    private extractCategoryFromUrl(url: string): string | null {
        // /en/retours-actifs-passifs/5047-... → "retours-actifs-passifs"
        const m = url.match(/\/en\/([^/]+)\/\d+/);
        if (m) return m[1].replace(/-/g, ' ');
        return null;
    }

    private extractTitle(html: string): string | null {
        // <h1 itemprop="name">...</h1> or #product-title-block h1
        const m = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i)
            ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (!m) return null;
        return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
    }

    private extractDescription(html: string): string | null {
        const m = html.match(/id="product_description_short"[^>]*>([\s\S]*?)<\/div>/i)
            ?? html.match(/id="product_description"[^>]*>([\s\S]*?)<\/div>/i);
        if (!m) return null;
        return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
    }

    // Note: jsfrance has confusing class names — span.ht shows TTC price, span.ttc shows HT price
    private extractPriceTtc(html: string): string | null {
        const m = html.match(/<span class="ht">([^<]+)<\/span>/i);
        return m ? m[1].trim() : null;
    }

    private extractPriceHt(html: string): string | null {
        const m = html.match(/<span class="ttc">([^<]+)<\/span>/i);
        return m ? m[1].trim() : null;
    }

    private extractCondition(html: string): string | null {
        // <div class="neufoccaz Occasion">Occasion</div>
        const m = html.match(/class="neufoccaz[^"]*"\s*>([^<]+)</i);
        return m ? m[1].trim() : null;
    }

    private extractSku(html: string): string | null {
        // <span class="editable" itemprop="sku">115XTHIQ-o</span>
        const m = html.match(/itemprop="sku"[^>]*>([^<]+)<\/span>/i)
            ?? html.match(/id="product_reference"[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
        return m ? m[1].trim() : null;
    }

    private extractBrand(title: string | null): string | null {
        if (!title) return null;
        // "L ACOUSTICS - 115XT HiQ" → "L ACOUSTICS"
        const m = title.match(/^([A-Z][^-]+?)\s+-\s+/);
        return m ? m[1].trim() : null;
    }

    private extractImages(html: string): string[] {
        const seen = new Set<string>();
        const results: string[] = [];

        // thickbox_default images (highest quality available without auth)
        const matches = html.matchAll(/https?:\/\/www\.jsfrance\.com\/\d+-(?:thickbox_default|large_default)\/[^"'\s]+/g);
        for (const m of matches) {
            const u = m[0];
            if (!seen.has(u)) { seen.add(u); results.push(u); }
        }

        // Fallback: og:image
        if (results.length === 0) {
            const og = html.match(/property="og:image"\s+content="([^"]+)"/i)
                ?? html.match(/content="([^"]+)"\s+property="og:image"/i);
            if (og) results.push(og[1]);
        }

        return results;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }

    private fetchText(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const isHttps = url.startsWith('https');
            const lib = isHttps ? https : http;
            const options: any = {
                headers: {
                    'User-Agent': UA,
                    'Accept': 'text/html,application/xhtml+xml,*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                timeout: 20000,
            };
            if (isHttps) options.agent = SSL_AGENT;

            const req = lib.get(url, options, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    const loc = res.headers.location;
                    if (loc) return this.fetchText(loc.startsWith('http') ? loc : `${BASE_URL}${loc}`).then(resolve).catch(reject);
                    return reject(new Error('Redirect without location'));
                }
                if (res.statusCode && res.statusCode >= 400) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
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
            const isHttps = url.startsWith('https');
            const lib = isHttps ? https : http;
            const options: any = { headers: { 'User-Agent': UA }, timeout: 30000 };
            if (isHttps) options.agent = SSL_AGENT;

            const file = fs.createWriteStream(dest);
            const req = lib.get(url, options, (res) => {
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
