'use client';
import { useEffect, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChatMessages, markChatRead, sendChatMessage } from '@/api/chat/methods';
import type { Message } from '@/api/chat/methods';
import { useAuthStore } from '@/stores/authStore';

export function useChat(chatId: string) {
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const qc = useQueryClient();
  const [sendingCount, setSendingCount] = useState(0);

  const { data } = useQuery({
    queryKey: ['chatMessages', chatId],
    queryFn: () => getChatMessages(chatId),
    enabled: !!isAuthorized && !!chatId,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  // Server returns ASC (oldest first)
  const messages: Message[] = data?.items ?? [];

  // Mark as read when chat is open or new messages arrive
  useEffect(() => {
    if (!isAuthorized || !chatId) return;
    markChatRead(chatId).catch(() => {});
    qc.invalidateQueries({ queryKey: ['chatList'] });
  }, [isAuthorized, chatId, messages.length, qc]);

  const sendMessage = useCallback(
    async (body: string, imageUrl?: string) => {
      if (!isAuthorized) return;
      setSendingCount((n) => n + 1);
      try {
        await sendChatMessage(chatId, body || null, imageUrl ?? null);
        await qc.invalidateQueries({ queryKey: ['chatMessages', chatId] });
      } catch (e) {
        console.error('sendMessage error:', e);
      } finally {
        setSendingCount((n) => n - 1);
      }
    },
    [isAuthorized, chatId, qc],
  );

  return {
    messages,
    sendMessage,
    isSending: sendingCount > 0,
    hasMore: false,
    loadMore: () => {},
    isFetchingNextPage: false,
  };
}
