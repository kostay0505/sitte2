import { Module, forwardRef } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductRepository } from './product.repository';
import { BrandModule } from '../brand/brand.module';
import { CategoryModule } from '../category/category.module';
import { FavoriteProductModule } from '../favorite-product/favorite-product.module';
import { ViewedProductModule } from '../viewed-product/viewed-product.module';
import { UsersModule } from '../user/user.module';
import { TelegramBotModule } from '../telegram/telegram.bots.module';
import { HrefModule } from '../../services/href/href.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    BrandModule,
    forwardRef(() => HrefModule),
    CategoryModule,
    FavoriteProductModule,
    ViewedProductModule,
    forwardRef(() => TelegramBotModule),
    ExchangeRateModule,
    SearchModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, ProductRepository],
  exports: [ProductService, ProductRepository]
})
export class ProductModule {}
