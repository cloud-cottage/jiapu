/**
 * 统一节点解析器 —— docs/id-system.spec.md §5 ＋ §12（编号口径「甲」· A-5：取记录 = 真身优先 + 镜像标注）
 *
 * `resolveNode(ref, treeId?, opts?)` →
 * `{ tree_id, handle, gramps_id, matched, is_mirror, source_tree_id, source_tree_title }` | null
 *
 * 接受的写法（新旧形态互认：**去可选前缀 + 去前导零比数值**）：
 * | 输入 | 示例 | 说明 |
 * |---|---|---|
 * | 全局编号（新/旧人号） | `000000052` / `I000000052` / `000052` / `I000052` / `0052` / `I0052` / `52` | 全站唯一定位，**不需要指定树** |
 * | handle | `10400594c54f5203f61bf4fa4b20` | 精确锁定（主键） |
 * | 树内旧号（过渡期） | `0052` + `tree_id` | 兼容历史输入（迁移前的树内序号 / legacy_gramps_id） |
 *
 * opts：
 * - `targetTreeId`：限定只在该树查找（用户在界面上显式指定目标树时用）；找不到 → 返回 null
 * - `listIdsFn`：树清单注入（测试用）
 * 语义：
 * - 全局编号优先于树内旧号（`000052` 命中全站 I000052，而不是 zhonghua 的 I0052）；
 *   全局编号查不到时**才**按「本树旧号 → 其余树旧号」回退（过渡期兼容）；
 * - 其余树里旧号命中多棵树（迁移前的重号数据）→ **真身优先**择一；命中 ≥2 条**真身** ⇒ 抛错要求
 *   指定目标树（绝不猜、绝不静默取首条）。
 *
 * ★ A-5（编号口径「甲」2026-10-16）：`gramps_id` 标识**人**（同人 N 棵树 = 1 个编号 + N 个 handle）⇒
 * 同一编号**可以命中多条记录**（1 条真身 + N 条镜像；立支形态下同一棵树内甚至可有两镜像同号）。
 * 取记录一律「**真身优先 + 镜像标注**」，**不得**依赖数组 / 对象键顺序取首条：
 * - 候选集内**恰 1 条真身**（`external_mirror !== 'true'`）⇒ 取真身；
 * - 候选集内**只有镜像** ⇒ 按「登记镜像（`external_link_type === 'founder'`）> 其它镜像」→ `tree_id` →
 *   `handle` 字典序**稳定择一**，并在出参带 `is_mirror` / `source_tree_id` / `source_tree_title`
 *   （= 镜像 `external_tree` 指向的真身树），供调用侧显示「镜像 · 源自 <树名>」；
 * - 候选集内 **≥2 条真身** = 违规（同一人只允许 1 条真身，A-3）⇒ 抛 400，**绝不静默取首条**。
 * 范围的收口（本单口径）：给了树上下文（`treeId`）或显式目标树（`targetTreeId`）时，**该树内有任何
 * 命中即就地收口**（A-5 第 2 句「本树只有镜像而无真身 ⇒ 取本树那条」——树内搜索 / 「指定 ID」档
 * 靠它按编号定位本树节点）；无树上下文时才跨树择优。
 *
 * 说明：家族记录编号（F000012）不是本解析器的目标（各入口都只解析人物节点），
 * 传入 F 开头的编号会被当作「非人物引用」→ 返回 null。
 */
import { getTree, listTreeIds, getAllDetails, getMeta } from './store.js';
import { formatId, idKey, numberOfId, parseGlobalId, SEQ_PERSON } from './id-seq.js';

const HK_RE = /^[0-9a-f]{16,}$/i;

/**
 * 镜像判据（**全站唯一口径**：口径 A-2 / `docs/id-system.spec.md` §5）：
 * `external_mirror === 'true'` **且** `external_person_handle` 非空。
 * ⚠️ 真身自身也会带 `external_*`（配偶 / 认祖指针）⇒ **不得**用「有 external_*」当判据。
 */
export function isMirrorRecord(person) {
  return (
    String(person?.external_mirror ?? '').trim() === 'true' && !!String(person?.external_person_handle ?? '').trim()
  );
}

/**
 * 镜像档位（R-3 稳定规则；数值越小越优先）：
 * `0` = 真身（非镜像）/ `1` = 登记镜像（`external_link_type === 'founder'`）/ `2` = 其它镜像。
 * 说明：登记镜像 = 支系在祖谱内的登记位（写路径依赖它自己的 handle）⇒ 取记录时优先于世系链 / 婚姻 /
 * 子女等其它形态镜像。
 */
export function mirrorRankOf(person) {
  if (!isMirrorRecord(person)) return 0;
  return String(person?.external_link_type ?? '').trim() === 'founder' ? 1 : 2;
}

/** 候选（`{tree_id, person}`）比较器：档位 → `tree_id` 字典序 → `handle` 字典序（**全序**，不依赖数组顺序） */
function cmpCandidate(a, b) {
  const ra = mirrorRankOf(a.person);
  const rb = mirrorRankOf(b.person);
  if (ra !== rb) return ra - rb;
  if (a.tree_id !== b.tree_id) return a.tree_id < b.tree_id ? -1 : 1;
  const ha = String(a.person?.handle || '');
  const hb = String(b.person?.handle || '');
  if (ha !== hb) return ha < hb ? -1 : 1;
  return 0;
}

/** 违规（同一编号 ≥2 条真身 · A-5）错误：400，附全部真身落点供巡检定位 */
function duplicateTrueBodyError(refText, reals) {
  const where = reals.map((c) => `${c.tree_id}（${c.person?.name || c.person?.handle || ''}）`).join('、');
  const err = new Error(
    `编号「${refText}」命中 ${reals.length} 条真身记录（同一人只允许 1 条真身）：${where}；请巡检修正数据后再操作`,
  );
  err.status = 400;
  return err;
}

/**
 * 同一编号的候选择一（**R-1 / R-3 的唯一实现**，后端各「按编号取记录」路径共用）：
 * 真身优先 → 登记镜像 → 其它镜像 → `tree_id` → `handle` 字典序；≥2 条真身 ⇒ 抛 400（违规，不静默取首条）。
 * @param {Array<{tree_id:string, person:object}>} cands
 * @param {string} [refText] 出错文案里的原文编号（缺省取候选自己的 gramps_id）
 */
export function pickByIdentity(cands, refText = '') {
  const list = (cands || []).filter((c) => c && c.person);
  if (!list.length) return null;
  const sorted = list.slice().sort(cmpCandidate);
  const reals = sorted.filter((c) => mirrorRankOf(c.person) === 0);
  if (reals.length > 1) throw duplicateTrueBodyError(refText || String(reals[0].person?.gramps_id || ''), reals);
  return sorted[0];
}

/** 树 JSON 里按**精确存号**找**全部**命中（口径甲：同一编号可对应多条记录 ⇒ 收集全集再择一） */
function collectByExactId(tree, wantId) {
  const want = String(wantId || '').toUpperCase();
  if (!want) return [];
  const out = [];
  for (const p of Object.values(tree?.people || {})) {
    if (String(p?.gramps_id || '').toUpperCase() === want) out.push(p);
  }
  return out;
}

/** 旧号（legacy）候选：与 ref **数值等价**（去可选前缀 + 去前导零），共享判据 = id-seq.idKey */
function legacyHit(node, wantKey) {
  const legacy = node?.legacy_gramps_id;
  if (!legacy) return false;
  return idKey(legacy) === wantKey;
}

/**
 * 树内旧号解析：数值等价 gramps_id → 树内 legacy_gramps_id（→ 详情文档 legacy_gramps_id）。
 * 返回**全部**命中记录（择一由 pickByIdentity 统一决定，本函数不得取首条）。
 */
async function collectLocalLegacy(tree, treeId, wantKey, { withDetails = true } = {}) {
  if (!wantKey) return [];
  const out = [];
  for (const p of Object.values(tree?.people || {})) {
    if (!p?.gramps_id) continue;
    if (idKey(p.gramps_id) === wantKey || legacyHit(p, wantKey)) out.push(p);
  }
  if (out.length || !withDetails) return out;
  try {
    for (const d of await getAllDetails(treeId)) {
      if (legacyHit(d, wantKey)) {
        const p = tree?.people?.[d.handle];
        if (p) out.push(p);
      }
    }
  } catch {
    /* 详情目录不可用（云端/无详情）→ 忽略 */
  }
  return out;
}

/**
 * @param {string} ref 全局编号 / handle / 树内旧号
 * @param {string} [treeId] 当前树（树内旧号的上下文）
 * @param {{targetTreeId?: string, listIdsFn?: Function}} [opts]
 * @returns {Promise<{tree_id:string, handle:string, gramps_id:string, matched:'handle'|'global'|'legacy',
 *   is_mirror:boolean, source_tree_id:string, source_tree_title:string}|null>}
 */
export async function resolveNode(ref, treeId = '', opts = {}) {
  const s = String(ref || '').trim();
  if (!s) return null;
  const scope = String(opts.targetTreeId || '').trim();
  const local = String(treeId || '').trim();
  const listIdsFn = opts.listIdsFn || listTreeIds;
  let all = [];
  try {
    all = (await listIdsFn()).filter(Boolean).sort();
  } catch {
    all = [];
  }
  // 搜索顺序：显式指定的目标树 → 本树 → 其余树（字典序，稳定）
  const candidates = scope ? [scope] : [...new Set([local, ...all].filter(Boolean))];

  const loaded = new Map();
  const treeOf = async (id) => {
    if (!loaded.has(id)) {
      let t = null;
      try {
        t = await getTree(id);
      } catch {
        t = null;
      }
      loaded.set(id, t);
    }
    return loaded.get(id);
  };

  /**
   * 出参（含 A-5 镜像标注）：`is_mirror` 恒有；镜像才有 `source_tree_id` / `source_tree_title`。
   * 来源树名取 `tree-meta` 的 `display_title`（取不到 → 回退 tree_id，与前端 `treeDisplayTitleOf` 同口径；
   * meta 不可用也不抛）。
   */
  const hit = async (tree_id, handle, matched) => {
    const person = loaded.get(tree_id)?.people?.[handle] || null;
    const out = {
      tree_id,
      handle,
      gramps_id: (person?.gramps_id || '') + '',
      matched,
      is_mirror: isMirrorRecord(person),
      source_tree_id: '',
      source_tree_title: '',
    };
    if (out.is_mirror) {
      const src = String(person?.external_tree || '').trim();
      out.source_tree_id = src;
      let title = src;
      try {
        title = String((await getMeta())?.trees?.[src]?.display_title || src);
      } catch {
        title = src;
      }
      out.source_tree_title = title;
    }
    return out;
  };

  /** 单一候选 → 出参 */
  const hitOfCandidate = (c, matched) => hit(c.tree_id, c.person.handle, matched);

  // ① handle：主键精确锁定（全站唯一）。
  // 先只看「上下文树 / 显式指定的目标树」（零额外 IO），再看其余树（仅非编号写法，避免误判与无谓下载）
  const primary = (scope ? [scope] : [local]).filter(Boolean);
  for (const id of primary) {
    const t = await treeOf(id);
    if (t?.people?.[s]) return hit(id, s, 'handle');
  }

  const parsed = parseGlobalId(s);
  const looksLikeHandle = !parsed && s.length >= 2 && /^[0-9a-zA-Z_-]+$/.test(s);
  if (looksLikeHandle) {
    for (const id of candidates) {
      if (primary.includes(id)) continue;
      const t = await treeOf(id);
      if (t?.people?.[s]) return hit(id, s, 'handle');
    }
  }
  const num = numberOfId(s);
  // 新旧形态互认的规范键（去可选前缀 + 去前导零比数值；共享纯函数 id-seq.idKey）
  const wantKey = idKey(s);

  // ② 全局编号（人）：全站定位 —— 但**同一编号可对应多条记录**（A-1 / A-2：镜像不铸号 ⇒ 镜像与真身同号）
  //    ⇒ 收集**全部**候选再按 A-5 择一（真身优先），**绝不**「命中即锁定」靠数组 / 键序取首条。
  if (parsed && parsed.kind === SEQ_PERSON) {
    const want = formatId(SEQ_PERSON, parsed.number);
    const found = [];
    for (const id of candidates) {
      const t = await treeOf(id);
      const ps = collectByExactId(t, want);
      if (!ps.length) continue;
      for (const p of ps) found.push({ tree_id: id, person: p });
      // A-5 第 2 句：给了树上下文 / 显式目标树 ⇒ 该树有命中即就地收口（「本树只有镜像 ⇒ 取本树那条」，
      // 并带「镜像 · 源自 <树名>」标注）——树内搜索 / 「指定 ID」档正是靠它按编号定位本树节点；
      // 无树上下文（跨树搜索 / 迁移）才继续找别树的真身。
      if (id === local || id === scope) {
        return hitOfCandidate(
          pickByIdentity(
            found.filter((c) => c.tree_id === id),
            s,
          ),
          'global',
        );
      }
    }
    if (found.length) return hitOfCandidate(pickByIdentity(found, s), 'global');
  }
  if (num === null) return null;

  // ③ 树内旧号（过渡期）：显式指定目标树时只认该树
  if (scope) {
    const t = await treeOf(scope);
    const row = pickByIdentity(
      (await collectLocalLegacy(t, scope, wantKey)).map((p) => ({ tree_id: scope, person: p })),
      s,
    );
    return row ? hitOfCandidate(row, 'legacy') : null;
  }
  if (local) {
    const t = await treeOf(local);
    const row = pickByIdentity(
      (await collectLocalLegacy(t, local, wantKey)).map((p) => ({ tree_id: local, person: p })),
      s,
    );
    if (row) return hitOfCandidate(row, 'legacy');
  }

  // ④ 其余树（过渡期旧号）：**真身优先**——恰 1 条真身 ⇒ 用它；≥2 条真身 ⇒ 违规（要求指定目标树，
  //    既有文案不变）；只有镜像（迁移后同号形态）⇒ 按 R-3 稳定择一，不再误报「重号」。
  const hits = [];
  for (const id of candidates) {
    if (id === local) continue;
    const t = await treeOf(id);
    if (!t?.people) continue;
    const ps = await collectLocalLegacy(t, id, wantKey, { withDetails: false });
    if (ps.length) hits.push(pickByIdentity(ps.map((p) => ({ tree_id: id, person: p })), s));
  }
  const reals = hits.filter((c) => mirrorRankOf(c.person) === 0);
  if (reals.length === 1) return hitOfCandidate(reals[0], 'legacy');
  if (reals.length > 1) {
    const which = reals.map((c) => `${c.tree_id}（${c.person?.name || ''}）`).join('、');
    const err = new Error(`编号「${s}」在多个家族树中重号：${which}；请指定目标家族树后再操作`);
    err.status = 400;
    throw err;
  }
  if (hits.length) return hitOfCandidate(hits.slice().sort(cmpCandidate)[0], 'legacy');
  return null;
}

/**
 * 解析「人物引用」→ handle（在给定树上下文里）；失败返回 ''。
 * 便捷包装：调用方通常只想要 handle（如路由侧把用户输入的编号落成 handle）。
 */
export async function resolveHandle(ref, treeId = '', opts = {}) {
  const hit = await resolveNode(ref, treeId, opts);
  return hit ? hit.handle : '';
}
