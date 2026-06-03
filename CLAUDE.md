# PAT Bible 작업 지침

## 프로젝트 위치

- 실제 작업 폴더: `C:\Users\SAMSUNG\Desktop\ai\PAT_Bible`
- 작동 프로토타입: `app/index.html`
- 로컬 실행 주소: `http://localhost:8000/app/index.html`

## 작업 시작 순서

1. `docs\CLAUDE_CODE_인수인계.md`를 읽는다.
2. `docs\실행내역서.md`를 읽는다.
3. 변경 전 `git status --short`를 확인한다.
4. 변경 후 아래 검증 명령을 실행한다.

```powershell
node tests\week-period.test.cjs
node tests\voice-recognition-lifecycle.test.cjs
node tests\app-title.test.cjs
node tests\family-profile.test.cjs
node tests\parish-dashboard.test.cjs
node tests\memorization-review.test.cjs
node tests\voice-threshold.test.cjs
node tests\voice-diff.test.cjs
node -e "const fs=require('fs'); const html=fs.readFileSync('app/index.html','utf8'); const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]); scripts.forEach(code=>new Function(code)); console.log('Inline scripts parsed:', scripts.length);"
git diff --check
```

## 기록 규칙

- 작업 결과는 `docs\실행내역서.md`에 계속 기록한다.
- 사용자 요청에 따라 별도 종합 문서 `C:\Users\SAMSUNG\Desktop\ai\pat-1단계-기획설계-실행문서.md`에도 업데이트한다.
- 기존 기능을 삭제하거나 되돌리기 전에 사용자 확인을 받는다.

## 현재 구현된 검수 기능

- 상단 4단계 진행 표시에서 완료된 단계의 점수와 재검수 버튼을 표시한다.
- 유사도 또는 진행률이 `100%` 미만인 단계는 `다시 검수`로 강조한다.
- 완료 화면에서도 4단계 결과를 눌러 해당 단계로 돌아가 다시 검수할 수 있다.
- 완료 후 재검수는 새 완료 기록을 중복 저장하지 않는다.
- 음성 암송은 일반/관대 모드 모두 유사도 `100%`일 때만 통과한다.
- 음성 인식 결과가 원문과 다르면 초록/빨강/점선 표시로 다른 위치를 보여준다.
