import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'crypto';
import { Database } from '../../../database/schema';

export interface PushSubscriptionRow {
    id: string;
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
}

@Injectable()
export class PushRepository {
    constructor(@Inject('DATABASE') private db: Database) {}

    // endpoint может быть длиннее лимита индексируемого varchar — уникальность через SHA-256
    private hash(endpoint: string): string {
        return createHash('sha256').update(endpoint).digest('hex');
    }

    async upsert(
        userId: string,
        endpoint: string,
        p256dh: string,
        auth: string,
        userAgent?: string,
    ): Promise<void> {
        await this.db.execute(sql`
            INSERT INTO PushSubscriptions (id, userId, endpoint, endpointHash, p256dh, auth, userAgent, createdAt)
            VALUES (
                ${randomUUID()},
                ${userId},
                ${endpoint},
                ${this.hash(endpoint)},
                ${p256dh},
                ${auth},
                ${userAgent ?? null},
                NOW()
            )
            ON DUPLICATE KEY UPDATE
                userId = VALUES(userId),
                p256dh = VALUES(p256dh),
                auth = VALUES(auth),
                userAgent = VALUES(userAgent)
        `);
    }

    async getByUserId(userId: string): Promise<PushSubscriptionRow[]> {
        const result = await this.db.execute(sql`
            SELECT id, userId, endpoint, p256dh, auth
            FROM PushSubscriptions
            WHERE userId = ${userId}
        `);
        return result[0] as unknown as PushSubscriptionRow[];
    }

    async deleteByEndpoint(endpoint: string): Promise<void> {
        await this.db.execute(sql`
            DELETE FROM PushSubscriptions WHERE endpointHash = ${this.hash(endpoint)}
        `);
    }

    async deleteByEndpointForUser(userId: string, endpoint: string): Promise<void> {
        await this.db.execute(sql`
            DELETE FROM PushSubscriptions
            WHERE endpointHash = ${this.hash(endpoint)} AND userId = ${userId}
        `);
    }
}
