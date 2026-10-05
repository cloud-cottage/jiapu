#!/usr/bin/env node
/**
 * `frontend/src/business/migration-map.ts` 的**独立验证脚本**（形态照抄 `scripts/verify-geo-frontend.mjs`）：
 * 用 `frontend/node_modules/.bin/esbuild` 把 TS 打成 CJS 再 `require`，喂**真源**
 * `migrate-output/trees/ji_23395_01.json` + `config/tree-meta.json` 的 `ji_23395_01` 条目，
 * 逐项打印 PASS / FAIL 并给出正确 exit code。
 *
 * 口径 = `docs/migration-map.spec.md` §10（世 + 波次分组，`MIG_WAVE_GEN_WINDOW = 0` = 严格一世一波）。
 * 黄金用例（本树，逐字）：**恰 4 个波** = ① `[371325]`（起点）② `[230305]`（主居地）
 * ③ `[130302, 231081]`（世 24）④ `[231000, 231025]`（世 25）；`371325` 不在任何波的 `sites` 里。
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
const { buildMigrationSites, MIG_WAVE_GEN_WINDOW } = await import(pathToFileURL(path.join(TMP, 'migration-map.cjs')).href);

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

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${process.exitCode ? '❌ 有断言失败' : '✅ 全部通过'}：${checks} 项检查`);
