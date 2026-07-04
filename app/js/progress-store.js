// ====== PAT Bible — progress-store.js ======
// 암송 진행 상태(현재 단계 + 미션 완료 데이터)를 localStorage에 저장/복원한다.
// 모바일에서 새로고침하거나 앱을 다시 실행해도 진행 중이던 단계와
// 이미 완료한 미션 기록이 그대로 유지되도록 보존하는 책임만 가진다.

// localStorage 저장 키
const MEMORIZE_STATE_KEY = 'pat_memorize_state';

// 암송 흐름에 해당하는 화면 목록 (이 화면에서만 상태를 저장한다)
const MEMORIZE_SCREENS = ['s-voice', 's-typing', 's-complete'];

// 현재 진행 상태를 하나의 객체로 모아서 localStorage에 즉시 저장한다.
// screenOverride: 저장 시점에 화면 전환(go)이 아직 끝나지 않았을 수 있으므로
//                 호출하는 쪽에서 명시적으로 현재 화면 ID를 넘겨줄 수 있다.
function saveMemorizeState(screenOverride) {
  try {
    const activeScreen = screenOverride
      || (document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : '');

    // 암송 관련 화면이 아니면 저장하지 않는다.
    if (MEMORIZE_SCREENS.indexOf(activeScreen) === -1) {
      return;
    }

    const todayString = (typeof getTodayDateString === 'function')
      ? getTodayDateString()
      : new Date().toISOString().slice(0, 10);

    const state = {
      date: todayString,
      verseRef: (typeof DB !== 'undefined' && DB.verse && DB.verse.ref) ? DB.verse.ref : '',
      screen: activeScreen,
      voiceStage: voiceStage,
      typeStage: typeStage,
      voiceScore1: voiceScore1,
      voiceScore2: voiceScore2,
      typeScore1: typeScore1,
      typeScore2: typeScore2,
      voiceInput1: voiceInput1,
      voiceInput2: voiceInput2,
      typeInput1: typeInput1,
      typeInput2: typeInput2,
      memorizeCompleted: memorizeCompleted,
      reviewMode: reviewMode
    };

    localStorage.setItem(MEMORIZE_STATE_KEY, JSON.stringify(state));
    console.log('[PAT-PROGRESS] 진행 상태 저장:', state.screen, '음성' + voiceStage + '차/타이핑' + typeStage + '차');
  } catch (e) {
    console.error('[PAT-PROGRESS] 진행 상태 저장 실패:', e.message);
  }
}

// localStorage에 저장된 진행 상태를 읽어 전역 변수에 복원한다.
// 복원에 성공하면 복원할 화면 ID(s-voice / s-typing / s-complete)를 반환하고,
// 복원할 상태가 없거나 무효(날짜·구절 불일치)면 null을 반환한다.
function restoreMemorizeState() {
  try {
    const raw = localStorage.getItem(MEMORIZE_STATE_KEY);
    if (!raw) {
      return null;
    }

    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object') {
      localStorage.removeItem(MEMORIZE_STATE_KEY);
      return null;
    }

    // 날짜 검증: 저장된 날짜가 오늘이 아니면 무효 (날짜 기반 초기화 정책과 동일)
    const todayString = (typeof getTodayDateString === 'function')
      ? getTodayDateString()
      : new Date().toISOString().slice(0, 10);
    if (state.date !== todayString) {
      localStorage.removeItem(MEMORIZE_STATE_KEY);
      return null;
    }

    // 구절 검증: 현재 구절과 저장된 구절이 다르면 (주간 구절 변경 등) 무효
    const currentRef = (typeof DB !== 'undefined' && DB.verse && DB.verse.ref) ? DB.verse.ref : '';
    if (currentRef && state.verseRef && currentRef !== state.verseRef) {
      return null;
    }

    // 화면 검증: 암송 화면이 아니면 복원하지 않는다.
    if (MEMORIZE_SCREENS.indexOf(state.screen) === -1) {
      return null;
    }

    // ★ '완료' 화면은 오늘 실제 완료 기록(_src 없는 진짜 기록)이 있을 때만 복원한다.
    //   서버 동기화 플레이스홀더(_src:server-sync)나 다른 날/다른 기기의 완료 잔상 때문에
    //   오늘 안 했는데도 '암송 성공' 화면이 남아 가족방/개인 완료로 오인되는 것을 차단.
    if (state.screen === 's-complete') {
      try {
        const recs = (typeof loadRec === 'function') ? loadRec() : [];
        const dstr = (ts) => (typeof _localDateStr === 'function')
          ? _localDateStr(ts) : String(ts || '').slice(0, 10);
        const hasRealToday = recs.some(r => {
          const ts = r.completedAt || r.date;
          return r._src !== 'server-sync' && ts && dstr(ts) === todayString;
        });
        if (!hasRealToday) {
          localStorage.removeItem(MEMORIZE_STATE_KEY);
          console.log('[PAT-PROGRESS] 완료 화면 잔상 폐기 — 오늘 실제 완료 기록 없음');
          return null;
        }
      } catch (e) {}
    }

    // 전역 변수 복원
    voiceStage = (typeof state.voiceStage === 'number') ? state.voiceStage : 1;
    typeStage = (typeof state.typeStage === 'number') ? state.typeStage : 1;
    voiceScore1 = (typeof state.voiceScore1 === 'number') ? state.voiceScore1 : 0;
    voiceScore2 = (typeof state.voiceScore2 === 'number') ? state.voiceScore2 : 0;
    typeScore1 = (typeof state.typeScore1 === 'number') ? state.typeScore1 : 0;
    typeScore2 = (typeof state.typeScore2 === 'number') ? state.typeScore2 : 0;
    voiceInput1 = (typeof state.voiceInput1 === 'string') ? state.voiceInput1 : '';
    voiceInput2 = (typeof state.voiceInput2 === 'string') ? state.voiceInput2 : '';
    typeInput1 = (typeof state.typeInput1 === 'string') ? state.typeInput1 : '';
    typeInput2 = (typeof state.typeInput2 === 'string') ? state.typeInput2 : '';
    memorizeCompleted = !!state.memorizeCompleted;
    reviewMode = !!state.reviewMode;

    console.log('[PAT-PROGRESS] 진행 상태 복원:', state.screen, '음성' + voiceStage + '차/타이핑' + typeStage + '차');
    return state.screen;
  } catch (e) {
    console.error('[PAT-PROGRESS] 진행 상태 복원 실패:', e.message);
    return null;
  }
}

// 저장된 진행 상태를 삭제한다. (새 세션 시작, 날짜 변경 초기화 시 호출)
function clearMemorizeState() {
  try {
    localStorage.removeItem(MEMORIZE_STATE_KEY);
    console.log('[PAT-PROGRESS] 진행 상태 삭제');
  } catch (e) {
    console.error('[PAT-PROGRESS] 진행 상태 삭제 실패:', e.message);
  }
}

// 앱 로드 시 호출: 저장된 상태를 복원하고, 복원된 화면을 실제로 그려서 보여준다.
// 복원할 상태가 없으면 아무 것도 하지 않는다.
function applyRestoredMemorizeScreen() {
  const screen = restoreMemorizeState();
  if (!screen) {
    return false;
  }

  if (screen === 's-voice') {
    if (typeof renderVoice === 'function') {
      renderVoice();
    }
    if (typeof go === 'function') {
      go('s-voice', true, false);
    }
    console.log('[PAT-PROGRESS] 음성 단계 화면 복원 완료');
    return true;
  }

  if (screen === 's-typing') {
    if (typeof renderTyping === 'function') {
      renderTyping(false);
    }
    if (typeof go === 'function') {
      go('s-typing', true, false);
    }
    console.log('[PAT-PROGRESS] 타이핑 단계 화면 복원 완료');
    return true;
  }

  if (screen === 's-complete') {
    const refEl = document.getElementById('completeRef');
    const v1El = document.getElementById('cVoice1');
    const v2El = document.getElementById('cVoice2');
    const verseRef = (typeof DB !== 'undefined' && DB.verse && DB.verse.ref) ? DB.verse.ref : '';
    if (refEl) {
      refEl.textContent = verseRef + ' 암송 성공';
    }
    if (v1El) {
      v1El.textContent = (voiceScore1 || 90) + '%';
    }
    if (v2El) {
      v2El.textContent = (voiceScore2 || 92) + '%';
    }
    if (typeof renderSteps === 'function') {
      renderSteps(5, false);
    }
    if (typeof go === 'function') {
      go('s-complete', true, false);
    }
    console.log('[PAT-PROGRESS] 완료 화면 복원 완료');
    return true;
  }

  return false;
}
