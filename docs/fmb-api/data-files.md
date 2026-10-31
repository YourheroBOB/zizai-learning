# 資料檔目錄與語意

本文件說明 `data/` 底下的資料檔、命名規則、收錄統計，以及幾個容易被誤用的欄位語意。結構定義見 [data-schema.md](data-schema.md)。

## 檔案清單

| 檔案 | 內容 | 結構 |
|---|---|---|
| `data/curriculum-115-1-g1.json` | 一年級（115 學年度上學期） | schema 相容 |
| `data/curriculum-115-1.json` | 二年級（115 學年度上學期，原始資料，維持相容性） | schema 相容；無 `readings`／`ambiguous` |
| `data/curriculum-115-1-g3.json` | 三年級 | schema 相容 |
| `data/curriculum-115-1-g4.json` | 四年級 | schema 相容 |
| `data/curriculum-115-1-g5.json` | 五年級 | schema 相容 |
| `data/curriculum-115-1-g6.json` | 六年級 | schema 相容 |
| `data/curriculum-110.json` | 110 學年度（僅二年級） | 非 schema 結構：`meta` ＋ `blocks` |
| `data/curriculum-demo.json` | 生活情境自編體驗版（12 主題） | 非 schema 結構：`meta` ＋ `themes` |
| `data/schema.json` | 資料結構定義 | JSON Schema |
| `data/SOURCES.md` | 資料來源清單與取得步驟 | 文件 |
| `data/GAPS.md` | 已知缺口與多音字待確認清單 | 文件 |

### 命名規則

- `curriculum-115-1.json`：二年級（原始檔，檔名不含年級後綴）。
- `curriculum-115-1-g{N}.json`：N 年級（`N` 為 1、3、4、5、6）。
- 前端以此命名規則對應年級下拉選單，新增年級時須同步更新 `src/app.js` 的資料檔對照與 `tools/bundle.py` 的內嵌清單。

## 收錄統計（115 學年度上學期）

| 年級 | 檔案 | 版本 | 單元數 | 生字數 | 語詞數 |
|---|---|---|---|---|---|
| 一年級 | `curriculum-115-1-g1.json` | 康軒 | 7 | 84 | 42 |
| 一年級 | `curriculum-115-1-g1.json` | 翰林 | 7 | 88 | 42 |
| 一年級 | `curriculum-115-1-g1.json` | 南一 | 9 | 115 | 54 |
| 二年級 | `curriculum-115-1.json` | 康軒 | 12 | 216 | 138 |
| 二年級 | `curriculum-115-1.json` | 翰林 | 12 | 216 | 116 |
| 二年級 | `curriculum-115-1.json` | 南一 | 12 | 216 | 122 |
| 三年級 | `curriculum-115-1-g3.json` | 康軒 | 12 | 202 | 72 |
| 三年級 | `curriculum-115-1-g3.json` | 翰林 | 12 | 187 | 72 |
| 三年級 | `curriculum-115-1-g3.json` | 南一 | 12 | 180 | 72 |
| 四年級 | `curriculum-115-1-g4.json` | 康軒 | 12 | 180 | 72 |
| 四年級 | `curriculum-115-1-g4.json` | 翰林 | 12 | 176 | 72 |
| 四年級 | `curriculum-115-1-g4.json` | 南一 | 12 | 177 | 72 |
| 五年級 | `curriculum-115-1-g5.json` | 康軒 | 12 | 224 | 72 |
| 五年級 | `curriculum-115-1-g5.json` | 翰林 | 12 | 221 | 72 |
| 五年級 | `curriculum-115-1-g5.json` | 南一 | 12 | 216 | 72 |
| 六年級 | `curriculum-115-1-g6.json` | 康軒 | 12 | 217 | 72 |
| 六年級 | `curriculum-115-1-g6.json` | 翰林 | 12 | 220 | 72 |
| 六年級 | `curriculum-115-1-g6.json` | 南一 | 12 | 216 | 72 |

統計來源為 `GRADES.md`；資料重建後若變動，應同步更新該檔。

## 單元編號（`lessonNo`）規則

| 情況 | `lessonNo` | `title` |
|---|---|---|
| 一般課次（來源標 `L01`、`L02`…） | 該數字（1、2…） | 「第 N 課」 |
| 來源標 `L00` 的前導單元 | `0` | 「第 0 課」 |
| 來源不帶課碼的前導列 | 依來源順序給負數：若有 N 個前導列，第一個為 `-N`、第二個為 `-(N-1)`… | 沿用來源標籤原文（例如「數字」「魔法」） |

負數保證前導單元排在所有正式課次之前，且不與正式課次撞號。目前已知前導單元：康軒一年級 `L00`（`lessonNo` 0）、南一一年級「數字」（`-2`）、南一一年級「魔法」（`-1`）。

前端顯示課名時應使用 `title`，不要自行以 `lessonNo` 拼字串，否則前導單元會出現重複或錯誤課名。

## 讀音與破音標注

### `readings`

- 內容為辭典中該字的全部「完整音節（含聲調）」讀音，依詞頻由高到低排列，最多 4 筆，每筆附占比。
- 主要讀音（生字的 `bopomofo` 欄位）取「辭典多字詞條中該字最常見的完整讀音」，不是取辭典 heteronym 陣列的第一個。
- 讀音含聲調；輕聲寫法沿用辭典形式。

### `ambiguous`

- 定義：最常見完整讀音的占比低於門檻（門檻值見 `GRADES.md` 與 `tools/build_grades_from_sources.py`）。
- 用途：畫面標「破音」並加註「課本讀音可能不同」。
- 另有一類「次要讀音占比達標」的字會標一般「破音」但不設 `ambiguous`。

### 統計

| 項目 | 數量 |
|---|---|
| 有 `readings` 的生字筆數（一、三～六年級） | 2,703 |
| 不重複字 | 1,898 |
| `ambiguous` 不重複字 | 143 |
| 畫面標「破音」的不重複字 | 178 |
| 有 2 個以上讀音的筆數（不重複字） | 874（581） |

### 注意

- 二年級 `curriculum-115-1.json`、`curriculum-110.json`、`curriculum-demo.json` **沒有** `readings`／`ambiguous`，畫面不標注。
- 「課本讀音是否真的不同」仍需老師對照課本確認；系統只提供標注與使用者回報機制，不會自動改資料。
- 使用者的讀音修改存在瀏覽器端，不寫回資料檔（見 [config.md](config.md)）。

## 語詞

- 一、三～六年級的語詞由程式從辭典詞條篩選：必須含本課生字、優先二字詞、優先選擇另一字也是本課生字的詞、排除疊字怪詞，且詞中每個本課生字的音節須與該字選定讀音一致（含聲調）。
- 三～六年級語詞沒有釋義與例句欄位。
- 二年級語詞有釋義；二年級另有 `sentences`。

## 前置條件與授權

- `data/sources/gsyan/`（顏國雄老師試算表 CSV 快照）與 `data/sources/moedict/`（教育部辭典開放資料）**未收入本倉庫**，皆已列入 `.gitignore`；要重建資料或執行依賴快照的測試需自行下載，步驟見 `README.md`「如何重建資料」與 `data/SOURCES.md`。
- 授權狀況以 `README.md`、`data/SOURCES.md`、`GRADES.md` 的說明為準；本文件不主張任何未載明的授權，也不重製來源資料。
