// 로그인 체감속도 회귀 테스트
// ─────────────────────────────────────────────────────────────
// 목적: 기존 구성원 재로그인 시 홈 화면(enterMemberHome)이
//   느린 교회설정 로드(loadChurchConfig→getConfig 네트워크)를
//   "기다리지 않고" 먼저 렌더되는지 검증한다.
//
// 배경(회귀 방지):
//   과거 _enterFoundFamily 는 `await loadChurchConfig(); enterMemberHome();`
//   순서라, getConfig(실측 0.5~1.4s)가 끝날 때까지 홈이 안 떠서 로그인 반응이 느렸다.
//   수정: `enterMemberHome(); loadChurchConfig().catch(()=>{});`
//   → 홈을 즉시 그리고 설정은 백그라운드로 로드(subscribeConfig 가 도착 시 재렌더).
//
// 이 테스트는 app-core.js 의 _enterFoundFamily 소스에서 두 호출의 "텍스트 순서"와
//   loadChurchConfig 가 await 되지 않는지를 정적 검증하고,
//   동작 모델로 "홈이 config 완료 전에 렌더됨"을 시뮬레이션한다.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0;
function ok(cond, msg){ assert.ok(cond, msg); console.log('✅', msg); pass++; }

const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'app-core.js'), 'utf8');

// ── 1) _enterFoundFamily 본문 추출 ──
const startIdx = src.indexOf('async function _enterFoundFamily');
assert.ok(startIdx >= 0, '_enterFoundFamily 함수 존재');
const bodyEnd = src.indexOf('\n}', startIdx);
// 주석(//… 한 줄 주석)을 라인 단위로 제거해 "실제 코드"만 정적 분석한다.
const codeOnly = src.slice(startIdx, bodyEnd)
  .split('\n')
  .filter(l => !l.trim().startsWith('//'))
  .join('\n');

// ── 2) 정적 검증: 실제 코드에서 enterMemberHome() 가 loadChurchConfig 호출보다 먼저 나온다 ──
const homeAt = codeOnly.indexOf('enterMemberHome()');
const cfgAt = codeOnly.indexOf('loadChurchConfig()');
ok(homeAt >= 0 && cfgAt >= 0, '_enterFoundFamily 실제 코드에 두 호출 모두 존재');
ok(homeAt < cfgAt, '홈 렌더(enterMemberHome)가 교회설정 로드보다 먼저 호출됨');

// ── 3) 정적 검증: loadChurchConfig 는 await 되지 않는다(홈 렌더를 막지 않음) ──
ok(!/await\s+loadChurchConfig\s*\(\)/.test(codeOnly),
   '_enterFoundFamily 에서 loadChurchConfig 를 await 로 블로킹하지 않음');
ok(/loadChurchConfig\(\)\.catch/.test(codeOnly),
   'loadChurchConfig 는 백그라운드(.catch)로 fire-and-forget 호출됨');

// ── 4) 동작 시뮬레이션: 홈이 config 완료 전에 렌더되는가 ──
(async () => {
  const events = [];
  // 느린 config 로드(500ms) 모의
  const loadChurchConfig = () => new Promise(res => setTimeout(() => { events.push('config-done'); res(); }, 50));
  const enterMemberHome = () => { events.push('home-rendered'); };

  // 수정된 코드 패턴 재현
  enterMemberHome();
  loadChurchConfig().catch(() => {});

  // 다음 틱: 홈은 이미 렌더됨, config 는 아직 진행 중
  await new Promise(r => setImmediate(r));
  ok(events[0] === 'home-rendered', '홈이 최초에 즉시 렌더됨(설정 완료 대기 없음)');
  ok(!events.includes('config-done'), '이 시점(직후)엔 config 아직 미완료 — 홈은 이미 표시됨');

  // config 완료를 기다리면 뒤늦게 도착(백그라운드)
  await new Promise(r => setTimeout(r, 80));
  ok(events.includes('config-done'), 'config 는 백그라운드로 뒤이어 완료(subscribeConfig 재렌더)');

  console.log(`\n🎉 로그인 렌더 타이밍 통과 ${pass}/${pass}`);
})();
