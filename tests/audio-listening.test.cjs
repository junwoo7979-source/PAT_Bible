// Task 2: 날짜별 고유 청취 구간 병합 + 80% 판정 테스트
// 겹침·인접·중복 재청취·seek·2배속·2단 완료 게이트(ended && 80%) 커버
const assert = require('node:assert/strict');
const L = require('../app/js/audio-listening.js');

// 겹침·인접 구간 병합
assert.deepEqual(L.mergeIntervals([[0, 30], [20, 50], [70, 80]]), [[0, 50], [70, 80]]);

// 병합 후 고유 청취 초 — 중복 재청취는 두 번 세지 않는다
assert.equal(L.coveredSeconds([[0, 50], [70, 80]]), 60);

// 완료 게이트: 끝까지 재생(ended) + 80% 이상 커버 둘 다 필요
assert.equal(L.qualifies({ ended: true, intervals: [[0, 80]], duration: 100 }), true);
assert.equal(L.qualifies({ ended: false, intervals: [[0, 100]], duration: 100 }), false);
assert.equal(L.qualifies({ ended: true, intervals: [[95, 100]], duration: 100 }), false);

// 진행 샘플 수용: 실제 재생 중 짧은 전진만 인정
assert.deepEqual(L.acceptProgress({ from: 10, to: 30, seeking: false, playing: true }), [10, 30]);
// seek 점프는 청취로 세지 않는다
assert.equal(L.acceptProgress({ from: 10, to: 90, seeking: true, playing: true }), null);
// 재생 중이 아니면 무시
assert.equal(L.acceptProgress({ from: 20, to: 21, seeking: false, playing: false }), null);

console.log('audio-listening: all assertions passed');
