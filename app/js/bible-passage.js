// ====== PAT Bible — bible-passage.js ======
// 순수 로직: 성경 66권 표 + 읽기표 참조(ref) 파서.
// IndexedDB/브라우저 의존성 없음 → node 테스트로 그대로 검증 가능.
// window(브라우저)와 module.exports(테스트) 양쪽에 노출한다.

// 66권 정경 표: {id, abbr(한글약어), ko, en, testament, order}
// id = 영문 3~4자 코드(안정적 키). abbr = reading-plan.js(PAT_PLAN)의 약어와 동일.
const PAT_BOOKS = [
  {id:'GEN',abbr:'창',ko:'창세기',en:'Genesis',t:'OT'},
  {id:'EXO',abbr:'출',ko:'출애굽기',en:'Exodus',t:'OT'},
  {id:'LEV',abbr:'레',ko:'레위기',en:'Leviticus',t:'OT'},
  {id:'NUM',abbr:'민',ko:'민수기',en:'Numbers',t:'OT'},
  {id:'DEU',abbr:'신',ko:'신명기',en:'Deuteronomy',t:'OT'},
  {id:'JOS',abbr:'수',ko:'여호수아',en:'Joshua',t:'OT'},
  {id:'JDG',abbr:'삿',ko:'사사기',en:'Judges',t:'OT'},
  {id:'RUT',abbr:'룻',ko:'룻기',en:'Ruth',t:'OT'},
  {id:'1SA',abbr:'삼상',ko:'사무엘상',en:'1 Samuel',t:'OT'},
  {id:'2SA',abbr:'삼하',ko:'사무엘하',en:'2 Samuel',t:'OT'},
  {id:'1KI',abbr:'왕상',ko:'열왕기상',en:'1 Kings',t:'OT'},
  {id:'2KI',abbr:'왕하',ko:'열왕기하',en:'2 Kings',t:'OT'},
  {id:'1CH',abbr:'대상',ko:'역대상',en:'1 Chronicles',t:'OT'},
  {id:'2CH',abbr:'대하',ko:'역대하',en:'2 Chronicles',t:'OT'},
  {id:'EZR',abbr:'스',ko:'에스라',en:'Ezra',t:'OT'},
  {id:'NEH',abbr:'느',ko:'느헤미야',en:'Nehemiah',t:'OT'},
  {id:'EST',abbr:'에',ko:'에스더',en:'Esther',t:'OT'},
  {id:'JOB',abbr:'욥',ko:'욥기',en:'Job',t:'OT'},
  {id:'PSA',abbr:'시',ko:'시편',en:'Psalms',t:'OT'},
  {id:'PRO',abbr:'잠',ko:'잠언',en:'Proverbs',t:'OT'},
  {id:'ECC',abbr:'전',ko:'전도서',en:'Ecclesiastes',t:'OT'},
  {id:'SNG',abbr:'아',ko:'아가',en:'Song of Songs',t:'OT'},
  {id:'ISA',abbr:'사',ko:'이사야',en:'Isaiah',t:'OT'},
  {id:'JER',abbr:'렘',ko:'예레미야',en:'Jeremiah',t:'OT'},
  {id:'LAM',abbr:'애',ko:'예레미야애가',en:'Lamentations',t:'OT'},
  {id:'EZK',abbr:'겔',ko:'에스겔',en:'Ezekiel',t:'OT'},
  {id:'DAN',abbr:'단',ko:'다니엘',en:'Daniel',t:'OT'},
  {id:'HOS',abbr:'호',ko:'호세아',en:'Hosea',t:'OT'},
  {id:'JOL',abbr:'욜',ko:'요엘',en:'Joel',t:'OT'},
  {id:'AMO',abbr:'암',ko:'아모스',en:'Amos',t:'OT'},
  {id:'OBA',abbr:'옵',ko:'오바댜',en:'Obadiah',t:'OT'},
  {id:'JON',abbr:'욘',ko:'요나',en:'Jonah',t:'OT'},
  {id:'MIC',abbr:'미',ko:'미가',en:'Micah',t:'OT'},
  {id:'NAM',abbr:'나',ko:'나훔',en:'Nahum',t:'OT'},
  {id:'HAB',abbr:'합',ko:'하박국',en:'Habakkuk',t:'OT'},
  {id:'ZEP',abbr:'습',ko:'스바냐',en:'Zephaniah',t:'OT'},
  {id:'HAG',abbr:'학',ko:'학개',en:'Haggai',t:'OT'},
  {id:'ZEC',abbr:'슥',ko:'스가랴',en:'Zechariah',t:'OT'},
  {id:'MAL',abbr:'말',ko:'말라기',en:'Malachi',t:'OT'},
  {id:'MAT',abbr:'마',ko:'마태복음',en:'Matthew',t:'NT'},
  {id:'MRK',abbr:'막',ko:'마가복음',en:'Mark',t:'NT'},
  {id:'LUK',abbr:'눅',ko:'누가복음',en:'Luke',t:'NT'},
  {id:'JHN',abbr:'요',ko:'요한복음',en:'John',t:'NT'},
  {id:'ACT',abbr:'행',ko:'사도행전',en:'Acts',t:'NT'},
  {id:'ROM',abbr:'롬',ko:'로마서',en:'Romans',t:'NT'},
  {id:'1CO',abbr:'고전',ko:'고린도전서',en:'1 Corinthians',t:'NT'},
  {id:'2CO',abbr:'고후',ko:'고린도후서',en:'2 Corinthians',t:'NT'},
  {id:'GAL',abbr:'갈',ko:'갈라디아서',en:'Galatians',t:'NT'},
  {id:'EPH',abbr:'엡',ko:'에베소서',en:'Ephesians',t:'NT'},
  {id:'PHP',abbr:'빌',ko:'빌립보서',en:'Philippians',t:'NT'},
  {id:'COL',abbr:'골',ko:'골로새서',en:'Colossians',t:'NT'},
  {id:'1TH',abbr:'살전',ko:'데살로니가전서',en:'1 Thessalonians',t:'NT'},
  {id:'2TH',abbr:'살후',ko:'데살로니가후서',en:'2 Thessalonians',t:'NT'},
  {id:'1TI',abbr:'딤전',ko:'디모데전서',en:'1 Timothy',t:'NT'},
  {id:'2TI',abbr:'딤후',ko:'디모데후서',en:'2 Timothy',t:'NT'},
  {id:'TIT',abbr:'딛',ko:'디도서',en:'Titus',t:'NT'},
  {id:'PHM',abbr:'몬',ko:'빌레몬서',en:'Philemon',t:'NT'},
  {id:'HEB',abbr:'히',ko:'히브리서',en:'Hebrews',t:'NT'},
  {id:'JAS',abbr:'약',ko:'야고보서',en:'James',t:'NT'},
  {id:'1PE',abbr:'벧전',ko:'베드로전서',en:'1 Peter',t:'NT'},
  {id:'2PE',abbr:'벧후',ko:'베드로후서',en:'2 Peter',t:'NT'},
  {id:'1JN',abbr:'요일',ko:'요한일서',en:'1 John',t:'NT'},
  {id:'2JN',abbr:'요이',ko:'요한이서',en:'2 John',t:'NT'},
  {id:'3JN',abbr:'요삼',ko:'요한삼서',en:'3 John',t:'NT'},
  {id:'JUD',abbr:'유',ko:'유다서',en:'Jude',t:'NT'},
  {id:'REV',abbr:'계',ko:'요한계시록',en:'Revelation',t:'NT'}
].map((b,i)=>({...b, order:i+1}));

const _ABBR2BOOK = {};
const _ID2BOOK = {};
PAT_BOOKS.forEach(b=>{ _ABBR2BOOK[b.abbr]=b; _ID2BOOK[b.id]=b; });

function bookByAbbr(abbr){ return _ABBR2BOOK[abbr] || null; }
function bookById(id){ return _ID2BOOK[id] || null; }

// "1~2" | "5:1~26" | "27:32~66" | "18:1~24" | "6" | "9~10" | "37:1~18"
// → {startCh,startV,endCh,endV}  (V가 null이면 해당 장 전체)
function parseChapterSpec(spec){
  spec = String(spec||'').trim().replace(/\s+/g,'');
  if(!spec) return null;
  const [a,b] = spec.split('~');            // 시작 ~ 끝
  const startCh_V = _splitChV(a);
  let endCh_V;
  if(b===undefined){                        // 범위 아님 (단일 장 or 단일 절)
    endCh_V = { ch: startCh_V.ch, v: startCh_V.v };
  } else if(b.indexOf(':')>=0){             // "27:32~28:5" 형태(장 넘어감)
    endCh_V = _splitChV(b);
  } else if(startCh_V.v!=null){             // "5:1~26" → 같은 장 안의 끝절
    endCh_V = { ch: startCh_V.ch, v: parseInt(b,10) };
  } else {                                  // "1~2" → 장 범위(전체 절)
    endCh_V = { ch: parseInt(b,10), v: null };
  }
  return {
    startCh: startCh_V.ch, startV: startCh_V.v,
    endCh: endCh_V.ch,     endV: endCh_V.v
  };
}
function _splitChV(s){
  const i = String(s).indexOf(':');
  if(i<0) return { ch: parseInt(s,10), v: null };
  return { ch: parseInt(s.slice(0,i),10), v: parseInt(s.slice(i+1),10) };
}

// 트랙(si/ot/nt/pr) + 원본값 → {book, spec:{...}}  또는 null
// si=시편(PSA), pr=잠언(PRO)는 값이 장/절만. ot/nt는 "약어 장절".
function parseRef(track, raw){
  raw = String(raw||'').trim();
  if(!raw) return null;
  let book, spec;
  if(track==='si'){ book=bookByAbbr('시'); spec=parseChapterSpec(raw); }
  else if(track==='pr'){ book=bookByAbbr('잠'); spec=parseChapterSpec(raw); }
  else {
    const sp = raw.indexOf(' ');
    if(sp<0){ book=bookByAbbr(raw); spec=null; }   // 약어만
    else { book=bookByAbbr(raw.slice(0,sp)); spec=parseChapterSpec(raw.slice(sp+1)); }
  }
  if(!book) return null;
  return { bookId: book.id, book, spec };
}

// spec 범위에 해당하는 (bookId,chapter,verse) 절이 포함되는지 판정 (필터용)
function verseInSpec(spec, ch, v){
  if(!spec) return true;
  const { startCh, startV, endCh, endV } = spec;
  if(ch < startCh || ch > endCh) return false;
  if(ch===startCh && startV!=null && v < startV) return false;
  if(ch===endCh && endV!=null && v > endV) return false;
  return true;
}

// 범위에 포함되는 장 번호 배열 (조회 최적화용)
function chaptersInSpec(spec){
  if(!spec) return null;                    // 전체(약어만) → 호출측이 책 전체 조회
  const out=[];
  for(let c=spec.startCh; c<=spec.endCh; c++) out.push(c);
  return out;
}

const _API = { PAT_BOOKS, bookByAbbr, bookById, parseChapterSpec, parseRef, verseInSpec, chaptersInSpec };
if(typeof window!=='undefined'){ Object.assign(window, _API); window.PAT_BOOKS=PAT_BOOKS; }
if(typeof module!=='undefined' && module.exports){ module.exports=_API; }
