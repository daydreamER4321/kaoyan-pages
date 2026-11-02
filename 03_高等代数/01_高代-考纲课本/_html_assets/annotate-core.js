/* ============================================================
   考研数分 HTML 讲解页 · 批注定位核心（纯函数，可被 node 测试）
   锚点模型：quote（选中文本）+ prefix/suffix（上下文各40字）+ pos（字符偏移）
   恢复策略：收集全部候选 → 上下文评分（主导）+ 位置距离加成（辅助）
             → 选最优；全部失败后降级为截断重搜
   依赖：无（浏览器挂到 window.AnnotateCore；node 可 require）
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.AnnotateCore = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CTX = 40; // prefix/suffix 上下文长度（字符）

  /** 由文本与起止偏移创建锚点 */
  function makeAnchor(text, start, end) {
    if (start < 0) start = 0;
    if (end > text.length) end = text.length;
    if (end <= start) return null;
    return {
      quote: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - CTX), start),
      suffix: text.slice(end, Math.min(text.length, end + CTX)),
      pos: start,
      len: end - start
    };
  }

  var CTX_CAP = 30;   // 每个方向的匹配计分上限
  var CTX_WEIGHT = 2; // 上下文得分权重（相对位置加成）

  /** 上下文匹配度（prefix 公共后缀 + suffix 公共前缀），0..60 */
  function ctxScoreAt(text, idx, anchor) {
    var q = anchor.quote, n = q.length;
    var p0 = anchor.prefix || '', s0 = anchor.suffix || '';
    var p1 = text.slice(Math.max(0, idx - CTX), idx);
    var s1 = text.slice(idx + n, idx + n + CTX);
    var i = 0, lim = Math.min(p0.length, p1.length);
    while (i < lim && p0.charAt(p0.length - 1 - i) === p1.charAt(p1.length - 1 - i)) i++;
    var j = 0, lim2 = Math.min(s0.length, s1.length);
    while (j < lim2 && s0.charAt(j) === s1.charAt(j)) j++;
    return Math.min(i, CTX_CAP) + Math.min(j, CTX_CAP);
  }

  /** 距离加成：位置越接近锚点原始位置，加成越高（只作辅助） */
  function distBonusAt(idx, anchor) {
    if (typeof anchor.pos !== 'number') return 0;
    var d = Math.abs(idx - anchor.pos);
    if (d === 0) return 20;
    if (d <= 8) return 10;
    if (d <= 80) return 4;
    if (d > 8000) return -10;
    return 0;
  }

  /** 综合得分 */
  function totalScoreAt(text, idx, anchor) {
    return ctxScoreAt(text, idx, anchor) * CTX_WEIGHT + distBonusAt(idx, anchor);
  }
  // 兼容旧名
  function scoreAt(text, idx, anchor) { return totalScoreAt(text, idx, anchor); }

  /**
   * 恢复锚点：返回 {start, end, exact?, fuzzy?, approximate?} 或 null
   * @param {string} text 当前页面正文文本
   * @param {object} anchor 锚点
   */
  function resolveAnchor(text, anchor) {
    if (!anchor || !anchor.quote || !text) return null;
    var q = anchor.quote, n = q.length;
    if (!n) return null;

    // 收集全部候选位置
    var candidates = [], idx = 0, count = 0;
    while (true) {
      idx = text.indexOf(q, idx);
      if (idx === -1) break;
      candidates.push(idx);
      idx = idx + 1;
      count++;
      if (count >= 3000) break; // 防御：极端页面
    }

    if (candidates.length === 1) {
      var only = candidates[0];
      var posHit0 = typeof anchor.pos === 'number' && only === anchor.pos;
      return { start: only, end: only + n, exact: posHit0 || undefined, score: totalScoreAt(text, only, anchor) };
    }

    if (candidates.length > 1) {
      var best = -1, bestScore = -Infinity, posCandidate = -1;
      for (var k = 0; k < candidates.length; k++) {
        var sc = totalScoreAt(text, candidates[k], anchor);
        if (sc > bestScore) { bestScore = sc; best = candidates[k]; }
        if (typeof anchor.pos === 'number' && candidates[k] === anchor.pos) posCandidate = candidates[k];
      }
      var posHit = (posCandidate !== -1) && (text.slice(posCandidate, posCandidate + n) === q);
      return {
        start: best, end: best + n,
        exact: (posHit && best === posCandidate) || undefined,
        fuzzy: true,
        score: bestScore
      };
    }

    // 3) 降级：quote 太长而页面轻微改动——截断首段重搜
    var shortLen = Math.min(60, Math.max(8, Math.floor(n * 0.6)));
    var shortQ = q.slice(0, shortLen);
    if (shortQ && shortQ !== q) {
      idx = text.indexOf(shortQ);
      if (idx !== -1) return { start: idx, end: idx + shortQ.length, approximate: true };
    }
    return null;
  }

  return {
    makeAnchor: makeAnchor,
    resolveAnchor: resolveAnchor,
    ctxScoreAt: ctxScoreAt,
    totalScoreAt: totalScoreAt,
    scoreAt: scoreAt,
    CTX: CTX
  };
});
