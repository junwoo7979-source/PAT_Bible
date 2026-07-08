// ibibles.net(개역한글 RHV)에서 지정 본문을 받아 파싱 → scripts/krv-fetched.json 생성.
// 출력 형식: [ [bookId, chapter, verse, text], ... ]
// ★ 원문 출처: ibibles.net (개역한글판). 공식 대한성서공회 본문 대조 검증 권장.
const fs = require('fs');
const path = require('path');

// [ibiblesBookCode, bookId, chapter, verseFrom, verseTo]
const TARGETS = [
  ['2ch','2CH',11,1,99],   // 구약 트랙 (07-06)
  ['2ch','2CH',12,1,99],
  ['act','ACT',16,16,40],  // 신약 트랙 (07-06)
  ['pro','PRO',1,1,99],    // 잠언 1장 (요청)
  ['pro','PRO',6,1,99],    // 잠언 트랙 (07-06)
  ['psa','PSA',6,1,99],    // 시편 트랙 (07-06)
  ['psa','PSA',9,1,99],    // 시편9 재검증(기존 손입력과 대조용)
];

function parse(html){
  const rows = [];
  const re = /<small>(\d+):(\d+)<\/small>\s*([\s\S]*?)<br>/g;
  let m;
  while((m = re.exec(html))){
    const ch = parseInt(m[1],10), v = parseInt(m[2],10);
    let text = m[3].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    // 시편 표제 "(다윗의 시 ...)" 접두 제거 → 본문만
    text = text.replace(/^\([^)]*\)\s*/, '');
    // ibibles 인용부호 표기 정리: 백틱=여는따옴표, 아포스트로피=닫는따옴표
    text = text.replace(/`/g, '“').replace(/'/g, '”');
    // 문장부호 앞의 불필요한 공백 제거 ( " !" → "!" )
    text = text.replace(/\s+([!?,.”])/g, '$1');
    text = text.replace(/\s+/g,' ').trim();
    rows.push([ch, v, text]);
  }
  return rows;
}

(async () => {
  const out = [];
  for(const [code, bookId, ch, vf, vt] of TARGETS){
    const url = `https://ibibles.net/quote.php?kor-${code}/${ch}:${vf}-${vt}`;
    const res = await fetch(url);
    const html = await res.text();
    const rows = parse(html);
    let n = 0;
    for(const [c, v, text] of rows){
      if(c!==ch) continue;
      if(v<vf || v>vt) continue;
      out.push([bookId, c, v, text]);
      n++;
    }
    console.log(`${bookId} ${ch}:${vf}-${vt} → ${n}절`);
  }
  fs.writeFileSync(path.join(__dirname,'krv-fetched.json'), JSON.stringify(out, null, 0), 'utf8');
  console.log('총 '+out.length+'절 → scripts/krv-fetched.json');
})();
