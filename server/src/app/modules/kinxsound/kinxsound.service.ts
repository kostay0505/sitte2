import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { KinxsoundRepository } from './kinxsound.repository';
import { DriveRepository } from '../drive/drive.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'https://shop.kinxsound.com/api/products';
const SITE_BASE = 'https://shop.kinxsound.com';
const UPLOADS_BASE = '/var/www/touring-test/server/uploads/фотографии';
const DRIVE_DIR = path.join(process.cwd(), '..', 'drive');

const CATEGORY_MAP: Record<number, string> = {
    1: 'speakers',
    2: 'amplifiers',
    3: 'complete-systems',
    4: 'other',
    5: 'mixers',
};

const MONTHS_RU = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function sanitizePath(str: string): string {
    return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100).trim();
}

/** Format integer price from API: 1399 → "€1.399" */
function formatPrice(priceEur: number): string {
    return '€' + priceEur.toLocaleString('de-DE');
}

function fetchJson(requestUrl: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(requestUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0', 'Accept': 'application/json' }, timeout: 30000 },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    fetchJson(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { reject(new Error('JSON parse error')); }
                });
            },
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function fetchText(requestUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(requestUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0' }, timeout: 30000 },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    fetchText(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve(data));
            },
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function downloadFile(fileUrl: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(fileUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0' }, timeout: 45000 },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
                    return;
                }
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
                file.on('error', err => { fs.unlink(destPath, () => { }); reject(err); });
            },
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

/**
 * Extract original-size image URLs from Kinxsound product page HTML.
 * Gallery anchors have href pointing to full-size images in /storage/.
 * Thumbnails are inside img tags (conversions/).
 */
function extractImages(html: string): string[] {
    const images: string[] = [];

    // Primary: extract hrefs from gallery anchor tags pointing to /storage/
    // Kinxsound uses lightGallery — anchors wrap thumbnails and href = original
    const anchorRe = /<a[^>]+href="(https?:\/\/shop\.kinxsound\.com\/storage\/[^"]+)"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html)) !== null) {
        const href = m[1];
        // Skip thumbnails that may appear as hrefs (should be originals, but double-check)
        if (!href.includes('/conversions/') && !images.includes(href)) {
            images.push(href);
        }
    }

    // Fallback: if no anchors found, try img src for non-thumbnail storage images
    if (images.length === 0) {
        const imgRe = /<img[^>]+src="(https?:\/\/shop\.kinxsound\.com\/storage\/[^"]+)"[^>]*/gi;
        while ((m = imgRe.exec(html)) !== null) {
            const src = m[1];
            // Convert thumbnail to original: /conversions/NAME-thumb.jpg → /NAME.jpeg
            const original = src.replace(/\/conversions\/(.+?)-thumb\.(jpg|jpeg|png|webp)$/i, '/$1.jpeg');
            if (!images.includes(original)) images.push(original);
        }
    }

    return images.slice(0, 30);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

@Injectable()
export class KinxsoundService {
    private readonly logger = new Logger(KinxsoundService.name);

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repository: KinxsoundRepository,
        private readonly driveRepository: DriveRepository,
        @Inject(forwardRef(() => ParserNotificationService)) private readonly parserNotification: ParserNotificationService,
    ) { }

    @Cron('0 */2 * * *')
    async runParser(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('kinxsound'))) return;
        this.logger.log('Kinxsound parser: starting');
        try {
            await this.parseAndSave();
        } catch (e: any) {
            this.logger.error('Kinxsound parser error: ' + e.message);
        }
    }

    async parseAndSave(): Promise<{ added: number; errors: number }> {
        let added = 0;
        let errors = 0;
        const newItems: Array<{ title: string; url: string }> = [];

        try {
            // One request gets all products
            const allItems: any[] = await fetchJson(API_URL);
            if (!Array.isArray(allItems)) throw new Error('API did not return array');

            this.logger.log(`Kinxsound: fetched ${allItems.length} products`);

            // Track which external IDs are on the site
            const siteIds = allItems.filter(i => i.is_active).map((i: any) => Number(i.id));

            const notFoundCount = await this.repository.markNotFound(siteIds);
            if (notFoundCount > 0) this.logger.log(`Kinxsound: marked ${notFoundCount} as not_found`);

            await this.repository.markAvailable(siteIds);

            for (const item of allItems) {
                if (!item.is_active) continue;

                try {
                    const externalId = Number(item.id);
                    const existing = await this.repository.findByExternalId(externalId);
                    if (existing) continue;

                    const categorySlug = CATEGORY_MAP[item.category_id] ?? 'other';
                    const productUrl = `${SITE_BASE}/shop/${categorySlug}/${externalId}`;

                    // Fetch product page for images
                    let images: string[] = [];
                    try {
                        const html = await fetchText(productUrl);
                        images = extractImages(html);
                    } catch (e: any) {
                        this.logger.debug(`Kinxsound: could not fetch page ${productUrl}: ${e.message}`);
                    }

                    const priceEur = item.price != null ? Number(item.price) : null;
                    const price = priceEur != null ? formatPrice(priceEur) : null;

                    await this.repository.create({
                        externalId,
                        url: productUrl,
                        title: String(item.name ?? '').trim() || 'Без названия',
                        description: item.description ? String(item.description).trim() : null,
                        price,
                        priceEur,
                        unit: item.unit ? String(item.unit) : null,
                        condition: item.condition != null ? Number(item.condition) : null,
                        images: images.length > 0 ? images : null,
                        category: categorySlug,
                        publishedAt: item.created_at
                            ? new Date(item.created_at).toISOString().slice(0, 19).replace('T', ' ')
                            : null,
                    });
                    added++;
                    newItems.push({ title: String(item.name ?? '').trim() || 'Без названия', url: productUrl });

                    // Polite delay between HTML page requests
                    await sleep(800);
                } catch (e: any) {
                    this.logger.warn(`Kinxsound: failed item ${item?.id}: ${e.message}`);
                    errors++;
                }
            }
        } catch (e: any) {
            this.logger.error('Kinxsound fetch error: ' + e.message);
            errors++;
        }

        this.logger.log(`Kinxsound parser done: +${added} new, ${errors} errors`);
        await this.parserNotification.notify('KinxSound', 'shop.kinxsound.com', newItems);
        return { added, errors };
    }

    async getList(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean) {
        return this.repository.findAll(status, page, limit, isNew, notInBase);
    }

    async getOne(id: string) {
        const product = await this.repository.findById(id);
        if (product?.isNew) this.repository.clearNew(id).catch(() => { });
        return product;
    }

    async archive(id: string) {
        await this.repository.setStatus(id, 'archived');
        return { success: true };
    }

    async unarchive(id: string) {
        await this.repository.setStatus(id, 'active');
        return { success: true };
    }

    async blacklist(id: string) {
        await this.repository.setStatus(id, 'blacklisted');
        return { success: true };
    }

    private async ensureFolder(name: string, parentId: string | null): Promise<string> {
        const folders = await this.driveRepository.getFolders(parentId);
        const existing = (folders as any[]).find((f: any) => f.name === name);
        if (existing) return existing.id;
        const id = crypto.randomUUID();
        await this.driveRepository.createFolder({ id, name, parentId: parentId || undefined, createdBy: 'parser' });
        return id;
    }

    async downloadPhotos(id: string): Promise<{ success: boolean; count: number; dir: string; driveId?: string }> {
        const product = await this.repository.findById(id);
        if (!product) throw new NotFoundException('Product not found');
        if (!product.images || product.images.length === 0) {
            return { success: true, count: 0, dir: '' };
        }

        const now = new Date();
        const monthDir = `${MONTHS_RU[now.getMonth()]} ${now.getFullYear()}`;
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const dirName = `${dd}.${mm}.${yyyy} ${sanitizePath(product.title)}`;
        const destDir = path.join(UPLOADS_BASE, sanitizePath(monthDir), dirName);

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        const localPaths: string[] = [];
        for (let i = 0; i < product.images.length; i++) {
            const imgUrl = product.images[i];
            try {
                const ext = (path.extname(new URL(imgUrl).pathname) || '.jpg')
                    .toLowerCase()
                    .replace(/[^a-z0-9.]/g, '')
                    .slice(0, 5);
                const filename = `${String(i + 1).padStart(2, '0')}${ext || '.jpg'}`;
                const destPath = path.join(destDir, filename);
                await downloadFile(imgUrl, destPath);
                localPaths.push(destPath);
            } catch (e: any) {
                this.logger.warn(`Kinxsound download: failed ${imgUrl}: ${e.message}`);
            }
        }

        // Register in Drive
        let productFolderId: string | undefined;
        try {
            if (!fs.existsSync(DRIVE_DIR)) fs.mkdirSync(DRIVE_DIR, { recursive: true });
            const parserFolderId = await this.ensureFolder('Парсинг', null);
            const sourceFolderId = await this.ensureFolder('Kinxsound', parserFolderId);
            productFolderId = await this.ensureFolder(sanitizePath(product.title), sourceFolderId);
            for (const localPath of localPaths) {
                try {
                    const ext = path.extname(localPath).toLowerCase();
                    const uuid = crypto.randomUUID();
                    const storedName = `${uuid}${ext || '.jpg'}`;
                    const drivePath = path.join(DRIVE_DIR, storedName);
                    fs.copyFileSync(localPath, drivePath);
                    const stats = fs.statSync(drivePath);
                    const mimeType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
                    await this.driveRepository.createFile({
                        id: uuid,
                        name: path.basename(localPath),
                        storedName,
                        mimeType,
                        size: stats.size,
                        folderId: productFolderId,
                        createdBy: 'parser',
                    });
                } catch (e: any) {
                    this.logger.warn(`Kinxsound Drive register failed: ${e.message}`);
                }
            }
        } catch (e: any) {
            this.logger.warn(`Kinxsound Drive registration error: ${e.message}`);
        }

        await this.repository.setLocalImages(id, localPaths, productFolderId);
        return { success: true, count: localPaths.length, dir: destDir, driveId: productFolderId };
    }
}
