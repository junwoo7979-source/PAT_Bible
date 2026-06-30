'use strict';
// 4단계: 시상 종류 분리 — rankFamilies가 전달된 families 목록(종류 필터 결과) 기준으로만
//        순위를 내고, familyId로 기록을 분리 집계하는지 검증.
//  (getAwardRanking/getDashboard의 groupType 필터는 이 families/records 목록을 좁히는 역할)

const assert = require('node:assert/strict');
const { rankFamilies } = require('../functions/aggregate.js');

// 같은 사람(아빠)이 가정+구역 양쪽에 기록(3단계: 1회 완료가 두 방에 저장된 상태)
const records = [
  { familyId: 'fam1', memberName: '아빠', verseRef: 'v1' },
  { familyId: 'guy1', memberName: '아빠', verseRef: 'v1' },
];
const famGajeong = [{ id: 'fam1', roomName: '우리가족', memberNames: ['아빠', '엄마'] }];
const famGuyeok  = [{ id: 'guy1', roomName: '3구역',   memberNames: ['아빠', '김장로'] }];

// 가정 순위(가정 families만 전달) — 구역 기록(guy1)은 섞이지 않음
(function testGajeongRanking() {
  const r = rankFamilies(famGajeong, records, 1);
  assert.equal(r.length, 1, '가정 1개만 순위에 포함');
  assert.equal(r[0].familyId, 'fam1');
  const abba = r[0].members.find(m => m.name === '아빠');
  assert.equal(abba.rate, 100, '아빠는 가정에서 v1 완료 → 100%');
  const umma = r[0].members.find(m => m.name === '엄마');
  assert.equal(umma.rate, 0, '엄마는 미완료 → 0%');
  console.log('  ✓ 가정 순위: 가정 families만, familyId로 분리 집계');
})();

// 구역 순위(구역 families만 전달) — 가정 기록(fam1)은 섞이지 않음
(function testGuyeokRanking() {
  const r = rankFamilies(famGuyeok, records, 1);
  assert.equal(r.length, 1, '구역 1개만 순위에 포함');
  assert.equal(r[0].familyId, 'guy1');
  const abba = r[0].members.find(m => m.name === '아빠');
  assert.equal(abba.rate, 100, '아빠는 구역에서도 v1 완료(3단계 반영) → 100%');
  console.log('  ✓ 구역 순위: 구역 families만, 1회 완료가 구역에도 반영');
})();

console.log('\n✅ award-grouptype: 모든 테스트 통과');
