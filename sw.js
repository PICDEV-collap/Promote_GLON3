/* ==========================================================================
   GLO N3 - Service Worker (Network-First for fresh updates & Offline Cache)
   ========================================================================== */

const CACHE_NAME = 'glo-n3-portal-v4-thanakit';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/sound-effects.js',
  './js/particle-canvas.js',
  './js/ai-dream-engine.js',
  './js/n3-calculator.js',
  './js/n3-checker.js',
  './js/share-card.js',
  './js/voice-input.js',
  './js/agent-system.js',
  './js/pwa-installer.js',
  './js/n3-countdown.js',
  './js/poster-studio.js',
  './js/tarot-engine.js',
  './js/app.js'
];

// Install Event: Cache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Non-blocking cache error during install:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Network First for HTML and JavaScript (Always load fresh updates)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isHtmlOrScript = event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/');

  if (isHtmlOrScript) {
    // 1. Network First: พยายามดึงจากเซิร์ฟเวอร์ก่อนเสมอเพื่อให้ได้ข้อมูลล่าสุดทันที
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // หากไม่มีอินเทอร์เน็ต ใช้เวอร์ชันในแคช
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // 2. Cache First สำหรับ Assets สถิต (รูปภาพ, ไอคอน, สไตล์)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          event.request.url.startsWith(self.location.origin)
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });
    })
  );
});
