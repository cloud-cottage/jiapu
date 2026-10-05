#!/usr/bin/env node
/**
 * `frontend/src/business/migration-map.ts` 的**独立验证脚本**（形态照抄 `scripts/verify-geo-frontend.mjs`）：
 * 用 `frontend/node_modules/.bin/esbuild` 把 TS 打成 CJS 再 `require`，喂**真源**
 * `migrate-output/trees/ji_23395_01.json` + `config/tree-meta.json` 的 `ji_23395_01` 条目，
 * 逐项打印 PASS / FAIL 并给出正确 exit code。
 *
 * 口径 = `docs/migration-map.spec.md` §10（世 + 波次分组，`MIG_WAVE_GEN_WINDOW = 0` = 严格一世一波）
 *      + **§17 年份三态**（全有年份 ⇒ 尾波按年份；全无 ⇒ 逐字不变；部分 ⇒ 骨架仍是世代 + 有年份站点附年份）。
 * 黄金用例（本树，逐字）：**恰 4 个波** = ① `[371325]`（起点）② `[230305]`（主居地）
 * ③ `[130302, 231081]`（世 24）④ `[231000, 231025]`（世 25）；`371325` 不在任何波的 `sites` 里。
 * **§17 取证基线（逐字冻结）**：本树与合成样本「全无年份」时的出参 = 改动前实测输出（`BASELINE_*` 常量），
 * 前后逐字相等即证「全无年份 ⇒ 现状逐字不变」（回退底线）。
 *
 * 前置：无（只读真源 + esbuild）。
 * 用法：node scripts/verify-migration-map.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const TS_ENTRY = path.join(REPO, 'frontend', 'src', 'business', 'migration-map.ts');
const ESBUILD = path.join(REPO, 'frontend', 'node_modules', '.bin', 'esbuild');
const TREE_ID = 'ji_23395_01';
const TREE_FILE = path.join(REPO, 'migrate-output', 'trees', `${TREE_ID}.json`);
const META_FILE = path.join(REPO, 'config', 'tree-meta.json');

let checks = 0;
const ok = (msg) => {
  checks += 1;
  console.log(`  ✓ ${msg}`);
};
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
};

// ---- esbuild 就地转译 migration-map.ts → CJS（import 链里无 api.ts ⇒ 无需 import.meta.env 兜底）----
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-migmap-'));
if (!fs.existsSync(ESBUILD)) throw new Error(`找不到 esbuild：${ESBUILD}`);
execFileSync(
  ESBUILD,
  [TS_ENTRY, '--bundle', '--format=cjs', '--platform=node', `--outfile=${path.join(TMP, 'migration-map.cjs')}`],
  { cwd: REPO, stdio: 'pipe' },
);
const { buildMigrationSites, MIG_WAVE_GEN_WINDOW, MIG_YEAR_BASIS, yearBasisOf, siteYearLabel, yearWaveTimeline, yearWaveTitle } =
  await import(pathToFileURL(path.join(TMP, 'migration-map.cjs')).href);

// ---- 真源 → `MigrationInput`（树 JSON 的 origin_code/note → PersonSummary 读形状）----
const tree = JSON.parse(fs.readFileSync(TREE_FILE, 'utf8'));
const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8')).trees[TREE_ID];

const people = Object.entries(tree.people || {}).map(([handle, p]) => {
  const person = { handle, gramps_id: p.gramps_id };
  const bp = p.birth_place;
  if (bp && typeof bp === 'object') {
    person.birth_place_code = bp.origin_code;
    person.birth_place_note = bp.note;
  } else if (typeof bp === 'string') {
    person.birth_place = bp;
  }
  if (Array.isArray(p.residence_places)) {
    person.residence_places = p.residence_places.map((r) => ({
      place: '',
      place_code: r && typeof r === 'object' ? r.origin_code : '',
      place_note: r && typeof r === 'object' ? r.note : '',
    }));
  }
  const dp = p.death_place;
  if (dp && typeof dp === 'object') {
    person.death_place_code = dp.origin_code;
    person.death_place = dp.note;
  } else if (typeof dp === 'string') {
    person.death_place = dp;
  }
  return person;
});
const families = Object.values(tree.families || {}).map((f) => ({
  father_handle: f.father_handle,
  mother_handle: f.mother_handle,
  child_handles: f.child_handles,
}));

const result = buildMigrationSites({
  origin_code: meta.origin_code,
  origin: meta.origin,
  founder_handle: meta.founder_handle,
  founder_gramps_id: meta.founder_gramps_id,
  people,
  families,
});

console.log(`① 真源 ${TREE_ID} → buildMigrationSites（MIG_WAVE_GEN_WINDOW=${MIG_WAVE_GEN_WINDOW}）`);
console.log(`   origin=${JSON.stringify(result.origin)}`);
console.log(`   waves=${JSON.stringify(result.waves)}`);
console.log(`   textOnlyCount=${result.textOnlyCount} unplacedCount=${result.unplacedCount}`);

const codesOf = (w) => w.sites.map((s) => s.code);
const earliest = (s) => (s.gens.length ? s.gens[0] : null);
const byCode = (code) => result.waves.flatMap((w) => w.sites).find((s) => s.code === code);

// ---- 断言（口径 §10；波数 = 起点波 + waves.length = 4）----
const totalWaves = (result.origin ? 1 : 0) + result.waves.length;

// ① 起点 = 371325；恰 4 个波
if (result.origin && result.origin.code === '371325') ok(`起点波 = 371325（${result.origin.display}，${result.origin.count} 人）`);
else fail(`起点波应为 371325，实得 ${JSON.stringify(result.origin)}`);

if (totalWaves === 4 && result.waves.length === 3) ok(`恰 4 个波 = 起点波 1 + waves ${result.waves.length}（按码升序逐波核对如下）`);
else fail(`应恰 4 个波（起点波 1 + waves 3），实得 起点波 ${result.origin ? 1 : 0} + waves ${result.waves.length}`);

// ② 主居地波 = [230305]
const mainWave = result.waves.find((w) => w.key === 'main');
if (mainWave && JSON.stringify(codesOf(mainWave)) === JSON.stringify(['230305'])) ok(`波2 主居地波 = [230305]（${mainWave.sites[0].count} 人）`);
else fail(`波2 主居地波应为 [230305]，实得 ${mainWave ? JSON.stringify(codesOf(mainWave)) : 'null'}`);

// ③ 世 24 波 = [130302, 231081]（按码升序）
const w24 = result.waves.find((w) => w.key === 'gen:24');
if (w24 && JSON.stringify(codesOf(w24)) === JSON.stringify(['130302', '231081'])) ok(`波3 世 24 = [130302, 231081]（按码升序）`);
else fail(`波3（世 24）应为 [130302, 231081]，实得 ${w24 ? JSON.stringify(codesOf(w24)) : 'null'}`);

// ④ 世 25 波 = [231000, 231025]（按码升序）
const w25 = result.waves.find((w) => w.key === 'gen:25');
if (w25 && JSON.stringify(codesOf(w25)) === JSON.stringify(['231000', '231025'])) ok(`波4 世 25 = [231000, 231025]（按码升序）`);
else fail(`波4（世 25）应为 [231000, 231025]，实得 ${w25 ? JSON.stringify(codesOf(w25)) : 'null'}`);

// ⑤ 逐码最早世
for (const [code, gen] of [
  ['130302', 24],
  ['231081', 24],
  ['231000', 25],
  ['231025', 25],
]) {
  const s = byCode(code);
  if (s && earliest(s) === gen) ok(`${code} 最早世 = ${gen}`);
  else fail(`${code} 最早世应为 ${gen}，实得 ${s ? earliest(s) : 'null'}`);
}

// ⑥ 起点码不在任何波的 sites 里
if (!result.waves.some((w) => w.sites.some((s) => s.code === '371325'))) ok('371325 不在任何波的 sites 里（不自环）');
else fail('371325 不得出现在任何波的 sites 里');

// ⑦ 无码记录：>0 且样本含「黑龙江省鸡西市梨树区河西村」
if (result.textOnlyCount > 0 && result.textOnlySamples.includes('黑龙江省鸡西市梨树区河西村')) {
  ok(`无码记录 ${result.textOnlyCount} 条；样本含「黑龙江省鸡西市梨树区河西村」`);
} else {
  fail(`无码记录应 > 0 且样本含「黑龙江省鸡西市梨树区河西村」，实得 count=${result.textOnlyCount} samples=${JSON.stringify(result.textOnlySamples)}`);
}

// ⑧ 无世数者 11 人（BFS 可达 47 / 58）
if (result.unplacedCount === 11) ok(`无世数者 = 11（BFS 可达 47 / 58）`);
else fail(`无世数者应为 11，实得 ${result.unplacedCount}`);

// ============================================================================
//  §17 年份三态（合成样本 · 固定样本回放 + 逐字基线取证）
// ============================================================================
console.log('\n② §17 年份三态（合成样本：起点 + 主居地 + 两尾波）');

/** 改动前实测「全无年份」出参（逐字冻结 · 回退底线）：合成样本 */
const BASELINE_SYNTH_ALLNONE =
  '{"origin":{"code":"371325","display":"山东省临沂市费县","count":1,"gens":[1]},"waves":[{"key":"main","genRange":[2,3],"sites":[{"code":"230305","count":2,"gens":[2,3]}]},{"key":"gen:3","genRange":[3,3],"sites":[{"code":"130302","count":1,"gens":[3]},{"code":"231081","count":1,"gens":[3]}]},{"key":"gen:4","genRange":[4,4],"sites":[{"code":"231000","count":1,"gens":[4]}]}],"textOnlyCount":0,"textOnlySamples":[],"unplacedCount":0}';
/** 改动前实测「全无年份」出参（逐字冻结 · 回退底线）：真源 `ji_23395_01` */
const BASELINE_REAL_ALLNONE =
  '{"origin":{"code":"371325","display":"山东省临沂市费县","count":4,"gens":[1,2,20,21]},"waves":[{"key":"main","genRange":[24,25],"sites":[{"code":"230305","count":3,"gens":[24,25,25]}]},{"key":"gen:24","genRange":[24,24],"sites":[{"code":"130302","count":2,"gens":[24,24]},{"code":"231081","count":1,"gens":[24]}]},{"key":"gen:25","genRange":[25,25],"sites":[{"code":"231000","count":1,"gens":[25]},{"code":"231025","count":1,"gens":[25]}]}],"textOnlyCount":15,"textOnlySamples":["山东省费县","黑龙江省鸡西市梨树区河西村","河北省秦皇岛市","秦皇岛市妇幼保健院"],"unplacedCount":11}';

/** 合成样本（5 人 · 世 1/2/3/3/4）：`y` 为各槽位年份，缺 ⇒ 该条不带 `place_start_year` */
const SYN_FAMILIES = [
  { father_handle: 'H0', child_handles: ['H1'] },
  { father_handle: 'H1', child_handles: ['H2', 'H3'] },
  { father_handle: 'H2', child_handles: ['H4'] },
];
const synRes = (code, year) => (year ? { place_code: code, place_start_year: year } : { place_code: code });
const synth = (y) => ({
  origin_code: '371325',
  origin: '山东省临沂市费县',
  founder_handle: 'H0',
  families: SYN_FAMILIES,
  people: [
    { handle: 'H0', birth_place_code: '371325', residence_places: y.o ? [{ place_code: '371325', place_start_year: y.o }] : [] },
    { handle: 'H1', residence_places: [synRes('230305', y.m1)] },
    { handle: 'H2', residence_places: [synRes('230305', y.m2), synRes('130302', y.a)] },
    { handle: 'H3', residence_places: [synRes('231081', y.b)] },
    { handle: 'H4', residence_places: [synRes('231000', y.c)] },
  ],
});
const waveShape = (r) =>
  r.waves.map((w) => ({ key: w.key, genRange: w.genRange, sites: w.sites.map((s) => ({ code: s.code, count: s.count, gens: s.gens })) }));
const yearAt = (r, code) => {
  if (r.origin && r.origin.code === code) return r.origin.earliestYear ?? null;
  const s = r.waves.flatMap((w) => w.sites).find((x) => x.code === code);
  return s ? s.earliestYear ?? null : null;
};

// ① 全无年份 ⇒ 与改动前逐字一致（回退底线）
const rGen = buildMigrationSites(synth({}));
if (JSON.stringify(rGen) === BASELINE_SYNTH_ALLNONE) ok('§17① 全无年份（合成样本）：输出与改动前逐字一致（固定样本回放）');
else fail(`§17① 全无年份（合成样本）应与改动前逐字一致\n     实得 ${JSON.stringify(rGen)}`);
if (yearBasisOf(rGen) === MIG_YEAR_BASIS.GEN) ok('§17① 全无年份 ⇒ 三态判定 = gen（世代骨架 · MIG_WAVE_GEN_WINDOW=0）');
else fail(`§17① 三态判定应为 gen，实得 ${yearBasisOf(rGen)}`);

// ② 全有年份 ⇒ 尾波按年份（升序 · 同年一批 · 窗口 0）
const rYear = buildMigrationSites(synth({ o: '1900', m1: '1960', m2: '1965', a: '1985', b: '1985', c: '1990' }));
if (yearBasisOf(rYear) === MIG_YEAR_BASIS.YEAR) ok('§17② 全有年份 ⇒ 三态判定 = year（含起点站 371325）');
else fail(`§17② 三态判定应为 year，实得 ${yearBasisOf(rYear)}`);
const yearKeys = rYear.waves.map((w) => w.key);
if (JSON.stringify(yearKeys) === JSON.stringify(['main', 'gen:1985', 'gen:1990']))
  ok('§17② 波次 = [main, gen:1985, gen:1990]（尾波按年份升序 · 同年一批）');
else fail(`§17② 波次应为 [main, gen:1985, gen:1990]，实得 ${JSON.stringify(yearKeys)}`);
const yTail = rYear.waves.filter((w) => w.key.startsWith('gen:')).map((w) => w.key.slice(4));
if (yTail.length && yTail.every((v, k) => k === 0 || yTail[k - 1] < v)) ok(`§17② 尾波年份严格升序：${yTail.join(' < ')}`);
else fail(`§17② 尾波年份应严格升序，实得 ${yTail.join(',')}`);
const b1985 = rYear.waves.find((w) => w.key === 'gen:1985');
if (b1985 && JSON.stringify(b1985.sites.map((s) => s.code)) === JSON.stringify(['130302', '231081']))
  ok('§17② 同年（1985）同批：[130302, 231081]（未引入 MIG_YEAR_WINDOW · 窗口 = 0）');
else fail(`§17② 1985 波应为 [130302, 231081]，实得 ${b1985 ? JSON.stringify(b1985.sites.map((s) => s.code)) : 'null'}`);
if (rYear.origin && rYear.origin.earliestYear === '1900' && rYear.waves[0] && rYear.waves[0].key === 'main')
  ok('§17② 起点波（earliestYear=1900）与主居地波（main）保留不动');
else fail(`§17② 起点 / 主居地结构不符，实得 origin=${JSON.stringify(rYear.origin)} waves[0]=${rYear.waves[0] ? rYear.waves[0].key : 'null'}`);
for (const [code, year] of [['230305', '1960'], ['130302', '1985'], ['231081', '1985'], ['231000', '1990']]) {
  if (yearAt(rYear, code) === year) ok(`§17② ${code} earliestYear = ${year}（居住地取最小值）`);
  else fail(`§17② ${code} earliestYear 应为 ${year}，实得 ${yearAt(rYear, code)}`);
}

// ③ 部分有年份 ⇒ 骨架仍是世代（波次逐字不变）+ 仅有年份站点附年份
const rMixed = buildMigrationSites(synth({ a: '1985', c: '1990' }));
if (yearBasisOf(rMixed) === MIG_YEAR_BASIS.MIXED) ok('§17③ 部分有年份 ⇒ 三态判定 = mixed');
else fail(`§17③ 三态判定应为 mixed，实得 ${yearBasisOf(rMixed)}`);
if (JSON.stringify(waveShape(rMixed)) === JSON.stringify(waveShape(rGen)))
  ok('§17③ 分波与「全无年份」骨架逐字一致（key / genRange / code / count / gens 全同）');
else fail(`§17③ 分波应与全无年份骨架逐字一致\n     gen=${JSON.stringify(waveShape(rGen))}\n     mixed=${JSON.stringify(waveShape(rMixed))}`);
const mixedYearCodes = rMixed.waves.flatMap((w) => w.sites).filter((s) => s.earliestYear).map((s) => s.code);
if (JSON.stringify(mixedYearCodes) === JSON.stringify(['130302', '231000']))
  ok('§17③ 仅「有年份的站点」带 earliestYear：[130302(1985), 231000(1990)]');
else fail(`§17③ 带年份站点应为 [130302, 231000]，实得 ${JSON.stringify(mixedYearCodes)}`);
if (yearAt(rMixed, '230305') === null && yearAt(rMixed, '371325') === null)
  ok('§17③ 无年份站点（230305 主居地 / 起点 371325）不带 earliestYear（逐字不变）');
else fail(`§17③ 无年份站点不应带 earliestYear（230305=${yearAt(rMixed, '230305')} 371325=${yearAt(rMixed, '371325')}）`);

// ④ 单点文案（标签 / 时间轴展示位 / 三态枚举）
if (siteYearLabel('梨树区', '1960') === '梨树区 · 1960 年起' && siteYearLabel('梨树区', null) === '梨树区')
  ok('§17④ siteYearLabel：追加「 · <year> 年起」；无年份 ⇒ 原样（单点）');
else fail('§17④ siteYearLabel 文案不符');
if (yearWaveTimeline('1985', 2) === '1985年 · 再分迁 · 2 处' && yearWaveTitle('1985') === '1985年 · 再分迁')
  ok('§17④ 时间轴展示位 = 「1985年 · 再分迁 · 2 处」（把「第N世」换成「<year>年」）');
else fail('§17④ 时间轴展示位文案不符');
if (MIG_YEAR_BASIS.GEN === 'gen' && MIG_YEAR_BASIS.YEAR === 'year' && MIG_YEAR_BASIS.MIXED === 'mixed')
  ok('§17④ MIG_YEAR_BASIS = { gen, year, mixed }');
else fail('§17④ MIG_YEAR_BASIS 取值不符');

// ⑤ 真源（本树 · 全无年份）⇒ 与改动前逐字一致
if (JSON.stringify(result) === BASELINE_REAL_ALLNONE) ok(`§17⑤ 真源 ${TREE_ID}（无年份）输出与改动前逐字一致`);
else fail(`§17⑤ 真源输出应与改动前逐字一致\n     实得 ${JSON.stringify(result)}`);
if (yearBasisOf(result) === MIG_YEAR_BASIS.GEN) ok(`§17⑤ 真源 ${TREE_ID} 三态判定 = gen（现状逐字不变）`);
else fail(`§17⑤ 真源三态判定应为 gen，实得 ${yearBasisOf(result)}`);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${process.exitCode ? '❌ 有断言失败' : '✅ 全部通过'}：${checks} 项检查`);
