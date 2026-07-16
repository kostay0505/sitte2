import { api } from '@/api/api';

export type SourceTab = 'parsing' | 'archive' | 'trash';

export interface SourceItemRow {
    id: string;
    source: string;
    external_id: string;
    title: string | null;
    price_amount: string | null;
    price_currency: string | null;
    parse_error: number;
    site_status: string | null;
    first_seen: string | null;
    last_seen: string | null;
    archived_at: string | null;
    trashed_at: string | null;
    delete_after: string | null;
    trash_reason: string | null;
    linked_product_id: string | null;
    preview: string | null;
}

export interface SourceItemFull extends SourceItemRow {
    url: string | null;
    description: string | null;
    availability_state: string;
    images: string[] | null;
    extra: Record<string, unknown> | null;
    raw: Record<string, unknown> | null;
    linked_custom_id: string | null;
}

export async function getSourceItems(params: {
    tab: SourceTab; source?: string; search?: string;
    sortBy?: string; sortDir?: 'asc' | 'desc'; page: number; limit: number;
    linked?: 'linked' | 'unlinked'; siteStatus?: string; noPrice?: boolean; newWithin?: '24' | '168';
}): Promise<{ items: SourceItemRow[]; total: number }> {
    const p: Record<string, string> = {
        tab: params.tab, page: String(params.page), limit: String(params.limit),
        sortBy: params.sortBy ?? 'first_seen', sortDir: params.sortDir ?? 'desc',
    };
    if (params.source) p.source = params.source;
    if (params.search) p.search = params.search;
    if (params.linked) p.linked = params.linked;
    if (params.siteStatus) p.siteStatus = params.siteStatus;
    if (params.noPrice) p.noPrice = '1';
    if (params.newWithin) p.newWithin = params.newWithin;
    const { data } = await api.get('/source-items', { params: p });
    return data;
}

export interface BulkResult { created?: number; done?: number; skipped?: number; errors?: string[] }
export const siBulkToBase = (ids: string[]) => api.post('/source-items/bulk/to-base', { ids }).then(r => r.data as BulkResult);
export const siBulkArchive = (ids: string[]) => api.post('/source-items/bulk/archive', { ids }).then(r => r.data as BulkResult);
export const siBulkTrash = (ids: string[]) => api.post('/source-items/bulk/trash', { ids }).then(r => r.data as BulkResult);

export async function getSources(): Promise<Array<{ source: string; cnt: number }>> {
    const { data } = await api.get('/source-items/sources');
    return data;
}

export async function getSourceItem(id: string): Promise<SourceItemFull> {
    const { data } = await api.get(`/source-items/${id}`);
    return data;
}

export const siToBase = (id: string) => api.post(`/source-items/${id}/to-base`).then(r => r.data as { productId: string; customId: string });
export const siArchive = (id: string) => api.post(`/source-items/${id}/archive`);
export const siUnarchive = (id: string) => api.post(`/source-items/${id}/unarchive`);
export const siTrash = (id: string) => api.post(`/source-items/${id}/trash`);
export const siRestore = (id: string) => api.post(`/source-items/${id}/restore`);
export const siDeleteNow = (id: string) => api.post(`/source-items/${id}/delete`);
