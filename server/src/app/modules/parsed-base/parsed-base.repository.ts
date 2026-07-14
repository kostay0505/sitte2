import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database } from '../../../database/schema';

export interface ParsedBaseItem {
    id: string;
    sku: string;
    source: string;
    sourceId: string;
    title: string;
    customTitle: string | null;
    description: string | null;
    price: string | null;
    currency: string | null;
    priceCash: string | null;
    priceNonCash: string | null;
    siteCurrency: string | null;
    brandId: string | null;
    brand: string | null;
    model: string | null;
    isSet: boolean;
    skuSource: string | null;
    condition: string | null;
    availability: string | null;
    categories: string | null;
    images: string[] | null;
    localImages: string[] | null;
    imagesDownloaded: boolean;
    url: string | null;
    notes: string | null;
    status: string;
    isEdited: boolean;
    categoryId: string | null;
    productId: string | null;
    modelId: string | null;
    sentToSheets: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface UpdateBaseItemDto {
    customTitle?: string | null;
    brandId?: string | null;
    brand?: string | null;
    model?: string | null;
    modelId?: string | null;
    isSet?: boolean;
    description?: string | null;
    priceCash?: string | null;
    priceNonCash?: string | null;
    siteCurrency?: string | null;
    notes?: string | null;
    categoryId?: string | null;
}

export interface BulkUpdateDto {
    brandId?: string | null;
    brand?: string | null;
    categoryId?: string | null;
    customTitle?: string | null;
    notes?: string | null;
    priceCash?: string | null;
    priceNonCash?: string | null;
    status?: string | null;
}

const SOURCE_TABLE: Record<string, string> = {
    'arrius': 'ArriusProducts',
    'alv-france': 'AlvFranceProducts',
    'avls': 'AvlsProducts',
    'pa-audio': 'PaAudioProducts',
    'soundtrade': 'SoundtradeProducts',
    'deltalive': 'DeltaLiveProducts',
    'cuesale': 'CuesaleProducts',
    'kinxsound': 'KinxsoundProducts',
    'kinxconnect': 'KinxConnectListings',
    'gearwise': 'GearwiseProducts',
    'usedfull': 'UsedfullProducts',
};

@Injectable()
export class ParsedBaseRepository {
    constructor(
        @Inject('DATABASE') private readonly db: Database,
    ) { }

    async findAll(page: number, limit: number, source?: string, search?: string, filled?: string): Promise<{ items: ParsedBaseItem[]; total: number }> {
        const offset = (page - 1) * limit;

        // Build static WHERE conditions (source, filled — safe values)
        const staticConds: string[] = [];
        if (source) staticConds.push(`source = '${source.replace(/'/g, "''")}'`);
        if (filled === 'filled') staticConds.push('isEdited = 1');
        if (filled === 'unfilled') staticConds.push('isEdited = 0');
        const staticAnd = staticConds.length ? staticConds.join(' AND ') + ' AND ' : '';
        const staticWhere = staticConds.length ? 'WHERE ' + staticConds.join(' AND ') : '';

        let countRes: any;
        let result: any;

        if (search?.trim()) {
            const s = `%${search.trim()}%`;
            countRes = await this.db.execute(
                sql`SELECT COUNT(*) as total FROM ParsedBase WHERE ${sql.raw(staticAnd)}(title LIKE ${s} OR description LIKE ${s})`
            );
            result = await this.db.execute(
                sql`SELECT * FROM ParsedBase WHERE ${sql.raw(staticAnd)}(title LIKE ${s} OR description LIKE ${s}) ORDER BY isEdited ASC, createdAt DESC LIMIT ${limit} OFFSET ${offset}`
            );
        } else {
            countRes = await this.db.execute(
                sql`SELECT COUNT(*) as total FROM ParsedBase ${sql.raw(staticWhere)}`
            );
            result = await this.db.execute(
                sql`SELECT * FROM ParsedBase ${sql.raw(staticWhere)} ORDER BY isEdited ASC, createdAt DESC LIMIT ${limit} OFFSET ${offset}`
            );
        }

        const total = Number(((countRes as any[])[0] as any[])[0]?.total ?? 0);
        if (!Array.isArray((result as any[])[0])) return { items: [], total };
        return { items: ((result as any[])[0] as any[]).map(r => this.mapRow(r)), total };
    }

    async findById(id: string): Promise<ParsedBaseItem | null> {
        const result = await this.db.execute(sql`
            SELECT * FROM ParsedBase WHERE id = ${id} LIMIT 1
        `) as unknown as any[];
        if (!Array.isArray(result[0])) return null;
        const row = (result[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async findBySourceId(source: string, sourceId: string): Promise<ParsedBaseItem | null> {
        const result = await this.db.execute(sql`
            SELECT * FROM ParsedBase WHERE source = ${source} AND sourceId = ${sourceId} LIMIT 1
        `) as unknown as any[];
        if (!Array.isArray(result[0])) return null;
        const row = (result[0] as any[])[0];
        return row ? this.mapRow(row) : null;
    }

    async getNextSku(): Promise<string> {
        // Атомарный счётчик SkuCounter — исключает гонку MAX+1 между PM2-воркерами
        const result = await this.db.execute(sql`
            UPDATE SkuCounter SET nextVal = LAST_INSERT_ID(nextVal + 1) WHERE id = 1
        `) as unknown as any[];
        const nextNum = Number((result[0] as any)?.insertId ?? 0);
        if (!nextNum) throw new Error('SkuCounter is not initialized');
        return `TEM-${String(nextNum).padStart(6, '0')}`;
    }

    async addFromParser(source: string, sourceId: string): Promise<ParsedBaseItem> {
        const existing = await this.findBySourceId(source, sourceId);
        if (existing) {
            const table = SOURCE_TABLE[source];
            if (table) {
                await this.db.execute(sql`
                    UPDATE ${sql.raw(table)} SET baseItemId = ${existing.sku} WHERE id = ${sourceId} AND baseItemId IS NULL
                `);
            }
            return existing;
        }

        const table = SOURCE_TABLE[source];
        if (!table) throw new Error(`Unknown source: ${source}`);

        const itemRes = await this.db.execute(sql`
            SELECT * FROM ${sql.raw(table)} WHERE id = ${sourceId} LIMIT 1
        `) as unknown as any[];

        if (!Array.isArray(itemRes[0]) || !(itemRes[0] as any[])[0]) {
            throw new Error(`Item not found in ${table}: ${sourceId}`);
        }
        const item = (itemRes[0] as any[])[0];

        const sku = await this.getNextSku();
        const id = crypto.randomUUID();

        const images = item.images
            ? (typeof item.images === 'string' ? item.images : JSON.stringify(item.images))
            : null;

        await this.db.execute(sql`
            INSERT INTO ParsedBase
                (id, sku, source, sourceId, title, description, price, currency, brandId, brand, model, isSet,
                 skuSource, \`condition\`, availability, categories, images, localImages, imagesDownloaded,
                 url, notes, status, isEdited, categoryId, productId, createdAt, updatedAt)
            VALUES (
                ${id}, ${sku}, ${source}, ${sourceId},
                ${item.title ?? ''},
                ${item.description ?? null},
                ${item.price ?? null},
                ${item.currency ?? null},
                NULL,
                ${item.brand ?? null},
                NULL, 0,
                ${item.sku ?? null},
                ${item.condition ?? null},
                ${item.availability ?? null},
                ${item.categories ?? null},
                ${images},
                NULL, 0,
                ${item.url ?? null},
                NULL,
                'active', 0,
                NULL, NULL,
                NOW(), NOW()
            )
        `);

        await this.db.execute(sql`
            UPDATE ${sql.raw(table)} SET baseItemId = ${sku}, isNew = 0 WHERE id = ${sourceId}
        `);

        return (await this.findById(id))!;
    }

    async update(id: string, data: UpdateBaseItemDto): Promise<ParsedBaseItem | null> {
        await this.db.execute(sql`
            UPDATE ParsedBase SET
                customTitle  = ${data.customTitle ?? null},
                brandId      = ${data.brandId ?? null},
                brand        = ${data.brand ?? null},
                model        = ${data.model ?? null},
                isSet        = ${data.isSet ? 1 : 0},
                description  = ${data.description ?? null},
                priceCash    = ${data.priceCash ?? null},
                priceNonCash = ${data.priceNonCash ?? null},
                siteCurrency = ${data.siteCurrency ?? null},
                notes        = ${data.notes ?? null},
                categoryId   = ${data.categoryId ?? null},
                modelId      = ${data.modelId ?? null},
                isEdited     = 1,
                updatedAt    = NOW()
            WHERE id = ${id}
        `);
        return this.findById(id);
    }

    async setLocalImages(id: string, localImages: string[]): Promise<void> {
        await this.db.execute(sql`
            UPDATE ParsedBase
            SET localImages = ${JSON.stringify(localImages)}, imagesDownloaded = 1, updatedAt = NOW()
            WHERE id = ${id}
        `);
    }

    async setProductId(id: string, productId: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE ParsedBase SET productId = ${productId}, updatedAt = NOW() WHERE id = ${id}
        `);
    }

    async setSentToSheets(id: string): Promise<void> {
        await this.db.execute(sql`
            UPDATE ParsedBase SET sentToSheets = 1, updatedAt = NOW() WHERE id = ${id}
        `);
    }

    async createProduct(data: {
        sku: string;
        adminUserId: string;
        title: string;
        customTitle: string | null;
        description: string | null;
        price: string | null;
        priceCash: string | null;
        priceNonCash: string | null;
        currency: string | null;
        siteCurrency: string | null;
        brandId: string;
        categoryId: string;
        localImages: string[];
        isSet: boolean;
    }): Promise<string> {
        const productId = crypto.randomUUID(); // единый формат id: UUID для всех источников (реструктуризация, Фаза 6)
        const productTitle = (data.customTitle || data.title).trim();
        const slug = await this.generateUniqueSlug(productTitle);
        const brandSlug = await this.getBrandSlug(data.brandId);

        const userId = '6737529504';
        const fallbackPrice = parseFloat(data.price || '0') || 0;
        const priceCash = parseFloat(data.priceCash || '0') || fallbackPrice;
        const priceNonCash = parseFloat(data.priceNonCash || '0') || fallbackPrice;
        const VALID_CURRENCIES = ['RUB', 'USD', 'EUR', 'GBP'];
        const rawCurrency = data.siteCurrency || data.currency;
        const currency = rawCurrency && VALID_CURRENCIES.includes(rawCurrency.toUpperCase())
            ? rawCurrency.toUpperCase()
            : 'USD';

        const preview = data.localImages[0];
        const files = JSON.stringify(data.localImages);
        const description = (data.description || data.title).slice(0, 5000);
        const quantityType = data.isSet ? 'set' : 'piece';

        await this.db.execute(sql`
            INSERT INTO Products
                (id, customId, userId, name, slug, brandSlug, priceCash, priceNonCash, currency,
                 preview, files, description, categoryId, brandId,
                 quantity, quantityType, status, isActive, isDeleted, createdAt, updatedAt)
            VALUES
                (${productId}, ${data.sku}, ${userId}, ${productTitle}, ${slug}, ${brandSlug},
                 ${priceCash.toString()}, ${priceNonCash.toString()}, ${currency},
                 ${preview}, ${files}, ${description}, ${data.categoryId}, ${data.brandId},
                 1, ${quantityType}, 'approved', 1, 0, NOW(), NOW())
        `);

        return productId;
    }

    async delete(id: string): Promise<void> {
        const item = await this.findById(id);
        if (item?.productId) {
            throw new Error('Позиция опубликована как товар — удаление из базы запрещено, сначала снимите публикацию');
        }
        if (item) {
            const table = SOURCE_TABLE[item.source];
            if (table) {
                await this.db.execute(sql`
                    UPDATE ${sql.raw(table)} SET baseItemId = NULL WHERE id = ${item.sourceId}
                `);
            }
        }
        await this.db.execute(sql`DELETE FROM ParsedBase WHERE id = ${id}`);
    }

    async getSourceItem(source: string, sourceId: string): Promise<any | null> {
        const table = SOURCE_TABLE[source];
        if (!table) return null;
        const result = await this.db.execute(sql`
            SELECT * FROM ${sql.raw(table)} WHERE id = ${sourceId} LIMIT 1
        `) as unknown as any[];
        if (!Array.isArray(result[0])) return null;
        const row = (result[0] as any[])[0];
        if (!row) return null;
        return {
            ...row,
            images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : null,
            localImages: row.localImages ? (typeof row.localImages === 'string' ? JSON.parse(row.localImages) : row.localImages) : null,
        };
    }

    private async generateUniqueSlug(title: string): Promise<string> {
        const base = this.slugify(title);
        const suffix = crypto.randomUUID().split('-')[0];
        return `${base}-${suffix}`;
    }

    private slugify(str: string): string {
        const map: Record<string, string> = {
            'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
            'и':'i','й':'j','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
            'с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh',
            'щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
        };
        return str.toLowerCase()
            .split('').map(c => map[c] ?? c).join('')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
    }

    private async getBrandSlug(brandId: string): Promise<string> {
        const res = await this.db.execute(sql`
            SELECT name FROM Brands WHERE id = ${brandId} LIMIT 1
        `) as unknown as any[];
        const name: string = (res[0] as any[])[0]?.name ?? '';
        return this.slugify(name);
    }

    async bulkUpdate(ids: string[], data: BulkUpdateDto): Promise<number> {
        if (ids.length === 0) return 0;
        const idList = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const v = (x: string | null | undefined) => x == null ? 'NULL' : `'${String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
        const parts: string[] = ['updatedAt = NOW()'];
        if ('brandId' in data) parts.push(`brandId = ${v(data.brandId)}`);
        if ('brand' in data) parts.push(`brand = ${v(data.brand)}`);
        if ('categoryId' in data) parts.push(`categoryId = ${v(data.categoryId)}`);
        if ('customTitle' in data) parts.push(`customTitle = ${v(data.customTitle)}`);
        if ('notes' in data) parts.push(`notes = ${v(data.notes)}`);
        if ('priceCash' in data) parts.push(`priceCash = ${v(data.priceCash)}`);
        if ('priceNonCash' in data) parts.push(`priceNonCash = ${v(data.priceNonCash)}`);
        if ('status' in data) parts.push(`status = ${v(data.status)}`);
        const result = await this.db.execute(sql`
            UPDATE ParsedBase SET ${sql.raw(parts.join(', '))} WHERE id IN (${sql.raw(idList)})
        `);
        return (result[0] as any)?.affectedRows ?? 0;
    }

    async getSourceCounts(): Promise<Array<{ source: string; total: number; unfilled: number; published: number }>> {
        const result = await this.db.execute(sql`
            SELECT source,
                COUNT(*) as total,
                SUM(CASE WHEN isEdited = 0 THEN 1 ELSE 0 END) as unfilled,
                SUM(CASE WHEN productId IS NOT NULL THEN 1 ELSE 0 END) as published
            FROM ParsedBase GROUP BY source ORDER BY total DESC
        `) as unknown as any[];
        if (!Array.isArray(result[0])) return [];
        return (result[0] as any[]).map(r => ({
            source: r.source,
            total: Number(r.total),
            unfilled: Number(r.unfilled),
            published: Number(r.published),
        }));
    }

    private mapRow(row: any): ParsedBaseItem {
        return {
            ...row,
            images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : null,
            localImages: row.localImages ? (typeof row.localImages === 'string' ? JSON.parse(row.localImages) : row.localImages) : null,
            isSet: Boolean(row.isSet),
            isEdited: Boolean(row.isEdited),
            imagesDownloaded: Boolean(row.imagesDownloaded),
            customTitle: row.customTitle ?? null,
            priceCash: row.priceCash ?? null,
            priceNonCash: row.priceNonCash ?? null,
            siteCurrency: row.siteCurrency ?? null,
            categoryId: row.categoryId ?? null,
            productId: row.productId ?? null,
            modelId: row.modelId ?? null,
        };
    }
}
