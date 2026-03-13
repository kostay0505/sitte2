'use client';

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import debounce from 'lodash/debounce';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { SearchInput } from '@/components/SearchInput';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { ROUTES } from '@/config/routes';
import { useInfiniteProductsFlat } from '@/features/products/hooks';
import { useCategoryFilterOptions } from '@/features/category/hooks';
import { useClientSearch } from '@/hooks/useClientSearch';
import { useAvailableBrands } from '@/features/brands/hooks';
import { Link } from '@/components/Link/Link';
import { ComboSelect } from '@/components/common/Select/ComboSelect';
import { Input } from '@/components/common/Input/Input';

export default function CatalogClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  const brand = searchParams.get('brand') ?? '';
  const priceFrom = searchParams.get('priceFrom') ?? '';
  const priceTo = searchParams.get('priceTo') ?? '';

  const [priceFromInput, setPriceFromInput] = useState(priceFrom);
  const [priceToInput, setPriceToInput] = useState(priceTo);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const current = new URLSearchParams(searchParamsRef.current.toString());
      Object.entries(updates).forEach(([key, val]) => {
        if (val) current.set(key, val);
        else current.delete(key);
      });
      const qs = current.toString();
      router.replace(`/catalog${qs ? '?' + qs : ''}`, { scroll: false });
    },
    [router],
  );

  const debouncedPriceUpdate = useMemo(
    () =>
      debounce((from: string, to: string) => {
        updateParams({ priceFrom: from, priceTo: to });
      }, 400),
    [updateParams],
  );

  const handlePriceFromChange = useCallback(
    (v: string) => {
      setPriceFromInput(v);
      debouncedPriceUpdate(v, priceToInput);
    },
    [debouncedPriceUpdate, priceToInput],
  );

  const handlePriceToChange = useCallback(
    (v: string) => {
      setPriceToInput(v);
      debouncedPriceUpdate(priceFromInput, v);
    },
    [debouncedPriceUpdate, priceFromInput],
  );

  useEffect(() => {
    return () => debouncedPriceUpdate.cancel();
  }, [debouncedPriceUpdate]);

  const { isLoading: categoriesLoading, all: allCategories } = useCategoryFilterOptions();

  const parentCategories = useMemo(
    () =>
      allCategories
        .filter(c => !c.parentId && c.slug)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [allCategories],
  );

  const { data: brandsData, status: brandsStatus } = useAvailableBrands();
  const brandOptions = useMemo(
    () => (brandsData ?? []).map(b => ({ label: b.name, value: b.id })),
    [brandsData],
  );

  useEffect(() => {
    if (brand && !brandOptions.some(o => o.value === brand)) {
      updateParams({ brand: '' });
    }
  }, [brandOptions, brand, updateParams]);

  const query = useMemo(
    () => ({
      brandId: brand || null,
      priceCashFrom:
        priceFrom && !Number.isNaN(Number(priceFrom)) ? Number(priceFrom) : null,
      priceCashTo:
        priceTo && !Number.isNaN(Number(priceTo)) ? Number(priceTo) : null,
      limit: 24,
      offset: 0,
    }),
    [brand, priceFrom, priceTo],
  );

  const infinite = useInfiniteProductsFlat(query);
  const items = infinite.items;
  const isLoading = infinite.status === 'pending';

  const search = useClientSearch(items, {
    keys: ['name', 'description'],
    delay: 0,
  });

  const isEmpty = !isLoading && items.length === 0;
  const nothingFound =
    !isLoading && search.query.trim() && search.filtered.length === 0;
  const emptyText = nothingFound
    ? 'Ничего не найдено'
    : isEmpty
      ? 'Товаров пока нет'
      : '';

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-5'>
        <SearchInput
          value={search.input}
          onChange={search.setInput}
          onSearch={search.setInput}
        />

        {/* Category pills */}
        {!categoriesLoading && parentCategories.length > 0 && (
          <div className='flex flex-wrap gap-2'>
            {parentCategories.map(cat => (
              <Link
                key={cat.id}
                href={`/catalog/category/${cat.slug}`}
                className='px-3 py-1.5 bg-gray-100 rounded-full text-xs md:text-sm text-black hover:bg-black hover:text-white transition-colors'
              >
                {cat.name}
              </Link>
            ))}
          </div>
        )}

        {/* Brand + price filters */}
        <div className='flex flex-wrap gap-2'>
          <ComboSelect
            placeholder='Бренд'
            value={brand}
            options={brandOptions}
            onChange={v => updateParams({ brand: v })}
            containerClassName='flex-1 !h-[30px] md:!h-[40px]'
            className='text-[10px] md:text-sm'
            disabled={brandsStatus === 'pending' || brandOptions.length === 0}
          />
          <div className='flex border border-[#4D4D4D] rounded-xl bg-white gap-[2px] h-[30px] md:h-[40px] overflow-hidden'>
            <Input
              label='Цена от'
              containerClassName='!border-0 !h-full'
              type='number'
              className='text-[10px] md:text-sm'
              labelClassName='text-[10px] md:text-sm'
              lableFocusedClassName='!text-[5px] md:!text-[9px]'
              value={priceFromInput}
              onChange={e => handlePriceFromChange(e.target.value)}
            />
            <div className='w-[1px] h-[30px] md:h-[40px] bg-[#4D4D4D]' />
            <Input
              label='Цена до'
              containerClassName='!border-0 !h-full'
              type='number'
              className='text-[10px] md:text-sm'
              labelClassName='text-[10px] md:text-sm'
              lableFocusedClassName='!text-[5px] md:!text-[9px]'
              value={priceToInput}
              onChange={e => handlePriceToChange(e.target.value)}
            />
          </div>
        </div>

        {emptyText && (
          <div className='p-2 pt-4 text-center text-black'>{emptyText}</div>
        )}

        <div className='grid grid-cols-3 md:grid-cols-4 gap-4'>
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <ProductCard key={`sk-${i}`} isLoading />
              ))
            : search.filtered.map(p => (
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
