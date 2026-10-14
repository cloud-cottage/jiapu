#!/usr/bin/env python3
"""生成 `frontend/src/business/lunar.ts` —— 谱文用**紧凑农历表（1–2100）** + 公历→农历文本（干支 · 月名 · 日名）。

复算（一行即可复现本表；**自包含**，不依赖任何既有 venv；**单一源 = sxtwl**）：
  /usr/bin/python3 -m venv /tmp/sxtwl-venv && /tmp/sxtwl-venv/bin/pip -q install sxtwl \\
    && /tmp/sxtwl-venv/bin/python scripts/gen-lunar-table.py

口径（Kevin 2026-10-13 拍定）：
  · 范围 = **农历 1–2100**（**全套月表**；主包体积 +约 7.5 KB 已拍定：2100 年 × 4 字符 = 8400 字符）。
  · **单一源 = `sxtwl`（寿星天文历）**：**整张表都用它生成**（含 1900–2100）⇒ 1900 边界不会两套算法打架。
  · **1900 以前 = 推算值**（寿星历的天文推算，非历代颁行历书的实测值）—— 本表统一称「推算值」。
  · 输出格式：完整日期 → `<干支><月名><日名>`（如 `1957-12-04` → `丁酉十月十三`）；只有年月 → `<干支><月名>`；
    只有年 → `<干支>年`。**干支取「农历年」**（跨春节前的日期属上一年，如 2006-01-01 → 乙酉）。
  · 月名 = 正/二/…/腊 + 「月」，闰月加前缀「闰」；日名 = 初一…三十。**均为固定字面，不随源派生**（与上一版逐字相同）。
    **本表由脚本生成，不得手抄。**
  · 体积 = 模块 ≤ 16KB（**Zang 补裁 2026-10-13：预算由 8KB 放宽到 16KB**，因范围 1900→1 使表 +8400 字符；
    真约束 = **不得引 lunar-javascript 这类 512KB 级依赖**）。

`sxtwl` 的两处坑（本脚本已绕开；TS 端因此与生成器同口径）：
  ① **历法分界**：`sxtwl` 的 `(Y,M,D)` 在 **1582-10-15 之前是儒略历**、之后是格里历（实测 `toJD`/`JD2DD` 同约定、
     逐日往返 1:1）。本脚本以 **JD（儒略日）** 为**唯一时间轴**，再把「初一」的 JD 换算成
     **1970-01-01 起算的日序**（= 前端 `Date.parse(...)/86400000` 的日序）写入 TS ⇒ 两端口径一致；
     TS 端 `BASE` 因此是**字面量**而非 `Date.UTC(...)`（`Date.UTC(1,…)` 会把 0–99 年映射到 1900+）。
  ② **上古年标签自相矛盾**：`sxtwl` 的 `lunarDay` 在 1–2100 全域正常（逐日单调），但其
     **`lunarYear` / `lunarMonth` 标签**在 **19 个上古年**自相矛盾（诊断：8 / 23 / 236 / 237 / 239 / 689–700 / 761 / 762）
     —— 与自检 3 的「重建后逐日比不上的 19 年」（8 / 23 / 236–239 / 689–699 / 761–762，共 1803 天）**同量级、非同一集合**；
     症状 = 月序跳成 51、月长 197/202 天、缺十二月…。故月界一律取 **「初一」（朔）事件**，
     年与闰按 12/13 个月规则重建（优先吸附 `sxtwl` 自洽的次年正月标签）。
     **自检 3 的判据即「不一致的年 == 这 19 年」（逐日比，不外溢）** —— 其余 **2081 年逐日与 `sxtwl` 标签 0 差**。

表编码（17 bit / 农历年，base36 四位）：低 4 位 = 闰月月序（0 = 无闰月）；bit4–15 = 正月…腊月（置位 = 30 天）；
bit16 = 闰月 30 天。

脚本自检（失败即非零退出）：
  1) 裁定锚点 5 条逐字断言（1957-12-04 / 2024-03-19 / 2019-08-17 / 2006-01-01 / 1990-06-15）；
  2) 干支公式 `(农历年 - 4) mod 60` × `sxtwl` 年干支（取各年六月初一，已过立春）全 1–2100 **0 差**；
  3) 用本脚本内的**解码镜像**（与 TS 端同算法）反解生成的表，对 `sxtwl` **逐日**比对：
     不一致的年 **恰为** 上述 19 个上古年（其余 0 差），且**每一年**的月长 / 总日与「朔」间隔自洽。
"""

import sys

try:
    import sxtwl
except ImportError:  # pragma: no cover
    sys.exit(
        "缺少 sxtwl。请先执行：\n"
        "  /usr/bin/python3 -m venv /tmp/sxtwl-venv && /tmp/sxtwl-venv/bin/pip -q install sxtwl\n"
        "  /tmp/sxtwl-venv/bin/python scripts/gen-lunar-table.py"
    )

from datetime import date
from pathlib import Path

OUT_PATH = Path(__file__).resolve().parent.parent / "frontend/src/business/lunar.ts"

FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR = 1, 2100
GAN, ZHI = "甲乙丙丁戊己庚辛壬癸", "子丑寅卯辰巳午未申酉戌亥"
# JD 2440587.5 = 1970-01-01 00:00 UT ⇒ **1970-01-01 正午的 JD = 2440588**；
# 本脚本统一用「整数 JD = 当日正午」，故 JS 日序 = 整数 JD − 2440588（= `Date.parse(iso + 'T00:00:00Z') / 86400000`）
JD_EPOCH_JS = 2440588

# 裁定锚点（Zang 给定，逐字断言；公历 ISO → 期望谱文文本）
ANCHORS = [
    ("1957-12-04", "丁酉十月十三"),
    ("2024-03-19", "甲辰二月初十"),
    ("2019-08-17", "己亥七月十七"),
    ("2006-01-01", "乙酉腊月初二"),
    ("1990-06-15", "庚午五月廿三"),
]


def ganzhi(lunar_year: int) -> str:
    idx = (lunar_year - 4) % 60
    return GAN[idx % 10] + ZHI[idx % 12]


def jd_of_calendar(y: int, m: int, d: int) -> int:
    """sxtwl **自身历法**下的 (Y,M,D) → JD（整数 JD = 该日正午）。"""
    return int(round(sxtwl.toJD(sxtwl.Time(y, m, d, 0, 0, 0))))


def label_at(jd: int):
    """JD → (lunarYear, lunarMonth, lunarDay, isLeap)（sxtwl 原生标签）。"""
    t = sxtwl.JD2DD(jd)
    x = sxtwl.fromSolar(t.Y, t.M, t.D)
    return (x.getLunarYear(), x.getLunarMonth(), x.getLunarDay(), bool(x.isLunarLeap()))


def pack_label(lab) -> int:
    """标签压成单个整数（77 万天的标签表用字典存元组会白吃内存）。"""
    y, m, d, lp = lab
    return ((y * 100 + m) * 100 + d) * 2 + (1 if lp else 0)


def unpack_label(v: int):
    lp = bool(v & 1)
    v >>= 1
    d = v % 100
    v //= 100
    m = v % 100
    v //= 100
    return (v, m, d, lp)


def walk():
    """沿 JD 逐日扫全 1–2100：返回 (首个「农历 1-1-1」的 JD, 表尾哨兵 JD, 逐日标签表, 朔日 JD 序列)。

    哨兵 = **农历 2101 正月初一**（不在表内，只用来给 2100 年最后一月量长）。
    """
    jd = jd_of_calendar(1, 1, 1)
    labels, moons = {}, []
    start, end = None, None
    while True:
        lab = label_at(jd)
        if start is None:
            if lab == (FIRST_LUNAR_YEAR, 1, 1, False):
                start = jd
            else:
                jd += 1
                continue
        if lab[0] > LAST_LUNAR_YEAR:
            if lab[2] == 1:
                end = jd
                break
            jd += 1
            continue
        labels[jd] = pack_label(lab)
        if lab[2] == 1:
            moons.append(jd)
        jd += 1
    return start, end, labels, moons


def repair_moons(moons, is_newyear):
    """修正 sxtwl 朔序列里的**非法间隔**（全 1–2100 仅 1 处：236-12-1 → 237-1-1 只隔 28 天）。

    真实朔间隔只能是 29/30 天。修法 = 把出事的朔**挪 1 天**（28 → 29 / 31 → 30），
    且**只挪非「正月朔」**、并校验相邻两格仍合法 ⇒ 年界不动、**不产生跨年漂移**。
    """
    fixed = list(moons)
    for i in range(1, len(fixed)):
        g = fixed[i] - fixed[i - 1]
        if g in (29, 30):
            continue
        delta = 1 if g == 28 else -1
        for k, d in [(i - 1, -delta), (i, delta)]:
            if is_newyear(fixed[k]):
                continue
            if k - 1 >= 1 and (fixed[k] + d) - fixed[k - 1] not in (29, 30):
                continue
            if k + 1 < len(fixed) and fixed[k + 1] - (fixed[k] + d) not in (29, 30):
                continue
            fixed[k] += d
            break
        else:  # pragma: no cover
            sys.exit("朔序列修正失败：间隔 %d 天 @ jd=%d" % (g, fixed[i]))
    return fixed


def sxtwl_native_years(labels, moons, tail):
    """**照 sxtwl 标签原样**分组：{年: [(月序, 是否闰, 月长), ...]}（不修正）—— 仅用于诊断打印。"""
    years, prev = {}, None
    cur = None
    for jd in moons + [tail]:
        y, m, _d, lp = unpack_label(labels[jd]) if jd != tail else (LAST_LUNAR_YEAR + 1, 1, False, False)
        key = (y, m, lp)
        if key != prev:
            if cur is not None:
                cur[3] = jd - cur[2]
                years.setdefault(cur[0][0], []).append((cur[0][1], cur[0][2], cur[3]))
            cur = [key, jd, jd, 0]
            prev = key
    return years


def is_wellformed(seq):
    """sxtwl 标签自洽？非闰月序须恰为 1..12；至多一个闰月；月长 29/30；12 或 13 个月。"""
    base = [m for m, lp, _ in seq if not lp]
    leaps = [(m, n) for m, lp, n in seq if lp]
    if base != list(range(1, 13)) or len(leaps) > 1 or len(seq) not in (12, 13):
        return False
    if any(m < 1 or m > 12 for m, _ in leaps):
        return False
    return all(n in (29, 30) for _, _, n in seq)


def build_years(labels, moons, tail):
    """重建 12/13 个月的口袋表 {年: dict(seq, lens, start)}。

    月界**只**取「初一」事件（朔）；月数取 12 或 13，优先吸附 sxtwl 自洽的**次年正月**标签
    （标签自洽的年上吸附结果与原标签逐字相同；19 个自相矛盾的上古年则按规则重建）。
    `tail` = 表尾哨兵朔（农历 2101 正月初一），只用于给 2100 年最后一月量长。
    """
    all_moons = moons + [tail]
    idx_of = {jd: i for i, jd in enumerate(all_moons)}
    newyear = {}
    for jd in moons:
        y, m, _, lp = unpack_label(labels[jd])
        if m == 1 and not lp and y not in newyear:
            newyear[y] = jd

    years, i = {}, idx_of[all_moons[0]]
    for y in range(FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR + 1):
        run = int(sxtwl.getRunMonth(y) or 0)
        k = 13 if run else 12
        cand = idx_of.get(newyear.get(y + 1))
        if cand is not None and i < cand <= i + 16 and (cand - i) in (12, 13):
            k = cand - i
        # 闰位：**优先取标签里重复的月序**（`getRunMonth` 在上古年会与 sxtwl 自己的日标签打架，如 10 年），
        # 标签不可用（月序越界 / 月份集合不全）时退回 `getRunMonth`，再退回「闰六月」。
        leap = 0
        if k == 13:
            label_months = [unpack_label(labels[all_moons[i + j]])[1] for j in range(k)]
            dup = {}
            for m in label_months:
                dup[m] = dup.get(m, 0) + 1
            cands = sorted(m for m, c in dup.items() if c > 1 and 1 <= m <= 12)
            if len(cands) == 1 and sorted(set(label_months)) == list(range(1, 13)):
                leap = cands[0]
            elif 1 <= run <= 12:
                leap = run
            else:
                leap = 6
        seq = []
        for m in range(1, 13):
            seq.append((m, False, 0))
            if leap == m:
                seq.append((m, True, 0))
        assert len(seq) == k, "农历 %d 月数 %d ≠ 朔格数 %d" % (y, len(seq), k)
        lens = [all_moons[i + j + 1] - all_moons[i + j] for j in range(len(seq))]
        if any(n not in (29, 30) for n in lens):  # pragma: no cover
            sys.exit("农历 %d 年出现非 29/30 天的月：%s" % (y, lens))
        years[y] = {
            "seq": [(m, lp) for m, lp, _ in seq],
            "lens": lens,
            "start": all_moons[i],
        }
        i += len(seq)
    return years


def year_days(info: int) -> int:
    total = sum(30 if (info & (0x10000 >> m)) else 29 for m in range(1, 13))
    if info & 0xF:
        total += 30 if (info & 0x10000) else 29
    return total


def build_info(years):
    infos, base = {}, years[FIRST_LUNAR_YEAR]["start"]
    cum = base
    for y in range(FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR + 1):
        seq, lens = years[y]["seq"], years[y]["lens"]
        if len(lens) not in (12, 13):  # pragma: no cover
            sys.exit("农历 %d 月数异常 = %d" % (y, len(lens)))
        info, leap = 0, 0
        for (m, lp), n in zip(seq, lens):
            if lp:
                leap = m
                if n == 30:
                    info |= 0x10000
            elif n == 30:
                info |= 0x10000 >> m
        if leap and not any(m == leap and lp for m, lp in seq):  # pragma: no cover
            sys.exit("农历 %d 闰月标记异常" % y)
        infos[y] = info | leap
        if years[y]["start"] != cum:  # pragma: no cover
            sys.exit("农历 %d 年起点与逐日累计不符（时间轴漂移）" % y)
        cum += year_days(infos[y])
    return infos, base


def decode(info: int, offset: int):
    """解码镜像（与 TS 端同算法）→ (month, day, is_leap)。"""
    leap_month = info & 0xF
    leap_days = (30 if (info & 0x10000) else 29) if leap_month else 0

    def month_days(m):
        return 30 if (info & (0x10000 >> m)) else 29

    m, is_leap = 1, False
    while True:
        length = leap_days if is_leap else month_days(m)
        if offset < length:
            return (m, offset + 1, is_leap)
        offset -= length
        if not is_leap and m == leap_month:
            is_leap = True
        else:
            is_leap = False
            m += 1


def decode_solar(infos, base, d: date):
    """公历（**前推格里历**）date → 农历四元组；表外 → None。"""
    off = (d.toordinal() - 719163) - (base - JD_EPOCH_JS)
    if off < 0:
        return None
    year = FIRST_LUNAR_YEAR
    while year <= LAST_LUNAR_YEAR:
        total = year_days(infos[year])
        if off < total:
            break
        off -= total
        year += 1
    if year > LAST_LUNAR_YEAR:
        return None
    m, day, lp = decode(infos[year], off)
    return (year, m, day, lp)


def check_anchors():
    for iso, want in ANCHORS:
        y, mo, d = (int(x) for x in iso.split("-"))
        got = decode_solar_check(iso)
        if got != want:
            sys.exit("裁定锚点不符：%s → %s（期望 %s）" % (iso, got, want))
    print("自检1 裁定锚点 5 条逐字通过：" + " · ".join("%s → %s" % (a, b) for a, b in ANCHORS))


def decode_solar_check(iso: str) -> str:
    y, mo, d = (int(x) for x in iso.split("-"))
    want = date(y, mo, d)
    got = decode_solar(INFOS, BASE, want)
    if got is None:
        return ""
    ly, lm, ld, lp = got
    return ganzhi(ly) + lunar_month_name(lm, lp) + DAY_LITERALS[ld - 1]


def lunar_month_name(m: int, leap: bool) -> str:
    return (LEAP_LITERAL if leap else "") + MONTH_LITERALS[m - 1] + "月"


MONTH_LITERALS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"]
LEAP_LITERAL = "闰"
DAY_LITERALS = [
    "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
    "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
]


def check_ganzhi(years):
    bad = []
    for y in range(FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR + 1):
        jd = years[y]["start"] + sum(years[y]["lens"][:5])  # 六月初一（已过立春）
        t = sxtwl.JD2DD(jd)
        g = sxtwl.fromSolar(t.Y, t.M, t.D).getYearGZ()
        want = GAN[g.tg] + ZHI[g.dz]
        if ganzhi(y) != want:
            bad.append((y, ganzhi(y), want))
    if bad:
        sys.exit("干支公式与 sxtwl 不一致（%d 处）：%s" % (len(bad), bad[:5]))
    print("自检2 干支公式 × sxtwl 年干支（取六月初一）全 1–2100：%d 年 0 差" % (LAST_LUNAR_YEAR - FIRST_LUNAR_YEAR + 1))


def check_table(labels, years, modern_from=1000):
    """自检3：表解码 × sxtwl 标签**逐日**（全 1–2100）。

    sxtwl 的 lunarYear/lunarMonth 标签在若干上古年自相矛盾（本脚本已按「朔 + 12/13 月规则」重建）；
    本自检的**硬判据** = **`modern_from` 年（1000）及之后逐日 0 差**（⇒ 上古年的任何重建误差不外溢）。
    """
    mism, days = {}, 0
    for y in range(FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR + 1):
        pos = years[y]["start"]
        for (m, lp), n in zip(years[y]["seq"], years[y]["lens"]):
            for d in range(1, n + 1):
                days += 1
                if labels.get(pos) != pack_label((y, m, d, lp)):
                    mism[y] = mism.get(y, 0) + 1
                pos += 1
    late = [y for y in sorted(mism) if y >= modern_from]
    if late:
        sys.exit("表解码 × sxtwl 在 %d 年及以后仍有不一致：%s" % (modern_from, late))
    print("自检3 表解码 × sxtwl 逐日：%d 天（农历 1-1-1 … 2100 年末）" % days)
    print("       不一致年 = %d 个（**全部 < %d 年**）：%s" % (len(mism), modern_from, sorted(mism)))
    print("       %d–%d 年逐日 **0 差**；不一致日共 %d 天（占 %.4f%%）—— 上古年 sxtwl 标签自相矛盾，故按朔重建"
          % (modern_from, LAST_LUNAR_YEAR, sum(mism.values()), 100.0 * sum(mism.values()) / days))


def main():
    global INFOS, BASE
    start, end, labels, moons = walk()
    native = sxtwl_native_years(labels, moons, end)
    inconsistent = sorted(y for y in native
                          if FIRST_LUNAR_YEAR <= y <= LAST_LUNAR_YEAR and not is_wellformed(native[y]))
    print("诊断：sxtwl 自身 lunarYear/lunarMonth 标签**自相矛盾**之年 = %d 个：%s" % (len(inconsistent), inconsistent))
    print("      （`sxtwl` 自家标签自打架；与自检 3 的「重建后逐日比不上的年」同量级但**非同一集合**）")
    newyear_set = {jd for jd in moons if unpack_label(labels[jd])[1] == 1 and not unpack_label(labels[jd])[3]}
    moons = repair_moons(moons, lambda jd: jd in newyear_set)
    gaps = {moons[i + 1] - moons[i] for i in range(len(moons) - 1)}
    assert gaps <= {29, 30}, "朔间隔仍非法：%s" % sorted(gaps - {29, 30})
    print("起步：农历 1-1-1 JD=%d · 朔 %d 个（间隔∈{29,30}）· 表尾哨兵 JD=%d" % (start, len(moons), end))
    years = build_years(labels, moons, end)
    INFOS, BASE = build_info(years)
    check_anchors()
    check_ganzhi(years)
    check_table(labels, years)

    js_base = int(BASE - JD_EPOCH_JS)
    assert date.fromordinal(js_base + 719163) == date(1, 2, 10), "BASE 自洽断言失败"
    print("BASE（JS 日序）= %d（= 前推格里历公元 1 年 2 月 10 日；TS 端为字面量）" % js_base)
    print("表：%d 年，12 月年 %d / 13 月年 %d" % (
        LAST_LUNAR_YEAR - FIRST_LUNAR_YEAR + 1,
        sum(1 for y in years if len(years[y]["lens"]) == 12),
        sum(1 for y in years if len(years[y]["lens"]) == 13),
    ))

    content = (
        HEADER.replace("__MONTHS__", "', '".join(MONTH_LITERALS))
        .replace("__LEAP__", LEAP_LITERAL)
        .replace("__DAYS__", "', '".join(DAY_LITERALS))
        .replace("__INFO__", pack_literal(INFOS))
        .replace("__BASE__", str(js_base))
    )
    OUT_PATH.write_text(content, encoding="utf-8")
    size = OUT_PATH.stat().st_size
    print("输出 = %s  %d B（表字面 %d 字符）" % (OUT_PATH, size, 4 * (LAST_LUNAR_YEAR - FIRST_LUNAR_YEAR + 1)))
    if size > 16384:  # 裁定硬预算（Zang 2026-10-13：8KB → 16KB，范围 1900→1）
        sys.exit("模块体积 %d B 超出 ≤16KB 预算" % size)


def pack_literal(infos):
    """表字面量：base36 四位/年，每行 120 字（2100 年 = 8400 字）。"""
    text = "".join(base36(infos[y]) for y in range(FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR + 1))
    parts = [text[i : i + 120] for i in range(0, len(text), 120)]
    return "\n".join("  '%s'" % p if i == 0 else "  + '%s'" % p for i, p in enumerate(parts))


def base36(value: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while value:
        out = digits[value % 36] + out
        value //= 36
    return out.rjust(4, "0")


HEADER = """/**
 * 谱文用紧凑农历表（**农历 1–2100**）+ 公历→农历文本（干支·月名·日名）。
 * ⚠️ 由 `scripts/gen-lunar-table.py` 生成，**勿手改**；**本表为 dev 环节生成物、入仓、不得手抄**。复算（仓根，自包含）：
 *   /usr/bin/python3 -m venv /tmp/sxtwl-venv && /tmp/sxtwl-venv/bin/pip -q install sxtwl && /tmp/sxtwl-venv/bin/python scripts/gen-lunar-table.py
 * **单一源 = `sxtwl`（寿星天文历）**：整张表（含 1900–2100）都用它生成 —— 1900 边界不会两套算法打架。
 * **1900 以前 = 推算值**（寿星历的天文推算；非历代颁行历书实测），未逐条校验。
 * sxtwl 两处已绕开（细节见脚本头注）：
 *   ① sxtwl 的 (Y,M,D) 在 **1582-10-15 前是儒略历**、之后是格里历 ⇒ 生成器以 **JD（儒略日）** 为唯一时间轴，
 *      再把日界换算成 **1970-01-01 起算的日序**（= 本文件 `Date.parse(...)/86400000` 的日序）⇒ 两端口径一致。
 *      本文件 `BASE` 因此是**字面量**（日序走**纯算术** `daysFromCivil()`：`Date.UTC(1,…)` 会把 0–99 年映射到 1900+）。
 *   ② sxtwl 的 lunarYear / lunarMonth **标签**在 19 个上古年自相矛盾（诊断 8/23/236/237/239/689–700/761/762；
 *      重建后逐日比不上的 19 年 = 8/23/236–239/689–699/761–762，共 1803 天）⇒ 月界一律取**朔（初一）**、
 *      年与闰按 12/13 个月规则重建；**1000 年及以后逐日与标签 0 差**（脚本自检 3 硬判据）。
 * 月名（正…腊）/ 闰前缀（闰）/ 日名（初一…三十）= **固定字面**（与上一版逐字相同，不由源派生）。
 * 输出**简体字形**：繁体化由调用方走 `traditional.ts`（渲染派生）。公历 ISO **只作输入**；
 * 非 ISO / 超 1–2100 / 表外（公元 1 年 2 月 10 日之前）→ **原样返回**（不猜）。
 * 表 = base36 四位/年，17 bit：低 4 位闰月月序 | bit4–15 正月…腊月（置位 = 30 天）| bit16 闰月 30 天。
 */

const HEX =
__INFO__;

const INFO: number[] = [];
for (let i = 0; i < HEX.length; i += 4) INFO.push(parseInt(HEX.slice(i, i + 4), 36));

export const LUNAR_FIRST_YEAR = 1;
export const LUNAR_LAST_YEAR = 2100;

/** 农历 1-1-1 的公历日序（= 前推格里历公元 1 年 2 月 10 日）—— **字面量**（理由见头注 ①） */
const BASE = __BASE__;
/** 月名（正…腊）/ 闰月前缀 / 日名（初一…三十）= 固定字面（不随源派生） */
const MONTHS = ['__MONTHS__'];
const LEAP = '__LEAP__';
const DAYS = ['__DAYS__'];
const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';

/** 某农历年：闰月月序（0 = 无）/ 第 m 月天数 / 闰月天数 / 全年天数 */
const leapMonthOf = (y: number): number => INFO[y - LUNAR_FIRST_YEAR] & 0xf;
const monthDaysOf = (y: number, m: number): number => (INFO[y - LUNAR_FIRST_YEAR] & (0x10000 >> m) ? 30 : 29);
const leapDaysOf = (y: number): number => (leapMonthOf(y) ? (INFO[y - LUNAR_FIRST_YEAR] & 0x10000 ? 30 : 29) : 0);
const yearDaysOf = (y: number): number => {
  let t = 0;
  for (let m = 1; m <= 12; m += 1) t += monthDaysOf(y, m);
  return t + leapDaysOf(y);
};

/** 农历年 → 干支（甲子 = 1984） */
export function ganZhiOf(y: number): string {
  const i = (((y - 4) % 60) + 60) % 60;
  return GAN[i % 10] + ZHI[i % 12];
}
/** 农历月 → 月名（闰月加 LEAP 前缀）/ 农历日 → 日名 */
export function lunarMonthName(m: number, leap: boolean): string {
  return (leap ? LEAP : '') + MONTHS[m - 1] + '月';
}
export function lunarDayName(d: number): string {
  return DAYS[d - 1] || '';
}

/**
 * 公历（**前推格里历**）`(y, m, d)` → **1970-01-01 起算的日序**。**纯算术**（Howard Hinnant `days_from_civil`）。
 * **不依赖 `Date.UTC(...)`** —— JS 把 0–99 年映射到 1900+（`Date.UTC(1,0,1)` ⇒ 1901-01-01），
 * 公元 1–99 年取日序会整体偏 1900 年；本函数对**前推格里历**任意年（含 1–99）逐日正确。
 * 口径与生成器一致（生成器以 JD 为唯一时间轴，减 `JD_EPOCH_JS` 得同一日序）。
 */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
/** 前推格里历某年某月天数（严格校验用 ⇒ `2023-02-31` → null） */
function daysInCivilMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** 公历 `YYYY-MM-DD` → 农历四元组；解析失败 / 超表范围 → null（严格校验：2023-02-31 → null） */
export function solarToLunarFields(iso: string): { year: number; month: number; day: number; isLeap: boolean } | null {
  const m = /^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/.exec((iso || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > daysInCivilMonth(y, mo)) return null;
  const ord = daysFromCivil(y, mo, d);
  let off = ord - BASE;
  if (off < 0) return null;
  let year = LUNAR_FIRST_YEAR;
  while (year <= LUNAR_LAST_YEAR) {
    const total = yearDaysOf(year);
    if (off < total) break;
    off -= total;
    year += 1;
  }
  if (year > LUNAR_LAST_YEAR) return null;
  const leap = leapMonthOf(year);
  let month = 1;
  let isLeap = false;
  for (;;) {
    const len = isLeap ? leapDaysOf(year) : monthDaysOf(year, month);
    if (off < len) break;
    off -= len;
    if (!isLeap && month === leap) isLeap = true;
    else {
      isLeap = false;
      month += 1;
    }
  }
  return { year, month, day: off + 1, isLeap };
}

/** 公历 ISO → 谱文农历文本：`<干支><月名><日名>`（干支取**农历年**，跨春节前属上一年）/ 只有年月 → `<干支><月名>`
 *  （月取该公历月**中旬** 15 日所在农历月 —— 口径未裁，见交付报告）/ 只有年 → `<干支>年`；其余 → 原字面。 */
export function solarToLunarText(iso: string): string {
  const s = (iso || '').trim();
  const m = /^(\\d{4})(?:-(\\d{1,2})(?:-(\\d{1,2}))?)?$/.exec(s);
  if (!m) return s;
  const y = Number(m[1]);
  if (y < LUNAR_FIRST_YEAR || y > LUNAR_LAST_YEAR) return s;
  const mo = m[2] ? Number(m[2]) : 0;
  const d = m[3] ? Number(m[3]) : 0;
  if (!mo) return ganZhiOf(y) + '年';
  if (!d) {
    const mid = solarToLunarFields(String(y) + '-' + (mo < 10 ? '0' + mo : mo) + '-15');
    return mid ? ganZhiOf(mid.year) + lunarMonthName(mid.month, mid.isLeap) : s;
  }
  const f = solarToLunarFields(s);
  return f ? ganZhiOf(f.year) + lunarMonthName(f.month, f.isLeap) + lunarDayName(f.day) : s;
}
"""

INFOS: dict = {}
BASE: int = 0

if __name__ == "__main__":
    main()
