# 字在（zizai-learning）新進開發者上手指南

本文件假設你已經 clone 了倉庫、看過 `README.md`。目標是讓你在 30 分鐘內知道「東西在哪、資料怎麼流、要改的地方在哪、哪裡會踩雷」。
架構層面的「為什麼」請看同目錄的 ADR；本文件只講「怎麼動手」。

---

## 1. 三分钟跑起來

```bash
# 網頁版（需要 HTTP 伺服器，不能雙擊開檔）
python3 -m http.server 8000
# 開 http://127.0.0.1:8000/

# 測試（零依賴，Node 22）
node tests/test_zizai.js

# 單檔離線版（產出 dist/index.html 與 dist/zi-zai.html）
python3 tools/bundle.py

# 重新產生範例 PDF（需 Node 22+ 與本機 Chrome，可選）
node tools/make_sample_pdfs.mjs
```

資料重建（可選，需要自行下載外部來源，見 `README.md`「如何重建資料」）：

```bash
python3 tools/build_grades_from_sources.py     # 一、三～六年級
# 二年級／110／體驗版需要環境變數指定原始輸入：
#   ZIZAI_G2_HTML=... ZIZAI_KIMI_JS=... python3 tools/build_datasets.py
```

> 缺少外部大檔時，重建腳本會印出取得方式並以結束碼 2 離開，**不會改寫任何資料檔**；測試對應項目會標示「略過」。

---

## 2. 模組地圖

```
index.html                 唯一入口：頁首選單（年級／學年度／版本）、三個分頁、A4 雙頁預覽、
                           以及第七輪的 zz- 讀音修改面板與樣式（內嵌 <style>）
src/tokens.css             設計權杖（顏色、字級、間距、圓角、陰影、動效、層級）。所有模組必須引用，禁止硬編色碼
src/base.css               reset、字體與內文節奏、容器、無障礙（focus ring、sr-only）、動效偏好
src/components.css         共用 UI 元件（按鈕、卡片、面板、欄位、開關、徽章…）
src/zhuyin.css             注音字格樣式：田字格＋米字線、直排注音欄、聲調位置、尺寸級別、列印強化
src/print.css              A4 紙張框架、卷首、大題、答案卷分頁、列印媒體查詢
src/zhuyin.js              window.TPZhuyin：splitSyllable / cell / word / sentence / ruby（可於 Node 直接呼叫）
src/readings.js            多音字標注與「修改讀音」純邏輯：讀音清單、破音門檻、注音格式驗證、
                           localStorage 覆寫、語詞音節替換、匯出、明示勾選的回報（唯一網路請求）
src/app.js                 主程式：狀態、年級／版本切換、資料載入、週次與進度、字卡與彈窗、線上練習、
                           A4 出題與列印、localStorage 進度
data/schema.json           課程資料 JSON Schema（meta + publishers → lessons → characters/words/sentences）
data/curriculum-115-1.json         二年級（原始檔，檔名維持相容性）
data/curriculum-115-1-g{1,3,4,5,6}.json  一、三～六年級（程式產生，含 readings / ambiguous）
data/curriculum-110.json           110 學年度（僅二年級）
data/curriculum-demo.json          生活情境自編體驗版
data/SOURCES.md / data/GAPS.md     來源清單（含授權與取得方式）／已知缺口與多音字待確認清單
tools/build_grades_from_sources.py 由 CSV 快照＋辭典重建一、三～六年級資料
tools/build_datasets.py            由外部輸入重建二年級／110／體驗版（需環境變數指定檔案）
tools/bundle.py                    打包單檔離線版；同時把「網路面」與「替換點」釘死
tools/make_sample_pdfs.mjs         用無頭 Chrome 由同一份 DOM 產生範例 PDF（零依賴，Node 22 內建模組）
tests/test_zizai.js                全部測試（模組 1～N）；輸出留在 tests/RESULT_1151001*.txt
README.md / GRADES.md / DONE_1151001.md  使用說明／各年級收錄概況／逐輪製作與事故紀錄（最值得先讀）
```

### 讀檔順序建議

1. `DONE_1151001.md`：這份是「事故史」，說明為什麼資料不能手打、為什麼讀音要改詞頻法、為什麼列印會多一頁。讀完再碰資料，可以少走很多冤枉路。
2. `index.html`（只看結構與選單）→ `src/app.js`（狀態與流程）。
3. `src/zhuyin.js` + `src/zhuyin.css`（排版）→ `src/print.css`（列印）。
4. `src/readings.js`（讀音覆寫與回報）。
5. `data/schema.json` + 任一份 `data/curriculum-*.json` 的前 50 行。

---

## 3. 資料流

### 3.1 執行期（瀏覽器）

```
index.html
  ├─ 載入 CSS：tokens → base → components → zhuyin → print（順序不可換）
  ├─ 載入 JS ：zhuyin.js → readings.js → app.js（順序不可換）
  └─ app.js 初始化
       ├─ 讀 localStorage（學習進度、讀音覆寫 zizai:readingOverrides:v1）
       ├─ 依目前年級 fetch 對應的 data/curriculum-*.json（按需載入）
       ├─ 另載 curriculum-110.json 與 curriculum-demo.json（僅二年級實際使用）
       ├─ 推算週次與預估課次（可由「家長自訂教學進度」覆寫）
       └─ 渲染三個分頁
            ├─ 生字進度：字卡（TPZhuyin.cell + readings 標注）／詳情彈窗（讀音清單、修改讀音、匯出）
            ├─ 線上練習：依範圍（本週／已教累計／不熟）抽題
            └─ A4 考卷：抽題 → 學生卷（blank）＋答案卷（answer）→ 列印
```

讀音覆寫的流向：`localStorage` → `src/readings.js` → 字卡／彈窗／練習／考卷（只替換音節相符的位置）。回報只在使用者勾選時，以同源 `POST /api/report` 送出（見 ADR-0006）。

### 3.2 建置期（資料）

```
data/sources/gsyan/*.csv（自行下載，未進倉庫）
data/sources/moedict/dict-revised.json.xz（自行下載，未進倉庫）
        │
        └─ tools/build_grades_from_sources.py
                ├─ 生字：CSV 每一列（含前導列）
                ├─ 注音／部首／筆畫：辭典查詢（查無者 FALLBACK + GAPS.md 依據）
                ├─ 讀音：去聲調詞頻 → base，再以含聲調詞頻定聲調；輸出 readings / ambiguous
                └─ 語詞：辭典中含本課生字的二字詞，音節需一致、排除疊字、優先同課生字
                        │
                        └─ data/curriculum-115-1-g{1,3,4,5,6}.json
                                │
ZIZAI_G2_HTML / ZIZAI_KIMI_JS ─ tools/build_datasets.py ─ curriculum-115-1.json / 110 / demo
                                │
                                └─ tools/bundle.py → dist/index.html、dist/zi-zai.html
```

---

## 4. 常見修改路徑

### A. 某個字的讀音「和課本不一樣」

1. 先查 `data/GAPS.md`「多音字待人工確認」是否已列該字與占比。
2. 若確定是**詞頻法邏輯**問題（例如某類詞條被誤計），改 `tools/build_grades_from_sources.py` 的選音邏輯後重跑，並確認其他字沒有連帶變動。
3. 若只是課本不同、辭典沒錯：**不要改資料**。走使用者覆寫（ADR-0005），或把差異記到 `data/GAPS.md`。

### B. 修正或新增一課／一學期的資料

1. 更新來源快照（自行下載到 `data/sources/…`，**不要提交**）。
2. 重跑產生器；比對差異是否只落在預期的欄位。
3. 同步更新 `GRADES.md`（統計表）、`data/SOURCES.md`、`data/GAPS.md`。
4. 跑測試；若資料欄位有新增，補上對應的資料合規項目。

### C. 新增一個年級

1. 產生 `data/curriculum-115-1-g{N}.json`。
2. 更新 `src/app.js` 的年級 → 檔案對照表與年級選單（`index.html`）。
3. **同步更新 `tools/bundle.py`**：它會解析該對照表並要求鍵恰好是 1～6，多一個年級就會失敗（刻意的）。
4. 更新 `data/schema.json`（若結構有變）、`GRADES.md`、測試資料合規項目。
5. 重跑測試與打包。

### D. 改字卡／彈窗的畫面

1. 樣式優先寫在 `src/components.css`；只屬於本頁的元件用 `index.html` 內嵌 `<style>`，並使用 `zz-` 前綴（避免與整合站主題衝突）。
2. 顏色一律走語意權杖，並保留無主題權杖時的退回色（第七輪的 `zz-` 區塊是範例）。
3. 改完檢查：320/375 寬不溢出、深淺色對比足夠、列印時 `zz-` 元件隱藏。

### E. 改 A4 考卷題型

1. 結構改 `index.html` 的 `.tp-sheet`；版面規則改 `src/print.css`。
2. 出題邏輯改 `src/app.js`；務必同時產生學生卷（`blank`）與答案卷（`answer`）。
3. 確認：無空大題、題數不超過題庫量、卷號可辨識年級與課次、只印兩頁。
4. 有例句與沒有例句的年級都要看一次（二年級 vs 其他年級）。

### F. 改注音排版

1. 邏輯在 `src/zhuyin.js`，樣式在 `src/zhuyin.css`，尺寸用 `--tpz-size`。
2. 保留 Node 可執行性（不要在頂層直接呼叫 `document`）。
3. 檢查：直排順序、聲調位置、輕聲點位置、列印 14mm、學生卷不洩題。

### G. 新增可回報的事件種類

1. `src/readings.js`（payload 與白名單）→ `src/app.js`（傳入）→ 測試（對照 worker 驗證規則）。
2. 若新增任何網路行為或外部網址，**必須同時改 `tools/bundle.py` 的白名單**，並更新 ADR-0006。
3. 測試一律使用假 fetch 與明顯假字串，不得連上正式服務。

---

## 5. 陷阱清單（依痛點排序）

1. **不要手改 `data/curriculum-*.json`。** 資料是產出物；手改會在下次重建被覆蓋，並讓「與 CSV 快照逐課比對」的測試失敗。要改就改來源或產生器（ADR-0004）。
2. **`lessonNo` 不從 1 開始。** 前導單元是 0 或負數（例如南一一年級為 −2、−1）。任何迴圈、卷號、下拉選單都要用實際 `lessons` 陣列，不可寫死 `1..12`（第六輪曾因此出現重複課名）。
3. **`tools/bundle.py` 的斷言會咬人。** 改 `index.html` 的 `<link>`／`<script>` 標籤、改 `app.js` 的資料載入段落、加第二個 `fetch`，打包都會直接失敗。這是設計，不是 bug。
4. **不要把外部資源帶進單檔版。** 網頁版可以用 Google Fonts，單檔版不行；新的 CDN、圖示庫、API 都要先想清楚兩個版本。
5. **`file://` 不能 `fetch`。** 本機一定要起 HTTP 伺服器，否則資料載不進來（這也是單檔版要內嵌資料的原因）。
6. **顏色與間距不要硬編。** `tokens.css` 開頭就寫明「所有模組必須引用本檔」；硬編色碼會在深色主題或整合站主題下壞掉。
7. **列印多一頁空白＝容器內距問題。** `print.css` 用 `main.tp-container-main` 提高權重歸零內距，因為 `index.html` 的內嵌 `<style>` 排在後面；改選擇器時很容易復發（ADR-0009）。
8. **測試「略過」不是「通過」。** 純複製倉庫是 66 通過 / 21 略過；補齊辭典檔與快照後才是 87 全過。驗收要看三個數字。
9. **localStorage 是相容性契約。** 讀音覆寫鍵是 `zizai:readingOverrides:v1`；改鍵名或格式要提供遷移，且讀寫都要 `try/catch`（隱私模式會丟錯）。
10. **二年級資料沒有 `readings` / `ambiguous`。** 前端對「欄位不存在」必須容錯；不要假設每個字都有讀音清單。
11. **不要把原始 CSV 或辭典檔加進版本控制。** 授權狀態不同（未載明 / CC BY-ND），`.gitignore` 已擋；文件措辭也不得美化（ADR-0003）。
12. **不要連上正式服務做測試。** 回報端點、教育部網站都一樣；用假 fetch、假字串。
13. **不要新增編譯步驟或 npm 依賴。** 需要框架、打包器、測試框架，先開 ADR（ADR-0001、ADR-0010）。
14. **`dist/` 是產出物。** 要改樣式請改 `src/` 再打包；本次快照沒有 `dist/`，README 描述的成品可能未隨快照提供。

---

## 6. 送出前的驗證清單

- [ ] `node tests/test_zizai.js`：記錄通過／略過／失敗三個數字（有無新增失敗）。
- [ ] 若動到資料或產生器：重跑產生器，確認輸出與工作樹一致（可重現），且 `GRADES.md`／`data/GAPS.md` 統計同步。
- [ ] 若動到 `index.html`、`src/*.js`、`src/*.css`：`python3 tools/bundle.py` 必須成功。
- [ ] 若動到版面：桌面＋320/375 寬＋列印預覽（有例句與無例句的年級各一）。
- [ ] 若動到讀音相關：字卡、彈窗、線上練習、學生卷、答案卷五處都看到新讀音；還原與匯出正常。
- [ ] 若動到網路相關：未勾選時零請求；勾選時只有一處同源 POST；失敗時只有一行說明。
- [ ] 沒有把任何 token、金鑰、憑證、個資、訊息內文或當事人資料寫進檔案或測試。

---

## 7. 名詞對照

| 名詞 | 意思 |
|------|------|
| 生字（characters） | 每課要學的國字，含注音、部首、筆畫、辭典與筆順連結 |
| 語詞（words） | 由辭典詞條篩選、含本課生字的詞，附 `bopomofoArray` |
| 例句（sentences） | 目前只有二年級有；其他年級因此不顯示句子大題 |
| 破音 | 該字有多个讀音；`ambiguous` 另加註「課本讀音可能不同」 |
| `readings` / `ambiguous` | 辭典全部讀音與占比／最常見讀音占比 <85% 的標記（一、三～六年級才有） |
| 前導單元（foundation unit） | 正式課次前的單元，`lessonNo` 為 0 或負數，`title` 用來源標籤原文 |
| 覆寫（override） | 使用者在本機修改的讀音，存 localStorage，不改資料 |
| 單檔離線版 | `dist/index.html`＝`dist/zi-zai.html`，內嵌全部 CSS/JS/資料，可 `file://` 開啟 |

---

*本文件與同目錄 ADR 均為說明文件；若與原始碼不一致，以原始碼為準，並請開一份新 ADR 記錄變更。*
