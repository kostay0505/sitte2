'use client';

import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { ProductImageGallery } from '@/components/Product/ProductImageGallery';
import { ProductHeader } from '@/components/Product/ProductHeader';
import { ShareModal } from '@/components/Product/ShareModal';
import type { TestProduct } from '../../_testData';
import { SITE_URL } from '../../_testData';

interface Props {
  product: TestProduct;
}

export function TestListingClient({ product }: Props) {
  const [shareOpen, setShareOpen] = useState(false);

  const mediaFiles = [product.preview, ...product.files].map(url => ({
    url,
    type: 'image' as const,
  }));

  const shareUrl = `${SITE_URL}/test/listing/${product.slug}`;

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4'>
        <div className='flex flex-col md:flex-row gap-6 mb-5'>
          <div className='w-full md:w-[45%]'>
            <ProductImageGallery
              mediaFiles={mediaFiles}
              productId={product.id}
              isLoading={false}
            />
          </div>
          <div className='flex-1'>
            <ProductHeader
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              product={product as any}
              isLoading={false}
              onShareClick={() => setShareOpen(true)}
            />
          </div>
        </div>
      </Layout>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
      />
    </Page>
  );
}
