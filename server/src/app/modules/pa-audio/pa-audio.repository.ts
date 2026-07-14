import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

export interface PaAudioProduct {
    id: string;
    externalId: string;
    url: string;
    title: string;
    description: string | null;
    price: string | null;
    currency: string | null;
    condition: string | null;
    brand: string | null;
    sku: string | null;
    availability: string | null;
    images: string[] | null;
    categories: string | null;
    status: 'active' | 'archived' | 'blacklisted';
    siteStatus: 'available' | 'not_found';
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
export class PaAudioRepository {
    constructor(@Inject('DATABASE') private db: any) {}

    private mapRow(row: any): PaAudioProduct {
        return {
            id: row.id,
            externalId: row.externalId,
            url: row.url,
            title: row.title,
            description: row.description || null,
            price: row.price || null,
            currency: row.currency || null,
            condition: row.condition || null,
            brand: row.brand || null,
            sku: row.sku || null,
            availability: row.availability || null,
            images: row.images
                ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images)
                : null,
            categories: row.categories || null,
            status: row.status as 'active' | 'archived' | 'blacklisted',
            siteStatus: row.siteStatus as 'available' | 'not_found',
            isNew: !!row.isNew,
            imagesDownloaded: !!row.imagesDownloaded,
            localImages: row.localImages
                ? (typeof row.localImages === 'string' ? JSON.parse(row.localImages) : row.localImages)
                : null,
            driveFolderId: row.driveFolderId || null,
            lastCheckedAt: row.lastCheckedAt || null,
            baseItemId: row.baseItemId || null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    async findAll(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean): Promise<{ items: PaAudioProduct[]; total: number }> {
        const offset = (page - 1) * limit;
        const extra = (isNew ? ' AND isNew = 1' : '') + (notInBase ? ' AND baseItemId IS NULL' : '');
        const rows = await this.db.execute(sql`
            SELECT * FROM PaAudioProducts
            WHERE status = ${status}${sql.raw(extra)}
            ORDER BY createdAt DESC
            LIMIT ${limit} OFFSET ${offset}
        `) as unknown as any[];
        const countRows = await this.db.execute(sql`
            SELECT COUNT(*) as total FROM PaAudioProducts WHERE status = ${status}${sql.raw(extra)}
        `) as unknown as any[];
        const total = Number((countRows[0] as any[])[0]?.total ?? 0);
        return { items: (rows[0] as any[]).map(r => this.mapRow(r)), total };
    }

    async findById(id: string): Promise<PaAudioProduct | null> {
        const rows = await this.db.execute(sql`
            SELECT * FROM PaAudioProducts WHERE id = ${id} LIMIT 1
        `) as unknown as any[];
        const row = (rows[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async findByExternalId(externalId: string): Promise<PaAudioProduct | null> {
        const rows = await this.db.execute(sql`
            SELECT * FROM PaAudioProducts WHERE externalId = ${externalId} LIMIT 1
        `) as unknown as any[];
        const row = (rows[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async create(data: {
        externalId: string;
        url: string;
        title: string;
        description?: string | null;
        price?: string | null;
        currency?: string | null;
        condition?: string | null;
        brand?: string | null;
        sku?: string | null;
        availability?: string | null;
        images?: string[];
        categories?: string | null;
    }): Promise<void> {
        const id = crypto.randomUUID();
        await this.db.execute(sql`
            INSERT INTO PaAudioProducts
                (id, externalId, url, title, description, price, currency, \`condition\`, brand, sku, availability, images, categories, status, siteStatus, isNew, createdAt, updatedAt)
            VALUES
                (${id}, ${data.externalId}, ${data.url}, ${data.title},
                 ${data.description ?? null}, ${data.price ?? null}, ${data.currency ?? null},
                 ${data.condition ?? null}, ${data.brand ?? null}, ${data.sku ?? null},
                 ${data.availability ?? null}, ${JSON.stringify(data.images ?? [])},
                 ${data.categories ?? null}, 'active', 'available', 1, NOW(), NOW())
        `);
    }

    async updatePrice(id: string, price: string, currency: string | null): Promise<void> {
        await this.db.execute(sql`
            UPDATE PaAudioProducts
            SET price = ${price}, currency = ${currency}, updatedAt = NOW()
            WHERE id = ${id}
        `);
    }

    async setStatus(id: string, status: 'active' | 'archived' | 'blacklisted'): Promise<void> {
        await this.db.execute(sql`
            UPDATE PaAudioProducts SET status = ${status}, updatedAt = NOW() WHERE id = ${id}
        `);
        if (status === 'blacklisted') {
            await this.db.execute(sql`UPDATE ParsedBase SET status = 'blacklisted', updatedAt = NOW() WHERE source = 'pa-audio' AND sourceId = ${id} AND productId IS NOT NULL`);
            await this.db.execute(sql`DELETE FROM ParsedBase WHERE source = 'pa-audio' AND sourceId = ${id} AND productId IS NULL`);
        }
    }

    async clearNew(id: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE PaAudioProducts SET isNew = 0, updatedAt = NOW() WHERE id = ${id}
        `);
    }

    async markNotFound(externalId: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE PaAudioProducts
            SET siteStatus = 'not_found', status = 'archived', lastCheckedAt = NOW(), updatedAt = NOW()
            WHERE externalId = ${externalId}
        `);
    }

    async markAvailable(externalId: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE PaAudioProducts
            SET siteStatus = 'available', status = 'active', lastCheckedAt = NOW(), updatedAt = NOW()
            WHERE externalId = ${externalId}
        `);
    }

    async setLocalImages(id: string, localImages: string[], driveFolderId?: string): Promise<void> {
        if (driveFolderId) {
            await this.db.execute(sql`
                UPDATE PaAudioProducts
                SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1,
                    driveFolderId = ${driveFolderId}, updatedAt = NOW()
                WHERE id = ${id}
            `);
        } else {
            await this.db.execute(sql`
                UPDATE PaAudioProducts
                SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1, updatedAt = NOW()
                WHERE id = ${id}
            `);
        }
    }

    async getAllExternalIds(): Promise<string[]> {
        const rows = await this.db.execute(sql`
            SELECT externalId FROM PaAudioProducts WHERE status != 'blacklisted'
        `) as unknown as any[];
        return (rows[0] as any[]).map((r: any) => r.externalId);
    }
}
