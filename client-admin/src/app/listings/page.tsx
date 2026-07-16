'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getAdminListingsPaged, getListingCounters, getProductReview, markReviewed,
    bulkListingStatus, bulkMarkReviewed, setListingStatus, deleteAdminProduct, updateProduct,
    AdminListing,
} from '@/api/products/methods';
import { getAllBrands } from '@/api/brands/methods';
import { getAllCategories } from '@/api/categories/methods';
import { CurrencyList, QuantityType, ProductStatus } from '@/api/products/models';
import { usePageTitle } from '@/components/AuthWrapper';
import { useNotification } from '@/hooks/useNotification';
import { Notification } from '@/components/ui/Notification/Notification';
import { AdminForm, FormField } from '@/components/AdminForm/AdminForm';
import { apiUrl } from '@/api/api';
import Image from 'next/image';

const ADMIN_USER_ID = '6737529504';
const LIMIT = 25;

type ListingStatus = 'active' | 'inactive' | 'sold';

function getListingStatus(p: AdminListing): ListingStatus {
    if (p.status === ProductStatus.SOLD) return 'sold';
    if (!p.isActive) return 'inactive';
    return 'active';
}

const STATUS_CONFIG: Record<ListingStatus, { label: string; bg: string; color: string }> = {
    active:   { label: 'Активно',    bg: '#dcfce7', color: '#15803d' },
    inactive: { label: 'Не активно', bg: '#f1f5f9', color: '#64748b' },
    sold:     { label: 'Продано',    bg: '#dbeafe', color: '#1d4ed8' },
};

function SourceBadge({ p }: { p: AdminListing }) {
    if (!p.sourceItemId) return <span style={{ color: '#cbd5e1' }}>—</span>;
    const s = p.sourceSiteStatus;
    const cfg = s === 'sold' ? { t: '🟡 продан', bg: '#fef3c7', c: '#92400e' }
        : s === 'not_found' ? { t: '🔴 пропал', bg: '#fee2e2', c: '#991b1b' }
        : { t: '🟢 активен', bg: '#dcfce7', c: '#166534' };
    const seen = p.sourceLastSeen ? new Date(p.sourceLastSeen).toLocaleDateString('ru-RU') : '—';
    return (
        <span title={`Последний раз видели живым на источнике: ${seen}`}
            style={{ background: cfg.bg, color: cfg.c, borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {cfg.t}
        </span>
    );
}

function StatusBadge({ status, onChange }: { status: ListingStatus; onChange: (s: ListingStatus) => void }) {
    const [open, setOpen] = useState(false);
    const cfg = STATUS_CONFIG[status];
    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button onClick={() => setOpen(o => !o)}
                style={{ background: cfg.bg, color: cfg.color, border: 'none', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {cfg.label} ▾
            </button>
            {open && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden', minWidth: 130 }}>
                    {(Object.keys(STATUS_CONFIG) as ListingStatus[]).map(s => (
                        <button key={s} onClick={() => { onChange(s); setOpen(false); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: s === status ? '#f8fafc' : '#fff', color: STATUS_CONFIG[s].color, fontSize: 13, fontWeight: s === status ? 600 : 400, cursor: 'pointer' }}>
                            {STATUS_CONFIG[s].label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%' }}>
                <p style={{ marginBottom: 20, fontSize: 15, color: '#1e293b', lineHeight: 1.5 }}>{message}</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
                    <button onClick={onConfirm} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Удалить</button>
                </div>
            </div>
        </div>
    );
}

export default function ListingsPage() {
    const { setPageTitle } = usePageTitle();
    const { notification, showNotification } = useNotification();

    const [listings, setListings] = useState<AdminListing[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [brands, setBrands] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [counters, setCounters] = useState({ total: 0, active: 0, inactive: 0, sold: 0, onRequest: 0, needsReview: 0 });

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<ListingStatus | ''>('');
    const [problemSource, setProblemSource] = useState(false);
    const [needsReview, setNeedsReview] = useState(false);
    const [sortBy, setSortBy] = useState<'updated' | 'price' | 'name'>('updated');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [editingProduct, setEditingProduct] = useState<AdminListing | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [selectedFormCategory, setSelectedFormCategory] = useState('');
    const [reviewText, setReviewText] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<AdminListing | null>(null);

    useEffect(() => { setPageTitle('Мои объявления'); }, [setPageTitle]);
    useEffect(() => { getAllBrands().then(setBrands).catch(() => {}); getAllCategories().then(setCategories).catch(() => {}); }, []);
    useEffect(() => { const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400); return () => clearTimeout(t); }, [searchInput]);

    const pages = Math.max(1, Math.ceil(total / LIMIT));

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [res, cnt] = await Promise.all([
                getAdminListingsPaged({ page, limit: LIMIT, search: search || undefined, status: filterStatus || undefined, sortBy, sortDir, problemSource, needsReview }),
                getListingCounters(),
            ]);
            setListings(res.items);
            setTotal(res.total);
            setCounters(cnt);
        } catch (e: any) {
            showNotification({ message: e.message || 'Ошибка загрузки', type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [page, search, filterStatus, sortBy, sortDir, problemSource, needsReview]);

    useEffect(() => { loadData(); }, [loadData]);

    const toggleSort = (col: 'updated' | 'price' | 'name') => {
        if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortBy(col); setSortDir(col === 'updated' ? 'asc' : 'asc'); }
        setPage(1);
    };
    const arrow = (col: string) => (sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

    const handleStatusChange = async (product: AdminListing, newStatus: ListingStatus) => {
        try {
            await setListingStatus(product.id, newStatus);
            showNotification({ message: 'Статус обновлён', type: 'success' });
            await loadData();
        } catch (e: any) { showNotification({ message: e.message, type: 'error' }); }
    };

    const handleReviewed = async (product: AdminListing) => {
        try {
            await markReviewed(product.id);
            showNotification({ message: 'Отмечено как проверенное', type: 'success' });
            await loadData();
        } catch (e: any) { showNotification({ message: e.message, type: 'error' }); }
    };

    const handleDelete = async (product: AdminListing) => {
        try {
            await deleteAdminProduct(product.id);
            showNotification({ message: 'Объявление удалено', type: 'success' });
            await loadData();
        } catch (e: any) { showNotification({ message: e.message, type: 'error' }); }
        finally { setConfirmDelete(null); }
    };

    const mainCategories = categories.filter(c => !c.parentId);

    const handleEdit = async (product: AdminListing) => {
        setEditingProduct(product);
        const currentCategory = categories.find(c => c.id === product.category?.id);
        const isSubcat = currentCategory?.parentId;
        const catId = isSubcat ? currentCategory?.parentId || '' : product.category?.id || '';
        setSelectedFormCategory(catId);
        setFormData({
            customId: product.customId || '', name: product.name,
            priceCash: Number(product.priceCash), priceNonCash: Number(product.priceNonCash),
            currency: product.currency, preview: product.preview, files: product.files || [],
            description: product.description, categoryId: catId,
            subcategoryId: isSubcat ? product.category?.id || '' : '',
            brandId: product.brand?.id || '', quantity: product.quantity, quantityType: product.quantityType,
            isActive: Boolean(product.isActive),
        });
        setReviewText(null);
        setIsModalOpen(true);
        if (product.hasPendingReview) {
            try {
                const rq = await getProductReview(product.id);
                const priceRec = rq.find(r => r.field === 'priceCash');
                const reason = rq[0]?.reason || 'review';
                const wasPrice = priceRec?.old_value != null ? `было: ${Number(priceRec.old_value).toLocaleString('ru-RU')} ${product.currency}` : '';
                setReviewText(`⚠ Требует проверки (${reason}). ${wasPrice}\nПоставьте актуальную цену и нажмите «Сохранить», либо смените статус на «Продано». Затем «Проверено» в строке снимет метку.`);
            } catch { setReviewText('⚠ Требует проверки (плейсхолдер).'); }
        }
    };

    const getFormFields = (): FormField[] => {
        const base: FormField[] = [
            { name: 'customId', label: 'ID объявления', type: 'text', placeholder: 'TE-0001' },
            { name: 'name', label: 'Название', type: 'text', required: true },
            { name: 'priceCash', label: 'Цена (наличные)', type: 'number' },
            { name: 'priceNonCash', label: 'Цена (безнал)', type: 'number' },
            { name: 'currency', label: 'Валюта', type: 'select', required: true, options: Object.values(CurrencyList).map(v => ({ value: v, label: v })) },
            { name: 'preview', label: 'Превью', type: 'file', accept: 'image/*' },
            { name: 'files', label: 'Доп. фото', type: 'file', accept: 'image/*,video/*', multiple: true },
            { name: 'description', label: 'Описание', type: 'textarea', required: true },
            { name: 'categoryId', label: 'Категория', type: 'select', required: true, options: mainCategories.map(c => ({ value: c.id, label: c.name })) },
            { name: 'subcategoryId', label: 'Подкатегория', type: 'select', options: categories.filter(c => c.parentId === selectedFormCategory).map(c => ({ value: c.id, label: c.name })) },
            { name: 'brandId', label: 'Бренд', type: 'select', required: true, options: brands.map(b => ({ value: b.id, label: b.name })) },
            { name: 'quantity', label: 'Количество', type: 'number', required: true },
            { name: 'quantityType', label: 'Тип', type: 'select', required: true, options: [{ value: QuantityType.PIECE, label: 'Штуки' }, { value: QuantityType.SET, label: 'Комплекты' }] },
            { name: 'isActive', label: 'Активно', type: 'checkbox' },
        ];
        if (reviewText) base.unshift({ name: '_review', label: 'Проверка', type: 'info', infoText: reviewText });
        return base;
    };

    const handleSave = async (data: any) => {
        if (!editingProduct) return;
        setIsSubmitting(true);
        try {
            const processedData: any = { ...data };
            delete processedData._review;
            if (!processedData.priceCash) processedData.priceCash = 0;
            if (!processedData.priceNonCash) processedData.priceNonCash = 0;
            if (processedData.subcategoryId) processedData.categoryId = processedData.subcategoryId;
            delete processedData.subcategoryId;
            if (!Array.isArray(processedData.files)) processedData.files = [];
            await updateProduct(editingProduct.id, { ...processedData, userId: ADMIN_USER_ID, status: ProductStatus.APPROVED });
            showNotification({ message: 'Сохранено', type: 'success' });
            await loadData();
            setIsModalOpen(false);
            setEditingProduct(null);
        } catch (e: any) { showNotification({ message: e.message, type: 'error' }); }
        finally { setIsSubmitting(false); }
    };

    const handleFormFieldChange = (fieldName: string, _value: any, currentFormData: any) => {
        setFormData(currentFormData);
        if (fieldName === 'categoryId') { setSelectedFormCategory(_value); setFormData(prev => ({ ...prev, subcategoryId: '' })); }
    };

    // ── Массовые операции ─────────────────────────────────────────────────────
    const toggleSelect = (id: string) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    const toggleSelectAll = () => setSelectedIds(prev => prev.size === listings.length ? new Set() : new Set(listings.map(l => l.id)));
    const bulkStatus = async (status: ListingStatus) => {
        try { const r = await bulkListingStatus([...selectedIds], status); showNotification({ message: `Обновлено: ${r.updated}`, type: 'success' }); setSelectedIds(new Set()); await loadData(); }
        catch (e: any) { showNotification({ message: e.message, type: 'error' }); }
    };
    const bulkReviewed = async () => {
        try { const r = await bulkMarkReviewed([...selectedIds]); showNotification({ message: `Проверено: ${r.updated}`, type: 'success' }); setSelectedIds(new Set()); await loadData(); }
        catch (e: any) { showNotification({ message: e.message, type: 'error' }); }
    };

    const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' };
    const thSort: React.CSSProperties = { ...th, cursor: 'pointer', userSelect: 'none' };
    const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#1e293b', verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' };

    return (
        <div>
            {/* Stats */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                    { label: 'Всего', value: counters.total, color: '#1e293b', bg: '#f8fafc' },
                    { label: 'Активных', value: counters.active, color: '#15803d', bg: '#dcfce7' },
                    { label: 'Не активных', value: counters.inactive, color: '#64748b', bg: '#f1f5f9' },
                    { label: 'Продано', value: counters.sold, color: '#1d4ed8', bg: '#dbeafe' },
                    { label: 'По запросу', value: counters.onRequest, color: '#b45309', bg: '#fef3c7' },
                    { label: 'Требует проверки', value: counters.needsReview, color: '#92400e', bg: '#ffedd5' },
                ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '14px 20px', minWidth: 100 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="Поиск по названию или ID..." value={searchInput} onChange={e => setSearchInput(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 260 }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {([['', 'Все'], ['active', 'Активные'], ['inactive', 'Не активные'], ['sold', 'Проданные']] as [string, string][]).map(([val, label]) => (
                        <button key={val} onClick={() => { setFilterStatus(val as any); setPage(1); }}
                            style={{ padding: '7px 14px', borderRadius: 20, border: '1px solid #e2e8f0', background: filterStatus === val ? '#1e293b' : '#fff', color: filterStatus === val ? '#fff' : '#64748b', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                            {label}
                        </button>
                    ))}
                    <button onClick={() => { setProblemSource(v => !v); setPage(1); }}
                        style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${problemSource ? '#dc2626' : '#e2e8f0'}`, background: problemSource ? '#fee2e2' : '#fff', color: problemSource ? '#991b1b' : '#64748b', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        ⚠ Проблема на источнике
                    </button>
                    <button onClick={() => { setNeedsReview(v => !v); setPage(1); }}
                        style={{ padding: '7px 14px', borderRadius: 20, border: `1px solid ${needsReview ? '#b45309' : '#e2e8f0'}`, background: needsReview ? '#fef3c7' : '#fff', color: needsReview ? '#92400e' : '#64748b', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        ⚠ Требует проверки ({counters.needsReview})
                    </button>
                </div>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Загрузка...</div>
                ) : listings.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Объявлений нет</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                    <th style={{ ...th, width: 36 }}><input type="checkbox" checked={selectedIds.size === listings.length && listings.length > 0} onChange={toggleSelectAll} /></th>
                                    <th style={th}>ID</th>
                                    <th style={th}>Фото</th>
                                    <th style={{ ...thSort, minWidth: 200 }} onClick={() => toggleSort('name')}>Название{arrow('name')}</th>
                                    <th style={th}>Категория</th>
                                    <th style={th}>Бренд</th>
                                    <th style={thSort} onClick={() => toggleSort('price')}>Цена{arrow('price')}</th>
                                    <th style={th}>Источник</th>
                                    <th style={th}>Статус</th>
                                    <th style={thSort} onClick={() => toggleSort('updated')}>Обновлено{arrow('updated')}</th>
                                    <th style={th}>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {listings.map(product => (
                                    <tr key={product.id}>
                                        <td style={td}><input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleSelect(product.id)} /></td>
                                        <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, color: '#64748b', fontSize: 12 }}>
                                            {product.customId || '—'}
                                            {product.hasPendingReview && <span title="Требует проверки" style={{ marginLeft: 4 }}>⚠</span>}
                                        </td>
                                        <td style={td}>
                                            {product.preview ? (
                                                <Image src={`${apiUrl}/files/${product.preview}`} alt={product.name} width={48} height={48} style={{ borderRadius: 6, objectFit: 'cover' }} unoptimized />
                                            ) : <div style={{ width: 48, height: 48, background: '#f1f5f9', borderRadius: 6 }} />}
                                        </td>
                                        <td style={td}><div style={{ fontWeight: 500, lineHeight: 1.3 }}>{product.name}</div></td>
                                        <td style={{ ...td, color: '#64748b' }}>{product.category?.name || '—'}</td>
                                        <td style={{ ...td, color: '#64748b' }}>{product.brand?.name || '—'}</td>
                                        <td style={{ ...td, fontWeight: 600 }}>{Number(product.priceCash) === 0 ? 'По запросу' : `${Number(product.priceCash).toLocaleString()} ${product.currency}`}</td>
                                        <td style={td}><SourceBadge p={product} /></td>
                                        <td style={td}><StatusBadge status={getListingStatus(product)} onChange={s => handleStatusChange(product, s)} /></td>
                                        <td style={{ ...td, color: '#94a3b8', whiteSpace: 'nowrap' }}>{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString('ru-RU') : '—'}</td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                <button onClick={() => handleEdit(product)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Изменить</button>
                                                {product.hasPendingReview && (
                                                    <button onClick={() => handleReviewed(product)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Проверено</button>
                                                )}
                                                <button onClick={() => setConfirmDelete(product)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Удалить</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, color: '#475569' }}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>← Назад</button>
                <span>Стр. {page} из {pages} · всего {total}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: page >= pages ? 'default' : 'pointer', opacity: page >= pages ? 0.4 : 1 }}>Вперёд →</button>
            </div>

            {/* Edit modal */}
            <AdminForm
                title="Редактировать объявление"
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingProduct(null); }}
                onSubmit={handleSave}
                fields={getFormFields()}
                initialData={Object.keys(formData).length > 0 ? formData : {}}
                isSubmitting={isSubmitting}
                submitButtonText="Сохранить"
                onFieldChange={handleFormFieldChange}
            />

            {confirmDelete && (
                <ConfirmDialog message={`Удалить объявление «${confirmDelete.name}»? Оно исчезнет с сайта.`}
                    onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
            )}

            {/* Sticky bulk panel */}
            {selectedIds.size > 0 && (
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 150, background: '#1e293b', color: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: '0 -4px 20px rgba(0,0,0,0.25)' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Выбрано: {selectedIds.size}</span>
                    <span style={{ fontSize: 13, color: '#cbd5e1' }}>Статус:</span>
                    <button onClick={() => bulkStatus('active')} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Активно</button>
                    <button onClick={() => bulkStatus('inactive')} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#64748b', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Не активно</button>
                    <button onClick={() => bulkStatus('sold')} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Продано</button>
                    <button onClick={bulkReviewed} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Проверено</button>
                    <button onClick={() => setSelectedIds(new Set())} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>× Снять</button>
                </div>
            )}

            {notification && <Notification message={notification.message} type={notification.type} onClose={notification.onClose} />}
        </div>
    );
}
