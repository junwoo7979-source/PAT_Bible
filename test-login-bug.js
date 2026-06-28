const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 700 });
  p.on('pageerror', e => { if(!/Unexpected token '<'/.test(e.message)) console.log('  [pageerror]', e.message.slice(0,140)); });
  const visibleScreens = () => p.evaluate(() => {
    const out = {};
    document.querySelectorAll('.screen').forEach(s => {
      const cs = getComputedStyle(s);
      if(cs.display !== 'none') out[s.id] = { active: s.classList.contains('active'), display: cs.display };
    });
    return { active: document.querySelector('.screen.active')?.id, visible: out, bodyScrollH: document.body.scrollHeight, winH: window.innerHeight };
  });
  try {
    // A. 완전 초기(LS 비움) — 로그인 화면
    await p.goto('https://pat-bible-app.web.app/index.html', { waitUntil:'networkidle2' });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil:'networkidle2' }); await sleep(600);
    console.log('A. 초기상태:', JSON.stringify(await visibleScreens()));

    // B. 가족 프로필 있는 상태에서 새로고침 (자동 라우팅?)
    await p.evaluate(() => {
      localStorage.setItem('pat_family_profile', JSON.stringify({ roomName:'테스트', leaderName:'홍', parish:'1교구', members:['홍'] }));
      localStorage.setItem('pat_church_name','세광교회');
    });
    await p.reload({ waitUntil:'networkidle2' }); await sleep(800);
    console.log('B. 프로필 있을 때 새로고침:', JSON.stringify(await visibleScreens()));

    // C. 로그인 화면으로 이동(프로필 남긴 채) 후 새로고침 — 로그아웃 안 한 채 로그인화면
    await p.evaluate(() => { if(typeof go==='function') go('s-login'); });
    await sleep(300);
    console.log('C. 프로필 남긴 채 s-login:', JSON.stringify(await visibleScreens()));
    await p.reload({ waitUntil:'networkidle2' }); await sleep(800);
    console.log('C2. 그 상태로 새로고침:', JSON.stringify(await visibleScreens()));

    // D. 정식 로그아웃 후 새로고침
    await p.evaluate(() => { if(typeof memberLogout==='function') memberLogout(); });
    await sleep(300);
    await p.reload({ waitUntil:'networkidle2' }); await sleep(800);
    console.log('D. memberLogout 후 새로고침:', JSON.stringify(await visibleScreens()));
  } catch(e){ console.log('예외:', e.message); }
  await b.close();
})();
