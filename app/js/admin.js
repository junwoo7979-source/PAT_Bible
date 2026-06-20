// ====== PAT Bible — admin.js ======
// 관리자 페이지 탭 관리 및 시상 통계

// ── 관리자 탭 전환 ────────────────────────────────────
function switchAdminTab(tabName) {
  // 모든 탭 숨기기
  document.getElementById('adminTabVerse').style.display = 'none';
  document.getElementById('adminTabAward').style.display = 'none';
  document.getElementById('adminTabPassword').style.display = 'none';

  // 모든 탭 버튼 비활성화
  document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));

  // 선택한 탭 표시
  const tabMap = {
    verse: 'adminTabVerse',
    church: 'adminTabVerse',  // ★ 교회 정보도 구절 등록 탭의 콘텐츠 사용 (ID 중복 방지)
    award: 'adminTabAward',
    password: 'adminTabPassword'
  };

  const tabId = tabMap[tabName];
  const tabEl = document.getElementById(tabId);
  if (tabEl) {
    tabEl.style.display = 'block';
  }

  // 탭 제목 업데이트
  const titleMap = {
    verse: '📖 구절 등록',
    church: '⛪ 교회 정보',
    award: '🏆 시상 관리',
    password: '🔑 비밀번호'
  };
  const titleEl = document.getElementById('adminTabTitle');
  if (titleEl) {
    titleEl.textContent = titleMap[tabName] || '관리';
  }

  // 선택한 버튼 활성화 (event.target이 안정적이지 않을 수 있으므로 직접 찾기)
  const tabButtons = {
    verse: document.querySelectorAll('.admin-tab')[0],
    church: document.querySelectorAll('.admin-tab')[1],
    award: document.querySelectorAll('.admin-tab')[2],
    password: document.querySelectorAll('.admin-tab')[3]
  };
  const btn = tabButtons[tabName];
  if (btn) btn.classList.add('active');

  // 각 탭별 초기화 작업
  if (tabName === 'award') {
    renderAwardRanking();
    updateAwardListOnValueChange();
  }
}

// ── 1년 개인 실천율 계산 ────────────────────────────────────
function calculatePersonalPracticeRate(familyId, memberId, churchCode) {
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  let completedDays = 0;
  const totalDays = 365;

  // localStorage에서 지난 1년 기록 확인
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(oneYearAgo);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    // 현재 저장 방식: pat_rec_{dateStr}
    const key = `pat_rec_${dateStr}`;
    const rec = JSON.parse(localStorage.getItem(key) || '{}');

    // 해당 날짜에 이 가족이 완료 기록이 있으면 카운트
    // 구조: { familyId: { memberIds: [memberId1, ...], done: true } }
    if (rec[familyId] && rec[familyId].done) {
      completedDays++;
    }
  }

  const rate = Math.round((completedDays / totalDays) * 100);
  return { rate, completedDays, totalDays };
}

// ── 가족별 1년 실천율 계산 ────────────────────────────────────
function calculateFamilyPracticeRate(familyId, churchCode) {
  const profile = loadFamilyProfile();

  // 현재 로그인한 가족 정보만 계산 가능
  // (다른 가족의 정보는 Firebase에서 가져와야 함)
  if (!profile || profile.familyId !== familyId) {
    // 향후 Firebase에서 모든 가족 정보 조회 필요
    return {
      familyId,
      familyName: '미정의 가족',
      memberCount: 0,
      members: [],
      averageRate: 0
    };
  }

  const members = profile.members || [];
  if (members.length === 0) {
    return {
      familyId,
      familyName: profile.familyName || '우리 가족',
      memberCount: 0,
      members: [],
      averageRate: 0
    };
  }

  // 각 구성원의 1년 실천율 계산
  const memberRates = members.map(member => {
    const { rate } = calculatePersonalPracticeRate(familyId, member.id || member.name, churchCode);
    return {
      name: member.name,
      rate
    };
  });

  // 가족 평균 실천율
  const avgRate = Math.round(
    memberRates.reduce((sum, m) => sum + m.rate, 0) / members.length
  );

  return {
    familyId,
    familyName: profile.familyName || '우리 가족',
    memberCount: members.length,
    members: memberRates,
    averageRate: avgRate
  };
}

// ── 교회 내 모든 가족 순위 (Firebase 연동 필요) ────────────────────────────────────
async function getRankedFamilies(churchCode) {
  // 현재는 로컬 데이터만 사용 (Firebase 준비 필요)
  // 실제 구현: Firebase에서 모든 가족 정보 조회
  //
  // const families = await PAT_DB.getChurchFamilies(churchCode);
  // const rankings = families.map(f => calculateFamilyPracticeRate(f.id, churchCode));

  // 임시: 로컬 저장된 가족 정보 사용
  const profile = loadFamilyProfile();
  if(!profile) return [];
  const currentFamily = calculateFamilyPracticeRate(profile.familyId, churchCode);

  // 실제는 Firebase에서 여러 가족 데이터를 받아야 함
  // 이 함수는 향후 Firebase 통합 시 완성될 예정
  return [currentFamily];
}

// ── 시상 순위 렌더링 ────────────────────────────────────
async function renderAwardRanking() {
  const churchCode = DB?.church?.code || '11111';
  const rankings = await getRankedFamilies(churchCode);

  // 실천율 기준 정렬
  rankings.sort((a, b) => b.averageRate - a.averageRate);

  const container = document.getElementById('awardRankingList');
  if (!container) return;

  if (rankings.length === 0) {
    container.innerHTML = '<p class="muted" style="text-align:center;padding:20px 0">데이터가 없습니다</p>';
    return;
  }

  container.innerHTML = rankings.map((family, idx) => `
    <div class="award-rank">
      <div class="award-rank-num">🥇</div>
      <div class="award-rank-info">
        <div class="award-rank-family">${esc(family.familyName)} (${family.memberCount}명)</div>
        <div class="award-rank-detail">
          ${family.members.map(m => `${esc(m.name)}: ${m.rate}%`).join(' • ')}
        </div>
      </div>
      <div class="award-rank-rate">${family.averageRate}%</div>
    </div>
  `).join('');
}

// ── 가족 검색 (시상 조회) ────────────────────────────────────
function searchFamilyForAward() {
  const query = document.getElementById('awardFamilySearch').value.trim().toLowerCase();
  const churchCode = DB?.church?.code || '11111';

  const profile = loadFamilyProfile();
  const family = calculateFamilyPracticeRate(profile.familyId, churchCode);

  const container = document.getElementById('awardFamilyList');
  if (!container) return;

  if (!query) {
    container.innerHTML = '';
    return;
  }

  // 현재는 로컬 가족만 검색 가능 (향후 Firebase 통합)
  if (family.familyName.toLowerCase().includes(query)) {
    container.innerHTML = `
      <div style="padding:12px;background:var(--bg);border-radius:var(--radius);cursor:pointer"
           onclick="selectFamilyForDetail('${family.familyId}')">
        <div style="font-weight:700;margin-bottom:4px">${esc(family.familyName)}</div>
        <div class="muted" style="font-size:calc(var(--fs)-2px)">
          ${family.memberCount}명 • 평균 ${family.averageRate}%
        </div>
      </div>
    `;
  } else {
    container.innerHTML = '<p class="muted" style="text-align:center;padding:12px 0">검색 결과 없음</p>';
  }
}

// ── 가족별 상세 정보 표시 ────────────────────────────────────
function selectFamilyForDetail(familyId) {
  const churchCode = DB?.church?.code || '11111';
  const family = calculateFamilyPracticeRate(familyId, churchCode);

  const container = document.getElementById('awardFamilyList');
  if (!container) return;

  container.innerHTML = `
    <div style="padding:16px;background:var(--bg);border-radius:var(--radius)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-weight:700;font-size:calc(var(--fs)+1px)">${esc(family.familyName)}</div>
        <button class="btn sm" onclick="document.getElementById('awardFamilyList').innerHTML=''">닫기</button>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:12px">
        ${family.members.map((m, idx) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
            <span>${esc(m.name)}</span>
            <span style="font-weight:700;color:var(--accent)">${m.rate}%</span>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;font-weight:700;border-top:2px solid var(--line);margin-top:8px">
        <span>가족 평균</span>
        <span style="color:var(--accent);font-size:calc(var(--fs)+2px)">${family.averageRate}%</span>
      </div>
    </div>
  `;
}

// ── 시상 대상 생성 (자동 업데이트) ────────────────────────────────────
async function generateAwardList() {
  const minRate = parseInt(document.getElementById('awardMinRate').value) || 85;
  const churchCode = DB?.church?.code || '11111';
  const rankings = await getRankedFamilies(churchCode);

  // 기준 실천율 이상인 가족 필터링
  const awardFamilies = rankings.filter(f => f.averageRate >= minRate);
  awardFamilies.sort((a, b) => b.averageRate - a.averageRate);

  const container = document.getElementById('awardFinalList');
  if (!container) return;

  if (awardFamilies.length === 0) {
    container.innerHTML = `<p class="muted" style="text-align:center;padding:20px 0">
      ${minRate}% 이상의 실천율을 가진 가족이 없습니다
    </p>`;
    return;
  }

  const medalEmojis = ['🥇', '🥈', '🥉'];
  container.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--radius);padding:16px">
      <h3 style="margin:0 0 12px 0;font-size:calc(var(--fs)+1px)">
        🎯 시상 대상 (${minRate}% 이상)
      </h3>
      ${awardFamilies.map((f, idx) => `
        <div style="padding:12px;border-bottom:${idx < awardFamilies.length - 1 ? '1px solid var(--line)' : 'none'}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:20px">${medalEmojis[idx] || '🎖️'}</span>
            <span style="font-weight:700;flex:1">${esc(f.familyName)}</span>
            <span style="color:var(--accent);font-weight:700">${f.averageRate}%</span>
          </div>
          <div class="muted" style="font-size:calc(var(--fs)-2px);margin-left:28px">
            ${f.memberCount}명 • ${f.members.map(m => `${esc(m.name)} ${m.rate}%`).join(', ')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── 기준율 입력 필드 값 변경 시 자동 업데이트 ────────────────────────────────────
function updateAwardListOnValueChange() {
  const input = document.getElementById('awardMinRate');
  if (!input) return;

  // 기존 이벤트 리스너 제거 후 새로 추가 (중복 방지)
  if (!input.__hasAwEventListener) {
    input.addEventListener('input', () => {
      generateAwardList();
    });
    input.__hasAwEventListener = true;
  }
}
