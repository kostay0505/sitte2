'use client';

import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { useMemo, useState } from 'react';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { useInfiniteProductsFlat } from '@/features/products/hooks';
import type { ProductsAvailableQuery } from '@/api/products/types';
import { ROUTES } from '@/config/routes';
import { Link } from '@/components/Link/Link';
import { Input } from '@/components/common/Input/Input';

type SubcategoryLink = {
  id: string;
  name: string;
  slug: string;
};

interface CategoryPageClientProps {
  categoryId: string;
  subcategoryId?: string;
  categoryName: string;
  categorySlug: string;
  parentCategoryName?: string;
  subcategories?: SubcategoryLink[];
}

export function CategoryPageClient({
  categoryId,
  subcategoryId,
  categoryName,
  categorySlug,
  parentCategoryName,
  subcategories = [],
}: CategoryPageClientProps) {
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');

  const query: ProductsAvailableQuery = useMemo(
    () => ({
      categoryId: subcategoryId ?? categoryId,
      priceCashFrom: priceFrom ? Number(priceFrom) : null,
      priceCashTo: priceTo ? Number(priceTo) : null,
      limit: 24,
    }),
    [categoryId, subcategoryId, priceFrom, priceTo],
  );

  const infinite = useInfiniteProductsFlat(query);
  const isLoading = infinite.status === 'pending';

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-5'>
        {/* Breadcrumbs */}
        <nav className='flex items-center gap-1 text-xs text-gray-500 flex-wrap'>
          <Link href='/' className='hover:text-black'>Главная</Link>
          <span>/</span>
          <Link href='/catalog' className='hover:text-black'>Каталог</Link>
          <span>/</span>
          {subcategoryId && parentCategoryName ? (
            <>
              <Link href={`/catalog/category/${categorySlug}`} className='hover:text-black'>
                {parentCategoryName}
              </Link>
              <span>/</span>
              <span className='text-black'>{categoryName}</span>
            </>
          ) : (
            <span className='text-black'>{categoryName}</span>
          )}
        </nav>

        <h1 className='text-xl font-semibold text-black'>{categoryName}</h1>

        {/* Subcategory navigation on parent page */}
        {!subcategoryId && subcategories.length > 0 && (
          <div className='flex flex-wrap gap-2'>
            {subcategories.map(sub => (
              <Link
                key={sub.id}
                href={`/catalog/category/${categorySlug}/${sub.slug}`}
                className='px-3 py-1.5 bg-gray-100 rounded-full text-sm text-black hover:bg-gray-200 transition-colors'
              >
                {sub.name}
              </Link>
            ))}
          </div>
        )}

        {/* Price filters */}
        <div className='flex gap-2 flex-wrap'>
          <div className='flex border border-[#4D4D4D] rounded-xl bg-white gap-[2px] h-[30px] md:h-[40px] overflow-hidden'>
            <Input
              label='Цена от'
              containerClassName='!border-0 !h-full'
              type='number'
              className='text-[10px] md:text-sm'
              labelClassName='text-[10px] md:text-sm'
              lableFocusedClassName='!text-[5px] md:!text-[9px]'
              value={priceFrom}
              onChange={e => setPriceFrom(e.target.value)}
            />
            <div className='w-[1px] h-[30px] md:h-[40px] bg-[#4D4D4D]' />
            <Input
              label='Цена до'
              containerClassName='!border-0 !h-full'
              type='number'
              className='text-[10px] md:text-sm'
              labelClassName='text-[10px] md:text-sm'
              lableFocusedClassName='!text-[5px] md:!text-[9px]'
              value={priceTo}
              onChange={e => setPriceTo(e.target.value)}
            />
          </div>
        </div>

        {/* Empty state */}
        {!isLoading && infinite.items.length === 0 && (
          <div className='p-2 pt-4 text-center text-black'>Товаров пока нет</div>
        )}

        {/* Products grid */}
        <div className='grid grid-cols-3 md:grid-cols-4 gap-3'>
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <ProductCard key={`sk-${i}`} isLoading />
              ))
            : infinite.items.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  href={`${ROUTES.CATALOG}/${p.id}`}
                />
              ))}
        </div>

        {infinite.hasNextPage && (
          <div className='flex justify-center py-4'>
            <button
              className='px-4 py-2 bg-black text-white rounded-lg disabled:opacity-50'
              onClick={() => infinite.fetchNextPage()}
              disabled={infinite.isFetchingNextPage}
            >
              {infinite.isFetchingNextPage ? 'Загрузка...' : 'Показать ещё'}
            </button>
          </div>
        )}
      </Layout>
    </Page>
  );
}
