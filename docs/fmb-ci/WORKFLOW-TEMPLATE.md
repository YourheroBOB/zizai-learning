# CI 工作流程範本（提案用）

> 以下 YAML 是供維護者評估及後續採用的範本，不是已建立的工作流程。本次任務不新增或修改 `.github/`。採用前請檢查 Actions 與掃描器版本、組織的外連政策及必要檢查名稱。

## 驗證工作流程範本

範本不含部署工作、不要求 repo secrets，也不呼叫正式服務。套件掃描器只有在偵測到相應清單時才執行；對目前沒有相依清單的 repo，會清楚標示 N/A。

```yaml
name: CI quality gates

on:
  pull_request:
  push:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Lint, tests, scans and build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout full history for secret scanning
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: JavaScript lint
        run: |
          npx --yes --package=eslint@8.57.1 eslint \
            --no-eslintrc \
            --env browser,node,es2022 \
            --parser-options '{"ecmaVersion":2022,"sourceType":"module"}' \
            --rule 'no-unreachable:error' \
            --rule 'valid-typeof:error' \
            --rule 'no-dupe-keys:error' \
            src/*.js tests/*.js tests/*.mjs tools/*.mjs

      - name: JavaScript syntax and Python syntax
        run: |
          set -euo pipefail
          for file in src/*.js tests/*.js tests/*.mjs tools/*.mjs; do
            node --check "$file"
          done
          python - <<'PY'
          import ast
          from pathlib import Path

          for path in sorted(Path("tools").glob("*.py")):
              ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
          PY

      - name: Type check when a project config exists
        run: |
          set -euo pipefail
          if [ -f tsconfig.json ]; then
            npx --yes --package=typescript@5.7.3 tsc --noEmit
          elif [ -f jsconfig.json ]; then
            npx --yes --package=typescript@5.7.3 tsc --project jsconfig.json --noEmit
          else
            echo "::notice::Type check is N/A: no tsconfig.json or jsconfig.json."
          fi

      - name: Project tests
        run: |
          set -euo pipefail
          node tests/test_zizai.js
          node --test tests/test_fmb_zhuyin.test.mjs

      - name: Coverage report (no blocking threshold until baseline review)
        run: |
          set -euo pipefail
          npx --yes --package=c8@10.1.3 c8 \
            --all \
            --include='src/**/*.js' \
            --reporter=text \
            --reporter=lcov \
            --reports-dir=.ci-coverage \
            node tests/test_zizai.js

      - name: Dependency scan when supported manifests exist
        run: |
          set -euo pipefail

          if [ -f package.json ] || [ -f package-lock.json ]; then
            test -f package.json
            test -f package-lock.json
            npm audit --audit-level=high
          else
            echo "::notice::npm dependency scan is N/A: no npm manifest or lockfile."
          fi

          if [ -f requirements.txt ]; then
            python -m pip install --disable-pip-version-check 'pip-audit==2.7.3'
            pip-audit -r requirements.txt
          elif [ -f pyproject.toml ] || [ -f poetry.lock ] || [ -f uv.lock ]; then
            echo "::error::A Python dependency manifest exists but this template does not scan its format. Add the matching lockfile scanner before merging."
            exit 1
          else
            echo "::notice::Python dependency scan is N/A: no Python dependency manifest."
          fi

      - name: Secret scan (redacted, including Git history)
        run: |
          docker run --rm \
            -v "$GITHUB_WORKSPACE:/repo:ro" \
            -w /repo \
            zricethezav/gitleaks:v8.24.2 \
            git --redact --no-banner /repo

      - name: Build single-file offline output
        run: |
          set -euo pipefail
          build_dir=".ci-build"
          trap 'rm -rf -- "$build_dir"' EXIT
          mkdir -p "$build_dir"
          ZIZAI_OUT="$build_dir/dist" python3 tools/bundle.py
          test -s "$build_dir/dist/index.html"
          test -s "$build_dir/dist/zi-zai.html"
          cmp "$build_dir/dist/index.html" "$build_dir/dist/zi-zai.html"
```

## 採用說明

- 本範本使用 Node.js 22，與 `README.md` 記載的測試執行環境一致；Python 版本須由維護者確認後再固定。
- ESLint 範例只啟用少量錯誤檢查，避免在沒有既有 lint 設定與基準時引入大量未整理的風格錯誤。若改用完整規則集，應先本機試跑並明確審核基準差異。
- 型別步驟在目前檔案清單下會標示 N/A，不代表型別檢查已完成。加入 `jsconfig.json` 或 `tsconfig.json` 前，應先檢查既有程式的型別診斷。
- 覆蓋率步驟目前只產生報告，不設門檻。確認報告涵蓋預期模組後，再另行提出具基準支持的門檻。
- 範例相依掃描只支援 `package-lock.json` 及 `requirements.txt`。若新增其他 manifest 或 lockfile，必須先為其加入對應掃描；不可因掃描器不支援而默默略過。
- `pip-audit` 與 ESLint、c8 只作為 CI 工具，不應加進應用程式執行期相依。工具版本需由維護者定期檢查與更新。
- Gitleaks 使用版本標籤作為易讀範例。正式採用時，建議依組織政策固定到經審核的映像 digest，並維護升級流程；掃描輸出應保持遮罩。
- 範例沒有上傳覆蓋率報告或建置產物，也沒有發佈 job。發布需在確認預設分支、Pages 發布來源、審核要求及平台權限後另行設計。
- 目前測試可能因缺少未收入 repo 的來源快照而略過部分比對；應檢視測試輸出並保留略過狀態，不要為了讓 CI 顯示全數通過而下載、提交或偽造來源資料。
