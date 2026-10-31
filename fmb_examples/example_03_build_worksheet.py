#!/usr/bin/env python3
"""建立完全離線、可直接列印的 A4 學生卷與答案卷 HTML。"""

import argparse
import html
import json
import random
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GRADE_FILES = {
    1: "curriculum-115-1-g1.json",
    2: "curriculum-115-1.json",
    3: "curriculum-115-1-g3.json",
    4: "curriculum-115-1-g4.json",
    5: "curriculum-115-1-g5.json",
    6: "curriculum-115-1-g6.json",
}
PUBLISHER_NAMES = {
    "kangxuan": "康軒",
    "hanlin": "翰林",
    "nanyi": "南一",
}

STYLE = """
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #1f1b14;
  background: #f3ede0;
  font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  line-height: 1.7;
}
.page {
  width: 210mm;
  min-height: 297mm;
  margin: 12mm auto;
  padding: 15mm 16mm;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, .12);
  display: flex;
  flex-direction: column;
}
.answer-page { break-before: page; page-break-before: always; }
h1 { margin: 0 0 3mm; text-align: center; font-size: 24pt; }
h2 { margin: 0 0 4mm; text-align: center; font-size: 16pt; font-weight: 500; }
.meta { text-align: center; color: #55503f; margin-bottom: 8mm; }
.fields { display: flex; gap: 12mm; margin-bottom: 8mm; }
.field { min-width: 42mm; border-bottom: 1px solid #333; }
.instructions { border: 1px solid #aaa; padding: 4mm; margin-bottom: 8mm; }
.questions { margin: 0; padding-left: 8mm; }
.questions li { margin-bottom: 10mm; break-inside: avoid; font-size: 14pt; }
.answer-line {
  display: inline-block;
  width: 70mm;
  margin-left: 5mm;
  border-bottom: 1px solid #333;
  min-height: 1.5em;
}
.answer-list { margin: 0; padding-left: 8mm; }
.answer-list li { margin-bottom: 7mm; break-inside: avoid; font-size: 15pt; }
.footer { margin-top: auto; padding-top: 5mm; border-top: 1px solid #ccc; color: #555; font-size: 9pt; }
@media print {
  body { background: #fff; }
  .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
}
""".strip()


def parse_args():
    parser = argparse.ArgumentParser(description="產生完全離線的 A4 考卷 HTML。")
    parser.add_argument(
        "--grade", type=int, choices=sorted(GRADE_FILES), default=2,
        help="年級，1 到 6（預設：2）。",
    )
    parser.add_argument(
        "--publisher", choices=list(PUBLISHER_NAMES), default="kangxuan",
        help="出版社代碼（預設：kangxuan）。",
    )
    parser.add_argument(
        "--lesson", type=int, default=1, help="課次（預設：1）。",
    )
    parser.add_argument(
        "--count", type=int, default=8, help="題數（預設：8）。",
    )
    parser.add_argument(
        "--seed", type=int, default=2026, help="抽題種子（預設：2026）。",
    )
    return parser.parse_args()


def fail(message):
    print(f"範例失敗：{message}", file=sys.stderr)
    return 2


def load_data(grade):
    path = ROOT / "data" / GRADE_FILES[grade]
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def word_bopomofo(word):
    value = word.get("bopomofo")
    if isinstance(value, str) and value.strip():
        return value.strip()
    syllables = word.get("bopomofoArray")
    if isinstance(syllables, list):
        return " ".join(str(item) for item in syllables)
    return ""


def collect_pool(lesson):
    pool = []
    seen = set()

    for word in lesson.get("words", []):
        target = word.get("word")
        answer = word_bopomofo(word)
        if not isinstance(target, str) or not target or not answer or target in seen:
            continue
        seen.add(target)
        pool.append(
            {
                "type": "word",
                "target": target,
                "answer": answer,
                "question": f"請寫出詞語「{target}」的注音（依序標示每一字）。",
            }
        )

    for character in lesson.get("characters", []):
        target = character.get("char")
        answer = character.get("bopomofo")
        if not isinstance(target, str) or not target or not answer or target in seen:
            continue
        seen.add(target)
        pool.append(
            {
                "type": "character",
                "target": target,
                "answer": answer,
                "question": f"請寫出「{target}」的注音。",
            }
        )

    return pool


def escape(value):
    return html.escape(str(value), quote=True)


def main():
    args = parse_args()
    if args.count < 1:
        return fail("--count 必須至少為 1")

    try:
        data = load_data(args.grade)
    except (OSError, json.JSONDecodeError) as exc:
        return fail(f"無法讀取 {GRADE_FILES[args.grade]}：{exc}")

    publishers = data.get("publishers")
    if not isinstance(publishers, dict) or args.publisher not in publishers:
        return fail(f"找不到出版社 {args.publisher}")

    publisher = publishers[args.publisher]
    lesson = next(
        (
            item
            for item in publisher.get("lessons", [])
            if isinstance(item, dict) and item.get("lessonNo") == args.lesson
        ),
        None,
    )
    if lesson is None:
        return fail(f"找不到課次 {args.lesson}")

    pool = collect_pool(lesson)
    if not pool:
        return fail("這個單元沒有可用的生字或語詞題目")

    count = min(args.count, len(pool))
    if count < args.count:
        print(
            f"提示：此課只有 {len(pool)} 個可用題目，題數已縮減為 {count}。",
            file=sys.stderr,
        )
    questions = random.Random(args.seed).sample(pool, count)

    meta = data.get("meta", {})
    publisher_name = publisher.get("name", PUBLISHER_NAMES[args.publisher])
    grade_name = meta.get("grade", f"{args.grade} 年級")
    unit_title = lesson.get("title", f"第 {args.lesson} 課")
    document_title = f"{grade_name}國語生字小考"

    question_html = "\n".join(
        f"      <li>{escape(item['question'])}"
        "<span class=\"answer-line\" aria-label=\"作答處\"></span></li>"
        for item in questions
    )
    answer_html = "\n".join(
        f"      <li><strong>{escape(item['target'])}</strong>："
        f"{escape(item['answer'])}</li>"
        for item in questions
    )

    document = f"""<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>{escape(document_title)}</title>
  <style>{STYLE}</style>
</head>
<body>
  <!-- Generated locally. This document has no external resources. -->
  <section class="page" aria-label="學生卷">
    <h1>{escape(document_title)}</h1>
    <h2>{escape(publisher_name)}版・{escape(unit_title)}</h2>
    <p class="meta">{escape(meta.get('title', ''))}</p>
    <div class="fields" aria-label="填寫資料">
      <div class="field">姓名</div>
      <div class="field">日期</div>
      <div class="field">得分</div>
    </div>
    <div class="instructions">請依題目提示寫出正確的注音；詞語題須依序寫出每一字的注音。</div>
    <ol class="questions">
{question_html}
    </ol>
    <div class="footer">離線練習卷・可重複使用</div>
  </section>

  <section class="page answer-page" aria-label="答案卷">
    <h1>{escape(document_title)}</h1>
    <h2>答案卷・{escape(publisher_name)}版・{escape(unit_title)}</h2>
    <p class="meta">共 {count} 題</p>
    <ol class="answer-list">
{answer_html}
    </ol>
    <div class="footer">離線練習卷・答案頁</div>
  </section>
</body>
</html>
"""
    sys.stdout.write(document)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
