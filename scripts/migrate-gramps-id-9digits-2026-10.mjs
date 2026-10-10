#!/usr/bin/env node
/**
 * 编号迁移（批 2 · 本地真源）—— 把全站 `gramps_id` 补零到新口径（只补零、不改值、不重排）
 * 规格：docs/id-system.spec.md §9（存储/显示分离 · Kevin 2026-10-10 拍定）
 *
 * 目标口径：
 *   - 人：`I0052` / `I000052` / `0052` ⇒ **9 位纯数字、无前缀**：`000000052`
 *   - 家庭：`F0079` / `F000079` ⇒ **`F` + 6 位、前缀保留**：`F000079`
 *
 * 改写面（逐项）：
 *   ① migrate-output/trees/*.json      —— people / families 的 `gramps_id` + 顶层 `founder_gramps_id`
 *   ② migrate-output/details/*.json    —— `gramps_id`
 *   ③ config/tree-meta.json            —— trees[*].`founder_gramps_id`
 *   ④ migrate-output/collections/*.json 中含 `gramps_id` 键者（现 = jiapu_founder_requests.json）
 *
 * **一律不动**：`handle` / `legacy_gramps_id` / `external_*` 指针 / 其它一切字段（§9-4 §2）。
 *        历史报表 `migrate-output/id-migration*.json` 即便含编号也**登记并跳过**（不改）。
 *
 * 用法：
 *   node scripts/migrate-gramps-id-9digits-2026-10.mjs                # dry-run（默认，不落盘）
 *   node scripts/migrate-gramps-id-9digits-2026-10.mjs --apply        # 落盘（先自动备份 + MD5 台账）
 *
 * 环境变量（副本演练，指向副本而非真源）：
 *   COMPAT_OUT_DIR   数据根（默认 <repo>/migrate-output）
 *   COMPAT_META_FILE tree-meta 文件（默认 <repo>/config/tree-meta.json）
 *   BACKUP_DIR       备份根（默认 ~/jiazu-backups/2026-10-10-gramps-id-9digits）
 *
 * 设计要点：
 *   - **默认 dry-run / 仅 --apply 写盘**（本仓脚本惯例）。
 *   - **幂等**：新形态再跑 = 零变更（`migrateValue` 返回同值即跳过）。
 *   - **文本级只改字面值**：正则精确命中 `"gramps_id"` / `"founder_gramps_id"` 两个键，
 *     `"legacy_gramps_id"`（前缀是 `_`）与 `"external_*"` 天然不命中 ⇒ 其余字节原样保留（含缩进）。
 *   - **数值不变自证**：对每个文件做「去前缀去零后的数值键」规范化后前后深比较 ⇒ 恒等。
 *   - 共用纯函数 `idKey`（lib/id-seq.js）**只读交叉核验**本脚本本地镜像逻辑，**不改其语义**。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), '..');

// 只读引入共用纯函数 idKey（lib/id-seq.js）用于交叉核验；**不改其语义**。
let sharedIdKey = null;
try {
  const mod = await import(pathToFileURL(path.join(REPO, 'cloudfunctions', 'compat-api', 'lib', 'id-seq.js')).href);
  if (typeof mod.idKey === 'function') sharedIdKey = mod.idKey;
} catch { /* 纯核验，失败不影响迁移 */ }

// ---------- 参数 / 环境 ----------
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const OUT_DIR = process.env.COMPAT_OUT_DIR
  ? path.resolve(process.env.COMPAT_OUT_DIR)
  : path.join(REPO, 'migrate-output');
const META_FILE = process.env.COMPAT_META_FILE
  ? path.resolve(process.env.COMPAT_META_FILE)
  : path.join(REPO, 'config', 'tree-meta.json');
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(os.homedir(), 'jiazu-backups', '2026-10-10-gramps-id-9digits');

// 历史报表：含编号也不改（只登记）
const HISTORICAL_REPORTS = new Set(['id-migration.json', 'id-migration.report.json']);

// ---------- 目标口径 ----------
const PERSON_WIDTH = 9; // 纯数字、无前缀
const FAMILY_WIDTH = 6; // F + 6 位

/**
 * 数值规范键（**镜像** lib/id-seq.js#idKey 语义）：去可选前缀（I/F）+ 去前导零 → `${kind}:${数值}`。
 * 本脚本不 import 该模块改语义；只在末尾做一次只读交叉核验（见 crossCheckShared）。
 */
function localIdKey(ref) {
  const m = String(ref == null ? '' : ref).trim().match(/^([IF]?)(\d+)$/i);
  if (!m) return '';
  const kind = (m[1] || '').toUpperCase() === 'F' ? 'family' : 'person';
  return `${kind}:${parseInt(m[2], 10)}`;
}

/** 单个编号字面值 → 新形态；非编号写法（handle / 空 / 含其它字母）→ null（不动） */
function migrateValue(raw) {
  const s = String(raw);
  const m = s.match(/^([IF]?)(\d{1,9})$/i);
  if (!m) return null;
  const prefix = (m[1] || '').toUpperCase();
  const num = parseInt(m[2], 10);
  if (!Number.isFinite(num)) return null;
  return prefix === 'F'
    ? 'F' + String(num).padStart(FAMILY_WIDTH, '0')
    : String(num).padStart(PERSON_WIDTH, '0');
}

// 精确命中 `"gramps_id"` / `"founder_gramps_id"` 两键（`"legacy_gramps_id"` / `"external_*"` 不命中）
const ID_KEY_RE = /"((?:founder_)?gramps_id)"(\s*:\s*")([^"]*)"/g;

/** 文本级改写：返回新文本 + 逐键变更明细 */
function migrateText(text) {
  const changes = []; // { key, from, to }
  const out = text.replace(ID_KEY_RE, (full, key, mid, val) => {
    const nv = migrateValue(val);
    if (nv == null) return full;     // 非编号写法 → 不动
    if (nv === val) return full;     // 已是新形态 → 幂等跳过
    changes.push({ key, from: val, to: nv });
    return `"${key}"${mid}${nv}"`;
  });
  return { out, changes };
}

// ---------- 数值规范化深比较（数值不变自证） ----------
function numericKey(v) {
  const m = String(v).match(/^([IF]?)(\d+)$/i);
  if (!m) return 'RAW:' + String(v);
  const k = (m[1] || '').toUpperCase() === 'F' ? 'F' : '';
  return '#' + k + parseInt(m[2], 10);
}

/** 递归把 `gramps_id` / `founder_gramps_id` 的值替换成其数值键，其余原样 → JSON 串 */
function canonical(obj) {
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === 'object') {
      const r = {};
      for (const k of Object.keys(o)) {
        r[k] = (k === 'gramps_id' || k === 'founder_gramps_id') ? numericKey(o[k]) : walk(o[k]);
      }
      return r;
    }
    return o;
  };
  return JSON.stringify(walk(obj));
}

// ---------- 工具 ----------
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const readText = (p) => fs.readFileSync(p, 'utf8');
const jsonFilesIn = (dir) => {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
  } catch { return []; }
};
const relName = (p) => {
  const r = path.relative(REPO, p);
  return r.startsWith('..') ? path.basename(p) : r;
};
// 命中 `gramps_id` / `founder_gramps_id` 两键之一（`legacy_gramps_id` / `external_*` 不算）
const hasKeyLiteral = (text) => /"(?:founder_)?gramps_id"\s*:/.test(text);

// ---------- 收集待迁移文件（含全仓数据面扫描） ----------
function collectTargets() {
  const trees = jsonFilesIn(path.join(OUT_DIR, 'trees'));
  const details = jsonFilesIn(path.join(OUT_DIR, 'details'));
  const collections = jsonFilesIn(path.join(OUT_DIR, 'collections')).filter((p) => hasKeyLiteral(readText(p)));
  const meta = fs.existsSync(META_FILE) && hasKeyLiteral(readText(META_FILE)) ? [META_FILE] : [];

  // 全仓数据面扫描：OUT_DIR 下所有含 `"gramps_id"` 的 json 文件 → 上列之外也须改（历史报表除外）
  const scanned = [];
  const walk = (dir) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.json') && hasKeyLiteral(readText(p))) scanned.push(p);
    }
  };
  walk(OUT_DIR);

  const known = new Set([...trees, ...details, ...collections, ...meta]);
  const extra = scanned.filter((p) => !known.has(p));
  const historicalHits = extra.filter((p) => HISTORICAL_REPORTS.has(path.basename(p)));
  const extraTargets = extra.filter((p) => !HISTORICAL_REPORTS.has(path.basename(p)));

  return { trees, details, collections, meta, extraTargets, historicalHits };
}

// ---------- 主流程 ----------
function main() {
  const { trees, details, collections, meta, extraTargets, historicalHits } = collectTargets();
  // 顺序：trees / details / collections / meta / extras（去重）
  const targets = [...new Set([...trees, ...details, ...collections, ...meta, ...extraTargets])];

  const report = { trees: 0, details: 0, collections: 0, meta: 0, extra: 0 };
  const perFile = [];
  const invariantFails = [];
  let changedFiles = 0;
  const pendingWrites = []; // { file, origText, newText }
  const globalChanges = [];

  for (const file of targets) {
    const origText = readText(file);
    const { out: newText, changes } = migrateText(origText);

    // 数值不变 + 其它字段不变自证（前后规范化 JSON 必须恒等）
    try {
      const a = canonical(JSON.parse(origText));
      const b = canonical(JSON.parse(newText));
      if (a !== b) invariantFails.push({ file: relName(file), reason: 'canonical mismatch' });
    } catch (e) {
      invariantFails.push({ file: relName(file), reason: 'json parse: ' + e.message });
    }

    if (changes.length === 0) continue;
    changedFiles++;
    globalChanges.push(...changes);

    // 归类计数
    if (trees.includes(file)) report.trees += changes.length;
    else if (details.includes(file)) report.details += changes.length;
    else if (collections.includes(file)) report.collections += changes.length;
    else if (meta.includes(file)) report.meta += changes.length;
    else report.extra += changes.length;

    perFile.push({ file: relName(file), changes: changes.length });
    pendingWrites.push({ file, origText, newText });
  }

  // ---- dry-run 报告 ----
  console.log('=== 编号迁移（批 2 · 本地真源）gramps_id ⇒ 9 位/F+6 位 ===');
  console.log(`模式：${APPLY ? 'APPLY（写盘）' : 'DRY-RUN（不落盘）'}`);
  console.log(`数据根 OUT_DIR   = ${OUT_DIR}`);
  console.log(`tree-meta        = ${META_FILE}`);
  console.log(`备份根 BACKUP_DIR = ${BACKUP_DIR}`);
  console.log(`扫描文件：trees ${trees.length} / details ${details.length} / collections(含键) ${collections.length} / meta ${meta.length} / 额外 ${extraTargets.length}`);
  if (historicalHits.length) {
    console.log(`登记跳过（历史报表，不改）：${historicalHits.map(relName).join(', ')}`);
  }
  console.log('--- 逐项变更数 ---');
  console.log(`  trees 节点 gramps_id(+founder) : ${report.trees}`);
  console.log(`  details gramps_id              : ${report.details}`);
  console.log(`  collections gramps_id          : ${report.collections}`);
  console.log(`  tree-meta founder_gramps_id    : ${report.meta}`);
  console.log(`  额外命中点                      : ${report.extra}`);
  console.log(`  合计变更                        : ${globalChanges.length}（改动文件 ${changedFiles} 个）`);
  console.log('--- 变更文件（前 20） ---');
  for (const r of perFile.slice(0, 20)) console.log(`  ${r.file}  ×${r.changes}`);
  if (perFile.length > 20) console.log(`  ... 另 ${perFile.length - 20} 个文件`);

  // 样例
  console.log('--- 样例（前 8 条） ---');
  for (const c of globalChanges.slice(0, 8)) console.log(`  ${c.key}: ${c.from} ⇒ ${c.to}`);

  // ---- 自证 ----
  const invariantOk = invariantFails.length === 0;
  console.log(`--- 数值不变自证：${invariantOk ? 'PASS（前后规范化恒等）' : 'FAIL'} ---`);
  for (const f of invariantFails.slice(0, 10)) console.log(`  ✗ ${f.file}: ${f.reason}`);

  // 格式自证 + 唯一性复查（读改后文本；dry-run 用内存 newText）
  const formatProblems = [];
  const personKeys = new Set();
  const familyKeys = new Set();
  const personDup = [];
  const familyDup = [];
  const personSeen = new Set();
  const familySeen = new Set();
  const treeFiles = targets.filter((f) => trees.includes(f));
  for (const file of targets) {
    const t = pendingWrites.find((w) => w.file === file);
    const text = t ? t.newText : readText(file);
    let obj;
    try { obj = JSON.parse(text); } catch { continue; }
    // trees：按 people/families 归类校验格式 + 唯一性
    if (obj.people && obj.families) {
      for (const p of Object.values(obj.people)) {
        if (typeof p.gramps_id !== 'string') continue;
        if (!/^\d{9}$/.test(p.gramps_id)) formatProblems.push(`人 ${p.gramps_id}（${relName(file)}）`);
        const k = localIdKey(p.gramps_id);
        if (personSeen.has(k)) personDup.push(k); personSeen.add(k); personKeys.add(k);
      }
      for (const fam of Object.values(obj.families)) {
        if (typeof fam.gramps_id !== 'string') continue;
        if (!/^F\d{6}$/.test(fam.gramps_id)) formatProblems.push(`家庭 ${fam.gramps_id}（${relName(file)}）`);
        const k = localIdKey(fam.gramps_id);
        if (familySeen.has(k)) familyDup.push(k); familySeen.add(k); familyKeys.add(k);
      }
    }
    // details / meta / collections：仅格式自证（按前缀判类别）
    const checkOne = (v, where) => {
      if (typeof v !== 'string') return;
      if (/^[IF]?\d+$/.test(v)) {
        const isFam = /^F/i.test(v);
        if (isFam ? !/^F\d{6}$/.test(v) : !/^\d{9}$/.test(v)) formatProblems.push(`${v}（${where}）`);
      }
    };
    const rec = (o) => {
      if (Array.isArray(o)) return o.forEach(rec);
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          if (k === 'gramps_id' || k === 'founder_gramps_id') checkOne(v, relName(file));
          else rec(v);
        }
      }
    };
    rec(obj);
  }
  const crossClass = [...personKeys].filter((p) => familyKeys.has(p)); // 人=纯数字键，家庭=F 键 ⇒ 必空
  console.log('--- 格式自证 ---');
  console.log(`  人 /^\\d{9}$/ + 家庭 /^F\\d{6}$/ 违例：${formatProblems.length}`);
  for (const f of formatProblems.slice(0, 10)) console.log(`  ✗ ${f}`);
  console.log('--- 唯一性复查 ---');
  console.log(`  人数值去重 = ${personKeys.size}（应为 324）；家庭 = ${familyKeys.size}（应为 227）`);
  console.log(`  人重复组 = ${personDup.length}；家庭重复组 = ${familyDup.length}；跨类撞号 = ${crossClass.length}`);

  // 只读交叉核验：本地镜像逻辑 vs 共用 idKey
  crossCheckShared(globalChanges);

  if (!APPLY) {
    console.log('\n[dry-run] 未写盘。加 --apply 落盘。');
    process.exit(invariantOk && formatProblems.length === 0 ? 0 : 1);
  }

  // ---- APPLY：备份 + 写盘 + MD5 台账 ----
  if (!pendingWrites.length) {
    console.log('\n[apply] 零变更（幂等）——不写盘、不备份。');
    process.exit(invariantOk ? 0 : 1);
  }
  fs.mkdirSync(path.join(BACKUP_DIR, 'files'), { recursive: true });
  const ledger = [];
  ledger.push(`# gramps_id 9digits 迁移 MD5 台账`);
  ledger.push(`# 时间：${new Date().toISOString()}`);
  ledger.push(`# 口径：人 ⇒ 9 位纯数字；家庭 ⇒ F+6 位（只补零、不改值）`);
  ledger.push(`# 格式：<md5_before> -> <md5_after>  <相对路径>`);
  let wrote = 0;
  for (const w of pendingWrites) {
    const rel = relName(w.file);
    const before = md5(Buffer.from(w.origText, 'utf8'));
    // 备份原文件副本（保留相对路径）
    const bak = path.join(BACKUP_DIR, 'files', rel);
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.copyFileSync(w.file, bak);
    // 写盘
    fs.writeFileSync(w.file, w.newText);
    const after = md5(Buffer.from(w.newText, 'utf8'));
    ledger.push(`${before} -> ${after}  ${rel}`);
    wrote++;
  }
  fs.writeFileSync(path.join(BACKUP_DIR, 'MD5-LEDGER.txt'), ledger.join('\n') + '\n');
  console.log(`\n[apply] 已写盘 ${wrote} 个文件；备份 + 台账 ⇒ ${BACKUP_DIR}`);
}

/** 只读交叉核验：本脚本数值键 vs 共用 idKey（lib/id-seq.js）；二者必须逐一相等（不改共用语义） */
function crossCheckShared(changes) {
  if (!sharedIdKey) {
    console.log('--- 交叉核验：共用 idKey 不可用（跳过）---');
    return;
  }
  const mirrors = changes.every((c) => localIdKey(c.from) === sharedIdKey(c.from) && localIdKey(c.to) === sharedIdKey(c.to));
  const disagree = changes.filter((c) => localIdKey(c.from) !== sharedIdKey(c.from) || localIdKey(c.to) !== sharedIdKey(c.to));
  console.log(`--- 交叉核验：变更前后 localIdKey 与共用 idKey 一一相等 = ${mirrors ? 'PASS' : 'FAIL'} ---`);
  for (const c of disagree.slice(0, 5)) console.log(`  ✗ ${c.from} ⇒ ${c.to}`);
}

main();
