/**
 * 譜司襄事（修谱面板 ③）—— **纯函数 + 文案单点**（无 uni / 无 DOM / 无 Vue；面板与离线自证共用）。
 *
 * 口径（Kevin 2026-10-12 当面拍定）：
 *   · 職務**只能是** `主司` / `副司` 两个值（二选一、必选；不再是自由文本）；
 *   · 人数上限 = **总 ≤ 3**，其中 `主司` **恰 1（必填）**、`副司` **≤ 2**；
 *   · **同一族人**（`person_handle`）不得重复录入（主司与副司之间、副司之间）。
 *
 * ⚠️ 六条错误文案**与后端逐字一致（繁体）** ⇒ 改字面必须先改后端，不得单侧改。
 * ⚠️ 本文件在 `frontend/src/components/revision-panel/` 内，与面板同目录、同批交付。
 */

/** 主司（每轮恰 1 位） */
export const ROSTER_DUTY_MASTER = '主司';
/** 副司（每轮 ≤ 2 位） */
export const ROSTER_DUTY_DEPUTY = '副司';

/** 可选的職務枚举（面板渲染二选一 chip 用；**顺序即展示顺序**） */
export const ROSTER_DUTIES: string[] = [ROSTER_DUTY_MASTER, ROSTER_DUTY_DEPUTY];

/** 襄事总人数上限（主司 1 + 副司 2） */
export const ROSTER_MAX_ROWS = 3;
/** 副司人数上限 */
export const ROSTER_MAX_DEPUTIES = 2;

/** 拦截文案（**与后端逐字一致 · 繁体**；不得改写） */
export const ROSTER_MSG = {
  /** 每轮必须恰 1 位主司（0 位 ⇒ 拦下） */
  masterRequired: '請填寫主司',
  /** 主司只能有一位（选第二位主司 ⇒ 拦下） */
  masterOneOnly: '主司只能有一位',
  /** 副司最多兩位 */
  deputyMax: '副司最多兩位',
  /** 襄事最多三位（总人数上限） */
  maxThree: '襄事最多三位',
  /** 職務只能是主司或副司 */
  dutyInvalid: '職務只能是主司或副司',
  /** 同一位族人不可重複錄入 */
  duplicatePerson: '同一位族人不可重複錄入',
} as const;

/** 校验输入的一条（只取这两个键；`name`/`gramps_id` 等展示字段不参与判定） */
export interface RosterDutyRow {
  handle: string;
  duty: string;
}

/** 校验结果：`index` = 需要聚焦（滚动 / 高亮）的行下标；`-1` = 无具体行 */
export interface RosterCheck {
  ok: boolean;
  message: string;
  index: number;
}

/** `職務` 是否合法枚举值（`主司` / `副司`；空白一律不合法） */
export function isRosterDuty(duty: string): boolean {
  return ROSTER_DUTIES.indexOf(String(duty || '').trim()) >= 0;
}

/**
 * 提交前整体校验（**逐条对齐后端 `lib/revision.js` 的 `normalizeHelpers()` 判序**）。
 *
 * ⚠️ 判序**不是**「主司 → 副司 → 总数」：三条人数断言彼此重叠，必须按固定次序判定，
 * 每条文案才各有一条**可达**路径（后端同注释）：
 *   ① 无任何已点选行（提交载荷为空数组）⇒ `請填寫主司`；
 *   ② 逐行职务枚举（含空值）⇒ `職務只能是主司或副司`；
 *   ③ 逐行重复族人 ⇒ `同一位族人不可重複錄入`；
 *   ④ 主司 = 0 ⇒ `請填寫主司`；
 *   ⑤ 副司 > 2 ⇒ `副司最多兩位`（必须先于总数：1 主司 + 3 副司 必也超总数）；
 *   ⑥ 总数 > 3 ⇒ `襄事最多三位`（必须先于主司计数：2 主司 + 2 副司）；
 *   ⑦ 主司 > 1 ⇒ `主司只能有一位`。
 * 只统计**已点选族人**（`handle` 非空）的行 —— 与提交载荷口径一致（无 handle 的行不进 `helpers`）。
 */
export function checkRoster(rows: RosterDutyRow[]): RosterCheck {
  const list = (rows || []).map((r) => ({
    handle: String((r && r.handle) || '').trim(),
    duty: String((r && r.duty) || '').trim(),
  }));
  const filled = list.map((r, i) => ({ handle: r.handle, duty: r.duty, i })).filter((r) => !!r.handle);

  // ① 载荷为空（没有任何已点选族人）⇒ 强读法：每轮必含恰 1 位主司
  if (!filled.length) return { ok: false, message: ROSTER_MSG.masterRequired, index: -1 };

  // ② 職務只能是主司或副司（逐行、含空值 / 空白）
  const badDuty = filled.find((r) => !isRosterDuty(r.duty));
  if (badDuty) return { ok: false, message: ROSTER_MSG.dutyInvalid, index: badDuty.i };

  // ③ 同一族人不得重复录入（主司↔副司、副司↔副司）
  const seen = new Set<string>();
  for (const r of filled) {
    if (seen.has(r.handle)) return { ok: false, message: ROSTER_MSG.duplicatePerson, index: r.i };
    seen.add(r.handle);
  }

  // ④~⑦ 人数上限（判序 = 副司 → 总数 → 主司，见上方说明）
  const masters = filled.filter((r) => r.duty === ROSTER_DUTY_MASTER);
  const vices = filled.filter((r) => r.duty === ROSTER_DUTY_DEPUTY);
  if (!masters.length) return { ok: false, message: ROSTER_MSG.masterRequired, index: filled[0].i };
  if (vices.length > ROSTER_MAX_DEPUTIES) {
    return { ok: false, message: ROSTER_MSG.deputyMax, index: vices[ROSTER_MAX_DEPUTIES].i };
  }
  if (filled.length > ROSTER_MAX_ROWS) {
    return { ok: false, message: ROSTER_MSG.maxThree, index: filled[ROSTER_MAX_ROWS].i };
  }
  if (masters.length > 1) {
    return { ok: false, message: ROSTER_MSG.masterOneOnly, index: masters[1].i };
  }

  return { ok: true, message: '', index: -1 };
}

/** 某个 `handle` 是否已被**其它行**占用（选人时即时拦截用；`skipIndex` = 当前行，自身不算重复） */
export function rosterHandleUsedByOther(rows: RosterDutyRow[], handle: string, skipIndex: number): boolean {
  const h = String(handle || '').trim();
  if (!h) return false;
  return (rows || []).some((r, i) => i !== skipIndex && String((r && r.handle) || '').trim() === h);
}

/** 某職務已占用的人数（选 chip 时即时拦截用） */
export function rosterDutyCount(rows: RosterDutyRow[], duty: string): number {
  return (rows || []).filter((r) => String((r && r.duty) || '').trim() === duty).length;
}
