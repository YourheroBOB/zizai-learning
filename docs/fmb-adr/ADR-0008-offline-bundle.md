# ADR-0008：單檔離線版由打包腳本產生，替換點逐一斷言

- 狀態：已採行
- 相關檔案：`tools/bundle.py`、`index.html`、`src/*.css`、`src/*.js`、`dist/`（產出）

## 背景

家長需要「雙擊就能開」的版本，但 `file://` 開啟時瀏覽器不允許 `fetch` 本機 JSON，且離線環境沒有網路載入 Google Fonts。
同時，離線版必須能被證明「不會偷偷連網」。

## 決策

1. `tools/bundle.py` 把 CSS、JS 全部內聯，並把一到六年級 115-1（6 檔）＋110 學年度＋體驗版資料以 `window.__EMBEDDED_*__` 內嵌。
2. 移除三行 Google Fonts（兩個 preconnect 與一個 stylesheet），字型改走 `tokens.css` 的系統備援。
3. 把 `app.js` 的資料載入改成只讀內嵌資料（移除三處 `fetch`），並在移除後斷言 `app.js` 不得再出現 `fetch(`。
4. **每一個字串替換都要求恰好命中一次**，命中 0 次或多次即失敗結束；CSS 連結順序（tokens → base → components → zhuyin → print）與 script 順序（zhuyin → readings → app）都釘死。
5. 產出 `dist/index.html` 與 `dist/zi-zai.html`（內容相同），並在結尾檢查不得殘留外部 `link` / `script` / `@import` / `src/` 相對參照。
6. 網路面由同一支腳本把關（見 ADR-0006）。

## 取捨

**換到**

- 離線版與網頁版共享同一份原始碼，不會出現「兩套邏輯」。
- 打包失敗會立即且明確地指出哪個替換點走鐘，不會靜默產出壞檔。
- 「不連網」與「只有一處回報請求」可被機械證明。

**付出**

- 打包腳本與 `index.html` / `app.js` 的**字面內容高度耦合**：改 HTML 結構、改 `loadGradeData` 段落、加一處 fetch，都會讓打包失敗。
- 需要維護兩套載入路徑（fetch 版與內嵌版）的行為一致性。

## 後果

- 調整 `index.html` 的 `<link>` / `<script>` 標籤，或改動 `app.js` 的資料載入與初始化段落時，**必須同步更新 `tools/bundle.py`**，並重跑打包確認成功。
- 不要用「找不到就跳過」的寬鬆寫法修改打包腳本；斷言的存在就是它的價值。
- 新增 `src/*.js` 要同時改 `index.html` 與打包腳本的清單與順序；否則打包直接失敗（這是刻意的）。
- 打包產物是產出物，不是手改對象；要改樣式請改 `src/` 後重新打包。
- 打包後的外觀（字型）與網頁版不同是預期行為，範例 PDF 需重跑 `tools/make_sample_pdfs.mjs` 才會與新版一致。
