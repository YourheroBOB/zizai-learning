#!/usr/bin/env python3
"""
bundle.py：把 index.html、src/*.css、src/*.js 與一到六年級資料打包成「單一 HTML 檔」。

輸出（dist/）：
  dist/index.html    單檔離線版
  dist/zi-zai.html   內容與 dist/index.html 相同（單檔分享用）

用法（在倉庫任何位置執行皆可，路徑都以本檔所在倉庫為準）：
  python3 tools/bundle.py
  ZIZAI_OUT=/some/dir python3 tools/bundle.py     # 改輸出資料夾（預設 dist/）

與根目錄 index.html（網頁版）的差異，共三類：
  1. 移除三行 Google Fonts 的 link（preconnect 兩行與 stylesheet 一行）：單檔離線版不對外連線，字型走 tokens.css 內的系統備援。
  2. 資料載入改為只讀內嵌資料（移除 app.js 內三處 fetch）：file:// 開啟時瀏覽器不允許 fetch 本機 JSON，所以資料必須內嵌。
  3. CSS 與 JS 內聯、資料內嵌（一到六年級 115-1、110 學年度、生活情境體驗版）。

每個文字替換都斷言「恰好命中一次」，任何一個對不上就直接失敗並結束（不會靜默略過）。
另外把內聯 JS 的「網路面」逐項釘死：整份 JS 只允許 readings.js 內一處 fetch（使用者勾選才送的同源 POST /api/report），
XMLHttpRequest、sendBeacon、WebSocket、EventSource、importScripts 與未列入白名單的外部網址一律失敗。
"""
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("ZIZAI_OUT") or os.path.join(ROOT, "dist")
os.makedirs(OUT, exist_ok=True)


def rd(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


def fail(msg):
    sys.exit(f"打包失敗：{msg}")


def sub_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        fail(f"{label} 命中 {n} 次（應為 1）")
    return text.replace(old, new)


def cut(text, start, end, repl, label):
    if text.count(start) != 1 or text.count(end) != 1:
        fail(f"{label} 的起訖標記命中次數異常")
    i, j = text.index(start), text.index(end)
    if not i < j:
        fail(f"{label} 起訖順序異常")
    return text[:i] + repl + text[j:]


html = rd("index.html")
app_js = rd("src", "app.js")
zhuyin_js = rd("src", "zhuyin.js")
readings_js = rd("src", "readings.js")

# --- 1. 移除 Google Fonts（三行）---
for g in (
    '  <link rel="preconnect" href="https://fonts.googleapis.com">\n',
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n',
):
    html = sub_once(html, g, "", "Google Fonts preconnect")
m = re.findall(r'  <link href="https://fonts\.googleapis\.com/css2\?[^"]+" rel="stylesheet">\n', html)
if len(m) != 1:
    fail(f"Google Fonts stylesheet 命中 {len(m)} 次（應為 1）")
html = html.replace(m[0], "")

# --- 2. app.js 資料載入：改為只讀內嵌資料（移除 fetch） ---
app_js = cut(
    app_js,
    "  async function loadGradeData(grade) {",
    "  async function switchGrade(grade) {",
    """  async function loadGradeData(grade) {
    if (state.gradeData[grade]) return state.gradeData[grade];
    if (!GRADE_DATA_FILES[grade]) return null;
    const data = window.__EMBEDDED_GRADES__ && window.__EMBEDDED_GRADES__[grade];
    if (!data) {
      console.warn(`年級 ${grade} 內嵌資料缺失`);
      return null;
    }
    state.gradeData[grade] = data;
    return data;
  }

""",
    "loadGradeData",
)
app_js = cut(
    app_js,
    "    // 載入 JSON 資料：先載目前年級的 115-1 + 110 + demo（後兩者僅二年級用）\n",
    "    // 年級選擇器\n",
    """    // 載入 JSON 資料（建置時內嵌；目前年級的 115-1＋110＋體驗版）
    try {
      await loadGradeData(state.currentGrade);
      state.curriculum110 = window.__EMBEDDED_CURRICULUM_110__;
      state.curriculumDemo = window.__EMBEDDED_CURRICULUM_DEMO__;
      if (!state.curriculum110 || !state.curriculumDemo) throw new Error('內嵌教材資料缺失');
    } catch (e) {
      console.error('載入教材資料檔失敗', e);
      alert('教材資料載入失敗，請重新整理頁面。');
      return;
    }

""",
    "init 載入",
)
if "fetch(" in app_js:
    fail("app.js 仍有 fetch(")

# --- 2b. 內聯 JS 的網路面釘死 ---
all_js = zhuyin_js + "\n" + readings_js + "\n" + app_js
if readings_js.count("fetchImpl(REPORT_PATH, init)") != 1:
    fail(f"readings.js 的 fetchImpl(REPORT_PATH, init) 應恰好 1 處，實際 {readings_js.count('fetchImpl(REPORT_PATH, init)')}")
if readings_js.count("const REPORT_PATH = '/api/report';") != 1:
    fail("readings.js 的 REPORT_PATH 必須是相對路徑 '/api/report' 且只定義一次")
if len(re.findall(r"fetchImpl\s*\(", all_js)) != 1:
    fail("內聯 JS 的 fetchImpl( 呼叫應恰好 1 處")
if app_js.count("fetchImpl:") != 1:
    fail("app.js 應恰好 1 處把 window.fetch 交給 sendReport")
BANNED = [
    (r"\bXMLHttpRequest\b", "XMLHttpRequest"),
    (r"\bsendBeacon\b", "sendBeacon"),
    (r"\bWebSocket\b", "WebSocket"),
    (r"\bEventSource\b", "EventSource"),
    (r"\bimportScripts\b", "importScripts"),
    (
        r"https?://(?!dict\.concised\.moe\.edu\.tw/search\.jsp|stroke-order\.learningweb\.moe\.edu\.tw/searchW\.jsp"
        r"|pedia\.cloud\.edu\.tw/Entry/Detail/|www\.w3\.org/2000/svg)",
        "未列入白名單的外部網址（白名單：三個教育部連結＝使用者點擊才開的連結，以及 SVG 命名空間字串）",
    ),
]
for pat, what in BANNED:
    if re.search(pat, all_js):
        fail(f"內聯 JS 出現 {what}")

# --- 3. 資料內嵌 ---
files = dict(re.findall(r"(\d):\s*'(data/[^']+)'", app_js))
if sorted(files) != list("123456"):
    fail(f"GRADE_DATA_FILES 解析異常：{files}")
grades = {}
for g, rel in files.items():
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        grades[g] = json.load(f)
with open(os.path.join(ROOT, "data", "curriculum-110.json"), encoding="utf-8") as f:
    d110 = json.load(f)
with open(os.path.join(ROOT, "data", "curriculum-demo.json"), encoding="utf-8") as f:
    ddemo = json.load(f)


def js(o):
    # </script> 與 <!-- 在內嵌 script 內需轉義
    return json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").replace("<!--", "<\\!--")


embedded = (
    "<script>\n"
    f"  window.__EMBEDDED_GRADES__ = {js(grades)};\n"
    f"  window.__EMBEDDED_CURRICULUM_110__ = {js(d110)};\n"
    f"  window.__EMBEDDED_CURRICULUM_DEMO__ = {js(ddemo)};\n"
    "</script>\n"
)

# --- 4. CSS／JS 內聯（順序釘死） ---
css_names = ["tokens.css", "base.css", "components.css", "zhuyin.css", "print.css"]
link_re = re.compile(r'[ \t]*<link\s+rel="stylesheet"\s+href="src/([^"]+)">\n?')
found = link_re.findall(html)
if found != css_names:
    fail(f"index.html 的 CSS 連結順序與預期不同：{found}")
html = link_re.sub("", html)
css = "\n".join(f"/* === {n} === */\n" + rd("src", n) for n in css_names)
html = sub_once(html, "</head>", f"<style>\n{css}\n</style>\n</head>", "</head>")

script_re = re.compile(r'[ \t]*<script\s+src="src/([^"]+)"></script>\n?')
found_js = script_re.findall(html)
if found_js != ["zhuyin.js", "readings.js", "app.js"]:
    fail(f"index.html 的 script 順序與預期不同：{found_js}")
html = script_re.sub("", html)
tail = embedded + f"<script>\n{zhuyin_js}\n</script>\n<script>\n{readings_js}\n</script>\n<script>\n{app_js}\n</script>\n"
html = sub_once(html, "</body>", tail + "</body>", "</body>")

# --- 5. 殘留檢查：不應再有外部資源參照（<a href> 的外部連結不算） ---
for pat, what in [
    (r'<link[^>]+href="https?://', "外部 link"),
    (r'<script[^>]+src="https?://', "外部 script"),
    (r"@import\s+url\(https?://", "CSS @import"),
    (r"fonts\.(googleapis|gstatic)\.com", "Google Fonts"),
]:
    if re.search(pat, html):
        fail(f"殘留 {what}")
if re.search(r'(?:href|src)="src/', html):
    fail("殘留 src/ 相對參照")

for name in ("index.html", "zi-zai.html"):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(html)

raw = html.encode("utf-8")
print(f"打包完成：{os.path.join(OUT, 'index.html')} 與 zi-zai.html（內容相同）")
print(f"大小 {len(raw):,} 位元組，md5 {hashlib.md5(raw).hexdigest()}，內嵌一到六年級 115-1（6 檔）＋110 學年度＋體驗版")
