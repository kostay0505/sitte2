import type { Metadata } from 'next';
import { CategoryPageClient } from '@/components/catalog/CategoryPageClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SITE_URL = 'https://touringexpertsale.ru';

export const revalidate = 3600;
export const dynamicParams = true;

type Category = {
  id: string;
  name: string;
  slug: string | null;
  parentId: string | null;
  displayOrder: number;
  isActive: boolean;
};

export async function generateStaticParams() {
  try {
    const res = await fetch(`${API_URL}/categories/available`);
    if (!res.ok) return [];
    const categories: Category[] = await res.json();
    return categories
      .filter(c => !c.parentId && c.slug)
      .map(c => ({ slug: c.slug! }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API_URL}/categories/slug/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: 'Touring Expert' };
    const category: Category = await res.json();
    const title = `${category.name} — купить профессиональное оборудование | Touring Expert`;
    const description = `Широкий выбор ${category.name.toLowerCase()} по лучшим ценам на Touring Expert. Звуковое и световое оборудование.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/catalog/category/${slug}`,
        type: 'website',
      },
    };
  } catch {
    return { title: 'Touring Expert' };
  }
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let category: Category | null = null;
  let subcategories: Category[] = [];

  try {
    const [catRes, allRes] = await Promise.all([
      fetch(`${API_URL}/categories/slug/${slug}`, { next: { revalidate: 3600 } }),
      fetch(`${API_URL}/categories/available`, { next: { revalidate: 3600 } }),
    ]);
    if (catRes.ok) category = await catRes.json();
    if (allRes.ok && category) {
      const all: Category[] = await allRes.json();
      subcategories = all.filter(c => c.parentId === category!.id && c.slug);
    }
  } catch {}

  if (!category) {
    return <div className='p-4 text-center'>Категория не найдена</div>;
  }

  return (
    <CategoryPageClient
      categoryId={category.id}
      categoryName={category.name}
      categorySlug={slug}
      subcategories={subcategories.map(s => ({
        id: s.id,
        name: s.name,
        slug: s.slug!,
      }))}
    />
  );
}
