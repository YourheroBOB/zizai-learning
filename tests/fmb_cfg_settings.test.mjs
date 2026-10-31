import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = 'python3';

function makeTempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'zizai-fmb-cfg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runBundle(outputPath) {
  return spawnSync(PYTHON, ['tools/bundle.py'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    // 僅傳入測試所需環境變數，不讀取或傳遞其他本機設定。
    env: {
      PATH: process.env.PATH ?? '',
      PYTHONDONTWRITEBYTECODE: '1',
      ZIZAI_OUT: outputPath,
    },
  });
}

test('ZIZAI_OUT 指定暫存輸出目錄時，打包檔寫入該目錄且內容一致', (t) => {
  const outputDir = makeTempDir(t);
  const result = runBundle(outputDir);

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(
    result.status,
    0,
    `打包程序應成功；stderr：${result.stderr}`,
  );

  const bundled = readFileSync(join(outputDir, 'index.html'), 'utf8');
  const alias = readFileSync(join(outputDir, 'zi-zai.html'), 'utf8');
  assert.ok(bundled.startsWith('<!DOCTYPE html>'));
  assert.equal(alias, bundled);
});

test('ZIZAI_OUT 指向既有檔案時，打包應以錯誤結束', (t) => {
  const tempDir = makeTempDir(t);
  const notDirectory = join(tempDir, 'not-a-directory');
  writeFileSync(notDirectory, 'FAKE_VALUE_FOR_TEST');

  const result = runBundle(notDirectory);

  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0, '無效的輸出路徑應被拒絕');
});

test('打包工具保留 ZIZAI_OUT 未設定時的 dist 預設值', () => {
  const source = readFileSync(join(ROOT, 'tools', 'bundle.py'), 'utf8');

  assert.match(
    source,
    /OUT\s*=\s*os\.environ\.get\(["']ZIZAI_OUT["']\)\s*or\s*os\.path\.join\(ROOT,\s*["']dist["']\)/,
  );
});

test('範例 PDF 工具將 CHROME_BIN 列為優先候選，且找不到 Chrome 時明確報錯', () => {
  const source = readFileSync(join(ROOT, 'tools', 'make_sample_pdfs.mjs'), 'utf8');

  assert.match(source, /const CHROME_CANDIDATES\s*=\s*\[\s*process\.env\.CHROME_BIN,/);
  assert.match(source, /CHROME_CANDIDATES\.find\(\(c\)\s*=>\s*existsSync\(c\)\)/);
  assert.match(source, /找不到 Chrome，請用 CHROME_BIN 環境變數指定路徑/);
});

test('資料建置工具的兩個輸入環境變數有文件與程式碼依據', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const builder = readFileSync(join(ROOT, 'tools', 'build_datasets.py'), 'utf8');

  for (const name of ['ZIZAI_G2_HTML', 'ZIZAI_KIMI_JS']) {
    assert.ok(readme.includes(name), `README 應說明 ${name}`);
    assert.ok(builder.includes(name), `資料建置工具應處理 ${name}`);
  }
});

test('打包成功時，兩個輸出檔均存在且非空', (t) => {
  const outputDir = makeTempDir(t);
  const result = runBundle(outputDir);

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `打包程序應成功；stderr：${result.stderr}`);

  for (const name of ['index.html', 'zi-zai.html']) {
    assert.ok(statSync(join(outputDir, name)).size > 0, `${name} 不應為空檔`);
  }
});
