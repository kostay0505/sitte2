'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { usePageTitle } from '@/components/AuthWrapper';
import {
    getSourceItems, getSources, getSourceItem,
    siToBase, siArchive, siUnarchive, siTrash, siRestore, siDeleteNow,
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
    tab: (a: boolean) => ({
        padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
        background: a ? '#334155' : '#e2e8f0', color: a ? '#fff' : '#334155', border: 'none',
    }) as React.CSSProperties,
    controls: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' },
    input: { padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minWidth: 220 } as React.CSSProperties,
    select: { padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' },
    th: { textAlign: 'left' as const, padding: '9px 10px', background: '#f1f5f9', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' as const, cursor: 'pointer', userSelect: 'none' as const },
    td: { padding: '8px 10px', borderTop: '1px solid #eef2f7', verticalAlign: 'top' as const },
    badge: (bg: string, fg: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: bg, color: fg }) as React.CSSProperties,
    btn: (bg: string) => ({ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff', background: bg, marginRight: 6 }) as React.CSSProperties,
    pag: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, color: '#475569' } as React.CSSProperties,
    detail: { background: '#f8fafc', padding: '12px 14px', fontSize: 13, color: '#334155' } as React.CSSProperties,
};

function siteBadge(s: string | null) {
    if (!s || s === 'available') return <span style={S.badge('#dcfce7', '#166534')}>активен</span>;
    if (s === 'sold') return <span style={S.badge('#fef3c7', '#92400e')}>продан</span>;
    if (s === 'not_found') return <span style={S.badge('#fee2e2', '#991b1b')}>not_found</span>;
    return <span style={S.badge('#e2e8f0', '#475569')}>{s}</span>;
}

function fmtPrice(row: SourceItemRow) {
    if (row.price_amount == null) {
        return <span style={S.badge('#f1f5f9', '#64748b')}>{row.parse_error ? 'цена не распознана' : 'нет цены'}</span>;
    }
    return <span>{Number(row.price_amount).toLocaleString('ru-RU')} {row.price_currency ?? ''}</span>;
}

function fmtDate(d: string | null) {
    return d ? new Date(d).toLocaleDateString('ru-RU') : '—';
}

function daysLeft(d: string | null) {
    if (!d) return '—';
    const n = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    return n <= 0 ? 'сегодня' : `${n} дн.`;
}

function imgSrc(name: string) {
    return /^https?:\/\//.test(name) ? name : `${API}/files/${name}`;
}

export default function ParsingPage() {
    const { setPageTitle } = usePageTitle();
    useEffect(() => { setPageTitle('Парсинг — все источники'); }, [setPageTitle]);

    const [tab, setTab] = useState<SourceTab>('parsing');
    const [source, setSource] = useState('');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [sortBy, setSortBy] = useState('first_seen');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<SourceItemRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [sources, setSources] = useState<Array<{ source: string; cnt: number }>>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [detail, setDetail] = useState<SourceItemFull | null>(null);

    useEffect(() => { getSources().then(setSources).catch(() => {}); }, []);
    useEffect(() => { const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400); return () => clearTimeout(t); }, [searchInput]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getSourceItems({ tab, source: source || undefined, search: search || undefined, sortBy, sortDir, page, limit: LIMIT });
            setItems(data.items);
            setTotal(data.total);
        } catch (e) {
            alert((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [tab, source, search, sortBy, sortDir, page]);

    useEffect(() => { load(); }, [load]);

    const pages = Math.max(1, Math.ceil(total / LIMIT));

    const toggleSort = (col: string) => {
        if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortBy(col); setSortDir('desc'); }
        setPage(1);
    };
    const arrow = (col: string) => (sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

    const toggleExpand = async (id: string) => {
        if (expanded === id) { setExpanded(null); setDetail(null); return; }
        setExpanded(id); setDetail(null);
        try { setDetail(await getSourceItem(id)); } catch { /* ignore */ }
    };

    const act = async (id: string, fn: () => Promise<unknown>, confirmText?: string) => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(id);
        try {
            await fn();
            await load();
            if (expanded === id) { setExpanded(null); setDetail(null); }
        } catch (e) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || (e as Error).message;
            alert(msg);
        } finally {
            setBusy(null);
        }
    };

    const cols = useMemo(() => (tab === 'trash' ? 7 : 6), [tab]);

    return (
        <div style={S.wrap}>
            <div style={S.tabs}>
                {TABS.map(t => (
                    <button key={t.key} style={S.tab(tab === t.key)} onClick={() => { setTab(t.key); setPage(1); setExpanded(null); }}>
                        {t.label}
                    </button>
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

            <table style={S.table}>
                <thead>
                    <tr>
                        <th style={S.th} onClick={() => toggleSort('source')}>Источник{arrow('source')}</th>
                        <th style={S.th} onClick={() => toggleSort('title')}>Название{arrow('title')}</th>
                        <th style={S.th} onClick={() => toggleSort('price')}>Цена{arrow('price')}</th>
                        <th style={S.th}>Состояние</th>
                        <th style={S.th} onClick={() => toggleSort('first_seen')}>Дата парсинга{arrow('first_seen')}</th>
                        {tab === 'trash' && <th style={S.th}>До удаления</th>}
                        <th style={S.th}>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(row => (
                        <Fragment key={row.id}>
                            <tr style={{ cursor: 'pointer', background: expanded === row.id ? '#f8fafc' : undefined }}
                                onClick={() => toggleExpand(row.id)}>
                                <td style={S.td}>{row.source}</td>
                                <td style={{ ...S.td, maxWidth: 420 }}>
                                    {row.title || <i style={{ color: '#94a3b8' }}>без названия</i>}
                                    {row.linked_product_id && <span style={{ ...S.badge('#dbeafe', '#1e40af'), marginLeft: 6 }}>уже в базе</span>}
                                </td>
                                <td style={S.td}>{fmtPrice(row)}</td>
                                <td style={S.td}>{siteBadge(row.site_status)}</td>
                                <td style={S.td}>{fmtDate(row.first_seen)}</td>
                                {tab === 'trash' && <td style={S.td}>{daysLeft(row.delete_after)} <span style={{ color: '#94a3b8' }}>({row.trash_reason})</span></td>}
                                <td style={{ ...S.td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                    {tab !== 'trash' && (
                                        <button style={S.btn('#16a34a')} disabled={busy === row.id || !!row.linked_product_id}
                                            title={row.linked_product_id ? 'Уже в базе' : 'Создать черновик товара'}
                                            onClick={() => act(row.id, () => siToBase(row.id))}>
                                            {row.linked_product_id ? 'В базе ✓' : 'В базу'}
                                        </button>
                                    )}
                                    {tab === 'parsing' && (
                                        <button style={S.btn('#64748b')} disabled={busy === row.id}
                                            onClick={() => act(row.id, () => siArchive(row.id))}>Архив</button>
                                    )}
                                    {tab === 'archive' && (
                                        <button style={S.btn('#64748b')} disabled={busy === row.id || !row.archived_at}
                                            title={row.archived_at ? 'Вернуть в «Парсинг»' : 'Авто-архив источника — вернётся сам, если позиция оживёт'}
                                            onClick={() => act(row.id, () => siUnarchive(row.id))}>Вернуть</button>
                                    )}
                                    {tab !== 'trash' && (
                                        <button style={S.btn('#dc2626')} disabled={busy === row.id}
                                            title='В корзину (7 дней до удаления)'
                                            onClick={() => act(row.id, () => siTrash(row.id))}>В корзину</button>
                                    )}
                                    {tab === 'trash' && (
                                        <>
                                            <button style={S.btn('#16a34a')} disabled={busy === row.id}
                                                onClick={() => act(row.id, () => siRestore(row.id))}>Вернуть</button>
                                            <button style={S.btn('#991b1b')} disabled={busy === row.id}
                                                onClick={() => act(row.id, () => siDeleteNow(row.id), 'Удалить позицию НАВСЕГДА вместе с файлами?')}>
                                                Удалить сейчас
                                            </button>
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
                                                        <p><b>URL:</b> {detail.url
                                                            ? <a href={detail.url} target='_blank' rel='noreferrer' style={{ color: '#2563eb' }}>{detail.url}</a>
                                                            : '—'}</p>
                                                        <p><b>external_id:</b> {detail.external_id} · <b>спарсен:</b> {fmtDate(detail.first_seen)} · <b>посл. проверка:</b> {fmtDate(detail.last_seen)}</p>
                                                        <p><b>Оригинальная строка цены:</b> {String((detail.raw as Record<string, unknown>)?.price ?? '—')}
                                                            {detail.parse_error ? <span style={{ ...S.badge('#fee2e2', '#991b1b'), marginLeft: 6 }}>цена не распознана</span> : null}</p>
                                                        {detail.extra && (
                                                            <p><b>Из источника:</b> {Object.entries(detail.extra)
                                                                .filter(([k, v]) => v != null && v !== '' && !['local_images', 'drive_folder_id'].includes(k))
                                                                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') || '—'}</p>
                                                        )}
                                                        {detail.linked_product_id && (
                                                            <p><b>Связанный товар:</b> {detail.linked_custom_id || detail.linked_product_id}</p>
                                                        )}
                                                        <p style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto', background: '#fff', padding: 8, borderRadius: 6 }}>
                                                            {detail.description || 'Без описания'}
                                                        </p>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 340 }}>
                                                        {(() => {
                                                            const ex = detail.extra as { local_images?: string[] } | null;
                                                            const imgs = (ex?.local_images?.length ? ex.local_images : detail.images) || [];
                                                            return imgs.slice(0, 6).map((im, i) => (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img key={i} src={imgSrc(im)} alt='' style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, background: '#e2e8f0' }} />
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
                    {!items.length && !loading && (
                        <tr><td style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 30 }} colSpan={cols}>Пусто</td></tr>
                    )}
                </tbody>
            </table>

            <div style={S.pag}>
                <button style={S.btn('#334155')} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Назад</button>
                <span>Стр. {page} из {pages}</span>
                <button style={S.btn('#334155')} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
            </div>
        </div>
    );
}
