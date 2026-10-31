# 字在｜API／介面參考文件（docs/fmb-api）

本目錄是「字在」（`YourheroBOB/zizai-learning`）的介面參考文件。字在是純前端（HTML／CSS／JavaScript，無後端、無 npm 相依）的國小國語生字學習與測驗系統，另附資料重建與打包用的命令列工具。

本文件只描述**對外可觀察的介面**：全域 JS API、資料檔 schema、CLI 指令與環境變數、前端送出的 HTTP 端點、設定項與 DOM 契約。不描述內部實作細節（除非是介面契約的一部分，例如 DOM class 結構）。

## 文件地圖

| 文件 | 內容 | 主要依據 |
|---|---|---|
| [zhuyin.md](zhuyin.md) | 注音排版全域 API `window.TPZhuyin`（含 Node 用法）與 `.tpz-*` CSS 契約 | `src/zhuyin.js`、`src/zhuyin.css` |
| [data-schema.md](data-schema.md) | 課程資料 JSON schema 逐欄位參考 | `data/schema.json` |
| [data-files.md](data-files.md) | 資料檔目錄、命名規則、收錄統計、`readings`／`ambiguous` 語意、前導單元規則 | `GRADES.md`、`README.md`、`data/SOURCES.md` |
| [cli.md](cli.md) | 所有命令列指令：打包、資料重建、範例 PDF、測試 | `tools/bundle.py`、`tools/build_datasets.py`、`tools/make_sample_pdfs.mjs`、`README.md` |
| [http-report-api.md](http-report-api.md) | 前端「回報讀音」使用的 `POST /api/report` 契約與來源白名單 | `DONE_1151001.md`（第七輪）、`tools/bundle.py` |
| [config.md](config.md) | 環境變數、localStorage 鍵、HTML 列舉值、內嵌全域變數、CSS 設計權杖名稱、外部網路依賴 | `src/tokens.css`、`index.html`、`tools/*` |
| [dom-contract.md](dom-contract.md) | 頁面元素 id、`data-*` 屬性、class 前綴、列印與無障礙契約 | `index.html`、`src/*.css`、`tools/make_sample_pdfs.mjs` |

## 閱讀慣例

- 參數表中的「必填／選填」以 `?` 標示選填。
- 型別沿用 JavaScript／JSON 用語：`string`、`number`、`integer`、`boolean`、`string[]`、`object`。
- 「錯誤」一節只寫介面實際會產生的行為（例外、結束碼、降級訊息）；沒有特別寫的就是不拋錯。
- 程式碼範例只用來說明介面形狀，範例中的字例與句子為示意，不代表官方教材內容。
- 設定項只列**變數名／鍵名／列舉值**，實際設定值請見對應原始檔；文件不抄錄憑證、金鑰或個人資料（本 repo 亦不含此類資料）。

## 名詞

| 名詞 | 說明 |
|---|---|
| 年級（grade） | 一年級至六年級；前端列舉值為 `1`～`6` |
| 版本（publisher） | 康軒、翰林、南一；鍵名為 `kangxuan`、`hanlin`、`nanyi` |
| 單元／課（lesson） | 資料中的一個 `lessons[]` 元素，以 `lessonNo` 標識；前導單元使用 0 或負數 |
| 生字（character） | 田字格練習的單字物件 |
| 語詞（word） | 兩個字以上的詞，含逐字注音 `bopomofoArray` |
| 句子（sentence） | 供填空練習的句子，含目標詞 `target` |
| 破音（ambiguous） | 辭典最常見讀音占比低於門檻的字，畫面加註「課本讀音可能不同」 |

## 收錄範圍與已知缺口

本文件依本次可取得的檔案內容撰寫，以下項目**未取得原始碼內容**，因此未提供逐項 API 參考（不以推測補寫）：

| 缺口 | 影響 | 目前處理方式 |
|---|---|---|
| `src/app.js` | 主程式內部函式（進度計算、出題、考卷組版）沒有函式級參考 | 只記錄它對外的 DOM 契約與資料載入介面（見 `dom-contract.md`、`config.md`） |
| `src/readings.js` | 多音字標注與「修改讀音」的純邏輯函式沒有函式級參考 | 只記錄 `POST /api/report` 契約與 localStorage 格式（見 `http-report-api.md`、`config.md`） |
| `index.html` 完整內容 | DOM 契約只涵蓋可見節錄部分 | 標示「節錄」並註明清單可能不完整 |
| `src/components.css` | 元件樣式類別未逐一列出 | 只列 `zhuyin.css`、`print.css`、`tokens.css` 與 `index.html` 內可見類別 |
| `tests/test_zizai.js` | 測試內部函式與斷言沒有函式級參考 | 只記錄執行方式、項目數與略過規則（見 `cli.md`） |
| `tools/build_grades_from_sources.py` | 只有介面層（輸入、輸出、結束碼） | 見 `cli.md` |

## 安全與資料政策

- 文件不包含任何 token、金鑰、密碼、客戶個資、LINE 訊息內文或案件當事人資料；本 repo 亦未收錄此類資料。
- 需要假值示範時一律使用 `FAKE_VALUE_FOR_TEST` 這類明顯假字串。
- 前端唯一允許的網路寫入行為是使用者勾選後的同源 `POST /api/report`；對外讀取僅限使用者點擊後才開啟的教育部連結（見 `config.md`「外部網路依賴」）。
- 資料檔的授權狀況以 `README.md`、`data/SOURCES.md`、`GRADES.md` 的說明為準；本目錄不重述完整授權條文，也不主張任何未載明的授權。
