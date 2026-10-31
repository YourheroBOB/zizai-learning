import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  auditCurriculumDataset,
  auditCurriculumFiles,
  DEFAULT_DATA_FILES,
} from './audit_curriculum.mjs';

function validDataset() {
  return {
    meta: {
      id: 'test-curriculum',
      title: '測試課程',
      sourceType: 'official_curriculum',
      editionNote: '測試資料',
      licenseNotes: '測試用資料',
    },
    publishers: {
      testPublisher: {
        name: '測試出版社',
        lessons: [
          {
            lessonNo: 1,
            title: '第 1 課',
            characters: [
              {
                char: '學',
                bopomofo: 'ㄒㄩㄝˊ',
                radical: '子',
                strokes: 16,
                readings: [{ bopomofo: 'ㄒㄩㄝˊ', ratio: 100 }],
                ambiguous: false,
              },
            ],
            words: [{ word: '學習', bopomofoArray: ['ㄒㄩㄝˊ', 'ㄒㄧˊ'] }],
            sentences: [
              {
                text: '一起學習。',
                target: '學習',
                bopomofoArray: ['ㄒㄩㄝˊ', 'ㄒㄧˊ'],
              },
            ],
          },
        ],
      },
    },
  };
}

function withTemporaryDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), 'fmb-feature2-audit-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('接受結構正確且注音音節數相符的資料', () => {
  assert.deepEqual(auditCurriculumDataset(validDataset()), []);
});

test('回報重複課次、生字格式、筆畫與詞語音節數錯誤', () => {
  const dataset = validDataset();
  const publisher = dataset.publishers.testPublisher;

  publisher.lessons.push({
    ...structuredClone(publisher.lessons[0]),
    title: '重複課次',
  });
  publisher.lessons[0].characters[0].char = '學習';
  publisher.lessons[0].characters[0].strokes = -1;
  publisher.lessons[0].words[0].bopomofoArray = ['ㄒㄩㄝˊ'];

  const issues = auditCurriculumDataset(dataset);
  const codes = issues.map((issue) => issue.code);

  assert.ok(codes.includes('duplicate'));
  assert.ok(codes.includes('single-character'));
  assert.ok(codes.includes('non-negative-integer'));
  assert.ok(codes.includes('length-mismatch'));
});

test('對預設資料檔逐一檢查，並回報缺檔與 JSON 格式錯誤', () => {
  withTemporaryDirectory((directory) => {
    for (const fileName of DEFAULT_DATA_FILES) {
      writeFileSync(join(directory, fileName), JSON.stringify(validDataset()), 'utf8');
    }

    writeFileSync(join(directory, DEFAULT_DATA_FILES[0]), '{invalid json', 'utf8');
    rmSync(join(directory, DEFAULT_DATA_FILES[1]));

    const results = auditCurriculumFiles(directory);

    assert.equal(results.length, DEFAULT_DATA_FILES.length);
    assert.ok(results[0].issues.some((issue) => issue.code === 'invalid-json'));
    assert.ok(results[1].issues.some((issue) => issue.code === 'unreadable'));
    assert.ok(results.slice(2).every((result) => result.issues.length === 0));
  });
});

test('非物件根節點會產生明確診斷而不拋出例外', () => {
  assert.deepEqual(auditCurriculumDataset(null), [
    { path: '$', code: 'object', message: '根節點必須是物件。' },
  ]);
});
