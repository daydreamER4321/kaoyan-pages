/* ============================================================
   考研数分 · 考纲课本 HTML 讲解 —— 共享脚本
   功能：KaTeX 自动渲染 / 侧栏目录滚动高亮 / 自测清单本地记忆 /
         移动端目录开关
   依赖：katex.min.js 与 contrib/auto-render.min.js 先于本脚本加载
   ============================================================ */
(function () {
  'use strict';

  var SELF_SRC = (document.currentScript && document.currentScript.src) || '';

  /* 1. KaTeX 自动渲染 */
  function renderMath() {
    if (typeof window.renderMathInElement !== 'function') {
      console.warn('[guide] KaTeX auto-render 未加载，公式将按原样显示。');
      return;
    }
    try {
      window.renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false,
        errorColor: '#c05621',
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
        ignoredClasses: ['no-math']
      });
    } catch (e) {
      console.warn('[guide] 公式渲染出错：', e);
    }
  }

  /* 2. 侧栏目录滚动高亮 */
  function setupToc() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
    if (!links.length || typeof IntersectionObserver === 'undefined') return;

    var map = {};
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) map[id] = a;
    });
    var targets = Object.keys(map).map(function (id) { return document.getElementById(id); });
    if (!targets.length) return;

    var current = null;
    function activate(a) {
      if (current === a) return;
      if (current) current.classList.remove('active');
      current = a;
      if (a) a.classList.add('active');
    }

    var obs = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (e) { return e.isIntersecting; });
      if (!visible.length) return;
      visible.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      activate(map[visible[0].target.id] || null);
    }, { rootMargin: '-12% 0px -70% 0px', threshold: 0 });

    targets.forEach(function (t) { obs.observe(t); });
  }

  /* 3. 自测清单本地持久化 */
  function setupChecklist() {
    var boxes = document.querySelectorAll('.checklist input[type="checkbox"]');
    if (!boxes.length) return;
    var key = 'kaoyan-guide:' + location.pathname.split('/').slice(-2).join('/');
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { saved = {}; }
    boxes.forEach(function (b, i) {
      if (saved[i]) b.checked = true;
      b.addEventListener('change', function () {
        saved[i] = b.checked;
        try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) { /* 忽略隐私模式等 */ }
      });
    });
  }

  /* 4a. 语义卡片：定义/定理/引理/推论/例题等，陈述可见、证明折叠 */
  function setupSemanticCards() {
    var body = document.querySelector('main section#body');
    if (!body || body.getAttribute('data-semantic-cards-ready') === '1') return;
    body.setAttribute('data-semantic-cards-ready', '1');

    function kindOf(el) {
      if (!el || el.tagName !== 'H3') return false;
      var t = (el.textContent || '').trim();
      if (/例(?:题)?\s*[0-9一二三四五六七八九十]/.test(t) || /^例(?:题)?[：:]/.test(t)) return 'example';
      if (/引理/.test(t)) return 'lemma';
      if (/推论/.test(t)) return 'corollary';
      if (/定理/.test(t)) return 'theorem';
      if (/定义/.test(t)) return 'definition';
      if (/叙述式/.test(t)) return 'concept';
      if (/判别法|公式/.test(t)) return 'formula';
      return '';
    }

    var labels = {
      example: '例题', theorem: '定理', lemma: '引理', corollary: '推论',
      definition: '定义', concept: '概念', formula: '公式/判别法'
    };
    function wrapImportantNotes(container) {
      var children = Array.prototype.slice.call(container.children);
      children.forEach(function (node) {
        if (node.tagName !== 'P' || !/^课本注意/.test((node.textContent || '').trim())) return;
        var note = document.createElement('div');
        note.className = 'semantic-note';
        var title = document.createElement('div');
        title.className = 'semantic-note-title';
        title.textContent = '重要注意';
        note.appendChild(title);
        var cur = node;
        while (cur) {
          var next = cur.nextElementSibling;
          var text = (cur.textContent || '').trim();
          note.appendChild(cur);
          if (!next || next.tagName === 'H3' || (next.tagName === 'P' && /^课本(?:证明|注意|补充|过渡)/.test((next.textContent || '').trim()))) break;
          if (!/^(UL|OL|DIV)$/.test(next.tagName)) break;
          cur = next;
        }
        container.insertBefore(note, cur ? cur.nextSibling : null);
      });
    }
    var headings = Array.prototype.slice.call(body.children).map(function (el) {
      return {el: el, kind: kindOf(el)};
    }).filter(function (x) { return !!x.kind; });

    headings.forEach(function (item, idx) {
      var h3 = item.el;
      var kind = item.kind;
      var article = document.createElement('article');
      article.className = 'card semantic-card kind-' + kind;
      article.setAttribute('data-semantic-index', String(idx + 1));
      article.setAttribute('data-semantic-kind', kind);

      var head = document.createElement('div');
      head.className = 'card-head semantic-head';
      var chip = document.createElement('span');
      chip.className = 'chip ' + (kind === 'example' ? 'chip-ex' : kind === 'definition' || kind === 'concept' ? 'chip-def' : kind === 'formula' ? 'chip-key' : 'chip-thm');
      chip.textContent = labels[kind];
      head.appendChild(chip);
      var title = document.createElement('span');
      title.className = 'ctitle';
      title.textContent = (h3.textContent || '').trim();
      head.appendChild(title);

      var nodes = [];
      var n = h3.nextSibling;
      while (n) {
        if (n.nodeType === 1 && /^(H2|H3|HR)$/.test(n.tagName)) break;
        var next = n.nextSibling;
        nodes.push(n);
        n = next;
      }

      var pageNode = nodes.find(function (node) {
        return node.nodeType === 1 && node.matches('p.pgref');
      });
      if (pageNode) {
        var pg = document.createElement('span');
        pg.className = 'pg';
        pg.textContent = (pageNode.textContent || '').trim();
        head.appendChild(pg);
      }
      article.appendChild(head);

      var stemNodes = [];
      var proofNodes = [];
      var inProof = false;
      nodes.forEach(function (node) {
        if (node === pageNode) return;
        var text = node.nodeType === 1 ? (node.textContent || '').trim() : '';
        var startsProof = node.nodeType === 1 && node.tagName === 'P' &&
          (/^(课本)?\s*(证明路线|课本解答路线|解答路线)/.test(text) || /^课本证明/.test(text));
        if (startsProof) inProof = true;
        (inProof ? proofNodes : stemNodes).push(node);
      });

      if (stemNodes.length) {
        var stem = document.createElement('div');
        stem.className = 'semantic-stem';
        stemNodes.forEach(function (node) { stem.appendChild(node); });
        wrapImportantNotes(stem);
        article.appendChild(stem);
      }
      if (proofNodes.length) {
        var details = document.createElement('details');
        details.className = 'fold semantic-proof';
        var summary = document.createElement('summary');
        summary.textContent = kind === 'example' ? '解答（自己先做，再展开）' : '证明 / 说明（自己先复述，再展开）';
        details.appendChild(summary);
        var foldBody = document.createElement('div');
        foldBody.className = 'fold-body';
        proofNodes.forEach(function (node) { foldBody.appendChild(node); });
        wrapImportantNotes(foldBody);
        details.appendChild(foldBody);
        article.appendChild(details);
      }

      h3.parentNode.insertBefore(article, h3);
      h3.remove();
    });
  }

  /* 4b. 定义/定理/说明知识块：把每个 h3 到下一个 h3/h2 的范围框出来 */
  function setupTopicCards() {
    var body = document.querySelector('main section#body');
    if (!body || body.getAttribute('data-topic-cards-ready') === '1') return;
    body.setAttribute('data-topic-cards-ready', '1');

    function classify(title) {
      if (/定义|概念|正项级数|任意项级数|交错级数|绝对收敛|无穷乘积/.test(title)) {
        return { cls: 'c-def', label: '定义 / 概念' };
      }
      if (/定理|引理|推论|判别法|性质|原理/.test(title)) {
        return { cls: 'c-thm', label: '定理 / 方法' };
      }
      return { cls: 'c-plain', label: '说明' };
    }

    var headings = Array.prototype.slice.call(body.children).filter(function (el) {
      return el.tagName === 'H3' && !el.closest('.topic-card, .example-card');
    });

    headings.forEach(function (h3) {
      var title = (h3.textContent || '').trim();
      var kind = classify(title);
      var article = document.createElement('article');
      article.className = 'card topic-card ' + kind.cls;
      article.setAttribute('data-topic-title', title);

      var head = document.createElement('div');
      head.className = 'card-head topic-head';
      var chip = document.createElement('span');
      chip.className = 'chip ' + (kind.cls === 'c-def' ? 'chip-def' : kind.cls === 'c-thm' ? 'chip-thm' : 'chip-ghost');
      chip.textContent = kind.label;
      head.appendChild(chip);
      var titleNode = document.createElement('h3');
      titleNode.className = 'topic-title';
      titleNode.innerHTML = h3.innerHTML;
      head.appendChild(titleNode);

      var nodes = [];
      var n = h3.nextSibling;
      while (n) {
        if (n.nodeType === 1 && /^(H2|H3|HR)$/.test(n.tagName)) break;
        var next = n.nextSibling;
        nodes.push(n);
        n = next;
      }
      var pageNode = nodes.find(function (node) {
        return node.nodeType === 1 && node.matches('p.pgref');
      });
      if (pageNode) {
        var pg = document.createElement('span');
        pg.className = 'pg';
        pg.textContent = (pageNode.textContent || '').trim();
        head.appendChild(pg);
      }
      article.appendChild(head);

      var content = document.createElement('div');
      content.className = 'topic-body';
      nodes.forEach(function (node) {
        if (node !== pageNode) content.appendChild(node);
      });
      article.appendChild(content);
      h3.parentNode.insertBefore(article, h3);
      h3.remove();
    });
  }

  /* 4c. 在节标题处显示本节知识块数量，帮助判断范围和阅读长度 */
  function setupSectionMeta() {
    var body = document.querySelector('main section#body');
    if (!body || body.getAttribute('data-section-meta-ready') === '1') return;
    body.setAttribute('data-section-meta-ready', '1');
    var children = Array.prototype.slice.call(body.children);
    var headings = children.filter(function (el) { return el.tagName === 'H2'; });
    headings.forEach(function (h2, i) {
      if (h2.querySelector('.section-meta')) return;
      var next = headings[i + 1];
      var count = 0;
      var node = h2.nextElementSibling;
      while (node && node !== next) {
        if (node.matches('.topic-card, .semantic-card')) count += 1;
        node = node.nextElementSibling;
      }
      var meta = document.createElement('span');
      meta.className = 'section-meta';
      meta.textContent = count ? ('本节 ' + count + ' 个知识块') : '本节';
      h2.appendChild(meta);
    });
  }

  /* 4d. 每节折叠（默认展开，状态存本机） */
  function setupSectionFold() {
    var secs = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
    if (!secs.length) return;
    var KEY = 'kaoyan-fold:' + location.pathname;
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }

    var st = document.createElement('style');
    st.textContent =
      '.sec-fold{margin-left:10px;border:1px solid var(--line-2,#c8d2dd);background:var(--surface,#fff);' +
      'color:var(--ink-2,#40506a);border-radius:6px;font-size:12px;line-height:1;padding:4px 8px;' +
      'cursor:pointer;font-family:inherit;vertical-align:middle;}' +
      '.sec-fold:hover{border-color:#2f6fb3;color:#17548a;}' +
      'main section.sec-collapsed>*:not(h2){display:none !important;}' +
      'main section.sec-collapsed h2{margin-bottom:0;}' +
      '.fold-all{display:inline-block;margin-top:8px;border:1px solid var(--line-2,#c8d2dd);' +
      'background:var(--surface,#fff);color:var(--ink-2,#40506a);border-radius:6px;font-size:12px;' +
      'padding:4px 10px;cursor:pointer;font-family:inherit;}';
    document.head.appendChild(st);

    function apply(sec, collapsed) {
      sec.classList.toggle('sec-collapsed', collapsed);
      var b = sec.querySelector('.sec-fold');
      if (b) { b.textContent = collapsed ? '+' : '−'; b.title = collapsed ? '展开本节' : '折叠本节'; }
      saved[sec.id] = collapsed;
    }
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} }

    secs.forEach(function (sec) {
      var h2 = sec.querySelector('h2');
      if (!h2) return;
      var btn = document.createElement('button');
      btn.className = 'sec-fold';
      btn.type = 'button';
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        apply(sec, !sec.classList.contains('sec-collapsed'));
        persist();
      });
      h2.appendChild(btn);
      if (saved[sec.id]) apply(sec, true);
    });

    var foot = document.querySelector('.sb-foot');
    if (!foot) return;
    var all = document.createElement('button');
    all.className = 'fold-all';
    all.type = 'button';
    all.textContent = '全部折叠';
    all.addEventListener('click', function () {
      var anyOpen = secs.some(function (s) { return !s.classList.contains('sec-collapsed'); });
      secs.forEach(function (s) { apply(s, anyOpen); });
      all.textContent = anyOpen ? '全部展开' : '全部折叠';
      persist();
    });
    foot.appendChild(all);
  }

  /* 5. 移动端目录开关 */
  function setupToggle() {
    var btn = document.getElementById('tocToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.body.classList.toggle('toc-open');
    });
    document.addEventListener('click', function (e) {
      if (document.body.classList.contains('toc-open') &&
          !e.target.closest('.sidebar') && !e.target.closest('#tocToggle')) {
        document.body.classList.remove('toc-open');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderMath();
    setupToc();
    setupChecklist();
    setupToggle();
    setupSemanticCards();
    setupTopicCards();
    setupSectionMeta();
    setupSectionFold();
    // 通知批注模块：数学渲染已完成（批注锚点必须以渲染后的文本为基准）
    window.__guideMathRendered = true;
    try { window.dispatchEvent(new CustomEvent('guide:math-rendered')); } catch (e) { /* 忽略 */ }
    loadAnnotate();
  });

  /* 5. 动态加载批注增强模块（可选功能；加载失败不影响页面其他功能） */
  function loadAnnotate() {
    if (window.__kaoyanAnnotateRequested) return;
    window.__kaoyanAnnotateRequested = true;
    if (!SELF_SRC) return;
    try {
      var base = SELF_SRC.replace(/guide\.js(\?.*)?$/, '');
      var core = document.createElement('script');
      core.src = base + 'annotate-core.js';
      core.onload = function () {
        var ann = document.createElement('script');
        ann.src = base + 'annotate.js';
        ann.onerror = function () { console.warn('[guide] annotate.js 加载失败'); };
        document.body.appendChild(ann);
      };
      core.onerror = function () { console.warn('[guide] annotate-core.js 加载失败'); };
      document.body.appendChild(core);
    } catch (e) { /* 静默 */ }
  }
})();
