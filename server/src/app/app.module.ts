import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { Logger } from './classes/logger';
import { UsersModule } from './modules/user/user.module';
import { TelegramBotModule } from './modules/telegram/telegram.bots.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { AccountModule } from './modules/account/account.module';
import { AccountTokenModule } from './modules/account-token/account-token.module';
import { RefreshTokenModule } from './modules/refresh-token/refresh-token.module';
import { DatabaseModule } from '../database/database.module';
import { FavoriteProductModule } from './modules/favorite-product/favorite-product.module';
import { ProductModule } from './modules/product/product.module';
import { ResumeModule } from './modules/resume/resume.module';
import { VacancyModule } from './modules/vacancy/vacancy.module';
import { ViewedProductModule } from './modules/viewed-product/viewed-product.module';
import { BrandModule } from './modules/brand/brand.module';
import { CategoryModule } from './modules/category/category.module';
import { CityModule } from './modules/city/city.module';
import { CountryModule } from './modules/country/country.module';
import { StatsModule } from './modules/stats/stats.module';
import { FilesModule } from './services/files/files.module';
import { SyncsModule } from './syncs/syncs.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MailModule } from './services/mail/mail.module';
import { NewsletterSubscriptionModule } from './modules/newsletter-subscription/newsletter-subscription.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ChatModule } from './modules/chat/chat.module';
import { BusinessPageModule } from './modules/business-page/business-page.module';
import { HomeModule } from './modules/home/home.module';
import { SiteContentModule } from './modules/site-content/site-content.module';
import { CrmModule } from './modules/crm/crm.module';
import { DriveModule } from './modules/drive/drive.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true
    }),
    DatabaseModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: 'localhost',
          port: 6379
        }
      })
    }),
    // Multiple named throttlers for different endpoint classes
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,       // 1 minute
        limit: 100,
      },
      {
        name: 'auth',
        ttl: 15 * 60_000,  // 15 minutes
        limit: 5,
      },
      {
        name: 'register',
        ttl: 60 * 60_000,  // 1 hour
        limit: 10,
      },
      {
        name: 'upload',
        ttl: 60 * 60_000,  // 1 hour
        limit: 20,
      },
      {
        name: 'chat',
        ttl: 60_000,       // 1 minute
        limit: 60,
      },
      {
        name: 'products',
        ttl: 60_000,       // 1 minute
        limit: 300,
      },
    ]),
    ScheduleModule.forRoot(),
    FilesModule,
    TelegramBotModule,
    AccountModule,
    AccountTokenModule,
    RefreshTokenModule,
    AuthModule,
    UsersModule,
    BrandModule,
    CategoryModule,
    CityModule,
    CountryModule,
    StatsModule,
    SyncsModule,
    FavoriteProductModule,
    ProductModule,
    ResumeModule,
    VacancyModule,
    ViewedProductModule,
    JobsModule,
    MailModule,
    NewsletterSubscriptionModule,
    ChatModule,
    BusinessPageModule,
    HomeModule,
    SiteContentModule,
    CrmModule,
    DriveModule,
    ArticlesModule,
    DashboardModule,
  ],
  controllers: [],
  providers: [Logger]
})
export class AppModule {}
