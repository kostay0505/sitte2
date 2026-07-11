'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/utils/reportClientError';

const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk|Failed to load chunk|Importing a module script failed|error loading dynamically imported module/i;
const CHUNK_RELOAD_KEY = 'tem-chunk-reload-at';

/**
 * После деплоя чанки старого билда исчезают с сервера — открытые/восстановленные
 * сессии ловят ChunkLoadError и белый экран. Лечение: один принудительный reload
 * (не чаще раза в минуту, чтобы не зациклиться, если проблема не в билде).
 */
function reloadOnChunkError(message?: string) {
  if (!message || !CHUNK_ERROR_RE.test(message)) return;
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    // небольшая задержка, чтобы репорт об ошибке успел уйти на сервер
    setTimeout(() => window.location.reload(), 150);
  } catch {
    window.location.reload();
  }
}

/** Mounts global browser-error listeners and ships them to the backend. */
export function ErrorLogger() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError({
        message: e.message || 'window.onerror',
        stack: (e.error as Error | undefined)?.stack,
        source: `window:${e.filename || ''}:${e.lineno || 0}`,
      });
      reloadOnChunkError(e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string;
      const message = typeof r === 'string' ? r : r?.message || 'unhandledrejection';
      reportClientError({
        message,
        stack: typeof r === 'string' ? undefined : r?.stack,
        source: 'unhandledrejection',
      });
      reloadOnChunkError(message);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
