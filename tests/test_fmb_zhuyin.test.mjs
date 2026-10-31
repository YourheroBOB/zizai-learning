import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const TPZhuyin = require('../src/zhuyin.js');

test('splitSyllable 處理一般注音、輕聲與空值', () => {
  assert.deepEqual(TPZhuyin.splitSyllable('ㄏㄤˊ'), {
    symbols: ['ㄏ', 'ㄤ'],
    tone: 'ˊ',
  });
  assert.deepEqual(TPZhuyin.splitSyllable('˙ ㄕ'), {
    symbols: ['ㄕ'],
    tone: '˙',
  });
  assert.deepEqual(TPZhuyin.splitSyllable(null), {
    symbols: [],
    tone: null,
  });
  assert.deepEqual(TPZhuyin.splitSyllable('   '), {
    symbols: [],
    tone: null,
  });
});

test('cell 留白時使用不可讀取的方框，且可停用注音欄', () => {
  const blank = TPZhuyin.cell('', 'ㄗˋ', { blank: true });
  const cell = blank.children[0];
  const character = cell.children[1];

  assert.equal(cell.className, 'tpz-cell tpz-cell--blank');
  assert.equal(character.textContent, '□');
  assert.equal(character.attributes['aria-hidden'], 'true');
  assert.equal(cell.attributes['aria-label'], '空格');
  assert.equal(blank.children.length, 2);

  const withoutZhuyin = TPZhuyin.cell('字', 'ㄗˋ', {
    blank: true,
    showZhuyin: false,
  });
  assert.equal(withoutZhuyin.children.length, 1);
});

test('word 以 Unicode 字元切分，並容忍注音陣列比文字短', () => {
  const rendered = TPZhuyin.word('𠮷行', ['ㄐㄧˊ']);

  assert.equal(rendered.children.length, 2);
  assert.equal(rendered.children[0].children[0].children[1].textContent, '𠮷');
  assert.equal(rendered.children[1].children[0].children[1].textContent, '行');
  assert.equal(rendered.children[0].children.length, 2);
  assert.equal(rendered.children[1].children.length, 1);
});

test('sentence 優先匹配較長目標，且不重複消耗重疊文字', () => {
  const rendered = TPZhuyin.sentence(
    '航行再航',
    [
      { word: '航', bopomofoArray: ['ㄏㄤˊ'] },
      { word: '航行', bopomofoArray: ['ㄏㄤˊ', 'ㄒㄧㄥˊ'] },
    ],
  );
  const groups = rendered.children.filter((child) => child.className === 'tpz-group');

  assert.equal(groups.length, 2);
  assert.equal(groups[0].children.length, 2);
  assert.equal(groups[1].children.length, 1);
  assert.equal(rendered.children[1].textContent, '再');
});

test('sentence 對正規表示式特殊字元採字面匹配', () => {
  const rendered = TPZhuyin.sentence('A+B', ['A+B']);
  const groups = rendered.children.filter((child) => child.className === 'tpz-group');

  assert.equal(groups.length, 1);
  assert.equal(groups[0].children.length, 3);
});

test('sentence 沒有目標或沒有命中時保留原始文字', () => {
  const plain = TPZhuyin.sentence('保留原文', []);
  const unmatched = TPZhuyin.sentence('保留原文', [{ word: '不存在' }]);

  assert.equal(plain.textContent, '保留原文');
  assert.equal(unmatched.textContent, '保留原文');
  assert.equal(unmatched.children.some((child) => child.className === 'tpz-group'), false);
});
