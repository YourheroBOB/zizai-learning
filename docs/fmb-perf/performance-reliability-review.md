# zizai-learning 效能與可靠性審查報告

## 1. 審查範圍與方法

本報告以目前提供的預設分支內容為基準，進行靜態審查，範圍包含：

- `index.html` 與 `src/*.css`、`src/app.js`、`src/readings.js`、`src/zhuyin.js`
- `tools/bundle.py`
- `tools/make_sample_pdfs.mjs`
- `tools/build_datasets.py` 與資料重建流程
- `tests/test_zizai.js` 所代表的邏輯與資料驗證範圍

本次未連線任何正式服務、未操作瀏覽器正式資料，也未修改既有程式碼。下列「已確認」項目可由提供的原始碼直接確認；「待量測」項目則已附上可重現的量測與驗證方法，避免在沒有執行環境時把推測當成結論。

## 2. 摘要結論

目前架構已有幾項良好基礎：

- 一般網頁版按年級載入 JSON，而非一開始載入全部年級。
- 單檔離線版會移除外部字型與資料 `fetch`，可避免離線時失效。
- 讀音回報已有 10 秒逾時、白名單與失敗降級設計。
- 讀音覆寫的 `localStorage` 存取已有例外處理。
- `prefers-reduced-motion` 已降低動效對使用者的影響。

最需要優先改善的問題如下：

1. **P1：外部 Google Fonts 是網頁版最大的第三方效能與可靠性變數。**
2. **P1：每個注音字格都建立一組 SVG 節點，數百張字卡會放大 DOM、記憶體與繪製成本。**
3. **P1：年級資料載入需具備逾時、請求取消、同請求去重與「只提交最新回應」機制。**
4. **P1：考卷生成需防止快速連點造成並行生成，以及學生卷與答案卷使用不同快照。**
5. **P1：讀音回報的 10 秒逾時應真正中止底層請求；自動重試則必須先有冪等性契約。**
6. **P1：`tools/make_sample_pdfs.mjs` 的 CDP 命令沒有完整逾時與關閉處理，失敗時可能留下 Chrome、HTTP server 或暫存 profile。**
7. **P2：應建立隱私安全的結構化觀測、效能標記、錯誤復原與本機診斷能力。**
8. **P2：資料產生器與打包器應採「全部驗證成功後才替換正式輸出」的交易式寫入。**

目前沒有確認到需要立即停用功能的 P0 事件；但上述 P1 項目若在低階手機、低速網路或建置工具失敗時發生，會直接影響可用性或產生不一致考卷。

## 3. 優先級定義

| 優先級 | 定義 | 建議時程 |
|---|---|---|
| P1 | 可能造成錯誤資料顯示、資源未釋放、明顯卡頓或使用者流程失敗 | 下一個修正批次優先處理 |
| P2 | 會提高故障機率、維護成本或問題定位時間 | P1 完成後處理 |
| P3 | 最佳化或建置效率改善，對目前功能影響有限 | 有容量需求時再處理 |

## 4. 詳細審查項目

### FMB-PERF-001：移除網頁版對 Google Fonts 的同步依賴

- **位置**
  - `index.html` `<head>` 的 Google Fonts `preconnect` 與 stylesheet link。
  - `src/tokens.css` 的 `--tp-font-serif`、`--tp-font-sans`、`--tp-font-kai`。
  - `tools/bundle.py` 移除三行外部字型 link 的打包流程。
- **影響**
  - 字型 CSS 位於 render-blocking 資源，DNS、TLS 或來源服務變慢時會延後首次繪製。
  - 中文字型常以多個 Unicode range 檔案供瀏覽器按需下載，實際請求數與傳輸量可能高於預期。
  - 單檔版與網頁版使用不同字型載入策略，會造成外觀與效能基準不一致。
  - 正式來源不可用時雖有系統字型備援，但頁面仍可能等待外部 CSS；這也增加第三方可用性依賴。
- **建議修法**
  1. 預設移除外部字型 request，改用 `src/tokens.css` 現有系統字型 fallback。
  2. 若 BOB 要求保留目前外觀，另行準備授權允許、僅含教材所需字元的 WOFF2 子集合，置於 repo 內；只預載主要字型，其他字型使用 `font-display: swap` 或 `optional`。
  3. 修改 `tools/bundle.py` 的斷言，讓「網頁版與單檔版均無第三方字型請求」成為可驗證條件。
  4. 不以 `media="print"`、延遲載入（defer）script 或未受控的 user-agent 判斷取代正式設計，避免 FOUT、閱讀器無障礙與版面跳動問題。
- **驗證方式**
  - 在本機 `127.0.0.1` HTTP server，以無頭 Chrome 擷取 Network log；切換所有年級後，確認沒有字型 CDN request。
  - 以 320、375、768、1440 px 視窗檢查中文字 fallback 無缺字，且 CLS 不高於目前基準。
  - 比較修改前後的 LCP、字型傳輸量、request 數與首次可互動時間。
  - 執行打包並確認 `dist` 產物仍無外部字型參照。
- **優先級**：P1

### FMB-PERF-002：移除每個注音字格建立的 SVG 網格

- **位置**
  - `src/zhuyin.js` 的 `makeGrid()`：每次呼叫均建立 `svg`、`g` 與四條 `line`。
  - `src/zhuyin.js` 的 `cell()`：每個字格都呼叫 `makeGrid()`。
  - `src/zhuyin.css` 的 `.tpz-cell__grid`。
- **影響**
  - 一個字格至少增加數個 DOM 節點；數百張字卡，再加上考卷的學生卷與答案卷，會同時放大 HTML parser、記憶體、style recalculation 與 paint 成本。
  - SVG 線條可向量化，但大量獨立 SVG 仍會增加渲染樹與 GPU 相關工作。
  - 低階手機上，載入高年級資料時最容易出現長任務與切換卡頓。
- **建議修法**
  1. 首選以 `.tpz-cell::before`／`::after` 搭配 CSS gradient 畫出中線、橫線與斜線，完全移除每格 SVG。
  2. 若斜線外觀不可退讓，改為頁面只放一個隱藏的 `<symbol>`，各格使用 `<use>`；不得繼續為每格建立完整路徑樹。
  3. 對進度頁字卡使用 `contain: layout paint style`；評估 `content-visibility: auto` 與 `contain-intrinsic-size`，但列印卷與答卷不套用。
  4. 保持列印、螢幕閱讀器與 `aria-hidden` 行為一致。
- **驗證方式**
  - 以最重組合（六年級、全年級字卡、12 題考卷）記錄 `document.getElementsByTagName('*').length`、記憶體與 Performance trace。
  - 650 張字卡情境建議降至不超過 4,000 個 DOM 節點；實際門檻應在基準測試後固定。
  - 連續切換年級 20 次，確認 DOM 節點數不會持續上升，長任務不得比基準增加。
  - 視覺比對田字格中線、橫線與斜線，另檢查列印輸出沒有缺線。
- **優先級**：P1

### FMB-PERF-003：為年級資料載入建立逾時、取消、去重與最新請求保護

- **位置**
  - `src/app.js` 的 `GRADE_DATA_FILES`、`loadGradeData()`、`switchGrade()` 與初始化流程。
  - `index.html` 的 `#grade-select` 變更事件。
  - `tools/bundle.py` 對 `loadGradeData()` 與初始化區塊的整段替換。
- **影響**
  - 已完成資料的快取不能解決「同一 grade 正在載入時又被請求」或「舊請求較晚回應」問題。
  - 若 A 級資料較慢、B 級資料較快，慢速 A 回應可能覆蓋較新的 B 級畫面，形成跨年級資料錯配。
  - 網路半斷線或 server 未回應時，`fetch()` 可能長時間 pending，使用者看到的是舊畫面、半套畫面或沒有明確錯誤狀態。
  - 打包版若只替換函式本體而漏掉新加入的逾時／取消邏輯，網頁版與單檔版行為會不同。
- **建議修法**
  1. 建立單一資料請求協調器，至少保存 `latestRequestId`、`AbortController` 與 `Map<grade, Promise>`。
  2. 每次未命中快取的載入使用 `AbortController`；一般靜態 JSON 建議 8 秒總 deadline，到期以明確錯誤中止。
  3. 同一 grade 的並行請求共用同一個 in-flight Promise；切換到其他 grade 時中止已不再需要的請求。
  4. 回應完成後只有在 `requestId === latestRequestId` 時才可提交到 UI state；舊回應只可安全進快取，不得更新畫面。
  5. 檢查 `response.ok`，並將 HTTP 錯誤、JSON 解析錯誤、逾時與中止分成不同錯誤類型。
  6. 失敗時保留最後一次成功畫面，於資料區顯示可重試狀態；不要以全域 `alert` 作為一般載入失敗處理。
  7. 將逾時、取消與競態保護納入同一份共用模組，使 `tools/bundle.py` 不再以易碎的大段文字替換核心流程。
- **驗證方式**
  - 使用可控的假 `fetch`：先發 A、再發 B，讓 A 最後完成；斷言畫面仍顯示 B，且 A 不得覆蓋 state 或 UI。
  - 同一 grade 快速觸發 10 次，斷言 network call 只有 1 次或至少有可證明的 in-flight 共用。
  - 讓請求永不回應，確認 8 秒內中止、UI 顯示可重試訊息，且 AbortController 確實收到 abort。
  - 模擬 404、500、無效 JSON、連線中斷與使用者快速切換。
  - 對原始碼版與打包版執行同一組行為測試。
- **優先級**：P1

### FMB-PERF-004：避免字卡、篩選與精熟狀態更新時重建整個 DOM

- **位置**
  - `src/app.js` 對 `#char-grid` 的渲染路徑。
  - `index.html` 的 `#char-grid` 與精熟／未熟篩選按鈕。
  - 與 `localStorage` 進度儲存有關的更新流程。
- **影響**
  - 若每次星號、精熟或篩選操作都重新建立全部字卡，會造成不必要的 layout、paint、事件監聽重建與焦點遺失。
  - 同步 `localStorage` 寫入若和畫面更新綁在一起，會把主執行緒的 I/O 延遲直接反映到點擊反應。
  - 低階裝置上即使資料量不大，連續操作仍可能累積長任務。
- **建議修法**
  1. 以 `char-grid` 作為事件委派根節點，只在初始化時綁定一次 click handler；不要替每張重新產生的卡片個別綁定 listener。
  2. 建立字元到 DOM 節點的索引；切換精熟狀態時只更新該卡的 class、`aria-pressed` 與必要文字。
  3. 篩選優先以 class 或 `hidden` 顯示既有節點；需要重新排序時才使用 `DocumentFragment` 一次重建。
  4. 統計數字採增量更新，不因單一卡片變化重新計算整份課程。
  5. 進度儲存與畫面更新分離；短期可合併短時間內的多次寫入，並在 `pagehide` 時立即 flush，避免遺失最後狀態。
- **驗證方式**
  - 以 `MutationObserver` 記錄單次星號切換的 DOM 變更量；目標是只變更目標卡片與對應統計，不重建整個 grid。
  - 連續點擊 100 次，確認 DOM 節點數不增加、事件 listener 不累積、目前焦點不遺失。
  - 在基準機執行互動 trace，p95 點擊處理時間目標不超過 50 ms，且不得出現超過 100 ms 的單次長任務。
  - 重新整理後核對精熟、未熟與目前進度仍一致。
- **優先級**：P2

### FMB-PERF-005：將考卷生成改為單一、不可分割的產生快照

- **位置**
  - `src/app.js` 中綁定 `#btn-generate-ws`、`#btn-print-ws` 的事件流程。
  - 考卷學生卷與答案卷的 DOM 產生路徑。
  - README 已記載「每次開新分頁會重新出題」的現況。
- **影響**
  - 快速連點可能啟動多個並行出題流程，較早的流程較晚完成後反而覆蓋新結果。
  - 若學生卷與答案卷分別取樣或分屬不同生成階段，可能出現題目不一致。
  - 重複開新分頁會增加 Chrome 分頁與 renderer 的記憶體；列印前若舊 generation 尚未完成，也可能印到過期內容。
- **建議修法**
  1. 每次生成建立 `worksheetRunId` 與不可變的 `worksheetSnapshot`；學生卷、答案卷及卷號全部由同一份 snapshot 衍生。
  2. 產生期間以 mutex 或 `generationInFlight` 防止並行；停用兩個按鈕並設定 `aria-busy="true"`，完成或失敗後恢復。
  3. 舊 generation 完成時，只有 ID 仍為最新者可以提交 DOM。
  4. 優先直接列印既有預覽；若流程必須開新分頁，使用固定且可重用的 window 名稱、傳入同一份 snapshot，並在結束或取代時關閉舊分頁。
  5. 若使用 Blob URL，列印完成或取消後必須呼叫 `URL.revokeObjectURL()`。
  6. 列印前等待排版與字型就緒，但等待不得無限阻塞；建議最多 2 秒後仍允許列印。
- **驗證方式**
  - 連續點擊「重新出題」20 次，確認任一時刻只有一個 generation，且最終學生卷與答案卷題目完全對應。
  - 人為延遲第一次 generation，確認較晚完成時仍只保留最新 generation。
  - 監看分頁數量，確認反覆列印不會無限增加分頁。
  - 印出 20 份測試卷並逐題比對學生卷與答案卷，不允許題號或答案錯位。
- **優先級**：P1

### FMB-PERF-006：完善讀音回報的底層中止、冪等與有限重試

- **位置**
  - `src/readings.js` 的 `REPORT_PATH`、`sendReport()` 與 `fetchImpl` 呼叫。
  - 詳情彈窗及進度頁的回報按鈕事件。
- **影響**
  - 既有 10 秒逾時是良好基礎，但若只以 Promise 競速而未 abort，底層網路連線與計時器可能仍持續存在。
  - 使用者連點可能送出多筆相同回報，造成後端重複資料。
  - 若未來直接加入自動重試，而 API 沒有冪等性保障，逾時後重試可能產生重複回報。
  - 不同失敗原因目前若只顯示同一訊息，維護者無法判斷是 4xx、429、5xx、離線或逾時。
- **建議修法**
  1. 每次回報使用 `AbortController`，10 秒 deadline 到期時直接中止 request，並清除 timeout。
  2. 以 `reportInFlight` 或按鈕 disabled 防止同一操作重複送出。
  3. 先將失敗分類為：永久拒絕、速率限制、暫時服務錯誤、網路錯誤、逾時與使用者取消；使用者訊息可共用，但內部診斷需保留類別。
  4. 在後端契約確認前，不對可能已被伺服器接收的 POST 自動重試。
  5. 若後端支援 `Idempotency-Key` 或可接受的去重欄位，應為同一操作在所有 retry 共用同一個隨機 request ID，再允許最多一次暫時錯誤重試。
  6. 僅對網路錯誤、408、429、500、502、503、504 考慮重試；不得重試 400、403、404、413 等永久錯誤。
  7. 重試必須尊重 `Retry-After`、加入 jitter，且所有嘗試共用原本 10 秒總 deadline，不可每次重新給 10 秒。
- **驗證方式**
  - 以假 fetch 模擬永不回應、AbortError、429、500、502、400、403、404、413 與網路斷線。
  - 確認逾時後底層 signal 已 aborted，且沒有殘留 timer 或 pending request。
  - 快速連點只產生一次送出。
  - 若完成冪等性整合，重試時 request ID 必須相同；不同按下則 ID 必須不同。
  - 確認任何 log、錯誤物件與診斷輸出都不包含回報 payload、備註文字或瀏覽器儲存內容。
- **優先級**：P1

### FMB-PERF-007：集中管理 localStorage 的容量、跨分頁一致性與寫入延遲

- **位置**
  - `src/readings.js` 已存在的讀音覆寫儲存處理。
  - `src/app.js` 的學習進度、精熟與未熟狀態儲存。
- **影響**
  - `localStorage` 為同步 API；大量讀寫或 JSON 序列化會阻塞主執行緒。
  - localStorage 不可用、容量滿或內容遭其他程式破壞時，若不同功能各自處理，行為可能不一致。
  - 多個分頁同時操作時，後寫入的舊快照可能覆蓋另一分頁的新進度。
  - `file://`、隱私模式與不同瀏覽器對 localStorage 的行為並不完全一致。
- **建議修法**
  1. 建立單一 storage adapter，統一提供 `get`、`set`、`remove`、版本號與 schema 驗證。
  2. 讀取失敗或內容損壞時回傳安全預設值，不讓整頁初始化中斷；寫入失敗時保留記憶體狀態並顯示可理解的提示。
  3. 將不同功能放入明確的 key，避免一個大型 JSON key 互相覆寫；每筆資料附版本或 revision。
  4. 使用 `storage` event 同步其他分頁變更；更新前比較 revision，避免回寫造成回圈。
  5. 對高頻變更合併寫入，例如 250 ms 內合併，並在 `pagehide` 立即保存最後狀態。
  6. 讀音覆寫、進度與精熟狀態是否能在多分頁合併，應由資料結構決定，不以「最後寫入者勝」概括處理。
- **驗證方式**
  - 模擬 `getItem`、`setItem`、`removeItem` 分別拋錯，以及 quota exceeded。
  - 注入損壞 JSON、舊 schema、欄位型別錯誤與部分資料。
  - 開兩個本機分頁同時更新，確認不會無聲遺失另一分頁的新資料。
  - 量測 100 次快速操作的主執行緒時間，確認同步儲存不再直接發生於每次點擊的關鍵路徑。
- **優先級**：P2

### FMB-PERF-008：建立可恢復的載入失敗與離線狀態

- **位置**
  - `src/app.js` 的資料載入、初始化與年級切換錯誤路徑。
  - `src/readings.js` 的回報失敗降級路徑。
  - `tools/bundle.py` 產生的內嵌資料初始化失敗處理。
- **影響**
  - 一般 `alert` 或空白畫面無法告訴使用者是暫時網路問題、資料損壞還是內嵌資料缺失。
  - 若載入失敗後清空舊畫面，使用者會失去目前可繼續使用的課程內容。
  - 網頁版在離線時若沒有快取，資料檔無法載入；單檔版則不受影響，兩者需有清楚差異。
- **建議修法**
  1. 在資料區建立具 `role="status"` 的載入／錯誤狀態區，顯示可理解但不洩漏內部路徑的錯誤類型與重試按鈕。
  2. 年級載入失敗時保留最後一次成功資料與畫面；只有在使用者明確切換且新資料完全載入後才替換。
  3. 重試採有限次數與退避，不在背景無限輪詢。
  4. 對曾成功載入的資料可評估使用 Cache Storage 或 IndexedDB 保存 last-known-good，但不得無聲顯示過期資料；應標示離線／舊快取狀態。
  5. 在決定部署 Service Worker 前，先以明確離線訊息與單檔版導覽處理，不新增未核准的背景同步。
  6. 打包版若缺少內嵌資料屬建置錯誤，顯示固定診斷碼即可，不要求無效的重新整理迴圈。
- **驗證方式**
  - 本機測試 server 分別回傳 404、500、無效 JSON、逾時與立即關閉連線。
  - 切換到失敗年級後，確認舊畫面仍在、錯誤可見、重試按鈕有效。
  - 切回已成功載入的年級，確認使用記憶體快取時不發出多餘 network request。
  - 以瀏覽器離線模式確認網頁版與單檔版都有明確且不同的處理。
- **優先級**：P2

### FMB-PERF-009：建立隱私安全的結構化日誌與全域錯誤處理

- **位置**
  - `src/app.js`、`src/readings.js` 現有分散的 console 與 UI 錯誤處理。
  - `tools/bundle.py` 產生程式中的 `console.warn`、`console.error` 與 `alert`。
- **影響**
  - 目前缺少一致的 event name、耗時、結果與錯誤分類，難以判斷問題集中在網路、資料解析、渲染、儲存或列印。
  - 只靠 `console.error` 無法在一般使用者環境主動蒐集診斷；若未來直接加入遠端 telemetry，又可能收集不必要資料。
  - 例外資訊若直接輸出完整物件，可能意外包含回報內容、備註或瀏覽器儲存內容。
- **建議修法**
  1. 建立共用 logger API，欄位固定為：`event`、`level`、`requestId`、`grade`、`publisher`、`durationMs`、`outcome`、`errorClass`、`schemaVersion`。
  2. 禁止記錄：回報 payload、讀音備註、localStorage 內容、完整 URL query、姓名或任何使用者輸入。
  3. 生產環境預設只輸出 sanitized console warning/error；詳細診斷由本機 `?debug=1` 或明確的診斷匯出功能開啟。
  4. 若需要本機診斷記憶體緩衝，限制為最近 100 筆，提供手動匯出，且匯出前再次過濾。
  5. 註冊 `window.error` 與 `unhandledrejection`，但避免同一錯誤同時被全域 handler 與呼叫端重複記錄。
  6. 在 `tools/bundle.py` 產生的初始化失敗中改用固定錯誤碼，例如資料缺失代碼，不將完整例外物件直接顯示給使用者。
  7. 遠端 telemetry 維持停用；只有 BOB 確認用途、隱私政策、保存期限與最小化欄位後才另行設計。
- **驗證方式**
  - 以單元測試確認 logger 只輸出允許欄位，並會移除常見敏感 key。
  - 觸發資料載入、儲存、回報、渲染與全域例外，確認每種錯誤只有一筆事件且分類正確。
  - 搜尋產出的診斷檔，確認不包含回報訊息、備註、localStorage dump 或完整 URL。
  - 確認一般使用流程不會因 logger 本身失敗而中斷。
- **優先級**：P2

### FMB-PERF-010：建立可重複的效能預算與基準測試

- **位置**
  - `tests/test_zizai.js` 現有邏輯與資料測試。
  - `src/app.js` 的年級切換、字卡渲染、考卷生成與列印流程。
  - 建議新增但本次未建立的 `tests/perf_smoke.mjs` 或同等本機測試工具。
- **影響**
  - 現有測試主要保護邏輯與資料正確性，沒有固定 DOM 數量、長任務、記憶體成長、請求數或逾時上限。
  - 未建立基準時，SVG 渲染、字型或完整重繪等改動可能在測試全數通過時仍造成明顯退化。
- **建議修法**
  1. 在程式中加入 `performance.mark`／`performance.measure`，至少量測資料載入、年級 render、考卷生成與回報送出。
  2. 建立只用本機 `127.0.0.1` 與暫存目錄的 headless Chrome smoke test；不得連線正式服務。
  3. 使用固定資料 fixture 與固定視窗尺寸，執行至少 10 次取中位數與 p95。
  4. 將下列數值先視為暫定預算，最終由 BOB 確認基準裝置：
     - 第三方字型 request：0。
     - 首次載入某年級：最多 1 個 GET；已載入快取：0 個 GET。
     - 650 張字卡 DOM 節點：不超過 4,000。
     - 年級切換基準機 p95 render：不超過 100 ms。
     - 連續切換 20 次後 heap 增量：不超過 20 MB，且無單調增長。
     - 一般互動不得出現超過 100 ms 的長任務。
     - 未預期的 console error：0。
  5. 基準測試必須使用暫存輸出，不覆寫 repo 內正式產物。
- **驗證方式**
  - 在基準機與一台低階 Android 裝置各執行一次。
  - 將結果輸出為不含使用者資料的 JSON 摘要，保存 node count、request count、duration 與 memory delta。
  - 每次修改 FMB-PERF-001 至 006 時比較前後結果；超標即阻擋合併。
- **優先級**：P2

### FMB-PERF-011：為 PDF 工具的 CDP 呼叫與清理流程設定完整 deadline

- **位置**
  - `tools/make_sample_pdfs.mjs` 的 `connect()`、`send()` 與 `pending` Map。
  - `Page.navigate`、`document.fonts.ready`、`Page.printToPDF` 等等待點。
  - `cleanup()` 中的 `await cdp.send('Browser.close')`。
- **影響**
  - WebSocket 關閉時，pending Map 內的命令沒有被 reject，呼叫端可能永久等待。
  - `Browser.close`、`Page.navigate` 與 `Page.printToPDF` 都可能無限等待；`cleanup()` 會在強制結束 Chrome 之前卡住。
  - 後續的 process group 終止、HTTP server 關閉與暫存 profile 移除可能完全無法執行。
  - 這是本審查中最明確的資源洩漏風險。
- **建議修法**
  1. 建立共用 `withTimeout(promise, ms, label)`；CDP 一般命令使用 10 秒，`printToPDF` 使用 30 秒。
  2. WebSocket `close` 與 `error` 時，以明確錯誤 reject 所有 pending command，並清空 Map。
  3. 初次 WebSocket 連線也需 deadline，不只等待 Chrome stderr 輸出。
  4. `cleanup()` 不得無條件等待 `Browser.close`；應以短 deadline 競速，逾時後強制終止自己建立的 process group。
  5. 清理流程使用巢狀 `try/finally`，確保 server、Chrome 與 profile 各自都有獨立 finally；清除暫存 profile 的錯誤不得覆蓋原始錯誤。
  6. `server.close()` 應等待完成，必要時在短暫 grace period 後關閉 keep-alive connection。
  7. 保留原始失敗碼與 stderr 摘要，但不要記錄瀏覽器儲存內容。
- **驗證方式**
  - 以本機假 CDP server 模擬命令永不回應，確認每個命令在 deadline 後 reject。
  - 在命令進行中關閉 WebSocket，確認所有 pending Promise 都 reject，不會留下未處理 rejection。
  - 人為讓 Chrome 不回應 `Browser.close`，確認 5 秒內強制結束 Chrome、關閉 server 並移除暫存 profile。
  - 執行 20 次成功與 20 次強制失敗，確認沒有殘留本機 HTTP port 或 Chrome process。
- **優先級**：P1

### FMB-PERF-012：強化 PDF 工具的本機 server 路徑與程序清理

- **位置**
  - `tools/make_sample_pdfs.mjs` 的 `startServer()` 與 `decodeURIComponent` 路徑處理。
  - `file.startsWith(ROOT)` 路徑邊界判斷。
  - `readFileSync()`、`chrome.stderr` 緩衝與 `rmSync()` 清理。
- **影響**
  - 前綴比對可能把同名開頭的相鄰目錄誤認為 repo 子目錄。
  - 不合法的 percent-encoded URL 可能讓 `decodeURIComponent()` 拋錯，導致 request handler 中斷。
  - 同步讀檔會阻塞本機 server event loop；stderr 緩衝若不設上限，長時間執行會持續成長。
  - 暫存 profile 若仍被 Chrome 鎖定，清理錯誤可能覆蓋真正的主錯誤。
- **建議修法**
  1. 使用 `path.relative(ROOT, file)` 判斷是否仍在 ROOT 內；拒絕 absolute path 與以 `..` 開頭的 relative path。
  2. 對 URL decode 與 path resolution 使用 try/catch，錯誤時回傳 400，不讓 server callback 拋到程序頂層。
  3. 保留 `127.0.0.1` 限制，不對外監聽。
  4. 小型本機資產可改用非同步讀取；至少不得在每次 request 讀取不必要的大型檔案。
  5. stderr 只保留最後固定數量的字元，例如 64 KiB。
  6. profile 清理失敗時記錄清理錯誤，但保留原始主錯誤；清理應可重試一次。
- **驗證方式**
  - 以暫存測試根目錄測試 `..`、同名前綴、encoded slash、malformed percent encoding 與符號連結。
  - 確認所有非允許路徑均回 404／400，且沒有讀取 repo 外檔案。
  - 產生大量 stderr 測試資料，確認記憶體中的緩衝維持上限。
  - 在 Windows、macOS 與 Linux 至少各驗證一次程序與 profile 清理。
- **優先級**：P2

### FMB-PERF-013：讓資料產生器採用交易式輸出，避免半套資料

- **位置**
  - `tools/build_datasets.py` 目前在各階段直接覆寫 `data/curriculum-115-1.json`、`data/curriculum-110.json` 與 `data/curriculum-demo.json`。
  - `tools/build_grades_from_sources.py` 的資料產生輸出階段應套用同一原則。
- **影響**
  - 第一個檔寫入成功、後續解析或寫入失敗時，repo 會同時包含新舊兩套資料。
  - 測試或後續打包可能誤用半更新資料，且不易判斷是哪一階段失敗。
  - 直接覆寫也沒有辦法驗證「新檔可讀、schema 正確且所有檔屬於同一 build」。
- **建議修法**
  1. 所有新檔先寫入同一 build 的暫存目錄；暫存目錄應由 `tempfile` 建立並在失敗時清除。
  2. 完成全部 JSON 解析、schema、來源與必要跨檔檢查後，才以 `os.replace()` 逐檔替換正式檔。
  3. 每次 build 產生非敏感的 build manifest，包含檔案 hash、來源版本與時間；manifest 只記技術資訊，不含來源內文。
  4. 打包前再驗證所有資料檔 hash 屬於同一 build。
  5. 測試時只使用暫存 fixture，不覆寫 repo 正式資料。
- **驗證方式**
  - 在中途注入錯誤，確認正式資料檔 hash 全部維持不變，暫存目錄被清除。
  - 成功 build 後確認所有 JSON 可解析、schema 驗證通過，且舊 build 與新 build 可清楚區分。
  - 模擬檔案系統 rename 失敗，確認不會留下部分替換後難以判讀的狀態。
- **優先級**：P2

### FMB-PERF-014：降低打包器對核心程式文字位置的脆弱耦合

- **位置**
  - `tools/bundle.py` 以 `cut()` 搜尋 `loadGradeData()`、初始化區塊等固定起訖字串並整段替換。
- **影響**
  - FMB-PERF-003 的請求協調器若在重構時位置或名稱改變，打包流程可能失敗；即使成功，也可能漏掉逾時、取消或錯誤復原邏輯。
  - 原始碼版與單檔版可能產生不同行為，而一般資料測試未必能偵測。
  - 打包器目前會用文字斷言避免靜默漏替換，這是安全優點，但維護成本仍高。
- **建議修法**
  1. 在 `src/app.js` 使用穩定且明確的單行 marker，例如專用 begin/end 註解；打包器只替換 marker 內內容。
  2. 將「資料來源抽象」保留在前端共用程式碼中：原始版注入 fetch adapter，單檔版注入 embedded adapter；逾時、競態、錯誤處理不得放在被整段替換的區域。
  3. 打包後執行 parity 測試，至少覆蓋載入成功、逾時、舊回應不覆蓋新回應、錯誤重試與快取命中。
  4. 保持現有「恰好命中一次」斷言，但改成 marker 驗證與內容雜湊。
- **驗證方式**
  - 故意移動 `loadGradeData()` 在檔案中的位置，確認打包結果不受非語意位置變動影響。
  - 對原始版與單檔版執行同一組 request coordinator 測試。
  - 確認打包後仍只有預期的一處回報網路呼叫，且逾時與 abort 邏輯存在。
- **優先級**：P1

### FMB-PERF-015：控制單檔版大小、解析成本與重複輸出

- **位置**
  - `tools/bundle.py` 將六份 115-1 資料、110 資料與 demo 資料全部嵌入 HTML。
  - `tools/bundle.py` 最後分別寫出 `dist/index.html` 與 `dist/zi-zai.html` 兩份相同內容。
- **影響**
  - 單檔版必須保留全部離線資料，因此 HTML parser 與 JS 初始化記憶體成本高於按需載入的網頁版。
  - 兩份完整檔案增加建置磁碟 I/O 與 artifact 儲存量；若第二個寫入失敗，還可能留下內容不一致的兩個正式檔。
  - 未量測前直接 minify 會增加 debug、審查與回歸風險。
- **建議修法**
  1. 先量測原始、gzip、Brotli 後大小、瀏覽器 parse time 與 heap，再決定是否優化。
  2. 保留離線版「所有資料內嵌」的必要性，不以破壞 `file://` 體驗換取較小檔案。
  3. 產生單一 canonical 內容後再複製為第二個必要檔名；兩份內容以 hash 驗證一致。
  4. 寫入使用同目錄暫存檔、flush／fsync，再以 rename 替換；任一步失敗時保留上一份完整產物。
  5. 若部署端支援，啟用 Brotli；不要把壓縮後 binary artifact 當成唯一原始碼。
  6. 設定產物大小預算，例如不得比目前基準增加 20%，超標時需記錄原因；絕對值由 BOB 依實際部署頻寬確認。
- **驗證方式**
  - 連續打包兩次，確認內容 byte-for-byte 相同。
  - 在寫入第二個檔案前注入錯誤，確認舊的兩份正式產物仍完整且 hash 一致。
  - 記錄原始大小、gzip/Brotli 大小、首次可互動時間與初始 heap。
  - 以 `file://` 開啟單檔版，確認所有年級、110 與 demo 均可使用，且外部字型與資料網路請求為 0。
- **優先級**：P3

### FMB-PERF-016：降低 modal 模糊、裝飾背景與動畫造成的 paint 成本

- **位置**
  - `index.html` 的 `.tp-modal { backdrop-filter: blur(4px); }`。
  - `src/base.css` 的 body 雙重 radial gradient 與固定 `.tp-float-layer`。
  - `src/base.css` 的 `@keyframes tp-float`。
- **影響**
  - 全視窗 backdrop blur 在低階 GPU 上可能使開啟彈窗時出現掉幀。
  - 大面積固定漸層與動畫層增加 initial paint 與 compositing 工作；transform 動畫雖比 layout 動畫便宜，仍非零成本。
  - 這些效果對學習功能沒有必要性，卻可能影響共用裝置或低階手機。
- **建議修法**
  1. 在 coarse pointer 或低效能環境停用 backdrop blur，改以不透明度較高的半透明遮罩。
  2. 減少浮動字數量，或只讓背景中的少量元素動畫。
  3. 保留現有 `prefers-reduced-motion` 行為；不得以移除媒體查詢的方式增加動畫。
  4. 評估對離屏字卡使用 `content-visibility`，但不得套用到考卷與列印內容。
  5. 不使用 `overflow-x: hidden` 掩蓋 layout 問題；水平溢出仍應在 320 與 375 px 驗收中為 0。
- **驗證方式**
  - 在低階 Android 裝置錄製 modal 開啟與背景動畫的 frame trace。
  - 以 320、375、768、1440 px 確認水平溢出為 0，且 modal 可操作。
  - 比較修改前後 paint time、compositing time 與掉幀比例。
  - 列印預覽確認遮罩、blur 與浮動背景不影響紙張內容。
- **優先級**：P3

## 5. 建議實作順序

### 第一批：P1 正確性與資源釋放

1. FMB-PERF-003：資料請求協調器、逾時、取消與最新請求保護。
2. FMB-PERF-011／012：PDF 工具 deadline 與清理。
3. FMB-PERF-005：考卷單一 generation snapshot。
4. FMB-PERF-006：回報 abort、去重與有限重試契約。
5. FMB-PERF-014：打包器改用穩定 marker 與共用 request adapter。
6. FMB-PERF-001／002：移除外部字型依賴並降低字格 DOM。

### 第二批：P2 可觀測與可維護性

1. FMB-PERF-008：錯誤狀態與 last-known-good。
2. FMB-PERF-009：結構化 logger 與全域錯誤處理。
3. FMB-PERF-007：storage adapter 與跨分頁一致性。
4. FMB-PERF-010：效能預算與 smoke test。
5. FMB-PERF-004：局部 DOM 更新。
6. FMB-PERF-013：交易式資料輸出。

### 第三批：P3 容量與體感最佳化

1. FMB-PERF-015：單檔大小與產物一致性。
2. FMB-PERF-016：paint、blur 與裝飾動畫最佳化。

## 6. 整體驗收清單

完成第一批後，至少應通過以下本機驗證；所有暫存檔案使用 `tempfile`／`tmp_path`，不得讀寫 repo 外的正式資料，也不得連線正式服務：

- [ ] `node tests/test_zizai.js` 維持既有邏輯與資料測試結果。
- [ ] 原始碼版與打包版的資料載入、逾時、取消及競態行為一致。
- [ ] A→B 快速切換時，舊回應不得覆蓋新畫面。
- [ ] 同一 grade 的並行載入有明確去重。
- [ ] 連點考卷生成不會產生多份不一致結果。
- [ ] 回報總 deadline 不超過 10 秒，逾時後底層 request 已中止。
- [ ] 未建立後端冪等性契約前，不對已送出的 POST 自動重試。
- [ ] 網頁版沒有第三方字型 request。
- [ ] 650 張字卡 DOM 節點數達到暫定 4,000 上限。
- [ ] 連續切換 20 次後沒有 DOM、listener 或 heap 單調增長。
- [ ] PDF 工具在命令不回應、WebSocket 中斷與 Chrome 提前結束時都能在 deadline 內清理。
- [ ] 資料產生失敗時，正式資料檔 hash 維持不變。
- [ ] 打包失敗時，上一份 `dist/index.html` 與 `dist/zi-zai.html` 仍完整且一致。
- [ ] 一般流程的未預期 console error 為 0。
- [ ] 診斷輸出不包含回報內容、備註、localStorage dump 或完整 URL query。

## 7. 決策點

本次採最保守決策如下：

1. **不新增遠端 telemetry。** 先採本機 sanitized log 與手動診斷匯出；未取得 BOB 同意前，不把瀏覽器事件送往任何服務。
2. **未取得 API 冪等性契約前，不自動重試讀音回報。** 先完成 abort、單一 in-flight 與錯誤分類。
3. **預設移除第三方字型 request。** 若 BOB 要求保留目前外觀，再做授權與字元子集合評估。
4. **不新增 Service Worker。** 先以明確離線狀態、快取與單檔版入口處理；Service Worker 涉及部署更新策略，需另行核准。
5. **效能數值先採暫定預算。** 基準機、量測分位數與允許誤差由 BOB 確認後，再正式納入阻擋式驗收。
6. **本次僅交付審查報告。** 未修改 runtime、測試、打包器或資料檔，也未執行任何正式服務操作。
