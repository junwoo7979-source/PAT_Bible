// ====== PAT Bible — admin-pages.test.cjs ======
// 관리자 페이지 구성 회귀 테스트 (2026-07-18)
//  - 가족방 관리 + 준비중 5종 라우트는 반드시 admin 가드가 걸려야 한다 (SPEC §4.2)
//  - 화면 섹션·렌더 함수·서버 API가 함께 존재해야 한다

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('app/index.html', 'utf8');
const routerSrc = fs.readFileSync('app/js/router.js', 'utf8');
const panelSrc = fs.readFileSync('app/js/admin-panel.js', 'utf8');
const appCore = fs.readFileSync('app/js/app-core.js', 'utf8');
const adminApi = fs.readFileSync('functions/admin-api.js', 'utf8');
const fnIndex = fs.readFileSync('functions/index.js', 'utf8');

// 1) 관리자 라우트 전부 admin 가드 필수
['/admin/families', '/admin/missions', '/admin/statistics', '/admin/churches', '/admin/districts', '/admin/system']
  .forEach((path) => {
    const re = new RegExp(`'${path.replace(/\//g, '\\/')}':\\s*\\{[^}]*admin:\\s*true`);
    assert.ok(re.test(routerSrc), `${path} 라우트에 admin 가드 필요`);
  });

// 2) 화면 섹션 존재
['s-admin-families', 's-admin-prep'].forEach((id) => {
  assert.ok(html.includes(`id="${id}"`), `${id} 섹션 필요`);
});

// 3) 준비중 화면 제목 요소 + 렌더 훅
assert.ok(html.includes('id="adminPrepTitle"'), '준비중 화면 제목 요소 필요');
assert.ok(/prepTitle/.test(routerSrc), '라우터가 준비중 제목을 전달해야 함');

// 4) 가족방 관리 렌더 함수 + 서버 API + 노출
assert.ok(panelSrc.includes('renderAdminFamilies'), 'admin-panel에 renderAdminFamilies 필요');
assert.ok(adminApi.includes('listFamilies'), 'admin-api에 listFamilies 필요');
assert.ok(/requireAdmin\(req,\s*res\)/.test(adminApi), 'listFamilies는 requireAdmin 검증 사용');
assert.ok(fnIndex.includes('exports.listFamilies'), 'functions/index.js에서 listFamilies 노출 필요');

// 5) listFamilies 응답에 비밀번호 해시가 포함되면 안 됨 (필드 화이트리스트 방식 확인)
const lfBlock = adminApi.slice(adminApi.indexOf('listFamilies'));
assert.ok(!lfBlock.includes('familyPasswordHash'), 'listFamilies 응답에 비밀번호 해시 금지');

// 6) 새 관리자 화면은 사용자 탭바 숨김 목록에 있어야 함
['s-admin-families', 's-admin-prep'].forEach((id) => {
  assert.ok(appCore.includes(`'${id}'`), `noTab 목록에 ${id} 필요`);
});

console.log('admin pages: PASS');
