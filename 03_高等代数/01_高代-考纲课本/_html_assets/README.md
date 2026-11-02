# HTML 讲解页共用资源

这个目录存放 `01_高代-考纲课本/` 各章 `06_*_HTML讲解.html` 页面共用的前端资源。

- `katex/`：KaTeX 0.19.0 本地副本（css + js + 20 个 woff2 字体，合计约 610 KB），
  供各讲解页离线渲染数学公式，不依赖网络 CDN。
- `verify_katex.js`：全量公式校验脚本。用法 `node verify_katex.js`（默认校验高代第 8/9/10 章
  三份讲解页），也可传入任意 HTML 路径；失败时退出码为 1。
- 各讲解页通过相对路径 `../_html_assets/katex/...` 引用。
- 如日后升级 KaTeX，整体替换 `katex/` 目录并同步 `VERSION.txt` 即可；
  注意保持文件名结构 `katex.min.css` / `katex.min.js` / `auto-render.min.js` / `fonts/*.woff2` 不变。

生成：Hermes，2026-10-13。
