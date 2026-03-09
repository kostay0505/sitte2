'use client';
import { useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChatList, getOrCreateAdminChat } from '@/api/chat/methods';
import { useAuthStore } from '@/stores/authStore';
import { extractTgIdFromToken } from '@/utils/tokenUtils';
import { getTokens } from '@/api/auth/tokenStorage';

export const CHAT_LIST_KEY = ['chatList'];

export function useChatList() {
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const adminChatEnsured = useRef(false);
  const qc = useQueryClient();

  // Ensure admin chat exists once, then invalidate chat list
  useEffect(() => {
    if (isAuthorized && !adminChatEnsured.current) {
      adminChatEnsured.current = true;
      getOrCreateAdminChat()
        .then(() => qc.invalidateQueries({ queryKey: CHAT_LIST_KEY }))
        .catch(() => {});
    }
  }, [isAuthorized, qc]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: CHAT_LIST_KEY,
    queryFn: () => getChatList(),
    enabled: !!isAuthorized,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const totalUnread = useMemo(() => {
    if (!data?.items?.length) return 0;
    if (typeof window === 'undefined') return 0;
    const tokens = getTokens();
    const currentUserId = tokens?.accessToken
      ? extractTgIdFromToken(tokens.accessToken)
      : null;
    if (!currentUserId) return 0;
    return data.items.reduce((sum, chat) => {
      const unread =
        chat.buyerId === currentUserId ? chat.unreadBuyer : chat.unreadSeller;
      return sum + (unread || 0);
    }, 0);
  }, [data]);

  return { chats: data?.items ?? [], isLoading, error, refetch, totalUnread };
}
