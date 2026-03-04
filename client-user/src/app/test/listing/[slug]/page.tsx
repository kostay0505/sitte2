import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TEST_PRODUCTS, SITE_URL } from '../../_testData';
import { TestListingClient } from './TestListingClient';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return TEST_PRODUCTS.map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = TEST_PRODUCTS.find(p => p.slug === slug);
  if (!product) return { title: 'Touring Expert' };

  const title = `${product.name} — Touring Expert`;
  const description = product.description.slice(0, 160);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/test/listing/${slug}`,
      type: 'website',
      images: [{ url: product.preview, width: 600, height: 600, alt: product.name }],
    },
  };
}

export default async function TestListingPage({ params }: Props) {
  const { slug } = await params;
  const product = TEST_PRODUCTS.find(p => p.slug === slug);
  if (!product) notFound();

  return <TestListingClient product={product} />;
}
