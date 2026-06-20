# PAT Bible — 음성 인식(STT) 시스템 개선 검토 요청서

> **목적**: 다른 AI에게 음성 인식 시스템의 문제점 분석과 개선 방안을 묻기 위한 기술 문서
> **작성일**: 2026-06-20
> **대상 프로젝트**: PAT Bible (교회 성경 암송 PWA)

---

## 📌 이 문서를 읽는 AI에게 묻는 핵심 질문

다음 질문들에 대해 **구체적이고 실행 가능한 개선안**을 제시해주세요:

1. **브라우저 호환성**: Web Speech API의 Firefox 미지원, iOS Safari 제약을 어떻게 우회/대체할 수 있나요?
2. **인식 정확도**: 한국어 음성 인식 오류(특히 성경 구절의 고어체/한자어)를 어떻게 개선할 수 있나요?
3. **중복 단어 제거**: 현재 n-gram 기반 중복 제거 알고리즘의 한계와 더 나은 방법은?
4. **유사도 판정**: Levenshtein 거리 + 발음 보정 방식의 문제점과 대안은?
5. **모바일 안정성**: Android Chrome의 `continuous` 모드 끊김, 자동 재시작 로직을 어떻게 개선할까요?
6. **대체 입력**: STT 실패 시 fallback 전략을 어떻게 설계해야 할까요?

---

## 🎯 프로젝트 배경

**PAT Bible**은 교회 성도들이 주간 성경 구절을 **음성 암송**으로 외우는 PWA(Progressive Web App)입니다.

- **대상 사용자**: 일반 성도 + **노년층** (접근성 중요)
- **핵심 기능**: 성경 구절을 소리내어 읽으면 → 음성 인식 → 원문과 유사도 비교 → 통과 판정
- **기술 스택**: Vanilla JS, Web Speech API, Firebase
- **배포**: PWA (모바일/웹), Android TWA(앱), 카카오 인앱 브라우저

### 암송 진행 흐름 (4단계)
```
1차 음성 암송 → 2차 음성 암송 → 1차 타이핑 → 2차 타이핑 → 완료
   (유사도 90%+)   (유사도 90%+)   (100% 일치)   (100% 일치)
```

---

## 🌐 현재 브라우저 호환성 현황

| 브라우저 | Web Speech API | 상태 | 비고 |
|----------|---------------|------|------|
| **Chrome (Desktop)** | ✅ 완벽 지원 | 안정 | `SpeechRecognition` |
| **Chrome (Android)** | ⚠️ 부분 지원 | 불안정 | `continuous` 모드 자주 끊김 |
| **Safari (iOS 14.5+)** | ⚠️ 제약 있음 | 불안정 | `continuous=false` 강제, 짧은 인식만 |
| **Firefox** | ❌ 미지원 | 폴백 필요 | `webkitSpeechRecognition` 없음 |
| **카카오 인앱 브라우저** | ❌ 불안정 | 차단 | 마이크 권한 미저장 → 반복 요청 |

### 현재 대응 방식
- **iOS 감지** → `continuous = false` 설정 (짧은 인식 후 자동 재시작)
- **카카오 인앱** → 안내 메시지 표시 + "다른 브라우저로 열기" 유도
- **미지원/보안 제약** → 텍스트 직접 입력(수동 모드)로 전환

---

## 🔬 현재 음성 인식 구현 상세 (voice.js)

### 1️⃣ SpeechRecognition 엔진 설정
```javascript
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

recog = new SR();
recog.lang = 'ko-KR';
recog.interimResults = true;       // 실시간 중간 결과 표시
recog.continuous = !isIOS;          // iOS는 false (제약 회피)
```

### 2️⃣ 마이크 권한 관리 (핵심 문제 영역)
```javascript
// 전역 스트림 유지 → 권한 창 반복 방지
let globalMicStream = null;

async function acquireGlobalMicStream(){
  if(hasLiveGlobalMicStream()){ return true; }  // 이미 권한 있으면 재사용
  try{
    globalMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  }catch(err){
    if(err.name === 'NotAllowedError'){
      toast('마이크 권한이 차단되었습니다 — 다시 시도해주세요');
    }
    return false;  // 실패해도 텍스트 입력 강제하지 않음 (재시도 가능)
  }
}

// 앱 종료 시에만 스트림 해제 (track.stop)
window.addEventListener('pagehide', destroyGlobalMicStream);
```

**문제점**:
- 모바일에서 `getUserMedia`로 권한 받은 뒤 `SpeechRecognition`이 **별도 권한**을 요구하는 경우가 있음
- 카카오 인앱 브라우저는 권한을 **저장하지 않아** 매번 팝업

### 3️⃣ 자동 재시작(Recovery) 로직
```javascript
const VOICE_RECOVERY_LIMIT = 5;     // 최대 5회 자동 재시작
let voiceRecoveryCount = 0;

const recover = (msg) => {
  if(voiceStopRequested || voiceRecoveryCount >= VOICE_RECOVERY_LIMIT){
    // 한도 초과 → 종료 + 텍스트 입력 안내
    recognizing = false;
    document.getElementById('voiceRestart').style.display = 'block';
    return;
  }
  voiceRecoveryCount++;
  // 150ms 후 자동 재시작 (사용자 체감 끊김 최소화)
  setTimeout(() => restartVoiceRecognitionSafely(SR, true), VOICE_RELEASE_DELAY);
};

// no-speech, network, aborted 에러 시 자동 복구
recog.onerror = (e) => {
  if(['no-speech','network','aborted'].includes(e.error)){
    recover('음성 인식이 잠시 끊겼습니다 — 자동으로 다시 시작합니다');
  }
};
```

**문제점**:
- Android Chrome에서 `continuous` 모드가 **3~5초마다 onend** 발생 → 빈번한 재시작
- 재시작 시 **인식 누락**(말하는 중에 끊기면 그 구간 손실)

### 4️⃣ 시작 잡음 제거
```javascript
const STARTUP_NOISE_GUARD = 150;  // 시작 후 150ms 동안 결과 무시
recog.onresult = (e) => {
  const elapsed = Date.now() - recogStartedAt;
  if(elapsed < STARTUP_NOISE_GUARD) return;  // 탭 소리 등 차단
  // ...
};
```

---

## 🧩 중복 단어 제거 알고리즘 (가장 까다로운 부분)

### 문제 상황
Android Chrome이 `interimResults`를 처리하면서 **같은 단어를 여러 번 반환**:
- "주께서 주께서 나의 나의 목자시니" (인접 중복)
- "내가 부족함이 없으리로다 내가 부족함이 없으리로다" (n-gram 중복)
- '생각함으로'를 '생각하므로'로 인식 (발음 유사 오인식)

### 현재 알고리즘 (collapseRepeatedNgrams)
```javascript
const collapseRepeatedNgrams = (text) => {
  let words = text.trim().split(/\s+/).filter(Boolean);
  if(words.length < 2) return text;

  let changed = true, iteration = 0;
  while(changed && iteration < 10){   // 최대 10회 반복
    iteration++;
    changed = false;

    // 1단계: 인접한 같은 단어 제거 (역순 순회)
    for(let i = words.length - 1; i > 0; i--){
      if(words[i] === words[i-1]){
        words.splice(i, 1);
        changed = true;
      }
    }

    // 2단계: n-gram 패턴 제거 (3단어 이상 반복)
    if(!changed && words.length >= 4){
      outer: for(let size = Math.min(words.length, 8); size >= 3; size--){
        for(let i = 0; i < words.length - size; i++){
          for(let j = i + size; j <= words.length - size; j++){
            const match = words.slice(i, i+size).every((w,k) => w === words[j+k]);
            if(match){
              words.splice(j, size);  // 반복 패턴 제거
              changed = true;
              break outer;
            }
          }
        }
      }
    }
  }
  return words.join(' ');
};
```

**한계점**:
- **2글자 패턴**은 의도적으로 제거 안 함 (정상 단어 손상 방지) → 일부 중복 누락
- 시간 복잡도 O(n³) — 긴 구절에서 느림
- 발음만 다른 중복("함으로" vs "하므로")은 못 잡음

---

## 📊 유사도 판정 알고리즘

### 1️⃣ 텍스트 정규화
```javascript
function normalize(s){
  return s.replace(/[\s.,!?;:'"·…]/g, '').toLowerCase();  // 공백·문장부호 제거
}

// 한국어 발음 유사 문자 매핑 (오인식 보정)
const korPhoneticMap = {
  '같':'까', '까':'같', '지':'치', '치':'지',
  '하므로':'함으로', '함으로':'하므로',
  '롤':'를', '를':'롤'
};
```

### 2️⃣ Levenshtein 거리 기반 유사도
```javascript
function similarity(a, b){
  a = normalize(a); b = normalize(b);
  const m = a.length, n = b.length;
  // DP 테이블로 편집 거리 계산
  const dp = Array.from({length: m+1}, (_, i) => [i, ...Array(n).fill(0)]);
  for(let j = 0; j <= n; j++) dp[0][j] = j;
  for(let i = 1; i <= m; i++)
    for(let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  const dist = dp[m][n];
  return Math.round((1 - dist / Math.max(m, n)) * 100);  // 0~100%
}
```

### 3️⃣ 91~99% 구간 추가 보정 (마지막 9% 향상)
```javascript
function previewVoice(text){
  let sim = similarity(text, DB.verse.text);

  // 91~99% 구간에서 한국어 발음 기반 추가 보정
  if(sim >= 91 && sim < 100){
    const nInput = normalize(text);
    const nTarget = normalize(DB.verse.text);

    // 길이 차이 1글자 이내면 +2점
    if(Math.abs(nInput.length - nTarget.length) <= 1){
      sim = Math.min(100, sim + 2);
    }
    // 위치별 일치율 90% 이상이면 100으로 올림
    const common = Array.from(nTarget).filter((c,i) => nInput[i] === c).length;
    const ratio = Math.round((common / nTarget.length) * 100);
    if(ratio >= 90) sim = 100;
  }

  const pass = sim >= 90;  // 통과 기준: 90%
  return { sim, pass };
}
```

**통과 기준**:
- 음성: **유사도 ≥ 90%**
- 타이핑: **100% 완전 일치**

**문제점**:
- 보정 로직이 **휴리스틱**(임의 규칙) → 일관성 부족
- 발음 매핑 테이블이 **수동 관리** → 확장성 낮음
- 성경 고어체("~하느니라", "~로다")의 인식률 저조

---

## ⚠️ 알려진 핵심 문제점 (개선 우선순위)

### 🔴 우선순위 1: 브라우저 호환성
- **Firefox 완전 미지원** → 사용자 이탈
- **iOS Safari** 짧은 인식만 가능, 긴 구절 암송 어려움
- **카카오 인앱** 마이크 불안정 → 외부 브라우저 유도밖에 답이 없음

### 🔴 우선순위 2: 한국어 인식 정확도
- 성경 구절 특유의 **고어체/한자어** 오인식 빈번
- 노년층 **발음 특성**(사투리, 느린 말) 인식률 저하
- 동음이의어/유사발음 단어 구분 못함

### 🟡 우선순위 3: 모바일 안정성
- Android Chrome `continuous` 모드 빈번한 끊김
- 자동 재시작 시 **인식 누락 구간** 발생
- 재시작 반복 시 중복 텍스트 누적

### 🟡 우선순위 4: 유사도 판정 신뢰성
- 휴리스틱 보정 로직의 일관성 부족
- 통과 기준(90%) 적정성 검증 필요
- 발음 매핑 테이블 수동 관리 한계

---

## 💡 다른 AI에게 구체적으로 묻고 싶은 것

### Q1. 브라우저 호환성 대안
- Web Speech API 대신 **서버 사이드 STT**(Google Cloud Speech, Whisper API 등)를 쓰면?
  - 비용, 지연시간, 오프라인 불가 문제는?
- **OpenAI Whisper**를 브라우저에서 WASM으로 돌리는 방안의 현실성은?
- Firefox/iOS를 위한 **하이브리드 전략**(클라이언트 STT + 서버 STT 폴백)?

### Q2. 한국어 인식 정확도
- 성경 구절처럼 **정답 텍스트를 이미 알고 있는** 상황에서, 이를 STT 힌트로 활용하는 방법은?
  - `SpeechRecognition`의 `grammars`(SpeechGrammarList) 활용 가능성?
- 발음 유사도를 **자모 분해(초성/중성/종성)** 기반으로 계산하면 더 정확할까요?
- 한국어 **음소(phoneme) 기반 유사도** 라이브러리 추천?

### Q3. 중복 제거 알고리즘
- 현재 O(n³) n-gram 방식보다 효율적인 중복 제거 알고리즘은?
- `interimResults`를 더 잘 다루는 방법 (final 결과만 신뢰?)
- 정답 텍스트와 **정렬(alignment)** 기반으로 중복을 제거하면?

### Q4. 유사도 판정 개선
- Levenshtein 외에 한국어에 더 적합한 유사도 지표(Jaro-Winkler, 음소 거리 등)?
- 휴리스틱 보정을 **규칙 기반 → 학습 기반**으로 바꿀 수 있나요?
- "정답을 알고 있다"는 점을 활용한 **정렬 기반 채점**(DTW 등) 방안?

### Q5. 모바일 안정성
- Android Chrome `continuous` 끊김의 근본 원인과 해결책?
- 재시작 시 인식 누락을 막는 **오디오 버퍼링** 전략?
- `MediaRecorder` + 서버 STT 조합이 더 안정적일까요?

### Q6. 접근성 (노년층)
- 노년층 음성 인식률을 높이는 **UX/기술적** 방법?
- 음성 인식 외 **대체 검증 수단**(받아쓰기, 빈칸 채우기 등) 설계?

---

## 📁 관련 소스 파일

| 파일 | 역할 | 크기 |
|------|------|------|
| `app/js/voice.js` | STT 엔진, 마이크 관리, 중복 제거 | 24KB |
| `app/js/voice-ui.js` | 음성 UI, 유사도 표시, 결과 평가 | 11KB |
| `app/js/memorize.js` | 암송 4단계 관리, 관대 모드 | 19KB |
| `app/js/app-core.js` | 임계값(TH) 정의, 전역 상태 | 28KB |

### 핵심 함수 맵
```
voice.js
├─ acquireGlobalMicStream()      # 마이크 권한 획득
├─ ensureMicrophonePermission()  # 권한 확인/재요청
├─ toggleMic()                   # 마이크 시작/중지
├─ startVoiceRecognition()       # STT 엔진 시작
├─ collapseRepeatedNgrams()      # 중복 단어 제거 ⭐
├─ similarity()                  # Levenshtein 유사도 ⭐
├─ normalize() / normalizeKorean() # 텍스트 정규화
└─ recover()                     # 자동 재시작 복구

voice-ui.js
├─ previewVoice()                # 유사도 계산 + 보정 ⭐
├─ renderVoiceDiff()             # 차이 시각화 (초록/빨강/점선)
├─ evalVoice()                   # 통과/실패 판정
└─ renderSteps()                 # 4단계 진행 바
```

---

## 🎯 기대하는 답변 형식

다른 AI가 다음과 같이 답해주면 가장 좋습니다:

1. **각 문제별 우선순위와 영향도 평가**
2. **단기(즉시 적용 가능) / 중기 / 장기 개선안 구분**
3. **구체적인 코드 예시 또는 라이브러리/API 추천**
4. **비용·성능·구현 난이도 트레이드오프 분석**
5. **노년층 접근성을 고려한 현실적 제안**

---

## 📊 참고: 현재 설정값 요약

```javascript
// 임계값
음성 통과 기준: 유사도 ≥ 90%
타이핑 통과 기준: 100% 완전 일치
관대 모드: voice 90%, typing 100% (현재 일반 모드와 동일)

// 음성 인식 파라미터
lang: 'ko-KR'
interimResults: true
continuous: !isIOS  (iOS는 false)
STARTUP_NOISE_GUARD: 150ms
VOICE_RECOVERY_LIMIT: 5회
VOICE_RELEASE_DELAY: 150ms

// 중복 제거
인접 중복: 무조건 제거
n-gram: 3단어 이상만 제거
최대 반복: 10회
```

---

**이 문서는 PAT Bible의 음성 인식 시스템 개선을 위한 기술 검토 요청서입니다.**
**문서 위치: `C:\Users\SAMSUNG\Desktop\ai\pat 개선.md`**
