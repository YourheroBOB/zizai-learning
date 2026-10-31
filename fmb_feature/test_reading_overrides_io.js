#!/usr/bin/env node
/* reading-overrides-io 的單元測試：node fmb_feature/test_reading_overrides_io.js（零依賴） */
'use strict';
const assert = require('node:assert');
const M = require('./reading-overrides-io.js');

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; failures.push(name + ' → ' + e.message); }
}

/* ===== normalizeBopomofo：合法 ===== */
t('ㄏㄤˊ 原樣通過', () => assert.strictEqual(M.normalizeBopomofo('ㄏㄤˊ').value, 'ㄏㄤˊ'));
t('˙ㄕ 輕聲前置通過', () => assert.strictEqual(M.normalizeBopomofo('˙ㄕ').value, '˙ㄕ'));
t('ㄕ˙ 輕聲後置正規化為前置', () => assert.strictEqual(M.normalizeBopomofo('ㄕ˙').value, '˙ㄕ'));
t('ㄋㄧㄡˇ 三符號 imf 通過', () => assert.strictEqual(M.normalizeBopomofo('ㄋㄧㄡˇ').value, 'ㄋㄧㄡˇ'));
t('ㄐㄧ im 通過', () => assert.strictEqual(M.normalizeBopomofo('ㄐㄧ').value, 'ㄐㄧ'));
t('ㄧㄢˇ mf 通過', () => assert.strictEqual(M.normalizeBopomofo('ㄧㄢˇ').value, 'ㄧㄢˇ'));
t('空白與全形空白被移除', () => assert.strictEqual(M.normalizeBopomofo(' ㄏㄤˊ　').value, 'ㄏㄤˊ'));
t('第一聲符號 ˉ 接受並去除', () => assert.strictEqual(M.normalizeBopomofo('ˉㄅ').value, 'ㄅ'));
t('無聲調符號通過', () => assert.strictEqual(M.normalizeBopomofo('ㄕㄨ').value, 'ㄕㄨ'));

/* ===== normalizeBopomofo：不合法 ===== */
const bad = (name, input, code) => t(name, () => {
  const r = M.normalizeBopomofo(input);
  assert.strictEqual(r.ok, false, '應拒絕：' + JSON.stringify(input));
  assert.strictEqual(r.code, code, '代碼應為 ' + code + '，實際 ' + r.code);
});
bad('英數字元', 'abc', 'bad_char');
bad('空字串', '', 'empty');
bad('兩個音節（五符號）', 'ㄏㄤˊㄒㄧㄥˊ', 'too_many_symbols');
bad('兩個聲調', 'ㄏㄤˊˇ', 'bad_tone_count');
bad('聲調在前', 'ˊㄏㄤ', 'bad_tone_position');
bad('聲調在中間', 'ㄏˊㄤ', 'bad_tone_position');
bad('輕聲加聲調', '˙ㄕˊ', 'bad_tone_count');
bad('順序錯（介音在前）', 'ㄧㄋㄡ', 'bad_order');
bad('順序錯（韻母在前）', 'ㄜㄧ', 'bad_order');
bad('只有聲調', 'ˊ', 'no_symbol');
bad('非字串（數字）', 123, 'not_string');
bad('非字串（null）', null, 'not_string');

/* ===== validateEntry ===== */
t('物件格式通過（含 note 與字串 ts）', () => {
  const r = M.validateEntry('好', { bopomofo: 'ㄏㄠˇ', note: '課本讀音', ts: '123' });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.value, { bopomofo: 'ㄏㄠˇ', note: '課本讀音', ts: 123 });
});
t('字串簡寫通過', () => {
  const r = M.validateEntry('行', 'ㄒㄧㄥˊ');
  assert.deepStrictEqual(r.value, { bopomofo: 'ㄒㄧㄥˊ', note: '', ts: null });
});
t('note 去控制字元', () => {
  const r = M.validateEntry('好', { bopomofo: 'ㄏㄠˇ', note: 'a\u0000b' });
  assert.strictEqual(r.value.note, 'a b');
});
t('note 超過 100 字截斷', () => {
  const r = M.validateEntry('好', { bopomofo: 'ㄏㄠˇ', note: 'x'.repeat(300) });
  assert.strictEqual(r.value.note.length, 100);
});
t('note 非字串視為空', () => {
  const r = M.validateEntry('好', { bopomofo: 'ㄏㄠˇ', note: 42 });
  assert.strictEqual(r.value.note, '');
});
t('ts 不合法為 null', () => {
  const r = M.validateEntry('好', { bopomofo: 'ㄏㄠˇ', ts: 'abc' });
  assert.strictEqual(r.value.ts, null);
});
bad('鍵名不是國字（AB）', undefined, 'x');
t('鍵名不是國字 → bad_key', () => assert.strictEqual(M.validateEntry('AB', 'ㄏㄠˇ').code, 'bad_key'));
t('空鍵名 → bad_key', () => assert.strictEqual(M.validateEntry('', 'ㄏㄠˇ').code, 'bad_key'));
t('值為 null → bad_entry', () => assert.strictEqual(M.validateEntry('好', null).code, 'bad_entry'));
t('值為陣列 → bad_entry', () => assert.strictEqual(M.validateEntry('好', ['ㄏㄠˇ']).code, 'bad_entry'));

/* ===== parseImport ===== */
t('物件格式：略過說明欄位、取有效修改', () => {
  const r = M.parseImport('{"version":1,"app":"zizai","好":{"bopomofo":"ㄏㄠˇ","note":"n","ts":5}}');
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(r.entries.length, 1);
  assert.strictEqual(r.entries[0].char, '好');
  assert.strictEqual(r.stats.skippedMeta, 2);
});
t('陣列格式通過', () => {
  const r = M.parseImport('[{"char":"行","bopomofo":"ㄒㄧㄥˊ"}]');
  assert.ok(r.ok);
  assert.deepStrictEqual(r.entries[0], { char: '行', bopomofo: 'ㄒㄧㄥˊ', note: '', ts: null });
});
t('字串值（舊匯出相容）通過', () => {
  const r = M.parseImport('{"好":"ㄏㄠˇ"}');
  assert.ok(r.ok);
  assert.strictEqual(r.entries[0].bopomofo, 'ㄏㄠˇ');
});
t('不是 JSON → bad_json', () => assert.strictEqual(M.parseImport('{').code, 'bad_json'));
t('最外層不是物件也不是陣列 → bad_shape', () => assert.strictEqual(M.parseImport('"ㄏㄠˇ"').code, 'bad_shape'));
t('超過大小上限 → too_large', () => assert.strictEqual(M.parseImport('"' + 'x'.repeat(600000) + '"').code, 'too_large'));
t('全數無效 → no_entry 並附錯誤明細', () => {
  const r = M.parseImport('{"好":{"bopomofo":"zz"}}');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'no_entry');
  assert.strictEqual(r.errors[0].code, 'bad_char');
});
t('危險鍵名被拒且不汙染原型', () => {
  const r = M.parseImport('{"__proto__":{"bopomofo":"ㄏㄠˇ"},"好":{"bopomofo":"ㄏㄠˇ"}}');
  assert.ok(r.ok);
  assert.strictEqual(r.entries.length, 1);
  assert.strictEqual(({}).polluted, undefined);
});
t('錯誤清單有上限（50 筆）', () => {
  const obj = {};
  for (let i = 0; i < 60; i++) obj['字' + i] = { bopomofo: 'zz' }; /* 鍵名兩個字會 bad_key，照樣進錯誤清單 */
  obj['好'] = { bopomofo: 'ㄏㄠˇ' };
  const r = M.parseImport(JSON.stringify(obj));
  assert.ok(r.ok);
  assert.strictEqual(r.errors.length, M.LIMITS.maxErrors);
  assert.strictEqual(r.entries.length, 1);
});
t('筆數超過上限 → too_many_entries', () => {
  const obj = {};
  for (let i = 0; i < 5001; i++) obj['好'] = { bopomofo: 'ㄏㄠˇ' }; /* 同鍵覆蓋測的是筆數統計前 */
  const arr = [];
  for (let i = 0; i < 5001; i++) arr.push({ char: '好', bopomofo: 'ㄏㄠˇ' });
  assert.strictEqual(M.parseImport(JSON.stringify(arr)).code, 'too_many_entries');
});

/* ===== mergeOverrides ===== */
const cur = { '好': { bopomofo: 'ㄏㄠˇ', note: 'A', ts: 5 } };
t('新增不衝突的字', () => {
  const r = M.mergeOverrides(cur, { '行': { bopomofo: 'ㄒㄧㄥˊ', note: '', ts: 1 } });
  assert.strictEqual(r.added, 1);
  assert.ok(r.merged['行']);
  assert.strictEqual(r.merged['好'].note, 'A');
});
t('衝突預設以現有為準（keep）', () => {
  const r = M.mergeOverrides(cur, { '好': { bopomofo: 'ㄏㄠ', note: 'B', ts: 9 } });
  assert.strictEqual(r.kept, 1);
  assert.strictEqual(r.merged['好'].bopomofo, 'ㄏㄠˇ');
  assert.strictEqual(r.conflicts[0].resolved, 'kept');
});
t("衝突策略 'incoming'：匯入為準", () => {
  const r = M.mergeOverrides(cur, { '好': { bopomofo: 'ㄏㄠ', note: 'B', ts: 9 } }, { conflict: 'incoming' });
  assert.strictEqual(r.updated, 1);
  assert.strictEqual(r.merged['好'].bopomofo, 'ㄏㄠ');
});
t("衝突策略 'newer'：ts 新者勝", () => {
  const newer = M.mergeOverrides(cur, { '好': { bopomofo: 'ㄏㄠ', note: 'B', ts: 9 } }, { conflict: 'newer' });
  assert.strictEqual(newer.merged['好'].bopomofo, 'ㄏㄠ');
  const older = M.mergeOverrides(cur, { '好': { bopomofo: 'ㄏㄠ', note: 'B', ts: 3 } }, { conflict: 'newer' });
  assert.strictEqual(older.merged['好'].bopomofo, 'ㄏㄠˇ');
});
t('內容相同算 same、不算衝突', () => {
  const r = M.mergeOverrides(cur, { '好': { bopomofo: 'ㄏㄠˇ', note: 'A', ts: 9 } });
  assert.strictEqual(r.same, 1);
  assert.strictEqual(r.conflicts.length, 0);
});
t('匯入端含無效項目會被略過並計入 invalid', () => {
  const r = M.mergeOverrides(cur, { 'AB': 'ㄏㄠˇ', '行': 'ㄒㄧㄥˊ' });
  assert.strictEqual(r.invalid, 1);
  assert.strictEqual(r.added, 1);
  assert.ok(!('AB' in r.merged));
});
t('吃 parseImport 的 entries（陣列）也通', () => {
  const p = M.parseImport('{"行":"ㄒㄧㄥˊ"}');
  const r = M.mergeOverrides(cur, p.entries);
  assert.strictEqual(r.added, 1);
});

/* ===== serializeOverrides ===== */
t('鍵排序輸出、結尾換行、可往返解析', () => {
  const o = { '行': { bopomofo: 'ㄒㄧㄥˊ', note: '', ts: null }, '好': { bopomofo: 'ㄏㄠˇ', note: 'A', ts: 5 } };
  const s = M.serializeOverrides(o);
  assert.ok(s.endsWith('\n'));
  assert.ok(s.indexOf('"好"') < s.indexOf('"行"'));
  assert.deepStrictEqual(JSON.parse(s), o);
});

/* ===== 模組不碰環境 ===== */
t('不依賴 DOM／fetch／localStorage', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'reading-overrides-io.js'), 'utf8');
  assert.ok(!/document\.|localStorage|fetch\(|XMLHttpRequest/.test(src), '不得使用 DOM／儲存／網路');
});

console.log('====================================================');
console.log('  fmb_feature：讀音修改匯入／合併（reading-overrides-io）測試');
console.log('====================================================');
console.log('通過 ' + pass + ' 項，失敗 ' + fail + ' 項');
if (fail > 0) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exitCode = 1;
} else {
  console.log('🎉 全部通過');
}
