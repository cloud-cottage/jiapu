/**
 * 锚点 + 节点编辑范围校验（与 auth-server/scope.js 行为一致）
 * 锚点集合：jiazu_anchors（phone -> {tree_id, person_handle, updated_at}）
 */
import { colGet, colAll, colSet, colDelete, getTree } from './store.js';
import { appendOpsLog, opsLogId } from './economy-ops.js';

/** 手机号脱敏（审计 / 出参**绝不下发整串手机号**；与 `economy-spirit` / `invite` 同口径） */
export function maskPhone(phone) {
  const s = String(phone || '');
  if (!s) return '';
  return s.length >= 7 ? `${s.slice(0, 3)}****${s.slice(-4)}` : `${s.slice(0, 3)}****`;
}

/** 校验类错误的单一构造口（lib 层约定：错误自带 status，路由 catch 按 status 出码） */
function anchorError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * 锚点全表读取 —— **本模块唯一一处**锚点全表扫描（唯一性口径单点；见 anchors/invite-codes 测试的「恰 1 处」判据）。
 * 其它模块（含 `invite-codes`）**不得自扫全表**：一律经 `anchorHolderPhone` / `isPersonHandleTaken` 查询。
 */
async function allAnchors() {
  return colAll('jiazu_anchors');
}

/**
 * 只读查询：该 handle 的占用者手机号（无人占用 / handle 空 ⇒ `null`）；`excludePhone` = 把自己排除在外。
 * **只读、不写、不抛**（409 的判定仍只在 `assertAnchorBindable` 内）。
 */
export async function anchorHolderPhone(personHandle, excludePhone = '') {
  const handle = String(personHandle || '').trim();
  if (!handle) return null;
  const exclude = String(excludePhone || '').trim();
  const hit = (await allAnchors()).find(
    (a) => a && String(a.person_handle || '').trim() === handle && String(a._id || a.phone || '').trim() !== exclude,
  );
  return hit ? String(hit._id || hit.phone || '').trim() : null;
}

/** 只读查询（布尔）：该节点是否**已被任何人**绑定（含自己）—— 供 `resolve` 的 `can_bind` 用 */
export async function isPersonHandleTaken(personHandle) {
  return (await anchorHolderPhone(personHandle, '')) !== null;
}

/**
 * 锚点可绑定性校验 —— **set-anchor / approve-join 共用的单点函数（严禁两套口径）**。
 *
 * 两条校验（Kevin 2026-09-30 当面拍定）：
 *  ① **存在性**：目标树 `people[person_handle]` 必须存在 ⇒ 否则 **404**（文案带节点标识，堵坏锚点）；
 *  ② **全站唯一**：唯一键 = `person_handle`（**全站唯一 · 不按树分**）—— 扫 `jiazu_anchors` 全表，
 *     存在**其它 phone** 已绑同一 handle ⇒ **409**；文案**不得下发占用者手机号**。
 *     豁免：`opts.force === true` **且** `opts.role === 'chief_editor'` ⇒ 允许覆盖；
 *     其它角色传 `force` 一律忽略（仍 409）；`force` **只能来自请求体显式字段**、不得默认开启。
 *
 * 自身覆盖不算冲突：`forPhone` 自己已绑同一 handle（或改绑别的节点）⇒ 放行（⑥）。
 *
 * **批 A 缺口补齐（2026-09-30 批 C-1）**：`force` 覆盖放行时，**必须一并清空原占用者的锚点**
 * （`clearAnchor(原 phone)`）+ 写一条审计记录（复用既有 ops log 机制）——
 * 否则数据里会并存**两条指向同一节点**的锚点记录，违反「全站唯一」。响应带 `reassigned_from`（脱敏）。
 *
 * @param {string} personHandle 目标人物节点 handle
 * @param {string} forPhone 将要绑定的手机号（其自身旧锚点不构成冲突）
 * @param {{treeId?: string, tree?: any, force?: boolean, role?: string, operator?: string}} [opts]
 *        treeId 目标树；tree 可选（调用方已取到时传入，省一次 getTree）；force / role 见上；
 *        operator = 发起本次覆盖的管理员手机号（仅写审计用，**不下发**）。
 * @returns {Promise<{ok: true, overridden: boolean, reassigned_from: string|null}>}
 *        overridden = 确实发生了 chief_editor 强制覆盖；reassigned_from = 被移除占用者（脱敏），无覆盖 = null
 * @throws {Error} status 404（树 / 节点不存在）或 409（已被他人绑定）
 */
export async function assertAnchorBindable(personHandle, forPhone, opts = {}) {
  const handle = String(personHandle || '').trim();
  const phone = String(forPhone || '').trim();
  const treeId = String(opts.treeId || '').trim();
  if (!handle) throw anchorError(400, '参数错误：person_handle 必填');

  // ---- ① 存在性 ----
  const tree = opts.tree || (treeId ? await getTree(treeId) : null);
  if (!tree) throw anchorError(404, `家族树不存在: ${treeId || '(未指定 tree_id)'}`);
  if (!tree.people || !tree.people[handle]) {
    throw anchorError(404, `该家族树中找不到此节点: ${handle}（tree_id=${treeId || tree.tree_id || ''}）`);
  }

  // ---- ② 全站唯一（person_handle 不按树分；读取走本模块唯一一处全表扫描）----
  const occupierPhone = await anchorHolderPhone(handle, phone);
  if (!occupierPhone) return { ok: true, overridden: false, reassigned_from: null };

  const force = opts.force === true && opts.role === 'chief_editor';
  if (!force) throw anchorError(409, '该人物节点已被其他用户绑定，请联系管理员处理');

  // ---- ③ force 覆盖：清空原占用者锚点 + 审计（批 A 缺口）----
  await clearAnchor(occupierPhone);
  await appendOpsLog({
    id: opsLogId(),
    ts: new Date().toISOString(),
    operator: String(opts.operator || '').trim(),
    // `target_phone` = **被移除的手机号**（内部审计字段；接口一律只回 `reassigned_from` 脱敏串）
    target_phone: occupierPhone,
    delta: {},
    reason: 'anchor_force_reassign',
    ref: {
      tree_id: treeId || tree.tree_id || '',
      person_handle: handle,
      reassigned_from: maskPhone(occupierPhone),
      reassigned_to: maskPhone(phone),
    },
  });
  return { ok: true, overridden: true, reassigned_from: maskPhone(occupierPhone) };
}

/**
 * 写锚点（**唯一写路径**）。
 * @param {string} phone
 * @param {string} treeId
 * @param {string} personHandle
 * @param {object} [extra] 附加上文字段（批 C-1：`{ via_invite_code }` —— 邀请绑定审计锚点）；
 *                         **缺省不传 = 文档逐字同既有形状**（不新增空字段）。
 */
export async function setAnchor(phone, treeId, personHandle, extra = null) {
  const doc = {
    tree_id: treeId,
    person_handle: personHandle,
    updated_at: new Date().toISOString(),
  };
  if (extra && typeof extra === 'object') Object.assign(doc, extra);
  await colSet('jiazu_anchors', phone, doc);
}

export async function clearAnchor(phone) {
  await colDelete('jiazu_anchors', phone);
}

export async function getAnchor(phone) {
  return colGet('jiazu_anchors', phone);
}

/**
 * 构建用户可编辑的 person/family 范围
 * user: 锚点节点 + 全部后代；branch_curator: 上下三代；tree_steward/chief_editor: 无限制
 */
export async function buildScope(families, phone, role) {
  if (role === 'tree_steward' || role === 'chief_editor') {
    return { person: null, family: null, unrestricted: true };
  }
  const anchor = await getAnchor(phone);
  if (!anchor) return { person: new Set(), family: new Set(), unrestricted: false };

  const personScope = new Set([anchor.person_handle]);
  const familyScope = new Set();

  // person -> 作为父母的家族 / 作为子女的家族
  const parentOf = new Map();
  const childOf = new Map();
  for (const f of families) {
    for (const p of [f.father_handle, f.mother_handle]) {
      if (!p) continue;
      if (!parentOf.has(p)) parentOf.set(p, []);
      parentOf.get(p).push(f.handle);
    }
    for (const ch of f.child_handles || []) {
      if (!childOf.has(ch)) childOf.set(ch, []);
      childOf.get(ch).push(f.handle);
    }
  }

  const descend = (start, limit) => {
    const queue = [start];
    const depth = new Map([[start, 0]]);
    while (queue.length) {
      const h = queue.shift();
      const d = depth.get(h) || 0;
      if (limit !== null && d >= limit) continue;
      for (const famHandle of parentOf.get(h) || []) {
        familyScope.add(famHandle);
        const fam = families.find((x) => x.handle === famHandle);
        for (const ch of fam?.child_handles || []) {
          if (!depth.has(ch)) {
            depth.set(ch, d + 1);
            personScope.add(ch);
            queue.push(ch);
          }
        }
        if (fam?.father_handle && fam?.mother_handle) {
          const spouse = fam.father_handle === h ? fam.mother_handle : fam.father_handle;
          if (!depth.has(spouse)) {
            depth.set(spouse, d + 1);
            personScope.add(spouse);
          }
        }
      }
    }
  };

  if (role === 'branch_curator') {
    descend(anchor.person_handle, 3);
    let cur = anchor.person_handle;
    for (let i = 0; i < 3; i++) {
      const fams = childOf.get(cur) || [];
      if (!fams.length) break;
      const fam = families.find((x) => x.handle === fams[0]);
      if (!fam) break;
      familyScope.add(fam.handle);
      const parent = fam.father_handle || fam.mother_handle;
      if (!parent) break;
      personScope.add(parent);
      cur = parent;
    }
  } else {
    descend(anchor.person_handle, null);
  }

  return { person: personScope, family: familyScope, unrestricted: false };
}

/** 便捷：用户能否编辑某 person */
export async function canEditPerson(families, phone, role, personHandle) {
  const scope = await buildScope(families, phone, role);
  if (scope.unrestricted) return true;
  return scope.person.has(personHandle);
}

/** 便捷：用户能否编辑某 family（family 内的孩子或父母在范围内即可） */
export async function canEditFamily(families, phone, role, familyHandle) {
  const scope = await buildScope(families, phone, role);
  if (scope.unrestricted) return true;
  return scope.family.has(familyHandle);
}
