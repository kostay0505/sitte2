import type { Metadata } from 'next';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { TEST_CATEGORIES, TEST_PRODUCTS } from './_testData';

export const metadata: Metadata = {
  title: 'Тестовые страницы | Touring Expert',
  description: 'Тестовые страницы для проверки SEO и функционала.',
  robots: { index: false, follow: false },
};

export default function TestIndexPage() {
  return (
    <Page back={true}>
      <Layout className='p-2 pt-4 flex flex-col gap-6'>
        <h1 className='text-xl font-bold text-black'>Тестовые страницы</h1>

        {/* Пользователь */}
        <section>
          <h2 className='text-black font-medium mb-2'>Пользователь</h2>
          <a
            href='/test/user'
            className='block bg-white rounded-xl p-3 text-black hover:bg-gray-50 transition md:bg-[#F5F5FA]'
          >
            Александр Петров (@alex_touring) →
          </a>
        </section>

        {/* Бренд */}
        <section>
          <h2 className='text-black font-medium mb-2'>Бренд</h2>
          <a
            href='/test/brand'
            className='block bg-white rounded-xl p-3 text-black hover:bg-gray-50 transition md:bg-[#F5F5FA]'
          >
            Бренд ТЕСТ →
          </a>
        </section>

        {/* Категории */}
        <section>
          <h2 className='text-black font-medium mb-2'>Категории</h2>
          <div className='flex flex-col gap-2'>
            {TEST_CATEGORIES.map(c => (
              <a
                key={c.slug}
                href={`/test/category/${c.slug}`}
                className='block bg-white rounded-xl p-3 text-black hover:bg-gray-50 transition md:bg-[#F5F5FA]'
              >
                {c.name} →
              </a>
            ))}
          </div>
        </section>

        {/* Объявления */}
        <section>
          <h2 className='text-black font-medium mb-2'>Объявления (16 шт.)</h2>
          <div className='flex flex-col gap-2'>
            {TEST_PRODUCTS.map(p => (
              <a
                key={p.slug}
                href={`/test/listing/${p.slug}`}
                className='block bg-white rounded-xl p-3 text-black hover:bg-gray-50 transition md:bg-[#F5F5FA]'
              >
                <span className='text-xs text-black/50'>{p.category.name} / </span>
                {p.name} — {Number(p.priceCash).toLocaleString('ru-RU')} ₽ →
              </a>
            ))}
          </div>
        </section>
      </Layout>
    </Page>
  );
}
