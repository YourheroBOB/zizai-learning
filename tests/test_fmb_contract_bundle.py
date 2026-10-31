"""契約測試：離線版打包 CLI 的輸出與產物格式。"""

import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]


class BundleCliContractTests(unittest.TestCase):
    def test_builds_identical_offline_files_in_the_requested_directory(self):
        # 使用空白暫存目錄作為輸出，避免測試改寫 repo 內的 dist 檔案。
        with tempfile.TemporaryDirectory(prefix="zizai-bundle-contract-") as temp_dir:
            output_dir = Path(temp_dir) / "bundle"
            env = os.environ.copy()
            env["ZIZAI_OUT"] = str(output_dir)

            result = subprocess.run(
                [sys.executable, str(REPO_ROOT / "tools" / "bundle.py")],
                cwd=REPO_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(
                result.returncode,
                0,
                msg=f"打包 CLI 應成功結束；stderr：{result.stderr}",
            )

            index_file = output_dir / "index.html"
            alias_file = output_dir / "zi-zai.html"
            self.assertTrue(index_file.is_file(), "CLI 應產生 dist/index.html 對應產物")
            self.assertTrue(alias_file.is_file(), "CLI 應產生 dist/zi-zai.html 對應產物")
            self.assertEqual(
                sorted(path.name for path in output_dir.iterdir()),
                ["index.html", "zi-zai.html"],
                "輸出目錄應只包含兩個公開的單檔 HTML 產物",
            )
            self.assertEqual(
                index_file.read_bytes(),
                alias_file.read_bytes(),
                "兩個單檔離線版產物應完全相同",
            )

            self.assertIn(
                f"打包完成：{index_file} 與 zi-zai.html（內容相同）",
                result.stdout,
            )
            self.assertRegex(
                result.stdout,
                r"大小 [0-9,]+ 位元組，md5 [0-9a-f]{32}，"
                r"內嵌一到六年級 115-1（6 檔）＋110 學年度＋體驗版",
            )

            html = index_file.read_text(encoding="utf-8")
            self.assertIn("window.__EMBEDDED_GRADES__", html)
            self.assertIn("window.__EMBEDDED_CURRICULUM_110__", html)
            self.assertIn("window.__EMBEDDED_CURRICULUM_DEMO__", html)

            # 外部教材或字型資源不是離線產物契約的一部分；
            # 教育部等使用者點擊後開啟的超連結不受此檢查限制。
            self.assertNotRegex(
                html,
                re.compile(r"""<link\b[^>]*\bhref=["']https?://""", re.IGNORECASE),
            )
            self.assertNotRegex(
                html,
                re.compile(r"""<script\b[^>]*\bsrc=["']https?://""", re.IGNORECASE),
            )
            self.assertNotRegex(
                html,
                re.compile(r"""@import\s+url\(\s*["']?https?://""", re.IGNORECASE),
            )
            self.assertNotRegex(
                html,
                re.compile(r"fonts\.(?:googleapis|gstatic)\.com", re.IGNORECASE),
            )


if __name__ == "__main__":
    unittest.main()
