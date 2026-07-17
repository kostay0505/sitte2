import { api } from '@/api/api';
import { Product } from './models';

export async function getAllProducts(): Promise<Product[]> {
    try {
        const [productsResponse, viewCountsResponse] = await Promise.all([
            api.get<Product[]>('/products'),
            api.get<{ productId: string; viewCount: number }[]>('/viewed-products/counts')
        ]);

        const viewCountsMap = new Map(
            viewCountsResponse.data.map(item => [item.productId, item.viewCount])
        );

        return productsResponse.data.map(product => ({
            ...product,
            viewCount: viewCountsMap.get(product.id) || 0
        }));
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось загрузить товары');
    }
}

/** Физическое удаление черновика (ТЗ №2-fix2). Бэк откажет для опубликованных и со ссылками. */
export async function hardDeleteProduct(id: string): Promise<void> {
    await api.delete(`/products/admin/${id}/hard`);
}

/** Статусы автоскачивания фото (Шаг 3): product_id → {state, downloaded, total} */
export interface PhotoStatus {
    product_id: string;
    state: 'pending' | 'running' | 'done' | 'error' | null;
    downloaded: number | null;
    total: number | null;
    last_error: string | null;
}
export async function getPhotoStatuses(): Promise<PhotoStatus[]> {
    const response = await api.get<PhotoStatus[]>('/source-items/photo-statuses');
    return response.data;
}

/** «Скачать фото заново» — перекачка с URL исходной позиции */
export async function retryPhotos(productId: string): Promise<{ total: number }> {
    const response = await api.post<{ total: number }>(`/source-items/photo-retry/${productId}`);
    return response.data;
}

// ── ТЗ №4 Ч4.4: Google Sheets ──
export async function getSheetsStatuses(): Promise<{ product_id: string; sent: boolean }[]> {
    const { data } = await api.get('/products/admin/sheets-statuses');
    return data;
}
export async function exportProductSheets(id: string): Promise<{ ok: boolean }> {
    const { data } = await api.post(`/products/admin/${id}/export-to-sheets`);
    return data;
}
export async function bulkExportSheets(ids: string[]): Promise<{ exported: number; errors: string[] }> {
    const { data } = await api.post('/products/admin/export-to-sheets', { ids });
    return data;
}

export async function getProductById(id: string): Promise<Product> {
    try {
        const response = await api.get<Product>(`/products/${id}`);
        return response.data;
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось загрузить товар');
    }
}

export async function createProduct(data: Omit<Product, 'id'>): Promise<Product> {
    try {
        const response = await api.post<Product>('/products/admin', data);
        return response.data;
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось создать товар');
    }
}

export async function updateProduct(id: string, data: Partial<Omit<Product, 'id'>>, forceNoPhotos = false): Promise<Product> {
    try {
        const response = await api.put<Product>(`/products/admin/${id}${forceNoPhotos ? '?forceNoPhotos=1' : ''}`, data);
        return response.data;
    } catch (error: any) {
        if (error?.response?.data?.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error('Не удалось обновить товар');
    }
}

export async function getAdminListings(userId?: string): Promise<Product[]> {
    try {
        const params = userId ? `?userId=${userId}` : '';
        const response = await api.get<Product[]>(`/products/admin/listings${params}`);
        return response.data;
    } catch (error: any) {
        if (error?.response?.data?.message) throw new Error(error.response.data.message);
        throw new Error('Не удалось загрузить объявления');
    }
}

export async function setListingStatus(id: string, listingStatus: 'active' | 'inactive' | 'sold'): Promise<void> {
    try {
        await api.patch(`/products/admin/${id}/listing-status`, { listingStatus });
    } catch (error: any) {
        if (error?.response?.data?.message) throw new Error(error.response.data.message);
        throw new Error('Не удалось изменить статус');
    }
}

export async function deleteAdminProduct(id: string): Promise<void> {
    try {
        await api.delete(`/products/admin/${id}`);
    } catch (error: any) {
        if (error?.response?.data?.message) throw new Error(error.response.data.message);
        throw new Error('Не удалось удалить объявление');
    }
}

// ── ТЗ №2-fix4: пагинация / live-статус источника / review ──────────────────

export interface AdminListing {
    id: string; customId: string | null; name: string; slug: string | null; brandSlug: string | null;
    priceCash: string; priceNonCash: string; currency: string; preview: string; files: string[];
    description: string; quantity: number; quantityType: string; status: string;
    isActive: boolean; isDeleted: boolean; createdAt: string; updatedAt: string;
    category: { id: string; name: string } | null; brand: { id: string; name: string } | null;
    sourceItemId: string | null; sourceSiteStatus: string | null; sourceLastSeen: string | null;
    hasPendingReview: boolean;
}

export async function getAdminListingsPaged(params: {
    page: number; limit: number; search?: string;
    status?: 'active' | 'inactive' | 'sold'; sortBy?: 'updated' | 'price' | 'name'; sortDir?: 'asc' | 'desc';
    problemSource?: boolean; needsReview?: boolean;
}): Promise<{ items: AdminListing[]; total: number }> {
    const q: Record<string, string> = {
        page: String(params.page), limit: String(params.limit),
        sortBy: params.sortBy ?? 'updated', sortDir: params.sortDir ?? 'asc',
    };
    if (params.search) q.search = params.search;
    if (params.status) q.status = params.status;
    if (params.problemSource) q.problemSource = '1';
    if (params.needsReview) q.needsReview = '1';
    const { data } = await api.get('/products/admin/listings/paged', { params: q });
    return data;
}

export async function getListingCounters(): Promise<{
    total: number; active: number; inactive: number; sold: number; onRequest: number; needsReview: number;
}> {
    const { data } = await api.get('/products/admin/listing-counters');
    return data;
}

export async function getProductReview(id: string): Promise<Array<{ field: string; reason: string; old_value: string | null }>> {
    const { data } = await api.get(`/products/admin/${id}/review`);
    return data;
}

export async function markReviewed(id: string): Promise<void> {
    await api.post(`/products/admin/${id}/reviewed`);
}

export async function bulkListingStatus(ids: string[], status: 'active' | 'inactive' | 'sold'): Promise<{ updated: number }> {
    const { data } = await api.post('/products/admin/listings/bulk-status', { ids, status });
    return data;
}

export async function bulkMarkReviewed(ids: string[]): Promise<{ updated: number }> {
    const { data } = await api.post('/products/admin/listings/bulk-reviewed', { ids });
    return data;
}
