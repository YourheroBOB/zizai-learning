"""build_datasets.py 缺少必要輸入時的 CLI 契約測試。"""

import os
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "build_datasets.py"


class BuildDatasetsMissingInputContractTest(unittest.TestCase):
    def test_missing_first_input_returns_documented_error(self):
        env = os.environ.copy()
        env.pop("ZIZAI_G2_HTML", None)
        env.pop("ZIZAI_KIMI_JS", None)
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
            timeout=15,
        )

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(
            result.stderr,
            "找不到輸入檔：二年級 115 學年度生字清單頁（yizi-yiri-115-1-g2.html）\n"
            "請設定環境變數 ZIZAI_G2_HTML=<檔案路徑> 後重跑。\n"
            "說明：本腳本只用於重建二年級（115-1）、110 學年度與體驗版資料；"
            "一、三～六年級請改用 tools/build_grades_from_sources.py（資料來源見 data/SOURCES.md）。\n",
        )


if __name__ == "__main__":
    unittest.main()
