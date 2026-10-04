#!/usr/bin/env node
/**
 * 一次性数据手术（路 B 重构第 4 期）：`jiazu_tree_meta` 单文档 → **每树一档**
 *
 * 背景（根因）：tree-meta 在云端原为**全体共用单文档** `_id='global'`（内嵌 `trees` 映射），
 * 本地形态 `config/tree-meta.json` 本就是「每树一键」（`{_schema,_description,trees:{<tree_id>:{…}}}`）。
 * 多实例并发写不同树会互相覆盖。本脚本把两侧口径统一到 v2：
 *
 *   云端迁移前：jiazu_tree_meta/global = { _schema, _description, trees:{…}, storage_files:{…} }
 *   云端迁移后：jiazu_tree_meta/_meta       = { _id:'_meta', _schema, _description, storage_files }
 *               jiazu_tree_meta/<tree_id>  = { _id:'<tree_id>', …原 trees[tree_id] 字段…, version }
 *               （旧 global 档**删除**；迁后 `global` 键必须消失）
 *   本地：`config/tree-meta.json` **路径与对外形状不变**，仅给每个树条目**新增 `version`**
 *         （非负整数自 1 起；缺省写 1）。
 *
 * 口径（Zang 裁定，口径 = 与 spirit 同）：
 *   · 只迁 tree-meta（本批范围）；字段名 / 数值 / 业务语义一律不改；
 *   · 每档补 `version`（缺省 1，非负整数自 1 起）；
 *   · 旧 `global` 档待删（有则删、无则幂等）；
 *   · **幂等**：本地 19 树均已带合法 `version` ⇒ 零变更、exit 0（`--apply` 亦不写）。
 *
 * 安全：默认 **dry-run**（只打印计划，不写盘）；`--apply` 才写，且**写前自动备份**到
 *   `~/jiazu-backups/2026-10-03-ledger-v2/`（原文件 + `md5-before.txt`）；报前后 md5。
 * 副本演练：`COMPAT_META_FILE=<副本 tree-meta.json> node scripts/migrate-tree-meta-to-per-tree-2026-10.mjs …`
 *   （meta 根优先级 = `COMPAT_META_FILE` > `<COMPAT_OUT_DIR>/tree-meta.json` > 真源 `config/tree-meta.json`）。
 * 云端：加 `--cloud`（需 `CB_ENV` / `CB_KEY`）才写 CloudBase；缺省只打印云端档计划（每树档 + `_meta`）。
 *
 * 用法：
 *   COMPAT_META_FILE=/tmp/m/tree-meta.json node scripts/migrate-tree-meta-to-per-tree-2026-10.mjs           # dry-run
 *   COMPAT_META_FILE=/tmp/m/tree-meta.json node scripts/migrate-tree-meta-to-per-tree-2026-10.mjs --apply   # 执行（先备份）
 *   CB_ENV=<env> CB_KEY=<key> node scripts/migrate-tree-meta-to-per-tree-2026-10.mjs --apply --cloud         # 同时迁云端
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/** meta 根：副本优先（与 store.js 同优先级），缺省 = 真源 config/tree-meta.json */
const META_FILE = (() => {
  if (process.env.COMPAT_META_FILE) return path.resolve(process.env.COMPAT_META_FILE);
  if (process.env.COMPAT_OUT_DIR) return path.join(path.resolve(process.env.COMPAT_OUT_DIR), 'tree-meta.json');
  return path.join(REPO, 'config', 'tree-meta.json');
})();
/** 备份目录：~/jiazu-backups/2026-10-03-ledger-v2/（日期逐字，Zang 裁定 R4） */
const BACKUP_DIR = path.join(os.homedir(), 'jiazu-backups', '2026-10-03-ledger-v2');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const withCloud = args.includes('--cloud');

const META_DOC_ID = '_meta';
const COLL = 'jiazu_tree_meta';

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const hasVersion = (entry) => Number.isInteger(entry?.version) && entry.version >= 1;
const treeDocId = (key, entry) => String(entry?.tree_id || key);

if (!fs.existsSync(META_FILE)) {
  console.error(`拒绝运行：找不到 meta 文件 ${META_FILE}`);
  process.exit(2);
}

const beforeRaw = fs.readFileSync(META_FILE);
const beforeMd5 = md5(beforeRaw);
const src = JSON.parse(beforeRaw.toString('utf8'));
const treesIn = src.trees && typeof src.trees === 'object' ? src.trees : {};

// ---- 本地迁移：逐树条目补 version（非负整数自 1 起；已合法则原样保留 ⇒ 幂等） ----
const treesNext = {};
const perTree = [];
let changedLocal = false;
for (const [key, entry] of Object.entries(treesIn)) {
  if (!entry || typeof entry !== 'object') {
    treesNext[key] = entry; // 异常夹杂：原样保留，避免静默丢数据
    continue;
  }
  const already = hasVersion(entry);
  const next = already ? entry : { ...entry, version: 1 };
  treesNext[key] = next;
  if (!already) changedLocal = true;
  perTree.push({ key, tree_id: treeDocId(key, entry), version: next.version, added: !already });
}
const next = { ...src, trees: treesNext };
const nextRaw = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
const nextMd5 = md5(nextRaw);

// ---- 云端档计划：_meta 单档 + 每树一档（_id = tree_id，档体 = 树条目 + version） ----
const cloudMetaDoc = {
  _id: META_DOC_ID,
  _schema: src._schema,
  _description: src._description,
  storage_files: src.storage_files || {},
};
const cloudTreeDocs = perTree.map((t) => ({ _id: t.tree_id, ...treesNext[t.key] }));

// ---- 报告 ----
console.log(`meta 文件：${META_FILE}${path.resolve(META_FILE) === path.join(REPO, 'config', 'tree-meta.json') ? '（★真源★）' : '（副本）'}`);
console.log(`树条目：${perTree.length} 个；本地已带 version：${perTree.filter((t) => !t.added).length}；待补 version：${perTree.filter((t) => t.added).length}`);
console.log(`本地 md5 前：${beforeMd5}`);
console.log(`本地 md5 后（${apply && changedLocal ? '将写' : '预览'}）：${nextMd5}`);
console.log(`云端计划：_meta 单档 ×1 + 每树档 ×${cloudTreeDocs.length}（_id = tree_id）；旧 global 档待删`);
for (const t of perTree) console.log(`  ${t.tree_id}  version=${t.version}${t.added ? '（本次补写）' : '（已就绪）'}`);

if (!changedLocal) {
  console.log('\n幂等：全部树条目已带合法 version ⇒ 本地零变更，不写盘。');
} else if (!apply) {
  console.log('\n[dry-run] 本地未写盘。加 --apply 执行（写前自动备份）。');
} else {
  // ---- 写前备份（原文件 + md5-before.txt）----
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `tree-meta.json`);
  fs.writeFileSync(backupFile, beforeRaw);
  fs.writeFileSync(path.join(BACKUP_DIR, 'md5-before.txt'), `${beforeMd5}  ${META_FILE}\n`);
  console.log(`\n备份：${backupFile}（+ md5-before.txt）`);
  fs.writeFileSync(META_FILE, nextRaw);
  console.log(`已写入：${META_FILE}`);
  console.log(`本地 md5 前 ${beforeMd5} → 后 ${md5(fs.readFileSync(META_FILE))}`);
}

// ---- 云端迁移（--cloud + 凭据；否则仅预览） ----
if (withCloud) {
  const ENV = process.env.CB_ENV;
  const KEY = process.env.CB_KEY;
  if (!ENV || !KEY) {
    console.log('\n[cloud] 缺少 CB_ENV / CB_KEY ⇒ 仅预览云端档计划，不写。');
  } else if (!apply) {
    console.log('\n[cloud][dry-run] 未写云端。加 --apply 执行。');
  } else {
    const cloudbase = (await import('@cloudbase/node-sdk')).default;
    const app = cloudbase.init({ env: ENV, accessKey: KEY });
    const db = app.database();
    const col = db.collection(COLL);
    await col.doc(META_DOC_ID).set({
      _schema: cloudMetaDoc._schema,
      _description: cloudMetaDoc._description,
      storage_files: cloudMetaDoc.storage_files,
    });
    for (const d of cloudTreeDocs) {
      const { _id, ...body } = d;
      await col.doc(_id).set(body);
    }
    // 旧 global 档待删：存在则删（幂等）
    await col
      .doc('global')
      .remove()
      .catch(() => {});
    console.log(`\n[cloud] 已写 _meta 单档 + ${cloudTreeDocs.length} 棵树档；旧 global 档已清。`);
  }
} else {
  console.log('\n[cloud] 未加 --cloud ⇒ 只打印计划（不碰云端）。');
}
