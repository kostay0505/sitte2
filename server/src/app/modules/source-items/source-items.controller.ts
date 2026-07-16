import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
    list(@Query() q: any) {
        const t: SourceTab = q.tab === 'archive' || q.tab === 'trash' ? q.tab : 'parsing';
        return this.service.list({
            tab: t,
            source: q.source || undefined,
            search: q.search || undefined,
            sortBy: q.sortBy || undefined,
            sortDir: q.sortDir === 'asc' ? 'asc' : 'desc',
            page: Math.max(1, parseInt(q.page ?? '1') || 1),
            limit: Math.min(100, Math.max(5, parseInt(q.limit ?? '25') || 25)),
            // ТЗ №2-fix4 A2–A4
            linked: q.linked === 'linked' || q.linked === 'unlinked' ? q.linked : undefined,
            siteStatus: ['available', 'sold', 'not_found'].includes(q.siteStatus) ? q.siteStatus : undefined,
            noPrice: q.noPrice === '1' || q.noPrice === 'true',
            newWithinHours: q.newWithin === '24' ? 24 : q.newWithin === '168' ? 168 : undefined,
        });
    }

    // Массовые операции (ТЗ №2-fix4 A5) — до ':id'-маршрутов, чтобы 'bulk' не попал в :id
    @Post('bulk/to-base')
    bulkToBase(@Body() body: { ids: string[] }) {
        return this.service.bulkToBase(body.ids ?? []);
    }

    @Post('bulk/archive')
    bulkArchive(@Body() body: { ids: string[] }) {
        return this.service.bulkArchive(body.ids ?? []);
    }

    @Post('bulk/trash')
    bulkTrash(@Body() body: { ids: string[] }) {
        return this.service.bulkTrash(body.ids ?? []);
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
