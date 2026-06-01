# PAT Bible 🙏

> 교회·가족·개인이 함께 쓰는, **음성+타이핑 2단계 검증** 성경 암송 웹앱
> 세광교회 디지털 사역 · PAT (Praise · Adore · Treasure)

---

## 📂 프로젝트 구조 (PHASE 1 산출물)

```
PAT_Bible/
├── README.md                      ← 본 문서
├── wireframes/
│   └── index.html                 ← 8화면 와이어프레임 (브라우저에서 열기)
├── design/
│   └── theme-tokens.css           ← 다크/크림 테마 색상 토큰
├── database/
│   └── firestore-schema.json      ← Firestore 5컬렉션 DB 스키마
└── docs/
    └── 기능정의서.md               ← MVP 9기능 확정 명세
```

---

## ✅ PHASE 1 완료 현황

| 산출물 | 상태 | 파일 |
|--------|------|------|
| 기능정의서 | ✅ 완료 | `docs/기능정의서.md` |
| 화면 설계도 (8화면) | ✅ 완료 | `wireframes/index.html` |
| DB 구조도 (5컬렉션) | ✅ 완료 | `database/firestore-schema.json` |
| 테마 색상 토큰 | ✅ 완료 | `design/theme-tokens.css` |

> **PHASE 1 완료 기준 충족** → PHASE 2(AI 프로토타입) 착수 가능

---

## 🚀 다음 단계 (PHASE 2)

1. `wireframes/index.html`을 캡처 → **v0.dev**에 "이 화면을 React로 만들어줘" 의뢰
2. **bolt.new**로 앱 골격 생성 (로그인·가족방·암송)
3. **Cursor**로 코드 정리 + GitHub 연결
4. 더미 데이터로 화면 흐름 검증

## 🛠 기술 스택
- **Frontend**: React + Next.js (또는 Vite) + Tailwind CSS
- **Backend/DB**: Firebase (Firestore · Auth · Hosting)
- **STT**: Web Speech API → CLOVA/Whisper (정확도 부족 시)
- **배포**: Vercel / Firebase Hosting

---

*PHASE 1 기획·설계 완료 · 2026-06-01*
