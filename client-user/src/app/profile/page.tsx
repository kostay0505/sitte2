'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute/ProtectedRoute';
import {
  UserIcon,
  Heart,
  ClipboardList,
  PlusSquare,
  Briefcase,
  FileText,
  Pencil,
  ChevronDown,
  LayoutDashboard,
  MessageSquare,
  Settings,
  LogOut,
  Search,
} from 'lucide-react';
import { TgIcon2 } from '@/components/common/SvgIcon';
import { Switch } from '@/components/common/Switch/Switch';
import { ROUTES } from '@/config/routes';
import { motion, AnimatePresence } from 'framer-motion';
import { initData, useSignal } from '@tma.js/sdk-react';
import { Skeleton } from '@/components/common/Skeleton/Skeleton';
import { ImageWithSkeleton } from '@/components/common/ImageWithSkeleton/ImageWithSkeleton';
import { cn } from '@/utils/cn';

import { useUserData, useEditUser } from '@/features/users/hooks';
import { useMyProducts, useDeleteProduct } from '@/features/products/hooks';
import { toImageSrc } from '@/utils/toImageSrc';
import { Link } from '@/components/Link/Link';
import { UserDataResponse } from '@/api/user/types';
import { TgConfirmModal } from '@/components/Auth/TgConfirmModal';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { clearTokens } from '@/api/auth/tokenStorage';
import { isTMA } from '@tma.js/bridge';
import { useQueryClient } from '@tanstack/react-query';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { toast } from 'sonner';
import { formatPrice } from '@/utils/currency';
import type { ProductBasic, StatusType } from '@/api/products/types';

export default function ProfilePage() {
  const { data: me, status } = useUserData();
  const isLoading = status === 'pending';

  const initDataUser = useSignal(initData.user);

  const displayName = useMemo(() => {
    if (me) {
      const byName = [me.firstName, me.lastName].filter(Boolean).join(' ');
      return byName || me.username || 'Пользователь';
    }
    return initDataUser?.first_name || initDataUser?.username || 'Пользователь';
  }, [me, initDataUser?.first_name, initDataUser?.username]);

  const displayHandle = useMemo(() => {
    if (me?.username) return `@${me.username}`;
    if (initDataUser?.username) return `@${initDataUser.username}`;
    return '@username';
  }, [me?.username, initDataUser?.username]);

  const avatarSrc = useMemo(() => {
    return toImageSrc(me?.photoUrl ?? initDataUser?.photo_url ?? null);
  }, [me?.photoUrl, initDataUser?.photo_url]);

  const [subscribed, setSubscribed] = useState<boolean>(!!me?.subscribedToNewsletter);
  useEffect(() => {
    if (typeof me?.subscribedToNewsletter === 'boolean') {
      setSubscribed(me.subscribedToNewsletter);
    }
  }, [me?.subscribedToNewsletter]);

  const edit = useEditUser();

  const onToggleSubscribed = (next: boolean) => {
    setSubscribed(next);
    edit.mutate(
      {
        firstName: me?.firstName ?? '',
        lastName: me?.lastName ?? null,
        email: me?.email ?? null,
        phone: me?.phone ?? null,
        cityId: me?.city?.id ?? null,
        subscribedToNewsletter: next,
      },
      { onError: () => setSubscribed(!next) },
    );
  };

  return (
    <ProtectedRoute>
      <Page back={true}>
        {/* Desktop layout */}
        <div className='hidden md:flex md:min-h-screen md:text-black md:pt-[100px]'>
          <DesktopLayout
            me={me}
            isLoading={isLoading}
            displayName={displayName}
            displayHandle={displayHandle}
            avatarSrc={avatarSrc}
            subscribed={subscribed}
            onToggleSubscribed={onToggleSubscribed}
            editPending={edit.isPending}
          />
        </div>

        {/* Mobile layout */}
        <div className='md:hidden'>
          <Layout className='p-2 pt-4 space-y-5 text-black'>
            <div className='flex items-center justify-between gap-4 bg-[#F5F5FA] p-4 rounded-xl'>
              <div className='flex items-center gap-4'>
                <div className='w-16 h-16 border rounded-lg flex items-center justify-center overflow-hidden'>
                  {isLoading ? (
                    <Skeleton width={'100%'} height={'100%'} />
                  ) : avatarSrc ? (
                    <ImageWithSkeleton
                      src={avatarSrc}
                      containerClassName='w-16 h-16'
                      className='!rounded-none object-cover'
                      alt='avatar'
                      isLoading={isLoading}
                    />
                  ) : (
                    <UserIcon className='w-10 h-10 text-gray-500' />
                  )}
                </div>
                <div className='space-y-1'>
                  {isLoading ? (
                    <>
                      <Skeleton height={28} />
                      <Skeleton height={24} />
                    </>
                  ) : (
                    <>
                      <div className='font-medium text-lg'>{displayName}</div>
                      <div className='text-gray-500'>{displayHandle}</div>
                    </>
                  )}
                </div>
              </div>
              {!isTMA() && <LogoutButton />}
            </div>

            <MobileMenu user={me} />

            <div className='flex items-center justify-between border-t pt-4 mt-4'>
              <span className='text-sm font-medium'>Получать рассылку</span>
              <Switch
                checked={subscribed}
                onCheckedChange={onToggleSubscribed}
                disabled={isLoading || edit.isPending}
              />
            </div>
          </Layout>
        </div>
      </Page>
    </ProtectedRoute>
  );
}

// ─────────────────────────────────────────────
// Desktop layout: sidebar + main content
// ─────────────────────────────────────────────

function DesktopLayout({
  me,
  isLoading,
  displayName,
  displayHandle,
  avatarSrc,
  subscribed,
  onToggleSubscribed,
  editPending,
}: {
  me: UserDataResponse | undefined;
  isLoading: boolean;
  displayName: string;
  displayHandle: string;
  avatarSrc: string | null;
  subscribed: boolean;
  onToggleSubscribed: (v: boolean) => void;
  editPending: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const setAuthorized = useAuthStore(s => s.setAuthorized);
  const queryClient = useQueryClient();
  const [tgConfirmOpen, setTgConfirmOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);

  const handleLogout = () => {
    setAuthorized(false);
    clearTokens();
    queryClient.clear();
    router.replace(ROUTES.HOME);
  };

  const navItems = [
    {
      icon: <LayoutDashboard className='w-4 h-4' />,
      label: 'Витрина',
      href: ROUTES.PROFILE,
    },
    {
      icon: <MessageSquare className='w-4 h-4' />,
      label: 'Сообщения',
      href: '/chats',
    },
    {
      icon: <FileText className='w-4 h-4' />,
      label: 'Личная инфо',
      href: `${ROUTES.PROFILE}/info`,
    },
    {
      icon: <PlusSquare className='w-4 h-4' />,
      label: 'Создать',
      href: ROUTES.CREATE_ADVERTISEMENT,
    },
  ];

  const bottomItems = [
    {
      icon: <Heart className='w-4 h-4' />,
      label: 'Избранное',
      href: ROUTES.FAVORITES,
    },
  ];

  return (
    <div className='flex w-full'>
      {/* Sidebar */}
      <aside className='w-44 flex-shrink-0 p-3 pt-4'>
        <div className='bg-white rounded-2xl shadow-sm p-3 space-y-0.5'>
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition',
                pathname === item.href
                  ? 'bg-gray-900 text-white font-semibold'
                  : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}

          {/* Работа accordion */}
          <button
            onClick={() => setJobOpen(p => !p)}
            className='w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition'
          >
            <span className='flex items-center gap-2.5'>
              <Briefcase className='w-4 h-4' />
              Работа
            </span>
            <ChevronDown
              className={cn(
                'w-3 h-3 text-gray-400 transition-transform flex-shrink-0',
                jobOpen && 'rotate-180',
              )}
            />
          </button>

          <AnimatePresence>
            {jobOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className='overflow-hidden'
              >
                <div className='pl-2 space-y-0.5'>
                  {[
                    { label: 'Мои вакансии', href: ROUTES.MY_VACANCY },
                    { label: 'Создать вакансию', href: ROUTES.CREATE_VACANCY },
                    { label: 'Мои резюме', href: ROUTES.MY_RESUME },
                    { label: 'Создать резюме', href: ROUTES.CREATE_RESUME },
                  ].map(sub => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className='flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition'
                    >
                      <Pencil className='w-3 h-3' />
                      {sub.label}
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Separator */}
          <div className='h-px bg-gray-100 my-1' />

          {bottomItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className='flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition'
            >
              {item.icon}
              {item.label}
            </Link>
          ))}

          {!me?.username && (
            <button
              onClick={() => setTgConfirmOpen(true)}
              className='w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition'
            >
              <TgIcon2 className='w-4 h-4' />
              Привязать ТГ
            </button>
          )}

          <div className='h-px bg-gray-100 my-1' />

          {!isTMA() && (
            <button
              onClick={handleLogout}
              className='w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition'
            >
              <LogOut className='w-4 h-4' />
              Выйти
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className='flex-1 flex flex-col min-w-0 p-4 pt-4'>
        <Vitrine subscribed={subscribed} onToggleSubscribed={onToggleSubscribed} editPending={editPending} />
      </main>

      <TgConfirmModal
        open={tgConfirmOpen}
        onClose={() => setTgConfirmOpen(false)}
        value={me?.url ?? ''}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Витрина объявлений
// ─────────────────────────────────────────────

function Vitrine({
  subscribed,
  onToggleSubscribed,
  editPending,
}: {
  subscribed: boolean;
  onToggleSubscribed: (v: boolean) => void;
  editPending: boolean;
}) {
  const { data: products, status: productsStatus } = useMyProducts();
  const del = useDeleteProduct();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusType | 'all'>('all');

  const isProductsLoading = productsStatus === 'pending';
  const allItems = products ?? [];

  const filtered = useMemo(() => {
    return allItems.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allItems, search, statusFilter]);

  const handleDelete = (id: string) => {
    if (!id || !confirm('Удалить объявление?')) return;
    del.mutate(id, {
      onSuccess: () => toast.success('Объявление удалено'),
      onError: (e: any) => toast.error(e?.message ?? 'Не удалось удалить'),
    });
  };

  const handlePosting = (product: ProductBasic) => {
    const message = `${product.name}\n\n${product.description}\n\n${formatPrice(product.priceCash, product.currency)}\n\n${product.url}`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(product.url || '')}&text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const statusLabels: Record<StatusType | 'all', string> = {
    all: 'Все',
    approved: 'Активные',
    moderation: 'На модерации',
    rejected: 'Отклонённые',
  };

  return (
    <>
      {/* Search bar */}
      <div className='flex items-center gap-3 mb-4'>
        <div className='relative flex-1 max-w-lg mx-auto'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
          <input
            type='text'
            placeholder='Search'
            value={search}
            onChange={e => setSearch(e.target.value)}
            className='w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-full bg-white outline-none focus:border-gray-400 transition shadow-sm'
          />
        </div>
      </div>

      {/* Status filters */}
      <div className='flex items-center gap-2 mb-4'>
        {(Object.keys(statusLabels) as (StatusType | 'all')[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1 text-xs rounded-full border transition',
              statusFilter === s
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400',
            )}
          >
            {statusLabels[s]}
          </button>
        ))}

        <div className='ml-auto flex items-center gap-2 text-xs text-gray-500'>
          <span>Рассылка</span>
          <Switch
            checked={subscribed}
            onCheckedChange={onToggleSubscribed}
            disabled={editPending}
          />
        </div>
      </div>

      {/* Grid */}
      {isProductsLoading && (
        <div className='grid grid-cols-4 gap-4'>
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCard key={i} isLoading />
          ))}
        </div>
      )}

      {!isProductsLoading && filtered.length === 0 && (
        <div className='flex flex-col items-center justify-center py-24 text-gray-400'>
          <div className='text-4xl mb-3'>📦</div>
          <div>{allItems.length === 0 ? 'Объявлений пока нет' : 'Ничего не найдено'}</div>
        </div>
      )}

      {!isProductsLoading && filtered.length > 0 && (
        <div className='grid grid-cols-4 gap-4'>
          {filtered.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              hideFavorite
              showDelete
              onDelete={handleDelete}
              showPosting
              onPosting={handlePosting}
              href={`${ROUTES.EDIT_ADVERTISEMENT}/${product.id}`}
              showStatus
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Mobile menu (unchanged)
// ─────────────────────────────────────────────

function MobileMenu({ user }: { user: UserDataResponse | undefined }) {
  const [jobOpen, setJobOpen] = useState(false);
  const [tgConfirmOpen, setTgConfirmOpen] = useState(false);
  return (
    <div className='space-y-2'>
      <ProfileItem
        icon={<ClipboardList className='w-5 h-5' />}
        label='Личная информация'
        href={`${ROUTES.PROFILE}/info`}
      />
      <ProfileItem
        icon={<Heart className='w-5 h-5 fill-black' />}
        label='Избранное'
        href={ROUTES.FAVORITES}
      />
      <ProfileItem
        icon={<ClipboardList className='w-5 h-5' />}
        label='Мои объявления'
        href={ROUTES.MY_ADVERTISEMENTS}
      />
      <ProfileItem
        icon={<PlusSquare className='w-5 h-5' />}
        label='Создать объявление'
        href={ROUTES.CREATE_ADVERTISEMENT}
      />

      <ProfileItem
        icon={<Briefcase className='w-5 h-5' />}
        label='Работа'
        onClick={() => setJobOpen(prev => !prev)}
        rightIcon={
          <motion.div
            animate={{ rotate: jobOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className='w-4 h-4 text-gray-500' />
          </motion.div>
        }
      />

      <AnimatePresence>
        {jobOpen && (
          <motion.div
            key='job-section'
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className='overflow-hidden'
          >
            <div className='relative bg-white rounded-xl grid grid-cols-2 gap-4'>
              <div className='absolute top-0 bottom-0 left-1/2 w-px bg-gray-200 z-0' />
              <div className='z-10 flex flex-col gap-4 p-4'>
                <SubItem icon={<FileText className='w-5 h-5' />} label='Мои вакансии' href={ROUTES.MY_VACANCY} />
                <SubItem icon={<Pencil className='w-5 h-5' />} label='Создать вакансию' href={ROUTES.CREATE_VACANCY} />
              </div>
              <div className='z-10 flex flex-col gap-4 p-4'>
                <SubItem icon={<FileText className='w-5 h-5' />} label='Мои резюме' href={ROUTES.MY_RESUME} />
                <SubItem icon={<Pencil className='w-5 h-5' />} label='Создать резюме' href={ROUTES.CREATE_RESUME} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!user?.username && (
        <ProfileItem
          icon={<TgIcon2 className='w-5 h-5' />}
          label='Привязать телеграм'
          onClick={() => setTgConfirmOpen(true)}
        />
      )}

      <TgConfirmModal
        open={tgConfirmOpen}
        onClose={() => setTgConfirmOpen(false)}
        value={user?.url ?? ''}
      />
    </div>
  );
}

function ProfileItem({
  icon, label, onClick, href, rightIcon, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  rightIcon?: React.ReactNode;
  disabled?: boolean;
}) {
  return href ? (
    <Link
      href={disabled ? '' : href}
      onClick={onClick}
      className='w-full bg-white rounded-xl p-2 flex items-center justify-between text-left text-base'
    >
      <div className='flex items-center gap-3'>
        <span className='text-gray-800'>{icon}</span>
        <span>{label}</span>
      </div>
      {rightIcon}
    </Link>
  ) : (
    <button
      onClick={onClick}
      className='w-full bg-white rounded-xl p-2 flex items-center justify-between text-left text-base cursor-pointer'
    >
      <div className='flex items-center gap-3'>
        <span className='text-gray-800'>{icon}</span>
        <span>{label}</span>
      </div>
      {rightIcon}
    </button>
  );
}

function SubItem({
  icon, label, href, onClick, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Link
      href={disabled ? '' : href}
      onClick={onClick}
      className='flex flex-col items-start justify-center gap-1 text-sm text-black'
    >
      <div className='flex items-center gap-2'>
        {icon}
        <span className='text-left'>{label}</span>
      </div>
    </Link>
  );
}

function LogoutButton() {
  const router = useRouter();
  const setAuthorized = useAuthStore(s => s.setAuthorized);
  const queryClient = useQueryClient();

  const handleLogout = () => {
    setAuthorized(false);
    clearTokens();
    queryClient.clear();
    router.replace(ROUTES.HOME);
  };

  return (
    <button
      onClick={handleLogout}
      className='flex items-center gap-2 px-3 py-2 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors cursor-pointer'
    >
      <span className='text-sm font-medium'>Выйти</span>
    </button>
  );
}
