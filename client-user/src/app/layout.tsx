import type { PropsWithChildren } from 'react';
import type { Metadata, Viewport } from 'next';
import { Comfortaa } from 'next/font/google';
import { toJsonLd } from '@/utils/jsonLd';

import { Root } from '@/components/Root/Root';
import { Toaster } from 'sonner';
import { LanguageProvider } from '@/i18n/LanguageContext';

// import 'normalize.css/normalize.css';
import './_assets/globals.css';
import { QueryProvider } from '@/providers/QueryProvider';
import { Tabs } from '@/components/Tabs';
import { ErrorLogger } from '@/components/ErrorLogger';
import { PwaRegister } from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: {
    default: 'TEM — концертное оборудование',
    template: '%s | TEM',
  },
  description:
    'TEM — платформа для покупки и продажи звукового, светового и концертного оборудования.',
  metadataBase: new URL('https://touringexpertsale.ru'),
  alternates: {
    canonical: 'https://touringexpertsale.ru/',
  },
  openGraph: {
    siteName: 'TEM',
    locale: 'ru_RU',
    type: 'website',
    title: 'TEM — концертное оборудование',
    description: 'TEM — платформа для покупки и продажи звукового, светового и концертного оборудования.',
    url: 'https://touringexpertsale.ru',
    images: [
      {
        url: 'https://touringexpertsale.ru/images/logo.png',
        width: 512,
        height: 512,
        alt: 'TEM Marketplace',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'TEM',
    statusBarStyle: 'default',
  },
  verification: {
    google: 'ZUuSYEGk4rmgmvcMbwOTTB1ocFHEI2AjvHz6C3X23zI',
    other: {
      'yandex-verification': 'b3856d826d8d3914',
    },
  },
};

const comfortaa = Comfortaa({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: 'white',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
};

const SITE_URL = 'https://touringexpertsale.ru';

const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Touring Expert Marketplace',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/images/logo.png`,
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'TEM',
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/catalog?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

export default async function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="ru" className={comfortaa.className}>
      <body
        className={'text-white'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          overflowX: 'hidden',
        }}
      >
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{ __html: toJsonLd(siteJsonLd) }}
        />
        <Root>
          <LanguageProvider>
            <QueryProvider>
              {children}
              <Tabs />
            </QueryProvider>
            <Toaster richColors position='top-center' />
          </LanguageProvider>
        </Root>
        <ErrorLogger />
        <PwaRegister />
        <div id='modal-root'></div>
      </body>
    </html>
  );
}
