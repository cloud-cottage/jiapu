#!/usr/bin/env node
/**
 * 一次性数据手术（路 B 重构第 1 期）：`jiazu_assets` 单文档 → **每手机号一文档**
 *
 * 背景（根因）：账本集合 `jiazu_assets` 原为**全体用户共用单文档** `_id='global'`，内嵌
 * `users` 映射（`<手机号>` → 用户资产档）。写入仅进程内锁 ⇒ 云端多实例并发丢更新 / 双花
 * （docs/PENDING_DEPLOY.md §7-7 部署阻塞项）。本脚本把存储形态迁到 v2：
 *
 *   迁移前：{ "global": { "_id": "global", "users": { "<手机号>": {fragments,seeds,...} } } }
 *   迁移后：{ "<手机号>": { "_id": "<手机号>", "version": 1, fragments, seeds, ... } }
 *
 * 口径（Zang 裁定 R1/R4）：
 *   · **只迁 `jiazu_assets`**（本批范围；其它集合另期）——字段名一律沿用旧 `users[phone]` 记录字段，
 *     不改业务语义 / 数值 / 计费口径（含 `task_claims` 等未知字段原样保留）；
 *   · 每档补 `_id`（= 手机号明文）与 `version`（缺省 1，非负整数自 1 起）；
 *   · **迁后 `global` 键必须消失**（不是并留）；单轨、无兼容期；
 *   · **幂等**：已是 per-phone 形态（无 `global`）⇒ 零变更、exit 0（`--apply` 亦不写）。
 *
 * 安全：默认 **dry-run**（只打印计划，不写盘）；`--apply` 才写，且**写前自动备份**到
 *   `~/jiazu-backups/2026-10-03-ledger-v2/`（原文件 + `md5-before.txt`）；报前后 md5。
 * 副本演练：`COMPAT_OUT_DIR=<副本根> node scripts/migrate-assets-to-per-user-2026-10.mjs …`
 *   （数据根 = `$COMPAT_OUT_DIR`，默认 = `<仓库>/migrate-output`）。
 *
 * 用法：
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/migrate-assets-to-per-user-2026-10.mjs           # dry-run
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/migrate-assets-to-per-user-2026-10.mjs --apply   # 执行（先备份）
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
const ASSETS_FILE = path.join(OUT, 'collections', 'jiazu_assets.json');
/** 备份目录：~​/jiazu-backups/2026-10-03-ledger-v2/（日期逐字，Zang 裁定 R4） */
const BACKUP_DIR = path.join(os.homedir(), 'jiazu-backups', '2026-10-03-ledger-v2');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const isPerPhoneDoc = (id, doc) =>
  !!doc && typeof doc === 'object' && doc._id === id && Number.isInteger(doc.version) && doc.version >= 1;

if (!fs.existsSync(ASSETS_FILE)) {
  console.error(`拒绝运行：找不到资产集合文件 ${ASSETS_FILE}`);
  process.exit(2);
}

const beforeRaw = fs.readFileSync(ASSETS_FILE);
const beforeMd5 = md5(beforeRaw);
const src = JSON.parse(beforeRaw.toString('utf8'));

// ---- 迁移：把 global.users 摊平为 per-phone 文档；非 global 键原样保留（幂等 / 兼容夹杂） ----
const next = {};
const mapping = []; // 逐用户映射报告
let alreadyMigrated = 0;

for (const [key, val] of Object.entries(src)) {
  if (key === 'global') continue; // 单文档外壳：稍后摊平其 users
  if (isPerPhoneDoc(key, val)) {
    alreadyMigrated += 1;
    next[key] = val; // 已是 per-phone 档：原样保留（幂等）
    continue;
  }
  // 既非 global 也非 per-phone 档（异常夹杂）：原样保留，避免静默丢数据
  next[key] = val;
}

const globalDoc = src.global;
const users = globalDoc && typeof globalDoc === 'object' ? globalDoc.users : null;
if (users && typeof users === 'object') {
  for (const [phone, rec] of Object.entries(users)) {
    if (!phone || !rec || typeof rec !== 'object') continue;
    const doc = { ...rec, _id: phone };
    doc.version = Number.isInteger(rec.version) && rec.version >= 1 ? rec.version : 1;
    next[phone] = doc;
    mapping.push({
      phone,
      fields: Object.keys(rec).length,
      seeds_lots: Array.isArray(rec.seeds) ? rec.seeds.length : 0,
      bamboos_lots: Array.isArray(rec.bamboos) ? rec.bamboos.length : 0,
      jades: Array.isArray(rec.jades) ? rec.jades.length : 0,
      scrolls_lots: Array.isArray(rec.scrolls) ? rec.scrolls.length : 0,
      txs: Array.isArray(rec.txs) ? rec.txs.length : 0,
    });
  }
}

const hasGlobal = Object.prototype.hasOwnProperty.call(src, 'global');
const changed = hasGlobal; // 唯一变更点 = 去掉 global 外壳并摊平（幂等：无 global 即零变更）

const nextRaw = Buffer.from(`${JSON.stringify(next, null, 2)}`);
const nextMd5 = md5(nextRaw);

// ---- 报告 ----
console.log(`数据根：${OUT}`);
console.log(`目标文件：${ASSETS_FILE}`);
console.log(`检测：${hasGlobal ? '发现 global 单文档（待迁移）' : '已是 per-phone 形态（无 global）'}；已 per-phone 档 ${alreadyMigrated} 个`);
console.log(`md5 前：${beforeMd5}`);
console.log(`md5 后（${apply && changed ? '将写' : '预览'}）：${nextMd5}`);
console.log(`顶层键：${Object.keys(src).length} → ${Object.keys(next).length}（${Object.keys(src).join(',') || '∅'} → ${Object.keys(next).join(',') || '∅'}）`);
console.log('逐用户映射：');
for (const m of mapping) {
  console.log(`  ${m.phone}  version=1  fields=${m.fields}  seeds=${m.seeds_lots}  bamboos=${m.bamboos_lots}  jades=${m.jades}  scrolls=${m.scrolls_lots}  txs=${m.txs}`);
}

if (!changed) {
  console.log('\n幂等：无 global 键 ⇒ 零变更，不写盘（exit 0）');
  process.exit(0);
}

if (!apply) {
  console.log('\n[dry-run] 未写盘。加 --apply 执行（写前自动备份）。');
  process.exit(0);
}

// ---- 写前备份（原文件 + md5-before.txt）----
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, 'jiazu_assets.json');
fs.writeFileSync(backupFile, beforeRaw);
fs.writeFileSync(path.join(BACKUP_DIR, 'md5-before.txt'), `${beforeMd5}  ${ASSETS_FILE}\n`);
console.log(`\n备份：${backupFile}（+ md5-before.txt）`);

fs.writeFileSync(ASSETS_FILE, nextRaw);
console.log(`已写入：${ASSETS_FILE}`);
console.log(`md5 前 ${beforeMd5} → 后 ${md5(fs.readFileSync(ASSETS_FILE))}`);
console.log(`映射 ${mapping.length} 个用户；global 键已消失：${!Object.prototype.hasOwnProperty.call(JSON.parse(fs.readFileSync(ASSETS_FILE, 'utf8')), 'global')}`);
