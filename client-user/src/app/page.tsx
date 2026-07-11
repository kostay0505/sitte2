import React from 'react';
import { Page } from '@/components/Page';
import { HomeBanner } from '@/components/home/HomeBanner';
import { HomeProductCarousel } from '@/components/home/HomeProductCarousel';
import { HomeBrandCarousel } from '@/components/home/HomeBrandCarousel';
import { HomeScrollContainer } from '@/components/home/HomeScrollContainer';
import { Footer } from '@/components/Footer';
import {
  fetchHomeCategoriesServer,
  fetchSiteContentServer,
  fetchTouringExpertProductsServer,
  fetchBestsellersServer,
  fetchFeaturedBrandsServer,
} from '@/api/home/server';
import type { BannerContent } from '@/api/site-content/types';

export const revalidate = 3600;

const RAZNOYE_ID = '550e8400-e29b-41d4-a716-446655440001';

function parseBanner(raw: unknown): BannerContent | null {
  if (!raw) return null;
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as BannerContent).slides)) {
    return raw as BannerContent;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.slides)) return parsed as BannerContent;
    } catch {}
  }
  return null;
}

export default async function Home() {
  const [categories, siteContent] = await Promise.all([
    fetchHomeCategoriesServer(),
    fetchSiteContentServer(),
  ]);

  const firstCatId = categories.find(c => c.id !== RAZNOYE_ID)?.id;

  const [initialTouringProducts, initialBestsellers, initialBrands] = await Promise.all([
    fetchTouringExpertProductsServer(firstCatId),
    fetchBestsellersServer(firstCatId),
    fetchFeaturedBrandsServer(firstCatId),
  ]);

  const banner1 = parseBanner(siteContent.banner1);
  const banner2 = parseBanner(siteContent.banner2);
  const banner3 = parseBanner(siteContent.banner3);

  return (
    <Page back={false}>
      <HomeScrollContainer>
        <h1 className='sr-only'>
          Маркетплейс концертного, звукового и светового оборудования — TEM (Touring Expert)
        </h1>
        {banner1 && <HomeBanner content={banner1} />}

        <div className='max-w-[1280px] mx-auto w-full px-2 md:px-6 py-6'>
          <HomeProductCarousel
            title='Touring Expert'
            categories={categories}
            queryKey='touringExpert'
            initialProducts={initialTouringProducts}
            initialCategoryId={firstCatId}
          />
        </div>

        {banner2 && <HomeBanner content={banner2} />}

        <div className='max-w-[1280px] mx-auto w-full px-2 md:px-6 py-6'>
          <HomeProductCarousel
            title='Bestsellers'
            titleKey='home.bestsellers_title'
            categories={categories}
            queryKey='bestsellers'
            initialProducts={initialBestsellers}
            initialCategoryId={firstCatId}
          />
        </div>

        {banner3 && <HomeBanner content={banner3} />}

        <div className='max-w-[1280px] mx-auto w-full px-2 md:px-6 py-6'>
          <HomeBrandCarousel
            categories={categories}
            initialBrands={initialBrands}
            initialCategoryId={firstCatId}
          />
        </div>

        <div className='mt-auto pt-5'>
          <Footer />
        </div>
      </HomeScrollContainer>
    </Page>
  );
}
