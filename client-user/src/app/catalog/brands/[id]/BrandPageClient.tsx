'use client';

import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { ImageWithSkeleton } from '@/components/common/ImageWithSkeleton/ImageWithSkeleton';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { ProductFilters } from '@/components/ProductFilters';
import { SearchInput } from '@/components/SearchInput';
import { Skeleton } from '@/components/common/Skeleton/Skeleton';
import { cn } from '@/utils/cn';
import { useBrand } from '@/features/brands/hooks';
import { useInfiniteProductsFlat } from '@/features/products/hooks';
import type { ProductsAvailableQuery } from '@/api/products/types';
import { useClientSearch } from '@/hooks/useClientSearch';
import { ROUTES } from '@/config/routes';
import { useDebouncedProductFilters } from '@/hooks/useDebouncedProductFilters';
import { useCategoryFilterOptions } from '@/features/category/hooks';
import { toImageSrc } from '@/utils/toImageSrc';
import { ShareIcon } from '@/components/common/SvgIcon';
import { ShareModal } from '@/components/Product/ShareModal';
import { Link } from '@/components/Link/Link';

export function BrandPageClient() {
  const { id } = useParams<{ id: string }>();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  // ===== бренд
  const { data: brand, status: brandStatus } = useBrand(id);
  const brandLoading = brandStatus === 'pending';

  // ===== фильтры (цены с дебаунсом + category/subcategory из хука)
  const filters = useDebouncedProductFilters({ delay: 300, limit: 24 });

  // ===== категории/подкатегории
  const {
    isLoading: categoriesLoading,
    categoryOptions,
    getSubcategoryOptions,
  } = useCategoryFilterOptions();

  const subcategoryOptions = useMemo(
    () => getSubcategoryOptions(filters.category || null),
    [getSubcategoryOptions, filters.category],
  );

  // если выбранная подкатегория не относится к выбранной категории — сбрасываем
  useEffect(() => {
    if (
      filters.subcategory &&
      !subcategoryOptions.some(o => o.value === filters.subcategory)
    ) {
      filters.setSubcategory('');
    }
  }, [subcategoryOptions, filters.subcategory, filters]);

  // query для товаров бренда: добавляем brandId (остальное формирует filters.query)
  const query: ProductsAvailableQuery = useMemo(
    () => ({ ...filters.query, brandId: id }),
    [filters.query, id],
  );

  // ===== товары бренда
  const infinite = useInfiniteProductsFlat(query);
  const items = infinite.items; // ProductBasic[]
  const isLoading = infinite.status === 'pending';

  // ===== поиск по товарам бренда
  const search = useClientSearch(items, {
    keys: ['name', 'description'],
    delay: 300,
  });

  if (!brandLoading && !brand) {
    return (
      <div className='p-2 pt-4 text-black text-center'>Бренд не найден</div>
    );
  }

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-5'>
        {/* Поиск */}
        <SearchInput value={search.input} onChange={search.setInput} />

        {/* Фильтры: категории живые; цены — через наш дебаунс-хук */}
        <ProductFilters
          category={filters.category}
          onCategoryChange={v => {
            filters.onCategoryChange(v);
            // сбросим подкатегорию при смене категории
            filters.setSubcategory('');
          }}
          categoryOptions={categoryOptions}
          subcategory={filters.subcategory}
          onSubcategoryChange={filters.setSubcategory}
          subcategoryOptions={subcategoryOptions}
          priceFrom={filters.priceFromInput}
          onPriceFromChange={filters.setPriceFromInput}
          priceTo={filters.priceToInput}
          onPriceToChange={filters.setPriceToInput}
          // не блокируем инпуты цен, чтобы фокус не терялся; селекты можно дизейблить пока грузятся категории
          loading={categoriesLoading}
        />

        {/* Шапка бренда */}
        <div
          className={cn(
            'bg-white rounded-2xl p-4 flex items-center md:items-start gap-2 md:gap-4',
            'md:bg-[#F5F5FA]',
          )}
        >
          <ImageWithSkeleton
            src={toImageSrc(brand?.photo)}
            alt={brand?.name ?? ''}
            containerClassName={cn(
              '!w-[60px] !h-[60px] md:!w-[120px] md:!h-[120px]',
              'md:!w-[100px] md:!h-[100px]',
            )}
            className='rounded-md w-full h-full object-contain'
            isLoading={brandLoading}
          />
          <div className='flex-1 relative'>
            {brandLoading ? (
              <>
                <Skeleton height={28} />
                <Skeleton height={68} />
              </>
            ) : (
              <>
                <h2 className='text-lg md:text-2xl text-black font-medium text-center md:text-left md:mb-4'>
                  {brand?.name}
                </h2>
                {!!brand?.description && (
                  <p className='text-[8px] md:text-base text-black font-light text-left'>
                    {brand.description}
                  </p>
                )}
              </>
            )}
            <div className='flex justify-end mt-4'>
              <button
                type='button'
                onClick={e => {
                  e.stopPropagation();
                  setIsOpen(true);
                }}
                className=' absolute -top-2.5 right-0 max-w-7 max-h-7 cursor-pointer hover:opacity-75 ease-in-out'
              >
                <ShareIcon width={24} height={24} />
              </button>
              {brand?.contact ? (
                <Link
                  href={brand.contact}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex items-end justify-end cursor-pointer hover:opacity-75 transition-all ease-in-out'
                >
                  <div className='flex gap-3 items-end'>
                    <span className='text-gray-800 font-semibold text-xs sm:text-sm lg:text-base'>
                      Связаться
                    </span>
                  </div>
                </Link>
              ) : (
                <></>
              )}
            </div>
          </div>
        </div>

        {/* Товары бренда */}
        {!isLoading && search.filtered.length === 0 && (
          <div className='p-2 pt-4 text-center text-black'>
            Продуктов пока нет
          </div>
        )}

        <div className='grid grid-cols-3 md:grid-cols-4 gap-3'>
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <ProductCard key={`sk-${i}`} isLoading />
              ))
            : search.filtered.map(p => (
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
              {infinite.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
            </button>
          </div>
        )}
      </Layout>
      <ShareModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        url={`${brand?.url}`}
      ></ShareModal>
    </Page>
  );
}
