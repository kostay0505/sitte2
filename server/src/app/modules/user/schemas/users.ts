import {
  mysqlTable,
  varchar,
  boolean,
  timestamp,
  char
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { accounts } from '../../account/schemas/accounts';
import { accountTokens } from '../../account-token/schemas/account-tokens';
import { refreshTokens } from '../../refresh-token/schemas/refresh-tokens';
import { City, CityShort } from '../../city/schemas/cities';

export const users = mysqlTable('Users', {
  tgId: varchar('tgId', { length: 255 }).primaryKey(),
  username: varchar('username', { length: 255 }),
  firstName: varchar('firstName', { length: 255 }),
  lastName: varchar('lastName', { length: 255 }),
  photoUrl: varchar('photoUrl', { length: 255 }),
  bannerUrl: varchar('bannerUrl', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  cityId: char('cityId', { length: 36 }),
  langCode: varchar('langCode', { length: 10 }),
  invitedBy: varchar('invitedBy', { length: 255 }),
  subscribedToNewsletter: boolean('subscribedToNewsletter')
    .default(true)
    .notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  isBanned: boolean('isBanned').default(false).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),

  emailVerified: boolean('emailVerified').default(false).notNull(),
  passwordHash: varchar('passwordHash', { length: 255 }),
  emailVerificationCode: varchar('emailVerificationCode', { length: 255 }),
  resetPasswordCode: varchar('resetPasswordCode', { length: 255 }),
  role: varchar('role', { length: 50 }).default('user').notNull()
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  accountTokens: many(accountTokens),
  refreshTokens: many(refreshTokens)
}));

export type UserRole = 'user' | 'shop' | 'admin';

export type User = {
  tgId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  subscribedToNewsletter: boolean;
  city: Omit<City, 'createdAt' | 'updatedAt'> | null;
  isActive: boolean;
  isBanned: boolean;
  emailVerified: boolean;
  emailVerificationCode: string | null;
  resetPasswordCode: string | null;
  passwordHash: string | null;
  role: UserRole;
  url?: string;
};

export type UserShort = {
  tgId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  bannerUrl: string | null;
  email: string | null;
  phone: string | null;
  city: CityShort | null;
  role: UserRole;
  url?: string;
};
