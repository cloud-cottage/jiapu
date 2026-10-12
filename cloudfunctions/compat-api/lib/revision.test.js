/**
 * 修谱域单测（`lib/revision.test.js`）— node:test 体例
 *
 * 数据安全：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本
 * （绝不写 `config/` 与 `migrate-output/` 真源；3100 本地现直连生产 ⇒ 单测一律走副本）。
 *
 * 覆盖（计费模型改造 · Kevin 2026-10-12 拍定 · 冻结契约硬清单）：
 *   ① 间隔查表（M 按 seq 计数）② 首轮无门槛 ③ 惰性固化边界（30 天前后）
 *   ④ 繁体逐字拒绝 + 标点清洗 ⑤ `amountToChineseUpper` 六样例
 *   ⑥ **开轮恒 999** + 不足 409 整单不落（恒价：首轮与后续同价）
 *   ⑦ **锁定后一次保存扣 9999**（days=31）· **t≥360 扣 99999** · **编辑期内 0 费**
 *   ⑧ **一次 items 含多 kind 只扣一次**（验扣费只发生 1 笔）
 *   ⑨ **锁定后本树 tree_steward 付费即可写（200 且扣费）**（取代旧「固后 403」）· `chief_editor` 同理
 *   ⑩ 越树 403（保留 D-1 树归属判据；start / save 两条写入口）· 角色档位矩阵
 *   ⑪ helpers / donations 全量替换（经 save 唯一写入口）
 *   ⑫ 配置键：只剩 `revision_interval_years` 可配、`revision_fee_bamboos` 已不存在（写它不改任何行为）
 *   ⑬ 天数 `ceil` 边界（29.5→30 编辑期；30.5→31→9999；359.5→360→99999）
 *   ⑭ D-2 读容错（空态不抛）+ 写不容错（503 可读文案，不得 200）
 *   ⑯ **留痕**：锁定轮 `save` ⇒ `jiapu_ops_logs` 恰新增 1 条，`op/tree_id/seq/operator/amount_pieces/tx_id`
 *      逐字正确（体例 = 每笔一档 / `id=opsLogId()` / `ts` 排序键）· ⑰ 编辑期内 `save`（0 费）⇒ **0 条**
 *   ⑱ `chief_editor` 锁定轮 `save` ⇒ 同样写 1 条（单一路径；长锁档 `amount_pieces=99999`）
 *   ⑲ 日志写入抛错 ⇒ 主流程仍成功（扣费 / 落盘一字不变）+ 出参 `log_warning === true`（不得静默）
 *
 * ⚠️ 用例物理顺序：**⑯–⑲ 必须排在 ⑮ 之前** —— ⑮ 会把 `collections/jiapu_revisions.json` 换成目录，
 *    之后任何写路径（含留痕所需的那条写入口）都必然失败。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/revision.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiapu-revision-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const REV = await import('./revision.js');
const AMT = await import('./revision-amount.js');
const ledger = await import('./economy-ledger.js');
const store = await import('./store.js');
const wallet = await import('./wallet.js');
const OPS = await import('./economy-ops.js'); // 留痕集合（`jiapu_ops_logs`）常量与体例来源

// 夹具：家族树（helpers / donations 存在性 + name 反查 + D-1 本树归属判据）
const FLOW_TREE = 'rev_flow_tree'; // 开轮恒价 / 冷却
const BROKE_TREE = 'rev_broke_tree'; // 余额不足
const LOCK_TREE = 'rev_lock_tree'; // 锁定档（9999）
const LONG_TREE = 'rev_long_tree'; // 长锁档（99999）
const FULL_TREE = 'rev_full_tree'; // 编辑期内（0 费）/ 全量替换
const OWN_TREE = 'rev_own_tree'; // D-1：本树
const OTHER_TREE = 'rev_other_tree'; // D-1：他树
const CFG_TREE = 'rev_cfg_tree'; // 配置键（写旧键不改行为）
const D2_TREE = 'rev_d2_tree'; // D-2 写不容错（**从未有过修谱记录**，否则进程内缓存会先拦成 409）
const OPS_TREE = 'rev_ops_tree'; // 留痕（锁定后付费保存 ⇒ jiapu_ops_logs）
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
const people = { h1: { handle: 'h1', name: '甲' }, h2: { handle: 'h2', name: '乙' } };
for (const t of [FLOW_TREE, BROKE_TREE, LOCK_TREE, LONG_TREE, FULL_TREE, OWN_TREE, OTHER_TREE, CFG_TREE, D2_TREE, OPS_TREE]) {
  fs.writeFileSync(path.join(TMP, 'trees', `${t}.json`), JSON.stringify({ tree_id: t, people: { ...people } }));
}

// 锚点夹具（D-1）：tree_steward 的本树主理资格 = 本人锚点树 === 目标 tree_id
// （一手机号一锚点 ⇒ 每棵树用独立账号，避免跨树夹具互相污染）
const PHONE = '13800000000';
const BROKE_STEWARD = '13900000000';
const LOCK_STEWARD = '13711112222';
const LONG_STEWARD = '13744445555';
const FULL_STEWARD = '13722223333';
const OWN_STEWARD = '13733334444';
const CFG_STEWARD = '13766667777';
const D2_STEWARD = '13788889999';
const OPS_STEWARD = '13755556666'; // 留痕本树 tree_steward（锚点 → OPS_TREE）
const CHEF = '13700000000'; // chief_editor（无锚点亦可）
const mkAnchor = (phone, treeId) =>
  store.colSet('jiapu_anchors', phone, { tree_id: treeId, person_handle: 'h1', updated_at: new Date().toISOString() });
await mkAnchor(PHONE, FLOW_TREE);
await mkAnchor(BROKE_STEWARD, BROKE_TREE);
await mkAnchor(LOCK_STEWARD, LOCK_TREE);
await mkAnchor(LONG_STEWARD, LONG_TREE);
await mkAnchor(FULL_STEWARD, FULL_TREE);
await mkAnchor(OWN_STEWARD, OWN_TREE);
await mkAnchor(CFG_STEWARD, CFG_TREE);
await mkAnchor(D2_STEWARD, D2_TREE);
await mkAnchor(OPS_STEWARD, OPS_TREE);
// 各账号预置竹片（只给需要扣费的）
for (const [p, n] of [[PHONE, 5000], [LOCK_STEWARD, 200000], [LONG_STEWARD, 200000], [FULL_STEWARD, 200000], [OWN_STEWARD, 200000], [CFG_STEWARD, 200000], [D2_STEWARD, 200000], [OPS_STEWARD, 200000], [CHEF, 200000]]) {
  await ledger.withAssets(p, (u) => ledger.addLot(u, 'bamboo', n, { source: 'test' }));
}

const sumOf = async (phone) => ledger.sumLots((await ledger.getAssets(phone)).bamboos);
const editTxs = async (phone) => (await ledger.getAssets(phone)).txs.filter((t) => t.type === 'edit_fee');

/** 留痕集合（`jiapu_ops_logs`）全量读取（每笔一档；含 `_id`） */
const opsLogsAll = () => store.listAll(OPS.OPS_LOGS_COL);
/** 留痕新增盘点：以 `_id` 全集做差（不依赖数量口径） */
const opsLogsNewSince = async (beforeIds) => (await opsLogsAll()).filter((d) => !beforeIds.has(d._id));
const opsLogIdSet = async () => new Set((await opsLogsAll()).map((d) => d._id));

/** 播种一条已开始的修谱记录（惰性锁由 `effective_at` 与 `now` 的相对距离决定） */
const seedRev = (treeId, seq, effectiveAt) =>
  store.colSet(REV.REVISION_COL, treeId, {
    _id: treeId,
    version: 1,
    seq,
    revisions: [
      { seq, started_at: effectiveAt, effective_at: effectiveAt, locked_at: null, cover: null, article: null, helpers: [], donations: [], content_updated_at: null },
    ],
  });

const ARTICLE = { title: '譜序', body: '本族自北徙南', signature: '主事者' };

// ══ ① 间隔查表（M 按 seq 计数）+ 常量写死 ═══════════════════════════════════════
test('① 间隔查表：M=1→1、2→2、3→3、4→5、M≥5→10；M=0→0；表可被覆盖；计费常量写死', () => {
  assert.equal(REV.intervalFor(0), 0, '第 1 次无等待门槛');
  assert.equal(REV.intervalFor(1), 1);
  assert.equal(REV.intervalFor(2), 2);
  assert.equal(REV.intervalFor(3), 3);
  assert.equal(REV.intervalFor(4), 5);
  assert.equal(REV.intervalFor(5), 10);
  assert.equal(REV.intervalFor(6), 10, 'M≥5 取表末值');
  assert.equal(REV.intervalFor(2, [3, 7]), 7, '表可被配置覆盖');
  assert.deepEqual(REV.DEFAULT_REVISION_INTERVAL_YEARS, [1, 2, 3, 5, 10]);

  // 计费模型（常量写死，无后台入口）
  assert.equal(REV.REVISION_EDIT_DAYS, 30);
  assert.equal(REV.REVISION_FEE_START_BAMBOOS, 999);
  assert.equal(REV.REVISION_FEE_LOCKED_EDIT_BAMBOOS, 9999);
  assert.equal(REV.REVISION_FEE_LOCKED_LONG_BAMBOOS, 99999);
  assert.deepEqual(REV.REVISION_ITEM_KINDS, ['article', 'helpers', 'donations', 'cover']);

  // I：`revision_fee_bamboos` 键 / 常量 / 读函数 / 写函数**已整体删除**
  assert.equal(REV.DEFAULT_REVISION_FEE_BAMBOOS, undefined, '旧常量已删除');
  assert.equal(REV.setRevisionFeeBamboos, undefined, '旧写函数已删除');
  assert.equal(wallet.getRevisionFeeBamboos, undefined, 'wallet 旧读函数已删除');
  assert.equal(wallet.DEFAULT_REVISION_FEE_BAMBOOS, undefined, 'wallet 旧常量已删除');
});

// ══ ② 首轮无门槛 ═══════════════════════════════════════════════════════════════
test('② 第 1 次修谱无等待门槛', () => {
  const r = REV.canStartRevision({ revisions: [], now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'first');
  assert.equal(r.next_start_at, '');
});

// ══ ③ M 按 seq 计数（作废概念已取消 ⇒ 历史 aborted 记录同样计入 M） ═══════════════
test('③ 间隔计数 M = 该树已开始的修谱总数（含历史 aborted 档）；间隔自最终轮 effective_at 起算', () => {
  // 仅含一条历史 aborted 记录 ⇒ M=1（不再「作废不吃冷却」）⇒ 冷却 = effective_at + 1 年
  const legacy = [{ seq: 1, effective_at: '2026-01-01T00:00:00.000Z', aborted: true }];
  const r = REV.canStartRevision({ revisions: legacy, now: new Date('2026-01-02T00:00:00Z') });
  assert.equal(r.ok, false, '历史 aborted 记录同样计入 M ⇒ 有冷却');
  assert.equal(r.reason, 'cooldown');
  assert.equal(r.next_start_at, '2027-01-01T00:00:00.000Z');

  // M=2 ⇒ +2 年；到达即放行
  const two = [
    { seq: 1, effective_at: '2025-01-01T00:00:00.000Z', aborted: true },
    { seq: 2, effective_at: '2026-01-01T00:00:00.000Z' },
  ];
  const r2 = REV.canStartRevision({ revisions: two, now: new Date('2027-06-01T00:00:00Z') });
  assert.equal(r2.ok, false);
  assert.equal(r2.next_start_at, '2028-01-01T00:00:00.000Z');
  const r3 = REV.canStartRevision({ revisions: two, now: new Date('2028-01-01T00:00:00Z') });
  assert.equal(r3.ok, true, '到达门槛即放行');
});

// ══ ④ 惰性固化边界（恰好 30 天前后） ═════════════════════════════════════════════
test('④ 惰性固化边界：now > effective_at + 30d 才算锁', () => {
  const rev = { seq: 1, effective_at: '2026-01-01T00:00:00.000Z' };
  assert.equal(REV.lockAtOf(rev), '2026-01-31T00:00:00.000Z');
  assert.equal(REV.isLocked(rev, new Date('2026-01-30T23:59:59.999Z')), false);
  assert.equal(REV.isLocked(rev, new Date('2026-01-31T00:00:00.000Z')), false, '恰好 30 天不算锁');
  assert.equal(REV.isLocked(rev, new Date('2026-01-31T00:00:00.001Z')), true);
});

// ══ ⑤ 繁体拒绝（逐字 400）与标点清洗 ═══════════════════════════════════════════
test('⑤ 繁体逐字校验 + 标点清洗', () => {
  assert.equal(REV.firstSimplifiedChar('譜'), '', '繁体无命中');
  assert.equal(REV.firstSimplifiedChar('家谱'), '谱', '指出首个简体字');
  assert.throws(
    () => REV.normalizeArticle({ title: '家谱', body: '繁', signature: '繁' }),
    (e) => e.status === 400 && /族務紀文須以繁體字錄入/.test(e.message) && /谱/.test(e.message),
  );
  assert.equal(REV.cleanArticleText('甲，乙。丙,丁.戊'), '甲 乙 丙 丁 戊', '四类标点→空格 + 连续空格折叠');
  assert.deepEqual(
    REV.normalizeArticle({ title: '甲，乙', body: '丙。丁', signature: '戊' }),
    { title: '甲 乙', body: '丙 丁', signature: '戊' },
  );
  assert.throws(() => REV.normalizeArticle({ title: '', body: '丙', signature: '戊' }), (e) => e.status === 400);
  assert.throws(() => REV.normalizeArticle({ title: '，。', body: '丙', signature: '戊' }), (e) => e.status === 400, '清洗后为空同样 400');
});

// ══ ⑥ amountToChineseUpper 六个样例 ═══════════════════════════════════════════
test('⑥ amountToChineseUpper 六个样例', () => {
  assert.equal(AMT.amountToChineseUpper(0), '零元');
  assert.equal(AMT.amountToChineseUpper(10), '壹拾元');
  assert.equal(AMT.amountToChineseUpper(100), '壹佰元');
  assert.equal(AMT.amountToChineseUpper(1234), '壹仟貳佰參拾肆元');
  assert.equal(AMT.amountToChineseUpper(10000), '壹萬元');
  assert.equal(AMT.amountToChineseUpper(1005), '壹仟零伍元');
  assert.throws(() => AMT.amountToChineseUpper(-1));
});

// ══ ⑦ 开轮恒 999 + 不足 409 整单不落 ═══════════════════════════════════════════
test('⑦ 开轮恒 999（首轮与后续同价）；不足 ⇒ 409 ASSET_INSUFFICIENT 且整单不落记录', async () => {
  // 不足：一字节不落
  await assert.rejects(
    () => REV.startRevision({ treeId: BROKE_TREE, phone: BROKE_STEWARD, role: 'tree_steward', now: new Date('2026-05-01T00:00:00Z') }),
    (e) => e.status === 409 && e.code === 'ASSET_INSUFFICIENT' && e.need === 999,
  );
  assert.equal(await store.colGet(REV.REVISION_COL, BROKE_TREE), null, '扣费失败 ⇒ 一字节不落（无修谱记录）');

  // 开轮：恒 999（第 1 轮）
  const t0 = new Date('2026-03-01T00:00:00Z');
  const s1 = await REV.startRevision({ treeId: FLOW_TREE, phone: PHONE, role: 'tree_steward', now: t0 });
  assert.equal(s1.seq, 1);
  assert.equal(s1.fee.pieces, 999, '开轮恒 999');
  assert.equal(await sumOf(PHONE), 4001, '预扣 999 片');
  assert.equal(s1.lock_at, '2026-03-31T00:00:00.000Z', 'lock_at = effective_at + 30d');

  // 进行中再开 ⇒ 409 REVISION_ACTIVE
  await assert.rejects(
    () => REV.startRevision({ treeId: FLOW_TREE, phone: PHONE, role: 'tree_steward', now: t0 }),
    (e) => e.status === 409 && e.revision_code === 'REVISION_ACTIVE' && e.extra?.seq === 1,
  );
  // 冷却未到 ⇒ 409 REVISION_COOLDOWN + next_start_at
  await assert.rejects(
    () => REV.startRevision({ treeId: FLOW_TREE, phone: PHONE, role: 'tree_steward', now: new Date('2026-09-01T00:00:00Z') }),
    (e) => e.status === 409 && e.revision_code === 'REVISION_COOLDOWN' && e.extra?.next_start_at === '2027-03-01T00:00:00.000Z',
  );
  // 冷却到 ⇒ 第 2 轮同样扣 999（**恒价**）
  const s2 = await REV.startRevision({ treeId: FLOW_TREE, phone: PHONE, role: 'tree_steward', now: new Date('2027-03-02T00:00:00Z') });
  assert.equal(s2.seq, 2);
  assert.equal(s2.fee.pieces, 999, '第 2 轮仍 999（首轮与后续同价）');
  assert.equal(await sumOf(PHONE), 3002, '两轮各扣 999');
  const doc = await REV.loadRevisions(FLOW_TREE);
  assert.deepEqual(doc.revisions.map((r) => r.seq), [1, 2], 'seq 单调递增、永不重用');
});

// ══ ⑧ 锁定后一次保存扣 9999（days=31）· t≥360 扣 99999 · 编辑期内 0 费 ═══════════
test('⑧ 锁定后一次保存扣 9999（days=31）· t≥360 扣 99999 · 编辑期内 0 费', async () => {
  // locked：eff 2026-01-01 + now 2026-02-15 ⇒ days=45 ⇒ 9999
  await seedRev(LOCK_TREE, 1, '2026-01-01T00:00:00.000Z');
  const nowLock = new Date('2026-02-15T00:00:00Z');
  const before = await sumOf(LOCK_STEWARD);
  const r = await REV.saveRevision({ treeId: LOCK_TREE, seq: 1, items: [{ kind: 'article', payload: ARTICLE }], role: 'tree_steward', phone: LOCK_STEWARD, now: nowLock });
  assert.equal(r.ok, true);
  assert.equal(r.locked, true, 'days=45 ⇒ 已锁');
  assert.equal(r.fee.pieces, 9999, '锁定后一次保存扣 9999');
  assert.equal(await sumOf(LOCK_STEWARD), before - 9999, '实扣 9999');

  // long_locked：eff 2025-01-01 + now 2026-02-15 ⇒ days≥360 ⇒ 99999
  await seedRev(LONG_TREE, 1, '2025-01-01T00:00:00.000Z');
  const beforeLong = await sumOf(LONG_STEWARD);
  const rl = await REV.saveRevision({ treeId: LONG_TREE, seq: 1, items: [{ kind: 'article', payload: ARTICLE }], role: 'tree_steward', phone: LONG_STEWARD, now: nowLock });
  assert.equal(rl.locked, true);
  assert.equal(rl.fee.pieces, 99999, 'days≥360 ⇒ 扣 99999');
  assert.equal(await sumOf(LONG_STEWARD), beforeLong - 99999);

  // 编辑期内：eff 2026-02-14 + now 2026-02-15 ⇒ days=1 ⇒ 0 费、不写流水
  await seedRev(FULL_TREE, 1, '2026-02-14T00:00:00.000Z');
  const beforeEdit = await sumOf(FULL_STEWARD);
  const txBefore = (await editTxs(FULL_STEWARD)).length;
  const re = await REV.saveRevision({ treeId: FULL_TREE, seq: 1, items: [{ kind: 'article', payload: ARTICLE }], role: 'tree_steward', phone: FULL_STEWARD, now: new Date('2026-02-15T00:00:00Z') });
  assert.equal(re.locked, false);
  assert.equal(re.fee.pieces, 0, '编辑期内 0 片');
  assert.equal(re.fee.tx_id, '', '0 费不写流水');
  assert.equal(await sumOf(FULL_STEWARD), beforeEdit, '编辑期内不扣费');
  assert.equal((await editTxs(FULL_STEWARD)).length, txBefore, '0 费不新增流水');
  // 落盘成功
  assert.equal((await REV.loadRevisions(FULL_TREE)).revisions[0].article.title, '譜序');
});

// ══ ⑨ 一次 items 含多 kind 只扣一次 ═════════════════════════════════════════════
test('⑨ 一次 items 含多 kind（article/helpers/donations）只扣一次（验扣费只发生 1 笔）', async () => {
  await seedRev(LOCK_TREE, 2, '2026-01-01T00:00:00.000Z');
  const now = new Date('2026-02-15T00:00:00Z');
  const beforeFee = (await editTxs(LOCK_STEWARD)).length;
  const beforeSum = await sumOf(LOCK_STEWARD);
  const r = await REV.saveRevision({
    treeId: LOCK_TREE,
    seq: 2,
    items: [
      { kind: 'article', payload: ARTICLE },
      { kind: 'helpers', payload: [{ person_handle: 'h1', duty: '校對' }] },
      { kind: 'donations', payload: [{ person_handle: 'h2', amount: 10000 }] },
    ],
    role: 'tree_steward',
    phone: LOCK_STEWARD,
    now,
  });
  assert.equal(r.fee.pieces, 9999, '一次调用 = 一次（不论 items 长度）');
  assert.deepEqual(r.items.map((i) => i.kind), ['article', 'helpers', 'donations']);
  assert.equal((await editTxs(LOCK_STEWARD)).length - beforeFee, 1, '只发生 1 笔 edit_fee');
  assert.equal(await sumOf(LOCK_STEWARD), beforeSum - 9999, '只扣一次 9999（不是 3 次）');
  const doc = await REV.loadRevisions(LOCK_TREE);
  const rev = doc.revisions.find((x) => x.seq === 2);
  assert.equal(rev.article.title, '譜序');
  assert.deepEqual(rev.helpers, [{ person_handle: 'h1', duty: '校對' }]);
  assert.deepEqual(rev.donations, [{ person_handle: 'h2', amount: 10000 }]);
});

// ══ ⑩ 锁定后本树 tree_steward 付费即可写（取代旧「固后 403」）· chief_editor 同理 ══
test('⑩ 锁定后本树 tree_steward 付费即可写（200 且扣费）；chief_editor 同样按次扣费', async () => {
  await seedRev(LOCK_TREE, 3, '2026-01-01T00:00:00.000Z');
  const now = new Date('2026-02-15T00:00:00Z');

  const before = await sumOf(LOCK_STEWARD);
  const r = await REV.saveRevision({ treeId: LOCK_TREE, seq: 3, items: [{ kind: 'article', payload: ARTICLE }], role: 'tree_steward', phone: LOCK_STEWARD, now });
  assert.equal(r.ok, true, '固化后本树家族管理员**不再 403**（付费即可写）');
  assert.equal(r.fee.pieces, 9999);
  assert.equal(await sumOf(LOCK_STEWARD), before - 9999, '按次扣费');

  // chief_editor：任意树放行、同样按次扣费（单一计费路径，不做特例）
  const beforeChief = await sumOf(CHEF);
  const rc = await REV.saveRevision({ treeId: LOCK_TREE, seq: 3, items: [{ kind: 'helpers', payload: [{ person_handle: 'h1', duty: '主纂' }] }], role: 'chief_editor', phone: CHEF, now });
  assert.equal(rc.ok, true);
  assert.equal(rc.fee.pieces, 9999, 'chief_editor 同样扣 9999');
  assert.equal(await sumOf(CHEF), beforeChief - 9999);

  // 读视图：锁定轮次仍可写（active 非 null、editable 恒 true、fee_next_bamboos 按档位出）
  const view = await REV.getRevisionView(LOCK_TREE, now);
  assert.equal(view.edit_days, 30);
  assert.equal(view.fee_start_bamboos, 999);
  assert.equal(view.fee_locked_edit_bamboos, 9999);
  assert.equal(view.fee_locked_long_bamboos, 99999);
  assert.equal('fee_bamboos' in view, false, '旧键 fee_bamboos 已删除');
  assert.ok(view.active, '锁定轮仍为当前轮次');
  assert.equal(view.active.editable, true, 'editable 恒 true');
  assert.equal(view.active.fee_next_bamboos, 9999);
  const last = view.revisions.find((x) => x.seq === 3);
  assert.equal(last.fee_tier, 'locked');
  assert.equal(last.fee_next_bamboos, 9999);
  assert.equal(last.locked_at, '2026-01-31T00:00:00.000Z');
});

// ══ ⑪ 越树 403（保留 D-1 树归属判据；两条写入口）· 角色档位矩阵 ══════════════════
test('⑪ 越树写权：他树 tree_steward 在 start / save 逐条 403；本树放行；chief_editor 恒放行', async () => {
  const eff = '2026-04-01T00:00:00.000Z';
  await seedRev(OTHER_TREE, 1, eff);
  await seedRev(OWN_TREE, 1, eff);
  const now = new Date('2026-04-02T00:00:00Z'); // 编辑期内
  const png = Buffer.from('png').toString('base64');

  // ① 本树 tree_steward 打**他树** tree_id：start / save 逐条 403
  await assert.rejects(
    () => REV.startRevision({ treeId: OTHER_TREE, phone: OWN_STEWARD, role: 'tree_steward', now }),
    (e) => e.status === 403 && /僅限本族家族管理員/.test(e.message),
    'start 越树 ⇒ 403',
  );
  await assert.rejects(
    () => REV.saveRevision({ treeId: OTHER_TREE, seq: 1, items: [{ kind: 'article', payload: ARTICLE }], role: 'tree_steward', phone: OWN_STEWARD, now }),
    (e) => e.status === 403 && /僅限本族家族管理員/.test(e.message),
    'save 越树 ⇒ 403（先于 404 / 扣费）',
  );
  await assert.rejects(
    () => REV.saveRevision({ treeId: OTHER_TREE, seq: 1, items: [{ kind: 'cover', payload: { ext: 'png', data_base64: png } }], role: 'tree_steward', phone: OWN_STEWARD, now }),
    (e) => e.status === 403,
    'save(cover) 越树 ⇒ 403（先于云存储上传）',
  );
  assert.equal((await REV.loadRevisions(OTHER_TREE)).revisions[0].article, null, '越树写被拒 ⇒ 他树一字未改');

  // ② 本树 tree_steward ⇒ 放行（且落盘）
  const ok = await REV.saveRevision({ treeId: OWN_TREE, seq: 1, items: [{ kind: 'article', payload: ARTICLE }], role: 'tree_steward', phone: OWN_STEWARD, now });
  assert.equal(ok.ok, true);
  assert.equal((await REV.loadRevisions(OWN_TREE)).revisions[0].article.title, '譜序', '本树放行且落盘');

  // ③ chief_editor 打他树 ⇒ 放行（恒放行，任意树）
  const ce = await REV.saveRevision({ treeId: OTHER_TREE, seq: 1, items: [{ kind: 'article', payload: ARTICLE }], role: 'chief_editor', phone: CHEF, now });
  assert.equal(ce.ok, true);

  // ④ guest / user / branch_curator ⇒ 403（角色档位，与树归属无关）
  for (const role of ['guest', 'user', 'branch_curator']) {
    await assert.rejects(
      () => REV.saveRevision({ treeId: OWN_TREE, seq: 1, items: [{ kind: 'article', payload: ARTICLE }], role, phone: OWN_STEWARD, now }),
      (e) => e.status === 403,
      `role=${role} ⇒ 403`,
    );
  }
  // 档位够但无本树归属 ⇒ 403
  await assert.rejects(
    () => REV.assertRevisionWritable({ role: 'tree_steward', treeId: 'any', phone: 'no_such_phone' }),
    (e) => e.status === 403,
  );
  assert.equal(await REV.assertRevisionWritable({ role: 'chief_editor', treeId: 'any' }), 'chief_editor');
});

// ══ ⑫ helpers / donations 全量替换 + 存在性 + 金额校验 + 出参解析 ═══════════════
test('⑫ helpers / donations 全量替换（经 save 唯一写入口）+ 存在性 + 金额校验 + 出参解析', async () => {
  await seedRev(FULL_TREE, 2, '2026-04-01T00:00:00.000Z');
  const now = new Date('2026-04-02T00:00:00Z'); // 编辑期内（0 费）
  const call = (items) => REV.saveRevision({ treeId: FULL_TREE, seq: 2, items, role: 'tree_steward', phone: FULL_STEWARD, now });

  await call([{ kind: 'helpers', payload: [{ person_handle: 'h1', duty: '校對' }] }]);
  let doc = await REV.loadRevisions(FULL_TREE);
  assert.deepEqual(doc.revisions.find((r) => r.seq === 2).helpers, [{ person_handle: 'h1', duty: '校對' }]);

  await call([{ kind: 'helpers', payload: [{ person_handle: 'h2', duty: '繕寫' }] }]);
  doc = await REV.loadRevisions(FULL_TREE);
  assert.deepEqual(doc.revisions.find((r) => r.seq === 2).helpers, [{ person_handle: 'h2', duty: '繕寫' }], '全量替换（旧项消失）');

  await call([{ kind: 'donations', payload: [{ person_handle: 'h1', amount: 100 }, { person_handle: 'h2', amount: 10000 }] }]);
  doc = await REV.loadRevisions(FULL_TREE);
  assert.deepEqual(doc.revisions.find((r) => r.seq === 2).donations, [
    { person_handle: 'h1', amount: 100 },
    { person_handle: 'h2', amount: 10000 },
  ]);

  await assert.rejects(() => call([{ kind: 'helpers', payload: [{ person_handle: '不存在', duty: 'x' }] }]), (e) => e.status === 400, '节点不存在 ⇒ 400');
  await assert.rejects(() => call([{ kind: 'donations', payload: [{ person_handle: 'h1', amount: 0 }] }]), (e) => e.status === 400, '金额非正整数 ⇒ 400');
  await assert.rejects(() => call([{ kind: 'donations', payload: [{ person_handle: 'h1', amount: 1.5 }] }]), (e) => e.status === 400);
  // items 空 / 非数组 / kind 不合法 ⇒ 400
  await assert.rejects(() => call([]), (e) => e.status === 400);
  await assert.rejects(() => call('article'), (e) => e.status === 400);
  await assert.rejects(() => call([{ kind: 'roster', payload: {} }]), (e) => e.status === 400 && /修譜內容類型不合法/.test(e.message));

  // 出参解析：name 反查 + amount_text 繁体汉字大写 + 解析不到 ⇒ 占位
  const dhelp = REV.decorateHelpers([{ person_handle: 'h1', duty: '校對' }], { people });
  assert.deepEqual(dhelp, [{ person_handle: 'h1', duty: '校對', name: '甲' }]);
  const ddon = REV.decorateDonations([{ person_handle: 'h2', amount: 10000 }], { people });
  assert.deepEqual(ddon, [{ person_handle: 'h2', amount: 10000, name: '乙', amount_text: '壹萬元' }]);
  assert.equal(REV.resolveName({ people }, 'zzz'), '（節點已刪除）');
});

// ══ ⑬ 天数 ceil 边界（29.5→30；30.5→31；359.5→360） ═════════════════════════════
test('⑬ 天数 ceil 边界：29.5⇒30（编辑期 0）· 30.5⇒31（9999）· 359.5⇒360（99999）', () => {
  const eff = Date.parse('2026-01-01T00:00:00.000Z');
  const rev = { seq: 1, effective_at: '2026-01-01T00:00:00.000Z' };
  const at = (d) => new Date(eff + d * 86400000);

  assert.equal(REV.daysOf(rev, at(29.5)), 30, '29.5 天 ⇒ ceil 30');
  assert.equal(REV.feeTierOf(30), 'edit_window');
  assert.equal(REV.feeNextBamboosOf('edit_window'), 0);

  assert.equal(REV.daysOf(rev, at(30.5)), 31, '30.5 天 ⇒ ceil 31');
  assert.equal(REV.feeTierOf(31), 'locked');
  assert.equal(REV.feeNextBamboosOf('locked'), 9999);

  assert.equal(REV.daysOf(rev, at(359.5)), 360, '359.5 天 ⇒ ceil 360');
  assert.equal(REV.feeTierOf(360), 'long_locked');
  assert.equal(REV.feeNextBamboosOf('long_locked'), 99999);

  // 档位边界（阈值口径）
  assert.equal(REV.feeTierOf(0), 'edit_window');
  assert.equal(REV.feeTierOf(359), 'locked');
  assert.equal(REV.feeTierOf(360), 'long_locked');
});

// ══ ⑭ 配置键：只剩 revision_interval_years；写 revision_fee_bamboos 不改任何行为 ══
test('⑭ 配置键：仅 revision_interval_years 可配；写 revision_fee_bamboos 不得改变任何行为', async () => {
  assert.deepEqual(await wallet.getRevisionIntervalYears(), [1, 2, 3, 5, 10]);
  assert.deepEqual(await REV.setRevisionIntervalYears([2, 4]), [2, 4]);
  assert.deepEqual(await wallet.getRevisionIntervalYears(), [2, 4]);
  await assert.rejects(() => REV.setRevisionIntervalYears([1, -1]), (e) => e.status === 400);
  await assert.rejects(() => REV.setRevisionIntervalYears([]), (e) => e.status === 400);
  await REV.setRevisionIntervalYears([1, 2, 3, 5, 10]);
  assert.deepEqual(await wallet.getRevisionIntervalYears(), [1, 2, 3, 5, 10]);

  // 写一个「旧键」进 config：读侧已无此键 ⇒ 开轮费 / 视图一律仍 999（不得改变任何行为）
  await store.mutateDoc(wallet.WALLET_COL, wallet.CONFIG_ID, (doc) => {
    const rec = { ...(doc || {}) };
    delete rec._id;
    delete rec.version;
    rec.revision_fee_bamboos = 1234;
    return rec;
  });
  const cfg = await store.colGet(wallet.WALLET_COL, wallet.CONFIG_ID);
  assert.equal(cfg.revision_fee_bamboos, 1234, '旧键确实写进了 config（但无人读它）');

  // 用一棵**全新树**实开一轮：开轮价仍恒 999（写进 config 的 revision_fee_bamboos=1234 完全不影响）
  const before = await sumOf(CFG_STEWARD);
  const r = await REV.startRevision({ treeId: CFG_TREE, phone: CFG_STEWARD, role: 'tree_steward', now: new Date('2026-06-02T00:00:00Z') });
  assert.equal(r.fee.pieces, 999, '开轮费恒 999（不受 revision_fee_bamboos 影响）');
  assert.equal(await sumOf(CFG_STEWARD), before - 999, '实扣 999');
  assert.equal(REV.REVISION_FEE_START_BAMBOOS, 999);
  const view = await REV.getRevisionView(CFG_TREE, new Date('2026-06-02T00:00:00Z'));
  assert.equal(view.fee_start_bamboos, 999, '视图开轮费恒 999（与 config 里的 revision_fee_bamboos 无关）');
  assert.equal(view.fee_locked_edit_bamboos, 9999);
  assert.equal(view.fee_locked_long_bamboos, 99999);
});

// ══ ⑯ 留痕：锁定轮 save ⇒ 恰 1 条（字段逐字） ═════════════════════════════════════
//    ⚠️ ⑯–⑲ 必须排在 ⑮ 之前：⑮ 会把 collections/jiapu_revisions.json 换成目录，
//       之后任何写路径（含留痕）都必然失败。
test('⑯ 留痕：锁定轮 save（days≈31）⇒ jiapu_ops_logs 恰新增 1 条，op/tree_id/seq/operator/amount_pieces/tx_id 逐字正确', async () => {
  await seedRev(OPS_TREE, 1, '2026-01-01T00:00:00.000Z');
  const now = new Date('2026-02-01T00:00:00Z'); // days = 31 ⇒ locked ⇒ 9999
  const beforeIds = await opsLogIdSet();
  const balBefore = await sumOf(OPS_STEWARD);

  const r = await REV.saveRevision({
    treeId: OPS_TREE,
    seq: 1,
    items: [
      { kind: 'article', payload: ARTICLE },
      { kind: 'helpers', payload: [{ person_handle: 'h1', duty: '校對' }] },
    ],
    role: 'tree_steward',
    phone: OPS_STEWARD,
    now,
  });
  assert.equal(r.ok, true);
  assert.equal(r.locked, true, 'days=31 ⇒ 已锁');
  assert.equal(r.fee.pieces, 9999, '锁定轮扣 9999');
  assert.equal(await sumOf(OPS_STEWARD), balBefore - 9999, '实扣 9999');
  assert.equal(r.log_warning, undefined, '留痕成功 ⇒ 不出 log_warning 键（对齐 detail_warning 体例：失败才出键）');

  const added = await opsLogsNewSince(beforeIds);
  assert.equal(added.length, 1, '恰新增 1 条留痕（一次调用 = 一条，与 items 的 kind 数无关）');
  const log = added[0];
  assert.equal(log.op, 'revision_locked_edit', 'op 逐字（不是旧的 revision_override）');
  assert.equal(log.op, REV.REVISION_LOCKED_EDIT_OP, 'op 常量与落盘值同源');
  assert.equal(log.tree_id, OPS_TREE, 'tree_id 逐字');
  assert.equal(log.seq, 1, 'seq 逐字');
  assert.equal(log.operator, OPS_STEWARD, 'operator = 操作人手机号');
  assert.equal(log.amount_pieces, 9999, 'amount_pieces = 本次扣费片数');
  assert.match(r.fee.tx_id, /^tx_/, '扣费流水号形态');
  assert.equal(log.tx_id, r.fee.tx_id, 'tx_id = 本次扣费流水号');
  assert.equal(log.created_at, now.toISOString(), 'created_at = 本次保存时刻（ISO）');

  // 体例对齐 economy-ops.appendOpsLog：每笔一档（`_id === id`）+ `id = opsLogId()` + `ts` = 排序键
  assert.equal(log._id, log.id, '每笔一档：_id === entry.id');
  assert.match(log.id, /^op_\d+_[0-9a-z]{6}$/, 'id 走 opsLogId 体例（op_<毫秒>_<6 位随机>）');
  assert.equal(log.ts, log.created_at, 'ts = created_at（opsLogs() 的排序键同源，不分两套时间）');
  assert.ok(Number.isFinite(Date.parse(log.ts)), 'ts 可解析');

  // 「账单流水（edit_fee）与 ops_logs 是两回事，都要有」
  const tx = (await editTxs(OPS_STEWARD)).find((t) => t.id === r.fee.tx_id);
  assert.ok(tx, '同一笔扣费的 edit_fee 用户流水存在（流水与留痕双写）');
  assert.equal(tx.ref?.tree_id, OPS_TREE);
  // 留痕不改变任何写入结果
  assert.equal((await REV.loadRevisions(OPS_TREE)).revisions.find((x) => x.seq === 1).article.title, '譜序');
});

// ══ ⑰ 留痕：编辑期内（0 费）⇒ 一条都不写 ═════════════════════════════════════════
test('⑰ 留痕：编辑期内 save（feePieces === 0）⇒ jiapu_ops_logs 0 条新增', async () => {
  await seedRev(OPS_TREE, 2, '2026-02-14T00:00:00.000Z');
  const now = new Date('2026-02-15T00:00:00Z'); // days = 1 ⇒ edit_window ⇒ 0 片
  const beforeIds = await opsLogIdSet();
  const balBefore = await sumOf(OPS_STEWARD);

  const r = await REV.saveRevision({ treeId: OPS_TREE, seq: 2, items: [{ kind: 'article', payload: ARTICLE }], role: 'tree_steward', phone: OPS_STEWARD, now });
  assert.equal(r.ok, true);
  assert.equal(r.locked, false, 'days=1 ⇒ 未锁（编辑期）');
  assert.equal(r.fee.pieces, 0, '编辑期内 0 片');
  assert.equal(await sumOf(OPS_STEWARD), balBefore, '编辑期内不扣费');
  assert.equal(r.log_warning, undefined, '未扣费、无需留痕 ⇒ 也不出 log_warning');

  const added = await opsLogsNewSince(beforeIds);
  assert.equal(added.length, 0, '编辑期内不写留痕（0 条）');
  const all = await opsLogsAll();
  assert.equal(all.filter((l) => l.tree_id === OPS_TREE && Number(l.seq) === 2).length, 0, '该树第 2 次修谱无留痕');
  assert.equal(all.filter((l) => l.tree_id === OPS_TREE).length, 1, '该树仍只有 ⑯ 那一条留痕');
  assert.equal((await REV.loadRevisions(OPS_TREE)).revisions.find((x) => x.seq === 2).article.title, '譜序', '内容照常落盘');
});

// ══ ⑱ 留痕：chief_editor 锁定轮同样写 1 条（单一路径）· 长锁档 99999 ══════════════
test('⑱ 留痕：chief_editor 锁定轮 save ⇒ 同样写 1 条（不做特例）；长锁档 amount_pieces = 99999', async () => {
  await seedRev(OPS_TREE, 3, '2025-01-01T00:00:00.000Z'); // now 2026-02-15 ⇒ days ≥ 360 ⇒ long_locked
  const now = new Date('2026-02-15T00:00:00Z');
  const beforeIds = await opsLogIdSet();
  const beforeChief = await sumOf(CHEF);

  const r = await REV.saveRevision({
    treeId: OPS_TREE,
    seq: 3,
    items: [{ kind: 'helpers', payload: [{ person_handle: 'h1', duty: '主纂' }] }],
    role: 'chief_editor',
    phone: CHEF,
    now,
  });
  assert.equal(r.ok, true);
  assert.equal(r.locked, true);
  assert.equal(r.fee.pieces, 99999, 'days≥360 ⇒ 99999');
  assert.equal(await sumOf(CHEF), beforeChief - 99999, 'chief_editor 同样按次扣费');
  assert.equal(r.log_warning, undefined);

  const added = await opsLogsNewSince(beforeIds);
  assert.equal(added.length, 1, 'chief_editor 同样写 1 条（单一路径，不做特例）');
  assert.equal(added[0].op, 'revision_locked_edit');
  assert.equal(added[0].tree_id, OPS_TREE);
  assert.equal(added[0].seq, 3);
  assert.equal(added[0].operator, CHEF, 'operator = chief_editor 手机号');
  assert.equal(added[0].amount_pieces, 99999, '长锁档 amount_pieces = 99999');
  assert.equal(added[0].tx_id, r.fee.tx_id);
  assert.equal(added[0].created_at, now.toISOString());
});

// ══ ⑲ 留痕失败不阻断（best-effort）⇒ 主流程照常成功 + log_warning === true ═══════
test('⑲ 留痕失败不阻断：日志集合写失败 ⇒ 主流程照常成功（扣费/落盘一字不变）+ 出参 log_warning === true', async () => {
  await seedRev(OPS_TREE, 4, '2026-01-01T00:00:00.000Z');
  const now = new Date('2026-02-01T00:00:00Z'); // days = 31 ⇒ locked ⇒ 9999

  // 让 jiapu_ops_logs「不可用」：集合文件换成目录 ⇒ 写盘必抛（EISDIR）。
  //   与 ⑮ 同一手法：造成的**真 IO 失败**（不是跳过 / 静默），用于验「失败仍不阻断 + 出参警示」。
  const logFile = path.join(TMP, 'collections', `${OPS.OPS_LOGS_COL}.json`);
  const logBackup = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : null;
  fs.rmSync(logFile, { recursive: true, force: true });
  fs.mkdirSync(logFile, { recursive: true });
  try {
    // 失败源自证：留痕写入函数在该状态下**确实抛错**（证明 save 内那条路径被真调用了）
    await assert.rejects(
      () => REV.writeRevisionLockedEditLog({ treeId: OPS_TREE, seq: 4, phone: OPS_STEWARD, amountPieces: 9999, txId: 'tx_probe', now }),
      (e) => Boolean(e && e.message),
      '日志集合不可用 ⇒ 留痕写入函数确实抛错（失败源为真 IO 失败）',
    );

    const balBefore = await sumOf(OPS_STEWARD);
    const txBefore = (await editTxs(OPS_STEWARD)).length;
    const r = await REV.saveRevision({ treeId: OPS_TREE, seq: 4, items: [{ kind: 'article', payload: ARTICLE }], role: 'tree_steward', phone: OPS_STEWARD, now });

    assert.equal(r.ok, true, '留痕失败不得阻断主流程（仍 200）');
    assert.equal(r.locked, true);
    assert.equal(r.fee.pieces, 9999, '计费结果不变（留痕不参与计费）');
    assert.equal(await sumOf(OPS_STEWARD), balBefore - 9999, '照常扣费（不因留痕失败而返还）');
    assert.equal((await editTxs(OPS_STEWARD)).length - txBefore, 1, '账单流水照常有 1 笔 edit_fee');
    assert.equal(r.log_warning, true, '留痕失败必须出 log_warning:true（对齐 detail_warning 体例，不得静默）');
    assert.equal((await REV.loadRevisions(OPS_TREE)).revisions.find((x) => x.seq === 4).article.title, '譜序', '内容照常落盘');
  } finally {
    // 复原日志集合文件（后续用例 / 全量套件不受影响）
    fs.rmSync(logFile, { recursive: true, force: true });
    if (logBackup !== null) fs.writeFileSync(logFile, logBackup);
  }
});

// ══ ⑮ D-2 读容错 + 写不容错 ════════════════════════════════════════════════════
test('⑮ D-2：未修谱树 ⇒ 视图返空态、绝不抛；修谱集合不可用 ⇒ 写入仍失败且 503 可读文案', async () => {
  // 读：未修谱树 ⇒ 空态
  const view = await REV.getRevisionView('rev_ghost_tree', new Date('2026-01-01T00:00:00Z'));
  assert.equal(view.ok, true);
  assert.equal(view.active, null, '无记录 ⇒ active=null');
  assert.deepEqual(view.revisions, []);
  assert.equal(view.seq, 0);
  assert.equal(view.can_start.ok, true);
  assert.equal(view.edit_days, 30);
  assert.deepEqual(view.can_start, { ok: true, reason: 'first', next_start_at: '' });

  // 让 jiapu_revisions 集合「不可用」：集合文件换成目录 ⇒ 读/写盘必失败（模拟云端集合尚未创建）
  const colFile = path.join(TMP, 'collections', `${REV.REVISION_COL}.json`);
  fs.rmSync(colFile, { recursive: true, force: true });
  fs.mkdirSync(colFile, { recursive: true });

  // 读：仍返空态、绝不抛（容错读）
  const v = await REV.getRevisionView(BROKE_TREE, new Date('2026-01-01T00:00:00Z'));
  assert.equal(v.active, null);
  assert.deepEqual(v.revisions, []);

  // 写：仍失败（不得静默成功 / 不得 200），错误状态 503、文案可读、不裸泄 EISDIR/ENOENT 等底层原文。
  //   ⚠️ 用**有余额且从未有过记录**的账号（D2_STEWARD / D2_TREE）：precharge 成功后才走到落库 ⇒ 才能验到 503
  //   （若该树进程内已有记录，会先被 409 拦下，验不到写路径）。
  const balBefore = await sumOf(D2_STEWARD);
  await assert.rejects(
    () => REV.startRevision({ treeId: D2_TREE, phone: D2_STEWARD, role: 'tree_steward', now: new Date('2026-01-01T00:00:00Z') }),
    (e) => e.status === 503 && /修譜集合尚未就緒/.test(e.message) && !/EISDIR|ENOENT|ENOTDIR|EACCES|open '/.test(e.message),
    '集合不可用 ⇒ 写入 503 可读文案',
  );
  assert.equal(await sumOf(D2_STEWARD), balBefore, '落库失败 ⇒ 原路全额返还（系统原因例外）');
});

// ══ 附 沙箱自证 ═════════════════════════════════════════════════════════════════
test('附 沙箱自证：测试根在 /tmp 副本，未触真源', () => {
  assert.ok(TMP.startsWith(os.tmpdir()), '测试根必须是 /tmp 副本');
  assert.equal(store.PATHS.out, TMP);
  assert.equal(store.PATHS.metaFile, path.join(TMP, 'tree-meta.json'));
});
