'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Page } from '@/components/Page';
import { HomeBanner } from '@/components/home/HomeBanner';
import { HomeProductCarousel } from '@/components/home/HomeProductCarousel';
import { HomeBrandCarousel } from '@/components/home/HomeBrandCarousel';
import { Footer } from '@/components/Footer';
import { getHomeCategories, getTouringExpertProducts, getBestsellers } from '@/api/home/methods';
import { getSiteContentAll } from '@/api/site-content/methods';
import type { BannerContent } from '@/api/site-content/types';
import { useWindowResize } from '@/hooks/useWindowResize';

function parseBanner(raw: any): BannerContent | null {
  if (!raw) return null;
  if (typeof raw === 'object' && Array.isArray(raw.slides)) return raw as BannerContent;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.slides)) return parsed;
    } catch {}
  }
  return null;
}

const DESKTOP_HEADER_HEIGHT = 149;

function HomeScrollContainer({ children }: { children: React.ReactNode }) {
  const { width } = useWindowResize();
  const isMobile = width > 0 && width < 768;
  const paddingTop = isMobile ? 0 : DESKTOP_HEADER_HEIGHT;

  return (
    <div className='relative h-full flex flex-col' style={{ paddingTop }}>
      <div className='flex-1 overflow-y-auto scrollbar-hide'>
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: categories = [] } = useQuery({
    queryKey: ['homeCategories'],
    queryFn: getHomeCategories,
    staleTime: 10 * 60 * 1000,
  });

  const { data: siteContent = {} } = useQuery({
    queryKey: ['siteContentAll'],
    queryFn: getSiteContentAll,
    staleTime: 5 * 60 * 1000,
  });

  const banner1 = parseBanner((siteContent as any).banner1);
  const banner2 = parseBanner((siteContent as any).banner2);
  const banner3 = parseBanner((siteContent as any).banner3);

  return (
    <Page back={false}>
      <HomeScrollContainer>
        {/* Banner 1 — full-width naturally */}
        {banner1 && <HomeBanner content={banner1} />}

        {/* Touring Expert carousel */}
        <div className='max-w-[1280px] mx-auto w-full px-2 md:px-6 py-6'>
          <HomeProductCarousel
            title='Touring Expert'
            categories={categories}
            fetchProducts={getTouringExpertProducts}
            queryKey='touringExpert'
          />
        </div>

        {/* Banner 2 — full-width naturally */}
        {banner2 && <HomeBanner content={banner2} />}

        {/* Bestsellers carousel */}
        <div className='max-w-[1280px] mx-auto w-full px-2 md:px-6 py-6'>
          <HomeProductCarousel
            title='Bestsellers'
            categories={categories}
            fetchProducts={getBestsellers}
            queryKey='bestsellers'
          />
        </div>

        {/* Banner 3 — full-width naturally */}
        {banner3 && <HomeBanner content={banner3} />}

        {/* Featured Brands carousel */}
        <div className='max-w-[1280px] mx-auto w-full px-2 md:px-6 py-6'>
          <HomeBrandCarousel categories={categories} />
        </div>

        <div className='mt-auto pt-5'>
          <Footer />
        </div>
      </HomeScrollContainer>
    </Page>
  );
}
