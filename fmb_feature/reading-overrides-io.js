/* ============================================================
   reading-overrides-io.js — 「我的讀音修改」匯入／合併（純邏輯模組）
   沒有 DOM、沒有網路、沒有檔案 I/O、不碰 localStorage。
   背景：目前 src/readings.js 只能「匯出」讀音修改（localStorage 鍵
   zizai:readingOverrides:v1）；本模組補上匯入、驗證與多方合併的邏輯，
   UI 接線由 BOB 決定（見 fmb_feature/README.md）。
   ============================================================ */
(function () {
  'use strict';

  const INITIALS = 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ';
  const MEDIALS = 'ㄧㄨㄩ';
  const FINALS = 'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ';
  const SYMBOLS = INITIALS + MEDIALS + FINALS;
  const TONES = 'ˊˇˋ';
  const LIGHT = '˙';
  const FIRST = 'ˉ';
  /* 合法音節結構：i＝聲母、m＝介音、f＝韻母（ㄐㄧ＝im、ㄧㄢˇ＝mf、ㄋㄧㄡˇ＝imf） */
  const LEGAL = new Set(['i', 'm', 'f', 'im', 'if', 'imf', 'mf']);
  const CJK_RE = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]$/;
  /* 匯出檔最外層的說明欄位，略過不當成「字」 */
  const META_KEYS = new Set(['version', 'app', 'kind', 'exportedAt', 'export', 'meta', 'schema', 'note', 'notes', 'source']);
  const MAX_NOTE = 100;
  const LIMITS = { maxBytes: 524288, maxEntries: 5000, maxErrors: 50, maxNote: MAX_NOTE };
  const REASONS = {
    not_string: '內容必須是文字', empty: '讀音是空的',
    bad_char: '有不是注音符號或聲調符號的字元',
    bad_tone_count: '聲調符號只能有一個（輕聲點與聲調不可並用）',
    bad_tone_position: '聲調符號要放在音節最後面（輕聲點可在最前面）',
    no_symbol: '缺少注音符號', too_many_symbols: '一個音節最多三個注音符號',
    bad_order: '注音符號順序不對（應為聲母＋介音＋韻母）',
    bad_entry: '每筆修改必須是物件或讀音字串', bad_key: '鍵名必須是一個國字',
    bad_json: '不是有效的 JSON', bad_shape: '格式不是「字→讀音」的物件或陣列',
    too_large: '內容太大（超過 512KB）', too_many_entries: '筆數太多（超過 5000 筆）',
    no_entry: '沒有任何可用的修改',
  };

  function fail(code, message) {
    return { ok: false, code, message: message || REASONS[code] || '格式不合' };
  }
  function kindOf(ch) { return INITIALS.includes(ch) ? 'i' : (MEDIALS.includes(ch) ? 'm' : 'f'); }
  function byteLength(text) {
    if (typeof TextEncoder !== 'undefined') { try { return new TextEncoder().encode(text).length; } catch (e) { /* 退回粗估 */ } }
    return text.length * 3;
  }
  function cleanText(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  }
  function toInt(value, min, max) {
    const n = typeof value === 'string' ? Number(value.trim()) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    return (i < min || i > max) ? null : i;
  }

  /* ---------- 讀音正規化與驗證（單一音節） ---------- */
  function normalizeBopomofo(input) {
    if (typeof input !== 'string') return fail('not_string');
    const s = input.replace(/[\s\u3000]+/g, '');
    if (s === '') return fail('empty');
    let lightCount = 0, lightAt = -1, toneCount = 0, tonePos = -1;
    const syms = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (TONES.includes(ch)) { toneCount++; tonePos = i; continue; }
      if (ch === LIGHT) { lightCount++; lightAt = i; continue; }
      if (ch === FIRST) continue; /* 第一聲符號可省略：接受但正規化掉 */
      if (!SYMBOLS.includes(ch)) return fail('bad_char', '不允許的字元「' + ch + '」');
      syms.push(ch);
    }
    if (lightCount > 1 || toneCount > 1 || (lightCount && toneCount)) return fail('bad_tone_count');
    if (toneCount > 0 && tonePos !== s.length - 1) return fail('bad_tone_position');
    if (lightCount === 1 && lightAt !== 0 && lightAt !== s.length - 1) return fail('bad_tone_position');
    if (syms.length === 0) return fail('no_symbol');
    if (syms.length > 3) return fail('too_many_symbols');
    if (!LEGAL.has(syms.map(kindOf).join(''))) return fail('bad_order');
    const value = (lightCount ? LIGHT : '') + syms.join('') + (toneCount ? s[tonePos] : '');
    return { ok: true, value };
  }

  /* ---------- 單筆修改驗證：char 是國字；值可為字串或 {bopomofo, note, ts} ---------- */
  function entryFromValue(value) {
    if (value == null) return fail('bad_entry');
    if (typeof value === 'string') {
      const r = normalizeBopomofo(value);
      if (!r.ok) return r;
      return { ok: true, value: { bopomofo: r.value, note: '', ts: null } };
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const r = normalizeBopomofo(value.bopomofo != null ? value.bopomofo : value.reading);
      if (!r.ok) return r;
      return { ok: true, value: { bopomofo: r.value, note: cleanText(value.note, MAX_NOTE), ts: toInt(value.ts, 0, 9999999999999) } };
    }
    return fail('bad_entry');
  }
  function validateEntry(char, raw) {
    if (typeof char !== 'string' || !CJK_RE.test(char)) return fail('bad_key');
    const r = entryFromValue(raw);
    if (!r.ok) return r;
    return { ok: true, value: r.value };
  }

  /* ---------- 匯入：吃 JSON 文字，吐驗證過的修改清單 ---------- */
  function parseImport(text, opts) {
    if (typeof text !== 'string') return fail('not_string');
    if (byteLength(text) > LIMITS.maxBytes) return fail('too_large');
    let data;
    try { data = JSON.parse(text); } catch (e) { return fail('bad_json'); }
    const entries = [], errors = [];
    const stats = { valid: 0, invalid: 0, skippedMeta: 0 };
    const pushErr = (char, code, message) => {
      if (errors.length >= LIMITS.maxErrors) return;
      errors.push({ char: typeof char === 'string' && char !== '' ? char.slice(0, 4) : '（未指定字）', code, message: message || REASONS[code] || '格式不合' });
    };
    const addEntry = (char, raw) => {
      const r = validateEntry(char, raw);
      if (!r.ok) { stats.invalid++; pushErr(char, r.code, r.message); return; }
      stats.valid++;
      entries.push({ char: char, bopomofo: r.value.bopomofo, note: r.value.note, ts: r.value.ts });
    };
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item == null || typeof item !== 'object') { stats.invalid++; pushErr(null, 'bad_entry'); continue; }
        addEntry(item.char, item);
      }
    } else if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) {
        if (META_KEYS.has(k)) { stats.skippedMeta++; continue; }
        addEntry(k, data[k]);
      }
    } else {
      return fail('bad_shape');
    }
    if (entries.length > LIMITS.maxEntries) return fail('too_many_entries');
    if (entries.length === 0 && !(opts && opts.allowEmpty)) {
      return Object.assign(fail('no_entry'), { errors: errors, stats: stats });
    }
    return { ok: true, entries: entries, errors: errors, stats: stats };
  }

  /* ---------- 合併：把匯入的修改併進現有 overrides ---------- */
  function incomingToEntries(incoming) {
    const out = [];
    if (Array.isArray(incoming)) {
      for (const item of incoming) {
        const r = validateEntry(item && item.char, item);
        if (r.ok) out.push({ char: item.char, bopomofo: r.value.bopomofo, note: r.value.note, ts: r.value.ts });
      }
      return out;
    }
    if (incoming && typeof incoming === 'object') {
      for (const k of Object.keys(incoming)) {
        const r = validateEntry(k, incoming[k]);
        if (r.ok) out.push({ char: k, bopomofo: r.value.bopomofo, note: r.value.note, ts: r.value.ts });
      }
    }
    return out;
  }
  /* opts.conflict：'keep'（預設，以現有為準）| 'incoming'（匯入為準）| 'newer'（比 ts） */
  function mergeOverrides(current, incoming, opts) {
    const strategy = (opts && opts.conflict) || 'keep';
    const cur = (current && typeof current === 'object') ? current : {};
    const inc = incomingToEntries(incoming);
    const merged = {};
    for (const k of Object.keys(cur)) merged[k] = cur[k];
    let added = 0, updated = 0, kept = 0, same = 0;
    const conflicts = [];
    for (const e of inc) {
      const c = cur[e.char];
      const next = { bopomofo: e.bopomofo, note: e.note || '', ts: e.ts || null };
      if (!c) { merged[e.char] = next; added++; continue; }
      if (c.bopomofo === e.bopomofo && (c.note || '') === (e.note || '')) { same++; continue; }
      let takeIncoming = false;
      if (strategy === 'incoming') takeIncoming = true;
      else if (strategy === 'newer') takeIncoming = (e.ts || 0) > (c.ts || 0);
      if (takeIncoming) { merged[e.char] = next; updated++; conflicts.push({ char: e.char, resolved: 'incoming' }); }
      else { kept++; conflicts.push({ char: e.char, resolved: 'kept' }); }
    }
    const invalid = (Array.isArray(incoming) ? incoming.length : Object.keys(incoming || {}).length) - inc.length;
    return { merged: merged, added: added, updated: updated, kept: kept, same: same, invalid: invalid, conflicts: conflicts };
  }

  /* 匯出成排序過鍵的 JSON 文字（結尾換行） */
  function serializeOverrides(overrides) {
    const o = (overrides && typeof overrides === 'object') ? overrides : {};
    return JSON.stringify(o, Object.keys(o).sort(), 2) + '\n';
  }

  const API = {
    normalizeBopomofo: normalizeBopomofo,
    validateEntry: validateEntry,
    parseImport: parseImport,
    mergeOverrides: mergeOverrides,
    serializeOverrides: serializeOverrides,
    REASONS: REASONS,
    LIMITS: LIMITS,
  };
  if (typeof window !== 'undefined') window.ZZReadingOverridesIO = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
