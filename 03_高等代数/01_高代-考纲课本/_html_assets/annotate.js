/* ============================================================
   考研数分 HTML 讲解页 · 批注系统（annotate.js）
   功能：选中文字添加批注 / 高亮显示 / 点击查看编辑 / 列表管理 /
         导出 JSON、复制 Markdown、导入 JSON（localStorage 持久化）
   依赖：annotate-core.js（定位算法）；由 guide.js 动态加载
   设计：所有 UI 挂在 body 下并带 .kaoyan-ann-ui 类，不干扰正文文本映射；
         所有功能 try/catch 包裹，任何失败不影响页面阅读。
   ============================================================ */
(function () {
  'use strict';
  if (window.__kaoyanAnnotateLoaded) return;
  window.__kaoyanAnnotateLoaded = true;

  var CORE = window.AnnotateCore || null;
  var STORE_KEY = 'kaoyan-ann:' + location.pathname;
  var HL_NAME = 'kaoyan-ann';
  /* 批注类型：key 用于存储与 highlight 名，color 为色块背景 */
  var TYPES = [
    { key: 'confuse', label: '困惑', icon: '❓', color: '#ffd8cc', deep: '#c2410c' },
    { key: 'insight', label: '感悟', icon: '💡', color: '#d8f0cf', deep: '#2f7d32' },
    { key: 'check',   label: '待查', icon: '🔎', color: '#ffe8b0', deep: '#a16207' },
    { key: 'error',   label: '易错', icon: '⚠️', color: '#f8cfd8', deep: '#b3261e' },
    { key: 'method',  label: '方法', icon: '🧩', color: '#d7e4ff', deep: '#17548a' },
    { key: 'note',    label: '其它', icon: '·',  color: '#e3e3e3', deep: '#555555' }
  ];
  function typeOf(a) {
    var k = (a && a.type) || 'note';
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === k) return TYPES[i];
    return TYPES[TYPES.length - 1];
  }

  var state = {
    inited: false,
    anns: [],
    map: null,            // {nodes, text, el, byNode}
    floatBtn: null,
    panel: null,          // 编辑/查看面板
    listPanel: null,      // 批注列表
    fab: null,
    pendingSel: null,     // {start, end, quote, rect}
    editing: null,        // 正在编辑的批注对象
    sectionCache: null    // 章节标题位置缓存
    , filter: null        // 批注列表按类型筛选（null = 全部）
  };

  /* ================= 小工具 ================= */
  function makeEl(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function brief(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function genId() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* ignore */ }
    return 'a' + Date.now().toString(36) + Math.random().toString(16).slice(2);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var toastTimer = null;
  function toast(msg) {
    try {
      var t = document.querySelector('.kaoyan-ann-toast');
      if (!t) {
        t = makeEl('div', 'kaoyan-ann-ui kaoyan-ann-toast');
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.display = 'block';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.style.display = 'none'; }, 2400);
    } catch (e) { /* ignore */ }
  }

  /* ================= 样式注入 ================= */
  function injectCSS() {
    if (document.querySelector('style.kaoyan-ann-style')) return;
    var css = '' +
      '.kaoyan-ann-float{position:fixed;z-index:2147483000;background:#17548a;color:#fff;border:0;' +
      'border-radius:8px;padding:6px 12px;font-size:13px;line-height:1.4;cursor:pointer;' +
      'box-shadow:0 2px 12px rgba(0,0,0,.28);font-family:inherit;}' +
      '.kaoyan-ann-float:hover{background:#2f6fb3;}' +
      '.kaoyan-ann-fab{position:fixed;top:14px;right:14px;z-index:2147482997;' +
      'background:var(--surface,#fff);color:var(--ink,#1c2733);border:1px solid var(--line,#dde3ea);' +
      'border-radius:999px;padding:7px 14px;font-size:13px;cursor:pointer;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.14);font-family:inherit;}' +
      '.kaoyan-ann-fab:hover{border-color:#2f6fb3;color:#17548a;}' +
      '.kaoyan-ann-fab .kaoyan-ann-count{display:inline-block;min-width:16px;text-align:center;' +
      'background:#17548a;color:#fff;border-radius:999px;font-size:11px;padding:1px 5px;margin-left:4px;}' +
      '.kaoyan-ann-panel{position:fixed;z-index:2147483001;width:330px;max-width:calc(100vw - 28px);' +
      'background:var(--surface,#fff);color:var(--ink,#1c2733);border:1px solid var(--line,#dde3ea);' +
      'border-radius:12px;box-shadow:0 8px 34px rgba(0,0,0,.28);padding:14px;font-family:inherit;}' +
      '.kaoyan-ann-panel .kaoyan-ann-ttl{margin:0 0 8px;font-size:14px;font-weight:700;}' +
      '.kaoyan-ann-quote{font-size:12px;color:var(--ink-3,#7a8a9c);background:var(--surface-2,#f0f2f5);' +
      'border-radius:6px;padding:6px 9px;max-height:84px;overflow:auto;margin-bottom:9px;' +
      'white-space:pre-wrap;word-break:break-all;}' +
      '.kaoyan-ann-panel textarea{width:100%;min-height:86px;resize:vertical;font:inherit;font-size:14px;' +
      'color:var(--ink,#1c2733);background:var(--surface-2,#f0f2f5);border:1px solid var(--line-2,#c8d2dd);' +
      'border-radius:8px;padding:8px 10px;box-sizing:border-box;}' +
      '.kaoyan-ann-row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;}' +
      '.kaoyan-ann-btn{border:1px solid var(--line-2,#c8d2dd);background:var(--surface,#fff);' +
      'color:var(--ink,#1c2733);border-radius:7px;padding:5px 13px;font-size:13px;cursor:pointer;font-family:inherit;}' +
      '.kaoyan-ann-btn:hover{border-color:#2f6fb3;}' +
      '.kaoyan-ann-btn.primary{background:#17548a;border-color:#17548a;color:#fff;}' +
      '.kaoyan-ann-btn.primary:hover{background:#2f6fb3;}' +
      '.kaoyan-ann-btn.danger{color:#b3261e;border-color:#e8c4c0;}' +
      '.kaoyan-ann-list{position:fixed;top:58px;right:14px;z-index:2147482999;width:370px;' +
      'max-width:calc(100vw - 28px);max-height:72vh;overflow:auto;background:var(--surface,#fff);' +
      'color:var(--ink,#1c2733);border:1px solid var(--line,#dde3ea);border-radius:12px;' +
      'box-shadow:0 8px 34px rgba(0,0,0,.28);padding:12px 14px;font-family:inherit;}' +
      '.kaoyan-ann-list .kaoyan-ann-ttl{margin:0 0 6px;font-size:14px;font-weight:700;}' +
      '.kaoyan-ann-item{border-bottom:1px dashed var(--line,#dde3ea);padding:9px 2px;}' +
      '.kaoyan-ann-item:last-of-type{border-bottom:0;}' +
      '.kaoyan-ann-item .q{font-size:12px;color:var(--ink-3,#7a8a9c);word-break:break-all;}' +
      '.kaoyan-ann-item .n{font-size:14px;margin-top:3px;white-space:pre-wrap;word-break:break-word;}' +
      '.kaoyan-ann-item .ops{display:flex;gap:6px;margin-top:6px;}' +
      '.kaoyan-ann-item .ops .kaoyan-ann-btn{font-size:12px;padding:3px 9px;}' +
      '.kaoyan-ann-item .warn{font-size:12px;color:#c05621;margin-top:2px;}' +
      '.kaoyan-ann-empty{color:var(--ink-3,#7a8a9c);font-size:13px;text-align:center;padding:16px 0;}' +
      '.kaoyan-ann-bar{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding-top:10px;' +
      'border-top:1px solid var(--line,#dde3ea);}' +
      '.kaoyan-ann-bar .kaoyan-ann-btn{font-size:12px;padding:4px 10px;}' +
      '.kaoyan-ann-toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);' +
      'z-index:2147483002;background:rgba(18,28,40,.93);color:#fff;font-size:13px;' +
      'padding:8px 18px;border-radius:999px;box-shadow:0 4px 22px rgba(0,0,0,.32);display:none;font-family:inherit;}' +
      '.kaoyan-ann-copypanel textarea{min-height:160px;font-size:12px;font-family:monospace;}' +
      TYPES.map(function (t) {
        return '::highlight(' + HL_NAME + '-' + t.key + '){background-color:' + t.color + ';}';
      }).join('') +
      '::highlight(' + HL_NAME + '){background-color:#e3e3e3;}' +
      '.kaoyan-ann-chips{display:flex;flex-wrap:wrap;gap:5px;margin:2px 0 9px;}' +
      '.kaoyan-ann-chip{border:1px solid var(--line-2,#c8d2dd);background:var(--surface,#fff);' +
      'border-radius:999px;padding:3px 9px;font-size:12px;cursor:pointer;font-family:inherit;' +
      'color:var(--ink,#1c2733);line-height:1.5;}' +
      '.kaoyan-ann-chip.on{background:var(--chip,#e3e3e3);border-color:transparent;font-weight:700;}' +
      '.kaoyan-ann-item{border-left:4px solid transparent;padding-left:9px;}' +
      '.kaoyan-ann-item .q .ico{margin-right:4px;}' +
      /* 右侧停靠栏（Notion 式） */
      '.kaoyan-ann-side{position:sticky;top:0;height:100vh;overflow:auto;background:var(--surface,#fff);' +
      'border-left:1px solid var(--line,#dde3ea);padding:12px 14px 60px;font-family:inherit;' +
      'color:var(--ink,#1c2733);scrollbar-width:thin;}' +
      '.kaoyan-ann-side-head{position:sticky;top:-12px;display:flex;justify-content:flex-end;gap:6px;' +
      'padding:6px 0 4px;background:var(--surface,#fff);z-index:2;}' +
      '.kaoyan-ann-side .kaoyan-ann-list{position:static;top:auto;right:auto;width:auto;max-width:none;' +
      'max-height:none;overflow:visible;border:0;border-radius:0;box-shadow:none;background:transparent;padding:0;}' +
      'html.ann-side-open .kaoyan-ann-fab{display:none;}' +
      '@media (min-width:1101px){html.ann-side-open .app{grid-template-columns:264px minmax(0,1fr) var(--ann-w,340px);}}' +
      '@media (max-width:1100px){.kaoyan-ann-side{position:fixed;left:0;right:0;bottom:0;top:auto;height:46vh;' +
      'z-index:2147483000;border-left:0;border-top:1px solid var(--line,#dde3ea);border-radius:12px 12px 0 0;' +
      'box-shadow:0 -8px 28px rgba(0,0,0,.22);padding-bottom:16px;}}' +
      '@media print{.kaoyan-ann-fab,.kaoyan-ann-float,.kaoyan-ann-panel,.kaoyan-ann-list,.kaoyan-ann-side,.kaoyan-ann-toast{display:none !important;}}';
    var s = makeEl('style', 'kaoyan-ann-ui kaoyan-ann-style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ================= 正文文本映射 ================= */
  function buildTextMap() {
    var root = document.querySelector('.content') || document.body;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !node.nodeValue.length) return NodeFilter.FILTER_REJECT;
        var p = node.parentNode;
        if (!p || !p.nodeName) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('.kaoyan-ann-ui')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], text = '', byNode = new WeakMap(), n;
    while ((n = walker.nextNode())) {
      var v = n.nodeValue;
      var entry = { node: n, start: text.length, end: text.length + v.length };
      nodes.push(entry);
      byNode.set(n, entry);
      text += v;
    }
    state.map = { nodes: nodes, text: text, el: root, byNode: byNode };
    state.sectionCache = null;
  }

  function findEntryForOffset(map, offset) {
    var arr = map.nodes, lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var e = arr[mid];
      if (offset < e.start) hi = mid - 1;
      else if (offset > e.end) lo = mid + 1;
      else return e;
    }
    if (arr.length && offset === arr[arr.length - 1].end) return arr[arr.length - 1];
    if (arr.length && offset === 0) return arr[0];
    return null;
  }

  function offsetsToRange(map, start, end) {
    var se = findEntryForOffset(map, start);
    var ee = findEntryForOffset(map, end);
    if (!se || !ee) return null;
    var r = document.createRange();
    try {
      r.setStart(se.node, Math.max(0, Math.min(start - se.start, se.node.nodeValue.length)));
      r.setEnd(ee.node, Math.max(0, Math.min(end - ee.start, ee.node.nodeValue.length)));
    } catch (e) { return null; }
    return r;
  }

  function firstTextIn(node, map) {
    if (!node) return null;
    if (node.nodeType === 3) {
      var e = map.byNode.get(node);
      return e ? e.start : null;
    }
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var t;
    while ((t = w.nextNode())) {
      var e2 = map.byNode.get(t);
      if (e2) return e2.start;
    }
    return null;
  }
  function lastTextIn(node, map) {
    if (!node) return null;
    if (node.nodeType === 3) {
      var e = map.byNode.get(node);
      return e ? e.end : null;
    }
    var all = [];
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var t;
    while ((t = w.nextNode())) all.push(t);
    for (var i = all.length - 1; i >= 0; i--) {
      var e2 = map.byNode.get(all[i]);
      if (e2) return e2.end;
    }
    return null;
  }

  /** DOM 点（container+offset）→ 全文偏移（近似处理元素节点边界） */
  function pointToOffset(map, container, offset) {
    if (!map || !container) return null;
    if (container.nodeType === 3) {
      var e = map.byNode.get(container);
      if (!e) return null;
      return e.start + offset;
    }
    if (container.nodeType === 1) {
      var child = container.childNodes[offset] || null;
      var nxt = firstTextIn(child, map);
      if (nxt !== null) return nxt;
      var prev = container.childNodes[offset - 1] || null;
      var prv = lastTextIn(prev, map);
      if (prv !== null) return prv;
      var self = firstTextIn(container, map);
      if (self !== null) return self;
    }
    return null;
  }

  /* ================= 存储 ================= */
  function loadAnns() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      state.anns = Array.isArray(arr) ? arr.filter(function (a) {
        return a && a.quote && typeof a.note === 'string';
      }) : [];
    } catch (e) { state.anns = []; }
  }
  function saveAnns() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.anns));
    } catch (e) {
      toast('批注保存失败（浏览器存储受限）');
    }
  }

  /* ================= 高亮绘制 ================= */
  var hlSupported = (typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined');

  function rebuildHighlights() {
    if (!state.map) return;
    state.anns.forEach(function (a) {
      a._resolved = CORE ? CORE.resolveAnchor(state.map.text, a) : null;
    });
    if (!hlSupported) return;
    try {
      CSS.highlights.delete(HL_NAME);
      TYPES.forEach(function (t) { CSS.highlights.delete(HL_NAME + '-' + t.key); });
      var buckets = {};
      state.anns.forEach(function (a) {
        if (!a._resolved) return;
        var r = offsetsToRange(state.map, a._resolved.start, a._resolved.end);
        if (!r) return;
        var k = typeOf(a).key;
        if (!buckets[k]) buckets[k] = [];
        buckets[k].push(r);
      });
      Object.keys(buckets).forEach(function (k) {
        CSS.highlights.set(HL_NAME + '-' + k, new Highlight(...buckets[k]));
      });
    } catch (e) { console.warn('[annotate] 高亮绘制失败', e); }
  }

  /* ================= 选区浮标 ================= */
  function hideFloat() {
    if (state.floatBtn) state.floatBtn.style.display = 'none';
  }

  function handleSelection() {
    try {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { hideFloat(); return; }
      var range = sel.getRangeAt(0);
      if (!state.map || !state.map.el.contains(range.commonAncestorContainer)) { hideFloat(); return; }
      var start = pointToOffset(state.map, range.startContainer, range.startOffset);
      var end = pointToOffset(state.map, range.endContainer, range.endOffset);
      if (start === null || end === null || end <= start) { hideFloat(); return; }
      // 修剪前后空白
      var raw = state.map.text.slice(start, end);
      var lead = raw.length - raw.replace(/^\s+/, '').length;
      var trail = raw.length - raw.replace(/\s+$/, '').length;
      start += lead;
      end -= trail;
      if (end <= start) { hideFloat(); return; }
      var quote = state.map.text.slice(start, end);
      var rect = range.getBoundingClientRect();
      state.pendingSel = { start: start, end: end, quote: quote, rect: rect };
      showFloat(rect);
    } catch (e) { hideFloat(); }
  }

  function showFloat(rect) {
    if (!state.floatBtn) {
      var b = makeEl('button', 'kaoyan-ann-ui kaoyan-ann-float', '✏️ 加批注');
      b.type = 'button';
      b.title = '为选中的文字添加批注';
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (state.pendingSel) openEditor(null, state.pendingSel);
        hideFloat();
      });
      document.body.appendChild(b);
      state.floatBtn = b;
    }
    var b2 = state.floatBtn;
    b2.style.display = 'block';
    var w = b2.offsetWidth || 88, h = b2.offsetHeight || 30;
    var left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 10);
    var top = rect.top - h - 8;
    if (top < 58) top = rect.bottom + 8;
    b2.style.left = left + 'px';
    b2.style.top = top + 'px';
  }

  /* ================= 编辑/查看面板 ================= */
  function closePanel() {
    if (state.panel) { state.panel.remove(); state.panel = null; }
    state.editing = null;
  }

  function positionPanel(rect) {
    var p = state.panel;
    if (!p) return;
    var w = p.offsetWidth || 330;
    var h = p.offsetHeight || 240;
    var left = Math.min(Math.max(8, rect ? rect.left : (window.innerWidth - w - 18)), window.innerWidth - w - 10);
    var top = rect ? (rect.bottom + 10) : (window.innerHeight - h - 60);
    if (top + h > window.innerHeight - 12) top = Math.max(60, (rect ? rect.top : window.innerHeight / 2) - h - 10);
    if (top < 58) top = 58;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  }

  /**
   * 打开面板
   * @param {object|null} ann 已有批注（编辑/查看）或 null（新建）
   * @param {object} selInfo {start, end, quote, rect} 新建时的选区信息
   */
  function openEditor(ann, selInfo) {
    closePanel();
    var isNew = !ann;
    state.editing = ann || null;

    var p = makeEl('div', 'kaoyan-ann-ui kaoyan-ann-panel');
    var title = isNew ? '添加批注' : '查看 / 编辑批注';
    var quoteText = ann ? ann.quote : (selInfo ? selInfo.quote : '');
    var noteText = ann ? ann.note : '';

    p.appendChild(makeEl('div', 'kaoyan-ann-ttl', esc(title)));
    p.appendChild(makeEl('div', 'kaoyan-ann-quote', '「' + esc(brief(quoteText, 260)) + '」'));

    var curType = ann ? (ann.type || 'note') : 'confuse';
    var chipRow = makeEl('div', 'kaoyan-ann-chips');
    TYPES.forEach(function (t) {
      var c = makeEl('button', 'kaoyan-ann-chip', t.icon + ' ' + esc(t.label));
      c.type = 'button';
      c.title = '把这条批注标为「' + t.label + '」';
      c.style.setProperty('--chip', t.color);
      if (t.key === curType) c.classList.add('on');
      c.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        curType = t.key;
        var kids = chipRow.querySelectorAll('.kaoyan-ann-chip');
        for (var i = 0; i < kids.length; i++) kids[i].classList.remove('on');
        c.classList.add('on');
      });
      chipRow.appendChild(c);
    });
    p.appendChild(chipRow);

    var ta = makeEl('textarea');
    ta.placeholder = '写批注…（Ctrl+Enter 保存）';
    ta.value = noteText;
    p.appendChild(ta);

    var row = makeEl('div', 'kaoyan-ann-row');
    if (!isNew) {
      var delBtn = makeEl('button', 'kaoyan-ann-btn danger', '删除');
      delBtn.type = 'button';
      delBtn.addEventListener('click', function () {
        if (!window.confirm('删除这条批注？')) return;
        state.anns = state.anns.filter(function (x) { return x.id !== ann.id; });
        saveAnns(); rebuildHighlights(); updateFab(); renderList();
        closePanel();
        toast('已删除');
      });
      row.appendChild(delBtn);
    }
    var cancelBtn = makeEl('button', 'kaoyan-ann-btn', '取消');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', closePanel);
    row.appendChild(cancelBtn);
    var saveBtn = makeEl('button', 'kaoyan-ann-btn primary', '保存');
    saveBtn.type = 'button';
    row.appendChild(saveBtn);
    p.appendChild(row);

    function doSave() {
      var note = ta.value.trim();
      if (!note) { toast('批注内容为空'); ta.focus(); return; }
      if (isNew) {
        if (!CORE || !state.map || !selInfo) { toast('无法获取选区信息'); return; }
        var anchor = CORE.makeAnchor(state.map.text, selInfo.start, selInfo.end);
        if (!anchor) { toast('选区无效'); return; }
        anchor.id = genId();
        anchor.note = note;
        anchor.type = curType;
        anchor.created = Date.now();
        anchor.updated = Date.now();
        state.anns.push(anchor);
        saveAnns(); rebuildHighlights(); updateFab(); renderList();
        closePanel();
        toast('已添加批注（共 ' + state.anns.length + ' 条）');
      } else {
        ann.note = note;
        ann.type = curType;
        ann.updated = Date.now();
        saveAnns(); rebuildHighlights(); renderList();
        closePanel();
        toast('已更新');
      }
    }
    saveBtn.addEventListener('click', doSave);
    ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSave(); }
    });

    document.body.appendChild(p);
    state.panel = p;
    positionPanel(isNew ? selInfo.rect : null);
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 30);
  }

  /* ================= 浮动入口与列表（先占位，下一段补全） ================= */
  function updateFab() {
    try {
      if (!state.fab) return;
      var c = state.fab.querySelector('.kaoyan-ann-count');
      if (c) c.textContent = String(state.anns.length);
    } catch (e) {}
  }
  /* ================= 批注列表渲染 ================= */
  function renderList() {
    var lp = state.listPanel;
    if (!lp) return;
    lp.innerHTML = '';
    lp.appendChild(makeEl('div', 'kaoyan-ann-ttl', '本页批注（' + state.anns.length + '）'));

    if (state.anns.length) {
      var fr = makeEl('div', 'kaoyan-ann-chips');
      var counts = {};
      state.anns.forEach(function (a) { var k = typeOf(a).key; counts[k] = (counts[k] || 0) + 1; });
      var allBtn = makeEl('button', 'kaoyan-ann-chip' + (state.filter ? '' : ' on'), '全部 ' + state.anns.length);
      allBtn.type = 'button';
      allBtn.style.setProperty('--chip', '#e3e3e3');
      allBtn.addEventListener('click', function (e) { e.stopPropagation(); state.filter = null; renderList(); });
      fr.appendChild(allBtn);
      TYPES.forEach(function (t) {
        if (!counts[t.key]) return;
        var c = makeEl('button', 'kaoyan-ann-chip' + (state.filter === t.key ? ' on' : ''), t.icon + ' ' + counts[t.key]);
        c.type = 'button';
        c.title = '只看「' + t.label + '」';
        c.style.setProperty('--chip', t.color);
        c.addEventListener('click', function (e) {
          e.stopPropagation();
          state.filter = (state.filter === t.key ? null : t.key);
          renderList();
        });
        fr.appendChild(c);
      });
      lp.appendChild(fr);
    }
    var shown = state.anns.filter(function (a) { return !state.filter || typeOf(a).key === state.filter; });

    if (!state.anns.length) {
      lp.appendChild(makeEl('div', 'kaoyan-ann-empty',
        '还没有批注。<br>选中页面中的文字，点击「✏️ 加批注」即可开始。'));
    } else if (!shown.length) {
      lp.appendChild(makeEl('div', 'kaoyan-ann-empty', '这一类暂时没有批注。'));
    } else {
      shown.slice().sort(function (a, b) { return a.created - b.created; }).forEach(function (a, i) {
        var tp = typeOf(a);
        var item = makeEl('div', 'kaoyan-ann-item');
        item.style.borderLeftColor = tp.deep;
        item.appendChild(makeEl('div', 'q', '<span class="ico">' + tp.icon + '</span>#' + (i + 1) + '「' + esc(brief(a.quote, 90)) + '」'));
        item.appendChild(makeEl('div', 'n', esc(a.note)));
        if (!a._resolved) {
          item.appendChild(makeEl('div', 'warn', '⚠ 当前页面中未能定位到原文（内容可能已更新）'));
        }
        var ops = makeEl('div', 'ops');
        var jump = makeEl('button', 'kaoyan-ann-btn', '定位');
        jump.type = 'button';
        jump.addEventListener('click', function () { jumpTo(a); });
        ops.appendChild(jump);
        var edit = makeEl('button', 'kaoyan-ann-btn', '编辑');
        edit.type = 'button';
        edit.addEventListener('click', function () {
          var rect = null;
          try {
            if (a._resolved) {
              var r = offsetsToRange(state.map, a._resolved.start, a._resolved.end);
              if (r) rect = r.getBoundingClientRect();
            }
          } catch (e) {}
          openEditor(a, rect ? { rect: rect, quote: a.quote, start: 0, end: 0 } : { rect: { left: window.innerWidth / 2 - 160, top: 120, bottom: 120 }, quote: a.quote, start: 0, end: 0 });
        });
        ops.appendChild(edit);
        var del = makeEl('button', 'kaoyan-ann-btn danger', '删除');
        del.type = 'button';
        del.addEventListener('click', function () {
          if (!window.confirm('删除这条批注？')) return;
          state.anns = state.anns.filter(function (x) { return x.id !== a.id; });
          saveAnns(); rebuildHighlights(); updateFab(); renderList();
        });
        ops.appendChild(del);
        item.appendChild(ops);
        lp.appendChild(item);
      });
    }

    var bar = makeEl('div', 'kaoyan-ann-bar');
    var mk = function (label, fn) {
      var b = makeEl('button', 'kaoyan-ann-btn', label);
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    };
    bar.appendChild(mk('导出 JSON', exportJSON));
    bar.appendChild(mk('导入 JSON', importJSON));
    bar.appendChild(mk('复制 Markdown', copyMarkdown));
    lp.appendChild(bar);
  }

  function jumpTo(a) {
    if (!a._resolved || !state.map) { toast('无法定位（内容可能已更新）'); return; }
    var r = offsetsToRange(state.map, a._resolved.start, a._resolved.end);
    if (!r) { toast('无法定位'); return; }
    var rect = r.getBoundingClientRect();
    var top = rect.top + (window.pageYOffset || document.documentElement.scrollTop) - 130;
    try { window.scrollTo({ top: top, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, top); }
  }

  /* ================= 导出 / 导入 / 复制 ================= */
  function sectionLabel(a) {
    try {
      if (!a._resolved || !state.map) return '';
      if (!state.sectionCache) {
        var hs = document.querySelectorAll('.content h2');
        state.sectionCache = [];
        for (var i = 0; i < hs.length; i++) {
          var posOff = firstTextIn(hs[i], state.map);
          if (posOff === null) continue;
          state.sectionCache.push({
            off: posOff,
            label: (hs[i].textContent || '').replace(/\s+/g, ' ').trim()
          });
        }
      }
      var best = null;
      for (var j = 0; j < state.sectionCache.length; j++) {
        if (state.sectionCache[j].off <= a._resolved.start) best = state.sectionCache[j];
        else break;
      }
      return best ? best.label : '';
    } catch (e) { return ''; }
  }

  function buildMarkdown() {
    var pageName = '';
    try { pageName = decodeURIComponent((location.pathname.split('/').pop() || '')); } catch (e) {}
    var titleBase = (document.title || '').split('·')[0].trim() || pageName;
    var lines = [];
    lines.push('# ' + titleBase + ' · 页面批注导出');
    lines.push('');
    lines.push('> 来源文件：' + pageName + '　|　导出时间：' + fmtTime(new Date()) + '　|　共 ' + state.anns.length + ' 条');
    lines.push('');
    var sorted = state.anns.slice().sort(function (a, b) { return a.created - b.created; });
    sorted.forEach(function (a, i) {
      var sec = sectionLabel(a);
      lines.push('## ' + (i + 1) + '. ' + (sec ? sec + ' · ' : ''));
      lines.push('');
      lines.push('> [引用] ' + brief(a.quote.replace(/\s+/g, ' '), 220));
      lines.push('>');
      lines.push('> #备注 ' + String(a.note).replace(/\n/g, '\n> '));
      lines.push('');
    });
    if (!sorted.length) lines.push('（本页暂无批注）');
    return lines.join('\n');
  }

  function buildExportData() {
    var pageName = '';
    try { pageName = decodeURIComponent((location.pathname.split('/').pop() || '')); } catch (e) {}
    return {
      page: pageName,
      title: document.title,
      exported_at: new Date().toISOString(),
      version: 1,
      annotations: state.anns.map(function (a) {
        return {
          id: a.id, quote: a.quote, prefix: a.prefix || '', suffix: a.suffix || '',
          pos: a.pos, note: a.note, created: a.created, updated: a.updated
        };
      })
    };
  }

  function downloadText(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var dl = document.createElement('a');
      dl.href = url;
      dl.download = filename;
      document.body.appendChild(dl);
      dl.click();
      setTimeout(function () { URL.revokeObjectURL(url); dl.remove(); }, 800);
      return true;
    } catch (e) { return false; }
  }

  function exportFilename(ext) {
    var base = (document.title || 'page').split('·')[0].trim().replace(/[\\/:*?"<>|\s]+/g, '_') || 'page';
    var d = new Date();
    return '批注_' + base + '_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.' + ext;
  }

  function exportJSON() {
    if (!state.anns.length) { toast('本页还没有批注'); return; }
    var ok = downloadText(exportFilename('json'),
      JSON.stringify(buildExportData(), null, 2), 'application/json;charset=utf-8');
    toast(ok ? '已导出 JSON（保存位置见浏览器下载记录）' : '导出失败，请换 Chrome/Edge 试试');
  }

  function importJSON() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) { input.remove(); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result || ''));
          var list = data && data.annotations;
          if (!Array.isArray(list)) { toast('导入失败：不是本系统的批注文件'); return; }
          var merged = 0, skipped = 0;
          list.forEach(function (item) {
            if (!item || !item.quote || !item.note) { skipped++; return; }
            if (state.anns.some(function (x) { return x.id === item.id; })) { skipped++; return; }
            state.anns.push({
              id: item.id || genId(),
              quote: String(item.quote),
              prefix: String(item.prefix || ''),
              suffix: String(item.suffix || ''),
              pos: (typeof item.pos === 'number') ? item.pos : 0,
              note: String(item.note),
              created: item.created || Date.now(),
              updated: item.updated || Date.now()
            });
            merged++;
          });
          saveAnns(); rebuildHighlights(); updateFab(); renderList();
          toast('导入完成：新增 ' + merged + ' 条' + (skipped ? '，跳过 ' + skipped + ' 条（重复或无效）' : ''));
        } catch (e) {
          toast('导入失败：' + e.message);
        }
      };
      reader.readAsText(f, 'utf-8');
      setTimeout(function () { input.remove(); }, 1000);
    });
    document.body.appendChild(input);
    input.click();
  }

  function copyMarkdown() {
    var md = buildMarkdown();
    function ok() { toast('已复制 Markdown（可直接粘贴给 Hermes）'); }
    function fallback() {
      closePanel();
      var p = makeEl('div', 'kaoyan-ann-ui kaoyan-ann-panel kaoyan-ann-copypanel');
      p.appendChild(makeEl('div', 'kaoyan-ann-ttl', '批注 Markdown（手动复制）'));
      var ta = makeEl('textarea');
      ta.value = md;
      p.appendChild(ta);
      var row = makeEl('div', 'kaoyan-ann-row');
      var cbtn = makeEl('button', 'kaoyan-ann-btn primary', '全选');
      cbtn.type = 'button';
      cbtn.addEventListener('click', function () { ta.focus(); ta.select(); });
      row.appendChild(cbtn);
      var xbtn = makeEl('button', 'kaoyan-ann-btn', '关闭');
      xbtn.type = 'button';
      xbtn.addEventListener('click', closePanel);
      row.appendChild(xbtn);
      p.appendChild(row);
      document.body.appendChild(p);
      state.panel = p;
      positionPanel(null);
      setTimeout(function () { try { ta.focus(); ta.select(); } catch (e) {} }, 50);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(ok, function () { fallback(); });
      } else fallback();
    } catch (e) { fallback(); }
  }

  function buildFab() {
    if (state.fab) return;
    var f = makeEl('button', 'kaoyan-ann-ui kaoyan-ann-fab', '✏️ 批注<span class="kaoyan-ann-count">0</span>');
    f.type = 'button';
    f.title = '查看本页批注列表';
    f.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleList();
    });
    document.body.appendChild(f);
    state.fab = f;
  }

  var SIDE_KEY = 'kaoyan-ann:side-open';

  function openSide() {
    if (state.side) { renderList(); return; }
    var host = document.querySelector('.app') || document.body;
    var side = makeEl('aside', 'kaoyan-ann-ui kaoyan-ann-side');
    side.addEventListener('click', function (e) { e.stopPropagation(); });

    var head = makeEl('div', 'kaoyan-ann-side-head');
    var fold = makeEl('button', 'kaoyan-ann-btn', '折叠 ›');
    fold.type = 'button';
    fold.title = '折叠批注栏';
    fold.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); closeSide();
    });
    head.appendChild(fold);
    side.appendChild(head);

    var lp = makeEl('div', 'kaoyan-ann-ui kaoyan-ann-list');
    lp.addEventListener('click', function (e) { e.stopPropagation(); });
    side.appendChild(lp);

    host.appendChild(side);
    state.side = side;
    state.listPanel = lp;
    document.documentElement.classList.add('ann-side-open');
    try { localStorage.setItem(SIDE_KEY, '1'); } catch (err) {}
    renderList();
  }

  function closeSide() {
    if (state.side) { state.side.remove(); state.side = null; }
    state.listPanel = null;
    document.documentElement.classList.remove('ann-side-open');
    try { localStorage.setItem(SIDE_KEY, '0'); } catch (err) {}
  }

  function toggleList() {
    if (state.side) closeSide(); else openSide();
  }

  /* ================= 事件绑定 ================= */
  function wireEvents() {
    document.addEventListener('mouseup', function () {
      setTimeout(handleSelection, 0);
    });
    document.addEventListener('keyup', function (e) {
      if (e.key === 'Shift' || e.key === 'Escape') {
        if (e.key === 'Escape') { hideFloat(); closePanel(); }
        setTimeout(handleSelection, 0);
      }
    });
    document.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.kaoyan-ann-ui')) return;
      hideFloat();
    });
    window.addEventListener('scroll', hideFloat, { passive: true });

    // 点击高亮区域 → 打开查看面板
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.kaoyan-ann-ui')) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      var ann = annAtPoint(e.clientX, e.clientY);
      if (ann) {
        e.preventDefault();
        openEditor(ann, null);
      } else if (state.panel) {
        closePanel();
      }
    });
  }

  function annAtPoint(x, y) {
    if (!state.map) return null;
    var range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        try { range.setStart(pos.offsetNode, pos.offset); } catch (e) { return null; }
      }
    }
    if (!range || !range.startContainer) return null;
    var off = pointToOffset(state.map, range.startContainer, range.startOffset);
    if (off === null) return null;
    for (var i = 0; i < state.anns.length; i++) {
      var a = state.anns[i];
      if (a._resolved && off >= a._resolved.start && off <= a._resolved.end) return a;
    }
    return null;
  }

  /* ================= 初始化 ================= */
  function tryInit() {
    if (state.inited) return;
    if (!window.__guideMathRendered) return;
    if (!CORE) { console.warn('[annotate] core 未加载，跳过批注功能'); return; }
    state.inited = true;
    try {
      injectCSS();
      buildTextMap();
      loadAnns();
      buildFab();
      wireEvents();
      rebuildHighlights();
      updateFab();
      try { if (localStorage.getItem(SIDE_KEY) === '1') openSide(); } catch (e) {}
      console.log('[annotate] 批注系统已启用，本页批注 ' + state.anns.length + ' 条');
    } catch (e) {
      console.warn('[annotate] 初始化失败', e);
    }
  }

  window.addEventListener('guide:math-rendered', function () { setTimeout(tryInit, 0); });
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(tryInit, 250);
    setTimeout(tryInit, 1500);
  });
  if (window.__guideMathRendered) setTimeout(tryInit, 0);
})();
