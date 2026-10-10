/**
 * 带色称号 — 字段级写权限判据（**单一真源**）。
 * 契约 = `docs/person-badge.spec.md` **§5 权限（字段级）**（本文件口径以该册为准）。
 *
 * 语义（与前端 `frontend/src/business/badge.ts` 的 `canEditBadge` **同口径**，同一套角色集合与总谱特例）：
 * - 请求体 `attribute_list` 中**出现** `称号` / `称号色` 键 ⇒ 触发字段级校验（**存在即校验**，不比值）；
 * - 普通家族树 / 祖谱（`treeId !== masterTreeId`）⇒ 需 `tree_steward` 及以上（含 `chief_editor`）；
 * - 总谱（`treeId === masterTreeId`）⇒ **仅** `chief_editor`；
 * - 未登录 / `guest` ⇒ 拒绝。
 * - 无 `称号` / `称号色` 字段 ⇒ **直接放行**（其它字段权限不变）。
 *
 * ⚠️ 权限不足 ⇒ 抛 `status: 403` 的错误；调用方**必须**在扣费闸门**之前**调用本模块
 *   （否则会走到扣费后再 403 ⇒ 产生成对 `edit_fee -1` + `fee_refund +1` 流水，见仓内既往缺陷教训）。
 */

/** 带色称号的两个 attribute key（spec §2-1；与前端 `BADGE_ATTR_KEYS` 逐字一致） */
export const BADGE_ATTR_KEYS = /** @type {const} */ (['称号', '称号色']);

/** 权限不足时的 403 文案（明示「称号仅树主理人及以上可编辑」语义） */
export const BADGE_FORBIDDEN_MESSAGE =
  '称号仅树主理人（tree_steward）及以上可编辑；中华世本总谱仅总编辑（chief_editor）可编辑';

/**
 * attribute 项的 key 读取（兼容三种真实形态：`type` 为字符串 / `type` 为 `{string}` / `key`）。
 * 取不到 ⇒ `''`（调用方据此忽略该条目）。
 */
function attrKeyOf(a) {
  if (!a) return '';
  if (typeof a.type === 'string') return a.type;
  if (a.type && typeof a.type.string === 'string') return a.type.string;
  if (typeof a.key === 'string') return a.key;
  return '';
}

/**
 * 请求体 `attribute_list` 是否含 `称号` / `称号色`（**键存在**即命中，不判值）。非数组 ⇒ `false`。
 */
export function hasBadgeAttr(attributeList) {
  if (!Array.isArray(attributeList)) return false;
  return attributeList.some((a) => BADGE_ATTR_KEYS.includes(attrKeyOf(a)));
}

/**
 * 权限判定（**与前端 `canEditBadge(role, treeId)` 同口径**）。
 * - 未登录 / `guest`（空 role）⇒ `false`；
 * - 总谱（`treeId === masterTreeId`）⇒ 仅 `chief_editor`；
 * - 普通树 ⇒ `tree_steward` | `chief_editor`。
 */
export function canEditBadge(role, treeId, masterTreeId) {
  const r = String(role || '').trim();
  if (!r || r === 'guest') return false;
  if (treeId === masterTreeId) return r === 'chief_editor';
  return r === 'tree_steward' || r === 'chief_editor';
}

/**
 * 字段级称号写校验：请求体含 `称号` / `称号色` 且角色不足 ⇒ 抛 `status: 403`。
 * 无称号字段 ⇒ 直接返回（其它字段权限不变）。**须在扣费之前调用**。
 */
export function assertBadgeWritable(role, treeId, masterTreeId, attributeList) {
  if (!hasBadgeAttr(attributeList)) return;
  if (!canEditBadge(role, treeId, masterTreeId)) {
    const e = new Error(BADGE_FORBIDDEN_MESSAGE);
    e.status = 403;
    throw e;
  }
}
