/**
 * 钱包模块单测（路 B 重构第 3 期）— lib/wallet.js + `/wallet/balance` / `/wallet/recharge` / `PUT /admin/wallet-fee`
 * 规格：docs/economy.spec.md §12-3（人民币钱包收缩）· docs/branch-clan-ops.spec.md §5-4 ·
 *       路 B 存储形态 v2（每手机号一档 + config 单档 + 平台流水单档，Zang 裁定 2026-10-03）
 *
 * 覆盖：
 *  ① 常量与默认值：默认建树费 990 分 / 立支费 9999 / 汇宗比例 0.5 / 签到三键默认；空档读余额 0；
 *  ② 余额读写往返 + **存储形态 v2**：`_id=手机号`、`version≥1`、`balance_cents` + `txs`、无 global 单文档；
 *     用户流水落在本人档的 `txs`（不在 config / _platform）；
 *  ③ 充值 / 扣费（deductUserBalance）/ 建树费（deductTreeCreateFee）取值与流水字段（amount_cents 符号）；
 *  ④ 出参形状：`getWalletOverview` 恒 3 键、不含 `_id`/`version`；`recharge` 返回数字；配置读接口默认回退；
 *  ⑤ 配置类单档 `_id='config'`（原值原样 + version）；治理路由 `PUT /admin/wallet-fee` 落 config 档；
 *  ⑥ 路由：`GET /wallet/balance`（形状不变、401）/ `POST /wallet/recharge`（金额校验、余额叠加）；
 *  ⑦ 并发扣款（Promise.all 两路同一手机号）：不超扣、不为负、`txs` 条数与余额精确；
 *  ⑧ CAS 并发（绕开进程内锁直击 `store.mutateDoc`）：条件写冲突被重读重放，零丢更新、version 精确；
 *  ⑧-2 反证：同序下「无条件写（colSet）」丢更新 ⇒ 证明 ⑧ 的断言不是摆设；
 *  ⑨ 平台流水：无 `user` 的流水落 `_platform` 档，并出现在任意用户的 `getWalletOverview().transactions`；
 *  ⑩ 真源零写入：`config/tree-meta.json` 与 `migrate-output/`（trees/ + collections/）逐字节未变。
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（照 assets.test.js）。
 * 运行：node --test cloudfunctions/compat-api/lib/wallet.test.js
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
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-wallet-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaRaw = fs.readFileSync(REAL_META, 'utf8');
const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = new Map(fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]));
const realColBaseline = new Map(fs.readdirSync(REAL_COLLECTIONS).map((f) => [f, md5(path.join(REAL_COLLECTIONS, f))]));

const USER = '16600009901';
const OTHER = '16600009902';
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_users.json'),
  JSON.stringify({
    [USER]: { _id: USER, phone: USER, nickname: '钱包测试用户', role: 'user' },
    [OTHER]: { _id: OTHER, phone: OTHER, nickname: '钱包测试用户二', role: 'user' },
  }),
);

const W = await import('./wallet.js');
const store = await import('./store.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const WALLETS_FILE = path.join(TMP, 'collections', 'jiapu_wallets.json');
const rawCollection = () => JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
const bearer = (phone) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: 'user' }, 3600)}` });
const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({ path: p, httpMethod: method, headers, queryStringParameters: query, body: body ? JSON.stringify(body) : undefined });
const json = (res) => JSON.parse(res.body);

/** 重置钱包集合为空（每例独立起点；走 store 删除以保持进程内缓存一致） */
const resetWallets = async () => {
  for (const d of await store.colAll('jiapu_wallets')) await store.colDelete('jiapu_wallets', d._id);
};

// ---- ① 常量与默认值 ----

test('① 常量与默认值：建树费 990 分 / 立支费 9999 / 汇宗 0.5 / 签到三键；空档余额 0、建树费默认', async () => {
  await resetWallets();
  assert.equal(W.DEFAULT_BRANCH_FEE_SEEDS, 9999);
  assert.equal(W.DEFAULT_CONVERGE_SPIRIT_RATIO, 0.5);
  assert.equal(W.DEFAULT_SIGNIN_MAKEUP_COST_BAMBOOS, 2);
  assert.equal(W.DEFAULT_SIGNIN_DAY7_FRAGMENTS, 10);
  assert.deepEqual(W.DEFAULT_SIGNIN_POOL, [
    { kind: 'fragment', qty: 1, weight: 50 },
    { kind: 'bamboo', qty: 10, weight: 35 },
    { kind: 'scrollFragment', qty: 1, weight: 15 },
  ]);
  assert.equal(await W.getUserBalance(USER), 0, '空档余额 = 0');
  assert.equal(await W.getTreeCreateFeeCents(), 990, '建树费默认 990 分（¥9.90）');
  assert.equal(await W.getBranchFeeSeeds(), 9999);
  assert.equal(await W.getConvergeSpiritRatio(), 0.5);
  assert.deepEqual(await W.getSigninPool(), W.DEFAULT_SIGNIN_POOL);
  assert.equal(W.walletIdOf(' 16600009901 '), '16600009901', '档 id = 手机号明文（trim）');
});

// ---- ② 余额读写往返 + 存储形态 v2 ----

test('② v2 存储形态：充值后 `_id=手机号` 档带 version/balance_cents/txs，无 global；流水落本人 txs；出参不含元字段', async () => {
  await resetWallets();
  assert.equal(await W.recharge(USER, 5000), 5000);
  assert.equal(await W.getUserBalance(USER), 5000);

  const raw = rawCollection();
  assert.equal('global' in raw, false, '旧单文档 _id=global 必须消失');
  assert.ok(raw[USER], '必须存在以手机号为键的档');
  assert.equal(raw[USER]._id, USER, '档 _id = 手机号明文');
  assert.ok(Number.isInteger(raw[USER].version) && raw[USER].version >= 1, '每档必带 version（自 1 起）');
  assert.equal(raw[USER].balance_cents, 5000);
  assert.ok(Array.isArray(raw[USER].txs) && raw[USER].txs.length === 1, '充值流水落在本人档 txs');
  assert.equal(raw[USER].txs[0].type, 'recharge');
  assert.equal(raw[USER].txs[0].user, USER);
  assert.equal(raw[USER].txs[0].amount_cents, 5000);
  assert.ok(Number.isFinite(Date.parse(raw[USER].txs[0].ts)), 'ts 为 ISO 时刻');
  assert.equal('transactions' in raw[USER], false, 'v2 不再有 transactions 键（改 txs）');

  const ov = await W.getWalletOverview(USER);
  assert.deepEqual(Object.keys(ov).sort(), ['transactions', 'tree_create_fee_yuan', 'user_balance_yuan'].sort());
  assert.equal('_id' in ov, false, 'getWalletOverview 出参不含 _id');
  assert.equal('version' in ov, false, 'getWalletOverview 出参不含 version');
  assert.equal(ov.user_balance_yuan, '50.00');
  assert.equal(ov.tree_create_fee_yuan, '9.90');
  assert.equal(ov.transactions.length, 1);
  assert.deepEqual(Object.keys(ov.transactions[0]).sort(), ['amount_cents', 'desc', 'id', 'ts', 'type', 'user'].sort());
  assert.equal('_id' in ov.transactions[0], false);
  assert.equal('version' in ov.transactions[0], false);
});

// ---- ③ 充值 / 扣费 / 建树费 ----

test('③ 充值 / deductUserBalance / deductTreeCreateFee：取值与流水符号精确；余额不足抛错且零写入', async () => {
  await resetWallets();
  await W.recharge(USER, 10000);
  assert.equal(await W.deductUserBalance(USER, 1234, { type: 'official_bamboo', desc: '购买官方竹简' }), 10000 - 1234);

  await W.setTreeCreateFeeCents(1500);
  assert.equal(await W.getTreeCreateFeeCents(), 1500, '建树费配置生效');
  assert.equal(await W.deductTreeCreateFee(USER), 10000 - 1234 - 1500);

  const raw = rawCollection();
  const txs = raw[USER].txs;
  assert.deepEqual(txs.map((t) => t.type), ['recharge', 'official_bamboo', 'tree_create_fee']);
  assert.equal(txs[1].amount_cents, -1234);
  assert.equal(txs[2].amount_cents, -1500);
  assert.match(txs[2].desc, /新建家族树费用 ¥15\.00/);
  assert.equal(raw[USER].balance_cents, 10000 - 1234 - 1500, '余额与流水在同一 CAS mutator 内一致');

  // 余额不足：抛错，且一字节不写（余额 / 流水都不变）
  const before = JSON.stringify(raw[USER]);
  await assert.rejects(() => W.deductUserBalance(USER, 999999), /余额不足/);
  assert.equal(JSON.stringify(rawCollection()[USER]), before, '不足：零写入');
  await assert.rejects(() => W.deductTreeCreateFee('16600008888'), /余额不足，新建家族树需要/);

  // 非法金额前置校验
  await assert.rejects(() => W.recharge(USER, 0), /充值金额必须大于 0/);
  await assert.rejects(() => W.deductUserBalance(USER, -5), /扣款金额必须大于 0/);
  await assert.rejects(() => W.setTreeCreateFeeCents(0), /费用必须大于 0/);
});

// ---- ④ 配置类单档 + 治理路由 ----

test('④ config 单档 `_id=config`：原值原样 + version；PUT /admin/wallet-fee 落该档；读接口默认回退', async () => {
  await resetWallets();
  const CHIEF = '16600009903';
  await store.colSet('jiapu_users', CHIEF, { _id: CHIEF, phone: CHIEF, nickname: '钱包总编', role: 'chief_editor' });
  const chief = { authorization: `Bearer ${signJwt({ sub: CHIEF, phone: CHIEF, role: 'chief_editor' }, 3600)}` };

  const res = await call('/admin/wallet-fee', 'PUT', chief, {}, {
    fee: 12.5,
    branch_fee_seeds: 7,
    converge_spirit_ratio: 0.25,
    signin_makeup_cost_bamboos: 4,
    signin_day7_fragments: 20,
  });
  assert.equal(res.statusCode, 200, res.body);
  const raw = rawCollection();
  assert.ok(raw.config, '必须存在 config 单档');
  assert.equal(raw.config._id, 'config');
  assert.ok(Number.isInteger(raw.config.version) && raw.config.version >= 1, 'config 档带 version');
  assert.equal(raw.config.tree_create_fee_cents, 1250);
  assert.equal(raw.config.branch_fee_seeds, 7);
  assert.equal(raw.config.converge_spirit_ratio, 0.25);
  assert.equal(raw.config.signin_makeup_cost_bamboos, 4);
  assert.equal(raw.config.signin_day7_fragments, 20);
  assert.equal('users' in raw.config, false, 'config 档不含 users');
  assert.equal('txs' in raw.config, false, 'config 档不含 txs');

  assert.equal(await W.getTreeCreateFeeCents(), 1250);
  assert.equal(await W.getBranchFeeSeeds(), 7, '设置键改后生效');
  assert.equal(await W.getConvergeSpiritRatio(), 0.25);
  assert.equal(await W.getSigninMakeupCostBamboos(), 4);
  assert.equal(await W.getSigninDay7Fragments(), 20);
  await assert.rejects(() => W.setBranchFeeSeeds(0), /正整数/);
  await assert.rejects(() => W.setConvergeSpiritRatio(1.5), /0–1/);
  await assert.rejects(() => W.setSigninPool([]), /非空数组/);
  await assert.rejects(() => W.setSigninDay7Fragments(-1), /非负整数/);

  // 非法存量写进 config 档 ⇒ 读侧一律回退默认（同 getBranchFeeSeeds 体例）
  await store.colSet('jiapu_wallets', 'config', {
    _id: 'config',
    version: 1,
    signin_pool: [],
    signin_makeup_cost_bamboos: 0,
    signin_day7_fragments: -5,
    branch_fee_seeds: 0,
    converge_spirit_ratio: 2,
  });
  assert.deepEqual(await W.getSigninPool(), W.DEFAULT_SIGNIN_POOL, '空数组 ⇒ 回退默认池');
  assert.equal(await W.getSigninMakeupCostBamboos(), 2, '0 ⇒ 回退默认 2');
  assert.equal(await W.getSigninDay7Fragments(), 10, '负数 ⇒ 回退默认 10');
  assert.equal(await W.getBranchFeeSeeds(), 9999, '0 ⇒ 回退默认 9999');
  assert.equal(await W.getConvergeSpiritRatio(), 0.5, '越界 ⇒ 回退默认 0.5');
});

// ---- ⑤ 路由（形状不变） ----

test('⑤ 路由：POST /wallet/recharge 叠加余额（金额校验）；GET /wallet/balance 出参形状不变；未登录 401', async () => {
  await resetWallets();
  const r1 = await call('/wallet/recharge', 'POST', bearer(USER), {}, { amount: 30 });
  assert.equal(r1.statusCode, 200, r1.body);
  assert.deepEqual(json(r1), { ok: true, balance_yuan: '30.00', payment: 'mock' });
  const r2 = await call('/wallet/recharge', 'POST', bearer(USER), {}, { amount: 12.34 });
  assert.equal(json(r2).balance_yuan, '42.34');
  assert.equal(await W.getUserBalance(USER), 4234);

  assert.equal((await call('/wallet/recharge', 'POST', bearer(USER), {}, { amount: 0 })).statusCode, 400);
  assert.equal((await call('/wallet/recharge', 'POST', bearer(USER), {}, { amount: -3 })).statusCode, 400);
  assert.equal((await call('/wallet/recharge', 'POST', {}, {}, { amount: 10 })).statusCode, 401);

  const bal = await call('/wallet/balance', 'GET', bearer(USER));
  assert.equal(bal.statusCode, 200);
  const ov = json(bal);
  assert.deepEqual(Object.keys(ov).sort(), ['transactions', 'tree_create_fee_yuan', 'user_balance_yuan'].sort());
  assert.equal(ov.user_balance_yuan, '42.34');
  assert.equal(ov.transactions.length, 2);
  assert.equal(ov.transactions[0].amount_cents, 1234, '流水新在前');
  assert.equal((await call('/wallet/balance', 'GET', {})).statusCode, 401);
});

// ---- ⑥ 并发扣款（不超扣 / 不为负 / 条数与余额精确） ----

test('⑥ 并发两路扣同一手机号（Promise.all）：只成功一次、不超扣、不为负、txs 条数与余额精确', async () => {
  await resetWallets();
  await W.recharge(USER, 1000); // 余额 1000 分；两路各扣 600 ⇒ 只能成功一次
  const results = await Promise.allSettled([
    W.deductUserBalance(USER, 600, { desc: '并发扣 A' }),
    W.deductUserBalance(USER, 600, { desc: '并发扣 B' }),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1, '并发扣款只能成功一次');
  assert.equal(failed.length, 1, '第二次必须被拒绝');
  assert.match(String(failed[0].reason.message), /余额不足/);

  const doc = rawCollection()[USER];
  assert.equal(doc.balance_cents, 400, '只扣一次：1000 − 600 = 400（绝不超扣 / 不为负）');
  assert.ok(doc.balance_cents >= 0, '余额绝不为负');
  assert.equal(doc.txs.filter((t) => t.type === 'official_bamboo').length, 1, '失败的一次不得写流水');
  assert.equal(doc.txs.length, 2, '充值 1 + 成功扣款 1 = 2 条，精确');
  assert.equal(await W.getUserBalance(OTHER), 0, '他人余额不受影响');
});

// ---- ⑦ CAS 并发（直击 store.mutateDoc）+ 反证 ----

test('⑦ CAS：同一档两路读改写（绕开进程内锁）→ 条件写冲突被重读重放，零丢更新、txs 与余额精确、version 递增', async () => {
  const CASPHONE = '16600009977';
  await store.mutateDoc('jiapu_wallets', CASPHONE, (d) => {
    const rec = { ...d };
    delete rec._id;
    delete rec.version;
    rec.balance_cents = 0;
    rec.txs = [];
    return rec;
  });

  let aRead;
  const aReadP = new Promise((r) => { aRead = r; });
  let releaseA;
  const gateA = new Promise((r) => { releaseA = r; });
  // A：读到后阻塞（保证 B 先完整提交 → 制造一次真实 version 冲突）
  const writerA = store.mutateDoc('jiapu_wallets', CASPHONE, async (d) => {
    const rec = { ...d };
    delete rec._id;
    delete rec.version;
    aRead();
    await gateA;
    rec.balance_cents += 100;
    rec.txs = (rec.txs || []).concat([{ id: 'tx_cas_a', user: CASPHONE, amount_cents: 100 }]);
    return rec;
  });
  await aReadP; // A 已读到 v1 并进入 mutator（阻塞中）
  await store.mutateDoc('jiapu_wallets', CASPHONE, (d) => {
    const rec = { ...d };
    delete rec._id;
    delete rec.version;
    rec.balance_cents += 100;
    rec.txs = (rec.txs || []).concat([{ id: 'tx_cas_b', user: CASPHONE, amount_cents: 100 }]);
    return rec;
  });
  releaseA(); // A 恢复：其条件写（期望 v1）必落空 → 重读重放 → v3
  await writerA;

  const doc = await store.colGet('jiapu_wallets', CASPHONE);
  assert.equal(doc.balance_cents, 200, '两路各加 100：零丢更新（若无条件写此处会少 100）');
  assert.equal(doc.txs.length, 2, '两条流水都在（未吞、未重复）');
  assert.deepEqual(doc.txs.map((t) => t.id).sort(), ['tx_cas_a', 'tx_cas_b']);
  assert.equal(doc.version, 3, 'version 精确递增：1（起点）→2（B）→3（A 重放）');
});

test('⑦-2 反证：同序下「无条件写（colSet）」丢更新 —— 证明上一条并发断言不是摆设', async () => {
  const NPHONE = '16600009978';
  const COL = 'jiapu_wallet_cas_probe';
  await store.colSet(COL, NPHONE, { _id: NPHONE, version: 1, balance_cents: 0, txs: [] });

  let aRead;
  const aReadP = new Promise((r) => { aRead = r; });
  let releaseA;
  const gateA = new Promise((r) => { releaseA = r; });
  // 朴素写路径：读到快照 → 阻塞 → 无条件整体回写（无 version 条件校验）
  const naiveA = (async () => {
    const base = JSON.parse(JSON.stringify(await store.colGet(COL, NPHONE)));
    aRead();
    await gateA;
    base.balance_cents += 100;
    base.txs = [...base.txs, 'a'];
    await store.colSet(COL, NPHONE, base);
  })();
  await aReadP;
  const baseB = JSON.parse(JSON.stringify(await store.colGet(COL, NPHONE)));
  baseB.balance_cents += 100;
  baseB.txs = [...baseB.txs, 'b'];
  await store.colSet(COL, NPHONE, baseB); // B 先提交
  releaseA();
  await naiveA; // A 用陈旧快照覆盖 → B 丢失

  const doc = await store.colGet(COL, NPHONE);
  assert.equal(doc.balance_cents, 100, '无条件写：最终只留 1 次（丢了一次更新）——此即 CAS 断言要判负的坏结果');
  assert.deepEqual(doc.txs, ['a'], 'B 的流水被 A 的陈旧快照覆盖吞掉');
  assert.notEqual(doc.balance_cents, 200, '坏结果与 CAS 正确结果（200）明确可区分 ⇒ 上一条断言有判别力');
});

// ---- ⑧ 平台流水单档 ----

test('⑧ 平台流水：无 user 的流水落 `_platform` 档，并出现在任意用户的 transactions（旧实现口径）', async () => {
  await resetWallets();
  await W.recharge(USER, 1000);
  await store.colSet('jiapu_wallets', W.PLATFORM_ID, {
    _id: W.PLATFORM_ID,
    version: 1,
    txs: [{ id: 'tx_platform_1', type: 'platform_fee', amount_cents: -10, desc: '平台费', ts: new Date().toISOString() }],
  });
  assert.equal(W.PLATFORM_ID, '_platform');
  const ovUser = await W.getWalletOverview(USER);
  assert.ok(ovUser.transactions.some((t) => t.id === 'tx_platform_1'), '本人档 + 平台档流水合并可见');
  const ovOther = await W.getWalletOverview(OTHER);
  assert.equal(ovOther.transactions.length, 1, '平台流水对任意用户可见（无 user 字段）');
  assert.equal(ovOther.user_balance_yuan, '0.00');
});

// ---- ⑨ 真源未变 ----

test('⑨ 本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/ 逐字节未变', () => {
  assert.equal(fs.readFileSync(REAL_META, 'utf8'), realMetaRaw, 'config/tree-meta.json 被改动了');
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 的 md5 变了');
  const trees = fs.readdirSync(REAL_TREES);
  assert.deepEqual(trees.sort(), [...realTreeBaseline.keys()].sort(), '真实树目录文件名/数量变了');
  for (const f of trees) assert.equal(md5(path.join(REAL_TREES, f)), realTreeBaseline.get(f), `真实树 ${f} 被改动了`);
  const cols = fs.readdirSync(REAL_COLLECTIONS);
  assert.deepEqual(cols.sort(), [...realColBaseline.keys()].sort(), '真实集合目录文件名/数量变了');
  for (const f of cols) assert.equal(md5(path.join(REAL_COLLECTIONS, f)), realColBaseline.get(f), `真实集合 ${f} 被改动了`);
});
