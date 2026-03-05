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
    const slugById = new Map(categories.filter(c => c.slug).map(c => [c.id, c.slug!]));
    return categories
      .filter(c => c.parentId && c.slug && slugById.has(c.parentId))
      .map(c => ({ slug: slugById.get(c.parentId!)!, sub: c.slug! }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; sub: string }>;
}): Promise<Metadata> {
  const { slug, sub } = await params;
  try {
    const [catRes, subRes] = await Promise.all([
      fetch(`${API_URL}/categories/slug/${slug}`, { next: { revalidate: 3600 } }),
      fetch(`${API_URL}/categories/slug/${sub}`, { next: { revalidate: 3600 } }),
    ]);
    if (!catRes.ok || !subRes.ok) return { title: 'Touring Expert' };
    const category: Category = await catRes.json();
    const subcategory: Category = await subRes.json();
    const title = `${subcategory.name} — ${category.name} | Touring Expert`;
    const description = `Купить ${subcategory.name.toLowerCase()} на Touring Expert. Профессиональное оборудование по лучшим ценам.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/catalog/category/${slug}/${sub}`,
        type: 'website',
      },
    };
  } catch {
    return { title: 'Touring Expert' };
  }
}

export default async function SubcategoryPage({
  params,
}: {
  params: Promise<{ slug: string; sub: string }>;
}) {
  const { slug, sub } = await params;
  let category: Category | null = null;
  let subcategory: Category | null = null;

  try {
    const [catRes, subRes] = await Promise.all([
      fetch(`${API_URL}/categories/slug/${slug}`, { next: { revalidate: 3600 } }),
      fetch(`${API_URL}/categories/slug/${sub}`, { next: { revalidate: 3600 } }),
    ]);
    if (catRes.ok) category = await catRes.json();
    if (subRes.ok) subcategory = await subRes.json();
  } catch {}

  if (!category || !subcategory) {
    return <div className='p-4 text-center'>Категория не найдена</div>;
  }

  return (
    <CategoryPageClient
      categoryId={category.id}
      subcategoryId={subcategory.id}
      categoryName={subcategory.name}
      categorySlug={slug}
      parentCategoryName={category.name}
    />
  );
}
