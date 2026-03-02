import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/profile',
          '/profile/info',
          '/advertisements/my',
          '/advertisements/create',
          '/advertisements/edit/',
          '/resume/my',
          '/resume/create',
          '/resume/edit/',
          '/vacancy/my',
          '/vacancy/create',
          '/vacancy/edit/',
        ],
      },
    ],
    sitemap: 'https://touringexpertsale.ru/sitemap.xml',
  };
}
