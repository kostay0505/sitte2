import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { AvlsRepository } from './avls.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AvlsService {
    private readonly BASE_URL = 'https://avlsgears.com';

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repo: AvlsRepository,
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

    async archive(id: string) {
        await this.repo.setStatus(id, 'archived');
        return { success: true };
    }

    async unarchive(id: string) {
        await this.repo.setStatus(id, 'active');
        return { success: true };
    }

    async blacklist(id: string) {
        await this.repo.setStatus(id, 'blacklisted');
        return { success: true };
    }

    @Cron('0 2 * * *')
    async scheduledParse(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('avls'))) return;
        await this.parseAndSave();
    }

    async parseAndSave(): Promise<{ added: number; updated: number; errors: number }> {
        let added = 0;
        let errors = 0;
        const newItems: Array<{ title: string; url: string }> = [];

        // Step 1: collect all product URLs from shop listing pages
        const productUrls: string[] = [];
        for (let page = 1; page <= 50; page++) {
            try {
                const url = page === 1
                    ? `${this.BASE_URL}/shop/`
                    : `${this.BASE_URL}/shop/page/${page}/`;
                const html = await this.fetchUrl(url);
                const urls = this.extractProductUrls(html);
                if (urls.length === 0) break;
                for (const u of urls) {
                    if (!productUrls.includes(u)) productUrls.push(u);
                }
                // If fewer than 12 products — likely the last page
                if (urls.length < 12) break;
                await this.delay(300);
            } catch {
                break;
            }
        }

        // Step 2: get all known external IDs to detect removed products
        const knownIds = await this.repo.getAllExternalIds();
        const knownSet = new Set(knownIds);
        const newSet = new Set(productUrls);

        // Mark products no longer on site as not_found
        for (const externalId of knownSet) {
            if (!newSet.has(externalId)) {
                await this.repo.markNotFound(externalId);
            }
        }

        // Step 3: fetch and save new products; update price on existing ones that are missing it
        let updated = 0;
        for (const url of productUrls) {
            try {
                const existing = await this.repo.findByExternalId(url);
                if (existing) {
                    if (existing.siteStatus === 'not_found') {
                        await this.repo.markAvailable(url);
                    }
                    // Re-fetch if price is missing
                    if (!existing.price) {
                        const html = await this.fetchUrl(url);
                        const data = this.extractProduct(html, url);
                        if (data) {
                            await this.repo.updatePriceData(existing.id, {
                                price: data.price,
                                currency: data.currency,
                                availability: data.availability,
                                description: data.description,
                                sku: data.sku,
                                brand: data.brand,
                                images: data.images,
                            });
                            updated++;
                        }
                        await this.delay(400);
                    }
                    continue;
                }

                const html = await this.fetchUrl(url);
                const data = this.extractProduct(html, url);
                if (!data || !data.title) { errors++; continue; }

                await this.repo.create(data);
                added++;
                newItems.push({ title: data.title, url: data.url ?? url });
                await this.delay(400);
            } catch {
                errors++;
            }
        }

        await this.parserNotification.notify('AVLS', 'avlsgears.com', newItems);
        return { added, updated, errors };
    }

    private extractProductUrls(html: string): string[] {
        const urls: string[] = [];
        // WooCommerce product links have class "woocommerce-LoopProduct-link"
        const regex = /href="(https:\/\/avlsgears\.com\/product\/[^"?#]+)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const url = match[1].replace(/\/$/, '') + '/';
            if (!urls.includes(url)) urls.push(url);
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

        // Try JSON-LD Product schema (WooCommerce outputs this automatically)
        const scriptTags = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
        for (const scriptTag of scriptTags) {
            const content = scriptTag.replace(/<script[^>]*>/,'').replace(/<\/script>/,'').trim();
            try {
                const parsed = JSON.parse(content);
                // Support @graph wrapper (WooCommerce Yoast SEO format)
                const rawItems = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
                for (const item of rawItems) {
                    if (item['@type'] === 'Product') {
                        title = item.name || null;
                        description = item.description
                            ? String(item.description).replace(/<[^>]+>/g, '').trim()
                            : null;
                        sku = item.sku ? String(item.sku) : null;
                        brand = item.brand?.name || null;

                        const offers = item.offers
                            ? (Array.isArray(item.offers) ? item.offers[0] : item.offers)
                            : null;
                        if (offers) {
                            // Direct price on offers
                            if (offers.price) {
                                price = String(offers.price);
                                currency = offers.priceCurrency || null;
                            }
                            // priceSpecification nested (AVLS Gears uses this)
                            if (!price && offers.priceSpecification) {
                                const spec = Array.isArray(offers.priceSpecification)
                                    ? offers.priceSpecification[0]
                                    : offers.priceSpecification;
                                if (spec?.price) price = String(spec.price);
                                if (spec?.priceCurrency) currency = spec.priceCurrency;
                            }
                            availability = offers.availability?.includes('InStock') ? 'In Stock' : 'Out of Stock';
                        }

                        if (item.image) {
                            const imgs = Array.isArray(item.image) ? item.image : [item.image];
                            images = imgs.filter((i: any) => typeof i === 'string');
                        }
                        break;
                    }
                }
                if (title) break;
            } catch {}
        }

        // Fallback: extract title from H1
        if (!title) {
            const m = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([^<]+)<\/h1>/);
            if (m) title = m[1].trim();
        }
        if (!title) return null;

        // Extract description from HTML (more reliable than JSON-LD on WooCommerce)
        if (!description || description.length < 30) {
            // Try short description block (appears below price)
            const shortDescMatch = html.match(/<div[^>]*class="[^"]*short-description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
            if (shortDescMatch) {
                const cleaned = shortDescMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleaned.length > 10) description = cleaned;
            }
        }
        if (!description || description.length < 30) {
            // Try full description tab content
            const tabDescMatch = html.match(/<div[^>]*id="tab-description"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
            if (tabDescMatch) {
                const cleaned = tabDescMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleaned.length > 10) description = cleaned;
            }
        }
        if (!description || description.length < 30) {
            // Fallback: grab any <p> tags inside product description area
            const pMatch = html.match(/class="[^"]*product-details[^"]*"[^>]*>[\s\S]*?(<p>[\s\S]*?<\/p>)/);
            if (pMatch) {
                const cleaned = pMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleaned.length > 10) description = cleaned;
            }
        }

        // Extract condition from product attributes table
        const condMatch = html.match(/[Cc]ondition<\/th>[\s\S]{0,200}?<td[^>]*>([\s\S]*?)<\/td>/);
        if (condMatch) {
            condition = condMatch[1].replace(/<[^>]+>/g, '').trim() || null;
        }

        // Fallback: extract gallery images from data-large_image attributes
        if (images.length === 0) {
            const imgRegex = /data-large_image="([^"]+)"/g;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(html)) !== null) {
                if (!images.includes(imgMatch[1])) images.push(imgMatch[1]);
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
        const safeName = product.title
            .replace(/[^\w\sа-яА-ЯёЁ]/g, '')
            .trim()
            .slice(0, 40)
            .replace(/\s+/g, '_');
        const date = String(now.getDate()).padStart(2, '0');
        const destDir = `/var/www/touring-test/server/uploads/фотографии/${month}/${date}_AVLS_${safeName}`;

        fs.mkdirSync(destDir, { recursive: true });

        const localPaths: string[] = [];
        let productFolderId: string | undefined;

        // Drive integration via raw SQL (avoids coupling to DriveRepository)
        try {
            const db = (this.repo as any).db;
            const { sql } = require('drizzle-orm');

            // Find or create AVLS Gears parent folder
            const rootRows = await db.execute(
                sql`SELECT id FROM DriveFolders WHERE name = 'AVLS Gears' AND parentId IS NULL LIMIT 1`
            ) as unknown as any[];
            let parentFolderId: string;
            const existingRoot = (rootRows[0] as any[])[0];
            if (existingRoot) {
                parentFolderId = existingRoot.id;
            } else {
                parentFolderId = crypto.randomUUID();
                await db.execute(
                    sql`INSERT INTO DriveFolders (id, name, parentId, createdBy) VALUES (${parentFolderId}, 'AVLS Gears', NULL, 'parser')`
                );
            }

            // Create product folder
            const folderName = `${date}_${safeName}`.slice(0, 60);
            productFolderId = crypto.randomUUID();
            await db.execute(
                sql`INSERT INTO DriveFolders (id, name, parentId, createdBy) VALUES (${productFolderId}, ${folderName}, ${parentFolderId}, 'parser')`
            );
        } catch {}

        // Download images
        for (let i = 0; i < images.length; i++) {
            const imgUrl = images[i];
            try {
                const ext = imgUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
                const filename = `${String(i + 1).padStart(2, '0')}.${ext}`;
                const filepath = path.join(destDir, filename);
                await this.downloadFile(imgUrl, filepath);
                localPaths.push(filepath);

                // Register file in Drive
                if (productFolderId) {
                    try {
                        const db = (this.repo as any).db;
                        const { sql } = require('drizzle-orm');
                        const fileId = crypto.randomUUID();
                        const fileSize = fs.statSync(filepath).size;
                        const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                        await db.execute(
                            sql`INSERT INTO DriveFiles (id, name, storedName, mimeType, size, folderId, createdBy)
                                VALUES (${fileId}, ${filename}, ${filepath}, ${mimeType}, ${fileSize}, ${productFolderId}, 'parser')`
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
            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                },
            };
            const req = client.get(url, options, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    this.fetchUrl(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
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
                if (res.statusCode && res.statusCode >= 400) {
                    file.close();
                    fs.unlink(dest, () => {});
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            });
            req.on('error', (err) => { file.close(); fs.unlink(dest, () => {}); reject(err); });
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('Download timeout')); });
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
