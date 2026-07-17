import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database } from '../../../database/schema';
import { AvailabilityState, PriceKind, PriceParseResult } from './normalization.types';

// ── Чистые функции разбора (юнит-тестируемы, ТЗ №4 Ч1 п.4) ───────────────────

const CUR_MAP: Record<string, string> = { '€': 'EUR', '$': 'USD', '£': 'GBP', 'РУБ': 'RUB', 'RUR': 'RUB' };
const IN_RANGE = (n: number) => Number.isFinite(n) && n > 0 && n < 100_000_000;

export function normalizeCurrency(c?: string | null): string | null {
    if (!c) return null;
    const s = String(c).trim().toUpperCase();
    if (CUR_MAP[s]) return CUR_MAP[s];
    return /^[A-Z]{3}$/.test(s) ? s : null;
}
export function currencyBySymbol(str?: string | null): string | null {
    if (!str) return null;
    const s = String(str);
    return s.includes('€') ? 'EUR' : s.includes('$') ? 'USD' : s.includes('£') ? 'GBP' : null;
}

/** «число строкой»: "339.00","95","1000". Точка с 1-2 знаками = десятичная, иначе разделитель тысяч. */
export function parsePlain(str?: string | null): number | null {
    if (str == null) return null;
    let s = String(str).replace(/[\s ]/g, '').replace(/[^\d.,-]/g, '');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
    else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes('.') && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}
/** US-формат "$4,800.00": запятая=тысячи, точка=десятичная. */
export function parseUs(str?: string | null): number | null {
    if (str == null) return null;
    const s = String(str).replace(/[\s ]/g, '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}
/** EU-формат "465 000€"/"1.200€"/"337,50€": пробел и точка=тысячи, запятая=десятичная. */
export function parseEu(str?: string | null): number | null {
    if (str == null) return null;
    let s = String(str).replace(/[\s ]/g, '').replace(/[^\d.,-]/g, '');
    if (!s) return null;
    s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

export function parsePrice(kind: PriceKind, row: { price?: string | null; priceEur?: number | null; priceRaw?: number | null; currency?: string | null }): PriceParseResult {
    const flags: PriceParseResult['flags'] = {};
    const raw = row.price == null ? '' : String(row.price).trim();
    const ok = (a: number | null, c: string | null): PriceParseResult =>
        a != null && IN_RANGE(a) ? { amount: a, currency: c, error: false, flags } : { amount: null, currency: c, error: !!raw, flags };
    switch (kind) {
        case 'kinxsound':
            // строку "€337.599" НЕ парсим (точка = тысячи) — берём числовую колонку
            return ok(row.priceEur != null ? Number(row.priceEur) : null, 'EUR');
        case 'kinxconnect':
            return ok(row.priceRaw != null ? Number(row.priceRaw) : null, normalizeCurrency(row.currency));
        case 'arrius':
            if (!raw) return { amount: null, currency: null, error: false, flags };
            return ok(parseUs(raw), currencyBySymbol(raw) || 'USD');
        case 'gearwise':
            if (!raw) return { amount: null, currency: null, error: false, flags };
            if (/VB/i.test(raw)) flags.negotiable = true;
            return ok(parseEu(raw), currencyBySymbol(raw) || 'EUR');
        case 'usedfull':
            if (!raw) return { amount: null, currency: null, error: false, flags };
            if (/FP/i.test(raw)) flags.fixed_price = true;
            if (/VB/i.test(raw)) flags.negotiable = true;
            return ok(parseEu(raw), currencyBySymbol(raw) || 'EUR');
        default: { // colcur
            const cur = normalizeCurrency(row.currency) || currencyBySymbol(raw);
            if (!raw) return { amount: null, currency: cur, error: false, flags };
            return ok(parsePlain(raw), cur);
        }
    }
}

export function normalizeAvailability(v?: string | null): AvailabilityState {
    if (v == null) return 'unknown';
    const s = String(v).trim().toLowerCase();
    if (!s) return 'unknown';
    if (s.includes('out of stock') || s === 'sold' || s === 'out') return 'out_of_stock';
    if (s.includes('in stock') || s === 'available' || s === 'instock') return 'in_stock';
    return 'unknown';
}

// Русские написания брендов → канонические (переиспользуется словарь поиска)
export const BRAND_ALIASES: Record<string, string> = {
    'шур': 'shure', 'шуре': 'shure', 'сенхайзер': 'sennheiser', 'зенхайзер': 'sennheiser',
    'ямаха': 'yamaha', 'динакорд': 'dynacord', 'беринджер': 'behringer', 'берингер': 'behringer',
    'маки': 'mackie', 'макки': 'mackie', 'мидас': 'midas', 'саундкрафт': 'soundcraft',
    'пионер': 'pioneer', 'роланд': 'roland', 'корг': 'korg', 'нексо': 'nexo', 'мейер': 'meyer',
    'мартин': 'martin', 'акг': 'akg', 'джибиэль': 'jbl', 'электровойс': 'electrovoice',
};

@Injectable()
export class NormalizationService {
    constructor(@Inject('DATABASE') private db: Database) {}

    parsePrice = parsePrice;
    normalizeCurrency = normalizeCurrency;
    normalizeAvailability = normalizeAvailability;

    /**
     * ТЗ №4 Ч1 п.5 — подсказка бренда/модели из справочника ProductModels по title.
     * Только при совпадении (тощий/органический справочник → подсказка редка, шума нет).
     * НИКОГДА не автозапись — результат показывается в верстаке черновика.
     */
    async suggest(title: string): Promise<{ brand?: string; model?: string; confidence: number } | null> {
        if (!title || title.trim().length < 3) return null;
        const t = ` ${title.toLowerCase()} `;
        // модели длиной ≥3, чтобы не ловить «X4» в случайных словах — совпадение как отдельный токен
        const rows = (await this.db.execute(sql`
            SELECT brand, model FROM ProductModels
            WHERE model IS NOT NULL AND CHAR_LENGTH(model) >= 3
              AND LOWER(${title}) LIKE CONCAT('%', LOWER(model), '%')
            LIMIT 20
        `)) as unknown as any[];
        let best: { brand?: string; model?: string; confidence: number } | null = null;
        for (const r of (rows[0] as any[])) {
            const model = String(r.model);
            const brand = r.brand ? String(r.brand) : undefined;
            // подтверждаем как отдельный токен (границы не-буквенно-цифровые)
            const re = new RegExp(`(^|[^a-z0-9])${model.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
            if (!re.test(t)) continue;
            const brandHit = brand ? t.includes(brand.toLowerCase()) : false;
            const conf = Math.min(1, model.length / 10) * (brandHit ? 1 : 0.7);
            if (!best || conf > best.confidence) best = { brand, model, confidence: Number(conf.toFixed(2)) };
        }
        return best;
    }

    /** «+ в справочник» (ТЗ №4 Ч1 п.6) — создать запись бренд+модель в один клик */
    async addToGlossary(brand: string, model: string, brandId?: string | null): Promise<{ ok: boolean }> {
        const b = (brand || '').trim();
        const m = (model || '').trim();
        if (!b || !m) return { ok: false };
        const exists = (await this.db.execute(sql`
            SELECT id FROM ProductModels WHERE LOWER(brand) = LOWER(${b}) AND LOWER(model) = LOWER(${m}) LIMIT 1
        `)) as unknown as any[];
        if ((exists[0] as any[]).length) return { ok: true };
        await this.db.execute(sql`
            INSERT INTO ProductModels (id, brandId, brand, model, createdAt, updatedAt)
            VALUES (${crypto.randomUUID()}, ${brandId ?? null}, ${b}, ${m}, NOW(), NOW())
        `);
        return { ok: true };
    }
}
