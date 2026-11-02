# 考研页面（手机阅读版）

数分、高代考纲课本的 HTML 讲解页，只读镜像。源文件在本地 vault：

```
C:\Users\18709\Documents\GitHub\hurricane_vault\考研\
```

## 入口

`00_AI/00_页面总入口.html`

## 更新方式

在 vault 里改完页面后，运行：

```bash
python C:\Users\18709\Documents\GitHub\kaoyan-pages\sync_pages.py
cd C:\Users\18709\Documents\GitHub\kaoyan-pages
git add -A && git commit -m "sync pages" && git push
```

`sync_pages.py` 只复制 `.html` 和 `_html_assets`，不会带上 `.md`、`state.md` 或原始教材。

## 注意

- 批注存在浏览器 localStorage，按 `location.pathname` 分键。电脑和手机各一套，互不同步；跨设备只能靠页面上的「导出 JSON / 导入 JSON」。
- 本仓库内容公开。
