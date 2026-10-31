# 命令列指令參考

本 repo 的所有工具都是「零第三方套件」：Python 3 標準庫、Node.js 22+ 內建模組。所有指令都可以在倉庫任何位置執行（工具會以自身檔案位置推算倉庫根目錄），但範例一律以倉庫根目錄為工作目錄。

| 指令 | 用途 | 需要網路 | 需要額外輸入 |
|---|---|---|---|
| `python3 tools/bundle.py` | 打包單檔離線版 | 否 | 否 |
| `python3 tools/build_grades_from_sources.py` | 重建一、三～六年級資料 | 否（需先自行下載來源） | CSV 快照＋辭典檔 |
| `python3 tools/build_datasets.py` | 重建二年級／110 學年度／體驗版資料 | 否 | 兩個原始檔（環境變數指定） |
| `node tools/make_sample_pdfs.mjs` | 重新產生範例 PDF | 否 | 本機 Chrome |
| `node tests/test_zizai.js` | 執行測試套件 | 否 | 無（缺快照／辭典時部分略過） |

---

## `python3 tools/bundle.py`

把 `index.html`、`src/*.css`、`src/*.js` 與一～六年級資料打包成單一 HTML 檔。

### 用法

```
python3 tools/bundle.py
```

### 環境變數

| 變數 | 說明 |
|---|---|
| `ZIZAI_OUT` | 輸出資料夾；未設定時輸出至 `dist/` |

### 輸出

| 檔案 | 說明 |
|---|---|
| `dist/index.html` | 單檔離線版 |
| `dist/zi-zai.html` | 與 `dist/index.html` 內容完全相同（單檔分享用） |

執行成功時印出輸出檔名、位元組大小與 md5。

### 打包時做的三類變更

1. 移除三行 Google Fonts 的 `<link>`（兩個 `preconnect`、一個 stylesheet）。
2. 把 `src/app.js` 的資料載入改為只讀內嵌資料（移除全部 `fetch`）。
3. CSS／JS 內聯、資料內嵌：`window.__EMBEDDED_GRADES__`、`window.__EMBEDDED_CURRICULUM_110__`、`window.__EMBEDDED_CURRICULUM_DEMO__`。

CSS 內聯順序固定為 `tokens.css`、`base.css`、`components.css`、`zhuyin.css`、`print.css`；script 順序固定為 `zhuyin.js`、`readings.js`、`app.js`。順序或檔名不符即打包失敗。

### 失敗條件（結束碼 1，訊息以「打包失敗：」開頭）

- 任一文字替換**不是恰好命中一次**（Google Fonts 行、`</head>`、`</body>`、`loadGradeData` 區塊等）。
- `index.html` 的 CSS `<link>` 清單、`<script src>` 清單與順序與預期不同。
- `app.js` 仍含 `fetch(`。
- 內聯 JS 的網路面檢查失敗：`fetchImpl(` 呼叫不是恰好 1 處、`REPORT_PATH` 不是相對路徑 `/api/report` 或重複定義、`app.js` 交付 `window.fetch` 的位置不是 1 處。
- 內聯 JS 出現禁用 API：`XMLHttpRequest`、`sendBeacon`、`WebSocket`、`EventSource`、`importScripts`。
- 內聯 JS 出現白名單以外的外部網址（白名單僅三個教育部連結與 SVG 命名空間字串，詳見 [config.md](config.md)）。
- `GRADE_DATA_FILES` 解析不出 `1`～`6` 六個年級，或資料檔無法解析。
- 產出檔仍殘留外部 `link`／`script`、CSS `@import`、Google Fonts 字樣，或 `src/` 相對參照。

### 範例

```bash
python3 tools/bundle.py
# 打包完成：dist/index.html 與 zi-zai.html（內容相同）

ZIZAI_OUT=/tmp/fake-out python3 tools/bundle.py
```

### 注意

- 打包不驗證資料內容正確性，只驗證可解析與內嵌成功。
- 打包腳本會斷言「整份內聯 JS 只有一處網路寫入」，新增任何網路功能都會讓打包失敗（這是刻意的保護）。

---

## `python3 tools/build_grades_from_sources.py`

從來源重建一、三、四、五、六年級資料檔（`data/curriculum-115-1-g{1,3,4,5,6}.json`）。

> 本文件只記錄介面層（輸入、輸出、結束碼）；程式內部函式未收錄於本文件。

### 用法

```
python3 tools/build_grades_from_sources.py
```

### 前置輸入

| 輸入 | 位置 | 說明 |
|---|---|---|
| 顏國雄老師試算表 CSV 快照（15 個分頁） | `data/sources/gsyan/` | 檔名與分頁 gid 見 `data/SOURCES.md`；`data/sources/gsyan/` 已列入 `.gitignore`，須自行下載 |
| 教育部辭典開放資料 | `data/sources/moedict/` | `dict-revised.json.xz`；腳本會自動解壓；已列入 `.gitignore` |

### 輸出

- 覆寫 `data/curriculum-115-1-g1.json`、`-g3.json`、`-g4.json`、`-g5.json`、`-g6.json`。
- 每個生字產生 `readings` 與 `ambiguous`；`meta.licenseNotes` 依授權狀況如實說明。

### 結束碼

| 結束碼 | 意義 |
|---|---|
| `0` | 重建完成 |
| `2` | 缺少 CSV 快照或辭典檔：印出取得方式與網址後結束，**不改寫任何資料檔** |

### 注意

- 重跑輸出應與工作樹一致（同樣輸入下逐檔相同）；若不同，代表來源快照或程式有變。
- 需要來源快照與辭典的測試項目在缺檔時會標示「略過」。
- 本腳本不處理二年級、110 學年度與體驗版資料。

---

## `python3 tools/build_datasets.py`

重建二年級（115-1）、110 學年度與體驗版資料。

> 一般情況不需要重跑；只記錄介面層。

### 用法

```bash
ZIZAI_G2_HTML=/path/to/yizi-yiri-115-1-g2.html \
ZIZAI_KIMI_JS=/path/to/index-BvVP0R4p.js \
python3 tools/build_datasets.py
```

### 環境變數

| 變數 | 說明 |
|---|---|
| `ZIZAI_G2_HTML` | 二年級 115 學年度生字清單頁的檔案路徑 |
| `ZIZAI_KIMI_JS` | 句子與語詞參考資料的頁面腳本路徑 |

這兩個原始輸入**不在本倉庫**；缺少時腳本以明確訊息結束，不會崩潰。

### 輸出

| 檔案 | 說明 |
|---|---|
| `data/curriculum-115-1.json` | 二年級（含 `sentences`） |
| `data/curriculum-110.json` | 110 學年度（`meta` ＋ `blocks`） |
| `data/curriculum-demo.json` | 體驗版（`meta` ＋ `themes`，12 主題） |

### 結束碼

| 結束碼 | 意義 |
|---|---|
| `0` | 完成，並印出各檔產生訊息 |
| `1` | 缺少環境變數或檔案不存在：以 `SystemExit` 印出「找不到輸入檔」與設定方式後結束 |

### 注意

- 腳本不做 schema 驗證；體驗版部分生字的注音／部首／筆畫為空值、筆畫為 `0`，屬既有狀況。
- 執行後應以 `node tests/test_zizai.js` 確認沒有破壞既有測試。

---

## `node tools/make_sample_pdfs.mjs`

重新產生 `dist/` 內的兩份範例 PDF，並保證兩份來自同一次出題。

### 前置

1. 先執行 `python3 tools/bundle.py`，讓 `dist/zi-zai.html` 是最新版。
2. Node 22 以上（只用內建模組，不需 `npm install`）。
3. 本機需有 Chrome；找不到時以環境變數指定。

### 用法

```
node tools/make_sample_pdfs.mjs
node tools/make_sample_pdfs.mjs --out /tmp/fake-out
CHROME_BIN=/path/to/chrome node tools/make_sample_pdfs.mjs
```

### 參數

| 參數／環境變數 | 說明 |
|---|---|
| `--out <dir>` | 輸出資料夾；未指定時輸出至 `dist/` |
| `CHROME_BIN` | Chrome 執行檔路徑；未設定時依序嘗試常見安裝位置 |

### 輸出

| 檔案 | 內容 |
|---|---|
| `dist/sample-worksheet-with-answers.pdf` | 學生卷＋答案卷（2 頁） |
| `dist/sample-worksheet.pdf` | 只含學生卷（1 頁） |

結束時會在標準輸出印出「兩份 PDF 共用的第 1 題」文字，可據此確認同一次出題。

### 行為

1. 以內建 HTTP 伺服器只綁 `127.0.0.1` 的隨機埠，服務倉庫根目錄。
2. 以無頭模式啟動自己專屬的 Chrome（獨立使用者設定檔），開啟 `dist/zi-zai.html#worksheet`。
3. 等待學生卷、答案卷與語詞題渲染完成（最多 20 秒）。
4. 先印含答案版；再注入 CSS 隱藏答案卷，用同一份 DOM 印學生版。
5. 關閉自己啟動的 Chrome 行程群組、關閉伺服器、刪除暫存設定檔。

### 錯誤與結束碼

| 情況 | 訊息 | 結束碼 |
|---|---|---|
| 找不到 Chrome | 「找不到 Chrome，請用 CHROME_BIN 環境變數指定路徑」 | `1` |
| 等不到 DevTools 位址（20 秒） | 「等不到 Chrome DevTools 位址」 | `1` |
| Chrome 提前結束 | 「Chrome 提前結束」 | `1` |
| 考卷 20 秒內沒渲染 | 「逾時：考卷沒有渲染出題目」 | `1` |
| 頁面腳本丟錯 | 「頁面腳本錯誤：…」 | `1` |
| 成功 | 印出已寫入的兩個檔名與第 1 題 | `0` |

### 注意

- 打包後的 `dist/zi-zai.html` 不含 Google Fonts，字型走系統備援；與舊版範例 PDF 的外觀可能不同。
- 只會關閉自己啟動的 Chrome，不會動到其他 Chrome 行程。

---

## `node tests/test_zizai.js`

執行全量邏輯與資料合規測試。

### 用法

```
node tests/test_zizai.js
```

### 需求

- Node 22（只用內建模組，不需安裝套件）。
- 不需網路；不得連線到正式服務。

### 項目數與略過規則

| 情況 | 結果 |
|---|---|
| 單純複製本倉庫（無快照、無辭典） | 66 項通過、21 項略過 |
| 補齊辭典檔與 CSV 快照 | 87 項全過 |

略過規則：

- 需要教育部辭典檔的 4 項：沒有 `data/sources/moedict/` 的辭典檔時標示「略過」。
- 需要 CSV 快照的 16 項（15 個分頁逐課比對＋1 項列數檢查）：沒有 `data/sources/gsyan/` 快照時標示「略過」。
- 需要開發分支歷史提交的 1 項資料比對：本機沒有該歷史時標示「略過」。

**略過不算通過也不算失敗**，其餘照常執行。

### 涵蓋範圍（概念層級）

週次計算、進度覆寫、出題與考卷、各年級資料 schema 與合規、CSV 快照逐課比對、注音／部首／筆畫非空、讀音與辭典及語詞一致（含聲調）、多音字標注與修改讀音的純邏輯、注音格式驗證、localStorage 不可用時的降級、回報 payload 與來源白名單、匯出文字與 JSON、下拉選單項目數、無例句年級的考卷不留空大題。

### 輸出

- 標準輸出為逐項結果與結尾統計；實際執行輸出保存在 `tests/RESULT_1151001*.txt`（各輪紀錄）。
- 結束碼：全部通過為 `0`；有失敗項目為非 `0`。

### 注意

- 測試不得連線網路、不得讀寫 repo 以外的路徑（暫存檔一律用 `tmp_path`／`tempfile`）。
- 需要假憑證時一律使用 `FAKE_VALUE_FOR_TEST` 這類明顯假字串。
