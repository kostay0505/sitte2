'use client';

import { useEffect, useMemo, useState } from 'react';
import { Page } from '@/components/Page';
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
  Store,
  ArrowLeft,
} from 'lucide-react';
import { BusinessPageEditor } from '@/components/business/BusinessPageEditor';
import { BusinessPagePanel } from '@/components/business/BusinessPagePanel';
import { TgIcon2 } from '@/components/common/SvgIcon';
import { Switch } from '@/components/common/Switch/Switch';
import { ROUTES } from '@/config/routes';
import { motion, AnimatePresence } from 'framer-motion';
import { initData, useSignal } from '@tma.js/sdk-react';
import { Skeleton } from '@/components/common/Skeleton/Skeleton';
import { ImageWithSkeleton } from '@/components/common/ImageWithSkeleton/ImageWithSkeleton';
import { cn } from '@/utils/cn';

import { useUserData, useEditUser } from '@/features/users/hooks';
import {
  useMyProducts,
  useDeleteProduct,
  useInfiniteProductsFlat,
  useCreateProduct,
  useProduct,
  useUpdateProduct,
} from '@/features/products/hooks';
import { toImageSrc } from '@/utils/toImageSrc';
import { Link } from '@/components/Link/Link';
import { UserDataResponse } from '@/api/user/types';
import { TgConfirmModal } from '@/components/Auth/TgConfirmModal';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { clearTokens } from '@/api/auth/tokenStorage';
import { isTMA } from '@tma.js/bridge';
import { useQueryClient } from '@tanstack/react-query';
import { ProductCard } from '@/components/Catalog/ProductCard';
import { toast } from 'sonner';
import { formatPrice } from '@/utils/currency';
import type { ProductBasic, StatusType, CreateProductRequest, UpdateProductRequest } from '@/api/products/types';
import { PersonalInfoPanel } from './PersonalInfoPanel';
import { useChatList } from '@/hooks/useChatList';
import { ChatList } from '@/components/chat/ChatList';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { extractTgIdFromToken } from '@/utils/tokenUtils';
import { getTokens } from '@/api/auth/tokenStorage';
import { useChat } from '@/hooks/useChat';
import type { Chat } from '@/api/chat/methods';
import { uploadFile } from '@/api/files/methods';
import { resolveCategoryId } from '@/utils/category';
import {
  AdvertisementForm,
  type AdvertisementFormValues,
} from '@/components/Advertisements/AdvertisementForm';

type Panel =
  | 'vitrine'
  | 'messages'
  | 'info'
  | 'favorites'
  | 'business'
  | 'create'
  | 'edit'
  | 'vacancy-my'
  | 'vacancy-create'
  | 'resume-my'
  | 'resume-create';

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

  const avatarSrc = useMemo(
    () => toImageSrc(me?.photoUrl ?? initDataUser?.photo_url ?? null),
    [me?.photoUrl, initDataUser?.photo_url],
  );

  const [subscribed, setSubscribed] = useState<boolean>(!!me?.subscribedToNewsletter);
  useEffect(() => {
    if (typeof me?.subscribedToNewsletter === 'boolean') setSubscribed(me.subscribedToNewsletter);
  }, [me?.subscribedToNewsletter]);

  const edit = useEditUser();
  const onToggleSubscribed = (next: boolean) => {
    setSubscribed(next);
    edit.mutate(
      { firstName: me?.firstName ?? '', lastName: me?.lastName ?? null, email: me?.email ?? null, phone: me?.phone ?? null, cityId: me?.city?.id ?? null, subscribedToNewsletter: next },
      { onError: () => setSubscribed(!next) },
    );
  };

  return (
    <ProtectedRoute>
      <Page back={true}>
        {/* Desktop */}
        <div className='hidden md:flex md:min-h-screen md:pt-[149px] md:text-black'>
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

        {/* Mobile */}
        <div className='md:hidden'>
          <MobileProfileLayout
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
      </Page>
    </ProtectedRoute>
  );
}

// ─────────────────────────────────────────────
// Mobile layout
// ─────────────────────────────────────────────

function MobileProfileLayout({
  me, isLoading, displayName, displayHandle, avatarSrc, subscribed, onToggleSubscribed, editPending,
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
  const [activePanel, setActivePanel] = useState<Panel>('vitrine');
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const isBusinessUser = me?.role === 'shop' || me?.role === 'admin';

  const tabs = [
    { id: 'vitrine' as Panel,   icon: <LayoutDashboard className='w-3.5 h-3.5' />, label: 'Витрина' },
    { id: 'info' as Panel,      icon: <FileText className='w-3.5 h-3.5' />,        label: 'Инфо' },
    { id: 'favorites' as Panel, icon: <Heart className='w-3.5 h-3.5' />,           label: 'Избранное' },
    { id: 'create' as Panel,    icon: <PlusSquare className='w-3.5 h-3.5' />,      label: 'Создать' },
    { id: 'messages' as Panel,  icon: <MessageSquare className='w-3.5 h-3.5' />,   label: 'Сообщения' },
    ...(isBusinessUser ? [{ id: 'business' as Panel, icon: <Store className='w-3.5 h-3.5' />, label: 'Бизнес' }] : []),
  ];

  return (
    <div className='text-black pt-[84px]'>
      {/* User card */}
      <div className='flex items-center gap-3 px-4 py-3 border-b border-gray-100'>
        <div className='w-12 h-12 border rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0'>
          {isLoading ? <Skeleton width='100%' height='100%' /> : avatarSrc ? (
            <ImageWithSkeleton src={avatarSrc} containerClassName='w-12 h-12' className='!rounded-none object-cover' alt='avatar' isLoading={isLoading} />
          ) : <UserIcon className='w-7 h-7 text-gray-500' />}
        </div>
        <div className='flex-1 min-w-0'>
          {isLoading ? (<div className='space-y-1'><Skeleton height={18} /><Skeleton height={14} /></div>) : (
            <><div className='font-medium text-base truncate'>{displayName}</div><div className='text-gray-500 text-sm'>{displayHandle}</div></>
          )}
        </div>
        {!isTMA() && <LogoutButton />}
      </div>

      {/* Horizontal tab bar */}
      <div className='flex gap-2 overflow-x-auto scrollbar-hide px-4 py-3 border-b border-gray-100'>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition flex-shrink-0',
              activePanel === tab.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className='p-4'>
        {activePanel === 'vitrine' && (
          <VitrinePanel
            subscribed={subscribed}
            onToggleSubscribed={onToggleSubscribed}
            editPending={editPending}
            onEditProduct={(id) => { setEditProductId(id); setActivePanel('edit'); }}
          />
        )}
        {activePanel === 'info' && <PersonalInfoPanel />}
        {activePanel === 'favorites' && <FavoritesPanel />}
        {activePanel === 'create' && <CreateAdPanel onBack={() => setActivePanel('vitrine')} />}
        {activePanel === 'edit' && editProductId && (
          <EditAdPanel productId={editProductId} onBack={() => setActivePanel('vitrine')} />
        )}
        {activePanel === 'messages' && <MobileMessagesPanel />}
        {activePanel === 'business' && <BusinessPagePanel />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Desktop layout
// ─────────────────────────────────────────────

function DesktopLayout({
  me, isLoading, displayName, displayHandle, avatarSrc, subscribed, onToggleSubscribed, editPending,
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
  const [activePanel, setActivePanel] = useState<Panel>('vitrine');
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [tgConfirmOpen, setTgConfirmOpen] = useState(false);
  const isBusinessUser = me?.role === 'shop' || me?.role === 'admin';

  const router = useRouter();
  const setAuthorized = useAuthStore(s => s.setAuthorized);
  const queryClient = useQueryClient();

  const handleLogout = () => {
    setAuthorized(false);
    clearTokens();
    queryClient.clear();
    router.replace(ROUTES.HOME);
  };

  const navMain = [
    { id: 'vitrine' as Panel, icon: <LayoutDashboard className='w-5 h-5' />, label: 'Витрина' },
    { id: 'messages' as Panel, icon: <MessageSquare className='w-6 h-6' />, label: 'Сообщения' },
    { id: 'info' as Panel, icon: <FileText className='w-5 h-5' />, label: 'Личная инфо' },
    { id: 'favorites' as Panel, icon: <Heart className='w-6 h-6' />, label: 'Избранное' },
  ];

  const jobPanels: Panel[] = ['vacancy-my', 'vacancy-create', 'resume-my', 'resume-create'];
  const isJobPanel = jobPanels.includes(activePanel);

  return (
    <div className='flex w-full'>
      {/* Sidebar */}
      <aside className='w-44 flex-shrink-0 p-3 pt-4'>
        <div className='bg-white rounded-2xl shadow-sm p-3 space-y-0.5 overflow-hidden'>
          {/* Main nav */}
          {navMain.map(item => (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition text-left',
                activePanel === item.id
                  ? 'bg-gray-900 text-white font-semibold'
                  : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          {/* Создать — opens inline panel */}
          <button
            onClick={() => setActivePanel('create')}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition text-left',
              activePanel === 'create'
                ? 'bg-gray-900 text-white font-semibold'
                : 'text-gray-700 hover:bg-gray-100',
            )}
          >
            <PlusSquare className='w-5 h-5' />
            Создать
          </button>

          {/* Бизнес-страница — только для shop/admin */}
          {isBusinessUser && (
            <button
              onClick={() => setActivePanel('business')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition text-left',
                activePanel === 'business'
                  ? 'bg-gray-900 text-white font-semibold'
                  : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              <Store className='w-6 h-6' />
              Бизнес-страница
            </button>
          )}

          {/* Работа — временно скрыто (функция в разработке) */}
          {false && (
            <>
              <button
                onClick={() => setJobOpen(p => !p)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition',
                  isJobPanel ? 'bg-gray-900 text-white font-semibold' : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <span className='flex items-center gap-2.5'><Briefcase className='w-5 h-5' />Работа</span>
                <ChevronDown className={cn('w-3 h-3 flex-shrink-0 transition-transform', (jobOpen || isJobPanel) && 'rotate-180', isJobPanel ? 'text-white/70' : 'text-gray-400')} />
              </button>
              <AnimatePresence>
                {(jobOpen || isJobPanel) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className='overflow-hidden'>
                    <div className='pl-2 space-y-0.5'>
                      {([
                        { label: 'Мои вакансии', panel: 'vacancy-my' as Panel },
                        { label: 'Создать вакансию', panel: 'vacancy-create' as Panel },
                        { label: 'Мои резюме', panel: 'resume-my' as Panel },
                        { label: 'Создать резюме', panel: 'resume-create' as Panel },
                      ]).map(sub => (
                        <button
                          key={sub.panel}
                          onClick={() => setActivePanel(sub.panel)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition text-left',
                            activePanel === sub.panel
                              ? 'bg-gray-200 text-gray-900 font-medium'
                              : 'text-gray-600 hover:bg-gray-100',
                          )}
                        >
                          <Pencil className='w-3 h-3' />{sub.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <div className='h-px bg-gray-100 my-1' />

          {/* Настройки accordion */}
          <button
            onClick={() => setSettingsOpen(p => !p)}
            className='w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition'
          >
            <span className='flex items-center gap-2.5'><Settings className='w-5 h-5' />Настройки</span>
            <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform flex-shrink-0', settingsOpen && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {settingsOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className='overflow-hidden'>
                <div className='pl-2 space-y-0.5'>
                  <div className='flex items-center justify-between px-3 py-1.5 text-xs text-gray-600'>
                    <span>Рассылка</span>
                    <Switch checked={subscribed} onCheckedChange={onToggleSubscribed} disabled={editPending} />
                  </div>
                  {!me?.username && (
                    <button
                      onClick={() => setTgConfirmOpen(true)}
                      className='w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition'
                    >
                      <TgIcon2 className='w-3 h-3' />Привязать ТГ
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className='h-px bg-gray-100 my-1' />

          {!isTMA() && (
            <button
              onClick={handleLogout}
              className='w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition'
            >
              <LogOut className='w-5 h-5' />Выйти
            </button>
          )}
        </div>
      </aside>

      {/* Main panel */}
      <main className={cn(
        'flex-1 min-w-0 overflow-y-auto',
        activePanel === 'business' ? 'p-4' : 'p-6',
        activePanel === 'messages' && 'overflow-hidden p-4',
      )}>
        {activePanel === 'vitrine' && (
          <VitrinePanel
            subscribed={subscribed}
            onToggleSubscribed={onToggleSubscribed}
            editPending={editPending}
            onEditProduct={(id) => { setEditProductId(id); setActivePanel('edit'); }}
          />
        )}
        {activePanel === 'messages' && <MessagesPanel />}
        {activePanel === 'info' && <PersonalInfoPanel />}
        {activePanel === 'favorites' && <FavoritesPanel />}
        {activePanel === 'business' && <BusinessPagePanel />}
        {activePanel === 'create' && <CreateAdPanel onBack={() => setActivePanel('vitrine')} />}
        {activePanel === 'edit' && editProductId && (
          <EditAdPanel productId={editProductId} onBack={() => setActivePanel('vitrine')} />
        )}
        {isJobPanel && <PlaceholderPanel panel={activePanel} />}
      </main>

      <TgConfirmModal open={tgConfirmOpen} onClose={() => setTgConfirmOpen(false)} value={me?.url ?? ''} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Panel: Витрина
// ─────────────────────────────────────────────

function VitrinePanel({ subscribed, onToggleSubscribed, editPending, onEditProduct }: {
  subscribed: boolean;
  onToggleSubscribed: (v: boolean) => void;
  editPending: boolean;
  onEditProduct: (id: string) => void;
}) {
  const { data: products, status } = useMyProducts();
  const del = useDeleteProduct();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusType | 'all'>('all');

  const allItems = products ?? [];
  const filtered = useMemo(() =>
    allItems.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    }),
    [allItems, search, statusFilter],
  );

  const handleDelete = (id: string) => {
    if (!id || !confirm('Удалить объявление?')) return;
    del.mutate(id, {
      onSuccess: () => toast.success('Объявление удалено'),
      onError: (e: any) => toast.error(e?.message ?? 'Не удалось удалить'),
    });
  };

  const handlePosting = (product: ProductBasic) => {
    const message = `${product.name}\n\n${product.description}\n\n${formatPrice(product.priceCash, product.currency)}\n\n${product.url}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(product.url || '')}&text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const statusLabels: Record<StatusType | 'all', string> = {
    all: 'Все', approved: 'Активные', moderation: 'На модерации', rejected: 'Отклонённые',
  };

  return (
    <>
      {/* Search */}
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

      {/* Filters */}
      <div className='flex items-center gap-2 mb-4'>
        {(Object.keys(statusLabels) as (StatusType | 'all')[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1 text-xs rounded-full border transition',
              statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400',
            )}
          >
            {statusLabels[s]}
          </button>
        ))}
        <div className='ml-auto flex items-center gap-2 text-xs text-gray-500'>
          <span>Рассылка</span>
          <Switch checked={subscribed} onCheckedChange={onToggleSubscribed} disabled={editPending} />
        </div>
      </div>

      {/* Grid */}
      {status === 'pending' && (
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4'>
          {Array.from({ length: 8 }).map((_, i) => <ProductCard key={i} isLoading />)}
        </div>
      )}
      {status !== 'pending' && filtered.length === 0 && (
        <div className='flex flex-col items-center justify-center py-24 text-gray-400'>
          <div className='text-4xl mb-3'>📦</div>
          <div>{allItems.length === 0 ? 'Объявлений пока нет' : 'Ничего не найдено'}</div>
        </div>
      )}
      {status !== 'pending' && filtered.length > 0 && (
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4'>
          {filtered.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              hideFavorite
              showDelete
              onDelete={handleDelete}
              showPosting
              onPosting={handlePosting}
              onCardClick={() => onEditProduct(product.id)}
              showStatus
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Panel: Сообщения (split-view)
// ─────────────────────────────────────────────

function MessagesPanel() {
  const { chats, isLoading } = useChatList();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    const tokens = getTokens();
    if (tokens?.accessToken) {
      const tgId = extractTgIdFromToken(tokens.accessToken);
      if (tgId) setCurrentUserId(tgId);
    }
  }, []);

  const selectedChat = chats.find(c => c.id === selectedChatId) ?? null;

  return (
    <div className='flex gap-4' style={{ height: 'calc(100vh - 200px)', minHeight: 400 }}>
      {/* Left: chat list */}
      <div className='w-72 flex-shrink-0 bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden'>
        <div className='px-4 py-3 border-b border-gray-100'>
          <h2 className='text-base font-semibold'>Сообщения</h2>
        </div>
        <div className='flex-1 overflow-y-auto'>
          {isLoading ? (
            <div className='flex justify-center py-8'>
              <div className='w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin' />
            </div>
          ) : (
            <ChatList
              chats={chats}
              currentUserId={currentUserId}
              onSelect={setSelectedChatId}
              selectedChatId={selectedChatId}
            />
          )}
        </div>
      </div>

      {/* Right: chat view */}
      <div className='flex-1 min-w-0 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col'>
        {selectedChatId ? (
          <InlineChatView chatId={selectedChatId} currentUserId={currentUserId} chat={selectedChat} />
        ) : (
          <div className='flex flex-col items-center justify-center h-full text-gray-400'>
            <MessageSquare className='w-12 h-12 mb-3 opacity-20' />
            <p>Выберите чат слева</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InlineChatView({ chatId, currentUserId, chat }: {
  chatId: string;
  currentUserId: string;
  chat: Chat | null;
}) {
  const { messages, sendMessage, deleteMessage, isSending, hasMore, loadMore, isFetchingNextPage } = useChat(chatId);

  const isAdmin = !!chat?.isAdminChat;
  const isBuyer = chat?.buyerId === currentUserId;
  const otherName = isAdmin
    ? 'Touring Expert Support'
    : isBuyer
    ? chat?.sellerFirstName || chat?.sellerUsername || 'Продавец'
    : chat?.buyerFirstName || chat?.buyerUsername || 'Покупатель';
  const subtitle = isAdmin ? 'Служба поддержки' : chat?.productName || '';

  return (
    <div className='flex flex-col h-full'>
      <div className='px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0'>
        <div className='font-medium text-sm'>{otherName}</div>
        {subtitle && <div className='text-xs text-gray-400'>{subtitle}</div>}
      </div>
      <div className='flex-1 min-h-0'>
        <ChatWindow
          chat={chat}
          messages={messages}
          currentUserId={currentUserId}
          isSending={isSending}
          onSend={sendMessage}
          onDeleteMessage={deleteMessage}
          hasMore={hasMore}
          onLoadMore={loadMore}
          isFetchingMore={isFetchingNextPage}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Panel: Сообщения (mobile stacked view)
// ─────────────────────────────────────────────

function MobileMessagesPanel() {
  const { chats, isLoading } = useChatList();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    const tokens = getTokens();
    if (tokens?.accessToken) {
      const tgId = extractTgIdFromToken(tokens.accessToken);
      if (tgId) setCurrentUserId(tgId);
    }
  }, []);

  const selectedChat = chats.find(c => c.id === selectedChatId) ?? null;

  if (selectedChatId && selectedChat) {
    return (
      <div>
        <button
          onClick={() => setSelectedChatId(null)}
          className='flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-3 transition'
        >
          <ArrowLeft className='w-4 h-4' /> Назад к чатам
        </button>
        <div style={{ height: 'calc(100vh - 290px)', minHeight: 300 }}>
          <div className='bg-white rounded-2xl shadow-sm h-full flex flex-col overflow-hidden'>
            <InlineChatView chatId={selectedChatId} currentUserId={currentUserId} chat={selectedChat} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className='text-base font-semibold mb-3'>Сообщения</h2>
      {isLoading ? (
        <div className='flex justify-center py-8'>
          <div className='w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin' />
        </div>
      ) : chats.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-16 text-gray-400'>
          <MessageSquare className='w-10 h-10 mb-3 opacity-20' />
          <div className='text-sm'>Чатов пока нет</div>
        </div>
      ) : (
        <div className='bg-white rounded-2xl shadow-sm overflow-hidden'>
          <ChatList
            chats={chats}
            currentUserId={currentUserId}
            onSelect={setSelectedChatId}
            selectedChatId={selectedChatId}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Panel: Избранное
// ─────────────────────────────────────────────

function FavoritesPanel() {
  const { items, status } = useInfiniteProductsFlat({ isFavorite: true });

  return (
    <>
      <h2 className='text-lg font-semibold mb-4'>Избранное</h2>
      {status === 'pending' && (
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4'>
          {Array.from({ length: 8 }).map((_, i) => <ProductCard key={i} isLoading />)}
        </div>
      )}
      {status !== 'pending' && items.length === 0 && (
        <div className='flex flex-col items-center justify-center py-24 text-gray-400'>
          <Heart className='w-12 h-12 mb-3 opacity-30' />
          <div>Избранных товаров пока нет</div>
        </div>
      )}
      {status !== 'pending' && items.length > 0 && (
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4'>
          {items.map(product => (
            <ProductCard key={product.id} product={product} href={product.brandSlug && product.slug ? `/catalog/${product.brandSlug}/${product.slug}` : `${ROUTES.CATALOG}/${product.id}`} />
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Panel: Создать объявление
// ─────────────────────────────────────────────

function CreateAdPanel({ onBack }: { onBack: () => void }) {
  const create = useCreateProduct();

  const uploadSingle = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const { filename } = await uploadFile(fd);
    return filename;
  };

  const handleCreate = async (
    form: AdvertisementFormValues & { files: File[]; previewFile: File | null },
  ): Promise<boolean> => {
    try {
      if (!form.previewFile) { toast.error('Добавьте обложку (превью)'); return false; }
      const preview = await uploadSingle(form.previewFile);
      const uploaded = await Promise.all((form.files ?? []).map(uploadSingle));
      const body: CreateProductRequest = {
        name: form.title,
        description: form.description,
        priceCash: Number(form.priceCash) || 0,
        priceNonCash: Number(form.priceNonCash) || 0,
        currency: form.currency as any,
        categoryId: resolveCategoryId(form.categoryId, form.subcategoryId),
        brandId: form.brandId,
        quantity: Number(form.quantity) || 1,
        quantityType: form.unit === 'set' ? 'set' : 'piece',
        preview,
        files: uploaded,
      };
      await create.mutateAsync(body);
      toast.success('Объявление создано и отправлено на модерацию');
      onBack();
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? 'Не удалось создать объявление');
      return false;
    }
  };

  return (
    <div>
      <button
        onClick={onBack}
        className='flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition'
      >
        <ArrowLeft className='w-4 h-4' /> Назад к витрине
      </button>
      <h2 className='text-lg font-semibold mb-4'>Создать объявление</h2>
      <AdvertisementForm
        mode='create'
        onSubmit={handleCreate}
        submitLabel={create.isPending ? 'Создание…' : 'Создать'}
        loading={create.isPending}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Panel: Редактировать объявление
// ─────────────────────────────────────────────

function EditAdPanel({ productId, onBack }: { productId: string; onBack: () => void }) {
  const { data: product, status } = useProduct(productId);
  const update = useUpdateProduct();
  const isLoading = status === 'pending';

  const initialValues = useMemo<Partial<AdvertisementFormValues> | undefined>(() => {
    if (!product) return undefined;
    return {
      title: product.name,
      description: product.description,
      priceCash: Number(product.priceCash ?? 0),
      priceNonCash: Number(product.priceNonCash ?? 0),
      currency: String(product.currency),
      categoryId: product.category?.id ?? '',
      subcategoryId: '',
      brandId: product.brand?.id ?? '',
      quantity: product.quantity ?? 1,
      unit: product.quantityType ?? 'piece',
    };
  }, [product]);

  const initialPreviewUrl = useMemo(
    () => (product?.preview ? toImageSrc(product.preview) : null),
    [product?.preview],
  );

  const initialFileNames = useMemo(
    () => (Array.isArray(product?.files) ? (product!.files as string[]) : []),
    [product],
  );

  const uploadSingle = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const { filename } = await uploadFile(fd);
    return filename;
  };

  const handleEdit = async (
    form: AdvertisementFormValues & { files: File[]; previewFile: File | null; keepFileNames: string[] },
  ): Promise<boolean> => {
    if (!product || !productId) return false;
    try {
      const uploaded = await Promise.all((form.files ?? []).map(uploadSingle));
      const files = Array.from(new Set([...form.keepFileNames, ...uploaded]));
      const preview = form.previewFile ? await uploadSingle(form.previewFile) : product.preview;
      if (!preview) { toast.error('Добавьте обложку (превью)'); return false; }
      const body: UpdateProductRequest = {
        name: form.title,
        description: form.description,
        priceCash: Number(form.priceCash) || 0,
        priceNonCash:
          typeof form.priceNonCash === 'number'
            ? form.priceNonCash
            : Number(form.priceNonCash ?? 0) || 0,
        currency: form.currency as any,
        categoryId: resolveCategoryId(form.categoryId || product.category?.id, form.subcategoryId),
        brandId: form.brandId || product.brand?.id || '',
        preview,
        files,
        quantity: Number(form.quantity) || 1,
        quantityType: form.unit === 'set' ? 'set' : 'piece',
      };
      const ok = await update.mutateAsync({ id: productId, body });
      if (ok) { toast.success('Объявление обновлено'); onBack(); return true; }
      toast.error('Не удалось обновить объявление');
      return false;
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка при обновлении объявления');
      return false;
    }
  };

  if (status === 'error') {
    return (
      <div>
        <button onClick={onBack} className='flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition'>
          <ArrowLeft className='w-4 h-4' /> Назад к витрине
        </button>
        <div className='text-red-500'>Не удалось загрузить объявление</div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className='flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition'
      >
        <ArrowLeft className='w-4 h-4' /> Назад к витрине
      </button>
      <h2 className='text-lg font-semibold mb-4'>Редактировать объявление</h2>
      <AdvertisementForm
        productId={product?.id}
        initialValues={initialValues}
        initialPreviewUrl={initialPreviewUrl}
        initialFileNames={initialFileNames}
        submitLabel={update.isPending ? 'Сохранение…' : 'Сохранить'}
        loading={isLoading}
        onSubmit={handleEdit}
        mode='edit'
        maxFiles={5}
        isActive={product?.isActive}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Panel: Placeholder (вакансии/резюме)
// ─────────────────────────────────────────────

function PlaceholderPanel({ panel }: { panel: Panel }) {
  const labels: Partial<Record<Panel, string>> = {
    'vacancy-my': 'Мои вакансии',
    'vacancy-create': 'Создать вакансию',
    'resume-my': 'Мои резюме',
    'resume-create': 'Создать резюме',
  };
  return (
    <div className='flex flex-col items-center justify-center py-32 text-gray-400'>
      <div className='text-5xl mb-4'>🚧</div>
      <div className='text-lg font-medium mb-1 text-gray-600'>{labels[panel]}</div>
      <div className='text-sm'>Раздел в разработке</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Mobile menu (unchanged)
// ─────────────────────────────────────────────

function MobileMenu({ user }: { user: UserDataResponse | undefined }) {
  const [jobOpen, setJobOpen] = useState(false);
  const [tgConfirmOpen, setTgConfirmOpen] = useState(false);
  const [businessEditorOpen, setBusinessEditorOpen] = useState(false);
  const isBusinessUser = user?.role === 'shop' || user?.role === 'admin';
  return (
    <div className='space-y-2'>
      {isBusinessUser && (
        <ProfileItem icon={<Store className='w-5 h-5' />} label='Бизнес-страница' onClick={() => setBusinessEditorOpen(true)} />
      )}
      <ProfileItem icon={<ClipboardList className='w-5 h-5' />} label='Личная информация' href={`${ROUTES.PROFILE}/info`} />
      <ProfileItem icon={<Heart className='w-5 h-5 fill-black' />} label='Избранное' href={ROUTES.FAVORITES} />
      <ProfileItem icon={<ClipboardList className='w-5 h-5' />} label='Мои объявления' href={ROUTES.MY_ADVERTISEMENTS} />
      <ProfileItem icon={<PlusSquare className='w-5 h-5' />} label='Создать объявление' href={ROUTES.CREATE_ADVERTISEMENT} />
      <ProfileItem
        icon={<Briefcase className='w-5 h-5' />}
        label='Работа'
        onClick={() => setJobOpen(prev => !prev)}
        rightIcon={<motion.div animate={{ rotate: jobOpen ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown className='w-4 h-4 text-gray-500' /></motion.div>}
      />
      <AnimatePresence>
        {jobOpen && (
          <motion.div key='job-section' initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className='overflow-hidden'>
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
        <ProfileItem icon={<TgIcon2 className='w-5 h-5' />} label='Привязать телеграм' onClick={() => setTgConfirmOpen(true)} />
      )}
      <TgConfirmModal open={tgConfirmOpen} onClose={() => setTgConfirmOpen(false)} value={user?.url ?? ''} />
      <BusinessPageEditor isOpen={businessEditorOpen} onClose={() => setBusinessEditorOpen(false)} />
    </div>
  );
}

function ProfileItem({ icon, label, onClick, href, rightIcon, disabled }: {
  icon: React.ReactNode; label: string; onClick?: () => void; href?: string; rightIcon?: React.ReactNode; disabled?: boolean;
}) {
  return href ? (
    <Link href={disabled ? '' : href} onClick={onClick} className='w-full bg-white rounded-xl p-2 flex items-center justify-between text-left text-base'>
      <div className='flex items-center gap-3'><span className='text-gray-800'>{icon}</span><span>{label}</span></div>
      {rightIcon}
    </Link>
  ) : (
    <button onClick={onClick} className='w-full bg-white rounded-xl p-2 flex items-center justify-between text-left text-base cursor-pointer'>
      <div className='flex items-center gap-3'><span className='text-gray-800'>{icon}</span><span>{label}</span></div>
      {rightIcon}
    </button>
  );
}

function SubItem({ icon, label, href, onClick, disabled }: {
  icon: React.ReactNode; label: string; href: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <Link href={disabled ? '' : href} onClick={onClick} className='flex flex-col items-start justify-center gap-1 text-sm text-black'>
      <div className='flex items-center gap-2'>{icon}<span className='text-left'>{label}</span></div>
    </Link>
  );
}

function LogoutButton() {
  const router = useRouter();
  const setAuthorized = useAuthStore(s => s.setAuthorized);
  const queryClient = useQueryClient();
  const handleLogout = () => { setAuthorized(false); clearTokens(); queryClient.clear(); router.replace(ROUTES.HOME); };
  return (
    <button onClick={handleLogout} className='flex items-center gap-2 px-3 py-2 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors cursor-pointer'>
      <span className='text-sm font-medium'>Выйти</span>
    </button>
  );
}
