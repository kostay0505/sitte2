import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { AlvFranceRepository } from './alv-france.repository';
import { DriveRepository } from '../drive/drive.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://alvfrance.com/en';
const UPLOADS_BASE = '/var/www/touring-test/server/uploads/фотографии';
const DRIVE_DIR = path.join(process.cwd(), '..', 'drive');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MONTHS_RU = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function sanitizePath(str: string): string {
    return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100).trim();
}

function fetchHtml(reqUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(reqUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
                timeout: 20000,
            },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const next = res.headers.location.startsWith('http')
                        ? res.headers.location
                        : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
                    fetchHtml(next).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}`));
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
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': USER_AGENT }, timeout: 30000 },
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

function extractJsonLd(html: string, type: string): any | null {
    const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        try {
            const obj = JSON.parse(m[1]);
            if (obj['@type'] === type) return obj;
            if (Array.isArray(obj['@graph'])) {
                const found = obj['@graph'].find((g: any) => g['@type'] === type);
                if (found) return found;
            }
        } catch { }
    }
    return null;
}

// Extract category links from homepage nav
function extractCategoryUrls(html: string): string[] {
    const urls: string[] = [];
    // Match links like /en/3-speakers or /en/12-speakers
    const re = /href="(https:\/\/alvfrance\.com\/en\/\d+-[\w-]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const u = m[1];
        // Skip product pages (.html) and already-seen
        if (!u.endsWith('.html') && !urls.includes(u)) urls.push(u);
    }
    return urls;
}

// Extract product URLs from ItemList JSON-LD on category page
function extractProductUrls(html: string): string[] {
    const itemList = extractJsonLd(html, 'ItemList');
    if (!itemList?.itemListElement) return [];
    const elements = Array.isArray(itemList.itemListElement) ? itemList.itemListElement : [itemList.itemListElement];
    return elements
        .map((e: any) => e?.url || e?.item?.url)
        .filter((u: any) => typeof u === 'string' && u.endsWith('.html'));
}

function parseProductData(html: string, url: string): {
    title: string;
    description: string | null;
    price: string | null;
    currency: string | null;
    condition: string | null;
    brand: string | null;
    sku: string | null;
    availability: string | null;
    images: string[];
    categories: string | null;
} {
    const jsonLd = extractJsonLd(html, 'Product');

    const title = jsonLd?.name ?? url.split('/').pop()?.replace(/-/g, ' ').replace('.html', '') ?? 'Unknown';
    const description = jsonLd?.description ?? null;

    // Price: prefer excl. tax offer
    let price: string | null = null;
    let currency: string | null = null;
    if (jsonLd?.offers) {
        const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
        const offer = offers[0];
        if (offer?.price) {
            price = `${offer.price}`;
            currency = offer.priceCurrency ?? null;
        }
    }

    // Condition
    let condition: string | null = null;
    if (jsonLd?.offers) {
        const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
        const raw = offers[0]?.itemCondition ?? '';
        if (raw.includes('NewCondition')) condition = 'New';
        else if (raw.includes('UsedCondition')) condition = 'Used';
        else if (raw.includes('RefurbishedCondition')) condition = 'Refurbished';
        else if (raw) condition = raw.replace('https://schema.org/', '').replace('Condition', '');
    }

    const brand = typeof jsonLd?.brand === 'string' ? jsonLd.brand : (jsonLd?.brand?.name ?? null);
    const sku = jsonLd?.sku ?? jsonLd?.mpn ?? null;

    let availability: string | null = null;
    if (jsonLd?.offers) {
        const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
        const raw = offers[0]?.availability ?? '';
        if (raw.includes('InStock')) availability = 'In Stock';
        else if (raw.includes('OutOfStock')) availability = 'Out of Stock';
        else if (raw) availability = raw.replace('https://schema.org/', '');
    }

    // Images
    const images: string[] = [];
    if (jsonLd?.image) {
        const imgs = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
        for (const img of imgs) {
            const u = typeof img === 'string' ? img : img?.url;
            if (u && !images.includes(u)) images.push(u);
        }
    }
    // Fallback: og:image
    if (images.length === 0) {
        const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
        if (og) images.push(og[1]);
    }

    // Category from breadcrumb
    let categories: string | null = null;
    const breadcrumb = extractJsonLd(html, 'BreadcrumbList');
    if (breadcrumb?.itemListElement) {
        const crumbs = Array.isArray(breadcrumb.itemListElement) ? breadcrumb.itemListElement : [breadcrumb.itemListElement];
        const cats = crumbs
            .slice(1, -1) // skip Home and product itself
            .map((c: any) => c?.item?.name ?? c?.name)
            .filter(Boolean);
        if (cats.length > 0) categories = cats.join(' > ');
    }

    return { title, description, price, currency, condition, brand, sku, availability, images, categories };
}

// Delay helper to be polite to the server
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry with exponential backoff
async function fetchWithRetry(url: string, retries = 3): Promise<string> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fetchHtml(url);
        } catch (e) {
            if (i === retries - 1) throw e;
            await delay(1000 * Math.pow(2, i)); // 1s, 2s, 4s
        }
    }
    throw new Error('unreachable');
}

@Injectable()
export class AlvFranceService {
    private readonly logger = new Logger(AlvFranceService.name);

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repository: AlvFranceRepository,
        private readonly driveRepository: DriveRepository,
        @Inject(forwardRef(() => ParserNotificationService)) private readonly parserNotification: ParserNotificationService,
    ) { }

    @Cron('30 * * * *') // every hour at :30 (offset from Arrius)
    async runParser(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('alv-france'))) return;
        this.logger.log('ALV France parser: starting');
        try {
            await this.parseAndSave();
        } catch (e: any) {
            this.logger.error('ALV France parser error: ' + e.message);
        }
    }

    async parseAndSave(): Promise<{ added: number; errors: number }> {
        let added = 0;
        let errors = 0;
        const allFoundUrls: string[] = [];
        const newItems: Array<{ title: string; url: string }> = [];

        try {
            // Step 1: Discover category URLs from homepage
            const homeHtml = await fetchWithRetry(`${BASE_URL}/`);
            const categoryUrls = extractCategoryUrls(homeHtml);
            this.logger.log(`ALV France: found ${categoryUrls.length} category URLs`);

            // Step 2: For each category, paginate and collect product URLs
            const productUrls: string[] = [];
            for (const catUrl of categoryUrls) {
                let page = 1;
                while (true) {
                    try {
                        const pageUrl = page === 1 ? catUrl : `${catUrl}?page=${page}`;
                        const html = await fetchHtml(pageUrl);
                        const urls = extractProductUrls(html);
                        if (urls.length === 0) break;
                        for (const u of urls) {
                            if (!productUrls.includes(u)) productUrls.push(u);
                        }
                        if (urls.length < 12) break; // last page
                        page++;
                        await delay(300);
                    } catch {
                        break;
                    }
                }
                await delay(200);
            }

            this.logger.log(`ALV France: found ${productUrls.length} product URLs total`);
            allFoundUrls.push(...productUrls);

            // Step 3: Mark not-found products
            const notFoundCount = await this.repository.markNotFound(allFoundUrls);
            if (notFoundCount > 0) this.logger.log(`ALV France: marked ${notFoundCount} as not_found`);
            await this.repository.markAvailable(allFoundUrls);

            // Step 4: Fetch and save new products
            for (const productUrl of productUrls) {
                try {
                    const existing = await this.repository.findByExternalId(productUrl);
                    if (existing) continue;

                    const html = await fetchWithRetry(productUrl);
                    const data = parseProductData(html, productUrl);

                    await this.repository.create({
                        externalId: productUrl,
                        url: productUrl,
                        ...data,
                    });
                    added++;
                    newItems.push({ title: data.title, url: productUrl });
                    await delay(400);
                } catch (e: any) {
                    this.logger.warn(`ALV France: failed ${productUrl}: ${e.message}`);
                    errors++;
                }
            }
        } catch (e: any) {
            this.logger.error('ALV France parse error: ' + e.message);
            errors++;
        }

        this.logger.log(`ALV France parser done: +${added} new, ${errors} errors`);
        await this.parserNotification.notify('ALV France', 'alvfrance.com', newItems);
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
        if (!product.images || product.images.length === 0) return { success: true, count: 0, dir: '' };

        const now = new Date();
        const monthDir = `${MONTHS_RU[now.getMonth()]} ${now.getFullYear()}`;
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const dirName = `${dd}.${mm}.${yyyy} ${sanitizePath(product.title)}`;
        const destDir = path.join(UPLOADS_BASE, sanitizePath(monthDir), dirName);

        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const localPaths: string[] = [];
        for (let i = 0; i < product.images.length; i++) {
            const imgUrl = product.images[i];
            try {
                const ext = (path.extname(new URL(imgUrl).pathname) || '.jpg').toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 5);
                const filename = `${String(i + 1).padStart(2, '0')}${ext || '.jpg'}`;
                await downloadFile(imgUrl, path.join(destDir, filename));
                localPaths.push(path.join(destDir, filename));
            } catch (e: any) {
                this.logger.warn(`ALV France download: ${imgUrl}: ${e.message}`);
            }
        }


        // Register downloaded photos in Drive
        let productFolderId: string | undefined;
        try {
            if (!fs.existsSync(DRIVE_DIR)) fs.mkdirSync(DRIVE_DIR, { recursive: true });
            const parserFolderId = await this.ensureFolder('Парсинг', null);
            const sourceFolderId = await this.ensureFolder('ALV France', parserFolderId);
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
                    this.logger.warn(`ALV France Drive register failed: ${e.message}`);
                }
            }
        } catch (e: any) {
            this.logger.warn(`ALV France Drive registration error: ${e.message}`);
        }

        await this.repository.setLocalImages(id, localPaths, productFolderId);
        return { success: true, count: localPaths.length, dir: destDir, driveId: productFolderId };
    }
}
