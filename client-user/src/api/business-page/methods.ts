import { api } from '@/api/api';
import type { BusinessPage } from './types';

export async function getMyBusinessPage(): Promise<BusinessPage | null> {
  try {
    const res = await api.get<BusinessPage>('/business-page/my');
    return res.data ?? null;
  } catch (e: any) {
    if (e?.response?.status === 401 || e?.response?.status === 404) return null;
    throw e;
  }
}

export async function upsertBusinessPage(
  slug: string,
  blocks: any[],
): Promise<BusinessPage> {
  const res = await api.put<BusinessPage>('/business-page', { slug, blocks });
  return res.data;
}

export async function getBusinessPageBySlug(slug: string): Promise<BusinessPage> {
  const res = await api.get<BusinessPage>(`/business-page/${slug}`);
  return res.data;
}
