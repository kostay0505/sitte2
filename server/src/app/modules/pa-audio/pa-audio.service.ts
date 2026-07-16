import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { PaAudioRepository } from './pa-audio.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PaAudioService {
    private readonly BASE_URL = 'https://pa-audio.eu';

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repo: PaAudioRepository,
        @Inject(forwardRef(() => ParserNotificationService)) private readonly parserNotification: ParserNotificationService,
    ) {}

    async getList(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean) {
        return this.repo.findAll(status, page, limit, isNew, notInBase);
    }

    async getOne(id: string) {
        const product = await this.repo.findById(id);
        if (product?.isNew) await this.repo.clearNew(id);
        return product;
    }

    async archive(id: string) { await this.repo.setStatus(id, 'archived'); return { success: true }; }
    async unarchive(id: string) { await this.repo.setStatus(id, 'active'); return { success: true }; }
    async blacklist(id: string) { await this.repo.setStatus(id, 'blacklisted'); return { success: true }; }

    @Cron('0 5 * * *')
    async scheduledParse(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('pa-audio'))) return;
        await this.parseAndSave();
    }

    async parseAndSave(): Promise<{ added: number; errors: number }> {
        let added = 0;
        let errors = 0;
        const newItems: Array<{ title: string; url: string }> = [];

        // Step 1: get all product URLs from sitemap (most efficient)
        const productUrls: string[] = [];
        try {
            const sitemapXml = await this.fetchUrl(`${this.BASE_URL}/product-sitemap.xml`);
            const locRegex = /<loc>(https:\/\/pa-audio\.eu\/product\/[^<]+)<\/loc>/g;
            let m;
            while ((m = locRegex.exec(sitemapXml)) !== null) {
                if (!productUrls.includes(m[1])) productUrls.push(m[1]);
            }
        } catch {
            // Fallback: paginate category listing
            for (let pg = 1; pg <= 50; pg++) {
                try {
                    const url = pg === 1
                        ? `${this.BASE_URL}/product-category/audio/`
                        : `${this.BASE_URL}/product-category/audio/page/${pg}/`;
                    const html = await this.fetchUrl(url);
                    const urls = this.extractProductUrlsFromHtml(html);
                    if (urls.length === 0) break;
                    for (const u of urls) { if (!productUrls.includes(u)) productUrls.push(u); }
                    if (urls.length < 12) break;
                    await this.delay(300);
                } catch { break; }
            }
        }

        // Step 2: mark not_found products
        const knownIds = await this.repo.getAllExternalIds();
        const knownSet = new Set(knownIds);
        const newSet = new Set(productUrls);
        for (const externalId of knownSet) {
            if (!newSet.has(externalId)) await this.repo.markNotFound(externalId);
        }

        // Step 3: fetch and save new products
        for (const url of productUrls) {
            try {
                const existing = await this.repo.findByExternalId(url);
                if (existing) {
                    if (existing.siteStatus === 'not_found') await this.repo.markAvailable(url);
                    // Re-fetch price if missing
                    if (!existing.price) {
                        const html = await this.fetchUrl(url);
                        const data = this.extractProduct(html, url);
                        if (data?.price) {
                            await this.repo.updatePrice(existing.id, data.price, data.currency ?? null);
                        }
                        await this.delay(300);
                    }
                    continue;
                }

                const html = await this.fetchUrl(url);
                const data = this.extractProduct(html, url);
                if (!data || !data.title) { errors++; continue; }

                await this.repo.create(data);
                added++;
                newItems.push({ title: data.title, url: data.url ?? url });
                await this.delay(500);
            } catch { errors++; }
        }

        await this.parserNotification.notify('PA-Audio', 'pa-audio.eu', newItems);
        return { added, errors };
    }

    private extractProductUrlsFromHtml(html: string): string[] {
        const urls: string[] = [];
        const regex = /href="(https:\/\/pa-audio\.eu\/product\/[^"?#]+)"/g;
        let m;
        while ((m = regex.exec(html)) !== null) {
            const u = m[1].replace(/\/$/, '') + '/';
            if (!urls.includes(u)) urls.push(u);
        }
        return urls;
    }

    private extractProduct(html: string, url: string): any | null {
        let title: string | null = null;
        let price: string | null = null;
        let currency: string | null = null;
        let description: string | null = null;
        let images: string[] = [];
        let sku: string | null = null;
        let availability: string | null = null;
        let condition: string | null = null;
        let brand: string | null = null;
        let categories: string | null = null;

        // Parse JSON-LD (WooCommerce outputs Product schema)
        const scriptTags = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
        for (const tag of scriptTags) {
            const content = tag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
            try {
                const parsed = JSON.parse(content);
                // Support both flat array/object and @graph structure
                let items: any[] = Array.isArray(parsed) ? parsed : [parsed];
                if (!Array.isArray(parsed) && parsed['@graph']) {
                    items = parsed['@graph'];
                }
                for (const item of items) {
                    if (item['@type'] === 'Product') {
                        title = item.name || null;
                        sku = item.sku || null;
                        brand = item.brand?.name || null;

                        const offers = item.offers
                            ? (Array.isArray(item.offers) ? item.offers[0] : item.offers)
                            : null;
                        if (offers) {
                            if (offers.price) price = String(offers.price);
                            currency = offers.priceCurrency || null;
                            availability = offers.availability?.includes('InStock') ? 'In Stock' : 'Out of Stock';
                        }

                        if (item.image) {
                            const imgs = Array.isArray(item.image) ? item.image : [item.image];
                            images = imgs.filter((i: any) => typeof i === 'string');
                        }

                        if (item.description) {
                            description = String(item.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        }
                        break;
                    }
                }
                if (title) break;
            } catch {}
        }

        // ── Price fallback: extract from WooCommerce HTML ──────────────────
        // PA Audio JSON-LD may lack @type=Product so we parse from the HTML directly.

        if (!price) {
            // 1. Inline JS variable pattern: "price":"3890"
            const jsonPriceM = html.match(/"price":"(\d+(?:\.\d{1,2})?)"/);
            if (jsonPriceM) price = jsonPriceM[1];
        }

        if (!price) {
            // 2. WooCommerce <bdi> tag:
            //    <bdi>3.890&nbsp;<span class="woocommerce-Price-currencySymbol">&euro;</span></bdi>
            //    European format: dot = thousands separator, comma = decimal separator
            const bdiM = html.match(
                /<bdi>([\d.,]+)(?:&nbsp;|\u00a0|\s)*<span[^>]*woocommerce-Price-currencySymbol[^>]*>([^<]+)<\/span>/
            );
            if (bdiM) {
                const raw = bdiM[1].trim();
                if (raw.includes(',')) {
                    // "1.234,56" → "1234.56"
                    price = raw.replace(/\./g, '').replace(',', '.');
                } else {
                    // "3.890" → "3890" (dot is thousands separator)
                    price = raw.replace(/\./g, '');
                }
                if (!currency) {
                    const sym = bdiM[2]
                        .replace(/&euro;/g, '€')
                        .replace(/&pound;/g, '£')
                        .trim();
                    if (sym === '€') currency = 'EUR';
                    else if (sym === '£') currency = 'GBP';
                    else if (sym === '$') currency = 'USD';
                }
            }
        }
        // ──────────────────────────────────────────────────────────────────

        if (!title) {
            const m = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([^<]+)<\/h1>/);
            if (m) title = m[1].trim();
        }
        if (!title) return null;

        // Extract description from page HTML (more complete than JSON-LD)
        if (!description || description.length < 30) {
            const sdMatch = html.match(/<div[^>]*class="[^"]*short-description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
            if (sdMatch) {
                const cleaned = sdMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleaned.length > 10) description = cleaned;
            }
        }
        if (!description || description.length < 30) {
            const tdMatch = html.match(/<div[^>]*id="tab-description"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
            if (tdMatch) {
                const cleaned = tdMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleaned.length > 10) description = cleaned;
            }
        }
        if (!description || description.length < 30) {
            const panelMatch = html.match(/woocommerce-Tabs-panel--description[^>]*>([\s\S]{20,800}?)<\/div>/);
            if (panelMatch) {
                const cleaned = panelMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleaned.length > 10) description = cleaned;
            }
        }

        // Extract condition
        const condMatch = html.match(/(?:Condition|Status)[^<]*<[^>]+>\s*([^<]+(?:hand|new|condition)[^<]*)/i);
        if (condMatch) {
            condition = condMatch[1].trim();
        }
        if (!condition) {
            if (html.includes('Second hand')) condition = 'Second hand';
            else if (html.includes('Brand New') || html.includes('Brand new')) condition = 'Brand New';
        }

        // Extract quantity from stock info
        const stockMatch = html.match(/(\d+)\s+(?:items?\s+available|in\s+stock)/i);
        if (stockMatch) {
            availability = `${stockMatch[1]} in stock`;
        }

        // Extract categories from breadcrumb
        const breadcrumbMatch = html.match(/<nav[^>]*(?:aria-label="[^"]*breadcrumb|class="[^"]*breadcrumb)[^>]*>([\s\S]*?)<\/nav>/i);
        if (breadcrumbMatch) {
            const catLinks = breadcrumbMatch[1].match(/<a[^>]*>([^<]+)<\/a>/g) || [];
            const cats = catLinks
                .map((a: string) => a.replace(/<[^>]+>/g, '').trim())
                .filter((c: string) => c && c !== 'Home');
            if (cats.length > 0) categories = cats.join(' > ');
        }

        // Fallback images
        if (images.length === 0) {
            const imgRegex = /data-large_image="([^"]+)"/g;
            let imgM;
            while ((imgM = imgRegex.exec(html)) !== null) {
                if (!images.includes(imgM[1])) images.push(imgM[1]);
            }
        }
        if (images.length === 0) {
            const imgRegex2 = /src="(https:\/\/pa-audio\.eu\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
            let imgM2;
            while ((imgM2 = imgRegex2.exec(html)) !== null) {
                if (!images.includes(imgM2[1]) && !imgM2[1].includes('-150x') && !imgM2[1].includes('-300x')) {
                    images.push(imgM2[1]);
                }
            }
        }

        return { externalId: url, url, title, description, price, currency, condition, brand, sku, availability, images, categories };
    }

    async downloadPhotos(id: string): Promise<{ success: boolean; count: number; dir: string; driveId?: string }> {
        const product = await this.repo.findById(id);
        if (!product) throw new Error('Товар не найден');

        const images = product.images ?? [];
        if (images.length === 0) return { success: true, count: 0, dir: '' };

        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const safeName = product.title.replace(/[^\w\sа-яА-ЯёЁ]/g, '').trim().slice(0, 40).replace(/\s+/g, '_');
        const date = String(now.getDate()).padStart(2, '0');
        const destDir = `/var/www/touring-test/server/uploads/фотографии/${month}/${date}_PAudio_${safeName}`;

        fs.mkdirSync(destDir, { recursive: true });

        const localPaths: string[] = [];
        let productFolderId: string | undefined;

        try {
            const db = (this.repo as any).db;
            const { sql } = require('drizzle-orm');
            const rootRows = await db.execute(
                sql`SELECT id FROM DriveFolders WHERE name = 'PA Audio' AND parentId IS NULL LIMIT 1`
            ) as unknown as any[];
            let parentFolderId: string;
            const existingRoot = (rootRows[0] as any[])[0];
            if (existingRoot) {
                parentFolderId = existingRoot.id;
            } else {
                parentFolderId = crypto.randomUUID();
                await db.execute(
                    sql`INSERT INTO DriveFolders (id, name, parentId, createdBy) VALUES (${parentFolderId}, 'PA Audio', NULL, 'parser')`
                );
            }
            const folderName = `${date}_${safeName}`.slice(0, 60);
            productFolderId = crypto.randomUUID();
            await db.execute(
                sql`INSERT INTO DriveFolders (id, name, parentId, createdBy) VALUES (${productFolderId}, ${folderName}, ${parentFolderId}, 'parser')`
            );
        } catch {}

        for (let i = 0; i < images.length; i++) {
            try {
                const imgUrl = images[i];
                const ext = imgUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
                const filename = `${String(i + 1).padStart(2, '0')}.${ext}`;
                const filepath = path.join(destDir, filename);
                await this.downloadFile(imgUrl, filepath);
                localPaths.push(filepath);

                if (productFolderId) {
                    try {
                        const db = (this.repo as any).db;
                        const { sql } = require('drizzle-orm');
                        const fileId = crypto.randomUUID();
                        await db.execute(
                            sql`INSERT INTO DriveFiles (id, name, storedName, mimeType, size, folderId, createdBy)
                                VALUES (${fileId}, ${filename}, ${filepath}, ${'image/' + (ext === 'jpg' ? 'jpeg' : ext)}, ${fs.statSync(filepath).size}, ${productFolderId}, 'parser')`
                        );
                    } catch {}
                }
            } catch {}
        }

        await this.repo.setLocalImages(id, localPaths, productFolderId);
        return { success: true, count: localPaths.length, dir: destDir, driveId: productFolderId };
    }

    private fetchUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const req = client.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            }, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    this.fetchUrl(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            });
            req.on('error', reject);
            req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
        });
    }

    private downloadFile(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(dest);
            const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
                if (res.statusCode && res.statusCode >= 400) { file.close(); fs.unlink(dest, () => {}); reject(new Error(`HTTP ${res.statusCode}`)); return; }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            });
            req.on('error', (err) => { file.close(); fs.unlink(dest, () => {}); reject(err); });
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
