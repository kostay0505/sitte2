import { parsePrice, normalizeAvailability, normalizeCurrency, parsePlain, parseEu, parseUs } from './normalization.service';

// ТЗ №4 Ч1 п.4 — юнит-тесты на РЕАЛЬНЫХ форматах всех 12 источников
describe('NormalizationService — разбор цены по источникам', () => {
    it('arrius: US-формат $4,800.00 → 4800 USD', () => {
        expect(parsePrice('arrius', { price: '$4,800.00' })).toMatchObject({ amount: 4800, currency: 'USD', error: false });
        expect(parsePrice('arrius', { price: '$35,000.00' })).toMatchObject({ amount: 35000, currency: 'USD' });
    });
    it('gearwise: 100€ VB → 100 EUR + negotiable', () => {
        const r = parsePrice('gearwise', { price: '100€ VB' });
        expect(r).toMatchObject({ amount: 100, currency: 'EUR' });
        expect(r.flags.negotiable).toBe(true);
    });
    it('usedfull: 465 000€ FP → 465000 EUR + fixed_price (НЕ 465!)', () => {
        const r = parsePrice('usedfull', { price: '465 000€ FP' });
        expect(r.amount).toBe(465000);
        expect(r.currency).toBe('EUR');
        expect(r.flags.fixed_price).toBe(true);
    });
    it('usedfull: 675€ FP → 675 EUR', () => {
        expect(parsePrice('usedfull', { price: '675€ FP' }).amount).toBe(675);
    });
    it('kinxsound: priceEur=337599, строку €337.599 НЕ парсит', () => {
        expect(parsePrice('kinxsound', { price: '€337.599', priceEur: 337599 })).toMatchObject({ amount: 337599, currency: 'EUR' });
        expect(parsePrice('kinxsound', { price: '€1.799', priceEur: 1799 }).amount).toBe(1799);
    });
    it('kinxconnect: priceRaw=750 + currency EUR → 750 EUR', () => {
        expect(parsePrice('kinxconnect', { price: '€750', priceRaw: 750, currency: 'EUR' })).toMatchObject({ amount: 750, currency: 'EUR' });
        expect(parsePrice('kinxconnect', { price: '€37.500', priceRaw: 37500, currency: 'EUR' }).amount).toBe(37500);
    });
    it('colcur (avls/cuesale/alv-france): число строкой + колонка currency', () => {
        expect(parsePrice('colcur', { price: '339.00', currency: 'USD' })).toMatchObject({ amount: 339, currency: 'USD' });
        expect(parsePrice('colcur', { price: '95', currency: 'EUR' })).toMatchObject({ amount: 95, currency: 'EUR' });
        expect(parsePrice('colcur', { price: '1000', currency: 'EUR' })).toMatchObject({ amount: 1000, currency: 'EUR' });
    });

    it('нет цены → amount null без ошибки', () => {
        expect(parsePrice('colcur', { price: '', currency: 'EUR' })).toMatchObject({ amount: null, error: false });
        expect(parsePrice('arrius', { price: null })).toMatchObject({ amount: null, error: false });
    });
    it('мусор/нераспознанное → amount null, error=true', () => {
        expect(parsePrice('usedfull', { price: 'FP' })).toMatchObject({ amount: null, error: true });
        expect(parsePrice('colcur', { price: 'TESTVALUE', currency: 'EUR' })).toMatchObject({ amount: null, error: true });
        expect(parsePrice('kinxconnect', { price: '€0', priceRaw: 0, currency: 'EUR' })).toMatchObject({ amount: null, error: true });
    });
    it('вне диапазона (123 млн) → null+error', () => {
        expect(parsePrice('kinxsound', { price: '€123.456.789', priceEur: 123456789 })).toMatchObject({ amount: null, error: true });
    });
});

describe('parse helpers', () => {
    it('parseUs', () => { expect(parseUs('$1,234.56')).toBe(1234.56); });
    it('parseEu тысячи пробелом/точкой', () => {
        expect(parseEu('465 000€')).toBe(465000);
        expect(parseEu('1.200€')).toBe(1200);
        expect(parseEu('337,50€')).toBe(337.5);
    });
    it('parsePlain', () => {
        expect(parsePlain('339.00')).toBe(339);
        expect(parsePlain('1.234')).toBe(1234); // точка = тысячи (3 знака)
    });
});

describe('normalizeAvailability', () => {
    it('маппинг строк наличия в enum', () => {
        expect(normalizeAvailability('In Stock')).toBe('in_stock');
        expect(normalizeAvailability('Out of Stock')).toBe('out_of_stock');
        expect(normalizeAvailability('20 in stock')).toBe('in_stock');
        expect(normalizeAvailability('sold')).toBe('out_of_stock');
        expect(normalizeAvailability(null)).toBe('unknown');
        expect(normalizeAvailability('что-то')).toBe('unknown');
    });
});

describe('normalizeCurrency', () => {
    it('символы и коды', () => {
        expect(normalizeCurrency('EUR')).toBe('EUR');
        expect(normalizeCurrency('usd')).toBe('USD');
        expect(normalizeCurrency('РУБ')).toBe('RUB');
        expect(normalizeCurrency('xxx')).toBe('XXX');
        expect(normalizeCurrency('')).toBe(null);
    });
});
