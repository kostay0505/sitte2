import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';
import { DriveRepository } from './drive.repository';

@Module({
    imports: [MulterModule.register({})],
    controllers: [DriveController],
    providers: [DriveService, DriveRepository],
    exports: [DriveService],
})
export class DriveModule {}
