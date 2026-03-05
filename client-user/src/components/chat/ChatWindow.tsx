'use client';
import { useEffect, useRef } from 'react';
import type { Chat, Message } from '@/api/chat/methods';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';

interface ChatWindowProps {
  chat: Chat | null;
  messages: Message[];
  currentUserId: string;
  onSend: (body: string, imageUrl?: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  isFetchingMore: boolean;
}

export function ChatWindow({
  chat,
  messages,
  currentUserId,
  onSend,
  hasMore,
  onLoadMore,
  isFetchingMore,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when last message changes (new message or initial load)
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMessageId]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop < 100 && hasMore && !isFetchingMore) {
      onLoadMore();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 bg-gray-50"
      >
        {isFetchingMore && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {messages.length === 0 && !isFetchingMore && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p>Начните диалог</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            body={msg.body}
            imageUrl={msg.imageUrl}
            isMine={msg.senderId === currentUserId}
            createdAt={msg.createdAt}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={onSend} />
    </div>
  );
}
