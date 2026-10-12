/**
 * 修谱域（Revision Domain）— 逻辑层 · `lib/revision.js`
 *
 * 集合 `jiapu_revisions`：**每树一档**（`_id = <tree_id>`），档体 `{ _id, version, seq, revisions:[…] }`，
 * 档内 `version` 走 `store.mutateDoc` 的 **CAS**（读→纯 mutator→version+1→条件写→读回比对）。
 *
 * 计费模型（Kevin 2026-10-12 拍定 · 逐字实现；**常量写死，无任何后台入口**）：
 *   · `REVISION_EDIT_DAYS = 30` —— 编辑期（自然日向上取整的 `days <= 30`）。
 *   · `REVISION_FEE_START_BAMBOOS = 999` —— **开新一轮恒 999 片**（首轮与后续同价）。
 *   · `REVISION_FEE_LOCKED_EDIT_BAMBOOS = 9999` —— 锁定后**一次保存**（`30 < days < 360`）。
 *   · `REVISION_FEE_LOCKED_LONG_BAMBOOS = 99999` —— 锁定后一次保存（`days >= 360`）。
 *   · 天数口径 = **自然日向上取整**：`days = Math.ceil((now - effective_at) / 86400000)`。
 *   · 档位：`days <= 30` ⇒ `edit_window`（费 0）；`30 < days < 360` ⇒ `locked`（9999）；
 *     `days >= 360` ⇒ `long_locked`（99999）。
 *   · 编辑期内**不限次数修改、只扣开轮那 1 次费用**；锁定后**每次「一次保存提交」扣一次**
 *     （一次调用 = 一次，不论该次提交了几个 kind）。**费用一律不退**（用户侧）。
 *   · **例外（系统原因）**：**落库失败仍原路全额返还**（保留既有 refund 路径）——否则就是收了钱没建记录。
 *
 * 留痕（J · Kevin 2026-10-12 拍定「恢复留痕」，字段口径见下；**旧 `op = 'revision_override'` 口径不复用**）：
 *   · **触发条件** = 本次 `saveRevision` **实际扣了费**（`feePieces > 0`，即锁定后保存）；
 *     **编辑期内（`feePieces === 0`）不写**。
 *   · 写一条 `jiapu_ops_logs`（集合常量 = `economy-ops.OPS_LOGS_COL`，**不新建第二套日志设施**）：
 *     `op = 'revision_locked_edit'` · `tree_id` · `seq` · `operator`（= 操作人手机号）·
 *     `amount_pieces`（= 本次扣费片数）· `tx_id`（= 本次扣费流水号）· `created_at`。
 *   · **体例对齐 `economy-ops.appendOpsLog`**：**每笔一档**（`_id = entry.id`）、`id = opsLogId()`
 *     （`op_<毫秒>_<6 位随机>`）、`ts` = ISO（`opsLogs()` 的**排序键**，同刻倒序）。
 *     ⚠️ 不复用 `appendOpsLog` 本体：它的入参形状被写死为 `{id, ts, operator, target_phone, delta, reason}`
 *     （见其实现），承载不了 `op` / `tree_id` / `seq` / `amount_pieces` / `tx_id` / `created_at`
 *     ⇒ 同体例、同集合、同 `_id` 规则另写一个领域写入函数，**不另开集合、不另开 id 规则**。
 *   · **`tree_steward` 与 `chief_editor` 一律都写**（单一路径，不做特例）。
 *   · **失败不阻断主流程**（best-effort）：日志写入抛错 ⇒ 主流程照常 200、计费与写入结果**一字不变**，
 *     但 `saveRevision` 出参必须带 **`log_warning: true`**（对齐仓内既有 `detail_warning` 体例，不静默）。
 *   · **不变量**：留痕不参与计费、不影响任何写入结果；账单流水（`edit_fee`）与 `jiapu_ops_logs` 是两回事，**都要有**。
 *
 * 权限（F；推翻旧口径）：
 *   · 家族管理员 = **本树** `tree_steward`（按锚点树归属判定，D-1 保留）；`chief_editor` 恒放行。
 *   · **锁定后本树家族管理员付费即可继续修改**（不再需要上级管理员介入）；`chief_editor` 亦按次扣费。
 *     ⇒ **旧「固化后 family admin 403」分支已删除**（`assertRevisionWritable` 不再看 `locked`）；
 *       但 **D-1 越树仍 403**（锚点树 ≠ 目标树）。
 *
 * 作废概念整体取消（G）：不再有 `abort`；间隔计数 **M = 该树已开始的修谱总数（= `seq`）**，
 * 不再按「未作废」过滤。间隔门槛保留（H）：第 M+1 轮最早开始 = 最后一轮 `effective_at` + `intervalFor(M)` 年。
 *
 * 配置键（I）：**保留** `revision_interval_years`（默认 `[1,2,3,5,10]`）；**删除** `revision_fee_bamboos`
 * （键、`wallet.js` 的默认常量与读函数、`index.js` 里 `PUT /admin/wallet-fee` 的对应分支全部删掉）。
 *
 * 错误体：**域名错误码走 `err.code` + `eco.DOMAIN_ERROR_CODES` 白名单**；附加字段（`next_start_at` / `seq`）
 * 走 `err.extra`，由路由 `eco.errorPayload(e, e.extra || {})` 合并回显。**不得另开 `err.expose` 旁路**。
 *
 * 复用既有设施：`store.mutateDoc`（CAS）、`wallet` 的 config 单档读、`economy-fee` 的 FIFO 扣费 / 冲正。
 * **不另写第二套记账 / 第二套权限 / 第二套繁体表。**
 */
import { colGet, getTree, mutateDoc, getApp } from './store.js';
import { ROLE_LEVEL } from './auth.js';
import { getAnchor } from './scope.js';
import {
  WALLET_COL,
  CONFIG_ID,
  DEFAULT_REVISION_INTERVAL_YEARS as WALLET_DEFAULT_REVISION_INTERVAL_YEARS,
  getRevisionIntervalYears,
} from './wallet.js';
import { chargeBamboo, refund } from './economy-fee.js';
import { OPS_LOGS_COL, opsLogId } from './economy-ops.js';
import { S2T_SOURCE, S2T_TARGET } from './s2t-data.js';
import { amountToChineseUpper } from './revision-amount.js';

// ---- 集合 / 常量（冻结口径；路由内禁止写魔法数字） ----

/** 修谱记录集合（每树一档 `_id = tree_id`；须登记进 upload 脚本 COLLECTIONS） */
export const REVISION_COL = 'jiapu_revisions';
/** 编辑期天数（**写死不可配**；固化 = 惰性，读时判定） */
export const REVISION_EDIT_DAYS = 30;
/** 开新一轮恒价（片竹片；首轮与后续同价，**不随任何后台配置变化**） */
export const REVISION_FEE_START_BAMBOOS = 999;
/** 锁定后一次保存价（片竹片；`30 < days < 360`） */
export const REVISION_FEE_LOCKED_EDIT_BAMBOOS = 9999;
/** 锁定后一次保存价（片竹片；`days >= 360`） */
export const REVISION_FEE_LOCKED_LONG_BAMBOOS = 99999;
/** 长期锁定的天数下界（`days >= 360` ⇒ long_locked） */
export const REVISION_LONG_LOCKED_DAYS = 360;
/** 档位枚举 */
export const FEE_TIER_EDIT_WINDOW = 'edit_window';
export const FEE_TIER_LOCKED = 'locked';
export const FEE_TIER_LONG_LOCKED = 'long_locked';
/** 修谱间隔表默认值（年；与 `jiapu_wallets.config.revision_interval_years` 同源；**全站统一**） */
export const DEFAULT_REVISION_INTERVAL_YEARS = WALLET_DEFAULT_REVISION_INTERVAL_YEARS;

/** 业务错误码（**域名错误码一律走 `err.code`**：两码已登记进 `eco.DOMAIN_ERROR_CODES` 白名单，
 *  由路由 `eco.errorPayload(e, e.extra || {})` 统一回显；附加字段（`next_start_at` / `seq`）走 `err.extra`。
 *  **不得再用 `err.expose` 旁路**——错误体只从白名单出码这一条路径。） */
export const ERR_REVISION_ACTIVE = 'REVISION_ACTIVE';
export const ERR_REVISION_COOLDOWN = 'REVISION_COOLDOWN';

/** 内容写入 kind 合法集（`POST /admin/revision/save` 的 `items[].kind`） */
export const REVISION_ITEM_KINDS = ['article', 'helpers', 'donations', 'cover'];

/** 留痕 `op` 值（`jiapu_ops_logs` · 锁定后付费保存；**逐字写死，勿改**） */
export const REVISION_LOCKED_EDIT_OP = 'revision_locked_edit';

const ARTICLE_FIELDS = ['title', 'body', 'signature'];
const ARTICLE_LABEL = { title: '標題', body: '正文', signature: '落款' };
const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MiB（按**解码后字节数**）
const COVER_EXTS = ['jpg', 'png', 'webp'];
const PUNCT_RE = /[,，。.]/g;

// ---- 繁体表（运行时按**码点**对齐建表；表源 = lib/s2t-data.js） ----

const S2T = (() => {
  const map = new Map();
  const sc = Array.from(S2T_SOURCE);
  const tc = Array.from(S2T_TARGET);
  for (let i = 0; i < sc.length && i < tc.length; i += 1) map.set(sc[i], tc[i]);
  return map;
})();

// ---- 错误工厂 ----

/**
 * 造一个业务错误（`status` + 业务文案）。`code` 非空 ⇒ 写 **`err.code`**（域名错误码，须已登记进
 * `eco.DOMAIN_ERROR_CODES` 白名单，由 `eco.errorPayload` 统一出码/回显），并同值挂 `err.revision_code` 便于排查；
 * 附加字段（`next_start_at` / `seq`）挂 **`err.extra`**，路由以 `eco.errorPayload(e, e.extra || {})` 合并。
 * **不得再写 `err.expose`**（旁路已收口：响应体只从白名单出码这一条路径）。
 */
export function revisionError(status, message, code = '', extra = {}) {
  const e = new Error(message);
  e.status = status;
  if (code) {
    e.code = code;
    e.revision_code = code;
    e.extra = { ...extra };
  }
  return e;
}

const toIso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

// ---- 纯函数：时间 / 间隔 / 冷却 / 天数档位 ----

/** 自然年相加（同月同日；ISO 串进出） */
export function addYears(iso, years) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const out = new Date(d.getTime());
  out.setFullYear(out.getFullYear() + Number(years));
  return out.toISOString();
}

/** 天数相加（ISO 串进出） */
export function addDays(iso, days) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + Number(days));
  return out.toISOString();
}

/**
 * 间隔查表（年）：M=1→表[0]、2→表[1]…、M≥表长→表末值；M≤0 → 0（第 1 次无等待门槛）。
 * @param {number} count 已开始的修谱计数 M（= 该树 `seq`，含历史 aborted 记录）
 * @param {number[]} [table] 间隔表（缺省 / 非法 → 默认表）
 */
export function intervalFor(count, table = DEFAULT_REVISION_INTERVAL_YEARS) {
  const t = Array.isArray(table) && table.length ? table : DEFAULT_REVISION_INTERVAL_YEARS;
  const m = Math.floor(Number(count) || 0);
  if (m <= 0) return 0;
  return t[Math.min(m, t.length) - 1];
}

/** 该树全部已开始的修谱（升序、稳定）。**作废概念已取消** ⇒ 不过滤、语义 = 全部（含历史 aborted 档）。 */
export function liveRevisions(revisions) {
  return (revisions || []).filter((r) => r && !r.aborted);
}

/** 该树**全部**已开始的修谱（M 口径；不再按「未作废」过滤）。 */
export function allRevisions(revisions) {
  return (revisions || []).filter(Boolean);
}

/** 该修谱的固化时刻（`effective_at + REVISION_EDIT_DAYS`） */
export function lockAtOf(rev) {
  return addDays(rev?.effective_at, REVISION_EDIT_DAYS);
}

/** 惰性固化判定：`now > effective_at + 30d` ⇒ 已锁（等价于自然日向上取整的 `days >= 31`） */
export function isLocked(rev, now = new Date()) {
  if (!rev || !rev.effective_at) return false;
  return toIso(now) > lockAtOf(rev);
}

/**
 * 天数口径 = **自然日向上取整**：`days = Math.ceil((now - effective_at) / 86400000)`。
 * `effective_at` 不可解析 ⇒ 0。
 */
export function daysOf(rev, now = new Date()) {
  const eff = rev?.effective_at ? new Date(rev.effective_at).getTime() : NaN;
  if (!Number.isFinite(eff)) return 0;
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.ceil((t - eff) / 86400000);
}

/** 档位：`days <= 30` ⇒ edit_window；`30 < days < 360` ⇒ locked；`days >= 360` ⇒ long_locked。 */
export function feeTierOf(days) {
  const d = Number(days);
  const n = Number.isFinite(d) ? d : 0;
  if (n <= REVISION_EDIT_DAYS) return FEE_TIER_EDIT_WINDOW;
  if (n < REVISION_LONG_LOCKED_DAYS) return FEE_TIER_LOCKED;
  return FEE_TIER_LONG_LOCKED;
}

/** 下一次保存要扣的金额（片竹片）：编辑期内 0、locked 9999、long_locked 99999。 */
export function feeNextBamboosOf(tier) {
  if (tier === FEE_TIER_LOCKED) return REVISION_FEE_LOCKED_EDIT_BAMBOOS;
  if (tier === FEE_TIER_LONG_LOCKED) return REVISION_FEE_LOCKED_LONG_BAMBOOS;
  return 0;
}

/** 惰性固化档位（对某一轮）：`{ days, fee_tier, fee_next_bamboos, locked }` */
export function tierOfRevision(rev, now = new Date()) {
  const days = daysOf(rev, now);
  const fee_tier = feeTierOf(days);
  return { days, fee_tier, fee_next_bamboos: feeNextBamboosOf(fee_tier), locked: days > REVISION_EDIT_DAYS };
}

/** 最后一次修谱（全部记录的最后一条） */
export function lastRevision(revisions) {
  const all = allRevisions(revisions);
  return all.length ? all[all.length - 1] : null;
}

/** 兼容别名（旧调用点）：最后一次「未作废」修谱 —— 作废已取消 ⇒ 语义 = 最后一条。 */
export function lastLiveRevision(revisions) {
  return lastRevision(revisions);
}

/** **进行中**的修谱 = 最后一条修谱且**仍在编辑期内**（未固化）；无 ⇒ null。
 *  用于 `start` 的 409 `REVISION_ACTIVE` 闸门（固化后的轮次不算「进行中」，其间隔门槛改看冷却）。 */
export function activeRevision(revisions, now = new Date()) {
  const last = lastRevision(revisions);
  return last && !isLocked(last, now) ? last : null;
}

/**
 * 可否开始下一次修谱（纯函数）：
 * `{ ok, reason, next_start_at }`。**M = 该树已开始的修谱总数（全部记录条数 = `seq`）**；
 * 无记录 ⇒ `{ ok:true, reason:'first', next_start_at:'' }`；
 * 冷却未到 ⇒ `{ ok:false, reason:'cooldown', next_start_at }`。
 */
export function canStartRevision({ revisions = [], now = new Date(), intervalYears = DEFAULT_REVISION_INTERVAL_YEARS } = {}) {
  const all = allRevisions(revisions);
  if (!all.length) return { ok: true, reason: 'first', next_start_at: '' };
  const last = all[all.length - 1];
  const next = addYears(last.effective_at, intervalFor(all.length, intervalYears));
  if (toIso(now) >= next) return { ok: true, reason: '', next_start_at: '' };
  return { ok: false, reason: 'cooldown', next_start_at: next };
}

// ---- 纯函数：繁体校验 / 标点清洗 ----

/** 第一个简体字（无 ⇒ ''）：逐码点，`char` 在表中且 `s2t[char] !== char` ⇒ 简体 */
export function firstSimplifiedChar(text) {
  for (const ch of String(text == null ? '' : text)) {
    const t = S2T.get(ch);
    if (t !== undefined && t !== ch) return ch;
  }
  return '';
}

/** 繁体断言：命中简体 ⇒ 400「族務紀文須以繁體字錄入」（指出首个简体字） */
export function assertTraditional(text) {
  const ch = firstSimplifiedChar(text);
  if (ch) throw revisionError(400, `族務紀文須以繁體字錄入（首個簡體字：${ch}）`);
}

/** 标点清洗：`[:,，。.]` → 空格 + 连续空格折叠为一（其余标点保留）+ 去首尾空白 */
export function cleanArticleText(s) {
  return String(s == null ? '' : s)
    .replace(PUNCT_RE, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

/** 族務紀文三字段归一并校验（全须繁体 + 均不得为空） */
export function normalizeArticle(payload) {
  const p = payload || {};
  const out = {};
  for (const k of ARTICLE_FIELDS) {
    const raw = p[k];
    if (typeof raw !== 'string' || !raw.trim()) throw revisionError(400, `${ARTICLE_LABEL[k]}不得為空`);
    assertTraditional(raw); // 逐字：命中简体 ⇒ 400 + 首个简体字
    out[k] = cleanArticleText(raw);
    if (!out[k]) throw revisionError(400, `${ARTICLE_LABEL[k]}不得為空`); // 清洗后为空（如仅标点）同样 400
  }
  return out;
}

const nodeExists = (tree, handle) => !!(tree && tree.people && tree.people[handle]);

/** helpers 归一（全量替换语义；person_handle 必填且必须存在于本树，duty 必填非空） */
export function normalizeHelpers(payload, tree) {
  if (!Array.isArray(payload)) throw revisionError(400, '族務協助者須為陣列');
  return payload.map((it, i) => {
    const h = String(it?.person_handle || '').trim();
    const duty = String(it?.duty || '').trim();
    if (!h) throw revisionError(400, `第 ${i + 1} 位協助者缺少 person_handle`);
    if (!nodeExists(tree, h)) throw revisionError(400, `第 ${i + 1} 位協助者的節點不存在於本樹：${h}`);
    if (!duty) throw revisionError(400, `第 ${i + 1} 位協助者職責不得為空`);
    return { person_handle: h, duty };
  });
}

/** donations 归一（全量替换语义；person_handle 同上，amount 必填正整数·单位元） */
export function normalizeDonations(payload, tree) {
  if (!Array.isArray(payload)) throw revisionError(400, '族務捐輸須為陣列');
  return payload.map((it, i) => {
    const h = String(it?.person_handle || '').trim();
    if (!h) throw revisionError(400, `第 ${i + 1} 筆捐輸缺少 person_handle`);
    if (!nodeExists(tree, h)) throw revisionError(400, `第 ${i + 1} 筆捐輸的節點不存在於本樹：${h}`);
    const amount = Number(it?.amount);
    if (!Number.isInteger(amount) || amount <= 0) throw revisionError(400, `第 ${i + 1} 筆捐輸金額須為正整數（元）`);
    return { person_handle: h, amount };
  });
}

/** 依 person_handle 反查本树人物姓名；解析不到 ⇒ `（節點已刪除）` */
export function resolveName(tree, handle) {
  const p = tree?.people?.[handle];
  return (p && p.name) || '（節點已刪除）';
}

/** helpers 出参装饰（补 `name`） */
export function decorateHelpers(helpers, tree) {
  return (helpers || []).map((h) => ({ person_handle: h.person_handle, duty: h.duty, name: resolveName(tree, h.person_handle) }));
}

/** donations 出参装饰（补 `name` + `amount_text` = 繁体汉字大写） */
export function decorateDonations(donations, tree) {
  return (donations || []).map((d) => ({
    person_handle: d.person_handle,
    amount: d.amount,
    name: resolveName(tree, d.person_handle),
    amount_text: amountToChineseUpper(d.amount),
  }));
}

// ---- 权限单一入口 ----

/**
 * 修谱写权限（**唯一入口**；路由不得另写一套）：
 * ① `level < tree_steward` ⇒ 403（guest / user / branch_curator 一律拒）；
 * ② `tree_steward` ⇒ **仅本树主理人**才放行（判据 = 本人锚点树 === 目标 `treeId`），否则 403；
 *    `chief_editor` 恒放行（任意树）。
 * 返回实际生效角色（`'chief_editor'` | `'tree_steward'`）。
 *
 * ⚠️ **固化后不再 403**（F · Kevin 2026-10-12 拍定）：锁定后本树家族管理员**付费即可继续修改**，
 * 不再需要上级管理员介入；`chief_editor` 同样按次扣费（单一计费路径、不做特例）。
 * ⇒ 本函数**不看 `locked`**（旧 `if (locked && role !== 'chief_editor') 403` 分支已删除），
 *   **但保留 D-1 的树归属校验**（越树 tree_steward 一律 403）。
 *
 * 判据取舍（D-1）：以 `economy-ops.spiritRecipients` 的既有写法为准 ——
 * 「`tree_steward` **且** 本人锚点树 === 本树」。**不复用 `economy-spirit.isTreeMember`**：
 * 后者是「**成员**」口径（任何锚点在本树的登录用户都算），会把普通 `user` 成员也放行。
 * 锚点读取走 `scope.getAnchor(phone)`（单档只读；**不自扫全表**）。
 */
export async function assertRevisionWritable({ role, treeId = '', phone = '' } = {}) {
  const level = ROLE_LEVEL[role] ?? 0;
  if (level < ROLE_LEVEL.tree_steward) {
    throw revisionError(403, '修譜僅限本族家族管理員（tree_steward）或上級管理員（chief_editor）');
  }
  // ② 本树归属：家族管理员 = **本树**主理人（`chief_editor` 不在此判据内 ⇒ 恒放行，任意树）
  if (role !== 'chief_editor') {
    const id = String(treeId || '').trim();
    const anchor = phone ? await getAnchor(phone) : null;
    if (!id || !anchor || String(anchor.tree_id || '').trim() !== id) {
      throw revisionError(403, '修譜僅限本族家族管理員（tree_steward）可修訂本族族譜');
    }
  }
  return role === 'chief_editor' ? 'chief_editor' : 'tree_steward';
}

// ---- 存储读写 ----

/** 读该树修谱档（剥离存储元字段；不存在 ⇒ `{ seq:0, revisions:[] }`）
 *  ⚠️ **只容错读**（口径同 `lib/tree-activity.js`）：集合缺失（云端尚未创建）/ 读取抛错 ⇒ 返回空档、绝不抛 ——
 *  修谱记录是 `GET /revisions` 的附属读，不得因集合未就绪把主路由打成 500。写路径**不在此列**（见 `writeRevisions`）。 */
export async function loadRevisions(treeId) {
  try {
    const doc = await colGet(REVISION_COL, String(treeId));
    return {
      seq: Number(doc?.seq) || 0,
      revisions: Array.isArray(doc?.revisions) ? doc.revisions : [],
    };
  } catch {
    return { seq: 0, revisions: [] };
  }
}

/** 以 CAS 写回该树修谱档（mutator 收到 `{ seq, revisions }`，须返回同形对象）。
 *  写路径**不容错**：集合尚未创建 / 不可写（部署步骤）⇒ **仍失败**（绝不静默成功），但把底层
 *  SDK / 文件系统原文归一为一句可读文案（503「修譜集合尚未就緒」）——不裸泄实现细节；
 *  带 `status` 的业务错误（mutator 内若抛出）原样上抛。 */
async function writeRevisions(treeId, mutator) {
  const id = String(treeId);
  let written;
  try {
    written = await mutateDoc(REVISION_COL, id, async (doc) => {
      const rec = { seq: Number(doc?.seq) || 0, revisions: Array.isArray(doc?.revisions) ? doc.revisions : [] };
      const next = await mutator(rec);
      if (!next || typeof next !== 'object' || !Array.isArray(next.revisions)) {
        throw new Error('[revision] mutator 必须返回 { seq, revisions }');
      }
      return { _id: id, seq: Number(next.seq) || 0, revisions: next.revisions };
    });
  } catch (e) {
    if (e && e.status) throw e;
    throw revisionError(503, '修譜集合尚未就緒，請稍後重試');
  }
  return { seq: Number(written?.seq) || 0, revisions: Array.isArray(written?.revisions) ? written.revisions : [] };
}

// ---- 云存储（图片） ----

function cloudApp() {
  return getApp();
}

async function cloudUpload(cloudPath, buffer) {
  const r = await cloudApp().uploadFile({ cloudPath, fileContent: buffer });
  if (!r?.fileID) throw new Error('雲存儲上傳未返回 fileID');
  return r.fileID;
}

async function cloudDelete(fileID) {
  if (!fileID) return;
  await cloudApp().deleteFile({ fileID });
}

/** 换临时链（失败 → ''，绝不因此让读接口 500） */
async function coverTempUrl(fileID) {
  if (!fileID) return '';
  try {
    const r = await cloudApp().getTempFileURL({ fileList: [fileID] });
    const f = (r?.fileList || [])[0];
    return f?.tempFileURL || '';
  } catch {
    return '';
  }
}

/** base64 解码（严格：字符集 + 长度 + 非空；失败 ⇒ 400；返回 Buffer） */
function decodeBase64(dataBase64) {
  const s = String(dataBase64 == null ? '' : dataBase64).trim();
  if (!s) throw revisionError(400, '缺少圖片數據 data_base64');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4 !== 0) {
    throw revisionError(400, '圖片數據不是合法的 base64');
  }
  return Buffer.from(s, 'base64');
}

/** 封面 payload 预校验（**纯函数 · 不触云存储**）：`{ ext, data_base64 }` → `{ ext, buffer }` */
function normalizeCover(payload) {
  const e = String(payload?.ext || '').toLowerCase().replace(/^\./, '').trim();
  if (!COVER_EXTS.includes(e)) throw revisionError(400, '封面僅支援 jpg / png / webp');
  const buf = decodeBase64(payload?.data_base64);
  if (buf.length > MAX_COVER_BYTES) throw revisionError(400, '封面圖片不得超過 2 MiB');
  if (buf.length === 0) throw revisionError(400, '封面圖片為空');
  return { ext: e, buffer: buf };
}

// ---- 后台配置写（写入口 = 既有 PUT /admin/wallet-fee；载体 `jiapu_wallets.config`） ----

/** 设置修谱间隔表（非空正整数数组；非法 → 抛错，路由回 400）。
 *  ⚠️ 修谱费（`revision_fee_bamboos`）**已整体删除**（I · Kevin 2026-10-12 拍定）：开轮恒 999、
 *  锁定档 9999/99999 一律**常量写死**，无任何后台入口。 */
export async function setRevisionIntervalYears(arr) {
  if (!Array.isArray(arr) || !arr.length) throw revisionError(400, '修譜間隔表必須為非空數組（年）');
  const ok = arr.every((v) => Number.isFinite(Number(v)) && Number(v) > 0 && Math.floor(Number(v)) === Number(v));
  if (!ok) throw revisionError(400, '修譜間隔表每項必須為正整數（年）');
  const table = arr.map((v) => Number(v));
  await mutateDoc(WALLET_COL, CONFIG_ID, (doc) => {
    const rec = { ...(doc || {}) };
    delete rec._id;
    delete rec.version;
    rec.revision_interval_years = table;
    return rec;
  });
  return table;
}

// ---- 留痕（锁定后付费保存 · best-effort） ----

/**
 * 写一条**锁定后付费保存**留痕到 `jiapu_ops_logs`（集合常量取自 `economy-ops.OPS_LOGS_COL`）。
 *
 * **体例对齐既有 `appendOpsLog`**（同集合、**每笔一档**、`_id = entry.id`、`id = opsLogId()` =
 * `op_<毫秒>_<6 位随机>`、`ts` = ISO 且为 `GET /admin/assets/logs` 的**排序键**）；
 * 领域字段逐字为 `op / tree_id / seq / operator / amount_pieces / tx_id / created_at`。
 * （`ts === created_at`：同一次留痕只有一个时刻，排序键与业务时刻同源，避免两套时间。）
 *
 * ⚠️ 本函数**只负责写**：失败处理（不阻断主流程 + `log_warning`）在 `saveRevision` 内，
 * 调用方若直接用本函数，**必须自行决定**是否吞错 —— 但**绝不允许静默**。
 *
 * @param {{treeId:string, seq:number, phone:string, amountPieces:number, txId:string, now?:Date}} p
 * @returns {Promise<object>} 已落盘的日志条目（含 `id` / `ts`）
 */
export async function writeRevisionLockedEditLog({ treeId, seq, phone, amountPieces, txId, now = new Date() } = {}) {
  const created_at = toIso(now);
  const entry = {
    id: opsLogId(), // 「每笔一档」⇒ 单次调用只产生一个 id（冲突重放不会重复记账）
    ts: created_at, // 排序键（对齐 `opsLogs()` 的 ts 倒序 · 同刻按下标倒序）
    op: REVISION_LOCKED_EDIT_OP,
    tree_id: String(treeId ?? ''),
    seq: Number(seq),
    operator: String(phone ?? ''),
    amount_pieces: Number(amountPieces),
    tx_id: String(txId ?? ''),
    created_at,
  };
  await mutateDoc(OPS_LOGS_COL, entry.id, () => entry); // 每笔一档：写入即该条日志自身（同 appendOpsLog）
  return entry;
}

// ---- 编排：开始 / 保存（唯一内容写入口） ----

/**
 * 开始一次修谱（校验顺序：① 权限 ② 进行中 409 ③ 冷却 409 ④ 预扣 **999** ⑤ 落记录）。
 * @returns {Promise<{ok:true, seq:number, effective_at:string, lock_at:string, fee:{pieces:number,tx_id:string}, revision:object}>}
 */
export async function startRevision({ treeId, phone, role, now = new Date(), intervalYears } = {}) {
  const id = String(treeId || '').trim();
  if (!id) throw revisionError(400, '缺少 tree_id');
  // ① 权限
  await assertRevisionWritable({ role, treeId: id, phone });
  const nowIso = toIso(now);
  const interval = intervalYears || (await getRevisionIntervalYears());
  const feePieces = REVISION_FEE_START_BAMBOOS; // 开新一轮**恒价**（首轮与后续同价）

  const base = await loadRevisions(id);
  // ② 进行中（编辑期内的轮次未结束 ⇒ 不可再开新一轮）
  const active = activeRevision(base.revisions, now);
  if (active) throw revisionError(409, `已有進行中的修譜（第 ${active.seq} 次），請於其固化後再開新一輪`, ERR_REVISION_ACTIVE, { seq: active.seq });
  // ③ 冷却（M = 该树已开始的修谱总数；最终轮 effective_at + intervalFor(M) 年）
  const cs = canStartRevision({ revisions: base.revisions, now, intervalYears: interval });
  if (!cs.ok) {
    throw revisionError(409, `冷卻期未到，最早可於 ${cs.next_start_at} 開始下一次修譜`, ERR_REVISION_COOLDOWN, { next_start_at: cs.next_start_at });
  }
  // ④ 预扣（FIFO 片竹简；不足 ⇒ 409 ASSET_INSUFFICIENT，整单不扣不落）
  const expectedSeq = base.seq + 1;
  const charged = await chargeBamboo(phone, feePieces, {
    op: 'person_update',
    tx_type: 'edit_fee',
    tree_id: id,
    desc: `修譜開輪預扣（第 ${expectedSeq} 次，扣 ${feePieces} 片竹片）`,
  });
  // ⑤ 落记录（CAS；seq 在 mutator 内基于最新档自增，冲突重放安全）
  let saved = null;
  const revisionTemplate = {
    started_at: nowIso,
    effective_at: nowIso,
    locked_at: null,
    cover: null,
    article: null,
    helpers: [],
    donations: [],
    content_updated_at: null,
    fee_ref: { txn_id: charged.txn_id, unit: 'bamboos', pieces: feePieces, paid_by: phone, charged_at: nowIso, lots: charged.spent },
  };
  try {
    const written = await writeRevisions(id, (rec) => {
      const seq = (Number(rec.seq) || 0) + 1;
      const rev = { seq, ...revisionTemplate };
      saved = rev;
      return { seq, revisions: [...rec.revisions, rev] };
    });
    saved = written.revisions[written.revisions.length - 1] || saved;
  } catch (e) {
    // 落库失败 ⇒ 原路全额返还（系统原因的唯一例外；best-effort，绝不掩盖原始错误）
    try {
      await refund(phone, charged.spent, { unit: 'bamboos', txn_id: charged.txn_id, tree_id: id, reason: '修譜落庫失敗，已原路返還' });
    } catch {
      /* best-effort */
    }
    throw e;
  }
  return {
    ok: true,
    seq: saved.seq,
    effective_at: saved.effective_at,
    lock_at: lockAtOf(saved),
    fee: { pieces: feePieces, tx_id: charged.txn_id },
    revision: saved,
  };
}

/**
 * **唯一内容写入口**（`POST /admin/revision/save`）—— 取代旧的 `content` + `image` 两条路由。
 *
 * 入参 `items: [{ kind, payload }, …]`：
 *   · `items` 必须为**非空数组**（空 / 非数组 ⇒ 400）；
 *   · `kind ∈ 'article' | 'helpers' | 'donations' | 'cover'`（不合法 ⇒ 400）；
 *   · **计费：一次调用 = 一次**（不论 items 长度）：`days <= 30` ⇒ **0 片**；
 *     否则扣 `fee_next_bamboos`（9999 / 99999）；不足 ⇒ 409 `ASSET_INSUFFICIENT` 且**整单不写**；
 *     扣费成功但写入失败 ⇒ **原路返还**（系统原因例外）。
 *   · `cover` 项：`payload = {ext, data_base64}`（≤2 MiB、jpg/png/webp）；替换时**先传新成功再删旧 fileID**。
 *
 * 留痕（J）：本次**实际扣费**（`feePieces > 0`，即锁定后保存）⇒ 主写成功后 best-effort 写一条
 * `jiapu_ops_logs`（`op='revision_locked_edit'`，见 `writeRevisionLockedEditLog`）；**编辑期内 0 费不写**。
 * 留痕失败**不阻断**（主流程照常 200、计费/写入结果一字不变），但出参带 **`log_warning:true`**（不静默）。
 *
 * @returns {Promise<{ok:true, seq:number, locked:boolean, fee:{pieces:number,tx_id:string}, items:Array<{kind:string}>,
 *   revision:object, log_warning?:true}>} `log_warning` **仅在留痕写入失败时出现**（值恒 `true`）
 */
export async function saveRevision({ treeId, seq, items, role, phone, now = new Date() } = {}) {
  const id = String(treeId || '').trim();
  if (!id) throw revisionError(400, '缺少 tree_id');
  const targetSeq = Number(seq);
  if (!Number.isFinite(targetSeq) || targetSeq <= 0) throw revisionError(400, '缺少 seq');
  // items 结构校验（**先于扣费**：非法输入绝不扣款）
  if (!Array.isArray(items) || !items.length) throw revisionError(400, '修譜內容不得為空（items 須為非空數組）');
  const plans = items.map((it) => {
    const kind = String(it?.kind || '').trim();
    if (!REVISION_ITEM_KINDS.includes(kind)) {
      throw revisionError(400, `修譜內容類型不合法（article / helpers / donations / cover）`);
    }
    return { kind, payload: it ? it.payload : undefined };
  });

  const base = await loadRevisions(id);
  const target = base.revisions.find((r) => Number(r.seq) === targetSeq);
  // 权限（唯一入口）：**本树归属**先于 404 / 400 —— 越树 tree_steward 一律 403（D-1 保留）
  await assertRevisionWritable({ role, treeId: id, phone });
  if (!target) throw revisionError(404, `找不到第 ${targetSeq} 次修譜`);

  const tree = await getTree(id);
  if (!tree) throw revisionError(400, `家族樹不存在：${id}`);

  // 内容预校验（纯函数 · 不触云存储、不扣费）：任一 kind 非法 ⇒ 400，整单不写不扣
  const prepared = plans.map((p) => {
    if (p.kind === 'article') return { kind: 'article', value: { ...normalizeArticle(p.payload), updated_at: toIso(now) } };
    if (p.kind === 'helpers') return { kind: 'helpers', value: normalizeHelpers(p.payload, tree) };
    if (p.kind === 'donations') return { kind: 'donations', value: normalizeDonations(p.payload, tree) };
    return { kind: 'cover', value: normalizeCover(p.payload) }; // cover：解码 + 尺寸/格式校验
  });

  // 档位 / 计费（一次调用 = 一次，不论 items 长度）
  const tier = tierOfRevision(target, now);
  const feePieces = tier.fee_next_bamboos;
  let charged = null;
  if (feePieces > 0) {
    // 不足 ⇒ 409 ASSET_INSUFFICIENT（整单不写）；价格来自常量，无后台入口
    charged = await chargeBamboo(phone, feePieces, {
      op: 'person_update',
      tx_type: 'edit_fee',
      tree_id: id,
      desc: `修譜保存（第 ${targetSeq} 次，鎖定後扣 ${feePieces} 片竹片）`,
    });
  }

  try {
    const nowIso = toIso(now);
    const patch = { content_updated_at: nowIso };
    let newCover = null;
    for (const p of prepared) {
      if (p.kind === 'cover') {
        // 先传新成功……
        const fileID = await cloudUpload(`revisions/${id}/${targetSeq}/cover.${p.value.ext}`, p.value.buffer);
        const oldFileID = target.cover?.fileID || '';
        // ……再删旧（best-effort：删旧失败不掩盖本次上传成功）
        if (oldFileID && oldFileID !== fileID) {
          try {
            await cloudDelete(oldFileID);
          } catch {
            /* best-effort */
          }
        }
        newCover = { fileID, ext: p.value.ext, width: null, height: null, updated_at: nowIso };
        patch.cover = newCover;
      } else if (p.kind === 'article') {
        patch.article = p.value;
      } else {
        patch[p.kind] = p.value;
      }
    }

    const written = await writeRevisions(id, (rec) => ({
      seq: Number(rec.seq) || 0,
      revisions: rec.revisions.map((r) => (Number(r.seq) === targetSeq ? { ...r, ...patch } : r)),
    }));
    const revision = written.revisions.find((r) => Number(r.seq) === targetSeq) || target;
    const out = {
      ok: true,
      seq: targetSeq,
      locked: tier.locked,
      fee: { pieces: feePieces, tx_id: charged ? charged.txn_id : '' },
      items: prepared.map((p) => ({ kind: p.kind })),
      revision,
    };
    // 留痕（**仅本次实际扣费** ⇒ 锁定后保存；编辑期内 0 费**不写**）：
    //   刻意放在主写**成功之后**、且用**独立 try/catch** ——
    //   ① 不会被上面那段「扣费后写入失败 ⇒ 原路返还」捕获（否则日志失败会误退已收费用）；
    //   ② 日志失败不回滚已落盘内容、不改变计费与写入结果（best-effort），但**绝不静默** ⇒ 出参 `log_warning:true`。
    //   `tree_steward` 与 `chief_editor` 同一路径（无特例）。
    if (feePieces > 0) {
      try {
        await writeRevisionLockedEditLog({ treeId: id, seq: targetSeq, phone, amountPieces: feePieces, txId: out.fee.tx_id, now });
      } catch {
        out.log_warning = true; // 体例对齐仓内 `detail_warning`：失败才出键、值恒 true
      }
    }
    return out;
  } catch (e) {
    // 扣费成功但写入失败 ⇒ 原路返还（系统原因例外；best-effort，绝不掩盖原始错误）
    if (charged && charged.txn_id) {
      try {
        await refund(phone, charged.spent, { unit: 'bamboos', txn_id: charged.txn_id, tree_id: id, reason: '修譜保存落庫失敗，已原路返還' });
        e.fee_refunded = true;
      } catch {
        /* best-effort */
      }
    }
    throw e;
  }
}

// ---- 读组装（GET /revisions） ----

/**
 * 公开只读视图（**无需 X-Tree-Id**）。无记录 ⇒ 全部空数组 / `active:null` / `can_start.ok=true`。
 * 出参逐字对齐冻结契约（改造后：**删除旧键 `fee_bamboos`**；新增 `days` / `fee_tier` / `fee_next_bamboos`；
 * `editable` **恒 true**）。
 */
export async function getRevisionView(treeId, now = new Date()) {
  const id = String(treeId || '').trim();
  if (!id) throw revisionError(400, '缺少 tree_id');
  const nowIso = toIso(now);
  const [interval, tree, base] = await Promise.all([getRevisionIntervalYears(), getTree(id), loadRevisions(id)]);

  const decorate = async (r) => {
    const tier = tierOfRevision(r, now);
    return {
      seq: Number(r.seq),
      effective_at: r.effective_at || '',
      locked_at: tier.locked ? lockAtOf(r) : null,
      days: tier.days,
      fee_tier: tier.fee_tier,
      fee_next_bamboos: tier.fee_next_bamboos,
      cover: r.cover ? { ...r.cover, url: await coverTempUrl(r.cover.fileID) } : null,
      article: r.article || null,
      helpers: decorateHelpers(r.helpers, tree),
      donations: decorateDonations(r.donations, tree),
    };
  };

  const revisions = [];
  for (const r of base.revisions) revisions.push(await decorate(r));

  // active = 当前轮次（**锁后仍为可写** ⇒ 非 null，且带 days / fee_tier / fee_next_bamboos）；
  // 无记录 ⇒ null。`editable` 恒 true（本树管理员付费即可写、chief 亦可）。
  const current = lastRevision(base.revisions);
  let active = null;
  if (current) {
    const d = await decorate(current);
    active = {
      seq: d.seq,
      effective_at: d.effective_at,
      lock_at: lockAtOf(current),
      editable: true,
      days: d.days,
      fee_tier: d.fee_tier,
      fee_next_bamboos: d.fee_next_bamboos,
      cover: d.cover,
      article: d.article,
      helpers: d.helpers,
      donations: d.donations,
    };
  }

  return {
    ok: true,
    tree_id: id,
    now: nowIso,
    edit_days: REVISION_EDIT_DAYS,
    fee_start_bamboos: REVISION_FEE_START_BAMBOOS,
    fee_locked_edit_bamboos: REVISION_FEE_LOCKED_EDIT_BAMBOOS,
    fee_locked_long_bamboos: REVISION_FEE_LOCKED_LONG_BAMBOOS,
    interval_years: interval,
    seq: base.seq,
    can_start: canStartRevision({ revisions: base.revisions, now, intervalYears: interval }),
    active,
    revisions,
  };
}
