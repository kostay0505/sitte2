import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database } from '../../../database/schema';
import { SqlQueryResult } from 'src/database/utils';

export interface KinxsoundProduct {
    id: string;
    externalId: number;
    url: string;
    title: string;
    description: string | null;
    price: string | null;
    priceEur: number | null;
    unit: string | null;
    condition: number | null;
    images: string[] | null;
    category: string | null;
    status: 'active' | 'archived' | 'blacklisted';
    siteStatus: 'available' | 'not_found';
    isNew: boolean;
    localImages: string[] | null;
    imagesDownloaded: boolean;
    driveFolderId: string | null;
    publishedAt: string | null;
    lastCheckedAt: string | null;
    baseItemId: string | null;
    createdAt: string;
    updatedAt: string;
}

@Injectable()
export class KinxsoundRepository {
    constructor(
        @Inject('DATABASE') private readonly db: Database,
    ) { }

    async findAll(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean): Promise<{ items: KinxsoundProduct[]; total: number }> {
        const offset = (page - 1) * limit;
        const extra = (isNew ? ' AND isNew = 1' : '') + (notInBase ? ' AND baseItemId IS NULL' : '');

        const countRes = await this.db.execute(sql`
            SELECT COUNT(*) as total FROM KinxsoundProducts WHERE status = ${status}${sql.raw(extra)}
        `) as unknown as SqlQueryResult<{ total: number }>;
        const total = Number(((countRes[0]) as unknown as any[])[0]?.total ?? 0);

        const result = await this.db.execute(sql`
            SELECT * FROM KinxsoundProducts WHERE status = ${status}${sql.raw(extra)}
            ORDER BY createdAt DESC
            LIMIT ${limit} OFFSET ${offset}
        `) as unknown as SqlQueryResult<any>;

        if (!Array.isArray(result[0])) return { items: [], total };
        const items = (result[0] as any[]).map(row => this.mapRow(row));
        return { items, total };
    }

    async findById(id: string): Promise<KinxsoundProduct | null> {
        const result = await this.db.execute(sql`
            SELECT * FROM KinxsoundProducts WHERE id = ${id} LIMIT 1
        `) as unknown as SqlQueryResult<any>;
        if (!Array.isArray(result[0])) return null;
        const row = (result[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async findByExternalId(externalId: number): Promise<KinxsoundProduct | null> {
        const result = await this.db.execute(sql`
            SELECT id FROM KinxsoundProducts WHERE externalId = ${externalId} LIMIT 1
        `) as unknown as SqlQueryResult<any>;
        if (!Array.isArray(result[0])) return null;
        const row = (result[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async findActiveExternalIds(): Promise<number[]> {
        const result = await this.db.execute(sql`
            SELECT externalId FROM KinxsoundProducts WHERE status = 'active'
        `) as unknown as SqlQueryResult<any>;
        if (!Array.isArray(result[0])) return [];
        return (result[0] as any[]).map(r => Number(r.externalId));
    }

    async create(data: {
        externalId: number;
        url: string;
        title: string;
        description?: string | null;
        price?: string | null;
        priceEur?: number | null;
        unit?: string | null;
        condition?: number | null;
        images?: string[] | null;
        category?: string | null;
        publishedAt?: string | null;
    }): Promise<void> {
        const id = crypto.randomUUID();
        await this.db.execute(sql`
            INSERT INTO KinxsoundProducts
                (id, externalId, url, title, description, price, priceEur, unit, \`condition\`,
                 images, category, status, siteStatus, isNew, imagesDownloaded,
                 publishedAt, lastCheckedAt, createdAt, updatedAt)
            VALUES (
                ${id},
                ${data.externalId},
                ${data.url},
                ${data.title},
                ${data.description ?? null},
                ${data.price ?? null},
                ${data.priceEur ?? null},
                ${data.unit ?? null},
                ${data.condition ?? null},
                ${data.images ? JSON.stringify(data.images) : null},
                ${data.category ?? null},
                'active',
                'available',
                1,
                0,
                ${data.publishedAt ?? null},
                NOW(),
                NOW(),
                NOW()
            )
        `);
    }

    async setStatus(id: string, status: 'active' | 'archived' | 'blacklisted'): Promise<void> {
        await this.db.execute(sql`
            UPDATE KinxsoundProducts SET status = ${status}, updatedAt = NOW() WHERE id = ${id}
        `);
        if (status === 'blacklisted') {
            await this.db.execute(sql`UPDATE ParsedBase SET status = 'blacklisted', updatedAt = NOW() WHERE source = 'kinxsound' AND sourceId = ${id} AND productId IS NOT NULL`);
            await this.db.execute(sql`DELETE FROM ParsedBase WHERE source = 'kinxsound' AND sourceId = ${id} AND productId IS NULL`);
        }
    }

    async markNotFound(activeExternalIds: number[]): Promise<number> {
        if (activeExternalIds.length === 0) return 0;
        const idList = activeExternalIds.join(',');
        const result = await this.db.execute(sql`
            UPDATE KinxsoundProducts
            SET siteStatus = 'not_found', status = 'archived', updatedAt = NOW()
            WHERE status = 'active'
              AND siteStatus = 'available'
              AND externalId NOT IN (${sql.raw(idList)})
        `);
        return (result[0] as any)?.affectedRows ?? 0;
    }

    async markAvailable(externalIds: number[]): Promise<void> {
        if (externalIds.length === 0) return;
        const idList = externalIds.join(',');
        await this.db.execute(sql`
            UPDATE KinxsoundProducts
            SET siteStatus = 'available', updatedAt = NOW()
            WHERE externalId IN (${sql.raw(idList)}) AND siteStatus = 'not_found'
        `);
    }

    async clearNew(id: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE KinxsoundProducts SET isNew = 0, updatedAt = NOW() WHERE id = ${id} AND isNew = 1
        `);
    }

    async setLocalImages(id: string, localImages: string[], driveFolderId?: string): Promise<void> {
        if (driveFolderId) {
            await this.db.execute(sql`
                UPDATE KinxsoundProducts
                SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1, driveFolderId = ${driveFolderId}, updatedAt = NOW()
                WHERE id = ${id}
            `);
        } else {
            await this.db.execute(sql`
                UPDATE KinxsoundProducts
                SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1, updatedAt = NOW()
                WHERE id = ${id}
            `);
        }
    }

    private mapRow(row: any): KinxsoundProduct {
        return {
            ...row,
            externalId: Number(row.externalId),
            priceEur: row.priceEur != null ? Number(row.priceEur) : null,
            condition: row.condition != null ? Number(row.condition) : null,
            images: row.images
                ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images)
                : null,
            localImages: row.localImages
                ? (typeof row.localImages === 'string' ? JSON.parse(row.localImages) : row.localImages)
                : null,
            imagesDownloaded: Boolean(row.imagesDownloaded),
            isNew: Boolean(row.isNew),
            driveFolderId: row.driveFolderId || null,
            baseItemId: row.baseItemId || null,
        };
    }
}
