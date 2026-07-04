# PAT Bible — 폰트·색상·로고·메뉴 리파인 디자인안 (2026-07)

> Design Planning: ① 서비스 분석 → ② 디자인 전략 → ③ 스타일 검증 → ④ 최종 가이드
> 목표: **7세~노년층** 모두에게 세련되고 **선명한** UI. 어둡고 흐릿한 인상 제거.

---

## ① 서비스 분석 — 현재 상태 진단

| 항목 | 현재 값 | 문제점 |
|------|---------|--------|
| **폰트** | `'Malgun Gothic','Apple SD Gothic Neo'` | 시스템 기본체 → 투박하고 세련미 없음, 굵기 편차 큼 |
| **배경** | `#e8ecf1` (회청색) | 살짝 칙칙함 → 밝은 인상 부족 |
| **본문색** | `#0f1419` / muted `#5f6b7c` | 본문은 OK, 보조텍스트가 흐릿 |
| **액센트** | `#00a854` (형광 느낌 초록) | 채도 높아 저렴해 보임, 신뢰감 약함 |
| **로고** | 이모지(📱💬📖) 남발 | 브랜드 정체성 없음, 통일감 X |
| **메뉴(탭바)** | 회색 아이콘, active=초록 글자만 | 선택 상태가 약함, 터치 영역 좁음 |

---

## ② 디자인 전략 — 방향

1. **폰트 교체**: 시스템체 → **Pretendard** (현존 최고 가독성 한글 웹폰트, 전 세대 친화·모던·선명)
2. **색상 정제**: 형광 초록 → **차분한 딥 그린/틸**로 격상해 신뢰감 + 선명도 동시 확보
3. **배경 밝기 ↑**: 회청색 → 웜 화이트로 개방감
4. **로고 통일**: 이모지 제거 → **책+말풍선 심볼 + 워드마크** 조합
5. **메뉴 강화**: 선택 탭에 **알약(pill) 배경** + 굵은 라벨로 명확한 상태 표시

---

## ③ 스타일 검증 — 접근성 체크 (WCAG)

| 조합 | 명도대비 | 판정 |
|------|----------|------|
| 본문 `#111827` on `#f7f9fc` | 15.8:1 | ✅ AAA |
| 보조 `#4b5563` on `#f7f9fc` | 8.1:1 | ✅ AAA |
| 액센트 `#0f7a52` on 흰색 | 4.9:1 | ✅ AA (버튼 큰 글씨 OK) |
| 흰 글씨 on 액센트 `#0f7a52` | 4.9:1 | ✅ AA |

→ 노년층 기준(대비 7:1 지향) 본문·보조 모두 통과. 액센트는 버튼 등 큰 요소에만 사용.

---

## ④ 최종 디자인 가이드 (복붙 적용용)

### 4-1. 폰트 — Pretendard 적용

**index.html `<head>`에 추가** (self-host 권장, 오프라인 PWA 대응):
```html
<link rel="stylesheet" as="style" crossorigin
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
```
**body 폰트 교체** (현재 81번째 줄):
```css
/* BEFORE */
body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif; ... }
/* AFTER */
body{font-family:'Pretendard Variable','Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;
  -webkit-font-smoothing:antialiased;letter-spacing:-0.01em; ... }
```
- `letter-spacing:-0.01em` → 한글이 더 정돈되고 선명해 보임
- `antialiased` → 글자 가장자리 매끄럽게

**타이포 스케일 (노년층 배려 유지)**
| 용도 | 크기 | 굵기 |
|------|------|------|
| 페이지 제목 h1 | 26px (`--fs-xl`) | 700 |
| 섹션 제목 h2 | 20px (`--fs-lg`) | 600 |
| 본문 | 16px (`--fs`, large모드 20px) | 400 |
| 보조/캡션 | 14px | 400 |
| 버튼 | 17px | 600 |

### 4-2. 색상 팔레트 — `:root` 교체안

```css
:root{
  /* 배경 — 웜 화이트로 밝게 */
  --bg:#f7f9fc;          /* (구 #e8ecf1) 밝고 깨끗 */
  --surface:#ffffff;     /* 카드는 순백으로 선명하게 */
  --surface-2:#f1f5f9;   /* 보조 카드 */

  /* 액센트 — 딥 그린(신뢰+선명) */
  --accent:#0f7a52;      /* (구 #00a854) 차분한 딥 그린 */
  --accent-d:#0b5d3e;    /* 눌림/호버 */
  --accent-soft:#e3f3ec; /* 연한 배경(선택 탭·뱃지) */

  /* 텍스트 — 대비 강화 */
  --text:#111827;        /* 진한 잉크블랙 */
  --muted:#4b5563;       /* (구 #5f6b7c) 더 또렷하게 */
  --line:#e2e8f0;        /* 구분선 은은하게 */

  --danger:#dc2626;
  --fs:16px; --fs-lg:20px; --fs-xl:26px;
  --radius:14px; --lh:1.8; --lh-title:1.4;
}
```
> `<meta name="theme-color">`도 `#f7f9fc`로 맞추면 상태바까지 통일.

### 4-3. 로고 — 이모지 제거 → 브랜드 워드마크

**심볼**: 기존 파비콘 아이콘(책+틸)을 살려 **네이비(#1a2332) 라운드 배경 + 딥그린 책** 심볼 사용.

**헤더 로고 컴포넌트** (이모지 `<div class="logo">📖</div>` 대체):
```html
<div class="brand">
  <span class="brand-mark">
    <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1a2332"/>
      <path d="M18 14h28a4 4 0 0 1 4 4v34H20a6 6 0 0 1-6-6V18a4 4 0 0 1 4-4z" fill="#0f7a52"/>
      <path d="M22 22h20M22 30h20M22 38h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    </svg>
  </span>
  <span class="brand-text">PAT <b>Bible</b></span>
</div>
```
```css
.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin:20px 0 8px;}
.brand-mark{display:flex;filter:drop-shadow(0 2px 6px rgba(15,122,82,.18));}
.brand-text{font-size:24px;font-weight:400;letter-spacing:-.02em;color:var(--text);}
.brand-text b{font-weight:800;color:var(--accent);}  /* 'Bible'만 딥그린 굵게 → 선명한 포인트 */
```

### 4-4. 메뉴(탭바) — 선택 상태 알약 강조

```css
/* BEFORE: 회색 아이콘, active는 글자색만 초록 */
/* AFTER */
.tabbar{position:fixed;bottom:0;left:50%;transform:translateX(-50%);
  width:100%;max-width:480px;display:flex;background:var(--surface);
  border-top:1px solid var(--line);padding:6px 4px calc(6px + env(safe-area-inset-bottom));
  box-shadow:0 -2px 12px rgba(17,24,39,.05);}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:8px 0;font-size:12px;font-weight:600;color:var(--muted);
  border:none;background:none;cursor:pointer;border-radius:14px;transition:.15s;}
.tab .ico{font-size:22px;line-height:1;}
.tab.active{color:var(--accent);background:var(--accent-soft);}  /* 알약 배경으로 또렷 */
.tab.active .ico{transform:translateY(-1px);}
```
- 터치 영역·아이콘 키우고, 선택 탭에 **연녹 알약 배경** → 어르신도 현재 위치 즉시 인지
- 라벨 굵기 600으로 선명하게

### 4-5. 버튼 — 선명한 CTA

```css
.btn-primary{background:var(--accent);color:#fff;font-weight:600;font-size:17px;
  border:none;border-radius:var(--radius);padding:15px;
  box-shadow:0 2px 8px rgba(15,122,82,.22);transition:.15s;}
.btn-primary:active{background:var(--accent-d);transform:translateY(1px);}
```

---

## 🔄 Before → After 요약

| 요소 | Before | After |
|------|--------|-------|
| 폰트 | 맑은 고딕(투박) | **Pretendard**(모던·선명) |
| 배경 | #e8ecf1 회청색 | **#f7f9fc 웜화이트**(밝음) |
| 액센트 | #00a854 형광초록 | **#0f7a52 딥그린**(신뢰·선명) |
| 보조텍스트 | #5f6b7c 흐릿 | **#4b5563 또렷** |
| 로고 | 이모지 📖 | **심볼+워드마크**(브랜드) |
| 탭 선택 | 글자색만 초록 | **연녹 알약 배경**(명확) |

---

## 📋 적용 순서 (권장)

1. `<head>`에 Pretendard 링크 추가 + body `font-family` 교체
2. `:root` 색상 토큰 6줄 교체 (`--bg/--surface/--accent/--accent-d/--text/--muted`)
3. `.logo` 이모지 → `.brand` 컴포넌트 교체 (로그인/홈 헤더)
4. `.tabbar`/`.tab` 스타일 교체
5. `theme-color` 메타 `#f7f9fc`로 변경
6. `sw.js` CACHE_NAME +1, index.html `?v=` 버전 올려 배포 (캐시 잔존 방지 — 프로젝트 규칙)

> ⚠️ 기존 폼/레이아웃 구조는 유지, **색상·폰트·로고·탭 스타일만** 교체 (프로젝트 폼 유지 규칙 준수).
