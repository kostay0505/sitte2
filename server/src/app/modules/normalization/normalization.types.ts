/**
 * ТЗ №4 Ч1 — единый контракт нормализованной позиции источника.
 * Заполняется каждым парсером (после миграции на BaseParserService, Ч2).
 */
export type AvailabilityState = 'in_stock' | 'out_of_stock' | 'unknown';

export interface ParsedItem {
    externalId: string;
    url: string;                 // ОБЯЗАТЕЛЕН (нужен для перепроверки «жив ли», ТЗ №3)
    title: string;
    description?: string | null;
    priceAmount: number | null;  // null = нет цены / не распознана (см. parseError)
    priceCurrency: string | null;
    availability: AvailabilityState;
    brand?: string;
    condition?: string;
    category?: string;
    seller?: string;
    images: string[];
    raw: Record<string, unknown>;
    // служебное
    parseError?: boolean;
    extra?: Record<string, unknown>;
}

/**
 * ЕДИНЫЙ СЛОВАРЬ КЛЮЧЕЙ `extra` (ТЗ №4 Ч1 п.2).
 * У всех источников — одинаковые имена. Отсутствующее у источника поле
 * ОТСУТСТВУЕТ в объекте (не пустая строка). Количество НЕ собирается (решение админа).
 */
export const EXTRA_KEYS = {
    brand: 'бренд (как на источнике)',
    condition: 'состояние (new/used/...)',
    seller: 'имя/id продавца (только KinxConnect)',
    seller_country: 'страна продавца (только KinxConnect)',
    sku_source: 'артикул на источнике',
    category_source: 'категория(и) как на источнике',
    negotiable: 'торг (флаг, суффикс VB)',
    fixed_price: 'фикс. цена (флаг, суффикс FP)',
    brand_suggestion: 'подсказка бренда из справочника (title-matching)',
    model_suggestion: 'подсказка модели из ProductModels',
    suggestion_confidence: 'уверенность подсказки 0..1',
} as const;

export type ExtraKey = keyof typeof EXTRA_KEYS;

export interface PriceParseResult {
    amount: number | null;
    currency: string | null;
    error: boolean;
    flags: { negotiable?: boolean; fixed_price?: boolean };
}

/** Как разбирать цену конкретного источника */
export type PriceKind = 'colcur' | 'arrius' | 'gearwise' | 'usedfull' | 'kinxsound' | 'kinxconnect';

export const SOURCE_PRICE_KIND: Record<string, PriceKind> = {
    'alv-france': 'colcur', avls: 'colcur', 'pa-audio': 'colcur', soundtrade: 'colcur',
    deltalive: 'colcur', cuesale: 'colcur', jsfrance: 'colcur',
    arrius: 'arrius', gearwise: 'gearwise', usedfull: 'usedfull',
    kinxsound: 'kinxsound', kinxconnect: 'kinxconnect',
};
