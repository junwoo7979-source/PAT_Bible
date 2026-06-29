const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:9222/devtools/page/1067');

ws.on('open', () => {
  const cmd = {
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `JSON.stringify({
        family_id: localStorage.getItem('pat_family_id'),
        family_profile: localStorage.getItem('pat_family_profile'),
        leader_profile: localStorage.getItem('pat_leader_family_profile'),
        church_code: localStorage.getItem('pat_church_code'),
        current_hash: location.hash
      })`,
      returnByValue: true
    }
  };
  ws.send(JSON.stringify(cmd));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id === 1) {
    const result = JSON.parse(msg.result.result.value);
    console.log('\n📱 폰 앱 localStorage 현재 상태:\n');
    console.log('현재 화면:', result.current_hash);
    console.log('교회코드:', result.church_code);
    console.log('pat_family_id:', result.family_id || '❌ 없음');
    console.log('pat_family_profile:', result.family_profile ? '✅ 있음 → ' + result.family_profile.substring(0, 80) + '...' : '❌ 없음');
    console.log('pat_leader_family_profile:', result.leader_profile ? '✅ 있음 → ' + result.leader_profile.substring(0, 80) + '...' : '❌ 없음');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => {
  console.error('❌ WebSocket 오류:', e.message);
  process.exit(1);
});
