// PAT Bible — Firebase Functions API 설정
// 백엔드: Firebase Functions (us-central1)
// API 키 불필요 — 모든 Firestore 접근은 Functions 서버에서 처리

window.FIREBASE_CONFIG = {
  projectId: "pat-bible-app",
  apiBase: "https://us-central1-pat-bible-app.cloudfunctions.net",
};

// Functions API 항상 활성화
window.FIREBASE_READY = true;
