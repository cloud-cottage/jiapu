/**
 * 签到域单测（Zang 裁定 v1 · Kevin 2026-09-28 拍定）——
 *   连签 7 天 + 每日随机追加 + 补签 + 后台可配（`jiapu_wallets.config` 三键）+ 出参扩展（items / calendar）。
 *
 * 本文件覆盖（硬清单）：
 *   ① 常量逐字 / 无新增 Tx.type / 随机源不得用 `Date.now()`（源码判据）；
 *   ② 连签递增（昨日已签 +1）与**隔天归零**（漏签即归零）；`cycle_day = ((streak-1)%7)+1`；
 *   ③ 第 7 天额外发 `signin_day7_fragments`（默认 10）碎片（同一次 `grantRewardBase` / 同一事务）；
 *   ④ 随机池**注入确定性**：三种 kind（fragment / bamboo / scrollFragment）各命中一次（含资产读回）；
 *   ⑤ 池权重边界（半开半闭：0 / 0.499999 / 0.5 / 0.849999 / 0.85 / 0.999999 / 越界 / NaN / 空池）；
 *   ⑥ 配置读写与非法回退（读侧默认值、写侧 400、载体 = `jiapu_wallets.config`、路由 = 既有 PUT /admin/wallet-fee）；
 *   ⑦ 补签：成功（扣费 / 落日期集 / 重算连签 / 不补发道具）· 越界 / 今天 / 未来 / 超 7 天 · 重复 · 竹片不足（409 且零写入）；
 *   ⑧ 幂等：同日重复签到 409 且**零写入**（直调与路由两条面）；
 *   ⑨ `calendar` 7 格状态判定（signed / missed / today / future）＋ `/assets/summary` 也带日历条（前端不得另开请求）；
 *   ⑪ 收口（本单）：`calendar` 每格新增 `base`（逐字两项，由 `SIGNIN_BASE_ITEMS` 投影）/ `random`（恒 true）/
 *      `bonus`（仅第 7 格 = `signin_day7_fragments` 生效值，其余 null；与 `is_bonus` 恒一致）＋
 *      `/assets/summary` 新增 `signin_makeup_cost_bamboos` ＋ `POST /assets/signin/makeup` 出参定形状
 *      `{ ok, date, streak, cycle_day, cost_bamboos, calendar }`（**不含 items** = 补签零发奖硬口径）；
 *   ⑩ 真源零写入：`config/` + `migrate-output/` 全量 md5 与本文件开工时逐字节一致。
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（照 assets.test.js / task-center.test.js）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/signin-streak.test.js
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
const TC_SRC = fs.readFileSync(path.join(HERE, 'task-center.js'), 'utf8');
const WALLET_SRC = fs.readFileSync(path.join(HERE, 'wallet.js'), 'utf8');
const PKG_FILE = path.join(REPO, 'package.json');
const REAL_OUT = process.env.COMPAT_REAL_OUT || path.join(REPO, 'migrate-output');
const REAL_CONFIG = path.join(REPO, 'config');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-signin-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

/** 真源全量指纹（config/ + migrate-output/ 全树，逐文件 md5 再聚合） */
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
/** 真源单文件 md5（`migrate-output/collections/jiapu_assets.json`）——报告要求的逐文件证据 */
const REAL_ASSETS_MD5_BEFORE = md5(path.join(REAL_OUT, 'collections', 'jiapu_assets.json'));

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

// ---- 用户集合（路由鉴权用；一人一文档，_id = 手机号）----
const U = {
  streak: '16620000001',
  day7: '16620000002',
  randFrag: '16620000003',
  randBamboo: '16620000004',
  randScroll: '16620000005',
  makeup: '16620000006',
  poor: '16620000007',
  idem: '16620000008',
  calendar: '16620000009',
  summary: '16620000010',
  never: '16620000011',
  collect: '16620000012',
  chief: '16620000099',
};
const users = Object.values(U).map((phone) => [
  phone,
  { _id: phone, phone, nickname: `用户${phone.slice(-3)}`, role: phone === U.chief ? 'chief_editor' : 'user' },
]);
fs.writeFileSync(path.join(TMP, 'collections', 'jiapu_users.json'), JSON.stringify(Object.fromEntries(users)));

const L = await import('./economy-ledger.js');
const W = await import('./wallet.js');
const TC = await import('./task-center.js');
const store = await import('./store.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const DAY = 86400000;
const bearer = (phone) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: 'user' }, 3600)}` });
const call = (p, method = 'GET', headers = {}, body = null) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: {},
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
const json = (res) => JSON.parse(res.body);

/** 独立实现的北京时间自然日（不引用被测模块的 beijingDate） */
const cnDay = (d = new Date()) =>
  new Date((d instanceof Date ? d.getTime() : Date.parse(d)) + 8 * 3600 * 1000).toISOString().slice(0, 10);
/** 日期串 ±n 天（`YYYY-MM-DD`） */
const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00.000Z`) + n * DAY).toISOString().slice(0, 10);
/** 某北京日的 12:00（UTC 04:00）——把 `now` 钉死在白天，避免跨日抖动 */
const atNoon = (today, offset = 0) => new Date(Date.parse(`${addDays(today, offset)}T04:00:00.000Z`));

const TODAY = cnDay(new Date());
const YESTERDAY = addDays(TODAY, -1);

const assetsOf = (phone) => L.getAssets(phone);
const fragmentsOf = (phone) => assetsOf(phone).then((u) => u.fragments);
const bamboosOf = (phone) => assetsOf(phone).then((u) => L.sumLots(u.bamboos));
const scrollFragsOf = (phone) => assetsOf(phone).then((u) => u.scroll_fragments);
const txsOf = (phone) => assetsOf(phone).then((u) => u.txs || []);
const seed = (phone, patch) => L.withAssets(phone, (u) => Object.assign(u, patch));
const giveBamboo = (phone, pieces, now) =>
  L.withAssets(phone, (u) => L.addLot(u, 'bamboo', pieces, { source: 'admin', now: now || new Date() }));
const BLANK = {
  fragments: 0,
  scroll_fragments: 0,
  seeds: [],
  bamboos: [],
  jades: [],
  scrolls: [],
  txs: [],
  signin_date: '',
  signin_streak: 0,
  signin_days: [],
};
const resetUser = (phone) => seed(phone, JSON.parse(JSON.stringify(BLANK)));
/** 后台配置复位（`jiapu_wallets` 的 `_id='config'` 单档清空 ⇒ 三键全部回落默认值） */
const resetSigninConfig = () =>
  store.colSet('jiapu_wallets', 'config', { _id: 'config', version: 1 });

// ══ ① 常量逐字 / 无新增枚举 / 随机源纪律 ═════════════════════════════════════════
test('① 常量逐字：周期 7（写死不配）/ 可补 7 天 / 两条文案 / 默认池三件 / 默认值 2 与 10', () => {
  assert.equal(TC.SIGNIN_CYCLE_DAYS, 7, '连签周期写死 7');
  assert.equal(TC.SIGNIN_MAKEUP_MAX_BACK_DAYS, 7, '补签可补 = 今天往前 1–7 天');
  assert.deepEqual(TC.SIGNIN_MAKEUP_MESSAGES, {
    OUT_OF_RANGE: '补签日期不在可补范围内',
    ALREADY_SIGNED: '该日已签到，无需补签',
  });
  // 默认池（Zang 裁定 §3 逐字）
  assert.deepEqual(W.DEFAULT_SIGNIN_POOL, [
    { kind: 'fragment', qty: 1, weight: 50 },
    { kind: 'bamboo', qty: 10, weight: 35 },
    { kind: 'scrollFragment', qty: 1, weight: 15 },
  ]);
  assert.equal(W.DEFAULT_SIGNIN_MAKEUP_COST_BAMBOOS, 2);
  assert.equal(W.DEFAULT_SIGNIN_DAY7_FRAGMENTS, 10);
  // 基础实发清单（R-5 逐字：石榴籽碎片 1 + 竹片 1）
  assert.deepEqual(TC.SIGNIN_BASE_ITEMS, [
    { kind: 'fragment', qty: 1 },
    { kind: 'bamboo', qty: 1 },
  ]);
  // kind → friend-ops GRANT 三键（别名 scrollFragment 与 scroll_fragment 同指兰帖残页）
  assert.deepEqual(TC.SIGNIN_KIND_TO_GRANT, {
    fragment: 'seed_fragments',
    bamboo: 'bamboo_pieces',
    scroll_fragment: 'scroll_fragments',
    scrollFragment: 'scroll_fragments',
  });
  // 补签计费**不自造 Tx.type**：归因字面落在 ref，类型走既有枚举
  assert.equal(TC.SIGNIN_MAKEUP_SOURCE, 'signin_makeup');
  assert.equal(L.TX_TYPES.includes('signin_makeup'), false, '不得新增 Tx.type');
  assert.equal(TC.SIGNIN_REWARD_SOURCE, 'friend_reward', '奖励来源复用既有字面');
  // 源码判据：不得运行期改写白名单 / 不得注册定时任务 / 不得用 Date.now() 当随机源
  assert.equal(/TX_TYPES\s*\.\s*(push|unshift|splice)\s*\(/.test(TC_SRC), false, '不得运行期改写 TX_TYPES');
  assert.equal(/\b(setInterval|setTimeout)\s*\(|node-cron|new\s+CronJob/.test(TC_SRC), false, '不得注册定时任务');
  // 源码判据只认**代码**：注释里为了写纪律会提到 Date.now()，先剥注释再判（否则判据被自己的注释误伤）
  const TC_CODE = TC_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/Date\.now\s*\(/.test(TC_CODE), false, '随机源绝不用 Date.now()（单测必须可确定性复现）');
  assert.ok(TC_SRC.includes('opts?.random'), 'claimTask 必须支持注入随机源');
  assert.ok(WALLET_SRC.includes('signin_pool') && WALLET_SRC.includes('signin_makeup_cost_bamboos') && WALLET_SRC.includes('signin_day7_fragments'));
  const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
  assert.ok(/signin-streak\.test\.js/.test(pkg.scripts.test), '本文件必须注册进 scripts.test（未注册 = 假绿）');
});

// ══ ② 连签递增 / 隔天归零 / cycle_day ═══════════════════════════════════════════
test('② 连签：昨日已签 +1、隔天归零、cycle_day = ((streak-1)%7)+1；signin_days 升序去重', async () => {
  const me = U.streak;
  await resetUser(me);
  const rnd = () => 0.6; // 恒命中竹片（10 片）
  const d1 = await TC.claimTask(me, 'signin', atNoon('2026-09-25'), { random: rnd });
  assert.equal(d1.streak, 1, '首次签到 ⇒ 连签 1');
  assert.equal(d1.cycle_day, 1);
  assert.deepEqual(d1.items, [
    { kind: 'fragment', qty: 1 },
    { kind: 'bamboo', qty: 1 },
    { kind: 'bamboo', qty: 10 },
  ]);
  assert.equal(d1.signin_date, '2026-09-25');

  const d2 = await TC.claimTask(me, 'signin', atNoon('2026-09-25', 1), { random: rnd });
  assert.equal(d2.streak, 2, 'sigin_date = 昨天 ⇒ 连签 +1');
  assert.equal(d2.cycle_day, 2);

  // 隔一天（09-27 未签）⇒ 漏签即归零，重数 1
  const d4 = await TC.claimTask(me, 'signin', atNoon('2026-09-25', 3), { random: rnd });
  assert.equal(d4.streak, 1, '隔天 ⇒ 归零重数');
  assert.equal(d4.cycle_day, 1);
  assert.deepEqual(d4.signin_days, ['2026-09-25', '2026-09-26', '2026-09-28'], '升序、去重、含全部已签日');
  assert.equal(d4.signin_streak, 1);

  // 纯函数面：cycle_day 周期回绕
  assert.equal(TC.cycleDayOf(0), 1, '未签（streak 0）⇒ 周期第 1 天（窗口从今天开始）');
  assert.equal(TC.cycleDayOf(1), 1);
  assert.equal(TC.cycleDayOf(7), 7);
  assert.equal(TC.cycleDayOf(8), 1, '第 8 天回到周期第 1 天');
  assert.equal(TC.cycleDayOf(14), 7);
  // 已签日期集工具
  assert.deepEqual(TC.mergeSigninDays(['2026-09-26', '2026-09-25', '2026-09-25'], '2026-09-27'), [
    '2026-09-25',
    '2026-09-26',
    '2026-09-27',
  ]);
  assert.deepEqual(L.normalizeSigninDays(['2026-13-45', 'x', '2026-09-25', null, 3]), ['2026-09-25'], '非法日串一律丢弃');
});

// ══ ③ 第 7 天额外发碎片（同一次 grantRewardBase / 同一事务）════════════════════════
test('③ 第 7 天：cycle_day = 7 ⇒ 额外发 signin_day7_fragments（默认 10）碎片，且不进随机池判定', async () => {
  const me = U.day7;
  await resetSigninConfig();
  // 造「已连签 6 天、昨日已签」的态：今日签到应成为周期第 7 天
  await resetUser(me);
  await seed(me, {
    signin_date: '2026-09-30', // 2026-10-01 的昨天
    signin_streak: 6,
    signin_days: ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'],
  });
  const r = await TC.claimTask(me, 'signin', atNoon('2026-10-01'), { random: () => 0.6 }); // 随机恒命中竹片
  assert.equal(r.streak, 7);
  assert.equal(r.cycle_day, 7);
  assert.deepEqual(r.items, [
    { kind: 'fragment', qty: 1 },
    { kind: 'bamboo', qty: 1 },
    { kind: 'bamboo', qty: 10 },
    { kind: 'fragment', qty: 10 }, // 第 7 天额外 10 碎片（默认值逐字）
  ]);
  // 碎片到手 = 1（基础）+ 10（第 7 天）= 11 ⇒ 满 10 自动合成 1 颗籽、余 1（籽域口径未动）
  assert.equal(await fragmentsOf(me), 1);
  assert.equal(await scrollFragsOf(me), 0);
  assert.equal(L.sumLots((await assetsOf(me)).seeds), 1, '11 碎片 ⇒ 自动合成 1 颗籽（10 片 = 1 颗口径未动）');
  // 仅一条 reward 流水（基础 + 随机 + 第 7 天合并一次入账）
  const txs = await txsOf(me);
  assert.equal(txs.filter((t) => t.type === 'reward').length, 1);
  const reward = txs.find((t) => t.type === 'reward');
  assert.deepEqual(reward.delta, { fragments: 11, bamboos: 11, scroll_fragments: 0 });
  assert.equal(reward.ref.source, 'friend_reward');
  // 第 6 天不给第 7 天奖励
  const me2 = U.randFrag;
  await resetUser(me2);
  await seed(me2, { signin_date: '2026-09-30', signin_streak: 5, signin_days: ['2026-09-30'] });
  const r5 = await TC.claimTask(me2, 'signin', atNoon('2026-10-01'), { random: () => 0.6 });
  assert.equal(r5.cycle_day, 6);
  assert.deepEqual(r5.items, [
    { kind: 'fragment', qty: 1 },
    { kind: 'bamboo', qty: 1 },
    { kind: 'bamboo', qty: 10 },
  ]);
  // 纯函数面：第 7 格 = 奖励格，qty 取配置值
  assert.deepEqual(TC.signinItemsOf(7, null, 10), [
    { kind: 'fragment', qty: 1 },
    { kind: 'bamboo', qty: 1 },
    { kind: 'fragment', qty: 10 },
  ]);
  assert.deepEqual(TC.signinItemsOf(6, null, 10), [
    { kind: 'fragment', qty: 1 },
    { kind: 'bamboo', qty: 1 },
  ]);
});

// ══ ④ 随机池注入确定性：三种 kind 各命中一次 ══════════════════════════════════════
test('④ 随机追加：注入确定性随机源，fragment / bamboo / scrollFragment 三种 kind 各命中一次', async () => {
  await resetSigninConfig();
  const cases = [
    { phone: U.randFrag, r: 0.10, pick: { kind: 'fragment', qty: 1 }, frag: 2, bamboo: 1, scroll: 0 },
    { phone: U.randBamboo, r: 0.60, pick: { kind: 'bamboo', qty: 10 }, frag: 1, bamboo: 11, scroll: 0 },
    { phone: U.randScroll, r: 0.90, pick: { kind: 'scrollFragment', qty: 1 }, frag: 1, bamboo: 1, scroll: 1 },
  ];
  for (const c of cases) {
    await resetUser(c.phone);
    const r = await TC.claimTask(c.phone, 'signin', atNoon('2026-03-02'), { random: () => c.r });
    assert.deepEqual(r.items, [
      { kind: 'fragment', qty: 1 },
      { kind: 'bamboo', qty: 1 },
      c.pick,
    ]);
    assert.equal(await fragmentsOf(c.phone), c.frag, `碎片到手（r=${c.r}）`);
    assert.equal(await bamboosOf(c.phone), c.bamboo, `竹片到手（r=${c.r}）`);
    assert.equal(await scrollFragsOf(c.phone), c.scroll, `兰帖残页到手（r=${c.r}）`);
    // 三种 kind 都必须落在同一份资产账本里，且只有一条 reward 流水（不新增 Tx.type）
    const txs = await txsOf(c.phone);
    assert.equal(txs.filter((t) => t.type === 'reward').length, 1);
    assert.equal(txs.filter((t) => t.type === 'signin').length, 1, '签到事件仍留痕（既有枚举 signin，delta 全 0）');
    assert.deepEqual(txs.find((t) => t.type === 'signin').delta, {});
  }
  // 同一随机源注入两次 ⇒ **完全相同的实发清单**（可确定性复现，不用 Date.now()）
  await resetUser(U.randFrag);
  const a = await TC.claimTask(U.randFrag, 'signin', atNoon('2026-03-02'), { random: () => 0.1 });
  await resetUser(U.randFrag);
  const b = await TC.claimTask(U.randFrag, 'signin', atNoon('2026-03-02'), { random: () => 0.1 });
  assert.deepEqual(a.items, b.items, '同注入 ⇒ 同结果（确定性，不依赖时钟）');
  assert.equal(await fragmentsOf(U.randFrag), 2, '重放后与首次逐字一致');
  // 同日重复（真源已打标）⇒ 409，绝不双发（随机源无关）
  let err = null;
  try {
    await TC.claimTask(U.randFrag, 'signin', atNoon('2026-03-02'), { random: () => 0.9 });
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.code === 'TASK_ALREADY_CLAIMED', '同日重复 ⇒ 409');
  assert.equal(await fragmentsOf(U.randFrag), 2, '重复领取不发奖');
});

// ══ ⑤ 池权重边界 ═══════════════════════════════════════════════════════════════
test('⑤ 池权重边界：半开半闭区间（0/0.499999/0.5/0.849999/0.85/0.999999）+ 脏值回退 + 空池 null', () => {
  const pool = W.DEFAULT_SIGNIN_POOL; // 50 / 35 / 15，合计 100
  const pick = (r) => TC.pickSigninPoolItem(pool, () => r);
  assert.deepEqual(pick(0), { kind: 'fragment', qty: 1 });
  assert.deepEqual(pick(0.499999), { kind: 'fragment', qty: 1 });
  assert.deepEqual(pick(0.5), { kind: 'bamboo', qty: 10 }, '0.5 落在第二档（[0.5, 0.85)）');
  assert.deepEqual(pick(0.849999), { kind: 'bamboo', qty: 10 });
  assert.deepEqual(pick(0.85), { kind: 'scrollFragment', qty: 1 }, '0.85 落在第三档（[0.85, 1)）');
  assert.deepEqual(pick(0.999999), { kind: 'scrollFragment', qty: 1 });
  // 自定义权重：1 / 3（合计 4）—— 边界 0.25 归第二档
  const two = [
    { kind: 'fragment', qty: 1, weight: 1 },
    { kind: 'bamboo', qty: 2, weight: 3 },
  ];
  assert.deepEqual(TC.pickSigninPoolItem(two, () => 0.24), { kind: 'fragment', qty: 1 });
  assert.deepEqual(TC.pickSigninPoolItem(two, () => 0.25), { kind: 'bamboo', qty: 2 });
  assert.deepEqual(TC.pickSigninPoolItem(two, () => 0.99), { kind: 'bamboo', qty: 2 });
  // 脏值 / 越界：NaN ⇒ 0（首件）；≥1 ⇒ 压回最后一格（绝不空抽）；负值 ⇒ 0
  assert.deepEqual(TC.pickSigninPoolItem(two, () => NaN), { kind: 'fragment', qty: 1 });
  assert.deepEqual(TC.pickSigninPoolItem(two, () => 1.5), { kind: 'bamboo', qty: 2 });
  assert.deepEqual(TC.pickSigninPoolItem(two, () => -3), { kind: 'fragment', qty: 1 });
  // 空池 / 全非法项 ⇒ null（不臆造、不发奖）
  assert.equal(TC.pickSigninPoolItem([], () => 0.5), null);
  assert.equal(TC.pickSigninPoolItem(null, () => 0.5), null);
  assert.equal(TC.pickSigninPoolItem([{ kind: 'fragment', qty: 0, weight: 10 }], () => 0.5), null, 'qty ≤ 0 视为非法项');
  assert.equal(TC.pickSigninPoolItem([{ kind: 'fragment', qty: 1, weight: 0 }], () => 0.5), null, 'weight ≤ 0 视为非法项');
  // weight 非整数（脏数据）⇒ 向下取整后仍可抽（不吐 NaN）
  assert.deepEqual(TC.pickSigninPoolItem([{ kind: 'fragment', qty: 1, weight: 2.9 }], () => 0.5), {
    kind: 'fragment',
    qty: 1,
  });
});

// ══ ⑥ 后台可配：读写 / 非法回退 / 治理路由 ════════════════════════════════════════
test('⑥ 配置：载体 = jiapu_wallets.config、读侧默认回退、写侧非法 400、路由 = 既有 PUT /admin/wallet-fee', async () => {
  await resetSigninConfig();
  // 读侧默认（缺省）
  assert.deepEqual(await W.getSigninPool(), W.DEFAULT_SIGNIN_POOL);
  assert.equal(await W.getSigninMakeupCostBamboos(), 2);
  assert.equal(await W.getSigninDay7Fragments(), 10);

  // 非法存量 ⇒ 回退默认（同 getBranchFeeSeeds 体例）
  await store.colSet('jiapu_wallets', 'config', {
    _id: 'config',
    version: 1,
    signin_pool: [],
    signin_makeup_cost_bamboos: 0,
    signin_day7_fragments: -5,
  });
  assert.deepEqual(await W.getSigninPool(), W.DEFAULT_SIGNIN_POOL, '空数组 ⇒ 回退默认池');
  assert.equal(await W.getSigninMakeupCostBamboos(), 2, '0 ⇒ 回退默认 2');
  assert.equal(await W.getSigninDay7Fragments(), 10, '负数 ⇒ 回退默认 10');
  await store.colSet('jiapu_wallets', 'config', {
    _id: 'config',
    version: 1,
    signin_pool: [{ kind: 'bogus', qty: 1, weight: 1 }],
    signin_makeup_cost_bamboos: 1.5,
    signin_day7_fragments: 'x',
  });
  assert.deepEqual(await W.getSigninPool(), W.DEFAULT_SIGNIN_POOL, '含非法项 ⇒ 回退默认池');
  assert.equal(await W.getSigninMakeupCostBamboos(), 2, '非整数 ⇒ 回退默认');
  assert.equal(await W.getSigninDay7Fragments(), 10, '非数字 ⇒ 回退默认');

  // 写侧校验（纯函数 + setter）
  assert.equal(W.normalizeSigninPool([]).ok, false, '非空数组');
  assert.equal(W.normalizeSigninPool('x').ok, false);
  assert.equal(W.normalizeSigninPool([{ kind: 'bogus', qty: 1, weight: 1 }]).ok, false, 'kind 白名单');
  assert.equal(W.normalizeSigninPool([{ kind: 'fragment', qty: 0, weight: 1 }]).ok, false, 'qty 正整数');
  assert.equal(W.normalizeSigninPool([{ kind: 'fragment', qty: 1, weight: 0 }]).ok, false, 'weight 正整数');
  await assert.rejects(() => W.setSigninPool([]));
  await assert.rejects(() => W.setSigninMakeupCostBamboos(0));
  await assert.rejects(() => W.setSigninDay7Fragments(-1));

  // 治理路由：仅 chief_editor；逐键 has() 判定；非法 400
  const chief = { authorization: `Bearer ${signJwt({ sub: U.chief, phone: U.chief }, 3600)}` };
  const norm = bearer(U.makeup);
  assert.equal((await call('/admin/wallet-fee', 'PUT', norm, { signin_day7_fragments: 3 })).statusCode, 403, '非总编 403');
  const emptyPool = await call('/admin/wallet-fee', 'PUT', chief, { signin_pool: [] });
  assert.equal(emptyPool.statusCode, 400);
  assert.ok(json(emptyPool).error.includes('非空数组'), `精确 400 文案：${json(emptyPool).error}`);
  const badKind = await call('/admin/wallet-fee', 'PUT', chief, { signin_pool: [{ kind: 'jade', qty: 1, weight: 1 }] });
  assert.equal(badKind.statusCode, 400);
  const badFee = await call('/admin/wallet-fee', 'PUT', chief, { signin_makeup_cost_bamboos: 1.5 });
  assert.equal(badFee.statusCode, 400);
  const badDay7 = await call('/admin/wallet-fee', 'PUT', chief, { signin_day7_fragments: -2 });
  assert.equal(badDay7.statusCode, 400);
  const none = await call('/admin/wallet-fee', 'PUT', chief, {});
  assert.equal(none.statusCode, 400, '一个有效键都没有 ⇒ 400（既有体例）');

  // 合法写入（三键一次写）+ 读回
  const ok = await call('/admin/wallet-fee', 'PUT', chief, {
    signin_pool: [
      { kind: 'scroll_fragment', qty: 2, weight: 1 },
      { kind: 'bamboo', qty: 5, weight: 9 },
    ],
    signin_makeup_cost_bamboos: 4,
    signin_day7_fragments: 20,
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const okBody = json(ok);
  assert.deepEqual(okBody.signin_pool, [
    { kind: 'scroll_fragment', qty: 2, weight: 1 },
    { kind: 'bamboo', qty: 5, weight: 9 },
  ]);
  assert.equal(okBody.signin_makeup_cost_bamboos, 4);
  assert.equal(okBody.signin_day7_fragments, 20);
  // 载体确认：确实落在 jiapu_wallets 的 `_id='config'` 单档上（**不新建集合**）
  const wallets = await store.colGet('jiapu_wallets', 'config');
  assert.deepEqual(wallets.signin_pool[0], { kind: 'scroll_fragment', qty: 2, weight: 1 });
  assert.equal(wallets.signin_makeup_cost_bamboos, 4);
  assert.equal(wallets.signin_day7_fragments, 20);
  assert.deepEqual(await W.getSigninPool(), okBody.signin_pool);
  // 配置生效：新池（weight 1 : 9）⇒ r=0.5 命中竹片 5 片；第 7 天 = 20
  await resetUser(U.calendar);
  const r = await TC.claimTask(U.calendar, 'signin', atNoon(TODAY), { random: () => 0.5 });
  assert.deepEqual(r.items, [
    { kind: 'fragment', qty: 1 },
    { kind: 'bamboo', qty: 1 },
    { kind: 'bamboo', qty: 5 },
  ]);
  assert.equal(r.calendar[6].qty, 20, '日历第 7 格 qty = 配置值');
  await resetSigninConfig();
});

// ══ ⑦ 补签：成功 / 越界 / 重复 / 竹片不足（409 零写入）══════════════════════════════
test('⑦ 补签：成功扣费 + 落日期集 + 重算连签 + 不补发道具；越界 / 今天 / 未来 / 超 7 天 / 重复 / 不足', async () => {
  const me = U.makeup;
  await resetSigninConfig();
  await resetUser(me);
  // 先签到今日（连签 1），再补昨日 ⇒ 连签 2
  const claim = await call('/assets/signin', 'POST', bearer(me));
  assert.equal(claim.statusCode, 200, claim.body);
  assert.equal(json(claim).streak, 1);
  await giveBamboo(me, 5, new Date());
  const beforeMakeup = await assetsOf(me);
  const beforeFrag = beforeMakeup.fragments;
  const beforeRewardTxs = (beforeMakeup.txs || []).filter((t) => t.type === 'reward').length;
  // 基线竹片数：签到基础奖励本身含 1 片竹片 + 随机池（未注入随机源，命中不确定），故只按**差值**断言
  const beforeBamboos = L.sumLots(beforeMakeup.bamboos);

  // 未登录 ⇒ 401
  assert.equal((await call('/assets/signin/makeup', 'POST', {}, { date: YESTERDAY })).statusCode, 401);
  // 越界：今天 / 未来 / 超 7 天 / 非法串 ⇒ 400「补签日期不在可补范围内」（零写入）
  for (const bad of [TODAY, addDays(TODAY, 1), addDays(TODAY, -8), 'garbage', '']) {
    const res = await call('/assets/signin/makeup', 'POST', bearer(me), { date: bad });
    assert.equal(res.statusCode, 400, `date=${bad} 应 400`);
    assert.equal(json(res).error, '补签日期不在可补范围内');
  }
  assert.deepEqual(await assetsOf(me), beforeMakeup, '被拒的补签：一字节不写');

  // 成功补签昨日
  const ok = await call('/assets/signin/makeup', 'POST', bearer(me), { date: YESTERDAY });
  assert.equal(ok.statusCode, 200, ok.body);
  const okBody = json(ok);
  assert.equal(okBody.date, YESTERDAY);
  assert.equal(okBody.streak, 2, '补昨日 ⇒ 连签重算为 2（今日 + 昨日）');
  assert.equal(okBody.cycle_day, 2);
  assert.equal(okBody.cost_bamboos, 2, '默认成本 2 片竹片');
  // ⚠️ 出参定形状后**不再透传内部明细键**（`signin_days` / `signin_date` / `bamboos_taken` / `tx_id`）
  //   ⇒ 这两条「落盘读数」断言改为**自资产文档直读**（断言强度不变：仍是硬口径）。
  const afterMakeup = await assetsOf(me);
  assert.deepEqual(afterMakeup.signin_days, [YESTERDAY, TODAY], '升序');
  assert.equal(afterMakeup.signin_date, TODAY, 'signin_date（最近一次签到日）一字不改');
  assert.equal(await bamboosOf(me), beforeBamboos - 2, '扣 2 片竹片');
  assert.equal(await fragmentsOf(me), beforeFrag, '**不补发任何道具**（碎片不变）');
  const txs = await txsOf(me);
  const fee = txs.filter((t) => t.type === 'edit_fee' && t.ref?.source === 'signin_makeup');
  assert.equal(fee.length, 1, '补签计费留一条流水（复用既有竹片计费枚举 edit_fee）');
  assert.deepEqual(fee[0].delta, { bamboos: -2 });
  assert.equal(fee[0].ref.op, 'signin_makeup');
  assert.equal(fee[0].ref.date, YESTERDAY);
  assert.equal(txs.filter((t) => t.type === 'reward').length, beforeRewardTxs, '补签不写 reward 流水');
  assert.equal(txs.filter((t) => t.type === 'signin').length, 1, '补签不写 signin 审计条（它不是签到）');

  // 幂等：同一日重复补 ⇒ 400「该日已签到，无需补签」且零写入
  const snap = await assetsOf(me);
  const dup = await call('/assets/signin/makeup', 'POST', bearer(me), { date: YESTERDAY });
  assert.equal(dup.statusCode, 400);
  assert.equal(json(dup).error, '该日已签到，无需补签');
  assert.deepEqual(await assetsOf(me), snap, '重复补签：一字节不写（不二次扣费）');

  // 竹片不足 ⇒ 409 ASSET_INSUFFICIENT（eco.errorPayload 全字段）+ 整单拒绝零写入
  const poor = U.poor;
  await resetUser(poor);
  await seed(poor, { signin_date: TODAY, signin_streak: 1, signin_days: [TODAY] });
  await giveBamboo(poor, 1, new Date());
  const snapPoor = await assetsOf(poor);
  const res = await call('/assets/signin/makeup', 'POST', bearer(poor), { date: YESTERDAY });
  assert.equal(res.statusCode, 409, res.body);
  const body = json(res);
  assert.equal(body.code, 'ASSET_INSUFFICIENT');
  assert.equal(body.need, 2);
  assert.equal(body.current, 1);
  assert.equal(body.unit, 'bamboos');
  assert.ok(body.error.includes('资产不足'), `后端原文：${body.error}`);
  assert.deepEqual(await assetsOf(poor), snapPoor, '资产不足：整单拒绝、不部分扣、零写入');
  assert.deepEqual((await assetsOf(poor)).signin_days, [TODAY], '失败不得写日期集');

  // 成本可配：改 4 片后补签按 4 片扣
  await W.setSigninMakeupCostBamboos(4);
  await giveBamboo(me, 10, new Date()); // 先补足竹片，避免撞上「不足」
  const budget = await bamboosOf(me);
  const ok4 = await call('/assets/signin/makeup', 'POST', bearer(me), { date: addDays(TODAY, -2) });
  assert.equal(ok4.statusCode, 200, ok4.body);
  assert.equal(json(ok4).cost_bamboos, 4, '成本读后台配置');
  assert.equal(json(ok4).streak, 3, '补齐缺口 ⇒ 连签重算为 3（今日、昨日、前日）');
  assert.equal(await bamboosOf(me), budget - 4, '竹片按配置成本扣');
  await resetSigninConfig();
});

// ══ ⑧ 幂等：同日重复签到 409 且零写入 ═════════════════════════════════════════════
test('⑧ 幂等：同一自然日重复签到 ⇒ 409「今日已签到」，资产与流水一字节不变（直调 + 路由）', async () => {
  const me = U.idem;
  await resetSigninConfig();
  await resetUser(me);
  const first = await call('/assets/signin', 'POST', bearer(me));
  assert.equal(first.statusCode, 200, first.body);
  const snap = await assetsOf(me);
  const snapTxs = (await txsOf(me)).length;

  const again = await call('/assets/signin', 'POST', bearer(me));
  assert.equal(again.statusCode, 409);
  assert.deepEqual(json(again), { error: '今日已签到' }, '既有文案与形状逐字保留');
  assert.deepEqual(await assetsOf(me), snap, '同日重复：资产一字节不变');

  // 直调面：错误码 = TASK_ALREADY_CLAIMED（任务中心口径），同样零写入
  let err = null;
  try {
    await TC.claimTask(me, 'signin', new Date(), { random: () => 0.6 });
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.code === 'TASK_ALREADY_CLAIMED' && err.status === 409, '直调面 409 TASK_ALREADY_CLAIMED');
  assert.deepEqual(await assetsOf(me), snap, '直调重复：资产一字节不变');
  assert.equal((await txsOf(me)).length, snapTxs, '直调重复：零流水');
  // 签到卡与 /tasks/claim 共用同一 signin_date（绝不双发）
  const taskDup = await call('/tasks/claim', 'POST', bearer(me), { task: 'signin' });
  assert.equal(taskDup.statusCode, 409);
  assert.deepEqual(await assetsOf(me), snap, '任务侧重复：资产一字节不变');
});

// ══ ⑨ calendar 7 格状态判定 + /assets/summary 也带日历条 ═════════════════════════
test('⑨ calendar：长度 7、下标 0..6 ↔ cycle_day 1..7、state 四态与窗口推导；summary 也下发日历条', async () => {
  // 元素形状逐字 9 键（六既有键 + 本单新增 base / random / bonus）
  const shape = ['cycle_day', 'kind', 'qty', 'is_bonus', 'state', 'date', 'base', 'random', 'bonus'];
  // 未签（streak 0）：窗口从今天开始 ⇒ 第 1 格 = today，其余 future
  const fresh = { signin_streak: 0, signin_days: [] };
  const c0 = TC.signinCalendarOf(fresh, atNoon(TODAY), { day7_fragments: 10 });
  assert.equal(c0.length, 7);
  assert.deepEqual(Object.keys(c0[0]).sort(), [...shape].sort(), '元素形状逐字 9 键');
  assert.deepEqual(
    c0.map((x) => x.cycle_day),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(c0[0].date, TODAY, 'streak 0 ⇒ 窗口从今天开始');
  assert.deepEqual(
    c0.map((x) => x.state),
    ['today', 'future', 'future', 'future', 'future', 'future', 'future'],
  );
  assert.deepEqual(
    c0.map((x) => x.is_bonus),
    [false, false, false, false, false, false, true],
    '仅第 7 格 is_bonus = true',
  );
  assert.equal(c0[6].qty, 10, '第 7 格 qty = day7_fragments');
  for (const cell of c0) assert.equal(cell.kind, 'fragment', '碎片主项');

  // 已签 3 天（今日在周期第 3 天）⇒ 窗口 = 今天−2 ... 今天+4；前 3 格 signed，后 4 格 future
  const u3 = { signin_streak: 3, signin_days: [addDays(TODAY, -2), addDays(TODAY, -1), TODAY] };
  const c3 = TC.signinCalendarOf(u3, atNoon(TODAY), { day7_fragments: 10 });
  assert.equal(c3[0].date, addDays(TODAY, -2), '窗口首日 = 今天 −（cycle_day − 1）');
  assert.deepEqual(
    c3.map((x) => x.state),
    ['signed', 'signed', 'signed', 'future', 'future', 'future', 'future'],
  );

  // 连签 5、但日期集有缺（今天−4 / 今天−3 未签，今天−2..今天 已签）⇒ missed ×2 + signed ×3 + future ×2
  const u5 = { signin_streak: 5, signin_days: [addDays(TODAY, -2), addDays(TODAY, -1), TODAY] };
  const c5 = TC.signinCalendarOf(u5, atNoon(TODAY), { day7_fragments: 10 });
  assert.deepEqual(
    c5.map((x) => x.state),
    ['missed', 'missed', 'signed', 'signed', 'signed', 'future', 'future'],
  );
  assert.deepEqual(
    c5.map((x) => x.date),
    [addDays(TODAY, -4), addDays(TODAY, -3), addDays(TODAY, -2), addDays(TODAY, -1), TODAY, addDays(TODAY, 1), addDays(TODAY, 2)],
  );
  // 补签进来的日期同样算 signed（含补签）
  const u6 = { signin_streak: 4, signin_days: [addDays(TODAY, -3), addDays(TODAY, -2), addDays(TODAY, -1), TODAY] };
  const c6 = TC.signinCalendarOf(u6, atNoon(TODAY), { day7_fragments: 10 });
  assert.equal(c6[0].state, 'signed', '补签日 ⇒ signed');

  // 路由面：/assets/signin 出参带 calendar；/assets/summary 也带 signin_calendar + signin_streak（前端不得另开请求）
  const me = U.summary;
  await resetSigninConfig();
  await resetUser(me);
  const card = await call('/assets/signin', 'POST', bearer(me));
  assert.equal(card.statusCode, 200, card.body);
  const cb = json(card);
  assert.equal(cb.calendar.length, 7);
  assert.equal(cb.calendar[0].state, 'signed', '签到当日：第 1 格（今天）计入已签 ⇒ signed');
  assert.deepEqual(cb.items.map((x) => x.kind).slice(0, 2), ['fragment', 'bamboo']);
  const summary = json(await call('/assets/summary', 'GET', bearer(me)));
  assert.equal(summary.signin_streak, 1, 'summary 新增 signin_streak');
  assert.equal(summary.signin_calendar.length, 7, 'summary 新增 signin_calendar（未签到也能渲染日历条）');
  assert.equal(summary.signin_calendar[0].state, 'signed');
  assert.deepEqual(summary.signin_days, [TODAY], 'summary 新增 signin_days（升序）');
  // 从未签到的用户：日历条照样下发（前端不得为此另开请求）
  const s2 = json(await call('/assets/summary', 'GET', bearer(U.never)));
  assert.equal(s2.signin_streak, 0, '未签到 ⇒ 连签 0');
  assert.deepEqual(s2.signin_days, []);
  assert.equal(s2.signin_calendar.length, 7);
  assert.equal(s2.signin_calendar[0].state, 'today', '未签到：窗口从今天开始，第 1 格 = today');
  assert.deepEqual(
    s2.signin_calendar.map((x) => x.state),
    ['today', 'future', 'future', 'future', 'future', 'future', 'future'],
  );
  // 未登录 ⇒ 401
  assert.equal((await call('/assets/summary', 'GET', {})).statusCode, 401);
  assert.equal((await call('/assets/signin', 'POST', {})).statusCode, 401);
});

// ══ ⑪ 收口：calendar 三新键 + summary 补签成本 + makeup 出参定形状 ══════════════════
test('⑪ 收口：每格 base 逐字两项 + random=true；仅第 7 格 bonus（随配置变）；summary 带补签成本；makeup 出参定形状且不含 items', async () => {
  const me = U.collect;
  await resetSigninConfig();
  await resetUser(me);
  const fresh = { signin_streak: 0, signin_days: [] };

  // ---- ① 每格含 base（逐字两项）/ random === true ----
  const c0 = TC.signinCalendarOf(fresh, atNoon(TODAY), { day7_fragments: 10 });
  assert.deepEqual(TC.SIGNIN_BASE_ITEMS, [{ kind: 'fragment', qty: 1 }, { kind: 'bamboo', qty: 1 }], '基础奖励常量逐字两项');
  for (const cell of c0) {
    assert.deepEqual(cell.base, [{ kind: 'fragment', qty: 1 }, { kind: 'bamboo', qty: 1 }], '每格 base 逐字 = SIGNIN_BASE_ITEMS 投影');
    assert.equal(cell.random, true, '每格 random 恒 true（当日必含随机追加）');
  }
  assert.ok(c0[0] !== c0[1] && c0[0].base[0] !== c0[1].base[0], 'base 内层对象亦逐格新建（不共享引用）');

  // ---- ② 仅第 7 格 bonus = { kind:'fragment', qty:10 }，其余 null；is_bonus 与之恒一致 ----
  assert.deepEqual(c0[6].bonus, { kind: 'fragment', qty: 10 }, '仅第 7 格 bonus（qty = 当前生效 signin_day7_fragments）');
  for (let i = 0; i < TC.SIGNIN_CYCLE_DAYS - 1; i += 1) assert.equal(c0[i].bonus, null, `第 ${i + 1} 格 bonus = null`);
  assert.deepEqual(
    c0.map((x) => x.is_bonus === (x.bonus !== null)),
    [true, true, true, true, true, true, true],
    'is_bonus 与 bonus 恒一致',
  );
  assert.deepEqual(
    Object.keys(c0[6]).sort(),
    ['base', 'bonus', 'cycle_day', 'date', 'is_bonus', 'kind', 'qty', 'random', 'state'],
    '元素形状逐字 9 键',
  );
  console.log(`[SAMPLE] calendar[0] = ${JSON.stringify(c0[0])}`);
  console.log(`[SAMPLE] calendar[6] = ${JSON.stringify(c0[6])}`);

  // ---- ④ 改 signin_day7_fragments ⇒ bonus.qty 随之变化（读当前生效值，两处：纯函数入参 + 路由出参）----
  await W.setSigninDay7Fragments(3);
  const day7Now = await W.getSigninDay7Fragments();
  assert.equal(day7Now, 3, '配置写入生效');
  const c3 = TC.signinCalendarOf(fresh, atNoon(TODAY), { day7_fragments: day7Now });
  assert.deepEqual(c3[6].bonus, { kind: 'fragment', qty: 3 }, '配置改 3 ⇒ bonus.qty = 3');
  assert.equal(c3[6].qty, 3, '既有 qty 键同步（只增不删）');

  // ---- ③ summary 含 signin_makeup_cost_bamboos（整数，当前生效值）----
  const sum0 = json(await call('/assets/summary', 'GET', bearer(me)));
  assert.equal(sum0.signin_makeup_cost_bamboos, 2, '默认补签成本 2（整数）');
  assert.equal(Number.isInteger(sum0.signin_makeup_cost_bamboos), true);
  assert.deepEqual(sum0.signin_calendar[6].bonus, { kind: 'fragment', qty: 3 }, 'summary 日历第 7 格 bonus 同步生效值');
  await W.setSigninMakeupCostBamboos(3);
  const sum3 = json(await call('/assets/summary', 'GET', bearer(me)));
  assert.equal(sum3.signin_makeup_cost_bamboos, 3, 'summary 成本随配置变化');
  console.log(`[SAMPLE] summary(signin 片段) = ${JSON.stringify({ signin_streak: sum3.signin_streak, signin_makeup_cost_bamboos: sum3.signin_makeup_cost_bamboos, signin_days: sum3.signin_days, signin_calendar: sum3.signin_calendar })}`);

  // ---- ③ makeup 出参定形状（逐字 6 键）且**不含 items** ----
  const card = await call('/assets/signin', 'POST', bearer(me));
  assert.equal(card.statusCode, 200, card.body);
  await giveBamboo(me, 10, new Date());
  const beforeFrag = await fragmentsOf(me);
  const mk = await call('/assets/signin/makeup', 'POST', bearer(me), { date: YESTERDAY });
  assert.equal(mk.statusCode, 200, mk.body);
  const body = json(mk);
  assert.deepEqual(
    Object.keys(body).sort(),
    ['calendar', 'cost_bamboos', 'cycle_day', 'date', 'ok', 'streak'],
    '补签出参形状逐字 = { ok, date, streak, cycle_day, cost_bamboos, calendar }',
  );
  assert.equal(body.ok, true);
  assert.equal(body.date, YESTERDAY);
  assert.equal(body.streak, 2, '补昨日 ⇒ 连签 2');
  assert.equal(body.cycle_day, 2);
  assert.equal(body.cost_bamboos, 3, 'cost_bamboos = 当前生效成本');
  assert.equal(body.calendar.length, 7, '出参带补签后重算的 7 格日历');
  assert.equal(body.calendar[1].state, 'signed', '补签日（第 2 格）⇒ signed');
  assert.deepEqual(body.calendar[6].bonus, { kind: 'fragment', qty: 3 }, '出参日历第 7 格 bonus = 生效值');
  assert.deepEqual(body.calendar[0].base, [{ kind: 'fragment', qty: 1 }, { kind: 'bamboo', qty: 1 }], '出参日历每格带 base');
  assert.equal(body.calendar[0].random, true);
  assert.equal('items' in body, false, '**不返回 items**（补签不补发任何道具）');
  assert.equal('data' in body, false, '不再包 data 壳（形状逐字）');
  assert.equal(await fragmentsOf(me), beforeFrag, '补签零发奖（碎片不变）⇒ 无 items 的硬口径');
  console.log(`[SAMPLE] makeup = ${JSON.stringify(body)}`);
  await resetSigninConfig();
});

// ══ ⑩ 真源零写入 ════════════════════════════════════════════════════════════════
test('⑩ 真源零写入：config/ + migrate-output/ 全量指纹不变；jiapu_assets.json md5 逐字节一致', () => {
  const after = realSourceFingerprint();
  assert.equal(after.count, REAL_FP_BEFORE.count, '真源文件数不得变化');
  assert.equal(after.digest, REAL_FP_BEFORE.digest, '真源全量 md5 指纹不得变化');
  assert.equal(md5(path.join(REAL_OUT, 'collections', 'jiapu_assets.json')), REAL_ASSETS_MD5_BEFORE, '真源资产集合逐字节一致');
  assert.equal(process.env.COMPAT_OUT_DIR, TMP, '本文件必须把数据根指向 /tmp 副本');
});
