/**
 * 统一节点解析器 —— docs/id-system.spec.md §5
 *
 * `resolveNode(ref, treeId?, opts?)` → `{ tree_id, handle, gramps_id, matched }` | null
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
 * - 其余树里旧号命中多棵树（迁移前的重号数据）→ 抛错要求指定目标树，绝不猜。
 *
 * 说明：家族记录编号（F000012）不是本解析器的目标（各入口都只解析人物节点），
 * 传入 F 开头的编号会被当作「非人物引用」→ 返回 null。
 */
import { getTree, listTreeIds, getAllDetails } from './store.js';
import { formatId, idKey, numberOfId, parseGlobalId, SEQ_PERSON } from './id-seq.js';

const HK_RE = /^[0-9a-f]{16,}$/i;

/** 树 JSON 里按**精确存号**找 handle（新形态全局编号用；字符串等价，大小写不敏感） */
function findByExactId(tree, wantId) {
  const want = String(wantId || '').toUpperCase();
  for (const p of Object.values(tree?.people || {})) {
    if (String(p?.gramps_id || '').toUpperCase() === want) return p.handle;
  }
  return '';
}

/** 旧号（legacy）候选：与 ref **数值等价**（去可选前缀 + 去前导零），共享判据 = id-seq.idKey */
function legacyHit(node, wantKey) {
  const legacy = node?.legacy_gramps_id;
  if (!legacy) return false;
  return idKey(legacy) === wantKey;
}

/** 树内旧号解析：数值等价 gramps_id → 树内 legacy_gramps_id → 详情文档 legacy_gramps_id */
async function findLocalLegacy(tree, treeId, wantKey, { withDetails = true } = {}) {
  if (!wantKey) return '';
  for (const p of Object.values(tree?.people || {})) {
    if (!p?.gramps_id) continue;
    if (idKey(p.gramps_id) === wantKey) return p.handle;
    if (legacyHit(p, wantKey)) return p.handle;
  }
  if (!withDetails) return '';
  try {
    for (const d of await getAllDetails(treeId)) {
      if (legacyHit(d, wantKey)) return d.handle;
    }
  } catch {
    /* 详情目录不可用（云端/无详情）→ 忽略 */
  }
  return '';
}

/**
 * @param {string} ref 全局编号 / handle / 树内旧号
 * @param {string} [treeId] 当前树（树内旧号的上下文）
 * @param {{targetTreeId?: string, listIdsFn?: Function}} [opts]
 * @returns {Promise<{tree_id:string, handle:string, gramps_id:string, matched:'handle'|'global'|'legacy'}|null>}
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
  const hit = (tree_id, handle, matched) => ({
    tree_id,
    handle,
    gramps_id: (loaded.get(tree_id)?.people?.[handle]?.gramps_id || '') + '',
    matched,
  });

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

  // ② 全局编号（人）：全站唯一 → 命中即锁定，不需要树上下文
  if (parsed && parsed.kind === SEQ_PERSON) {
    const want = formatId(SEQ_PERSON, parsed.number);
    for (const id of candidates) {
      const t = await treeOf(id);
      const h = findByExactId(t, want);
      if (h) return hit(id, h, 'global');
    }
  }
  if (num === null) return null;

  // ③ 树内旧号（过渡期）：显式指定目标树时只认该树
  if (scope) {
    const t = await treeOf(scope);
    const h = await findLocalLegacy(t, scope, wantKey);
    return h ? hit(scope, h, 'legacy') : null;
  }
  if (local) {
    const h = await findLocalLegacy(await treeOf(local), local, wantKey);
    if (h) return hit(local, h, 'legacy');
  }

  // ④ 其余树：唯一命中才用；多树重号（迁移前数据）→ 明确要求指定目标树
  const hits = [];
  for (const id of candidates) {
    if (id === local) continue;
    const t = await treeOf(id);
    if (!t?.people) continue;
    const h = await findLocalLegacy(t, id, wantKey, { withDetails: false });
    if (h) hits.push({ tree_id: id, handle: h, name: t.people[h]?.name || '' });
  }
  if (hits.length === 1) return hit(hits[0].tree_id, hits[0].handle, 'legacy');
  if (hits.length > 1) {
    const which = hits.map((c) => `${c.tree_id}（${c.name}）`).join('、');
    const err = new Error(`编号「${s}」在多个家族树中重号：${which}；请指定目标家族树后再操作`);
    err.status = 400;
    throw err;
  }
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
