#!/usr/bin/env node
/**
 * 窄路径上传（§64 编号口径变更上云 · 仅核心数据面）
 *
 * 覆盖面（**只这四项**）：
 *   1. 云存储 trees/*.json —— 按 jiapu_tree_meta/_meta.storage_files 的 fileID 覆盖（19 棵）
 *   2. 集合 jiapu_person_details —— 303 档 upsert（_id = 文件名 "<tree_id>:<handle>"）
 *   3. 集合 jiapu_tree_meta —— _meta 单档 + 19 棵树档
 *   4. 集合 jiapu_founder_requests —— 2 档 upsert
 *
 * 硬排除（**一律不碰**）：jiapu_assets / jiapu_spirit / jiapu_messages / jiapu_ops_logs /
 *   jiapu_market / jiapu_wallets / jiapu_users / jiapu_anchors / jiapu_sms_codes /
 *   jiapu_invite_codes / jiapu_invites / jiapu_friends / *_requests(其它) / jiapu_id_seq 等。
 *
 * 用法（凭据经 env 传入，不入 argv / 不落盘 / 不打印）：
 *   CB_ENV=<envId> TCB_SECRET_ID=<s> TCB_SECRET_KEY=<k> TCB_TOKEN=<t> \
 *     node scripts/upload-id-core-to-cloudbase.mjs
 */
import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(__dirname);
const OUT = path.join(REPO, 'migrate-output');

const ENV = process.env.CB_ENV;
const KEY = process.env.CB_KEY;
const TCB_SECRET_ID = process.env.TCB_SECRET_ID;
const TCB_SECRET_KEY = process.env.TCB_SECRET_KEY;
const TCB_TOKEN = process.env.TCB_TOKEN;
if (!ENV) { console.error('缺少 CB_ENV 环境变量'); process.exit(1); }
const hasKey = !!KEY;
const hasTcb = !!(TCB_SECRET_ID && TCB_SECRET_KEY && TCB_TOKEN);
if (!hasKey && !hasTcb) {
  console.error('缺少凭据：需 CB_KEY，或同时提供 TCB_SECRET_ID / TCB_SECRET_KEY / TCB_TOKEN');
  process.exit(1);
}

const app = hasKey
  ? cloudbase.init({ env: ENV, accessKey: KEY })
  : cloudbase.init({ env: ENV, secretId: TCB_SECRET_ID, secretKey: TCB_SECRET_KEY, sessionToken: TCB_TOKEN });
const db = app.database();

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

function filesIn(dir, ext) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort();
}

/** cloud://<env>.<bucket>/trees/x.json -> trees/x.json */
function pathFromFileId(fileID) {
  const i = fileID.indexOf('/trees/');
  if (i < 0) throw new Error(`unexpected fileID: ${fileID}`);
  return fileID.slice(i + 1); // -> trees/x.json
}

async function readCloudMeta() {
  const r = await db.collection('jiapu_tree_meta').doc('_meta').get();
  const d = r && r.data;
  const doc = Array.isArray(d) ? d[0] : d;
  if (!doc || !doc.storage_files) throw new Error('云端 jiapu_tree_meta/_meta.storage_files 缺失');
  return doc;
}

async function uploadTrees(storageFiles) {
  const dir = path.join(OUT, 'trees');
  const localIds = filesIn(dir, '.json').map((f) => f.replace(/\.json$/, ''));
  const cloudIds = Object.keys(storageFiles).sort();
  if (localIds.length !== 19 || cloudIds.length !== 19) {
    throw new Error(`树数量异常：local=${localIds.length} cloud=${cloudIds.length}`);
  }
  const onlyLocal = localIds.filter((t) => !storageFiles[t]);
  if (onlyLocal.length) throw new Error(`本地树无云 fileID: ${onlyLocal.join(',')}`);
  const result = { localMd5: {}, uploaded: 0, fileIds: {} };
  for (const treeId of localIds) {
    const buf = fs.readFileSync(path.join(dir, `${treeId}.json`));
    result.localMd5[treeId] = md5(buf);
    const cloudPath = pathFromFileId(storageFiles[treeId]);
    const r = await app.uploadFile({ cloudPath, fileContent: buf });
    result.fileIds[treeId] = r.fileID;
    result.uploaded++;
    console.log(`  ✓ 树 JSON: ${cloudPath}`);
  }
  return result;
}

async function uploadDetails() {
  const dir = path.join(OUT, 'details');
  const files = filesIn(dir, '.json');
  const col = db.collection('jiapu_person_details');
  let ok = 0;
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const docId = doc._id != null ? String(doc._id) : f.replace(/\.json$/, '');
    const { _id, ...data } = doc;
    await col.doc(docId).set(data);
    ok++;
    if (ok % 100 === 0) console.log(`  … ${ok}/${files.length}`);
  }
  return ok;
}

async function uploadTreeMeta(cloudMeta) {
  const meta = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'tree-meta.json'), 'utf8'));
  const col = db.collection('jiapu_tree_meta');
  // _meta 单档：保结构 + 原 storage_files（不动 fileID 映射）
  await col.doc('_meta').set({
    _schema: cloudMeta._schema,
    _description: cloudMeta._description,
    storage_files: cloudMeta.storage_files,
  });
  let n = 0;
  for (const [key, entry] of Object.entries(meta.trees || {})) {
    const id = String(entry?.tree_id || key);
    const version = Number.isInteger(entry?.version) && entry.version >= 1 ? entry.version : 1;
    await col.doc(id).set({ ...entry, version });
    n++;
  }
  return n;
}

async function uploadFounderRequests() {
  const file = path.join(OUT, 'collections', 'jiapu_founder_requests.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const col = db.collection('jiapu_founder_requests');
  let n = 0;
  for (const [id, body] of Object.entries(data)) {
    const { _id, ...rest } = body || {};
    await col.doc(id).set(rest);
    n++;
  }
  return n;
}

async function readBackTrees(fileIds, localMd5) {
  const ids = Object.keys(fileIds).sort();
  const results = [];
  for (const treeId of ids) {
    const r = await app.downloadFile({ fileID: fileIds[treeId] });
    const buf = r.fileContent;
    const got = md5(buf);
    results.push({ treeId, match: got === localMd5[treeId], cloudMd5: got, localMd5: localMd5[treeId] });
  }
  return results;
}

async function main() {
  console.log(`环境: ${ENV}`);
  console.log(`凭据路径: ${hasKey ? 'CB_KEY(accessKey)' : 'TCB STS(secretId/sessionToken)'}`);
  console.log('--- 0/3 读取云端 _meta.storage_files ---');
  const cloudMeta = await readCloudMeta();
  const nFiles = Object.keys(cloudMeta.storage_files).length;
  console.log(`  云端登记树 fileID: ${nFiles} 个`);

  console.log('--- 1/3 覆盖上传树 JSON（云存储）---');
  const treeRes = await uploadTrees(cloudMeta.storage_files);
  console.log(`  共 ${treeRes.uploaded} 棵`);

  console.log('--- 2/3 写入 person_details + tree_meta + founder_requests ---');
  const nDetails = await uploadDetails();
  const nMeta = await uploadTreeMeta(cloudMeta);
  const nFounder = await uploadFounderRequests();
  console.log(`  person_details: ${nDetails} 档 · tree_meta 树档: ${nMeta} · founder_requests: ${nFounder} 档`);

  console.log('--- 3/3 回读校验 ---');
  const rb = await readBackTrees(treeRes.fileIds, treeRes.localMd5);
  const mism = rb.filter((x) => !x.match);
  console.log(`  云端树 JSON 回读 md5 一致: ${rb.length - mism.length}/${rb.length}`);
  for (const x of rb) console.log(`    ${x.match ? '✓' : '✗'} ${x.treeId}  ${x.cloudMd5}`);
  if (mism.length) { console.error('  ✖ 回读不一致:', mism.map((m) => m.treeId)); process.exit(2); }

  const cD = await db.collection('jiapu_person_details').count();
  const cM = await db.collection('jiapu_tree_meta').where({ tree_id: db.command.exists(true) }).count();
  const cF = await db.collection('jiapu_founder_requests').count();
  console.log(`  集合计数: person_details=${cD.total} · tree_meta(树档)=${cM.total} · founder_requests=${cF.total}`);

  // 硬排除面证据（只读计数，证明未被本脚本改动）
  for (const name of ['jiapu_assets', 'jiapu_spirit', 'jiapu_messages', 'jiapu_ops_logs', 'jiapu_market', 'jiapu_wallets']) {
    const c = await db.collection(name).count().catch(() => null);
    console.log(`  [排除] ${name}: 档数=${c ? c.total : '?'}（本脚本未写）`);
  }
}

main().catch((e) => { console.error('上传失败:', e?.message || e); process.exit(1); });
