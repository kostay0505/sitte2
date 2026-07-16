import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { SoundtradeRepository } from './soundtrade.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SoundtradeService {
    private readonly BASE_URL = 'https://www.soundtrade.nl';
    private readonly SSL_AGENT = new https.Agent({ rejectUnauthorized: false });

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repo: SoundtradeRepository,
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

    @Cron('0 8 * * *')
    async scheduledParse(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('soundtrade'))) return;
        await this.parseAndSave();
    }

    async parseAndSave(): Promise<{ added: number; updated: number; errors: number }> {
        let added = 0;
        let updated = 0;
        let errors = 0;
        const newItems: Array<{ title: string; url: string }> = [];

        // Step 1: collect all product URLs from the single store listing page
        const productUrls: string[] = [];
        try {
            const html = await this.fetchUrl(`${this.BASE_URL}/store/`);
            const urls = this.extractProductUrls(html);
            for (const u of urls) {
                if (!productUrls.includes(u)) productUrls.push(u);
            }
        } catch {
            return { added, updated, errors: 1 };
        }

        // Step 2: mark removed products as not_found
        const knownIds = await this.repo.getAllExternalIds();
        const knownSet = new Set(knownIds);
        const newSet = new Set(productUrls);
        for (const externalId of knownSet) {
            if (!newSet.has(externalId)) {
                await this.repo.markNotFound(externalId);
            }
        }

        // Step 3: save new products, update price on existing with missing price
        for (const url of productUrls) {
            try {
                const existing = await this.repo.findByExternalId(url);
                if (existing) {
                    if (existing.siteStatus === 'not_found') {
                        await this.repo.markAvailable(url);
                    }
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

        await this.parserNotification.notify('Soundtrade', 'soundtrade.nl', newItems);
        return { added, updated, errors };
    }

    private extractProductUrls(html: string): string[] {
        const urls: string[] = [];
        const regex = /href="(https:\/\/www\.soundtrade\.nl\/product\/[^"?#]+)"/g;
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
        let brand: string | null = null;

        // Try JSON-LD Product schema
        const scriptTags = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
        for (const scriptTag of scriptTags) {
            const content = scriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
            try {
                const parsed = JSON.parse(content);
                // Support @graph wrapper (Yoast SEO) and direct Product object
                const rawItems = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
                for (const item of rawItems) {
                    if (item['@type'] === 'Product') {
                        title = item.name
                            ? String(item.name).replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&[a-z]+;/g, '').trim()
                            : null;
                        description = item.description
                            ? String(item.description).replace(/<[^>]+>/g, '').trim()
                            : null;
                        sku = item.sku ? String(item.sku) : null;
                        brand = item.brand?.name
                            ? String(item.brand.name).replace(/&amp;/g, '&').replace(/&#038;/g, '&').trim()
                            : null;

                        const offers = item.offers
                            ? (Array.isArray(item.offers) ? item.offers[0] : item.offers)
                            : null;
                        if (offers) {
                            if (offers.price) {
                                price = String(offers.price);
                                currency = offers.priceCurrency || null;
                            }
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

        // Fallback: title from H1
        if (!title) {
            const m = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
            if (m) title = m[1].replace(/<[^>]+>/g, '').replace(/&#038;/g, '&').replace(/&amp;/g, '&').trim();
        }
        if (!title) return null;

        // Fallback: gallery images from data-large_image
        if (images.length === 0) {
            const imgRegex = /data-large_image="([^"]+)"/g;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(html)) !== null) {
                if (!images.includes(imgMatch[1])) images.push(imgMatch[1]);
            }
        }

        return { externalId: url, url, title, description, price, currency, brand, sku, availability, images };
    }

    async downloadPhotos(id: string): Promise<{ success: boolean; count: number; dir: string; driveId?: string }> {
        const product = await this.repo.findById(id);
        if (!product) throw new Error('Товар не найден');

        const images = product.images ?? [];
        if (images.length === 0) return { success: true, count: 0, dir: '' };

        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const safeName = (product.title ?? 'item')
            .replace(/[^\w\sа-яА-ЯёЁ]/g, '').trim().slice(0, 40).replace(/\s+/g, '_');
        const date = String(now.getDate()).padStart(2, '0');
        const destDir = `/var/www/touring-test/server/uploads/фотографии/${month}/${date}_SoundTrade_${safeName}`;

        fs.mkdirSync(destDir, { recursive: true });

        const localPaths: string[] = [];
        let productFolderId: string | undefined;

        try {
            const db = (this.repo as any).db;
            const { sql } = require('drizzle-orm');
            const rootRows = await db.execute(sql`SELECT id FROM DriveFolders WHERE name = 'SoundTrade' AND parentId IS NULL LIMIT 1`) as unknown as any[];
            let parentFolderId: string;
            const existingRoot = (rootRows[0] as any[])[0];
            if (existingRoot) {
                parentFolderId = existingRoot.id;
            } else {
                parentFolderId = crypto.randomUUID();
                await db.execute(sql`INSERT INTO DriveFolders (id, name, parentId, createdBy) VALUES (${parentFolderId}, 'SoundTrade', NULL, 'parser')`);
            }
            const folderName = `${date}_${safeName}`.slice(0, 60);
            productFolderId = crypto.randomUUID();
            await db.execute(sql`INSERT INTO DriveFolders (id, name, parentId, createdBy) VALUES (${productFolderId}, ${folderName}, ${parentFolderId}, 'parser')`);
        } catch {}

        for (let i = 0; i < images.length; i++) {
            try {
                const ext = images[i].split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
                const filename = `${String(i + 1).padStart(2, '0')}.${ext}`;
                const filepath = path.join(destDir, filename);
                await this.downloadFile(images[i], filepath);
                localPaths.push(filepath);
                if (productFolderId) {
                    try {
                        const db = (this.repo as any).db;
                        const { sql } = require('drizzle-orm');
                        const fileId = crypto.randomUUID();
                        const fileSize = fs.statSync(filepath).size;
                        const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                        await db.execute(sql`INSERT INTO DriveFiles (id, name, storedName, mimeType, size, folderId, createdBy)
                            VALUES (${fileId}, ${filename}, ${filepath}, ${mimeType}, ${fileSize}, ${productFolderId}, 'parser')`);
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
                },
                agent: this.SSL_AGENT,
            };
            const req = (client as any).get(url, options, (res: any) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    this.fetchUrl(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
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
            const req = (client as any).get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, agent: this.SSL_AGENT }, (res: any) => {
                if (res.statusCode >= 400) { file.close(); fs.unlink(dest, () => {}); reject(new Error(`HTTP ${res.statusCode}`)); return; }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            });
            req.on('error', (err: any) => { file.close(); fs.unlink(dest, () => {}); reject(err); });
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('Download timeout')); });
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
