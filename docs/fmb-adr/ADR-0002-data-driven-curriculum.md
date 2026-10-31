# ADR-0002：課程資料以 JSON 為唯一真實來源，依年級按需載入

- 狀態：已採行
- 相關檔案：`data/curriculum-115-1.json`、`data/curriculum-115-1-g{1,3,4,5,6}.json`、`data/curriculum-110.json`、`data/curriculum-demo.json`、`data/schema.json`、`src/app.js`、`tools/bundle.py`

## 背景

涵蓋一～六年級、三個版本（康軒、翰林、南一）、每版本 7～12 個單元，全部生字與語詞加起來是數千筆。
若把生字寫進 JavaScript，任何資料修正都要改程式，且無法獨立驗證資料正確性。

## 決策

1. 課程內容**只存在於 `data/curriculum-*.json`**，前端不硬寫任何生字、語詞或課次。
2. 結構由 `data/schema.json` 描述（`meta` + `publishers` → `lessons` → `characters` / `words` / `sentences`）。
3. 檔名規則：
   - 二年級維持舊檔名 `curriculum-115-1.json`（相容性）；
   - 其他年級 `curriculum-115-1-g{N}.json`（N = 1、3、4、5、6）；
   - `curriculum-110.json`（110 學年度，僅二年級）、`curriculum-demo.json`（體驗版）。
4. 前端以「年級 → 檔案路徑」對照表（`GRADE_DATA_FILES`）按需載入：選到該年級才 `fetch`，不預載全部年級。
5. 110 學年度與體驗版只支援二年級；切到其他年級時自動回到 115-1。
6. 前端顯示課次時**遍歷實際的 `lessons` 陣列**，不假設固定 12 課；前導單元用 `title` 顯示（見 GRADES.md 的 lessonNo 編碼規則）。

## 取捨

**換到**

- 資料可獨立重建、獨立比對、獨立版本控管（見 ADR-0004）。
- 新增或修正資料不需要改前端程式。
- 單一 Front-end 可同時服務多個年級與多個教材版本。

**付出**

- 靜態檔案變多，首次切換年級有載入延遲。
- 「年級 → 檔名」是一份**跨檔案的隱性契約**：前端對照表、`tools/bundle.py` 的解析規則、`schema.json`、`GRADES.md` 必須一致。
- 沒有執行期 schema 驗證，資料錯誤要靠測試發現。

## 後果

- `tools/bundle.py` 會用正則從 `app.js` 抓出「年級 → 檔案」對照表，並**要求鍵恰好是 1～6、值為 `data/…json`**；新增年級或改路徑時必須同步改打包腳本，否則打包直接失敗。
- 新增資料檔時要同步更新 `GRADES.md` 的統計表與測試中的資料合規項目。
- 前端程式對「欄位可能不存在」必須容錯：二年級舊資料沒有 `readings` / `ambiguous`（見 ADR-0005），七年級以後若新增欄位亦同。
- `lessonNo` 不保證從 1 開始（前導單元為 0 或負數），任何迴圈、排序、卷號推算都要以陣列實際內容為準。
