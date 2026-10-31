# 課程資料 schema 參考（`data/schema.json`）

`data/schema.json` 是 JSON Schema（draft 2020-12），描述一、三、四、五、六年級課程資料檔（`data/curriculum-115-1-g*.json`）的結構。二年級 `data/curriculum-115-1.json` 大體相容；`data/curriculum-110.json` 與 `data/curriculum-demo.json` 另有結構（見 [data-files.md](data-files.md)）。

> schema 只描述「資料形狀」，不驗證教材內容是否正確。內容正確性由 `tests/test_zizai.js` 的資料模組與 CSV 快照逐課比對負責（見 [cli.md](cli.md)）。

## 頂層物件

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `meta` | `object` | 是 | 資料集中介資料 |
| `publishers` | `object` | 是 | 版本鍵 → 版本物件；鍵名如 `kangxuan`、`hanlin`、`nanyi` |

schema 沒有設定 `additionalProperties: false`，因此允許出現未宣告的欄位。

## `meta`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `id` | `string` | 是 | 資料集識別字 |
| `title` | `string` | 是 | 資料集標題 |
| `sourceType` | `string` | 是 | 列舉：`official_curriculum`、`historical_curriculum`、`demo_exercise` |
| `editionNote` | `string` | 是 | 版本／課綱說明 |
| `licenseNotes` | `string` | 是 | 授權與出處說明；必須如實描述各來源授權狀況 |
| `academicYear` | `integer` | 否 | 學年度（民國年） |
| `grade` | `string` | 否 | 年級文字（例如「二年級」）；**不是**前端用的 1～6 數字 |
| `semester` | `string` | 否 | 學期文字 |
| `semesterCode` | `string` | 否 | 列舉：`2a`、`2b` |
| `semesterStart` | `string` | 否 | 學期起始日（ISO 格式字串） |
| `moeDictUrlTemplate` | `string` | 否 | 教育部辭典連結樣板，含 `{word}` 佔位符 |
| `moeStrokeUrlTemplate` | `string` | 否 | 教育部筆順學習網連結樣板，含 `{word}` 佔位符 |
| `eduCloudPediaTemplate` | `string` | 否 | 教育百科連結樣板，含 `{word}` 佔位符 |

實務上另可見未在 schema 宣告的欄位（例如語詞來源說明），該類欄位屬擴充資訊，前端不應強制依賴。

## `publishers.<key>`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `name` | `string` | 是 | 版本中文名 |
| `totalLessons` | `integer` | 是 | 單元總數 |
| `lessons` | `object[]` | 是 | 單元陣列 |

## `publishers.<key>.lessons[]`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `lessonNo` | `integer` | 是 | 課次。正式課次為正整數；前導單元為 `0` 或負整數（規則見 [data-files.md](data-files.md)） |
| `title` | `string` | 是 | 單元標題；來源沒有課名時為「第 N 課」，前導單元沿用來源標籤原文 |
| `characters` | `object[]` | 是 | 生字陣列 |
| `words` | `object[]` | 是 | 語詞陣列（可為空陣列） |
| `estimatedWeeks` | `number` | 否 | 預估授課週數 |
| `sentences` | `object[]` | 否 | 例句陣列；沒有例句的年級不提供，A4 考卷會隱藏對應大題 |

## `lessons[].characters[]`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `char` | `string` | 是 | 單一國字（`minLength`／`maxLength` 皆為 1） |
| `bopomofo` | `string` | 是 | 該字主要讀音（單一音節） |
| `radical` | `string` | 是 | 部首 |
| `strokes` | `integer` | 是 | 筆畫數 |
| `def` | `string` | 否 | 釋義（僅部分年級提供） |
| `strokeImg` | `string` | 否 | 筆順圖／動畫（僅部分年級提供） |
| `moeDictUrl` | `string` | 否 | 教育部辭典連結 |
| `moeStrokeUrl` | `string` | 否 | 教育部筆順學習網連結 |

### 擴充欄位：`readings` 與 `ambiguous`

一、三、四、五、六年級的資料檔，每個生字另帶兩個**未在 schema.json 宣告**的擴充欄位（因 schema 未禁止額外欄位，仍屬合法）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `readings` | `array` | 辭典中該字的全部讀音，依詞頻由高到低，最多 4 筆；每筆含讀音與占比 |
| `ambiguous` | `boolean` | 最常見讀音的占比低於門檻時為 `true`，畫面會標「破音／課本讀音可能不同」 |

讀音的挑選規則、占比門檻與畫面標注門檻見 [data-files.md](data-files.md)「讀音與破音標注」。`readings` 元素的確切欄位名請以資料檔為準；本文件不代為猜測。二年級、110 學年度與體驗版沒有這兩個欄位。

## `lessons[].words[]`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `word` | `string` | 是 | 詞語 |
| `bopomofoArray` | `string[]` | 是 | 逐字音節；長度應與字數一致 |
| `bopomofo` | `string` | 否 | 整詞注音字串（以空白分隔） |
| `def` | `string` | 否 | 釋義（僅部分年級提供） |

## `lessons[].sentences[]`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `text` | `string` | 是 | 句子全文 |
| `target` | `string` | 是 | 要挖空的目標詞（須出現在 `text` 中） |
| `bopomofoArray` | `string[]` | 是 | 目標詞逐字音節 |

## 最小合法範例

```json
{
  "meta": {
    "id": "FAKE_ID_FOR_TEST",
    "title": "範例資料集",
    "sourceType": "demo_exercise",
    "editionNote": "僅供文件示意",
    "licenseNotes": "示意用，無實際授權"
  },
  "publishers": {
    "kangxuan": {
      "name": "康軒",
      "totalLessons": 1,
      "lessons": [
        {
          "lessonNo": 1,
          "title": "第 1 課",
          "characters": [
            { "char": "山", "bopomofo": "ㄕㄢ", "radical": "山", "strokes": 3 }
          ],
          "words": [
            { "word": "山地", "bopomofoArray": ["ㄕㄢ", "ㄉㄧˋ"] }
          ]
        }
      ]
    }
  }
}
```

## 驗證方式

- 工具不內建 schema 驗證器；`python3 tools/bundle.py` 只檢查能否解析 JSON 並內嵌。
- 資料合規由 `node tests/test_zizai.js` 的資料模組檢查（必填欄位非空、注音與語詞一致、讀音與辭典一致、單元數與 CSV 快照列數一致等）。詳見 [cli.md](cli.md)。
