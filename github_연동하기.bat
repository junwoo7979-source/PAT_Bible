@echo off
chcp 65001 >nul
echo ============================================
echo   PAT Bible - GitHub 연동 (한 번만 실행)
echo ============================================
echo.
echo [1단계] GitHub 로그인을 시작합니다.
echo  - 잠시 후 나오는 8자리 코드를 복사하세요.
echo  - 브라우저가 열리면 코드를 붙여넣고 Authorize(승인)를 누르세요.
echo.
pause

set GH="C:\Program Files\GitHub CLI\gh.exe"

%GH% auth login --hostname github.com --git-protocol https --web

echo.
echo [2단계] 로그인 확인 중...
%GH% auth status
if errorlevel 1 (
  echo.
  echo [중단] 로그인이 완료되지 않았습니다. 다시 실행해 주세요.
  pause
  exit /b
)

echo.
echo [3단계] GitHub 원격 저장소 생성 + 업로드...
cd /d "%~dp0"
%GH% repo create PAT_Bible --private --source=. --remote=origin --push

echo.
echo ============================================
echo   완료! GitHub에 업로드되었습니다.
echo ============================================
%GH% repo view --web
pause
