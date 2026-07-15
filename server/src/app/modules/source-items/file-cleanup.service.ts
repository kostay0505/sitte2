import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { Database } from '../../../database/schema';
import { SourceItemsRepository } from './source-items.repository';
import { DriveService } from '../drive/drive.service';

const UPLOADS_BASE = '/var/www/touring-test/server/uploads';
const UPLOADS_PHOTOS = path.join(UPLOADS_BASE, 'фотографии');
const MAX_ATTEMPTS = 5;

/**
 * D1.2: отложенная очистка файлов (вне SQL-транзакций) + D2.4 reaper корзины.
 * Файл удаляется только если не используется НИ ОДНОЙ живой строкой
 * (модель «разделяемых» файлов у пар source_item↔product, созданных до Блока C).
 */
@Injectable()
export class FileCleanupService {
    private readonly logger = new Logger(FileCleanupService.name);

    constructor(
        @Inject('DATABASE') private db: Database,
        private readonly repo: SourceItemsRepository,
        private readonly driveService: DriveService,
    ) {}

    // ── воркер очереди ───────────────────────────────────────────────────────
    @Cron('*/30 * * * *')
    async processQueue(): Promise<void> {
        const rows = (await this.db.execute(sql`
            SELECT * FROM file_cleanup_queue WHERE state = 'pending' AND attempts < ${MAX_ATTEMPTS} LIMIT 20
        `)) as unknown as any[];
        const jobs = rows[0] as any[];
        if (!jobs.length) return;

        for (const job of jobs) {
            try {
                const paths: string[] = typeof job.local_paths === 'string'
                    ? JSON.parse(job.local_paths || '[]') : job.local_paths || [];
                let removed = 0, kept = 0;
                for (const name of paths) {
                    if (!name || name.includes('/') || name.includes('..')) { kept++; continue; }
                    if (await this.isFileShared(name)) { kept++; continue; }
                    for (const base of [UPLOADS_BASE, UPLOADS_PHOTOS]) {
                        const p = path.join(base, name);
                        if (fs.existsSync(p)) { await fs.promises.unlink(p); removed++; }
                    }
                }
                if (job.drive_folder_id) {
                    if (await this.isDriveFolderShared(job.drive_folder_id)) {
                        this.logger.log(`cleanup ${job.id}: drive-папка ${job.drive_folder_id} разделяется — не удаляю`);
                    } else {
                        await this.driveService.deleteFolder(job.drive_folder_id);
                    }
                }
                await this.db.execute(sql`
                    UPDATE file_cleanup_queue SET state = 'done', last_error = NULL WHERE id = ${job.id}
                `);
                this.logger.log(`cleanup ${job.id}: файлов удалено ${removed}, оставлено (разделяемые) ${kept}`);
            } catch (err) {
                const attempts = Number(job.attempts) + 1;
                await this.db.execute(sql`
                    UPDATE file_cleanup_queue
                    SET attempts = ${attempts}, last_error = ${String((err as Error).message).slice(0, 500)},
                        state = ${attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'}
                    WHERE id = ${job.id}
                `);
                this.logger.warn(`cleanup ${job.id}: попытка ${attempts} не удалась: ${(err as Error).message}`);
            }
        }
    }

    /** Файл считается занятым, если на него ссылается любая живая строка */
    private async isFileShared(name: string): Promise<boolean> {
        const like = `%${name}%`;
        const checks = [
            sql`SELECT 1 FROM products WHERE preview = ${name} OR CAST(images AS CHAR) LIKE ${like} LIMIT 1`,
            sql`SELECT 1 FROM source_items WHERE CAST(extra AS CHAR) LIKE ${like} LIMIT 1`,
            sql`SELECT 1 FROM ParsedBase WHERE localImages LIKE ${like} LIMIT 1`,
        ];
        for (const q of checks) {
            const r = (await this.db.execute(q)) as unknown as any[];
            if ((r[0] as any[]).length) return true;
        }
        // парсер-таблицы: localImages живут и там (триггеры их в extra не копируют)
        const tables = ['ArriusProducts', 'AlvFranceProducts', 'AvlsProducts', 'PaAudioProducts', 'SoundtradeProducts',
            'DeltaLiveProducts', 'CuesaleProducts', 'KinxsoundProducts', 'KinxConnectListings', 'GearwiseProducts',
            'UsedfullProducts', 'JsFranceProducts'];
        for (const t of tables) {
            const r = (await this.db.execute(
                sql`SELECT 1 FROM ${sql.raw(t)} WHERE localImages LIKE ${like} LIMIT 1`)) as unknown as any[];
            if ((r[0] as any[]).length) return true;
        }
        return false;
    }

    private async isDriveFolderShared(folderId: string): Promise<boolean> {
        const tables = ['ArriusProducts', 'AlvFranceProducts', 'AvlsProducts', 'PaAudioProducts', 'SoundtradeProducts',
            'DeltaLiveProducts', 'CuesaleProducts', 'KinxsoundProducts', 'KinxConnectListings', 'GearwiseProducts',
            'UsedfullProducts', 'JsFranceProducts'];
        for (const t of tables) {
            const r = (await this.db.execute(
                sql`SELECT 1 FROM ${sql.raw(t)} WHERE driveFolderId = ${folderId} LIMIT 1`)) as unknown as any[];
            if ((r[0] as any[]).length) return true;
        }
        return false;
    }

    // ── D2.4 reaper: авто-удаление просроченной корзины ─────────────────────
    @Cron('0 4 * * *')
    async reapTrash(): Promise<void> {
        const expired = await this.repo.findExpiredTrash();
        if (!expired.length) return;
        const deleted: string[] = [];
        for (const row of expired) {
            const linked = await this.repo.linkedProductId(row.id);
            if (linked) {
                this.logger.warn(`reaper: у ${row.source}#${row.external_id} появился связанный товар — пропускаю`);
                continue;
            }
            await this.repo.hardDelete(row.id);
            deleted.push(`${row.source}#${row.external_id} «${(row.title || '').slice(0, 40)}»`);
        }
        this.logger.log(`reaper: удалено из корзины ${deleted.length}: ${deleted.join('; ')}`);
    }
}
