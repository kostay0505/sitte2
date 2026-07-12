import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import MiniSearch, { Options, SearchOptions } from 'minisearch';
import { sql } from 'drizzle-orm';
import { Database } from '../../../database/schema';

/**
 * Поиск по каталогу: in-process индекс MiniSearch поверх Products.
 * Опечатки (fuzzy), префиксы, транслит RU→LAT, лёгкий стемминг русского,
 * словари брендов и доменных синонимов. Возвращает ранжированные id.
 *
 * Индекс перестраивается: при старте, каждые 5 минут (товары от парсеров
 * и смена статуса модерацией) и по refreshSoon() после CRUD товара.
 * Каждый PM2-воркер держит собственную копию индекса (~единицы МБ).
 */

interface IndexedProduct {
    id: string;
    name: string;
    brand: string;
    category: string;
    description: string;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REFRESH_DEBOUNCE_MS = 3000;
const MAX_RESULTS = 200;

// Русские написания брендов → канонические латинские
const BRAND_ALIASES: Record<string, string> = {
    'шур': 'shure',
    'шуре': 'shure',
    'сенхайзер': 'sennheiser',
    'зенхайзер': 'sennheiser',
    'сеннхайзер': 'sennheiser',
    'ямаха': 'yamaha',
    'динакорд': 'dynacord',
    'беринджер': 'behringer',
    'берингер': 'behringer',
    'маки': 'mackie',
    'макки': 'mackie',
    'мидас': 'midas',
    'саундкрафт': 'soundcraft',
    'соундкрафт': 'soundcraft',
    'пионер': 'pioneer',
    'роланд': 'roland',
    'корг': 'korg',
    'нексо': 'nexo',
    'мейер': 'meyer',
    'мартин': 'martin',
    'акг': 'akg',
    'джибиэль': 'jbl',
    'джибиэл': 'jbl',
    'электровойс': 'electrovoice',
};

// Доменные синонимы → канонический термин (работает и при индексации, и при поиске)
const CANON: Record<string, string> = {
    'колонка': 'акустика',
    'колонки': 'акустика',
    'колонок': 'акустика',
    'спикер': 'акустика',
    'пульт': 'микшер',
    'пульты': 'микшер',
    'консоль': 'микшер',
    'шнур': 'кабель',
    'провод': 'кабель',
    'усилок': 'усилитель',
    'саб': 'сабвуфер',
};

const RU_ENDINGS = [
    'иями', 'ями', 'ами', 'иях', 'иям', 'ыми', 'ими', 'его', 'ому', 'ему',
    'ой', 'ей', 'ах', 'ях', 'ам', 'ям', 'ом', 'ем', 'ов', 'ев', 'ий', 'ый',
    'ая', 'яя', 'ое', 'ее', 'ую', 'юю', 'ми', 'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь',
].sort((a, b) => b.length - a.length);

const TRANSLIT: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
    т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function stemRu(word: string): string {
    if (word.length <= 4 || !/[а-я]/.test(word)) return word;
    for (const ending of RU_ENDINGS) {
        if (word.length - ending.length >= 3 && word.endsWith(ending)) {
            return word.slice(0, -ending.length);
        }
    }
    return word;
}

function normalizeTerm(term: string): string | null {
    let t = term.toLowerCase().replace(/ё/g, 'е');
    if (t.length < 2 && !/\d/.test(t)) return null;
    t = BRAND_ALIASES[t] || t;
    t = CANON[t] || t;
    t = stemRu(t);
    t = t.replace(/[а-я]/g, ch => TRANSLIT[ch] ?? ch);
    return t || null;
}

@Injectable()
export class SearchService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SearchService.name);
    private index: MiniSearch<IndexedProduct> | null = null;
    private ready = false;
    private lastCount = -1;
    private intervalHandle: ReturnType<typeof setInterval> | null = null;
    private debounceHandle: ReturnType<typeof setTimeout> | null = null;

    private readonly options: Options<IndexedProduct> = {
        fields: ['name', 'brand', 'category', 'description'],
        storeFields: [],
        processTerm: normalizeTerm,
        searchOptions: {
            prefix: true,
            fuzzy: 0.2,
            combineWith: 'AND',
            boost: { name: 3, brand: 2.5, category: 1.5, description: 1 },
            processTerm: normalizeTerm,
        } as SearchOptions,
    };

    constructor(@Inject('DATABASE') private db: Database) {}

    async onModuleInit() {
        await this.refresh();
        this.intervalHandle = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    }

    onModuleDestroy() {
        if (this.intervalHandle) clearInterval(this.intervalHandle);
        if (this.debounceHandle) clearTimeout(this.debounceHandle);
    }

    /** Отложенная перестройка индекса после CRUD товара (дебаунс) */
    refreshSoon(): void {
        if (this.debounceHandle) clearTimeout(this.debounceHandle);
        this.debounceHandle = setTimeout(() => this.refresh().catch(() => {}), REFRESH_DEBOUNCE_MS);
    }

    /**
     * Ранжированные id товаров по запросу.
     * undefined — индекс не готов (вызывающий код откатывается на LIKE).
     * [] — индекс готов, но ничего не найдено.
     */
    search(query: string): string[] | undefined {
        if (!this.ready || !this.index) return undefined;
        const q = query.trim().slice(0, 200);
        if (!q) return undefined;
        let hits = this.index.search(q);
        if (!hits.length) {
            // все слова не совпали — пробуем частичное совпадение
            hits = this.index.search(q, { combineWith: 'OR' });
        }
        return hits.slice(0, MAX_RESULTS).map(h => String(h.id));
    }

    private async refresh(): Promise<void> {
        try {
            const result = await this.db.execute(sql`
                SELECT p.id, p.name, p.description, b.name AS brand, c.name AS category
                FROM Products p
                LEFT JOIN Brands b ON b.id = p.brandId
                LEFT JOIN Categories c ON c.id = p.categoryId
                WHERE p.isActive = 1 AND p.isDeleted = 0 AND p.status = 'approved'
            `);
            const rows = result[0] as unknown as Array<Record<string, unknown>>;
            const docs: IndexedProduct[] = rows.map(r => ({
                id: String(r.id),
                name: String(r.name || ''),
                brand: String(r.brand || ''),
                category: String(r.category || ''),
                description: String(r.description || '').slice(0, 300),
            }));
            const next = new MiniSearch<IndexedProduct>(this.options);
            next.addAll(docs);
            this.index = next;
            this.ready = true;
            if (docs.length !== this.lastCount) {
                this.logger.log(`Search index rebuilt: ${docs.length} products`);
                this.lastCount = docs.length;
            }
        } catch (err) {
            this.logger.warn(`Search index rebuild failed: ${(err as Error).message}`);
        }
    }
}
