# AUTH_REBUILD 1단계 — 현황 분석 보고서 (§5.3, 20개 항목)

작성일: 2026-07-17 · 브랜치: `feature/signup-admin-firebase-auth` · 기준 커밋: `42b7342`

> ⚠️ 최상위 결론: **SPEC의 핵심 가정과 실제 코드가 근본적으로 다르다.**
> SPEC은 "일반 사용자가 Firebase Auth를 쓰고 있고, 중복 리스너·리다이렉트가 로그인 오류를 낸다"고
> 가정하지만, 실제로는 **일반 사용자 경로에 Firebase Auth가 전혀 없다** (localStorage + HTTP Functions).
> §0 실행규칙 5에 따라 임의 진행하지 않고 차이점·대안을 보고하고 지시를 기다린다.

---

## 1. 현재 일반 사용자 로그인 흐름

Firebase Auth **미사용**. 2단계 로그인:

```
입력창 1개(churchCode) → enterChurch() [app-core.js:873]
  STEP1: 교회코드 입력 → getConfig HTTP 검증 → adoptChurch() (localStorage pat_church_code)
  STEP2: 가족 비밀번호 입력 → findFamily HTTP (교회코드+비번+pat_family_id 스코프)
  → 일치 시 localStorage에 pat_family_id + pat_family_profile(비밀번호 평문 포함) 저장
  → enterMemberHome() → s-family 화면
```

- 판정 로직: `loginDecision()` (login-auth.js, 순수함수)
- 오프라인 폴백: 로컬 프로필의 평문 familyPassword와 직접 비교 (app-core.js:1103)
- "세션" = localStorage 존재 여부. 서버측 세션/토큰 없음.

## 2. 현재 회원가입 흐름

`s-signup` (signup.js): 이메일 1필드 + 동의 체크 → **localStorage(`pat_signup_email`)에만 저장**
→ setTimeout(350ms) → `#/family` 이동. **Firebase Auth 계정을 만들지 않는 형식적 가입**(주석에 명시).
서버에는 아무것도 생성되지 않는다.

## 3. 현재 이메일 인증 흐름

**존재하지 않음.** sendEmailVerification 호출 전무.

## 4. 현재 로그아웃 흐름

- `memberLogout()` [app-core.js:576]: localStorage 가족 키 4종 삭제(pat_family_profile/pat_family_id/pat_leader_family_profile/pat_rooms) → pat_stay_login 세트 → 히스토리 접기 → 로그인 화면
- `adminLogout()` [app-core.js:557]: pat_admin_id/pw/token 삭제
- 서버 signOut 없음 (세션 자체가 없으므로)

## 5. 현재 세션 복원 흐름

3중 초기화가 순차·경합 실행:

```
applyStoredData() → determineInitialScreen() 즉시 go()   [동기, localStorage 확인]
  → setTimeout(50ms) completeAppInitialization() 재판정 → 필요 시 go() 재호출
router.js: 딥링크(#/...) 재확정 reassert() setTimeout 60/250/600ms + 900ms 소멸
```

- 복원 근거: `pat_family_profile` 존재 → s-family / `pat_admin_id+pw`+sessionStorage(pat_admin_session) → s-admin
- `pat_stay_login`(sessionStorage) 플래그로 "로그인 화면에서 새로고침 시 가족화면 튕김"을 땜질

## 6. 현재 가족방 생성·입장 흐름

- 생성: 홈에서 대표 등록 → `saveFamily` HTTP (family.js) → families 문서 생성(비밀번호는 서버에서 bcrypt + 클라 프로필에 평문 보관)
- 입장: 가족 비밀번호 → `findFamily` HTTP. `pat_family_id` 있으면 내 방만, 없으면 **교회 내 비번 일치 첫 방** 반환
- ⚠️ 별도로 **family-v2 API**(createFamily/inviteMembers/acceptInvite/loginWithPhone — 폰번호 기반)가
  functions에 배포돼 있으나 **클라이언트에서 전혀 호출하지 않음** (죽은 병렬 백엔드)

## 7. 현재 가족 초대 흐름

- `copyInviteLink()` [family.js:863]: **base64(JSON)** — roomName/leaderName/familyId/churchCode를 URL `?invite=`에 담음 (서명·토큰·만료 없음)
- `?join=` 공개 링크 변형도 존재
- 수락: `joinFamilyFromInvite()` — 이름 + **가족 비밀번호** 입력 → findFamilyByPassword → joinFamily HTTP
- v2의 inviteToken은 Firestore에 **평문 저장**(family-v2-api.js:161) — SPEC §17 위반 구조(단, 미사용)

## 8. 현재 관리자 로그인 흐름 — 3중 병렬 구조

| 경로 | 화면 | 인증 | 저장 |
|---|---|---|---|
| (a) 레거시 세광 | s-adminlogin | **하드코딩 admin/1234** [app-core.js:363,395] | localStorage에 id/평문pw + **소스에 하드코딩된 pat_admin_token** [app-core.js:399] |
| (b) 교회 관리자 | s-adminlogin | adminLogin HTTP(bcrypt) | localStorage pat_admin_id/**pat_admin_pw(평문)** |
| (c) 플랫폼 관리자 | s-admin-login (신규) | Firebase Auth + Custom Claim(admin===true) | Auth SESSION persistence |

- (c)가 SPEC 방향과 일치. admin-api.js(listUsers 등)는 verifyIdToken+claim을 서버 재검증 — 올바른 구조.
- ⚠️ 직전 커밋 42b7342 메시지·주석은 "(c)를 하드코딩 admin/1234 로컬 로그인으로 임시 변경"이라
  하나, **실제 코드는 Firebase 경로 그대로**이고 LOCAL_ADMIN/isLocalMode 상수만 잔존·미사용.
  주석과 코드가 불일치하는 미완료 변경 흔적 — §3.2에 따라 보고(덮어쓰지 않음).

## 9. onAuthStateChanged 등록 위치 전체

**1곳뿐**: admin-auth.js:91 `requireAdmin()` — 호출마다 등록 후 첫 발화에 즉시 해제(1회성).
일반 사용자 경로에는 Auth 리스너가 없다(SDK 자체 미로드).

## 10. 로그인 후 리다이렉트 실행 위치 전체

`go()`/라우팅 호출이 산재 (SPEC §10.4 위반 상태):

- app-core.js: adminLogin(2곳), registerChurchSubmit, enterChurch(SELECT_CHURCH/AUTH_FAMILY_PW 분기 3곳), _enterFoundFamily→enterMemberHome
- family.js: joinFamilyFromInvite, saveFamilyRegister 등
- signup.js: submitSignup(setTimeout 350ms)
- admin-auth.js: adminAuthLogin→PAT_ROUTER.go('/admin'), adminAuthLogout
- router.js: 가드 판정 후 show()

## 11. setTimeout 기반 라우팅 우회 코드

- router.js:118-123 `scheduleReasserts()` — 부팅 경합을 60/250/600ms 재확정 + 900ms 소멸로 우회 (핵심 우회 코드)
- app-core.js:195 `setTimeout(completeAppInitialization, 50)`
- signup.js:58 `setTimeout(라우팅, 350)`
- SW 업데이트 배너의 location.reload()는 사용자 클릭 시에만 실행(허용 범위)

## 12. localStorage 인증·관리자 정보 저장 위치

| 키 | 내용 | 위험 |
|---|---|---|
| pat_admin_pw | **관리자 비밀번호 평문** | 높음 |
| pat_admin_token | 소스 하드코딩 전역 토큰 | 높음 |
| pat_admin_id / pat_admin_logged_in / pat_admin_local | 관리자 상태 플래그 | 권한 근거로 사용 시 위험 |
| pat_family_profile.familyPassword | **가족 비밀번호 평문** | 높음 |
| pat_signup_email / pat_signup_at | 가짜 가입 정보 | 낮음 |
| pat_dev_token | 개발자 통계 토큰 | 중간 |
| pat_church_code / pat_family_id / pat_device_id | 식별자(비민감) | — |

## 13. Auth 사용자 ↔ Firestore 사용자 문서 연결 방식

일반 사용자는 Auth uid가 **없음**. 실제 식별 = `pat_device_id`(랜덤) + 이름 문자열.
`users` 컬렉션은 admin-api/Rules에 정의만 있고 일반 사용자 흐름에서는 생성되지 않는다.
v2(미사용)는 phone hash → userId 파생.

## 14. 실제 Firestore 컬렉션·문서 경로

`churches`, `families`(v1 필드: familyPassword bcrypt, members[이름 배열], leaderName, parish, district / v2 필드: memberIds, inviteCode + 서브컬렉션 members, invites), `phoneIndex`(v2), `verses`, `records`, `prayers`, `reports`, `users`(관리자 API용). 상세는 SCHEMA.md·firestore-schema.json.

## 15. Rules와 실제 데이터 경로 일치 여부 — **불일치 (사실상 장식)**

- 클라이언트는 Firestore SDK를 전혀 안 씀(firebase-db.js가 전부 HTTP fetch) → 모든 접근이 Functions **Admin SDK로 Rules 우회**
- Rules의 `families.memberUids` 필드는 실제 문서에 존재하지 않음(v1: members 이름 배열, v2: memberIds)
- Rules의 `records.uid`도 실제 레코드(디바이스/이름 기반)와 불일치
- 즉 Rules는 실제 트래픽을 하나도 규율하지 않으며, 클라이언트가 SDK를 쓰기 시작하는 순간 전부 거부되거나(필드 없음) 잘못 허용될 수 있음

## 16. 서비스 워커의 인증 관련 캐시 정책

sw.js(v204) = **완전 무캐시 패스스루**. install 시 skipWaiting, activate 시 전체 캐시 삭제, navigate는 network(no-store).
→ 인증 응답 캐시 문제는 현재 없음. 다만 `skipWaiting()` 즉시 적용은 SPEC §30의 "안내 후 적용" 원칙과 다름.
JS 버전관리는 index.html의 `?v=NNN` 쿼리. firebase.json도 index.html no-store.

## 17. 발견한 로그인 오류 원인

1. **부팅 3중 경합**: determineInitialScreen 즉시 go() → 50ms 후 completeAppInitialization 재라우팅 → router.js reassert 3회 — 초기 화면이 최대 5번 덮어써질 수 있고, 타이밍에 따라 로그인 화면 복귀/깜빡임 발생. pat_stay_login 플래그는 증상 땜질.
2. **상태 기계 부재**: 교회 선택 상태(DB.church.code)가 입력 해석을 바꾸는 모드 스위치라 숫자 비밀번호↔교회코드 오인 이력(주석에 다수 기록).
3. **가족 식별 모호**: 비번 일치 "첫 번째 방" 입장(login-auth.js resolveFamilyByPassword) — 같은 교회에서 비번이 겹치면 남의 방 입장.
4. 회원가입이 실체 없음(localStorage만) → "가입했는데 로그인 안 됨" 구조적 혼란.

## 18. 발견한 데이터 손실·보안 위험

- 대부분의 쓰기 Functions(saveRecord/savePrayer/joinFamily/saveFamily 등)가 **무인증** — 클라이언트가 보낸 churchCode/familyId/이름을 그대로 신뢰 → 위조 기록 생성 가능
- `deleteChurch`/`deleteFamily`가 dev token 헤더 하나로 보호 — 유출 시 대량 삭제
- 관리자 평문 비밀번호·전역 토큰이 localStorage/소스에 존재
- 초대 링크가 서명 없는 base64 — 변조·재사용 무제한
- 루트에 delete_duplicate_family.js / restore_family.js 등 과거 데이터 사고 흔적 스크립트 존재 → 마이그레이션 시 특히 주의
- 기존 테스트 중 rooms.test.cjs는 **현재도 실패**(app/js/rooms.js 부재 — 선행 결함, 이번 작업과 무관)

## 19. 변경 대상 파일 (예상)

```
app/index.html (s-login/s-signup/s-admin-* 화면), app/js/app-core.js, router.js,
signup.js, admin-auth.js, admin-panel.js, family.js, reset-pw.js, app/firebase-db.js,
app/firebase-config.js, app/sw.js(경미), functions/index.js, family-v2-api.js,
admin-api.js, security.js, database/firestore.rules, firebase.json(경미), tests/*
```

## 20. 신규 파일 필요 여부 — 필요

```
app/js/auth-state.js, app/js/user-context.js, app/js/auth-router.js
functions/user-context.js, functions/invitations.js (Callable)
tests/auth-rebuild-*.test.cjs, tests/rules-emulator/*
docs/AUTH_REBUILD_BASELINE_2026-07-17.md (데이터 기준값 — 작성됨)
```

---

## SPEC ↔ 실제 코드 차이점과 대안 (§0 규칙 5에 따른 보고)

| # | SPEC 가정 | 실제 | 제안 |
|---|---|---|---|
| A | 일반 사용자가 Firebase Auth 사용 중 | Auth 전혀 없음(localStorage) | "재구축"이 아니라 **신규 도입 + 기존 데이터 연결**. §35 마이그레이션(기존 families/records에 uid 매핑 추가)이 사실상 본체 작업 |
| B | 중복 onAuthStateChanged·리다이렉트가 오류 원인 | 리스너 1곳뿐. 실제 원인은 부팅 3중 경합 | 상태 머신(§10)은 그대로 유효 — 적용 대상만 조정 |
| C | Rules가 실 트래픽 규율 | 전 트래픽이 Functions(Admin SDK) 경유, Rules 장식 | Rules 재작성 + 클라이언트 접근 모델 결정 필요(Functions 전용 유지 여부) |
| D | 초대 v2(토큰) 존재 가정 | v2 백엔드 존재하나 미사용·평문 토큰·폰번호 기반 | SPEC §17대로 신규 구현(tokenHash), 죽은 v2는 9단계에서 정리 |
| E | 관리자 Firebase Auth 전환 필요 | 이미 (c) 경로로 부분 구현됨 | (c)를 기반으로 확장, (a)(b) 레거시는 9단계 제거 |

## 사용자 결정 필요 사항 (승인 시 함께 답변 요청)

1. **가족 비밀번호 존폐** — 사용자 지시문은 "가족은 가족 비번으로 로그인하면 가족 페이지를 공유"라고
   했으나, SPEC §6.1은 가족 공용 비밀번호 **완전 제거**(초대 토큰 + 개인 계정만)를 요구. 상호 모순.
   → 권장: SPEC대로 제거(개인 이메일 계정 + 초대 토큰). "가족 페이지 공유"는 멤버십으로 자동 충족.
2. **비밀번호 정책** — 지시문 "특수문자+영문+숫자 8자 이상" vs SPEC §6.2 "최소 10자 + 유출목록 차단".
   → 권장: 10자 이상 + 구성 규칙(특수·영문·숫자 포함) + 유출목록 차단 병행.
3. **기존 사용자 전환** — 기존 3가족·9명(교회 11111)은 계정이 없음. 전환 방식:
   (i) 기존 가족방은 그대로 두고 대표가 이메일 가입 후 "기존 방 연결"(관리자 승인/초대링크 재발급) — 권장
   (ii) 병행 운영(구 로그인 유지 + 신 로그인 추가) 후 단계적 종료 — SPEC §39와 충돌(교회코드 제거 조건)
4. **§37.9 전체 데이터 기준값** — 로컬에 Admin SDK 자격증명(gcloud ADC/서비스계정 키)이 없어
   전 컬렉션 개수 집계 불가. 공개 API로 교회 11111 기준값만 확보(BASELINE 문서).
   → 전체 기준값이 필요하면 `gcloud auth application-default login` 실행(사용자 조치) 또는
   임시 카운트 Function 배포 승인 필요.
