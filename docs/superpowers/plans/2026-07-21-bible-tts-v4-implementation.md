# Bible TTS v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개역한글 장 단위 음원을 단일 전역 플레이어로 재생하고, 안전한 이어듣기·날짜별 80% 청취 판정·기존 읽기표 완료 스키마 연동을 제공한다.

**Architecture:** UI는 `AudioController`에 명령만 전달하고 Controller가 유일한 `HTMLAudioElement`, 상태 머신, `sessionId`를 소유한다. 음원 매니페스트·재생 위치·장별 청취 근거·기존 `reading_progress`는 각각 별도 어댑터로 분리하며, 날짜별 트랙 완료는 장별 근거를 기존 `id=userId|date|planId` 행에 투영한다.

**Tech Stack:** Vanilla JavaScript IIFE modules, HTML5 Audio, Media Session API, IndexedDB `pat_bible`, localStorage, Node.js `node:test`/`assert`, HTML/CSS PWA.

---

## Scope and release gate

이 계획은 클라이언트 구현과 데이터 마이그레이션만 다룬다. 전체 개역한글 음원 생성은 라이선스, TTS 업체, 발음 사전이 확정된 뒤 별도 운영 계획으로 수행한다. 프로덕션 배포 전 실제 매니페스트가 66권 장 수, URL, 길이, 체크섬 검사를 통과해야 한다.

## File map

| Path | Responsibility |
|---|---|
| `app/js/audio-manifest.js` | 매니페스트 검증, 책·장 조회, 다음 장 결정 |
| `app/js/audio-listening.js` | 날짜별 청취 구간 병합과 80% 판정 순수 로직 |
| `app/js/audio-storage.js` | 책별 위치 localStorage 및 장별 근거 IndexedDB 저장 |
| `app/js/audio-controller.js` | 단일 오디오, 상태 머신, sessionId, 재생·오류·연속 재생 |
| `app/js/audio-media-session.js` | 잠금화면·이어폰 액션 및 메타데이터 |
| `app/js/audio-player-ui.js` | 하단 플레이어 렌더와 접근성 입력 |
| `app/js/bible-db.js` | DB v2와 `audio_chapter_progress` store |
| `app/js/reading-progress.js` | 레거시 정규화, 읽기·듣기 필드, 해제와 동기화 |
| `app/js/reading.js` | 오늘 트랙과 장 목록의 재생 진입점, 트랙 완료 투영 |
| `app/index.html` | 플레이어 마크업·스타일·스크립트 로드 순서 |
| `app/data/audio/krv-male-1.manifest.json` | 검증 완료된 개역한글 음원 목록 |
| `tests/audio-*.test.cjs` | 각 모듈의 순수·상태 머신 회귀 테스트 |
| `tests/bible-data.test.cjs` | 기존 완료 마이그레이션과 DB 계약 회귀 테스트 |
| `docs/WORKFLOW.md` | 새 오디오 데이터 흐름과 저장소 설명 |
| `docs/실행내역서.md` | 구현·검증 결과 기록 |

## Task 1: Lock the audio manifest contract

**Files:**
- Create: `app/js/audio-manifest.js`
- Create: `tests/audio-manifest.test.cjs`
- Create after licensed assets exist: `app/data/audio/krv-male-1.manifest.json`

- [ ] **Step 1: Write the failing manifest tests**

Test `validateManifest`, `chapterEntry`, and `nextChapter` using a partial-provision fixture. Every canonical chapter entry must exist exactly once. `available=true` requires URL, positive duration/bytes, and checksum; `available=false` may omit those asset fields. Automatic transition must stop at an unavailable immediate next chapter and must not skip it.

```js
const assert=require('node:assert/strict');
const M=require('../app/js/audio-manifest.js');
const fixture={schemaVersion:1,audioVersion:'krv-m1-1',translation:'krv',voice:'male-1',books:[
  {bookId:'GEN',nameKo:'창세기',chapterCount:3,chapters:[
    {chapter:1,url:'/audio/krv/male-1/GEN/001.mp3',duration:120,bytes:1000,sha256:'a',available:true},
    {chapter:2,available:false},
    {chapter:3,url:'/audio/krv/male-1/GEN/003.mp3',duration:130,bytes:1100,sha256:'c',available:true}
  ]}
]};
assert.deepEqual(M.validateManifest(fixture),{ok:true,errors:[]});
assert.equal(M.chapterEntry(fixture,'GEN',2).available,false);
assert.deepEqual(M.nextChapter(fixture,'GEN',1),{status:'unavailable',bookId:'GEN',chapter:2});
assert.deepEqual(M.nextChapter(fixture,'GEN',3),{status:'book-end'});
assert.equal(M.validateManifest({...fixture,translation:'개역개정'}).ok,false);
const duplicate=structuredClone(fixture);
duplicate.books[0].chapters[2].chapter=2;
assert.equal(M.validateManifest(duplicate).ok,false);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/audio-manifest.test.cjs`

Expected: FAIL because `app/js/audio-manifest.js` does not exist.

- [ ] **Step 3: Implement the pure manifest API**

Export the same pure functions in Node and attach them as `PAT_AUDIO_MANIFEST_UTIL` in the browser. Validation must return every error, never silently repair production data.

```js
function chapterEntry(m,bookId,chapter){
  const b=(m.books||[]).find(x=>x.bookId===bookId);
  return b ? (b.chapters||[]).find(x=>x.chapter===Number(chapter))||null : null;
}
function nextChapter(m,bookId,chapter){
  const b=(m.books||[]).find(x=>x.bookId===bookId);
  const n=Number(chapter)+1;
  if(!b||n>b.chapterCount) return {status:'book-end'};
  const e=chapterEntry(m,bookId,n);
  return e.available ? {status:'available',bookId,chapter:n} : {status:'unavailable',bookId,chapter:n};
}
function validateManifest(m){
  const errors=[];
  if(!m||m.schemaVersion!==1) errors.push('schemaVersion');
  if(!m||m.translation!=='krv') errors.push('translation');
  if(!m||m.voice!=='male-1') errors.push('voice');
  for(const b of (m&&m.books)||[]){
    if((b.chapters||[]).length!==b.chapterCount) errors.push('chapterCount:'+b.bookId);
    const seen=new Set();
    for(const c of b.chapters||[]){
      if(seen.has(c.chapter)) errors.push('duplicateChapter:'+b.bookId+':'+c.chapter);
      seen.add(c.chapter);
      if(c.available!==true&&c.available!==false) errors.push('available:'+b.bookId+':'+c.chapter);
      if(c.available===true&&(!c.url||!(c.duration>0)||!(c.bytes>0)||!c.sha256)) errors.push('chapter:'+b.bookId+':'+c.chapter);
    }
    for(let n=1;n<=b.chapterCount;n++) if(!seen.has(n)) errors.push('missingChapter:'+b.bookId+':'+n);
  }
  return {ok:errors.length===0,errors};
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node tests/audio-manifest.test.cjs`

Expected: all manifest assertions pass.

- [ ] **Step 5: Commit**

Run: `git add app/js/audio-manifest.js tests/audio-manifest.test.cjs && git commit -m "feat(audio): define KRV manifest contract"`

## Task 2: Implement unique listening intervals

**Files:**
- Create: `app/js/audio-listening.js`
- Create: `tests/audio-listening.test.cjs`

- [ ] **Step 1: Write failing interval tests**

Cover overlap, adjacency, duplicate replay, seeks, 2x playback, and the two-part completion gate.

```js
const assert=require('node:assert/strict');
const L=require('../app/js/audio-listening.js');
assert.deepEqual(L.mergeIntervals([[0,30],[20,50],[70,80]]),[[0,50],[70,80]]);
assert.equal(L.coveredSeconds([[0,50],[70,80]]),60);
assert.equal(L.qualifies({ended:true,intervals:[[0,80]],duration:100}),true);
assert.equal(L.qualifies({ended:false,intervals:[[0,100]],duration:100}),false);
assert.equal(L.qualifies({ended:true,intervals:[[95,100]],duration:100}),false);
assert.deepEqual(L.acceptProgress({from:10,to:30,seeking:false,playing:true}),[10,30]);
assert.equal(L.acceptProgress({from:10,to:90,seeking:true,playing:true}),null);
assert.equal(L.acceptProgress({from:20,to:21,seeking:false,playing:false}),null);
```

- [ ] **Step 2: Verify RED**

Run: `node tests/audio-listening.test.cjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement interval normalization**

Use content-time positions, not wall-clock time. Clamp invalid values and merge touching ranges; never count a seek jump.

```js
function mergeIntervals(input){
  const xs=(input||[]).filter(x=>Array.isArray(x)&&x.length===2&&x[1]>x[0]).map(x=>[Number(x[0]),Number(x[1])]).sort((a,b)=>a[0]-b[0]);
  const out=[];
  for(const x of xs){
    const last=out[out.length-1];
    if(last&&x[0]<=last[1]+0.25) last[1]=Math.max(last[1],x[1]); else out.push(x);
  }
  return out;
}
const coveredSeconds=xs=>mergeIntervals(xs).reduce((n,x)=>n+x[1]-x[0],0);
const qualifies=x=>!!x.ended&&x.duration>0&&coveredSeconds(x.intervals)/x.duration>=0.8;
function acceptProgress(x){
  if(!x.playing||x.seeking||!Number.isFinite(x.from)||!Number.isFinite(x.to)||x.to<=x.from||x.to-x.from>5) return null;
  return [x.from,x.to];
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `node tests/audio-listening.test.cjs`

Expected: all interval assertions pass.

Run: `git add app/js/audio-listening.js tests/audio-listening.test.cjs && git commit -m "feat(audio): track unique daily listening coverage"`

## Task 3: Upgrade IndexedDB and preserve legacy reading progress

**Files:**
- Modify: `app/js/bible-db.js`
- Modify: `app/js/reading-progress.js`
- Modify: `tests/bible-data.test.cjs`
- Create: `tests/audio-progress.test.cjs`

The existing row fields are exactly `id`, `userId`, `date`, `planId`, `status`, `completedAt`, and `synced`; implementation must preserve these names and the existing `id` value while adding v2 fields.

- [ ] **Step 1: Write failing normalization and transition tests**

```js
const assert=require('node:assert/strict');
const R=require('../app/js/reading-progress.js');
const legacy={id:'u|2026-01-01|01-01:ot',userId:'u',date:'2026-01-01',planId:'01-01:ot',status:'done',completedAt:'2026-01-01T01:00:00Z',synced:1};
const migrated=R.normalizeProgress(legacy);
assert.equal(migrated.readDone,true);
assert.equal(migrated.listenDone,false);
assert.equal(migrated.readAt,legacy.completedAt);
assert.equal(migrated.progressSchemaVersion,2);
const listened=R.applyCompletion(migrated,'listen','2026-01-01T02:00:00Z');
assert.equal(listened.status,'done');
assert.equal(listened.completedAt,legacy.completedAt);
assert.equal(listened.listenDone,true);
const cleared=R.clearCompletion(listened);
assert.deepEqual([cleared.readDone,cleared.listenDone,cleared.status,cleared.completedAt],[false,false,'pending',null]);
```

- [ ] **Step 2: Verify RED**

Run: `node tests/audio-progress.test.cjs`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Add the DB v2 store**

Change `DB_VER` from `1` to `2`. In `onupgradeneeded`, add `audio_chapter_progress` with keyPath `id`, index `byUserTranslation` on `[userId,translation]`, and index `byUpdatedAt` on `updatedAt`. Do not recreate or clear `reading_progress`.

```js
if(!db.objectStoreNames.contains('audio_chapter_progress')){
  const s=db.createObjectStore('audio_chapter_progress',{keyPath:'id'});
  s.createIndex('byUserTranslation',['userId','translation'],{unique:false});
  s.createIndex('byUpdatedAt','updatedAt',{unique:false});
}
```

- [ ] **Step 4: Add exact v2 record normalization**

Keep `progressId()` unchanged. `normalizeProgress` must preserve `id,userId,date,planId,completedAt,synced`; legacy `status:'done'` becomes reading completion only. `applyCompletion` sets either `readDone/readAt` or `listenDone/listenAt`, preserves first `completedAt`, derives `status`, and resets `synced:0`. `clearCompletion` clears both completion modes intentionally.

- [ ] **Step 5: Replace browser methods without breaking callers**

Keep `markComplete(planId,opts)` as a compatibility alias for reading completion. Add `markReadComplete`, `markListenComplete`, `clearComplete`, and make `isComplete` normalize the row before evaluating `readDone||listenDone`. Normalize pending rows before server push; server merge remains `id`-based.

- [ ] **Step 6: Verify focused and existing tests**

Run: `node tests/audio-progress.test.cjs`

Expected: all v2 migration assertions pass.

Run: `node tests/bible-data.test.cjs`

Expected: all existing Bible data assertions pass, including stable `progressId` and untouched reading records during Bible reseeding.

- [ ] **Step 7: Commit**

Run: `git add app/js/bible-db.js app/js/reading-progress.js tests/audio-progress.test.cjs tests/bible-data.test.cjs && git commit -m "feat(reading): migrate progress to read and listen fields"`

## Task 4: Add playback position and chapter evidence repositories

**Files:**
- Create: `app/js/audio-storage.js`
- Create: `tests/audio-storage.test.cjs`

- [ ] **Step 1: Write failing repository tests with fake storage/DB**

Assert the exact position key includes user, `krv`, voice, book; corrupt values are rejected; chapter IDs omit voice; daily evidence uses `YYYY-MM-DD`.

```js
const assert=require('node:assert/strict');
const S=require('../app/js/audio-storage.js');
assert.equal(S.positionKey('엄마','male-1','PSA'),'pat_audio_pos|엄마|krv|male-1|PSA');
assert.equal(S.chapterId('엄마','PSA',23),'엄마|krv|PSA|23');
const row=S.addDailyInterval(null,{userId:'엄마',bookId:'PSA',chapter:23,date:'2026-07-21',duration:100,range:[0,30],audioVersion:'v1',now:'2026-07-21T01:00:00Z'});
assert.deepEqual(row.dailyEvidence['2026-07-21'].intervals,[[0,30]]);
assert.equal(row.translation,'krv');
```

- [ ] **Step 2: Verify RED**

Run: `node tests/audio-storage.test.cjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement pure row builders and browser repositories**

Expose pure `positionKey`, `chapterId`, `normalizePosition`, `addDailyInterval`, and `markDailyEnded`. Browser methods must call `PAT_BIBLE_DB.get/put('audio_chapter_progress',...)` and localStorage through injected wrappers. Position values contain `chapter,sec,rate,audioVersion,updatedAt`; clamp them only after metadata supplies duration.

- [ ] **Step 4: Verify and commit**

Run: `node tests/audio-storage.test.cjs`

Expected: all storage assertions pass.

Run: `git add app/js/audio-storage.js tests/audio-storage.test.cjs && git commit -m "feat(audio): persist positions and daily evidence"`

## Task 5: Build the AudioController state machine

**Files:**
- Create: `app/js/audio-controller.js`
- Create: `tests/audio-controller.test.cjs`

- [ ] **Step 1: Write a fake-audio state machine test**

The fake must expose `play`, `pause`, `load`, event registration, `currentTime`, `duration`, `playbackRate`, and a manual `emit`. Assert `idle→loading→playing→paused`, one audio construction, old session events ignored, and book-end `ended→idle`.

```js
const assert=require('node:assert/strict');
const C=require('../app/js/audio-controller.js');
const fake=createFakeAudio();
const ctl=C.createAudioController({audio:fake,manifest,manifestUtil,positionRepo,evidenceRepo,clock});
const first=ctl.playChapter({userId:'u',bookId:'GEN',chapter:1,startSec:0});
assert.equal(ctl.snapshot().state,'loading');
fake.emit('playing'); await first;
assert.equal(ctl.snapshot().state,'playing');
ctl.pause(); assert.equal(ctl.snapshot().state,'paused');
const old=ctl.snapshot().sessionId;
ctl.playChapter({userId:'u',bookId:'GEN',chapter:2,startSec:0});
assert.ok(ctl.snapshot().sessionId>old);
fake.emitForSession('ended',old);
assert.equal(ctl.snapshot().chapter,2);
```

- [ ] **Step 2: Verify RED**

Run: `node tests/audio-controller.test.cjs`

Expected: FAIL because the controller is missing.

- [ ] **Step 3: Implement construction and transitions**

`createAudioController(deps)` accepts one audio instance and returns `subscribe`, `snapshot`, `playBook`, `playChapter`, `toggle`, `pause`, `seek`, `rewind10`, `cycleRate`, `retry`, and `destroyForTests`. State is only one of `idle/loading/playing/paused/ended/error`. Every `src` replacement increments `sessionId`, pauses first, saves position, cancels retry, then loads the new URL.

- [ ] **Step 4: Guard every asynchronous boundary**

Capture the session in load/play/retry/ended handlers and return without side effects when it differs from current `sessionId`. Treat `NotAllowedError` as `paused`, retry network load once, and make `ended` qualify evidence before selecting the next chapter.

- [ ] **Step 5: Add progress sampling and lifecycle persistence**

On `timeupdate`, pass only short forward deltas while actually playing to `acceptProgress`; never add seeking gaps. Persist every five seconds and on pause, target switch, `pagehide`, `visibilitychange`, error, and buffer exhaustion. Register all audio and window listeners once.

- [ ] **Step 6: Add next-chapter behavior**

After current-session `ended`, record the date evidence. If `nextChapter().status==='available'`, create a fresh session, load it, and retain the current playback rate. If the status is `unavailable`, do not skip forward: show the next-audio-pending notice and settle at `idle`. If it is `book-end`, show the book-finished event without moving to the next book, then settle at `idle`. Preload with a non-playing request only; never create a second audio element. If iOS rejects automatic `play()`, retain the next target and position in `paused` and show “탭하여 계속 듣기”.

- [ ] **Step 7: Verify all controller cases and commit**

Run: `node tests/audio-controller.test.cjs`

Expected: tests pass for transitions, stale events, retry cancellation, autoplay rejection guidance, interval sampling, next-chapter rate retention, unavailable-next stop without skipping, and book end without next-book movement.

Run: `git add app/js/audio-controller.js tests/audio-controller.test.cjs && git commit -m "feat(audio): add session-safe playback controller"`

## Task 6: Integrate daily plan listen completion

**Files:**
- Modify: `app/js/reading.js`
- Modify: `app/js/reading-progress.js`
- Create: `tests/audio-reading-integration.test.cjs`

- [ ] **Step 1: Write failing plan mapping tests**

Use existing `parseRef` and `chaptersInSpec`. Assert `행 16:16~40` maps to `ACT:16`, `창 1~2` maps to `GEN:1` and `GEN:2`, and a cross-book range maps every required chapter. Assert a multi-chapter track is not listen-complete until all required chapters have current-date qualified evidence.

- [ ] **Step 2: Verify RED**

Run: `node tests/audio-reading-integration.test.cjs`

Expected: FAIL because `requiredAudioChapters` and `projectListenCompletion` are missing.

- [ ] **Step 3: Add pure mapping and projection functions**

`requiredAudioChapters(track,raw)` returns de-duplicated `{bookId,chapter}` pairs. `projectListenCompletion({userId,date,planId,required,evidence})` calls `markListenComplete` only when every required chapter has `dailyEvidence[date].done===true`. Previous-day lifetime completion must not count.

- [ ] **Step 4: Connect reading entry points**

Add an explicit listen action beside each opened reading track and chapter control. Track entry supplies its `planId`; book entry resumes saved position; explicit chapter entry always supplies `startSec:0`. Display “음성은 해당 장 전체를 재생합니다” for verse-range plans.

- [ ] **Step 5: Verify and commit**

Run: `node tests/audio-reading-integration.test.cjs`

Expected: all single-, multi-, cross-book, verse-range, and previous-day cases pass.

Run: `node tests/bible-data.test.cjs`

Expected: all existing reading-plan parsing tests still pass.

Run: `git add app/js/reading.js app/js/reading-progress.js tests/audio-reading-integration.test.cjs && git commit -m "feat(reading): project listening into daily progress"`

## Task 7: Add the accessible player UI and Media Session adapter

**Files:**
- Create: `app/js/audio-player-ui.js`
- Create: `app/js/audio-media-session.js`
- Modify: `app/index.html`
- Create: `tests/audio-ui.test.cjs`

- [ ] **Step 1: Write failing static UI and adapter tests**

Assert one player root, one play/pause button, labels for 10초 뒤로 and speed, a range input with accessible name, minimum 48px controls, and script order: manifest/listening/storage/controller/media/UI before `reading.js`. Mock `navigator.mediaSession` and assert play, pause, seekbackward, and seekto handlers delegate to Controller.

- [ ] **Step 2: Verify RED**

Run: `node tests/audio-ui.test.cjs`

Expected: FAIL because markup and modules do not exist.

- [ ] **Step 3: Add one global player root**

Place it outside individual screens and above the tab bar so navigation never destroys it. Include title, time, status live region, seek range, rewind, toggle, speed, and retry controls. Use existing CSS variables; touch targets must be at least 48×48px and the page bottom padding must account for player plus tab bar.

- [ ] **Step 4: Bind UI to snapshots only**

`audio-player-ui.js` subscribes once, renders state/title/time/rate/error, and forwards DOM events to Controller. It never reads or mutates the underlying audio element. During `loading`, prevent duplicate play actions without blocking target switching.

- [ ] **Step 5: Add Media Session capability checks**

Set metadata to `바이블버스 — {책} {장}`, album `개역한글 · male-1`. Register only supported actions. Route play/pause/seekbackward/seekto to Controller and update position state only with finite duration.

- [ ] **Step 6: Add script tags in dependency order**

Load `audio-manifest.js`, `audio-listening.js`, `audio-storage.js`, `audio-controller.js`, `audio-media-session.js`, and `audio-player-ui.js` after `bible-db.js`/`reading-progress.js` prerequisites and before `reading.js`. Use the current asset version convention; the final release task bumps all changed asset query versions together.

- [ ] **Step 7: Verify and commit**

Run: `node tests/audio-ui.test.cjs`

Expected: all DOM contract, accessibility, singleton, script-order, and Media Session tests pass.

Run: `git add app/index.html app/js/audio-player-ui.js app/js/audio-media-session.js tests/audio-ui.test.cjs && git commit -m "feat(audio): add accessible player and media controls"`

## Task 8: Initialize safely and handle missing production audio

**Files:**
- Modify: `app/js/app-core.js`
- Modify: `app/js/reading.js`
- Modify: `app/index.html`
- Create: `tests/audio-init.test.cjs`

- [ ] **Step 1: Write failing initialization tests**

Assert exactly one `Audio()` call across repeated initialization, valid manifest enables controls, missing/invalid manifest disables listening without breaking reading text, user change stores old position and loads the new user scope, and a failed `play()` never marks completion.

- [ ] **Step 2: Verify RED**

Run: `node tests/audio-init.test.cjs`

Expected: FAIL until app initialization is wired.

- [ ] **Step 3: Add idempotent initialization**

Create the real audio once after Bible DB initialization, fetch `data/audio/krv-male-1.manifest.json`, validate it, construct repositories/Controller/adapters, then expose only `window.PAT_AUDIO`. Repeated app initialization returns the same facade.

- [ ] **Step 4: Add graceful unavailable mode**

If the manifest is absent, invalid, or licensing gate has not supplied assets, keep reading fully usable and show “듣기 음원을 준비 중입니다.” Do not substitute Web Speech API or a different translation.

- [ ] **Step 5: Verify and commit**

Run: `node tests/audio-init.test.cjs`

Expected: all singleton, invalid-manifest, user-switch, and play-rejection cases pass.

Run: `git add app/js/app-core.js app/js/reading.js app/index.html tests/audio-init.test.cjs && git commit -m "feat(audio): initialize playback with safe fallback"`

## Task 9: Documentation, regression suite, and release evidence

**Files:**
- Modify: `docs/WORKFLOW.md`
- Modify: `docs/실행내역서.md`
- Modify: `app/index.html`
- Modify only if currently used: `app/sw.js`

- [ ] **Step 1: Document the final data flow**

Add the state machine module boundaries, DB v2 store, exact `reading_progress` migration, local position key, daily interval rule, background limitation, and manifest release gate to `docs/WORKFLOW.md`. Record implementation commits and verification devices in `docs/실행내역서.md`.

- [ ] **Step 2: Run every focused test**

Run:

```powershell
node tests/audio-manifest.test.cjs
node tests/audio-listening.test.cjs
node tests/audio-progress.test.cjs
node tests/audio-storage.test.cjs
node tests/audio-controller.test.cjs
node tests/audio-reading-integration.test.cjs
node tests/audio-ui.test.cjs
node tests/audio-init.test.cjs
node tests/bible-data.test.cjs
```

Expected: every command exits 0 with no failed assertions.

- [ ] **Step 3: Run the complete existing test set**

Run: `Get-ChildItem tests -Filter '*.test.cjs' | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { throw "FAILED: $($_.Name)" } }`

Expected: all test files exit 0.

- [ ] **Step 4: Perform Android Chrome/PWA scenarios**

Execute scenarios 1–32 from `docs/superpowers/specs/2026-07-21-bible-tts-v4-design.md`. Record device/OS/browser, network profile, observed start latency, and pass/fail. Android Media Session scenarios 20–22 are required, not excluded. Capture evidence for rapid selection, seek abuse, daily multi-chapter completion, app reload, network loss, user switch, next-chapter rate retention, book-end stop, rotation, and one-audio invariant.

- [ ] **Step 5: Perform iPhone Safari/PWA scenarios**

Execute scenarios 1–32, marking Media Session operations unsupported by that OS/browser as capability-limited rather than application failures. Verify interruption recovery, automatic-transition `play()` rejection guidance, rotation retention, and that the UI never promises uninterrupted background playback.

- [ ] **Step 6: Apply the start-latency acceptance rule**

On a normal network with the manifest already loaded and the selected audio absent from cache, measure tap-to-`playing`; the target is at most 1 second. On app cold start or a slow network, do not fail solely for exceeding 1 second; require a visible loading state within 1 second and record the actual latency separately.

- [ ] **Step 7: Validate the production manifest and hosting**

Verify 66 books, canonical book IDs, every chapter number exactly once, no duplicate or missing chapter entries, and valid `available` booleans. For `available=true`, verify positive duration/size, checksum, HTTPS, `audio/mpeg`, byte-range seek, cache versioning, and CORS from the deployed origin. `available=false` may omit asset metadata but must remain explicitly listed. Do not deploy listening controls as enabled until this passes and the 개역한글 audio license is documented.

- [ ] **Step 8: Bump static asset versions**

Update query versions for all changed/new scripts in `app/index.html`. The project currently unregisters the service worker; only bump `app/sw.js` if deployment inspection confirms it has been re-enabled. Do not change unrelated version pins.

- [ ] **Step 9: Final diff and commit**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only planned documentation/version files remain.

Run: `git add app/index.html app/sw.js docs/WORKFLOW.md docs/실행내역서.md && git commit -m "docs: record Bible TTS rollout and verification"` (omit `app/sw.js` when unchanged).

## Completion criteria

- All 32 real-device scenarios have recorded Android Chrome/PWA and iPhone Safari/PWA outcomes.
- Legacy `reading_progress` rows retain the exact fields `id`, `userId`, `date`, `planId`, `status`, `completedAt`, `synced`, their existing IDs, and their completion display.
- Today’s `listenDone` requires current-date qualified evidence for every chapter in the track.
- Rapid target changes, old retries, and old `ended` events cannot affect the latest session.
- Exactly one real audio element and one listener set exist.
- Missing audio assets never break text reading.
- Production audio remains disabled until licensing and manifest checks pass.
