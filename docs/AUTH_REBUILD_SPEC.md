# PAT Bible 인증 재구축 SPEC (AUTH_REBUILD_SPEC)

> 원 지시: 일반 사용자 로그인 페이지에서 관리자 모드를 완전히 분리해 관리자 페이지를 별도 구성한다.
> 회원가입 페이지 디자인은 간략하게 구성한다. 아이디는 이메일 등록으로 한다.
> 이메일을 등록하면 가족방 페이지로 이동하여 가족 등록하고 비번을 생성한다.
> 가족 초대 링크로 가족방이 이루어지는 것은 현재 로직과 동일하다.
> 가족은 가족 비번으로 로그인하면 가족 페이지를 공유할 수 있으며 다른 가족방과는 확실하게 분리 관리된다.
> 비번은 특수문자+영문+숫자 포함 8자 이상으로 한다. (※ 본 SPEC §6.2는 최소 10자로 상향 — SPEC 우선)
> 기존 로직과 틀은 변하면 안 되며 안전하게 진행해야 한다. 디자인은 깔끔하게 한다.

## 0. 이 문서의 사용 방법 (Claude Code 실행 지침)

이 문서를 프로젝트에 docs/AUTH_REBUILD_SPEC.md로 저장하고, 한 세션에 전체를 구현하려 하지 말 것.

실행 규칙:

```
1. 이 SPEC 전체를 먼저 읽는다.
2. §36 구현 순서의 단계를 하나씩 수행한다.
3. 각 단계 완료 시: 테스트 통과 확인 → Git 커밋 (메시지: "auth-rebuild step N: 내용") → 단계 보고.
4. 1~2단계(분석 + 회귀 테스트) 완료 후에는 반드시 분석 보고서를 제출하고
   사용자 승인을 받은 뒤 3단계 이후를 진행한다.
5. 실제 코드가 이 SPEC의 가정과 다르면, 임의로 진행하지 말고 차이점과
   대안을 보고한 뒤 지시를 기다린다.
6. 한 단계의 테스트가 실패한 상태로 다음 단계로 넘어가지 않는다.
```

이번 작업은 화면만 변경하는 작업이 아니다. 인증, 세션, 라우팅, 사용자 컨텍스트, 가족 연결, 초대, 관리자 권한, Firestore Rules, Cloud Functions, 서비스 워커를 함께 점검하고 안정화하는 작업이다.

## 1. 작업 목적

현재 PAT Bible 프로젝트의 기존 가족방·구성원·수행 기록·기도·미션·통계 데이터를 그대로 보존하면서 다음을 완료하라.

- 일반 사용자 로그인 화면을 이메일 계정 중심으로 단순화한다.
- 교회 코드, 가족 코드, 가족 공용 비밀번호를 사용하는 기존 반복 로그인 방식을 제거한다.
- 가족방 가입은 안전한 초대 토큰으로만 처리한다.
- 관리자 페이지를 일반 사용자 화면과 완전히 분리한다.
- Firebase Authentication 세션 복원과 라우팅을 단일화한다.
- 로그인 성공 후 다시 로그인 화면으로 돌아가는 오류를 제거한다.
- 새로고침, 브라우저 재실행, 여러 탭, PWA 업데이트에서도 로그인 상태가 안정적으로 유지되게 한다.
- 일반 사용자가 다른 가족 데이터나 관리자 데이터에 접근할 수 없게 한다.
- 기존 데이터가 삭제·초기화·중복 생성되지 않도록 한다.
- 수정 전후 테스트와 데이터 비교 결과를 제출한다.

## 2. 현재 프로젝트 환경

프로젝트 경로: `C:\projects\PAT_Bible`

기술 구조: Vanilla JavaScript 기반 PWA / Firebase Authentication / Cloud Firestore / Firebase Cloud Functions / Firebase Hosting / Hash Router / Service Worker

이 프로젝트는 Next.js, Supabase, PostgreSQL, SQL RLS를 사용하지 않는다. PostgreSQL/Supabase용 구조를 그대로 적용하지 말고 Firebase 환경에 맞게 구현하라 (RLS → Firestore Security Rules, UNIQUE 인덱스 → 결정적 문서 ID 또는 Transaction 확인).

## 3. 최우선 안전 원칙

### 3.1 기존 데이터 보호

다음 데이터는 삭제하거나 초기화하지 않는다.

```
기존 가족방 / 기존 familyId / 기존 가족 구성원 / 기존 가족 프로필
기존 수행 기록 / 기존 수행 날짜와 점수 / 기존 음성·타이핑 결과
기존 기도 기록 / 기존 미션과 구절 / 기존 일별·주별·월별 통계
기존 교회·교구·구역 정보 / 기존 앱 설정
```

로그인 오류를 해결한다는 이유로 다음을 하지 않는다.

```
사용자 재가입 / 가족방 삭제 후 재생성 / familyId 재발급
기존 기록 복사 후 새 문서 생성 / DB 전체 초기화
컬렉션 이름 일괄 변경 / 기존 기록 ID 변경
```

### 3.2 코드 변경 안전 원칙

작업 전에 수행:

```
현재 Git 상태·브랜치 확인 → 수정 전 커밋 생성
Firestore 백업 방법 확인 → 기존 데이터 개수 기록(§37.9 기준값)
기존 인증 테스트 실행 → 변경 대상 파일 목록 작성
```

기존 코드에 미완료 변경이 있으면 덮어쓰거나 되돌리지 않고 먼저 보고한다.

### 3.3 단계별 구현 원칙

현황 분석 → 실패 테스트 작성 → 최소 수정 → 테스트 → 결과 보고 → 다음 단계

## 4. 작업 범위 확정

### 4.1 이번 작업에서 완전 구현

```
공개: 로그인, 회원가입, 이메일 인증, 비밀번호 재설정, 초대 수락
사용자: 인증 상태 관리, 온보딩, 가족방 생성, 가족 설정 내 초대 관리
관리자: /admin/login, dashboard, users, families, invitations, audit-logs
공통: getUserContext, Firestore Rules, 서비스 워커 캐시 정책, 감사 로그
```

### 4.2 라우트·가드만 준비 (기능은 후속 작업)

```
/#/admin/missions, /#/admin/statistics, /#/admin/churches,
/#/admin/districts, /#/admin/system
```

빈 화면에 "준비 중" 표시. 라우터 가드와 권한 검증은 동일하게 적용한다. 임의로 기능을 채우지 않는다.

### 4.3 의도적 범위 제외 (누락 아님 — 재도입 금지)

```
6자리 참여 코드 가입: 제외. 가입 경로는 초대 링크만.
관리자 TOTP MFA: Step-up 재인증까지만 구현. MFA는 Identity Platform
  활성화와 함께 후속 작업. 단, 인증 검증 지점을 단일 모듈에 모아
  MFA 추가가 코드 구조 변경 없이 가능하게 설계한다.
카카오 로그인 신규 구현: 제외. 기존에 정상 구현돼 있는 경우에만 유지.
History API 라우터 전환: 제외. 해시 라우터 유지.
```

## 5. 사전 분석 (코드 수정 전 필수)

### 5.1 반드시 먼저 읽을 파일

```
CLAUDE.md / AGENTS.md / docs/WORKFLOW.md
app/js/app-core.js, login-auth.js, admin-auth.js, router.js
app/firebase-db.js, app/sw.js
functions/index.js, admin-api.js, security.js
database/firestore.rules
firebase.json, firestore.indexes.json, package.json
기존 인증·관리자·가족방·초대 테스트
```

실제 파일명이 다르면 프로젝트 전체 검색으로 대응 파일을 찾는다.

### 5.2 전체 검색 키워드

```
onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
signInWithPopup, signInWithRedirect, getRedirectResult, sendEmailVerification,
sendPasswordResetEmail, signOut, getIdToken, getIdTokenResult

location.hash, window.location, hashchange, setTimeout, location.reload, history.back

familyId, familyCode, churchCode, familyPassword, joinPassword,
pat_admin_pw, pat_admin_token, pat_admin_local, isAdmin, admin === true,
role, localStorage, sessionStorage

serviceWorker, caches.open, cache.addAll, fetch
```

### 5.3 수정 전 제출할 분석 보고서 (20개 항목)

```
1. 현재 일반 사용자 로그인 흐름          11. setTimeout 기반 라우팅 우회 코드
2. 현재 회원가입 흐름                    12. localStorage 인증·관리자 정보 저장 위치
3. 현재 이메일 인증 흐름                 13. Auth 사용자와 Firestore 사용자 문서 연결 방식
4. 현재 로그아웃 흐름                    14. 실제 Firestore 컬렉션·문서 경로
5. 현재 세션 복원 흐름                   15. Rules와 실제 데이터 경로 일치 여부
6. 현재 가족방 생성·입장 흐름            16. 서비스 워커의 인증 관련 캐시 정책
7. 현재 가족 초대 흐름                   17. 발견한 로그인 오류 원인
8. 현재 관리자 로그인 흐름               18. 발견한 데이터 손실 위험
9. onAuthStateChanged 등록 위치 전체     19. 변경 대상 파일
10. 로그인 후 리다이렉트 실행 위치 전체  20. 신규 파일 필요 여부
```

보고서 제출 후 사용자 승인을 받고 구현을 진행한다. 데이터 삭제나 대규모 마이그레이션이 필요해 보여도 즉시 실행하지 말고, 기존 데이터를 유지하는 호환 계층과 점진적 마이그레이션을 우선 설계해 보고한다.

## 6. 최종 인증 원칙

### 6.1 로그인과 가족방 가입의 완전 분리

```
계정 로그인: 이메일·비밀번호 또는 지원되는 소셜 로그인
가족방 가입: 초대 토큰 수락 (유일한 경로)
```

최종 구조에서 완전히 제거할 것:

```
교회 코드 로그인 / 가족 코드 로그인 / 가족 공용 비밀번호 로그인
가족 가입 비밀번호 / family_access_code / familyJoinPassword(Hash)
가족 비밀번호 확인 화면·오류 메시지·변경 기능
```

초대 링크가 특정 가족방을 지정하므로 추가 가족 비밀번호를 요구하지 않는다. 가입 완료 후에는 매번 개인 계정으로만 로그인한다.

### 6.2 비밀번호 정책

```
최소 10자, 과도한 최대 길이 제한 금지
클라이언트 검증 + Firebase Auth 비밀번호 정책 설정(콘솔에서 가능한 경우) 이중 적용
흔한/유출 비밀번호 차단: 최소한 상위 유출 비밀번호 목록(1만 개 수준)을
  로컬 포함하여 가입·변경 시 검사
비밀번호 재설정 토큰 만료 적용
평문 비밀번호는 저장·로그 출력 금지
```

### 6.3 Step-up 인증 (민감 작업)

가족 공유 코드를 사용하지 않는다. 다음으로 재인증한다.

```
이메일·비밀번호 계정: reauthenticateWithCredential
Google 계정: GoogleAuthProvider 재인증
기타 OAuth: 해당 공급자 재인증
관리자: 재인증 (MFA는 후속 작업 — §4.3)
```

대상: 가족 대표 이전, 구성원 강제 퇴장, 가족방 삭제·보관, 이메일 변경, 비밀번호 변경, 관리자 권한·범위 변경, 데이터 내보내기, 개인정보 삭제 요청, 전체 세션 종료.

최근 인증 유효시간은 기본 5분으로 제한한다. Step-up 검증 로직은 단일 모듈(requireRecentAuth())로 구현한다.

### 6.4 서버측 이메일 인증 강제

createFamily, createInvitation, acceptInvitation 등 모든 쓰기 계열 Callable Function은 인증 토큰의 email_verified === true를 서버에서 직접 검사하고 미인증이면 거부한다. 클라이언트 흐름 제어만으로 대체하지 않는다.

## 7. 최종 라우트 구조

해시 라우터를 유지한다. Firebase Hosting 직접 접근·새로고침에서 index.html이 정상 제공되어야 하며, 해시 뒤 경로는 서버 요청에 포함되지 않는다는 점을 고려한다.

```
[공개]   /#/  /#/login  /#/signup  /#/verify-email  /#/forgot-password
         /#/reset-password  /#/auth/callback  /#/invite/{token}

[사용자] /#/app  /#/app/home  /#/app/onboarding  /#/app/family
         /#/app/family/members  /#/app/family/select  /#/app/missions
         /#/app/records  /#/app/prayers  /#/app/notifications  /#/app/settings

[관리자] /#/admin/login  /#/admin  /#/admin/dashboard  /#/admin/users
         /#/admin/families  /#/admin/invitations  /#/admin/audit-logs
         (§4.2 준비중: /#/admin/missions /statistics /churches /districts /system)
```

## 8. 일반 사용자 로그인 화면

표시할 것만:

```
PAT Bible 로고/서비스명, 이메일 입력, 비밀번호 입력, 로그인 버튼,
구글 로그인 버튼, 비밀번호 찾기, 회원가입 이동, 진행 상태, 오류 안내
```

카카오 로그인은 기존에 정상 구현된 경우에만 유지한다 (§4.3).

제거할 것:

```
교회 코드 / 가족 코드 / 가족방 비밀번호 / 가족 가입 비밀번호
관리자 로그인 버튼 / 관리자 메뉴 / 교회·교구·구역 설정
가족방 검색 / 개발자 안내 / 디버그 정보 / 관리자 API 정보
```

## 9. 관리자 로그인 화면

별도 라우트 /#/admin/login에서 제공:

```
PAT Bible 관리자, 이메일, 비밀번호, 관리자 로그인 버튼,
비밀번호 찾기, 일반 사용자 로그인으로 이동
```

관리자도 Firebase Authentication을 사용한다. 별도 관리자 비밀번호 시스템을 만들지 않는다.

제거할 레거시 인증:

```
admin / 1234 등 하드코딩 계정 / 프론트엔드 고정 관리자 토큰
pat_admin_pw / pat_admin_token / pat_admin_local
localStorage의 관리자 비밀번호·isAdmin
요청 헤더에 관리자 ID·비밀번호 반복 전송
```

단, 레거시 코드의 모든 사용 위치와 API 의존성을 먼저 조사하고, 신규 인증이 정상 작동한 뒤(§36 9단계) 제거한다.

## 10. 인증 상태 관리자 단일화

권장 신규 모듈 (기존 구조에 더 적합한 위치가 있으면 조정하되 역할은 분리):

```
app/js/auth-state.js  app/js/user-context.js  app/js/auth-router.js
```

### 10.1 상태 머신

```
INITIALIZING → UNAUTHENTICATED / AUTHENTICATING → CONTEXT_LOADING
→ ONBOARDING_REQUIRED / AUTHENTICATED / SUSPENDED / ERROR
```

### 10.2 앱 시작 순서

```
앱 시작 → INITIALIZING → Firebase Auth 초기화 → onAuthStateChanged 결과 대기
→ 사용자 없음: UNAUTHENTICATED
→ 사용자 있음: ID 토큰 확보 → CONTEXT_LOADING → getUserContext 호출
→ 계정·멤버십·관리자 범위 확인 → 최종 상태 결정 → 라우트 결정 → 화면 표시
```

세션 복원이 완료되기 전에 로그인 화면이나 보호 화면으로 강제 이동하지 않는다. 초기화 중에는 공통 로딩 화면을 표시한다.

### 10.3 Auth 리스너 단일화

onAuthStateChanged는 앱 전체에서 한 번만 등록한다. 각 화면, 각 라우터, 관리자 모듈에서 중복 등록하지 않는다. 로그인 함수 내부에서 별도의 장기 Auth 리스너를 만들지 않는다.

### 10.4 리다이렉트 단일화

로그인 후 이동 경로는 단일 함수만 결정한다:

```javascript
resolvePostAuthRoute(userContext, intendedRoute)
```

login-auth.js, admin-auth.js, router.js, app-core.js, auth callback, onAuthStateChanged 핸들러가 각각 따로 페이지를 이동하면 안 된다. 로그인 버튼 처리 함수는 인증만 수행하고, 최종 이동은 Auth 상태 관리자와 UserContext 조회가 결정한다.

## 11. Intended Route 보존

로그인 전에 접근하려던 경로를 보존해 인증 후 복귀시킨다.

```
/#/admin/dashboard 접근 → 미로그인 → /#/admin/login → 로그인·권한 확인 → /#/admin/dashboard
/#/invite/{token} 접근 → 미로그인 → 초대 검증 → 로그인/가입 → 인증 완료 → 초대 수락 복구
```

intendedRoute는 앱 내부의 허용된 해시 경로 목록만 저장한다. 외부 URL, javascript: URL 금지 — 오픈 리다이렉트 차단.

## 12. getUserContext (단일 서버 API)

현재 로그인 사용자의 상태를 반환하는 단일 Cloud Function. 가능하면 Callable Function으로 구현한다.

### 12.1 서버 입력 검증

서버는 반드시 context.auth.uid(또는 2세대 Callable의 인증 정보)를 사용한다. 클라이언트가 보낸 uid, authUid, userId, familyId, activeFamilyId, role, isAdmin, churchId, adminScopes, profileId를 신뢰하지 않는다.

### 12.2 반환 구조

```
UserContext: authUid, userId, email, emailVerified, accountStatus,
onboardingStatus, familyMemberships, activeFamilyId, activeProfileId,
roles, adminRoles, adminScopes, permissions, contextVersion
```

민감하거나 불필요한 전체 사용자 문서를 그대로 반환하지 않는다.

### 12.3 조회 순서

```
auth uid 확인 → 사용자 문서 조회 → 없으면 안전한 create-if-missing 1회 생성
→ accountStatus 확인 → 활성 FamilyMembership 조회 → 연결 FamilyProfile 조회
→ 관리자 역할·AdminScopes 조회 → 허용된 데이터만 반환
```

로그인할 때마다 새 사용자 문서를 생성하지 않는다. 중복 생성 충돌을 방지한다.

## 13. Firebase Auth 사용자와 Firestore 사용자 문서

권장 구조: users/{uid} — Auth uid를 문서 ID로 사용.

```
authUid, email, displayName, accountStatus, emailVerifiedAt,
onboardingStatus, activeFamilyId, createdAt, updatedAt, anonymizedAt
```

기존 사용자 ID 구조를 변경하면 데이터 손실 위험이 있는 경우, 기존 ID를 유지하고 별도 매핑 필드를 사용한다.

사용자 문서 생성은 다음 중 하나로 단일화: Auth 생성 트리거 / 인증된 Callable / getUserContext 내부 create-if-missing. 클라이언트가 임의의 uid로 사용자 문서를 만들 수 없게 한다.

## 14. 로그인 후 이동 규칙

### 14.1 일반 사용자

```
이메일 미인증        → /#/verify-email
계정 정지            → 정지 안내 화면
삭제 처리 중         → 접근 제한 안내
가족 멤버십 없음     → /#/app/onboarding
활성 가족방 1개      → activeFamilyId 검증·설정 → /#/app/home
활성 가족방 여러 개  → /#/app/family/select
```

### 14.2 관리자

```
/#/admin/login 로그인 → getUserContext → 관리자 역할·AdminScopes 확인 → /#/admin/dashboard
```

관리자가 아닌 계정: "관리자 권한이 없는 계정입니다" + 일반 사용자 앱 이동 버튼. 일반 사용자가 /admin에 접근해도 세션을 로그아웃시키지 않고 관리자 페이지 접근만 403 처리한다.

## 15. 회원가입 흐름

```
이름·이메일·비밀번호 입력 → 검증(§6.2) → createUserWithEmailAndPassword
→ 사용자 문서 안전 생성 → 이메일 인증 발송 → /#/verify-email
```

가입 버튼 중복 클릭 차단, 오류 발생 시에도 동일 계정 중복 생성 방지.
이메일 인증 확인은 무한 폴링 금지. "인증 완료 확인" 버튼 클릭 또는 페이지 포커스 복귀 시 제한적 확인.

이메일 인증 완료 후:

```
user.reload() → getIdToken(true) → getUserContext
→ pending invite 확인 → 가족방 생성 또는 초대 수락 화면
```

## 16. 가족방 생성 (createFamily)

이메일 인증 완료 사용자는 "가족방 만들기" 또는 "초대받은 가족방 참여"를 선택한다.

생성 입력: 가족방 이름, 대표자 표시 이름, 필요한 최소 설정. 가족 비밀번호는 만들지 않는다.

인증된 Callable createFamily에서 Firestore Transaction으로 처리:

```
email_verified 서버 검사(§6.4) → 중복 요청 확인(idempotency key)
→ Family 생성 → FamilyMembership OWNER 생성 → FamilyProfile 생성
→ users.activeFamilyId 설정 → 감사 이벤트 생성
```

가족별 활성 OWNER는 반드시 한 명. Firestore에는 부분 고유 인덱스가 없으므로:

```
가족 문서에 ownerUid 저장 / 대표 이전은 Cloud Function만 허용
Transaction 안에서 기존 owner와 새 owner를 함께 변경
Rules에서 클라이언트 직접 owner 변경 차단 / 대표 이전 감사 로그
```

## 17. 가족 초대

### 17.1 초대 생성 (createInvitation)

Callable Function createInvitation:

```
호출 자격: 해당 가족의 활성 OWNER 또는 MANAGER (+ email_verified 검사)
입력: invitationType(SINGLE_USE | MULTI_USE), maxUses(다인용 최대 5),
      만료 선택(24시간 | 72시간, 기본 72시간)
처리: 서버에서 128bit 이상 암호학적 난수 토큰 생성
      → SHA-256 해시(tokenHash)만 Firestore 저장
      → 원본 토큰은 응답으로 1회만 반환, 이후 재조회 불가
      → 감사 로그 기록
```

UI 위치: /#/app/family(가족 설정) 내 "가족 초대" 섹션 — 초대 링크 복사, 활성 초대 목록(유형·만료·사용 횟수), 취소 버튼. 취소도 감사 로그 기록.

초대 링크 형식: `https://서비스도메인/#/invite/{token}`

### 17.2 Invitations 구조

```
invitations/{invitationId}
familyId, tokenHash, invitationType, maxUses(기본 1), usedCount,
expiresAt(기본 72시간), revokedAt, createdBy, createdAt, status
```

### 17.3 초대 사전 검증 (validateInvitation)

해시 라우트의 토큰은 브라우저 JS가 읽어 Cloud Function으로 전달한다.

```
원본 토큰 수신 → 서버 해시 → tokenHash 조회 → 만료·취소·사용 횟수 확인
→ 최소 정보만 반환 (가족방 이름, 초대자 표시 이름 수준)
```

인증 전에는 가족 구성원 목록, 가족 설정, 기도 내용, 수행 기록, 연락처, 관리자 정보를 반환하지 않는다.

### 17.4 Pending Invite

원본 초대 토큰을 localStorage에 장기 저장하지 않는다. 사전 검증 성공 시 서버가 짧은 수명의 pendingInviteId 발급:

```
유효시간 15~30분 / 1회 사용 / 사용 후 즉시 폐기
uid 연결 전에는 가족 데이터 접근 불가
```

새로고침으로 사라지면 원본 초대 링크에서 다시 검증하게 한다. 회원가입·이메일 인증 과정에서 초대가 사라지지 않게 pendingInvite를 서버측에 계정과 연결해 보관한다.

## 18. 초대 수락 (acceptInvitation)

Firebase Auth 인증 + email_verified 사용자만 호출 가능.

입력: pendingInviteId, idempotencyKey, 프로필 표시 이름. 클라이언트가 familyId를 입력하지 않는다 — 서버가 pendingInvite에서 결정.

Transaction 처리:

```
auth uid 확인 → pendingInvite 재검증 → invitation 재조회
→ 만료·회수·사용 한도 확인 → 기존 활성 멤버십·동일 가족 중복 가입 확인
→ FamilyMembership 생성 → FamilyProfile 생성 또는 연결
→ usedCount 원자적 증가 → InvitationUsage 생성
→ users.activeFamilyId 갱신 → pendingInvite 사용 완료 → 감사 이벤트
```

Transaction은 Firestore 문서 변경만 처리한다. Auth 계정 생성, 이메일 인증, OAuth, 외부 메일 발송, 푸시 알림을 같은 Transaction에서 처리한다고 표현하지 않는다 — 알림은 Transaction 완료 후 별도 처리.

초대 수락 실패 시 Auth 계정을 삭제하지 않는다. onboardingStatus = INVITE_ACCEPTANCE_REQUIRED로 복구하고 재로그인 시 초대 수락 화면으로 이어지게 한다.

## 19. 가족 멤버십

```
familyMemberships/{familyId_uid}   ← 결정적 문서 ID로 중복 생성 차단
familyId, uid, role(OWNER|MANAGER|MEMBER), status, invitedBy,
joinedAt, leftAt, createdAt, updatedAt
```

논리 제약: 동일 familyId + 동일 uid의 활성 멤버십은 하나. 기존 문서 ID 체계 때문에 결정적 ID 전환이 위험하면 Transaction에서 동일 조합 조회 후 생성으로 대체한다.

## 20. 가족 프로필

로그인 계정과 실제 가족 구성원 프로필을 분리한다.

```
familyProfiles/{profileId}
familyId, linkedUid, displayName, profileType(AUTH_LINKED|GUEST_PROFILE),
status, createdAt, updatedAt, anonymizedAt
```

```
AUTH_LINKED: 로그인 계정과 연결
GUEST_PROFILE: 독립 로그인 불가 — 어린이·고령자 등
```

동일 가족 안에서 한 uid에 활성 AUTH_LINKED 프로필이 두 개 생기지 않게 한다: 매핑 문서 familyProfileLinks/{familyId_uid} 또는 Transaction 중복 확인.

## 21. 보호자와 대필 권한

기본 규칙:

```
OWNER / MANAGER: 가족 내 모든 프로필 기록 입력 가능
MEMBER: 자신과 연결된 프로필 기록만 입력 가능
```

예외 권한:

```
profileGuardians/{profileId_uid}
profileId, guardianUid, permissions, status, createdAt, grantedBy
```

수행 기록 생성 시 서버와 Rules가 검증: auth uid, 활성 멤버십, 대상 프로필 familyId, 자기 프로필 여부, OWNER/MANAGER 여부, ProfileGuardian 권한, 유효한 미션, 서버 시간.

대필 추적 필드: targetProfileId, performedByUid, performedForSelf, createdAt

## 22. 관리자 권한 구조

초기 역할: SUPER_ADMIN, CHURCH_ADMIN (2개만 — §4.3).

권한은 코드 프리셋으로 관리 (DB permission 테이블을 만들지 않는다):

```javascript
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["system.manage","church.manage","district.manage",
    "family.read","family.manage","user.read","user.manage",
    "mission.manage","statistics.read","audit.read","data.export"],
  CHURCH_ADMIN: ["assigned_church.read","district.manage",
    "family.read","mission.manage","statistics.read"]
};
```

모든 검증 함수는 permission 단위로 작성: requirePermission(), requireAdminScope().

관리자 범위:

```
adminScopes/{scopeId}
adminUid, scopeType(SYSTEM|CHURCH), scopeId, status, createdAt
```

역할 = 무엇을 할 수 있는가 / 스코프 = 어느 범위에서. CHURCH_ADMIN은 배정된 교회 데이터만 접근한다. 클라이언트가 전달한 churchId를 믿지 않고, 서버에서 대상 데이터의 churchId를 조회한 뒤 AdminScope와 비교한다.

## 23. 관리자 API 검증

모든 관리자 API 처리 순서:

```
ID 토큰 확인 → auth uid 확인 → 사용자 상태 확인
→ 현재 관리자 역할 조회 → 현재 AdminScopes 조회 → 필요 permission 확인
→ 대상 리소스의 실제 churchId 조회 → 범위 일치 확인 → 작업 수행 → 감사 로그
```

Custom Claims만으로 최종 권한을 판단하지 않는다 — 빠른 후보 확인에만 사용하고, 민감 작업은 Firestore의 현재 역할·스코프를 재조회한다.

관리자 권한 회수 시:

```
역할 비활성화 → AdminScopes 비활성화 → refresh token revoke
→ contextVersion 증가 → 기존 세션 재검증
```

## 24. Firestore Security Rules

RLS 대신 Firestore Security Rules로 다음 원칙 적용:

```
모든 familyId 기반 컬렉션은 활성 멤버십 확인
모든 profileId 접근은 실제 프로필의 familyId 확인
관리자 접근은 서버 API 우선 / 민감 관리자 쓰기는 클라이언트 직접 쓰기 금지
역할·owner 변경은 Cloud Function만 허용
초대 usedCount 직접 수정 금지 / accountStatus 직접 변경 금지
adminRoles·adminScopes 직접 수정 금지
```

헬퍼 함수 작성:

```
isSignedIn(), isActiveMember(familyId), hasFamilyRole(familyId, roles),
isOwnProfile(profileId), canWriteForProfile(profileId), isActiveAdmin()
```

Rules는 클라이언트 문서의 role이나 요청 데이터의 familyId를 신뢰하지 않는다. 서버가 관리해야 하는 필드는 클라이언트 쓰기를 차단한다.

## 25. Functions 남용 방지 (App Check + Rate Limiting)

```
Firebase App Check를 모니터링 모드로 도입한다.
  기존 클라이언트가 깨지지 않는지 검증한 뒤 enforcement 전환 계획을
  최종 보고서에 포함한다 (즉시 강제 적용 금지).

validateInvitation (비인증 호출 가능 함수):
  IP·기기 기준 호출 횟수 제한 (예: 분당 10회), 실패 누적 시 지연 응답.
  간단한 카운터 문서 또는 기존 인프라로 구현하되 과설계하지 않는다.

로그인 실패 반복: Firebase Auth 기본 보호에 더해 UI 레벨 잠금 안내.
```

## 26. 일반 사용자와 관리자 코드 분리

```
공통 인증: auth-state.js, user-context.js, session-manager.js, auth-router.js
일반 사용자: login-auth.js, user-router.js, user-layout.js
관리자: admin-auth.js, admin-router.js, admin-guard.js, admin-layout.js
```

실제 프로젝트 구조에 맞게 조정 가능. 단, 다음은 반드시 공통 모듈 하나만 사용:

```
Firebase Auth 인스턴스 / onAuthStateChanged / 로그아웃 / 세션 복원
UserContext 조회 / 최종 라우트 판정
```

관리자 페이지를 위해 두 번째 Firebase 앱이나 Auth 인스턴스를 초기화하지 않는다.

## 27. 중복 실행 방지

대상: 로그인, 회원가입, OAuth 로그인, 이메일 인증 확인, 비밀번호 재설정, 가족방 생성, 초대 생성·검증·수락, 대표 이전, 로그아웃.

```
요청 중 버튼 disabled / 진행 상태 표시 / 동일 Promise 재사용 또는 실행 잠금
idempotency key 사용 / 완료 후 잠금 해제 / 예외 시 finally에서 잠금 해제
```

로그인 성공 이벤트와 onAuthStateChanged가 동시에 라우팅하지 않게 한다.

## 28. 로그아웃

```
UI 중복 클릭 잠금 → signOut → 메모리 UserContext 제거
→ 민감 화면 상태 제거 → 보호 데이터 캐시 제거
→ BroadcastChannel/storage event로 다른 탭 알림 → /#/login
```

Firestore 데이터나 IndexedDB의 업무 데이터 전체를 삭제하지 않는다 — 인증 임시 상태와 민감 화면 캐시만 제거. 뒤로가기 시 보호 화면이 보이지 않도록 라우터 가드 적용.

## 29. 여러 탭 동기화

다음 상태가 여러 탭에 반영: 로그인, 로그아웃, 계정 정지, 관리자 권한 회수, 대표 이전, activeFamilyId 변경.

Firebase Auth 기본 동기화 + 필요 시 BroadcastChannel 또는 storage event. 탭 간 메시지는 "컨텍스트 재조회 필요" 신호로만 사용한다. localStorage의 role·isAdmin을 권한 근거로 사용하지 않는다.

## 30. PWA와 서비스 워커

캐시 금지 대상:

```
Firebase Auth 응답 / Functions 인증 응답 / getUserContext 응답
초대 검증 응답 / 관리자 API 응답 / 사용자·가족 개인정보 API 응답
```

해시 라우터는 네트워크 요청 경로에 #가 포함되지 않으므로 서비스 워커에서 해시 경로 문자열만 비교하지 않는다.

```
정적 JS/CSS: 버전 기반 캐시
index.html: network-first 또는 짧은 캐시
인증·컨텍스트·관리자 API: network-only
보호 데이터: 민감도에 따라 network-first, 사용자별 캐시 금지
```

새 버전 배포 시 이전 인증 JS가 계속 실행되지 않도록 캐시 버전을 올린다. 단 skipWaiting()·강제 새로고침을 무조건 적용해 진행 중 작업을 잃게 하지 않는다 — 업데이트 안내 후 안전한 시점에 적용.

## 31. 오류 메시지

```
이메일 또는 비밀번호가 올바르지 않습니다.
이메일 인증이 완료되지 않았습니다. 인증 메일을 확인한 뒤 다시 시도해 주세요.
로그인 세션이 만료되었습니다. 다시 로그인해 주세요.
현재 계정은 이용이 제한되어 있습니다. 관리자에게 문의해 주세요.
가입된 가족방이 없습니다. 가족방을 만들거나 초대 링크를 이용해 주세요.
이 초대 링크는 만료되었거나 취소되었습니다.
이 초대 링크의 사용 가능 횟수가 모두 소진되었습니다.
이미 해당 가족방에 가입되어 있습니다.
해당 가족방에 접근할 권한이 없습니다.
관리자 권한이 없는 계정입니다.
담당 교회 범위를 벗어난 요청입니다.
```

이메일 존재 여부가 노출되는 화면은 동일 응답 사용: "입력한 이메일로 가입된 계정이 있다면 비밀번호 재설정 메일을 보냈습니다."

콘솔에 비밀번호, ID 토큰, OAuth 토큰, 초대 원본 토큰을 출력하지 않는다.

## 32. 계정 정지와 권한 회수

```
users.accountStatus = SUSPENDED → refresh token revoke
→ 관리자 역할·AdminScopes 즉시 비활성화
→ 보호 Function에서 accountStatus 재확인 → 클라이언트 컨텍스트 강제 재조회
```

ID 토큰은 발급 후 잠시 유효할 수 있으므로 민감 API는 accountStatus를 서버에서 다시 확인한다.

## 33. 탈퇴와 익명화

```
Auth 계정 삭제 또는 비활성화 → refresh token revoke
→ users 이메일·개인식별정보 제거 → OAuth 연결·기기 토큰 제거
→ FamilyProfile linkedUid 해제 → displayName 익명화
→ 프로필 사진·개인 파일 삭제 → 기존 ActivityRecords는 익명 프로필과 연결 유지
```

기도문 등 자유 입력 콘텐츠: 기본값은 삭제. 사용자가 보존을 명시적으로 선택하면 작성자 연결 제거 + 표시 익명화 (개인정보처리방침에 따라 처리).

부분 처리 상태 방지용 상태 필드:

```
ACTIVE → DELETION_REQUESTED → ANONYMIZATION_IN_PROGRESS → ANONYMIZED / FAILED
```

FAILED 시 재실행 가능하게 한다.

## 34. 감사 로그

기록 대상: 관리자 로그인 성공·실패, 관리자 권한·AdminScope 변경, 계정 정지·복원, 가족방 생성, 초대 생성·취소·수락, 대표 이전, 구성원 강제 퇴장, 게스트 프로필 생성·변경, 보호자 권한 변경, 데이터 내보내기, 세션 강제 종료, 개인정보 삭제·익명화.

```
actorUid, action, targetType, targetId, scopeType, scopeId,
result, reason, createdAt
```

저장 금지: 비밀번호, ID 토큰, Refresh Token, OAuth 토큰, 초대 원본 토큰, 민감한 기도문 전체 내용.

감사 로그는 서버에서만 기록한다. 클라이언트의 직접 생성·수정·삭제를 Rules에서 차단한다.

## 35. 기존 데이터 연결과 마이그레이션

```
기존 컬렉션 읽기 전용 분석 → 신규 구조 매핑표 작성 → dry-run 스크립트
→ 예상 변경 건수 출력 → 백업 확인 → 점진적 연결 → 변경 후 개수 비교
```

마이그레이션 스크립트는 멱등적으로 작성 — 재실행해도 중복 멤버십·프로필·기록·초대, 기존 owner·familyId 변경이 없어야 한다.

신규 계정과 기존 가족 기록 연결 시 기존 기록을 복사하지 않는다. 기존 프로필에 linkedUid 또는 매핑 정보만 추가하고, 기존 기록 ID를 유지한다.

## 36. 구현 순서 (단계마다 테스트 통과 후 커밋)

```
1단계  현황 분석: 인증 흐름·Auth 리스너·리다이렉트·레거시 관리자 인증·
       Firestore 실제 경로·Rules 일치·SW 캐시 전수 조사, 데이터 개수 기준값 저장
       → §5.3 분석 보고서 제출 → 사용자 승인 대기
2단계  회귀 테스트 작성: 로그인 후 로그인 화면 복귀, 새로고침 깜박임,
       중복 리스너·리다이렉트, 로그아웃 후 보호 화면, 일반 사용자의 관리자
       접근, 가족 ID 변조, 초대 중복 수락
3단계  인증 상태 단일화: auth-state, onAuthStateChanged 단일 등록,
       상태 머신, getUserContext, 리다이렉트 단일화
4단계  일반 로그인 화면 단순화: 교회/가족 코드·공용 비밀번호·관리자 기능
       제거, 오류 메시지, 중복 요청 방지
5단계  가족방 생성과 초대: createFamily, createInvitation,
       validateInvitation, acceptInvitation, pendingInvite, 멱등성, Transaction
6단계  관리자 페이지 완전 분리: 전용 레이아웃, 라우터 가드,
       SUPER_ADMIN/CHURCH_ADMIN, AdminScopes, 서버 검증, §4.2 준비중 화면
7단계  Firestore Rules 강화: 가족 격리, 프로필 쓰기 권한, 직접 쓰기 차단,
       Rules Emulator 테스트
8단계  PWA 캐시 수정 + App Check 모니터링 모드
9단계  레거시 제거: 교회/가족 코드 로그인, 공용·가입 비밀번호, 하드코딩
       관리자, localStorage 인증, 중복 리스너, setTimeout·reload 우회
       (신규 인증이 전체 테스트를 통과한 뒤에만)
10단계 데이터 연결과 최종 테스트: 수정 전후 개수 비교, 브라우저·모바일
       PWA·다중 탭·세션 만료·권한 회수 테스트
```

## 37. 필수 테스트

### 37.1 일반 인증

```
정상 회원가입 / 중복 이메일 / 약한 비밀번호(10자 미만·유출 목록) 거부
이메일 인증 전 접근 차단(클라이언트+서버 양쪽) / 인증 완료 후 진행
정상 로그인 / 잘못된 비밀번호 / 구글 로그인 / 로그인 버튼 연속 클릭
새로고침·브라우저 재실행 후 세션 복원 / ID 토큰 자동 갱신
토큰 갱신 실패 후 로그아웃 / 로그아웃 후 보호 화면 차단
여러 탭 로그인·로그아웃 동기화 / 정지 계정 접근 차단
```

### 37.2 라우팅

```
세션 복원 전 로그인 화면 미노출 / 로그인 후 로그인 화면 복귀 없음
무한 리다이렉트 없음 / 같은 라우트 중복 실행 없음 / 잘못된 해시 경로 처리
보호 사용자·관리자 경로 접근 / intendedRoute 정상 복귀 / 외부 URL 리다이렉트 차단
```

### 37.3 가족방

```
가족방 없는 사용자 온보딩 / 가족방 생성 / 생성 중복 요청(idempotency)
OWNER 한 명 유지 / 대표 이전 Transaction / 대표 없는 가족방 방지
활성 가족방 1개 자동 선택 / 여러 가족방 선택 화면
다른 가족 familyId 변조 차단 / 다른 가족 프로필 접근 차단
```

### 37.4 초대

```
OWNER/MANAGER 초대 생성 허용, MEMBER 초대 생성 차단
원본 토큰 DB 미저장 확인(tokenHash만 존재) / 초대 취소 후 사용 차단
정상 초대 검증 / 만료·취소·사용 횟수 초과 차단 / 동시 수락 제한
다인용 초대 maxUses 정확히 동작 / 동일 사용자 중복 가입 차단
pendingInvite 만료 / 회원가입·이메일 인증 후 초대 복구
familyId 변조 차단 / 초대 중복 클릭 차단
validateInvitation 호출 횟수 제한 동작
```

### 37.5 프로필과 대필

```
AUTH_LINKED 프로필 연결 / 동일 uid 중복 프로필 차단 / GUEST_PROFILE 생성
게스트 독립 로그인 차단 / OWNER·MANAGER 대필 허용 / MEMBER 자기 기록 허용
MEMBER 무권한 대필 차단 / ProfileGuardian 예외 허용 / performedByUid 기록
```

### 37.6 관리자

```
관리자 전용 로그인 / 일반 화면에서 관리자 메뉴 미노출
일반 사용자의 관리자 URL·API 접근 차단 / SUPER_ADMIN 접근
CHURCH_ADMIN 담당 교회 접근, 다른 교회 차단 / URL churchId 변조 차단
관리자 권한·AdminScope 회수 즉시 반영 / 정지 관리자 차단
민감 작업 Step-up 인증 / §4.2 준비중 화면 가드 동작 / 감사 로그 생성
```

### 37.7 Firestore Rules (Emulator)

```
미로그인 읽기·쓰기 차단 / 다른 가족 문서 읽기·기록 생성 차단
role 위조 차단 / ownerUid·adminRoles·adminScopes 직접 변경 차단
초대 usedCount·accountStatus 직접 변경 차단
보호자 권한 없는 기록 생성 차단 / 감사 로그 클라이언트 쓰기 차단
```

### 37.8 PWA와 캐시

```
로그아웃 후 뒤로가기 차단 / 구버전 인증 JS 미실행 / 새 배포 후 신규 JS 적용
인증·UserContext·관리자 API 응답 캐시 없음
오프라인 상태에서 민감 데이터 오노출 없음 / App Check 모니터링 모드 정상
```

### 37.9 기존 데이터 보존 (수정 전후 비교)

```
가족방·구성원·프로필·수행 기록·기도 기록·미션 수 일치
일별·주별·월별 통계 표본 일치
기존 familyId·기록 ID·수행 날짜·점수·프로필 표시 이름 유지
신규 연결 후 기록 중복 없음 / 캐시 삭제·로그아웃 후 DB 데이터 유지
```

## 38. 배포 전 검증

운영 데이터에 먼저 배포하지 않는다. Firebase Emulator 또는 별도 테스트 프로젝트에서 검증한다.

```
테스트 실행 → Rules Emulator 통과 → Functions Emulator 통과
→ 테스트 프로젝트 배포 → 브라우저·모바일 PWA 테스트 → 데이터 비교
→ 운영 백업 확인 → 운영 Functions 배포 → 운영 Rules 배포 → Hosting 배포
→ 배포 직후 스모크 테스트
```

배포 실패 시 롤백 가능한 이전 Hosting·Functions 버전을 확인한다. Firestore 스키마 변경은 이전 코드와 일정 기간 호환되도록 한다.

## 39. 완료 조건 (전부 만족해야 완료)

```
1. 일반 로그인 화면에 이메일·비밀번호 중심 기능만 보인다.
2. 교회 코드 로그인이 제거됐다.
3. 가족 코드 반복 로그인이 제거됐다.
4. 가족 공용·가입 비밀번호가 완전히 제거됐다.
5. 가족 가입은 초대 토큰으로만 처리된다.
6. 방장이 앱 안에서 초대를 생성·취소할 수 있다.
7. 가입 완료 후 개인 계정으로만 로그인한다.
8. Auth 상태 리스너가 하나만 존재한다.
9. 최종 리다이렉트 결정 함수가 하나만 존재한다.
10. 세션 복원 전 잘못된 리다이렉트가 없다.
11. 새로고침 후 로그인이 유지된다.
12. 로그인 후 다시 로그인 화면으로 돌아가지 않는다.
13. 무한 리다이렉트가 없다.
14. 여러 탭에서 로그인·로그아웃이 동기화된다.
15. 비밀번호 정책(최소 10자 + 유출 목록 차단)이 동작한다.
16. 쓰기 계열 Functions가 email_verified를 서버에서 검사한다.
17. 관리자 페이지가 일반 사용자 화면과 분리됐다.
18. 일반 사용자가 관리자 페이지·API에 접근할 수 없다.
19. CHURCH_ADMIN은 담당 교회만 접근한다.
20. 관리자 권한 회수가 기존 세션에 반영된다.
21. 다른 가족 데이터에 접근할 수 없다.
22. 초대 중복 수락과 familyId 변조가 차단된다.
23. App Check가 모니터링 모드로 동작한다.
24. 기존 가족·수행·기도·미션·통계 데이터가 유지되고 중복 생성이 없다.
25. Rules Emulator·Functions 테스트가 통과한다.
26. 브라우저와 모바일 PWA 테스트가 통과한다.
27. 수정 전후 데이터 비교 결과가 일치한다.
```

코드가 빌드된다는 이유만으로 완료 처리하지 않는다. 실제 테스트와 데이터 보존 검증이 모두 통과해야 한다.

## 40. 절대 금지 사항

```
기존 Firestore 전체 초기화 / 기존 가족방·수행 기록 삭제 / familyId 재발급
기존 기록을 새 컬렉션에 복사해 중복 생성 / 가족 가입 비밀번호 재도입
6자리 참여 코드 등 범위 외 가입 경로 임의 추가
관리자 이메일 하드코딩 / 관리자 비밀번호 프론트엔드 저장
localStorage role·isAdmin을 권한 근거로 사용
클라이언트 uid·familyId·role·churchId 신뢰
초대 원본 토큰 Firestore 저장 / ID·OAuth 토큰 로그 출력
로그인 오류를 setTimeout·강제 새로고침으로 우회
중복 onAuthStateChanged 등록 / 여러 파일에서 각각 로그인 후 라우팅
관리자 메뉴 숨김만으로 보안 처리
카카오 로그인 신규 구현을 이번 작업과 동시 진행
App Check를 검증 없이 enforcement로 즉시 전환
테스트 없이 운영 배포 / 여러 대규모 변경을 한 번에 배포
백업 확인 없이 마이그레이션
```

## 41. 최종 보고 형식

```
1. 기존 로그인 오류의 실제 원인
2. 기존 관리자 인증의 보안 문제
3. 수정한 파일 목록 / 4. 새로 만든 파일 목록
5. 삭제 또는 비활성화한 레거시 코드
6. 최종 Auth 상태 흐름 / 7. 최종 로그인 흐름 / 8. 최종 회원가입 흐름
9. 최종 초대 생성·수락 흐름 / 10. 최종 관리자 로그인 흐름
11. Cloud Functions 변경 내용 / 12. Firestore Rules 변경 내용
13. 서비스 워커 변경 내용 / 14. App Check 도입 상태와 enforcement 전환 계획
15. 기존 데이터 연결 방법 / 16. 수정 전후 데이터 수 비교
17. 자동 테스트 결과 / 18. 수동 브라우저 테스트 결과
19. 모바일 PWA 테스트 결과 / 20. 실패·보류 항목 / 21. 배포 및 롤백 방법
```

각 테스트 보고 형식:

```
테스트 이름 / 사전 조건 / 실행 절차 / 예상 결과 / 실제 결과 / 통과 여부 / 관련 로그
```

테스트하지 않은 항목을 "통과"로 표시하지 않는다. 확인할 수 없는 내용은 확인하지 못했다고 명확히 보고한다.

## 42. 최종 핵심 흐름

```
[일반 사용자]
앱 실행 → Auth 세션 복원 → getUserContext → 계정 상태 확인
→ 가족 멤버십 확인 → 한 번만 라우팅

[대표자]
회원가입 → 이메일 인증 → 로그인 → 가족방 생성
→ 가족 설정에서 초대 링크 발급(createInvitation)

[초대받은 가족]
초대 링크 접속 → validateInvitation → pendingInviteId 발급
→ 로그인 또는 회원가입 → 이메일 인증 → acceptInvitation
→ FamilyMembership 생성 → FamilyProfile 연결 → 가족방 입장

[이후 로그인]
이메일 계정 로그인 → UserContext 복원 → 기존 멤버십 확인 → 가족방 입장

[관리자]
/#/admin/login → Firebase 로그인 → getUserContext
→ 관리자 역할·AdminScopes 확인 → 관리자 대시보드
```
