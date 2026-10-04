/**
 * 钱包模块（集合 jiazu_wallets，**存储形态 v2 · 每手机号一档**）
 * 规则与 auth-server/wallet.js 一致：分存储、建树费 9.9 元默认。
 * **家族树资金功能已下线**（docs/economy.spec.md §12-3）：`trees[tree_id].balance_cents`、`transferToTree`、
 * `getTreeBalance` 均已移除（`/wallet/transfer`、`/wallet/tree-balance` 恒 410）；本模块只留
 * 个人 ¥ 余额（充值与购买官方竹简的唯一通道）与建树费设置。auth-server/** 属遗留链路，不在本册范围。
 *
 * **存储形态 v2（2026-10-03 Zang 裁定 · 路 B 第 3 期）**：原「全体用户共用单文档 `_id='global'`
 * （内嵌 `users` 映射 + `transactions` 数组 + `config`）」拆为：
 *   · **每手机号一档**（`_id = 手机号明文`，档体 `{ _id, version, balance_cents, txs:[…] }`）——
 *     原 `transactions` 中 `user === 该手机号` 的条目**归并进该用户档的 `txs` 数组**（字段一字不改、
 *     保持原全局数组中的相对顺序），使「**改余额 + 记流水**」在**同一个 mutator 里原子完成**
 *     （绝不拆成两个档各写一次 —— 那是跨档非原子，钱不允许）；口径与 `economy-ledger.js` 的 `txs` 一致；
 *   · **平台维度流水**（无 `user` 字段的）→ 单档 `_id='_platform'`（`PLATFORM_ID`，档体 `{ _id, version, txs }`）——
 *     无此类流水时不预先创建（首次需要时才建）；
 *   · **配置类**（原 `global.config`）→ 单档 `_id='config'`（`CONFIG_ID`，档体 = 原值原样 + `version`；
 *     先例 = `economy-market.js` 的 `OFFICIAL_ID='official'`）。
 * 每档带 `version`（非负整数、自 1 起）。写入协议 = `store.mutateDoc` 的 **CAS**：读当前档 → 纯函数 mutator →
 * `version+1` → 条件写 → **读回比对**；冲突重读重放（上限 5 次 + 退避），耗尽抛错 ⇒ 云端多实例并发不再
 * **双花 / 丢更新**（原部署阻塞项 §7-7；`lib/economy-market.js` 官方购买走钱包扣款）。
 * 业务字段名 / 数值 / 计费口径 / 全部导出接口的签名与出参形状一字不改；元字段（`_id` / `version`）
 * **不泄漏给调用方**（照 `economy-ledger.js` 的进出剥离）。
 */
import { colGet, mutateDoc } from './store.js';

/** 集合名（`economy-market.js` 等只经本模块访问 wallets，不直读） */
export const WALLET_COL = 'jiazu_wallets';
/** 用户档 `_id` = 手机号明文（纯投影：只做 trim，空值返回 `''`；手机号格式校验不属本函数） */
export const walletIdOf = (phone) => String(phone == null ? '' : phone).trim();
/** 配置类单档 `_id`（原 `global.config`；先例 = `economy-market.js` 的 `OFFICIAL_ID`） */
export const CONFIG_ID = 'config';
/** 平台维度流水单档 `_id`（无 `user` 字段的流水；无此类流水时不预先创建） */
export const PLATFORM_ID = '_platform';

const DEFAULT_FEE_CENTS = 990;
/** 立支费默认值（颗石榴籽；docs/branch-clan-ops.spec.md §5-4，与 lib/economy-fee.js FEE.branch_fee_seeds 同值） */
export const DEFAULT_BRANCH_FEE_SEEDS = 9999;
/** 汇宗灵气折损比例默认值（0–1；docs/branch-clan-ops.spec.md §5-4） */
export const DEFAULT_CONVERGE_SPIRIT_RATIO = 0.5;

// ---- 签到域后台可配键（同一设置载体 `jiazu_wallets.config`；Zang 裁定 v1 · Kevin 2026-09-28 拍定）----
// 写入口沿用既有治理路由 `PUT /admin/wallet-fee`（**不新增设置路由**）；读侧一律「缺省 / 非法值 → 默认值」。

/** 补签费用默认值（片竹片；`config.signin_makeup_cost_bamboos`） */
export const DEFAULT_SIGNIN_MAKEUP_COST_BAMBOOS = 2;
/** 连签第 7 天额外奖励默认值（个石榴籽碎片；`config.signin_day7_fragments`） */
export const DEFAULT_SIGNIN_DAY7_FRAGMENTS = 10;

/**
 * 每日签到随机追加的**奖池种类白名单**（`signin_pool[].kind`，逐字）。
 * 口径冲突登记：裁定文 §5 的校验枚举写作 `fragment|bamboo|scroll_fragment|scroll`，
 * 而 §3 的默认池字面用的是 `scrollFragment`（驼峰）—— 二者指同一资产（兰帖残页）。
 * 本模块**两种字面一律接受**（`scrollFragment` 视为 `scroll_fragment` 的别名），
 * **不改写**配置里的字面（读回即原样回显），下游按同一资产入账。
 */
export const SIGNIN_POOL_KINDS = ['fragment', 'bamboo', 'scroll_fragment', 'scroll', 'scrollFragment'];

/** 默认奖池（Zang 裁定 v1 §3 逐字：碎片 1 片 w50 / 竹片 10 片 w35 / 兰帖残页 1 片 w15） */
export const DEFAULT_SIGNIN_POOL = [
  { kind: 'fragment', qty: 1, weight: 50 },
  { kind: 'bamboo', qty: 10, weight: 35 },
  { kind: 'scrollFragment', qty: 1, weight: 15 },
];
// ⚠️ 键名**权威口径**（Kevin 2026-09-28 收口）：奖池元素的权重键名**逐字 = `weight`** ——
//   **相对权重、正整数**，只要求「各自为正整数」，**不要求**求和为 100（抽签是累计权重法，见
//   `task-center.pickSigninPoolItem`：`acc = r * Σweight` 后逐项相减）。后台 UI 上它**显示为「权重」**。
//   **不得**改用 `probability` / `percent`（前端并行单曾以 `probability` 为假定形状 ⇒ 以后端为准，
//   下游若再漂移，落盘会因键名不匹配而静默丢权重）。

/**
 * 奖池校验（**纯函数**，无 IO）：`{ ok:true, pool }` / `{ ok:false, message }`。
 * 规则逐字（§5）：非空数组；每项 `kind ∈ SIGNIN_POOL_KINDS`、`weight` 正整数、`qty` 正整数。
 * ⚠️ 权重键名**权威 = `weight`**（相对权重、正整数，**不要求**求和为 100；后台 UI 显示为「权重」），
 * **不得**改用 `probability` / `percent`（见 `DEFAULT_SIGNIN_POOL` 上方注释）。
 * 返回的 `pool` 是**逐项重建的新对象**（只留 `kind` / `qty` / `weight` 三键，字面原样保留）——
 * 不把入参里的其它字段（例如前端多传的 `label`）写进配置载体。
 */
export function normalizeSigninPool(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: '签到奖励池必须是非空数组' };
  const pool = [];
  for (const [i, item] of raw.entries()) {
    const kind = typeof item?.kind === 'string' ? item.kind.trim() : '';
    if (!SIGNIN_POOL_KINDS.includes(kind)) {
      return { ok: false, message: `第 ${i + 1} 项奖励类型不合法（可用：fragment / bamboo / scroll_fragment / scroll）` };
    }
    const qty = Number(item?.qty);
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, message: `第 ${i + 1} 项数量必须为正整数` };
    const weight = Number(item?.weight);
    if (!Number.isInteger(weight) || weight <= 0) return { ok: false, message: `第 ${i + 1} 项权重必须为正整数` };
    pool.push({ kind, qty, weight });
  }
  return { ok: true, pool };
}

// ---- 存内工具（元字段进出剥离；照 economy-ledger.js / economy-market.js 体例）----

/** 剥离存储元字段（`_id` / `version`）→ 业务记录本身（对外形状与旧记录一字不差） */
function stripMeta(doc) {
  const r = { ...(doc || {}) };
  delete r._id;
  delete r.version;
  return r;
}

/** 读配置档的业务记录（`_id='config'`；不存在 → `{}`，读侧走各自默认值） */
async function loadConfig() {
  const doc = await colGet(WALLET_COL, CONFIG_ID);
  return stripMeta(doc);
}

/** 挂钱包流水 id（`tx_<毫秒>_<rand6>`，逐字沿用旧口径） */
function txid() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 合并「用户档 txs」与「平台档 txs」为旧「单文档 `transactions` 全局序」的等价视图（纯函数）。
 * 旧实现按**追加先后**落在同一数组（≈ `ts` 升序）；此处按 `ts` 升序**稳定排序**（同刻保持
 * 「用户档在前、平台档在后」的相对顺序），使 `/wallet/balance` 的 `transactions` 出参与改造前一致。
 * `ts` 缺失 / 非法按 0 参与排序（不改变可读性）。
 */
function mergeTxs(userTxs, platformTxs) {
  return [...(userTxs || []), ...(platformTxs || [])]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const av = Date.parse(a.t?.ts);
      const bv = Date.parse(b.t?.ts);
      const an = Number.isFinite(av) ? av : 0;
      const bn = Number.isFinite(bv) ? bv : 0;
      return an - bn || a.i - b.i;
    })
    .map((x) => x.t);
}

// ---- 读接口（余额 / 建树费） ----

export async function getUserBalance(phone) {
  const doc = await colGet(WALLET_COL, walletIdOf(phone));
  return doc?.balance_cents || 0;
}

export async function getTreeCreateFeeCents() {
  const cfg = await loadConfig();
  return cfg.tree_create_fee_cents ?? DEFAULT_FEE_CENTS;
}

// ---- 余额变更（**余额 + 流水同一 CAS mutator 内原子完成**）----
// ⚠️ CAS 纪律：mutator 收到的是该手机号档的**业务记录**（已剥离 `_id` / `version`）；时间 / 随机（`tx.id` / `ts`）
//   一律由调用方在进入 `mutateDoc` 之前算好并作闭包传入 —— 冲突重放时复用同一 `tx`（既不丢、也不重复记）。

export async function recharge(phone, amountCents) {
  if (amountCents <= 0) throw new Error('充值金额必须大于 0');
  const id = walletIdOf(phone);
  const tx = { id: txid(), type: 'recharge', user: phone, amount_cents: amountCents, desc: '充值', ts: new Date().toISOString() };
  const written = await mutateDoc(WALLET_COL, id, (doc) => {
    const rec = stripMeta(doc);
    rec.balance_cents = (rec.balance_cents || 0) + amountCents;
    rec.txs = Array.isArray(rec.txs) ? rec.txs : [];
    rec.txs.push(tx);
    return rec;
  });
  return written.balance_cents;
}

export async function deductTreeCreateFee(phone) {
  const fee = await getTreeCreateFeeCents();
  const id = walletIdOf(phone);
  const tx = {
    id: txid(),
    type: 'tree_create_fee',
    user: phone,
    amount_cents: -fee,
    desc: `新建家族树费用 ¥${(fee / 100).toFixed(2)}`,
    ts: new Date().toISOString(),
  };
  const written = await mutateDoc(WALLET_COL, id, (doc) => {
    const rec = stripMeta(doc);
    const balance = rec.balance_cents || 0;
    if (balance < fee) {
      throw new Error(`余额不足，新建家族树需要 ¥${(fee / 100).toFixed(2)}，当前余额 ¥${(balance / 100).toFixed(2)}`);
    }
    rec.balance_cents = balance - fee;
    rec.txs = Array.isArray(rec.txs) ? rec.txs : [];
    rec.txs.push(tx);
    return rec;
  });
  return written.balance_cents;
}

/**
 * ¥ 消费扣款（**唯一人民币消费通道 = 购买官方竹简**，docs/economy-market.spec.md §7 / §10 反变现约束）：
 * 余额不足 → 抛错（调用方应先校验并在路由层回 409 文案）；写一条 ¥ 钱包流水（`type` 缺省 `official_bamboo`）。
 * 余额校验**在 CAS mutator 内**基于最新档完成，冲突重放后在最新余额上重新校验 ⇒ 绝不超扣 / 不为负。
 * @returns {Promise<number>} 扣款后余额（分）
 */
export async function deductUserBalance(phone, amountCents, opts = {}) {
  const amount = Math.floor(Number(amountCents) || 0);
  if (amount <= 0) throw new Error('扣款金额必须大于 0');
  const id = walletIdOf(phone);
  const tx = {
    id: txid(),
    type: opts.type || 'official_bamboo',
    user: phone,
    amount_cents: -amount,
    desc: opts.desc || '购买官方竹简',
    ts: new Date().toISOString(),
  };
  const written = await mutateDoc(WALLET_COL, id, (doc) => {
    const rec = stripMeta(doc);
    const balance = rec.balance_cents || 0;
    if (balance < amount) throw new Error(`余额不足：当前 ¥${(balance / 100).toFixed(2)}`);
    rec.balance_cents = balance - amount;
    rec.txs = Array.isArray(rec.txs) ? rec.txs : [];
    rec.txs.push(tx);
    return rec;
  });
  return written.balance_cents;
}

// ---- 配置类单档（`_id='config'`）读写 ----

export async function setTreeCreateFeeCents(amountCents) {
  if (amountCents <= 0) throw new Error('费用必须大于 0');
  await mutateDoc(WALLET_COL, CONFIG_ID, (doc) => {
    const rec = stripMeta(doc);
    rec.tree_create_fee_cents = amountCents;
    return rec;
  });
  return amountCents;
}

// ---- 立支 / 汇宗 后台设置键（同一设置载体 `jiazu_wallets.config`；docs/branch-clan-ops.spec.md §5-4）----

/**
 * 立支费（颗完整石榴籽）：`config.branch_fee_seeds`，缺省 / 非法值 → 9999。
 * 只读；写入口沿用既有治理路由 `PUT /admin/wallet-fee`（本册不新增设置路由）。
 */
export async function getBranchFeeSeeds() {
  const cfg = await loadConfig();
  const raw = Number(cfg?.branch_fee_seeds);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_BRANCH_FEE_SEEDS;
}

/** 设置立支费（整数颗；≤0 / 非整数 → 抛错，路由回 400） */
export async function setBranchFeeSeeds(seeds) {
  const n = Number(seeds);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new Error('立支费必须为正整数（颗）');
  await mutateDoc(WALLET_COL, CONFIG_ID, (doc) => {
    const rec = stripMeta(doc);
    rec.branch_fee_seeds = n;
    return rec;
  });
  return n;
}

/**
 * 汇宗灵气折损比例：`config.converge_spirit_ratio`，缺省 / 非 0–1 → 0.5。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。
 */
export async function getConvergeSpiritRatio() {
  const cfg = await loadConfig();
  const raw = Number(cfg?.converge_spirit_ratio);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_CONVERGE_SPIRIT_RATIO;
}

/** 设置汇宗折损比例（0–1；越界 → 抛错，路由回 400） */
export async function setConvergeSpiritRatio(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('折损比例必须为 0–1 之间的数');
  await mutateDoc(WALLET_COL, CONFIG_ID, (doc) => {
    const rec = stripMeta(doc);
    rec.converge_spirit_ratio = n;
    return rec;
  });
  return n;
}

/**
 * 每日签到随机奖池：`config.signin_pool`，缺省 / 非法（非数组 / 空数组 / 含非法项）→ `DEFAULT_SIGNIN_POOL`。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。返回**逐项新对象**（`kind` / `qty` / `weight` 三键），
 * 调用方改它不会污染后续读取（默认值亦每次新拷贝）。
 */
export async function getSigninPool() {
  const cfg = await loadConfig();
  const checked = normalizeSigninPool(cfg?.signin_pool);
  const src = checked.ok ? checked.pool : DEFAULT_SIGNIN_POOL;
  return src.map((it) => ({ kind: it.kind, qty: it.qty, weight: it.weight }));
}

/** 设置每日签到随机奖池（非空数组 + kind 白名单 + qty / weight 正整数；非法 → 抛错，路由回 400） */
export async function setSigninPool(pool) {
  const checked = normalizeSigninPool(pool);
  if (!checked.ok) throw new Error(checked.message);
  await mutateDoc(WALLET_COL, CONFIG_ID, (doc) => {
    const rec = stripMeta(doc);
    rec.signin_pool = checked.pool;
    return rec;
  });
  return checked.pool;
}

/**
 * 补签费用（片竹片）：`config.signin_makeup_cost_bamboos`，缺省 / 非法值 → 2。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。
 */
export async function getSigninMakeupCostBamboos() {
  const cfg = await loadConfig();
  const raw = Number(cfg?.signin_makeup_cost_bamboos);
  return Number.isFinite(raw) && raw > 0 && Math.floor(raw) === raw ? raw : DEFAULT_SIGNIN_MAKEUP_COST_BAMBOOS;
}

/** 设置补签费用（正整数片；≤0 / 非整数 → 抛错，路由回 400） */
export async function setSigninMakeupCostBamboos(n0) {
  const n = Number(n0);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new Error('补签费用必须为正整数（片竹片）');
  await mutateDoc(WALLET_COL, CONFIG_ID, (doc) => {
    const rec = stripMeta(doc);
    rec.signin_makeup_cost_bamboos = n;
    return rec;
  });
  return n;
}

/**
 * 连签第 7 天额外奖励（个石榴籽碎片）：`config.signin_day7_fragments`，缺省 / 非法值 → 10。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。
 */
export async function getSigninDay7Fragments() {
  const cfg = await loadConfig();
  const raw = Number(cfg?.signin_day7_fragments);
  return Number.isFinite(raw) && raw >= 0 && Math.floor(raw) === raw ? raw : DEFAULT_SIGNIN_DAY7_FRAGMENTS;
}

/** 设置第 7 天奖励（**非负**整数个；负数 / 非整数 → 抛错，路由回 400） */
export async function setSigninDay7Fragments(n0) {
  const n = Number(n0);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) throw new Error('第 7 天奖励必须为非负整数（个石榴籽碎片）');
  await mutateDoc(WALLET_COL, CONFIG_ID, (doc) => {
    const rec = stripMeta(doc);
    rec.signin_day7_fragments = n;
    return rec;
  });
  return n;
}

// ---- 出参组装（`GET /wallet/balance`）----

/**
 * 钱包总览：余额 + 建树费 + 最近 50 条流水（新的在前）。
 * 流水来源 = 用户档 `txs`（`user === phone`）+ 平台档 `txs`（无 `user`，旧实现里对所有用户可见），
 * 按 `ts` 升序合并后取末 50 条、倒序 —— 出参形状与改造前逐字一致。
 * @returns {Promise<{user_balance_yuan:string, tree_create_fee_yuan:string, transactions:object[]}>}
 */
export async function getWalletOverview(phone) {
  const id = walletIdOf(phone);
  const [userDoc, platformDoc, cfg] = await Promise.all([
    colGet(WALLET_COL, id),
    colGet(WALLET_COL, PLATFORM_ID),
    loadConfig(),
  ]);
  const balanceCents = userDoc?.balance_cents || 0;
  const transactions = mergeTxs(userDoc?.txs, platformDoc?.txs).slice(-50).reverse();
  return {
    user_balance_yuan: (balanceCents / 100).toFixed(2),
    tree_create_fee_yuan: ((cfg.tree_create_fee_cents ?? DEFAULT_FEE_CENTS) / 100).toFixed(2),
    transactions,
  };
}
