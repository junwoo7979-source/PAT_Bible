// ====== PAT Bible — reset-pw.js ======
// 가족 비밀번호 재설정 (본인 직접 + 관리자)

async function doResetFamilyPassword() {
  const churchCode = (document.getElementById('rpChurchCode')?.value || '').trim();
  const leaderName = (document.getElementById('rpLeaderName')?.value || '').trim();
  const parish     = (document.getElementById('rpParish')?.value || '').trim();
  const district   = (document.getElementById('rpDistrict')?.value || '').trim();
  const newPw      = (document.getElementById('rpNewPw')?.value || '').trim();
  const newPw2     = (document.getElementById('rpNewPw2')?.value || '').trim();

  if (!churchCode) { toast('교회 코드를 입력해주세요'); return; }
  if (!leaderName) { toast('대표자 이름을 입력해주세요'); return; }
  if (!parish)     { toast('교구를 입력해주세요'); return; }
  if (!district)   { toast('구역을 입력해주세요'); return; }
  if (!newPw)      { toast('새 비밀번호를 입력해주세요'); return; }
  if (newPw.length < 4) { toast('비밀번호는 4자 이상이어야 합니다'); return; }
  if (newPw !== newPw2) { toast('비밀번호가 일치하지 않습니다'); return; }

  if (!window.PAT_DB || !PAT_DB.ready()) {
    toast('서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요'); return;
  }

  const btn = document.getElementById('rpNewPw2')?.closest('section')?.querySelector('button.btn');
  if (btn) btn.disabled = true;

  const result = await PAT_DB.resetFamilyPassword(churchCode, leaderName, parish, district, newPw);

  if (btn) btn.disabled = false;

  if (!result.ok) {
    toast('❌ ' + (result.error || '재설정 실패'));
    return;
  }

  // 성공: 로컬 정보 업데이트 후 로그인 화면으로
  const profile = loadFamilyProfile();
  if (profile) {
    localStorage.setItem('pat_family_profile', JSON.stringify({
      ...profile,
      familyPassword: newPw,
    }));
    if (result.familyId) localStorage.setItem('pat_family_id', result.familyId);
  }

  // 입력 초기화
  ['rpChurchCode','rpLeaderName','rpParish','rpDistrict','rpNewPw','rpNewPw2']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  toast('✅ 비밀번호가 재설정되었습니다! 새 비밀번호로 로그인하세요');
  go('s-login');
}

async function doAdminResetFamilyPassword() {
  const leaderName = (document.getElementById('adminRpLeader')?.value || '').trim();
  const parish     = (document.getElementById('adminRpParish')?.value || '').trim();
  const district   = (document.getElementById('adminRpDistrict')?.value || '').trim();
  const newPw      = (document.getElementById('adminRpNewPw')?.value || '').trim();

  if (!leaderName) { toast('대표자 이름을 입력해주세요'); return; }
  if (!parish)     { toast('교구를 입력해주세요'); return; }
  if (!district)   { toast('구역을 입력해주세요'); return; }
  if (!newPw || newPw.length < 4) { toast('새 비밀번호를 4자 이상 입력해주세요'); return; }

  if (!window.PAT_DB || !PAT_DB.ready()) {
    toast('서버에 연결되지 않았습니다'); return;
  }

  const result = await PAT_DB.resetFamilyPassword(DB.church.code, leaderName, parish, district, newPw);

  if (!result.ok) {
    toast('❌ ' + (result.error || '재설정 실패'));
    return;
  }

  ['adminRpLeader','adminRpParish','adminRpDistrict','adminRpNewPw']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  toast('✅ ' + leaderName + ' 대표 가족방 비밀번호가 초기화되었습니다');
}
