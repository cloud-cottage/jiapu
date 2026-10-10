/**
 * 带色称号 — 后端**字段级**写权限校验 单测（批 1b-1）
 * 契约 = `docs/person-badge.spec.md` **§5 权限（字段级）**（唯一权威）。
 *
 * 规则（本单）：
 *   PUT /people/<handle> 的请求体 `attribute_list` **含** `称号` / `称号色` 时：
 *     - 总谱 `zhonghua` ⇒ **仅 `chief_editor`**（与 `requireWriteUser` 既有总谱口径一致）；
 *     - 普通树 / 祖谱 ⇒ 需 `tree_steward`（含 `chief_editor`）；
 *     - 不足 ⇒ **403**，且**拦在扣费之前**（不扣费、不写库、零资产流水）。
 *
 * 覆盖（4 例 + 纯函数判定表）：
 *   ⓪ `lib/badge-guard.js` 纯函数判定表（普通树 / 总谱 × 全角色；字段存在性三形态）
 *   ① 普通树 `tree_steward` 带 `称号` ⇒ **200**（真扣 1 片、称号落详情）
 *   ② 普通树 `user`（可编辑本节点）带 `称号` ⇒ **403** + **零资产流水**（资产文件 md5 不变 / 树 / 详情字节不变）
 *   ③ 总谱非 chief 带 `称号` ⇒ **403** + 零资产流水
 *   ④ 不带 `称号` 的普通编辑 ⇒ **200**（回归：其它字段权限不变）
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（同 noop-edit-integrity.test.js 模式）。
 * 运行：node --test cloudfunctions/compat-api/lib/badge-permission.test.js
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
const REAL_OUT = process.env.COMPAT_REAL_OUT || path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-badge-perm-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaMd5 = md5(REAL_META);
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

// ---- 副本 tree-meta（含总谱 zhonghua） ----

const TREES = {
  bg_family: { tree_id: 'bg_family', kind: 'family', display_title: '甲氏（带色称号字段权限）' },
  bg_plain: { tree_id: 'bg_plain', kind: 'family', display_title: '乙氏（无称号回归）' },
  zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, display_title: '中华世本总谱' },
};
fs.writeFileSync(process.env.COMPAT_META_FILE, JSON.stringify({ _schema: '1.1', trees: TREES }, null, 2) + '\n');

// ---- 用户 / 锚点 / 资产 ----

const STEWARD = '16600009301'; // tree_steward（普通树全写）
const USER1 = '16600009302'; // user（仅本人及向下；锚点 = 目标节点 ⇒ 可编辑本节点）
const CHIEF = '16600009303'; // chief_editor（总谱唯一可写角色）
const GUEST = '16600009304'; // guest（全禁）

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_users.json'),
  JSON.stringify({
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '主理人', role: 'tree_steward' },
    [USER1]: { _id: USER1, phone: USER1, nickname: '族人', role: 'user' },
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [GUEST]: { _id: GUEST, phone: GUEST, nickname: '游客', role: 'guest' },
  }),
);
// USER1 锚点 = bg_family 的 p1（本人节点）⇒ requireWriteUser 的 canEditPerson 放行，随后才轮到字段级称号校验
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_anchors.json'),
  JSON.stringify({
    [USER1]: { _id: USER1, phone: USER1, tree_id: 'bg_family', person_handle: 'bg_family-p1', updated_at: new Date().toISOString() },
  }),
);

const el = await import('./economy-ledger.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');
const bg = await import('./badge-guard.js');

const DAY = 86400000;
const bambooLot = (qty, expDays, id) => ({
  id: id || el.nextLotId('bl'),
  qty,
  expires_at: new Date(Date.now() + expDays * DAY).toISOString(),
  source: 'admin',
  created_at: new Date().toISOString(),
});
const setAssets = (phone, patch) => el.mutateAssets(phone, (u) => Object.assign(u, patch));
const readAssets = (phone) => el.getAssets(phone);
const bagOf = (u) => JSON.stringify({ fragments: u.fragments, seeds: u.seeds, bamboos: u.bamboos, jades: u.jades });
const txCount = (u) => (u.txs || []).length;
const txTypes = (u) => (u.txs || []).map((t) => t.type);
const bee = (phone) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: 'user' }, 3600)}` });
const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: query,
    body: body === null ? undefined : JSON.stringify(body),
  });
const bodyOf = (res) => JSON.parse(res.body);
const H = (treeId, phone = STEWARD) => ({ ...bee(phone), 'x-tree-id': treeId });

// ---- 磁盘夹具 ----

const treePath = (id) => path.join(TMP, 'trees', `${id}.json`);
const detailPath = (treeId, handle) => path.join(TMP, 'details', `${treeId}:${handle}.json`);
const treeMd5 = (id) => md5(treePath(id));
const detailMd5 = (treeId, handle) => (fs.existsSync(detailPath(treeId, handle)) ? md5(detailPath(treeId, handle)) : '');
const readDetail = (treeId, handle) => JSON.parse(fs.readFileSync(detailPath(treeId, handle), 'utf8'));
const assetsMd5 = () => md5(path.join(TMP, 'collections', 'jiapu_assets.json'));

function writeTree(tree) {
  fs.mkdirSync(path.dirname(treePath(tree.tree_id)), { recursive: true });
  fs.writeFileSync(treePath(tree.tree_id), JSON.stringify(tree, null, 2));
}
function writeDetail(detail) {
  fs.mkdirSync(path.dirname(detailPath(detail.tree_id, detail.handle)), { recursive: true });
  fs.writeFileSync(detailPath(detail.tree_id, detail.handle), JSON.stringify(detail, null, 2));
}
async function scene({ trees = [], phone = STEWARD, bamboos = 0 } = {}) {
  for (const t of trees) writeTree(t);
  await setAssets(phone, {
    fragments: 0,
    seeds: [],
    bamboos: bamboos ? [bambooLot(bamboos, 100, `bl_${phone}_${Math.random().toString(36).slice(2, 8)}`)] : [],
    jades: [],
    txs: [],
    signin_date: '',
  });
}

const SCHEMA = { _schema: '1.0', version: 1, updated_at: '2020-01-01T00:00:00.000Z' };
const node = (h, gid, name, surname, given, extra = {}) => ({
  handle: h,
  gramps_id: gid,
  name,
  surname,
  given,
  gender: 'M',
  birth_date: '',
  death_date: '',
  birth_place: '',
  death_place: '',
  parent_family: '',
  spouse_families: [],
  is_living: true,
  ...extra,
});

function bgTree(id) {
  const p = (n) => `${id}-p${n}`;
  return {
    ...SCHEMA,
    tree_id: id,
    people: {
      [p(1)]: node(p(1), '000000500', '甲一', '甲', '一'),
      [p(2)]: node(p(2), '000000501', '甲二', '甲', '二'),
    },
    families: {},
    founder_gramps_id: '000000500',
  };
}
/** 总谱夹具：已故节点（世本节点一律已故） */
function masterTree() {
  return {
    ...SCHEMA,
    tree_id: 'zhonghua',
    people: {
      'zhonghua-m1': node('zhonghua-m1', '000000600', '华祖', '华', '祖', { is_living: false, death_date: '1900-01-01' }),
    },
    families: {},
  };
}
/** 详情文档（称号三字段宿主；空 attributes） */
function plainDetail(treeId, handle, gid, name) {
  return {
    tree_id: treeId,
    handle,
    gramps_id: gid,
    name,
    events: [],
    media: [],
    citations: [],
    notes: [],
    attributes: [],
    updated_at: '2020-01-01T00:00:00.000Z',
  };
}

/** 编辑请求体（改姓名 ⇒ 保证是真实变更；`attribute_list` 由用例注入称号与否） */
const editBody = (over = {}) => ({
  primary_name: { first_name: '伯一', surname_list: [{ surname: '甲' }] },
  gender: 1,
  birth_date: '',
  death_date: '',
  is_living: true,
  attribute_list: [],
  ...over,
});
const TITLE = [{ type: '称号', value: '人文始祖' }, { type: '称号色', value: 'gold' }];

// ================= ⓪ 纯函数判定表 =================

test('badge-guard 纯函数：判定表（普通树 / 总谱 × 全角色）+ 字段存在性 + 403 抛错', () => {
  // 普通树：仅 tree_steward / chief_editor
  assert.equal(bg.canEditBadge('tree_steward', 'bg_family', 'zhonghua'), true);
  assert.equal(bg.canEditBadge('chief_editor', 'bg_family', 'zhonghua'), true);
  assert.equal(bg.canEditBadge('user', 'bg_family', 'zhonghua'), false);
  assert.equal(bg.canEditBadge('branch_curator', 'bg_family', 'zhonghua'), false);
  assert.equal(bg.canEditBadge('guest', 'bg_family', 'zhonghua'), false);
  assert.equal(bg.canEditBadge('', 'bg_family', 'zhonghua'), false);
  assert.equal(bg.canEditBadge(undefined, 'bg_family', 'zhonghua'), false);
  assert.equal(bg.canEditBadge(null, 'bg_family', 'zhonghua'), false);
  // 总谱：仅 chief_editor（与 requireWriteUser 既有总谱口径一致）
  assert.equal(bg.canEditBadge('chief_editor', 'zhonghua', 'zhonghua'), true);
  assert.equal(bg.canEditBadge('tree_steward', 'zhonghua', 'zhonghua'), false);
  assert.equal(bg.canEditBadge('user', 'zhonghua', 'zhonghua'), false);

  // 字段存在性：三种真实形态（type 字符串 / type {string} / key）
  assert.equal(bg.hasBadgeAttr([{ type: '称号', value: 'x' }]), true);
  assert.equal(bg.hasBadgeAttr([{ type: '称号色', value: 'gold' }]), true);
  assert.equal(bg.hasBadgeAttr([{ key: '称号', value: 'x' }]), true);
  assert.equal(bg.hasBadgeAttr([{ type: { string: '称号色' }, value: 'gold' }]), true);
  assert.equal(bg.hasBadgeAttr([{ type: '号', value: '青莲居士' }]), false);
  assert.equal(bg.hasBadgeAttr([]), false);
  assert.equal(bg.hasBadgeAttr(null), false);
  assert.equal(bg.hasBadgeAttr(undefined), false);

  // assertBadgeWritable：含称号且角色不足 ⇒ 403；无称号字段 ⇒ 放行
  assert.throws(
    () => bg.assertBadgeWritable('user', 'bg_family', 'zhonghua', TITLE),
    (e) => e.status === 403 && /称号/.test(e.message),
    '普通树 user 带称号 ⇒ 403（文案含「称号」）',
  );
  assert.throws(
    () => bg.assertBadgeWritable('tree_steward', 'zhonghua', 'zhonghua', TITLE),
    (e) => e.status === 403,
    '总谱 tree_steward 带称号 ⇒ 403',
  );
  assert.doesNotThrow(() => bg.assertBadgeWritable('user', 'bg_family', 'zhonghua', [{ type: '号', value: 'x' }]), '无称号字段 ⇒ 放行');
  assert.doesNotThrow(() => bg.assertBadgeWritable('tree_steward', 'bg_family', 'zhonghua', TITLE), '普通树 tree_steward 带称号 ⇒ 放行');
});

// ================= ① 普通树 tree_steward 带称号 ⇒ 200 =================

test('① 普通树 tree_steward 带 称号 ⇒ 200（1 片、称号落详情）', async () => {
  await scene({ trees: [bgTree('bg_family')], phone: STEWARD, bamboos: 5 });
  writeDetail(plainDetail('bg_family', 'bg_family-p1', '000000500', '甲一'));

  const res = await call('/people/bg_family-p1', 'PUT', H('bg_family', STEWARD), {}, editBody({ attribute_list: TITLE }));
  const body = bodyOf(res);
  assert.equal(res.statusCode, 200, `应 200（实际 ${res.statusCode} ${JSON.stringify(body)}）`);
  assert.equal(body.ok, true);
  assert.deepEqual(body.fee, { unit: 'bamboos', pieces: 1, balance: 5, balance_after: 4 }, '真扣 1 片');
  const detail = readDetail('bg_family', 'bg_family-p1');
  assert.ok(detail.attributes.some((a) => a.key === '称号' && a.value === '人文始祖'), '称号落详情');
  assert.ok(detail.attributes.some((a) => a.key === '称号色' && a.value === 'gold'), '称号色落详情');
  const after = await readAssets(STEWARD);
  assert.deepEqual(txTypes(after), ['edit_fee'], '1 片 edit_fee 流水');
});

// ================= ② 普通树 user 带称号 ⇒ 403 + 零资产流水 =================

test('② 普通树 user（可编辑本节点）带 称号 ⇒ 403 + 零资产流水（不扣费 / 不写库）', async () => {
  await scene({ trees: [bgTree('bg_family')], phone: USER1, bamboos: 5 });
  writeDetail(plainDetail('bg_family', 'bg_family-p1', '000000500', '甲一'));

  const beforeTree = treeMd5('bg_family');
  const beforeDetail = detailMd5('bg_family', 'bg_family-p1');
  const beforeBag = bagOf(await readAssets(USER1));
  const beforeAssetsMd5 = assetsMd5();
  const beforeTx = txCount(await readAssets(USER1));

  const res = await call('/people/bg_family-p1', 'PUT', H('bg_family', USER1), {}, editBody({ attribute_list: TITLE }));
  const body = bodyOf(res);
  assert.equal(res.statusCode, 403, `应 403（实际 ${res.statusCode} ${JSON.stringify(body)}）`);
  assert.match(body.error, /称号/, '文案须明确「称号仅树主理人及以上可编辑」语义');

  // 零资产流水：不扣费、无任何 txs、资产文件逐字节不变
  const after = await readAssets(USER1);
  assert.equal(bagOf(after), beforeBag, '资产批次逐字节不变');
  assert.equal(assetsMd5(), beforeAssetsMd5, '资产集合文件逐字节不变');
  assert.equal(txCount(after), beforeTx, '不得新增任何流水');
  assert.equal(el.sumLots(after.bamboos), 5, '竹片未被扣');
  // 不写库：树 / 详情字节不变
  assert.equal(treeMd5('bg_family'), beforeTree, '树 JSON 逐字节不变');
  assert.equal(detailMd5('bg_family', 'bg_family-p1'), beforeDetail, '详情文档逐字节不变');
});

test('②′ 普通树 user 带 称号色（仅颜色）⇒ 403（两个键任一即触发）', async () => {
  const tree = bgTree('bg_family'); // 复用同一树文件（上一例已写）——重写保证干净
  await scene({ trees: [tree], phone: USER1, bamboos: 5 });
  const res = await call('/people/bg_family-p1', 'PUT', H('bg_family', USER1), {}, editBody({ attribute_list: [{ type: '称号色', value: 'crimson' }] }));
  assert.equal(res.statusCode, 403, `仅带 称号色 也应 403（实际 ${res.statusCode}）`);
  assert.equal(txCount(await readAssets(USER1)), 0, '零流水');
});

// ================= ③ 总谱非 chief 带称号 ⇒ 403 =================

test('③ 总谱非 chief 带 称号 ⇒ 403 + 零资产流水', async () => {
  await scene({ trees: [masterTree()], phone: STEWARD, bamboos: 5 });
  const beforeBag = bagOf(await readAssets(STEWARD));
  const res = await call('/people/zhonghua-m1', 'PUT', H('zhonghua', STEWARD), {}, editBody({ is_living: false, death_date: '1900-01-01', attribute_list: TITLE }));
  assert.equal(res.statusCode, 403, `应 403（实际 ${res.statusCode}）`);
  const after = await readAssets(STEWARD);
  assert.equal(bagOf(after), beforeBag, '资产批次逐字节不变');
  assert.equal(txCount(after), 0, '零流水');
});

// ================= ④ 不带称号的普通编辑 ⇒ 200（回归） =================

test('④ 不带 称号 的普通编辑 ⇒ 200（其它字段权限不变）', async () => {
  await scene({ trees: [bgTree('bg_plain')], phone: STEWARD, bamboos: 5 });
  writeDetail(plainDetail('bg_plain', 'bg_plain-p1', '000000500', '甲一'));

  // STEWARD（tree_steward）改姓名，不带任何称号字段 → 照旧 1 片
  const res = await call('/people/bg_plain-p1', 'PUT', H('bg_plain', STEWARD), {}, editBody({ attribute_list: [{ type: '号', value: '青莲居士' }] }));
  const body = bodyOf(res);
  assert.equal(res.statusCode, 200, `应 200（实际 ${res.statusCode} ${JSON.stringify(body)}）`);
  assert.deepEqual(body.fee.pieces, 1, '普通编辑照旧 1 片');

  // USER1（user）改本人节点姓名，不带称号 → 放行（字段级校验只针对称号）
  await scene({ trees: [bgTree('bg_family')], phone: USER1, bamboos: 5 });
  writeDetail(plainDetail('bg_family', 'bg_family-p1', '000000500', '甲一'));
  const res2 = await call('/people/bg_family-p1', 'PUT', H('bg_family', USER1), {}, editBody({ attribute_list: [{ type: '号', value: '青莲居士' }] }));
  assert.equal(res2.statusCode, 200, `user 无称号的普通编辑应 200（实际 ${res2.statusCode} ${res2.body}）`);
});

// ================= 回归：真源零写入 =================

test('回归：真源（config / migrate-output）逐字节未变', () => {
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 未变');
  const treeBaselineNow = dirBaseline(REAL_TREES);
  assert.deepEqual([...treeBaselineNow.entries()].sort(), [...realTreeBaseline.entries()].sort(), 'migrate-output/trees 未变');
  const detailBaselineNow = dirBaseline(REAL_DETAILS);
  assert.deepEqual([...detailBaselineNow.entries()].sort(), [...realDetailBaseline.entries()].sort(), 'migrate-output/details 未变');
  const colBaselineNow = dirBaseline(REAL_COLLECTIONS);
  assert.deepEqual([...colBaselineNow.entries()].sort(), [...realColBaseline.entries()].sort(), 'migrate-output/collections 未变');
});
