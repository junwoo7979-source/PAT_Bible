// 샘플 krv.json 생성기 — books는 정경표(bible-passage.js)와 일치, 본문은 확신하는 절만.
// 전체 성경 도입 시: 아래 SAMPLE_VERSES 대신 라이선스 확보한 전체 데이터로 교체 후 재실행.
const fs = require('fs');
const path = require('path');
const { PAT_BOOKS } = require(path.join(__dirname, '..', 'app', 'js', 'bible-passage.js'));

// [bookId, chapter, verse, text]  — 개역한글, 검증된 대표 구절 샘플
const SAMPLE_VERSES = [
  ['GEN',1,1,'태초에 하나님이 천지를 창조하시니라'],
  ['GEN',1,2,'땅이 혼돈하고 공허하며 흑암이 깊음 위에 있고 하나님의 신은 수면에 운행하시니라'],
  ['GEN',1,3,'하나님이 가라사대 빛이 있으라 하시매 빛이 있었고'],
  ['GEN',1,4,'그 빛이 하나님의 보시기에 좋았더라 하나님이 빛과 어두움을 나누사'],
  ['GEN',1,5,'하나님이 빛을 낮이라 칭하시고 어두움을 밤이라 칭하시니라 저녁이 되며 아침이 되니 이는 첫째 날이니라'],
  ['PSA',1,1,'복 있는 사람은 악인의 꾀를 좇지 아니하며 죄인의 길에 서지 아니하며 오만한 자의 자리에 앉지 아니하고'],
  ['PSA',1,2,'오직 여호와의 율법을 즐거워하여 그 율법을 주야로 묵상하는 자로다'],
  ['PSA',1,3,'저는 시냇가에 심은 나무가 시절을 좇아 과실을 맺으며 그 잎사귀가 마르지 아니함 같으니 그 행사가 다 형통하리로다'],
  ['PSA',1,4,'악인은 그렇지 않음이여 오직 바람에 나는 겨와 같도다'],
  ['PSA',1,5,'그러므로 악인이 심판을 견디지 못하며 죄인이 의인의 회중에 들지 못하리로다'],
  ['PSA',1,6,'대저 의인의 길은 여호와께서 인정하시나 악인의 길은 망하리로다'],
  ['PSA',23,1,'여호와는 나의 목자시니 내가 부족함이 없으리로다'],
  ['PSA',23,2,'그가 나를 푸른 초장에 누이시며 쉴만한 물 가으로 인도하시는도다'],
  ['PSA',23,3,'내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다'],
  ['PSA',23,4,'내가 사망의 음침한 골짜기로 다닐지라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라 주의 지팡이와 막대기가 나를 안위하시나이다'],
  ['PSA',23,5,'주께서 내 원수의 목전에서 내게 상을 베푸시고 기름으로 내 머리에 바르셨으니 내 잔이 넘치나이다'],
  ['PSA',23,6,'나의 평생에 선하심과 인자하심이 정녕 나를 따르리니 내가 여호와의 집에 영원히 거하리로다'],
  ['PRO',1,1,'다윗의 아들 이스라엘 왕 솔로몬의 잠언이라'],
  ['PRO',1,2,'이는 지혜와 훈계를 알게 하며 명철의 말씀을 깨닫게 하며'],
  ['PRO',1,3,'지혜롭게, 의롭게, 공평하게, 정직하게, 행할 일에 대하여 훈계를 받게 하며'],
  ['PRO',1,4,'어리석은 자로 슬기롭게 하며 젊은 자에게 지식과 근신함을 주기 위한 것이니'],
  ['PRO',1,5,'지혜있는 자는 듣고 학식이 더할 것이요 명철한 자는 모략을 얻을 것이라'],
  ['PRO',1,6,'잠언과 비유와 지혜있는 자의 말과 그 오묘한 말을 깨달으리라'],
  ['PRO',1,7,'여호와를 경외하는 것이 지식의 근본이어늘 미련한 자는 지혜와 훈계를 멸시하느니라'],
  ['MAT',1,1,'아브라함과 다윗의 자손 예수 그리스도의 세계라'],
  ['JHN',3,16,'하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라']
];

const books = PAT_BOOKS.map(b => ({
  bookId: b.id, bookNameKo: b.ko, bookNameEn: b.en, testament: b.t, order: b.order
}));

const chapterSet = new Set();
const verses = SAMPLE_VERSES.map(([bookId, ch, v, text]) => {
  chapterSet.add(bookId + '.' + ch);
  return { verseId: bookId+'.'+ch+'.'+v, bookId, chapterNumber: ch, verseNumber: v, text };
});
const chapters = [...chapterSet].map(cid => {
  const [bookId, ch] = cid.split('.');
  return { chapterId: cid, bookId, chapterNumber: parseInt(ch,10) };
});

const out = {
  version: 'krv-sample-2026-07-09',
  translation: '개역한글',
  sample: true,
  note: '샘플 데이터입니다. 라이선스 확보한 전체 개역한글 데이터로 verses/chapters 를 교체 후 version 을 올리면 전 성경이 동작합니다.',
  books, chapters, verses
};

const dir = path.join(__dirname, '..', 'app', 'data', 'bible');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'krv.json'), JSON.stringify(out, null, 0), 'utf8');
console.log('krv.json 생성: books='+books.length+' chapters='+chapters.length+' verses='+verses.length);
