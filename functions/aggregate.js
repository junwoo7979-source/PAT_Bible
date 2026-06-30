'use strict';

// 교구값 정규화 — 옛 자유입력("1", "1 교구", "일교구", "제1교구" 등)도
// 표준형("1교구"/"2교구"/"3교구")으로 매핑해 집계에 포함시킨다.
function normalizeParish(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  if (s === '1교구' || s === '2교구' || s === '3교구') return s;
  const map = { '1': '1교구', '2': '2교구', '3': '3교구', '일': '1교구', '이': '2교구', '삼': '3교구' };
  const m = s.match(/[123일이삼]/);
  if (m && map[m[0]]) return map[m[0]];
  return s; // 알 수 없는 값 → 원본 유지(교구 집계에서 제외)
}

// 교구/그룹 빈 집계 객체 생성. groups(교회별 그룹명 배열)가 있으면 그걸로, 없으면 레거시 1/2/3교구.
function _emptyByGroup(groups) {
  const byParish = {};
  if (Array.isArray(groups) && groups.length) {
    groups.forEach(g => { const n = String(g == null ? '' : g).trim(); if (n) byParish[n] = 0; });
  } else {
    byParish['1교구'] = 0; byParish['2교구'] = 0; byParish['3교구'] = 0;
  }
  return byParish;
}
// 가정/기록의 교구값을 집계 키에 매칭. 정확 일치 우선(커스텀 이름) → 레거시 normalize(1/일/1교구) 폴백.
//   덕분에 세광을 동적 groups(1교구…)로 옮겨도 옛 자유입력("1","일교구")이 그대로 잡힌다.
function _matchGroup(rawParish, byParish) {
  const p = String(rawParish == null ? '' : rawParish).trim();
  if (byParish[p] !== undefined) return p;
  const norm = normalizeParish(p);
  if (byParish[norm] !== undefined) return norm;
  return null;
}

// 교구별 등록 인원(멤버 헤드카운트) 집계 — 순수 함수(테스트 가능).
// 각 가정의 인원 = 선언된 members 배열 + 입장한 members 서브컬렉션의 "이름 합집합".
// families: [{ parish, members:[...], joinedMembers:[{displayName|name}] }]
// groups(선택): 교회별 그룹명 배열. 없으면 1/2/3교구(레거시 동일 동작).
function countParishMembers(families, groups) {
  const byParish = _emptyByGroup(groups);
  let totalMembers = 0;
  for (const f of (families || [])) {
    const names = new Set();
    if (Array.isArray(f.members)) {
      f.members.forEach(m => {
        const name = (typeof m === 'string' ? m : (m && (m.displayName || m.name)) || '').trim();
        if (name) names.add(name);
      });
    }
    if (Array.isArray(f.joinedMembers)) {
      f.joinedMembers.forEach(m => {
        const name = ((m && (m.displayName || m.name)) || '').trim();
        if (name) names.add(name);
      });
    }
    const count = names.size;
    totalMembers += count;
    const g = _matchGroup(f.parish, byParish);
    if (g) byParish[g] += count;
  }
  return { byParish, totalMembers };
}

// 교구별 "진도"(현재 구절을 실제로 완료한 멤버 수) 집계 — 순수 함수(테스트 가능).
// records: [{ familyId, deviceId, memberName, parish }]  (현재 구절 기록만)
// familyToParish: { [familyId]: parish }  (가정의 교구로 우선 매핑, 없으면 record.parish)
// 멤버 단위 중복 제거(같은 멤버가 여러 번 기록해도 1명).
function countCompletedMembersByParish(records, familyToParish, groups) {
  const byParish = _emptyByGroup(groups);
  const seen = new Set();
  for (const r of (records || [])) {
    const familyId = r.familyId || '';
    // ★ 멤버 식별: 이름 우선(참가 인원과 동일 기준) → 같은 사람이 여러 기기/브라우저로
    //   완료해도 1명으로 집계. 이름 없을 때만 deviceId 폴백.
    //   (이전엔 deviceId 우선이라 한 사람이 여러 기기로 완료 시 중복 카운트돼
    //    완료>참가 = 300% 같은 비정상 실천율이 발생했음)
    const memberId = String(r.memberName || '').trim() || r.deviceId || '';
    if (!familyId && !memberId) continue; // 식별 불가 기록 무시
    const key = familyId + '|' + memberId;
    if (seen.has(key)) continue;
    seen.add(key);
    const rawParish = (familyToParish && familyToParish[familyId]) || r.parish;
    const g = _matchGroup(rawParish, byParish);
    if (g) byParish[g] += 1;
  }
  return { byParish, completedMembers: seen.size };
}

// 시상관리: 가족별 실천율 순위 — 교구별 현황과 동일한 Firestore 데이터(가족·기록) 사용.
// families: [{ id, roomName, memberNames:[...] }]
// records:  [{ familyId, memberName, verseRef }]  (전체 구절 기록)
// totalVerses: 교회에 등록된 총 구절 수 (분모)
// 멤버 실천율 = 그 멤버가 완료한 구절 수 / 총 구절 수, 가족 평균 = 멤버 평균.
// ★ 버그 수정: memberNames에 없지만 records에는 있는 사람도 포함 (암송/기도 완료했지만 members에 미등록된 경우)
function rankFamilies(families, records, totalVerses) {
  const tv = totalVerses > 0 ? totalVerses : 1;
  // familyId → memberName → Set(verseRef)
  const map = {};
  for (const r of (records || [])) {
    if (!r || !r.familyId || !r.verseRef) continue;
    const name = String(r.memberName || '').trim();
    if (!name) continue;
    if (!map[r.familyId]) map[r.familyId] = {};
    if (!map[r.familyId][name]) map[r.familyId][name] = new Set();
    map[r.familyId][name].add(r.verseRef);
  }
  const ranked = (families || []).map(f => {
    const memberMap = map[f.id] || {};
    const names = new Set();

    // 1) memberNames(선언된 members + 입장한 members) 추가
    if (Array.isArray(f.memberNames)) {
      f.memberNames.forEach(n => names.add(n));
    }

    // 2) memberNames에는 없지만 records에 있는 사람도 추가
    // (예: 암송/기도 완료했지만 초기 members에 미등록된 구성원)
    Object.keys(memberMap).forEach(name => {
      if (name) names.add(name);
    });

    const members = Array.from(names).map(name => {
      const done = memberMap[name] ? memberMap[name].size : 0;
      return { name, rate: Math.min(100, Math.round((done / tv) * 100)) };
    });

    const averageRate = members.length
      ? Math.round(members.reduce((s, m) => s + m.rate, 0) / members.length) : 0;
    return { familyId: f.id, familyName: f.roomName || '가족', memberCount: members.length, members, averageRate };
  });
  ranked.sort((a, b) => b.averageRate - a.averageRate);
  return ranked;
}

module.exports = { countParishMembers, countCompletedMembersByParish, normalizeParish, rankFamilies };
