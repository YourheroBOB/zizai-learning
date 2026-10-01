/**
 * app.js — 「字在」國小國語生字學習系統主程式（一到六年級）
 * 支援多年級、多版本教材（康軒、翰林、南一、自編體驗版）、進度推算與家長覆寫、
 * 已教/熟悉度分離建模、生字詳情與官方連結、線上互動練習、A4考卷與答案卷列印。
 */

(function () {
  'use strict';

  // 本地儲存鍵名
  const PREFS_KEY = 'zizai.prefs.v3';
  const MASTERED_KEY = 'zizai.mastered.v3';
  const MISTAKES_KEY = 'zizai.mistakes.v3';

  // 年級名稱對照
  const GRADE_LABELS = { 1: '一年級', 2: '二年級', 3: '三年級', 4: '四年級', 5: '五年級', 6: '六年級' };

  // 各年級 115-1 課程資料對應的檔名
  const GRADE_DATA_FILES = {
    1: 'data/curriculum-115-1-g1.json',
    2: 'data/curriculum-115-1.json',
    3: 'data/curriculum-115-1-g3.json',
    4: 'data/curriculum-115-1-g4.json',
    5: 'data/curriculum-115-1-g5.json',
    6: 'data/curriculum-115-1-g6.json'
  };

  // 狀態管理
  const state = {
    gradeData: {},               // { 1: {...}, 2: {...}, ... } 各年級 115-1 課程資料快取
    curriculum110: null,
    curriculumDemo: null,
    currentGrade: 2,              // 1~6
    currentCurriculumType: '115-1', // '115-1' | '110' | 'demo'
    currentPublisher: 'kangxuan',   // 'kangxuan' | 'hanlin' | 'nanyi'
    currentSemester: '2a',          // '2a' | '2b'
    manualLesson: null,             // null (自動預估) 或 數字 1~12
    filterStatus: 'all',            // 'all' | 'current' | 'unfamiliar' | 'mastered'
    masteredChars: {},              // { '年': true }
    mistakes: [],                   // 錯題清單
    activeTab: 'progress',          // 'progress' | 'interactive' | 'worksheet'
    interactiveQuiz: null,          // 線上練習狀態
    worksheetData: null,            // 目前考卷題目
    modalChar: null                 // 詳情彈窗目前的生字（修改讀音用）
  };

  // DOM 輔助
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // 初始化儲存
  function loadLocalState() {
    try {
      let prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      // 從 v2 遷移
      if (!prefs.grade && !localStorage.getItem(PREFS_KEY)) {
        const v2 = JSON.parse(localStorage.getItem('zizai.prefs.v2') || '{}');
        if (v2.publisher) prefs = { ...v2, grade: 2 };
      }
      if (prefs.grade) state.currentGrade = parseInt(prefs.grade, 10) || 2;
      if (prefs.publisher) state.currentPublisher = prefs.publisher;
      if (prefs.curriculumType) state.currentCurriculumType = prefs.curriculumType;
      if (prefs.semester) state.currentSemester = prefs.semester;
      if (prefs.manualLesson !== undefined) state.manualLesson = prefs.manualLesson;
    } catch (e) {
      console.warn('載入偏好設定失敗', e);
    }
    try {
      state.masteredChars = JSON.parse(localStorage.getItem(MASTERED_KEY) || localStorage.getItem('zizai.mastered.v2') || '{}');
    } catch (e) {}
    try {
      state.mistakes = JSON.parse(localStorage.getItem(MISTAKES_KEY) || localStorage.getItem('zizai.mistakes.v2') || '[]');
    } catch (e) {}
    if (readingStore) readingStore.load();   // 使用者修改的讀音（不可用時降級為只存記憶體）
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        grade: state.currentGrade,
        publisher: state.currentPublisher,
        curriculumType: state.currentCurriculumType,
        semester: state.currentSemester,
        manualLesson: state.manualLesson
      }));
    } catch (e) {}
  }

  function saveMastered() {
    try {
      localStorage.setItem(MASTERED_KEY, JSON.stringify(state.masteredChars));
    } catch (e) {}
  }

  // -----------------------------------------------------------
  // 多音字標注與「修改讀音」（第七輪；純邏輯在 src/readings.js）
  // 修改只存在使用者自己的瀏覽器（localStorage）；回報只有使用者勾選才送出。
  // -----------------------------------------------------------
  const RD = window.ZizaiReadings || null;
  const readingStore = RD ? RD.createStore(() => window.localStorage) : null;
  const CUSTOM_PICK = '__custom__';

  // 目前使用的讀音（有修改用修改，否則用辭典值）
  function effBopomofo(ch, dictReading) {
    return RD && readingStore ? RD.effectiveReading(readingStore, ch, dictReading) : dictReading;
  }

  // 語詞音節替換（音節數等於字數才換）；用在字卡以外所有出現語詞注音的地方
  function overrideArr(word, arr) {
    return RD && readingStore ? RD.overrideSyllables(readingStore, word, arr) : arr;
  }

  function makeZzTag(cls, text) {
    const t = document.createElement('span');
    t.className = 'zz-tag ' + cls;
    t.textContent = text;
    return t;
  }

  // 生字卡上的小標記：破音（次要讀音 >=10% 或 ambiguous）、已修改
  function buildCardTags(c) {
    if (!RD || !readingStore) return null;
    const level = RD.heteronymLevel(c);
    const modified = readingStore.has(c.char);
    if (!level && !modified) return null;
    const wrap = document.createElement('div');
    wrap.className = 'zz zz-tags zz-no-print';
    if (level) {
      const t = makeZzTag(level === 'ambiguous' ? 'zz-tag--ambiguous' : 'zz-tag--multi', '破音');
      t.setAttribute('data-zz-level', level);
      wrap.appendChild(t);
    }
    if (modified) wrap.appendChild(makeZzTag('zz-tag--modified', '已修改'));
    if (level === 'ambiguous') {
      const n = document.createElement('span');
      n.className = 'zz-tags__note';
      n.textContent = '課本讀音可能不同';
      wrap.appendChild(n);
    }
    return wrap;
  }

  function setZzMsg(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.setAttribute('data-kind', kind || '');
  }

  // 目前資料所在的年級／版本／課（寫進修改紀錄）
  function currentMeta(c) {
    let pub = state.currentPublisher;
    if (state.currentCurriculumType === 'demo') pub = 'demo';
    else if (state.currentCurriculumType === '110') pub = '110-' + pub;
    const grade = state.currentCurriculumType === '115-1' ? state.currentGrade : 2;
    return { grade, publisher: pub, lesson: typeof c.lessonNo === 'number' ? c.lessonNo : null };
  }

  function updateExportBar() {
    if (!RD || !readingStore) return;
    const n = readingStore.count();
    const bar = $('zz-exportbar');
    if (bar) bar.hidden = n === 0;
    const modalRow = $('zz-m-export');
    if (modalRow) modalRow.hidden = n === 0;
    const txt = $('zz-exportbar-text');
    if (txt) txt.textContent = '你修改過 ' + n + ' 個字的讀音（只存在這個瀏覽器）';
    const warn = $('zz-exportbar-warn');
    if (warn) {
      warn.hidden = n === 0 || readingStore.isPersistent();
      warn.textContent = '這個瀏覽器無法儲存修改，只在這次開啟期間有效；請先匯出。';
    }
  }

  // 詳情彈窗的「讀音」區：辭典全部讀音與占比，現用讀音高亮
  function renderReadingSection(c) {
    const sec = $('zz-reading');
    if (!sec || !RD || !readingStore) return;
    const rec = readingStore.get(c.char);
    const level = RD.heteronymLevel(c);
    const eff = rec ? rec.bopomofo : c.bopomofo;

    const tagH = $('zz-tag-hetero');
    tagH.hidden = !level;
    tagH.className = 'zz-tag ' + (level === 'ambiguous' ? 'zz-tag--ambiguous' : 'zz-tag--multi');
    $('zz-tag-mod').hidden = !rec;
    $('zz-ambig-note').hidden = level !== 'ambiguous';
    $('zz-nostats').hidden = Array.isArray(c.readings) && c.readings.length > 0;

    const list = $('zz-rlist');
    list.innerHTML = '';
    const cands = RD.candidateReadings(c);
    const addItem = (reading, ratio, isCurrent, flag) => {
      const li = document.createElement('li');
      li.className = 'zz-ritem' + (isCurrent ? ' is-current' : '');
      const bp = document.createElement('span');
      bp.className = 'zz-ritem__bp';
      bp.textContent = reading;
      li.appendChild(bp);
      const ra = document.createElement('span');
      ra.className = 'zz-ritem__ratio';
      ra.textContent = ratio === null || ratio === undefined ? '' : '占 ' + RD.formatRatio(ratio);
      li.appendChild(ra);
      if (flag) {
        const f = document.createElement('span');
        f.className = 'zz-ritem__flag';
        f.textContent = flag;
        li.appendChild(f);
      }
      list.appendChild(li);
    };
    cands.forEach((r) => addItem(r.reading, r.ratio, r.reading === eff, r.reading === eff ? '現用' : ''));
    if (!cands.some((r) => r.reading === eff)) addItem(eff, null, true, '現用（你修改的）');

    $('zz-restore').hidden = !rec;
    $('zz-edit-open').textContent = rec ? '再修改讀音' : '修改讀音';
    updateExportBar();
  }

  function closeEditor() {
    const form = $('zz-form');
    if (form) form.hidden = true;
    const btn = $('zz-edit-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openEditor(c) {
    if (!c || !RD || !readingStore) return;
    const form = $('zz-form');
    const rec = readingStore.get(c.char);
    const opts = $('zz-opts');
    opts.innerHTML = '';
    RD.candidateReadings(c).forEach((r, i) => {
      const lab = document.createElement('label');
      lab.className = 'zz-opt';
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'zz-pick';
      inp.value = r.reading;
      inp.id = 'zz-pick-' + i;
      lab.appendChild(inp);
      const bp = document.createElement('span');
      bp.className = 'zz-opt__bp';
      bp.textContent = r.reading;
      lab.appendChild(bp);
      if (r.ratio !== null) {
        const ra = document.createElement('span');
        ra.className = 'zz-opt__ratio';
        ra.textContent = '占 ' + RD.formatRatio(r.ratio);
        lab.appendChild(ra);
      }
      opts.appendChild(lab);
    });
    const customLab = document.createElement('label');
    customLab.className = 'zz-opt zz-opt--custom';
    const customRadio = document.createElement('input');
    customRadio.type = 'radio';
    customRadio.name = 'zz-pick';
    customRadio.value = CUSTOM_PICK;
    customRadio.id = 'zz-pick-custom';
    customLab.appendChild(customRadio);
    const customText = document.createElement('span');
    customText.className = 'zz-opt__bp';
    customText.textContent = '自行輸入';
    customLab.appendChild(customText);
    opts.appendChild(customLab);
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.id = 'zz-custom';
    customInput.className = 'zz-input';
    customInput.setAttribute('lang', 'zh-Hant');
    customInput.setAttribute('autocomplete', 'off');
    customInput.setAttribute('autocapitalize', 'off');
    customInput.setAttribute('spellcheck', 'false');
    customInput.setAttribute('maxlength', '12');
    customInput.setAttribute('placeholder', '例：ㄌㄧㄠˇ');
    customInput.setAttribute('aria-label', '自行輸入注音');
    customInput.oninput = () => { customRadio.checked = true; };
    customInput.onfocus = () => { customRadio.checked = true; };
    opts.appendChild(customInput);

    $('zz-note').value = rec ? rec.note : '';
    $('zz-report').checked = false;
    setZzMsg('zz-error', '', '');
    setZzMsg('zz-msg', '', '');
    setZzMsg('zz-report-msg', '', '');
    form.hidden = false;
    $('zz-edit-open').setAttribute('aria-expanded', 'true');
    const first = opts.querySelector('input[type="radio"]');
    if (first) first.focus();
  }

  // 儲存或還原後：字卡、練習、彈窗立即更新（A4 卷在下次開啟分頁時重新出題套用）
  function afterOverrideChange(c) {
    renderProgressView();
    if (state.interactiveQuiz) renderQuizCard();
    showCharDetailModal(c);
  }

  function restoreChar(c) {
    if (!c || !RD || !readingStore) return;
    const res = readingStore.remove(c.char);
    afterOverrideChange(c);
    setZzMsg('zz-msg', res.persisted ? '已還原為辭典讀音。' : '已還原為辭典讀音（這個瀏覽器無法儲存變更）。', res.persisted ? 'ok' : 'warn');
  }

  function onSaveReading(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const c = state.modalChar;
    if (!c || !RD || !readingStore) return;
    const fail = (reason, markCustom) => {
      setZzMsg('zz-error', reason, 'err');
      const ci = $('zz-custom');
      if (ci) {
        if (markCustom) ci.setAttribute('aria-invalid', 'true');
        else ci.removeAttribute('aria-invalid');
      }
    };
    setZzMsg('zz-error', '', '');
    const picked = $('zz-form').querySelector('input[name="zz-pick"]:checked');
    if (!picked) return fail('請選一個讀音，或在「自行輸入」填入注音。', false);
    const isCustom = picked.value === CUSTOM_PICK;
    const v = RD.validateBopomofo(isCustom ? $('zz-custom').value : picked.value);
    if (!v.ok) return fail(v.reason, isCustom);
    const note = RD.cleanNote($('zz-note').value);
    if ($('zz-note').value.trim().length > RD.NOTE_MAX) return fail('備註最多 ' + RD.NOTE_MAX + ' 字。', false);
    const rec = readingStore.get(c.char);
    const current = rec ? rec.bopomofo : c.bopomofo;
    if (v.value === current) return fail('和目前使用的讀音一樣，不需要修改。', isCustom);
    if (v.value === c.bopomofo) {            // 改回辭典讀音＝還原
      restoreChar(c);
      return;
    }
    const meta = currentMeta(c);
    const res = readingStore.set(c.char, {
      bopomofo: v.value,
      note,
      ts: Date.now(),
      grade: meta.grade,
      publisher: meta.publisher,
      lesson: meta.lesson,
      dict: c.bopomofo
    });
    if (!res.ok) return fail('這個讀音無法儲存，請檢查格式。', isCustom);
    const wantReport = $('zz-report').checked;
    afterOverrideChange(c);
    setZzMsg('zz-msg',
      res.persisted ? '已儲存，並套用到字卡、線上練習與 A4 測驗卷。' : '已套用，但這個瀏覽器無法儲存，重新整理後修改會消失。',
      res.persisted ? 'ok' : 'warn');
    if (wantReport) {
      const payload = RD.buildReportPayload({
        char: c.char,
        dict: c.bopomofo,
        bopomofo: v.value,
        note,
        grade: meta.grade,
        publisher: meta.publisher,
        lesson: meta.lesson,
        pathname: window.location.pathname,
        viewport: window.innerWidth + 'x' + window.innerHeight
      });
      setZzMsg('zz-report-msg', '正在回報…', '');
      RD.sendReport(payload, {
        fetchImpl: typeof window.fetch === 'function' ? window.fetch.bind(window) : null,
        location: window.location
      }).then((r) => {
        setZzMsg('zz-report-msg', r.status === 'sent' ? RD.MSG_SENT : RD.MSG_DEGRADED, r.status === 'sent' ? 'ok' : 'warn');
      });
    }
  }

  // 匯出：複製文字（失敗時顯示可手動全選的文字框）與下載 JSON（本機檔案，不上傳）
  function copyTextToClipboard(text) {
    return new Promise((resolve) => {
      const fallback = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
          document.body.appendChild(ta);
          ta.select();
          const ok = !!(document.execCommand && document.execCommand('copy'));
          document.body.removeChild(ta);
          resolve(ok);
        } catch (e) {
          resolve(false);
        }
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => resolve(true), fallback);
        } else {
          fallback();
        }
      } catch (e) {
        fallback();
      }
    });
  }

  function onExportCopy(ev) {
    if (!RD || !readingStore) return;
    const region = ev.currentTarget.closest('.zz-export');
    const msgEl = region && region.querySelector('.zz-export-msg');
    const box = region && region.querySelector('.zz-export-box');
    const text = RD.buildExportText(readingStore);
    copyTextToClipboard(text).then((ok) => {
      if (msgEl) { msgEl.textContent = ok ? '已複製，可以貼給老師或維護者。' : '這個瀏覽器無法自動複製，請在下方文字框全選後複製。'; msgEl.setAttribute('data-kind', ok ? 'ok' : 'warn'); }
      if (box) {
        box.hidden = ok;
        if (!ok) { box.value = text; box.focus(); box.select(); }
      }
    });
  }

  function onExportDownload(ev) {
    if (!RD || !readingStore) return;
    const region = ev.currentTarget.closest('.zz-export');
    const msgEl = region && region.querySelector('.zz-export-msg');
    const say = (t, kind) => { if (msgEl) { msgEl.textContent = t; msgEl.setAttribute('data-kind', kind); } };
    try {
      const d = new Date();
      const ymd = d.getFullYear() + String(d.getMonth() + 101).slice(1) + String(d.getDate() + 100).slice(1);
      const blob = new Blob([JSON.stringify(RD.buildExportJson(readingStore, d), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zizai-reading-overrides-' + ymd + '.json';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      say('已下載 JSON 檔（只存在你的電腦，不會上傳）。', 'ok');
    } catch (e) {
      say('這個瀏覽器無法下載，請改用「複製」。', 'warn');
    }
  }

  function wireReadingUi() {
    if (!RD || !readingStore || !$('zz-reading')) return;
    $('zz-edit-open').onclick = () => {
      if ($('zz-form').hidden) openEditor(state.modalChar);
      else closeEditor();
    };
    $('zz-form').onsubmit = onSaveReading;
    $('zz-cancel').onclick = () => {
      closeEditor();
      $('zz-edit-open').focus();
    };
    $('zz-restore').onclick = () => restoreChar(state.modalChar);
    $$('.zz-js-copy').forEach((b) => { b.onclick = onExportCopy; });
    $$('.zz-js-download').forEach((b) => { b.onclick = onExportDownload; });
    updateExportBar();
  }

  // -----------------------------------------------------------
  // 週次計算與教學進度
  // -----------------------------------------------------------
  function getSemesterStart() {
    const curData = state.gradeData[state.currentGrade];
    if (curData && curData.meta && curData.meta.semesterStart) {
      return curData.meta.semesterStart;
    }
    return '2026-08-31';
  }

  function calculateWeek(targetDate = new Date()) {
    const start = new Date(getSemesterStart() + 'T00:00:00+08:00');
    const now = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const msDiff = now.getTime() - start.getTime();
    if (msDiff < 0) return { week: 0, state: 'before-start' };
    const week = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;
    if (week > 20) return { week: 21, state: 'after-end' };
    return { week, state: 'in-semester' };
  }

  function getCurrentLessonsData() {
    if (state.currentCurriculumType === 'demo') {
      return {
        name: '生活主題自編體驗版',
        sourceType: 'demo_exercise',
        editionNote: state.curriculumDemo.meta.editionNote,
        licenseNotes: state.curriculumDemo.meta.licenseNotes,
        totalLessons: state.curriculumDemo.themes.length,
        lessons: state.curriculumDemo.themes
      };
    }
    if (state.currentCurriculumType === '115-1') {
      const gradeData = state.gradeData[state.currentGrade];
      if (!gradeData || !gradeData.publishers || !gradeData.publishers[state.currentPublisher]) {
        return {
          name: GRADE_LABELS[state.currentGrade] + '（資料載入中）',
          sourceType: 'official_curriculum',
          editionNote: '',
          licenseNotes: '',
          totalLessons: 0,
          lessons: []
        };
      }
      const pub = gradeData.publishers[state.currentPublisher];
      return {
        name: pub.name,
        sourceType: 'official_curriculum',
        editionNote: gradeData.meta.editionNote,
        licenseNotes: gradeData.meta.licenseNotes,
        totalLessons: pub.lessons.length,
        lessons: pub.lessons
      };
    }
    // 110 歷史版（目前只有二年級）
    if (state.curriculum110) {
      const block = state.curriculum110.blocks.find(
        (b) => b.publisher === (state.currentPublisher === 'kangxuan' ? '康軒' : state.currentPublisher === 'hanlin' ? '翰林' : '南一')
      ) || state.curriculum110.blocks[0];
      return {
        name: block.publisher + '版',
        sourceType: 'historical_curriculum',
        editionNote: state.curriculum110.meta.editionNote,
        licenseNotes: state.curriculum110.meta.licenseNotes,
        totalLessons: block.lessons.length,
        lessons: block.lessons
      };
    }
    return { name: '（無資料）', sourceType: '', editionNote: '', licenseNotes: '', totalLessons: 0, lessons: [] };
  }

  function resolveProgress() {
    const data = getCurrentLessonsData();
    // Find the highest positive lessonNo as the max for progress estimation
    const maxLessonNo = data.lessons.reduce((mx, l) => Math.max(mx, l.lessonNo), 0);
    const total = maxLessonNo || data.totalLessons || 1;
    const weekInfo = calculateWeek();

    if (state.manualLesson !== null && state.manualLesson !== undefined) {
      // Allow negative lessonNo for front units, but clamp positive ones
      const clamped = state.manualLesson < 0 ? state.manualLesson : Math.max(0, Math.min(total, state.manualLesson));
      return {
        currentLesson: clamped,
        isManual: true,
        estimatedWeek: weekInfo.week,
        weekState: weekInfo.state,
        totalLessons: total
      };
    }

    // 預估進度：約每 1.5 週一課
    const est = Math.max(1, Math.min(total, Math.round(weekInfo.week / 1.5) || 1));
    return {
      currentLesson: est,
      isManual: false,
      estimatedWeek: weekInfo.week,
      weekState: weekInfo.state,
      totalLessons: total
    };
  }

  // -----------------------------------------------------------
  // 畫面渲染：進度與生字清單
  // -----------------------------------------------------------
  function renderProgressView() {
    const prog = resolveProgress();
    const curData = getCurrentLessonsData();

    // 更新頂部標籤與來源宣告
    const curriculumBadgeLabels = { 'demo': '體驗自編', '110': '110學年度（歷史完整版）', '115-1': '115學年度上學期' };
    $('curriculum-title-badge').textContent = `${curData.name}・${curriculumBadgeLabels[state.currentCurriculumType] || '115學年度上學期'}`;
    $('source-license-note').textContent = curData.licenseNotes || '';

    // 週次與進度資訊
    $('stat-week-val').textContent = prog.estimatedWeek > 0 ? `第 ${prog.estimatedWeek} 週` : '尚未開學';
    $('stat-lesson-val').textContent = `第 ${prog.currentLesson} 課`;
    $('stat-lesson-badge').textContent = prog.isManual ? '家長手動覆寫' : '系統自動預估';
    $('stat-lesson-badge').className = prog.isManual ? 'tp-badge tp-badge--amber' : 'tp-badge tp-badge--green';

    // 覆寫下拉選單
    const sel = $('manual-lesson-select');
    sel.innerHTML = '<option value="">自動預估進度</option>';
    curData.lessons.forEach((l, idx) => {
      const opt = document.createElement('option');
      opt.value = l.lessonNo;
      // 前導單元（負數 lessonNo）用 title，正常課用「第 N 課」
      if (l.lessonNo < 0) {
        opt.textContent = l.title || `前導${idx + 1}`;
      } else {
        opt.textContent = `第 ${l.lessonNo} 課`;
      }
      if (state.manualLesson === l.lessonNo) opt.selected = true;
      sel.appendChild(opt);
    });

    // 彙整生字清單
    let allChars = [];
    let taughtCharsCount = 0;
    let currentWeekCharsCount = 0;
    let masteredCount = 0;
    let unfamiliarCount = 0;

    curData.lessons.forEach((l) => {
      const isTaught = l.lessonNo <= prog.currentLesson;
      const isCurrent = l.lessonNo === prog.currentLesson;

      (l.characters || []).forEach((c) => {
        const charStr = c.char;
        const isMastered = !!state.masteredChars[charStr];
        if (isTaught) taughtCharsCount++;
        if (isCurrent) currentWeekCharsCount++;
        if (isMastered) masteredCount++;
        else if (isTaught) unfamiliarCount++;

        allChars.push({
          ...c,
          lessonNo: l.lessonNo,
          lessonTitle: l.title,
          isTaught,
          isCurrent,
          isMastered
        });
      });
    });

    $('stat-taught-count').textContent = taughtCharsCount;
    $('stat-current-count').textContent = currentWeekCharsCount;
    $('stat-mastered-count').textContent = masteredCount;
    $('stat-unfamiliar-count').textContent = unfamiliarCount;
    updateExportBar();

    // 依篩選條件過濾
    let filtered = allChars;
    if (state.filterStatus === 'current') {
      filtered = allChars.filter((c) => c.isCurrent);
    } else if (state.filterStatus === 'unfamiliar') {
      filtered = allChars.filter((c) => c.isTaught && !c.isMastered);
    } else if (state.filterStatus === 'mastered') {
      filtered = allChars.filter((c) => c.isMastered);
    }

    // 繪製字卡格
    const grid = $('char-grid');
    grid.innerHTML = '';
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="tp-empty" style="grid-column: 1/-1;"><p>目前條件下沒有生字</p></div>';
      return;
    }

    filtered.forEach((c) => {
      const card = document.createElement('div');
      let statusCls = c.isMastered ? 'tp-char-card--mastered' : c.isCurrent ? 'tp-char-card--current' : c.isTaught ? 'tp-char-card--taught' : 'tp-char-card--upcoming';
      card.className = `tp-char-card ${statusCls}`;

      // 使用 TPZhuyin.cell 產生標準田字格與右側直式注音
      const cell = TPZhuyin.cell(c.char, effBopomofo(c.char, c.bopomofo), {
        size: 'md',
        status: c.isCurrent ? 'current' : c.isTaught ? 'learned' : 'upcoming'
      });
      card.appendChild(cell);

      // 課次與部首筆畫小字標籤
      const meta = document.createElement('div');
      meta.className = 'tp-char-card__meta';
      meta.innerHTML = `<span class="tp-caption">L${c.lessonNo}</span><span class="tp-caption">${c.radical ? c.radical + '部' : ''} ${c.strokes ? c.strokes + '畫' : ''}</span>`;
      card.appendChild(meta);

      // 破音／已修改小標記
      const zzTags = buildCardTags(c);
      if (zzTags) card.appendChild(zzTags);

      // 熟悉度切換按鈕（愛心/星星）
      const starBtn = document.createElement('button');
      starBtn.type = 'button';
      starBtn.className = `tp-btn-star ${c.isMastered ? 'is-active' : ''}`;
      starBtn.setAttribute('aria-label', c.isMastered ? '標記為待加強' : '標記為已精熟');
      starBtn.innerHTML = c.isMastered ? '★ 已精熟' : '☆ 待加強';
      starBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMastered(c.char);
      };
      card.appendChild(starBtn);

      // 點擊卡片開啟詳情 Modal
      card.onclick = () => showCharDetailModal(c);
      grid.appendChild(card);
    });
  }

  function toggleMastered(charStr) {
    if (state.masteredChars[charStr]) {
      delete state.masteredChars[charStr];
    } else {
      state.masteredChars[charStr] = true;
    }
    saveMastered();
    renderProgressView();
  }

  // -----------------------------------------------------------
  // 生字詳情彈窗（官方連結、筆順、釋義、例詞）
  // -----------------------------------------------------------
  function showCharDetailModal(c) {
    const modal = $('char-modal');
    $('modal-char-wrap').innerHTML = '';
    state.modalChar = c;
    closeEditor();
    setZzMsg('zz-error', '', '');
    setZzMsg('zz-msg', '', '');
    setZzMsg('zz-report-msg', '', '');
    const bigCell = TPZhuyin.cell(c.char, effBopomofo(c.char, c.bopomofo), { size: 'xl', status: 'current' });
    $('modal-char-wrap').appendChild(bigCell);

    $('modal-char-title').textContent = `${c.char}（${c.lessonTitle}）`;
    $('modal-char-rad').textContent = c.radical ? `${c.radical} 部` : '—';
    $('modal-char-strokes').textContent = c.strokes ? `${c.strokes} 畫` : '—';
    $('modal-char-def').textContent = c.def || '教育部簡編本提供基礎國小教學釋義。';
    renderReadingSection(c);

    // 筆順圖
    const strokeContainer = $('modal-char-stroke-img');
    if (c.strokeImg) {
      strokeContainer.innerHTML = `<img src="${c.strokeImg}" alt="${c.char} 筆順圖" style="max-height:100px;border-radius:6px;border:1px solid #E8DFCE;">`;
      strokeContainer.style.display = 'block';
    } else {
      strokeContainer.style.display = 'none';
    }

    // 官方連結
    const moeDict = c.moeDictUrl || `https://dict.concised.moe.edu.tw/search.jsp?md=1&word=${encodeURIComponent(c.char)}`;
    const moeStroke = c.moeStrokeUrl || `https://stroke-order.learningweb.moe.edu.tw/searchW.jsp?WORD=${encodeURIComponent(c.char)}`;
    const pedia = `https://pedia.cloud.edu.tw/Entry/Detail/?title=${encodeURIComponent(c.char)}`;

    $('modal-link-dict').href = moeDict;
    $('modal-link-stroke').href = moeStroke;
    $('modal-link-pedia').href = pedia;

    // 熟練度按鈕
    const isM = !!state.masteredChars[c.char];
    const mBtn = $('modal-toggle-mastered');
    mBtn.textContent = isM ? '★ 目前已標記為【精熟】（點擊改為待加強）' : '☆ 目前標記為【待加強】（點擊標為精熟）';
    mBtn.className = isM ? 'tp-btn tp-btn--secondary tp-btn--block' : 'tp-btn tp-btn--primary tp-btn--block';
    mBtn.onclick = () => {
      toggleMastered(c.char);
      showCharDetailModal({ ...c, isMastered: !isM });
    };

    modal.classList.add('is-open');
  }

  // -----------------------------------------------------------
  // 線上互動測驗模式
  // -----------------------------------------------------------
  function startInteractiveQuiz() {
    const prog = resolveProgress();
    const curData = getCurrentLessonsData();
    const scope = $('quiz-scope').value; // 'current' | 'all-taught' | 'unfamiliar'
    const qCount = parseInt($('quiz-count').value, 10) || 5;

    // 收集題庫
    let pool = [];
    curData.lessons.forEach((l) => {
      if (scope === 'current' && l.lessonNo !== prog.currentLesson) return;
      if (scope === 'all-taught' && l.lessonNo > prog.currentLesson) return;

      // 優先從情境句子抽取
      (l.sentences || []).forEach((s) => {
        pool.push({
          type: 'sentence',
          lessonNo: l.lessonNo,
          text: s.text,
          target: s.target,
          bopomofoArray: s.bopomofoArray
        });
      });

      // 亦加入生字常用詞語
      (l.words || []).forEach((w) => {
        pool.push({
          type: 'word',
          lessonNo: l.lessonNo,
          text: `請寫出語詞「${w.word}」`,
          target: w.word,
          bopomofoArray: w.bopomofoArray
        });
      });
    });

    if (scope === 'unfamiliar') {
      pool = pool.filter((q) => {
        return Array.from(q.target).some((ch) => !state.masteredChars[ch]);
      });
    }

    if (pool.length === 0) {
      alert('目前設定範圍內沒有足夠的題目，請擴大出題範圍！');
      return;
    }

    // 隨機抽樣不重複題目
    const shuffled = pool.slice().sort(() => 0.5 - Math.random());
    const seen = new Set();
    const selected = [];
    for (const q of shuffled) {
      if (!seen.has(q.target)) {
        seen.add(q.target);
        selected.push(q);
        if (selected.length >= qCount) break;
      }
    }

    state.interactiveQuiz = {
      questions: selected,
      currentIndex: 0,
      score: 0,
      answers: []
    };

    renderQuizCard();
  }

  function renderQuizCard() {
    const qState = state.interactiveQuiz;
    const container = $('interactive-quiz-container');
    container.innerHTML = '';

    if (!qState || qState.currentIndex >= qState.questions.length) {
      // 測驗結束畫面
      const total = qState ? qState.questions.length : 0;
      const score = qState ? qState.score : 0;
      const stars = score === total ? '⭐⭐⭐ 太棒了！全部答對！' : score >= total * 0.7 ? '⭐⭐ 表現很好！繼續加油！' : '⭐ 多多練習，一定會越來越熟練！';

      container.innerHTML = `
        <div class="tp-quiz-finish tp-stack" style="text-align:center;padding:40px 20px;">
          <h2 style="font-size:2rem;color:var(--tp-amber-deep);">練習完成！</h2>
          <p style="font-size:1.3rem;font-weight:700;">得分：${score} / ${total}</p>
          <p style="font-size:1.1rem;color:var(--tp-cinnabar-dark);">${stars}</p>
          <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
            <button class="tp-btn tp-btn--primary" id="btn-quiz-restart">再練一次</button>
          </div>
        </div>
      `;
      $('btn-quiz-restart').onclick = startInteractiveQuiz;
      return;
    }

    const q = qState.questions[qState.currentIndex];
    const card = document.createElement('div');
    card.className = 'tp-card tp-quiz-card tp-stack';
    card.style.padding = '24px';

    const progBar = document.createElement('div');
    progBar.className = 'tp-caption';
    progBar.textContent = `第 ${qState.currentIndex + 1} 題 / 共 ${qState.questions.length} 題（${q.lessonTitle || '第 ' + q.lessonNo + ' 課'}）`;
    card.appendChild(progBar);

    // 題目區域：句子挖空，空格旁由上而下直排注音
    const qBody = document.createElement('div');
    qBody.style.margin = '20px 0';
    qBody.style.fontSize = '1.3rem';

    if (q.type === 'sentence') {
      qBody.appendChild(TPZhuyin.sentence(q.text, [{
        word: q.target,
        bopomofoArray: overrideArr(q.target, q.bopomofoArray)
      }], { size: 'lg', blank: true }));
    } else {
      const prompt = document.createElement('div');
      prompt.style.display = 'flex';
      prompt.style.alignItems = 'center';
      prompt.style.gap = '12px';
      prompt.innerHTML = '<span>看注音寫國字：</span>';
      prompt.appendChild(TPZhuyin.word(q.target, overrideArr(q.target, q.bopomofoArray), { size: 'lg', blank: true }));
      qBody.appendChild(prompt);
    }
    card.appendChild(qBody);

    // 作答輸入與按鈕
    const ansArea = document.createElement('div');
    ansArea.className = 'tp-quiz-ans-area';
    ansArea.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="text" id="quiz-input" class="tp-input" placeholder="在此輸入國字作答" style="font-size:1.4rem;max-width:200px;text-align:center;">
        <button class="tp-btn tp-btn--primary tp-btn--lg" id="btn-submit-ans">核對答案</button>
        <button class="tp-btn tp-btn--text" id="btn-peek-ans">看解答提示</button>
      </div>
      <div id="quiz-feedback" style="margin-top:14px;font-size:1.1rem;font-weight:700;"></div>
    `;
    card.appendChild(ansArea);
    container.appendChild(card);

    const input = $('quiz-input');
    input.focus();

    function checkAns() {
      const userVal = input.value.trim();
      const feedback = $('quiz-feedback');
      if (!userVal) {
        feedback.innerHTML = '<span style="color:var(--tp-cinnabar-dark);">請先輸入文字再核對喔！</span>';
        return;
      }
      if (userVal === q.target) {
        qState.score++;
        feedback.innerHTML = '<span style="color:var(--tp-sage-deep);">🎉 答對了！非常棒！</span>';
        input.disabled = true;
        $('btn-submit-ans').disabled = true;
        setTimeout(() => {
          qState.currentIndex++;
          renderQuizCard();
        }, 1200);
      } else {
        feedback.innerHTML = `<span style="color:var(--tp-cinnabar-dark);">答錯囉！正確是「${q.target}」，已收錄至錯題加強。</span>`;
        // 記錄錯題
        state.mistakes.push(q.target);
        saveMastered();
        setTimeout(() => {
          qState.currentIndex++;
          renderQuizCard();
        }, 2200);
      }
    }

    $('btn-submit-ans').onclick = checkAns;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') checkAns();
    };

    $('btn-peek-ans').onclick = () => {
      $('quiz-feedback').innerHTML = `<span style="color:var(--tp-amber-deep);">提示：目標國字為【${q.target}】</span>`;
    };
  }

  // -----------------------------------------------------------
  // A4 考卷與答案卷產出
  // -----------------------------------------------------------
  function renderWorksheet() {
    const prog = resolveProgress();
    const curData = getCurrentLessonsData();
    const showZhuyin = $('ws-sw-zhuyin').checked;
    const title = $('ws-title').value.trim() || '國語生字小考';

    // 更新年級標籤與卷號
    const gradeLabels = {1:'一',2:'二',3:'三',4:'四',5:'五',6:'六'};
    const gLabel = gradeLabels[state.currentGrade] || state.currentGrade;
    $('ws-grade-label').textContent = `${gLabel}年級`;
    const maxLesson = prog.currentLesson;
    $('ws-serial').textContent = `${state.currentGrade}A-L${String(maxLesson).padStart(2,'0')}`;

    $('sheet-title').textContent = title;
    $('answer-title').textContent = title + '・答案卷';
    $('sheet-sub').textContent = `${curData.name}・第 1～${maxLesson} 課測驗`;
    $('answer-sub').textContent = `${curData.name}・第 1～${maxLesson} 課解答`;

    // 卷首個人資料開關
    document.querySelectorAll('.tp-sheet__field').forEach((f) => {
      const key = f.dataset.field;
      const chk = $(`ws-sw-${key}`);
      if (chk) f.style.display = chk.checked ? '' : 'none';
    });

    // 收集可用題目
    let poolSentences = [];
    let poolWords = [];

    curData.lessons.forEach((l) => {
      if (l.lessonNo > prog.currentLesson) return;
      (l.sentences || []).forEach((s) => {
        poolSentences.push({
          lessonNo: l.lessonNo,
          text: s.text,
          target: s.target,
          bopomofoArray: s.bopomofoArray
        });
      });
      (l.words || []).forEach((w) => {
        poolWords.push({
          lessonNo: l.lessonNo,
          word: w.word,
          bopomofoArray: w.bopomofoArray
        });
      });
    });

    const hasSentences = poolSentences.length > 0;

    // 動態調整題數上限
    const countInput = $('ws-count');
    const maxPool = hasSentences ? poolSentences.length : poolWords.length;
    countInput.max = Math.max(1, maxPool);
    const count = Math.min(parseInt(countInput.value, 10) || 8, maxPool);

    // 隨機抽樣不重複
    const shuffledSent = poolSentences.slice().sort(() => 0.5 - Math.random());
    const pickedSent = [];
    const seenSent = new Set();
    for (const s of shuffledSent) {
      if (!seenSent.has(s.target)) {
        seenSent.add(s.target);
        pickedSent.push(s);
        if (pickedSent.length >= count) break;
      }
    }

    const wordCount = hasSentences ? 6 : count;
    const shuffledWords = poolWords.slice().sort(() => 0.5 - Math.random());
    const pickedWords = [];
    const seenWords = new Set();
    for (const w of shuffledWords) {
      if (!seenWords.has(w.word) && !seenSent.has(w.word)) {
        seenWords.add(w.word);
        pickedWords.push(w);
        if (pickedWords.length >= wordCount) break;
      }
    }

    // 取得 section 元素
    const sentSection = $('sheet-items').closest('.tp-sheet__section');
    const ansSentSection = $('answer-items').closest('.tp-sheet__section');

    // 1. 句子題：有句子才顯示
    const sheetSentList = $('sheet-items');
    const ansSentList = $('answer-items');
    sheetSentList.innerHTML = '';
    ansSentList.innerHTML = '';

    if (hasSentences && pickedSent.length > 0) {
      sentSection.style.display = '';
      ansSentSection.style.display = '';

      pickedSent.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'tp-item';
        row.innerHTML = `<span class="tp-item__no">${i + 1}．</span>`;
        const body = document.createElement('div');
        body.className = 'tp-item__body';
        body.appendChild(TPZhuyin.sentence(item.text, [{
          word: item.target,
          bopomofoArray: overrideArr(item.target, item.bopomofoArray)
        }], { size: 'print', blank: true, showZhuyin }));
        row.appendChild(body);
        sheetSentList.appendChild(row);

        const aRow = document.createElement('div');
        aRow.className = 'tp-item';
        aRow.innerHTML = `<span class="tp-item__no">${i + 1}．</span>`;
        const aBody = document.createElement('div');
        aBody.className = 'tp-item__body';
        aBody.appendChild(TPZhuyin.sentence(item.text, [{
          word: item.target,
          bopomofoArray: overrideArr(item.target, item.bopomofoArray)
        }], { size: 'print', blank: false, status: 'answer', showZhuyin }));
        aRow.appendChild(aBody);
        ansSentList.appendChild(aRow);
      });
    } else {
      // 隱藏空的句子大題
      sentSection.style.display = 'none';
      ansSentSection.style.display = 'none';
    }

    // 動態編號：句子題存在 → 詞語題是「二」，否則是「一」
    const wordSectionNum = hasSentences && pickedSent.length > 0 ? '二' : '一';
    const sheetWordTitle = $('sheet-words').closest('.tp-sheet__section').querySelector('.tp-sheet__section-title');
    const ansWordTitle = $('answer-words').closest('.tp-sheet__section').querySelector('.tp-sheet__section-title');
    if (sheetWordTitle) {
      sheetWordTitle.innerHTML = `${wordSectionNum}、看注音寫詞語<span class="tp-sheet__section-hint">（把詞語寫在相連的格子裡）</span>`;
    }
    if (ansWordTitle) {
      ansWordTitle.textContent = `${wordSectionNum}、看注音寫詞語解答`;
    }

    // 2. 詞語題
    const sheetWordGrid = $('sheet-words');
    const ansWordGrid = $('answer-words');
    sheetWordGrid.innerHTML = '';
    ansWordGrid.innerHTML = '';

    pickedWords.forEach((w, i) => {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '8px';
      wrap.innerHTML = `<span style="font-weight:700;">(${i + 1})</span>`;
      wrap.appendChild(TPZhuyin.word(w.word, overrideArr(w.word, w.bopomofoArray), { size: 'print', blank: true, showZhuyin }));
      sheetWordGrid.appendChild(wrap);

      // 答案卷詞語解答
      const aWrap = document.createElement('div');
      aWrap.style.display = 'flex';
      aWrap.style.alignItems = 'center';
      aWrap.style.gap = '8px';
      aWrap.innerHTML = `<span style="font-weight:700;">(${i + 1})</span>`;
      aWrap.appendChild(TPZhuyin.word(w.word, overrideArr(w.word, w.bopomofoArray), { size: 'print', blank: false, status: 'answer', showZhuyin }));
      ansWordGrid.appendChild(aWrap);
    });
  }

  // -----------------------------------------------------------
  // 動態載入年級資料
  // -----------------------------------------------------------
  async function loadGradeData(grade) {
    if (state.gradeData[grade]) return state.gradeData[grade];
    const file = GRADE_DATA_FILES[grade];
    if (!file) return null;
    try {
      const res = await fetch(file);
      if (!res.ok) {
        console.warn(`年級 ${grade} 資料檔 ${file} 載入失敗 (${res.status})`);
        return null;
      }
      const data = await res.json();
      state.gradeData[grade] = data;
      return data;
    } catch (e) {
      console.warn(`年級 ${grade} 資料檔載入失敗`, e);
      return null;
    }
  }

  async function switchGrade(grade) {
    state.currentGrade = grade;
    state.manualLesson = null;
    savePrefs();

    // 載入該年級資料
    await loadGradeData(grade);

    // 110 學年度與體驗版目前只支援二年級
    const typeSelect = $('curriculum-type-select');
    if (grade !== 2) {
      // 如果目前選的是 110 或 demo，自動切回 115-1
      if (state.currentCurriculumType !== '115-1') {
        state.currentCurriculumType = '115-1';
        typeSelect.value = '115-1';
        savePrefs();
      }
    }

    // 更新年級標籤
    const gradeLabel = $('ws-grade-label');
    if (gradeLabel) gradeLabel.textContent = GRADE_LABELS[grade] || grade + '年級';

    renderProgressView();
    if (state.activeTab === 'worksheet') renderWorksheet();
  }

  // -----------------------------------------------------------
  // 啟動與事件綁定
  // -----------------------------------------------------------
  async function init() {
    loadLocalState();

    // 載入 JSON 資料：先載目前年級的 115-1 + 110 + demo（後兩者僅二年級用）
    try {
      const [gradeRes, res110, resDemo] = await Promise.all([
        loadGradeData(state.currentGrade),
        fetch('data/curriculum-110.json').then((r) => r.json()),
        fetch('data/curriculum-demo.json').then((r) => r.json())
      ]);
      state.curriculum110 = res110;
      state.curriculumDemo = resDemo;
    } catch (e) {
      console.error('載入教材資料檔失敗', e);
      alert('教材資料載入失敗，請確認網路連線或本機檔案路徑。');
      return;
    }

    // 年級選擇器
    const gradeSelect = $('grade-select');
    gradeSelect.value = String(state.currentGrade);
    gradeSelect.onchange = (e) => {
      switchGrade(parseInt(e.target.value, 10) || 2);
    };

    // 版本選擇器切換
    $('pub-select').value = state.currentPublisher;
    $('curriculum-type-select').value = state.currentCurriculumType;

    $('pub-select').onchange = (e) => {
      state.currentPublisher = e.target.value;
      savePrefs();
      renderProgressView();
      if (state.activeTab === 'worksheet') renderWorksheet();
    };

    $('curriculum-type-select').onchange = (e) => {
      state.currentCurriculumType = e.target.value;
      savePrefs();
      renderProgressView();
      if (state.activeTab === 'worksheet') renderWorksheet();
    };

    // 手動覆寫進度切換
    $('manual-lesson-select').onchange = (e) => {
      const val = e.target.value;
      state.manualLesson = val ? parseInt(val, 10) : null;
      savePrefs();
      renderProgressView();
      if (state.activeTab === 'worksheet') renderWorksheet();
    };

    // 生字清單篩選按鈕
    $$('.tp-filter-chip').forEach((btn) => {
      btn.onclick = () => {
        $$('.tp-filter-chip').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.filterStatus = btn.dataset.filter;
        renderProgressView();
      };
    });

    // 導覽標籤切換
    $$('.tp-nav-btn').forEach((btn) => {
      btn.onclick = () => {
        $$('.tp-nav-btn').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        const tab = btn.dataset.tab;
        state.activeTab = tab;
        $$('.tp-tab-page').forEach((p) => p.classList.remove('on'));
        $(`page-${tab}`).classList.add('on');

        if (tab === 'interactive' && !state.interactiveQuiz) {
          startInteractiveQuiz();
        } else if (tab === 'interactive') {
          renderQuizCard();            // 套用剛修改的讀音
        } else if (tab === 'worksheet') {
          renderWorksheet();
        }
      };
    });

    // Modal 關閉
    $('modal-close-btn').onclick = () => $('char-modal').classList.remove('is-open');
    $('char-modal').onclick = (e) => {
      if (e.target.id === 'char-modal') $('char-modal').classList.remove('is-open');
    };

    // 互動練習控制
    $('btn-start-interactive').onclick = startInteractiveQuiz;

    // 多音字標注與修改讀音
    wireReadingUi();

    // 考卷設定更動事件
    $('btn-generate-ws').onclick = renderWorksheet;
    $('btn-print-ws').onclick = () => window.print();

    // 首次載入即渲染進度與生字清單
    renderProgressView();

    // 更新年級標籤
    const gradeLabel = $('ws-grade-label');
    if (gradeLabel) gradeLabel.textContent = GRADE_LABELS[state.currentGrade] || '二年級';

    // 支援網址 Hash 切換
    if (window.location.hash === '#worksheet') {
      $$('.tp-nav-btn').forEach((b) => b.classList.remove('on'));
      const wsBtn = document.querySelector('[data-tab="worksheet"]');
      if (wsBtn) wsBtn.classList.add('on');
      $$('.tp-tab-page').forEach((p) => p.classList.remove('on'));
      $('page-worksheet').classList.add('on');
      renderWorksheet();
    } else if (window.location.hash === '#interactive') {
      $$('.tp-nav-btn').forEach((b) => b.classList.remove('on'));
      const qzBtn = document.querySelector('[data-tab="interactive"]');
      if (qzBtn) qzBtn.classList.add('on');
      $$('.tp-tab-page').forEach((p) => p.classList.remove('on'));
      $('page-interactive').classList.add('on');
      startInteractiveQuiz();
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
