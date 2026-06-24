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

// 교구별 등록 인원(멤버 헤드카운트) 집계 — 순수 함수(테스트 가능).
// 각 가정의 인원 = 선언된 members 배열 + 입장한 members 서브컬렉션의 "이름 합집합".
// families: [{ parish, members:[...], joinedMembers:[{displayName|name}] }]
function countParishMembers(families) {
  const byParish = { '1교구': 0, '2교구': 0, '3교구': 0 };
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
    const parish = normalizeParish(f.parish);
    if (byParish[parish] !== undefined) byParish[parish] += count;
  }
  return { byParish, totalMembers };
}

// 교구별 "진도"(현재 구절을 실제로 완료한 멤버 수) 집계 — 순수 함수(테스트 가능).
// records: [{ familyId, deviceId, memberName, parish }]  (현재 구절 기록만)
// familyToParish: { [familyId]: parish }  (가정의 교구로 우선 매핑, 없으면 record.parish)
// 멤버 단위 중복 제거(같은 멤버가 여러 번 기록해도 1명).
function countCompletedMembersByParish(records, familyToParish) {
  const byParish = { '1교구': 0, '2교구': 0, '3교구': 0 };
  const seen = new Set();
  for (const r of (records || [])) {
    const familyId = r.familyId || '';
    const memberId = r.deviceId || r.memberName || '';
    if (!familyId && !memberId) continue; // 식별 불가 기록 무시
    const key = familyId + '|' + memberId;
    if (seen.has(key)) continue;
    seen.add(key);
    const rawParish = (familyToParish && familyToParish[familyId]) || r.parish;
    const parish = normalizeParish(rawParish);
    if (byParish[parish] !== undefined) byParish[parish] += 1;
  }
  return { byParish, completedMembers: seen.size };
}

// 시상관리: 가족별 실천율 순위 — 교구별 현황과 동일한 Firestore 데이터(가족·기록) 사용.
// families: [{ id, roomName, memberNames:[...] }]
// records:  [{ familyId, memberName, verseRef }]  (전체 구절 기록)
// totalVerses: 교회에 등록된 총 구절 수 (분모)
// 멤버 실천율 = 그 멤버가 완료한 구절 수 / 총 구절 수, 가족 평균 = 멤버 평균.
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
    const names = Array.isArray(f.memberNames) ? f.memberNames : [];
    const members = names.map(name => {
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
