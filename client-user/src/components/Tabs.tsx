'use client';

import React, { memo, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/utils/cn';
import { TgIcon2, LogoIcon } from './common/SvgIcon';
import { Briefcase, DoorOpen, LayoutGrid, MessageCircle, UserRound } from 'lucide-react';
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

export const Tabs: React.FC = memo(() => {
  const pathname = usePathname();
  const router = useRouter();
  const { push } = useRouter();
  // Hide tab bar on mobile when inside a specific chat window
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
        path: ROUTES.JOB,
        icon: Briefcase,
        isActive: pathname => pathname.startsWith(ROUTES.JOB),
        text: 'Работа',
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
      <div
        className={cn(
          'fixed left-2 right-2 z-50',
          'flex justify-around items-center gap-2',
          'bg-[#F5F5FA] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.1)]',
          'h-[60px] px-2',
          'bottom-4',
          'md:w-full md:top-0 md:bottom-auto md:bg-white md:h-[100px]',
          'md:left-1/2 md:right-auto md:transform md:-translate-x-1/2 md:shadow-none',
          'md:justify-center md:gap-16',
          isChatWindow && 'hidden md:flex',
        )}
      >
        {tabs.map((tab, index) => {
          if (
            !isAuthorized &&
            (tab.path.startsWith(ROUTES.PROFILE) || tab.requiresAuth)
          ) {
            return (
              <button
                key={index}
                onClick={() => setAuthMode('login')}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 cursor-pointer text-[#1E1E1E] transition',
                  'hover:text-green-700 active:text-green-700',
                  'md:text-sm',
                )}
              >
                {tab.requiresAuth ? (
                  <tab.icon className='w-7 h-7 md:w-9 md:h-9' />
                ) : (
                  <DoorOpen className='w-7 h-7 md:w-9 md:h-9' />
                )}
                <span className={cn('hidden md:block')}>
                  {tab.requiresAuth ? tab.text : 'Вход'}
                </span>
              </button>
            );
          }

          const Icon = tab.icon;
          const isActive = tab.isActive(pathname);
          const isLogo = tab?.isLogo;
          const text = tab?.text;
          const isChats = tab.path === ROUTES.CHATS;

          return (
            <button
              key={index}
              onClick={() => handleNavigate(tab)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 cursor-pointer text-[#1E1E1E] transition',
                'hover:text-green-700 active:text-green-700',
                isActive && 'text-green-700',
                'md:text-sm',
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    isLogo
                      ? 'w-[60px] h-7 md:h-[70px] md:object-contain md:w-auto'
                      : 'w-7 h-7 md:w-9 md:h-9',
                  )}
                />
                {isChats && totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
              {text && <span className={cn('hidden md:block')}>{text}</span>}
            </button>
          );
        })}
      </div>

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
