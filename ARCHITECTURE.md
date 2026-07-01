# PAT Bible — 아키텍처 설계 문서 (v1.0)

## 목차
1. [시스템 개요](#시스템-개요)
2. [데이터베이스 스키마](#데이터베이스-스키마)
3. [인증 & 로그인 흐름](#인증--로그인-흐름)
4. [보안 원칙](#보안-원칙)
5. [모듈 구조](#모듈-구조)
6. [API 명세](#api-명세)

---

## 시스템 개요

### 핵심 개념
**PAT Bible**은 **다중 교회 지원**이 필요한 성경 암송 앱입니다.
- **교회(Church)**: 여러 개의 가족방/구역방을 관리하는 상위 단위
- **방(Group)**: 가족 또는 소그룹 모임. 대표(Leader)와 구성원(Members)으로 구성
- **구성원(Member)**: 암송 기록을 남기는 최소 단위

### 사용자 타입
| 타입 | 역할 | 접근 권한 |
|------|------|----------|
| **방장(Leader)** | 방 생성, 비밀번호 설정, 구성원 관리 | 내 방의 모든 데이터 |
| **구성원(Member)** | 암송 기록 제출, 대시보드 조회 | 내 방의 공개 데이터만 |
| **관리자(Admin)** | 교회 등록, 설정 관리 | 해당 교회 전체 데이터 |

---

## 데이터베이스 스키마

### Firestore 컬렉션 구조

#### 1️⃣ Churches (교회)
```typescript
/Churches/{churchCode}
├── code: string          // 교회 고유 코드 (예: "11111", "013579")
├── name: string          // 교회 이름 (예: "세광교회")
├── adminId: string       // 관리자 ID (로그인용)
├── adminPassword: string // 해시된 관리자 비밀번호
├── appTitle: string      // 앱 타이틀 (브랜딩용)
├── createdAt: timestamp  // 생성 일시
└── config: {             // 교회 공통 설정
    verse: {
      ref: string,       // "요한복음 3:16"
      text: string,      // 본문
      weekOf: string     // "2026년 6월 1주차"
    },
    worship: {           // 예배 안내 (선택사항)
      title: string,
      content: string
    },
    parishConfig: {      // 교구/목장 설정
      term: string,      // "교구" 또는 "구역"
      groups: string[]   // ["1교구", "2교구", "3교구"]
    },
    parishTotals: {      // 교구별 전체 인원 (시상용)
      "1교구": 45,
      "2교구": 52,
      ...
    }
  }
```

#### 2️⃣ Families (가족/구역방)
```typescript
/Churches/{churchCode}/Families/{familyId}
├── id: string              // 자동 생성 ID
├── churchCode: string      // 상위 교회 코드 (조회 필터)
├── groupType: string       // "가정" | "구역"
├── roomName: string        // "김 가정" 또는 "1구역"
├── leaderName: string      // 방장 이름
├── familyPassword: string  // 입장용 비밀번호 (해시 저장)
├── parish: string          // "1교구"
├── district: string        // "목장 A"
├── members: string[]       // ["김아빠", "김엄마", "김아들", ...] — 대표가 선언한 명단
├── joinedMembers: {        // 실제 입장한 구성원들
│   "deviceId_1": { name: "김아빠", joinedAt: timestamp },
│   "deviceId_2": { name: "김엄마", joinedAt: timestamp }
│ }
├── createdAt: timestamp
└── updatedAt: timestamp
```

#### 3️⃣ Records (암송 기록)
```typescript
/Churches/{churchCode}/Records/{recordId}
├── id: string
├── churchCode: string      // 조회 필터
├── familyId: string        // 조회 필터 (방 격리)
├── groupType: string       // "가정" | "구역"
├── memberName: string      // "김아빠"
├── parish: string          // "1교구"
├── district: string        // "목장 A"
├── verseRef: string        // "요한복음 3:16"
├── submittedAt: timestamp
├── voiceScore1: number     // 음성 암송 점수
├── voiceScore2: number
├── typeScore1: number      // 타이핑 암송 점수
├── typeScore2: number
├── badge: string           // "weekly_complete", "monthly_complete" ...
└── deviceId: string        // 제출 기기 추적
```

#### 4️⃣ Prayers (기도 나눔)
```typescript
/Churches/{churchCode}/Families/{familyId}/Prayers/{dateStr}
├── date: string            // "2026-07-01"
├── entries: {
│   "memberName_1": { text: string, submittedAt: timestamp },
│   "memberName_2": { text: string, submittedAt: timestamp }
│ }
```

---

## 인증 & 로그인 흐름

### 2단계 로그인 구조

```
┌─────────────────────────────────────────────────────────┐
│                  로그인 화면 (s-login)                   │
│                                                         │
│  입력 필드: [________________] (통합 코드/비번 입력)      │
│  버튼: 입장                                              │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ 1단계: 교회 코드 검증                  │
        ├───────────────────────────────────────┤
        │ DB.church.code === "" ?                │
        │   → 교회 미선택                        │
        │   → 입력값을 교회코드로 해석 (verify) │
        │   → FetchChurchConfig()                │
        └───────────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │                                      │
    (코드 유효)                         (코드 무효)
         │                                      │
         ▼                                      ▼
    adoptChurch()                    ❌ toast('올바르지 않음')
    DB.church.code = code
         │
         ▼
    ┌───────────────────────────────────────┐
    │ 2단계: 가족 비밀번호 검증              │
    ├───────────────────────────────────────┤
    │ • 입력값 ≠ 교회코드 검증             │
    │ • findFamilyByPassword(code, pw)      │
    │ • familyId로 내 방만 스코프 필터링   │
    └───────────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │                                      │
    (구성원 이름 있음)              (새 기기 또는 첫 입장)
         │                                      │
         ▼                                      ▼
    _enterFoundFamily()          → s-family-join-manual
    localStorage 복구            → 이름 입력 & joinFamily()
         │
         ▼
    enterMemberHome()
    (대시보드 표시)
```

### 순수 함수: `loginDecision(churchCode, input)`

**목적**: 로그인 상태와 입력값을 기반으로 다음 행동을 결정

**입력**:
- `churchCode: string` — 현재 선택된 교회 코드 (없으면 '')
- `input: string` — 사용자 입력값

**반환** (action):
```typescript
type LoginAction = 
  | { action: 'NEED_CHURCH_CODE' }           // 교회 코드 필요
  | { action: 'SELECT_CHURCH', code: string }  // 교회 선택 시도
  | { action: 'NEED_FAMILY_PW' }             // 가족 비밀번호 필요
  | { action: 'REJECT_CHURCHCODE' }          // 교회코드 재입력 거부
  | { action: 'AUTH_FAMILY_PW', password: string } // 비밀번호 인증 시도
```

**로직** (login-auth.js):
```
IF churchCode === '' (교회 미선택):
  IF input === '' → NEED_CHURCH_CODE
  ELSE           → SELECT_CHURCH(input)
ELSE (교회 선택됨):
  IF input === ''           → NEED_FAMILY_PW
  IF input === churchCode   → REJECT_CHURCHCODE (보안)
  ELSE                      → AUTH_FAMILY_PW(input)
```

### 순수 함수: `resolveFamilyByPassword(families, churchCode, password, myFamilyId)`

**목적**: 비밀번호 일치 방을 찾되, **내 방만 허용** 또는 **처음이면 전역 검색**

**로직**:
```
Filter families by churchCode (교회 격리)
  IF myFamilyId exists:
    // 재입장 시 — 내 방만 검색
    Find family with id === myFamilyId AND password match
    IF found → return family (다른 방은 절대 통과 안 함)
    ELSE    → return null
  ELSE:
    // 처음 입장 시 — 전체 검색 (비밀번호 첫 회 발견)
    Find first family with matching password
    IF found → return family
    ELSE    → return null
```

**보안 효과**:
- ✅ 다른 가정의 비밀번호로는 입장 불가
- ✅ 재입장 시 내 방이 확실하게 격리됨
- ✅ 새로운 방 생성도 같은 함수로 처리 가능

---

## 보안 원칙

### ✝️ 원칙 1: 교회코드 ≠ 방 비밀번호

| 역할 | 교회코드 | 방 비밀번호 | 목적 |
|------|----------|-----------|------|
| **교회 선택** | ✅ (입장 아님) | ❌ | 교회 식별만 |
| **방 입장** | ❌ (차단) | ✅ | 유일한 인증 |

**구현**: 
- `loginDecision()`에서 `input === churchCode` 시 `REJECT_CHURCHCODE` 반환
- 오프라인 폴백도 동일 검증

### ✝️ 원칙 2: 방 격리 (familyId)

**데이터 조회 시**:
```typescript
// ❌ 나쁜 예
Records.where('churchCode', '==', code)  // 교회 내 모든 기록 노출!

// ✅ 좋은 예
Records
  .where('churchCode', '==', code)
  .where('familyId', '==', myFamilyId)   // 내 방만 필터
```

**로컬 캐시도 동일**:
- `pat_family_profile` — 현재 입장한 방의 정보만 저장
- 로그아웃 시 삭제 (다른 방 정보 보호)

### ✝️ 원칙 3: 기본 비밀번호 금지

**현상**: 새로운 방 생성 시 기본값으로 교회코드 설정 가능

**해결**:
```typescript
// family.js - openFamilyRegister()
const _pf = profile?.familyPassword;
// 기본값이 교회코드면 비운다
document.getElementById('familyPassword').value = 
  (_pf && _pf !== DB.church.code) ? _pf : '';
```

**저장 시도**:
```typescript
// saveFamilyProfileAsLeader()
if(familyPassword === DB.church.code) {
  toast('교회 코드와 다른 비밀번호를 설정하세요');
  return;
}
```

### ✝️ 원칙 4: 비밀번호 중복 방지

**문제**: 같은 교회 내 두 방이 같은 비밀번호 사용 시 혼동

**해결** (Firebase 함수 검증):
```typescript
// Cloud Functions — saveFamily()
const existing = await db
  .collection('Churches')
  .doc(churchCode)
  .collection('Families')
  .where('familyPassword', '==', hashedPassword)
  .where('id', '!=', familyId)  // 내 방 제외
  .limit(1)
  .get();

if(!existing.empty) {
  throw new Error('409: 이미 다른 방에서 쓰는 비밀번호');
}
```

---

## 모듈 구조

### 핵심 모듈

| 파일 | 책임 | 주요 함수 |
|------|------|---------|
| **login-auth.js** | 로그인 판정 (순수 함수) | `loginDecision()`, `resolveFamilyByPassword()` |
| **app-core.js** | 전역 상태 & 화면 전환 | `enterChurch()`, `adoptChurch()`, `go()` |
| **firebase-db.js** | Firebase REST API | `saveFamily()`, `findFamilyByPassword()`, `saveRecord()` |
| **family.js** | 방 관리 & UI | `openFamilyRegister()`, `saveFamilyProfileAsLeader()`, `renderMemberRows()` |
| **rooms.js** | 다중 방 관리 | `upsertRoom()`, `listMyRooms()` |

### 의존성 그래프

```
┌──────────────────────────┐
│   index.html (UI)        │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│   app-core.js (상태)     │  ← DB (전역), go() (화면 전환)
└────┬──────────┬──────────┘
     │          │
     ▼          ▼
  family.js   rooms.js      ← 방 관리
     │          │
     └────┬─────┘
          ▼
┌──────────────────────────┐
│  login-auth.js (순수)    │  ← 테스트 가능
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  firebase-db.js (API)    │  ← Cloud Functions
└──────────────────────────┘
```

---

## API 명세

### Cloud Functions 엔드포인트

#### 1️⃣ checkChurchCode
**목적**: 교회 코드 검증 (로그인 시)

**요청**:
```
GET /checkChurchCode?code=11111
```

**응답**:
```typescript
{
  ok: boolean,
  appTitle?: string,
  config?: {
    verse: { ref, text, weekOf },
    worship?: { title, content },
    parishConfig?: { term, groups }
  }
}
```

**보안**: 
- 교회 존재 확인만 (비밀번호 미포함)
- 캐시 가능 (변경 빈도 낮음)

---

#### 2️⃣ findFamily
**목적**: 가족방 비밀번호로 입장

**요청**:
```
POST /findFamily
{
  churchCode: "11111",
  familyPassword: "hashed_pw",
  familyId?: "family_id"  // 재입장 시만 송신
}
```

**응답**:
```typescript
{
  family?: {
    id: string,
    roomName: string,
    leaderName: string,
    members: string[],
    groupType: "가정" | "구역"
  }
}
```

**로직**:
- `familyId` 있으면: 내 방만 검색 (재입장 보호)
- `familyId` 없으면: 전체 검색 (처음 입장)

---

#### 3️⃣ saveFamily
**목적**: 방 정보 저장 (생성 or 수정)

**요청**:
```
POST /saveFamily
{
  churchCode: "11111",
  familyId?: "family_id",  // 있으면 수정, 없으면 생성
  roomName: "김 가정",
  leaderName: "김아빠",
  parish: "1교구",
  district: "목장 A",
  familyPassword: "hashed_pw",
  members: ["김아빠", "김엄마", "김아들"],
  groupType: "가정"
}
```

**응답**:
```typescript
{
  familyId: string,  // 신규 생성 시 반환
  ok: boolean
}
```

**서버 검증**:
- ✅ familyPassword 해싱 검증
- ✅ 중복 비밀번호 확인 (다른 방 비교)
- ✅ 교회코드 !== familyPassword 검증

---

#### 4️⃣ saveRecord
**목적**: 암송 기록 저장

**요청**:
```
POST /saveRecord
{
  churchCode: "11111",
  familyId: "family_id",      // 방 격리
  groupType: "가정",
  memberName: "김아빠",
  parish: "1교구",
  district: "목장 A",
  leaderName: "김아빠",
  verseRef: "요한복음 3:16",
  voiceScore1: 85,
  voiceScore2: 90,
  typeScore1: 100,
  typeScore2: 100,
  badge: "weekly_complete"
}
```

**보안**: 
- familyId 필수 (방 격리)
- deviceId 자동 추적 (기기별 중복 제출 방지)
- add-only (기존 기록 덮어쓰기 금지)

---

## 오프라인 폴백

**현상**: 네트워크 끊김 시 Firebase 요청 실패

**해결**:
1. localStorage에 마지막 로그인 정보 캐시
2. 오프라인 모드에서 로컬 데이터만 사용
3. 온라인 복구 시 서버와 동기화

**코드** (app-core.js):
```typescript
async function enterChurch() {
  // ... 서버 검증 ...
  
  if(!PAT_DB.ready()) {
    // 오프라인 폴백
    const profile = loadFamilyProfile();
    if(profile && profile.familyPassword === pw && pw !== DB.church.code) {
      enterMemberHome();  // 로컬 데이터로 진행
      return;
    }
  }
}
```

---

## 확장 포인트

### 🔮 추가 기능 (미래 계획)
1. **다중 방 소속** (현재 진행 중)
   - localStorage에 여러 familyId 보관
   - UI에서 방 전환 기능

2. **QR 코드 입장** (Phase 2)
   - QR → `{churchCode}:{familyPassword}` 디코딩
   - 타이핑 제거

3. **토큰 기반 인증** (Phase 3)
   - JWT 토큰으로 세션 관리
   - 로그아웃 시 토큰 무효화

4. **소셜 로그인** (Phase 4)
   - Google/Kakao 통합
   - 개인 프로필 연동

---

## 용어 정의

| 용어 | 의미 | 예시 |
|------|------|------|
| **Church** | 교회 조직 | 세광교회 (code: 013579) |
| **Family** | 가족방 또는 구역방 | 김 가정, 1구역 |
| **Group** | Family와 동의 (일반 명칭) | - |
| **Member** | 방의 구성원 | 김아빠, 김엄마 |
| **Device** | 사용자 기기 | iPhone, 안드로이드폰 |
| **Record** | 암송 기록 (한 건) | 2026-07-01 요한복음 3:16 |
| **Parish** | 교구/목장 | 1교구, 2교구, 블레싱 |
| **District** | 세부 구역 | 목장 A, 목장 B |

---

## 참고 자료

- **Firebase Firestore 문서**: https://firebase.google.com/docs/firestore
- **PAT Bible GitHub**: https://github.com/junwoo7979-source/PAT_Bible
- **Cloud Functions 배포**: `firebase deploy --only functions`

