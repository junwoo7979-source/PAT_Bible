// 날짜별 고유 청취 구간과 80% 완료 판정 — 순수 함수 모듈
// - 콘텐츠 시간(재생 헤드) 기준. 벽시계 시간을 쓰지 않으므로 배속 재생도 정상 인정.
// - 겹치거나 맞닿은(0.25초 이내) 구간은 병합 → 같은 구간 반복 청취는 중복 가산되지 않는다.
// - seek 제외는 acceptProgress의 seeking 플래그가 담당하고,
//   짧은 델타 샘플링(timeupdate 주기)은 AudioController가 책임진다.
(function (root) {
  'use strict';

  function mergeIntervals(input) {
    const xs = (input || [])
      .filter((x) => Array.isArray(x) && x.length === 2 && x[1] > x[0])
      .map((x) => [Number(x[0]), Number(x[1])])
      .sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const x of xs) {
      const last = out[out.length - 1];
      if (last && x[0] <= last[1] + 0.25) last[1] = Math.max(last[1], x[1]);
      else out.push(x);
    }
    return out;
  }

  const coveredSeconds = (xs) => mergeIntervals(xs).reduce((n, x) => n + x[1] - x[0], 0);

  // 완료 게이트: 실제 ended + 그날 고유 청취 80% 이상 — 둘 다 필요
  const qualifies = (x) => !!x.ended && x.duration > 0 && coveredSeconds(x.intervals) / x.duration >= 0.8;

  // 실제 재생 중(playing) 정상 전진만 청취 구간으로 수용. seek·정지 상태는 거부.
  function acceptProgress(x) {
    if (!x.playing || x.seeking) return null;
    if (!Number.isFinite(x.from) || !Number.isFinite(x.to) || x.to <= x.from) return null;
    return [x.from, x.to];
  }

  const api = {
    mergeIntervals: mergeIntervals,
    coveredSeconds: coveredSeconds,
    qualifies: qualifies,
    acceptProgress: acceptProgress,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PAT_AUDIO_LISTENING = api;
})(typeof window !== 'undefined' ? window : null);
