import { mysqlTable, varchar, char, text, timestamp } from 'drizzle-orm/mysql-core';

export const pushSubscriptions = mysqlTable('PushSubscriptions', {
    id: char('id', { length: 36 }).primaryKey(),
    userId: varchar('userId', { length: 255 }).notNull(),
    endpoint: text('endpoint').notNull(),
    endpointHash: char('endpointHash', { length: 64 }).notNull(),
    p256dh: varchar('p256dh', { length: 255 }).notNull(),
    auth: varchar('auth', { length: 255 }).notNull(),
    userAgent: varchar('userAgent', { length: 255 }),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
