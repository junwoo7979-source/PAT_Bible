// PAT Bible — Firebase 설정
// ⚠️ 아래 값은 자리표시자입니다. Firebase 콘솔에서 발급받은 실제 값으로 교체하세요.
//    (docs/Firebase연동가이드.md 참고)
//
// 실제 키를 채우면 app/index.html이 클라우드(Firestore) 모드로 전환되어
// 여러 가족이 각자 분리되고, 가족 외에는 다른 가족방에 접근할 수 없습니다.

window.FIREBASE_CONFIG = {
  apiKey: "여기에_API_KEY",
  authDomain: "여기에_PROJECT.firebaseapp.com",
  projectId: "여기에_PROJECT_ID",
  storageBucket: "여기에_PROJECT.appspot.com",
  messagingSenderId: "여기에_SENDER_ID",
  appId: "여기에_APP_ID"
};

// 설정이 아직 자리표시자이면 false (앱은 로컬 모드로 동작)
window.FIREBASE_READY = !String(window.FIREBASE_CONFIG.apiKey).startsWith("여기에");
