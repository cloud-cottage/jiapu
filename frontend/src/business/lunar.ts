/**
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
  '0xu80gxk0guo0hwg0yhx0xps0guo0l280xu80gvu0guo0l280xwo0xqo0guo0llh0h400xqo1mzl164w0hy10gww2c0m0y8l0l280xu80l3m0guo1zmi0h40'
  + '0xqo0h46164w0hwg0zvn0xpc16580ztc0gww2c880xpc0ztc0i1g0gv40xpc1ach0y8g1vfe0guo0l280yhy0xqo0guo0ztf0hwg0xr00xps0guo0hy10h40'
  + '0xps1uw50ztc0h40165d0xpc165m0y8g0gv40xuf0xpc0y8g1tg30guo0xq30hwg0xu80gxk0guo0l280yhx0xps0guo1vep0xpc0zu20xu80gv40xuf0l28'
  + '0y8g1tcj0guo0l2z0hwg0xqo0gxk0guo0hwg0yat0xps0guo1p3l0h400xrd0xpc0ztc0h930gv40xpc176s0y8g1vfw0guo0xpc0yaw0xu80guo0y8l0hwg'
  + '0xu80l2q0guo1zmi0h400xps0h46164w0h400zvn0xpc16580y8g0gww2c7s0xpc0ztc0i1g0guo0xpc1ach0xu81vfe0guo0l282c9y0xqo0guo0n6b0h40'
  + '0xr00xpc164w0hy10gww0xpc2k6d0ztc0gww165d0xpc0zu20xu80gv40xuf0l280y8g1tcj0guo0l2z0hwg0xqo0gxk0guo0hwg0yat0xps0guo1p3l0h40'
  + '0xrd0xpc0ztc0h930gv40xpc176s0y8g1vfw0guo0xpc0yaw0xu80guo0y8l0hwg0xu80l2q0guo1zmi0h400xps0h46164w0h400zvn0xpc16580y8g0gww'
  + '2c7s0xpc0ztc0i1g0guo0xpc1ach0xu81vfe0guo0l282c9y0xqo0guo0n6b0h400xr00xpc164w0hy10gww0xpc2k6d0ztc0gww164h0ztc0h402c120xpc'
  + '102u0y8g0gv40ztf0l280y8s0xqo0guo0l3t0h400xqo1uw5164w0h4016750xpc165m0y8g0gww0xuf0xpc0y8g1tg30guo0xq30hwg0xu80gxk0guo0hwg'
  + '0yhx0xps0guo1p3l0h400xrd0xpc0ztc0h930gv40xpc10v80y8g1vfw0guo0l280yaw0xqo0guo0llh0hwg0xqo0l2a164w1wgq0gww0xpc16ee0ztc0gww'
  + '0ztf0xpc0zto0xu80guo2c7s0l280xu80hx00guo0l2816e90xps0gve164w0h400xuv0xpc164w1tub0gv40xq30xpc0y8g0gyg0guo0xpc2c9x0xqo0guo'
  + '164x0hwg0xre0xps0guo0i1j0gww0xps0hwk0ztc1vho0gv40xpc0zvs0xu80gv40y8l0l280xu80l3m0guo1zmi0h400xqo0h46164w0h400zvn0xpc1658'
  + '0y8g0gww2c7s0xpc0y8g0i1g0guo0xpc176p0xqo0gvu0guo0hwg0xwn0xps0guo1vf70gww0xq40xpc0ztc0gyh0gv40xpc2dut0xu80gv4164x0l280xuy'
  + '0xqo0guo0l7b0h400xqo1tb7164w0h4r0gww0xpc167c0y8g0gww0y8l0xpc0y8g0l760guo2c9m0hwg0xu80h4m0guo0hwg102r0xps0gv00ztc0h402c88'
  + '0xpc0ztc0ifo0gv40xpc1ach0y8g1vfe0guo0l280yhy0xqo0guo0n6b0hwg0xr00xpc164w0hy10gww0xpc2k6d0ztc0gww0y8l0xpc0ztc0l760guo2c9m'
  + '0l280xu80h4m0guo0l28102r0xps0gv00ztc0h400xrd0xpc0ztc1vf90gv40xpc1ach0y8g0gvv0guo0l282co70xqo0guo0n6b0hwg0xr00xpc164w0hy1'
  + '0gww0xpc2k6d0ztc0gww164x0xpc0zu20xu80guo0xuf0l280xu80hx00guo1zn00h400xps0gx4164w0h400y910xpc164w0lle0gv42c9m0xpc0y8g0h5i'
  + '0guo0xpc10v70xqo0gv0164w0hwg2ca00xpc164w0ifp0gww0xpc1aci0ztc1vh60guo0xpc102u0xu80guo0ztf0l280xuk0xps0guo0l3t0h400xps1uw5'
  + '164w0h40165d0xpc165m0y8g0gv40xuf0xpc0y8g1tcj0guo0xq30hwg0xqo0gxk0guo0hwg0yat0xps0guo0n6a0gww2ca20xpc0ztc0h920gv40xpc10v8'
  + '0xu81vfw0guo0l280xwo0xqo0guo0llh0h400xqo0l2a164w0h4r0gww0xpc2kkn0y8g0gww0ztf0xqo0gv0164w0hwg0xre0xpc164w1uxh0guo0l2816e9'
  + '0xqo0gve164w0h400xwn0xpc164w1tub0gww0xq30xpc0y8g0gyh0guo0xpc2c9x0xu80guo142q0wnk2k620za8164w0h930gww0wr40gxf0ek02bx80wnk'
  + '0xpc0zvs0y8g0fc00xwk0wog0gc025pu0jw01zmi0hwg0xu81td20esg0h400ztv0xpc0zto0y8g0gv40xqx0l280y8g1uxh0guo0l28176p0xqo0gve164w'
  + '0hwg0xwn0xpc164w1vf70xg02e980l280xuo0gyx0ewg0dps0gvp0gc00ksw0n6b0hwg2cej0tsg0esg2b530wk015kg0hwl0ztc0h4016750tlc1tcp0ek0'
  + '0wk0161h0xpc0ztc0lle090g0tm40tio0ek00won0jw00l1s2c9w0l7408kg0xup0t4g0em10epc0ksw1zcm0hwg0l3k0h5e0esg0wos0t0013zk0guv0zog'
  + '10nk0ip10tsg07og13v50w5s2dsp0ksw0xpc0yhy0xuo0gxc0ghf07e81uwb15ls1aa80llk0hwg0xu80up00t4013sg1t2a16001aay164w0hwg2c2u0wyo'
  + '0t0g0xqr0wnk15mj0l280ztc1vmg0gy807gw0tkk0gcw0xg01a350xpc0zu20xu80exs0x2e0wa80ga80ktv0gts0l2j176o0uog08ns0esg0wo015rp0ehs'
  + '160g1p2916e80h620gy807gw0wr90t000xg016xg0y740zvw0xwg0gxc1t2w0dps0gc00xpx0ksw0l28176p0xuo1tgq0esg0wog1una15ls1aa80n6b0hxc'
  + '2cfg04io0rfk133c0xgg1600176t0ztc0h4016750wr40t160gc00xcg16530za80ztc1tub0fc00wqk0wog0gc00xh30jzk0l280yhx0xu80ew0142p0wog'
  + '1und15cg16400l6f0h400hxs0h5f0esg0w6z0w5s15cg16530zs00zvk0ihw0gxc0ekw25rm0w4w0xoa0l000y74103q0xuo0gxc0ewj0dps0ji4160g0l00'
  + '1zko0hwg0xuo0h5g0t0g12zk1a36160016y20ztc0h400xwn0wr40gcw0zar0xg015mj0xpc0ztc0gyh0exs0tkg0gvp0ek00xbk199t0l280y960l7408kg'
  + '0wyu0wa80g341xt016400hwc16e80h5c1n140esg0w6815n913rk163k1cf60zvk0h620gxc0dsg2aie0w4w0xg010lw0lk00y980xuo0gxc1sag0dps0gc0'
  + '0l2d1a340l28176p0xuo0gh7141s19b415qv15ls16xc1vf70h400wyk0tlc0es00wqf0wk00z8g2dut0ztc0gww0xwh0tkg0et50ek00wj40xtj0l280y8g'
  + '0i1f08kg0tj00wa80g341yeg160g0hw00lut0h5c08gw0wyq0w682ica0xg0160017af0zvk0h5c0alv07gw27ks0sz40xg00zq10y3k0y8g1v1h0ey807g0'
  + '0woi0gc00ku20hn40l282c9z0xuo0ew00xr70wog0gcc15ls164w0hy10h400tsg0fdh0es00wk019760z8g0zu20y8g0alc0tye0tkg0ek00xis0wj42c7w'
  + '0l280llc092108k00t4g0esl13sg0jw01vaa17680l7u0h5c07og27l20t0g13s016xg160016e40yao0h5c1m7t07gw0sz40xpx0xg00zog1ach0y8w1vhn'
  + '0ey807g00ghj0gc00ksw0n6b0l280xuk0x280ew00wrs0wo015k01aat164w0hwg102r0tsg0et70ekw0wk015nb0xn40ztc0ifo0alc0tlc1iup0ek00wl5'
  + '0jw00xn4102e0l74090g0xuq0t4g0eik13sg0jw00l2g174g0i0w2bis08gw0t0g15nm13s0161l160016c01w7q0gy807o00wr60sz40xh60xg00zog0zvs'
  + '0y8g0gxc08l007e80gc015m90ksw0l3t0hwg0xu80fkl0ew00wog1s6b15k02omj164w0hwg0uqw0tsg0esg0xjo0wk015jk1bv60zsw2kyi090g0tlc1t4m'
  + '0ek00wj40zp00l000zsr0l6o0xuo282w0t4g0ei80ktw0gq80l0c174g0hxc2cey07og0t0g142u13s016001cbm164w0h4r0gxc07gw0t7b0sxc0xg02jx1'
  + '0zog0ztc1nip0fcg07hl0wog0gc00xpy0ksw0l2810v70xu80ewr0esg0wog0gdj15k01a280llh0hwg0uog0h5e0esg2b4q0wk015k016c60zs016e80lnm'
  + '0tlc1t5o0ek00wj40xq00l000zsw10zo0xuo0tkg0ghe0ei80jy10gq80l001zyv0hxc0xuo257n0t0g13ss13s01600176w0ztc0h400yb907gw0t0g15ma'
  + '0xg0161l0za80ztc0h930fc00wq80gvo0gc02bzw0ks00l280yaw0xu80ew00xr80wog0ga81uua199s0lh60h400i1c1tcm0esg0wkg161g15k0164b0zs0'
  + '102o1vop0gvk0ekw2aid0wj40xn41aa90zs00zvu0xuo0tkg0ewm0ei80jw00zoz0l000l6j0hxc0xuo1n140elc0wk0160l0z800zs01cf60zvk0tm20tkg'
  + '0ek00wom0wj40xn410t00lkw0y980xuo0t4g1t4o0ei80jw00lgl174g0hwg16f50wyo0t170t0g13s016531600164w1vf70h400wy80wr50sz40wqg0xg0'
  + '0za82dut0y8g0fc014810wog0ge10ga80ks00l6f0l280xu80h8z0ew00wvw0w6815cw1a3s1600176o0ip10h5c0esg25020w5s15dm0xn40zs016iv0yao'
  + '0gy80gj70drk0w4w2apd0xn40ztl0l5s0y8w1v1h0t4g0dps0woj0gc00l0q16xc0hwg2cav0wyo0gdc142r0wo015mj15ls164w0hy10h400wy80gyd0gc0'
  + '0xcg19aq0za80zu20y8g0fc00x460wog0g4w2agk0jzk1zmk0hwg0xu808nt08kg0wa80gdh15cw19680n4z176o1wln0h5c08gw0wd30w5s15cg16xg0zs0'
  + '102k0yao0gy81m0p0drk0w4w0xpx0xg00zs01ach0xuo0gxo0ewg0dps0ghj0gc00ksw1zdg0hwg0xuk0wyo0esg0wrs0wo015ls1acm164w0h40284i0tlc'
  + '0et70ek00wk015nb0za80ztc0ifo090g0tkg1isx0ek00wl50jw00l1s0yhy0l7408kg0xr60t4g1t2j13s019740l5z176o0hxs0atv07og0t0g15n613rk'
  + '161l0zog10281vhi0gxc07gw0wqa0sz40xh60ksw0n1c0zvs0xuo0gj408l007e80gc015m90ksw0l3t0hwg0xu80fkl0esg0wa81s6b15ls2lhn0ztc0h40'
  + '0tyf0tlc0esg0xis0wk015jk2c9t0ztc0h5l090g0tkg0ewl0ei80wj40zp00l1s0y8s0i1c08kg0tm00t0w0ei80ktg16001aak16ds0h5c1n4q07og0t0g'
  + '142e13rk16001cbm0zv40h5o0gxc07gw0t6f0sz40xg02dlh0lgg0y8g1n4x0ey807i107e80gc00xpi1a340l2810v70xu80ewr0esg0wog0gd315k016xc'
  + '0ifp0h400tsg0gya0esg0wl60wk015jk16dy0ztc0alc0xwi0tkg1t4s0ei80wj40zaw0l000lkw2ces08m80t4g0gdu0ei80jxl16001aa81q5i0h5c08kg'
  + '250j0t0g13sr0xg01600176w0ztc0h4g090k0wr40t0015ma0xg00zq10l280y8g0h920exs0wq81sab0gc02c0b1a340l280yaw0uog0ew00xr80wkw0g9s'
  + '2k4i164w1wgq0h400tsg1t5i0elc0wk0161g15jk164b0zsw0zvk284o0tkg0ek00xh00wj40xn41aa90lkw0ybf08kg0t4g0et20ei80jw01yg4174g0l5s'
  + '28ci0xuo27km0t0g13s02jx11600174g1vf70h400x470wr40t000xpy0xg00zog10v80y8g0gww265e0wq80ghj0gc00ks020yd0l280y8g0i1f0ew00wrs'
  + '0wkg15k01aau163k176o1yuc0h5c0esg0xjn0wk015mf0z80163k2kp10zvk0gy80gxf0ek00won0wj40xn4100m0lk00yao0i1w0t4g0ei80ktv0jw00l2f'
  + '174g0hwg0yit0xr40t0g15nn13s02kig1600164w1w7q0h400wy80gyc0gcw0xg02ic30zog2e930y8g0gww2aw50wq80gc02agk0ks00l2x0l280xu80fo6'
  + '0ew00wog0gdg15cw1a280n4z176o1wh30h5c0esg2aj90w5s15cg174k0zs016eh0yao0gy81mt20drk0w4w0zat0xg00zs02cde0y8w1vfr0ghc0dps0k1h'
  + '0gc00ksw0nyr0hwg0xuy0wy80esg0wyu0wo015ls1acl164w0hwg102r0wy80ezb0er40xcg16510za80ztc0ifo0fc00tlc0gvm0ek00xh20jw00l1s10v8'
  + '0l7408m80xuq0t4g0gdi15cw19680lk517680i1c0atv08gw0w6818sy13rk16520zs010280ihw0gy807gw0wqb0w4w2bw70xg00zog2dut0y8g0gxc08l0'
  + '07e80ge10gc00ksw0lli0hwg0xu80h5g0esg0wog1s9f15ls2oiv164w0hwg0yat0tlc0esg0xpw0wk015mg0z9s0ztc0h93090g0tlc0fat0ek00wj42b3n'
  + '0l1s0yag0l7408kg27ol0t4g0ei80ktg195s1aay17680hxs1n1208gw0t0g142d13rk16002kkj10280hbb0gxc07gw0tkl0sz40xg016xg0zog0ztc0lle'
  + '0gxc07sm07e80gc00xph1a340l2810v70xu80ezc0esg0wog0gr915k016xc1yl00h400ukw0gya0esg0wqe0wk015jk2k450zsw16e80yaq0tkg1t2v0ei8'
  + '0wj40zp10l000lkw2ces08kg0tio0gdu0ei80k1216001aa81zmd0hxs08kg257n0t0g2i8n13rk16002ld20ztc0h402bas07gw0t0015ma0xg00ztj0lgg'
  + '0ztc1v110fc00wq81sab0gc00xig1a340l280yhy0xu80ew00xr80wog0g9s1bvn16xc0i1j0h400tsg0fdh0es00wk0161g15jk16540zsw102o284m0tkg'
  + '0ek00xh00wj40z960l000lkw0yme0xuo0tio0et10ei80jw00n1f1aa80l7c0hxc0xuo0tsl0t0g13s016xg1600174g0n6a0h400xx307gw0t00141h0xg0'
  + '0zog10v80y8g0gyh0exs0wq81unq0gc00xf40nys0l280y8g0i1e0ew00wyu0wkg15k01aat16400hwg0nfn0tsg0et70es00wk02jsm15jk163k17ph0zvk'
  + '0h5c0gxe0ek00won0wj40xn42dsl0lk00yao1tgj0t4g0em00ei80jw01z8m1aa80l282bic0xr40t0g15nn13s016531600174g0ifp0h400wy80gyc0gcw'
  + '0xiw0xg00zog102u0y8g0gww0xwk0wq80gc00z8z0ks00mrb0l280y8g1tg50ew00wog0gro15cw1a3s163k176o1zmu0h5c0esg0xjo0w5s15cg1bv6163k';

const INFO: number[] = [];
for (let i = 0; i < HEX.length; i += 4) INFO.push(parseInt(HEX.slice(i, i + 4), 36));

export const LUNAR_FIRST_YEAR = 1;
export const LUNAR_LAST_YEAR = 2100;

/** 农历 1-1-1 的公历日序（= 前推格里历公元 1 年 2 月 10 日）—— **字面量**（理由见头注 ①） */
const BASE = -719122;
/** 月名（正…腊）/ 闰月前缀 / 日名（初一…三十）= 固定字面（不随源派生） */
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
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((iso || '').trim());
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
