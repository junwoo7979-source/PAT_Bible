// 전체 개역한글(KRV, Public Domain) → app/data/bible/krv.json 생성.
// 원본: nehemiaharchives/bbl resources/bblpacks/krv.zip (개역한글 1961, Public Domain)
//   형식: krv.<책번호>.<장>.txt, 각 줄 "<절> <본문>". 책번호 1~66 = 정경 순서.
// 사용: SRC 환경변수로 추출 폴더 지정(기본 /tmp/krvpack/extracted).
//   node scripts/build-krv-full.cjs
const fs = require('fs');
const path = require('path');
const { PAT_BOOKS } = require(path.join(__dirname, '..', 'app', 'js', 'bible-passage.js'));

const SRC = process.env.SRC || '/tmp/krvpack/extracted';
if(!fs.existsSync(SRC)){
  console.error('원본 폴더 없음: '+SRC+'\n먼저 krv.zip 다운로드·압축해제 필요(README 참고).');
  process.exit(1);
}

// 책번호(1..66) → bookId (정경 순서 == PAT_BOOKS order)
const NUM2ID = {};
PAT_BOOKS.forEach(b => { NUM2ID[b.order] = b.id; });

const books = PAT_BOOKS.map(b => ({
  bookId: b.id, bookNameKo: b.ko, bookNameEn: b.en, testament: b.t, order: b.order
}));

const chapters = [];
const verses = [];
const chapterSeen = new Set();

const files = fs.readdirSync(SRC).filter(f => /^krv\.\d+\.\d+\.txt$/.test(f));
let skipped = 0;
for(const f of files){
  const m = f.match(/^krv\.(\d+)\.(\d+)\.txt$/);
  const bookNum = parseInt(m[1],10), ch = parseInt(m[2],10);
  const bookId = NUM2ID[bookNum];
  if(!bookId){ skipped++; continue; }
  const cid = bookId+'.'+ch;
  if(!chapterSeen.has(cid)){ chapterSeen.add(cid); chapters.push({chapterId:cid, bookId, chapterNumber:ch}); }
  const lines = fs.readFileSync(path.join(SRC,f),'utf8').split(/\r?\n/);
  let lastV = null;
  for(let line of lines){
    line = line.trim();
    if(!line) continue;
    const vm = line.match(/^(\d+)\s+([\s\S]+)$/);
    if(vm){
      const v = parseInt(vm[1],10);
      let text = vm[2].replace(/\s+/g,' ').trim();
      verses.push({ verseId: bookId+'.'+ch+'.'+v, bookId, chapterNumber:ch, verseNumber:v, text });
      lastV = verses[verses.length-1];
    } else if(lastV){
      // 절 번호 없는 줄(표제 등) → 직전 절에 이어붙임
      lastV.text = (lastV.text+' '+line).replace(/\s+/g,' ').trim();
    }
  }
}

// 정렬(책 순서 → 장 → 절)
const ORDER = {}; PAT_BOOKS.forEach(b=>ORDER[b.id]=b.order);
verses.sort((a,b)=> (ORDER[a.bookId]-ORDER[b.bookId]) || (a.chapterNumber-b.chapterNumber) || (a.verseNumber-b.verseNumber));
chapters.sort((a,b)=> (ORDER[a.bookId]-ORDER[b.bookId]) || (a.chapterNumber-b.chapterNumber));

const out = {
  version: 'krv-full-1961-pd-2026-07-10',
  translation: '개역한글',
  copyright: 'Public Domain',
  source: 'nehemiaharchives/bbl (krv.zip)',
  sample: false,
  books, chapters, verses
};

const dir = path.join(__dirname, '..', 'app', 'data', 'bible');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'krv.json'), JSON.stringify(out), 'utf8');
// 가벼운 버전 매니페스트 — 앱 실행 시 이것만 먼저 받아 재시딩 필요 여부 판단(7MB 매번 다운로드 방지)
fs.writeFileSync(path.join(dir, 'krv.version.json'), JSON.stringify({version: out.version, verses: verses.length}), 'utf8');
console.log('krv.json(전체): books='+books.length+' chapters='+chapters.length+' verses='+verses.length+(skipped?(' (skip '+skipped+')'):''));
console.log('krv.version.json 생성: '+out.version);
