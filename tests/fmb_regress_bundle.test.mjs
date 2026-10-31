import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('離線打包產物維持單檔、兩份輸出一致，且只保留條件式回報請求', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'zizai-fmb-regress-'));
  const outputDir = join(tempDir, 'bundle-output');

  try {
    execFileSync('python3', [join(ROOT, 'tools', 'bundle.py')], {
      cwd: ROOT,
      env: { ...process.env, ZIZAI_OUT: outputDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const bundled = readFileSync(join(outputDir, 'index.html'), 'utf8');
    const alias = readFileSync(join(outputDir, 'zi-zai.html'), 'utf8');

    assert.equal(alias, bundled, '離線版的兩個檔名應輸出相同內容');
    assert.match(bundled, /window\.__EMBEDDED_GRADES__/);
    assert.match(bundled, /window\.__EMBEDDED_CURRICULUM_110__/);
    assert.match(bundled, /window\.__EMBEDDED_CURRICULUM_DEMO__/);

    assert.doesNotMatch(bundled, /<link\b[^>]*href=["']https?:\/\//i);
    assert.doesNotMatch(bundled, /<script\b[^>]*src=["']https?:\/\//i);
    assert.doesNotMatch(bundled, /fonts\.(?:googleapis|gstatic)\.com/i);

    const reportCalls = [...bundled.matchAll(/\bfetchImpl\s*\(/g)];
    assert.equal(reportCalls.length, 1, '打包後只應保留一處回報請求呼叫');
    assert.match(bundled, /const REPORT_PATH = ['"]\/api\/report['"]/);
    assert.doesNotMatch(bundled, /\b(?:XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)\b/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
