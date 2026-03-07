'use client';

import React, { useEffect, useState } from 'react';
import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { getBusinessPageSlugByUserId, getBusinessPageBySlug } from '@/api/business-page/methods';
import { getAvailableProducts } from '@/api/products/methods';
import type { BusinessPage, Block, ShowcaseBlock, PhotoCarouselBlock, ContactsBlock } from '@/api/business-page/types';
import type { UserBasic } from '@/api/user/types';
import { toImageSrc } from '@/utils/toImageSrc';
import { ImageWithSkeleton } from '@/components/common/ImageWithSkeleton/ImageWithSkeleton';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { ROUTES } from '@/config/routes';
import { Phone, Mail, MapPin, UserIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** userId продавца */
  userId: string;
  /** Уже загруженный seller (опционально — для отображения шапки) */
  seller?: UserBasic | null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function BusinessPageView({ userId, seller }: Props) {
  const [page, setPage] = useState<BusinessPage | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getBusinessPageSlugByUserId(userId)
      .then(slug => {
        if (!slug) { setNotFound(true); return; }
        return getBusinessPageBySlug(slug).then(p => setPage(p));
      })
      .catch(() => setNotFound(true));
  }, [userId]);

  if (notFound) {
    return (
      <div className='flex flex-col items-center justify-center py-24 text-gray-400'>
        <p className='text-lg font-medium'>Бизнес-страница не настроена</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className='flex items-center justify-center py-24'>
        <div className='w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin' />
      </div>
    );
  }

  return (
    <>
      {/* Seller header */}
      {seller && (
        <div className='max-w-[1280px] mx-auto px-4 md:px-8 py-6 flex items-center gap-4'>
          <div className='w-16 h-16 rounded-full overflow-hidden bg-gray-100 flex-shrink-0'>
            {seller.photoUrl
              ? <ImageWithSkeleton src={toImageSrc(seller.photoUrl)} alt={seller.firstName ?? ''} containerClassName='w-16 h-16' className='object-cover' />
              : <div className='w-full h-full flex items-center justify-center'><UserIcon className='w-8 h-8 text-gray-400' /></div>}
          </div>
          <div>
            <h1 className='text-xl font-bold text-gray-900'>
              {[seller.firstName, seller.lastName].filter(Boolean).join(' ') || seller.username || 'Продавец'}
            </h1>
            {seller.city && <p className='text-sm text-gray-400'>{seller.city.name}</p>}
          </div>
        </div>
      )}

      {/* Blocks */}
      <div className='space-y-0'>
        {page.blocks.map(block => (
          <BlockRenderer key={block.id} block={block} sellerId={page.userId} />
        ))}
      </div>
    </>
  );
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function BlockRenderer({ block, sellerId }: { block: Block; sellerId: string }) {
  switch (block.type) {
    case 'text_banner': return <TextBannerRenderer block={block} />;
    case 'photo_left': return <PhotoBannerRenderer block={block} photoSide='left' />;
    case 'photo_right': return <PhotoBannerRenderer block={block} photoSide='right' />;
    case 'showcase': return <ShowcaseRenderer block={block} sellerId={sellerId} />;
    case 'photo_carousel': return <PhotoCarouselRenderer block={block} />;
    case 'contacts': return <ContactsRenderer block={block} />;
    default: return null;
  }
}

function TextBannerRenderer({ block }: { block: { title: string; text: string } }) {
  return (
    <div className='w-full bg-gray-50 py-12 px-4'>
      <div className='max-w-[1280px] mx-auto text-center'>
        {block.title && <h2 className='text-3xl md:text-4xl font-bold text-gray-900 mb-4'>{block.title}</h2>}
        {block.text && <p className='text-gray-600 max-w-2xl mx-auto text-base leading-relaxed'>{block.text}</p>}
      </div>
    </div>
  );
}

function PhotoBannerRenderer({ block, photoSide }: {
  block: { title: string; text: string; photoUrl: string };
  photoSide: 'left' | 'right';
}) {
  const textContent = (
    <div className='flex-1 space-y-4 p-6 md:p-10'>
      {block.title && <h2 className='text-2xl md:text-3xl font-bold text-gray-900'>{block.title}</h2>}
      {block.text && <p className='text-gray-600 leading-relaxed'>{block.text}</p>}
    </div>
  );
  const photoContent = block.photoUrl ? (
    <div className='flex-1 min-h-[240px] md:min-h-[320px] bg-gray-100'>
      <img src={toImageSrc(block.photoUrl)} alt='' className='w-full h-full object-cover' />
    </div>
  ) : <div className='flex-1 bg-gray-100' />;

  return (
    <div className={cn('flex flex-col md:flex-row', photoSide === 'right' && 'md:flex-row-reverse')}>
      {photoSide === 'left' ? <>{photoContent}{textContent}</> : <>{textContent}{photoContent}</>}
    </div>
  );
}

function ShowcaseRenderer({ block, sellerId }: { block: ShowcaseBlock; sellerId: string }) {
  const [products, setProducts] = useState<any[]>([]);
  useEffect(() => {
    getAvailableProducts({ sellerId, categoryId: block.categoryId ?? undefined, limit: 10 })
      .then(r => setProducts(r ?? []))
      .catch(() => {});
  }, [sellerId, block.categoryId]);

  if (!products.length) return null;
  return (
    <div className='max-w-[1280px] mx-auto px-4 md:px-8 py-8'>
      {block.title && <h2 className='text-xl font-bold text-gray-900 mb-4'>{block.title}</h2>}
      <div className='grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4'>
        {products.map(p => (
          <ProductCard key={p.id} product={p} href={`${ROUTES.CATALOG}/${p.id}`} />
        ))}
      </div>
    </div>
  );
}

function PhotoCarouselRenderer({ block }: { block: PhotoCarouselBlock }) {
  if (!block.items.length) return null;
  return (
    <div className='py-8 bg-white'>
      <div className='max-w-[1280px] mx-auto px-4 md:px-8'>
        {block.title && <h2 className='text-xl font-bold text-gray-900 mb-4'>{block.title}</h2>}
        <div className='flex gap-3 overflow-x-auto scrollbar-hide pb-2'>
          {block.items.map((item, i) =>
            item.mediaType === 'video' ? (
              <video key={i} src={toImageSrc(item.url)} controls className='h-48 w-auto rounded-xl flex-shrink-0 object-cover' />
            ) : (
              <img key={i} src={toImageSrc(item.url)} alt='' className='h-48 w-auto rounded-xl flex-shrink-0 object-cover' />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function ContactsRenderer({ block }: { block: ContactsBlock }) {
  if (!block.phone && !block.email && !block.address) return null;
  return (
    <div className='w-full bg-gray-50 py-10 px-4'>
      <div className='max-w-[1280px] mx-auto'>
        <h2 className='text-xl font-bold text-gray-900 mb-6'>Контакты</h2>
        <div className='flex flex-col md:flex-row gap-6'>
          {block.phone && (
            <a href={`tel:${block.phone}`} className='flex items-center gap-3 text-gray-700 hover:text-black transition'>
              <Phone className='w-5 h-5 text-gray-400' /><span>{block.phone}</span>
            </a>
          )}
          {block.email && (
            <a href={`mailto:${block.email}`} className='flex items-center gap-3 text-gray-700 hover:text-black transition'>
              <Mail className='w-5 h-5 text-gray-400' /><span>{block.email}</span>
            </a>
          )}
          {block.address && (
            <div className='flex items-center gap-3 text-gray-700'>
              <MapPin className='w-5 h-5 text-gray-400 flex-shrink-0' /><span>{block.address}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
