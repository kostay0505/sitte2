import { Injectable, Inject } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { articles, type Article, type NewArticle } from './schemas/articles';
import { articleCategories, type ArticleCategory, type NewArticleCategory } from './schemas/article-categories';
import { Database } from '../../../database/schema';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { CreateArticleCategoryDto } from './dto/create-article-category.dto';
import { UpdateArticleCategoryDto } from './dto/update-article-category.dto';
import { SqlQueryResult } from 'src/database/utils';

export interface ArticleRow {
    id: string;
    title: string;
    excerpt: string | null;
    content: string | null;
    coverImage: string | null;
    section: string;
    categoryId: string | null;
    slug: string;
    published: boolean;
    isFeatured: boolean;
    views: number;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    categoryName: string | null;
    categorySlug: string | null;
}

export interface ArticleCategoryRow {
    id: string;
    name: string;
    slug: string;
    section: string;
    position: number;
    createdAt: string;
}

@Injectable()
export class ArticlesRepository {
    constructor(
        @Inject('DATABASE') private readonly db: Database,
    ) { }

    // ─── Article Categories ───────────────────────────────────────────────

    async findAllCategories(section?: string): Promise<ArticleCategoryRow[]> {
        const result = await this.db.execute(sql`
            SELECT id, name, slug, section, position, createdAt
            FROM ArticleCategories
            ${section ? sql`WHERE section = ${section}` : sql``}
            ORDER BY position ASC, createdAt ASC
        `) as SqlQueryResult<ArticleCategoryRow>;
        if (!Array.isArray(result[0])) return [];
        return result[0] as ArticleCategoryRow[];
    }

    async findCategoryById(id: string): Promise<ArticleCategoryRow | null> {
        const result = await this.db.execute(sql`
            SELECT id, name, slug, section, position, createdAt
            FROM ArticleCategories WHERE id = ${id}
        `) as SqlQueryResult<ArticleCategoryRow>;
        if (!Array.isArray(result[0])) return null;
        return (result[0] as ArticleCategoryRow[])[0] ?? null;
    }

    async createCategory(dto: CreateArticleCategoryDto): Promise<ArticleCategoryRow> {
        const id = crypto.randomUUID();
        await this.db.execute(sql`
            INSERT INTO ArticleCategories (id, name, slug, section, position, createdAt)
            VALUES (${id}, ${dto.name}, ${dto.slug}, ${dto.section}, ${dto.position ?? 0}, NOW())
        `);
        return this.findCategoryById(id) as Promise<ArticleCategoryRow>;
    }

    async updateCategory(id: string, dto: UpdateArticleCategoryDto): Promise<boolean> {
        const sets: string[] = [];
        if (dto.name !== undefined) sets.push(`name = '${dto.name.replace(/'/g, "''")}'`);
        if (dto.slug !== undefined) sets.push(`slug = '${dto.slug.replace(/'/g, "''")}'`);
        if (dto.section !== undefined) sets.push(`section = '${dto.section}'`);
        if (dto.position !== undefined) sets.push(`position = ${dto.position}`);
        if (sets.length === 0) return true;
        await this.db.execute(sql`
            UPDATE ArticleCategories SET ${sql.raw(sets.join(', '))} WHERE id = ${id}
        `);
        return true;
    }

    async deleteCategory(id: string): Promise<boolean> {
        await this.db.execute(sql`
            UPDATE Articles SET categoryId = NULL WHERE categoryId = ${id}
        `);
        await this.db.execute(sql`DELETE FROM ArticleCategories WHERE id = ${id}`);
        return true;
    }

    // ─── Articles ─────────────────────────────────────────────────────────

    async findAll(opts: {
        section?: string;
        categoryId?: string;
        search?: string;
        page: number;
        limit: number;
        publishedOnly?: boolean;
    }): Promise<{ items: ArticleRow[]; total: number }> {
        const { section, categoryId, search, page, limit, publishedOnly } = opts;
        const offset = (page - 1) * limit;

        // Build conditions using drizzle sql template for safe parameterization
        const conditions: ReturnType<typeof sql>[] = [];
        if (section) conditions.push(sql`a.section = ${section}`);
        if (categoryId) conditions.push(sql`a.categoryId = ${categoryId}`);
        if (publishedOnly) conditions.push(sql`a.published = 1`);
        if (search) conditions.push(sql`a.title LIKE ${'%' + search + '%'}`);

        const whereClause = conditions.length > 0
            ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
            : sql``;

        const countRes = await this.db.execute(sql`
            SELECT COUNT(*) as total FROM Articles a ${whereClause}
        `) as unknown as SqlQueryResult<{ total: number }>;
        const total = Number(((countRes[0]) as unknown as any[])[0]?.total ?? 0);

        const result = await this.db.execute(sql`
            SELECT a.id, a.title, a.excerpt, a.coverImage, a.section, a.categoryId,
                   a.slug, a.published, a.isFeatured, a.views, a.publishedAt,
                   a.createdAt, a.updatedAt, a.content,
                   ac.name as categoryName, ac.slug as categorySlug
            FROM Articles a
            LEFT JOIN ArticleCategories ac ON a.categoryId = ac.id
            ${whereClause}
            ORDER BY a.publishedAt DESC, a.createdAt DESC
            LIMIT ${limit} OFFSET ${offset}
        `) as unknown as SqlQueryResult<ArticleRow>;
        if (!Array.isArray(result[0])) return { items: [], total: 0 };
        return { items: result[0] as ArticleRow[], total };
    }

    async findFeatured(section: string): Promise<ArticleRow | null> {
        const result = await this.db.execute(sql`
            SELECT a.id, a.title, a.excerpt, a.coverImage, a.section, a.categoryId,
                   a.slug, a.published, a.isFeatured, a.views, a.publishedAt,
                   a.createdAt, a.updatedAt, a.content,
                   ac.name as categoryName, ac.slug as categorySlug
            FROM Articles a
            LEFT JOIN ArticleCategories ac ON a.categoryId = ac.id
            WHERE a.section = ${section} AND a.published = 1 AND a.isFeatured = 1
            ORDER BY a.publishedAt DESC
            LIMIT 1
        `) as SqlQueryResult<ArticleRow>;
        if (!Array.isArray(result[0])) return null;
        const rows = result[0] as ArticleRow[];
        if (rows.length > 0) return rows[0];

        // fallback: most recent published
        const fallback = await this.db.execute(sql`
            SELECT a.id, a.title, a.excerpt, a.coverImage, a.section, a.categoryId,
                   a.slug, a.published, a.isFeatured, a.views, a.publishedAt,
                   a.createdAt, a.updatedAt, a.content,
                   ac.name as categoryName, ac.slug as categorySlug
            FROM Articles a
            LEFT JOIN ArticleCategories ac ON a.categoryId = ac.id
            WHERE a.section = ${section} AND a.published = 1
            ORDER BY a.publishedAt DESC
            LIMIT 1
        `) as SqlQueryResult<ArticleRow>;
        if (!Array.isArray(fallback[0])) return null;
        return (fallback[0] as ArticleRow[])[0] ?? null;
    }

    async findBySlug(slug: string): Promise<ArticleRow | null> {
        const result = await this.db.execute(sql`
            SELECT a.id, a.title, a.excerpt, a.content, a.coverImage, a.section, a.categoryId,
                   a.slug, a.published, a.isFeatured, a.views, a.publishedAt,
                   a.createdAt, a.updatedAt,
                   ac.name as categoryName, ac.slug as categorySlug
            FROM Articles a
            LEFT JOIN ArticleCategories ac ON a.categoryId = ac.id
            WHERE a.slug = ${slug}
            LIMIT 1
        `) as SqlQueryResult<ArticleRow>;
        if (!Array.isArray(result[0])) return null;
        return (result[0] as ArticleRow[])[0] ?? null;
    }

    async findById(id: string): Promise<ArticleRow | null> {
        const result = await this.db.execute(sql`
            SELECT a.id, a.title, a.excerpt, a.content, a.coverImage, a.section, a.categoryId,
                   a.slug, a.published, a.isFeatured, a.views, a.publishedAt,
                   a.createdAt, a.updatedAt,
                   ac.name as categoryName, ac.slug as categorySlug
            FROM Articles a
            LEFT JOIN ArticleCategories ac ON a.categoryId = ac.id
            WHERE a.id = ${id}
            LIMIT 1
        `) as SqlQueryResult<ArticleRow>;
        if (!Array.isArray(result[0])) return null;
        return (result[0] as ArticleRow[])[0] ?? null;
    }

    async create(dto: CreateArticleDto & { slug: string }): Promise<ArticleRow> {
        const id = crypto.randomUUID();
        const publishedAt = dto.published ? 'NOW()' : 'NULL';
        await this.db.execute(sql`
            INSERT INTO Articles (id, title, excerpt, content, coverImage, section, categoryId, slug, published, isFeatured, views, publishedAt, createdAt, updatedAt)
            VALUES (
                ${id},
                ${dto.title},
                ${dto.excerpt ?? null},
                ${dto.content ?? null},
                ${dto.coverImage ?? null},
                ${dto.section},
                ${dto.categoryId ?? null},
                ${dto.slug},
                ${dto.published ? 1 : 0},
                ${dto.isFeatured ? 1 : 0},
                0,
                ${sql.raw(publishedAt)},
                NOW(),
                NOW()
            )
        `);
        return this.findById(id) as Promise<ArticleRow>;
    }

    async update(id: string, dto: UpdateArticleDto): Promise<boolean> {
        const sets: string[] = [];
        if (dto.title !== undefined) sets.push(`title = '${dto.title.replace(/'/g, "''")}'`);
        if (dto.excerpt !== undefined) sets.push(`excerpt = ${dto.excerpt ? `'${dto.excerpt.replace(/'/g, "''")}'` : 'NULL'}`);
        if (dto.content !== undefined) sets.push(`content = ${dto.content ? `'${dto.content.replace(/\\/g, '\\\\').replace(/'/g, "''")}'` : 'NULL'}`);
        if (dto.coverImage !== undefined) sets.push(`coverImage = ${dto.coverImage ? `'${dto.coverImage}'` : 'NULL'}`);
        if (dto.section !== undefined) sets.push(`section = '${dto.section}'`);
        if (dto.categoryId !== undefined) sets.push(`categoryId = ${dto.categoryId ? `'${dto.categoryId}'` : 'NULL'}`);
        if (dto.slug !== undefined) sets.push(`slug = '${dto.slug.replace(/'/g, "''")}'`);
        if (dto.published !== undefined) {
            sets.push(`published = ${dto.published ? 1 : 0}`);
            sets.push(`publishedAt = ${dto.published ? 'NOW()' : 'NULL'}`);
        }
        if (dto.isFeatured !== undefined) sets.push(`isFeatured = ${dto.isFeatured ? 1 : 0}`);
        sets.push(`updatedAt = NOW()`);
        if (sets.length === 1) return true; // only updatedAt
        await this.db.execute(sql`
            UPDATE Articles SET ${sql.raw(sets.join(', '))} WHERE id = ${id}
        `);
        return true;
    }

    async delete(id: string): Promise<boolean> {
        await this.db.execute(sql`DELETE FROM Articles WHERE id = ${id}`);
        return true;
    }

    async incrementViews(id: string): Promise<void> {
        await this.db.execute(sql`UPDATE Articles SET views = views + 1 WHERE id = ${id}`);
    }
}
