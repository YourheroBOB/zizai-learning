# 課程資料結構稽核工具

此工具為「字在」115 學年度課程 JSON 增加一層免安裝套件的結構與欄位一致性檢查。它可協助在資料重建或人工檢視後，及早發現課次重複、生字欄位異常、筆畫格式錯誤，以及語詞／句子的字數與注音音節數不一致。

工具只讀取指定資料目錄中的 JSON，不會改寫資料、不連線網路，也不會輸出課程內容。檢查涵蓋 `curriculum-115-1.json` 與一、三、四、五、六年級的 115 學年度資料；110 學年度歷史版和體驗版使用不同資料結構，因此不在本工具範圍內。

## 執行方式

在 repo 根目錄執行：

```sh
node fmb_feature2/audit_curriculum.mjs
```

工具預設讀取 `./data/`。若資料放在其他目錄，可指定路徑：

```sh
node fmb_feature2/audit_curriculum.mjs --data-dir /path/to/data
```

有任何檔案讀取、JSON 解析或資料稽核問題時，工具會列出檔名與欄位路徑，並以非零狀態結束。診斷不會包含欄位值。

## 測試

在 repo 根目錄執行：

```sh
node --test fmb_feature2/test_audit_curriculum.mjs
```

測試使用 Node.js 內建測試工具，臨時測試資料寫入系統暫存目錄並在測試結束時清除，不需要套件安裝或網路連線。

## 整合方式

建議在更新或重建 115 學年度課程 JSON 後執行稽核，再執行 repo 原有測試：

```sh
node fmb_feature2/audit_curriculum.mjs
node tests/test_zizai.js
```

此工具是既有測試的補充，不取代 `tests/test_zizai.js`、`data/schema.json` 或來源快照比對。正式整合時，可由維護者在本機資料重建流程中手動執行；本次新增內容不修改既有腳本、測試或 CI 設定。
