'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/utils/cn';
import { CategoryNav } from '@/components/home/CategoryNav';
import { TgIcon2, LogoIcon } from './common/SvgIcon';
import { Bell, Briefcase, DoorOpen, Globe, LayoutGrid, MessageCircle, Search, UserRound } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { TG_LINK } from '@/config/constants';
import { LoginModal } from '@/components/Auth/LoginModal';
import { RegisterModal } from '@/components/Auth/RegisterModal';
import { EmailConfirmModal } from '@/components/Auth/EmailConfirmModal';
import { PasswordRecoveryModal } from '@/components/Auth/PasswordRecoveryModal';
import { loginWithEmail } from '@/api/auth/methods';
import { saveTokens, clearTokens, getTokens } from '@/api/auth/tokenStorage';
import { isTokenExpired } from '@/utils/tokenUtils';
import { useAuthStore } from '@/stores/authStore';
import { useChatList } from '@/hooks/useChatList';
import { useQuery } from '@tanstack/react-query';
import { getSiteContentKey } from '@/api/site-content/methods';
import { useHeaderStore } from '@/stores/headerStore';

interface TabItem {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  label?: string;
  isActive: (pathname: string) => boolean;
  external?: boolean;
  isLogo?: boolean;
  text?: string;
  requiresAuth?: boolean;
}

function Preheader() {
  const { data } = useQuery({
    queryKey: ['siteContent', 'preheader'],
    queryFn: () => getSiteContentKey('preheader'),
    staleTime: 5 * 60 * 1000,
  });

  let html = '';
  if (typeof data === 'string') html = data;
  else if (data && typeof data === 'object' && data.html) html = data.html;

  return (
    <div
      className='w-full bg-gray-100 text-gray-700 text-xs text-center px-4 py-1 min-h-[28px]'
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function DesktopHeader() {
  const router = useRouter();
  const isAuthorized = useAuthStore(s => s.isAuthorized);
  const setAuthMode = useAuthStore(s => s.setAuthMode);
  const [searchValue, setSearchValue] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) router.push(`${ROUTES.CATALOG}?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className='flex items-center h-[88px] w-full pl-6 pr-6 bg-white border-b border-gray-100'>
      {/* Logo — close to left edge, 2× size */}
      <button
        onClick={() => router.push(ROUTES.HOME)}
        className='shrink-0 flex items-center'
        aria-label='Home'
      >
        <LogoIcon className='h-16 w-auto' />
      </button>

      {/* 50px gap between logo and search */}
      <div className='w-[50px] shrink-0' />

      {/* Search — fills remaining space */}
      <form
        onSubmit={handleSearch}
        className='flex-1 flex items-center border border-gray-300 rounded-full overflow-hidden bg-white hover:border-gray-400 transition'
      >
        <input
          type='text'
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          placeholder='Поиск по каталогу...'
          className='flex-1 px-4 py-2 text-sm outline-none bg-transparent'
        />
        <button
          type='submit'
          className='px-3 py-2 text-gray-500 hover:text-black transition'
          aria-label='Search'
        >
          <Search className='w-4 h-4' />
        </button>
      </form>

      {/* 50px gap between search and nav */}
      <div className='w-[50px] shrink-0' />

      {/* Right nav */}
      <div className='flex items-center gap-[40px] shrink-0'>
        <button className='flex items-center gap-1 text-sm text-gray-600 hover:text-black transition'>
          <Globe className='w-4 h-4' />
          <span>RU</span>
        </button>

        <a href='/blog' className='text-sm text-gray-700 hover:text-black transition'>
          Blog
        </a>

        {isAuthorized ? (
          <>
            <button
              className='relative text-gray-700 hover:text-black transition'
              aria-label='Уведомления'
            >
              <Bell className='w-5 h-5' />
            </button>

            <button
              onClick={() => router.push(ROUTES.PROFILE)}
              className='text-gray-700 hover:text-black transition'
              aria-label='Личный кабинет'
            >
              <UserRound className='w-5 h-5' />
            </button>

          </>
        ) : (
          <>
            <button
              onClick={() => setAuthMode('login')}
              className='text-sm text-gray-700 hover:text-black px-3 py-1.5 rounded-full border border-gray-300 hover:border-gray-500 transition'
            >
              Sign Up
            </button>
            <button
              onClick={() => setAuthMode('register')}
              className='text-sm bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition'
            >
              Join Free
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DesktopHeaderWrapper() {
  const isVisible = useHeaderStore(s => s.isVisible);
  return (
    <div
      className='hidden md:block fixed top-0 left-0 right-0 z-50 bg-white'
      style={{
        transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <Preheader />
      <DesktopHeader />
      <CategoryNav />
    </div>
  );
}

export const Tabs: React.FC = memo(() => {
  const pathname = usePathname();
  const { push } = useRouter();
  const isChatWindow = /^\/chats\/[^/]+/.test(pathname);
  const authMode = useAuthStore(s => s.authMode);
  const setAuthMode = useAuthStore(s => s.setAuthMode);

  const authEmail = useAuthStore(s => s.authEmail);
  const setAuthEmail = useAuthStore(s => s.setAuthEmail);

  const authPassword = useAuthStore(s => s.authPassword);
  const setAuthPassword = useAuthStore(s => s.setAuthPassword);

  const isAuthorized = useAuthStore(s => s.isAuthorized);
  const setAuthorized = useAuthStore(s => s.setAuthorized);

  const { totalUnread } = useChatList();

  useEffect(() => {
    const tokens = getTokens();
    if (tokens && tokens.accessToken && !isTokenExpired(tokens.accessToken)) {
      setAuthorized(true);
    } else {
      setAuthorized(false);
      clearTokens();
    }
  }, [setAuthorized]);

  const tabs: TabItem[] = useMemo(() => {
    return [
      {
        path: ROUTES.CATALOG,
        icon: LayoutGrid,
        isActive: pathname => pathname.startsWith(ROUTES.CATALOG),
        text: 'Каталог',
      },
      {
        path: TG_LINK,
        icon: TgIcon2,
        isActive: () => false,
        external: true,
        text: 'Канал TE',
      },
      {
        path: ROUTES.HOME,
        icon: LogoIcon,
        isActive: pathname => pathname === ROUTES.HOME,
        isLogo: true,
      },
      {
        path: ROUTES.CHATS,
        icon: MessageCircle,
        isActive: pathname => pathname.startsWith(ROUTES.CHATS),
        text: 'Чаты',
        requiresAuth: true,
      },
      {
        path: ROUTES.PROFILE,
        icon: UserRound,
        isActive: pathname => pathname.startsWith(ROUTES.PROFILE),
        text: 'Профиль',
      },
    ];
  }, []);

  const handleNavigate = (tab: TabItem) => {
    if (tab.external) {
      window.open(tab.path, '_blank');
      return;
    }
    push(tab.path);
  };

  return (
    <>
      {/* Mobile bottom tabs */}
      <div
        className={cn(
          'fixed left-2 right-2 z-50',
          'flex justify-around items-center gap-2',
          'bg-[#F5F5FA] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.1)]',
          'h-[60px] px-2',
          'bottom-4',
          'md:hidden',
          isChatWindow && 'hidden',
        )}
      >
        {tabs.map((tab, index) => {
          if (!isAuthorized && (tab.path.startsWith(ROUTES.PROFILE) || tab.requiresAuth)) {
            return (
              <button
                key={index}
                onClick={() => setAuthMode('login')}
                className='flex flex-col items-center justify-center gap-1 cursor-pointer text-[#1E1E1E] transition hover:text-green-700 active:text-green-700'
              >
                {tab.requiresAuth ? (
                  <tab.icon className='w-7 h-7' />
                ) : (
                  <DoorOpen className='w-7 h-7' />
                )}
              </button>
            );
          }

          const Icon = tab.icon;
          const isActive = tab.isActive(pathname);
          const isLogo = tab?.isLogo;
          const isChats = tab.path === ROUTES.CHATS;

          return (
            <button
              key={index}
              onClick={() => handleNavigate(tab)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 cursor-pointer text-[#1E1E1E] transition',
                'hover:text-green-700 active:text-green-700',
                isActive && 'text-green-700',
              )}
            >
              <div className='relative'>
                <Icon className={cn(isLogo ? 'w-[60px] h-7' : 'w-7 h-7')} />
                {isChats && totalUnread > 0 && (
                  <span className='absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none'>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop header */}
      <DesktopHeaderWrapper />

      <LoginModal
        open={authMode === 'login'}
        onClose={() => setAuthMode('none')}
        onSuccess={() => {
          setAuthorized(true);
          setAuthMode('none');
        }}
        onOpenRegister={() => setAuthMode('register')}
        onOpenForgotPassword={() => setAuthMode('resetPassword')}
        onEmailUnconfirmed={email => {
          setAuthEmail(email);
          setAuthMode('confirmEmail');
        }}
      />

      <RegisterModal
        open={authMode === 'register'}
        onClose={() => setAuthMode('none')}
        onOpenLogin={() => setAuthMode('login')}
        onRegistered={(email, password) => {
          setAuthEmail(email);
          setAuthPassword(password);
          setAuthMode('confirmEmail');
        }}
      />

      <EmailConfirmModal
        open={authMode === 'confirmEmail'}
        email={authEmail}
        onClose={() => setAuthMode('none')}
        onSuccess={async () => {
          if (authEmail && authPassword) {
            try {
              const tokens = await loginWithEmail({
                email: authEmail,
                password: authPassword,
              });
              saveTokens(tokens);
            } catch (error) {}
          }
          setAuthorized(true);
          setAuthMode('none');
        }}
      />

      <PasswordRecoveryModal
        open={authMode === 'resetPassword'}
        onClose={() => setAuthMode('none')}
        onSuccess={email => {
          setAuthEmail(email);
          setAuthMode('login');
        }}
      />
    </>
  );
});

Tabs.displayName = 'Tabs';
