/**
 * 行政区划热度排序 —— `GET /geo/hot` 的**薄投影**（真源派生聚合 · 纯读 · 零写入）
 *
 * 口径（裁定 R1–R8 / 冻结口径 D1–D3，规格落点 `docs/geo-origin.spec.md` 热度排序）已**整体上移**到
 * `lib/geo-stats.js`：那里是唯一扫描器 / 唯一 24h 缓存 / 唯一单飞 / 唯一 `generated_at`，
 * 一趟遍历同时产出 `counts` / `direct`（本口用）与 `trees`（`/geo/tree-index` 用）的超集快照。
 * 本模块只做一件事：把共享快照裁成 `/geo/hot` 的出参形状，**键集与值逐字不变**。
 *
 *   · 票源三源各计（R2）：① 每人 `birth_place.origin_code`；② `residence_places[]` 每项；
 *     ③ `tree-meta.trees[*].origin_code`（接受与始祖出生地同源重复）。
 *   · 计票 = 前缀（级联）（R5/D2）：一张票对自身及全部祖先码各 +1；`direct` 只算恰在该级的票。
 *   · 计入条件 = `lib/geo.js` 的 `isKnownOriginCode`：空码 / 非 6 位 / 未登记码一律不计票、不报错。
 *   · 取树清单失败 ⇒ 返上一次成功值（无则空表），**不刷新成功时刻、不进缓存**、下次请求立即重试（R16/R11）；
 *     单树读抛错 ⇒ 跳过并把 id 记进 `failed`（R17）；`getTree` 返 null ⇒ 静默跳过（不进 `failed`）；
 *     `getMeta()` 抛错 ⇒ 仅发源地一源计 0（不整体失败）；**永远 200**（D3）。
 *
 * 返回体（D3，顶层四键 + 失败树时附加 `failed`）：
 *   `{ v: 1, generated_at: '<ISO>'|null, counts: {码: 前缀票}, direct: {码: 直票}, failed?: ['树id'] }`
 *   —— `counts` / `direct` **只含票数 > 0 的码**。
 *
 * 可测性：`createGeoHotReader({ listTreeIds, getTree, getMeta, now })` 保持可注入；
 *   也可传 `{ statsReader }` 复用**同一个** `createGeoStatsReader()` 实例（断言「两路同快照 / 只扫一遍」）。
 *   路由用模块级默认视图 `getGeoHot`（依赖 = 真 store 的三个只读函数，与 `/geo/tree-index` 共享快照）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-hot.test.js
 */
import { createGeoStatsReader, createStatsView, projectGeoHot, defaultGeoStats, GEO_STATS_TTL_MS, GEO_STATS_VERSION } from './geo-stats.js';

/** 缓存 TTL（R3：24 小时；与 `/geo/tree-index` 同一份缓存） */
export const HOT_TTL_MS = GEO_STATS_TTL_MS;

/** 返回体版本号（D3 顶层 `v`） */
export const HOT_VERSION = GEO_STATS_VERSION;

/**
 * 热度读取器工厂。依赖全部为**只读**函数；`now` 可注入以测 TTL。
 * 返回 `{ getGeoHot() }` —— 恒 resolve，绝不 reject；缓存命中时返回同一份出参对象。
 */
export function createGeoHotReader(deps = {}) {
  const stats = deps.statsReader || createGeoStatsReader(deps);
  const view = createStatsView(() => stats.getStats(), projectGeoHot);
  return { getGeoHot: view };
}

/** 模块级默认视图（路由用；快照来自 `geo-stats.js` 的共享默认实例） */
const defaultReader = createGeoHotReader({ statsReader: defaultGeoStats });

/** `GET /geo/hot` 的返回体（24h 进程内缓存、与 `/geo/tree-index` 同一快照；失败降级，不抛） */
export function getGeoHot() {
  return defaultReader.getGeoHot();
}
