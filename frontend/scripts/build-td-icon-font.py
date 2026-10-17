#!/usr/bin/env python3
"""生成 TDesign 图标字体子集（本地化，替代 tdesign.gtimg.com 外链）。

用途
----
`@tdesign/uniapp/dist/icon/icon.css` 的 @font-face 指向
https://tdesign.gtimg.com/icon/0.4.3/fonts/t.woff（279,216 B）。本项目按
`frontend/td-icon-keep.json` 只保留十几个图标规则，故把字体也裁成只含这些字形
（几 KB），落到 `src/static/fonts/`，构建期由 vite.config.ts 的插件把 @font-face
改成本地相对路径。

用法
----
    python3 frontend/scripts/build-td-icon-font.py            # 从 CDN 下载 t.woff 再裁剪
    python3 frontend/scripts/build-td-icon-font.py --font-src /path/to/t.woff

依赖：fonttools + brotli（`python3 -m pip install --user fonttools brotli`）。
仅在此脚本里需要，构建本身不依赖 python。

何时重跑：改动 `td-icon-keep.json` 之后。若忘记重跑，H5 构建会在日志里打印
「字体缺字形」告警（vite.config.ts 比对 td-icon-subset.json 清单）。
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FE_ROOT = os.path.dirname(HERE)
REPO_ROOT = os.path.dirname(FE_ROOT)

KEEP_JSON = os.path.join(FE_ROOT, "td-icon-keep.json")
ICON_CSS = os.path.join(FE_ROOT, "node_modules/@tdesign/uniapp/dist/icon/icon.css")
FONT_URL = "https://tdesign.gtimg.com/icon/0.4.3/fonts/t.woff"
OUT_DIR = os.path.join(FE_ROOT, "src/static/fonts")
OUT_WOFF = os.path.join(OUT_DIR, "tdesign-icon-subset.woff")
OUT_WOFF2 = os.path.join(OUT_DIR, "tdesign-icon-subset.woff2")
OUT_MANIFEST = os.path.join(OUT_DIR, "tdesign-icon-subset.json")


def parse_codepoints():
    """从 icon.css 抽出 name -> codepoint（'\\E1D8' 形式）。"""
    css = open(ICON_CSS, encoding="utf-8").read()
    table = {}
    for name, code in re.findall(
        r"\.t-icon-([a-z0-9][a-z0-9-]*):before\s*\{\s*content:\s*'([^']*)'", css
    ):
        m = re.match(r"^\\([0-9A-Fa-f]{2,6})$", code.strip())
        if m:
            table[name] = int(m.group(1), 16)
    return table


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font-src", help="本地 t.woff 路径（缺省从 CDN 下载）")
    args = ap.parse_args()

    keep = json.load(open(KEEP_JSON, encoding="utf-8"))["icons"]
    table = parse_codepoints()
    missing = [n for n in keep if n not in table]
    if missing:
        sys.exit(f"[icon-subset] 白名单里这些图标在 icon.css 中找不到：{missing}")

    codes = {n: table[n] for n in keep}

    if args.font_src:
        src_font = args.font_src
        tmp = None
    else:
        print(f"[icon-subset] 下载 {FONT_URL}")
        fd, tmp = tempfile.mkstemp(suffix=".woff")
        os.close(fd)
        urllib.request.urlretrieve(FONT_URL, tmp)
        src_font = tmp

    os.makedirs(OUT_DIR, exist_ok=True)
    from fontTools import subset

    for flavor, out in (("woff", OUT_WOFF), ("woff2", OUT_WOFF2)):
        o = subset.Options()
        o.flavor = flavor
        o.desubroutinize = True
        o.layout_features = []
        o.name_IDs = ["*"]
        font = subset.load_font(src_font, o)
        s = subset.Subsetter(options=o)
        s.populate(unicodes=sorted(codes.values()))
        s.subset(font)
        subset.save_font(font, out, o)
        print(f"[icon-subset] {os.path.relpath(out, REPO_ROOT)}  {os.path.getsize(out)} B")

    json.dump(
        {
            "_comment": "由 scripts/build-td-icon-font.py 生成，勿手改。build 期用它校验字体是否缺字形。",
            "source": FONT_URL,
            "icons": {k: f"U+{v:04X}" for k, v in sorted(codes.items())},
        },
        open(OUT_MANIFEST, "w", encoding="utf-8"),
        ensure_ascii=False,
        indent=2,
    )
    print(f"[icon-subset] 字形 {len(codes)} 个；woff {os.path.getsize(OUT_WOFF)} B / "
          f"woff2 {os.path.getsize(OUT_WOFF2)} B")


if __name__ == "__main__":
    main()
