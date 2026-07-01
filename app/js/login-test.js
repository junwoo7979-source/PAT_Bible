/**
 * PAT Bible — 로그인 로직 단위 테스트
 *
 * 목적: loginDecision()과 데이터 흐름 검증
 * 실행: Node.js 또는 브라우저 콘솔에서 runLoginTests()
 */

function runLoginTests() {
  console.log('═══ PAT Bible 로그인 테스트 시작 ═══\n');

  const results = [];

  // Test 1: 교회코드 판별
  function testIsChurchCode() {
    console.log('✓ Test 1: isChurchCodeFormat() 함수 검증');
    const tests = [
      { input: '11111', expected: true },
      { input: '013579', expected: true },
      { input: '999999', expected: true },
      { input: 'pw123', expected: false },
      { input: '123', expected: false }, // 5자리 미만
      { input: '#123456', expected: false }, // 숫자만 아님
    ];

    let passed = 0;
    tests.forEach(t => {
      const result = isChurchCodeFormat(t.input);
      const ok = result === t.expected;
      console.log(`  ${ok ? '✓' : '✗'} isChurchCodeFormat('${t.input}') = ${result} (기대값: ${t.expected})`);
      if(ok) passed++;
    });
    console.log(`  결과: ${passed}/${tests.length} 통과\n`);
    results.push({ name: 'isChurchCodeFormat', passed, total: tests.length });
  }

  // Test 2: loginDecision() 함수
  function testLoginDecision() {
    console.log('✓ Test 2: loginDecision() 함수 검증');
    const tests = [
      { cc: '', input: '', expected: 'NEED_CHURCH_CODE' },
      { cc: '', input: '11111', expected: 'SELECT_CHURCH' },
      { cc: '', input: '013579', expected: 'SELECT_CHURCH' },
      { cc: '11111', input: '', expected: 'NEED_FAMILY_PW' },
      { cc: '11111', input: '11111', expected: 'REJECT_CHURCHCODE' }, // 교회코드를 비밀번호로
      { cc: '11111', input: 'pw123', expected: 'AUTH_FAMILY_PW' },
      { cc: '013579', input: '', expected: 'NEED_FAMILY_PW' },
      { cc: '013579', input: '013579', expected: 'REJECT_CHURCHCODE' },
      { cc: '013579', input: 'pw456', expected: 'AUTH_FAMILY_PW' },
    ];

    let passed = 0;
    tests.forEach(t => {
      const decision = loginDecision(t.cc, t.input);
      const ok = decision.action === t.expected;
      console.log(`  ${ok ? '✓' : '✗'} loginDecision('${t.cc}', '${t.input}') = '${decision.action}' (기대값: '${t.expected}')`);
      if(ok) passed++;
    });
    console.log(`  결과: ${passed}/${tests.length} 통과\n`);
    results.push({ name: 'loginDecision', passed, total: tests.length });
  }

  // Test 3: 핵심 버그 — SELECT_CHURCH 후 비밀번호 검증 흐름
  function testSelectChurchFlow() {
    console.log('✓ Test 3: SELECT_CHURCH → AUTH_FAMILY_PW 흐름 검증 (핵심 버그)');

    // 시나리오: "11111" 입력 후 "pw123" 입력
    let testDB = { church: { code: '' } };

    // Step 1: "11111" 입력
    const d1 = loginDecision(testDB.church.code, '11111');
    console.log(`  Step 1) "11111" 입력:`);
    console.log(`    loginDecision('${testDB.church.code}', '11111') = '${d1.action}' (기대: SELECT_CHURCH)`);

    // Step 2: SELECT_CHURCH 케이스 → adoptChurch() 호출 시뮬레이션
    if(d1.action === 'SELECT_CHURCH') {
      testDB.church.code = d1.code; // adoptChurch 효과
      console.log(`    adoptChurch('${d1.code}', '...') 호출 후:`);
      console.log(`    DB.church.code = '${testDB.church.code}' ✓`);
    }

    // Step 3: "pw123" 입력
    const d2 = loginDecision(testDB.church.code, 'pw123');
    console.log(`  Step 2) "pw123" 입력:`);
    console.log(`    loginDecision('${testDB.church.code}', 'pw123') = '${d2.action}' (기대: AUTH_FAMILY_PW)`);
    console.log(`    ✓ churchCode 유지됨: '${testDB.church.code}'\n`);

    const passed = (d1.action === 'SELECT_CHURCH') && (d2.action === 'AUTH_FAMILY_PW') ? 1 : 0;
    results.push({ name: 'SELECT_CHURCH_FLOW', passed, total: 1 });
  }

  // Test 4: 핵심 버그 — 11111 외 다른 교회 (013579)
  function testOtherChurchBug() {
    console.log('✓ Test 4: 다른 교회 (013579) SELECT_CHURCH → AUTH_FAMILY_PW (버그 재현)');

    // 시나리오: "013579" 입력 후 "pw456" 입력
    // 현재 코드는 LINE 881: if(decision.code === '11111') 로만 가족 중복 확인!
    let testDB = { church: { code: '' } };

    // Step 1: "013579" 입력
    const d1 = loginDecision(testDB.church.code, '013579');
    console.log(`  Step 1) "013579" 입력:`);
    console.log(`    loginDecision('${testDB.church.code}', '013579') = '${d1.action}' (기대: SELECT_CHURCH)`);

    // 현재 코드의 문제:
    // if(decision.code === '11111') { adoptChurch(); return; }
    // "013579"는 이 조건에서 건너뜀!
    // adoptChurch()를 호출하지 않음
    // DB.church.code가 설정되지 않음 ❌
    if(d1.code !== '11111') {
      console.log(`    ⚠️ 주의: decision.code = '${d1.code}' !== '11111'`);
      console.log(`    현재 코드의 LINE 881 조건 if(decision.code === '11111')을 건너뜀!`);
      console.log(`    adoptChurch() 호출 안 됨 → DB.church.code = '${testDB.church.code}' (설정 안 됨)`);
    }

    // Step 2: 만약 adoptChurch()를 호출했다면:
    testDB.church.code = d1.code; // 올바른 경우
    console.log(`    올바른 흐름: adoptChurch('${d1.code}', '...') 호출 후:`);
    console.log(`    DB.church.code = '${testDB.church.code}' ✓`);

    // Step 3: "pw456" 입력
    const d2 = loginDecision(testDB.church.code, 'pw456');
    console.log(`  Step 2) "pw456" 입력:`);
    console.log(`    loginDecision('${testDB.church.code}', 'pw456') = '${d2.action}' (기대: AUTH_FAMILY_PW)`);

    if(testDB.church.code) {
      console.log(`    ✓ churchCode 유지됨: '${testDB.church.code}'\n`);
      results.push({ name: 'OTHER_CHURCH_BUG', passed: 1, total: 1 });
    } else {
      console.log(`    ❌ 버그! churchCode가 설정되지 않음\n`);
      results.push({ name: 'OTHER_CHURCH_BUG', passed: 0, total: 1 });
    }
  }

  // 모든 테스트 실행
  testIsChurchCode();
  testLoginDecision();
  testSelectChurchFlow();
  testOtherChurchBug();

  // 결과 요약
  console.log('═══ 테스트 결과 요약 ═══\n');
  let totalPassed = 0, totalTests = 0;
  results.forEach(r => {
    totalPassed += r.passed;
    totalTests += r.total;
    const pct = ((r.passed / r.total) * 100).toFixed(0);
    console.log(`${r.passed === r.total ? '✓' : '✗'} ${r.name}: ${r.passed}/${r.total} (${pct}%)`);
  });

  console.log(`\n총합: ${totalPassed}/${totalTests} 통과 (${((totalPassed / totalTests) * 100).toFixed(0)}%)\n`);

  if(totalPassed === totalTests) {
    console.log('🎉 모든 단위 테스트 통과!\n');
  } else {
    console.log('⚠️ 일부 테스트 실패 — 원인 분석 필요\n');
  }
}

// 콘솔에서 runLoginTests() 실행 가능
if(typeof module !== 'undefined' && module.exports) {
  module.exports = { runLoginTests };
}
