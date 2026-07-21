// 개역한글(KRV) 음원 매니페스트 계약 — 순수 함수 모듈
// - 검증은 발견한 모든 오류를 반환한다. 프로덕션 데이터를 조용히 고치지 않는다.
// - Node(node:test)와 브라우저(PAT_AUDIO_MANIFEST_UTIL) 양쪽에서 동일 API 사용.
(function (root) {
  'use strict';

  function chapterEntry(m, bookId, chapter) {
    const b = ((m && m.books) || []).find((x) => x.bookId === bookId);
    return b ? (b.chapters || []).find((x) => x.chapter === Number(chapter)) || null : null;
  }

  // 다음 장 결정 — 미제공(available=false) 장은 건너뛰지 않고 unavailable로 멈춘다
  function nextChapter(m, bookId, chapter) {
    const b = ((m && m.books) || []).find((x) => x.bookId === bookId);
    const n = Number(chapter) + 1;
    if (!b || n > b.chapterCount) return { status: 'book-end' };
    const e = chapterEntry(m, bookId, n);
    return e && e.available
      ? { status: 'available', bookId: bookId, chapter: n }
      : { status: 'unavailable', bookId: bookId, chapter: n };
  }

  function validateManifest(m) {
    const errors = [];
    if (!m || m.schemaVersion !== 1) errors.push('schemaVersion');
    if (!m || m.translation !== 'krv') errors.push('translation');
    if (!m || m.voice !== 'male-1') errors.push('voice');
    for (const b of (m && m.books) || []) {
      if ((b.chapters || []).length !== b.chapterCount) errors.push('chapterCount:' + b.bookId);
      const seen = new Set();
      for (const c of b.chapters || []) {
        if (seen.has(c.chapter)) errors.push('duplicateChapter:' + b.bookId + ':' + c.chapter);
        seen.add(c.chapter);
        if (c.available !== true && c.available !== false) errors.push('available:' + b.bookId + ':' + c.chapter);
        if (c.available === true && (!c.url || !(c.duration > 0) || !(c.bytes > 0) || !c.sha256)) {
          errors.push('chapter:' + b.bookId + ':' + c.chapter);
        }
      }
      for (let n = 1; n <= b.chapterCount; n++) {
        if (!seen.has(n)) errors.push('missingChapter:' + b.bookId + ':' + n);
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  const api = { chapterEntry: chapterEntry, nextChapter: nextChapter, validateManifest: validateManifest };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PAT_AUDIO_MANIFEST_UTIL = api;
})(typeof window !== 'undefined' ? window : null);
