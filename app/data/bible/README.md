# 개역한글(KRV) 성경 데이터

- **krv.json** — 전체 개역한글 66권 1,189장 31,103절 (약 7MB)
- **krv.version.json** — 가벼운 버전 매니페스트(앱이 이것만 먼저 받아 재시딩 여부 판단)

## 저작권
개역한글판(KRV, 1961)은 **Public Domain**(저작권 만료, 2012). 자유 사용 가능.

## 원본 출처
[nehemiaharchives/bbl](https://github.com/nehemiaharchives/bbl) 저장소의
`resources/bblpacks/krv.zip` (매니페스트: `"copyright":"Public Domain"`).

## 재생성 방법
```bash
# 1) 원본 zip 다운로드·압축해제
curl -sL "https://raw.githubusercontent.com/nehemiaharchives/bbl/HEAD/resources/bblpacks/krv.zip" -o /tmp/krv.zip
mkdir -p /tmp/krvpack/extracted && unzip -o /tmp/krv.zip -d /tmp/krvpack/extracted

# 2) krv.json + krv.version.json 생성
SRC=/tmp/krvpack/extracted node scripts/build-krv-full.cjs
```
데이터가 바뀌면 `build-krv-full.cjs`의 `version` 값을 올려야 기존 사용자 기기가 자동 재시딩한다.

## 검증
`node tests/bible-data.test.cjs` — 365일 × 4트랙 = 1,460개 참조 전부 본문 연결(누락 0) 확인.
