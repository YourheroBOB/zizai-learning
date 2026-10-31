# 注音排版 API：`TPZhuyin`

來源：`src/zhuyin.js`（實作）、`src/zhuyin.css`（樣式契約）。

`src/zhuyin.js` 是一個 IIFE，對外只暴露一個物件：

- 瀏覽器：`window.TPZhuyin`
- Node.js（CommonJS）：`module.exports = TPZhuyin`

```html
<script src="src/zhuyin.js"></script>
<script>
  const el = window.TPZhuyin.cell('山', 'ㄕㄢ');
  document.body.appendChild(el);
</script>
```

```js
// Node（測試用）
const TPZhuyin = require('../src/zhuyin.js');
```

## 匯出成員一覽

| 成員 | 型別 | 說明 |
|---|---|---|
| `TONES` | `string[]` | 聲調符號清單（二聲、三聲、四聲、輕聲） |
| `LIGHT_TONE` | `string` | 輕聲符號；用於判斷輕聲點的擺放位置 |
| `splitSyllable(syllable)` | `function` | 拆解單一音節為符號陣列與調號 |
| `cell(char, bopomofo, opts?)` | `function` | 產生單一字格（田字格＋右側直排注音） |
| `word(chars, bopomofos, opts?)` | `function` | 產生多格詞語 |
| `sentence(text, targets, opts?)` | `function` | 產生句子，將目標詞換成字格 |
| `ruby(text, bopomofos)` | `function` | 產生橫排小字注音（ruby） |

未匯出（內部函式，非公開介面）：`createElement`、`createTextNode`、`makeGrid`、`makeColumn`、`applySize`、`escapeRegExp`。呼叫端不應依賴。

---

## `TPZhuyin.splitSyllable(syllable)`

把一個注音音節字串拆成「符號陣列＋調號」。

### 參數

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `syllable` | `string \| null \| undefined` | 是 | 單一音節，例如 `'ㄏㄤˊ'`、`'˙ㄕ'`、`'ㄕㄨ'` |

### 回傳

```ts
{ symbols: string[], tone: string | null }
```

- `symbols`：注音符號（不含調號、不含空白），維持輸入順序。
- `tone`：調號字元；沒有調號時為 `null`。

### 行為

- `null`／`undefined` 視為空字串；輸入一律先 `String()` 再 `trim()`。
- 空白字元會被忽略。
- 若同一音節出現兩個以上調號，**最後一個**調號生效（前面的會被覆蓋，不報錯）。

### 範例

```js
TPZhuyin.splitSyllable('ㄏㄤˊ');  // { symbols: ['ㄏ','ㄤ'], tone: 'ˊ' }
TPZhuyin.splitSyllable('˙ㄕ');    // { symbols: ['ㄕ'], tone: '˙' }
TPZhuyin.splitSyllable('ㄕㄨ');    // { symbols: ['ㄕ','ㄨ'], tone: null }
TPZhuyin.splitSyllable(null);     // { symbols: [], tone: null }
```

### 錯誤

不拋錯。

---

## `TPZhuyin.cell(char, bopomofo, opts?)`

產生一個字格：田字格外框＋米字輔助線，右側為直排注音欄。

### 參數

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `char` | `string` | 是 | 一個國字；空白時字格內無字 |
| `bopomofo` | `string` | 是 | 該字音節；空字串時不產生注音欄 |
| `opts` | `object` | 否 | 見下表 |

`opts`：

| 欄位 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `blank` | `boolean` | `false` | `true` 時字格內顯示空白提示字元，供學生作答 |
| `status` | `string` | `blank ? 'blank' : 'learned'` | 字格狀態，會變成 class `tpz-cell--<status>` |
| `size` | `number \| string` | 無 | 數字＝以 px 設定 `--tpz-size`；字串可為 `'sm'`、`'md'`、`'lg'`、`'xl'`、`'print'`（加上對應 `tpz--<size>` class） |
| `showZhuyin` | `boolean` | `true` | `false` 時不產生注音欄 |
| `toneColor` | `string` | 無 | 注音欄配色，`'cinnabar'` 或 `'faint'`（對應 `tpz-col--cinnabar`、`tpz-col--faint`） |

`status` 的既有樣式值：`learned`、`current`、`upcoming`、`blank`、`answer`。傳入其他字串不會報錯，只是沒有對應樣式。

### 回傳

`HTMLElement`（`span.tpz-wrap`）。結構：

```
span.tpz-wrap[.tpz--<size>]
├─ span.tpz-cell.tpz-cell--<status>
│  ├─ svg.tpz-cell__grid        （米字輔助線，aria-hidden）
│  └─ span.tpz-cell__char       （國字；blank 時為空白提示字元並 aria-hidden）
└─ span.tpz-col[.tpz-col--<toneColor>]   （僅在 showZhuyin 且 bopomofo 非空時）
   ├─ span.tpz-col__tone.tpz-col__tone--light   （僅輕聲）
   └─ span.tpz-col__sym × N                     （最後一個符號內含 span.tpz-col__tone，輕聲除外）
```

空白字格會額外設定 `aria-label="空格"`。

### 範例

```js
// 一般字卡
TPZhuyin.cell('山', 'ㄕㄢ');

// 學生卷：留白作答
TPZhuyin.cell('山', 'ㄕㄢ', { blank: true });

// 答案卷：朱砂紅字
TPZhuyin.cell('山', 'ㄕㄢ', { blank: false, status: 'answer' });

// 列印尺寸（14mm 字格）
TPZhuyin.cell('山', 'ㄕㄢ', { size: 'print' });
```

### 錯誤

不拋錯；`char` 為空只得到空字格。

---

## `TPZhuyin.word(chars, bopomofos, opts?)`

產生完整詞語（多個字格組成的原子塊）。

### 參數

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `chars` | `string \| string[]` | 是 | 詞語；字串會逐字拆開，陣列則照順序使用 |
| `bopomofos` | `string \| string[]` | 是 | 逐字音節；字串以空白分隔 |
| `opts` | `object` | 否 | 同 `cell()` 的 `opts`，逐一傳給每個字格 |

### 回傳

`HTMLElement`（`span.tpz-group`），內含與字數相同的 `span.tpz-wrap`。

### 行為

- 音節數量少於字數時，缺的音節以空字串處理（該格沒有注音欄）。
- 音節數量多於字數時，多出的音節忽略。

### 範例

```js
TPZhuyin.word('航行', ['ㄏㄤˊ', 'ㄒㄧㄥˊ']);
TPZhuyin.word(['航', '行'], 'ㄏㄤˊ ㄒㄧㄥˊ', { size: 'lg' });
TPZhuyin.word('航行', ['ㄏㄤˊ', 'ㄒㄧㄥˊ'], { blank: true, status: 'blank' });
```

---

## `TPZhuyin.sentence(text, targets, opts?)`

把句子中指定的目標詞換成字格，其餘文字保留為純文字。

### 參數

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `text` | `string` | 是 | 完整句子 |
| `targets` | `Array<string \| object>` | 是 | 要挖空的目標；字串或物件（見下） |
| `opts` | `object` | 否 | 見下表 |

`targets` 物件欄位：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `word` 或 `target` | `string` | 目標詞；兩者取有值者（`word` 優先） |
| `bopomofoArray` 或 `bopomofo` | `string[]` | 逐字音節；缺漏時改用 `opts.phonics` |

`opts`：

| 欄位 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `blank` | `boolean` | `true` | 只有明確傳 `false` 才顯示答案；`false` 時字格狀態預設為 `'answer'` |
| `status` | `string` | 依 `blank` | 明確指定字格狀態，優先於 `blank` 推導值 |
| `phonics` | `object` | 無 | 字→音節對照表；目標沒有 `bopomofoArray` 時逐字查表 |
| `cellSize` | `string \| number` | 無 | 字格尺寸，優先於 `size` |
| `size` | `string \| number` | 無 | 尺寸；同時套用到外層與字格 |
| `showZhuyin` | `boolean` | `true` | 是否顯示注音欄 |
| `toneColor` | `string` | 無 | 注音欄配色 |

### 回傳

`HTMLElement`（`span.tpz-sentence`）。

### 行為

- 目標依字數由長到短排序後以單一正規表達式全域比對，**所有出現處**都會被替換；長詞優先，避免短詞先吃掉長詞。
- 目標為空陣列（或全部無效）時，整句以純文字回傳。
- 有目標但句中完全沒命中時，整句同樣以純文字回傳（不產生字格）。
- 目標字元內的規則字元會自動轉義，不需呼叫端處理。

### 範例

```js
// 學生卷（預設留白）
TPZhuyin.sentence('小船在海上航行。', [
  { word: '航行', bopomofoArray: ['ㄏㄤˊ', 'ㄒㄧㄥˊ'] },
]);

// 答案卷
TPZhuyin.sentence('小船在海上航行。', [
  { word: '航行', bopomofoArray: ['ㄏㄤˊ', 'ㄒㄧㄥˊ'] },
], { blank: false });

// 只有字串目標時，用 phonics 補音節
TPZhuyin.sentence('小船在海上航行。', ['航行'], {
  phonics: { 航: 'ㄏㄤˊ', 行: 'ㄒㄧㄥˊ' },
});
```

### 錯誤

不拋錯。

---

## `TPZhuyin.ruby(text, bopomofos)`

產生橫排小字注音，適合按鈕、標籤等空間有限處。

### 參數

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `text` | `string` | 是 | 文字；逐字拆開 |
| `bopomofos` | `string \| string[]` | 是 | 逐字音節；字串以空白分隔 |

### 回傳

`HTMLElement`（`span.tpz-ruby-wrap`），內含每字一個 `<ruby class="tpz-ruby">字<rt>音節</rt></ruby>`；缺音節時 `<rt>` 為空。

### 範例

```js
TPZhuyin.ruby('航行', ['ㄏㄤˊ', 'ㄒㄧㄥˊ']);
TPZhuyin.ruby('航行', 'ㄏㄤˊ ㄒㄧㄥˊ');
```

---

## Node.js 環境行為

在沒有 `document` 的環境（例如 `node tests/test_zai.js` 這類純邏輯測試，實際檔名見 [cli.md](cli.md)）中：

- `cell`／`word`／`sentence`／`ruby` 仍可呼叫，回傳的是簡化的物件（具 `tagName`、`className`、`children`、`textContent`、`setAttribute`／`getAttribute`、`appendChild`、`classList.add`）。
- `textContent` 會串接子節點文字。
- 沒有真實 DOM 排版與 SVG；不要依賴 Node 端的樣式或尺寸。

因此：**Node 端只用來驗證結構與文字**，畫面驗證需在瀏覽器執行。

---

## CSS 契約（`.tpz-*`）

以下 class 與變數是 `zhuyin.js` 輸出與 `zhuyin.css` 之間的契約，改名會同時破壞樣式與測試。

### class

| class | 用途 |
|---|---|
| `tpz-group` | 詞語容器（多字格） |
| `tpz-wrap` | 單字＋注音容器 |
| `tpz-cell` | 田字格外框 |
| `tpz-cell__grid` | 米字輔助線（SVG） |
| `tpz-cell__char` | 格內國字 |
| `tpz-cell--learned` / `--current` / `--upcoming` / `--blank` / `--answer` / `--mastered` | 字格狀態 |
| `tpz-col` | 直排注音欄 |
| `tpz-col__sym` | 單一注音符號 |
| `tpz-col__tone` | 二、三、四聲調號（疊在最後一個符號右上方） |
| `tpz-col__tone--light` | 輕聲點（整欄最上方置中） |
| `tpz-col--cinnabar` / `--faint` | 注音欄配色 |
| `tpz--sm` / `--md` / `--lg` / `--xl` / `--print` | 尺寸級別（設定 `--tpz-size`） |
| `tpz-sentence` | 句子容器 |
| `tpz-ruby-wrap` / `tpz-ruby` | 橫排 ruby 注音 |

### CSS 變數

`--tpz-size`、`--tpz-cell-border`、`--tpz-grid`、`--tpz-lh`。實際值見 `src/tokens.css`、`src/zhuyin.css`；文件不抄錄色碼。

### 列印行為（`@media print`）

- 字格底色透明、框線加深，並強制 `print-color-adjust: exact`。
- `.tpz-cell--blank .tpz-cell__char` 一律隱藏（學生卷不得透露答案）。
- `.tpz-cell--answer .tpz-cell__char` 顯示為朱砂色。
- 注音欄改為深墨色以利黑白列印。
