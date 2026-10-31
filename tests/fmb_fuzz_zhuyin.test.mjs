import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const TPZhuyin = require('../src/zhuyin.js');

const SEED = 0x5a17c0de;
const CASES = 1800;
const TONES = new Set(['ˊ', 'ˇ', 'ˋ', '˙']);
const ALPHABET = Array.from(
  'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦˊˇˋ˙ .,!?[]{}()\\^$|*+一二三〇甲乙丙丁😀🧪é\u0301\u0000\t\n\r　',
);

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function intBetween(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick(rng, values) {
  return values[intBetween(rng, 0, values.length - 1)];
}

function randomString(rng, maxLength = 32) {
  const length = intBetween(rng, 0, maxLength);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += pick(rng, ALPHABET);
  }
  return result;
}

function randomOptions(rng) {
  return {
    size: pick(rng, [undefined, 'sm', 'md', 'lg', 'xl', 'print']),
    blank: rng() < 0.5,
    showZhuyin: rng() < 0.5,
    status: pick(rng, ['learned', 'current', 'upcoming', 'blank', 'answer']),
  };
}

test('固定亂數種子 fuzz 注音解析與轉換函式的不變量', () => {
  const rng = makeRng(SEED);
  const scalarInputs = ['', '˙', 'ㄓㄨㄥˋ', null, undefined, 0, false];

  for (let i = 0; i < CASES; i += 1) {
    const raw = i < scalarInputs.length ? scalarInputs[i] : randomString(rng);
    const parsed = TPZhuyin.splitSyllable(raw);

    assert.ok(Array.isArray(parsed.symbols), `第 ${i} 組：symbols 應為陣列`);
    assert.ok(
      parsed.tone === null || TONES.has(parsed.tone),
      `第 ${i} 組：tone 應為有效調號或 null`,
    );

    const source = String(raw == null ? '' : raw).trim();
    let expectedTone = null;
    let expectedSymbolCount = 0;
    for (const char of source) {
      if (TONES.has(char)) expectedTone = char;
      else if (char !== ' ') expectedSymbolCount += 1;
    }
    assert.equal(parsed.symbols.length, expectedSymbolCount, `第 ${i} 組：解析符號數`);
    assert.equal(parsed.tone, expectedTone, `第 ${i} 組：最後一個調號`);
    assert.ok(
      parsed.symbols.every((symbol) => typeof symbol === 'string' && Array.from(symbol).length === 1),
      `第 ${i} 組：每個解析符號應是單一字元`,
    );

    const char = randomString(rng, 12);
    const bopomofo = randomString(rng, 16);
    const cell = TPZhuyin.cell(char, bopomofo, randomOptions(rng));
    assert.ok(cell && cell.className.includes('tpz-wrap'), `第 ${i} 組：cell 外層結構`);
    assert.equal(
      cell.children.length,
      bopomofo && cell.children.length === 2 ? 2 : 1,
      `第 ${i} 組：cell 子節點數應維持字格及可選注音欄`,
    );

    const chars = rng() < 0.5
      ? randomString(rng, 12)
      : Array.from(randomString(rng, 12));
    const expectedCharCount = Array.isArray(chars)
      ? chars.length
      : Array.from(String(chars == null ? '' : chars)).length;
    const phonics = Array.from({ length: expectedCharCount }, () => randomString(rng, 8));
    const word = TPZhuyin.word(chars, rng() < 0.5 ? phonics : randomString(rng, 24), randomOptions(rng));
    assert.ok(word && word.className.includes('tpz-group'), `第 ${i} 組：word 容器結構`);
    assert.equal(word.children.length, expectedCharCount, `第 ${i} 組：字格數應等於字數`);
    assert.ok(
      word.children.every((child) => child.className.includes('tpz-wrap')),
      `第 ${i} 組：每個詞語子項目都應是字格`,
    );

    const sentenceText = randomString(rng, 36);
    const target = randomString(rng, 5);
    const targets = rng() < 0.5
      ? []
      : [
          target,
          { word: randomString(rng, 5), bopomofoArray: phonics.slice(0, 4) },
          { target: randomString(rng, 5) },
        ];
    const sentence = TPZhuyin.sentence(sentenceText, targets, randomOptions(rng));
    assert.ok(sentence && sentence.className.includes('tpz-sentence'), `第 ${i} 組：sentence 結構`);
    assert.equal(typeof sentence.textContent, 'string', `第 ${i} 組：sentence 文字輸出型別`);
    if (targets.length === 0) {
      assert.equal(sentence.textContent, sentenceText, `第 ${i} 組：沒有目標時應保留原文`);
    }

    const rubyText = randomString(rng, 16);
    const ruby = TPZhuyin.ruby(rubyText, phonics);
    assert.ok(ruby && ruby.className.includes('tpz-ruby-wrap'), `第 ${i} 組：ruby 容器結構`);
    assert.equal(ruby.children.length, Array.from(rubyText).length, `第 ${i} 組：ruby 項目數`);
    assert.ok(
      ruby.children.every((child) => child.tagName === 'ruby' && child.children.length === 1),
      `第 ${i} 組：ruby 子項目結構`,
    );
  }
});
