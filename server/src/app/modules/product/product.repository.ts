import { Injectable, Inject, forwardRef, ConflictException } from '@nestjs/common';
import { eq, and, sql, not, inArray } from 'drizzle-orm';
import { Product, ProductShort, products } from './schemas/products';
import { Database } from '../../../database/schema';
import { GetProductsDto, OrderBy, SortDirection } from './dto/get-products.dto';
import { CurrencyList, ProductStatus, QuantityType } from './types/enums';
import { viewedProducts } from '../viewed-product/schemas/viewed-products';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdminUpdateProductDto } from './dto/admin-update-product.dto';
import { SqlQueryResult } from '../../../database/utils';
import { categories, CategoryShort } from '../category/schemas/categories';
import { brands, BrandShort } from '../brand/schemas/brands';
import { users, UserShort } from '../user/schemas/users';
import { UserRepository } from '../user/user.repository';
import { cities } from '../city/schemas/cities';
import { countries } from '../country/schemas/countries';
import { favoriteProducts } from '../favorite-product/schemas/favorite-products';
import { CategoryRepository } from '../category/category.repository';
import { HrefService } from '../../services/href/href.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';

function toSlug(str: string): string {
  const ruMap: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
    'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh',
    'щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  return str.toLowerCase()
    .split('').map(c => ruMap[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export interface ProductRow {
  id: string;
  customId?: string | null;
  name: string;
  slug?: string | null;
  brandSlug?: string | null;
  priceCash: string;
  priceNonCash: string;
  currency: string;
  preview: string;
  files: string;
  description: string;
  quantity: number;
  quantityType: string;
  status: string;
  isActive: boolean;
  isDeleted: boolean;
  productFavorite_isActive: boolean;
  category_id: string;
  category_name: string;
  brand_id: string;
  brand_name: string;
  brand_photo: string;
  brand_contact: string;
  brand_description: string;
  user_tgId: string;
  user_firstName: string;
  user_lastName: string;
  user_username: string;
  user_photoUrl: string;
  user_phone: string;
  user_email: string;
  city_id: string;
  city_name: string;
  country_id: string;
  country_name: string;
  createdAt: Date;
  viewCount?: number;
}

export interface ProductShortRow {
  id: string;
  name: string;
  slug?: string | null;
  brandSlug?: string | null;
  priceCash: string;
  currency: string;
  preview: string;
  description: string;
  status: string;
  productFavorite_isActive: boolean;
  createdAt: Date;
  url?: string;
  categoryId?: string | null;
}

@Injectable()
export class ProductRepository {
  constructor(
    @Inject('DATABASE') private readonly db: Database,
    @Inject(forwardRef(() => UserRepository))
    private readonly userRepository: UserRepository,
    private readonly categoryRepository: CategoryRepository,
    @Inject(forwardRef(() => HrefService))
    private readonly hrefService: HrefService,
    private readonly exchangeRateService: ExchangeRateService,
  ) { }

  private async toRubStr(amount: string, currency: string): Promise<string | null> {
    if (!amount || currency === 'RUB') return null;
    const n = parseFloat(amount);
    if (isNaN(n) || n === 0) return null;
    const rub = await this.exchangeRateService.convertToRub(n, currency);
    return String(rub);
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = toSlug(name);
    let slug = base || 'product';
    let n = 2;
    while (true) {
      const existing = (await this.db.execute(
        sql`SELECT id FROM ${products} WHERE slug = ${slug} LIMIT 1`
      )) as SqlQueryResult<{ id: string }>;
      if (!Array.isArray(existing[0]) || existing[0].length === 0) break;
      slug = `${base}-${n++}`;
    }
    return slug;
  }

  private async getViewCount(productId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`COUNT(DISTINCT ${viewedProducts.userId})` })
      .from(viewedProducts)
      .where(eq(viewedProducts.productId, productId));

    const rawCount = result?.count || 0;

    if (rawCount <= 10) return Math.round(rawCount * 2);
    if (rawCount <= 20) return Math.round(rawCount * 1.7);
    if (rawCount <= 50) return Math.round(rawCount * 1.5);
    return Math.round(rawCount * 1.3);
  }

  private async getBatchViewCounts(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        productId: viewedProducts.productId,
        count: sql<number>`COUNT(DISTINCT ${viewedProducts.userId})`
      })
      .from(viewedProducts)
      .where(inArray(viewedProducts.productId, productIds))
      .groupBy(viewedProducts.productId);

    const map = new Map<string, number>();
    for (const row of rows) {
      const rawCount = row.count || 0;
      let inflated: number;
      if (rawCount <= 10) inflated = Math.round(rawCount * 2);
      else if (rawCount <= 20) inflated = Math.round(rawCount * 1.7);
      else if (rawCount <= 50) inflated = Math.round(rawCount * 1.5);
      else inflated = Math.round(rawCount * 1.3);
      map.set(row.productId, inflated);
    }
    return map;
  }

  async mapToProduct(row: ProductRow): Promise<Product> {
    const category: CategoryShort | null = row.category_id

      ? {
        id: row.category_id,
        name: row.category_name
      }
      : null;

    const brand: BrandShort | null = row.brand_id
      ? {
        id: row.brand_id,
        name: row.brand_name,
        slug: null,
        contact: row.brand_contact,
        photo: row.brand_photo,
        description: row.brand_description
      }
      : null;

    const user: UserShort | null = this.userRepository.mapToUserShort({
      tgId: row.user_tgId,
      username: row.user_username,
      firstName: row.user_firstName,
      lastName: row.user_lastName,
      photoUrl: row.user_photoUrl,
      email: row.user_email,
      phone: row.user_phone,
      city_id: row.city_id,
      city_name: row.city_name,
      country_id: row.country_id,
      country_name: row.country_name
    });

    const createdAt = new Date(row.createdAt);
    const isNew = Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000;

    const url = await this.hrefService.generateShareLink(
      row.id,
      'product'
    );

    const [priceRub, priceNonCashRub] = await Promise.all([
      this.toRubStr(row.priceCash, row.currency),
      this.toRubStr(row.priceNonCash, row.currency),
    ]);

    return {
      id: row.id,
      customId: row.customId ?? null,
      name: row.name,
      slug: row.slug ?? null,
      brandSlug: row.brandSlug ?? (row.brand_name ? toSlug(row.brand_name) : null),
      priceCash: row.priceCash,
      priceRub,
      priceNonCash: row.priceNonCash,
      priceNonCashRub,
      currency: row.currency as CurrencyList,
      preview: row.preview,
      files:
        typeof row.files === 'string' ? JSON.parse(row.files) : row.files || [],
      description: row.description,
      quantity: row.quantity,
      quantityType: row.quantityType as QuantityType,
      status: row.status as ProductStatus,
      isActive: row.isActive,
      isDeleted: row.isDeleted,
      isNew,
      isFavorite: row.productFavorite_isActive,
      category,
      brand,
      user,
      url,
      viewCount: undefined
    };
  }

  async mapToProductShort(row: ProductShortRow): Promise<ProductShort> {
    const createdAt = new Date(row.createdAt);
    const isNew = Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000;

    const url = await this.hrefService.generateShareLink(
      row.id,
      'product'
    );

    const priceRub = await this.toRubStr(row.priceCash, row.currency);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug ?? null,
      brandSlug: row.brandSlug ?? null,
      priceCash: row.priceCash,
      priceRub,
      currency: row.currency as CurrencyList,
      preview: row.preview,
      description: row.description,
      status: row.status as ProductStatus,
      isNew,
      isFavorite: row.productFavorite_isActive,
      url,
      categoryId: row.categoryId ?? null,
    };
  }

  async create(
    dto: CreateProductDto & { userId: string; status: ProductStatus }
  ): Promise<Product> {
    const slug = await this.generateUniqueSlug(dto.name);
    const [brandRow] = await this.db
      .select({ name: brands.name })
      .from(brands)
      .where(eq(brands.id, dto.brandId));
    const brandSlug = brandRow ? toSlug(brandRow.name) : '';

    const data = {
      ...dto,
      id: crypto.randomUUID(),
      slug,
      brandSlug,
      userId: dto.userId,
      priceCash: dto.priceCash.toString(),
      priceNonCash: dto.priceNonCash.toString(),
      files: JSON.stringify(dto.files),
      status: dto.status
    };
    // Пишем напрямую в новую таблицу `products` (легаси-имя Products — read-view,
    // INSERT через него невозможен). visibility_status пересчитывает триггер БД.
    await this.db.execute(sql`
      INSERT INTO products
        (id, custom_id, user_id, title, slug, brand_slug, price_amount, price_noncash_amount,
         price_currency, preview, images, description, category_id, brand_id,
         quantity, quantity_type, moderation_status, is_active, is_deleted, is_catalog)
      VALUES
        (${data.id}, ${(dto as { customId?: string }).customId ?? null}, ${data.userId}, ${dto.name},
         ${slug}, ${brandSlug}, ${data.priceCash}, ${data.priceNonCash}, ${dto.currency},
         ${dto.preview}, ${data.files}, ${dto.description}, ${dto.categoryId}, ${dto.brandId},
         ${dto.quantity}, ${dto.quantityType}, ${data.status}, 1, 0, 1)
    `);

    const result = await this.findById(data.id);

    if (!result) {
      throw new Error('Product not created');
    }

    return result;
  }

  /** SET-части UPDATE для новой таблицы `products`; undefined-поля пропускаются (как в drizzle) */
  private buildProductSetParts(dto: Partial<AdminUpdateProductDto> & { status?: string; isActive?: boolean }) {
    const pairs: Array<[string, unknown]> = [
      ['title', dto.name],
      ['description', dto.description],
      ['price_amount', dto.priceCash !== undefined ? dto.priceCash.toString() : undefined],
      ['price_noncash_amount', dto.priceNonCash !== undefined ? dto.priceNonCash.toString() : undefined],
      ['price_currency', dto.currency],
      ['category_id', dto.categoryId],
      ['brand_id', dto.brandId],
      ['quantity', dto.quantity],
      ['quantity_type', dto.quantityType],
      ['preview', dto.preview],
      ['images', dto.files !== undefined ? JSON.stringify(dto.files) : undefined],
      // пустой артикул из формы НЕ затирает существующий (ТЗ №2-fix2, ч.1 п.5)
      ['custom_id', (dto as { customId?: string }).customId?.trim() || undefined],
      ['moderation_status', dto.status],
      ['is_active', dto.isActive === undefined ? undefined : dto.isActive ? 1 : 0],
    ];
    return pairs
      .filter(([, v]) => v !== undefined)
      .map(([col, v]) => sql`${sql.raw(col)} = ${v as string | number | null}`);
  }

  async update(id: string, dto: UpdateProductDto, userId: string): Promise<boolean> {
    const parts = this.buildProductSetParts({ ...dto, status: ProductStatus.MODERATION });
    await this.db.execute(sql`
      UPDATE products SET ${sql.join(parts, sql`, `)}
      WHERE id = ${id} AND user_id = ${userId}
    `);
    return true;
  }

  async adminUpdate(id: string, dto: AdminUpdateProductDto): Promise<void> {
    // уникальность артикула при ручном вводе (ТЗ №2-fix2, ч.1 п.5)
    const customId = (dto as { customId?: string }).customId?.trim();
    if (customId) {
      const taken = (await this.db.execute(sql`
        SELECT id FROM products WHERE custom_id = ${customId} AND id <> ${id} LIMIT 1
      `)) as unknown as any[];
      if ((taken[0] as any[]).length) {
        throw new ConflictException(`Артикул ${customId} уже занят другим товаром`);
      }
    }
    const parts = this.buildProductSetParts(dto);
    await this.db.execute(sql`
      UPDATE products SET ${sql.join(parts, sql`, `)}
      WHERE id = ${id}
    `);
  }

  /** Жизненный цикл + файлы товара из новой таблицы (для правил физического удаления) */
  async getLifecycle(id: string): Promise<{ visibility_status: string; preview: string | null; images: string | null } | null> {
    const rows = (await this.db.execute(sql`
      SELECT visibility_status, preview, CAST(images AS CHAR) AS images FROM products WHERE id = ${id}
    `)) as unknown as any[];
    return (rows[0] as any[])[0] ?? null;
  }

  /**
   * Готовность фото парсинг-черновика (Шаг 3): блокирует одобрение,
   * пока фото скачиваются/в ошибке/отсутствуют. null — не парсинг-черновик.
   */
  async getPhotoState(id: string): Promise<{ blocked: boolean; reason: string } | null> {
    const rows = (await this.db.execute(sql`
      SELECT p.source_item_id, CAST(p.images AS CHAR) AS images, q.state, q.downloaded, q.total
      FROM products p
      LEFT JOIN photo_download_queue q ON q.id = (
        SELECT q2.id FROM photo_download_queue q2 WHERE q2.product_id = p.id
        ORDER BY q2.enqueued_at DESC LIMIT 1
      )
      WHERE p.id = ${id}
    `)) as unknown as any[];
    const row = (rows[0] as any[])[0];
    if (!row || !row.source_item_id) return null;
    let imgs: unknown[] = [];
    try { imgs = JSON.parse(row.images || '[]'); } catch { /* ignore */ }
    const hasLocal = imgs.some(f => typeof f === 'string' && f && !/^https?:/i.test(f as string));
    if (hasLocal) return { blocked: false, reason: '' };
    if (row.state === 'pending' || row.state === 'running') {
      return { blocked: true, reason: `фото ещё скачиваются (${row.downloaded ?? 0}/${row.total ?? '?'})` };
    }
    if (row.state === 'error') return { blocked: true, reason: 'скачивание фото завершилось ошибкой' };
    return { blocked: true, reason: 'у товара нет фотографий' };
  }

  /** Внешние ссылки на товар (проверка по факту, не по статусу) — ТЗ №2-fix2 */
  async countExternalRefs(id: string): Promise<string[]> {
    const checks: Array<[string, string, string]> = [
      ['Chats', 'productId', 'чаты'],
      ['FavoriteProducts', 'productId', 'избранное'],
      ['ViewedProducts', 'productId', 'просмотры'],
      ['CrmDeals', 'productId', 'CRM-сделки'],
      ['TelegramPosts', 'product_id', 'Telegram-посты'],
    ];
    const refs: string[] = [];
    for (const [table, col, label] of checks) {
      const rows = (await this.db.execute(sql`
        SELECT COUNT(*) AS c FROM ${sql.raw(table)} WHERE ${sql.raw(col)} = ${id}
      `)) as unknown as any[];
      const c = Number((rows[0] as any[])[0]?.c ?? 0);
      if (c > 0) refs.push(`${label}: ${c}`);
    }
    return refs;
  }

  /**
   * Физическое удаление черновика/скрытого товара (гарды — в сервисе).
   * Файлы → file_cleanup_queue (воркер проверяет разделяемость с источником);
   * review_queue уходит каскадом; source_items.source_item_id-связь освобождается
   * вместе со строкой — позицию можно отобрать заново.
   * TODO(ТЗ №2-fix Шаг 3): при появлении очереди скачивания фото — отменять
   * незавершённые задачи этого товара перед удалением.
   */
  async hardDeleteProduct(id: string, lifecycle: { preview: string | null; images: string | null }): Promise<void> {
    const isLocalFile = (f: unknown): f is string =>
      typeof f === 'string' && f.length > 0 && !/^https?:\/\//i.test(f) && !f.includes('/');
    let files: string[] = [];
    try { files = (JSON.parse(lifecycle.images || '[]') as unknown[]).filter(isLocalFile); } catch { /* ignore */ }
    if (isLocalFile(lifecycle.preview) && !files.includes(lifecycle.preview)) files.push(lifecycle.preview);
    await this.db.execute(sql`
      INSERT INTO file_cleanup_queue (id, owner_type, owner_id, local_paths)
      VALUES (${crypto.randomUUID()}, 'product', ${id}, ${JSON.stringify(files)})
    `);
    await this.db.execute(sql`DELETE FROM products WHERE id = ${id}`);
  }

  async toggleActivate(id: string, userId: string): Promise<boolean> {
    await this.db
      .update(products)
      .set({ isActive: not(products.isActive) })
      .where(and(eq(products.id, id), eq(products.userId, userId)));

    const [productBase] = await this.db
      .select({ isActive: products.isActive })
      .from(products)
      .where(eq(products.id, id));

    return productBase?.isActive;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    await this.db
      .update(products)
      .set({ isDeleted: true })
      .where(and(eq(products.id, id), eq(products.userId, userId)));

    return true;
  }

  async findById(id: string, userId?: string): Promise<Product | null> {
    const favoriteProductsQuerySelect = userId
      ? sql`, favoriteProduct.isActive as productFavorite_isActive`
      : sql``;
    const favoriteProductsQueryLeftJoin = userId
      ? sql`LEFT JOIN ${favoriteProducts} favoriteProduct ON product.id = favoriteProduct.productId AND favoriteProduct.userId = ${userId}`
      : sql``;

    const result = (await this.db.execute(sql`
            SELECT
                product.id,
                product.name,
                product.slug,
                product.brandSlug,
                product.priceCash,
                product.priceNonCash,
                product.currency,
                product.preview,
                product.files,
                product.description,
                product.quantity,
                product.quantityType,
                product.status,
                product.isActive,
                product.isDeleted,
                product.createdAt,
                category.id as category_id,
                category.name as category_name,
                brand.id as brand_id,
                brand.name as brand_name,
                brand.photo as brand_photo,
                brand.description as brand_description,
                user.tgId as user_tgId,
                user.username as user_username,
                user.firstName as user_firstName,
                user.lastName as user_lastName,
                user.photoUrl as user_photoUrl,
                user.phone as user_phone,
                user.email as user_email,
                city.id as city_id,
                city.name as city_name,
                country.id as country_id,
                country.name as country_name
                ${favoriteProductsQuerySelect}
            FROM ${products} product
            LEFT JOIN ${categories} category ON product.categoryId = category.id
            LEFT JOIN ${brands} brand ON product.brandId = brand.id
            LEFT JOIN ${users} user ON product.userId = user.tgId
            LEFT JOIN ${cities} city ON user.cityId = city.id
            LEFT JOIN ${countries} country ON city.countryId = country.id
            ${favoriteProductsQueryLeftJoin}
            WHERE product.id = ${id}
        `)) as SqlQueryResult<ProductRow>;

    if (!Array.isArray(result[0]) || !result[0][0]) return null;
    const data = await this.mapToProduct(result[0][0]);
    
    if (userId && data.user?.tgId === userId) {
      data.viewCount = await this.getViewCount(id);
    }
    
    return data;
  }

  async findAll(): Promise<Product[]> {
    const result = (await this.db.execute(sql`
            SELECT
                product.id,
                product.name,
                product.slug,
                product.brandSlug,
                product.priceCash,
                product.priceNonCash,
                product.currency,
                product.preview,
                product.files,
                product.description,
                product.quantity,
                product.quantityType,
                product.status,
                product.isActive,
                product.isDeleted,
                product.createdAt,
                category.id as category_id,
                category.name as category_name,
                brand.id as brand_id,
                brand.name as brand_name,
                brand.photo as brand_photo,
                brand.description as brand_description,
                user.tgId as user_tgId,
                user.username as user_username,
                user.firstName as user_firstName,
                user.lastName as user_lastName,
                user.photoUrl as user_photoUrl,
                user.phone as user_phone,
                user.email as user_email,
                city.id as city_id,
                city.name as city_name,
                country.id as country_id,
                country.name as country_name
            FROM ${products} product
            LEFT JOIN ${categories} category ON product.categoryId = category.id
            LEFT JOIN ${brands} brand ON product.brandId = brand.id
            LEFT JOIN ${users} user ON product.userId = user.tgId
            LEFT JOIN ${cities} city ON user.cityId = city.id
            LEFT JOIN ${countries} country ON city.countryId = country.id
            WHERE product.isDeleted = false
            ORDER BY product.createdAt DESC
        `)) as SqlQueryResult<ProductRow>;

    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }

    return Promise.all(result[0].map(row => this.mapToProduct(row)));
  }

  async findAllMy(userId: string): Promise<ProductShort[]> {
    const favoriteProductsQuerySelect = userId
      ? sql`, favoriteProduct.isActive as productFavorite_isActive`
      : sql``;
    const favoriteProductsQueryLeftJoin = userId
      ? sql`LEFT JOIN ${favoriteProducts} favoriteProduct ON product.id = favoriteProduct.productId AND favoriteProduct.userId = ${userId}`
      : sql``;

    const result = (await this.db.execute(sql`
            SELECT
                product.id,
                product.name,
                product.slug,
                product.brandSlug,
                product.priceCash,
                product.currency,
                product.preview,
                product.description,
                product.status,
                product.createdAt
                ${favoriteProductsQuerySelect}
            FROM ${products} product
            ${favoriteProductsQueryLeftJoin}
            WHERE product.userId = ${userId} AND product.isDeleted = false
            ORDER BY product.createdAt DESC
        `)) as SqlQueryResult<ProductShortRow>;

    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }

    const productsData = await Promise.all(result[0].map(row => this.mapToProductShort(row)));

    const viewCounts = await this.getBatchViewCounts(productsData.map(p => p.id));
    productsData.forEach(product => {
      product.viewCount = viewCounts.get(product.id) ?? 0;
    });

    return productsData;
  }

  async getNewProducts(userId?: string): Promise<ProductShort[]> {
    const favoriteProductsQuerySelect = userId
      ? sql`, favoriteProduct.isActive as productFavorite_isActive`
      : sql``;
    const favoriteProductsQueryLeftJoin = userId
      ? sql`LEFT JOIN ${favoriteProducts} favoriteProduct ON product.id = favoriteProduct.productId AND favoriteProduct.userId = ${userId}`
      : sql``;

    const result = (await this.db.execute(sql`
            SELECT
                product.id,
                product.name,
                product.slug,
                product.brandSlug,
                product.priceCash,
                product.currency,
                product.preview,
                product.description,
                product.status,
                product.createdAt
                ${favoriteProductsQuerySelect}
            FROM ${products} product
            ${favoriteProductsQueryLeftJoin}
            WHERE product.isActive = true
                AND product.isDeleted = false
                AND product.status = ${ProductStatus.APPROVED}
            ORDER BY product.createdAt DESC
            LIMIT 10
        `)) as SqlQueryResult<ProductShortRow>;

    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }

    return Promise.all(result[0].map(row => this.mapToProductShort(row)));
  }

  async getMainSellerProducts(
    mainSellerUserId: string,
    userId?: string
  ): Promise<ProductShort[]> {
    const favoriteProductsQuerySelect = userId
      ? sql`, favoriteProduct.isActive as productFavorite_isActive`
      : sql``;
    const favoriteProductsQueryLeftJoin = userId
      ? sql`LEFT JOIN ${favoriteProducts} favoriteProduct ON product.id = favoriteProduct.productId AND favoriteProduct.userId = ${userId}`
      : sql``;

    const result = (await this.db.execute(sql`
            SELECT
                product.id,
                product.name,
                product.slug,
                product.brandSlug,
                product.priceCash,
                product.currency,
                product.preview,
                product.description,
                product.status,
                product.createdAt
                ${favoriteProductsQuerySelect}
            FROM ${products} product
            ${favoriteProductsQueryLeftJoin}
            WHERE product.isActive = true
                AND product.isDeleted = false
                AND product.status = ${ProductStatus.APPROVED}
                AND product.userId = ${mainSellerUserId}
            ORDER BY product.createdAt DESC
            LIMIT 10
        `)) as SqlQueryResult<ProductShortRow>;

    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }

    return Promise.all(result[0].map(row => this.mapToProductShort(row)));
  }

  async getPopularProducts(userId?: string): Promise<ProductShort[]> {
    const favoriteProductsQuerySelect = userId
      ? sql`, MAX(favoriteProduct.isActive) as productFavorite_isActive`
      : sql``;
    const favoriteProductsQueryLeftJoin = userId
      ? sql`LEFT JOIN ${favoriteProducts} favoriteProduct ON product.id = favoriteProduct.productId AND favoriteProduct.userId = ${userId}`
      : sql``;

    const result = (await this.db.execute(sql`
            SELECT
                product.id,
                product.name,
                product.slug,
                product.brandSlug,
                product.priceCash,
                product.currency,
                product.preview,
                product.description,
                product.status,
                product.createdAt
                ${favoriteProductsQuerySelect}
            FROM ${products} product
            LEFT JOIN ${viewedProducts} viewedProduct ON product.id = viewedProduct.productId
            ${favoriteProductsQueryLeftJoin}
            WHERE product.isActive = true 
                AND product.isDeleted = false 
                AND product.status = ${ProductStatus.APPROVED}
                AND viewedProduct.createdAt >= ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}
            GROUP BY product.id, product.name, product.priceCash, product.currency, product.preview, product.status, product.createdAt
            ORDER BY COUNT(viewedProduct.productId) DESC
            LIMIT 10
        `)) as SqlQueryResult<ProductShortRow>;

    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }

    return Promise.all(result[0].map(row => this.mapToProductShort(row)));
  }

  async findAllAvailable(
    query: GetProductsDto,
    userId?: string
  ): Promise<ProductShort[]> {
    const favoriteProductsQuerySelect = userId
      ? sql`, favoriteProduct.isActive as productFavorite_isActive`
      : sql``;
    const favoriteProductsQueryLeftJoin = userId
      ? sql`LEFT JOIN ${favoriteProducts} favoriteProduct ON product.id = favoriteProduct.productId AND favoriteProduct.userId = ${userId}`
      : sql``;

    const conditions: ReturnType<typeof sql>[] = [
      sql`product.isActive = true`,
      sql`product.isDeleted = false`,
      sql`product.status = ${ProductStatus.APPROVED}`
    ];

    if (query.brandId) {
      conditions.push(sql`product.brandId = ${query.brandId}`);
    }

    if (query.sellerId) {
      conditions.push(sql`product.userId = ${query.sellerId}`);
    }

    if (query.categoryId) {
      const childCategoryIds =
        await this.categoryRepository.getChildCategoryIds(query.categoryId);
      const allCategoryIds = [query.categoryId, ...childCategoryIds];

      if (allCategoryIds && allCategoryIds.length > 0) {
        const placeholders = sql.join(allCategoryIds.map(id => sql`${id}`), sql`, `);
        conditions.push(sql`product.categoryId IN (${placeholders})`);
      } else {
        conditions.push(sql`product.categoryId = ${query.categoryId}`);
      }
    }

    if (query.priceCashFrom) {
      conditions.push(sql`CAST(product.priceCash AS DECIMAL) >= ${query.priceCashFrom}`);
    }

    if (query.priceCashTo) {
      conditions.push(sql`CAST(product.priceCash AS DECIMAL) <= ${query.priceCashTo}`);
    }

    // searchIds — ранжированные id из SearchService (MiniSearch);
    // если индекс ещё не готов, searchIds нет — остаётся старый LIKE-fallback
    const searchIds: string[] | undefined = (query as GetProductsDto & { searchIds?: string[] })
      .searchIds;

    if (query.search) {
      if (searchIds && searchIds.length) {
        const idPlaceholders = sql.join(searchIds.map(id => sql`${id}`), sql`, `);
        conditions.push(sql`product.id IN (${idPlaceholders})`);
      } else {
        conditions.push(sql`product.name LIKE ${'%' + query.search + '%'}`);
      }
    }

    if (userId && query.isFavorite !== undefined) {
      if (query.isFavorite) {
        conditions.push(sql`favoriteProduct.isActive = true`);
      } else {
        conditions.push(sql`favoriteProduct.isActive = false`);
      }
    }

    const orderByField =
      query.orderBy === OrderBy.PRICE
        ? 'product.priceCash'
        : 'product.createdAt';
    const orderByDirection =
      query.sortDirection === SortDirection.ASC ? 'ASC' : 'DESC';

    // при поиске без явной сортировки — порядок по релевантности (как вернул индекс)
    const orderClause =
      searchIds && searchIds.length && !query.orderBy
        ? sql`FIELD(product.id, ${sql.join(searchIds.map(id => sql`${id}`), sql`, `)})`
        : sql`${sql.raw(orderByField)} ${sql.raw(orderByDirection)}`;

    const result = (await this.db.execute(sql`
            SELECT
                product.id,
                product.name,
                product.slug,
                product.brandSlug,
                product.priceCash,
                product.currency,
                product.preview,
                product.description,
                product.status,
                product.createdAt,
                product.categoryId
                ${favoriteProductsQuerySelect}
            FROM ${products} product
            ${favoriteProductsQueryLeftJoin}
            WHERE ${sql.join(conditions, sql` AND `)}
            ORDER BY ${orderClause}
            LIMIT ${query.limit}
            OFFSET ${query.offset}
        `)) as SqlQueryResult<ProductShortRow>;

    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }

    return Promise.all(result[0].map(row => this.mapToProductShort(row)));
  }

  async updateStatus(id: string, status: ProductStatus): Promise<void> {
    await this.db.update(products).set({ status }).where(eq(products.id, id));
  }

  async findAdminListings(userId: string): Promise<Product[]> {
    const result = (await this.db.execute(sql`
      SELECT
        product.id,
        product.customId,
        product.name,
        product.slug,
        product.brandSlug,
        product.priceCash,
        product.priceNonCash,
        product.currency,
        product.preview,
        product.files,
        product.description,
        product.quantity,
        product.quantityType,
        product.status,
        product.isActive,
        product.isDeleted,
        product.createdAt,
        category.id as category_id,
        category.name as category_name,
        brand.id as brand_id,
        brand.name as brand_name,
        brand.photo as brand_photo,
        brand.description as brand_description,
        user.tgId as user_tgId,
        user.username as user_username,
        user.firstName as user_firstName,
        user.lastName as user_lastName,
        user.photoUrl as user_photoUrl,
        user.phone as user_phone,
        user.email as user_email,
        city.id as city_id,
        city.name as city_name,
        country.id as country_id,
        country.name as country_name
      FROM ${products} product
      LEFT JOIN ${categories} category ON product.categoryId = category.id
      LEFT JOIN ${brands} brand ON product.brandId = brand.id
      LEFT JOIN ${users} user ON product.userId = user.tgId
      LEFT JOIN ${cities} city ON user.cityId = city.id
      LEFT JOIN ${countries} country ON city.countryId = country.id
      WHERE product.userId = ${userId} AND product.isDeleted = false
      ORDER BY product.createdAt DESC
    `)) as SqlQueryResult<ProductRow>;

    if (!Array.isArray(result[0])) {
      throw new Error('Unexpected query result format');
    }

    return Promise.all(result[0].map(row => this.mapToProduct(row)));
  }

  async findBySlug(slug: string, userId?: string): Promise<Product | null> {
    const favoriteProductsQuerySelect = userId
      ? sql`, favoriteProduct.isActive as productFavorite_isActive`
      : sql``;
    const favoriteProductsQueryLeftJoin = userId
      ? sql`LEFT JOIN ${favoriteProducts} favoriteProduct ON product.id = favoriteProduct.productId AND favoriteProduct.userId = ${userId}`
      : sql``;

    const result = (await this.db.execute(sql`
            SELECT
                product.id,
                product.name,
                product.slug,
                product.brandSlug,
                product.priceCash,
                product.priceNonCash,
                product.currency,
                product.preview,
                product.files,
                product.description,
                product.quantity,
                product.quantityType,
                product.status,
                product.isActive,
                product.isDeleted,
                product.createdAt,
                category.id as category_id,
                category.name as category_name,
                brand.id as brand_id,
                brand.name as brand_name,
                brand.photo as brand_photo,
                brand.description as brand_description,
                user.tgId as user_tgId,
                user.username as user_username,
                user.firstName as user_firstName,
                user.lastName as user_lastName,
                user.photoUrl as user_photoUrl,
                user.phone as user_phone,
                user.email as user_email,
                city.id as city_id,
                city.name as city_name,
                country.id as country_id,
                country.name as country_name
                ${favoriteProductsQuerySelect}
            FROM ${products} product
            LEFT JOIN ${categories} category ON product.categoryId = category.id
            LEFT JOIN ${brands} brand ON product.brandId = brand.id
            LEFT JOIN ${users} user ON product.userId = user.tgId
            LEFT JOIN ${cities} city ON user.cityId = city.id
            LEFT JOIN ${countries} country ON city.countryId = country.id
            ${favoriteProductsQueryLeftJoin}
            WHERE product.slug = ${slug}
        `)) as SqlQueryResult<ProductRow>;

    if (!Array.isArray(result[0]) || !result[0][0]) return null;
    const data = await this.mapToProduct(result[0][0]);

    if (userId && data.user?.tgId === userId) {
      data.viewCount = await this.getViewCount(data.id);
    }

    return data;
  }

  async adminDelete(id: string): Promise<void> {
    await this.db.update(products).set({ isDeleted: true }).where(eq(products.id, id));
  }

  async setListingStatus(id: string, listingStatus: 'active' | 'inactive' | 'sold'): Promise<void> {
    if (listingStatus === 'active') {
      await this.db.update(products).set({ isActive: true, status: ProductStatus.APPROVED }).where(eq(products.id, id));
    } else if (listingStatus === 'sold') {
      await this.db.update(products).set({ isActive: false, status: ProductStatus.SOLD }).where(eq(products.id, id));
    } else {
      await this.db.update(products).set({ isActive: false, status: ProductStatus.APPROVED }).where(eq(products.id, id));
    }
  }
}
