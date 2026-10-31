# 字在（zizai-learning）架構決策紀錄與上手指南

本目錄整理「字在」現有架構中**隱含但沒有寫下來**的重要設計決策，以及一份新進開發者的上手指南。
內容只根據倉庫內的檔案（README、DONE_1151001.md、GRADES.md、data/SOURCES.md、data/schema.json、可讀到的原始碼）整理，**不新增功能、不改動任何既有檔案**。

## 文件索引

| 文件 | 一句話結論 |
|------|-----------|
| [ADR-0001](ADR-0001-pure-static-frontend.md) | 純靜態前端：無框架、無後端、無建置步驟，資料用 `fetch` 讀 JSON。 |
| [ADR-0002](ADR-0002-data-driven-curriculum.md) | 課程資料以 `data/*.json` 為唯一真實來源，依年級按需載入。 |
| [ADR-0003](ADR-0003-provenance-boundary.md) | 授權不明的原始資料不進倉庫，只提交程式產出的資料檔，並如實標示授權。 |
| [ADR-0004](ADR-0004-generated-data-frequency-readings.md) | 資料一律由程式從具名來源產生；讀音用辭典詞頻決定，禁止手寫或生成補齊。 |
| [ADR-0005](ADR-0005-reading-overrides.md) | 讀音有疑慮時採「標注 + 使用者本機覆寫」，不回寫資料。 |
| [ADR-0006](ADR-0006-network-surface-pinning.md) | 預設零網路請求；回報需明示勾選、同源、可被打包腳本機械驗證。 |
| [ADR-0007](ADR-0007-zhuyin-component.md) | 注音排版自建元件（直排注音＋田字格），邏輯與 DOM 分離、可測試、可列印。 |
| [ADR-0008](ADR-0008-offline-bundle.md) | 單檔離線版由打包腳本產生，每個替換點都斷言「恰好命中一次」。 |
| [ADR-0009](ADR-0009-print-worksheet.md) | A4 考卷：螢幕預覽等於列印版面，學生卷與答案卷來自同一次出題。 |
| [ADR-0010](ADR-0010-zero-dependency-node-tests.md) | 測試是零依賴 Node 腳本，同時是規格書；「略過」不等於通過。 |
| [ONBOARDING.md](ONBOARDING.md) | 模組地圖、資料流、常見修改路徑、陷阱與驗證清單。 |

## 這批文件怎麼讀

- 只想動手改東西：先讀 [ONBOARDING.md](ONBOARDING.md)。
- 想理解「為什麼不能手改 data/*.json」：讀 ADR-0003、ADR-0004。
- 想加網路功能或新的外部資源：先讀 ADR-0006、ADR-0008。
- 想改畫面或考卷版面：讀 ADR-0007、ADR-0009 與 ONBOARDING 的「陷阱」。

## ADR 撰寫規則（本目錄慣例）

1. 檔名 `ADR-NNNN-短標題.md`，四位數流水號，不重複使用已刪除的號碼。
2. 每份固定章節：狀態、背景、決策、取捨、後果（可加「驗證方式」）。
3. 狀態只用四種：`提議`、`已採行`、`已取代（被 ADR-NNNN 取代）`、`已廢止`。
4. 決策改變時**不要改寫舊 ADR 的結論**，新增一份標明取代關係。
5. 內容不得包含 token、金鑰、密碼、客戶個資、訊息內文或案件當事人資料；示例一律抽象化。

## 文件範圍與已知落差

- 本批文件整理時，可逐行核對的檔案為：`README.md`、`DONE_1151001.md`、`GRADES.md`、`data/SOURCES.md`、`data/schema.json`、`.gitignore`、`src/tokens.css`、`src/base.css`、`src/print.css`、`src/zhuyin.css`、`src/zhuyin.js`、`tools/bundle.py`、`tools/build_datasets.py`、`tools/make_sample_pdfs.mjs`、`index.html`（部分）。
- `src/app.js`、`src/readings.js`、`src/components.css`、`tests/test_zizai.js`、`tools/build_grades_from_sources.py` 與各 `data/curriculum-*.json` 在整理時未逐行核對，凡涉及內部細節（函式名、鍵名、行號、欄位順序）**一律以原始碼為準**；本文件只描述文件與程式註解已明示的行為。
- README 提到的 `dist/`（單檔離線版與範例 PDF）在本次取得的檔案清單中沒有出現，可能是未隨此快照提供；`tools/bundle.py` 會自行建立 `dist/`。
- 本次快照沒有 `.github/`，也就是沒有 CI 設定；驗證方式是手動執行 `node tests/test_zizai.js` 並把輸出留在 `tests/RESULT_1151001*.txt`。
- 倉庫沒有 `LICENSE` 檔，程式碼授權「未指定」（見 ADR-0003），文件不得自行宣稱任何授權。

---
*本目錄為唯讀說明文件，不含可執行邏輯；變更文件不需重跑測試。*
