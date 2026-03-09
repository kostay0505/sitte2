'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { ProductImageGallery } from '@/components/Product/ProductImageGallery';
import { ProductHeader } from '@/components/Product/ProductHeader';
import { ProductDetailCarousel } from '@/components/Product/ProductDetailCarousel';
import { useProduct } from '@/features/products/hooks';
import { useQuery } from '@tanstack/react-query';
import { getAvailableProducts } from '@/api/products/methods';
import { markProductViewed } from '@/api/products/methods';
import type { Product } from '@/api/products/types';
import { toImageSrc } from '@/utils/toImageSrc';
import { ShareModal } from '@/components/Product/ShareModal';
import { getOrCreateChat } from '@/api/chat/methods';
import { useAuthStore } from '@/stores/authStore';
import { getTokens } from '@/api/auth/tokenStorage';
import { extractTgIdFromToken } from '@/utils/tokenUtils';
import { ImageWithSkeleton } from '@/components/common/ImageWithSkeleton/ImageWithSkeleton';
import { ROUTES } from '@/config/routes';
import { Link } from '@/components/Link/Link';

function mapMediaFiles(p?: Product): { url: string; type: 'image' | 'video' }[] {
  if (!p) return [];
  const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/i;
  const isVideoUrl = (url: string) => VIDEO_EXT_RE.test(url.split('?')[0]);
  return [p.preview, ...(p.files || [])]
    .filter(Boolean)
    .map(url => ({
      url: toImageSrc(url),
      type: isVideoUrl(url) ? ('video' as const) : ('image' as const),
    }));
}

function saveToRecentlyViewed(product: Product) {
  try {
    const key = 'te_recently_viewed';
    const existing = JSON.parse(localStorage.getItem(key) || '[]') as {
      id: string;
      name: string;
      preview: string;
      priceCash: string;
      currency: string;
    }[];
    const updated = [
      {
        id: product.id,
        name: product.name,
        preview: product.preview,
        priceCash: product.priceCash,
        currency: product.currency,
      },
      ...existing.filter(p => p.id !== product.id),
    ].slice(0, 20);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {}
}

function getSellerName(user?: Product['user']): string {
  if (!user) return '';
  return user.lastName || user.firstName
    ? `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim()
    : user.username ?? 'Продавец';
}

export function CatalogDetailsClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const { data: product, status } = useProduct(id);
  const isLoading = status === 'pending';
  const isAuthorized = useAuthStore(s => s.isAuthorized);
  const setAuthMode = useAuthStore(s => s.setAuthMode);

  const currentUserTgId = (() => {
    if (typeof window === 'undefined') return '';
    const tokens = getTokens();
    if (tokens?.accessToken) return extractTgIdFromToken(tokens.accessToken) ?? '';
    return '';
  })();

  const sellerTgId = product?.user?.tgId ?? null;
  const isSeller = !!sellerTgId && !!currentUserTgId && sellerTgId === currentUserTgId;
  const showChatButton = !isSeller && !!product?.id;

  useEffect(() => {
    if (product?.id) {
      markProductViewed({ id: product.id }).catch(() => {});
      saveToRecentlyViewed(product);
    }
  }, [product?.id]);

  // Fetch seller products for count
  const { data: sellerProducts = [] } = useQuery({
    queryKey: ['seller-count', sellerTgId],
    queryFn: () => getAvailableProducts({ sellerId: sellerTgId!, limit: 200 }),
    enabled: !!sellerTgId && !isLoading,
    staleTime: 5 * 60 * 1000,
  });

  const handleOpenChat = async () => {
    if (!product?.id) return;
    try {
      setChatLoading(true);
      const chat = await getOrCreateChat(product.id);
      router.push('/chats/' + chat.id);
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setChatLoading(false);
    }
  };

  if (!isLoading && !product) {
    return (
      <div className='p-2 pt-4 text-center text-black'>Товар не найден</div>
    );
  }

  const mediaFiles = mapMediaFiles(product);
  const sellerName = getSellerName(product?.user);
  const sellerCity = product?.user?.city?.name ?? '';

  const sellerAvatar = (size: number) =>
    product?.user?.photoUrl ? (
      <ImageWithSkeleton
        src={toImageSrc(product.user.photoUrl)}
        alt={sellerName}
        containerClassName='w-full h-full'
        className='object-cover'
      />
    ) : (
      <div className='w-full h-full bg-gray-300 flex items-center justify-center text-gray-500 text-xs font-bold'>
        {sellerName.charAt(0).toUpperCase()}
      </div>
    );


  return (
    <Page back={true}>
      <Layout className='px-4 pt-4 pb-8'>
        {/* ─── Main section: photos (left) + product info (right) ─── */}
        <div className='flex flex-col md:flex-row gap-6 mb-10'>
          {/* Left column: seller badge + photo grid + shop-more */}
          <div className='w-full md:w-[45%] flex flex-col gap-3'>
            {/* Seller badge above photo */}
            {(isLoading || product) && (
              <div className='flex items-center gap-2'>
                <div
                  className='shrink-0 rounded-full overflow-hidden bg-gray-200'
                  style={{ width: 32, height: 32 }}
                >
                  {!isLoading && sellerAvatar(32)}
                </div>
                <div className='flex flex-col min-w-0'>
                  <span className='text-xs font-semibold text-black leading-tight truncate'>
                    {isLoading ? '...' : sellerName}
                  </span>
                  {sellerCity && (
                    <span className='text-[10px] text-gray-500 truncate'>{sellerCity}</span>
                  )}
                </div>
              </div>
            )}

            {/* 2-column photo grid */}
            <ProductImageGallery
              mediaFiles={mediaFiles}
              productId={product?.id ?? ''}
              isLoading={isLoading}
            />

            {/* Shop more from seller (below photos) */}
            {(isLoading || product) && (
              <div className='flex items-center justify-between gap-4 py-2'>
                <div className='flex items-center gap-2 min-w-0'>
                  <div
                    className='shrink-0 rounded-full overflow-hidden bg-gray-200'
                    style={{ width: 36, height: 36 }}
                  >
                    {!isLoading && sellerAvatar(36)}
                  </div>
                  <div className='flex flex-col min-w-0'>
                    <span className='text-xs font-semibold text-black leading-tight truncate'>
                      Shop more from {isLoading ? '...' : sellerName}
                    </span>
                    {sellerCity && (
                      <span className='text-[10px] text-gray-500 truncate'>{sellerCity}</span>
                    )}
                  </div>
                </div>
                {!isLoading && sellerTgId && (
                  <Link
                    href={`${ROUTES.SALLER}/${sellerTgId}`}
                    className='ml-auto bg-black text-white text-xs font-medium rounded px-4 py-2 whitespace-nowrap shrink-0 hover:bg-black/80 transition'
                  >
                    {'Shop all' + (sellerProducts.length > 0 ? ' ' + sellerProducts.length : '') + ' products'}
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Right column: product info */}
          <div className='flex-1 flex flex-col gap-4'>
            <ProductHeader
              product={product}
              isLoading={isLoading}
              onShareClick={() => setShareOpen(true)}
              showChatButton={showChatButton}
              onChatClick={() => {
                if (!isAuthorized) {
                  setAuthMode('login');
                  return;
                }
                handleOpenChat();
              }}
              chatLoading={chatLoading}
            />
          </div>
        </div>

        {/* ─── Carousels ─── */}
        {product && (
          <div className='flex flex-col gap-10'>
            {product.brand?.id && (
              <ProductDetailCarousel
                title='Frequently bought together'
                queryParams={{ brandId: product.brand.id }}
                excludeId={product.id}
                queryKey='detail-brand'
              />
            )}

            {product.category?.id && (
              <ProductDetailCarousel
                title={`More in ${product.category.name ?? 'this category'}`}
                queryParams={{ categoryId: product.category.id }}
                excludeId={product.id}
                queryKey='detail-category'
              />
            )}

            {product.user?.tgId && (
              <ProductDetailCarousel
                title={`More from ${sellerName}`}
                queryParams={{ sellerId: product.user.tgId }}
                excludeId={product.id}
                queryKey='detail-seller'
              />
            )}
          </div>
        )}
      </Layout>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={`${product?.url}`}
      />
    </Page>
  );
}
