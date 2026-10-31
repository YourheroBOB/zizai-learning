# zizai-learning 詳細審查發現

## FMB-001｜散布權利與程式授權界線尚未確定

- **位置**：`README.md:41-55`、`data/SOURCES.md:8-12,47-52`、`GRADES.md:3-5`
- **嚴重度**：高
- **類別**：法律／相依風險／發布
- **問題**：程式碼沒有 `LICENSE`；教師整理試算表未載明授權且僅被描述為供教學自學、非商業使用；辭典標示 CC BY-ND，但專案會選取、組合並產生衍生欄位。現有說明是警告，不是可散布的權利確認。
- **影響**：即使程式功能正常，公開 GitHub Pages、發布衍生物或允許他人散布仍可能不符合來源條件。
- **建議修法**：建立權利台帳，未核准項目使用 fail-closed 狀態，發布流程檢查後才允許打包。

```json
{
  "sourceId": "community-curriculum-snapshot",
  "license": "NOASSERTION",
  "redistributionStatus": "REVIEW_REQUIRED",
  "allowedUses": ["noncommercial_teaching"],
  "attributionRequired": true
}
```

- **驗收**：每個來源都有授權、允許用途、修改權與散布權；公開發布前所有 `REVIEW_REQUIRED` 均已核准。

## FMB-002｜provenance 類型不足以誠實描述教師整理快照

- **位置**：`data/schema.json:16-19`、`data/SOURCES.md:5-12`
- **嚴重度**：中
- **類別**：正確性／資料治理
- **問題**：`sourceType` 只有 `official_curriculum`、`historical_curriculum`、`demo_exercise`。若第三方教師整理的試算表被放入 `official_curriculum`，下游無法區分官方發布與社群彙整。
- **影響**：文件、介面或資料消費者可能誤示來源具有官方性。
- **建議修法**：新增明確的第三方彙整類型，並由產生器強制使用。

```json
"sourceType": {
  "type": "string",
  "enum": [
    "official_curriculum",
    "community_compilation",
    "historical_curriculum",
    "demo_exercise"
  ]
}
```

- **驗收**：來源為社群快照的資料不得使用 `official_curriculum`。

## FMB-003｜單一 Schema 無法描述目前三種資料形狀

- **位置**：`data/schema.json:1-107`、`tools/build_datasets.py:88-105,221-233,277-289`
- **嚴重度**：高
- **類別**：正確性／可測試性
- **問題**：頂層 Schema 強制要求 `publishers`，但歷史版使用 `blocks`、體驗版使用 `themes`。目前正式 Schema 無法正確驗證另外兩種實際資料。
- **影響**：測試若只檢查 Schema，可能對無效資料給出錯誤信心，或直接漏驗兩套資料。
- **建議修法**：拆成三個獨立 Schema，或以 `oneOf` 清楚區分。

```json
{
  "$defs": {
    "official": { "required": ["meta", "publishers"] },
    "historical": { "required": ["meta", "blocks"] },
    "demo": { "required": ["meta", "themes"] }
  },
  "oneOf": [
    { "$ref": "#/$defs/official" },
    { "$ref": "#/$defs/historical" },
    { "$ref": "#/$defs/demo" }
  ]
}
```

- **驗收**：七個課程 JSON 都能由對應契約驗證，且錯誤形狀會被拒絕。

## FMB-004｜Schema 允許多個不完整或不合理值

- **位置**：`data/schema.json:38-93`
- **嚴重度**：中
- **類別**：正確性／資料品質
- **問題**：`bopomofo` 與 `radical` 可為空字串，`strokes` 可為 0 或負數，陣列可為空；也未正式描述 `readings`、`ambiguous` 等欄位。由於未限制額外屬性，未知欄位也不會被發現。
- **影響**：空白資料可以通過 Schema，UI 顯示缺值；Schema 與實際資料契約持續漂移。
- **建議修法**：先盤點實際欄位，再補上語意限制與額外屬性政策。

```json
"bopomofo": { "type": "string", "minLength": 1 },
"radical": { "type": "string", "minLength": 1 },
"strokes": { "type": "integer", "minimum": 1 },
"readings": { "type": "array", "minItems": 1 },
"ambiguous": { "type": "boolean" }
```

- **驗收**：每個發布資料檔通過契約驗證；空注音、零筆畫及負筆畫均使檢查失敗。

## FMB-005｜體驗版產生空白注音、部首與筆畫

- **位置**：`tools/build_datasets.py:244-275`
- **嚴重度**：中
- **類別**：正確性／使用者體驗
- **問題**：`demo_themes` 的每個字固定寫入 `bopomofo: ""`、`radical: ""`、`strokes: 0`。這不是合法可用的教材屬性，現有 Schema 因 FMB-004 也無法阻擋。
- **影響**：體驗版卡片可能出現空白注音、部首或 0 筆畫，降低資料可信度。
- **建議修法**：由正式課程資料建立查找表；找不到時讓建置失敗。若產品刻意不支援，則應使用明確的 `metadataAvailable: false`，不能偽裝成空值。

```python
attrs = formal_characters.get(ch)
if not attrs or not attrs.get("bopomofo") or attrs.get("strokes", 0) <= 0:
    raise ValueError(f"demo character metadata missing: {ch}")
```

- **驗收**：體驗版所有生字都有正整數筆畫及非空注音。

## FMB-006｜JS 物件擷取及轉 JSON 方式脆弱

- **位置**：`tools/build_datasets.py:42-65`
- **嚴重度**：中
- **類別**：正確性／錯誤處理／可維護性
- **問題**：`re.search` 以非巢狀 regex 擷取 `DATA`；`js_obj_to_json` 只替換部分物件鍵，不能正確處理註解、單引號字串、跳脫字元或字串內的逗號及冒號。
- **影響**：來源檔只要改格式或包含合法 JS 語法，就可能產生誤判或難以理解的 JSON decode 錯誤。
- **建議修法**：使用平衡括號掃描器取得完整字面值，再交給明確且固定版本的 JSON5／JavaScript parser；不要以 regex 猜資料邊界。

```python
def extract_js_literal(source: str, marker: str) -> str:
    start = source.index(marker) + len(marker)
    depth = 0
    quote = None
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in "\"'`":
            quote = char
        elif char in "{[":
            depth += 1
        elif char in "}]":
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise ValueError("unterminated JavaScript literal")
```

- **驗收**：以含註解、巢狀物件、跳脫字串的 fixture 測試均可穩定解析。

## FMB-007｜資料建置非原子，且 import 時即產生副作用

- **位置**：`tools/build_datasets.py:14-16,213-215,235-237,291-293`
- **嚴重度**：中
- **類別**：併發／錯誤處理／可測試性
- **問題**：程式在 import 時建立資料夾，頂層流程直接覆寫三個 JSON。兩個建置程序並行，或程序在寫檔中斷時，可能留下半檔或不同版本資料。
- **影響**：CI、下載後重建與正式發布可能同時改寫資料，造成短暫不一致或損毀。
- **建議修法**：集中到 `main()`，對輸出目錄加鎖，先寫同目錄暫存檔，完成後以 `os.replace` 原子替換。

```python
def atomic_write_json(path, payload):
    fd, temp_path = tempfile.mkstemp(dir=OUTPUT_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
```

- **驗收**：強制在寫入中斷後，原資料檔仍完整；並行建置有明確鎖或拒絕第二個程序。

## FMB-008｜單檔版「無自動網路請求」保證未涵蓋內嵌 JSON

- **位置**：`tools/bundle.py:153-179,198-208`
- **嚴重度**：高
- **類別**：相依風險／隱私／正確性
- **問題**：打包器會嵌入完整課程 JSON，也會產生含 `strokeImg` 等欄位的資料，但靜態檢查主要掃描 HTML、CSS 與 JS。若任一字串欄位成為 `img.src`、CSS URL 或其他自動載入來源，單檔版仍可能連網。
- **影響**：「離線版零外部請求」的既有說法目前沒有被完整證明。
- **建議修法**：遞迴掃描所有內嵌 JSON URL，區分「使用者點擊連結」與「自動載入資源」；後者必須移除。瀏覽器整合測試再以 CDP 攔截所有非 `127.0.0.1` 請求。

```python
def iter_urls(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from iter_urls(item)
    elif isinstance(value, list):
        for item in value:
            yield from iter_urls(item)
    elif isinstance(value, str) and value.startswith(("http://", "https://")):
        yield value
```

- **驗收**：離線版開啟、切換年級、抽題、顯示圖片及列印期間均無外部請求。

## FMB-009｜以字串 regex 釘死網路能力容易被繞過

- **位置**：`tools/bundle.py:121-151`
- **嚴重度**：中
- **類別**：相依風險／可測試性
- **問題**：對 `fetchImpl(`、`XMLHttpRequest` 等做 token/regex 檢查，不能可靠辨識動態屬性取得、別名或由 DOM 產生的請求。
- **影響**：未來新增網路功能可能繞過打包檢查，產生「檢查通過但實際連網」的假象。
- **建議修法**：保留靜態檢查作為快速 gate，另加入真正瀏覽器的 request interception 測試；不要把 regex 稱為完整安全保證。
- **驗收**：測試會在程式碼加入動態網路呼叫時失敗。

## FMB-010｜單檔輸出非原子，且只顯示 MD5

- **位置**：`tools/bundle.py:198-216`
- **嚴重度**：低
- **類別**：發布／可讀性
- **問題**：兩個輸出檔依序直接寫入；中斷時可能內容不一致。MD5 適合意外檢查，不適合作為發布完整性識別。
- **建議修法**：兩份先寫暫存檔，再原子替換；使用 SHA-256 並記錄來源 commit。

```python
digest = hashlib.sha256(raw).hexdigest()
for name in ("index.html", "zi-zai.html"):
    atomic_write_text(os.path.join(OUT, name), html)
print(f"sha256={digest}")
```

## FMB-011｜CDP 命令沒有逾時，WebSocket 關閉後 pending promise 可永久等待

- **位置**：`tools/make_sample_pdfs.mjs:81-109,153-162`
- **嚴重度**：高
- **類別**：併發／錯誤處理／CI 穩定性
- **問題**：`send()` 沒有 timeout；也沒有 `ws.onclose` 處理。Chrome 或 CDP 半斷線時，`Page.printToPDF` 等 pending promise 可能永不完成。
- **影響**：產生 PDF 的 CI 或人工流程可能永久掛住，且沒有可診斷的錯誤。
- **建議修法**：每個命令加入逾時；close/error 時拒絕所有 pending 命令。

```javascript
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)), ms
    )),
  ]);
}

ws.onclose = () => {
  for (const pending of pendingMap.values()) {
    pending.reject(new Error('DevTools WebSocket closed'));
  }
  pendingMap.clear();
};
```

- **驗收**：關閉 Chrome 或暫停回應時，命令在明確時間內退出並印出可讀錯誤。

## FMB-012｜暫存伺服器暴露整個 repository，且路徑邊界判斷不嚴謹

- **位置**：`tools/make_sample_pdfs.mjs:64-78`
- **嚴重度**：中
- **類別**：安全／相依風險
- **問題**：伺服器根目錄是整個 repository，因此可讀取版本控制中繼資料等非 `dist` 檔案；`file.startsWith(ROOT)` 也只做字串前綴比對，不能嚴格表示檔案位於根目錄內。
- **影響**：頁面若被植入非預期腳本，可在同源下讀取不應由本工具提供的 repository 檔案。
- **建議修法**：伺服器根目錄改成 `dist/`，使用 `relative()` 判斷穿越，並拒絕 dotfile。

```javascript
const DIST_ROOT = resolve(ROOT, 'dist');
const relativePath = relative(DIST_ROOT, file);
const outside = relativePath.startsWith('..') || isAbsolute(relativePath);
if (outside || relativePath.split(sep).some(part => part.startsWith('.'))) {
  resp.writeHead(403).end('forbidden');
  return;
}
```

- **驗收**：無法透過編碼或 `..` 讀取 `dist/` 以外檔案。

## FMB-013｜URL 解碼例外與 Chrome 啟動失敗缺少友善處理

- **位置**：`tools/make_sample_pdfs.mjs:64-78,117-148`
- **嚴重度**：中
- **類別**：錯誤處理／資源清理
- **問題**：非法百分號編碼會讓 `decodeURIComponent` 直接拋錯；`spawn` 的 `error` 事件沒有被監看。程序也未完整處理 SIGINT／SIGTERM，可能留下 detached Chrome 或暫存目錄。
- **建議修法**：所有 request 路徑先 try/catch；監看 spawn error；信號中斷時走同一 cleanup。

```javascript
let urlPath;
try {
  urlPath = decodeURIComponent(new URL(req.url, 'http://local').pathname);
} catch {
  resp.writeHead(400).end('bad request');
  return;
}
chrome.once('error', rejectStartup);
process.once('SIGINT', () => cleanup().finally(() => process.exit(130)));
```

- **驗收**：惡意 URL 不得使伺服器崩潰；Chrome 不存在或收到中斷訊號時不留下程序與暫存檔。

## FMB-014｜列印內容可能溢出成額外頁面

- **位置**：`src/print.css:22-31,104-108,198-234`
- **嚴重度**：高
- **類別**：正確性／列印
- **問題**：`.tp-sheet` 只有 `min-height: 297mm`，內容增加時可自然溢頁；`break-inside: avoid` 只避免段落被切斷，不能保證整張學生卷仍是一頁。現有範例只覆蓋預設題量。
- **影響**：高年級或最大題數可能產生三頁以上，學生卷與答案卷頁面配對錯誤，甚至裁切題目。
- **建議修法**：以最大題量建立列印整合測試並檢查 PDF 頁數；在測試通過前不要用 `overflow: hidden` 掩蓋溢出，而應限制題量或重新分頁。

```javascript
const { data } = await call('Page.printToPDF', pdfParams);
await assertPdfPageCount(Buffer.from(data, 'base64'), {
  studentOnly: 1,
  withAnswers: 2
});
```

- **驗收**：每個年級與版本以最大設定產生固定頁數，且 DOM 中所有題目都出現在 PDF。

## FMB-015｜注音解析器對錯誤資料過度寬容

- **位置**：`src/zhuyin.js:33-45,236-251`
- **嚴重度**：中
- **類別**：正確性／錯誤處理
- **問題**：`splitSyllable` 遇到多個聲調時以最後一個覆蓋前面，且不驗證符號是否為合法注音；`word()` 對缺少音節的資料直接留空。
- **影響**：損壞資料不會被察覺，可能渲染成看似有效但錯誤的讀音。
- **建議修法**：在資料載入邊界先做嚴格驗證；rendering helper 遇到非法值應丟出明確錯誤，而非默默修正。

```javascript
if (tones.length > 1) {
  throw new Error(`invalid Bopomofo tone count: ${syllable}`);
}
if (!symbols.every(symbol => VALID_BOPOMOFO.has(symbol))) {
  throw new Error(`invalid Bopomofo symbol: ${syllable}`);
}
```

- **驗收**：不合法聲調、符號及音節數不足的資料在載入時失敗，錯誤訊息包含欄位路徑但不含敏感資料。

## FMB-016｜設計權杖與硬編色值不一致，部分文字對比不足

- **位置**：`src/tokens.css:17-50`、`src/zhuyin.css:11-15,44-70,96-106`、`index.html:18-296`
- **嚴重度**：中
- **類別**：可讀性／無障礙／相依風險
- **問題**：`tokens.css` 宣告應使用語意權杖，但注音與 index 內嵌 CSS 仍大量硬編色值；`--tp-ink-faint` 在紙色上的對比明顯低於一般文字所需 4.5:1。深色主題切換時也可能不一致。
- **影響**：小字、輔助文字及注音在某些背景或列印設定下難以閱讀。
- **建議修法**：以自動對比工具驗證 token；將可變色值改由語意 token 提供，列印例外另以媒體查詢覆寫。

```css
:root {
  --tp-ink-faint: #665E52;
}

@media (prefers-contrast: more) {
  :root {
    --tp-ink-faint: var(--tp-ink);
  }
}
```

- **驗收**：所有一般文字至少 4.5:1，大字至少 3:1；核心元件不再直接依賴固定藍色。

## FMB-017｜來源重建測試被跳過時，仍可能呈現為綠燈

- **位置**：`README.md:87-97`、`tests/test_zizai.js`（本次素材未提供完整內容）
- **嚴重度**：中
- **類別**：可測試性／發布
- **問題**：README 明確記載缺少外部來源快照時會有多項 skip。skip 不等於通過，但目前容易讓一般執行結果被解讀為完整驗證。
- **影響**：教材 JSON 與來源漂移可能未被发现。
- **建議修法**：拆成 `unit`、`contract`、`source-rebuild`、`browser` 四級。PR 必跑前三級中的可離線項目；正式發布必須跑 `source-rebuild`。
- **驗收**：輸出摘要同時列出 pass、fail、skip；發布 gate 在必要 source 測試被 skip 時失敗。

```text
unit          : required
data-contract : required
source-rebuild: required before release
browser       : required before UI release
```

## FMB-018｜文件引用的 `dist/` 產物不在本次檔案清單

- **位置**：`README.md:29-39,87-97`
- **嚴重度**：中
- **類別**：發布／文件／相依風險
- **問題**：README 描述 `dist/index.html`、`dist/zi-zai.html` 與範例 PDF，但本次 37 個檔案的清單沒有 `dist/`，`.gitignore` 也未說明其政策。
- **影響**：使用者可能找不到離線版；維護者不清楚產物應提交、由 CI 產生，或由使用者自行建置。
- **建議修法**：明確選擇「版本控制產物」或「CI release artifact」。若不追蹤，README 應改為提供建置命令並說明產物位置。

```text
dist/ is not tracked.
Generate with: python3 tools/bundle.py
Output: dist/index.html and dist/zi-zai.html
```

- **驗收**：clone 後執行單一命令即可取得與文件一致的產物，且產物有 SHA-256 清單。

## FMB-019｜缺少秘密資料掃描 gate

- **位置**：`.gitignore:1-8`
- **嚴重度**：中
- **類別**：安全／發布
- **問題**：忽略規則沒有涵蓋一般本機環境檔，也未見秘密掃描流程。私有 repo 仍可能因誤提交 log、產物或設定而洩漏憑證。
- **影響**：憑證可能進入 Git 歷史，即使後續刪除檔案也未必能清除。
- **建議修法**：不以寬泛 ignore 取代掃描；加入 pre-commit／CI 秘密掃描，並使用遮蔽模式，不在報告中印出命中值。

```text
Scan repository and working tree with secret detection enabled.
Print only file names and rule identifiers; redact matched values.
Fail the build on confirmed secrets.
```

- **驗收**：測試用假憑證可被偵測，報告不顯示原值。

## FMB-020｜全域 `overflow-x: hidden` 可能掩蓋版面溢位

- **位置**：`src/base.css:26-30`
- **嚴重度**：低
- **類別**：可讀性／可測試性
- **問題**：全域隱藏水平溢位會使錯誤內容直接被裁掉，瀏覽器測試也可能只看到 `scrollWidth === clientWidth` 而漏報真正的元件越界。
- **建議修法**：移除全域裁切，逐一修正容器 `min-width: 0`；若產品必須避免橫向捲動，仍應在視覺測試中對主要容器個別檢查邊界。
- **驗收**：320px 與 375px 下所有主要元件邊界位於 viewport，且不是靠裁切達成。

## FMB-021｜多份歷史測試輸出容易被誤認為現況

- **位置**：`tests/RESULT_1151001.txt` 至 `tests/RESULT_1151001g.txt`
- **嚴重度**：低
- **類別**：可讀性／可測試性
- **問題**：儲存多輪、不同測試數目的輸出，且檔名未直接表示 commit 或執行環境。README 又手動維護目前項數。
- **影響**：審查者可能引用過期結果，或無法知道哪一份對應目前程式。
- **建議修法**：只保留最新一份，或在檔頭加入 commit、時間、環境及命令；其餘由 CI artifact 保存。

```text
Commit: <git commit>
Command: node tests/test_zizai.js
Runtime: Node <version>
Result: passed / failed / skipped summary
```

## 建議追加的第二輪審查項目

以下檔案需取得完整內容後再作負責任的行號審查：

- `src/app.js`：快速切換年級時的 async race、事件監聽重複掛載、localStorage 遷移與資料載入失敗。
- `src/readings.js`：回報請求取消／逾時、併發修改、localStorage 資料遷移、匯出內容與個資最小化。
- `tests/test_zizai.js`：測試是否只驗證實作細節、是否有真正 assertion、skip 與 pass 是否可混淆。
- `tools/build_grades_from_sources.py`：來源解析、原子寫入、字典詞頻與占比重現性。
- `src/components.css`：鍵盤焦點、色彩對比、響應式溢位。
