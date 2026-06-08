// PAT Bible — Cloud Firestore 설정
// GCP 프로젝트: pat-bible-app | Firestore: asia-northeast3 (서울)
// Firebase SDK 없이 REST API 직접 사용

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCsENXeyM9uMRCPZ7c9IQPtPXq31jb6wHM",
  projectId: "pat-bible-app",
};

// 설정이 자리표시자가 아니면 클라우드 모드 활성화
window.FIREBASE_READY = !String(window.FIREBASE_CONFIG.apiKey).startsWith("여기에");
