/**
 * 地区统计共享快照单测 —— `lib/geo-stats.js`（唯一扫描器 / 唯一缓存 / 唯一单飞 / 唯一 `generated_at`）
 *   + 两条路由薄投影（`/geo/hot`、`/geo/tree-index`）的合并判据
 *
 * 本批核心判据（Kevin 拍定：地区统计只能算一遍、一个频率）：
 *   S1 默认单例：同一进程内先后调 `getGeoHot()` / `getTreeIndex()`，两次 `generated_at` **逐字相同**
 *   S2 注入共享读取器：两路共用一份快照 ⇒ `getTree` **全量扫描次数 = 1**（重复调用仍 = 1）
 *   S3 并发（冷启动 Promise.all 两路）⇒ 仍只扫一遍（单飞跨两路生效），两路同一 `generated_at`
 *   S4 两路出参**键集不变**（hot 四键 / tree-index 三键；无失败树时不出现 `failed`）
 *   S5 两路值同源（`counts/direct` 与 `trees` 出自同一趟遍历；`trees` 值/键序与老口径一致）
 *   S6 TTL 共享：过期后任一路触发重扫，另一路立即看到**同一份新快照**（时刻前进、仍只扫一遍）
 *   S7 降级共享：清单抛错 ⇒ 两路都返上一次成功值（`generated_at` 不变、不进缓存）；无上次值 ⇒ 两路各自空表形态
 *   S8 单树失败共享：`failed` 两路一致（同一数组），好树/好码照常
 *   S9 路由层：`handleRequest` 两路 200 且 `generated_at` 相同（真默认单例，无鉴权头）
 *   Z1 真源零写入（`config/tree-meta.json` md5 逐字节未变 + 夹具跑在 /tmp）
 *
 * 数据安全：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-stats.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiapu-geo-stats-'));
const META_FILE = path.join(TMP, 'tree-meta.json');

// ---- 沙箱：读写一律落 /tmp 副本（必须在导入 store / index 之前设好）----
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = META_FILE;

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const REAL_META_MD5 = md5(REAL_META);

// ---- 夹具：两棵树（ta / tb）+ tree-meta 两登记项 ----
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
const writeTree = (id, tree) =>
  fs.writeFileSync(path.join(TMP, 'trees', `${id}.json`), JSON.stringify({ tree_id: id, version: 1, ...tree }, null, 2));

// ta：出生地 371325 + 居住地 371300；tb：居住地 110101 两项（票计 2 次、树级码去重 1 项）
writeTree('ta', {
  people: {
    p1: { handle: 'p1', birth_place: { origin_code: '371325' }, residence_places: [{ origin_code: '371300' }] },
  },
});
writeTree('tb', {
  people: {
    k1: { handle: 'k1', residence_places: [{ origin_code: '110101' }, { origin_code: '110101' }] },
  },
});

fs.writeFileSync(
  META_FILE,
  JSON.stringify(
    {
      _schema: '1.1',
      trees: {
        ta: { tree_id: 'ta', kind: 'family', origin: '山东省临沂市费县', origin_code: '371325' },
        tb: { tree_id: 'tb', kind: 'family', origin_code: '371300' },
      },
    },
    null,
    2,
  ) + '\n',
);

// 手算期望（票 = ta 出生地 1 + ta 居住地 1 + tb 居住地 2 + 发源地 2 = 6 票；每票向自身及祖先码各 +1）
const EXPECTED_COUNTS = { 370000: 4, 371300: 4, 371325: 2, 110000: 2, 110100: 2, 110101: 2 };
const EXPECTED_DIRECT = { 371325: 2, 371300: 2, 110101: 2 };
const EXPECTED_TREES = {
  ta: { origin_codes: ['371325'], residence_codes: ['371300'] },
  tb: { origin_codes: ['371300'], residence_codes: ['110101'] },
};

const { createGeoStatsReader, GEO_STATS_TTL_MS, GEO_STATS_VERSION } = await import('./geo-stats.js');
const { createGeoHotReader, getGeoHot, HOT_TTL_MS, HOT_VERSION } = await import('./geo-hot.js');
const { createGeoTreeIndexReader, getTreeIndex, TREE_INDEX_TTL_MS, TREE_INDEX_VERSION } = await import('./geo-tree-index.js');
const { handleRequest } = await import('../index.js');

/** 计数依赖 + 注入时钟（`getTree` 调用次数 = 全量扫描次数判据） */
function countingDeps({ clock = { t: 1_700_000_000_000 }, ids = ['ta', 'tb'] } = {}) {
  const calls = { ids: 0, tree: 0, meta: 0 };
  const deps = {
    listTreeIds: async () => {
      calls.ids += 1;
      return ids;
    },
    getTree: async (id) => {
      calls.tree += 1;
      return { tree_id: id, people: { p: { handle: 'p', residential: null } } };
    },
    getMeta: async () => {
      calls.meta += 1;
      return { trees: {} };
    },
    now: () => clock.t,
  };
  return { calls, deps, clock };
}

// ================= S1 默认单例：两路一个 generated_at =================

test('S1 默认单例：先 /geo/hot 后 /geo/tree-index，两路 generated_at 逐字相同（同一快照）', async () => {
  const hot = await getGeoHot();
  const idx = await getTreeIndex();
  assert.equal(hot.generated_at, idx.generated_at, '两路必须共享同一个 generated_at（一趟扫描、一份缓存）');
  assert.match(hot.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'generated_at = ISO 串（非 null，说明是成功快照）');
  // 再各打一次：仍是同一快照（缓存命中 ⇒ 时刻不动）
  assert.equal((await getGeoHot()).generated_at, hot.generated_at);
  assert.equal((await getTreeIndex()).generated_at, hot.generated_at);
  assert.equal(HOT_TTL_MS, GEO_STATS_TTL_MS, '两路 TTL 同一个常量');
  assert.equal(TREE_INDEX_TTL_MS, GEO_STATS_TTL_MS);
  assert.equal(HOT_VERSION, GEO_STATS_VERSION);
  assert.equal(TREE_INDEX_VERSION, GEO_STATS_VERSION);
});

// ================= S2 全量扫描次数 = 1 =================

test('S2 注入共享读取器：两路共用快照 ⇒ getTree 全量扫描只跑一遍（重复调用仍为 1）', async () => {
  const { calls, deps } = countingDeps();
  const stats = createGeoStatsReader(deps);
  const hot = createGeoHotReader({ statsReader: stats });
  const idx = createGeoTreeIndexReader({ statsReader: stats });

  const h = await hot.getGeoHot();
  const t = await idx.getTreeIndex();
  assert.equal(calls.ids, 1, 'listTreeIds 只调 1 次');
  assert.equal(calls.tree, 2, '两棵树各读 1 次 ⇒ 全量扫描次数 = 1（不是 2 趟）');
  assert.equal(calls.meta, 1, 'getMeta 只调 1 次');
  assert.equal(h.generated_at, t.generated_at, '两路 generated_at 相同');

  // 重复（TTL 内）：两路都不重扫，且各自引用稳定（老单测的同一性判据不倒退）
  assert.equal(await hot.getGeoHot(), h, '/geo/hot 缓存命中 ⇒ 同一份出参对象');
  assert.equal(await idx.getTreeIndex(), t, '/geo/tree-index 缓存命中 ⇒ 同一份出参对象');
  assert.equal(calls.tree, 2, '重复调用不得重扫');
});

// ================= S3 并发单飞（跨两路）=================

test('S3 冷启动并发：Promise.all([getGeoHot, getTreeIndex]) 仍只扫一遍，两路同一 generated_at', async () => {
  const { calls, deps } = countingDeps();
  const stats = createGeoStatsReader(deps);
  const hot = createGeoHotReader({ statsReader: stats });
  const idx = createGeoTreeIndexReader({ statsReader: stats });

  const [h, t] = await Promise.all([hot.getGeoHot(), idx.getTreeIndex()]);
  assert.equal(calls.ids, 1, '并发两路共享同一份 refresh promise ⇒ 只扫一遍');
  assert.equal(calls.tree, 2, '全量扫描次数 = 1（两棵树，每棵一次）');
  assert.equal(calls.meta, 1);
  assert.equal(h.generated_at, t.generated_at, '并发两路仍是同一快照时刻');
});

// ================= S4 出参键集不变 =================

test('S4 两路出参键集不变：hot 四键 / tree-index 三键（无失败树时无 failed）', async () => {
  const hot = await getGeoHot();
  const idx = await getTreeIndex();
  assert.deepEqual(Object.keys(hot).sort(), ['counts', 'direct', 'generated_at', 'v'], '/geo/hot 顶层四键');
  assert.deepEqual(Object.keys(idx).sort(), ['generated_at', 'trees', 'v'], '/geo/tree-index 顶层三键');
  assert.equal('trees' in hot, false, '/geo/hot 不得多出 trees 键（共享快照在投影里被裁掉）');
  assert.equal('counts' in idx, false, '/geo/tree-index 不得多出 counts 键');
  assert.equal('direct' in idx, false, '/geo/tree-index 不得多出 direct 键');
  assert.equal('failed' in hot, false, '无失败树 ⇒ hot 不出现 failed');
  assert.equal('failed' in idx, false, '无失败树 ⇒ tree-index 不出现 failed');
});

// ================= S5 两路值同源 =================

test('S5 两路值同源：counts/direct 与 trees 出自同一趟遍历（口径逐条不变）', async () => {
  const hot = await getGeoHot();
  const idx = await getTreeIndex();
  assert.deepEqual(hot.counts, EXPECTED_COUNTS, 'counts = 前缀票（三源各计、级联、只含票数 > 0）');
  assert.deepEqual(hot.direct, EXPECTED_DIRECT, 'direct = 恰在该级的票');
  assert.deepEqual(idx.trees, EXPECTED_TREES, 'trees = 每树 origin_codes / residence_codes（去重升序）');
  assert.deepEqual(Object.keys(idx.trees), ['ta', 'tb'], 'trees 键升序');
  for (const [id, node] of Object.entries(idx.trees)) {
    assert.deepEqual(Object.keys(node).sort(), ['origin_codes', 'residence_codes'], `${id} 只含两键`);
  }
  assert.equal(Object.values(hot.counts).every((n) => n > 0), true, 'counts 只含票数 > 0 的码');
  assert.equal(Object.values(hot.direct).every((n) => n > 0), true, 'direct 只含票数 > 0 的码');
});

// ================= S6 TTL 共享 =================

test('S6 TTL 共享：过期后一路触发重扫，另一路立即看到同一份新快照（仍只扫一遍）', async () => {
  const { calls, deps, clock } = countingDeps();
  const stats = createGeoStatsReader(deps);
  const hot = createGeoHotReader({ statsReader: stats });
  const idx = createGeoTreeIndexReader({ statsReader: stats });

  const h1 = await hot.getGeoHot();
  assert.equal(calls.tree, 2);

  clock.t += GEO_STATS_TTL_MS - 1; // TTL 边界前 1ms
  assert.equal(await hot.getGeoHot(), h1, 'TTL 内命中缓存');
  assert.equal(await idx.getTreeIndex().then((r) => r.generated_at), h1.generated_at, '另一路也是同一快照');
  assert.equal(calls.tree, 2, 'TTL 内两路都不得重扫');

  clock.t += 1; // 恰好到 TTL ⇒ 过期；由 /geo/hot 触发重扫
  const h2 = await hot.getGeoHot();
  assert.notEqual(h2, h1, '过期后出新值');
  assert.equal(h2.generated_at, new Date(clock.t).toISOString());
  assert.equal(calls.tree, 4, '重扫一次（两棵树）');

  const t2 = await idx.getTreeIndex();
  assert.equal(t2.generated_at, h2.generated_at, '另一路立刻共享新快照（不需要自己再扫一遍）');
  assert.equal(calls.tree, 4, '另一路取新快照不得再触发第二次扫描');
});

// ================= S7 降级共享 =================

test('S7 降级共享：清单抛错 ⇒ 两路都返上一次成功值且 generated_at 不变（不缓存失败）', async () => {
  const clock = { t: 1_700_000_000_000 };
  let listBroken = false;
  const deps = {
    listTreeIds: async () => {
      if (listBroken) throw new Error('清单拉取失败（注入）');
      return ['ta', 'tb'];
    },
    getTree: async (id) => ({ tree_id: id, people: { p: { birth_place: { origin_code: '371325' } } } }),
    getMeta: async () => ({ trees: { ta: { tree_id: 'ta', origin_code: '371325' } } }),
    now: () => clock.t,
  };
  const stats = createGeoStatsReader(deps);
  const hot = createGeoHotReader({ statsReader: stats });
  const idx = createGeoTreeIndexReader({ statsReader: stats });

  const h1 = await hot.getGeoHot();
  const t1 = await idx.getTreeIndex();
  assert.equal(h1.generated_at, t1.generated_at);

  listBroken = true;
  clock.t += GEO_STATS_TTL_MS; // 过期 ⇒ 必须重扫，重扫失败
  assert.equal(await hot.getGeoHot(), h1, '清单失败 ⇒ hot 返上一次成功值（同一份对象）');
  assert.equal(await idx.getTreeIndex(), t1, '清单失败 ⇒ tree-index 返上一次成功值（同一份对象）');
  assert.equal((await hot.getGeoHot()).generated_at, h1.generated_at, '失败不得刷新成功时刻');
  assert.equal((await idx.getTreeIndex()).generated_at, t1.generated_at);

  listBroken = false; // 恢复 ⇒ 过期后重扫出新值（未被旧值锁死）
  clock.t += GEO_STATS_TTL_MS;
  const h2 = await hot.getGeoHot();
  assert.notEqual(h2, h1);
  assert.equal(h2.generated_at, new Date(clock.t).toISOString(), '恢复后时刻前进');
  assert.equal((await idx.getTreeIndex()).generated_at, h2.generated_at, '两路同步到新快照');
});

test('S7b 无上次值时清单抛错 ⇒ 两路各自空表形态（恒 resolve、generated_at null、不进缓存）', async () => {
  const stats = createGeoStatsReader({
    listTreeIds: async () => {
      throw new Error('清单拉取失败（冷启动）');
    },
    getTree: async () => null,
    getMeta: async () => ({ trees: {} }),
  });
  const hot = createGeoHotReader({ statsReader: stats });
  const idx = createGeoTreeIndexReader({ statsReader: stats });

  let h;
  await assert.doesNotReject(async () => {
    h = await hot.getGeoHot();
  }, 'hot 绝不 reject（入口据此恒 200）');
  let t;
  await assert.doesNotReject(async () => {
    t = await idx.getTreeIndex();
  }, 'tree-index 绝不 reject');
  assert.deepEqual(h, { v: HOT_VERSION, generated_at: null, counts: {}, direct: {} }, 'hot 冷启失败 ⇒ 空表降级常量');
  assert.deepEqual(t, { v: TREE_INDEX_VERSION, generated_at: null, trees: {} }, 'tree-index 冷启失败 ⇒ 空表降级常量');
});

// ================= S8 单树失败共享 =================

test('S8 单树失败共享：failed 两路一致（同一数组），好树照算、null 树静默跳过', async () => {
  const stats = createGeoStatsReader({
    listTreeIds: async () => ['ok', 'boom1', 'gone', 'boom2'],
    getTree: async (id) => {
      if (id.startsWith('boom')) throw new Error('读盘失败');
      if (id === 'gone') return null; // 不存在 / 已删 ⇒ 跳过，不进 failed
      return { tree_id: 'ok', people: { p: { handle: 'p', birth_place: { origin_code: '110101' }, residence_places: [{ origin_code: '230305' }] } } };
    },
    getMeta: async () => ({ trees: { ok: { tree_id: 'ok', origin_code: '231281' }, gone: { tree_id: 'gone', origin_code: '231281' } } }),
  });
  const hot = createGeoHotReader({ statsReader: stats });
  const idx = createGeoTreeIndexReader({ statsReader: stats });

  const h = await hot.getGeoHot();
  const t = await idx.getTreeIndex();
  assert.deepEqual(h.failed, ['boom1', 'boom2'], 'hot failed = 树 id 数组（升序），null 树不进');
  assert.equal(t.failed, h.failed, '两路 failed 必须是同一份（同一快照裁出）');
  // 手算：出生地 110101 ⇒ 110000/110100/110101 各 1；居住地 230305 ⇒ 230000/230300/230305 各 1；
  // 发源地两登记项（ok + gone，meta 逐项计票，与树是否存在无关）各 231281 ⇒ 231281/231200/230000 各 +2
  assert.deepEqual(
    h.counts,
    { 110000: 1, 110100: 1, 110101: 1, 230000: 3, 230300: 1, 230305: 1, 231200: 2, 231281: 2 },
    '好树与发源地照算',
  );
  assert.deepEqual(t.trees, { ok: { origin_codes: ['231281'], residence_codes: ['230305'] } }, '单树失败不整体失败');
  assert.equal(h.generated_at, t.generated_at, '有失败树时两路仍是同一快照时刻');
});

// ================= S9 路由层 =================

test('S9 路由：两路 200 + generated_at 相同（默认单例共享快照；无需鉴权 / 无需 X-Tree-Id）', async () => {
  const hotRes = await handleRequest({ path: '/geo/hot', httpMethod: 'GET', headers: {}, body: '' });
  const idxRes = await handleRequest({ path: '/geo/tree-index', httpMethod: 'GET', headers: {}, body: '' });
  assert.equal(hotRes.statusCode, 200);
  assert.equal(idxRes.statusCode, 200);
  const hotBody = JSON.parse(hotRes.body);
  const idxBody = JSON.parse(idxRes.body);
  assert.deepEqual(Object.keys(hotBody).sort(), ['counts', 'direct', 'generated_at', 'v']);
  assert.deepEqual(Object.keys(idxBody).sort(), ['generated_at', 'trees', 'v']);
  assert.equal(hotBody.generated_at, idxBody.generated_at, '两条路由必须给出同一个 generated_at');
  assert.deepEqual(hotBody.counts, EXPECTED_COUNTS);
  assert.deepEqual(idxBody.trees, EXPECTED_TREES);
});

// ================= Z1 真源零写入 =================

test('Z1 真源零写入：config/tree-meta.json md5 逐字节未变 + 夹具跑在 /tmp', () => {
  assert.equal(md5(REAL_META), REAL_META_MD5, 'config/tree-meta.json 被改动了（本批禁止任何真源写入）');
  assert.notEqual(path.resolve(TMP), path.resolve(REPO));
  assert.equal(path.resolve(TMP).startsWith(path.resolve(os.tmpdir())), true);
});
