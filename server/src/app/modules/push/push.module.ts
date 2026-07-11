import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PushRepository } from './push.repository';

@Module({
    controllers: [PushController],
    providers: [PushService, PushRepository],
    exports: [PushService],
})
export class PushModule {}
