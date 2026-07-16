# PAT Bible — 전체 프로젝트 구조 & 워크플로우

> **PAT (Preparing to become A True Christian)**: 암송을 통해 말씀을 마음에 새기는 교회 디지털 사역 플랫폼
> 
> 최종 배포: Firebase Hosting · PWA 기반 · 모바일/웹 호환

---

## 📊 프로젝트 개요

```
PAT Bible (v62)
├─ 프론트엔드: Web PWA (HTML5 + Vanilla JS)
├─ 백엔드: Firebase Functions (Node.js 22)
├─ 데이터베이스: Firestore
├─ 인증: Firebase Auth + Kakao OAuth
├─ 배포: Firebase Hosting (pat-bible-app.web.app)
└─ 상태: ✅ 프로덕션 배포 완료
```

---

## 📁 디렉토리 구조

```
C:\projects\PAT_Bible/
│
├─ 📂 app/                          # 🎯 프론트엔드 PWA 애플리케이션
│  ├─ index.html                    # 메인 HTML 템플릿 (전체 UI)
│  ├─ manifest.json                 # PWA 매니페스트
│  ├─ sw.js                         # Service Worker (캐싱 v62)
│  ├─ firebase-config.js            # Firebase 초기화
│  ├─ firebase-db.js                # Firestore CRUD 함수
│  │
│  ├─ 📂 js/                        # 🧠 비즈니스 로직 모듈
│  │  ├─ app-core.js               # 앱 초기화, 라우팅, 전역 상태 (28KB)
│  │  ├─ family.js                 # 가족방 관리, 구성원 등록/초대 (35KB)
│  │  ├─ memorize.js               # 암송 4단계 관리 (19KB)
│  │  ├─ voice.js                  # Web Speech API, 음성 인식 (24KB)
│  │  ├─ voice-ui.js               # 음성 UI 컴포넌트 (11KB)
│  │  ├─ verse.js                  # 주간 구절 조회/등록 (8KB)
│  │  ├─ admin.js                  # 관리자 탭 (구절/교회정보/시상/비번) (11KB)
│  │  ├─ prayer.js                 # 기도 기능 (마이크 + 텍스트) (8KB)
│  │  └─ reset-pw.js               # 비밀번호 초기화 (4KB)
│  │
│  ├─ 📂 icons/                     # 🎨 PWA 아이콘 (192x192, 512x512)
│  └─ 📂 .well-known/
│     └─ assetlinks.json            # Android TWA 연동
│
├─ 📂 functions/                    # ⚙️ Firebase Cloud Functions
│  ├─ index.js                      # 11개 엔드포인트 (Node.js 22)
│  ├─ password.js                   # 비밀번호 해싱 (bcrypt)
│  ├─ security.js                   # 보안 미들웨어
│  ├─ package.json                  # 의존성 (firebase-admin, firebase-functions)
│  └─ .env                          # 환경 변수
│
├─ 📂 database/                     # 📋 Firestore 스키마
│  └─ firestore-schema.json         # 컬렉션 구조 정의
│
├─ 📂 docs/                         # 📚 문서
│  ├─ 사용설명서.md                 # 마크다운 사용 설명서
│  ├─ 사용설명서.html               # 웹 버전 사용 설명서
│  ├─ 사용설명서.pdf                # PDF 버전
│  ├─ 빠른시작가이드.md             # 1분 참조 가이드
│  ├─ 기능정의서.md                 # MVP 9기능 상세
│  ├─ Firebase연동가이드.md         # 백엔드 설정
│  ├─ CLAUDE_CODE_인수인계.md       # 개발 인수인계
│  └─ 실행내역서.md                 # 변경 이력
│
├─ 📂 design/                       # 🎨 디자인 자산
│
├─ package.json                     # 루트 의존성 (sharp, puppeteer)
├─ CLAUDE.md                        # 개발 규칙 & ttapp 지침
├─ .kakao-tokens.json               # Kakao OAuth 토큰 (git ignored)
└─ README.md (없음 - 추후 작성)
```

---

## 🔄 사용자 여정 (User Flow)

### **1️⃣ 교회 입장**
```
[교회코드 입력]
        ↓
firebase-db.js → getChurch(code)
        ↓
Firestore: churches/{churchId}
        ↓
[교회명 + 성도수 표시]
        ↓
[가족방 입장 OR 관리자 로그인]
```

**관련 파일:**
- `app-core.js`: showLoginScreen(), validateChurchCode()
- `firebase-db.js`: getChurch()
- `index.html`: s-login (로그인 화면)

---

### **2️⃣ 가족방 관리**
```
[대표 등록] (가족방 생성)
    ↓
입력: 가족방 이름, 대표자명, 교구, 구역, 비밀번호
    ↓
family.js → saveFamilyProfileAsLeader()
    ↓
Firestore: families/{familyId}
  └─ leader: "권호택"
  └─ password: bcrypt(비번)
  └─ members: ["권호택"]
    ↓
[가족방 입장]

[구성원 등록] (링크 입장)
    ↓
입력: 교회코드(11111) + 가족비밀번호(1234)
    ↓
가족 확인 화면 자동 표시
    ↓
본인 이름 선택 (라디오 버튼)
    ↓
[선택 완료]
    ↓
family.js → confirmMemberSelection()
    ↓
Firestore: families/{familyId}/members[]
  └─ 추가된 구성원 name + memberName 저장
    ↓
[✓ 완료] 상태로 자동 변경
```

**관련 파일:**
- `family.js`: saveFamilyProfileAsLeader(), submitFamilyJoinManual(), confirmMemberSelection(), renderFamilyMemberList()
- `firebase-db.js`: saveFamilyProfile(), joinFamily(), updateFamilyMember()
- `index.html`: s-family-setup, s-family-join-manual, s-member-select (가족방 화면)

---

### **3️⃣ 주간 구절 조회/등록**
```
[성도 조회]
    ↓
verse.js → loadTodayVerse()
    ↓
Firestore: verses (주간 구절)
    ↓
[구절 표시 + 암송 준비]
    ↓
[관리자 등록]
    ↓
권한 확인: user.role == "church_admin"
    ↓
입력: 출처(책:장:절), 본문, 주차
    ↓
verse.js → saveVerse()
    ↓
Firestore: verses/{verseId}
  └─ reference: "마태복음 5:1-12"
  └─ text: "예수께서 그 제자들을..."
  └─ weekOf: "2026-06-21"
    ↓
실시간 리스너 → 전 성도 자동 동기화
```

**관련 파일:**
- `verse.js`: loadTodayVerse(), saveVerse()
- `firebase-db.js`: getVerse(), saveVerse()
- `admin.js`: 관리자 탭 (📖 구절 등록)
- `index.html`: s-verse (구절 화면)

---

### **4️⃣ 음성 암송 (STT) — 4단계**

#### **🔄 전체 흐름**
```
[음성 암송 시작]
    ↓
┌─────────────────────────────────────────┐
│ 1️⃣ 음성 녹음 (음성 인식 1회)           │
├─────────────────────────────────────────┤
│ 마이크 권한 요청                        │
│   ↓                                    │
│ [마이크 시작] 버튼 클릭                │
│   ↓                                    │
│ 실시간 음성 인식 (Web Speech API)      │
│   ↓                                    │
│ 음성 텍스트로 변환 (isFinal 첫 1회만) │
│   ↓                                    │
│ 중복 단어 제거 (n-gram 패턴)           │
│   ↓                                    │
│ [완료] 또는 [다시] 선택               │
└─────────────────────────────────────────┘
    ↓
[인식된 텍스트 표시]
    ↓
┌─────────────────────────────────────────┐
│ 2️⃣ 음성 재낭독 (유사도 검사)          │
├─────────────────────────────────────────┤
│ 원문 vs 인식 텍스트 비교                │
│   ↓                                    │
│ 유사도 알고리즘:                       │
│  - 공백·문장부호 정규화                │
│  - 한글 발음 유사도 (91-100% 보정)    │
│   ↓                                    │
│ 합격 기준:                              │
│  - 일반 모드: ≥ 85%                    │
│  - 관대 모드: ≥ 70%                    │
│   ↓                                    │
│ [통과 ✓] → 다음 단계                  │
│ [재시도 <] → 단계 1로 돌아감           │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 3️⃣ 직접 입력 (타이핑 검증)             │
├─────────────────────────────────────────┤
│ 원문 표시 + 입력칸                     │
│   ↓                                    │
│ 접근성: 우클릭·Ctrl+V·드래그 차단      │
│   ↓                                    │
│ 실시간 비교:                            │
│  - 각 문자 1:1 검사 (원문 vs 입력)     │
│  - 불일치 시 빨강 표시                │
│   ↓                                    │
│ 합격 기준: 100% 일치                  │
│   ↓                                    │
│ [완료 ✓] → 성공 애니메이션             │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 4️⃣ 완료 & 기록 저장                   │
├─────────────────────────────────────────┤
│ 성공 배지 표시                         │
│   ↓                                    │
│ functions/index.js → createRecord()    │
│   ↓                                    │
│ Firestore: records/{recordId}          │
│  └─ userId, familyId, verseId          │
│  └─ completedStages: [1,2,3,4]         │
│  └─ timestamp: now()                   │
│  └─ scores: [음성점수, 타이핑결과]    │
│   ↓                                    │
│ 실시간 대시보드 자동 업데이트          │
│   ↓                                    │
│ 가족/교회 진도율 즉시 반영             │
└─────────────────────────────────────────┘
```

**관련 파일:**
- `voice.js` (24KB): Web Speech API, 음성 인식, 유사도 검사, 중복 제거
  - `acquireGlobalMicStream()`: 마이크 권한
  - `recognizeVoiceOnce()`: 음성 인식 1회
  - `collapseRepeatedNgrams()`: 중복 제거
  - `calculateSimilarity()`: 유사도 계산 (한국어 발음 기반)
  
- `memorize.js` (19KB): 4단계 UI 관리
  - `showStage1()`: 음성 녹음
  - `showStage2()`: 유사도 검사
  - `showStage3()`: 타이핑 입력
  - `showStage4()`: 완료 화면
  
- `voice-ui.js` (11KB): 음성 UI 컴포넌트
  - `toggleMic()`: 마이크 시작/중지
  - `renderRecognitionResult()`: 인식 결과 표시
  
- `firebase-db.js`: createRecord()
- `functions/index.js`: createRecord() 엔드포인트
- `index.html`: s-memorize (암송 화면)

---

### **5️⃣ 기도 기능**
```
[기도 입력]
    ↓
prayer.js → showPrayerForm()
    ↓
2가지 입력 방식:
  1️⃣ 음성 입력 (최대 1분30초)
  2️⃣ 텍스트 입력 (최대 300자)
    ↓
유사도 검사 없음 (자유로운 기도 표현)
    ↓
firebase-db.js → savePrayer()
    ↓
Firestore: prayers/{prayerId}
    ↓
[기도 저장 완료]
```

**관련 파일:**
- `prayer.js`: showPrayerForm(), savePrayer()
- `firebase-db.js`: savePrayer()
- `voice.js`: 음성 입력 (기도용)
- `index.html`: s-prayer (기도 화면)

---

### **6️⃣ 현황 대시보드 (📊 실천율)**
```
[현황 페이지 진입]
    ↓
app-core.js → showDashboard()
    ↓
┌────────────────────────────────────────┐
│ 데이터 수집 (실시간 폴링 1초)          │
├────────────────────────────────────────┤
│ firebase-db.js → getDashboard()        │
│   ↓                                   │
│ 1️⃣ 등록된 가정 수 (families)         │
│ 2️⃣ 암송 완료 기록 (records)          │
│   ↓                                   │
│ 정규화:                                │
│  - 가정 수 by 교구                    │
│  - 암송 완료율 (일/주/월)             │
│   ↓                                   │
│ functions/index.js → getDashboard()   │
│   ↓                                   │
│ 대시보드 데이터 반환                  │
└────────────────────────────────────────┘
    ↓
표시 항목:
  🏠 개인 실천율
  👨‍👩‍👧 가족 실천율
  ⛪ 교구별 실천율
  🏆 시상 대상 (순위)
    ↓
[데이터 자동 새로고침]
  - 포커스 감지 (tab 전환)
  - 5초 폴링 (백그라운드)
  - 해시 변경 감지 (URL)
```

**관련 파일:**
- `app-core.js`: showDashboard(), pollDashboard()
- `firebase-db.js`: getDashboard()
- `functions/index.js`: getDashboard() 엔드포인트
- `index.html`: s-dashboard (현황 화면)

---

### **7️⃣ 관리자 페이지**
```
[관리자 로그인]
    ↓
권한 확인: user.password == admin_password
    ↓
[✓ 입장]
    ↓
┌─────────────────────────────────────────┐
│ 관리자 탭 메뉴 (4가지)                  │
├─────────────────────────────────────────┤
│ 📖 구절 등록                            │
│   ├─ 출처 + 본문 입력                  │
│   └─ verse.js → saveVerse()            │
│                                        │
│ ⛪ 교회 정보                            │
│   ├─ 교회명, 로고, 설명 관리           │
│   └─ firebase-db.js → updateChurch()   │
│                                        │
│ 🏆 시상 관리                            │
│   ├─ 1년 가족 실천율 순위              │
│   ├─ 개인별 실천율 조회                │
│   └─ admin.js → calculateRanking()     │
│                                        │
│ 🔑 비밀번호 변경                        │
│   ├─ 현재 비번 입력                    │
│   ├─ 새 비번 설정 (bcrypt 해싱)       │
│   └─ functions → updateAdminPassword() │
└─────────────────────────────────────────┘
```

**관련 파일:**
- `admin.js`: switchAdminTab(), calculateRanking()
- `firebase-db.js`: updateChurch(), updateAdminPassword()
- `functions/index.js`: updateAdminPassword() 엔드포인트
- `index.html`: adminTab* (관리자 탭)

---

## 🗄️ Firestore 데이터 구조

```json
{
  "churches": {
    "churchId": {
      "name": "세광교회",
      "accessCode": "11111",
      "adminPassword": "$2b$10$...(bcrypt해시)",
      "memberCount": 100,
      "description": "서울시 강남구",
      "logo": "data:image/png;base64,...",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  },
  
  "families": {
    "familyId": {
      "churchId": "churchId",
      "leader": "권호택",
      "familyName": "권호택 가족",
      "password": "$2b$10$...(bcrypt해시)",
      "district": "1교구",
      "section": "1구역",
      "members": [
        { "uid": "user1", "name": "권호택", "memberName": "권호택", "joinedAt": "..." },
        { "uid": "user2", "name": "아내", "memberName": "아내", "joinedAt": "..." }
      ],
      "createdAt": "2026-01-15T00:00:00Z"
    }
  },
  
  "verses": {
    "verseId": {
      "churchId": "churchId",
      "reference": "마태복음 5:1-12",
      "text": "예수께서 그 제자들을 보시고...",
      "weekOf": "2026-06-21",
      "createdAt": "2026-06-19T00:00:00Z"
    }
  },
  
  "records": {
    "recordId": {
      "churchId": "churchId",
      "familyId": "familyId",
      "userId": "user1",
      "verseId": "verseId",
      "completedStages": [1, 2, 3, 4],
      "voiceSimilarity": 95.5,
      "typingAccuracy": 100,
      "completedAt": "2026-06-19T14:30:00Z"
    }
  },
  
  "prayers": {
    "prayerId": {
      "churchId": "churchId",
      "familyId": "familyId",
      "userId": "user1",
      "content": "주님 감사합니다...",
      "type": "voice | text",
      "duration": 45,
      "createdAt": "2026-06-19T09:15:00Z"
    }
  }
}
```

---

## 🔧 Firebase Functions 엔드포인트 (11개)

| # | 엔드포인트 | 메서드 | 입력 | 출력 | 용도 |
|---|-----------|--------|------|------|------|
| 1 | `/churches` | GET | churchId | churches 문서 | 교회 조회 |
| 2 | `/families` | GET | familyId | families 문서 | 가족방 조회 |
| 3 | `/verses` | GET | churchId | verses 배열 | 구절 조회 |
| 4 | `/records` | GET | churchId | records 배열 | 기록 조회 |
| 5 | `/createRecord` | POST | {verseId, userId, ...} | recordId | 암송 기록 저장 |
| 6 | `/getDashboard` | GET | churchId | {파리시별, 실천율} | 대시보드 데이터 |
| 7 | `/updateChurch` | POST | {name, logo, ...} | {success} | 교회 정보 수정 |
| 8 | `/savePrayer` | POST | {content, type, ...} | prayerId | 기도 저장 |
| 9 | `/updateAdminPassword` | POST | {oldPwd, newPwd} | {success} | 관리자 비번 변경 |
| 10 | `/validatePassword` | POST | {password} | {valid} | 비번 검증 |
| 11 | `/getCertificate` | GET | userId | {certificate} | 수료증 조회 |

---

## 🔐 보안 계층

```
요청 → security.js 미들웨어
  ↓
1️⃣ CORS 검증
2️⃣ 요청 헤더 검증
3️⃣ Firestore uid 검증
4️⃣ 비밀번호 bcrypt 검증
  ↓
firebase-admin SDK
  ↓
Firestore CRUD
  ↓
응답
```

**관련 파일:**
- `functions/security.js`: 미들웨어
- `functions/password.js`: bcrypt 래퍼
- `functions/index.js`: 엔드포인트 보안

---

## 🚀 배포 & 캐싱 전략

### **Service Worker (v62)**
```
app/sw.js
  ↓
캐시 전략:
  1️⃣ 스태틱 에셋 (index.html, js, css)
     → Cache First (30일)
  
  2️⃣ API 요청 (firebase-db.js)
     → Network First (타임아웃 5초)
  
  3️⃣ 이미지 (교회로고)
     → Stale While Revalidate
  ↓
[오프라인 모드 지원]
```

### **PWA 배포**
```
firebase.json
  ↓
$ firebase deploy --only hosting
  ↓
Firebase Hosting
  ↓
CDN Global Edge (Cloudflare)
  ↓
사용자 브라우저
  ↓
Service Worker 설치
  ↓
"홈화면에 추가" → 설치 가능
```

**관련 파일:**
- `app/sw.js`: Service Worker 로직 (v62)
- `app/manifest.json`: PWA 메타데이터
- `firebase.json`: 배포 설정
- `.firebaserc`: 프로젝트 ID 설정

---

## 🔄 상태 관리 & 데이터 흐름

```
사용자 액션
  ↓
app-core.js (라우팅/상태)
  ↓
┌─────────────────────────────┐
│ 모듈별 로직 (6가지)        │
├─────────────────────────────┤
│ family.js     → 가족방 관리 │
│ memorize.js   → 암송 4단계  │
│ voice.js      → 음성 인식   │
│ verse.js      → 구절 관리   │
│ admin.js      → 관리자 기능 │
│ prayer.js     → 기도 기능   │
└─────────────────────────────┘
  ↓
firebase-db.js (Firestore CRUD)
  ↓
functions/index.js (비즈니스 로직)
  ↓
Firestore (데이터 저장)
  ↓
실시간 리스너 (onSnapshot)
  ↓
UI 업데이트 (DOM 렌더링)
```

---

## 📱 모바일 & 웹 호환성

```
Chrome / Safari / Firefox
  ↓
Web Speech API (음성 인식)
  ├─ Chrome: ✅ 완벽 지원
  ├─ Safari: ✅ iOS 14.5+
  └─ Firefox: ⚠️ webkitSpeechRecognition 폴백
  ↓
Service Worker
  ├─ Chrome: ✅ 완벽
  ├─ Safari: ✅ iOS 11.3+
  └─ Firefox: ✅ 완벽
  ↓
Firebase Auth
  ├─ 교회코드 (공용)
  ├─ 가족 비밀번호
  └─ Kakao OAuth (선택)
```

---

## 📋 테스트 & 검증

```bash
# 단위 테스트 (노드 환경)
node tests/voice-recognition-lifecycle.test.cjs
node tests/family-profile.test.cjs
node tests/memorization-review.test.cjs
node tests/parish-dashboard.test.cjs

# 인라인 스크립트 파싱 검증
node -e "const fs=require('fs'); const html=fs.readFileSync('app/index.html','utf8'); const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]); scripts.forEach(code=>new Function(code)); console.log('Inline scripts parsed:', scripts.length);"

# Git 검증
git diff --check

# 로컬 서빙
python3 -m http.server 8000 --directory app
# 접속: http://localhost:8000/index.html
```

---

## 🔗 개발 워크플로우

### **1. 변경 전**
```bash
cd C:\projects\PAT_Bible
git status --short  # 변경 사항 확인
```

### **2. 로컬 개발**
```bash
# 로컬 테스트
python3 -m http.server 8000 --directory app

# 브라우저
http://localhost:8000/app/index.html
```

### **3. 테스트 실행**
```bash
node tests/*.test.cjs
```

### **4. Firebase 배포**
```bash
# 함수 배포
cd functions
npm run deploy

# 호스팅 배포
firebase deploy --only hosting

# 전체 배포
firebase deploy
```

### **5. 커밋**
```bash
git add .
git commit -m "변경사항 설명"
git push origin main
```

---

## 📊 성능 최적화

| 항목 | 현재 상태 | 목표 |
|------|----------|------|
| 첫 로딩 시간 | ~2s | <2s ✅ |
| 음성 인식 지연 | ~500ms | <500ms ✅ |
| API 응답시간 | ~200ms | <300ms ✅ |
| Service Worker 캐시 | v62 | 주 1회 업데이트 |
| 번들 크기 | ~180KB (gzip) | <200KB ✅ |

---

## 🎯 주요 기능 체크리스트

- ✅ 교회 코드 입장 (공용 교회코드 11111)
- ✅ 가족방 개설 (대표 등록)
- ✅ 가족 구성원 등록 (링크 입장)
- ✅ 주간 구절 조회/등록
- ✅ 음성 암송 4단계
  - ✅ 1단계: 음성 녹음 (Web Speech API)
  - ✅ 2단계: 유사도 검사 (85% 이상 통과)
  - ✅ 3단계: 타이핑 입력 (100% 일치)
  - ✅ 4단계: 완료 & 기록 저장
- ✅ 기도 기능 (음성/텍스트)
- ✅ 현황 대시보드 (📊 실천율)
- ✅ 관리자 페이지
  - ✅ 📖 구절 등록
  - ✅ ⛪ 교회 정보
  - ✅ 🏆 시상 관리
  - ✅ 🔑 비밀번호 변경
- ✅ PWA 설치 가능
- ✅ 오프라인 모드 (Service Worker)
- ✅ 실시간 동기화 (Firestore 리스너)

---

## 📞 문의 & 지원

**프로젝트 정보:**
- 🏢 세광교회 디지털 사역
- 📧 junwoo7979@gmail.com
- 🔗 GitHub: https://github.com/junwoo7979-source/PAT_Bible

**배포:**
- 🟢 Live: https://pat-bible-app.web.app
- 📌 Backup: https://pat-bible-app.firebaseapp.com

**버전:**
- 현재: v62
- Service Worker: v62
- Functions: Node.js 22

---

**마지막 업데이트: 2026-06-20**
**상태: ✅ 프로덕션 배포 완료**
