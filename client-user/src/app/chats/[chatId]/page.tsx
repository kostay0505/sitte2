'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { getChatById } from '@/api/chat/methods';
import type { Chat } from '@/api/chat/methods';
import { useChat } from '@/hooks/useChat';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { toImageSrc } from '@/utils/toImageSrc';
import { extractTgIdFromToken } from '@/utils/tokenUtils';
import { getTokens } from '@/api/auth/tokenStorage';

interface Props {
  params: Promise<{ chatId: string }>;
}

export default function ChatPage({ params }: Props) {
  const { chatId } = use(params);
  const router = useRouter();
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const [chat, setChat] = useState<Chat | null>(null);
  const [loadingChat, setLoadingChat] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');

  const { messages, sendMessage, isSending, hasMore, loadMore, isFetchingNextPage } =
    useChat(chatId);

  useEffect(() => {
    if (!isAuthorized) {
      router.push('/');
      return;
    }

    const tokens = getTokens();
    if (tokens?.accessToken) {
      const tgId = extractTgIdFromToken(tokens.accessToken);
      if (tgId) setCurrentUserId(tgId);
    }

    getChatById(chatId)
      .then((data) => setChat(data))
      .catch(() => {})
      .finally(() => setLoadingChat(false));
  }, [isAuthorized, chatId, router]);

  if (!isAuthorized) return null;

  const isBuyer = chat?.buyerId === currentUserId;
  const otherName = chat
    ? isBuyer
      ? chat.sellerFirstName || chat.sellerUsername || 'Продавец'
      : chat.buyerFirstName || chat.buyerUsername || 'Покупатель'
    : '';

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-gray-600">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{otherName}</p>
          {chat?.productName && (
            <p className="text-xs text-gray-500 truncate">{chat.productName}</p>
          )}
        </div>
        {chat?.productPreview && (
          <img
            src={toImageSrc(chat.productPreview)}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
          />
        )}
      </div>

      {/* Chat window */}
      {loadingChat && !chat ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ChatWindow
            chat={chat}
            messages={messages}
            currentUserId={currentUserId}
            isSending={isSending}
            onSend={sendMessage}
            hasMore={hasMore}
            onLoadMore={loadMore}
            isFetchingMore={isFetchingNextPage}
          />
        </div>
      )}
    </div>
  );
}
