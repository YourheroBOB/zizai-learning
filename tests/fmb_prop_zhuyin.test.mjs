import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const zhuyin = createRequire(import.meta.url)('../src/zhuyin.js');
const children = (node) => node?.children ?? [];
const hasClass = (node, name) => String(node?.className ?? '').split(/\s+/).includes(name);

function findAll(node, className, result = []) {
  if (!node || node.nodeType === 3) return result;
  if (hasClass(node, className)) result.push(node);
  for (const child of children(node)) findAll(child, className, result);
  return result;
}

function visibleText(node) {
  if (node?.nodeType === 3) return String(node.textContent ?? '');
  if (hasClass(node, 'tpz-col')) return '';
  let text = String(node?._text ?? '');
  for (const child of children(node)) text += visibleText(child);
  return text;
}

test('splitSyllable：拆解後重組保留符號順序與調號', () => {
  const cases = [
    ['ㄅㄚ', ['ㄅ', 'ㄚ'], null],
    ['ㄏㄤˊ', ['ㄏ', 'ㄤ'], 'ˊ'],
    ['ㄒㄧㄥˇ', ['ㄒ', 'ㄧ', 'ㄥ'], 'ˇ'],
    ['˙ㄕ', ['ㄕ'], '˙'],
    ['ㄦˋ', ['ㄦ'], 'ˋ'],
    ['', [], null],
  ];

  for (const [input, expectedSymbols, expectedTone] of cases) {
    const parsed = zhuyin.splitSyllable(input);
    assert.deepEqual(parsed.symbols, expectedSymbols);
    assert.equal(parsed.tone, expectedTone);

    const rebuilt = parsed.tone === '˙'
      ? `˙${parsed.symbols.join('')}`
      : `${parsed.symbols.join('')}${parsed.tone ?? ''}`;
    assert.equal(rebuilt, input);
  }
});

test('cell 與 word：字序、格數、注音配對及缺漏邊界保持', () => {
  const group = zhuyin.word('航行', ['ㄏㄤˊ', 'ㄒㄧㄥˊ']);
  const wraps = children(group).filter((node) => hasClass(node, 'tpz-wrap'));
  assert.equal(wraps.length, Array.from('航行').length);
  assert.deepEqual(
    wraps.map((wrap) => findAll(wrap, 'tpz-cell__char')[0]?.textContent),
    ['航', '行'],
  );
  assert.equal(wraps.filter((wrap) => findAll(wrap, 'tpz-col').length === 1).length, 2);

  const missingPhonics = zhuyin.word(['甲', '乙'], ['ㄐㄧㄚˇ']);
  const missingWraps = children(missingPhonics).filter((node) => hasClass(node, 'tpz-wrap'));
  assert.equal(missingWraps.length, 2);
  assert.equal(findAll(missingWraps[0], 'tpz-col').length, 1);
  assert.equal(findAll(missingWraps[1], 'tpz-col').length, 0);

  const blank = zhuyin.cell('字', 'ㄗˋ', { blank: true, size: 'sm' });
  assert.ok(hasClass(blank, 'tpz--sm'));
  assert.equal(findAll(blank, 'tpz-cell__char')[0].textContent, '□');
  assert.equal(findAll(zhuyin.cell('字', ''), 'tpz-col').length, 0);
});

test('sentence：長詞優先、不重疊替換，解答文字往返一致', () => {
  const text = '航行行';
  const targets = [
    { word: '航', bopomofoArray: ['ㄏㄤˊ'] },
    { word: '航行', bopomofoArray: ['ㄏㄤˊ', 'ㄒㄧㄥˊ'] },
    { word: '行', bopomofoArray: ['ㄒㄧㄥˊ'] },
  ];
  const answer = zhuyin.sentence(text, targets, { blank: false });
  assert.equal(visibleText(answer), text);
  assert.deepEqual(
    findAll(answer, 'tpz-cell__char').map((node) => node.textContent),
    ['航', '行', '行'],
  );

  const student = zhuyin.sentence(text, targets, { blank: true });
  assert.deepEqual(
    findAll(student, 'tpz-cell__char').map((node) => node.textContent),
    ['□', '□', '□'],
  );
  assert.equal(findAll(student, 'tpz-group').length, findAll(answer, 'tpz-group').length);
});

test('ruby：每個字一個 ruby，注音不足時仍保留字數', () => {
  const result = zhuyin.ruby('字在學習', ['ㄗˋ']);
  const rubies = findAll(result, 'tpz-ruby');
  assert.equal(rubies.length, Array.from('字在學習').length);
  assert.deepEqual(
    rubies.map((ruby) => children(ruby).find((node) => node.tagName === 'rt')?.textContent),
    ['ㄗˋ', '', '', ''],
  );
});
