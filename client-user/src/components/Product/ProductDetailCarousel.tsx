'use client';

import { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import { getAvailableProducts } from '@/api/products/methods';
import type { ProductsAvailableQuery, ProductBasic } from '@/api/products/types';
import { ROUTES } from '@/config/routes';
import { ImageWithSkeleton } from '@/components/common/ImageWithSkeleton/ImageWithSkeleton';
import { Skeleton } from '@/components/common/Skeleton/Skeleton';
import { toImageSrc } from '@/utils/toImageSrc';
import { formatPrice } from '@/utils/currency';
import { Link } from '@/components/Link/Link';
import { cn } from '@/utils/cn';

interface Props {
  title: string;
  queryParams: ProductsAvailableQuery;
  excludeId?: string;
  queryKey: string;
}

const breakpoints = {
  0: { slidesPerView: 2.3, spaceBetween: 8 },
  640: { slidesPerView: 3, spaceBetween: 12 },
  1024: { slidesPerView: 5, spaceBetween: 16 },
};

function ProductCard({
  product,
  isLoading,
  href,
}: {
  product?: ProductBasic;
  isLoading?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href ?? ''}
      className={cn(
        'flex flex-col bg-[#F5F5FA] rounded-xl overflow-hidden',
        !href && 'pointer-events-none',
      )}
    >
      <div className='overflow-hidden rounded-t-xl'>
        <ImageWithSkeleton
          src={toImageSrc(product?.preview ?? '')}
          alt={product?.name ?? ''}
          isLoading={isLoading}
          containerClassName='w-full !h-[140px] md:!h-[180px]'
          className='object-contain'
          skeletonClassName='!rounded-none'
        />
      </div>
      <div className='flex flex-col gap-1 p-3 text-black'>
        {isLoading ? (
          <>
            <Skeleton height={18} width='100%' />
            <Skeleton height={14} width='60%' />
          </>
        ) : (
          <>
            <div className='text-xs md:text-sm font-medium line-clamp-2 min-h-[32px]'>
              {product?.name}
            </div>
            <div className='text-xs md:text-sm font-semibold text-primary-green'>
              {Number(product?.priceCash) === 0
                ? 'Цена по запросу'
                : formatPrice(product?.priceCash, product?.currency)}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

export const ProductDetailCarousel: FC<Props> = ({
  title,
  queryParams,
  excludeId,
  queryKey,
}) => {
  const enabled = Object.values(queryParams).some(v => v !== undefined && v !== null && v !== '');

  const { data = [], isLoading } = useQuery({
    queryKey: [queryKey, queryParams],
    queryFn: () => getAvailableProducts({ limit: 14, ...queryParams }),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const items = isLoading
    ? (Array.from({ length: 8 }).map((_, i) => ({ id: `sk-${i}` })) as ProductBasic[])
    : data.filter(p => p.id !== excludeId).slice(0, 12);

  if (!isLoading && items.length === 0) return null;

  return (
    <div className='w-full'>
      <h2 className='text-lg md:text-2xl font-bold text-black mb-4'>{title}</h2>
      <div className='relative'>
        <Swiper
          modules={[Navigation]}
          breakpoints={breakpoints}
          navigation
          loop={items.length >= 5}
          speed={400}
        >
          {items.map((item, index) => (
            <SwiperSlide key={item.id || index}>
              <ProductCard
                product={isLoading ? undefined : item}
                isLoading={isLoading}
                href={isLoading ? '' : (item.brandSlug && item.slug ? `/catalog/${item.brandSlug}/${item.slug}` : `${ROUTES.CATALOG}/${item.id}`)}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
};
