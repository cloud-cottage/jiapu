/**
 * 首页「按地区筛选」纯逻辑（零请求 · 零自建码表：地区名一律走 `business/geo.ts` 反查）
 *
 * 数据源 = `GET /geo/tree-index`（`business/api.ts` 的 `fetchGeoTreeIndex()`，会话内缓存），
 * 每树给两个码数组：
 *   · `origin_codes`    = 该树 tree-meta 的籍贯地码（合法至多 1 项）
 *   · `residence_codes` = 该树任一人物居住地码（去重升序）
 *
 * 命中口径（用户拍定）：
 *   · 籍贯命中 = `origin_codes` 任一码的前 2 位 == 所选省前缀；
 *   · 居住地命中 = `residence_codes` 任一码前缀同 ⇒ 命中；
 *   · 两者命中任一即进列表（并集，按 tree_id 天然去重）；
 *   · 伪地区「未登记」= 两数组皆空的树（**与任何省份集合互斥**：双空的树不可能命中任何省前缀）。
 *
 * 省份条目由「码的前 2 位」聚合得出（**不手写省份名单**），省名 / 市名按码反查：
 *   `pathOfCode()` 取省级节点、`resolveNames()` 取展示名；伪级名（市辖区 / 县 …）过滤，
 *   直辖市等市级为伪级名时回退省名（例：110101 →「居 北京市」而非「居 市辖区」）。
 */
import { pathOfCode, resolveNames, SHOW_FILTER_NAMES } from './geo';
import type { GeoTreeIndex, GeoTreeIndexEntry } from './types';

/** 伪地区「未登记」的选中值（省份前缀恒为 2 位数字，不会与它相撞） */
export const REGION_UNREGISTERED = 'unregistered';

/** 单树在某省下的命中结果 */
export interface RegionHit {
  /** 籍贯命中（tree-meta 籍贯地码前缀 == 所选省） */
  origin: boolean;
  /** 居住地命中（任一人物居住地码前缀 == 所选省） */
  residence: boolean;
  /** 居住地命中的第一个码（`residence_codes` 升序里首个匹配项；`residence=false` 时为空串） */
  residenceCityCode: string;
}

/** 下拉里的省级条目 */
export interface RegionProvinceOption {
  /** 省前缀（6 位码前 2 位） */
  prefix: string;
  /** 省名（码表反查；理论上不会为空——后端只登记合法码） */
  name: string;
  /** 籍贯命中该省的树数（按 tree_id 去重） */
  originCount: number;
  /** 居住地命中该省的树数（按 tree_id 去重） */
  residenceCount: number;
}

const CODE6 = /^\d{6}$/;
const FILTER_NAMES = new Set(SHOW_FILTER_NAMES);

/**
 * 地区筛选全部新文案（**唯一来源**：组件与首页都从这里取，便于统一入册；
 * 页面里的搜索类文案另见 `pages/index/index.vue` 的 `UI_TEXT`）。
 */
export const REGION_TEXT = {
  /** 未选中时的胶囊文案 */
  all: '全部地区',
  /** 伪地区（两码数组皆空） */
  unregistered: '未登记',
  /** 下拉行右侧的两个计数单位 */
  originUnit: '籍',
  residenceUnit: '居',
  /** 「未登记」行右侧的单位（`N 棵`） */
  treeUnit: '棵',
  /** 绿色居住地标记前缀（`居 <市名>`） */
  residencePrefix: '居',
  /** 筛选无结果时的空态（既有两档空态文案不动） */
  emptyList: '该地区暂无收录的家族',
  loading: '加载中…',
} as const;

/** 6 位合法码 → 省前缀（2 位）；非法 / 空 → '' */
export function regionPrefixOf(code?: string | null): string {
  const c = String(code ?? '').trim();
  return CODE6.test(c) ? c.slice(0, 2) : '';
}

/** 单树条目是否「完全无码」（缺条目也按无码算：宁可进「未登记」可找回，也不让它凭空消失） */
export function isUnregisteredEntry(entry?: GeoTreeIndexEntry | null): boolean {
  const origin = (entry?.origin_codes || []).filter((c) => regionPrefixOf(c));
  const residence = (entry?.residence_codes || []).filter((c) => regionPrefixOf(c));
  return origin.length === 0 && residence.length === 0;
}

/** 单树在某省前缀下的命中结果；两源皆不命中 → null */
export function hitOfEntry(entry: GeoTreeIndexEntry | undefined, prefix: string): RegionHit | null {
  const p = String(prefix ?? '').trim();
  if (!p || !entry) return null;
  const origin = (entry.origin_codes || []).some((c) => regionPrefixOf(c) === p);
  const residenceCityCode = (entry.residence_codes || []).find((c) => regionPrefixOf(c) === p) || '';
  if (!origin && !residenceCityCode) return null;
  return { origin, residence: !!residenceCityCode, residenceCityCode };
}

/** 市级展示名（「居 <市名>」用）：伪级名过滤；直辖市等市级为「市辖区」→ 回退省名 */
export function regionCityLabelOf(code?: string | null): string {
  const names = resolveNames(code);
  const city = names.city && !FILTER_NAMES.has(names.city) ? names.city : '';
  return city || names.province || names.display || '';
}

/** 省名（按该省下任一真实码反查；未知 → ''） */
function provinceNameOfCode(code: string): string {
  return pathOfCode(code).province?.name || '';
}

/**
 * 省级下拉条目：只聚合**实际出现过的省**（由码前 2 位聚合，无手写名单），
 * 计数只统计 `treeIds` 里的树（= 当前列表范围，与筛选结果口径一致）。
 * 排序：命中树数（籍 + 居）降序 → 省前缀升序。
 */
export function regionProvinceOptions(
  index: GeoTreeIndex | null,
  treeIds: string[],
): RegionProvinceOption[] {
  if (!index) return [];
  const acc = new Map<string, { name: string; origin: Set<string>; residence: Set<string> }>();
  const bucketOf = (prefix: string, name: string) => {
    let b = acc.get(prefix);
    if (!b) {
      b = { name, origin: new Set<string>(), residence: new Set<string>() };
      acc.set(prefix, b);
    } else if (!b.name && name) {
      b.name = name;
    }
    return b;
  };
  for (const treeId of treeIds) {
    const entry = index.trees?.[treeId];
    if (!entry) continue;
    for (const code of entry.origin_codes || []) {
      const prefix = regionPrefixOf(code);
      if (!prefix) continue;
      bucketOf(prefix, provinceNameOfCode(code)).origin.add(treeId);
    }
    for (const code of entry.residence_codes || []) {
      const prefix = regionPrefixOf(code);
      if (!prefix) continue;
      bucketOf(prefix, provinceNameOfCode(code)).residence.add(treeId);
    }
  }
  return [...acc.entries()]
    .map(([prefix, b]) => ({
      prefix,
      name: b.name,
      originCount: b.origin.size,
      residenceCount: b.residence.size,
    }))
    .filter((o) => !!o.name)
    .sort(
      (a, b) =>
        b.originCount + b.residenceCount - (a.originCount + a.residenceCount) ||
        (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0),
    );
}

/** 「未登记」树数（两码数组皆空的树；范围 = `treeIds`） */
export function regionUnregisteredCountOf(
  index: GeoTreeIndex | null,
  treeIds: string[],
): number {
  if (!index) return 0;
  return treeIds.filter((id) => isUnregisteredEntry(index.trees?.[id])).length;
}

/** 省名前缀 → 条目（找不到 → undefined） */
export function regionOptionOf(
  options: RegionProvinceOption[],
  prefix: string,
): RegionProvinceOption | undefined {
  return options.find((o) => o.prefix === prefix);
}
