'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { Page } from '@/components/Page';
import { ProductImageGallery } from '@/components/Product/ProductImageGallery';
import { ProductHeader } from '@/components/Product/ProductHeader';
import { ProductDescription } from '@/components/Product/ProductDescription';
import { useProduct } from '@/features/products/hooks';
import { markProductViewed } from '@/api/products/methods';
import type { Product } from '@/api/products/types';
import { toImageSrc } from '@/utils/toImageSrc';
import { ShareModal } from '@/components/Product/ShareModal';

function mapMediaFiles(
  p?: Product,
): { url: string; type: 'image' | 'video' }[] {
  if (!p) return [];

  const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/i;
  const isVideoUrl = (url: string) => VIDEO_EXT_RE.test(url.split('?')[0]);

  const mediaFiles = [p.preview, ...(p.files || [])]
    .filter(Boolean)
    .map(url => ({
      url: toImageSrc(url),
      type: isVideoUrl(url) ? ('video' as const) : ('image' as const),
    }));
  return mediaFiles;
}

export function CatalogDetailsClient() {
  const { id } = useParams<{ id: string }>();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { data: product, status } = useProduct(id);
  const isLoading = status === 'pending';

  useEffect(() => {
    if (product?.id) {
      markProductViewed({ id: product.id }).catch(() => {});
    }
  }, [product?.id]);

  if (!isLoading && !product) {
    return (
      <div className='p-2 pt-4 text-center text-black'>Продукт не найден</div>
    );
  }

  return (
    <Page back={true}>
      <Layout className='p-2 pt-4'>
        {/* 📱 Мобильная версия */}
        <div className='flex flex-col gap-5 md:hidden mb-5'>
          <ProductHeader
            product={product}
            isLoading={isLoading}
            isOpen={isOpen}
            setIsOpen={() => {
              setIsOpen(true);
            }}
          />
          <ProductImageGallery
            mediaFiles={mapMediaFiles(product)}
            productId={product?.id ?? ''}
            isLoading={isLoading}
            isFavorite={product?.isFavorite}
          />
          <ProductDescription
            description={product?.description ?? ''}
            isLoading={isLoading}
          />
        </div>

        {/* 💻 Десктопная версия */}
        <div className='hidden w-full md:flex flex-row gap-5 mb-5'>
          <ProductImageGallery
            mediaFiles={mapMediaFiles(product)}
            productId={product?.id ?? ''}
            isLoading={isLoading}
            className='max-w-2/5 w-full'
            isFavorite={product?.isFavorite}
          />
          <div className='flex-1 flex flex-col gap-5 w-full'>
            <ProductHeader
              product={product}
              isLoading={isLoading}
              isOpen={isOpen}
              setIsOpen={() => {
                setIsOpen(true);
              }}
            />

            <ProductDescription
              description={product?.description ?? ''}
              isLoading={isLoading}
            />
          </div>
        </div>
      </Layout>
      <ShareModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        url={`${product?.url}`}
      ></ShareModal>
    </Page>
  );
}
