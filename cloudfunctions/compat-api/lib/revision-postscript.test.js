/**
 * 后记（postscript）名册解析单测 —— `lib/revision-postscript.test.js`（node:test 体例）
 *
 * 覆盖（本单冻结契约）：
 *   ① `resolveDisplayName` **四级降级**：
 *      · 锚点命中本树 ⇒ 树内 `people[handle].name`
 *      · 锚点存在但**不是本树** ⇒ 落到昵称
 *      · 无锚点（有昵称）⇒ 昵称
 *      · 锚点指向本树但节点已删 / 姓名为空 ⇒ 落到昵称（①的「读不到则继续」）
 *      · 锚点 + 昵称都没有的 **11 位纯数字** ⇒ 打码 `166****0002`
 *      · 全缺且**非 11 位** ⇒ 空串
 *   ② `masterPhoneOf` 优先级（逐字按单）：`operator` ?? `fee_ref.paid_by` ?? `paid_by`，三者皆无 ⇒ `''`
 *   ②-補 **每轮主司取值口径（主司优先、操作者回退）**：本轮 `helpers` 有 `duty='主司'` ⇒ 取该树
 *      `people[person_handle].name`（压过操作者手机号解析）；无主司 / 主司节点已删 / 姓名为空 ⇒ 回退手机号路径
 *   ③ `postscript` 形状：恰三键 `{created_by, created_by_name, masters}`；
 *      `masters` 与出参 `revisions[]` **同序同长**，元素恰 `{seq, name}`；`created_by` = tree-meta 原值
 *   ④ 读容错：未修谱树 / 集合缺失 ⇒ 空态 + 空串名册，**绝不抛**（口径同 `lib/tree-activity.js`）
 *
 * 数据安全：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本
 * （绝不写 `config/` 与 `migrate-output/` 真源）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/revision-postscript.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiapu-revision-postscript-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const PS = await import('./revision-postscript.js');
const REV = await import('./revision.js');
const store = await import('./store.js');

// ══ 夹具 ══════════════════════════════════════════════════════════════════════

const PS_TREE = 'rev_ps_tree'; // 本树（锚点归属树）
const OTHER_TREE = 'rev_ps_other_tree'; // 别树（锚点归属 ≠ 本树）
const GHOST_TREE = 'rev_ps_ghost_tree'; // 从未修谱 / meta 无档

const ANCHOR_PHONE = '16601061656'; // ① 锚点命中本树 ⇒ 季清昆
const NICK_PHONE = '16600000003'; // ② 无锚点，有昵称
const OTHER_TREE_PHONE = '16600000001'; // 锚点属别树 ⇒ ② 昵称
const MISSING_NODE_PHONE = '16600000005'; // 锚点本树但节点已删 ⇒ ② 昵称
const MASK_PHONE = '16600000002'; // ③ 无锚点无昵称 · 11 位数字 ⇒ 打码
const EMPTY_NICK_PHONE = '16600000004'; // 昵称空串 ⇒ ③ 打码
const SHORT_PHONE = '1380000'; // ④ 全缺且非 11 位 ⇒ 空串

const ANCHOR_NAME = '季清昆'; // = 真实数据（账号 16601061656 → ji_23395_01/7146eadb86a0af696614b36d）
const NICK_NAME = '季小季';
const OTHER_TREE_NICK = '别树之客';
const MISSING_NODE_NICK = '缺失节点之客';
const MASTER_NAME = '季清辰'; // 本轮主司姓名（**≠** 操作者解析结果 ⇒ 「主司优先」可判）
const VICE_NAME = '季志民'; // 副司姓名（不出现在主司取值里）

fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });

/** 本树：锚点指向的节点 `h_anchor`（名 = 季清昆）+ 一个姓名为空的节点 + 主司/副司夹具节点 */
fs.writeFileSync(
  path.join(TMP, 'trees', `${PS_TREE}.json`),
  JSON.stringify({
    tree_id: PS_TREE,
    kind: 'family',
    people: {
      h_anchor: { handle: 'h_anchor', name: ANCHOR_NAME },
      h_noname: { handle: 'h_noname', name: '' },
      h_master: { handle: 'h_master', name: MASTER_NAME }, // 本轮主司（与操作者解析结果**不同名**，用于验「主司优先」）
      h_vice: { handle: 'h_vice', name: '季志民' }, // 副司（不参与主司取值）
    },
  }),
);
fs.writeFileSync(
  path.join(TMP, 'trees', `${OTHER_TREE}.json`),
  JSON.stringify({ tree_id: OTHER_TREE, kind: 'family', people: { h_x: { handle: 'h_x', name: '别树之人' } } }),
);

// tree-meta（`created_by` 原值 = 本单 `created_by` / `created_by_name` 的来源；写副本，绝不碰真源）
fs.writeFileSync(
  path.join(TMP, 'tree-meta.json'),
  JSON.stringify({
    _schema: '1.1',
    trees: {
      [PS_TREE]: { tree_id: PS_TREE, kind: 'family', display_title: '后记树', created_by: ANCHOR_PHONE },
      [OTHER_TREE]: { tree_id: OTHER_TREE, kind: 'family', display_title: '别树' },
    },
  }),
);

// 锚点：① 本树命中 / 别树 / 本树但节点已删（handle 不存在）
const anchor = (phone, treeId, handle) =>
  store.colSet(PS.ANCHORS_COL, phone, { tree_id: treeId, person_handle: handle, updated_at: new Date().toISOString() });
await anchor(ANCHOR_PHONE, PS_TREE, 'h_anchor');
await anchor(OTHER_TREE_PHONE, OTHER_TREE, 'h_x');
await anchor(MISSING_NODE_PHONE, PS_TREE, 'h_deleted');

// 账号昵称
const account = (phone, nickname) =>
  store.colSet(PS.USERS_COL, phone, { phone, nickname, role: 'user', created_at: new Date().toISOString() });
await account(NICK_PHONE, NICK_NAME);
await account(OTHER_TREE_PHONE, OTHER_TREE_NICK);
await account(MISSING_NODE_PHONE, MISSING_NODE_NICK);
await account(EMPTY_NICK_PHONE, '   '); // 纯空白 ⇒ 视同无昵称

// ══ ① 四级降级 ═══════════════════════════════════════════════════════════════

test('① 一级：锚点命中本树 ⇒ 取该树 people[person_handle].name', async () => {
  assert.equal(await PS.resolveDisplayName(ANCHOR_PHONE, PS_TREE), ANCHOR_NAME, '锚点 → 树内姓名');
});

test('② 二级：锚点属**别树** ⇒ 不取别树姓名，落到昵称；无锚点有昵称亦走昵称', async () => {
  assert.equal(await PS.resolveDisplayName(OTHER_TREE_PHONE, PS_TREE), OTHER_TREE_NICK, '锚点 tree_id ≠ 本树 ⇒ 不用锚点');
  assert.equal(await PS.resolveDisplayName(OTHER_TREE_PHONE, OTHER_TREE), '别树之人', '同一账号在其本树则命中锚点');
  assert.equal(await PS.resolveDisplayName(NICK_PHONE, PS_TREE), NICK_NAME, '无锚点 ⇒ 昵称');
});

test('②-补 一级「读不到则继续」：锚点节点已删 / 树内姓名为空 ⇒ 落到昵称', async () => {
  assert.equal(await PS.resolveDisplayName(MISSING_NODE_PHONE, PS_TREE), MISSING_NODE_NICK, 'handle 不存在 ⇒ 昵称');
  await store.colSet(PS.ANCHORS_COL, EMPTY_NICK_PHONE, { tree_id: PS_TREE, person_handle: 'h_noname', updated_at: '' });
  // h_noname.name 为空 + EMPTY_NICK_PHONE 昵称为空白 ⇒ 落到 ③ 打码
  assert.equal(await PS.resolveDisplayName(EMPTY_NICK_PHONE, PS_TREE), '166****0004', '姓名空 ⇒ 继续降级');
});

test('③ 三级：11 位纯数字手机号打码（前 3 + **** + 后 4）', async () => {
  assert.equal(await PS.resolveDisplayName(MASK_PHONE, PS_TREE), '166****0002');
  assert.equal(PS.maskPhoneDigits('16601061656'), '166****1656', '样例 = 单内逐字给定');
});

test('④ 四级：全缺且**非 11 位** ⇒ 空串；空 phone 亦空串', async () => {
  assert.equal(await PS.resolveDisplayName(SHORT_PHONE, PS_TREE), '');
  assert.equal(await PS.resolveDisplayName('', PS_TREE), '');
  assert.equal(await PS.resolveDisplayName(undefined, PS_TREE), '');
  assert.equal(PS.maskPhoneDigits(SHORT_PHONE), '', '非 11 位不打码');
});

// ══ ② 主司手机号优先级 ═══════════════════════════════════════════════════════

test('masterPhoneOf 优先级逐字按单：operator ?? fee_ref.paid_by ?? paid_by', () => {
  assert.deepEqual(PS.MASTER_PHONE_KEYS, ['operator', 'fee_ref.paid_by', 'paid_by']);
  assert.equal(PS.masterPhoneOf({ operator: 'o', fee_ref: { paid_by: 'f' }, paid_by: 'p' }), 'o');
  assert.equal(PS.masterPhoneOf({ fee_ref: { paid_by: 'f' }, paid_by: 'p' }), 'f');
  assert.equal(PS.masterPhoneOf({ paid_by: 'p' }), 'p');
  // **真实档形状**：只有 fee_ref.paid_by（实测 jiapu_revisions/ji_23395_01 无 operator / paid_by 键）
  assert.equal(PS.masterPhoneOf({ seq: 1, fee_ref: { txn_id: 'tx_x', paid_by: '16601061656' } }), '16601061656');
  assert.equal(PS.masterPhoneOf({}), '');
  assert.equal(PS.masterPhoneOf(null), '');
  assert.equal(PS.masterPhoneOf({ operator: '', fee_ref: { paid_by: '  ' }, paid_by: '' }), '', '三者皆空 ⇒ 空串');
});

// ══ ③ postscript 形状（与 revisions[] 同序同长） ═════════════════════════════

const rev = (seq, extra = {}) => ({
  seq,
  started_at: '2026-09-11T01:03:23.073Z',
  effective_at: '2026-09-11T01:03:23.073Z',
  locked_at: null,
  cover: null,
  article: null,
  helpers: [],
  donations: [],
  content_updated_at: null,
  ...extra,
});
await store.colSet(REV.REVISION_COL, PS_TREE, {
  _id: PS_TREE,
  version: 1,
  seq: 7,
  revisions: [
    rev(1, { fee_ref: { txn_id: 'tx_1', unit: 'bamboos', pieces: 999, paid_by: ANCHOR_PHONE } }), // ① 季清昆
    rev(2, { operator: NICK_PHONE }), // 优先级第一档 ⇒ 季小季
    rev(3, { paid_by: MASK_PHONE }), // 优先级第三档 ⇒ 打码
    // ④–⑦ 主司优先 / 回退（Kevin 2026-10-12 改口径）：helpers 里 duty='主司' 者压过操作者
    rev(4, { operator: NICK_PHONE, helpers: [{ person_handle: 'h_master', duty: '主司' }] }), // 主司优先 ⇒ 季清辰（≠ 季小季）
    rev(5, { fee_ref: { txn_id: 'tx_5', paid_by: ANCHOR_PHONE }, helpers: [{ person_handle: 'h_vice', duty: '副司' }] }), // 只有副司 ⇒ 回退 ⇒ 季清昆
    rev(6, { operator: NICK_PHONE, helpers: [{ person_handle: 'h_deleted_master', duty: '主司' }] }), // 主司节点已删 ⇒ 回退 ⇒ 季小季
    rev(7, { paid_by: MASK_PHONE, helpers: [{ person_handle: 'h_noname', duty: '主司' }] }), // 主司姓名为空 ⇒ 回退 ⇒ 打码
  ],
});

test('③ postscript = {created_by, created_by_name, masters}；masters 与 revisions[] 同序同长同 seq', async () => {
  const view = await REV.getRevisionView(PS_TREE, new Date('2026-09-12T00:00:00Z'));

  assert.ok(view.postscript, '顶层必须新增 postscript 键（只增不改）');
  assert.deepEqual(Object.keys(view.postscript), ['created_by', 'created_by_name', 'masters'], '恰三键（不得自创字段名）');
  assert.equal(view.postscript.created_by, ANCHOR_PHONE, 'created_by = tree-meta 原值');
  assert.equal(view.postscript.created_by_name, ANCHOR_NAME, '始纂人解析为【季清昆】');

  assert.equal(view.postscript.masters.length, view.revisions.length, 'masters 与 revisions[] 同长');
  assert.deepEqual(
    view.postscript.masters.map((m) => m.seq),
    view.revisions.map((r) => r.seq),
    'masters 与 revisions[] 同序（seq 逐项相等）',
  );
  for (const m of view.postscript.masters) {
    assert.deepEqual(Object.keys(m), ['seq', 'name'], '每个元素恰 {seq, name}');
    assert.equal(typeof m.seq, 'number');
    assert.equal(typeof m.name, 'string');
  }
  assert.equal(view.postscript.masters[0].name, ANCHOR_NAME, '首轮主司 = 季清昆（fee_ref.paid_by 路径）');
  assert.equal(view.postscript.masters[1].name, NICK_NAME, '次轮主司走 operator 路径');
  assert.equal(view.postscript.masters[2].name, '166****0002', '三轮主司走 paid_by 路径 → 打码');
});

test('③-補 **主司优先**：本轮 helpers 有 duty=主司 ⇒ 取该树族人名（压过操作者手机号解析）', async () => {
  const view = await REV.getRevisionView(PS_TREE, new Date('2026-09-12T00:00:00Z'));
  // 第 4 轮：operator = NICK_PHONE（回退值 = 季小季），helpers 指明主司 = h_master（季清辰）
  assert.equal(view.postscript.masters[3].name, MASTER_NAME, '主司优先 ⇒ 季清辰（与回退值 季小季 不同，可判）');
  assert.notEqual(view.postscript.masters[3].name, NICK_NAME, '主司优先 ⇒ 不得落到操作者昵称');
  // 直接单测取值函数（同一判据，两级）
  assert.equal(await PS.masterNameOfRound(rev(4, { operator: NICK_PHONE, helpers: [{ person_handle: 'h_master', duty: '主司' }] }), PS_TREE), MASTER_NAME);
});

test('③-補 **回退**：本轮无主司（helpers 空 / 只有副司 / 主司节点已删 / 主司姓名为空）⇒ 操作者手机号路径', async () => {
  const view = await REV.getRevisionView(PS_TREE, new Date('2026-09-12T00:00:00Z'));
  assert.equal(view.postscript.masters[4].name, ANCHOR_NAME, '只有副司 ⇒ 回退（副司姓名不参与：≠ 季志民）');
  assert.notEqual(view.postscript.masters[4].name, VICE_NAME);
  assert.equal(view.postscript.masters[5].name, NICK_NAME, '主司节点已删 ⇒ 回退到操作者昵称');
  assert.equal(view.postscript.masters[6].name, '166****0002', '主司姓名为空 ⇒ 回退到打码');
  // 直接单测取值函数：helpers 空 / 无主司 / 主司解析不到 ⇒ 与纯手机号路径逐字一致
  const fallback = (round) => PS.resolveDisplayName(PS.masterPhoneOf(round), PS_TREE);
  for (const round of [
    rev(1, { fee_ref: { paid_by: ANCHOR_PHONE } }),
    rev(2, { operator: NICK_PHONE, helpers: [] }),
    rev(5, { fee_ref: { paid_by: ANCHOR_PHONE }, helpers: [{ person_handle: 'h_vice', duty: '副司' }] }),
    rev(6, { operator: NICK_PHONE, helpers: [{ person_handle: 'h_deleted_master', duty: '主司' }] }),
    rev(7, { paid_by: MASK_PHONE, helpers: [{ person_handle: 'h_noname', duty: '主司' }] }),
  ]) {
    assert.equal(await PS.masterNameOfRound(round, PS_TREE), await fallback(round), `回退态与手机号路径逐字一致（seq=${round.seq}）`);
  }
  // 主司职务名常量与 revision.js 同源（逐字一致 —— 两处常量不得漂移）
  assert.equal(PS.MASTER_DUTY, '主司');
  assert.equal(PS.MASTER_DUTY, REV.HELPER_DUTY_MASTER, 'MASTER_DUTY 与 revision.js 的 HELPER_DUTY_MASTER 逐字同源');
  // 非主司职务（旧口径值）不进「主司优先」路径 ⇒ 仍走回退
  assert.equal(await PS.masterNameOfRound(rev(8, { operator: NICK_PHONE, helpers: [{ person_handle: 'h_master', duty: '校對' }] }), PS_TREE), NICK_NAME);
});

test('③-补 tree-meta 无 created_by / 未修谱树 ⇒ 空串 + 空数组，masters 仍与 revisions[] 同长', async () => {
  const other = await REV.getRevisionView(OTHER_TREE, new Date('2026-09-12T00:00:00Z'));
  assert.deepEqual(other.revisions, [], '未修谱 ⇒ 空 revisions');
  assert.deepEqual(other.postscript, { created_by: '', created_by_name: '', masters: [] }, 'meta 无 created_by ⇒ 空串');

  const ghost = await REV.getRevisionView(GHOST_TREE, new Date('2026-09-12T00:00:00Z'));
  assert.deepEqual(ghost.revisions, []);
  assert.deepEqual(ghost.postscript, { created_by: '', created_by_name: '', masters: [] });
});

test('③-补 每轮名册不跳条：主司手机号三者皆无 ⇒ 该条 name 为空串但**仍在册**', async () => {
  await store.colSet(REV.REVISION_COL, GHOST_TREE, {
    _id: GHOST_TREE,
    version: 1,
    seq: 2,
    revisions: [rev(1, { fee_ref: { txn_id: 'tx_a', paid_by: '' } }), rev(2, { operator: SHORT_PHONE })],
  });
  const view = await REV.getRevisionView(GHOST_TREE, new Date('2026-09-12T00:00:00Z'));
  assert.equal(view.postscript.masters.length, view.revisions.length, '同长（一条不落）');
  assert.equal(view.postscript.masters.length, 2);
  assert.deepEqual(view.postscript.masters[0], { seq: 1, name: '' }, '无手机号 ⇒ 空串名（不跳条）');
  assert.deepEqual(view.postscript.masters[1], { seq: 2, name: '' }, '手机号全缺且非 11 位 ⇒ 空串名');
});

// ══ ④ 既有出参一字不改（只增不改） ═════════════════════════════════════════════

test('④ 只增不改：既有顶层键与 revisions[] 元素键集原样保留', async () => {
  const view = await REV.getRevisionView(PS_TREE, new Date('2026-09-12T00:00:00Z'));
  for (const k of [
    'ok', 'tree_id', 'now', 'edit_days', 'fee_start_bamboos', 'fee_locked_edit_bamboos',
    'fee_locked_long_bamboos', 'interval_years', 'seq', 'can_start', 'active', 'revisions',
  ]) {
    assert.ok(k in view, `既有顶层键 ${k} 必须仍在`);
  }
  assert.deepEqual(
    Object.keys(view.revisions[0]),
    ['seq', 'effective_at', 'locked_at', 'days', 'fee_tier', 'fee_next_bamboos', 'cover', 'article', 'helpers', 'donations'],
    'revisions[] 元素形状一字未改',
  );
});

// ══ 附 沙箱自证 ════════════════════════════════════════════════════════════════

test('附 沙箱自证：测试根在 /tmp 副本，未触真源', () => {
  assert.ok(TMP.startsWith(os.tmpdir()), '测试根必须是 /tmp 副本');
  assert.equal(store.PATHS.out, TMP);
  assert.equal(store.PATHS.metaFile, path.join(TMP, 'tree-meta.json'));
});

// ══ ④-补 读容错（**子进程冷缓存**：集合整档缺失） ══════════════════════════════

/** 在子进程里跑一段 ESM（工作目录 = 仓库根；体例同 `meta-guard.test.js` 的 `runChild`） */
function runChild(code, env) {
  const url = `file://${path.join(HERE, 'revision-postscript.js')}`;
  const revUrl = `file://${path.join(HERE, 'revision.js')}`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', code.replace(/__MOD__/g, url).replace(/__REV__/g, revUrl)], {
    cwd: REPO,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
  });
}

test('④-补 读容错：集合整档缺失（冷缓存）⇒ 降级到打码 / 空串，视图仍成 shape，绝不抛', () => {
  // ⚠️ 必须走**子进程**：父进程里 `store.colCache` 早已温热（前面的用例读过锚点/账号），
  //    换成目录/删文件都读不到「空集合」，无法真正验证「集合缺失 ⇒ 不抛」。
  //    子进程数据根 = **全空目录**（trees/、collections/ 都不建）⇒ 每次读都是首次 & 必失败。
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiapu-ps-empty-'));
  fs.writeFileSync(path.join(emptyDir, 'tree-meta.json'), JSON.stringify({ _schema: '1.1', trees: {} }));
  const code = `
    const PS = await import('__MOD__');
    const REV = await import('__REV__');
    const out = {
      mask: await PS.resolveDisplayName('16600000002', 'ps_no_such_tree'),
      short: await PS.resolveDisplayName('1380000', 'ps_no_such_tree'),
      view: await REV.getRevisionView('ps_no_such_tree', new Date('2026-09-12T00:00:00Z')),
    };
    console.log('RESULT=' + JSON.stringify(out));
  `;
  let payload;
  try {
    const out = runChild(code, {
      COMPAT_SOURCE: 'local',
      COMPAT_OUT_DIR: emptyDir,
      COMPAT_META_FILE: path.join(emptyDir, 'tree-meta.json'),
      NODE_TEST_CONTEXT: 'child-v8',
    });
    payload = JSON.parse(out.trim().split('RESULT=')[1]);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
  assert.equal(payload.mask, '166****0002', '锚点/账号集合缺失 ⇒ 降级到 ③ 打码（绝不抛）');
  assert.equal(payload.short, '', '集合缺失 + 非 11 位 ⇒ 空串');
  assert.deepEqual(payload.view.postscript, { created_by: '', created_by_name: '', masters: [] }, '空态照旧成 shape');
  assert.deepEqual(payload.view.revisions, [], '既有出参一字不改');
});
