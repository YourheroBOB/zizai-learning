# 02 設定項說明

> 本章**只列名稱與影響**，不記載任何值。需要填值時由維運人員依環境填入，並確認不落入版控。
> 本專案目前**沒有**資料庫連線字串、API 金鑰、OAuth 設定或伺服器憑證；若未來新增，一律由平台 secrets 管理，不得寫入 repo 或本手冊。

---

## 1. 建置期環境變數（只在執行腳本時存在）

| 名稱 | 用途 | 設定後影響 | 變更後必做 |
|---|---|---|---|
| `ZIZAI_OUT` | `tools/bundle.py` 的輸出資料夾 | 決定 `dist/` 產物放哪裡 | 重新打包並依 01 章第 5 節驗收 |
| `ZIZAI_G2_HTML` | `tools/build_datasets.py` 的二年級來源頁面檔 | 決定二年級資料重建的輸入 | 重建後比對 `git diff`，跑測試 |
| `ZIZAI_KIMI_JS` | `tools/build_datasets.py` 的句子／語詞來源腳本 | 決定二年級句子與語詞來源 | 同上 |
| `CHROME_BIN` | `tools/make_sample_pdfs.mjs` 使用的 Chrome 執行檔 | 找不到 Chrome 時的替代路徑 | 重產 PDF 並確認兩份來自同一次出題 |

補充：

- 未設定 `ZIZAI_OUT` 時，打包輸出預設在 repo 的 `dist/`。
- `ZIZAI_G2_HTML`、`ZIZAI_KIMI_JS` 的原始輸入**不在 repo**，缺少時腳本會說明並結束（不會產生半套資料）。一般情況不需要重跑。
- 這些變數**都不是機密**，但仍不建議寫進文件或提交任何實際路徑快照。

---

## 2. 程式內常數與全域（改動屬程式變更，需走 PR 與重新打包）

| 名稱 | 所在 | 意義 | 改動連帶影響 |
|---|---|---|---|
| `GRADE_DATA_FILES` | `src/app.js` | 年級 → 資料檔的對應表 | `tools/bundle.py` 會解析此表內嵌資料；改動後打包與測試都要重跑 |
| `REPORT_PATH` | `src/readings.js` | 回報端點的**同源相對**路徑 | 打包腳本會斷言其為相對路徑且只定義一次；同時需與伺服器端設定一致（伺服器端不在本 repo） |
| 回報來源白名單判斷 | `src/readings.js` | 只有白名單網域才會真的送出回報 | 需與伺服器端的來源檢查一致，否則會被拒；非白名單環境一律降級 |
| `window.__EMBEDDED_GRADES__` | 打包產物注入 | 內嵌的一～六年級資料 | 只在 `dist/` 產物中出現；缺鍵時 Console 會出現「年級 N 內嵌資料缺失」 |
| `window.__EMBEDDED_CURRICULUM_110__` | 打包產物注入 | 內嵌 110 學年度資料 | 同上；缺失時初始化會直接失敗並提示 |
| `window.__EMBEDDED_CURRICULUM_DEMO__` | 打包產物注入 | 內嵌體驗版資料 | 同上 |
| 蜂蜜罐欄位名稱 | 回報 payload 內 | 防機器人用的隱藏欄位 | **不可移除或改名**，否則伺服器端驗證行為改變 |

---

## 3. 瀏覽器端儲存鍵（存在使用者本機，不屬於伺服器設定）

| 鍵（名稱） | 內容 | 維運注意 |
|---|---|---|
| 學習進度鍵（目前版本，含舊版遷移邏輯） | 使用者精熟／待加強標記、自訂進度 | 換鍵名等於使用者進度歸零 → 必須保留遷移邏輯或明確告知 |
| `zizai:readingOverrides:v1` | 使用者自行修改的讀音（含備註） | 只在本機；換裝置或用無痕就沒有；**維運端不得要求上傳或代為蒐集**，備註可能含個人內容 |

相關行為（屬設計，不是可調設定）：

- 讀寫都包 try/catch；儲存空間不可用時會提示「重新整理後修改會消失」並請先匯出，不會當機。
- A4 測驗卷每次開新分頁重新出題，修改後的讀音要在新分頁才會反映到考卷。

---

## 4. 資料檔 `meta` 欄位（內容設定，屬資料變更）

| 欄位 | 意義 | 注意 |
|---|---|---|
| `meta.id` / `meta.title` | 資料集識別與名稱 | 改動會影響畫面標題與測試比對 |
| `meta.academicYear` / `grade` / `semester` / `semesterCode` / `semesterStart` | 學年度、年級、學期與開學日 | `semesterStart` 影響「自動預估本週課次」 |
| `meta.sourceType` | 資料性質（正式／歷史／體驗） | 受 `data/schema.json` 列舉限制 |
| `meta.editionNote` | 版本說明 | 顯示用 |
| `meta.licenseNotes` | **授權合規欄位** | 改動需與 `README.md`、`GRADES.md`、`data/SOURCES.md` 說法一致，不可自行放寬 |
| `meta.moeDictUrlTemplate` | 教育部辭典連結樣板 | 使用者點擊才開，不影響載入 |
| `meta.moeStrokeUrlTemplate` | 教育部筆順連結樣板 | 同上 |
| `meta.eduCloudPediaTemplate` | 教育百科連結樣板（二年級筆順圖） | 同上 |
| `meta.wordsSource` | 語詞來源標註 | 顯示與稽核用 |

---

## 5. 目錄與版控設定

| 項目 | 狀態 | 維運注意 |
|---|---|---|
| `data/sources/gsyan/` | `.gitignore` 已排除 | 來源 CSV 快照**不得提交**（授權條款未載明） |
| `data/sources/moedict/` | `.gitignore` 已排除 | 辭典原檔**不得提交**（CC BY-ND 3.0 TW、檔案大） |
| `.nojekyll` | 必須存在 | GitHub Pages 必要 |
| `.github/workflows/` | 本手冊不涵蓋、不得修改 | 需要 CI 變更時走 BOB 決策 |

自我檢查（應無輸出）：

```bash
git ls-files data/sources
```

---

## 6. 設定變更流程（五步）

1. **判定類型**：建置期環境變數／程式常數／瀏覽器儲存鍵／資料 `meta`／主機設定。
2. **評估影響**：對應上表的「變更後必做」；跨檔案的連帶影響要一起改（例如 `GRADE_DATA_FILES` 對打包腳本與測試）。
3. **本機驗證**：跑 `node tests/test_zizai.js`；若改了資料或常數，重新 `python3 tools/bundle.py` 並開 `file://` 驗收。
4. **文件同步**：更新本章與相關章節（同一 PR）。
5. **部署與觀察**：依 01 章部署、03 章驗證；異常時走 05 章回滾。

---

## 7. 明確不存在的設定（避免誤找）

- 沒有 `.env`、沒有 `config.js`、沒有執行期伺服器設定檔。
- 沒有金流、沒有登入、沒有會員資料表。
- 沒有對外 API 的寫入權限；唯一會「送出資料」的路徑是使用者明確勾選後的回報，且受白名單與降級機制約束。
