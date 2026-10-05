/**
 * 出生地 / 居住地 —— 纯逻辑（H5 与小程序共用；零请求、无浏览器 DOM 依赖）
 *
 * 契约 v2（Zang 冻结，前后端同一形状）：
 *   · 树 JSON `people.<handle>.birth_place`      = `{ "origin_code": "<6 位码或空串>", "note": "<备注>" }`
 *     （历史的字符串旧值由后端归一，前端一律按对象处理）
 *   · 树 JSON `people.<handle>.residence_places` = `[{ "origin_code": "", "note": "" }]`
 *     —— **上限 9 条**，顺序即展示顺序；后端对第 10 条返回 400，故前端必须先在 UI 层拦住。
 *   · 读响应由后端派生：`profile.birth = { date, place, place_code, place_note }` 与顶层
 *     `residence_places: [{ place, place_code, place_note }]`（`place` = 码反查后的展示串；空码 → 空串）。
 *   · 提交（`PUT /people/<handle>`）只发**原始码 + 备注**，**不得**提交后端派生的 `place`。
 *
 * 契约 v3（追加扩展；v2 条文字面不变 —— docs/person-places.spec.md §20）：
 *   · 居住地**每条**新增 `start_year`（与 `origin_code` / `note` 平级）：**字符串**（`''` 或 `'1960'`，
 *     同 `birth_date` 口径，不用数字）；缺键 / 空串 = 未填 ⇒ **老数据零迁移**。
 *     出生地 `birth_place` **不加**此字段；上限 9 条与「顺序即展示顺序」不变。
 *   · 读响应逐项新增 `place_start_year`（与 `place` / `place_code` / `place_note` 平行；缺值 ⇒ 空串）。
 *   · 展示串 = 地名 → 年份（` · <year> 年起`）→ 备注；无年份时逐字等于 v2 现状（`place · note`）。
 *     格式 / 范围 / 与卒年的交叉校验由后端 400 兜底（前端预校是体验层，不代替后端）。
 *
 * 展示串真源在后端写路径（`cloudfunctions/compat-api/lib/geo.js` 的 `resolveOrigin()`）；
 * 本模块的 `placeDisplayOf()` **只用于界面展示**，绝不落库（AGENTS.md §2.3）。
 */
import type { PersonPlaceInput, PersonPlaceView } from './types';

/** 居住地条数上限（契约 v2；后端对第 10 条返回 400 → 前端先行拦截） */
export const MAX_RESIDENCE_PLACES = 9;

/** 码反查展示串与备注之间的分隔符（备注为空时不出现在展示串里） */
export const PLACE_NOTE_SEP = ' · ';

/** 空出生地 / 空居住地条目（契约 v2 空值形状：空码 + 空备注 + 空年份；提交时字段不得省略） */
export function emptyPlaceInput(): PersonPlaceInput {
  return { origin_code: '', note: '', start_year: '' };
}

/** 文本归一：`undefined` / `null` / 其它类型 → `''`；其余 trim（真源字段可能缺失，不得透传） */
function text(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/**
 * 任意来源的出生地 / 居住地 → 编辑表单形状 `{ origin_code, note, start_year }`。
 * 兼容三种入参：
 *   · 读响应派生形状（`place_code` / `place_note` / `place_start_year`）
 *   · 树 JSON 形状（`origin_code` / `note` / `start_year`）
 *   · 后端归一前的历史字符串值（整体归入备注，不当作码；**年份一律为空**）
 */
export function normalizePlace(v: unknown): PersonPlaceInput {
  if (typeof v === 'string') return { origin_code: '', note: v.trim(), start_year: '' };
  if (!v || typeof v !== 'object') return emptyPlaceInput();
  const o = v as Record<string, unknown>;
  const code = o.origin_code !== undefined ? o.origin_code : o.place_code;
  const note = o.note !== undefined ? o.note : o.place_note;
  // 契约 v3：`start_year` 优先，回退读响应键 `place_start_year`，再回退空串（缺键 = 未填）
  const year = o.start_year !== undefined ? o.start_year : o.place_start_year;
  return { origin_code: text(code), note: text(note), start_year: text(year) };
}

/**
 * 空条目：**三空才丢**（无码 && 无备注 && 无年份）。
 * 契约 v3：**只填了年份**也算有内容 —— 不得静默丢弃（否则用户填的年份会被悄悄吃掉）。
 */
function isBlankPlace(v: unknown): boolean {
  const p = normalizePlace(v);
  return !p.origin_code && !p.note && !p.start_year;
}

/**
 * 列表归一 + **丢弃空条目**；顺序原样保留（顺序即展示顺序）。
 * 两处使用：读取回填（响应 → 表单）与提交装配（表单 → 请求体）。
 */
export function prunePlaces(list: unknown): PersonPlaceInput[] {
  const rows = Array.isArray(list) ? list : [];
  return rows.filter((r) => !isBlankPlace(r)).map(normalizePlace);
}

/**
 * 逐项 + 长度比对（顺序敏感；契约 v3 = 比 **code / note / start_year 三元组**，
 * 「只改年份」必须判为有改动）；两侧都先丢弃空条目再比，故「只加了一行空行」不算改动。
 */
export function placesDirty(cur: unknown, base: unknown): boolean {
  const a = prunePlaces(cur);
  const b = prunePlaces(base);
  if (a.length !== b.length) return true;
  return a.some((p, i) => p.origin_code !== b[i].origin_code
    || p.note !== b[i].note
    || p.start_year !== b[i].start_year);
}

/**
 * 读响应派生形状的展示串 = 地名 + 年份 + 备注（契约 v3 F6）。
 * 序（逐字）：地名 → 年份 → 备注 —— 如 `费县 · 1960 年起 · 城关镇`；
 * 年份为空 → **逐字等于 v2 现状**（`place · note`）；备注为空 → 只到年份为止；
 * 无码的旧数据（后端已把历史字符串归一到备注）→ 只有备注。
 */
export function placeDisplayOf(v: unknown): string {
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, unknown>;
  const place = text(o.place);
  // 读形状用 `place_start_year`；兼容编辑表单形状的 `start_year`（同一展示函数的两种入参）
  const year = text(o.place_start_year !== undefined ? o.place_start_year : o.start_year);
  const note = text(o.place_note);
  const parts = [place];
  if (year) parts.push(`${year} 年起`);
  if (note) parts.push(note);
  return parts.filter(Boolean).join(PLACE_NOTE_SEP);
}

/** 读响应派生形状归一：四项全空 → `undefined`（= 无数据，界面不渲染该行） */
export function placeViewOf(v: unknown): PersonPlaceView | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const view: PersonPlaceView = {
    place: text(o.place),
    place_code: text(o.place_code),
    place_note: text(o.place_note),
    // 契约 v3 F5：逐项新增，键名与 `place` / `place_code` / `place_note` 平行；缺值 ⇒ 空串
    place_start_year: text(o.place_start_year),
  };
  return view.place || view.place_code || view.place_note || view.place_start_year ? view : undefined;
}

/** 居住地读响应列表归一（非法入参 / 缺字段 → `[]`；空条目一律丢弃） */
export function placeViewsOf(list: unknown): PersonPlaceView[] {
  const rows = Array.isArray(list) ? list : [];
  return rows.map(placeViewOf).filter((v): v is PersonPlaceView => !!v);
}
