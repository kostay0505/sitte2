'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Camera, MessageSquare, MoreHorizontal, UserPlus, X } from 'lucide-react';

import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { Skeleton } from '@/components/common/Skeleton/Skeleton';
import { cn } from '@/utils/cn';

import { useSeller, useUserData } from '@/features/users/hooks';
import { useInfiniteProductsFlat } from '@/features/products/hooks';
import { useCategoryFilterOptions } from '@/features/category/hooks';
import { useAuthStore } from '@/stores/authStore';
import { useWindowResize } from '@/hooks/useWindowResize';

import { ROUTES } from '@/config/routes';
import { toImageSrc } from '@/utils/toImageSrc';
import { uploadFile } from '@/api/files/methods';
import { updateBannerUrl } from '@/api/user/methods';
import { BusinessPageView } from '@/components/business/BusinessPageView';
import { Footer } from '@/components/Footer';

const DESKTOP_HEADER_HEIGHT = 149;

function SellerScrollContainer({ children }: { children: React.ReactNode }) {
  const { width } = useWindowResize();
  const isMobile = width > 0 && width < 768;
  const paddingTop = isMobile ? 0 : DESKTOP_HEADER_HEIGHT;
  return (
    <div className='relative h-full flex flex-col' style={{ paddingTop }}>
      <div className='flex-1 overflow-y-auto scrollbar-hide'>
        {children}
      </div>
    </div>
  );
}

/* ─── Banner upload modal ─────────────────────────────────────────────── */
interface BannerModalProps {
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
  saving: boolean;
}
function BannerModal({ onClose, onSave, saving }: BannerModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'
      onClick={onClose}
    >
      <div
        className='bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl'
        onClick={e => e.stopPropagation()}
      >
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-lg font-semibold text-black'>Изменить баннер</h3>
          <button onClick={onClose} className='text-gray-400 hover:text-black transition'>
            <X className='w-5 h-5' />
          </button>
        </div>

        <div className='bg-gray-50 rounded-xl p-4 mb-4 text-sm text-gray-600 space-y-1'>
          <p className='font-medium text-gray-800'>Требования к изображению:</p>
          <p>• Форматы: JPG, PNG, WebP</p>
          <p>• Рекомендуемый размер: <strong>1920 × 400 px</strong></p>
          <p>• Максимальный размер файла: <strong>5 МБ</strong></p>
          <p>• Горизонтальная ориентация</p>
        </div>

        {preview && (
          <div className='mb-4 rounded-xl overflow-hidden h-28 bg-gray-100'>
            <img src={preview} alt='preview' className='w-full h-full object-cover' />
          </div>
        )}

        <button
          type='button'
          onClick={() => inputRef.current?.click()}
          className='w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition mb-4'
        >
          {file ? `✓ ${file.name}` : 'Нажмите чтобы выбрать файл'}
        </button>
        <input
          ref={inputRef}
          type='file'
          accept='image/jpeg,image/png,image/webp'
          className='hidden'
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        <button
          disabled={!file || saving}
          onClick={() => file && onSave(file)}
          className={cn(
            'w-full py-3 rounded-xl text-sm font-semibold transition',
            file && !saving
              ? 'bg-black text-white hover:bg-gray-800'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed',
          )}
        >
          {saving ? 'Загрузка...' : 'Добавить'}
        </button>
      </div>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────── */
export default function SellerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const isAuthorized = useAuthStore(s => s.isAuthorized);
  const { data: userData } = useUserData({ enabled: isAuthorized });

  const { data: seller, status: sellerStatus, refetch: refetchSeller } = useSeller(id);
  const sellerLoading = sellerStatus === 'pending';

  const isOwner = isAuthorized && !!userData && !!seller && userData.tgId === seller.tgId;
  const isBusinessUser = seller?.role === 'shop' || seller?.role === 'admin';

  const sellerName = useMemo(() => {
    if (!seller) return '';
    return (
      seller.username ||
      [seller.firstName, seller.lastName].filter(Boolean).join(' ') ||
      'Продавец'
    );
  }, [seller]);

  const locationBadge = useMemo(() => {
    if (!seller?.city) return null;
    const parts = [seller.city.name, seller.city.country?.name].filter(Boolean);
    return parts.join(', ') || null;
  }, [seller]);

  /* ── Banner ── */
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [localBannerUrl, setLocalBannerUrl] = useState<string | null | undefined>(undefined);
  const effectiveBannerUrl = localBannerUrl !== undefined ? localBannerUrl : (seller?.bannerUrl ?? null);

  const handleBannerSave = async (file: File) => {
    setBannerSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { filename } = await uploadFile(fd);
      await updateBannerUrl(filename);
      setLocalBannerUrl(filename);
      setBannerModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setBannerSaving(false);
    }
  };

  /* ── Category tabs ── */
  const { categoryOptions, all: allCategories } = useCategoryFilterOptions();
  const [activeCatId, setActiveCatId] = useState<string | null>(null);

  /* ── Products ── */
  const query = useMemo(
    () => ({ sellerId: seller?.tgId ?? id, categoryId: activeCatId ?? undefined, limit: 24 }),
    [seller?.tgId, id, activeCatId],
  );
  const infinite = useInfiniteProductsFlat(query);
  const items = infinite.items;

  /* ── Category tabs — derived from already-loaded items ── */
  const availableCategoryIds = useMemo(() => {
    const childToParent = new Map<string, string>();
    for (const cat of allCategories) {
      if (cat.parentId) childToParent.set(cat.id, cat.parentId);
    }
    const ids = new Set<string>();
    items.forEach(p => {
      const catId = p.category?.id ?? p.categoryId;
      if (!catId) return;
      let cur: string | undefined = catId;
      while (cur) {
        ids.add(cur);
        cur = childToParent.get(cur);
      }
    });
    return ids;
  }, [items, allCategories]);
  const visibleCategories = useMemo(
    () => categoryOptions.filter(cat => availableCategoryIds.has(cat.value)),
    [categoryOptions, availableCategoryIds],
  );
  const isLoading = infinite.status === 'pending';

  /* ── Search ── */
  const [searchInput, setSearchInput] = useState('');
  const filteredItems = useMemo(() => {
    if (!searchInput.trim()) return items;
    const q = searchInput.toLowerCase();
    return items.filter(
      p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
    );
  }, [items, searchInput]);

  if (!sellerLoading && !seller) {
    return <div className='p-8 text-center text-black'>Продавец не найден</div>;
  }

  if (seller && isBusinessUser) {
    return (
      <Page back={true}>
        <SellerScrollContainer>
          <Layout className='pb-10'>
            <BusinessPageView userId={seller.tgId} seller={seller} />
          </Layout>
          <Footer />
        </SellerScrollContainer>
      </Page>
    );
  }

  const showBanner = isOwner || !!effectiveBannerUrl;

  return (
    <Page back={true}>
      <SellerScrollContainer>

        {/* ── Banner ─────────────────────────────────────────── */}
        {showBanner && (
          <div className='relative w-full h-[140px] md:h-[220px] bg-gray-200 overflow-hidden'>
            {effectiveBannerUrl && (
              <img
                src={toImageSrc(effectiveBannerUrl)}
                alt='Banner'
                className='w-full h-full object-cover'
              />
            )}
            {isOwner && (
              <button
                onClick={() => setBannerModalOpen(true)}
                className='absolute bottom-3 right-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm text-black text-xs font-medium px-3 py-1.5 rounded-lg shadow hover:bg-white transition'
              >
                <Camera className='w-3.5 h-3.5' />
                Изменить
              </button>
            )}
          </div>
        )}

        {/* ── Info block ─────────────────────────────────────── */}
        <div className='max-w-[1280px] mx-auto w-full px-4 md:px-6'>
          <div className='flex items-start gap-4 py-5'>
            {/* Avatar */}
            <div className='shrink-0'>
              {sellerLoading ? (
                <Skeleton width={72} height={72} className='rounded-full' />
              ) : (
                <div className='w-[72px] h-[72px] rounded-full overflow-hidden bg-gray-200 border border-gray-100'>
                  {seller?.photoUrl ? (
                    <img
                      src={toImageSrc(seller.photoUrl)}
                      alt={sellerName}
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center text-2xl font-bold text-gray-400'>
                      {sellerName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Name + details */}
            <div className='flex-1 min-w-0'>
              {sellerLoading ? (
                <div className='flex flex-col gap-2'>
                  <Skeleton height={24} width={200} />
                  <Skeleton height={16} width={140} />
                  <Skeleton height={14} width={160} />
                </div>
              ) : (
                <>
                  <h1 className='text-xl md:text-2xl font-bold text-black leading-tight truncate'>
                    {sellerName}
                  </h1>
                  {locationBadge && (
                    <p className='text-sm text-gray-500 mt-0.5'>{locationBadge}</p>
                  )}
                  <div className='flex flex-col gap-0.5 mt-2'>
                    {seller?.phone && (
                      <a href={`tel:${seller.phone}`} className='text-sm text-gray-700 hover:text-black transition'>
                        Tel: {seller.phone}
                      </a>
                    )}
                    {seller?.email && (
                      <a href={`mailto:${seller.email}`} className='text-sm text-gray-700 hover:text-black transition'>
                        e-mail: {seller.email}
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            {!sellerLoading && (
              <div className='flex flex-col items-end gap-3 shrink-0'>
                <div className='flex items-center gap-2'>
                  <button
                    disabled
                    className='hidden md:flex items-center gap-1.5 text-sm font-medium border border-gray-300 text-gray-500 px-4 py-2 rounded-full cursor-not-allowed opacity-60'
                  >
                    <UserPlus className='w-4 h-4' />
                    Follow
                  </button>

                  {isAuthorized && !isOwner && (
                    <button
                      onClick={() => router.push(`${ROUTES.CHATS}/${seller?.tgId}`)}
                      className='flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 text-gray-600 hover:text-black hover:border-gray-500 transition'
                      title='Написать продавцу'
                    >
                      <MessageSquare className='w-4 h-4' />
                    </button>
                  )}

                  <button
                    className='flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 text-gray-600 hover:text-black hover:border-gray-500 transition'
                    title='Ещё'
                  >
                    <MoreHorizontal className='w-4 h-4' />
                  </button>
                </div>

                <div className='hidden md:flex items-center border border-gray-300 rounded-full overflow-hidden bg-white hover:border-gray-400 transition'>
                  <input
                    type='text'
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder='Search'
                    className='px-4 py-1.5 text-sm text-black outline-none w-52'
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Category tabs ────────────────────────────────── */}
          <div className='flex gap-0 overflow-x-auto scrollbar-hide border-b border-gray-100'>
            <button
              onClick={() => setActiveCatId(null)}
              className={cn(
                'shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap',
                activeCatId === null
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              Все товары
            </button>
            {visibleCategories.map(cat => (
              <button
                key={cat.value}
                onClick={() => setActiveCatId(cat.value)}
                className={cn(
                  'shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap',
                  activeCatId === cat.value
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* ── Product grid ────────────────────────────────── */}
          <div className='py-6'>
            {!isLoading && filteredItems.length === 0 && (
              <p className='text-center text-gray-400 py-12'>Товаров пока нет</p>
            )}
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'>
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <ProductCard key={`sk-${i}`} isLoading />
                  ))
                : filteredItems.map(p => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      href={`${ROUTES.CATALOG}/${p.id}`}
                    />
                  ))}
            </div>

            {infinite.hasNextPage && (
              <div className='flex justify-center pt-6'>
                <button
                  className='px-6 py-2.5 bg-black text-white rounded-full text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition'
                  onClick={() => infinite.fetchNextPage()}
                  disabled={infinite.isFetchingNextPage}
                >
                  {infinite.isFetchingNextPage ? 'Загрузка...' : 'Показать ещё'}
                </button>
              </div>
            )}
          </div>
        </div>

        <Footer />
      </SellerScrollContainer>

      {bannerModalOpen && (
        <BannerModal
          onClose={() => setBannerModalOpen(false)}
          onSave={handleBannerSave}
          saving={bannerSaving}
        />
      )}
    </Page>
  );
}
