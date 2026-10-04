#!/usr/bin/env node
/**
 * 一次性数据手术（路 B 重构第 2 期·B 路）：`jiazu_market` 单文档 `_id='global'` → **每档一文档**
 *
 * 背景（根因）：市集集合 `jiazu_market` 原为单文档 `_id='global'`，内嵌 `listings` / `trades` 数组 +
 * `official` 配置（写入仅进程内锁 ⇒ 云端多实例并发丢更新）。本脚本把存储形态迁到 v2：
 *
 *   迁移前：{ "global": { "_id":"global",
 *                        "listings":[{id,seller_phone,pieces,price_seeds,status,...}, ...],
 *                        "trades":[{id,listing_id,buyer_phone,seller_phone,pieces,price_seeds,fee_seeds,ts}, ...],
 *                        "official":{price_fen,daily_stock,stock,last_release_date} } }
 *   迁移后：{ "<listing.id>": { "_id":"<listing.id>", "version":1, ...listing },
 *            "<trade.id>":   { "_id":"<trade.id>",   "version":1, ...trade },
 *            "official":     { "_id":"official",     "version":1, ...official } }
 *
 * 口径（Zang 裁定 · 路 B 第 2 期·B 路）：
 *   · 只迁 `jiazu_market` 一个集合（本批范围；其它集合另期）；
 *   · listings 每挂单一档（`_id = listing.id`）· trades 每成交一档（`_id = trade.id`）·
 *     official 保留单档 `_id='official'`（配置类）；
 *   · 每档补 `_id` 与 `version`（缺省 1，非负整数自 1 起）；业务字段名 / 数值 / 计费口径一字不改；
 *   · **迁后 `global` 键必须消失**（不是并留）；单轨、无兼容期；
 *   · **幂等**：无 `global` 键（已是 v2 形态）⇒ 零变更、exit 0（`--apply` 亦不写）。
 *
 * 安全：默认 **dry-run**（只打印计划，不写盘）；`--apply` 才写，且**写前自动备份**到
 *   `~/jiazu-backups/2026-10-03-ledger-v2/`（原文件 + `md5-before-jiazu_market.txt`）；报前后 md5。
 * 副本演练：`COMPAT_OUT_DIR=<副本根> node scripts/migrate-market-to-v2-2026-10.mjs …`
 *   （数据根 = `$COMPAT_OUT_DIR`，默认 = `<仓库>/migrate-output`）。
 *
 * 用法：
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/migrate-market-to-v2-2026-10.mjs           # dry-run
 *   COMPAT_OUT_DIR=/tmp/xxx node scripts/migrate-market-to-v2-2026-10.mjs --apply   # 执行（先备份）
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
const MARKET_FILE = path.join(OUT, 'collections', 'jiazu_market.json');
/** 备份目录：~​/jiazu-backups/2026-10-03-ledger-v2/（日期逐字，Zang 裁定 R4；与本批资产迁移同一目录） */
const BACKUP_DIR = path.join(os.homedir(), 'jiazu-backups', '2026-10-03-ledger-v2');
/** 官方配置档 `_id`（与 lib/economy-market.js `OFFICIAL_ID` 一致） */
const OFFICIAL_ID = 'official';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const isV2Doc = (id, doc) =>
  !!doc && typeof doc === 'object' && doc._id === id && Number.isInteger(doc.version) && doc.version >= 1;

if (!fs.existsSync(MARKET_FILE)) {
  console.error(`拒绝运行：找不到市集集合文件 ${MARKET_FILE}`);
  process.exit(2);
}

const beforeRaw = fs.readFileSync(MARKET_FILE);
const beforeMd5 = md5(beforeRaw);
const src = JSON.parse(beforeRaw.toString('utf8'));

// ---- 迁移：摊平 global.listings / global.trades 为每档一文档；official 单档；非 global 键原样保留（幂等） ----
const next = {};
const listingRows = [];
const tradeRows = [];
let alreadyV2 = 0;
let preserved = 0;

for (const [key, val] of Object.entries(src)) {
  if (key === 'global') continue; // 单文档外壳：稍后摊平其 listings / trades / official
  if (isV2Doc(key, val)) {
    alreadyV2 += 1;
    next[key] = val; // 已是 v2 档：原样保留（幂等）
    continue;
  }
  // 既非 global 也非 v2 档（异常夹杂）：原样保留，避免静默丢数据
  next[key] = val;
  preserved += 1;
}

const g = src.global;
if (g && typeof g === 'object') {
  for (const l of Array.isArray(g.listings) ? g.listings : []) {
    if (!l || typeof l !== 'object' || !l.id) throw new Error(`挂单缺少 id，拒绝迁移：${JSON.stringify(l)}`);
    const doc = { ...l, _id: l.id };
    doc.version = Number.isInteger(l.version) && l.version >= 1 ? l.version : 1;
    next[l.id] = doc;
    listingRows.push({
      id: l.id,
      seller_phone: l.seller_phone,
      status: l.status,
      pieces: l.pieces,
      price_seeds: l.price_seeds,
    });
  }
  for (const t of Array.isArray(g.trades) ? g.trades : []) {
    if (!t || typeof t !== 'object' || !t.id) throw new Error(`成交缺少 id，拒绝迁移：${JSON.stringify(t)}`);
    const doc = { ...t, _id: t.id };
    doc.version = Number.isInteger(t.version) && t.version >= 1 ? t.version : 1;
    next[t.id] = doc;
    tradeRows.push({
      id: t.id,
      listing_id: t.listing_id,
      buyer_phone: t.buyer_phone,
      seller_phone: t.seller_phone,
      price_seeds: t.price_seeds,
    });
  }
  const off = g.official && typeof g.official === 'object' ? g.official : {};
  const offDoc = { ...off, _id: OFFICIAL_ID };
  offDoc.version = Number.isInteger(off.version) && off.version >= 1 ? off.version : 1;
  next[OFFICIAL_ID] = offDoc;
}

const hasGlobal = Object.prototype.hasOwnProperty.call(src, 'global');
const changed = hasGlobal; // 唯一变更点 = 去掉 global 外壳并摊平（幂等：无 global 即零变更）

const nextRaw = Buffer.from(`${JSON.stringify(next, null, 2)}`);
const nextMd5 = md5(nextRaw);

// ---- 报告 ----
console.log(`数据根：${OUT}`);
console.log(`目标文件：${MARKET_FILE}`);
console.log(`检测：${hasGlobal ? '发现 global 单文档（待迁移）' : '已是 v2 形态（无 global）'}；已 v2 档 ${alreadyV2} 个；原样保留非 v2 键 ${preserved} 个`);
console.log(`md5 前：${beforeMd5}`);
console.log(`md5 后（${apply && changed ? '将写' : '预览'}）：${nextMd5}`);
console.log(`顶层键：${Object.keys(src).length} → ${Object.keys(next).length}`);
console.log(`挂单：${listingRows.length} 档 · 成交：${tradeRows.length} 档 · official：1 档`);
for (const r of listingRows) {
  console.log(`  [lst] ${r.id}  seller=${r.seller_phone}  status=${r.status}  pieces=${r.pieces}  price_seeds=${r.price_seeds}`);
}
for (const r of tradeRows) {
  console.log(`  [trd] ${r.id}  listing=${r.listing_id}  buyer=${r.buyer_phone}  seller=${r.seller_phone}  price_seeds=${r.price_seeds}`);
}

if (!changed) {
  console.log('\n幂等：无 global 键 ⇒ 零变更，不写盘（exit 0）');
  process.exit(0);
}

if (!apply) {
  console.log('\n[dry-run] 未写盘。加 --apply 执行（写前自动备份）。');
  process.exit(0);
}

// ---- 写前备份（原文件 + md5-before-jiazu_market.txt）----
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, 'jiazu_market.json');
fs.writeFileSync(backupFile, beforeRaw);
fs.writeFileSync(path.join(BACKUP_DIR, 'md5-before-jiazu_market.txt'), `${beforeMd5}  ${MARKET_FILE}\n`);
console.log(`\n备份：${backupFile}（+ md5-before-jiazu_market.txt）`);

fs.writeFileSync(MARKET_FILE, nextRaw);
console.log(`已写入：${MARKET_FILE}`);
console.log(`md5 前 ${beforeMd5} → 后 ${md5(fs.readFileSync(MARKET_FILE))}`);
const written = JSON.parse(fs.readFileSync(MARKET_FILE, 'utf8'));
console.log(`挂单 ${listingRows.length} 档 · 成交 ${tradeRows.length} 档 · official 单档：${!!written[OFFICIAL_ID]}`);
console.log(`global 键已消失：${!Object.prototype.hasOwnProperty.call(written, 'global')}`);
