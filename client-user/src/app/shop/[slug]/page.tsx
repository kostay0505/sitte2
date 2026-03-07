'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Page } from '@/components/Page';
import { Layout } from '@/components/Layout';
import { getBusinessPageBySlug } from '@/api/business-page/methods';
import { getUserSeller } from '@/api/user/methods';
import { BusinessPageView } from '@/components/business/BusinessPageView';
import type { UserBasic } from '@/api/user/types';

export default function BusinessShopPage() {
  const { slug } = useParams<{ slug: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [seller, setSeller] = useState<UserBasic | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getBusinessPageBySlug(slug)
      .then(async p => {
        setUserId(p.userId);
        const s = await getUserSeller(p.userId).catch(() => null);
        setSeller(s);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return (
      <Page back={true}>
        <Layout className='flex flex-col items-center justify-center py-24 text-gray-400'>
          <p className='text-lg font-medium'>Страница не найдена</p>
          <p className='text-sm mt-1'>/shop/{slug}</p>
        </Layout>
      </Page>
    );
  }

  if (!userId) {
    return (
      <Page back={true}>
        <Layout className='flex items-center justify-center py-24'>
          <div className='w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin' />
        </Layout>
      </Page>
    );
  }

  return (
    <Page back={true}>
      <Layout className='pb-10'>
        <BusinessPageView userId={userId} seller={seller} />
      </Layout>
    </Page>
  );
}
