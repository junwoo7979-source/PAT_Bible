# 2026-06-05 PAT Bible 모바일 음성 작업 저장

## 현재 저장 상태

- 저장소: `C:\Users\SAMSUNG\Desktop\ai\PAT_Bible`
- 원격: `https://github.com/junwoo7979-source/PAT_Bible.git`
- 브랜치: `main`
- 상태: 로컬 `main`과 `origin/main` 동기화 완료
- 공개 앱: `https://junwoo7979-source.github.io/PAT_Bible/app/index.html`
- 최신 캐시 우회 테스트 URL: `https://junwoo7979-source.github.io/PAT_Bible/app/index.html?v=2ba2a34`
- 카카오톡 나와의 채팅방 링크 전송 완료: Kakao API `result_code: 0`

## 오늘 해결한 문제

1. 모바일 음성 인식 중복 표시
   - 증상: `하나님이하나님이 세상을` 또는 구절 앞부분이 반복되어 유사도가 낮게 표시됨.
   - 원인: 모바일 Web Speech API가 누적 결과 또는 이미 중복된 transcript를 넘기는 경우가 있었음.
   - 조치:
     - `resultIndex` 처리 보강
     - 앞 문장 유실 방지
     - `collapseRepeatedVersePrefix`로 구절 시작부 반복 제거

2. 음성 인식 자동 복구 안정화
   - 증상: `no-speech`, `network`, `aborted` 이후 자동 재시작이 반복되거나 수동 입력으로 빠지지 않음.
   - 조치:
     - 자동복구 카운터가 재시작마다 초기화되지 않게 수정
     - 복구 한계 이후 수동 입력과 `처음부터 다시 시작하기` 버튼 표시

3. 처음부터 다시 시작하기 버튼 누락
   - 증상: 음성 실패/복구 실패 상황에서 재시작 버튼이 보이지 않음.
   - 조치:
     - 실패 fallback 상태에서 `voiceRestart` 버튼을 표시하도록 수정

4. 마이크 권한 팝업 중복
   - 증상: 모바일에서 허용/차단 권한창이 처음에 두 번 뜸.
   - 원인: `getUserMedia` 사전 확인과 `SpeechRecognition.start()`가 각각 권한 요청을 발생시킴.
   - 조치:
     - `navigator.permissions.query({ name: 'microphone' })`가 `prompt` 또는 `granted`이면 사전 `getUserMedia` 호출을 생략
     - 실제 권한 요청은 브라우저 음성 인식 시작 시 한 번만 발생하도록 수정

## 관련 커밋

- `c21b607` `fix: prevent duplicate mobile speech transcripts`
- `7679ae9` `fix: stabilize mobile voice recovery`
- `ca1093e` `fix: preflight mobile microphone permission`
- `e8d7a9b` `fix: collapse repeated voice transcript prefixes`
- `2ba2a34` `fix: avoid duplicate microphone permission prompt`

## 검증 명령

```powershell
node tests\voice-recognition-lifecycle.test.cjs
node tests\voice-diff.test.cjs
node tests\voice-threshold.test.cjs
node tests\memorization-review.test.cjs
```

전체 테스트도 실행 완료:

```powershell
$failed=0; Get-ChildItem -Path tests -Filter *.cjs | Sort-Object Name | ForEach-Object { Write-Host "RUN $($_.Name)"; node $_.FullName; if($LASTEXITCODE -ne 0){ $failed=1 } }; exit $failed
```

결과: 모든 테스트 PASS.

앱 스크립트 문법 검사도 PASS.

## 운영 주의사항

- 웹앱은 안드로이드/카카오톡/브라우저 권한창을 강제로 `항상 허용`으로 바꿀 수 없다.
- 최초 권한창은 사용자가 직접 `허용`을 눌러야 한다.
- 이번 수정은 앱이 권한창을 중복으로 띄우는 문제를 제거한 것이다.
- 모바일에서 이전 코드가 남아 보이면 캐시 우회 URL을 사용하거나 새로고침한다.
