#!/usr/bin/env python3
"""從本機教材資料產生可重現的離線注音練習題。"""

import argparse
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


def parse_args():
    parser = argparse.ArgumentParser(description="產生離線國語注音練習題。")
    parser.add_argument(
        "--grade", type=int, choices=sorted(GRADE_FILES), default=2,
        help="年級，1 到 6（預設：2）。",
    )
    parser.add_argument(
        "--publisher", choices=list(PUBLISHER_NAMES), default="kangxuan",
        help="出版社代碼（預設：kangxuan）。",
    )
    parser.add_argument(
        "--lesson", type=int, default=1, help="目標課次（預設：1）。",
    )
    parser.add_argument(
        "--scope", choices=["lesson", "all-taught"], default="lesson",
        help="只取本課，或取本課以前已教內容（預設：lesson）。",
    )
    parser.add_argument(
        "--count", type=int, default=5, help="題數（預設：5）。",
    )
    parser.add_argument(
        "--seed", type=int, default=2026, help="抽題種子（預設：2026）。",
    )
    parser.add_argument(
        "--format", dest="output_format", choices=["markdown", "json"],
        default="markdown", help="輸出格式（預設：markdown）。",
    )
    parser.add_argument(
        "--student-only", action="store_true", help="不輸出答案。",
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


def collect_questions(lessons):
    questions = []
    seen_targets = set()

    for lesson in lessons:
        for word in lesson.get("words", []):
            target = word.get("word")
            answer = word_bopomofo(word)
            if not isinstance(target, str) or not target or not answer:
                continue
            if target in seen_targets:
                continue
            seen_targets.add(target)
            questions.append(
                {
                    "type": "word",
                    "target": target,
                    "question": f"請寫出詞語「{target}」的注音（依序標示每一字）。",
                    "answer": answer,
                    "lessonNo": lesson.get("lessonNo"),
                }
            )

        for character in lesson.get("characters", []):
            target = character.get("char")
            answer = character.get("bopomofo")
            if not isinstance(target, str) or not target or not answer:
                continue
            if target in seen_targets:
                continue
            seen_targets.add(target)
            questions.append(
                {
                    "type": "character",
                    "target": target,
                    "question": f"請寫出「{target}」的注音。",
                    "answer": answer,
                    "lessonNo": lesson.get("lessonNo"),
                }
            )

    return questions


def markdown_text(value):
    return str(value).replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")


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
    lessons = publisher.get("lessons")
    if not isinstance(lessons, list) or not lessons:
        return fail("出版社資料沒有可用的單元")

    target_lesson = next(
        (
            lesson
            for lesson in lessons
            if isinstance(lesson, dict) and lesson.get("lessonNo") == args.lesson
        ),
        None,
    )
    if target_lesson is None:
        available = ", ".join(str(lesson.get("lessonNo")) for lesson in lessons)
        return fail(f"找不到課次 {args.lesson}；可用課次：{available}")

    if args.scope == "all-taught":
        selected_lessons = [
            lesson
            for lesson in lessons
            if isinstance(lesson, dict)
            and isinstance(lesson.get("lessonNo"), int)
            and lesson["lessonNo"] <= args.lesson
        ]
    else:
        selected_lessons = [target_lesson]

    pool = collect_questions(selected_lessons)
    if len(pool) < args.count:
        return fail(
            f"可用題目只有 {len(pool)} 題，少於要求的 {args.count} 題；"
            "請降低 --count 或改用其他範圍。"
        )

    selected = random.Random(args.seed).sample(pool, args.count)
    meta = data.get("meta", {})
    source = {
        "title": meta.get("title"),
        "grade": meta.get("grade"),
        "publisher": publisher.get("name", PUBLISHER_NAMES[args.publisher]),
        "lesson": args.lesson,
        "scope": args.scope,
        "seed": args.seed,
    }

    if args.output_format == "json":
        payload = {
            "source": source,
            "questions": [
                {
                    "id": index,
                    "type": item["type"],
                    "target": item["target"],
                    "question": item["question"],
                    "answer": None if args.student_only else item["answer"],
                    "lessonNo": item["lessonNo"],
                }
                for index, item in enumerate(selected, start=1)
            ],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    print("# 國語生字注音練習")
    print()
    print(
        f"- 教材：{source['title']}／{source['grade']}／{source['publisher']}"
    )
    print(f"- 範圍：第 {args.lesson} 課（{args.scope}）")
    print(f"- 抽題種子：{args.seed}")
    print()
    print("## 題目")
    print()
    for index, item in enumerate(selected, start=1):
        print(f"{index}. {markdown_text(item['question'])}")

    if not args.student_only:
        print()
        print("## 答案")
        print()
        for index, item in enumerate(selected, start=1):
            print(
                f"{index}. {markdown_text(item['target'])} → "
                f"{markdown_text(item['answer'])}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
