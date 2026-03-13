import { api } from '@/api/api';
import type {
  Product,
  ProductBasic,
  ProductsBasicInfoResponse,
  ProductsAvailableQuery,
  CreateProductRequest,
  UpdateProductRequest,
  DeleteProductRequest,
  ToggleFavoriteRequest,
  ViewedProductRequest,
  ActivateProductRequest,
} from './types';
import { cleanParams, pickErrorMessage } from '@/utils/request';

/** GET /products/basic-info — новые, основной продавец, популярные */
export async function getProductsBasicInfo(): Promise<ProductsBasicInfoResponse> {
  try {
    const { data } = await api.get<ProductsBasicInfoResponse>(
      '/products/basic-info',
    );
    return data;
  } catch (error) {
    throw new Error(
      pickErrorMessage(
        error,
        'Не удалось получить базовую информацию по товарам',
      ),
    );
  }
}

export async function getMyProducts(): Promise<ProductBasic[]> {
  try {
    const { data } = await api.get<ProductBasic[]>('/products/my');
    return data;
  } catch (error) {
    throw new Error(
      pickErrorMessage(error, 'Не удалось получить мои объявления'),
    );
  }
}

/** GET /products/available — список доступных объявлений */
export async function getAvailableProducts(
  query?: ProductsAvailableQuery,
): Promise<ProductBasic[]> {
  try {
    const params = cleanParams(query);
    const { data } = await api.get<ProductBasic[]>('/products/available', {
      params,
    });
    return data;
  } catch (error) {
    throw new Error(
      pickErrorMessage(error, 'Не удалось получить список объявлений'),
    );
  }
}

/** GET /products/slug/:slug — детальная информация по slug */
export async function getProductBySlug(slug: string): Promise<Product> {
  try {
    const { data } = await api.get<Product>(`/products/slug/${slug}`);
    return data;
  } catch (error) {
    throw new Error(pickErrorMessage(error, 'Не удалось получить товар'));
  }
}

/** GET /products/:id — детальная информация о товаре */
export async function getProductById(id: string): Promise<Product> {
  try {
    const { data } = await api.get<Product>(`/products/${id}`);
    return data;
  } catch (error) {
    throw new Error(pickErrorMessage(error, 'Не удалось получить товар'));
  }
}

/** POST /products — создание объявления */
export async function createProduct(
  body: CreateProductRequest,
): Promise<Product> {
  try {
    const { data } = await api.post<Product>('/products', body);
    return data;
  } catch (error) {
    throw new Error(pickErrorMessage(error, 'Не удалось создать объявление'));
  }
}

/** PUT /products — редактирование объявления (Response: boolean) */
export async function updateProduct(
  id: string,
  body: UpdateProductRequest,
): Promise<boolean> {
  try {
    const { data } = await api.put<boolean>(`/products/${id}`, body);
    return data;
  } catch (error) {
    throw new Error(pickErrorMessage(error, 'Не удалось обновить объявление'));
  }
}

/** DELETE /products — удаление объявления (body: { id }) (Response: boolean) */
export async function deleteProduct(
  body: DeleteProductRequest,
): Promise<boolean> {
  try {
    // axios.delete передаёт body через config.data
    const { data } = await api.delete<boolean>('/products', { data: body });
    return data;
  } catch (error) {
    throw new Error(pickErrorMessage(error, 'Не удалось удалить объявление'));
  }
}

/** POST /products/favorite — установить/снять “Избранное” (Response: boolean) */
export async function setProductFavorite(
  body: ToggleFavoriteRequest,
): Promise<boolean> {
  try {
    const { data } = await api.post<boolean>('/products/favorite', body);
    return data;
  } catch (error) {
    throw new Error(
      pickErrorMessage(error, 'Не удалось изменить статус избранного'),
    );
  }
}

/** POST /products/viewed — отметить “Просмотрено” (Response: boolean) */
export async function markProductViewed(
  body: ViewedProductRequest,
): Promise<boolean> {
  try {
    const { data } = await api.post<boolean>('/products/viewed', body);
    return data;
  } catch (error) {
    throw new Error(
      pickErrorMessage(error, 'Не удалось отметить товар как просмотренный'),
    );
  }
}

/** PUT /products/toggle-activate — активация вакансии (Response: boolean) */
export async function toggleActivateProduct({
  id,
}: ActivateProductRequest): Promise<boolean> {
  try {
    const { data } = await api.put<boolean>(`/products/toggle-activate/${id}`);
    return data;
  } catch (error) {
    throw new Error(pickErrorMessage(error, 'Не удалось активировать продукт'));
  }
}
