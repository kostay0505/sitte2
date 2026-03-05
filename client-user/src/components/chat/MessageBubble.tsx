'use client';
import { toImageSrc } from '@/utils/toImageSrc';
import { useRef, useState, useEffect } from 'react';

interface MessageBubbleProps {
  messageId: string;
  body: string | null;
  imageUrl: string | null;
  isMine: boolean;
  isRead: boolean;
  isSending?: boolean;
  createdAt: string;
  onDelete?: () => void;
}

function ClockIcon() {
  return (
    <svg className="inline w-3 h-3 opacity-60" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
    </svg>
  );
}

function SingleCheckIcon() {
  return (
    <svg className="inline w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.354 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
    </svg>
  );
}

function DoubleCheckIcon() {
  return (
    <svg className="inline w-5 h-3.5" viewBox="0 0 20 12" fill="currentColor">
      <path d="M19.354 1.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0L9.5 7.207l.708-.708 1.793 1.793 6.646-6.646a.5.5 0 0 1 .708 0z"/>
      <path d="M13.854 1.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 8.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
    </svg>
  );
}

function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
        onClick={onClose}
        aria-label="Закрыть"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image */}
      <img
        src={src}
        alt="attachment"
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}

export function MessageBubble({
  messageId,
  body,
  imageUrl,
  isMine,
  isRead,
  isSending,
  createdAt,
  onDelete,
}: MessageBubbleProps) {
  const time = new Date(createdAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const [swiped, setSwiped] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dx < -60 && dy < 40 && onDelete) {
      setSwiped(true);
    } else if (dx > 20) {
      setSwiped(false);
    }
  };

  const handleDeleteClick = () => {
    setSwiped(false);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    onDelete?.();
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setSwiped(false);
  };

  return (
    <>
      {/* Image viewer */}
      {viewerOpen && imageUrl && (
        <ImageViewer
          src={toImageSrc(imageUrl)}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={handleCancel}
        >
          <div
            className="bg-white rounded-2xl shadow-xl px-6 py-5 mx-4 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-gray-900 font-medium text-center mb-4">Удалить сообщение?</p>
            <p className="text-gray-500 text-sm text-center mb-5">
              Сообщение исчезнет у обоих участников чата.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Swipe-revealed delete button */}
        {isMine && onDelete && (
          <div
            className={`flex items-center justify-center transition-all duration-200 overflow-hidden ${
              swiped ? 'w-16 opacity-100' : 'w-0 opacity-0'
            }`}
          >
            <button
              onClick={handleDeleteClick}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500 text-white"
            >
              <TrashIcon />
            </button>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative max-w-[75%] rounded-2xl px-4 py-2 transition-transform duration-200 ${
            isMine
              ? 'bg-green-500 text-white rounded-br-sm'
              : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
          } ${swiped ? '-translate-x-2' : ''}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Desktop hover trash icon */}
          {isMine && onDelete && hovered && !swiped && (
            <button
              onClick={handleDeleteClick}
              className="absolute -left-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
              title="Удалить"
            >
              <TrashIcon />
            </button>
          )}

          {imageUrl && (
            <div className="mb-1">
              <img
                src={toImageSrc(imageUrl)}
                alt="attachment"
                className="rounded-lg max-w-full max-h-64 object-contain cursor-zoom-in"
                onClick={() => setViewerOpen(true)}
              />
            </div>
          )}
          {body && (
            <p className="text-sm whitespace-pre-wrap break-words">{body}</p>
          )}
          <div
            className={`flex items-center justify-end gap-1 mt-0.5 ${
              isMine ? 'text-green-100' : 'text-gray-400'
            }`}
          >
            <span className="text-xs">{time}</span>
            {isMine && (
              <span className="flex items-center leading-none">
                {isSending ? (
                  <ClockIcon />
                ) : isRead ? (
                  <DoubleCheckIcon />
                ) : (
                  <SingleCheckIcon />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
