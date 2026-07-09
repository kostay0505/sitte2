import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Touring Expert Marketplace',
    short_name: 'TEM',
    description:
      'TEM — платформа для покупки и продажи звукового, светового и концертного оборудования.',
    id: '/',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ru',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
