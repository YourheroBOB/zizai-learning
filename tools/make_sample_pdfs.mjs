#!/usr/bin/env node
/**
 * make_sample_pdfs.mjs
 * 重新產生 dist/ 內的兩份範例 PDF，並保證兩份「來自同一次出題」：
 *   dist/sample-worksheet-with-answers.pdf  含答案版（學生卷 1 頁＋答案卷 1 頁，共 2 頁）
 *   dist/sample-worksheet.pdf               學生版（只有學生卷，1 頁）
 *
 * 作法：本機 Chrome 無頭模式＋DevTools Protocol，同一個頁面、同一份 DOM。
 *   1) 開啟 dist/zi-zai.html#worksheet（預設設定：康軒、自動進度），等待出題完成
 *   2) 先 Page.printToPDF 印含答案版
 *   3) 再注入 CSS 隱藏 .tp-sheet--answer，同一份 DOM 印學生版
 *
 * 零依賴：只用 Node 22+ 內建的 fetch / WebSocket / http / child_process，不需 npm install。
 * 頁面由本腳本用內建 http 伺服器暫時掛在 127.0.0.1 的隨機埠，結束時會關閉；
 * 也會關掉自己啟動的那個 Chrome（不會動到其他 Chrome 行程）。
 *
 * 前置：先跑 `python3 tools/bundle.py` 讓 dist/zi-zai.html 是最新版。
 * 注意：打包後的 dist/zi-zai.html 已移除 Google Fonts，字型走系統備援；若要與舊版範例 PDF 外觀一致，需自行確認字型。
 *
 * 用法：
 *   node tools/make_sample_pdfs.mjs
 *   node tools/make_sample_pdfs.mjs --out /some/dir      # 改輸出資料夾（預設 dist/）
 *   CHROME_BIN="/path/to/chrome" node tools/make_sample_pdfs.mjs
 *
 * 結束時會印出「兩份 PDF 共用的第 1 題句子」，可據此確認來自同一次出題。
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT_DIR = resolve(argOf('--out') || join(ROOT, 'dist'));
const PAGE_PATH = '/dist/zi-zai.html';

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const p = CHROME_CANDIDATES.find((c) => existsSync(c));
  if (!p) throw new Error('找不到 Chrome，請用 CHROME_BIN 環境變數指定路徑');
  return p;
}

// ---- 臨時靜態伺服器（只服務專案資料夾，只聽 127.0.0.1） ----
function startServer() {
  return new Promise((res) => {
    const server = createServer((req, resp) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = resolve(join(ROOT, urlPath));
      if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
        resp.writeHead(404).end('not found');
        return;
      }
      resp.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      resp.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => res(server));
  });
}

// ---- 最小 CDP 客戶端 ----
function connect(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`)) : ok(msg.result);
      } else if (msg.method) {
        listeners.forEach((fn) => fn(msg));
      }
    };
    ws.onerror = (e) => rej(new Error('WebSocket 連線失敗'));
    ws.onopen = () => {
      const send = (method, params = {}, sessionId) =>
        new Promise((ok, reject) => {
          const myId = ++id;
          pending.set(myId, { resolve: ok, reject });
          ws.send(JSON.stringify({ id: myId, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      res({ send, on: (fn) => listeners.push(fn), close: () => ws.close() });
    };
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const pageUrl = `http://127.0.0.1:${port}${PAGE_PATH}#worksheet`;

  const profile = mkdtempSync(join(tmpdir(), 'zizai-chrome-'));
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true }, // 自成一個行程群組，收尾時整組清掉
  );

  let cleaned = false;
  const cleanup = async (cdp) => {
    if (cleaned) return;
    cleaned = true;
    try { if (cdp) await cdp.send('Browser.close'); } catch { /* 已關閉 */ }
    await Promise.race([new Promise((r) => chrome.once('exit', r)), sleep(3000)]);
    // 只清自己啟動的那一組行程（負的 pid＝行程群組），不會碰到其他 Chrome
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* 群組已不存在 */ }
    server.close();
    rmSync(profile, { recursive: true, force: true });
  };

  let cdp;
  try {
    // 從 stderr 取得 DevTools WebSocket 位址
    const wsUrl = await new Promise((res, rej) => {
      let buf = '';
      const timer = setTimeout(() => rej(new Error('等不到 Chrome DevTools 位址')), 20000);
      chrome.stderr.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(timer); res(m[1]); }
      });
      chrome.once('exit', () => rej(new Error('Chrome 提前結束')));
    });

    cdp = await connect(wsUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => cdp.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('頁面腳本錯誤：' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    await call('Page.enable');
    await call('Page.navigate', { url: pageUrl });

    // 等待出題完成（學生卷與答案卷的題目都已渲染）
    const t0 = Date.now();
    for (;;) {
      const ready = await evaluate(
        `document.querySelectorAll('#sheet-items > *').length > 0 && document.querySelectorAll('#answer-items > *').length > 0 && document.querySelectorAll('#sheet-words > *').length > 0`,
      ).catch(() => false);
      if (ready) break;
      if (Date.now() - t0 > 20000) throw new Error('逾時：考卷沒有渲染出題目');
      await sleep(200);
    }
    // 等字型載入完（含 Google Fonts）
    await evaluate(`document.fonts.ready.then(() => true)`);
    await sleep(500);

    const firstQ = (sel) => `(document.querySelector('${sel} > *')?.textContent || '').replace(/\\s+/g, '')`;
    const studentQ1 = await evaluate(firstQ('#sheet-items'));
    const answerQ1 = await evaluate(firstQ('#answer-items'));

    const pdfParams = {
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      printBackground: true,
      preferCSSPageSize: true,
    };
    const printTo = async (name) => {
      const { data } = await call('Page.printToPDF', pdfParams);
      writeFileSync(join(OUT_DIR, name), Buffer.from(data, 'base64'));
      console.log(`已寫入 ${join(OUT_DIR, name)}`);
    };

    // 1) 含答案版（學生卷＋答案卷）
    await printTo('sample-worksheet-with-answers.pdf');

    // 2) 同一份 DOM：隱藏答案卷，印學生版
    await evaluate(`(() => {
      const s = document.createElement('style');
      s.id = 'zz-hide-answer';
      s.textContent = '.tp-sheet--answer { display: none !important; }';
      document.head.appendChild(s);
      return true;
    })()`);
    await sleep(200);
    await printTo('sample-worksheet.pdf');

    console.log(`第 1 題（學生卷 DOM）：${studentQ1}`);
    console.log(`第 1 題（答案卷 DOM）：${answerQ1}`);
  } finally {
    await cleanup(cdp);
    if (cdp) cdp.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('失敗：', err.message);
    process.exit(1);
  },
);
