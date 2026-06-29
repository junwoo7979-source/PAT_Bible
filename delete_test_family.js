const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

console.log('🔍 Firebase에서 "테스트가족방" 검색 중...\n');

// Firebase 초기화 (현재 로그인 상태 사용)
async function findAndDelete() {
  try {
    // 기본 설정으로 초기화
    let app;
    try {
      app = admin.app();
    } catch (e) {
      app = admin.initializeApp({
        projectId: 'pat-bible-app',
        databaseURL: 'https://pat-bible-app.firebaseio.com'
      });
    }
    
    const db = getFirestore(app);
    const churchCode = '11111';
    const familiesRef = db.collection('churches').doc(churchCode).collection('families');
    
    const snapshot = await familiesRef.get();
    
    console.log(`📋 세광교회(${churchCode})의 가족 목록:\n`);
    
    let testFamilyId = null;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const roomName = data.roomName || 'N/A';
      const leaderName = data.leaderName || 'N/A';
      
      console.log(`  [${doc.id}]`);
      console.log(`    가족방명: ${roomName}`);
      console.log(`    대표명: ${leaderName}\n`);
      
      // "테스트가족방" 찾기
      if (roomName === '테스트가족방') {
        testFamilyId = doc.id;
      }
    });
    
    if (!testFamilyId) {
      console.log('⚠️  "테스트가족방"을 찾을 수 없습니다.');
      console.log('다른 이름으로 등록되었을 수 있습니다.');
      process.exit(1);
    }
    
    // 삭제 진행
    console.log(`\n🗑️  삭제 대상: [${testFamilyId}] 테스트가족방`);
    console.log('삭제 중...\n');
    
    await familiesRef.doc(testFamilyId).delete();
    
    console.log('✅ 삭제 완료!\n');
    
    // 삭제 후 확인
    const afterSnapshot = await familiesRef.get();
    console.log(`✅ 현재 가족 수: ${afterSnapshot.size}개\n`);
    
    afterSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  ✓ [${doc.id}] ${data.roomName} (대표: ${data.leaderName})`);
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
    process.exit(1);
  }
}

findAndDelete();
