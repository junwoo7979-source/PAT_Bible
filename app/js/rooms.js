// ====== PAT Bible — rooms.js ======
// 2단계: 다중 소속(한 사람이 여러 방에 속함) — 내 방 목록 + 전환 + 추가.
//  - "활성 방"은 기존 그대로(pat_family_id / pat_family_profile). 모든 기존 로직 무변경.
//  - 이 파일은 그 위에 '내 방 목록(pat_rooms)'과 전환/추가 UI만 얹는다.
//  ⚠️ 수행 기록(records/pat_hist)·삭제 로직은 전혀 건드리지 않는다.

// ── 방 목록 저장소 ──────────────────────────────────────────────
function loadRooms(){
  try{ const a = JSON.parse(localStorage.getItem('pat_rooms') || '[]'); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function saveRooms(rooms){
  try{ localStorage.setItem('pat_rooms', JSON.stringify(Array.isArray(rooms)?rooms:[])); }catch(e){}
}
// familyId 기준 upsert(중복 없이 누적). 절대 다른 방을 지우지 않음.
function upsertRoom(entry){
  if(!entry || !entry.familyId) return;
  const rooms = loadRooms();
  const clean = {
    familyId:   entry.familyId,
    roomName:   entry.roomName || '',
    leaderName: entry.leaderName || '',
    parish:     entry.parish || '',
    district:   entry.district || '',
    groupType:  (entry.groupType === '구역') ? '구역' : '가정',
    familyPassword: entry.familyPassword || '',
    memberName: entry.memberName || '',
    isLeader:   !!entry.isLeader,
    members:    Array.isArray(entry.members) ? entry.members : undefined,
  };
  // undefined 필드는 기존값 보존
  Object.keys(clean).forEach(k => clean[k] === undefined && delete clean[k]);
  const i = rooms.findIndex(r => r.familyId === entry.familyId);
  if(i >= 0) rooms[i] = { ...rooms[i], ...clean };
  else rooms.push(clean);
  saveRooms(rooms);
}
// 방 목록 항목 → 활성 프로필 객체
function roomToProfile(r){
  return {
    roomName: r.roomName || '',
    leaderName: r.leaderName || '',
    parish: r.parish || '',
    district: r.district || '',
    groupType: (r.groupType === '구역') ? '구역' : '가정',
    familyPassword: r.familyPassword || '',
    memberName: r.memberName || r.leaderName || '',
    members: Array.isArray(r.members) ? r.members : (r.leaderName ? [r.leaderName] : []),
    isLeader: !!r.isLeader,
  };
}
// 기존 단일방 사용자 → 현재 활성방을 목록에 시드(최초 1회)
function seedRoomsIfNeeded(){
  try{
    const fid = localStorage.getItem('pat_family_id') || '';
    if(!fid) return;
    if(loadRooms().some(r => r.familyId === fid)) return;
    const prof = (typeof loadFamilyProfile === 'function') ? loadFamilyProfile() : null;
    if(prof) upsertRoom({ familyId: fid, ...prof });
  }catch(e){}
}

// ── 방 전환 ─────────────────────────────────────────────────────
function switchActiveRoom(familyId){
  const r = loadRooms().find(x => x.familyId === familyId);
  if(!r) return;
  const cur = localStorage.getItem('pat_family_id') || '';
  if(cur === familyId){ return; } // 이미 활성
  localStorage.setItem('pat_family_id', familyId);
  const prof = roomToProfile(r);
  if(typeof setFamilyStorage === 'function') setFamilyStorage('pat_family_profile', JSON.stringify(prof));
  else localStorage.setItem('pat_family_profile', JSON.stringify(prof));
  if(typeof toast === 'function') toast('✓ ' + (prof.roomName || '방') + '(으)로 전환');
  if(typeof renderFamily === 'function') renderFamily();
}

// ── 방 전환/추가 UI 렌더 ────────────────────────────────────────
function renderRoomSwitcher(){
  const el = document.getElementById('roomSwitcher');
  if(!el) return;
  const rooms = loadRooms();
  const activeId = localStorage.getItem('pat_family_id') || '';
  const addBtn = `<button class="btn ghost" style="margin:0;padding:8px 12px;font-size:calc(var(--fs)-2px)" onclick="openAddRoom()">➕ 다른 모임 추가</button>`;

  if(rooms.length <= 1){
    // 방이 0~1개면 추가 버튼만 (필요할 때만 노출)
    el.innerHTML = rooms.length ? `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">${addBtn}</div>` : '';
    return;
  }
  const chips = rooms.map(r => {
    const on = r.familyId === activeId;
    const gl = (typeof groupLabels === 'function') ? groupLabels((r.groupType==='구역')?'구역':'가정') : { icon:'🏠' };
    const nm = r.roomName || (gl.room || '방');
    return `<button onclick="switchActiveRoom('${r.familyId}')"
      style="flex:0 0 auto;padding:7px 12px;border-radius:999px;border:1px solid var(--line);cursor:pointer;font-weight:700;font-size:calc(var(--fs)-2px);${on?'background:var(--accent);color:#fff':'background:var(--surface);color:var(--text)'}">
      ${gl.icon} ${(typeof esc==='function'?esc(nm):nm)}</button>`;
  }).join('');
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
      <span class="muted" style="font-size:calc(var(--fs)-3px)">내 모임 전환</span>${addBtn}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${chips}</div>`;
}

// ── 다른 방 추가 흐름 ───────────────────────────────────────────
function openAddRoom(){ if(typeof go === 'function') go('s-add-room'); }
// 새 방 만들기(대표/구역장) — 기존 활성방을 건드리지 않고 빈 등록폼
function startCreateRoom(){
  window._creatingNewRoom = true;
  if(typeof openFamilyRegister === 'function') openFamilyRegister('leader');
}
function openJoinAnotherRoom(){
  const n = document.getElementById('joinRoomName');  if(n) n.value = '';
  const p = document.getElementById('joinRoomPw');    if(p) p.value = '';
  if(typeof go === 'function') go('s-join-room');
}
// 기존 방 참여(비밀번호) — 현재 활성방과 무관하게 전역 검색 후 추가/전환
async function joinAnotherRoom(){
  const name = (document.getElementById('joinRoomName')?.value || '').trim();
  const pw   = (document.getElementById('joinRoomPw')?.value || '').trim();
  if(!name){ if(typeof toast==='function') toast('내 이름을 입력하세요'); return; }
  if(!pw){   if(typeof toast==='function') toast('모임 비밀번호를 입력하세요'); return; }
  if(!(window.PAT_DB && PAT_DB.ready() && PAT_DB.findFamilyByPasswordGlobal)){
    if(typeof toast==='function') toast('서버 연결이 필요합니다'); return;
  }
  let found = null;
  try{ found = await PAT_DB.findFamilyByPasswordGlobal(DB.church.code, pw); }
  catch(e){ if(typeof toast==='function') toast('서버 오류입니다. 다시 시도하세요'); return; }
  if(!found || !found.id){ if(typeof toast==='function') toast('비밀번호에 맞는 모임을 찾을 수 없습니다'); return; }

  const members = Array.isArray(found.members) ? found.members.slice() : [];
  if(!members.includes(name)) members.push(name);
  const profile = {
    roomName: found.roomName || '', leaderName: found.leaderName || '',
    parish: found.parish || '', district: found.district || '',
    groupType: (found.groupType === '구역') ? '구역' : '가정',
    familyPassword: pw, memberName: name, members, isLeader: false,
  };
  try{ await PAT_DB.joinFamily(DB.church.code, found.id, name); }catch(e){}
  upsertRoom({ familyId: found.id, ...profile });
  // 활성 방을 새로 참여한 방으로 전환
  localStorage.setItem('pat_family_id', found.id);
  if(typeof setFamilyStorage === 'function') setFamilyStorage('pat_family_profile', JSON.stringify(profile));
  if(typeof renderFamily === 'function') renderFamily();
  if(typeof go === 'function') go('s-family');
  if(typeof toast === 'function') toast('✓ ' + (found.roomName || '모임') + '에 참여했습니다! 🎉');
}
