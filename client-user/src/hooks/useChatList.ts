'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChatList } from '@/api/chat/methods';
import { useAuthStore } from '@/stores/authStore';

export const CHAT_LIST_KEY = ['chatList'];

export function useChatList() {
  const isAuthorized = useAuthStore((s) => s.isAuthorized);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: CHAT_LIST_KEY,
    queryFn: () => getChatList(),
    enabled: !!isAuthorized,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  return { chats: data?.items ?? [], isLoading, error, refetch };
}
