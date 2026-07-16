import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database } from '../../../database/schema';

export type SourceTab = 'parsing' | 'archive' | 'trash';

export interface SourceItemListRow {
    id: string;
    source: string;
    external_id: string;
    title: string | null;
    price_amount: string | null;
    price_currency: string | null;
    parse_error: number;
    site_status: string | null;
    first_seen: string | null;
    last_seen: string | null;
    archived_at: string | null;
    trashed_at: string | null;
    delete_after: string | null;
    trash_reason: string | null;
    linked_product_id: string | null;
    preview: string | null;
}

const SORTABLE: Record<string, string> = {
    first_seen: 'si.first_seen',
    last_seen: 'si.last_seen',
    price: 'si.price_amount',
    title: 'si.title',
    source: 'si.source',
};

// Архив источника: сама площадка сняла позицию (авто) либо админ убрал вручную (archived_at)
const AUTO_ARCHIVE_STATUSES = `'not_found','sold','archived'`;

@Injectable()
export class SourceItemsRepository {
    constructor(@Inject('DATABASE') private db: Database) {}

    private tabCondition(tab: SourceTab) {
        if (tab === 'trash') return sql`si.trashed_at IS NOT NULL`;
        if (tab === 'archive')
            return sql`si.trashed_at IS NULL AND (si.archived_at IS NOT NULL OR si.site_status IN (${sql.raw(AUTO_ARCHIVE_STATUSES)}))`;
        return sql`si.trashed_at IS NULL AND si.archived_at IS NULL AND (si.site_status IS NULL OR si.site_status NOT IN (${sql.raw(AUTO_ARCHIVE_STATUSES)}))`;
    }

    async list(opts: {
        tab: SourceTab; source?: string; search?: string;
        sortBy?: string; sortDir?: 'asc' | 'desc'; page: number; limit: number;
        linked?: 'linked' | 'unlinked'; siteStatus?: string; noPrice?: boolean; newWithinHours?: number;
        priceMin?: number; priceMax?: number; dateFrom?: string;
    }): Promise<{ items: SourceItemListRow[]; total: number }> {
        const conds = [this.tabCondition(opts.tab)];
        if (opts.source) conds.push(sql`si.source = ${opts.source}`);
        if (opts.search?.trim()) conds.push(sql`si.title LIKE ${'%' + opts.search.trim() + '%'}`);
        // per-column фильтры по значению (правка 2026-07-16)
        if (opts.priceMin != null) conds.push(sql`si.price_amount >= ${opts.priceMin}`);
        if (opts.priceMax != null) conds.push(sql`si.price_amount <= ${opts.priceMax}`);
        if (opts.dateFrom) conds.push(sql`si.first_seen >= ${opts.dateFrom}`);
        // A2 отобранность
        if (opts.linked === 'linked') conds.push(sql`EXISTS (SELECT 1 FROM products p2 WHERE p2.source_item_id = si.id)`);
        else if (opts.linked === 'unlinked') conds.push(sql`NOT EXISTS (SELECT 1 FROM products p2 WHERE p2.source_item_id = si.id)`);
        // A3 состояние источника
        if (opts.siteStatus === 'available') conds.push(sql`(si.site_status IS NULL OR si.site_status = 'available')`);
        else if (opts.siteStatus === 'sold') conds.push(sql`si.site_status = 'sold'`);
        else if (opts.siteStatus === 'not_found') conds.push(sql`si.site_status = 'not_found'`);
        // A3 без цены (включая parse_error — там price_amount тоже NULL)
        if (opts.noPrice) conds.push(sql`si.price_amount IS NULL`);
        // A4 новые
        if (opts.newWithinHours) conds.push(sql`si.first_seen >= DATE_SUB(NOW(), INTERVAL ${opts.newWithinHours} HOUR)`);

        const where = sql.join(conds, sql` AND `);
        const orderCol = SORTABLE[opts.sortBy ?? ''] ?? 'si.first_seen';
        const orderDir = opts.sortDir === 'asc' ? 'ASC' : 'DESC';
        const offset = (opts.page - 1) * opts.limit;
        // превью: локальное фото приоритетнее внешнего URL (A1)
        const previewExpr = sql`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(si.extra, '$.local_images[0]')), JSON_UNQUOTE(JSON_EXTRACT(si.images, '$[0]')))`;

        const rows = (await this.db.execute(sql`
            SELECT si.id, si.source, si.external_id, si.title, si.price_amount, si.price_currency,
                   si.parse_error, si.site_status, si.first_seen, si.last_seen,
                   si.archived_at, si.trashed_at, si.delete_after, si.trash_reason,
                   ${previewExpr} AS preview,
                   (SELECT MAX(p.id) FROM products p WHERE p.source_item_id = si.id) AS linked_product_id
            FROM source_items si
            WHERE ${where}
            ORDER BY ${sql.raw(orderCol)} ${sql.raw(orderDir)}
            LIMIT ${opts.limit} OFFSET ${offset}
        `)) as unknown as any[];

        const cnt = (await this.db.execute(sql`
            SELECT COUNT(*) AS total FROM source_items si WHERE ${where}
        `)) as unknown as any[];

        return { items: rows[0] as SourceItemListRow[], total: Number((cnt[0] as any[])[0]?.total ?? 0) };
    }

    async sourcesSummary(): Promise<Array<{ source: string; cnt: number }>> {
        const rows = (await this.db.execute(sql`
            SELECT source, COUNT(*) cnt FROM source_items GROUP BY source ORDER BY source
        `)) as unknown as any[];
        return rows[0] as Array<{ source: string; cnt: number }>;
    }

    async findFull(id: string): Promise<any | null> {
        const rows = (await this.db.execute(sql`
            SELECT si.*, MAX(p.id) AS linked_product_id, MAX(p.custom_id) AS linked_custom_id
            FROM source_items si
            LEFT JOIN products p ON p.source_item_id = si.id
            WHERE si.id = ${id}
            GROUP BY si.id
        `)) as unknown as any[];
        return (rows[0] as any[])[0] ?? null;
    }

    async linkedProductId(id: string): Promise<string | null> {
        const rows = (await this.db.execute(sql`
            SELECT id FROM products WHERE source_item_id = ${id} LIMIT 1
        `)) as unknown as any[];
        return (rows[0] as any[])[0]?.id ?? null;
    }

    async setArchived(id: string, archived: boolean): Promise<void> {
        await this.db.execute(sql`
            UPDATE source_items SET archived_at = ${archived ? sql.raw('NOW()') : null} WHERE id = ${id}
        `);
    }

    async setTrashed(id: string, reason: string | null): Promise<void> {
        if (reason) {
            await this.db.execute(sql`
                UPDATE source_items
                SET trashed_at = NOW(), delete_after = DATE_ADD(NOW(), INTERVAL 7 DAY), trash_reason = ${reason}
                WHERE id = ${id}
            `);
        } else {
            await this.db.execute(sql`
                UPDATE source_items SET trashed_at = NULL, delete_after = NULL, trash_reason = NULL WHERE id = ${id}
            `);
        }
    }

    async findExpiredTrash(): Promise<Array<{ id: string; source: string; external_id: string; title: string | null }>> {
        const rows = (await this.db.execute(sql`
            SELECT id, source, external_id, title FROM source_items
            WHERE trashed_at IS NOT NULL AND delete_after < NOW() LIMIT 200
        `)) as unknown as any[];
        return rows[0] as any[];
    }

    /** Физическое удаление: файлы — в очередь отложенной очистки (D1.2), затем строка */
    async hardDelete(id: string): Promise<void> {
        const row = await this.findFull(id);
        if (!row) return;
        const extra = typeof row.extra === 'string' ? JSON.parse(row.extra || '{}') : row.extra || {};
        const localPaths: string[] = Array.isArray(extra?.local_images) ? extra.local_images : [];
        const driveFolderId: string | null = extra?.drive_folder_id ?? null;
        await this.db.execute(sql`
            INSERT INTO file_cleanup_queue (id, owner_type, owner_id, local_paths, drive_folder_id)
            VALUES (${crypto.randomUUID()}, 'source_item', ${id}, ${JSON.stringify(localPaths)}, ${driveFolderId})
        `);
        await this.db.execute(sql`DELETE FROM source_items WHERE id = ${id}`);
        // FK products.source_item_id → ON DELETE SET NULL: связанный товар не затрагивается
    }

    /** Атомарный TEM-артикул — единый счётчик SkuCounter (Фаза 6) */
    async getNextSku(): Promise<string> {
        const result = (await this.db.execute(sql`
            UPDATE SkuCounter SET nextVal = LAST_INSERT_ID(nextVal + 1) WHERE id = 1
        `)) as unknown as any[];
        const nextNum = Number((result[0] as any)?.insertId ?? 0);
        if (!nextNum) throw new Error('SkuCounter is not initialized');
        return `TEM-${String(nextNum).padStart(6, '0')}`;
    }
}
