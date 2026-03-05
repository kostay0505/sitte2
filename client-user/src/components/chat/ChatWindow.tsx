'use client';
import { useEffect, useRef } from 'react';
import type { Chat, Message } from '@/api/chat/methods';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';

interface ChatWindowProps {
  chat: Chat | null;
  messages: Message[];
  currentUserId: string;
  isSending: boolean;
  onSend: (body: string, imageUrl?: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  isFetchingMore: boolean;
}

export function ChatWindow({
  chat,
  messages,
  currentUserId,
  isSending,
  onSend,
  hasMore,
  onLoadMore,
  isFetchingMore,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        {messages.length === 0 && !isFetchingMore && !isSending && (
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
            isRead={msg.isRead}
            isSending={false}
            createdAt={msg.createdAt}
          />
        ))}
        {isSending && (
          <div className="flex justify-end mb-2">
            <div className="bg-green-500 text-white rounded-2xl rounded-br-sm px-4 py-2 opacity-70">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={onSend} />
    </div>
  );
}
