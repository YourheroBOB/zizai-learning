#!/usr/bin/env python3
"""離線瀏覽字在教材資料，不修改任何檔案，也不連線。"""

import argparse
import json
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
    parser = argparse.ArgumentParser(
        description="離線列出字在的課程單元、生字與語詞。"
    )
    parser.add_argument(
        "--grade",
        type=int,
        choices=sorted(GRADE_FILES),
        default=2,
        help="年級，1 到 6（預設：2）。",
    )
    parser.add_argument(
        "--publisher",
        choices=list(PUBLISHER_NAMES),
        default="kangxuan",
        help="出版社代碼（預設：kangxuan）。",
    )
    parser.add_argument(
        "--lesson",
        type=int,
        help="要顯示的課次；省略時只顯示單元概況。",
    )
    parser.add_argument(
        "--words",
        action="store_true",
        help="同時顯示語詞與逐字注音。",
    )
    parser.add_argument(
        "--json",
        dest="as_json",
        action="store_true",
        help="輸出 JSON。",
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


def character_line(character):
    char = character.get("char", "")
    bopomofo = character.get("bopomofo", "")
    radical = character.get("radical", "")
    strokes = character.get("strokes")
    details = []
    if bopomofo:
        details.append(f"注音 {bopomofo}")
    if radical:
        details.append(f"部首 {radical}")
    if isinstance(strokes, int):
        details.append(f"{strokes} 畫")
    suffix = f"（{'，'.join(details)}）" if details else ""
    return f"{char}{suffix}"


def lesson_label(lesson):
    number = lesson.get("lessonNo")
    title = lesson.get("title", "")
    if isinstance(number, int) and number < 0:
        return f"前導單元｜{title}"
    return f"第 {number} 課｜{title}"


def json_unit(lesson):
    return {
        "lessonNo": lesson.get("lessonNo"),
        "title": lesson.get("title"),
        "characters": lesson.get("characters", []),
        "words": lesson.get("words", []),
    }


def main():
    args = parse_args()
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

    if args.lesson is None:
        selected = lessons
    else:
        selected = [
            lesson
            for lesson in lessons
            if isinstance(lesson, dict) and lesson.get("lessonNo") == args.lesson
        ]
        if not selected:
            available = ", ".join(str(lesson.get("lessonNo")) for lesson in lessons)
            return fail(f"找不到課次 {args.lesson}；可用課次：{available}")

    meta = data.get("meta", {})
    publisher_name = publisher.get("name", PUBLISHER_NAMES[args.publisher])

    if args.as_json:
        payload = {
            "meta": {
                "id": meta.get("id"),
                "title": meta.get("title"),
                "grade": meta.get("grade"),
                "academicYear": meta.get("academicYear"),
                "semester": meta.get("semester"),
            },
            "publisher": {
                "key": args.publisher,
                "name": publisher_name,
                "totalLessons": publisher.get("totalLessons"),
            },
            "units": [json_unit(lesson) for lesson in selected],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    print(f"教材：{meta.get('title', GRADE_FILES[args.grade])}")
    print(
        f"年級：{meta.get('grade', args.grade)}　"
        f"版本：{publisher_name}　單元數：{len(lessons)}"
    )

    if args.lesson is None:
        print("\n單元概況：")
        for lesson in lessons:
            characters = lesson.get("characters", [])
            words = lesson.get("words", [])
            print(
                f"- {lesson_label(lesson)}："
                f"{len(characters)} 個生字、{len(words)} 組語詞"
            )
        return 0

    for lesson in selected:
        characters = lesson.get("characters", [])
        words = lesson.get("words", [])
        print(f"\n{lesson_label(lesson)}")
        print(f"生字（{len(characters)}）：")
        if characters:
            for index, character in enumerate(characters, start=1):
                print(f"  {index:>2}. {character_line(character)}")
        else:
            print("  （無）")

        if args.words:
            print(f"語詞（{len(words)}）：")
            if words:
                for index, word in enumerate(words, start=1):
                    text = word.get("word", "")
                    print(f"  {index:>2}. {text}（{word_bopomofo(word)}）")
            else:
                print("  （無）")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
