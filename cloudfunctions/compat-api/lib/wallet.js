/**
 * 钱包模块（集合 jiazu_wallets，_id='global'）
 * 规则与 auth-server/wallet.js 一致：分存储、建树费 9.9 元默认。
 * **家族树资金功能已下线**（docs/economy.spec.md §12-3）：`trees[tree_id].balance_cents`、`transferToTree`、
 * `getTreeBalance` 均已移除（`/wallet/transfer`、`/wallet/tree-balance` 恒 410）；本模块只留
 * 个人 ¥ 余额（充值与购买官方竹简的唯一通道）与建树费设置。auth-server/** 属遗留链路，不在本册范围。
 */
import { colGet, colSet } from './store.js';

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

async function load() {
  const w = await colGet('jiazu_wallets', 'global');
  return (
    w || {
      users: {},
      trees: {},
      transactions: [],
      config: { tree_create_fee_cents: DEFAULT_FEE_CENTS },
    }
  );
}

async function persist(w) {
  await colSet('jiazu_wallets', 'global', w);
}

function txid() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getUserBalance(phone) {
  const w = await load();
  return w.users[phone]?.balance_cents || 0;
}

export async function getTreeCreateFeeCents() {
  const w = await load();
  return w.config.tree_create_fee_cents ?? DEFAULT_FEE_CENTS;
}

export async function recharge(phone, amountCents) {
  if (amountCents <= 0) throw new Error('充值金额必须大于 0');
  const w = await load();
  if (!w.users[phone]) w.users[phone] = { balance_cents: 0 };
  w.users[phone].balance_cents += amountCents;
  w.transactions.push({ id: txid(), type: 'recharge', user: phone, amount_cents: amountCents, desc: '充值', ts: new Date().toISOString() });
  await persist(w);
  return w.users[phone].balance_cents;
}

export async function deductTreeCreateFee(phone) {
  const fee = await getTreeCreateFeeCents();
  const w = await load();
  const balance = w.users[phone]?.balance_cents || 0;
  if (balance < fee) {
    throw new Error(`余额不足，新建家族树需要 ¥${(fee / 100).toFixed(2)}，当前余额 ¥${(balance / 100).toFixed(2)}`);
  }
  w.users[phone].balance_cents -= fee;
  w.transactions.push({ id: txid(), type: 'tree_create_fee', user: phone, amount_cents: -fee, desc: `新建家族树费用 ¥${(fee / 100).toFixed(2)}`, ts: new Date().toISOString() });
  await persist(w);
  return w.users[phone].balance_cents;
}

/**
 * ¥ 消费扣款（**唯一人民币消费通道 = 购买官方竹简**，docs/economy-market.spec.md §7 / §10 反变现约束）：
 * 余额不足 → 抛错（调用方应先校验并在路由层回 409 文案）；写一条 ¥ 钱包流水（`type` 缺省 `official_bamboo`）。
 * @returns {Promise<number>} 扣款后余额（分）
 */
export async function deductUserBalance(phone, amountCents, opts = {}) {
  const amount = Math.floor(Number(amountCents) || 0);
  if (amount <= 0) throw new Error('扣款金额必须大于 0');
  const w = await load();
  const balance = w.users[phone]?.balance_cents || 0;
  if (balance < amount) throw new Error(`余额不足：当前 ¥${(balance / 100).toFixed(2)}`);
  w.users[phone].balance_cents -= amount;
  w.transactions.push({
    id: txid(),
    type: opts.type || 'official_bamboo',
    user: phone,
    amount_cents: -amount,
    desc: opts.desc || '购买官方竹简',
    ts: new Date().toISOString(),
  });
  await persist(w);
  return w.users[phone].balance_cents;
}

export async function setTreeCreateFeeCents(amountCents) {
  if (amountCents <= 0) throw new Error('费用必须大于 0');
  const w = await load();
  w.config.tree_create_fee_cents = amountCents;
  await persist(w);
  return amountCents;
}

// ---- 立支 / 汇宗 后台设置键（同一设置载体 `jiazu_wallets.config`；docs/branch-clan-ops.spec.md §5-4）----

/**
 * 立支费（颗完整石榴籽）：`config.branch_fee_seeds`，缺省 / 非法值 → 9999。
 * 只读；写入口沿用既有治理路由 `PUT /admin/wallet-fee`（本册不新增设置路由）。
 */
export async function getBranchFeeSeeds() {
  const w = await load();
  const raw = Number(w.config?.branch_fee_seeds);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_BRANCH_FEE_SEEDS;
}

/** 设置立支费（整数颗；≤0 / 非整数 → 抛错，路由回 400） */
export async function setBranchFeeSeeds(seeds) {
  const n = Number(seeds);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new Error('立支费必须为正整数（颗）');
  const w = await load();
  w.config = w.config || {};
  w.config.branch_fee_seeds = n;
  await persist(w);
  return n;
}

/**
 * 汇宗灵气折损比例：`config.converge_spirit_ratio`，缺省 / 非 0–1 → 0.5。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。
 */
export async function getConvergeSpiritRatio() {
  const w = await load();
  const raw = Number(w.config?.converge_spirit_ratio);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_CONVERGE_SPIRIT_RATIO;
}

/** 设置汇宗折损比例（0–1；越界 → 抛错，路由回 400） */
export async function setConvergeSpiritRatio(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('折损比例必须为 0–1 之间的数');
  const w = await load();
  w.config = w.config || {};
  w.config.converge_spirit_ratio = n;
  await persist(w);
  return n;
}

/**
 * 每日签到随机奖池：`config.signin_pool`，缺省 / 非法（非数组 / 空数组 / 含非法项）→ `DEFAULT_SIGNIN_POOL`。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。返回**逐项新对象**（`kind` / `qty` / `weight` 三键），
 * 调用方改它不会污染后续读取（默认值亦每次新拷贝）。
 */
export async function getSigninPool() {
  const w = await load();
  const checked = normalizeSigninPool(w.config?.signin_pool);
  const src = checked.ok ? checked.pool : DEFAULT_SIGNIN_POOL;
  return src.map((it) => ({ kind: it.kind, qty: it.qty, weight: it.weight }));
}

/** 设置每日签到随机奖池（非空数组 + kind 白名单 + qty / weight 正整数；非法 → 抛错，路由回 400） */
export async function setSigninPool(pool) {
  const checked = normalizeSigninPool(pool);
  if (!checked.ok) throw new Error(checked.message);
  const w = await load();
  w.config = w.config || {};
  w.config.signin_pool = checked.pool;
  await persist(w);
  return checked.pool;
}

/**
 * 补签费用（片竹片）：`config.signin_makeup_cost_bamboos`，缺省 / 非法值 → 2。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。
 */
export async function getSigninMakeupCostBamboos() {
  const w = await load();
  const raw = Number(w.config?.signin_makeup_cost_bamboos);
  return Number.isFinite(raw) && raw > 0 && Math.floor(raw) === raw ? raw : DEFAULT_SIGNIN_MAKEUP_COST_BAMBOOS;
}

/** 设置补签费用（正整数片；≤0 / 非整数 → 抛错，路由回 400） */
export async function setSigninMakeupCostBamboos(n0) {
  const n = Number(n0);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) throw new Error('补签费用必须为正整数（片竹片）');
  const w = await load();
  w.config = w.config || {};
  w.config.signin_makeup_cost_bamboos = n;
  await persist(w);
  return n;
}

/**
 * 连签第 7 天额外奖励（个石榴籽碎片）：`config.signin_day7_fragments`，缺省 / 非法值 → 10。
 * 只读；写入口同上（`PUT /admin/wallet-fee`）。
 */
export async function getSigninDay7Fragments() {
  const w = await load();
  const raw = Number(w.config?.signin_day7_fragments);
  return Number.isFinite(raw) && raw >= 0 && Math.floor(raw) === raw ? raw : DEFAULT_SIGNIN_DAY7_FRAGMENTS;
}

/** 设置第 7 天奖励（**非负**整数个；负数 / 非整数 → 抛错，路由回 400） */
export async function setSigninDay7Fragments(n0) {
  const n = Number(n0);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) throw new Error('第 7 天奖励必须为非负整数（个石榴籽碎片）');
  const w = await load();
  w.config = w.config || {};
  w.config.signin_day7_fragments = n;
  await persist(w);
  return n;
}

export async function getWalletOverview(phone) {
  const w = await load();
  const transactions = w.transactions
    .filter((t) => !t.user || t.user === phone)
    .slice(-50)
    .reverse();
  return {
    user_balance_yuan: ((w.users[phone]?.balance_cents || 0) / 100).toFixed(2),
    tree_create_fee_yuan: ((w.config.tree_create_fee_cents ?? DEFAULT_FEE_CENTS) / 100).toFixed(2),
    transactions,
  };
}
