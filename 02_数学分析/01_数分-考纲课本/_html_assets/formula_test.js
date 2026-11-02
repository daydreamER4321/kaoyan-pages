// 全量公式渲染测试：抽取 HTML 中所有 $...$ / $$...$$ 公式并逐条渲染
// 用法: node formula_test.js <HTML文件路径>
const fs = require('fs');
const katexPath = 'C:/Users/18709/Documents/GitHub/hurricane_vault/考研/02_数学分析/01_数分-考纲课本/_html_assets/katex/katex.min.js';
const katex = require(katexPath);

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');

// 提取 $$...$$（优先）和 $...$，保持顺序
const formulas = [];
let rest = html;
// 先把 $$...$$ 找出来（跨行也支持）
const ddRe = /\$\$([\s\S]+?)\$\$/g;
let m;
const ddSpans = [];
while ((m = ddRe.exec(html)) !== null) {
  ddSpans.push([m.index, m.index + m[0].length]);
  formulas.push({ display: true, tex: m[1] });
}
// 再找单 $...$（排除已属 $$ 区域的）
const oneRe = /(?<!\$)\$(?!\$)([\s\S]+?)(?<!\$)\$(?!\$)/g;
let s;
const oneSpans = [];
while ((s = oneRe.exec(html)) !== null) {
  const pos = s.index;
  const inDD = ddSpans.some(([a, b]) => pos >= a && pos < b);
  if (!inDD) {
    formulas.push({ display: false, tex: s[1] });
  }
}

let fail = 0, idx = 0;
for (const f of formulas) {
  idx++;
  try {
    katex.renderToString(f.tex, { displayMode: f.display, throwOnError: true, strict: false });
  } catch (e) {
    fail++;
    console.log(`FAIL #${idx} (${f.display ? 'display' : 'inline'}): ${e.message}`);
    console.log(`  TEX: ${f.tex.slice(0, 120).replace(/\n/g, ' ')}`);
  }
}
console.log(`共 ${formulas.length} 条公式, 失败 ${fail} 条`);
process.exit(fail ? 1 : 0);
