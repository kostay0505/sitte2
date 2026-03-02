import type { PropsWithChildren } from 'react';
import type { Metadata, Viewport } from 'next';
import { Comfortaa } from 'next/font/google';

import { Root } from '@/components/Root/Root';
import { Toaster } from 'sonner';

// import 'normalize.css/normalize.css';
import './_assets/globals.css';
import { QueryProvider } from '@/providers/QueryProvider';
import { Tabs } from '@/components/Tabs';

export const metadata: Metadata = {
  title: {
    default: 'Touring Expert — маркетплейс товаров и вакансий',
    template: '%s | Touring Expert',
  },
  description:
    'Touring Expert — площадка для покупки и продажи товаров, поиска работы и сотрудников. Объявления от частных лиц и брендов.',
  metadataBase: new URL('https://touringexpertsale.ru'),
  openGraph: {
    siteName: 'Touring Expert',
    locale: 'ru_RU',
    type: 'website',
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
  userScalable: false,
};

export default async function RootLayout({ children }: PropsWithChildren) {
  return (
    <html className={comfortaa.className}>
      <body
        className={'text-white'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <Root>
          <QueryProvider>{children}</QueryProvider>
          <Toaster richColors position='top-center' />
          <Tabs />
        </Root>
        <div id='modal-root'></div>
      </body>
    </html>
  );
}
