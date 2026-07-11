import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { PushService } from '../push/push.service';

@Injectable()
export class NotificationsService {
    constructor(
        private readonly repository: NotificationsRepository,
        private readonly pushService: PushService,
    ) {}

    async create(data: {
        userId: string;
        type: string;
        title: string;
        body?: string;
        entityId?: string;
    }): Promise<void> {
        if (!data.userId) return;
        await this.repository.create(data);

        // Дублируем в web push (не ломает создание уведомления; кулдаун 5 мин на user+type+entity)
        const url =
            data.type === 'new_message' && data.entityId
                ? `/chats/${data.entityId}`
                : '/';
        this.pushService
            .sendToUser(
                data.userId,
                {
                    title: data.title,
                    body: data.body,
                    url,
                    tag: data.entityId || data.type,
                },
                data.entityId ? `${data.type}:${data.entityId}` : data.type,
            )
            .catch(() => {});
    }

    async getByUserId(userId: string) {
        return this.repository.getByUserId(userId);
    }

    async getUnreadCount(userId: string) {
        return this.repository.getUnreadCount(userId);
    }

    async markAllRead(userId: string): Promise<void> {
        await this.repository.markAllRead(userId);
    }
}
