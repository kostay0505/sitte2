import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { eq, and, sql, not } from 'drizzle-orm';
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

export interface ProductRow {
  id: string;
  name: string;
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
    private readonly hrefService: HrefService
  ) { }

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

    return {
      id: row.id,
      name: row.name,
      priceCash: row.priceCash,
      priceNonCash: row.priceNonCash,
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

    return {
      id: row.id,
      name: row.name,
      priceCash: row.priceCash,
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
    const data = {
      ...dto,
      id: crypto.randomUUID(),
      userId: dto.userId,
      priceCash: dto.priceCash.toString(),
      priceNonCash: dto.priceNonCash.toString(),
      files: JSON.stringify(dto.files),
      status: dto.status
    };
    await this.db.insert(products).values(data);

    const result = await this.findById(data.id);

    if (!result) {
      throw new Error('Product not created');
    }

    return result;
  }

  async update(id: string, dto: UpdateProductDto): Promise<boolean> {
    await this.db
      .update(products)
      .set({
        ...dto,
        priceCash: dto.priceCash.toString(),
        priceNonCash: dto.priceNonCash.toString(),
        files: JSON.stringify(dto.files),
        status: ProductStatus.MODERATION
      })
      .where(eq(products.id, id));
    return true;
  }

  async adminUpdate(id: string, dto: AdminUpdateProductDto): Promise<void> {
    await this.db
      .update(products)
      .set({
        ...dto,
        priceCash: dto.priceCash.toString(),
        priceNonCash: dto.priceNonCash.toString(),
        files: JSON.stringify(dto.files)
      })
      .where(eq(products.id, id));
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
    
    await Promise.all(productsData.map(async (product) => {
      product.viewCount = await this.getViewCount(product.id);
    }));
    
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

    const conditions = [
      'product.isActive = true',
      'product.isDeleted = false',
      `product.status = '${ProductStatus.APPROVED}'`
    ];

    if (query.brandId) {
      conditions.push(`product.brandId = '${query.brandId}'`);
    }

    if (query.sellerId) {
      conditions.push(`product.userId = '${query.sellerId}'`);
    }

    if (query.categoryId) {
      const childCategoryIds =
        await this.categoryRepository.getChildCategoryIds(query.categoryId);
      const allCategoryIds = [query.categoryId, ...childCategoryIds];

      if (allCategoryIds && allCategoryIds.length > 0) {
        conditions.push(
          `product.categoryId IN ('${allCategoryIds.join("','")}')`
        );
      } else {
        conditions.push(`product.categoryId = '${query.categoryId}'`);
      }
    }

    if (query.priceCashFrom) {
      conditions.push(
        `CAST(product.priceCash AS DECIMAL) >= ${query.priceCashFrom}`
      );
    }

    if (query.priceCashTo) {
      conditions.push(
        `CAST(product.priceCash AS DECIMAL) <= ${query.priceCashTo}`
      );
    }

    if (userId && query.isFavorite !== undefined) {
      if (query.isFavorite) {
        conditions.push(`favoriteProduct.isActive = true`);
      } else {
        conditions.push(`favoriteProduct.isActive = false`);
      }
    }

    const orderByField =
      query.orderBy === OrderBy.PRICE
        ? 'product.priceCash'
        : 'product.createdAt';
    const orderByDirection =
      query.sortDirection === SortDirection.ASC ? 'ASC' : 'DESC';

    const result = (await this.db.execute(sql`
            SELECT 
                product.id,
                product.name,
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
            WHERE ${sql.raw(conditions.join(' AND '))}
            ORDER BY ${sql.raw(orderByField)} ${sql.raw(orderByDirection)}
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
}
