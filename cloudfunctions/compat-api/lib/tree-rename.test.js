/**
 * 谱名改名域单测（`lib/tree-rename.test.js`）— node:test 体例
 *
 * 数据安全：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本
 * （绝不写 `config/` 与 `migrate-output/` 真源；文末另断言真源 `config/tree-meta.json` 逐字节未变）。
 *
 * 覆盖（Kevin 2026-10-12 拍定 · 冻结契约硬清单）：
 *   ① 计费矩阵（纯函数穷举）：首次 / `days>=360` ⇒ 999；`30<=days<360` ⇒ 9999；`days<30` ⇒ 99999；
 *      自然日**向上取整**边界（29.5 天 ⇒ 30 ⇒ 9999；359.5 天 ⇒ 360 ⇒ 999）· 常量逐字
 *   ② 谱名校验：非字符串 / 空 / 纯空白 ⇒ 400；31 码点 ⇒ 400；30 码点放行；`trim` 生效
 *   ③ 首次改名（无历史）⇒ 999 + `tier='first_or_expired'` + 写 `genealogy_name` 与
 *      `genealogy_name_updated_at` + 扣 999 片 + 恰 1 笔 `edit_fee` 流水 + 恰 1 条留痕
 *   ④ 四档实走（首次 / 29 天 / 30 天 / 359 天 / 360 天）各自 pieces 与 tier
 *   ⑤ **no-op（与现值相同）**⇒ `fee.pieces === 0`、不扣（资产与流水一字不变）、meta 文件逐字节未变、
 *      **不推进 `genealogy_name_updated_at`**、不记流水、不留痕
 *   ⑥ 权限（复用修谱域唯一判据）：本树 `tree_steward` 200；异树 `tree_steward` 403；
 *      `chief_editor` 任意树 200；`user` / `branch_curator` / `guest` 一律 403
 *   ⑦ 不足 ⇒ 409 `ASSET_INSUFFICIENT`（`need` / `current` / `unit` / `how_to_get`）+ **元数据一字不写**
 *      （`genealogy_name` 与 `genealogy_name_updated_at` 均未变）+ 无流水
 *   ⑧ 留痕：实扣 ⇒ 恰 1 条且字段逐字（`op` / `tree_id` / `operator` / `amount_pieces` / `tx_id` / `created_at`）；
 *      日志写失败 ⇒ 主流程照常成功（扣费 / 落盘一字不变）+ 出参 `log_warning === true`（**本用例物理上排最后**）
 *   ⑨ 读面 `decorateTreeMetaForRead`：每树新增两键（只增不改）、无历史 ⇒ 999、有历史按同一矩阵、
 *      **入参对象不被就地修改**（local 模式 `getMeta()` 返回的即进程内缓存，就地改 = 污染缓存）
 *   ⑩ 路由级：`GET /tree-meta` 新字段原文；`PUT /tree-meta` 携带不同 `genealogy_name` ⇒ 400 逐字文案、
 *      与其值相同 ⇒ 忽略（其余字段照写）；`POST /admin/tree-rename` 无 token ⇒ 401、
 *      no-op ⇒ 200 `fee.pieces:0`、真改 ⇒ 200 `fee.pieces:999` + 落库 + 留痕
 *   ⑪ 真源零写入：`config/tree-meta.json` 跑测前后 md5 一致
 *
 * 运行：node --test cloudfunctions/compat-api/lib/tree-rename.test.js
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
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaMd5 = fs.existsSync(REAL_META) ? md5(REAL_META) : '(缺失)';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiapu-tree-rename-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const TRN = await import('./tree-rename.js');
const store = await import('./store.js');
const ledger = await import('./economy-ledger.js');
const eco = await import('./economy-fee.js');
const OPS = await import('./economy-ops.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ══ 夹具：meta 副本 + 树 + 锚点 + 竹片 ══════════════════════════════════════════
const DAY = 86400000;
const NOW = new Date('2026-10-12T00:00:00.000Z');
const at = (ms) => new Date(NOW.getTime() - ms).toISOString();
const DAYS = (n) => at(n * DAY);

const T_FIRST = 'rn_first_tree'; // 首次（无 genealogy_name_updated_at）
const T_D29 = 'rn_d29_tree'; // Δ = 29 天 ⇒ 99999
const T_D30 = 'rn_d30_tree'; // Δ = 30 天 ⇒ 9999
const T_D359 = 'rn_d359_tree'; // Δ = 359 天 ⇒ 9999
const T_D360 = 'rn_d360_tree'; // Δ = 360 天 ⇒ 999（过期档）
const T_CEIL = 'rn_ceil_tree'; // Δ = 29.5 天 ⇒ ceil 30 ⇒ 9999
const T_NOOP = 'rn_noop_tree'; // no-op
const T_POOR = 'rn_poor_tree'; // 余额不足
const T_OWN = 'rn_own_tree'; // 路由级：本树可写
const T_OTHER = 'rn_other_tree'; // 跨树 403 的目标他树

const treeMeta = (tree_id, extra = {}) => ({ tree_id, kind: 'family', display_title: `测试树 ${tree_id}`, genealogy_name: '', ...extra });
const FIXTURE = {
  _schema: '1.1',
  trees: {
    [T_FIRST]: treeMeta(T_FIRST),
    [T_D29]: treeMeta(T_D29, { genealogy_name: '舊名二十九', genealogy_name_updated_at: DAYS(29) }),
    [T_D30]: treeMeta(T_D30, { genealogy_name: '舊名三十', genealogy_name_updated_at: DAYS(30) }),
    [T_D359]: treeMeta(T_D359, { genealogy_name: '舊名三五九', genealogy_name_updated_at: DAYS(359) }),
    [T_D360]: treeMeta(T_D360, { genealogy_name: '舊名三六零', genealogy_name_updated_at: DAYS(360) }),
    [T_CEIL]: treeMeta(T_CEIL, { genealogy_name: '舊名小數', genealogy_name_updated_at: at(29.5 * DAY) }),
    [T_NOOP]: treeMeta(T_NOOP, { genealogy_name: '原有譜名' }),
    [T_POOR]: treeMeta(T_POOR),
    [T_OWN]: treeMeta(T_OWN, { genealogy_name: '本樹原名' }),
    [T_OTHER]: treeMeta(T_OTHER, { genealogy_name: '他樹譜名' }),
  },
};
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'tree-meta.json'), JSON.stringify(FIXTURE, null, 2) + '\n');
for (const id of Object.keys(FIXTURE.trees)) {
  fs.writeFileSync(path.join(TMP, 'trees', `${id}.json`), JSON.stringify({ tree_id: id, version: 1, people: {}, families: {} }));
}

const CHEF = '13700000000';
const FIRST_STEWARD = '13710000001';
const D29_STEWARD = '13710000002';
const D30_STEWARD = '13710000003';
const D359_STEWARD = '13710000004';
const D360_STEWARD = '13710000005';
const CEIL_STEWARD = '13710000006';
const NOOP_STEWARD = '13710000007';
const POOR_STEWARD = '13710000008';
const OWN_STEWARD = '13710000009';
const OTHER_STEWARD = '13710000010';
const mkAnchor = (phone, treeId) =>
  store.colSet('jiapu_anchors', phone, { tree_id: treeId, person_handle: 'h1', updated_at: NOW.toISOString() });
await mkAnchor(FIRST_STEWARD, T_FIRST);
await mkAnchor(D29_STEWARD, T_D29);
await mkAnchor(D30_STEWARD, T_D30);
await mkAnchor(D359_STEWARD, T_D359);
await mkAnchor(D360_STEWARD, T_D360);
await mkAnchor(CEIL_STEWARD, T_CEIL);
await mkAnchor(NOOP_STEWARD, T_NOOP);
await mkAnchor(POOR_STEWARD, T_POOR);
await mkAnchor(OWN_STEWARD, T_OWN);
await mkAnchor(OTHER_STEWARD, T_OTHER); // 异树主理人（锚点在 T_OTHER）
// 竹片：不足档位的一档只给 10 片（`current` 有真值可断），其余给足
for (const p of [CHEF, FIRST_STEWARD, D29_STEWARD, D30_STEWARD, D359_STEWARD, D360_STEWARD, CEIL_STEWARD, NOOP_STEWARD, OWN_STEWARD, OTHER_STEWARD]) {
  await ledger.withAssets(p, (u) => ledger.addLot(u, 'bamboo', 300000, { source: 'test' }));
}
await ledger.withAssets(POOR_STEWARD, (u) => ledger.addLot(u, 'bamboo', 10, { source: 'test' }));

const bamboos = async (phone) => ledger.sumLots((await ledger.getAssets(phone)).bamboos);
const editTxs = async (phone) => (await ledger.getAssets(phone)).txs.filter((t) => t.type === 'edit_fee');
/** 留痕集合全量读取（每笔一档） */
const opsLogsAll = async () => store.listAll(OPS.OPS_LOGS_COL);
const metaBytes = () => fs.readFileSync(path.join(TMP, 'tree-meta.json'), 'utf8');
const metaEntry = (treeId) => JSON.parse(metaBytes()).trees[treeId];

// ══ ① 计费矩阵（纯函数穷举 + 常量逐字） ════════════════════════════════════════
test('① 计费矩阵：首次 / >=360 天 ⇒ 999；30<=days<360 ⇒ 9999；days<30 ⇒ 99999；日界向上取整；常量逐字', () => {
  // 常量（单点定义，逐字）
  assert.equal(TRN.TREE_RENAME_FEE_FIRST_OR_EXPIRED, 999);
  assert.equal(TRN.TREE_RENAME_FEE_WITHIN_360D, 9999);
  assert.equal(TRN.TREE_RENAME_FEE_WITHIN_30D, 99999);
  assert.equal(TRN.TREE_RENAME_EXPIRED_DAYS, 360);
  assert.equal(TRN.TREE_RENAME_WITHIN_30D_MAX_DAYS, 30);
  assert.equal(TRN.TREE_RENAME_MAX_NAME_LEN, 30);
  assert.equal(TRN.TREE_RENAME_TIER_FIRST_OR_EXPIRED, 'first_or_expired');
  assert.equal(TRN.TREE_RENAME_TIER_WITHIN_360D, 'within_360d');
  assert.equal(TRN.TREE_RENAME_TIER_WITHIN_30D, 'within_30d');
  assert.equal(TRN.TREE_RENAME_OP, 'tree_rename_fee');
  assert.equal(TRN.TREE_RENAME_TX_TYPE, 'edit_fee');
  assert.equal(TRN.TREE_RENAME_HINT, '請使用【修改譜名】修改譜名');

  // 首次（无历史 / 不可解析）⇒ 999 first_or_expired（**不得按 0 天算成最贵档**）
  for (const v of [undefined, null, '', 'not-a-date']) {
    const f = TRN.renameFeeOf(v, NOW);
    assert.equal(f.pieces, 999, `无历史(${String(v)}) 应 999`);
    assert.equal(f.tier, 'first_or_expired');
    assert.equal(f.days, null);
  }

  // 天数边界（逐点）
  const cases = [
    [0, 99999, 'within_30d'],
    [1, 99999, 'within_30d'],
    [29, 99999, 'within_30d'],
    [30, 9999, 'within_360d'],
    [31, 9999, 'within_360d'],
    [359, 9999, 'within_360d'],
    [360, 999, 'first_or_expired'],
    [361, 999, 'first_or_expired'],
    [5000, 999, 'first_or_expired'],
  ];
  for (const [d, pieces, tier] of cases) {
    const f = TRN.renameFeeOf(at(d * DAY), NOW);
    assert.equal(f.days, d, `days 应为 ${d}`);
    assert.equal(f.pieces, pieces, `days=${d} 应 ${pieces} 片`);
    assert.equal(f.tier, tier, `days=${d} 档位`);
  }
  // 自然日**向上取整**（同修谱体例）：29.5 天 ⇒ 30 ⇒ 9999；359.5 天 ⇒ 360 ⇒ 999
  assert.equal(TRN.renameDaysSince(at(29.5 * DAY), NOW), 30);
  assert.equal(TRN.renameFeeOf(at(29.5 * DAY), NOW).pieces, 9999);
  assert.equal(TRN.renameDaysSince(at(359.5 * DAY), NOW), 360);
  assert.equal(TRN.renameFeeOf(at(359.5 * DAY), NOW).pieces, 999);
});

// ══ ② 谱名校验 ═══════════════════════════════════════════════════════════════════
test('② 谱名校验：非字符串 / 空 / 纯空白 / 31 码点 ⇒ 400；30 码点放行；trim 生效', () => {
  for (const bad of [undefined, null, 123, {}, [], true]) {
    assert.throws(() => TRN.normalizeGenealogyName(bad), (e) => e.status === 400, `非字符串应 400：${String(bad)}`);
  }
  for (const bad of ['', '   ', '\t\n ']) {
    assert.throws(() => TRN.normalizeGenealogyName(bad), (e) => e.status === 400 && e.message === '譜名不得為空');
  }
  const ok30 = '甲'.repeat(30);
  assert.equal(TRN.normalizeGenealogyName(ok30), ok30, '30 个字符放行');
  assert.throws(
    () => TRN.normalizeGenealogyName('甲'.repeat(31)),
    (e) => e.status === 400 && e.message === `譜名不得超過 30 個字符`,
    '31 个字符 ⇒ 400（按码点计）',
  );
  assert.equal(TRN.normalizeGenealogyName('  顧氏家譜  '), '顧氏家譜', 'trim 生效');
  // 字面同一性判据（no-op 唯一判据）
  assert.equal(TRN.sameGenealogyName(' abc ', 'abc'), true);
  assert.equal(TRN.sameGenealogyName('abc', 'abd'), false);
  assert.equal(TRN.sameGenealogyName(undefined, ''), true);
});

// ══ ③ 首次改名（无历史）⇒ 999 + 写 meta + 扣费 + 留痕 ═══════════════════════════
test('③ 首次改名（无历史）：999 片 / first_or_expired / 写 genealogy_name+更新时间戳 / 1 笔 edit_fee / 1 条留痕', async () => {
  const before = await bamboos(FIRST_STEWARD);
  const logBefore = new Set((await opsLogsAll()).map((d) => d._id));
  const r = await TRN.renameTreeGenealogy({
    treeId: T_FIRST,
    genealogyName: '  顧氏家譜  ',
    role: 'tree_steward',
    phone: FIRST_STEWARD,
    now: NOW,
  });
  assert.equal(r.ok, true);
  assert.equal(r.tree_id, T_FIRST);
  assert.equal(r.genealogy_name, '顧氏家譜', '出参 = trim 后的新值');
  assert.deepEqual(r.fee, { pieces: 999, tier: 'first_or_expired' });
  assert.equal(r.log_warning, undefined, '留痕成功 ⇒ 不出 log_warning 键');

  // 扣费：999 片 + 恰 1 笔 edit_fee 流水
  assert.equal(await bamboos(FIRST_STEWARD), before - 999);
  const txs = await editTxs(FIRST_STEWARD);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].delta.bamboos, -999);
  assert.equal(txs[0].type, 'edit_fee', '流水类型沿用既有 edit_fee（不新增 Tx.type）');
  assert.equal(txs[0].ref.tree_id, T_FIRST);

  // 写面：genealogy_name + genealogy_name_updated_at = now(ISO)
  const e = metaEntry(T_FIRST);
  assert.equal(e.genealogy_name, '顧氏家譜');
  assert.equal(e.genealogy_name_updated_at, NOW.toISOString());

  // 留痕：恰 1 条，字段逐字
  const fresh = (await opsLogsAll()).filter((d) => !logBefore.has(d._id));
  assert.equal(fresh.length, 1, '实扣 ⇒ 恰新增 1 条留痕');
  const log = fresh[0];
  assert.equal(log.op, 'tree_rename_fee');
  assert.equal(log.tree_id, T_FIRST);
  assert.equal(log.operator, FIRST_STEWARD);
  assert.equal(log.amount_pieces, 999);
  assert.equal(log.tx_id, txs[0].id);
  assert.equal(log.created_at, NOW.toISOString());
  assert.equal(log.ts, log.created_at, 'ts = 排序键，与 created_at 同源');
});

// ══ ④ 四档实走（29 / 30 / 359 / 360 天） ═══════════════════════════════════════
test('④ 阶梯实走：Δ=29 天 ⇒ 99999；30 天 / 359 天 / 29.5 天 ⇒ 9999；360 天 ⇒ 999（过期档）', async () => {
  const runs = [
    [T_D29, D29_STEWARD, '二十九改名', 99999, 'within_30d'],
    [T_D30, D30_STEWARD, '三十改名', 9999, 'within_360d'],
    [T_D359, D359_STEWARD, '三五九改名', 9999, 'within_360d'],
    [T_CEIL, CEIL_STEWARD, '小數改名', 9999, 'within_360d'],
    [T_D360, D360_STEWARD, '三六零改名', 999, 'first_or_expired'],
  ];
  for (const [treeId, phone, name, pieces, tier] of runs) {
    const before = await bamboos(phone);
    const r = await TRN.renameTreeGenealogy({ treeId, genealogyName: name, role: 'tree_steward', phone, now: NOW });
    assert.deepEqual(r.fee, { pieces, tier }, `${treeId} 应 ${pieces} 片 / ${tier}`);
    assert.equal(await bamboos(phone), before - pieces, `${treeId} 实扣 ${pieces}`);
    assert.equal(metaEntry(treeId).genealogy_name, name);
    assert.equal(metaEntry(treeId).genealogy_name_updated_at, NOW.toISOString(), '改名同时推进时间戳');
  }
});

// ══ ⑤ no-op（与现值相同）⇒ 0 片、不写、不记流水、不推进时间戳 ════════════════════
test('⑤ no-op：fee.pieces = 0、不扣、meta 文件逐字节未变、不推进 genealogy_name_updated_at、不留痕', async () => {
  const before = await bamboos(NOOP_STEWARD);
  const txBefore = (await ledger.getAssets(NOOP_STEWARD)).txs.length;
  const logBefore = (await opsLogsAll()).length;
  const bytesBefore = metaBytes();
  const entryBefore = metaEntry(T_NOOP);
  assert.equal(entryBefore.genealogy_name_updated_at, undefined, '夹具：该树无历史');

  const r = await TRN.renameTreeGenealogy({
    treeId: T_NOOP,
    genealogyName: ' 原有譜名 ', // trim 后与现值相同 ⇒ no-op
    role: 'tree_steward',
    phone: NOOP_STEWARD,
    now: NOW,
  });
  assert.equal(r.ok, true);
  assert.equal(r.genealogy_name, '原有譜名');
  assert.equal(r.fee.pieces, 0, 'no-op ⇒ 0 片');
  assert.equal(r.fee.tier, 'first_or_expired', '档位仍按矩阵算（供前端显示），但 pieces 置 0');

  assert.equal(await bamboos(NOOP_STEWARD), before, '未扣费');
  assert.equal((await ledger.getAssets(NOOP_STEWARD)).txs.length, txBefore, '未写流水');
  assert.equal(metaBytes(), bytesBefore, 'meta 文件逐字节未变（不写、不推进时间戳）');
  assert.equal(metaEntry(T_NOOP).genealogy_name_updated_at, undefined, 'genealogy_name_updated_at 未被推进');
  assert.equal((await opsLogsAll()).length, logBefore, 'no-op 不留痕');
});

// ══ ⑥ 权限（唯一判据 = 本树主理人锚点 / chief 恒放行） ═══════════════════════════
test('⑥ 权限：本树 tree_steward 放行；异树 tree_steward 403；chief 任意树放行；user/branch_curator/guest 403', async () => {
  // 异树主理人（锚点在 T_OTHER）打 T_FIRST ⇒ 403 且**不扣费、不写**
  const bytes = metaBytes();
  const before = await bamboos(OTHER_STEWARD);
  await assert.rejects(
    TRN.renameTreeGenealogy({ treeId: T_FIRST, genealogyName: '他樹改名', role: 'tree_steward', phone: OTHER_STEWARD, now: NOW }),
    (e) => e.status === 403,
  );
  assert.equal(metaBytes(), bytes, '越树被拒 ⇒ 元数据一字不写');
  assert.equal(await bamboos(OTHER_STEWARD), before, '越树被拒 ⇒ 不扣费');

  // 档位不足 / 无锚点
  for (const role of ['guest', 'user', 'branch_curator']) {
    await assert.rejects(
      TRN.renameTreeGenealogy({ treeId: T_FIRST, genealogyName: '低檔改名', role, phone: OTHER_STEWARD, now: NOW }),
      (e) => e.status === 403,
      `${role} 应 403`,
    );
  }
  await assert.rejects(
    TRN.renameTreeGenealogy({ treeId: T_FIRST, genealogyName: '無錨改名', role: 'tree_steward', phone: '13799999999', now: NOW }),
    (e) => e.status === 403,
    '无锚点的 tree_steward 应 403',
  );

  // chief_editor：任意树放行（并**按同一路径扣费**）
  const chefBefore = await bamboos(CHEF);
  const r = await TRN.renameTreeGenealogy({ treeId: T_OTHER, genealogyName: '他樹新譜名', role: 'chief_editor', phone: CHEF, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.fee.pieces, 999, 'T_OTHER 无历史 ⇒ 999（chief 同价，无特例）');
  assert.equal(await bamboos(CHEF), chefBefore - 999);
  assert.equal(metaEntry(T_OTHER).genealogy_name, '他樹新譜名');
});

// ══ ⑦ 不足 ⇒ 409 ASSET_INSUFFICIENT 整单拒绝（元数据一字不写） ══════════════════
test('⑦ 竹片不足 ⇒ 409 ASSET_INSUFFICIENT（need/current/unit/how_to_get）· 元数据一字不写 · 无流水', async () => {
  const bytes = metaBytes();
  const txBefore = (await ledger.getAssets(POOR_STEWARD)).txs.length;
  const logBefore = (await opsLogsAll()).length;
  let err = null;
  try {
    await TRN.renameTreeGenealogy({ treeId: T_POOR, genealogyName: '窮樹改名', role: 'tree_steward', phone: POOR_STEWARD, now: NOW });
  } catch (e) {
    err = e;
  }
  assert.ok(err, '必须抛错');
  assert.equal(err.status, 409);
  assert.equal(err.code, 'ASSET_INSUFFICIENT');
  const body = eco.errorPayload(err, {});
  assert.equal(body.code, 'ASSET_INSUFFICIENT');
  assert.equal(body.need, 999);
  assert.equal(body.current, 10);
  assert.equal(body.unit, 'bamboos');
  assert.ok(Array.isArray(body.how_to_get) && body.how_to_get.length > 0, 'how_to_get 非空');

  assert.equal(await bamboos(POOR_STEWARD), 10, '整单拒绝 ⇒ 一字节不扣');
  assert.equal((await ledger.getAssets(POOR_STEWARD)).txs.length, txBefore, '无流水');
  assert.equal(metaBytes(), bytes, '元数据一字不写（不先写后扣）');
  assert.equal((await opsLogsAll()).length, logBefore, '不留痕');
});

// ══ ⑨ 读面（只增不改） ═══════════════════════════════════════════════════════════
test('⑨ 读面 decorateTreeMetaForRead：每树新增 genealogy_name_updated_at + rename_fee_pieces（只增不改 / 不就地改）', async () => {
  const meta = await store.getMeta();
  const beforeStr = JSON.stringify(meta);
  const view = TRN.decorateTreeMetaForRead(meta, NOW);

  // ① 真实 meta：每树 entry 均新增两键；原 entry 的每个键值原样透传（只增不改）
  for (const [key, entry] of Object.entries(meta.trees)) {
    const v = view.trees[key];
    assert.ok(v, `view 保留树 ${key}`);
    assert.ok('genealogy_name_updated_at' in v, `${key} 新增 genealogy_name_updated_at`);
    assert.ok('rename_fee_pieces' in v, `${key} 新增 rename_fee_pieces`);
    for (const [k, val] of Object.entries(entry)) assert.deepEqual(v[k], val, `${key}.${k} 未被改`);
  }
  assert.equal(view.trees[T_POOR].rename_fee_pieces, 999, '未被任何用例改过 ⇒ 无历史 ⇒ 999');
  assert.equal(view.trees[T_POOR].genealogy_name_updated_at, null, '无历史 ⇒ null（不是空串 / 缺键）');
  assert.equal(JSON.stringify(meta), beforeStr, '入参 meta **不得被就地修改**（local 模式它是进程内缓存）');

  // ② 合成 meta：逐档对价（不依赖前面用例改过的真实 fixture）
  const synthetic = {
    _schema: '1.1',
    trees: {
      s_first: treeMeta('s_first'),
      s_29: treeMeta('s_29', { genealogy_name_updated_at: DAYS(29) }),
      s_30: treeMeta('s_30', { genealogy_name_updated_at: DAYS(30) }),
      s_359: treeMeta('s_359', { genealogy_name_updated_at: DAYS(359) }),
      s_360: treeMeta('s_360', { genealogy_name_updated_at: DAYS(360) }),
      s_ceil: treeMeta('s_ceil', { genealogy_name_updated_at: at(29.5 * DAY) }),
    },
  };
  const sv = TRN.decorateTreeMetaForRead(synthetic, NOW);
  assert.equal(sv.trees.s_first.rename_fee_pieces, 999, '首次（无历史）⇒ 999');
  assert.equal(sv.trees.s_29.rename_fee_pieces, 99999, 'Δ=29 天 ⇒ 99999');
  assert.equal(sv.trees.s_30.rename_fee_pieces, 9999, 'Δ=30 天 ⇒ 9999');
  assert.equal(sv.trees.s_359.rename_fee_pieces, 9999, 'Δ=359 天 ⇒ 9999');
  assert.equal(sv.trees.s_360.rename_fee_pieces, 999, 'Δ=360 天 ⇒ 999（过期档）');
  assert.equal(sv.trees.s_ceil.rename_fee_pieces, 9999, 'Δ=29.5 天 ⇒ ceil 30 ⇒ 9999');
  assert.equal(sv.trees.s_30.genealogy_name_updated_at, DAYS(30), '有历史 ⇒ 原样回显 ISO');
  assert.equal(sv.trees.s_first.genealogy_name_updated_at, null);
  assert.equal(synthetic.trees.s_first.genealogy_name_updated_at, undefined, '合成入参也不被就地改');
});

// ══ ⑩ 路由级（handleRequest · local 副本） ═══════════════════════════════════════
test('⑩ 路由级：GET /tree-meta 新字段 / PUT /tree-meta 谱名 400 拦截 / POST /admin/tree-rename 401·no-op·真改', async () => {
  const ROUTE_TREE = T_OWN;
  const ROUTE_PHONE = OWN_STEWARD;
  // 用户档（authUser 从 jiapu_users 读角色）
  await store.colSet('jiapu_users', ROUTE_PHONE, { phone: ROUTE_PHONE, nickname: '本树主理人', role: 'tree_steward' });
  await store.colSet('jiapu_users', CHEF, { phone: CHEF, nickname: '总编辑', role: 'chief_editor' });
  const token = signJwt({ sub: ROUTE_PHONE, phone: ROUTE_PHONE, role: 'tree_steward' }, 3600);
  const chefToken = signJwt({ sub: CHEF, phone: CHEF, role: 'chief_editor' }, 3600);

  // ⑩-1 GET /tree-meta：每树 entry 新增两键（原文）
  const getRes = await handleRequest({ path: '/tree-meta', httpMethod: 'GET', headers: {} });
  assert.equal(getRes.statusCode, 200);
  const metaBody = JSON.parse(getRes.body);
  const ownEntry = metaBody.trees[ROUTE_TREE];
  assert.equal(ownEntry.genealogy_name_updated_at, null);
  assert.equal(ownEntry.genealogy_name, '本樹原名');
  assert.equal(ownEntry.rename_fee_pieces, 999, '无历史 ⇒ 999（服务端算，前端不得重算）');
  for (const e of Object.values(metaBody.trees)) {
    assert.ok('genealogy_name_updated_at' in e && 'rename_fee_pieces' in e, '每树 entry 均新增两键');
  }

  // ⑩-2 PUT /tree-meta 携带**不同** genealogy_name ⇒ 400（文案逐字）
  const put400 = await handleRequest({
    path: '/tree-meta',
    httpMethod: 'PUT',
    headers: { authorization: `Bearer ${chefToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree_id: ROUTE_TREE, genealogy_name: '不許走這條路' }),
  });
  assert.equal(put400.statusCode, 400);
  assert.equal(JSON.parse(put400.body).error, '請使用【修改譜名】修改譜名');
  assert.equal(metaEntry(ROUTE_TREE).genealogy_name, '本樹原名', '被拦 ⇒ 一字未写');

  // ⑩-3 PUT /tree-meta 携带**相同** genealogy_name ⇒ 忽略；其余字段照写
  const put200 = await handleRequest({
    path: '/tree-meta',
    httpMethod: 'PUT',
    headers: { authorization: `Bearer ${chefToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree_id: ROUTE_TREE, genealogy_name: '本樹原名', display_title: '改名路由测试树（改标题）' }),
  });
  assert.equal(put200.statusCode, 200, '与其值相同 ⇒ 忽略、不报错');
  assert.equal(metaEntry(ROUTE_TREE).display_title, '改名路由测试树（改标题）', '其余字段行为一字不改');
  assert.equal(metaEntry(ROUTE_TREE).genealogy_name, '本樹原名');

  // ⑩-4 POST /admin/tree-rename 未带 token ⇒ 401
  const noToken = await handleRequest({
    path: '/admin/tree-rename',
    httpMethod: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree_id: ROUTE_TREE, genealogy_name: '未登錄改名' }),
  });
  assert.equal(noToken.statusCode, 401);
  assert.equal(metaEntry(ROUTE_TREE).genealogy_name, '本樹原名', '未登录 ⇒ 一字未写');

  // ⑩-5 POST /admin/tree-rename no-op（与现值相同）⇒ 200 + fee.pieces 0
  const noopRes = await handleRequest({
    path: '/admin/tree-rename',
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree_id: ROUTE_TREE, genealogy_name: '本樹原名' }),
  });
  assert.equal(noopRes.statusCode, 200);
  const noopBody = JSON.parse(noopRes.body);
  assert.equal(noopBody.ok, true);
  assert.equal(noopBody.tree_id, ROUTE_TREE);
  assert.equal(noopBody.genealogy_name, '本樹原名');
  assert.equal(noopBody.fee.pieces, 0);
  assert.ok(['first_or_expired', 'within_360d', 'within_30d'].includes(noopBody.fee.tier));

  // ⑩-5′ 空谱名 ⇒ 400（非空校验先于 no-op：空值永远不是合法改名请求）
  const emptyRes = await handleRequest({
    path: '/admin/tree-rename',
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree_id: ROUTE_TREE, genealogy_name: '   ' }),
  });
  assert.equal(emptyRes.statusCode, 400);
  assert.equal(JSON.parse(emptyRes.body).error, '譜名不得為空');

  // ⑩-6 POST /admin/tree-rename 真改 ⇒ 200 + 999 + 落库 + 留痕 + 出参键集逐字
  const logBefore = new Set((await opsLogsAll()).map((d) => d._id));
  const balBefore = await bamboos(ROUTE_PHONE);
  const okRes = await handleRequest({
    path: '/admin/tree-rename',
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree_id: ROUTE_TREE, genealogy_name: '本樹新譜名' }),
  });
  assert.equal(okRes.statusCode, 200);
  const okBody = JSON.parse(okRes.body);
  assert.deepEqual(Object.keys(okBody).sort(), ['fee', 'genealogy_name', 'ok', 'tree_id'], '出参键集逐字（成功路径无 log_warning）');
  assert.deepEqual(okBody.fee, { pieces: 999, tier: 'first_or_expired' });
  assert.equal(okBody.genealogy_name, '本樹新譜名');
  assert.equal(metaEntry(ROUTE_TREE).genealogy_name, '本樹新譜名');
  assert.ok(metaEntry(ROUTE_TREE).genealogy_name_updated_at, '时间戳已写');
  assert.equal(await bamboos(ROUTE_PHONE), balBefore - 999);
  assert.equal((await opsLogsAll()).filter((d) => !logBefore.has(d._id)).length, 1, '实扣 ⇒ 1 条留痕');

  // ⑩-7 GET /tree-meta 回读：时间戳有值、价目转 99999（刚改过 ⇒ Δ<30 天）
  const after = JSON.parse((await handleRequest({ path: '/tree-meta', httpMethod: 'GET', headers: {} })).body);
  assert.equal(after.trees[ROUTE_TREE].genealogy_name, '本樹新譜名');
  assert.equal(after.trees[ROUTE_TREE].rename_fee_pieces, 99999, '刚改过 ⇒ 近改档 99999');
  assert.ok(after.trees[ROUTE_TREE].genealogy_name_updated_at);

  // ⑩-8 校验失败：超长 ⇒ 400（且不扣费）
  const bal2 = await bamboos(ROUTE_PHONE);
  const longRes = await handleRequest({
    path: '/admin/tree-rename',
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree_id: ROUTE_TREE, genealogy_name: '甲'.repeat(31) }),
  });
  assert.equal(longRes.statusCode, 400);
  assert.equal(await bamboos(ROUTE_PHONE), bal2, '校验失败 ⇒ 不扣费');
});

// ══ ⑪ 真源零写入 ═════════════════════════════════════════════════════════════════
test('⑪ 真源零写入：config/tree-meta.json 跑测前后 md5 逐字节一致', () => {
  assert.equal(fs.existsSync(REAL_META) ? md5(REAL_META) : '(缺失)', realMetaMd5, '真实 config/tree-meta.json 被改动了');
});

// ══ ⑧ 留痕失败不阻断（best-effort）—— **物理上排最后**：本用例把日志集合文件换成目录 ═══
test('⑧ 留痕失败不阻断：日志集合写失败 ⇒ 主流程照常成功（扣费/落盘一字不变）+ 出参 log_warning === true', async () => {
  // 造**真 IO 失败**（把 `collections/jiapu_ops_logs.json` 换成目录），用于验「失败仍不阻断 + 出参警示」。
  // ⚠️ 本用例之后不得再有依赖 `jiapu_ops_logs` 的读写（故排最后）。
  const logFile = path.join(TMP, 'collections', `${OPS.OPS_LOGS_COL}.json`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  if (fs.existsSync(logFile)) fs.rmSync(logFile, { force: true });
  fs.mkdirSync(logFile, { recursive: true });

  const phone = FIRST_STEWARD;
  const balBefore = await bamboos(phone);
  const r = await TRN.renameTreeGenealogy({
    treeId: T_FIRST,
    genealogyName: '留痕失敗仍改名',
    role: 'tree_steward',
    phone,
    now: new Date(NOW.getTime() + DAY), // Δ=1 天 ⇒ 99999
  });
  assert.equal(r.ok, true, '留痕失败不得阻断主流程');
  assert.equal(r.fee.pieces, 99999);
  assert.equal(r.log_warning, true, '留痕失败必须出 log_warning:true（绝不静默）');
  assert.equal(await bamboos(phone), balBefore - 99999, '扣费一字不变');
  assert.equal(metaEntry(T_FIRST).genealogy_name, '留痕失敗仍改名', '落盘一字不变');
});
