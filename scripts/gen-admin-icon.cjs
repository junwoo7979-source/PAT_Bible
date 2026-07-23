// 관리자 앱 아이콘 생성 — SVG → PNG(192/512) + maskable 안전영역 준수.
// 실행: node scripts/gen-admin-icon.cjs  (sharp 필요)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'app', 'icons');

// 짙은 남색 배경 + 금색 방패 + 톱니/자물쇠 — 일반 사용자 앱(밝은 파랑/핑크)과 명확히 구분.
// maskable 대응: 핵심 도형을 중앙 약 62% 안전영역 안에 배치.
function svg(size) {
  const s = size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e293b"/>
      <stop offset="1" stop-color="#0b1220"/>
    </linearGradient>
    <linearGradient id="shield" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fcd34d"/>
      <stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- 방패 (중앙 안전영역 내) -->
  <path d="M256 116 L372 156 L372 268 C372 340 320 388 256 412 C192 388 140 340 140 268 L140 156 Z"
        fill="url(#shield)"/>
  <path d="M256 116 L372 156 L372 268 C372 340 320 388 256 412 C192 388 140 340 140 268 L140 156 Z"
        fill="none" stroke="#7c5a10" stroke-width="6" opacity="0.35"/>
  <!-- 자물쇠 (방패 위) -->
  <g fill="#1e293b">
    <rect x="214" y="248" width="84" height="72" rx="14"/>
    <path d="M228 248 v-20 a28 28 0 0 1 56 0 v20" fill="none" stroke="#1e293b" stroke-width="16"/>
    <circle cx="256" cy="278" r="12"/>
    <rect x="250" y="284" width="12" height="22" rx="6"/>
  </g>
</svg>`;
}

async function main() {
  // maskable/any 겸용 512, 192
  await sharp(Buffer.from(svg(512))).png().toFile(path.join(OUT, 'admin-icon-512.png'));
  await sharp(Buffer.from(svg(192))).png().toFile(path.join(OUT, 'admin-icon-192.png'));
  // 원본 SVG도 보관
  fs.writeFileSync(path.join(OUT, 'admin-icon.svg'), svg(512));
  console.log('admin icons generated: admin-icon-{192,512}.png, admin-icon.svg');
}
main().catch((e) => { console.error(e); process.exit(1); });
