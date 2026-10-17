/**
 * 按地区筛选 —— 每树「发源地码 + 居住地码」只读聚合（24h 进程内缓存 · 单飞 · 降级 · 零写入）
 *
 * 用途：首页「按地区筛选」需同时命中**发源地（籍贯）**与**居住地**，且必须知道「哪棵树命中」。
 * `GET /geo/hot` 只给「码 → 票数」，给不出树粒度，故单开本口（结构照 `lib/geo-hot.js`：
 * 前缀无关的纯汇总、24h TTL、并发单飞、失败降级、只调三个只读函数）。
 *
 * 返回体（`GET /geo/tree-index`，逐字契约 —— 不得改名 / 加键）：
 *   {
 *     v: 1,
 *     generated_at: '<ISO>'|null,
 *     trees: {
 *       '<tree_id>': {
 *         origin_codes: ['231281'],     // 该树 tree-meta 的 origin_code（合法 1 项）；无码/非法 ⇒ []
 *         residence_codes: ['230305'],  // 该树**任一人物** residence_places[].origin_code 去重升序
 *       },
 *       ...
 *     },
 *     failed?: ['<tree_id>']            // 仅「树清单里有、但 getTree 抛错」的树；无失败树时**不出现该键**
 *   }
 *
 * 口径：
 *   · 码合法性一律 `lib/geo.js` 的 `isKnownOriginCode`：空码 / 非 6 位 / 未登记码**一律丢弃、不报错、不登记异常**。
 *   · **不含**出生地码与人数（体积与用途都无必要）。
 *   · `trees` 键按 tree_id 升序；`origin_codes` / `residence_codes` 数组内部升序去重。
 *   · 树不存在 / 已删（`getTree` 返回 null）⇒ 跳过、**不进 failed**；单树读抛错 ⇒ 跳过并记入 `failed`。
 *   · `listTreeIds()` 抛错 ⇒ **向上抛**，由入口返回上一次成功值（无则 `{v:1,generated_at:null,trees:{}}` 空表降级）：
 *     **不进缓存、不刷新成功时刻**（负缓存禁用），**永远 200**。
 *   · `getMeta()` 抛错 ⇒ 仅发源地一源计 0（各树 `origin_codes: []`），居住地照常，**不整体失败**。
 *   · **零写入**：只调 `listTreeIds` / `getTree` / `getMeta` 三个只读函数，无任何写路径、无新集合。
 *
 * 可测性：`createGeoTreeIndexReader({ listTreeIds, getTree, getMeta, now })` 注入依赖与时钟
 *   （TTL / 单飞 / 读失败 / 清单失败用例无需等 24h、无需触碰真源）；路由用模块级默认实例 `getTreeIndex`。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-tree-index.test.js
 */
import { isKnownOriginCode } from './geo.js';
import { listTreeIds, getTree, getMeta } from './store.js';

/** 缓存 TTL（24 小时；筛选页对时效性要求极低） */
export const TREE_INDEX_TTL_MS = 24 * 60 * 60 * 1000;

/** 返回体版本号（顶层 `v`） */
export const TREE_INDEX_VERSION = 1;

/** 无任何成功值时的降级返回体（**冻结常量**：调用方不得就地修改） */
const EMPTY = Object.freeze({ v: TREE_INDEX_VERSION, generated_at: null, trees: Object.freeze({}) });

/** 归一：合法码 ⇒ trim 后的 6 位串；空码 / 非 6 位 / 未登记 ⇒ null（不抛、不登记异常） */
function normCode(raw) {
  return isKnownOriginCode(raw) ? String(raw).trim() : null;
}

/** tree-meta 条目定位：优先按 key（tree_id），退化为按 entry.tree_id 扫描 */
function metaEntryOf(metaTrees, id) {
  const direct = metaTrees?.[id];
  if (direct) return direct;
  for (const entry of Object.values(metaTrees || {})) if (entry && entry.tree_id === id) return entry;
  return null;
}

/** 单树居住地码：全员合并 → 去重 → 升序；坏形状（非数组 / 项非对象 / 空码）一律跳过 */
function residenceCodesOf(tree) {
  const set = new Set();
  const people = tree?.people || {};
  for (const handle of Object.keys(people)) {
    const person = people[handle];
    if (!person) continue;
    const residences = person.residence_places;
    if (!Array.isArray(residences)) continue; // 缺字段 / 非数组 ⇒ 该人无居住地码
    for (const item of residences) {
      if (!item || typeof item !== 'object') continue;
      const code = normCode(item.origin_code);
      if (code) set.add(code);
    }
  }
  return [...set].sort();
}

/**
 * 读取器工厂（默认实例见文件末）。返回 `{ getTreeIndex() }` —— 恒 resolve，绝不 reject。
 */
export function createGeoTreeIndexReader({ listTreeIds: listIds, getTree: readTree, getMeta: readMeta, now = Date.now } = {}) {
  let cached = null; // 最近一次成功值
  let cachedAt = 0; // 最近一次成功值的生成时刻（失败**不刷新** ⇒ 下次请求重试，不做负缓存）
  let inflight = null; // 单飞：扫描期间的 refresh promise

  /** 扫真源现算（只读；单树失败只跳过该树，不整体失败） */
  async function scan() {
    const ids = await listIds(); // 清单失败**一律向上抛**（⇒ 入口走整体失败分支：上一次成功值 / 空表，不刷新时刻、不进缓存）
    // 发源地源：meta 不可用 ⇒ 只让本源计 0，居住地照常扫描（不整体失败）
    let metaTrees = null;
    try {
      metaTrees = (await readMeta())?.trees || {};
    } catch {
      metaTrees = null;
    }
    const trees = {};
    const failed = [];
    const uniqueIds = [...new Set(ids.map((id) => String(id)))].sort(); // 键升序（可判负）
    for (const id of uniqueIds) {
      let tree;
      try {
        tree = await readTree(id);
      } catch {
        failed.push(id); // 读失败 ⇒ 跳过该树 + 记入 failed
        continue;
      }
      if (!tree) continue; // 不存在 / 已删 ⇒ 跳过（不计入 failed）
      const entry = metaTrees ? metaEntryOf(metaTrees, id) : null;
      const originCode = entry ? normCode(entry.origin_code) : null;
      trees[id] = {
        origin_codes: originCode ? [originCode] : [],
        residence_codes: residenceCodesOf(tree),
      };
    }
    return { trees, failed };
  }

  return {
    /** `GET /geo/tree-index` 取值入口：TTL 内直接返回缓存，过期才重扫（并发单飞） */
    async getTreeIndex() {
      if (cached && now() - cachedAt < TREE_INDEX_TTL_MS) return cached;
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const r = await scan();
          cached = {
            v: TREE_INDEX_VERSION,
            generated_at: new Date(now()).toISOString(),
            trees: r.trees,
            ...(r.failed.length ? { failed: r.failed } : {}),
          };
          cachedAt = now();
          return cached;
        } catch {
          return cached || EMPTY; // 整体失败 ⇒ 上一次成功值；无 ⇒ 空表（仍不抛、绝不 5xx）
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
  };
}

/** 模块级默认实例（路由用；依赖 = 真 store 的三个只读函数） */
const defaultReader = createGeoTreeIndexReader({ listTreeIds, getTree, getMeta });

/** `GET /geo/tree-index` 的返回体（24h 进程内缓存；失败降级，不抛） */
export function getTreeIndex() {
  return defaultReader.getTreeIndex();
}
