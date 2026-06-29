const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:9222/devtools/page/1060');

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `JSON.stringify({
        family_id: localStorage.getItem('pat_family_id'),
        family_profile: localStorage.getItem('pat_family_profile'),
        leader_profile: localStorage.getItem('pat_leader_family_profile'),
        church_code: localStorage.getItem('pat_church_code'),
        hash: location.hash,
        all_keys: Object.keys(localStorage).filter(k=>k.startsWith('pat_'))
      })`,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id === 1) {
    try {
      const result = JSON.parse(msg.result.result.value);
      console.log('\n📱 탭 1060 localStorage:\n');
      console.log('현재 화면:', result.hash);
      console.log('교회코드:', result.church_code);
      console.log('pat_family_id:', result.family_id || '❌ 없음');
      console.log('pat_family_profile:', result.family_profile ? '✅' + result.family_profile.substring(0,60) : '❌ 없음');
      console.log('pat_leader_profile:', result.leader_profile ? '✅' + result.leader_profile.substring(0,60) : '❌ 없음');
      console.log('PAT 관련 키 전체:', result.all_keys);
    } catch(e) {
      console.log('파싱오류:', msg.result);
    }
    ws.close();
    process.exit(0);
  }
});
ws.on('error', e => { console.error('오류:', e.message); process.exit(1); });
setTimeout(() => { console.log('타임아웃'); process.exit(1); }, 5000);
