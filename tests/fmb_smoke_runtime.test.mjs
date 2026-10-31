import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    ...options,
  });
}

test('前端 JavaScript 與工具腳本可通過執行環境語法檢查', async () => {
  const sourceFiles = (await readdir(join(ROOT, 'src')))
    .filter((name) => name.endsWith('.js'))
    .map((name) => join(ROOT, 'src', name));

  assert.ok(sourceFiles.length > 0, '應找到前端 JavaScript 模組');

  for (const file of sourceFiles) {
    const result = run(process.execPath, ['--check', file]);
    assert.equal(result.status, 0, `前端模組語法檢查失敗：${file}`);
  }

  const toolFiles = (await readdir(join(ROOT, 'tools')))
    .filter((name) => name.endsWith('.mjs') || name.endsWith('.js') || name.endsWith('.py'))
    .map((name) => join(ROOT, 'tools', name));

  for (const file of toolFiles) {
    if (file.endsWith('.py')) {
      const result = run('python3', [
        '-c',
        'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
        file,
      ]);
      assert.equal(result.status, 0, `Python 工具語法檢查失敗：${file}`);
    } else {
      const result = run(process.execPath, ['--check', file]);
      assert.equal(result.status, 0, `Node.js 工具語法檢查失敗：${file}`);
    }
  }
});

test('離線打包入口在臨時輸出目錄啟動並產生一致的單檔頁面', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'zizai-fmb-smoke-'));

  try {
    const outputDir = join(tempDir, 'bundle-output');
    const result = run('python3', ['tools/bundle.py'], {
      env: {
        ...process.env,
        ZIZAI_OUT: outputDir,
      },
    });

    assert.equal(result.status, 0, '離線打包入口應成功完成');
    assert.equal(result.error, undefined, '離線打包入口不應有啟動錯誤');

    const bundledIndex = await readFile(join(outputDir, 'index.html'), 'utf8');
    const bundledAlias = await readFile(join(outputDir, 'zi-zai.html'), 'utf8');

    assert.equal(bundledAlias, bundledIndex, '兩個離線入口應為相同內容');
    assert.match(bundledIndex, /window\.__EMBEDDED_GRADES__/);
    assert.match(bundledIndex, /window\.__EMBEDDED_CURRICULUM_110__/);
    assert.match(bundledIndex, /window\.__EMBEDDED_CURRICULUM_DEMO__/);
    assert.doesNotMatch(bundledIndex, /<script\b[^>]*\bsrc=/i);
    assert.doesNotMatch(bundledIndex, /<link\b[^>]*\bhref=["']https?:\/\//i);
    assert.doesNotMatch(bundledIndex, /fonts\.(?:googleapis|gstatic)\.com/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
