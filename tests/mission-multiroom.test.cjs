'use strict';
// 3단계: 1회 완료 → 속한 모든 그룹에 반영 테스트
//  completeMemorize 호출 시, pat_rooms의 각 방마다 saveRecordCtx가 1번씩
//  '그 방의 컨텍스트(familyId/이름/종류)'로 호출되는지 검증.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'app/js/app-core.js', 'app/js/verse.js', 'app/js/family.js',
  'app/js/voice.js', 'app/js/voice-ui.js', 'app/js/memorize.js',
  'app/js/rooms.js', 'app/js/history.js',
];
const script = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

function makeContext() {
  const storage = new Map();
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value:'', textContent:'', innerHTML:'', style:{}, dataset:{},
      classList:{ add(){}, remove(){}, toggle(){} }, addEventListener(){}, focus(){}, appendChild(){}, remove(){},
    });
    return elements.get(id);
  };
  const localStorage = {
    getItem(k){ return storage.has(k)?storage.get(k):null; },
    setItem(k,v){ storage.set(k,String(v)); },
    removeItem(k){ storage.delete(k); },
    get length(){ return storage.size; }, key(i){ return Array.from(storage.keys())[i] ?? null; },
  };
  const ctx = {
    console:{ log(){}, warn(){}, error(){} },
    Date, JSON, Math, Array, Object, String, Number, Set, Map, URLSearchParams,
    encodeURIComponent, decodeURIComponent,
    setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0,
    addEventListener:()=>{}, removeEventListener:()=>{},
    navigator:{ userAgent:'node' },
    location:{ search:'', pathname:'/', origin:'http://t', href:'http://t/' },
    localStorage, _storage:storage,
    sessionStorage:{ getItem:()=>null, setItem(){}, removeItem(){} },
    document:{ readyState:'loading', documentElement:{ getAttribute:()=>'dark', setAttribute(){} },
      getElementById:getElement, querySelectorAll:()=>[], createElement:()=>getElement('_t'), addEventListener(){} },
    window:{},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  // 렌더/화면 전환 무력화
  ctx.renderSteps = ()=>{}; ctx.go = ()=>{}; ctx.renderFamily = ()=>{}; ctx.toast = ()=>{};
  ctx.saveMemorizeState = ()=>{};
  return ctx;
}

(function testCompletionWritesAllRooms() {
  const ctx = makeContext();
  // 두 방 소속: 가족(아빠) + 구역(아빠)
  ctx._storage.set('pat_rooms', JSON.stringify([
    { familyId:'fam1', roomName:'우리가족', groupType:'가정', parish:'1교구', district:'3구역', leaderName:'아빠', memberName:'아빠' },
    { familyId:'guy1', roomName:'3구역모임', groupType:'구역', parish:'1교구', district:'3구역', leaderName:'김장로', memberName:'아빠' },
  ]));
  ctx._storage.set('pat_family_id', 'fam1');
  ctx._storage.set('pat_family_profile', JSON.stringify({ roomName:'우리가족', groupType:'가정', memberName:'아빠', members:['아빠'] }));

  // PAT_DB 모킹 — saveRecordCtx 호출 캡처
  const calls = [];
  ctx.PAT_DB = {
    ready: () => true,
    saveRecordCtx: (church, record, c) => { calls.push(c); return Promise.resolve(true); },
    saveRecord: () => { calls.push({ _fallback:true }); return Promise.resolve(true); },
  };

  ctx.completeMemorize();

  assert.equal(calls.length, 2, '두 방에 각각 1건씩 기록 → saveRecordCtx 2회');
  const fids = calls.map(c => c.familyId).sort();
  assert.deepEqual(fids, ['fam1','guy1'], '두 방(fam1, guy1) 모두 기록');
  const guy = calls.find(c => c.familyId === 'guy1');
  assert.equal(guy.groupType, '구역', '구역 방은 groupType=구역으로 기록');
  assert.equal(guy.memberName, '아빠', '구역 방에도 본인 이름으로 기록');
  assert.ok(!calls.some(c => c._fallback), '방 목록이 있으면 폴백(saveRecord) 미사용');
  console.log('  ✓ 1회 완료 → 속한 모든 방(가정+구역)에 기록');
})();

(function testFallbackNoRooms() {
  const ctx = makeContext();
  ctx._storage.set('pat_family_id', 'famX');
  ctx._storage.set('pat_family_profile', JSON.stringify({ roomName:'단일가족', memberName:'엄마', members:['엄마'] }));
  // pat_rooms 없음 → 폴백
  const calls = [];
  ctx.PAT_DB = {
    ready: () => true,
    saveRecordCtx: (c,r,x) => { calls.push({ ctx:x }); return Promise.resolve(true); },
    saveRecord: () => { calls.push({ _fallback:true }); return Promise.resolve(true); },
  };
  ctx.completeMemorize();
  assert.equal(calls.length, 1, '방 목록 없으면 1건');
  assert.ok(calls[0]._fallback, '방 목록 없으면 활성 방 폴백(saveRecord)');
  console.log('  ✓ 방 목록 없으면 활성 방 폴백');
})();

console.log('\n✅ mission-multiroom: 모든 테스트 통과');
