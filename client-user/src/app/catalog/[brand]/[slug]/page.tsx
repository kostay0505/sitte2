import type { Metadata } from 'next';
import type { Product } from '@/api/products/types';
import { CatalogDetailsClient } from './CatalogDetailsClient';
import { toJsonLd } from '@/utils/jsonLd';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SITE_URL = 'https://touringexpertsale.ru';

function buildImageUrl(preview: string | null | undefined): string | null {
  if (!preview) return null;
  if (/^https?:\/\//i.test(preview)) return preview;
  const base = (API_URL || '').replace(/\/+$/, '');
  const path = preview.replace(/^\/+/, '');
  return base ? `${base}/files/${path}` : null;
}

async function fetchProduct(slug: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API_URL}/products/slug/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string; slug: string }>;
}): Promise<Metadata> {
  const { brand, slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) return { title: 'Товар не найден' };

  // суффикс бренда добавит title.template из корневого layout ("%s | TEM")
  const title = product.name;
  const description = product.description
    ? product.description.slice(0, 160)
    : `Купить ${product.name} на маркетплейсе TEM (Touring Expert)`;
  const imageUrl = buildImageUrl(product.preview);

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/catalog/${brand}/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/catalog/${brand}/${slug}`,
      type: 'website',
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
  };
}

export default async function CatalogDetailsPage({
  params,
}: {
  params: Promise<{ brand: string; slug: string }>;
}) {
  const { brand, slug } = await params;
  // Next.js memoises fetch() with identical URL+options within one render cycle —
  // этот вызов не делает второй сетевой запрос, данные берутся из кеша generateMetadata
  const product = await fetchProduct(slug);

  const jsonLd = product
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Главная',
                item: `${SITE_URL}/`,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Каталог',
                item: `${SITE_URL}/catalog`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: product.name,
                item: `${SITE_URL}/catalog/${brand}/${slug}`,
              },
            ],
          },
          {
            '@type': 'Product',
            name: product.name,
            description: product.description || undefined,
            image: buildImageUrl(product.preview) || undefined,
            ...(product.brand?.name
              ? { brand: { '@type': 'Brand', name: product.brand.name } }
              : {}),
            offers: {
              '@type': 'Offer',
              price: product.priceCash,
              priceCurrency: product.currency || 'RUB',
              availability: 'https://schema.org/InStock',
              itemCondition: product.isNew
                ? 'https://schema.org/NewCondition'
                : 'https://schema.org/UsedCondition',
              url: `${SITE_URL}/catalog/${brand}/${slug}`,
              hasMerchantReturnPolicy: {
                '@type': 'MerchantReturnPolicy',
                applicableCountry: 'RU',
                returnPolicyCategory:
                  'https://schema.org/MerchantReturnFiniteReturnWindow',
                merchantReturnDays: 14,
                returnMethod: 'https://schema.org/ReturnByMail',
                returnFees: 'https://schema.org/FreeReturn',
              },
              shippingDetails: {
                '@type': 'OfferShippingDetails',
                shippingRate: {
                  '@type': 'MonetaryAmount',
                  value: 0,
                  currency: 'RUB',
                },
                shippingDestination: {
                  '@type': 'DefinedRegion',
                  addressCountry: 'RU',
                },
                deliveryTime: {
                  '@type': 'ShippingDeliveryTime',
                  handlingTime: {
                    '@type': 'QuantitativeValue',
                    minValue: 0,
                    maxValue: 3,
                    unitCode: 'DAY',
                  },
                  transitTime: {
                    '@type': 'QuantitativeValue',
                    minValue: 1,
                    maxValue: 14,
                    unitCode: 'DAY',
                  },
                },
              },
            },
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{ __html: toJsonLd(jsonLd) }}
        />
      )}
      <CatalogDetailsClient initialProduct={product} />
    </>
  );
}
