'use client';

import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { ProductImageGallery } from '@/components/Product/ProductImageGallery';
import { ProductHeader } from '@/components/Product/ProductHeader';
import { ProductDescription } from '@/components/Product/ProductDescription';
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
        {/* Мобильная версия */}
        <div className='flex flex-col gap-5 md:hidden mb-5'>
          <ProductHeader
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            product={product as any}
            isLoading={false}
            isOpen={shareOpen}
            setIsOpen={() => setShareOpen(true)}
          />
          <ProductImageGallery
            mediaFiles={mediaFiles}
            productId={product.id}
            isLoading={false}
            isFavorite={false}
          />
          <ProductDescription description={product.description} isLoading={false} />
        </div>

        {/* Десктопная версия */}
        <div className='hidden w-full md:flex flex-row gap-5 mb-5'>
          <ProductImageGallery
            mediaFiles={mediaFiles}
            productId={product.id}
            isLoading={false}
            className='max-w-2/5 w-full'
            isFavorite={false}
          />
          <div className='flex-1 flex flex-col gap-5 w-full'>
            <ProductHeader
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              product={product as any}
              isLoading={false}
              isOpen={shareOpen}
              setIsOpen={() => setShareOpen(true)}
            />
            <ProductDescription description={product.description} isLoading={false} />
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
