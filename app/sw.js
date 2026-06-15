const CACHE_NAME = 'pat-bible-app-v21';
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
  './js/memorize.js',
  './js/prayer.js',
  './js/reset-pw.js',
  './manifest.json',
  './icons/pat-icon-192.png',
  './icons/pat-icon-512.png',
  './icons/pat-icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
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
