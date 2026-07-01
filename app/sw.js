// PAT Bible — Self-destructing Service Worker  (v131)
// ──────────────────────────────────────────────────────────────
// 목적: 과거 버전에서 설치된 "옛 서비스워커"가 옛 index.html / 옛 JS 를
//   캐시로 계속 제공해, 기기마다 화면(달성률 만점 2 vs 3 등)이 달라지는
//   데드락을 깨기 위한 자기파괴 SW.
//
// 동작: 이 sw.js 가 (옛 SW의 자동 업데이트 체크로) 설치되는 즉시
//   ① 모든 캐시 삭제 ② 제어 중인 모든 탭을 강제 새로고침
//   ③ 자기 자신을 등록 해제(unregister).
//   → 새로고침된 탭은 SW 없이 서버에서 최신 index.html + 최신 JS(?v=) 를 받는다.
//
// 앱은 더 이상 SW 캐싱을 쓰지 않는다. JS 버전 관리는 index.html 의 ?v= 쿼리로 한다.
// (오프라인 캐싱 미사용 — TWA/온라인 사용 전제)

self.addEventListener('install', () => {
  // 대기 없이 즉시 활성화
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // ① 모든 캐시 삭제 (옛 index.html/JS 잔존 제거)
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}

    // ② 모든 클라이언트 제어권 확보
    try { await self.clients.claim(); } catch (e) {}

    // ③ 제어 중인 모든 탭 강제 새로고침 → 최신 파일 로드
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.navigate(client.url); } catch (e) {}
      }
    } catch (e) {}

    // ④ 자기 자신 등록 해제 → 이후 로드는 SW 없이 동작
    try { await self.registration.unregister(); } catch (e) {}
  })());
});

// 캐시 사용 안 함 — 항상 네트워크에서 최신 파일을 받는다.
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => new Response('', { status: 504, statusText: 'offline' }))
  );
});
