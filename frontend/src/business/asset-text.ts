/**
 * 资产展示文案单点（耐久行 / 日期格式化 / 量词与换算 / 签到与任务文案）。
 *
 * 落点：**资产页（`pages/assets/index.vue`）** 与
 * **道具栏（`components/asset-inventory/` 的属性提示层）** 共用本模块 ——
 * 新增页面一律引用本模块，禁止再复制一套（同 `business/jade-ops.ts` 的「前端唯一副本」约定）。
 *
 * ⚠️ **2026-09-29 删改（Kevin 逐条清单，行囊属性提示层）**：提示层不再出现
 * 「最近到期 YYYY-MM-DD / 有效期至 YYYY-MM-DD / 永久有效」三种旧形态，一律改为
 * `durabilityLine()`（`耐久：N 天`；无到期 / 永久 ⇒ `耐久：9999 天`）。
 * 随本次删改**已成死代码并删除**的旧单点（原消费点只有 `business/inventory.ts`）：
 * `jadeTitle` / `jadeSubLine` / `shortAssetId`（资产页自有 `jadeSub` 现算，不依赖本模块）、
 * `SCROLL_STATUS_PERMANENT`（`永久有效`）/ `scrollDecomposeHintLine` / `scrollCaliberLine` /
 * `scrollFragmentSynthLine` / `scrollRemainderReasonLine`（后者改由 `scrollShortReasonLine` 承担）。
 *
 * 已知例外（**2026-09-30 全前端扫尾后的现状**；本模块只认自身口径，非耐久行语义不在此追平）：
 * ⚠️ **2026-09-29 实测订正（历史记录，勿再据旧行号引用）**：原文曾称 `pages/spirit/index.vue`「仍自带
 * 第三份手写副本（第 175 行「未镶嵌 · 可免费分解」、第 586 / 658 行的「有效期至 / 永久有效」拼装）」
 * ——**行号与首串均不实**：`grep '未镶嵌 · 可免费分解' frontend/src` = **0 命中**，该串仅存于行囊侧注释
 * （`business/inventory.ts` L25 / L309），页面内无渲染。
 * ✅ **spirit 页已统一（2026-09-30 收敛，不再是本模块的例外）**：`jadeLabel()` 现为
 * `` `${shortId(j.id)} · ${durabilityLine(j.expires_at)}` ``（不再手写「有效期至 / 永久有效」）；
 * 同页镶嵌区静态文案改为 `耐久：9999 天（镶嵌即永久占用）`（走 `durabilityLine()` 无参 = 永久口径，
 * 括注逐字保留）。同批 `pages/assets/index.vue` 的籽批次行（`N 个批次 · 耐久：N 天`）与
 * 石榴籽玉行（`永久 N 枚 · 耐久：N 天`）亦改调本函数（旧「最近到期 YYYY-MM-DD」已删）。
 * 仍在的旧形态（**各有独立语义 / 规格，未纳入耐久行口径，待后续批次裁决**）：
 * `components/asset-inventory/asset-inventory.vue` 的合成回执 toast（`永久有效` / `有效期至 …`）、
 * `business/jade-ops.ts` 的合成规则说明句、`business/friends.ts` 的兰帖关系域到期行（含缓冲期语义）。
 *
 * 日期口径：`formatAssetDate` 空值 → `—`、非法值原样返回。
 *
 * 兰帖域（`docs/economy.spec.md` §15）追加单点：
 * - 兰帖 / 兰帖残页的**展示名** / **量词** / **张数展示值**（`SCROLL_NAME` / `SCROLL_FRAGMENT_NAME` /
 *   `SCROLL_ITEM_UNIT` / `SCROLL_PIECES_UNIT` / `scrollZhangQty()`）**只在本模块定义** ——
 *   `business/inventory.ts` 的 `KIND_NAME` / `KIND_CONVERT` 与组件一律引用本模块，
 *   不在组件里散落中文字面；
 * - 兰帖**永久有效**（`ScrollLot.expires_at` 恒 `null`）⇒ 行囊耐久行恒为 `耐久：9999 天`
 *   （`durabilityLine(null)`），不提供任何「有效期至 / 最近到期」拼装
 *   （口径：兰帖不得排入到期排序）。
 *
 * 量词单点（2026-09-26 扩充）：**资产不足（`ASSET_INSUFFICIENT`）明细行的量词**也只在本模块定义 ——
 * - 后端 `unit` 键 → 中文量词 = `SHORTAGE_UNIT_BY_KEY`；拼装行 = `shortageLine()`；
 * - 「颗」/「枚」的唯一字面 = `SEED_QTY_UNIT` / `JADE_QTY_UNIT`（新增）；片类复用既有
 *   `SEED_FRAGMENT_UNIT` / `BAMBOO_PIECES_UNIT` / `SCROLL_PIECES_UNIT`；
 * - `person-manage-panel.vue` 只传后端 `unit` 键，**组件内不得自带量词字面**（未知 / 缺失键 → 只出数字）。
 */

/** `YYYY-MM-DD`（本地时区）；空值 → `—`，非法值原样返回 */
export function formatAssetDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 永久（无到期）资产展示的耐久天数（**唯一字面**）= `9999`。
 * Kevin 2026-09-29 逐字给定：永久 / 无到期的道具行一律为 `耐久：9999 天`。
 */
export const DURABILITY_PERMANENT_DAYS = 9999;

/**
 * 耐久行（**唯一拼装点**；行囊属性提示层六类道具格共用）—— 逐字体例 `耐久：N 天`
 * （**中文冒号「：」+「天」前一个空格**，一字不改，体例 = `耐久：362 天`）：
 * - `expiresAt` 有值且可解析 ⇒ `耐久：${Math.max(0, Math.ceil((到期时刻 − 现在) / 86400000))} 天`
 *   （**实际剩余天数**；已过期 ⇒ `0 天`，**绝不出现负数**）；
 * - 无值 / 空串 / `null`（永久批次，如兰帖 `ScrollLot.expires_at` 恒 `null`）⇒
 *   `耐久：${DURABILITY_PERMANENT_DAYS} 天`；
 * - 非法值（`Date` 解析失败）⇒ `耐久：0 天`（**绝不出现 `NaN`**）。
 *
 * 本行取代本批之前的「最近到期 YYYY-MM-DD」/「有效期至 YYYY-MM-DD」/「永久有效」三种旧形态
 * （Kevin 2026-09-29 清单）。天数按**本地时区毫秒差**取整（`ceil` ⇒ 不足一天也计 1 天）。
 */
export function durabilityLine(expiresAt?: string | null): string {
  if (expiresAt === undefined || expiresAt === null || expiresAt === '') {
    return `耐久：${DURABILITY_PERMANENT_DAYS} 天`;
  }
  const ts = new Date(expiresAt).getTime();
  if (Number.isNaN(ts)) return '耐久：0 天';
  return `耐久：${Math.max(0, Math.ceil((ts - Date.now()) / 86400000))} 天`;
}

/** 兰帖：展示名（逐字；单点 —— 组件 / 行囊逻辑不得另写一遍） */
export const SCROLL_NAME = '兰帖';

/**
 * 兰帖残页：展示名（逐字；单点）。
 * **2026-09-25 更名**：显示名「兰帖碎片」→「兰帖残页」（Kevin 当面给定）；字段名 `scroll_fragments`
 * 与接口入出参**一字未动**，本常量仍是页面 / 组件可见文案的唯一来源。
 */
export const SCROLL_FRAGMENT_NAME = '兰帖残页';

/**
 * 兰帖**锁定态**文案（逐字；单点）—— 续约申请等待对方确认期间，发起方自持的那张兰帖
 * 已被关系域的 `pending.locked_*` 占用（只占用、不扣除），行囊内该兰帖格须显示本行。
 * 判据由 `business/friends.ts` 从 `GET /friends` 的 `pending` 推导（不新增后端字段）。
 */
export const SCROLL_LOCK_TEXT = '续约待确认 · 锁定中';

/**
 * 兰帖【分解】相关文案（**单点**）—— 口径真源 = `docs/friend-domain.spec.md` §17-7 / §17-8（R-7）：
 * **1 张成品兰帖 = 100 片，分解返还 99 片**（每张留 1 片损耗；历史上「返 100 会在返还瞬间触发
 * 「满 100 自动合成」⇒ 分解成为空操作」的理由，在 2026-09-26 取消自动合成后已不成立，
 * 但 **99 片返还的取值一字未改**）。数值由调用方传入（`inventory.ts` 的常量），**本模块不复制比例常量**
 * （避免两模块互相 import 成环）。
 */

/** 兰帖分解确认标题（自绘确认层用） */
export const SCROLL_DECOMPOSE_TITLE = '⚠️ 分解兰帖确认';

/**
 * 兰帖分解确认正文（逐行渲染，不合并、不改标点）：
 * `count` 张、每张 `piecesPerItem` 片、每张留 `perLoss = piecesPerItem − refundPerItem` 片损耗。
 */
export function scrollDecomposeConfirmLines(
  count: number,
  piecesPerItem: number,
  refundPerItem: number,
): string[] {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const perLoss = Math.max(0, piecesPerItem - refundPerItem);
  const pieces = n * piecesPerItem;
  return [
    `本次将分解 ${n} 张${SCROLL_NAME}（每张 ${piecesPerItem} 片），共扣减 ${pieces} 片。`,
    `分解返还 ${n * refundPerItem} 片${SCROLL_FRAGMENT_NAME}（每张留 ${perLoss} 片损耗，共损耗 ${n * perLoss} 片）。`,
    `返还的${SCROLL_FRAGMENT_NAME}满 ${piecesPerItem} 片可手动合成 1 张${SCROLL_NAME}。`,
    '是否确认分解？',
  ];
}

/**
 * 兰帖格【分解】未达标原因之一：**本格（= 本人兰帖片数）不足 1 张**（`pieces < perItem`）
 * ⇒ 按钮置灰 + 层内明写本行 + 点按直出同一句（三态可见，**不得静默**）。
 *
 * 体例对齐残页侧的 `scrollSynthShortReasonLine`（同为本模块单点）。**2026-09-29 口径变更**：
 * 兰帖单格容量改为 **100 张 = 10000 片** 后，「非整格」不再等于「不可分解」——
 * 判据改为**整张数**（`floor(片数 / perItem) ≥ 1` 才可分解），故本行取代旧
 * `scrollRemainderReasonLine`（旧名 + 旧文案「本格为余数（…）」已随本批删除）。
 */
export function scrollShortReasonLine(pieces: number, perItem: number): string {
  return `当前 ${pieces} 片${SCROLL_NAME}，不足 ${perItem} 片，无法分解`;
}

/** 可分解的兰帖被待确认的续约申请锁定（`scrollLock`）⇒【分解】未达标原因（**必须显示，不得静默**） */
export function scrollLockedReasonLine(): string {
  return `续约申请待确认：锁定的${SCROLL_NAME}不可分解（可解除该关系或等对方处理后重试）`;
}

// ============ 兰帖残页【手动合成】文案单点（2026-09-26 裁定 · 逐字） ============
/**
 * 手动合成相关文案（**单点**）：入口 = 行囊（`asset-inventory`）残页格属性提示层的【合成】按钮
 * —— 与既有兰帖格【分解】对偶；一次恰好消耗 `perItem`（= 100）片残页、合成 1 张，余数保留。
 * 文案逐字（Kevin 2026-09-26 给定，一字不改）；比例数值由调用方传入（本模块不复制常量）。
 */

/** 合成确认层标题（自绘确认层用，与 `SCROLL_DECOMPOSE_TITLE` 同体例） */
export const SCROLL_SYNTH_TITLE = '⚠️ 合成兰帖确认';

/**
 * 合成确认正文（逐行渲染，不合并、不改标点）：
 * `perItem` = 每张所需片数（= 100）、`pieces` = 当前持有片数（合成后剩余 = `pieces − perItem`）。
 */
export function scrollSynthConfirmLines(perItem: number, pieces: number): string[] {
  return [
    `本次将消耗 ${perItem} 片${SCROLL_FRAGMENT_NAME}，合成 1 张${SCROLL_NAME}。`,
    `当前持有 ${pieces} 片${SCROLL_FRAGMENT_NAME}，合成后剩余 ${pieces - perItem} 片。`,
    '是否确认合成？',
  ];
}

/** 残页不足 1 张 ⇒【合成】未达标原因行（**必须显示出来，不得静默**） */
export function scrollSynthShortReasonLine(pieces: number, perItem: number): string {
  return `当前 ${pieces} 片${SCROLL_FRAGMENT_NAME}，不足 ${perItem} 片，无法合成`;
}

/** 合成成功 toast 原文（逐字） */
export const SCROLL_SYNTH_OK_TEXT = `已合成 1 张${SCROLL_NAME}`;

/**
 * 合成失败 toast 原文（逐字：`合成失败：` + **后端 error 原文**）——
 * 后端文案一律原样透出，**绝不吞掉、绝不改写为自造提示**。
 */
export function scrollSynthFailText(backendMessage: string): string {
  return `合成失败：${backendMessage}`;
}

// ============ 道具诗句（Kevin 2026-09-25 逐字给定 · **唯一真源**） ============

/**
 * 诗句键（与 `business/inventory.ts` 的 `InventoryKind` **同名同集**）。
 * 本模块**不反向 import** `inventory.ts`（避免两模块互相 import 成环 —— 同「比例 / 上下限数值由调用方传入」的既有约定）。
 */
export type AssetPoemKey = 'bamboo' | 'scroll' | 'scrollFragment' | 'jade' | 'seed' | 'fragment';

/**
 * 六类道具的诗句（**逐字**，含出处；一字不改、不补全、不自造）。
 *
 * **单一来源**：组件 / 页面一律经 `assetPoem()` 引用本表；**任何 `.vue` / 其它模块不得再写一份诗句字面**
 * （同本模块「展示名 / 状态文案单点」的约定）。
 * **展示位置（Kevin 已定）** = 道具属性提示层内（`asset-inventory.vue` 的 `.inv-tip`，z-index 1010）：
 * 点开某道具时，层内显示该道具对应的诗句。
 *
 * **出处署名简化 = Kevin 2026-09-28 裁定，诗句本句一字未改**（只去篇名《》与朝代前缀，署名内用「·」）。
 */
export const ASSET_POEMS: Record<AssetPoemKey, string> = {
  bamboo: '书于简策，以诏子孙，敦睦九族。——古·佚名',
  scroll: '金兰幸有同心契，莫负山中一段香。——明·唐寅',
  scrollFragment: '用证兰盟，互通芳谱。——古·佚名',
  jade: '五龙一门，金友玉昆。——晋·佚名',
  seed: '榴枝婀娜榴实繁，榴膜轻明榴子鲜。——唐·李商隐',
  fragment: '千房同膜，千子如一。——晋·潘尼',
};

/** 取某类道具的诗句（键 = `InventoryItem.kind`）；未知键 → 空串（**不渲染该行**，不新造文案） */
export function assetPoem(kind: string): string {
  return ASSET_POEMS[kind as AssetPoemKey] || '';
}

// ============ 任务中心（批3）用的**既有**物品展示名与单位（单点） ============

/**
 * 石榴籽碎片 / 竹片的展示名与单位（**逐字**；与 `business/inventory.ts` 的 `KIND_NAME.fragment = '石榴籽碎片'`
 * 及 `KIND_QTY_UNIT.fragment = '片'` 同字面 —— 两册各写一份会漂移，新增页面一律引用本模块，勿再抄一遍）。
 * 「竹片」= 既有竹片的**片**口径（`docs/task-center.spec.md` §6-1：「竹简碎片」= 既有竹片，**不新增碎片层**），
 * 故本模块**不**新造「竹简碎片」这个名字。
 */
export const SEED_FRAGMENT_NAME = '石榴籽碎片';
/** 石榴籽碎片量词（碎片类一律「片」；2026-09-26 由「个」改定） */
export const SEED_FRAGMENT_UNIT = '片';
export const BAMBOO_PIECES_NAME = '竹片';
export const BAMBOO_PIECES_UNIT = '片';

/**
 * 兰帖片数单位（**恒「片」**）。
 * 「张」是**整道具数**的量词（1 张 = 100 片），片数是**另一个量**；凡数字为片数时一律标「片」
 * （`docs/economy.spec.md` §14-13 ①格数 / ②张数 两口径不得混用；2026-09-26 量词裁定 A5）。
 * 单点：行囊提示层的兰帖数量行由 `business/inventory.ts` 引用本常量，勿在组件里散落「片」字面。
 */
export const SCROLL_PIECES_UNIT = '片';

/**
 * 兰帖整道具（张）的量词（**恒「张」**；1 张 = 100 片）。
 * 单点：数字为**整道具数**（张）时经本常量拼装；数字为**片数**时一律用 `SCROLL_PIECES_UNIT`。
 * 本常量是「张」的**唯一字面**，三处同源（无一例外，勿再抄一遍）：
 * ① 本常量 `asset-text.ts` 的 `SCROLL_ITEM_UNIT`；
 * ② `business/inventory.ts` 的 `KIND_QTY_UNIT.scroll`（行囊角标 / 提示层计数行 / 换算依据行）；
 * ③ `business/inventory.ts` 的 `KIND_ITEM_UNIT.scroll`（溢出行的道具计数）。
 * ②③ 现均**引用本常量**（`inventory.ts` 已从本模块导入；方向与 `SCROLL_NAME` / `SCROLL_FRAGMENT_NAME` 一致，不成环）。
 */
export const SCROLL_ITEM_UNIT = '张';

/**
 * 兰帖**片 → 张**的展示值（**唯一换算点**；行囊角标 + 提示层计数行共用）。
 *
 * 口径（Kevin 2026-09-29 给定）：1 张 = 100 片 ⇒ `片数 / 100`；量化到 **2 位小数**
 * （`Number(x.toFixed(2))` ⇒ 去尾零）。渲染体例：
 * - 整数**不带小数点**（`1` / `100`；如整格 10000 片 ⇒ `100`）；
 * - 非整**最多 2 位**且去尾零（99 片 ⇒ `0.99`；2500 片 ⇒ `25`；9950 片 ⇒ `99.5`）。
 *
 * 非法 / 负值 ⇒ `0`（**绝不出现 `NaN`**）；分子按**整片**取整（片数恒为整数）。
 * 比例常量由调用方传入 `100`（= `business/inventory.ts` 的 `SCROLL_PIECES_PER_ITEM`），
 * 本模块不复制比例常量（同既有约定，避免两模块 import 成环）。
 */
export function scrollZhangQty(pieces: unknown, piecesPerItem: number): number {
  const p = Math.max(0, Math.floor(Number(pieces) || 0));
  const per = Math.floor(Number(piecesPerItem) || 0);
  if (per <= 0) return 0;
  return Number((p / per).toFixed(2));
}

// ============ 资产不足（`ASSET_INSUFFICIENT`）明细行量词**单点** ============

/**
 * 石榴籽的**数量量词**（**唯一字面**「颗」）—— 立支籽不足明细行等一律引用本常量，
 * 组件内**不得再写「颗」字面**。
 * 注：`business/inventory.ts` 的 `KIND_QTY_UNIT.seed` 是**行囊格内单位表**（另一条链路），
 * 本轮（量词收敛单）未纳入；新增组件一律引用本单点。
 */
export const SEED_QTY_UNIT = '颗';

/**
 * 石榴籽玉的**数量量词**（**唯一字面**「枚」）；同上，组件一律引用本常量。
 */
export const JADE_QTY_UNIT = '枚';

/**
 * 后端 `unit` 键（**逐字**）→ 中文量词（**单点**；`docs/economy-fee.spec.md` §6 的 `need`/`current`/`unit`）。
 * **本表恰七键**（**恰含单数 `scroll` 与复数 `scrolls`**），其中**两个兰帖键（`scroll` / `scrolls`）同分母为片**
 * —— 即查这两键时后端给的 `need` / `current` **均为片值** ⇒ 量词一律「片」（**不得**用「张」：「张」是
 * **整格数**的**另一个量**的量词，见 `SCROLL_ITEM_UNIT`：1 张 = 100 片）。
 * - `fragments` = 石榴籽碎片、`bamboos` = 竹片、`scrolls` = 兰帖、`scroll_fragments` = 兰帖残页 ⇒ 一律「片」
 *   （复用既有常量，不另写「片」字面）；
 * - `seeds` = 石榴籽 ⇒ `SEED_QTY_UNIT`；`jade`（**单数键，既有字面**）= 石榴籽玉 ⇒ `JADE_QTY_UNIT`；
 * - ⚠️ `scroll`（**单数键 · 防御性补全 · Kevin 2026-09-26 拍定「焊死」**）：
 *   `cloudfunctions/compat-api/lib/economy-fee.js` 的 `insufficientBody()` 在 `chargeLots(..., 'scroll')`
 *   路径（`lib/friend-ops.js` 的兰帖分解预检）会**原样透出** `unit = 'scroll'`（**单数**，只对 `bamboo` / `seed`
 *   做归一，不改 `scroll`）；该路径**现不可达响应体**（三处调用点均不输出 `unit`）⇒ 本键只为该链路将来可达时
 *   UI **不丢量词**（否则明细行退化为「本次需 9，当前可用 3」），**零行为变更**。口径与 `scrolls` **同**：
 *   与单数键同口径的 `need` / `current` 是**片值** ⇒ 量词 = `SCROLL_PIECES_UNIT`（「片」），**不得**用「张」；
 * - ⚠️ `scrolls` 在 `e3a1fa0` 之后 `need` / `current` **恒为片数** ⇒ 量词固定「片」，
 *   **不得**用「张」（「张」是**整格数**的量词，见 `SCROLL_ITEM_UNIT`：1 张 = 100 片）；
 * - **未知 / 缺失键**不在本表 ⇒ 调用方只出数字，**绝不默认回退「颗」**。
 */
export const SHORTAGE_UNIT_BY_KEY: Record<string, string> = {
  fragments: SEED_FRAGMENT_UNIT,
  seeds: SEED_QTY_UNIT,
  bamboos: BAMBOO_PIECES_UNIT,
  jade: JADE_QTY_UNIT,
  scroll: SCROLL_PIECES_UNIT,
  scrolls: SCROLL_PIECES_UNIT,
  scroll_fragments: SEED_FRAGMENT_UNIT,
};

/**
 * 资产不足明细行（**唯一拼装点**）：`本次需 X <量词>，当前可用 Y <量词>`。
 * - 量词按后端 `unit` 键查 `SHORTAGE_UNIT_BY_KEY`；**未知 / 缺失键 ⇒ 不加量词、只出数字**
 *   （绝不回退「颗」），此时不留悬空空格（`本次需 X，当前可用 Y`）；
 * - 数字缺失（`undefined` / `null`）→ `—`（与既有 `?? '—'` 口径一致）；
 * - **前端不展示英文 `unit` 键**（旧英文后缀拼接已删）。
 */
export function shortageLine(need: unknown, current: unknown, unitKey: string | undefined): string {
  const q = SHORTAGE_UNIT_BY_KEY[String(unitKey ?? '')] || '';
  const num = (v: unknown) => (v === undefined || v === null ? '—' : String(v));
  const withUnit = (v: unknown) => (q ? `${num(v)} ${q}` : num(v));
  return `本次需 ${withUnit(need)}，当前可用 ${withUnit(current)}`;
}

// ============ 资产变动（delta）文案**单点**（资产页流水 + 后台资产变动日志共用） ============

/**
 * 兰帖 delta（`AssetDelta.scrolls`，线上**恒以片计**）→ 展示片段（**不含正负号**，符号由调用方按页面前缀）：
 * - 片数可被 `piecesPerItem` 整除 ⇒ `N 张兰帖`（N = 片数 ÷ perItem，**绝不出小数张**）；
 * - 否则 ⇒ `M 片兰帖`（数值即片数）。
 *
 * `piecesPerItem` 由调用方传入 `business/inventory.ts` 的 `SCROLL_PIECES_PER_ITEM`
 * （**本模块不复制比例常量**，避免两模块 `import` 成环 —— 同 `scrollZhangQty` 的既有约定）。
 * **换算式只有本函数一份**：`pages/assets/index.vue`（我的资产流水）与
 * `pages/admin/index.vue`（资产变动日志）一律经本函数，页面内**不得再写 `% 100`**。
 */
export function scrollDeltaLabel(pieces: number, piecesPerItem: number): string {
  const v = Number(pieces) || 0;
  return v % piecesPerItem === 0
    ? `${v / piecesPerItem} ${SCROLL_ITEM_UNIT}${SCROLL_NAME}`
    : `${v} ${SCROLL_PIECES_UNIT}${SCROLL_NAME}`;
}

/**
 * 兰帖残页 delta（`AssetDelta.scroll_fragments`，**片**）→ 展示片段（恒 `N 片兰帖残页`；
 * 残页不论是否满 100 都是**片**口径，不做任何张数换算）。
 */
export function scrollFragmentDeltaLabel(count: number): string {
  return `${Number(count) || 0} ${SEED_FRAGMENT_UNIT}${SCROLL_FRAGMENT_NAME}`;
}

/**
 * 资产字段名 → 展示名（**单点**；任务中心读接口出参的品类数量键经此渲染）。
 * 未知字段 → **原样返回字段名**（绝不新造中文名，也绝不猜品类）。
 */
export function assetNameOf(field: string): string {
  const key = String(field ?? '');
  if (key === 'seed_fragments') return SEED_FRAGMENT_NAME;
  if (key === 'bamboo_pieces') return BAMBOO_PIECES_NAME;
  if (key === 'scroll_fragments') return SCROLL_FRAGMENT_NAME;
  return key;
}

// ============ 签到 7 天日历文案**单点**（2026-09-28 · 纯追加 · 上文既有行一字未改） ============

/**
 * 签到域文案与拼装（**唯一真源**）—— 落点 =「我的」页签到卡（`pages/mine/index.vue`）
 * 与后台签到设置（`pages/admin/index.vue`）。
 *
 * 纪律（同本模块「展示名 / 状态文案单点」的既有约定）：签到卡的**标题 / 提示行 / 连签行 /
 * 逐格标签 / 补签确认 / toast 拼装**一律经本模块，**页面内不得再写这些中文字面**。
 * 数值一律由调用方传入（本模块不复制后端常量）。
 */

/** 签到卡标题（逐字） */
export const SIGNIN_TITLE = '每日签到';

/** 未签到提示行（逐字；沿用既有文案，未改一字） */
export const SIGNIN_HINT_PENDING = '轻触印章 · 领 1 片石榴籽碎片';

/** 今日已签到（逐字）—— 签到卡提示行与「同自然日重复」toast **共用同一字面** */
export const SIGNIN_HINT_DONE = '今日已签到';

/** 今日奖励入口行（逐字） */
export const SIGNIN_REWARD_LINK = '今日奖励 · 去领取 →';

/** 已签到格的打勾叠标（装饰字形；唯一字面） */
export const SIGNIN_CELL_CHECK = '✓';

/** 签到失败行兜底（**仅当异常未带 message 时**；后端原文一律优先透出） */
export const SIGNIN_FAIL = '签到失败';

/** 石榴籽展示名（签到随机池可能发整颗籽；单点 —— 组件 / 页面不得另写） */
export const SEED_NAME = '石榴籽';

/** 石榴籽玉展示名（单点） */
export const JADE_NAME = '石榴籽玉';

/**
 * 签到 `kind`（**逐字**）→ 展示名（**单点**）。
 * 六键与后端 `kind` 取值逐字对应：`fragment` / `bamboo` / `scrollFragment` / `scroll` / `seed` / `jade`。
 * **未知键 ⇒ 原样返回键名**（同 `assetNameOf` 口径：不猜品类、也不把该件静默丢掉）。
 */
export const SIGNIN_KIND_NAME: Record<string, string> = {
  fragment: SEED_FRAGMENT_NAME,
  bamboo: BAMBOO_PIECES_NAME,
  scrollFragment: SCROLL_FRAGMENT_NAME,
  scroll: SCROLL_NAME,
  seed: SEED_NAME,
  jade: JADE_NAME,
};

/** 取签到 `kind` 的展示名（未知键 → 原样键名，见 `SIGNIN_KIND_NAME` 注） */
export function signinKindName(kind: string): string {
  const key = String(kind ?? '');
  return SIGNIN_KIND_NAME[key] || key;
}

/** 数量角标（唯一字面 `×N`；`qty` 非法 / ≤0 ⇒ `×0`，**不显 `NaN`**） */
export function signinQtyBadge(qty: unknown): string {
  const n = Math.floor(Number(qty));
  return `×${Number.isFinite(n) && n > 0 ? n : 0}`;
}

/**
 * 逐格日序标签（唯一字面 `第 N 天`）；`is_bonus` 格追加 ` · 大奖`
 * （金边由页面 CSS 画，本函数只给文字）。`cycle_day` 非法 ⇒ 按第 1 天显示，**不显 `NaN`**。
 */
export function signinDayLabel(cycleDay: unknown, isBonus?: unknown): string {
  const n = Math.floor(Number(cycleDay));
  const day = Number.isFinite(n) && n > 0 ? n : 1;
  return isBonus ? `第 ${day} 天 · 大奖` : `第 ${day} 天`;
}

/** 逐件列举的**单件**片段（唯一拼装点）：`石榴籽碎片 ×1` */
export function signinItemLine(kind: string, qty: unknown): string {
  return `${signinKindName(kind)} ${signinQtyBadge(qty)}`;
}

/** `items` 逐件列举的前缀（唯一字面） */
export const SIGNIN_GAIN_PREFIX = '获得 ';

/**
 * 基础发放句（**逐字保留** —— 后端未返回 `items`（旧版）时的兜底，**不得改写**）。
 * 新版后端一律走 `items` 逐件列举（竹片不再静默到账）。
 */
export const SIGNIN_BASE_TOAST = '获得石榴籽碎片 +1';

/**
 * 第 7 天大奖追加句（唯一字面）—— 大奖资产本身**已在 `items` 里逐件列出**，
 * 本句只作「触发大奖」的显式告知，**不重复数字**。
 */
export const SIGNIN_DAY7_TOAST = '已连签 7 天 · 第 7 天大奖已发放';

/** 满 10 自动合成句（**逐字保留**既有实现：`满 10 已合成 N 颗石榴籽`） */
export function signinSynthToast(synthesized: number): string {
  return `满 10 已合成 ${synthesized} 颗石榴籽`;
}

/**
 * 签到成功 toast（**唯一拼装点**；页面不得自行拼串）：
 * ① `items` 逐件列举（`获得 石榴籽碎片 ×1、竹片 ×1`）—— 即本批「**修掉竹片静默到账**」的落点；
 * ② `items` 缺失 / 非数组（旧后端）⇒ 退回既有逐字句 `SIGNIN_BASE_TOAST`；
 * ③ `cycle_day === 7` ⇒ 追加 `SIGNIN_DAY7_TOAST`；
 * ④ `synthesized > 0` ⇒ 追加 `signinSynthToast()`（**逐字保留**）。
 * 句间分隔恒为 `，`。
 */
export function signinToastText(
  r?: { items?: unknown; cycle_day?: unknown; synthesized?: unknown } | null,
): string {
  const parts: string[] = [];
  const items = Array.isArray(r?.items) ? (r?.items as Array<{ kind?: unknown; qty?: unknown }>) : [];
  if (items.length) {
    parts.push(
      `${SIGNIN_GAIN_PREFIX}${items.map((it) => signinItemLine(String(it?.kind ?? ''), it?.qty)).join('、')}`,
    );
  } else {
    parts.push(SIGNIN_BASE_TOAST);
  }
  if (Math.floor(Number(r?.cycle_day)) === 7) parts.push(SIGNIN_DAY7_TOAST);
  const synthesized = Math.floor(Number(r?.synthesized));
  if (Number.isFinite(synthesized) && synthesized > 0) parts.push(signinSynthToast(synthesized));
  return parts.join('，');
}

// ---- 补签（`POST /assets/signin/makeup`）文案 ----

/** 补签确认层标题（唯一字面） */
export const SIGNIN_MAKEUP_TITLE = '补签';

/** 补签确认按钮文案（唯一字面） */
export const SIGNIN_MAKEUP_CONFIRM_TEXT = '确认补签';

/** 补签取消按钮文案（唯一字面） */
export const SIGNIN_MAKEUP_CANCEL_TEXT = '取消';

/** 补签成功（唯一字面；后端未返回 `items` 时只出此句） */
export const SIGNIN_MAKEUP_OK = '补签成功';

/** 补签失败兜底（**仅当异常未带 message 时**；后端 `error` 原文一律优先透出、不吞、不改写） */
export const SIGNIN_MAKEUP_FAIL = '补签失败';

/**
 * 补签二次确认正文（**唯一拼装点**；`costBamboos` = 补签成本，单位**竹片**）：
 * - `costBamboos` 是**有限数字** ⇒ `补签将消耗 N 片竹片，确认继续？`（数字源 = `GET /assets/summary` 的
 *   `signin_makeup_cost_bamboos` 新出参；页面据此传入）；
 * - **拿不到成本**（旧后端无该出参 ⇒ 页面传 `null` / `undefined`；或值非法）⇒ `补签将消耗竹片，确认继续？`
 *   —— **明示「有成本」但不假报数字**。
 * ⚠️ `null` **必须**走无数字版：`Number(null) === 0`，若不显式排除就会谎报「0 片竹片」。
 */
export function signinMakeupConfirmText(costBamboos?: number | null): string {
  const n = Math.floor(typeof costBamboos === 'number' ? costBamboos : NaN);
  if (Number.isFinite(n) && n >= 0) {
    return `补签将消耗 ${n} ${BAMBOO_PIECES_UNIT}${BAMBOO_PIECES_NAME}，确认继续？`;
  }
  return `补签将消耗${BAMBOO_PIECES_NAME}，确认继续？`;
}

/**
 * 补签成功 toast（唯一字面 = `补签成功`）。
 * **补签不补发任何道具**（后端现证：只补日期集 + 重算连签，出参**不含 `items`**）
 * ⇒ 不再拼「获得 …」逐件列举，避免谎报发放。
 * 入参保留可选（调用点无需改动），**一律忽略**。
 */
export function signinMakeupToastText(_result?: unknown): string {
  return SIGNIN_MAKEUP_OK;
}

// ---- 连签行（`streak`）文案 ----

/** 连签 0 天（= 今日还未签到）行（逐字） */
export const SIGNIN_STREAK_NONE = '今日还未签到';

/**
 * 连签行（逐字；**三段互斥**，非专）：
 * - `N > 0` 且**今日未签** ⇒ `` `已连签 ${N} 天 · 今日还未签到` ``（末段逐字 = `SIGNIN_STREAK_NONE`）；
 * - `N > 0` 且**今日已签** ⇒ `` `已连签 ${N} 天` ``；
 * - `N === 0` ⇒ `今日还未签到`。
 *
 * `signedToday` 的判据**只能来自后端出参**（`GET /assets/summary` 的 `signin_calendar` 内有无
 * `state === 'today'` 的格）：**存在该格 ⇒ 今日未签（`false`）**；不存在且日历非空 ⇒ 今日已签（`true`）；
 * **日历缺失 / 空数组 ⇒ `undefined` ⇒ 回退旧口径**（只出 `已连签 N 天` / `今日还未签到`，不报错、不显 NaN）。
 * ⚠️ 调用方**不得**自行推算「今天」的日期串、不得硬编时区 —— 判据一律由日历出参推导后传入。
 *
 * `N` 非法 / 缺失（后端未重启，无 `signin_streak`）⇒ **空串 = 不渲染该行**（不臆造、不显 NaN）。
 */
export function signinStreakText(streak: unknown, signedToday?: boolean): string {
  const n = Math.floor(Number(streak));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return SIGNIN_STREAK_NONE;
  return signedToday === false ? `已连签 ${n} 天 · ${SIGNIN_STREAK_NONE}` : `已连签 ${n} 天`;
}

// ---- 日历格渲染项（**末尾追加**；口径 = 方案乙 · Kevin 2026-09-28 拍定：「只标固定基础 + 随机标记」）----

/**
 * 日历格「随机掉落」短 chip（唯一字面）—— 表示**当天还会随机掉一件**，
 * **不预标**随机品种（抽中何种由后端领取时刻决定，前端不猜）。
 */
export const SIGNIN_RANDOM_CHIP = '随机';

/** 日历格内的一个道具项（kind + qty；页面据此出真实图标与数量角标） */
export interface SigninCellAsset {
  kind: string;
  qty: number;
}

/** 单格原始形状（只取本模块要用的键，全部 `unknown` ⇒ 后端字段漂移时不崩、不显 NaN） */
type SigninCellRaw = {
  kind?: unknown;
  qty?: unknown;
  base?: unknown;
  bonus?: unknown;
};

/** 校验一件：`kind` 非空 且 `qty` 为正整数 ⇒ 出项；否则 `null`（**静默跳过，绝不造数**） */
function cellAssetOf(raw: unknown): SigninCellAsset | null {
  const it = (raw || {}) as { kind?: unknown; qty?: unknown };
  const kind = String(it.kind ?? '');
  const qty = Math.floor(Number(it.qty));
  if (!kind || !Number.isFinite(qty) || qty <= 0) return null;
  return { kind, qty };
}

/**
 * 单格**固定基础项**（唯一拼装点）：
 * - `base` 为数组且含合法项 ⇒ **逐项**返回（新契约：`[{kind:'fragment',qty:1},{kind:'bamboo',qty:1}]`）；
 * - `base` 缺失 / 非法（旧后端单格只给主项 `kind` / `qty`）⇒ 回退为**那一件**（旧渲染不变、不崩）；
 * - 两路都拿不到 ⇒ 空数组（页面不渲染图标，**不显 NaN、不臆造品类**）。
 */
export function signinCellBaseItems(day?: SigninCellRaw | null): SigninCellAsset[] {
  const items: SigninCellAsset[] = [];
  if (Array.isArray(day?.base)) {
    for (const raw of day?.base as unknown[]) {
      const asset = cellAssetOf(raw);
      if (asset) items.push(asset);
    }
  }
  if (items.length) return items;
  const fallback = cellAssetOf({ kind: day?.kind, qty: day?.qty });
  return fallback ? [fallback] : [];
}

/** 单格**第 7 天大奖**项（`bonus`）；缺失 / 非法 ⇒ `null` ⇒ 页面不渲染（不臆造） */
export function signinCellBonusItem(day?: SigninCellRaw | null): SigninCellAsset | null {
  return cellAssetOf(day?.bonus);
}
