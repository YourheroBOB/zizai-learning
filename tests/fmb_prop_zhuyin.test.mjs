import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { splitSyllable } = require('../src/zhuyin.js');

function* symbolSequences(alphabet, maxLength, prefix = []) {
  if (prefix.length > 0) yield prefix;
  if (prefix.length === maxLength) return;

  for (const symbol of alphabet) {
    yield* symbolSequences(alphabet, maxLength, [...prefix, symbol]);
  }
}

function canonicalSyllable(symbols, tone) {
  const body = symbols.join('');
  if (tone === '˙') return `˙${body}`;
  return `${body}${tone || ''}`;
}

test('splitSyllable 對多組注音符號與聲調維持往返一致', () => {
  // 這是表示形式的不變量測試，不判斷組合是否為有效國語讀音。
  const alphabet = ['ㄅ', 'ㄧ', 'ㄥ', 'ㄩ'];
  const tones = [null, 'ˊ', 'ˇ', 'ˋ', '˙'];
  let cases = 0;

  for (const symbols of symbolSequences(alphabet, 4)) {
    for (const tone of tones) {
      const body = symbols.join(' ');
      const encoded = tone === '˙' ? `˙${body}` : `${body}${tone || ''}`;
      const parsed = splitSyllable(` \t${encoded}\n`);

      assert.deepEqual(parsed, { symbols, tone });
      assert.deepEqual(splitSyllable(canonicalSyllable(parsed.symbols, parsed.tone)), parsed);
      cases += 1;
    }
  }

  assert.equal(cases, 1700);
});

test('splitSyllable 對空值與純空白輸入回傳空符號且沒有聲調', () => {
  for (const input of ['', '   ', '\t\n', null, undefined]) {
    assert.deepEqual(splitSyllable(input), { symbols: [], tone: null });
  }
});
