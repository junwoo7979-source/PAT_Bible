# PAT Bible 로그인 시스템 마이그레이션 분석 (v0)

**작성일**: 2026-07-11  
**목표**: 교회코드 기반 → 자유 입장 + 가족코드/비밀번호 기반 전환  
**우선순위**: 기존 데이터 절대 손실 금지

---

## 1️⃣ 현재 상태 분석

### 로그인 흐름

```
app 시작
  ↓
← localStorage의 pat_church_code 로드
  ↓
[로그인 화면] - 교회 코드 입력 필수
  ↓
enterChurch() 호출
  ↓
_enterChurchImpl()
  ├─ SELECT_CHURCH (churchCode 입력 단계)
  │   ├─ PAT_DB.getConfig(churchCode) [Firebase 조회]
  │   ├─ initChurchDefaults(churchCode) [로컬 폴백]
  │   ├─ legacyChurches 체크 (013579 등 차단)
  │   └─ getFamiliesList(churchCode) [가족 조회]
  │
  ├─ 가족 0개 → openFamilyRegister('leader') [가족방 만들기]
  │
  └─ 가족 있음 → password 단계로 진행
      ↓
      [로그인 화면] - 비밀번호 입력
      ↓
      findFamily(churchCode, password, familyId)
      ↓
      ✓ 성공 → enterMemberHome()
      ✗ 실패 → "비밀번호가 다릅니다"
```

### localStorage 필드 (pat_* 접두사)

| 필드 | 용도 | 크기 | 삭제 안 됨 |
|------|------|------|----------|
| `pat_church_code` | 현재 선택된 교회코드 | 10B | ⚠️ 신규 시스템에서 제거 |
| `pat_family_id` | 현재 가족방 ID (Firestore 문서 ID) | 30B | ✅ 절대 유지 |
| `pat_family_profile` | 가족방 프로필 캐시 | 2KB | ✅ 절대 유지 |
| `pat_leader_family_profile` | 방장 프로필 캐시 | 2KB | ✅ 절대 유지 |
| `pat_member_name` | 현재 사용자 이름 | 30B | ✅ 절대 유지 |
| `pat_device_id` | 기기 고유 ID | 40B | ✅ 절대 유지 |
| `pat_records` | 암송/기도 기록 | 100KB+ | ✅ 절대 유지 |
| `pat_prayer` | 기도 기록 | 50KB+ | ✅ 절대 유지 |
| `pat_memorize` | 암송 진도 | 50KB+ | ✅ 절대 유지 |
| `pat_read_done` | 성경읽기 완료 | 1KB | ✅ 절대 유지 |
| `pat_hist` | 수행 기록 (히스토리) | 30KB+ | ✅ 절대 유지 |
| `pat_rooms` | 내 방 목록 | 5KB | ✅ 절대 유지 |
| `pat_worship` | 예배 설정 | 1KB | ✅ 절대 유지 |
| `pat_parish_config` | 교구 설정 | 2KB | ⚠️ 교회별 설정이라 주의 |

### Firestore 스키마 분석

#### `churches/{churchCode}` (교회 문서)
```javascript
{
  churchCode: "11111",           // 👈 폐기될 필드
  name: "세광교회",
  config: { ... }                // 현재는 churchCode 기준
}
```

#### `churches/{churchCode}/families/{familyId}` (가족방 문서)
```javascript
{
  familyId: "mcZYCWhWozBjKAl8x5W9",   // 내부 ID (변경 금지)
  churchCode: "11111",                  // 👈 폐기될 필드
  leaderName: "김민수",
  familyPasswordHash: "v1$abc123...",   // pepper 기준으로 해시됨
  members: [
    { name: "김민수", role: "leader", joinedAt: 1234567890 },
    { name: "김지현", role: "member", joinedAt: 1234567890 }
  ],
  roomName: "가족방",
  updatedAt: 1234567890
}
```

#### `churches/{churchCode}/admin/cred` (관리자 자격증)
```javascript
{
  adminId: "user@example.com",
  adminPwHash: "v1$def456...",        // 관리자 비밀번호 해시
  createdAt: 1234567890
}
```

---

## 2️⃣ 문제점 및 위험요소

### 현재 시스템의 문제
1. **교회코드 의존성**: 모든 입장이 churchCode 필수 → 새 사용자 진입 장벽 높음
2. **churchCode 전역 비밀번호**: 같은 churchCode의 모든 가족방이 같은 비밀번호 사용 가능
3. **familyId 중복 가능성**: churchCode 제거 시 familyId 전역 유일성 확보 필요
4. **pepper 불일치**: v197에서 수정했지만, familyCode 도입 시 재검토 필요

### 마이그레이션 위험
1. ❌ **churchCode 제거 시 기존 데이터 손실**: Firestore families 문서의 churchCode 필드 제거 불가
2. ❌ **familyId 변경**: localStorage의 pat_family_id가 깨질 수 있음
3. ❌ **비밀번호 해시 불일치**: familyCode 기준으로 다시 해시하면 기존 passwordHash와 맞지 않음
4. ❌ **기존 사용자 로그아웃**: pat_church_code 필드가 없으면 자동 로그인 실패

---

## 3️⃣ 안전한 마이그레이션 전략

### Phase A: 신규 필드 추가 (기존 데이터 유지)

#### Firestore families 문서에 신규 필드 추가
```javascript
{
  // 기존 필드 (유지)
  familyId: "mcZYCWhWozBjKAl8x5W9",
  churchCode: "11111",                  // ← 읽기만, 쓰기 금지
  leaderName: "김민수",
  familyPasswordHash: "v1$abc123...",   // ← 기존 방식 유지
  
  // 신규 필드 (v197부터)
  familyCode: "FAM_xyz789abc",          // ← 신규 초대 코드 (고유, nanoid 기반)
  familyCodeCreatedAt: 1234567890,      // ← familyCode 생성일
  useNewAuthMethod: true,               // ← 신규 인증 방식 사용 여부 플래그
}
```

#### localStorage 신규 필드
```javascript
// 기존 (유지)
localStorage.setItem('pat_family_id', 'mcZYCWhWozBjKAl8x5W9');

// 신규
localStorage.setItem('pat_family_code', 'FAM_xyz789abc');  // ← 편의용
localStorage.setItem('pat_free_entry', 'true');            // ← 신규 시스템 opt-in
```

### Phase B: 신규 함수 추가 (기존 함수 미수정)

#### Functions (index.js)
```javascript
// 신규
createFamily(familyName, password, deviceId, memberName)
  ├─ familyCode = nanoid(12) 또는 UUID 단축
  ├─ passwordHash = hashFamilyPassword(familyCode, password, pepper)  // ← churchCode 대신 familyCode 사용!
  ├─ Firestore families/{auto-generated-id} 생성
  └─ 반환: { familyId, familyCode, familyName, passwordHash }

findFamilyByCode(familyCode)
  ├─ Firestore families 컬렉션을 familyCode로 검색
  └─ 반환: { familyId, familyName } 또는 null

verifyFamilyPasswordV2(familyId, password, pepper)
  ├─ Firestore families/{familyId}.passwordHash 조회
  ├─ hashFamilyPassword(???, password, pepper) 와 비교
  └─ 문제: familyCode를 어디서 가져올 것인가?
```

#### 문제: familyCode와 passwordHash의 관계
```
현재 (churchCode 기반):
  저장: familyPasswordHash = hashFamilyPassword(churchCode, password, pepper)
  검증: verifyFamilyPassword(churchCode, password, storedHash, pepper)
  
신규 (familyCode 기반):
  저장: familyPasswordHash = hashFamilyPassword(familyCode, password, pepper)
  검증: verifyFamilyPassword(familyCode, password, storedHash, pepper)
       ↑ familyCode를 어디서?
```

**해결책**:
1. **Option A**: Firestore families 문서에 familyCode를 함께 저장 (현재 방식 유지)
   ```javascript
   passwordHash = hashFamilyPassword(familyCode, password, pepper)
   // familyCode는 families 문서의 필드로 저장
   ```
   
2. **Option B**: familyId 기준으로 해시 (churchCode처럼 간단함)
   ```javascript
   passwordHash = hashFamilyPassword(familyId, password, pepper)
   ```

**선택**: **Option B** (familyId 기준 해시)
- 이미 familyId는 전역 고유함
- 클라이언트에서 familyId 조회 후 비밀번호 검증 가능
- 기존 churchCode 방식과 동일한 로직

### Phase C: 신규 UX 흐름

#### 기존 사용자 (pat_family_id 있음)
```
app 시작
  ├─ localStorage.getItem('pat_family_id') 확인
  │   ✓ 있음 → 기존 가족방으로 바로 진입 (enterMemberHome)
  │   ✗ 없음 → 다음 단계
  │
  └─ [홈 화면 - 가족방 없음]
      ├─ [가족방 만들기]
      └─ [가족코드로 들어가기]
```

#### 신규 사용자 (pat_family_id 없음)
```
[홈 화면 - 가족방 없음]
  │
  ├─ "가족방 만들기" 클릭
  │   ├─ [가족방 이름 입력] → "새 가족방"
  │   ├─ [가족비밀번호 입력] → "password123"
  │   └─ createFamily() 호출
  │       ├─ familyCode = "FAM_xyz789abc" (자동 생성)
  │       ├─ familyId = "auto-generated-uuid"
  │       ├─ Firestore families/{familyId} 저장
  │       └─ localStorage.setItem('pat_family_id', familyId)
  │
  ├─ → [가족방 대시보드] ✅
  │
  └─ "가족코드로 들어가기" 클릭
      ├─ [가족코드 입력] → "FAM_xyz789abc"
      ├─ findFamilyByCode("FAM_xyz789abc") 호출
      │   └─ familyId 반환
      ├─ [가족비밀번호 입력] → "password123"
      ├─ verifyFamilyPassword(familyId, password) 호출
      │   ├─ Firestore families/{familyId}.passwordHash 조회
      │   ├─ hashFamilyPassword(familyId, password, pepper) 계산
      │   └─ 비교 ✓
      ├─ localStorage.setItem('pat_family_id', familyId)
      └─ → [가족방 대시보드] ✅
```

---

## 4️⃣ 구현 순서

### 1단계: Functions 수정 (백엔드)
- [ ] createFamily(familyName, password, deviceId, memberName) 추가
- [ ] findFamilyByCode(familyCode) 추가
- [ ] verifyFamilyPassword 유지 (familyId 기준으로)
- [ ] 테스트: API 호출 검증

### 2단계: app-core.js 수정 (프론트엔드 상태 관리)
- [ ] 로그인 상태 초기화 (churchCode 입력 제거)
- [ ] pat_family_id 자동 로드 → enterMemberHome() 직접 호출
- [ ] createFamily() 함수 추가
- [ ] enterFamilyByCode() 함수 추가
- [ ] 기존 enterChurch() 마이그레이션 (호환성 유지)

### 3단계: UI 수정 (index.html, family.js)
- [ ] 로그인 화면 제거
- [ ] 홈 화면 "가족방 없음" 상태 추가
- [ ] "가족방 만들기" 다이얼로그 추가
- [ ] "가족코드 입장" 다이얼로그 추가

### 4단계: 데이터 마이그레이션
- [ ] Firestore families 문서에 familyCode 필드 추가 (기존 문서)
- [ ] familyCode 자동 생성 (nanoid로 충돌 검사)
- [ ] 기존 passwordHash 유지 (churchCode 기준 → familyId 기준으로는 변경 불가, 호환성 유지)

### 5단계: 테스트
- [ ] E2E 테스트 (9가지 필수 시나리오)
- [ ] 기존 사용자 자동 로그인 확인
- [ ] 신규 사용자 가족방 생성 확인
- [ ] 기존 가족방 데이터 무결성 확인

---

## 5️⃣ 핵심 의사결정

### Q1: 기존 churchCode 필드는 어떻게?
**A**: Firestore families 문서의 churchCode 필드는 읽기만 하고, 신규 쓰기는 하지 않음.
- 기존 쿼리 호환성 유지
- 나중에 마이그레이션 스크립트로 배치 삭제 가능

### Q2: 비밀번호 해시는 churchCode 기준? 아니면 familyId 기준?
**A**: familyId 기준 (혼동 최소화)
- churchCode 기반 해시는 기존 데이터에만 사용
- 신규 데이터는 familyId 기준으로 해시
- 단, 기존 churchCode 기준 해시는 그대로 유지 (호환성)

### Q3: familyCode는 Firestore에 저장?
**A**: 네, 반드시 저장
- 클라이언트 UI에서 사용자 편의 (복사/공유 가능)
- findFamilyByCode() 쿼리를 위해 필수
- 인덱스: `families.familyCode` (검색 용도)

### Q4: 기존 pat_church_code localStorage는?
**A**: 유지하되, 신규 시스템에서는 무시
- 마이그레이션 단계에서 필요 (기존 사용자 호환성)
- 나중에 계속 사용하거나, 단계별로 제거 가능

---

## 6️⃣ 파일 수정 계획

| 파일 | 작업 | 라인 | 비고 |
|------|------|------|------|
| `functions/index.js` | createFamily() 추가 | ~600 | 신규 함수 |
| `functions/index.js` | findFamilyByCode() 추가 | ~700 | 신규 함수 |
| `functions/password.js` | 유지 (familyId 기준 사용) | 그대로 | 변경 없음 |
| `app/js/app-core.js` | 로그인 흐름 단순화 | 800~1000 | 상태 제거 |
| `app/js/app-core.js` | createFamily() 추가 | 1500+ | 신규 함수 |
| `app/js/app-core.js` | enterFamilyByCode() 추가 | 1500+ | 신규 함수 |
| `app/js/family.js` | 가족방 생성 UI 수정 | 400+ | 기존 유지 + 신규 |
| `app/index.html` | 홈 화면 추가 | UI | "가족방 없음" 상태 |
| `Firestore 스키마` | families 문서 필드 추가 | 마이그레이션 | familyCode + useNewAuthMethod |

---

**다음 단계**: 2단계부터 시작 (Functions 백엔드 구현)
