'use client';

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import debounce from 'lodash/debounce';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { SearchInput } from '@/components/SearchInput';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { ROUTES } from '@/config/routes';
import { ProductFilters } from '@/components/ProductFilters';
import { useInfiniteProductsFlat } from '@/features/products/hooks';
import { useCategoryFilterOptions } from '@/features/category/hooks';
import { useClientSearch } from '@/hooks/useClientSearch';
import { useAvailableBrands } from '@/features/brands/hooks';

export default function CatalogClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  const category = searchParams.get('category') ?? '';
  const subcategory = searchParams.get('subcategory') ?? '';
  const brand = searchParams.get('brand') ?? '';
  const priceFrom = searchParams.get('priceFrom') ?? '';
  const priceTo = searchParams.get('priceTo') ?? '';

  // Local state for price inputs so the UI is immediately responsive
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

  const { isLoading: categoriesLoading, categoryOptions, getSubcategoryOptions } =
    useCategoryFilterOptions();

  const subcategoryOptions = useMemo(
    () => getSubcategoryOptions(category || null),
    [getSubcategoryOptions, category],
  );

  useEffect(() => {
    if (subcategory && !subcategoryOptions.some(o => o.value === subcategory)) {
      updateParams({ subcategory: '' });
    }
  }, [subcategoryOptions, subcategory, updateParams]);

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
      categoryId: subcategory || category || null,
      brandId: brand || null,
      priceCashFrom:
        priceFrom && !Number.isNaN(Number(priceFrom)) ? Number(priceFrom) : null,
      priceCashTo:
        priceTo && !Number.isNaN(Number(priceTo)) ? Number(priceTo) : null,
      limit: 24,
      offset: 0,
    }),
    [category, subcategory, brand, priceFrom, priceTo],
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
      ? 'Продуктов пока нет'
      : '';

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-5'>
        <SearchInput
          value={search.input}
          onChange={search.setInput}
          onSearch={search.setInput}
        />

        <ProductFilters
          category={category}
          onCategoryChange={v => updateParams({ category: v, subcategory: '' })}
          categoryOptions={categoryOptions}
          subcategory={subcategory}
          onSubcategoryChange={v => updateParams({ subcategory: v })}
          subcategoryOptions={subcategoryOptions}
          brandId={brand}
          onBrandChange={v => updateParams({ brand: v })}
          brandOptions={brandOptions}
          brandsLoading={brandsStatus === 'pending'}
          priceFrom={priceFromInput}
          onPriceFromChange={handlePriceFromChange}
          priceTo={priceToInput}
          onPriceToChange={handlePriceToChange}
          loading={categoriesLoading}
          className='grid grid-cols-2'
        />

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
    </Page>
  );
}
