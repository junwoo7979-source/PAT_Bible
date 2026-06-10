# Claude Code 인수인계

---

## ✅ 최신 상태 (2026-06-10)

> **이 섹션을 먼저 읽을 것 — 가장 최신 내용이다.**

### 프로젝트 개요
- **앱**: PAT Bible — 성도 성경 암송 진도 관리 PWA
- **브랜치**: `main`
- **배포 주소**: https://junwoo7979-source.github.io/PAT_Bible/app/index.html
- **로컬 주소**: `http://localhost:8000/app/index.html`
- **체험 교회 코드**: `11111` / 관리자: `admin` / `1234`

### 주요 파일 구조
```
app/
  index.html          ← 진입점 (JS 모듈만 로드)
  js/
    app-core.js       ← 공통 유틸 (esc, 화면전환, 이벤트)
    verse.js          ← 구절 로드/표시
    family.js         ← 가족방 등록/조회
    voice.js          ← 음성 인식 엔진
    voice-ui.js       ← 음성 화면 UI
    memorize.js       ← 암송 단계 진행 관리
  firebase-db.js      ← Firebase Functions API 연동 (API 키 없음)
  firebase-config.js  ← FIREBASE_READY 플래그만 선언
functions/
  index.js            ← Firebase Functions 10개 엔드포인트 (Node.js 22)
```

### 백엔드 구조
- **Firebase Functions** (Node.js 22, us-central1)
- API 엔드포인트: `ping, getVerse, saveVerse, saveFamily, findFamily, joinFamily, getFamilyProgress, saveRecord, hasRecord, getDashboard`
- 클라이언트에 API 키 없음 — 모든 Firestore 접근은 Functions에서만
- 폴링 방식 (10초): onSnapshot 전환은 API 키 재노출 문제로 보류

### Android APK (TWA) 빌드 완료
- **APK**: `C:/Users/SAMSUNG/Desktop/ai/PAT_Bible_TWA/pat-bible-v1.apk` (1.1MB)
- 키스토어: `android.keystore` (alias: android, pass: patbible2024)
- SHA-256: `F4:2B:12:83:...D9:DD`
- assetlinks.json: https://junwoo7979-source.github.io/.well-known/assetlinks.json
- packageId: `com.patbible.app`
- minSdkVersion: 21 (19에서 상향 — androidbrowserhelper 요구사항)
- **Play Store 등록은 미진행** (개발자 계정 $25 등록 필요 시 진행)

### Android SDK 설치 경로 (재빌드 시 필요)
- ANDROID_HOME: `C:/Users/SAMSUNG/AppData/Local/Android/Sdk`
- JAVA_HOME: `C:/Program Files/Microsoft/jdk-21.0.11.10-hotspot`
- build-tools: 34.0.0, platforms: android-34

### TWA 재빌드 방법
```powershell
# PowerShell에서
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:ANDROID_HOME = 'C:\Users\SAMSUNG\AppData\Local\Android\Sdk'
Set-Location 'C:\Users\SAMSUNG\Desktop\ai\PAT_Bible_TWA'
.\gradlew.bat assembleRelease
# 서명
& 'C:\Users\SAMSUNG\AppData\Local\Android\Sdk\build-tools\34.0.0\apksigner.bat' sign `
  --ks .\android.keystore --ks-key-alias android `
  --ks-pass pass:patbible2024 --key-pass pass:patbible2024 `
  --out .\pat-bible-v1.apk `
  .\app\build\outputs\apk\release\app-release-unsigned.apk
```

### 테스트 실행
```powershell
node tests\week-period.test.cjs
node tests\voice-recognition-lifecycle.test.cjs
node tests\app-title.test.cjs
node tests\family-profile.test.cjs
node tests\parish-dashboard.test.cjs
node tests\memorization-review.test.cjs
node tests\voice-threshold.test.cjs
node tests\voice-diff.test.cjs
node tests\kakao-oauth.test.cjs
node tests\kakao-send-to-me.test.cjs
node tests\kakao-local-oauth.test.cjs
node tests\env-loader.test.cjs
```

### 최근 커밋
| 커밋 | 내용 |
|------|------|
| `1c0a05d` | memorize.js 중복 esc 함수 제거 |
| `ee4cf97` | Firebase Functions Node.js 20→22 업그레이드 |
| `25af955` | index.html 모듈 분리 (1932줄→6개 JS 모듈) |
| `9eb2a9f` | Functions 에러 처리 강화 |
| `54dc2b0` | API 키 제거 (보안) |

### 보안 규칙
- 클라이언트(브라우저)에 Firebase API 키 없음
- 키스토어 비밀번호는 문서에 기록됨 (patbible2024) — Git에는 keystore 파일 자체를 올리지 않음
- 카카오 토큰은 `.kakao-tokens.json` (gitignore) 에만 저장

### 작업 규칙 (사용자 확정)
- 브레인 = AI 어시스턴트, 대표 = junwoo7979@gmail.com
- **"커푸리"** 명령 = 커밋 + 푸시 + 메모리 저장 자동 실행
- 기존 기능 삭제/되돌리기 전 대표 확인 필수
- 폴더 구조, API 경로, DB 구조 변경 금지 (승인 없이)

---

## 이전 작업 히스토리 (참고용)

## 현재 상태

- 브랜치: `main`
- 실제 앱: `app/index.html`
- 로컬 주소: `http://localhost:8000/app/index.html`
- 체험 교회 코드: `11111`
- 관리자 계정: `admin` / `1234`

## 이번 작업에서 구현한 내용

### 암송 재시작

- 음성 또는 타이핑 최종 유사도가 `100%` 미만이면 `처음부터 다시 시작하기` 버튼을 표시한다.
- 버튼을 누르면 음성 1차부터 다시 시작한다.

### 음성 인식 안정화

- 녹음 중 인식 문장과 유사도 막대를 실시간 갱신한다.
- 최종 통과 판정은 녹음 종료 후 한 번만 수행한다.
- 이전 `SpeechRecognition` 객체의 이벤트 핸들러와 참조를 해제한다.
- 이전 음성 API 종료 후 `300ms` 해제 시간을 둔다.
- 해제 시간 안에 마이크 버튼을 눌러도 클릭을 버리지 않고 대기 후 자동 시작한다.
- 브라우저 `onstart` 이벤트를 받은 뒤에만 녹음 중 UI를 표시한다.

### 주간 기간과 오늘 날짜

- 관리자 화면에 기준 날짜 선택 필드를 추가했다.
- 선택 날짜 기준 월요일부터 일요일까지의 기간을 자동 계산한다.
- 성도 가족방과 구절 화면은 접속한 오늘 날짜 기준으로 기간을 자동 계산한다.
- 성도 화면에 `오늘은 M월 D일 요일입니다` 문구를 표시한다.

### 로그인 화면 앱 제목

- 관리자 페이지의 교회 정보 관리 카드에서 로그인 화면 상단 제목을 수정할 수 있다.
- 제목은 `pat_app_title` localStorage에 저장된다.
- 저장 값이 없으면 기본 제목 `PAT Bible`을 사용한다.

### 가족방 대표 등록

- 성도 홈에서 `가족방 등록` 버튼을 누르면 가족방 등록 화면으로 이동한다.
- 가족방 이름, 가족 대표 이름, 교구, 구역, 가족방 전용 비밀번호를 입력해 저장한다.
- 값은 `pat_family_profile` localStorage에 `{ roomName, leaderName, parish, district, familyPassword }` 형식으로 저장한다.
- 홈의 가족방 카드 상단에는 가족방 이름, 아래에는 `대표 이름 교구 구역`을 표시한다.
- 등록 버튼은 모바일에서 활성 상태가 명확하도록 주 버튼 스타일을 사용한다.

### 현황 화면 교구별 진행 표

- 현황 화면의 `교회 전체 현황` 위에 `교구별 현황` 카드를 표시한다.
- 교구 목록은 `1교구 진도표`, `2교구 진도표`, `3교구 진도표`, `블레싱 진도표` 더미 집계 데이터다.
- 구역별 현황은 표시하지 않는다.
- 가족방에 입력한 교구와 일치하는 행에는 별표를 붙인다.
- 내 암송 기록이 있으면 `블레싱 진도표` 완료 인원에 반영한다.

### 암송 단계 재검수

- 음성 1차, 음성 2차, 타이핑 1차, 타이핑 2차의 점수를 현재 세션에 저장한다.
- 상단 4단계 진행 표시가 점검 버튼 역할을 한다.
- 점수가 `100%` 미만인 완료 단계는 `다시 검수`로 강조한다.
- 완료 화면에도 4단계 점검 버튼을 표시한다.
- 완료 후 특정 단계를 다시 검수해도 완료 기록을 중복 저장하지 않는다.
- 음성 암송은 일반 모드와 관대 모드 모두 유사도 `100%`일 때만 통과한다.
- 관대 모드는 음성 기준을 낮추지 않고 타이핑 기준만 `90%`로 낮춘다.
- 음성 인식 내용이 원문과 다르면 원문 기준으로 초록=일치, 빨강=다름, 점선=빠짐을 표시한다.
- 음성 2차 진입 직후 브라우저가 빈 결과로 `onend`를 보내면 마이크가 꺼진 것처럼 보이지 않도록 1회 자동 재시작한다.
- 녹음 중 `no-speech`, `network`, `aborted` 같은 일시 오류가 오면 수동 입력으로 떨어지지 않고 최대 5회 자동 복구한다.
- 사용자가 마이크 버튼을 눌러 직접 중지한 경우에는 자동 복구하지 않는다.
- 음성 2차에서 1차 결과를 확인하러 돌아간 경우, 1차 점수가 통과 기준이면 `다음 단계` 버튼을 활성 상태로 복원한다.

### Google Workspace / Calendar

- Google Workspace OAuth 계정은 `junwoo7979@gmail.com`으로 등록되어 있다.
- Docs, Sheets, Drive 계정은 OAuth 계정 목록과 Drive 조회 응답으로 확인했다.
- Google Calendar는 OAuth 도구가 아니라 CalDAV 계정으로 연결했다.
- CalDAV 계정 ID는 `7AlPhIz39aNYTeGlqyPW`다.
- 등록 캘린더 목록 조회 결과 `junwoo7979@gmail.com`, `다모아즈` 캘린더가 확인됐다.
- 앱 비밀번호는 민감정보이므로 어떤 문서에도 저장하지 않는다.
- `tbot_google type=calendar`는 별도 OAuth 경로를 사용해 미연동 메시지를 반환할 수 있다. 캘린더 작업은 CalDAV 기준으로 확인한다.

### 등록된 Google Calendar 일정

- `2026년 6월 5일 금요일`에 `바이브코딩 홈페이지 구축` 종일 일정을 등록했다.
- 등록 캘린더는 `다모아즈`다.
- Google Calendar 화면에서 `일정이 저장되었습니다` 메시지와 해당 날짜의 종일 일정 표시를 확인했다.

### 카카오톡 카드뉴스 발송 승인 준비

- 카카오톡 직접 발송 도구는 현재 없다.
- 카드뉴스/증시 브리핑 발송은 알림톡보다 카카오톡 채널 메시지 또는 친구톡이 우선 적합하다.
- 알림톡은 “브리핑 도착 안내”처럼 정보성 안내 템플릿으로만 검토하는 것이 안전하다.
- 승인 준비 문서:
  - `docs\kakao-business-approval-guide.md`
  - `docs\kakao-message-templates.md`
- 카카오 계정 로그인, 채널 개설, 사업자 인증, 최종 심사 제출은 사용자가 직접 진행해야 한다.
- API 키, senderKey, 앱 비밀번호, 토큰 등 민감정보는 문서와 Git에 저장하지 않는다.

## 테스트

- `tests\voice-recognition-lifecycle.test.cjs`
  - 1차·2차 연속 음성 입력
  - 녹음 중 재시작 버튼 비노출
  - 최종 실패 후 재시작 버튼 노출
  - 빠른 재시작 시 해제 대기 후 자동 시작
  - 전체 재시작 후 마이크 UI 초기화
  - 2차 음성 시작 직후 빈 결과 종료 시 1회 자동 재시작
  - 녹음 중 `no-speech` 오류 발생 시 수동 입력 전환 없이 자동 복구
- `tests\week-period.test.cjs`
  - 월요일~일요일 기간 계산
  - 월 기준 주차 계산
  - 관리자 미리보기 연결
  - 성도 화면 오늘 날짜·요일 표시
- `tests\family-profile.test.cjs`
  - 가족방 등록 버튼 노출
  - 가족방 이름·대표·교구·구역·전용 비밀번호 저장
  - 저장된 가족방 정보 재입력
- `tests\parish-dashboard.test.cjs`
  - 교구별 현황이 교회 전체 현황 위에 표시됨
  - `1교구 진도표`, `2교구 진도표`, `3교구 진도표`, `블레싱 진도표` 렌더링
  - 내 교구 표시와 블레싱 총합 반영 검증
- `tests\memorization-review.test.cjs`
  - 100% 미만 음성 단계가 다시 검수 버튼으로 표시됨
  - 완료 화면에서 단계별 재검수가 가능함
  - 완료 후 재검수 시 완료 기록이 중복 저장되지 않음
  - 2차에서 1차 확인 후 다시 2차로 이동할 수 있음
- `tests\voice-threshold.test.cjs`
  - 음성 유사도 `100%` 미만이면 다음 단계로 진행할 수 없음
  - 관대 모드에서도 음성 통과 기준은 `100%`로 유지됨
- `tests\voice-diff.test.cjs`
  - 음성 인식 결과와 원문이 다를 때 다른 부분이 표시됨
  - 100% 일치하면 완전 일치 안내가 표시됨

## 다음 작업 후보

1. 실제 Firebase/Firestore 저장 구조로 가족방·교구·암송 기록 연결
2. Google Sheets/Calendar 연동 데이터를 PAT 운영 보고서로 자동 정리
3. 관리자용 주차별 성취도 내보내기
4. 카카오톡 채널 승인 완료 후 카드뉴스 발송 API 연동

## 카카오톡 개인 메시지 1차 연동

- 사용자가 카드뉴스를 개인 카카오톡 메시지로 먼저 받고 싶다고 요청했다.
- 1차 방식은 사업자 인증이 필요한 알림톡/친구톡이 아니라 카카오 Developers `나에게 보내기` API로 진행한다.
- 수신 대상은 로그인한 카카오 계정 본인의 `나와의 채팅방`이다. 다른 사용자에게 발송하는 기능은 1차 범위가 아니다.
- 필요한 설정은 카카오 Developers 앱 생성, 카카오 로그인 활성화, Redirect URI 등록, `talk_message` 동의항목 설정이다.
- 상세 문서: `docs/kakao-send-to-me-guide.md`
- 실제 `REST API 키`, `access_token`, `refresh_token`은 문서와 Git에 저장하지 않는다.
- 구현 파일:
  - `scripts/env-loader.cjs`: `.env.local`을 의존성 없이 읽어 카카오 스크립트 실행 환경에 적용하는 헬퍼.
  - `scripts/kakao-oauth.cjs`: 인가 URL 생성 및 인가 코드 토큰 교환 헬퍼.
  - `scripts/kakao-send-to-me.cjs`: 카드뉴스 피드 템플릿 생성 및 `나에게 보내기` API 호출 헬퍼.
  - `scripts/kakao-local-oauth.cjs`: 로컬 콜백 서버를 띄워 동의, 토큰 교환, 나에게 보내기 테스트 전송을 한 번에 처리하는 헬퍼.
- 테스트 파일:
  - `tests/env-loader.test.cjs`
  - `tests/kakao-oauth.test.cjs`
  - `tests/kakao-send-to-me.test.cjs`
  - `tests/kakao-local-oauth.test.cjs`
- 토큰 없이 확인 가능한 명령:
  - `node tests\env-loader.test.cjs`
  - `node scripts\kakao-send-to-me.cjs --dry-run`
  - `node tests\kakao-oauth.test.cjs`
  - `node tests\kakao-send-to-me.test.cjs`
  - `node tests\kakao-local-oauth.test.cjs`
- 실제 1차 전송 흐름:
  - `.env.example`을 `.env.local`로 복사하고 실제 카카오 REST API 키를 입력
  - 카카오 Developers Redirect URI에 `http://localhost:8766/oauth/kakao` 등록
  - `node scripts\kakao-local-oauth.cjs`
  - 출력된 authorize URL을 열고 본인 계정으로 동의
## 브레인 역할 규칙 (2026-06-08 확정)

- **대표**: 사용자 (junwoo7979@gmail.com) — 이 프로젝트의 모든 결정권자
- **브레인**: AI 어시스턴트 — 대표의 최고 브레인, 자율적으로 작업 진행
- **커푸리** 명령어: 대표가 "커푸리"라고 하면 → 커밋 + 푸시 + 메모리 저장 자동 실행
- **문서 저장**: 모든 작업 문서는 `docs/` 폴더 `.md` 파일로 저장
- **자동 저장**: 브레인이 수시로 작업 진행 상황을 메모리와 문서에 저장
- **기능 보호**: 기존 기능 삭제·되돌리기 전엔 반드시 대표 확인

---

## 주의 사항

- 앱은 단일 HTML 프로토타입이다. 큰 구조 변경 없이 기존 패턴을 유지한다.
- 마이크 오류는 브라우저 Web Speech API 해제 타이밍과 관련되어 있다. `VOICE_RELEASE_DELAY=300`과 예약 시작 로직을 제거하지 않는다.
- 성도 화면 기간은 저장된 관리자 기간이 아니라 접속한 오늘 날짜 기준으로 표시한다.
- 날짜 요일은 `일요일/월요일/...` 형식으로 표시한다.
- 캘린더 연동 관련 문서에는 앱 비밀번호나 토큰을 남기지 않는다.

## 2026-06-04 카카오톡 나에게 보내기 실제 연동 완료

- 카카오 Developers 앱 `PAT Market Brief`를 생성하고 카카오 로그인을 활성화했다.
- Redirect URI는 `http://localhost:8766/oauth/kakao`로 등록했다.
- `talk_message` 권한은 선택 동의로 설정했다.
- 카카오 로그인 클라이언트 시크릿 활성화 환경을 지원하도록 `scripts/kakao-oauth.cjs`를 수정했다.
- `.env.example`에 `KAKAO_CLIENT_SECRET=` 항목을 추가했다.
- 실제 REST API 키와 클라이언트 시크릿은 Git에서 제외되는 `.env.local`에만 저장했다.
- 로컬 OAuth 서버로 로그인과 동의를 진행한 뒤 카드뉴스 테스트 메시지를 로그인 계정의 `나와의 채팅방`으로 발송했다.
- 실제 발송 결과는 `result_code=0`이다.
- 관련 회귀 테스트: `tests/kakao-oauth.test.cjs`

## 2026-06-04 메모리 체크포인트

- 최신 저장 커밋: `862f949 feat: support kakao client secret`
- 원격 저장소 `main` 브랜치까지 푸시 완료 상태다.
- 사용자가 `PAT 작업 시작해` 또는 `PAT 진행안 시작해`라고 말하면 이 문서와 `docs/실행내역서.md`를 읽고 이어서 작업한다.
- 현재 카카오톡 개인 메시지 1차 연동은 실제 발송 검증까지 완료된 상태다.
- 비밀키와 토큰은 `.env.local`에만 있으며 어떤 문서나 응답에도 값을 노출하지 않는다.

## 2026-06-04 카카오 카드뉴스 모바일 링크 문제 해결

- 원인: 비공개 `PAT_Bible` GitHub 저장소 주소와 `example.com` 예시 링크는 모바일 카카오톡에서 열 수 없었다.
- 공개 카드뉴스 전용 저장소 `junwoo7979-source/pat-market-brief`를 생성했다.
- 공개 페이지: `https://junwoo7979-source.github.io/pat-market-brief/`
- 카카오 Developers `PAT Market Brief` 앱의 제품 링크 관리에 `https://junwoo7979-source.github.io`를 기본 웹 도메인으로 등록했다.
- 공개 페이지는 로그인 없는 외부 요청에서 HTTP 200, 모바일 390x844 화면에서 정상 표시됨을 확인했다.
- 공개 링크로 카카오톡 `나와의 채팅방`에 재발송했고 `result_code=0`을 확인했다.
- `scripts/kakao-send-to-me.cjs`와 `.env.example`의 기본 링크에서 `example.com`을 제거했다.

## 2026-06-04 실제 미국증시 카드뉴스 콘텐츠

- `docs/market-brief-public/index.html`을 테스트 페이지에서 실제 시장 분석 카드뉴스로 교체했다.
- 2026년 6월 3일 미국장 마감, 특징주, 국내 영향, 한국 연관 종목 10개를 포함한다.
- 공개 카드뉴스 저장소 커밋: `9c1c7b6 feat: publish June 3 US market brief`
- 공개 페이지 HTTP 200 및 모바일 390x844 화면에서 전체 본문 표시를 확인했다.
- 카카오 발송 제목과 요약도 실제 브리핑 내용으로 `.env.local`에 반영했다.
- 실제 브리핑 카카오 발송은 카카오 재로그인 승인 후 완료해야 한다.

## 2026-06-04 카카오 지속 인증 자동 발송 구현

- 최초 OAuth 승인 결과를 Git 제외 파일 `.kakao-tokens.json`에 저장하도록 구현했다.
- 액세스 토큰이 유효하면 재로그인 없이 즉시 발송한다.
- 액세스 토큰이 만료되면 저장된 갱신 토큰으로 자동 갱신하고 새 토큰을 다시 저장한다.
- 갱신 토큰이 없거나 권한이 취소된 경우에만 재로그인을 요구한다.
- 최초 인증 명령: `node scripts/kakao-local-oauth.cjs`
- 이후 무승인 발송 명령: `node scripts/kakao-send-authenticated.cjs`
- 관련 파일:
  - `scripts/kakao-token-store.cjs`
  - `scripts/kakao-send-authenticated.cjs`
  - `scripts/kakao-oauth.cjs`
  - `scripts/kakao-local-oauth.cjs`
- 관련 테스트:
  - `tests/kakao-token-store.test.cjs`
  - `tests/kakao-send-authenticated.test.cjs`
  - `tests/kakao-oauth.test.cjs`
  - `tests/kakao-local-oauth.test.cjs`
- 현재 최초 저장용 카카오 승인 화면을 열었으며 `.kakao-tokens.json` 생성은 승인 완료 대기 상태다.
- 종료 시점에는 카카오 계정이 브라우저에서 로그아웃 상태여서 최초 토큰 생성과 테스트 뉴스 실제 발송은 완료되지 않았다.
- 다음 재개 시 카카오 로그인 후 최초 OAuth를 한 번 완료하면 이후 발송은 재로그인 없이 동작한다.

## 2026-06-04 최종 작업 종료 상태

- 지속 인증 자동 발송 코드, 테스트, 설계 및 구현 계획은 저장 완료했다.
- 간단한 `오늘의 안부` 공개 카드 페이지는 배포 완료 상태다.
- QR 로그인 성공 안내 후 OAuth 콜백을 기다렸으나 `.kakao-tokens.json`은 생성되지 않았다.
- 테스트 뉴스 실제 발송과 무승인 재발송 검증은 미완료다.
- 다음 재개 시 카카오 QR 로그인 후 모바일 앱에서 `로그인 확인/허용`까지 완료하고 토큰 파일 생성 여부를 확인한다.
- 작업 종료 시 로컬 OAuth 서버는 종료한다.

## 2026-06-04 음성 암송 마이크 임의 종료 수정

- 원인: Web Speech API를 `continuous=false`로 사용해 문장 종료나 침묵 구간에 브라우저가 `onend`를 보내면 녹음이 종료됐다.
- 추가 원인: 자동 복구 횟수가 성공한 재연결 뒤에도 누적되어 5회 이후 마이크가 꺼질 수 있었다.
- 수정:
  - 음성 인식을 `continuous=true` 연속 모드로 변경했다.
  - 사용자가 중지하지 않은 상태에서 100% 미만 결과로 `onend`가 발생하면 평가 종료 대신 자동 재연결한다.
  - 마이크 재시작이 성공하면 복구 횟수를 초기화한다.
  - 100% 인식되거나 사용자가 직접 중지한 경우에만 해당 결과를 평가한다.
- `tests/voice-recognition-lifecycle.test.cjs`에 연속 모드와 부분 인식 후 자동 재연결 회귀 테스트를 추가했다.
- 실제 브라우저에서 마이크 시작 후 1분 이상 `녹음 중` 상태 유지 확인.

## 2026-06-04 암송 완료 후 재방문 화면 수정

- 현황·설정·홈에서 암송 탭으로 다시 들어올 때 현재 구절의 최신 완료 기록을 복원한다.
- 완료 기록이 있으면 암송 페이지 상단에 음성 1차, 음성 2차, 타이핑 1차, 타이핑 2차 완료 진행표와 `완료!`를 표시한다.
- 완료 후에는 기본 `암송 시작` 대신 `처음부터 다시 암송하기` 버튼을 표시한다.
- 새 완료 기록에는 네 단계 점수를 모두 저장한다.
- 기존 기록에 타이핑 점수가 없어도 `typingPassed`가 있으면 타이핑 두 단계를 100%로 복원한다.
- 회귀 테스트: `tests/memorization-review.test.cjs`

## 2026-06-04 암송 재방문 입력 내용 및 단계 반복

- 처음 암송을 진행할 때와 최초 완료 화면에서는 단계 체크, 점수, `확인/다시 검수` 문구를 숨긴다.
- 완료 후 암송 페이지에 재방문했을 때만 체크, 점수, 단계 검수 버튼을 표시한다.
- 완료 기록에 음성 1·2차 인식 내용과 타이핑 1·2차 입력 내용을 함께 저장한다.
- 재방문 후 단계 검수 버튼을 누르면 해당 단계에서 입력했던 내용을 보여준다.
- 음성·타이핑 화면의 다음 단계 버튼 위에 `다시 한번 하기` 버튼을 추가했다.
- `다시 한번 하기`는 현재 단계만 초기화하며, 다시 완료하면 기존 완료 기록을 중복 생성하지 않고 갱신한다.

## 2026-06-04 완료 단계 입력 내용 유지 및 잠금

- 음성 또는 타이핑 입력이 완료되면 해당 페이지에 입력 내용을 그대로 보여준다.
- 완료된 음성 단계는 마이크, 수동 입력란, 수동 검증 버튼을 잠근다.
- 완료된 타이핑 단계는 입력란을 읽기 전용으로 잠근다.
- `다시 한번 하기`를 누른 경우에만 현재 단계의 입력 내용과 점수를 삭제하고 입력 기능을 다시 활성화한다.

## 2026-06-04 상단 완료 단계 버튼 화면 이동 방지

- 완료 후 재방문 화면의 음성 2차·타이핑 1차·타이핑 2차 버튼을 누를 때 화면이 움직이는 현상을 수정했다.
- 원인은 검수 화면을 열면서 강제 맨 위 스크롤과 타이핑 입력란 자동 포커스가 함께 실행된 것이었다.
- 상단 단계 검수 버튼 이동에서는 현재 스크롤 위치를 유지하고, 완료된 타이핑 입력란에는 자동 포커스하지 않는다.

## 2026-06-04 상단 단계 버튼 페이지 전환 애니메이션 제거

- 이전 수정 후에도 화면 움직임이 남은 실제 원인은 모든 `.screen` 활성화 시 적용되는 `translateY(8px)` 전환 애니메이션이었다.
- 완료 재방문의 상단 단계 검수 버튼으로 이동할 때는 `no-motion` 클래스를 적용해 페이지 전체 이동 애니메이션을 끈다.
- 일반 탭과 일반 페이지 이동의 전환 효과는 유지한다.
