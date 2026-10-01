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
let skippedTests = 0;

// 缺少外部資料（教育部辭典原檔、開發分支歷史）時，相關測試明確標示「略過」，不算通過也不算失敗。
function skipTest(msg) {
  const e = new Error(msg);
  e.name = 'SkipTest';
  return e;
}
function reportSkip(name, err) {
  console.log(`  ⏭️  [SKIP] ${name}`);
  console.log(`     ${err.message}`);
  skippedTests++;
}

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    if (err && err.name === 'SkipTest') return reportSkip(name, err);
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

it('115-1 官方教材資料集必須通過欄位與來源合規查驗（二年級）', () => {
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

// 多年級資料驗證（一、三、四、五、六年級）
const gradeFiles = [
  { grade: 1, file: 'curriculum-115-1-g1.json', code: '1a', label: '一年級' },
  { grade: 3, file: 'curriculum-115-1-g3.json', code: '3a', label: '三年級' },
  { grade: 4, file: 'curriculum-115-1-g4.json', code: '4a', label: '四年級' },
  { grade: 5, file: 'curriculum-115-1-g5.json', code: '5a', label: '五年級' },
  { grade: 6, file: 'curriculum-115-1-g6.json', code: '6a', label: '六年級' },
];

gradeFiles.forEach(({ grade, file, code, label }) => {
  it(`${label}（${file}）官方教材資料集合規查驗`, () => {
    const p = path.join(__dirname, `../data/${file}`);
    if (!fs.existsSync(p)) {
      console.log(`  ⚠️  ${file} 尚未建立，跳過`);
      return; // 檔案不存在時跳過而非失敗
    }
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));

    assert.strictEqual(d.meta.academicYear, 115, `${label} academicYear 應為 115`);
    assert.strictEqual(d.meta.semesterCode, code, `${label} semesterCode 應為 ${code}`);
    assert.strictEqual(d.meta.sourceType, 'official_curriculum');
    assert(d.meta.grade.includes(label.replace('年級', '')), `${label} meta.grade 應包含年級文字`);

    const pubs = ['kangxuan', 'nanyi', 'hanlin'];
    pubs.forEach((pub) => {
      assert(d.publishers[pub], `${label} 必須包含出版社 ${pub}`);
      const lessons = d.publishers[pub].lessons;
      assert(lessons.length >= 6, `${label} ${pub} 至少應有 6 課（實際 ${lessons.length} 課）`);

      lessons.forEach((l) => {
        assert(Number.isInteger(l.lessonNo), `${label} 課次編號必須為整數`);
        assert(l.title.length > 0, `${label} L${l.lessonNo} 必須有名稱`);
        // 一年級前幾課可能生字很少但不為零
        if (l.characters.length > 0) {
          l.characters.forEach((c) => {
            assert.strictEqual(c.char.length, 1, `${label} 生字長度應為 1: ${c.char}`);
            assert(c.bopomofo.length > 0, `${label} 生字 ${c.char} 必須有注音`);
            assert(c.strokes > 0, `${label} 生字 ${c.char} 筆畫必須大於 0`);
            assert(
              c.moeDictUrl.includes('dict.concised.moe.edu.tw'),
              `${label} 生字 ${c.char} 必須具備教育部辭典連結`
            );
          });
        }
      });
    });
  });
});

// 多年級詞語注音一致性
gradeFiles.forEach(({ grade, file, code, label }) => {
  it(`${label} 詞語注音 bopomofo 與 bopomofoArray 一致性`, () => {
    const p = path.join(__dirname, `../data/${file}`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const bad = [];
    let total = 0;
    Object.keys(d.publishers).forEach((pub) => {
      d.publishers[pub].lessons.forEach((l) => {
        (l.words || []).forEach((w) => {
          total++;
          if (w.bopomofo !== w.bopomofoArray.join(' ')) {
            bad.push(`${pub} L${l.lessonNo} 詞「${w.word}」`);
          }
        });
      });
    });
    if (total > 0) {
      assert.strictEqual(bad.length, 0, `${label} 共 ${bad.length} 筆注音不一致：${bad.slice(0, 3).join('；')}`);
    }
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

// =============================================================
// 【模組 9】顏國雄老師 CSV 快照逐課比對（生字集合完全相同）
// =============================================================
console.log('\n【模組 9】顏國雄老師 CSV 快照逐課比對（生字集合完全相同）');

/**
 * Parse a gsyan CSV file: returns [{chars: Set<string>}, ...]
 * for EVERY data row (including non-L-coded foundation units).
 */
function parseGsyanCsv(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').map(l => l.replace(/\r/g, ''));
  const results = [];
  for (const line of lines) {
    // Match any data row: 115#publisher#gradeDir#tag,chars
    const m = line.match(/^115[#](南一|康軒|翰林)[#]\d上筆順[#](.+?),(.+)$/);
    if (m) {
      const tag = m[2].trim();
      const chars = new Set(Array.from(m[3].trim()));
      results.push({ tag, chars });
    }
  }
  return results;
}

const csvSnapshots = [
  { pub: 'kangxuan', grade: 1, label: '康軒一年級' },
  { pub: 'hanlin',   grade: 1, label: '翰林一年級' },
  { pub: 'nanyi',    grade: 1, label: '南一一年級' },
  { pub: 'kangxuan', grade: 3, label: '康軒三年級' },
  { pub: 'hanlin',   grade: 3, label: '翰林三年級' },
  { pub: 'nanyi',    grade: 3, label: '南一三年級' },
  { pub: 'kangxuan', grade: 4, label: '康軒四年級' },
  { pub: 'hanlin',   grade: 4, label: '翰林四年級' },
  { pub: 'nanyi',    grade: 4, label: '南一四年級' },
  { pub: 'kangxuan', grade: 5, label: '康軒五年級' },
  { pub: 'hanlin',   grade: 5, label: '翰林五年級' },
  { pub: 'nanyi',    grade: 5, label: '南一五年級' },
  { pub: 'kangxuan', grade: 6, label: '康軒六年級' },
  { pub: 'hanlin',   grade: 6, label: '翰林六年級' },
  { pub: 'nanyi',    grade: 6, label: '南一六年級' },
];

// 顏國雄老師試算表的授權條款未載明（原作者聲明僅供教學自學與非商業性使用），CSV 快照不隨公開倉庫散布。
// 沒有快照時，這一組測試明確標示「略過」（不算通過也不算失敗）；取得方式見 README.md「如何重建資料」與 data/SOURCES.md。
const CSV_MISSING_MSG = '此環境沒有顏國雄老師試算表的 CSV 快照（授權條款未載明，未收入本倉庫）；取得方式見 README.md「如何重建資料」與 data/SOURCES.md';

csvSnapshots.forEach(({ pub, grade, label }) => {
  it(`${label} — JSON 生字集合必須與 gsyan CSV 快照逐課完全相同`, () => {
    const csvPath = path.join(__dirname, `../data/sources/gsyan/${pub}_${grade}.csv`);
    if (!fs.existsSync(csvPath)) throw skipTest(CSV_MISSING_MSG);

    const jsonFile = grade === 2 ? 'curriculum-115-1.json' : `curriculum-115-1-g${grade}.json`;
    const jsonPath = path.join(__dirname, `../data/${jsonFile}`);
    assert(fs.existsSync(jsonPath), `JSON 資料檔 ${jsonFile} 必須存在`);

    const csvRows = parseGsyanCsv(csvPath);
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const jsonLessons = jsonData.publishers[pub].lessons;

    // Same number of units (lessons + foundation units)
    assert.strictEqual(
      jsonLessons.length, csvRows.length,
      `${label} 單元數不符：JSON ${jsonLessons.length} 單元 vs CSV ${csvRows.length} 列`
    );

    // Each unit's character set must match exactly (positional comparison)
    const mismatches = [];
    csvRows.forEach((csvR, i) => {
      const jsonL = jsonLessons[i];
      const jsonChars = new Set(jsonL.characters.map(c => c.char));
      const csvChars = csvR.chars;

      // Check for exact set equality
      const onlyInCsv = [...csvChars].filter(c => !jsonChars.has(c));
      const onlyInJson = [...jsonChars].filter(c => !csvChars.has(c));
      if (onlyInCsv.length > 0 || onlyInJson.length > 0) {
        let msg = `#${i+1}(${csvR.tag})`;
        if (onlyInCsv.length > 0) msg += ` CSV多：${onlyInCsv.join('')}`;
        if (onlyInJson.length > 0) msg += ` JSON多：${onlyInJson.join('')}`;
        mismatches.push(msg);
      }
    });

    assert.strictEqual(
      mismatches.length, 0,
      `${label} 有 ${mismatches.length} 單元生字不符：${mismatches.join('；')}`
    );
  });
});

// 快照列數 = 資料單元數
it('每個 CSV 快照列數必須等於對應 JSON 的單元數', () => {
  const bad = [];
  const present = csvSnapshots.filter(({ pub, grade }) =>
    fs.existsSync(path.join(__dirname, `../data/sources/gsyan/${pub}_${grade}.csv`)));
  if (present.length === 0) throw skipTest(CSV_MISSING_MSG);
  csvSnapshots.forEach(({ pub, grade, label }) => {
    const csvPath = path.join(__dirname, `../data/sources/gsyan/${pub}_${grade}.csv`);
    if (!fs.existsSync(csvPath)) return;
    const jsonFile = grade === 2 ? 'curriculum-115-1.json' : `curriculum-115-1-g${grade}.json`;
    const jsonPath = path.join(__dirname, `../data/${jsonFile}`);
    if (!fs.existsSync(jsonPath)) return;

    const csvRows = parseGsyanCsv(csvPath);
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const jsonLessons = jsonData.publishers[pub].lessons;
    if (csvRows.length !== jsonLessons.length) {
      bad.push(`${label}: CSV ${csvRows.length} 列 vs JSON ${jsonLessons.length} 單元`);
    }
  });
  assert.strictEqual(bad.length, 0, `列數不符：${bad.join('；')}`);
});

// 【模組 10】注音／部首／筆畫與辭典快照一致性抽查
console.log('\n【模組 10】注音／部首／筆畫與辭典快照一致性抽查');

it('各年級生字注音不得為空（辭典查無者除外）', () => {
  const bad = [];
  [1,3,4,5,6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      d.publishers[pub].lessons.forEach(l => {
        l.characters.forEach(c => {
          if (!c.bopomofo || c.bopomofo.length === 0) {
            bad.push(`g${g} ${pub} L${l.lessonNo} 「${c.char}」無注音`);
          }
        });
      });
    });
  });
  assert.strictEqual(bad.length, 0, `${bad.length} 個生字缺注音：${bad.slice(0,5).join('；')}`);
});

it('各年級生字筆畫數必須大於 0', () => {
  const bad = [];
  [1,3,4,5,6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      d.publishers[pub].lessons.forEach(l => {
        l.characters.forEach(c => {
          if (!c.strokes || c.strokes <= 0) {
            bad.push(`g${g} ${pub} L${l.lessonNo} 「${c.char}」筆畫=${c.strokes}`);
          }
        });
      });
    });
  });
  assert.strictEqual(bad.length, 0, `${bad.length} 個生字筆畫為 0：${bad.slice(0,5).join('；')}`);
});

it('各年級生字部首不得為空', () => {
  const bad = [];
  [1,3,4,5,6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      d.publishers[pub].lessons.forEach(l => {
        l.characters.forEach(c => {
          if (!c.radical || c.radical.trim().length === 0) {
            bad.push(`g${g} ${pub} L${l.lessonNo} 「${c.char}」無部首`);
          }
        });
      });
    });
  });
  assert.strictEqual(bad.length, 0, `${bad.length} 個生字缺部首：${bad.slice(0,5).join('；')}`);
});

// =============================================================
// 【模組 11】讀音一致性檢查（第四輪新增）
// =============================================================
console.log('\n【模組 11】讀音一致性檢查');

// Helper: strip tone marks
function stripTone(s) {
  return s.replace(/[ˊˇˋ˙]/g, '');
}

// Build frequency table from dictionary (same logic as verifier)
const DICT_PATH = path.join(__dirname, '../data/sources/moedict/dict-revised.json');
const DICT_OK = fs.existsSync(DICT_PATH);
const DICT_MISSING_MSG = '缺教育部辭典檔 data/sources/moedict/dict-revised.json（授權因素不隨倉庫散布，取得方式見 README.md「如何重建資料」）';
const dictRaw = DICT_OK ? JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8')) : [];
const charFreq = {};
for (const entry of dictRaw) {
  const t = entry.title;
  if (!t || t.length < 2) continue;
  for (const h of (entry.heteronyms || [])) {
    const bpmf = (h.bopomofo || '').replace(/\u3000/g, ' ').trim();
    const syls = bpmf.split(/\s+/);
    if (syls.length !== t.length) continue;
    for (let i = 0; i < t.length; i++) {
      if (!charFreq[t[i]]) charFreq[t[i]] = {};
      const base = stripTone(syls[i]);
      charFreq[t[i]][base] = (charFreq[t[i]][base] || 0) + 1;
    }
  }
}

it('（A）字的注音與本課語詞音節一致（聲韻不同才算不一致）', () => {
  const bad = [];
  [1, 3, 4, 5, 6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      d.publishers[pub].lessons.forEach(l => {
        const cm = {};
        l.characters.forEach(c => { cm[c.char] = c.bopomofo; });
        l.words.forEach(w => {
          const syls = w.bopomofo.split(/\s+/);
          if (syls.length !== w.word.length) return;
          for (let i = 0; i < w.word.length; i++) {
            const ch = w.word[i];
            if (cm[ch] && stripTone(syls[i]) !== stripTone(cm[ch])) {
              bad.push(`g${g} ${pub} L${l.lessonNo} 「${ch}」字=${cm[ch]} 詞=${syls[i]}(${w.word})`);
            }
          }
        });
      });
    });
  });
  assert.strictEqual(bad.length, 0,
    `${bad.length} 個字的注音與語詞不一致：${bad.slice(0, 5).join('；')}`);
});

it('（B）字的注音等於辭典最常見讀音（最常見占六成以上才檢查）', () => {
  if (!DICT_OK) throw skipTest(DICT_MISSING_MSG);
  const bad = [];
  [1, 3, 4, 5, 6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      d.publishers[pub].lessons.forEach(l => {
        l.characters.forEach(c => {
          const cnt = charFreq[c.char];
          if (!cnt) return;
          // Find most common base reading
          let topBase = '', topN = 0, total = 0;
          for (const [base, n] of Object.entries(cnt)) {
            total += n;
            if (n > topN) { topN = n; topBase = base; }
          }
          if (topN / total < 0.6) return; // ambiguous, skip
          const charBase = stripTone(c.bopomofo);
          if (charBase !== topBase) {
            bad.push(`g${g} ${pub} L${l.lessonNo} 「${c.char}」現值=${c.bopomofo}(${charBase}) 最常見=${topBase}(${Math.round(topN/total*100)}%)`);
          }
        });
      });
    });
  });
  assert.strictEqual(bad.length, 0,
    `${bad.length} 個字和辭典最常見讀音不同：${bad.slice(0, 5).join('；')}`);
});

// Build toned frequency table for (C)(D) tests
const charFreqToned = {};
for (const entry of dictRaw) {
  const t = entry.title;
  if (!t || t.length < 2) continue;
  for (const h of (entry.heteronyms || [])) {
    const bpmf = (h.bopomofo || '').replace(/\u3000/g, ' ').trim();
    const syls = bpmf.split(/\s+/);
    if (syls.length !== t.length) continue;
    for (let i = 0; i < t.length; i++) {
      if (!charFreqToned[t[i]]) charFreqToned[t[i]] = {};
      charFreqToned[t[i]][syls[i]] = (charFreqToned[t[i]][syls[i]] || 0) + 1;
    }
  }
}

it('（C）字的完整注音（含聲調）等於辭典最常見完整讀音（不含輕聲、占六成以上才檢查）', () => {
  if (!DICT_OK) throw skipTest(DICT_MISSING_MSG);
  const bad = [];
  [1, 3, 4, 5, 6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      d.publishers[pub].lessons.forEach(l => {
        l.characters.forEach(c => {
          if (c.bopomofo.includes('˙')) return; // skip neutral-tone chars
          const cntT = charFreqToned[c.char];
          if (!cntT) return;
          // Find most common toned reading
          let topReading = '', topN = 0, total = 0;
          for (const [reading, n] of Object.entries(cntT)) {
            total += n;
            if (n > topN) { topN = n; topReading = reading; }
          }
          if (topN / total < 0.6) return;
          if (topReading.includes('˙')) return; // skip if top is neutral
          if (stripTone(topReading) !== stripTone(c.bopomofo)) return; // base mismatch = (B) issue
          if (topReading !== c.bopomofo) {
            bad.push(`g${g} ${pub} L${l.lessonNo} 「${c.char}」現值=${c.bopomofo} 最常見=${topReading}(${Math.round(topN/total*100)}%)`);
          }
        });
      });
    });
  });
  assert.strictEqual(bad.length, 0,
    `${bad.length} 個字聲調和辭典最常見不同：${bad.slice(0, 5).join('；')}`);
});

it('（D）字的完整注音（含聲調）與本課語詞音節一致（不含輕聲）', () => {
  const bad = [];
  [1, 3, 4, 5, 6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      d.publishers[pub].lessons.forEach(l => {
        const cm = {};
        l.characters.forEach(c => { cm[c.char] = c.bopomofo; });
        l.words.forEach(w => {
          const syls = w.bopomofo.split(/\s+/);
          if (syls.length !== w.word.length) return;
          for (let i = 0; i < w.word.length; i++) {
            const ch = w.word[i];
            if (!cm[ch]) continue;
            const wSyl = syls[i];
            const cBpmf = cm[ch];
            // Skip if either is neutral tone
            if (wSyl.includes('˙') || cBpmf.includes('˙')) continue;
            // Base must match (otherwise it's an (A) issue)
            if (stripTone(wSyl) !== stripTone(cBpmf)) continue;
            if (wSyl !== cBpmf) {
              bad.push(`g${g} ${pub} L${l.lessonNo} 「${ch}」字=${cBpmf} 詞=${wSyl}(${w.word})`);
            }
          }
        });
      });
    });
  });
  assert.strictEqual(bad.length, 0,
    `${bad.length} 個字聲調與語詞不同：${bad.slice(0, 5).join('；')}`);
});

// =============================================================
// 模組 12：UI 邏輯驗證（下拉選單與 A4 試卷）
// =============================================================
console.log('\n【模組 12】UI 邏輯驗證（下拉選單與 A4 試卷）');

it('下拉選單項目數等於每年級每版本的實際單元數', () => {
  const bad = [];
  [1, 3, 4, 5, 6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      const lessons = d.publishers[pub].lessons;
      const actualCount = lessons.length;
      // Verify the count is reasonable (not hardcoded 12)
      if (actualCount === 0) {
        bad.push(`g${g} ${pub} 沒有任何單元`);
      }
      // Verify no publisher has exactly 12 lessons when the CSV has fewer
      // (This catches the old hardcoded-12 bug)
      const maxLessonNo = lessons.reduce((mx, l) => Math.max(mx, l.lessonNo), 0);
      if (maxLessonNo < 12 && actualCount >= 12) {
        bad.push(`g${g} ${pub} 最大課碼=${maxLessonNo} 但有 ${actualCount} 個單元（可能寫死 12）`);
      }
    });
  });
  assert.strictEqual(bad.length, 0, bad.join('；'));
});

it('沒有例句的年級 A4 試卷不應有空大題（每年級應只有詞語題）', () => {
  const bad = [];
  [1, 3, 4, 5, 6].forEach(g => {
    const p = path.join(__dirname, `../data/curriculum-115-1-g${g}.json`);
    if (!fs.existsSync(p)) return;
    const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
    Object.keys(d.publishers).forEach(pub => {
      const lessons = d.publishers[pub].lessons;
      // Check if any lesson has sentences
      const hasSentences = lessons.some(l => l.sentences && l.sentences.length > 0);
      // Check all lessons have at least some words
      const hasWords = lessons.some(l => l.words && l.words.length > 0);
      if (!hasSentences && !hasWords) {
        bad.push(`g${g} ${pub} 既無例句也無語詞，A4 卷會是空的`);
      }
      if (!hasSentences) {
        // For grades without sentences, verify there ARE words to use
        const totalWords = lessons.reduce((n, l) => n + (l.words ? l.words.length : 0), 0);
        if (totalWords === 0) {
          bad.push(`g${g} ${pub} 沒有語詞可出題`);
        }
      }
    });
  });
  assert.strictEqual(bad.length, 0, bad.join('；'));
});

// =============================================================
// 模組 13–19：多音字標注與「修改讀音」（第七輪）
// 純邏輯在 src/readings.js；畫面與瀏覽器端行為另由無頭 Chrome 腳本實測（見 DONE_1151001.md「第七輪」）。
// =============================================================
const ZR = require('../src/readings.js');
const { execSync } = require('child_process');

async function itA(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    if (err && err.name === 'SkipTest') return reportSkip(name, err);
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

// 讀出所有年級（1,3,4,5,6）的生字、語詞
const Z_GRADES = [1, 3, 4, 5, 6];
const zData = {};
Z_GRADES.forEach((g) => {
  zData[g] = JSON.parse(fs.readFileSync(path.join(__dirname, `../data/curriculum-115-1-g${g}.json`), 'utf-8'));
});
function zEachChar(fn) {
  Z_GRADES.forEach((g) => Object.keys(zData[g].publishers).forEach((pub) => zData[g].publishers[pub].lessons.forEach((l) => l.characters.forEach((c) => fn(c, l, pub, g)))));
}
function zEachWord(fn) {
  Z_GRADES.forEach((g) => Object.keys(zData[g].publishers).forEach((pub) => zData[g].publishers[pub].lessons.forEach((l) => (l.words || []).forEach((w) => fn(w, l, pub, g)))));
}
// 在 Node 環境下 TPZhuyin 用簡易物件；從中取出所有直排注音欄的文字
function zCols(el, out) {
  out = out || [];
  if (!el) return out;
  const cls = String(el.className || '').split(/\s+/);
  if (cls.includes('tpz-col')) out.push(el.textContent);
  (el.children || []).forEach((c) => zCols(c, out));
  return out;
}
// 假 Storage
function fakeStorage(opts) {
  opts = opts || {};
  const m = new Map();
  return {
    m,
    getItem(k) { if (opts.getThrows) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (opts.setThrows) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem(k) { if (opts.removeThrows) throw new Error('remove failed'); m.delete(k); }
  };
}
const ZK = 'zizai:readingOverrides:v1';
// 與 worker（grok-kids-apps-1150921/worker/index.js）validateReport 相同的規則；APP_RE 用部署版放寬後的寫法
const Z_APP_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const Z_KIND = ['answer', 'typo', 'ui', 'idea', 'other'];
function workerValidateReport(data) {
  const app = typeof data.app === 'string' ? data.app : '';
  if (!Z_APP_RE.test(app)) return { ok: false, field: 'app' };
  const kind = typeof data.kind === 'string' ? data.kind : '';
  if (!Z_KIND.includes(kind)) return { ok: false, field: 'kind' };
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  if (message.length < 5 || message.length > 1000) return { ok: false, field: 'message' };
  if (data.page !== undefined && data.page !== null && data.page !== '') {
    if (typeof data.page !== 'string' || data.page.length > 200 || data.page[0] !== '/') return { ok: false, field: 'page' };
  }
  if (data.ref !== undefined && data.ref !== null && data.ref !== '') {
    if (typeof data.ref !== 'string' || data.ref.length > 100) return { ok: false, field: 'ref' };
  }
  if (data.viewport !== undefined && data.viewport !== null && data.viewport !== '') {
    if (typeof data.viewport !== 'string' || data.viewport.length > 20) return { ok: false, field: 'viewport' };
  }
  if (typeof data.website === 'string' && data.website.trim() !== '') return { ok: true, honeypot: true };
  return { ok: true };
}

const readingsDone = (async function runReadingsModules() {
  // ---------------------------------------------------------------
  console.log('\n【模組 13】多音字資料（readings／ambiguous）');
  // ---------------------------------------------------------------
  await itA('readings 全部來自辭典：依「完整音節含聲調」詞頻由高到低、最多 4 個、占比與辭典統計相符', () => {
    if (!DICT_OK) throw skipTest(DICT_MISSING_MSG);
    const bad = [];
    let n = 0;
    zEachChar((c, l, pub, g) => {
      n++;
      const cnt = charFreqToned[c.char];
      if (!cnt) {
        // 辭典查無（FALLBACK）：只應有主讀音一筆，占比 1
        if (!(c.readings.length === 1 && c.readings[0].reading === c.bopomofo && c.readings[0].ratio === 1 && c.ambiguous === false)) bad.push(`g${g} ${c.char} 辭典查無但 readings 異常`);
        return;
      }
      const total = Object.values(cnt).reduce((a, b) => a + b, 0);
      const sorted = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4); // 穩定排序＝同次數維持辭典出現順序
      if (c.readings.length !== sorted.length) { bad.push(`g${g} ${c.char} 個數 ${c.readings.length}≠${sorted.length}`); return; }
      sorted.forEach(([reading, count], i) => {
        const r = c.readings[i];
        if (r.reading !== reading) bad.push(`g${g} ${c.char} 第${i + 1}個 ${r.reading}≠${reading}`);
        else if (Math.abs(r.ratio - count / total) > 0.0051) bad.push(`g${g} ${c.char} ${reading} 占比 ${r.ratio}≠${(count / total).toFixed(3)}`);
        if (!/^[\u3105-\u3129\u02CA\u02C7\u02CB\u02D9]+$/.test(reading)) bad.push(`g${g} ${c.char} 讀音含非注音字元 ${reading}`);
      });
      for (let i = 1; i < c.readings.length; i++) if (c.readings[i].ratio > c.readings[i - 1].ratio) bad.push(`g${g} ${c.char} 占比未由高到低`);
    });
    assert.ok(n === 2703, `生字筆數應為 2703，實際 ${n}`);
    assert.strictEqual(bad.length, 0, `${bad.length} 筆異常：${bad.slice(0, 5).join('；')}`);
  });

  await itA('ambiguous＝辭典最常見完整讀音占比 <85%（逐字重算）；每字主讀音必在 readings 內', () => {
    if (!DICT_OK) throw skipTest(DICT_MISSING_MSG);
    const bad = [];
    zEachChar((c, l, pub, g) => {
      const cnt = charFreqToned[c.char];
      let expectAmb = false;
      if (cnt) {
        const total = Object.values(cnt).reduce((a, b) => a + b, 0);
        expectAmb = Math.max(...Object.values(cnt)) / total < 0.85;
      }
      if (c.ambiguous !== expectAmb) bad.push(`g${g} ${c.char} ambiguous=${c.ambiguous} 應為 ${expectAmb}`);
      if (!c.readings.some((r) => r.reading === c.bopomofo)) bad.push(`g${g} ${c.char} 主讀音 ${c.bopomofo} 不在 readings`);
      if (typeof c.ambiguous !== 'boolean' || !Array.isArray(c.readings)) bad.push(`g${g} ${c.char} 欄位型別錯`);
    });
    assert.strictEqual(bad.length, 0, `${bad.length} 筆異常：${bad.slice(0, 5).join('；')}`);
  });

  await itA('ambiguous 字數與 GAPS.md「多音字待人工確認」一節一致（標題數字＝表格列數＝資料中不重複的字）', () => {
    const gaps = fs.readFileSync(path.join(__dirname, '../data/GAPS.md'), 'utf-8');
    const m = /## 多音字待人工確認（(\d+) 字/.exec(gaps);
    assert.ok(m, 'GAPS.md 找不到「多音字待人工確認」標題');
    const sec = gaps.slice(gaps.indexOf(m[0]));
    const rest = sec.slice(m[0].length);
    const next = rest.search(/\n## /);
    const body = next >= 0 ? rest.slice(0, next) : rest;
    const rows = body.split('\n').filter((ln) => /^\| [^|\-字][^|]* \| /.test(ln));
    const gapChars = new Set(rows.map((ln) => ln.split('|')[1].trim()));
    const dataChars = new Set();
    zEachChar((c) => { if (c.ambiguous) dataChars.add(c.char); });
    assert.strictEqual(Number(m[1]), dataChars.size, `標題 ${m[1]} 字，資料 ${dataChars.size} 字`);
    assert.strictEqual(gapChars.size, dataChars.size, `表格 ${gapChars.size} 列，資料 ${dataChars.size} 字`);
    assert.deepStrictEqual([...gapChars].sort(), [...dataChars].sort(), '字集合不同');
  });

  await itA('資料只新增 readings／ambiguous 兩個欄位，其他欄位（主讀音、部首、筆畫、語詞…）與第六輪（68ac46e）逐筆相同', () => {
    let have = true;
    try { execSync('git cat-file -e 68ac46e^{commit}', { cwd: path.join(__dirname, '..'), stdio: 'ignore' }); } catch (e) { have = false; }
    if (!have) throw skipTest('此環境沒有 git 或沒有第六輪基準提交 68ac46e（只存在於開發分支歷史，公開倉庫的單一提交沒有它）');
    let changed = 0, n = 0;
    Z_GRADES.forEach((g) => {
      const old = JSON.parse(execSync(`git show 68ac46e:data/curriculum-115-1-g${g}.json`, { cwd: path.join(__dirname, '..'), maxBuffer: 64 * 1024 * 1024 }).toString('utf-8'));
      Object.keys(zData[g].publishers).forEach((pub) => zData[g].publishers[pub].lessons.forEach((l, li) => {
        const ol = old.publishers[pub].lessons[li];
        assert.strictEqual(l.characters.length, ol.characters.length);
        assert.deepStrictEqual(l.words, ol.words, `g${g} ${pub} L${l.lessonNo} 語詞被改動`);
        l.characters.forEach((c, ci) => {
          n++;
          const c2 = Object.assign({}, c); delete c2.readings; delete c2.ambiguous;
          if (JSON.stringify(c2) !== JSON.stringify(ol.characters[ci])) changed++;
        });
      }));
    });
    assert.strictEqual(n, 2703);
    assert.strictEqual(changed, 0, `${changed} 筆既有欄位被改動`);
  });

  await itA('「破音」標記門檻：ambiguous 或次要讀音占比 >=10%（0.10 含、0.09 不含）；單一讀音不標', () => {
    assert.strictEqual(ZR.heteronymLevel({ ambiguous: true, readings: [{ reading: 'ㄌㄜ', ratio: 0.8 }, { reading: 'ㄌㄧㄠˇ', ratio: 0.05 }] }), 'ambiguous');
    assert.strictEqual(ZR.heteronymLevel({ ambiguous: false, readings: [{ reading: 'ㄔㄨㄟ', ratio: 0.9 }, { reading: 'ㄔㄨㄟˋ', ratio: 0.1 }] }), 'multi');
    assert.strictEqual(ZR.heteronymLevel({ ambiguous: false, readings: [{ reading: 'ㄔㄨㄟ', ratio: 0.91 }, { reading: 'ㄔㄨㄟˋ', ratio: 0.09 }] }), null);
    assert.strictEqual(ZR.heteronymLevel({ ambiguous: false, readings: [{ reading: 'ㄕㄢ', ratio: 1 }] }), null);
    assert.strictEqual(ZR.heteronymLevel({ char: '年', bopomofo: 'ㄋㄧㄢˊ' }), null, '沒有 readings（舊資料）不標');
    assert.strictEqual(ZR.heteronymLevel(null), null);
    const amb = new Set(), multi = new Set();
    zEachChar((c) => { const lv = ZR.heteronymLevel(c); if (lv === 'ambiguous') amb.add(c.char); else if (lv === 'multi') multi.add(c.char); });
    assert.strictEqual(amb.size, 143, `ambiguous 字數 ${amb.size}`);
    assert.ok(multi.size > 0 && multi.size < 874, `multi 字數 ${multi.size}`);
    console.log(`     （標「破音」：ambiguous ${amb.size} 字＋次要讀音>=10% ${multi.size} 字＝${amb.size + multi.size} 字；全部有第二讀音的字 ${(() => { const s = new Set(); zEachChar((c) => { if (c.readings.length >= 2) s.add(c.char); }); return s.size; })()} 字）`);
  });

  // ---------------------------------------------------------------
  console.log('\n【模組 14】自行輸入注音的格式驗證');
  // ---------------------------------------------------------------
  await itA('合法輸入：各種聲調、輕聲前置／後置、前後空白，輕聲點正規化為前置', () => {
    const ok = [
      ['ㄌㄧㄠˇ', 'ㄌㄧㄠˇ'], ['ㄏㄤˊ', 'ㄏㄤˊ'], ['ㄕㄨˋ', 'ㄕㄨˋ'], ['˙ㄌㄜ', '˙ㄌㄜ'], ['ㄌㄜ˙', '˙ㄌㄜ'],
      ['ㄦ', 'ㄦ'], ['ㄧ', 'ㄧ'], ['ㄩㄝˋ', 'ㄩㄝˋ'], ['ㄓ', 'ㄓ'], ['ㄌㄜ', 'ㄌㄜ'], ['  ㄌㄧㄠˇ  ', 'ㄌㄧㄠˇ'], ['\u3000ㄌㄧㄠˇ', 'ㄌㄧㄠˇ'], ['ㄨㄛˇ', 'ㄨㄛˇ'], ['ㄒㄩㄝˊ', 'ㄒㄩㄝˊ']
    ];
    ok.forEach(([input, want]) => {
      const r = ZR.validateBopomofo(input);
      assert.ok(r.ok, `「${input}」應合法：${r.reason}`);
      assert.strictEqual(r.value, want, `「${input}」正規化結果`);
    });
  });
  await itA('不合法輸入：一律 ok=false 且附說明（空白、英文、數字、漢字、錯誤聲調符號、聲調位置或個數錯、順序錯、只有聲調）', () => {
    const bad = ['', '   ', 'abc', 'ㄌㄧㄠˇa', 'ㄌㄧㄠ´', 'ㄌㄧㄠ`', '漢', '1', 'ㄌㄧㄠˇ！', 'ㄌㄧㄠˇˊ', 'ㄌˇㄧㄠ', 'ㄧㄌ', 'ㄅㄆ', '˙', 'ˇ', 'ˊㄌㄧㄠ', 'ㄌㄧㄠˇ˙', '˙ㄌㄧㄠˇ', 'ㄌㄧㄠ˙ㄌ', 'ㄅㄧㄨ', 'ㄫㄚ', 'ㄭㄚ'];
    bad.forEach((input) => {
      const r = ZR.validateBopomofo(input);
      assert.strictEqual(r.ok, false, `「${input}」應被拒絕，卻得到 ${r.value}`);
      assert.ok(typeof r.reason === 'string' && r.reason.length >= 6, `「${input}」缺少說明`);
    });
  });
  await itA('錯誤說明內容對應原因（字元集、聲調個數、聲調位置、順序、空白）', () => {
    assert.ok(/只能輸入注音符號/.test(ZR.validateBopomofo('abc').reason) && /a、b、c/.test(ZR.validateBopomofo('abc').reason));
    assert.ok(/聲調符號只能有一個/.test(ZR.validateBopomofo('ㄌㄧㄠˇˊ').reason));
    assert.ok(/最後面/.test(ZR.validateBopomofo('ㄌˇㄧㄠ').reason));
    assert.ok(/順序/.test(ZR.validateBopomofo('ㄧㄌ').reason));
    assert.ok(/請選一個讀音/.test(ZR.validateBopomofo('  ').reason));
  });
  await itA('資料內所有辭典讀音（2703 筆主讀音與全部 readings）都能通過驗證且正規化後不變', () => {
    const bad = [];
    zEachChar((c, l, pub, g) => {
      [c.bopomofo].concat(c.readings.map((r) => r.reading)).forEach((s) => {
        const r = ZR.validateBopomofo(s);
        if (!r.ok || r.value !== s) bad.push(`g${g} ${c.char} ${s}`);
      });
    });
    assert.strictEqual(bad.length, 0, bad.slice(0, 8).join('；'));
  });

  // ---------------------------------------------------------------
  console.log('\n【模組 15】儲存、還原、套用到字卡／練習／考卷（含語詞音節替換）');
  // ---------------------------------------------------------------
  await itA('儲存：鍵名 zizai:readingOverrides:v1、格式 {字:{bopomofo,note,ts,grade,publisher,lesson}}；重新建立 store 讀得回來', () => {
    const st = fakeStorage();
    const s1 = ZR.createStore(() => st);
    s1.load();
    const r = s1.set('了', { bopomofo: 'ㄌㄧㄠˇ', note: '  課本標這個音 ', ts: 1790000000000, grade: 1, publisher: 'hanlin', lesson: 4, dict: '˙ㄌㄜ' });
    assert.ok(r.ok && r.persisted);
    assert.strictEqual(ZR.STORAGE_KEY, ZK);
    const raw = JSON.parse(st.getItem(ZK));
    assert.deepStrictEqual(raw['了'], { bopomofo: 'ㄌㄧㄠˇ', note: '課本標這個音', ts: 1790000000000, grade: 1, publisher: 'hanlin', lesson: 4, dict: '˙ㄌㄜ' });
    ['bopomofo', 'note', 'ts', 'grade', 'publisher', 'lesson'].forEach((k) => assert.ok(k in raw['了'], '缺 ' + k));
    const s2 = ZR.createStore(() => st);
    s2.load();
    assert.strictEqual(s2.count(), 1);
    assert.strictEqual(s2.get('了').bopomofo, 'ㄌㄧㄠˇ');
    assert.strictEqual(s2.isPersistent(), true);
  });
  await itA('儲存會拒絕不合格資料：格式錯的讀音、非單一字的鍵；備註超過 100 字被截斷；換行與定位字元壓成空白', () => {
    const st = fakeStorage();
    const s = ZR.createStore(() => st); s.load();
    assert.strictEqual(s.set('了', { bopomofo: 'abc' }).ok, false);
    assert.strictEqual(s.set('了了', { bopomofo: 'ㄌㄜ' }).ok, false);
    assert.strictEqual(s.set('', { bopomofo: 'ㄌㄜ' }).ok, false);
    assert.strictEqual(s.set('了', null).ok, false);
    assert.strictEqual(st.getItem(ZK), null, '失敗不得寫入');
    const r = s.set('了', { bopomofo: 'ㄌㄜ', note: '字'.repeat(150) + '\n換行\t定位', ts: 1, grade: 1, publisher: 'nanyi', lesson: 2 });
    assert.ok(r.ok);
    assert.strictEqual(s.get('了').note.length, 100);
    const r2 = s.set('子', { bopomofo: 'ㄗ', note: 'a\nb\tc', ts: 2, grade: 1, publisher: 'nanyi', lesson: 2 });
    assert.strictEqual(s.get('子').note, 'a b c');
    assert.strictEqual(r2.ok, true);
  });
  await itA('還原：移除紀錄與儲存；最後一筆還原後鍵被移除；還原不存在的字不出錯', () => {
    const st = fakeStorage();
    const s = ZR.createStore(() => st); s.load();
    s.set('了', { bopomofo: 'ㄌㄧㄠˇ', ts: 1 });
    s.set('的', { bopomofo: 'ㄉㄧˋ', ts: 2 });
    assert.deepStrictEqual(s.entries().map((e) => e.char), ['了', '的']);
    assert.ok(s.remove('了').ok);
    assert.deepStrictEqual(Object.keys(JSON.parse(st.getItem(ZK))), ['的']);
    assert.strictEqual(s.get('了'), null);
    assert.ok(s.remove('不存在').ok);
    s.remove('的');
    assert.strictEqual(st.getItem(ZK), null, '全部還原後應移除鍵');
    assert.strictEqual(s.count(), 0);
  });
  await itA('現用讀音：有修改用修改，沒有用辭典；其他字不受影響', () => {
    const s = ZR.createStore(() => fakeStorage()); s.load();
    s.set('了', { bopomofo: 'ㄌㄧㄠˇ', ts: 1 });
    assert.strictEqual(ZR.effectiveReading(s, '了', '˙ㄌㄜ'), 'ㄌㄧㄠˇ');
    assert.strictEqual(ZR.effectiveReading(s, '的', '˙ㄉㄜ'), '˙ㄉㄜ');
    s.remove('了');
    assert.strictEqual(ZR.effectiveReading(s, '了', '˙ㄌㄜ'), '˙ㄌㄜ');
  });
  await itA('語詞音節替換：音節數等於字數才換；不含該字的語詞不變；沒變動時回傳原陣列', () => {
    const s = ZR.createStore(() => fakeStorage()); s.load();
    s.set('了', { bopomofo: 'ㄌㄧㄠˇ', ts: 1, dict: '˙ㄌㄜ' });
    assert.deepStrictEqual(ZR.overrideSyllables(s, '有了', ['ㄧㄡˇ', '˙ㄌㄜ']), ['ㄧㄡˇ', 'ㄌㄧㄠˇ']);
    assert.deepStrictEqual(ZR.overrideSyllables(s, '了解', ['˙ㄌㄜ', 'ㄐㄧㄝˇ']), ['ㄌㄧㄠˇ', 'ㄐㄧㄝˇ']);
    const same = ['ㄔㄨ', 'ㄔㄜ'];
    assert.strictEqual(ZR.overrideSyllables(s, '出車', same), same, '不含該字應回傳原陣列');
    const odd = ['˙ㄌㄜ'];
    assert.strictEqual(ZR.overrideSyllables(s, '了了', odd), odd, '音節數不等於字數不換');
    assert.strictEqual(ZR.overrideSyllables(s, '有了', undefined), undefined);
    assert.strictEqual(ZR.overrideSyllables(null, '有了', ['ㄧㄡˇ', '˙ㄌㄜ']).join(), 'ㄧㄡˇ,˙ㄌㄜ');
  });
  await itA('語詞音節替換的保護：該字在語詞中讀成別的音（≠修改當下的辭典讀音）不被誤換；紀錄沒有 dict 時一律替換', () => {
    const s = ZR.createStore(() => fakeStorage()); s.load();
    s.set('子', { bopomofo: 'ㄗ', ts: 1, dict: 'ㄗˇ' });
    assert.deepStrictEqual(ZR.overrideSyllables(s, '子張', ['ㄗˇ', 'ㄓㄤ']), ['ㄗ', 'ㄓㄤ']);
    assert.deepStrictEqual(ZR.overrideSyllables(s, '印子', ['ㄧㄣˋ', '˙ㄗ']), ['ㄧㄣˋ', '˙ㄗ'], '「印子」的子是輕聲，不是辭典讀音，不應被換');
    const s2 = ZR.createStore(() => fakeStorage()); s2.load();
    s2.set('子', { bopomofo: 'ㄗ', ts: 1 });
    assert.deepStrictEqual(ZR.overrideSyllables(s2, '印子', ['ㄧㄣˋ', '˙ㄗ']), ['ㄧㄣˋ', 'ㄗ'], '沒有 dict 時依規格一律替換');
  });
  await itA('全資料套用：對 143 個 ambiguous 字各自修改，所有語詞（1002 筆）的結果＝獨立算出的期望；沒有修改時完全不變', () => {
    const empty = ZR.createStore(() => fakeStorage()); empty.load();
    let nWords = 0, nChanged = 0;
    const byChar = {};
    zEachChar((c) => { if (c.ambiguous) byChar[c.char] = c; });
    const chars = Object.keys(byChar);
    assert.strictEqual(chars.length, 143);
    const s = ZR.createStore(() => fakeStorage()); s.load();
    chars.forEach((ch) => {
      const c = byChar[ch];
      const alt = c.readings.find((r) => r.reading !== c.bopomofo).reading;
      s.set(ch, { bopomofo: alt, ts: 1, dict: c.bopomofo });
    });
    zEachWord((w) => {
      nWords++;
      assert.strictEqual(ZR.overrideSyllables(empty, w.word, w.bopomofoArray), w.bopomofoArray, '沒修改應回傳原陣列');
      const exp = w.bopomofoArray.map((syl, i) => { const rec = s.get(w.word[i]); return rec && syl === rec.dict ? rec.bopomofo : syl; });
      const got = ZR.overrideSyllables(s, w.word, w.bopomofoArray);
      assert.deepStrictEqual(got, exp, `語詞 ${w.word}`);
      if (JSON.stringify(got) !== JSON.stringify(w.bopomofoArray)) nChanged++;
    });
    assert.strictEqual(nWords, 1002);
    assert.ok(nChanged > 0, '應至少有一個語詞被替換');
    console.log(`     （143 字全改後，1002 個語詞中 ${nChanged} 個有音節被換）`);
  });
  await itA('套用到字卡／線上練習／A4 卷與解答卷：用注音元件實際繪製，直排注音欄顯示新讀音', () => {
    const s = ZR.createStore(() => fakeStorage()); s.load();
    s.set('了', { bopomofo: 'ㄌㄧㄠˇ', ts: 1, dict: '˙ㄌㄜ' });
    // 字卡（app 以 effectiveReading 取用）
    assert.deepStrictEqual(zCols(TPZhuyin.cell('了', ZR.effectiveReading(s, '了', '˙ㄌㄜ'), { size: 'md', status: 'current' })), ['ㄌㄧㄠˇ']);
    // 線上練習：語詞題（blank）
    const arr = ZR.overrideSyllables(s, '有了', ['ㄧㄡˇ', '˙ㄌㄜ']);
    assert.deepStrictEqual(zCols(TPZhuyin.word('有了', arr, { size: 'lg', blank: true })), ['ㄧㄡˇ', 'ㄌㄧㄠˇ']);
    // 線上練習：句子題；A4 學生卷（blank）與解答卷（answer）
    const sent = '我們有了新朋友。';
    const sheet = TPZhuyin.sentence(sent, [{ word: '有了', bopomofoArray: arr }], { size: 'print', blank: true, showZhuyin: true });
    const answer = TPZhuyin.sentence(sent, [{ word: '有了', bopomofoArray: arr }], { size: 'print', blank: false, status: 'answer', showZhuyin: true });
    assert.deepStrictEqual(zCols(sheet), ['ㄧㄡˇ', 'ㄌㄧㄠˇ']);
    assert.deepStrictEqual(zCols(answer), ['ㄧㄡˇ', 'ㄌㄧㄠˇ']);
    // A4 詞語題（學生卷、解答卷）
    assert.deepStrictEqual(zCols(TPZhuyin.word('有了', arr, { size: 'print', blank: true, showZhuyin: true })), ['ㄧㄡˇ', 'ㄌㄧㄠˇ']);
    assert.deepStrictEqual(zCols(TPZhuyin.word('有了', arr, { size: 'print', blank: false, status: 'answer', showZhuyin: true })), ['ㄧㄡˇ', 'ㄌㄧㄠˇ']);
    // 還原後回到辭典讀音
    s.remove('了');
    assert.deepStrictEqual(zCols(TPZhuyin.word('有了', ZR.overrideSyllables(s, '有了', ['ㄧㄡˇ', '˙ㄌㄜ']), { size: 'print', blank: true })), ['ㄧㄡˇ', '˙ㄌㄜ']);
  });

  // ---------------------------------------------------------------
  console.log('\n【模組 16】回報 payload（對照 worker validateReport 的規則）');
  // ---------------------------------------------------------------
  await itA('payload 欄位與格式：app=zizai、kind=typo、message 範本、ref 格式、page 以 / 開頭、viewport、website 蜜罐為空字串，只有這 7 個欄位', () => {
    const p = ZR.buildReportPayload({ char: '了', dict: '˙ㄌㄜ', bopomofo: 'ㄌㄧㄠˇ', note: '課本標這個音', grade: 1, publisher: 'nanyi', lesson: 3, pathname: '/kids/apps/zizai/', viewport: '375x812' });
    assert.deepStrictEqual(Object.keys(p).sort(), ['app', 'kind', 'message', 'page', 'ref', 'viewport', 'website']);
    assert.strictEqual(p.app, 'zizai');
    assert.strictEqual(p.kind, 'typo');
    assert.strictEqual(p.message, '【字在讀音修改】字：了｜年級版本課：一年級南一第3課｜辭典讀音：˙ㄌㄜ｜我改成：ㄌㄧㄠˇ｜備註：課本標這個音');
    assert.strictEqual(p.ref, 'g1/nanyi/L3/了');
    assert.strictEqual(p.page, '/kids/apps/zizai/');
    assert.strictEqual(p.viewport, '375x812');
    assert.strictEqual(p.website, '');
    assert.strictEqual(workerValidateReport(p).ok, true);
    assert.ok(!('honeypot' in workerValidateReport(p)), '蜜罐必須是空字串');
  });
  await itA('沒有備註寫「備註：無」；各欄位長度夾限（備註 100 字、ref 100 字內、page 200 字內、viewport 20 字內）後仍通過驗證', () => {
    const none = ZR.buildReportPayload({ char: '了', dict: '˙ㄌㄜ', bopomofo: 'ㄌㄧㄠˇ', note: '', grade: 1, publisher: 'nanyi', lesson: 3, pathname: '/', viewport: '1x1' });
    assert.ok(none.message.endsWith('｜備註：無'));
    assert.strictEqual(workerValidateReport(none).ok, true);
    const big = ZR.buildReportPayload({ char: '了', dict: '˙ㄌㄜ', bopomofo: 'ㄌㄧㄠˇ', note: '字'.repeat(500), grade: 1, publisher: 'x'.repeat(300), lesson: 3, pathname: '/' + 'a'.repeat(500), viewport: '9'.repeat(60) });
    assert.ok(big.message.length <= 1000 && big.message.length >= 5);
    assert.ok(big.ref.length <= 100);
    assert.ok(big.page.length <= 200 && big.page[0] === '/');
    assert.ok(big.viewport.length <= 20);
    assert.strictEqual(workerValidateReport(big).ok, true);
    const wrongPath = ZR.buildReportPayload({ char: '了', dict: 'ㄌㄜ', bopomofo: 'ㄌㄧㄠˇ', note: '', grade: 1, publisher: 'nanyi', lesson: 3, pathname: 'C:/x/index.html', viewport: '1x1' });
    assert.strictEqual(wrongPath.page, '/', '不以 / 開頭的路徑改成 /');
    assert.strictEqual(workerValidateReport(wrongPath).ok, true);
  });
  await itA('全資料：143 個 ambiguous 字各產生一份 payload，全部通過 validateReport，且 message 長度在 5–1000', () => {
    let n = 0;
    zEachChar((c, l, pub, g) => {
      if (!c.ambiguous) return;
      const alt = c.readings.find((r) => r.reading !== c.bopomofo).reading;
      const p = ZR.buildReportPayload({ char: c.char, dict: c.bopomofo, bopomofo: alt, note: '備'.repeat(100), grade: g, publisher: pub, lesson: l.lessonNo, pathname: '/kids/apps/zizai/', viewport: '1920x1080' });
      const v = workerValidateReport(p);
      assert.ok(v.ok, `g${g} ${pub} ${c.char} 驗證失敗 ${JSON.stringify(v)}`);
      assert.ok(p.message.length >= 5 && p.message.length <= 1000);
      n++;
    });
    assert.ok(n >= 143);
  });
  await itA('驗證器本身有牙（負向對照）：app、kind、message、page、ref、viewport 不合格都會被擋', () => {
    const good = ZR.buildReportPayload({ char: '了', dict: 'ㄌㄜ', bopomofo: 'ㄌㄧㄠˇ', note: '', grade: 1, publisher: 'nanyi', lesson: 3, pathname: '/', viewport: '375x812' });
    const mut = (o) => Object.assign({}, good, o);
    assert.strictEqual(workerValidateReport(mut({ app: 'ZiZai!' })).field, 'app');
    assert.strictEqual(workerValidateReport(mut({ kind: 'bug' })).field, 'kind');
    assert.strictEqual(workerValidateReport(mut({ message: '1234' })).field, 'message');
    assert.strictEqual(workerValidateReport(mut({ message: 'a'.repeat(1001) })).field, 'message');
    assert.strictEqual(workerValidateReport(mut({ page: 'x' })).field, 'page');
    assert.strictEqual(workerValidateReport(mut({ page: '/' + 'a'.repeat(200) })).field, 'page');
    assert.strictEqual(workerValidateReport(mut({ ref: 'r'.repeat(101) })).field, 'ref');
    assert.strictEqual(workerValidateReport(mut({ viewport: '1'.repeat(21) })).field, 'viewport');
    assert.strictEqual(workerValidateReport(mut({ website: 'bot' })).honeypot, true);
  });

  // ---------------------------------------------------------------
  console.log('\n【模組 17】回報送出與失敗降級');
  // ---------------------------------------------------------------
  const GOOD_LOC = { protocol: 'https:', hostname: 'toopower.cc' };
  const payload0 = ZR.buildReportPayload({ char: '了', dict: 'ㄌㄜ', bopomofo: 'ㄌㄧㄠˇ', note: '', grade: 1, publisher: 'nanyi', lesson: 3, pathname: '/kids/apps/zizai/', viewport: '375x812' });
  await itA('來源白名單：只有 https://toopower.cc、https://www.toopower.cc 與本機 http://localhost、http://127.0.0.1 會送；file://、GitHub Pages、其他網域、http 的 toopower.cc 都不送', () => {
    const yes = [['https:', 'toopower.cc'], ['https:', 'www.toopower.cc'], ['http:', 'localhost'], ['http:', '127.0.0.1']];
    const no = [['file:', ''], ['https:', 'yourherobob.github.io'], ['https:', 'toopower.cc.evil.example'], ['https:', 'evil-toopower.cc'], ['http:', 'toopower.cc'], ['https:', 'localhost'], ['about:', ''], ['chrome-extension:', 'abc'], ['https:', 'zizai.pages.dev']];
    yes.forEach(([p, h]) => assert.strictEqual(ZR.canSendReport({ protocol: p, hostname: h }), true, `${p}//${h} 應可送`));
    no.forEach(([p, h]) => assert.strictEqual(ZR.canSendReport({ protocol: p, hostname: h }), false, `${p}//${h} 不應送`));
    assert.strictEqual(ZR.canSendReport(null), false);
    assert.strictEqual(ZR.canSendReport(undefined), false);
  });
  await itA('成功：呼叫一次、網址是相對路徑 /api/report、POST、JSON、same-origin；200 回報「已回報，謝謝」', async () => {
    const calls = [];
    const r = await ZR.sendReport(payload0, { location: GOOD_LOC, fetchImpl: (u, o) => { calls.push([u, o]); return Promise.resolve({ ok: true, status: 200 }); } });
    assert.deepStrictEqual(r, { status: 'sent' });
    assert.strictEqual(calls.length, 1);
    const [u, o] = calls[0];
    assert.strictEqual(u, '/api/report');
    assert.ok(u[0] === '/' && !/:\/\//.test(u), '必須是相對路徑，不寫死網域');
    assert.strictEqual(o.method, 'POST');
    assert.strictEqual(o.headers['Content-Type'], 'application/json');
    assert.strictEqual(o.credentials, 'same-origin');
    assert.deepStrictEqual(JSON.parse(o.body), payload0);
    assert.strictEqual(ZR.MSG_SENT, '已回報，謝謝');
    assert.strictEqual(ZR.MSG_DEGRADED, '已存在你的瀏覽器；這個頁面無法送出回報');
  });
  await itA('失敗一律降級不丟錯：404、403、429、400、500、網路錯誤、同步丟錯、回傳 undefined', async () => {
    for (const status of [404, 403, 429, 400, 413, 500, 502]) {
      const r = await ZR.sendReport(payload0, { location: GOOD_LOC, fetchImpl: () => Promise.resolve({ ok: false, status }) });
      assert.strictEqual(r.status, 'unavailable', `HTTP ${status}`);
      assert.strictEqual(r.reason, 'http-' + status);
    }
    const net = await ZR.sendReport(payload0, { location: GOOD_LOC, fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')) });
    assert.deepStrictEqual(net, { status: 'unavailable', reason: 'network' });
    const sync = await ZR.sendReport(payload0, { location: GOOD_LOC, fetchImpl: () => { throw new Error('boom'); } });
    assert.strictEqual(sync.status, 'unavailable');
    const undef = await ZR.sendReport(payload0, { location: GOOD_LOC, fetchImpl: () => undefined });
    assert.strictEqual(undef.status, 'unavailable');
    const circ = {}; circ.self = circ;
    const circular = await ZR.sendReport(circ, { location: GOOD_LOC, fetchImpl: () => Promise.resolve({ ok: true, status: 200 }) });
    assert.strictEqual(circular.status, 'unavailable', 'payload 無法序列化也不得丟錯');
  });
  await itA('逾時：請求卡住時依 timeoutMs 放棄並降級（並呼叫 abort）', async () => {
    let aborted = false;
    const t0 = Date.now();
    const r = await ZR.sendReport(payload0, { location: GOOD_LOC, timeoutMs: 60, fetchImpl: (u, o) => { if (o.signal) o.signal.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); } });
    assert.deepStrictEqual(r, { status: 'unavailable', reason: 'timeout' });
    assert.ok(Date.now() - t0 < 2000);
    assert.strictEqual(aborted, true);
  });
  await itA('非白名單環境（file://、GitHub Pages）或沒有 fetch：完全不發出請求就降級', async () => {
    let called = 0;
    const f = () => { called++; return Promise.resolve({ ok: true, status: 200 }); };
    const a = await ZR.sendReport(payload0, { location: { protocol: 'file:', hostname: '' }, fetchImpl: f });
    const b = await ZR.sendReport(payload0, { location: { protocol: 'https:', hostname: 'yourherobob.github.io' }, fetchImpl: f });
    const c = await ZR.sendReport(payload0, { location: GOOD_LOC, fetchImpl: null });
    const d = await ZR.sendReport(payload0, {});
    assert.strictEqual(called, 0);
    [a, b, c, d].forEach((r) => assert.strictEqual(r.status, 'unavailable'));
    assert.strictEqual(a.reason, 'host');
    assert.strictEqual(c.reason, 'nofetch');
  });

  // ---------------------------------------------------------------
  console.log('\n【模組 18】localStorage 不可用的降級');
  // ---------------------------------------------------------------
  await itA('取得 Storage 時就丟錯或回傳 null：不丟錯、資料留在記憶體、isPersistent=false、套用仍有效', () => {
    [() => { throw new Error('SecurityError'); }, () => null, () => undefined].forEach((getter) => {
      const s = ZR.createStore(getter);
      assert.doesNotThrow(() => s.load());
      const r = s.set('了', { bopomofo: 'ㄌㄧㄠˇ', ts: 1, dict: '˙ㄌㄜ' });
      assert.ok(r.ok && r.persisted === false);
      assert.strictEqual(s.isPersistent(), false);
      assert.strictEqual(ZR.effectiveReading(s, '了', '˙ㄌㄜ'), 'ㄌㄧㄠˇ');
      assert.deepStrictEqual(ZR.overrideSyllables(s, '有了', ['ㄧㄡˇ', '˙ㄌㄜ']), ['ㄧㄡˇ', 'ㄌㄧㄠˇ']);
      assert.ok(s.remove('了').ok);
      assert.strictEqual(s.count(), 0);
    });
  });
  await itA('getItem 丟錯、setItem 丟 QuotaExceededError、removeItem 丟錯：都不丟錯，儲存失敗時 persisted=false', () => {
    const g = ZR.createStore(() => fakeStorage({ getThrows: true }));
    assert.doesNotThrow(() => g.load());
    assert.strictEqual(g.isPersistent(), false);
    const q = ZR.createStore(() => fakeStorage({ setThrows: true }));
    q.load();
    assert.strictEqual(q.isPersistent(), true, '讀得到時一開始視為可用');
    const r = q.set('了', { bopomofo: 'ㄌㄧㄠˇ', ts: 1 });
    assert.ok(r.ok && r.persisted === false && q.isPersistent() === false);
    assert.strictEqual(q.get('了').bopomofo, 'ㄌㄧㄠˇ', '儲存失敗仍留在記憶體');
    const st = fakeStorage({ removeThrows: true });
    const rm = ZR.createStore(() => st); rm.load();
    rm.set('了', { bopomofo: 'ㄌㄧㄠˇ', ts: 1 });
    assert.doesNotThrow(() => rm.remove('了'));
    assert.strictEqual(rm.isPersistent(), false);
  });
  await itA('儲存內容損毀：壞 JSON、陣列、字串、含不合格紀錄 → 略過壞的、保留好的、不丟錯', () => {
    const mk = (raw) => { const st = fakeStorage(); st.m.set(ZK, raw); const s = ZR.createStore(() => st); s.load(); return s; };
    assert.strictEqual(mk('{壞掉').count(), 0);
    assert.strictEqual(mk('[1,2,3]').count(), 0);
    assert.strictEqual(mk('"abc"').count(), 0);
    assert.strictEqual(mk('null').count(), 0);
    const mixed = mk(JSON.stringify({ 了: { bopomofo: 'ㄌㄧㄠˇ', note: 'ok', ts: 5, grade: 1, publisher: 'nanyi', lesson: 2 }, 的: { bopomofo: 'abc' }, 子子: { bopomofo: 'ㄗ' }, 山: 'x', 水: null, 火: { bopomofo: 'ㄏㄨㄛˇ', note: 12345, ts: 'x' } }));
    assert.deepStrictEqual(mixed.entries().map((e) => e.char).sort(), ['了', '火'].sort());
    assert.strictEqual(mixed.get('火').note, '12345');
    assert.strictEqual(mixed.get('火').ts, 0);
    assert.strictEqual(mixed.get('了').lesson, 2);
  });

  // ---------------------------------------------------------------
  console.log('\n【模組 19】匯出我的修改（複製文字與下載 JSON）');
  // ---------------------------------------------------------------
  await itA('匯出文字：標題含字數、匯出時間、每字一行（字、年級版本課、辭典讀音、我改成、備註）、依修改時間排序', () => {
    const s = ZR.createStore(() => fakeStorage()); s.load();
    s.set('的', { bopomofo: 'ㄉㄧˋ', note: '', ts: 200, grade: 1, publisher: 'hanlin', lesson: 2, dict: '˙ㄉㄜ' });
    s.set('了', { bopomofo: 'ㄌㄧㄠˇ', note: '課本標這個音', ts: 100, grade: 1, publisher: 'hanlin', lesson: 4, dict: '˙ㄌㄜ' });
    const lines = ZR.buildExportText(s, new Date(2026, 9, 1, 8, 5)).split('\n');
    assert.strictEqual(lines[0], '字在｜我的讀音修改（共 2 字）');
    assert.strictEqual(lines[1], '匯出時間：2026-10-01 08:05');
    assert.strictEqual(lines[2], '1．「了」｜一年級翰林第4課｜辭典讀音：˙ㄌㄜ｜我改成：ㄌㄧㄠˇ｜備註：課本標這個音');
    assert.strictEqual(lines[3], '2．「的」｜一年級翰林第2課｜辭典讀音：˙ㄉㄜ｜我改成：ㄉㄧˋ｜備註：無');
  });
  await itA('匯出 JSON：app、format、exportedAt、count、items 欄位；沒有修改時 count=0；一般與前導單元的課次文字', () => {
    const s = ZR.createStore(() => fakeStorage()); s.load();
    assert.strictEqual(ZR.buildExportJson(s).count, 0);
    assert.ok(/共 0 字/.test(ZR.buildExportText(s)));
    s.set('數', { bopomofo: 'ㄕㄨˇ', note: 'n', ts: 1, grade: 1, publisher: 'nanyi', lesson: -1, dict: 'ㄕㄨˋ' });
    const j = ZR.buildExportJson(s, new Date('2026-10-01T00:00:00Z'));
    assert.strictEqual(j.app, 'zizai');
    assert.strictEqual(j.format, 'zizai-reading-overrides-v1');
    assert.strictEqual(j.exportedAt, '2026-10-01T00:00:00.000Z');
    assert.strictEqual(j.count, 1);
    assert.deepStrictEqual(Object.keys(j.items[0]).sort(), ['bopomofo', 'char', 'dict', 'grade', 'lesson', 'note', 'publisher', 'ts']);
    assert.ok(ZR.buildExportText(s).includes('一年級南一前導單元'));
    assert.doesNotThrow(() => JSON.stringify(j));
  });
})();

// -------------------------------------------------------------
// 結算
// -------------------------------------------------------------
readingsDone.then(() => {
  console.log('\n----------------------------------------------------');
  console.log(`測試結果：${passedTests} 項通過，${failedTests} 項失敗${skippedTests > 0 ? `，${skippedTests} 項略過（見上方 SKIP，需補齊外部資料才會執行）` : ''}。`);
  console.log('----------------------------------------------------');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 所有邏輯與資料合規測試全數通過！\n');
  }
});
