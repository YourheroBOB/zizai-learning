#!/usr/bin/env node
/**
 * zizai-learning 整合測試：CLI、教材檔案 I/O、本機靜態載入與錯誤路徑。
 *
 * 所有會寫入的 CLI 測試都在 os.tmpdir() 的暫存目錄執行；repo 僅供讀取。
 * HTTP 情境只連線本測試在 127.0.0.1 啟動的暫存伺服器，不呼叫外部服務。
 *
 * 執行：node --test tests/test_fmb_integration_cli_site.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_DIRS = [];

function repoPath(relativePath) {
  return path.join(ROOT, relativePath);
}

function makeTempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `zizai-fmb-${label}-`));
  TEMP_DIRS.push(dir);
  return dir;
}

function cleanupTempDirs() {
  for (const dir of TEMP_DIRS.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    timeout: options.timeout || 180_000,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      PATH: process.env.PATH || '',
      PYTHONDONTWRITEBYTECODE: '1',
      ...(options.env || {}),
    },
  });
}

function findPython() {
  for (const command of ['python3', 'python']) {
    const result = spawnSync(command, ['-c', 'print("PYTHON_OK")'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH || '', PYTHONDONTWRITEBYTECODE: '1' },
    });
    if (!result.error && result.status === 0 && result.stdout.includes('PYTHON_OK')) {
      return command;
    }
  }
  return null;
}

function copyDataWithoutSourceSnapshots(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => !path.relative(source, entry).split(path.sep).includes('sources'),
  });
}

function copyBundleFixture(destination) {
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(repoPath('index.html'), path.join(destination, 'index.html'));
  fs.cpSync(repoPath('src'), path.join(destination, 'src'), { recursive: true });
  copyDataWithoutSourceSnapshots(repoPath('data'), path.join(destination, 'data'));

  const toolsDir = path.join(destination, 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.copyFileSync(repoPath('tools/bundle.py'), path.join(toolsDir, 'bundle.py'));
}

function jsonFileHashes(root) {
  const hashes = {};
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
        hashes[relativePath] = createHash('sha256')
          .update(fs.readFileSync(fullPath))
          .digest('hex');
      }
    }
  }
  return hashes;
}

function startLocalStaticServer(rootDir) {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }

    const target = path.resolve(rootDir, `.${pathname}`);
    if (target !== rootDir && !target.startsWith(`${rootDir}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      response.writeHead(404).end();
      return;
    }

    if (!stat.isFile()) {
      response.writeHead(404).end();
      return;
    }

    const contentType = target.endsWith('.json')
      ? 'application/json; charset=utf-8'
      : target.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : 'text/plain; charset=utf-8';

    response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(target));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('Node.js 原始碼與現有邏輯測試可由 CLI 執行', () => {
  const jsFiles = [
    'src/zhuyin.js',
    'src/readings.js',
    'src/app.js',
    'tools/make_sample_pdfs.mjs',
    'tests/test_zizai.js',
    'tests/test_fmb_integration_cli_site.test.mjs',
  ];

  for (const relativePath of jsFiles) {
    assert.ok(fs.existsSync(repoPath(relativePath)), `找不到必要檔案：${relativePath}`);
    const result = run(process.execPath, ['--check', repoPath(relativePath)]);
    assert.equal(
      result.status,
      0,
      `${relativePath} 語法檢查失敗：${result.stderr || result.stdout || '無診斷訊息'}`,
    );
  }

  const legacyTests = run(process.execPath, ['tests/test_zizai.js']);
  assert.equal(
    legacyTests.status,
    0,
    `既有邏輯測試失敗：${legacyTests.stderr || legacyTests.stdout || '無診斷訊息'}`,
  );
});

test('Python 工具可編譯，且不產生 .pyc 或 __pycache__', (t) => {
  const python = findPython();
  if (!python) {
    t.skip('找不到 python3 或 python，略過 Python CLI 檢查');
    return;
  }

  const files = ['tools/bundle.py', 'tools/build_grades_from_sources.py'];
  const compileCode =
    'import sys; [compile(open(p, encoding="utf-8").read(), p, "exec") for p in sys.argv[1:]]';
  const result = run(python, ['-c', compileCode, ...files.map(repoPath)]);
  assert.equal(
    result.status,
    0,
    `Python 工具編譯失敗：${result.stderr || result.stdout || '無診斷訊息'}`,
  );

  for (const relativePath of files) {
    assert.ok(fs.existsSync(repoPath(relativePath)), `找不到必要檔案：${relativePath}`);
  }
});

test('網頁入口的本機 CSS、JavaScript 引用存在且順序符合打包器', () => {
  const html = fs.readFileSync(repoPath('index.html'), 'utf8');
  const bundleScript = fs.readFileSync(repoPath('tools/bundle.py'), 'utf8');

  const localReferences = [
    ...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="(src\/[^"]+)"/g),
  ].map((match) => match[1]);

  assert.deepEqual(
    localReferences.filter((item) => item.endsWith('.css')),
    ['src/tokens.css', 'src/base.css', 'src/components.css', 'src/zhuyin.css', 'src/print.css'],
    'CSS 引用順序需與打包器預期一致',
  );
  assert.deepEqual(
    localReferences.filter((item) => item.endsWith('.js')),
    ['src/zhuyin.js', 'src/readings.js', 'src/app.js'],
    'JavaScript 引用順序需與打包器預期一致',
  );

  for (const relativePath of localReferences) {
    assert.ok(fs.existsSync(repoPath(relativePath)), `入口引用的本機檔案不存在：${relativePath}`);
  }

  assert.ok(bundleScript.includes('css_names = ["tokens.css", "base.css", "components.css", "zhuyin.css", "print.css"]'));
  assert.ok(bundleScript.includes('["zhuyin.js", "readings.js", "app.js"]'));
});

test('教材 JSON 可讀取，且課次與詞語注音欄位具備基本一致性', () => {
  const app = fs.readFileSync(repoPath('src/app.js'), 'utf8');
  const dataFiles = [...new Set(
    [...app.matchAll(/\d:\s*'(data\/[^']+\.json)'/g)].map((match) => match[1]),
  )];

  assert.ok(dataFiles.length > 0, '未能從主程式找到教材資料檔對照');

  for (const relativePath of dataFiles) {
    const data = JSON.parse(fs.readFileSync(repoPath(relativePath), 'utf8'));
    assert.ok(data.meta && typeof data.meta === 'object', `${relativePath} 缺少 meta`);
    assert.ok(data.publishers && typeof data.publishers === 'object', `${relativePath} 缺少 publishers`);

    for (const [publisher, details] of Object.entries(data.publishers)) {
      assert.ok(Array.isArray(details.lessons), `${relativePath} 的 ${publisher} lessons 必須是陣列`);
      for (const lesson of details.lessons) {
        assert.ok(Number.isInteger(lesson.lessonNo), `${relativePath} 含無效 lessonNo`);
        assert.ok(Array.isArray(lesson.characters), `${relativePath} 含無效 characters`);
        assert.ok(Array.isArray(lesson.words), `${relativePath} 含無效 words`);

        for (const word of lesson.words) {
          assert.ok(typeof word.word === 'string', `${relativePath} 含無效詞語`);
          assert.ok(Array.isArray(word.bopomofoArray), `${relativePath} 詞語缺少 bopomofoArray`);
          assert.equal(
            Array.from(word.word).length,
            word.bopomofoArray.length,
            `${relativePath} 詞語字數與注音陣列長度不一致`,
          );
          assert.ok(word.bopomofoArray.every((syllable) => typeof syllable === 'string' && syllable.length > 0));
        }
      }
    }
  }
});

test('本機 HTTP 情境可載入入口與教材，並拒絕不存在路徑和非 GET 方法', async () => {
  const server = await startLocalStaticServer(ROOT);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const pageResponse = await fetch(`${baseUrl}/index.html`);
    assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    assert.ok(page.includes('字在'));
    assert.ok(page.includes('src/app.js'));

    const dataResponse = await fetch(`${baseUrl}/data/curriculum-115-1.json`);
    assert.equal(dataResponse.status, 200);
    const data = await dataResponse.json();
    assert.ok(data.publishers && Object.keys(data.publishers).length > 0);

    const missingResponse = await fetch(`${baseUrl}/data/__fmb_integration_missing__.json`);
    assert.equal(missingResponse.status, 404);

    const methodResponse = await fetch(`${baseUrl}/index.html`, { method: 'POST' });
    assert.equal(methodResponse.status, 405);
    assert.equal(methodResponse.headers.get('allow'), 'GET, HEAD');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('bundle.py 在暫存複本中完成打包，產物一致且不改寫來源教材', (t) => {
  const python = findPython();
  if (!python) {
    t.skip('找不到 python3 或 python，略過打包 CLI 測試');
    return;
  }

  const tempRoot = makeTempDir('bundle');
  const fixtureRoot = path.join(tempRoot, 'repo');
  const outputDir = path.join(tempRoot, 'output');
  copyBundleFixture(fixtureRoot);

  const dataDir = path.join(fixtureRoot, 'data');
  const before = jsonFileHashes(dataDir);
  const result = run(python, [path.join(fixtureRoot, 'tools', 'bundle.py')], {
    cwd: fixtureRoot,
    env: { ZIZAI_OUT: outputDir },
  });

  assert.equal(
    result.status,
    0,
    `bundle.py 執行失敗：${result.stderr || result.stdout || '無診斷訊息'}`,
  );

  const bundledIndex = path.join(outputDir, 'index.html');
  const bundledAlias = path.join(outputDir, 'zi-zai.html');
  assert.ok(fs.existsSync(bundledIndex), '打包未產生 index.html');
  assert.ok(fs.existsSync(bundledAlias), '打包未產生 zi-zai.html');
  assert.equal(fs.readFileSync(bundledIndex, 'utf8'), fs.readFileSync(bundledAlias, 'utf8'));
  assert.deepEqual(jsonFileHashes(dataDir), before, '打包不應改寫教材 JSON');

  const bundledHtml = fs.readFileSync(bundledIndex, 'utf8');
  assert.ok(bundledHtml.includes('window.__EMBEDDED_GRADES__'));
  assert.doesNotMatch(bundledHtml, /<(?:script|link)\b[^>]*(?:src|href)="src\//);
});

test('重建工具缺少來源快照時回傳 2，且不改寫教材資料', (t) => {
  const python = findPython();
  if (!python) {
    t.skip('找不到 python3 或 python，略過資料重建錯誤路徑測試');
    return;
  }

  const tempRoot = makeTempDir('build-missing-sources');
  const fixtureRoot = path.join(tempRoot, 'repo');
  const fixtureData = path.join(fixtureRoot, 'data');
  const fixtureTools = path.join(fixtureRoot, 'tools');

  fs.mkdirSync(fixtureData, { recursive: true });
  fs.mkdirSync(fixtureTools, { recursive: true });
  copyDataWithoutSourceSnapshots(repoPath('data'), fixtureData);
  fs.copyFileSync(
    repoPath('tools/build_grades_from_sources.py'),
    path.join(fixtureTools, 'build_grades_from_sources.py'),
  );

  const before = jsonFileHashes(fixtureData);
  const result = run(python, [path.join(fixtureTools, 'build_grades_from_sources.py')], {
    cwd: fixtureRoot,
  });

  assert.equal(
    result.status,
    2,
    `缺少來源快照時預期結束碼 2，實際為 ${result.status}；${result.stderr || result.stdout || ''}`,
  );
  assert.deepEqual(jsonFileHashes(fixtureData), before, '缺少來源快照時不得改寫教材 JSON');
});

test.after(() => {
  cleanupTempDirs();
});
