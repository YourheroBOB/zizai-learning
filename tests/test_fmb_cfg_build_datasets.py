"""隔離測試 build_datasets.py 的環境變數與錯誤輸入處理。

專案文件列出的輸入變數為 ZIZAI_G2_HTML、ZIZAI_KIMI_JS。
所有執行都在暫存目錄內，子程序不繼承本機環境變數。
"""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = REPO_ROOT / "tools"
INPUT_NAMES = ("ZIZAI_G2_HTML", "ZIZAI_KIMI_JS")


class BuildDatasetsEnvironmentTests(unittest.TestCase):
    def run_isolated(self, configured_inputs):
        with tempfile.TemporaryDirectory(prefix="fmb-cfg-") as temp_dir:
            sandbox = Path(temp_dir)
            sandbox_tools = sandbox / "tools"
            sandbox_data = sandbox / "data"
            sandbox_tools.mkdir()
            sandbox_data.mkdir()

            copied_tools = set()
            for source in TOOLS_DIR.glob("*.py"):
                target = sandbox_tools / source.name
                shutil.copyfile(source, target)
                copied_tools.add(target.resolve())

            script = sandbox_tools / "build_datasets.py"
            self.assertTrue(script.is_file(), "測試沙盒中應有建置腳本")

            # 只提供最低限度的執行環境，不繼承任何本機設定或憑證。
            child_env = {
                "PATH": os.defpath,
                "PYTHONIOENCODING": "utf-8",
                **configured_inputs,
            }

            with patch.dict(os.environ, child_env, clear=True):
                result = subprocess.run(
                    [sys.executable, str(script)],
                    cwd=sandbox,
                    env=os.environ.copy(),
                    capture_output=True,
                    text=True,
                    timeout=15,
                    check=False,
                )

            self.assertNotEqual(
                result.returncode,
                0,
                "缺少或無效的輸入設定應被拒絕，而非以預設來源繼續建置",
            )
            self.assertTrue(
                result.stdout.strip() or result.stderr.strip(),
                "設定錯誤時應提供非空診斷訊息",
            )

            generated_data = [
                path for path in sandbox_data.rglob("*") if path.is_file()
            ]
            self.assertEqual(
                generated_data,
                [],
                "輸入設定無效時不應產生或覆寫資料檔",
            )

            unexpected_files = [
                path
                for path in sandbox.rglob("*")
                if path.is_file()
                and path.resolve() not in copied_tools
                and "__pycache__" not in path.parts
            ]
            self.assertEqual(
                unexpected_files,
                [],
                "測試沙盒中不應留下非預期的建置產物",
            )

    def test_omitted_environment_uses_no_implicit_source_and_fails_safely(self):
        self.run_isolated({})

    def test_each_documented_environment_variable_is_required(self):
        fake_html = "FAKE_VALUE_FOR_TEST"
        fake_js = "FAKE_VALUE_FOR_TEST"

        self.run_isolated({"ZIZAI_KIMI_JS": fake_js})
        self.run_isolated({"ZIZAI_G2_HTML": fake_html})

    def test_nonexistent_fake_input_paths_fail_without_outputs(self):
        with tempfile.TemporaryDirectory(prefix="fmb-cfg-inputs-") as temp_dir:
            missing_html = str(Path(temp_dir) / "missing-input.html")
            missing_js = str(Path(temp_dir) / "missing-input.js")
            self.run_isolated(
                {
                    "ZIZAI_G2_HTML": missing_html,
                    "ZIZAI_KIMI_JS": missing_js,
                }
            )


if __name__ == "__main__":
    unittest.main()
