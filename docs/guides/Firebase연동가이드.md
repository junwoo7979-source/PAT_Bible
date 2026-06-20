# PAT Bible — Firebase 연동 가이드

> 목표: 여러 가족이 각자 분리되어, **가족 외 누구도 다른 가족방에 접근 불가**
> 실제 클라우드 연동은 회원님의 Google 계정으로 Firebase 프로젝트를 만들어야 합니다.

---

## 0. 현재 상태 (앱 자체 잠금 — 이미 적용됨)
- 가족이 **가족 비밀번호를 설정하면**, 그 이후엔 **공용 교회 코드(11111)로도 그 가족방에 입장 불가**
- 즉 가족 비밀번호를 아는 가족만 입장 → 앱 수준의 1차 차단 완료
- 단, 진짜 "여러 기기·여러 가족 분리"는 아래 Firebase 연동이 필요

---

## 1. Firebase 프로젝트 만들기 (회원님이 1회)
1. https://console.firebase.google.com 접속 → Google 로그인
2. **프로젝트 추가** → 이름 `pat-bible` → 생성
3. 좌측 **빌드 → Firestore Database** → **데이터베이스 만들기**
   - 위치: asia-northeast3 (서울) 권장
   - 모드: **프로덕션 모드**로 시작
4. 좌측 **빌드 → Authentication** → **시작하기**
   - 로그인 방법: **익명(Anonymous)** 사용 설정 (가장 간단)
   - (선택) 이메일/비밀번호도 추가 가능

## 2. 웹 앱 등록 → 설정값 복사
1. 프로젝트 개요 옆 **⚙️ → 프로젝트 설정**
2. 하단 **내 앱 → 웹(</>)** 추가 → 앱 닉네임 `pat-web` 등록
3. 표시되는 `firebaseConfig` 값(apiKey 등)을 복사
4. `app/firebase-config.js` 의 자리표시자를 **복사한 값으로 교체**

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "pat-bible.firebaseapp.com",
  projectId: "pat-bible",
  storageBucket: "pat-bible.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcd..."
};
```

## 3. 보안 규칙 적용 (가족 외 접근 차단의 핵심)
1. Firebase 콘솔 → **Firestore → 규칙** 탭
2. `database/firestore.rules` 파일 내용을 **전체 복사 → 붙여넣기 → 게시**
3. 이 규칙이 "가족 구성원(memberUids)만 그 가족방·기록 접근" 을 **서버에서 강제**합니다
   - 다른 가족·외부인은 데이터를 읽을 수조차 없음

## 4. 동작 방식 (연동 후)
```
교회 코드로 교회 확인 → 익명 로그인(uid 발급)
  → 가족방 생성(대표) / 가족 비밀번호로 가족방 참여
  → 본인이 memberUids에 포함된 가족방만 접근 가능
  → 보안 규칙이 가족 외 접근을 서버에서 차단
```

## 5. 배포 (선택)
- Firebase Hosting 또는 Vercel에 `app/` 업로드 → `https://...` 주소로 어디서든 사용
- HTTPS 환경이므로 마이크(STT)도 정상 작동

---

## 체크리스트
- [ ] Firebase 프로젝트 생성
- [ ] Firestore + Authentication(익명) 활성화
- [ ] 웹앱 등록 후 firebase-config.js에 키 입력
- [ ] firestore.rules 콘솔에 게시
- [ ] (선택) Hosting 배포

> 키 입력과 규칙 게시까지 끝나면 알려주세요. 앱의 Firestore 연동 코드 결선과 테스트를 이어서 진행하겠습니다.

---

*PAT Bible · Firebase 연동 가이드 · 세광교회 디지털 사역*
