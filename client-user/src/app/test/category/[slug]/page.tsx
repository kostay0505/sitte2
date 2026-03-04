import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { TEST_CATEGORIES, TEST_PRODUCTS, SITE_URL } from '../../_testData';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return TEST_CATEGORIES.map(c => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = TEST_CATEGORIES.find(c => c.slug === slug);
  if (!cat) return { title: 'Touring Expert' };
  const firstProduct = TEST_PRODUCTS.find(p => p.categorySlug === slug);
  return {
    title: `${cat.name} — купить мотоэкипировку | Touring Expert`,
    description: cat.description,
    openGraph: {
      title: `${cat.name} — купить мотоэкипировку | Touring Expert`,
      description: cat.description,
      url: `${SITE_URL}/test/category/${slug}`,
      type: 'website',
      ...(firstProduct ? { images: [{ url: firstProduct.preview }] } : {}),
    },
  };
}

export default async function TestCategoryPage({ params }: Props) {
  const { slug } = await params;
  const cat = TEST_CATEGORIES.find(c => c.slug === slug);
  if (!cat) notFound();

  const products = TEST_PRODUCTS.filter(p => p.categorySlug === slug);

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-4'>
        {/* Заголовок категории */}
        <div className='bg-white rounded-xl p-4 md:bg-[#F5F5FA]'>
          <h1 className='text-lg md:text-2xl font-semibold text-black mb-2'>
            {cat.name}
          </h1>
          <p className='text-sm text-black/70'>{cat.description}</p>
        </div>

        {/* Товары категории */}
        <div className='grid grid-cols-3 md:grid-cols-4 gap-3'>
          {products.map(p => (
            <ProductCard
              key={p.id}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              product={p as any}
              href={`/test/listing/${p.slug}`}
              hideFavorite
            />
          ))}
        </div>

        {/* Другие категории */}
        <div className='mt-4'>
          <h2 className='text-black font-medium mb-3'>Другие категории</h2>
          <div className='flex flex-wrap gap-2'>
            {TEST_CATEGORIES.filter(c => c.slug !== slug).map(c => (
              <a
                key={c.slug}
                href={`/test/category/${c.slug}`}
                className='px-4 py-2 bg-white rounded-lg text-sm text-black hover:bg-gray-100 transition md:bg-[#F5F5FA]'
              >
                {c.name}
              </a>
            ))}
          </div>
        </div>
      </Layout>
    </Page>
  );
}
