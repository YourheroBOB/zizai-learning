#!/usr/bin/env python3
"""使用 Python 標準函式庫離線驗證字在教材資料。"""

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_FILES = [
    "curriculum-115-1-g1.json",
    "curriculum-115-1.json",
    "curriculum-115-1-g3.json",
    "curriculum-115-1-g4.json",
    "curriculum-115-1-g5.json",
    "curriculum-115-1-g6.json",
]
REQUIRED_PUBLISHERS = ("kangxuan", "hanlin", "nanyi")


def is_integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate_dataset(path):
    errors = []
    stats = {
        "publishers": 0,
        "lessons": 0,
        "characters": 0,
        "words": 0,
        "sentences": 0,
    }

    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        return [f"無法讀取或解析 JSON：{exc}"], stats

    if not isinstance(data, dict):
        return ["最外層必須是物件"], stats

    for field in ("meta", "publishers"):
        if field not in data:
            errors.append(f"缺少必要頂層欄位 {field}")

    meta = data.get("meta")
    if isinstance(meta, dict):
        for field in ("id", "title", "sourceType", "editionNote", "licenseNotes"):
            if not isinstance(meta.get(field), str) or not meta.get(field, "").strip():
                errors.append(f"meta.{field} 必須是非空字串")
    elif "meta" in data:
        errors.append("meta 必須是物件")

    publishers = data.get("publishers")
    if not isinstance(publishers, dict):
        if "publishers" in data:
            errors.append("publishers 必須是物件")
        return errors, stats

    for publisher_key in REQUIRED_PUBLISHERS:
        if publisher_key not in publishers:
            errors.append(f"缺少出版社 {publisher_key}")

    for publisher_key, publisher in publishers.items():
        if not isinstance(publisher, dict):
            errors.append(f"publishers.{publisher_key} 必須是物件")
            continue

        stats["publishers"] += 1
        if not isinstance(publisher.get("name"), str) or not publisher.get("name", "").strip():
            errors.append(f"{publisher_key}.name 必須是非空字串")

        lessons = publisher.get("lessons")
        if not isinstance(lessons, list):
            errors.append(f"{publisher_key}.lessons 必須是陣列")
            continue

        total_lessons = publisher.get("totalLessons")
        if not is_integer(total_lessons):
            errors.append(f"{publisher_key}.totalLessons 必須是整數")
        elif total_lessons != len(lessons):
            errors.append(
                f"{publisher_key}.totalLessons={total_lessons}，"
                f"但實際有 {len(lessons)} 個單元"
            )

        seen_lesson_numbers = set()
        for lesson_index, lesson in enumerate(lessons):
            prefix = f"{publisher_key}.lessons[{lesson_index}]"
            if not isinstance(lesson, dict):
                errors.append(f"{prefix} 必須是物件")
                continue

            stats["lessons"] += 1
            lesson_number = lesson.get("lessonNo")
            if not is_integer(lesson_number):
                errors.append(f"{prefix}.lessonNo 必須是整數")
            elif lesson_number in seen_lesson_numbers:
                errors.append(f"{prefix}.lessonNo={lesson_number} 重複")
            else:
                seen_lesson_numbers.add(lesson_number)

            if not isinstance(lesson.get("title"), str) or not lesson.get("title", "").strip():
                errors.append(f"{prefix}.title 必須是非空字串")

            characters = lesson.get("characters")
            if not isinstance(characters, list):
                errors.append(f"{prefix}.characters 必須是陣列")
            else:
                for character_index, character in enumerate(characters):
                    char_prefix = f"{prefix}.characters[{character_index}]"
                    stats["characters"] += 1
                    if not isinstance(character, dict):
                        errors.append(f"{char_prefix} 必須是物件")
                        continue

                    value = character.get("char")
                    if not isinstance(value, str) or len(value) != 1:
                        errors.append(f"{char_prefix}.char 必須是單一字元")
                    value = character.get("bopomofo")
                    if not isinstance(value, str) or not value.strip():
                        errors.append(f"{char_prefix}.bopomofo 必須是非空字串")
                    if not isinstance(character.get("radical"), str):
                        errors.append(f"{char_prefix}.radical 必須是字串")
                    if not is_integer(character.get("strokes")) or character.get("strokes", 0) <= 0:
                        errors.append(f"{char_prefix}.strokes 必須是大於 0 的整數")

                    if "readings" in character and not isinstance(character["readings"], list):
                        errors.append(f"{char_prefix}.readings 必須是陣列")
                    if "ambiguous" in character and not isinstance(character["ambiguous"], bool):
                        errors.append(f"{char_prefix}.ambiguous 必須是布林值")

            words = lesson.get("words")
            if not isinstance(words, list):
                errors.append(f"{prefix}.words 必須是陣列")
            else:
                for word_index, word in enumerate(words):
                    word_prefix = f"{prefix}.words[{word_index}]"
                    stats["words"] += 1
                    if not isinstance(word, dict):
                        errors.append(f"{word_prefix} 必須是物件")
                        continue

                    text = word.get("word")
                    if not isinstance(text, str) or not text:
                        errors.append(f"{word_prefix}.word 必須是非空字串")

                    syllables = word.get("bopomofoArray")
                    if not isinstance(syllables, list):
                        errors.append(f"{word_prefix}.bopomofoArray 必須是陣列")
                    else:
                        if any(not isinstance(item, str) or not item for item in syllables):
                            errors.append(f"{word_prefix}.bopomofoArray 不得含空白音節")
                        if isinstance(text, str) and len(syllables) != len(list(text)):
                            errors.append(
                                f"{word_prefix}.bopomofoArray 長度 {len(syllables)} "
                                f"與詞語字數 {len(list(text))} 不符"
                            )

                    if "bopomofo" in word:
                        joined = word.get("bopomofo")
                        if not isinstance(joined, str):
                            errors.append(f"{word_prefix}.bopomofo 必須是字串")
                        elif isinstance(syllables, list):
                            left = " ".join(joined.split())
                            right = " ".join(str(item) for item in syllables)
                            if left != right:
                                errors.append(
                                    f"{word_prefix}.bopomofo 與 bopomofoArray 連接結果不一致"
                                )

            sentences = lesson.get("sentences", [])
            if not isinstance(sentences, list):
                errors.append(f"{prefix}.sentences 必須是陣列")
            else:
                for sentence_index, sentence in enumerate(sentences):
                    sentence_prefix = f"{prefix}.sentences[{sentence_index}]"
                    stats["sentences"] += 1
                    if not isinstance(sentence, dict):
                        errors.append(f"{sentence_prefix} 必須是物件")
                        continue
                    if not isinstance(sentence.get("text"), str) or not sentence.get("text", "").strip():
                        errors.append(f"{sentence_prefix}.text 必須是非空字串")
                    target = sentence.get("target")
                    if not isinstance(target, str) or not target:
                        errors.append(f"{sentence_prefix}.target 必須是非空字串")
                    syllables = sentence.get("bopomofoArray")
                    if not isinstance(syllables, list):
                        errors.append(f"{sentence_prefix}.bopomofoArray 必須是陣列")
                    elif isinstance(target, str) and len(syllables) != len(list(target)):
                        errors.append(
                            f"{sentence_prefix}.bopomofoArray 長度與 target 字數不符"
                        )

    return errors, stats


def main():
    all_errors = []
    totals = {
        "publishers": 0,
        "lessons": 0,
        "characters": 0,
        "words": 0,
        "sentences": 0,
    }

    for filename in DATA_FILES:
        path = ROOT / "data" / filename
        errors, stats = validate_dataset(path)
        for key in totals:
            totals[key] += stats[key]

        if errors:
            print(f"FAIL {filename}：{len(errors)} 個問題")
            for error in errors:
                print(f"  - {error}")
            all_errors.extend((filename, error) for error in errors)
        else:
            print(
                f"PASS {filename}：{stats['publishers']} 個出版社／"
                f"{stats['lessons']} 個單元／{stats['characters']} 個生字／"
                f"{stats['words']} 組語詞／{stats['sentences']} 組例句"
            )

    if all_errors:
        print(f"\n總結果：FAIL（{len(all_errors)} 個問題）", file=sys.stderr)
        return 1

    print(
        "\n總結果：PASS（"
        f"{len(DATA_FILES)} 個資料集，"
        f"{totals['publishers']} 個出版社，"
        f"{totals['lessons']} 個單元，"
        f"{totals['characters']} 個生字，"
        f"{totals['words']} 組語詞，"
        f"{totals['sentences']} 組例句）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
