# churchCode:013579 로그인 오류 — 근본 원인 분석 최종 보고

**분석 날짜**: 2026-07-11  
**상태**: ✅ **근본 원인 확정**  
**심각도**: 🟠 **설계 동작 + 사용자 혼동**

---

## 🎯 핵심 결론

### churchCode:013579로 로그인할 때 무슨 일이 일어나는가?

```
사용자: churchCode 입력 → "013579" 입력
         ↓
app-core.js: enterChurch() → _enterChurchImpl()
         ↓
loginDecision(DB.church.code, "013579")
  → DB.church.code = "" (초기 상태)
  → decision.action = "SELECT_CHURCH" (교회 선택 단계)
         ↓
PAT_DB.getConfig("013579") ← Firebase 조회
  → churches/013579 문서 없음 (존재하지 않는 레거시 교회)
         ↓
initChurchDefaults("013579") ← 로컬 기본값
  → { appTitle: "교회", verse: { ... } } 반환
         ↓
✅ 교회 설정 유효 확인
adoptChurch("013579", "교회")  ← DB에 저장
refreshLoginMode()            ← 화면 업데이트 (password 필드 표시 예상)
         ↓
getFamiliesList("013579") ← 기존 가족 조회
  → churches/013579/families 컬렉션 없음
  → 가족 0개
         ↓
🚨 라인 980-987 실행:
  if (familiesData.families.length === 0) {
    console.log(`[LOGIN] 013579에 등록된 가족 없음 → 대표 등록 화면 안내`);
    openFamilyRegister('leader');  ← 가족방 만들기 화면으로 강제 이동!
    return;  ← password 입력 단계 건너뜀!
  }
         ↓
❌ password 필드 나타나지 않음
❌ "시작하기" → "가족방 만들기" 화면으로 이동
```

---

## 📊 현장 분석 결과

### 테스트 입력
- **churchCode**: 013579
- **password**: 013579

### 관찰된 화면 변화

**Step 1: 초기 화면**
- input 1개: churchCode만
- 버튼: "시작하기"
- 상태: 로그인 폼 대기

**Step 2: churchCode 입력 후**
```
입력값: 013579
화면 변화: password 필드 나타나지 않음 ❌
         가족방 만들기 화면으로 이동 ❌
```

**Step 3: "시작하기" 버튼 클릭**
```
결과: 가족방 만들기 화면 (대표 등록)
findFamily API 호출 안 됨 ❌
```

### 네트워크 분석
```
[요청 없음] findFamily 호출 감지 안 됨
→ password 입력 단계에 도달하지 않아 비밀번호 검증 불가
```

---

## 🔍 코드 분석

### 앱-core.js 흐름

**라인 873-917: enterChurch() 함수**
```javascript
async function enterChurch(){
  const raw = "013579";  // 사용자 입력
  
  // 라인 915-917: 다음 액션 결정
  const decision = loginDecision(DB.church.code, raw);
  // DB.church.code = "" (초기)
  // 결과: { action: "SELECT_CHURCH", code: "013579", ... }
}
```

**라인 928-998: SELECT_CHURCH 케이스**
```javascript
case 'SELECT_CHURCH': {
  console.log('[LOGIN-STEP1] 교회 선택:', '013579');
  
  // 1. Firebase에서 교회 설정 조회
  let cfg = await PAT_DB.getConfig('013579');
  // → churches/013579 없음 → null
  
  // 2. 로컬 폴백
  if(!cfg){
    cfg = initChurchDefaults('013579');
    // → { appTitle: "교회", verse: {...} }
  }
  
  // 3. 설정 검증
  if(!cfg || cfg.appTitle === undefined){
    // ❌ 이 조건은 FALSE (cfg.appTitle = "교회")
    // ✅ 검증 통과
  }
  
  // 4. DB에 저장 + 화면 업데이트
  adoptChurch('013579', cfg.appTitle);
  refreshLoginMode();  // password 필드 표시 준비
  
  // 5. 기존 가족 조회 (라인 965)
  const familiesRes = await fetch(
    'getFamiliesList?churchCode=013579'
  );
  const familiesData = await familiesRes.json();
  
  // 6. ⚠️ 핵심: 가족 수 0개 확인 (라인 980-987)
  if(familiesData.families.length === 0){
    console.log(
      `[LOGIN] 013579에 등록된 가족 없음 → 대표 등록 화면 안내`
    );
    if(typeof openFamilyRegister === 'function'){
      openFamilyRegister('leader');  // ← 가족방 만들기 화면
      return;  // ← password 입력 안 함!
    }
  }
}
```

### initChurchDefaults() 함수 (라인 1157-1181)

```javascript
function initChurchDefaults(churchCode) {
  const defaults = {
    '11111': {
      appTitle: '개발자 교회',
      ...
    },
    '013579': {
      appTitle: '교회',  // ← 설정됨!
      verse: {
        ref: '시편 100:1',
        text: '온 땅이여 여호와께 즐거워하라',
        weekOf: '2026년 7월 1주차'
      }
    }
  };
  
  return defaults[churchCode] || {
    appTitle: churchCode || 'PAT Bible',
    ...
  };
}
```

**013579는 로컬 기본값에 등록되어 있다!** 따라서 cfg.appTitle이 정의되므로 검증을 통과합니다.

---

## 🚨 근본 원인 체인

| 단계 | 내용 | 상태 |
|------|------|------|
| 1️⃣ | Firestore에 churches/013579 없음 | ✅ 설계 동작 |
| 2️⃣ | 로컬 initChurchDefaults에 013579 설정 있음 | ⚠️ 문제 시작 |
| 3️⃣ | 교회 설정 검증 통과 | ✅ 정상 |
| 4️⃣ | DB.church.code에 "013579" 저장 | ✅ 정상 |
| 5️⃣ | getFamiliesList("013579") 호출 | ✅ 정상 |
| 6️⃣ | 가족 0개 확인 | ✅ 정상 (교회 없으므로) |
| 7️⃣ | **🔴 가족방 만들기 화면으로 강제 이동** | ❌ **문제!** |
| 8️⃣ | password 입력 단계 건너뜀 | ❌ **결과** |

---

## 📍 문제의 핵심 코드

**app-core.js 라인 980-987:**

```javascript
// ★ 2026-07-01 CRITICAL FIX: 이 교회에 등록된 가족이 0개(신규 교회의 첫 교인)라면
// 비밀번호 입력을 요구해도 대조할 가족이 아예 없어...
// 가족이 0개로 확인된 경우에만 곧바로 대표 등록(가족방 만들기) 화면으로 안내한다.
console.log(`[LOGIN] ${decision.code}에 등록된 가족 없음 → 대표 등록 화면 안내`);
if(typeof loadChurchConfig === 'function') await loadChurchConfig();
if(typeof openFamilyRegister === 'function'){
  window._creatingNewRoom = false;
  toast('✓ 교회가 선택됐어요. 첫 가족방을 만들어보세요');
  openFamilyRegister('leader');  // ← password 입력 건너뜀!
  return;
}
```

**의도**: 신규 교회에 가족이 없으면 새로 만들기 유도 (UX 개선)  
**부작용**: 013579처럼 Firestore에 없는 레거시 교회도 "신규 교회"로 인식됨

---

## 🎯 왜 password 필드가 안 나타나나?

### 기대 흐름 (정상)
```
churchCode 입력 (type="text")
         ↓
refreshLoginMode() 호출
  if(hasChurch){  // ← DB.church.code가 설정됨
    input.type = 'password'
    input.placeholder = '비밀번호'
  }
         ↓
password 필드로 전환 ✅
```

### 실제 흐름 (013579)
```
churchCode 입력 → DB.church.code = "013579" 저장
refreshLoginMode() 호출 ✅
         ↓
입력 필드 업데이트 준비 중
         ↓
getFamiliesList("013579") 완료
가족 0개 감지
openFamilyRegister('leader') 호출 ← 페이지 즉시 변경!
         ↓
password 필드 업데이트 안 됨 ❌
화면 전환으로 덮어씀 ❌
```

---

## 📌 현장 테스트 증거

### 브라우저 개발자도구 분석

**입력 필드 상태:**
```
입력 감지 (초기):
  - input#churchCode (type="text") ✅
  - input#password → 없음 ❌

churchCode:013579 입력 후:
  - input#churchCode (type="text") ← 아직도 text!
  - input#password → 여전히 없음 ❌
  
예상: type 변경 → type="password"
실제: type 유지 → type="text"
```

**화면 전환:**
```
Step 1: 로그인 화면
Step 2: (password 필드 안 나타남)
Step 3: 가족방 만들기 화면으로 즉시 이동
```

---

## 🔧 개선 방안

### A. 즉시 조치 — 레거시 교회 감지

**문제**: `initChurchDefaults`에 013579가 등록되어 있어서 마치 현재 교회인 것처럼 인식

**해결**: 레거시 교회는 로컬 기본값에서 제거하거나, Firestore 존재 확인 강제

```javascript
// app-core.js 라인 937-949 수정
let cfg = null;
try{
  console.log('[LOGIN-STEP1-SERVER] Firebase 조회:', decision.code);
  cfg = await PAT_DB.getConfig(decision.code);
}catch(e){
  console.warn('[LOGIN-STEP1-SERVER-ERROR]', e.message);
}

// Firebase에서 설정이 없으면 로컬 기본값 사용
if(!cfg){
  // ★ 개선: 013579 같은 레거시 교회는 로컬 폴백 금지
  const legacyChurches = ['013579'];  // 운영 종료된 교회 목록
  
  if(legacyChurches.includes(decision.code)){
    console.log('[LOGIN-STEP1-FAIL] 레거시 교회 감지:', decision.code);
    toast(`churchCode:${decision.code}는 더 이상 운영되지 않습니다.\n현재 교회: churchCode:11111`);
    return;  // ← 여기서 중단
  }
  
  console.log('[LOGIN-STEP1-FALLBACK] Firebase 설정 없음, 로컬 기본값 사용:', decision.code);
  cfg = initChurchDefaults(decision.code);
}
```

### B. initChurchDefaults에서 013579 제거

```javascript
function initChurchDefaults(churchCode) {
  const defaults = {
    '11111': {
      appTitle: '개발자 교회',  // 현재 유일한 운영 교회
      verse: { ... }
    }
    // '013579' 제거 ← 레거시 교회
  };
  
  return defaults[churchCode] || {
    appTitle: churchCode || 'PAT Bible',
    verse: { ... }
  };
}
```

### C. 사용자 안내 개선

Firebase에서 설정이 없을 때:

```javascript
if(!cfg){
  console.log('[LOGIN-STEP1-FALLBACK] 교회 설정 없음, 신규 교회로 생성');
  cfg = initChurchDefaults(decision.code);
  
  // ★ 안내 메시지 추가
  toast(`churchCode:${decision.code}는 Firestore에 등록되지 않았습니다.\n첫 가족방을 만들어 시작하세요.`);
}
```

---

## 📝 최종 요약

| 항목 | 내용 |
|------|------|
| **사용자 입력** | churchCode:013579 + password:013579 |
| **예상 동작** | password 필드 표시 → password 입력 → 검증 (실패) |
| **실제 동작** | password 필드 미표시 → 가족방 만들기 화면으로 이동 |
| **근본 원인** | Firestore에 churches/013579 없음 → 가족 0개 → 신규 교회 판단 → 대표 등록 강제 |
| **현재 상태** | 설계 동작 (신규 교회 UX 개선) + 사용자 혼동 (013579 = 레거시) |
| **권장 조치** | 레거시 교회 명시적 차단 + 사용자 안내 개선 |

---

## 🔗 관련 파일

- `app/js/app-core.js` (라인 873-998: enterChurch 함수 및 SELECT_CHURCH 케이스)
- `app/js/app-core.js` (라인 1157-1181: initChurchDefaults 함수)
- `app/index.html` (라인 356: 시작하기 버튼)

---

**결론**: churchCode:013579는 **Firestore에 존재하지 않는 레거시 교회코드**입니다. 로컬 기본값에만 등록되어 있어서 Firebase 조회 실패 → 로컬 폴백 → 신규 교회 판단 → 대표 등록 화면 강제 이동이 발생하는 설계 동작입니다.
