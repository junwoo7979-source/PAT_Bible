// ====== PAT Bible — family.js ======
// 가족방 등록/조회, 초대 링크, 클라우드 동기화

// ── 프로필 헬퍼 ───────────────────────────────────────────
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
    const members = normalizeFamilyMemberNames(found.members);
    const nextProfile = {
      ...profile,
      roomName: found.roomName || profile.roomName || '',
      leaderName: found.leaderName || profile.leaderName || '',
      parish: found.parish || profile.parish || '',
      district: found.district || profile.district || '',
      familyPassword: password,
      memberName: profile.memberName || profile.leaderName || found.leaderName || '',
      members: members.length ? members : familyMemberNames({ ...profile, ...found }),
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
      roomName: match.roomName,
      leaderName: match.leaderName,
      parish: match.parish,
      district: match.district || '',
      familyPassword: DB.church.code,
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
  document.getElementById('familyRoomTitle').textContent = profile
    ? `👨‍👩‍👧 ${roomName || '우리 가족방'}`
    : '👨‍👩‍👧 우리 가족방';
  if(profile){
    const parishLabel   = profile.parish   ? (/교구$/.test(profile.parish)   ? profile.parish   : profile.parish+'교구')   : '';
    const districtLabel = profile.district ? (/구역$/.test(profile.district) ? profile.district : profile.district+'구역') : '';
    const leaderLabel   = profile.leaderName ? '대표 '+profile.leaderName : (profile.memberName || '');
    const parts = [leaderLabel, parishLabel, districtLabel].filter(Boolean);
    document.getElementById('familyProfile').textContent = parts.join(' ');
  } else {
    document.getElementById('familyProfile').textContent = '가족방을 등록해주세요';
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
            const deleteButton = canDelete
              ? `<button class="family-member-delete" onclick="deleteFamilyMember('${encodeURIComponent(name)}')">삭제</button>`
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
async function deleteFamilyMember(encodedName){
  const name    = decodeURIComponent(encodedName);
  const profile = loadFamilyProfile();
  if(!profile || !Array.isArray(profile.members)) return;
  const members     = profile.members.filter(member => member !== name);
  const nextProfile = { ...profile, members };
  setFamilyStorage('pat_family_profile', JSON.stringify(nextProfile));
  if(window.PAT_DB && PAT_DB.ready()){
    const familyId = localStorage.getItem('pat_family_id') || '';
    // ★ #2 수정: 배열 + 입장기록(서브컬렉션) 동시 정리 → 삭제한 멤버가 폴링에서 부활하지 않도록.
    //   새 엔드포인트 실패(미배포 등) 시 기존 saveFamily로 폴백(최소한 배열은 갱신 — 회귀 방지).
    let ok = false;
    if(familyId && PAT_DB.removeFamilyMember){
      ok = await PAT_DB.removeFamilyMember(DB.church.code, familyId, name);
    }
    if(!ok){ PAT_DB.saveFamily(DB.church.code, nextProfile); }
  }
  renderRegisteredFamilyRoom();
  renderFamilyProfile();
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
          familyPassword:found.familyPassword||pw,
          memberName:name,
          isLeader:false,
          members
        }));
        await PAT_DB.joinFamily(DB.church.code, found.id, name);
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

// ── 구성원 행 추가/삭제 ──────────────────────────────────
let _memberRowId = 0;
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
function removeMemberRow(id){
  const el = document.getElementById(id);
  if(el) el.remove();
}
function getMemberNames(){
  return [...document.querySelectorAll('#memberRows input')]
    .map(el=>el.value.trim()).filter(Boolean);
}
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
function openFamilyRegister(tab){
  const profile = loadFamilyProfile();
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
// ── 대표 등록 (대표자만, 자동 확인) ────────────────────────────
function saveFamilyProfileAsLeader(){
  const roomName   = document.getElementById('familyRoomName').value.trim();
  const leaderName = document.getElementById('familyLeaderName').value.trim();
  const parish     = document.getElementById('familyParish').value.trim();
  const district   = document.getElementById('familyDistrict').value.trim();
  let familyPassword = document.getElementById('familyPassword').value.trim();

  if(!roomName||!leaderName||!parish||!district){
    toast('가족방 이름, 대표 이름, 교구와 구역을 입력하세요');
    return;
  }

  // ★ 보안(B): 가족 비밀번호 필수 + 교회코드(공통)와 동일 금지 + 4자 이상
  //   (기본 비번이 교회코드가 되어 다른 가족이 들어오는 구멍 차단)
  if(!familyPassword){ toast('가족 비밀번호를 설정하세요'); return; }
  if(familyPassword === DB.church.code){ toast('교회 코드와 다른 비밀번호를 설정하세요'); return; }
  if(familyPassword.length < 4){ toast('비밀번호는 4자 이상으로 설정하세요'); return; }

  // ★ 대표자만 members에 자동 추가 (1번 위치)
  const members = [leaderName];

  // memberName: 대표자 기기에선 대표자가 "나"
  const profileData = { roomName, leaderName, parish, district, familyPassword, members, memberName: leaderName };

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

  if(window.PAT_DB && PAT_DB.ready()){
    // ★ BUG-FIX: 기존 가족이 있으면 업데이트, 없으면 새로 생성
    const existingFamilyId = localStorage.getItem('pat_family_id');

    if(existingFamilyId) {
      // 기존 가족 업데이트
      console.log('[PAT-FAMILY] 기존 가족 업데이트:', existingFamilyId);
      profileData.id = existingFamilyId;
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
            console.log('[PAT-FAMILY] 새로운 가족 생성 완료:', familyId);
          }
        });
    }
  }

  renderFamily();
  go('s-family');
  toast('✓ 가족방 설정이 저장되었습니다');
}

// ── 초대 링크 ─────────────────────────────────────────────
function copyInviteLink(){
  const profile = loadFamilyProfile();
  if(!profile){ toast('먼저 가족방을 등록하세요'); return; }
  const familyId = localStorage.getItem('pat_family_id') || '';
  // ⚠️ familyPassword 제외 — URL에 평문 비밀번호 노출 차단
  const data = { roomName:profile.roomName, leaderName:profile.leaderName,
    parish:profile.parish, district:profile.district,
    familyId: familyId, v: 2 };
  const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
  // location.href에 hash가 붙을 수 있으므로 origin+pathname 사용
  const url = location.origin + location.pathname + '?invite=' + encoded;
  navigator.clipboard.writeText(url).then(()=>{
    toast('✓ 초대 링크 복사 완료! 가족에게 공유하세요 📎');
  }).catch(()=>{
    prompt('아래 링크를 복사해서 가족에게 보내세요:', url);
  });
}
function showInvitePage(data){
  document.getElementById('inviteRoomName').textContent   = data.roomName||'';
  document.getElementById('inviteLeaderName').textContent = data.leaderName||'';
  const parishLabel = [data.parish, data.district].filter(Boolean).join(' ');
  document.getElementById('inviteParish').textContent     = parishLabel;
  document.getElementById('invitePasswordInput').value    = '';
  window._inviteData = data;
  go('s-invite');
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
      familyPassword: pw,
      memberName:   myName,
      members,
    }));
    if(familyId) await PAT_DB.joinFamily(DB.church.code, familyId, myName);
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
  const invite = params.get('invite');
  if(!invite) return;
  try{ showInvitePage(JSON.parse(decodeURIComponent(atob(invite)))); }catch(e){}
}
function memberHomeTitle(){ return DB.church.name+' PAT'; }

// ── 홈 화면 일일 과제 (church-bible-challenge 스타일) ─────
function todayKey(){ return new Date().toISOString().slice(0,10); }
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
  try{
    if(typeof loadFamilyPrayers!=='function' || typeof currentPrayerMember!=='function') return false;
    const board = loadFamilyPrayers(todayKey()) || {};
    const me = currentPrayerMember();
    return !!(me && board[me] && board[me].text);
  }catch(e){ return false; }
}
// 오늘 통독(오늘의 바이블버스) 읽음 여부
function _isReadingDoneToday(){
  try{ return localStorage.getItem('pat_read_done_'+todayKey())==='1'; }catch(e){ return false; }
}
function updateHomeDisplay(){
  const recs  = loadRec();
  const today = todayKey();
  // ★ 점수 연산 수정: 실제 활동 3가지에 연결 (암송 / 기도 / 통독)
  //   - (버그) 기존엔 r.date 를 봤으나 암송 기록은 completedAt 필드라 항상 0점이었음
  const memorized = recs.some(r => String(r.completedAt || r.date || '').slice(0,10) === today);
  const prayed    = _isPrayerDoneToday();
  const read      = _isReadingDoneToday();
  const total     = (memorized?1:0) + (prayed?1:0) + (read?1:0);
  const maxScore  = 3;
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

  const list = safeMembers.map((m, idx) => {
    const orderNum = idx + 1; // ★ 등록 순서 번호
    const status = m.done
      ? '<span style="margin-left:8px;font-size:calc(var(--fs)-2px);color:var(--accent)">✓ 완료</span>'
      : '<span style="margin-left:8px;font-size:calc(var(--fs)-2px);color:var(--muted)">· 미완료</span>';
    return `<div class="member" style="display:flex;justify-content:space-between;align-items:center">
              <div style="flex:1">
                <span style="color:var(--muted);margin-right:8px;font-weight:700;font-size:calc(var(--fs)-2px)">${orderNum}.</span>
                <span>${esc(m.name)}</span>
                ${status}
              </div>
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

  if(myNonce !== familyProgressNonce) return; // 더 최신 호출이 있음 → 폐기
  if(!Array.isArray(cloudMembers)) return;

  // ★ await 이후 stale profile 방지 — localStorage 최신값 재조회
  const freshProfile = loadFamilyProfile() || profile;
  const myName = freshProfile.memberName || freshProfile.leaderName || '';

  // Firebase는 완료 여부를 가져오고, 구성원 목록이 있으면 대표가 저장한 목록을 기준으로 삼음
  const doneMap = {};
  cloudMembers.forEach(m => {
    const n = m.displayName || m.name || '';
    if(n) doneMap[n] = !!m.done;
  });

  const cloudNames = normalizeFamilyMemberNames(cloudMembers);
  const localNames = cloudNames.length ? cloudNames.slice() : familyMemberNames(freshProfile);

  const merged = localNames.map(name => ({
    name,
    me  : myName ? name === myName : false,
    done: doneMap[name] || false,
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
  const profile = loadFamilyProfile();

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
  // ★ 본인 완료 여부는 로컬 기록(현재 구절)으로 판정 — 등록만으로 완료 처리하지 않음
  const myVerseDone = loadRec().some(r => r.ref === DB.verse.ref);
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
        const myDone2 = loadRec().some(r => r.ref === DB.verse.ref);
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
    const updatedProfile = { ...existing, memberName: name, members };
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
          roomName: found.roomName || '',
          leaderName: found.leaderName || '',
          parish: found.parish || '',
          district: found.district || '',
          familyPassword: pw,
          memberName: name,
          members
        };
        setFamilyStorage('pat_family_profile', JSON.stringify(profileData));
        await PAT_DB.joinFamily(DB.church.code, found.id, name);
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
