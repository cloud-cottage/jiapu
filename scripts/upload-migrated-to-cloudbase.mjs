#!/usr/bin/env node
/**
 * P0 上传脚本：migrate-output/ → CloudBase（复用 liwu 环境，集合加 jiazu_ 前缀）
 *
 * - 树 JSON     → 云存储 trees/<tree_id>.json（云存储按环境隔离，无前缀）
 * - 人物详情    → 集合 jiazu_person_details（_id = "<tree_id>:<handle>", doc().set 幂等 upsert）
 * - tree-meta   → 集合 jiazu_tree_meta（_meta 单档 + 每树一档 _id=tree_id）
 * - 预留业务集合：jiazu_users / jiazu_wallets / jiazu_anchors / jiazu_leave_requests / jiazu_sms_codes
 *
 * 用法:
 *   CB_ENV=<envId> CB_KEY=<jwt-api-key> node scripts/upload-migrated-to-cloudbase.mjs
 *   # 或（tcb 登录态 STS；凭据经 env 传入，不入 argv / 不落盘）：
 *   CB_ENV=<envId> TCB_SECRET_ID=<tmpSecretId> TCB_SECRET_KEY=<tmpSecretKey> TCB_TOKEN=<tmpToken> \
 *     node scripts/upload-migrated-to-cloudbase.mjs
 *
 * 凭据优先级: CB_KEY（accessKey 路径）> TCB_SECRET_ID/TCB_SECRET_KEY/TCB_TOKEN（STS 路径）；
 *            都缺 ⇒ 清晰报错 + exit 1。密钥只从环境变量读取，不落盘、不打印。
 */
import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(__dirname);
const OUT = path.join(REPO, 'migrate-output');

const ENV = process.env.CB_ENV;
const KEY = process.env.CB_KEY;
const TCB_SECRET_ID = process.env.TCB_SECRET_ID;
const TCB_SECRET_KEY = process.env.TCB_SECRET_KEY;
const TCB_TOKEN = process.env.TCB_TOKEN;
if (!ENV) {
  console.error('缺少 CB_ENV 环境变量');
  process.exit(1);
}
const hasKey = !!KEY;
const hasTcb = !!(TCB_SECRET_ID && TCB_SECRET_KEY && TCB_TOKEN);
if (!hasKey && !hasTcb) {
  console.error('缺少凭据：需 CB_KEY，或同时提供 TCB_SECRET_ID / TCB_SECRET_KEY / TCB_TOKEN');
  process.exit(1);
}

const COLLECTIONS = [
  'jiazu_person_details',
  'jiazu_tree_meta',
  'jiazu_users',
  'jiazu_wallets',
  'jiazu_anchors',
  'jiazu_leave_requests',
  'jiazu_sms_codes',
  // P3 已实现的三个集合
  'jiazu_assets',
  'jiazu_spirit',
  'jiazu_market',
  // P4 新增：站内消息 / 运营审计（docs/economy-ops.spec.md §5.3）
  'jiazu_messages',
  'jiazu_ops_logs',
  // 邀请链路（Zang 裁定 v3 · I-8）：每被邀请人一文档（_id = 被邀请人手机号）
  'jiazu_invites',
  // 邀请码链路（批 C-1）：一码一文档（_id = 6 位短码）—— 漏了云端首写直接报错（AGENTS.md §8）
  'jiazu_invite_codes',
];

// 路 B（写一致性 v2）业务集合：单文档 _id='global' → 主体系档（每主体一档）。
// 上云由本脚本「按新形态覆盖写入」，随后幂等删掉残留的旧 `_id='global'` 档
//（口径 = docs/data-model.md §7.2 R4 / docs/PENDING_DEPLOY.md §50-5 · §51-0）。
const BUSINESS_COLLECTIONS = [
  'jiazu_assets',
  'jiazu_spirit',
  'jiazu_messages',
  'jiazu_ops_logs',
  'jiazu_market',
  'jiazu_wallets',
];

const app = hasKey
  ? cloudbase.init({ env: ENV, accessKey: KEY })
  : cloudbase.init({ env: ENV, secretId: TCB_SECRET_ID, secretKey: TCB_SECRET_KEY, sessionToken: TCB_TOKEN });
const db = app.database();

async function ensureCollections() {
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      console.log(`  ✓ 集合已创建: ${name}`);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('exist') || msg.includes('exist') || msg.includes('409') || msg.includes('already')) {
        console.log(`  · 集合已存在: ${name}`);
      } else {
        console.log(`  · 集合 ${name}: ${msg.slice(0, 100)}`);
      }
    }
  }
}

async function uploadTreeJson() {
  // v2：云存储需覆盖**本地真源全部树**（`migrate-output/trees/*.json`，现 19 棵）——
  // 兼容层 getTree 按 _meta.storage_files 的 fileID 下载，缺一棵即该树云端打不开。
  const dir = path.join(OUT, 'trees');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  let uploaded = 0;
  const fileIds = {}; // tree_id -> fileID（兼容层 cloud 模式按此下载树 JSON）
  for (const f of files) {
    const treeId = f.replace(/\.json$/, '');
    const cloudPath = `trees/${treeId}.json`;
    const r = await app.uploadFile({ cloudPath, fileContent: fs.readFileSync(path.join(dir, f)) });
    fileIds[treeId] = r.fileID;
    uploaded++;
    console.log(`  ✓ 树 JSON 已上传: ${cloudPath}`);
  }
  return { uploaded, fileIds };
}

async function uploadDetails() {
  const dir = path.join(OUT, 'details');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const col = db.collection('jiazu_person_details');
  let ok = 0;
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    // doc().set: upsert 语义（存在则覆盖），保证脚本可重复执行
    // _id 优先取档体字段；**档体缺 `_id` 时取文件名**（= "<tree_id>:<handle>"，与兼容层约定一致）
    // —— 本仓 297 档中有 141 档档体内无 `_id`（文件名即 _id）。
    const docId = doc._id != null ? String(doc._id) : f.replace(/\.json$/, '');
    // 注意：_id 已由 doc(_id) 指定，body 中不能再包含 _id 字段
    const { _id, ...data } = doc;
    await col.doc(docId).set(data);
    ok++;
    if (ok % 50 === 0) console.log(`  … ${ok}/${files.length}`);
  }
  return ok;
}

/**
 * 路 B v2 业务集合上传：本地 `migrate-output/collections/<col>.json`
 * 形状 = `{ "<_id>": <档体>, ... }`（迁移脚本 apply 后每主体一档、无 `global`）。
 * 逐档 `doc(_id).set(档体)`（幂等 upsert，`_id` 由 doc() 指定、档体剥离 `_id`）；
 * 收尾幂等删掉残留的旧 `_id='global'` 档（先传新键 → 再删旧键）。
 */
async function uploadCollections() {
  const dir = path.join(OUT, 'collections');
  const counts = {};
  for (const name of BUSINESS_COLLECTIONS) {
    const file = path.join(dir, `${name}.json`);
    if (!fs.existsSync(file)) {
      console.log(`  · ${name}: 无本地档，跳过`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const col = db.collection(name);
    let n = 0;
    for (const [id, body] of Object.entries(data)) {
      if (id === 'global') continue; // v2 后不应存在；如有残留由下方 remove 清理
      const { _id, ...rest } = body || {};
      await col.doc(id).set(rest);
      n++;
    }
    await col
      .doc('global')
      .remove()
      .catch(() => {});
    counts[name] = n;
    console.log(`  ✓ ${name}: ${n} 档（旧 global 档已清）`);
  }
  return counts;
}

async function uploadTreeMeta(fileIds) {
  const meta = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'tree-meta.json'), 'utf8'));
  const col = db.collection('jiazu_tree_meta');
  // 存储形态 v2（路 B 第 4 期）：**每树一档**（_id = tree_id）+ **配置单档** _id='_meta'
  // storage_files 归 _meta 单档（兼容层 getTree 按此下载树 JSON）
  await col.doc('_meta').set({
    _schema: meta._schema,
    _description: meta._description,
    storage_files: fileIds,
  });
  let n = 0;
  for (const [key, entry] of Object.entries(meta.trees || {})) {
    const id = String(entry?.tree_id || key);
    const version = Number.isInteger(entry?.version) && entry.version >= 1 ? entry.version : 1;
    await col.doc(id).set({ ...entry, version }); // 档体 = 原 trees[tree_id] 的值 + version
    n++;
  }
  // 旧单档 global 已废弃（迁后 global 键必须消失）；存在则删除（幂等，不存在不报错）
  await col
    .doc('global')
    .remove()
    .catch(() => {});
  console.log(`  ✓ tree-meta: _meta 单档 + ${n} 棵树档已写入 jiazu_tree_meta（旧 global 档已清）`);
}

async function main() {
  console.log(`环境: ${ENV}`);
  console.log(`凭据路径: ${hasKey ? 'CB_KEY(accessKey)' : 'TCB STS(secretId/sessionToken)'}`);
  console.log('--- 1/5 确保集合存在 ---');
  await ensureCollections();
  console.log('--- 2/5 上传树 JSON (云存储 trees/*) ---');
  const { uploaded: nTrees, fileIds } = await uploadTreeJson();
  console.log(`  共 ${nTrees} 棵`);
  console.log('--- 3/5 写入人物详情 ---');
  const nDetails = await uploadDetails();
  console.log(`  共 ${nDetails} 条`);
  console.log('--- 4/5 写入路 B v2 业务集合 ---');
  const colCounts = await uploadCollections();
  console.log('--- 5/5 写入 tree-meta ---');
  await uploadTreeMeta(fileIds);

  // 验证
  console.log('--- 验证 ---');
  const cnt = await db.collection('jiazu_person_details').count();
  console.log(`  jiazu_person_details 总数: ${cnt.total}`);
  const meta = await db.collection('jiazu_tree_meta').doc('_meta').get().catch(() => null);
  console.log(`  jiazu_tree_meta/_meta: ${meta ? 'OK' : '缺失'}`);
  const treeDocs = await db
    .collection('jiazu_tree_meta')
    .where({ tree_id: db.command.exists(true) })
    .count()
    .catch(() => null);
  if (treeDocs) console.log(`  jiazu_tree_meta 树档数: ${treeDocs.total}`);
  const canRead = (r) => {
    const d = r && r.data;
    return Array.isArray(d) ? d.length > 0 : !!d;
  };
  for (const name of BUSINESS_COLLECTIONS) {
    const c = await db.collection(name).count().catch(() => null);
    const g = await db.collection(name).doc('global').get().catch(() => null);
    console.log(`  ${name}: 档数=${c ? c.total : '?'} · 旧global=${canRead(g) ? '仍在' : '无'}`);
  }
  const info = await app.getFileInfo({ fileList: Object.values(fileIds) }).catch(() => null);
  const okFiles = (info?.fileList || []).filter((f) => f.code === 'SUCCESS' || f.code === 0).length;
  console.log(`  云存储树 JSON: ${okFiles}/${Object.keys(fileIds).length} 存在`);
  console.log(`  业务集合写入档数: ${JSON.stringify(colCounts)}`);
}

main().catch((e) => {
  console.error('上传失败:', e?.message || e);
  process.exit(1);
});
