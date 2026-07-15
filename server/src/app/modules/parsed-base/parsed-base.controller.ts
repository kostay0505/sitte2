import {
    Controller, Get, Post, Put, Patch, Delete, Param, Query, Body, HttpCode, HttpStatus, Req, NotFoundException,
} from '@nestjs/common';
import { ParsedBaseService } from './parsed-base.service';
import { UpdateBaseItemDto, BulkUpdateDto } from './parsed-base.repository';
import { AdminJwtAuth } from '../../decorators/admin-jwt-auth.decorator';

@Controller('parsed-base')
export class ParsedBaseController {
    constructor(private readonly service: ParsedBaseService) { }

    @Get('source-counts')
    @AdminJwtAuth()
    async getSourceCounts() {
        return this.service.getSourceCounts();
    }

    @Patch('bulk')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async bulkUpdate(@Body() body: { ids: string[]; data: BulkUpdateDto }) {
        return this.service.bulkUpdate(body.ids || [], body.data || {});
    }

    @Post('bulk/download-images')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async bulkDownloadImages(@Body() body: { ids: string[] }) {
        return this.service.bulkDownloadImages(body.ids || []);
    }

    @Get('bulk/download-images/:jobId')
    @AdminJwtAuth()
    async getBulkDownloadStatus(@Param('jobId') jobId: string) {
        const status = this.service.getJobStatus(jobId);
        if (!status) throw new NotFoundException('Job not found');
        return status;
    }

    @Get()
    @AdminJwtAuth()
    async getList(
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '50',
        @Query('source') source?: string,
        @Query('search') search?: string,
        @Query('filled') filled?: string,
    ) {
        return this.service.getList(
            parseInt(page, 10) || 1,
            Math.min(parseInt(limit, 10) || 50, 100),
            source || undefined,
            search || undefined,
            filled || undefined,
        );
    }

    @Post('from-parser')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async addFromParser(@Body() body: { source: string; sourceId: string }) {
        return this.service.addFromParser(body.source, body.sourceId);
    }

    @Get(':id/source')
    @AdminJwtAuth()
    async getSourceItem(@Param('id') id: string) {
        return this.service.getSourceItem(id);
    }

    @Put(':id')
    @AdminJwtAuth()
    async update(@Param('id') id: string, @Body() body: UpdateBaseItemDto) {
        return this.service.update(id, body);
    }

    @Post(':id/download-photos')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async downloadPhotos(@Param('id') id: string) {
        return this.service.downloadPhotos(id);
    }

    @Post(':id/publish')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async publish(@Param('id') id: string, @Req() req: any) {
        const adminUserId = req.user?.tgId || req.user?.sub || '';
        return this.service.publish(id, adminUserId);
    }

    @Post(':id/export-to-sheets')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async exportToSheets(@Param('id') id: string) {
        return this.service.exportToSheets(id);
    }

    @Delete(':id')
    @AdminJwtAuth()
    async delete(@Param('id') id: string) {
        return this.service.delete(id);
    }
}
