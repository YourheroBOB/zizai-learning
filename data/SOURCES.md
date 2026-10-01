# 字在｜資料來源清單 (SOURCES.md)

## 生字清單來源

**顏國雄老師 115 學年度國小國語各版本生字清單試算表**
- Google Spreadsheet: https://docs.google.com/spreadsheets/d/10Nq6prSt0s_ZI1Z1phlGEtr0MDDE1wDqEiPmnHWSM_Q/
- 顏國雄老師生字筆順練習選單: https://gsyan888.blogspot.com/p/stroke.html
- 授權: **授權條款未載明**（該站頁面沒有 Creative Commons 或其他授權標示，本專案不得視為已取得任何開放授權）
- 原作者聲明：筆順資料來源為教育部「國字標準字體筆順學習網」，著作權為教育部所有，供教學自學、非商業性使用。
- 生字清單原始出處（依原作者說明）：其程式中的生字清單（113 學年度）擷取自中研院語言學研究所大腦與語言實驗室「生字表字詞資料庫檔案」；本專案採用的 115 學年度試算表是否同源，本專案未另行查證。
- 本專案使用方式：僅程式化讀取各課生字集合（字與課次對應），產出的資料檔 meta.licenseNotes 已如實註明上述狀況。
- CSV 快照下載時間: 2026-10-01T04:19+08:00 (民國 115 年 10 月 1 日)
- 快照位置: **原始 CSV 快照未收入本倉庫**（`.gitignore` 已列 `data/sources/gsyan/`）。要重建資料或執行依賴快照的測試，需自行依下列步驟下載後放進 `data/sources/gsyan/`；沒有快照時，`tools/build_grades_from_sources.py` 會印出取得方式後結束（不改寫任何資料檔），測試則標示「略過」。

### 如何取得快照（15 個分頁）

1. 開啟上面的 Google Spreadsheet（下載前請先閱讀原作者網站的版權聲明）。
2. 15 個分頁各存成一個 CSV，檔名與分頁 gid（試算表網址 `#gid=` 後的數字）如下表。
3. 取得方式任選：①瀏覽器開啟各分頁，「檔案 → 下載 → 逗號分隔值 (.csv)」，依表改檔名；②用匯出網址，例如南一一年級：
   `curl -L "https://docs.google.com/spreadsheets/d/10Nq6prSt0s_ZI1Z1phlGEtr0MDDE1wDqEiPmnHWSM_Q/export?format=csv&gid=0" -o data/sources/gsyan/nanyi_1.csv`，其餘分頁把 gid 與檔名換成表中的值。
4. 放齊 15 個檔後執行 `python3 tools/build_grades_from_sources.py`。

### 快照檔案清單（15 個分頁）

| 檔案 | 版本 | 年級 | gid |
|------|------|------|-----|
| `nanyi_1.csv` | 南一 | 一年級 | 0 |
| `kangxuan_1.csv` | 康軒 | 一年級 | 1744144778 |
| `hanlin_1.csv` | 翰林 | 一年級 | 1165882537 |
| `nanyi_3.csv` | 南一 | 三年級 | 1597615434 |
| `kangxuan_3.csv` | 康軒 | 三年級 | 348763297 |
| `hanlin_3.csv` | 翰林 | 三年級 | 1268766218 |
| `nanyi_4.csv` | 南一 | 四年級 | 838505542 |
| `kangxuan_4.csv` | 康軒 | 四年級 | 1959417430 |
| `hanlin_4.csv` | 翰林 | 四年級 | 268687362 |
| `nanyi_5.csv` | 南一 | 五年級 | 1579239165 |
| `kangxuan_5.csv` | 康軒 | 五年級 | 269659925 |
| `hanlin_5.csv` | 翰林 | 五年級 | 1679030270 |
| `nanyi_6.csv` | 南一 | 六年級 | 226769020 |
| `kangxuan_6.csv` | 康軒 | 六年級 | 1745312767 |
| `hanlin_6.csv` | 翰林 | 六年級 | 646567073 |

## 注音、部首、筆畫來源

**g0v/moedict-data — 教育部《國語辭典》重編本開放資料**
- GitHub: https://github.com/g0v/moedict-data
- 檔案: `dict-revised.json.xz`（解壓後約 77MB，161,194 詞條）
- 授權: CC BY-ND 3.0 TW（教育部《重編國語辭典修訂本》；須標示出處，不得修改後散布）
- 下載時間: 2026-10-01T04:20+08:00
- 本倉庫**不收錄**辭典原檔（`data/sources/moedict/` 已列入 `.gitignore`）。要重建資料時請自行下載 `dict-revised.json.xz`，放到 `data/sources/moedict/` 後執行 `python3 tools/build_grades_from_sources.py`（腳本會自動解壓），步驟見 README.md「如何重建資料」。

### 辭典資料使用方式

- 每個字取 `radical`（部首）、`stroke_count`（筆畫）
- 多音字：依辭典多字詞條中的詞頻，取該字最常見的完整讀音（含聲調）；辭典全部讀音與占比另存於 `readings`，最常見讀音占比不足 85% 者標記 `ambiguous`（細節見 `tools/build_grades_from_sources.py` 與 DONE_1151001.md）
- 多音字清單記錄在 `GAPS.md`

## 語詞來源

- 語詞從 `dict-revised.json` 的多字詞條中篩選
- 篩選條件：詞條必須包含本課至少一個生字
- 優先選取雙字詞；優先覆蓋不同生字
- 語詞的注音（bopomofo / bopomofoArray）同樣取自辭典
- meta 欄位 `wordsSource` 標註為 `moedict-data/dict-revised.json (filtered by lesson chars)`

## 二年級（原有資料）

二年級資料（curriculum-115-1.json）為建站時已整理完成的原始資料，未經本次重建流程處理。

## 重要說明

1. 本次重建（第二輪）的所有生字清單均程式化從 CSV 快照產生，**沒有任何手打生字**。
2. 注音、部首、筆畫均程式化從辭典開放資料查詢，**查不到的字列入 GAPS.md，不猜測**。
3. 語詞均從辭典詞條篩選，**不自行編造語詞**。
4. 測試中有 15 項 CSV 快照逐課比對測試（另有 1 項列數檢查），確保每課生字集合與來源完全一致；本倉庫不收錄快照，沒有快照時這 16 項標示「略過」（不算通過也不算失敗），自行下載快照後才會執行。

---
*最後更新：民國 115 年 10 月 1 日（第八輪：授權標示如實說明）*
