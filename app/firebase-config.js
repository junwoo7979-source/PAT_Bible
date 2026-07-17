// PAT Bible Firebase Functions API configuration.
// Do not commit real tokens here. Inject them at deploy time or store them
// locally in the browser for a controlled test/admin device.

window.FIREBASE_CONFIG = {
  projectId: 'pat-bible-app',
  apiBase: 'https://us-central1-pat-bible-app.cloudfunctions.net',
  clientToken: '',
  adminToken: '',
};

window.FIREBASE_READY = true;

// ─────────────────────────────────────────────────────────────
// ★ 2026-07-15: 관리자 전용 Firebase Auth 클라이언트 설정.
//   여기 값(apiKey 등)은 "공개용 클라이언트 config"라 노출돼도 안전한 값이다.
//   (진짜 비밀 = 서비스 계정 키. 그건 프런트엔드에 절대 넣지 않는다.)
//
//   ⚠️ 이 앱은 빌드 스텝이 없는 정적 호스팅이라 환경변수 치환이 안 된다.
//      → Firebase Console → 프로젝트 설정 → '내 앱'(웹 앱)에서 config를 복사해
//        아래 빈 칸을 채워 커밋한다. 값이 비어 있으면 관리자 로그인은
//        "아직 설정되지 않았습니다"로 안전하게 비활성 상태가 된다.
//   (문서용 키 목록은 저장소 루트의 .env.example 참고)
// ★ 2026-07-18: Firebase Console 웹 앱(Church Bible Challenge) config 반영 — 관리자 로그인 활성화
window.FIREBASE_CLIENT_CONFIG = {
  apiKey: 'AIzaSyCwK4oTQGaTIKsWJrXGaP2w_gS30gFiZrY',
  authDomain: 'pat-bible-app.firebaseapp.com',
  projectId: 'pat-bible-app',
  storageBucket: 'pat-bible-app.firebasestorage.app',
  messagingSenderId: '353821133805',
  appId: '1:353821133805:web:54ace8b33ec90e3aee35e4',
};
