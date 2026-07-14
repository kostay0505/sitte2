import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';

export interface CuesaleProduct {
  id: string;
  externalId: string;
  url: string;
  title: string | null;
  description: string | null;
  price: string | null;
  currency: string | null;
  brand: string | null;
  stockQuantity: string | null;
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

function mapRow(r: any): CuesaleProduct {
  return {
    id: r.id,
    externalId: r.externalId,
    url: r.url,
    title: r.title ?? null,
    description: r.description ?? null,
    price: r.price ?? null,
    currency: r.currency ?? null,
    brand: r.brand ?? null,
    stockQuantity: r.stockQuantity ?? null,
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
export class CuesaleRepository {
  constructor(@Inject('DATABASE') private db: any) {}

  async findAll(status: 'active' | 'archived', page: number, limit: number, isNew?: boolean, notInBase?: boolean): Promise<{ items: CuesaleProduct[]; total: number }> {
    const offset = (page - 1) * limit;
    const extra = (isNew ? ' AND isNew = 1' : '') + (notInBase ? ' AND baseItemId IS NULL' : '');
    const rows = await this.db.execute(sql`
      SELECT * FROM CuesaleProducts
      WHERE status = ${status}${sql.raw(extra)}
      ORDER BY createdAt DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const countRows = await this.db.execute(sql`
      SELECT COUNT(*) as cnt FROM CuesaleProducts WHERE status = ${status}${sql.raw(extra)}
    `);
    const items = (rows[0] as any[]).map(mapRow);
    const total = Number((countRows[0] as any[])[0]?.cnt ?? 0);
    return { items, total };
  }

  async findById(id: string): Promise<CuesaleProduct | null> {
    const rows = await this.db.execute(sql`SELECT * FROM CuesaleProducts WHERE id = ${id} LIMIT 1`);
    const list = rows[0] as any[];
    return list.length > 0 ? mapRow(list[0]) : null;
  }

  async findByExternalId(externalId: string): Promise<CuesaleProduct | null> {
    const rows = await this.db.execute(sql`SELECT * FROM CuesaleProducts WHERE externalId = ${externalId} LIMIT 1`);
    const list = rows[0] as any[];
    return list.length > 0 ? mapRow(list[0]) : null;
  }

  async getAllExternalIds(): Promise<Set<string>> {
    const rows = await this.db.execute(sql`SELECT externalId FROM CuesaleProducts`);
    return new Set((rows[0] as any[]).map((r: any) => r.externalId));
  }

  async create(data: Omit<CuesaleProduct, 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO CuesaleProducts
        (id, externalId, url, title, description, price, currency, brand, stockQuantity, images, status, siteStatus, isNew, imagesDownloaded, localImages, driveFolderId, lastCheckedAt, baseItemId)
      VALUES
        (${data.id}, ${data.externalId}, ${data.url}, ${data.title}, ${data.description},
         ${data.price}, ${data.currency}, ${data.brand}, ${data.stockQuantity},
         ${data.images ? JSON.stringify(data.images) : null},
         ${data.status}, ${data.siteStatus}, ${data.isNew ? 1 : 0}, 0, NULL, NULL, NOW(), NULL)
    `);
  }

  async update(externalId: string, data: Partial<CuesaleProduct>): Promise<void> {
    const conditions: ReturnType<typeof sql>[] = [];
    if (data.title !== undefined) conditions.push(sql`title = ${data.title}`);
    if (data.description !== undefined) conditions.push(sql`description = ${data.description}`);
    if (data.price !== undefined) conditions.push(sql`price = ${data.price}`);
    if (data.currency !== undefined) conditions.push(sql`currency = ${data.currency}`);
    if (data.brand !== undefined) conditions.push(sql`brand = ${data.brand}`);
    if (data.stockQuantity !== undefined) conditions.push(sql`stockQuantity = ${data.stockQuantity}`);
    if (data.images !== undefined) conditions.push(sql`images = ${data.images ? JSON.stringify(data.images) : null}`);
    if (data.siteStatus !== undefined) conditions.push(sql`siteStatus = ${data.siteStatus}`);
    conditions.push(sql`lastCheckedAt = NOW()`);
    if (conditions.length === 0) return;
    await this.db.execute(sql`UPDATE CuesaleProducts SET ${sql.join(conditions, sql`, `)} WHERE externalId = ${externalId}`);
  }

  async setStatus(id: string, status: 'active' | 'archived' | 'blacklisted'): Promise<void> {
    await this.db.execute(sql`UPDATE CuesaleProducts SET status = ${status} WHERE id = ${id}`);
    if (status === 'archived' || status === 'blacklisted') {
      await this.db.execute(sql`UPDATE ParsedBase SET status = 'blacklisted', updatedAt = NOW() WHERE source = 'cuesale' AND sourceId = ${id} AND productId IS NOT NULL`);
            await this.db.execute(sql`DELETE FROM ParsedBase WHERE source = 'cuesale' AND sourceId = ${id} AND productId IS NULL`);
    }
  }

  async clearNew(id: string): Promise<void> {
    await this.db.execute(sql`UPDATE CuesaleProducts SET isNew = 0 WHERE id = ${id}`);
  }

  async setLocalImages(id: string, localImages: string[], driveFolderId: string | null): Promise<void> {
    await this.db.execute(sql`
      UPDATE CuesaleProducts
      SET imagesDownloaded = 1, localImages = ${JSON.stringify(localImages)}, driveFolderId = ${driveFolderId}
      WHERE id = ${id}
    `);
  }

  async markNotFound(externalId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE CuesaleProducts
      SET siteStatus = 'not_found', status = 'archived', lastCheckedAt = NOW(), updatedAt = NOW()
      WHERE externalId = ${externalId} AND status != 'blacklisted'
    `);
    await this.db.execute(sql`
      DELETE FROM ParsedBase
      WHERE source = 'cuesale'
        AND sourceId IN (SELECT id FROM CuesaleProducts WHERE externalId = ${externalId})
        AND productId IS NULL
    `);
  }

  async markAvailable(externalId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE CuesaleProducts
      SET siteStatus = 'available', status = 'active', lastCheckedAt = NOW(), updatedAt = NOW()
      WHERE externalId = ${externalId} AND status = 'archived' AND siteStatus = 'not_found'
    `);
  }

  async setBaseItemId(id: string, sku: string): Promise<void> {
    await this.db.execute(sql`UPDATE CuesaleProducts SET baseItemId = ${sku} WHERE id = ${id}`);
  }
}
