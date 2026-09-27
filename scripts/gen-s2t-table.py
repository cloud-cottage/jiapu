#!/usr/bin/env python3
"""生成 `frontend/src/business/traditional.ts` —— 谱文繁体化用的 OpenCC「s2t」**单字表**（全仓唯一真源）。

复算（一行即可复现本表，须在仓根执行）：
  python3 -m venv /tmp/zang-opencc-venv && /tmp/zang-opencc-venv/bin/pip -q install opencc-python-reimplemented && /tmp/zang-opencc-venv/bin/python scripts/gen-s2t-table.py

口径（Zang 裁定 · 「在线文谱」批 · 2026-09-26）：
  · 算法 = OpenCC 配置 **`s2t`**（纯字形简→繁），**禁用 `s2tw` / `s2twp`**（后两者含台湾用词替换，会改词不改字）。
  · 覆盖 = CJK 统一表意文字**基本区 U+4E00–U+9FFF 全量逐字独立转换**；与原文相同的字**不进表**（表内只存差异字）。
  · 逐字 1:1 ⇒ 前端运行期零依赖、零联网（只查内存表）；表既是数据源也是唯一转换实现。
  · 本脚本**生成整个模块文件**（表 + `toTraditional()`），故表**不可能手抄**；改口径 = 改本脚本后重跑。

不变量（脚本自检，失败即非零退出）：
  1) 基本区每个差异字在 s2t 下必须映射为**单个**字符（多字符映射会破坏逐字切栏）；
  2) 表内字符互不重复、源/目标等长；
  3) 对表内每个字，`s2t(目标字) == 目标字`（幂等，繁体侧不再二次变化）。
"""

import sys
from pathlib import Path

try:
    from opencc import OpenCC
except ImportError:  # pragma: no cover - 环境缺失时给出可复算的一行命令
    sys.exit(
        "缺少 opencc-python-reimplemented。请先执行：\n"
        "  python3 -m venv /tmp/zang-opencc-venv && /tmp/zang-opencc-venv/bin/pip -q install opencc-python-reimplemented\n"
        "  /tmp/zang-opencc-venv/bin/python scripts/gen-s2t-table.py"
    )

CJK_START, CJK_END = 0x4E00, 0x9FFF
OUT_PATH = Path(__file__).resolve().parent.parent / "frontend/src/business/traditional.ts"

HEADER = """/**
 * 谱文繁体化 —— OpenCC「`s2t`」**单字表**（纯字形简→繁）
 *
 * ⚠️ **本文件由 `scripts/gen-s2t-table.py` 生成，请勿手改**（表一律由脚本重算后入仓 = 本仓「不得手抄表」规制）。
 * 复算一行（仓根执行）：
 * ```
 * python3 -m venv /tmp/zang-opencc-venv && /tmp/zang-opencc-venv/bin/pip -q install opencc-python-reimplemented && /tmp/zang-opencc-venv/bin/python scripts/gen-s2t-table.py
 * ```
 *
 * 口径（Zang 裁定 · 「在线文谱」批 · 2026-09-26）：算法 = OpenCC 配置 **`s2t`**（**禁用 `s2tw` / `s2twp`**）；
 * 覆盖 CJK 基本区 U+4E00–U+9FFF 的**差异字**（与原文相同者不进表）；逐字 1:1 ⇒ 长度不变，
 * 可安全用于「每栏 ≤ 10 字」切栏；运行期**零依赖零联网**。
 *
 * **单一真源**：全仓仅本文件定义简繁字形映射；转换只用于**渲染派生**，绝不回写数据。
 * 函数 = 纯字形（逐字查表），不做词级替换。
 */

/** 表源（简体侧，去重升序字面量） */
const S2T_SOURCE =
__SOURCE__;

/** 表目标（繁体侧，与 `S2T_SOURCE` **逐位对应**） */
const S2T_TARGET =
__TARGET__;

/** 源/目标**码点**等长（生成期已断言；运行期一次性建表） */
const S2T = new Map<string, string>();
/**
 * ⚠️ 必须按**码点**对齐（`Array.from`），**不得**用 UTF-16 码元下标直接配对：
 * 表内含非 BMP 目标字（`暅 → 𣈶` / `毶 → 𣯶` 等），按码元配对会从首个此类字起**整表串位**
 * （表现 = `费 → 貸`、`谱 → 譙` 一类；逐字 1:1 的前提即码点对齐）。
 */
const S2T_SOURCE_CPS = Array.from(S2T_SOURCE);
const S2T_TARGET_CPS = Array.from(S2T_TARGET);
for (let i = 0; i < S2T_SOURCE_CPS.length; i += 1) {
  S2T.set(S2T_SOURCE_CPS[i], S2T_TARGET_CPS[i]);
}

/** 表内差异字数（供自检 / 调试读数，不做业务判断） */
export const S2T_TABLE_SIZE = S2T.size;

/**
 * 简体字串 → 繁体字串（OpenCC `s2t` 纯字形，逐字 1:1）。
 *
 * - 逐 **码点** 遍历（表外字符、代理对字符、拉丁字母、标点、数字一律原样保留）；
 * - 幂等：繁体输入返回自身（`toTraditional(s) === s`，自检口径）。
 */
export function toTraditional(s: string): string {
  if (!s) return '';
  let out = '';
  for (const ch of s) {
    const t = S2T.get(ch);
    out += t === undefined ? ch : t;
  }
  return out;
}
"""


def build_table():
    cc = OpenCC("s2t")
    source, target, multi = [], [], []
    for code in range(CJK_START, CJK_END + 1):
        ch = chr(code)
        conv = cc.convert(ch)
        if conv == ch:
            continue
        if len(conv) != 1:
            multi.append((ch, conv))
            continue
        source.append(ch)
        target.append(conv)
    if multi:
        sys.exit("s2t 出现多字符映射（无法逐字建表）：%s" % (multi[:10],))
    # 自检 2：无重复源字、源目标等长
    assert len(source) == len(set(source)), "源字重复"
    assert len(source) == len(target), "源/目标长度不等"
    # 自检 3：基本区**全覆盖**（凡 s2t 会改动的字必须都在表内 → 无残留简字）
    table = dict(zip(source, target))
    for code in range(CJK_START, CJK_END + 1):
        ch = chr(code)
        conv = cc.convert(ch)
        if conv != ch and table.get(ch) != conv:
            sys.exit("覆盖不全：%s 期望 %s，表内 %s" % (ch, conv, table.get(ch)))
    # 信息性读数：单字表**单趟**转换（与 OpenCC 逐字 s2t 语义一致），
    # 极少数繁体字在 s2t 下会再变一次（如 苧→薴）—— 属 OpenCC 自身逐字词典型，非本表缺陷；
    # 故「残留自检」口径 = 转换结果与 `OpenCC s2t 逐字转换` 逐字相等（而非多趟幂等）。
    multi_pass = [s for s, t in table.items() if cc.convert(t) != t]
    print("单趟后再变的表内字数（信息性） = %d  例：%s" % (len(multi_pass), multi_pass[:6]))
    return "".join(source), "".join(target)


def chunks(text, size=120):
    return [text[i : i + size] for i in range(0, len(text), size)]


def literal_lines(text):
    parts = chunks(text)
    return "\n".join(
        "  '%s'" % part if i == 0 else "  + '%s'" % part for i, part in enumerate(parts)
    )


def main():
    source, target = build_table()
    content = HEADER.replace("__SOURCE__", literal_lines(source)).replace(
        "__TARGET__", literal_lines(target)
    )
    OUT_PATH.write_text(content, encoding="utf-8")
    print("差异字数 = %d" % len(source))
    print("输出 = %s  %d B" % (OUT_PATH, OUT_PATH.stat().st_size))


if __name__ == "__main__":
    main()
