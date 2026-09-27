/**
 * 在线文谱 —— 谱文生成**纯逻辑**（数据层；无 uni / 无 DOM / 不引组件）
 *
 * 口径 = Zang 定稿（「在线文谱」批 · 2026-09-26）· 与视图层**冰结契约**（签名 / 字段名不得改）：
 *   WENPU_COLS_PER_ROW = 30 / WENPU_ROWS_PER_PAGE = 4 / WENPU_CHARS_PER_COL = 10
 *
 * 1) **世系序 = 世代优先（层序 / BFS）+ 配偶紧随本人**（Kevin 已当面裁定 · 2026-09-26）：
 *    起点 = tree-meta `founder_handle`（缺失 → 以 `founder_gramps_id` 在树内反查 handle）；
 *    逐代推进（**队列**），处理当前代时**按入队顺序**逐人：
 *    ① 输出**本人行** → ② 若为**本人行**且其配偶在本树内可见且未被输出 ⇒ **立即输出配偶行**
 *    （配偶 = 与其共处同一 family 的另一方；**配偶紧随本人 = 硬口径**；**配偶行不输出「行第」**）
 *    → ③ 把其可见子女按 `families.child_handles` **位次**追加到**下一代队列**
 *    （**同一辈的人全部排完才进下一辈**）。配偶行**也**把其可见子女追加到下一代队列 ——
 *    靠 `visited` 去重 ⇒ 常见情形（子女与配偶同源）实际顺序与「仅本人行入队」相同，
 *    保留此支只为配偶另有前婚子女时不回退。
 *    不可达孤立节点**照旧**追加在**全部可达内容之后**、按 `gramps_id` 升序（`handle` 作 tie-break），
 *    **不另起空页、不丢内容**。
 * 2) **栏顺序**（一栏 = 一条数据；一条超 10 字只在**该条内部**续栏，绝不跨条拼接；缺项**整条跳过**）：
 *    ① 姓名（**姓名书写口径** `displayName()` 的产物，`isName: true`）② 行第（`行` + 汉字序；序 = 父家族 child_handles 位次，配偶行无）
 *    ③ 生于 <农历>（**W-20**：有值但非 ISO ⇒ `生年不详`）④ 在世 / 卒于 <农历>（**W-20**：有值但非 ISO、
 *    或缺卒年且 `is_living === false` ⇒ `卒年不详`）⑤ 葬于 <death_place> ⑥ 子女数串「子N女M」（**只数 'M' / 'F'**、
 *    只写非 0 项；无 M / F ⇒ 计数归零 ⇒ 整条计数串跳过）
 *    ⑦ 子女逐条（顺序 = child_handles 位次；标签 = **按性别各自计数**：长子/次子/三子…、长女/次女…，
 *    女儿不占儿子序号），后接**姓名书写口径**产物（形如「长子 X」）；**性别未知（gender 非 'M' / 'F'）的子女
 *    不参与「子N女M」计数、不加「长/次」标签，其条目只输出**姓名书写口径**产物**（不自造「子女」「幼」类标签）。
 *    **姓名书写口径**（Kevin 已当面裁定 · 2026-09-26）—— 单一纯函数 `displayName(p, rootSurname)`，
 *    **姓名栏与「子女」栏共用**（**不得**两处各自拼串）；规则先出**简体**串、随后统一繁体化（`氏` 简繁同形）：
 *      R1 **本姓**（`surname` === 本树姓氏）⇒ **只写名**不体现姓氏（「季清昆」→「清昆」）；
 *      R2 **外姓**（`surname` 非空且 ≠ 本树姓氏）⇒ `姓` + `氏` + 空格 + 名（「顾景月」→「顾氏 景月」）；
 *      R3 **姓氏字段为空**（`surname === ''`）⇒ `氏` + 空格 + 名（**无前导空格**；「三婶」→「氏 三婶」）。
 *      名的取法 = `surname` 非空且 `name.startsWith(surname)` ⇒ `name.slice(surname.length)`，否则 = `name`
 *      （**禁止**按固定宽度切字 / 「去首字」）。
 *      本树姓氏取值链（`rootSurnameOf`）= ① tree-meta `surname` → ② **始祖节点**（`founder_handle`，缺失则以
 *      `founder_gramps_id` 反查）的 `surname` → ③ `genealogy_name` 首字；**三者皆取不到 ⇒ 姓名一律原样输出
 *      （不套规则）**。适用范围 = **书页内全部出现姓名处**（姓名栏 + 「子女」栏逐条子女名 + 配偶行）。
 *      真源边缘**如实保留、不得自行「修好」**：`季四婶`（本姓）⇒「四婶」（与空姓节点 `四婶` ⇒「氏 四婶」并存）、
 *      `季？` ⇒「？」、`辛本荣 六婶` ⇒「辛氏 本荣 六婶」（含空格，数据原样）。
 * 3) 日期一律农历（`lunar.ts` 的 `solarToLunarText`；「只有年月」档 = 该公历月 15 日所在农历月）。
 * 4) 分页：每页固定 4 行、不足补 `null`；某人栏数 > 30 时多余栏**挤占下一行**（同样占行位、不丢内容）。
 * 5) 书口：`leftLabel` = `▲ <谱名> 頁<汉字序>`（谱名 = `genealogy_name`，空则 `display_title`）、
 *    `rightLabel` = `▲ <堂号> 頁<汉字序>`（堂号 = `hall_name`）；**`hall_name` 空或字面「暂无」⇒ `rightLabel = ''`**。
 *    页码：第 k 页（0 起）左 = `2k+1`、右 = `2k+2`（**汉字序**，两侧各 +2 / 翻一页 ⇒ 一组书口内两页连号）。
 * 6) 繁体：所有栏文本 + 两侧书口**一律繁体**（`traditional.ts` 的 `toTraditional`，OpenCC s2t 纯字形）；
 *    **只在渲染派生**：零回写、不进请求参数、不落真源。
 * 7) 空态：**真·无人物** ⇒ `empty: true` / `pages: []` / `rowCount: 0` / `error` 不为 true；
 *    **读失败**（网络错误 / 非 2xx / 树不存在 404）⇒ `error: true` / `empty: false` / `pages: []` / `rowCount: 0`
 *    —— 二者**不得渲染同一文案**：无人物 = 纸面繁体「暫無譜文」、读失败 = 纸外简体「谱文读取失败」（视图层判 `error`）。
 *    只渲染读 API 返回的集合（服务端节点级裁剪后的可见集；前端**不自行裁剪、不绕过裁剪**）。
 * 8) **始祖回退链（W-17）**：取起点时**依次尝试** ① tree-meta `founder_handle` → ② tree-meta `founder_gramps_id`
 *    在树内反查 → ③ 树内**本姓**（= 下条**初步本姓**）且**无父家族**的节点（多个取 `gramps_id` 升序最小、
 *    `handle` 兜底）→ ④ 树内**无父家族**的节点（多个同样取最小）→ ⑤ 仍无 ⇒ **无起点**（全员皆孤立，现状保持）。
 *    前端可见面**没有** `parent_family` 字段 ⇒ 「无父家族」以**不被任何家族 `child_handles` 收录**判定
 *    （真源实测两树 **0 不符**：`parent_family` 非空 ⇔ 被某家族 `child_handles` 收录；见 W-19 同款判据）。
 * 9) **本姓取值链（W-18）** = `surname` → `surname_char` → **推断出的始祖节点的 `surname`** → `genealogy_name` 首字
 *    → `display_title` 首字 → 空串（空串 ⇒ 姓名一律原样输出）。**不得成环**：始祖推断（W-17③）只用
 *    **初步本姓** = `surname` → `surname_char` → `genealogy_name` 首字 → `display_title` 首字（**不含**始祖那一级）。
 * 10) **女儿线整支终止（W-19）**：**女儿**判据（硬）= 本姓 且 `gender === 'F'` 且**本人被某家族 `child_handles` 收录**
 *    —— **不得**用「本姓 F 且是某个家族的母亲」判（**媳妇**会被误判 ⇒ 连带删掉其本姓丈夫；
 *    反例：季氏树 `季凤伶` 是媳妇、`parent_family=''` 且不在任何 `child_handles` 里）；
 *    **排除集合 E** = 各女儿的**配偶** + **女儿线后代**（沿 `child_handles` 向下：女儿 → 子女 → 孙辈…）**及其配偶**
 *    —— **女儿本人不入 E**、姻亲（配偶）**不再向外延伸**；
 *    **可见集 = 全部节点 − E**，层序遍历、孤立补尾、子女数串与子女逐条**一律在可见集内进行**
 *    ⇒ E 内成员**不得出现在书页任何位置**（含尾部孤立节点）。女儿本人（不在 E 内时）照常渲染（含行第），
 *    **媳妇与本姓男性成员一律不受影响**。（本条的「可见集」= 减 E 后的集合，与第 7 条「服务端裁剪后的可见集」是两件事。）
 * 11) **生卒栏「不詳」口径（W-20 · Kevin 已当面拍定 · 2026-09-26）**：日期判定一律用 **ISO 形状**
 *    （`^\d{4}$` / `^\d{4}-\d{2}$` / `^\d{4}-\d{2}-\d{2}$`，见 `isIsoDate()`）：
 *    **生於栏**：① 命中 ISO ⇒ **既有农历口径不动**；② **有值但非 ISO** ⇒ `生年不详`；③ 缺失 / 空串 ⇒ **既有「整条跳过」不动**。
 *    **卒於栏**（与「在世」**同一栏位**）：① 命中 ISO ⇒ **既有农历口径不动**；② **有值但非 ISO** ⇒ `卒年不详`（**不再原样印原字面**）；
 *    ③ 缺失 / 空串 **且 `is_living === false`（严格等值）** ⇒ `卒年不详`；④ 缺失 / 空串 **且 `is_living !== false`**
 *    （`true` / `null` / 缺字段）⇒ **既有 `在世` 不动**（非真值时维持原有「无输出」）。
 *    出口 = **简体**串（`详` 由 `traditional.ts` 产 `詳`）；**栏序 / 行第 / 世系序 / E 剔除集 / 页数 / 书口 / 姓名口径一律不动**。
 *
 * 取数（既有 API，零新增后端调用）：`fetchPersonList(treeId, 0, 0)` 全量人物 +
 * `fetchFamilyList(treeId)` 家族（含 `father_handle` / `mother_handle` / `child_handles[]`）+
 * `fetchTreeMetaRemote()` 谱名 / 堂号 / 始祖。
 */

import { fetchFamilyList, fetchPersonList, fetchTreeMetaRemote } from './api';
import type { FamilySummary } from './api';
import type { PersonSummary, TreeMeta, TreeEntry } from './types';
import { solarToLunarText } from './lunar';
import { toTraditional } from './traditional';

/** 每行栏数（= 每行 30 条数据栏） */
export const WENPU_COLS_PER_ROW = 30;
/** 每页行数（固定 4 行，不足补 `null`） */
export const WENPU_ROWS_PER_PAGE = 4;
/** 每栏字数上限（一条数据超此长度 → 在**该条内部**续栏） */
export const WENPU_CHARS_PER_COL = 10;

export interface WenpuCol {
  text: string;
  isName: boolean;
}
export interface WenpuRow {
  handle: string;
  grampsId: string;
  name: string;
  isSpouse: boolean;
  cols: WenpuCol[];
}
export interface WenpuPage {
  /** 长度恒 = `WENPU_ROWS_PER_PAGE`，不足补 `null` */
  rows: (WenpuRow | null)[];
  leftLabel: string;
  rightLabel: string;
}
export interface WenpuBook {
  pages: WenpuPage[];
  title: string;
  hall: string;
  rowCount: number;
  /** **真·无人物**空态（该树有谱可见但集合为空）为 true；**读失败另走 `error`** */
  empty: boolean;
  /** **读失败**（网络错误 / 非 2xx / 树不存在 404）：true ⇒ 视图层**必须**走纸外失败提示，不得渲染空态 */
  error?: boolean;
}

/** 堂号占位字面：**逐字**照真源「暂无」⇒ 视为无堂号（`rightLabel = ''`） */
const HALL_PLACEHOLDER = '暂无';

/** 生卒栏「不詳」字面（W-20 · **简体源串**，繁体化由 `pushRecord` 统一做 ⇒ 上屏 `生年不詳` / `卒年不詳`） */
const BIRTH_UNKNOWN = '生年不详';
const DEATH_UNKNOWN = '卒年不详';

/** **ISO 日期形状**（W-20）：`^\d{4}$` / `^\d{4}-\d{2}$` / `^\d{4}-\d{2}-\d{2}$` 三档（严格等长；宽松度同 `lunar.ts`） */
function isIsoDate(s: string): boolean {
  return /^\d{4}$/.test(s) || /^\d{4}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 正整数 → 汉字序（1–9999；用于行第 / 子女数 / 页码；超范围退回阿拉伯数字，不猜） */
function chineseNum(n: number): string {
  const v = Math.floor(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  if (v < 10) return DIGITS[v];
  if (v < 20) return '十' + (v % 10 ? DIGITS[v % 10] : '');
  if (v < 100) return DIGITS[Math.floor(v / 10)] + '十' + (v % 10 ? DIGITS[v % 10] : '');
  if (v < 1000) {
    const r = v % 100;
    return DIGITS[Math.floor(v / 100)] + '百' + (r === 0 ? '' : r < 10 ? '零' + DIGITS[r] : chineseNum(r));
  }
  if (v < 10000) {
    const r = v % 1000;
    return DIGITS[Math.floor(v / 1000)] + '千' + (r === 0 ? '' : r < 100 ? '零' + chineseNum(r) : chineseNum(r));
  }
  return String(v);
}

/** 子女标签：同性别内**各自**计数（长子 / 次子 / 三子…；长女 / 次女 / 三女…） */
function childLabel(sex: '子' | '女', order: number): string {
  if (order === 1) return '长' + sex;
  if (order === 2) return '次' + sex;
  return chineseNum(order) + sex;
}

/** 名的取法：`surname` 非空且 `name.startsWith(surname)` ⇒ 去该前缀，否则取全串（**禁止**按固定宽度切字） */
function givenNameOf(name: string, surname: string): string {
  return surname && name.startsWith(surname) ? name.slice(surname.length) : name;
}

/** `gramps_id` 升序（同号 `handle` 升序兜底）—— 孤立补尾与始祖回退链的 ③ / ④ 共用同一口径 */
function compareByGrampsId(a: PersonSummary, b: PersonSummary): number {
  const x = a.gramps_id || '';
  const y = b.gramps_id || '';
  if (x !== y) return x < y ? -1 : 1;
  const hx = a.handle || '';
  const hy = b.handle || '';
  return hx === hy ? 0 : hx < hy ? -1 : 1;
}

/** **被某家族 `child_handles` 收录**的 handle 集合 —— 前端可见面没有 `parent_family` 字段，
 *  该集合即「有父家族」的等价判据（W-17 ③/④ 与 W-19 女儿判据共用） */
function childHandlesSet(families: FamilySummary[]): Set<string> {
  const asChild = new Set<string>();
  for (const fam of families) for (const ch of fam.child_handles) asChild.add(ch);
  return asChild;
}

/** **初步本姓**（W-17③ 的判据 / W-18 取值链的**前两级**）：tree-meta `surname` → `surname_char` →
 *  `genealogy_name` 首字 → `display_title` 首字；**不含**「推断出的始祖 `surname`」那一级 ⇒ **与始祖推断互不依赖、不成环** */
function preliminaryRootSurname(entry: TreeEntry | undefined): string {
  const fromSurname = (entry?.surname || '').trim();
  if (fromSurname) return fromSurname;
  const fromChar = (entry?.surname_char || '').trim();
  if (fromChar) return fromChar;
  const genealogy = (entry?.genealogy_name || '').trim();
  if (genealogy) return Array.from(genealogy)[0];
  const title = (entry?.display_title || '').trim();
  return title ? Array.from(title)[0] : '';
}

/** **起点（始祖）回退链**（W-17）：① tree-meta `founder_handle`（须在本集合内）→ ② tree-meta
 *  `founder_gramps_id` 树内反查 → ③ **初步本姓且无父家族**（多个取 `gramps_id` 升序最小、`handle` 兜底）→
 *  ④ **无父家族**（多个同样取最小）→ ⑤ 皆无 ⇒ 空串（**无起点**）。 */
export function founderHandleOf(
  entry: TreeEntry | undefined,
  people: PersonSummary[],
  families: FamilySummary[] = [],
): string {
  const fromMeta = (entry?.founder_handle || '').trim();
  if (fromMeta && people.some((p) => p.handle === fromMeta)) return fromMeta;
  const founderGid = (entry?.founder_gramps_id || '').trim();
  if (founderGid) {
    const hit = people.find((p) => !!p.gramps_id && p.gramps_id === founderGid);
    if (hit) return hit.handle;
  }
  if (!families.length) return '';
  const asChild = childHandlesSet(families);
  const parentless = people.filter((p) => !asChild.has(p.handle));
  const surname = preliminaryRootSurname(entry);
  if (surname) {
    const sameSurname = parentless.filter((p) => (p.surname || '').trim() === surname);
    if (sameSurname.length) return [...sameSurname].sort(compareByGrampsId)[0].handle;
  }
  return parentless.length ? [...parentless].sort(compareByGrampsId)[0].handle : '';
}

/** **本树姓氏**取值链（W-18）：① tree-meta `surname` → ② tree-meta `surname_char` →
 *  ③ **推断出的始祖节点**（`founderHandleOf`）的 `surname` → ④ `genealogy_name` 首字 →
 *  ⑤ `display_title` 首字；**皆取不到 ⇒ 空串**（⇒ 姓名一律原样输出）。
 *  `families` 缺省为空数组 ⇒ ③/④ 无法判定「无父家族」⇒ 退回 ①/②/⑤ 那一支（既有调用方零改动）。 */
export function rootSurnameOf(
  entry: TreeEntry | undefined,
  people: PersonSummary[],
  families: FamilySummary[] = [],
): string {
  const fromMeta = (entry?.surname || '').trim();
  if (fromMeta) return fromMeta;
  const fromChar = (entry?.surname_char || '').trim();
  if (fromChar) return fromChar;
  const founderHandle = founderHandleOf(entry, people, families);
  const fromFounder = (
    founderHandle ? people.find((p) => p.handle === founderHandle)?.surname || '' : ''
  ).trim();
  if (fromFounder) return fromFounder;
  const genealogy = (entry?.genealogy_name || '').trim();
  if (genealogy) return Array.from(genealogy)[0];
  const title = (entry?.display_title || '').trim();
  return title ? Array.from(title)[0] : '';
}

/**
 * **姓名书写口径**（Kevin 已当面裁定 · 2026-09-26）—— 单一纯函数，书页内**姓名栏与「子女」栏共用**。
 *
 * 出口 = **简体**串（繁体化由 `pushRecord` 统一做；`氏` 简繁同形）：
 *   R1 本姓（`surname` === `rootSurname`）⇒ **只写名**（「季清昆」→「清昆」）
 *   R2 外姓（`surname` 非空且 ≠ `rootSurname`）⇒ `姓` + `氏` + 空格 + 名（「顾景月」→「顾氏 景月」）
 *   R3 姓氏字段为空（`surname === ''`）⇒ `氏` + 空格 + 名（**无前导空格**；「三婶」→「氏 三婶」）
 *   `rootSurname` 为空（三链皆取不到）⇒ **原样输出**（不套规则）
 */
export function displayName(p: PersonSummary, rootSurname: string): string {
  const name = p.name || '';
  if (!name || !rootSurname) return name;
  const surname = p.surname || '';
  const given = givenNameOf(name, surname);
  if (!surname) return '氏 ' + given;
  if (surname === rootSurname) return given;
  return surname + '氏 ' + given;
}

/** 一条数据 → 栏（超 10 字**只在本条内部**续栏；空条跳过）；**出口一律繁体** */
function pushRecord(cols: WenpuCol[], text: string, isName = false): void {
  const chars = Array.from(text || '');
  if (!chars.length) return;
  for (let i = 0; i < chars.length; i += WENPU_CHARS_PER_COL) {
    cols.push({ text: toTraditional(chars.slice(i, i + WENPU_CHARS_PER_COL).join('')), isName });
  }
}

/** 生卒日期 → 农历文本（空 / 非法 → 空串 ⇒ 该条整条跳过） */
function lunarOf(date: string | undefined): string {
  const s = (date || '').trim();
  if (!s) return '';
  return solarToLunarText(s);
}

function hallOf(entry: TreeEntry | undefined): string {
  const raw = (entry?.hall_name || '').trim();
  if (!raw || raw === HALL_PLACEHOLDER) return '';
  return toTraditional(raw);
}

function titleOf(entry: TreeEntry | undefined): string {
  const raw = (entry?.genealogy_name || '').trim() || (entry?.display_title || '').trim();
  return raw ? toTraditional(raw) : '';
}

/** 空态（**真·无人物**）：pages 空、rowCount 0、empty true、**error 不为 true** */
function emptyBook(title: string, hall: string): WenpuBook {
  return { pages: [], title, hall, rowCount: 0, empty: true };
}

/** **读失败**（网络错误 / 非 2xx / 树不存在 404）：empty false、pages 空、rowCount 0、error true
 *  —— 视图层据此走**纸外**失败提示（与「真·无人物」不得渲染同一文案） */
function errorBook(title: string, hall: string): WenpuBook {
  return { pages: [], title, hall, rowCount: 0, empty: false, error: true };
}

/**
 * 生成整本「在线文谱」。
 *
 * @param treeId 家族树 id（读 `/people/` 与 `/families/` 的 `X-Tree-Id`）
 * @returns 纯数据书稿（已繁体化；视图层零转换）
 */
export async function buildWenpuBook(treeId: string): Promise<WenpuBook> {
  let title = '';
  let hall = '';
  try {
    const [meta, list, families] = await Promise.all([
      fetchTreeMetaRemote(),
      fetchPersonList(treeId, 0, 0),
      fetchFamilyList(treeId),
    ]);
    const entry: TreeEntry | undefined = (meta as TreeMeta)?.trees?.[treeId];
    title = titleOf(entry);
    hall = hallOf(entry);

    const people: PersonSummary[] = (list?.data || []).filter(Boolean);
    if (!people.length) return emptyBook(title, hall);

    /** **起点（始祖）handle** —— W-17 回退链（tree-meta 缺 founder 时按本姓 + 无父家族逐级回退） */
    const founderHandle = founderHandleOf(entry, people, families);
    /** 本树姓氏（姓名书写口径 R1 / R2 的判据）—— W-18 取值链（第 ③ 级 = 上一步推断出的始祖 `surname`） */
    const rootSurname = rootSurnameOf(entry, people, families);

    // ---- 索引（全部来自读 API 的可见集合）----
    const byHandle = new Map<string, PersonSummary>();
    for (const p of people) byHandle.set(p.handle, p);

    /** 父家族 + 行第（该家族 `child_handles` 位次，1 起）：首见为准 */
    const parentPos = new Map<string, number>();
    /** 作为父母（父 / 母）所在的家族，按服务端返回序 */
    const asParentFams = new Map<string, FamilySummary[]>();
    for (const fam of families) {
      fam.child_handles.forEach((ch, idx) => {
        if (!parentPos.has(ch)) parentPos.set(ch, idx + 1);
      });
      for (const ph of [fam.father_handle, fam.mother_handle]) {
        if (!ph) continue;
        const arr = asParentFams.get(ph);
        if (arr) arr.push(fam);
        else asParentFams.set(ph, [fam]);
      }
    }

    /** 某人的**配偶** handle（共处同一 family 的另一方；仅本树内可见者） */
    const spousesOf = (handle: string): string[] => {
      const out: string[] = [];
      for (const fam of asParentFams.get(handle) || []) {
        const other = fam.father_handle === handle ? fam.mother_handle : fam.father_handle;
        if (other && other !== handle && byHandle.has(other)) out.push(other);
      }
      return out;
    };

    /** 某人的**子女** handle（按各家族 `child_handles` 位次；仅本树内可见者） */
    const childHandlesOf = (handle: string): string[] => {
      const out: string[] = [];
      for (const fam of asParentFams.get(handle) || []) {
        for (const ch of fam.child_handles) if (byHandle.has(ch)) out.push(ch);
      }
      return out;
    };

    // ---- W-19 女儿线整支终止：女儿 = 本姓 + `gender === 'F'` + **本人被某家族 `child_handles` 收录** ----
    //      **不得**用「本姓 F 且是某家族的母亲」判（媳妇会被误判 ⇒ 连带删掉其本姓丈夫 ——
    //      例：季氏树 季凤伶 `parent_family=''` 且不在任何 `child_handles` 里 ⇒ 媳妇、不是女儿）。
    //      E = 各女儿的**配偶** + **女儿线后代**（沿 `child_handles` 向下：女儿 → 子女 → 孙辈…）**及其配偶**；
    //      **女儿本人不入 E**、姻亲（配偶）**不再向外延伸**；**可见集 = 全部节点 − E**。
    const excluded = new Set<string>();
    if (rootSurname) {
      const asChildHandle = childHandlesSet(families);
      const bloodQueue: string[] = [];
      const seenBlood = new Set<string>();
      /** 女儿线**后代**（血亲）：入 E，并顺带纳入其**配偶**（姻亲、不再延伸） */
      const addDescendant = (handle: string): void => {
        if (seenBlood.has(handle)) return;
        seenBlood.add(handle);
        excluded.add(handle);
        for (const s of spousesOf(handle)) excluded.add(s);
        bloodQueue.push(handle);
      };
      for (const p of people) {
        if (p.gender !== 'F' || p.surname !== rootSurname || !asChildHandle.has(p.handle)) continue;
        for (const s of spousesOf(p.handle)) excluded.add(s); // 女儿的配偶（**女儿本人不排除**）
        for (const c of childHandlesOf(p.handle)) addDescendant(c);
      }
      while (bloodQueue.length) {
        const handle = bloodQueue.pop() as string;
        for (const c of childHandlesOf(handle)) addDescendant(c);
      }
    }

    /** 配偶 handle（共处同一 family 的另一方；本树内可见且**不在 E 内**者优先，空串 = 无） */
    const spouseOf = (handle: string): string =>
      spousesOf(handle).find((h) => !excluded.has(h)) || '';

    /** 子女（顺序 = child_handles 位次；服务端裁剪后不可见者 / **E 内者**一律**不渲染、不计数**） */
    const childrenOf = (handle: string): PersonSummary[] => {
      const out: PersonSummary[] = [];
      const seen = new Set<string>();
      for (const ch of childHandlesOf(handle)) {
        if (seen.has(ch) || excluded.has(ch)) continue;
        seen.add(ch);
        const child = byHandle.get(ch);
        if (child) out.push(child);
      }
      return out;
    };

    // ---- 世系序 = 世代优先（层序 / BFS）+ 配偶紧随本人（同一辈排完才进下一辈）----
    //      起点 = W-17 回退链（`founderHandle`）；逐代队列按入队顺序处理：
    //      ① 输出本人行 → ② 本人行的配偶立即紧随（配偶行不输出「行第」）
    //      → ③ 本人行与配偶行都把可见子女（child_handles 位次）追加到下一代队列（visited 去重）
    const ordered: Array<{ person: PersonSummary; isSpouse: boolean }> = [];
    const visited = new Set<string>();
    /** 收集某人的可见子女（按 child_handles 位次）追加到下一代队列；已输出者跳过 */
    const enqueueChildren = (
      handle: string,
      next: Array<{ handle: string; isSpouse: boolean }>,
    ): void => {
      for (const child of childrenOf(handle)) {
        if (!visited.has(child.handle)) next.push({ handle: child.handle, isSpouse: false });
      }
    };
    // 起点若落在 E 内（本姓男性始祖不可能落在女儿线闭包里，此为**防御性空转**）⇒ 视为无起点
    let generation: Array<{ handle: string; isSpouse: boolean }> =
      founderHandle && !excluded.has(founderHandle) ? [{ handle: founderHandle, isSpouse: false }] : [];
    while (generation.length) {
      const nextGeneration: Array<{ handle: string; isSpouse: boolean }> = [];
      for (const item of generation) {
        if (!item.handle || visited.has(item.handle)) continue;
        const person = byHandle.get(item.handle);
        if (!person) continue;
        visited.add(item.handle);
        ordered.push({ person, isSpouse: item.isSpouse });
        if (!item.isSpouse) {
          const sp = spouseOf(item.handle);
          if (sp && !visited.has(sp)) {
            const spouse = byHandle.get(sp);
            if (spouse) {
              visited.add(sp);
              ordered.push({ person: spouse, isSpouse: true });
              enqueueChildren(sp, nextGeneration);
            }
          }
        }
        enqueueChildren(item.handle, nextGeneration);
      }
      generation = nextGeneration;
    }

    // ---- 不可达孤立节点：追加在全部可达内容之后，按 gramps_id 升序（不丢内容；**E 内成员一概不出现**）----
    const rest = people
      .filter((p) => !visited.has(p.handle) && !excluded.has(p.handle))
      .sort(compareByGrampsId);
    for (const p of rest) ordered.push({ person: p, isSpouse: false });

    // ---- 每人一条栏序（一栏 = 一条数据）----
    const colsOf = (person: PersonSummary, isSpouse: boolean): WenpuCol[] => {
      const cols: WenpuCol[] = [];
      // ① 姓名（**姓名书写口径**：本姓只写名 / 外姓「姓氏 名」/ 空姓「氏 名」）
      pushRecord(cols, displayName(person, rootSurname), true);
      // ② 行第（配偶行不输出）
      if (!isSpouse) {
        const pos = parentPos.get(person.handle) || 0;
        if (pos > 0) pushRecord(cols, '行' + chineseNum(pos));
      }
      // ③ 生于 <农历>（**W-20**：命中 ISO ⇒ 既有农历口径；**有值但非 ISO** ⇒ `生年不详`；缺项 ⇒ 整条跳过）
      const bornDate = (person.birth_date || '').trim();
      if (bornDate) pushRecord(cols, isIsoDate(bornDate) ? '生于' + lunarOf(bornDate) : BIRTH_UNKNOWN);
      // ④ 在世 / 卒于 <农历>（**W-20**：命中 ISO ⇒ 既有农历口径；**有值但非 ISO** ⇒ `卒年不详`；
      //    缺卒年且 `is_living === false` ⇒ `卒年不详`；缺卒年且非 `false` ⇒ 既有 `在世` 不动）
      const diedDate = (person.death_date || '').trim();
      if (diedDate) {
        pushRecord(cols, isIsoDate(diedDate) ? '卒于' + lunarOf(diedDate) : DEATH_UNKNOWN);
      } else if (person.is_living === false) {
        pushRecord(cols, DEATH_UNKNOWN);
      } else if (person.is_living) {
        pushRecord(cols, '在世');
      }
      // ⑤ 葬于 <death_place>
      const buried = (person.death_place || '').trim();
      if (buried) pushRecord(cols, '葬于' + buried);
      // ⑥ 子女数串「子N女M」（**只数 'M' / 'F'**、只写非 0 项、汉字数字；无 M / F ⇒ 计数归零 ⇒ 整条跳过）
      const kids = childrenOf(person.handle);
      const sons = kids.filter((c) => c.gender === 'M');
      const daughters = kids.filter((c) => c.gender === 'F');
      const countText =
        (sons.length ? '子' + chineseNum(sons.length) : '') +
        (daughters.length ? '女' + chineseNum(daughters.length) : '');
      if (countText) pushRecord(cols, countText);
      // ⑦ 子女逐条（顺序 = child_handles 位次；标签按性别各自计数）
      //    性别未知（gender 非 'M' / 'F'）⇒ **不计数、不加标签**，只输出**姓名书写口径**产物（不自造「子女」「幼」类标签）
      let sonOrder = 0;
      let daughterOrder = 0;
      for (const child of kids) {
        if (child.gender === 'M') {
          sonOrder += 1;
          pushRecord(cols, childLabel('子', sonOrder) + ' ' + displayName(child, rootSurname));
        } else if (child.gender === 'F') {
          daughterOrder += 1;
          pushRecord(cols, childLabel('女', daughterOrder) + ' ' + displayName(child, rootSurname));
        } else {
          pushRecord(cols, displayName(child, rootSurname));
        }
      }
      return cols;
    };

    // ---- 行（栏数 > 30 → 多余栏挤占下一行，同样占行位）----
    const rows: WenpuRow[] = [];
    for (const item of ordered) {
      const cols = colsOf(item.person, item.isSpouse);
      const rowBase = {
        handle: item.person.handle,
        grampsId: item.person.gramps_id || '',
        name: toTraditional(item.person.name),
        isSpouse: item.isSpouse,
      };
      if (!cols.length) {
        rows.push({ ...rowBase, cols: [] });
        continue;
      }
      for (let i = 0; i < cols.length; i += WENPU_COLS_PER_ROW) {
        rows.push({ ...rowBase, cols: cols.slice(i, i + WENPU_COLS_PER_ROW) });
      }
    }
    if (!rows.length) return emptyBook(title, hall);

    // ---- 分页（每页 4 行、不足补 null；书口 = 谱名 / 堂号 + 汉字页码）----
    const pages: WenpuPage[] = [];
    for (let i = 0; i < rows.length; i += WENPU_ROWS_PER_PAGE) {
      const slice: (WenpuRow | null)[] = rows.slice(i, i + WENPU_ROWS_PER_PAGE);
      while (slice.length < WENPU_ROWS_PER_PAGE) slice.push(null);
      const leftNo = 2 * pages.length + 1;
      const rightNo = leftNo + 1;
      pages.push({
        rows: slice,
        leftLabel: '▲ ' + title + ' 頁' + chineseNum(leftNo),
        rightLabel: hall ? '▲ ' + hall + ' 頁' + chineseNum(rightNo) : '',
      });
    }
    return { pages, title, hall, rowCount: rows.length, empty: false };
  } catch {
    // 读失败（网络错误 / 非 2xx / **树不存在 404**）⇒ **不得**静默当作 `empty:true`：
    // 以 `error:true` + `empty:false` 交视图层走**纸外**失败提示（与「真·无人物」可分辨）
    return errorBook(title, hall);
  }
}
