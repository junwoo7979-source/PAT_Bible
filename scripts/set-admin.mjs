// ====== PAT Bible — scripts/set-admin.mjs ======
// 최초(또는 추가) 플랫폼 관리자에게 Custom Claim { admin: true } 를 부여하는 Admin SDK 스크립트.
//
// ⚠️ 이 작업은 개발자가 로컬/서버 안전 환경에서만 실행한다.
//    브라우저/클라이언트에서는 절대 실행할 수 없다(Admin SDK 전용).
//
// 인증(둘 중 하나):
//   (권장) Application Default Credentials(ADC):
//       gcloud auth application-default login
//       gcloud config set project pat-bible-app
//   (대안) 서비스 계정 키 파일 경로를 환경변수로:
//       export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/serviceAccountKey.json
//    ※ 서비스 계정 키는 저장소에 커밋 금지(.gitignore에 serviceAccountKey.json 등록됨).
//
// 사용법:
//   node scripts/set-admin.mjs <UID>              # admin 부여
//   node scripts/set-admin.mjs <UID> --revoke     # admin 회수
//   node scripts/set-admin.mjs --email <EMAIL>    # 이메일로 UID 조회 후 부여
//
// 실행 후: 대상 사용자는 로그아웃 후 재로그인(또는 토큰 새로고침)해야 claim이 반영됨.

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import readline from 'node:readline';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'pat-bible-app';

function initAdmin() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) {
    // 키 파일이 지정된 경우
    return initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  // ADC 사용
  return initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const emailFlagIdx = args.indexOf('--email');
  const emailMode = emailFlagIdx !== -1;

  initAdmin();
  const auth = getAuth();

  // 대상 UID 결정
  let uid;
  let userRecord;
  if (emailMode) {
    const email = args[emailFlagIdx + 1];
    if (!email) { console.error('❌ --email 뒤에 이메일을 입력하세요.'); process.exit(1); }
    userRecord = await auth.getUserByEmail(email);
    uid = userRecord.uid;
  } else {
    uid = args.find((a) => !a.startsWith('--'));
    if (!uid) {
      console.error('❌ UID를 입력하세요.  예: node scripts/set-admin.mjs <UID>');
      process.exit(1);
    }
    userRecord = await auth.getUser(uid);
  }

  // 대상 확인(실수 방지)
  console.log('──────────────────────────────────────────────');
  console.log('  프로젝트 :', PROJECT_ID);
  console.log('  대상 UID :', uid);
  console.log('  이메일   :', userRecord.email || '(없음)');
  console.log('  현재 claim:', JSON.stringify(userRecord.customClaims || {}));
  console.log('  작업     :', revoke ? 'admin 권한 회수(admin=false)' : 'admin 권한 부여(admin=true)');
  console.log('──────────────────────────────────────────────');

  const yes = await ask('위 대상에게 작업을 진행할까요? (yes 입력 시 진행) > ');
  if (yes.toLowerCase() !== 'yes') {
    console.log('취소했습니다.');
    process.exit(0);
  }

  const nextClaims = { ...(userRecord.customClaims || {}) };
  if (revoke) delete nextClaims.admin;
  else nextClaims.admin = true;

  await auth.setCustomUserClaims(uid, nextClaims);

  console.log('✅ 완료. 새 claim:', JSON.stringify(nextClaims));
  console.log('ℹ️  대상 사용자는 로그아웃 후 재로그인(또는 토큰 새로고침)해야 반영됩니다.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ 실패:', e.message);
  process.exit(1);
});
