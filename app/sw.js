// PAT Bible — Service Worker (v176) — 무캐시 패스스루(no-cache passthrough)
// ──────────────────────────────────────────────────────────────
// 목적: PWA "홈화면 설치" 조건을 충족시키기 위한 최소 서비스워커.
//   Android Chrome의 설치 가능(installable) 판정 = HTTPS + 유효한 manifest
//   + "fetch 이벤트 핸들러를 가진 등록된 SW". 이 SW가 그 fetch 핸들러를 제공한다.
//   (이 조건이 충족돼야 beforeinstallprompt 이벤트가 발생 → 설치 버튼/팝업 동작)
//
// ⚠️ 캐시 정책: 아무것도 캐시하지 않는다.
//   - 옛 index.html / 옛 JS 잔존으로 기기마다 화면이 달라지던 데드락을 원천 차단.
//   - JS 버전관리는 기존처럼 index.html 의 ?v=NNN 쿼리로 한다(항상 네트워크 최신).
//
// ⚠️ 데이터 안전: 이 SW는 localStorage / IndexedDB / Firestore 에 절대 접근하지 않는다.
//   → 로그인·가족방·구역방·미션 수행 기록·일/주/월 데이터는 전혀 영향받지 않는다.

self.addEventListener('install', function() {
  self.skipWaiting();           // 대기 없이 즉시 활성화
});

self.addEventListener('activate', function(event) {
  event.waitUntil((async function() {
    // 혹시 남아있는 옛 캐시가 있으면 정리(무캐시 정책 일관성)
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(function(k){ return caches.delete(k); }));
    } catch (e) {}
    try { await self.clients.claim(); } catch (e) {}
  })());
});

self.addEventListener('fetch', function(event) {
  // 네비게이션 요청은 명시적으로 네트워크 응답 + 오프라인 폴백 메시지.
  // (설치조건에서 요구하는 '동작하는 fetch 핸들러'를 확실히 보증)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(
          '<meta charset="utf-8"><body style="font-family:sans-serif;padding:24px;text-align:center;color:#333">' +
          '오프라인 상태입니다.<br>인터넷 연결 후 다시 열어주세요.</body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
    return;
  }
  // 그 외 요청(스크립트/이미지/API 등)은 개입하지 않음 → 브라우저 기본 네트워크(캐시 없음)
});
