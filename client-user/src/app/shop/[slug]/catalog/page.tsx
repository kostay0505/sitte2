'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { Link } from '@/components/Link/Link';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { getBusinessPageBySlug } from '@/api/business-page/methods';
import { getUserSeller } from '@/api/user/methods';
import { useInfiniteProductsFlat } from '@/features/products/hooks';
import type { UserBasic } from '@/api/user/types';

export default function ShopCatalogPage() {
  const { slug } = useParams<{ slug: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [seller, setSeller] = useState<UserBasic | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getBusinessPageBySlug(slug)
      .then(async p => {
        setUserId(p.userId);
        const s = await getUserSeller(p.userId).catch(() => null);
        setSeller(s);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  const sellerName =
    seller
      ? [seller.firstName, seller.lastName].filter(Boolean).join(' ') || seller.username || 'Продавец'
      : null;

  const { items, status, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteProductsFlat(
      userId ? { sellerId: userId, limit: 24 } : {},
    );

  const isLoading = status === 'pending' || !userId;

  if (notFound) {
    return (
      <Page back={true}>
        <Layout className='flex flex-col items-center justify-center py-24 text-gray-400'>
          <p className='text-lg font-medium'>Страница не найдена</p>
          <p className='text-sm mt-1'>/shop/{slug}</p>
        </Layout>
      </Page>
    );
  }

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 pb-12 flex flex-col gap-5'>

        {/* Breadcrumbs */}
        <nav className='flex items-center gap-1 text-xs text-gray-500 flex-wrap'>
          <Link href='/' className='hover:text-black transition'>Главная</Link>
          <span>/</span>
          <Link href={`/shop/${slug}`} className='hover:text-black transition'>
            {sellerName ?? slug}
          </Link>
          <span>/</span>
          <span className='text-gray-800 font-medium'>Каталог</span>
        </nav>

        {/* Title */}
        <h1 className='text-2xl font-bold text-gray-900'>
          {sellerName ? `Каталог — ${sellerName}` : 'Каталог'}
        </h1>

        {/* Grid */}
        {isLoading ? (
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCard key={i} isLoading />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-24 text-gray-400'>
            <p className='text-base'>Товаров пока нет</p>
          </div>
        ) : (
          <>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
              {items.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  href={p.brandSlug && p.slug ? `/catalog/${p.brandSlug}/${p.slug}` : `/catalog/${p.id}`}
                />
              ))}
            </div>

            {hasNextPage && (
              <div className='flex justify-center pt-4'>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className='px-8 py-3 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 disabled:opacity-50 transition'
                >
                  {isFetchingNextPage ? 'Загрузка...' : 'Загрузить ещё'}
                </button>
              </div>
            )}
          </>
        )}

      </Layout>
    </Page>
  );
}
