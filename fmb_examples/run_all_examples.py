#!/usr/bin/env python3
"""依序執行並驗證 fmb_examples 內的 5 個離線使用範例。"""

import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES_DIR = Path(__file__).resolve().parent


def fail(message):
    print(f"FAIL：{message}", file=sys.stderr)
    raise SystemExit(1)


def run_command(name, command):
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except subprocess.TimeoutExpired:
        fail(f"{name} 超過 30 秒")
    except OSError as exc:
        fail(f"{name} 無法啟動：{exc}")

    if result.returncode != 0:
        fail(
            f"{name} 結束碼為 {result.returncode}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
    if not result.stdout.strip():
        fail(f"{name} 沒有產生預期輸出")
    return result.stdout


def main():
    node = shutil.which("node")
    if not node:
        fail("找不到 node；請先安裝專案測試所需的 Node.js")

    commands = [
        (
            "範例 1：瀏覽課程與生字",
            [sys.executable, str(EXAMPLES_DIR / "example_01_browse_curriculum.py"), "--json"],
        ),
        (
            "範例 2：產生離線練習題",
            [
                sys.executable,
                str(EXAMPLES_DIR / "example_02_generate_quiz.py"),
                "--format",
                "json",
            ],
        ),
        (
            "範例 3：建立可列印的離線 A4 考卷",
            [sys.executable, str(EXAMPLES_DIR / "example_03_build_worksheet.py")],
        ),
        (
            "範例 4：離線驗證教材資料",
            [sys.executable, str(EXAMPLES_DIR / "example_04_validate_data.py")],
        ),
        (
            "範例 5：檢查注音元件產生的 DOM 樹",
            [node, str(EXAMPLES_DIR / "example_05_zhuyin_render.js")],
        ),
    ]

    outputs = []
    for name, command in commands:
        output = run_command(name, command)
        outputs.append(output)
        print(f"PASS {name}")

    try:
        json.loads(outputs[0])
        json.loads(outputs[1])
    except json.JSONDecodeError as exc:
        fail(f"JSON 範例輸出無法解析：{exc}")

    if not outputs[2].lstrip().lower().startswith("<!doctype html>"):
        fail("範例 3 沒有產生 HTML 文件")
    if "總結果：PASS" not in outputs[3]:
        fail("範例 4 沒有回報資料驗證成功")
    if "PASS：" not in outputs[4]:
        fail("範例 5 沒有回報注音元件驗證成功")

    print("全部範例通過：5/5")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
