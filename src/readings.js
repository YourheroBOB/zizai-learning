/**
 * readings.js — 「字在」多音字標注與「修改讀音」的純邏輯（第七輪）
 *
 * 不碰 DOM、不直接讀 window：瀏覽器掛在 window.ZizaiReadings，Node 測試用 require。
 * 內容：注音格式驗證、localStorage 修改紀錄（可注入儲存物件、不可用時降級）、
 *      套用到字／語詞音節、回報 payload 與送出（可注入 fetch 實作、一律降級不丟錯）、匯出文字與 JSON。
 * 網路：只有 sendReport 一處、只送使用者主動勾選的同源 POST，其他邏輯完全離線。
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'zizai:readingOverrides:v1';
  const NOTE_MAX = 100;
  const TAG_MIN_RATIO = 0.10;      // 次要讀音占比達此門檻才標「破音」
  const REPORT_PATH = '/api/report';
  const REPORT_TIMEOUT_MS = 10000;

  const GRADE_LABELS = { 1: '一年級', 2: '二年級', 3: '三年級', 4: '四年級', 5: '五年級', 6: '六年級' };
  const PUBLISHER_NAMES = { kangxuan: '康軒', hanlin: '翰林', nanyi: '南一', demo: '體驗版' };

  const MSG_DEGRADED = '已存在你的瀏覽器；這個頁面無法送出回報';
  const MSG_SENT = '已回報，謝謝';

  // ---------------------------------------------------------------
  // 注音格式驗證
  // ---------------------------------------------------------------
  // 注音符號 U+3105（ㄅ）到 U+3129（ㄩ）；聲調 ˊ U+02CA、ˇ U+02C7、ˋ U+02CB、˙ U+02D9；空白（含全形空白）
  const ALLOWED_RE = /^[ㄅ-ㄩˊˇˋ˙\s　]*$/;
  const TONE_CHARS = 'ˊˇˋ˙';
  const LIGHT = '˙';
  const CORE_RE = /^[ㄅ-ㄙ]?[ㄧ-ㄩ]?[ㄚ-ㄦ]?$/;   // 聲母？介音？韻母？

  /**
   * 驗證並正規化使用者輸入的單字讀音。
   * 回傳 { ok:true, value } 或 { ok:false, reason }（reason 為給使用者看的繁中說明）。
   * 輕聲點寫在尾端時搬到最前面（與辭典寫法一致）。
   */
  function validateBopomofo(raw) {
    const s0 = raw == null ? '' : String(raw);
    if (s0.trim() === '') {
      return { ok: false, reason: '請選一個讀音，或在「自行輸入」填入注音。' };
    }
    if (!ALLOWED_RE.test(s0)) {
      const bad = Array.from(s0).filter((ch) => !ALLOWED_RE.test(ch));
      const shown = Array.from(new Set(bad)).slice(0, 3).join('、');
      return {
        ok: false,
        reason: '只能輸入注音符號（ㄅ到ㄩ）與聲調符號（ˊ ˇ ˋ ˙），不能包含「' + shown + '」。'
      };
    }
    let t = s0.replace(/[\s　]+/g, '');
    const tones = t.match(new RegExp('[' + TONE_CHARS + ']', 'g')) || [];
    if (tones.length > 1) {
      return { ok: false, reason: '一個字只有一個音節，聲調符號只能有一個。' };
    }
    if (tones.length === 1) {
      const tone = tones[0];
      if (tone === LIGHT) {
        if (t[0] === LIGHT) {
          // 已是辭典寫法
        } else if (t[t.length - 1] === LIGHT) {
          t = LIGHT + t.slice(0, -1);
        } else {
          return { ok: false, reason: '輕聲點（˙）要放在注音的最前面或最後面。' };
        }
      } else if (t[t.length - 1] !== tone) {
        return { ok: false, reason: '二、三、四聲符號（ˊ ˇ ˋ）要放在注音的最後面。' };
      }
    }
    const core = t.replace(new RegExp('[' + TONE_CHARS + ']', 'g'), '');
    if (core === '' || !CORE_RE.test(core)) {
      return {
        ok: false,
        reason: '注音順序不對。一個字只有一個音節，順序是聲母、介音（ㄧㄨㄩ）、韻母，再加聲調。'
      };
    }
    return { ok: true, value: t };
  }

  // ---------------------------------------------------------------
  // 多音字標注
  // ---------------------------------------------------------------
  /**
   * 回傳 'ambiguous'（辭典最常見讀音占比 <85%，課本讀音可能不同）、
   * 'multi'（次要讀音占比 ≥10%）或 null（不標）。
   */
  function heteronymLevel(c) {
    if (!c) return null;
    if (c.ambiguous === true) return 'ambiguous';
    const rs = c.readings;
    if (Array.isArray(rs) && rs.length >= 2 && Number(rs[1].ratio) >= TAG_MIN_RATIO) return 'multi';
    return null;
  }

  function formatRatio(ratio) {
    const n = Math.round(Number(ratio) * 100);
    if (!isFinite(n)) return '';
    return n <= 0 ? '不到 1%' : n + '%';
  }

  /** 候選讀音：資料的 readings（已依詞頻排序），確保現有辭典讀音在其中。 */
  function candidateReadings(c) {
    const out = [];
    const seen = new Set();
    (Array.isArray(c && c.readings) ? c.readings : []).forEach((r) => {
      if (r && typeof r.reading === 'string' && !seen.has(r.reading)) {
        seen.add(r.reading);
        out.push({ reading: r.reading, ratio: typeof r.ratio === 'number' ? r.ratio : null });
      }
    });
    if (c && c.bopomofo && !seen.has(c.bopomofo)) {
      out.push({ reading: c.bopomofo, ratio: null });
    }
    return out;
  }

  // ---------------------------------------------------------------
  // 修改紀錄儲存（localStorage，可注入、可降級）
  // ---------------------------------------------------------------
  function cleanNote(n) {
    return String(n == null ? '' : n).replace(/[\r\n\t]+/g, ' ').trim().slice(0, NOTE_MAX);
  }

  /** 檢查並整理單筆紀錄；不合格回傳 null。 */
  function sanitizeRecord(ch, rec) {
    if (typeof ch !== 'string' || Array.from(ch).length !== 1) return null;
    if (!rec || typeof rec !== 'object') return null;
    const v = validateBopomofo(rec.bopomofo);
    if (!v.ok) return null;
    const num = (x, dflt) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? dflt : Number(x));
    const out = {
      bopomofo: v.value,
      note: cleanNote(rec.note),
      ts: num(rec.ts, 0),
      grade: num(rec.grade, null),
      publisher: typeof rec.publisher === 'string' ? rec.publisher.slice(0, 24) : '',
      lesson: num(rec.lesson, null)
    };
    // 輔助欄位：修改當下的辭典讀音（匯出與語詞替換判斷用）；沒有也能運作
    if (typeof rec.dict === 'string' && rec.dict !== '') out.dict = rec.dict.slice(0, 12);
    return out;
  }

  /**
   * getStorage：回傳 Storage 物件的函式（可丟錯、可回傳 null）。
   * 讀寫任何一步失敗都不丟錯：資料留在記憶體，isPersistent() 變 false 供畫面提示。
   */
  function createStore(getStorage) {
    let data = {};
    let persistent = true;

    function storage() {
      try {
        return typeof getStorage === 'function' ? getStorage() : null;
      } catch (e) {
        return null;
      }
    }

    function load() {
      data = {};
      const st = storage();
      if (!st) {
        persistent = false;
        return data;
      }
      let raw = null;
      try {
        raw = st.getItem(STORAGE_KEY);
        persistent = true;
      } catch (e) {
        persistent = false;
        return data;
      }
      if (!raw) return data;
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          Object.keys(obj).forEach((k) => {
            const rec = sanitizeRecord(k, obj[k]);
            if (rec) data[k] = rec;
          });
        }
      } catch (e) {
        data = {};      // 內容損毀：略過，下次儲存會覆蓋
      }
      return data;
    }

    function persist() {
      const st = storage();
      if (!st) {
        persistent = false;
        return false;
      }
      try {
        if (Object.keys(data).length === 0) st.removeItem(STORAGE_KEY);
        else st.setItem(STORAGE_KEY, JSON.stringify(data));
        persistent = true;
        return true;
      } catch (e) {
        persistent = false;
        return false;
      }
    }

    function set(ch, rec) {
      const clean = sanitizeRecord(ch, rec);
      if (!clean) return { ok: false, persisted: false, error: 'invalid' };
      data[ch] = clean;
      return { ok: true, persisted: persist(), record: clean };
    }

    function remove(ch) {
      if (!Object.prototype.hasOwnProperty.call(data, ch)) return { ok: true, persisted: persistent, existed: false };
      delete data[ch];
      return { ok: true, persisted: persist(), existed: true };
    }

    function get(ch) {
      return Object.prototype.hasOwnProperty.call(data, ch) ? data[ch] : null;
    }

    function entries() {
      return Object.keys(data)
        .map((k) => Object.assign({ char: k }, data[k]))
        .sort((a, b) => (a.ts - b.ts) || (a.char < b.char ? -1 : a.char > b.char ? 1 : 0));
    }

    return {
      load,
      get,
      has: (ch) => get(ch) !== null,
      set,
      remove,
      entries,
      count: () => Object.keys(data).length,
      isPersistent: () => persistent
    };
  }

  // ---------------------------------------------------------------
  // 套用到字與語詞
  // ---------------------------------------------------------------
  /** 一個字目前使用的讀音：有修改用修改、否則辭典值。 */
  function effectiveReading(store, ch, dictReading) {
    const rec = store && store.get(ch);
    return rec ? rec.bopomofo : dictReading;
  }

  /**
   * 語詞音節替換：音節數必須等於字數；某字有修改，且該位置音節等於該字當時的辭典讀音
   * （紀錄沒有 dict 欄位時一律替換）才換成修改後的讀音。回傳新陣列；沒變動時回傳原陣列。
   * 例外保護：同一個字在語詞中讀成別的音（如「印子」的輕聲）不會被誤換。
   */
  function overrideSyllables(store, word, syllables) {
    if (!store || !Array.isArray(syllables)) return syllables;
    const chars = Array.from(word == null ? '' : String(word));
    if (chars.length !== syllables.length) return syllables;
    let changed = false;
    const out = syllables.map((syl, i) => {
      const rec = store.get(chars[i]);
      if (!rec) return syl;
      if (rec.dict && syl !== rec.dict) return syl;
      if (syl === rec.bopomofo) return syl;
      changed = true;
      return rec.bopomofo;
    });
    return changed ? out : syllables;
  }

  // ---------------------------------------------------------------
  // 回報給維護者（同源 POST /api/report）
  // ---------------------------------------------------------------
  function gradeLabel(g) {
    return GRADE_LABELS[g] || (g ? g + '年級' : '');
  }

  function publisherName(p) {
    if (typeof p !== 'string') return '';
    if (PUBLISHER_NAMES[p]) return PUBLISHER_NAMES[p];
    const m = /^110-(.+)$/.exec(p);
    if (m) return '110學年度' + (PUBLISHER_NAMES[m[1]] || m[1]);
    return p;
  }

  function lessonText(lesson) {
    if (lesson == null) return '';
    return lesson < 0 ? '前導單元' : '第' + lesson + '課';
  }

  /** 例：一年級南一第3課 */
  function whereLabel(rec) {
    return gradeLabel(rec.grade) + publisherName(rec.publisher) + lessonText(rec.lesson);
  }

  /**
   * info：{ char, dict, bopomofo, note, grade, publisher, lesson, pathname, viewport }
   * 欄位長度都在此夾限，符合 worker 的 validateReport（message 5–1000、ref ≤100、page ≤200 且 / 開頭、viewport ≤20）。
   */
  function buildReportPayload(info) {
    const note = cleanNote(info.note);
    const message = (
      '【字在讀音修改】字：' + info.char +
      '｜年級版本課：' + whereLabel(info) +
      '｜辭典讀音：' + (info.dict || '') +
      '｜我改成：' + info.bopomofo +
      '｜備註：' + (note || '無')
    ).slice(0, 1000);
    let page = String(info.pathname == null ? '/' : info.pathname).slice(0, 200);
    if (page[0] !== '/') page = '/';
    return {
      app: 'zizai',
      kind: 'typo',
      message,
      ref: ('g' + info.grade + '/' + info.publisher + '/L' + info.lesson + '/' + info.char).slice(0, 100),
      page,
      viewport: String(info.viewport == null ? '' : info.viewport).slice(0, 20),
      website: ''
    };
  }

  /** 只有正式站與本機開發主機才送；其他環境（file://、GitHub Pages 等）一律不送。與 worker 的來源白名單相同。 */
  function canSendReport(loc) {
    if (!loc) return false;
    const proto = loc.protocol;
    const host = loc.hostname;
    if (proto === 'https:') return host === 'toopower.cc' || host === 'www.toopower.cc';
    if (proto === 'http:') return host === 'localhost' || host === '127.0.0.1';
    return false;
  }

  /**
   * 送出回報；永遠 resolve，不丟錯、不寫主控台。
   * opts：{ fetchImpl, location, timeoutMs }
   * 回傳 { status:'sent' } 或 { status:'unavailable', reason }
   */
  function sendReport(payload, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let timer = null;
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        resolve(r);
      };
      try {
        const fetchImpl = opts.fetchImpl;
        if (!canSendReport(opts.location)) return finish({ status: 'unavailable', reason: 'host' });
        if (typeof fetchImpl !== 'function') return finish({ status: 'unavailable', reason: 'nofetch' });
        let signal;
        if (typeof AbortController === 'function') {
          const ctl = new AbortController();
          signal = ctl.signal;
          timer = setTimeout(() => {
            try { ctl.abort(); } catch (e) { /* ignore */ }
            finish({ status: 'unavailable', reason: 'timeout' });
          }, opts.timeoutMs || REPORT_TIMEOUT_MS);
        }
        const init = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store',
          credentials: 'same-origin'
        };
        if (signal) init.signal = signal;
        Promise.resolve(fetchImpl(REPORT_PATH, init)).then(
          (res) => finish(res && res.ok ? { status: 'sent' } : { status: 'unavailable', reason: 'http-' + (res && res.status) }),
          () => finish({ status: 'unavailable', reason: 'network' })
        );
      } catch (e) {
        finish({ status: 'unavailable', reason: 'error' });
      }
    });
  }

  // ---------------------------------------------------------------
  // 匯出
  // ---------------------------------------------------------------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function stamp(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes());
  }

  function exportItems(store) {
    return store.entries().map((e) => ({
      char: e.char,
      dict: e.dict || '',
      bopomofo: e.bopomofo,
      note: e.note,
      ts: e.ts,
      grade: e.grade,
      publisher: e.publisher,
      lesson: e.lesson
    }));
  }

  /** 一鍵複製用的純文字，每字一行，方便老師貼進訊息或表單。 */
  function buildExportText(store, now) {
    const items = exportItems(store);
    const lines = ['字在｜我的讀音修改（共 ' + items.length + ' 字）', '匯出時間：' + stamp(now || new Date())];
    items.forEach((it, i) => {
      lines.push(
        (i + 1) + '．「' + it.char + '」｜' + whereLabel(it) +
        '｜辭典讀音：' + (it.dict || '（未記錄）') +
        '｜我改成：' + it.bopomofo +
        '｜備註：' + (it.note || '無')
      );
    });
    return lines.join('\n');
  }

  /** 下載用 JSON（物件，呼叫端自行 stringify）。 */
  function buildExportJson(store, now) {
    const items = exportItems(store);
    return {
      app: 'zizai',
      format: 'zizai-reading-overrides-v1',
      exportedAt: (now || new Date()).toISOString(),
      count: items.length,
      items
    };
  }

  const api = {
    STORAGE_KEY,
    NOTE_MAX,
    TAG_MIN_RATIO,
    REPORT_PATH,
    MSG_DEGRADED,
    MSG_SENT,
    validateBopomofo,
    heteronymLevel,
    formatRatio,
    candidateReadings,
    cleanNote,
    sanitizeRecord,
    createStore,
    effectiveReading,
    overrideSyllables,
    whereLabel,
    buildReportPayload,
    canSendReport,
    sendReport,
    buildExportText,
    buildExportJson
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ZizaiReadings = api;
})(typeof window !== 'undefined' ? window : null);
