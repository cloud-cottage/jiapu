/**
 * 修谱域 · 后记（postscript）名册解析 —— `lib/revision-postscript.js`
 *
 * 用途：在线文谱「后记」页把「始纂人 / 主司」显示为**人名**（Kevin 定稿文案例：「由【季清昆】始纂」）。
 * 出参只挂在 `GET /revisions` 的**顶层新增键** `postscript`（**只增不改**，既有键一字不动）：
 *   `{ created_by: string, created_by_name: string, masters: [{ seq: number, name: string }] }`
 *   · `created_by`      = tree-meta `created_by` **原值**（可空串）
 *   · `created_by_name` = 对该原值跑姓名解析的结果（可空串）
 *   · `masters`         = **与出参 `revisions[]` 同序同长**；`name` 可空串
 *
 * **姓名解析唯一函数 = `resolveDisplayName(phone, treeId)`**（本单内单点实现，别处不得另写一套）；
 * 四级降级（**任何一步读失败 / 集合缺失 ⇒ 不抛异常，降级到下一级** —— 口径与 `lib/tree-activity.js`
 * 的「集合缺失 ⇒ 空态不抛」先例一致；最终空串由前端处理）：
 *   ① `jiapu_anchors` 档 `_id = phone` 且 `tree_id === treeId` 且 `person_handle` 非空
 *      ⇒ 取**该树** `people[person_handle].name`（**取到非空即返回**；读不到则继续）；
 *   ② `jiapu_users` 档 `_id = phone` 的 `nickname` 非空 ⇒ 返回；
 *   ③ 11 位纯数字手机号 ⇒ **打码**（前 3 + `****` + 后 4，如 `166****1656`）；
 *   ④ 仍无 ⇒ 返空串 `''`。
 *
 * **每轮「主司」取值口径（Kevin 2026-10-12 当面拍定 · 改口径）**：
 *   ① **主司优先**：该轮 `helpers` 中 `duty === '主司'` 的族人 ⇒ 取**该树**
 *      `people[person_handle].name`（取到非空即返回；取不到 —— 无主司 / 节点已删 / 姓名为空 —— 继续）；
 *   ② **回退**：该轮无主司（`helpers` 空 / 无 `duty='主司'`）⇒ 走既有「账号操作者手机号」路径，
 *      优先级逐字为 `round.operator` ?? `round.fee_ref?.paid_by` ?? `round.paid_by`，
 *      再经四级降级 `resolveDisplayName(phone, treeId)` 解析。
 *   ⚠️ 主司职务名常量 `MASTER_DUTY` 与 `lib/revision.js` 的 `HELPER_DUTY_MASTER` **逐字一致**
 *      （两处同源，改一处必改另一处；此处**不 import** revision.js —— 会构成循环依赖）。
 * ⚠️ **实测真实档形状（2026-10-12 直读云端 `jiapu_revisions/ji_23395_01`）**：档体
 * `{_id, seq, revisions, version}`，档内每轮键 = `seq, started_at, effective_at, locked_at, cover,
 * article, helpers, donations, content_updated_at, fee_ref` —— **`operator` / `paid_by` 两键均不存在**
 * ⇒ 真实数据下命中的是 **`fee_ref.paid_by`**（开轮预扣时写入的手机号）。三者皆无 ⇒ `name = ''`。
 * （`masterPhoneOf` 按同一优先级取值，但把「空串 / 纯空白」也视为「无」—— 与「三者皆无 ⇒ 空串」同义。）
 *
 * 零新集合、零新路由、零写路径改动：本模块**只读** `jiapu_anchors` / `jiapu_users` / 树 JSON / tree-meta。
 */
import { colGet, getTree, getMeta } from './store.js';

/** 锚点集合（只读；手机号 → `{tree_id, person_handle, updated_at}`） */
export const ANCHORS_COL = 'jiapu_anchors';
/** 账号集合（只读；手机号 → `{phone, nickname, role, created_at}`） */
export const USERS_COL = 'jiapu_users';

/** 「主司」手机号优先级（逐字按单）：`operator` → `fee_ref.paid_by` → `paid_by` */
export const MASTER_PHONE_KEYS = ['operator', 'fee_ref.paid_by', 'paid_by'];

/** 主司职务名（**逐字**与 `lib/revision.js` 的 `HELPER_DUTY_MASTER` 同源；改一处必改另一处） */
export const MASTER_DUTY = '主司';

/**
 * 手机号打码：**仅** 11 位纯数字 ⇒ 前 3 + `****` + 后 4（如 `166****1656`）；其它形态 ⇒ `''`。
 * @param {string} phone
 * @returns {string}
 */
export function maskPhoneDigits(phone) {
  const s = String(phone == null ? '' : phone);
  return /^\d{11}$/.test(s) ? `${s.slice(0, 3)}****${s.slice(-4)}` : '';
}

/**
 * **姓名解析唯一函数**（四级降级，见文件头）。任何读失败 / 集合缺失 ⇒ 降级到下一级，**绝不抛**。
 * @param {string} phone 手机号（可为空）
 * @param {string} treeId 目标树（锚点必须归属该树才走 ①；空 ⇒ 跳过 ①）
 * @returns {Promise<string>} 解析出的显示名（可能为空串）
 */
export async function resolveDisplayName(phone, treeId) {
  const p = String(phone == null ? '' : phone).trim();
  if (!p) return '';
  const id = String(treeId == null ? '' : treeId).trim();

  // ① 锚点归属本树 ⇒ 取该树 people[person_handle].name
  //    （treeId 空时跳过：空 id 既无树可读，也不可能构成「归属本树」的判据）
  try {
    if (id) {
      const anchor = await colGet(ANCHORS_COL, p);
      const handle = String(anchor?.person_handle || '').trim();
      if (anchor && handle && String(anchor.tree_id || '').trim() === id) {
        const tree = await getTree(id);
        const name = String(tree?.people?.[handle]?.name || '').trim();
        if (name) return name; // 取到非空即返回
      }
    }
  } catch {
    /* 集合缺失 / 树读失败 ⇒ 降级到 ② */
  }

  // ② 账号昵称
  try {
    const u = await colGet(USERS_COL, p);
    const nickname = String(u?.nickname || '').trim();
    if (nickname) return nickname;
  } catch {
    /* 同上 ⇒ 降级到 ③ */
  }

  // ③ 11 位纯数字手机号 ⇒ 打码（非 11 位形态不打码 ⇒ 落到 ④）
  const masked = maskPhoneDigits(p);
  if (masked) return masked;

  // ④ 仍无 ⇒ 空串（由前端处理兜底文案）
  return '';
}

/**
 * 某一轮的「主司」手机号（优先级逐字按单，见 `MASTER_PHONE_KEYS`）。
 * 取到第一个非 `undefined` / `null` 且**非空**（trim 后）的值；三者皆无 ⇒ `''`。
 * @param {object} round 存储态的一轮修谱记录（`jiapu_revisions/<tree_id>.revisions[i]`）
 * @returns {string}
 */
export function masterPhoneOf(round) {
  const candidates = [round?.operator, round?.fee_ref?.paid_by, round?.paid_by];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return '';
}

/** tree-meta 的 `created_by` 原值（读失败 ⇒ 空串；**绝不抛**） */
async function treeCreatedBy(treeId) {
  try {
    const meta = await getMeta();
    const v = meta?.trees?.[String(treeId || '').trim()]?.created_by;
    return v === undefined || v === null ? '' : String(v);
  } catch {
    return '';
  }
}

/**
 * 某一轮「主司」显示名（**主司优先、操作者回退**；口径与优先级见文件头）。**绝不抛**。
 *
 * ① 主司优先：`round.helpers` 中 `duty === '主司'` 的族人 —— 取该树 `people[person_handle].name`；
 *    「取不到」的三种情形（无 duty='主司' / `person_handle` 空 / 节点已删或姓名为空）一律**继续**；
 * ② 回退：该轮无主司 ⇒ 走既有手机号路径（`masterPhoneOf` → `resolveDisplayName` 四级降级）。
 *
 * @param {object} round 存储态的一轮修谱记录（`jiapu_revisions/<tree_id>.revisions[i]`）
 * @param {string} treeId 目标树（主司姓名 = 该树 `people[person_handle].name`）
 * @returns {Promise<string>} 解析出的显示名（可能为空串）
 */
export async function masterNameOfRound(round, treeId) {
  const id = String(treeId == null ? '' : treeId).trim();

  // ① 主司优先（本轮 helpers 里 duty === '主司' 的族人名）
  try {
    const helpers = Array.isArray(round?.helpers) ? round.helpers : [];
    const master = helpers.find((h) => String(h?.duty || '').trim() === MASTER_DUTY);
    const handle = String(master?.person_handle || '').trim();
    if (handle) {
      const tree = await getTree(id);
      const name = String(tree?.people?.[handle]?.name || '').trim();
      if (name) return name; // 取到非空即返回（不再看操作者）
    }
  } catch {
    /* 树读失败 / 集合异常 ⇒ 回退到 ②（读路径绝不抛） */
  }

  // ② 回退：操作者手机号（operator ?? fee_ref.paid_by ?? paid_by）→ 四级降级解析
  const phone = masterPhoneOf(round);
  return phone ? resolveDisplayName(phone, id) : '';
}

/**
 * 组装 `GET /revisions` 顶层新增键 `postscript`。
 *
 * `masters` **与出参 `revisions[]` 同序同长**：入参 `revisions` 是**存储态原始档数组**
 * （= `loadRevisions(...).revisions`，读视图的 `revisions[]` 正由它按同一顺序逐条派生）
 * ⇒ 逐条 push、一条不落，长度恒等（即便某轮解析失败也只是 `name=''`，**不跳条**）。
 *
 * 每轮取名走 `masterNameOfRound`（**主司优先、操作者回退**，见其文档）。
 *
 * @param {string} treeId
 * @param {object[]} revisions 存储态原始档数组（含 `helpers` / `fee_ref` 等未 décoré 的键）
 * @returns {Promise<{created_by:string, created_by_name:string, masters:Array<{seq:number,name:string}>}>}
 */
export async function buildPostscript(treeId, revisions) {
  const id = String(treeId == null ? '' : treeId).trim();
  const rounds = Array.isArray(revisions) ? revisions : [];
  const created_by = await treeCreatedBy(id);
  let created_by_name = '';
  try {
    created_by_name = await resolveDisplayName(created_by, id);
  } catch {
    created_by_name = ''; // 双保险：resolveDisplayName 本就不抛，这里只为「读路径绝不 500」
  }
  const masters = [];
  for (const r of rounds) {
    let name = '';
    try {
      name = await masterNameOfRound(r, id);
    } catch {
      name = '';
    }
    masters.push({ seq: Number(r?.seq) || 0, name });
  }
  return { created_by, created_by_name, masters };
}
