import { Module } from '@nestjs/common';
import { ParsedBaseController } from './parsed-base.controller';
import { ParsedBaseService } from './parsed-base.service';
import { ParsedBaseRepository } from './parsed-base.repository';
import { GoogleSheetsService } from './google-sheets.service';

@Module({
    controllers: [ParsedBaseController],
    providers: [ParsedBaseService, ParsedBaseRepository, GoogleSheetsService],
})
export class ParsedBaseModule { }
