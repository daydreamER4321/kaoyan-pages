#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把考研 HTML 页面同步到独立部署仓库 kaoyan-pages。
只复制页面和它依赖的 _html_assets，绝不带 .md / state.md / 原始资料。
用法: python sync_pages.py
"""
import os, re, shutil, sys
from pathlib import Path

SRC = Path(r"C:\Users\18709\Documents\GitHub\hurricane_vault\考研")
DST = Path(r"C:\Users\18709\Documents\GitHub\kaoyan-pages")

# 需要整体搬运的 assets 目录（相对 SRC）
ASSET_DIRS = [
    r"02_数学分析\01_数分-考纲课本\_html_assets",
    r"03_高等代数\01_高代-考纲课本\_html_assets",
]
# 总入口（不依赖 assets）
ENTRY = r"00_AI\00_页面总入口.html"

def main():
    if not SRC.is_dir():
        sys.exit(f"源目录不存在: {SRC}")

    # 1. 收集所有引用 _html_assets 的页面
    pages = []
    for p in SRC.rglob("*.html"):
        rel = p.relative_to(SRC)
        if "Agent" in rel.parts:
            continue
        try:
            head = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "_html_assets" in head or rel.as_posix() == ENTRY.replace("\\", "/"):
            pages.append(rel)
    entry = Path(ENTRY)
    if entry.exists() and entry not in pages:
        pages.append(entry)
    pages = sorted(set(pages))

    # 2. 清空并重建目标（只清页面区，保留 .git 和脚本）
    for sub in ["00_AI", "02_数学分析", "03_高等代数"]:
        t = DST / sub
        if t.exists():
            shutil.rmtree(t)

    copied = 0
    for rel in pages:
        s = SRC / rel
        d = DST / rel
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, d)
        copied += 1

    for ad in ASSET_DIRS:
        s = SRC / ad
        d = DST / ad
        if s.is_dir():
            shutil.copytree(s, d)
        else:
            print(f"  ! assets 缺失: {ad}")

    # 真题 PDF：从 00_AI/00_真题库.html 的数据抽路径，复制到 00_AI/_zhenti/（安全文件名）
    import json
    zt_page = SRC / "00_AI" / "00_真题库.html"
    pdf_copied = 0
    if zt_page.exists():
        zh = zt_page.read_text(encoding="utf-8", errors="ignore")
        mm = re.search(r'<script id="zt-data" type="application/json">(.*?)</script>', zh, re.S)
        if mm:
            rows = json.loads(mm.group(1).replace("<\\/", "</"))
            seen = set()
            for row in rows:
                key = (row.get("subject"), row.get("year"))
                for kind in ("test", "ans"):
                    ref = row.get(kind)
                    if not ref or (key, kind) in seen:
                        continue
                    seen.add((key, kind))
                    srcf = (zt_page.parent / ref).resolve()
                    if not srcf.exists():
                        print(f"  ! 真题缺失: {ref}")
                        continue
                    out = DST / "00_AI" / "_zhenti" / f"{key[0]}-{key[1]}-{kind}.pdf"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(srcf, out)
                    pdf_copied += 1
    print(f"真题 PDF {pdf_copied} 个已复制")

    print(f"页面 {copied} 个已复制到 {DST}")

    # 3. 校验：每个页面的 assets 引用在目标里都能解析
    missing = []
    for rel in pages:
        page = DST / rel
        html = page.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r'(?:href|src)="([^"]*_html_assets[^"]*)"', html):
            ref = m.group(1).split("?")[0].split("#")[0]
            target = (page.parent / ref).resolve()
            if not target.exists():
                missing.append(f"{rel} -> {ref}")

    # 4. 校验：页面之间的相对链接
    broken = []
    for rel in pages:
        page = DST / rel
        html = page.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r'href="([^"#?]*\.html)"', html):
            ref = m.group(1)
            if ref.startswith(("http://", "https://")):
                continue
            target = (page.parent / ref).resolve()
            if not target.exists():
                broken.append(f"{rel} -> {ref}")

    print(f"assets 断链: {len(missing)}")
    for x in missing[:10]:
        print("   ", x)
    print(f"页面互链断链: {len(broken)}")
    for x in broken[:10]:
        print("   ", x)

    total = sum(f.stat().st_size for f in DST.rglob("*") if f.is_file() and ".git" not in f.parts)
    print(f"部署目录总大小: {total/1024/1024:.2f} MB")
    return 0 if not missing and not broken else 1

if __name__ == "__main__":
    sys.exit(main())
