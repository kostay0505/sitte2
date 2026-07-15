import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { Database } from '../../../database/schema';
import { SourceItemsRepository, SourceTab } from './source-items.repository';

const UPLOADS_BASE = '/var/www/touring-test/server/uploads';
const UPLOADS_PHOTOS = path.join(UPLOADS_BASE, 'фотографии');
const FALLBACK_CATEGORY_ID = '550e8400-e29b-41d4-a716-446655440001'; // «Без категории»
const MAIN_SELLER = process.env.MAIN_SELLER_USER_ID || '6737529504';

@Injectable()
export class SourceItemsService {
    private readonly logger = new Logger(SourceItemsService.name);

    constructor(
        private readonly repo: SourceItemsRepository,
        @Inject('DATABASE') private db: Database,
    ) {}

    list(opts: { tab: SourceTab; source?: string; search?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; page: number; limit: number }) {
        return this.repo.list(opts);
    }

    sourcesSummary() {
        return this.repo.sourcesSummary();
    }

    async findFull(id: string) {
        const row = await this.repo.findFull(id);
        if (!row) throw new NotFoundException('Source item not found');
        return row;
    }

    /**
     * «В базу»: создаёт черновик товара в `products` через единый путь (id=UUID, TEM из SkuCounter),
     * со ссылкой source_item_id. Файлы КОПИРУЮТСЯ (модель владения D1.1: у каждой строки свои файлы).
     * Черновик виден в админке товаров (moderation_status='moderation') и публикуется её штатным флоу.
     */
    async toBase(id: string): Promise<{ productId: string; customId: string }> {
        const existing = await this.repo.linkedProductId(id);
        if (existing) throw new ConflictException('Позиция уже в базе (есть связанный товар)');

        const si = await this.findFull(id);
        const extra = typeof si.extra === 'string' ? JSON.parse(si.extra || '{}') : si.extra || {};
        const images: string[] = Array.isArray(si.images)
            ? si.images
            : (() => { try { return JSON.parse(si.images || '[]'); } catch { return []; } })();

        const productId = crypto.randomUUID();
        const customId = await this.repo.getNextSku();

        // файлы: локальные копируем под новыми именами; если не скачаны — переносим внешние URL как есть
        const localImages: string[] = Array.isArray(extra?.local_images) ? extra.local_images : [];
        let productFiles: string[] = [];
        if (localImages.length) {
            for (let i = 0; i < localImages.length; i++) {
                const srcName = localImages[i];
                const srcPath = fs.existsSync(path.join(UPLOADS_BASE, srcName))
                    ? path.join(UPLOADS_BASE, srcName)
                    : path.join(UPLOADS_PHOTOS, srcName);
                if (!fs.existsSync(srcPath)) continue;
                const destName = `${customId.toLowerCase()}-${i + 1}${path.extname(srcName) || '.jpg'}`;
                await fs.promises.copyFile(srcPath, path.join(UPLOADS_BASE, destName));
                productFiles.push(destName);
            }
        }
        if (!productFiles.length) productFiles = images.filter(u => typeof u === 'string').slice(0, 10);

        // бренд: точное совпадение по имени из источника, иначе фолбэк «Другой»
        const brandName = (extra?.brand ?? '').toString().trim();
        let brandId: string | null = null;
        if (brandName) {
            const r = (await this.db.execute(sql`SELECT id FROM Brands WHERE LOWER(name) = LOWER(${brandName}) LIMIT 1`)) as unknown as any[];
            brandId = (r[0] as any[])[0]?.id ?? null;
        }
        if (!brandId) {
            const r = (await this.db.execute(sql`SELECT id FROM Brands WHERE slug = 'drugoy' OR name = 'Другой' LIMIT 1`)) as unknown as any[];
            brandId = (r[0] as any[])[0]?.id ?? null;
        }

        const title = (si.title || `Позиция ${si.source} #${si.external_id}`).slice(0, 255);
        const description = (si.description || si.title || '').slice(0, 5000);
        const price = si.price_amount != null ? String(si.price_amount) : '0';
        const currency = si.price_currency && /^[A-Z]{3}$/.test(si.price_currency) ? si.price_currency : 'EUR';

        await this.db.execute(sql`
            INSERT INTO products
                (id, custom_id, user_id, title, slug, brand_slug, price_amount, price_noncash_amount,
                 price_currency, preview, images, description, category_id, brand_id,
                 quantity, quantity_type, moderation_status, is_active, is_deleted, is_catalog,
                 source, external_id, source_item_id)
            VALUES
                (${productId}, ${customId}, ${MAIN_SELLER}, ${title}, NULL, NULL, ${price}, ${price},
                 ${currency}, ${productFiles[0] ?? ''}, ${JSON.stringify(productFiles)}, ${description},
                 ${FALLBACK_CATEGORY_ID}, ${brandId}, 1, 'piece', 'moderation', 1, 0, 1,
                 ${si.source}, ${si.external_id}, ${id})
        `);

        this.logger.log(`toBase: ${si.source}#${si.external_id} → продукт ${productId} (${customId})`);
        return { productId, customId };
    }

    async archive(id: string): Promise<void> {
        await this.findFull(id);
        await this.repo.setArchived(id, true);
    }

    async unarchive(id: string): Promise<void> {
        await this.repo.setArchived(id, false);
    }

    /**
     * В корзину (только вручную; авто-наполнение по смерти URL — следующее ТЗ сверки).
     * TODO(ТЗ-сверка, D2.5): авто-корзина — 3 подряд 404/410 по дням; только строки без связанного
     * товара (со связанным — сигнал в review_queue); предохранитель «весь сайт умер» паркует прогон;
     * ожившая до delete_after ссылка снимает trash_reason='url_dead'.
     */
    async trash(id: string): Promise<void> {
        const linked = await this.repo.linkedProductId(id);
        if (linked) {
            throw new BadRequestException(
                'У позиции есть связанный товар — в корзину нельзя. Используйте «Архив» или заблэклистите товар (origin_status=blacklisted).',
            );
        }
        await this.repo.setTrashed(id, 'manual');
    }

    async restore(id: string): Promise<void> {
        await this.repo.setTrashed(id, null);
    }

    /** «Удалить сейчас» — только из корзины; файлы уходят в file_cleanup_queue (D1.2) */
    async deleteNow(id: string): Promise<void> {
        const si = await this.findFull(id);
        if (!si.trashed_at) throw new BadRequestException('Физическое удаление — только из корзины');
        const linked = await this.repo.linkedProductId(id);
        if (linked) throw new BadRequestException('У позиции появился связанный товар — удаление запрещено');
        await this.repo.hardDelete(id);
        this.logger.log(`hardDelete: ${si.source}#${si.external_id} «${(si.title || '').slice(0, 50)}»`);
    }
}
