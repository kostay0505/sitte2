'use client';

import { FC } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay } from 'swiper/modules';
import 'swiper/css';
import { toImageSrc } from '@/utils/toImageSrc';
import type { BannerContent } from '@/api/site-content/types';
import { Link } from '@/components/Link/Link';

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  'top-left':      { justifyContent: 'flex-start', alignItems: 'flex-start', padding: '24px' },
  'top-center':    { justifyContent: 'center',     alignItems: 'flex-start', paddingTop: '24px' },
  'top-right':     { justifyContent: 'flex-end',   alignItems: 'flex-start', padding: '24px' },
  'center-left':   { justifyContent: 'flex-start', alignItems: 'center',     paddingLeft: '24px' },
  'center':        { justifyContent: 'center',     alignItems: 'center' },
  'center-right':  { justifyContent: 'flex-end',   alignItems: 'center',     paddingRight: '24px' },
  'bottom-left':   { justifyContent: 'flex-start', alignItems: 'flex-end',   padding: '24px' },
  'bottom-center': { justifyContent: 'center',     alignItems: 'flex-end',   paddingBottom: '24px' },
  'bottom-right':  { justifyContent: 'flex-end',   alignItems: 'flex-end',   padding: '24px' },
};

interface Props {
  content: BannerContent | null;
}

export const HomeBanner: FC<Props> = ({ content }) => {
  const slides = content?.slides ?? [];
  if (!slides.length) return null;

  return (
    <div className='w-full'>
      <Swiper
        modules={[Autoplay]}
        autoplay={{ delay: 15000, disableOnInteraction: false }}
        loop={slides.length > 1}
        speed={600}
        className='w-full'
      >
        {slides.map((slide, i) => {
          const posStyle = POSITION_STYLES[slide.buttonPosition ?? 'center'] ?? POSITION_STYLES['center'];
          return (
            <SwiperSlide key={i}>
              <div className='relative w-full h-[200px] md:h-[400px] overflow-hidden bg-gray-200'>
                {slide.image && (
                  <picture className='absolute inset-0 block'>
                    {slide.imageMobile && (
                      <source media='(max-width: 767px)' srcSet={toImageSrc(slide.imageMobile)} />
                    )}
                    <img
                      src={toImageSrc(slide.image)}
                      alt={`Banner ${i + 1}`}
                      className='w-full h-full object-cover'
                    />
                  </picture>
                )}
                {slide.buttonText && slide.buttonLink && (
                  <div
                    className='absolute inset-0 flex'
                    style={posStyle}
                  >
                    <Link
                      href={slide.buttonLink}
                      className='text-sm md:text-base font-semibold px-6 py-3 rounded-lg shadow-md transition hover:opacity-80'
                      style={{
                        backgroundColor: slide.buttonBg || '#ffffff',
                        color: slide.buttonColor || '#000000',
                      }}
                    >
                      {slide.buttonText}
                    </Link>
                  </div>
                )}
              </div>
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
};
