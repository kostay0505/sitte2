import { Global, Module } from '@nestjs/common';
import { SheetsService } from './sheets.service';

@Global()
@Module({
    providers: [SheetsService],
    exports: [SheetsService],
})
export class SheetsModule {}
