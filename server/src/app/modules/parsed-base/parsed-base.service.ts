import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ParsedBaseRepository, UpdateBaseItemDto, BulkUpdateDto } from './parsed-base.repository';
import { GoogleSheetsService } from './google-sheets.service';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const UPLOADS_BASE = '/var/www/touring-test/server/uploads';

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = (lib as typeof https).get(
            { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0' }, timeout: 20000 },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                    return;
                }
                if (!res.statusCode || res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(() => resolve()));
                file.on('error', reject);
            },
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function sanitize(str: string): string {
    return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80).trim();
}

function ext(url: string): string {
    const m = url.split('?')[0].match(/\.(\w{2,5})$/);
    return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

@Injectable()
export class ParsedBaseService {
    private static readonly bulkJobs = new Map<string, { total: number; done: number; failed: number }>();

    constructor(
        private readonly repo: ParsedBaseRepository,
        private readonly sheets: GoogleSheetsService,
    ) { }

    async getList(page: number, limit: number, source?: string, search?: string, filled?: string) {
        return this.repo.findAll(page, limit, source, search, filled);
    }

    async addFromParser(source: string, sourceId: string) {
        return this.repo.addFromParser(source, sourceId);
    }

    async update(id: string, data: UpdateBaseItemDto) {
        const item = await this.repo.findById(id);
        if (!item) throw new NotFoundException('Base item not found');
        return this.repo.update(id, data);
    }

    async downloadPhotos(id: string) {
        const item = await this.repo.findById(id);
        if (!item) throw new NotFoundException('Base item not found');
        if (!item.images || item.images.length === 0) {
            return { success: false, count: 0, message: 'Нет изображений' };
        }

        const localImages: string[] = [];
        let count = 0;
        for (let i = 0; i < Math.min(item.images.length, 20); i++) {
            try {
                const filename = `${item.sku}-${String(i + 1).padStart(2, '0')}${ext(item.images[i])}`;
                const dest = path.join(UPLOADS_BASE, filename);
                await downloadFile(item.images[i], dest);
                localImages.push(filename);
                count++;
            } catch { /* skip failed */ }
        }

        await this.repo.setLocalImages(id, localImages);
        return { success: true, count };
    }

    async publish(id: string, adminUserId: string): Promise<{ productId: string; alreadyExists: boolean }> {
        const item = await this.repo.findById(id);
        if (!item) throw new NotFoundException('Base item not found');

        if (item.productId) {
            return { productId: item.productId, alreadyExists: true };
        }

        if (!item.brandId) {
            throw new BadRequestException('Необходимо выбрать бренд перед публикацией');
        }
        if (!item.categoryId) {
            throw new BadRequestException('Необходимо выбрать категорию перед публикацией');
        }
        if (!item.localImages || item.localImages.length === 0) {
            throw new BadRequestException('Необходимо скачать фотографии перед публикацией');
        }

        const productId = await this.repo.createProduct({
            sku: item.sku,
            adminUserId,
            title: item.title,
            customTitle: item.customTitle,
            description: item.description,
            price: item.price,
            priceCash: item.priceCash,
            priceNonCash: item.priceNonCash,
            currency: item.currency,
            siteCurrency: item.siteCurrency,
            brandId: item.brandId,
            categoryId: item.categoryId,
            localImages: item.localImages,
            isSet: item.isSet,
        });

        await this.repo.setProductId(id, productId);

        return { productId, alreadyExists: false };
    }

    async getSourceItem(id: string) {
        const item = await this.repo.findById(id);
        if (!item) throw new NotFoundException('Base item not found');
        return this.repo.getSourceItem(item.source, item.sourceId);
    }

    async exportToSheets(id: string) {
        const item = await this.repo.findById(id);
        if (!item) throw new NotFoundException('Base item not found');
        const price = item.price
            ? `${item.price}${item.currency ? ' ' + item.currency : ''}`
            : null;
        await this.sheets.appendRow(item.brand || '-', item.description, price, item.url);
        await this.repo.setSentToSheets(id);
        return { success: true };
    }

    async delete(id: string) {
        const item = await this.repo.findById(id);
        if (!item) throw new NotFoundException('Base item not found');
        await this.repo.delete(id);
        return { success: true };
    }

    async bulkUpdate(ids: string[], data: BulkUpdateDto): Promise<{ updated: number }> {
        const updated = await this.repo.bulkUpdate(ids, data);
        return { updated };
    }

    async bulkDownloadImages(ids: string[]): Promise<{ jobId: string }> {
        const jobId = crypto.randomUUID();
        const job = { total: ids.length, done: 0, failed: 0 };
        ParsedBaseService.bulkJobs.set(jobId, job);
        this.runBulkDownload(jobId, ids, job).catch(() => {});
        return { jobId };
    }

    private async runBulkDownload(jobId: string, ids: string[], job: { total: number; done: number; failed: number }): Promise<void> {
        for (const id of ids) {
            try {
                const item = await this.repo.findById(id);
                if (!item || item.imagesDownloaded || !item.images || item.images.length === 0) {
                    job.done++;
                    continue;
                }
                await this.downloadPhotos(id);
                job.done++;
            } catch {
                job.failed++;
            }
        }
        setTimeout(() => ParsedBaseService.bulkJobs.delete(jobId), 10 * 60 * 1000);
    }

    getJobStatus(jobId: string): { total: number; done: number; failed: number } | null {
        return ParsedBaseService.bulkJobs.get(jobId) ?? null;
    }

    async getSourceCounts() {
        return this.repo.getSourceCounts();
    }
}
