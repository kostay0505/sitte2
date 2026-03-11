'use client';

import { FC, useState } from 'react';
import { cn } from '@/utils/cn';
import { Skeleton } from '../common/Skeleton/Skeleton';
import { Product } from '@/api/products/types';
import { formatCurrencyNumber, getCurrencySymbol } from '@/utils/currency';
import { ShareIcon } from '../common/SvgIcon';
import { FavoriteButton } from '@/components/FavoriteButton';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { Link } from '@/components/Link/Link';


interface Props {
  product?: Product;
  className?: string;
  isLoading?: boolean;
  onShareClick?: () => void;
  showChatButton?: boolean;
  onChatClick?: () => void;
  chatLoading?: boolean;
}

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className='border-t border-gray-200'>
      <button
        type='button'
        className='w-full flex items-center justify-between py-3 text-left'
        onClick={() => setOpen(v => !v)}
      >
        <span className='font-medium text-black text-sm md:text-base'>{title}</span>
        {open ? (
          <ChevronUp className='w-4 h-4 text-gray-500 shrink-0' />
        ) : (
          <ChevronDown className='w-4 h-4 text-gray-500 shrink-0' />
        )}
      </button>
      {open && <div className='pb-4 text-sm text-black/80 leading-relaxed'>{children}</div>}
    </div>
  );
}

export const ProductHeader: FC<Props> = ({
  product,
  className,
  isLoading,
  onShareClick,
  showChatButton,
  onChatClick,
  chatLoading,
}) => {
  const priceCash = Number(product?.priceCash ?? 0);
  const priceNonCash = Number(product?.priceNonCash ?? 0);
  const currency = product?.currency ?? '';
  const sym = getCurrencySymbol(currency);

  const sellerDisplayName = product?.user
    ? product.user.lastName || product.user.firstName
      ? `${product.user.lastName ?? ''} ${product.user.firstName ?? ''}`.trim()
      : product.user.username ?? 'Продавец'
    : '';

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Title + favorite + share */}
      {isLoading ? (
        <Skeleton height={40} className='mb-4' />
      ) : (
        <div className='flex items-start gap-3 mb-4'>
          <h1 className='flex-1 text-2xl md:text-3xl font-bold text-black leading-tight'>
            {product?.name}
          </h1>
          <div className='flex items-center gap-2 mt-1 shrink-0'>
            <FavoriteButton
              isFavorite={!!product?.isFavorite}
              productId={product?.id ?? ''}
              size={22}
            />
            <button
              type='button'
              onClick={onShareClick}
              className='cursor-pointer hover:opacity-70 transition'
              aria-label='Поделиться'
            >
              <ShareIcon width={22} height={22} />
            </button>
          </div>
        </div>
      )}

      {/* Prices */}
      {isLoading ? (
        <div className='flex flex-col gap-1 mb-4'>
          <Skeleton height={22} width='60%' />
          <Skeleton height={16} width='50%' />
          <Skeleton height={12} width='80%' />
        </div>
      ) : priceCash === 0 ? (
        <div className='text-base text-black mb-4'>Цена по запросу</div>
      ) : (
        <div className='flex flex-col gap-1 mb-4'>
          <div className='text-base font-medium text-black'>
            *{formatCurrencyNumber(priceCash)}{sym} наличными
          </div>
          <div className='text-sm text-black'>
            *{formatCurrencyNumber(priceNonCash)}{sym} без наличный расчет
          </div>
          <div className='text-[10px] text-gray-500 mt-1 leading-relaxed'>
            *Цена указана в евро для ориентира. Оплата производится в рублях по обменному курсу на момент оплаты.
          </div>
        </div>
      )}

      {/* Chat button */}
      {!isLoading && showChatButton && (
        <button
          type='button'
          onClick={onChatClick}
          disabled={chatLoading}
          className='w-full bg-black text-white font-semibold py-3 rounded text-sm hover:bg-black/80 transition mb-2 disabled:opacity-60 flex items-center justify-center'
        >
          {chatLoading ? (
            <div className='w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin' />
          ) : (
            'Написать продавцу'
          )}
        </button>
      )}

      {/* Description accordion */}
      {!isLoading && (
        <Accordion title='Description' defaultOpen>
          <div className='whitespace-pre-line'>
            {product?.description || '—'}
          </div>
        </Accordion>
      )}

      {/* Details accordion */}
      {!isLoading && (
        <Accordion title='Details'>
          <div className='flex flex-col gap-1'>
            {product?.brand?.name && (
              <div>
                <span className='text-gray-500'>Бренд: </span>
                <Link
                  href={`${ROUTES.BRANDS}/${product.brand.id}`}
                  className='underline text-black'
                >
                  {product.brand.name}
                </Link>
              </div>
            )}
            {product?.category?.name && (
              <div>
                <span className='text-gray-500'>Категория: </span>
                {product.category.name}
              </div>
            )}
            {product?.isNew !== undefined && (
              <div>
                <span className='text-gray-500'>Состояние: </span>
                {product.isNew ? 'Новое' : 'Б/у'}
              </div>
            )}
            {sellerDisplayName && (
              <div>
                <span className='text-gray-500'>Продавец: </span>
                <Link
                  href={`${ROUTES.SALLER}/${product?.user.tgId}`}
                  className='underline text-black'
                >
                  {sellerDisplayName}
                </Link>
              </div>
            )}
            {product?.viewCount !== undefined && (
              <div>
                <span className='text-gray-500'>Просмотров: </span>
                {product.viewCount}
              </div>
            )}
          </div>
        </Accordion>
      )}

    </div>
  );
};
