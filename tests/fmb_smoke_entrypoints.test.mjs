import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.PYTHON || 'python3';
const require = createRequire(import.meta.url);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    ...options,
  });
}

test('可匯入共用 JavaScript 模組，且前端與工具腳本語法有效', () => {
  for (const relativePath of ['src/zhuyin.js', 'src/readings.js']) {
    const loaded = require(join(REPO_ROOT, relativePath));
    assert.ok(loaded, `${relativePath} 應可匯入`);
  }

  for (const relativePath of [
    'src/app.js',
    'src/readings.js',
    'src/zhuyin.js',
    'tools/make_sample_pdfs.mjs',
  ]) {
    const result = run(process.execPath, ['--check', join(REPO_ROOT, relativePath)]);
    assert.equal(
      result.status,
      0,
      `${relativePath} 語法檢查失敗：${result.stderr || result.stdout}`,
    );
  }

  const pythonFiles = [
    'tools/build_datasets.py',
    'tools/build_grades_from_sources.py',
    'tools/bundle.py',
  ].map((relativePath) => join(REPO_ROOT, relativePath));
  const pythonCheck = run(
    PYTHON,
    [
      '-c',
      'import sys; [compile(open(p, encoding="utf-8").read(), p, "exec") for p in sys.argv[1:]]',
      ...pythonFiles,
    ],
    {
      env: {
        PATH: process.env.PATH || '',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    },
  );
  assert.equal(
    pythonCheck.status,
    0,
    `Python 工具語法檢查失敗：${pythonCheck.stderr || pythonCheck.stdout}`,
  );
});

test('教材重建入口在缺少來源時安全回報，不連網且不產生資料檔', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'zizai-fmb-smoke-build-'));
  try {
    const isolatedTools = join(sandbox, 'tools');
    mkdirSync(isolatedTools, { recursive: true });
    const isolatedScript = join(isolatedTools, 'build_grades_from_sources.py');
    copyFileSync(
      join(REPO_ROOT, 'tools', 'build_grades_from_sources.py'),
      isolatedScript,
    );

    const result = run(PYTHON, [isolatedScript], {
      cwd: sandbox,
      env: {
        PATH: process.env.PATH || '',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    });

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /CSV|快照|dict-revised|辭典/i,
      '缺少來源時應提供可辨識的診斷訊息',
    );
    assert.deepEqual(readdirSync(sandbox).sort(), ['tools']);
    assert.deepEqual(readdirSync(isolatedTools), ['build_grades_from_sources.py']);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('單檔打包入口可離線產生一致的啟動頁面', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'zizai-fmb-smoke-bundle-'));
  const outputDir = join(sandbox, 'output');
  try {
    const result = run(PYTHON, [join(REPO_ROOT, 'tools', 'bundle.py')], {
      env: {
        PATH: process.env.PATH || '',
        PYTHONDONTWRITEBYTECODE: '1',
        ZIZAI_OUT: outputDir,
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const indexHtml = readFileSync(join(outputDir, 'index.html'), 'utf8');
    const shareHtml = readFileSync(join(outputDir, 'zi-zai.html'), 'utf8');
    assert.equal(shareHtml, indexHtml, '兩個離線入口應為相同內容');
    assert.match(indexHtml, /__EMBEDDED_GRADES__/);
    assert.match(indexHtml, /__EMBEDDED_CURRICULUM_110__/);
    assert.match(indexHtml, /__EMBEDDED_CURRICULUM_DEMO__/);
    assert.doesNotMatch(indexHtml, /fonts\.(?:googleapis|gstatic)\.com/i);
    assert.doesNotMatch(indexHtml, /<link\b[^>]*href="src\//i);
    assert.doesNotMatch(indexHtml, /<script\b[^>]*src="src\//i);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
