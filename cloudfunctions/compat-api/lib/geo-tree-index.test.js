/**
 * 按地区筛选聚合口 `lib/geo-tree-index.js` + `GET /geo/tree-index` 接线单测
 *
 * 契约 = `/geo/tree-index` 逐字口径（见 lib/geo-tree-index.js 文件头）：每树 `origin_codes` + `residence_codes`，
 * 24h 进程内缓存、并发单飞、清单失败降级（无负缓存）、单树失败只降该树、零写入。
 *
 * 覆盖：
 *   T1 基本出参形状与键集（不多不少；trees 键升序；无 failed 键）
 *   T2 origin_code 三态（有码 / 无码 / 非法码）+ 空白码
 *   T3 residence_places 多项去重 + 多人合并 + 坏形状（非数组 / 项非对象 / 空码 / 非 6 位）不崩
 *   T4 单树读抛错 ⇒ 进 failed、其余树照常、数组形态 = 树 id 字符串
 *   T5 getTree 返回 null ⇒ 跳过且不进 failed
 *   T6 listTreeIds 抛错（已有成功值）⇒ 返回上次成功值、不刷新成功时刻、不设负缓存
 *   T7 无上次值时 listTreeIds 抛错 ⇒ {v:1,generated_at:null,trees:{}}，且恒 resolve（200 语义）
 *   T8 TTL 内不重扫（getTree 计数不变）+ 并发单飞
 *   T9 getMeta 抛错 ⇒ 仅发源地一源为 []，居住地照常，不整体失败
 *   T10 路由 GET /geo/tree-index：200 + 三键 + 无需鉴权 / 无需 X-Tree-Id + 与 lib 层同源
 *   Z1 真源零写入（config/tree-meta.json md5 逐字节未变）
 *
 * 数据安全：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-tree-index.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiapu-geo-tree-index-'));
const META_FILE = path.join(TMP, 'tree-meta.json');

// ---- 沙箱：读写一律落 /tmp 副本（必须在导入 store / index 之前设好）----
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = META_FILE;

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const REAL_META_MD5 = md5(REAL_META);

// ---- 夹具：三棵树（ta / tb / tc）+ tree-meta 四登记项（含一个只有登记、没有树的 tmeta_only）----
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
const writeTree = (id, tree) =>
  fs.writeFileSync(path.join(TMP, 'trees', `${id}.json`), JSON.stringify({ tree_id: id, version: 1, ...tree }, null, 2));

writeTree('ta', {
  people: {
    // 多项 + 重复 + 空码 + 未登记码
    a1: {
      handle: 'a1',
      residence_places: [{ origin_code: '371300' }, { origin_code: '110101' }, { origin_code: '371300' }],
    },
    // 空码 / 未登记码一律丢弃
    a2: { handle: 'a2', residence_places: [{ origin_code: '' }, { origin_code: '999998' }] },
    // 居住地非数组 ⇒ 该人不计、不抛
    a3: { handle: 'a3', residence_places: { origin_code: '370000' } },
    // 前后空白 ⇒ trim 合法 + 与 a1/a2 已有码去重
    a4: { handle: 'a4', residence_places: [{ origin_code: ' 371325 ' }] },
    // 坏形状项：null / 字符串 / 非 6 位 / 缺 origin_code ⇒ 全部跳过
    a5: { handle: 'a5', residence_places: [null, 'x', { origin_code: '37132' }, {}] },
    // 两字段全缺
    a6: { handle: 'a6' },
  },
});

writeTree('tb', {
  people: {
    b1: { handle: 'b1', residence_places: [{ origin_code: '230305' }] },
  },
});

writeTree('tc', {
  people: {
    c1: { handle: 'c1', residence_places: [{ origin_code: '130302' }] },
    c2: { handle: 'c2', residence_places: [{ origin_code: '130302' }, { origin_code: '231281' }] },
  },
});

fs.writeFileSync(
  META_FILE,
  JSON.stringify(
    {
      _schema: '1.1',
      trees: {
        ta: { tree_id: 'ta', kind: 'family', origin: '山东省临沂市费县', origin_code: '371325' },
        tb: { tree_id: 'tb', kind: 'family', origin: '旧自由文本', origin_code: '' }, // 空码 ⇒ []
        tc: { tree_id: 'tc', kind: 'family', origin_code: '999998' }, // 未登记码 ⇒ []
        tmeta_only: { tree_id: 'tmeta_only', kind: 'family', origin_code: '231281' }, // 只有登记、没有树文件 ⇒ 整棵跳过
      },
    },
    null,
    2,
  ) + '\n',
);

const { createGeoTreeIndexReader, getTreeIndex, TREE_INDEX_TTL_MS, TREE_INDEX_VERSION } = await import('./geo-tree-index.js');
const { handleRequest } = await import('../index.js');

// 期望值（手算）：ta 居住地 = a1 371300/110101 + a4 371325；tb = 230305；tc = 130302/231281
const EXPECTED_TREES = {
  ta: { origin_codes: ['371325'], residence_codes: ['110101', '371300', '371325'] },
  tb: { origin_codes: [], residence_codes: ['230305'] },
  tc: { origin_codes: [], residence_codes: ['130302', '231281'] },
};

// ================= T1 基本形状 =================

test('T1 基本出参形状：顶层三键、trees 键升序、每树两键、无 failed 键', async () => {
  const r = await getTreeIndex();
  assert.deepEqual(Object.keys(r).sort(), ['generated_at', 'trees', 'v'], '顶层键集 = v / generated_at / trees（无 failed）');
  assert.equal(r.v, TREE_INDEX_VERSION);
  assert.match(r.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'generated_at = ISO 串');
  assert.deepEqual(Object.keys(r.trees), ['ta', 'tb', 'tc'], 'trees 键升序；无树文件 / 已删的 tmeta_only 不出现');
  for (const [id, node] of Object.entries(r.trees)) {
    assert.deepEqual(Object.keys(node).sort(), ['origin_codes', 'residence_codes'], `${id} 只含两键（不含出生地码 / 人数）`);
    assert.equal(Array.isArray(node.origin_codes), true);
    assert.equal(Array.isArray(node.residence_codes), true);
  }
  assert.deepEqual(r.trees, EXPECTED_TREES, '每树值与真源数据一致');
  assert.equal('failed' in r, false, '无失败树 ⇒ 不出现 failed 键');
});

// ================= T2 origin_code 三态 =================

test('T2 origin_code 三态：有码 1 项 / 无码 [] / 非法码 []（含空白与未登记码）', async () => {
  const reader = createGeoTreeIndexReader({
    listTreeIds: async () => ['good', 'empty', 'missing', 'blank', 'short', 'unregistered', 'overseas'],
    getTree: async (id) => ({ tree_id: id, people: {} }),
    getMeta: async () => ({
      trees: {
        good: { tree_id: 'good', origin_code: '231281' },
        empty: { tree_id: 'empty', origin_code: '' },
        missing: { tree_id: 'missing' },
        blank: { tree_id: 'blank', origin_code: '   ' },
        short: { tree_id: 'short', origin_code: '37132' },
        unregistered: { tree_id: 'unregistered', origin_code: '999998' },
        overseas: { tree_id: 'overseas', origin_code: '999999' }, // 「海外」是已登记哨兵码 ⇒ 合法
      },
    }),
  });
  const r = await reader.getTreeIndex();
  assert.deepEqual(r.trees.good.origin_codes, ['231281'], '合法码 ⇒ 恰好 1 项');
  assert.deepEqual(r.trees.empty.origin_codes, [], '空码 ⇒ []');
  assert.deepEqual(r.trees.missing.origin_codes, [], '缺字段 ⇒ []');
  assert.deepEqual(r.trees.blank.origin_codes, [], '全空白 ⇒ []');
  assert.deepEqual(r.trees.short.origin_codes, [], '非 6 位 ⇒ []');
  assert.deepEqual(r.trees.unregistered.origin_codes, [], '未登记码 ⇒ []（不报错、不登记异常）');
  assert.deepEqual(r.trees.overseas.origin_codes, ['999999'], '已登记哨兵码 999999 合法');
  assert.equal('failed' in r, false, '脏码不得进 failed');
});

// ================= T3 residence 去重 / 合并 / 坏形状 =================

test('T3 residence_places：多项去重 + 多人合并 + 坏形状不崩', async () => {
  const reader = createGeoTreeIndexReader({
    listTreeIds: async () => ['mix'],
    getTree: async () => ({
      tree_id: 'mix',
      people: {
        p1: { residence_places: [{ origin_code: '230305' }, { origin_code: '230305' }, { origin_code: '130302' }] },
        p2: { residence_places: [{ origin_code: '130302' }, { origin_code: '371325' }] },
        p3: { residence_places: 'not-an-array' },
        p4: { residence_places: [null, 42, 'x', {}, { origin_code: '' }, { origin_code: '3713' }] },
        p5: {},
        p6: null,
      },
    }),
    getMeta: async () => ({ trees: {} }),
  });
  const r = await reader.getTreeIndex();
  assert.deepEqual(r.trees.mix.residence_codes, ['130302', '230305', '371325'], '全员合并 + 去重 + 升序');
  assert.deepEqual(r.trees.mix.origin_codes, [], 'meta 无该树 ⇒ 发源地 []（不整体失败）');
  assert.equal('failed' in r, false, '坏形状不登记异常');
});

// ================= T4 单树读失败 =================

test('T4 单树读抛错 ⇒ 该树进 failed、其余树照常、failed 元素 = 树 id 字符串', async () => {
  const reader = createGeoTreeIndexReader({
    listTreeIds: async () => ['boom2', 'ok', 'boom1'],
    getTree: async (id) => {
      if (id.startsWith('boom')) throw new Error('读盘失败');
      return { tree_id: id, people: { p: { residence_places: [{ origin_code: '110101' }] } } };
    },
    getMeta: async () => ({ trees: { ok: { tree_id: 'ok', origin_code: '110000' } } }),
  });
  const r = await reader.getTreeIndex();
  assert.deepEqual(r.failed, ['boom1', 'boom2'], 'failed = 树 id 数组（升序扫描序）；每次请求都重试 ⇒ 无负缓存');
  assert.equal(r.failed.every((x) => typeof x === 'string'), true, '元素形态 = 字符串');
  assert.deepEqual(r.trees, { ok: { origin_codes: ['110000'], residence_codes: ['110101'] } }, '单树失败不整体失败，好树照常');
  assert.equal(r.failed.includes('ok'), false);
});

// ================= T5 树不存在 =================

test('T5 getTree 返回 null（不存在 / 已删）⇒ 跳过且不进 failed', async () => {
  const reader = createGeoTreeIndexReader({
    listTreeIds: async () => ['gone', 'here'],
    getTree: async (id) => (id === 'gone' ? null : { tree_id: id, people: { p: { residence_places: [{ origin_code: '230305' }] } } }),
    getMeta: async () => ({ trees: { gone: { tree_id: 'gone', origin_code: '231281' } } }),
  });
  const r = await reader.getTreeIndex();
  assert.deepEqual(Object.keys(r.trees), ['here'], 'null 树不出现在 trees');
  assert.equal('failed' in r, false, 'null 树不得进 failed（只有读抛错才算失败）');
});

// ================= T6 清单失败 + 已有成功值 =================

test('T6 listTreeIds 抛错（已有成功值）⇒ 上次成功值、generated_at 不变、不设负缓存', async () => {
  const clock = { t: 1_700_000_000_000 };
  let listBroken = false;
  let attempts = 0;
  const reader = createGeoTreeIndexReader({
    listTreeIds: async () => {
      attempts += 1;
      if (listBroken) throw new Error('清单拉取失败（注入）');
      return ['t'];
    },
    getTree: async (id) => ({ tree_id: id, people: { p: { residence_places: [{ origin_code: '230305' }] } } }),
    getMeta: async () => ({ trees: { t: { tree_id: 't', origin_code: '231281' } } }),
    now: () => clock.t,
  });

  const first = await reader.getTreeIndex();
  assert.deepEqual(first.trees, { t: { origin_codes: ['231281'], residence_codes: ['230305'] } });
  const stamp = first.generated_at;
  assert.equal(stamp, new Date(clock.t).toISOString());

  listBroken = true;
  clock.t += TREE_INDEX_TTL_MS; // 过期 ⇒ 必须重扫，重扫失败
  assert.equal(await reader.getTreeIndex(), first, '清单失败 ⇒ 返回上一次成功值（同一份对象）');
  assert.equal((await reader.getTreeIndex()).generated_at, stamp, '失败不得刷新成功时刻');
  assert.equal(attempts, 3, '失败不刷新缓存时刻 ⇒ 每次过期请求都重试（无负缓存）');

  listBroken = false; // 恢复 ⇒ 过期后重扫出新值（未被旧值锁死）
  clock.t += TREE_INDEX_TTL_MS;
  const again = await reader.getTreeIndex();
  assert.notEqual(again, first);
  assert.deepEqual(again.trees, first.trees);
  assert.equal(again.generated_at, new Date(clock.t).toISOString());
  assert.equal(attempts, 4);
});

// ================= T7 清单失败 + 无成功值 =================

test('T7 无上次值时 listTreeIds 抛错 ⇒ {v,generated_at:null,trees:{}} 且恒 resolve（200 语义）', async () => {
  const reader = createGeoTreeIndexReader({
    listTreeIds: async () => {
      throw new Error('清单拉取失败（冷启动）');
    },
    getTree: async () => null,
    getMeta: async () => ({ trees: {} }),
  });
  let r;
  await assert.doesNotReject(async () => {
    r = await reader.getTreeIndex();
  }, '绝不 reject（入口据此恒 200）');
  assert.deepEqual(r, { v: TREE_INDEX_VERSION, generated_at: null, trees: {} }, '冷启动失败 ⇒ 空表降级常量');
  // 空表不进缓存：依赖恢复后同一实例立即重扫
  const ok = createGeoTreeIndexReader({
    listTreeIds: async () => ['t'],
    getTree: async () => ({ tree_id: 't', people: {} }),
    getMeta: async () => ({ trees: {} }),
  });
  assert.notEqual(await ok.getTreeIndex().then((x) => x.generated_at), null, '成功值才有 generated_at');
});

// ================= T8 TTL + 单飞 =================

test('T8 TTL 内不重扫（getTree 计数不变）+ 并发单飞（两个请求只扫一次）', async () => {
  const calls = { ids: 0, tree: 0, meta: 0 };
  const clock = { t: 1_700_000_000_000 };
  const reader = createGeoTreeIndexReader({
    listTreeIds: async () => {
      calls.ids += 1;
      return ['t1', 't2'];
    },
    getTree: async (id) => {
      calls.tree += 1;
      return { tree_id: id, people: { p: { residence_places: [{ origin_code: '371325' }] } } };
    },
    getMeta: async () => {
      calls.meta += 1;
      return { trees: { t1: { origin_code: '371325' }, t2: { origin_code: '371300' } } };
    },
    now: () => clock.t,
  });

  const first = await reader.getTreeIndex();
  assert.deepEqual(Object.keys(first.trees), ['t1', 't2']);
  assert.equal(calls.ids, 1);
  assert.equal(calls.tree, 2, '两棵树各读一次');
  assert.equal(calls.meta, 1);

  clock.t += TREE_INDEX_TTL_MS - 1; // 边界前 1ms
  assert.equal(await reader.getTreeIndex(), first, 'TTL 内命中缓存（同一对象引用）');
  assert.equal(calls.tree, 2, 'TTL 内不得重新扫描');
  assert.equal(calls.ids, 1);

  clock.t += 1; // 恰好到 TTL ⇒ 过期
  const [a, b] = await Promise.all([reader.getTreeIndex(), reader.getTreeIndex()]);
  assert.equal(a, b, '单飞：并发请求共享同一份结果');
  assert.equal(calls.ids, 2, '并发两请求只扫一次');
  assert.equal(calls.tree, 4);
  assert.equal(calls.meta, 2);
  assert.equal(a.generated_at, new Date(clock.t).toISOString());
});

// ================= T9 meta 抛错 =================

test('T9 getMeta 抛错 ⇒ 仅发源地一源为 []，居住地照常，不整体失败', async () => {
  const reader = createGeoTreeIndexReader({
    listTreeIds: async () => ['t'],
    getTree: async () => ({ tree_id: 't', people: { p: { residence_places: [{ origin_code: '230305' }, { origin_code: '130302' }] } } }),
    getMeta: async () => {
      throw new Error('meta 不可用');
    },
  });
  const r = await reader.getTreeIndex();
  assert.deepEqual(r.trees, { t: { origin_codes: [], residence_codes: ['130302', '230305'] } }, '发源地计 0、居住地照常');
  assert.equal('failed' in r, false, 'meta 故障不登记树失败、不整体失败');
  assert.equal(typeof r.generated_at, 'string', '仍是一次成功值（有成功时刻）');
});

// ================= T10 路由 =================

test('T10 GET /geo/tree-index：200 + 三键；无需鉴权 / 无需 X-Tree-Id；与 lib 层同源', async () => {
  const res = await handleRequest({ path: '/geo/tree-index', httpMethod: 'GET', headers: {}, body: '' });
  assert.equal(res.statusCode, 200, '无鉴权头、无 X-Tree-Id 也 200');
  const body = JSON.parse(res.body);
  assert.deepEqual(Object.keys(body).sort(), ['generated_at', 'trees', 'v'], '顶层三键（无 failed 时）');
  assert.equal(body.v, TREE_INDEX_VERSION);
  assert.match(body.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(body.trees, EXPECTED_TREES, '路由值与夹具真源一致');
  assert.deepEqual(await getTreeIndex(), body, '本进程内路由与 lib 层同一份缓存');
});

// ================= Z1 零写入 =================

test('Z1 真源零写入：config/tree-meta.json md5 逐字节未变 + 夹具跑在 /tmp', () => {
  assert.equal(md5(REAL_META), REAL_META_MD5, 'config/tree-meta.json 被改动了（本批禁止任何真源写入）');
  assert.notEqual(path.resolve(TMP), path.resolve(REPO));
  assert.equal(path.resolve(TMP).startsWith(path.resolve(os.tmpdir())), true);
});
