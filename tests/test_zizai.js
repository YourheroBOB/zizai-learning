/**
 * test_zizai.js
 * 「字在」學習系統可重現自動化邏輯測試套件
 * 
 * 測試涵蓋範圍（Prompt 要求八大向度）：
 * 1. 週次計算（開學日推算目前第幾週）
 * 2. 手動覆寫（家長覆寫老師實際教學進度）
 * 3. 抽題不越界（只在已教／指定課次範圍內抽題）
 * 4. 不重複抽題（同一份卷子生字／語詞不重複出現）
 * 5. 詞語多格答案（兩字或三字詞語各格注音與國字對齊）
 * 6. 注音呈現（直排注音欄位在字格右側、二三四聲調號位置、輕聲點置頂）
 * 7. 列印答案隱藏（學生卷空白田字格、答案卷顯示紅字答案）
 * 8. 教材資料驗證（schema 驗證：生字、注音、部首、筆畫、詞語、官方連結）
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 載入注音模組
const TPZhuyin = require('../src/zhuyin.js');

let passedTests = 0;
let failedTests = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

console.log('====================================================');
console.log('   「字在」國語生字學習系統 — 全量邏輯驗證套件');
console.log('====================================================\n');

// -------------------------------------------------------------
// 測試 1：週次推算邏輯
// -------------------------------------------------------------
console.log('【模組 1】週次計算邏輯（開學日與日期推算）');

function calcWeek(semesterStartStr, targetDateStr) {
  const start = new Date(semesterStartStr + 'T00:00:00+08:00');
  const cur = new Date(targetDateStr + 'T00:00:00+08:00');
  const msDiff = cur.getTime() - start.getTime();
  if (msDiff < 0) return { week: 0, state: 'before-start' };
  const week = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;
  const maxWeeks = 20;
  if (week > maxWeeks) return { week: maxWeeks + 1, state: 'after-end' };
  return { week, state: 'in-semester' };
}

it('開學第一天應為第 1 週', () => {
  const res = calcWeek('2026-08-31', '2026-08-31');
  assert.strictEqual(res.week, 1);
  assert.strictEqual(res.state, 'in-semester');
});

it('開學第 7 天（9/7）應進入第 2 週', () => {
  const res = calcWeek('2026-08-31', '2026-09-07');
  assert.strictEqual(res.week, 2);
  assert.strictEqual(res.state, 'in-semester');
});

it('開學第 21 天（9/21）應為第 4 週', () => {
  const res = calcWeek('2026-08-31', '2026-09-21');
  assert.strictEqual(res.week, 4);
  assert.strictEqual(res.state, 'in-semester');
});

it('開學前日期應回報 before-start', () => {
  const res = calcWeek('2026-08-31', '2026-08-20');
  assert.strictEqual(res.state, 'before-start');
});

// -------------------------------------------------------------
// 測試 2：手動覆寫教學進度
// -------------------------------------------------------------
console.log('\n【模組 2】手動覆寫機制（家長指定進度優先）');

function resolveLessonProgress(estimatedWeek, manualLesson, totalLessons = 12) {
  if (manualLesson !== null && manualLesson !== undefined) {
    const clamped = Math.max(1, Math.min(totalLessons, manualLesson));
    return {
      currentLesson: clamped,
      isManual: true,
      completedLessons: clamped - 1
    };
  }
  // 預估進度：約每 1.5 週一課
  const estimated = Math.max(1, Math.min(totalLessons, Math.round(estimatedWeek / 1.5)));
  return {
    currentLesson: estimated,
    isManual: false,
    completedLessons: Math.max(0, estimated - 1)
  };
}

it('家長手動設定第 3 課時，無論日期為何皆應回傳第 3 課', () => {
  const res = resolveLessonProgress(8, 3, 12);
  assert.strictEqual(res.currentLesson, 3);
  assert.strictEqual(res.isManual, true);
  assert.strictEqual(res.completedLessons, 2);
});

it('未手動設定時，應根據週次自動推算預估課次', () => {
  const res = resolveLessonProgress(3, null, 12);
  assert.strictEqual(res.currentLesson, 2); // 3 / 1.5 = 2
  assert.strictEqual(res.isManual, false);
});

it('手動設定超出邊界時應正確 clamp 在 [1, totalLessons]', () => {
  const resTooHigh = resolveLessonProgress(1, 99, 12);
  assert.strictEqual(resTooHigh.currentLesson, 12);
  const resTooLow = resolveLessonProgress(1, -5, 12);
  assert.strictEqual(resTooLow.currentLesson, 1);
});

// -------------------------------------------------------------
// 測試 3：抽題邊界（絕不抽出未學課次）
// -------------------------------------------------------------
console.log('\n【模組 3】抽題邊界驗證（抽題不越界）');

function sampleQuestions(pool, maxLessonNo, count) {
  // 過濾在 maxLessonNo 內的項目
  const validPool = pool.filter((item) => item.lessonNo <= maxLessonNo);
  if (validPool.length === 0) return [];
  // 複製並隨機抽樣
  const shuffled = validPool.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

const mockQuestions = [
  { id: '1-1', lessonNo: 1, target: '希望' },
  { id: '1-2', lessonNo: 1, target: '座位' },
  { id: '2-1', lessonNo: 2, target: '早餐' },
  { id: '3-1', lessonNo: 3, target: '航行' },
  { id: '4-1', lessonNo: 4, target: '消失' },
  { id: '5-1', lessonNo: 5, target: '禮貌' }
];

it('指定進度第 2 課時，抽出的題目課次絕對不能大於 2', () => {
  for (let i = 0; i < 20; i++) {
    const sampled = sampleQuestions(mockQuestions, 2, 4);
    sampled.forEach((q) => {
      assert(q.lessonNo <= 2, `抽題越界！題目 ${q.target} 來自第 ${q.lessonNo} 課`);
    });
  }
});

// -------------------------------------------------------------
// 測試 4：不重複抽題
// -------------------------------------------------------------
console.log('\n【模組 4】不重複抽題驗證');

function sampleDistinctQuestions(pool, count) {
  const seenTargets = new Set();
  const result = [];
  const shuffled = pool.slice().sort(() => 0.5 - Math.random());
  for (const q of shuffled) {
    if (!seenTargets.has(q.target)) {
      seenTargets.add(q.target);
      result.push(q);
      if (result.length >= count) break;
    }
  }
  return result;
}

it('抽出的題目清單目標詞/字不得有重複項', () => {
  const testPool = [
    { target: '希望' }, { target: '希望' },
    { target: '航行' }, { target: '航行' },
    { target: '早餐' }, { target: '吐司' },
    { target: '消失' }, { target: '溫暖' }
  ];
  const sampled = sampleDistinctQuestions(testPool, 5);
  const targets = sampled.map((s) => s.target);
  const uniqueTargets = Array.from(new Set(targets));
  assert.strictEqual(targets.length, uniqueTargets.length);
});

// -------------------------------------------------------------
// 測試 5：詞語多格答案（完整詞語多格填空）
// -------------------------------------------------------------
console.log('\n【模組 5】完整詞語多格填空結構驗證');

it('多字詞語（如「航行」）應產出對應數量的字格與各自右側直式注音', () => {
  const wordEl = TPZhuyin.word('航行', ['ㄏㄤˊ', 'ㄒㄧㄥˊ'], { size: 'print', blank: true });
  assert.strictEqual(wordEl.className, 'tpz-group tpz--print');
  assert.strictEqual(wordEl.children.length, 2, '「航行」應產出 2 個字格包裝');

  // 第一格「航」
  const wrap1 = wordEl.children[0];
  assert.strictEqual(wrap1.className, 'tpz-wrap tpz--print');
  const cell1 = wrap1.children[0];
  assert(cell1.className.includes('tpz-cell--blank'));
  const col1 = wrap1.children[1];
  assert(col1.className.includes('tpz-col'));

  // 驗證第一格注音為 ㄏ ㄤ ˊ
  const tone1 = col1.children[1].children[0]; // ㄤ 上的調號
  assert.strictEqual(tone1.textContent, 'ˊ');

  // 第二格「行」
  const wrap2 = wordEl.children[1];
  const col2 = wrap2.children[1];
  const tone2 = col2.children[2].children[0]; // ㄥ 上的調號
  assert.strictEqual(tone2.textContent, 'ˊ');
});

// -------------------------------------------------------------
// 測試 6：注音呈現與調號定位
// -------------------------------------------------------------
console.log('\n【模組 6】注音符號與調號定位精確性');

it('輕聲調號（˙）必須置於整欄注音最上方中央', () => {
  const parsed = TPZhuyin.splitSyllable('˙ㄕ');
  assert.strictEqual(parsed.tone, '˙');
  assert.deepStrictEqual(parsed.symbols, ['ㄕ']);

  const cellEl = TPZhuyin.cell('的', '˙ㄉㄜ', { blank: false });
  const col = cellEl.children[1];
  const firstChild = col.children[0];
  assert(firstChild.className.includes('tpz-col__tone--light'), '輕聲應使用 light class 置頂');
  assert.strictEqual(firstChild.textContent, '˙');
});

it('二聲、三聲、四聲調號必須位於最後一個注音符號右上方', () => {
  const parsed2 = TPZhuyin.splitSyllable('ㄏㄤˊ');
  assert.strictEqual(parsed2.tone, 'ˊ');
  assert.deepStrictEqual(parsed2.symbols, ['ㄏ', 'ㄤ']);

  const cellEl = TPZhuyin.cell('航', 'ㄏㄤˊ');
  const col = cellEl.children[1];
  const lastSym = col.children[col.children.length - 1];
  assert.strictEqual(lastSym.textContent, 'ㄤˊ'); // textContent 包含符號與掛在上面的調號
  const toneEl = lastSym.children[0];
  assert(toneEl.className.includes('tpz-col__tone'));
  assert.strictEqual(toneEl.textContent, 'ˊ');
});

it('一聲（陰平）無調號標記', () => {
  const parsed1 = TPZhuyin.splitSyllable('ㄕㄨ');
  assert.strictEqual(parsed1.tone, null);
  assert.deepStrictEqual(parsed1.symbols, ['ㄕ', 'ㄨ']);

  const cellEl = TPZhuyin.cell('書', 'ㄕㄨ');
  const col = cellEl.children[1];
  const tones = col.children.filter((c) => c.children && c.children.length > 0);
  assert.strictEqual(tones.length, 0, '一聲不應有調號元素');
});

// -------------------------------------------------------------
// 測試 7：列印答案隱藏 vs 答案卷解答顯示
// -------------------------------------------------------------
console.log('\n【模組 7】學生卷空白作答 vs 答案卷朱砂紅字');

it('學生卷句子挖空時，國字格必須為 blank 狀態，且不透露國字答案', () => {
  const sentEl = TPZhuyin.sentence(
    '輪船在海上航行，汽笛聲好響。',
    [{ word: '航行', bopomofoArray: ['ㄏㄤˊ', 'ㄒㄧㄥˊ'] }],
    { blank: true }
  );
  // 找出挖空部分
  const group = sentEl.children.find((c) => c.className && c.className.includes('tpz-group'));
  assert(group, '句子中必須含有挖空的字格群組');
  group.children.forEach((wrap) => {
    const cell = wrap.children[0];
    assert(cell.className.includes('tpz-cell--blank'));
    const charEl = cell.children.find((c) => c.className && c.className.includes('tpz-cell__char'));
    assert.strictEqual(charEl.textContent, '□', '學生卷田字格內應顯示空白提示方框');
  });
});

it('答案卷渲染時，字格必須為 answer 狀態並正確顯示國字解答', () => {
  const sentAns = TPZhuyin.sentence(
    '輪船在海上航行，汽笛聲好響。',
    [{ word: '航行', bopomofoArray: ['ㄏㄤˊ', 'ㄒㄧㄥˊ'] }],
    { blank: false, status: 'answer' }
  );
  const group = sentAns.children.find((c) => c.className && c.className.includes('tpz-group'));
  assert(group, '答案卷句子中必須含有字格群組');
  
  const cell1 = group.children[0].children[0];
  assert(cell1.className.includes('tpz-cell--answer'));
  const char1 = cell1.children.find((c) => c.className && c.className.includes('tpz-cell__char'));
  assert.strictEqual(char1.textContent, '航', '答案卷第一格應顯示解答「航」');

  const cell2 = group.children[1].children[0];
  assert(cell2.className.includes('tpz-cell--answer'));
  const char2 = cell2.children.find((c) => c.className && c.className.includes('tpz-cell__char'));
  assert.strictEqual(char2.textContent, '行', '答案卷第二格應顯示解答「行」');
});

// -------------------------------------------------------------
// 測試 8：教材資料 Schema 與合規性驗證
// -------------------------------------------------------------
console.log('\n【模組 8】教材資料 Schema 與合規查核');

it('115-1 官方教材資料集必須通過欄位與來源合規查驗', () => {
  const p = path.join(__dirname, '../data/curriculum-115-1.json');
  assert(fs.existsSync(p), 'curriculum-115-1.json 檔案必須存在');
  const d = JSON.parse(fs.readFileSync(p, 'utf-8'));

  assert.strictEqual(d.meta.academicYear, 115);
  assert.strictEqual(d.meta.semesterCode, '2a');
  assert.strictEqual(d.meta.sourceType, 'official_curriculum');
  assert(d.meta.licenseNotes.length > 10, '必須具備版權與合理使用宣告');

  const pubs = ['kangxuan', 'nanyi', 'hanlin'];
  pubs.forEach((pub) => {
    assert(d.publishers[pub], `必須包含出版社 ${pub}`);
    const lessons = d.publishers[pub].lessons;
    assert.strictEqual(lessons.length, 12, `${pub} 應有 12 課資料`);

    lessons.forEach((l) => {
      assert(l.lessonNo > 0, '課次編號必須大於 0');
      assert(l.title.length > 0, '必須有名稱');
      assert(l.characters.length > 0, '每課必須有生字');
      l.characters.forEach((c) => {
        assert.strictEqual(c.char.length, 1, `生字長度應為 1: ${c.char}`);
        assert(c.bopomofo.length > 0, `生字 ${c.char} 必須有注音`);
        assert(c.strokes > 0, `生字 ${c.char} 筆畫必須大於 0`);
        assert(c.moeDictUrl.includes('dict.concised.moe.edu.tw'), `必須具備教育部簡編字典連結`);
      });
      assert(l.words.length > 0, '每課必須有詞彙');
      l.words.forEach((w) => {
        assert(w.bopomofoArray.length > 0, `詞語 ${w.word} 必須有逐字注音陣列`);
      });
    });
  });
});

it('自編體驗資料集必須明確標註為 demo_exercise，嚴禁混充正式教材', () => {
  const p = path.join(__dirname, '../data/curriculum-demo.json');
  assert(fs.existsSync(p), 'curriculum-demo.json 必須存在');
  const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
  assert.strictEqual(d.meta.sourceType, 'demo_exercise');
  assert(d.meta.editionNote.includes('自編'), '自編版必須在 editionNote 明示自編');
  assert.strictEqual(d.themes.length, 12, '體驗版應有 12 個主題');
});

it('115-1 詞語與例句的逐字注音陣列長度必須等於字數且不得有空白音節（不得截斷）', () => {
  const p = path.join(__dirname, '../data/curriculum-115-1.json');
  const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const bad = [];
  Object.keys(d.publishers).forEach((pub) => {
    d.publishers[pub].lessons.forEach((l) => {
      l.words.forEach((w) => {
        const n = Array.from(w.word).length;
        if (w.bopomofoArray.length !== n || w.bopomofoArray.some((z) => !z.trim())) {
          bad.push(`${pub} L${l.lessonNo} 詞「${w.word}」字數 ${n} 注音 ${w.bopomofoArray.length}`);
        }
      });
      (l.sentences || []).forEach((s) => {
        const n = Array.from(s.target).length;
        if (s.bopomofoArray.length !== n || s.bopomofoArray.some((z) => !z.trim())) {
          bad.push(`${pub} L${l.lessonNo} 例句目標「${s.target}」字數 ${n} 注音 ${s.bopomofoArray.length}`);
        }
      });
    });
  });
  assert.strictEqual(bad.length, 0, `共 ${bad.length} 筆注音陣列被截斷：${bad.slice(0, 5).join('；')}`);
});

it('官方連結不得使用已失效（404）的舊網址前綴，且生字須採官方 SearchAction 新格式', () => {
  const OLD_DICT = 'https://dict.concised.moe.edu.tw/searchResult/searchResult.jsp?dt=Q&word=';
  const OLD_STROKE = 'https://stroke-order.learningweb.moe.edu.tw/characterSearchResult.do?lang=zh_TW&searchType=1&word=';
  const NEW_DICT = 'https://dict.concised.moe.edu.tw/search.jsp?md=1&word=';
  const NEW_STROKE = 'https://stroke-order.learningweb.moe.edu.tw/searchW.jsp?WORD=';

  const files = ['../data/curriculum-115-1.json', '../data/curriculum-110.json', '../src/app.js'];
  files.forEach((rel) => {
    const txt = fs.readFileSync(path.join(__dirname, rel), 'utf-8');
    assert(!txt.includes(OLD_DICT), `${rel} 仍含失效的國語辭典舊網址前綴`);
    assert(!txt.includes(OLD_STROKE), `${rel} 仍含失效的筆順學習網舊網址前綴`);
  });

  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/curriculum-115-1.json'), 'utf-8'));
  const bad = [];
  let total = 0;
  Object.keys(d.publishers).forEach((pub) => {
    d.publishers[pub].lessons.forEach((l) => {
      l.characters.forEach((c) => {
        total++;
        if (!c.moeDictUrl.startsWith(NEW_DICT)) bad.push(`${pub} L${l.lessonNo} 「${c.char}」moeDictUrl=${c.moeDictUrl}`);
        if (!c.moeStrokeUrl.startsWith(NEW_STROKE)) bad.push(`${pub} L${l.lessonNo} 「${c.char}」moeStrokeUrl=${c.moeStrokeUrl}`);
      });
    });
  });
  assert(total > 0, '115-1 必須有生字資料可供檢查');
  assert.strictEqual(bad.length, 0, `共 ${bad.length} 筆生字連結未採新前綴：${bad.slice(0, 3).join('；')}`);
});

it('115-1 所有 words／characters 的 def 不得前後半重複（同一段解釋貼兩次）', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/curriculum-115-1.json'), 'utf-8'));
  // 去頭尾空白後，若能在某個半形或全形空白處切成完全相同的兩半，即視為重複
  const isDoubled = (def) => {
    const t = String(def).trim();
    for (let i = 1; i < t.length - 1; i++) {
      if (t[i] === ' ' || t[i] === '　') {
        const a = t.slice(0, i).trim();
        const b = t.slice(i + 1).trim();
        if (a.length > 0 && a === b) return true;
      }
    }
    return false;
  };
  const bad = [];
  let total = 0;
  Object.keys(d.publishers).forEach((pub) => {
    d.publishers[pub].lessons.forEach((l) => {
      l.words.forEach((w) => {
        total++;
        if (isDoubled(w.def)) bad.push(`${pub} L${l.lessonNo} 詞「${w.word}」`);
      });
      l.characters.forEach((c) => {
        total++;
        if (isDoubled(c.def)) bad.push(`${pub} L${l.lessonNo} 字「${c.char}」`);
      });
    });
  });
  assert(total > 0, '115-1 必須有詞語與生字資料可供檢查');
  assert.strictEqual(bad.length, 0, `共 ${bad.length} 筆 def 前後半重複：${bad.slice(0, 3).join('；')}`);
});

it('115-1 所有 words 的整串注音 bopomofo 必須等於 bopomofoArray 以空白連接', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/curriculum-115-1.json'), 'utf-8'));
  const bad = [];
  let total = 0;
  Object.keys(d.publishers).forEach((pub) => {
    d.publishers[pub].lessons.forEach((l) => {
      l.words.forEach((w) => {
        total++;
        if (w.bopomofo !== w.bopomofoArray.join(' ')) bad.push(`${pub} L${l.lessonNo} 詞「${w.word}」bopomofo=「${w.bopomofo}」`);
      });
    });
  });
  assert(total > 0, '115-1 必須有詞語資料可供檢查');
  assert.strictEqual(bad.length, 0, `共 ${bad.length} 筆整串注音與逐字注音陣列不一致：${bad.slice(0, 3).join('；')}`);
});

// -------------------------------------------------------------
// 結算
// -------------------------------------------------------------
console.log('\n----------------------------------------------------');
console.log(`測試結果：${passedTests} 項通過，${failedTests} 項失敗。`);
console.log('----------------------------------------------------');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 所有邏輯與資料合規測試全數通過！\n');
}
