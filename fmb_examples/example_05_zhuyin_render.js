#!/usr/bin/env node
/**
 * 使用 Node.js 輕量 DOM 模擬環境檢查 src/zhuyin.js。
 * 只讀取本機資料，不啟動瀏覽器，也不連線。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const TPZhuyin = require('../src/zhuyin.js');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'curriculum-115-1.json');

function fail(message) {
  console.error(`範例失敗：${message}`);
  process.exit(1);
}

function findAll(node, className) {
  const found = [];
  if (!node || typeof node !== 'object') return found;
  if (
    typeof node.className === 'string' &&
    node.className.split(/\s+/).includes(className)
  ) {
    found.push(node);
  }
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    found.push(...findAll(child, className));
  }
  return found;
}

function textOf(node) {
  return node && typeof node.textContent === 'string' ? node.textContent : '';
}

let data;
try {
  data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
} catch (error) {
  fail(`無法讀取教材資料：${error.message}`);
}

const publisher = data.publishers && data.publishers.kangxuan;
if (!publisher || !Array.isArray(publisher.lessons)) {
  fail('找不到康軒版教材資料');
}

const lesson = publisher.lessons.find((item) => item.lessonNo === 1);
if (!lesson) {
  fail('找不到第 1 課');
}

const character = Array.isArray(lesson.characters) ? lesson.characters[0] : null;
if (!character || !character.char || !character.bopomofo) {
  fail('第 1 課沒有可用的生字');
}

const words = Array.isArray(lesson.words) ? lesson.words : [];
const word = words.find((item) => {
  const chars = Array.from(String(item.word || ''));
  return (
    chars.length === 2 &&
    Array.isArray(item.bopomofoArray) &&
    item.bopomofoArray.length === chars.length
  );
}) || words.find((item) => item && item.word && Array.isArray(item.bopomofoArray));

if (!word || !word.bopomofoArray.length) {
  fail('第 1 課沒有可用的語詞');
}

const cell = TPZhuyin.cell(character.char, character.bopomofo);
const cellCharacters = findAll(cell, 'tpz-cell__char');
const cellSymbols = findAll(cell, 'tpz-col__sym');
const cellTones = findAll(cell, 'tpz-col__tone');
const expectedSymbols = character.bopomofo.replace(/[ˊˇˋ˙\s]/g, '');

if (cellCharacters.length !== 1 || textOf(cellCharacters[0]) !== character.char) {
  fail('單字格沒有正確放入目標國字');
}
if (cellSymbols.map(textOf).join('') !== expectedSymbols) {
  fail('單字格的注音符號不正確');
}

const wordNode = TPZhuyin.word(word.word, word.bopomofoArray, { size: 'sm' });
const wordCells = findAll(wordNode, 'tpz-cell');
const wordColumns = findAll(wordNode, 'tpz-col');
const expectedWordLength = Array.from(word.word).length;

if (wordCells.length !== expectedWordLength) {
  fail(`詞語字格數量錯誤：預期 ${expectedWordLength}，實際 ${wordCells.length}`);
}
if (wordColumns.length !== expectedWordLength) {
  fail(`詞語注音欄數量錯誤：預期 ${expectedWordLength}，實際 ${wordColumns.length}`);
}

const sentenceText = `今天一起練習「${word.word}」這個詞語。`;
const target = {
  word: word.word,
  bopomofoArray: word.bopomofoArray,
};
const studentSentence = TPZhuyin.sentence(sentenceText, [target], { blank: true });
const answerSentence = TPZhuyin.sentence(sentenceText, [target], { blank: false });

if (studentSentence.textContent.includes(word.word)) {
  fail('學生卷句子不應直接顯示答案文字');
}
if (!answerSentence.textContent.includes(word.word)) {
  fail('答案卷句子應顯示答案文字');
}

const result = {
  source: {
    file: path.relative(ROOT, DATA_PATH),
    publisher: publisher.name,
    lessonNo: lesson.lessonNo,
    lessonTitle: lesson.title,
  },
  character: {
    char: character.char,
    bopomofo: character.bopomofo,
    cellClass: cell.className,
    renderedSymbols: cellSymbols.map(textOf),
    toneMarks: cellTones.map(textOf),
  },
  word: {
    word: word.word,
    bopomofoArray: word.bopomofoArray,
    cellCount: wordCells.length,
    zhuyinColumnCount: wordColumns.length,
  },
  sentence: {
    studentAnswerVisible: studentSentence.textContent.includes(word.word),
    answerVisible: answerSentence.textContent.includes(word.word),
  },
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS：注音元件的單字格、詞語與句子挖空結構均符合預期。');
