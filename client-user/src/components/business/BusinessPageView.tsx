'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { getBusinessPageSlugByUserId, getBusinessPageBySlug } from '@/api/business-page/methods';
import { getAvailableProducts } from '@/api/products/methods';
import type { BusinessPage, Block, ShowcaseBlock, PhotoCarouselBlock, ContactsBlock, CatalogBlock } from '@/api/business-page/types';
import type { UserBasic } from '@/api/user/types';
import { toImageSrc } from '@/utils/toImageSrc';
import { ImageWithSkeleton } from '@/components/common/ImageWithSkeleton/ImageWithSkeleton';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { ROUTES } from '@/config/routes';
import { Phone, Mail, MapPin, UserIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';

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
          <BlockRenderer key={block.id} block={block} sellerId={page.userId} slug={page.slug} />
        ))}
      </div>
    </>
  );
}

// ─── Block renderers ──────────────────────────────────────────────────────────

export function BlockRenderer({ block, sellerId, slug }: { block: Block; sellerId: string; slug?: string }) {
  switch (block.type) {
    case 'text_banner': return <TextBannerRenderer block={block} />;
    case 'photo_left': return <PhotoBannerRenderer block={block} photoSide='left' />;
    case 'photo_right': return <PhotoBannerRenderer block={block} photoSide='right' />;
    case 'showcase': return <ShowcaseRenderer block={block} sellerId={sellerId} />;
    case 'photo_carousel': return <PhotoCarouselRenderer block={block} />;
    case 'contacts': return <ContactsRenderer block={block} />;
    case 'catalog': return <CatalogRenderer block={block} slug={slug} />;
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

const showcaseBreakpoints = {
  0:    { slidesPerView: 2.3, spaceBetween: 8 },
  640:  { slidesPerView: 3,   spaceBetween: 12 },
  1024: { slidesPerView: 5,   spaceBetween: 16 },
};

function ShowcaseRenderer({ block, sellerId }: { block: ShowcaseBlock; sellerId: string }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLoading(true);
    getAvailableProducts({ sellerId, categoryId: block.categoryId ?? undefined, limit: 12 })
      .then(r => setProducts(r ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sellerId, block.categoryId]);

  const items = loading
    ? Array.from({ length: 6 }).map((_, i) => ({ id: `sk-${i}` }) as any)
    : products;

  if (!loading && items.length === 0) return null;

  return (
    <div className='max-w-[1280px] mx-auto px-4 md:px-8 py-8'>
      {block.title && <h2 className='text-xl font-bold text-gray-900 mb-4'>{block.title}</h2>}
      <div className='relative'>
        <button
          ref={prevRef}
          className='hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 z-10 w-9 h-9 items-center justify-center bg-white rounded-full shadow border border-gray-200 hover:bg-gray-50 transition'
          aria-label='Previous'
        >
          <ChevronLeft className='w-4 h-4 text-gray-700' />
        </button>

        <Swiper
          modules={[Navigation]}
          breakpoints={showcaseBreakpoints}
          navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
          onBeforeInit={swiper => {
            (swiper.params.navigation as any).prevEl = prevRef.current;
            (swiper.params.navigation as any).nextEl = nextRef.current;
          }}
          loop={items.length >= 5}
          speed={400}
        >
          {items.map((p: any, i: number) => (
            <SwiperSlide key={p.id || i}>
              <ProductCard
                product={loading ? undefined : p}
                isLoading={loading}
                href={loading ? '' : (p.brandSlug && p.slug ? `/catalog/${p.brandSlug}/${p.slug}` : `${ROUTES.CATALOG}/${p.id}`)}
              />
            </SwiperSlide>
          ))}
        </Swiper>

        <button
          ref={nextRef}
          className='hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 z-10 w-9 h-9 items-center justify-center bg-white rounded-full shadow border border-gray-200 hover:bg-gray-50 transition'
          aria-label='Next'
        >
          <ChevronRight className='w-4 h-4 text-gray-700' />
        </button>
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

function CatalogRenderer({ block, slug }: { block: CatalogBlock; slug?: string }) {
  const href = slug ? `/shop/${slug}/catalog` : '#';
  const textContent = (
    <div className='flex-1 space-y-4 p-6 md:p-10 flex flex-col justify-center'>
      {block.title && <h2 className='text-2xl md:text-3xl font-bold text-gray-900'>{block.title}</h2>}
      {block.text && <p className='text-gray-600 leading-relaxed'>{block.text}</p>}
      <div>
        <a
          href={href}
          className='inline-block px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition'
        >
          {block.buttonText || 'Смотреть каталог'}
        </a>
      </div>
    </div>
  );
  const photoContent = block.photoUrl ? (
    <div className='flex-1 min-h-[240px] md:min-h-[320px] bg-gray-100'>
      <img src={toImageSrc(block.photoUrl)} alt='' className='w-full h-full object-cover' />
    </div>
  ) : <div className='flex-1 bg-gray-100' />;

  return (
    <div className='flex flex-col md:flex-row md:flex-row-reverse'>
      {photoContent}
      {textContent}
    </div>
  );
}
