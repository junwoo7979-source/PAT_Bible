# PAT Bible 버그 수정 결과 (bug-fixed)

> 수정일: 2026-06-20  
> 기준 문서: `docs/re/bug-list.md`  
> 테스트 환경: Node.js 22, Playwright MCP (Chrome)

---

## ✅ 수정 완료

### BUG-L01 · `?reset=1` 로 캐시 초기화 시 로그인 화면 전환 안 됨 → **수정 완료**

**문제**: `?reset=1` 접속 시 localStorage를 지우지만 이미 50ms 전에 `go('s-family')`가 실행되어 가족방이 표시된 상태 유지. 이후 `completeAppInitialization()`에서 `initialScreen = 's-login'`이 결정돼도 `if(initialScreen !== 's-login')` 조건 때문에 `go('s-login')` 미호출.

**수정**: `applyStoredData()` 함수 시작 부분에 `?reset=1` 감지를 추가. localStorage 확인 전에 먼저 초기화 → `go('s-login')` 호출 → early return.

```javascript
// app/js/app-core.js — applyStoredData()
const params = new URLSearchParams(window.location.search);
if(params.has('reset')){
  localStorage.clear();
  window.history.replaceState({}, document.title, window.location.pathname);
  go('s-login');    // ← 즉시 로그인 화면으로 전환
  setTimeout(() => completeAppInitialization(), 50);
  return;           // ← 이후 localStorage 확인 건너뜀
}
```

**효과**: `?reset=1` 접속 시 로그인 화면이 즉시 표시됨. Firebase 폴링도 `s-family`를 감지하지 않으므로 가족방 데이터 복원 없음.

---

### BUG-L03 · Dead code (`initFirebase(); return;`) → **수정 완료**

**문제**: `completeAppInitialization()` 에서 `return;` 이후에 `initFirebase(); return;` 2줄이 존재. 절대 실행 안 됨.

**수정**: `completeAppInitialization()` 에서 중복된 `?reset=1` 처리 블록(이미 `applyStoredData()`에서 처리)과 dead code 2줄 모두 제거.

```javascript
// 수정 전:
if(!lsAvailable){
  return;
  initFirebase();  // dead code
  return;          // dead code
}

// 수정 후:
if(!lsAvailable){
  return;
}
```

---

### BUG-V02 · 발음표에 무의미한 자기 자신 매핑 7개 → **수정 완료**

**문제**: `korPhoneticMap` 에 `'함':'함'`, `'으로':'으로'`, `'게':'게'`, `'기':'기'`, `'고':'고'`, `'어':'어'`, `'에':'에'` 총 7개의 무의미한 자기 매핑 항목 존재.

**수정**: 실제 발음 혼동 쌍만 남기고 나머지 삭제.

```javascript
// app/js/voice.js — korPhoneticMap
// 수정 전: 11개 항목 (7개 무의미)
// 수정 후: 4개 쌍 (8개 항목, 모두 의미 있음)
const korPhoneticMap={
  '같':'까','까':'같',
  '지':'치','치':'지',
  '하므로':'함으로','함으로':'하므로',
  '롤':'를','를':'롤',
};
```

---

### BUG-V01 · `normalizeKorean()` 발음 보정이 채점 시 미사용 → **수정 완료**

**문제**: `korPhoneticMap` + `normalizeKorean()` 이 정의돼 있지만 채점 함수 `previewVoice()` 에서는 `similarity(text, ...)` 를 호출하는데, `similarity()` 내부는 `normalize()` (단순 특수문자 제거)만 사용. 발음 보정 전혀 작동 안 함.

**수정**: `previewVoice()` 에서 일반 유사도 외에 발음 보정된 유사도도 계산해 높은 값 사용.

```javascript
// app/js/voice-ui.js — previewVoice()
let sim = similarity(text, DB.verse.text);
// 발음 보정 적용: normalizeKorean 적용한 점수와 비교해 높은 값 사용
const simPhonetic = similarity(normalizeKorean(text), DB.verse.text);
if(simPhonetic > sim) sim = simPhonetic;
```

**효과**: "하므로" → "함으로" 같은 발음 혼동도 높은 점수 획득 가능.

---

### BUG-V03 · 91~99% 점수 임의 보정 → **수정 완료**

**문제**: `previewVoice()` 에서 91~99% 유사도일 때 길이 차이 1글자 이내면 +2점, 공통 비율 90% 이상이면 100점으로 임의 조정. 채점 기준 불일관성.

**수정**: BUG-V01 수정(발음 보정 기반 채점)으로 대체. 임의 보정 코드 제거.

```javascript
// 수정 전: if(sim >= 91 && sim < 100){ ... sim = 100; } 11줄
// 수정 후: 위 코드 블록 완전 제거, 발음 보정으로 대체
```

---

### BUG-V04 · `collapseRepeatedNgrams` 클로저 재생성 → **수정 완료**

**문제**: `startVoiceRecognition()` 내부에 `const collapseRepeatedNgrams=(text)=>{}` 로 정의되어 음성 인식 세션 시작마다 함수 객체가 새로 생성됨. 외부 테스트 불가.

**수정**: `startVoiceRecognition()` 밖 모듈 레벨로 이동. 순수 함수(외부 변수 캡처 없음)이라 안전하게 이동 가능.

```javascript
// app/js/voice.js — 모듈 레벨로 이동
function collapseRepeatedNgrams(text){ ... }

// startVoiceRecognition() 내부에서 그대로 호출
```

**효과**: 테스트 가능한 순수 함수가 됨. 세션마다 재생성 없음.

---

## ⚠️ 기존 테스트 실패 (Pre-existing — 우리 수정과 무관)

### voice-recognition-lifecycle.test.cjs (line 144)
- `assert.equal(micPermissionRequests, 1)` → 실제 0
- **원인**: 테스트 mock에서 `navigator.mediaDevices` 를 `context.navigator` 에 설정했지만, 코드는 `window.navigator` 를 참조함. `window.navigator` 는 undefined → `getUserMedia` 미호출
- **기존부터 실패**: git stash로 원본 코드 복원 후에도 동일하게 실패 확인
- **해결 방법**: `create-context.cjs` 의 `window` 객체에 `navigator` 추가 필요 (별도 수정 예정)

### memorization-review.test.cjs (line 110)
- `assert.equal(getElement('s-typing').classList.contains('no-motion'), true)` → false
- **원인**: `create-context.cjs` 의 classList mock에 `contains()` 메서드 미구현
- **기존부터 실패**: 원본 코드에서도 동일하게 실패 확인
- **해결 방법**: `create-context.cjs` classList mock에 `contains(cls)` 추가 필요 (별도 수정 예정)

---

## 📊 수정 결과 요약표

| ID | 심각도 | 수정 결과 | 수정 파일 |
|----|--------|-----------|-----------|
| BUG-L01 | 🔴 긴급 | ✅ 수정 완료 | app-core.js |
| BUG-L02 | 🔴 긴급 | ✅ L01 수정으로 해소 (reset 후 폴링이 s-family 감지 안 함) | — |
| BUG-L03 | 🟡 중간 | ✅ 수정 완료 | app-core.js |
| BUG-V01 | 🟡 중간 | ✅ 수정 완료 | voice-ui.js |
| BUG-V02 | 🟢 낮음 | ✅ 수정 완료 | voice.js |
| BUG-V03 | 🟢 낮음 | ✅ 수정 완료 | voice-ui.js |
| BUG-V04 | 🟢 낮음 | ✅ 수정 완료 | voice.js |

**기존 테스트 통과**
- `voice-threshold.test.cjs` → PASS ✅
- `voice-diff.test.cjs` → PASS ✅

**기존부터 실패 (우리 수정과 무관)**
- `voice-recognition-lifecycle.test.cjs` → FAIL (pre-existing, mock 오류)
- `memorization-review.test.cjs` → FAIL (pre-existing, classList.contains 미구현)

---

## 🔜 추가 수정 필요 항목

- **refact-01.md B**: `voice.js` 500줄 초과 (현재 513줄) → 파일 분리 필요 (사용자 승인 후 M-1)
- **테스트 mock 보완**: `create-context.cjs` — `window.navigator`, `classList.contains()` 추가
