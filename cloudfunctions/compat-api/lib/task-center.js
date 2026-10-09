/**
 * 任务中心域（批3 · 后端）—— 三条每日任务 + 手动领取（T-4）+ 奖励池接线 + 三态可见（T-3）。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 分工（单写者：本单；**不自造第二套账本 / 不新增 Tx.type 枚举**）：
 *   · 资产读写**唯一**走 `lib/economy-ledger.js` 的 `withAssets` / `getAssets`；
 *     本模块**不出现资产集合名字面**（`jiapu_assets` 只在 ledger 内）；
 *   · **奖励池分发唯一入口 = `lib/friend-ops.js` 的 `distributeFriendRewards`**
 *     （本人基础 + 池均分、向下取整余数销毁、分母 0 不建池、触发者不入池、收件人不再触发 —— 全部由它实现，
 *     本模块**不另写一套**，只按 R-5 给出 `amounts`）；
 *   · 当日邀请计数**唯一口径 = `lib/invite.js` 的 `countInviteRewardsToday`**
 *     （`Tx.type === 'reward'` 且 `ref.kind === 'invite'` 且流水日在当日）；
 *   · 日切**唯一口径 = `lib/economy-ledger.js` 的 `beijingDate`**（北京时间 UTC+8 自然日 `YYYY-MM-DD`），
 *     与既有 `signin_date` / 邀请计数完全同口径。**不注册定时任务、不依赖零点整**（源码无任何定时器）。
 *
 * 三条每日任务（**枚举名逐字**，即 `/tasks/claim` 入参 `task` 的取值）：
 *   `signin` —— 每日签到
 *   `invite` —— 邀请新用户注册
 *   `write`  —— 平台写操作
 *
 * 达标判定（逐条，全部为**纯函数**，只读传入的 `user` 记录）：
 *   `signin`：`user.signin_date === beijingDate(now)`（**当日已签到**）。
 *   `invite`：`countInviteRewardsToday(user, now) > 0`（**当日有成功邀请** = 当日发过邀请奖励流水）。
 *   `write` ：当日有一条**成功写**流水 —— `Tx.type ∈ WRITE_TX_TYPES`（`edit_fee` / `delete_fee` /
 *             `move_fee` / `tree_create`）且 `beijingDate(tx.ts) === 当日`。
 *             口径依据（noop-edit-integrity）：**失败 / 被拒 / no-op 写均不产生流水**
 *             （no-op 保存 ⇒ 0 片 + 无流水；资产不足 409 ⇒ 一字节不写）⇒ 以「当日成功计费写流水」为
 *             唯一可观测判据，天然不把失败与 no-op 计入。
 *
 * 每日重置：**北京自然日日期串比对**（`beijingDate`），无定时任务、无零点依赖。
 *
 * 手动领取（T-4）：**只有调 `claimTask`（`POST /tasks/claim`）才发奖**；达标本身不发任何资产。
 *   奖励池快照 = **领取时刻**的生效中好友数（由 `distributeFriendRewards` 在领取时点读取）。
 *
 * 奖励口径（R-5，`DAILY_TASK_REWARD` 逐字）：
 *   本人基础 = 石榴籽碎片 1 + 竹片 1（`base`）；池 = 石榴籽碎片 1 + 兰帖残页 1（`pool`）——
 *   池按生效中好友数均分、**向下取整、余数销毁**；分母 0 ⇒ 不建池零流水；触发者本人**不入池**；
 *   好友所得**不再触发**分发（以上四条均由 `distributeFriendRewards` 实现）。
 *
 * 幂等（Zang 裁定）：
 *   ① 同一自然日 **(用户, 任务)** 只可领一次；
 *   ② ⚠️ **签到任务与既有签到卡（`POST /assets/signin`）共用同一 `signin_date` 判定** ——
 *      签到任务的「已领取」标记**就是** `signin_date`（**不为 signin 另建标记**，避免第二套真源）；
 *      任何一方先领，另一方即视为已领，**绝不双发**；既有签到卡已改为**调用本模块同一入口**
 *      （`claimTask(phone, 'signin', now)`，见 index.js），**不再有第二套数值**；
 *   ③ `invite` / `write` 的领取标记 = 资产记录内的 `task_claims[任务名] = 当日日期串`
 *      （既有资产文档内新增的一个**取值映射字段**，不新增集合、不新增 Tx.type）。
 *      该字段仅在本模块内读；ledger 的 `summarize()` / `blankUser()` 不投影它 ⇒ 既有读接口出参一字不变。
 *
 * 三态可见（T-3）：`not_achieved`（未达标）/ `claimable`（可领取）/ `claimed`（已领取），
 *   每条任务同时给出 `state`（英文枚举）+ `state_text`（中文）+ `achieved`（达标判定原始读数）
 *   + `blocked_reason`（未达标 / 不可领时的**中文文案**，绝不静默失败）。
 *
 * ⚠️ **签到的「未达标」态说明（如实登记，见 REPORT）**：既有签到卡的口径是「签到即领奖」，
 *   而本单硬要求签到任务与签到卡共用 `signin_date` 判定 ⇒ 对 `signin` 而言
 *   「达标（已签到）」与「已领取」是**同一事件的两个名字**：调用签到卡或 `/tasks/claim {task:'signin'}`
 *   都是「完成签到 + 领奖」。因此 `signin` 的可见态只有 `claimable`（当日未签到）/ `claimed`（当日已签到），
 *   `not_achieved` 对签到**不可达**（签到不需要任何外部事件，当事人自己即可完成）。
 *   `invite` / `write` 两条任务三态齐备（未达标 = 当日尚无成功邀请 / 尚无成功写）。
 *
 * 领取执行序列（**现口径**）—— ⓪ **只读预检**（`getAssets` 快照 + 门禁判定）⇒ 未达标 / 已领取立刻结构化拒绝、零写入；
 *   ① **池分发**（唯一入口 = `friend-ops.distributeFriendRewards`，`base: null`）带**幂等键 `手机号:自然日:任务`**
 *      （`idempotency_key`，逐字形状见 `claimTask` 内的拼装）⇒ 中途失败重试时**收件人按账本自证判重跳过入账**
 *      （不重复发、不重复写流水）；
 *   ② **「打标 + 基础奖励入账」= 同一次 `withAssets` 事务**（锁内入口 `friend-ops.grantRewardBase`）
 *      **原子提交 / 原子回滚** ⇒ 不存在「基础已入账但未打标」，重试也绝不会二次入账基础奖励。
 * 为何**不**把池写入塞进触发者事务（死锁理由）：池写的是**他人**资产（各自 `withAssets`），
 *   塞进触发者的锁内会造成 **A↔B 互锁死锁**（互相等对方的锁）⇒ 池分发必须在触发者事务之外，重复性只由幂等键兜底。
 * 历史（**已废弃**）：旧实现「先打标 → 发奖 → 失败撤标重试」在「基础已入账、池分发中途失败」窗口内重试会**重复入账一次**基础奖励（碎片 1 + 竹片 1）⇒ **已废弃**（`rollbackClaim` 已随删除）。
 *
 * 数据安全：单测把 `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 /tmp 副本（照 assets.test.js / friends.test.js）。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * **签到域扩展（Zang 裁定 v1 · Kevin 2026-09-28 拍定；本单新增，数值逐字）**：
 *   · 存储：既有 `jiapu_assets` 用户记录内新增 `signin_streak`（连签天数，默认 0）＋
 *     `signin_days`（`YYYY-MM-DD` 升序去重、只留最近 30 天已签（含补签）日期）；`signin_date` **一字不改**；
 *   · 连签：周期 `7`（**写死不配**）；`signin_date === 昨天` ⇒ `streak + 1`，同日重复 ⇒ 409，其余 ⇒ `1`；
 *     `cycle_day = ((streak - 1) % 7) + 1`，第 7 天额外发 `signin_day7_fragments`（默认 10）碎片；
 *   · 每日随机追加 1 件：池 = `signin_pool`（默认 碎片×1 w50 / 竹片×10 w35 / 兰帖残页×1 w15），
 *     与基础 + 第 7 天**同一次 `withAssets` 事务 / 同一次 `grantRewardBase`**，写既有枚举 `reward`；
 *     随机源可注入（`claimTask(phone, task, now, { random })`，缺省 `Math.random`）；
 *   · 补签：`signinMakeup(phone, date, now)`（路由 `POST /assets/signin/makeup { date }`）——
 *     今天往前 1–7 天且未签方可补；成本 `signin_makeup_cost_bamboos`（默认 2 片竹片）走既有 FIFO 批扣
 *     （不足 ⇒ 409 `ASSET_INSUFFICIENT`，整单拒绝）；**不补发任何道具**，只补日期集 + 重算连签；
 *   · 后台可配三键落在 `jiapu_wallets.config`（先例 = `getBranchFeeSeeds`；写入口 = 既有
 *     `PUT /admin/wallet-fee`，**不新增设置路由**）：`signin_pool` / `signin_makeup_cost_bamboos` /
 *     `signin_day7_fragments`；
 *   · 出参扩展（**只增不删**）：`/assets/signin` ＋ `streak` / `cycle_day` / `items` / `calendar`；
 *     `GET /assets/summary` ＋ `signin_streak`（ledger `summarize`）/ `signin_calendar`（路由侧拼装）。
 *   · 一并守住的既有口径：籽域「10 片 = 1 颗自动合成」**未动**（`addFragments` 原样复用）。
 */

import {
  ASSET_INSUFFICIENT,
  SOURCE_FRIEND_REWARD,
  addLot,
  beijingDate,
  chargeLots,
  getAssets,
  normalizeSigninDays,
  recordTx,
  sumLots,
  toNonNegInt,
  withAssets,
} from './economy-ledger.js';
import { countInviteRewardsToday } from './invite.js';
import {
  distributeFriendRewards,
  // Zang 裁定（发放必须幂等）：**基础奖励的锁内入账入口** —— 在调用方自己的 `withAssets`
  // 事务内调用（本模块把「打标 + 基础奖励入账」放进**同一次**事务 ⇒ 不会重复入账）。
  grantRewardBase,
  maskPhone,
} from './friend-ops.js';
// 签到域后台可配键（唯一载体 = `jiapu_wallets.config`，与 `getBranchFeeSeeds` 同一先例；
// 写入口 = 既有治理路由 `PUT /admin/wallet-fee`，本模块**只读**）。
import {
  DEFAULT_SIGNIN_DAY7_FRAGMENTS,
  DEFAULT_SIGNIN_MAKEUP_COST_BAMBOOS,
  DEFAULT_SIGNIN_POOL,
  getSigninDay7Fragments,
  getSigninMakeupCostBamboos,
  getSigninPool,
} from './wallet.js';

const norm = (v) => String(v ?? '').trim();
const asDate = (d) => (d instanceof Date ? d : new Date(d));
const DAY_MS = 86400000;

// ==================== 任务定义（枚举名逐字冻结） ====================

/** 三条每日任务的**枚举名**（`/tasks/claim` 的 `task` 取值，逐字） */
export const TASK_IDS = {
  /** 每日签到（与签到卡共用 `signin_date` 判定） */
  SIGNIN: 'signin',
  /** 邀请新用户注册（口径 = 当日邀请奖励流水） */
  INVITE: 'invite',
  /** 平台写操作（口径 = 当日成功计费写流水） */
  WRITE: 'write',
};

/** 三态枚举（T-3） */
export const TASK_STATE = {
  NOT_ACHIEVED: 'not_achieved',
  CLAIMABLE: 'claimable',
  CLAIMED: 'claimed',
};

/** 三态中文文案（逐字；**不得静默失败**：未达标 / 不可领一律给出 `blocked_reason`） */
export const TASK_STATE_TEXT = {
  not_achieved: '未达标',
  claimable: '可领取',
  claimed: '已领取',
};

/** `invite` / `write` 的领取标记字段（资产记录内；`signin` 不写此字段，共用 `signin_date`） */
export const CLAIMS_FIELD = 'task_claims';

/**
 * 「平台写操作」的成功判据 = 当日存在这些类型之一的**成功计费写流水**：
 * `edit_fee`（人物 / 家族编辑、同胞排行重排）、`delete_fee`（删节点）、`move_fee`（跨树移动）、
 * `tree_create`（建树 / 立支）。均为**既有** Tx.type 枚举（白名单 `TX_TYPES` 内），本单不新增。
 * 未纳入：市集挂单 / 撤单 / 交易（交易域，另单）；`spirit_charge`（时流子域）；官方发售（购买，非写操作）。
 */
export const WRITE_TX_TYPES = ['edit_fee', 'delete_fee', 'move_fee', 'tree_create'];

/** R-5 每日任务奖励口径（**逐字**；`base` 照发本人、`pool` 按领取时刻生效好友数均分） */
export const DAILY_TASK_REWARD = {
  base: { seed_fragments: 1, bamboo_pieces: 1 },
  pool: { seed_fragments: 1, scroll_fragments: 1 },
};

/** 任务展示元数据（title 供前端 / 报告逐字引用） */
export const TASK_DEFS = [
  {
    id: TASK_IDS.SIGNIN,
    title: '每日签到',
    rule: '当日（北京时间自然日）已签到：`signin_date` = 当日日期串（与签到卡同一字段、同一判定）',
  },
  {
    id: TASK_IDS.INVITE,
    title: '邀请新用户注册',
    rule: "当日有一条成功邀请奖励流水（`Tx.type='reward'` 且 `ref.kind='invite'`，与 /invite 链路同一口径）",
  },
  {
    id: TASK_IDS.WRITE,
    title: '平台写操作',
    rule: "当日有一条成功写流水（`Tx.type ∈ edit_fee/delete_fee/move_fee/tree_create`；失败、被拒、no-op 均无流水 ⇒ 不计）",
  },
];

const TASK_BY_ID = new Map(TASK_DEFS.map((d) => [d.id, d]));

// ==================== 结构化错误（形状同 friends.js 的 friendError / index.js 的 httpError） ====================

export const TASK_ERRORS = {
  TASK_INVALID_PHONE: { status: 400, message: '手机号不合法' },
  TASK_UNKNOWN: { status: 400, message: '未知任务' },
  TASK_NOT_ACHIEVED: { status: 409, message: '今日任务尚未达标，请先完成后再领取' },
  TASK_ALREADY_CLAIMED: { status: 409, message: '今日该任务奖励已领取（同一自然日每项任务只能领一次）' },
  TASK_REWARD_FAILED: { status: 409, message: '任务奖励发放失败，本次领取已撤销，请稍后重试' },
  // ---- 签到补签（Zang 裁定 v1；两条 400 文案**逐字**，绝不静默失败）----
  SIGNIN_MAKEUP_OUT_OF_RANGE: { status: 400, message: '补签日期不在可补范围内' },
  SIGNIN_MAKEUP_ALREADY: { status: 400, message: '该日已签到，无需补签' },
  SIGNIN_MAKEUP_FAILED: { status: 409, message: '补签失败，本次未扣费，请稍后重试' },
};

/** 构造结构化错误（带 `status` / `code` / 中文 `message`；路由 `catch (e) { send(e.status, {ok:false,error:{...}}) }`） */
export function taskError(code, patch = {}) {
  const spec = TASK_ERRORS[code] || { status: 409, message: '任务中心操作失败' };
  const e = new Error(patch.message || spec.message);
  e.status = Number(patch.status) || spec.status;
  e.code = patch.code || code;
  if (patch.reason !== undefined) e.reason = patch.reason;
  if (patch.detail !== undefined) e.detail = patch.detail;
  return e;
}

// ==================== 签到域：连签 7 天 + 每日随机追加 + 补签（Zang 裁定 v1 · Kevin 2026-09-28 拍定）====================
//
// 口径逐条（本单硬口径，数值逐字）：
//   ① 存储（落在既有 `jiapu_assets` 用户记录内，**不新建集合**，收口见 ledger 的 blankUser / ensureUser）：
//      `signin_streak`（非负整数，当前连签天数，默认 0）＋ `signin_days`（`YYYY-MM-DD` 升序去重、
//      只保留最近 30 天已签（含补签）日期）；既有 `signin_date` 语义与写法**一字不改**。
//   ② 连签推进（周期 **写死 7**，不配）：领取日 = `day = beijingDate(now)`；
//      `signin_date === 昨天` ⇒ `streak = signin_streak + 1`；`signin_date === day` ⇒ 同日重复 409；
//      其余（隔天 / 隔多天 / 从未签）⇒ `streak = 1`（**漏签即归零**）。
//      `cycle_day = ((streak - 1) % 7) + 1`；`cycle_day === 7` ⇒ 额外发 `signin_day7_fragments`（默认 10）碎片。
//   ③ 每日随机追加 1 件：池 = `signin_pool`（默认 碎片 1 / w50、竹片 10 / w35、兰帖残页 1 / w15，加权抽 1），
//      与「基础 + 第 7 天」**同一次 `withAssets` 事务**入账，写**既有枚举** `reward` 流水（**不新增 Tx.type**）。
//      随机源可注入（`claimTask(phone, task, now, { random })`；缺省 `Math.random`，**绝不用 `Date.now()`**）。
//   ④ 补签（`POST /assets/signin/makeup { date }`）：可补 = 今天往前 1–7 天且未签；成本 =
//      `signin_makeup_cost_bamboos`（默认 2 片竹片），走既有 FIFO 批扣（不足 ⇒ 409 `ASSET_INSUFFICIENT`、
//      **整单拒绝不部分扣**）；效果 = 该日进 `signin_days` + 重算 `signin_streak`；**不补发任何道具**。

/** 连签周期（**写死 7，不配**；`cycle_day` 取值域 1..7） */
export const SIGNIN_CYCLE_DAYS = 7;
/** 补签可补范围：今天往前 1–7 天（未来 / 今天 / 超出 7 天一律拒绝） */
export const SIGNIN_MAKEUP_MAX_BACK_DAYS = 7;

/** 补签两条 400 文案（**逐字**；路由与出参共用同一字面，绝不各写一套） */
export const SIGNIN_MAKEUP_MESSAGES = {
  OUT_OF_RANGE: '补签日期不在可补范围内',
  ALREADY_SIGNED: '该日已签到，无需补签',
};

/**
 * 签到奖励的流水来源（`Tx.ref.source`）：复用既有字面 `friend_reward`
 * （签到的基础 / 随机 / 第 7 天奖励**全部**走 `friend-ops.grantRewardBase` ⇒ 与好友奖励同一入账实现、同一来源字面，
 * 不新增 Tx.type、不自造第二个奖励域）。
 */
export const SIGNIN_REWARD_SOURCE = SOURCE_FRIEND_REWARD;

/**
 * 补签计费的**归因**字面（`Tx.ref.source` / `Tx.ref.op`；流水**类型**复用既有枚举 `edit_fee` ——
 * 见 `signinMakeup` 的推定依据长注释）。**不是**新增 Tx.type。
 */
export const SIGNIN_MAKEUP_SOURCE = 'signin_makeup';

/**
 * 池内 `kind` → friend-ops 基础奖励键（`GRANT` 三键逐字：`seed_fragments` / `bamboo_pieces` / `scroll_fragments`）。
 * ⚠️ 两种字面并存（裁定文 §3 默认池用 `scrollFragment`，§5 校验枚举用 `scroll_fragment`）⇒ 同一资产的两个别名，
 * 一律映射到 `scroll_fragments`；成品兰帖 `scroll`（按片计）不在 GRANT 三键内，单独入批（见 `grantSigninItems`）。
 */
export const SIGNIN_KIND_TO_GRANT = {
  fragment: 'seed_fragments',
  bamboo: 'bamboo_pieces',
  scroll_fragment: 'scroll_fragments',
  scrollFragment: 'scroll_fragments',
};

/** 基础奖励在 `items` 里的两种道具（R-5 逐字：石榴籽碎片 1 + 竹片 1） */
export const SIGNIN_BASE_ITEMS = [
  { kind: 'fragment', qty: 1 },
  { kind: 'bamboo', qty: 1 },
];

/** 日期串（`YYYY-MM-DD`）是否真实存在（形状 + UTC 零点往返一致 ⇒ 挡掉 2026-02-31 / 2026-13-45） */
export function isSigninDayString(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}

/**
 * 日期串偏移 ±n 天（**北京自然日串口径**：日期串本身就是「北京时间那一天的日历日」，
 * 故只做「日串 → UTC 零点 → ±n × 86400000 → 日串」，与 `beijingDate` 恒等口径）。
 * 非法日串 ⇒ `''`（不臆造）。
 */
export function shiftSigninDay(day, n) {
  const s = norm(day);
  if (!isSigninDayString(s)) return '';
  const step = Math.trunc(Number(n) || 0);
  return new Date(Date.parse(`${s}T00:00:00.000Z`) + step * DAY_MS).toISOString().slice(0, 10);
}

/** 周期第几天：`cycle_day = ((streak - 1) % 7) + 1`；`streak === 0`（未签）⇒ 1（日历窗口从今天开始） */
export function cycleDayOf(streak) {
  const s = toNonNegInt(streak);
  return s <= 0 ? 1 : ((s - 1) % SIGNIN_CYCLE_DAYS) + 1;
}

/**
 * 从已签日期集**重算**连签天数（补签后唯一口径）：
 * 「以 `signin_days` 自今天起往回数连续天数」——起点 = 今天（今日已签）或昨天（今日未签，
 * 此时连签仍「活着」，否则每天零点后未签到前读数会恒为 0）；遇缺即停（**漏签即归零**）。
 */
export function streakFromSigninDays(days, today) {
  const day = norm(today);
  if (!isSigninDayString(day)) return 0;
  const set = new Set(normalizeSigninDays(days));
  let cursor = set.has(day) ? day : shiftSigninDay(day, -1);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = shiftSigninDay(cursor, -1);
  }
  return n;
}

/** 把若干日期并入已签日期集（唯一收口 = ledger 的 `normalizeSigninDays`：升序 / 去重 / 只留最近 30 天） */
export function mergeSigninDays(days, add) {
  const extra = Array.isArray(add) ? add : [add];
  return normalizeSigninDays([...(Array.isArray(days) ? days : []), ...extra]);
}

/**
 * 加权抽 1 件（**纯函数**，随机源可注入 ⇒ 单测确定性）。
 * 权重区间（半开半闭、照累计权重法）：碎片 `[0, 0.5)` / 竹片 `[0.5, 0.85)` / 兰帖残页 `[0.85, 1)`。
 * 非法 / 空池 ⇒ `null`（不臆造、不发奖）；`r` 非有限值按 0 处理；`r >= 1` 压回最后一格。
 * @param {Array<{kind:string,qty:number,weight:number}>} pool
 * @param {() => number} [random] 缺省 `Math.random`（契约：`0 ≤ r < 1`）
 * @returns {{kind:string, qty:number}|null}
 */
export function pickSigninPoolItem(pool, random = Math.random) {
  const list = (Array.isArray(pool) ? pool : []).filter(
    (it) => it && Number.isFinite(Number(it.weight)) && Number(it.weight) > 0 && Number.isFinite(Number(it.qty)) && Number(it.qty) > 0,
  );
  const total = list.reduce((s, it) => s + Math.floor(Number(it.weight)), 0);
  if (list.length === 0 || total <= 0) return null;
  let r = Number(typeof random === 'function' ? random() : random);
  if (!Number.isFinite(r)) r = 0;
  if (r < 0) r = 0;
  if (r >= 1) r = 0.9999999999999999; // `Math.random` 契约 [0,1)：越界值压回最后一格（不产生空抽）
  let acc = r * total;
  for (const it of list) {
    acc -= Math.floor(Number(it.weight));
    if (acc < 0) return { kind: norm(it.kind), qty: toNonNegInt(it.qty) };
  }
  const last = list[list.length - 1];
  return { kind: norm(last.kind), qty: toNonNegInt(last.qty) };
}

/**
 * 7 格日历条（出参 `calendar` 形状**逐字**）：长度 7 的数组，下标 0..6 ↔ `cycle_day` 1..7，元素：
 *   `{ cycle_day:int, date:string, state:'signed'|'missed'|'today'|'future', kind:string, qty:int, is_bonus:bool,
 *      base:[{kind:string,qty:int}], random:bool, bonus:null|{kind:string,qty:int} }`
 * 后三键（`base` / `random` / `bonus`）为签到域收口新增 —— **只增不删**：既有六键（`cycle_day` / `kind` /
 * `qty` / `is_bonus` / `state` / `date`）键名、顺序与取值一字未改。
 *   · `base` = 每格**基础奖励**清单，由 `SIGNIN_BASE_ITEMS` **投影**（逐字 = `[{kind:'fragment',qty:1},{kind:'bamboo',qty:1}]`）；
 *     绝不在此另写一份字面（改口径只改 `SIGNIN_BASE_ITEMS` 一处）；每格都是新对象（调用方改它不污染兄弟格）。
 *   · `random` 恒 `true`：当日必含**随机追加**一件（随机池按 `signin_pool` 权重必抽，`signinItemsOf` 同口径）。
 *   · `bonus` **仅第 7 格** = `{kind:'fragment', qty:<signin_day7_fragments 当前生效值>}`，其余 6 格 = `null`；
 *     与 `is_bonus` **恒一致**（`is_bonus === (bonus !== null)`）。
 *
 * 窗口推导：从**当日连签窗口**反推 —— 当前 `cycle_day = ((streak - 1) % 7) + 1` 对应今天，
 * 故窗口首日 = 今天 −（`cycle_day` − 1）天；`streak === 0` ⇒ `cycle_day = 1` ⇒ 窗口从今天开始。
 *
 * `state` 规则（逐字）：已签（含补签）⇒ `'signed'`；今日未签 ⇒ `'today'`；未签且日 < 今日 ⇒ `'missed'`；
 * 日 > 今日 ⇒ `'future'`。
 *
 * `kind` / `qty`：第 7 格 = 第 7 天额外碎片（`is_bonus: true`、qty = `signin_day7_fragments`）；
 * 其余 6 格 = 基础奖励**主项**（石榴籽碎片 1 个，`kind='fragment'`）——
 * 注：基础奖励固定含「碎片 1 + 竹片 1」两件，而单格形状逐字只承载**一个** `kind`/`qty`，故取主项（碎片）。
 * @param {object} user 资产记录（只读）
 * @param {Date} [now]
 * @param {{day7_fragments?:number}} [opts]
 */
export function signinCalendarOf(user, now = new Date(), opts = {}) {
  const day = beijingDate(now);
  const days = new Set(normalizeSigninDays(user?.signin_days));
  const cycle = cycleDayOf(user?.signin_streak);
  const start = shiftSigninDay(day, -(cycle - 1));
  const day7 = opts.day7_fragments === undefined ? DEFAULT_SIGNIN_DAY7_FRAGMENTS : toNonNegInt(opts.day7_fragments);
  const cells = [];
  for (let i = 1; i <= SIGNIN_CYCLE_DAYS; i += 1) {
    const date = shiftSigninDay(start, i - 1);
    const is_bonus = i === SIGNIN_CYCLE_DAYS;
    const state = days.has(date) ? 'signed' : date === day ? 'today' : date < day ? 'missed' : 'future';
    cells.push({
      cycle_day: i,
      kind: 'fragment',
      qty: is_bonus ? day7 : DAILY_TASK_REWARD.base.seed_fragments,
      is_bonus,
      state,
      date,
      // ---- 本单新增三键（**只增不删**；既有六键一字未改）----
      base: SIGNIN_BASE_ITEMS.map((it) => ({ kind: it.kind, qty: it.qty })), // 逐字 [{kind:'fragment',qty:1},{kind:'bamboo',qty:1}]（由常量投影）
      random: true, // 当日必含随机追加一件
      bonus: is_bonus ? { kind: 'fragment', qty: day7 } : null, // 仅第 7 格；与 is_bonus 恒一致
    });
  }
  return cells;
}

/**
 * 补签前置判定（**纯函数**）：`{ok:true}` / `{ok:false, code, message}`。
 * 判定顺序与裁定文列举顺序一致：**先范围**（未来 / 今天 / 超出 7 天 ⇒ 「补签日期不在可补范围内」），
 * **再已签**（范围内且已在 `signin_days` ⇒ 「该日已签到，无需补签」）。
 * @param {string[]} days 已签日期集
 * @param {string} date 目标补签日（入参）
 * @param {string} today 今日（`beijingDate`）
 */
export function makeupGateOf(days, date, today) {
  const target = norm(date);
  const back =
    isSigninDayString(target) && isSigninDayString(today)
      ? Math.round((Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${target}T00:00:00.000Z`)) / DAY_MS)
      : NaN;
  if (!Number.isFinite(back) || back < 1 || back > SIGNIN_MAKEUP_MAX_BACK_DAYS) {
    return { ok: false, code: 'SIGNIN_MAKEUP_OUT_OF_RANGE', message: SIGNIN_MAKEUP_MESSAGES.OUT_OF_RANGE };
  }
  if (normalizeSigninDays(days).includes(target)) {
    return { ok: false, code: 'SIGNIN_MAKEUP_ALREADY', message: SIGNIN_MAKEUP_MESSAGES.ALREADY_SIGNED };
  }
  return { ok: true };
}

/**
 * 本次签到的**实发清单**（出参 `items`，形状 `[{kind, qty}]`，含 基础 + 随机 + 第 7 天）。
 * @param {number} cycle_day
 * @param {{kind:string,qty:number}|null} picked 随机抽中的一件
 * @param {number} day7_fragments
 */
export function signinItemsOf(cycle_day, picked, day7_fragments) {
  const items = SIGNIN_BASE_ITEMS.map((it) => ({ ...it }));
  if (picked) items.push({ kind: picked.kind, qty: toNonNegInt(picked.qty) });
  if (toNonNegInt(cycle_day) === SIGNIN_CYCLE_DAYS && toNonNegInt(day7_fragments) > 0) {
    items.push({ kind: 'fragment', qty: toNonNegInt(day7_fragments) });
  }
  return items;
}

/**
 * 把实发清单入账（**调用方必须已持有该手机号的 `withAssets` 锁**；本函数零 IO、零取锁）。
 *
 * 入账路径（**不新增 Tx.type**）：
 *   · `fragment` / `bamboo` / `scroll_fragment`（含别名 `scrollFragment`）⇒ 合并成 `amounts` 后
 *     **一次** `friend-ops.grantRewardBase`（写一条既有枚举 `reward` 流水，`ref.source='friend_reward'`）；
 *   · `scroll`（成品兰帖，按片计）不在 GRANT 三键内 ⇒ 单独 `addLot('scroll', …, { expires_at: null })`
 *     ＋ 另写一条既有枚举 `reward` 流水（`delta.scrolls`，照 `scroll_decompose` 的键名体例）。
 * @param {object} user 事务内的用户记录
 * @param {Array<{kind:string,qty:number}>} items
 * @param {Date} now
 * @param {string} me 触发者手机号（仅用于脱敏投影）
 * @returns {{amounts:object, scroll_pieces:number, tx_id:string, scroll_tx_id:string}}
 */
export function grantSigninItems(user, items, now, me) {
  const amounts = { seed_fragments: 0, bamboo_pieces: 0, scroll_fragments: 0 };
  let scrollPieces = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const kind = norm(it?.kind);
    const qty = toNonNegInt(it?.qty);
    if (qty <= 0) continue;
    const key = SIGNIN_KIND_TO_GRANT[kind];
    if (key) amounts[key] += qty;
    else if (kind === 'scroll') scrollPieces += qty;
  }
  const tx = grantRewardBase(user, amounts, now, me);
  let scrollTxId = '';
  if (scrollPieces > 0) {
    addLot(user, 'scroll', scrollPieces, { expires_at: null, source: SOURCE_FRIEND_REWARD, now });
    const stx = recordTx(
      user,
      {
        type: 'reward',
        delta: { scrolls: scrollPieces },
        ref: { source: SOURCE_FRIEND_REWARD, scope: 'base', trigger_masked: maskPhone(me) },
        desc: `签到奖励（随机）：+${scrollPieces} 片成品兰帖`,
      },
      now,
    );
    scrollTxId = norm(stx?.id);
  }
  return { amounts, scroll_pieces: scrollPieces, tx_id: norm(tx?.id), scroll_tx_id: scrollTxId };
}

// ==================== 达标 / 已领判定（纯函数，只读 user 记录） ====================

/** 当日「成功写」流水条数（纯函数；口径见 WRITE_TX_TYPES 注释） */
export function countWritesToday(user, now = new Date()) {
  const today = beijingDate(now);
  const txs = Array.isArray(user?.txs) ? user.txs : [];
  let n = 0;
  for (const t of txs) {
    if (!t || !WRITE_TX_TYPES.includes(norm(t.type))) continue;
    if (!t.ts) continue;
    if (beijingDate(t.ts) === today) n += 1;
  }
  return n;
}

/**
 * 达标判定（逐字三条）。
 * @returns {boolean} `true` = 当日已达标
 */
export function achievedToday(user, task, now = new Date()) {
  const id = norm(task);
  if (id === TASK_IDS.SIGNIN) return norm(user?.signin_date) === beijingDate(now);
  if (id === TASK_IDS.INVITE) return countInviteRewardsToday(user, now) > 0;
  if (id === TASK_IDS.WRITE) return countWritesToday(user, now) > 0;
  return false;
}

/** 「已领取」的日期串（`signin` = 共用 `signin_date`；其余 = `task_claims[任务名]`） */
export function claimedDayOf(user, task) {
  const id = norm(task);
  if (id === TASK_IDS.SIGNIN) return norm(user?.signin_date); // ⚠️ 与签到卡共用同一字段
  return norm((user && user[CLAIMS_FIELD] && user[CLAIMS_FIELD][id]) || '');
}

/** 当日是否已领（同一自然日判定 = 北京自然日日期串比对） */
export function claimedToday(user, task, now = new Date()) {
  return claimedDayOf(user, task) === beijingDate(now);
}

/**
 * 逐条任务的三态投影（纯函数）。
 * `claimable` 判据：`signin` = 当日未签到（签到即领奖）；`invite` / `write` = **当日已达标**。
 */
export function taskViewOf(user, def, now = new Date()) {
  const day = beijingDate(now);
  const achieved = achievedToday(user, def.id, now);
  const claimed = claimedToday(user, def.id, now);
  const claimable = !claimed && (def.id === TASK_IDS.SIGNIN ? true : achieved);
  const state = claimed ? TASK_STATE.CLAIMED : claimable ? TASK_STATE.CLAIMABLE : TASK_STATE.NOT_ACHIEVED;
  return {
    task: def.id,
    title: def.title,
    rule: def.rule,
    day,
    achieved,
    claimed,
    claimed_day: claimedDayOf(user, def.id),
    claimable,
    state,
    state_text: TASK_STATE_TEXT[state],
    blocked_reason:
      state === TASK_STATE.CLAIMED
        ? TASK_STATE_TEXT.claimed
        : state === TASK_STATE.NOT_ACHIEVED
          ? `${TASK_STATE_TEXT.not_achieved}：${def.title}尚未完成（北京时间自然日 ${day}）`
          : '',
  };
}

/** 三条任务的三态投影（`/tasks/today` 的 data.tasks） */
export function taskViewsOf(user, now = new Date()) {
  return TASK_DEFS.map((def) => taskViewOf(user, def, now));
}

// ==================== IO：当日三态读数（GET /tasks/today） ====================

/**
 * 当日三任务三态读数（**只读、零写入、不 sweep**：GET 不得产生资产变更）。
 * @returns {Promise<{day:string, tasks:object[]}>}
 */
export async function tasksToday(phone, now = new Date()) {
  const me = norm(phone);
  if (!me) throw taskError('TASK_INVALID_PHONE');
  const at = asDate(now);
  const user = await getAssets(me); // 只读快照；一切写入走 withAssets
  return { day: beijingDate(at), tasks: taskViewsOf(user, at), reward: { ...DAILY_TASK_REWARD } };
}

// ==================== IO：手动领取（POST /tasks/claim） ====================

/** 领取前置（纯函数）：`{ok:true}` / `{ok:false, code, message}` */
function claimGateOf(user, task, now) {
  if (claimedToday(user, task, now)) {
    return { ok: false, code: 'TASK_ALREADY_CLAIMED', message: `今日「${TASK_BY_ID.get(task)?.title || task}」奖励已领取（北京时间自然日 ${beijingDate(now)} 每项任务只能领一次）` };
  }
  if (task === TASK_IDS.SIGNIN) return { ok: true }; // 签到：签到动作即本次领取（与签到卡共用 signin_date）
  if (!achievedToday(user, task, now)) {
    return { ok: false, code: 'TASK_NOT_ACHIEVED', message: `今日「${TASK_BY_ID.get(task)?.title || task}」尚未达标（${TASK_BY_ID.get(task)?.rule || ''}）` };
  }
  return { ok: true };
}

/**
 * 手动领取（T-4）：**唯一**发奖入口。
 *
 * 执行序列（**本单修正**：Zang 裁定「发放必须幂等」）：
 *   ⓪ **只读预检**（`getAssets` 快照 + `claimGateOf`）：未达标 / 已领取 ⇒ 立刻结构化拒绝，零写入；
 *   ① **池分发**（唯一入口 = `friend-ops.distributeFriendRewards`，`base: null` ⇒ 不在那里发基础奖励）；
 *      幂等键 = `手机号 + 自然日 + 任务` ⇒ 中途失败重试时，**已在账上的收件人跳过入账**（不重复发、
 *      不重复写流水）。池写的是**他人**资产（各自 `withAssets`），故这里**不**把跨用户写入塞进
 *      触发者的锁内（那会造成 A↔B 互锁死锁，见报告）；池的幂等由幂等键保证。
 *      失败 ⇒ `TASK_REWARD_FAILED`（此刻**本人零写入、零打标** ⇒ 领取天然可重试，无悬空标记）。
 *   ② **打标 + 基础奖励入账 = 同一 `withAssets` 事务**：锁内**复核**幂等 / 达标（并发双领的最后一道闸）
 *      ⇒ 打标（`signin` 写共用 `signin_date` + 既有枚举 `signin` 审计条；`invite` / `write` 写
 *      `task_claims[任务]`）+ `friend-ops.grantRewardBase`（基础奖励逐键入账 + 一条 `reward` 流水）。
 *      **原子提交 / 原子回滚** ⇒ 不存在「基础已入账但未打标」，重试也绝不会二次入账基础奖励。
 *      失败 ⇒ `TASK_REWARD_FAILED`（零写入）；锁内复核失败 ⇒ 原样抛 409（`TASK_ALREADY_CLAIMED` /
 *      `TASK_NOT_ACHIEVED`，错误码与文案逐字保留）。
 *   ③ 领取后读数（供 `/assets/signin` 兼容出参 + 报告逐字读回）。
 *
 * @param {string} phone
 * @param {'signin'|'invite'|'write'} task
 * @param {Date|string} [now]
 * @param {{random?:() => number}} [opts] `random` = 签到随机追加的**可注入随机源**（缺省 `Math.random`；
 *   契约 `0 ≤ r < 1`）——**绝不用 `Date.now()` 当随机源**（那会让单测不可确定性复现）
 * @returns {Promise<{task:string,title:string,day:string,state:string,state_text:string,claimed_at:string,
 *   achieved:boolean, signin_date:string, reward:object, detail:object, tasks:object[],
 *   streak:number, cycle_day:number, items:object[], calendar:object[], signin_days:string[], signin_streak:number}>}
 */
export async function claimTask(phone, task, now = new Date(), opts = {}) {
  const me = norm(phone);
  if (!me) throw taskError('TASK_INVALID_PHONE');
  const id = norm(task);
  const def = TASK_BY_ID.get(id);
  if (!def) {
    throw taskError('TASK_UNKNOWN', {
      message: `未知任务：${id || '(空)'}（可用：${TASK_DEFS.map((d) => d.id).join(' / ')}）`,
    });
  }
  const at = asDate(now);
  const day = beijingDate(at);
  // 随机源（可注入；缺省 Math.random ⇒ 生产行为与既有口径一致）
  const random = typeof opts?.random === 'function' ? opts.random : Math.random;
  // 签到域后台配置（**事务外只读** ⇒ 不在资产锁内做 IO；缺省值见 lib/wallet.js 常量）
  let signinPool = DEFAULT_SIGNIN_POOL;
  let day7Fragments = DEFAULT_SIGNIN_DAY7_FRAGMENTS;
  if (id === TASK_IDS.SIGNIN) {
    signinPool = await getSigninPool();
    day7Fragments = await getSigninDay7Fragments();
  }

  // ⓪ 只读预检（零写入）：被拒的领取一字节不写（错误码 / 文案与旧口径逐字一致）
  const preGate = claimGateOf(await getAssets(me), id, at);
  if (!preGate.ok) throw taskError(preGate.code, { message: preGate.message, detail: { task: id, day } });

  // ① 池分发（唯一入口 = friend-ops；幂等键 = 触发者 + 自然日 + 任务 ⇒ 失败重试不重复入账）
  let pool = null;
  let failure = null;
  try {
    const res = await distributeFriendRewards(
      me,
      // `base: null` ⇒ friend-ops 只发池：本人基础奖励在 ② 与打标**同一事务**内入账（见下）
      { base: null, pool: { ...DAILY_TASK_REWARD.pool } },
      at,
      { idempotency_key: `${me}:${day}:${id}` },
    );
    if (!res || res.ok === false) {
      failure = res?.error || { code: 'TASK_REWARD_FAILED', message: TASK_ERRORS.TASK_REWARD_FAILED.message };
    } else {
      pool = res;
    }
  } catch (e) {
    failure = { code: norm(e?.code) || 'TASK_REWARD_FAILED', message: norm(e?.message) || TASK_ERRORS.TASK_REWARD_FAILED.message };
  }
  if (failure) {
    throw taskError('TASK_REWARD_FAILED', {
      message:
        `任务奖励发放失败（${failure.code || 'REWARD_FAILED'}）：${failure.message || '好友奖励池分发未成功'}` +
        '；本次领取**未落任何标记、零写入**，可直接重试',
      reason: failure.code || 'TASK_REWARD_FAILED',
      detail: { task: id, day, rolled_back: true, stage: 'pool' },
    });
  }

  // ② 打标 + 奖励入账（**同一 withAssets 事务**；锁内复核 ⇒ 并发双领的最后一道闸）
  let before = null;
  let baseTxId = '';
  let claimedItems = SIGNIN_BASE_ITEMS.map((it) => ({ ...it }));
  let claimedStreak = 0;
  let claimedCycle = 1;
  try {
    const out = await withAssets(me, (user) => {
      const gate = claimGateOf(user, id, at);
      if (!gate.ok) throw taskError(gate.code, { message: gate.message, detail: { task: id, day } });
      const snap = {
        signin_date: norm(user.signin_date),
        claims: { ...((user && user[CLAIMS_FIELD]) || {}) },
        fragments: toNonNegInt(user.fragments),
        seed_ids: (Array.isArray(user.seeds) ? user.seeds : []).map((l) => norm(l?.id)),
      };
      let items = SIGNIN_BASE_ITEMS.map((it) => ({ ...it }));
      let txId = '';
      if (id === TASK_IDS.SIGNIN) {
        // ②-a 连签推进（周期 **写死 7**、不配）：昨日已签 ⇒ +1；其余（隔天 / 隔多天 / 从未签）⇒ 归零重数 1
        const prev = norm(user.signin_date);
        const streak = prev === shiftSigninDay(day, -1) ? toNonNegInt(user.signin_streak) + 1 : 1;
        const cycle = cycleDayOf(streak);
        // ②-b 每日随机追加 1 件（可配池、加权抽 1；随机源由调用方注入，缺省 Math.random）
        const picked = pickSigninPoolItem(signinPool, random);
        items = signinItemsOf(cycle, picked, day7Fragments);
        user.signin_date = day; // ⚠️ 与签到卡共用同一字段（同一判定、绝不双发）
        user.signin_streak = streak;
        user.signin_days = mergeSigninDays(user.signin_days, day); // 升序去重 + 只留最近 30 天
        // 审计流水：既有枚举 `signin`（delta 全 0 的记账条，照 ledger 既有 `jade_mount` 体例）
        recordSigninAudit(user, at);
        // 奖励入账：基础 + 随机 + 第 7 天（**同一次 grantRewardBase / 同一事务**；既有枚举 reward）
        txId = grantSigninItems(user, items, at, me).tx_id;
        claimedItems = items;
        claimedStreak = streak;
        claimedCycle = cycle;
      } else {
        user[CLAIMS_FIELD] = { ...((user && user[CLAIMS_FIELD]) || {}), [id]: day };
        // 基础奖励（石榴籽碎片 1 + 竹片 1）：锁内入账 + 一条既有枚举 `reward` 流水（与打标同事务）
        txId = norm(grantRewardBase(user, { ...DAILY_TASK_REWARD.base }, at, me)?.id);
        claimedItems = items;
      }
      return { snap, tx_id: txId };
    });
    before = out.snap;
    baseTxId = out.tx_id;
  } catch (e) {
    // 锁内复核的拒绝 ⇒ **原样抛出**（409 语义与错误码逐字保留）
    if (e?.code === 'TASK_ALREADY_CLAIMED' || e?.code === 'TASK_NOT_ACHIEVED') throw e;
    throw taskError('TASK_REWARD_FAILED', {
      message: `任务奖励发放失败（${norm(e?.code) || 'REWARD_FAILED'}）：基础奖励入账未完成（本事务已整体回滚，零写入）`,
      reason: norm(e?.code) || 'TASK_REWARD_FAILED',
      detail: { task: id, day, rolled_back: true, stage: 'claim_and_base' },
    });
  }

  // ③ 领取后读数（供 /assets/signin 兼容出参 + 报告逐字读回）
  const after = await getAssets(me);
  return {
    task: id,
    title: def.title,
    day,
    state: TASK_STATE.CLAIMED,
    state_text: TASK_STATE_TEXT.claimed,
    claimed_at: at.toISOString(),
    achieved: achievedToday(after, id, at),
    signin_date: norm(after.signin_date),
    reward: summaryOfReward(pool, baseTxId),
    detail: detailOf(before, after),
    tasks: taskViewsOf(after, at),
    // ---- 签到域新增出参（**只增不删**；既有键名与形状一字未改）----
    streak: toNonNegInt(after.signin_streak),
    cycle_day: cycleDayOf(after.signin_streak),
    items: claimedItems,
    calendar: signinCalendarOf(after, at, { day7_fragments: day7Fragments }),
    signin_streak: toNonNegInt(after.signin_streak),
    signin_days: normalizeSigninDays(after.signin_days),
    // 本次连签推进的读数（供路由 / 报告逐字引用；与 after 读数同值 —— 领取即今日已签）
    streak_before_claim: claimedStreak,
    cycle_day_before_claim: claimedCycle,
  };
}

/**
 * 补签（**Zang 裁定 v1 §4** · `POST /assets/signin/makeup { date }`）。
 *
 * 权限：已登录本人（路由层未登录 401）；可补范围 = **今天往前 1–7 天**且该日不在 `signin_days`；
 * 未来 / 今天 / 超出 7 天 ⇒ 400「补签日期不在可补范围内」；范围内的已签日 ⇒ 400「该日已签到，无需补签」。
 *
 * 执行序列（**单一 `withAssets` 事务，原子提交 / 原子回滚**）：
 *   ⓪ 事务外只读预检（`getAssets` 快照 + `makeupGateOf`）⇒ 不合法立刻结构化拒绝，**零写入**；
 *   ① 锁内**复核**范围与已签（并发双补的兜底：`withAssets` 同一手机号串行化 ⇒ 第二笔必被复核拦下）；
 *      → `chargeLots(user.bamboos, cost, 'bamboo')` **既有 FIFO 批扣**：不足 ⇒ 409 `ASSET_INSUFFICIENT`
 *      （`assetInsufficient` 的 need / current / unit=bamboo），**整单拒绝、不部分扣、一字节不写**；
 *      → 写一条**计费流水**（`Tx.type = 'edit_fee'`，推定依据见下）；
 *      → 目标日并入 `signin_days`（升序去重 + 只留最近 30 天）＋ **重算** `signin_streak`
 *      （`streakFromSigninDays`：以 `signin_days` 自今天起往回数连续天数）；
 *      → **不补发任何道具**（不写基础 / 不写随机 / 不发第 7 天奖励，也不写 `reward` 流水）。
 *      幂等：同一日重复补签 → 锁内复核 400（第一笔已把该日写进 `signin_days`）。
 *      注：`signin_date`（最近一次签到日）**一字不改** —— 补签不是签到，它是「已签日期集」的修补。
 *
 * **竹片扣费用哪一类流水（本单实地核实后的推定，详见报告）**：
 *   既有「竹片消耗」的**唯一计费语义** = `lib/economy-fee.js` 的 `chargeUnit('bamboos', …)`，
 *   它把 `Tx.type` 取 `TX_TYPE_OF_OP[op]`（缺省 op = `person_update`）⇒ **`edit_fee`**；
 *   同册先例：`sibling_reorder`（调整排行，与内容修改无关）也**复用既有枚举 `edit_fee`**。
 *   ⇒ 补签扣费沿用**同一计费枚举 `edit_fee`**（`delta = { bamboos: -cost }`），
 *   用 `ref.source = 'signin_makeup'` + `ref.op = 'signin_makeup'` 归因，**不自造 Tx.type**
 *   （白名单新增须先改总纲 §4-6）；**不**用 `reward` 的负 delta（那会把扣费伪装成发奖）。
 *
 * @param {string} phone
 * @param {string} date 目标补签日 `YYYY-MM-DD`
 * @param {Date|string} [now]
 * @returns {Promise<{date:string, day:string, streak:number, signin_streak:number, cycle_day:number,
 *   cost_bamboos:number, bamboos_taken:object[], bamboos_total_pieces:number, tx_id:string,
 *   signin_date:string, signin_days:string[], calendar:object[]}>}
 * 注（出参口径 · Kevin 2026-09-28 收口）：**HTTP 出参形状由路由定**（`index.js`）= 逐字
 * `{ ok, date, streak, cycle_day, cost_bamboos, calendar }`；本函数返回的其余键（`day` / `signin_streak` /
 * `bamboos_taken` / `bamboos_total_pieces` / `tx_id` / `signin_date` / `signin_days`）**只是内部审计明细**，
 * 路由**不**透传。补签**无 `items`** —— 不补发任何道具（硬口径，防「2 竹片买回 >2 竹片道具」套利）。
 */
export async function signinMakeup(phone, date, now = new Date()) {
  const me = norm(phone);
  if (!me) throw taskError('TASK_INVALID_PHONE');
  const at = asDate(now);
  const today = beijingDate(at);
  const target = norm(date);
  // 后台可配（事务外只读）：补签成本（默认 2 片竹片）＋ 第 7 天奖励（供日历条读数）
  const cost = await getSigninMakeupCostBamboos();
  const day7Fragments = await getSigninDay7Fragments();

  // ⓪ 只读预检（零写入、不取锁）：范围 / 已签先拒
  const pre = makeupGateOf(normalizeSigninDays((await getAssets(me)).signin_days), target, today);
  if (!pre.ok) throw taskError(pre.code, { message: pre.message, detail: { date: target, day: today } });

  // ① 单一资产事务：复核 + FIFO 扣费 + 落日期集 + 重算连签 + 一条计费流水
  let charged = null;
  try {
    charged = await withAssets(me, (user) => {
      const gate = makeupGateOf(normalizeSigninDays(user.signin_days), target, today);
      if (!gate.ok) throw taskError(gate.code, { message: gate.message, detail: { date: target, day: today } });
      // 既有 FIFO 批扣（不足 ⇒ 抛 409 ASSET_INSUFFICIENT；`withAssets` 不落盘 ⇒ 一字节不写）
      const c = chargeLots(user.bamboos, cost, 'bamboo');
      const tx = recordTx(
        user,
        {
          type: 'edit_fee',
          delta: { bamboos: -cost },
          ref: { source: SIGNIN_MAKEUP_SOURCE, op: SIGNIN_MAKEUP_SOURCE, date: target },
          desc: `补签 ${target}（扣 ${cost} 片竹片）`,
          operator: me,
        },
        at,
      );
      user.signin_days = mergeSigninDays(user.signin_days, target);
      user.signin_streak = streakFromSigninDays(user.signin_days, today);
      return { taken: c.taken, left: c.current, tx_id: norm(tx?.id), streak: toNonNegInt(user.signin_streak) };
    });
  } catch (e) {
    const code = norm(e?.code);
    // 结构化拒绝原样透传（资产不足 409 / 补签两条 400；错误码与文案逐字保留）
    if (code === ASSET_INSUFFICIENT || code === 'SIGNIN_MAKEUP_OUT_OF_RANGE' || code === 'SIGNIN_MAKEUP_ALREADY') throw e;
    if (Number.isFinite(Number(e?.status))) throw e;
    throw taskError('SIGNIN_MAKEUP_FAILED', {
      message: `补签失败（${code || 'MAKEUP_FAILED'}）：本事务已整体回滚，零写入、未扣费，可直接重试`,
      reason: code || 'SIGNIN_MAKEUP_FAILED',
      detail: { date: target, day: today, rolled_back: true },
    });
  }

  const after = await getAssets(me);
  return {
    date: target,
    day: today,
    // ---- 补签后读数（新增字段；不改任何既有出参）----
    streak: toNonNegInt(after.signin_streak),
    signin_streak: toNonNegInt(after.signin_streak),
    cycle_day: cycleDayOf(after.signin_streak),
    cost_bamboos: cost,
    bamboos_taken: charged.taken, // FIFO 明细（批次 id / 片数 / 到期），供前端与审计核对
    bamboos_total_pieces: sumLots(after.bamboos),
    tx_id: charged.tx_id,
    signin_date: norm(after.signin_date), // **未变**：补签不改「最近一次签到日」
    signin_days: normalizeSigninDays(after.signin_days),
    calendar: signinCalendarOf(after, at, { day7_fragments: day7Fragments }),
  };
}

/**
 * 补偿路径的说明（**本单修正后已无调用点，保留注释以便追溯**）：
 *   旧口径「先打标 → 再发奖 → 失败则撤销打标」在「基础已入账、池分发中途失败」的窗口内重试会
 *   **重复入账一次基础奖励**（碎片 1 + 竹片 1）。本单按 Zang 裁定「发放必须幂等」改为：
 *   池先发（按幂等键去重）+ 「打标 + 基础奖励入账」同一次 `withAssets` 事务原子提交 / 原子回滚
 *   ⇒ 该窗口在结构上消失，不再需要「撤标」这一补偿动作（`rollbackClaim` 已随之删除）。
 */

/**
 * 签到的**审计流水**（既有枚举 `signin`，`delta` 全 0）。
 * 为什么必须留这一条：`Tx.type='signin'` 是签到在账本里的**唯一语义锚点**（前端资产流水亦按此类型
 * 展示「每日签到」）；本单把「发奖」统一交给任务中心（`reward` 流水），但**签到这一事件本身仍必须留痕**。
 * `delta` 全 0 ⇒ 不产生任何资产变动，**不构成第二套数值**（既有先例：`jade_mount` 的 0-delta 记账条）。
 * 写路径**唯一** = ledger 的 `recordTx`（id / ts 由它生成；type 受 `TX_TYPES` 白名单校验 ⇒ 不新增枚举）。
 */
function recordSigninAudit(user, now) {
  return recordTx(
    user,
    {
      type: 'signin',
      delta: {},
      ref: { source: 'task_center', task: 'signin' },
      desc: '每日签到（北京时间自然日；奖励经任务中心领取：石榴籽碎片 1 + 竹片 1，好友池另计）',
    },
    now,
  );
}

/**
 * 发奖结果摘要（**只出脱敏与聚合读数**；池明细含 relation_token / 脱敏手机号，由 friend-ops 决定）。
 * `base` = R-5 口径的基础奖励（本单起由 ② 的**同一事务**发放 ⇒ 取常量，不回显池调用的 `base:null`）；
 * `base_tx_id` = 该事务里那条 `reward`（`scope='base'`）流水的 id。
 */
function summaryOfReward(pool, baseTxId) {
  return {
    base: { seed_fragments: 0, bamboo_pieces: 0, scroll_fragments: 0, ...DAILY_TASK_REWARD.base },
    pooled: !!pool?.pooled,
    denominator: toNonNegInt(pool?.denominator),
    pool_per_friend: pool?.pool_per_friend || {},
    remainder: pool?.remainder || {},
    distributed: Array.isArray(pool?.distributed) ? pool.distributed : [],
    base_tx_id: norm(baseTxId),
  };
}

/** 领取前后的资产读数（供 `/assets/signin` 兼容出参：`fragments` / `synthesized` / `seed_lot`） */
function detailOf(before, after) {
  const seedIds = new Set(before?.seed_ids || []);
  const fresh = (Array.isArray(after?.seeds) ? after.seeds : []).filter(
    (l) => l && !seedIds.has(norm(l.id)) && norm(l.source) === 'fragment_synth',
  );
  return {
    fragments: toNonNegInt(after?.fragments),
    synthesized: fresh.length,
    seed_lot: fresh[0] || null,
    signin_date: norm(after?.signin_date),
    scroll_fragments: toNonNegInt(after?.scroll_fragments),
    bamboos_total_pieces: (Array.isArray(after?.bamboos) ? after.bamboos : []).reduce((s, l) => s + toNonNegInt(l?.qty), 0),
    fragments_before: toNonNegInt(before?.fragments),
  };
}

// ==================== 导出清单 ====================
// IO：tasksToday / claimTask / signinMakeup
// 纯函数：achievedToday / countWritesToday / claimedDayOf / claimedToday / taskViewOf / taskViewsOf /
//   isSigninDayString / shiftSigninDay / cycleDayOf / streakFromSigninDays / mergeSigninDays /
//   pickSigninPoolItem / signinCalendarOf / signinItemsOf / makeupGateOf / grantSigninItems（锁内入账入口）
// 常量与错误：TASK_IDS / TASK_DEFS / TASK_STATE / TASK_STATE_TEXT / CLAIMS_FIELD / WRITE_TX_TYPES /
//   DAILY_TASK_REWARD / TASK_ERRORS / taskError ＋ 签到域：SIGNIN_CYCLE_DAYS / SIGNIN_MAKEUP_MAX_BACK_DAYS /
//   SIGNIN_MAKEUP_MESSAGES / SIGNIN_REWARD_SOURCE / SIGNIN_MAKEUP_SOURCE / SIGNIN_KIND_TO_GRANT /
//   SIGNIN_BASE_ITEMS
