#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部署前静态检查：
1. 每个引用的大小写是否与磁盘完全一致（Linux/Pages 区分大小写）
2. 文件名是否含 URL 不友好字符
3. 空文件 / 极小文件
"""
import re, sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(r"C:\Users\18709\Documents\GitHub\kaoyan-pages")
pages = [p for p in ROOT.rglob("*.html") if ".git" not in p.parts]

def exact_match(base: Path, ref: str):
    """按路径逐段验证大小写"""
    ref = unquote(ref.split("?")[0].split("#")[0])
    cur = base
    for part in Path(ref).parts:
        if part in ("..", "."):
            cur = (cur / part).resolve()
            continue
        try:
            names = [n.name for n in cur.iterdir()]
        except Exception:
            return False, f"目录不存在: {cur}"
        if part in names:
            cur = cur / part
        else:
            # 大小写不一致的候选
            low = [n for n in names if n.lower() == part.lower()]
            if low:
                return False, f"大小写不符: 引用 '{part}' 实际 '{low[0]}'"
            return False, f"不存在: {part}"
    return True, ""

bad_case, bad_chars, tiny = [], [], []
for page in pages:
    rel = page.relative_to(ROOT)
    html = page.read_text(encoding="utf-8", errors="ignore")
    for m in re.finditer(r'(?:href|src)="([^"]+)"', html):
        ref = m.group(1)
        if ref.startswith(("http://", "https://", "mailto:", "data:", "#", "javascript:")):
            continue
        if not ref.strip():
            continue
        ok, why = exact_match(page.parent, ref)
        if not ok:
            bad_case.append(f"{rel.as_posix()}  ->  {ref}  [{why}]")

print(f"页面数: {len(pages)}")
print(f"大小写/存在性错误: {len(bad_case)}")
for x in bad_case[:20]:
    print("  ", x)

# 文件名 URL 友好性
for p in ROOT.rglob("*"):
    if p.is_file() and ".git" not in p.parts:
        name = p.name
        if re.search(r'[#?%&+ ]', name):
            bad_chars.append(p.relative_to(ROOT).as_posix())
        if p.stat().st_size < 100 and p.suffix in (".js", ".css", ".html"):
            tiny.append(f"{p.relative_to(ROOT).as_posix()} ({p.stat().st_size}B)")

print(f"URL 不友好文件名: {len(bad_chars)}")
for x in bad_chars[:10]:
    print("  ", x)
print(f"异常小文件: {len(tiny)}")
for x in tiny[:10]:
    print("  ", x)

sys.exit(0 if not bad_case and not bad_chars and not tiny else 1)
