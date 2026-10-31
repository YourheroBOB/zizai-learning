# 字在離線使用範例

本目錄提供 5 個可直接執行、離線運作的使用範例，讓開發者能快速查看教材資料、產生練習題、建立可列印考卷、檢查資料品質，以及驗證注音元件。

所有範例均遵守下列限制：

- 只讀取本專案內的 `data/*.json` 或 `src/zhuyin.js`。
- 只使用 Python 標準函式庫或 Node.js 內建模組，不需安裝套件。
- 不連線到任何網路服務，也不呼叫正式 API。
- 不需要金鑰、權杖、密碼或其他憑證，因此沒有需要填入的假憑證。
- 範例本身不修改既有專案檔案；範例 3 預設把結果印到 stdout。

請在專案根目錄執行以下命令。

## 範例一：瀏覽課程與生字

用途：依年級、出版社與課次列出單元、生字、注音、部首、筆畫及可選的語詞；亦可輸出 JSON 方便後續處理。

```bash
python3 fmb_examples/example_01_browse_curriculum.py
python3 fmb_examples/example_01_browse_curriculum.py --grade 3 --publisher nanyi --lesson 1 --words
python3 fmb_examples/example_01_browse_curriculum.py --grade 6 --publisher hanlin --json
```

參數：

- `--grade`：`1` 到 `6`，預設為 `2`。
- `--publisher`：`kangxuan`、`hanlin` 或 `nanyi`，預設為 `kangxuan`。
- `--lesson`：課次；省略時列出所有單元概況。
- `--words`：同時列出語詞與逐字注音。
- `--json`：輸出機器可讀 JSON。

## 範例二：產生離線練習題

用途：從指定課次或已教範圍建立可重現的注音練習題，並輸出題目及答案；相同 `--seed` 會得到相同題目。

```bash
python3 fmb_examples/example_02_generate_quiz.py
python3 fmb_examples/example_02_generate_quiz.py --grade 4 --publisher kangxuan --lesson 3 --count 8 --seed 2026
python3 fmb_examples/example_02_generate_quiz.py --scope all-taught --count 10 --format json
python3 fmb_examples/example_02_generate_quiz.py --student-only
```

參數：

- `--grade`、`--publisher`、`--lesson`：與範例一相同。
- `--scope`：`lesson` 只取指定課次；`all-taught` 取指定課次以前已教的單元。
- `--count`：題數，預設為 `5`。
- `--seed`：亂數種子，預設為 `2026`。
- `--format`：`markdown` 或 `json`。
- `--student-only`：隱藏答案，適合製作學生卷。

## 範例三：建立可列印的離線 A4 考卷

用途：把指定課次的生字與語詞轉成一份獨立 HTML 考卷，同時包含學生卷與答案卷。產出的 HTML 不引用外部字型、圖片、程式或資料，也不需要 HTTP 伺服器。

預設輸出到 stdout；可自行將結果保存於本目錄：

```bash
python3 fmb_examples/example_03_build_worksheet.py > fmb_examples/offline_worksheet.html
```

接著可用瀏覽器直接開啟 `fmb_examples/offline_worksheet.html`，或列印成 PDF。產生的 HTML 可直接透過 `file://` 開啟。

參數：

- `--grade`、`--publisher`、`--lesson`：與範例一相同。
- `--count`：題數，預設為 `8`；若該課可用題目不足，會自動縮減並在 stderr 顯示提示。
- `--seed`：抽題種子，預設為 `2026`。

`offline_worksheet.html` 是執行後產生的暫存成果，不需要提交到版本控制。

## 範例四：離線驗證教材資料

用途：依專案 `data/schema.json` 的核心約束，以 Python 標準函式庫檢查六個 115 學年度教材資料檔。檢查項目包含必要欄位、課次唯一性、出版社課數、生字欄位、語詞注音長度、例句注音長度，以及選用的多音字欄位型別。

```bash
python3 fmb_examples/example_04_validate_data.py
```

成功時每個資料檔會顯示一行 `PASS`，最後顯示：

```text
總結果：PASS（6 個資料集，18 個出版社，72 個單元，...）
```

實際字數、詞數與句數會依仓库內資料即時計算，不會連線查詢資料來源。

## 範例五：檢查注音元件產生的 DOM 樹

用途：載入專案的 `src/zhuyin.js`，以 Node.js 的輕量 DOM 模擬環境檢查單字格、雙字詞與句子挖空結果。範例會驗證學生卷不直接顯示答案，而答案卷會顯示答案。

```bash
node fmb_examples/example_05_zhuyin_render.js
```

此範例使用 Node.js 內建模組；建議依專案既有測試方式使用 Node.js 22。它只讀取本機教材 JSON 與注音元件，不會啟動瀏覽器或連線到網路。

## 一次驗證所有範例

執行下列命令會依序實際執行上述 5 個範例，檢查結束碼與必要輸出：

```bash
python3 fmb_examples/run_all_examples.py
```

預期結果：

```text
PASS 範例 1：瀏覽課程與生字
PASS 範例 2：產生離線練習題
PASS 範例 3：建立可列印的離線 A4 考卷
PASS 範例 4：離線驗證教材資料
PASS 範例 5：檢查注音元件產生的 DOM 樹
全部範例通過：5/5
```

驗證器只在記憶體中擷取子程序輸出，不會建立 repo 以外的路徑，也不會操作任何正式服務。
