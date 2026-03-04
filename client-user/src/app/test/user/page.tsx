import type { Metadata } from 'next';
import Image from 'next/image';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { ROUTES } from '@/config/routes';
import { TEST_USER, TEST_PRODUCTS, SITE_URL } from '../_testData';

export const metadata: Metadata = {
  title: `${TEST_USER.firstName} ${TEST_USER.lastName} (@${TEST_USER.username}) — продавец | Touring Expert`,
  description: `Профиль продавца ${TEST_USER.firstName} ${TEST_USER.lastName} на Touring Expert. Мотоэкипировка и снаряжение из ${TEST_USER.city.name}. Телефон: ${TEST_USER.phone}.`,
  openGraph: {
    title: `${TEST_USER.firstName} ${TEST_USER.lastName} — продавец | Touring Expert`,
    description: `Профиль продавца ${TEST_USER.firstName} ${TEST_USER.lastName} на Touring Expert. Мотоэкипировка из ${TEST_USER.city.name}.`,
    url: `${SITE_URL}/test/user`,
    type: 'profile',
    images: [{ url: TEST_USER.photoUrl, width: 200, height: 200, alt: `${TEST_USER.firstName} ${TEST_USER.lastName}` }],
  },
};

const userProducts = TEST_PRODUCTS.slice(0, 4);

export default function TestUserPage() {
  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-4'>
        {/* Профиль продавца */}
        <div className='bg-white rounded-xl p-4 flex gap-3 items-start relative md:bg-[#F5F5FA]'>
          <div className='relative w-[100px] h-[100px] flex-shrink-0'>
            <Image
              src={TEST_USER.photoUrl}
              alt={`${TEST_USER.firstName} ${TEST_USER.lastName}`}
              fill
              className='object-cover rounded-md'
            />
          </div>
          <div className='flex-1 flex flex-col gap-1'>
            <h1 className='text-normal text-black line-clamp-1 font-medium'>
              {TEST_USER.firstName} {TEST_USER.lastName}
            </h1>
            <p className='text-[10px] md:text-sm text-black'>
              @{TEST_USER.username}
            </p>
            <div className='text-[10px] md:text-sm text-black flex gap-1'>
              e-mail:{' '}
              <a href={`mailto:${TEST_USER.email}`} className='line-clamp-1 underline'>
                {TEST_USER.email}
              </a>
            </div>
            <div className='text-[10px] md:text-sm text-black flex gap-1'>
              телефон:{' '}
              <a href={`tel:${TEST_USER.phone}`} className='line-clamp-1'>
                {TEST_USER.phone}
              </a>
            </div>
            <p className='text-[10px] md:text-sm text-black line-clamp-1'>
              страна: {TEST_USER.city.country.name}
            </p>
            <p className='text-[10px] md:text-sm text-black line-clamp-1'>
              город: {TEST_USER.city.name}
            </p>
          </div>
        </div>

        {/* Объявления продавца */}
        <h2 className='text-black font-medium'>Объявления продавца</h2>
        <div className='grid grid-cols-3 md:grid-cols-4 gap-3'>
          {userProducts.map(p => (
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
