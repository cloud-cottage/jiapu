/**
 * 市集 + 官方竹简每日限量发售内核（P3）— 集合 jiazu_market（**每档一文档 · 存储形态 v2**）
 *
 * 唯一真源：docs/economy-market.spec.md（市集分册）+ docs/economy.spec.md（总纲）
 *   §2 存储契约（jiazu_market.listings / trades / official）/ §3 资产流转总表（4 行：挂单 / 撤单 / 成交 / 官方购买）
 *   §4 手续费 `fee_seeds = floor(标价 × 1/100)`（0 免收；199 → 买方 199 / 卖方 198 / 销毁 1）
 *   §5 挂单锁定（**派生占量，不给 BambooLot 加 locked 字段**）与并发（状态条件更新为临界区）
 *   §6 惰性结算（批次 sweep + 挂单 sweep 到期释放锁定）/ §6-2 成交批次 `expires_at` 继承卖方原值（不重置）
 *   §7 官方发售（¥9.90/束 · 每日 21:00 惰性释放 · 当日不结转 · 售罄即止）
 *   总纲 §4-3 字段表 / §4-6 Tx.type / §5-4 惰性结算 / §5-7 并发与唯一写入路径 / §6-1 §6-2 接口 / §8 权限（`GET /market/listings` guest 可读）
 *
 * **存储形态 v2（2026-10-03 Zang 裁定 · 路 B 第 2 期·B 路）**：`jiazu_market` 由「全体共用单文档
 * `_id='global'`（内嵌 `listings` / `trades` 数组 + `official`）」改为：
 *   · 挂单 = **每挂单一档**（`_id = listing.id`，即 `lst_<毫秒>_<rand6>`）；
 *   · 成交 = **每成交一档**（`_id = trade.id`，即 `trd_<毫秒>_<rand6>`）；
 *   · 官方发售配置 = **单档 `_id='official'`**（`OFFICIAL_ID`，配置类，允许保留单文档）。
 * 每档带 `version`（非负整数、自 1 起）。写入协议 = `store.mutateDoc` 的 **CAS**：读当前档 → 纯函数 mutator →
 * `version+1` → 条件写 → **读回比对**；冲突重读重放（上限 5 次 + 退避），耗尽抛错 ⇒ 云端多实例并发不再丢更新。
 * 业务字段名 / 数值 / 计费口径一字不改；列表 / 查询路径 = `store.listAll` 分页枚举 + **原样过滤排序**，
 * 语义与改造前逐字一致；元字段（`_id` / `version`）**不泄漏给接口调用方**。
 *
 * 分层（纯函数与 IO 分离，便于单测）：
 *   - 纯函数：feeOf / feeBreakdown / sweepListings / lockedPieces / availablePieces / sellablePieces /
 *     releaseOfficial / planTrade / applyBuyerSide / applySellerSide / applyOfficialPurchase / listingPayload
 *   - IO 层：withMarket（**全局串行队列**，模式照 economy-ledger.js 的 assetsLocks + store.mutateDoc 的 CAS）+
 *     marketListings / myMarket / listBamboo / cancelListing / buyListing / officialPurchase /
 *     setOfficialStock / hasOpenListing / openListingGuard
 *
 * **不重写第二套账本算法**：FIFO 扣减 / 整单拒绝 / 批次 sweep / 批次与流水读写全部复用
 * lib/economy-ledger.js（chargeLots / addLot / sumLots / sweep / recordTx / withAssets / getAssets /
 * assetInsufficient / beijingDate）；本模块只做「市集判定 + 官方发售判定 + 编排」。
 * ¥ 钱包（jiazu_wallets）只经 lib/wallet.js（人民币只用于购买官方竹简，§7 / §10 反变现约束）。
 *
 * 锁顺序（**不得颠倒**，防死锁）：`market(全局) → assets(phone)`；无任何路径先持 assets 锁再取 market 锁。
 * 跨集合（jiazu_market + jiazu_assets + jiazu_wallets）无事务 API：先写一侧，后续失败 → 用快照回滚（同
 * economy-spirit.chargeSpirit 与 store.updateTrees 的「顺序写 + 失败回滚」口径）。
 */
import { colGet, listAll, mutateDoc } from './store.js';
import {
  BAMBOO_TTL_DAYS,
  addLot,
  assetInsufficient,
  beijingDate,
  chargeLots,
  getAssets,
  recordTx,
  sumLots,
  sweep,
  toNonNegInt,
  withAssets,
} from './economy-ledger.js';
import * as wallet from './wallet.js';

// ---- 集合与常量（§2-1 / §11-25：改动先改规格） ----

export const MARKET_COL = 'jiazu_market';
/**
 * 官方发售配置档 `_id`（**单档，配置类**；§2-1）。存储形态 v2：挂单 / 成交各一档一文档，官方配置保留单档。
 * 旧「单文档 `_id='global'`（内嵌 `listings` / `trades` / `official`）」已废弃（迁后 `global` 键消失）。
 */
export const OFFICIAL_ID = 'official';
/** 挂单档 `_id` 前缀（= `listingId()` 产出前缀；枚举 / 判别用） */
const LISTING_PREFIX = 'lst_';
/** 成交档 `_id` 前缀（= `tradeId()` 产出前缀；枚举 / 判别用） */
const TRADE_PREFIX = 'trd_';
/** 挂单时限（天，K9 定稿）：`expires_at = created_at + LISTING_TTL_DAYS 天` */
export const LISTING_TTL_DAYS = 7;
/** 1 束 = 100 片（恒等，市集与官方发售唯一计量口径；**碎片 / 零散竹片 / 籽 / 玉均不可上架**） */
export const PIECES_PER_BUNDLE = 100;
/** 手续费率：1/100（floor，不足 1 籽免收） */
export const FEE_RATE_PERCENT = 1;
export const FEE_RATE_DENOMINATOR = 100;
/** `Listing.status` 枚举（§2-1 / 总纲 §4-3） */
export const LISTING_STATUSES = ['open', 'sold', 'cancelled', 'expired'];
/** 官方售价（分）：¥9.90 / 束 */
export const DEFAULT_PRICE_FEN = 990;
/** 官方每日配额初值（束，K4 定稿）：后台可改 */
export const DEFAULT_DAILY_STOCK = 50;
/** 每日发售时点（CST，UTC+08:00）：21:00 */
export const RELEASE_HOUR = 21;
export const RELEASE_AT = '21:00';
/** 官方购买所得竹片有效期（天）：**新入账** → `now + 365d`（与市集成交「继承卖方原批次」区分，§6-2） */
export const OFFICIAL_BAMBOO_TTL_DAYS = BAMBOO_TTL_DAYS;
/** ¥ 钱包流水类型（**¥ 流水类型，非 Tx.type**，§3 官方购买行） */
export const WALLET_TX_TYPE = 'official_bamboo';

const DAY_MS = 86400000;
const toMs = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const isoOf = (d) => new Date(toMs(d)).toISOString();

// ---- 错误文案（§8 错误码表；错误体统一由路由走 eco.errorPayload，只回域名码） ----

export const ERR_LISTING_ID_MISSING = '缺少 listing_id';
export const ERR_BUNDLES_INVALID = '束数必须为不小于 1 的整数（1 束 = 100 片）';
export const ERR_PRICE_INVALID = '标价必须为不小于 1 的整数石榴籽';
export const ERR_PRICE_FEN_INVALID = '价格必须为不小于 1 分的整数';
export const ERR_DAILY_STOCK_INVALID = '每日库存必须为不小于 0 的整数';
export const ERR_STATUS_INVALID = '不支持的挂单状态';
export const ERR_LISTING_NOT_FOUND = '挂单不存在';
export const ERR_LISTING_CLOSED = '挂单已成交或已撤单';
export const ERR_LISTING_EXPIRED = '挂单已过期';
export const ERR_NOT_OWNER = '只能撤销本人的挂单';
export const ERR_SELF_TRADE = '不可购买自己的挂单';
export const ERR_LISTING_STATE = '挂单状态异常，请刷新后重试';
export const ERR_UNAVAILABLE_BAMBOO = '可用竹片不足，请撤单后重挂';
/** 成交前置：卖方可用片数 < 挂单片数（含部分批次已过期，§6-1） */
export const ERR_BAMBOO_EXPIRED = '部分竹片已过期，请撤单后重挂';
export const ERR_NOT_OPEN_YET = '未到发售时间';
export const ERR_SOLD_OUT = '今日已售罄';
export const ERR_OPEN_LISTING_BLOCK_LOGOUT = '请先撤销未成交挂单';

/** 业务错误（有 status、无 code → 路由 catch 保持既有 4xx 语义） */
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** 籽不足（409）——保持账本内核口径（code=`ASSET_INSUFFICIENT` / `need` / `current` / `unit`），只换业务文案 */
function seedsInsufficient(need, current, message) {
  const e = assetInsufficient(need, current, 'seed');
  if (message) e.message = message;
  return e;
}

/** 竹片不足（409）——同上，单位「片」 */
function bambooInsufficient(need, current, message) {
  const e = assetInsufficient(need, current, 'bamboo');
  if (message) e.message = message;
  return e;
}

// ---- id（§5-2：沿用 wallet.js 既有口径 `lst_` / `trd_`；正确性不依赖 id 唯一） ----

const rand6 = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0').slice(0, 6);
/** 挂单 id：`lst_<毫秒时间戳>_<6 位随机>`（= 挂单档 `_id`） */
export function listingId() {
  return `lst_${Date.now()}_${rand6()}`;
}
/** 成交 id：`trd_<毫秒时间戳>_<6 位随机>`（= 成交档 `_id`） */
export function tradeId() {
  return `trd_${Date.now()}_${rand6()}`;
}

// ---- §4 手续费算法与边界（唯一实现） ----

/**
 * 手续费（籽）：`fee_seeds = floor(标价 × 1 / 100)`（整数除法；**不足 1 籽免收**）。
 * 边界：1/50/99 → 0（免收）；100 → 1；101 → 1；199 → 1；200 → 2；999 → 9；1000 → 10。
 */
export function feeOf(priceSeeds) {
  const price = toNonNegInt(priceSeeds);
  return Math.floor((price * FEE_RATE_PERCENT) / FEE_RATE_DENOMINATOR);
}

/**
 * 手续费拆解（§4-1）：
 * - `buyer_paid`  = 标价（买方**不叠加**手续费）
 * - `seller_got`  = 标价 − `fee_seeds`
 * - `destroyed`   = `fee_seeds`（**销毁：不入买方、不入卖方、不入平台账户**）
 * - `waived`      = `fee_seeds === 0`（免收）
 */
export function feeBreakdown(priceSeeds) {
  const price_seeds = toNonNegInt(priceSeeds);
  const fee_seeds = feeOf(price_seeds);
  return {
    price_seeds,
    fee_seeds,
    buyer_paid: price_seeds,
    seller_got: price_seeds - fee_seeds,
    destroyed: fee_seeds,
    waived: fee_seeds === 0,
  };
}

// ---- §5-1 挂单锁定（**纯派生量，不落库、不给 BambooLot 加字段**） ----

/** 某手机号当前 `status='open'` 挂单的占量合计（片） */
export function lockedPieces(phone, listings) {
  let sum = 0;
  for (const l of listings || []) {
    if (!l || l.status !== 'open' || l.seller_phone !== phone) continue;
    sum += toNonNegInt(l.pieces);
  }
  return sum;
}

/**
 * 卖方可用竹片（片）= Σ(未过期 `bamboos.qty`) − Σ(本方 `status='open'` 挂单 `pieces`)。
 * **调用方必须先 sweep 资产与挂单**（§6-1：过期批次与过期挂单都不参与可用量）。
 */
export function availablePieces(phone, user, listings) {
  return Math.max(0, sumLots(user?.bamboos) - lockedPieces(phone, listings));
}

/**
 * 挂单可用量（片）= `floor(可用片数 / 100) × 100`（§11-21：**不足 1 束不得与其它批次拼束**）。
 * 整束上架的口径由此派生：`bundles × 100 ≤ sellablePieces`。
 */
export function sellablePieces(phone, user, listings) {
  return Math.floor(availablePieces(phone, user, listings) / PIECES_PER_BUNDLE) * PIECES_PER_BUNDLE;
}

/** 挂单可用**束**数（展示用） */
export function sellableBundles(phone, user, listings) {
  return Math.floor(availablePieces(phone, user, listings) / PIECES_PER_BUNDLE);
}

// ---- §6-1 惰性结算：挂单到期下架（保留原行，不物理删） ----

/**
 * 挂单 sweep（纯函数）：凡 `status='open'` 且 `expires_at <= now` → `status='expired'`。
 * - **保留原行**（不物理删）、不改 `sold_at` / `buyer_phone`；
 * - 锁定为派生量：`expired` 不满足 `status='open'` → 占量即时消失、被锁竹片回到卖方可用（§5-1）；
 * - 无资产变动（流水 `Tx{type:'expire'}` 留痕由 IO 层 `withMarket` 写，见下方 `recordListingExpiryTx`）。
 * `expires_at` 缺失 / 非法 → 视为不过期（不误杀历史脏数据）。
 * @returns {object[]} 本次被置为 `expired` 的挂单（同一数组内对象引用）
 */
export function sweepListings(listings, now = new Date()) {
  const expired = [];
  const nowMs = toMs(now);
  for (const l of listings || []) {
    if (!l || l.status !== 'open') continue;
    const expMs = l.expires_at ? Date.parse(l.expires_at) : NaN;
    if (!Number.isFinite(expMs) || expMs > nowMs) continue;
    l.status = 'expired';
    expired.push(l);
  }
  return expired;
}

// ---- §7 官方发售：定价 / 惰性释放 / 时点判定（纯函数） ----

/** 空官方配置档（§2-1；单档 `_id='official'` 的业务记录） */
export function blankOfficial() {
  return {
    price_fen: DEFAULT_PRICE_FEN,
    daily_stock: DEFAULT_DAILY_STOCK,
    stock: {},
    last_release_date: '',
  };
}

/** 空市集**读模型**（聚合视图，非单个存储档；§2-1） */
export function blankMarketDoc() {
  return {
    listings: [],
    trades: [],
    official: blankOfficial(),
  };
}

/**
 * `official` 记录收口（缺省 / 脏值就地补全；不新增字段）。
 * 入参 = 官方配置档**业务记录**（已剥离 `_id` / `version`）；返回同一对象（就地补全）。
 */
export function ensureOfficial(official) {
  const o = official && typeof official === 'object' ? official : {};
  o.stock = o.stock && typeof o.stock === 'object' ? o.stock : {};
  o.price_fen = Number.isFinite(Number(o.price_fen)) && Number(o.price_fen) > 0 ? Math.floor(Number(o.price_fen)) : DEFAULT_PRICE_FEN;
  o.daily_stock = Number.isFinite(Number(o.daily_stock)) && Number(o.daily_stock) >= 0 ? Math.floor(Number(o.daily_stock)) : DEFAULT_DAILY_STOCK;
  o.last_release_date = typeof o.last_release_date === 'string' ? o.last_release_date : '';
  return o;
}

/** 当日（北京时间自然日）发售时点 21:00 的时刻（ms） */
export function releaseAtMs(now = new Date()) {
  return Date.parse(`${beijingDate(now)}T${String(RELEASE_HOUR).padStart(2, '0')}:00:00+08:00`);
}

/**
 * 官方库存**惰性释放**（§7-2，幂等）：
 * ```
 * today = 当日(YYYY-MM-DD, UTC+08:00)
 * if (now >= 当日 21:00) and (official.last_release_date < today):
 *     official.stock[today] = official.daily_stock    // 覆盖当日键：**未售完不结转**
 *     official.last_release_date = today
 * ```
 * 21:00 前不释放（`stock_left_today` 仅用于展示，不代表可购买）。
 * @returns {{released:boolean, released_today:boolean, today:string, is_open:boolean, open_at:string,
 *   open_at_ms:number, release_at:string, stock_left_today:number}}
 */
export function releaseOfficial(official, now = new Date()) {
  const o = official || {};
  o.stock = o.stock && typeof o.stock === 'object' ? o.stock : {};
  const today = beijingDate(now);
  const openMs = releaseAtMs(now);
  const isOpen = toMs(now) >= openMs;
  const last = typeof o.last_release_date === 'string' ? o.last_release_date : '';
  const released = isOpen && last < today;
  if (released) {
    o.stock[today] = toNonNegInt(o.daily_stock);
    o.last_release_date = today;
  }
  return {
    released,
    released_today: (typeof o.last_release_date === 'string' ? o.last_release_date : '') === today,
    today,
    is_open: isOpen,
    open_at: `${today}T${RELEASE_AT}:00+08:00`,
    open_at_ms: openMs,
    release_at: RELEASE_AT,
    stock_left_today: toNonNegInt(o.stock[today]),
  };
}

// ---- §6 成交：批次整束转移（`expires_at` 继承卖方原值，不重置） ----

/** FIFO 排序键：`expires_at` 升序（最早到期优先；缺省值排最后） */
function byExpiryAsc(a, b) {
  const av = a?.expires_at ? Date.parse(a.expires_at) : Number.POSITIVE_INFINITY;
  const bv = b?.expires_at ? Date.parse(b.expires_at) : Number.POSITIVE_INFINITY;
  const an = Number.isFinite(av) ? av : Number.POSITIVE_INFINITY;
  const bn = Number.isFinite(bv) ? bv : Number.POSITIVE_INFINITY;
  return an - bn;
}

/**
 * 成交切片（纯函数）：从卖方**最早到期的批次**起取 `pieces` 片，逐片复制原批次的 `expires_at`。
 * - 合计恒等于 `pieces`（= `bundles × 100`，整束）；
 * - 返回按 `expires_at` 合并后的接收批次（同到期日合并为 1 lot，`source='market'`，§6-2）；
 * - 不足 → 抛 409（文案「部分竹片已过期，请撤单后重挂」）。
 */
export function bambooSlices(sellerUser, pieces, now = new Date()) {
  const need = toNonNegInt(pieces);
  const available = sumLots(sellerUser?.bamboos);
  if (available < need) throw bambooInsufficient(need, available, ERR_BAMBOO_EXPIRED);
  const taken = [];
  let left = need;
  for (const lot of [...(sellerUser.bamboos || [])].sort(byExpiryAsc)) {
    if (left <= 0) break;
    const qty = toNonNegInt(lot.qty);
    if (qty <= 0) continue;
    const take = Math.min(qty, left);
    taken.push({ lot_id: lot.id, qty: take, expires_at: lot.expires_at ?? null });
    left -= take;
  }
  if (left > 0) throw bambooInsufficient(need, need - left, ERR_BAMBOO_EXPIRED);
  // 同到期日合并为接收批次（买方 BambooLot 明细）
  const merged = [];
  const index = new Map();
  for (const t of taken) {
    const key = t.expires_at ?? '';
    if (index.has(key)) index.get(key).qty += t.qty;
    else {
      const row = { qty: t.qty, expires_at: t.expires_at ?? null, source: 'market' };
      index.set(key, row);
      merged.push(row);
    }
  }
  return { slices: taken, receive: merged, pieces: need, expires_at_inherited: merged.map((m) => m.expires_at) };
}

/**
 * 成交计划（纯函数，**不写 IO、不改传入对象**）：
 * 校验「买方籽可用 ≥ 标价」「卖方竹片可用（去本挂单占量）≥ 挂单片数」并算出账目与切片。
 * - `fee_seeds` / `seller_got` / `destroyed` 见 `feeBreakdown`；
 * - `expires_at` 继承卖方原 lot（**不重置、不续命**，§6-2；对比官方购买的 `now + 365d`）。
 * @returns {{price_seeds:number, pieces:number, fee_seeds:number, seller_got:number, destroyed:number,
 *   waived:boolean, slices:Array<{lot_id:string,qty:number,expires_at:string|null}>,
 *   receive:Array<{qty:number,expires_at:string|null,source:string}>, buyer_seeds_available:number}}
 */
export function planTrade({ listing, sellerUser, buyerUser, listings = [], now = new Date() } = {}) {
  const price_seeds = toNonNegInt(listing?.price_seeds);
  const pieces = toNonNegInt(listing?.pieces);
  const { fee_seeds, seller_got, destroyed, waived } = feeBreakdown(price_seeds);
  // 卖方：去掉**本挂单自身占量**后的可用片数（其余 open 挂单仍占量）
  const lockedOthers = lockedPieces(listing?.seller_phone, listings);
  const sellerAvailable = Math.max(0, sumLots(sellerUser?.bamboos) - lockedOthers);
  if (sellerAvailable < pieces) throw bambooInsufficient(pieces, sellerAvailable, ERR_BAMBOO_EXPIRED);
  const buyerAvailable = sumLots(buyerUser?.seeds);
  if (buyerAvailable < price_seeds) {
    throw seedsInsufficient(price_seeds, buyerAvailable, `石榴籽不足：本次需 ${price_seeds} 颗，当前可用 ${buyerAvailable} 颗`);
  }
  const { slices, receive } = bambooSlices(sellerUser, pieces, now);
  return { price_seeds, pieces, fee_seeds, seller_got, destroyed, waived, slices, receive, buyer_seeds_available: buyerAvailable };
}

/** 买方侧记账（在 `withAssets` mutator 内调用）：FIFO 扣籽 + 接收批次（`expires_at` 继承）+ `Tx{market_buy}` */
export function applyBuyerSide(buyerUser, plan, trade_id, now = new Date(), listing = {}) {
  const charge = chargeLots(buyerUser.seeds, plan.price_seeds, 'seed');
  buyerUser.seeds = (buyerUser.seeds || []).filter((l) => toNonNegInt(l.qty) > 0);
  const lots = [];
  for (const g of plan.receive || []) {
    lots.push(
      addLot(buyerUser, 'bamboo', g.qty, {
        expires_at: g.expires_at ?? undefined, // **继承卖方原值**（缺省才回落 365 天）
        source: 'market',
        now,
      }),
    );
  }
  recordTx(
    buyerUser,
    {
      type: 'market_buy',
      delta: { seeds: -plan.price_seeds, bamboos: plan.pieces },
      fee_seeds: plan.fee_seeds,
      ref: { listing_id: listing.id, trade_id },
      desc: `市集买入竹简 ${plan.pieces} 片（${plan.pieces / PIECES_PER_BUNDLE} 束）`,
    },
    now,
  );
  return { lot_ids: lots.map((l) => l.id), seeds_used: charge.taken.map((t) => ({ lot_id: t.id, qty: t.qty })) };
}

/** 卖方侧记账（在 `withAssets` mutator 内调用）：按切片交出竹片 + 入账籽（扣手续费后）+ `Tx{market_sell}` */
export function applySellerSide(sellerUser, plan, trade_id, now = new Date(), listing = {}) {
  const byId = new Map((sellerUser.bamboos || []).map((l) => [l.id, l]));
  let left = plan.pieces;
  for (const s of plan.slices || []) {
    const lot = byId.get(s.lot_id);
    const qty = toNonNegInt(lot?.qty);
    if (!lot || qty < s.qty) throw bambooInsufficient(plan.pieces, sumLots(sellerUser.bamboos), ERR_BAMBOO_EXPIRED);
    lot.qty = qty - s.qty;
    left -= s.qty;
  }
  if (left > 0) throw bambooInsufficient(plan.pieces, sumLots(sellerUser.bamboos), ERR_BAMBOO_EXPIRED);
  sellerUser.bamboos = (sellerUser.bamboos || []).filter((l) => toNonNegInt(l.qty) > 0);
  let seed_lot = null;
  if (plan.seller_got > 0) seed_lot = addLot(sellerUser, 'seed', plan.seller_got, { source: 'market', now });
  recordTx(
    sellerUser,
    {
      type: 'market_sell',
      delta: { seeds: plan.seller_got, bamboos: -plan.pieces },
      fee_seeds: plan.fee_seeds,
      ref: { listing_id: listing.id, trade_id },
      desc: `市集卖出竹简 ${plan.pieces} 片（${plan.pieces / PIECES_PER_BUNDLE} 束），手续费 ${plan.fee_seeds} 颗销毁`,
    },
    now,
  );
  return { seed_lot_id: seed_lot ? seed_lot.id : null, seed_expires_at: seed_lot ? seed_lot.expires_at : null };
}

// ---- §7 官方购买：纯函数记账 ----

/**
 * 官方购买记账（在 `withAssets` mutator 内调用）：入账 `BambooLot{ qty: 100×bundles, expires_at: now+365d,
 * source:'official_purchase' }` + 写 `Tx{ type:'official_buy' }`。
 * ¥ 扣款走 `wallet.js`（**不在本函数**，跨集合顺序写由 `officialPurchase` 编排）。
 */
export function applyOfficialPurchase(user, { bundles, now = new Date() } = {}) {
  const n = Math.max(1, Math.floor(Number(bundles) || 1));
  const pieces = n * PIECES_PER_BUNDLE;
  const lot = addLot(user, 'bamboo', pieces, { ttl_days: OFFICIAL_BAMBOO_TTL_DAYS, source: 'official_purchase', now });
  recordTx(
    user,
    {
      type: 'official_buy',
      delta: { bamboos: pieces },
      ref: {},
      desc: `官方竹简购买 ${n} 束（${pieces} 片）`,
    },
    now,
  );
  return { lot, pieces, bundles: n };
}

// ---- 出参组装（§6-1 / §6-2） ----

/** 挂单出参（含 `expires_at` 与剩余时限 `days_left`＝向上取整到天，`open` 挂单恒落在 1..7） */
export function listingPayload(listing, now = new Date()) {
  const expMs = listing?.expires_at ? Date.parse(listing.expires_at) : NaN;
  const days_left = Number.isFinite(expMs) ? Math.max(0, Math.ceil((expMs - toMs(now)) / DAY_MS)) : 0;
  return { ...listing, days_left };
}

/** 官方发售出参（`release_at` 为「21:00」；`released` = 今日库存已释放） */
export function officialPayload(official, release, now = new Date()) {
  const o = official || {};
  const rel = release || releaseOfficial({ stock: {}, daily_stock: o.daily_stock, last_release_date: '' }, now);
  return {
    price_fen: Math.floor(Number(o.price_fen) || DEFAULT_PRICE_FEN),
    daily_stock: toNonNegInt(o.daily_stock),
    stock_left_today: rel.stock_left_today,
    release_at: RELEASE_AT,
    released: rel.released_today,
  };
}

/** `Listing` 模型断言（K7：**不得有任何家族树字段**；单测复用） */
export function hasTreeField(listing) {
  return Object.keys(listing || {}).some((k) => /tree|anchor/i.test(k));
}

// ---- IO 层：全局串行队列 + 每档 CAS（模式照 economy-ledger.js 的 assetsLocks / store.mutateDoc） ----
//
// 存储形态 v2（见文件头）：挂单 = 每挂单一档（`_id = listing.id`）；成交 = 每成交一档（`_id = trade.id`）；
// 官方配置 = 单档 `_id='official'`。写入一律走 `store.mutateDoc` 的 CAS；列表 / 查询一律 `store.listAll` 枚举。

const marketLocks = new Map();
/** 全局市集锁键（不再依赖单文档 `_id`；同一进程内所有市集读改写串行） */
const MARKET_LOCK_KEY = 'market';

/** 剥离存储元字段（`_id` / `version`）→ 返回业务记录本身（对外形状与旧 `global` 内记录一字不差） */
function stripMeta(doc) {
  const r = { ...doc };
  delete r._id;
  delete r.version;
  return r;
}

/** 该档是否为挂单档（`_id` 前缀 `lst_`） */
const isListingDoc = (d) => !!d && typeof d._id === 'string' && d._id.startsWith(LISTING_PREFIX);
/** 该档是否为成交档（`_id` 前缀 `trd_`） */
const isTradeDoc = (d) => !!d && typeof d._id === 'string' && d._id.startsWith(TRADE_PREFIX);

/**
 * 枚举全部挂单记录（分页拉齐；`_id = listing.id`）。返回业务记录（已剥离元字段）。
 * **过滤 / 排序与改造前逐字一致**（改造前 = 单数组顺序；此处枚举序 = local 落盘键序 / 云端 `_id` 升序）。
 */
async function loadListings() {
  return (await listAll(MARKET_COL)).filter(isListingDoc).map(stripMeta);
}

/** 读 + 收口官方配置档（`_id='official'`；不存在 → 默认档） */
async function loadOfficial() {
  const doc = await colGet(MARKET_COL, OFFICIAL_ID);
  return ensureOfficial(doc ? stripMeta(doc) : {});
}

/** 市集读模型（聚合视图：listings + trades + official；一次枚举） */
async function loadMarketSnapshot() {
  const listings = [];
  const trades = [];
  let official = null;
  for (const d of await listAll(MARKET_COL)) {
    if (!d || typeof d._id !== 'string') continue;
    if (d._id === OFFICIAL_ID) official = stripMeta(d);
    else if (isListingDoc(d)) listings.push(stripMeta(d));
    else if (isTradeDoc(d)) trades.push(stripMeta(d));
  }
  return { listings, trades, official: ensureOfficial(official || {}) };
}

/** 挂单档读取（404 语义）：`_id` 必须确为挂单档（前缀 `lst_`），否则视为不存在 */
async function getListingOr404(listingIdValue) {
  const doc = await colGet(MARKET_COL, listingIdValue);
  if (!isListingDoc(doc)) throw httpError(404, ERR_LISTING_NOT_FOUND);
  return stripMeta(doc);
}

/** 挂单状态守卫（成交 / 撤单**仅对 `open` 有效**；`expired` → 409「挂单已过期」） */
function assertOpen(l) {
  if (l.status === 'expired') throw httpError(409, ERR_LISTING_EXPIRED);
  if (l.status !== 'open') throw httpError(409, ERR_LISTING_CLOSED);
}

/** 挂单到期下架留痕（best-effort：写卖方 `Tx{type:'expire'}`；失败不影响挂单 sweep 结果） */
async function recordListingExpiryTx(expired, now) {
  for (const l of expired) {
    try {
      await withAssets(
        l.seller_phone,
        (user) => {
          sweep(user, now);
          recordTx(
            user,
            {
              type: 'expire',
              delta: {},
              ref: { listing_id: l.id },
              desc: `挂单到期下架 ${l.id}（释放锁定 ${l.pieces} 片）`,
            },
            now,
          );
        },
      );
    } catch {
      /* best-effort：留痕失败不回滚挂单 sweep（下一次入口重新判定） */
    }
  }
}

/**
 * 挂单到期下架（IO 版：逐档 CAS 条件写 —— **仅当仍为 `open` 才置 `expired`**）。
 * 保留原行（不物理删）、不改 `sold_at` / `buyer_phone`；`expires_at` 缺失 / 非法视为不过期（不误杀脏数据）。
 * @returns {Promise<object[]>} 本次被置为 `expired` 的挂单（业务记录）
 */
async function sweepExpiredListings(now = new Date()) {
  const nowMs = toMs(now);
  const expired = [];
  for (const l of await loadListings()) {
    if (!l || l.status !== 'open') continue;
    const expMs = l.expires_at ? Date.parse(l.expires_at) : NaN;
    if (!Number.isFinite(expMs) || expMs > nowMs) continue;
    try {
      const written = await mutateDoc(MARKET_COL, l.id, (doc) => {
        if (doc.status === 'open') doc.status = 'expired'; // 临界区：仍 open 才下架
        return doc;
      });
      const rec = stripMeta(written);
      if (rec.status === 'expired') expired.push(rec);
    } catch {
      /* 冲突耗尽：本次不下架，下一次市集入口重判（不阻塞业务） */
    }
  }
  return expired;
}

/** 官方库存惰性释放（IO 版：释放有变化 → 写回单档 `_id='official'`） */
async function settleOfficial(now = new Date()) {
  const official = await loadOfficial();
  const release = releaseOfficial(official, now);
  if (release.released) {
    const written = await mutateDoc(MARKET_COL, OFFICIAL_ID, () => official);
    return { official: ensureOfficial(stripMeta(written)), release };
  }
  return { official, release };
}

/**
 * 市集读改写入口（唯一 IO 入口：全局串行 + 入口惰性结算）。
 *
 * - 入口惰性结算（先于业务逻辑）：挂单到期下架（逐档 CAS）+ 官方库存释放（21:00 后，单档）；
 *   结算与业务结果无关，**即便 mutator 抛错也已单独落库**（§5-4 / §6-1 / §7-2），
 *   否则过期挂单会一直挂在 `open` 上直到下一次成功调用。
 * - 全局串行化（`marketLocks`）：并发调用按到达顺序排队 → 同一挂单并发购买只有一个成功（§5-2 / §5-7-3）。
 * - 锁顺序：本函数持 market 锁期间可再取 `assets(phone)` 锁；**反向顺序不存在**。
 * - mutator 收到 `ctx = { now, expired, release, official }`；业务写入由 mutator 自行走 `mutateDoc` /
 *   `withAssets`（每档一文档、CAS 条件写；不再提供「整体回写」）。
 * @param {(ctx:{now:Date, expired:object[], release:object, official:object}) => any} mutator
 */
export async function withMarket(mutator, now = new Date()) {
  const lock = marketLocks.get(MARKET_LOCK_KEY) || Promise.resolve();
  const run = lock.then(async () => {
    const expired = await sweepExpiredListings(now);
    const { official, release } = await settleOfficial(now);
    if (expired.length > 0) await recordListingExpiryTx(expired, now);
    return mutator({ now, expired, release, official });
  });
  marketLocks.set(MARKET_LOCK_KEY, run.catch(() => {}));
  return run;
}

/** 只读快照（挂单 sweep / 官方释放的变化会写回；无业务副作用） */
export async function readMarket(now = new Date()) {
  return withMarket(async (ctx) => {
    const snap = await loadMarketSnapshot();
    return { ...snap, official: ctx.official };
  }, now);
}

// ---- §6-1 `GET /market/listings`（guest 可读） ----

/**
 * 市集首页数据（**guest 可读**）：先挂单 sweep + 官方库存惰性释放（`withMarket` 入口）→ 按 `status` 过滤
 * （默认 `open`，**`expired` 默认不展示**，显式传才返回）。
 */
export async function marketListings(status, now = new Date()) {
  let filter = 'open';
  if (status !== undefined && status !== null && String(status).trim() !== '') {
    filter = String(status).trim();
    if (!LISTING_STATUSES.includes(filter)) throw httpError(400, ERR_STATUS_INVALID);
  }
  return withMarket(async (ctx) => {
    // 官方库存惰性释放已在 withMarket 入口完成（§7-2：访问市集入口即判定）
    const { listings } = await loadMarketSnapshot();
    const rows = listings.filter((l) => l && l.status === filter).map((l) => listingPayload(l, now));
    return { listings: rows, official: officialPayload(ctx.official, ctx.release, now) };
  }, now);
}

// ---- §6-1 `GET /market/my`（需登录） ----

/** 我的挂单（默认不展示 `expired`）+ 我的资产概览（籽可用 / 竹片可用 / 锁定 / 批次到期） */
export async function myMarket(phone, status, now = new Date()) {
  let filter = null;
  if (status !== undefined && status !== null && String(status).trim() !== '') {
    filter = String(status).trim();
    if (!LISTING_STATUSES.includes(filter)) throw httpError(400, ERR_STATUS_INVALID);
  }
  return withMarket(async (ctx) => {
    const { listings } = await loadMarketSnapshot();
    const rows = listings
      .filter((l) => l && l.seller_phone === phone && (filter ? l.status === filter : l.status !== 'expired'))
      .map((l) => listingPayload(l, now));
    const locked = lockedPieces(phone, listings);
    const assets = await withAssets(phone, (user) => {
      sweep(user, now);
      const total = sumLots(user.bamboos);
      return {
        seeds_available: sumLots(user.seeds),
        bamboo_total_pieces: total,
        bamboo_locked_pieces: locked,
        bamboo_available_pieces: Math.max(0, total - locked),
        bamboo_available_bundles: Math.floor(Math.max(0, total - locked) / PIECES_PER_BUNDLE),
        lots: (user.bamboos || []).map((l) => ({ ...l })),
      };
    });
    return { listings: rows, assets };
  }, now);
}

// ---- §3 行 1：挂单 ----

/**
 * 挂单（§3 行 1）：仅**整束**（`pieces = bundles × 100`）可上架；标价自由（**平台不设最低/最高价**）；
 * 与**家族树无关**（不传、不派生、不校验）；锁定为派生占量（不写 `BambooLot` 字段）。
 * 状态：`status='open'`、`expires_at = now + LISTING_TTL_DAYS 天`（K9）；写 `Tx{type:'market_list'}`。
 * 存储：新挂单 = **独立一档**（`_id = listing.id`，CAS 写入）。
 * @returns {Promise<{ok:true, listing_id:string, bundles:number, pieces:number, price_seeds:number,
 *   expires_at:string, days_left:number, fee_seeds:number}>}
 */
export async function listBamboo(phone, input = {}, now = new Date()) {
  const { bundles, price_seeds, pieces } = validateListingInput(input);
  return withMarket(async (ctx) => {
    // 资产侧读（含 sweep）：可用量 = 未过期片数 − 本方 open 挂单占量（挂单 sweep 已在 withMarket 内完成）
    const snap = await withAssets(phone, (user) => {
      sweep(user, now);
      return { bamboos: (user.bamboos || []).map((l) => ({ ...l })) };
    });
    const { listings } = await loadMarketSnapshot();
    const sellable = sellablePieces(phone, snap, listings);
    if (pieces > sellable) {
      // F2：文案（与 `current`）报**真实可用片数**（未按整束取整）——
      // 持 80 片时不得提示「当前可用 0 片」；「整束挂单」的口径说明保留。
      const available = availablePieces(phone, snap, listings);
      throw bambooInsufficient(
        pieces,
        available,
        `可用竹片不足：本次挂单需 ${pieces} 片，当前可用 ${available} 片（整束挂单，无可拼束）`,
      );
    }
    const listing = {
      id: listingId(),
      seller_phone: phone,
      bundles,
      pieces,
      price_seeds,
      status: 'open',
      created_at: isoOf(now),
      expires_at: isoOf(new Date(toMs(now) + LISTING_TTL_DAYS * DAY_MS)),
    };
    // 照改造前次序：先写 `market_list` 留痕、再落挂单档（Tx 先于挂单可见）
    await withAssets(phone, (user) => {
      sweep(user, now);
      recordTx(
        user,
        {
          type: 'market_list',
          delta: {},
          ref: { listing_id: listing.id },
          desc: `市集挂单 ${bundles} 束（${pieces} 片），标价 ${price_seeds} 颗石榴籽，${LISTING_TTL_DAYS} 天未成交自动下架`,
        },
        now,
      );
    });
    await mutateDoc(MARKET_COL, listing.id, () => ({ ...listing }));
    return {
      ok: true,
      listing_id: listing.id,
      bundles,
      pieces,
      price_seeds,
      fee_seeds: feeOf(price_seeds),
      created_at: listing.created_at,
      expires_at: listing.expires_at,
      days_left: LISTING_TTL_DAYS,
    };
  }, now);
}

/** 挂单束数 / 标价校验（先于任何读取；供路由层复用） */
export function validateListingInput(input = {}) {
  const bundles = Number(input.bundles);
  if (!Number.isInteger(bundles) || bundles < 1) throw httpError(400, ERR_BUNDLES_INVALID);
  const price_seeds = Number(input.price_seeds);
  if (!Number.isInteger(price_seeds) || price_seeds < 1) throw httpError(400, ERR_PRICE_INVALID);
  return { bundles, price_seeds, pieces: bundles * PIECES_PER_BUNDLE };
}

// ---- §3 行 2：撤单 ----

/** 撤单（§3 行 2）：**仅 `open` 可撤**；本人挂单（403）；`expired` → 409「挂单已过期」；写 `Tx{type:'market_cancel'}` */
export async function cancelListing(phone, listingIdValue, now = new Date()) {
  if (!listingIdValue) throw httpError(400, ERR_LISTING_ID_MISSING);
  return withMarket(async (ctx) => {
    // 404 / 403 前置（只读）；状态转移在 CAS 临界区内二次校验（并发只有一单成功）
    const existing = await getListingOr404(listingIdValue);
    if (existing.seller_phone !== phone) throw httpError(403, ERR_NOT_OWNER);
    const written = await mutateDoc(MARKET_COL, listingIdValue, (doc) => {
      if (doc.seller_phone !== phone) throw httpError(403, ERR_NOT_OWNER);
      assertOpen(doc);
      doc.status = 'cancelled';
      doc.cancelled_at = isoOf(now);
      return doc;
    });
    const rec = stripMeta(written);
    await withAssets(phone, (user) => {
      sweep(user, now);
      recordTx(user, { type: 'market_cancel', delta: {}, ref: { listing_id: rec.id }, desc: `撤销市集挂单 ${rec.id}（释放锁定 ${rec.pieces} 片）` }, now);
    });
    return { ok: true, listing_id: rec.id, status: 'cancelled' };
  }, now);
}

// ---- §3 行 3：成交（全量，不支持部分成交 / 议价） ----

/**
 * 成交（§3 行 3）：**一次性全量成交**；买方实付 = 标价、卖方实收 = 标价 − `fee_seeds`（销毁）；
 * 竹片按整束从卖方**最早到期批次**起取用，买方接收批次 `expires_at` **继承卖方原值（不重置、不续命）**；
 * 卖方所得籽 = 新批次（365 天、`source='market'`）。
 * 守卫：登录 / 404 / 409 已成交或已撤 / 409 已过期 / **400 自买自卖（K8）** / 409 籽不足 / 409 竹片不足。
 * 并发：以挂单档 `status='open'` 的 **CAS 条件写（open→sold）为临界区** → 同一挂单只有一个成功，其余 409；
 * 资产写入若失败 → 释放认领（sold→open）并回滚已写的买方扣款，挂单与资产回到改造前「整单拒绝」的状态。
 */
export async function buyListing(phone, listingIdValue, now = new Date()) {
  if (!listingIdValue) throw httpError(400, ERR_LISTING_ID_MISSING);
  return withMarket(async (ctx) => {
    const l = await getListingOr404(listingIdValue);
    if (l.seller_phone === phone) throw httpError(400, ERR_SELF_TRADE);
    assertOpen(l);
    const trade_id = tradeId();

    // ① 认领（CAS 临界区）：open → sold；并发重放后 assertOpen 抛 409「挂单已成交或已撤单」
    await mutateDoc(MARKET_COL, listingIdValue, (doc) => {
      if (doc.seller_phone === phone) throw httpError(400, ERR_SELF_TRADE);
      assertOpen(doc);
      doc.status = 'sold';
      doc.sold_at = isoOf(now);
      doc.buyer_phone = phone;
      return doc;
    });
    // 认领释放（资产写入失败 → 整单拒绝：sold → open，清 sold_at / buyer_phone）
    const releaseClaim = async () => {
      try {
        await mutateDoc(MARKET_COL, listingIdValue, (doc) => {
          if (doc.status === 'sold' && doc.buyer_phone === phone) {
            doc.status = 'open';
            delete doc.sold_at;
            delete doc.buyer_phone;
          }
          return doc;
        });
      } catch {
        /* best-effort 释放：耗尽后挂单仍 sold（极端并发下以 CAS 赢家为准） */
      }
    };

    // ② 双方资产快照（含 sweep）+ 计划（全部校验前置；此处不写任何东西）
    const sellerSnapshot = await withAssets(l.seller_phone, (user) => {
      sweep(user, now);
      return JSON.parse(JSON.stringify(user));
    });
    const buyerSnapshot = await withAssets(phone, (user) => {
      sweep(user, now);
      return JSON.parse(JSON.stringify(user));
    });
    let plan;
    try {
      const { listings } = await loadMarketSnapshot();
      plan = planTrade({
        listing: { ...l, seller_phone: l.seller_phone },
        sellerUser: sellerSnapshot,
        buyerUser: buyerSnapshot,
        listings: listings.filter((x) => x.id !== l.id), // 本挂单自身占量不参与可用量
        now,
      });
    } catch (e) {
      await releaseClaim();
      throw e;
    }
    // ③ 买方扣籽 + 接收竹片（失败 → 一字节不写；释放认领）
    try {
      await withAssets(phone, (user) => {
        sweep(user, now);
        applyBuyerSide(user, plan, trade_id, now, l);
      });
    } catch (e) {
      await releaseClaim();
      throw e;
    }
    // ④ 卖方交竹片 + 入账籽（扣手续费后）；失败 → 用快照回滚买方 + 释放认领
    try {
      await withAssets(l.seller_phone, (user) => {
        sweep(user, now);
        applySellerSide(user, plan, trade_id, now, l);
      });
    } catch (e) {
      await withAssets(phone, (user) => Object.assign(user, buyerSnapshot)).catch(() => {});
      await releaseClaim();
      throw e;
    }
    // ⑤ 追加成交档（每成交一档；`_id = trade.id`）
    const trade = {
      id: trade_id,
      listing_id: l.id,
      buyer_phone: phone,
      seller_phone: l.seller_phone,
      pieces: plan.pieces,
      price_seeds: plan.price_seeds,
      fee_seeds: plan.fee_seeds,
      ts: isoOf(now),
    };
    await mutateDoc(MARKET_COL, trade_id, () => ({ ...trade }));
    return {
      ok: true,
      trade_id,
      listing_id: l.id,
      pieces: plan.pieces,
      bundles: plan.pieces / PIECES_PER_BUNDLE,
      price_seeds: plan.price_seeds,
      fee_seeds: plan.fee_seeds,
      fee_waived: plan.waived,
      seller_got: plan.seller_got,
      destroyed: plan.destroyed,
      buyer_receive: plan.receive,
      status: 'sold',
    };
  }, now);
}

// ---- §3 行 4：官方购买（¥ → 竹片） ----

/**
 * 官方购买（§3 行 4 / §7-3）：惰性释放 → **21:00 时点**（未到 → 409「未到发售时间」）→ 当日库存
 * （不足 → 409「今日已售罄」）→ ¥ 余额（不足 → 409，引导充值）→ 入 `BambooLot{100×bundles, now+365d,
 * source='official_purchase'}` + `Tx{type:'official_buy'}` → ¥ 钱包扣 `price_fen × bundles` 分
 * （`jiazu_wallets.transactions` 一条 `official_bamboo` 流水）→ `official.stock[today] -= bundles`
 * （单档 CAS；重放后按最新档重新校验库存）。
 * 顺序写 + 校验前置：竹片写入失败则**不扣 ¥**（§3 官方购买行）；扣款作为最后一步，失败即回滚竹片。
 */
export async function officialPurchase(phone, input = {}, now = new Date()) {
  const raw = input.bundles === undefined || input.bundles === null || String(input.bundles).trim() === '' ? 1 : Number(input.bundles);
  if (!Number.isInteger(raw) || raw < 1) throw httpError(400, ERR_BUNDLES_INVALID);
  const bundles = raw;
  return withMarket(async (ctx) => {
    const o = ctx.official;
    const rel = ctx.release; // 入口惰性释放（§7-2，已在 withMarket 内完成并落库）
    if (!rel.is_open) throw httpError(409, ERR_NOT_OPEN_YET); // 21:00 前
    if (rel.stock_left_today < bundles) throw httpError(409, ERR_SOLD_OUT); // 当日库存不足（售罄即止）
    const amount_cents = o.price_fen * bundles;
    const balance = await wallet.getUserBalance(phone);
    if (balance < amount_cents) {
      throw httpError(
        409,
        `人民币余额不足：官方竹简需 ¥${(amount_cents / 100).toFixed(2)}，当前余额 ¥${(balance / 100).toFixed(2)}，请先充值`,
      );
    }
    const snapshot = await getAssets(phone);
    let granted = false;
    let lot = null;
    try {
      const r = await withAssets(phone, (user) => {
        sweep(user, now);
        return applyOfficialPurchase(user, { bundles, now });
      });
      granted = true;
      lot = r.lot;
      const balance_cents = await wallet.deductUserBalance(phone, amount_cents, {
        type: WALLET_TX_TYPE,
        desc: `官方竹简 ${bundles} 束（${r.pieces} 片）¥${(amount_cents / 100).toFixed(2)}`,
      });
      // 官方库存递减（单档 CAS；冲突重放后按最新档重新校验库存，绝不超卖）
      const updated = await mutateDoc(MARKET_COL, OFFICIAL_ID, (doc) => {
        const rec = ensureOfficial(stripMeta(doc));
        const left = toNonNegInt(rec.stock ? rec.stock[rel.today] : 0);
        if (left < bundles) throw httpError(409, ERR_SOLD_OUT);
        rec.stock[rel.today] = left - bundles;
        return rec;
      });
      const o2 = ensureOfficial(stripMeta(updated));
      return {
        ok: true,
        bundles,
        pieces: r.pieces,
        price_fen: o.price_fen,
        amount_cents,
        balance_cents,
        stock_left_today: toNonNegInt(o2.stock[rel.today]),
        lot_id: lot.id,
        expires_at: lot.expires_at,
        released: rel.released,
      };
    } catch (e) {
      if (granted) {
        // 回滚竹片（竹片写入失败则不扣 ¥｜扣款失败则退还竹片）
        await withAssets(phone, (user) => Object.assign(user, JSON.parse(JSON.stringify(snapshot)))).catch(() => {});
      }
      throw e;
    }
  }, now);
}

// ---- §8 `PUT /admin/market/official-stock`（仅 chief_editor） ----

/** 动态库存配置（§6-2）：`{ daily_stock, price_fen? }` → 写 `official.daily_stock`（`price_fen` 缺省不动） */
export async function setOfficialStock(dailyStock, priceFen, now = new Date()) {
  const stock = Number(dailyStock);
  if (!Number.isInteger(stock) || stock < 0) throw httpError(400, ERR_DAILY_STOCK_INVALID);
  const hasPrice = !(priceFen === undefined || priceFen === null || String(priceFen).trim() === '');
  const price = hasPrice ? Number(priceFen) : null;
  if (hasPrice && (!Number.isInteger(price) || price < 1)) throw httpError(400, ERR_PRICE_FEN_INVALID);
  return withMarket(async () => {
    const written = await mutateDoc(MARKET_COL, OFFICIAL_ID, (doc) => {
      const o = ensureOfficial(stripMeta(doc));
      o.daily_stock = stock;
      if (hasPrice) o.price_fen = price;
      return o;
    });
    const o = ensureOfficial(stripMeta(written));
    return { ok: true, daily_stock: o.daily_stock, price_fen: o.price_fen };
  }, now);
}

// ---- §5-6 / §10-7 注销前置交叉（K10 · 供 P4 调用） ----

/**
 * 该账号是否存在 `status='open'` 的挂单（**注销前置校验入口**，K10）。
 * 调用前先做挂单 sweep（本函数内完成）→ 到期挂单已置 `expired`，**不阻碍注销**。
 * @returns {Promise<boolean>}
 */
export async function hasOpenListing(phone, now = new Date()) {
  return withMarket(async () => {
    const { listings } = await loadMarketSnapshot();
    return listings.some((l) => l && l.status === 'open' && l.seller_phone === phone);
  }, now);
}

/** 注销前置守卫（供 P4 路由直接调用）：存在 `open` 挂单 → 409「请先撤销未成交挂单」 */
export async function openListingGuard(phone, now = new Date()) {
  if (await hasOpenListing(phone, now)) throw httpError(409, ERR_OPEN_LISTING_BLOCK_LOGOUT);
  return { ok: true };
}

/** 资产总览转发（账本内核；方便路由单点引入市集模块，不另写一套） */
export { sumLots };
