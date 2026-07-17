import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    Request,
    NotFoundException,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';

enum ListingStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    SOLD = 'sold',
}

class SetListingStatusDto {
    @IsEnum(ListingStatus)
    listingStatus: ListingStatus;
}
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdminCreateProductDto } from './dto/admin-create-product.dto';
import { AdminUpdateProductDto } from './dto/admin-update-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { DeleteProductDto } from './dto/delete-product.dto';
import { ToggleFavoriteDto } from './dto/toggle-favorite.dto';
import { MarkViewedDto } from './dto/mark-viewed.dto';
import { JwtAuth } from '../../decorators/jwt-auth.decorator';
import { AdminJwtAuth } from '../../decorators/admin-jwt-auth.decorator';
import { ProductShort, type Product } from './schemas/products';
import { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { OptionalJwtAuth } from '../../guards/optional-jwt-auth.guard';

@Controller('products')
export class ProductController {
    constructor(private readonly service: ProductService) { }

    @Get('basic-info')
    @OptionalJwtAuth()
    async getBasicInfo(@Request() req: RequestWithUser): Promise<{
        new: Array<ProductShort>;
        mainSeller: Array<ProductShort>;
        popular: Array<ProductShort>;
    }> {
        return this.service.getBasicInfo(req?.user?.tgId ?? null);
    }

    @Get('available')
    @OptionalJwtAuth()
    async findAllAvailable(
        @Request() req: RequestWithUser,
        @Query() query: GetProductsDto
    ): Promise<ProductShort[]> {
        return this.service.findAllAvailable(query, req?.user?.tgId ?? null);
    }

    @Get('my')
    @JwtAuth()
    async findAllMy(@Request() req: RequestWithUser): Promise<ProductShort[]> {
        return this.service.findAllMy(req.user.tgId);
    }

    @Get()
    @AdminJwtAuth()
    async findAll(): Promise<Product[]> {
        return this.service.findAll();
    }

    @Get('admin/listings')
    @AdminJwtAuth()
    async getAdminListings(@Query('userId') userId: string): Promise<Product[]> {
        return this.service.getAdminListings(userId || process.env.MAIN_SELLER_USER_ID || '6737529504');
    }

    // ТЗ №2-fix4 B1–B4: пагинация/сортировка/фильтры + live-статус источника
    @Get('admin/listings/paged')
    @AdminJwtAuth()
    async getAdminListingsPaged(@Query() q: any) {
        const seller = q.userId || process.env.MAIN_SELLER_USER_ID || '6737529504';
        return this.service.getAdminListingsPaged({
            userId: seller,
            page: Math.max(1, parseInt(q.page ?? '1') || 1),
            limit: Math.min(100, Math.max(10, parseInt(q.limit ?? '25') || 25)),
            search: q.search || undefined,
            status: ['active', 'inactive', 'sold'].includes(q.status) ? q.status : undefined,
            sortBy: ['updated', 'price', 'name'].includes(q.sortBy) ? q.sortBy : 'updated',
            sortDir: q.sortDir === 'desc' ? 'desc' : 'asc',
            problemSource: q.problemSource === '1' || q.problemSource === 'true',
            needsReview: q.needsReview === '1' || q.needsReview === 'true',
        });
    }

    @Get('admin/listing-counters')
    @AdminJwtAuth()
    async getListingCounters(@Query('userId') userId: string) {
        return this.service.getListingCounters(userId || process.env.MAIN_SELLER_USER_ID || '6737529504');
    }

    @Get('admin/:id/review')
    @AdminJwtAuth()
    async getReviewInfo(@Param('id') id: string) {
        return this.service.getReviewInfo(id);
    }

    @Post('admin/:id/reviewed')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async markReviewed(@Param('id') id: string): Promise<{ ok: boolean }> {
        await this.service.markReviewed(id);
        return { ok: true };
    }

    @Post('admin/listings/bulk-status')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async bulkStatus(@Body() body: { ids: string[]; status: 'active' | 'inactive' | 'sold' }) {
        return this.service.bulkSetListingStatus(body.ids ?? [], body.status);
    }

    @Post('admin/listings/bulk-reviewed')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async bulkReviewed(@Body() body: { ids: string[] }) {
        return this.service.bulkMarkReviewed(body.ids ?? []);
    }

    // ── ТЗ №4 Ч4.1: массовые категория/бренд/подкатегория ──
    @Post('admin/listings/bulk-category')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async bulkCategory(@Body() body: { ids: string[]; categoryId: string }) {
        return this.service.bulkSetCategory(body.ids ?? [], body.categoryId);
    }
    @Post('admin/listings/bulk-brand')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async bulkBrand(@Body() body: { ids: string[]; brandId: string }) {
        return this.service.bulkSetBrand(body.ids ?? [], body.brandId);
    }
    @Post('admin/listings/bulk-subcategory')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async bulkSubcategory(@Body() body: { ids: string[]; subcategoryId: string }) {
        return this.service.bulkSetSubcategory(body.ids ?? [], body.subcategoryId);
    }

    // ── ТЗ №4 Ч4.4: Google Sheets (static-пути до :id-маршрутов) ──
    @Get('admin/sheets-statuses')
    @AdminJwtAuth()
    async sheetsStatuses() {
        return this.service.getSheetsStatuses();
    }

    @Post('admin/export-to-sheets')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async bulkExportSheets(@Body() body: { ids: string[] }) {
        return this.service.bulkExportToSheets(body.ids ?? []);
    }

    @Post('admin/:id/export-to-sheets')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async exportSheets(@Param('id') id: string) {
        return this.service.exportToSheets(id);
    }

    @Patch('admin/:id/listing-status')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async setListingStatus(
        @Param('id') id: string,
        @Body() body: SetListingStatusDto
    ): Promise<void> {
        return this.service.setListingStatus(id, body.listingStatus);
    }

    @Delete('admin/:id')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async adminDelete(@Param('id') id: string): Promise<void> {
        return this.service.adminDeleteProduct(id);
    }

    // Физическое удаление черновика (ТЗ №2-fix2): гарды в сервисе
    @Delete('admin/:id/hard')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async adminHardDelete(@Param('id') id: string): Promise<{ ok: boolean }> {
        await this.service.hardDeleteProduct(id);
        return { ok: true };
    }

    @Get('slug/:slug')
    @OptionalJwtAuth()
    async findBySlug(
        @Request() req: RequestWithUser,
        @Param('slug') slug: string
    ): Promise<Product> {
        const product = await this.service.findBySlug(slug, req?.user?.tgId ?? null);
        if (!product) {
            throw new NotFoundException('Товар не найден');
        }
        return product;
    }

    @Get(':id')
    @OptionalJwtAuth()
    async findOne(
        @Request() req: RequestWithUser,
        @Param('id') id: string
    ): Promise<Product> {
        const product = await this.service.findById(id, req?.user?.tgId ?? null);
        if (!product) {
            throw new NotFoundException('Товар не найден');
        }
        return product;
    }

    @Post()
    @JwtAuth()
    @HttpCode(HttpStatus.CREATED)
    async create(
        @Request() req: RequestWithUser,
        @Body() dto: CreateProductDto
    ): Promise<Product> {
        return this.service.create(req.user.tgId, dto);
    }

    @Put(':id')
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async update(
        @Request() req: RequestWithUser,
        @Param('id') id: string,
        @Body() dto: UpdateProductDto
    ): Promise<boolean> {
        return this.service.update(req.user.tgId, id, dto);
    }

    @Put('toggle-activate/:id')
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async toggleActivate(
        @Request() req: RequestWithUser,
        @Param('id') id: string
    ): Promise<boolean> {
        return this.service.toggleActivate(req.user.tgId, id);
    }

    @Delete()
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async delete(
        @Request() req: RequestWithUser,
        @Body() dto: DeleteProductDto
    ): Promise<boolean> {
        return this.service.delete(req.user.tgId, dto.id);
    }

    @Post('admin')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.CREATED)
    async adminCreate(
        @Body() dto: AdminCreateProductDto
    ): Promise<Product> {
        return this.service.adminCreate(dto);
    }

    @Put('admin/:id')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async adminUpdate(
        @Param('id') id: string,
        @Body() dto: AdminUpdateProductDto,
        @Query('forceNoPhotos') forceNoPhotos?: string
    ): Promise<boolean> {
        return this.service.adminUpdate(id, dto, forceNoPhotos === '1');
    }

    @Post('favorite')
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async toggleFavorite(
        @Request() req: RequestWithUser,
        @Body() dto: ToggleFavoriteDto
    ): Promise<boolean> {
        return this.service.toggleFavorite(req.user.tgId, dto);
    }

    @Post('viewed')
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async markViewed(
        @Request() req: RequestWithUser,
        @Body() dto: MarkViewedDto
    ): Promise<boolean> {
        return this.service.markViewed(req.user.tgId, dto.id);
    }
}