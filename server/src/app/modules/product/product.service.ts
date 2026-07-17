import { Injectable, Inject, forwardRef, BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductShort } from './schemas/products';
import { type Product } from './schemas/products';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdminCreateProductDto } from './dto/admin-create-product.dto';
import { AdminUpdateProductDto } from './dto/admin-update-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { ToggleFavoriteDto } from './dto/toggle-favorite.dto';
import { ProductStatus } from './types/enums';
import { UserService } from '../user/user.service';
import { ModerationService } from '../telegram/moderation/moderation.service';
import { ProductRepository } from './product.repository';
import { FavoriteProductRepository } from '../favorite-product/favorite-product.repository';
import { ViewedProductRepository } from '../viewed-product/viewed-product.repository';
import { SearchService } from '../search/search.service';
import { SheetsService } from '../sheets/sheets.service';

@Injectable()
export class ProductService {
  private readonly mainSellerUserId = process.env.MAIN_SELLER_USER_ID || '6737529504';

  constructor(
    private readonly repository: ProductRepository,
    private readonly favoriteProductRepository: FavoriteProductRepository,
    private readonly viewedProductRepository: ViewedProductRepository,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => ModerationService))
    private readonly moderationService: ModerationService,
    private readonly searchService: SearchService,
    private readonly sheetsService: SheetsService
  ) {}

  // ── ТЗ №4 Ч4.4: Google Sheets ────────────────────────────────────────────
  async exportToSheets(id: string): Promise<{ ok: boolean }> {
    const d = await this.repository.getForSheets(id);
    if (!d) throw new NotFoundException('Товар не найден');
    await this.sheetsService.appendRow(d.brand, d.description, d.price, d.url);
    await this.repository.setSentToSheets([id]);
    return { ok: true };
  }

  async bulkExportToSheets(ids: string[]): Promise<{ exported: number; errors: string[] }> {
    const done: string[] = [];
    const errors: string[] = [];
    for (const id of ids) {
      try {
        const d = await this.repository.getForSheets(id);
        if (!d) { errors.push(`${id}: не найден`); continue; }
        await this.sheetsService.appendRow(d.brand, d.description, d.price, d.url);
        done.push(id);
      } catch (e) { errors.push(`${id}: ${(e as Error).message}`); }
    }
    if (done.length) await this.repository.setSentToSheets(done);
    return { exported: done.length, errors };
  }

  async getSheetsStatuses() {
    return this.repository.sheetsStatuses();
  }

  async getBasicInfo(userId?: string): Promise<{
    new: Array<ProductShort>;
    mainSeller: Array<ProductShort>;
    popular: Array<ProductShort>;
  }> {
    const [newProducts, mainSellerProducts, popularProducts] =
      await Promise.all([
        this.repository.getNewProducts(userId),
        this.repository.getMainSellerProducts(this.mainSellerUserId, userId),
        this.repository.getPopularProducts(userId)
      ]);

    return {
      new: newProducts,
      mainSeller: mainSellerProducts,
      popular: popularProducts
    };
  }

  async create(userId: string, dto: CreateProductDto): Promise<Product> {
    if (dto.files?.length > 5) {
      throw new BadRequestException('Вы не можете добавить более 5 файлов в объявление');
    }

    const product = await this.repository.create({
      ...dto,
      userId,
      status: ProductStatus.MODERATION
    });

    this.moderationService.sendModerationNotification(product, 'create');
    this.searchService.refreshSoon();

    return product;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateProductDto
  ): Promise<boolean> {
    if (dto.files?.length > 5) {
      throw new BadRequestException('Вы не можете добавить более 5 файлов в объявление');
    }

    const currentProduct = await this.repository.findById(id);

    if (!currentProduct) {
      throw new NotFoundException('Объявление не найдено');
    }

    await this.repository.update(id, dto, userId);
    this.searchService.refreshSoon();

    if (currentProduct && currentProduct.status !== ProductStatus.MODERATION) {
      const updatedProduct = {
        ...currentProduct,
        ...dto,
        files: dto.files ? JSON.stringify(dto.files) : currentProduct.files,
        priceCash: dto.priceCash.toString(),
        priceNonCash: dto.priceNonCash.toString(),
        status: ProductStatus.MODERATION
      };
      this.moderationService.sendModerationNotification(
        updatedProduct,
        'update'
      );
    }

    return true;
  }

  async toggleActivate(userId: string, id: string): Promise<boolean> {
    const result = await this.repository.toggleActivate(id, userId);
    this.searchService.refreshSoon();
    return result;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.repository.delete(id, userId);
    this.searchService.refreshSoon();
    return result;
  }

  async findAllAvailable(
    query?: GetProductsDto,
    userId?: string
  ): Promise<ProductShort[]> {
    query = query || {
      limit: 25,
      offset: 0
    };

    if (query.search?.trim()) {
      // умный поиск: ранжированные id из индекса; undefined = индекс не готов → fallback на LIKE
      const ids = this.searchService.search(query.search);
      if (ids) {
        if (!ids.length) return [];
        (query as GetProductsDto & { searchIds?: string[] }).searchIds = ids;
      }
    }

    return this.repository.findAllAvailable(query, userId);
  }

  async findAllMy(userId: string): Promise<ProductShort[]> {
    return this.repository.findAllMy(userId);
  }

  async findAll(): Promise<Product[]> {
    return this.repository.findAll();
  }

  async findById(id: string, userId?: string): Promise<Product | null> {
    return this.repository.findById(id, userId);
  }

  async findBySlug(slug: string, userId?: string): Promise<Product | null> {
    return this.repository.findBySlug(slug, userId);
  }

  async getAdminListings(userId: string): Promise<Product[]> {
    return this.repository.findAdminListings(userId);
  }

  // ТЗ №2-fix4 B1–B4: пагинированные объявления + live-статус источника + review
  async getAdminListingsPaged(params: {
    userId: string; page: number; limit: number;
    search?: string; status?: 'active' | 'inactive' | 'sold';
    sortBy?: 'updated' | 'price' | 'name'; sortDir?: 'asc' | 'desc';
    problemSource?: boolean; needsReview?: boolean;
  }) {
    // ТЗ №4 Ч4.3 — умный поиск (MiniSearch): ранжированные id; индекс не готов → fallback на LIKE в репозитории
    let searchIds: string[] | undefined;
    if (params.search?.trim()) {
      const ids = this.searchService.searchListings(params.search);
      if (ids) {
        if (!ids.length) return { items: [], total: 0 };
        searchIds = ids;
      }
    }
    return this.repository.findAdminListingsPaged({ ...params, searchIds });
  }

  async getListingCounters(userId: string) {
    return this.repository.listingStatusCounts(userId);
  }

  async getReviewInfo(productId: string) {
    return this.repository.getReviewInfo(productId);
  }

  async markReviewed(productId: string): Promise<void> {
    return this.repository.markReviewed(productId);
  }

  // Массовая смена статуса; «Продано» дополнительно закрывает review-запись (ТЗ B2/B3)
  async bulkSetListingStatus(ids: string[], status: 'active' | 'inactive' | 'sold'): Promise<{ updated: number }> {
    for (const id of ids) {
      await this.repository.setListingStatus(id, status);
      if (status === 'sold') await this.repository.markReviewed(id);
    }
    return { updated: ids.length };
  }

  async bulkMarkReviewed(ids: string[]): Promise<{ updated: number }> {
    for (const id of ids) await this.repository.markReviewed(id);
    return { updated: ids.length };
  }

  async adminDeleteProduct(id: string): Promise<void> {
    return this.repository.adminDelete(id);
  }

  /**
   * Физическое удаление (хотфикс ТЗ №2-fix2): разрешено только для неопубликованного
   * товара без внешних ссылок. Освобождает позицию источника для повторного «В базу».
   */
  async hardDeleteProduct(id: string): Promise<void> {
    const life = await this.repository.getLifecycle(id);
    if (!life) throw new NotFoundException('Товар не найден');
    if (life.visibility_status === 'published') {
      throw new BadRequestException('Товар опубликован — сначала снимите с витрины («Скрыть»/«Архив»), затем удаляйте');
    }
    const refs = await this.repository.countExternalRefs(id);
    if (refs.length) {
      throw new BadRequestException(`На товар ссылаются: ${refs.join(', ')}. Физическое удаление запрещено — используйте архив.`);
    }
    await this.repository.hardDeleteProduct(id, life);
    this.searchService.refreshSoon();
  }

  async setListingStatus(id: string, listingStatus: 'active' | 'inactive' | 'sold'): Promise<void> {
    await this.repository.setListingStatus(id, listingStatus);
    // «Продано» на плейсхолдере автоматически закрывает review-запись (ТЗ №2-fix4 B2)
    if (listingStatus === 'sold') await this.repository.markReviewed(id);
  }

  async toggleFavorite(
    userId: string,
    dto: ToggleFavoriteDto
  ): Promise<boolean> {
    await this.favoriteProductRepository.insertOrUpdate(
      userId,
      dto.id,
      dto.isFavorite
    );
    return true;
  }

  async markViewed(userId: string, productId: string): Promise<boolean> {
    await this.viewedProductRepository.insertOrUpdate(userId, productId);
    return true;
  }

  async adminCreate(dto: AdminCreateProductDto): Promise<Product> {
    if (dto.files?.length > 5) {
      throw new Error('Вы не можете добавить более 5 файлов в объявление');
    }

    return this.repository.create({ ...dto, status: dto.status });
  }

  async adminUpdate(id: string, dto: AdminUpdateProductDto, forceNoPhotos = false): Promise<boolean> {
    if (dto.files && dto.files.length > 5) {
      throw new Error('Вы не можете добавить более 5 файлов в объявление');
    }

    const currentProduct = await this.repository.findById(id);

    if (!currentProduct) {
      throw new Error('Объявление не найдено');
    }

    // Шаг 3 (строгий вариант, согласован): одобрить нельзя, пока фото скачиваются/в ошибке —
    // кроме явного подтверждения «опубликовать без фото» (?forceNoPhotos=1).
    // Если в форме загружены новые файлы — проверка не блокирует.
    if (dto.status === ProductStatus.APPROVED && !forceNoPhotos && !(dto.files && dto.files.length)) {
      const photo = await this.repository.getPhotoState(id);
      if (photo?.blocked) {
        throw new BadRequestException(`PHOTOS_NOT_READY: ${photo.reason}`);
      }
    }

    await this.repository.adminUpdate(id, dto);

    if (
      currentProduct &&
      currentProduct.status === ProductStatus.MODERATION &&
      dto.status !== ProductStatus.MODERATION
    ) {
      const updatedProduct = {
        ...currentProduct,
        ...dto,
        files: dto.files ? JSON.stringify(dto.files) : currentProduct.files,
        priceCash: dto.priceCash.toString(),
        priceNonCash: dto.priceNonCash.toString()
      };
      await this.moderationService.sendUserNotification(
        updatedProduct,
        dto.status
      );
    }

    return true;
  }

  async approveProduct(productId: string): Promise<Product> {
    const productBase = await this.repository.findById(productId);

    if (!productBase) {
      throw new Error('Объявление не найдено');
    }

    await this.repository.updateStatus(productId, ProductStatus.APPROVED);

    return { ...productBase, status: ProductStatus.APPROVED };
  }

  async rejectProduct(productId: string): Promise<Product> {
    const productBase = await this.repository.findById(productId);

    if (!productBase) {
      throw new Error('Объявление не найдено');
    }

    await this.repository.updateStatus(productId, ProductStatus.REJECTED);

    return { ...productBase, status: ProductStatus.REJECTED };
  }
}