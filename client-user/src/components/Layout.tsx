'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { cn } from '@/utils/cn';
import { viewport } from '@tma.js/sdk-react';
import PageTransition from './PageTransition';
import { useWindowResize } from '@/hooks/useWindowResize';
import { Footer } from './Footer';
import { useHeaderStore } from '@/stores/headerStore';

const TABS_DESKTOP_HEIGHT = 149;

export const Layout: React.FC<PropsWithChildren<{ className?: string }>> = ({
  children,
  className,
}) => {
  const isMobile = useWindowResize()?.width < 768;

  const [insets, setInsets] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
  useEffect(() => { setInsets(viewport.safeAreaInsets()); }, []);

  const isVisible = useHeaderStore(s => s.isVisible);

  const containerStyles = useMemo(
    () => ({
      paddingTop: !isMobile
        ? `${(isVisible ? TABS_DESKTOP_HEIGHT : 0) + insets.top}px`
        : `${insets.top}px`,
      transition: 'padding-top 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }),
    [insets.top, isMobile, isVisible],
  );

  const lastScrollY = useRef(0);
  const setVisible = useHeaderStore(s => s.setVisible);
  const setScrollY = useHeaderStore(s => s.setScrollY);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const current = e.currentTarget.scrollTop;
    const prev = lastScrollY.current;

    setScrollY(current);

    if (current <= 10) {
      setVisible(true);
    } else if (current > prev + 4) {
      setVisible(false);
    } else if (current < prev - 4) {
      setVisible(true);
    }

    lastScrollY.current = current;
  }, [setVisible, setScrollY]);

  return (
    <div className={cn('relative h-full flex flex-col')} style={containerStyles}>
      <div
        className={cn('flex-1 overflow-y-auto scrollbar-hide flex flex-col')}
        onScroll={handleScroll}
      >
        <PageTransition className={className}>{children}</PageTransition>
        <div className='mt-auto pt-5' style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)' }}>
          <Footer />
        </div>
      </div>
    </div>
  );
};

Layout.displayName = 'Layout';
