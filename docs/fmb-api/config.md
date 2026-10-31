# 設定項參考

本文件只列**變數名／鍵名／列舉值**與用途，實際值請見對應原始檔。文件不抄錄色碼、憑證或個人資料。

## 1. 環境變數

| 變數 | 使用者 | 用途 |
|---|---|---|
| `ZIZAI_OUT` | `tools/bundle.py` | 打包輸出資料夾（預設輸出至 `dist/`） |
| `ZIZAI_G2_HTML` | `tools/build_datasets.py` | 二年級 115 學年度生字清單頁的路徑（必填，缺檔即結束） |
| `ZIZAI_KIMI_JS` | `tools/build_datasets.py` | 句子與語詞參考資料頁面腳本的路徑（必填，缺檔即結束） |
| `CHROME_BIN` | `tools/make_sample_pdfs.mjs` | Chrome 執行檔路徑（找不到 Chrome 時必須指定） |

另有三個**不在版本控制內**的資料來源目錄（由 `.gitignore` 排除，需自行下載）：

| 路徑 | 內容 |
|---|---|
| `data/sources/gsyan/` | 顏國雄老師試算表 CSV 快照（15 個分頁） |
| `data/sources/moedict/` | 教育部辭典開放資料（`dict-revised.json.xz`） |

## 2. 瀏覽器儲存（localStorage）

| 鍵名 | 內容 |
|---|---|
| `zizai:readingOverrides:v1` | 使用者修改的讀音紀錄 |
| （進度相關鍵） | 學習進度／精熟標記；鍵名版本隨資料升級調整，**確切鍵名請見 `src/app.js`**，本文件不代為推測 |

### `zizai:readingOverrides:v1` 格式

```json
{
  "字": {
    "bopomofo": "FAKE_VALUE_FOR_TEST",
    "note": "FAKE_VALUE_FOR_TEST",
    "ts": 0,
    "grade": "FAKE_VALUE_FOR_TEST",
    "publisher": "FAKE_VALUE_FOR_TEST",
    "lesson": 0,
    "dict": "FAKE_VALUE_FOR_TEST"
  }
}
```

| 欄位 | 說明 |
|---|---|
| 鍵（字） | 被修改的單字 |
| `bopomofo` | 使用者指定的讀音 |
| `note` | 使用者備註（長度上限約 100 字） |
| `ts` | 修改時間戳 |
| `grade` | 修改當下的年級 |
| `publisher` | 修改當下的版本 |
| `lesson` | 修改當下的單元 |
| `dict` | 輔助欄位：修改當下的辭典讀音；用於匯出文字與語詞音節替換。缺少時紀錄仍可用 |

讀寫都應以 try／catch 包覆；儲存空間不可用時提示「重新整理後修改會消失」，不得當機。修改可匯出為文字或 JSON，匯出為本機檔案、不上傳。

## 3. HTML 介面列舉值

### 年級 `#grade-select`

| 值 | 意義 |
|---|---|
| `1` | 一年級 |
| `2` | 二年級 |
| `3` | 三年級 |
| `4` | 四年級 |
| `5` | 五年級 |
| `6` | 六年級 |

### 教材／學期 `#curriculum-type-select`

| 值 | 意義 |
|---|---|
| `115-1` | 115 學年度上學期（最新） |
| `110` | 110 學年度（僅二年級） |
| `demo` | 生活情境自編體驗版（僅二年級） |

切到 110 或 demo 以外的年級會自動回到 `115-1`。

### 版本 `#pub-select`

| 值 | 意義 |
|---|---|
| `kangxuan` | 康軒 |
| `hanlin` | 翰林 |
| `nanyi` | 南一 |

### 分頁 `data-tab`（`.tp-nav-btn`）

| 值 | 意義 |
|---|---|
| `progress` | 生字進度 |
| `interactive` | 線上練習 |
| `worksheet` | A4 測驗卷 |

URL 片段 `#worksheet` 會直接開啟 A4 測驗卷分頁（範例 PDF 腳本即使用此片段）。

### 生字篩選 `data-filter`（`.tp-filter-chip`）

| 值 | 意義 |
|---|---|
| `all` | 全部生字 |
| `current` | 本週目標字 |
| `unfamiliar` | 待加強複習 |
| `mastered` | 已精熟 |

### 出題範圍 `#quiz-scope`

| 值 | 意義 |
|---|---|
| `current` | 本週課次 |
| `all-taught` | 已教累計範圍（第 1 課至目前） |
| `unfamiliar` | 加強不熟生字 |

### 題數 `#quiz-count`

| 值 | 意義 |
|---|---|
| `5` / `10` / `15` | 題數 |

### 考卷卷首欄位 `data-field`

| 值 | 意義 |
|---|---|
| `name` | 姓名欄 |
| `date` | 日期欄 |
| `score` | 得分欄 |

## 4. 內嵌全域變數（單檔離線版）

由 `tools/bundle.py` 產生，只存在於 `dist/index.html`／`dist/zi-zai.html`：

| 全域 | 內容 |
|---|---|
| `window.__EMBEDDED_GRADES__` | 一～六年級 115-1 資料，以年級為鍵 |
| `window.__EMBEDDED_CURRICULUM_110__` | 110 學年度資料 |
| `window.__EMBEDDED_CURRICULUM_DEMO__` | 體驗版資料 |
| `window.TPZhuyin` | 注音排版 API（見 [zhuyin.md](zhuyin.md)） |

網頁版（根目錄 `index.html`）不內嵌資料，改以 `fetch` 讀取 `data/*.json`，因此本機需用 HTTP 伺服器開啟（例如 `python3 -m http.server 8000`）。

## 5. CSS 設計權杖（只列名稱）

來源 `src/tokens.css`（`tp-` 前綴）與 `src/zhuyin.css`（`tpz-` 前綴）。**新增樣式應引用權杖，不要硬編色碼或字級。**

### 色彩

`--tp-paper`、`--tp-paper-deep`、`--tp-surface`、`--tp-ink`、`--tp-ink-soft`、`--tp-ink-faint`、`--tp-ink-blue`、`--tp-line`、`--tp-grid-line`、`--tp-cinnabar`、`--tp-cinnabar-dark`、`--tp-cinnabar-soft`、`--tp-sage`、`--tp-sage-deep`、`--tp-sage-soft`、`--tp-amber`、`--tp-amber-deep`、`--tp-amber-soft`、`--tp-success`、`--tp-success-soft`、`--tp-warning`、`--tp-warning-soft`、`--tp-error`、`--tp-error-soft`、`--tp-info`、`--tp-subject-zh`、`--tp-subject-zh-soft`、`--tp-subject-math`、`--tp-subject-math-soft`、`--tp-subject-life`、`--tp-subject-life-soft`、`--tp-focus-ring`、`--tp-focus-ring-soft`

### 字體與字級

`--tp-font-serif`、`--tp-font-sans`、`--tp-font-kai`、`--tp-fs-caption`、`--tp-fs-small`、`--tp-fs-body`、`--tp-fs-lead`、`--tp-fs-h4`、`--tp-fs-h3`、`--tp-fs-h2`、`--tp-fs-h1`、`--tp-fs-display`、`--tp-lh-tight`、`--tp-lh-title`、`--tp-lh-body`、`--tp-lh-zhuyin`、`--tp-fw-regular`、`--tp-fw-medium`、`--tp-fw-bold`、`--tp-fw-black`

### 間距、圓角、陰影

`--tp-space-1`、`--tp-space-2`、`--tp-space-3`、`--tp-space-4`、`--tp-space-5`、`--tp-space-6`、`--tp-space-8`、`--tp-space-10`、`--tp-space-12`、`--tp-space-16`、`--tp-radius-s`、`--tp-radius-m`、`--tp-radius-l`、`--tp-radius-xl`、`--tp-radius-pill`、`--tp-shadow-1`、`--tp-shadow-2`、`--tp-shadow-3`、`--tp-shadow-lift`、`--tp-shadow-pop`

### 動效、版面、層級

`--tp-time-fast`、`--tp-time-base`、`--tp-time-slow`、`--tp-ease-out`、`--tp-ease-spring`、`--tp-ease-in-out`、`--tp-container`、`--tp-header-h`、`--tp-touch-min`、`--tp-touch-kid`、`--tp-z-header`、`--tp-z-toast`、`--tp-z-dialog`

### 注音字格

`--tpz-size`、`--tpz-cell-border`、`--tpz-grid`、`--tpz-lh`；尺寸級別 class 為 `tpz--sm`、`tpz--md`、`tpz--lg`、`tpz--xl`、`tpz--print`（各自設定 `--tpz-size`）。

### 頁面區域變數

`index.html` 另外定義 `--tp-bg-subtle`，以及 `.zz` 範圍內的 `--zz-text`、`--zz-soft`、`--zz-surface`、`--zz-deep`、`--zz-line`、`--zz-accent`、`--zz-accent-soft`、`--zz-ok`、`--zz-ok-soft`。這些 `--zz-*` 會優先對應整合站主題權杖（例如 `--tp-text`、`--tp-accent-text`），**本 repo 未定義**上述整合站權杖，未定義時使用回退值，深淺色主題因此仍可運作。

## 6. 列印設定

| 項目 | 說明 |
|---|---|
| `@page` | `size: A4`、`margin: 0` |
| `.tp-no-print` | 列印時隱藏（頁首、設定面板、按鈕） |
| `.zz-no-print`、`.zz`、`.zz-tag`、`.zz-tags` | 列印時隱藏（讀音修改相關元件） |
| `main.tp-container-main` | 列印時內距歸零，避免多印空白頁 |
| 答案卷分頁 | `.tp-sheet--answer` 使用 `break-before: page` |

## 7. 外部網路依賴

### 讀取

| 依賴 | 時機 |
|---|---|
| Google Fonts（`fonts.googleapis.com`、`fonts.gstatic.com`） | 網頁版載入字型；載入失敗改用系統字型，功能不受影響。單檔離線版**不含**此依賴 |
| 教育部國語辭典簡編本、教育部筆順學習網、教育百科 | 僅在使用者點擊連結時開啟，不在頁面載入時連線 |

### 寫入

| 依賴 | 時機 |
|---|---|
| `POST /api/report`（同源） | 使用者勾選回報且在來源白名單內；見 [http-report-api.md](http-report-api.md) |

### 打包器的網路白名單

`tools/bundle.py` 只允許下列外部網址字串出現在內聯 JS：

- `dict.concised.moe.edu.tw/search.jsp`
- `stroke-order.learningweb.moe.edu.tw/searchW.jsp`
- `pedia.cloud.edu.tw/Entry/Detail/`
- `www.w3.org/2000/svg`（SVG 命名空間字串）

同時禁止 `XMLHttpRequest`、`sendBeacon`、`WebSocket`、`EventSource`、`importScripts`。要新增任何網路功能，必須先調整打包腳本與測試，並在文件中說明。
