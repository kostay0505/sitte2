'use client';
import { toImageSrc } from '@/utils/toImageSrc';

interface MessageBubbleProps {
  body: string | null;
  imageUrl: string | null;
  isMine: boolean;
  isRead: boolean;
  isSending?: boolean;
  createdAt: string;
}

function ClockIcon() {
  return (
    <svg className="inline w-3 h-3 opacity-70" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
    </svg>
  );
}

// Single check = sent, not read
function SingleCheck() {
  return (
    <svg className="inline w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.354 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
    </svg>
  );
}

// Double check = read
function DoubleCheck({ read }: { read: boolean }) {
  return (
    <svg className="inline w-4.5 h-3.5" viewBox="0 0 22 16" fill="currentColor">
      <path
        d="M21.354 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 0 1 .708-.708L14 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"
        className={read ? '' : 'opacity-50'}
      />
      <path d="M15.354 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L8 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
    </svg>
  );
}

export function MessageBubble({
  body,
  imageUrl,
  isMine,
  isRead,
  isSending,
  createdAt,
}: MessageBubbleProps) {
  const time = new Date(createdAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          isMine
            ? 'bg-green-500 text-white rounded-br-sm'
            : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
        }`}
      >
        {imageUrl && (
          <div className="mb-1">
            <img
              src={toImageSrc(imageUrl)}
              alt="attachment"
              className="rounded-lg max-w-full max-h-64 object-contain"
            />
          </div>
        )}
        {body && (
          <p className="text-sm whitespace-pre-wrap break-words">{body}</p>
        )}
        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMine ? 'text-green-100' : 'text-gray-400'}`}>
          <span className="text-xs">{time}</span>
          {isMine && (
            <span className="flex items-center leading-none">
              {isSending ? (
                <ClockIcon />
              ) : isRead ? (
                <DoubleCheck read={true} />
              ) : (
                <DoubleCheck read={false} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
