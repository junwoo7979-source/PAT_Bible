# Google/Firebase와 Toss 앱 공통 저장 설계

작성일: 2026-06-05

## 목적

PAT Bible 웹앱과 Apps in Toss 미니앱이 같은 구절, 가족방, 암송 기록을 사용하도록 공통 저장 구조를 준비한다. 현재 두 앱은 각각 `localStorage`를 사용하지만, 실행 도메인과 앱 환경이 달라 데이터가 자동 공유되지 않는다. 따라서 공통 저장소는 Firebase Firestore로 두고, `localStorage`는 임시 캐시와 오프라인 백업으로만 사용한다.

## 현재 상태

- PAT 웹앱 위치: `C:\Users\SAMSUNG\Desktop\ai\PAT_Bible\app\index.html`
- Toss 앱 위치: `C:\Users\SAMSUNG\Desktop\toss\src\App.tsx`
- PAT 웹앱 저장 키: `pat_records`, `pat_verses`, `pat_family_profile`, `pat_church_name`, `pat_app_title`
- Toss 앱 저장 키: `pat.currentVerse`, `pat.familyRooms`, `pat.adminAccount`
- 두 앱은 같은 PC에 있어도 브라우저 저장 공간이 분리되므로 localStorage 키를 맞추는 것만으로는 동일 저장이 되지 않는다.

## 추천 방식

Firebase Firestore를 공통 저장소로 사용한다.

- Google/Firebase 콘솔에서 PAT용 Firebase 프로젝트와 웹 앱을 등록한다.
- PAT 웹앱과 Toss 앱이 같은 Firebase 프로젝트 설정을 사용한다.
- Firestore 문서 구조를 먼저 고정한 뒤, 두 앱이 같은 읽기/쓰기 함수를 사용하도록 맞춘다.
- 앱 화면은 기존 기능을 유지하고, 저장 계층만 `localStorage -> Firestore 우선, localStorage 보조`로 바꾼다.

## Firestore 데이터 구조 초안

```text
churches/{churchCode}
churches/{churchCode}/verses/current
churches/{churchCode}/verses/history/{verseId}
churches/{churchCode}/familyRooms/{familyRoomId}
churches/{churchCode}/records/{recordId}
churches/{churchCode}/settings/app
```

### 문서 역할

- `churches/11111`: 교회 기본 정보와 활성 상태.
- `verses/current`: 현재 주간 암송 구절.
- `verses/history/{verseId}`: 과거 구절 이력.
- `familyRooms/{familyRoomId}`: 가족방 이름, 대표, 교구, 구역, 구성원.
- `records/{recordId}`: 사용자별 암송 완료 기록, 음성/타이핑 점수, 입력 내용.
- `settings/app`: 로그인 제목, 교회 이름, 운영 설정.

## Google/Firebase 등록 준비 항목

- Firebase 프로젝트 이름: `PAT Bible` 또는 `PAT Bible Shared`
- 웹 앱 닉네임: `pat-bible-web`
- Firestore Database 활성화
- Authentication은 1차에서는 선택 사항이다. 교회 코드와 가족방 비밀번호 방식부터 연결하고, 실제 사용자별 보안이 필요해질 때 Firebase Auth를 붙인다.
- `.env.local` 또는 `app/firebase-config.js`에는 Firebase 설정값만 둔다. 서비스 계정 키와 비밀키는 저장하지 않는다.
- API Key는 공개 클라이언트 키지만, Firebase 보안 규칙과 허용 도메인 제한을 반드시 함께 설정한다.

## Toss 앱 등록 준비 항목

Apps in Toss 공식 문서 기준으로, 실제 개발 완료 전에도 콘솔에서 앱을 미리 등록할 수 있다.

- 앱 이름: `PAT Bible` 또는 교회용 명칭
- appName: 한 번 등록하면 수정할 수 없으므로 출시 전 확정 필요
- 앱 유형: 비게임
- 부제/상세 설명: 성경 암송, 가족방, 교구별 진행 확인 중심으로 작성
- 고객센터 이메일/연락처
- 앱 로고: 600 x 600 PNG, 투명 배경 불가
- 썸네일: 1932 x 828 PNG
- 스크린샷: 세로형 최소 3장 권장, 636 x 1048 PNG
- 비게임 앱은 Toss Design System 사용이 검토에 중요하다.
- Firebase 허용 도메인에는 Toss 미니앱 도메인도 포함해야 한다.

## 등록 시 도메인/환경 변수 정리

PAT 웹앱과 Toss 앱은 같은 Firebase 프로젝트를 바라보되, 실행 도메인은 다르다.

- PAT GitHub Pages: `https://junwoo7979-source.github.io`
- Toss 실제 서비스: `https://*.apps.tossmini.com`
- Toss QR 테스트: `https://*.private-apps.tossmini.com`
- 로컬 개발: `http://localhost:*`

Firebase Authentication 또는 API Key 제한을 켤 때 위 도메인을 허용 목록에 반영한다.

## 저장 흐름

1. 앱 시작 시 Firestore에서 교회 설정, 현재 구절, 가족방, 내 기록을 읽는다.
2. Firestore 읽기에 성공하면 화면 상태와 localStorage 캐시를 함께 갱신한다.
3. Firestore 읽기에 실패하면 localStorage 캐시를 보여주고, 화면에 동기화 실패 안내를 표시한다.
4. 사용자가 구절, 가족방, 암송 기록을 저장하면 Firestore에 먼저 저장한다.
5. Firestore 저장이 성공하면 localStorage 캐시도 갱신한다.
6. Firestore 저장이 실패하면 localStorage에 임시 저장하고 재시도 안내를 표시한다.

## 구현 순서 제안

1. Firebase 프로젝트와 웹 앱 등록
2. Firestore 보안 규칙 초안 적용
3. PAT 웹앱에 Firestore 저장 어댑터 추가
4. Toss 앱에 같은 Firestore 저장 어댑터 추가
5. 현재 구절 동기화부터 검증
6. 가족방 동기화
7. 암송 기록 동기화
8. Toss 앱 등록 정보와 이미지 자산 준비

## 테스트 기준

- PAT 웹앱 관리자에서 구절 저장 후 Toss 앱에서 같은 구절이 보인다.
- Toss 앱에서 가족방을 만들면 PAT 웹앱 현황에서 같은 가족방이 보인다.
- PAT 웹앱에서 암송 완료 기록을 저장하면 Toss 앱 진행 현황에 반영된다.
- 네트워크 차단 시 기존 localStorage 캐시가 유지된다.
- Firebase 설정값이 Git에 올라가지 않는다.

## 참고 문서

- Apps in Toss Firebase 연동: https://developers-apps-in-toss.toss.im/firebase/intro.md
- Apps in Toss 콘솔 앱 등록: https://developers-apps-in-toss.toss.im/prepare/console-workspace.md
