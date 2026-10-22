/**
 * `GET /tree/rank-index`（首页家族列表排序聚合口）单测 —— `lib/tree-rank-index.js`
 *
 * 契约（Kevin：首页排序数据不必实时更新，与地区数据同频次）：
 *   ① 出参形状：`{ v, generated_at, trees: { <tree_id>: {…} }[, failed] }`，每树字段与 `/tree/rank` 同集；
 *      **不含 `access`**（排序不需要权限档）
 *   ② 快照命中：同一进程连续两次请求 ⇒ 全量扫描**只发生一次**（计数器取证），两次 `generated_at` 逐字相同
 *   ③ TTL 过期后重扫：注入时钟前进 24h+ ⇒ 第二次扫描发生、`generated_at` 前进
 *   ④ 失败隔离：单树读失败 ⇒ 只进 `failed`，其它树照常；清单失败 ⇒ 返上一次成功值 / 空快照，
 *      且**不设负缓存**（下一次请求立即重试）；meta / details / activity 不可用 ⇒ 只降该项
 *   ⑤ 口径一致：同一棵树 `/tree/rank` 与 `/tree/rank-index` **逐字段逐值相等**（防口径分叉）
 *   ⑥ 路由层：无鉴权头 / 无 X-Tree-Id 即 200；非 GET 不落本口（不返回快照）
 *
 * 数据安全：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/tree-rank-index.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiapu-tree-rank-index-'));
const META_FILE = path.join(TMP, 'tree-meta.json');

// ---- 沙箱：必须在导入 store / index 之前设好 ----
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = META_FILE;

for (const d of ['trees', 'details', 'collections']) fs.mkdirSync(path.join(TMP, d), { recursive: true });

const { createTreeRankIndexReader, TREE_RANK_INDEX_TTL_MS, TREE_RANK_INDEX_VERSION } = await import('./tree-rank-index.js');
const { GEO_STATS_TTL_MS } = await import('./geo-stats.js');
const { handleRequest } = await import('../index.js');

// ---------------- 夹具（纯内存 · 单测） ----------------

/**
 * 同一份血缘图（7 人）：本族 h_g / h_gw / h_s / h_d + 婚入妇 h_sw ⇒ 家族口径 5 人；
 * h_dh（女婿，外来姻亲根）与 h_dc（挂在其下）被剔出 ⇒ people 数 7 ≠ 家族口径 5（可判负）。
 */
const GRAPH = {
  people: {
    h_g: { handle: 'h_g', gender: 'M' },
    h_gw: { handle: 'h_gw', gender: 'F' },
    h_s: { handle: 'h_s', gender: 'M' },
    h_sw: { handle: 'h_sw', gender: 'F', external_mirror: 'true' },
    h_d: { handle: 'h_d', gender: 'F' },
    h_dh: { handle: 'h_dh', gender: 'M' },
    h_dc: { handle: 'h_dc', gender: 'M', external_mirror: 'true' },
  },
  families: {
    f1: { handle: 'f1', father_handle: 'h_g', mother_handle: 'h_gw', child_handles: ['h_s', 'h_d'] },
    f2: { handle: 'f2', father_handle: 'h_s', mother_handle: 'h_sw', child_handles: [] },
    f3: { handle: 'f3', father_handle: 'h_dh', mother_handle: 'h_d', child_handles: ['h_dc'] },
  },
};

const treeOf = (id, extra = {}) => ({ tree_id: id, version: 1, ...GRAPH, ...extra });

const UNIT_TREES = {
  fa: treeOf('fa', { updated_at: '2026-10-01T00:00:00.000Z' }), // family（缺省）⇒ 血缘口径 5
  cl: treeOf('cl', { updated_at: '2026-10-02T00:00:00.000Z' }), // meta kind=clan ⇒ people 数 7
};

const UNIT_META = {
  trees: {
    fa: { tree_id: 'fa', kind: 'family', display_title: '夹具家族' },
    cl: { tree_id: 'cl', kind: 'clan', display_title: '夹具祖谱' },
  },
};

/** 详情档：h_g 带外部链世代 20 ⇒ 世乘/宗乘档边界（≤72 ⇒ 宗乘级） */
const UNIT_DETAILS = {
  fa: [{ handle: 'h_g', attributes: [{ key: 'external_chain_gen', value: '20' }] }],
  cl: [],
};

/** 计数器 + 可注入时钟的最小依赖集（`state.throwOn` 可在创建后动态改，模拟「先好后坏」） */
function makeDeps({ trees = UNIT_TREES, meta = UNIT_META, details = UNIT_DETAILS, throwOn = [], clock } = {}) {
  const counts = { list: 0, getTree: 0, getMeta: 0, getDetails: 0, activity: 0 };
  const state = { throwOn: new Set(throwOn) };
  const now = clock || (() => Date.now());
  const deps = {
    now,
    listTreeIds: async () => {
      counts.list++;
      if (state.throwOn.has('list')) throw new Error('清单不可用');
      return Object.keys(trees).concat(['ghost']); // ghost ⇒ getTree 返 null，应静默跳过
    },
    getTree: async (id) => {
      counts.getTree++;
      if (state.throwOn.has(id)) throw new Error(`读树失败: ${id}`);
      return trees[id] || null;
    },
    getMeta: async () => {
      counts.getMeta++;
      if (state.throwOn.has('meta')) throw new Error('meta 不可用');
      return meta;
    },
    getAllDetails: async (id) => {
      counts.getDetails++;
      if (state.throwOn.has('details')) throw new Error('详情档不可用');
      return details[id] || [];
    },
    treeActivity: async () => {
      counts.activity++;
      if (state.throwOn.has('activity')) throw new Error('集合不可用');
      return 3;
    },
  };
  return { deps, counts, state };
}

const RANK_KEYS = [
  'total_generations',
  'rank_key',
  'rank_label',
  'rank_en',
  'rank_desc',
  'over_limit',
  'max_depth',
  'root_count',
  'person_count',
  'mirror_count',
  'explicit',
  'activity',
  'updated_at',
];

// ---------------- ① 出参形状 ----------------

test('① 出参形状：v / generated_at / trees 键集 + 每树字段与 /tree/rank 同集，且不含 access', async () => {
  const { deps } = makeDeps();
  const idx = await createTreeRankIndexReader(deps).getRankIndex();

  assert.equal(idx.v, TREE_RANK_INDEX_VERSION);
  assert.equal(idx.v, 1);
  assert.equal(typeof idx.generated_at, 'string');
  assert.ok(!Number.isNaN(Date.parse(idx.generated_at)), 'generated_at 必须是可解析的 ISO 时刻');
  assert.deepEqual(Object.keys(idx.trees), ['cl', 'fa'], 'trees 键 = tree_id 去重升序；getTree 返 null 的 ghost 静默跳过');
  assert.equal('failed' in idx, false, '无失败树时不得出现 failed 键');

  const fa = idx.trees.fa;
  for (const k of ['tree_id', ...RANK_KEYS]) assert.ok(k in fa, `每树必须含字段 ${k}（与 /tree/rank 同集）`);
  assert.equal('access' in fa, false, '排序索引不得下发 access（不带权限档）');
  assert.equal(fa.tree_id, 'fa');
  assert.equal(fa.person_count, 5, '家族口径 = 纯血缘图（7 人中剔除女婿 h_dh 与其子 h_dc）');
  assert.equal(fa.mirror_count, 2, 'h_sw（婚入妇镜像）+ h_dc（child 镜像）');
  assert.equal(fa.total_generations, 20, '详情档 external_chain_gen=20 优先');
  assert.equal(fa.explicit, true);
  assert.equal(fa.rank_key, 'lineage_rank');
  assert.equal(fa.rank_label, '宗乘级');
  assert.equal(fa.rank_en, 'Lineage-Rank');
  assert.equal(fa.over_limit, false);
  assert.equal(fa.max_depth, 72);
  assert.equal(fa.root_count, 7);
  assert.equal(fa.activity, 3);
  assert.equal(fa.updated_at, '2026-10-01T00:00:00.000Z');

  const cl = idx.trees.cl;
  assert.equal(cl.person_count, 7, '祖谱（kind=clan）保持 = 树内 people 数（分层不串）');
  assert.equal(cl.explicit, false, '无 external_chain_gen ⇒ 退回家族图 BFS');
  assert.equal(typeof cl.total_generations, 'number');
  assert.equal(cl.rank_key, 'family_rank');
});

test('①′ TTL 常量与地区数据同一值（同一频次，不另设）', () => {
  assert.equal(TREE_RANK_INDEX_TTL_MS, GEO_STATS_TTL_MS);
  assert.equal(TREE_RANK_INDEX_TTL_MS, 24 * 60 * 60 * 1000);
});

// ---------------- ② 快照命中（只扫一次） ----------------

test('② 快照命中：同一进程连续两次请求只全量扫描一次（计数器 + 同一对象 + 同一 generated_at）', async () => {
  const { deps, counts } = makeDeps();
  const reader = createTreeRankIndexReader(deps);

  const first = await reader.getRankIndex();
  assert.equal(counts.list, 1, '首次请求扫描一次');
  assert.equal(counts.getTree, 3, '首次请求逐树读 3 次（2 棵真树 + 1 个已删 id）');

  const second = await reader.getRankIndex();
  assert.equal(counts.list, 1, 'TTL 内第二次请求**不得再扫清单**');
  assert.equal(counts.getTree, 3, 'TTL 内第二次请求**不得再逐树读**');
  assert.equal(counts.getDetails, 2, 'TTL 内不得重读详情档');
  assert.equal(counts.activity, 2, 'TTL 内不得重算活跃度');
  assert.equal(second, first, 'TTL 内返回同一份快照对象（引用相等）');
  assert.equal(second.generated_at, first.generated_at);

  await reader.getRankIndex();
  assert.equal(counts.list, 1, '第三次请求仍命中同一快照');
});

// ---------------- ③ TTL 过期后重扫 ----------------

test('③ TTL 过期后重扫：+24h 内仍命中，越过 TTL 即重扫且 generated_at 前进', async () => {
  let clockNow = Date.parse('2026-10-19T00:00:00.000Z');
  const { deps, counts } = makeDeps({ clock: () => clockNow });
  const reader = createTreeRankIndexReader(deps);

  const first = await reader.getRankIndex();
  assert.equal(counts.list, 1);
  assert.equal(first.generated_at, '2026-10-19T00:00:00.000Z');

  clockNow += TREE_RANK_INDEX_TTL_MS - 1; // 差 1ms 到期
  await reader.getRankIndex();
  assert.equal(counts.list, 1, '未越过 TTL（差 1ms）不得重扫');

  clockNow += 1; // 恰好到期
  const third = await reader.getRankIndex();
  assert.equal(counts.list, 2, '越过 TTL ⇒ 重扫一次');
  assert.equal(counts.getTree, 6);
  assert.equal(third.generated_at, new Date(clockNow).toISOString());
  assert.notEqual(third.generated_at, first.generated_at, 'generated_at 必须随重扫前进');
  assert.notEqual(third, first);
});

// ---------------- ④ 失败隔离 / 降级 ----------------

test('④-1 单树读失败：只进 failed，其它树照常（不拖垮整体）', async () => {
  const { deps } = makeDeps({ throwOn: ['fa'] });
  const idx = await createTreeRankIndexReader(deps).getRankIndex();
  assert.deepEqual(idx.failed, ['fa'], '失败的树必须出现在 failed');
  assert.deepEqual(Object.keys(idx.trees), ['cl'], '好树照常出数');
  assert.equal(idx.trees.cl.person_count, 7);
  assert.equal(typeof idx.generated_at, 'string', '部分失败仍是一次成功快照（generated_at 有效）');
});

test('④-2 清单失败：返上一次成功值（时刻不变、不进缓存），无上次值 ⇒ 空快照；恢复后立即重扫（无负缓存）', async () => {
  // 冷启动失败 ⇒ 空快照（v=1 / generated_at=null / trees={}）
  const coldDeps = makeDeps({ throwOn: ['list'] }).deps;
  const cold = await createTreeRankIndexReader(coldDeps).getRankIndex();
  assert.deepEqual(cold, { v: 1, generated_at: null, trees: {} }, '无成功值 ⇒ 冻结空快照（绝不 5xx）');

  // 同一 reader：先成功一次，过期后清单失败 ⇒ 仍是上一次成功值，且时刻不刷新
  let clockNow = Date.parse('2026-10-19T00:00:00.000Z');
  const { deps, counts, state } = makeDeps({ clock: () => clockNow });
  const reader = createTreeRankIndexReader(deps);
  const good = await reader.getRankIndex();
  assert.equal(counts.list, 1);

  clockNow += TREE_RANK_INDEX_TTL_MS + 1; // 越过 TTL ⇒ 下次请求会尝试重扫
  state.throwOn.add('list');
  const degraded = await reader.getRankIndex();
  assert.equal(counts.list, 2, '过期后必须尝试重扫（失败才知道失败）');
  assert.equal(degraded, good, '整体失败 ⇒ 返回上一次成功快照（同一对象）');
  assert.equal(degraded.generated_at, good.generated_at, '失败不得刷新成功时刻');

  // 无负缓存：下一次请求立即重试（清单恢复 ⇒ 立刻出真值，且失败不被缓存）
  state.throwOn.delete('list');
  const recovered = await reader.getRankIndex();
  assert.equal(counts.list, 3, '每次失败后下一次请求必须重试清单（不做负缓存）');
  assert.deepEqual(Object.keys(recovered.trees), ['cl', 'fa']);
  assert.notEqual(recovered.generated_at, good.generated_at);
});

test('④-3 meta / details / activity 不可用：只降该项（不整体失败、不拖垮其它字段）', async () => {
  const { deps } = makeDeps({ throwOn: ['meta', 'details', 'activity'] });
  const idx = await createTreeRankIndexReader(deps).getRankIndex();
  assert.equal('failed' in idx, false, '附属源不可用不算树失败');
  assert.deepEqual(Object.keys(idx.trees), ['cl', 'fa']);
  const fa = idx.trees.fa;
  assert.equal(fa.person_count, 5, 'meta 缺失 ⇒ 分层按 family 口径（与缺省 kind 一致）');
  assert.equal(fa.explicit, false, 'details 缺失 ⇒ 退回家族图 BFS 算世代');
  assert.equal(typeof fa.total_generations, 'number');
  assert.equal(fa.activity, 0, 'activity 不可用 ⇒ 0（附属字段恒不抛）');
  assert.equal(fa.updated_at, '2026-10-01T00:00:00.000Z', '树自身字段不受影响');
});

// ---------------- 路由层夹具 ----------------

const ROUTE_IDS = ['rt_family', 'rt_clan'];
for (const id of ROUTE_IDS) {
  fs.writeFileSync(path.join(TMP, 'trees', `${id}.json`), JSON.stringify(treeOf(id, { updated_at: '2026-10-03T00:00:00.000Z' })));
  fs.writeFileSync(
    path.join(TMP, 'details', `${id}:h_g.json`),
    JSON.stringify({ handle: 'h_g', tree_id: id, attributes: [{ key: 'external_chain_gen', value: '20' }] }),
  );
}
fs.writeFileSync(
  META_FILE,
  JSON.stringify({
    _schema: '1.0',
    trees: {
      rt_family: { tree_id: 'rt_family', kind: 'family', display_title: '路由夹具家族' },
      rt_clan: { tree_id: 'rt_clan', kind: 'clan', display_title: '路由夹具祖谱' },
    },
  }),
);

const call = async (p, opts = {}) => {
  const res = await handleRequest({ path: p, httpMethod: opts.method || 'GET', headers: opts.headers || {} });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

// ---------------- ⑤ 与 /tree/rank 逐值一致 ----------------

test('⑤ 口径一致：同一棵树 /tree/rank 与 /tree/rank-index 的人数及全部等级字段逐值相等', async () => {
  const idxRes = await call('/tree/rank-index');
  assert.equal(idxRes.status, 200);
  assert.equal(idxRes.body.v, 1);
  assert.ok(!('failed' in idxRes.body), `不得有失败树：${JSON.stringify(idxRes.body.failed)}`);
  assert.deepEqual(Object.keys(idxRes.body.trees), ['rt_clan', 'rt_family']);

  for (const id of ROUTE_IDS) {
    const one = await call('/tree/rank', { headers: { 'X-Tree-Id': id } });
    assert.equal(one.status, 200);
    const many = idxRes.body.trees[id];
    assert.equal(many.tree_id, id);
    for (const k of RANK_KEYS) {
      assert.equal(many[k], one.body[k], `${id} 的 ${k} 必须与 /tree/rank 逐值一致`);
    }
    assert.equal('access' in many, false, '聚合口不得下发 access');
    assert.ok('access' in one.body, '/tree/rank 的 access 字段必须保留（本单不改该口行为）');
    // 人数口径落地值（防两路同时漂成同一错值）：家族 5 / 祖谱 7
    assert.equal(many.person_count, id === 'rt_family' ? 5 : 7);
  }

  // 两个时刻分别是「本快照时刻」与「实时」—— 只需各自合法；字段值相等已是强判据
  assert.ok(!Number.isNaN(Date.parse(idxRes.body.generated_at)));
});

test('⑤′ /tree/rank 既有行为不变：缺 X-Tree-Id ⇒ 400，未知树 ⇒ 404', async () => {
  assert.equal((await call('/tree/rank')).status, 400);
  assert.equal((await call('/tree/rank', { headers: { 'X-Tree-Id': 'nope' } })).status, 404);
});

// ---------------- ⑥ 路由层注册（无鉴权 / 非 GET 不落本口） ----------------

test('⑥ 路由层：无鉴权头 / 无 X-Tree-Id 即 200；非 GET 不返回快照', async () => {
  const ok = await call('/tree/rank-index');
  assert.equal(ok.status, 200);
  assert.equal(typeof ok.body.generated_at, 'string');
  assert.ok('trees' in ok.body);

  // 非 GET：本口只注册 GET ⇒ 落到既有树编辑闸门（缺 X-Tree-Id ⇒ 400）/ 未知路径（404），绝不返快照
  const post = await call('/tree/rank-index', { method: 'POST' });
  assert.equal(post.status, 400, `POST 不得命中本口（实得 ${post.status}）`);
  assert.ok(!('trees' in post.body), 'POST 不得返回排序快照');

  const postWithTree = await call('/tree/rank-index', { method: 'POST', headers: { 'X-Tree-Id': 'rt_family' } });
  assert.equal(postWithTree.status, 404, `POST（带树头）落未知路径 404（实得 ${postWithTree.status}）`);

  // 近似路径不得被前缀匹配吃掉
  const typo = await call('/tree/rank-indexx', { headers: { 'X-Tree-Id': 'rt_family' } });
  assert.equal(typo.status, 404);
});
