#!/usr/bin/env python3
"""生成 `frontend/src/business/lunar.ts` —— 谱文用**紧凑农历表** + 公历→农历文本（干支 · 月名 · 日名）。

复算（一行即可复现本表，须在仓根执行；**自包含**，不依赖任何既有 venv）：
  python3 -m venv /tmp/jiazu-lunar-venv && /tmp/jiazu-lunar-venv/bin/pip -q install lunar_python sxtwl lunardate && /tmp/jiazu-lunar-venv/bin/python scripts/gen-lunar-table.py

口径（Zang 裁定 · 「在线文谱」批 · 2026-09-26）：
  · **权威源 = `lunar_python`（6tail，lunar-java 官方移植）出表**；`sxtwl`（寿星天文历）作**交叉验证**；
    `lunardate` **降级为参考、不进判据**（其 1900–2100 简化查表在朔日边界失真：1933-07-22 → 六月初一，
    而 lunar_python / sxtwl 均为**闰五月三十** ⇒ 少数派，**其差异不得判本表失败**）。
  · 范围 = **1900–2100**（农历年）；超范围 / 非 ISO 形状 / 表外日期 → 调用方兜底输出**原 ISO 字面**（不猜）。
  · 输出格式：完整日期 → `<干支><月名><日名>`（如 `1957-12-04` → `丁酉十月十三`）；只有年月 → `<干支><月名>`；
    只有年 → `<干支>年`。**干支取「农历年」**（跨春节前的日期属上一年，如 2006-01-01 → 乙酉）。
  · **月名 / 日名字面逐字取自 `lunar_python`**：月名 = `getMonthInChinese()` + 「月」（闰月其输出已含「闰」，
    如 `闰五` → `闰五月`）；日名 = `getDayInChinese()`（初一…三十）。**本表由脚本生成，不得手抄。**
  · 体积 = 模块 ≤ 8KB（**Zang 补裁 2026-09-26：预算由 4KB 放宽到 8KB**；真约束 = **不得引
    lunar-javascript 这类 512KB 级依赖** —— 现测 6116 B ≈ 小程序主包 0.3%，不值得为 2KB 做打包压缩）。

表编码（17 bit / 农历年，5 位十六进制）：低 4 位 = 闰月月序（0 = 无闰月）；bit4–15 = 正月…腊月（置位 = 30 天）；
bit16 = 闰月 30 天。

脚本自检（失败即非零退出）：
  1) 裁定锚点 5 条逐字断言（1957-12-04 / 2024-03-19 / 2019-08-17 / 2006-01-01 / 1990-06-15）；
  2) 干支公式 `(农历年 - 4) mod 60` × `lunar_python.getYearInGanZhi()` 全 1900–2100 **0 差**；
  3) 用本脚本内的**解码镜像**（与 TS 端同算法）反解生成的表，对 `lunar_python` **逐日**比对（0 差）；
  4) `sxtwl` 交叉验证全量逐日差异**如实打印**（不阻断；`lunardate` 差异同样只打印）。
"""

import sys
import warnings
from datetime import date, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")

try:
    from lunar_python import Lunar, LunarYear, LunarMonth, Solar
    import sxtwl
except ImportError:  # pragma: no cover
    sys.exit(
        "缺少 lunar_python / sxtwl。请先执行：\n"
        "  python3 -m venv /tmp/jiazu-lunar-venv && /tmp/jiazu-lunar-venv/bin/pip -q install lunar_python sxtwl lunardate\n"
        "  /tmp/jiazu-lunar-venv/bin/python scripts/gen-lunar-table.py"
    )

try:  # 仅信息性参考（少数派，不进判据）
    from lunardate import LunarDate
except ImportError:  # pragma: no cover
    LunarDate = None

OUT_PATH = Path(__file__).resolve().parent.parent / "frontend/src/business/lunar.ts"

FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR = 1900, 2100
BASE_SOLAR = date(1900, 1, 31)  # 农历 1900-01-01
GAN = "甲乙丙丁戊己庚辛壬癸"
ZHI = "子丑寅卯辰巳午未申酉戌亥"

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


def lmonth(year: int, month: int) -> LunarMonth:
    """农历年内的月（`month` 取负 = 闰月）；不存在 → None。"""
    return LunarMonth.fromYm(year, month)


def literals():
    """月名 / 日名 / 闰前缀：**逐字取自 lunar_python**（跨年份抽样断言一致）。"""
    month_literals = {}
    samples = (1900, 1933, 1957, 2000, 2057, 2100)
    for year in samples:
        for m in range(1, 13):
            got = Lunar.fromYmd(year, m, 1).getMonthInChinese()
            if m in month_literals and month_literals[m] != got:
                sys.exit("月名字面跨年份不一致：%d 月 %s vs %s" % (m, month_literals[m], got))
            month_literals[m] = got
    leap_prefix = None
    for year in samples:
        for lm in LunarYear.fromYear(year).getMonths():
            if lm.getYear() != year or not lm.isLeap():
                continue
            plain = Lunar.fromYmd(year, abs(lm.getMonth()), 1).getMonthInChinese()
            leap = Lunar.fromYmd(year, lm.getMonth(), 1).getMonthInChinese()
            if not leap.endswith(plain) or leap == plain:
                sys.exit("闰月字面形态异常：%s vs %s" % (leap, plain))
            prefix = leap[: len(leap) - len(plain)]
            if leap_prefix is not None and leap_prefix != prefix:
                sys.exit("闰前缀不一致：%s vs %s" % (leap_prefix, prefix))
            leap_prefix = prefix
    if not leap_prefix:
        sys.exit("未能从 lunar_python 取得闰月前缀")
    day_literals = {}
    for year in samples:
        for m in (1, 5, 12, -5, -8):
            lm = lmonth(year, m)
            if not lm:
                continue
            for d in range(1, lm.getDayCount() + 1):
                got = Lunar.fromYmd(year, m, d).getDayInChinese()
                if d in day_literals and day_literals[d] != got:
                    sys.exit("日名字面跨年月不一致：%d 日 %s vs %s" % (d, day_literals[d], got))
                day_literals[d] = got
    return month_literals, leap_prefix, day_literals


def render_text(iso: str, month_literals, leap_prefix, day_literals) -> str:
    """脚本内的**镜像实现**（与 TS 端同一口径）：仅用于锚点断言（本函数只接受完整 `YYYY-MM-DD`）。"""
    y, mo, d = (int(x) for x in iso.split("-"))
    lunar = Solar.fromYmd(y, mo, d).getLunar()
    month_name = (
        leap_prefix if lunar.getMonth() < 0 else ""
    ) + month_literals[abs(lunar.getMonth())] + "月"
    return ganzhi(lunar.getYear()) + month_name + day_literals[lunar.getDay()]


def check_anchors(month_literals, leap_prefix, day_literals):
    for iso, want in ANCHORS:
        got = render_text(iso, month_literals, leap_prefix, day_literals)
        if got != want:
            sys.exit("裁定锚点不符：%s → %s（期望 %s）" % (iso, got, want))
    print("自检1 裁定锚点 5 条逐字通过：" + " · ".join("%s → %s" % (a, b) for a, b in ANCHORS))


def check_ganzhi():
    bad = []
    for year in range(FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR + 1):
        want = Lunar.fromYmd(year, 6, 1).getYearInGanZhi()
        got = ganzhi(year)
        if got != want:
            bad.append((year, got, want))
    if bad:
        sys.exit("干支公式与 lunar_python 不一致（%d 处）：%s" % (len(bad), bad[:5]))
    print("自检2 干支公式 × lunar_python 全 1900–2100：%d 年 0 差" % (LAST_LUNAR_YEAR - FIRST_LUNAR_YEAR + 1))


def year_months(year: int):
    """该农历年的 12/13 个月：[(month, is_leap, days), ...]（按序）。"""
    days = {}
    for lm in LunarYear.fromYear(year).getMonths():
        if lm.getYear() != year:
            continue
        days[lm.getMonth()] = (lm.isLeap(), lm.getDayCount())
    out = []
    for m in range(1, 13):
        if m not in days:
            sys.exit("农历 %d 年缺 %d 月" % (year, m))
        out.append((m, days[m][0], days[m][1]))
        if (-m) in days:
            out.append((m, True, days[-m][1]))
        days.pop(m)
        days.pop(-m, None)
    if days:
        sys.exit("农历 %d 年有未归类月份 %s" % (year, sorted(days)))
    return out


def build_info():
    infos = {}
    for year in range(FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR + 1):
        months = year_months(year)
        if len(months) not in (12, 13):
            sys.exit("农历 %d 月数异常 = %d" % (year, len(months)))
        info, leap = 0, 0
        for m, is_leap, days in months:
            if days not in (29, 30):
                sys.exit("农历 %d 年 %d 月长度异常 = %d" % (year, m, days))
            if is_leap:
                leap = m
                if days == 30:
                    info |= 0x10000
            elif days == 30:
                info |= 0x10000 >> m
        if leap and not any(m == leap and is_leap for m, is_leap, _ in months):
            sys.exit("农历 %d 闰月标记异常" % year)
        infos[year] = info | leap
    return infos


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


def year_days(info: int) -> int:
    total = sum(30 if (info & (0x10000 >> m)) else 29 for m in range(1, 13))
    if info & 0xF:
        total += 30 if (info & 0x10000) else 29
    return total


def decode_solar(infos, d: date):
    offset = (d - BASE_SOLAR).days
    if offset < 0:
        return None
    year = FIRST_LUNAR_YEAR
    while year <= LAST_LUNAR_YEAR:
        total = year_days(infos[year])
        if offset < total:
            break
        offset -= total
        year += 1
    if year > LAST_LUNAR_YEAR:
        return None
    month, day, is_leap = decode(infos[year], offset)
    return (year, month, day, is_leap)


def ref_lunar_python(d: date):
    L = Solar.fromYmd(d.year, d.month, d.day).getLunar()
    return (L.getYear(), abs(L.getMonth()), L.getDay(), L.getMonth() < 0)


def ref_sxtwl(d: date):
    x = sxtwl.fromSolar(d.year, d.month, d.day)
    return (x.getLunarYear(), x.getLunarMonth(), x.getLunarDay(), bool(x.isLunarLeap()))


def ref_lunardate(d: date):
    L = LunarDate.from_solar_date(d.year, d.month, d.day)
    return (L.year, L.month, L.day, bool(L.isLeapMonth))


def check_table(infos):
    """自检3：表解码 × lunar_python 逐日；并打印 sxtwl / lunardate 交叉验证读数。"""
    d, days = BASE_SOLAR, 0
    bad, sxt_diff, lun_diff = [], [], []
    while decode_solar(infos, d) is not None:
        got = decode_solar(infos, d)
        if got != ref_lunar_python(d):
            bad.append((d.isoformat(), got, ref_lunar_python(d)))
        if got != ref_sxtwl(d):
            sxt_diff.append(d.isoformat())
        if LunarDate is not None and got != ref_lunardate(d):
            lun_diff.append(d.isoformat())
        days += 1
        d += timedelta(days=1)
    if bad:
        sys.exit("表解码 × lunar_python 不一致（%d 处）：%s" % (len(bad), bad[:5]))
    print("自检3 表解码 × lunar_python 逐日对拍：%d 天（1900-01-31 – %s），0 差" % (days, (d - timedelta(days=1)).isoformat()))
    print(
        "  交叉验证 sxtwl：差异 %d 天%s"
        % (len(sxt_diff), ("（窗口 %s … %s）" % (sxt_diff[0], sxt_diff[-1])) if sxt_diff else "")
    )
    print(
        "  参考 lunardate（少数派、不进判据）：差异 %d 天%s"
        % (len(lun_diff), ("（窗口 %s … %s）" % (lun_diff[0], lun_diff[-1])) if lun_diff else "")
    )


def main():
    month_literals, leap_prefix, day_literals = literals()
    check_anchors(month_literals, leap_prefix, day_literals)
    check_ganzhi()
    infos = build_info()
    check_table(infos)
    content = (
        HEADER.replace("__MONTHS__", "', '".join(month_literals[m] for m in range(1, 13)))
        .replace("__LEAP__", leap_prefix)
        .replace("__DAYS__", "', '".join(day_literals[d] for d in range(1, 31)))
        .replace("__INFO__", pack_literal(infos))
    )
    OUT_PATH.write_text(content, encoding="utf-8")
    size = OUT_PATH.stat().st_size
    print("农历年数 = %d（%d–%d）" % (len(infos), FIRST_LUNAR_YEAR, LAST_LUNAR_YEAR))
    print("月名字面 = %s" % " / ".join(month_literals[m] + "月" for m in range(1, 13)))
    print("闰月前缀 = %s" % leap_prefix)
    print("日名字面 = %s … %s（共 %d）" % (day_literals[1], day_literals[30], len(day_literals)))
    print("输出 = %s  %d B" % (OUT_PATH, size))
    if size > 8192:  # 裁定硬预算（Zang 补裁 2026-09-26：4KB → 8KB；真约束 = 不引 512KB 级依赖）
        sys.exit("模块体积 %d B 超出 ≤8KB 预算" % size)


def pack_literal(infos):
    """表字面量：base36 四位/年，每行 120 字（201 年 = 804 字）。"""
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
 * 谱文用紧凑农历表（1900–2100）+ 公历→农历文本（干支·月名·日名）。
 * ⚠️ 由 `scripts/gen-lunar-table.py` 生成，勿手改。复算（仓根，自包含）：
 *   python3 -m venv /tmp/jiazu-lunar-venv && /tmp/jiazu-lunar-venv/bin/pip -q install lunar_python sxtwl lunardate && /tmp/jiazu-lunar-venv/bin/python scripts/gen-lunar-table.py
 * 权威源 = lunar_python（6tail）；sxtwl 交叉验证（逐日差异 30 天，窗口 2057-09-28…2057-10-27）；lunardate 仅参考。
 * 月名 / 日名字面**逐字取自 lunar_python**（月名 = getMonthInChinese() + 「月」，闰月其输出已含「闰」；日名 = getDayInChinese()）。
 * 输出**简体字形**：繁体化由调用方走 `traditional.ts`（渲染派生）。公历 ISO **只作输入**；
 * 非 ISO / 超 1900–2100 / 表外（1900-01-31 前）→ **原样返回**（不猜）。
 * 表 = base36 四位/年，17 bit：低 4 位闰月月序 | bit4–15 正月…腊月（置位 = 30 天）| bit16 闰月 30 天。
 */

const HEX =
__INFO__;

const INFO: number[] = [];
for (let i = 0; i < HEX.length; i += 4) INFO.push(parseInt(HEX.slice(i, i + 4), 36));

export const LUNAR_FIRST_YEAR = 1900;
export const LUNAR_LAST_YEAR = 2100;

/** 农历 1900-01-01 的公历日序（= 1900-01-31） */
const BASE = Date.UTC(1900, 0, 31) / 86400000;
/** 月名（lunar_python 逐字）/ 闰月前缀 / 日名（初一…三十） */
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

/** 公历 `YYYY-MM-DD` → 农历四元组；解析失败 / 超表范围 → null（严格校验：2023-02-31 → null） */
export function solarToLunarFields(iso: string): { year: number; month: number; day: number; isLeap: boolean } | null {
  const m = /^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/.exec((iso || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ord = Date.UTC(y, mo - 1, d) / 86400000;
  const back = new Date(ord * 86400000);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
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

if __name__ == "__main__":
    main()
