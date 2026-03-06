import { mysqlTable, char, varchar, text, boolean, int, decimal, timestamp } from 'drizzle-orm/mysql-core';
import { InferInsertModel } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { categories, CategoryShort } from '../../category/schemas/categories';
import { brands, BrandShort } from '../../brand/schemas/brands';
import { users, UserShort } from '../../user/schemas/users';
import { CurrencyList, QuantityType, ProductStatus } from '../types/enums';

export const products = mysqlTable('Products', {
    id: char('id', { length: 36 }).primaryKey(),
    userId: varchar('userId', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    priceCash: decimal('priceCash', { precision: 10, scale: 2 }).notNull(),
    priceNonCash: decimal('priceNonCash', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 255 }).notNull().$type<CurrencyList>(),
    preview: varchar('preview', { length: 255 }).notNull(),
    files: text('files').notNull(),
    description: text('description').notNull(),
    categoryId: char('categoryId', { length: 36 }).notNull(),
    brandId: char('brandId', { length: 36 }).notNull(),
    quantity: int('quantity').notNull(),
    quantityType: varchar('quantityType', { length: 255 }).notNull().$type<QuantityType>(),
    status: varchar('status', { length: 255 }).notNull().$type<ProductStatus>(),
    isActive: boolean('isActive').notNull().default(true),
    isDeleted: boolean('isDeleted').notNull().default(false),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});

export const productsRelations = relations(products, ({ one }) => ({
    category: one(categories, {
        fields: [products.categoryId],
        references: [categories.id],
    }),
    brand: one(brands, {
        fields: [products.brandId],
        references: [brands.id],
    }),
    user: one(users, {
        fields: [products.userId],
        references: [users.tgId],
    }),
}));

export type Product = {
    id: string;
    name: string;
    priceCash: string;
    priceNonCash: string;
    currency: CurrencyList;
    preview: string;
    files: string;
    description: string;
    quantity: number;
    quantityType: QuantityType;
    status: ProductStatus;
    isActive: boolean;
    isDeleted: boolean;
    isNew: boolean;
    isFavorite: boolean;
    category: CategoryShort | null;
    brand: BrandShort | null;
    user: UserShort | null;
    url?: string;
    viewCount?: number;
};

export type ProductShort = {
    id: string;
    name: string;
    priceCash: string;
    currency: CurrencyList;
    preview: string;
    description: string;
    status: ProductStatus;
    isNew: boolean;
    isFavorite: boolean;
    url?: string;
    viewCount?: number;
    categoryId?: string | null;
};

export type NewProduct = InferInsertModel<typeof products>;