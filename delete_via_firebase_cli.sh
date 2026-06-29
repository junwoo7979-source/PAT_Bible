#!/bin/bash

PROJECT_ID="pat-bible-app"
CHURCH_CODE="11111"

echo "🔍 Firebase에서 '테스트가족방' 검색 중..."
echo ""

# Firebase CLI를 사용해서 document 삭제
# 형식: firebase firestore:delete <path> --project=<project-id> --recursive

# 먼저 모든 가족 목록을 확인
echo "📋 세광교회의 모든 가족:"
echo ""

# Firestore 규칙상 직접 리스트할 수 없으므로, 알려진 ID로 직접 삭제 시도
# 사용자가 "테스트가족방"이라고 했으므로 검색

# 대신, 앱의 Firestore 보안 규칙이 있으므로 
# Firebase Console UI를 통한 수동 삭제가 필요

echo "⚠️  Firebase 보안 규칙 때문에 CLI로 직접 삭제할 수 없습니다."
echo ""
echo "다른 방법을 시도하겠습니다..."

