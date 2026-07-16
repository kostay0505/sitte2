'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/components/AuthWrapper';
import {
    getSourceItems, getSources, getSourceItem,
    siToBase, siArchive, siUnarchive, siTrash, siRestore, siDeleteNow,
    siBulkToBase, siBulkArchive, siBulkTrash,
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
    useEffect(() => { const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400); return () => clearTimeout(t); }, [searchInput]);

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
        const qs = q.toString();
        router.replace(qs ? `/parsing?${qs}` : '/parsing', { scroll: false });
    }, [tab, source, search, sortBy, sortDir, page, linked, siteStatus, noPrice, newWithin, router]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getSourceItems({
                tab, source: source || undefined, search: search || undefined, sortBy, sortDir, page, limit: LIMIT,
                linked: linked || undefined, siteStatus: siteStatus || undefined, noPrice, newWithin: newWithin || undefined,
            });
            setItems(data.items);
            setTotal(data.total);
        } catch (e) { alert((e as Error).message); }
        finally { setLoading(false); }
    }, [tab, source, search, sortBy, sortDir, page, linked, siteStatus, noPrice, newWithin]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setSelected(new Set()); }, [tab, source, search, page, linked, siteStatus, noPrice, newWithin]);

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
                <select style={S.select} value={source} onChange={e => { setSource(e.target.value); setPage(1); }}>
                    <option value=''>Все источники</option>
                    {sources.map(s => <option key={s.source} value={s.source}>{s.source} ({s.cnt})</option>)}
                </select>
                <input style={S.input} placeholder='Поиск по названию…' value={searchInput} onChange={e => setSearchInput(e.target.value)} />
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
