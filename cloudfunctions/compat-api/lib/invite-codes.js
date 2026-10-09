/**
 * 邀请码链路内核（jiapu_invite_codes）— **批 C-1**（Kevin 2026-09-30 逐条拍定）
 *
 * 与既有 `lib/invite.js`（邀请码 = 邀请人手机号 · 裁定 v3 · I-1…I-9）**并存不冲突**：
 *   · `invite.js`   = 「谁邀请了谁」的**基础关系**（集合 `jiapu_invites`，每被邀请人一文档）；
 *   · 本模块        = 「一条可撤回的**链接凭证**」的**签发 / 解析 / 放行 / 绑定 / 加成**
 *                    （集合 `jiapu_invite_codes`，一码一文档）。
 *   接受邀请时**优先沿用 `invite.applyInvite` 语义**记录基础关系与基础发奖（不得另造一套）。
 *
 * 口径（逐条实现，每条一句话可改）：
 *   C1-1 **两类码**：`kind='node'`（含建议节点）= **一次性**（用后失效，不可一码多人）；
 *        `kind='plain'`（不含节点）= **多次可用**。两者 TTL **30 天**、邀请人可**撤销**。
 *   C1-2 **码形**：6 位、字符集 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`（无 `0/O/1/I/L`，防念错拄错）；
 *        签发时碰撞重试 ≤ `INVITE_CODE_MAX_ATTEMPTS`。
 *   C1-3 **明文节点参数不具绑定效力（防伪造）**：绑定只认服务端签发的 `c` 码；
 *        链接里的 `tree_id` / `person_handle` 仅供显示与前端兜底。
 *   C1-4 **落地页可见性 = 整树正常可见**（Kevin 裁定）：持有效码即该树全量只读取数凭证
 *        （服务端按码放行、不做节点级裁剪）；**无码 / 无效 / 异树 ⇒ 逐字回落既有裁剪**。
 *        放行只对两条列表读路由（`GET /people`、`GET /families`）生效 —— **定点例外**。
 *   C1-5 **接受邀请 = 直接绑定**（免审批，邀请人背书）+ 锚点登记 `via_invite_code`（审计用）。
 *        ⇒ **取代** `docs/permission-tier.spec.md` §9「自助认领已取消」的适用范围（登记归 Jing）。
 *   C1-6 **消耗规则**：`accept` / `replace` 且 `kind='node'` ⇒ 消耗（`used_count=1` / `used_by` / `used_at`）；
 *        `skip` **不消耗**（别人仍可用）；`plain` 型**永不消耗**。
 *   C1-7 **幂等**：同一用户 + 同一 code 重复 bind ⇒ **400 `您已处理过该邀请`**（先于状态判定）。
 *   C1-8 **加成奖励（仅 accept / replace 真绑定）**：数值为**单点常量**（档乙，见下）；走**既有账本**
 *        （`withAssets` + `recordTx`，**不新增 `Tx.type`**，仍用既有 `reward`）；邀人侧**沿用既有日限 3 次**
 *        （与 `invite.js` 共用同一计数器：`ref.kind='invite'` 的当日 `reward` 条数）；绑定加成**每人只发一次**。
 *
 * 奖励数值（**Kevin 未定档 · Zang 取建议档乙 · 一句话可改**）：
 *   邀请人 `+1` 兰帖残页 `+10` 竹片；被邀请人 `+30` 石榴籽碎片。
 *
 * 写入路径：资产一律经 `withAssets`（唯一写路径，docs/economy.spec.md §5-7）；
 *           锚点一律经 `lib/scope.js` 的 `setAnchor`（唯一写路径）；
 *           码文档只经本模块 `colSet`，无其它写入口。
 */
import { randomInt } from 'node:crypto';
import { colGet, colSet, getTree, getMeta } from './store.js';
import {
  withAssets,
  getAssets,
  addFragments,
  addLot,
  addScrollFragments,
  recordTx,
} from './economy-ledger.js';
import {
  USERS_COL,
  maskPhone,
  countInviteRewardsToday,
  INVITE_DAILY_LIMIT,
  INVITE_TX_TYPE,
  INVITE_TX_REF_KIND,
  applyInvite,
} from './invite.js';
import { assertAnchorBindable, setAnchor, isPersonHandleTaken } from './scope.js';

// ---- 集合与常量 ----

export const INVITE_CODES_COL = 'jiapu_invite_codes';
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const INVITE_CODE_LEN = 6;
export const INVITE_CODE_TTL_DAYS = 30;
export const INVITE_CODE_MAX_ATTEMPTS = 5;
export const INVITE_KINDS = ['node', 'plain'];

/** 码形闸门（resolve / bind 的入参归一都走它 —— 单一真源） */
export const INVITE_CODE_RE = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LEN}}$`);

/** 加成奖励（Kevin 未定档 · Zang 取建议档乙 · 一句话可改） */
export const INVITE_BIND_REWARD_INVITER_SCROLL_FRAGMENTS = 1;
export const INVITE_BIND_REWARD_INVITER_BAMBOO_PIECES = 10;
export const INVITE_BIND_REWARD_INVITEE_FRAGMENTS = 30;
/** 绑定加成的流水归因：被邀请人侧流水 `ref.kind`（**不是 `Tx.type`**，`Tx.type` 仍是既有 `reward`） */
export const INVITE_BIND_TX_REF = 'invite_bind';
/** 邀请人侧加成流水 `ref.source`（`ref.kind` 仍 = `invite` ⇒ 与既有日限同一计数器） */
export const INVITE_BIND_TX_SOURCE = 'invite_bind';

export const DECISIONS = ['accept', 'replace', 'skip'];

/** 幂等文案（逐字；契约固定） */
export const MSG_ALREADY_HANDLED = '您已处理过该邀请';

// ---- 纯工具 ----

/** 归一：去空格 + 大写（码表本身全大写，前端小写输入也认） */
export function normalizeInviteCode(raw) {
  return String(raw ?? '').trim().toUpperCase();
}

/** 码形是否合法（6 位 · 无 0/O/1/I/L） */
export function inviteCodeShapeOk(code) {
  return INVITE_CODE_RE.test(normalizeInviteCode(code));
}

/** 随机签发一枚码（纯函数；可注入 rand 便于测试） */
export function randomInviteCode(rand = (n) => randomInt(0, n)) {
  let out = '';
  for (let i = 0; i < INVITE_CODE_LEN; i += 1) out += INVITE_CODE_ALPHABET[rand(INVITE_CODE_ALPHABET.length)];
  return out;
}

/** ISO 时刻 n 天后 */
export function isoPlusDays(now, days) {
  return new Date(new Date(now).getTime() + days * 86400000).toISOString();
}

/**
 * 码状态（**纯函数**，读侧单一判据）：`not_found | revoked | expired | used | valid`。
 * `used` = `kind='node'` 且 `used_count >= max_uses`（`plain` 型 `max_uses=null` ⇒ 永不 used）。
 */
export function inviteCodeState(doc, now = new Date()) {
  if (!doc) return 'not_found';
  if (doc.revoked_at) return 'revoked';
  if (doc.expires_at && Date.parse(doc.expires_at) <= new Date(now).getTime()) return 'expired';
  const max = doc.max_uses;
  if (max !== null && max !== undefined && Number(doc.used_count || 0) >= Number(max)) return 'used';
  return 'valid';
}

/** 可用性（= 状态为 valid） */
export function inviteCodeUsable(doc, now = new Date()) {
  return inviteCodeState(doc, now) === 'valid';
}

// ---- 读 / 写 ----

/** 读一枚码（不存在 → null） */
export async function getInviteCode(raw) {
  const code = normalizeInviteCode(raw);
  if (!code) return null;
  return colGet(INVITE_CODES_COL, code);
}

/**
 * 签发（唯一写入口）：碰撞重试 ≤ `INVITE_CODE_MAX_ATTEMPTS`；全撞 → 抛 500。
 * `kind='node'` ⇒ `max_uses=1`；`kind='plain'` ⇒ `max_uses=null`（不限）。
 */
export async function issueInviteCode({ inviterPhone, kind, treeId = null, personHandle = null, now = new Date() } = {}) {
  const inviter = String(inviterPhone || '').trim();
  if (!INVITE_KINDS.includes(kind)) throw Object.assign(new Error('参数错误：kind ∈ node/plain'), { status: 400 });
  if (!inviter) throw Object.assign(new Error('参数错误：签发人缺失'), { status: 400 });
  const isNode = kind === 'node';
  const doc = {
    kind,
    inviter_phone: inviter,
    tree_id: isNode ? String(treeId || '') : null,
    person_handle: isNode ? String(personHandle || '') : null,
    created_at: new Date(now).toISOString(),
    expires_at: isoPlusDays(now, INVITE_CODE_TTL_DAYS),
    max_uses: isNode ? 1 : null,
    used_count: 0,
    used_by: [],
    revoked_at: null,
  };
  for (let i = 0; i < INVITE_CODE_MAX_ATTEMPTS; i += 1) {
    const code = randomInviteCode();
    if (await colGet(INVITE_CODES_COL, code)) continue; // 碰撞 → 重试
    await colSet(INVITE_CODES_COL, code, doc);
    return { ...doc, _id: code, code };
  }
  throw Object.assign(new Error('邀请码生成失败（碰撞重试超限），请重试'), { status: 500 });
}

/** 邀请人展示名：昵称缺失 → 脱敏手机号兜底（照 `economy-spirit` injector 口径，**绝不下发手机号**） */
export async function inviterDisplayName(phone) {
  const account = await colGet(USERS_COL, String(phone || '').trim());
  return String(account?.nickname || '').trim() || maskPhone(phone);
}

/** 树展示名 / 堂号（tree-meta 条目；树无条目 → `tree_name = treeId`、`hall_name = null`） */
async function treeLabels(treeId) {
  const meta = await getMeta();
  const entry = Object.values(meta?.trees || {}).find((t) => t && t.tree_id === treeId) || null;
  return {
    tree_name: String(entry?.display_title || entry?.genealogy_name || '').trim() || treeId,
    hall_name: String(entry?.hall_name || '').trim() || null,
  };
}

/**
 * `GET /invite/code/resolve?c=<code>` 出参（**免登录**）。
 * 五态：`valid` / `expired` / `revoked` / `used` / `not_found`（后四态 `valid:false` + `reason`）。
 * **不下发任何手机号**：昵称缺失时给脱敏串（`economy-spirit` injector 同口径）。
 * `can_bind` = 码有效 **且** `kind='node'` **且** 建议节点仍存在且**未被任何人绑定**（可直接 `accept`）。
 */
export async function resolveInviteCodeInfo(raw, now = new Date()) {
  const code = normalizeInviteCode(raw);
  const doc = code ? await getInviteCode(code) : null;
  const state = inviteCodeState(doc, now);
  const out = {
    valid: state === 'valid',
    kind: doc?.kind || null,
    inviter_nickname: null,
    tree_id: doc?.tree_id || null,
    tree_name: null,
    hall_name: null,
    person_handle: doc?.person_handle || null,
    person_name: null,
    person_gender: null,
    can_bind: false,
  };
  if (state !== 'valid') return { ...out, reason: state };
  out.inviter_nickname = await inviterDisplayName(doc.inviter_phone);
  if (doc.kind !== 'node' || !doc.tree_id || !doc.person_handle) return out; // plain 型：无节点信息，can_bind=false
  const labels = await treeLabels(doc.tree_id);
  out.tree_name = labels.tree_name;
  out.hall_name = labels.hall_name;
  const tree = await getTree(doc.tree_id);
  const person = tree?.people?.[doc.person_handle] || null;
  if (person) {
    out.person_name = person.name || `${person.surname || ''}${person.given || ''}` || doc.person_handle;
    out.person_gender = person.gender || null;
  }
  // 建议节点是否已被绑定（唯一键 = `person_handle` **全站唯一**，不按树分 ⇒ 只看 handle）
  // 读取走 `lib/scope.js` 单点（本模块**不得**自扫锚点全表，见 ⑬ 判据）
  out.can_bind = !!person && !(await isPersonHandleTaken(doc.person_handle));
  return out;
}

/**
 * C1-4 读放行判据：**当且仅当** 码有效 **且** `code.tree_id === treeId` ⇒ 该次列表请求不做节点级裁剪。
 * 无码 / 无效 / 异树 ⇒ `false`（调用方**逐字回落**既有裁剪）。
 */
export async function inviteCodeGrantsTree(raw, treeId, now = new Date()) {
  const code = normalizeInviteCode(raw);
  if (!code || !treeId) return false;
  const doc = await getInviteCode(code);
  if (!inviteCodeUsable(doc, now)) return false;
  return !!doc.tree_id && String(doc.tree_id) === String(treeId);
}

// ---- 加成奖励（C1-8）----

/**
 * 绑定加成（**仅 accept / replace 真绑定**时调用；调用方已完成锚点落盘与码消耗）。
 *
 * 三条硬口径：
 *   · 被邀请人 `+30` 石榴籽碎片：**幂等** —— 该被邀请人账上已有任意一条 `ref.kind='invite_bind'`
 *     的 `reward` 流水 ⇒ 整笔跳过（同一被邀请人**只发一次**，跨码也不重发）。
 *   · 邀请人 `+1` 兰帖残页 `+10` 竹片：**沿用既有日限 3 次**（与 `invite.js` 同一计数器）；
 *     邀请人 = 被邀请人（自己扫自己的码）⇒ **不发**（不自奖）。
 *   · 一律走既有账本（`withAssets` + `recordTx`），`Tx.type` 仍是既有 `reward`，**不新增枚举**。
 *
 * @returns {Promise<{inviter:object, invitee:object}>} 逐方读数（供路由回显，**不含手机号**）
 */
export async function grantInviteBindRewards(doc, inviteePhone, now = new Date()) {
  const invitee = String(inviteePhone || '').trim();
  const inviter = String(doc?.inviter_phone || '').trim();
  const out = {
    invitee: { fragments: INVITE_BIND_REWARD_INVITEE_FRAGMENTS, granted: false, reason: '' },
    inviter: {
      scroll_fragments: INVITE_BIND_REWARD_INVITER_SCROLL_FRAGMENTS,
      bamboo_pieces: INVITE_BIND_REWARD_INVITER_BAMBOO_PIECES,
      granted: false,
      reason: '',
    },
  };
  // 幂等闸门：被邀请人**只发一次**（跨码也算）
  const inviteeSnap = await getAssets(invitee);
  const already = (inviteeSnap.txs || []).some((t) => t && t.ref && t.ref.kind === INVITE_BIND_TX_REF);
  if (already) {
    out.invitee.reason = 'already_rewarded';
    out.inviter.reason = 'already_rewarded';
    return out;
  }
  // ① 被邀请人 +30 石榴籽碎片
  await withAssets(invitee, (user) => {
    // 锁内复检（同一手机号串行化 → 并发窗口内不双发）
    if ((user.txs || []).some((t) => t && t.ref && t.ref.kind === INVITE_BIND_TX_REF)) {
      out.invitee.reason = 'already_rewarded';
      return;
    }
    addFragments(user, INVITE_BIND_REWARD_INVITEE_FRAGMENTS, now);
    recordTx(
      user,
      {
        type: INVITE_TX_TYPE,
        delta: { fragments: INVITE_BIND_REWARD_INVITEE_FRAGMENTS },
        ref: { kind: INVITE_BIND_TX_REF, code: String(doc?._id || ''), inviter: maskPhone(inviter) },
        desc: `邀请绑定奖励：绑定成功 +${INVITE_BIND_REWARD_INVITEE_FRAGMENTS} 石榴籽碎片`,
        operator: invitee,
      },
      now,
    );
    out.invitee.granted = true;
    out.invitee.reason = 'granted';
  });
  // ② 邀请人加成（日限 3 次 · 不自奖）
  if (!inviter || inviter === invitee) {
    out.inviter.reason = inviter ? 'self_invite' : 'no_inviter';
    return out;
  }
  const inviterSnap = await getAssets(inviter);
  if (countInviteRewardsToday(inviterSnap, now) >= INVITE_DAILY_LIMIT) {
    out.inviter.reason = 'daily_limit';
    return out;
  }
  await withAssets(inviter, (user) => {
    // 防御性复检（同一手机号串行队列内再判一次，与 invite.js 同款）
    if (countInviteRewardsToday(user, now) >= INVITE_DAILY_LIMIT) {
      out.inviter.reason = 'daily_limit';
      return;
    }
    addScrollFragments(user, INVITE_BIND_REWARD_INVITER_SCROLL_FRAGMENTS, now);
    addLot(user, 'bamboo', INVITE_BIND_REWARD_INVITER_BAMBOO_PIECES, { source: INVITE_BIND_TX_SOURCE, now });
    recordTx(
      user,
      {
        type: INVITE_TX_TYPE,
        delta: {
          scroll_fragments: INVITE_BIND_REWARD_INVITER_SCROLL_FRAGMENTS,
          bamboos: INVITE_BIND_REWARD_INVITER_BAMBOO_PIECES,
        },
        // ref.kind 仍是 `invite` ⇒ 与既有日限**同一计数器**（沿用 3 次/日）
        ref: {
          kind: INVITE_TX_REF_KIND,
          source: INVITE_BIND_TX_SOURCE,
          invitee: maskPhone(invitee),
          code: String(doc?._id || ''),
        },
        desc: `邀请绑定加成：${maskPhone(invitee)} 通过您的邀请码绑定成功`,
        operator: inviter,
      },
      now,
    );
    out.inviter.granted = true;
    out.inviter.reason = 'granted';
  });
  return out;
}

// ---- 绑定编排（`POST /invite/bind` 的唯一内核）----

/** 路由层直接 `send(status, body)`；形状沿用既有 lib 约定（错误体 `{ error }`） */
const fail = (status, error) => ({ ok: false, status, body: { error } });

/**
 * `POST /invite/bind`（需登录）三选：`accept` / `replace` / `skip`。
 *
 * 顺序（逐条；顺序本身是契约的一部分）：
 *   ① 码存在 ② **幂等闸门**（同用户+同码 ⇒ 400 `您已处理过该邀请`，**先于**状态判定）
 *   ③ 状态（revoked / expired / used ⇒ 400）④ 决策入参（`accept` 仅 `node` 型；`replace` 必给节点）
 *   ⑤ 绑定前置校验（节点存在 404 + 全站唯一 409，本路由**不适用 force**）→ `setAnchor(..., {via_invite_code})`
 *   ⑥ 基础关系（沿用 `invite.applyInvite` 语义：三态**都记**，奖励与绑定解耦）
 *   ⑦ 码消耗（`accept`/`replace` 且 `node` 型；`skip` 不消耗）＋ `bound_by` 处理标记
 *   ⑧ 加成奖励（仅真绑定）
 *
 * @returns {Promise<{ok:true, status:number, body:object}|{ok:false, status:number, body:{error:string}}>}
 */
export async function bindInviteCode(opts = {}) {
  const now = opts.now || new Date();
  const me = String(opts.phone || '').trim();
  const decision = String(opts.decision || '').trim();
  const code = normalizeInviteCode(opts.c);
  if (!me) return fail(401, '未登录或登录已过期');
  if (!code) return fail(400, '参数错误：c 必填');
  if (!DECISIONS.includes(decision)) return fail(400, '参数错误：decision ∈ accept/replace/skip');
  const doc = await getInviteCode(code);
  if (!doc) return fail(400, '邀请码不存在');
  // ② 幂等闸门（**必须早于状态判定**：node 型成功绑定后码即 used，重放应得「已处理过」而非「已使用」）
  const boundBy = Array.isArray(doc.bound_by) ? doc.bound_by : [];
  if (boundBy.includes(me)) return fail(400, MSG_ALREADY_HANDLED);
  // ③ 码状态
  const state = inviteCodeState(doc, now);
  if (state === 'revoked') return fail(400, '邀请码已被撤销');
  if (state === 'expired') return fail(400, '邀请码已过期');
  if (state === 'used') return fail(400, '邀请码已使用');
  // ④ 决策 → 目标锚点
  let finalTree = null;
  let finalHandle = null;
  if (decision === 'accept') {
    if (doc.kind !== 'node') return fail(400, '该邀请码不含建议节点，请选择节点或暂不绑定');
    finalTree = String(doc.tree_id || '');
    finalHandle = String(doc.person_handle || '');
  } else if (decision === 'replace') {
    finalTree = String(opts.treeId || '').trim();
    finalHandle = String(opts.personHandle || '').trim();
    if (!finalTree || !finalHandle) return fail(400, '参数错误：更换节点需提供 tree_id + person_handle');
  }
  // ⑤ 绑定前置校验（存在性 404 + 全站唯一 409；**本路由不适用 force** ⇒ 传参里不出现 force）
  if (finalHandle) {
    try {
      await assertAnchorBindable(finalHandle, me, { treeId: finalTree, role: opts.role });
    } catch (e) {
      return fail(e.status || 400, e.message);
    }
    await setAnchor(me, finalTree, finalHandle, { via_invite_code: code });
  }
  // ⑥ 基础关系（三态都记；沿用既有 applyInvite 语义：校验 + 基础发奖 + jiapu_invites 落档）
  let invite_record = null;
  try {
    invite_record = await applyInvite(me, doc.inviter_phone, { now });
  } catch (e) {
    invite_record = { ok: false, reason: 'apply_invite_error', error: String((e && e.message) || e) };
  }
  // ⑦ 消耗 + 处理标记（同一文档一次写入）
  const next = { ...doc };
  next.bound_by = [...boundBy, me];
  if ((decision === 'accept' || decision === 'replace') && doc.kind === 'node') {
    next.used_count = 1;
    next.used_by = [...(Array.isArray(doc.used_by) ? doc.used_by : []), me];
    next.used_at = new Date(now).toISOString();
  }
  await colSet(INVITE_CODES_COL, doc._id, next);
  // ⑧ 加成奖励（仅 accept / replace 真绑定）
  const rewards = finalHandle ? await grantInviteBindRewards(doc, me, now) : null;
  const body = {
    ok: true,
    bound: !!finalHandle,
    anchor: finalHandle ? { tree_id: finalTree, person_handle: finalHandle } : null,
  };
  if (rewards) body.rewards = rewards;
  return { ok: true, status: 200, body };
}
