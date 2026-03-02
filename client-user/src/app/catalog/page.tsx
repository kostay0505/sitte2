import { Suspense } from 'react';
import type { Metadata } from 'next';
import CatalogClient from './CatalogClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type SearchParamsType = Promise<{
  category?: string;
  subcategory?: string;
  brand?: string;
}>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParamsType;
}): Promise<Metadata> {
  const { category: categoryId, subcategory: subcategoryId, brand: brandId } =
    await searchParams;

  let categoryName = '';
  let brandName = '';

  if (categoryId || subcategoryId) {
    try {
      const res = await fetch(`${API_URL}/categories/available`, {
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const cats: { id: string; name: string; parentId: string | null }[] =
          await res.json();
        const target = subcategoryId
          ? cats.find(c => c.id === subcategoryId)
          : cats.find(c => c.id === categoryId);
        if (target) categoryName = target.name;
      }
    } catch {}
  }

  if (brandId) {
    try {
      const res = await fetch(`${API_URL}/brands/available`, {
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const brands: { id: string; name: string }[] = await res.json();
        const target = brands.find(b => b.id === brandId);
        if (target) brandName = target.name;
      }
    } catch {}
  }

  let title = 'Каталог товаров — Touring Expert';
  if (categoryName && brandName) {
    title = `${categoryName} · ${brandName} — Touring Expert`;
  } else if (categoryName) {
    title = `${categoryName} — купить на Touring Expert`;
  } else if (brandName) {
    title = `${brandName} — Touring Expert`;
  }

  return { title };
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParamsType;
}) {
  await searchParams;
  return (
    <Suspense>
      <CatalogClient />
    </Suspense>
  );
}
