# 字在（zizai-learning）維運手冊

> 文件版本：v1（本次建立，僅新增於 `docs/fmb-runbook/`）
> 適用對象：接手 `YourheroBOB/zizai-learning` 的維運者／值班工程師
> 撰寫原則：只寫「做法」與「變數名稱」，**不記載任何設定值、憑證、金鑰或使用者內容**；需要填值的地方一律用 `<...>` 佔位。

---

## 1. 這個系統是什麼

「字在」是**純前端靜態網站**：HTML + CSS + JavaScript，加上一批 JSON 課程資料。
沒有後端、沒有資料庫、沒有伺服器端授權，也沒有執行期環境變數。使用者產生的資料（學習進度、讀音修改）只存在**使用者自己的瀏覽器** localStorage。

### 1.1 系統組成與責任邊界

| 元件 | 位置 | 在本 repo？ | 維運責任 |
|---|---|---|---|
| 網頁版入口 | `index.html` | 是 | 本手冊 |
| 樣式與程式 | `src/tokens.css`、`base.css`、`components.css`、`zhuyin.css`、`print.css`、`zhuyin.js`、`readings.js`、`app.js` | 是 | 本手冊 |
| 課程資料 | `data/curriculum-*.json`、`data/schema.json` | 是 | 本手冊 |
| 資料說明文件 | `data/SOURCES.md`、`data/GAPS.md`、`GRADES.md`、`README.md`、`DONE_1151001.md` | 是 | 本手冊 |
| 資料重建腳本 | `tools/build_grades_from_sources.py`、`tools/build_datasets.py` | 是 | 本手冊 |
| 單檔打包腳本 | `tools/bundle.py`（產出 `dist/index.html`、`dist/zi-zai.html`） | 是 | 本手冊 |
| 範例 PDF 產生 | `tools/make_sample_pdfs.mjs` | 是 | 本手冊 |
| 測試 | `tests/test_zizai.js`、`tests/RESULT_1151001*.txt` | 是 | 本手冊 |
| 靜態主機 | GitHub Pages（repo 根目錄）或其他靜態主機 | 否 | 平台 |
| 回報端點 | 同源相對路徑的 POST（整合站 worker） | 否 | 整合站維護者 |
| Google Fonts | 外部 CDN（**僅網頁版**，離線單檔版已移除） | 否 | 外部 |
| 教育部辭典／筆順網站 | 外部連結（使用者點擊才開） | 否 | 外部 |

> 邊界：凡「不在本 repo」的元件，本手冊只描述**前端應有的降級行為**與**通報窗口**，不描述其內部設定。

### 1.2 三句話摘要

1. **安裝**＝取得 repo、準備 Node 22+ 與 Python 3，起一個本機靜態伺服器即可（資料用 `fetch` 讀，不能雙擊開檔）。
2. **部署**＝把 `index.html`、`src/`、`data/` 一起放上靜態主機（GitHub Pages 由根目錄直出）；`dist/` 是可選的離線單檔產物，需自行產生。
3. **故障**多半是三類：資料檔取不到、打包斷言失敗、外部相依（字型／回報端點）異常。前兩類本 repo 可修，第三類只看「降級是否正常」。

---

## 2. 文件索引

| 文件 | 內容 | 何時看 |
|---|---|---|
| [01-install-and-deploy.md](01-install-and-deploy.md) | 安裝、資料重建、打包、測試、部署步驟與部署後檢查清單 | 第一次接手、每次部署 |
| [02-configuration.md](02-configuration.md) | 設定項清單（**只有變數名稱**）、影響範圍、變更後必做 | 要改設定或改程式常數前 |
| [03-health-check.md](03-health-check.md) | 分層健康檢查（L0–L4）、指令、期望值、判定標準 | 部署後、每日／每週巡檢 |
| [04-troubleshooting.md](04-troubleshooting.md) | 常見故障：症狀 → 診斷 → 處置 → 驗收 | 收到告警或使用者回報 |
| [05-rollback.md](05-rollback.md) | 回滾判斷、四級回滾程序、回滾後必做、禁止事項 | 變更造成線上異常 |
| [06-monitoring-alerting.md](06-monitoring-alerting.md) | 監控訊號、頻率、門檻、告警分級與值班流程 | 建監控、調告警、檢討 |

---

## 3. 名詞對照

| 名詞 | 說明 |
|---|---|
| 年級 | 一～六年級；資料檔 `data/curriculum-115-1-g{1,3,4,5,6}.json`，二年級使用 `data/curriculum-115-1.json`（歷史相容檔名） |
| 版本 | 康軒／翰林／南一，對應 `publishers` 內的鍵 |
| 課次 `lessonNo` | 正整數＝正式課次；`0`＝來源標記為 L00 的前導單元；**負數**＝來源無課碼的前導單元，依出現順序由 −N 遞增，保證排在正式課次前且不撞號 |
| 字次／不重複字 | 各版本各課出現一次算一次／跨課跨版本去重後的字數（115-1 一、三～六年級合計 2,703 字次、1,898 不重複字） |
| `readings` / `ambiguous` | 每字的辭典完整讀音（含聲調）與占比；`ambiguous`＝最常見完整讀音占比 <85%，畫面上標「破音」並提示「課本讀音可能不同」（共 143 字） |
| 破音標記門檻 | 次要讀音占比 ≥10% 標一般「破音」；合計標記 178 字 |
| 三種資料集 | 115-1（正式，含一、三～六年級與二年級本檔）、110（歷史版，僅二年級）、demo（生活情境體驗版） |

---

## 4. 安全與合規底線（所有章節一體適用）

1. **不得**把任何 token、金鑰、密碼、客戶個資、通訊軟體訊息內容、案件當事人資料寫進 repo、Issue、PR 或本手冊。
2. `data/sources/gsyan/` 與 `data/sources/moedict/` 已列入 `.gitignore`：來源 CSV 快照與辭典原檔**不進版控**（授權條款與檔案大小因素）。檢查方式見 03 章。
3. 前端只在使用者瀏覽器本機存放資料；**維運端不得要求使用者上傳或代為蒐集** localStorage 內容，尤其是「修改讀音」的備註欄位（可能含個人內容）。
4. 執行任何處置時，**不得**連線或改動正式服務的資料；健康檢查一律用唯讀 GET／HEAD。
5. 不得修改 `.github/workflows`、secrets／憑證設定、git remote；需要變更時列為「需 BOB 決策」。

---

## 5. 本手冊的維護規則

1. 任何影響「安裝、設定、部署、回滾、監控」的變更，**在同一個 PR 內**更新對應章節。
2. 更新時只動 `docs/fmb-runbook/` 底下的 Markdown，不要順手改程式或資料檔。
3. 文件不記錄執行結果的原始輸出（那屬於工單／CI 紀錄）；文件只記錄**期望值**與**判讀方式**。
4. 若程式行為與本手冊不一致，以程式為準並立即回頭修正本手冊（同一 PR）。

---

*最後更新：v1 建立*
