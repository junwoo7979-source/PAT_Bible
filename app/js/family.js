// ====== PAT Bible — family.js ======
// 가족방 등록/조회, 초대 링크, 클라우드 동기화

// ── 프로필 헬퍼 ───────────────────────────────────────────
function loadFamilyProfile(){
  try{ return JSON.parse(localStorage.getItem('pat_family_profile')||'null'); }catch(e){ return null; }
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
function deleteFamilyMember(encodedName){
  const name    = decodeURIComponent(encodedName);
  const profile = loadFamilyProfile();
  if(!profile || !Array.isArray(profile.members)) return;
  const members     = profile.members.filter(member => member !== name);
  const nextProfile = { ...profile, members };
  localStorage.setItem('pat_family_profile', JSON.stringify(nextProfile));
  if(window.PAT_DB && PAT_DB.ready()){ PAT_DB.saveFamily(DB.church.code, nextProfile); }
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
    localStorage.setItem('pat_family_profile', JSON.stringify({ ...existing, memberName:name, members }));
    if(window.PAT_DB && PAT_DB.ready()){
      const familyId = localStorage.getItem('pat_family_id')||'';
      if(familyId) await PAT_DB.joinFamily(DB.church.code, familyId, name);
    }
  } else {
    if(window.PAT_DB && PAT_DB.ready() && PAT_DB.findFamilyByPassword){
      const found = await PAT_DB.findFamilyByPassword(DB.church.code, pw);
      if(found){
        const members = Array.isArray(found.members) ? found.members.slice() : [];
        if(!members.includes(name)) members.push(name);
        localStorage.setItem('pat_family_id', found.id);
        localStorage.setItem('pat_family_profile', JSON.stringify({
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
    localStorage.setItem('pat_family_profile', JSON.stringify(joined));
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
function openFamilyRegister(tab){
  const profile = loadFamilyProfile();
  document.getElementById('familyRoomName').value   = profile?.roomName||'';
  document.getElementById('familyLeaderName').value = profile?.leaderName||'';
  document.getElementById('familyParish').value     = profile?.parish||'';
  document.getElementById('familyDistrict').value   = profile?.district||'';
  document.getElementById('familyPassword').value   = profile?.familyPassword||DB.church.code;
  renderMemberRows(profile?.members||[]);
  renderRegisteredFamilyRoom();
  switchRegTab(tab||'leader');
  go('s-family-register');
}
function saveFamilyProfile(){
  const roomName   = document.getElementById('familyRoomName').value.trim();
  const leaderName = document.getElementById('familyLeaderName').value.trim();
  const parish     = document.getElementById('familyParish').value.trim();
  const district   = document.getElementById('familyDistrict').value.trim();
  let familyPassword = document.getElementById('familyPassword').value.trim();
  let members = getMemberNames();
  if(!roomName||!leaderName||!parish||!district){ toast('가족방 이름, 대표 이름, 교구와 구역을 입력하세요'); return; }
  if(!familyPassword) familyPassword = DB.church.code;
  if(!members.includes(leaderName)) members.unshift(leaderName);
  localStorage.setItem('pat_family_profile', JSON.stringify({ roomName, leaderName, parish, district, familyPassword, members }));
  if(window.PAT_DB && PAT_DB.ready()){
    PAT_DB.saveFamily(DB.church.code, { roomName, leaderName, parish, district, familyPassword, members })
      .then(familyId=>{
        if(familyId) PAT_DB.joinFamily(DB.church.code, familyId, leaderName);
      });
  }
  renderFamilyProfile();
  go('s-family');
  toast('✓ 가족방 정보가 저장되었습니다');
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
  const url = location.href.split('?')[0]+'?invite='+encoded;
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
  const pw = document.getElementById('invitePasswordInput').value.trim();
  if(!pw){ toast('비밀번호를 입력해주세요'); return; }

  // 서버에서 비밀번호 검증 (평문 로컬 비교 제거)
  if(window.PAT_DB && PAT_DB.ready() && PAT_DB.findFamilyByPassword){
    const found = await PAT_DB.findFamilyByPassword(DB.church.code, pw, data.familyId);
    if(!found){ toast('비밀번호가 올바르지 않습니다'); return; }
    if(found.id) localStorage.setItem('pat_family_id', found.id);
    localStorage.setItem('pat_family_profile', JSON.stringify({
      roomName: found.roomName || data.roomName,
      leaderName: found.leaderName || data.leaderName,
      parish: found.parish || data.parish,
      district: found.district || data.district,
      familyPassword: pw,
    }));
  } else {
    // 오프라인 fallback: 로컬 정보로만 저장
    localStorage.setItem('pat_family_profile', JSON.stringify({
      roomName:data.roomName, leaderName:data.leaderName,
      parish:data.parish, district:data.district, familyPassword:pw,
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
function updateHomeDisplay(){
  const tasks    = loadDailyTasks();
  const recs     = loadRec();
  const today    = todayKey();
  const memorized = recs.some(r => r.date && r.date.startsWith(today));
  const writing  = tasks.writing||0;
  const prayer   = !!tasks.prayer;
  const total    = writing + (memorized?1:0) + (prayer?1:0);
  const maxScore = 4;
  const pct      = Math.round(total/maxScore*100);

  const el = id => document.getElementById(id);

  // 원형 퍼센트 + 점수 + 바
  if(el('hmCircle'))        el('hmCircle').textContent    = pct+'%';
  if(el('hmScore'))         el('hmScore').textContent     = total+'/'+maxScore+'점';
  if(el('hmProgressFill'))  el('hmProgressFill').style.width = pct+'%';
  if(el('hmAllDone'))       el('hmAllDone').style.display = (total===maxScore)?'block':'none';

  // 성경 쓰기 도트
  if(el('hmDotW0')) el('hmDotW0').classList.toggle('on', writing>=1);
  if(el('hmDotW1')) el('hmDotW1').classList.toggle('on', writing>=2);
  if(el('hmTaskWriting')) el('hmTaskWriting').classList.toggle('done', writing>=2);
  if(el('btnWritingMinus')) el('btnWritingMinus').disabled = writing<=0;
  if(el('btnWritingPlus'))  el('btnWritingPlus').disabled  = writing>=2;

  // 암송 체크
  if(el('hmCheckMemorize')){
    el('hmCheckMemorize').textContent = memorized?'✓':'○';
    el('hmCheckMemorize').classList.toggle('checked', memorized);
  }
  if(el('hmTaskMemorize')) el('hmTaskMemorize').classList.toggle('done', memorized);

  // 기도 체크
  if(el('hmCheckPrayer')){
    el('hmCheckPrayer').textContent = prayer?'✓':'○';
    el('hmCheckPrayer').classList.toggle('checked', prayer);
  }
  if(el('hmTaskPrayer')) el('hmTaskPrayer').classList.toggle('done', prayer);
}
function initHomeScreen(){
  // 날짜
  const now  = new Date();
  const days = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  const el   = id => document.getElementById(id);
  if(el('hmDate')) el('hmDate').textContent =
    (now.getMonth()+1)+'월 '+now.getDate()+'일 ('+days[now.getDay()]+')';

  // 인사말
  const profile = loadFamilyProfile();
  const name    = profile?.leaderName || profile?.memberName || '';
  if(el('hmGreeting')) el('hmGreeting').textContent =
    name ? '안녕하세요, '+name+'님 👋' : '안녕하세요! 👋';

  // 스트릭
  const streak = parseInt(localStorage.getItem('pat_streak_days')||'0');
  if(el('hmStreakCard')) el('hmStreakCard').style.display = streak>0 ? 'flex' : 'none';
  if(el('hmStreakText')) el('hmStreakText').textContent   = streak+'일 연속 달성!';

  // 이번 주 구절
  if(el('hmVerseText')) el('hmVerseText').textContent = DB.verse.text ? '"'+DB.verse.text+'"' : '';
  if(el('hmVerseRef'))  el('hmVerseRef').textContent  = DB.verse.ref  || '';
  if(el('hmVerseCard')) el('hmVerseCard').style.display = DB.verse.text ? 'block' : 'none';

  updateHomeDisplay();
}

// ── 가족 진행 상황 폴링 ───────────────────────────────────
let familyProgressSyncKey = '';
let familyProgressPollKey = '';
let familyProgressPollTimer = null;

function renderFamilyMemberList(members){
  const safeMembers = members.length ? members : [{ name:'나', me:true, done:false }];
  DB.members = safeMembers;
  const doneCount = safeMembers.filter(m=>m.done).length;
  const pct = Math.round(doneCount/safeMembers.length*100);
  document.getElementById('familyProgress').textContent = `이번 주 달성률 ${doneCount}/${safeMembers.length}명`;
  document.getElementById('familyBar').style.width = pct+'%';
  const list = safeMembers.map(m=>
    `<div class="member"><span>${esc(m.name)}${m.me?' (나)':''}</span>
     <span class="${m.done?'tag-ok':'tag-wait'}">${m.done?'✔ 완료':'대기'}</span></div>`).join('');
  document.getElementById('memberList').innerHTML = list;
}
async function syncFamilyProgressFromCloud(profile){
  const familyId = localStorage.getItem('pat_family_id')||'';
  if(!profile || !familyId || !window.PAT_DB || !PAT_DB.ready() || !PAT_DB.getFamilyProgress) return;
  const syncKey = familyId+'|'+DB.verse.ref;
  familyProgressSyncKey = syncKey;
  const cloudMembers = await PAT_DB.getFamilyProgress(DB.church.code, familyId, DB.verse.ref);
  if(familyProgressSyncKey !== syncKey || !Array.isArray(cloudMembers) || !cloudMembers.length) return;
  const myName  = profile.memberName || profile.leaderName || '';
  const members = cloudMembers.map((member,index)=>({
    name : member.displayName || member.name || '성도',
    me   : myName ? member.displayName === myName : index === 0,
    done : !!member.done
  }));
  renderFamilyMemberList(members);
  const names = members.map(m=>m.name).filter(Boolean);
  localStorage.setItem('pat_family_profile', JSON.stringify({ ...profile, members:names }));
  renderRegisteredFamilyRoom();
}
function startFamilyProgressPolling(profile){
  const familyId = localStorage.getItem('pat_family_id')||'';
  if(!profile || !familyId || !window.PAT_DB || !PAT_DB.ready() || !PAT_DB.getFamilyProgress) return;
  const pollKey = familyId+'|'+DB.verse.ref;
  if(familyProgressPollKey === pollKey && familyProgressPollTimer) return;
  if(familyProgressPollTimer) clearInterval(familyProgressPollTimer);
  familyProgressPollKey  = pollKey;
  familyProgressPollTimer = setInterval(()=>syncFamilyProgressFromCloud(loadFamilyProfile()), 10000);
}
function renderFamily(){
  const recs    = loadRec();
  const profile = loadFamilyProfile();
  const profileMembers = familyMemberNames(profile);
  if(profileMembers.length){
    DB.members = profileMembers.map((name,i)=>({
      name, me: i===0,
      done: i===0 ? (recs.length>0) : false
    }));
    if(!DB.members.find(m=>m.me)) DB.members[0].me = true;
  }
  const me = DB.members.find(m=>m.me);
  if(recs.length>0 && me) me.done = true;
  renderFamilyMemberList(DB.members);
  const syncPromise = syncFamilyProgressFromCloud(profile);
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
