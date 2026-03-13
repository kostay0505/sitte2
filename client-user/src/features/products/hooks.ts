'use client';

import {
  createProduct,
  deleteProduct,
  getAvailableProducts,
  getMyProducts,
  getProductById,
  getProductBySlug,
  getProductsBasicInfo,
  setProductFavorite,
  toggleActivateProduct,
  updateProduct,
} from '@/api/products/methods';
import type {
  ActivateProductRequest,
  CreateProductRequest,
  Product,
  ProductBasic,
  ProductsAvailableQuery,
  UpdateProductRequest,
} from '@/api/products/types';
import { QK } from '@/lib/queryKeys';
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

type InfiniteProductsOpts = {
  enabled?: boolean;
};

function patchFavoriteInProductsCache(
  qc: ReturnType<typeof useQueryClient>,
  productId: string,
  next: boolean,
) {
  // Пройдёмся по всем кэшам, где ключ начинается с 'products'
  const entries = qc.getQueriesData({ queryKey: ['products'] });

  entries.forEach(([key, data]) => {
    if (!data) return;

    // 1) infinite-пагинация со страницами ProductBasic[]
    const isInfinite =
      typeof (data as any) === 'object' &&
      data &&
      Array.isArray((data as any).pages);

    if (isInfinite) {
      const inf = data as InfiniteData<ProductBasic[]>;
      const patched: InfiniteData<ProductBasic[]> = {
        pageParams: [...inf.pageParams],
        pages: inf.pages.map(page =>
          page.map(item =>
            item.id === productId ? { ...item, isFavorite: next } : item,
          ),
        ),
      };
      qc.setQueryData(key, patched);
      return;
    }

    // 2) одиночный продукт (byId)
    const isSingleProduct =
      typeof (data as any) === 'object' &&
      (data as any).id &&
      (data as any).name !== undefined;

    if (isSingleProduct) {
      const p = data as Product;
      if (p.id === productId) {
        qc.setQueryData(key, { ...p, isFavorite: next });
      }
      return;
    }

    // 3) на всякий случай — плоский массив ProductBasic[]
    if (Array.isArray(data)) {
      const arr = data as ProductBasic[];
      const patched = arr.map(item =>
        item.id === productId ? { ...item, isFavorite: next } : item,
      );
      qc.setQueryData(key, patched);
    }
  });
}

export function useProductsBasicInfo() {
  return useQuery({
    queryKey: QK.products.basicInfo(),
    queryFn: getProductsBasicInfo,
  });
}

export function useMyProducts() {
  return useQuery<ProductBasic[]>({
    queryKey: QK.products.my(),
    queryFn: getMyProducts,
  });
}

export function useInfiniteProducts(
  q: ProductsAvailableQuery,
  opts: InfiniteProductsOpts = {},
) {
  const limit = q.limit ?? 24;

  return useInfiniteQuery<
    ProductBasic[], // одна страница
    Error,
    ProductBasic[], // итоговые данные страницы
    ReturnType<typeof QK.products.available>, // ключ
    number // pageParam (offset)
  >({
    queryKey: QK.products.available(q),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getAvailableProducts({ ...q, limit, offset: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + p.length, 0);
      return lastPage.length < limit ? undefined : loaded;
    },
    enabled: opts.enabled,
  });
}

//обёртка: возвращает сразу плоский массив items
export function useInfiniteProductsFlat(
  q: ProductsAvailableQuery,
  opts: InfiniteProductsOpts = {},
) {
  const res = useInfiniteProducts(q, opts);

  const pages =
    (res.data as InfiniteData<ProductBasic[]> | undefined)?.pages ?? [];

  const items = pages.flat();

  // вернём всё, что обычно есть у useInfiniteQuery + items
  return { ...res, items };
}

export function useProduct(id?: string) {
  return useQuery<Product>({
    enabled: !!id,
    queryKey: QK.products.byId(id || ''),
    queryFn: () => getProductById(id!),
  });
}

export function useProductBySlug(slug?: string) {
  return useQuery<Product>({
    enabled: !!slug,
    queryKey: QK.products.bySlug(slug || ''),
    queryFn: () => getProductBySlug(slug!),
  });
}

export function useToggleFavorite(productId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (next: boolean) =>
      setProductFavorite({ id: productId, isFavorite: next }),

    // Оптимистично меняем кэш до ответа сервера
    onMutate: async next => {
      await qc.cancelQueries({ queryKey: ['products'] });

      const snapshot = qc.getQueriesData({ queryKey: ['products'] });
      // сохраним снимок на случай отката
      const prev = snapshot.map(([key, data]) => [key, data] as const);

      patchFavoriteInProductsCache(qc, productId, next);

      return { prev };
    },

    // Откат при ошибке
    onError: (_err, _vars, ctx) => {
      if (!ctx?.prev) return;
      ctx.prev.forEach(([key, data]) => qc.setQueryData(key, data));
    },

    // На всякий случай подтянем правду с сервера
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateProductRequest) => createProduct(body),
    onSuccess: () => {
      // на всякий случай освежим списки
      qc.invalidateQueries({ queryKey: QK.products.basicInfo() });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProductRequest }) =>
      updateProduct(id, body),
    onSuccess: (_res, { id }) => {
      // обновим кэш конкретного товара и список
      qc.invalidateQueries({ queryKey: QK.products.byId(id) });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProduct({ id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.products.my() });
    },
  });
}

export function useToggleActivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ActivateProductRequest) => toggleActivateProduct(body),
    onSuccess: (_ok, vars) => {
      qc.invalidateQueries({ queryKey: QK.products.byId(vars.id) });
      qc.invalidateQueries({ queryKey: QK.products.available({}) });
      qc.invalidateQueries({ queryKey: QK.products.my() });
    },
  });
}
