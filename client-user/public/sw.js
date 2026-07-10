/*
 * TEM PWA service worker.
 * Файл статический (не генерируется сборкой). При изменении логики кэширования
 * увеличить SW_VERSION — старые кэши будут удалены на activate.
 * Kill-switch: заменить файл на self.registration.unregister() + пересборка.
 */
const SW_VERSION = 'v1';
const STATIC_CACHE = `tem-static-${SW_VERSION}`;
const IMAGE_CACHE = `tem-images-${SW_VERSION}`;
const API_CACHE = `tem-api-${SW_VERSION}`;
const PAGE_CACHE = `tem-pages-${SW_VERSION}`;
const CACHE_NAMES = [STATIC_CACHE, IMAGE_CACHE, API_CACHE, PAGE_CACHE];

const OFFLINE_URL = '/offline';

// Публичные GET-эндпоинты API — единственное, что кэшируется из api.*
// (auth, chat, notifications, users и прочее персональное SW не трогает)
const PUBLIC_API_RE =
  /^https:\/\/api\.touringexpertsale\.ru\/api\/(categories|brands|cities|countries|home|site-content|articles|products|product-models|business-page)(\/|\?|$)/;

self.addEventListener('install', event => {
  // Офлайн-страницу кладём в кэш заранее, иначе показывать будет нечего.
  // skipWaiting() здесь НЕ вызываем: активация новой версии — по кнопке «Обновить» (SKIP_WAITING).
  event.waitUntil(caches.open(PAGE_CACHE).then(cache => cache.add(OFFLINE_URL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => !CACHE_NAMES.includes(k)).map(k => caches.delete(k)))),
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { cacheName });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone()).then(() => trimCache(cacheName, maxEntries));
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) return cached;
  const response = await network;
  if (!response) throw new Error('offline');
  return response;
}

function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sw-timeout')), timeoutMs);
    fetch(request).then(
      response => {
        clearTimeout(timer);
        resolve(response);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function networkFirst(request, cacheName, maxEntries, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (response.ok) {
      cache.put(request, response.clone()).then(() => trimCache(cacheName, maxEntries));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Навигации: только сеть; при недоступности — офлайн-страница
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match(OFFLINE_URL, { cacheName: PAGE_CACHE });
        return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
      }),
    );
    return;
  }

  // Картинки (включая /_next/image): stale-while-revalidate
  if (request.destination === 'image' || url.pathname.startsWith('/_next/image')) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, 150).catch(() => new Response('', { status: 404 })));
    return;
  }

  // Иммутабельные чанки Next: cache-first
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Публичные API: network-first с таймаутом, офлайн — из кэша
  if (PUBLIC_API_RE.test(url.href)) {
    event.respondWith(networkFirst(request, API_CACHE, 60, 4000));
    return;
  }

  // Всё остальное (auth, chat, socket.io, персональные данные) — мимо SW
});
