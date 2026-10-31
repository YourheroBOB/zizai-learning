#!/usr/bin/env node
/**
 * tests/fmb_edge_zhuyin.test.mjs
 * 「字在」注音字格模組（src/zhuyin.js）的邊界值、異常輸入與錯誤處理回歸測試。
 *
 * 原則：
 *  - 只使用 Node 內建模組；不連線網路、不寫入任何檔案、只讀本 repo 的 src/zhuyin.js。
 *  - 用 new Function 在同一個 realm 載入 IIFE，並把 module／window／document 明確控制，
 *    因此可以在沒有 DOM 的 Node 環境驗證「無 DOM mock 分支」與「瀏覽器全域注入分支」。
 *  - 不重複既有 tests/test_zizai.js 的一般路徑（happy path）測試，只針對邊界與異常輸入。
 *
 * 執行：node tests/fmb_edge_zhuyin.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE_PATH = fileURLToPath(new URL('../src/zhuyin.js', import.meta.url));
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

/**
 * 以指定的 module／window／document 執行一次 zhuyin.js 的 IIFE。
 * 傳入 undefined 等同「該全域不存在」，與瀏覽器／Node 的 typeof 判斷一致。
 */
function runSource({ module, window, document } = {}) {
  const factory = new Function('module', 'exports', 'window', 'document', SOURCE);
  return factory(module, module && module.exports, window, document);
}

function loadZhuyin() {
  const mod = { exports: {} };
  runSource({ module: mod, window: undefined, document: undefined });
  return mod.exports;
}

const TP = loadZhuyin();

/* ---------- 斷言輔助 ---------- */
const classesOf = (el) => String((el && el.className) || '').split(/\s+/).filter(Boolean);
const hasClass = (el, cls) => classesOf(el).includes(cls);
const kindsOf = (el) => el.children.map((c) => (c && c.tagName ? c.tagName : '#text'));

/* ---------- 極簡測試框架 ---------- */
let passed = 0;
const failures = [];

function group(title) {
  console.log(`\n${title}`);
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ❌ ${name}`);
    const msg = String((err && err.message) || err).split('\n').slice(0, 3).join(' / ');
    console.log(`     ${msg}`);
  }
}

console.log('====================================================');
console.log('  「字在」注音字格模組 — 邊界值與異常輸入測試');
console.log('====================================================');

/* ============================================================
   【1】splitSyllable：空值、空白、非字串與調號位置
   ============================================================ */
group('【1】splitSyllable：空值、空白、非字串輸入');

test('未傳參數 → 空符號、無調號', () => {
  assert.deepEqual(TP.splitSyllable(), { symbols: [], tone: null });
});

test('null → 空符號、無調號', () => {
  assert.deepEqual(TP.splitSyllable(null), { symbols: [], tone: null });
});

test('undefined → 空符號、無調號', () => {
  assert.deepEqual(TP.splitSyllable(undefined), { symbols: [], tone: null });
});

test('空字串 → 空符號、無調號', () => {
  assert.deepEqual(TP.splitSyllable(''), { symbols: [], tone: null });
});

test('全空白字串（trim 後為空）→ 空符號、無調號', () => {
  assert.deepEqual(TP.splitSyllable(' \t\n　'), { symbols: [], tone: null });
});

test('只有調號的字串 → 符號為空，調號保留', () => {
  assert.deepEqual(TP.splitSyllable('ˊ'), { symbols: [], tone: 'ˊ' });
});

test('多個調號 → 取最後一個（既有行為）', () => {
  assert.deepEqual(TP.splitSyllable('ㄅˊˇ'), { symbols: ['ㄅ'], tone: 'ˇ' });
});

test('調號夾在符號中間 → 仍視為調號', () => {
  assert.deepEqual(TP.splitSyllable('ㄅˊㄆ'), { symbols: ['ㄅ', 'ㄆ'], tone: 'ˊ' });
});

test('內部空白會被略過', () => {
  assert.deepEqual(TP.splitSyllable(' ㄅ ㄆ '), { symbols: ['ㄅ', 'ㄆ'], tone: null });
});

test('數字會被轉成字串（非字串輸入不丟錯）', () => {
  assert.deepEqual(TP.splitSyllable(123), { symbols: ['1', '2', '3'], tone: null });
});

test('非 BMP 字元（代理對）只算一個符號', () => {
  assert.deepEqual(TP.splitSyllable('😀ㄅ'), { symbols: ['😀', 'ㄅ'], tone: null });
});

test('輕聲點在前或在後都解析成同一個調號', () => {
  assert.deepEqual(TP.splitSyllable('˙ㄕ'), { symbols: ['ㄕ'], tone: '˙' });
  assert.deepEqual(TP.splitSyllable('ㄕ˙'), TP.splitSyllable('˙ㄕ'));
});

/* ============================================================
   【2】cell：空字、留白、狀態與尺寸
   ============================================================ */
group('【2】cell：空字、留白、狀態與尺寸的邊界');

test('省略 opts → 預設 learned 狀態，只有 1 個子節點（無注音欄）', () => {
  const el = TP.cell('字');
  assert.equal(el.className, 'tpz-wrap');
  assert.equal(el.children.length, 1);
  assert.equal(el.textContent, '字');
  assert.ok(hasClass(el.children[0], 'tpz-cell--learned'));
});

test('空字串與 undefined 都不丟錯且內容為空字串', () => {
  assert.equal(TP.cell('').textContent, '');
  assert.equal(TP.cell(undefined).textContent, '');
});

test('opts 明確傳 null 視同省略', () => {
  const el = TP.cell('字', null, null);
  assert.equal(el.children.length, 1);
  assert.equal(el.textContent, '字');
});

test('留白（blank:true）顯示 □ 並標注 aria-label／aria-hidden', () => {
  const el = TP.cell('字', 'ㄗˋ', { blank: true });
  assert.equal(el.textContent, '□ㄗˋ');
  assert.equal(el.children[0].getAttribute('aria-label'), '空格');
  assert.equal(el.children[0].children[1].getAttribute('aria-hidden'), 'true');
});

test('注音為空字串或 null → 不建立注音欄', () => {
  assert.equal(TP.cell('字', '').children.length, 1);
  assert.equal(TP.cell('字', null).children.length, 1);
});

test('showZhuyin:false → 即使有注音也不建立注音欄', () => {
  const el = TP.cell('字', 'ㄗˋ', { showZhuyin: false });
  assert.equal(el.children.length, 1);
  assert.equal(el.textContent, '字');
});

test('只有調號、沒有注音符號 → 注音欄存在但無內容（調號不顯示）', () => {
  const el = TP.cell('字', 'ˊ');
  assert.equal(el.children.length, 2);
  assert.equal(el.children[1].textContent, '');
});

test('輕聲點一律排在整欄最上方（與輸入順序無關）', () => {
  assert.equal(TP.cell('字', 'ㄗ˙').children[1].textContent, '˙ㄗ');
  assert.equal(TP.cell('字', '˙ㄗ').children[1].textContent, '˙ㄗ');
});

test('status 覆寫預設狀態', () => {
  assert.ok(hasClass(TP.cell('字', null, { status: 'answer' }).children[0], 'tpz-cell--answer'));
  assert.ok(hasClass(TP.cell('字', null, { status: 'upcoming' }).children[0], 'tpz-cell--upcoming'));
});

test('status:blank 不會把字換成 □（留白只看 blank 選項）', () => {
  const el = TP.cell('字', null, { status: 'blank' });
  assert.equal(el.textContent, '字');
  assert.ok(hasClass(el.children[0], 'tpz-cell--blank'));
});

test('blank:true 加 status:answer → 狀態用 answer、字仍留白（既有優先序）', () => {
  const el = TP.cell('字', 'ㄗ', { blank: true, status: 'answer' });
  assert.equal(el.textContent, '□ㄗ');
  assert.ok(hasClass(el.children[0], 'tpz-cell--answer'));
  assert.ok(!hasClass(el.children[0], 'tpz-cell--blank'));
});

test('尺寸字串（含 print）加在外層；未知尺寸不丟錯也不加類別', () => {
  assert.ok(hasClass(TP.cell('字', null, { size: 'lg' }), 'tpz--lg'));
  assert.ok(hasClass(TP.cell('字', null, { size: 'print' }), 'tpz--print'));
  assert.equal(TP.cell('字', null, { size: 'gigantic' }).className, 'tpz-wrap');
});

test('toneColor 只影響注音欄，不影響字格', () => {
  const el = TP.cell('字', 'ㄗˋ', { toneColor: 'cinnabar' });
  assert.ok(hasClass(el.children[1], 'tpz-col--cinnabar'));
  assert.ok(!hasClass(el.children[0], 'tpz-col--cinnabar'));
});

/* ============================================================
   【3】word：長度不一致、空值與型別混用
   ============================================================ */
group('【3】word：長度不一致、空值與型別混用');

test('字串字 + 空白分隔的注音字串', () => {
  const el = TP.word('航行', 'ㄏㄤˊ ㄒㄧㄥˊ');
  assert.equal(el.className, 'tpz-group');
  assert.equal(el.children.length, 2);
  assert.equal(el.textContent, '航ㄏㄤˊ行ㄒㄧㄥˊ');
});

test('注音數量少於字數 → 缺的格子不建立注音欄', () => {
  const el = TP.word(['航', '行'], ['ㄏㄤˊ']);
  assert.equal(el.children.length, 2);
  assert.equal(el.children[0].children.length, 2);
  assert.equal(el.children[1].children.length, 1);
  assert.equal(el.textContent, '航ㄏㄤˊ行');
});

test('注音數量多於字數 → 多出的忽略', () => {
  const el = TP.word('航', ['ㄏㄤˊ', 'ㄒㄧㄥˊ']);
  assert.equal(el.children.length, 1);
  assert.equal(el.textContent, '航ㄏㄤˊ');
});

test('空陣列注音 → 全部格子無注音', () => {
  const el = TP.word('航', []);
  assert.equal(el.children.length, 1);
  assert.equal(el.textContent, '航');
});

test('空字串、null、undefined 都不丟錯且沒有子節點', () => {
  assert.equal(TP.word('', '').children.length, 0);
  assert.equal(TP.word(null, null).children.length, 0);
  assert.equal(TP.word(undefined, undefined).children.length, 0);
});

test('注音參數省略 → 只產生字格', () => {
  const el = TP.word('abc');
  assert.equal(el.children.length, 3);
  assert.equal(el.textContent, 'abc');
});

test('逐格順序與注音對齊（數字字串）', () => {
  assert.equal(TP.word('12', 'ㄅ').textContent, '1ㄅ2');
});

test('尺寸會同時套用到容器與每一個字格', () => {
  const el = TP.word('航', 'ㄏㄤˊ', { size: 'sm' });
  assert.ok(hasClass(el, 'tpz--sm'));
  assert.ok(hasClass(el.children[0], 'tpz--sm'));
});

test('同字重複出現時每一格都各自帶注音', () => {
  const el = TP.word('哈哈', 'ㄏㄚ ㄏㄚ');
  assert.equal(el.children.length, 2);
  assert.equal(el.textContent, '哈ㄏㄚ哈ㄏㄚ');
});

/* ============================================================
   【4】sentence：無目標、零長度、正則特殊字元與重複出現
   ============================================================ */
group('【4】sentence：無目標、空字串、正則特殊字元與重複出現');

test('targets 省略或空陣列 → 純文字，不建立子節點', () => {
  const a = TP.sentence('今天天氣真好。', null);
  assert.equal(a.className, 'tpz-sentence');
  assert.equal(a.children.length, 0);
  assert.equal(a.textContent, '今天天氣真好。');
  const b = TP.sentence('今天天氣真好。', []);
  assert.equal(b.children.length, 0);
  assert.equal(b.textContent, '今天天氣真好。');
});

test('空白句子加目標 → 沒有子節點也不丟錯', () => {
  const el = TP.sentence('', ['航行']);
  assert.equal(el.children.length, 0);
  assert.equal(el.textContent, '');
});

test('目標不在句子中 → 整句原樣保留', () => {
  const el = TP.sentence('今天天氣好', ['颱風']);
  assert.equal(el.children.length, 1);
  assert.equal(el.textContent, '今天天氣好');
});

test('空字串目標會被過濾掉（不會無限迴圈）', () => {
  const el = TP.sentence('測試', ['']);
  assert.equal(el.children.length, 0);
  assert.equal(el.textContent, '測試');
});

test('物件目標缺少 word → 過濾後視為純文字', () => {
  const el = TP.sentence('測試', [{ word: '' }]);
  assert.equal(el.children.length, 0);
  assert.equal(el.textContent, '測試');
});

test('長詞優先：「航行」與「航」同時存在時取長詞', () => {
  const el = TP.sentence('航行', ['航', '航行']);
  assert.equal(el.children.length, 1);
  assert.equal(el.children[0].children.length, 2);
});

test('長詞優先但短詞仍可單獨命中', () => {
  const el = TP.sentence('航', ['航行', '航']);
  assert.equal(el.children.length, 1);
  assert.equal(el.children[0].children.length, 1);
});

test('預設留白（blank 未指定）→ 字格顯示 □', () => {
  const el = TP.sentence('航行很安全', ['航行']);
  assert.equal(el.children.length, 2);
  assert.equal(el.textContent, '□□很安全');
});

test('blank:false → 顯示國字並使用 answer 狀態', () => {
  const el = TP.sentence('航行很安全', ['航行'], { blank: false });
  assert.equal(el.textContent, '航行很安全');
  assert.ok(hasClass(el.children[0].children[0].children[0], 'tpz-cell--answer'));
});

test('同一目標重複出現 → 每次都被替換，中間文字保留', () => {
  const el = TP.sentence('A航行B航行C', ['航行']);
  assert.deepEqual(kindsOf(el), ['#text', 'span', '#text', 'span', '#text']);
  assert.equal(el.textContent, 'A□□B□□C');
});

test('目標在開頭與結尾都不會漏字或多字', () => {
  assert.equal(TP.sentence('航行很好', ['航行']).textContent, '□□很好');
  assert.equal(TP.sentence('去航行', ['航行']).textContent, '去□□');
});

test('目標出現在句子中間時保留前後文字', () => {
  const el = TP.sentence('航空公司正要航行。', ['航行']);
  assert.equal(el.children.length, 3);
  assert.equal(el.textContent, '航空公司正要□□。');
});

test('正則特殊字元目標只比對字面（. 不是萬用字元）', () => {
  const literal = TP.sentence('a.b', ['a.b']);
  assert.equal(literal.children.length, 1);
  assert.equal(literal.children[0].children.length, 3);
  const notMatch = TP.sentence('axb', ['a.b']);
  assert.equal(notMatch.children.length, 1);
  assert.equal(notMatch.textContent, 'axb');
});

test('正則特殊字元目標（$、全角括號）可比對字面', () => {
  const dollar = TP.sentence('價格$100', ['$100']);
  assert.equal(dollar.children.length, 2);
  assert.equal(dollar.textContent, '價格□□□□');
  const paren = TP.sentence('這是（注）嗎', ['（注）']);
  assert.equal(paren.textContent, '這是□□□嗎');
});

test('物件目標可用 target 欄位（相容舊格式）', () => {
  const el = TP.sentence('測試', [{ target: '測' }], { blank: false });
  assert.equal(el.children.length, 2);
  assert.equal(el.textContent, '測試');
});

test('bopomofo 可用字串（空白分隔）或陣列兩種形式', () => {
  const str = TP.sentence('航行', [{ word: '航行', bopomofo: 'ㄏㄤˊ ㄒㄧㄥˊ' }], { blank: false });
  assert.equal(str.textContent, '航ㄏㄤˊ行ㄒㄧㄥˊ');
  const arr = TP.sentence('航行', [{ word: '航行', bopomofo: ['ㄏㄤˊ', 'ㄒㄧㄥˊ'] }], { blank: false });
  assert.equal(arr.textContent, '航ㄏㄤˊ行ㄒㄧㄥˊ');
});

test('沒有 bopomofoArray 時改用 opts.phonics，缺的字不建立注音欄', () => {
  const el = TP.sentence('航行', ['航行'], { blank: false, phonics: { 航: 'ㄏㄤˊ' } });
  assert.equal(el.textContent, '航ㄏㄤˊ行');
  assert.equal(el.children[0].children[1].children.length, 1);
});

test('showZhuyin:false 時即使有 phonics 也不建立注音欄', () => {
  const el = TP.sentence('一航行', ['航行'], {
    blank: false,
    showZhuyin: false,
    phonics: { 航: 'ㄏㄤˊ', 行: 'ㄒㄧㄥˊ' },
  });
  assert.equal(el.textContent, '一航行');
});

test('status 可覆寫字格狀態', () => {
  const el = TP.sentence('航行', ['航行'], { blank: false, status: 'current' });
  const wrap = el.children[0].children[0];
  assert.ok(hasClass(wrap.children[0], 'tpz-cell--current'));
});

test('非字串句子會被轉成字串', () => {
  assert.equal(TP.sentence(12345, null).textContent, '12345');
});

test('未給句子（undefined）不丟錯（既有輸出為 undefined 字串）', () => {
  let el;
  assert.doesNotThrow(() => {
    el = TP.sentence(undefined, null);
  });
  assert.equal(el.textContent, 'undefined');
});

test('尺寸套用在外層容器', () => {
  assert.ok(hasClass(TP.sentence('航行', ['航行'], { size: 'sm' }), 'tpz--sm'));
});

/* ============================================================
   【5】ruby：空值、長度不一致與非 BMP 字元
   ============================================================ */
group('【5】ruby：空值、長度不一致與非 BMP 字元');

test('null／undefined 不丟錯且沒有子節點', () => {
  const a = TP.ruby(null);
  assert.equal(a.children.length, 0);
  assert.equal(a.className, 'tpz-ruby-wrap');
  assert.equal(TP.ruby(undefined).children.length, 0);
});

test('基本結構：ruby 內含 rt', () => {
  const el = TP.ruby('字', 'ㄗˋ');
  assert.equal(el.children.length, 1);
  assert.equal(el.children[0].tagName, 'ruby');
  assert.equal(el.children[0].children[0].tagName, 'rt');
  assert.equal(el.textContent, '字ㄗˋ');
});

test('注音少於字數 → 後面的 rt 為空字串', () => {
  const el = TP.ruby('ab', ['x']);
  assert.equal(el.children.length, 2);
  assert.equal(el.children[1].textContent, 'b');
  assert.equal(el.children[1].children[0].textContent, '');
});

test('注音多於字數 → 多出的忽略', () => {
  const el = TP.ruby('字', ['ㄗˋ', '多出來']);
  assert.equal(el.children.length, 1);
  assert.equal(el.textContent, '字ㄗˋ');
});

test('非 BMP 字元只算一個字', () => {
  const el = TP.ruby('𠀀', 'ㄅ');
  assert.equal(el.children.length, 1);
  assert.equal(el.textContent, '𠀀ㄅ');
});

/* ============================================================
   【6】模組載入與全域注入（錯誤處理／回歸）
   ============================================================ */
group('【6】模組載入與全域注入（錯誤處理／回歸）');

test('公開 API 形狀與常數', () => {
  for (const key of ['splitSyllable', 'cell', 'word', 'sentence', 'ruby']) {
    assert.equal(typeof TP[key], 'function');
  }
  assert.deepEqual(TP.TONES, ['ˊ', 'ˇ', 'ˋ', '˙']);
  assert.equal(TP.LIGHT_TONE, '˙');
});

test('不帶任何參數呼叫全部 API 都不丟錯', () => {
  assert.doesNotThrow(() => TP.splitSyllable());
  assert.doesNotThrow(() => TP.cell());
  assert.doesNotThrow(() => TP.word());
  assert.doesNotThrow(() => TP.sentence());
  assert.doesNotThrow(() => TP.ruby());
});

test('沒有 module 時（瀏覽器環境）注入 window.TPZhuyin', () => {
  const fakeWindow = {};
  assert.doesNotThrow(() => runSource({ module: undefined, window: fakeWindow, document: undefined }));
  assert.equal(typeof fakeWindow.TPZhuyin, 'object');
  assert.equal(typeof fakeWindow.TPZhuyin.cell, 'function');
});

test('重複載入互不影響（每次都是新的閉包）', () => {
  const other = loadZhuyin();
  assert.notEqual(other.splitSyllable, TP.splitSyllable);
  assert.deepEqual(other.splitSyllable('ㄅ'), TP.splitSyllable('ㄅ'));
  assert.deepEqual(other.TONES, TP.TONES);
});

/* ---------- 收尾 ---------- */
console.log('');
console.log('====================================================');
if (failures.length === 0) {
  console.log(`🎉 全部通過：${passed} 項通過，0 項失敗。`);
} else {
  console.log(`測試結果：${passed} 項通過，${failures.length} 項失敗。`);
  for (const { name } of failures) console.log(`  - 失敗：${name}`);
  process.exitCode = 1;
}
console.log('（僅使用 Node 內建模組；未連線網路、未寫入任何檔案）');
