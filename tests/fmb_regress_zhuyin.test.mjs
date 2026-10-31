import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const TPZhuyin = require('../src/zhuyin.js');

function collectByClass(node, className, result = []) {
  const classes = String(node?.className || '').split(/\s+/).filter(Boolean);
  if (classes.includes(className)) result.push(node);
  for (const child of node?.children || []) {
    collectByClass(child, className, result);
  }
  return result;
}

test('句中目標含 regex 中繼符號時仍以字面文字比對', () => {
  const output = TPZhuyin.sentence(
    '前甲+乙後甲+乙',
    [
      {
        word: '甲+乙',
        bopomofoArray: ['ㄐㄧㄚ', 'ㄨ', 'ㄧˋ'],
      },
    ],
    { blank: false },
  );

  assert.equal(collectByClass(output, 'tpz-group').length, 2);
  assert.deepEqual(
    collectByClass(output, 'tpz-cell__char').map((node) => node.textContent),
    ['甲', '+', '乙', '甲', '+', '乙'],
  );
});

test('重疊目標優先使用較長詞語且所有出現位置都只替換一次', () => {
  const output = TPZhuyin.sentence(
    'ABCD BC',
    [
      { word: 'BC', bopomofoArray: ['ㄅ', 'ㄘ'] },
      { word: 'ABCD', bopomofoArray: ['ㄟ', 'ㄅ', 'ㄘ', 'ㄉ'] },
    ],
    { blank: false },
  );

  assert.equal(collectByClass(output, 'tpz-group').length, 2);
  assert.deepEqual(
    collectByClass(output, 'tpz-cell__char').map((node) => node.textContent),
    ['A', 'B', 'C', 'D', 'B', 'C'],
  );
});
