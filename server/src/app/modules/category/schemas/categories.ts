import { mysqlTable, char, varchar, boolean, int, timestamp } from 'drizzle-orm/mysql-core';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

export const categories = mysqlTable('Categories', {
  id: char('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }),
  parentId: char('parentId', { length: 36 }),
  displayOrder: int('displayOrder').notNull(),
  isActive: boolean('isActive').notNull().default(true),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});

export const categoriesRelations = relations(categories, ({ one }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
}));

export type Category = InferSelectModel<typeof categories>;

export type CategoryShort = {
  id: string;
  name: string;
};

export type NewCategory = InferInsertModel<typeof categories>;
