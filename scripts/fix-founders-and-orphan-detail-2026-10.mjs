#!/usr/bin/env node
/**
 * 一次性数据手术 · 2026-10-03：① 清理 1 个孤儿详情档；② 给两棵家族树补始祖登记。
 *
 * ── A · 孤儿详情档 ────────────────────────────────────────────────────────────
 *   对象：`migrate-output/details/shen_27784_01:103f95b875d632a1f5c64098dc0d.json`
 *   （`_id` 同文件名；内容 = `I0003`「季清昆」、生 1981-07-31、含一条 kevin@kevinji.com 的
 *   Event 与一条媒体）。该 handle **在任何树中都不存在** ⇒ 纯孤儿档（陈旧，非「节点缺失」）。
 *   动作：先 `cp -a` 到备份 `deleted-source-details/`（带 md5 复核）→ 再删除。
 *   **不得**补节点、不得动其它详情档。
 *
 * ── B · 补始祖登记（`liu_21016_01` 刘氏安达家族 / `shen_27784_01` 沈氏临沂家族）──────
 *   现状：树 JSON 无 `founder_gramps_id`、tree-meta 无 `founder_handle`/`founder_gramps_id`/
 *   `founder_name` ⇒ `resolveFounderHandle` 恒空 ⇒ `canFounderAttach` / `canFounderReset`
 *   均假（界面既无「⛩ 认祖」也无「🔁 重置始祖」，死锁）。
 *   始祖**用证据算**，不得猜：
 *     ① 枚举本树「非镜像根」= `parent_family` 为空 ∧ 不在任何 family 的 child 里 ∧
 *        `external_mirror !== 'true'`；
 *     ② 对每个候选算「沿 family 的 father/mother → child 闭包」；
 *     ③ 与「本树全部**非镜像**节点集」求交 ⇒ 覆盖率。
 *   **硬门槛：仅覆盖率 = 100% 的候选可入选**；多候选取「闭包最大、且 id/位次最靠前」为
 *   确定性 tie-break 并报出。**无 100% 候选 ⇒ exit 1、零写**，报告列出各候选的遗漏节点
 *   （前端以 `founderGrampsId` 为唯一根渲染，选错根会把节点藏起来）。
 *   写入：树 JSON 仅新增 `founder_gramps_id`（插在 `tree_id` 之后，与 `createTree` 同形；
 *   其余键一字不改、people/families 不动、version 不动）；tree-meta 该树条目仅新增
 *   `founder_handle` / `founder_gramps_id` / `founder_name`（其余字段一字不改）。
 *   **不写** `founder_state`、**不建**镜像节点、**不碰**祖谱。
 *
 * 幂等：重跑（已就位）报「已就位 · 0 改动」，全部受管文件 md5 恒等。
 *
 * 用法：
 *   node scripts/fix-founders-and-orphan-detail-2026-10.mjs                         # dry-run（默认）
 *   node scripts/fix-founders-and-orphan-detail-2026-10.mjs --apply                 # 写盘
 *   node scripts/fix-founders-and-orphan-detail-2026-10.mjs --apply --backup-dir=<dir>
 *   COMPAT_OUT_DIR=<dir> COMPAT_META_FILE=<dir>/tree-meta.json \
 *     node scripts/fix-founders-and-orphan-detail-2026-10.mjs [--apply]              # 副本演练
 *   node scripts/fix-founders-and-orphan-detail-2026-10.mjs --json=<path>            # 另存摘要
 *
 * 目标文件解析顺序（与 `lib/store.js` 同序）：`COMPAT_META_FILE` > `COMPAT_OUT_DIR/tree-meta.json` > 真源。
 * 退出码：0 = dry-run 完成 / 写入成功 / 无需写入；1 = 前置复核 / 始祖认定 / 写后自校验失败（**绝不猜**）；
 *         2 = 用法错误 / 目标缺失。
 *
 * ⚠️ 运维纪律：树 JSON / tree-meta 无磁盘指纹（`lib/store.js` 的进程内 `treeCache` / `metaCache`），
 *    外部改真源后必须重启 compat-api，否则长驻实例会把命中缓存的旧快照整份回写覆盖新真源。
 *    ⇒ **真源 `--apply` 前须先停 3100**（面板 `POST :5555/api/stop {"sid":"jiazu-api"}`），**apply 后重启**。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ---- 参数 ----
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
if (flag('--help') || flag('-h')) {
  console.log('用法：node scripts/fix-founders-and-orphan-detail-2026-10.mjs [--apply] [--backup-dir=<dir>] [--json=<path>]');
  process.exit(0);
}
const KNOWN = new Set(['--apply', '--dry-run']);
const unknown = argv.filter((a) => !KNOWN.has(a) && !a.startsWith('--json=') && !a.startsWith('--backup-dir='));
if (unknown.length) {
  console.error(`❌ 未知参数：${unknown.join(' ')}（仅支持 --apply / --dry-run / --backup-dir=<dir> / --json=<path>）`);
  process.exit(2);
}
const APPLY = flag('--apply');
const jsonArg = argv.find((a) => a.startsWith('--json='));
const JSON_OUT = jsonArg ? path.resolve(jsonArg.slice('--json='.length)) : '';
const bakDirArg = argv.find((a) => a.startsWith('--backup-dir='));
const BAK_DIR_ARG = bakDirArg ? path.resolve(bakDirArg.slice('--backup-dir='.length)) : '';

// ---- 目标文件解析（与 lib/store.js 同序）----
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_CONFIG = path.join(REPO, 'config');
const REAL_META = path.join(REAL_CONFIG, 'tree-meta.json');
const OUT_DIR = process.env.COMPAT_OUT_DIR ? path.resolve(process.env.COMPAT_OUT_DIR) : REAL_OUT;
const TREES_DIR = path.join(OUT_DIR, 'trees');
const DETAILS_DIR = path.join(OUT_DIR, 'details');
const META_FILE = process.env.COMPAT_META_FILE
  ? path.resolve(process.env.COMPAT_META_FILE)
  : process.env.COMPAT_OUT_DIR
    ? path.join(OUT_DIR, 'tree-meta.json')
    : REAL_META;
const IS_COPY = path.resolve(OUT_DIR) !== path.resolve(REAL_OUT);
const IS_META_COPY = path.resolve(META_FILE) !== path.resolve(REAL_META);
const ROOT = IS_COPY ? path.dirname(OUT_DIR) : REPO;
const SOURCE_ROOT = IS_COPY ? path.dirname(OUT_DIR) : REPO;

// ---- 本单常量 ----
const TREES = ['liu_21016_01', 'shen_27784_01'];
const ORPHAN = {
  tree_id: 'shen_27784_01',
  handle: '103f95b875d632a1f5c64098dc0d',
  gramps_id: 'I0003',
  name: '季清昆',
  file: 'shen_27784_01:103f95b875d632a1f5c64098dc0d.json',
};
const MIRROR_ON = (p) => String(p?.external_mirror ?? '') === 'true';

// ---- 工具 ----
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const md5text = (t) => crypto.createHash('md5').update(t).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const treeFile = (id) => path.join(TREES_DIR, `${id}.json`);
const detailFile = (treeId, handle) => path.join(DETAILS_DIR, `${treeId}:${handle}.json`);
function aggregateMd5(outDir, configDir) {
  const files = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(outDir);
  walk(configDir);
  files.sort();
  const h = crypto.createHash('md5');
  for (const f of files) h.update(crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex'));
  return { digest: h.digest('hex'), count: files.length };
}
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const errors = [];
const checks = [];
const notes = [];
const err = (m) => errors.push(m);
const ok = (m) => checks.push(`✅ ${m}`);
const note = (m) => notes.push(m);

// ================= 前置：目标存在性 =================
for (const [p, label] of [[TREES_DIR, '树目录'], [DETAILS_DIR, '详情目录'], [META_FILE, 'tree-meta']]) {
  if (!fs.existsSync(p)) {
    console.error(`❌ 找不到${label}：${p}`);
    process.exit(2);
  }
}
for (const t of TREES) {
  if (!fs.existsSync(treeFile(t))) {
    console.error(`❌ 找不到目标树 JSON：${treeFile(t)}`);
    process.exit(2);
  }
}

const now = new Date().toISOString();
const metaTextBefore = fs.readFileSync(META_FILE, 'utf8');
const meta = JSON.parse(metaTextBefore);
const metaBeforeMd5 = md5(META_FILE);
const aggBefore = aggregateMd5(REAL_OUT, REAL_CONFIG);

// ================= 始祖认定（A：纯只读计算）=================
/**
 * 枚举非镜像根 + 闭包覆盖。
 * @returns {{roots:Array, eligible:Array, selected:object|null, perCandidate:Array}}
 */
function analyzeFounder(tree) {
  const people = tree.people || {};
  const families = tree.families || {};
  const handles = Object.keys(people);
  const idxOf = new Map(handles.map((h, i) => [h, i]));
  const childrenOf = new Set();
  const edges = new Map(); // parent -> Set(child)
  const addEdge = (par, c) => {
    if (!par) return;
    if (!edges.has(par)) edges.set(par, new Set());
    edges.get(par).add(c);
  };
  for (const fam of Object.values(families)) {
    const kids = fam?.child_handles || [];
    for (const c of kids) childrenOf.add(c);
    for (const c of kids) {
      addEdge(fam?.father_handle, c);
      addEdge(fam?.mother_handle, c);
    }
  }
  const nonMirror = new Set(handles.filter((h) => !MIRROR_ON(people[h])));
  const roots = handles.filter(
    (h) => !people[h]?.parent_family && !childrenOf.has(h) && !MIRROR_ON(people[h]),
  );
  const perCandidate = [];
  for (const r of roots) {
    const seen = new Set();
    const stack = [r];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      for (const c of edges.get(x) || []) if (!seen.has(c)) stack.push(c);
    }
    const missing = [...nonMirror].filter((h) => !seen.has(h));
    const covered = [...seen].filter((h) => nonMirror.has(h)).length;
    perCandidate.push({
      handle: r,
      gramps_id: String(people[r]?.gramps_id || ''),
      name: String(people[r]?.name || ''),
      closureSize: seen.size,
      covered,
      total: nonMirror.size,
      coveragePct: nonMirror.size ? (covered / nonMirror.size) * 100 : 0,
      missing: missing.map((h) => ({ handle: h, gramps_id: String(people[h]?.gramps_id || ''), name: String(people[h]?.name || '') })),
      peopleIndex: idxOf.get(r) ?? Number.MAX_SAFE_INTEGER,
    });
  }
  const eligible = perCandidate.filter((c) => c.missing.length === 0);
  eligible.sort((a, b) =>
    (b.closureSize - a.closureSize) ||
    (a.peopleIndex - b.peopleIndex) ||
    (a.gramps_id < b.gramps_id ? -1 : a.gramps_id > b.gramps_id ? 1 : 0) ||
    (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0));
  return { roots, eligible, selected: eligible[0] || null, perCandidate, nonMirrorCount: nonMirror.size, mirrorCount: handles.length - nonMirror.size };
}

const founderPlan = [];
for (const tid of TREES) {
  const treePath = treeFile(tid);
  const tree = readJson(treePath);
  const entryKey = Object.keys(meta.trees || {}).find((k) => meta.trees[k]?.tree_id === tid) || (meta.trees?.[tid] ? tid : '');
  if (!entryKey) err(`tree-meta 缺该树条目：${tid}`);
  const entry = entryKey ? meta.trees[entryKey] : null;
  const analysis = analyzeFounder(tree);
  const rec = { tid, treePath, tree, entryKey, entry, analysis, selected: analysis.selected };
  founderPlan.push(rec);
  if (!analysis.selected) {
    // 硬门槛：无 100% 候选 ⇒ exit 1 零写
    const lines = analysis.perCandidate.length
      ? analysis.perCandidate.map((c) => `候选 ${c.gramps_id} ${c.name}（handle=${c.handle}）覆盖 ${c.covered}/${c.total}，遗漏：${c.missing.map((m) => `${m.gramps_id} ${m.name}`).join('、') || '—'}`)
      : ['（本树无任何非镜像根节点）'];
    err(`【始祖认定失败】${tid}：无任何候选「闭包覆盖 = 100% 非镜像节点」⇒ 拒绝写入。\n      ${lines.join('\n      ')}`);
  }
}

// ================= A · 孤儿详情档：状态与前置复核 =================
const orphanAbs = path.join(DETAILS_DIR, ORPHAN.file);
const orphanExists = fs.existsSync(orphanAbs);
let orphanDetail = null;
let orphanRefs = null;
if (orphanExists) {
  try {
    orphanDetail = readJson(orphanAbs);
  } catch (e) {
    err(`孤儿档 JSON 解析失败：${ORPHAN.file} — ${e.message}`);
  }
  if (orphanDetail) {
    if (String(orphanDetail._id || '') !== `${ORPHAN.tree_id}:${ORPHAN.handle}`) err(`孤儿档 _id 不符：期望 ${ORPHAN.tree_id}:${ORPHAN.handle} 实为 ${orphanDetail._id}`);
    if (String(orphanDetail.tree_id || '') !== ORPHAN.tree_id) err(`孤儿档 tree_id 不符：${orphanDetail.tree_id}`);
    if (String(orphanDetail.handle || '') !== ORPHAN.handle) err(`孤儿档 handle 不符：${orphanDetail.handle}`);
    if (String(orphanDetail.gramps_id || '') !== ORPHAN.gramps_id) err(`孤儿档 gramps_id 不符：${orphanDetail.gramps_id}`);
    if (String(orphanDetail.name || '') !== ORPHAN.name) err(`孤儿档 name 不符：${orphanDetail.name}`);
  }
  // 零引用复核（全站）：people / family 槽位 / external_* / tree-meta founder|master
  const refs = [];
  const addRef = (cond, where) => { if (cond) refs.push(where); };
  for (const f of fs.readdirSync(TREES_DIR).filter((x) => x.endsWith('.json'))) {
    let ot;
    try { ot = readJson(path.join(TREES_DIR, f)); } catch { continue; }
    const tid = ot.tree_id || f.replace(/\.json$/, '');
    addRef(!!(ot.people || {})[ORPHAN.handle], `${tid}:people[${ORPHAN.handle}]`);
    for (const [fh, fam] of Object.entries(ot.families || {})) {
      addRef(fam?.father_handle === ORPHAN.handle, `${tid}:families[${fh}].father_handle`);
      addRef(fam?.mother_handle === ORPHAN.handle, `${tid}:families[${fh}].mother_handle`);
      if ((fam?.child_handles || []).includes(ORPHAN.handle)) refs.push(`${tid}:families[${fh}].child_handles`);
    }
    for (const [h, p] of Object.entries(ot.people || {})) {
      addRef(p?.external_person_handle === ORPHAN.handle, `${tid}:people[${h}].external_person_handle`);
      addRef(p?.external_founder_handle === ORPHAN.handle, `${tid}:people[${h}].external_founder_handle`);
    }
  }
  for (const [tk, tv] of Object.entries(meta.trees || {})) {
    addRef(tv?.founder_handle === ORPHAN.handle, `tree-meta.trees[${tk}].founder_handle`);
    addRef(tv?.master_handle === ORPHAN.handle, `tree-meta.trees[${tk}].master_handle`);
  }
  orphanRefs = refs;
  if (refs.length) err(`孤儿档 handle 仍被引用（不得删）：${ORPHAN.handle} ← ${refs.join(', ')}`);
}

if (orphanExists && !errors.some((e) => e.startsWith('孤儿'))) {
  ok(`孤儿档复核通过：handle ${ORPHAN.handle} 在任何树 / family 槽位 / external_* / tree-meta 中均不存在 ⇒ 纯孤儿档`);
}
if (!orphanExists) note(`孤儿档已不在（已清理态）`);

if (errors.length) {
  for (const e of errors) console.error(`  ❌ ${e}`);
  console.error('❌ 前置复核 / 始祖认定失败，**未写入 / 未删除任何文件**（退出码 1）。');
  process.exit(1);
}

// ================= 计划 =================
const filePlan = new Map(); // abs -> { abs, rel, kind, before, afterText, after, note }
function planFile(abs, kind, afterText, noteTxt) {
  const rel = path.relative(ROOT, abs);
  const existsReal = fs.existsSync(abs);
  filePlan.set(abs, { abs, rel, kind, exists: existsReal, before: existsReal ? md5(abs) : '', afterText, after: md5text(afterText), note: noteTxt });
}

const changes = [];
const conflicts = [];

for (const rec of founderPlan) {
  const { tid, tree, entry, entryKey, selected } = rec;
  // 树 JSON：仅新增 founder_gramps_id
  const want = String(selected.gramps_id);
  const current = String(tree.founder_gramps_id ?? '');
  const treeOrder = Object.keys(tree);
  const hasKey = treeOrder.includes('founder_gramps_id');
  if (hasKey && current !== want) {
    conflicts.push(`${tid} 树 JSON 已有 founder_gramps_id=${current}，与本单认定 ${want} 冲突`);
  } else if (hasKey && current === want) {
    rec.treeChange = null;
    note(`${tid} 树 JSON 已有 founder_gramps_id=${want}（一致，无需改）`);
  } else {
    const next = {};
    for (const [k, v] of Object.entries(tree)) {
      next[k] = v;
      if (k === 'tree_id') next.founder_gramps_id = want;
    }
    if (!('founder_gramps_id' in next)) next.founder_gramps_id = want;
    rec.treeChange = next;
    const afterText = JSON.stringify(next, null, 2); // 无末尾换行 —— 与真源同形
    planFile(rec.treePath, 'tree', afterText, `${tid}：新增 founder_gramps_id=${want}（插在 tree_id 后；其余键不动）`);
    changes.push({ kind: `(B) ${tid} 树 JSON 新增 founder_gramps_id=${want}`, file: path.relative(ROOT, rec.treePath) });
  }
  // tree-meta：仅新增 3 字段
  const need = {
    founder_handle: String(selected.handle),
    founder_gramps_id: want,
    founder_name: String(selected.name),
  };
  const conflictFields = [];
  for (const k of Object.keys(need)) {
    const cur = String(entry?.[k] ?? '');
    if (cur !== '' && cur !== need[k]) conflictFields.push(`${k}（现 ${cur} ≠ 目标 ${need[k]}）`);
  }
  if (conflictFields.length) {
    conflicts.push(`${tid} tree-meta 已有冲突字段：${conflictFields.join('；')}`);
  } else if (String(entry?.founder_handle || '') === need.founder_handle &&
             String(entry?.founder_gramps_id || '') === need.founder_gramps_id &&
             String(entry?.founder_name || '') === need.founder_name) {
    rec.metaChange = null;
    note(`${tid} tree-meta 已有 3 字段（一致，无需改）`);
  } else {
    const nextEntry = { ...entry, ...need }; // 保留原键序，仅追加 3 个新键
    rec.metaChange = { entryKey, nextEntry };
  }
}

if (conflicts.length) {
  for (const c of conflicts) console.error(`  ❌ ${c}`);
  console.error('❌ 真源已存在不一致的始祖字段，**拒绝覆盖**（退出码 1，零写）。');
  process.exit(1);
}

// 汇总 tree-meta 变更（若任一树需改则一次性重写 meta）
const metaChanges = founderPlan.filter((r) => r.metaChange);
let metaNextText = null;
if (metaChanges.length) {
  const nextTrees = { ...meta.trees };
  for (const r of metaChanges) nextTrees[r.metaChange.entryKey] = r.metaChange.nextEntry;
  const nextMeta = { ...meta, trees: nextTrees };
  metaNextText = JSON.stringify(nextMeta, null, 2) + '\n'; // 真源带末尾换行
  planFile(META_FILE, 'meta', metaNextText, `tree-meta：为 ${metaChanges.map((r) => r.tid).join(' / ')} 各新增 founder_handle/founder_gramps_id/founder_name（其余字段一字不改）`);
  changes.push({ kind: `(B) tree-meta 补 ${metaChanges.length} 棵树的始祖登记（3 字段/树）`, file: path.relative(ROOT, META_FILE) });
}

// 待删
const deletePlan = [];
if (orphanExists) {
  deletePlan.push({ abs: orphanAbs, rel: path.relative(ROOT, orphanAbs), md5: md5(orphanAbs), handle: ORPHAN.handle, gramps_id: ORPHAN.gramps_id });
  changes.push({ kind: `(A) 删 1 个孤儿详情档（删前副本 + md5 落备份 deleted-source-details/）`, file: path.relative(ROOT, DETAILS_DIR) });
}

const NOTHING_TO_DO = !filePlan.size && !deletePlan.length;

// ================= 打印 =================
console.log('═'.repeat(120));
console.log('补始祖登记 + 清理孤儿详情档 —— scripts/fix-founders-and-orphan-detail-2026-10.mjs');
console.log(`树目录   ：${TREES_DIR}${IS_COPY ? '（副本演练）' : '（★真源★）'}`);
console.log(`详情目录 ：${DETAILS_DIR}${IS_COPY ? '（副本）' : '（★真源★）'}`);
console.log(`tree-meta：${META_FILE}${IS_META_COPY ? '（副本）' : '（★真源★）'}  md5(前)=${metaBeforeMd5}`);
console.log(`模式     ：${APPLY ? '--apply（写盘）' : 'dry-run（不写盘）'}`);
console.log('═'.repeat(120));

console.log('\n【始祖候选枚举与覆盖读数】（闭包 = 沿 family 的 father/mother → child 向下；覆盖率 = 闭包 ∩ 非镜像节点集 / 非镜像节点集）');
for (const rec of founderPlan) {
  const a = rec.analysis;
  console.log(`\n▸ ${rec.tid}  people=${Object.keys(rec.tree.people || {}).length}  families=${Object.keys(rec.tree.families || {}).length}  非镜像=${a.nonMirrorCount}  镜像=${a.mirrorCount}`);
  if (!a.perCandidate.length) { console.log('   （无非镜像根候选）'); continue; }
  for (const c of a.perCandidate) {
    const mark = c.missing.length === 0 ? '✅ 100%' : `❌ ${c.coveragePct.toFixed(1)}%`;
    console.log(`   ${mark}  候选 ${c.gramps_id} ${c.name}  handle=${c.handle}  闭包=${c.closureSize}  覆盖=${c.covered}/${c.total}`);
    if (c.missing.length) console.log(`        遗漏：${c.missing.map((m) => `${m.gramps_id} ${m.name}`).join('、')}`);
  }
  const sel = rec.selected;
  const tie = a.eligible.length > 1 ? `（在 ${a.eligible.length} 个 100% 候选中按「闭包最大、id/位次最靠前」选定）` : '（唯一 100% 候选）';
  console.log(`   ⇒ 选定始祖：${sel.gramps_id} ${sel.name}  handle=${sel.handle} ${tie}`);
}

for (const m of checks) console.log(`  ${m}`);
for (const n of notes) console.log(`  · ${n}`);

if (NOTHING_TO_DO) {
  console.log('\n✅ 目标形态已就位（孤儿档已清 / 两树始祖登记已在）：**已就位 · 0 改动**，全部文件一个字节未改。');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(buildSummary({ applied: false, backupDir: '', state: '已就位', aggAfter: aggBefore }), null, 2) + '\n', 'utf8');
  process.exit(0);
}

console.log('\n变更清单：');
for (const ch of changes) console.log(`  ▸ ${ch.kind}  →  ${ch.file}`);
console.log('\n文件级 md5（前 → 后，预算）：');
for (const f of filePlan.values()) console.log(`  ${String(f.kind).padEnd(6)}${f.rel.padEnd(52)}${f.exists ? f.before : '<不存在>'} → ${f.after}`);
if (deletePlan.length) {
  console.log('待删文件（删前先落备份 deleted-source-details/ + md5 清单）：');
  for (const d of deletePlan) console.log(`  delete${' '.repeat(2)}${d.rel.padEnd(52)}md5=${d.md5}`);
}

// ---- dry-run：证明零写入 ----
if (!APPLY) {
  const drift = [...filePlan.values()].filter((f) => f.exists && md5(f.abs) !== f.before);
  const delDrift = deletePlan.filter((d) => !fs.existsSync(d.abs) || md5(d.abs) !== d.md5);
  const aggNow = aggregateMd5(REAL_OUT, REAL_CONFIG);
  console.log(`\n待写文件现盘 md5 复算：${drift.length === 0 ? `全部与「前」一致（${filePlan.size} 个文件，零写入 ✅）` : `⚠️ ${drift.length} 个已变`}`);
  console.log(`待删文件现盘复核：${delDrift.length === 0 ? `全部仍在且 md5 一致（${deletePlan.length} 个文件，零删除 ✅）` : `⚠️ ${delDrift.length} 个已变/已缺`}`);
  console.log(`聚合 md5（migrate-output+config 前/后）= ${aggBefore.digest} / ${aggNow.digest}（${aggBefore.count} 个文件）  ${aggNow.digest === aggBefore.digest ? '未写盘 ✅' : '⚠️ 已变'}`);
  console.log('（dry-run，未写盘、未删文件。加 --apply 才真正写入并连带删除孤儿详情档。）');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(buildSummary({ applied: false, backupDir: '', state: 'dry-run', aggAfter: aggNow.digest }), null, 2) + '\n', 'utf8');
  process.exit(0);
}

// ================= 写入 =================
const stamp = new Date().toISOString().slice(0, 10);
let bakDir;
if (BAK_DIR_ARG) {
  bakDir = BAK_DIR_ARG;
} else {
  bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-founders-and-orphan-detail${IS_COPY ? '-copy' : ''}`);
  for (let i = 2; fs.existsSync(bakDir); i += 1) {
    bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-founders-and-orphan-detail${IS_COPY ? '-copy' : ''}-${i}`);
  }
}
fs.mkdirSync(bakDir, { recursive: true });

// 全量备份 migrate-output/ + config/
copyDir(OUT_DIR, path.join(bakDir, 'migrate-output'));
const META_DIR = path.dirname(META_FILE);
if (path.resolve(META_DIR) !== path.resolve(OUT_DIR)) copyDir(META_DIR, path.join(bakDir, 'config'));
/** 受管文件的备份落点（manifest / 回滚 / 自校验共用） */
const bakDestOf = (abs) => {
  if (path.resolve(abs).startsWith(path.resolve(OUT_DIR) + path.sep)) {
    return path.join(bakDir, 'migrate-output', path.relative(OUT_DIR, abs));
  }
  return path.join(bakDir, 'config', path.basename(abs));
};
const manifest = [];
const rollback = [];
for (const f of filePlan.values()) {
  const dest = bakDestOf(f.abs);
  if (f.exists) {
    if (!fs.existsSync(dest) || md5(dest) !== f.before) {
      console.log(`\n❌ 备份副本缺失/不符：${f.rel}（退出码 1）。`);
      process.exit(1);
    }
    manifest.push(`${f.before}  ${f.rel}  →  ${path.relative(bakDir, dest)}`);
  } else {
    manifest.push(`<不存在，无需备份>  ${f.rel}`);
  }
  rollback.push(`cp ${dest} ${f.abs}`);
}
// 被删详情：先落备份副本 + md5
const deletedManifest = [];
let delDir = '';
if (deletePlan.length) {
  delDir = path.join(bakDir, 'deleted-source-details');
  fs.mkdirSync(delDir, { recursive: true });
  for (const d of deletePlan) {
    const dest = path.join(delDir, path.basename(d.abs));
    fs.copyFileSync(d.abs, dest);
    const destMd5 = md5(dest);
    if (destMd5 !== d.md5) {
      console.log(`\n❌ 备份副本 md5 不符（不删）：${d.rel} 源=${d.md5} 副本=${destMd5}（退出码 1）。`);
      process.exit(1);
    }
    deletedManifest.push(`${d.md5}  ${d.rel}  →  deleted-source-details/${path.basename(d.abs)}  副本md5=${destMd5}`);
    rollback.push(`cp ${dest} ${d.abs}   # 恢复被删详情`);
  }
  fs.writeFileSync(path.join(delDir, 'md5.txt'), deletedManifest.join('\n') + '\n', 'utf8');
}

// 写文件
let written = 0;
for (const f of filePlan.values()) { fs.writeFileSync(f.abs, f.afterText, 'utf8'); written += 1; }

// 写后自校验
let bad = 0;
console.log('\n写后自校验：');
for (const f of filePlan.values()) {
  const after = fs.existsSync(f.abs) ? md5(f.abs) : '';
  const okOne = after === f.after;
  if (!okOne) bad += 1;
  console.log(`  ${okOne ? '✅' : '⚠️'} ${f.rel.padEnd(52)}md5 ${f.before || '<不存在>'} → ${after}  （预算 ${f.after}）`);
  try { JSON.parse(fs.readFileSync(f.abs, 'utf8')); } catch (e) { bad += 1; console.log(`  ❌ JSON.parse 失败：${f.rel} — ${e.message}`); }
}

// 删孤儿档
let deleted = 0;
if (deletePlan.length) {
  console.log('\n孤儿详情档删除（备份已就位 → 删除 → 复核）：');
  for (const d of deletePlan) {
    fs.unlinkSync(d.abs);
    const gone = !fs.existsSync(d.abs);
    if (!gone) bad += 1;
    const copyOk = md5(path.join(delDir, path.basename(d.abs))) === d.md5;
    if (!copyOk) bad += 1;
    deleted += 1;
    console.log(`  ${gone && copyOk ? '✅' : '⚠️'} 已删 ${d.rel}（原 md5=${d.md5}；备份副本 ${copyOk ? 'md5 一致' : 'md5 不符'}）`);
  }
}

// ---- 不变量复核 ----
console.log('\n不变量复核（目标形态）：');
const verdict = [];
function vcheck(label, cond) { verdict.push({ label, pass: !!cond }); if (!cond) bad += 1; console.log(`  ${cond ? '✅' : '❌'} ${label}`); }

for (const rec of founderPlan) {
  const tAfter = readJson(rec.treePath);
  const tBefore = rec.tree;
  vcheck(`${rec.tid} ① 树 JSON founder_gramps_id = 认定值 ${rec.selected.gramps_id}`,
    String(tAfter.founder_gramps_id || '') === String(rec.selected.gramps_id));
  vcheck(`${rec.tid} ② people/families 计数不变（${Object.keys(tBefore.people || {}).length}/${Object.keys(tBefore.families || {}).length}）`,
    Object.keys(tAfter.people || {}).length === Object.keys(tBefore.people || {}).length &&
    Object.keys(tAfter.families || {}).length === Object.keys(tBefore.families || {}).length);
  vcheck(`${rec.tid} ③ people + families 逐字节不变`,
    JSON.stringify(tAfter.people) === JSON.stringify(tBefore.people) &&
    JSON.stringify(tAfter.families) === JSON.stringify(tBefore.families));
  const extraKeys = Object.keys(tAfter).filter((k) => !['founder_gramps_id', ...Object.keys(tBefore)].includes(k));
  const lostKeys = Object.keys(tBefore).filter((k) => !(k in tAfter));
  vcheck(`${rec.tid} ④ 未新增其它键、未丢键（新增键集合 = {founder_gramps_id}${extraKeys.length ? '，实际多出：' + extraKeys.join(',') : ''}）`,
    extraKeys.length === 0 && lostKeys.length === 0);
  vcheck(`${rec.tid} ⑤ version / updated_at 一字未动`,
    tAfter.version === tBefore.version && tAfter.updated_at === tBefore.updated_at);
}

const metaAfter = readJson(META_FILE);
for (const rec of founderPlan) {
  const e = metaAfter.trees[rec.entryKey];
  const sel = rec.selected;
  vcheck(`tree-meta[${rec.tid}] founder_handle/gramps_id/name = 认定值`,
    String(e?.founder_handle || '') === String(sel.handle) &&
    String(e?.founder_gramps_id || '') === String(sel.gramps_id) &&
    String(e?.founder_name || '') === String(sel.name));
  vcheck(`tree-meta[${rec.tid}] 无 founder_state（未写）`, !('founder_state' in (e || {})));
  const beforeKeys = Object.keys(rec.entry || {});
  const lost = beforeKeys.filter((k) => !(k in (e || {})));
  const extra = Object.keys(e || {}).filter((k) => !beforeKeys.includes(k));
  vcheck(`tree-meta[${rec.tid}] 仅新增 3 字段、其余键集合不变（新增 ${extra.join(',')}）`,
    lost.length === 0 && extra.length === 3 && ['founder_handle', 'founder_gramps_id', 'founder_name'].every((k) => extra.includes(k)));
  for (const k of beforeKeys) {
    if (JSON.stringify(rec.entry[k]) !== JSON.stringify(e[k])) { bad += 1; console.log(`  ❌ tree-meta[${rec.tid}].${k} 被改动`); }
  }
}

if (deletePlan.length) {
  vcheck(`孤儿档 ${ORPHAN.file} 已不存在`, !fs.existsSync(orphanAbs));
  vcheck(`孤儿档备份副本 md5 = 源侧删前 md5`, deletePlan.every((d) => md5(path.join(delDir, path.basename(d.abs))) === d.md5));
}
// 其余详情档逐字节不变（副本：与备份全量逐文件比对；真源：与"写前"已由聚合 md5 覆盖）
for (const f of fs.readdirSync(DETAILS_DIR)) {
  if (f === ORPHAN.file) continue;
  const src = path.join(bakDir, 'migrate-output', 'details', f);
  if (fs.existsSync(src) && md5(path.join(DETAILS_DIR, f)) !== md5(src)) { bad += 1; console.log(`  ❌ 其它详情档被改动：${f}`); }
}

const aggAfter = aggregateMd5(REAL_OUT, REAL_CONFIG);
console.log(`\n📦 备份：${bakDir}（migrate-output/ + config/ 全量 + MD5-LEDGER.txt + md5-before.txt + summary.json${deletePlan.length ? ` + deleted-source-details/（${deletePlan.length} 个 + md5.txt）` : ''}）`);
console.log(`✅ 已写 ${written} 个文件 / 已删 ${deleted} 个详情档`);
console.log(`聚合 md5（migrate-output+config）前 → 后：${aggBefore.digest}（${aggBefore.count} 文件） → ${aggAfter.digest}（${aggAfter.count} 文件）`);
console.log('回滚（逐条）：');
for (const r of rollback) console.log(`  ${r}`);
console.log('\n⚠️ 真源 apply 后须重启本地 compat-api（树 JSON / tree-meta 无磁盘指纹，长驻缓存会回写旧快照）。');

fs.writeFileSync(path.join(bakDir, 'md5-before.txt'), manifest.join('\n') + '\n', 'utf8');
const summary = buildSummary({ applied: true, backupDir: bakDir, state: 'applied', deletedManifest, aggAfter: aggAfter.digest });
fs.writeFileSync(path.join(bakDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(bakDir, 'MD5-LEDGER.txt'), [
  `# 批次：补始祖登记 + 清理孤儿详情档（${TREES.join(' / ')}）`,
  `# 时间：${now}`,
  `# 模式：${IS_COPY ? '副本演练' : '★真源★'}`,
  `# 聚合 md5：${aggBefore.digest}（${aggBefore.count} 文件） → ${aggAfter.digest}（${aggAfter.count} 文件）`,
  '',
  '[始祖认定]',
  ...founderPlan.map((r) => `${r.tid}  founder ${r.selected.gramps_id} ${r.selected.name} handle=${r.selected.handle}（覆盖 ${r.selected.covered}/${r.selected.total}=100%）`),
  '',
  '[改动文件 md5 前 → 后]',
  ...[...filePlan.values()].map((f) => `${f.kind.padEnd(6)}${f.rel.padEnd(52)}${f.before || '<不存在>'} → ${f.after}`),
  '',
  '[被删详情档 md5（删前）]',
  ...deletedManifest,
  '',
].join('\n') + '\n', 'utf8');
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2) + '\n', 'utf8');

if (bad) {
  console.log(`\n❌ ${bad} 项写后校验不符（退出码 1）。`);
  process.exit(1);
}
console.log('\n✅ 全部写后自校验 + 不变量复核通过。');

function buildSummary({ applied, backupDir, state, deletedManifest = [], aggAfter = '' }) {
  return {
    script: 'scripts/fix-founders-and-orphan-detail-2026-10.mjs',
    at: now,
    applied,
    state,
    out_dir: OUT_DIR,
    meta_file: META_FILE,
    is_copy: IS_COPY,
    founder: founderPlan.map((r) => ({
      tree_id: r.tid,
      selected: { gramps_id: r.selected.gramps_id, name: r.selected.name, handle: r.selected.handle },
      coverage: `${r.selected.covered}/${r.selected.total}`,
      candidates: r.analysis.perCandidate.map((c) => ({
        gramps_id: c.gramps_id, name: c.name, handle: c.handle,
        closure_size: c.closureSize, covered: c.covered, total: c.total,
        coverage_pct: Number(c.coveragePct.toFixed(1)),
        missing: c.missing,
      })),
      mirror_count: r.analysis.mirrorCount,
      non_mirror_count: r.analysis.nonMirrorCount,
    })),
    orphan_detail: {
      path: `migrate-output/details/${ORPHAN.file}`,
      handle: ORPHAN.handle,
      gramps_id: ORPHAN.gramps_id,
      name: ORPHAN.name,
      existed_before: orphanExists,
      deleted: deletePlan.length > 0,
    },
    backup_dir: backupDir,
    aggregate_md5: { before: aggBefore.digest, after: aggAfter, before_files: aggBefore.count, after_files: aggregateMd5(REAL_OUT, REAL_CONFIG).count },
    md5: {
      'config/tree-meta.json': { before: metaBeforeMd5, after: fs.existsSync(META_FILE) ? md5(META_FILE) : '' },
      files: [...filePlan.values()].map((f) => ({ path: f.rel, kind: f.kind, before: f.before || null, after_expected: f.after, after_actual: fs.existsSync(f.abs) ? md5(f.abs) : null })),
      deleted_details: deletePlan.map((d) => ({ path: d.rel, handle: d.handle, gramps_id: d.gramps_id, md5_before: d.md5, exists_after: fs.existsSync(d.abs) })),
    },
    checks: checks.map((c) => c.replace(/^✅ /, '')),
    notes,
    changes,
    verdict,
  };
}
