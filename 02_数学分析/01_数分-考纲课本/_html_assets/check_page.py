#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""考研数分 HTML 讲解页自检脚本
用法: python check_page.py <HTML文件路径>
检查: 标签配对 / 公式定界符配对 / 相对资源存在 / class 是否在 guide.css 定义
"""
import re, sys, pathlib

def main():
    fp = pathlib.Path(sys.argv[1]).resolve()
    html = fp.read_text(encoding="utf-8")
    issues = []
    print(f"文件: {fp.name}")
    print(f"大小: {fp.stat().st_size} 字节 / {len(html)} 字符, {html.count(chr(10))+1} 行")

    # 1. 标签配对（常见块级/行内标签）
    for tag in ["div","section","details","ul","ol","li","table","tr","td","th","aside","main",
                "header","nav","span","p","label","h1","h2","h3","h4","formula","summary"]:
        opens = len(re.findall(rf"<{tag}(?:\s|>)", html))
        closes = len(re.findall(rf"</{tag}>", html))
        if opens != closes:
            issues.append(f"<{tag}> 不平衡: open={opens} close={closes}")

    # 2. $$ 与 $ 配对
    dd = len(re.findall(r"\$\$", html))
    if dd % 2 != 0:
        issues.append(f"$$ 数量为奇数: {dd}")
    single = len(re.findall(r"(?<!\$)\$(?!\$)", html))
    if single % 2 != 0:
        issues.append(f"单 $ 数量为奇数: {single}")

    # 3. 相对资源引用存在性
    for m in re.finditer(r'(?:href|src)="(\.\./[^"]+)"', html):
        rel = m.group(1)
        target = (fp.parent / rel).resolve()
        if not target.exists():
            issues.append(f"资源缺失: {rel}")

    # 4. class 定义检查
    css_path = fp.parent.parent / "_html_assets" / "guide.css"
    if css_path.exists():
        css = css_path.read_text(encoding="utf-8")
        used = set()
        for m in re.finditer(r'class="([^"]+)"', html):
            used.update(m.group(1).split())
        undef = sorted(c for c in used if f".{c}" not in css and c != "no-math")
        if undef:
            issues.append(f"CSS 未定义的 class: {undef}")
    else:
        issues.append(f"找不到 guide.css: {css_path}")

    # 5. 占位符残留
    for ph in ["@@MORE@@", "@@PART", "TODO", "FIXME"]:
        if ph in html:
            issues.append(f"残留占位符: {ph}")

    # 6. 关键结构存在性
    for key in ['<aside class="sidebar">', 'class="hero"', 'id="checklist"', 'guide.js', 'katex.min.js']:
        if key not in html:
            issues.append(f"缺少关键结构: {key}")

    if issues:
        print("\n发现问题:")
        for i in issues:
            print("  -", i)
        sys.exit(1)
    else:
        print("全部检查通过 ✓")

if __name__ == "__main__":
    main()
