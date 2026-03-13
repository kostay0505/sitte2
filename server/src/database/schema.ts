import { MySql2Database } from 'drizzle-orm/mysql2';
import { accounts } from '../app/modules/account/schemas/accounts';
import { accountTokens } from '../app/modules/account-token/schemas/account-tokens';
import { brands } from '../app/modules/brand/schemas/brands';
import { categories } from '../app/modules/category/schemas/categories';
import { cities } from '../app/modules/city/schemas/cities';
import { countries } from '../app/modules/country/schemas/countries';
import { favoriteProducts } from '../app/modules/favorite-product/schemas/favorite-products';
import { products } from '../app/modules/product/schemas/products';
import { refreshTokens } from '../app/modules/refresh-token/schemas/refresh-tokens';
import { resumes } from '../app/modules/resume/schemas/resumes';
import { users } from '../app/modules/user/schemas/users';
import { vacancies } from '../app/modules/vacancy/schemas/vacancies';
import { viewedProducts } from '../app/modules/viewed-product/schemas/viewed-products';
import { newsletterSubscriptions } from '../app/modules/newsletter-subscription/schemas/newsletter-subscriptions';
import { chats } from '../app/modules/chat/schemas/chats';
import { messages } from '../app/modules/chat/schemas/messages';
import { businessPages } from '../app/modules/business-page/schemas/business-pages';
import { crmDeals } from '../app/modules/crm/schemas/crm-deals';
import { crmActivities } from '../app/modules/crm/schemas/crm-activities';
import { crmTags } from '../app/modules/crm/schemas/crm-tags';
import { driveFolders } from '../app/modules/drive/schemas/drive-folders';
import { driveFiles } from '../app/modules/drive/schemas/drive-files';
import { articles } from '../app/modules/articles/schemas/articles';
import { articleCategories } from '../app/modules/articles/schemas/article-categories';

export const databaseSchema = {
    accounts,
    accountTokens,
    brands,
    categories,
    cities,
    countries,
    favoriteProducts,
    products,
    refreshTokens,
    resumes,
    users,
    vacancies,
    viewedProducts,
    newsletterSubscriptions,
    chats,
    messages,
    businessPages,
    crmDeals,
    crmActivities,
    crmTags,
    driveFolders,
    driveFiles,
    articles,
    articleCategories,
} as const;

export type Database = MySql2Database<typeof databaseSchema>;
