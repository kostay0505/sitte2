'use client';
import { useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { getChatMessages, markChatRead, sendChatMessage } from '@/api/chat/methods';
import type { Message } from '@/api/chat/methods';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

export function useChat(chatId: string) {
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const qc = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['chatMessages', chatId],
      queryFn: ({ pageParam }) =>
        getChatMessages(chatId, pageParam as string | undefined),
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
      enabled: !!isAuthorized && !!chatId,
    });

  // Server returns DESC (newest first), reverse for display (oldest top, newest bottom)
  const messages: Message[] = (data?.pages.flatMap((p) => p.items) ?? []).slice().reverse();

  // Mark chat as read when opened (independent of socket)
  useEffect(() => {
    if (!isAuthorized || !chatId) return;
    markChatRead(chatId).catch(() => {});
    // Re-run when new messages arrive (invalidate chat list unread count)
    qc.invalidateQueries({ queryKey: ['chatList'] });
  }, [isAuthorized, chatId, messages.length, qc]);

  // Socket for real-time INCOMING messages
  useEffect(() => {
    if (!isAuthorized || !chatId) return;
    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch (e) {
      console.warn('Socket init error:', e);
      return;
    }

    const onConnect = () => {
      socket.emit('joinChat', chatId);
    };

    const onNewMessage = () => {
      qc.invalidateQueries({ queryKey: ['chatMessages', chatId] });
    };

    if (socket.connected) onConnect();
    else socket.connect();

    socket.on('connect', onConnect);
    socket.on('newMessage', onNewMessage);

    return () => {
      socket.emit('leaveChat', chatId);
      socket.off('connect', onConnect);
      socket.off('newMessage', onNewMessage);
    };
  }, [isAuthorized, chatId, qc]);

  // Send via REST, then force refetch
  const sendMessage = useCallback(
    async (body: string, imageUrl?: string) => {
      if (!isAuthorized) return;
      try {
        await sendChatMessage(chatId, body || null, imageUrl ?? null);
        await qc.invalidateQueries({ queryKey: ['chatMessages', chatId] });
      } catch (e) {
        console.error('sendMessage error:', e);
      }
    },
    [isAuthorized, chatId, qc],
  );

  return {
    messages,
    sendMessage,
    hasMore: !!hasNextPage,
    loadMore: fetchNextPage,
    isFetchingNextPage,
  };
}
