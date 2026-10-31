import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const TPZhuyin = require('../src/zhuyin.js');

const DATA_FILES = [
  'data/curriculum-115-1.json',
  'data/curriculum-115-1-g1.json',
  'data/curriculum-115-1-g3.json',
  'data/curriculum-115-1-g4.json',
  'data/curriculum-115-1-g5.json',
  'data/curriculum-115-1-g6.json',
  'data/curriculum-110.json',
  'data/curriculum-demo.json',
];

// 嚴格檢查只套用於 tools/build_grades_from_sources.py 產生、且 data/schema.json
// 明確規範的 115-1 六個檔案。110 學年度與體驗版是不同管線產生的資料
// （沒有頂層 publishers，且已知有欄位缺口，見 data/GAPS.md），
// 因此改用「結構自動探索 + 缺口盤點」的方式驗證，不套用 115-1 的完整 schema。
const STRICT_FILES = new Set([
  'data/curriculum-115-1.json',
  'data/curriculum-115-1-g1.json',
  'data/curriculum-115-1-g3.json',
  'data/curriculum-115-1-g4.json',
  'data/curriculum-115-1-g5.json',
  'data/curriculum-115-1-g6.json',
]);

const LOOSE_FILES = DATA_FILES.filter((relativePath) => !STRICT_FILES.has(relativePath));

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

function descendantsWithClass(node, className, found = []) {
  if ((node.className || '').split(/\s+/).includes(className)) found.push(node);
  for (const child of node.children || []) descendantsWithClass(child, className, found);
  return found;
}

function isLessonLike(node) {
  return Boolean(node)
    && typeof node === 'object'
    && Array.isArray(node.characters)
    && Array.isArray(node.words);
}

/**
 * 在未知的 JSON 結構中找出「課次群組」：只要是陣列，且陣列元素同時具有
 * characters 與 words 陣列，就視為一組課次（例如某個版本的 lessons）。
 * 不假設頂層鍵名（publishers / versions / curriculum…皆可）。
 */
function collectLessonGroups(node, groups = []) {
  if (Array.isArray(node)) {
    const lessons = node.filter(isLessonLike);
    if (lessons.length > 0) {
      groups.push({ lessons });
      for (const item of node.filter((entry) => !lessons.includes(entry))) {
        collectLessonGroups(item, groups);
      }
      return groups;
    }
    for (const item of node) collectLessonGroups(item, groups);
    return groups;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectLessonGroups(value, groups);
  }
  return groups;
}

/* ---------- 嚴格檢查（115-1，符合 data/schema.json） ---------- */

function validateCharacterStrict(character, label) {
  assert.equal(typeof character.char, 'string', `${label}: char 必須是字串`);
  assert.equal(Array.from(character.char).length, 1, `${label}: 每筆生字應為單一字元`);
  assert.equal(typeof character.bopomofo, 'string', `${label}: bopomofo 必須是字串`);
  assert.ok(character.bopomofo.length > 0, `${label}: bopomofo 不可為空`);
  assert.equal(typeof character.radical, 'string', `${label}: radical 必須是字串`);
  assert.equal(typeof character.strokes, 'number', `${label}: strokes 必須是數字`);
  assert.ok(Number.isInteger(character.strokes), `${label}: strokes 必須是整數`);
}

function validateWordStrict(word, label) {
  assert.equal(typeof word.word, 'string', `${label}: word 必須是字串`);
  const chars = Array.from(word.word);
  assert.ok(chars.length > 0, `${label}: 詞語不可為空`);
  assert.ok(Array.isArray(word.bopomofoArray), `${label}: bopomofoArray 必須是陣列`);
  assert.equal(word.bopomofoArray.length, chars.length, `${label}: 詞語與注音音節數須一致`);
  assert.ok(
    word.bopomofoArray.every((syllable) => typeof syllable === 'string' && syllable.length > 0),
    `${label}: 詞語不可包含空白注音音節`,
  );
  if (typeof word.bopomofo === 'string') {
    assert.equal(
      word.bopomofo.trim().split(/\s+/).filter(Boolean).length,
      word.bopomofoArray.length,
      `${label}: bopomofo 與 bopomofoArray 音節數須一致`,
    );
  }
}

function validateLessonStrict(lesson, label) {
  assert.ok(Number.isInteger(lesson.lessonNo), `${label}: lessonNo 必須是整數`);
  assert.equal(typeof lesson.title, 'string', `${label}: title 必須是字串`);
  for (const character of lesson.characters) {
    validateCharacterStrict(character, `${label}/${lesson.lessonNo}`);
  }
  for (const word of lesson.words) {
    validateWordStrict(word, `${label}/${lesson.lessonNo}`);
  }
}

/* ---------- 寬鬆檢查（110／體驗版）：只驗證可保證的不變式，其餘記為缺口 ---------- */

function validateCharacterLoose(character, label, issues) {
  const char = character && character.char;
  if (typeof char !== 'string' || Array.from(char).length !== 1) {
    issues.push(`${label}: 生字不是單一字元`);
  }
  if (typeof character.bopomofo !== 'string') {
    issues.push(`${label}: bopomofo 不是字串`);
  } else if (character.bopomofo.length === 0) {
    issues.push(`${label}: bopomofo 為空（資料缺口）`);
  }
  if (character.radical != null && typeof character.radical !== 'string') {
    issues.push(`${label}: radical 不是字串`);
  }
  if (character.strokes != null && typeof character.strokes !== 'number') {
    issues.push(`${label}: strokes 不是數字`);
  }
}

function validateWordLoose(word, label, issues) {
  const text = word && word.word;
  if (typeof text !== 'string' || Array.from(text).length === 0) {
    issues.push(`${label}: 詞語不是非空字串`);
    return;
  }
  if (!Array.isArray(word.bopomofoArray)) {
    issues.push(`${label}: 詞語缺少 bopomofoArray（資料缺口）`);
    return;
  }
  if (!word.bopomofoArray.every((syllable) => typeof syllable === 'string')) {
    issues.push(`${label}: 詞語注音含非字串元素`);
    return;
  }
  // 注音不完整時只記錄缺口；完整時仍要求音節數等於字數。
  if (word.bopomofoArray.some((syllable) => syllable.length === 0)) {
    issues.push(`${label}: 詞語含空白注音音節（資料缺口）`);
    return;
  }
  assert.equal(
    word.bopomofoArray.length,
    Array.from(text).length,
    `${label}: 詞語與注音音節數須一致`,
  );
}

function collectLessonIssues(lesson, label, issues) {
  if (lesson.lessonNo != null && !Number.isInteger(lesson.lessonNo)) {
    issues.push(`${label}: lessonNo 不是整數`);
  }
  if (lesson.title != null && typeof lesson.title !== 'string') {
    issues.push(`${label}: title 不是字串`);
  }
  for (const character of lesson.characters) {
    validateCharacterLoose(character, `${label}/${lesson.lessonNo ?? '?'}`, issues);
  }
  for (const word of lesson.words) {
    validateWordLoose(word, `${label}/${lesson.lessonNo ?? '?'}`, issues);
  }
}

/* ---------- 測試 ---------- */

test('教材資料的課次、生字欄位與詞語注音長度一致', () => {
  for (const relativePath of DATA_FILES) {
    const strict = STRICT_FILES.has(relativePath);
    const data = readJson(relativePath);

    assert.ok(data && typeof data === 'object', `${relativePath}: 必須是 JSON 物件`);
    assert.ok(data.meta && typeof data.meta === 'object', `${relativePath}: 缺少 meta`);
    assert.equal(typeof data.meta.title, 'string', `${relativePath}: meta.title 必須是字串`);

    const groups = collectLessonGroups(data);
    assert.ok(groups.length > 0, `${relativePath}: 找不到任何課次資料（characters／words 陣列）`);

    let lessonCount = 0;
    for (const group of groups) {
      const seenLessonNos = new Set();
      for (const lesson of group.lessons) {
        lessonCount += 1;
        if (Number.isInteger(lesson.lessonNo)) {
          assert.ok(
            !seenLessonNos.has(lesson.lessonNo),
            `${relativePath}: 同一群組內 lessonNo ${lesson.lessonNo} 重複`,
          );
          seenLessonNos.add(lesson.lessonNo);
        }
        if (strict) {
          validateLessonStrict(lesson, relativePath);
        } else {
          collectLessonIssues(lesson, relativePath, []);
        }
      }
    }
    assert.ok(lessonCount > 0, `${relativePath}: 課次數不可為 0`);
  }
});

test('115-1 資料檔的頂層 publishers 課次與 schema 基本要求一致', () => {
  for (const relativePath of STRICT_FILES) {
    const data = readJson(relativePath);
    assert.ok(
      data.publishers && typeof data.publishers === 'object',
      `${relativePath}: 缺少 publishers（115-1 資料檔應符合 data/schema.json）`,
    );
    const publisherKeys = Object.keys(data.publishers);
    assert.ok(publisherKeys.length > 0, `${relativePath}: publishers 不可為空`);

    for (const publisherKey of publisherKeys) {
      const publisher = data.publishers[publisherKey];
      assert.ok(Array.isArray(publisher.lessons), `${relativePath}/${publisherKey}: lessons 必須是陣列`);
      assert.ok(publisher.lessons.length > 0, `${relativePath}/${publisherKey}: 不應沒有課次`);
      if (Number.isInteger(publisher.totalLessons)) {
        assert.equal(
          publisher.totalLessons,
          publisher.lessons.length,
          `${relativePath}/${publisherKey}: totalLessons 與 lessons 數量不一致`,
        );
      }
    }
  }
});

// 110 學年度與體驗版已知有欄位缺口（例如部分生字沒有注音）。
// 這個測試把缺口盤點出來（diagnostic），不讓它變成紅燈，
// 也不因此把缺口當成通過；缺口本身屬 data/GAPS.md 的資料層待辦。
test('非嚴格資料檔（110／體驗版）的欄位缺口可被盤點', (t) => {
  for (const relativePath of LOOSE_FILES) {
    const data = readJson(relativePath);
    const groups = collectLessonGroups(data);
    assert.ok(groups.length > 0, `${relativePath}: 找不到任何課次資料`);

    const issues = [];
    let lessonCount = 0;
    let characterCount = 0;
    let wordCount = 0;
    for (const group of groups) {
      for (const lesson of group.lessons) {
        lessonCount += 1;
        characterCount += lesson.characters.length;
        wordCount += lesson.words.length;
        collectLessonIssues(lesson, relativePath, issues);
      }
    }

    t.diagnostic(
      `${relativePath}：${lessonCount} 課、${characterCount} 生字、${wordCount} 語詞，`
      + `缺口 ${issues.length} 筆（僅列前 5 筆）`,
    );
    for (const issue of issues.slice(0, 5)) t.diagnostic(`  - ${issue}`);

    assert.ok(lessonCount > 0, `${relativePath}: 課次數不可為 0`);
  }
});

test('注音拆解正確處理有調號、輕聲與無調號音節', () => {
  assert.deepEqual(TPZhuyin.splitSyllable('ㄏㄤˊ'), {
    symbols: ['ㄏ', 'ㄤ'],
    tone: 'ˊ',
  });
  assert.deepEqual(TPZhuyin.splitSyllable('˙ㄓ'), {
    symbols: ['ㄓ'],
    tone: '˙',
  });
  assert.deepEqual(TPZhuyin.splitSyllable(' ㄕㄨ '), {
    symbols: ['ㄕ', 'ㄨ'],
    tone: null,
  });
  assert.deepEqual(TPZhuyin.splitSyllable(null), {
    symbols: [],
    tone: null,
  });
});

test('詞語與句子注音渲染保留逐字字格，且學生卷空格不洩漏國字', () => {
  const word = TPZhuyin.word('航行', ['ㄏㄤˊ', 'ㄒㄧㄥˊ']);
  const cells = descendantsWithClass(word, 'tpz-cell');
  const columns = descendantsWithClass(word, 'tpz-col');

  assert.equal(cells.length, 2);
  assert.equal(columns.length, 2);
  assert.deepEqual(
    descendantsWithClass(word, 'tpz-cell__char').map((node) => node.textContent),
    ['航', '行'],
  );

  const sentence = TPZhuyin.sentence(
    '我們乘船行舟。',
    [{ word: '行舟', bopomofoArray: ['ㄒㄧㄥˊ', 'ㄓㄡ'] }],
    { blank: true },
  );
  const sentenceGroups = descendantsWithClass(sentence, 'tpz-group');
  const blankCells = descendantsWithClass(sentence, 'tpz-cell--blank');

  assert.equal(sentenceGroups.length, 1);
  assert.equal(blankCells.length, 2);
  assert.deepEqual(
    descendantsWithClass(sentence, 'tpz-cell__char').map((node) => node.textContent),
    ['□', '□'],
  );
});

const pythonProbe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
const hasPython3 = !pythonProbe.error && pythonProbe.status === 0;

test('離線打包產物一致，且不依賴外部 script 或 stylesheet', {
  skip: hasPython3 ? false : '找不到 Python 3，略過 bundle.py 整合測試',
}, () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'zizai-fmb-bundle-'));

  try {
    const result = spawnSync('python3', ['tools/bundle.py'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, ZIZAI_OUT: outputDir },
    });

    assert.ifError(result.error);
    assert.equal(result.status, 0, `bundle.py 執行失敗：${result.stderr || result.stdout}`);

    const bundledIndex = readFileSync(join(outputDir, 'index.html'), 'utf8');
    const bundledAlias = readFileSync(join(outputDir, 'zi-zai.html'), 'utf8');

    assert.equal(bundledIndex, bundledAlias, '兩個離線版產物應完全相同');
    assert.ok(bundledIndex.includes('window.__EMBEDDED_GRADES__'), '應內嵌年級教材資料');
    assert.doesNotMatch(bundledIndex, /<link\b[^>]*\bhref=["']https?:\/\//i);
    assert.doesNotMatch(bundledIndex, /<script\b[^>]*\bsrc=["']https?:\/\//i);
    assert.doesNotMatch(bundledIndex, /fonts\.(googleapis|gstatic)\.com/i);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
