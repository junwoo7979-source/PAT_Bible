# AUTH_REBUILD — 기존 데이터 기준값 (§37.9)

수집일시: 2026-07-17 13:41 KST · 수집 방법: 운영 공개 API (읽기 전용)

## 교회 11111 (세광교회) — getFamiliesList

- 가족방 수: **3**
- 총 구성원 수: **9**

| familyId | roomName | leaderName | parish | district | memberCount | members |
|---|---|---|---|---|---|---|
| mcZYCWhWozBjKAl8x5W9 | 예운네 말씀방 | 권호택 | 1교구 | 134 | 5 | 권호택, 예운아부지, 예운맘, 꿈동이 막내, Mi hyun |
| wfy8KM7KqZ6wVgL2GfR5 | 나봄방 | Hyun | 2교구 | 211 | 2 | Hyun, 아내히 |
| rbJ3fofbhJEz3EDgZ16L | 믿음가족방 | 김민수 | 2교구 | 212 | 2 | 김민수, 3 |

## 수집 한계 (미확인 항목 — "통과/일치"로 표기하지 않음)

- records / prayers / verses / churches / users / reports 전체 개수: **미수집**
  — 로컬에 Admin SDK 자격증명(gcloud ADC 또는 서비스계정 키) 없음.
  getPlatformStats는 PAT_DEV_TOKEN 필요(보유하지 않음).
- 다른 교회(신규 형식 코드) 존재 여부: 열거 API 없음 — 미확인.

## 전체 기준값 확보 방법 (사용자 조치 필요 — 3단계 진행 전 권장)

1. `gcloud auth application-default login` + `gcloud config set project pat-bible-app`
2. 이후 Admin SDK 읽기 전용 카운트 스크립트로 전 컬렉션 개수 저장 예정
   (컬렉션별 count() 집계 쿼리만 사용 — 문서 내용 변경 없음)
