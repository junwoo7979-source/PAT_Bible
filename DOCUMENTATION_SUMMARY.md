# PAT Bible — 문서화 & 재구조화 완료 (v1.0)

**작업 기간**: 2026-07-01  
**커밋**: 714cd44  
**상태**: ✅ 완료

---

## 📊 작업 요약

### 1️⃣ 아키텍처 문서화 (ARCHITECTURE.md)
**목표**: 현재 시스템의 설계를 명확하게 문서화

**결과**:
- ✅ **DB 스키마** (Firestore)
  - Churches: 교회 조직
  - Families: 가족/구역방
  - Records: 암송 기록
  - Prayers: 기도 나눔

- ✅ **인증 & 로그인 흐름** (2단계 구조)
  - STEP 1: 교회 선택 (churchCode 검증)
  - STEP 2: 가족 비밀번호 인증 (방 비밀번호 검증)
  - 순수 함수 분리: `loginDecision()`, `resolveFamilyByPassword()`

- ✅ **보안 원칙** (4가지)
  1. 교회코드 ≠ 방 비밀번호 (엄격한 분리)
  2. 방 격리 (familyId로 스코핑)
  3. 기본 비밀번호 금지 (교회코드 재사용 방지)
  4. 비밀번호 중복 방지 (같은 교회 내)

- ✅ **API 명세** (Cloud Functions)
  - checkChurchCode: 교회 코드 검증
  - findFamily: 비밀번호로 방 조회
  - saveFamily: 방 정보 저장
  - saveRecord: 암송 기록 저장

- ✅ **모듈 구조** (의존성 그래프)
  - login-auth.js (순수 함수)
  - app-core.js (상태 관리)
  - firebase-db.js (API)
  - family.js (방 관리)
  - rooms.js (다중 방)

---

### 2️⃣ 코드 주석 개선

#### login-auth.js
**개선 사항**:
- ✅ 파일 수준 주석: 목적, 설계 원칙, 2단계 로그인 구조
- ✅ `loginDecision()`: 상세 문서화
  - 목적, 입력, 반환값
  - STEP 1/2 로직
  - 모든 action 타입
  - 구체적인 예시 4가지
- ✅ `resolveFamilyByPassword()`: 상세 문서화
  - myFamilyId 스코핑 (재입장 vs 처음)
  - 방 격리 메커니즘
  - 사례별 동작

**라인 수**: 48줄 → 150줄 (주석 102줄 추가)

---

#### family.js
**개선 사항**:
- ✅ 파일 수준 주석: 책임, 데이터 구조, 주의사항
- ✅ `setFamilyStorage()`: localStorage 폴백 메커니즘
- ✅ `addMemberRow()`: 행 추가 상세화
  - 고유 ID 부여 (DOM 추적)
  - 입력 필드 & 삭제 버튼
  - 제약사항 (무한정 추가)
  - 예시 3가지
- ✅ `removeMemberRow()`: 행 삭제
- ✅ `getMemberNames()`: 입력값 수집
  - 동작 원리
  - 예시 (빈 값 자동 제외)
  - 호출 위치 (saveFamilyProfileAsLeader)
- ✅ `renderMemberRows()`: 폼 초기화
  - 기존 데이터 렌더링
  - 빈 폼 생성
  - 새 vs 편집 모드 구분
- ✅ `saveFamilyProfileAsLeader()`: 저장 흐름 상세화
  - 책임 & 입력
  - 6단계 저장 흐름
  - 검증 규칙 3가지
  - 데이터 구조 명시
  - localStorage vs Firebase
  - 오프라인 지원

**라인 수**: ~150줄 → ~450줄 (주석 300줄 추가)

---

### 3️⃣ 기능 구현 (진행 중)

**이미 완료**:
- ✅ 구성원 추가 UI (memberRows 컨테이너)
- ✅ "+ 구성원 추가" 버튼
- ✅ 개별 행 삭제 (✕ 버튼)
- ✅ `getMemberNames()` 함수
- ✅ `saveFamilyProfileAsLeader()`에 getMemberNames() 통합
- ✅ members 배열에 입력된 구성원 자동 포함

**다음 단계**:
- [ ] 013579 계정으로 실제 테스트 (3명 이상 등록)
- [ ] 로그아웃 후 재입장 시 memberRows 복구 확인
- [ ] Firebase 저장 검증
- [ ] 오프라인 모드 테스트

---

## 🔍 핵심 설계 원칙

### 원칙 1: 교회코드 ≠ 방 비밀번호
```
교회 선택 → 입장 아님 (인증 아님)
방 입장 → 비밀번호 필요 (유일한 인증)
```

**구현**:
- `loginDecision()`: input === churchCode → REJECT_CHURCHCODE
- `saveFamilyProfileAsLeader()`: password === DB.church.code → 거부
- Cloud Functions: 이중 검증

---

### 원칙 2: 방 격리 (familyId)
```
localStorage: pat_family_id (현재 방만)
Firestore: familyId로 필터 (다른 방 데이터 보호)
로그아웃: pat_family_profile 삭제 (pat_family_id도)
```

**구현**:
- `resolveFamilyByPassword()`: myFamilyId 스코핑
- `saveRecord()`: churchCode + familyId 필터
- `findFamilyByPassword()`: familyId 재입장 보호

---

### 원칙 3: 구성원 관리
```
대표자 자동 추가
입력된 구성원 동적 추가 (무한정)
members = [leaderName, ...inputMembers]
```

**구현**:
- `addMemberRow(name)`: 입력 행 추가
- `getMemberNames()`: 모든 입력값 수집
- `renderMemberRows(names)`: 기존 데이터 렌더링
- `saveFamilyProfileAsLeader()`: members 배열 구성

---

## 📋 파일 변경 사항

| 파일 | 변경 | 규모 |
|------|------|------|
| **ARCHITECTURE.md** | 신규 | 400줄 |
| **login-auth.js** | 주석 추가 | +102줄 |
| **family.js** | 주석 추가 | +300줄 |
| **index.html** | memberRows 추가 | +8줄 |
| **DOCUMENTATION_SUMMARY.md** | 신규 | 이 문서 |

**총 변경**: 5개 파일, ~810줄 추가

---

## 🚀 다음 단계

### Phase 1: 검증 (현재)
- [ ] 구성원 3명 이상 등록 (013579 계정)
- [ ] 로그아웃/재입장 시 복구 확인
- [ ] Firebase 동기화 검증
- [ ] 오프라인 동작 확인

### Phase 2: 확장 (미래)
- [ ] 다중 방 소속 완전 지원
- [ ] QR 코드 입장
- [ ] 토큰 기반 인증
- [ ] 소셜 로그인

### Phase 3: 성능 최적화
- [ ] 캐시 전략 개선
- [ ] 동기화 배치 처리
- [ ] 로컬 DB 도입

---

## 💡 주요 개선점

### 명확성
- ✅ 2단계 로그인이 무엇인지 명확
- ✅ 각 함수의 책임이 명확
- ✅ 보안 원칙이 명확

### 유지보수성
- ✅ 주석이 풍부하여 신입 개발자도 이해 가능
- ✅ 코드 흐름이 시각화됨 (다이어그램)
- ✅ API 명세가 문서화됨

### 확장성
- ✅ 다중 방 소속 구조 설계됨
- ✅ 모듈 의존성이 명확
- ✅ 새 기능 추가 포인트 명시됨

---

## 📚 참고 자료

### 내부 문서
- **ARCHITECTURE.md**: 전체 아키텍처 설계
- **login-auth.js**: 로그인 판정 로직 (순수 함수)
- **family.js**: 방 관리 로직

### 외부 자료
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Cloud Functions](https://firebase.google.com/docs/functions)
- [PAT Bible GitHub](https://github.com/junwoo7979-source/PAT_Bible)

---

## ✅ 체크리스트

- [x] ARCHITECTURE.md 작성
- [x] login-auth.js 주석 개선
- [x] family.js 주석 개선
- [x] 구성원 추가 UI 구현 (memberRows)
- [x] 커밋 & 푸시
- [ ] 013579 계정으로 테스트
- [ ] 회귀 테스트 (기존 기능)
- [ ] 모바일 앱 테스트 (TWA)

---

**완료일**: 2026-07-01  
**작성자**: Claude Code  
**버전**: 1.0  
**상태**: 📖 문서화 완료, 🔧 재구조화 완료, 🧪 테스트 진행 중

