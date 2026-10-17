/**
 * 按地区筛选索引 —— `GET /geo/tree-index` 的**薄投影**（只读聚合 · 零写入）
 *
 * 口径（每树「发源地码 + 居住地码」）已**整体上移**到 `lib/geo-stats.js`：那里是唯一扫描器 /
 * 唯一 24h 缓存 / 唯一单飞 / 唯一 `generated_at`，一趟遍历同时产出 `trees`（本口用）与
 * `counts` / `direct`（`/geo/hot` 用）的超集快照。本模块只把共享快照裁成本口出参，
 * **键集与值逐字不变**（不得改名 / 加键）。
 *
 * 返回体（`GET /geo/tree-index`，逐字契约）：
 *   {
 *     v: 1,
 *     generated_at: '<ISO>'|null,       // 与 `/geo/hot` 同一次扫描的同一个时刻
 *     trees: {
 *       '<tree_id>': {
 *         origin_codes: ['231281'],     // 该树 tree-meta 的 origin_code（合法 1 项）；无码/非法 ⇒ []
 *         residence_codes: ['230305'],  // 该树**任一人物** residence_places[].origin_code 去重升序
 *       },
 *       ...
 *     },
 *     failed?: ['<tree_id>']            // 仅「清单里有、但 getTree 抛错」的树；无失败树时**不出现该键**
 *   }
 *
 * 口径细目（与老实现逐条一致）：
 *   · 码合法性 = `lib/geo.js` 的 `isKnownOriginCode`：空码 / 非 6 位 / 未登记码一律丢弃、不报错。
 *   · `trees` 键按 tree_id 升序；数组内部升序去重；**不含**出生地码与人数。
 *   · 树不存在 / 已删（`getTree` 返 null）⇒ 跳过、不进 `failed`；单树读抛错 ⇒ 跳过并记入 `failed`。
 *   · `listTreeIds()` 抛错 ⇒ 返上一次成功值（无则 `{v:1,generated_at:null,trees:{}}`），
 *     **不进缓存、不刷新成功时刻**（负缓存禁用），**永远 200**。
 *   · `getMeta()` 抛错 ⇒ 仅发源地一源为 `[]`，居住地照常，不整体失败。
 *   · **零写入**：只调 `listTreeIds` / `getTree` / `getMeta` 三个只读函数。
 *
 * 可测性：`createGeoTreeIndexReader({ listTreeIds, getTree, getMeta, now })` 保持可注入；
 *   也可传 `{ statsReader }` 复用**同一个** `createGeoStatsReader()` 实例。
 *   路由用模块级默认视图 `getTreeIndex`（快照与 `/geo/hot` 共享）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-tree-index.test.js
 */
import {
  createGeoStatsReader,
  createStatsView,
  projectGeoTreeIndex,
  defaultGeoStats,
  GEO_STATS_TTL_MS,
  GEO_STATS_VERSION,
} from './geo-stats.js';

/** 缓存 TTL（24 小时；与 `/geo/hot` 同一份缓存） */
export const TREE_INDEX_TTL_MS = GEO_STATS_TTL_MS;

/** 返回体版本号（顶层 `v`） */
export const TREE_INDEX_VERSION = GEO_STATS_VERSION;

/**
 * 读取器工厂。返回 `{ getTreeIndex() }` —— 恒 resolve，绝不 reject；缓存命中时返回同一份出参对象。
 */
export function createGeoTreeIndexReader(deps = {}) {
  const stats = deps.statsReader || createGeoStatsReader(deps);
  const view = createStatsView(() => stats.getStats(), projectGeoTreeIndex);
  return { getTreeIndex: view };
}

/** 模块级默认视图（路由用；快照来自 `geo-stats.js` 的共享默认实例） */
const defaultReader = createGeoTreeIndexReader({ statsReader: defaultGeoStats });

/** `GET /geo/tree-index` 的返回体（24h 进程内缓存、与 `/geo/hot` 同一快照；失败降级，不抛） */
export function getTreeIndex() {
  return defaultReader.getTreeIndex();
}
