/**
 * 邀请码链路单测（**批 C-1** · Kevin 2026-09-30 逐条拍定）+ 批 A 缺口（force 覆盖清锚点 + 审计）。
 *
 * 覆盖（硬清单，逐条对应派单自测项）：
 *   ① 签发 node 型 200（形状逐字 / 6 位码表 / TTL 30 天 / `max_uses=1` / 落库字段）
 *   ①′ 签发 plain 型：忽略节点参数、`tree_id=null`、`max_uses=null`（多次可用）
 *   ② 节点已被绑定 ⇒ 签发 **409**（且不落废码）
 *   ②′ 已故节点（`is_living === false` 严格等值）签 node 型 ⇒ **400** 文案逐字 + 不落任何码（Kevin 2026-10-09）
 *   ③ 非本树成员签发 ⇒ **403**；chief_editor 放行
 *   ④ `GET /invite/code/resolve` 五态（valid / expired / revoked / used / not_found）+ **零手机号**
 *   ⑤ `X-Invite-Code` 放行：同树有效码 ⇒ 节点数 = 未裁剪（= 该树 member 读数）；无码 / 无效 / 异树 ⇒ **逐字相同**
 *   ⑥ `bind accept` 200 + 锚点落盘（带 `via_invite_code`）+ 码 `used_count=1` + 重放 ⇒ **400 `您已处理过该邀请`**
 *   ⑦ `bind skip` 不消耗（另一用户仍可 accept 同码）
 *   ⑧ plain 型可多人用（skip + replace 各 200，码永不消耗）
 *   ⑨ 奖励入账读数（两方各自 delta：档乙 +1 残页 +10 竹片 / +30 碎片）+ 幂等重放**不双发**
 *   ⑩ 明文 `tree_id` / `person_handle` 但**无 `c`** ⇒ 400 且**零绑定**（防伪造）
 *   ⑪ force 覆盖后原占用者锚点**已清空** + 审计记录已写 + 响应 `reassigned_from`（脱敏，无覆盖 = null）
 *   ⑫ 权限 / 入参闸门（401 / 400 各态）
 *   ⑬ 口径单点（源码判据：三条路由注册在树编辑闸门之前；`x-invite-code` 恰 2 处；码表不含 0/O/1/I/L）
 *   ⑭ 真源零写入（`config/` + `migrate-output/` 全量指纹开工前后逐字节一致）
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本（照 anchors.test.js）。
 * 运行：node --test cloudfunctions/compat-api/lib/invite-codes.test.js
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
const INVC_SRC = fs.readFileSync(path.join(HERE, 'invite-codes.js'), 'utf8');
const UPLOAD_SRC = fs.readFileSync(path.join(REPO, 'scripts', 'upload-migrated-to-cloudbase.mjs'), 'utf8');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_CONFIG = path.join(REPO, 'config');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-invite-codes-'));
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

// ================= 副本夹具 =================

const TREE_ID = 'ji_inv_01';
const OTHER_TREE_ID = 'pan_inv_77';
const DEPTH = 25; // 线性 25 世链：guest 藏 18 世 → 可见 7；登录未加入藏 9 世 → 可见 16；member = 25

const people = {};
const families = {};
for (let i = 1; i <= DEPTH; i += 1) {
  people[`n${i}`] = {
    handle: `n${i}`,
    gramps_id: `${String(i).padStart(9, '0')}`,
    name: `季第${i}`,
    surname: '季',
    given: `第${i}`,
    gender: 'M',
  };
  if (i > 1) families[`f${i - 1}`] = { handle: `f${i - 1}`, gramps_id: `F${String(i - 1).padStart(4, '0')}`, father_handle: `n${i - 1}`, mother_handle: '', child_handles: [`n${i}`] };
}
// 已故对照（Kevin 2026-10-09 拍板：已故节点不得签发入族邀请）：在**既有人物** n25 上落 `is_living=false`。
// **不得新增人物** —— ⑤ 的整树读数按人数定额断言，加人会打红；n25 是本文件无其它用例引用的尾节点。
people.n25.is_living = false;
const TREE = { tree_id: TREE_ID, version: 1, people, families };
const OTHER_TREE = {
  tree_id: OTHER_TREE_ID,
  version: 1,
  people: {
    p1: { handle: 'p1', gramps_id: '000009001', name: '潘甲', surname: '潘', given: '甲', gender: 'M' },
    p2: { handle: 'p2', gramps_id: '000009002', name: '潘乙', surname: '潘', given: '乙', gender: 'M' },
  },
  families: { g1: { handle: 'g1', gramps_id: 'F009001', father_handle: 'p1', mother_handle: '', child_handles: ['p2'] } },
};

const U = {
  chief: '16630000090', // chief_editor（无锚点）
  inviter: '16630000091', // 本树成员（锚点 n2）
  inviterR: '16630000092', // 本树成员（锚点 n3）—— 奖励专测邀请人（独占日限）
  outsider: '16630000093', // 别树成员（锚点 p1 @ OTHER_TREE）
  noanchor: '16630000094', // 无锚点
  newbie: '16630000095', // ①⑦ accept 测被邀请人
  newbie2: '16630000096', // skip 测
  newbie3: '16630000097', // skip 后 accept 测
  newbie4: '16630000098', // plain 多人用 1
  newbie5: '16630000099', // plain 多人用 2
  newbieR: '16630000100', // 奖励测被邀请人
  occ: '16630000102', // 占用者（锚点 n6）→ 签发 409
  occ2: '16630000103', // 占用者（锚点 n23）→ force 覆盖
  forcee: '16630000104', // force 覆盖目标
  fake: '16630000105', // ⑩ 明文参数无 c
};

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

const role = (phone) => (phone === U.chief ? 'chief_editor' : 'user');
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_users.json'),
  JSON.stringify(
    Object.fromEntries(Object.values(U).map((phone) => [phone, { _id: phone, phone, nickname: `用户${phone.slice(-3)}`, role: role(phone) }])),
  ),
);
// 昵称缺失兜底（resolve 只给脱敏串）—— 单独一个无昵称的邀请人
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_anchors.json'),
  JSON.stringify({
    [U.inviter]: { _id: U.inviter, tree_id: TREE_ID, person_handle: 'n2', updated_at: '2026-08-01T00:00:00.000Z' },
    [U.inviterR]: { _id: U.inviterR, tree_id: TREE_ID, person_handle: 'n3', updated_at: '2026-08-01T00:00:00.000Z' },
    [U.outsider]: { _id: U.outsider, tree_id: OTHER_TREE_ID, person_handle: 'p1', updated_at: '2026-08-01T00:00:00.000Z' },
    [U.occ]: { _id: U.occ, tree_id: TREE_ID, person_handle: 'n6', updated_at: '2026-08-01T00:00:00.000Z' },
    [U.occ2]: { _id: U.occ2, tree_id: TREE_ID, person_handle: 'n23', updated_at: '2026-08-01T00:00:00.000Z' },
  }),
);
const past = '2026-01-01T00:00:00.000Z';
const future = '2099-01-01T00:00:00.000Z';
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_invite_codes.json'),
  JSON.stringify({
    // 过期（TTL 已过）
    '222222': { _id: '222222', kind: 'plain', inviter_phone: U.inviter, tree_id: null, person_handle: null, created_at: past, expires_at: past, max_uses: null, used_count: 0, used_by: [], revoked_at: null },
    // 已撤销
    '333333': { _id: '333333', kind: 'node', inviter_phone: U.inviter, tree_id: TREE_ID, person_handle: 'n4', created_at: past, expires_at: future, max_uses: 1, used_count: 0, used_by: [], revoked_at: past },
    // 已用尽
    '444444': { _id: '444444', kind: 'node', inviter_phone: U.inviter, tree_id: TREE_ID, person_handle: 'n5', created_at: past, expires_at: future, max_uses: 1, used_count: 1, used_by: [U.newbie], used_at: past, revoked_at: null },
  }),
);
fs.writeFileSync(
  path.join(TMP, 'tree-meta.json'),
  JSON.stringify({
    trees: {
      [TREE_ID]: { tree_id: TREE_ID, kind: 'family', display_title: '季氏测试家族', hall_name: '三让堂', is_master: false },
      [OTHER_TREE_ID]: { tree_id: OTHER_TREE_ID, kind: 'family', display_title: '潘氏测试家族', hall_name: '', is_master: false },
    },
  }),
);
fs.writeFileSync(path.join(TMP, 'trees', `${TREE_ID}.json`), JSON.stringify(TREE, null, 2));
fs.writeFileSync(path.join(TMP, 'trees', `${OTHER_TREE_ID}.json`), JSON.stringify(OTHER_TREE, null, 2));

const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');
const { colGet, listAll } = await import('./store.js');
const { getAssets } = await import('./economy-ledger.js');
const invc = await import('./invite-codes.js');

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
const treeHeaders = (extra = {}) => ({ 'X-Tree-Id': TREE_ID, ...extra });
const anchorOf = async (phone) => json(await call('/api/admin/get-anchor', 'GET', bearer(U.chief, 'chief_editor'), null, { phone })).anchor;
const logsOf = async () =>
  (await listAll('jiapu_ops_logs')).map((d) => {
    const rec = { ...d };
    delete rec._id;
    delete rec.version;
    return rec;
  });
const codeDocs = () => JSON.parse(fs.readFileSync(path.join(TMP, 'collections', 'jiapu_invite_codes.json'), 'utf8'));
const txsOf = async (phone) => (await getAssets(phone)).txs || [];
const issue = (who, r, payload) => call('/api/invite/code', 'POST', bearer(who, r), payload);
const bind = (who, r, payload) => call('/api/invite/bind', 'POST', bearer(who, r), payload);
const resolveC = (c) => call('/api/invite/code/resolve', 'GET', {}, null, c === undefined ? {} : { c });
/** 该手机号账上 `ref.kind === 'invite_bind'` 的流水条数（幂等读数） */
const bindTxCount = async (phone) => (await txsOf(phone)).filter((t) => t && t.ref && t.ref.kind === invc.INVITE_BIND_TX_REF).length;

const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
const MASK_OCC2 = '166****0103';

// ---- ① 签发（node 型）----

let CODE_N5 = null;
let PLAIN_CODE = null;

test('① 签发 node 型：200 + 出参形状逐字 + 6 位码表 + TTL 30 天 + max_uses=1 + 落库字段', async () => {
  const res = await issue(U.inviter, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n5' });
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.deepEqual(Object.keys(body).sort(), ['code', 'expires_at', 'kind', 'ok', 'person_handle', 'tree_id'], '出参形状逐字（url 由前端拼）');
  assert.equal(body.ok, true);
  assert.equal(body.kind, 'node');
  assert.equal(body.tree_id, TREE_ID);
  assert.equal(body.person_handle, 'n5');
  assert.match(body.code, CODE_RE, '6 位、字符集与单点字母表逐字同源');
  // ⚠️ 不得再写 `!/[01OIL]/` 这类**派生串**断言：单点字母表字面串
  //    `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` 本身**含 L**（L 与 I/1 不同形故不歧义），
  //    与字面串冲突的派生串会误红并污染后续 ④⑤⑥⑬。字符集只按单点常量判。
  assert.equal(body.code.length, 6);
  assert.ok([...body.code].every((ch) => invc.INVITE_CODE_ALPHABET.includes(ch)), '码内每一字符必须落在单点字母表内');
  assert.equal(Date.parse(body.expires_at) - Date.now() > 29.9 * 86400000, true, 'TTL 应为 30 天');
  const doc = codeDocs()[body.code];
  assert.ok(doc, '码文档必须落库');
  assert.deepEqual(Object.keys(doc).sort(), ['_id', 'created_at', 'expires_at', 'inviter_phone', 'kind', 'max_uses', 'person_handle', 'revoked_at', 'tree_id', 'used_by', 'used_count']);
  assert.equal(doc.max_uses, 1, 'node 型一次性');
  assert.equal(doc.used_count, 0);
  assert.deepEqual(doc.used_by, []);
  assert.equal(doc.revoked_at, null);
  assert.equal(doc.inviter_phone, U.inviter);
  assert.equal(Date.parse(doc.expires_at) - Date.parse(doc.created_at), 30 * 86400000, 'TTL 逐字 30 天');
  CODE_N5 = body.code;
});

test('①′ 签发 plain 型：忽略节点参数、tree_id=null、max_uses=null（多次可用）', async () => {
  const res = await issue(U.inviter, 'user', { kind: 'plain', tree_id: TREE_ID, person_handle: 'n5' });
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.kind, 'plain');
  assert.equal(body.tree_id, null, 'plain 型忽略节点参数');
  assert.equal(body.person_handle, null);
  const doc = codeDocs()[body.code];
  assert.equal(doc.tree_id, null);
  assert.equal(doc.person_handle, null);
  assert.equal(doc.max_uses, null, 'plain 型不限次数');
  PLAIN_CODE = body.code;
});

// ---- ② 签发时节点已被绑定 ⇒ 409 ----

test('② 节点已被他人绑定 ⇒ 签发 409，且不落废码', async () => {
  const before = Object.keys(codeDocs()).length;
  const res = await issue(U.inviter, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n6' });
  assert.equal(res.statusCode, 409);
  assert.ok(!res.body.includes(U.occ), '409 文案不得下发占用者手机号');
  assert.equal(Object.keys(codeDocs()).length, before, '409 不得落任何码');
  assert.equal((await anchorOf(U.inviter)).person_handle, 'n2', '占用者锚点不受影响');
});

// ---- ②′ 已故节点 ⇒ 签发 400（Kevin 2026-10-09：已故不得发起入族邀请）----

test('②′ 已故节点（is_living === false）签 node 型 ⇒ 400 文案逐字 + 不落任何码；缺省 is_living 不受影响', async () => {
  const before = Object.keys(codeDocs()).length;
  const res = await issue(U.inviter, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n25' });
  assert.equal(res.statusCode, 400);
  assert.equal(json(res).error, '已故节点不可发起入族邀请', '文案逐字（前端 inviteErrorText 透出后端原文）');
  assert.equal(Object.keys(codeDocs()).length, before, '400 不得落任何码文档');
  // 对照：is_living 缺省（三态口径 = 不算已故）的节点照常签发 200（n8，无其它用例引用）
  const alive = await issue(U.inviter, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n8' });
  assert.equal(alive.statusCode, 200, 'is_living 缺省不算已故，签发不受守卫影响');
});

// ---- ③ 签发权限 ----

test('③ 非本树成员签发 ⇒ 403（别树成员 / 无锚点）；chief_editor 放行', async () => {
  const r1 = await issue(U.outsider, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n7' });
  assert.equal(r1.statusCode, 403);
  const r2 = await issue(U.noanchor, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n7' });
  assert.equal(r2.statusCode, 403);
  const ok = await issue(U.chief, 'chief_editor', { kind: 'node', tree_id: TREE_ID, person_handle: 'n7' });
  assert.equal(ok.statusCode, 200);
  assert.equal(json(ok).person_handle, 'n7');
  // 树 / 节点不存在 ⇒ 404（先于 409 / 403）
  const r404a = await issue(U.inviter, 'user', { kind: 'node', tree_id: 'no_such_tree_01', person_handle: 'n5' });
  assert.equal(r404a.statusCode, 404);
  const r404b = await issue(U.inviter, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'ghost_x' });
  assert.equal(r404b.statusCode, 404);
  assert.match(json(r404b).error, /ghost_x/);
});

// ---- ④ resolve 五态 + 零手机号 ----

test('④ resolve：五态齐备 + 免登录 + 落点信息 + 零手机号', async () => {
  const ok = await resolveC(CODE_N5); // 无 Authorization header
  assert.equal(ok.statusCode, 200);
  const v = json(ok);
  assert.equal(v.valid, true);
  assert.equal(v.kind, 'node');
  assert.equal(v.tree_id, TREE_ID);
  assert.equal(v.tree_name, '季氏测试家族');
  assert.equal(v.hall_name, '三让堂');
  assert.equal(v.person_handle, 'n5');
  assert.equal(v.person_name, '季第5');
  assert.equal(v.person_gender, 'M');
  assert.equal(v.can_bind, true);
  assert.equal(v.inviter_nickname, `用户${U.inviter.slice(-3)}`);
  assert.ok(!/\d{11}/.test(ok.body), `resolve 出参不得含 11 位手机号（实测 ${ok.body}）`);

  const expired = json(await resolveC('222222'));
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, 'expired');
  assert.equal(expired.can_bind, false);
  const revoked = json(await resolveC('333333'));
  assert.equal(revoked.reason, 'revoked');
  const used = json(await resolveC('444444'));
  assert.equal(used.reason, 'used');
  const nf = json(await resolveC('555555'));
  assert.equal(nf.reason, 'not_found');
  const missing = json(await resolveC());
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, 'not_found');
  // plain 型：无节点信息、不可直接 accept
  const plain = json(await resolveC(PLAIN_CODE));
  assert.equal(plain.valid, true);
  assert.equal(plain.kind, 'plain');
  assert.equal(plain.tree_id, null);
  assert.equal(plain.can_bind, false);
  assert.equal(plain.person_handle, null);
});

// ---- ⑤ X-Invite-Code 放行（+ 逐字回落）----

test('⑤ X-Invite-Code：同树有效码 ⇒ 不裁剪（= member 读数）；无码 / 无效 / 异树 ⇒ 逐字相同', async () => {
  const baselinePeople = json(await call('/api/people', 'GET', treeHeaders()));
  const baselineFams = json(await call('/api/families', 'GET', treeHeaders()));
  assert.equal(baselinePeople.length, DEPTH - 18, 'guest 基线：藏树梢 18 世');
  assert.equal(baselineFams.length, DEPTH - 18 - 1);

  const memberPeople = json(await call('/api/people', 'GET', treeHeaders(bearer(U.inviter, 'user'))));
  const memberFams = json(await call('/api/families', 'GET', treeHeaders(bearer(U.inviter, 'user'))));
  assert.equal(memberPeople.length, DEPTH, 'member 读数 = 整树');
  assert.equal(memberFams.length, DEPTH - 1);

  // 持码（匿名）⇒ 与 member 读数**逐字相同**
  const withCodePeople = await call('/api/people', 'GET', treeHeaders({ 'X-Invite-Code': CODE_N5 }));
  const withCodeFams = await call('/api/families', 'GET', treeHeaders({ 'X-Invite-Code': CODE_N5 }));
  assert.equal(json(withCodePeople).length, DEPTH, '持有效同树码 ⇒ 节点数变多到整树（等于未裁剪）');
  assert.deepEqual(json(withCodePeople), memberPeople, '持码读数与 member 逐字相同');
  assert.deepEqual(json(withCodeFams), memberFams, 'families 侧同');

  // 异树码（chief 为 OTHER_TREE 签发；p2 未被占用）
  const otherCode = json(await issue(U.chief, 'chief_editor', { kind: 'node', tree_id: OTHER_TREE_ID, person_handle: 'p2' })).code;

  const cases = [
    ['无码', treeHeaders()],
    ['无效码', treeHeaders({ 'X-Invite-Code': '555555' })],
    ['过期码', treeHeaders({ 'X-Invite-Code': '222222' })],
    ['已撤销码', treeHeaders({ 'X-Invite-Code': '333333' })],
    ['异树码', treeHeaders({ 'X-Invite-Code': otherCode })],
    ['plain 型码（tree_id=null）', treeHeaders({ 'X-Invite-Code': PLAIN_CODE })],
  ];
  for (const [label, headers] of cases) {
    assert.deepEqual(json(await call('/api/people', 'GET', headers)), baselinePeople, `${label}：/people 必须逐字回落既有裁剪`);
    assert.deepEqual(json(await call('/api/families', 'GET', headers)), baselineFams, `${label}：/families 必须逐字回落`);
  }
  // 其余读路由**不认**该头（定点例外：只有两条列表路由）
  const searchBase = json(await call('/api/search', 'GET', treeHeaders(), null, { query: '季' }));
  const searchWithCode = json(await call('/api/search', 'GET', treeHeaders({ 'X-Invite-Code': CODE_N5 }), null, { query: '季' }));
  assert.deepEqual(searchWithCode, searchBase, '/search 不受 X-Invite-Code 影响');
});

// ---- ⑥ bind accept ----

test('⑥ bind accept：200 + 锚点落盘（带 via_invite_code）+ used_count=1 + 重放 ⇒ 400 您已处理过该邀请', async () => {
  const res = await bind(U.newbie, 'user', { c: CODE_N5, decision: 'accept' });
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.ok, true);
  assert.equal(body.bound, true);
  assert.deepEqual(body.anchor, { tree_id: TREE_ID, person_handle: 'n5' }, 'accept = 用码内建议节点');
  assert.ok(body.rewards, 'accept 真绑定 ⇒ 带 rewards');

  const anchor = await anchorOf(U.newbie);
  assert.equal(anchor.person_handle, 'n5');
  assert.equal(anchor.tree_id, TREE_ID);
  assert.equal(anchor.via_invite_code, CODE_N5, '锚点须带 via_invite_code（审计）');

  const doc = codeDocs()[CODE_N5];
  assert.equal(doc.used_count, 1, 'node 型消耗');
  assert.deepEqual(doc.used_by, [U.newbie]);
  assert.ok(doc.used_at, 'used_at 必须落');
  assert.deepEqual(doc.bound_by, [U.newbie]);

  const replay = await bind(U.newbie, 'user', { c: CODE_N5, decision: 'accept' });
  assert.equal(replay.statusCode, 400);
  assert.equal(json(replay).error, '您已处理过该邀请');
  assert.equal(codeDocs()[CODE_N5].used_count, 1, '重放不得二次消耗');
  assert.equal((await resolveC(CODE_N5)).statusCode, 200);
  assert.equal(json(await resolveC(CODE_N5)).reason, 'used', '消耗后 resolve = used');
});

// ---- ⑦ bind skip 不消耗 ----

test('⑦ bind skip：不写锚点、不消耗（另一用户仍可 accept 同码）', async () => {
  const c = json(await issue(U.inviter, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n10' })).code;
  const skip = await bind(U.newbie2, 'user', { c, decision: 'skip' });
  assert.equal(skip.statusCode, 200);
  assert.equal(json(skip).bound, false);
  assert.equal(json(skip).anchor, null);
  assert.equal(json(skip).rewards, undefined, 'skip 不发加成');
  assert.equal(await anchorOf(U.newbie2), null, 'skip 不写锚点');
  assert.equal(codeDocs()[c].used_count, 0, 'skip 不消耗');
  assert.deepEqual(codeDocs()[c].bound_by, [U.newbie2], '仍记接受（幂等闸门）');
  assert.equal(json(await resolveC(c)).valid, true, 'skip 后码仍有效');

  const accept = await bind(U.newbie3, 'user', { c, decision: 'accept' });
  assert.equal(accept.statusCode, 200, '另一用户仍可 accept 同码');
  assert.deepEqual(json(accept).anchor, { tree_id: TREE_ID, person_handle: 'n10' });
  assert.equal(codeDocs()[c].used_count, 1);
  assert.deepEqual(codeDocs()[c].used_by, [U.newbie3]);
  const replaySkip = await bind(U.newbie2, 'user', { c, decision: 'skip' });
  assert.equal(json(replaySkip).error, '您已处理过该邀请');
});

// ---- ⑧ plain 型多次可用 ----

test('⑧ plain 型：多人可用（skip + replace 各 200），永不消耗', async () => {
  const s1 = await bind(U.newbie4, 'user', { c: PLAIN_CODE, decision: 'skip' });
  assert.equal(s1.statusCode, 200);
  assert.equal(json(s1).bound, false);

  const r2 = await bind(U.newbie5, 'user', { c: PLAIN_CODE, decision: 'replace', tree_id: TREE_ID, person_handle: 'n11' });
  assert.equal(r2.statusCode, 200, 'plain 型多次可用');
  assert.deepEqual(json(r2).anchor, { tree_id: TREE_ID, person_handle: 'n11' });
  const doc = codeDocs()[PLAIN_CODE];
  assert.equal(doc.used_count, 0, 'plain 型不消耗');
  assert.equal(doc.max_uses, null);
  assert.deepEqual(doc.bound_by, [U.newbie4, U.newbie5]);
  assert.equal(json(await resolveC(PLAIN_CODE)).valid, true, 'plain 型仍可用');

  // accept 用 plain 型 ⇒ 400（无建议节点）
  const bad = await bind(U.fake, 'user', { c: PLAIN_CODE, decision: 'accept' });
  assert.equal(bad.statusCode, 400);
  assert.match(json(bad).error, /不含建议节点/);
  assert.equal(await anchorOf(U.fake), null);
});

// ---- ⑨ 奖励（档乙）+ 幂等 ----

test('⑨ 奖励：两方各自 delta 逐条 + 重放不双发 + 跨码不重发被邀请人', async () => {
  const c1 = json(await issue(U.inviterR, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n12' })).code;
  const res = await bind(U.newbieR, 'user', { c: c1, decision: 'accept' });
  assert.equal(res.statusCode, 200);
  const rewards = json(res).rewards;
  assert.equal(rewards.invitee.granted, true);
  assert.equal(rewards.inviter.granted, true);

  // 被邀请人：+30 石榴籽碎片（满 10 自动合成 → 3 颗籽、余 0；流水 delta 记 30）
  const inviteeTxs = await txsOf(U.newbieR);
  const inviteeBonus = inviteeTxs.filter((t) => t.ref && t.ref.kind === invc.INVITE_BIND_TX_REF);
  assert.equal(inviteeBonus.length, 1);
  assert.deepEqual(inviteeBonus[0].delta, { fragments: 30 });
  assert.equal(inviteeBonus[0].type, 'reward', '不新增 Tx.type');
  const inviteeAssets = await getAssets(U.newbieR);
  assert.equal(inviteeAssets.fragments, 0, '30 碎片满 10 自动合成 3 颗籽、余 0');
  assert.equal(inviteeAssets.seeds.reduce((s, l) => s + l.qty, 0), 3);

  // 邀请人：基础（沿用 applyInvite：9 碎片 + 11 残页）+ 加成（+1 残页 +10 竹片）
  const inviterTxs = await txsOf(U.inviterR);
  const bonus = inviterTxs.filter((t) => t.ref && t.ref.source === invc.INVITE_BIND_TX_SOURCE);
  assert.equal(bonus.length, 1, '加成流水恰一条');
  assert.deepEqual(bonus[0].delta, { scroll_fragments: 1, bamboos: 10 }, '档乙：+1 兰帖残页 +10 竹片');
  assert.equal(bonus[0].type, 'reward');
  assert.equal(bonus[0].ref.kind, 'invite', '邀请人侧沿用既有日限计数器（ref.kind=invite）');
  const base = inviterTxs.filter((t) => t.ref && t.ref.kind === 'invite' && !t.ref.source);
  assert.equal(base.length, 1, '基础奖励沿用既有 applyInvite（一条）');
  assert.deepEqual(base[0].delta, { fragments: 9, scroll_fragments: 11 });
  const inviterAssets = await getAssets(U.inviterR);
  assert.equal(inviterAssets.scroll_fragments, 12, '11 基础 + 1 加成');
  assert.equal(inviterAssets.bamboos.reduce((s, l) => s + l.qty, 0), 10);
  assert.equal(inviterAssets.fragments, 9);
  assert.ok(await colGet('jiapu_invites', U.newbieR), '基础关系落 jiapu_invites（applyInvite 语义）');

  // 重放：400 + 不双发
  const replay = await bind(U.newbieR, 'user', { c: c1, decision: 'accept' });
  assert.equal(replay.statusCode, 400);
  assert.equal(json(replay).error, '您已处理过该邀请');
  assert.equal(await bindTxCount(U.newbieR), 1, '重放不得二次入账');
  assert.equal((await txsOf(U.inviterR)).filter((t) => t.ref && t.ref.source === invc.INVITE_BIND_TX_SOURCE).length, 1);

  // 跨码：同一被邀请人再走另一条码 ⇒ 200 但**不重发**（同一被邀请人只发一次）
  const c2 = json(await issue(U.inviterR, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n13' })).code;
  const second = await bind(U.newbieR, 'user', { c: c2, decision: 'replace', tree_id: TREE_ID, person_handle: 'n13' });
  assert.equal(second.statusCode, 200);
  const r2 = json(second).rewards;
  assert.equal(r2.invitee.granted, false);
  assert.equal(r2.invitee.reason, 'already_rewarded');
  assert.equal(await bindTxCount(U.newbieR), 1, '跨码不得重发被邀请人奖励');
  assert.equal((await txsOf(U.inviterR)).filter((t) => t.ref && t.ref.source === invc.INVITE_BIND_TX_SOURCE).length, 1, '跨码不得重发邀请人加成');
});

// ---- ⑩ 防伪造：明文参数不具绑定效力 ----

test('⑩ 明文 tree_id / person_handle 但无 c ⇒ 400 且零绑定（防伪造）', async () => {
  const anchorsBefore = fs.readFileSync(path.join(TMP, 'collections', 'jiapu_anchors.json'), 'utf8');
  const res = await bind(U.fake, 'user', { decision: 'replace', tree_id: TREE_ID, person_handle: 'n14' });
  assert.equal(res.statusCode, 400);
  assert.match(json(res).error, /c 必填/);
  const res2 = await bind(U.fake, 'user', { decision: 'accept', tree_id: TREE_ID, person_handle: 'n14' });
  assert.equal(res2.statusCode, 400);
  assert.equal(await anchorOf(U.fake), null, '无 c ⇒ 不产生任何绑定');
  assert.equal(fs.readFileSync(path.join(TMP, 'collections', 'jiapu_anchors.json'), 'utf8'), anchorsBefore, '锚点集合逐字节不变');
});

// ---- ⑪ 批 A 缺口：force 覆盖清锚点 + 审计 ----

test('⑪ force 覆盖：原占用者锚点已清空 + 审计记录已写 + reassigned_from 脱敏', async () => {
  assert.equal((await anchorOf(U.occ2)).person_handle, 'n23', '前置：n23 被 occ2 占用');
  const logsBefore = (await logsOf()).length;

  const res = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.forcee,
    tree_id: TREE_ID,
    person_handle: 'n23',
    force: true,
  });
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.ok, true);
  assert.equal(body.reassigned_from, MASK_OCC2, '响应带 reassigned_from（脱敏）');
  assert.ok(!res.body.includes(U.occ2), `不得下发被移除者完整手机号（实测 ${res.body}）`);

  assert.equal(await anchorOf(U.occ2), null, '原占用者锚点必须被一并清空（否则并存两条指向同一节点）');
  assert.equal((await anchorOf(U.forcee)).person_handle, 'n23');
  // 全站唯一复核：扫全表，n23 恰一条
  const anchorsDoc = JSON.parse(fs.readFileSync(path.join(TMP, 'collections', 'jiapu_anchors.json'), 'utf8'));
  const holders = Object.values(anchorsDoc).filter((a) => a && a.person_handle === 'n23');
  assert.equal(holders.length, 1, '同一 handle 全表恰一条');
  assert.equal(holders[0]._id, U.forcee);

  const logs = await logsOf();
  assert.equal(logs.length, logsBefore + 1, '审计恰追加一条');
  const hit = logs.find((l) => l.reason === 'anchor_force_reassign');
  assert.ok(hit, '审计记录必须写（复用既有 ops log 机制）');
  assert.equal(hit.operator, U.chief, '记录操作者');
  assert.equal(hit.target_phone, U.occ2, '记录被移除的手机号（内部字段，不下发接口）');
  assert.equal(hit.ref.tree_id, TREE_ID);
  assert.equal(hit.ref.person_handle, 'n23', '记录目标节点');
  assert.ok(Date.parse(hit.ts) > 0, '记录时点');
  assert.equal(hit.ref.reassigned_from, MASK_OCC2);

  // 无覆盖 ⇒ reassigned_from 为 null（普通改绑不受影响）
  const plain = await call('/api/admin/set-anchor', 'POST', bearer(U.chief, 'chief_editor'), {
    phone: U.forcee,
    tree_id: TREE_ID,
    person_handle: 'n24',
  });
  assert.equal(plain.statusCode, 200);
  assert.equal(json(plain).reassigned_from, null);

  // 单点函数仍只此一份口径
  assert.equal((SCOPE_SRC.match(/colAll\('jiapu_anchors'\)/g) || []).length, 1);
  assert.match(SCOPE_SRC, /await clearAnchor\(occupierPhone\)/);
  assert.match(SCOPE_SRC, /reason: 'anchor_force_reassign'/);
});

// ---- ⑫ 权限 / 入参闸门 ----

test('⑫ 权限与入参闸门：401 / 400 各态', async () => {
  const noAuth1 = await call('/api/invite/code', 'POST', {}, { kind: 'plain' });
  assert.equal(noAuth1.statusCode, 401);
  const noAuth2 = await call('/api/invite/bind', 'POST', {}, { c: '222222', decision: 'skip' });
  assert.equal(noAuth2.statusCode, 401);
  assert.equal((await call('/api/invite/code', 'POST', bearer(U.inviter, 'user'), { kind: 'xxx' })).statusCode, 400);
  assert.equal((await call('/api/invite/code', 'POST', bearer(U.inviter, 'user'), { kind: 'node', tree_id: TREE_ID })).statusCode, 400);
  assert.equal((await bind(U.fake, 'user', { c: '555555', decision: 'skip' })).statusCode, 400);
  assert.equal((await bind(U.fake, 'user', { c: PLAIN_CODE, decision: 'nope' })).statusCode, 400);
  assert.equal((await bind(U.fake, 'user', { decision: 'skip' })).statusCode, 400);
  // replace 缺节点 ⇒ 400
  const c = json(await issue(U.inviter, 'user', { kind: 'node', tree_id: TREE_ID, person_handle: 'n15' })).code;
  const noNode = await bind(U.fake, 'user', { c, decision: 'replace' });
  assert.equal(noNode.statusCode, 400);
  assert.match(json(noNode).error, /tree_id \+ person_handle/);
  // 节点不存在 / 已被占用（replace 走同一单点函数）
  const ghost = await bind(U.fake, 'user', { c, decision: 'replace', tree_id: TREE_ID, person_handle: 'ghost_y' });
  assert.equal(ghost.statusCode, 404);
  const taken = await bind(U.fake, 'user', { c, decision: 'replace', tree_id: TREE_ID, person_handle: 'n2' });
  assert.equal(taken.statusCode, 409);
  assert.ok(!taken.body.includes(U.inviter), '409 不得下发占用者手机号');
  assert.equal(await anchorOf(U.fake), null);
  // 本路由**不适用 force**：body 里夹带 `force:true`（哪怕 chief）也只能 409，绝不覆盖
  const forceInject = await bind(U.chief, 'chief_editor', { c, decision: 'replace', tree_id: TREE_ID, person_handle: 'n2', force: true });
  assert.equal(forceInject.statusCode, 409, 'bind 路由的 force 一律忽略（用码换节点不走覆盖通道）');
  assert.equal((await anchorOf(U.inviter)).person_handle, 'n2', '原占用者锚点不得被 bind 覆盖');
  // 码状态闸门
  assert.match(json(await bind(U.fake, 'user', { c: '222222', decision: 'skip' })).error, /过期/);
  assert.match(json(await bind(U.fake, 'user', { c: '333333', decision: 'replace', tree_id: TREE_ID, person_handle: 'n16' })).error, /撤销/);
  assert.match(json(await bind(U.fake, 'user', { c: '444444', decision: 'replace', tree_id: TREE_ID, person_handle: 'n16' })).error, /已使用/);
  assert.equal(await anchorOf(U.fake), null);
});

// ---- ⑬ 口径单点（源码判据）----

test('⑬ 源码判据：三条路由注册在树编辑闸门之前；X-Invite-Code 恰两处；码表无 0/O/1/I/L', async () => {
  const gate = INDEX_SRC.indexOf("if (!treeId) return send(400, { error: '缺少 X-Tree-Id' })");
  assert.ok(gate > 0);
  for (const p of ["pathname === '/invite/code'", "pathname === '/invite/code/resolve'", "pathname === '/invite/bind'"]) {
    const idx = INDEX_SRC.indexOf(p);
    assert.ok(idx > 0, `${p} 必须存在`);
    assert.ok(idx < gate, `${p} 必须注册在树编辑闸门之前`);
  }
  assert.equal((INDEX_SRC.match(/header\('x-invite-code'\)/g) || []).length, 2, 'X-Invite-Code 只对 /people 与 /families 生效');
  assert.equal((INDEX_SRC.match(/resolveInviteCodeAccess\(/g) || []).length, 3, '1 处定义 + 2 处调用');
  assert.equal(invc.INVITE_CODE_ALPHABET.length, 32);
  // 契约给的字母表**逐字保留**：`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`
  // ⚠️ 契约括注写「无 0/O/1/I/L」，但该**字面串含 L**（8 数字 + 24 字母 = 32 位；若真去掉 L 只剩 31 位）
  //    → 按「字面值优先」保留原串，差异已登记在交付报告（常量单点，一句话可改）。
  assert.equal(invc.INVITE_CODE_ALPHABET, '23456789ABCDEFGHJKLMNPQRSTUVWXYZ');
  assert.ok(!/[01OI]/.test(invc.INVITE_CODE_ALPHABET), '不含易混的 0 / 1 / O / I');
  assert.equal(invc.INVITE_CODE_LEN, 6);
  assert.equal(invc.INVITE_CODE_TTL_DAYS, 30);
  assert.equal(invc.INVITE_CODE_MAX_ATTEMPTS, 5, '碰撞重试 ≤5');
  // 档乙单点常量（Kevin 未定档 · Zang 取建议档乙 · 一句话可改）
  assert.equal(invc.INVITE_BIND_REWARD_INVITER_SCROLL_FRAGMENTS, 1);
  assert.equal(invc.INVITE_BIND_REWARD_INVITER_BAMBOO_PIECES, 10);
  assert.equal(invc.INVITE_BIND_REWARD_INVITEE_FRAGMENTS, 30);
  // 新集合必须进 upload 脚本（AGENTS.md §8：漏了云端首写报错）
  assert.match(UPLOAD_SRC, /'jiapu_invite_codes'/);
  // /invite/bind 的绑定校验：走同一单点函数，且**传参里不出现 force**（本路由不适用 force）
  const bindCall = INVC_SRC.match(/assertAnchorBindable\(finalHandle, me, \{[^}]*\}\)/);
  assert.ok(bindCall, '/invite/bind 必须走 assertAnchorBindable 单点（含全站唯一 409）');
  assert.ok(!/force/.test(bindCall[0]), `/invite/bind 校验调用不得出现 force（实测 ${bindCall[0]}）`);
  assert.equal((INVC_SRC.match(/colAll\('jiapu_anchors'\)/g) || []).length, 0, '本模块不得自扫锚点全表（唯一性口径只在 lib/scope.js）');
  assert.equal((INVC_SRC.match(/colSet\('jiapu_anchors'/g) || []).length, 0, '本模块不得直写锚点集合（写入只走 scope.setAnchor）');
  // 纯函数判据：状态机五态
  assert.equal(invc.inviteCodeState(null), 'not_found');
  assert.equal(invc.inviteCodeState({ expires_at: past, max_uses: null }), 'expired');
  assert.equal(invc.inviteCodeState({ expires_at: future, revoked_at: past, max_uses: null }), 'revoked');
  assert.equal(invc.inviteCodeState({ expires_at: future, max_uses: 1, used_count: 1 }), 'used');
  assert.equal(invc.inviteCodeState({ expires_at: future, max_uses: null, used_count: 9 }), 'valid');
  assert.equal(invc.inviteCodeState({ expires_at: future, max_uses: 1, used_count: 0 }), 'valid');
  assert.equal(invc.inviteCodeShapeOk('ABCDEF'), true);
  assert.equal(invc.randomInviteCode().length, 6);
  assert.ok(CODE_RE.test(invc.randomInviteCode()));
});

// ---- ⑭ 真源零写入 ----

test('⑭ 真源零写入：config/ + migrate-output/ 全量指纹与本文件开工时逐字节一致', () => {
  const after = realSourceFingerprint();
  assert.equal(after.count, REAL_FP_BEFORE.count);
  assert.equal(after.digest, REAL_FP_BEFORE.digest);
});
