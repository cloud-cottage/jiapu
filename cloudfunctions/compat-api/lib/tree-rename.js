/**
 * 谱名改名域（Tree Rename Domain）— 逻辑层 · `lib/tree-rename.js`
 *
 * 把「谱名（`genealogy_name`）」从通用「编辑家族信息」写入路径（`PUT /tree-meta`）里**拆出来**，
 * 改为**专用计费路由** `POST /admin/tree-rename`，按「距上次改名的时长」阶梯收费。
 *
 * ── 计费矩阵（Kevin 2026-10-12 拍定 · **逐字实现，常量单点定义在本文件，每行标「一句话可改」**）──
 *   Δ = `now - 上次谱名修改时刻`（`genealogy_name_updated_at`；历史形态缺失 ⇒ 视为「首次」）；
 *   天数口径与修谱体例一致：**自然日向上取整** `days = Math.ceil(Δ / 86400000)`。
 *
 *   · **首次（无历史）或 `days >= 360`** ⇒ **999 片**（`tier = 'first_or_expired'`）
 *   · **`30 <= days < 360`**        ⇒ **9999 片**（`tier = 'within_360d'`）
 *   · **`days < 30`**               ⇒ **99999 片**（`tier = 'within_30d'`）
 *
 *   · **费用一律不退**（用户侧）；**唯一例外 = 系统落库失败** ⇒ 原路全额返还（与修谱口径同）。
 *   · 竹片不足 ⇒ **409 `ASSET_INSUFFICIENT`**（带 `need` / `current` / `unit:'bamboos'` / `how_to_get`），
 *     **整单拒绝、不写元数据**（校验全过、扣费成功之后才写 —— 不得先写后扣）。
 *   · 扣费**复用既有竹片计费机器**（`lib/economy-fee.js` 的 `chargeBamboo` / `refund`），
 *     流水类型沿用既有 **`edit_fee`**（**不新增 `Tx.type`**）。
 *
 * ── 写面 ──
 *   · 经 `store.mutateTreeMeta(tree_id, …)` 写 `genealogy_name` + 新增字段
 *     **`genealogy_name_updated_at = now(ISO)`**（一次成功改名同时推进这两个字段）。
 *   · **`no-op`（与现值相同）⇒ 200 且 `fee.pieces = 0`**：不扣、不写、不记流水、
 *     **不更新 `genealogy_name_updated_at`**（沿用仓内既有 no-op 0 片先例）。
 *
 * ── 留痕（`jiapu_ops_logs`）──
 *   · **实扣**（`pieces > 0`）⇒ 写一条（`op = 'tree_rename_fee'`，字段逐字
 *     `tree_id` / `operator` / `amount_pieces` / `tx_id` / `created_at`）；**no-op 不写**。
 *   · 体例对齐 `lib/revision.js` 的 `writeRevisionLockedEditLog` 与 `economy-ops.appendOpsLog`：
 *     **每笔一档**（`_id = entry.id`）、`id = opsLogId()`、`ts` = ISO（`opsLogs()` 的排序键）。
 *     不复用 `appendOpsLog` 本体：它的入参形状写死为 `{id, ts, operator, target_phone, delta, reason}`，
 *     承载不了本域的 `op` / `tree_id` / `amount_pieces` / `tx_id` / `created_at` ⇒
 *     **同集合、同 `_id` 规则、另写一个领域写入函数**（不另开集合、不另开 id 规则）。
 *   · 留痕写入失败 **不阻断** 主流程（best-effort）：主流程照常 200、计费与写入结果一字不变，
 *     但出参必须带 **`log_warning: true`**（对齐仓内既有 `detail_warning` 体例，**不静默**）。
 *
 * ── 权限（**不另写第二套权限**）──
 *   判据 = 本树 `tree_steward` 及以上（**必须按「本树主理人」锚点归属判定**）+ `chief_editor` 恒放行。
 *   本文件**整份复用** `lib/revision.js` 的 `assertRevisionWritable`（仓内该判据的唯一实现：
 *   `scope.getAnchor(phone).tree_id === treeId`，越树 `tree_steward` 一律 403）
 *   —— 本域只把 403 文案替换为谱名域的措辞，**判据一字不改**（不存在第二套锚点查询 / 第二套档位表）。
 *
 * ── 通用更新路由的收口（在 `index.js` 内实现，本文件提供判据）──
 *   `PUT /tree-meta` 携带 `genealogy_name` 且**与现值不同** ⇒ **400**（文案 `請使用【修改譜名】修改譜名`）；
 *   与其值**相同** ⇒ **忽略**（不报错）。其余字段行为一字不改。
 *
 * ── 读面（只增不改）──
 *   `GET /tree-meta` 每树 entry 新增 `genealogy_name_updated_at`（ISO 或 `null`）与
 *   `rename_fee_pieces`（**服务端按同一矩阵算出的纯函数结果**；无历史 ⇒ 999）——
 *   供前端直接显示价格，**前端不得自行重算档位**（判据 = `decorateTreeMetaForRead`）。
 */
import { getMeta, mutateTreeMeta, mutateDoc } from './store.js';
import { chargeBamboo, refund } from './economy-fee.js';
import { OPS_LOGS_COL, opsLogId } from './economy-ops.js';
import { assertRevisionWritable } from './revision.js';

// ==================== 常量（**单点定义**；改价 / 改档只动这里，每行「一句话可改」）====================

/** 谱名 meta 字段名（写入面 + 读面共用一个字面，勿散写） */
export const GENEALOGY_NAME_KEY = 'genealogy_name';
/** 谱名「上次修改时刻」字段名（新增字段；ISO 串） */
export const GENEALOGY_NAME_UPDATED_AT = 'genealogy_name_updated_at';
/** 读面派生价目字段名（`GET /tree-meta` 每树 entry 新增） */
export const RENAME_FEE_PIECES_KEY = 'rename_fee_pieces';

/** 首次（无历史）或 `days >= TREE_RENAME_EXPIRED_DAYS` 的价（片） —— 一句话可改 */
export const TREE_RENAME_FEE_FIRST_OR_EXPIRED = 999;
/** `30 <= days < 360` 的价（片） —— 一句话可改 */
export const TREE_RENAME_FEE_WITHIN_360D = 9999;
/** `days < 30` 的价（片） —— 一句话可改 */
export const TREE_RENAME_FEE_WITHIN_30D = 99999;
/** 「过期档」天数下界：`days >= 360` ⇒ 视同首次（999） —— 一句话可改 */
export const TREE_RENAME_EXPIRED_DAYS = 360;
/** 「近改档」天数下界：`days < 30` ⇒ 最贵档（99999） —— 一句话可改 */
export const TREE_RENAME_WITHIN_30D_MAX_DAYS = 30;
/** 谱名长度上限（**按码点计**，与本仓批量续编 `MAX_BATCH_NAME_LEN` 同口径） —— 一句话可改 */
export const TREE_RENAME_MAX_NAME_LEN = 30;

/** 档位枚举（**逐字写死，与出参契约一字不差**） */
export const TREE_RENAME_TIER_FIRST_OR_EXPIRED = 'first_or_expired';
export const TREE_RENAME_TIER_WITHIN_360D = 'within_360d';
export const TREE_RENAME_TIER_WITHIN_30D = 'within_30d';

/** 留痕 `op` 值（`jiapu_ops_logs` · **逐字写死，勿改**） */
export const TREE_RENAME_OP = 'tree_rename_fee';

/** 扣费流水类型（**沿用既有 `edit_fee`，不新增 `Tx.type`**） */
export const TREE_RENAME_TX_TYPE = 'edit_fee';

/** 错误文案（**逐字**；通用更新路由的 400 文案 = `TREE_RENAME_HINT`，由 `index.js` 原样使用） */
export const TREE_RENAME_HINT = '請使用【修改譜名】修改譜名';
export const ERR_TREE_RENAME_NAME_REQUIRED = '譜名不得為空';
export const ERR_TREE_RENAME_NAME_TOO_LONG = `譜名不得超過 ${TREE_RENAME_MAX_NAME_LEN} 個字符`;
export const ERR_TREE_RENAME_FORBIDDEN = '僅本族家族管理員（tree_steward）或上級管理員（chief_editor）可修改本族譜名';
export const ERR_TREE_RENAME_MISSING_TREE = '缺少 tree_id';

// ==================== 错误工厂 ====================

/**
 * 造一个业务错误（`status` + 业务文案）。与修谱域同形：本域**没有**域名错误码
 * （不足走 `economy-fee` 的 `ASSET_INSUFFICIENT`，由路由 `eco.errorPayload` 统一回显），
 * ⇒ 不引入新的白名单 code，也不另开 `err.expose` 旁路。
 */
export function treeRenameError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const toIso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

const nowMsOf = (now) => {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(t) ? t : Date.now();
};

// ==================== 纯函数：天数 / 档位 / 价目（**读面与写面共用同一实现**）====================

/**
 * 距上次谱名修改的天数（**自然日向上取整**，同修谱 `daysOf` 体例）：
 * `days = Math.ceil((now - lastUpdatedAt) / 86400000)`。
 * `lastUpdatedAt` 缺失 / 不可解析 ⇒ **`null` = 无历史（首次）**（不得静默按 0 天算 —— 那会落进最贵档）。
 * @returns {number|null}
 */
export function renameDaysSince(lastUpdatedAt, now = new Date()) {
  if (lastUpdatedAt === null || lastUpdatedAt === undefined || lastUpdatedAt === '') return null;
  const t0 = new Date(lastUpdatedAt).getTime();
  if (!Number.isFinite(t0)) return null;
  return Math.ceil((nowMsOf(now) - t0) / 86400000);
}

/** 档位判定（纯函数）：首次 ⇒ first_or_expired；`days >= 360` ⇒ first_or_expired；`>= 30` ⇒ within_360d；否则 within_30d。 */
export function renameTierOf(days) {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) return TREE_RENAME_TIER_FIRST_OR_EXPIRED;
  const d = Number(days);
  if (d >= TREE_RENAME_EXPIRED_DAYS) return TREE_RENAME_TIER_FIRST_OR_EXPIRED;
  if (d >= TREE_RENAME_WITHIN_30D_MAX_DAYS) return TREE_RENAME_TIER_WITHIN_360D;
  return TREE_RENAME_TIER_WITHIN_30D;
}

/** 档位 → 价（片，纯函数） */
export function renamePiecesOfTier(tier) {
  if (tier === TREE_RENAME_TIER_WITHIN_30D) return TREE_RENAME_FEE_WITHIN_30D;
  if (tier === TREE_RENAME_TIER_WITHIN_360D) return TREE_RENAME_FEE_WITHIN_360D;
  return TREE_RENAME_FEE_FIRST_OR_EXPIRED;
}

/**
 * 计费矩阵（**唯一实现**；写面扣费与读面 `rename_fee_pieces` 都调它）：
 * `{ pieces, tier, days }`（`days = null` = 无历史 / 首次）。
 * 无历史 ⇒ 999（`first_or_expired`）。
 */
export function renameFeeOf(lastUpdatedAt, now = new Date()) {
  const days = renameDaysSince(lastUpdatedAt, now);
  const tier = renameTierOf(days);
  return { pieces: renamePiecesOfTier(tier), tier, days };
}

/** 谱名字面同一性（**no-op 唯一判据**）：两侧 `String().trim()` 后相等 —— 写面与 `PUT /tree-meta` 拦截共用。 */
export function sameGenealogyName(a, b) {
  return String(a === null || a === undefined ? '' : a).trim() === String(b === null || b === undefined ? '' : b).trim();
}

/** 谱名归一 + 校验：必须为字符串、`trim` 后非空、长度（**按码点**）<= 30；非法 ⇒ 400。 */
export function normalizeGenealogyName(raw) {
  if (typeof raw !== 'string') throw treeRenameError(400, ERR_TREE_RENAME_NAME_REQUIRED);
  const s = raw.trim();
  if (!s) throw treeRenameError(400, ERR_TREE_RENAME_NAME_REQUIRED);
  if (Array.from(s).length > TREE_RENAME_MAX_NAME_LEN) throw treeRenameError(400, ERR_TREE_RENAME_NAME_TOO_LONG);
  return s;
}

// ==================== 权限（**唯一入口 = 复用修谱域的统一判据**）====================

/**
 * 谱名改名写权限（**不得在路由里另写一套**）：
 * 整份复用 `lib/revision.js` 的 `assertRevisionWritable` ——
 *   ① `level < tree_steward` ⇒ 403；② `tree_steward` ⇒ **仅本树主理人**（本人锚点树 === `treeId`）；
 *   ③ `chief_editor` 恒放行（任意树）。
 * 本域只把 403 文案换成谱名域措辞，**判据与锚点查询一字不改**（不存在第二套权限实现）。
 * 返回实际生效角色（`'chief_editor'` | `'tree_steward'`）。
 */
export async function assertTreeRenameWritable({ role, treeId = '', phone = '' } = {}) {
  try {
    return await assertRevisionWritable({ role, treeId, phone });
  } catch (e) {
    if (e && Number(e.status) === 403) throw treeRenameError(403, ERR_TREE_RENAME_FORBIDDEN);
    throw e;
  }
}

// ==================== 读面（`GET /tree-meta` 只增不改）====================

/** 在 meta 里按 `tree_id` 找条目（树 key 与 `tree_id` 一致，但按字段匹配更稳） */
export function findTreeEntry(meta, treeId) {
  const id = String(treeId || '').trim();
  if (!id) return null;
  return Object.values(meta?.trees || {}).find((t) => t && String(t.tree_id || '') === id) || null;
}

/**
 * `GET /tree-meta` 的**只增不改**派生（纯函数，零 IO）：
 * 每树 entry 新增两键 ——
 *   · `genealogy_name_updated_at`：ISO 串或 `null`（无历史）；
 *   · `rename_fee_pieces`：**服务端按同一矩阵算出的纯函数结果**（无历史 ⇒ 999）。
 * 原 entry 的其它键**原样透传**（绝不改值、绝不删键）；入参对象**不被就地修改**。
 */
export function decorateTreeMetaForRead(meta, now = new Date()) {
  const out = { ...(meta || {}) };
  const trees = {};
  for (const [key, entry] of Object.entries(meta?.trees || {})) {
    if (!entry || typeof entry !== 'object') {
      trees[key] = entry;
      continue;
    }
    const updatedAt = entry[GENEALOGY_NAME_UPDATED_AT];
    trees[key] = {
      ...entry,
      [GENEALOGY_NAME_UPDATED_AT]: updatedAt ? String(updatedAt) : null,
      [RENAME_FEE_PIECES_KEY]: renameFeeOf(updatedAt, now).pieces,
    };
  }
  out.trees = trees;
  return out;
}

// ==================== 留痕（best-effort · 每笔一档）====================

/**
 * 写一条谱名改名留痕到 `jiapu_ops_logs`（集合常量取自 `economy-ops.OPS_LOGS_COL`；**不新建第二套日志设施**）。
 * 领域字段逐字 = `op` / `tree_id` / `operator` / `amount_pieces` / `tx_id` / `created_at`；
 * 体例字段 = `id = opsLogId()`（`op_<毫秒>_<6 位随机>`）、`ts = created_at`（`opsLogs()` 的排序键）。
 * ⚠️ 本函数**只负责写**：失败处理（不阻断主流程 + `log_warning`）在 `renameTreeGenealogy` 内；
 * 直接调用者必须自行决定是否吞错 —— 但**绝不允许静默**。
 */
export async function writeTreeRenameLog({ treeId, phone, amountPieces, txId, now = new Date() } = {}) {
  const created_at = toIso(now);
  const entry = {
    id: opsLogId(),
    ts: created_at,
    op: TREE_RENAME_OP,
    tree_id: String(treeId ?? ''),
    operator: String(phone ?? ''),
    amount_pieces: Number(amountPieces),
    tx_id: String(txId ?? ''),
    created_at,
  };
  await mutateDoc(OPS_LOGS_COL, entry.id, () => entry); // 每笔一档：写入即该条日志自身
  return entry;
}

// ==================== 编排：改谱名（专用计费路由的唯一入口）====================

/**
 * 修改谱名（`POST /admin/tree-rename` 的唯一实现）。
 * 校验顺序（**先校验、再扣费、最后写**）：① `tree_id` ② 谱名归一（空 / 超长 ⇒ 400）
 * ③ 权限（本树主理人 / chief）④ 取现值 → **no-op 短路（0 片、不写、不记流水、不推进时间戳）**
 * ⑤ 扣费（不足 ⇒ 409 `ASSET_INSUFFICIENT`，**整单不写**）⑥ 写 meta ⑦ 留痕（best-effort）。
 *
 * @returns {Promise<{ok:true, tree_id:string, genealogy_name:string,
 *   fee:{pieces:number, tier:string}, no_op?:true, log_warning?:true}>}
 */
export async function renameTreeGenealogy({ treeId, genealogyName, role, phone, now = new Date() } = {}) {
  const id = String(treeId || '').trim();
  if (!id) throw treeRenameError(400, ERR_TREE_RENAME_MISSING_TREE);
  const name = normalizeGenealogyName(genealogyName);
  // ① 权限（唯一入口；在本域= 复用修谱域判据）
  await assertTreeRenameWritable({ role, treeId: id, phone });

  // ② 现值 + 档位（meta 缺该树 ⇒ 404；不得对不存在的树扣费）
  const meta = await getMeta();
  const entry = findTreeEntry(meta, id);
  if (!entry) throw treeRenameError(404, `未找到 tree: ${id}`);
  const current = String(entry[GENEALOGY_NAME_KEY] ?? '');
  const fee = renameFeeOf(entry[GENEALOGY_NAME_UPDATED_AT], now);

  // ③ no-op：与现值相同 ⇒ 200 + 0 片；不扣、不写、不记流水、**不推进 `genealogy_name_updated_at`**
  if (sameGenealogyName(name, current)) {
    return { ok: true, tree_id: id, genealogy_name: current, fee: { pieces: 0, tier: fee.tier }, no_op: true };
  }

  // ④ 扣费（**校验全过之后**；不足 ⇒ 409 整单拒绝、元数据一字不写）
  const charged = await chargeBamboo(phone, fee.pieces, {
    op: 'tree_rename',
    tx_type: TREE_RENAME_TX_TYPE, // 沿用既有 `edit_fee`，不新增 Tx.type
    tree_id: id,
    desc: `修改譜名（扣 ${fee.pieces} 片竹片）`,
  });

  // ⑤ 写 meta（`genealogy_name` + `genealogy_name_updated_at` 同一次写入）
  const nowIso = toIso(now);
  let written;
  try {
    written = await mutateTreeMeta(id, (e) => {
      e[GENEALOGY_NAME_KEY] = name;
      e[GENEALOGY_NAME_UPDATED_AT] = nowIso;
      return e;
    });
  } catch (e) {
    // 扣费成功但**系统落库失败** ⇒ 原路全额返还（用户侧不退的唯一例外；best-effort，绝不掩盖原始错误）
    try {
      await refund(phone, charged.spent, { unit: 'bamboos', txn_id: charged.txn_id, tree_id: id, reason: '譜名落庫失敗，已原路返還' });
      e.fee_refunded = true;
    } catch {
      /* best-effort */
    }
    throw e;
  }

  const out = {
    ok: true,
    tree_id: id,
    genealogy_name: String(written?.[GENEALOGY_NAME_KEY] ?? name),
    fee: { pieces: fee.pieces, tier: fee.tier },
  };
  // ⑥ 留痕（**仅实扣** ⇒ `pieces > 0`；no-op 已在上面短路）：主写成功后 best-effort，
  //    独立 try/catch —— 失败不回滚、不改计费与写入结果，但**绝不静默** ⇒ 出参 `log_warning:true`。
  if (fee.pieces > 0) {
    try {
      await writeTreeRenameLog({ treeId: id, phone, amountPieces: fee.pieces, txId: charged.txn_id, now });
    } catch {
      out.log_warning = true;
    }
  }
  return out;
}
