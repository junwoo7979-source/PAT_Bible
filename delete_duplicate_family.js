#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs');

// Firebase 초기화
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account-key.json';

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ service-account-key.json을 찾을 수 없습니다');
  console.error('경로:', serviceAccountPath);
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://pat-bible-app.firebaseio.com'
});

const db = admin.firestore();

async function deleteDuplicateFamily() {
  try {
    console.log('🔍 세광교회(11111) 가족 목록 조회 중...');

    const churchCode = '11111';
    const familiesRef = db.collection('churches').doc(churchCode).collection('families');
    const snapshot = await familiesRef.get();

    console.log(`\n📋 총 ${snapshot.size}개 가족 발견:\n`);

    const families = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      families.push({
        id: doc.id,
        roomName: data.roomName || 'N/A',
        leaderName: data.leaderName || 'N/A',
        createdAt: data.createdAt || 'N/A'
      });

      console.log(`  [${doc.id}]`);
      console.log(`    가족방명: ${data.roomName}`);
      console.log(`    대표명: ${data.leaderName}`);
      console.log(`    생성시간: ${data.createdAt || 'N/A'}`);
      console.log('');
    });

    // 테스트 가족 찾기
    const testFamily = families.find(f =>
      f.roomName.includes('테스트') || f.leaderName.includes('테스트')
    );

    if (!testFamily) {
      console.log('⚠️  테스트 가족을 찾을 수 없습니다.');
      console.log('실제 등록 가족만 있는 것 같습니다. ✅');
      process.exit(0);
    }

    console.log(`\n🗑️  삭제 대상: [${testFamily.id}] ${testFamily.roomName} (대표: ${testFamily.leaderName})`);
    console.log(`\n⚠️  확인: 이 가족을 삭제하시겠습니까? (y/N)`);

    // 자동 확인 (스크립트 실행)
    const args = process.argv[2];
    if (args === '--auto') {
      console.log('✅ 자동 삭제 모드입니다.\n');

      await familiesRef.doc(testFamily.id).delete();
      console.log(`🗑️  삭제 완료: [${testFamily.id}] ${testFamily.roomName}\n`);

      // 삭제 후 확인
      const afterSnapshot = await familiesRef.get();
      console.log(`✅ 삭제 후 가족 수: ${afterSnapshot.size}개\n`);

      afterSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`  ✓ [${doc.id}] ${data.roomName} (대표: ${data.leaderName})`);
      });

      console.log('\n✅ 중복 가족 삭제 완료!');
    } else {
      console.log('수동 확인이 필요합니다. --auto 플래그를 사용하여 자동 삭제하세요:');
      console.log('  node delete_duplicate_family.js --auto');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

deleteDuplicateFamily();
