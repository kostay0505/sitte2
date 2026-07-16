import { Global, Module } from '@nestjs/common';
import { ParserSettingsController } from './parser-settings.controller';
import { ParserSettingsService } from './parser-settings.service';

@Global()
@Module({
    controllers: [ParserSettingsController],
    providers: [ParserSettingsService],
    exports: [ParserSettingsService],
})
export class ParserSettingsModule {}
