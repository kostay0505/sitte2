'use client';

import React, { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/utils/cn';
import { LogoIcon, TelegramIcon, VkIcon } from './common/SvgIcon';
import { ROUTES } from '@/config/routes';
import { getSiteContentKey } from '@/api/site-content/methods';
import { isTMA } from '@tma.js/sdk-react';

function parseSocial(data: any): { vk?: string; telegram?: string } {
  if (!data) return {};
  if (typeof data === 'object') return data;
  try { return JSON.parse(data); } catch { return {}; }
}

export const Footer: React.FC = memo(() => {
  const { data: socialData } = useQuery({
    queryKey: ['siteContent', 'footer_social'],
    queryFn: () => getSiteContentKey('footer_social'),
    staleTime: 10 * 60 * 1000,
  });

  const social = parseSocial(socialData);

  return (
    <div
      className={cn(
        'w-full bg-[#1a1a1a] text-white',
        isTMA() ? 'pb-[80px]' : 'pb-[120px]',
        'md:pb-0',
      )}
    >
      {/* Main content */}
      <div className='max-w-[1200px] mx-auto px-6 pt-8 pb-6 flex flex-col md:flex-row md:items-start gap-8'>

        {/* Left: Logo + social */}
        <div className='flex flex-col gap-4 md:max-w-[240px]'>
          <a href={ROUTES.HOME} className='inline-flex'>
            <LogoIcon className='h-12 w-auto brightness-0 invert' />
          </a>

          {/* Social icons */}
          <div className='flex gap-3 mt-2'>
            {social.vk && (
              <a href={social.vk} className='w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition'>
                <VkIcon className='w-5 h-5 fill-white' />
              </a>
            )}
            {social.telegram && (
              <a href={social.telegram} className='w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition'>
                <TelegramIcon className='w-5 h-5 fill-white' />
              </a>
            )}
          </div>
        </div>

        {/* Right: Link columns */}
        <div className='flex gap-12 md:ml-auto'>
          {/* Company */}
          <div className='flex flex-col gap-3'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-gray-400'>Company</h3>
            {[
              { label: 'About us', href: '/about' },
              { label: 'Newsroom', href: '/newsroom' },
              { label: 'Careers', href: '/careers' },
              { label: 'Affiliates', href: '/affiliates' },
              { label: 'Blog', href: '/blog' },
            ].map(({ label, href }) => (
              <a key={href} href={href} className='text-sm text-gray-300 hover:text-white transition'>
                {label}
              </a>
            ))}
          </div>

          {/* Explore */}
          <div className='flex flex-col gap-3'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-gray-400'>Explore</h3>
            {[
              { label: 'Help center', href: '/hub' },
              { label: 'Sell on TEM', href: '/sell-on-tem' },
              { label: 'Catalog', href: ROUTES.CATALOG },
            ].map(({ label, href }) => (
              <a key={href} href={href} className='text-sm text-gray-300 hover:text-white transition'>
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom copyright bar */}
      <div className='border-t border-white/10'>
        <div className='max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-center md:justify-start'>
          <p className='text-xs text-gray-400 whitespace-nowrap'>
            &copy;{new Date().getFullYear()} TEM.{' '}
            <a href='/terms' className='hover:text-white transition'>Terms of Service</a>
            {' • '}
            <a href='/privacy' className='hover:text-white transition'>Privacy Policy</a>
            {' • '}
            <a href='/cookies' className='hover:text-white transition'>Cookie Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
});

Footer.displayName = 'Footer';
