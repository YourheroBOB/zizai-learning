#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DATA_FILES = [
  'curriculum-115-1.json',
  'curriculum-115-1-g1.json',
  'curriculum-115-1-g3.json',
  'curriculum-115-1-g4.json',
  'curriculum-115-1-g5.json',
  'curriculum-115-1-g6.json',
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 檢查 115 學年度課程資料的基本結構與跨欄位一致性。
 * 回傳的診斷只包含路徑與規則，不會輸出資料內容。
 */
export function auditCurriculumDataset(dataset) {
  const issues = [];
  const add = (path, code, message) => issues.push({ path, code, message });

  if (!isRecord(dataset)) {
    return [{ path: '$', code: 'object', message: '根節點必須是物件。' }];
  }

  if (!isRecord(dataset.meta)) {
    add('meta', 'object', 'meta 必須是物件。');
  } else {
    for (const field of ['id', 'title', 'sourceType', 'editionNote', 'licenseNotes']) {
      if (!nonEmptyString(dataset.meta[field])) {
        add(`meta.${field}`, 'required-string', '欄位必須是非空字串。');
      }
    }
  }

  if (!isRecord(dataset.publishers) || Object.keys(dataset.publishers).length === 0) {
    add('publishers', 'non-empty-object', 'publishers 必須是非空物件。');
    return issues;
  }

  for (const [publisherKey, publisher] of Object.entries(dataset.publishers)) {
    const publisherPath = `publishers.${publisherKey}`;

    if (!isRecord(publisher)) {
      add(publisherPath, 'object', '出版社資料必須是物件。');
      continue;
    }

    if (!nonEmptyString(publisher.name)) {
      add(`${publisherPath}.name`, 'required-string', '出版社名稱必須是非空字串。');
    }

    if (!Array.isArray(publisher.lessons) || publisher.lessons.length === 0) {
      add(`${publisherPath}.lessons`, 'non-empty-array', '課程清單必須是非空陣列。');
      continue;
    }

    const seenLessonNumbers = new Set();

    publisher.lessons.forEach((lesson, lessonIndex) => {
      const lessonPath = `${publisherPath}.lessons[${lessonIndex}]`;

      if (!isRecord(lesson)) {
        add(lessonPath, 'object', '課程單元必須是物件。');
        return;
      }

      if (!Number.isInteger(lesson.lessonNo)) {
        add(`${lessonPath}.lessonNo`, 'integer', '課次必須是整數。');
      } else if (seenLessonNumbers.has(lesson.lessonNo)) {
        add(`${lessonPath}.lessonNo`, 'duplicate', '同一出版社的課次不可重複。');
      } else {
        seenLessonNumbers.add(lesson.lessonNo);
      }

      if (!nonEmptyString(lesson.title)) {
        add(`${lessonPath}.title`, 'required-string', '單元標題必須是非空字串。');
      }

      if (!Array.isArray(lesson.characters)) {
        add(`${lessonPath}.characters`, 'array', '生字清單必須是陣列。');
      } else {
        lesson.characters.forEach((character, characterIndex) => {
          const characterPath = `${lessonPath}.characters[${characterIndex}]`;

          if (!isRecord(character)) {
            add(characterPath, 'object', '生字資料必須是物件。');
            return;
          }

          if (
            typeof character.char !== 'string' ||
            Array.from(character.char).length !== 1
          ) {
            add(`${characterPath}.char`, 'single-character', 'char 必須剛好是一個 Unicode 字元。');
          }

          for (const field of ['bopomofo', 'radical']) {
            if (typeof character[field] !== 'string') {
              add(`${characterPath}.${field}`, 'string', '欄位必須是字串。');
            }
          }

          if (!Number.isInteger(character.strokes) || character.strokes < 0) {
            add(`${characterPath}.strokes`, 'non-negative-integer', '筆畫數必須是非負整數。');
          }

          if (character.readings !== undefined) {
            if (!Array.isArray(character.readings)) {
              add(`${characterPath}.readings`, 'array', 'readings 必須是陣列。');
            } else {
              character.readings.forEach((reading, readingIndex) => {
                if (!isRecord(reading) || !nonEmptyString(reading.bopomofo)) {
                  add(
                    `${characterPath}.readings[${readingIndex}]`,
                    'reading-object',
                    '讀音項目必須是含非空 bopomofo 的物件。',
                  );
                }
              });
            }
          }

          if (character.ambiguous !== undefined && typeof character.ambiguous !== 'boolean') {
            add(`${characterPath}.ambiguous`, 'boolean', 'ambiguous 必須是布林值。');
          }
        });
      }

      if (!Array.isArray(lesson.words)) {
        add(`${lessonPath}.words`, 'array', '語詞清單必須是陣列。');
      } else {
        lesson.words.forEach((word, wordIndex) => {
          const wordPath = `${lessonPath}.words[${wordIndex}]`;

          if (!isRecord(word)) {
            add(wordPath, 'object', '語詞資料必須是物件。');
            return;
          }

          if (!nonEmptyString(word.word)) {
            add(`${wordPath}.word`, 'required-string', '語詞必須是非空字串。');
          }

          if (!Array.isArray(word.bopomofoArray)) {
            add(`${wordPath}.bopomofoArray`, 'array', '語詞注音必須是陣列。');
          } else {
            if (word.bopomofoArray.some((syllable) => typeof syllable !== 'string')) {
              add(`${wordPath}.bopomofoArray`, 'string-items', '注音陣列的每個項目都必須是字串。');
            }

            if (
              nonEmptyString(word.word) &&
              Array.from(word.word).length !== word.bopomofoArray.length
            ) {
              add(
                `${wordPath}.bopomofoArray`,
                'length-mismatch',
                '語詞字數必須與注音音節數相同。',
              );
            }
          }
        });
      }

      if (lesson.sentences !== undefined) {
        if (!Array.isArray(lesson.sentences)) {
          add(`${lessonPath}.sentences`, 'array', '句子清單必須是陣列。');
        } else {
          lesson.sentences.forEach((sentence, sentenceIndex) => {
            const sentencePath = `${lessonPath}.sentences[${sentenceIndex}]`;

            if (!isRecord(sentence)) {
              add(sentencePath, 'object', '句子資料必須是物件。');
              return;
            }

            if (!nonEmptyString(sentence.text)) {
              add(`${sentencePath}.text`, 'required-string', '句子內容必須是非空字串。');
            }

            if (!nonEmptyString(sentence.target)) {
              add(`${sentencePath}.target`, 'required-string', '句子目標必須是非空字串。');
            }

            if (!Array.isArray(sentence.bopomofoArray)) {
              add(`${sentencePath}.bopomofoArray`, 'array', '句子目標注音必須是陣列。');
            } else if (
              nonEmptyString(sentence.target) &&
              Array.from(sentence.target).length !== sentence.bopomofoArray.length
            ) {
              add(
                `${sentencePath}.bopomofoArray`,
                'length-mismatch',
                '目標字數必須與注音音節數相同。',
              );
            }
          });
        }
      }
    });
  }

  return issues;
}

export function auditCurriculumFiles(dataDir, fileNames = DEFAULT_DATA_FILES) {
  const results = [];

  for (const fileName of fileNames) {
    const filePath = resolve(dataDir, fileName);

    try {
      const contents = readFileSync(filePath, 'utf8');
      let dataset;

      try {
        dataset = JSON.parse(contents);
      } catch {
        results.push({
          fileName,
          issues: [{ path: '$', code: 'invalid-json', message: '檔案不是有效的 JSON。' }],
        });
        continue;
      }

      results.push({ fileName, issues: auditCurriculumDataset(dataset) });
    } catch {
      results.push({
        fileName,
        issues: [{ path: '$', code: 'unreadable', message: '檔案不存在或無法讀取。' }],
      });
    }
  }

  return results;
}

function printHelp() {
  console.log(
    '用法：node fmb_feature2/audit_curriculum.mjs [--data-dir <資料目錄>]\n' +
      '預設讀取目前目錄下的 data/，只檢查 115 學年度課程 JSON。',
  );
}

function main(argv) {
  let dataDir = resolve(process.cwd(), 'data');

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      return 0;
    }

    if (arg === '--data-dir' && argv[index + 1]) {
      dataDir = resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    console.error(`未知或不完整的參數：${arg}`);
    printHelp();
    return 2;
  }

  const results = auditCurriculumFiles(dataDir);
  const failures = results.flatMap((result) =>
    result.issues.map((issue) => ({ fileName: result.fileName, ...issue })),
  );

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `FAIL ${failure.fileName} ${failure.path} [${failure.code}] ${failure.message}`,
      );
    }
    console.error(`檢查完成：${results.length} 個資料檔，發現 ${failures.length} 項問題。`);
    return 1;
  }

  console.log(`檢查完成：${results.length} 個資料檔，未發現結構或欄位一致性問題。`);
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
