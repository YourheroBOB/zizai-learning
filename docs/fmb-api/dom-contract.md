# DOM／HTML 契約

字在沒有前端框架，`src/app.js` 直接以元素 id 與 `data-*` 屬性綁定事件與渲染。因此元素 id、`data-*` 值與 class 前綴都是**對外契約**：改名會同時破壞 `src/app.js`、樣式與測試。

> 本清單依可見的 `index.html` 節錄、`src/*.css` 與 `tools/make_sample_pdfs.mjs` 整理；`index.html` 的完整內容未全部取得，故清單可能不完整，未列出的 id 不代表不存在。

## Class 前綴規範

| 前綴 | 範圍 | 說明 |
|---|---|---|
| `tp-` | 版面與元件（`src/tokens.css`、`src/base.css`、`src/components.css`、`src/print.css`） | 設計權杖與元件樣式 |
| `tpz-` | 注音字格（`src/zhuyin.css`） | 由 `TPZhuyin` 產生，見 [zhuyin.md](zhuyin.md) |
| `zz-` | 第七輪新增的讀音標注與修改讀音元件 | 樣式只寫在 `index.html` 內；顏色走語意權杖；列印時全部隱藏 |

新增元件應沿用 `zz-` 前綴與語意權杖，不要另立前綴。

## 主要元素 id

### 全域控制列

| id | 角色 |
|---|---|
| `grade-select` | 年級下拉選單（值見 [config.md](config.md)） |
| `curriculum-type-select` | 教材／學期下拉選單 |
| `pub-select` | 版本下拉選單 |
| `main` | 主內容容器（`<main>`） |

### 分頁容器

| id | 角色 |
|---|---|
| `page-progress` | 生字進度分頁 |
| `page-interactive` | 線上練習分頁 |
| `page-worksheet` | A4 測驗卷分頁 |

分頁切換以 class `on` 控制顯示；`.tp-nav-btn` 以 `data-tab` 指定目標分頁。

### 生字進度分頁

| id | 角色 |
|---|---|
| `curriculum-title-badge` | 目前教材版本／學期標示 |
| `stat-lesson-badge` | 進度來源標示（自動預估／手動覆寫） |
| `source-license-note` | 資料授權與來源說明文字 |
| `manual-lesson-select` | 家長手動指定進度；空值代表自動預估 |
| `stat-week-val` | 開學週次 |
| `stat-lesson-val` | 目前教學進度 |
| `stat-taught-count` | 已教學字數 |
| `stat-current-count` | 本週目標字數 |
| `stat-mastered-count` | 已精熟字數 |
| `stat-unfamiliar-count` | 待加強字數 |
| `char-grid` | 生字卡網格容器 |
| `zz-exportbar` | 讀音修改匯出列（有修改才顯示，`hidden` 控制） |
| `zz-exportbar-text` | 匯出列說明文字 |
| `zz-exportbar-warn` | 匯出列警告訊息（預設 `hidden`） |

`.tp-char-card` 上的狀態 class：`tp-char-card--current`（本週目標）、`tp-char-card--mastered`（已精熟）。`.tp-btn-star` 搭配 `is-active` 表示已標記精熟。

### 線上練習分頁

| id | 角色 |
|---|---|
| `quiz-scope` | 出題範圍 |
| `quiz-count` | 題數 |
| `btn-start-interactive` | 重新抽題 |
| `interactive-quiz-container` | 題目渲染容器 |

### A4 測驗卷分頁

| id | 角色 |
|---|---|
| `ws-title` | 卷首大標題（`maxlength` 限制） |
| `ws-count` | 句子填空題數（有 `min`／`max`） |
| `ws-sw-zhuyin` | 題目附直排注音（`role="switch"`） |
| `ws-sw-name` | 卷首姓名欄 |
| `ws-sw-date` | 卷首日期欄 |
| `ws-sw-score` | 卷首得分欄 |
| `btn-generate-ws` | 重新出題 |
| `btn-print-ws` | 列印／存為 PDF（呼叫 `window.print()`） |
| `ws-grade-label` | 卷頭年級文字 |
| `ws-serial` | 卷號 |
| `sheet-title` | 學生卷標題 |
| `sheet-sub` | 學生卷副標（版本＋課次） |
| `sheet-items` | 學生卷句子題容器 |
| `sheet-words` | 學生卷語詞題容器 |
| `answer-items` | 答案卷題目容器 |

`tools/make_sample_pdfs.mjs` 以上述三個容器（`#sheet-items`、`#answer-items`、`#sheet-words`）都有子節點作為「出題完成」的判斷條件；改動這些 id 會讓範例 PDF 產生流程失敗。

## `data-*` 屬性

| 屬性 | 可能值 | 所在元素 |
|---|---|---|
| `data-tab` | `progress`、`interactive`、`worksheet` | `.tp-nav-btn` |
| `data-filter` | `all`、`current`、`unfamiliar`、`mastered` | `.tp-filter-chip` |
| `data-field` | `name`、`date`、`score` | 卷首欄位（`.tp-sheet__field`） |

## 讀音相關元件 class（`zz-`）

| class | 用途 |
|---|---|
| `zz` | 作用域容器，提供 `--zz-*` 變數 |
| `zz-tag` | 一般標記（例如一般「破音」） |
| `zz-tag--ambiguous` | 明顯標記（課本讀音可能不同） |
| `zz-tag--modified` | 「已修改」標記 |
| `zz-tags` / `zz-tags__note` | 生字卡上的標記列與說明文字 |
| `zz-reading` / `zz-reading__head` / `zz-reading__title` | 彈窗讀音區 |
| `zz-rlist` / `zz-ritem` / `zz-ritem__bp` / `zz-ritem__ratio` / `zz-ritem__flag` | 讀音清單；`is-current` 標示現用讀音 |
| `zz-actions` / `zz-btn` / `zz-btn--quiet` | 動作按鈕列 |
| `zz-form` / `zz-fieldset` / `zz-field` / `zz-opts` / `zz-opt` / `zz-opt__bp` / `zz-opt__ratio` | 修改讀音表單 |
| `zz-input` / `zz-textarea` | 輸入框；`aria-invalid="true"` 表示格式錯誤 |
| `zz-check` | 核取方塊列（含回報勾選） |
| `zz-msg` | 狀態訊息（`data-kind="err"`／`"ok"`） |
| `zz-export` / `zz-exportbar` / `zz-export-msg` / `zz-export-box` | 匯出區塊與可全選複製的文字框 |
| `zz-no-print` | 列印時隱藏 |

## 無障礙契約

- 開關類控制使用 `role="switch"`（`ws-sw-*`）。
- 狀態訊息使用 `role="status"` 與 `aria-live="polite"`（例如 `zz-exportbar` 內的訊息）。
- 純裝飾元素（米字輔助線、調號、空白提示字元）加 `aria-hidden="true"`。
- 空白字格有 `aria-label="空格"`。
- 全域焦點樣式由 `--tp-focus-ring` 提供；不以滑鼠專屬互動取代鍵盤操作。
- 觸控目標大小由 `--tp-touch-min`、`--tp-touch-kid` 規範；`zz-` 元件的重要控制至少 44px 高。

## 版面與響應式契約

- 手機 375px 寬不得出現水平捲軸；`.tp-header-controls`、`.tp-nav-tabs` 需允許收窄（`min-width`／`max-width`）。
- 生字卡網格以 `auto-fill` 自適應欄數，窄螢幕縮小卡寬。
- A4 預覽在窄螢幕以 `transform: scale()` 縮小顯示，列印仍為實體 A4。
- 深淺色主題以語意權杖切換；新元件的文字對比須維持可讀（測試會檢查淺色與深色主題的文字對比）。
- `prefers-reduced-motion: reduce` 時停用裝飾動畫。
