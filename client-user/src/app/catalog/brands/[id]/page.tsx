import type { Metadata } from 'next';
import { BrandPageClient } from './BrandPageClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SITE_URL = 'https://touringexpertsale.ru';

function buildImageUrl(photo: string | null | undefined): string | null {
  if (!photo) return null;
  if (/^https?:\/\//i.test(photo)) return photo;
  const base = (API_URL || '').replace(/\/+$/, '');
  const path = photo.replace(/^\/+/, '');
  return base ? `${base}/files/${path}` : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/brands/${id}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return { title: 'Touring Expert' };

    const brand = await res.json();

    const title = `${brand.name} — товары бренда | Touring Expert`;
    const description = brand.description
      ? brand.description.slice(0, 160)
      : `Все товары бренда ${brand.name} на Touring Expert`;
    const imageUrl = buildImageUrl(brand.photo);

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/catalog/brands/${id}`,
        type: 'website',
        ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
      },
    };
  } catch {
    return { title: 'Touring Expert' };
  }
}

export default function BrandPage() {
  return <BrandPageClient />;
}
