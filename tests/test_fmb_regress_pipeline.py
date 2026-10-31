#!/usr/bin/env python3
"""資料管線、單檔打包器與已發布資料的回歸測試。

所有會產生檔案的案例都寫入 tempfile；缺少來源資料的案例在暫存副本中
執行，確保不會改寫目前 clone，也不會連線到正式服務。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GRADE_SOURCE_FILES = {
    "1": "curriculum-115-1-g1.json",
    "2": "curriculum-115-1.json",
    "3": "curriculum-115-1-g3.json",
    "4": "curriculum-115-1-g4.json",
    "5": "curriculum-115-1-g5.json",
    "6": "curriculum-115-1-g6.json",
}


def _run(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    timeout: int = 30,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )


def _base_env() -> dict[str, str]:
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("ZIZAI_"):
            env.pop(key, None)
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def _copy_build_fixture(temp_root: Path, script_name: str) -> Path:
    clone = temp_root / "repo"
    (clone / "tools").mkdir(parents=True)
    shutil.copy2(ROOT / "tools" / script_name, clone / "tools" / script_name)
    shutil.copytree(
        ROOT / "data",
        clone / "data",
        ignore=shutil.ignore_patterns("sources"),
    )
    return clone


def _data_digests(repo: Path) -> dict[str, str]:
    digests: dict[str, str] = {}
    for path in sorted((repo / "data").glob("*.json")):
        digests[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return digests


def _decode_window_json(html: str, variable: str) -> object:
    marker = f"window.{variable} = "
    start = html.index(marker) + len(marker)
    value, _ = json.JSONDecoder().raw_decode(html[start:].lstrip())
    return value


class PipelineRegressionTests(unittest.TestCase):
    def test_missing_source_files_fail_without_rewriting_data(self) -> None:
        """缺少來源快照時應明確退出，且不得產生半套資料。"""
        with tempfile.TemporaryDirectory(prefix="zizai-fmb-regress-") as temp:
            clone = _copy_build_fixture(
                Path(temp), "build_grades_from_sources.py"
            )
            before = _data_digests(clone)
            env = _base_env()

            result = _run(
                [sys.executable, "tools/build_grades_from_sources.py"],
                cwd=clone,
                env=env,
            )
            output = result.stdout + "\n" + result.stderr

            self.assertEqual(result.returncode, 2, output)
            self.assertNotIn("Traceback", output)
            self.assertTrue(
                any(word in output.lower() for word in ("csv", "sources", "下載")),
                f"缺少來源時應說明如何取得資料：\n{output}",
            )
            self.assertEqual(_data_digests(clone), before)

    def test_legacy_builder_requires_missing_external_inputs(self) -> None:
        """二年級重建工具缺少環境變數時應安全退出而非寫出空資料。"""
        with tempfile.TemporaryDirectory(prefix="zizai-fmb-regress-") as temp:
            clone = _copy_build_fixture(Path(temp), "build_datasets.py")
            before = _data_digests(clone)
            env = _base_env()

            result = _run(
                [sys.executable, "tools/build_datasets.py"],
                cwd=clone,
                env=env,
            )
            output = result.stdout + "\n" + result.stderr

            self.assertEqual(result.returncode, 1, output)
            self.assertNotIn("Traceback", output)
            self.assertIn("ZIZAI_G2_HTML", output)
            self.assertEqual(_data_digests(clone), before)

    def test_bundle_contains_all_grades_and_has_no_external_resources(self) -> None:
        """單檔版必須可離線使用，且不得重新引入外部字型或資料 fetch。"""
        with tempfile.TemporaryDirectory(prefix="zizai-fmb-regress-") as temp:
            out_dir = Path(temp) / "dist"
            env = _base_env()
            env["ZIZAI_OUT"] = str(out_dir)

            result = _run(
                [sys.executable, "tools/bundle.py"],
                cwd=ROOT,
                env=env,
                timeout=60,
            )
            output = result.stdout + "\n" + result.stderr
            self.assertEqual(result.returncode, 0, output)

            index_path = out_dir / "index.html"
            zi_zai_path = out_dir / "zi-zai.html"
            self.assertTrue(index_path.is_file())
            self.assertTrue(zi_zai_path.is_file())
            html = index_path.read_text(encoding="utf-8")
            self.assertEqual(html, zi_zai_path.read_text(encoding="utf-8"))

            embedded_grades = _decode_window_json(
                html, "__EMBEDDED_GRADES__"
            )
            self.assertIsInstance(embedded_grades, dict)
            self.assertEqual(set(embedded_grades), set(GRADE_SOURCE_FILES))
            for grade, source_name in GRADE_SOURCE_FILES.items():
                source_path = ROOT / "data" / source_name
                expected = json.loads(source_path.read_text(encoding="utf-8"))
                self.assertEqual(embedded_grades[grade], expected)

            embedded_110 = _decode_window_json(
                html, "__EMBEDDED_CURRICULUM_110__"
            )
            embedded_demo = _decode_window_json(
                html, "__EMBEDDED_CURRICULUM_DEMO__"
            )
            self.assertEqual(
                embedded_110,
                json.loads(
                    (ROOT / "data" / "curriculum-110.json").read_text(
                        encoding="utf-8"
                    )
                ),
            )
            self.assertEqual(
                embedded_demo,
                json.loads(
                    (ROOT / "data" / "curriculum-demo.json").read_text(
                        encoding="utf-8"
                    )
                ),
            )

            external_resource = re.compile(
                r'<\s*(?:link|script|img|iframe|source|video|audio)\b'
                r'[^>]*\b(?:src|href)\s*=\s*["\']https?://',
                re.IGNORECASE,
            )
            self.assertIsNone(external_resource.search(html))
            self.assertNotIn("fonts.googleapis.com", html)
            self.assertNotIn("fonts.gstatic.com", html)
            self.assertIsNone(
                re.search(r'(?:src|href)\s*=\s*["\']src/', html)
            )
            self.assertEqual(
                html.count("fetchImpl("),
                1,
                "內聯程式只能保留一個受控的回報 fetch 呼叫",
            )

            css_markers = [
                f"/* === {name} === */"
                for name in (
                    "tokens.css",
                    "base.css",
                    "components.css",
                    "zhuyin.css",
                    "print.css",
                )
            ]
            positions = [html.index(marker) for marker in css_markers]
            self.assertEqual(positions, sorted(positions))

    def test_bundle_rejects_an_unapproved_transport(self) -> None:
        """打包器必須拒絕 XMLHttpRequest 等額外網路傳輸面。"""
        with tempfile.TemporaryDirectory(prefix="zizai-fmb-regress-") as temp:
            temp_root = Path(temp)
            clone = temp_root / "clone"

            def ignore(path: str, names: list[str]) -> list[str]:
                relative = Path(path).resolve().relative_to(ROOT.resolve())
                if relative == Path("."):
                    return [
                        name
                        for name in names
                        if name in {".git", "dist", "tests", "__pycache__"}
                    ]
                if relative == Path("data") and "sources" in names:
                    return ["sources"]
                if Path(path).name == "__pycache__":
                    return list(names)
                return []

            shutil.copytree(ROOT, clone, ignore=ignore)
            readings = clone / "src" / "readings.js"
            readings.write_text(
                readings.read_text(encoding="utf-8")
                + "\n/* regression guard */\n"
                + "const regressionForbiddenTransport = new XMLHttpRequest();\n",
                encoding="utf-8",
            )

            out_dir = temp_root / "dist"
            env = _base_env()
            env["ZIZAI_OUT"] = str(out_dir)
            result = _run(
                [sys.executable, "tools/bundle.py"],
                cwd=clone,
                env=env,
                timeout=60,
            )
            output = result.stdout + "\n" + result.stderr

            self.assertNotEqual(result.returncode, 0, output)
            self.assertIn("XMLHttpRequest", output)
            self.assertFalse((out_dir / "index.html").exists())
            self.assertFalse((out_dir / "zi-zai.html").exists())


class PublishedDataRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.grade_files = [
            ROOT / "data" / source_name
            for source_name in GRADE_SOURCE_FILES.values()
            if source_name != "curriculum-115-1.json"
        ]

    def test_grade_one_retains_both_foundation_units_in_order(self) -> None:
        """南一一年級兩個無 L-code 的前導單元不得再次被略過。"""
        data = json.loads(
            (ROOT / "data" / "curriculum-115-1-g1.json").read_text(
                encoding="utf-8"
            )
        )
        publisher = data["publishers"]["nanyi"]
        lessons = publisher["lessons"]
        foundation = [
            (
                lesson["lessonNo"],
                lesson["title"],
                "".join(character["char"] for character in lesson["characters"]),
            )
            for lesson in lessons
            if lesson["lessonNo"] < 0
        ]

        self.assertEqual(
            foundation,
            [
                (-2, "數字", "一二三四五六七八九十"),
                (-1, "魔法", "日月山木水人手門"),
            ],
        )
        self.assertEqual(publisher.get("totalLessons", len(lessons)), 9)
        self.assertEqual(len(lessons), 9)
        self.assertEqual(
            [lesson["lessonNo"] for lesson in lessons],
            sorted(lesson["lessonNo"] for lesson in lessons),
        )
        self.assertEqual(
            [lesson["lessonNo"] for lesson in lessons[:2]],
            [-2, -1],
        )

    def test_every_publisher_has_consistent_lesson_metadata(self) -> None:
        """各年級、版本的課次編號與總數不得漂移或重複。"""
        for path in self.grade_files:
            data = json.loads(path.read_text(encoding="utf-8"))
            with self.subTest(file=path.name):
                for publisher_name, publisher in data["publishers"].items():
                    lessons = publisher["lessons"]
                    numbers = [lesson["lessonNo"] for lesson in lessons]

                    if "totalLessons" in publisher:
                        self.assertEqual(
                            publisher["totalLessons"],
                            len(lessons),
                            f"{path.name}/{publisher_name} 的 totalLessons 不符",
                        )
                    self.assertEqual(numbers, sorted(numbers))
                    self.assertEqual(len(numbers), len(set(numbers)))

                    negative = sorted(
                        number for number in numbers if number < 0
                    )
                    if negative:
                        self.assertEqual(
                            negative,
                            list(range(negative[0], negative[0] + len(negative))),
                        )

                    nonnegative = sorted(
                        number for number in numbers if number >= 0
                    )
                    if nonnegative:
                        self.assertEqual(
                            nonnegative,
                            list(
                                range(
                                    nonnegative[0],
                                    nonnegative[0] + len(nonnegative),
                                )
                            ),
                        )

                    for lesson in lessons:
                        self.assertTrue(lesson["title"].strip())
                        self.assertIsInstance(lesson["characters"], list)
                        self.assertIsInstance(lesson["words"], list)
                        self.assertTrue(lesson["characters"])
                        for character in lesson["characters"]:
                            self.assertEqual(len(character["char"]), 1)
                        for word in lesson["words"]:
                            self.assertTrue(word["word"].strip())
                            self.assertEqual(
                                len(word["bopomofoArray"]),
                                len(word["word"]),
                            )

    @unittest.expectedFailure
    def test_publisher_total_lessons_field_follows_published_schema(self) -> None:
        """已知資料問題：g1、g3～g6 出版社物件缺少 Schema 要求的 totalLessons。

        本任務只能新增回歸測試，不能修改既有資料與產生器，因此以
        expectedFailure 保留此缺陷的可見性；資料補齊欄位後會自然解除。
        """
        for path in self.grade_files:
            data = json.loads(path.read_text(encoding="utf-8"))
            for publisher_name, publisher in data["publishers"].items():
                self.assertIn(
                    "totalLessons",
                    publisher,
                    f"{path.name}/{publisher_name} 缺少 totalLessons",
                )
                self.assertEqual(
                    publisher["totalLessons"],
                    len(publisher["lessons"]),
                    f"{path.name}/{publisher_name} 的 totalLessons 不符",
                )

    def test_public_license_notes_do_not_claim_an_unavailable_license(self) -> None:
        """公開資料不得再把來源聲明誤寫成開放授權。"""
        for path in self.grade_files:
            data = json.loads(path.read_text(encoding="utf-8"))
            note = data["meta"]["licenseNotes"].replace(" ", "")
            with self.subTest(file=path.name):
                self.assertTrue(
                    "授權條款未載明" in note or "未載明授權" in note,
                    f"{path.name} 未如實標示來源授權狀態：{note}",
                )

        sources = (ROOT / "data" / "SOURCES.md").read_text(encoding="utf-8")
        self.assertIn("授權條款未載明", sources)

        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        self.assertIn("data/sources/gsyan/", gitignore)
        self.assertIn("data/sources/moedict/", gitignore)


if __name__ == "__main__":
    unittest.main()
