#!/usr/bin/env node
/**
 * 一次性数据手术（路 B 重构 · 遗留件补单）：三个本地集合单文档 `global` → **主体系文档**
 *
 *   ① jiapu_spirit    ：`{global:{trees:{<tree_id>:entry}}}`      → **每树一档** `_id = tree_id`，档体 = 原 `trees[tree_id]` 值 + `version`
 *   ② jiapu_messages  ：`{global:{items:{<phone>:…},warned:{…}}}` → **每手机号一档** `_id = 手机号明文`，档体 = `{items:[…], warned:{…}}` + `version`
 *   ③ jiapu_ops_logs  ：`{global:{logs:[…]}}`                      → **每笔一档** `_id = 该条日志 id`，档体 = 该条日志自身 + `version`
 *
 * 口径与已落盘代码**逐字一致**（开工前已读源码核对，不得靠猜）：
 *   · economy-spirit.js  withSpirit/readSpiritEntry/stripEntry：档 `_id = tree_id`，档体 = entry 本身（不含 `_id`/`version`），`version` 自 1 起；
 *   · economy-ops.js     withMessages：档 `_id = 手机号明文`，mutator 见到的 `rec = {items: Message[], warned: {...}}`（不含 `_id`/`version`）；
 *                        warned 去重键形态见 `warnKey`：`expiring:<phone>:<lotId>@…` / `spirit:<phone>:<treeId>@…` ⇒ 第 2 段即手机号；
 *   · economy-ops.js     appendOpsLog/opsLogs：档 `_id = 该条日志 id`，档体 = 该条日志自身（id/ts/operator/target_phone/delta/reason[/ref]）；
 *                        `log.id` 缺失时按裁定生成 `<ts毫秒>-<6位随机>` 并**写回条目 id**（保证 `_id === entry.id`）；rand6 口径逐字沿用 market/ops。
 *
 * 安全：默认 **dry-run**（只打印计划，不写盘）；`--apply` 才写，且**写前自动备份**到
 *   `~/jiazu-backups/2026-10-03-ledger-v2/`（三个原文件 + 追加 `md5-before.txt`）；报逐项映射与前后 md5。
 * 副本演练：`COMPAT_OUT_DIR=<副本根> node scripts/migrate-messaging-and-logs-to-v2-2026-10.mjs …`
 *   （数据根 = `$COMPAT_OUT_DIR`，默认 = `<仓库>/migrate-output`）。
 * 幂等：某文件已无 `global` 键 ⇒ 零变更、不写盘（`--apply` 亦不写）。
 *
 * 用法：
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/migrate-messaging-and-logs-to-v2-2026-10.mjs           # dry-run
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/migrate-messaging-and-logs-to-v2-2026-10.mjs --apply   # 执行（先备份）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// 数据根：副本演练优先；缺省 = 真源 migrate-output
const OUT = process.env.COMPAT_OUT_DIR ? path.resolve(process.env.COMPAT_OUT_DIR) : path.join(REPO, 'migrate-output');
const COLS = path.join(OUT, 'collections');
/** 备份目录：~/jiazu-backups/2026-10-03-ledger-v2/（日期逐字，与 assets 迁移同批同目录） */
const BACKUP_DIR = path.join(os.homedir(), 'jiazu-backups', '2026-10-03-ledger-v2');

const SPIRIT_FILE = path.join(COLS, 'jiapu_spirit.json');
const MESSAGES_FILE = path.join(COLS, 'jiapu_messages.json');
const OPS_LOGS_FILE = path.join(COLS, 'jiapu_ops_logs.json');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const isDoc = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** v2 主体系档判据：`_id` 与键一致 + `version` 非负整数自 1 起 */
const isV2Doc = (id, doc) => isDoc(doc) && doc._id === id && Number.isInteger(doc.version) && doc.version >= 1;
/** rand6：逐字沿用 economy-ops.js / economy-market.js */
const rand6 = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0').slice(0, 6);
/** ops 日志 id 兜底：逐字沿用 appendOpsLog 的裁定口径 `<ts毫秒>-<6位随机>` */
const fallbackOpsId = (entry) => {
  const tsMs = Date.parse(entry?.ts ?? '');
  return `${Number.isFinite(tsMs) ? tsMs : Date.now()}-${rand6()}`;
};
/** warned 去重键 → 归属手机号（第 2 段；`expiring:<phone>:…` / `spirit:<phone>:…`） */
const phoneOfWarnKey = (key) => String(key).split(':')[1] || '';

for (const f of [SPIRIT_FILE, MESSAGES_FILE, OPS_LOGS_FILE]) {
  if (!fs.existsSync(f)) {
    console.error(`拒绝运行：找不到集合文件 ${f}`);
    process.exit(2);
  }
}

// ==================== ① jiapu_spirit：global.trees → 每树一档 ====================

function migrateSpirit(src) {
  const next = {};
  const mapping = [];
  let alreadyMigrated = 0;
  for (const [key, val] of Object.entries(src)) {
    if (key === 'global') continue; // 单文档外壳：稍后摊平其 trees
    if (isV2Doc(key, val)) alreadyMigrated += 1;
    next[key] = val; // 已是每树档 / 异常夹杂：原样保留（幂等 / 防静默丢数据）
  }
  const trees = isDoc(src.global) ? src.global.trees : null;
  if (isDoc(trees)) {
    for (const [treeId, entry] of Object.entries(trees)) {
      if (!isDoc(entry)) continue;
      const doc = { ...entry, _id: treeId };
      doc.version = Number.isInteger(entry.version) && entry.version >= 1 ? entry.version : 1;
      next[treeId] = doc;
      mapping.push({
        treeId,
        fields: Object.keys(entry).length,
        status: entry.status,
        logs: Array.isArray(entry.logs) ? entry.logs.length : 0,
        jade: entry.jade ? entry.jade.jade_id : '—',
      });
    }
  }
  return { next, mapping, alreadyMigrated, hasGlobal: Object.prototype.hasOwnProperty.call(src, 'global') };
}

// ==================== ② jiapu_messages：global.items/warned → 每手机号一档 ====================

function migrateMessages(src) {
  const next = {};
  let alreadyMigrated = 0;
  for (const [key, val] of Object.entries(src)) {
    if (key === 'global') continue;
    if (isV2Doc(key, val)) alreadyMigrated += 1;
    next[key] = val;
  }
  const g = isDoc(src.global) ? src.global : null;
  const items = g && isDoc(g.items) ? g.items : {};
  const warned = g && isDoc(g.warned) ? g.warned : {};

  // 归属：warned 键第 2 段 = 手机号（与 warnKey 三段格式一致）
  const warnedByPhone = {};
  for (const [k, v] of Object.entries(warned)) {
    const phone = phoneOfWarnKey(k);
    if (!phone) continue; // 无法归属的键不入档（真源形态下不会出现）
    (warnedByPhone[phone] ||= {})[k] = v;
  }
  // 档位集合 = items 的键序 ∪ 仅 warned 才出现的手机号（保序）
  const phones = [...Object.keys(items)];
  for (const phone of Object.keys(warnedByPhone)) if (!phones.includes(phone)) phones.push(phone);

  const mapping = [];
  for (const phone of phones) {
    if (!phone) continue;
    const rec = {
      items: Array.isArray(items[phone]) ? items[phone] : [],
      warned: warnedByPhone[phone] || {},
    };
    const doc = { ...rec, _id: phone };
    doc.version = 1;
    next[phone] = doc;
    mapping.push({ phone, items: rec.items.length, warned: Object.keys(rec.warned).length });
  }
  return { next, mapping, alreadyMigrated, hasGlobal: Object.prototype.hasOwnProperty.call(src, 'global') };
}

// ==================== ③ jiapu_ops_logs：global.logs → 每笔一档 ====================

function migrateOpsLogs(src) {
  const next = {};
  let alreadyMigrated = 0;
  for (const [key, val] of Object.entries(src)) {
    if (key === 'global') continue;
    if (isV2Doc(key, val)) alreadyMigrated += 1;
    next[key] = val;
  }
  const logs = isDoc(src.global) && Array.isArray(src.global.logs) ? src.global.logs : [];
  const mapping = [];
  for (const raw of logs) {
    if (!isDoc(raw)) continue;
    const entry = { ...raw };
    if (!entry.id) entry.id = fallbackOpsId(entry); // 缺失 → 生成并**写回条目 id**（_id === entry.id）
    const id = String(entry.id);
    const doc = { ...entry, _id: id };
    doc.version = 1;
    next[id] = doc;
    mapping.push({ id, ts: entry.ts, operator: entry.operator, target_phone: entry.target_phone, generated_id: !raw.id });
  }
  return { next, mapping, alreadyMigrated, hasGlobal: Object.prototype.hasOwnProperty.call(src, 'global') };
}

// ==================== 执行：三个文件统一走「检测 → 报告 → (备份+写) ====================

const JOBS = [
  { name: 'jiapu_spirit', file: SPIRIT_FILE, migrate: migrateSpirit, report: (m) => `  ${m.treeId}  version=1  fields=${m.fields}  status=${m.status}  jade=${m.jade}  logs=${m.logs}` },
  { name: 'jiapu_messages', file: MESSAGES_FILE, migrate: migrateMessages, report: (m) => `  ${m.phone}  version=1  items=${m.items}  warned=${m.warned}` },
  { name: 'jiapu_ops_logs', file: OPS_LOGS_FILE, migrate: migrateOpsLogs, report: (m) => `  ${m.id}  version=1  ts=${m.ts}  operator=${m.operator}  target=${m.target_phone}${m.generated_id ? '  [生成 id]' : ''}` },
];

const plans = [];
for (const job of JOBS) {
  const beforeRaw = fs.readFileSync(job.file);
  const beforeMd5 = md5(beforeRaw);
  const src = JSON.parse(beforeRaw.toString('utf8'));
  if (!isDoc(src)) {
    console.error(`拒绝运行：${job.file} 顶层不是对象`);
    process.exit(2);
  }
  const res = job.migrate(src);
  const nextRaw = Buffer.from(`${JSON.stringify(res.next, null, 2)}`);
  const changed = res.hasGlobal; // 唯一变更点 = 去掉 global 外壳并摊平（幂等：无 global 即零变更）
  plans.push({ job, beforeRaw, beforeMd5, src, nextRaw, nextMd5: md5(nextRaw), res, changed });
}

// ---- 报告 ----
console.log(`数据根：${OUT}`);
console.log(`备份目录：${BACKUP_DIR}`);
console.log(`模式：${apply ? '--apply（写盘 + 写前备份）' : 'dry-run（只打印，不写盘）'}\n`);

let anyChanged = false;
for (const p of plans) {
  const { job, beforeMd5, nextMd5, src, res, changed } = p;
  if (changed) anyChanged = true;
  console.log(`=== ${job.name} ===`);
  console.log(`  文件：${job.file}`);
  console.log(`  检测：${res.hasGlobal ? '发现 global 单文档（待迁移）' : '已是主体系形态（无 global）'}；已 v2 档 ${res.alreadyMigrated} 个`);
  console.log(`  md5 前：${beforeMd5}`);
  console.log(`  md5 后（${apply && changed ? '将写' : '预览'}）：${nextMd5}`);
  console.log(`  顶层键：${Object.keys(src).length} → ${Object.keys(res.next).length}（${Object.keys(src).join(',') || '∅'} → ${Object.keys(res.next).join(',') || '∅'}）`);
  console.log(`  逐项映射（${res.mapping.length}）：`);
  for (const m of res.mapping) console.log(p.job.report(m));
  console.log('');
}

if (!anyChanged) {
  console.log('幂等：三个文件均无 global 键 ⇒ 零变更，不写盘（exit 0）');
  process.exit(0);
}

if (!apply) {
  console.log('[dry-run] 未写盘。加 --apply 执行（写前自动备份）。');
  process.exit(0);
}

// ---- 写前备份（三个原文件 + 追加 md5-before.txt）----
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const md5BeforeFile = path.join(BACKUP_DIR, 'md5-before.txt');
let md5Lines = fs.existsSync(md5BeforeFile) ? fs.readFileSync(md5BeforeFile, 'utf8') : '';
for (const p of plans) {
  if (!p.changed) continue;
  const backupFile = path.join(BACKUP_DIR, path.basename(p.job.file));
  fs.writeFileSync(backupFile, p.beforeRaw);
  md5Lines += `${p.beforeMd5}  ${p.job.file}\n`;
  console.log(`备份：${backupFile}`);
}
fs.writeFileSync(md5BeforeFile, md5Lines);
console.log(`备份清单：${md5BeforeFile}\n`);

// ---- 落盘（只写 changed 的文件）----
for (const p of plans) {
  if (!p.changed) {
    console.log(`跳过（幂等）：${p.job.file}`);
    continue;
  }
  fs.writeFileSync(p.job.file, p.nextRaw);
  const back = JSON.parse(fs.readFileSync(p.job.file, 'utf8'));
  console.log(`已写入：${p.job.file}`);
  console.log(`  md5 ${p.beforeMd5} → ${md5(fs.readFileSync(p.job.file))}`);
  console.log(`  global 键已消失：${!Object.prototype.hasOwnProperty.call(back, 'global')}；顶层键 ${Object.keys(back).length} 个：${Object.keys(back).join(',')}`);
}
