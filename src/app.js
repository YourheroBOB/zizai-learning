/**
 * app.js — 「字在」國小二年級國語生字學習系統主程式
 * 支援多版本教材（康軒、翰林、南一、自編體驗版）、進度推算與家長覆寫、
 * 已教/熟悉度分離建模、生字詳情與官方連結、線上互動練習、A4考卷與答案卷列印。
 */

(function () {
  'use strict';

  // 本地儲存鍵名
  const PREFS_KEY = 'zizai.prefs.v2';
  const MASTERED_KEY = 'zizai.mastered.v2';
  const MISTAKES_KEY = 'zizai.mistakes.v2';

  // 狀態管理
  const state = {
    curriculum115: null,
    curriculum110: null,
    curriculumDemo: null,
    currentCurriculumType: '115-1', // '115-1' | '110' | 'demo'
    currentPublisher: 'kangxuan',   // 'kangxuan' | 'hanlin' | 'nanyi'
    currentSemester: '2a',          // '2a' | '2b'
    manualLesson: null,             // null (自動預估) 或 數字 1~12
    filterStatus: 'all',            // 'all' | 'current' | 'unfamiliar' | 'mastered'
    masteredChars: {},              // { '年': true }
    mistakes: [],                   // 錯題清單
    activeTab: 'progress',          // 'progress' | 'interactive' | 'worksheet'
    interactiveQuiz: null,          // 線上練習狀態
    worksheetData: null             // 目前考卷題目
  };

  // DOM 輔助
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // 初始化儲存
  function loadLocalState() {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (prefs.publisher) state.currentPublisher = prefs.publisher;
      if (prefs.curriculumType) state.currentCurriculumType = prefs.curriculumType;
      if (prefs.semester) state.currentSemester = prefs.semester;
      if (prefs.manualLesson !== undefined) state.manualLesson = prefs.manualLesson;
    } catch (e) {
      console.warn('載入偏好設定失敗', e);
    }
    try {
      state.masteredChars = JSON.parse(localStorage.getItem(MASTERED_KEY) || '{}');
    } catch (e) {}
    try {
      state.mistakes = JSON.parse(localStorage.getItem(MISTAKES_KEY) || '[]');
    } catch (e) {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
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
  // 週次計算與教學進度
  // -----------------------------------------------------------
  function getSemesterStart() {
    if (state.curriculum115 && state.curriculum115.meta && state.curriculum115.meta.semesterStart) {
      return state.curriculum115.meta.semesterStart;
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
      const pub = state.curriculum115.publishers[state.currentPublisher];
      return {
        name: pub.name,
        sourceType: 'official_curriculum',
        editionNote: state.curriculum115.meta.editionNote,
        licenseNotes: state.curriculum115.meta.licenseNotes,
        totalLessons: pub.totalLessons,
        lessons: pub.lessons
      };
    }
    // 110 歷史版
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

  function resolveProgress() {
    const data = getCurrentLessonsData();
    const total = data.totalLessons || 12;
    const weekInfo = calculateWeek();

    if (state.manualLesson !== null && state.manualLesson !== undefined) {
      const clamped = Math.max(1, Math.min(total, state.manualLesson));
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
    $('curriculum-title-badge').textContent = `${curData.name}・${state.currentCurriculumType === 'demo' ? '體驗自編' : '115學年度上學期'}`;
    $('source-license-note').textContent = curData.licenseNotes || '';

    // 週次與進度資訊
    $('stat-week-val').textContent = prog.estimatedWeek > 0 ? `第 ${prog.estimatedWeek} 週` : '尚未開學';
    $('stat-lesson-val').textContent = `第 ${prog.currentLesson} 課`;
    $('stat-lesson-badge').textContent = prog.isManual ? '家長手動覆寫' : '系統自動預估';
    $('stat-lesson-badge').className = prog.isManual ? 'tp-badge tp-badge--amber' : 'tp-badge tp-badge--green';

    // 覆寫下拉選單
    const sel = $('manual-lesson-select');
    sel.innerHTML = '<option value="">自動預估進度</option>';
    for (let i = 1; i <= prog.totalLessons; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `第 ${i} 課：${curData.lessons[i - 1] ? curData.lessons[i - 1].title : ''}`;
      if (state.manualLesson === i) opt.selected = true;
      sel.appendChild(opt);
    }

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
      const cell = TPZhuyin.cell(c.char, c.bopomofo, {
        size: 'md',
        status: c.isCurrent ? 'current' : c.isTaught ? 'learned' : 'upcoming'
      });
      card.appendChild(cell);

      // 課次與部首筆畫小字標籤
      const meta = document.createElement('div');
      meta.className = 'tp-char-card__meta';
      meta.innerHTML = `<span class="tp-caption">L${c.lessonNo}</span><span class="tp-caption">${c.radical ? c.radical + '部' : ''} ${c.strokes ? c.strokes + '畫' : ''}</span>`;
      card.appendChild(meta);

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
    const bigCell = TPZhuyin.cell(c.char, c.bopomofo, { size: 'xl', status: 'current' });
    $('modal-char-wrap').appendChild(bigCell);

    $('modal-char-title').textContent = `${c.char}（第 ${c.lessonNo} 課：${c.lessonTitle}）`;
    $('modal-char-rad').textContent = c.radical ? `${c.radical} 部` : '—';
    $('modal-char-strokes').textContent = c.strokes ? `${c.strokes} 畫` : '—';
    $('modal-char-def').textContent = c.def || '教育部簡編本提供基礎國小教學釋義。';

    // 筆順圖
    const strokeContainer = $('modal-char-stroke-img');
    if (c.strokeImg) {
      strokeContainer.innerHTML = `<img src="${c.strokeImg}" alt="${c.char} 筆順圖" style="max-height:100px;border-radius:6px;border:1px solid #E8DFCE;">`;
      strokeContainer.style.display = 'block';
    } else {
      strokeContainer.style.display = 'none';
    }

    // 官方連結
    const moeDict = c.moeDictUrl || `https://dict.concised.moe.edu.tw/searchResult/searchResult.jsp?dt=Q&word=${encodeURIComponent(c.char)}`;
    const moeStroke = c.moeStrokeUrl || `https://stroke-order.learningweb.moe.edu.tw/characterSearchResult.do?lang=zh_TW&searchType=1&word=${encodeURIComponent(c.char)}`;
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
    progBar.textContent = `第 ${qState.currentIndex + 1} 題 / 共 ${qState.questions.length} 題（來自第 ${q.lessonNo} 課）`;
    card.appendChild(progBar);

    // 題目區域：句子挖空，空格旁由上而下直排注音
    const qBody = document.createElement('div');
    qBody.style.margin = '20px 0';
    qBody.style.fontSize = '1.3rem';

    if (q.type === 'sentence') {
      qBody.appendChild(TPZhuyin.sentence(q.text, [{
        word: q.target,
        bopomofoArray: q.bopomofoArray
      }], { size: 'lg', blank: true }));
    } else {
      const prompt = document.createElement('div');
      prompt.style.display = 'flex';
      prompt.style.alignItems = 'center';
      prompt.style.gap = '12px';
      prompt.innerHTML = '<span>看注音寫國字：</span>';
      prompt.appendChild(TPZhuyin.word(q.target, q.bopomofoArray, { size: 'lg', blank: true }));
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
    const count = parseInt($('ws-count').value, 10) || 8;
    const showZhuyin = $('ws-sw-zhuyin').checked;
    const title = $('ws-title').value.trim() || '國語生字小考';

    $('sheet-title').textContent = title;
    $('answer-title').textContent = title + '・答案卷';
    $('sheet-sub').textContent = `${curData.name}・第 1～${prog.currentLesson} 課測驗`;
    $('answer-sub').textContent = `${curData.name}・第 1～${prog.currentLesson} 課解答`;

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

    const shuffledWords = poolWords.slice().sort(() => 0.5 - Math.random());
    const pickedWords = [];
    const seenWords = new Set();
    for (const w of shuffledWords) {
      if (!seenWords.has(w.word) && !seenSent.has(w.word)) {
        seenWords.add(w.word);
        pickedWords.push(w);
        if (pickedWords.length >= 6) break;
      }
    }

    // 1. 學生卷 — 句子題
    const sheetSentList = $('sheet-items');
    const ansSentList = $('answer-items');
    sheetSentList.innerHTML = '';
    ansSentList.innerHTML = '';

    pickedSent.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'tp-item';
      row.innerHTML = `<span class="tp-item__no">${i + 1}．</span>`;
      const body = document.createElement('div');
      body.className = 'tp-item__body';
      body.appendChild(TPZhuyin.sentence(item.text, [{
        word: item.target,
        bopomofoArray: item.bopomofoArray
      }], { size: 'print', blank: true, showZhuyin }));
      row.appendChild(body);
      sheetSentList.appendChild(row);

      // 答案卷 — 句子解答
      const aRow = document.createElement('div');
      aRow.className = 'tp-item';
      aRow.innerHTML = `<span class="tp-item__no">${i + 1}．</span>`;
      const aBody = document.createElement('div');
      aBody.className = 'tp-item__body';
      aBody.appendChild(TPZhuyin.sentence(item.text, [{
        word: item.target,
        bopomofoArray: item.bopomofoArray
      }], { size: 'print', blank: false, status: 'answer', showZhuyin }));
      aRow.appendChild(aBody);
      ansSentList.appendChild(aRow);
    });

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
      wrap.appendChild(TPZhuyin.word(w.word, w.bopomofoArray, { size: 'print', blank: true, showZhuyin }));
      sheetWordGrid.appendChild(wrap);

      // 答案卷詞語解答
      const aWrap = document.createElement('div');
      aWrap.style.display = 'flex';
      aWrap.style.alignItems = 'center';
      aWrap.style.gap = '8px';
      aWrap.innerHTML = `<span style="font-weight:700;">(${i + 1})</span>`;
      aWrap.appendChild(TPZhuyin.word(w.word, w.bopomofoArray, { size: 'print', blank: false, status: 'answer', showZhuyin }));
      ansWordGrid.appendChild(aWrap);
    });
  }

  // -----------------------------------------------------------
  // 啟動與事件綁定
  // -----------------------------------------------------------
  async function init() {
    loadLocalState();

    // 載入 JSON 資料
    try {
      const [res115, res110, resDemo] = await Promise.all([
        fetch('data/curriculum-115-1.json').then((r) => r.json()),
        fetch('data/curriculum-110.json').then((r) => r.json()),
        fetch('data/curriculum-demo.json').then((r) => r.json())
      ]);
      state.curriculum115 = res115;
      state.curriculum110 = res110;
      state.curriculumDemo = resDemo;
    } catch (e) {
      console.error('載入教材資料檔失敗', e);
      alert('教材資料載入失敗，請確認網路連線或本機檔案路徑。');
      return;
    }

    // 版本選擇器切換
    $('pub-select').value = state.currentPublisher;
    $('curriculum-type-select').value = state.currentCurriculumType;

    $('pub-select').onchange = (e) => {
      state.currentPublisher = e.target.value;
      savePrefs();
      renderProgressView();
      renderWorksheet();
    };

    $('curriculum-type-select').onchange = (e) => {
      state.currentCurriculumType = e.target.value;
      savePrefs();
      renderProgressView();
      renderWorksheet();
    };

    // 手動覆寫進度切換
    $('manual-lesson-select').onchange = (e) => {
      const val = e.target.value;
      state.manualLesson = val ? parseInt(val, 10) : null;
      savePrefs();
      renderProgressView();
      renderWorksheet();
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

    // 考卷設定更動事件
    $('btn-generate-ws').onclick = renderWorksheet;
    $('btn-print-ws').onclick = () => window.print();

    // 首次載入即渲染進度與生字清單（否則要等使用者切換選單才會出現）
    renderProgressView();

    // 支援網址 Hash 切換（例如 #worksheet 直接開考卷預覽）
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
