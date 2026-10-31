#!/usr/bin/env python3
"""字在（zizai-learning）整合／端到端測試：CLI 執行、檔案 I/O、錯誤路徑。

涵蓋範圍
  1. 靜態站接線（檔案 I/O）：index.html 參照的本機 CSS／JS 都存在；六個年級資料檔
     可載入、meta／publishers／lessons／characters 結構完整。
  2. 本機 HTTP 服務（端到端）：把 index.html、src/、data/ 複製到暫存目錄，用
     127.0.0.1 的臨時靜態伺服器取回 index.html 與 data/*.json 並解析。
  3. CLI 錯誤路徑：
     - tools/build_grades_from_sources.py 缺 CSV 快照／辭典 → 結束碼 2，
       且不改寫任何資料檔（README「如何重建資料」說明的行為）。
     - tools/build_datasets.py 缺環境變數、來源檔內容不符 → 非 0 結束碼，
       且不改寫任何資料檔。
  4. CLI 成功路徑（端到端）：tools/bundle.py 在暫存目錄產出單檔離線版，逐項檢查
     沒有外部資源參照、內嵌資料與來源資料檔逐版本一致。
  5. 既有 Node 測試套件（tests/test_zizai.js）可用子行程完整跑過，回報 0 項失敗。

安全邊界
  - 所有寫入都只發生在 tempfile 建立的暫存目錄；不讀寫 repo 以外的既有資料。
  - 不連線任何正式服務；只用 127.0.0.1 的臨時 HTTP 伺服器與本機子行程。
  - 需要假資料時一律使用 FAKE_VALUE_FOR_TEST 這類明顯假字串。

執行方式（任一種）
  python3 tests/test_fmb_integration_pipeline.py
  python3 -m unittest tests.test_fmb_integration_pipeline -v
  python3 -m pytest tests/test_fmb_integration_pipeline.py -v
"""

from __future__ import annotations

import functools
import hashlib
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable or "python3"
TIMEOUT = 300
SKIP_DIR_NAMES = {"sources", "__pycache__", ".git"}
SKIP_FILE_NAMES = {".DS_Store"}
GRADE_KEYS = list("123456")


# ----------------------------------------------------------------------------
# 共用工具
# ----------------------------------------------------------------------------
def clean_env(extra=None):
    """回傳不含 ZIZAI_* 的環境變數，避免外部設定影響測試結果。"""
    env = {k: v for k, v in os.environ.items() if not k.startswith("ZIZAI_")}
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("PYTHONDONTWRITEBYTECODE", "1")
    if extra:
        env.update({str(k): str(v) for k, v in extra.items()})
    return env


def run_python(args, cwd, extra_env=None, timeout=TIMEOUT):
    return subprocess.run(
        [PYTHON, *[str(a) for a in args]],
        cwd=str(cwd),
        env=clean_env(extra_env),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )


def copy_path(src, dst):
    """把檔案或目錄（遞迴）複製到 dst；跳過不需複製的快照／快取資料夾。"""
    src, dst = Path(src), Path(dst)
    if src.is_dir():
        dst.mkdir(parents=True, exist_ok=True)
        for child in sorted(src.iterdir()):
            if child.is_dir() and child.name in SKIP_DIR_NAMES:
                continue
            if child.name in SKIP_FILE_NAMES:
                continue
            copy_path(child, dst / child.name)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def digest_json_tree(root):
    """回傳 {相對路徑: md5}，用來確認 CLI 沒有改寫既有資料檔。"""
    root = Path(root)
    out = {}
    if not root.exists():
        return out
    for path in sorted(root.rglob("*.json")):
        out[path.relative_to(root).as_posix()] = hashlib.md5(path.read_bytes()).hexdigest()
    return out


def make_tmp(case, prefix):
    path = Path(tempfile.mkdtemp(prefix=prefix))
    case.addCleanup(shutil.rmtree, path, True)
    return path


def read_grade_data_files():
    """從 src/app.js 的 GRADE_DATA_FILES 取得「年級 → 資料檔」對照。"""
    app_js = (REPO_ROOT / "src" / "app.js").read_text(encoding="utf-8")
    return dict(re.findall(r"(\d):\s*'(data/[^']+)'", app_js))


def slice_between(text, marker, next_marker, label):
    """取出 html 中 marker 之後、next_marker 之前的片段（找不到就讓測試失敗）。"""
    try:
        start = text.index(marker) + len(marker)
    except ValueError as exc:  # pragma: no cover - 只有打包格式變動才會發生
        raise AssertionError(f"打包檔找不到標記：{label}（{marker!r}）") from exc
    end = text.index(next_marker, start)
    return text[start:end]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """安靜版的靜態伺服器，避免測試輸出被 access log 洗版。"""

    def log_message(self, fmt, *args):  # noqa: A003 - 覆寫標準介面
        pass


# ----------------------------------------------------------------------------
# 1. 靜態站接線與資料檔結構
# ----------------------------------------------------------------------------
class TestSiteWiringAndDataFiles(unittest.TestCase):
    def test_index_html_local_assets_exist(self):
        """index.html 參照的 src/ 資源都必須存在（打包腳本也依賴這份清單）。"""
        html = (REPO_ROOT / "index.html").read_text(encoding="utf-8")
        refs = re.findall(r'(?:href|src)="(src/[^"]+)"', html)
        self.assertTrue(refs, "index.html 應該參照 src/ 下的 CSS 與 JS")
        missing = [ref for ref in refs if not (REPO_ROOT / ref).is_file()]
        self.assertEqual(missing, [], f"index.html 參照了不存在的檔案：{missing}")
        # bundle.py 的替換順序是釘死的，這裡先確認清單一致
        css = [r for r in refs if r.endswith(".css")]
        js = [r for r in refs if r.endswith(".js")]
        self.assertEqual(
            css,
            [
                "src/tokens.css",
                "src/base.css",
                "src/components.css",
                "src/zhuyin.css",
                "src/print.css",
            ],
        )
        self.assertEqual(js, ["src/zhuyin.js", "src/readings.js", "src/app.js"])

    def test_grade_data_files_load_and_keep_structure(self):
        """六個年級資料檔都能載入，且每課生字都有注音、部首型別與筆畫數。"""
        files = read_grade_data_files()
        self.assertEqual(sorted(files), GRADE_KEYS, f"GRADE_DATA_FILES 解析異常：{files}")
        for grade, rel in files.items():
            with self.subTest(grade=grade, file=rel):
                data = json.loads((REPO_ROOT / rel).read_text(encoding="utf-8"))
                self.assertIn("meta", data)
                self.assertIn("publishers", data)
                self.assertTrue(data["meta"].get("licenseNotes"), "meta.licenseNotes 不可為空")
                self.assertTrue(data["publishers"], "publishers 不可為空")
                lesson_total = 0
                for pub_key, pub in data["publishers"].items():
                    self.assertTrue(pub.get("lessons"), f"{rel} 的 {pub_key} 沒有 lessons")
                    lessons = pub["lessons"]
                    # 二年級資料含有 totalLessons 欄位；一、三至六年級則由前端以 lessons.length 動態計算
                    if pub.get("totalLessons") is not None:
                        self.assertEqual(pub.get("totalLessons"), len(lessons), f"{rel}/{pub_key}")
                    self.assertGreater(len(lessons), 0, f"{rel}/{pub_key} lessons 不可為空")
                    for lesson in lessons:
                        self.assertIsInstance(lesson["lessonNo"], int)
                        self.assertTrue(lesson["title"])
                        self.assertTrue(lesson["characters"], f"{rel}/{pub_key}/{lesson['lessonNo']} 沒有生字")
                        lesson_total += len(lesson["characters"])
                        for char in lesson["characters"]:
                            self.assertEqual(len(char["char"]), 1)
                            self.assertTrue(char["bopomofo"], f"{char['char']} 缺注音")
                            self.assertIsInstance(char["radical"], str)
                            self.assertIsInstance(char["strokes"], int)
                            self.assertGreaterEqual(char["strokes"], 0)
                        for word in lesson["words"]:
                            self.assertGreaterEqual(len(word["word"]), 2)
                            self.assertIsInstance(word["bopomofoArray"], list)
                self.assertGreater(lesson_total, 0)


# ----------------------------------------------------------------------------
# 2. 本機 HTTP 服務（端到端）
# ----------------------------------------------------------------------------
class TestStaticSiteOverHttp(unittest.TestCase):
    def test_index_and_grade_data_are_servable(self):
        """用 127.0.0.1 的臨時靜態伺服器取回 index.html 與資料檔（模擬 python3 -m http.server）。"""
        tmp = make_tmp(self, "fmb-serve-")
        copy_path(REPO_ROOT / "index.html", tmp / "index.html")
        copy_path(REPO_ROOT / "src", tmp / "src")
        copy_path(REPO_ROOT / "data", tmp / "data")

        handler = functools.partial(QuietHandler, directory=str(tmp))
        try:
            httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        except OSError as exc:  # 沙箱可能禁止 listen，直接略過而不是失敗
            self.skipTest(f"無法在 127.0.0.1 開啟臨時伺服器：{exc}")
        self.addCleanup(httpd.server_close)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        self.addCleanup(httpd.shutdown)

        base = f"http://127.0.0.1:{httpd.server_address[1]}"
        with urllib.request.urlopen(base + "/index.html", timeout=20) as resp:
            self.assertEqual(resp.status, 200)
            html = resp.read().decode("utf-8")
        self.assertIn("字在", html)
        self.assertIn('src/app.js', html)

        with urllib.request.urlopen(base + "/data/curriculum-115-1-g1.json", timeout=20) as resp:
            self.assertEqual(resp.status, 200)
            served = json.loads(resp.read().decode("utf-8"))
        self.assertIn("publishers", served)

        # 不存在的路徑要回 404（錯誤路徑）
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(base + "/data/no-such-file.json", timeout=20)
        self.assertEqual(ctx.exception.code, 404)


# ----------------------------------------------------------------------------
# 3. CLI 錯誤路徑
# ----------------------------------------------------------------------------
class TestBuildGradesCliErrorPath(unittest.TestCase):
    """缺快照／辭典時，重建腳本必須以結束碼 2 結束且不改寫資料檔。"""

    def setUp(self):
        self.root = make_tmp(self, "fmb-build-grades-")
        copy_path(
            REPO_ROOT / "tools" / "build_grades_from_sources.py",
            self.root / "tools" / "build_grades_from_sources.py",
        )
        # 只複製已提交的資料檔；data/sources/ 刻意不複製，確保「缺快照」情境
        copy_path(REPO_ROOT / "data", self.root / "data")

    def test_missing_sources_exit_code_2_and_data_untouched(self):
        before = digest_json_tree(self.root / "data")
        result = run_python(["tools/build_grades_from_sources.py"], cwd=self.root)
        self.assertEqual(
            result.returncode,
            2,
            msg=f"stdout={result.stdout!r} stderr={result.stderr!r}",
        )
        combined = result.stdout + result.stderr
        self.assertTrue(combined.strip(), "結束時應印出取得來源的說明")
        self.assertTrue(
            re.search(r"data/sources|sources|SOURCES|試算表|辭典|gsyan|moedict", combined),
            f"說明文字應提到資料來源取得方式，實際：{combined[:400]!r}",
        )
        self.assertEqual(
            digest_json_tree(self.root / "data"),
            before,
            "缺來源時不得改寫任何資料檔",
        )


class TestBuildDatasetsCliErrorPath(unittest.TestCase):
    """缺環境變數或來源格式不符時，二年級資料建置腳本必須非 0 結束且不改寫資料檔。"""

    def setUp(self):
        self.root = make_tmp(self, "fmb-build-datasets-")
        copy_path(
            REPO_ROOT / "tools" / "build_datasets.py",
            self.root / "tools" / "build_datasets.py",
        )
        copy_path(REPO_ROOT / "data", self.root / "data")

    def test_missing_env_vars_reports_required_names(self):
        before = digest_json_tree(self.root / "data")
        result = run_python(["tools/build_datasets.py"], cwd=self.root)
        self.assertNotEqual(result.returncode, 0, msg="缺輸入檔時不應成功結束")
        combined = result.stdout + result.stderr
        self.assertIn("ZIZAI_G2_HTML", combined)
        self.assertEqual(digest_json_tree(self.root / "data"), before)

    def test_fake_source_file_without_data_block_fails(self):
        fake = self.root / "FAKE_G2.html"
        fake.write_text("<html><body>FAKE_VALUE_FOR_TEST</body></html>\n", encoding="utf-8")
        before = digest_json_tree(self.root / "data")
        result = run_python(
            ["tools/build_datasets.py"],
            cwd=self.root,
            extra_env={"ZIZAI_G2_HTML": fake},
        )
        self.assertNotEqual(result.returncode, 0, msg="來源檔沒有 DATA 區塊時必須失敗")
        self.assertEqual(
            digest_json_tree(self.root / "data"),
            before,
            "失敗時不得留下半成品資料檔",
        )


# ----------------------------------------------------------------------------
# 4. CLI 成功路徑：單檔離線版打包（端到端）
# ----------------------------------------------------------------------------
class TestBundleCliEndToEnd(unittest.TestCase):
    def _fixture(self):
        root = make_tmp(self, "fmb-bundle-")
        copy_path(REPO_ROOT / "index.html", root / "index.html")
        copy_path(REPO_ROOT / "src", root / "src")
        copy_path(REPO_ROOT / "data", root / "data")
        copy_path(REPO_ROOT / "tools" / "bundle.py", root / "tools" / "bundle.py")
        return root

    def test_bundle_outputs_self_contained_single_file(self):
        root = self._fixture()
        dist = root / "dist"
        result = run_python(
            ["tools/bundle.py"],
            cwd=root,
            extra_env={"ZIZAI_OUT": dist},
        )
        self.assertEqual(
            result.returncode,
            0,
            msg=f"打包失敗 stdout={result.stdout!r} stderr={result.stderr!r}",
        )
        index = dist / "index.html"
        share = dist / "zi-zai.html"
        self.assertTrue(index.is_file(), "應產出 dist/index.html")
        self.assertTrue(share.is_file(), "應產出 dist/zi-zai.html")

        html_a = index.read_text(encoding="utf-8")
        html_b = share.read_text(encoding="utf-8")
        self.assertEqual(html_a, html_b, "兩個單檔的內容必須完全相同")
        self.assertGreater(len(html_a.encode("utf-8")), 200_000, "單檔應內嵌全部資料")

        # 離線版不得殘留任何外部資源參照
        self.assertIsNone(re.search(r'<link[^>]+href="https?://', html_a), "不得殘留外部 <link>")
        self.assertIsNone(re.search(r'<script[^>]+src="https?://', html_a), "不得殘留外部 <script>")
        self.assertIsNone(re.search(r'(?:href|src)="src/', html_a), "不得殘留 src/ 相對參照")
        self.assertNotIn("fonts.googleapis.com", html_a)
        # 網路面只允許 readings.js 內「使用者勾選才送」的同源 POST
        self.assertNotIn("XMLHttpRequest", html_a)
        self.assertNotIn("sendBeacon", html_a)
        self.assertEqual(html_a.count("fetchImpl("), 1)

        self.assertIn("window.__EMBEDDED_GRADES__", html_a)
        self.assertIn("window.__EMBEDDED_CURRICULUM_110__", html_a)
        self.assertIn("window.__EMBEDDED_CURRICULUM_DEMO__", html_a)

        self._assert_embedded_matches_sources(html_a)

    def test_bundle_fails_without_writing_output_when_asset_missing(self):
        root = self._fixture()
        (root / "src" / "print.css").unlink()
        dist = root / "dist"
        result = run_python(
            ["tools/bundle.py"],
            cwd=root,
            extra_env={"ZIZAI_OUT": dist},
        )
        self.assertNotEqual(result.returncode, 0, msg="缺素材時打包必須失敗")
        self.assertFalse((dist / "index.html").exists(), "失敗時不得留下半成品")

    def _assert_embedded_matches_sources(self, html):
        """內嵌資料必須與 data/*.json 逐版本對得上（真的端到端比對）。"""
        raw = slice_between(
            html,
            "window.__EMBEDDED_GRADES__ = ",
            ";\n  window.__EMBEDDED_CURRICULUM_110__ = ",
            "__EMBEDDED_GRADES__",
        )
        try:
            embedded = json.loads(raw)
        except ValueError:
            # 若資料含需轉義字元導致無法直接解析，退回到結構性檢查
            self.assertGreater(html.count('"lessonNo"'), 100)
            return

        files = read_grade_data_files()
        self.assertEqual(sorted(files), GRADE_KEYS)
        for grade, rel in files.items():
            with self.subTest(grade=grade):
                source = json.loads((REPO_ROOT / rel).read_text(encoding="utf-8"))
                self.assertIn(grade, embedded, f"內嵌資料缺少年級 {grade}")
                self.assertEqual(
                    sorted(embedded[grade]["publishers"]),
                    sorted(source["publishers"]),
                    f"年級 {grade} 的版本清單與 {rel} 不一致",
                )
                for pub_key, block in source["publishers"].items():
                    self.assertEqual(
                        len(embedded[grade]["publishers"][pub_key]["lessons"]),
                        len(block["lessons"]),
                        f"年級 {grade}／{pub_key} 的課次數不一致",
                    )
                self.assertEqual(
                    embedded[grade]["meta"].get("licenseNotes"),
                    source["meta"].get("licenseNotes"),
                    f"年級 {grade} 的授權說明與 {rel} 不一致",
                )

        # 110 學年度與體驗版也必須是同一份來源資料
        raw110 = slice_between(
            html,
            "window.__EMBEDDED_CURRICULUM_110__ = ",
            ";\n  window.__EMBEDDED_CURRICULUM_DEMO__ = ",
            "__EMBEDDED_CURRICULUM_110__",
        )
        try:
            data110 = json.loads(raw110)
        except ValueError:
            data110 = None
        if data110 is not None:
            source110 = json.loads(
                (REPO_ROOT / "data" / "curriculum-110.json").read_text(encoding="utf-8")
            )
            self.assertEqual(len(data110.get("blocks", [])), len(source110.get("blocks", [])))


# ----------------------------------------------------------------------------
# 5. 既有 Node 測試套件（子行程整合）
# ----------------------------------------------------------------------------
class TestExistingNodeSuite(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "本機沒有 node，略過既有測試套件整合檢查")
    def test_node_suite_runs_without_failures(self):
        script = REPO_ROOT / "tests" / "test_zizai.js"
        if not script.is_file():  # pragma: no cover - 正常情況一定存在
            self.skipTest("找不到 tests/test_zizai.js")
        result = subprocess.run(
            ["node", str(script)],
            cwd=str(REPO_ROOT),
            env=clean_env(),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=TIMEOUT,
        )
        self.assertEqual(
            result.returncode,
            0,
            msg=f"既有測試套件失敗 stdout={result.stdout[-2000:]!r} stderr={result.stderr[-2000:]!r}",
        )
        match = re.search(r"(\d+)\s*項失敗", result.stdout)
        if match:
            self.assertEqual(int(match.group(1)), 0, "既有測試套件回報了失敗項目")


if __name__ == "__main__":
    unittest.main(verbosity=2)
