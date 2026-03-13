import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { CatalogDetailsClient } from './CatalogDetailsClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SITE_URL = 'https://touringexpertsale.ru';

function buildImageUrl(preview: string | null | undefined): string | null {
  if (!preview) return null;
  if (/^https?:\/\//i.test(preview)) return preview;
  const base = (API_URL || '').replace(/\/+$/, '');
  const path = preview.replace(/^\/+/, '');
  return base ? `${base}/files/${path}` : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/products/${id}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return { title: 'Touring Expert' };

    const product = await res.json();

    const title = `${product.name} — Touring Expert`;
    const description = product.description
      ? product.description.slice(0, 160)
      : `Купить ${product.name} на Touring Expert`;
    const imageUrl = buildImageUrl(product.preview);

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/catalog/${id}`,
        type: 'website',
        ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
      },
    };
  } catch {
    return { title: 'Touring Expert' };
  }
}

export default async function CatalogDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Если UUID — редиректим на SEO-URL
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (isUUID) {
    try {
      const res = await fetch(`${API_URL}/products/${id}`, {
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const product = await res.json();
        if (product.slug && product.brandSlug) {
          permanentRedirect(`/catalog/${product.brandSlug}/${product.slug}`);
        }
      }
    } catch {}
  }

  return <CatalogDetailsClient />;
}
