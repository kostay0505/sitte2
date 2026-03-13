// app/favorites/page.tsx
'use client';

import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute/ProtectedRoute';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { ROUTES } from '@/config/routes';
import { useMemo } from 'react';
import { useInfiniteProductsFlat } from '@/features/products/hooks';
import type { ProductsAvailableQuery } from '@/api/products/types';

export default function FavoritesPage() {
  // q: только избранные
  const query = useMemo<ProductsAvailableQuery>(
    () => ({
      brandId: null,
      sellerId: null,
      categoryId: null,
      priceCashFrom: null,
      priceCashTo: null,
      isFavorite: true, // ключевой фильтр
      limit: 24,
      offset: 0,
    }),
    [],
  );

  const infinite = useInfiniteProductsFlat(query);
  const items = infinite.items;
  const isLoading = infinite.status === 'pending' && (items?.length ?? 0) === 0;

  return (
    <ProtectedRoute>
      <Page back={true}>
        <Layout className='p-2 pt-4'>
          <h2 className='text-center text-lg text-black font-medium mb-4'>
            Избранное
          </h2>

          {/* пустое состояние */}
          {!isLoading && items.length === 0 && (
            <div className='p-2 pt-4 text-center text-black'>
              В избранном пока пусто
            </div>
          )}

          <div className='grid grid-cols-3 md:grid-cols-4 gap-4'>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <ProductCard key={`sk-${i}`} isLoading />
                ))
              : items.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    href={product.brandSlug && product.slug ? `/catalog/${product.brandSlug}/${product.slug}` : `${ROUTES.CATALOG}/${product.id}`}
                  />
                ))}
          </div>

          {/* подгрузка страниц */}
          {infinite.hasNextPage && (
            <div className='flex justify-center py-4'>
              <button
                className='px-4 py-2 bg-black text-white rounded-lg disabled:opacity-50'
                onClick={() => infinite.fetchNextPage()}
                disabled={infinite.isFetchingNextPage}
              >
                {infinite.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
              </button>
            </div>
          )}
        </Layout>
      </Page>
    </ProtectedRoute>
  );
}
