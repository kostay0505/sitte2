import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { JwtAuth } from '../../decorators/jwt-auth.decorator';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
    constructor(private readonly service: PushService) {}

    @Get('public-key')
    getPublicKey() {
        return this.service.getPublicKey();
    }

    @Post('subscribe')
    @JwtAuth()
    subscribe(@Req() req: any, @Body() body: any) {
        return this.service.subscribe(req.user.tgId, body, req.headers['user-agent']);
    }

    @Post('unsubscribe')
    @JwtAuth()
    unsubscribe(@Req() req: any, @Body() body: any) {
        return this.service.unsubscribe(req.user.tgId, body?.endpoint);
    }
}
