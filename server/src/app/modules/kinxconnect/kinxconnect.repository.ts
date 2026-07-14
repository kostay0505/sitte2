import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database } from '../../../database/schema';
import { SqlQueryResult } from 'src/database/utils';

export interface KinxConnectListing {
    id: string;
    externalId: number;
    url: string;
    title: string;
    description: string | null;
    price: string | null;
    priceRaw: number | null;
    currency: string | null;
    images: string[] | null;
    categoryId: number | null;
    category: string | null;
    conditionId: number | null;
    sellerId: number | null;
    sellerName: string | null;
    sellerCountry: string | null;
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
export class KinxConnectRepository {
    constructor(
        @Inject('DATABASE') private readonly db: Database,
    ) { }

    async findAll(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean): Promise<{ items: KinxConnectListing[]; total: number }> {
        const offset = (page - 1) * limit;
        const extra = (isNew ? ' AND isNew = 1' : '') + (notInBase ? ' AND baseItemId IS NULL' : '');

        const countRes = await this.db.execute(sql`
            SELECT COUNT(*) as total FROM KinxConnectListings WHERE status = ${status}${sql.raw(extra)}
        `) as unknown as SqlQueryResult<{ total: number }>;
        const total = Number(((countRes[0]) as unknown as any[])[0]?.total ?? 0);

        const result = await this.db.execute(sql`
            SELECT * FROM KinxConnectListings WHERE status = ${status}${sql.raw(extra)}
            ORDER BY publishedAt DESC, createdAt DESC
            LIMIT ${limit} OFFSET ${offset}
        `) as unknown as SqlQueryResult<any>;

        if (!Array.isArray(result[0])) return { items: [], total };
        return { items: (result[0] as any[]).map(r => this.mapRow(r)), total };
    }

    async findById(id: string): Promise<KinxConnectListing | null> {
        const result = await this.db.execute(sql`
            SELECT * FROM KinxConnectListings WHERE id = ${id} LIMIT 1
        `) as unknown as SqlQueryResult<any>;
        if (!Array.isArray(result[0])) return null;
        const row = (result[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async findByExternalId(externalId: number): Promise<KinxConnectListing | null> {
        const result = await this.db.execute(sql`
            SELECT id FROM KinxConnectListings WHERE externalId = ${externalId} LIMIT 1
        `) as unknown as SqlQueryResult<any>;
        if (!Array.isArray(result[0])) return null;
        const row = (result[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async create(data: {
        externalId: number;
        url: string;
        title: string;
        description?: string | null;
        price?: string | null;
        priceRaw?: number | null;
        currency?: string | null;
        images?: string[] | null;
        categoryId?: number | null;
        category?: string | null;
        conditionId?: number | null;
        sellerId?: number | null;
        sellerName?: string | null;
        sellerCountry?: string | null;
        publishedAt?: string | null;
    }): Promise<void> {
        const id = crypto.randomUUID();
        await this.db.execute(sql`
            INSERT INTO KinxConnectListings
                (id, externalId, url, title, description, price, priceRaw, currency,
                 images, categoryId, category, conditionId, sellerId, sellerName, sellerCountry,
                 status, siteStatus, isNew, imagesDownloaded,
                 publishedAt, lastCheckedAt, createdAt, updatedAt)
            VALUES (
                ${id}, ${data.externalId}, ${data.url}, ${data.title},
                ${data.description ?? null}, ${data.price ?? null}, ${data.priceRaw ?? null}, ${data.currency ?? null},
                ${data.images ? JSON.stringify(data.images) : null},
                ${data.categoryId ?? null}, ${data.category ?? null}, ${data.conditionId ?? null},
                ${data.sellerId ?? null}, ${data.sellerName ?? null}, ${data.sellerCountry ?? null},
                'active', 'available', 1, 0,
                ${data.publishedAt ?? null}, NOW(), NOW(), NOW()
            )
        `);
    }

    async setStatus(id: string, status: 'active' | 'archived' | 'blacklisted'): Promise<void> {
        await this.db.execute(sql`
            UPDATE KinxConnectListings SET status = ${status}, updatedAt = NOW() WHERE id = ${id}
        `);
        if (status === 'blacklisted') {
            await this.db.execute(sql`UPDATE ParsedBase SET status = 'blacklisted', updatedAt = NOW() WHERE source = 'kinxconnect' AND sourceId = ${id} AND productId IS NOT NULL`);
            await this.db.execute(sql`DELETE FROM ParsedBase WHERE source = 'kinxconnect' AND sourceId = ${id} AND productId IS NULL`);
        }
    }

    async markNotFound(activeExternalIds: number[]): Promise<number> {
        if (activeExternalIds.length === 0) return 0;
        const idList = activeExternalIds.join(',');
        const result = await this.db.execute(sql`
            UPDATE KinxConnectListings
            SET siteStatus = 'not_found', status = 'archived', updatedAt = NOW()
            WHERE status = 'active' AND siteStatus = 'available'
              AND externalId NOT IN (${sql.raw(idList)})
        `);
        return (result[0] as any)?.affectedRows ?? 0;
    }

    async markAvailable(externalIds: number[]): Promise<void> {
        if (externalIds.length === 0) return;
        const idList = externalIds.join(',');
        await this.db.execute(sql`
            UPDATE KinxConnectListings
            SET siteStatus = 'available', updatedAt = NOW()
            WHERE externalId IN (${sql.raw(idList)}) AND siteStatus = 'not_found'
        `);
    }

    async clearNew(id: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE KinxConnectListings SET isNew = 0, updatedAt = NOW() WHERE id = ${id} AND isNew = 1
        `);
    }

    async setLocalImages(id: string, localImages: string[], driveFolderId?: string): Promise<void> {
        if (driveFolderId) {
            await this.db.execute(sql`
                UPDATE KinxConnectListings
                SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1, driveFolderId = ${driveFolderId}, updatedAt = NOW()
                WHERE id = ${id}
            `);
        } else {
            await this.db.execute(sql`
                UPDATE KinxConnectListings
                SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1, updatedAt = NOW()
                WHERE id = ${id}
            `);
        }
    }

    private mapRow(row: any): KinxConnectListing {
        return {
            ...row,
            externalId: Number(row.externalId),
            priceRaw: row.priceRaw != null ? Number(row.priceRaw) : null,
            categoryId: row.categoryId != null ? Number(row.categoryId) : null,
            conditionId: row.conditionId != null ? Number(row.conditionId) : null,
            sellerId: row.sellerId != null ? Number(row.sellerId) : null,
            images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : null,
            localImages: row.localImages ? (typeof row.localImages === 'string' ? JSON.parse(row.localImages) : row.localImages) : null,
            imagesDownloaded: Boolean(row.imagesDownloaded),
            isNew: Boolean(row.isNew),
            driveFolderId: row.driveFolderId || null,
            baseItemId: row.baseItemId || null,
        };
    }
}
