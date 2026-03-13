'use client';

import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { useMemo, useState } from 'react';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { useInfiniteProductsFlat } from '@/features/products/hooks';
import type { ProductsAvailableQuery } from '@/api/products/types';
import { ROUTES } from '@/config/routes';
import { Link } from '@/components/Link/Link';
import { Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

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
  const [searchRaw, setSearchRaw] = useState('');
  const search = useDebounce(searchRaw, 400);

  const query: ProductsAvailableQuery = useMemo(
    () => ({
      categoryId: subcategoryId ?? categoryId,
      search: search || null,
      limit: 24,
    }),
    [categoryId, subcategoryId, search],
  );

  const infinite = useInfiniteProductsFlat(query);
  const isLoading = infinite.status === 'pending';

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-4'>
        {/* Breadcrumbs */}
        <nav className='flex items-center gap-1 text-xs text-gray-500 flex-wrap'>
          <Link href='/' className='hover:text-black'>Главная</Link>
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

        {/* Title + search */}
        <div className='flex items-center gap-3'>
          <h1 className='text-xl font-semibold text-black shrink-0'>{categoryName}</h1>
          <div className='flex-1 relative'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none' />
            <input
              type='text'
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              placeholder='Поиск по категории...'
              className='w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl bg-white text-black placeholder:text-gray-400 focus:outline-none focus:border-black transition'
            />
          </div>
        </div>

        {/* Subcategory navigation on parent page */}
        {!subcategoryId && subcategories.length > 0 && (
          <div className='flex flex-wrap gap-2'>
            {subcategories.map(sub => (
              <Link
                key={sub.id}
                href={`/catalog/category/${categorySlug}/${sub.slug}`}
                className='px-3 py-1.5 bg-gray-800 text-white rounded-full text-sm hover:bg-gray-700 transition-colors'
              >
                {sub.name}
              </Link>
            ))}
          </div>
        )}

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
                  href={p.brandSlug && p.slug ? `/catalog/${p.brandSlug}/${p.slug}` : `${ROUTES.CATALOG}/${p.id}`}
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
