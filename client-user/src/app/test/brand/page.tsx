import type { Metadata } from 'next';
import Image from 'next/image';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { TEST_BRAND, TEST_PRODUCTS, SITE_URL } from '../_testData';

export const metadata: Metadata = {
  title: `${TEST_BRAND.name} — товары бренда | Touring Expert`,
  description: TEST_BRAND.description,
  openGraph: {
    title: `${TEST_BRAND.name} — товары бренда | Touring Expert`,
    description: TEST_BRAND.description,
    url: `${SITE_URL}/test/brand`,
    type: 'website',
    images: [{ url: TEST_BRAND.photo, width: 400, height: 400, alt: TEST_BRAND.name }],
  },
};

export default function TestBrandPage() {
  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-5'>
        {/* Шапка бренда */}
        <div className='bg-white rounded-2xl p-4 flex items-center md:items-start gap-2 md:gap-4 md:bg-[#F5F5FA]'>
          <div className='relative w-[60px] h-[60px] md:w-[100px] md:h-[100px] flex-shrink-0'>
            <Image
              src={TEST_BRAND.photo}
              alt={TEST_BRAND.name}
              fill
              className='rounded-md object-contain'
            />
          </div>
          <div className='flex-1 relative'>
            <h1 className='text-lg md:text-2xl text-black font-medium text-center md:text-left md:mb-4'>
              {TEST_BRAND.name}
            </h1>
            <p className='text-[8px] md:text-base text-black font-light text-left'>
              {TEST_BRAND.description}
            </p>
            <div className='flex justify-end mt-4'>
              <a
                href={TEST_BRAND.contact}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-end justify-end cursor-pointer hover:opacity-75 transition-all ease-in-out'
              >
                <span className='text-gray-800 font-semibold text-xs sm:text-sm lg:text-base'>
                  Связаться
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Все товары бренда */}
        <h2 className='text-black font-medium sr-only'>Товары бренда {TEST_BRAND.name}</h2>
        <div className='grid grid-cols-3 md:grid-cols-4 gap-3'>
          {TEST_PRODUCTS.map(p => (
            <ProductCard
              key={p.id}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              product={p as any}
              href={`/test/listing/${p.slug}`}
              hideFavorite
            />
          ))}
        </div>
      </Layout>
    </Page>
  );
}
