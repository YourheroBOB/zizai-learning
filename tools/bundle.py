#!/usr/bin/env python3
"""
bundle.py
Bundles all CSS, JS, and JSON data into a single, self-contained HTML file:
1. dist/index.html (for GitHub Pages deployment)
2. dist/zi-zai.html (for single-file offline sharing)
"""

import json
import os
import re

BASE_DIR = "/Users/bob/OpenClawWork/zi-zai-web"
DIST_DIR = os.path.join(BASE_DIR, "dist")
os.makedirs(DIST_DIR, exist_ok=True)

# Read index.html
with open(os.path.join(BASE_DIR, "index.html"), 'r', encoding='utf-8') as f:
    html = f.read()

# Read CSS files
css_files = ["tokens.css", "base.css", "components.css", "zhuyin.css", "print.css"]
combined_css = []
for c_file in css_files:
    c_path = os.path.join(BASE_DIR, "src", c_file)
    if os.path.exists(c_path):
        with open(c_path, 'r', encoding='utf-8') as f:
            combined_css.append(f"/* === {c_file} === */\n" + f.read())

# Read JS files
with open(os.path.join(BASE_DIR, "src", "zhuyin.js"), 'r', encoding='utf-8') as f:
    zhuyin_js = f.read()

with open(os.path.join(BASE_DIR, "src", "app.js"), 'r', encoding='utf-8') as f:
    app_js = f.read()

# Read JSON datasets
with open(os.path.join(BASE_DIR, "data", "curriculum-115-1.json"), 'r', encoding='utf-8') as f:
    data_115 = json.load(f)

with open(os.path.join(BASE_DIR, "data", "curriculum-110.json"), 'r', encoding='utf-8') as f:
    data_110 = json.load(f)

with open(os.path.join(BASE_DIR, "data", "curriculum-demo.json"), 'r', encoding='utf-8') as f:
    data_demo = json.load(f)

# Modify app.js so that instead of fetch(), it uses the pre-embedded data directly
embedded_data_script = f"""
<script>
  window.__EMBEDDED_CURRICULUM_115__ = {json.dumps(data_115, ensure_ascii=False)};
  window.__EMBEDDED_CURRICULUM_110__ = {json.dumps(data_110, ensure_ascii=False)};
  window.__EMBEDDED_CURRICULUM_DEMO__ = {json.dumps(data_demo, ensure_ascii=False)};
</script>
"""

FETCH_BLOCK = """    // 載入 JSON 資料
    try {
      const [res115, res110, resDemo] = await Promise.all([
        fetch('data/curriculum-115-1.json').then((r) => r.json()),
        fetch('data/curriculum-110.json').then((r) => r.json()),
        fetch('data/curriculum-demo.json').then((r) => r.json())
      ]);
      state.curriculum115 = res115;
      state.curriculum110 = res110;
      state.curriculumDemo = resDemo;
    } catch (e) {
      console.error('載入教材資料檔失敗', e);
      alert('教材資料載入失敗，請確認網路連線或本機檔案路徑。');
      return;
    }"""

EMBEDDED_BLOCK = """    // 載入 JSON 資料（內嵌優先）
    if (window.__EMBEDDED_CURRICULUM_115__) {
      state.curriculum115 = window.__EMBEDDED_CURRICULUM_115__;
      state.curriculum110 = window.__EMBEDDED_CURRICULUM_110__;
      state.curriculumDemo = window.__EMBEDDED_CURRICULUM_DEMO__;
    } else {
      try {
        const [res115, res110, resDemo] = await Promise.all([
          fetch('data/curriculum-115-1.json').then((r) => r.json()),
          fetch('data/curriculum-110.json').then((r) => r.json()),
          fetch('data/curriculum-demo.json').then((r) => r.json())
        ]);
        state.curriculum115 = res115;
        state.curriculum110 = res110;
        state.curriculumDemo = resDemo;
      } catch (e) {
        console.error('載入教材資料檔失敗', e);
        alert('教材資料載入失敗，請確認網路連線或本機檔案路徑。');
        return;
      }
    }"""

app_js_patched = app_js.replace(FETCH_BLOCK, EMBEDDED_BLOCK)

# Replace external CSS links with inline <style>
css_links_regex = r'<link\s+rel="stylesheet"\s+href="src/[^"]+">'
html_bundled = re.sub(css_links_regex, '', html)

style_tag = f"<style>\n{chr(10).join(combined_css)}\n</style>"
html_bundled = html_bundled.replace('</head>', f"{style_tag}\n</head>")

# Replace external scripts with inline scripts
scripts_regex = r'<script\s+src="src/[^"]+"></script>'
html_bundled = re.sub(scripts_regex, '', html_bundled)

full_script_tag = f"""
{embedded_data_script}
<script>
{zhuyin_js}
</script>
<script>
{app_js_patched}
</script>
"""

html_bundled = html_bundled.replace('</body>', f"{full_script_tag}\n</body>")

# Output to dist/index.html and dist/zi-zai.html
out_index = os.path.join(DIST_DIR, "index.html")
out_zizai = os.path.join(DIST_DIR, "zi-zai.html")

with open(out_index, 'w', encoding='utf-8') as f:
    f.write(html_bundled)

with open(out_zizai, 'w', encoding='utf-8') as f:
    f.write(html_bundled)

# Also copy into the parent folder if needed or keep in dist
size_kb = os.path.getsize(out_index) / 1024
print(f"Bundled successfully! Output: {out_index} ({size_kb:.1f} KB)")
print(f"Bundled successfully! Output: {out_zizai} ({size_kb:.1f} KB)")
