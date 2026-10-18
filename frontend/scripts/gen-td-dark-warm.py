#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
td-dark-warm.css 生成器（一次性 · 昼夜模式第一批）。

口径（docs/theme-light-pin.spec.md §3-3 的延伸）：
  * **键集不手抄**：从 `node_modules/@tdesign/uniapp/dist/theme.css` 的 dark 块解析全部
    `--td-*` 键，与 `src/styles/td-light-pin.css` 的键集取交后**以 light-pin 的 136 条为准**。
    为什么不是「只要 dark 块那 131 条」：light-pin 钉住了 136 条，夜间必须**逐条**翻回来，
    少翻一条（如 `--td-shadow-4` / `--td-switch-loading-color`，theme.css 的 dark 块里没有）
    那条就仍取喰色值 —— 深底上冒出一块浅色。故键集 = light-pin 全集，并在摘要里报出
    「dark 块 ∩」与「仅 light 块有」两段条数，依赖升级后若不等于 136 即报错退出。
  * **值不用 TDesign 蓝调**：本站在喰色（暖米 / 暖棕）族里工作，TDesign dark 块是蓝调语义色，
    直接吃会在「暖纸底」上出现冷色控件。故值全部由本文件的暖调角色表推导：
    底 / 卡面 / 主次文字 / placeholder / 边框 取固定暖调，brand 由 `#C98850` 起算的
    1–10 阶单调 ramp（L 单调递增，生成时断言）。
  * 只产颜色声明，**不含任何布局属性**（判据 T3 的前提）。

用法：
  python3 scripts/gen-td-dark-warm.py            # dry-run（默认）：只打印摘要 + 前若干行
  python3 scripts/gen-td-dark-warm.py --write     # 写入 src/styles/td-dark-warm.css
  python3 scripts/gen-td-dark-warm.py --diff      # 与磁盘现有文件逐行对比（改色后自查用）
"""

import argparse
import colorsys
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEME_CSS = ROOT / "node_modules/@tdesign/uniapp/dist/theme.css"
LIGHT_PIN = ROOT / "src/styles/td-light-pin.css"
TARGET = ROOT / "src/styles/td-dark-warm.css"

# ── 角色表（深青墨族 · 2026-10 换色）──────────────────────────────────────────
# 口径：与 frontend/scripts/remap-palette-2026-10.mjs 的夜间表逐值一致，
#      底 #1B2422 / 卡 #232E2B / 次 #1E2825 / 格 #2A3631 / 暖金 #D9A96B。
PAGE = "#1B2422"          # 页面底
CARD = "#232E2B"          # 卡面 / 容器
CARD_ACTIVE = "#2A3631"   # 卡面按下
SUBCARD = "#1E2825"       # 次级容器
SUB_ACTIVE = "#212B27"
COMP = "#2A3631"          # 组件底（输入框等）
COMP_ACTIVE = "#36453F"
COMP_DIS = "#212B27"
TEXT1 = "#DFE9E4"         # 主文字
TEXT2 = "#A5B6AE"         # 次文字
PLACEHOLDER = "#7A8B83"
TEXT_DIS = "#5F6E67"
BORDER1 = "#36453F"       # 边框 / 分割
BORDER2 = "#42524B"

BRAND_BASE = "#D9A96B"    # 暖金（与夜间表 #C98850→#D9A96B 同源）
WARNING_BASE = "#D9973F"
ERROR_BASE = "#D9705F"
SUCCESS_BASE = "#6FA96A"


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#" + "".join("%02x" % max(0, min(255, round(c))) for c in rgb)


def luminance(h):
    """WCAG 相对亮度（用于断言 ramp 单调）"""
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = hex_to_rgb(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


# 10 阶 L 剖面：第 7 阶 = 基色原值（TDesign 里 brand-color-7 就是「品牌主色」），
# 1–6 阶向下压（深色底上的浅淡底纹），8–10 阶向上提（hover / active）。
L_PROFILE = [0.17, 0.23, 0.29, 0.35, 0.42, 0.485, None, 0.66, 0.75, 0.84]


def ramp(base):
    """由基色推导 1–10 阶暖调 ramp：恒定色相/饱和度，L 按剖面单调递增，第 7 阶 = 基色。"""
    r, g, b = hex_to_rgb(base)
    h, _, _ = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    _, l7, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    s = min(0.72, max(0.28, s))
    out = []
    for i, l in enumerate(L_PROFILE):
        if l is None:
            out.append(base)
            continue
        rr, gg, bb = colorsys.hls_to_rgb(h, l, s)
        out.append(rgb_to_hex((rr * 255, gg * 255, bb * 255)))
    # 单调性断言（T 类判据的前提：1→10 必须逐阶变亮）
    lums = [luminance(c) for c in out]
    for i in range(9):
        if not lums[i] < lums[i + 1]:
            raise SystemExit("ramp 非单调：%s 第 %d→%d 阶" % (base, i + 1, i + 2))
    return out


BRAND = ramp(BRAND_BASE)
WARNING = ramp(WARNING_BASE)
ERROR = ramp(ERROR_BASE)
SUCCESS = ramp(SUCCESS_BASE)

# 青墨中性 14 阶（1 = 最亮 … 14 = 最暗；与 TDesign 的 gray-color 方向一致）
# 第 4/6/8/9/10/11/12/13/14 阶 = 夜间表的 次字/placeholder/禁用字/边框/强边框/格/次按下/卡/底；
# 其余（2/3/5/7）为同族插值，保证 1→14 单调变暗。
GRAY = [
    "#DFE9E4", "#D2DED8", "#C3D1CA", "#A5B6AE", "#93A59D",
    "#7A8B83", "#697A73", "#4C5A54", "#42524B", "#36453F",
    "#2A3631", "#212B27", "#232E2B", "#1B2422",
]


def roles():
    """键 → 值。每个键都必须在此命中，否则生成失败（不静默发明值）。"""
    m = {}

    # brand / primary（1–10 阶 ramp；primary 与 brand 同源，和 theme.css 一致）
    for i in range(1, 11):
        m["--td-brand-color-%d" % i] = BRAND[i - 1]
        m["--td-primary-color-%d" % i] = "var(--td-brand-color-%d)" % i
    for i in range(1, 11):
        m["--td-warning-color-%d" % i] = WARNING[i - 1]
        m["--td-error-color-%d" % i] = ERROR[i - 1]
        m["--td-success-color-%d" % i] = SUCCESS[i - 1]

    # 中性 14 阶 + 字体色
    for i in range(1, 15):
        m["--td-gray-color-%d" % i] = GRAY[i - 1]
    m["--td-font-white-1"] = "rgba(223, 233, 228, 0.92)"
    m["--td-font-white-2"] = "rgba(223, 233, 228, 0.55)"
    m["--td-font-white-3"] = "rgba(223, 233, 228, 0.35)"
    m["--td-font-white-4"] = "rgba(223, 233, 228, 0.22)"
    m["--td-font-gray-1"] = TEXT1
    m["--td-font-gray-2"] = TEXT2
    m["--td-font-gray-3"] = PLACEHOLDER
    m["--td-font-gray-4"] = TEXT_DIS

    # 语义主色 + 派生（派生一律引用 ramp 阶，不另发明颜色）
    m["--td-brand-color"] = "var(--td-brand-color-7)"
    m["--td-warning-color"] = "var(--td-warning-color-6)"
    m["--td-error-color"] = "var(--td-error-color-6)"
    m["--td-success-color"] = "var(--td-success-color-6)"
    m["--td-brand-color-focus"] = "var(--td-brand-color-8)"
    m["--td-brand-color-active"] = "var(--td-brand-color-9)"
    m["--td-brand-color-disabled"] = "var(--td-brand-color-4)"
    m["--td-brand-color-light"] = "var(--td-brand-color-2)"
    m["--td-brand-color-light-active"] = "var(--td-brand-color-3)"
    m["--td-warning-color-active"] = "var(--td-warning-color-8)"
    m["--td-warning-color-disabled"] = "var(--td-warning-color-4)"
    m["--td-warning-color-focus"] = "var(--td-warning-color-8)"
    m["--td-warning-color-light"] = "var(--td-warning-color-2)"
    m["--td-warning-color-light-active"] = "var(--td-warning-color-3)"
    m["--td-error-color-focus"] = "var(--td-error-color-8)"
    m["--td-error-color-active"] = "var(--td-error-color-9)"
    m["--td-error-color-disabled"] = "var(--td-error-color-4)"
    m["--td-error-color-light"] = "var(--td-error-color-2)"
    m["--td-error-color-light-active"] = "var(--td-error-color-3)"
    m["--td-success-color-focus"] = "var(--td-success-color-8)"
    m["--td-success-color-active"] = "var(--td-success-color-9)"
    m["--td-success-color-disabled"] = "var(--td-success-color-4)"
    m["--td-success-color-light"] = "var(--td-success-color-2)"
    m["--td-success-color-light-active"] = "var(--td-success-color-3)"

    # 遮罩
    m["--td-mask-active"] = "rgba(0, 0, 0, 60%)"
    m["--td-mask-disabled"] = "rgba(27, 36, 34, 60%)"
    m["--td-mask-background"] = "rgba(30, 40, 37, 96%)"

    # 底 / 容器 / 组件
    m["--td-bg-color-page"] = PAGE
    m["--td-bg-color-container"] = CARD
    m["--td-bg-color-container-active"] = CARD_ACTIVE
    m["--td-bg-color-secondarycontainer"] = SUBCARD
    m["--td-bg-color-secondarycontainer-active"] = SUB_ACTIVE
    m["--td-bg-color-component"] = COMP
    m["--td-bg-color-component-active"] = COMP_ACTIVE
    m["--td-bg-color-component-disabled"] = COMP_DIS
    m["--td-bg-color-secondarycomponent"] = SUBCARD
    m["--td-bg-color-secondarycomponent-active"] = SUB_ACTIVE
    m["--td-bg-color-specialcomponent"] = CARD

    # 文字
    m["--td-text-color-primary"] = TEXT1
    m["--td-text-color-secondary"] = TEXT2
    m["--td-text-color-placeholder"] = PLACEHOLDER
    m["--td-text-color-disabled"] = TEXT_DIS
    m["--td-text-color-anti"] = PAGE          # 压在暖棕实心上的字：取页面底色（深）而非白
    m["--td-text-color-brand"] = BRAND_BASE
    m["--td-text-color-link"] = BRAND[7]      # ramp 第 8 阶（比主色亮一档，链接可辨）

    # 边框 / 描边
    m["--td-border-level-1-color"] = BORDER1
    m["--td-component-stroke"] = BORDER1
    m["--td-border-level-2-color"] = BORDER2
    m["--td-component-border"] = BORDER2

    # 阴影（深色下用重一点的黑色，否则看不出层次）
    m["--td-shadow-1"] = ("0 4px 6px rgba(0, 0, 0, 35%), 0 1px 10px rgba(0, 0, 0, 30%), "
                          "0 2px 4px rgba(0, 0, 0, 40%)")
    m["--td-shadow-2"] = ("0 8px 10px rgba(0, 0, 0, 40%), 0 3px 14px rgba(0, 0, 0, 34%), "
                          "0 5px 5px rgba(0, 0, 0, 44%)")
    m["--td-shadow-3"] = ("0 16px 24px rgba(0, 0, 0, 44%), 0 6px 30px rgba(0, 0, 0, 38%), "
                          "0 8px 10px rgba(0, 0, 0, 48%)")
    m["--td-shadow-4"] = "0 2px 8px 0 rgba(0, 0, 0, 45%)"
    for side in ("top", "right", "bottom", "left"):
        m["--td-shadow-inset-%s" % side] = "inset 0 0.5px 0 %s" % BORDER2
    m["--td-shadow-inset-right"] = "inset 0.5px 0 0 %s" % BORDER2
    m["--td-shadow-inset-bottom"] = "inset 0 -0.5px 0 %s" % BORDER2
    m["--td-shadow-inset-left"] = "inset -0.5px 0 0 %s" % BORDER2
    m["--td-table-shadow-color"] = "rgba(0, 0, 0, 55%)"

    # 滚动条
    m["--td-scrollbar-color"] = "rgba(223, 233, 228, 15%)"
    m["--td-scrollbar-hover-color"] = "rgba(223, 233, 228, 30%)"
    m["--td-scroll-track-color"] = SUBCARD

    # 组件补丁（light 块里的三条，此处给深青墨族对偶）
    m["--td-picker-transparent-color"] = "rgba(35, 46, 43, 0)"
    m["--td-switch-dot-disabled-color"] = TEXT2
    m["--td-switch-loading-color"] = BRAND_BASE
    return m


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def block_after(css, marker):
    """取 marker 之后第一个 `@media (...) {` 块的块体（按花括号配平）。"""
    i = css.index(marker)
    j = css.index("{", i)
    depth = 0
    for k in range(j, len(css)):
        if css[k] == "{":
            depth += 1
        elif css[k] == "}":
            depth -= 1
            if depth == 0:
                return css[j + 1:k]
    raise SystemExit("未闭合的块：%s" % marker)


DECL = re.compile(r"^\s*(--td-[a-z0-9-]+)\s*:\s*(.+?);\s*$", re.M)


def keys_of(text):
    return [k for k, _ in DECL.findall(text)]


def build():
    if not THEME_CSS.exists():
        raise SystemExit("找不到 %s（先 npm i）" % THEME_CSS)
    theme = strip_comments(THEME_CSS.read_text(encoding="utf-8"))
    theme = theme.replace("/* #ifdef H5 */", "").replace("/* #endif */", "")
    # 注释剥离后 `/* ./raw/_dark.less */` 也没了 ⇒ 用文件里的分节顺序定位：
    # dark 主块是第一个 `@media (prefers-color-scheme: dark)`。
    dark_keys = keys_of(block_after(theme, "@media (prefers-color-scheme: dark)"))
    pin_keys = keys_of(strip_comments(LIGHT_PIN.read_text(encoding="utf-8")))

    if len(pin_keys) != 136:
        raise SystemExit("light-pin 键数异常：%d（期望 136，light-pin 被动过？）" % len(pin_keys))
    keys = pin_keys                       # 键集 = light-pin 全集（逐条翻回，不缺一条）
    shared = [k for k in keys if k in set(dark_keys)]
    light_only = [k for k in keys if k not in set(dark_keys)]

    role = roles()
    unmapped = [k for k in keys if k not in role]
    if unmapped:
        raise SystemExit("角色表缺 %d 条：%s" % (len(unmapped), unmapped))
    extra = [k for k in role if k not in set(keys)]
    if extra:
        raise SystemExit("角色表多出未在键集内的 %d 条：%s" % (len(extra), extra))

    lines = []
    get = lambda k: role[k]
    for k in keys:
        lines.append("    %s: %s;" % (k, get(k)))
    return keys, lines, (len(shared), light_only)


HEADER = """/*
 * 夜间模式（dark）暖调 token 表 — **自动生成，勿手改**。
 * 生成器：frontend/scripts/gen-td-dark-warm.py（`--write` 落盘，默认 dry-run）
 * 键集：td-light-pin.css 的 {n} 条 `--td-*`（light-pin 钉住哪些，夜间就逐条翻回哪些；
 *       其中 131 条在 @tdesign/uniapp/dist/theme.css 的 dark 块里也有，另 5 条只在 light 块）。
 *       值**不取** TDesign 蓝调，全部由生成器的青墨角色表推导（brand = {brand} 起算的
 *       1–10 阶单调 ramp，第 7 阶 = 主色）。
 *
 * 与 td-light-pin.css 的关系（顺序有意义）：
 *   · light-pin 继续在 `@media (prefers-color-scheme: dark)` 下把 token 钉回日间色 ⇒
 *     默认（无 data-theme / data-theme=light）下两种系统偏好都是日间观感，**行为不变**；
 *   · 本文件只在 `html[data-theme='dark']` 下生效，且选择器特异性更高 ⇒ 夜间覆盖。
 *     特异性对照（必须逐条压过，否则夜间不生效）：
 *       `:root:root`                        (0,2,0)  ← light-pin 的 html
 *       `html[data-theme='dark']:root`      (0,2,1)  ✓ 压过
 *       `uni-page-body:not(#jp-theme-pin)`  (1,0,1)  ← light-pin 的真实落点（spec §3-2）
 *       `html[data-theme='dark'] uni-page-body:not(#jp-theme-pin)` (1,1,2) ✓ 压过
 *       `.page.page`                        (0,2,0)
 *       `html[data-theme='dark'] .page.page` (0,3,1) ✓ 压过
 *   · **`uni-page-body` 这条不可省**：H5 里 theme.css 的 `page` 被编译成 `uni-page-body`，
 *     token 的实际翻转点在那里；只在 `:root` 上压压不到它（spec §3-2 的双向现证）。
 *   · `:not(#jp-theme-pin)` 只是把特异性抬到 (1,x,x) 的手法，不匹配任何元素。
 *
 * 引入位置：frontend/src/main.ts，**晚于** `@/styles/td-light-pin.css`。
 * 只写颜色声明，不含任何布局属性（几何判据 T3 的前提）。
 */
html[data-theme='dark']:root,
html[data-theme='dark'] page:not(#jp-theme-pin),
html[data-theme='dark'] uni-page-body:not(#jp-theme-pin),
html[data-theme='dark'] .page.page {{
"""


def render(keys, lines):
    body = "\n".join(lines)
    head = HEADER.format(n=len(keys), brand=BRAND_BASE)
    return head + body + "\n}\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="写入目标文件（默认 dry-run）")
    ap.add_argument("--diff", action="store_true", help="与磁盘现有文件对比")
    args = ap.parse_args()

    keys, lines, (n_shared, light_only) = build()
    css = render(keys, lines)

    print("键集 = %d 条 = td-light-pin 全集（其中 %d 条 theme.css dark 块也有，"
          "%d 条仅 light 块有：%s）" % (len(keys), n_shared, len(light_only), " ".join(light_only)))
    print("brand ramp 1–10 = %s" % " ".join(BRAND))
    print("warning       = %s" % " ".join(WARNING))
    print("error         = %s" % " ".join(ERROR))
    print("success       = %s" % " ".join(SUCCESS))
    print("产物行数 = %d，字节 = %d" % (css.count("\n"), len(css.encode("utf-8"))))

    if args.diff:
        old = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        ok = old == css
        print("与磁盘一致：%s" % ("是" if ok else "否（需 --write 同步）"))
        return 0 if ok else 1

    if not args.write:
        print("\n--- dry-run: 前 12 行 ---")
        print("\n".join(css.splitlines()[:12]))
        print("--- dry-run: 末 3 行 ---")
        print("\n".join(css.splitlines()[-3:]))
        print("\n（默认 dry-run，未落盘；加 --write 写入 %s）" % TARGET.relative_to(ROOT))
        return 0

    TARGET.write_text(css, encoding="utf-8")
    print("已写入 %s" % TARGET.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
