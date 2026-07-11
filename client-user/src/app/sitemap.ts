import type { MetadataRoute } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SITE_URL = 'https://touringexpertsale.ru';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/catalog`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/job`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  const results: MetadataRoute.Sitemap = [...staticPages];

  // All products
  try {
    const res = await fetch(`${API_URL}/products/available?limit=2000`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const products: { id: string; slug?: string | null; brandSlug?: string | null }[] = await res.json();
      products.forEach(p => {
        if (!p.brandSlug || !p.slug) return; // skip products without SEO slug
        results.push({
          url: `${SITE_URL}/catalog/${p.brandSlug}/${p.slug}`,
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      });
    }
  } catch {}

  // Category slug pages
  try {
    const res = await fetch(`${API_URL}/categories/available`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const cats: { id: string; slug: string | null; parentId: string | null }[] = await res.json();
      const slugById = new Map(cats.filter(c => c.slug).map(c => [c.id, c.slug!]));
      cats.forEach(c => {
        if (!c.parentId && c.slug) {
          results.push({
            url: `${SITE_URL}/catalog/category/${c.slug}`,
              changeFrequency: 'weekly',
            priority: 0.8,
          });
        } else if (c.parentId && c.slug && slugById.has(c.parentId)) {
          results.push({
            url: `${SITE_URL}/catalog/category/${slugById.get(c.parentId)}/${c.slug}`,
              changeFrequency: 'weekly',
            priority: 0.75,
          });
        }
      });
    }
  } catch {}

  // All brands
  try {
    const res = await fetch(`${API_URL}/brands/available`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const brands: { id: string; slug?: string | null }[] = await res.json();
      brands.forEach(b => {
        const segment = b.slug ?? b.id;
        results.push({
          url: `${SITE_URL}/catalog/brands/${segment}`,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      });
    }
  } catch {}

  return results;
}
