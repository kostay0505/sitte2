import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PushRepository } from './push.repository';
import { AppCacheService } from '../cache/cache.service';

export interface PushPayload {
    title: string;
    body?: string;
    url?: string;
    tag?: string;
}

const COOLDOWN_SECONDS = 300;

@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);
    private publicKey: string | null = null;
    private enabled = false;

    constructor(
        private readonly repository: PushRepository,
        private readonly cache: AppCacheService,
    ) {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        const subject = process.env.VAPID_SUBJECT || 'mailto:touringexperteu@gmail.com';
        if (publicKey && privateKey) {
            webpush.setVapidDetails(subject, publicKey, privateKey);
            this.publicKey = publicKey;
            this.enabled = true;
        } else {
            this.logger.warn('VAPID keys are not configured — web push disabled');
        }
    }

    getPublicKey() {
        return { publicKey: this.publicKey };
    }

    async subscribe(
        userId: string,
        subscription: { endpoint?: string; keys?: { p256dh?: string; auth?: string } },
        userAgent?: string,
    ) {
        const endpoint = subscription?.endpoint;
        const p256dh = subscription?.keys?.p256dh;
        const auth = subscription?.keys?.auth;
        if (!endpoint || !p256dh || !auth) {
            throw new BadRequestException('Invalid push subscription');
        }
        await this.repository.upsert(userId, endpoint, p256dh, auth, userAgent?.substring(0, 255));
        return { ok: true };
    }

    async unsubscribe(userId: string, endpoint?: string) {
        if (endpoint) {
            await this.repository.deleteByEndpointForUser(userId, endpoint);
        }
        return { ok: true };
    }

    /**
     * Отправить push всем подпискам пользователя.
     * cooldownKey — не чаще раза в 5 минут на (user, key); протухшие подписки удаляются.
     * Никогда не бросает — вызывающий код не должен ломаться из-за push.
     */
    async sendToUser(userId: string, payload: PushPayload, cooldownKey?: string): Promise<void> {
        if (!this.enabled || !userId) return;
        try {
            if (cooldownKey) {
                const key = `push:cd:${userId}:${cooldownKey}`;
                if (await this.cache.get(key)) return;
                await this.cache.set(key, 1, COOLDOWN_SECONDS);
            }
            const subs = await this.repository.getByUserId(userId);
            if (!subs?.length) return;
            const body = JSON.stringify(payload);
            await Promise.all(
                subs.map(async sub => {
                    try {
                        await webpush.sendNotification(
                            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                            body,
                            { TTL: 3600 },
                        );
                    } catch (err: any) {
                        if (err?.statusCode === 404 || err?.statusCode === 410) {
                            await this.repository.deleteByEndpoint(sub.endpoint).catch(() => {});
                        } else {
                            this.logger.warn(`push send failed (${err?.statusCode}): ${err?.message}`);
                        }
                    }
                }),
            );
        } catch (err) {
            this.logger.warn(`sendToUser failed: ${(err as Error).message}`);
        }
    }
}
