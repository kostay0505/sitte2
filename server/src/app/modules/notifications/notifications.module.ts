import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { PushModule } from '../push/push.module';

@Module({
    imports: [PushModule],
    controllers: [NotificationsController],
    providers: [NotificationsService, NotificationsRepository],
    exports: [NotificationsService],
})
export class NotificationsModule {}
