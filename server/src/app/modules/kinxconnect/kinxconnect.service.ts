import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { KinxConnectRepository } from './kinxconnect.repository';
import { DriveRepository } from '../drive/drive.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const LISTINGS_API = 'https://xxit-c7ua-1ycf.g7.xano.io/api:ks_htiPr/public/listings';
const LISTING_API  = 'https://xxit-c7ua-1ycf.g7.xano.io/api:ks_htiPr/public/listing';
const CLOUDINARY   = 'https://res.cloudinary.com/dbzycobrw/image/upload';
const SITE_BASE    = 'https://connect.kinxsound.com';
const KINXSOUND_USER_ID = 74; // Exclude Kinxsound's own listings
const UPLOADS_BASE = '/var/www/touring-test/server/uploads/фотографии';
const DRIVE_DIR    = path.join(process.cwd(), '..', 'drive');

const CATEGORY_MAP: Record<number, string> = {
    1: 'Undefined',
    2: 'Audio',
    3: 'Video',
    4: 'Light',
    5: 'Rigging',
    6: 'Stages',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
    EUR: '€', USD: '$', GBP: '£', CHF: 'CHF ', SEK: 'SEK ', NOK: 'NOK ', DKK: 'DKK ',
};

const MONTHS_RU = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function sanitizePath(str: string): string {
    return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100).trim();
}

function cloudinaryUrl(publicId: string): string {
    return `${CLOUDINARY}/t_kxsc_default/${publicId}.webp`;
}

function formatPrice(price: number, currency: string): string {
    const sym = CURRENCY_SYMBOLS[currency] ?? (currency + ' ');
    return `${sym}${price.toLocaleString('de-DE')}`;
}

function fetchJson(requestUrl: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(requestUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0', 'Accept': 'application/json' }, timeout: 30000 },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    fetchJson(res.headers.location).then(resolve).catch(reject); return;
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

function downloadFile(fileUrl: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(fileUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0' }, timeout: 45000 },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    downloadFile(res.headers.location, destPath).then(resolve).catch(reject); return;
                }
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
                file.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
            },
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/** Fetch all listing pages from the API, skip Kinxsound's own listings. */
async function fetchAllListings(logger: Logger): Promise<any[]> {
    const all: any[] = [];
    let page = 1;
    while (true) {
        const url = `${LISTINGS_API}?per_page=100&current_page=${page}&sort_by=created_at&order_by=desc`;
        const data = await fetchJson(url);
        const items: any[] = data.items ?? data;
        if (!Array.isArray(items) || items.length === 0) break;
        all.push(...items);
        logger.debug(`KinxConnect: page ${page}, got ${items.length}, total so far ${all.length}`);
        if (!data.nextPage) break;
        page++;
        await sleep(300);
    }
    // Exclude Kinxsound's own listings
    return all.filter((item: any) => Number(item.user_id) !== KINXSOUND_USER_ID);
}

/** Extract image URLs from detail listing object. */
function extractImages(detail: any): string[] {
    const images: string[] = [];
    const list: any[] = detail._images ?? [];
    for (const img of list) {
        if (img.public_id) images.push(cloudinaryUrl(img.public_id));
    }
    // Fallback to primary if no _images
    if (images.length === 0 && detail._primary_image?.public_id) {
        images.push(cloudinaryUrl(detail._primary_image.public_id));
    }
    return images;
}

@Injectable()
export class KinxConnectService {
    private readonly logger = new Logger(KinxConnectService.name);

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repository: KinxConnectRepository,
        private readonly driveRepository: DriveRepository,
        @Inject(forwardRef(() => ParserNotificationService)) private readonly parserNotification: ParserNotificationService,
    ) { }

    @Cron('0 */3 * * *')
    async runParser(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('kinxconnect'))) return;
        this.logger.log('KinxConnect parser: starting');
        try {
            await this.parseAndSave();
        } catch (e: any) {
            this.logger.error('KinxConnect parser error: ' + e.message);
        }
    }

    async parseAndSave(): Promise<{ added: number; errors: number }> {
        let added = 0;
        let errors = 0;
        const newItems: Array<{ title: string; url: string }> = [];

        try {
            const allItems = await fetchAllListings(this.logger);
            this.logger.log(`KinxConnect: ${allItems.length} listings (non-Kinxsound)`);

            const siteIds = allItems.map((i: any) => Number(i.id));
            const notFoundCount = await this.repository.markNotFound(siteIds);
            if (notFoundCount > 0) this.logger.log(`KinxConnect: ${notFoundCount} marked as not_found`);
            await this.repository.markAvailable(siteIds);

            for (const item of allItems) {
                try {
                    const externalId = Number(item.id);
                    const existing = await this.repository.findByExternalId(externalId);
                    if (existing) continue;

                    // Fetch detail for full image list
                    let images: string[] = [];
                    try {
                        const detail = await fetchJson(`${LISTING_API}/${externalId}`);
                        images = extractImages(detail);
                    } catch (e: any) {
                        // Fallback: use primary image from list
                        if (item._primary_image?.public_id) {
                            images = [cloudinaryUrl(item._primary_image.public_id)];
                        }
                        this.logger.debug(`KinxConnect: detail fetch failed for ${externalId}: ${e.message}`);
                    }

                    const currency = item._user?.currency ?? 'EUR';
                    const priceRaw = item.price != null ? Number(item.price) : null;
                    const price = priceRaw != null ? formatPrice(priceRaw, currency) : null;
                    const categoryId = item.category_id != null ? Number(item.category_id) : null;

                    // publishedAt from Unix ms timestamp
                    let publishedAt: string | null = null;
                    if (item.created_at) {
                        publishedAt = new Date(Number(item.created_at)).toISOString().slice(0, 19).replace('T', ' ');
                    }

                    await this.repository.create({
                        externalId,
                        url: `${SITE_BASE}/listing?id=${externalId}`,
                        title: String(item.title ?? '').trim() || 'Без названия',
                        description: item.description ? String(item.description).trim() : null,
                        price,
                        priceRaw,
                        currency,
                        images: images.length > 0 ? images : null,
                        categoryId,
                        category: categoryId ? (CATEGORY_MAP[categoryId] ?? null) : null,
                        conditionId: item.condition_id != null ? Number(item.condition_id) : null,
                        sellerId: Number(item.user_id),
                        sellerName: item._user?.company_name ?? null,
                        sellerCountry: item._user?._country?.iso2 ?? null,
                        publishedAt,
                    });
                    added++;
                    newItems.push({ title: String(item.title ?? '').trim() || 'Без названия', url: `${SITE_BASE}/listing?id=${externalId}` });

                    await sleep(500);
                } catch (e: any) {
                    this.logger.warn(`KinxConnect: failed item ${item?.id}: ${e.message}`);
                    errors++;
                }
            }
        } catch (e: any) {
            this.logger.error('KinxConnect fetch error: ' + e.message);
            errors++;
        }

        this.logger.log(`KinxConnect done: +${added} new, ${errors} errors`);
        await this.parserNotification.notify('KinxConnect', 'connect.kinxsound.com', newItems);
        return { added, errors };
    }

    async getList(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean) {
        return this.repository.findAll(status, page, limit, isNew, notInBase);
    }

    async getOne(id: string) {
        const item = await this.repository.findById(id);
        if (item?.isNew) this.repository.clearNew(id).catch(() => {});
        return item;
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
        const listing = await this.repository.findById(id);
        if (!listing) throw new NotFoundException('Listing not found');
        if (!listing.images || listing.images.length === 0) {
            return { success: true, count: 0, dir: '' };
        }

        const now = new Date();
        const monthDir = `${MONTHS_RU[now.getMonth()]} ${now.getFullYear()}`;
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const dirName = `${dd}.${mm}.${yyyy} ${sanitizePath(listing.title)}`;
        const destDir = path.join(UPLOADS_BASE, sanitizePath(monthDir), dirName);

        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const localPaths: string[] = [];
        for (let i = 0; i < listing.images.length; i++) {
            const imgUrl = listing.images[i];
            try {
                // Cloudinary returns .webp — save as such
                const filename = `${String(i + 1).padStart(2, '0')}.webp`;
                const destPath = path.join(destDir, filename);
                await downloadFile(imgUrl, destPath);
                localPaths.push(destPath);
            } catch (e: any) {
                this.logger.warn(`KinxConnect download: failed ${imgUrl}: ${e.message}`);
            }
        }

        let productFolderId: string | undefined;
        try {
            if (!fs.existsSync(DRIVE_DIR)) fs.mkdirSync(DRIVE_DIR, { recursive: true });
            const parserFolderId = await this.ensureFolder('Парсинг', null);
            const sourceFolderId = await this.ensureFolder('KinxConnect', parserFolderId);
            productFolderId = await this.ensureFolder(sanitizePath(listing.title), sourceFolderId);
            for (const localPath of localPaths) {
                try {
                    const ext = path.extname(localPath).toLowerCase();
                    const uuid = crypto.randomUUID();
                    const storedName = `${uuid}${ext || '.webp'}`;
                    const drivePath = path.join(DRIVE_DIR, storedName);
                    fs.copyFileSync(localPath, drivePath);
                    const stats = fs.statSync(drivePath);
                    await this.driveRepository.createFile({
                        id: uuid,
                        name: path.basename(localPath),
                        storedName,
                        mimeType: 'image/webp',
                        size: stats.size,
                        folderId: productFolderId,
                        createdBy: 'parser',
                    });
                } catch (e: any) {
                    this.logger.warn(`KinxConnect Drive register failed: ${e.message}`);
                }
            }
        } catch (e: any) {
            this.logger.warn(`KinxConnect Drive error: ${e.message}`);
        }

        await this.repository.setLocalImages(id, localPaths, productFolderId);
        return { success: true, count: localPaths.length, dir: destDir, driveId: productFolderId };
    }
}
