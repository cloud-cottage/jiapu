/**
 * 地区统计共享快照 —— **唯一扫描器 + 唯一缓存 + 唯一单飞**（纯读 · 零写入 · 24h）
 *
 * 背景（口径合并裁定）：`GET /geo/hot`（行政区划热度排名）与 `GET /geo/tree-index`（按地区筛选）
 * 曾各自 24h 缓存、各自全量扫树 ⇒ 同一份真源被扫两遍、两个 `generated_at` 不一致。
 * 本模块把两路口径合成**一趟遍历产出的超集快照**，两路只做薄投影（出参键集逐字不变）：
 *
 *   snapshot = {
 *     v: 1,
 *     generated_at: '<ISO>'|null,          // **一个快照时刻**，两路共享（核心判据）
 *     counts:  { 码: 前缀票 },               // 同老 /geo/hot 口径（票源三源 · 前缀级联 · 只含票数>0）
 *     direct:  { 码: 直票 },                 // 同上（只算恰在该级的票）
 *     trees:   { '<tree_id>': { origin_codes: [...], residence_codes: [...] } }, // 同老 /geo/tree-index 口径
 *     failed?: ['<tree_id>']                 // 仅「清单里有、但 getTree 抛错」的树；无失败则不出现该键
 *   }
 *
 * 计票口径（照抄自 `lib/geo-hot.js`，裁定 R1–R8 / 冻结口径 D1–D3）：
 *   · 票源三源各计（R2）：① 每人 `birth_place.origin_code` 非空 = 1 票；② `residence_places[]` 每项 1 票；
 *     ③ `tree-meta.trees[*].origin_code` 非空 = 1 票（接受与始祖出生地同源重复）。
 *   · 计票 = 前缀（级联）（R5/D2）：一张票对自身及全部祖先码各 +1；`direct` 只算恰在该级的票。
 *   · 计入条件 = `lib/geo.js` 的 `isKnownOriginCode`：空码 / 非 6 位 / 未登记码一律不计票、不报错、不登记异常。
 *
 * 树级口径（照抄自 `lib/geo-tree-index.js`）：
 *   · `origin_codes` = 该树 tree-meta 的 `origin_code`（合法 ⇒ 1 项，否则 `[]`）；
 *   · `residence_codes` = 该树任一人物 `residence_places[].origin_code` 去重升序（坏形状一律跳过）；
 *   · `trees` 键 = 树 id 去重 + 升序。
 *
 * 降级语义（逐条照抄原两模块，**未放宽**）：
 *   · 树清单 `listTreeIds()` 抛错 ⇒ 向上抛 ⇒ 入口返**上一次成功值**（无则空快照 `generated_at: null`），
 *     **不刷新成功时刻、不进缓存、不设负缓存**（下一次请求立即重试）；永远 resolve，绝不 5xx。
 *   · 单树 `getTree` 抛错 ⇒ 跳过该树并把 id 记进 `failed`（**不得整体失败**）；
 *     `getTree` 返 null（不存在 / 已删）⇒ 静默跳过、**不进 `failed``。
 *   · `getMeta()` 抛错 ⇒ 仅「发源地」一源计 0（发源地票源不计、各树 `origin_codes: []`），
 *     居住地 / 出生地照常，**不整体失败**。
 *   · 24h TTL 内不得重扫；并发请求**单飞**（同一份 refresh promise，防击穿）。
 *
 * 零写入：只调 `listTreeIds` / `getTree` / `getMeta` 三个只读函数，无任何写路径、无新集合。
 *
 * 可测性：`createGeoStatsReader({ listTreeIds, getTree, getMeta, now })` 注入依赖与时钟；
 *   薄投影工厂（`lib/geo-hot.js` / `lib/geo-tree-index.js`）可传 `{ statsReader }` 复用同一读取器，
 *   从而在测试里断言「两路同一快照、全量扫描次数 = 1」。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-stats.test.js
 */
import { isKnownOriginCode } from './geo.js';
import { listTreeIds, getTree, getMeta } from './store.js';

/** 缓存 TTL（24 小时；两路对时效性要求都极低 ⇒ 一趟扫描省服务器资源） */
export const GEO_STATS_TTL_MS = 24 * 60 * 60 * 1000;

/** 快照版本号（两路出参 `v` 同值） */
export const GEO_STATS_VERSION = 1;

/** 无任何成功值时的降级快照（**冻结常量**：调用方不得就地修改；不进缓存） */
const EMPTY_STATS = Object.freeze({
  v: GEO_STATS_VERSION,
  generated_at: null,
  counts: Object.freeze({}),
  direct: Object.freeze({}),
  trees: Object.freeze({}),
});

/**
 * 一张票的码 → 前缀候选（**自身 + 省 + 市**），按序去重后只保留已登记码（D2）。
 * 例：`371325` ⇒ `['371325','370000','371300']`；`370000` / `110000` ⇒ 仅自身（去重后 1 项）。
 */
function prefixCodes(code) {
  const out = [];
  for (const c of [code, `${code.slice(0, 2)}0000`, `${code.slice(0, 4)}00`]) {
    if (out.includes(c) || !isKnownOriginCode(c)) continue;
    out.push(c);
  }
  return out;
}

/** 计一张票：`counts` 收前缀码、`direct` 只收票自身；空码 / 非 6 位 / 未登记码 ⇒ 整体丢弃（不抛） */
function countTicket(counts, direct, raw) {
  if (!isKnownOriginCode(raw)) return;
  const code = String(raw).trim();
  direct.set(code, (direct.get(code) || 0) + 1);
  for (const c of prefixCodes(code)) counts.set(c, (counts.get(c) || 0) + 1);
}

/**
 * Map → 普通对象，**只含票数 > 0 的码**；键序 = 票数降序、同票按码升序
 * （仅内部表示顺序，口径未规定取值顺序；前端按键取值）。
 */
function toCountsObject(map) {
  const rows = [...map.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const out = {};
  for (const [code, n] of rows) out[code] = n;
  return out;
}

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

/**
 * 地区统计读取器工厂（默认实例见文件末）。依赖全部为**只读**函数；`now` 可注入以测 TTL。
 * 返回 `{ getStats() }` —— 恒 resolve，绝不 reject；同一缓存周期内返回**同一份快照对象**。
 */
export function createGeoStatsReader({ listTreeIds: listIds, getTree: readTree, getMeta: readMeta, now = Date.now } = {}) {
  let cached = null; // 最近一次成功快照
  let cachedAt = 0; // 最近一次成功快照的生成时刻（失败**不刷新** ⇒ 下次请求重试，不做负缓存）
  let inflight = null; // 单飞：扫描期间的 refresh promise

  /** 扫真源现算（只读；单树读失败只跳过该树，不整体失败） */
  async function scan() {
    const ids = await listIds(); // 清单失败**一律向上抛**（⇒ 入口走整体失败分支：上一次成功值 / 空快照，不刷新时刻、不进缓存）
    // 发源地源（第三源 + 各树 origin_codes）：meta 不可用 ⇒ 只让本源计 0，其余照常（不整体失败）
    let metaTrees = null;
    try {
      metaTrees = (await readMeta())?.trees || {};
    } catch {
      metaTrees = null;
    }
    const counts = new Map();
    const direct = new Map();
    const trees = {};
    const failed = [];
    const uniqueIds = [...new Set(ids.map((id) => String(id)))].sort(); // 去重 + 键升序（trees 键序可判负）
    for (const id of uniqueIds) {
      let tree;
      try {
        tree = await readTree(id); // 只有读取本身在 try 内：树结构损坏（people getter 抛错）仍算整体失败
      } catch {
        failed.push(id); // 读失败 ⇒ 跳过该树，id 记进 failed（不得整体失败）
        continue;
      }
      if (!tree) continue; // 不存在 / 已删 ⇒ 静默跳过（不进 failed）
      const people = tree.people || {};
      const residenceCodes = new Set();
      for (const handle of Object.keys(people)) {
        const person = people[handle];
        if (!person) continue;
        // 出生地：兼容历史字符串形态 —— 字符串一律不算票（它没有码）
        countTicket(counts, direct, person.birth_place?.origin_code);
        const residences = person.residence_places;
        if (!Array.isArray(residences)) continue; // 缺字段 / 非数组 ⇒ 该人无居住地票、无居住地码
        for (const item of residences) {
          countTicket(counts, direct, item?.origin_code); // 坏形状项 ⇒ 无码 ⇒ 不计票（不抛）
          if (!item || typeof item !== 'object') continue; // 树级居住地码只收对象项的合法码
          const code = normCode(item.origin_code);
          if (code) residenceCodes.add(code);
        }
      }
      const entry = metaTrees ? metaEntryOf(metaTrees, id) : null;
      const originCode = entry ? normCode(entry.origin_code) : null;
      trees[id] = {
        origin_codes: originCode ? [originCode] : [],
        residence_codes: [...residenceCodes].sort(),
      };
    }
    // 发源地（R2 第三源）：tree-meta 逐棵 1 票；meta 不可用 ⇒ 仅此源计 0 票
    if (metaTrees) {
      for (const entry of Object.values(metaTrees)) if (entry) countTicket(counts, direct, entry.origin_code);
    }
    return { counts: toCountsObject(counts), direct: toCountsObject(direct), trees, failed };
  }

  return {
    /** 取值入口：TTL 内直接返回缓存快照，过期才重扫（并发单飞） */
    async getStats() {
      if (cached && now() - cachedAt < GEO_STATS_TTL_MS) return cached;
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const r = await scan();
          cached = {
            v: GEO_STATS_VERSION,
            generated_at: new Date(now()).toISOString(),
            counts: r.counts,
            direct: r.direct,
            trees: r.trees,
            ...(r.failed.length ? { failed: r.failed } : {}),
          };
          cachedAt = now();
          return cached;
        } catch {
          return cached || EMPTY_STATS; // 整体失败 ⇒ 上一次成功快照；无 ⇒ 空快照（仍不抛、绝不 5xx）
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
  };
}

/**
 * 薄视图：把「取快照」+「裁形状」两步拼成一个取值函数。
 * **同一份快照对象 ⇒ 同一份出参对象**（缓存命中时引用不变，老测试的同一性判据不倒退）。
 */
export function createStatsView(getStats, project) {
  let lastSnapshot = null;
  let lastView = null;
  return async function view() {
    const snapshot = await getStats();
    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      lastView = project(snapshot);
    }
    return lastView;
  };
}

/** 裁出 `GET /geo/hot` 出参（键集与老实现逐字相同：v / generated_at / counts / direct[, failed]） */
export function projectGeoHot(snapshot) {
  return {
    v: GEO_STATS_VERSION,
    generated_at: snapshot.generated_at,
    counts: snapshot.counts,
    direct: snapshot.direct,
    ...(snapshot.failed ? { failed: snapshot.failed } : {}),
  };
}

/** 裁出 `GET /geo/tree-index` 出参（键集与老实现逐字相同：v / generated_at / trees[, failed]） */
export function projectGeoTreeIndex(snapshot) {
  return {
    v: GEO_STATS_VERSION,
    generated_at: snapshot.generated_at,
    trees: snapshot.trees,
    ...(snapshot.failed ? { failed: snapshot.failed } : {}),
  };
}

/** 模块级默认实例（两条路由共用这一份快照 ⇒ 一趟扫描、一个 generated_at） */
export const defaultGeoStats = createGeoStatsReader({ listTreeIds, getTree, getMeta });

/** 共享快照取值（诊断/测试用；路由走各模块的薄投影） */
export function getGeoStats() {
  return defaultGeoStats.getStats();
}
