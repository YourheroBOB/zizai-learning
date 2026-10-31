# fmb_feature／讀音修改「匯入＋合併」模組

## 做了什麼

README 的功能清單已有「修改讀音」與「匯出」，但缺「匯入」：老師收到多位學生／多台裝置的匯出 JSON 後，沒有工具可以安全地併回一份。本資料夾補上這段的**純邏輯**（驗證、正規化、合併、序列化），不動任何既有檔案。

## 檔案

| 檔案 | 說明 |
|---|---|
| `reading-overrides-io.js` | 純邏輯模組（無 DOM、無網路、無 I/O；瀏覽器掛 `window.ZZReadingOverridesIO`，Node 用 `require`） |
| `test_reading_overrides_io.js` | 單元測試（零依賴，只用 Node 內建模組） |

## 執行測試

```
node fmb_feature/test_reading_overrides_io.js
```

## API 摘要

- `normalizeBopomofo(input)` → `{ok, value, code, message}`：單一音節驗證與正規化（輕聲後置→前置、第一聲符號去除、聲母＋介音＋韻母順序檢查、上限三符號）。
- `validateEntry(char, raw)` → 驗證一筆「字→讀音」（字必須是單一國字；值可為字串或 `{bopomofo, note, ts}`，note 去控制字元並截 100 字）。
- `parseImport(text)` → 解析匯出的 JSON（物件或陣列皆可），略過 `version`／`app` 等說明欄位，回傳驗證過的 `entries` 與錯誤明細（上限 50 筆）；大小上限 512KB、筆數上限 5000；危險鍵名（`__proto__` 等）一律拒絕。
- `mergeOverrides(current, incoming, {conflict})` → 合併；`conflict` 可為 `'keep'`（預設，以現有為準）、`'incoming'`（匯入為準）、`'newer'`（比 `ts`），回傳 `merged` 與 `added/updated/kept/same/invalid/conflicts` 統計。
- `serializeOverrides(obj)` → 鍵排序的 JSON 文字（結尾換行），可直接存檔再匯入。

## 建議的整合方式（需要 BOB 決定，本輪未動原始碼）

在 `src/readings.js`（或 `src/app.js` 的匯出列旁）加一顆「匯入修改」按鈕，大致：

1. `<input type="file" accept="application/json,.json">` → `FileReader.readAsText`。
2. `const p = ZZReadingOverridesIO.parseImport(text);` 失敗就把 `p.message` 與 `p.errors` 前幾筆顯示給使用者。
3. `const now = ZZReadingOverridesIO.mergeOverrides(currentOverrides, p.entries, { conflict: 'newer' });`
4. 把 `now.merged` 寫回 localStorage 鍵 `zizai:readingOverrides:v1`（複用 readings.js 既有 try/catch 儲存與降級提示），並用 `summarize` 統計（`added/updated/kept/same`）回報結果，再觸發既有重繪。
5. 注意：本模組刻意不碰 `localStorage` 與 DOM，接線全在既有程式內做；`tools/bundle.py` 對內聯 JS 有「唯一 fetch」等釘死檢查，本模組零網路呼叫，不會影響打包。

## 授權注意

本資料夾只含程式與測試，沒有收錄任何資料檔；測試中的注音與國字都是自造範例，非教材內容。
