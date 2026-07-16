import { Controller, Get, Param, Post } from '@nestjs/common';
import { AdminJwtAuth } from '../../decorators/admin-jwt-auth.decorator';
import { ParserSettingsService } from './parser-settings.service';

@Controller('parsers')
@AdminJwtAuth()
export class ParserSettingsController {
    constructor(private readonly service: ParserSettingsService) {}

    @Get()
    list() {
        return this.service.list();
    }

    @Post(':source/toggle')
    toggle(@Param('source') source: string) {
        return this.service.toggle(source);
    }
}
