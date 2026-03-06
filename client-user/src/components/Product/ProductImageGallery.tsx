'use client';

import { useState } from 'react';
import { cn } from '@/utils/cn';
import { ImageWithSkeleton } from '../common/ImageWithSkeleton/ImageWithSkeleton';
import { Skeleton } from '../common/Skeleton/Skeleton';
import { ImageSliderModal } from './ImageSliderModal';

interface Props {
  mediaFiles: { url: string; type: 'image' | 'video' }[];
  productId: string;
  className?: string;
  isLoading?: boolean;
}

export const ProductImageGallery: React.FC<Props> = ({
  mediaFiles,
  className,
  isLoading,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIndex, setModalIndex] = useState(0);

  const visibleFiles = mediaFiles.slice(0, 6);

  // Always render 6 cells; empty ones are grey placeholders
  const cells: ({ url: string; type: 'image' | 'video' } | null)[] = [
    ...visibleFiles,
    ...Array<null>(Math.max(0, 6 - visibleFiles.length)).fill(null),
  ];

  const handleClick = (i: number) => {
    if (!mediaFiles[i]) return;
    setModalIndex(i);
    setModalOpen(true);
  };

  return (
    <div className={cn('grid grid-cols-2 gap-[2px]', className)}>
      {cells.map((media, i) => (
        <div
          key={i}
          className={cn(
            'aspect-square bg-gray-200 overflow-hidden relative',
            media && !isLoading && 'cursor-pointer hover:opacity-90 transition-opacity',
          )}
          onClick={() => handleClick(i)}
        >
          {isLoading ? (
            <Skeleton width='100%' height='100%' className='absolute inset-0' />
          ) : media ? (
            media.type === 'video' ? (
              <video
                src={media.url}
                className='w-full h-full object-cover'
                muted
                preload='metadata'
              />
            ) : (
              <ImageWithSkeleton
                src={media.url}
                alt={`Photo ${i + 1}`}
                fill
                containerClassName='w-full h-full'
                className='object-cover'
              />
            )
          ) : null}
        </div>
      ))}

      {modalOpen && (
        <ImageSliderModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          mediaFiles={mediaFiles}
          initialIndex={modalIndex}
        />
      )}
    </div>
  );
};
