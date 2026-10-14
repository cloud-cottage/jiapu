#!/usr/bin/env python3
"""按「主包 = subPackages roots 之外的全部文件（含 static）」口径求和小程序主包字节。

用法: python3 scripts/mainpkg_bytes.py [dist/build/mp-weixin]
"""
import json
import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "dist/build/mp-weixin"
app_json = os.path.join(root, "app.json")

with open(app_json, encoding="utf-8") as f:
    app = json.load(f)

subs = app.get("subPackages") or app.get("subpackages") or []
roots = [s["root"].strip("/") for s in subs if s.get("root")]

total = 0
sub_total = 0
per_root = {}
files = 0
for dirpath, _dirnames, filenames in os.walk(root):
    rel = os.path.relpath(dirpath, root)
    rel = "" if rel == "." else rel.replace(os.sep, "/")
    for name in filenames:
        p = os.path.join(dirpath, name)
        size = os.path.getsize(p)
        relpath = f"{rel}/{name}" if rel else name
        in_sub = None
        for r in roots:
            if relpath == r or relpath.startswith(r + "/"):
                in_sub = r
                break
        if in_sub:
            sub_total += size
            per_root[in_sub] = per_root.get(in_sub, 0) + size
        else:
            total += size
            files += 1

print(json.dumps({
    "root": root,
    "subpackage_roots": roots,
    "main_package_bytes": total,
    "main_package_files": files,
    "main_package_MiB": round(total / 1024 / 1024, 6),
    "over_2MiB_by": total - 2097152,
    "over_2MiB_by_20KB_margin_target": total - (2097152 - 20480),
    "subpackages_bytes": sub_total,
    "per_subpackage": per_root,
}, ensure_ascii=False, indent=1))
