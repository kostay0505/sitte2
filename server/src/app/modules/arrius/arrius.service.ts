import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { ArriusRepository } from './arrius.repository';
import { DriveRepository } from '../drive/drive.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const WP_API_BASE_URL = 'https://arriuspro.com/wp-json/wp/v2/product?orderby=date&order=desc&per_page=100&_embed=true';
const UPLOADS_BASE = '/var/www/touring-test/server/uploads/фотографии';
const DRIVE_DIR = path.join(process.cwd(), '..', 'drive');

const MONTHS_RU = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function sanitizePath(str: string): string {
    return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100).trim();
}

function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
}

function fetchJson(requestUrl: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(requestUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0' }, timeout: 40000 },
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
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0' }, timeout: 40000 },
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

function extractJsonLd(html: string): any | null {
    const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        try {
            const obj = JSON.parse(m[1]);
            if (obj['@type'] === 'Product') return obj;
            if (Array.isArray(obj['@graph'])) {
                const p = obj['@graph'].find((g: any) => g['@type'] === 'Product');
                if (p) return p;
            }
        } catch { }
    }
    return null;
}

function extractImages(html: string, jsonLd: any, embedded: any): string[] {
    const images: string[] = [];

    // From WP embedded featured media
    if (embedded?.['wp:featuredmedia']?.[0]?.source_url) {
        images.push(embedded['wp:featuredmedia'][0].source_url);
    }

    // From JSON-LD
    if (jsonLd?.image) {
        const imgs = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
        for (const img of imgs) {
            const u = typeof img === 'string' ? img : img?.url;
            if (u && !images.includes(u)) images.push(u);
        }
    }

    // WooCommerce gallery
    const galleryRe = /woocommerce-product-gallery__image[\s\S]*?<img[^>]+src="([^"]+)"/gi;
    let gm: RegExpExecArray | null;
    while ((gm = galleryRe.exec(html)) !== null) {
        if (!images.includes(gm[1])) images.push(gm[1]);
    }

    // og:image fallback
    if (images.length === 0) {
        const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
        if (og) images.push(og[1]);
    }

    return images.slice(0, 20);
}

function extractPrice(jsonLd: any, html: string): string | null {
    if (jsonLd?.offers) {
        const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];
        const o = offers[0];
        if (o?.price) return `${o.price}${o.priceCurrency ? ' ' + o.priceCurrency : ''}`;
    }
    const pm = html.match(/class="[^"]*woocommerce-Price-amount[^"]*"[^>]*>[\s\S]*?<bdi>([\s\S]*?)<\/bdi>/i);
    if (pm) return decodeHtmlEntities(pm[1].replace(/<[^>]+>/g, '').trim());
    return null;
}

function extractDescription(jsonLd: any, html: string, excerpt: string): string {
    if (jsonLd?.description) return jsonLd.description;
    const dm = html.match(/<div[^>]+class="[^"]*woocommerce-product-details__short-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (dm) return dm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return excerpt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class ArriusService {
    private readonly logger = new Logger(ArriusService.name);

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repository: ArriusRepository,
        private readonly driveRepository: DriveRepository,
        @Inject(forwardRef(() => ParserNotificationService)) private readonly parserNotification: ParserNotificationService,
    ) { }

    @Cron('0 * * * *')
    async runParser(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('arrius'))) return;
        this.logger.log('Arrius parser: starting');
        try {
            await this.parseAndSave();
        } catch (e: any) {
            this.logger.error('Arrius parser error: ' + e.message);
        }
    }

    async parseAndSave(): Promise<{ added: number; errors: number }> {
        let added = 0;
        let errors = 0;
        const newItems: Array<{ title: string; url: string }> = [];
        try {
            // Paginate through all pages
            let page = 1;
            let allItems: any[] = [];
            while (true) {
                const data = await fetchJson(`${WP_API_BASE_URL}&page=${page}`);
                if (!Array.isArray(data) || data.length === 0) break;
                allItems = allItems.concat(data);
                if (data.length < 100) break; // last page
                page++;
            }

            this.logger.log(`Arrius: fetched ${allItems.length} products total`);

            // Collect all externalIds from the site
            const siteIds = allItems.map((item: any) => Number(item.id));

            // Mark products no longer on the site
            const notFoundCount = await this.repository.markNotFound(siteIds);
            if (notFoundCount > 0) this.logger.log(`Arrius: marked ${notFoundCount} products as not_found`);

            // Restore products that reappeared
            await this.repository.markAvailable(siteIds);

            for (const item of allItems) {
                try {
                    const externalId = Number(item.id);
                    const existing = await this.repository.findByExternalId(externalId);
                    if (existing) continue;

                    // Fetch product page HTML for details
                    let html = '';
                    let jsonLd: any = null;
                    try {
                        html = await fetchText(item.link);
                        jsonLd = extractJsonLd(html);
                    } catch (e: any) {
                        this.logger.debug(`Arrius: could not fetch page ${item.link}: ${e.message}`);
                    }

                    const embedded = item._embedded;
                    const images = extractImages(html, jsonLd, embedded);
                    const price = extractPrice(jsonLd, html);
                    const description = extractDescription(jsonLd, html, item.excerpt?.rendered ?? '');
                    const categories = (embedded?.['wp:term']?.[0] ?? [])
                        .map((t: any) => t.name)
                        .join(', ');
                    const title = decodeHtmlEntities(item.title?.rendered ?? 'Без названия');

                    await this.repository.create({
                        externalId,
                        url: item.link,
                        title,
                        description: description || null,
                        price: price || null,
                        images: images.length > 0 ? images : null,
                        categories: categories || null,
                        brand: null,
                        sku: null,
                        publishedAt: item.date
                            ? new Date(item.date).toISOString().slice(0, 19).replace('T', ' ')
                            : null,
                    });
                    added++;
                    newItems.push({ title, url: item.link });
                } catch (e: any) {
                    this.logger.warn(`Arrius: failed item ${item?.id}: ${e.message}`);
                    errors++;
                }
            }
        } catch (e: any) {
            this.logger.error('Arrius fetch error: ' + e.message);
            errors++;
        }

        this.logger.log(`Arrius parser done: +${added} new, ${errors} errors`);
        await this.parserNotification.notify('Arrius', 'arriuspro.com', newItems);
        return { added, errors };
    }

    async getList(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean) {
        return this.repository.findAll(status, page, limit, isNew, notInBase);
    }

    async getOne(id: string) {
        const product = await this.repository.findById(id);
        if (product?.isNew) this.repository.clearNew(id).catch(() => {});
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
                this.logger.warn(`Arrius download: failed ${imgUrl}: ${e.message}`);
            }
        }


        // Register downloaded photos in Drive
        let productFolderId: string | undefined;
        try {
            if (!fs.existsSync(DRIVE_DIR)) fs.mkdirSync(DRIVE_DIR, { recursive: true });
            const parserFolderId = await this.ensureFolder('Парсинг', null);
            const sourceFolderId = await this.ensureFolder('Arrius', parserFolderId);
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
                    this.logger.warn(`Arrius Drive register failed: ${e.message}`);
                }
            }
        } catch (e: any) {
            this.logger.warn(`Arrius Drive registration error: ${e.message}`);
        }

        await this.repository.setLocalImages(id, localPaths, productFolderId);
        return { success: true, count: localPaths.length, dir: destDir, driveId: productFolderId };
    }
}
