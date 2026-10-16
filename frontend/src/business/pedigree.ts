/**
 * 世系树构建 — 纯业务逻辑（跨端复用）
 *
 * 输入: 人物列表 + 家族列表（Gramps-Web API 数据）
 * 输出: 多根森林树结构（ECharts tree 兼容）
 *
 * 规则:
 * - 根 = 无法确定父母的人物（parent_family_list 为空）
 * - 配偶以"父亲 + 母亲"节点对出现，子女挂在家族下
 * - 同一人出现在多个家庭时，按主家庭归属
 */

import type { PersonSummary } from './types';
import type { FamilySummary, ClanMirrorNode, ClanBranch } from './api';
import { personIdDisplay } from './format';

/**
 * 「外树子女镜像」判据（简单判据，不看本姓）：
 * `external_mirror === 'true'` 且 `external_link_type === 'child'`。
 * 与后端人数口径同源（compat-api lib/family-population.js 家族人数口径里的同一判据）。
 * 仅用于家族树树图绘制：这类节点是「本姓女性嫁出后所生子女」在娘家的镜像占位，
 * 真身在夫家树（数据零写入，节点本身必须保留）。
 */
function isChildMirrorPerson(p: PersonSummary | undefined): boolean {
  return !!p && String(p.external_mirror) === 'true' && p.external_link_type === 'child';
}

export interface TreePersonNode {
  name: string;
  handle: string;
  gramps_id: string;
  gender: 'M' | 'F' | 'U';
  is_living: boolean;
  birth_date?: string;
  death_date?: string;
  /** 跨树链接：目标家族树 id（分迁占位 / 出嫁） */
  external_tree?: string;
  /** 跨树链接：目标树内人物 handle */
  external_person_handle?: string;
  /** 跨树链接类型：branch=分迁占位 / marriage=出嫁 */
  external_link_type?: string;
  /** 配偶姓名（family 中对方家长；用于夫妇卡第二行起“娶 XX / 嫁 XX”（性别未知仍「配XX」），嫁入成员因此上卡） */
  spouseNames?: string[];
  /** 称号串（封号·谥号·号，按固定顺序；详情文档 attributes 派生）——卡片姓名后追加 */
  titles?: string;
  /** 外树镜像节点标记（嫁娶生成） */
  external_mirror?: string;
  /** ECharts 节点样式 */
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number | number[];
  };
  /** 方案B 名卡：自适应卡宽/卡高（ECharts per-node symbolSize） */
  symbolSize?: [number, number];
  /** 方案B 名卡：按卡宽截断后的显示文本（tooltip 仍显全名） */
  _cardText?: string;
  /**
   * 卡面「可见入口 chip」所在的 **0 基行下标**（渲染期由 `decorateTree` 按**实际行序**烘入；
   * 与 `_lineCount` 一起供 `cardChipHit` 算命中带 —— chip 不必是末行，注记行排在配偶行之前）。
   */
  _chipLineIndex?: number;
  /** 卡面文本总行数（渲染期由 `decorateTree` 烘入；命中带按「行心 ± 半步长」算） */
  _lineCount?: number;
  /** ECharts per-node label 覆盖（关键节点标注：卡面文字主题色） */
  /** rich = ECharts 次级行样式块（弱化行字号/颜色），可选 */
  label?: { color?: string; rich?: Record<string, { fontSize?: number; color?: string }> };
  children?: TreePersonNode[];
  _is_root?: boolean;
  _family_handle?: string;
}

/**
 * 树种类分面（**唯一判据**）——与后端 `cloudfunctions/compat-api/lib/family-population.js` 的
 * `treeKind()` 同口径：`is_master===true || kind==='master'` → `'master'`（世本/总谱）；
 * `kind==='clan'` → `'clan'`（祖谱）；其余含 `kind` 缺省 → `'family'`（家族树）。
 * 前端由 `business/index.ts` 的 `treeKindOf(tree-meta entry)` 取同一口径后传本函数。
 */
export type PedigreeTreeKind = 'master' | 'clan' | 'family';

/**
 * 构建世系森林
 *
 * @param opts.founderGrampsId 指定始祖 gramps_id：以始祖为唯一根构建整条世系
 *   （始祖是具体人物，图上直接以真实人物为根，可点击查看/编辑）。
 *   未指定或找不到时，按多根构建，并排除「配偶姻亲」根（其子女已挂在配偶血缘支系下，
 *   避免同一批子女在图示中被重复渲染）。
 * @param opts.excludeChildMirrors 排除「外树子女镜像」（external_mirror='true' 且
 *   external_link_type='child'）：该节点连同其子树整支不进入森林。缺省 false = 既有行为逐字不变。
 *   仅家族树（tree-meta 判定 kind==='family'，含缺省）使用；世本 / 祖谱不传（顶端链镜像、
 *   始祖镜像、祖谱登记镜像照旧绘制）。
 * @param opts.treeKind 本树种类分面（缺省 `'family'` = 既有行为逐字不变）。
 *   **祖谱档（`'clan'`）关闭 founder 截断**（见下），改以全树根构图；世本档 / 家族树档照旧。
 * @returns 根节点列表（每棵树的根）
 */
export function buildPedigreeForest(
  people: PersonSummary[],
  families: FamilySummary[],
  opts?: {
    founderGrampsId?: string;
    excludeChildMirrors?: boolean;
    treeKind?: PedigreeTreeKind;
  },
): TreePersonNode[] {
  const { founderGrampsId, excludeChildMirrors = false, treeKind = 'family' } = opts || {};

  // ---- 祖谱档（kind==='clan'）：全树根构图，**不做 founder 截断** ----
  // 祖谱的 tree-meta.founder_handle 是「本宗自有支系的下端点」（= 各普通家族树认祖的落点），
  // 它之上还挂着「上游世本镜像段」。按 founder 单根向下画会把上游镜像段截在②段之外
  // （派单方 2026-10-16 实测 ji_23395：②段图上只剩一个节点、与①段的「季行父」之间无连线）。
  // 祖谱档因此不传 founderGrampsId ⇒ 走下方「多根构建」⇒ 上游世本镜像段 + 本宗自有世代 +
  // 下游支系登记镜像进**同一张图**并连成一条链。
  // ⚠️ founder_handle 是**数据真源、不改**（祖谱页②段的「本宗支系入口节点档案」按钮仍以它为准）；
  // 本处只改「图示以谁为根」，与数据层无关。
  const effectiveFounderId = treeKind === 'clan' ? undefined : founderGrampsId;

  // handle -> person
  const personMap = new Map<string, PersonSummary>();
  for (const p of people) personMap.set(p.handle, p);

  // 计算每个人的父母家族
  // person.parent_family_list 在 PersonSummary 中未定义——从 families 反推
  // 子 -> 所属家族
  const childToFamilies = new Map<string, string[]>();
  for (const f of families) {
    for (const c of f.child_handles) {
      if (!childToFamilies.has(c)) childToFamilies.set(c, []);
      childToFamilies.get(c)!.push(f.handle);
    }
  }

  // ---- 指定始祖：以始祖为唯一根构建整条世系（祖谱档已在上面关闭此截断） ----
  if (effectiveFounderId) {
    const founder = people.find((p) => p.gramps_id === effectiveFounderId);
    if (founder) {
      const node = buildWithFreshVisited(founder.handle, personMap, families, excludeChildMirrors);
      if (node) {
        node._is_root = true;
        return [node];
      }
    }
    // 始祖 gramps_id 在当前数据中不存在（如已迁出）→ 回退多根构建
  }

  // ---- 多根构建 ----
  // 根候选：不是任何家庭的子女
  const rootCandidates: string[] = [];
  for (const p of people) {
    if (!childToFamilies.has(p.handle)) rootCandidates.push(p.handle);
  }
  // 兜底：如果全部有父母（数据缺失），取没有母亲/父亲家庭的人做根
  const candidates =
    rootCandidates.length > 0 ? rootCandidates : people.map((p) => p.handle);

  // 排除配偶姻亲根：
  // - 配偶在本树中且配偶不属于根候选（配偶在血缘链上）→ 本人排除，子女挂在配偶支系下
  // - 配偶也是根候选（始祖夫妇）→ 保留父亲（父系承继），排除母亲
  // - 单亲家族（无配偶记录）→ 保留为根（如寡母独自成支）
  const excluded = new Set<string>();
  for (const h of candidates) {
    const spouseFamilies = families.filter(
      (f) => f.father_handle === h || f.mother_handle === h,
    );
    for (const fam of spouseFamilies) {
      const other = fam.father_handle === h ? fam.mother_handle : fam.father_handle;
      if (!other || !personMap.has(other)) continue; // 单亲家族 → 保留
      if (!rootCandidates.includes(other)) {
        excluded.add(h); // 配偶在血缘链上 → 排除本人
        break;
      }
      if (fam.mother_handle === h) {
        excluded.add(h); // 始祖夫妇 → 排除母亲
        break;
      }
    }
  }
  const effectiveRoots = candidates.filter((h) => !excluded.has(h));

  // 防止环的访问集合
  const visited = new Set<string>();

  function buildNode(handle: string): TreePersonNode | null {
    if (visited.has(handle)) return null;
    const person = personMap.get(handle);
    if (!person) return null;
    visited.add(handle);

    const node: TreePersonNode = {
      name: person.name,
      handle: person.handle,
      gramps_id: person.gramps_id,
      gender: person.gender || 'U',
      is_living: person.is_living,
      birth_date: person.birth_date,
      death_date: person.death_date,
      titles: person.titles,
      external_mirror: person.external_mirror,
      external_tree: person.external_tree,
      external_person_handle: person.external_person_handle,
      external_link_type: person.external_link_type,
      itemStyle: { color: person.gender === 'M' ? '#5D8AA8' : person.gender === 'F' ? '#C97B84' : '#8B8B8B' },
    };

    // 找该人作为父亲/母亲的家族，取其子女
    const children: TreePersonNode[] = [];
    const seenChild = new Set<string>();

    // 该人作为家长的所有家族
    const spouseFamilies = families.filter(
      (f) => f.father_handle === handle || f.mother_handle === handle,
    );

    for (const fam of spouseFamilies) {
      for (const childHandle of fam.child_handles) {
        if (seenChild.has(childHandle)) continue;
        seenChild.add(childHandle);
        const child = buildNode(childHandle);
        if (child) {
          child._family_handle = fam.handle;
          children.push(child);
        }
      }
    }

    // 夫妇卡：收集本人生育家庭的对方家长（配偶/嫁入成员）姓名
    const spouseNames: string[] = [];
    const seenSpouse = new Set<string>();
    for (const fam of spouseFamilies) {
      const other = fam.father_handle === handle ? fam.mother_handle : fam.father_handle;
      if (other && !seenSpouse.has(other) && personMap.has(other)) {
        seenSpouse.add(other);
        const sn = personMap.get(other)?.name;
        if (sn) spouseNames.push(sn);
      }
    }
    if (spouseNames.length) node.spouseNames = spouseNames;

    if (children.length > 0) node.children = children;
    return node;
  }

  const forest: TreePersonNode[] = [];
  for (const rootHandle of effectiveRoots) {
    // 每个根重新建立 visited（多棵树独立）
    // 但共用 visited 会丢节点，这里对每个根用独立 visited
    const node = buildWithFreshVisited(rootHandle, personMap, families, excludeChildMirrors);
    if (node) {
      node._is_root = true;
      forest.push(node);
    }
  }

  return forest;
}

function buildWithFreshVisited(
  handle: string,
  personMap: Map<string, PersonSummary>,
  families: FamilySummary[],
  excludeChildMirrors = false,
): TreePersonNode | null {
  const visited = new Set<string>();

  function build(handle: string): TreePersonNode | null {
    if (visited.has(handle)) return null;
    const person = personMap.get(handle);
    if (!person) return null;
    // 家族树：外树子女镜像连同其子树整支不入图（不遍历其子女，也不占用 visited）
    if (excludeChildMirrors && isChildMirrorPerson(person)) return null;
    visited.add(handle);

    const node: TreePersonNode = {
      name: person.name,
      handle: person.handle,
      gramps_id: person.gramps_id,
      gender: person.gender || 'U',
      is_living: person.is_living,
      birth_date: person.birth_date,
      death_date: person.death_date,
      titles: person.titles,
      external_mirror: person.external_mirror,
      external_tree: person.external_tree,
      external_person_handle: person.external_person_handle,
      external_link_type: person.external_link_type,
      itemStyle: {
        color:
          person.gender === 'M' ? '#5D8AA8' : person.gender === 'F' ? '#C97B84' : '#8B8B8B',
      },
    };

    const children: TreePersonNode[] = [];
    const seenChild = new Set<string>();
    const spouseFamilies = families.filter(
      (f) => f.father_handle === handle || f.mother_handle === handle,
    );

    for (const fam of spouseFamilies) {
      for (const childHandle of fam.child_handles) {
        if (seenChild.has(childHandle)) continue;
        seenChild.add(childHandle);
        const child = build(childHandle);
        if (child) {
          child._family_handle = fam.handle;
          children.push(child);
        }
      }
    }

    // 夫妇卡：收集本人生育家庭的对方家长（配偶/嫁入成员）姓名
    const spouseNames: string[] = [];
    const seenSpouse = new Set<string>();
    for (const fam of spouseFamilies) {
      const other = fam.father_handle === handle ? fam.mother_handle : fam.father_handle;
      if (other && !seenSpouse.has(other) && personMap.has(other)) {
        seenSpouse.add(other);
        const sn = personMap.get(other)?.name;
        if (sn) spouseNames.push(sn);
      }
    }
    if (spouseNames.length) node.spouseNames = spouseNames;

    if (children.length > 0) node.children = children;
    return node;
  }

  return build(handle);
}

/**
 * 森林扁平化：方便查找某人在树中的位置
 */
export function flattenForest(forest: TreePersonNode[]): TreePersonNode[] {
  const out: TreePersonNode[] = [];
  function walk(node: TreePersonNode) {
    out.push(node);
    if (node.children) node.children.forEach(walk);
  }
  forest.forEach(walk);
  return out;
}

/* ---- 祖谱图谱：节点注记与**卡面可见入口**（纯函数；渲染期现算 —— 不读任何 DOM 事件） ---- */

/**
 * 卡面行距（px）：与 `components/tree-pedigree/tree-pedigree.vue` 的 `CARD_LINE_STEP` **同值**
 * （改动其一必须同步另一处，否则卡面 chip 的命中判据与画面对不上）。
 */
export const CARD_CHIP_LINE_STEP = 22;

/**
 * 卡面可见入口（chip）命中判据：点击点相对**卡片中心**的纵向偏移 `dyFromCenter` 落在该 chip
 * **实际所在行**的条带内 ⇒ 命中该 chip（卡片以节点布局点为心：ECharts 矩形 symbol 居中）。
 *
 * ⚠️ 行序口径（2026-10-16 缺陷修正）：`decorateTree` 的行序是
 * 「姓名 / 关键节点 / 第N世 / 外树镜像角标 / **宿主注记行（角标 → 始祖 → 落点 → chip）** / 配偶行」
 * —— 注记行排在**配偶行之前** ⇒ **chip 不一定是末行**。旧实现按「末行」算固定阈值
 * （`dyFromCenter >= cardHeight / 2 - STEP - slack`），一旦该节点有配偶行，命中带会**错位到
 * 倒数第二行**（相邻行的点击被吃成「打开支系」）。现按**实际行序**算：
 * 行 i 的行心相对卡心 = `(i - (n-1)/2) * STEP`（卡高 = `CARD_H + (n-1) * STEP`，首行行心 = 卡顶 + `CARD_H/2`），
 * 条带 = 行心 ± `STEP/2`，下沿再放宽 `slack` px 便于触屏点中。
 *
 * 为什么需要它：可见入口画在 ECharts 卡面上（渲染期即有 ⇒ **不需要右键 / 长按就能看见并点到**），
 * 而「点 chip」与「点卡面其余处（打开真身档案）」同属一次 canvas `click` 事件（canvas 内没有 DOM
 * 冒泡可分），故由本判据把两种意图分开 —— 命中 chip 时不再下沉主点击行为（等价 `stopPropagation`）。
 *
 * @param dyFromCenter 点击点相对**卡片中心**的纵向偏移（px，正 = 向下）
 * @param lineCount 卡面文本总行数（`_lineCount`；`decorateTree` 渲染期烘入）
 * @param lineIndex chip 所在行的 0 基下标（`_chipLineIndex`；同上一处烘入）
 * @param slack 下沿放宽量（px）
 */
export function cardChipHit(
  dyFromCenter: number,
  lineCount: number,
  lineIndex: number,
  slack = 4,
): boolean {
  if (!Number.isFinite(dyFromCenter) || !Number.isFinite(lineCount) || !Number.isFinite(lineIndex)) {
    return false;
  }
  if (lineCount < 1 || lineIndex < 0 || lineIndex >= lineCount) return false;
  const center = (lineIndex - (lineCount - 1) / 2) * CARD_CHIP_LINE_STEP;
  const half = CARD_CHIP_LINE_STEP / 2;
  return dyFromCenter >= center - half && dyFromCenter <= center + half + slack;
}

/**
 * 祖谱图谱的**节点注记**（handle → 注记；= `tree-pedigree.vue` 的 `nodeAnnotations` 入参形状）。
 * 三类节点视觉可辨 + 下游支系登记镜像的次级信息**全部落在卡面上**（渲染期即画，不依赖右键/长按）：
 * - `badge`：卡面次级行角标（上游镜像「中华世本 · 只读」/ 下游登记镜像「<支系树> · N 人 · 只读」）；
 * - `founderText`：**支系始祖姓名行**（形如「始祖：季花」；2026-10-16 缺陷修正 —— 原①③段并入图谱后
 *   支系始祖姓名一度无任何可见面，现落到卡面上）；
 * - `anchorText`：挂靠落点文案（形如「挂于 季行父（000000162）之下」）；
 * - `chipLabel`：**卡面可见入口**文案（形如「📂 打开〈季氏费县白露家族〉」；行序**不固定为末行** ——
 *   注记行整体排在配偶行之前，命中带按实际行序算，见 `cardChipHit`）；
 * - `openTreeId` / `openTreeLabel`：入口目标（该支系家族树 tree_id / 展示名）。
 * 主点击行为不变（镜像节点点卡面仍走「打开真身档案」）。
 */
export interface PedigreeNodeAnnotation {
  badge?: string;
  /** 支系始祖姓名行（「始祖：X」；缺姓名 ⇒ 不出现该行） */
  founderText?: string;
  openTreeId?: string;
  openTreeLabel?: string;
  anchorText?: string;
  chipLabel?: string;
}

/**
 * 下游支系登记镜像的**卡面入口数据**（纯函数：只吃数据、不吃事件 ⇒ 渲染期即有值，非右键菜单回调产物）。
 *
 * @param input.treeId 该登记镜像的真身所在家族树（`external_tree`）
 * @param input.treeTitle 该支系家族树展示名（tree-meta display_title / 支系行 tree_title）
 * @param input.founderName 该支系始祖姓名（`clanInfo.branches[].founder_name`；缺 ⇒ 不写这一行，不臆断）
 * @param input.personCount 该支系人数（取不到 ⇒ 角标不带人数，不写 0 冒充）
 * @param input.anchorText 挂靠落点文案（「挂于 X（编号）之下」；取不到 = 「未挂落点」）
 */
export function buildClanRegistrationEntry(input: {
  treeId: string;
  treeTitle: string;
  personCount?: number;
  founderName?: string;
  anchorText: string;
}): PedigreeNodeAnnotation {
  const treeId = String(input.treeId || '').trim();
  const title = String(input.treeTitle || '').trim() || treeId;
  const count =
    typeof input.personCount === 'number' && Number.isFinite(input.personCount)
      ? `${input.personCount} 人`
      : '';
  const founderName = String(input.founderName || '').trim();
  return {
    badge: [title, count, '只读'].filter(Boolean).join(' · '),
    founderText: founderName ? `始祖：${founderName}` : undefined,
    openTreeId: treeId,
    openTreeLabel: title,
    anchorText: input.anchorText,
    chipLabel: `📂 打开〈${title}〉`,
  };
}

/**
 * 该 handle 在本祖谱 families 里的父节点 handle（作为子女的家族：**父槽优先，缺 → 母槽**）。
 * 只吃数据（`FamilySummary` 的 child_handles / father_handle / mother_handle），无 IO。
 */
export function clanParentHandleOf(families: FamilySummary[], handle: string): string {
  for (const f of families) {
    if (!(f.child_handles || []).includes(handle)) continue;
    if (f.father_handle) return f.father_handle;
    if (f.mother_handle) return f.mother_handle;
  }
  return '';
}

/**
 * 登记镜像的**挂靠落点**文案（原单 P-4）：落点 = 该**登记镜像节点**在本祖谱 families 里的父节点
 * （`clanParentHandleOf`），姓名 / 编号取本祖谱 people；取不到 ⇒「未挂落点」（不臆断）。
 */
export function clanAnchorTextOf(
  people: PersonSummary[],
  families: FamilySummary[],
  mirrorHandle: string,
): string {
  const h = clanParentHandleOf(families, mirrorHandle);
  const p = h ? people.find((x) => x.handle === h) : undefined;
  if (!p) return '未挂落点';
  return `挂于 ${p.name}（${personIdDisplay(p.gramps_id)}）之下`;
}

/* ---- 祖谱图谱：支系登记镜像的**数据源**与「上图/兜底」分流（纯函数；只吃数据） ---- */

/**
 * **支系登记镜像**（本祖谱自有段上、指向某棵普通家族树始祖真身的只读登记节点）——
 * 一条登记 = 一个支系入口（后端 `lib/clan.js` 的 `clanBranchRegistrations()` 口径）。
 *
 * ⚠️ **数据源口径（2026-10-16 缺陷修正）**：一律从「**本祖谱树内 people**」现算，
 * **不得**取 `clanInfo.mirrors` —— 后端 `clanInfo.mirrors` = `clanMirrorNodes(tree, master_tree_id)`
 * = **只含顶端世本镜像段**（`external_tree === master_tree_id` / 或 `mir_<真身handle>` 句柄口径），
 * 自有段登记镜像**不在其中**（真源实测：季/顾/秦三祖谱的 季花 / 顾清学 / 秦老太爷 三条登记镜像
 * 均不在 `mirrors` 内）⇒ 取 `mirrors` 会让登记镜像**恒为零**，卡面角标 / 来源树 / 人数 / 落点 / 入口
 * chip 全部拿不到。
 */
export interface ClanRegistrationMirror {
  /**
   * 本祖谱内登记镜像节点的 handle = **图上节点 handle**
   * ⇒ 注记归属（`nodeAnnotations`）与「是否已画进图谱」（兜底列表判据）**只用它**，
   * 绝不与 `ClanBranch.founder_handle`（= 家族树内**真身**的 handle，兄弟树命名空间）互比。
   */
  handle: string;
  gramps_id: string;
  /** 登记镜像节点姓名（真源形态下即该支系始祖姓名） */
  name: string;
  /** 该登记镜像真身所在的**普通家族树** tree_id（`external_tree`） */
  tree_id: string;
  /** 该家族树内真身（始祖）handle（`external_person_handle`；打开真身档案用） */
  upper_handle: string;
  link_type: string;
}

/**
 * 本祖谱自有段的支系登记镜像清单（= 后端 `clanBranchRegistrations(tree, clanTreeId, meta)` 的前端同口径）。
 * 判据三条齐备，缺一不算：`external_mirror === 'true'` + `external_link_type === 'founder'`
 * + `external_tree` 指向一棵**普通家族树**（`isFamilyTree`；指向世本 / 本祖谱自身的挂载镜像不算支系入口）；
 * 同一 tree_id 只算一条（首条为准，与后端 `seen` 集合同序）。
 *
 * @param people 本祖谱树内 people（路由 `GET /people/?profile=all`；宿主已有的 `ownPeople`）
 * @param isFamilyTree 目标树是否普通家族树（宿主传 `treeKindOf(treeMetaByTree[tid]) === 'family'`，
 *   与后端 `treeKindOf(entry) !== 'family'` 同口径 ⇒ **不在祖谱页另造第三套 kind 判定**）
 * @param clanTreeId 本祖谱 tree_id（指向本祖谱自身的镜像不算支系入口）
 */
export function clanRegistrationMirrors(
  people: PersonSummary[],
  isFamilyTree: (treeId: string) => boolean,
  clanTreeId = '',
): ClanRegistrationMirror[] {
  const out: ClanRegistrationMirror[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    if (String(p?.external_mirror || '') !== 'true') continue;
    if (String(p?.external_link_type || '') !== 'founder') continue;
    const tid = String(p?.external_tree || '').trim();
    if (!tid || tid === clanTreeId || seen.has(tid)) continue;
    if (!isFamilyTree(tid)) continue;
    seen.add(tid);
    out.push({
      handle: p.handle,
      gramps_id: p.gramps_id,
      name: p.name,
      tree_id: tid,
      upper_handle: String(p.external_person_handle || ''),
      link_type: 'founder',
    });
  }
  return out;
}

/**
 * 图谱节点注记（宿主 `clan-hall.vue` 的 `nodeAnnotations` 现算逻辑，纯函数以便离线自证）：
 * - 顶端镜像段（`clanInfo.mirrors`）在图上者 → `badge =「<来源树> · 只读」`；
 * - 支系登记镜像**在图上者**（判据 = **登记镜像自身 handle** 在 `drawnHandles` 内）→
 *   角标（来源树 + 人数 + 只读）+ 始祖行 + 落点文案 + 卡面可见入口 chip（`buildClanRegistrationEntry`）；
 * - 本宗自有世代真实节点 → 无注记（= 可编辑那类，`tree-manage` 只对它生效）。
 * `drawnHandles` = 同一纯函数 `buildPedigreeForest(..., {treeKind:'clan'})` + `flattenForest` 的 handle 集。
 */
export function buildClanNodeAnnotations(input: {
  /** 顶端世本镜像段（`clanInfo.mirrors`） */
  upstreamMirrors: ClanMirrorNode[];
  /** 本祖谱自有段登记镜像（`clanRegistrationMirrors(...)` 结果） */
  registrations: ClanRegistrationMirror[];
  /** 图上已绘制节点的 handle 集 */
  drawnHandles: Set<string>;
  /** 树展示名（tree-meta；取不到 → tree_id 原样） */
  treeTitleOf: (treeId: string) => string;
  /** 支系行（`clanInfo.branches` 里 tree_id 命中者）—— 树名 / 人数 / 始祖姓名取自它 */
  branchOf: (treeId: string) => ClanBranch | undefined;
  /** 挂靠落点文案（宿主按本祖谱 families 现算） */
  anchorTextOf: (mirrorHandle: string) => string;
}): Record<string, PedigreeNodeAnnotation> {
  const out: Record<string, PedigreeNodeAnnotation> = {};
  const drawn = input.drawnHandles;
  for (const m of input.upstreamMirrors) {
    if (!drawn.has(m.handle)) continue;
    out[m.handle] = { badge: `${input.treeTitleOf(m.upper_tree_id || 'zhonghua')} · 只读` };
  }
  for (const reg of input.registrations) {
    // 判据 = **登记镜像自身 handle**（图上节点 handle），不是支系真身 handle
    if (!drawn.has(reg.handle)) continue;
    const b = input.branchOf(reg.tree_id);
    out[reg.handle] = buildClanRegistrationEntry({
      treeId: reg.tree_id,
      treeTitle: b?.tree_title || input.treeTitleOf(reg.tree_id),
      // 支系始祖姓名：支系行优先，缺则回退登记镜像节点姓名（真源形态下同人）
      founderName: b?.founder_name || reg.name,
      personCount: b?.person_count,
      anchorText: input.anchorTextOf(reg.handle),
    });
  }
  return out;
}

/**
 * 「数据上存在、但画不进图谱」的兜底条目（宿主图下方的只读列表；两个入口不静默消失）：
 * - 镜像：顶端镜像段里被多根构建的「配偶姻亲根」规则排除且无人列为子女者（如孤立占位镜像）；
 * - 支系：认祖指向本祖谱、但**自有段无登记镜像**（`via` 缺省那条推导路径）⇒ 图上无落点。
 *
 * ⚠️ **支系判据（2026-10-16 缺陷修正）**：以「该支系在本祖谱内的**登记镜像 handle** 是否在图上」为准。
 * 旧实现用 `drawn.has(b.founder_handle)` —— `founder_handle` 是**家族树内真身的 handle**（如
 * `10400594…`），与**祖谱 handle 集**不同源 ⇒ 恒 false ⇒ 每个支系都掉进本列表（与上方
 * 「支系…已并入上方图谱」文案自相矛盾）。修后同一支系**不得**同时出现在图谱与兜底列表。
 */
export type ClanOffGraphRow =
  | {
      key: string;
      kind: 'mirror';
      name: string;
      sub: string;
      /** 支系始祖姓名行（镜像行恒空） */
      founderText: string;
      mirror: ClanMirrorNode;
    }
  | {
      key: string;
      kind: 'branch';
      name: string;
      sub: string;
      /** 支系始祖姓名行（形如「始祖：季花」；真源缺 `founder_name` ⇒ 空串，不臆断） */
      founderText: string;
      branch: ClanBranch;
    };

export function buildClanOffGraphEntries(input: {
  upstreamMirrors: ClanMirrorNode[];
  registrations: ClanRegistrationMirror[];
  branches: ClanBranch[];
  drawnHandles: Set<string>;
  treeTitleOf: (treeId: string) => string;
}): ClanOffGraphRow[] {
  const rows: ClanOffGraphRow[] = [];
  const drawn = input.drawnHandles;
  for (const m of input.upstreamMirrors) {
    if (drawn.has(m.handle)) continue;
    const treeId = String(m.upper_tree_id || 'zhonghua').trim();
    const title = input.treeTitleOf(treeId);
    rows.push({
      key: `m-${m.handle}`,
      kind: 'mirror',
      name: m.name,
      sub: `${title}（${treeId}）· 只读 · 编号：${personIdDisplay(m.gramps_id)}`,
      founderText: '',
      mirror: m,
    });
  }
  // 已画进图谱的支系（= 其登记镜像节点在图上）⇒ 入口由该卡片承载，**不再**落到本列表
  const onGraphBranchTreeIds = new Set<string>();
  for (const reg of input.registrations) {
    if (drawn.has(reg.handle)) onGraphBranchTreeIds.add(reg.tree_id);
  }
  for (const b of input.branches) {
    if (onGraphBranchTreeIds.has(b.tree_id)) continue;
    // 该支系若已有「顶端镜像段未上图」的镜像行承载入口，则不重复列
    if (rows.some((r) => r.kind === 'mirror' && String(r.mirror.upper_tree_id || '') === b.tree_id)) {
      continue;
    }
    const founderName = String(b.founder_name || '').trim();
    rows.push({
      key: `b-${b.tree_id}`,
      kind: 'branch',
      name: b.tree_title,
      sub: `${b.tree_id} · ${b.person_count} 人`,
      founderText: founderName ? `始祖：${founderName}` : '',
      branch: b,
    });
  }
  return rows;
}
