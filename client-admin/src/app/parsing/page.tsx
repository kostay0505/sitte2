'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/components/AuthWrapper';
import {
    getSourceItems, getSources, getSourceItem,
    siToBase, siArchive, siUnarchive, siTrash, siRestore, siDeleteNow,
    siBulkToBase, siBulkArchive, siBulkTrash,
    getParsers, toggleParser, ParserStatus,
    SourceItemRow, SourceItemFull, SourceTab,
} from '@/api/source-items/methods';
import { ENVIRONMENT_CONFIG } from '@/config/environment';

const LIMIT = 25;
const API = ENVIRONMENT_CONFIG.API_URL;

const TABS: Array<{ key: SourceTab; label: string }> = [
    { key: 'parsing', label: 'Парсинг' },
    { key: 'archive', label: 'Архив' },
    { key: 'trash', label: 'Корзина' },
];

const S = {
    wrap: { padding: 16 } as React.CSSProperties,
    tabs: { display: 'flex', gap: 8, marginBottom: 14 } as React.CSSProperties,
    tab: (a: boolean) => ({ padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, background: a ? '#334155' : '#e2e8f0', color: a ? '#fff' : '#334155', border: 'none' }) as React.CSSProperties,
    controls: { display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' as const, alignItems: 'center' },
    input: { padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minWidth: 220 } as React.CSSProperties,
    select: { padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 } as React.CSSProperties,
    pill: (a: boolean, c = '#334155') => ({ padding: '5px 12px', borderRadius: 20, border: `1px solid ${a ? c : '#e2e8f0'}`, background: a ? c : '#fff', color: a ? '#fff' : '#475569', fontSize: 12, fontWeight: 500, cursor: 'pointer' }) as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' },
    th: { textAlign: 'left' as const, padding: '9px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' as const, cursor: 'pointer', userSelect: 'none' as const },
    td: { padding: '8px 10px', borderTop: '1px solid #eef2f7', verticalAlign: 'top' as const },
    badge: (bg: string, fg: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: bg, color: fg }) as React.CSSProperties,
    btn: (bg: string) => ({ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff', background: bg, marginRight: 6 }) as React.CSSProperties,
    pag: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, color: '#475569' } as React.CSSProperties,
    detail: { background: '#f8fafc', padding: '12px 14px', fontSize: 13, color: '#334155' } as React.CSSProperties,
    thumb: { width: 40, height: 40, objectFit: 'cover' as const, borderRadius: 6, background: '#e2e8f0', cursor: 'pointer' },
};

function siteBadge(s: string | null) {
    if (!s || s === 'available') return <span style={S.badge('#dcfce7', '#166534')}>активен</span>;
    if (s === 'sold') return <span style={S.badge('#fef3c7', '#92400e')}>продан</span>;
    if (s === 'not_found') return <span style={S.badge('#fee2e2', '#991b1b')}>not_found</span>;
    return <span style={S.badge('#e2e8f0', '#475569')}>{s}</span>;
}
function fmtPrice(row: SourceItemRow) {
    if (row.price_amount == null) return <span style={S.badge('#f1f5f9', '#64748b')}>{row.parse_error ? 'цена не распознана' : 'нет цены'}</span>;
    return <span>{Number(row.price_amount).toLocaleString('ru-RU')} {row.price_currency ?? ''}</span>;
}
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—');
function daysLeft(d: string | null) {
    if (!d) return '—';
    const n = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    return n <= 0 ? 'сегодня' : `${n} дн.`;
}
const isNew48 = (d: string | null) => !!d && Date.now() - new Date(d).getTime() < 48 * 3600000;
const imgSrc = (name: string) => (/^https?:\/\//.test(name) ? name : `${API}/files/${name}`);

function ParsingPageInner() {
    const { setPageTitle } = usePageTitle();
    useEffect(() => { setPageTitle('Парсинг — все источники'); }, [setPageTitle]);

    const router = useRouter();
    const sp = useSearchParams();

    // A6: инициализация состояния из URL
    const [tab, setTab] = useState<SourceTab>((sp.get('tab') as SourceTab) || 'parsing');
    const [source, setSource] = useState(sp.get('source') || '');
    const [search, setSearch] = useState(sp.get('search') || '');
    const [searchInput, setSearchInput] = useState(sp.get('search') || '');
    const [sortBy, setSortBy] = useState(sp.get('sortBy') || 'first_seen');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(sp.get('sortDir') === 'asc' ? 'asc' : 'desc');
    const [page, setPage] = useState(Math.max(1, parseInt(sp.get('page') || '1') || 1));
    const [linked, setLinked] = useState<'' | 'linked' | 'unlinked'>((sp.get('linked') as any) || '');
    const [siteStatus, setSiteStatus] = useState(sp.get('site') || '');
    const [noPrice, setNoPrice] = useState(sp.get('noPrice') === '1');
    const [newWithin, setNewWithin] = useState<'' | '24' | '168'>((sp.get('newWithin') as any) || '');
    // #3 per-column фильтры по значению
    const [priceMinInput, setPriceMinInput] = useState(sp.get('priceMin') || '');
    const [priceMaxInput, setPriceMaxInput] = useState(sp.get('priceMax') || '');
    const [priceMin, setPriceMin] = useState(sp.get('priceMin') || '');
    const [priceMax, setPriceMax] = useState(sp.get('priceMax') || '');
    const [dateFrom, setDateFrom] = useState(sp.get('dateFrom') || '');
    // #2 переключатель парсеров
    const [parsers, setParsers] = useState<ParserStatus[]>([]);
    const [parsersOpen, setParsersOpen] = useState(false);

    const [items, setItems] = useState<SourceItemRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [sources, setSources] = useState<Array<{ source: string; cnt: number }>>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [detail, setDetail] = useState<SourceItemFull | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [lightbox, setLightbox] = useState<{ imgs: string[]; i: number } | null>(null);

    useEffect(() => { getSources().then(setSources).catch(() => {}); }, []);
    useEffect(() => { getParsers().then(setParsers).catch(() => {}); }, []);
    useEffect(() => { const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400); return () => clearTimeout(t); }, [searchInput]);
    useEffect(() => { const t = setTimeout(() => { setPriceMin(priceMinInput); setPriceMax(priceMaxInput); setPage(1); }, 400); return () => clearTimeout(t); }, [priceMinInput, priceMaxInput]);

    const doToggleParser = async (source: string) => {
        try { const r = await toggleParser(source); setParsers(ps => ps.map(p => (p.source === r.source ? r : p))); }
        catch (e) { alert((e as Error).message); }
    };

    // A6: синхронизация состояния в URL
    useEffect(() => {
        const q = new URLSearchParams();
        if (tab !== 'parsing') q.set('tab', tab);
        if (source) q.set('source', source);
        if (search) q.set('search', search);
        if (sortBy !== 'first_seen') q.set('sortBy', sortBy);
        if (sortDir !== 'desc') q.set('sortDir', sortDir);
        if (page !== 1) q.set('page', String(page));
        if (linked) q.set('linked', linked);
        if (siteStatus) q.set('site', siteStatus);
        if (noPrice) q.set('noPrice', '1');
        if (newWithin) q.set('newWithin', newWithin);
        if (priceMin) q.set('priceMin', priceMin);
        if (priceMax) q.set('priceMax', priceMax);
        if (dateFrom) q.set('dateFrom', dateFrom);
        const qs = q.toString();
        router.replace(qs ? `/parsing?${qs}` : '/parsing', { scroll: false });
    }, [tab, source, search, sortBy, sortDir, page, linked, siteStatus, noPrice, newWithin, priceMin, priceMax, dateFrom, router]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getSourceItems({
                tab, source: source || undefined, search: search || undefined, sortBy, sortDir, page, limit: LIMIT,
                linked: linked || undefined, siteStatus: siteStatus || undefined, noPrice, newWithin: newWithin || undefined,
                priceMin: priceMin || undefined, priceMax: priceMax || undefined, dateFrom: dateFrom || undefined,
            });
            setItems(data.items);
            setTotal(data.total);
        } catch (e) { alert((e as Error).message); }
        finally { setLoading(false); }
    }, [tab, source, search, sortBy, sortDir, page, linked, siteStatus, noPrice, newWithin, priceMin, priceMax, dateFrom]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setSelected(new Set()); }, [tab, source, search, page, linked, siteStatus, noPrice, newWithin, priceMin, priceMax, dateFrom]);

    const pages = Math.max(1, Math.ceil(total / LIMIT));
    const toggleSort = (col: string) => { if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); else { setSortBy(col); setSortDir('desc'); } setPage(1); };
    const arrow = (col: string) => (sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

    const toggleExpand = async (id: string) => {
        if (expanded === id) { setExpanded(null); setDetail(null); return; }
        setExpanded(id); setDetail(null);
        try { setDetail(await getSourceItem(id)); } catch { /* ignore */ }
    };

    const act = async (id: string, fn: () => Promise<unknown>, confirmText?: string) => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(id);
        try { await fn(); await load(); if (expanded === id) { setExpanded(null); setDetail(null); } }
        catch (e) { alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || (e as Error).message); }
        finally { setBusy(null); }
    };

    const toggleSel = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    const toggleSelAll = () => setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)));

    const bulk = async (fn: (ids: string[]) => Promise<any>, label: string, confirmText?: string) => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy('bulk');
        try {
            const r = await fn([...selected]);
            const parts = [];
            if (r.created != null) parts.push(`создано ${r.created}`);
            if (r.done != null) parts.push(`выполнено ${r.done}`);
            if (r.skipped) parts.push(`пропущено ${r.skipped}`);
            if (r.errors?.length) parts.push(`ошибок ${r.errors.length}`);
            alert(`${label}: ${parts.join(', ') || 'готово'}${r.errors?.length ? '\n' + r.errors.slice(0, 5).join('\n') : ''}`);
            setSelected(new Set());
            await load();
        } catch (e) { alert((e as Error).message); }
        finally { setBusy(null); }
    };

    const cols = useMemo(() => (tab === 'trash' ? 9 : 8), [tab]);
    const openLightbox = (imgs: (string | null | undefined)[], i = 0) => {
        const clean = imgs.filter((x): x is string => !!x);
        if (clean.length) setLightbox({ imgs: clean, i });
    };
    useEffect(() => {
        if (!lightbox) return;
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLightbox(null);
            if (e.key === 'ArrowRight') setLightbox(l => l && { ...l, i: (l.i + 1) % l.imgs.length });
            if (e.key === 'ArrowLeft') setLightbox(l => l && { ...l, i: (l.i - 1 + l.imgs.length) % l.imgs.length });
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [lightbox]);

    return (
        <div style={S.wrap}>
            <div style={S.tabs}>
                {TABS.map(t => (
                    <button key={t.key} style={S.tab(tab === t.key)} onClick={() => { setTab(t.key); setPage(1); setExpanded(null); }}>{t.label}</button>
                ))}
            </div>

            <div style={S.controls}>
                {/* #2: переключатель парсеров */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setParsersOpen(o => !o)} style={{ ...S.select, cursor: 'pointer', fontWeight: 600 }}>
                        ⚙ Парсеры: {parsers.filter(p => p.enabled).length}/{parsers.length} вкл ▾
                    </button>
                    {parsersOpen && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 240, padding: 6 }}>
                            {parsers.map(p => (
                                <div key={p.source} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6 }}>
                                    <span style={{ fontSize: 13, color: '#334155' }}>{p.source}</span>
                                    <button onClick={() => doToggleParser(p.source)}
                                        title={p.enabled ? 'Выключить' : 'Включить'}
                                        style={{ width: 46, height: 24, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', background: p.enabled ? '#22c55e' : '#cbd5e1', transition: 'background .15s' }}>
                                        <span style={{ position: 'absolute', top: 2, left: p.enabled ? 24 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                                    </button>
                                </div>
                            ))}
                            {!parsers.length && <div style={{ padding: 8, fontSize: 13, color: '#94a3b8' }}>Нет данных</div>}
                        </div>
                    )}
                </div>
                <span style={{ fontSize: 13, color: '#64748b' }}>{loading ? 'Загрузка…' : `Найдено: ${total}`}</span>
            </div>

            {/* Фильтры-пилюли */}
            <div style={{ ...S.controls, gap: 6 }}>
                {tab === 'parsing' && (['', 'unlinked', 'linked'] as const).map(v => (
                    <button key={v || 'all'} style={S.pill(linked === v, '#0f766e')} onClick={() => { setLinked(v); setPage(1); }}>
                        {v === '' ? 'Все' : v === 'unlinked' ? 'Не в товарах' : 'В товарах'}
                    </button>
                ))}
                <span style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 4px' }} />
                {([['', 'Все'], ['available', 'активен'], ['sold', 'продан'], ['not_found', 'not_found']] as const).map(([v, l]) => (
                    <button key={v || 'alls'} style={S.pill(siteStatus === v, '#b45309')} onClick={() => { setSiteStatus(v); setPage(1); }}>{l}</button>
                ))}
                <button style={S.pill(noPrice, '#991b1b')} onClick={() => { setNoPrice(v => !v); setPage(1); }}>Без цены</button>
                <span style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 4px' }} />
                {([['', 'Все'], ['24', 'Новые 24ч'], ['168', 'Новые 7д']] as const).map(([v, l]) => (
                    <button key={v || 'alln'} style={S.pill(newWithin === v, '#15803d')} onClick={() => { setNewWithin(v); setPage(1); }}>{l}</button>
                ))}
            </div>

            <table style={S.table}>
                <thead>
                    <tr>
                        <th style={{ ...S.th, width: 32, cursor: 'default' }}><input type='checkbox' checked={selected.size === items.length && items.length > 0} onChange={toggleSelAll} /></th>
                        <th style={{ ...S.th, width: 48, cursor: 'default' }}>Фото</th>
                        <th style={S.th} onClick={() => toggleSort('source')}>Источник{arrow('source')}</th>
                        <th style={S.th} onClick={() => toggleSort('title')}>Название{arrow('title')}</th>
                        <th style={S.th} onClick={() => toggleSort('price')}>Цена{arrow('price')}</th>
                        <th style={{ ...S.th, cursor: 'default' }}>Состояние</th>
                        <th style={S.th} onClick={() => toggleSort('first_seen')}>Дата парсинга{arrow('first_seen')}</th>
                        {tab === 'trash' && <th style={{ ...S.th, cursor: 'default' }}>До удаления</th>}
                        <th style={{ ...S.th, cursor: 'default' }}>Действия</th>
                    </tr>
                    {/* #3: фильтры по значению на каждую колонку */}
                    <tr>
                        <th style={{ ...S.th, cursor: 'default' }} />
                        <th style={{ ...S.th, cursor: 'default' }} />
                        <th style={{ ...S.th, cursor: 'default' }}>
                            <select style={{ ...S.select, padding: '4px 6px', fontSize: 12 }} value={source} onChange={e => { setSource(e.target.value); setPage(1); }}>
                                <option value=''>все</option>
                                {sources.map(s => <option key={s.source} value={s.source}>{s.source}</option>)}
                            </select>
                        </th>
                        <th style={{ ...S.th, cursor: 'default' }}>
                            <input style={{ ...S.input, minWidth: 120, padding: '4px 6px', fontSize: 12 }} placeholder='фильтр…' value={searchInput} onChange={e => setSearchInput(e.target.value)} />
                        </th>
                        <th style={{ ...S.th, cursor: 'default' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <input style={{ width: 52, padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6 }} placeholder='от' value={priceMinInput} onChange={e => setPriceMinInput(e.target.value)} />
                                <input style={{ width: 52, padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6 }} placeholder='до' value={priceMaxInput} onChange={e => setPriceMaxInput(e.target.value)} />
                            </div>
                        </th>
                        <th style={{ ...S.th, cursor: 'default' }}>
                            <select style={{ ...S.select, padding: '4px 6px', fontSize: 12 }} value={siteStatus} onChange={e => { setSiteStatus(e.target.value); setPage(1); }}>
                                <option value=''>все</option>
                                <option value='available'>активен</option>
                                <option value='sold'>продан</option>
                                <option value='not_found'>not_found</option>
                            </select>
                        </th>
                        <th style={{ ...S.th, cursor: 'default' }}>
                            <input type='date' style={{ padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6 }} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
                        </th>
                        {tab === 'trash' && <th style={{ ...S.th, cursor: 'default' }} />}
                        <th style={{ ...S.th, cursor: 'default' }}>
                            {(source || searchInput || priceMinInput || priceMaxInput || siteStatus || dateFrom) && (
                                <button onClick={() => { setSource(''); setSearchInput(''); setPriceMinInput(''); setPriceMaxInput(''); setSiteStatus(''); setDateFrom(''); setPage(1); }}
                                    style={{ padding: '4px 8px', fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#64748b' }}>× сброс</button>
                            )}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(row => (
                        <Fragment key={row.id}>
                            <tr style={{ cursor: 'pointer', background: expanded === row.id ? '#f8fafc' : undefined }} onClick={() => toggleExpand(row.id)}>
                                <td style={S.td} onClick={e => e.stopPropagation()}><input type='checkbox' checked={selected.has(row.id)} onChange={() => toggleSel(row.id)} /></td>
                                <td style={S.td} onClick={e => e.stopPropagation()}>
                                    {row.preview
                                        ? <img src={imgSrc(row.preview)} alt='' style={S.thumb} onClick={() => openLightbox([row.preview])} />
                                        : <div style={{ ...S.thumb, cursor: 'default' }} />}
                                </td>
                                <td style={S.td}>{row.source}</td>
                                <td style={{ ...S.td, maxWidth: 380 }}>
                                    {row.title || <i style={{ color: '#94a3b8' }}>без названия</i>}
                                    {isNew48(row.first_seen) && <span style={{ ...S.badge('#dcfce7', '#15803d'), marginLeft: 6 }}>new</span>}
                                    {row.linked_product_id && <a href='/products' onClick={e => e.stopPropagation()} style={{ ...S.badge('#dbeafe', '#1e40af'), marginLeft: 6, textDecoration: 'none' }}>в товарах ↗</a>}
                                </td>
                                <td style={S.td}>{fmtPrice(row)}</td>
                                <td style={S.td}>{siteBadge(row.site_status)}</td>
                                <td style={S.td}>{fmtDate(row.first_seen)}</td>
                                {tab === 'trash' && <td style={S.td}>{daysLeft(row.delete_after)} <span style={{ color: '#94a3b8' }}>({row.trash_reason})</span></td>}
                                <td style={{ ...S.td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                    {tab !== 'trash' && (
                                        <button style={S.btn('#16a34a')} disabled={busy === row.id || !!row.linked_product_id} title={row.linked_product_id ? 'Черновик уже создан («Товары»)' : 'Создать черновик в «Товары»'} onClick={() => act(row.id, () => siToBase(row.id))}>
                                            {row.linked_product_id ? 'В товарах ✓' : 'В товары'}
                                        </button>
                                    )}
                                    {tab === 'parsing' && <button style={S.btn('#64748b')} disabled={busy === row.id} onClick={() => act(row.id, () => siArchive(row.id))}>Архив</button>}
                                    {tab === 'archive' && <button style={S.btn('#64748b')} disabled={busy === row.id || !row.archived_at} title={row.archived_at ? 'Вернуть в «Парсинг»' : 'Авто-архив источника'} onClick={() => act(row.id, () => siUnarchive(row.id))}>Вернуть</button>}
                                    {tab !== 'trash' && <button style={S.btn('#dc2626')} disabled={busy === row.id} title='В корзину (7 дней)' onClick={() => act(row.id, () => siTrash(row.id))}>В корзину</button>}
                                    {tab === 'trash' && (
                                        <>
                                            <button style={S.btn('#16a34a')} disabled={busy === row.id} onClick={() => act(row.id, () => siRestore(row.id))}>Вернуть</button>
                                            <button style={S.btn('#991b1b')} disabled={busy === row.id} onClick={() => act(row.id, () => siDeleteNow(row.id), 'Удалить позицию НАВСЕГДА вместе с файлами?')}>Удалить сейчас</button>
                                        </>
                                    )}
                                </td>
                            </tr>
                            {expanded === row.id && (
                                <tr>
                                    <td style={S.td} colSpan={cols}>
                                        {!detail ? <div style={S.detail}>Загрузка…</div> : (
                                            <div style={S.detail}>
                                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                                    <div style={{ flex: '1 1 420px', minWidth: 300 }}>
                                                        <p><b>URL:</b> {detail.url ? <a href={detail.url} target='_blank' rel='noreferrer' style={{ color: '#2563eb' }}>{detail.url}</a> : '—'}</p>
                                                        <p><b>external_id:</b> {detail.external_id} · <b>спарсен:</b> {fmtDate(detail.first_seen)} · <b>посл. проверка:</b> {fmtDate(detail.last_seen)}</p>
                                                        <p><b>Оригинальная строка цены:</b> {String((detail.raw as Record<string, unknown>)?.price ?? '—')}{detail.parse_error ? <span style={{ ...S.badge('#fee2e2', '#991b1b'), marginLeft: 6 }}>цена не распознана</span> : null}</p>
                                                        {detail.extra && <p><b>Из источника:</b> {Object.entries(detail.extra).filter(([k, v]) => v != null && v !== '' && !['local_images', 'drive_folder_id'].includes(k)).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') || '—'}</p>}
                                                        {detail.linked_product_id && <p><b>Связанный товар:</b> {detail.linked_custom_id || detail.linked_product_id}</p>}
                                                        <p style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto', background: '#fff', padding: 8, borderRadius: 6 }}>{detail.description || 'Без описания'}</p>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 340 }}>
                                                        {(() => {
                                                            const ex = detail.extra as { local_images?: string[] } | null;
                                                            const imgs = (ex?.local_images?.length ? ex.local_images : detail.images) || [];
                                                            return imgs.slice(0, 6).map((im, i) => (
                                                                <img key={i} src={imgSrc(im)} alt='' style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, background: '#e2e8f0', cursor: 'pointer' }} onClick={() => openLightbox(imgs, i)} />
                                                            ));
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </Fragment>
                    ))}
                    {!items.length && !loading && <tr><td style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 30 }} colSpan={cols}>Пусто</td></tr>}
                </tbody>
            </table>

            <div style={S.pag}>
                <button style={S.btn('#334155')} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Назад</button>
                <span>Стр. {page} из {pages}</span>
                <button style={S.btn('#334155')} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
            </div>

            {/* Липкая панель массовых операций */}
            {selected.size > 0 && (
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 150, background: '#1e293b', color: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: '0 -4px 20px rgba(0,0,0,0.25)' }}>
                    <span style={{ fontWeight: 700 }}>Выбрано: {selected.size}</span>
                    {tab !== 'trash' && <button disabled={busy === 'bulk'} onClick={() => bulk(siBulkToBase, 'В товары')} style={{ ...S.btn('#16a34a'), marginRight: 0 }}>В товары</button>}
                    {tab === 'parsing' && <button disabled={busy === 'bulk'} onClick={() => bulk(siBulkArchive, 'Архив')} style={{ ...S.btn('#64748b'), marginRight: 0 }}>Архив</button>}
                    {tab !== 'trash' && <button disabled={busy === 'bulk'} onClick={() => bulk(siBulkTrash, 'В корзину', `Отправить ${selected.size} позиц. в корзину?`)} style={{ ...S.btn('#dc2626'), marginRight: 0 }}>В корзину</button>}
                    <button onClick={() => setSelected(new Set())} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>× Снять</button>
                </div>
            )}

            {/* Лайтбокс */}
            {lightbox && (
                <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <button onClick={e => { e.stopPropagation(); setLightbox(l => l && { ...l, i: (l.i - 1 + l.imgs.length) % l.imgs.length }); }} style={{ position: 'absolute', left: 20, fontSize: 40, color: '#fff', background: 'none', border: 'none', cursor: 'pointer' }}>‹</button>
                    <img src={imgSrc(lightbox.imgs[lightbox.i])} alt='' style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
                    <button onClick={e => { e.stopPropagation(); setLightbox(l => l && { ...l, i: (l.i + 1) % l.imgs.length }); }} style={{ position: 'absolute', right: 20, fontSize: 40, color: '#fff', background: 'none', border: 'none', cursor: 'pointer' }}>›</button>
                    <span style={{ position: 'absolute', bottom: 20, color: '#fff', fontSize: 13 }}>{lightbox.i + 1} / {lightbox.imgs.length} · Esc — закрыть</span>
                </div>
            )}
        </div>
    );
}

export default function ParsingPage() {
    return (
        <Suspense fallback={<div style={{ padding: 16, color: '#94a3b8' }}>Загрузка…</div>}>
            <ParsingPageInner />
        </Suspense>
    );
}
