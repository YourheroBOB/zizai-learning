#!/usr/bin/env python3
"""
build_grades_from_sources.py — 從顏國雄老師試算表 CSV 快照 + 教育部辭典開放資料
一鍵重建「字在」所有年級（1,3,4,5,6）的 115-1 課程 JSON。

來源：
  - data/sources/gsyan/*.csv      — 顏國雄老師 115 學年度上學期各版本生字清單
                                    （授權條款未載明；原作者聲明僅供教學自學與非商業性使用；
                                    原始快照未收入本倉庫，須自行下載，缺檔時本腳本會印出步驟）
  - data/sources/moedict/dict-revised.json — g0v/moedict-data (CC BY-ND 3.0 TW)

產出：
  - data/curriculum-115-1-g{1,3,4,5,6}.json

用法：
  python3 tools/build_grades_from_sources.py
"""

import csv, json, os, re, sys
from collections import OrderedDict, Counter
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
GSYAN_DIR = os.path.join(ROOT, "data", "sources", "gsyan")
MOEDICT_PATH = os.path.join(ROOT, "data", "sources", "moedict", "dict-revised.json")
OUT_DIR = os.path.join(ROOT, "data")

PUB_MAP = {"kangxuan": "康軒", "nanyi": "南一", "hanlin": "翰林"}
PUB_KEY_MAP = {"康軒": "kangxuan", "南一": "nanyi", "翰林": "hanlin"}
GRADE_LABELS = {1: "一年級", 3: "三年級", 4: "四年級", 5: "五年級", 6: "六年級"}

DICT_URL = "https://dict.concised.moe.edu.tw/search.jsp?md=1&word="
STROKE_URL = "https://stroke-order.learningweb.moe.edu.tw/searchW.jsp?WORD="

# 聲調正規式（去聲調用於比對聲韻母）
TONE_RE = re.compile(r"[ˊˇˋ˙]")

def strip_tone(s):
    """Remove tone marks from bopomofo for base comparison."""
    return TONE_RE.sub("", s)

# 辭典查無的字（異體字或新編字），手動補資料並在 GAPS.md 註記
FALLBACK_CHARS = {
    "飢": {"bopomofo": "ㄐㄧ", "radical": "食", "strokes": 10, "all_readings": ["ㄐㄧ"]},
    "鷸": {"bopomofo": "ㄩˋ", "radical": "鳥", "strokes": 24, "all_readings": ["ㄩˋ"]},
    "据": {"bopomofo": "ㄐㄩ", "radical": "手", "strokes": 8, "all_readings": ["ㄐㄩ"]},
}


# ─────────────────────────── Check gsyan CSV snapshots ────────────────────
# 顏國雄老師試算表的授權條款未載明（原作者聲明僅供教學自學與非商業性使用），
# 15 個分頁的 CSV 快照不隨本倉庫散布；缺任何一個就停止，不得在缺檔下重寫資料檔。
GSYAN_SHEET_ID = "10Nq6prSt0s_ZI1Z1phlGEtr0MDDE1wDqEiPmnHWSM_Q"
GSYAN_SHEETS = [  # (檔名, 版本, 年級, gid)
    ("nanyi_1.csv", "南一", "一年級", 0),
    ("kangxuan_1.csv", "康軒", "一年級", 1744144778),
    ("hanlin_1.csv", "翰林", "一年級", 1165882537),
    ("nanyi_3.csv", "南一", "三年級", 1597615434),
    ("kangxuan_3.csv", "康軒", "三年級", 348763297),
    ("hanlin_3.csv", "翰林", "三年級", 1268766218),
    ("nanyi_4.csv", "南一", "四年級", 838505542),
    ("kangxuan_4.csv", "康軒", "四年級", 1959417430),
    ("hanlin_4.csv", "翰林", "四年級", 268687362),
    ("nanyi_5.csv", "南一", "五年級", 1579239165),
    ("kangxuan_5.csv", "康軒", "五年級", 269659925),
    ("hanlin_5.csv", "翰林", "五年級", 1679030270),
    ("nanyi_6.csv", "南一", "六年級", 226769020),
    ("kangxuan_6.csv", "康軒", "六年級", 1745312767),
    ("hanlin_6.csv", "翰林", "六年級", 646567073),
]


def gsyan_help(missing):
    lines = [
        "找不到顏國雄老師試算表的 CSV 快照（缺 %d 個，共 15 個）：data/sources/gsyan/" % len(missing),
        "  缺少：" + "、".join(missing),
        "",
        "這份試算表的授權條款未載明（原作者聲明僅供教學自學與非商業性使用），",
        "快照檔不隨本倉庫散布，請自行下載（下載前請先看原作者的版權聲明）：",
        "  1. 試算表：https://docs.google.com/spreadsheets/d/%s/" % GSYAN_SHEET_ID,
        "     原作者網站（版權聲明在站內頁面）：https://gsyan888.blogspot.com/p/stroke.html",
        "  2. 15 個分頁各存成一個 CSV，檔名與分頁 gid 如下（分頁 gid 也可在試算表網址的 #gid= 看到）：",
    ]
    for fn, pub, grade, gid in GSYAN_SHEETS:
        lines.append("       %-16s %s%s  gid=%d" % (fn, pub, grade, gid))
    lines += [
        "  3. 下載方式（任選一種）：",
        "     a. 瀏覽器開啟各分頁，選「檔案 → 下載 → 逗號分隔值 (.csv)」，依上表改檔名放進 data/sources/gsyan/",
        "     b. 用匯出網址，例如南一一年級：",
        "        mkdir -p data/sources/gsyan",
        '        curl -L "https://docs.google.com/spreadsheets/d/%s/export?format=csv&gid=0" -o data/sources/gsyan/nanyi_1.csv' % GSYAN_SHEET_ID,
        "        其餘分頁把 gid 換成上表的值、-o 換成上表的檔名",
        "  4. 放好 15 個檔後重新執行：python3 tools/build_grades_from_sources.py",
        "資料來源與授權說明見 data/SOURCES.md 與 README.md。",
    ]
    return "\n".join(lines)


def ensure_gsyan_csvs():
    """15 個 CSV 快照缺任何一個就印出取得方式並結束（rc=2），不寫出任何資料檔、不崩潰。"""
    missing = [fn for fn, _, _, _ in GSYAN_SHEETS if not os.path.isfile(os.path.join(GSYAN_DIR, fn))]
    if missing:
        print(gsyan_help(missing), file=sys.stderr)
        sys.exit(2)


# ─────────────────────────── Load MOE dictionary ──────────────────────────
MOEDICT_XZ_PATH = MOEDICT_PATH + ".xz"
MOEDICT_HELP = """\
找不到教育部辭典資料檔：data/sources/moedict/dict-revised.json

這份檔案採用 CC BY-ND 3.0 TW 授權，不隨本倉庫散布，請自行下載：
  1. 開啟 https://github.com/g0v/moedict-data （g0v 整理的教育部《重編國語辭典修訂本》開放資料）
  2. 下載 dict-revised.json.xz，放到 data/sources/moedict/dict-revised.json.xz
     （壓縮檔放著即可，本腳本會自動解壓；或自行解壓成 data/sources/moedict/dict-revised.json）
  3. 重新執行：python3 tools/build_grades_from_sources.py
資料來源與授權說明見 data/SOURCES.md 與 README.md。"""


def ensure_moedict_json():
    """確保 dict-revised.json 存在：已有就用；只有 .xz 就解壓；都沒有就印出下載步驟並結束（不崩潰）。"""
    if os.path.isfile(MOEDICT_PATH):
        return
    if os.path.isfile(MOEDICT_XZ_PATH):
        import lzma
        import shutil
        print(f"解壓 {os.path.relpath(MOEDICT_XZ_PATH, ROOT)} → {os.path.relpath(MOEDICT_PATH, ROOT)} ...", flush=True)
        with lzma.open(MOEDICT_XZ_PATH, "rb") as src, open(MOEDICT_PATH, "wb") as dst:
            shutil.copyfileobj(src, dst)
        return
    print(MOEDICT_HELP, file=sys.stderr)
    sys.exit(2)


def load_moedict():
    """Load dict-revised.json.
    Reading selection uses frequency analysis from multi-char dictionary entries:
    for each char, count toneless readings across all words where len(word)==len(syllables),
    then pick the heteronym whose toneless form matches the most frequent base.
    """
    ensure_moedict_json()
    print("Loading MOE dictionary...", end=" ", flush=True)
    with open(MOEDICT_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # ── Pass 1: Build frequency tables from all multi-char entries ──
    # freq[char] = Counter of toneless readings (for base selection)
    # freq_toned[char] = Counter of full readings with tones (for tone selection)
    freq = {}
    freq_toned = {}
    for entry in raw:
        title = entry.get("title", "")
        if len(title) < 2:
            continue
        for h in entry.get("heteronyms", []):
            bpmf = h.get("bopomofo", "").replace("\u3000", " ").strip()
            syls = bpmf.split()
            if len(syls) != len(title):
                continue
            for ch, syl in zip(title, syls):
                if ch not in freq:
                    freq[ch] = Counter()
                    freq_toned[ch] = Counter()
                freq[ch][strip_tone(syl)] += 1
                freq_toned[ch][syl] += 1

    # ── Pass 2: Build char_db and word_db ──
    char_db = {}  # char → {bopomofo, radical, strokes, all_readings}
    word_db = {}  # for vocabulary lookup

    for entry in raw:
        title = entry.get("title", "")
        if not title:
            continue

        # Single character entries
        if len(title) == 1:
            radical = entry.get("radical", "").strip()
            stroke_count = entry.get("stroke_count")
            heteronyms = entry.get("heteronyms", [])
            all_readings = [
                re.sub(r"（.*?）", "", h.get("bopomofo", "")).strip()
                for h in heteronyms if h.get("bopomofo")
            ]

            if all_readings and radical and stroke_count:
                # Pick reading based on frequency analysis
                bopomofo = _pick_best_reading(title, all_readings, freq, freq_toned)
                char_db[title] = {
                    "bopomofo": bopomofo,
                    "radical": radical,
                    "strokes": int(stroke_count),
                    "all_readings": all_readings,
                }

        # Words (2+ chars) → for vocabulary selection
        if len(title) >= 2:
            heteronyms = entry.get("heteronyms", [])
            if heteronyms:
                bpmf = heteronyms[0].get("bopomofo", "")
                if bpmf:
                    word_db[title] = {
                        "bopomofo": bpmf,
                    }

    # Add fallback chars not in the dictionary
    for ch, info in FALLBACK_CHARS.items():
        if ch not in char_db:
            char_db[ch] = info

    print(f"done ({len(char_db)} chars, {len(word_db)} words)")
    return char_db, word_db, freq_toned


def _pick_best_reading(char, all_readings, freq, freq_toned):
    """Pick the best reading for a character based on dictionary word frequency.

    Strategy:
      1. Find the most common toneless base from freq[char].
      2. Use freq_toned[char] to find the most common FULL reading (with tone)
         that matches that base. Skip neutral-tone (˙) candidates unless the
         base only appears as neutral-tone in heteronyms.
      3. The chosen reading must exist in all_readings (heteronyms).
      4. If no match, fall back to first reading.
    """
    cnt = freq.get(char)
    cnt_toned = freq_toned.get(char)

    if not cnt:
        return all_readings[0]

    # Find the most common toneless base
    top_base, _ = cnt.most_common(1)[0]

    # Find heteronyms matching this base
    matching = [r for r in all_readings if strip_tone(r) == top_base]
    if not matching:
        return all_readings[0]

    # If only one heteronym matches this base, use it directly
    if len(matching) == 1:
        return matching[0]

    # Multiple heteronyms with same base but different tones:
    # use toned frequency to pick the best one
    if cnt_toned:
        # Among matching heteronyms, pick the one with highest toned frequency
        # First try non-neutral-tone
        non_neutral = [r for r in matching if "˙" not in r]
        if non_neutral:
            best = max(non_neutral, key=lambda r: cnt_toned.get(r, 0))
            return best
        # All matching are neutral-tone, pick the most frequent
        best = max(matching, key=lambda r: cnt_toned.get(r, 0))
        return best

    return matching[0]


# ─────────────────────────── Parse CSV snapshots ──────────────────────────
def parse_gsyan_csv(filepath):
    """Parse a gsyan CSV file into list of (lesson_code, lesson_no, label, chars_list).

    Rows with L-codes (e.g. L00, L01) get lesson_no = that number.
    Rows without L-codes (e.g. #數字, #魔法) are foundation units;
    they get negative lesson_no (-2, -1, …) to sort before L00,
    and their label is taken from the tag (e.g. '數字', '魔法').
    """
    lessons = []
    foundation_rows = []  # collected first, then assigned negative numbers
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 2:
                continue
            code = row[0].strip()
            chars_str = row[1].strip()
            if not chars_str:
                continue
            # Try L-code pattern first: 115#pub#GradeDir#Lxx
            m = re.match(
                r"115[#](南一|康軒|翰林)[#]\d上筆順[#]L(\d+)", code
            )
            if m:
                lesson_no = int(m.group(2))
                chars = list(chars_str)
                lessons.append((code, lesson_no, f"第{lesson_no}課", chars))
                continue
            # Non-L-code data row: 115#pub#GradeDir#label
            m2 = re.match(
                r"115[#](南一|康軒|翰林)[#]\d上筆順[#](.+)", code
            )
            if m2:
                label = m2.group(2).strip()
                chars = list(chars_str)
                foundation_rows.append((code, label, chars))

    # Assign negative lesson numbers to foundation rows, preserving source order
    n = len(foundation_rows)
    for i, (code, label, chars) in enumerate(foundation_rows):
        lesson_no = -(n - i)  # -2, -1 for 2 rows
        lessons.insert(i, (code, lesson_no, label, chars))

    return lessons


# ─────────────────────────── Build vocabulary ─────────────────────────────
def pick_words_for_lesson(lesson_chars, char_db, word_db, all_grade_chars=None, max_words=6):
    """Pick words from the dictionary that contain characters from this lesson.

    Filters:
    - Word reading for each lesson char must match (toneless) the char's bopomofo.
    - Avoid reduplication words (same char twice, like 粥粥).
    - Prefer words where the other char is also a grade-level char.
    """
    char_set = set(lesson_chars)
    # Build lesson char readings for consistency check (both full and toneless)
    char_readings_full = {}  # full reading with tone
    char_readings_base = {}  # toneless
    for ch in lesson_chars:
        info = char_db.get(ch)
        if info:
            char_readings_full[ch] = info["bopomofo"]
            char_readings_base[ch] = strip_tone(info["bopomofo"])

    candidates = []

    for word, info in word_db.items():
        # Only 2-char words
        if len(word) != 2:
            continue
        word_chars = set(word)
        # Skip reduplication (same char twice)
        if len(word_chars) == 1:
            continue
        # Word must contain at least one lesson character
        overlap = word_chars & char_set
        if not overlap:
            continue

        bpmf = info["bopomofo"].strip()
        bpmf_parts = bpmf.split()
        if len(bpmf_parts) != len(word):
            continue

        # Check that word's reading for lesson chars is consistent
        # (both toneless base AND tone, excluding neutral-tone syllables)
        consistent = True
        for i, ch in enumerate(word):
            if ch in char_readings_base:
                word_syl = bpmf_parts[i]
                word_syl_base = strip_tone(word_syl)
                # Check toneless base
                if word_syl_base != char_readings_base[ch]:
                    consistent = False
                    break
                # Check tone (skip if word syllable is neutral tone)
                if "˙" not in word_syl and "˙" not in char_readings_full[ch]:
                    if word_syl != char_readings_full[ch]:
                        consistent = False
                        break
        if not consistent:
            continue

        # Score
        score = len(overlap) / len(word_chars)
        # Bonus if other char is also a grade-level char
        if all_grade_chars:
            other_chars = word_chars - char_set
            if other_chars and other_chars <= all_grade_chars:
                score += 0.3
        candidates.append((score, word, bpmf, bpmf_parts))

    # Sort by score descending, take top N
    candidates.sort(key=lambda x: (-x[0], x[1]))
    selected = []
    used_chars = set()
    for score, word, bpmf, bpmf_parts in candidates:
        if len(selected) >= max_words:
            break
        word_chars = set(word)
        new_chars = word_chars & char_set - used_chars
        if new_chars or len(selected) < 3:
            selected.append({
                "word": word,
                "bopomofo": bpmf,
                "bopomofoArray": bpmf_parts,
                "moeDictUrl": DICT_URL + word,
            })
            used_chars |= word_chars & char_set

    return selected


# ─────────────────────────── Build grade JSON ─────────────────────────────
def build_grade_json(grade, char_db, word_db, gaps, all_grade_chars, freq_toned):
    """Build the complete JSON for one grade from all three publishers."""
    publishers = OrderedDict()
    grade_label = GRADE_LABELS[grade]

    for pub_key in ["kangxuan", "hanlin", "nanyi"]:
        csv_path = os.path.join(GSYAN_DIR, f"{pub_key}_{grade}.csv")
        if not os.path.exists(csv_path):
            print(f"  ⚠ {csv_path} not found, skipping")
            continue

        lessons_raw = parse_gsyan_csv(csv_path)
        pub_name = PUB_MAP[pub_key]
        lessons = []

        for code, lesson_no, label, chars in lessons_raw:
            char_entries = []
            for ch in chars:
                info = char_db.get(ch)
                if info:
                    # 依據辭典詞頻建立讀音清單與多音字標記
                    cnt = freq_toned.get(ch)
                    if cnt and sum(cnt.values()) > 0:
                        total_count = sum(cnt.values())
                        top_reading, top_count = cnt.most_common(1)[0]
                        ambiguous = (top_count / total_count) < 0.85
                        readings = [
                            {"reading": r, "ratio": round(c / total_count, 2)}
                            for r, c in cnt.most_common(4)
                        ]
                    else:
                        ambiguous = False
                        readings = [{"reading": info["bopomofo"], "ratio": 1.0}]

                    entry = {
                        "char": ch,
                        "bopomofo": info["bopomofo"],
                        "radical": info["radical"],
                        "strokes": info["strokes"],
                        "moeDictUrl": DICT_URL + ch,
                        "moeStrokeUrl": STROKE_URL + ch,
                        "readings": readings,
                        "ambiguous": ambiguous,
                    }
                    # Note multi-reading chars
                    if len(info.get("all_readings", [])) > 1:
                        gaps.append(
                            f"{grade_label} {pub_name} L{lesson_no:02d} 「{ch}」"
                            f"為多音字（{', '.join(info['all_readings'])}），"
                            f"取辭典最常見讀音「{info['bopomofo']}」"
                        )
                    char_entries.append(entry)
                else:
                    # Character not found in dictionary
                    gaps.append(
                        f"{grade_label} {pub_name} L{lesson_no:02d} 「{ch}」"
                        f"在教育部辭典開放資料中查無此字"
                    )
                    char_entries.append({
                        "char": ch,
                        "bopomofo": "",
                        "radical": "",
                        "strokes": 0,
                        "moeDictUrl": DICT_URL + ch,
                        "moeStrokeUrl": STROKE_URL + ch,
                    })

            # Pick words from dictionary (reading-consistent, no reduplication)
            words = pick_words_for_lesson(chars, char_db, word_db, all_grade_chars)

            lessons.append({
                "lessonNo": lesson_no,
                "title": label,
                "characters": char_entries,
                "words": words,
            })

        publishers[pub_key] = {
            "name": pub_name,
            "lessons": lessons,
        }

    # Build full JSON
    semester_code = f"{grade}a"
    result = {
        "meta": {
            "id": f"zh-curriculum-115-1-g{grade}",
            "title": f"115學年度上學期國小{grade_label}國語生字資料庫",
            "grade": grade_label,
            "academicYear": 115,
            "semester": "上學期",
            "semesterCode": semester_code,
            "semesterStart": "2026-08-31",
            "sourceType": "official_curriculum",
            "editionNote": "115學年度官方課次生字索引",
            "licenseNotes": (
                "生字清單取材自顏國雄老師公開試算表（授權條款未載明；原作者聲明僅供教學自學與非商業性使用），"
                "其生字清單原始出處為中研院語言學研究所『生字表字詞資料庫』等；"
                "注音、部首、筆畫取自 g0v/moedict-data（教育部國語辭典重編本，CC BY-ND 3.0 TW）；"
                "語詞從辭典詞條中挑選含本課生字且讀音一致者。"
            ),
            "wordsSource": "moedict-data/dict-revised.json (filtered by lesson chars, reading-consistent)",
            "charSource": "gsyan888 Google Spreadsheet CSV snapshot (115-1)",
            "moeDictUrlTemplate": DICT_URL + "{word}",
            "moeStrokeUrlTemplate": STROKE_URL + "{word}",
        },
        "publishers": publishers,
    }
    return result


# ─────────────────────────── Main ─────────────────────────────────────────
def main():
    print("=" * 60)
    print("  build_grades_from_sources.py")
    print("  從顏國雄老師 CSV + 教育部辭典開放資料重建年級 JSON")
    print("=" * 60)

    # 先確認 15 個 CSV 快照都在（缺檔就印取得方式後結束，不會改寫任何資料檔）
    ensure_gsyan_csvs()

    # Load dictionary
    char_db, word_db, freq_toned = load_moedict()

    # Collect all grade-level chars across all grades for word scoring
    all_grade_chars = set()
    grades = [1, 3, 4, 5, 6]
    for grade in grades:
        for pub_key in ["kangxuan", "hanlin", "nanyi"]:
            csv_path = os.path.join(GSYAN_DIR, f"{pub_key}_{grade}.csv")
            if os.path.exists(csv_path):
                for _, _, _, chars in parse_gsyan_csv(csv_path):
                    all_grade_chars.update(chars)

    all_gaps = []

    for grade in grades:
        print(f"\n--- 建立{GRADE_LABELS[grade]}資料 ---")
        grade_gaps = []
        result = build_grade_json(grade, char_db, word_db, grade_gaps, all_grade_chars, freq_toned)
        all_gaps.extend(grade_gaps)

        # Write JSON
        out_path = os.path.join(OUT_DIR, f"curriculum-115-1-g{grade}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        # Stats
        total_chars = 0
        total_words = 0
        for pk, pv in result["publishers"].items():
            n_lessons = len(pv["lessons"])
            n_chars = sum(len(l["characters"]) for l in pv["lessons"])
            n_words = sum(len(l["words"]) for l in pv["lessons"])
            total_chars += n_chars
            total_words += n_words
            print(f"  {pv['name']}: {n_lessons} 課 / {n_chars} 字 / {n_words} 詞")
        print(f"  合計：{total_chars} 字 / {total_words} 詞")

        sz = os.path.getsize(out_path)
        print(f"  寫入：{out_path} ({sz:,} bytes)")

        if grade_gaps:
            print(f"  ⚠ {len(grade_gaps)} 個缺口（見 GAPS.md）")

    # Summary
    print(f"\n共 {len(all_gaps)} 個缺口")
    if all_gaps:
        print("前 10 項：")
        for g in all_gaps[:10]:
            print(f"  • {g}")

    return all_gaps


if __name__ == "__main__":
    gaps = main()
    critical = [g for g in gaps if "查無此字" in g]
    if critical:
        print(f"\n⚠ {len(critical)} 個字在辭典中查無資料！")
    print("\n✅ 完成")
