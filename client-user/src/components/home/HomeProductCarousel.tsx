'use client';

import { FC, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { HomeProductCard } from './HomeProductCard';
import type { HomeCategory, HomeProductCard as HomeProductCardType } from '@/api/home/types';
import { ROUTES } from '@/config/routes';

interface Props {
  title: string;
  categories: HomeCategory[];
  fetchProducts: (categoryId?: string, limit?: number) => Promise<HomeProductCardType[]>;
  queryKey: string;
}

const homeCarouselBreakpoints = {
  0: { slidesPerView: 2.5, spaceBetween: 8 },
  640: { slidesPerView: 3, spaceBetween: 12 },
  1024: { slidesPerView: 6, spaceBetween: 16 },
};

const RAZNOYE_ID = '550e8400-e29b-41d4-a716-446655440001';

export const HomeProductCarousel: FC<Props> = ({ title, categories, fetchProducts, queryKey }) => {
  const filteredCategories = categories.filter(c => c.id !== RAZNOYE_ID);

  const [activeCatId, setActiveCatId] = useState<string | undefined>(
    filteredCategories[0]?.id,
  );

  const activeCategory = filteredCategories.find(c => c.id === activeCatId) ?? filteredCategories[0];

  const { data: products = [], isLoading } = useQuery({
    queryKey: [queryKey, activeCatId],
    queryFn: () => fetchProducts(activeCatId, 12),
    staleTime: 5 * 60 * 1000,
  });

  const items = isLoading
    ? Array.from({ length: 12 }).map((_, i) => ({ id: `sk-${i}` }) as any)
    : products;

  const shopAllHref = activeCategory?.slug
    ? `${ROUTES.CATALOG}/category/${activeCategory.slug}`
    : ROUTES.CATALOG;

  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  return (
    <div className='w-full'>
      {/* Title row */}
      <div className='flex items-center justify-between mb-2'>
        <h2 className='text-2xl md:text-3xl font-bold text-black'>{title}</h2>
        <a
          href={shopAllHref}
          className='text-xs md:text-sm text-primary-green hover:underline whitespace-nowrap shrink-0'
        >
          Shop all {activeCategory?.name} →
        </a>
      </div>

      {/* Category pills row */}
      {filteredCategories.length > 0 && (
        <div className='flex gap-2 flex-wrap mb-4'>
          {filteredCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCatId(cat.id)}
              className={cn(
                'px-3 py-1 text-xs md:text-sm rounded-full border whitespace-nowrap transition',
                (activeCatId ?? filteredCategories[0]?.id) === cat.id
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500',
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Carousel with outside arrows */}
      <div className='relative'>
        <button
          ref={prevRef}
          className='hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 z-10 w-9 h-9 items-center justify-center bg-white rounded-full shadow border border-gray-200 hover:bg-gray-50 transition'
          aria-label='Previous'
        >
          <ChevronLeft className='w-4 h-4 text-gray-700' />
        </button>

        <Swiper
          modules={[Navigation]}
          breakpoints={homeCarouselBreakpoints}
          navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
          onBeforeInit={swiper => {
            (swiper.params.navigation as any).prevEl = prevRef.current;
            (swiper.params.navigation as any).nextEl = nextRef.current;
          }}
          loop={items.length >= 6}
          speed={400}
        >
          {items.map((item: any, index: number) => (
            <SwiperSlide key={item.id || index}>
              <HomeProductCard
                product={isLoading ? undefined : item}
                isLoading={isLoading}
                href={isLoading ? '' : (item.brandSlug && item.slug ? `/catalog/${item.brandSlug}/${item.slug}` : `${ROUTES.CATALOG}/${item.id}`)}
              />
            </SwiperSlide>
          ))}
        </Swiper>

        <button
          ref={nextRef}
          className='hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 z-10 w-9 h-9 items-center justify-center bg-white rounded-full shadow border border-gray-200 hover:bg-gray-50 transition'
          aria-label='Next'
        >
          <ChevronRight className='w-4 h-4 text-gray-700' />
        </button>
      </div>
    </div>
  );
};
