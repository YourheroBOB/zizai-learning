/* ============================================================
   zhuyin.js — 台灣標準注音字格系統（直排注音）
   全域：window.TPZhuyin（同時相容 CommonJS / Node.js 測試）。
   
   排版規格：
   1. 國字田字格外框 ＋ 米字虛線輔助線
   2. 注音符號垂直排列於字格右側（由上往下）
   3. 二、三、四聲調號置於最後一個符號之右上方
   4. 輕聲點（˙）精準置於整欄最上方水平居中
   5. 支援完整詞語多格填空（原子塊 .tpz-group 內多個田字格各自附右側注音）
   6. 支援學生卷留白空格（opts.blank=true）與答案卷朱砂紅字（opts.blank=false 或 opts.status='answer'）
   ============================================================ */
(function () {
  'use strict';

  const TONES = ['ˊ', 'ˇ', 'ˋ', '˙'];
  const LIGHT_TONE = '˙';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * 把一個音節字串拆成「符號陣列＋調號」。
   * 例：'ㄏㄤˊ' → { symbols: ['ㄏ','ㄤ'], tone: 'ˊ' }
   *     '˙ㄕ'   → { symbols: ['ㄕ'],    tone: '˙' }
   *     'ㄕㄨ'   → { symbols: ['ㄕ','ㄨ'], tone: null }
   */
  function splitSyllable(syllable) {
    let tone = null;
    const symbols = [];
    const str = String(syllable == null ? '' : syllable).trim();
    for (const ch of str) {
      if (TONES.includes(ch)) {
        tone = ch;
      } else if (ch !== ' ') {
        symbols.push(ch);
      }
    }
    return { symbols, tone };
  }

  /**
   * 建立 DOM 元素輔助函式（在 Node.js 無 DOM 環境時亦可退回自建物件）
   */
  function createElement(tag, className) {
    if (typeof document !== 'undefined') {
      const el = document.createElement(tag);
      if (className) el.className = className;
      return el;
    }
    // Minimal mock for Node testing if needed
    const el = {
      tagName: tag,
      className: className || '',
      children: [],
      style: {},
      dataset: {},
      attributes: {},
      _text: '',
      get textContent() {
        if (this.children.length > 0) {
          return (this._text || '') + this.children.map((c) => c.textContent || '').join('');
        }
        return this._text || '';
      },
      set textContent(val) {
        this._text = val;
      },
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.children.push(child); return child; },
      classList: null
    };
    el.classList = {
      add(cls) {
        if (!el.className.split(/\s+/).includes(cls)) {
          el.className = (el.className + ' ' + cls).trim();
        }
      }
    };
    return el;
  }

  function createTextNode(text) {
    if (typeof document !== 'undefined') {
      return document.createTextNode(text);
    }
    return { nodeType: 3, textContent: text };
  }

  /**
   * 米字格虛線（田字格內的輔助線）
   */
  function makeGrid() {
    if (typeof document === 'undefined') return createElement('svg', 'tpz-cell__grid');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tpz-cell__grid');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('stroke', 'var(--tpz-grid, #E8DFCE)');
    g.setAttribute('stroke-width', '1');
    g.setAttribute('stroke-dasharray', '4 3');

    const lines = [
      ['50%', '4%', '50%', '96%'],   // 直中線
      ['4%', '50%', '96%', '50%'],   // 橫中線
      ['6%', '6%', '94%', '94%'],   // 左上斜
      ['6%', '94%', '94%', '6%']    // 右上斜
    ];
    lines.forEach(([x1, y1, x2, y2]) => {
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', x1);
      l.setAttribute('y1', y1);
      l.setAttribute('x2', x2);
      l.setAttribute('y2', y2);
      g.appendChild(l);
    });
    svg.appendChild(g);
    return svg;
  }

  /**
   * 直排注音欄（置於字格右側）
   */
  function makeColumn(bopomofo, opts) {
    opts = opts || {};
    const { symbols, tone } = splitSyllable(bopomofo);
    const col = createElement('span', 'tpz-col');
    if (opts.toneColor) {
      col.className += ' tpz-col--' + opts.toneColor;
    }

    // 輕聲點：整欄最上方置中
    if (tone === LIGHT_TONE) {
      const lightEl = createElement('span', 'tpz-col__tone tpz-col__tone--light');
      lightEl.setAttribute('aria-hidden', 'true');
      lightEl.textContent = '˙';
      col.appendChild(lightEl);
    }

    // 注音符號（直排由上到下）
    symbols.forEach((sym, i) => {
      const sp = createElement('span', 'tpz-col__sym');
      sp.textContent = sym;
      // 二、三、四聲調號：放在最後一個符號的右上方
      if (i === symbols.length - 1 && tone && tone !== LIGHT_TONE) {
        const toneEl = createElement('span', 'tpz-col__tone');
        toneEl.setAttribute('aria-hidden', 'true');
        toneEl.textContent = tone;
        sp.appendChild(toneEl);
      }
      col.appendChild(sp);
    });

    return col;
  }

  function applySize(el, size) {
    if (size == null) return;
    if (typeof size === 'number') {
      el.style.setProperty('--tpz-size', size + 'px');
    } else if (['sm', 'md', 'lg', 'xl', 'print'].includes(size)) {
      if (el.classList && el.classList.add) {
        el.classList.add('tpz--' + size);
      } else {
        el.className += ' tpz--' + size;
      }
    }
  }

  /**
   * cell(char, bopomofo, opts) → 單一字格（田字格 ＋ 右側直式注音）
   * opts.blank = true → 留白空格供作答
   * opts.status = 'learned' | 'current' | 'upcoming' | 'blank' | 'answer'
   */
  function cell(char, bopomofo, opts) {
    opts = opts || {};
    const wrap = createElement('span', 'tpz-wrap');
    applySize(wrap, opts.size);

    const isBlank = opts.blank === true;
    const status = opts.status || (isBlank ? 'blank' : 'learned');
    const cellEl = createElement('span', 'tpz-cell tpz-cell--' + status);
    cellEl.appendChild(makeGrid());

    const chEl = createElement('span', 'tpz-cell__char');
    if (isBlank) {
      chEl.textContent = '□';
      chEl.setAttribute('aria-hidden', 'true');
      cellEl.setAttribute('aria-label', '空格');
    } else {
      chEl.textContent = char || '';
    }
    cellEl.appendChild(chEl);
    wrap.appendChild(cellEl);

    // 附注音（預設顯示）
    if (opts.showZhuyin !== false && bopomofo) {
      wrap.appendChild(makeColumn(bopomofo, opts));
    }
    return wrap;
  }

  /**
   * word(chars, bopomofos, opts) → 完整詞語（多格連續字組）
   * chars: '航行' 或 ['航','行']
   * bopomofos: ['ㄏㄤˊ', 'ㄒㄧㄥˊ'] 或 'ㄏㄤˊ ㄒㄧㄥˊ'
   */
  function word(chars, bopomofos, opts) {
    opts = opts || {};
    const charsArr = Array.isArray(chars) ? chars : Array.from(String(chars == null ? '' : chars));
    const bpArr = Array.isArray(bopomofos)
      ? bopomofos
      : String(bopomofos == null ? '' : bopomofos).split(/\s+/).filter(Boolean);

    const group = createElement('span', 'tpz-group');
    applySize(group, opts.size);
    charsArr.forEach((c, i) => {
      group.appendChild(cell(c, bpArr[i] || '', opts));
    });
    return group;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * sentence(text, targets, opts) → 句子元素
   * 把句子中指定的 target（詞語或單字）替換為「字格＋右側注音」，其餘文字保留為普通文字。
   * targets 可為:
   *   ['航行'] (搭配 opts.phonics)
   *   [{ word: '航行', bopomofoArray: ['ㄏㄤˊ','ㄒㄧㄥˊ'] }]
   * opts.blank: true 留白空格（學生卷）/ false 顯示國字（答案卷）
   * opts.status: 預設 blank 留白時為 'blank'，解答時為 'answer'
   */
  function sentence(text, targets, opts) {
    opts = opts || {};
    const out = createElement('span', 'tpz-sentence');
    applySize(out, opts.size);

    const items = (targets || []).map((t) => {
      if (typeof t === 'string') return { word: t, bopomofoArray: null };
      return {
        word: t.word || t.target,
        bopomofoArray: t.bopomofoArray || t.bopomofo || null
      };
    }).filter((t) => t && t.word);

    if (items.length === 0) {
      out.textContent = String(text);
      return out;
    }

    // 長詞優先匹配
    const sorted = items.slice().sort((a, b) => b.word.length - a.word.length);
    const pattern = new RegExp(sorted.map((t) => escapeRegExp(t.word)).join('|'), 'g');

    let lastIndex = 0;
    let m;
    const strText = String(text);
    while ((m = pattern.exec(strText)) !== null) {
      if (m.index > lastIndex) {
        out.appendChild(createTextNode(strText.slice(lastIndex, m.index)));
      }
      const matchedWord = m[0];
      const hit = sorted.find((t) => t.word === matchedWord);
      let bpArr = hit.bopomofoArray;
      if (!bpArr && opts.phonics) {
        bpArr = Array.from(matchedWord).map((ch) => opts.phonics[ch] || '');
      }

      const isBlank = opts.blank !== false;
      const cellStatus = opts.status || (isBlank ? 'blank' : 'answer');

      out.appendChild(word(matchedWord, bpArr || [], {
        blank: isBlank,
        showZhuyin: opts.showZhuyin !== false,
        size: opts.cellSize || opts.size,
        status: cellStatus,
        toneColor: opts.toneColor
      }));

      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < strText.length) {
      out.appendChild(createTextNode(strText.slice(lastIndex)));
    }
    return out;
  }

  /**
   * ruby(text, bopomofos) → 小字橫排標注（按鈕、標籤用）
   */
  function ruby(text, bopomofos) {
    const charsArr = Array.from(String(text == null ? '' : text));
    const bpArr = Array.isArray(bopomofos)
      ? bopomofos
      : String(bopomofos == null ? '' : bopomofos).split(/\s+/).filter(Boolean);

    const container = createElement('span', 'tpz-ruby-wrap');
    charsArr.forEach((ch, i) => {
      const rubyEl = createElement('ruby', 'tpz-ruby');
      rubyEl.textContent = ch;
      const rt = createElement('rt');
      rt.textContent = bpArr[i] || '';
      rubyEl.appendChild(rt);
      container.appendChild(rubyEl);
    });
    return container;
  }

  const TPZhuyin = {
    TONES,
    LIGHT_TONE,
    splitSyllable,
    cell,
    word,
    sentence,
    ruby
  };

  if (typeof window !== 'undefined') {
    window.TPZhuyin = TPZhuyin;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TPZhuyin;
  }
})();
