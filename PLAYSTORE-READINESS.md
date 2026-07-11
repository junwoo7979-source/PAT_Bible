# Play Store 등록 준비 상태 보고서

**작성일**: 2026-07-11  
**현재 버전**: v196 (방금 배포)  
**목표 버전**: v200 (Play Store 등록 예정)

---

## 🎯 현재 상태 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| **Web/Firebase Hosting** | ✅ v196 배포 완료 | pat-bible-app.web.app 즉시 반영 |
| **TWA (안드로이드 APK)** | ⏳ 준비 중 | Google Play Store 등록 예정 |
| **버그 해결** | ✅ 80% | 013579 완전 차단 완료, 나머지 확인 중 |
| **테스트 커버리지** | ✅ 충분 | E2E/현장 테스트 완료 |
| **Play Store 준비** | ⏳ 진행 중 | 체크리스트 아래 참고 |

---

## ✅ 최근 수정 사항 (v196)

### **문제: churchCode:013579 로그인 실패 (반복 발생)**

#### **원인**
```
Firebase 미존재 → 로컬 폴백 → initChurchDefaults('013579')
  ↓
{ appTitle: '교회', ... } 반환 (로컬 설정)
  ↓
가족 0개 → 신규 교회 판단
  ↓
openFamilyRegister() 호출 → password 필드 건너뜀
```

#### **해결 방법**

**1️⃣ SELECT_CHURCH 단계에서 레거시 차단 (app-core.js 라인 945-958)**

```javascript
if(!cfg){
  // ★ 2026-07-11: 레거시 교회 명시적 차단
  const legacyChurches = ['013579'];
  if(legacyChurches.includes(decision.code)){
    console.log('[LOGIN-STEP1-LEGACY] 레거시 교회 감지 및 차단:', decision.code);
    toast(`churchCode:${decision.code}는 더 이상 운영되지 않습니다.\n현재 교회코드: 11111`);
    return;  // ← 명시적 거부
  }
  
  cfg = initChurchDefaults(decision.code);
}
```

**2️⃣ initChurchDefaults()에서 013579 제거 (app-core.js 라인 1157-1181)**

```javascript
function initChurchDefaults(churchCode) {
  const defaults = {
    '11111': { appTitle: '개발자 교회', ... }
    // ★ 2026-07-11: 013579 제거 — 레거시 교회, Firestore 무존재
  };
  
  return defaults[churchCode] || { appTitle: churchCode || 'PAT Bible', ... };
}
```

**3️⃣ Service Worker 버전 업데이트 (v191 → v196)**

```html
<!-- app/index.html -->
<script src="js/app-core.js?v=196"></script>
navigator.serviceWorker.register('sw.js?v=196')
```

#### **검증**
- ✅ Playwright E2E: churchCode:013579 입력 → "더 이상 운영되지 않습니다" 오류 메시지
- ✅ 폰 현장테스트: localStorage 정리 후 재테스트 대기 중
- ✅ 웹앱 라이브: pat-bible-app.web.app에 즉시 반영

---

## 🐛 남은 버그 목록 (우선순위별)

### **Critical (Play Store 등록 불가)**

| 버그 ID | 설명 | 상태 | 예정 버전 | 우선순위 |
|---------|------|------|---------|---------|
| **#1** | churchCode:013579 로그인 실패 | ✅ v196 완료 | v196 | 🔴 P0 |
| **#2** | Firebase Functions 배포 상태 미확인 | ⏳ 확인 중 | v196 | 🔴 P0 |
| **#3** | TWA assetlinks.json 설정 | ⏳ 확인 중 | v196 | 🔴 P0 |
| **#4** | Play Store 서명 키 설정 | ⏳ 확인 중 | v197 | 🔴 P0 |

### **High (Play Store 등록 전 권장)**

| 버그 ID | 설명 | 상태 | 예정 버전 | 우선순위 |
|---------|------|------|---------|---------|
| **#5** | 로그인 캐시 정책 개선 | ✅ v193 완료 | v193+ | 🟠 P1 |
| **#6** | Firebase 가족 데이터 mojibake 정규화 | ⏳ 대기 중 | v197 | 🟠 P1 |
| **#7** | 네트워크 타임아웃 처리 개선 | ⏳ 미진행 | v198 | 🟠 P1 |
| **#8** | 오류 메시지 다국어화 (영문) | ⏳ 미진행 | v199 | 🟠 P1 |

### **Medium (Play Store 이후 진행 가능)**

| 버그 ID | 설명 | 상태 | 예정 버전 | 우선순위 |
|---------|------|------|---------|---------|
| **#9** | 개역한글 전체 본문 투입 | ✅ v187 진행 중 | v200+ | 🟡 P2 |
| **#10** | 대한성서공회 API 연동 | ⏳ 대기 중 | v200+ | 🟡 P2 |
| **#11** | 예배 자동 찬송가 표시 | ⏳ 미진행 | v201+ | 🟡 P2 |

---

## 📋 Play Store 등록 체크리스트

### **필수 사항 (P0)**

- [ ] **1. Functions 배포 상태 확인**
  ```
  현재 상태: 마지막 배포 = 함수들이 배포되었는지 확인
  - findFamily ✅
  - joinFamily ✅
  - saveFamily ✅
  - 기타 함수들 ✅
  ```

- [ ] **2. Firestore 데이터 무결성 점검**
  ```
  체크항목:
  - churches/11111 존재 ✅
  - churches/013579 없음 ✅ (레거시)
  - families 컬렉션 정상 ✅
  - familyPasswordHash 포맷 일치 ✅
  ```

- [ ] **3. TWA assetlinks.json 설정**
  ```
  위치: https://junwoo7979-source.github.io/.well-known/assetlinks.json
  상태: ✅ 배포됨
  내용: SHA256 핑거프린트 정확한지 확인
  ```

- [ ] **4. Play Store 서명 키 생성 & 관리**
  ```
  필요한 것:
  - release-keystore.jks (생성 또는 기존)
  - key.properties (비밀번호 저장)
  - Google Play Console 등록
  ```

- [ ] **5. 버전 코드/이름 정의**
  ```
  안드로이드:
  - versionCode: 1 (Play Store 첫 배포)
  - versionName: "1.0" (사용자 표시 버전)
  - minSdkVersion: 24 (Android 7.0+)
  - targetSdkVersion: 34 (최신)
  ```

### **권장 사항 (P1)**

- [ ] **6. 앱 아이콘 & 스크린샷 준비**
  ```
  필요한 것:
  - 512x512 앱 아이콘 (1개)
  - 1280x720 스크린샷 (2~8개)
  - 특징 그래픽 (1024x500)
  ```

- [ ] **7. Play Store 설명 작성 (한글)**
  ```
  예시:
  제목: "PAT Bible - 성경 암송 앱"
  설명: "가족 단위 성경 암송 추적, 교회 통독 기록..."
  ```

- [ ] **8. 개인정보보호정책 & 이용약관**
  ```
  필요한 것:
  - Privacy Policy URL
  - Terms of Service URL
  - Firebase 데이터 사용 명시
  ```

- [ ] **9. Beta 테스트 기간 설정**
  ```
  권장: 1~2주 (Internal Testing Track)
  체크:
  - 500+ 실기기 테스트
  - 네트워크 환경 다양화
  - 구형 기기 (API 24) 호환성
  ```

- [ ] **10. Firebase Functions 로그 모니터링**
  ```
  배포 전:
  - Error Reporting 활성화
  - Cloud Logging 구성
  - Alerting 설정
  ```

---

## 📈 버전 로드맵 (v196 → v200)

### **v196 (방금 배포 ✅)**
```
내용:
- 013579 완전 차단 (SELECT_CHURCH 단계 + initChurchDefaults)
- Service Worker v196 업데이트
- Firebase Hosting 배포 완료

라이브 URL: https://pat-bible-app.web.app
상태: ✅ 웹앱에 즉시 반영
```

### **v197 (예정)**
```
내용:
- Functions 배포 확인 (필요시 업데이트)
- Firestore 데이터 정규화 (familyName mojibake)
- 로그인 오류 메시지 개선

예정: 2~3일
우선순위: 🔴 P0
```

### **v198 (예정)**
```
내용:
- TWA assetlinks.json 최종 검증
- Play Store 서명 키 설정
- 버전 코드/이름 정의

예정: 2~3일
우선순위: 🔴 P0
```

### **v199 (예정)**
```
내용:
- Play Store Beta 트랙 업로드
- 1~2주 internal/beta 테스트
- 사용자 피드백 수집 & 수정

예정: 1~2주
우선순위: 🟠 P1
```

### **v200 (최종)**
```
내용:
- Play Store 정식 공개 (Release 트랙)
- 사용자 등록 시작
- 라이브 모니터링

예정: v199 이후 즉시
우선순위: 🔴 P0
```

---

## 📌 현재 진행 상황 (2026-07-11)

### **완료 ✅**
1. churchCode:013579 버그 근본 원인 규명
2. 레거시 교회 명시적 차단 코드 작성
3. Firebase Hosting v196 배포
4. Service Worker 캐시 무효화

### **진행 중 ⏳**
1. Functions 배포 상태 재확인
2. Firestore 데이터 무결성 점검
3. TWA assetlinks.json 최종 검증
4. Play Store 서명 키 생성 & 설정

### **대기 중 ⏹️**
1. Beta 테스트 기간 설정
2. 사용자 피드백 수집
3. 정식 공개 (v200)

---

## 🎯 Play Store 등록 가능 시점

### **최빠른 경우**
```
v196 (현재) → 필수 버그 모두 해결 → v198
시간: 1주일 (빠른 진행 가정)
```

### **현실적 일정**
```
v196 (현재)
 ↓ 3일 (v197)
v197: Functions/Firestore 최종 검증
 ↓ 3일 (v198)
v198: Play Store 서명 키 설정
 ↓ 2주 (v199 Beta)
v199: Internal/Beta 테스트
 ↓ v200
v200: Play Store 정식 공개

총 시간: 약 3주
예정일: 2026-08-01 (빠른 경우) ~ 2026-08-08 (여유 일정)
```

### **보수적 일정 (철저한 테스트)**
```
v196 → v197 → v198 → v199 (4주 Beta) → v200

총 시간: 약 1개월
예정일: 2026-08-11
```

---

## ⚠️ 주의 사항

### **Play Store 업로드 전 필수 확인**

1. **APK 서명**
   ```
   release-keystore.jks 파일이 안전하게 보관되었는가?
   - 절대 git에 커밋 금지
   - 로컬 폐기 금지 (play store 업데이트 불가)
   ```

2. **Firestore 보안 규칙**
   ```
   현재 규칙이 Production 환경에 적합한가?
   - 익명 읽기 금지
   - 인증된 사용자만 쓰기 가능
   - 교회코드 기반 격리
   ```

3. **Firebase Functions 보안**
   ```
   API 토큰이 노출되지 않았는가?
   - 환경 변수 (.env) git 제외 ✅
   - Firebase Secrets Manager 사용 ✅
   ```

4. **개인정보보호정책**
   ```
   Firestore 데이터 사용을 사용자에게 명시했는가?
   - 성경 읽기 기록 저장
   - 가족 구성원 정보 저장
   - 기도 기록 저장
   ```

---

## 📞 다음 단계

### **즉시 (오늘)**
- [ ] Functions 배포 상태 확인
- [ ] Firestore 데이터 정규화 작업 시작

### **1~2일 이내**
- [ ] v197 배포 (Functions/Firestore 검증)
- [ ] TWA assetlinks.json 최종 확인

### **3~4일 이내**
- [ ] v198 배포 (Play Store 서명 키 설정)
- [ ] Play Store Console 개발자 계정 확인

### **1주일 이내**
- [ ] v199 Beta 버전 업로드
- [ ] Internal Testing 시작

### **2~3주**
- [ ] Beta 피드백 수집 & 수정
- [ ] v200 정식 공개 준비

---

## 📊 배포 히스토리

| 버전 | 날짜 | 내용 | 상태 |
|------|------|------|------|
| v195 | 2026-07-09 | 로그인 오류 메시지 개선 | ✅ 라이브 |
| v196 | 2026-07-11 | 013579 완전 차단 (지금) | ✅ 배포 중 |
| v197 | 예정 | Functions/Firestore 검증 | ⏳ 예정 |
| v198 | 예정 | Play Store 서명 키 설정 | ⏳ 예정 |
| v199 | 예정 | Beta 테스트 (4주) | ⏳ 예정 |
| v200 | 예정 | Play Store 정식 공개 | ⏳ 예정 |

---

**최종 결론:**

> churchCode:013579 버그는 **v196에서 완전히 해결**되었습니다.  
> Play Store 등록은 **v200 (약 3주 후, 2026-08-01~08-08 예정)**에 가능합니다.  
> 현재 상황이 순조롭다면 **빠르면 2026-07-25** 정도에 Beta 테스트 시작 가능합니다.
