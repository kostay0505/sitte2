import { Module } from '@nestjs/common';
import { SourceItemsController } from './source-items.controller';
import { SourceItemsService } from './source-items.service';
import { SourceItemsRepository } from './source-items.repository';
import { FileCleanupService } from './file-cleanup.service';
import { PhotoDownloadService } from './photo-download.service';
import { DriveModule } from '../drive/drive.module';

@Module({
    imports: [DriveModule],
    controllers: [SourceItemsController],
    providers: [SourceItemsService, SourceItemsRepository, FileCleanupService, PhotoDownloadService],
    exports: [SourceItemsService, PhotoDownloadService],
})
export class SourceItemsModule {}
