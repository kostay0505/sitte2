import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

export interface JsFranceProduct {
    id: string;
    externalId: string;
    url: string;
    title: string | null;
    description: string | null;
    priceHt: string | null;
    priceTtc: string | null;
    currency: string;
    brand: string | null;
    condition: string | null;
    sku: string | null;
    categoryName: string | null;
    images: string[] | null;
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

function mapRow(r: any): JsFranceProduct {
    return {
        id: r.id,
        externalId: r.externalId,
        url: r.url,
        title: r.title ?? null,
        description: r.description ?? null,
        priceHt: r.priceHt ?? null,
        priceTtc: r.priceTtc ?? null,
        currency: r.currency ?? 'EUR',
        brand: r.brand ?? null,
        condition: r.condition ?? null,
        sku: r.sku ?? null,
        categoryName: r.categoryName ?? null,
        images: r.images ? (typeof r.images === 'string' ? JSON.parse(r.images) : r.images) : null,
        status: r.status ?? 'active',
        siteStatus: r.siteStatus ?? 'available',
        isNew: !!r.isNew,
        imagesDownloaded: !!r.imagesDownloaded,
        localImages: r.localImages ? (typeof r.localImages === 'string' ? JSON.parse(r.localImages) : r.localImages) : null,
        driveFolderId: r.driveFolderId ?? null,
        lastCheckedAt: r.lastCheckedAt ?? null,
        baseItemId: r.baseItemId ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    };
}

@Injectable()
export class JsFranceRepository {
    constructor(@Inject('DATABASE') private db: any) {}

    async findAll(
        status: 'active' | 'archived',
        page: number,
        limit: number,
        isNew?: boolean,
        notInBase?: boolean,
    ): Promise<{ items: JsFranceProduct[]; total: number }> {
        const offset = (page - 1) * limit;
        const extra = (isNew ? ' AND isNew = 1' : '') + (notInBase ? ' AND baseItemId IS NULL' : '');
        const rows = await this.db.execute(sql`
            SELECT * FROM JsFranceProducts
            WHERE status = ${status}${sql.raw(extra)}
            ORDER BY createdAt DESC
            LIMIT ${limit} OFFSET ${offset}
        `);
        const countRows = await this.db.execute(sql`
            SELECT COUNT(*) as cnt FROM JsFranceProducts WHERE status = ${status}${sql.raw(extra)}
        `);
        return {
            items: (rows[0] as any[]).map(mapRow),
            total: Number((countRows[0] as any[])[0]?.cnt ?? 0),
        };
    }

    async findById(id: string): Promise<JsFranceProduct | null> {
        const rows = await this.db.execute(sql`SELECT * FROM JsFranceProducts WHERE id = ${id} LIMIT 1`);
        const list = rows[0] as any[];
        return list.length > 0 ? mapRow(list[0]) : null;
    }

    async findByExternalId(externalId: string): Promise<JsFranceProduct | null> {
        const rows = await this.db.execute(sql`SELECT * FROM JsFranceProducts WHERE externalId = ${externalId} LIMIT 1`);
        const list = rows[0] as any[];
        return list.length > 0 ? mapRow(list[0]) : null;
    }

    async getAllExternalIds(): Promise<Set<string>> {
        const rows = await this.db.execute(sql`SELECT externalId FROM JsFranceProducts WHERE status != 'blacklisted'`);
        return new Set((rows[0] as any[]).map((r: any) => r.externalId));
    }

    async create(data: {
        id: string;
        externalId: string;
        url: string;
        title?: string | null;
        description?: string | null;
        priceHt?: string | null;
        priceTtc?: string | null;
        brand?: string | null;
        condition?: string | null;
        sku?: string | null;
        categoryName?: string | null;
        images?: string[] | null;
    }): Promise<void> {
        await this.db.execute(sql`
            INSERT INTO JsFranceProducts
                (id, externalId, url, title, description, priceHt, priceTtc, currency,
                 brand, \`condition\`, sku, categoryName, images,
                 status, siteStatus, isNew, imagesDownloaded, baseItemId, createdAt, updatedAt)
            VALUES
                (${data.id}, ${data.externalId}, ${data.url},
                 ${data.title ?? null}, ${data.description ?? null},
                 ${data.priceHt ?? null}, ${data.priceTtc ?? null}, 'EUR',
                 ${data.brand ?? null}, ${data.condition ?? null},
                 ${data.sku ?? null}, ${data.categoryName ?? null},
                 ${data.images ? JSON.stringify(data.images) : null},
                 'active', 'available', 1, 0, NULL, NOW(), NOW())
        `);
    }

    async update(externalId: string, data: Partial<Pick<JsFranceProduct, 'priceHt' | 'priceTtc' | 'siteStatus' | 'condition' | 'sku'>>): Promise<void> {
        const parts: ReturnType<typeof sql>[] = [];
        if (data.priceHt !== undefined) parts.push(sql`priceHt = ${data.priceHt}`);
        if (data.priceTtc !== undefined) parts.push(sql`priceTtc = ${data.priceTtc}`);
        if (data.siteStatus !== undefined) parts.push(sql`siteStatus = ${data.siteStatus}`);
        if (data.condition !== undefined) parts.push(sql`\`condition\` = ${data.condition}`);
        if (data.sku !== undefined) parts.push(sql`sku = ${data.sku}`);
        parts.push(sql`lastCheckedAt = NOW()`);
        await this.db.execute(sql`UPDATE JsFranceProducts SET ${sql.join(parts, sql`, `)} WHERE externalId = ${externalId}`);
    }

    async setStatus(id: string, status: 'active' | 'archived' | 'blacklisted'): Promise<void> {
        await this.db.execute(sql`UPDATE JsFranceProducts SET status = ${status}, updatedAt = NOW() WHERE id = ${id}`);
        if (status === 'blacklisted') {
            await this.db.execute(sql`UPDATE ParsedBase SET status = 'blacklisted', updatedAt = NOW() WHERE source = 'jsfrance' AND sourceId = ${id} AND productId IS NOT NULL`);
            await this.db.execute(sql`DELETE FROM ParsedBase WHERE source = 'jsfrance' AND sourceId = ${id} AND productId IS NULL`);
        }
    }

    async clearNew(id: string): Promise<void> {
        await this.db.execute(sql`UPDATE JsFranceProducts SET isNew = 0, updatedAt = NOW() WHERE id = ${id}`);
    }

    async setLocalImages(id: string, localImages: string[], driveFolderId: string | null): Promise<void> {
        await this.db.execute(sql`
            UPDATE JsFranceProducts
            SET imagesDownloaded = 1, localImages = ${JSON.stringify(localImages)}, driveFolderId = ${driveFolderId}, updatedAt = NOW()
            WHERE id = ${id}
        `);
    }

    async markNotFound(externalId: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE JsFranceProducts
            SET siteStatus = 'not_found', status = 'archived', lastCheckedAt = NOW(), updatedAt = NOW()
            WHERE externalId = ${externalId} AND status != 'blacklisted'
        `);
    }

    async markAvailable(externalId: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE JsFranceProducts
            SET siteStatus = 'available', status = 'active', lastCheckedAt = NOW(), updatedAt = NOW()
            WHERE externalId = ${externalId} AND status = 'archived'
        `);
    }

    async setBaseItemId(id: string, sku: string): Promise<void> {
        await this.db.execute(sql`UPDATE JsFranceProducts SET baseItemId = ${sku}, updatedAt = NOW() WHERE id = ${id}`);
    }
}
