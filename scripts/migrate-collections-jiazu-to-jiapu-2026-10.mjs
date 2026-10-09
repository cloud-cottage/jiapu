#!/usr/bin/env node
/**
 * 云端集合迁移：旧前缀（jiazu ＋ 下划线）→ 新前缀（jiapu ＋ 下划线）
 * 文件：scripts/migrate-collections-jiazu-to-jiapu-2026-10.mjs
 * 环境：CloudBase env = liwu-d8gek6jjdab1d087c（与 liwu 共用环境）
 *
 * 背景：本地已完成「jiazu 前缀＋下划线」→「jiapu 前缀＋下划线」改名（代码 + 真源 15 档），
 *       但**云端集合不能原地改名** ⇒ 必须「建新集合 → 逐档保 _id 拷贝 → 双轨对账」。
 *
 * 受影响清单 20 项 = 有迁移档 15 + 代码侧 5（见 BASE_NAMES）。
 *
 * 功能：
 *   ① 盘点：列出云端现有新旧两侧集合及各自文档数（含 0 档集合与缺失集合，逐名报）；
 *   ② 建新集合：按 20 项目标名建齐全（云端写不存在的集合会报错，必须预建；已存在则幂等跳过）；
 *   ③ 导数据：逐集合把旧集合全部文档**保 _id 原样**写入新集合（逐档 doc(_id).set，幂等 upsert）；
 *   ④ 双轨验证：逐集合比文档数 + _id 全集 + 按 _id 升序抽样 N=3（另加全量）逐字段深比，输出对账表；
 *   ⑤ 旧集合一律不删（--delete-old 为预留开关，需与 --apply 同用，本单**不得执行**）。
 *
 * 用法：
 *   # dry-run（默认，只读 + 打印计划，零写入）
 *   CB_ENV=liwu-d8gek6jjdab1d087c TCB_SECRET_ID=.. TCB_SECRET_KEY=.. TCB_TOKEN=.. \
 *     node scripts/migrate-collections-jiazu-to-jiapu-2026-10.mjs
 *   # 只盘点（只读）
 *   ... --inventory
 *   # 导出备份：白名单 20 个旧集合全量文档 → ~/jiazu-backups/<批次>/ + md5 台账（只读云端）
 *   ... --export
 *   # 落盘：建集合 + 导数据 + 对账
 *   ... --apply
 *   # 【危险】迁移后删旧集合（内置白名单断言：仅恰 20 个 jiazu_* 可删，其余一律拒）
 *   ... --apply --delete-old
 *
 * 安全闸（生死线）：DELETE_WHITELIST 恰 20 个旧集合名 + assertDeletable()
 *   —— 名字不在白名单、或不以旧前缀开头 ⇒ 直接抛错拒绝（导出与删除两条路径都过闸）。
 *
 * 凭据优先级：CB_KEY（accessKey 路径）> TCB_SECRET_ID/TCB_SECRET_KEY/TCB_TOKEN（STS 路径）；
 *            都缺 ⇒ 清晰报错 + exit 1。**只从环境变量读取，不入 argv、不打印、不落盘。**
 *            node-sdk 初始化字段名必须是 sessionToken。
 *
 * 实现要点（两个必须）：
 *   - 数据面（count / 读档 / 写档 / 深比）只用 @cloudbase/node-sdk；
 *   - 元数据面（列集合 / 建集合 / 删集合）node-sdk 无能力 ⇒ 用 @cloudbase/manager-node，
 *     且**必须在隔离子进程里跑**：manager-node 依赖链里的 agent-base 会 monkey-patch 核心
 *     `https.request`，与 node-sdk 同进程时会把后者打崩（ERR_INVALID_ARG_TYPE: listener）。
 *     故本脚本以 `--admin <list|create|delete> [name]` 自调用子进程完成元数据面，凭据仅经 env 传递。
 */
import cloudbase from '@cloudbase/node-sdk';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const require_ = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.dirname(__dirname);

// ---- 参数 ----
const argv = process.argv.slice(2);
const ADMIN = argv[0] === '--admin';
const APPLY = argv.includes('--apply');
const INVENTORY_ONLY = argv.includes('--inventory');
const EXPORT = argv.includes('--export');
const DELETE_OLD = argv.includes('--delete-old');
const SAMPLE_N = 3;

// 备份落点（持久位置，禁用 /tmp）
const BACKUP_DIR = path.join(
  os.homedir(),
  'jiazu-backups',
  '2026-10-09-jiazu-collections-pre-delete',
);

// ---- 凭据（仅 env；不入 argv / 不打印）----
const ENV = process.env.CB_ENV;
const KEY = process.env.CB_KEY;
const TCB_SECRET_ID = process.env.TCB_SECRET_ID;
const TCB_SECRET_KEY = process.env.TCB_SECRET_KEY;
const TCB_TOKEN = process.env.TCB_TOKEN;
if (!ENV) {
  console.error('缺少 CB_ENV 环境变量（环境 Id）');
  process.exit(1);
}
const hasKey = !!KEY;
const hasTcb = !!(TCB_SECRET_ID && TCB_SECRET_KEY && TCB_TOKEN);
if (!hasKey && !hasTcb) {
  console.error('缺少凭据：需 CB_KEY，或同时提供 TCB_SECRET_ID / TCB_SECRET_KEY / TCB_TOKEN');
  process.exit(1);
}
if (!ADMIN && DELETE_OLD && !APPLY) {
  console.error('✖ --delete-old 必须与 --apply 同用（单独使用无意义）');
  process.exit(1);
}

// ---- 旧 / 新前缀（拼接构造，脚本自身不含被替换字面量，避免被改名脚本二次命中）----
const OLD_PREFIX = ['jia', 'zu', '_'].join('');
const NEW_PREFIX = ['jia', 'pu', '_'].join('');
const OLD = (n) => OLD_PREFIX + n;
const NEW = (n) => NEW_PREFIX + n;

// 受影响清单 20 项。前 15 = 本地有迁移档（migrate-output/collections/*.json）；
// 后 5 = 代码侧引用（本次一并迁移）。
const BASE_NAMES = [
  // —— 有迁移档（15）——
  'anchors',
  'assets',
  'clan_requests',
  'founder_requests',
  'id_seq',
  'invite_codes',
  'leave_requests',
  'market',
  'marriage_requests',
  'messages',
  'ops_logs',
  'sms_codes',
  'spirit',
  'users',
  'wallets',
  // —— 代码侧（5）——
  'person_details',
  'tree_meta',
  'friends',
  'invites',
  'join_requests',
];

// ---- 删除白名单（生死线 · 恰 20 个旧集合 · 逐字）----
// 除以下 20 个 jiazu_* 外，任何集合一律不得删（含全部 jiapu_* 与其它项目的 65 个）。
const DELETE_WHITELIST = [
  'jiazu_anchors',
  'jiazu_assets',
  'jiazu_clan_requests',
  'jiazu_founder_requests',
  'jiazu_id_seq',
  'jiazu_invite_codes',
  'jiazu_leave_requests',
  'jiazu_market',
  'jiazu_marriage_requests',
  'jiazu_messages',
  'jiazu_ops_logs',
  'jiazu_sms_codes',
  'jiazu_spirit',
  'jiazu_users',
  'jiazu_wallets',
  'jiazu_person_details',
  'jiazu_tree_meta',
  'jiazu_friends',
  'jiazu_invites',
  'jiazu_join_requests',
];
const DELETE_WHITELIST_SET = new Set(DELETE_WHITELIST);

// 内置断言：名字不在白名单 ⇒ 拒；不以旧前缀开头 ⇒ 拒。删前逐集合再断一次。
function assertDeletable(name) {
  if (!DELETE_WHITELIST_SET.has(name)) {
    throw new Error(`✖ 拒绝删除：${name} 不在删除白名单（恰 20 个 ${OLD_PREFIX}*）`);
  }
  if (!String(name).startsWith(OLD_PREFIX)) {
    throw new Error(`✖ 拒绝删除：${name} 不以旧前缀 ${OLD_PREFIX} 开头`);
  }
  return true;
}

// 自检：白名单必须恰 20、互不重复，且与 BASE_NAMES 映射出的旧名逐一一致。
{
  const expected = BASE_NAMES.map(OLD);
  const mismatch =
    DELETE_WHITELIST.length !== 20 ||
    DELETE_WHITELIST_SET.size !== 20 ||
    DELETE_WHITELIST.some((n) => !expected.includes(n)) ||
    expected.some((n) => !DELETE_WHITELIST_SET.has(n));
  if (mismatch) {
    console.error('✖ 白名单自检失败：DELETE_WHITELIST 与 BASE_NAMES 映射不一致');
    process.exit(1);
  }
}

// ---- manager-node 定位（repo → 全局 npm root 下的 @cloudbase/cli）----
function loadManager() {
  const cands = [
    path.join(REPO, 'node_modules', '@cloudbase', 'manager-node'),
    path.join(REPO, 'node_modules', '@cloudbase', 'cli', 'node_modules', '@cloudbase', 'manager-node'),
    '/usr/local/lib/node_modules/@cloudbase/cli/node_modules/@cloudbase/manager-node',
  ];
  try {
    const g = require_('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim();
    if (g) cands.push(path.join(g, '@cloudbase', 'cli', 'node_modules', '@cloudbase', 'manager-node'));
  } catch {}
  for (const p of cands) {
    try {
      return require_(p);
    } catch {}
  }
  return null;
}

// ================= 隐藏模式：隔离子进程（只用 manager-node）=================
async function runAdminChild(args) {
  const [op, name] = args;
  const finish = (obj) => process.stdout.write('##ADMIN##' + JSON.stringify(obj) + '\n');
  const mgr = loadManager();
  if (!mgr) {
    finish({ ok: false, error: 'manager-node 不可用（本机未找到 @cloudbase/manager-node）' });
    return;
  }
  const app = mgr.init({ envId: ENV, secretId: TCB_SECRET_ID, secretKey: TCB_SECRET_KEY, token: TCB_TOKEN });
  try {
    if (op === 'list') {
      const r = await app.database.listCollections();
      const cols = (r && (r.Collections || r.collections)) || [];
      finish({
        ok: true,
        collections: cols.map((c) => ({
          name: c.CollectionName || c.collectionName || c.TableName || c.name,
          count: typeof c.Count === 'number' ? c.Count : null,
        })),
      });
    } else if (op === 'create') {
      const r = await app.database.createCollectionIfNotExists(name);
      finish({ ok: true, created: !!(r && r.IsCreated) });
    } else if (op === 'delete') {
      assertDeletable(name); // 隔离子进程内再断一次（生死线 · 双闸）
      await app.database.deleteCollection(name);
      finish({ ok: true });
    } else {
      finish({ ok: false, error: `未知 admin op: ${op}` });
    }
  } catch (e) {
    finish({ ok: false, error: String(e?.message || e) });
  }
}

/** 主进程侧调用隔离 admin 子进程；返回 {ok, ...} */
function adminCall(args) {
  try {
    const out = execFileSync(process.execPath, [__filename, '--admin', ...args], {
      encoding: 'utf8',
      env: process.env, // 凭据仅经 env 传递，不入 argv
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split('\n').reverse().find((l) => l.startsWith('##ADMIN##'));
    if (!line) return { ok: false, error: 'admin 子进程无返回标记' };
    return JSON.parse(line.slice('##ADMIN##'.length));
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// ================= 数据面（node-sdk）=================
const app = hasKey
  ? cloudbase.init({ env: ENV, accessKey: KEY })
  : cloudbase.init({ env: ENV, secretId: TCB_SECRET_ID, secretKey: TCB_SECRET_KEY, sessionToken: TCB_TOKEN });
const db = app.database();

async function countOf(name) {
  try {
    const r = await db.collection(name).count();
    return { exists: true, count: typeof r?.total === 'number' ? r.total : 0 };
  } catch (e) {
    return { exists: false, count: null };
  }
}

const PAGE = 100;
async function readAll(name) {
  const col = db.collection(name);
  const out = [];
  let skip = 0;
  for (;;) {
    const res = await col.orderBy('_id', 'asc').skip(skip).limit(PAGE).get();
    const data = (res && res.data) || [];
    out.push(...data);
    if (data.length < PAGE) break;
    skip += PAGE;
    if (skip > 500000) throw new Error('分页越界保护触发');
  }
  return out;
}

function canon(v) {
  if (v === null || v === undefined) return JSON.stringify(null);
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') {
    const ks = Object.keys(v).sort();
    return '{' + ks.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
const stripId = (d) => {
  const { _id, ...rest } = d || {};
  return rest;
};

// ---- 集合列举：admin 子进程优先；不可用则退化为已知名逐个 count() ----
async function listCloudCollections() {
  const r = adminCall(['list']);
  if (r.ok && Array.isArray(r.collections)) {
    const m = new Map();
    for (const c of r.collections) if (c.name) m.set(c.name, c.count);
    return { map: m, source: 'manager-node.listCollections（隔离子进程）' };
  }
  console.log(`  ! manager-node 不可用（${r.error}），退化为已知名逐个 count() 探测`);
  const m = new Map();
  for (const base of BASE_NAMES) {
    for (const name of [OLD(base), NEW(base)]) {
      const c = await countOf(name);
      if (c.exists) m.set(name, c.count);
    }
  }
  return { map: m, source: 'node-sdk count() 探测（可能漏报清单外集合）' };
}

async function ensureCollection(name) {
  const r = adminCall(['create', name]);
  if (r.ok) return r.created ? 'created' : 'exists';
  // 退化：node-sdk。注意 @cloudbase/node-sdk@3.18.3 的 createCollection 在建表**成功**后
  // 仍可能抛伪错误，故不轻信异常，一律以「建后存在性复查」为准。
  console.log(`  ! admin 建集合不可用（${r.error}），退化 node-sdk + 存在性复查`);
  try {
    await db.createCollection(name);
  } catch {}
  const c = await countOf(name);
  if (c.exists) return 'created';
  throw new Error(`建集合 ${name} 失败（admin 与 node-sdk 两路均未成功）`);
}

async function copyCollection(oldName, newName) {
  const docs = await readAll(oldName);
  const col = db.collection(newName);
  let n = 0;
  for (const d of docs) {
    const id = String(d._id);
    const { _id, ...body } = d;
    await col.doc(id).set(body); // 幂等 upsert（存在则覆盖为新值）
    n++;
    if (n % 100 === 0) console.log(`      … ${n}/${docs.length}`);
  }
  return { read: docs.length, written: n };
}

async function reconcile(oldName, newName) {
  const [oldDocs, newDocs] = await Promise.all([readAll(oldName), readAll(newName)]);
  const oldMap = new Map(oldDocs.map((d) => [String(d._id), d]));
  const newMap = new Map(newDocs.map((d) => [String(d._id), d]));
  const onlyOld = [...oldMap.keys()].filter((k) => !newMap.has(k));
  const onlyNew = [...newMap.keys()].filter((k) => !oldMap.has(k));
  const fieldDiffs = [];
  for (const [id, od] of oldMap) {
    const nd = newMap.get(id);
    if (!nd) continue;
    if (canon(stripId(od)) !== canon(stripId(nd))) fieldDiffs.push(id);
  }
  const idsAsc = [...oldMap.keys()].sort().slice(0, SAMPLE_N);
  const samples = idsAsc.map((id) => ({
    id,
    same: canon(stripId(oldMap.get(id))) === canon(stripId(newMap.get(id) || {})),
  }));
  return {
    oldCount: oldDocs.length,
    newCount: newDocs.length,
    idsMatch: onlyOld.length === 0 && onlyNew.length === 0,
    onlyOldCount: onlyOld.length,
    onlyNewCount: onlyNew.length,
    onlyOld: onlyOld.slice(0, 5),
    onlyNew: onlyNew.slice(0, 5),
    fieldDiffCount: fieldDiffs.length,
    fieldDiffSample: fieldDiffs.slice(0, 5),
    samples,
  };
}

// ---- 导出备份（--export）：全量文档落盘 + md5 台账 + 计数台账 ----
async function runExport() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ledger = [];
  const counts = [];
  let grand = 0;
  for (const base of BASE_NAMES) {
    const name = OLD(base);
    assertDeletable(name); // 导出只针对白名单内集合
    const cloud = await countOf(name);
    const docs = await readAll(name);
    if (cloud.count === null || docs.length !== cloud.count) {
      throw new Error(
        `✖ 档数不符：${name} 导出 ${docs.length} 档 / 云端 ${cloud.count} 档 —— 停下报回`,
      );
    }
    const file = path.join(BACKUP_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(docs, null, 2));
    const buf = fs.readFileSync(file);
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    ledger.push(`${md5}  ${String(buf.length).padStart(8)}  ${name}.json`);
    counts.push(`${name}\t${docs.length}`);
    grand += docs.length;
    console.log(`  ✓ ${name}.json  ${docs.length} 档  ${buf.length} B  md5=${md5}`);
  }
  fs.writeFileSync(path.join(BACKUP_DIR, 'MD5-LEDGER.txt'), ledger.join('\n') + '\n');
  fs.writeFileSync(path.join(BACKUP_DIR, 'COUNTS.txt'), counts.join('\n') + '\n');
  console.log('');
  console.log(`  合计导出 ${grand} 档 / ${BASE_NAMES.length} 集合`);
  console.log(`  台账：MD5-LEDGER.txt（${ledger.length} 行）/ COUNTS.txt（${counts.length} 行）`);
  return { grand, dir: BACKUP_DIR };
}

// ================= main =================
async function main() {
  console.log('=== 云端集合迁移：旧前缀 → 新前缀 ===');
  const mode = APPLY
    ? 'APPLY（落盘）'
    : INVENTORY_ONLY
      ? 'INVENTORY（只盘点）'
      : EXPORT
        ? 'EXPORT（导出备份，只读云端）'
        : 'DRY-RUN（默认，零写入）';
  console.log(`模式        : ${mode}`);
  console.log(`环境        : ${ENV}`);
  console.log(`凭据路径    : ${hasKey ? 'CB_KEY(accessKey)' : 'TCB STS(secretId/sessionToken)'} —— 仅 env 变量名已设置，值不打印`);
  console.log(`受影响清单  : ${BASE_NAMES.length} 项`);
  console.log(`删除白名单  : ${DELETE_WHITELIST.length} 项（仅此 20 个 jiazu_* 可删，余者一律拒）`);
  console.log(`旧集合不删  : ${DELETE_OLD ? '⚠️  --delete-old 已开启（危险）' : '是（--delete-old 未开启）'}`);
  console.log('');

  // ---------- ① 盘点 ----------
  console.log('--- ① 盘点云端集合 ---');
  const { map: cloudMap, source } = await listCloudCollections();
  console.log(`  列举来源: ${source}（云端集合总数 ${cloudMap.size}）`);
  const unknownOld = [...cloudMap.keys()].filter((n) => n.startsWith(OLD_PREFIX) && !BASE_NAMES.some((b) => OLD(b) === n));
  const unknownNew = [...cloudMap.keys()].filter((n) => n.startsWith(NEW_PREFIX) && !BASE_NAMES.some((b) => NEW(b) === n));
  if (unknownOld.length) console.log(`  ⚠️ 云端存在清单外的旧集合: ${unknownOld.join(', ')}（未纳入本次迁移）`);
  if (unknownNew.length) console.log(`  ⚠️ 云端存在清单外的新集合: ${unknownNew.join(', ')}（未纳入本次迁移）`);

  const rows = [];
  for (const base of BASE_NAMES) {
    const oldName = OLD(base);
    const newName = NEW(base);
    const o = cloudMap.has(oldName) ? { exists: true, count: cloudMap.get(oldName) } : await countOf(oldName);
    const n = cloudMap.has(newName) ? { exists: true, count: cloudMap.get(newName) } : await countOf(newName);
    rows.push({ base, oldName, newName, old: o, nw: n });
  }

  const pad = (s, w) => String(s).padEnd(w);
  console.log('');
  console.log(`${pad('旧集合', 26)}${pad('旧档数', 8)}${pad('新集合', 26)}${pad('新档数', 8)}状态`);
  for (const r of rows) {
    const oTxt = r.old.exists ? String(r.old.count) : '缺失(无此旧集合)';
    const nTxt = r.nw.exists ? String(r.nw.count) : '未建';
    const st = !r.old.exists ? '云端无此旧集合 ⇒ 建空集合' : r.nw.exists ? '新集合已存在' : '待建';
    console.log(`${pad(r.oldName, 26)}${pad(oTxt, 8)}${pad(r.newName, 26)}${pad(nTxt, 8)}${st}`);
  }
  const missingOld = rows.filter((r) => !r.old.exists).map((r) => r.oldName);
  console.log('');
  console.log(`  旧集合缺失数: ${missingOld.length}${missingOld.length ? ' —— ' + missingOld.join(', ') : ''}`);

  if (INVENTORY_ONLY) {
    console.log('');
    console.log('（--inventory：只盘点，未做任何写入）');
    return;
  }

  // ---------- ② 导出备份（--export）：全量文档 + md5 台账 ----------
  if (EXPORT) {
    console.log('');
    console.log('--- ② 导出备份（全量文档 + md5 台账 · 只读云端）---');
    const r = await runExport();
    console.log('');
    console.log(`✓ 备份目录：${r.dir}`);
    return;
  }

  // ---------- 建新集合（仅 --apply；dry-run 只打印计划）----------
  if (!APPLY) {
    console.log('');
    console.log('--- DRY-RUN 计划 ---');
    for (const r of rows) {
      console.log(`  · 建 ${r.newName}${r.nw.exists ? '（已存在，幂等跳过）' : ''}；导 ${r.old.exists ? r.old.count : 0} 档（保 _id）`);
    }
    console.log('');
    console.log('（dry-run 未做任何写入；确认后加 --apply 落盘）');
    return;
  }

  console.log('');
  console.log('--- ② 建新集合 ---');
  for (const r of rows) {
    const s = await ensureCollection(r.newName);
    console.log(`  ${s === 'created' ? '✓ 已创建' : '· 已存在'}  ${r.newName}`);
  }

  // ---------- ③ 导数据 ----------
  console.log('');
  console.log('--- ③ 导数据（保 _id，幂等 upsert）---');
  for (const r of rows) {
    if (!r.old.exists) {
      console.log(`  · ${r.oldName}: 云端无此旧集合 ⇒ 新集合保持空（0 档）`);
      continue;
    }
    console.log(`  · ${r.oldName} → ${r.newName} …`);
    const s = await copyCollection(r.oldName, r.newName);
    console.log(`    ✓ ${s.read} 档读入 / ${s.written} 档写入`);
  }

  // ---------- ④ 双轨对账 ----------
  console.log('');
  console.log('--- ④ 双轨对账（旧 vs 新）---');
  const bad = [];
  console.log(
    `${pad('集合', 24)}${pad('旧档', 7)}${pad('新档', 7)}${pad('_id集', 8)}${pad('字段深比', 14)}${pad('抽样N=3', 10)}结论`,
  );
  for (const r of rows) {
    if (!r.old.exists) {
      const n = await countOf(r.newName);
      console.log(`${pad(r.oldName, 24)}${pad('—', 7)}${pad(n.count ?? '?', 7)}${pad('—', 8)}${pad('—', 14)}${pad('—', 10)}云端无旧集合（新为空）`);
      continue;
    }
    const rec = await reconcile(r.oldName, r.newName);
    const sampleTxt = `${rec.samples.filter((s) => s.same).length}/${rec.samples.length}`;
    const deepTxt = rec.fieldDiffCount === 0 ? `全量一致(${rec.newCount})` : `${rec.fieldDiffCount} 处不一致`;
    const ok = rec.oldCount === rec.newCount && rec.idsMatch && rec.fieldDiffCount === 0;
    console.log(
      `${pad(r.oldName, 24)}${pad(rec.oldCount, 7)}${pad(rec.newCount, 7)}${pad(rec.idsMatch ? '✓' : '✗', 8)}${pad(deepTxt, 14)}${pad(sampleTxt, 10)}${ok ? 'OK' : '✗ 不一致'}`,
    );
    for (const s of rec.samples) if (!s.same) console.log(`      抽样字段不一致: _id=${s.id}`);
    if (!rec.idsMatch) {
      console.log(`      仅旧有(_id): ${rec.onlyOld.join(', ')}${rec.onlyOldCount > 5 ? ` …共${rec.onlyOldCount}` : ''}`);
      console.log(`      仅新有(_id): ${rec.onlyNew.join(', ')}${rec.onlyNewCount > 5 ? ` …共${rec.onlyNewCount}` : ''}`);
    }
    if (rec.fieldDiffCount) console.log(`      字段不一致样例 _id: ${rec.fieldDiffSample.join(', ')}`);
    if (!ok) bad.push({ name: r.oldName, rec });
  }

  console.log('');
  if (bad.length === 0) {
    console.log(`✓ 对账通过：${rows.length} 项集合全部一致（文档数 + _id 全集 + 全量字段深比）。`);
  } else {
    console.log(`✖ 对账失败：${bad.length} 项不一致 —— 停下报回，不手工凑数：`);
    for (const b of bad) console.log(`    - ${b.name}: 旧${b.rec.oldCount} / 新${b.rec.newCount} / id集${b.rec.idsMatch ? '一致' : '不一致'} / 字段差${b.rec.fieldDiffCount}`);
  }

  // ---------- ⑤ 旧集合删除（预留，本单不执行）----------
  if (DELETE_OLD) {
    if (bad.length) {
      console.error('✖ 对账未通过，拒绝执行 --delete-old');
      process.exit(1);
    }
    console.log('');
    console.log('--- ⑤ 删除旧集合（--delete-old）---');
    // 删前再断：全部待删名必须落在白名单内（生死线）
    const toDelete = rows.filter((r) => r.old.exists).map((r) => r.oldName);
    for (const n of toDelete) assertDeletable(n);
    console.log(`  待删 ${toDelete.length} 个（均经白名单断言）：${toDelete.join(', ')}`);
    let deleted = 0;
    const failures = [];
    for (const name of toDelete) {
      assertDeletable(name); // 逐集合删前再断一次
      const d = adminCall(['delete', name]);
      if (d.ok) {
        deleted++;
        console.log(`  ✓ 已删 ${name}`);
      } else {
        failures.push({ name, error: d.error });
        console.log(`  ✖ 删除失败 ${name} —— ${d.error}`);
      }
    }
    console.log('');
    console.log(`  删除汇总：成功 ${deleted} / ${toDelete.length}`);
    if (failures.length) {
      console.log(`  ✖ ${failures.length} 个删除失败（不应有失败）：`);
      for (const f of failures) console.log(`    - ${f.name}: ${f.error}`);
    }
  } else {
    console.log('');
    console.log('旧集合一律保留（未开启 --delete-old）；删除待人工拍板后另行执行。');
  }
}

const entry = ADMIN ? runAdminChild(argv.slice(1)) : main();
entry.catch((e) => {
  console.error('迁移失败:', e?.stack || e?.message || e);
  process.exit(1);
});
