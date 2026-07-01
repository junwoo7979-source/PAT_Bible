/**
 * PAT Bible — Firebase 교회 초기화 스크립트
 *
 * 목적: 테스트용 교회 데이터 생성 (11111, 013579)
 * 실행: node functions/init-churches.js
 *
 * 이 스크립트는:
 * 1. 각 교회의 config/current 문서 생성
 * 2. 기본 구절 데이터 입력
 * 3. 앱 제목 설정
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Firebase 초기화 (환경에 맞춰 수정 필요)
try {
  initializeApp({
    projectId: 'pat-bible-app',
  });
} catch (e) {
  console.log('[INIT] Firebase already initialized');
}

const db = getFirestore();

async function initChurches() {
  console.log('[INIT] 교회 초기화 시작...');

  const churches = [
    {
      code: '11111',
      appTitle: '개발자 교회',
      verse: {
        ref: '요한복음 3:16',
        text: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라',
        weekOf: '2026년 7월 1주차'
      }
    },
    {
      code: '013579',
      appTitle: '교회',
      verse: {
        ref: '시편 100:1',
        text: '온 땅이여 여호와께 즐거워하라',
        weekOf: '2026년 7월 1주차'
      }
    }
  ];

  for (const church of churches) {
    try {
      console.log(`[INIT] ${church.code} 초기화 중...`);

      // 1️⃣ config/current 문서 생성
      const configRef = db.doc(`churches/${church.code}/config/current`);
      await configRef.set({
        appTitle: church.appTitle,
        verse: church.verse,
        parishTotals: {
          '1교구': 0,
          '2교구': 0,
          '3교구': 0,
          '블레싱': 0
        },
        parishConfig: {
          term: '교구',
          groups: ['1교구', '2교구', '3교구', '블레싱']
        },
        worship: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`✓ ${church.code} config 생성 완료`);

      // 2️⃣ verses 컬렉션에도 저장 (백업용)
      const versesRef = db.collection(`churches/${church.code}/verses`);
      await versesRef.add({
        ref: church.verse.ref,
        text: church.verse.text,
        weekOf: church.verse.weekOf,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log(`✓ ${church.code} verse 생성 완료`);

    } catch (e) {
      console.error(`❌ ${church.code} 초기화 실패:`, e.message);
    }
  }

  console.log('[INIT] 교회 초기화 완료!');
  process.exit(0);
}

initChurches().catch(e => {
  console.error('[INIT] 오류:', e);
  process.exit(1);
});
