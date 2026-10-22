/**
 * 家族等级 / 人数 / 活跃度口径 —— `/tree/rank` 与 `/tree/rank-index` 的**唯一实现**（纯函数 · 零 IO）
 *
 * 背景：首页家族列表原本逐树调 `GET /tree/rank`（20 棵树 = 20 个请求、每次进首页实时算）；
 * 新增聚合口 `GET /tree/rank-index`（24h 快照）后，两路必须**同一套口径**，否则同一棵树在
 * 详情卡片与首页列表里的人数 / 等级会分叉。故把原 `index.js` 里的 `MAX_DEPTH` / `RANKS` /
 * `computeTreeDepth` / `rankFromDepth` **原样上移**到本文件，两路共用：
 *
 *   · `/tree/rank`（单树）      = `treeRankFields(tree, { metaEntry, explicitGens, activity })`
 *   · `/tree/rank-index`（聚合）= 同一函数，逐树调用（`lib/tree-rank-index.js`）
 *
 * 口径（逐条与改造前 /tree/rank 一致，未放宽）：
 *   1. `total_generations`：详情档里有 `attributes[].key === 'external_chain_gen'` ⇒ 取其最大值
 *      （`explicit: true`，`parseInt(...) || 0`）；一个都没有 ⇒ 退回家族图 BFS 最长父系链（`explicit: false`）。
 *   2. 等级 = `rankFromDepth(total_generations)`：≤9 家乘 / ≤18 族乘 / ≤72 宗乘 / >72 世乘；
 *      `over_limit` = `total_generations > MAX_DEPTH`（72）。
 *   3. `person_count`：真源 = `lib/family-population.js` 的 `countFamilyMembers`（纯血缘图口径；
 *      世本 / 祖谱保持 = 树内 people 数）。**本文件不得另写一套计数**。
 *   4. `root_count` = people 中「无 `parent_family`」的节点数；`mirror_count` =
 *      `String(external_mirror) === 'true'` 的节点数（严格字面判据，与镜像口径全站一致）。
 *   5. `activity` = 近 30 天互动事件数（口径在 `lib/tree-activity.js`）；**由调用方注入数值**，
 *      本文件不读集合（纯函数）。
 *   6. `updated_at` = 树 JSON 原值，`undefined` / `null` ⇒ `''`，其余 `String(...)`。
 *   7. **不含任何鉴权 / 权限字段**（`access` 由 `/tree/rank` 单独拼装，聚合口不下发）。
 */

import { countFamilyMembers } from './family-population.js';

/** 深度上限（超过 ⇒ `over_limit: true`；写路径也用它拦新增节点） */
export const MAX_DEPTH = 72;

/** 四档等级（`key / label / en / desc` 逐字沿用改造前的常量） */
export const RANKS = {
  family: { key: 'family_rank', label: '家乘级', en: 'Family-Rank', desc: '短程亲属谱系，合计总世代 ≤9 世' },
  clan: { key: 'clan_rank', label: '族乘级', en: 'Clan-Rank', desc: '中程亲属谱系，合计总世代 10-18 世' },
  lineage: { key: 'lineage_rank', label: '宗乘级', en: 'Lineage-Rank', desc: '长程亲属谱系，合计总世代 19-72 世' },
  stemma: { key: 'stemma_rank', label: '世乘级', en: 'Stemma-Rank', desc: '远古长程谱系记录，合计总世代 >72 世' },
};

/**
 * 世代总数：优先外部链给出的世代（详情档 `external_chain_gen`），否则家族图 BFS 最长父系链。
 * @param {{people: object, families: object}} tree
 * @param {Map<string, number>|null} explicitGens
 * @returns {{ totalGenerations: number, personCount: number, explicit: boolean }}
 */
export function computeTreeDepth(tree, explicitGens) {
  if (explicitGens && explicitGens.size > 0) {
    return { totalGenerations: Math.max(...explicitGens.values()), personCount: explicitGens.size, explicit: true };
  }
  const childOf = new Map();
  const parentOf = new Map();
  for (const f of Object.values(tree.families)) {
    const parents = [f.father_handle, f.mother_handle].filter(Boolean);
    for (const c of f.child_handles || []) {
      if (!childOf.has(c)) childOf.set(c, new Set());
      for (const p of parents) childOf.get(c).add(p);
    }
    for (const p of parents) {
      if (!parentOf.has(p)) parentOf.set(p, new Set());
      for (const c of f.child_handles || []) parentOf.get(p).add(c);
    }
  }
  const allPeople = new Set([...Object.keys(tree.people), ...childOf.keys(), ...parentOf.keys()]);
  const roots = [...allPeople].filter((p) => !childOf.has(p) || childOf.get(p).size === 0);
  if (roots.length === 0) return { totalGenerations: 1, personCount: allPeople.size, explicit: false };
  const depth = new Map();
  const queue = [...roots];
  for (const r of roots) depth.set(r, 1);
  let maxDepth = 1;
  let guard = 0;
  while (queue.length && guard < 100000) {
    guard++;
    const cur = queue.shift();
    const curDepth = depth.get(cur) || 1;
    for (const child of parentOf.get(cur) || []) {
      const nd = curDepth + 1;
      if (nd > (depth.get(child) || 0)) {
        depth.set(child, nd);
        maxDepth = Math.max(maxDepth, nd);
        queue.push(child);
      }
    }
  }
  return { totalGenerations: maxDepth, personCount: allPeople.size, explicit: false };
}

/** 世代总数 → 等级档（四分档，边界逐字沿用改造前实现） */
export function rankFromDepth(total) {
  if (total <= 9) return RANKS.family;
  if (total <= 18) return RANKS.clan;
  if (total <= 72) return RANKS.lineage;
  return RANKS.stemma;
}

/**
 * 详情档列表 → `handle → external_chain_gen`（只收该属性；`parseInt(...) || 0`）。
 * @param {Array<{handle: string, attributes?: Array<{key: string, value: any}>}>} details
 * @returns {Map<string, number>}
 */
export function explicitGensOf(details) {
  const gens = new Map();
  for (const d of details || []) {
    const g = (d?.attributes || []).find((a) => a && a.key === 'external_chain_gen');
    if (g) gens.set(d.handle, parseInt(g.value, 10) || 0);
  }
  return gens;
}

/**
 * 单树等级字段（`/tree/rank` 出参除 `tree_id` / `access` 外的全部字段；聚合口逐树同形）。
 * @param {{people?: object, families?: object, updated_at?: any}} tree
 * @param {{metaEntry?: object|null, explicitGens?: Map<string, number>|null, activity?: number}} [opts]
 * @returns {{
 *   total_generations: number, rank_key: string, rank_label: string, rank_en: string, rank_desc: string,
 *   over_limit: boolean, max_depth: number, root_count: number, person_count: number,
 *   mirror_count: number, explicit: boolean, activity: number, updated_at: string,
 * }}
 */
export function treeRankFields(tree, { metaEntry = null, explicitGens = null, activity = 0 } = {}) {
  const { totalGenerations, explicit } = computeTreeDepth(tree, explicitGens);
  const rank = rankFromDepth(totalGenerations);
  const people = tree.people || {};
  const values = Object.values(people);
  return {
    total_generations: totalGenerations,
    rank_key: rank.key,
    rank_label: rank.label,
    rank_en: rank.en,
    rank_desc: rank.desc,
    over_limit: totalGenerations > MAX_DEPTH,
    max_depth: MAX_DEPTH,
    root_count: values.filter((p) => !p.parent_family).length,
    // 人数真源 = lib/family-population.js（纯血缘图口径；分层按 tree-meta 的 kind / is_master）
    person_count: countFamilyMembers(tree, metaEntry, { kind: metaEntry?.kind, is_master: !!metaEntry?.is_master }),
    // 镜像数：严格字面判据（'true' / 布尔 true 都命中）—— 与全站镜像口径一致
    mirror_count: values.filter((p) => String(p.external_mirror) === 'true').length,
    explicit,
    activity,
    updated_at: tree.updated_at === undefined || tree.updated_at === null ? '' : String(tree.updated_at),
  };
}
