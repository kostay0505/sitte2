'use client';
import { useChatList } from '@/hooks/useChatList';
import { ChatList } from '@/components/chat/ChatList';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { extractTgIdFromToken } from '@/utils/tokenUtils';
import { getTokens } from '@/api/auth/tokenStorage';

export default function ChatsPage() {
  const router = useRouter();
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const { chats, isLoading } = useChatList();
  const [currentUserId, setCurrentUserId] = useState('');

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
  }, [isAuthorized, router]);

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-white md:pt-[100px]">
      <div className="sticky top-0 md:top-[100px] z-10 bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900">Чаты</h1>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <ChatList chats={chats} currentUserId={currentUserId} />
      )}
    </div>
  );
}
