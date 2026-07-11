import { api } from '@/api/api';

export async function getPushPublicKey(): Promise<string | null> {
  const { data } = await api.get<{ publicKey: string | null }>('/push/public-key');
  return data.publicKey;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post('/push/subscribe', subscription);
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await api.post('/push/unsubscribe', { endpoint });
}
