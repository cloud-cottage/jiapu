#!/usr/bin/env node
/**
 * 一次性数据手术：**秦氏始祖真源反转（跨树搬迁回迁版）**（2026-10 · 同款「季/顾」就地反转，
 * 但本案源侧成因 = `lib/tree-write.js` 的 `reparentAcrossTrees` 跨树搬迁，而非「镜像翻转」）。
 *
 * 目标（Zang 裁定 · 变体 A：家族树始祖 = 真身）：
 *   把「秦老太爷」（I000275，handle 103f95b87c1d1fbf033bb67e8420）**真身搬回家族树** `qin_31206_01`
 *   并成为该树始祖；其子「秦永葆」（I000274，handle 103f95b87713767b1d9a8e0e4672）随迁；
 *   祖谱 `qin_31206` 侧**新建 1 条只读登记镜像**（R4 方向朝下：祖谱自有段 → 家族树真身）。
 *   编号终身不变：I000275 / I000274 不改号（`docs/id-system.spec.md` §8-4）。
 *
 * 现状（2026-09-16 05:59:09Z 一次跨树迁移造成）：
 *   · `migrate-output/trees/qin_31206_01.json` = 空壳（people/families 空、version 4）；
 *   · `migrate-output/trees/qin_31206.json`（kind=clan）持有 4 person / 3 family，其中
 *     秦老太爷（自有段，挂在 F000149=秦某 下）+ 秦永葆（挂在 F000137 下）在宗谱侧；
 *   · 两份详情档已被改键为 `qin_31206:<handle>`。
 *
 * 目标形态（逐字照现成样板 `ji_23395_01 ↔ ji_23395` 的已反转态）：
 *   (A) 家族树 `qin_31206_01.json`
 *       · `people` 写入 2 条：秦老太爷（**根**：`parent_family:''` + 6 个 `external_*` 一律置空串、
 *         不删键）+ 秦永葆（`parent_family` 指向随迁家族 F000137）；
 *       · `families` 写入随迁的 F000137（father=秦老太爷，child=[秦永葆]）；
 *       · 顶部 `founder_gramps_id:'I000275'`；`version` +1；`updated_at` 刷新；
 *         身份字段（name/surname/given/gender/birth_date/death_date/birth_place/death_place/
 *         legacy_gramps_id/is_living）**一字不动**。
 *   (B) 祖谱 `qin_31206.json`
 *       · 删除 秦老太爷 / 秦永葆 两个 person 与 F000137；
 *       · **新建 1 条登记镜像节点**（新 handle = 24 位随机 hex；新 gramps_id 经 `lib/id-seq.js`
 *         铸号、只抬不降，并同步写 `collections/jiazu_id_seq.json`）：
 *         `external_tree='qin_31206_01'` / `external_person_handle=<秦老太爷 handle>` /
 *         `external_link_type='founder'` / `external_mirror='true'` /
 *         `external_relation_note='秦老太爷（秦氏鸡西家族 · 始祖）'`，姓名/性别/生卒/葬地 = 真身副本，
 *         挂回**原父家族 F000149（father=秦某）的 child_handles**（保证祖谱链 姬搢→秦某→镜像 仍渲染）；
 *         姬搢镜像 I000289 与秦某 I000290 **一字不动**；登记镜像**不建详情档**。
 *   (C) `config/tree-meta.json`
 *       · `trees['qin_31206_01']` **只新增** founder_handle / founder_gramps_id / founder_name /
 *         clan_tree_id / clan_handle；其余字段一字不改；
 *       · `trees['qin_31206']` **只新增/改写** founder_handle（改指新镜像）/ founder_gramps_id /
 *         founder_name；master_* / hall_name / origin / description / created_* 一字不改。
 *   (D) 详情档：新建 `details/qin_31206_01:<handle>` × 2（取原 `details/qin_31206:<handle>` 内容，
 *       仅改写 `_id` / `tree_id`，`gramps_id`/`legacy_gramps_id`/`name` 取本树节点现值，`updated_at` 刷新）；
 *       **顺序 = 先写新键、再删旧键**（对齐 `docs/PENDING_DEPLOY.md` §29-3：先重传、再删旧键）；
 *       删前把被删文件副本 + md5 存进备份目录的 `deleted-source-details/`。
 *
 * 幂等：目标值 = 现值即不写该文件；`--apply` 重跑报「0 改动」，所有受管文件 md5 前后恒等。
 *
 * 用法：
 *   node scripts/migrate-qin-founder-reversal-2026-10.mjs                      # dry-run（默认，只打印计划）
 *   node scripts/migrate-qin-founder-reversal-2026-10.mjs --apply              # 写目标（默认连带删旧详情键）
 *   node scripts/migrate-qin-founder-reversal-2026-10.mjs --apply --keep-source-detail   # 保留旧详情键
 *   COMPAT_OUT_DIR=<dir> COMPAT_META_FILE=<dir>/tree-meta.json \
 *     node scripts/migrate-qin-founder-reversal-2026-10.mjs [--apply]          # 副本演练
 *   node scripts/migrate-qin-founder-reversal-2026-10.mjs --json=<path>        # 另存摘要 JSON
 *
 * 目标文件解析顺序（与 `lib/store.js` 同序）：`COMPAT_META_FILE` > `COMPAT_OUT_DIR/tree-meta.json` > 真源。
 * 备份：`--apply` 且确有改动/删除时，改动到的文件按相对路径拷到
 *   `~/jiazu-backups/<YYYY-MM-DD>-qin-founder-reversal[-copy]/`（另存 `md5-before.txt` + `summary.json`）；
 *   被删的旧详情另拷到该批次的 `deleted-source-details/`（附 `md5.txt`）。
 *
 * ⚠️ 运维纪律（`docs/founder-attach.spec.md` §9-11(b)）：树 JSON 无磁盘指纹（`lib/store.js` 的
 *   进程内 `treeCache` / `colCache`），**外部改树 JSON 后必须重启 compat-api**，否则长驻实例会把
 *   命中缓存的旧快照整份回写，覆盖磁盘新真源。⇒ **真源 `--apply` 前须先停 3100**
 *   （`lsof -nP -iTCP:3100 -sTCP:LISTEN`），**apply 后重启**。本脚本直接改文件、**不经 API**。
 * 退出码：0 = dry-run 完成 / 写入成功 / 无需写入；1 = 前置复核或写后自校验失败（**绝不猜**）；2 = 用法错误 / 目标缺失。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ---- 参数 ----
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
if (flag('--help') || flag('-h')) {
  console.log('用法：node scripts/migrate-qin-founder-reversal-2026-10.mjs [--apply] [--keep-source-detail] [--json=<path>]');
  console.log('  --apply                写入目标（真源写入须单独授权；副本演练请配合 COMPAT_OUT_DIR / COMPAT_META_FILE）');
  console.log('  --keep-source-detail   --apply 时**保留**祖谱侧旧详情键（退回默认删除）');
  console.log('  --json=<path>          另存摘要 JSON');
  process.exit(0);
}
const KNOWN = new Set(['--apply', '--keep-source-detail']);
const unknown = argv.filter((a) => !KNOWN.has(a) && !a.startsWith('--json='));
if (unknown.length) {
  console.error(`❌ 未知参数：${unknown.join(' ')}（仅支持 --apply / --keep-source-detail / --json=<path>）`);
  process.exit(2);
}
const APPLY = flag('--apply');
const KEEP_SOURCE_DETAIL = flag('--keep-source-detail');
const jsonArg = argv.find((a) => a.startsWith('--json='));
const JSON_OUT = jsonArg ? path.resolve(jsonArg.slice('--json='.length)) : '';

// ---- 目标文件解析（与 lib/store.js 同序）----
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const OUT_DIR = process.env.COMPAT_OUT_DIR ? path.resolve(process.env.COMPAT_OUT_DIR) : REAL_OUT;
const TREES_DIR = path.join(OUT_DIR, 'trees');
const DETAILS_DIR = path.join(OUT_DIR, 'details');
const COLS_DIR = path.join(OUT_DIR, 'collections');
const META_FILE = process.env.COMPAT_META_FILE
  ? path.resolve(process.env.COMPAT_META_FILE)
  : process.env.COMPAT_OUT_DIR
    ? path.join(OUT_DIR, 'tree-meta.json')
    : REAL_META;
const SEQ_FILE = path.join(COLS_DIR, 'jiazu_id_seq.json');
const IS_COPY = path.resolve(OUT_DIR) !== path.resolve(REAL_OUT);
const IS_META_COPY = path.resolve(META_FILE) !== path.resolve(REAL_META);
const ROOT = IS_COPY ? path.dirname(OUT_DIR) : REPO;

// ---- 本单常量（handle / gramps_id 逐字取自真源实测；脚本仍逐条复核，不符即拒绝）----
const FAMILY_TREE = 'qin_31206_01';
const CLAN_TREE = 'qin_31206';
const FOUNDER_HANDLE = '103f95b87c1d1fbf033bb67e8420'; // 秦老太爷（真身 → 家族树始祖）
const FOUNDER_GRAMPS = 'I000275';
const FOUNDER_NAME = '秦老太爷';
const CHILD_HANDLE = '103f95b87713767b1d9a8e0e4672'; // 秦永葆（随迁）
const CHILD_GRAMPS = 'I000274';
const CHILD_NAME = '秦永葆';
const MIGRATED_FAMILY_HANDLE = '103f95b8772233e0a92c873d869c'; // F000137（随迁家族）
const MIGRATED_FAMILY_GRAMPS = 'F000137';
const CLAN_PARENT_FAMILY = '8639ef4822937a2a0570972f'; // F000149（father=秦某；登记镜像挂此）
const CLAN_PARENT_GRAMPS = 'F000149';
const CLAN_TOP_FAMILY = '5847858fe8593e8df74ace88'; // F000148（姬搢→秦某；不动）
const CLAN_TOP_MIRROR_HANDLE = 'mir_3382fa53ef677c058a5ec559'; // I000289 姬搢（不动）
const CLAN_TOP_MIRROR_GRAMPS = 'I000289';
const CLAN_OWN_HANDLE = '3ecfaedeff52a021d12c96a7'; // I000290 秦某（不动）
const CLAN_OWN_GRAMPS = 'I000290';
const FAMILY_TITLE = '秦氏鸡西家族';
const MIRROR_NOTE = `${FOUNDER_NAME}（${FAMILY_TITLE} · 始祖）`; // R4 工厂口径 founderRegistrationNote()
/** 家族树始祖节点「一律置空串、不删键」的 6 个字段（5 个镜像指针 + A3 的 external_founder_created_by） */
const CLEAR_FIELDS = [
  'external_tree',
  'external_person_handle',
  'external_link_type',
  'external_mirror',
  'external_relation_note',
  'external_founder_created_by',
];

// ---- 工具 ----
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const md5text = (t) => crypto.createHash('md5').update(t).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const deep = (v) => JSON.parse(JSON.stringify(v ?? null));
const w = (s, n) => {
  const len = [...String(s)].reduce((k, ch) => k + (ch.codePointAt(0) > 127 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - len));
};
const treeFile = (id) => path.join(TREES_DIR, `${id}.json`);
const detailFile = (treeId, handle) => path.join(DETAILS_DIR, `${treeId}:${handle}.json`);
const fmtPersonId = (n) => 'I' + String(Math.max(1, Number(n) || 0)).padStart(6, '0');
/** 从 tree-meta 里解析 tree_id → 键（trees 为对象，键通常等于 tree_id，但按 tree_id 字段兜底） */
const entryKeyOf = (meta, treeId) =>
  Object.keys(meta.trees || {}).find((k) => meta.trees[k]?.tree_id === treeId) || (meta.trees?.[treeId] ? treeId : '');
const extCleared = (p) => CLEAR_FIELDS.every((k) => String(p?.[k] ?? '') === '');
const sameHandleSet = (arr, set) =>
  Array.isArray(arr) && arr.length === set.length && set.every((h) => arr.includes(h));

/** 家族树始祖节点：parent_family 置 ''、6 个 external_* 一律置空串（不删键、按样板键序落位） */
function buildFamilyFounderNode(src) {
  const clear = Object.fromEntries(CLEAR_FIELDS.map((k) => [k, '']));
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(src)) {
    if (k === 'parent_family') {
      out[k] = '';
      continue;
    }
    if (k in clear) {
      if (!placed) {
        Object.assign(out, clear);
        placed = true;
      }
      continue;
    }
    out[k] = v;
  }
  if (!placed) Object.assign(out, clear);
  return out;
}

/** 祖谱登记镜像节点（新 handle / 新 gramps_id；身份 = 真身副本；挂到原父家族下） */
function buildMirrorNode({ handle, grampsId, src, parentFamily }) {
  return {
    handle,
    gramps_id: grampsId,
    name: String(src?.name ?? ''),
    surname: String(src?.surname ?? ''),
    given: String(src?.given ?? ''),
    gender: String(src?.gender ?? 'U'),
    birth_date: src?.birth_date ?? '',
    death_date: src?.death_date ?? '',
    birth_place: deep(src?.birth_place ?? ''),
    death_place: src?.death_place ?? '',
    parent_family: parentFamily,
    spouse_families: [],
    external_tree: FAMILY_TREE,
    external_person_handle: FOUNDER_HANDLE,
    external_link_type: 'founder',
    external_mirror: 'true',
    external_relation_note: MIRROR_NOTE,
  };
}

/** 家族树侧始祖/随迁详情（取旧 `qin_31206:<handle>` 内容；只改写落点 + 本树身份键；内容字段携带） */
function buildFamilyDetail(srcDetail, { treeId, handle, node, now }) {
  return {
    _id: `${treeId}:${handle}`,
    tree_id: treeId,
    handle,
    gramps_id: String(node?.gramps_id ?? ''),
    name: String(node?.name ?? ''),
    events: deep(srcDetail?.events ?? []),
    media: deep(srcDetail?.media ?? []),
    citations: deep(srcDetail?.citations ?? []),
    notes: deep(srcDetail?.notes ?? []),
    attributes: deep(srcDetail?.attributes ?? []),
    updated_at: now,
    legacy_gramps_id: String(node?.legacy_gramps_id ?? ''),
  };
}

/** tree-meta 家族树条目：在 `kind` 之后插入 founder_* / clan_*（其余键原样、顺序保留） */
function famEntryWithFounder(entry, { founderHandle, founderGramps, founderName, clanTreeId, clanHandle }) {
  const add = {
    founder_handle: founderHandle,
    founder_gramps_id: founderGramps,
    founder_name: founderName,
    clan_tree_id: clanTreeId,
    clan_handle: clanHandle,
  };
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(entry)) {
    if (k in add) {
      if (!placed) {
        Object.assign(out, add);
        placed = true;
      }
      continue;
    }
    out[k] = v;
    if (k === 'kind' && !placed) {
      Object.assign(out, add);
      placed = true;
    }
  }
  if (!placed) Object.assign(out, add);
  return out;
}

/** tree-meta 祖谱条目：founder_handle 改指新镜像，并在其后落 founder_gramps_id / founder_name */
function clanEntryWithFounder(entry, { handle, gramps, name }) {
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'founder_gramps_id' || k === 'founder_name') continue; // 统一在 founder_handle 处补出
    if (k === 'founder_handle') {
      out.founder_handle = handle;
      out.founder_gramps_id = gramps;
      out.founder_name = name;
      placed = true;
      continue;
    }
    out[k] = v;
  }
  if (!placed) {
    out.founder_handle = handle;
    out.founder_gramps_id = gramps;
    out.founder_name = name;
  }
  return out;
}

// ================= 前置：目标存在性 =================
for (const [p, label] of [[TREES_DIR, '树目录'], [DETAILS_DIR, '详情目录'], [META_FILE, 'tree-meta']]) {
  if (!fs.existsSync(p)) {
    console.error(`❌ 找不到${label}：${p}`);
    process.exit(2);
  }
}

const now = new Date().toISOString();
const metaTextBefore = fs.readFileSync(META_FILE, 'utf8');
const meta = JSON.parse(metaTextBefore);
const metaBeforeMd5 = md5(META_FILE);

const errors = [];
const checks = [];
const verdict = []; // 写后结构化不变量复核结果（dry-run / 已迁移 时为空数组）
let mintedId = ''; // 实际铸得的 gramps_id（仅 --apply 待迁移态非空）
const err = (m) => errors.push(m);
const ok = (m) => checks.push(`✅ ${m}`);

for (const id of [FAMILY_TREE, CLAN_TREE]) {
  if (!fs.existsSync(treeFile(id))) err(`树 JSON 缺失：${path.relative(ROOT, treeFile(id))}`);
}
for (const h of [FOUNDER_HANDLE, CHILD_HANDLE]) {
  if (!fs.existsSync(detailFile(CLAN_TREE, h)) && !fs.existsSync(detailFile(FAMILY_TREE, h)))
    err(`源/目标详情都缺失：${CLAN_TREE}:${h} / ${FAMILY_TREE}:${h}`);
}
if (errors.length) {
  for (const e of errors) console.error(`  ❌ ${e}`);
  console.error('❌ 前置复核失败，未写入任何文件（退出码 2）。');
  process.exit(2);
}

const famKey = entryKeyOf(meta, FAMILY_TREE);
const clanKey = entryKeyOf(meta, CLAN_TREE);
if (!famKey) err(`tree-meta 缺家族树条目：${FAMILY_TREE}`);
if (!clanKey) err(`tree-meta 缺祖谱条目：${CLAN_TREE}`);
// 缺条目 → 后续计划（meta.trees[famKey] / meta.trees[clanKey]）无从落地：干净退出，绝不猜（同「前置复核失败」）
if (errors.length) {
  for (const e of errors) console.log(`  ❌ ${e}`);
  console.log('❌ 前置复核失败，未写入 / 未删除任何文件（退出码 1）。');
  process.exit(1);
}

const famTree = readJson(treeFile(FAMILY_TREE));
const clanTree = readJson(treeFile(CLAN_TREE));
const famText = fs.readFileSync(treeFile(FAMILY_TREE), 'utf8');
const clanText = fs.readFileSync(treeFile(CLAN_TREE), 'utf8');

// ---- 状态探测 ----
const famPeople = famTree.people || {};
const famFamilies = famTree.families || {};
const clanPeople = clanTree.people || {};
const clanFamilies = clanTree.families || {};

const famShellOk =
  Object.keys(famPeople).length === 0 &&
  Object.keys(famFamilies).length === 0 &&
  !famTree.founder_gramps_id &&
  String(famTree.tree_id) === FAMILY_TREE;
const famMigratedOk =
  sameHandleSet(Object.keys(famPeople), [FOUNDER_HANDLE, CHILD_HANDLE]) &&
  sameHandleSet(Object.keys(famFamilies), [MIGRATED_FAMILY_HANDLE]) &&
  String(famTree.founder_gramps_id || '') === FOUNDER_GRAMPS;

const clanSourceOk =
  !!clanPeople[FOUNDER_HANDLE] &&
  !!clanPeople[CHILD_HANDLE] &&
  !!clanFamilies[MIGRATED_FAMILY_HANDLE] &&
  !clanPeople[FOUNDER_HANDLE].external_mirror &&
  extCleared(clanPeople[FOUNDER_HANDLE]) &&
  String(clanPeople[FOUNDER_HANDLE].gramps_id) === FOUNDER_GRAMPS &&
  String(clanPeople[FOUNDER_HANDLE].parent_family || '') === CLAN_PARENT_FAMILY &&
  String(clanPeople[CHILD_HANDLE].gramps_id) === CHILD_GRAMPS &&
  String(clanPeople[CHILD_HANDLE].parent_family || '') === MIGRATED_FAMILY_HANDLE &&
  String(clanFamilies[MIGRATED_FAMILY_HANDLE].gramps_id || '') === MIGRATED_FAMILY_GRAMPS &&
  String(clanFamilies[MIGRATED_FAMILY_HANDLE].father_handle || '') === FOUNDER_HANDLE &&
  sameHandleSet(clanFamilies[MIGRATED_FAMILY_HANDLE].child_handles, [CHILD_HANDLE]) &&
  sameHandleSet(clanFamilies[CLAN_PARENT_FAMILY]?.child_handles, [FOUNDER_HANDLE]);

// 已迁移态：祖谱侧已有指向家族树真身的登记镜像
const existingMirror = Object.values(clanPeople).find(
  (p) =>
    String(p.external_tree || '') === FAMILY_TREE &&
    String(p.external_person_handle || '') === FOUNDER_HANDLE &&
    String(p.external_link_type || '') === 'founder' &&
    String(p.external_mirror || '') === 'true',
);
const clanMigratedOk =
  !!existingMirror &&
  !clanPeople[FOUNDER_HANDLE] &&
  !clanPeople[CHILD_HANDLE] &&
  !clanFamilies[MIGRATED_FAMILY_HANDLE] &&
  String(existingMirror.gramps_id || '') === String(meta.trees?.[clanKey]?.founder_gramps_id || '') &&
  sameHandleSet(clanFamilies[CLAN_PARENT_FAMILY]?.child_handles, [existingMirror.handle]);

// ---- 不变项断言（姬搢镜像 / 秦某 / F000148 与两族槽位）----
const topMirror = clanPeople[CLAN_TOP_MIRROR_HANDLE];
if (!topMirror) err(`祖谱顶端世本镜像缺失（${CLAN_TOP_MIRROR_HANDLE}）`);
else if (
  String(topMirror.external_tree || '') !== 'zhonghua' ||
  String(topMirror.external_link_type || '') !== 'founder' ||
  String(topMirror.external_mirror || '') !== 'true' ||
  String(topMirror.gramps_id || '') !== CLAN_TOP_MIRROR_GRAMPS
)
  err(`祖谱顶端镜像方向/编号已被改动（${JSON.stringify({ tree: topMirror.external_tree, type: topMirror.external_link_type, mirror: topMirror.external_mirror, gid: topMirror.gramps_id })}）—— 拒绝在非预期态上动手`);
else ok(`祖谱顶端世本镜像 ${CLAN_TOP_MIRROR_HANDLE}（${CLAN_TOP_MIRROR_GRAMPS}）→ zhonghua（不动）`);

const own = clanPeople[CLAN_OWN_HANDLE];
if (!own) err(`祖谱自有段节点缺失（${CLAN_OWN_HANDLE} 秦某）`);
else if (!extCleared(own) || String(own.gramps_id || '') !== CLAN_OWN_GRAMPS)
  err(`祖谱自有段节点（秦某）非「本宗真身」态：${JSON.stringify(Object.fromEntries(CLEAR_FIELDS.map((k) => [k, own[k] ?? null])))}`);
else ok(`祖谱自有段节点 ${CLAN_OWN_HANDLE}（${CLAN_OWN_GRAMPS} 秦某）为真身态（不动）`);

if (!clanFamilies[CLAN_TOP_FAMILY]) err(`祖谱槽位 F000148 缺失（${CLAN_TOP_FAMILY}）`);
else if (!sameHandleSet(clanFamilies[CLAN_TOP_FAMILY].child_handles, [CLAN_OWN_HANDLE]))
  err(`F000148.child_handles 非预期（期望 [秦某]）`);
else ok('F000148（姬搢→秦某）槽位不动');

if (famShellOk && clanSourceOk) ok('状态判定：待迁移（家族树空壳 + 祖谱侧真身在位）');
else if (famMigratedOk && clanMigratedOk) ok('状态判定：已迁移（家族树真身 + 祖谱登记镜像）');
else if (famShellOk && clanMigratedOk) err('两侧状态不同步（家族树空壳、祖谱已建镜像）—— 拒绝继续');
else if (famMigratedOk && clanSourceOk) err('两侧状态不同步（家族树已迁、祖谱仍在位）—— 拒绝继续');
else if (!famShellOk && !famMigratedOk) err(`家族树既非「空壳」也非「已迁移」态：people=${Object.keys(famPeople).length} families=${Object.keys(famFamilies).length} founder_gramps_id=${famTree.founder_gramps_id ?? null}`);
else err(`祖谱既非「真身在位」也非「已迁移」态：people=${Object.keys(clanPeople).length} families=${Object.keys(clanFamilies).length}`);

const STATE = famShellOk && clanSourceOk ? '待迁移' : famMigratedOk && clanMigratedOk ? '已迁移' : '异常';

// ================= 计划 =================
/** 文件级计划：abs → { abs, rel, kind, before, afterText, after, note } */
const filePlan = new Map();
function planFile(abs, kind, afterText, note) {
  const rel = path.relative(ROOT, abs);
  const exists = fs.existsSync(abs);
  filePlan.set(abs, {
    abs,
    rel,
    kind,
    exists,
    before: exists ? md5(abs) : '',
    afterText,
    after: md5text(afterText),
    note,
  });
}

// 新镜像 handle（24 位随机 hex）+ 预铸编号（读计数器现值，**dry-run 不写计数器**）
function randomHandle() {
  let h;
  do {
    h = crypto.randomBytes(12).toString('hex');
  } while (h.length !== 24 || clanPeople[h] || famPeople[h]);
  return h;
}
const seqBeforeText = fs.existsSync(SEQ_FILE) ? fs.readFileSync(SEQ_FILE, 'utf8') : '';
const seqBeforeMd5 = seqBeforeText ? md5(SEQ_FILE) : '';
let seqObj = null;
try {
  seqObj = JSON.parse(seqBeforeText);
} catch {
  seqObj = null;
}
const plannedNext = Number(seqObj?.person?.next) || 0;
const plannedId = plannedNext > 0 ? fmtPersonId(plannedNext) : '';

let mirrorHandle = existingMirror?.handle || '';
let mirrorGrampsId = existingMirror?.gramps_id || String(meta.trees?.[clanKey]?.founder_gramps_id || '');
let mintNeeded = false;
if (STATE === '待迁移') {
  if (!plannedId) {
    console.log('❌ 计数器缺失或 person.next 非法，无法预算新镜像编号（绝不猜）—— 未写入任何文件（退出码 1）。');
    process.exit(1);
  }
  mirrorHandle = randomHandle();
  mirrorGrampsId = plannedId;
  mintNeeded = true;
}

const changes = [];
// 待迁移态：构建目标内容
if (STATE === '待迁移') {
  // 待迁移态新键内容取自宗谱侧源档：源档缺失即拒绝（绝不猜、不得拿家族树占位档充数）
  const missingSrcDetails = [FOUNDER_HANDLE, CHILD_HANDLE].filter((h) => !fs.existsSync(detailFile(CLAN_TREE, h)));
  if (missingSrcDetails.length) {
    for (const h of missingSrcDetails) console.error(`  ❌ 宗谱侧真身详情缺失，无法复制：${path.relative(ROOT, detailFile(CLAN_TREE, h))}`);
    console.error('❌ 前置复核失败，未写入任何文件（退出码 2）。');
    process.exit(2);
  }

  // (A) 家族树
  const famFounderNode = buildFamilyFounderNode(clanPeople[FOUNDER_HANDLE]);
  const famChildNode = deep(clanPeople[CHILD_HANDLE]);
  const famFamilyNode = deep(clanFamilies[MIGRATED_FAMILY_HANDLE]);
  const famNext = {
    _schema: famTree._schema,
    tree_id: famTree.tree_id,
    version: (famTree.version || 1) + 1,
    updated_at: now,
    people: { [FOUNDER_HANDLE]: famFounderNode, [CHILD_HANDLE]: famChildNode },
    families: { [MIGRATED_FAMILY_HANDLE]: famFamilyNode },
    founder_gramps_id: FOUNDER_GRAMPS,
  };
  planFile(treeFile(FAMILY_TREE), 'tree', JSON.stringify(famNext, null, 2), `${FAMILY_TREE}：写入真身始祖 + 随迁子 + 随迁家族（version +1）`);
  changes.push({ kind: '(A) 家族树写入 2 人 + F000137 + founder_gramps_id', file: path.relative(ROOT, treeFile(FAMILY_TREE)) });

  // (B) 祖谱
  const clanPeopleNext = {};
  for (const [k, v] of Object.entries(clanPeople)) {
    if (k === FOUNDER_HANDLE || k === CHILD_HANDLE) continue;
    clanPeopleNext[k] = v;
  }
  clanPeopleNext[mirrorHandle] = buildMirrorNode({
    handle: mirrorHandle,
    grampsId: mirrorGrampsId,
    src: clanPeople[FOUNDER_HANDLE],
    parentFamily: CLAN_PARENT_FAMILY,
  });
  const clanFamiliesNext = {};
  for (const [k, v] of Object.entries(clanFamilies)) {
    if (k === MIGRATED_FAMILY_HANDLE) continue;
    clanFamiliesNext[k] = { ...v };
  }
  clanFamiliesNext[CLAN_PARENT_FAMILY].child_handles = [mirrorHandle];
  const clanNext = {
    ...clanTree,
    version: (clanTree.version || 1) + 1,
    updated_at: now,
    people: clanPeopleNext,
    families: clanFamiliesNext,
  };
  planFile(treeFile(CLAN_TREE), 'tree', JSON.stringify(clanNext, null, 2), `${CLAN_TREE}：删真身/随迁子/F000137，建登记镜像 ${mirrorHandle}（version +1）`);
  changes.push({ kind: '(B) 祖谱删真身 + 建登记镜像 + F000149 挂镜像', file: path.relative(ROOT, treeFile(CLAN_TREE)) });

  // (C) tree-meta
  meta.trees[famKey] = famEntryWithFounder(meta.trees[famKey], {
    founderHandle: FOUNDER_HANDLE,
    founderGramps: FOUNDER_GRAMPS,
    founderName: FOUNDER_NAME,
    clanTreeId: CLAN_TREE,
    clanHandle: mirrorHandle,
  });
  meta.trees[clanKey] = clanEntryWithFounder(meta.trees[clanKey], {
    handle: mirrorHandle,
    gramps: mirrorGrampsId,
    name: FOUNDER_NAME,
  });
  changes.push({ kind: '(C) tree-meta 两树补 founder_*/clan_*', file: path.relative(ROOT, META_FILE) });

  // (D) 详情新键（先写）
  const srcFounderDetail = readJson(detailFile(CLAN_TREE, FOUNDER_HANDLE));
  const srcChildDetail = readJson(detailFile(CLAN_TREE, CHILD_HANDLE));
  planFile(
    detailFile(FAMILY_TREE, FOUNDER_HANDLE),
    'detail',
    JSON.stringify(buildFamilyDetail(srcFounderDetail, { treeId: FAMILY_TREE, handle: FOUNDER_HANDLE, node: famFounderNode, now }), null, 2),
    `${FAMILY_TREE} 始祖详情 ← 宗谱源档（改写落点 + 本树身份键）`,
  );
  planFile(
    detailFile(FAMILY_TREE, CHILD_HANDLE),
    'detail',
    JSON.stringify(buildFamilyDetail(srcChildDetail, { treeId: FAMILY_TREE, handle: CHILD_HANDLE, node: famChildNode, now }), null, 2),
    `${FAMILY_TREE} 随迁子详情 ← 宗谱源档`,
  );
  changes.push({ kind: '(D) 详情新键 qin_31206_01:* × 2（先写）', file: path.relative(ROOT, DETAILS_DIR) });
}

// tree-meta 文本：仅当序列化结果与现值不同才写
const metaTextAfter = JSON.stringify(meta, null, 2) + (metaTextBefore.endsWith('\n') ? '\n' : '');
if (STATE === '待迁移' && metaTextAfter !== metaTextBefore) {
  planFile(META_FILE, 'meta', metaTextAfter, 'tree-meta：qin_31206_01 补 founder_*/clan_* + qin_31206 founder_* 改指镜像');
}

/** 旧详情删除计划（先写新键、再删旧键；--keep-source-detail 退回） */
const deletePlan = [];
if (STATE === '待迁移' && !KEEP_SOURCE_DETAIL) {
  for (const h of [FOUNDER_HANDLE, CHILD_HANDLE]) {
    const abs = detailFile(CLAN_TREE, h);
    if (fs.existsSync(abs)) deletePlan.push({ abs, rel: path.relative(ROOT, abs), md5: md5(abs) });
  }
}

// ================= 打印 =================
console.log('═'.repeat(118));
console.log('秦氏始祖真源反转（跨树搬迁回迁 · 变体 A）—— scripts/migrate-qin-founder-reversal-2026-10.mjs');
console.log(`树目录   ：${TREES_DIR}${IS_COPY ? '（副本演练）' : '（★真源★）'}`);
console.log(`详情目录 ：${DETAILS_DIR}${IS_COPY ? '（副本）' : '（★真源★）'}`);
console.log(`tree-meta：${META_FILE}${IS_META_COPY ? '（副本）' : '（★真源★）'}  md5(前)=${metaBeforeMd5}`);
console.log(`计数器   ：${SEQ_FILE}  md5(前)=${seqBeforeMd5 || '<不存在>'}  person.next=${plannedNext || '<未知>'}`);
console.log(`模式     ：${APPLY ? '--apply（写盘）' : 'dry-run（不写盘）'} / 旧详情：${KEEP_SOURCE_DETAIL ? '--keep-source-detail（保留）' : '默认删除（连带删旧键）'}`);
console.log(`状态     ：${STATE}`);
console.log('═'.repeat(118));

for (const m of checks) console.log(`  ${m}`);
for (const e of errors) console.log(`  ❌ ${e}`);

if (STATE === '异常' || errors.length) {
  console.log(`\n❌ 前置复核失败，**未写入 / 未删除任何文件**（退出码 1）。`);
  process.exit(1);
}

if (STATE === '已迁移') {
  console.log(`\n✅ 目标形态已就位（家族树真身 + 祖谱登记镜像）：**0 改动**，全部文件一个字节不改。`);
  console.log(`   祖谱登记镜像 handle = ${mirrorHandle} · gramps_id = ${mirrorGrampsId}`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(buildSummary({ applied: false, backupDir: '' }), null, 2) + '\n', 'utf8');
  process.exit(0);
}

// 待迁移：打印计划
console.log(`\n新登记镜像：handle=${mirrorHandle}  gramps_id=${mirrorGrampsId || '<待铸号>'}（预铸于 person.next=${plannedNext}）`);
console.log(`镜像备注（R4 工厂口径）：${MIRROR_NOTE}`);
for (const ch of changes) console.log(`  ▸ ${ch.kind}  →  ${ch.file}`);
console.log(`\n文件级 md5（前 → 后，预算）：`);
for (const f of filePlan.values()) {
  console.log(`  ${w(f.kind, 8)}${w(f.rel, 62)}${f.exists ? f.before : '<不存在>'} → ${f.after}`);
}
if (mintNeeded) {
  console.log(`  ${w('seq', 8)}${w(path.relative(ROOT, SEQ_FILE), 62)}person.next ${plannedNext} → ${plannedNext + 1}`);
}
if (deletePlan.length) {
  console.log(`待删文件（删前先落备份 deleted-source-details/ + md5 清单）：`);
  for (const d of deletePlan) console.log(`  ${w('delete', 8)}${w(d.rel, 62)}md5=${d.md5}`);
}

// ---- dry-run：证明零写入 ----
if (!APPLY) {
  const touched = [...filePlan.values()].filter((f) => f.exists);
  const drift = touched.filter((f) => md5(f.abs) !== f.before);
  const metaNow = md5(META_FILE);
  const seqNow = fs.existsSync(SEQ_FILE) ? md5(SEQ_FILE) : '';
  console.log(`\nmd5（tree-meta 前/后）= ${metaBeforeMd5} / ${metaNow}  ${metaNow === metaBeforeMd5 ? '未写盘 ✅' : '⚠️ 已变'}`);
  console.log(`md5（计数器 前/后）= ${seqBeforeMd5 || '<不存在>'} / ${seqNow || '<不存在>'}  ${seqNow === seqBeforeMd5 ? '未写盘 ✅' : '⚠️ 已变'}`);
  console.log(`待写文件现盘 md5 复算：${drift.length === 0 ? `全部与「前」一致（${touched.length} 个文件，目标侧零写入 ✅）` : `⚠️ ${drift.length} 个已变`}`);
  const delDrift = deletePlan.filter((d) => !fs.existsSync(d.abs) || md5(d.abs) !== d.md5);
  console.log(`待删文件现盘复核：${delDrift.length === 0 ? `全部仍在且 md5 一致（${deletePlan.length} 个文件，本轮零删除 ✅）` : `⚠️ ${delDrift.length} 个已变/已缺`}`);
  console.log('（dry-run，未写盘、未删文件。加 --apply 才真正写入并连带删除旧详情键。）');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(buildSummary({ applied: false, backupDir: '' }), null, 2) + '\n', 'utf8');
  process.exit(0);
}

// ================= 写入 =================
const stamp = new Date().toISOString().slice(0, 10);
let bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-qin-founder-reversal${IS_COPY ? '-copy' : ''}`);
for (let i = 2; fs.existsSync(bakDir); i += 1) {
  bakDir = path.join(os.homedir(), 'jiazu-backups', `${stamp}-qin-founder-reversal${IS_COPY ? '-copy' : ''}-${i}`);
}
fs.mkdirSync(bakDir, { recursive: true });

// 备份：改动到的现有文件（含计数器）+ 被删旧详情
const manifest = [];
const rollback = [];
for (const f of filePlan.values()) {
  if (f.exists) {
    const dest = path.join(bakDir, f.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f.abs, dest);
    manifest.push(`${f.before}  ${f.rel}`);
    rollback.push(`cp ${dest} ${f.abs}`);
  } else {
    manifest.push(`<不存在，无需备份>  ${f.rel}`);
    rollback.push(`rm -f ${f.abs}`);
  }
}
if (mintNeeded && seqBeforeMd5) {
  const rel = path.relative(ROOT, SEQ_FILE);
  const dest = path.join(bakDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(SEQ_FILE, dest);
  manifest.push(`${seqBeforeMd5}  ${rel}`);
  rollback.push(`cp ${dest} ${SEQ_FILE}`);
}
fs.writeFileSync(path.join(bakDir, 'md5-before.txt'), manifest.join('\n') + '\n', 'utf8');

// ---- 铸号（经 lib/id-seq.js；只抬不降，同步写集合文件）----
if (mintNeeded) {
  // 本脚本是本地文件手术：强制 local 模式，确保 id-seq 走 migrate-output/collections 落盘而非云端 SDK
  process.env.COMPAT_SOURCE = 'local';
  const idSeqPath = path.join(REPO, 'cloudfunctions', 'compat-api', 'lib', 'id-seq.js');
  const { reservePersonIds } = await import(pathToFileURL(idSeqPath).href);
  const ids = await reservePersonIds(1);
  mintedId = String(ids[0] || '');
  if (!mintedId) {
    console.log('\n❌ 铸号失败（lib/id-seq.js 未返回编号）。');
    process.exit(1);
  }
  if (mintedId !== mirrorGrampsId) {
    console.log(`\n❌ 铸号与预算不符：实际 ${mintedId} vs 预算 ${mirrorGrampsId}（计数器被外部改动）—— 拒绝继续写树`);
    process.exit(1);
  }
  // 预算 == 实际 ⇒ filePlan 里的树文本（含镜像 gramps_id）已正确，无需重建
  console.log(`\n🪙 铸号：${mintedId}（person.next ${plannedNext} → ${plannedNext + 1}，已同步 ${path.relative(ROOT, SEQ_FILE)}）`);
}

// ---- 删旧详情前：先落备份副本 + md5 ----
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
    rollback.push(`cp ${dest} ${d.abs}   # 恢复被删的旧详情`);
  }
  fs.writeFileSync(path.join(delDir, 'md5.txt'), deletedManifest.join('\n') + '\n', 'utf8');
  console.log(`🗄️  旧详情备份：${delDir}（${deletePlan.length} 个 + md5.txt）`);
}

// ---- 写树 / 详情 / meta（顺序：先写新键）----
let written = 0;
for (const f of filePlan.values()) {
  fs.writeFileSync(f.abs, f.afterText, 'utf8');
  written += 1;
}

// ---- 写后自校验 ----
let bad = 0;
console.log('\n写后自校验：');
for (const f of filePlan.values()) {
  const after = fs.existsSync(f.abs) ? md5(f.abs) : '';
  const okOne = after === f.after;
  if (!okOne) bad += 1;
  console.log(`  ${okOne ? '✅' : '⚠️'} ${w(f.rel, 62)}md5 ${f.before || '<不存在>'} → ${after}  （预算 ${f.after}）`);
  try {
    JSON.parse(fs.readFileSync(f.abs, 'utf8'));
  } catch (e) {
    bad += 1;
    console.log(`  ❌ JSON.parse 失败：${f.rel} — ${e.message}`);
  }
}

// ---- 删旧键（顺序：写完新键之后；对齐 §29-3「先重传、再删旧键」）----
let deleted = 0;
console.log('\n旧详情删除（备份已就位 → 删除 → 复核）：');
for (const d of deletePlan) {
  fs.unlinkSync(d.abs);
  const gone = !fs.existsSync(d.abs);
  if (!gone) bad += 1;
  const copyOk = md5(path.join(delDir, path.basename(d.abs))) === d.md5;
  if (!copyOk) bad += 1;
  deleted += 1;
  console.log(`  ${gone && copyOk ? '✅' : '⚠️'} 已删 ${w(d.rel, 62)}（原 md5=${d.md5}；备份副本 ${copyOk ? 'md5 一致' : 'md5 不符'}）`);
}
if (!deletePlan.length) console.log(KEEP_SOURCE_DETAIL ? '  （--keep-source-detail：保留旧详情键）' : '  （无待删旧详情）');

// ---- 结构化不变量复核（6 条判据；在「先写新键、再删旧键」之后，故能同时看到新键在/旧键无）----
console.log('\n不变量复核（目标形态）：');
function vcheck(label, cond) {
  verdict.push({ label, pass: !!cond });
  if (!cond) bad += 1;
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
}
const FT = readJson(treeFile(FAMILY_TREE));
const CT = readJson(treeFile(CLAN_TREE));
const MT = readJson(META_FILE);
const ftPeople = Object.keys(FT.people || {});
const ctPeople = Object.keys(CT.people || {});
const ctFamilies = Object.keys(CT.families || {});
const ctMirror = Object.values(CT.people || {}).find((p) => String(p.external_person_handle || '') === FOUNDER_HANDLE && String(p.external_mirror || '') === 'true');
vcheck(`① 家族树 people = 2 且 I000275/I000274 在位（founder_gramps_id='I000275'）`,
  ftPeople.length === 2 && ftPeople.includes(FOUNDER_HANDLE) && ftPeople.includes(CHILD_HANDLE) &&
  String(FT.people[FOUNDER_HANDLE].gramps_id) === FOUNDER_GRAMPS && String(FT.people[CHILD_HANDLE].gramps_id) === CHILD_GRAMPS &&
  String(FT.founder_gramps_id || '') === FOUNDER_GRAMPS);
vcheck(`①b 家族树始祖为根（parent_family=''）且 6 个 external_* 全空串、键在位`,
  String(FT.people[FOUNDER_HANDLE].parent_family || '') === '' && CLEAR_FIELDS.every((k) => k in FT.people[FOUNDER_HANDLE] && FT.people[FOUNDER_HANDLE][k] === ''));
vcheck(`①c 家族树 families = {F000137}（father=真身，child=[秦永葆]）`,
  Object.keys(FT.families || {}).length === 1 && !!FT.families[MIGRATED_FAMILY_HANDLE] &&
  String(FT.families[MIGRATED_FAMILY_HANDLE].father_handle || '') === FOUNDER_HANDLE &&
  sameHandleSet(FT.families[MIGRATED_FAMILY_HANDLE].child_handles, [CHILD_HANDLE]));
vcheck(`② 祖谱 people = 3（姬搢镜像/秦某/新登记镜像）`,
  ctPeople.length === 3 && ctPeople.includes(CLAN_TOP_MIRROR_HANDLE) && ctPeople.includes(CLAN_OWN_HANDLE) && !!ctMirror);
vcheck(`②b 祖谱 families = {F000148,F000149}（F000137 已删）；F000149.child_handles=[镜像]`,
  ctFamilies.length === 2 && ctFamilies.includes(CLAN_TOP_FAMILY) && ctFamilies.includes(CLAN_PARENT_FAMILY) &&
  !CT.families[MIGRATED_FAMILY_HANDLE] && sameHandleSet(CT.families[CLAN_PARENT_FAMILY]?.child_handles, [ctMirror?.handle]));
vcheck(`②c 祖谱登记镜像外指正确（external_tree=qin_31206_01 / link_type=founder / mirror=true / note 逐字）`,
  !!ctMirror && String(ctMirror.external_tree) === FAMILY_TREE && String(ctMirror.external_link_type) === 'founder' &&
  String(ctMirror.external_mirror) === 'true' && String(ctMirror.external_relation_note) === MIRROR_NOTE);
vcheck(`②d 姬搢镜像 / 秦某 一字不动`,
  String(CT.people[CLAN_TOP_MIRROR_HANDLE]?.external_tree) === 'zhonghua' && extCleared(CT.people[CLAN_OWN_HANDLE] || {}));
vcheck(`③ tree-meta qin_31206_01 五字段正确`,
  String(MT.trees?.[famKey]?.founder_handle) === FOUNDER_HANDLE && String(MT.trees?.[famKey]?.founder_gramps_id) === FOUNDER_GRAMPS &&
  String(MT.trees?.[famKey]?.founder_name) === FOUNDER_NAME && String(MT.trees?.[famKey]?.clan_tree_id) === CLAN_TREE &&
  String(MT.trees?.[famKey]?.clan_handle) === ctMirror?.handle);
vcheck(`③b tree-meta qin_31206 三字段正确`,
  String(MT.trees?.[clanKey]?.founder_handle) === ctMirror?.handle &&
  String(MT.trees?.[clanKey]?.founder_gramps_id) === String(ctMirror?.gramps_id) && String(MT.trees?.[clanKey]?.founder_name) === FOUNDER_NAME);
vcheck(`④ 详情新键在位、旧键不存在、gramps_id/name 与本树节点现值一致`,
  [FOUNDER_HANDLE, CHILD_HANDLE].every((h) => {
    const np = detailFile(FAMILY_TREE, h);
    const op = detailFile(CLAN_TREE, h);
    if (!fs.existsSync(np)) return false;
    if (fs.existsSync(op) !== KEEP_SOURCE_DETAIL) return false;
    const d = readJson(np);
    return d._id === `${FAMILY_TREE}:${h}` && String(d.tree_id) === FAMILY_TREE && String(d.gramps_id) === String(FT.people[h].gramps_id) && String(d.name) === String(FT.people[h].name);
  }));

console.log(`\n📦 备份：${bakDir}（${written} 个改动文件 + md5-before.txt + summary.json${deletePlan.length ? ` + deleted-source-details/（${deletePlan.length} 个 + md5.txt）` : ''}）`);
console.log(`✅ 已写入 ${written} 个文件 / 已删 ${deleted} 个旧详情 / 新镜像 ${ctMirror?.handle}（${ctMirror?.gramps_id}）`);
console.log('回滚（逐条）：');
for (const r of rollback) console.log(`  ${r}`);
console.log('\n⚠️ 真源 apply 后须重启本地 compat-api（树 JSON 无磁盘指纹，长驻 treeCache 会回写旧快照）；云端生产副本另需重跑 upload-migrated-to-cloudbase.mjs + 手工删旧详情键。');

const summary = buildSummary({ applied: true, backupDir: bakDir, deletedManifest, mirror: ctMirror });
fs.writeFileSync(path.join(bakDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2) + '\n', 'utf8');

if (bad) {
  console.log(`\n❌ ${bad} 项写后校验不符（退出码 1）。`);
  process.exit(1);
}
console.log('\n✅ 全部写后自校验 + 不变量复核通过。');

function buildSummary({ applied, backupDir, deletedManifest = [], mirror = null }) {
  return {
    script: 'scripts/migrate-qin-founder-reversal-2026-10.mjs',
    ruling: '秦氏始祖真源反转（跨树搬迁回迁 · 变体 A：家族树始祖 = 真身；祖谱持 R4 只读登记镜像）',
    at: new Date().toISOString(),
    applied,
    keep_source_detail: KEEP_SOURCE_DETAIL,
    state: STATE,
    targets: { out_dir: OUT_DIR, details_dir: DETAILS_DIR, meta_file: META_FILE, seq_file: SEQ_FILE, is_copy: IS_COPY, is_meta_copy: IS_META_COPY },
    backup_dir: backupDir,
    chain: { family_tree_id: FAMILY_TREE, clan_tree_id: CLAN_TREE, founder_handle: FOUNDER_HANDLE, founder_gramps_id: FOUNDER_GRAMPS, child_handle: CHILD_HANDLE, child_gramps_id: CHILD_GRAMPS, migrated_family: MIGRATED_FAMILY_HANDLE },
    mirror: mirror ? { handle: mirror.handle, gramps_id: mirror.gramps_id, external_tree: mirror.external_tree, external_person_handle: mirror.external_person_handle, external_relation_note: mirror.external_relation_note } : null,
    minted_person_id: mintedId || null,
    md5: {
      'config/tree-meta.json': { before: metaBeforeMd5, after: fs.existsSync(META_FILE) ? md5(META_FILE) : '' },
      'collections/jiazu_id_seq.json': { before: seqBeforeMd5, after: fs.existsSync(SEQ_FILE) ? md5(SEQ_FILE) : '' },
      files: [...filePlan.values()].map((f) => ({
        path: f.rel,
        kind: f.kind,
        before: f.before || null,
        after_expected: f.after,
        after_actual: fs.existsSync(f.abs) ? md5(f.abs) : null,
      })),
      deleted_source_details: deletePlan.map((d) => ({ path: d.rel, md5_before: d.md5, exists_after: fs.existsSync(d.abs), backup_copy: deletedManifest.find((l) => l.includes(d.rel)) || '' })),
    },
    checks: checks.map((c) => c.replace(/^✅ /, '')),
    verdict,
    changes,
  };
}
