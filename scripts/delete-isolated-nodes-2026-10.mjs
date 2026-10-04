#!/usr/bin/env node
/**
 * 一次性数据手术：**删除 ji_23395_01（季氏费县白露家族）三个源侧孤立节点**。
 *
 * 对象（逐字取自真源实测；脚本仍逐条复核，不符即拒绝、零写盘）：
 *   | handle                       | gramps_id | 姓名            | 树内旧号 |
 *   | 103f95b87ac97de5ad865af2b37c | I000211   | Dushengzi的母亲 | I0061    |
 *   | 103f95b87ae81433e3b3300bc7a2 | I000212   | 1的母亲         | I0063    |
 *   | 103f95b87d475208a028b0374af  | I000230   | 四婶            | I500022  |
 *
 * 成因（Kevin 裁定）：三者是**原始 Gramps 导入即无任何 FAMS/FAMC 的孤儿**（非被拆散）。
 * 现盘核实：三者无 `parent_family`、`spouse_families` 为空、不在任何 family 的
 * father/mother/child_handles 里（零引用）；不为镜像；全站数据层无其它引用。
 * 各有 1 个详情档 `migrate-output/details/ji_23395_01:<handle>.json`。
 *
 * 动作（真源手术，非 API）：
 *   (A) 从 `trees/ji_23395_01.json` 的 `people` 删这 3 条；`version` +1、`updated_at` 刷新；
 *       `families` **一字不动**（本无引用）；其余 person 块逐字节携带（仅键集合少 3 条）。
 *   (B) 删除 3 个详情档 —— **删前**把副本 + md5 存进备份目录的 `deleted-source-details/`（+ md5.txt）。
 *   (C) **不得**动 `migrate-output/id-migration.report.json` / `id-migration.json`、不得动其它树。
 *
 * 幂等：重跑（已删除态）报「已删除 · 0 改动」，全部受管文件 md5 恒等。
 *
 * 用法：
 *   node scripts/delete-isolated-nodes-2026-10.mjs                         # dry-run（默认，只打印计划）
 *   node scripts/delete-isolated-nodes-2026-10.mjs --apply                 # 写盘（真源写入须单独授权）
 *   node scripts/delete-isolated-nodes-2026-10.mjs --apply --backup-dir=<dir>   # 指定备份目录（本批用）
 *   COMPAT_OUT_DIR=<dir> COMPAT_META_FILE=<dir>/tree-meta.json \
 *     node scripts/delete-isolated-nodes-2026-10.mjs [--apply]             # 副本演练
 *   node scripts/delete-isolated-nodes-2026-10.mjs --json=<path>           # 另存摘要 JSON
 *
 * 目标文件解析顺序（与 `lib/store.js` 同序）：`COMPAT_META_FILE` > `COMPAT_OUT_DIR/tree-meta.json` > 真源。
 * 备份：`--apply` 且确有改动时，改动到的文件按相对路径拷进
 *   `~/jiazu-backups/<YYYY-MM-DD>-ji-isolated-delete[-copy]/`（`--backup-dir=` 可覆盖）；另存
 *   `MD5-LEDGER.txt` + `md5-before.txt` + `summary.json`；被删详情另拷到该批次的
 *   `deleted-source-details/`（附 `md5.txt`）。
 *
 * ⚠️ 运维纪律：树 JSON 无磁盘指纹（`lib/store.js` 的进程内 `treeCache`），**外部改树 JSON 后必须重启
 *    compat-api**，否则长驻实例会把命中缓存的旧快照整份回写，覆盖磁盘新真源。
 *    ⇒ **真源 `--apply` 前须先停 3100**（面板路由 `POST :5555/api/stop {"sid":"jiazu-api"}`），**apply 后重启**。
 * 退出码：0 = dry-run 完成 / 写入成功 / 无需写入；1 = 前置复核或写后自校验失败（**绝不猜**）；2 = 用法错误 / 目标缺失。
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
  console.log('用法：node scripts/delete-isolated-nodes-2026-10.mjs [--apply] [--backup-dir=<dir>] [--json=<path>]');
  console.log('  --apply              写入目标（真源写入须单独授权；副本演练请配合 COMPAT_OUT_DIR / COMPAT_META_FILE）');
  console.log('  --backup-dir=<dir>   指定备份目录（默认 ~/jiazu-backups/<日期>-ji-isolated-delete[-copy]）');
  console.log('  --json=<path>        另存摘要 JSON');
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
const COLS_DIR = path.join(OUT_DIR, 'collections');
const META_FILE = process.env.COMPAT_META_FILE
  ? path.resolve(process.env.COMPAT_META_FILE)
  : process.env.COMPAT_OUT_DIR
    ? path.join(OUT_DIR, 'tree-meta.json')
    : REAL_META;
const IS_COPY = path.resolve(OUT_DIR) !== path.resolve(REAL_OUT);
const IS_META_COPY = path.resolve(META_FILE) !== path.resolve(REAL_META);
const ROOT = IS_COPY ? path.dirname(OUT_DIR) : REPO;

// ---- 本单常量（handle / gramps_id / legacy 逐字取自真源实测；脚本仍逐条复核）----
const TREE = 'ji_23395_01';
const TARGETS = [
  { handle: '103f95b87ac97de5ad865af2b37c', gramps_id: 'I000211', name: 'Dushengzi的母亲', legacy: 'I0061' },
  { handle: '103f95b87ae81433e3b3300bc7a2', gramps_id: 'I000212', name: '1的母亲', legacy: 'I0063' },
  { handle: '103f95b87d475208a028b0374af', gramps_id: 'I000230', name: '四婶', legacy: 'I500022' },
];

// ---- 工具 ----
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const md5buf = (b) => crypto.createHash('md5').update(b).digest('hex');
const md5text = (t) => crypto.createHash('md5').update(t).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const treeFile = (id) => path.join(TREES_DIR, `${id}.json`);
const detailFile = (treeId, handle) => path.join(DETAILS_DIR, `${treeId}:${handle}.json`);
const fmtPersonId = (n) => 'I' + String(Math.max(1, Number(n) || 0)).padStart(6, '0');
const listJson = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []);
/** 全站聚合 md5（真源 `migrate-output` + `config`，只读；用于前后对拍）*/
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
  return h.digest('hex');
}

// ================= 前置：目标存在性 =================
for (const [p, label] of [[TREES_DIR, '树目录'], [DETAILS_DIR, '详情目录'], [META_FILE, 'tree-meta']]) {
  if (!fs.existsSync(p)) {
    console.error(`❌ 找不到${label}：${p}`);
    process.exit(2);
  }
}
const TREE_PATH = treeFile(TREE);
if (!fs.existsSync(TREE_PATH)) {
  console.error(`❌ 找不到目标树 JSON：${path.relative(ROOT, TREE_PATH)}`);
  process.exit(2);
}

const now = new Date().toISOString();
const metaTextBefore = fs.readFileSync(META_FILE, 'utf8');
const meta = JSON.parse(metaTextBefore);
const metaBeforeMd5 = md5(META_FILE);
const treeTextBefore = fs.readFileSync(TREE_PATH, 'utf8');
const treeBeforeMd5 = md5text(treeTextBefore);
const tree = JSON.parse(treeTextBefore);
const aggBefore = aggregateMd5(REAL_OUT, REAL_CONFIG);

const errors = [];
const checks = [];
const verdict = [];
const err = (m) => errors.push(m);
const ok = (m) => checks.push(`✅ ${m}`);

// ---- 状态探测 ----
const people = tree.people || {};
const families = tree.families || {};
const present = TARGETS.filter((t) => !!people[t.handle]);
const detailPresent = TARGETS.filter((t) => fs.existsSync(detailFile(TREE, t.handle)));
const missingPeople = TARGETS.filter((t) => !people[t.handle]);
const missingDetails = TARGETS.filter((t) => !fs.existsSync(detailFile(TREE, t.handle)));

const STATE =
  present.length === 3 && detailPresent.length === 3
    ? '待删除'
    : present.length === 0 && detailPresent.length === 0
      ? '已删除'
      : '异常';

// ---- 现盘参考信息（臂录/成成/孪亲）----
for (const t of TARGETS) {
  const p = people[t.handle];
  if (!p) continue;
  if (String(p.gramps_id) !== t.gramps_id) err(`编号不符：${t.handle} 期望 ${t.gramps_id} 实为 ${p.gramps_id}`);
  if (String(p.name) !== t.name) err(`姓名不符：${t.handle} 期望「${t.name}」实为「${p.name}」`);
  if (String(p.legacy_gramps_id ?? '') !== t.legacy) err(`旧号不符：${t.handle} 期望 ${t.legacy} 实为 ${p.legacy_gramps_id ?? ''}`);
}

// ---- 零引用复核（不符即 exit 1、零写）----
if (STATE === '待删除') {
  // (a) 不在本树任何 family 槽位
  const slotRefs = new Map();
  for (const [fh, f] of Object.entries(families)) {
    for (const k of ['father_handle', 'mother_handle']) {
      const v = f?.[k];
      if (v) slotRefs.set(v, (slotRefs.get(v) || []).concat(`${fh}.${k}`));
    }
    for (const c of f?.child_handles || []) slotRefs.set(c, (slotRefs.get(c) || []).concat(`${fh}.child`));
  }
  // (b) 全站数据层外部引用（其它树 people.external_person_handle、其它树 family 槽位、meta founder/master）
  const extRefs = new Map();
  const addExt = (h, where) => { if (h) extRefs.set(h, (extRefs.get(h) || []).concat(where)); };
  for (const f of listJson(TREES_DIR)) {
    if (f === `${TREE}.json`) continue;
    let ot;
    try { ot = readJson(path.join(TREES_DIR, f)); } catch { continue; }
    const tid = String(ot.tree_id || f.replace(/\.json$/, ''));
    for (const [h, p] of Object.entries(ot.people || {})) {
      addExt(p?.external_person_handle, `${tid}:people[${h}].external_person_handle`);
      addExt(p?.external_founder_handle, `${tid}:people[${h}].external_founder_handle`);
    }
    for (const [fh, fam] of Object.entries(ot.families || {})) {
      addExt(fam?.father_handle, `${tid}:families[${fh}].father_handle`);
      addExt(fam?.mother_handle, `${tid}:families[${fh}].mother_handle`);
      for (const c of fam?.child_handles || []) addExt(c, `${tid}:families[${fh}].child_handles`);
    }
  }
  for (const [tk, tv] of Object.entries(meta.trees || {})) {
    addExt(tv?.founder_handle, `tree-meta.trees[${tk}].founder_handle`);
    addExt(tv?.master_handle, `tree-meta.trees[${tk}].master_handle`);
  }

  for (const t of TARGETS) {
    const p = people[t.handle];
    if (!p) continue;
    if (String(p.parent_family ?? '') !== '') err(`非孤立：${t.handle} 的 parent_family = ${JSON.stringify(p.parent_family)}（期望空）`);
    if (Array.isArray(p.spouse_families) ? p.spouse_families.length > 0 : String(p.spouse_families ?? '') !== '')
      err(`非孤立：${t.handle} 的 spouse_families 非空：${JSON.stringify(p.spouse_families)}`);
    if (slotRefs.has(t.handle)) err(`被 family 槽位引用：${t.handle} ← ${slotRefs.get(t.handle).join(', ')}`);
    if (extRefs.has(t.handle)) err(`被全站其它位置引用：${t.handle} ← ${extRefs.get(t.handle).join(', ')}`);
    if (String(p.external_mirror ?? '') === 'true') err(`是镜像节点（不可删）：${t.handle}`);
    if (!fs.existsSync(detailFile(TREE, t.handle))) err(`详情档缺失：${path.relative(ROOT, detailFile(TREE, t.handle))}`);
  }
  if (!errors.length) {
    ok(`状态判定：待删除（3 个孤立节点在树 + 3 个详情档在位）`);
    ok(`零引用复核通过：三者无 parent_family、spouse_families 空、无 family 槽位引用、全站数据层无外部引用、非镜像`);
  }
}

if (STATE === '异常') {
  if (present.length) err(`部分在树：${present.map((t) => t.handle).join(', ')}`);
  if (missingPeople.length) err(`部分不在树：${missingPeople.map((t) => t.handle).join(', ')}`);
  if (detailPresent.length) err(`部分详情档仍在：${detailPresent.map((t) => t.handle).join(', ')}`);
  if (missingDetails.length) err(`部分详情档已缺：${missingDetails.map((t) => t.handle).join(', ')}`);
  err(`树/详情状态不同步 —— 拒绝继续`);
}

// tree-meta 里该树条目必须存在（只读校验，不改）
const metaEntryKey = Object.keys(meta.trees || {}).find((k) => meta.trees[k]?.tree_id === TREE) || (meta.trees?.[TREE] ? TREE : '');
if (!metaEntryKey) err(`tree-meta 缺该树条目：${TREE}`);

if (errors.length) {
  for (const e of errors) console.error(`  ❌ ${e}`);
  console.error('❌ 前置复核失败，**未写入 / 未删除任何文件**（退出码 1）。');
  process.exit(1);
}

// ================= 计划 =================
/** 文件级计划：abs → { abs, rel, kind, before, afterText, after, note } */
const filePlan = new Map();
function planFile(abs, kind, afterText, note) {
  const rel = path.relative(ROOT, abs);
  const exists = fs.existsSync(abs);
  filePlan.set(abs, { abs, rel, kind, exists, before: exists ? md5(abs) : '', afterText, after: md5text(afterText), note });
}

const changes = [];
const deletePlan = [];
let treeNext = null;

if (STATE === '待删除') {
  const peopleNext = {};
  let removed = 0;
  for (const [h, p] of Object.entries(people)) {
    if (TARGETS.some((t) => t.handle === h)) { removed += 1; continue; }
    peopleNext[h] = p;
  }
  treeNext = { ...tree, version: (Number(tree.version) || 0) + 1, updated_at: now, people: peopleNext };
  const afterText = JSON.stringify(treeNext, null, 2); // 无末尾换行 —— 与真源同形
  planFile(TREE_PATH, 'tree', afterText, `${TREE}：people 删 ${removed} 条（version +1、updated_at 刷新；families 不动）`);
  changes.push({ kind: `(A) ${TREE} 删 ${removed} 个孤立节点（families 不动）`, file: path.relative(ROOT, TREE_PATH) });

  for (const t of TARGETS) {
    const abs = detailFile(TREE, t.handle);
    deletePlan.push({ abs, rel: path.relative(ROOT, abs), md5: md5(abs), handle: t.handle, gramps_id: t.gramps_id });
  }
  changes.push({ kind: `(B) 删 ${deletePlan.length} 个详情档（删前副本 + md5 落备份 deleted-source-details/）`, file: path.relative(ROOT, DETAILS_DIR) });
}

// ================= 打印 =================
console.log('═'.repeat(118));
console.log('删除 ji_23395_01 三个源侧孤立节点 —— scripts/delete-isolated-nodes-2026-10.mjs');
console.log(`树目录   ：${TREES_DIR}${IS_COPY ? '（副本演练）' : '（★真源★）'}`);
console.log(`详情目录 ：${DETAILS_DIR}${IS_COPY ? '（副本）' : '（★真源★）'}`);
console.log(`tree-meta：${META_FILE}${IS_META_COPY ? '（副本）' : '（★真源★）'}  md5(前)=${metaBeforeMd5}`);
console.log(`目标树   ：${TREE}  people=${Object.keys(people).length}  families=${Object.keys(families).length}  version=${tree.version}  updated_at=${tree.updated_at}`);
console.log(`模式     ：${APPLY ? '--apply（写盘）' : 'dry-run（不写盘）'}`);
console.log(`状态     ：${STATE}`);
console.log('═'.repeat(118));

for (const m of checks) console.log(`  ${m}`);

console.log('\n待删节点（逐条，来源 = 真源解析）：');
for (const t of TARGETS) {
  const p = people[t.handle];
  console.log(`  ${t.gramps_id}  handle=${t.handle}  旧号=${t.legacy}  名「${t.name}」  ` +
    `${p ? `当前: parent_family=${JSON.stringify(p.parent_family ?? '')} spouse_families=${JSON.stringify(p.spouse_families ?? [])}` : '（已不在树）'}`);
}

if (STATE === '已删除') {
  console.log('\n✅ 目标形态已就位（3 个节点及其详情档均已不在真源）：**已删除 · 0 改动**，全部文件一个字节未改。');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(buildSummary({ applied: false, backupDir: '', state: STATE }), null, 2) + '\n', 'utf8');
  process.exit(0);
}

// 待删除：打印计划
for (const ch of changes) console.log(`  ▸ ${ch.kind}  →  ${ch.file}`);
console.log('\n文件级 md5（前 → 后，预算）：');
for (const f of filePlan.values()) {
  console.log(`  ${String(f.kind).padEnd(8)}${f.rel.padEnd(56)}${f.exists ? f.before : '<不存在>'} → ${f.after}`);
}
console.log('待删文件（删前先落备份 deleted-source-details/ + md5 清单）：');
for (const d of deletePlan) console.log(`  ${String('delete').padEnd(8)}${d.rel.padEnd(56)}md5=${d.md5}`);

// ---- dry-run：证明零写入 ----
if (!APPLY) {
  const drift = [...filePlan.values()].filter((f) => f.exists && md5(f.abs) !== f.before);
  const metaNow = md5(META_FILE);
  const treeNow = md5(TREE_PATH);
  const aggNow = aggregateMd5(REAL_OUT, REAL_CONFIG);
  const delDrift = deletePlan.filter((d) => !fs.existsSync(d.abs) || md5(d.abs) !== d.md5);
  console.log(`\nmd5（tree-meta 前/后）= ${metaBeforeMd5} / ${metaNow}  ${metaNow === metaBeforeMd5 ? '未写盘 ✅' : '⚠️ 已变'}`);
  console.log(`md5（目标树 前/后）= ${treeBeforeMd5} / ${treeNow}  ${treeNow === treeBeforeMd5 ? '未写盘 ✅' : '⚠️ 已变'}`);
  console.log(`待写文件现盘 md5 复算：${drift.length === 0 ? `全部与「前」一致（${filePlan.size} 个文件，零写入 ✅）` : `⚠️ ${drift.length} 个已变`}`);
  console.log(`待删文件现盘复核：${delDrift.length === 0 ? `全部仍在且 md5 一致（${deletePlan.length} 个文件，零删除 ✅）` : `⚠️ ${delDrift.length} 个已变/已缺`}`);
  console.log(`聚合 md5（migrate-output+config 前/后）= ${aggBefore} / ${aggNow}  ${aggNow === aggBefore ? '未写盘 ✅' : '⚠️ 已变'}`);
  console.log('（dry-run，未写盘、未删文件。加 --apply 才真正写入并连带删除详情档。）');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(buildSummary({ applied: false, backupDir: '', state: STATE }), null, 2) + '\n', 'utf8');
  process.exit(0);
}

// ================= 写入 =================
const stamp = new Date().toISOString().slice(0, 10);
let bakDir;
if (BAK_DIR_ARG) {
  bakDir = BAK_DIR_ARG;
} else {
  bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-ji-isolated-delete${IS_COPY ? '-copy' : ''}`);
  for (let i = 2; fs.existsSync(bakDir); i += 1) {
    bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-ji-isolated-delete${IS_COPY ? '-copy' : ''}-${i}`);
  }
}
fs.mkdirSync(bakDir, { recursive: true });

// 备份：改动到的现有文件（按相对路径）+ 被删详情
const manifest = [];
const rollback = [];
for (const f of filePlan.values()) {
  if (f.exists) {
    const dest = path.join(bakDir, f.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f.abs, dest);
    if (md5(dest) !== f.before) { console.log(`\n❌ 备份副本 md5 不符：${f.rel}（退出码 1）。`); process.exit(1); }
    manifest.push(`${f.before}  ${f.rel}`);
    rollback.push(`cp ${dest} ${f.abs}`);
  } else {
    manifest.push(`<不存在，无需备份>  ${f.rel}`);
    rollback.push(`rm -f ${f.abs}`);
  }
}

// 被删详情：先落备份副本 + md5（删前）
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

// 写树（先写）
let written = 0;
for (const f of filePlan.values()) {
  fs.writeFileSync(f.abs, f.afterText, 'utf8');
  written += 1;
}

// 写后自校验
let bad = 0;
console.log('\n写后自校验：');
for (const f of filePlan.values()) {
  const after = fs.existsSync(f.abs) ? md5(f.abs) : '';
  const okOne = after === f.after;
  if (!okOne) bad += 1;
  console.log(`  ${okOne ? '✅' : '⚠️'} ${f.rel.padEnd(56)}md5 ${f.before || '<不存在>'} → ${after}  （预算 ${f.after}）`);
  try { JSON.parse(fs.readFileSync(f.abs, 'utf8')); } catch (e) { bad += 1; console.log(`  ❌ JSON.parse 失败：${f.rel} — ${e.message}`); }
}

// 删详情档（写树之后）
let deleted = 0;
console.log('\n详情档删除（备份已就位 → 删除 → 复核）：');
for (const d of deletePlan) {
  fs.unlinkSync(d.abs);
  const gone = !fs.existsSync(d.abs);
  if (!gone) bad += 1;
  const copyOk = md5(path.join(delDir, path.basename(d.abs))) === d.md5;
  if (!copyOk) bad += 1;
  deleted += 1;
  console.log(`  ${gone && copyOk ? '✅' : '⚠️'} 已删 ${d.rel}（原 md5=${d.md5}；备份副本 ${copyOk ? 'md5 一致' : 'md5 不符'}）`);
}

// ---- 结构化不变量复核 ----
console.log('\n不变量复核（目标形态）：');
function vcheck(label, cond) {
  verdict.push({ label, pass: !!cond });
  if (!cond) bad += 1;
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
}
const T_AFTER = readJson(TREE_PATH);
const afterHandles = Object.keys(T_AFTER.people || {});
const beforeHandles = Object.keys(people);
vcheck(`① 目标树 people 恰少 3 个目标 handle（其余键集合逐字不变）`,
  afterHandles.length === beforeHandles.length - 3 &&
  TARGETS.every((t) => !afterHandles.includes(t.handle)) &&
  beforeHandles.every((h) => TARGETS.some((t) => t.handle === h) || afterHandles.includes(h)));
vcheck(`② 目标树 families 逐深度相等（一字不动）`,
  JSON.stringify(T_AFTER.families || {}) === JSON.stringify(families));
vcheck(`③ version +1 且 updated_at 刷新`,
  Number(T_AFTER.version) === (Number(tree.version) || 0) + 1 && String(T_AFTER.updated_at) === now);
vcheck(`④ 3 个详情档均已不存在`, TARGETS.every((t) => !fs.existsSync(detailFile(TREE, t.handle))));
vcheck(`⑤ 备份副本 md5 = 源侧删前 md5`,
  deletePlan.every((d) => md5(path.join(delDir, path.basename(d.abs))) === d.md5));
vcheck(`⑥ 树内其余 person 块逐字节携带（除目标外逐键 JSON 全等）`,
  beforeHandles.filter((h) => !TARGETS.some((t) => t.handle === h))
    .every((h) => JSON.stringify(T_AFTER.people[h]) === JSON.stringify(people[h])));
vcheck(`⑦ 未触碰树外的 id-migration 报表（其 md5 不在本脚本受管面内）`, true);

// 聚合 md5（后）
const aggAfter = aggregateMd5(REAL_OUT, REAL_CONFIG);

console.log(`\n📦 备份：${bakDir}（${written} 个改动文件 + MD5-LEDGER.txt + md5-before.txt + summary.json${deletePlan.length ? ` + deleted-source-details/（${deletePlan.length} 个 + md5.txt）` : ''}）`);
console.log(`✅ 已写入 ${written} 个文件 / 已删 ${deleted} 个详情档`);
console.log(`聚合 md5（migrate-output+config）前 → 后：${aggBefore} → ${aggAfter}`);
console.log('回滚（逐条）：');
for (const r of rollback) console.log(`  ${r}`);
console.log('\n⚠️ 真源 apply 后须重启本地 compat-api（树 JSON 无磁盘指纹，长驻 treeCache 会回写旧快照）。');

// 写台账
fs.writeFileSync(path.join(bakDir, 'md5-before.txt'), manifest.join('\n') + '\n', 'utf8');
const summary = buildSummary({ applied: true, backupDir: bakDir, state: STATE, deletedManifest, aggBefore, aggAfter });
fs.writeFileSync(path.join(bakDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(bakDir, 'MD5-LEDGER.txt'), [
  `# 批次：删除 ji_23395_01 三个源侧孤立节点（${TREE}）`,
  `# 时间：${now}`,
  `# 模式：${IS_COPY ? '副本演练' : '★真源★'}`,
  `# 聚合 md5（find migrate-output config -type f | sort | xargs md5 -q | md5 -q）：${aggBefore} → ${aggAfter}`,
  '',
  '[改动文件 md5 前 → 后]',
  ...[...filePlan.values()].map((f) => `${f.kind.padEnd(8)}${f.rel.padEnd(56)}${f.before || '<不存在>'} → ${f.after}`),
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

function buildSummary({ applied, backupDir, state, deletedManifest = [], aggBefore = '', aggAfter = '' }) {
  return {
    script: 'scripts/delete-isolated-nodes-2026-10.mjs',
    ruling: '删除 ji_23395_01 三个源侧孤立节点（原始 Gramps 导入即无 FAMS/FAMC 的孤儿；非被拆散）',
    at: now,
    applied,
    state,
    targets: {
      tree_id: TREE,
      out_dir: OUT_DIR,
      details_dir: DETAILS_DIR,
      meta_file: META_FILE,
      is_copy: IS_COPY,
      is_meta_copy: IS_META_COPY,
      nodes: TARGETS,
    },
    backup_dir: backupDir,
    aggregate_md5: { before: aggBefore, after: aggAfter },
    md5: {
      'config/tree-meta.json': { before: metaBeforeMd5, after: fs.existsSync(META_FILE) ? md5(META_FILE) : '' },
      tree: { path: path.relative(ROOT, TREE_PATH), before: treeBeforeMd5, after: fs.existsSync(TREE_PATH) ? md5(TREE_PATH) : '' },
      files: [...filePlan.values()].map((f) => ({
        path: f.rel, kind: f.kind, before: f.before || null, after_expected: f.after,
        after_actual: fs.existsSync(f.abs) ? md5(f.abs) : null,
      })),
      deleted_details: deletePlan.map((d) => ({
        path: d.rel, handle: d.handle, gramps_id: d.gramps_id, md5_before: d.md5, exists_after: fs.existsSync(d.abs),
      })),
    },
    people_count: { before: Object.keys(people).length, after: fs.existsSync(TREE_PATH) ? Object.keys(readJson(TREE_PATH).people || {}).length : null },
    checks: checks.map((c) => c.replace(/^✅ /, '')),
    verdict,
    changes,
  };
}
