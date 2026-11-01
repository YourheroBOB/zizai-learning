# 字在效能與可靠性審查

本目錄是 fmb 批次的效能與可靠性審查紀錄。只描述本倉庫靜態前端與本機工具，不記載設定值、憑證、金鑰或使用者內容。

## 文件

| 文件 | 內容 |
|---|---|
| [01-findings.md](01-findings.md) | 已確認與待驗證的發現。每項含位置、影響、建議修法、驗證方式、優先級。 |
| [02-verification.md](02-verification.md) | 後續改程式時的離線驗證計畫。不連正式服務，不讀寫倉庫以外路徑。 |

同目錄若已有其他審查檔，本次不覆寫、不合併、不引用其結論。

## 審查範圍

看過的程式與頁面：`index.html`（後段標示截斷）、`src/zhuyin.js`、`src/base.css`、`src/zhuyin.css`、`src/print.css`、`src/tokens.css`、`tools/bundle.py`、`tools/make_sample_pdfs.mjs`、`tools/build_datasets.py`，以及 `README.md`、`data/SOURCES.md`、`docs/fmb/ARCHITECTURE.md`、`DONE_1151001.md` 對載入與回報行為的描述。

本次提供內容沒有完整原文、因此不作行級結論的檔案：`src/app.js`、`src/readings.js`、`src/components.css`、`tools/build_grades_from_sources.py`、`tests/test_zizai.js`。相關項目在發現裡標成「待驗證」。

## 優先級

| 等級 | 意義 | 建議順序 |
|---|---|---|
| P0 | 會掛住行程、留下外部行程，或把已發布的教材 JSON 寫壞 | 先做 |
| P1 | 使用者會等到失敗、白載大量資料，或失敗後沒有可恢復路徑 | 緊接著 |
| P2 | 低階裝置卡頓、清理不完整、日後難查 | 排進一般維護 |
| P3 | 體積與觀測的改進，現況可接受 | 有空再做 |

## 不在本次範圍

不改程式、不改既有文件、不改 `.github/workflows`、不改憑證與 git remote。建議修法都還沒套用。
