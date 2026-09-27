/**
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
  '0ezc0esg0wog0gr915k016xc1yl00h400ukw0gya0esg0wqe0wk015jk2k450zsw16e80yaq0tkg1t2v0ei80wj40zp10l000lkw2ces08kg0tio0gdu0ei8'
  + '0k1216001aa81zmd0hxs08kg257n0t0g2i8n13rk16002ld20ztc0h402bas07gw0t0015ma0xg00ztj0lgg0ztc1v110fc00wq81sab0gc00xig1a340l28'
  + '0yhy0xu80ew00xr80wog0g9s1bvn16xc0i1j0h400tsg0fdh0es00wk0161g15jk16540zsw102o284m0tkg0ek00xh00wj40z960l000lkw0yme0xuo0tio'
  + '0et10ei80jw00n1f1aa80l7c0hxc0xuo0tsl0t0g13s016xg1600174g0n6a0h400xx307gw0t00141h0xg00zog10v80y8g0gyh0exs0wq81unq0gc00xf4'
  + '0nys0l280y8g0i1e0ew00wyu0wkg15k01aat16400hwg0nfn0tsg0et70es00wk02jsm15jk163k17ph0zvk0h5c0gxe0ek00won0wj40xn42dsl0lk00yao'
  + '1tgj0t4g0em00ei80jw01z8m1aa80l5s2bic0xr40t0g15nn13s016531600174g0ifp0h400wy80gyc0gcw0xiw0xg00zog102u0y8g0gww0xwk0wq80gc0'
  + '0z8z0ks00mrb0l280y8g1tg50ew00wog0gro15cw1a3s163k176o1zmu0h5c0esg0xjo0w5s15cg1bv6163k';

const INFO: number[] = [];
for (let i = 0; i < HEX.length; i += 4) INFO.push(parseInt(HEX.slice(i, i + 4), 36));

export const LUNAR_FIRST_YEAR = 1900;
export const LUNAR_LAST_YEAR = 2100;

/** 农历 1900-01-01 的公历日序（= 1900-01-31） */
const BASE = Date.UTC(1900, 0, 31) / 86400000;
/** 月名（lunar_python 逐字）/ 闰月前缀 / 日名（初一…三十） */
const MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LEAP = '闰';
const DAYS = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
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
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((iso || '').trim());
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
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(s);
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
