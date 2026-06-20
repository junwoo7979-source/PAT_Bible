# PAT Bible 버그 리스트 (bug-list)

> 작성일: 2026-06-20  
> 조사 방법: 코드 정적 분석 + Playwright 브라우저 실행 테스트  
> 기준 문서: `docs/re/refact-01.md`

---

## 🔴 긴급 버그 (로그인 화면 관련)

### BUG-L01 · `?reset=1` 로 캐시 초기화해도 로그인 화면이 안 나옴
- **증상**: `?reset=1` 으로 접속하면 localStorage를 지우지만, 이미 50ms 전에 가족방(`s-family`)이 표시된 상태라 화면이 바뀌지 않음
- **원인 1**: `applyStoredData()` → localStorage 확인 → `go('s-family')` 순서로 실행됨  
  `?reset=1` 처리는 50ms 후 `completeAppInitialization()`에서 뒤늦게 실행됨
- **원인 2**: reset 후 `initialScreen = 's-login'` 이 결정돼도 `if(initialScreen !== 's-login')` 조건 때문에 `go('s-login')`이 절대 호출되지 않음
- **위치**: `app/js/app-core.js` — `applyStoredData()` (line 56), `completeAppInitialization()` (line 99–179)
- **심각도**: 🔴 긴급 (UI 완전 고장)

---

### BUG-L02 · Firebase 1초 폴링이 `pat_family_profile` 을 매초 재저장
- **증상**: `localStorage.clear()` 로 데이터를 지워도 1초 이내에 `pat_family_profile` 이 복원됨  
  콘솔에 `[PAT-LS] localStorage 저장 성공: pat_family_profile...` 가 60회 이상 출력됨
- **원인**: `renderFamily()` → `startFamilyProgressPolling()` → 1초마다 Firebase 조회 → `syncFamilyProgressFromCloud()` → `setFamilyStorage()` 순서로 연속 실행됨  
  변경이 없어도 매초 무조건 저장
- **위치**: `app/js/family.js` — `startFamilyProgressPolling()` (line 544), `syncFamilyProgressFromCloud()` (line 539)
- **심각도**: 🔴 긴급 (BUG-L01의 근본 원인이 됨)

---

### BUG-L03 · 실행되지 않는 코드(dead code) 가 `completeAppInitialization()` 에 존재
- **증상**: 논리적으로 절대 실행되지 않는 코드가 2줄 있음
- **원인**: `return;` 문 뒤에 `initFirebase(); return;` 이 작성됨
- **코드**: `app/js/app-core.js` line 124–125
  ```javascript
  return;
  initFirebase();  // ← 절대 실행 안 됨
  return;          // ← 절대 실행 안 됨
  ```
- **위치**: `app/js/app-core.js` — `completeAppInitialization()` (line 121–126)
- **심각도**: 🟡 중간 (실행 안 되지만 코드 혼란 야기)

---

## 🟡 중간 버그 (음성 인식 관련 — refact-01.md 기반)

### BUG-V01 · 발음 보정 함수(`normalizeKorean`)를 채점 시 사용하지 않음 [refact-01 E]
- **증상**: "하므로" 를 "함으로" 로 발음해도 틀렸다고 판정됨  
  `korPhoneticMap` 에 발음 유사 쌍이 정의돼 있지만 채점 시 호출 안 됨
- **원인**: `previewVoice()` 에서 `similarity(text, DB.verse.text)` 를 호출하는데,  
  `similarity()` 내부는 `normalize()` (단순 공백/특수문자 제거)만 사용함  
  `normalizeKorean()` (발음 유사 치환 포함)은 정의만 됐고 실제 채점 경로에서 호출 안 됨
- **위치**: `app/js/voice.js` — `normalizeKorean()` (line 78), `app/js/voice-ui.js` — `previewVoice()` (line 167–168)
- **심각도**: 🟡 중간 (핵심 발음 인정 기능이 꺼져 있음)

---

### BUG-V02 · 발음표에 무의미한 자기 자신 매핑 7개 [refact-01 D]
- **증상**: `korPhoneticMap` 에 `'함':'함'`, `'게':'게'` 등 원본과 대체가 동일한 항목이 7개 있음
- **원인**: 발음표 정리가 안 됨, 쓸모없는 연산 낭비
- **코드**: `app/js/voice.js` line 73–77
  ```javascript
  '함':'함','으로':'으로','게':'게','기':'기','고':'고','어':'어','에':'에'  // 모두 불필요
  ```
- **위치**: `app/js/voice.js` — `korPhoneticMap` (line 73–77)
- **심각도**: 🟢 낮음 (성능 미비, 코드 신뢰도 저하)

---

### BUG-V03 · 91~99% 점수를 임의로 끌어올리는 코드 [refact-01 F]
- **증상**: 91~99% 유사도를 임의 기준(길이 차이 1글자 이내)으로 +2점 또는 100점으로 올림  
  채점 기준이 들쭉날쭉하고 예측 불가능함
- **원인**: `previewVoice()` 에서 `if(sim >= 91 && sim < 100)` 블록이 임의 보정을 수행
- **위치**: `app/js/voice-ui.js` — `previewVoice()` (line 169–182)
- **심각도**: 🟢 낮음 (채점 일관성 문제)

---

### BUG-V04 · `collapseRepeatedNgrams` 함수가 매번 클로저로 재생성됨 [refact-01 C]
- **증상**: 음성 인식 세션이 시작될 때마다 `collapseRepeatedNgrams` 함수가 새로 만들어짐  
  테스트 불가, 메모리 낭비, 재사용 불가
- **원인**: `startVoiceRecognition()` 내부에 `const collapseRepeatedNgrams=(text)=>{}` 로 정의됨  
  외부 변수를 캡처하지 않으므로 모듈 레벨로 옮길 수 있음
- **위치**: `app/js/voice.js` — `startVoiceRecognition()` (line 315–357)
- **심각도**: 🟢 낮음 (성능 미비, 테스트 불가)

---

## 📊 버그 요약표

| ID | 위치 | 증상 한마디 | 심각도 | 수정 여부 |
|----|------|------------|--------|----------|
| BUG-L01 | app-core.js | `?reset=1` 해도 로그인 안 나옴 | 🔴 긴급 | 미수정 |
| BUG-L02 | family.js | Firebase가 1초마다 localStorage 복원 | 🔴 긴급 | 미수정 |
| BUG-L03 | app-core.js | dead code 2줄 | 🟡 중간 | 미수정 |
| BUG-V01 | voice-ui.js | 발음 보정 함수 미사용 | 🟡 중간 | 미수정 |
| BUG-V02 | voice.js | 발음표 무의미 항목 7개 | 🟢 낮음 | 미수정 |
| BUG-V03 | voice-ui.js | 91~99% 점수 임의 보정 | 🟢 낮음 | 미수정 |
| BUG-V04 | voice.js | 함수 매번 재생성 | 🟢 낮음 | 미수정 |
