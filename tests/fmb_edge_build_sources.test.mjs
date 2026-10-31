import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const outputFiles = [
  'curriculum-115-1-g1.json',
  'curriculum-115-1-g3.json',
  'curriculum-115-1-g4.json',
  'curriculum-115-1-g5.json',
  'curriculum-115-1-g6.json',
];

test('缺少來源檔時以結束碼 2 失敗，且不改寫教材輸出檔', (t) => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'zizai-fmb-edge-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  const toolsDir = join(fixtureRoot, 'tools');
  const gradesDir = join(fixtureRoot, 'data');
  mkdirSync(toolsDir, { recursive: true });
  mkdirSync(join(gradesDir, 'sources', 'gsyan'), { recursive: true });
  mkdirSync(join(gradesDir, 'sources', 'moedict'), { recursive: true });

  const sourceScript = join(repoRoot, 'tools', 'build_grades_from_sources.py');
  const fixtureScript = join(toolsDir, 'build_grades_from_sources.py');
  copyFileSync(sourceScript, fixtureScript);

  // 用明顯的假內容做輸出哨兵；缺來源時，建置流程不應碰這些檔案。
  const sentinel = '{"marker":"FAKE_VALUE_FOR_TEST"}\n';
  for (const name of outputFiles) {
    writeFileSync(join(gradesDir, name), sentinel, 'utf8');
  }
  const before = outputFiles.map((name) =>
    readFileSync(join(gradesDir, name), 'utf8'),
  );

  const result = spawnSync('python3', [fixtureScript], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    timeout: 10_000,
    // 不傳遞其他環境變數；測試不需要網路或憑證設定。
    env: {
      PATH: process.env.PATH ?? '',
      PYTHONIOENCODING: 'utf-8',
    },
  });

  assert.equal(result.error, undefined, '建置腳本應能正常啟動並結束');
  assert.equal(result.status, 2, '缺少來源檔時應回報預期的結束碼 2');

  const after = outputFiles.map((name) =>
    readFileSync(join(gradesDir, name), 'utf8'),
  );
  assert.deepEqual(after, before, '缺少來源檔時不得改寫任何年級教材輸出檔');
});
