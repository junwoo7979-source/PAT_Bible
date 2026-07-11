# 🎯 로그인 시스템 마이그레이션 - 실행 단계 확인

**작성일**: 2026-07-11  
**상태**: 1단계 분석 완료 → 2단계 구현 확인 필요

---

## 📊 1단계 분석 결과 요약

### ✅ 완료 항목
1. **프로젝트 구조 파악**
   - app/js: 20개 모듈 (app-core.js 77KB, family.js 70KB 등)
   - functions: 30개 API 함수 (펑터 다양)
   - 기존 localStorage: 15개 pat_* 필드 (모두 보존)

2. **현재 로그인 흐름 분석**
   ```
   churchCode 입력 → getFamiliesList() → password 입력 → findFamily() → enterMemberHome()
   ```

3. **기존 데이터 구조 파악**
   - Firestore: churches/{churchCode}/families/{familyId}
   - localStorage: pat_family_id, pat_member_name, pat_records 등 (절대 손실 금지)
   - passwordHash: churchCode 기준 해시 (pepper 일관성 확보됨, v197)

4. **마이그레이션 전략 수립**
   - Phase A: 신규 필드 추가 (familyCode, useNewAuthMethod)
   - Phase B: 신규 함수 추가 (createFamily, findFamilyByCode)
   - Phase C: UI 변경 (로그인 화면 제거, 홈 화면 추가)
   - 기존 churchCode 필드는 읽기 호환용으로 유지

### ⚠️ 핵심 의사결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| **기존 churchCode 필드** | 읽기만, 쓰기 금지 | 호환성 유지, 나중에 배치 마이그레이션 가능 |
| **비밀번호 해시 기준** | churchCode → **familyId 기준으로 변경** | 신규 데이터만, 기존은 유지 |
| **familyCode 저장** | Firestore families 문서에 저장 | findFamilyByCode() 쿼리 필요, 사용자 편의 |
| **기존 사용자 로그인** | pat_family_id로 바로 진입 | 교회코드 입력 제거, UX 개선 |
| **신규 사용자 UX** | "가족방 만들기" + "코드 입장" 선택 | 자유 입장, 진입 장벽 제거 |

---

## 🔧 2단계 구현 계획

### 구현 순서 (권장)

#### **2-1단계: Functions 백엔드 (1~2시간)**
```javascript
// 신규 함수 추가

exports.createFamily = async (req, res) => {
  // 입력: { familyName, password, deviceId, memberName }
  // 1. familyCode 자동 생성 (nanoid 12자, 충돌 검사)
  // 2. passwordHash = hashFamilyPassword(familyId, password, pepper)
  // 3. Firestore families/{auto-uuid} 문서 생성
  // 4. 반환: { familyId, familyCode, familyName }
}

exports.findFamilyByCode = async (req, res) => {
  // 입력: { familyCode }
  // 1. Firestore families.familyCode로 검색
  // 2. 반환: { familyId, familyName } 또는 null
}

// 기존 함수는 수정 없음 (호환성 유지)
```

#### **2-2단계: app-core.js 프론트엔드 (2~3시간)**
```javascript
// 신규 함수 추가

async function createFamily() {
  // UI 입력: familyName, password
  // 1. Functions.createFamily() 호출
  // 2. localStorage.setItem('pat_family_id', familyId)
  // 3. enterMemberHome() 호출
}

async function enterFamilyByCode() {
  // UI 입력: familyCode, password
  // 1. Functions.findFamilyByCode() 호출
  // 2. verifyFamilyPassword(familyId, password)
  // 3. localStorage.setItem('pat_family_id', familyId)
  // 4. enterMemberHome() 호출
}

// 앱 시작 시 로직 수정
async function initApp() {
  const familyId = localStorage.getItem('pat_family_id');
  if (familyId) {
    // 기존 사용자: 바로 가족방 진입
    enterMemberHome();
  } else {
    // 신규 사용자: 홈 화면 (가족방 없음)
    showHomePage();
  }
}
```

#### **2-3단계: UI 변경 (index.html, family.js) (1~2시간)**
```html
<!-- 기존: 로그인 화면 (churchCode 입력) -->
<!-- 제거할 요소 -->

<!-- 신규: 홈 화면 (가족방 없음 상태) -->
<div id="s-home-empty">
  <button onclick="showCreateFamilyDialog()">가족방 만들기</button>
  <button onclick="showEnterFamilyDialog()">가족코드로 들어가기</button>
</div>

<!-- 신규: 가족방 생성 다이얼로그 -->
<!-- 신규: 가족코드 입장 다이얼로그 -->
```

#### **2-4단계: Firestore 스키마 마이그레이션 (배치 스크립트)**
```javascript
// 기존 families 문서에 신규 필드 추가 (한 번만 실행)
// 함수: migrateFamilyDocuments()
//   - 모든 families 문서 순회
//   - familyCode가 없으면 nanoid(12)로 생성
//   - useNewAuthMethod = false (기존 churchCode 해시 사용)
//   - Firestore에 저장
```

#### **2-5단계: 테스트 (Playwright E2E)**
```javascript
// 9가지 필수 시나리오
✓ 앱 첫 진입 (교회코드 없이)
✓ 기존 사용자 pat_family_id 유지
✓ 가족방 생성 (familyCode 자동 생성)
✓ familyCode 중복 불가
✓ 가족코드 입장
✓ 비밀번호 familyId 분리
✓ 가족코드만으로 활동 불가
✓ 오류 처리 (존재하지 않는 코드, 잘못된 비번)
✓ 기존 데이터 무결성
```

---

## 📋 작업 예상 시간

| 단계 | 작업 | 예상 시간 | 누적 |
|------|------|---------|------|
| **2-1** | Functions (createFamily, findFamilyByCode) | 1-2h | 1-2h |
| **2-2** | app-core.js (신규 함수, 초기화 로직) | 2-3h | 3-5h |
| **2-3** | UI 변경 (index.html, family.js) | 1-2h | 4-7h |
| **2-4** | Firestore 마이그레이션 (배치) | 0.5h | 4.5-7.5h |
| **2-5** | E2E 테스트 | 1-2h | 5.5-9.5h |
| **총** | | | **~1-2일** |

---

## ❓ 실행 확인 사항

### Q1: 지금 바로 2단계 구현을 시작할까요?
**현재 상황**:
- 분석 완료 ✅
- 마이그레이션 전략 수립 ✅
- 위험 요소 식별 ✅

**선택지**:
- [ ] **A) 바로 시작**: 지금 Functions → app-core → UI 순서로 구현 (1-2일 소요)
- [ ] **B) 단계별 진행**: Functions만 먼저 배포, 테스트 후 UI 변경 (안전, 3-4일 소요)
- [ ] **C) 더 검토**: 추가 분석 필요 (시간 소요, 리스크 낮음)

### Q2: 기존 교회별 설정(pat_parish_config)은 어떻게?
**현재**: pat_parish_config는 churchCode 기반 설정
**선택지**:
- [ ] 기존 churchCode 기반 유지 (추가 변경 없음)
- [ ] 시스템 설정으로 통합 (나중에)

### Q3: 관리자 기능(registerChurch, adminLogin)은?
**현재**: churchCode 기반 교회 등록/관리
**선택지**:
- [ ] 기존 시스템 유지 (신규 가족방 시스템과 독립)
- [ ] 나중에 통합 (추후 논의)

---

## 🔐 보안 체크리스트 (구현 전 확인)

- [ ] familyCode는 예측 불가능한 난수 (nanoid/UUID) 사용
- [ ] familyCode는 사용자가 수동 입력 불가 (자동 생성만)
- [ ] passwordHash는 평문 저장 절대 금지
- [ ] familyId별로 비밀번호 독립 검증
- [ ] A 가족 비밀번호로 B 가족 접근 불가 테스트
- [ ] Firebase Security Rules에서 familyId 인증 확인

---

**다음 액션**:
1. 위 3가지 질문(Q1, Q2, Q3)에 대한 답변 확인
2. 해당 단계부터 구현 시작
3. 각 단계마다 테스트 및 배포

