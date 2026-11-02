// 高代 HTML 讲解页 · 全量公式渲染校验（离线本地 KaTeX，无外部依赖）
// 用法:
//   node verify_katex.js                 # 默认校验高代第 8/9/10 章三份讲解页
//   node verify_katex.js <任意 HTML 路径>...   # 校验指定页面
// 退出码: 0 = 全部通过; 1 = 存在失败项。
"use strict";
const fs = require("fs");
const path = require("path");
const katex = require(path.join(__dirname, "katex", "katex.min.js"));
const BS = String.fromCharCode(92);

const DEFAULT_FILES = [
  "../08_第八章_λ-矩阵/06_第八章_λ-矩阵_HTML讲解.html",
  "../09_第九章_欧几里得空间/06_第九章_欧几里得空间_HTML讲解.html",
  "../10_第十章_双线性函数与辛空间/06_第十章_双线性函数与辛空间_HTML讲解.html",
].map(p => path.join(__dirname, p));

const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;

// 在 text 中按“定界符对”提取内容（自左向右配对）
function pairs(text, open, close) {
  const out = []; let i = 0;
  while (true) {
    const j = text.indexOf(open, i);
    if (j < 0) break;
    const e = text.indexOf(close, j + open.length);
    if (e < 0) break;
    out.push(text.slice(j + open.length, e));
    i = e + close.length;
  }
  return out;
}
// 还原 JS 字符串字面量中的转义（\\ -> \，\' -> '）
function jsUnescape(t) {
  return t.split(BS + BS).join(BS).split(BS + "'").join("'");
}

let grandTotal = 0, grandFail = 0;
for (const f of files) {
  const html = fs.readFileSync(f, "utf8");
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, " ");
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join("\n");

  const samples = [];
  // 正文行间公式 $$...$$（markup 中；脚本里的 '$$' 配置项不会进入 markup）
  for (const m of markup.matchAll(/\$\$(.+?)\$\$/gs)) samples.push({ d: true, t: m[1] });
  // 正文行内公式 \( ... \)
  for (const c of pairs(markup, BS + "(", BS + ")")) {
    if (c.trim()) samples.push({ d: false, t: c.replace("&lt;", "<") });
  }
  // 脚本字符串中的公式 \\\( ... \\\)
  for (const c of pairs(inlineScripts, BS + BS + "(", BS + BS + ")")) {
    const cc = c.trim();
    if (cc && cc !== "',right:'") samples.push({ d: false, t: jsUnescape(c) });
  }

  let fail = 0;
  samples.forEach((s, i) => {
    try {
      katex.renderToString(s.t, { displayMode: s.d, throwOnError: true, strict: false });
    } catch (e) {
      fail++;
      console.log("FAIL " + path.basename(f) + " #" + (i + 1) + ": " + String(e.message).split("\n")[0]);
      console.log("  TEX: " + s.t.replace(/\n/g, " ").slice(0, 120));
    }
  });
  grandTotal += samples.length; grandFail += fail;
  console.log(path.basename(f) + " | 公式 " + samples.length + " 条 | 失败 " + fail + " 条");
}
console.log("== 合计: " + grandTotal + " 条, 失败 " + grandFail + " 条 ==");
process.exit(grandFail ? 1 : 0);
