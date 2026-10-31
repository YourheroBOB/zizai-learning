# zizai-learning 資安與可靠性稽核

## 範圍與限制

本報告依任務提供的檔案清單及可見原始碼進行靜態檢視，未連線到任何網路服務。未提供完整內容的檔案（包括 `src/app.js`、`src/readings.js`、`tools/build_grades_from_sources.py`、`tests/test_zizai.js` 與部分 HTML）無法逐行核實，因此不對其輸入處理、DOM 輸出、資料儲存與回報流程作安全背書。下列位置以提供內容中的行號為準。

未在可見原始碼中發現硬編碼憑證；此結論不代表未檢視的檔案也已確認。報告不引用實際憑證或個人資料。

## 發現摘要

| 編號 | 嚴重度 | 發現 |
|---|---|---|
| FMB-001 | 低 | 範例 PDF 工具的檔案服務器以字串前綴判斷路徑是否位於專案目錄，無法阻止符號連結逃逸。 |
| FMB-002 | 低 | 範例 PDF 工具未處理無效的百分比編碼；解碼例外可能中止工具程序。 |
| FMB-003 | 低 | 網頁版載入 Google Fonts 時會向第三方送出瀏覽器網路請求。 |

## 詳細發現

### FMB-001：靜態檔案服務器的路徑限制未涵蓋符號連結

- **嚴重度：** 低
- **位置：** `tools/make_sample_pdfs.mjs:65-72`
- **類型：** 路徑穿越／本機檔案資訊暴露
- **說明：** 程式將請求路徑解析後，使用 `file.startsWith(ROOT)` 作為目錄邊界檢查。這只檢查字串路徑，不檢查檔案系統解析後的實際位置。若專案目錄內存在指向目錄外檔案的符號連結，檢查仍會通過；後續 `statSync` 與 `readFileSync` 會跟隨符號連結。服務器僅監聽 loopback，且在產生 PDF 時短暫運作，降低了可利用性，但未消除本機檔案暴露風險。
- **重現方式：** 在工具服務期間，若服務根目錄內有一個指向目錄外檔案的符號連結，請求該連結對應的 URL。詞法解析後的路徑仍在 `ROOT` 之下，檢查通過，而讀檔操作會跟隨符號連結。
- **修補建議 patch 片段：** 使用 `realpath` 解析服務根目錄與目標檔案，並以路徑分隔符檢查完整目錄邊界；解析失敗時回傳 404。另應在讀取前限制允許的方法與服務路徑。
  ```js
  import { realpathSync } from 'node:fs';
  import { resolve, sep } from 'node:path';

  const root = realpathSync(ROOT);
  const candidate = resolve(ROOT, `.${urlPath}`);

  let file;
  try {
    file = realpathSync(candidate);
  } catch {
    resp.writeHead(404).end('not found');
    return;
  }

  if (file !== root && !file.startsWith(root + sep)) {
    resp.writeHead(404).end('not found');
    return;
  }
  ```

### FMB-002：無效 URL 編碼可能使工具程序中止

- **嚴重度：** 低
- **位置：** `tools/make_sample_pdfs.mjs:65`
- **類型：** 錯誤處理／可用性
- **說明：** `decodeURIComponent` 遇到不完整或無效的百分比編碼會拋出例外。請求處理器沒有捕捉該例外；Node.js 未處理的例外可能終止程序，導致正在進行的 PDF 產生工作中斷。
- **重現方式：** 在本機工具服務器運作期間，送出包含不完整百分比編碼（例如 `%`）的請求路徑。解碼會拋出 `URIError`。
- **修補建議 patch 片段：** 在請求處理器內捕捉解碼錯誤，回應 400 並結束該次請求，不讓例外逸出事件處理器。
  ```js
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    resp.writeHead(400).end('bad request');
    return;
  }
  ```

### FMB-003：Google Fonts 會產生第三方網路請求

- **嚴重度：** 低
- **位置：** `index.html:8-10`
- **類型：** 隱私／第三方相依
- **說明：** 網頁版會向 Google Fonts 相關網域載入字型。瀏覽器連線時，第三方服務可取得一般連線中可見的網路資訊，例如 IP 位址及請求中繼資料。README 已說明網頁版會載入 Google Fonts；此項是需明確評估的隱私取捨，不代表使用者輸入內容會因此一併送出。
- **重現方式：** 使用瀏覽器開啟網頁版並觀察網路請求，會看到字型服務的請求。
- **修補建議 patch 片段：** 若優先考量不連線第三方，移除外部字型載入，使用系統字型；若需維持相同字型，則評估以授權允許的方式自行託管字型。
  ```html
  <!-- 移除指向 fonts.googleapis.com 與 fonts.gstatic.com 的連結；
       保留 CSS 中的系統字型 fallback。 -->
  ```

## 其他稽核觀察

- **命令注入：** 在可見的 `tools/make_sample_pdfs.mjs` 中，Chrome 以 `spawn` 傳入可執行檔與參數陣列，未見透過 shell 拼接命令的做法。`CHROME_BIN` 仍應視為受信任的本機設定，不應由不受信任輸入控制。
- **相依套件：** 檔案清單未見 npm／Python 相依套件清單或鎖定檔。可見腳本以 Node.js／Python 標準函式庫為主；PDF 工具另依賴外部 Chrome。由於沒有套件版本清單，無法據此完成第三方套件弱點掃描或版本風險判定。
- **機密與個資：** 可見內容未發現硬編碼憑證。README 與工作紀錄描述有使用者可選擇回報的功能，但回報程式碼與服務端程式未提供完整內容，無法核實實際傳送欄位、資料保存期限、存取控制與刪除流程。
- **fail-open／fail-closed：** 可見範圍不足以確認前端教材載入、localStorage 錯誤、回報失敗等路徑的實際安全預設。請依 `CHECKLIST.md` 補做程式碼與部署設定核查。
- **測試：** 本次只完成文件與靜態檢視，未執行程式或測試。FMB-001、FMB-002 的本機測試應使用臨時目錄及本機服務器，不連線正式服務、不讀寫 repo 以外的固定路徑。
