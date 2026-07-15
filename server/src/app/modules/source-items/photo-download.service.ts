import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { Database } from '../../../database/schema';

/**
 * ТЗ №2-fix Шаг 3: очередь автоскачивания фото при «В товары».
 * Владелец файлов — product_id (инвариант D1.3); вне SQL-транзакций,
 * ретраи с потолком (паттерн file_cleanup_queue).
 */

const UPLOADS_BASE = '/var/www/touring-test/server/uploads';
const MAX_ATTEMPTS = 5;
const MAX_PHOTOS = 5; // лимит фото объявления

function downloadFile(url: string, dest: string, depth = 0): Promise<void> {
    return new Promise((resolve, reject) => {
        if (depth > 4) return reject(new Error('too many redirects'));
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(
            url,
            { headers: { 'User-Agent': 'Mozilla/5.0 TEM-Bot/1.0' }, timeout: 25000 },
            res => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    downloadFile(new URL(res.headers.location, url).toString(), dest, depth + 1)
                        .then(resolve).catch(reject);
                    return;
                }
                if (!res.statusCode || res.statusCode >= 400) {
                    res.resume();
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(() => resolve()));
                file.on('error', err => { file.close(); fs.unlink(dest, () => reject(err)); });
            },
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

@Injectable()
export class PhotoDownloadService implements OnModuleInit {
    private readonly logger = new Logger(PhotoDownloadService.name);
    private processing = false;

    constructor(@Inject('DATABASE') private db: Database) {}

    onModuleInit() {
        this.logger.log('PhotoDownloadService запущен (крон */2 мин)');
        // подхватить хвост очереди сразу после рестарта, не дожидаясь крона
        setTimeout(() => this.process().catch(e => this.logger.warn(`initial process: ${(e as Error).message}`)), 15000);
    }

    /** Поставить задачу; force=true (кнопка «Скачать заново») перезапишет уже имеющиеся фото */
    async enqueue(productId: string, sourceItemId: string | null, urls: string[], force = false): Promise<number> {
        const clean = urls.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, MAX_PHOTOS);
        if (!clean.length) return 0;
        await this.db.execute(sql`
            UPDATE photo_download_queue SET state = 'done', last_error = 'superseded'
            WHERE product_id = ${productId} AND state IN ('pending', 'running', 'error')
        `);
        await this.db.execute(sql`
            INSERT INTO photo_download_queue (id, product_id, source_item_id, urls, total, is_force)
            VALUES (${crypto.randomUUID()}, ${productId}, ${sourceItemId}, ${JSON.stringify(clean)}, ${clean.length}, ${force ? 1 : 0})
        `);
        return clean.length;
    }

    /** «Скачать фото заново» — с URL исходной позиции */
    async retryForProduct(productId: string): Promise<{ total: number }> {
        const rows = (await this.db.execute(sql`
            SELECT p.source_item_id, CAST(si.images AS CHAR) AS images
            FROM products p LEFT JOIN source_items si ON si.id = p.source_item_id
            WHERE p.id = ${productId}
        `)) as unknown as any[];
        const row = (rows[0] as any[])[0];
        if (!row) throw new NotFoundException('Товар не найден');
        if (!row.source_item_id) throw new NotFoundException('У товара нет позиции-источника');
        let urls: string[] = [];
        try { urls = JSON.parse(row.images || '[]'); } catch { /* ignore */ }
        const total = await this.enqueue(productId, row.source_item_id, urls, true);
        if (!total) throw new NotFoundException('У исходной позиции нет URL фотографий');
        return { total };
    }

    /** Статусы фото по всем товарам с источником (бейджи в админке) */
    async statuses(): Promise<unknown[]> {
        const rows = (await this.db.execute(sql`
            SELECT p.id AS product_id, q.state, q.downloaded, q.total, q.last_error
            FROM products p
            LEFT JOIN photo_download_queue q ON q.id = (
                SELECT q2.id FROM photo_download_queue q2
                WHERE q2.product_id = p.id ORDER BY q2.enqueued_at DESC LIMIT 1
            )
            WHERE p.source_item_id IS NOT NULL
        `)) as unknown as any[];
        return rows[0] as unknown[];
    }

    @Cron('*/2 * * * *')
    async process(): Promise<void> {
        if (this.processing) return;
        this.processing = true;
        try {
            const rows = (await this.db.execute(sql`
                SELECT id, product_id, urls, attempts, is_force FROM photo_download_queue
                WHERE state = 'pending' AND attempts < ${MAX_ATTEMPTS}
                ORDER BY enqueued_at LIMIT 3
            `)) as unknown as any[];
            const jobs = rows[0] as any[];
            if (jobs.length) this.logger.log(`Очередь фото: беру ${jobs.length} задач(и)`);
            for (const job of jobs) {
                await this.runJob(job).catch(e => this.logger.warn(`photo job ${job.id}: ${(e as Error).message}`));
            }
        } finally {
            this.processing = false;
        }
    }

    private async runJob(job: { id: string; product_id: string; urls: unknown; attempts: number; is_force: number }): Promise<void> {
        await this.db.execute(sql`UPDATE photo_download_queue SET state = 'running', attempts = attempts + 1 WHERE id = ${job.id}`);

        // товар мог быть удалён — файлы мёртвому владельцу не пишем (D1.3 + хотфикс fix2)
        const p = (await this.db.execute(sql`
            SELECT CAST(images AS CHAR) AS images FROM products WHERE id = ${job.product_id}
        `)) as unknown as any[];
        const prod = (p[0] as any[])[0];
        if (!prod) {
            await this.db.execute(sql`UPDATE photo_download_queue SET state = 'done', last_error = 'product deleted' WHERE id = ${job.id}`);
            return;
        }
        // без force не затираем фото, загруженные админом вручную
        if (!job.is_force) {
            try {
                const existing: string[] = JSON.parse(prod.images || '[]');
                if (existing.some(f => typeof f === 'string' && f && !/^https?:/i.test(f))) {
                    await this.db.execute(sql`UPDATE photo_download_queue SET state = 'done', last_error = 'already has photos' WHERE id = ${job.id}`);
                    return;
                }
            } catch { /* ignore */ }
        }

        const urls: string[] = typeof job.urls === 'string' ? JSON.parse(job.urls) : (job.urls as string[]);
        const files: string[] = [];
        let lastErr = '';
        for (let i = 0; i < urls.length; i++) {
            const extMatch = urls[i].match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
            const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.jpg';
            const name = `${job.product_id}-${i + 1}${ext}`;
            try {
                await downloadFile(urls[i], path.join(UPLOADS_BASE, name));
                files.push(name);
                await this.db.execute(sql`UPDATE photo_download_queue SET downloaded = ${files.length} WHERE id = ${job.id}`);
            } catch (e) {
                lastErr = `${urls[i]}: ${(e as Error).message}`;
            }
        }

        if (files.length) {
            await this.db.execute(sql`
                UPDATE products SET images = ${JSON.stringify(files)}, preview = ${files[0]} WHERE id = ${job.product_id}
            `);
        }
        if (files.length === urls.length) {
            await this.db.execute(sql`UPDATE photo_download_queue SET state = 'done', last_error = NULL WHERE id = ${job.id}`);
        } else if (job.attempts + 1 >= MAX_ATTEMPTS) {
            await this.db.execute(sql`UPDATE photo_download_queue SET state = 'error', last_error = ${lastErr || 'partial'} WHERE id = ${job.id}`);
        } else {
            await this.db.execute(sql`UPDATE photo_download_queue SET state = 'pending', last_error = ${lastErr || 'partial'} WHERE id = ${job.id}`);
        }
        this.logger.log(`Фото ${job.product_id}: ${files.length}/${urls.length}`);
    }
}
