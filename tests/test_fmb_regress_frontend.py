#!/usr/bin/env python3
"""前端版面回歸測試。

以靜態解析鎖定已修正但原有邏輯測試未涵蓋的版面問題；不啟動瀏覽器、
不連線網路，也不修改任何既有檔案。
"""

from __future__ import annotations

import re
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _rules(css: str, selector: str) -> list[str]:
    pattern = re.compile(
        r"(?<![A-Za-z0-9_-])" + re.escape(selector) + r"\s*\{([^{}]*)\}"
    )
    return [match.group(1) for match in pattern.finditer(css)]


def _declarations(rule_body: str) -> dict[str, str]:
    declarations: dict[str, str] = {}
    for part in rule_body.split(";"):
        if ":" not in part:
            continue
        name, value = part.split(":", 1)
        declarations[name.strip().lower()] = value.strip().lower()
    return declarations


def _has_declaration(rules: list[str], name: str, expected: str) -> bool:
    return any(_declarations(rule).get(name) == expected for rule in rules)


class _SelectOptionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.selects: dict[str, list[str]] = {}
        self._current_select: str | None = None
        self._option_value: str | None = None
        self._option_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "select":
            self._current_select = attributes.get("id")
            self.selects.setdefault(self._current_select, [])
        elif tag == "option" and self._current_select is not None:
            self._option_value = attributes.get("value")
            self._option_text = []

    def handle_data(self, data: str) -> None:
        if self._current_select is not None and self._option_value is None:
            self._option_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "option" and self._current_select is not None:
            value = (
                self._option_value
                if self._option_value is not None
                else "".join(self._option_text).strip()
            )
            self.selects[self._current_select].append(value)
            self._option_value = None
            self._option_text = []
        elif tag == "select":
            self._current_select = None


class FrontendRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index_html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.print_css = (ROOT / "src" / "print.css").read_text(encoding="utf-8")

    def test_mobile_header_controls_can_shrink_without_horizontal_overflow(self) -> None:
        """手機版控制列不可因 nowrap 子項撐破 viewport。"""
        controls = _rules(self.index_html, ".tp-header-controls")
        tabs = _rules(self.index_html, ".tp-nav-tabs")
        buttons = _rules(self.index_html, ".tp-nav-btn")

        self.assertTrue(controls, "找不到頂部控制列 CSS")
        self.assertTrue(
            _has_declaration(controls, "min-width", "0"),
            "控制列必須允許在 flex 容器內縮到小於內容寬度",
        )
        self.assertTrue(
            _has_declaration(controls, "max-width", "100%"),
            "控制列寬度不得超過父容器",
        )
        self.assertTrue(
            _has_declaration(tabs, "max-width", "100%"),
            "分頁列不得撐破手機 viewport",
        )
        self.assertTrue(
            _has_declaration(tabs, "overflow-x", "auto"),
            "分頁列應在自身範圍內水平捲動",
        )
        self.assertTrue(
            _has_declaration(buttons, "white-space", "nowrap"),
            "按鈕文字應維持單行，捲動應只發生在分頁列容器",
        )
        self.assertTrue(
            _has_declaration(tabs, "width", "100%"),
            "手機斷點的分頁列應使用父容器寬度",
        )

    def test_print_layout_zeroes_container_padding_and_overflow(self) -> None:
        """列印時容器留白不得把 A4 紙張擠成額外空白頁。"""
        page_match = re.search(r"@page\s*\{([^{}]*)\}", self.print_css)
        self.assertIsNotNone(page_match, "找不到 A4 @page 設定")
        page = _declarations(page_match.group(1))
        self.assertEqual(page.get("size"), "a4")
        self.assertEqual(page.get("margin"), "0")

        main_rules = _rules(self.print_css, "main.tp-container-main")
        self.assertTrue(main_rules, "找不到列印時的主容器覆寫")
        self.assertTrue(
            _has_declaration(main_rules, "padding", "0"),
            "列印主容器的 padding 必須歸零",
        )
        self.assertTrue(
            _has_declaration(main_rules, "max-width", "none"),
            "列印主容器不得保留網頁版 max-width",
        )
        self.assertTrue(
            _has_declaration(main_rules, "margin", "0"),
            "列印主容器的 margin 必須歸零",
        )

        viewer_rules = _rules(self.print_css, ".tp-sheet-viewer")
        self.assertTrue(
            _has_declaration(viewer_rules, "overflow", "visible"),
            "列印預覽容器不得保留水平捲動",
        )
        self.assertTrue(
            _has_declaration(viewer_rules, "display", "block"),
            "列印預覽容器必須以 block 排版",
        )

    def test_grade_and_curriculum_controls_expose_all_supported_values(self) -> None:
        """年級與歷史／體驗版選單不得在擴充後漏項。"""
        parser = _SelectOptionParser()
        parser.feed(self.index_html)

        self.assertEqual(
            parser.selects.get("grade-select"),
            ["1", "2", "3", "4", "5", "6"],
        )
        self.assertEqual(
            parser.selects.get("curriculum-type-select"),
            ["115-1", "110", "demo"],
        )
        self.assertEqual(
            parser.selects.get("pub-select"),
            ["kangxuan", "hanlin", "nanyi"],
        )

    def test_frontend_assets_keep_dependency_order(self) -> None:
        """注音元件必須先於主程式載入；打包器也依賴相同順序。"""
        stylesheets = re.findall(
            r'<link\s+rel="stylesheet"\s+href="([^"]+)"',
            self.index_html,
        )
        scripts = re.findall(r'<script\s+src="([^"]+)"></script>', self.index_html)

        self.assertEqual(
            stylesheets,
            [
                "src/tokens.css",
                "src/base.css",
                "src/components.css",
                "src/zhuyin.css",
                "src/print.css",
            ],
        )
        self.assertEqual(
            scripts,
            ["src/zhuyin.js", "src/readings.js", "src/app.js"],
        )


if __name__ == "__main__":
    unittest.main()
