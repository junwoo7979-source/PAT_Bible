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
node -e "const fs=require('fs'); const html=fs.readFileSync('app/index.html','utf8'); const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]); scripts.forEach(code=>new Function(code)); console.log('Inline scripts parsed:', scripts.length);"
git diff --check
```

## 기록 규칙

- 작업 결과는 `docs\실행내역서.md`에 계속 기록한다.
- 사용자 요청에 따라 별도 종합 문서 `C:\Users\SAMSUNG\Desktop\ai\pat-1단계-기획설계-실행문서.md`에도 업데이트한다.
- 기존 기능을 삭제하거나 되돌리기 전에 사용자 확인을 받는다.

## 현재 보류 기능

- 상단 4단계 체크 버튼을 눌러 완료 단계의 유사도를 다시 확인하는 기능
- 유사도가 `100%` 미만인 단계만 해당 단계에서 다시 검수하는 기능
- 4단계 완료 후 최종 검수 화면에서 각 단계 결과를 재확인하는 기능

위 기능은 사용자와 설계 방향만 합의했으며 아직 구현하지 않았다.
