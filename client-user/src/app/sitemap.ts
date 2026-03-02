import type { MetadataRoute } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SITE_URL = 'https://touringexpertsale.ru';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/catalog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/job`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  const results: MetadataRoute.Sitemap = [...staticPages];

  // Все товары
  try {
    const res = await fetch(`${API_URL}/products/available?limit=10000`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const products: { id: string }[] = await res.json();
      products.forEach(p => {
        results.push({
          url: `${SITE_URL}/catalog/${p.id}`,
          lastModified: new Date(),
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      });
    }
  } catch {}

  // Категории фильтра
  try {
    const res = await fetch(`${API_URL}/categories/available`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const cats: { id: string; parentId: string | null }[] = await res.json();
      cats.forEach(c => {
        if (!c.parentId) {
          results.push({
            url: `${SITE_URL}/catalog?category=${c.id}`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
          });
        } else {
          results.push({
            url: `${SITE_URL}/catalog?category=${c.parentId}&subcategory=${c.id}`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.75,
          });
        }
      });
    }
  } catch {}

  // Все бренды
  try {
    const res = await fetch(`${API_URL}/brands/available`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const brands: { id: string }[] = await res.json();
      brands.forEach(b => {
        results.push({
          url: `${SITE_URL}/catalog/brands/${b.id}`,
          lastModified: new Date(),
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      });
    }
  } catch {}

  return results;
}
