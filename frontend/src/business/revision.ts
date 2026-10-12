/**
 * 修谱域 —— **纯前端单点**（无 uni / 无 DOM / 不引组件；只放**常量**、**类型**、**权限判据**与**文案单点**）
 *
 * 契约真源 = 已落库后端 `cloudfunctions/compat-api/lib/revision.js`（`getRevisionView` / `saveRevision` /
 * `startRevision` / `assertRevisionWritable` / `tierOfRevision`）与 `docs/revision.spec.md` §3-2 · §5-1 · §7-7。
 * 本文件字段名与出参形状**逐字对齐后端**，不得自行发明。
 *
 * 计费模型（Kevin 2026-10-12 拍定 · 常量写死、无后台入口）：
 *   · 开新一轮**恒 999** 片（`REVISION_FEE_START_BAMBOOS`）；
 *   · `days <= 30` ⇒ **编辑期**（`fee_tier='edit_window'`，`fee_next_bamboos=0`，期内**不限次数修改、不再扣费**）；
 *   · `30 < days < 360` ⇒ `locked`（`fee_next_bamboos=9999`）；
 *   · `days >= 360` ⇒ `long_locked`（`fee_next_bamboos=99999`）。
 *   · `days = ceil((now - effective_at) / 86400000)`（自然日向上取整）。
 *
 * 两套 kind 词汇**必须分开**（不得混用）：
 *   · **页面 kind（展示层）** = `'genealogy'|'cover'|'article'|'roster'|'donation'` —— **仅**
 *     `business/wenpu.ts` 内部 `WenpuPage.kind` 使用（`genealogy` 为缺省）。
 *   · **提交 kind（调 API 用）** = `'article'|'helpers'|'donations'|'cover'` —— `POST /admin/revision/save`
 *     的 `items[].kind` 恰为这四类。提交内容时**绝不能**把 `roster`/`donation` 当 kind 传。
 *
 * 修谱卷内容**存储即繁体**（前端**零字形转换**、**零回写**）；
 * 樂捐金額漢字大寫一律取**后端出参** `amount_text`（前端零转换）。
 */

/** 提交 kind（调 `POST /admin/revision/save` 用；**恰为四类**，不含页面 kind —— 见文件头「两套 kind」） */
export type RevisionSaveKind = 'article' | 'helpers' | 'donations' | 'cover';

/** 内容 kind（`article` / `helpers` / `donations` 三类；`cover` 单列） */
export type RevisionContentKind = 'article' | 'helpers' | 'donations';

/**
 * 计费档位（`fee_tier` · 逐字对齐后端 `FEE_TIER_*`）：
 *   · `edit_window`（`days <= 30`）⇒ 编辑期，`fee_next_bamboos = 0`；
 *   · `locked`（`30 < days < 360`）⇒ `fee_next_bamboos = 9999`；
 *   · `long_locked`（`days >= 360`）⇒ `fee_next_bamboos = 99999`。
 */
export type RevisionFeeTier = 'edit_window' | 'locked' | 'long_locked';

/**
 * 昭範正圖（卷首大图）。
 * 存储形状 = `{fileID, ext, width, height, updated_at}`（`lib/revision.js` `saveRevision` 的 cover 项）；
 * 出参另带 `url`（`getRevisionView` 用 `coverTempUrl()` 换临时链；换失败 ⇒ 空串，绝不 500）。
 */
export interface RevisionCover {
  fileID?: string;
  ext?: string;
  width?: number | null;
  height?: number | null;
  updated_at?: string;
  /** **出参专属**：可访问临时链（后端换；取不到 ⇒ 空串） */
  url?: string;
}

/** 族務紀文（标题 / 正文 / 落款 —— 存储形状另带 `updated_at`；三字段全须繁体、均由后端清洗标点） */
export interface RevisionArticle {
  title: string;
  body: string;
  signature: string;
  updated_at?: string;
}

/**
 * 譜司襄事一条。
 * 存储 / 提交形状 = `{person_handle, duty}`；**出参由后端补 `name`**（`decorateHelpers`）。
 */
export interface RevisionHelperEntry {
  person_handle: string;
  duty: string;
  /** **出参专属**：后端按 `person_handle` 反查本树姓名；解析不到 ⇒ 「（節點已刪除）」 */
  name?: string;
}

/**
 * 樂捐名錄一条。
 * 存储 / 提交形状 = `{person_handle, amount}`；**出参由后端补 `name` + `amount_text`**（`decorateDonations`）。
 */
export interface RevisionDonationEntry {
  person_handle: string;
  /** 金额（**正整数**，单位元；前端只做正整数校验，真值后端归一） */
  amount: number;
  /** **出参专属**：后端按 `person_handle` 反查本树姓名；解析不到 ⇒ 「（節點已刪除）」 */
  name?: string;
  /** **出参专属**：金额繁体汉字大写（后端 `amountToChineseUpper()`；前端零转换） */
  amount_text?: string;
}

/**
 * 历次修谱一轮（`GET /revisions` 出参 `revisions[]` 条目；逐字对齐 `getRevisionView().decorate()`）。
 * **作废概念已整体取消** ⇒ 无 `aborted` 字段。
 */
export interface RevisionRecord {
  seq: number;
  effective_at: string;
  /** 固化时刻（**读时惰性求得**；编辑期内 ⇒ `null`） */
  locked_at: string | null;
  /** 距该轮生效的自然日数（`ceil((now - effective_at) / 86400000)`） */
  days: number;
  /** 计费档位（`edit_window` / `locked` / `long_locked`） */
  fee_tier: RevisionFeeTier;
  /** 下一次保存的扣费额（片竹简；编辑期内 0） */
  fee_next_bamboos: number;
  cover: RevisionCover | null;
  article: RevisionArticle | null;
  helpers: RevisionHelperEntry[];
  donations: RevisionDonationEntry[];
}

/**
 * 当前一轮（`GET /revisions` 出参 `active`；无任何修谱记录 ⇒ `null`）。
 * **`editable` 恒 `true`**（锁定后本树家族管理员付费即可继续写、`chief_editor` 亦可）。
 */
export interface RevisionActive {
  seq: number;
  effective_at: string;
  /** 该轮固化时刻（= `effective_at + edit_days`） */
  lock_at: string;
  editable: boolean;
  days: number;
  fee_tier: RevisionFeeTier;
  fee_next_bamboos: number;
  cover: RevisionCover | null;
  article: RevisionArticle | null;
  helpers: RevisionHelperEntry[];
  donations: RevisionDonationEntry[];
}

/** 可否开始下一次修谱（`GET /revisions` 出参 `can_start`） */
export interface RevisionCanStart {
  ok: boolean;
  /** `'first'`（第 1 次无门槛）/ `'cooldown'`（冷却未到）/ `''`（可开始） */
  reason: string;
  /** 冷却未到时 = 最早可开始时刻（ISO）；其余为空串 */
  next_start_at: string;
}

/**
 * 修谱视图（`GET /revisions?tree_id=` 的视图对象；**逐字对齐**后端 `getRevisionView()` 冻结出参）。
 *
 * **旧键 `fee_bamboos` 已删除**；新增三费率常量与逐轮 `days` / `fee_tier` / `fee_next_bamboos`。
 * **历次全部并列**：`revisions` 按 `seq` 升序累加（第 1 次在前），**不分组、不折叠**。
 */
export interface RevisionView {
  ok?: boolean;
  tree_id?: string;
  now?: string;
  /** 编辑期天数（写死 30） */
  edit_days?: number;
  /** 开一轮费用（片竹简；恒 999 —— 真值以后端出参为准，缺省时展示 `REVISION_FEE_START_BAMBOOS`） */
  fee_start_bamboos?: number;
  /** 锁定后一次保存费（`30 < days < 360`；片竹简） */
  fee_locked_edit_bamboos?: number;
  /** 锁定后一次保存费（`days >= 360`；片竹简） */
  fee_locked_long_bamboos?: number;
  interval_years?: number[];
  /** 档内 `seq`（已分配的最大序号） */
  seq?: number;
  can_start?: RevisionCanStart;
  active: RevisionActive | null;
  revisions: RevisionRecord[];
}

/** 提交 `helpers` 内容时的 payload 一条（**裸数组**元素） */
export interface RevisionHelpersPayloadEntry {
  person_handle: string;
  duty: string;
}

/** 提交 `donations` 内容时的 payload 一条（**裸数组**元素） */
export interface RevisionDonationsPayloadEntry {
  person_handle: string;
  amount: number;
}

/** 提交 `article` 内容时的 payload 形状 */
export interface RevisionArticlePayload {
  title: string;
  body: string;
  signature: string;
}

/** 提交 `cover` 内容时的 payload 形状（`POST /admin/revision/save` 的 `cover` 项） */
export interface RevisionCoverPayload {
  ext: string;
  data_base64: string;
}

/** `POST /admin/revision/save` 的一个 `items` 元素 */
export interface RevisionSaveItem {
  kind: RevisionSaveKind;
  payload: unknown;
}

/** 开一轮费用（片竹简）—— **仅作展示兜底**；真值以后端出参为准 */
export const REVISION_FEE_START_BAMBOOS = 999;

/** 锁定后一次保存费（`30 < days < 360`；片竹简）—— **仅作展示兜底**；真值以后端出参为准 */
export const REVISION_FEE_LOCKED_EDIT_BAMBOOS = 9999;

/** 锁定后一次保存费（`days >= 360`；片竹简）—— **仅作展示兜底**；真值以后端出参为准 */
export const REVISION_FEE_LOCKED_LONG_BAMBOOS = 99999;

/** 编辑期天数（写死不可配；与后端 `REVISION_EDIT_DAYS` 同值） */
export const REVISION_EDIT_DAYS = 30;

/** 长期锁定的天数下界（`days >= 360` ⇒ `long_locked`；与后端 `REVISION_LONG_LOCKED_DAYS` 同值） */
export const REVISION_LONG_LOCKED_DAYS = 360;

/** 卷首图上限：2 MiB（超限 ⇒ 压缩退让；仍超限 ⇒ 提示「图片请小于 2 MB」并不上传） */
export const REVISION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** 卷首图允许的扩展名（jpg / png / webp） */
export const REVISION_IMAGE_EXT: string[] = ['jpg', 'png', 'webp'];

/**
 * 可管理修谱的角色（与后端口径同构）：**家族管理员**（= 本树 `tree_steward`）与
 * **总编辑**（`chief_editor`，全局）为真；其余一律为假（`guest` / `user` / `branch_curator`）。
 */
const REVISION_MANAGER_ROLES: string[] = ['tree_steward', 'chief_editor'];

/**
 * 修谱管理权限（纯前端单点判据）：`✎ 修谱` 按钮与修谱管理弹窗的**可见判据**。
 * 无 `treeId`（无谱可管）一律为假。
 */
export function canManageRevision(role: string, treeId: string): boolean {
  if (!treeId) return false;
  return REVISION_MANAGER_ROLES.includes(role || '');
}

/**
 * **单轮可写判据**（与后端 `assertRevisionWritable({role, treeId, phone})` 同构）：
 *   · `tree_steward`（本树家族管理员）⇒ **恒可写**（编辑期内免费；**锁定后付费即可继续写**）；
 *   · `chief_editor`（上级管理员）⇒ **恒可写**（任意树，**同样按次扣费**）；
 *   · 其余角色（`guest` / `user` / `branch_curator`）⇒ 一律不可写。
 *
 * ⚠️ **旧口径已推翻**（2026-10-12）：「固化后 `tree_steward` 只读」**不再成立** ⇒ 本判据
 * **不再看 `locked` / `isActive`**。参数 `opts` 保留只为调用点兼容，**不参与判定**。
 * 树归属（`tree_steward` 仅限本树）由后端按锚点树校验，前端无法判定 ⇒ 前端不做该层拦截。
 */
export function canEditRevision(
  role: string,
  _opts: { locked?: boolean; isActive?: boolean } = {},
): boolean {
  return REVISION_MANAGER_ROLES.includes(role || '');
}

/**
 * 档位文案单点（`fee_tier` → 中文标签）：
 * `edit_window` ⇒ 「編輯期」、`locked` ⇒ 「已鎖定」、`long_locked` ⇒ 「長期鎖定」；未知 ⇒ 空串。
 */
export function feeTierText(tier: string): string {
  if (tier === 'edit_window') return '編輯期';
  if (tier === 'locked') return '已鎖定';
  if (tier === 'long_locked') return '長期鎖定';
  return '';
}

/**
 * 锁定后保存的**二次确认文案单点**（含本次扣费额与档位）：
 * 例 `locked` ⇒ 「本次為鎖定後修改（已鎖定），將扣 9999 片竹簡，確定？」；
 *   `long_locked` ⇒ 「本次為鎖定後修改（長期鎖定），將扣 99999 片竹簡，確定？」。
 * **编辑期内不弹**该确认（`fee_next_bamboos === 0`），由调用方先行判定。
 */
export function revisionSaveConfirmText(feeNextBamboos: number, tier: string): string {
  const n = Number(feeNextBamboos);
  const amount = Number.isFinite(n) && n > 0 ? n : 0;
  const label = feeTierText(tier) || '已鎖定';
  return `本次為鎖定後修改（${label}），將扣 ${amount} 片竹簡，確定？`;
}

/** 面板保存草稿（**本次变更的项**；供 `buildRevisionSaveItems` 归集为 `items`） */
export interface RevisionSaveDraft {
  /** 族務紀文（标题 / 正文 / 落款）是否有改动 */
  articleDirty?: boolean;
  article?: RevisionArticlePayload;
  /** 譜司襄事行是否有改动（增删 / 职务 / 点选） */
  helpersDirty?: boolean;
  /** 譜司襄事**全量替换**载荷（裸数组） */
  helpers?: RevisionHelpersPayloadEntry[];
  /** 樂捐名錄行是否有改动 */
  donationsDirty?: boolean;
  /** 樂捐名錄**全量替换**载荷（裸数组） */
  donations?: RevisionDonationsPayloadEntry[];
  /** 新选中的卷首图（base64；未选 ⇒ `undefined`/`null`）—— 与其它项**同一次提交** */
  cover?: RevisionCoverPayload | null;
}

/**
 * **把本次变更的项收集为 `items`**（纯函数 · 无副作用；面板与离线自证共用）。
 *
 * 提交顺序 = `cover → article → helpers → donations`（**一次点击保存 = 一次调用**）：
 *   · `cover` 项仅在**新选中图片**（`data_base64` 非空）时出现；
 *   · 其余三类仅在对应 `*Dirty` 为真时出现（`helpers` / `donations` 为**裸数组**、全量替换）；
 *   · 全部为空 ⇒ 返回 `[]`（调用方据此提示「未做修改」且**不发请求**）。
 */
export function buildRevisionSaveItems(draft: RevisionSaveDraft): RevisionSaveItem[] {
  const d = draft || {};
  const items: RevisionSaveItem[] = [];
  if (d.cover && d.cover.data_base64) {
    items.push({ kind: 'cover', payload: { ext: d.cover.ext, data_base64: d.cover.data_base64 } });
  }
  if (d.articleDirty) {
    items.push({
      kind: 'article',
      payload: {
        title: d.article?.title || '',
        body: d.article?.body || '',
        signature: d.article?.signature || '',
      },
    });
  }
  if (d.helpersDirty) {
    items.push({
      kind: 'helpers',
      payload: (d.helpers || []).map((h) => ({ person_handle: h.person_handle, duty: h.duty })),
    });
  }
  if (d.donationsDirty) {
    items.push({
      kind: 'donations',
      payload: (d.donations || []).map((x) => ({ person_handle: x.person_handle, amount: x.amount })),
    });
  }
  return items;
}
