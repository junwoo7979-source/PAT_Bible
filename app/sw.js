const CACHE_NAME = 'pat-bible-app-v93';
const APP_SHELL = [
  './',
  './index.html',
  './firebase-config.js',
  './firebase-db.js',
  './js/app-core.js',
  './js/verse.js',
  './js/family.js',
  './js/voice.js',
  './js/voice-ui.js',
  './js/progress-store.js',
  './js/memorize.js',
  './js/prayer.js',
  './js/reading.js',
  './js/reset-pw.js',
  './js/admin.js',
  './manifest.json',
  './icons/pat-icon-192.png',
  './icons/pat-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        console.log('[PAT SW v63] Found caches:', keys);
        return Promise.all(keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[PAT SW v63] Deleting old cache:', key);
            return caches.delete(key);
          })
        );
      })
      .then(() => {
        console.log('[PAT SW v63] All old caches deleted, claiming clients');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // index.html & manifest.json: 항상 최신 버전 (네트워크 우선)
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/manifest.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 아이콘 파일: 네트워크 우선 (캐시 무시)
  // 아이콘 요청에 자동으로 캐시버스팅 쿼리 추가 (manifest 변경 없이 아이콘만 업데이트)
  if (url.pathname.startsWith('/icons/')) {
    const iconUrl = new URL(event.request.url);
    // 기존 쿼리 제거 후 최신 버전 추가
    iconUrl.search = '?v=' + CACHE_NAME.split('-').pop();
    event.respondWith(
      fetch(iconUrl, { cache: 'no-store' })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 기타 파일: 캐시 우선
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
