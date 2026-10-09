#!/usr/bin/env node
/**
 * 一次性数据手术（路 B 重构第 3 期）：`jiapu_wallets` 单文档 → **每手机号一档 + config 单档 + 平台流水单档**
 *
 * 背景（根因）：钱包集合 `jiapu_wallets` 原为**全体用户共用单文档** `_id='global'`，内嵌
 * `users` 映射（`<手机号>` → `{ balance_cents }`）+ `transactions` 数组 + `config`。写入仅进程内锁、
 * **无 version / 无 CAS** ⇒ 云端多实例并发会**双花**（docs/PENDING_DEPLOY.md §7-7；`lib/economy-market.js`
 * 官方购买走钱包扣款）。本脚本把存储形态迁到 v2：
 *
 *   迁移前：{ "global": { "_id": "global", "users": { "<手机号>": { balance_cents } },
 *                         "transactions": [ { id, type, user, amount_cents, desc, ts } … ],
 *                         "config": { tree_create_fee_cents, … } } }
 *   迁移后：{ "<手机号>": { "_id": "<手机号>", "version": 1, "balance_cents", "txs": [ …该用户流水… ] },
 *             "config":   { "_id": "config",   "version": 1, …原 config 值原样… },
 *             "_platform":{ "_id": "_platform","version": 1, "txs": [ …无 user 的平台流水… ] }  // 无此类流水则**不建** }
 *
 * 口径（Zang 裁定，与 `lib/wallet.js` 一致）：
 *   · 每手机号一档，`_id = 手机号明文`，档体 `{ balance_cents, txs }`；
 *     **原 `transactions` 中 `user === 该手机号` 的条目归并进该用户档的 `txs` 数组**（字段一字不改、
 *     保持原全局数组中的相对顺序）—— 使「改余额 + 记流水」在同一 CAS mutator 内原子完成；
 *   · 无 `user` 字段的**平台维度流水** → 单档 `_id='_platform'`（**无此类流水时不预先创建**）；
 *   · 原 `global.config` → 单档 `_id='config'`（原值原样 + `version`）；
 *   · 每档补 `_id` 与 `version`（缺省 1，非负整数自 1 起）；**迁后 `global` 键必须消失**（不是并留）；
 *   · **幂等**：已是 v2 形态（无 `global`）⇒ 零变更、exit 0（`--apply` 亦不写）。
 *
 * 安全：默认 **dry-run**（只打印计划，不写盘）；`--apply` 才写，且**写前自动备份**到
 *   `~/jiazu-backups/2026-10-03-ledger-v2/`（原文件 `jiapu_wallets.json` + `jiapu_wallets.md5-before.txt`）；报前后 md5。
 * 副本演练：`COMPAT_OUT_DIR=<副本根> node scripts/migrate-wallets-to-per-user-2026-10.mjs …`
 *   （数据根 = `$COMPAT_OUT_DIR`，默认 = `<仓库>/migrate-output`）。
 *
 * 用法：
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/migrate-wallets-to-per-user-2026-10.mjs           # dry-run
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/migrate-wallets-to-per-user-2026-10.mjs --apply   # 执行（先备份）
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
const WALLETS_FILE = path.join(OUT, 'collections', 'jiapu_wallets.json');
/** 备份目录：~/jiazu-backups/2026-10-03-ledger-v2/（与资产脚本同批同目录；本文件用独立 md5 记录名，不覆盖 assets 的） */
const BACKUP_DIR = path.join(os.homedir(), 'jiazu-backups', '2026-10-03-ledger-v2');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const CONFIG_ID = 'config';
const PLATFORM_ID = '_platform';

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const isPerUserDoc = (id, doc) =>
  !!doc && typeof doc === 'object' && doc._id === id && Number.isInteger(doc.version) && doc.version >= 1;
const versionOr = (v) => (Number.isInteger(v) && v >= 1 ? v : 1);

if (!fs.existsSync(WALLETS_FILE)) {
  console.error(`拒绝运行：找不到钱包集合文件 ${WALLETS_FILE}`);
  process.exit(2);
}

const beforeRaw = fs.readFileSync(WALLETS_FILE);
const beforeMd5 = md5(beforeRaw);
const src = JSON.parse(beforeRaw.toString('utf8'));

// ---- 迁移：摊平 global.users + transactions；非 global 键原样保留（幂等 / 兼容夹杂） ----
const next = {};
const mapping = []; // 逐用户映射报告
let alreadyMigrated = 0;

for (const [key, val] of Object.entries(src)) {
  if (key === 'global') continue; // 单文档外壳：稍后摊平
  if (isPerUserDoc(key, val)) alreadyMigrated += 1; // 已是 v2 档：原样保留（幂等）
  next[key] = val; // 非 global 键一律原样保留，避免静默丢数据
}

const globalDoc = src.global && typeof src.global === 'object' ? src.global : null;
const transactions = Array.isArray(globalDoc?.transactions) ? globalDoc.transactions : [];

// ① 每手机号一档：balance 取自 global.users[phone]；txs = 该用户在原全局流水中的条目（相对顺序保持）
const users = globalDoc && typeof globalDoc.users === 'object' && globalDoc.users ? globalDoc.users : {};
const txsByPhone = new Map();
let platformTxCount = 0;
for (const t of transactions) {
  const u = t && typeof t === 'object' ? t.user : undefined;
  if (u === undefined || u === null || u === '') {
    platformTxCount += 1;
    continue;
  }
  const phone = String(u);
  if (!txsByPhone.has(phone)) txsByPhone.set(phone, []);
  txsByPhone.get(phone).push(t);
}

const phoneSet = new Set([...Object.keys(users), ...txsByPhone.keys()]);
for (const phone of phoneSet) {
  if (!phone || phone === CONFIG_ID || phone === PLATFORM_ID) continue; // 档 id 与保留键不冲突
  const rec = users[phone] && typeof users[phone] === 'object' ? users[phone] : {};
  const existing = next[phone];
  const base = existing && typeof existing === 'object' ? { ...existing } : { ...rec };
  const mergedTxs = Array.isArray(base.txs) ? base.txs.slice() : [];
  mergedTxs.push(...(txsByPhone.get(phone) || []));
  const doc = {
    ...base,
    balance_cents: base.balance_cents ?? rec.balance_cents ?? 0,
    txs: mergedTxs,
    _id: phone,
  };
  doc.version = versionOr(existing?.version ?? rec.version);
  next[phone] = doc;
  mapping.push({
    phone,
    balance_cents: doc.balance_cents,
    txs: doc.txs.length,
    from_users: Object.prototype.hasOwnProperty.call(users, phone),
    from_txs: (txsByPhone.get(phone) || []).length,
  });
}

// ② 平台维度流水单档（无 user 字段）；**无此类流水则不建**（首次需要时才由代码创建）
let platformCreated = false;
if (platformTxCount > 0) {
  const existing = next[PLATFORM_ID];
  const mergedTxs = Array.isArray(existing?.txs) ? existing.txs.slice() : [];
  mergedTxs.push(...transactions.filter((t) => !(t && typeof t === 'object' && t.user)));
  const doc = { ...(existing && typeof existing === 'object' ? existing : {}), txs: mergedTxs, _id: PLATFORM_ID };
  doc.version = versionOr(existing?.version);
  next[PLATFORM_ID] = doc;
  platformCreated = true;
}

// ③ 配置类单档：原 global.config（原值原样）
let configCreated = false;
if (globalDoc && globalDoc.config && typeof globalDoc.config === 'object') {
  const existing = next[CONFIG_ID] && typeof next[CONFIG_ID] === 'object' ? next[CONFIG_ID] : {};
  const doc = { ...globalDoc.config, ...existing, _id: CONFIG_ID };
  doc.version = versionOr(existing.version);
  next[CONFIG_ID] = doc;
  configCreated = true;
}

const hasGlobal = Object.prototype.hasOwnProperty.call(src, 'global');
const changed = hasGlobal; // 唯一变更点 = 去掉 global 外壳并摊平（幂等：无 global 即零变更）

const nextRaw = Buffer.from(`${JSON.stringify(next, null, 2)}`);
const nextMd5 = md5(nextRaw);

// ---- 报告 ----
console.log(`数据根：${OUT}`);
console.log(`目标文件：${WALLETS_FILE}`);
console.log(`检测：${hasGlobal ? '发现 global 单文档（待迁移）' : '已是 per-手机号形态（无 global）'}；已 v2 档 ${alreadyMigrated} 个`);
console.log(`原全局流水共 ${transactions.length} 笔（含 user ${transactions.length - platformTxCount} 笔 / 平台 ${platformTxCount} 笔）`);
console.log(`md5 前：${beforeMd5}`);
console.log(`md5 后（${apply && changed ? '将写' : '预览'}）：${nextMd5}`);
console.log(`顶层键：${Object.keys(src).length} → ${Object.keys(next).length}（${Object.keys(src).join(',') || '∅'} → ${Object.keys(next).join(',') || '∅'}）`);
console.log('逐用户映射：');
for (const m of mapping) {
  console.log(`  ${m.phone}  version=1  balance_cents=${m.balance_cents}  txs=${m.txs}（来自 users:${m.from_users ? 'Y' : 'N'} / 流水:${m.from_txs}）`);
}
console.log(`config 单档：${configCreated ? '已生成（_id=config）' : '原无 config，跳过'}`);
console.log(`平台流水单档 _platform：${platformCreated ? `已生成（txs=${next[PLATFORM_ID].txs.length}）` : '无平台流水，未创建（首次需要时才建）'}`);

if (!changed) {
  console.log('\n幂等：无 global 键 ⇒ 零变更，不写盘（exit 0）');
  process.exit(0);
}

if (!apply) {
  console.log('\n[dry-run] 未写盘。加 --apply 执行（写前自动备份）。');
  process.exit(0);
}

// ---- 写前备份（原文件 + 独立 md5-before.txt；不覆盖资产脚本的同名记录）----
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, 'jiapu_wallets.json');
fs.writeFileSync(backupFile, beforeRaw);
fs.writeFileSync(path.join(BACKUP_DIR, 'jiapu_wallets.md5-before.txt'), `${beforeMd5}  ${WALLETS_FILE}\n`);
console.log(`\n备份：${backupFile}（+ jiapu_wallets.md5-before.txt）`);

fs.writeFileSync(WALLETS_FILE, nextRaw);
const afterObj = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
console.log(`已写入：${WALLETS_FILE}`);
console.log(`md5 前 ${beforeMd5} → 后 ${md5(fs.readFileSync(WALLETS_FILE))}`);
console.log(`映射 ${mapping.length} 个用户；global 键已消失：${!Object.prototype.hasOwnProperty.call(afterObj, 'global')}`);
