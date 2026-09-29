/**
 * 道具栏（背包）纯逻辑：兑换常量 + 36 栏位装配 + 插入式重排。
 *
 * 口径（Kevin 口径 v3 + `docs/economy.spec.md` §15，逐条落地；均为纯函数 / 纯数据，跨端无 DOM）：
 * - **整堆格**：竹简 `floor(bamboos_total_pieces / 100)` 格、石榴籽 `floor(seeds_total / 9999)` 格、
 *   **兰帖 `floor(Σ scrolls[].qty / 10000)` 格（单格容量 = 100 张 = 10000 片；Kevin 2026-09-29 裁定）**、
 *   石榴籽玉 **1 枚 = 1 格**；角标 = 该类的道具量上限（100 片 / 9999 颗 / **100 张** / 1 枚）；
 *   **玉格不显示数量角标**（`badge = false`，模板据此不渲染角标）；
 *   ⚠️ **兰帖格角标口径 = 张**（`片数 / 100`，可带 2 位小数；见 `SCROLL_PIECES_PER_CELL` 与
 *   `asset-text.ts` 的 `scrollZhangQty()`）—— 旧口径「角标 = 片数」已随本批作废；
 * - **玉只计未镶嵌**：`summary.jades` 里 `mounted_tree_id` 非空的玉**不入行囊、不渲染、不计格**
 *   （口径：已镶嵌玉不属于用户了）⇒ 玉格数 / 占格数 / 溢出**一律只按未镶嵌玉计**；
 * - **余数格**：竹简 / 籽 / 兰帖 `% 每格量 > 0` 时**另加 1 格**，角标显示**实际余量**
 *   （如 37 片 / 5925 颗 / 兰帖 99 片 ⇒ `0.99` 张）；**兰帖余数格自本批起可分解**
 *   （判据改为「整张数 ≥ 1」，不再以「是否整格」判定，见 `asset-inventory.vue`）；
 * - **碎片格**：`fragments > 0` 即占 1 格（1–9 片均占 1 格，0 片不占），角标显示**实际个数**（如 3）；
 *   **兰帖残页（`scroll_fragments`）**：**每 999 片占 1 格**（`ceil(片数 / 999)` 格，0 片不占；
 *   整格角标 = 999、余数格角标 = 余数 —— 沿用既有余数格体例），后端**不设拒绝阈值、不截断**；
 *   满 100 片**由用户手动**点【合成】合成 1 张兰帖（前端只提供入口与门槛判定，记账一律在后端）；
 *   **v2 的「碎片恒 0 格」与「零头行」已彻底废弃**（模板 / 样式 / 数据字段 / 逻辑一并删除，不留死代码）；
 * - **兰帖永久有效**（`ScrollLot.expires_at` 恒 `null`）⇒ 兰帖格 `expiresAtMs = Infinity`，
 *   **不排入到期排序**；提示层耐久行恒为 `耐久：9999 天`（= `asset-text.ts` 的 `durabilityLine(null)`）；
 * - **提示层正文行（Kevin 2026-09-29 逐条清单）**：六类道具一律收成「数量行 + 耐久行
 *   （`asset-text.ts` 的 `durabilityLine()`，取代旧「最近到期 / 有效期至 / 永久有效」三种形态）」。
 *   按清单**删除**的行：石榴籽玉的「1 枚」与「未镶嵌 · 可免费分解」与「1 枚石榴籽玉 = 1 格」、
 *   籽 / 竹简 / 碎片 / 兰帖残页的换算行与余数行、兰帖的「（100 片）」括注 / 分解比例行 / 行囊口径行；
 *   兰帖换算行（`KIND_CONVERT.scroll`）**Kevin 未列入删除 ⇒ 保留**（其余五类已删 ⇒ 本表仅剩 1 条）；
 * - **默认序**（**2026-09-25 变更 · 取代 Z-9**）：竹简 → 兰帖 → 兰帖残页 → 石榴籽玉 → 石榴籽 → 石榴籽碎片；
 *   同类内**到期近的在前**，永久有效的玉排该类最后，
 *   **余数格排在该类最后一个**；同到期以**稳定 id** 兜底 ⇒ 默认序确定可复现；占用格连续排 1..N，
 *   空格在 N+1..36；
 * - **溢出**：占格需求 = 标题「N / 36 格」的 N，> `SLOT_COUNT` 时前 36 格按默认序填充，
 *   **超出的道具不占格**，改为按类型汇总的溢出提示行（玉 → 「背包空间不足，无法合成」；
 *   籽 / 竹简 / 碎片 / **兰帖 / 兰帖残页** → 「空间不足，无法持有」；玉行恒在最前，
 *   其余各类按默认序：竹简 → 兰帖 → 籽 → 兰帖残页 → 石榴籽碎片）；
 * - **重排**：`moveItem` = 插入式（口径同 `docs/sibling-order.spec.md` §9 的拖曳），只在已占用格
 *   之间生效；本模块不持有任何状态 ⇒ 显示顺序由调用方（组件内存）决定，刷新即回默认序。
 */
import type { AssetsSummary, BambooLot, Jade, SeedLot } from './api';
import {
  SCROLL_FRAGMENT_NAME,
  SCROLL_ITEM_UNIT,
  SCROLL_NAME,
  durabilityLine,
  scrollZhangQty,
} from './asset-text';
import type { ScrollLot, ScrollSummaryFields } from './types';

/** 石榴籽：9999 颗 = 1 个道具 */
export const SEEDS_PER_ITEM = 9999;
/** 石榴籽玉：1 枚 = 1 个道具 */
export const JADES_PER_ITEM = 1;
/** 竹简：100 片 = 1 个道具 */
export const BAMBOO_PIECES_PER_ITEM = 100;
/** 兰帖：100 片 = 1 张（与竹简 100 片/格**数值相同、物品不同** ⇒ 各自持有常量，**不得共用**） */
export const SCROLL_PIECES_PER_ITEM = 100;
/**
 * 兰帖**单格容量** = 100 张（张数口径；Kevin 2026-09-29 裁定）。
 *
 * 由来：旧口径「1 格 = 1 张 = 100 片」⇒ 每格恒 100 片、角标恒显示片数 100；
 * 新口径「单个格子内可最多容纳 **100 张**兰帖」⇒ 网格切分分母 = `100 张 × 100 片 = 10000 片`，
 * 角标 / 提示层计数行一律按**张**显示（`片数 / 100`，可带 2 位小数）。
 * **溢出计数（按张）与默认序不因本批改变**。
 */
export const SCROLL_ITEMS_PER_CELL = 100;
/**
 * 兰帖**单格容量**（片）= `SCROLL_PIECES_PER_ITEM × SCROLL_ITEMS_PER_CELL` = **10000**。
 * 本常量是切格分母的**唯一字面**（`floor(片总数 / 本值)` 个整堆格 + `% 本值` 的余数格）。
 */
export const SCROLL_PIECES_PER_CELL = SCROLL_PIECES_PER_ITEM * SCROLL_ITEMS_PER_CELL;
/** 石榴籽碎片：10 片 = 1 颗石榴籽（服务端 `fragment_cap = 9` ⇒ 实测 1–9 片，仍占 1 格） */
export const FRAGMENTS_PER_ITEM = 10;
/**
 * 兰帖残页：**每 999 片占 1 格**（**单格容纳上限 = 展示层口径**，2026-09-26 裁定；
 * 服务端 `scroll_fragment_cap = 999` 同值 ⇒ 超出部分**另起一格**，占格数 = `ceil(片数 / 本值)`；
 * 后端**不拒绝、不截断**，前端只展示、不判上限）。本常量是 `999` 的**唯一字面**。
 * 与石榴籽碎片各自持有常量，**不得共用**。
 */
export const SCROLL_FRAGMENT_PIECES_PER_CELL = 999;
/**
 * 兰帖残页**手动合成门槛**：100 片 = 1 张兰帖（服务端 `SCROLL_FRAGMENT_SYNTH_THRESHOLD = 100`）。
 * 2026-09-26 裁定：自动合成已取消 ⇒ 满此数由**用户**在残页格提示层点【合成】手动合成 1 张，
 * 前端只提供入口与门槛判定，**实际记账一律由后端完成**。与石榴籽碎片各自持有常量，**不得共用**。
 */
export const SCROLL_FRAGMENTS_PER_ITEM = 100;
/** 道具栏位总数：6 × 6 = 36 */
export const SLOT_COUNT = 36;
/** 道具栏列数（6 × 6；渲染端取本常量，避免第二套网格口径） */
export const SLOT_COLUMNS = 6;
/**
 * 行囊角标字号 / 格子（`.inv-slot-box`）边长的**固定比例** = 0.16。
 *
 * Kevin 2026-09-29 拍定：「字号偏小，约 2 倍为宜」+「它应该是固定值」⇒ 角标字号 = **实测格宽 × 本比例**
 * （原口径 = 固定 `font-size: 8px`）；先按「约 2 倍」落 **0.20**。
 * 2026-09-29 Kevin 见真机反馈：「右下角角标非常显眼，甚至略微过度显眼了」⇒ 在 0.20 的基础上下调一档至 **0.18**。
 * **2026-09-29 Kevin 当面圈定 0.16**（桌面格 `78.65625px` ⇒ **12.6px**，即最终采纳档）。
 * 实测（2026-09-29 headless Chrome，5199 实页）：
 * - 0.20 旧值：桌面格 `78.66px` ⇒ **15.7px**（≈ 原 8px 的 2 倍，即 Kevin 目测的那档）；375 宽真机格 `42.16px` ⇒ **8.4px**。
 * - 0.18 旧值：桌面格 `78.66px` ⇒ **14.2px**（≈ 原 8px 的 1.77 倍）；375 宽真机格 `42.16px` ⇒ **7.6px**。
 * - 0.16 现行值：桌面格 `78.65625px` ⇒ **12.6px**；375 宽真机格 `42.15625px` ⇒ 比例算出 `6.7px`，由
 *   `BADGE_FONT_MIN_PX` 兜到 **8px**（小屏不小于历史字号，故 375 侧实际字号/格宽 ≈ 0.19 > 本比例）。
 * **三段历史口径（0.20 ⇒ 0.18 ⇒ 0.16）逐档保留，不得删除旧描述**。
 * **不得写死单一 px**，两端（H5 / 小程序）共用本比例。
 * 量不到 / 格宽为 0 ⇒ 不写内联字号，落 CSS 兜底值（`.inv-badge` / `.inv-lock` 的 `font-size: 12px`）。
 */
export const BADGE_FONT_RATIO = 0.16;
/**
 * 行囊角标字号的**固定下限**（px）= 8。
 *
 * 口径：**角标字号固定下限 = 8px = 本批之前的写死值**（即 `.inv-badge` / `.inv-lock` 原 `font-size: 8px` 的历史档）。
 * 保证：**任何小屏 / 窄格下角标不小于历史尺寸**；与大屏侧的比例规则合读为
 * **`角标字号 = max(格宽 × BADGE_FONT_RATIO, BADGE_FONT_MIN_PX)`**。
 * **触底阈值**：格宽 < `BADGE_FONT_MIN_PX / BADGE_FONT_RATIO` = `8 / 0.16` = **50px** 时走下限
 * （此时实际字号 / 格宽 > `BADGE_FONT_RATIO`）；例：375 视口格 `42.15625px` ⇒ `max(6.7, 8)` = **8px**。
 */
export const BADGE_FONT_MIN_PX = 8;

/** 道具类型（决定图标 / 文案 / 换算 / 溢出提示）；`scroll` = 兰帖、`scrollFragment` = 兰帖碎片 */
export type InventoryKind = 'bamboo' | 'scroll' | 'jade' | 'seed' | 'scrollFragment' | 'fragment';

/** 格子形态：整堆（角标 = 该类上限）/ 余数（角标 = 实际余量）/ 碎片（角标 = 实际个数） */
export type InventorySlotKind = 'stack' | 'remainder' | 'fragment';

/** 一个道具（占 1 格） */
export interface InventoryItem {
  /** 稳定 id：v-for key + 同到期场景的兜底排序键 ⇒ 默认序可复现 */
  id: string;
  kind: InventoryKind;
  /** 格子形态（提示层据此区分整堆 / 余数 / 碎片） */
  slotKind: InventorySlotKind;
  /** 道具名（逐字：石榴籽玉 / 石榴籽 / 竹简 / 石榴籽碎片 / 兰帖 / 兰帖碎片） */
  name: string;
  /**
   * 格内角标数量：整堆 = 该类道具量上限；余数 / 碎片 = 实际数量。
   * ⚠️ **兰帖格的口径 = 张**（`片数 / 100`，可带 2 位小数，如 `100` / `0.99`；
   * Kevin 2026-09-29 裁定：角标 = 兰帖**张数**，非片数），模板**直接渲染本值**（不再二次换算）。
   */
  count: number;
  /** 是否渲染格内角标（**玉格不显示数量角标** ⇒ false；其余为 true） */
  badge: boolean;
  /** 该格对应的石榴籽玉 id（仅 `kind === 'jade'`；提示层【分解】据此回传后端） */
  jadeId?: string;
  /** 属性提示正文行：数量 + 到期 / 状态 + 换算依据（道具名单独作提示标题） */
  tooltipLines: string[];
  /** 排序用到期时间戳（ms）；永久有效 = `Infinity`（同类内排最后） */
  expiresAtMs: number;
}

/** 溢出提示行（按类型汇总；超出的道具不渲染格子） */
export interface InventoryOverflow {
  kind: InventoryKind;
  /** 该类溢出道具数 */
  count: number;
  /** 行首量词短语，如 `溢出 4 枚石榴籽玉` */
  label: string;
  /** 逐字提示文案：玉 = `背包空间不足，无法合成`；籽 / 竹简 / 碎片 = `空间不足，无法持有` */
  text: string;
}

/** `buildInventory` 的产物（只读；组件不二次推导） */
export interface Inventory {
  /** 固定 36 格：占用格连续排在前，空格为 `null` */
  slots: (InventoryItem | null)[];
  /** 溢出提示行（占格需求 > `SLOT_COUNT` 才有；溢出的道具不在 `slots` 内） */
  overflows: InventoryOverflow[];
  /** 占格道具总数（含溢出，未截断）—— 即标题「N / 36 格」的 N */
  occupiedTotal: number;
}

/** 道具名（逐字；兰帖 / 兰帖碎片取自 `asset-text.ts` 单点） */
const KIND_NAME: Record<InventoryKind, string> = {
  bamboo: '竹简',
  scroll: SCROLL_NAME,
  jade: '石榴籽玉',
  seed: '石榴籽',
  scrollFragment: SCROLL_FRAGMENT_NAME,
  fragment: '石榴籽碎片',
};

/**
 * 格内原始数量的单位（片 / 枚 / 颗 / 张）。
 * 兰帖格内原始数量 = **片数** ⇒ 单位「张」只用于整道具数（1 张 = 100 片），片数另标「片」
 * （`asset-text.ts` 的 `SCROLL_PIECES_UNIT`）；碎片类（石榴籽碎片 / 兰帖残页）一律「片」
 * （2026-09-26 量词裁定：兰帖「枚」→「张」、碎片类「个」→「片」）。
 */
const KIND_QTY_UNIT: Record<InventoryKind, string> = {
  bamboo: '片',
  scroll: SCROLL_ITEM_UNIT,
  jade: '枚',
  seed: '颗',
  scrollFragment: '片',
  fragment: '片',
};

/**
 * 溢出行的计数单位（**计的是道具 / 格数，不是原始量**）：玉按枚、兰帖按张（1 张 = 1 格；
 * 2026-09-26 量词裁定）、碎片类（石榴籽碎片 / 兰帖残页）按片；竹简 / 籽维持既有「个」（道具数）。
 */
const KIND_ITEM_UNIT: Record<InventoryKind, string> = {
  bamboo: '个',
  scroll: SCROLL_ITEM_UNIT,
  jade: '枚',
  seed: '个',
  scrollFragment: '片',
  fragment: '片',
};

/**
 * 换算依据行（逐字）。
 *
 * **2026-09-29（Kevin 逐条清单）**：石榴籽玉 / 石榴籽 / 石榴籽碎片 / 竹简 / 兰帖残页五类的换算行
 * **按清单删除** ⇒ 本表**仅剩兰帖一条**（「1 张 = 100 片兰帖」Kevin 未列入删除 ⇒ 保留；
 * 整块删掉会把这条也一起丢掉，故**保留本表 + 唯一一条**）。
 * 类型收窄为 `Record<'scroll', string>`（其余键已不存在 ⇒ 不给它们留 `undefined` 分支）。
 */
const KIND_CONVERT: Record<'scroll', string> = {
  scroll: `1 张 = ${SCROLL_PIECES_PER_ITEM} 片${SCROLL_NAME}`,
};

/** 溢出提示文案（逐字；玉与「籽 / 竹简 / 碎片 / 兰帖 / 兰帖碎片」两类） */
const KIND_OVERFLOW_TEXT: Record<InventoryKind, string> = {
  jade: '背包空间不足，无法合成',
  seed: '空间不足，无法持有',
  bamboo: '空间不足，无法持有',
  scroll: '空间不足，无法持有',
  scrollFragment: '空间不足，无法持有',
  fragment: '空间不足，无法持有',
};

/** 默认序的类型分组（**2026-09-25 变更 · 取代 Z-9**）：竹简 → 兰帖 → 兰帖残页 → 石榴籽玉 → 石榴籽 → 石榴籽碎片；溢出行的类型序是**另一份清单**（`OVERFLOW_KIND_ORDER`，玉优先），两份**不同源**、**不得顺手统一** */
const KIND_ORDER: Record<InventoryKind, number> = {
  bamboo: 0, scroll: 1, scrollFragment: 2, jade: 3, seed: 4, fragment: 5,
};

/** 溢出行的类型顺序：玉行恒在最前，其余各类按默认序（竹简 → 兰帖 → 籽 → 兰帖碎片 → 石榴籽碎片） */
const OVERFLOW_KIND_ORDER: InventoryKind[] = ['jade', 'bamboo', 'scroll', 'seed', 'scrollFragment', 'fragment'];

/**
 * 行囊数据源：既有 `GET /assets/summary` 出参 + §15 兰帖域**追加**出参（字段在 `types.ts` 登记为
 * `ScrollSummaryFields`；本单不改 `api.ts`，故在此取交集）。未上云的旧后端不返这些字段 ⇒ `Partial`
 * 缺省按 0 / 空数组处理（不抛错）；后端 summarize 出参字段名逐字见 `types.ts` 注释。
 */
export type InventorySummary = AssetsSummary & Partial<ScrollSummaryFields>;

/** 把资产总览装配成道具栏（`summary` 为空 = 未登录 / 未取到数据 → 36 空格、无溢出） */
export function buildInventory(summary: InventorySummary | null): Inventory {
  const items: InventoryItem[] = [
    ...lotItems('bamboo', summary?.bamboo_lots || [], BAMBOO_PIECES_PER_ITEM),
    ...scrollItems(summary?.scroll_lots || []),
    ...jadeItems(summary?.jades || []),
    ...lotItems('seed', summary?.seed_lots || [], SEEDS_PER_ITEM),
    ...scrollFragmentItems(summary?.scroll_fragments || 0),
    ...fragmentItems(summary?.fragments || 0),
  ];
  items.sort(compareItems);

  const slots: (InventoryItem | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i += 1) slots.push(items[i] || null);

  return {
    slots,
    overflows: overflowLines(items.slice(SLOT_COUNT)),
    occupiedTotal: items.length,
  };
}

/**
 * 插入式重排（把 `from` 位次的元素插入到 `to` 位次，其余依次让位）—— 口径同
 * `docs/sibling-order.spec.md` §9 的拖曳（唯一的数组改写入口）。纯函数，返回新数组；
 * 越界 / 原位不动 → 原序副本。
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 默认序比较：类型分组 → 余数格排该类最后 → 到期近的在前（永久最后）→ 稳定 id 兜底 */
function compareItems(a: InventoryItem, b: InventoryItem): number {
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  const restA = a.slotKind === 'remainder' ? 1 : 0;
  const restB = b.slotKind === 'remainder' ? 1 : 0;
  if (restA !== restB) return restA - restB;
  if (a.expiresAtMs !== b.expiresAtMs) return a.expiresAtMs - b.expiresAtMs;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * 石榴籽玉：**只收未镶嵌的**（`mounted_tree_id` 非空 = 已镶嵌、不属于用户 ⇒ 不入行囊、不渲染、不计格，
 * 也不参与溢出）；每枚 1 格；`expires_at` 为空即永久（同类内排最后）。玉格**不显示数量角标**。
 */
function jadeItems(jades: Jade[]): InventoryItem[] {
  return jades
    .filter((j) => !j.mounted_tree_id)
    .map((j) => {
      const permanent = !j.expires_at;
      return {
        id: `jade:${j.id}`,
        kind: 'jade' as InventoryKind,
        slotKind: 'stack' as InventorySlotKind,
        name: KIND_NAME.jade,
        count: JADES_PER_ITEM,
        badge: false,
        jadeId: j.id,
        // 提示层正文（Kevin 2026-09-29 清单）：删「1 枚」、删「jd_* · 」短 id 前缀、删
        // 「未镶嵌 · 可免费分解」、删「1 枚石榴籽玉 = 1 格」⇒ 仅保留耐久行
        //（永久玉 = `耐久：9999 天`；有到期的玉 = 实际剩余天数）。
        tooltipLines: [durabilityLine(j.expires_at)],
        expiresAtMs: permanent ? Infinity : timestampOf(j.expires_at),
      };
    });
}

/** 石榴籽碎片：`fragments > 0` 即占 1 格（1–9 片均 1 格），角标 = 实际个数；无到期概念 */
function fragmentItems(fragments: number): InventoryItem[] {
  const count = Math.max(0, Math.floor(Number(fragments) || 0));
  if (count <= 0) return [];
  return [{
    id: 'fragment:0',
    kind: 'fragment' as InventoryKind,
    slotKind: 'fragment' as InventorySlotKind,
    name: KIND_NAME.fragment,
    count,
    badge: true,
    tooltipLines: [
      `${count} ${KIND_QTY_UNIT.fragment}`,
      `满 ${FRAGMENTS_PER_ITEM} 自动合成 1 颗石榴籽`,
    ],
    expiresAtMs: Infinity,
  }];
}

/**
 * 兰帖：`Σ scrolls[].qty` 按 **单格容量 100 张 = 10000 片**（`SCROLL_PIECES_PER_CELL`）切整堆格，
 * **不足一格的余量另占 1 个余数格**（该类内排最后）—— 口径与竹简 / 籽的余数占格**同体例**（§15-6②）。
 *
 * **格内角标 / 提示层计数行一律按「张」**（`片数 / 100`，`scrollZhangQty()` ⇒ 整数不带小数点、
 * 非整最多 2 位去尾零；整格 10000 片 ⇒ `100 张`，99 片 ⇒ `0.99 张`）。Kevin 2026-09-29 裁定：
 * 角标代表**兰帖张数**（不是残页/片数），单格最多容纳 100 张。
 *
 * **每格恒永久**（`ScrollLot.expires_at` 恒 `null`，§15-3）⇒ `expiresAtMs = Infinity`、
 * 耐久行恒为 `耐久：9999 天`；换算行保留 `KIND_CONVERT.scroll`（Kevin 未列入删除）。量为 0 的批次不占格。
 */
function scrollItems(lots: ScrollLot[]): InventoryItem[] {
  const total = (lots || []).reduce((sum, lot) => sum + Math.max(0, Number(lot.qty) || 0), 0);
  const count = Math.floor(total / SCROLL_PIECES_PER_CELL);
  const rest = total % SCROLL_PIECES_PER_CELL;
  const make = (id: string, slotKind: InventorySlotKind, pieces: number): InventoryItem => ({
    id,
    kind: 'scroll' as InventoryKind,
    slotKind,
    name: KIND_NAME.scroll,
    // 角标 / 计数行口径 = 张（`片数 / 100`；合法片数 ⇒ 恒为有限数，绝不 NaN）
    count: scrollZhangQty(pieces, SCROLL_PIECES_PER_ITEM),
    badge: true,
    tooltipLines: [
      // 数量行：`N 张`（Kevin 清单：**删「（100 片）」括注**、保留张数计数）
      `${scrollZhangQty(pieces, SCROLL_PIECES_PER_ITEM)} ${KIND_QTY_UNIT.scroll}`,
      // 耐久行：兰帖恒永久 ⇒ `耐久：9999 天`（取代旧「永久有效」）
      durabilityLine(null),
      // 换算行：Kevin 清单未列入删除 ⇒ 保留
      KIND_CONVERT.scroll,
    ],
    expiresAtMs: Infinity,
  });
  const items: InventoryItem[] = [];
  for (let k = 0; k < count; k += 1) items.push(make(`scroll:${k}`, 'stack', SCROLL_PIECES_PER_CELL));
  if (rest > 0) items.push(make('scroll:rest', 'remainder', rest));
  return items;
}

/**
 * 兰帖残页：**每 999 片占 1 格**（`ceil(片数 / SCROLL_FRAGMENT_PIECES_PER_CELL)` 格；0 片不占格），
 * 整格角标 = **999**、余数格角标 = **余数**（沿用既有余数格体例，`slotKind = 'remainder'`）；
 * 无到期概念（标量，永久）。**后端不设拒绝阈值 / 不截断**（2026-09-26 裁定）⇒ 前端只展示、
 * 不判上限、不重算上限；合成由**用户手动**触发（门槛 = 100 片，见 `SCROLL_FRAGMENTS_PER_ITEM`）。
 */
function scrollFragmentItems(fragments: number): InventoryItem[] {
  const total = Math.max(0, Math.floor(Number(fragments) || 0));
  if (total <= 0) return [];
  const cells = Math.ceil(total / SCROLL_FRAGMENT_PIECES_PER_CELL);
  const rest = total % SCROLL_FRAGMENT_PIECES_PER_CELL;
  const make = (id: string, slotKind: InventorySlotKind, count: number): InventoryItem => ({
    id,
    kind: 'scrollFragment' as InventoryKind,
    slotKind,
    name: KIND_NAME.scrollFragment,
    count,
    badge: true,
    tooltipLines: [
      `${count} ${KIND_QTY_UNIT.scrollFragment}`,
      // 余数行与「满 100 片可手动合成 1 张兰帖」行、换算行：Kevin 2026-09-29 清单整句删除
      // （合成入口 = 本层【合成】按钮，未达标时由层内原因行 `scrollSynthShortReasonLine` 明写）
    ],
    expiresAtMs: Infinity,
  });
  const items: InventoryItem[] = [];
  for (let k = 0; k < cells; k += 1) {
    // 末格为余数格（`rest > 0` 时其角标 = 余数；`rest === 0` 时全是整格 ⇒ 每格恒 999）
    const isLast = k === cells - 1;
    const isRemainder = isLast && rest > 0;
    items.push(make(
      isLast && !isRemainder ? 'scrollFragment:last' : `scrollFragment:${k}`,
      isRemainder ? 'remainder' : 'stack',
      isRemainder ? rest : SCROLL_FRAGMENT_PIECES_PER_CELL,
    ));
  }
  return items;
}

/**
 * 籽 / 竹简：按 `perItem` 个原始单位切成一格一格的整堆格，**不足一格的余量另占 1 个余数格**
 * （角标 = 实际余量；该类内排在最后）。
 *
 * 切法 = **按到期升序的 FIFO**（同到期以批次 id 兜底）⇒ 每格的「最近到期」随格位单调不减，
 * 与默认序「到期近的在前」自洽；余数格取尾部余量的最近到期。
 */
function lotItems(
  kind: 'seed' | 'bamboo',
  lots: SeedLot[] | BambooLot[],
  perItem: number,
): InventoryItem[] {
  const sorted = [...lots]
    .filter((lot) => Number(lot.qty) > 0)
    .sort((a, b) => {
      const ta = timestampOf(a.expires_at);
      const tb = timestampOf(b.expires_at);
      if (ta !== tb) return ta - tb;
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
  const total = sorted.reduce((sum, lot) => sum + Number(lot.qty || 0), 0);
  const count = Math.floor(total / perItem);
  const rest = total % perItem;

  const items: InventoryItem[] = [];
  for (let k = 0; k < count; k += 1) {
    const expiresAt = nearestExpiryOfRange(sorted, k * perItem, (k + 1) * perItem);
    items.push({
      id: `${kind}:${k}`,
      kind,
      slotKind: 'stack',
      name: KIND_NAME[kind],
      count: perItem,
      badge: true,
      tooltipLines: [
        `${perItem} ${KIND_QTY_UNIT[kind]}`,
        // 耐久行（Kevin 2026-09-29 清单：「最近到期 YYYY-MM-DD」→「耐久：N 天」，实际剩余天数）
        durabilityLine(expiresAt),
      ],
      expiresAtMs: timestampOf(expiresAt),
    });
  }
  if (rest > 0) {
    const expiresAt = nearestExpiryOfRange(sorted, count * perItem, total);
    items.push({
      id: `${kind}:rest`,
      kind,
      slotKind: 'remainder',
      name: KIND_NAME[kind],
      count: rest,
      badge: true,
      tooltipLines: [
        `${rest} ${KIND_QTY_UNIT[kind]}`,
        // 「本格为余数 · 不足 1 格」行：Kevin 2026-09-29 清单整句删除（籽 / 竹简两类）
        durabilityLine(expiresAt),
      ],
      expiresAtMs: timestampOf(expiresAt),
    });
  }
  return items;
}

/** 第 `[start, end)` 个原始单位（按 FIFO 升序展开）里**最近**的到期时刻（口径同资产页「最近到期」） */
function nearestExpiryOfRange(
  sorted: Array<SeedLot | BambooLot>,
  start: number,
  end: number,
): string {
  let cursor = 0;
  let nearest = '';
  for (const lot of sorted) {
    const from = cursor;
    cursor += Number(lot.qty || 0);
    if (cursor <= start) continue;
    if (from >= end) break;
    if (!nearest || timestampOf(lot.expires_at) < timestampOf(nearest)) nearest = lot.expires_at || '';
  }
  return nearest;
}

/** 溢出提示行：按类型汇总（玉 → 竹简 → 兰帖 → 籽 → 兰帖碎片 → 石榴籽碎片各一行，只有真的溢出才出现） */
function overflowLines(overflowItems: InventoryItem[]): InventoryOverflow[] {
  const out: InventoryOverflow[] = [];
  for (const kind of OVERFLOW_KIND_ORDER) {
    const count = overflowItems.filter((item) => item.kind === kind).length;
    if (!count) continue;
    out.push({
      kind,
      count,
      label: `溢出 ${count} ${KIND_ITEM_UNIT[kind]}${KIND_NAME[kind]}`,
      text: KIND_OVERFLOW_TEXT[kind],
    });
  }
  return out;
}

/** ISO → 时间戳；空值 / 非法值 → `Infinity`（视作最晚，排在该类最后） */
function timestampOf(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? Infinity : ts;
}
