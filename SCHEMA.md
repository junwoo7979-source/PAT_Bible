# PAT Bible — 가족 초대 기반 로그인 스키마 (v2)

> **작성일**: 2026-07-13
> **목적**: 교회코드→가족선택→비밀번호 3단계 인증을 폐기하고, **가족 초대 기반**의 단순·안전한 구조로 전환.
> **핵심 원칙**: 각 가족방은 `families/{familyId}`로 **완전 격리**되며, 다른 가족방과 데이터 0% 공유.

---

## 1. 설계 원칙

1. **교회 개념 제거** — 최상위가 곧 가족방(`families/{familyId}`). churchCode 불필요.
2. **비밀번호 폐기** — 방장이 폰번호로 초대 → 초대받은 사람은 링크/코드로 자동 가입.
3. **완전 격리** — Firestore 보안 규칙 + 서버 검증으로 familyId 단위 접근 차단.
4. **기존 데이터 무손상** — 기존 `churches/{churchCode}/families` 는 그대로 두고 병렬 운영.
5. **초대 코드 = 조회용, userId = 신원** — 역할을 명확히 분리.

---

## 2. Firestore 컬렉션 구조

```
families/{familyId}                       ← 가족방 (최상위, 완전 격리 단위)
  │
  ├── (문서 필드 = metadata)
  │   ├── familyName      : string        가족방 이름 (예: "예운이네 말씀방")
  │   ├── creatorUserId   : string        방장 userId (최초 생성자)
  │   ├── creatorName     : string        방장 표시 이름
  │   ├── inviteCode      : string        초대 코드 (8자, 폰 없을 때 백업용, 유니크)
  │   ├── memberIds       : string[]      활성 멤버 userId 배열 (보안 규칙 조회용)
  │   ├── memberCount     : number        활성 멤버 수 (캐시)
  │   ├── authVersion     : number        2 (신규 초대 기반 구조 표식)
  │   ├── createdAt       : timestamp
  │   └── updatedAt       : timestamp
  │
  ├── members/{userId}                    ← 멤버 서브컬렉션
  │   ├── userId          : string        고유 사용자 ID (구글 uid 또는 phone 해시)
  │   ├── name            : string        표시 이름
  │   ├── phoneNumber     : string        폰번호 (초대 매칭 기준, 해시 저장 권장)
  │   ├── role            : string        "creator" | "member"
  │   ├── status          : string        "active" | "invited" | "declined"
  │   ├── joinedAt        : timestamp
  │   └── deviceId        : string        기기 식별(기존 호환)
  │
  ├── invites/{inviteId}                  ← 초대 대기 목록
  │   ├── phoneNumber     : string        초대 대상 폰번호
  │   ├── inviterUserId   : string        초대한 사람
  │   ├── inviteToken     : string        1회용 토큰 (수락 시 폐기)
  │   ├── status          : string        "pending" | "accepted" | "expired"
  │   ├── createdAt       : timestamp
  │   └── expiresAt       : timestamp     7일 유효
  │
  └── records/{recordId}                  ← 암송/기도/미션 수행 기록
      └── (기존 records 구조 재사용 — 절대 삭제 금지)


phoneIndex/{phoneHash}                    ← 폰번호 → familyId 역인덱스 (로그인용)
  ├── userId            : string
  ├── familyId          : string
  └── updatedAt         : timestamp
```

### 🔑 핵심 인덱스 설계 이유

| 컬렉션 | 목적 | 조회 패턴 |
|--------|------|-----------|
| `families/{familyId}` | 가족방 본체 | familyId 다이렉트 조회 (O(1)) |
| `families.inviteCode` | 초대 코드로 가족방 찾기 | `where('inviteCode','==',code)` |
| `families.memberIds` | 보안 규칙 멤버십 검증 | `array-contains userId` |
| `phoneIndex/{phoneHash}` | 폰번호로 내 가족방 찾기 | phoneHash 다이렉트 (로그인) |

---

## 3. 보안 모델

### Firestore 보안 규칙 (배포 예정)
```javascript
match /families/{familyId} {
  function isMember() {
    return request.auth != null &&
           request.auth.uid in resource.data.memberIds;
  }
  function isCreator() {
    return request.auth != null &&
           resource.data.creatorUserId == request.auth.uid;
  }

  // 가족방 본체: 멤버만 읽기, 방장만 메타 수정
  allow read: if isMember();
  allow update: if isCreator();

  // 하위 컬렉션: 멤버만 접근
  match /{sub}/{docId} {
    allow read, write: if get(/databases/$(database)/documents/families/$(familyId)).data.memberIds.hasAny([request.auth.uid]);
  }
}
```

**결과**: 가족A 멤버는 가족A 데이터만, 가족B는 100% 차단.

> 현 단계(Sprint 1)에서는 Cloud Functions REST API + 서버 검증으로 격리하며,
> Firestore 보안 규칙은 인증(Auth) 통합 완료 후 Sprint 3에서 적용한다.

---

## 4. 초대·로그인 플로우

### A. 방장 가족방 생성
```
방장이 앱에서 "가족방 만들기"
→ familyName + creatorName + phoneNumber 입력
→ createFamily API
→ familyId 생성 + inviteCode 발급 + phoneIndex 등록
→ 방장은 creator 멤버로 자동 등록
```

### B. 멤버 초대
```
방장이 "가족 초대" → 폰번호 입력(여러 명 가능)
→ inviteMembers API
→ 각 폰번호마다 invites/{inviteId} 생성 (pending)
→ (선택) SMS/카톡으로 초대 링크 발송
   링크: https://pat-bible-app.web.app/?join={familyId}&token={inviteToken}
```

### C. 초대 수락
```
초대받은 사람이 링크 클릭 or inviteCode 입력
→ acceptInvite API (familyId + token + name + phoneNumber)
→ 토큰 검증 → members/{userId} 추가(active) → memberIds 갱신
→ phoneIndex 등록 → 자동 가족방 진입
```

### D. 재로그인 (기기 변경 등)
```
사용자가 폰번호 입력
→ loginWithPhone API
→ phoneIndex/{phoneHash} 조회 → familyId 확인
→ 해당 가족방 반환 → 자동 진입
```

---

## 5. 기존 시스템과의 관계

| 구분 | 기존 (v1) | 신규 (v2) | 관계 |
|------|-----------|-----------|------|
| 경로 | `churches/{code}/families/{id}` | `families/{id}` | 완전 분리 |
| 인증 | churchCode + password | 폰번호 초대 | 병렬 운영 |
| 마이그레이션 | — | Sprint 3에서 선택적 이전 | 데이터 보존 |

> **Sprint 1~2 동안 두 시스템 병렬 운영. 기존 사용자 영향 0.**

---

## 6. Cloud Functions API 시그니처 (Sprint 1)

### 6.1 `createFamily` — 가족방 생성 (방장)
```
POST /createFamily
Request:  { familyName, creatorName, phoneNumber }
Response: { ok: true, familyId, inviteCode, userId }
Errors:   400 (필수값 누락), 500
검증:
  - familyName: 필수, 1~30자
  - creatorName: 필수, 1~20자
  - phoneNumber: 필수, 정규화(숫자만) 후 해시
동작:
  - inviteCode 유니크 생성 (충돌 시 최대 5회 재시도)
  - families/{familyId} 문서 생성 (authVersion:2)
  - members/{userId} 방장 등록 (role:creator, status:active)
  - phoneIndex/{phoneHash} 등록
```

### 6.2 `inviteMembers` — 멤버 초대 (방장)
```
POST /inviteMembers
Request:  { familyId, inviterUserId, phoneNumbers: string[] }
Response: { ok: true, invited: [{ phoneNumber, inviteToken }] }
Errors:   400, 403(방장 아님), 404(가족방 없음)
동작:
  - 각 폰번호마다 invites/{inviteId} 생성 (pending, 7일 만료)
  - 1회용 inviteToken 발급
```

### 6.3 `acceptInvite` — 초대 수락 (멤버)
```
POST /acceptInvite
Request:  { familyId, inviteToken, name, phoneNumber }
          또는 { inviteCode, name, phoneNumber }
Response: { ok: true, familyId, userId, family }
Errors:   400, 401(토큰 무효), 404, 409(이미 멤버)
동작:
  - 토큰/코드 검증
  - members/{userId} 추가 (role:member, status:active)
  - families.memberIds, memberCount 갱신
  - phoneIndex 등록
  - invites 상태 → accepted
```

### 6.4 `loginWithPhone` — 폰번호 로그인 (재접속)
```
POST /loginWithPhone
Request:  { phoneNumber }
Response: { ok: true, familyId, userId, family }  |  { ok: false, notFound: true }
Errors:   400, 500
동작:
  - phoneIndex/{phoneHash} 조회
  - familyId 있으면 가족방 반환
  - 없으면 notFound (→ 가족방 만들기 or 초대 대기 안내)
```

---

## 7. 폰번호 처리 규칙

```
정규화: "010-1234-5678" → "01012345678" (숫자만)
해시:   phoneHash = HMAC-SHA256(pepper, normalizedPhone)
저장:   원본 폰번호는 members에 저장(초대 표시용),
        phoneIndex 키는 해시(역추적 방지)
```

---

## 8. Sprint 1 완료 기준 (DoD)

- [x] SCHEMA.md 작성
- [x] API 4개 시그니처 정의 (본 문서 §6)
- [x] `createFamily` 구현 (functions/family-v2-api.js)
- [x] `inviteMembers` / `acceptInvite` / `loginWithPhone` 구현 (병행 완성)
- [x] 순수 로직 단위테스트 13/13 (tests/family-v2.test.cjs)
- [x] 전체 플로우 테스트 12/12 (tests/family-v2-flow.test.cjs)
- [x] 테스트: 가족방 생성 → familyId/inviteCode 반환 확인
- [x] 테스트: 동일 inviteCode 충돌 재시도 검증
- [x] 테스트: phoneHash 격리 검증
- [x] 테스트: ★가족방 완전 격리 (가족A 멤버 ≠ 가족B)
- [x] index.js에서 v2 API re-export (기존 시스템 무손상)

> **Sprint 1 완료.** 다음(Sprint 2): 프론트엔드 UI + 기존 churchCode 시스템과 병렬 라우팅.
> ⚠️ 아직 **배포 안 함** — 프론트 연동 및 E2E 검증 후 일괄 배포 예정.
