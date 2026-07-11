'use client';

import { useEffect, useState } from 'react';
import { isTMA } from '@tma.js/bridge';
import { toast } from 'sonner';
import { getPushPublicKey, subscribePush, unsubscribePush } from '@/api/push/methods';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/**
 * Тумблер push-уведомлений (Web Push). Рендерится только там, где push реально
 * доступен: не в Telegram Mini App и только в браузерах с поддержкой PushManager.
 */
export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isTMA()) return;
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      return;
    }
    setSupported(true);
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setEnabled(!!sub))
      .catch(() => {});
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (enabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribePush(sub.endpoint).catch(() => {});
          await sub.unsubscribe();
        }
        setEnabled(false);
        toast.success('Push-уведомления выключены');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.error('Уведомления заблокированы в настройках браузера');
          return;
        }
        const publicKey = await getPushPublicKey();
        if (!publicKey) {
          toast.error('Push-уведомления временно недоступны');
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
        await subscribePush(sub.toJSON());
        setEnabled(true);
        toast.success('Push-уведомления включены');
      }
    } catch {
      toast.error('Не удалось изменить настройку уведомлений');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='mt-6 rounded-xl border border-gray-200 bg-white p-4 text-black'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <div className='font-semibold'>Push-уведомления</div>
          <div className='text-sm text-gray-500'>
            Сообщения чата и события — даже когда сайт закрыт
          </div>
        </div>
        <button
          type='button'
          onClick={toggle}
          disabled={busy}
          aria-pressed={enabled}
          aria-label='Push-уведомления'
          className='relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50'
          style={{ background: enabled ? '#22c55e' : '#d1d5db' }}
        >
          <span
            className='absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all'
            style={{ left: enabled ? 22 : 2 }}
          />
        </button>
      </div>
    </div>
  );
}
