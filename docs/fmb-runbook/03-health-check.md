# 03 健康檢查

本系統是靜態站，健康檢查分五層。**L0–L2 是阻斷性**（不通過即視為故障），**L3 是使用者關鍵流程**，**L4 是外部相依**（異常只需確認降級正常，不視為本站故障）。

> 所有指令皆為唯讀。不要把使用者資料、localStorage 內容或任何憑證貼進檢查紀錄。
> 遠端檢查請由值班人員執行；`<BASE_URL>` 由維運環境決定，本文件不記載實際網址。

---

## 1. 檢查層級總表

| 層級 | 檢查什麼 | 頻率 | 不通過的意義 |
|---|---|---|---|
| L0 檔案可取 | 首頁、CSS/JS、JSON 皆回 200 | 部署後＋每日 | 站台不可用（P1） |
| L1 內容可解析 | 每個 JSON 可 parse、必填欄位存在 | 部署後＋每日 | 前端會載入失敗（P1） |
| L2 前端可啟動 | 六個年級與三個版本可切、Console 無錯 | 部署後 | 使用者無法使用（P1） |
| L3 關鍵流程 | 字卡／標記／練習／考卷／修改讀音 | 部署後＋每週 | 功能退化（P2） |
| L4 外部相依 | Google Fonts、教育部連結、回報端點 | 每週或有事時 | 只影響外觀或降級（P3） |

---

## 2. L0：檔案可取性

本機（起站後）：

```bash
python3 -m http.server 8000 --bind 127.0.0.1 &
BASE=http://127.0.0.1:8000
for p in / /src/app.js /src/readings.js /src/zhuyin.js /src/tokens.css \
         /data/schema.json /data/curriculum-115-1.json /data/curriculum-115-1-g1.json \
         /data/curriculum-115-1-g3.json /data/curriculum-115-1-g4.json \
         /data/curriculum-115-1-g5.json /data/curriculum-115-1-g6.json \
         /data/curriculum-110.json /data/curriculum-demo.json; do
  printf '%s %s\n' "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$p")" "$p"
done
```

遠端（部署後）：

```bash
BASE=<BASE_URL>
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "$BASE/"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/data/curriculum-115-1-g6.json"
```

期望：全部 **200**；`/` 為 HTML、`/*.js` 為 JavaScript、`/*.css` 為 CSS、`/data/*.json` 為 JSON。

常見誤判：主機回 200 但內容是 SPA 的 fallback HTML（可用 `curl -sS "$BASE/data/schema.json" | head -c 32` 確認開頭是 `{`）。

---

## 3. L1：資料可解析與必填欄位

```bash
node -e '
const fs = require("fs");
const files = fs.readdirSync("data").filter(f => f.endsWith(".json") && f.startsWith("curriculum-"));
let bad = 0;
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync("data/" + f, "utf8"));
    if (f === "curriculum-demo.json") {
      if (!Array.isArray(d.themes) || d.themes.length === 0) throw new Error("themes 缺失");
    } else if (f === "curriculum-110.json") {
      if (!d.meta || !Array.isArray(d.blocks)) throw new Error("meta/blocks 缺失");
    } else {
      if (!d.meta || !d.meta.id || !d.meta.licenseNotes) throw new Error("meta 必填欄位缺失");
      for (const [k, p] of Object.entries(d.publishers || {})) {
        if (!Array.isArray(p.lessons) || p.lessons.length === 0) throw new Error("publishers." + k + " lessons 缺失");
        if (p.totalLessons !== p.lessons.length) console.warn(f, k, "totalLessons 與 lessons 長度不同");
      }
    }
    console.log("OK  " + f);
  } catch (e) { bad++; console.log("BAD " + f + " → " + e.message); }
}
process.exit(bad ? 1 : 0);
'
```

期望：`data/` 下 **9 個** JSON（`schema.json` 另由 `data/schema.json` 定義結構）皆可解析，每份課程資料都有 `meta` 與非空的 `publishers.lessons`。

補充檢查：

- 每一課的 `characters`、`words` 不得為空；`bopomofo`、`radical`、`strokes` 不得缺（測試模組會驗）。
- `data/schema.json` 是契約檔，欄位改名必須同步更新它。

完整測試（最強的一關）：

```bash
node tests/test_zizai.js
```

| 情境 | 期望 |
|---|---|
| 已補齊 `data/sources/` | 87 通過、0 失敗 |
| 單純 clone | 66 通過、21 略過（略過不算失敗） |

---

## 4. L2：前端可啟動

1. 開首頁，Console 應無錯誤。
2. 切一～六年級：每個年級都能出字卡；Console 不應出現「年級 N 內嵌資料缺失」（此訊息只在 `dist/` 產物出現，代表打包資料不全）。
3. 切三個版本：康軒／翰林／南一皆有課次與生字。
4. 切 110 學年度與體驗版：僅二年級有效，切其他年級自動回首選 → **預期行為**。
5. 離線單檔版（若本次有發布）：`file://` 開啟、斷網仍可用、Network 面板無外部請求。

可由 Console 快速確認（僅 `dist/` 版）：

```js
Object.keys(window.__EMBEDDED_GRADES__)          // 期望含 1~6
!!window.__EMBEDDED_CURRICULUM_110__
!!window.__EMBEDDED_CURRICULUM_DEMO__
```

---

## 5. L3：使用者關鍵流程（抽樣即可）

| 檢查 | 作法 | 期望 |
|---|---|---|
| 破音標記 | 一年級翰林選一課，數字卡上的標記 | 資料規則一致（該組合已知為 14 張標記、其中 `ambiguous` 10 張） |
| 標記總量 | 全站標記應為 178 字（`ambiguous` 143＋次要讀音 ≥10% 35） | 與 `data/GAPS.md`「多音字待人工確認」一致 |
| 詳情彈窗 | 點任一字 | 列出辭典全部讀音與占比，現用讀音高亮 |
| 修改讀音 | 改成辭典另一個讀音 → 重新整理 | 仍在；字卡／練習／新分頁的 A4 卷都使用新讀音；可「還原」 |
| 儲存不可用 | 無痕或封鎖 localStorage | 顯示提示、不當機、可匯出 |
| 線上練習 | 三種範圍各抽一次 | 有題目、可作答、範圍正確 |
| A4 考卷 | 列印預覽 | 學生卷不洩答；答案卷另起一頁；**不應多出空白頁** |
| 版面 | 視窗 375px 寬 | 無水平捲軸 |
| 匯出 | 進度頁與彈窗的匯出 | 文字可複製、JSON 可下載（皆為本機檔案） |

---

## 6. L4：外部相依

| 相依 | 失敗表徵 | 判定 |
|---|---|---|
| Google Fonts | 字型退回系統字型，版面略不同 | **非故障**（功能不受影響），記錄即可 |
| 教育部辭典／筆順／教育百科連結 | 使用者點擊後對方網站錯誤 | 非本站故障，不告警 |
| 回報端點 | 前端顯示「已存在你的瀏覽器；這個頁面無法送出回報」 | **預期降級**（404／403／429／斷線／逾時皆同），不視為本站故障；端點本身問題通報整合站維護者 |
| 非白名單網域（含 GitHub Pages、`file://`） | 回報直接不送 | 設計行為 |

---

## 7. 判定標準

| 燈號 | 條件 | 行動 |
|---|---|---|
| 綠 | L0–L2 全過、L3 抽樣全過 | 記錄即可 |
| 黃 | L0–L2 全過，L3 有單項退化（例如列印多一頁） | 當日建票處理，必要時回滾（05 章） |
| 紅 | L0／L1／L2 任一不通過 | 立即通報，評估回滾 |

---

## 8. 記錄方式

- 檢查結果寫在維運工單／值班紀錄，**不要**把輸出檔提交回 repo（`tests/RESULT_*.txt` 是歷史測試紀錄，不是巡檢日誌）。
- 記錄欄位建議：時間、執行者、版本（commit）、檢查層級、結果、後續動作。
- 不得在紀錄中貼使用者資料、localStorage 內容或任何憑證。
