/**
 * 数据访问层（P1/P2 共用，双模式）
 *
 * local 模式（COMPAT_SOURCE=local）：
 *   - 树 JSON / 详情：读写 migrate-output/（trees/ + details/）
 *   - 集合：读写 migrate-output/collections/<col>.json（模拟 CloudBase 文档集合）
 * cloud 模式（COMPAT_SOURCE=cloud，默认）：
 *   - 树 JSON：云存储（fileID 来自 jiazu_tree_meta.storage_files）
 *   - 详情 / 集合：CloudBase 文档库（jiazu_ 前缀集合）
 *
 * 全部 SDK 调用走 sdkCall 互斥队列（@cloudbase/node-sdk 并发会 aborted）。
 */
import cloudbase from '@cloudbase/node-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 双形态兼容：CJS（云函数打包产物）用全局 __dirname；ESM（本地源码）用 import.meta.url
const __dirname = (() => {
  try {
    return eval('__dirname');
  } catch {
    return path.dirname(fileURLToPath(import.meta.url));
  }
})();
// lib/ → compat-api/ → cloudfunctions/ → 项目根
const REPO = path.dirname(path.dirname(path.dirname(__dirname)));
// COMPAT_OUT_DIR：本地测试可把数据根指到副本目录，避免写坏 migrate-output 真源
const OUT = process.env.COMPAT_OUT_DIR || path.join(REPO, 'migrate-output');
const COLS_DIR = path.join(OUT, 'collections');
// 真实 tree-meta（git 管理，唯一真源）—— 只允许「非沙箱」的本地服务写它
const REAL_META_FILE = path.join(REPO, 'config', 'tree-meta.json');

/**
 * 硬护栏（P0，防「测试夹具覆盖真实 tree-meta」事故复发）：
 * 沙箱判定 = 显式副本（COMPAT_OUT_DIR / COMPAT_META_FILE）或 node --test 子进程（NODE_TEST_CONTEXT）。
 * 沙箱下 meta 的读写根一律是副本：
 *   COMPAT_META_FILE > <COMPAT_OUT_DIR>/tree-meta.json > 抛错（绝不落真实 config/tree-meta.json）
 */
const SANDBOX_BY_ENV = !!(process.env.COMPAT_META_FILE || process.env.COMPAT_OUT_DIR);
const SANDBOX = SANDBOX_BY_ENV || !!process.env.NODE_TEST_CONTEXT;
const META_FILE = (() => {
  if (process.env.COMPAT_META_FILE) return path.resolve(process.env.COMPAT_META_FILE);
  if (process.env.COMPAT_OUT_DIR) return path.join(path.resolve(process.env.COMPAT_OUT_DIR), 'tree-meta.json');
  return REAL_META_FILE;
})();

const samePath = (a, b) => {
  try {
    return path.resolve(a) === path.resolve(b);
  } catch {
    return a === b;
  }
};

/**
 * 沙箱（测试 / 副本模式）下的统一写保护：真实 config/tree-meta.json 与真实 migrate-output/
 * 一律拒绝写入 → 抛错（宁可让测试红，也不许污染真源）。
 * 说明：非沙箱（本地服务，如在跑的 3100）不受影响，照常写真源。
 */
function assertWriteAllowed(target) {
  if (!SANDBOX) return target;
  const p = path.resolve(String(target));
  const realRoot = path.join(REPO, 'migrate-output');
  const hitsReal =
    samePath(p, REAL_META_FILE) || p === realRoot || p.startsWith(realRoot + path.sep);
  // 显式指到副本（COMPAT_OUT_DIR/COMPAT_META_FILE）时天然不会命中真源；命中即配置错误或漏配
  if (hitsReal) {
    throw new Error(
      `[store] 沙箱模式（COMPAT_OUT_DIR / COMPAT_META_FILE / node --test）禁止写入真实数据：${p}；` +
        '请把 COMPAT_OUT_DIR / COMPAT_META_FILE 指向 /tmp 副本',
    );
  }
  return target;
}

const ENV = process.env.TCB_ENV_ID || process.env.CB_ENV || '';
export const SOURCE = process.env.COMPAT_SOURCE || 'cloud'; // local | cloud

/** 当前运行模式的路径快照（回归测试断言「没指到真源」用） */
export const PATHS = {
  out: OUT,
  metaFile: META_FILE,
  realMetaFile: REAL_META_FILE,
  sandbox: SANDBOX,
  sandboxByEnv: SANDBOX_BY_ENV,
  sandboxByTestRunner: !SANDBOX_BY_ENV && !!process.env.NODE_TEST_CONTEXT,
};

let app = null;
let metaCache = null;
/** local 模式：`metaCache` 对应的磁盘指纹（mtimeMs/size/ctimeMs）；null = 快照时拿不到 stat */
let metaStamp = null;
const treeCache = new Map(); // tree_id -> tree JSON
const eventIndexCache = new Map(); // tree_id -> Map(event_handle -> event)
const colCache = new Map(); // col -> Map(_id -> doc)

// ---- SDK 互斥队列（并发 abort 防护） ----

let sdkQueue = Promise.resolve();
async function sdkCall(fn) {
  const run = sdkQueue.then(async () => {
    try {
      return await fn();
    } catch (e) {
      if (String(e?.message || e).includes('abort')) {
        await new Promise((r) => setTimeout(r, 200));
        return fn();
      }
      throw e;
    }
  });
  sdkQueue = run.catch(() => {});
  return run;
}

function getApp() {
  if (!app) app = cloudbase.init({ env: ENV, ...(process.env.CB_KEY ? { accessKey: process.env.CB_KEY } : {}) });
  return app;
}

// ---- 集合访问（users/wallets/anchors/... 统一接口） ----

function colFilePath(col) {
  return path.join(COLS_DIR, `${col}.json`);
}

async function loadCol(col) {
  if (colCache.has(col)) return colCache.get(col);
  let map = new Map();
  if (SOURCE === 'local') {
    try {
      const raw = JSON.parse(fs.readFileSync(colFilePath(col), 'utf8'));
      for (const [id, doc] of Object.entries(raw)) map.set(id, doc);
    } catch {
      /* 文件不存在 → 空集合 */
    }
  } else {
    const r = await sdkCall(() => getApp().database().collection(col).limit(5000).get());
    for (const d of r?.data || []) map.set(d._id, d);
  }
  colCache.set(col, map);
  return map;
}

/**
 * local 落盘（写整份集合文件）。**写路径一律「先落盘、成功后」**才更新进程内缓存
 * （F3：原实现是先 `colCache.set` 再落盘，落盘失败（EACCES/ENOSPC…）会让缓存脏掉，
 * 同进程后续 `colGet` 会读回「写成功」的幻影文档，而磁盘仍是旧值）。
 * @param {Map<string, any>} map 待落盘的**新**集合内容（不读 colCache）
 */
async function persistColMap(col, map) {
  if (SOURCE !== 'local') return;
  const target = assertWriteAllowed(colFilePath(col));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const obj = {};
  for (const [id, doc] of map) obj[id] = doc;
  fs.writeFileSync(target, JSON.stringify(obj, null, 2));
}

export async function colGet(col, id) {
  const map = await loadCol(col);
  return map.get(id) || null;
}

export async function colSet(col, id, doc) {
  const map = await loadCol(col);
  const { _id, ...rest } = doc;
  const value = { _id: id, ...rest };
  if (SOURCE === 'local') {
    // 先落盘、成功后才换缓存：失败时缓存保持旧值（抛错传播，绝不留幻影文档）
    const pending = new Map(map);
    pending.set(id, value);
    await persistColMap(col, pending);
    colCache.set(col, pending);
    return;
  }
  await sdkCall(() => getApp().database().collection(col).doc(id).set({ ...rest }));
  map.set(id, value);
}

export async function colDelete(col, id) {
  const map = await loadCol(col);
  if (SOURCE === 'local') {
    // 同 colSet：先落盘、成功后才换缓存
    const pending = new Map(map);
    pending.delete(id);
    await persistColMap(col, pending);
    colCache.set(col, pending);
    return;
  }
  await sdkCall(() => getApp().database().collection(col).doc(id).remove());
  map.delete(id);
}

// ---- CAS 变更原语（R2：唯一写路径；乐观锁 + 读回比对 + 有限重试） ----

/**
 * CAS 重试上限（首次写失败后**重读重放**的最大次数）。
 * 退避表 `CAS_BACKOFF_MS` 与之等长：第 k 次重试前睡 `CAS_BACKOFF_MS[k-1]` 毫秒。
 */
export const CAS_MAX_RETRIES = 5;
/** CAS 每次重试前的退避毫秒（常量化；长度 = CAS_MAX_RETRIES） */
export const CAS_BACKOFF_MS = [20, 50, 120, 300, 700];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 版本收口：非有限 / 负数 / 缺失一律当 0（`version` 为非负整数，自 1 起） */
const versionOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * 读单档的**最新**值（**绕过进程内缓存**）：CAS 的冲突判定以磁盘 / 远端为准，绝不拿缓存旧值。
 * 不存在 → `null`（调用方以 `{ _id, version: 0 }` 为起点）。
 */
async function readDocFresh(col, id) {
  if (SOURCE === 'local') {
    try {
      const raw = JSON.parse(fs.readFileSync(colFilePath(col), 'utf8'));
      return raw[id] ? JSON.parse(JSON.stringify(raw[id])) : null;
    } catch {
      return null;
    }
  }
  return sdkCall(async () => {
    const r = await getApp().database().collection(col).doc(id).get();
    const d = r?.data;
    return (Array.isArray(d) ? d[0] : d) || null;
  });
}

/**
 * local 条件写（**同步临界区**：读盘核 version → 写盘，中间无 await ⇒ 事件循环内原子，
 * 同进程并发绝不丢更新；跨进程仍为「写前再核一次」的尽力而为，本地仅单实例运行）。
 * 写后**读回比对**（读回 version 必须 == curVersion + 1）—— 不只看「写成功」。
 * @returns {object|null} 成功 = 读回文档；冲突 → null（调用方重读重放）
 */
function commitLocalCas(col, id, curVersion, next) {
  const target = colFilePath(col);
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    raw = {};
  }
  const diskVersion = raw[id] ? versionOf(raw[id].version) : 0;
  if (diskVersion !== curVersion) return null; // 冲突：调用方重读重放
  assertWriteAllowed(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  raw[id] = next;
  fs.writeFileSync(target, JSON.stringify(raw, null, 2));
  let back = null;
  try {
    back = JSON.parse(fs.readFileSync(target, 'utf8'))[id] || null;
  } catch {
    back = null;
  }
  return back && versionOf(back.version) === curVersion + 1 ? back : null;
}

/**
 * cloud 条件写：`where({ _id, version: curVersion }).update(...)`（不存在 → `add` 以 `_id` 建）。
 * ⚠️ 已知教训：`updated` 计数三义同形（同值 / 无权静默 / 不存在）⇒ **一律读回比对**，
 * 读回 version 必须 == curVersion + 1 才算成功；写调用异常也不据此判失败（以读回为准）。
 * @returns {object|null}
 */
async function commitCloudCas(col, id, curVersion, next) {
  const db = getApp().database();
  const { _id, ...rest } = next;
  try {
    if (curVersion === 0) {
      await sdkCall(() => db.collection(col).add({ _id: id, ...rest }));
    } else {
      await sdkCall(() => db.collection(col).where({ _id: id, version: curVersion }).update({ ...rest }));
    }
  } catch {
    /* 不据写调用结果判成败：一律以读回比对为准 */
  }
  const back = await readDocFresh(col, id);
  return back && versionOf(back.version) === curVersion + 1 ? back : null;
}

/**
 * CAS 变更原语（R2，唯一写路径）：**读当前档 → 纯函数 mutator → version+1 → 条件写 → 读回比对**。
 *
 * - 档不存在 ⇒ 以 `{ _id: id, version: 0 }` 为起点；写入后 `version` 自 **1** 起。
 * - `mutator(doc)` **必须是纯函数**：同输入同输出、无 IO、不读 `Date` / 随机数；需要时间 / 随机
 *   由调用方算好作参数传入 ⇒ 冲突重放（重读后再次调用）安全。返回**文档对象**（原语据其写库，
 *   并强制覆写 `_id` / `version`）。
 * - 冲突 ⇒ 重读重放，上限 `CAS_MAX_RETRIES` 次（退避 `CAS_BACKOFF_MS`）；**耗尽 ⇒ 抛明确错误**
 *   （不静默成功、不吞）。
 * @param {string} col 集合名
 * @param {string} id 文档 `_id`
 * @param {(doc:object)=>object|Promise<object>} mutator 纯变更函数
 * @returns {Promise<object>} 写入并**读回比对通过**的文档（含新 `version`）
 */
export async function mutateDoc(col, id, mutator) {
  const docId = String(id);
  for (let attempt = 0; attempt <= CAS_MAX_RETRIES; attempt += 1) {
    const cur = await readDocFresh(col, docId);
    const curVersion = cur ? versionOf(cur.version) : 0;
    const base = cur || { _id: docId, version: 0 };
    const next = await mutator(JSON.parse(JSON.stringify(base)));
    if (!next || typeof next !== 'object') {
      throw new Error(`[store] CAS 变更原语：mutator 必须返回文档对象（${col}.${docId}）`);
    }
    next._id = docId;
    next.version = curVersion + 1;
    const written =
      SOURCE === 'local'
        ? commitLocalCas(col, docId, curVersion, next)
        : await commitCloudCas(col, docId, curVersion, next);
    if (written) {
      // 成功后刷新进程内缓存（与磁盘 / 远端一致；缓存未命中则从盘读回，含本次写入）
      const map = await loadCol(col);
      map.set(docId, written);
      return written;
    }
    if (attempt < CAS_MAX_RETRIES) {
      await sleep(CAS_BACKOFF_MS[Math.min(attempt, CAS_BACKOFF_MS.length - 1)]);
    }
  }
  throw new Error(
    `[store] CAS 变更失败（${col}.${docId}）：并发冲突，重试 ${CAS_MAX_RETRIES} 次仍未成功`,
  );
}

// ---- 分页列举原语（R3：改 per-主体后「全体」= 枚举，云端单次 get() 有上限须分页） ----

/**
 * 分页列举集合文档。
 * - local：遍历 JSON 映射（`Map` 值序 = 落盘键序）
 * - cloud：`orderBy('_id').skip(cursor).limit(limit).get()`（**必须分页拉全量**，单次 get() 有上限）
 * @param {string} col 集合名
 * @param {{limit?:number, cursor?:number}} [opts] `limit` 每页条数（缺省 100）；`cursor` 起始偏移（缺省 0）
 * @returns {Promise<{items:object[], next_cursor:number|null}>} `next_cursor=null` ⇒ 已到末页
 */
export async function list(col, { limit = 100, cursor = 0 } = {}) {
  const take = Math.max(1, Math.floor(Number(limit)) || 100);
  const skip = Math.max(0, Math.floor(Number(cursor)) || 0);
  if (SOURCE === 'local') {
    const map = await loadCol(col);
    const all = [...map.values()];
    const items = all.slice(skip, skip + take);
    return { items, next_cursor: skip + items.length < all.length ? skip + items.length : null };
  }
  const r = await sdkCall(() =>
    getApp().database().collection(col).orderBy('_id', 'asc').skip(skip).limit(take).get(),
  );
  const items = r?.data || [];
  return { items, next_cursor: items.length === take ? skip + take : null };
}

/**
 * 列举集合**全量**文档（逐页拉齐；`max` 为兜底上限，防异常分页无限循环）。
 * @returns {Promise<object[]>}
 */
export async function listAll(col, { limit = 100, max = 100000 } = {}) {
  const out = [];
  let cursor = 0;
  for (;;) {
    const { items, next_cursor } = await list(col, { limit, cursor });
    out.push(...items);
    if (next_cursor === null || out.length >= max) break;
    cursor = next_cursor;
  }
  return out;
}

/**
 * 原子递增集合文档的数值字段（计数器用；docs/id-system.spec.md §3）。
 * - 云端：`db.collection.doc.update({ [field]: _.inc(delta) })` 原子自增 → 读回新值 → 返回**递增前**的值
 *   （sdkCall 互斥队列保证 inc+read 之间不被本进程其它调用插入；跨实例并发靠 inc 原子性绝不重号）
 * - 本地：读-改-写（调用方持有写锁，见 id-seq.reserveIds）
 * 文档不存在 → 以 delta 为初值创建，返回 0。
 * @returns {Promise<number>} 递增前的值（新分配的号 = 返回值 + 1 … 返回值 + delta）
 */
export async function colAtomicNext(col, id, delta = 1, field = 'next') {
  const step = Math.max(1, Math.floor(Number(delta) || 1));
  const map = await loadCol(col);
  if (SOURCE === 'local') {
    const cur = Number(map.get(id)?.[field]);
    const prev = Number.isFinite(cur) && cur > 0 ? cur : 0;
    // 同 colSet：先落盘、成功后才换缓存（失败时缓存保持旧值，绝不留幻影计数）
    const pending = new Map(map);
    pending.set(id, { _id: id, [field]: prev + step });
    await persistColMap(col, pending);
    colCache.set(col, pending);
    return prev;
  }
  return sdkCall(async () => {
    const db = getApp().database();
    const existing = map.get(id);
    if (!existing) {
      // 先写库、成功后才写缓存（SDK 失败不得污染进程内计数视图）
      await db.collection(col).doc(id).set({ [field]: step });
      map.set(id, { _id: id, [field]: step });
      return 0;
    }
    try {
      await db.collection(col).doc(id).update({ [field]: db.command.inc(step) });
    } catch (e) {
      // SDK/服务端不支持 inc 时不静默重号：直接抛出，由调用方决策
      throw new Error(`计数器原子递增失败（${col}.${id}）: ${e?.message || e}`);
    }
    const r = await db.collection(col).doc(id).get();
    const d = r?.data;
    const doc = Array.isArray(d) ? d[0] : d;
    const value = Number(doc?.[field]);
    const prev = Number.isFinite(value) ? value - step : 0;
    map.set(id, { _id: id, [field]: Number.isFinite(value) ? value : step });
    return Math.max(0, prev);
  });
}

/**
 * 铸号（docs/id-system.spec.md §3）：返回全站唯一的人读编号。
 * 全部创建路径必须走这里，不再按「树内序号」自增。
 */
export async function nextPersonId() {
  const { nextPersonId: next } = await import('./id-seq.js');
  return next();
}

export async function nextFamilyId() {
  const { nextFamilyId: next } = await import('./id-seq.js');
  return next();
}

export async function colAll(col) {
  const map = await loadCol(col);
  return [...map.values()];
}

export async function colWhere(col, predicate) {
  const map = await loadCol(col);
  return [...map.values()].filter(predicate);
}

// ---- tree-meta ----

/**
 * meta 文件的磁盘指纹（**local 模式「外部变更检测」**的比对基准）。
 * 拿不到 stat（文件不存在 / 无权限）→ null：调用方沿用现有缓存，**绝不因此新增抛错**。
 */
function statMetaFile() {
  try {
    const st = fs.statSync(META_FILE);
    return { mtimeMs: st.mtimeMs, size: st.size, ctimeMs: st.ctimeMs };
  } catch {
    return null;
  }
}

/** 两个指纹是否同一快照；任一侧为 null（拿不到 stat）一律判「不可比」→ 由调用方决定沿用还是重读 */
function sameMetaStamp(a, b) {
  return !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size && a.ctimeMs === b.ctimeMs;
}

/**
 * 读 meta（local = 副本 / 真源文件；cloud = `jiazu_tree_meta/global` 文档）。
 *
 * ★ 为什么 local 模式要做「外部变更检测」（真实数据丢失事故的根因修复）：
 *   tree-meta 是**唯一没有乐观锁的全量落盘文件**。对比其它真源：
 *   · trees/*.json 有 `version` 乐观锁 —— 冲突**抛错**，不会静默覆盖；
 *   · collections 走「先落盘、成功后换缓存」，且写前基于磁盘读改写；
 *   · details 是一人一文件，不存在整份覆盖。
 *   只有 meta 是「进程内整份对象 → `saveMeta` 整文件覆盖」，而 `metaCache` 又是**进程级**的、
 *   原先只由 `saveMeta` 更新 ⇒ 任何长驻实例（本地 3100 服务）在外部（人 / 脚本）改过盘之后，
 *   都会用自己**过期**的内存副本整文件回写，把别人的写入静默抹掉
 *   （2026-09-20 事故：修正脚本改好的 `origin` 被「修正前就已启动」的实例整份回写抹回）。
 *   对策：每次读都先 `stat` 一次，与缓存快照比对 mtimeMs + size + ctimeMs，
 *   **任一变化即重读并刷新缓存**，把「过期内存」的窗口从「实例寿命」压到「一次 stat」。
 *   ⚠️ 旧残留窗口：`getMeta()` → `saveMeta()` 之间曾有 TOCTOU（整份读改写 = 整份覆盖）。
 *      第 4 期已消：写侧不再走「读 getMeta → saveMeta 全量」——统一经 `mutateTreeMeta` /
 *      `mutateMetaDoc`（cloud = 单档 CAS，local = 单进程临界区内**磁盘直读**再写），
 *      「读」与「写」在同一次 CAS/临界区内完成，外部写入不再被陈旧内存整份抹掉。
 *      `getMeta()` 出参形状不变（{_schema,_description,storage_files,trees} 聚合）。
 */
export async function getMeta() {
  if (SOURCE !== 'local') {
    // cloud：缓存命中即返回（绝不每调一次就远程拉取）；未命中则聚合「_meta 单档 + 每树一档」
    if (metaCache) return metaCache;
    const metaRes = await sdkCall(() => getApp().database().collection(META_COL).doc(META_DOC_ID).get());
    const md = metaRes?.data;
    const metaDoc = (Array.isArray(md) ? md[0] : md) || null;
    const treesRes = await sdkCall(() => getApp().database().collection(META_COL).limit(5000).get());
    const trees = {};
    for (const d of treesRes?.data || []) {
      if (!d || d._id === META_DOC_ID || !d.tree_id) continue; // 只认树档（_id=tree_id）
      const { _id, ...entry } = d;
      trees[d._id] = entry;
    }
    metaCache = {
      _schema: metaDoc?._schema,
      _description: metaDoc?._description,
      storage_files: metaDoc?.storage_files || {},
      trees,
    };
    return metaCache;
  }
  if (metaCache) {
    const stamp = statMetaFile();
    // 拿不到 stat（文件被删 / 无权限）→ 沿用缓存（与改动前「缓存命中直接返回」一致，不改变失败面）
    if (!stamp || sameMetaStamp(stamp, metaStamp)) return metaCache;
    // 磁盘被外部改过 → 落到下面重读（缓存已过期，绝不能继续拿它整份回写）
  }
  try {
    metaCache = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    metaStamp = statMetaFile();
  } catch (e) {
    if (metaCache) {
      // 已检测到外部变更但重读失败（写到一半 / 坏 JSON）：沿用旧缓存，**不抛新错**
      // —— 改动前「缓存命中」时根本不做 IO、也就不会抛错，这里同样不改变失败面。
      // 同时记下新指纹 → 同一次外部写入不反复重读；文件再次变化（下一次写入落定）时会再重读。
      metaStamp = statMetaFile();
      return metaCache;
    }
    // 沙箱副本还没建：只读回退到真源作基线（写仍落副本，由 saveMeta 保证）
    if (SANDBOX && !samePath(META_FILE, REAL_META_FILE) && fs.existsSync(REAL_META_FILE)) {
      metaCache = JSON.parse(fs.readFileSync(REAL_META_FILE, 'utf8'));
      metaStamp = statMetaFile(); // 副本尚不存在 → null；副本一旦出现（指纹变非 null）即触发重读
    } else {
      throw e;
    }
  }
  return metaCache;
}

// ---- tree-meta 定向写原语（第 4 期：每树一档，消 TOCTOU） ----

/**
 * `_meta` 单档：`_schema` / `_description` / `storage_files`（配置类，先例 =
 * economy-market.js 的 `OFFICIAL_ID='official'`）。云端 = `jiazu_tree_meta/_meta`；
 * local = `config/tree-meta.json` 顶层同名字段（路径与形状不变）。
 */
export const META_DOC_ID = '_meta';
const META_COL = 'jiazu_tree_meta';

/** 剥离存储元字段 `_id`（保留 `version`：每树档 `version` 非负整数自 1 起，是本期新增契约） */
function stripMetaDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const { _id, ...entry } = doc;
  return entry;
}

/**
 * 条目**内容**是否等价（忽略 `version`；键序无关）。
 * 用于「无净变化 ⇒ 不写、不 bump version」的幂等判定（resetFounder 重复调用等场景；
 * 与改动前「整份写同内容 = 文件字节不变」的观感一致）。
 */
function sameEntryContent(a, b) {
  const canon = (o) => {
    if (Array.isArray(o)) return `[${o.map(canon).join(',')}]`;
    if (o && typeof o === 'object') {
      return `{${Object.keys(o)
        .filter((k) => k !== 'version')
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
        .join(',')}}`;
    }
    return JSON.stringify(o ?? null);
  };
  return canon(a) === canon(b);
}

/** 单进程内 meta 写临界区（串行化全部 meta 写：mutateTreeMeta / mutateMetaDoc / saveMeta 兼容路径） */
let metaWriteLock = Promise.resolve();
function withMetaWriteLock(fn) {
  const run = metaWriteLock.then(() => fn());
  metaWriteLock = run.catch(() => {});
  return run;
}

/** local：磁盘直读 meta（写路径用 —— 绝不拿进程内缓存整份回写）；文件不存在时才回退基线 */
function readMetaForWrite() {
  if (fs.existsSync(META_FILE)) return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  if (metaCache) return JSON.parse(JSON.stringify(metaCache));
  if (SANDBOX && !samePath(META_FILE, REAL_META_FILE) && fs.existsSync(REAL_META_FILE)) {
    return JSON.parse(fs.readFileSync(REAL_META_FILE, 'utf8'));
  }
  return { trees: {} };
}

/** local：写 meta 文件（沙箱护栏 + 落盘后刷新缓存指纹） */
function writeMetaFile(obj) {
  const target = assertWriteAllowed(META_FILE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(obj, null, 2) + '\n');
  metaCache = obj;
  metaStamp = statMetaFile();
}

/** local：按 tree_id 解析条目键（键通常 === tree_id，保留 keyOf 同口径的兼容查找） */
function metaKeyOf(raw, treeId) {
  const trees = raw?.trees || {};
  return Object.keys(trees).find((k) => trees[k] && String(trees[k].tree_id) === String(treeId)) || null;
}

/**
 * 定向写**单棵树的 meta 条目**（唯一写路径，R2 口径与 `economy-spirit.withSpirit` 同）：
 * - cloud：经 `mutateDoc` 对该树档（`_id = treeId`）走 CAS（条件写 + 读回比对 + 重读重放）；
 * - local：在单进程临界区内**磁盘直读** meta → 对 `trees[treeId]` 应用**纯函数** mutator → 写文件
 *   → 读回校验 `version == cur+1`（临界区内无 await 于读改写之间 ⇒ 同进程并发绝不丢更新）。
 * - mutator 收到 = 该树条目**本身**（不含 `_id`），返回新的条目对象（缺 `tree_id` 自动补 id）；
 *   返回 `null`/`undefined` ⇒ 拒绝（删除请用 `removeTreeMeta`）。
 * - 写入后条目 `version` = 旧值 + 1（不存在 ⇒ 1）；业务字段一律不改名 / 不改值。
 * @param {string} treeId
 * @param {(entry:object)=>object|Promise<object>} mutator 纯函数
 * @returns {Promise<object>} 写入并读回通过的新条目（含新 `version`）
 */
export async function mutateTreeMeta(treeId, mutator) {
  const id = String(treeId || '');
  if (!id) throw new Error('[store] mutateTreeMeta：缺少 tree_id');
  if (SOURCE !== 'local') {
    const cur = await readDocFresh(META_COL, id);
    const curEntry = cur ? stripMetaDoc(cur) : null;
    if (curEntry) {
      const probe = await mutator({ ...curEntry });
      if (probe && typeof probe === 'object' && sameEntryContent(probe, curEntry)) {
        if (metaCache) metaCache.trees = { ...(metaCache.trees || {}), [id]: curEntry };
        return curEntry; // 无净变化 ⇒ 不写、不 bump version（幂等）
      }
    }
    const written = await mutateDoc(META_COL, id, async (doc) => {
      const entry = stripMetaDoc(doc) || { tree_id: id };
      const next = await mutator(entry);
      if (!next || typeof next !== 'object') {
        throw new Error(`[store] mutateTreeMeta：mutator 必须返回条目对象（${id}）`);
      }
      return next;
    });
    if (metaCache) metaCache.trees = { ...(metaCache.trees || {}), [id]: stripMetaDoc(written) };
    return stripMetaDoc(written);
  }
  return withMetaWriteLock(async () => {
    const raw = readMetaForWrite();
    const trees = { ...(raw.trees || {}) };
    const key = metaKeyOf(raw, id) || id;
    const cur = trees[key];
    const curVersion = cur ? versionOf(cur.version) : 0;
    const base = cur ? { ...cur } : { tree_id: id };
    const next = await mutator(base);
    if (!next || typeof next !== 'object') {
      throw new Error(`[store] mutateTreeMeta：mutator 必须返回条目对象（${id}）`);
    }
    if (cur && sameEntryContent(next, cur)) return cur; // 无净变化 ⇒ 不写、不 bump version（幂等）
    if (!next.tree_id) next.tree_id = id;
    next.version = curVersion + 1;
    trees[key] = next;
    const out = { ...raw, trees };
    writeMetaFile(out);
    // 读回比对（只看「写成功」不够：磁盘 version 必须 == cur+1）
    const back = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    if (versionOf(back?.trees?.[key]?.version) !== curVersion + 1) {
      throw new Error(`[store] mutateTreeMeta 回读校验失败（${id}）`);
    }
    return next;
  });
}

/**
 * 定向**删除**单棵树的 meta 条目（与 `mutateTreeMeta` 对称；`mutateDoc` 只写不删）。
 * 幂等：条目不存在 ⇒ 零变更，不抛错。
 */
export async function removeTreeMeta(treeId) {
  const id = String(treeId || '');
  if (!id) return;
  if (SOURCE !== 'local') {
    await colDelete(META_COL, id);
    if (metaCache?.trees) {
      const next = { ...metaCache.trees };
      const key = metaKeyOf(metaCache, id);
      if (key) delete next[key];
      metaCache.trees = next;
    }
    return;
  }
  return withMetaWriteLock(async () => {
    const raw = readMetaForWrite();
    const key = metaKeyOf(raw, id);
    if (!key) return;
    const trees = { ...(raw.trees || {}) };
    delete trees[key];
    writeMetaFile({ ...raw, trees });
  });
}

/**
 * 定向写 **`_meta` 单档**（`_schema` / `_description` / `storage_files`）：
 * - cloud：对 `_id='_meta'` 档走 `mutateDoc` CAS；
 * - local：临界区内改 `config/tree-meta.json` 顶层字段（形状不变）。
 * mutator 收到 = `{ _schema, _description, storage_files }`，返回同形对象（未给 `storage_files` 则保持原值）。
 */
export async function mutateMetaDoc(mutator) {
  if (SOURCE !== 'local') {
    const written = await mutateDoc(META_COL, META_DOC_ID, async (doc) => {
      const cfg = { _schema: doc?._schema, _description: doc?._description, storage_files: doc?.storage_files };
      const next = await mutator(cfg);
      if (!next || typeof next !== 'object') {
        throw new Error('[store] mutateMetaDoc：mutator 必须返回配置对象');
      }
      return {
        _schema: next._schema,
        _description: next._description,
        storage_files: next.storage_files || {},
      };
    });
    if (metaCache) {
      metaCache._schema = written._schema;
      metaCache._description = written._description;
      metaCache.storage_files = written.storage_files || {};
    }
    return written;
  }
  return withMetaWriteLock(async () => {
    const raw = readMetaForWrite();
    const cfg = { _schema: raw._schema, _description: raw._description, storage_files: raw.storage_files };
    const next = await mutator(cfg);
    if (!next || typeof next !== 'object') {
      throw new Error('[store] mutateMetaDoc：mutator 必须返回配置对象');
    }
    const out = { ...raw, _schema: next._schema, _description: next._description };
    if (next.storage_files !== undefined) out.storage_files = next.storage_files;
    writeMetaFile(out);
    return next;
  });
}

/**
 * 兼容写路径（**已不被任何生产调用方使用**；17 处调用点全部改为 `mutateTreeMeta` /
 * `mutateMetaDoc` / `removeTreeMeta`）。保留仅为测试与外部脚本的沙箱护栏回归。
 * - local：写 `config/tree-meta.json`（或副本）本身 —— 本地存储本就是一个整文件；
 * - cloud：**逐档写入** `_meta` + 每棵树档（`doc(id).set`），**绝不**再写单档 `global`。
 */
export async function saveMeta(meta) {
  if (SOURCE === 'local') {
    const target = assertWriteAllowed(META_FILE);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(meta, null, 2) + '\n');
    // 先落盘、成功后才更新缓存（失败时 metaCache 保持旧值，不留幻影 meta）；
    // 指纹一并对齐 —— 否则下一次 getMeta 会把自己刚写的文件误判成「外部变更」而多读一次
    metaCache = meta;
    metaStamp = statMetaFile();
    return;
  }
  const { _schema, _description, storage_files, trees } = meta || {};
  await sdkCall(() =>
    getApp()
      .database()
      .collection(META_COL)
      .doc(META_DOC_ID)
      .set({ _schema, _description, storage_files: storage_files || {} }),
  );
  for (const [key, entry] of Object.entries(trees || {})) {
    const id = String(entry?.tree_id || key);
    const { _id, ...body } = entry || {};
    await sdkCall(() => getApp().database().collection(META_COL).doc(id).set(body));
  }
  metaCache = meta;
}

// ---- 树 JSON（结构真源） ----

export async function getTree(treeId) {
  if (treeCache.has(treeId)) return treeCache.get(treeId);
  let tree = null;
  if (SOURCE === 'local') {
    const p = path.join(OUT, 'trees', `${treeId}.json`);
    if (fs.existsSync(p)) tree = JSON.parse(fs.readFileSync(p, 'utf8'));
  } else {
    const meta = await getMeta();
    const fileId = meta?.storage_files?.[treeId];
    if (fileId) {
      const r = await sdkCall(() => getApp().downloadFile({ fileID: fileId }));
      tree = JSON.parse(Buffer.from(r.fileContent).toString('utf8'));
    }
  }
  if (tree) treeCache.set(treeId, tree);
  return tree;
}

/** 保存树 JSON（version 乐观锁：写前比对，冲突抛错） */
export async function saveTree(tree, expectedVersion) {
  if (expectedVersion !== undefined && tree.version !== expectedVersion) {
    throw new Error('并发冲突：树已被其他操作修改，请刷新后重试');
  }
  // 落盘失败要「不留幻影」：记住自增前的版本与时间戳，失败时**原地还原**（磁盘才是真值），
  // 并失效进程内缓存 —— 否则同进程后续 getTree 会读到盘上不存在的幻影结构（真实缺陷 B：
  // chmod 0444 后一次改名被拒、磁盘未变，但同进程读接口已显示新名）。
  const prevVersion = tree.version;
  const prevUpdatedAt = tree.updated_at;
  tree.version = (tree.version || 1) + 1;
  tree.updated_at = new Date().toISOString();
  try {
    if (SOURCE === 'local') {
      const p = assertWriteAllowed(path.join(OUT, 'trees', `${tree.tree_id}.json`));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(tree, null, 2));
    } else {
      const meta = await getMeta();
      const fileId = meta?.storage_files?.[tree.tree_id];
      if (!fileId) throw new Error(`storage_files 缺少 ${tree.tree_id}`);
      await sdkCall(() => getApp().uploadFile({ cloudPath: `trees/${tree.tree_id}.json`, fileContent: Buffer.from(JSON.stringify(tree)) }));
    }
  } catch (e) {
    // 先还原版本号 / 时间戳（调用方可能还持有这棵树对象），再失效缓存
    tree.version = prevVersion;
    tree.updated_at = prevUpdatedAt;
    treeCache.delete(tree.tree_id);
    eventIndexCache.delete(tree.tree_id);
    throw e;
  }
  treeCache.set(tree.tree_id, tree);
  eventIndexCache.delete(tree.tree_id); // 树变更 → 事件索引失效
  return tree;
}

/**
 * 新建树 JSON（首写入）：local 直接落文件；cloud 先上传云存储拿 fileID 并写入 tree-meta.storage_files，
 * 之后 saveTree 才能按 fileID 覆盖（saveTree 依赖 storage_files 已有该树）。
 */
export async function createTreeFile(tree) {
  if (SOURCE === 'local') {
    const p = assertWriteAllowed(path.join(OUT, 'trees', `${tree.tree_id}.json`));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(tree, null, 2));
  } else {
    const r = await sdkCall(() =>
      getApp().uploadFile({ cloudPath: `trees/${tree.tree_id}.json`, fileContent: Buffer.from(JSON.stringify(tree)) }),
    );
    if (!r?.fileID) throw new Error('云存储上传未返回 fileID');
    // 定向写 `_meta` 单档的 storage_files（不再整份 saveMeta）
    await mutateMetaDoc((cfg) => ({
      ...cfg,
      storage_files: { ...(cfg.storage_files || {}), [tree.tree_id]: r.fileID },
    }));
  }
  treeCache.set(tree.tree_id, tree);
  return tree;
}

/**
 * 删除树 JSON（与 `createTreeFile` / `saveTree` 对称的删除路径）：
 * - local：删 `trees/<tree_id>.json` 文件
 * - cloud：删云存储文件（fileID 取自 tree-meta.storage_files）并移除该 storage_files 条目
 * 写序：**先落盘（删除）成功、再更新进程内缓存 / 写 meta**（与 colSet / saveTree 同口径）；
 * 缓存未命中视为已删（幂等，不抛错）。
 * 注：tree-meta 的 `trees[tree_id]` 条目由调用方按业务语义另行 `saveMeta` 处理（本函数不越权改注册表）。
 */
export async function deleteTree(treeId) {
  const id = String(treeId || '');
  if (!id) return;
  if (SOURCE === 'local') {
    const p = assertWriteAllowed(path.join(OUT, 'trees', `${id}.json`));
    if (fs.existsSync(p)) fs.unlinkSync(p); // 先删除落盘成功 …
    treeCache.delete(id); // … 再失效缓存
    eventIndexCache.delete(id);
    return;
  }
  const meta = await getMeta();
  const fileId = meta?.storage_files?.[id];
  if (fileId) {
    await sdkCall(() => getApp().deleteFile({ fileID: fileId }));
    // 先删云文件成功，再由定向写从 `_meta` 档摘掉 storage_files 条目（不再整份 saveMeta）
    await mutateMetaDoc((cfg) => {
      const sf = { ...(cfg.storage_files || {}) };
      delete sf[id];
      return { ...cfg, storage_files: sf };
    });
  }
  treeCache.delete(id);
  eventIndexCache.delete(id);
}

/**
 * 全部家族树 tree_id（始祖挂载等需要遍历所有树的读侧推导用）：
 * tree-meta 注册 + 云存储登记文件 +（local 模式）trees 目录实际文件
 */
export async function listTreeIds() {
  const ids = new Set();
  try {
    const meta = await getMeta();
    for (const t of Object.values(meta?.trees || {})) if (t?.tree_id) ids.add(t.tree_id);
    for (const k of Object.keys(meta?.storage_files || {})) if (k) ids.add(k);
  } catch {
    /* meta 不可用 → 退回目录枚举 */
  }
  if (SOURCE === 'local') {
    try {
      for (const f of fs.readdirSync(path.join(OUT, 'trees'))) {
        if (f.endsWith('.json')) ids.add(f.slice(0, -'.json'.length));
      }
    } catch {
      /* 目录不存在 → 忽略 */
    }
  }
  return [...ids];
}

/** 树写入辅助：读树 → 修改 → 保存（串行化同一棵树的写，防并发覆盖） */
const treeWriteLocks = new Map();
export async function updateTree(treeId, fn) {
  const lock = treeWriteLocks.get(treeId) || Promise.resolve();
  const run = lock.then(async () => {
    const tree = await getTree(treeId);
    let result;
    try {
      result = await fn(tree);
      await saveTree(tree, tree.version);
    } catch (e) {
      // 失败（落库失败 / 业务校验在闭包内抛错）一律**失效进程内缓存**：闭包是就地改对象，
      // 磁盘没写、内存已改 —— 不失效就会留下「盘上没有、缓存里有」的幻影结构（缺陷 B）。
      // 失效后任何调用方的下一次 getTree 都从磁盘读真值（与 updateTrees 的失败处理同一口径）。
      treeCache.delete(treeId);
      eventIndexCache.delete(treeId);
      throw e;
    }
    return result;
  });
  treeWriteLocks.set(treeId, run.catch(() => {}));
  return run;
}

/**
 * 跨树事务写入（嫁娶/婚姻结束这类需要同时改两棵树的操作）：
 * ① 按 id 顺序加锁 → ② 取两侧树 + 深拷贝快照 → ③ 在内存里整体应用 fn({treeId: tree})
 * → ④ 顺序持久化；中途失败 → 已落盘的一侧写回快照、**未落盘的一侧失效进程内缓存**
 * （两者都不留「盘上没有、缓存里有」的幻影结构；local：文件写，回滚可靠）。
 * ⚠️ cloud 模式是两次上传，极端情况下仍可能一侧写入失败 —— 用 reconcile 补一致性。
 *
 * @param {string[]} treeIds
 * @param {(trees: Record<string, any>) => any} fn
 */
export async function updateTrees(treeIds, fn) {
  const ids = [...new Set(treeIds.filter(Boolean))];
  const locks = ids.map((id) => treeWriteLocks.get(id) || Promise.resolve());
  const run = Promise.all(locks).then(async () => {
    const trees = {};
    const snapshots = {};
    for (const id of ids) {
      trees[id] = await getTree(id);
      snapshots[id] = JSON.parse(JSON.stringify(trees[id]));
    }
    const result = await fn(trees);
    const written = [];
    try {
      for (const id of ids) {
        await saveTree(trees[id], snapshots[id].version);
        written.push(id);
      }
    } catch (e) {
      // 失败回滚：**对全部 ids 复原**，不只复原已落盘的一侧。
      // - 已落盘（written）：写回快照（版本号对齐当前值以通过乐观锁）；
      // - 未落盘：fn 已**就地改脏**进程内缓存对象（磁盘仍是旧内容）→ 失效缓存，
      //   否则同进程后续 getTree 会读到盘上不存在的「幻影结构」（婚姻 / 跨树加子女 /
      //   立支 / 汇宗等所有跨树事务共用本函数）。
      for (const id of ids) {
        if (written.includes(id)) {
          try {
            const snap = snapshots[id];
            const cur = await getTree(id);
            snap.version = cur?.version ?? snap.version; // 用当前版本通过乐观锁校验
            await saveTree(snap, snap.version);
          } catch {
            /* best-effort 回滚 */
          }
        } else {
          treeCache.delete(id); // 先失效缓存…
          eventIndexCache.delete(id); // …事件索引同步失效（与 deleteTree / saveTree 同口径）
        }
      }
      throw e;
    }
    return result;
  });
  for (const id of ids) treeWriteLocks.set(id, run.catch(() => {}));
  return run;
}

// ---- 人物详情（档案真源） ----

export async function getDetail(treeId, handle) {
  if (SOURCE === 'local') {
    const p = path.join(OUT, 'details', `${treeId}:${handle}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  const r = await sdkCall(() => getApp().database().collection('jiazu_person_details').doc(`${treeId}:${handle}`).get());
  const d = r?.data;
  return (Array.isArray(d) ? d[0] : d) || null;
}

export async function saveDetail(detail) {
  // _id 未显式提供时由 tree_id + handle 推导（createPerson/promote 等内部构造场景）
  const id = detail._id || `${detail.tree_id}:${detail.handle}`;
  const { _id, ...data } = detail;
  if (SOURCE === 'local') {
    const p = assertWriteAllowed(path.join(OUT, 'details', `${id}.json`));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(detail, null, 2));
    return;
  }
  await sdkCall(() => getApp().database().collection('jiazu_person_details').doc(id).set(data));
}

export async function deleteDetail(treeId, handle) {
  const id = `${treeId}:${handle}`;
  if (SOURCE === 'local') {
    const p = path.join(OUT, 'details', `${id}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  await sdkCall(() => getApp().database().collection('jiazu_person_details').doc(id).remove());
}

export async function getAllDetails(treeId) {
  if (SOURCE === 'local') {
    const out = [];
    for (const f of fs.readdirSync(path.join(OUT, 'details'))) {
      if (f.startsWith(`${treeId}:`) && f.endsWith('.json')) {
        out.push(JSON.parse(fs.readFileSync(path.join(OUT, 'details', f), 'utf8')));
      }
    }
    return out;
  }
  const r = await sdkCall(() => getApp().database().collection('jiazu_person_details').where({ tree_id: treeId }).limit(2000).get());
  return r?.data || [];
}

/** event handle → 事件对象 索引（lazy 构建 + 缓存） */
export async function getEventIndex(treeId) {
  if (eventIndexCache.has(treeId)) return eventIndexCache.get(treeId);
  const index = new Map();
  const details = await getAllDetails(treeId);
  for (const d of details) {
    for (const e of d.events || []) {
      if (e.handle) index.set(e.handle, e);
    }
  }
  eventIndexCache.set(treeId, index);
  return index;
}

export { getApp };
