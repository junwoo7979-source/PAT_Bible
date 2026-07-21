// Task 1: KRV 음원 매니페스트 계약 테스트
// validateManifest / chapterEntry / nextChapter — 부분 공급(partial-provision) 픽스처 기준
const assert = require('node:assert/strict');
const M = require('../app/js/audio-manifest.js');

const fixture = {
  schemaVersion: 1,
  audioVersion: 'krv-m1-1',
  translation: 'krv',
  voice: 'male-1',
  books: [
    {
      bookId: 'GEN',
      nameKo: '창세기',
      chapterCount: 3,
      chapters: [
        { chapter: 1, url: '/audio/krv/male-1/GEN/001.mp3', duration: 120, bytes: 1000, sha256: 'a', available: true },
        { chapter: 2, available: false },
        { chapter: 3, url: '/audio/krv/male-1/GEN/003.mp3', duration: 130, bytes: 1100, sha256: 'c', available: true },
      ],
    },
  ],
};

// 정상 매니페스트는 오류 없이 통과
assert.deepEqual(M.validateManifest(fixture), { ok: true, errors: [] });

// 장 조회 — available=false 장도 명시적으로 존재해야 한다
assert.equal(M.chapterEntry(fixture, 'GEN', 2).available, false);

// 자동 연속 재생 — 바로 다음 장이 미제공이면 건너뛰지 않고 멈춘다
assert.deepEqual(M.nextChapter(fixture, 'GEN', 1), { status: 'unavailable', bookId: 'GEN', chapter: 2 });
assert.deepEqual(M.nextChapter(fixture, 'GEN', 3), { status: 'book-end' });

// 개역한글(krv) 외 역본은 거부
assert.equal(M.validateManifest({ ...fixture, translation: '개역개정' }).ok, false);

// 장 번호 중복은 거부
const duplicate = structuredClone(fixture);
duplicate.books[0].chapters[2].chapter = 2;
assert.equal(M.validateManifest(duplicate).ok, false);

console.log('audio-manifest: all assertions passed');
