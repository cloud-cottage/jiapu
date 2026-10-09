/**
 * 锚点域单测（批 A · Kevin 2026-09-30 当面拍定）——
 *   **全站唯一**（唯一键 = `person_handle`、不按树分）+ `chief_editor` 的 **force 覆盖例外**
 *   + 节点**存在性校验** + `approve-join` 缺省取 `reference_handle`。
 *
 * 单点函数 = `lib/scope.js` 的 `assertAnchorBindable(personHandle, forPhone, opts)`
 * —— `/admin/set-anchor` 与 `/admin/approve-join` **共用**（本文件含源码判据：调用点恰 2 处、全表扫描恰 1 处）。
 *
 * 本文件覆盖（硬清单）：
 *   ① 同 `person_handle` 异构 phone ⇒ **409**，且**文案不含占用者手机号**；
 *   ①′ 唯一性**不按树分**（占用者锚点落在别的 `tree_id` 上仍 409 —— 按树分口径会放行）；
 *   ② `force` 由非 chief_editor（tree_steward）传入 ⇒ **忽略 force、仍 409**；
 *      不传 / 非 `true` 的 force ⇒ chief_editor 也仍 409（不得默认开启）；
 *   ③ chief_editor + `force:true` ⇒ **200** 且锚点被覆盖；
 *   ④ `person_handle` 不存在 ⇒ **404**（文案带节点标识）；`tree_id` 不存在 ⇒ **404**；
 *   ⑤ `approve-join` 缺省取 `jr.reference_handle` ⇒ 200 且锚点写入该 handle；
 *   ⑤′ `approve-join` 显式传入 `person_handle` ⇒ 以传入为准；
 *   ⑤″ `approve-join` 同样走存在性（404）与全站唯一（409）；`id` 缺失 / 申请无 `reference_handle` ⇒ 400；
 *   ⑥ 同一 phone 重复绑**不同**节点（自身覆盖）⇒ 200；
 *   ⑦ 口径单点（源码判据）+ 权限（401 / 403）+ 真源零写入（`config/` + `migrate-output/` 全量指纹不变）。
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本（照 signin-streak.test.js / assets.test.js）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/anchors.test.js
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
const INDEX_SRC = fs.readFileSync(path.join(REPO, 'cloudfunctions', 'compat-api', 'index.js'), 'utf8');
const SCOPE_SRC = fs.readFileSync(path.join(HERE, 'scope.js'), 'utf8');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_CONFIG = path.join(REPO, 'config');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-anchors-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

/** 真源全量指纹（config/ + migrate-output/ 全树，逐文件 md5 再聚合）—— 本文件不得写它 */
function realSourceFingerprint() {
  const files = [];
  const walk = (dir, rel) => {
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const full = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (fs.statSync(full).isDirectory()) walk(full, r);
      else files.push({ rel: r, hash: md5(full) });
    }
  };
  walk(REAL_OUT, 'migrate-output');
  walk(REAL_CONFIG, 'config');
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  const agg = crypto.createHash('md5');
  for (const f of files) agg.update(`${f.rel}\u0000${f.hash}\n`);
  return { count: files.length, digest: agg.digest('hex') };
}
const REAL_FP_BEFORE = realSourceFingerprint();

// ---- 副本夹具 ----
const TREE_ID = 'ji_probe_01';
const OTHER_TREE_ID = 'pan_probe_77'; // 占用者锚点所在的「别的树」：用于证明唯一性不按树分
const TREE = {
  tree_id: TREE_ID,
  version: 1,
  people: {
    n1: { handle: 'n1', gramps_id: 'I0001', name: '季甲', surname: '季', given: '甲', gender: 'M' },
    n2: { handle: 'n2', gramps_id: 'I0002', name: '季乙', surname: '季', given: '乙', gender: 'M' },
    n3: { handle: 'n3', gramps_id: 'I0003', name: '季丙', surname: '季', given: '丙', gender: 'M' },
    n4: { handle: 'n4', gramps_id: 'I0004', name: '季丁', surname: '季', given: '丁', gender: 'M' },
    n5: { handle: 'n5', gramps_id: 'I0005', name: '季戊', surname: '季', given: '戊', gender: 'M' },
    n6: { handle: 'n6', gramps_id: 'I0006', name: '季己', surname: '季', given: '己', gender: 'M' },
    n7: { handle: 'n7', gramps_id: 'I0007', name: '季庚', surname: '季', given: '庚', gender: 'M' },
    n8: { handle: 'n8', gramps_id: 'I0008', name: '季辛', surname: '季', given: '辛', gender: 'M' },
  },
  families: {},
};

const U = {
  chief: '16630000099',
  steward: '16630000098',
  occ: '16630000001', // 占用者（锚点 n1）
  occ2: '16630000011', // 占用者（锚点 n6，锚在**别的树**上）
  b: '16630000002', // 试抢 n1 / n6 → 409
  self: '16630000003', // 自身覆盖（锚点 n2 → 改绑 n3）
  forceT: '16630000004', // chief + force 覆盖
  join: '16630000005', // approve-join 缺省 reference_handle
  join2: '16630000006', // approve-join 显式 person_handle
  join3: '16630000007', // approve-join reference 指向不存在节点 → 404
  join4: '16630000008', // approve-join reference 已被他人绑定 → 409
  join5: '16630000009', // 申请缺 reference_handle → 400
};

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

const role = (phone) => (phone === U.chief ? 'chief_editor' : phone === U.steward ? 'tree_steward' : 'user');
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_users.json'),
  JSON.stringify(
    Object.fromEntries(
      Object.values(U).map((phone) => [phone, { _id: phone, phone, nickname: `用户${phone.slice(-3)}`, role: role(phone) }]),
    ),
  ),
);
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_anchors.json'),
  JSON.stringify({
    [U.occ]: { _id: U.occ, tree_id: TREE_ID, person_handle: 'n1', updated_at: '2026-08-14T00:00:00.000Z' },
    [U.occ2]: { _id: U.occ2, tree_id: OTHER_TREE_ID, person_handle: 'n6', updated_at: '2026-08-14T00:00:00.000Z' },
    [U.self]: { _id: U.self, tree_id: TREE_ID, person_handle: 'n2', updated_at: '2026-08-14T00:00:00.000Z' },
  }),
);
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_join_requests.json'),
  JSON.stringify({
    JR_1: { _id: 'JR_1', phone: U.join, tree_id: TREE_ID, reference_handle: 'n3', reference_name: '季丙', status: 'pending' },
    JR_2: { _id: 'JR_2', phone: U.join2, tree_id: TREE_ID, reference_handle: 'n4', reference_name: '季丁', status: 'pending' },
    JR_3: { _id: 'JR_3', phone: U.join3, tree_id: TREE_ID, reference_handle: 'ghost_9', reference_name: '幽灵', status: 'pending' },
    JR_4: { _id: 'JR_4', phone: U.join4, tree_id: TREE_ID, reference_handle: 'n1', reference_name: '季甲', status: 'pending' },
    JR_NO_REF: { _id: 'JR_NO_REF', phone: U.join5, tree_id: TREE_ID, status: 'pending' },
  }),
);
fs.writeFileSync(path.join(TMP, 'trees', `${TREE_ID}.json`), JSON.stringify(TREE, null, 2));

const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const bearer = (phone, r) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: r }, 3600)}` });
const call = (p, method = 'GET', headers = {}, body = null, query = {}) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: query,
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
const json = (res) => JSON.parse(res.body);
const anchorOf = async (phone) => json(await call('/api/admin/get-anchor', 'GET', bearer(U.chief, 'chief_editor'), null, { phone })).anchor;
const OCCUPIED_TEXT = '该人物节点已被其他用户绑定，请联系管理员处理';

// ---- ① 全站唯一 ----

test('① 同 person_handle 异构 phone ⇒ 409，且文案不下发占用者手机号', async () => {
  const res = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.b,
    tree_id: TREE_ID,
    person_handle: 'n1',
  });
  assert.equal(res.statusCode, 409);
  assert.equal(json(res).error, OCCUPIED_TEXT);
  assert.ok(!res.body.includes(U.occ), `409 响应不得下发占用者手机号（实测 body=${res.body}）`);
  assert.equal(await anchorOf(U.b), null, '409 时不得留下任何锚点');
});

test('①′ 唯一键 = person_handle 全站唯一（不按树分）：占用者锚点在别的 tree_id 上仍 409', async () => {
  // 占用者 occ2 的锚点是 `OTHER_TREE_ID` / `n6`；本请求绑 `TREE_ID` / `n6`
  // ⇒ 「按树分」的口径会判「本树无占用」而放行；全站口径必须 409
  const res = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.b,
    tree_id: TREE_ID,
    person_handle: 'n6',
  });
  assert.equal(res.statusCode, 409);
  assert.equal(json(res).error, OCCUPIED_TEXT);
  assert.ok(!res.body.includes(U.occ2));
  assert.equal(await anchorOf(U.b), null);
});

test('② force 由非 chief_editor（tree_steward）传入 ⇒ 忽略 force、仍 409', async () => {
  const res = await call('/api/admin/set-anchor', 'POST', bearer(U.steward, 'tree_steward'), {
    phone: U.b,
    tree_id: TREE_ID,
    person_handle: 'n1',
    force: true,
  });
  assert.equal(res.statusCode, 409);
  assert.equal(json(res).error, OCCUPIED_TEXT);
});

test('②′ force 缺省 / 非 true 一律不豁免：chief_editor 不传 force 仍 409', async () => {
  const bodies = [
    { phone: U.b, tree_id: TREE_ID, person_handle: 'n1' },
    { phone: U.b, tree_id: TREE_ID, person_handle: 'n1', force: 'true' },
    { phone: U.b, tree_id: TREE_ID, person_handle: 'n1', force: 1 },
    { phone: U.b, tree_id: TREE_ID, person_handle: 'n1', force: null },
  ];
  for (const body of bodies) {
    const res = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), body);
    assert.equal(res.statusCode, 409, `force=${JSON.stringify(body.force)} 不得放行`);
  }
  assert.equal(await anchorOf(U.b), null);
});

test('③ chief_editor + force:true ⇒ 200 且锚点被覆盖', async () => {
  const res = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.forceT,
    tree_id: TREE_ID,
    person_handle: 'n1',
    force: true,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(json(res).ok, true);
  const anchor = await anchorOf(U.forceT);
  assert.equal(anchor.person_handle, 'n1');
  assert.equal(anchor.tree_id, TREE_ID);
});

// ---- ④ 存在性 ----

test('④ person_handle 不存在 ⇒ 404（文案带节点标识）；tree_id 不存在 ⇒ 404', async () => {
  const res = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.b,
    tree_id: TREE_ID,
    person_handle: 'ghost_handle_xyz',
  });
  assert.equal(res.statusCode, 404);
  assert.match(json(res).error, /ghost_handle_xyz/);
  assert.ok(json(res).error.includes(TREE_ID), `404 文案应带树标识（实测 ${json(res).error}）`);

  const res2 = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.b,
    tree_id: 'no_such_tree_01',
    person_handle: 'n5',
  });
  assert.equal(res2.statusCode, 404);
  assert.match(json(res2).error, /no_such_tree_01/);
  assert.equal(await anchorOf(U.b), null, '两次 404 均不得落锚点');
});

// ---- ⑤ approve-join 口径收口 ----

test('⑤ approve-join 缺省取 jr.reference_handle ⇒ 200 且锚点 = reference_handle', async () => {
  const res = await call('/api/admin/approve-join', 'POST', bearer(U.chief, 'chief_editor'), { id: 'JR_1' });
  assert.equal(res.statusCode, 200);
  assert.equal(json(res).status, 'approved');
  const anchor = await anchorOf(U.join);
  assert.equal(anchor.person_handle, 'n3');
  assert.equal(anchor.tree_id, TREE_ID);
});

test('⑤′ approve-join 显式传入 person_handle ⇒ 以传入为准（非 reference_handle）', async () => {
  const res = await call('/api/admin/approve-join', 'POST', bearer(U.chief, 'chief_editor'), { id: 'JR_2', person_handle: 'n5' });
  assert.equal(res.statusCode, 200);
  const anchor = await anchorOf(U.join2);
  assert.equal(anchor.person_handle, 'n5');
});

test('⑤″ approve-join 同样走存在性（404）与全站唯一（409）', async () => {
  const res404 = await call('/api/admin/approve-join', 'POST', bearer(U.chief, 'chief_editor'), { id: 'JR_3' });
  assert.equal(res404.statusCode, 404);
  assert.match(json(res404).error, /ghost_9/);

  const res409 = await call('/api/admin/approve-join', 'POST', bearer(U.chief, 'chief_editor'), { id: 'JR_4' });
  assert.equal(res409.statusCode, 409);
  assert.equal(json(res409).error, OCCUPIED_TEXT);
  assert.ok(!res409.body.includes(U.occ), '409 响应不得下发占用者手机号');
  assert.equal(await anchorOf(U.join3), null);
  assert.equal(await anchorOf(U.join4), null);
});

test('⑤‴ approve-join 缺 id ⇒ 400；申请缺 reference_handle 且未传 person_handle ⇒ 400；补传后放行', async () => {
  const noId = await call('/api/admin/approve-join', 'POST', bearer(U.chief, 'chief_editor'), {});
  assert.equal(noId.statusCode, 400);
  const noRef = await call('/api/admin/approve-join', 'POST', bearer(U.chief, 'chief_editor'), { id: 'JR_NO_REF' });
  assert.equal(noRef.statusCode, 400);
  assert.equal(await anchorOf(U.join5), null);
  const ok = await call('/api/admin/approve-join', 'POST', bearer(U.chief, 'chief_editor'), { id: 'JR_NO_REF', person_handle: 'n7' });
  assert.equal(ok.statusCode, 200);
  assert.equal((await anchorOf(U.join5)).person_handle, 'n7');
});

// ---- ⑥ 自身覆盖 ----

test('⑥′ 同一 phone 重复绑**同一**节点 ⇒ 200（自己不算占用者）', async () => {
  // U.self 当前锚点 = n2（仅其自身持有该 handle）
  const res = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.self,
    tree_id: TREE_ID,
    person_handle: 'n2',
  });
  assert.equal(res.statusCode, 200);
  assert.equal((await anchorOf(U.self)).person_handle, 'n2');
});

test('⑥ 同一 phone 重复绑不同节点（自身覆盖）⇒ 200', async () => {
  const res = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.self,
    tree_id: TREE_ID,
    person_handle: 'n8',
  });
  assert.equal(res.statusCode, 200);
  const anchor = await anchorOf(U.self);
  assert.equal(anchor.person_handle, 'n8');
  assert.equal(anchor.tree_id, TREE_ID);
});

// ---- ⑦ 口径单点 + 权限 + 真源零写入 ----

test('⑦ 口径单点（源码判据）：三处共用 assertAnchorBindable；全表扫描恰 1 处；写入路径唯一', () => {
  assert.match(SCOPE_SRC, /export async function assertAnchorBindable\(/);
  // ① 唯一性全表扫描**只此一处**（单点扫描，不得出现第二份口径）
  assert.equal((SCOPE_SRC.match(/colAll\('jiapu_anchors'\)/g) || []).length, 1, '唯一性全表扫描必须只有一处');
  // ② 调用点数 = 实测真值 3：/invite/code 签发预检（只校验不写）+ set-anchor + approve-join（批 C-1 后为 3）
  const gateSites = (INDEX_SRC.match(/await assertAnchorBindable\(/g) || []).length;
  const writeSites = (INDEX_SRC.match(/await setAnchor\(/g) || []).length;
  assert.equal(gateSites, 3, '三处共用同一单点函数（不得两套口径）：/invite/code 预检 + set-anchor + approve-join');
  assert.equal(writeSites, 2, '锚点写入点：set-anchor / approve-join（invite-bind 的写入在 lib/invite-codes.js）');
  // ③ 所有锚点写入路径都必须先过单点校验：差 = 唯一的「只校验不写」预检（/invite/code 签发），不得再有旁路
  assert.equal(gateSites, writeSites + 1, '调用点数 = 写入点数 + 唯一的只校验不写预检（/invite/code 签发）');
  // ④ 写入路径单点：全库只有 scope.setAnchor 写 jiapu_anchors；路由层不得绕过它直写
  assert.equal((SCOPE_SRC.match(/colSet\('jiapu_anchors'/g) || []).length, 1, '锚点写入只此一处（setAnchor）');
  assert.equal((INDEX_SRC.match(/colSet\('jiapu_anchors'/g) || []).length, 0, '路由层不得直写锚点集合');
  assert.equal((INDEX_SRC.match(/force: body\.force === true/g) || []).length, 2, 'force 只认请求体显式 true（两条路由一致）');
  // 唯一键 = person_handle：占用判定里不得出现 tree_id
  assert.match(SCOPE_SRC, /String\(a\.person_handle \|\| ''\)\.trim\(\) === handle/);
});

test('⑦′ 未登录 ⇒ 401；低于 tree_steward（普通 user）⇒ 403', async () => {
  const res401 = await call('/api/admin/set-anchor', 'POST', {}, { phone: U.b, tree_id: TREE_ID, person_handle: 'n1' });
  assert.equal(res401.statusCode, 401);
  const res403 = await call('/api/admin/set-anchor', 'POST', bearer(U.b, 'user'), { phone: U.b, tree_id: TREE_ID, person_handle: 'n1' });
  assert.equal(res403.statusCode, 403);
});

test('⑦″ 真源零写入：config/ + migrate-output/ 全量指纹与本文件开工时逐字节一致', () => {
  const after = realSourceFingerprint();
  assert.equal(after.count, REAL_FP_BEFORE.count);
  assert.equal(after.digest, REAL_FP_BEFORE.digest);
});
