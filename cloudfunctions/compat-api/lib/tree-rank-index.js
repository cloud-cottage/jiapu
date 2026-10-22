/**
 * 家族排序索引 —— `GET /tree/rank-index` 的聚合读取器（只读聚合 · 零写入 · **24h 快照**）
 *
 * 背景（Kevin 口径）：「首页家族列表的排序数据，不必实时更新，可与地区数据的更新逻辑和频次一致」。
 * 改造前首页靠前端 `Promise.all(halls.map(fetchTreeRank))` 逐树拉 `/tree/rank`（20 棵树 = 20 个请求、
 * 每次进首页实时算世代 / 人数 / 活跃度）。本模块把「每树等级字段」做成**一趟全量扫描 + 24h 快照**，
 * 首页一次请求取全表。
 *
 * 出参（逐字契约）：
 *   {
 *     v: 1,
 *     generated_at: '<ISO>'|null,        // 本快照生成时刻（null = 从未成功过）
 *     trees: {
 *       '<tree_id>': {
 *         tree_id, total_generations, rank_key, rank_label, rank_en, rank_desc,
 *         over_limit, max_depth, root_count, person_count, mirror_count,
 *         explicit, activity, updated_at
 *       }, ...                            // 键 = tree_id 升序；字段与 `/tree/rank` **逐字段同源**
 *     },
 *     failed?: ['<tree_id>']              // 仅「清单里有、但读取 / 计算抛错」的树；无失败则不出现该键
 *   }
 *
 * 口径（与 `/tree/rank` **同一实现** `lib/tree-rank.js`，不得在此另写一套 ⇒ 防口径分叉）：
 *   · `person_count` 真源 = `lib/family-population.js` 的 `countFamilyMembers`（纯血缘图口径；
 *     世本 / 祖谱保持 = 树内 people 数，分层取 tree-meta 的 `kind` / `is_master`）。
 *   · `rank_*` / `total_generations` / `explicit`：详情档 `external_chain_gen` 优先，缺失退回家族图 BFS。
 *   · `activity`：`lib/tree-activity.js`（近 30 天互动事件数，集合不可用恒 0、不抛）。
 *   · `updated_at`：树 JSON 原值的字符串形态；`undefined` / `null` ⇒ `''`。
 *   · **不含 `access`**（也不含任何鉴权 / 权限档字段）：排序不需要权限信息。
 *
 * 缓存机制（**与地区数据 `/geo/tree-index` 同一套**，直接复用 `lib/geo-stats.js` 的工具函数）：
 *   · TTL = `GEO_STATS_TTL_MS`（24h，同一常量，不另设）；
 *   · 进程内单份快照 + 并发单飞 ⇒ 由 `createSnapshotCache()` 提供（geo 用的同一个工厂）；
 *   · 树清单 `listTreeIds()` 抛错 ⇒ 返上一次成功值（无则 `{v:1, generated_at:null, trees:{}}`），
 *     **不刷新成功时刻、不进缓存、不设负缓存**（下一次请求立即重试）；永远 resolve，绝不 5xx；
 *   · 单树 `getTree` 抛错 ⇒ 跳过该树 + 记进 `failed`（不拖垮其它树）；`getTree` 返 null ⇒ 静默跳过；
 *   · `getMeta()` / `getAllDetails()` / `treeActivity()` 抛错 ⇒ 只降该项（meta 缺失 ⇒ 分层按 family；
 *     details 缺失 ⇒ 退回家族图算世代；activity 缺失 ⇒ 0），**不整体失败**。
 *
 * 与 geo 的关系：两者都是「一趟全量扫树 + 24h 快照」，但各自持有快照对象（geo 的扫描口径是行政区划
 * 计票 + 每树地理码；本口是等级 / 人数 / 活跃度），故**扫描未合并**：各自 24h 一次全量遍历，
 * 缓存机制、TTL 常量、降级语义完全同源（共享 `createSnapshotCache`）。
 *
 * 可测性：`createTreeRankIndexReader({ listTreeIds, getTree, getMeta, getAllDetails, treeActivity, now })`
 * 全部依赖可注入；测试用计数器断言「同一 TTL 内只扫一次」。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/tree-rank-index.test.js
 */

import { createSnapshotCache, GEO_STATS_TTL_MS, metaEntryOf } from './geo-stats.js';
import { explicitGensOf, treeRankFields } from './tree-rank.js';
import { listTreeIds, getTree, getMeta, getAllDetails } from './store.js';
import { treeActivity } from './tree-activity.js';

/** 缓存 TTL（24 小时；**同一常量** = 地区数据，两域同频次刷新） */
export const TREE_RANK_INDEX_TTL_MS = GEO_STATS_TTL_MS;

/** 出参版本号（顶层 `v`） */
export const TREE_RANK_INDEX_VERSION = 1;

/** 无任何成功值时的降级快照（冻结常量：调用方不得就地修改；不进缓存） */
const EMPTY_INDEX = Object.freeze({
  v: TREE_RANK_INDEX_VERSION,
  generated_at: null,
  trees: Object.freeze({}),
});

/**
 * 聚合读取器工厂。返回 `{ getRankIndex() }` —— 恒 resolve，绝不 reject；同一快照内返回同一份对象。
 */
export function createTreeRankIndexReader({
  listTreeIds: listIds,
  getTree: readTree,
  getMeta: readMeta,
  getAllDetails: readDetails,
  treeActivity: activityOf,
  now = Date.now,
} = {}) {
  /** 扫真源现算（只读；单树读失败只跳过该树，不整体失败） */
  async function scan() {
    const ids = await listIds(); // 清单失败**一律向上抛** ⇒ 缓存器走整体降级分支（不刷新时刻、不进缓存）
    // tree-meta：只用于人数分层（kind / is_master）；不可用 ⇒ 一律按 family 口径，不整体失败
    let metaTrees = null;
    try {
      metaTrees = (await readMeta())?.trees || {};
    } catch {
      metaTrees = null;
    }
    const trees = {};
    const failed = [];
    const uniqueIds = [...new Set((ids || []).map((id) => String(id)))].sort();
    for (const id of uniqueIds) {
      let tree;
      try {
        tree = await readTree(id);
      } catch {
        failed.push(id); // 读失败 ⇒ 跳过该树，id 记进 failed（不得整体失败）
        continue;
      }
      if (!tree) continue; // 不存在 / 已删 ⇒ 静默跳过（不进 failed）
      try {
        const metaEntry = metaTrees ? metaEntryOf(metaTrees, id) : null;
        // 详情档（外部链世代）：不可用 ⇒ 退回家族图算世代（与 /tree/rank 在 gens 为空时同一条分支）
        let explicitGens = null;
        try {
          explicitGens = explicitGensOf(await readDetails(id));
        } catch {
          explicitGens = null;
        }
        // 活跃度：集合不可用 / 读抛错 ⇒ 0（活跃度是附属字段，不得拖垮整棵树）
        let activity = 0;
        try {
          activity = await activityOf(id, { now: new Date() });
        } catch {
          activity = 0;
        }
        trees[id] = { tree_id: id, ...treeRankFields(tree, { metaEntry, explicitGens, activity }) };
      } catch {
        failed.push(id); // 树结构损坏等 ⇒ 只降该树
      }
    }
    return { trees, failed };
  }

  // 缓存机制与 /geo/tree-index 完全同源（同一工厂 / 同一 TTL / 同一失败降级）
  const cache = createSnapshotCache({
    scan,
    now,
    ttlMs: TREE_RANK_INDEX_TTL_MS,
    empty: EMPTY_INDEX,
    build: (r) => ({
      v: TREE_RANK_INDEX_VERSION,
      generated_at: new Date(now()).toISOString(),
      trees: r.trees,
      ...(r.failed.length ? { failed: r.failed } : {}),
    }),
  });

  return {
    /** 取值入口：TTL 内直接返回缓存快照，过期才重扫（并发单飞） */
    getRankIndex: () => cache.get(),
  };
}

/** 模块级默认实例（路由用；只读 store 三件 + treeActivity） */
export const defaultTreeRankIndex = createTreeRankIndexReader({
  listTreeIds,
  getTree,
  getMeta,
  getAllDetails,
  treeActivity,
});

/** `GET /tree/rank-index` 的返回体（24h 进程内快照；失败降级，不抛） */
export function getTreeRankIndex() {
  return defaultTreeRankIndex.getRankIndex();
}
