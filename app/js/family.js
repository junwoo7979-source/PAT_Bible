// ====== PAT Bible — family.js ======
//
// [책임]
//  방(가족방/구역방) 정보 관리:
//  - 등록: openFamilyRegister(), saveFamilyProfileAsLeader()
//  - 조회: loadFamilyProfile(), getFamilyInfo()
//  - 구성원 관리: addMemberRow(), getMemberNames(), renderMemberRows()
//  - 클라우드 동기화: Firebase saveFamily(), findFamilyByPassword()
//  - 인증 유지: localStorage pat_family_profile, pat_family_id
//
// [데이터 구조]
//  pat_family_id: string
//    현재 입장한 방의 Firestore ID
//    로그아웃 시 삭제 (다른 방 정보 보호)
//
//  pat_family_profile: JSON
//    현재 방의 정보
//    {
//      id: string,
//      roomName: string,
//      leaderName: string,
//      familyPassword: string,
//      members: string[],      ← 대표가 선언한 구성원 명단
//      memberName: string,     ← 현재 기기의 입장자 이름
//      parish: string,
//      district: string,
//      groupType: 'family' | 'group'
//    }
//
//  pat_leader_family_profile: JSON (백업)
//    로그아웃 후에도 보존되는 대표 방 정보
//    로그아웃 시에도 삭제되지 않아 재입장 시 자동 복구됨
//
// [주의]
//  - pat_family_profile: 현재 입장한 방의 정보만
//  - 다른 방의 정보가 섞이지 않도록 방별 격리
//  - 로그아웃 시 pat_family_profile 삭제 (pat_family_id도)

// ────────────────────────────────────────────────────────────
// 스토리지 헬퍼
// ────────────────────────────────────────────────────────────

/**
 * setFamilyStorage(key, value)
 *
 * [목적]
 *  방 정보를 안전하게 저장한다.
 *  localStorage → sessionStorage 폴백으로 저장 실패 대응
 *
 * [예]
 *  setFamilyStorage('pat_family_profile', JSON.stringify(profile))
 */
function setFamilyStorage(key, value){
  // localStorage에 저장 시도
  try{
    localStorage.setItem(key, value);
    console.log('[PAT-LS] localStorage 저장 성공:', key.slice(0, 20) + '...');
  }catch(e) {
    console.warn('[PAT-LS] localStorage 저장 실패, sessionStorage 사용:', e.message);
    // localStorage 실패 시 sessionStorage에 백업
    try{
      sessionStorage.setItem(key, value);
      console.log('[PAT-LS] sessionStorage 저장 성공:', key.slice(0, 20) + '...');
    }catch(e2) {
      console.error('[PAT-LS] 모든 스토리지 저장 실패');
    }
  }
}

function loadFamilyProfile(){
  // localStorage 시도
  try{
    const val = localStorage.getItem('pat_family_profile');
    if(val) return JSON.parse(val);
  }catch(e) {
    console.warn('[PAT-LS] localStorage 접근 실패:', e.message);
  }

  // sessionStorage 백업 시도
  try{
    const val = sessionStorage.getItem('pat_family_profile');
    if(val) {
      console.log('[PAT-LS] sessionStorage에서 가족방 복원');
      return JSON.parse(val);
    }
  }catch(e) {}

  // ★ BUG-FIX: 대표 가족 정보 자동 복구 (로그아웃 후 재로그인 시)
  //   pat_leader_family_profile에서 복구하여 pat_family_profile에 다시 저장
  try{
    const leaderProfile = localStorage.getItem('pat_leader_family_profile');
    if(leaderProfile) {
      const profile = JSON.parse(leaderProfile);
      console.log('[PAT-FAMILY] 대표 가족 정보에서 자동 복구');
      setFamilyStorage('pat_family_profile', leaderProfile);
      // ★ pat_family_id도 함께 복구 (없을 경우에만 — 중복 생성 방지)
      if(profile._familyId && !localStorage.getItem('pat_family_id')) {
        localStorage.setItem('pat_family_id', profile._familyId);
        console.log('[PAT-FAMILY] pat_family_id 복구:', profile._familyId);
      }
      return profile;
    }
  }catch(e) {
    console.warn('[PAT-FAMILY] 대표 가족 정보 복구 실패:', e.message);
  }

  return null;
}
// ── 방 종류(가정/구역) 헬퍼 (1단계) ──────────────────────────
//   기존 데이터(누락)는 '가정'으로 간주 → 하위호환 100%.
function groupTypeOf(profile){
  const t = profile && profile.groupType;
  return (t === '구역') ? '구역' : '가정';
}
// 종류별 표시 라벨 모음 (UI 문구만 바뀜, 데이터/구조 동일)
function groupLabels(type){
  return (type === '구역')
    ? { room:'구역방', roomName:'구역 이름', leader:'구역장 이름', icon:'🧩', emptyTitle:'구역방' }
    : { room:'가족방', roomName:'가족방 이름', leader:'가족 대표 이름', icon:'👨‍👩‍👧', emptyTitle:'우리 가족방' };
}
function familyRoomName(profile){
  if(!profile) return '';
  return profile.roomName || (profile.memberName ? familyNameFromMember(profile.memberName) : '');
}
function familyNameFromMember(name){
  const last = name.charCodeAt(name.length-1);
  const hasBatchim = last >= 0xAC00 && last <= 0xD7A3 && ((last - 0xAC00) % 28) > 0;
  return name+(hasBatchim?'이네':'네')+' 가족';
}
function familyMemberNames(profile){
  if(!profile) return [];
  const names = Array.isArray(profile.members) ? profile.members.filter(Boolean) : [];
  const fallback = profile.leaderName || profile.memberName || '';
  if(fallback && !names.includes(fallback)) names.unshift(fallback);
  return names;
}
function normalizeFamilyMemberNames(members){
  if(!Array.isArray(members)) return [];
  const names = [];
  members.forEach(member => {
    const name = typeof member === 'string'
      ? member
      : (member && (member.displayName || member.name)) || '';
    const trimmed = String(name).trim();
    if(trimmed && !names.includes(trimmed)) names.push(trimmed);
  });
  return names;
}
async function refreshFamilyProfileByPassword(profile, password){
  if(!profile || !password || !window.PAT_DB || !PAT_DB.ready() || !PAT_DB.findFamilyByPassword) return profile;
  // ★ 가족방 초기화 버그 수정: 기본 비번이 교회코드로 공유되므로, familyId 없이 비번만으로
  //   조회하면 "다른 가족"이 매칭되어 내 프로필을 덮어쓴다(등록 직후 familyId 확정 전 특히).
  //   → familyId가 확정된 경우에만, 그리고 반환된 가족이 내 familyId와 일치할 때만 갱신.
  const myFamilyId = localStorage.getItem('pat_family_id') || '';
  if(!myFamilyId) return profile;
  try{
    const found = await PAT_DB.findFamilyByPassword(DB.church.code, password, myFamilyId);
    if(!found || !found.id || found.id !== myFamilyId) return profile;
    // ★ 버그 수정: found.members 는 대표가 "선언한 명단"만 담겨 입장만 한 구성원이 빠진다.
    //   이를 그대로 쓰면 로컬 프로필의 입장 구성원이 사라지고 분모가 줄어든다(0/1 등).
    //   → 로컬 보유 members(입장 구성원 포함) ∪ 서버 선언 members 의 합집합으로 보존.
    const serverMembers = normalizeFamilyMemberNames(found.members);
    const localMembers  = familyMemberNames(profile);
    const mergedMembers = Array.from(new Set(
      [...localMembers, ...serverMembers].map(s => String(s || '').trim()).filter(Boolean)
    ));
    const nextProfile = {
      ...profile,
      churchCode: DB.church.code,  // ★ 2026-07-01: churchCode 반드시 포함 (앱 로드 시 정확한 교회 사용)
      roomName: found.roomName || profile.roomName || '',
      leaderName: found.leaderName || profile.leaderName || '',
      parish: found.parish || profile.parish || '',
      district: found.district || profile.district || '',
      groupType: found.groupType || profile.groupType || '',
      familyPassword: password,
      memberName: profile.memberName || profile.leaderName || found.leaderName || '',
      members: mergedMembers.length ? mergedMembers : localMembers,
    };
    localStorage.setItem('pat_family_id', found.id);
    setFamilyStorage('pat_family_profile', JSON.stringify(nextProfile));
    // ★ Firebase 동기화 성공 시 백업도 갱신 (_familyId 포함)
    try {
      localStorage.setItem('pat_leader_family_profile', JSON.stringify({ ...nextProfile, _familyId: found.id }));
    } catch(e) {}
    return nextProfile;
  }catch(e){
    console.warn('[PAT] family reconnect failed:', e.message);
    return profile;
  }
}

// ★ 가족 데이터 없을 때 Firebase에서 자동 복구 시도
async function tryAutoRecoverFamily(){
  if(!window.PAT_DB || !PAT_DB.ready() || !DB.church?.code) return null;
  try{
    const res = await fetch(`https://us-central1-pat-bible-app.cloudfunctions.net/getFamiliesList?churchCode=${DB.church.code}`);
    const data = await res.json();
    if(!data.families || data.families.length === 0) return null;

    // 1) 가족이 1개뿐이면 그게 내 가족 (단일 기기 교회)
    // 2) pat_member_confirmed에 이름이 있으면 매칭
    const confirmedNames = Object.keys(JSON.parse(localStorage.getItem('pat_member_confirmed') || '{}'));
    let match = null;

    // ★ 보안(C): 단일 가족이어도 '이름 확인(pat_member_confirmed)'이 있을 때만 자동 복구.
    //   (빈 기기에서 교회코드만으로 그 가족 방이 무단 노출되는 것을 차단)
    if(confirmedNames.length){
      match = data.families.find(f =>
        f.memberNames.some(n => confirmedNames.includes(n)) ||
        confirmedNames.includes(f.leaderName)
      );
    }

    if(!match) return null;

    const profileData = {
      churchCode: DB.church.code,  // ★ 2026-07-01: churchCode 반드시 포함
      roomName: match.roomName,
      leaderName: match.leaderName,
      parish: match.parish,
      district: match.district || '',
      groupType: match.groupType || '',
      familyPassword: '',  // ★ BUG-FIX: 초기값을 빈 문자열로 변경 (교회코드가 아닌 실제 비밀번호만 저장)
      members: match.memberNames,
      memberName: confirmedNames.find(n => match.memberNames.includes(n)) || match.leaderName,
      _familyId: match.familyId
    };

    localStorage.setItem('pat_family_id', match.familyId);
    setFamilyStorage('pat_family_profile', JSON.stringify(profileData));
    localStorage.setItem('pat_leader_family_profile', JSON.stringify(profileData));
    console.log('[PAT-FAMILY] Firebase 자동 복구 완료:', match.roomName);
    return profileData;
  }catch(e){
    console.warn('[PAT-FAMILY] 자동 복구 실패:', e.message);
    return null;
  }
}

// ── 가족방 프로필 렌더링 ──────────────────────────────────
function renderFamilyProfile(){
  const profile = loadFamilyProfile();
  const roomName = familyRoomName(profile);
  const L = groupLabels(groupTypeOf(profile));
  document.getElementById('familyRoomTitle').textContent = profile
    ? `${L.icon} ${roomName || L.emptyTitle}`
    : `${L.icon} ${L.emptyTitle}`;
  if(profile){
    const parishLabel   = profile.parish   ? (/교구$/.test(profile.parish)   ? profile.parish   : profile.parish+'교구')   : '';
    const districtLabel = profile.district ? (/구역$/.test(profile.district) ? profile.district : profile.district+'구역') : '';
    const leaderTitle   = groupTypeOf(profile) === '구역' ? '구역장 ' : '대표 ';
    const leaderLabel   = profile.leaderName ? leaderTitle+profile.leaderName : (profile.memberName || '');
    const parts = [leaderLabel, parishLabel, districtLabel].filter(Boolean);
    document.getElementById('familyProfile').textContent = parts.join(' ');
  } else {
    document.getElementById('familyProfile').textContent = '방을 등록해주세요';
  }
  // ★ 가족방 정보가 업데이트되면 등록된 가족방 카드도 즉시 반영
  renderRegisteredFamilyRoom();
}
function renderRegisteredFamilyRoom(){
  const nameEl    = document.getElementById('registeredFamilyRoomName');
  const metaEl    = document.getElementById('registeredFamilyRoomMeta');
  const membersEl = document.getElementById('registeredFamilyMembers');
  if(!nameEl || !metaEl) return;
  const profile  = loadFamilyProfile();
  const roomName = familyRoomName(profile);
  if(profile && roomName){
    const parishLabel   = profile.parish   ? (/교구$/.test(profile.parish)   ? profile.parish   : profile.parish+'교구')   : '';
    const districtLabel = profile.district ? (/구역$/.test(profile.district) ? profile.district : profile.district+'구역') : '';
    const leaderLabel   = profile.leaderName ? '대표 '+profile.leaderName : (profile.memberName ? profile.memberName+' 등록됨' : '');
    nameEl.textContent = roomName;
    metaEl.textContent = [leaderLabel, parishLabel, districtLabel].filter(Boolean).join(' ');
    if(membersEl){
      const names = familyMemberNames(profile);
      membersEl.innerHTML = names.length
        ? `<div class="family-member-chips">${names.map(name=>{
            const canDelete    = name !== profile.leaderName;
            const arming       = (_famDelArm.name === name && _famDelArm.count > 0);
            const deleteButton = canDelete
              ? `<button class="family-member-delete" onclick="armDeleteFamilyMember('${encodeURIComponent(name)}')">${arming?`한 번 더 (${3-_famDelArm.count})`:'삭제'}</button>`
              : '';
            return `<span class="family-member-chip">${esc(name)}<small>등록</small>${deleteButton}</span>`;
          }).join('')}</div>`
        : '<p class="muted" style="margin:0">등록된 구성원이 없습니다</p>';
    }
  } else {
    nameEl.textContent = '등록된 가족방이 없습니다';
    metaEl.textContent = '대표 등록을 먼저 하거나 초대 링크로 참여하세요';
    if(membersEl) membersEl.innerHTML = '';
  }
}

// ── 탭 전환 / 구성원 삭제 ────────────────────────────────
function switchRegTab(tab){
  const isLeader = tab==='leader';
  document.getElementById('panelLeader').style.display = isLeader?'':'none';
  document.getElementById('panelMember').style.display = isLeader?'none':'';
  document.getElementById('tabLeader').style.background = isLeader?'var(--accent)':'var(--surface)';
  document.getElementById('tabLeader').style.color      = isLeader?'#fff':'var(--text)';
  document.getElementById('tabMember').style.background = isLeader?'var(--surface)':'var(--accent)';
  document.getElementById('tabMember').style.color      = isLeader?'var(--text)':'#fff';
  renderRegisteredFamilyRoom();
}
// ── 삭제 안전장치(v119): '3번 연속 터치'로만 삭제 실행 ───────────────
//   실수 터치로 즉시 삭제되는 것을 막는다. 진행 카운트는 전역 상태로 보관해
//   1초 폴링 재렌더(renderFamilyMemberList)에도 유지된다. 일정시간(3초) 내
//   다음 터치가 없으면 카운트 자동 리셋.
let _famDelArm = { name: '', count: 0, timer: null };
function _resetFamDelArm(){
  if(_famDelArm.timer){ try{ clearTimeout(_famDelArm.timer); }catch(e){} }
  _famDelArm = { name: '', count: 0, timer: null };
}
function _rerenderMemberListSafe(){
  try{ if(Array.isArray(DB.members)) renderFamilyMemberList(DB.members); }catch(e){}
}
function armDeleteFamilyMember(encodedName){
  const name = decodeURIComponent(encodedName);
  // 다른 구성원 버튼을 누르면 카운트 새로 시작
  if(_famDelArm.name !== name){ _resetFamDelArm(); _famDelArm.name = name; }
  if(_famDelArm.timer){ try{ clearTimeout(_famDelArm.timer); }catch(e){} _famDelArm.timer = null; }
  _famDelArm.count += 1;

  if(_famDelArm.count >= 3){
    const target = name;
    _resetFamDelArm();
    deleteFamilyMember(encodeURIComponent(target));   // 3번째 → 실제 삭제
    return;
  }
  if(_famDelArm.count === 1 && typeof toast === 'function'){
    toast('실수 방지 — 삭제하려면 3번 연속 누르세요');
  }
  // 3초 내 다음 터치 없으면 리셋(원상복구)
  _famDelArm.timer = setTimeout(()=>{ _resetFamDelArm(); _rerenderMemberListSafe(); }, 3000);
  _rerenderMemberListSafe();   // 버튼 라벨 즉시 "한 번 더 (N)"로 갱신
}

// ★★ 데이터 분리 원칙(v117): 구성원 삭제는 '가족방 명단(roster) 정보'만 변경한다.
//   - 변경 대상: pat_family_profile.members / 서버 family 문서 members 배열 + 입장기록(서브컬렉션)
//   - 절대 미접촉: pat_records(미션 수행 기록), pat_prayer_*, pat_read_done_*, 서버 records 컬렉션
//   서버 records를 지우는 함수는 deleteFamily(관리자 전용)뿐이며, 이 경로에서는 호출하지 않는다.
//   ※ 실삭제 게이트는 armDeleteFamilyMember(3연속 터치)가 담당 — 직접 호출 시 즉시 삭제됨.
async function deleteFamilyMember(encodedName){
  const name    = decodeURIComponent(encodedName);
  const profile = loadFamilyProfile();
  if(!profile) return;

  // ★ 대표 포함 전체 명단(familyMemberNames)에서 제외 — members 배열에 대표가
  //   없더라도 fallback으로 다시 살아나지 않도록 전체 명단 기준으로 재구성.
  const members     = familyMemberNames(profile).filter(member => member !== name);
  const nextProfile = { ...profile, members };

  // ★ 대표(leaderName) 삭제 시 → 남은 첫 구성원으로 대표 승계(없으면 비움).
  //   안 비우면 familyMemberNames fallback / 서버 폴링이 옛 대표를 부활시킴.
  if(profile.leaderName === name){
    nextProfile.leaderName = members[0] || '';
  }
  // ★ 이 기기 사용자(memberName) 삭제 시 → 대표/남은 구성원으로 대체
  if(profile.memberName === name){
    nextProfile.memberName = nextProfile.leaderName || members[0] || '';
  }

  setFamilyStorage('pat_family_profile', JSON.stringify(nextProfile));
  // ★ 대표 백업도 동기화 (자동복구가 옛 명단/옛 대표를 되살리지 않도록)
  try{
    const fid = localStorage.getItem('pat_family_id') || '';
    localStorage.setItem('pat_leader_family_profile', JSON.stringify({ ...nextProfile, _familyId: fid }));
  }catch(e){}

  if(window.PAT_DB && PAT_DB.ready()){
    const familyId = localStorage.getItem('pat_family_id') || '';
    // ★ 배열 + 입장기록(서브컬렉션) 동시 정리 → 삭제한 멤버가 폴링에서 부활하지 않도록.
    if(familyId && PAT_DB.removeFamilyMember){
      await PAT_DB.removeFamilyMember(DB.church.code, familyId, name);
    }
    // ★ 대표 승계/명단 변경을 서버에도 반영 (leaderName 갱신 위해 saveFamily 호출)
    if(familyId){
      await PAT_DB.saveFamily(DB.church.code, { ...nextProfile, id: familyId });
    } else {
      PAT_DB.saveFamily(DB.church.code, nextProfile);
    }
  }
  renderFamily();
  if(typeof toast === 'function') toast(`✓ '${name}' 삭제 완료`);
}

// ── 가족 등록 폼 (수동 참여) ─────────────────────────────
async function joinFamilyManual(){
  const name = document.getElementById('joinMemberName').value.trim();
  const pw   = document.getElementById('joinPassword').value.trim();
  if(!name){ toast('내 이름을 입력하세요'); return; }
  if(!pw){   toast('비밀번호를 입력하세요'); return; }
  const existing     = loadFamilyProfile();
  if(existing){
    if(pw !== existing.familyPassword){ toast('비밀번호가 올바르지 않습니다'); return; }
    const members = existing.members || [];
    if(!members.includes(name)) members.push(name);
    setFamilyStorage('pat_family_profile', JSON.stringify({ ...existing, memberName:name, members }));
    if(window.PAT_DB && PAT_DB.ready()){
      const familyId = localStorage.getItem('pat_family_id')||'';
      if(familyId) await PAT_DB.joinFamily(DB.church.code, familyId, name);
      // ★ Firebase 동기화 즉시 실행 — 다른 멤버들의 정보를 받아오기
      await syncFamilyProgressFromCloud(loadFamilyProfile());
    }
  } else {
    if(window.PAT_DB && PAT_DB.ready() && PAT_DB.findFamilyByPassword){
      const found = await PAT_DB.findFamilyByPassword(DB.church.code, pw);
      if(found){
        const members = Array.isArray(found.members) ? found.members.slice() : [];
        if(!members.includes(name)) members.push(name);
        localStorage.setItem('pat_family_id', found.id);
        setFamilyStorage('pat_family_profile', JSON.stringify({
          roomName:found.roomName||familyNameFromMember(name),
          leaderName:found.leaderName||'',
          parish:found.parish||'',
          district:found.district||'',
          groupType:found.groupType||'',
          familyPassword:found.familyPassword||pw,
          memberName:name,
          isLeader:false,
          members
        }));
        await PAT_DB.joinFamily(DB.church.code, found.id, name);
        if(typeof upsertRoom === 'function') upsertRoom({ familyId: found.id, ...(loadFamilyProfile()||{}), isLeader:false });
        renderFamilyProfile();
        go('s-family');
        toast('✓ '+(found.roomName||'가족방')+'에 등록되었습니다! 🎉');
        return;
      }
    }
    const joined = { roomName:familyNameFromMember(name), leaderName:'', parish:'', district:'',
      familyPassword:pw, memberName:name, isLeader:false, members:[name] };
    setFamilyStorage('pat_family_profile', JSON.stringify(joined));
    if(window.PAT_DB && PAT_DB.ready()){
      const familyId = localStorage.getItem('pat_family_id')||'';
      if(familyId) await PAT_DB.joinFamily(DB.church.code, familyId, name);
    }
    renderFamilyProfile();
    go('s-family');
    toast('✓ 가족방에 등록되었습니다! 🎉');
    return;
  }
  renderFamilyProfile();
  go('s-family');
  toast('✓ 가족방에 등록되었습니다! 🎉');
}

// ════════════════════════════════════════════════════════════════
// 구성원 관리 (UI)
// ════════════════════════════════════════════════════════════════
// 가족 등록 폼에서 구성원 이름들을 동적으로 추가/제거할 수 있게 함.
//
// [아키텍처]
//  - addMemberRow(name): 새 입력 행 추가
//  - removeMemberRow(id): 개별 행 삭제
//  - getMemberNames(): 모든 입력값 수집
//  - renderMemberRows(names): 기존 데이터로 폼 초기화
//
// [데이터 흐름]
//  1. openFamilyRegister() 호출 → renderMemberRows(profile?.members||[])
//     기존 구성원 명단이 있으면 폼에 렌더링
//
//  2. 사용자가 "+" 버튼 클릭 → addMemberRow('')
//     새 입력 행 추가 (빈 이름)
//
//  3. 이름 입력 및 "저장" 클릭 → saveFamilyProfileAsLeader()
//     getMemberNames()로 입력된 모든 이름 수집
//     members = [leaderName, ...inputMembers]로 배열 구성
//     Firebase saveFamily()로 저장

let _memberRowId = 0;  // 각 행에 고유 ID 부여 (DOM 추적)

/**
 * addMemberRow(name)
 *
 * [목적]
 *  가족 등록 폼에 구성원 입력 행을 하나 추가한다.
 *  이전에 입력된 값이 있으면 그대로 표시, 없으면 빈 필드로 시작.
 *
 * [파라미터]
 *  name: string (선택)
 *    - '' 또는 undefined: 빈 필드
 *    - '김아빠' 등: 기존 이름 채우기
 *
 * [동작]
 *  1. 고유 ID 부여: mr1, mr2, ... (행 삭제용)
 *  2. 새 div.row 생성 (flex 레이아웃)
 *  3. input[type="text"] 추가 (placeholder="이름 입력")
 *  4. 삭제 버튼(✕) 추가 → onclick=removeMemberRow(id)
 *  5. #memberRows 컨테이너에 appendChild
 *
 * [제약]
 *  - 구성원 수 제한 없음 (무한정 추가 가능)
 *  - 빈 이름은 getMemberNames()에서 자동 제외
 *
 * [예]
 *  addMemberRow('김아빠')  // 값 있는 행
 *  addMemberRow('')        // 빈 행
 *  addMemberRow()          // 빈 행
 */
function addMemberRow(name){
  if(typeof document==='undefined'||!document.createElement) return;
  const id  = 'mr'+(++_memberRowId);
  const row = document.createElement('div');
  row.id = id;
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
  row.innerHTML = `<input class="field" style="margin:0;flex:1" placeholder="이름 입력" value="${name||''}">
    <button onclick="removeMemberRow('${id}')" style="background:var(--danger);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:calc(var(--fs)-2px);cursor:pointer;flex-shrink:0">✕</button>`;
  document.getElementById('memberRows').appendChild(row);
}

/**
 * removeMemberRow(id)
 *
 * [목적]
 *  특정 구성원 입력 행을 제거한다.
 *
 * [파라미터]
 *  id: string
 *    행의 고유 ID (mr1, mr2, ... addMemberRow에서 부여)
 *
 * [동작]
 *  1. document.getElementById(id)로 행 선택
 *  2. 있으면 remove() 호출 (DOM에서 제거)
 *
 * [예]
 *  removeMemberRow('mr1')  // 첫 번째 행 삭제
 */
function removeMemberRow(id){
  const el = document.getElementById(id);
  if(el) el.remove();
}
/**
 * getMemberNames() → string[]
 *
 * [목적]
 *  가족 등록 폼의 memberRows에서 입력된 구성원 이름들을 수집한다.
 *
 * [동작]
 *  1. #memberRows 컨테이너의 모든 input[type="text"] 선택
 *  2. 각 input의 value를 트림 후 수집
 *  3. 빈 값 제외
 *
 * [예]
 *  memberRows 구성:
 *    <input value="김아빠">
 *    <input value="">
 *    <input value="김아들">
 *
 *  getMemberNames() → ["김아빠", "김아들"]
 *
 * [주의]
 *  - saveFamilyProfileAsLeader()에서 호출되어 입력된 구성원들을 members 배열에 추가
 */
function getMemberNames(){
  return [...document.querySelectorAll('#memberRows input')]
    .map(el=>el.value.trim()).filter(Boolean);
}
/**
 * renderMemberRows(names)
 *
 * [목적]
 *  가족 등록 폼의 memberRows 컨테이너를 초기화하고,
 *  기존 구성원 명단(또는 빈 폼)으로 렌더링한다.
 *  openFamilyRegister() 호출 시 기존 방의 구성원들을 표시한다.
 *
 * [파라미터]
 *  names: string[] (선택)
 *    - undefined 또는 []: 빈 입력 행 1개 (새 방 등록용)
 *    - ['김아빠', '김엄마']: 기존 구성원 명단 (편집용)
 *
 * [동작]
 *  1. #memberRows 컨테이너 찾기 (없으면 조용히 반환)
 *  2. innerHTML = '' (기존 행 제거)
 *  3. _memberRowId = 0 (카운터 초기화)
 *  4. names가 있으면 각 이름으로 행 추가
 *     names가 없으면 빈 행 1개 추가
 *
 * [예]
 *  // 새 방 등록 (빈 폼)
 *  renderMemberRows([])
 *  renderMemberRows(undefined)
 *  renderMemberRows(profile?.members||[])  // profile 없으면 빈 폼
 *  → 빈 입력 필드 1개
 *
 *  // 기존 방 편집 (구성원 명단 표시)
 *  renderMemberRows(['김아빠', '김엄마', '김아들'])
 *  → 3개 행에 각각 이름 채워서 표시
 *
 * [주의]
 *  - openFamilyRegister()에서 자동 호출됨
 *  - 사용자가 직접 호출할 필요 없음
 */
function renderMemberRows(names){
  const container = document.getElementById('memberRows');
  if(!container) return;
  container.innerHTML = '';
  _memberRowId = 0;
  (names && names.length ? names : ['']).forEach(n => addMemberRow(n));
}
// 교구/목장 드롭다운을 교회 설정대로 채움 (없으면 기본 1·2·3교구+블레싱)
function populateFamilyParishOptions(selected){
  const sel = document.getElementById('familyParish');
  if(!sel) return;
  const cfg = (typeof getParishConfig==='function') ? getParishConfig() : { term:'교구', groups:['1교구','2교구','3교구','블레싱'] };
  const ev = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lbl = document.getElementById('familyParishLabel'); if(lbl) lbl.textContent = cfg.term || '교구';
  let html = `<option value="">${ev(cfg.term||'교구')}를 선택하세요</option>`;
  cfg.groups.forEach(g => { html += `<option value="${ev(g)}">${ev(g)}</option>`; });
  if(selected && cfg.groups.indexOf(selected) === -1){ html += `<option value="${ev(selected)}">${ev(selected)}</option>`; }
  sel.innerHTML = html;
  sel.value = selected || '';
}
// 등록 폼: 방 종류 토글 버튼 선택 (가정/구역) — 숨김 input(familyGroupType)에 값 보관
function selectGroupType(type){
  const t = (type === '구역') ? '구역' : '가정';
  const hid = document.getElementById('familyGroupType');
  if(hid) hid.value = t;
  const a = document.getElementById('gtSegGajeong');
  const b = document.getElementById('gtSegGuyeok');
  const paint = (el, on) => {
    if(!el) return;
    el.style.background = on ? 'var(--accent)' : 'var(--surface)';
    el.style.color      = on ? '#fff' : 'var(--text)';
  };
  paint(a, t === '가정');
  paint(b, t === '구역');
  onGroupTypeChange();
}
// 등록 폼: 방 종류 선택에 따라 라벨/플레이스홀더 전환 (데이터 영향 없음)
function onGroupTypeChange(){
  const sel = document.getElementById('familyGroupType');
  const type = sel ? sel.value : '가정';
  const L = groupLabels(type);
  const set = (id, txt) => { const e = document.getElementById(id); if(e) e.textContent = txt; };
  const ph  = (id, txt) => { const e = document.getElementById(id); if(e) e.placeholder = txt; };
  set('familyRoomNameLabel', L.roomName);
  set('familyLeaderLabel', L.leader);
  ph('familyRoomName', type==='구역' ? '예: 3구역 모임' : '예: 믿음 가족방');
  ph('familyLeaderName', type==='구역' ? '예: 김구역장' : '예: 김민수');
}
function openFamilyRegister(tab){
  // ★ 2단계: '다른 방 만들기' 모드면 기존 방 값으로 채우지 않고 빈 폼으로 시작
  const profile = window._creatingNewRoom ? null : loadFamilyProfile();
  const _gt = groupTypeOf(profile);
  if(typeof selectGroupType === 'function') selectGroupType(_gt); // 값+토글 버튼 상태 동기화
  document.getElementById('familyRoomName').value   = profile?.roomName||'';
  document.getElementById('familyLeaderName').value = profile?.leaderName||'';
  populateFamilyParishOptions(profile?.parish||'');
  document.getElementById('familyDistrict').value   = profile?.district||'';
  // ★ 보안(B): 교회코드(공통)는 자동입력하지 않음 — 실제 가족 비번만 표시(없으면 비움)
  const _pf = profile?.familyPassword;
  document.getElementById('familyPassword').value   = (_pf && _pf !== DB.church.code) ? _pf : '';
  renderMemberRows(profile?.members||[]);
  go('s-family-register');
}
// ════════════════════════════════════════════════════════════════
// 방(가족/구역방) 저장 — 방장 전용
// ════════════════════════════════════════════════════════════════

/**
 * saveFamilyProfileAsLeader()
 *
 * [책임]
 *  방장이 방 정보와 구성원 명단을 저장한다.
 *  - 새 방 생성 또는 기존 방 업데이트
 *  - Firebase saveFamily()로 서버 동기화
 *  - localStorage에 캐시 (오프라인 지원)
 *  - 다중 방 소속 시 rooms.js의 upsertRoom() 호출
 *
 * [입력 (HTML 폼)]
 *  #familyRoomName: string   (방 이름, 예: "김 가정")
 *  #familyLeaderName: string (방장 이름, 예: "김아빠")
 *  #familyParish: string     (교구, 예: "1교구")
 *  #familyDistrict: string   (목장, 예: "목장 A")
 *  #familyGroupType: string  ("가정" | "구역")
 *  #familyPassword: string   (방 비밀번호, 4자 이상)
 *  #memberRows: div          (동적으로 추가된 구성원 입력 행)
 *
 * [저장 흐름]
 *  1️⃣ 입력 검증 (필수 필드, 비밀번호 강도)
 *  2️⃣ 보안 검증 (교회코드 재사용 금지, 비번 중복 확인)
 *  3️⃣ 구성원 수집 (대표자 + memberRows 입력값)
 *  4️⃣ localStorage 저장 (pat_family_profile, pat_leader_family_profile)
 *  5️⃣ Firebase 저장 (saveFamily())
 *  6️⃣ 방 목록 갱신 (upsertRoom())
 *  7️⃣ 대시보드 렌더링 (renderFamily())
 *
 * [검증 규칙]
 *  ✅ roomName, leaderName, parish, district: 필수
 *  ✅ familyPassword: 4자 이상 + 교회코드와 다름
 *  ✅ 같은 교회 내 비번 중복 금지
 *
 * [데이터 구조]
 *  profileData = {
 *    roomName: string,
 *    leaderName: string,
 *    parish: string,
 *    district: string,
 *    familyPassword: string,
 *    members: string[],      // [leaderName, ...입력된 구성원]
 *    memberName: string,     // 대표자(방장)
 *    groupType: "가정" | "구역"
 *  }
 *
 * [localStorage 저장]
 *  pat_family_profile: 현재 활성 방의 정보 (로그아웃 시 삭제)
 *  pat_leader_family_profile: 대표 방의 백업 (로그아웃 후에도 보존)
 *  pat_family_id: Firestore familyId
 *
 * [주의]
 *  - Firebase 저장 전 로컬 저장으로 오프라인 대응
 *  - 네트워크 오류 시에도 로컬 데이터로 진행 가능
 *  - 다중 방 소속 시 rooms.js와 협력
 */
async function saveFamilyProfileAsLeader(){
  // ── STEP 1: 폼에서 입력값 수집 ──
  const roomName   = document.getElementById('familyRoomName').value.trim();
  const leaderName = document.getElementById('familyLeaderName').value.trim();
  const parish     = document.getElementById('familyParish').value.trim();
  const district   = document.getElementById('familyDistrict').value.trim();
  let familyPassword = document.getElementById('familyPassword').value.trim();

  // ── STEP 2: 방 종류 (가정/구역) ──
  // 누락 시 '가정'으로 기본값 설정 (하위호환)
  const _gtSel = document.getElementById('familyGroupType');
  const groupType = (_gtSel && _gtSel.value === '구역') ? '구역' : '가정';
  const _L = groupLabels(groupType);

  // ── STEP 3: 필수 필드 검증 ──
  if(!roomName||!leaderName||!parish||!district){
    toast(`${_L.roomName}, ${_L.leader}, 교구와 구역을 입력하세요`);
    return;
  }

  // ── STEP 4: 비밀번호 강도 검증 ──
  // ★ 보안 원칙: 방 비밀번호는 교회코드와 달라야 함
  //   (기본값으로 교회코드가 되면 다른 방이 접근할 수 있는 보안 허점)
  if(!familyPassword){
    toast('가족 비밀번호를 설정하세요');
    return;
  }
  if(familyPassword === DB.church.code){
    toast('교회 코드와 다른 비밀번호를 설정하세요');
    return;
  }
  if(familyPassword.length < 4){
    toast('비밀번호는 4자 이상으로 설정하세요');
    return;
  }

  // ── STEP 5: 비밀번호 중복 확인 ──
  // ★ 비번 중복 방지: 같은 교회에서 두 방이 같은 비번을 쓰면 혼동 발생
  //   findFamilyByPasswordGlobal()로 다른 방의 중복 확인
  if(window.PAT_DB && PAT_DB.ready() && PAT_DB.findFamilyByPasswordGlobal){
    // 새 방 생성이면 myFamilyId = '', 기존 방이면 pat_family_id 사용
    const myFamilyId = window._creatingNewRoom ? '' : (localStorage.getItem('pat_family_id') || '');
    try{
      const dupRoom = await PAT_DB.findFamilyByPasswordGlobal(DB.church.code, familyPassword);
      if(dupRoom && dupRoom.id && dupRoom.id !== myFamilyId){
        // 다른 방에서 이미 사용 중인 비밀번호
        toast('이미 다른 방에서 쓰는 비밀번호예요. 다른 비밀번호를 사용하세요');
        return;
      }
    }catch(e){
      // 네트워크 오류 시: 서버 측에서 409 Conflict로 한 번 더 차단
      console.warn('[PAT-FAMILY] 비번 중복 확인 오류:', e.message);
    }
  }

  // ── STEP 6: 구성원 명단 구성 ──
  // 대표자는 자동 추가, memberRows에서 입력된 이름들도 수집
  const inputMembers = getMemberNames(); // memberRows input들 수집
  const members = [leaderName, ...inputMembers].filter(m => m.trim()); // 빈 값 제외

  // memberName: 대표자 기기에선 대표자가 "나"
  const profileData = { roomName, leaderName, parish, district, familyPassword, members, memberName: leaderName, groupType };

  setFamilyStorage('pat_family_profile', JSON.stringify(profileData));

  // ★ BUG-FIX: 대표 가족 정보를 별도 키에도 저장 (로그아웃해도 보존되도록)
  //   memberLogout()에서 pat_family_profile은 삭제되지만,
  //   pat_leader_family_profile은 보존되어 재로그인 후 자동 복구 가능
  try {
    // pat_family_id도 함께 백업 (복구 시 중복 생성 방지)
    const backupData = { ...profileData, _familyId: localStorage.getItem('pat_family_id') || '' };
    localStorage.setItem('pat_leader_family_profile', JSON.stringify(backupData));
    console.log('[PAT-FAMILY] 대표 가족 정보 저장 (로그아웃 후 복구용)');
  } catch(e) {
    console.warn('[PAT-FAMILY] 대표 가족 정보 저장 실패:', e.message);
  }

  // ★ localStorage에 저장된 값을 메모리에도 캐시 (다른 폴링이 읽을 수 있도록)
  window._lastSavedFamilyProfile = profileData;

  // ★ 2단계: '다른 방 만들기' 모드면 기존 활성방 id를 쓰지 않고 새 방 생성
  const _creating = !!window._creatingNewRoom;
  if(_creating){ try{ localStorage.removeItem('pat_family_id'); }catch(e){} }

  if(window.PAT_DB && PAT_DB.ready()){
    // ★ BUG-FIX: 기존 가족이 있으면 업데이트, 없으면 새로 생성
    const existingFamilyId = _creating ? null : localStorage.getItem('pat_family_id');

    if(existingFamilyId) {
      // 기존 가족 업데이트
      console.log('[PAT-FAMILY] 기존 가족 업데이트:', existingFamilyId);
      profileData.id = existingFamilyId;
      if(typeof upsertRoom === 'function') upsertRoom({ familyId: existingFamilyId, ...profileData, isLeader:true });
      PAT_DB.saveFamily(DB.church.code, profileData)
        .then(familyId=>{
          if(familyId) {
            console.log('[PAT-FAMILY] 가족 업데이트 완료');
          }
        });
    } else {
      // 새로운 가족 생성
      console.log('[PAT-FAMILY] 새로운 가족 생성');
      PAT_DB.saveFamily(DB.church.code, profileData)
        .then(familyId=>{
          if(familyId) {
            localStorage.setItem('pat_family_id', familyId);
            PAT_DB.joinFamily(DB.church.code, familyId, leaderName);
            // ★ 새 방을 내 방 목록에 등록 + 활성으로
            if(typeof upsertRoom === 'function') upsertRoom({ familyId, ...profileData, isLeader:true });
            console.log('[PAT-FAMILY] 새로운 가족 생성 완료:', familyId);
            if(typeof renderRoomSwitcher === 'function') renderRoomSwitcher();
          }
        });
    }
  }
  window._creatingNewRoom = false; // 모드 해제

  renderFamily();
  go('s-family');
  toast('✓ ' + _L.room + ' 설정이 저장되었습니다');
}

// ── 초대 링크 ─────────────────────────────────────────────
function copyInviteLink(){
  const profile = loadFamilyProfile();
  if(!profile){ toast('먼저 가족방을 등록하세요'); return; }
  const familyId = localStorage.getItem('pat_family_id') || '';
  const churchCode = localStorage.getItem('pat_church_code') || '';
  // ⚠️ familyPassword 제외 — URL에 평문 비밀번호 노출 차단
  // ★ 2026-07-01: churchCode 추가 — 초대링크로 입장 후 재설치 시 교회코드 자동 로드
  const data = { roomName:profile.roomName, leaderName:profile.leaderName,
    parish:profile.parish, district:profile.district,
    familyId: familyId, churchCode: churchCode, v: 3 };
  const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
  // location.href에 hash가 붙을 수 있으므로 origin+pathname 사용
  const url = location.origin + location.pathname + '?invite=' + encoded;
  navigator.clipboard.writeText(url).then(()=>{
    toast('✓ 초대 링크 복사 완료! 가족에게 공유하세요 📎');
  }).catch(()=>{
    prompt('아래 링크를 복사해서 가족에게 보내세요:', url);
  });
}

// ★ 2026-07-01: 공개 링크 (familyId 없음) — 다른 성도용
function copyPublicLink(){
  const profile = loadFamilyProfile();
  if(!profile){ toast('먼저 가족방을 등록하세요'); return; }
  const churchCode = localStorage.getItem('pat_church_code') || '';
  // familyId 제외 — 누구나 비밀번호로 참여 가능
  const data = { roomName:profile.roomName, leaderName:profile.leaderName,
    parish:profile.parish, district:profile.district,
    churchCode: churchCode, v: 3, isPublic: true };
  const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
  const url = location.origin + location.pathname + '?join=' + encoded;
  navigator.clipboard.writeText(url).then(()=>{
    toast('✓ 공개 링크 복사 완료! 같은 교회 성도들과 공유하세요 🌐');
  }).catch(()=>{
    prompt('아래 링크를 복사해서 공유하세요:', url);
  });
}

function showInvitePage(data){
  document.getElementById('inviteRoomName').textContent   = data.roomName||'';
  document.getElementById('inviteLeaderName').textContent = data.leaderName||'';
  const parishLabel = [data.parish, data.district].filter(Boolean).join(' ');
  document.getElementById('inviteParish').textContent     = parishLabel;
  document.getElementById('invitePasswordInput').value    = '';
  window._inviteData = data;
  // ★ 2026-07-01: 초대링크에 포함된 교회코드 저장 — 재설치 후에도 교회 자동 로드
  if(data.churchCode){
    try{ localStorage.setItem('pat_church_code', data.churchCode); }catch(e){}
    console.log('[INVITE] churchCode 저장:', data.churchCode);
  }
  go('s-invite');
}

// ★ 2026-07-01: 공개 링크 진입 — 다른 성도 (familyId 없음)
function showPublicJoinPage(data){
  // 교회코드 저장
  if(data.churchCode){
    try{ localStorage.setItem('pat_church_code', data.churchCode); }catch(e){}
    console.log('[PUBLIC-JOIN] churchCode 저장:', data.churchCode);
  }
  // 가족정보는 저장하지 않음 (다른 가정/구역)
  window._publicJoinData = data;
  document.getElementById('joinRoomName').value = '';
  document.getElementById('joinRoomPw').value = '';
  go('s-join-room');
}
async function joinFamilyFromInvite(){
  const data = window._inviteData;
  if(!data){ toast('초대 정보를 찾을 수 없습니다'); return; }
  const myName = (document.getElementById('inviteNameInput')?.value || '').trim();
  const pw     = document.getElementById('invitePasswordInput').value.trim();
  if(!myName){ toast('내 이름을 입력해주세요'); return; }
  if(!pw){ toast('비밀번호를 입력해주세요'); return; }

  if(window.PAT_DB && PAT_DB.ready() && PAT_DB.findFamilyByPassword){
    let found = null;
    try {
      found = await PAT_DB.findFamilyByPassword(DB.church.code, pw, data.familyId);
    } catch(e) {
      toast('서버 연결 오류입니다. 잠시 후 다시 시도해주세요'); return;
    }
    if(!found){
      if(!data.familyId){
        // familyId 없음 = 대표자가 가족방을 아직 서버에 저장하지 않은 상태
        toast('가족방이 서버에 등록되지 않았습니다. 대표자가 가족방을 다시 저장해주세요'); return;
      }
      toast('비밀번호가 올바르지 않습니다'); return;
    }
    const familyId = found.id || data.familyId || '';
    if(familyId) localStorage.setItem('pat_family_id', familyId);
    const existingMembers = Array.isArray(found.members) ? found.members : [];
    const members = existingMembers.includes(myName) ? existingMembers : [...existingMembers, myName];
    setFamilyStorage('pat_family_profile', JSON.stringify({
      roomName:     found.roomName     || data.roomName,
      leaderName:   found.leaderName   || data.leaderName,
      parish:       found.parish       || data.parish,
      district:     found.district     || data.district,
      groupType:    found.groupType    || data.groupType || '',
      familyPassword: pw,
      memberName:   myName,
      members,
    }));
    if(familyId) await PAT_DB.joinFamily(DB.church.code, familyId, myName);
    if(familyId && typeof upsertRoom === 'function') upsertRoom({ familyId, ...(loadFamilyProfile()||{}), isLeader:false });
    // ★ Firebase 동기화 즉시 실행 — 다른 멤버들의 정보를 받아오기
    await syncFamilyProgressFromCloud(loadFamilyProfile());
  } else {
    // 오프라인 fallback: 로컬 정보로만 저장
    setFamilyStorage('pat_family_profile', JSON.stringify({
      roomName:data.roomName, leaderName:data.leaderName,
      parish:data.parish, district:data.district,
      familyPassword:pw, memberName:myName, members:[myName],
    }));
  }
  window._inviteData = null;
  document.getElementById('churchName').textContent = memberHomeTitle();
  renderMemberDateLabels();
  renderFamily();
  go('s-family');
  toast('✓ '+data.roomName+'에 참여했습니다! 🎉');
}
function checkInviteParam(){
  if(typeof URLSearchParams==='undefined'||typeof location==='undefined') return;
  const params = new URLSearchParams(location.search);

  // ★ 2026-07-01: 두 종류의 링크 처리
  // ?invite=... : 가족 초대 (familyId 포함)
  // ?join=... : 공개 링크 (다른 성도, familyId 없음)
  const invite = params.get('invite');
  const joinPublic = params.get('join');

  if(invite){
    try{ showInvitePage(JSON.parse(decodeURIComponent(atob(invite)))); }catch(e){}
  } else if(joinPublic){
    try{ showPublicJoinPage(JSON.parse(decodeURIComponent(atob(joinPublic)))); }catch(e){}
  }
}
function memberHomeTitle(){ return DB.church.name+' PAT'; }

// ── 홈 화면 일일 과제 (church-bible-challenge 스타일) ─────
// ★ 로컬(기기/한국시간) 날짜 키 — 자정(00시)에 정확히 날짜가 바뀐다.
//   (이전엔 toISOString()=UTC 라 한국시간 오전 9시에 날짜가 바뀌어,
//    자정~9시 사이엔 어제 기도/통독이 그대로 보이는 문제가 있었음)
function _localDateStr(d){
  const x = (d instanceof Date) ? d : new Date(d);
  if(isNaN(x.getTime())) return '';
  const p=n=>(n<10?'0':'')+n;
  return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate());
}
function todayKey(){ return _localDateStr(new Date()); }
function loadDailyTasks(){
  try{ return JSON.parse(localStorage.getItem('pat_daily_tasks_'+todayKey())||'{}'); }catch(e){ return {}; }
}
function saveDailyTasks(data){
  localStorage.setItem('pat_daily_tasks_'+todayKey(), JSON.stringify(data));
}
function changeTask(type, delta){
  const tasks = loadDailyTasks();
  tasks[type] = Math.max(0, Math.min(2, (tasks[type]||0)+delta));
  saveDailyTasks(tasks);
  updateHomeDisplay();
}
function toggleDailyTask(type){
  const tasks = loadDailyTasks();
  tasks[type] = !tasks[type];
  saveDailyTasks(tasks);
  updateHomeDisplay();
}
// 오늘 본인 기도 완료 여부 (prayer.js 데이터 기준)
function _isPrayerDoneToday(){
  const today = todayKey();
  // 1) 개인 호환 키 — savePrayer가 항상 직접 저장하므로 이름 매칭과 무관하게 가장 확실
  try{
    const p = JSON.parse(localStorage.getItem('pat_prayer_'+today)||'null');
    if(p && (p.done === true || (p.text && String(p.text).trim()))) return true;
  }catch(e){}
  // 2) 가족 기도 보드에서 본인 이름으로 확인 (보조)
  try{
    if(typeof loadFamilyPrayers==='function' && typeof currentPrayerMember==='function'){
      const board = loadFamilyPrayers(today) || {};
      const me = currentPrayerMember();
      if(me && board[me] && board[me].text) return true;
    }
  }catch(e){}
  return false;
}
// 오늘 통독(오늘의 바이블버스) 읽음 여부
function _isReadingDoneToday(){
  try{ return localStorage.getItem('pat_read_done_'+todayKey())==='1'; }catch(e){ return false; }
}
// ★ 오늘 기도한 가족 구성원 이름 Set (가족 미션 합계에 기도 포함용)
//   본인 로컬은 항상 최신 반영, 가족 전체(getPrayers)는 3초 캐시 — 1초 폴링 과부하 방지.
let _prayedNetCache = { t: 0, set: new Set() };
async function fetchPrayedMembersToday(){
  const set = new Set();
  // 1) 본인 로컬(개인키) — 즉시 반영
  try{
    if(_isPrayerDoneToday()){
      const p = loadFamilyProfile();
      const me = (p && (p.memberName || p.leaderName)) || '';
      if(me) set.add(me);
    }
  }catch(e){}
  // 2) 가족 전체 (다른 구성원 포함) — 3초 캐시된 네트워크 조회
  try{
    const now = Date.now();
    if(now - _prayedNetCache.t >= 3000 && window.PAT_DB && PAT_DB.ready() && PAT_DB.getPrayers){
      const res = await PAT_DB.getPrayers(DB.church.code, todayKey());
      const ns = new Set();
      if(res && Array.isArray(res.prayers)){
        res.prayers.forEach(p=>{ if(p.memberName && p.text && String(p.text).trim()) ns.add(p.memberName); });
      }
      _prayedNetCache = { t: now, set: ns };
    }
    _prayedNetCache.set.forEach(n=>set.add(n));
  }catch(e){}
  return set;
}
function updateHomeDisplay(){
  const recs  = loadRec();
  const today = todayKey();
  // ★ 점수 연산: 실제 활동 = 암송 / 기도 (2점 만점)
  //   - (버그) 기존엔 r.date 를 봤으나 암송 기록은 completedAt 필드라 항상 0점이었음
  //   - (수정 v108) 통독(읽기표)은 대한성서공회 API 미승인으로 실질 콘텐츠가 없어
  //     분모에 넣으면 암송+기도를 다 해도 최대 67%(2/3)에 막힘. 가족방 미션 기준
  //     (암송 OR 기도)과도 불일치. → 통독을 점수에서 제외(암송/기도 2점 만점).
  //     ※ 통독 API 연동 시 read 변수와 +(read?1:0)/maxScore 3 복구하면 됨.
  const memorized = recs.some(r => {
    const ts = r.completedAt || r.date;
    return ts && _localDateStr(ts) === today; // UTC 저장값을 로컬 날짜로 환산해 오늘과 비교
  });
  const prayed    = _isPrayerDoneToday();
  const total     = (memorized?1:0) + (prayed?1:0);
  const maxScore  = 2;
  const pct       = Math.round(total/maxScore*100);

  const el = id => document.getElementById(id);

  // 원형 퍼센트 + 점수 + 바
  if(el('hmCircle'))        el('hmCircle').textContent    = pct+'%';
  if(el('hmScore'))         el('hmScore').textContent     = total+'/'+maxScore+'점';
  if(el('hmProgressFill'))  el('hmProgressFill').style.width = pct+'%';
  if(el('hmAllDone'))       el('hmAllDone').style.display = (total===maxScore)?'block':'none';

  // (구) 일일 과제 체크 표시 — 요소가 있을 때만 갱신
  if(el('hmCheckMemorize')){
    el('hmCheckMemorize').textContent = memorized?'✓':'○';
    el('hmCheckMemorize').classList.toggle('checked', memorized);
  }
  if(el('hmTaskMemorize')) el('hmTaskMemorize').classList.toggle('done', memorized);
  if(el('hmCheckPrayer')){
    el('hmCheckPrayer').textContent = prayed?'✓':'○';
    el('hmCheckPrayer').classList.toggle('checked', prayed);
  }
  if(el('hmTaskPrayer')) el('hmTaskPrayer').classList.toggle('done', prayed);
}
function initHomeScreen(){
  // 날짜
  const now  = new Date();
  const days = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  const el   = id => document.getElementById(id);
  if(el('hmDate')) el('hmDate').textContent =
    (now.getMonth()+1)+'월 '+now.getDate()+'일 ('+days[now.getDay()]+')';

  // 스트릭
  const streak = parseInt(localStorage.getItem('pat_streak_days')||'0');
  if(el('hmStreakCard')) el('hmStreakCard').style.display = streak>0 ? 'flex' : 'none';
  if(el('hmStreakText')) el('hmStreakText').textContent   = streak+'일 연속 달성!';


  updateHomeDisplay();
}

// ── 가족 진행 상황 폴링 ───────────────────────────────────
let familyProgressNonce = 0;   // 단조 증가 nonce — 경쟁 요청 방지
let familyProgressPollKey = '';
let familyProgressPollTimer = null;

// ── 가족 구성원 목록 렌더링 (실제 완료 여부 기준, 순서 번호) ──
function renderFamilyMemberList(members){
  const safeMembers = members.length ? members : [{ name:'나', me:true, done:false }];
  DB.members = safeMembers;

  // ★ 실제 완료(실천)한 구성원만 카운트 — 등록만으로 완료 처리하지 않음
  const confirmedCount = safeMembers.filter(m => m.done).length;
  const pct = safeMembers.length ? Math.round(confirmedCount / safeMembers.length * 100) : 0;
  document.getElementById('familyProgress').textContent = `이번 주 달성률 ${confirmedCount}/${safeMembers.length}명`;
  document.getElementById('familyBar').style.width = pct+'%';

  // ★ 가족방이 등록된 경우에만 삭제 버튼 노출 (대표 포함 모든 구성원 삭제 가능)
  const hasProfile = !!loadFamilyProfile();
  const list = safeMembers.map((m, idx) => {
    const orderNum = idx + 1; // ★ 등록 순서 번호
    const status = m.done
      ? '<span style="margin-left:8px;font-size:calc(var(--fs)-2px);color:var(--accent)">✓ 완료</span>'
      : '<span style="margin-left:8px;font-size:calc(var(--fs)-2px);color:var(--muted)">· 미완료</span>';
    // ★ 실수 방지: 삭제는 '3번 연속 터치'로만 실행 (armDeleteFamilyMember).
    //   진행 중이면 카운트를 라벨로 표시 — 폴링 재렌더에도 전역상태(_famDelArm)로 유지.
    const arming = (_famDelArm.name === m.name && _famDelArm.count > 0);
    const remain = 3 - _famDelArm.count;
    const delLabel = arming ? `한 번 더 (${remain})` : '✕ 삭제';
    const delStyle = `margin-left:8px;flex-shrink:0;font-size:calc(var(--fs)-3px)`
      + (arming ? ';background:var(--danger);color:#fff;border-radius:8px;padding:4px 8px;font-weight:800' : '');
    const delBtn = hasProfile
      ? `<button class="family-member-delete${arming?' arming':''}" title="실수 방지 — 3번 연속 눌러야 삭제" onclick="armDeleteFamilyMember('${encodeURIComponent(m.name)}')" style="${delStyle}">${delLabel}</button>`
      : '';
    return `<div class="member" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <div style="flex:1;min-width:0">
                <span style="color:var(--muted);margin-right:8px;font-weight:700;font-size:calc(var(--fs)-2px)">${orderNum}.</span>
                <span>${esc(m.name)}</span>
                ${status}
              </div>
              ${delBtn}
            </div>`;
  }).join('');

  document.getElementById('memberList').innerHTML = list;
}
async function syncFamilyProgressFromCloud(profile){
  const familyId = localStorage.getItem('pat_family_id')||'';
  if(!profile || !familyId || !window.PAT_DB || !PAT_DB.ready() || !PAT_DB.getFamilyProgress) return;

  // ★ nonce 발급 — await 완료 후 더 최신 호출이 있으면 폐기 (경쟁 요청 방지)
  const myNonce = ++familyProgressNonce;

  const cloudMembers = await PAT_DB.getFamilyProgress(DB.church.code, familyId, DB.verse.ref);
  // ★ 기도 미션도 합산: 오늘 기도한 구성원 Set
  const prayedSet = await fetchPrayedMembersToday();

  if(myNonce !== familyProgressNonce) return; // 더 최신 호출이 있음 → 폐기
  if(!Array.isArray(cloudMembers)) return;

  // ★ await 이후 stale profile 방지 — localStorage 최신값 재조회
  const freshProfile = loadFamilyProfile() || profile;
  const myName = freshProfile.memberName || freshProfile.leaderName || '';

  // ★ 개인 실천율 서버 재동기화(FIX): 서버가 '오늘(KST) 현재구절 완료(doneToday)'를
  //   확인하면, 로컬 미러(pat_records)에 오늘 기록이 없을 때만 추가한다.
  //   - 삭제/덮어쓰기 절대 없음(add-only), 오늘 기록이 이미 있으면 아무것도 안 함.
  //   - 기기 교체·재설치·캐시초기화·멀티폰으로 로컬이 비어도 개인 점수가
  //     0으로 잘못 표시되는 문제(데이터 초기화처럼 보임)를 막는다.
  try {
    const myNameT = String(myName).trim();
    if (myNameT && DB.verse && DB.verse.ref) {
      const mineCloud = cloudMembers.find(m => ((m.displayName || m.name || '').trim()) === myNameT);
      if (mineCloud && mineCloud.doneToday) {
        const recs = loadRec();
        const today = todayKey();
        const hasToday = recs.some(r => { const ts = r.completedAt || r.date; return ts && _localDateStr(ts) === today; });
        if (!hasToday) {
          recs.push({ ref: DB.verse.ref, completedAt: new Date().toISOString(), badge: 'weekly_complete', _src: 'server-sync' });
          saveRec(recs);
          if (typeof updateHomeDisplay === 'function') updateHomeDisplay();
        }
      }
    }
  } catch(e) {}

  // Firebase는 완료 여부를 가져오고, 구성원 목록이 있으면 대표가 저장한 목록을 기준으로 삼음
  const doneMap = {};
  cloudMembers.forEach(m => {
    const n = m.displayName || m.name || '';
    if(n) doneMap[n] = !!m.done;
  });

  const cloudNames = normalizeFamilyMemberNames(cloudMembers);
  const localNames = cloudNames.length ? cloudNames.slice() : familyMemberNames(freshProfile);

  // ★ 완료 = 암송(doneMap) 또는 기도(prayedSet) — 두 미션 합산, 누락 없이
  const merged = localNames.map(name => ({
    name,
    me  : myName ? name === myName : false,
    done: (doneMap[name] || false) || prayedSet.has(name),
  }));
  if(!merged.find(m=>m.me) && merged.length) merged[0].me = true;

  renderFamilyMemberList(merged);

  // ★ stale spread 제거 — 최신 profile(freshProfile)로 저장
  const mergedNames = merged.map(m=>m.name).filter(Boolean);
  const updated = { ...freshProfile, members: mergedNames };
  setFamilyStorage('pat_family_profile', JSON.stringify(updated));
  renderRegisteredFamilyRoom();
  // ★ roomName이 변경되었으면 메인 화면의 가족방 제목도 업데이트
  renderFamilyProfile();
}
function startFamilyProgressPolling(profile){
  const familyId = localStorage.getItem('pat_family_id')||'';
  if(!profile || !familyId || !window.PAT_DB || !PAT_DB.ready() || !PAT_DB.getFamilyProgress) return;
  const pollKey = familyId+'|'+DB.verse.ref;
  if(familyProgressPollKey === pollKey && familyProgressPollTimer) return;
  if(familyProgressPollTimer) clearInterval(familyProgressPollTimer);
  familyProgressPollKey  = pollKey;
  // ★ 1초마다 Firebase에서 최신 데이터 조회 (실시간 폰↔웹 동기화)
  familyProgressPollTimer = setInterval(async ()=>{
    let freshProfile = loadFamilyProfile();
    if(!window.PAT_DB || !PAT_DB.ready() || !PAT_DB.getFamilyInfo) return;

    try {
      // ★ getFamilyInfo()로 roomName, leaderName, parish, district, members 모두 조회
      const fbInfo = await PAT_DB.getFamilyInfo(DB.church.code, familyId);
      if(!fbInfo) return;

      const shouldUpdate = {};

      // 1. roomName, leaderName, parish, district 동기화
      // ★ 중대버그 수정: 서버가 빈 값(가족 doc 누락·타이밍·일시 오류)을 줄 때
      //   로컬 등록정보를 빈 값으로 덮어써 "초기화"되던 문제 → 값이 있을 때만 갱신.
      if(fbInfo.roomName && fbInfo.roomName !== freshProfile.roomName) {
        shouldUpdate.roomName = fbInfo.roomName;
      }
      if(fbInfo.leaderName && fbInfo.leaderName !== freshProfile.leaderName) {
        shouldUpdate.leaderName = fbInfo.leaderName;
      }
      if(fbInfo.parish && fbInfo.parish !== freshProfile.parish) {
        shouldUpdate.parish = fbInfo.parish;
      }
      if(fbInfo.district && fbInfo.district !== freshProfile.district) {
        shouldUpdate.district = fbInfo.district;
      }
      // ★ 1단계: 방 종류(groupType) 동기화 — 값이 있을 때만 갱신(하위호환)
      if(fbInfo.groupType && fbInfo.groupType !== freshProfile.groupType) {
        shouldUpdate.groupType = fbInfo.groupType;
      }

      // 2. members 동기화 (대표가 저장한 최신 구성원 목록으로 교체)
      if(Array.isArray(fbInfo.members)){
        const localMembers = freshProfile.members || [];
        const fbMemberNames = normalizeFamilyMemberNames(fbInfo.members);
        if(fbMemberNames.length && JSON.stringify(fbMemberNames) !== JSON.stringify(localMembers)){
          shouldUpdate.members = fbMemberNames;
          console.log('[SYNC] 가족 구성원 동기화:', fbMemberNames);
        }
      }

      // 3. 변경사항이 있으면 한 번에 저장
      if(Object.keys(shouldUpdate).length > 0){
        freshProfile = { ...freshProfile, ...shouldUpdate };
        setFamilyStorage('pat_family_profile', JSON.stringify(freshProfile));
        // ★ 화면 즉시 업데이트
        console.log('[SYNC] 가족방 데이터 업데이트:', Object.keys(shouldUpdate));
        renderFamilyProfile();
        renderRegisteredFamilyRoom();
      }

      // 4. 진행 상황 동기화 (members done 상태 업데이트)
      await syncFamilyProgressFromCloud(freshProfile);
    } catch(e) {
      console.warn('[SYNC] 폴링 에러:', e.message);
    }
  }, 1000); // 1초 (기존 10초 → 1초로 단축)
}
function renderFamily(){
  // ★ 2단계: 홈으로 돌아오면 '새 방 만들기' 모드 해제(취소 후 잔존 방지)
  window._creatingNewRoom = false;
  const profile = loadFamilyProfile();

  // ★ 2단계: 내 방 목록 시드(기존 단일방 사용자 호환) + 방 전환 UI 렌더
  if(typeof seedRoomsIfNeeded === 'function') seedRoomsIfNeeded();
  if(typeof renderRoomSwitcher === 'function') renderRoomSwitcher();

  // ★ 가족 데이터 없으면 Firebase 자동 복구 시도 후 재렌더
  if(!profile && window.PAT_DB && PAT_DB.ready()){
    tryAutoRecoverFamily().then(recovered => {
      if(recovered){
        console.log('[PAT-FAMILY] 자동 복구 후 renderFamily 재실행');
        renderFamily();
      }
    });
    // 복구 시도 중에는 일단 빈 화면으로 계속 진행
  }

  const recs    = loadRec();
  const profileMembers = familyMemberNames(profile);
  // memberName(이 기기 사용자 이름)으로 "나" 판별 — 없으면 leaderName, 없으면 첫 번째
  const myName  = (profile?.memberName || profile?.leaderName || '').trim();
  const familyId = localStorage.getItem('pat_family_id')||'';
  // ★ 본인 완료 여부 = 암송(현재 구절 기록) 또는 오늘 기도 — 두 미션 합산
  const myVerseDone = loadRec().some(r => r.ref === DB.verse.ref) || _isPrayerDoneToday();
  if(profileMembers.length){
    DB.members = profileMembers.map((name,i)=>{
      const isMe = myName ? name === myName : i===0;
      return { name, me: isMe, done: isMe ? myVerseDone : false };
    });
    if(!DB.members.find(m=>m.me)){ DB.members[0].me = true; DB.members[0].done = myVerseDone; }
  }
  const me = DB.members.find(m=>m.me);
  // 구성원 목록 렌더 — 완료 여부는 실제 기록 기준(이후 클라우드 동기화로 보정)
  renderFamilyMemberList(DB.members);
  const syncPromise = (profile?.familyPassword
    ? refreshFamilyProfileByPassword(profile, profile.familyPassword)
    : Promise.resolve(profile)
  ).then(freshProfile => {
    if(freshProfile && freshProfile !== profile){
      const names = familyMemberNames(freshProfile);
      const currentName = (freshProfile.memberName || freshProfile.leaderName || '').trim();
      if(names.length){
        const myDone2 = loadRec().some(r => r.ref === DB.verse.ref) || _isPrayerDoneToday();
        DB.members = names.map((name,i)=>{
          const isMe = currentName ? name === currentName : i===0;
          return { name, me: isMe, done: isMe ? myDone2 : false };
        });
        if(!DB.members.find(m=>m.me)){ DB.members[0].me = true; DB.members[0].done = myDone2; }
        renderFamilyMemberList(DB.members);
      }
      renderFamilyProfile();
      renderRegisteredFamilyRoom();
    }
    return syncFamilyProgressFromCloud(freshProfile || profile);
  });
  startFamilyProgressPolling(profile);
  renderFamilyProfile();
  const invBtn = document.getElementById('inviteLinkBtn');
  if(invBtn) invBtn.style.display = loadFamilyProfile() ? 'block' : 'none';
  document.getElementById('churchName').textContent = memberHomeTitle();
  renderMemberDateLabels();
  document.getElementById('famVerseRef').textContent  = DB.verse.ref;
  document.getElementById('famVerseText').textContent = DB.verse.text;
  initHomeScreen();
  return syncPromise;
}

// ── 구성원 확인 함수 ────────────────────────────────────────────
function confirmMemberIdentity(memberId) {
  // 로컬에 확인 상태 저장
  const memberStatuses = JSON.parse(localStorage.getItem('pat_member_confirmed') || '{}');
  memberStatuses[memberId] = true;
  localStorage.setItem('pat_member_confirmed', JSON.stringify(memberStatuses));

  // 현재 유저 이름 가져오기
  const profile = loadFamilyProfile();
  const memberName = profile?.memberName || profile?.leaderName || '구성원';

  // Firebase에 저장 (선택사항)
  if (window.PAT_DB && PAT_DB.ready() && PAT_DB.confirmMemberIdentity) {
    const familyId = localStorage.getItem('pat_family_id') || '';
    if (profile && familyId) {
      PAT_DB.confirmMemberIdentity(DB.church.code, familyId, memberId, memberName);
    }
  }

  // UI 즉시 업데이트 (가족방 재렌더링)
  renderFamily();
  toast(`✅ ${esc(memberName)} 확인 완료!`);
}

// ── 가족 등록 화면 열기 ────────────────────────────────────────
function openFamilyJoinManual(){
  document.getElementById('joinMemberNameInput').value = '';
  document.getElementById('joinPasswordInput').value = '';
  go('s-family-join-manual');
}

// ── 가족 등록 제출 (구성원 자가 입력) ───────────────────────────
async function submitFamilyJoinManual(){
  const name = document.getElementById('joinMemberNameInput').value.trim();
  const pw = document.getElementById('joinPasswordInput').value.trim();

  if(!name){
    toast('이름을 입력하세요');
    return;
  }
  if(!pw){
    toast('비밀번호를 입력하세요');
    return;
  }

  const existing = loadFamilyProfile();

  // 1️⃣ 기존 가족방 있으면 비밀번호 확인 후 추가
  if(existing){
    if(pw !== existing.familyPassword){
      toast('비밀번호가 올바르지 않습니다');
      return;
    }
    const members = existing.members || [];
    if(!members.includes(name)) members.push(name);
    const updatedProfile = { ...existing, churchCode: DB.church.code, memberName: name, members };  // ★ churchCode 추가
    setFamilyStorage('pat_family_profile', JSON.stringify(updatedProfile));

    if(window.PAT_DB && PAT_DB.ready()){
      const familyId = localStorage.getItem('pat_family_id') || '';
      if(familyId) await PAT_DB.joinFamily(DB.church.code, familyId, name);
      await syncFamilyProgressFromCloud(updatedProfile);
    }

    renderFamily();
    go('s-family');
    toast(`✓ ${esc(name)} 등록 완료! 🎉`);
    return;
  }

  // 2️⃣ Firebase에서 가족 찾기
  if(window.PAT_DB && PAT_DB.ready() && PAT_DB.findFamilyByPassword){
    try{
      const found = await PAT_DB.findFamilyByPassword(DB.church.code, pw);
      if(found){
        const members = Array.isArray(found.members) ? found.members.slice() : [];
        if(!members.includes(name)) members.push(name);
        localStorage.setItem('pat_family_id', found.id);
        const profileData = {
          churchCode: DB.church.code,  // ★ 2026-07-01: churchCode 반드시 포함
          roomName: found.roomName || '',
          leaderName: found.leaderName || '',
          parish: found.parish || '',
          district: found.district || '',
          groupType: found.groupType || '',
          familyPassword: pw,
          memberName: name,
          members
        };
        setFamilyStorage('pat_family_profile', JSON.stringify(profileData));
        await PAT_DB.joinFamily(DB.church.code, found.id, name);
        if(typeof upsertRoom === 'function') upsertRoom({ familyId: found.id, ...profileData, isLeader:false });
        renderFamily();
        go('s-family');
        toast(`✓ ${found.roomName || '가족방'}에 등록되었습니다! 🎉`);
        return;
      }
    }catch(e){
      console.warn('[PAT] Firebase lookup failed:', e.message);
    }
  }

  // 3️⃣ Fallback: 로컬만 저장
  const profileData = {
    churchCode: DB.church.code,  // ★ 2026-07-01: churchCode 반드시 포함
    roomName: '',
    leaderName: '',
    parish: '',
    district: '',
    familyPassword: pw,
    memberName: name,
    members: [name]
  };
  setFamilyStorage('pat_family_profile', JSON.stringify(profileData));
  renderFamily();
  go('s-family');
  toast(`✓ 가족에 등록되었습니다! 🎉`);
}
