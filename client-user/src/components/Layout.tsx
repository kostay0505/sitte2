'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { cn } from '@/utils/cn';
import { viewport } from '@tma.js/sdk-react';
import PageTransition from './PageTransition';
import { useWindowResize } from '@/hooks/useWindowResize';
import { Footer } from './Footer';
const TABS_HEIGHT = 60 + 16;
const TABS_DESKTOP_HEIGHT = 149;

export const Layout: React.FC<PropsWithChildren<{ className?: string }>> = ({
  children,
  className,
}) => {
  const isMobile = useWindowResize()?.width < 768;

  const [insets, setInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  useEffect(() => {
    setInsets(viewport.safeAreaInsets());
  }, []);

  const containerStyles = useMemo(
    () => ({
      paddingTop: !isMobile
        ? `${TABS_DESKTOP_HEIGHT + insets.top}px`
        : `${insets.top}px`,
    }),
    [insets.bottom, insets.top, isMobile],
  );

  return (
    <div
      className={cn('relative h-full flex flex-col')}
      style={containerStyles}
    >
      <div
        className={cn('flex-1 overflow-y-auto scrollbar-hide flex flex-col')}
      >
        <PageTransition className={className}>{children}</PageTransition>
        <div
          className='mt-auto pt-5'
          style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)' }}
        >
          <Footer />
        </div>
      </div>
    </div>
  );
};

Layout.displayName = 'Layout';
