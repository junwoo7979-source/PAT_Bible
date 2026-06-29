const WebSocket = require('ws');

const familyId = 'mcZYCWhWozBjKAl8x5W9';
const profileData = {
  roomName: '예운네 말씀방',
  leaderName: '권호택',
  parish: '1교구',
  district: '134',
  familyPassword: '11111',
  members: ['권호택'],
  memberName: '권호택'
};
const backupData = { ...profileData, _familyId: familyId };

const ws = new WebSocket('ws://localhost:9222/devtools/page/1060');

ws.on('open', () => {
  const code = `
    localStorage.setItem('pat_family_id', '${familyId}');
    localStorage.setItem('pat_family_profile', ${JSON.stringify(JSON.stringify(profileData))});
    localStorage.setItem('pat_leader_family_profile', ${JSON.stringify(JSON.stringify(backupData))});
    JSON.stringify({
      family_id: localStorage.getItem('pat_family_id'),
      has_profile: !!localStorage.getItem('pat_family_profile'),
      has_leader: !!localStorage.getItem('pat_leader_family_profile')
    })
  `;
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: code, returnByValue: true } }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id === 1) {
    const result = JSON.parse(msg.result.result.value);
    console.log('\n✅ 폰 localStorage 복구 완료:');
    console.log('  pat_family_id:', result.family_id);
    console.log('  pat_family_profile:', result.has_profile ? '✅ 저장됨' : '❌');
    console.log('  pat_leader_family_profile:', result.has_leader ? '✅ 저장됨 (_familyId 포함)' : '❌');

    // 2단계: 페이지 리로드
    ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: 'location.reload()', returnByValue: true } }));
    setTimeout(() => { ws.close(); process.exit(0); }, 1000);
  }
});
ws.on('error', e => { console.error('오류:', e.message); process.exit(1); });
