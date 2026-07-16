import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ParserSettingsService } from '../parser-settings/parser-settings.service';
import { Cron } from '@nestjs/schedule';
import { UsedfullRepository } from './usedfull.repository';
import { DriveRepository } from '../drive/drive.repository';
import { ParserNotificationService } from '../telegram/parser-notification.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const USER_PAGE_URL = 'https://used-stage-equipment.com/?modul=ads&site=userads&userid=3756';
const SITE_BASE = 'https://used-stage-equipment.com';
const UPLOADS_BASE = '/var/www/touring-test/server/uploads/фотографии';

const MONTHS_RU = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function sanitizePath(str: string): string {
    return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100).trim();
}

function fetchText(requestUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(requestUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 TEM-Bot/1.0' },
                timeout: 30000,
            },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    fetchText(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
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
            {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0' },
                timeout: 45000,
            },
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

function parseListingPage(html: string): Array<{ externalId: string; slug: string; title: string; price: string | null; thumbImage: string | null }> {
    const results: Array<{ externalId: string; slug: string; title: string; price: string | null; thumbImage: string | null }> = [];

    const linkRe = /<a\s+href=['"]ad-(\d+)-([^'"]+)['"]\s+class=['"]hdl_link['"][^>]*>([^<]+)<\/a>/gi;
    let m: RegExpExecArray | null;

    while ((m = linkRe.exec(html)) !== null) {
        const externalId = m[1];
        const slug = m[2].trim();
        const title = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim();

        const priceSearchArea = html.slice(m.index, m.index + 800);
        const priceM = priceSearchArea.match(/class=['"]index-item-price(?:-pro)?['"][^>]*>([^<]+)</i);
        const price = priceM ? priceM[1]
            .replace(/&euro;/gi, '€').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#039;/gi, "'").replace(/&quot;/gi, '"')
            .replace(/\s+/g, ' ').trim() : null;

        const imgSearchArea = html.slice(Math.max(0, m.index - 200), m.index + 800);
        const imgM = imgSearchArea.match(/class=['"]product-image['"]\s+src=['"]([^'"]+thumbnail[^'"]+)['"]/i)
            || imgSearchArea.match(/src=['"]([^'"]+cdn\.g-vt\.de[^'"]+)['"]/i);
        const thumbImage = imgM ? imgM[1] : null;

        results.push({ externalId, slug, title, price, thumbImage });
    }

    return results;
}

function thumbToOriginal(thumbUrl: string): string {
    return thumbUrl.replace(/thumbnail%2F/i, '').replace(/thumbnail\//i, '');
}

function parseDetailPage(html: string, fallbackThumb: string | null): { images: string[]; category: string | null; publishedAt: string | null; description: string | null } {
    const images: string[] = [];

    const galleryAnchorRe = /<a[^>]+href=['"]([^'"]*cdn\.g-vt\.de\/use\/(?!thumbnail)[^'"]+)['"]/gi;
    let m: RegExpExecArray | null;
    while ((m = galleryAnchorRe.exec(html)) !== null) {
        const url = m[1];
        if (!images.includes(url)) images.push(url);
    }

    if (images.length === 0) {
        const imgRe = /<img[^>]+src=['"]([^'"]*cdn\.g-vt\.de\/use\/(?!thumbnail)[^'"]+)['"]/gi;
        while ((m = imgRe.exec(html)) !== null) {
            const url = m[1];
            if (!images.includes(url)) images.push(url);
        }
    }

    if (images.length === 0 && fallbackThumb) {
        const original = thumbToOriginal(fallbackThumb);
        images.push(original);
    }

    let category: string | null = null;
    const breadcrumbM = html.match(/class=['"][^'"]*breadcrumb[^'"]*['"][^>]*>([\s\S]{0,600})/i);
    if (breadcrumbM) {
        const bcHtml = breadcrumbM[1];
        const links = [...bcHtml.matchAll(/<a[^>]+>([^<]+)<\/a>/gi)];
        if (links.length >= 2) {
            category = links[links.length - 1][1].replace(/&amp;/g, '&').trim();
        }
    }

    let publishedAt: string | null = null;
    const dateM = html.match(/[Cc]reated\s*[Oo]n\s*:?\s*(\d{2})\.(\d{2})\.(\d{4})/);
    if (dateM) {
        publishedAt = `${dateM[3]}-${dateM[2]}-${dateM[1]} 00:00:00`;
    } else {
        const dateM2 = html.match(/[Ee]ingestellt\s+am\s+(\d{2})\.(\d{2})\.(\d{4})/);
        if (dateM2) {
            publishedAt = `${dateM2[3]}-${dateM2[2]}-${dateM2[1]} 00:00:00`;
        }
    }

    let description: string | null = null;
    const descM = html.match(/<div[^>]+class=['"][^'"]*ad-description[^'"]*['"][^>]*>([\s\S]{0,3000}?)<\/div>/i)
        || html.match(/<div[^>]+id=['"]description['"'][^>]*>([\s\S]{0,3000}?)<\/div>/i);
    if (descM) {
        description = descM[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#039;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000) || null;
    }

    return { images: images.slice(0, 30), category, publishedAt, description };
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

@Injectable()
export class UsedfullService {
    private readonly logger = new Logger(UsedfullService.name);

    constructor(
        private readonly parserSettings: ParserSettingsService,
        private readonly repository: UsedfullRepository,
        private readonly driveRepository: DriveRepository,
        @Inject(forwardRef(() => ParserNotificationService)) private readonly parserNotification: ParserNotificationService,
    ) { }

    @Cron('0 */4 * * *')
    async runParser(): Promise<void> {
        if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') return;
        if (!(await this.parserSettings.isEnabled('usedfull'))) return;
        this.logger.log('Usedfull parser: starting');
        try {
            await this.parseAndSave();
        } catch (e: any) {
            this.logger.error('Usedfull parser error: ' + e.message);
        }
    }

    async parseAndSave(): Promise<{ added: number; errors: number }> {
        let added = 0;
        let errors = 0;
        const newItems: Array<{ title: string; url: string }> = [];

        try {
            const html = await fetchText(USER_PAGE_URL);
            const listings = parseListingPage(html);

            this.logger.log(`Usedfull: found ${listings.length} listings on user page`);

            const siteIds = listings.map(l => l.externalId);

            const notFoundCount = await this.repository.markNotFound(siteIds);
            if (notFoundCount > 0) this.logger.log(`Usedfull: marked ${notFoundCount} as not_found`);

            await this.repository.markAvailable(siteIds);

            for (const listing of listings) {
                try {
                    const existing = await this.repository.findByExternalId(listing.externalId);
                    if (existing) continue;

                    const url = `${SITE_BASE}/ad-${listing.externalId}-${listing.slug}`;

                    let images: string[] = [];
                    let category: string | null = null;
                    let publishedAt: string | null = null;
                    let description: string | null = null;

                    try {
                        const detailHtml = await fetchText(url);
                        const detail = parseDetailPage(detailHtml, listing.thumbImage);
                        images = detail.images;
                        category = detail.category;
                        publishedAt = detail.publishedAt;
                        description = detail.description;
                    } catch (e: any) {
                        this.logger.debug(`Usedfull: could not fetch detail ${url}: ${e.message}`);
                        if (listing.thumbImage) {
                            images = [thumbToOriginal(listing.thumbImage)];
                        }
                    }

                    await this.repository.create({
                        externalId: listing.externalId,
                        url,
                        title: listing.title,
                        description,
                        price: listing.price,
                        category,
                        images: images.length > 0 ? images : null,
                        publishedAt,
                    });
                    added++;
                    newItems.push({ title: listing.title, url });

                    await sleep(600);
                } catch (e: any) {
                    this.logger.warn(`Usedfull: failed item ${listing?.externalId}: ${e.message}`);
                    errors++;
                }
            }
        } catch (e: any) {
            this.logger.error('Usedfull fetch error: ' + e.message);
            errors++;
        }

        this.logger.log(`Usedfull parser done: +${added} new, ${errors} errors`);
        await this.parserNotification.notify('Usedfull', 'used-stage-equipment.com', newItems);
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
                this.logger.warn(`Usedfull download: failed ${imgUrl}: ${e.message}`);
            }
        }

        let productFolderId: string | undefined;
        try {
            const driveDir = path.join(process.cwd(), '..', 'drive');
            if (!fs.existsSync(driveDir)) fs.mkdirSync(driveDir, { recursive: true });
            const parserFolderId = await this.ensureFolder('Парсинг', null);
            const sourceFolderId = await this.ensureFolder('Usedfull', parserFolderId);
            productFolderId = await this.ensureFolder(sanitizePath(product.title), sourceFolderId);
            for (const localPath of localPaths) {
                try {
                    const ext = path.extname(localPath).toLowerCase();
                    const uuid = crypto.randomUUID();
                    const storedName = `${uuid}${ext || '.jpg'}`;
                    const drivePath = path.join(driveDir, storedName);
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
                    this.logger.warn(`Usedfull Drive register failed: ${e.message}`);
                }
            }
        } catch (e: any) {
            this.logger.warn(`Usedfull Drive registration error: ${e.message}`);
        }

        await this.repository.setLocalImages(id, localPaths, productFolderId);
        return { success: true, count: localPaths.length, dir: destDir, driveId: productFolderId };
    }
}
