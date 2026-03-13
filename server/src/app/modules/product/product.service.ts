import { Injectable, Inject, forwardRef } from '@nestjs/common';
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

@Injectable()
export class ProductService {
  private readonly mainSellerUserId = '6737529504';

  constructor(
    private readonly repository: ProductRepository,
    private readonly favoriteProductRepository: FavoriteProductRepository,
    private readonly viewedProductRepository: ViewedProductRepository,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => ModerationService))
    private readonly moderationService: ModerationService
  ) {}

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
      throw new Error('Вы не можете добавить более 5 файлов в объявление');
    }

    const product = await this.repository.create({
      ...dto,
      userId,
      status: ProductStatus.MODERATION
    });

    await this.moderationService.sendModerationNotification(product, 'create');

    return product;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateProductDto
  ): Promise<boolean> {
    if (dto.files?.length > 5) {
      throw new Error('Вы не можете добавить более 5 файлов в объявление');
    }

    const currentProduct = await this.repository.findById(id);

    if (!currentProduct) {
      throw new Error('Объявление не найдено');
    }

    await this.repository.update(id, dto);

    if (currentProduct && currentProduct.status !== ProductStatus.MODERATION) {
      const updatedProduct = {
        ...currentProduct,
        ...dto,
        files: dto.files ? JSON.stringify(dto.files) : currentProduct.files,
        priceCash: dto.priceCash.toString(),
        priceNonCash: dto.priceNonCash.toString(),
        status: ProductStatus.MODERATION
      };
      await this.moderationService.sendModerationNotification(
        updatedProduct,
        'update'
      );
    }

    return true;
  }

  async toggleActivate(userId: string, id: string): Promise<boolean> {
    return this.repository.toggleActivate(id, userId);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.repository.delete(id, userId);
  }

  async findAllAvailable(
    query?: GetProductsDto,
    userId?: string
  ): Promise<ProductShort[]> {
    query = query || {
      limit: 25,
      offset: 0
    };

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

  async adminDeleteProduct(id: string): Promise<void> {
    return this.repository.adminDelete(id);
  }

  async setListingStatus(id: string, listingStatus: 'active' | 'inactive' | 'sold'): Promise<void> {
    return this.repository.setListingStatus(id, listingStatus);
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

  async adminUpdate(id: string, dto: AdminUpdateProductDto): Promise<boolean> {
    if (dto.files && dto.files.length > 5) {
      throw new Error('Вы не можете добавить более 5 файлов в объявление');
    }

    const currentProduct = await this.repository.findById(id);

    if (!currentProduct) {
      throw new Error('Объявление не найдено');
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