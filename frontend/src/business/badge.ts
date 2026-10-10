/**
 * 带色称号（纯逻辑单点）。契约 = `docs/person-badge.spec.md`（**唯一权威规格**）。
 *
 * 语义要点（与 spec 逐条对齐）：
 * - 数据形态 = **两条 attribute**：`称号`（文字）+ `称号色`（**色板键**，非色值）；见 spec §2-1。
 *   ⚠️ 不得把颜色塞进 `称号` 同一条 attribute（后端 `attribute_list` 透传只保留 `{key,value,type}`，会被静默剥掉）。
 * - 一人一条；`称号` 置空 ⇒ 同时清 `称号色`（不允许「有颜色无文字」悬空态）；见 spec §2-2。
 * - 色板 6 色（spec §3）；`称号色` 未填 / 非法 ⇒ 回退默认色 **金棕 `#B26A00`**；见 spec §2-3。
 * - 权限：填 / 改称号 = `tree_steward` 及以上；总谱（`zhonghua`）仅 `chief_editor`；见 spec §5。
 *
 * ⚠️ 本模块的 **5 个新色板键名**（`crimson` / `indigo` / `bamboo` / `purple` / `graphite`）为 spec 拟定
 *   （spec §3 / §7-4：一句话可改）。改动须同步 spec §2-3 回退判据与迁移脚本（批 1b）。
 */
import { attrMapOf } from './format';

/** 色板键（spec §3，6 色，定死） */
export type BadgeColorKey = 'gold' | 'crimson' | 'indigo' | 'bamboo' | 'purple' | 'graphite';

/** 色板：色板键 → 色值（spec §3；前 4 条色值沿用旧 `KEY_THEME_COLORS` 的逐字色值） */
export const BADGE_COLORS: Record<BadgeColorKey, string> = {
  gold: '#B26A00', // 金棕
  crimson: '#C62828', // 朱红
  indigo: '#1565C0', // 靛蓝
  bamboo: '#2E7D32', // 竹绿
  purple: '#6A1B9A', // 紫
  graphite: '#455A64', // 石墨
};

/** 色板展示顺序（编辑页 6 色选择器按此序渲染） */
export const BADGE_COLOR_ORDER: BadgeColorKey[] = ['gold', 'crimson', 'indigo', 'bamboo', 'purple', 'graphite'];

/** 色板键中文名（spec §3；选择器文案） */
export const BADGE_COLOR_LABELS: Record<BadgeColorKey, string> = {
  gold: '金棕',
  crimson: '朱红',
  indigo: '靛蓝',
  bamboo: '竹绿',
  purple: '紫',
  graphite: '石墨',
};

/** 默认色板键 = 金棕（spec §2-3 / §3） */
export const BADGE_DEFAULT_COLOR_KEY: BadgeColorKey = 'gold';
/** 默认色值 = 金棕 `#B26A00`（spec §2-3） */
export const BADGE_DEFAULT_COLOR = BADGE_COLORS[BADGE_DEFAULT_COLOR_KEY];

/** 带色称号的两个 attribute key（spec §2-1） */
export const BADGE_ATTR_KEYS = {
  /** 称号文字，如「人文始祖」 */
  LABEL: '称号',
  /** 色板键，如 `gold`（**非色值**） */
  COLOR: '称号色',
} as const;

/** 色板键是否合法（在 §3 映射表内） */
export function isBadgeColorKey(v?: string | null): v is BadgeColorKey {
  return !!v && Object.prototype.hasOwnProperty.call(BADGE_COLORS, v);
}

/**
 * 色板键 → 色值。未填 / 非法（不在 §3 映射表内）⇒ 回退默认色 **金棕**（spec §2-3）。
 * 读侧容错：不因非法色报错、也不回写修正色板键。
 */
export function badgeColorHex(key?: string | null): string {
  return isBadgeColorKey(key) ? BADGE_COLORS[key] : BADGE_DEFAULT_COLOR;
}

/** 带色称号（渲染形状：文字 + **色值**） */
export interface Badge {
  label: string;
  color: string;
}

/**
 * 从 attributes 派生带色称号（spec §2）。
 * - 无 `称号`（缺项 / 空串）⇒ `null`（调用方据此决定是否渲染）。
 * - `称号` 有值：`称号色` 未填 / 非法 ⇒ 用默认色（金棕 `#B26A00`）。
 * `attributes` 形状兼容 `CustomAttribute[]`（`{key,value,...}`）与 `{key,value}` 数组。
 */
export function badgeOf(
  attributes?: Array<{ key: string; value: string }> | null,
): Badge | null {
  const map = attrMapOf(attributes);
  const label = (map[BADGE_ATTR_KEYS.LABEL] || '').trim();
  if (!label) return null;
  return { label, color: badgeColorHex(map[BADGE_ATTR_KEYS.COLOR]) };
}

/**
 * 权限判定**单点**（spec §5；前端与后端同口径）。
 * - 普通家族树 / 祖谱（`kind` ≠ master）：`tree_steward` 及以上（含 `chief_editor`）。
 * - 总谱 `zhonghua`（`is_master`）：**仅** `chief_editor`。
 * - guest / 未登录（空 role）⇒ `false`。
 *
 * @param role   当前用户角色（`authState.role`；如 `guest` / `user` / `branch_curator` / `tree_steward` / `chief_editor`）
 * @param treeId 目标树 tree_id（`zhonghua` = 总谱）
 */
export function canEditBadge(role?: string | null, treeId?: string | null): boolean {
  const r = (role || '').trim();
  if (!r || r === 'guest') return false;
  if (treeId === 'zhonghua') return r === 'chief_editor';
  return r === 'tree_steward' || r === 'chief_editor';
}
