import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

export interface DeltaLiveProduct {
    id: string;
    externalId: string;
    url: string;
    title: string | null;
    description: string | null;
    price: string | null;
    currency: string | null;
    quantityAvailable: number | null;
    images: string[] | null;
    status: 'active' | 'archived' | 'blacklisted';
    siteStatus: 'available' | 'sold' | 'not_found';
    isNew: boolean;
    imagesDownloaded: boolean;
    localImages: string[] | null;
    driveFolderId: string | null;
    lastCheckedAt: string | null;
    baseItemId: string | null;
    createdAt: string;
    updatedAt: string;
}

@Injectable()
export class DeltaLiveRepository {
    constructor(@Inject('DATABASE') private db: any) {}

    private mapRow(row: any): DeltaLiveProduct {
        return {
            id: row.id,
            externalId: row.externalId,
            url: row.url,
            title: row.title || null,
            description: row.description || null,
            price: row.price || null,
            currency: row.currency || null,
            quantityAvailable: row.quantityAvailable != null ? Number(row.quantityAvailable) : null,
            images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : null,
            status: row.status as 'active' | 'archived' | 'blacklisted',
            siteStatus: row.siteStatus as 'available' | 'sold' | 'not_found',
            isNew: !!row.isNew,
            imagesDownloaded: !!row.imagesDownloaded,
            localImages: row.localImages ? (typeof row.localImages === 'string' ? JSON.parse(row.localImages) : row.localImages) : null,
            driveFolderId: row.driveFolderId || null,
            lastCheckedAt: row.lastCheckedAt || null,
            baseItemId: row.baseItemId || null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    async findAll(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean): Promise<{ items: DeltaLiveProduct[]; total: number }> {
        const offset = (page - 1) * limit;
        const extra = (isNew ? ' AND isNew = 1' : '') + (notInBase ? ' AND baseItemId IS NULL' : '');
        const rows = await this.db.execute(sql`
            SELECT * FROM DeltaLiveProducts
            WHERE status = ${status} ${sql.raw(extra)}
            ORDER BY createdAt DESC
            LIMIT ${limit} OFFSET ${offset}
        `) as unknown as any[];
        const countRows = await this.db.execute(sql`
            SELECT COUNT(*) as total FROM DeltaLiveProducts WHERE status = ${status} ${sql.raw(extra)}
        `) as unknown as any[];
        const total = Number((countRows[0] as any[])[0]?.total ?? 0);
        return { items: (rows[0] as any[]).map(r => this.mapRow(r)), total };
    }

    async findById(id: string): Promise<DeltaLiveProduct | null> {
        const rows = await this.db.execute(sql`SELECT * FROM DeltaLiveProducts WHERE id = ${id} LIMIT 1`) as unknown as any[];
        const row = (rows[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async findByExternalId(externalId: string): Promise<DeltaLiveProduct | null> {
        const rows = await this.db.execute(sql`SELECT * FROM DeltaLiveProducts WHERE externalId = ${externalId} LIMIT 1`) as unknown as any[];
        const row = (rows[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async create(data: {
        externalId: string; url: string; title: string;
        description?: string | null; price?: string | null; currency?: string | null;
        quantityAvailable?: number | null; images?: string[];
        siteStatus?: 'available' | 'sold' | 'not_found';
    }): Promise<void> {
        const id = crypto.randomUUID();
        const ss = data.siteStatus ?? 'available';
        await this.db.execute(sql`
            INSERT INTO DeltaLiveProducts
                (id, externalId, url, title, description, price, currency, quantityAvailable, images, status, siteStatus, isNew, createdAt, updatedAt)
            VALUES
                (${id}, ${data.externalId}, ${data.url}, ${data.title},
                 ${data.description ?? null}, ${data.price ?? null}, ${data.currency ?? null},
                 ${data.quantityAvailable ?? null}, ${JSON.stringify(data.images ?? [])},
                 'active', ${ss}, 1, NOW(), NOW())
        `);
    }

    async updateData(id: string, data: {
        price?: string | null; currency?: string | null; quantityAvailable?: number | null;
        description?: string | null; images?: string[];
        siteStatus?: 'available' | 'sold' | 'not_found';
    }): Promise<void> {
        await this.db.execute(sql`
            UPDATE DeltaLiveProducts SET
                price = ${data.price ?? null},
                currency = ${data.currency ?? null},
                quantityAvailable = ${data.quantityAvailable ?? null},
                description = ${data.description ?? null},
                images = ${JSON.stringify(data.images ?? [])},
                siteStatus = ${data.siteStatus ?? 'available'},
                lastCheckedAt = NOW(),
                updatedAt = NOW()
            WHERE id = ${id}
        `);
    }

    async setStatus(id: string, status: 'active' | 'archived' | 'blacklisted'): Promise<void> {
        await this.db.execute(sql`UPDATE DeltaLiveProducts SET status = ${status}, updatedAt = NOW() WHERE id = ${id}`);
        if (status === 'blacklisted') {
            await this.db.execute(sql`UPDATE ParsedBase SET status = 'blacklisted', updatedAt = NOW() WHERE source = 'deltalive' AND sourceId = ${id} AND productId IS NOT NULL`);
            await this.db.execute(sql`DELETE FROM ParsedBase WHERE source = 'deltalive' AND sourceId = ${id} AND productId IS NULL`);
        }
    }

    async clearNew(id: string): Promise<void> {
        await this.db.execute(sql`UPDATE DeltaLiveProducts SET isNew = 0, updatedAt = NOW() WHERE id = ${id}`);
    }

    async markNotFound(externalId: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE DeltaLiveProducts SET siteStatus = 'not_found', status = 'archived', lastCheckedAt = NOW(), updatedAt = NOW()
            WHERE externalId = ${externalId}
        `);
    }

    async markAvailable(externalId: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE DeltaLiveProducts
            SET siteStatus = 'available', status = 'active', lastCheckedAt = NOW(), updatedAt = NOW()
            WHERE externalId = ${externalId}
        `);
    }

    async setLocalImages(id: string, localImages: string[], driveFolderId?: string): Promise<void> {
        if (driveFolderId) {
            await this.db.execute(sql`
                UPDATE DeltaLiveProducts SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1,
                    driveFolderId = ${driveFolderId}, updatedAt = NOW() WHERE id = ${id}
            `);
        } else {
            await this.db.execute(sql`
                UPDATE DeltaLiveProducts SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1,
                    updatedAt = NOW() WHERE id = ${id}
            `);
        }
    }

    async setBaseItemId(id: string, sku: string): Promise<void> {
        await this.db.execute(sql`UPDATE DeltaLiveProducts SET baseItemId = ${sku}, updatedAt = NOW() WHERE id = ${id}`);
    }

    async getAllExternalIds(): Promise<string[]> {
        const rows = await this.db.execute(sql`SELECT externalId FROM DeltaLiveProducts WHERE status != 'blacklisted'`) as unknown as any[];
        return (rows[0] as any[]).map((r: any) => r.externalId);
    }
}
