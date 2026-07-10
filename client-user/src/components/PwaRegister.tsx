'use client';

import { useEffect } from 'react';
import { isTMA } from '@tma.js/bridge';
import { toast } from 'sonner';

/**
 * Регистрация PWA service worker (/public/sw.js).
 * Внутри Telegram Mini App SW не регистрируется.
 * Новая версия активируется только по кнопке «Обновить» (SKIP_WAITING),
 * чтобы не ловить рассинхрон чанков у открытых вкладок.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (isTMA()) return;

    let reloaded = false;

    const promptUpdate = (worker: ServiceWorker) => {
      toast('Доступна новая версия сайта', {
        id: 'sw-update',
        duration: Infinity,
        action: {
          label: 'Обновить',
          onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
        },
      });
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          promptUpdate(registration.waiting);
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(worker);
            }
          });
        });
      })
      .catch(() => {
        /* SW опционален — ошибки регистрации не критичны */
      });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  return null;
}
