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
