import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AdminJwtAuth } from '../../decorators/admin-jwt-auth.decorator';
import { SourceItemsService } from './source-items.service';
import { PhotoDownloadService } from './photo-download.service';
import { SourceTab } from './source-items.repository';

@Controller('source-items')
@AdminJwtAuth()
export class SourceItemsController {
    constructor(
        private readonly service: SourceItemsService,
        private readonly photos: PhotoDownloadService,
    ) {}

    // фото-конвейер (Шаг 3) — объявлены до ':id', чтобы не перехватывались
    @Get('photo-statuses')
    photoStatuses() {
        return this.photos.statuses();
    }

    @Post('photo-retry/:productId')
    photoRetry(@Param('productId') productId: string) {
        return this.photos.retryForProduct(productId);
    }

    @Get()
    list(
        @Query('tab') tab?: string,
        @Query('source') source?: string,
        @Query('search') search?: string,
        @Query('sortBy') sortBy?: string,
        @Query('sortDir') sortDir?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const t: SourceTab = tab === 'archive' || tab === 'trash' ? tab : 'parsing';
        return this.service.list({
            tab: t,
            source: source || undefined,
            search: search || undefined,
            sortBy: sortBy || undefined,
            sortDir: sortDir === 'asc' ? 'asc' : 'desc',
            page: Math.max(1, parseInt(page ?? '1') || 1),
            limit: Math.min(100, Math.max(5, parseInt(limit ?? '25') || 25)),
        });
    }

    @Get('sources')
    sources() {
        return this.service.sourcesSummary();
    }

    @Get(':id')
    one(@Param('id') id: string) {
        return this.service.findFull(id);
    }

    @Post(':id/to-base')
    toBase(@Param('id') id: string) {
        return this.service.toBase(id);
    }

    @Post(':id/archive')
    async archive(@Param('id') id: string) {
        await this.service.archive(id);
        return { ok: true };
    }

    @Post(':id/unarchive')
    async unarchive(@Param('id') id: string) {
        await this.service.unarchive(id);
        return { ok: true };
    }

    @Post(':id/trash')
    async trash(@Param('id') id: string) {
        await this.service.trash(id);
        return { ok: true };
    }

    @Post(':id/restore')
    async restore(@Param('id') id: string) {
        await this.service.restore(id);
        return { ok: true };
    }

    @Post(':id/delete')
    async deleteNow(@Param('id') id: string) {
        await this.service.deleteNow(id);
        return { ok: true };
    }
}
