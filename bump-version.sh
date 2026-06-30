#!/usr/bin/env bash
# PAT Bible — 배포 버전 일괄 올리기
# 사용법: bash bump-version.sh <새버전숫자>   (예: bash bump-version.sh 110)
# 효과: ① app/index.html 의 모든 JS script src ?v=N 갱신
#       ② app/sw.js 의 CACHE_NAME 갱신
# JS를 고쳐 배포할 때마다 실행하면, 옛 JS가 폰 HTTP 캐시에 남아
# "한 사람만 옛 화면" 같은 버전 불일치가 생기지 않는다.
set -e
V="$1"
if [ -z "$V" ]; then
  echo "사용법: bash bump-version.sh <새버전숫자>  (예: 110)"; exit 1
fi
DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="$DIR/app/index.html"
SW="$DIR/app/sw.js"

# ① index.html: 모든 .js script src 에 ?v=V (이미 ?v 있으면 교체) — 핵심 캐시버스팅
sed -i -E "s|(<script src=\"[^\"]+\.js)(\?v=[0-9]+)?\"|\1?v=$V\"|g" "$HTML"
# ② sw.js: 자기파괴 SW의 버전 주석 갱신 (바이트 변경 → 옛 SW가 업데이트로 받아 자가 파괴)
sed -i -E "s|(Self-destructing Service Worker  \(v)[0-9]+\)|\1$V)|" "$SW"

echo "✅ v$V 적용 완료"
echo "   - index.html JS script: ?v=$V"
echo "   - sw.js (self-destruct) 버전 주석: v$V"
echo ""
echo "다음: firebase deploy --only hosting  (functions 수정 시 functions 도 포함)"
