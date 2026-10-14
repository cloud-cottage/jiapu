/**
 * 在线文谱 · 后记文案「后台可配」（全局一份）—— 后端 = 默认模板 + 校验 + 读写 CAS（`lib/wenpu-config.js`）
 *
 * 背景：后记文案原为**前端硬编码**（`frontend/src/business/wenpu.ts` 的 `buildPostscriptPages`）。
 * 本单把它改为**后台可配**（新集合 `jiapu_wenpu_config`，**单档 `_id='global'`**）。后端**只**做三件事：
 *   · 默认模板常量 `DEFAULT_POSTSCRIPT_TEMPLATE`（**单串** · 含循环块 `{{{…}}}`）逐字落在本文件；
 *   · 模板校验（PUT 必做 · 400 矩阵）；
 *   · 读 / 写 + `version` CAS 乐观锁。
 *
 * 路由：`GET /revisions` 顶层**新增** `wenpu_config`（只增不改）、`GET|PUT /admin/wenpu-config`（**仅 `chief_editor`**）。
 * 写路径**不进计费闸门**、**不写 `jiapu_ops_logs`**（按本仓先例：非资产类设定改动不入运营审计）。
 *
 * ⚠️ **Kevin 2026-10-13 裁定**：農曆（甲子年等）与后记**渲染一律只存在于前端** —— 后端只存取
 *    「标准模板串」，由前端判断農曆并展开轮段。后端**不得**出现任何農曆实现或数据表
 *    （原 `lib/lunar-year.js` 已按本裁定删除）。故本文件不含任何渲染算法、也不含任何農曆代码。
 *
 * ⚠️ **只有一个字段 `postscript_template`**（Kevin 2026-10-13 再修正：取消 `postscript_round_template`）——
 *    轮段不再单列模板，改由**循环块** `{{{ … }}}` 表达（该块按轮重复展开、块内轮段变量随轮绑定）。
 *
 * 模板变量（共 6 个 · 逐字）：
 *   · **任意位置允许**（值恒为全局、不随轮变）：`{肇創年份}` `{肇創人}` `{當前年份}`；
 *   · **循环块 `{{{…}}}` 内专用**：`{修譜序次}` `{修譜年份}` `{主司}` —— 出现在**块外 ⇒ 400**。
 *   未知变量名（如 `{张三}`）⇒ **400**。
 *
 * 校验（PUT 必做，逐条）：
 *   · 循环块 `{{{}}}` **恰 0 或 1 个**；**≥2 个 ⇒ 400**；`{{{` 或 `}}}` **未闭合 ⇒ 400**；块内**嵌套 ⇒ 400**；
 *   · 块内专用变量出现在块外 ⇒ 400；未知变量 ⇒ 400；
 *   · 循环块**缺失 / 为空** ⇒ **合法**：**不展开轮段**（后记不含修辑句）。
 */
import { colGet, mutateDoc } from './store.js';

/** 集合名（单档 `_id='global'`）。⚠️ 必须同步登记进 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`
 *  （该脚本有启动自检：代码引用的 `jiapu_*` 集合漏登记即 `exit 1`）。 */
export const WENPU_CONFIG_COL = 'jiapu_wenpu_config';
/** 单档 `_id`（全局一份配置） */
export const WENPU_CONFIG_ID = 'global';

/** 默认模板（**单串 · 逐字 · 不得改一字**；后端单点真源；未配置 ⇒ 用它）。`{{{…}}}` = 轮段循环块。
 *  ⚠️ Kevin 2026-10-13 拍定：肇创年位后**去「之年」**（即 `肇創於{肇創年份}，…`）。 */
export const DEFAULT_POSTSCRIPT_TEMPLATE =
  '本族家譜，肇創於{肇創年份}，由{肇創人}始纂。{{{其後{修譜序次}經修輯於{修譜年份}，主司{主司}。}}}今為最新釐正版，是為{當前年份}訂本。願後之族人、續而增修之。';

/** **任意位置允许**的变量（**繁体标签** · 值恒为全局、不随轮变） */
export const POSTSCRIPT_MAIN_VARS = ['肇創年份', '肇創人', '當前年份'];
/** **循环块 `{{{…}}}` 内专用**的变量（**繁体标签** · 块外出现 ⇒ 400） */
export const POSTSCRIPT_ROUND_VARS = ['修譜年份', '主司', '修譜序次'];

/** 循环块起 / 止符号（**逐字**） */
export const LOOP_OPEN = '{{{';
export const LOOP_CLOSE = '}}}';

const MAIN_VAR_SET = new Set(POSTSCRIPT_MAIN_VARS);
const ROUND_VAR_SET = new Set(POSTSCRIPT_ROUND_VARS);

// ---- 错误工厂 ----

/**
 * 造一个业务错误（`status` + 业务文案）。`code` 非空 ⇒ 写 `err.code`（**仅域名码**才这么用；
 * 本域无需域名码 ⇒ 常规 400 / 403 / 409 只走 `status`）。路由以 `send(e.status || 400, …)` 回显。
 */
export function wenpuConfigError(status, message, code = '') {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}

// ---- 循环块解析 / 模板校验 ----

/** `sub` 在 `t` 中**全部**出现位置（步进 1，含重叠 —— 用于枚举候选块边界） */
function positionsOf(t, sub) {
  const out = [];
  let i = 0;
  for (;;) {
    const j = t.indexOf(sub, i);
    if (j < 0) break;
    out.push(j);
    i = j + 1;
  }
  return out;
}

/** 花括号是否**完全配对**（`{` 与 `}` 数量相等且无提前闭合 —— 占位符 `{name}` 天然配对）。**纯函数**。 */
function bracesBalanced(s) {
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * 切出**唯一**循环块（`{{{ … }}}`）。**纯函数**：
 *   · 0 个块 ⇒ `{ hasBlock:false, blockBody:'', openIdx:-1, closeIdx:-1 }`；
 *   · 恰 1 个块 ⇒ 给出块体与起止下标（`closeIdx` 指向 `}}}` 首字符）；
 *   · **≥2 个块 / 单边未闭合 / 顺序颠倒 / 嵌套** ⇒ 抛 400。
 *
 * 收尾 `}}}` 的定位：取**第一个**能使「块体」花括号**完全配对**的 `}}}` —— 这样块体形如
 * `…{主司}}}}}`（占位符 `}` 紧贴块尾 `}}}`）时不会把占位符的 `}` 误当块尾（`{name}` 天然配对）。
 */
export function splitLoopBlock(template) {
  const t = String(template == null ? '' : template);
  const opens = positionsOf(t, LOOP_OPEN);
  const closes = positionsOf(t, LOOP_CLOSE);
  if (opens.length === 0 && closes.length === 0) {
    return { hasBlock: false, blockBody: '', openIdx: -1, closeIdx: -1 };
  }
  if (opens.length !== 1) {
    // 0 个 `{{{` 却有 `}}}`（未闭合）／≥2 个 `{{{`（过多块 或 嵌套）
    throw wenpuConfigError(400, `循环块 ${LOOP_OPEN}…${LOOP_CLOSE} 恰 0 或 1 个，且须闭合、不得嵌套`);
  }
  const openIdx = opens[0];
  let closeIdx = -1;
  for (const c of closes) {
    if (c <= openIdx) continue;
    if (bracesBalanced(t.slice(openIdx + LOOP_OPEN.length, c))) {
      closeIdx = c;
      break;
    }
  }
  if (closeIdx < 0) throw wenpuConfigError(400, `循环块未闭合：缺少配对的 ${LOOP_CLOSE}`);
  const blockBody = t.slice(openIdx + LOOP_OPEN.length, closeIdx);
  if (blockBody.includes(LOOP_OPEN) || blockBody.includes(LOOP_CLOSE)) {
    throw wenpuConfigError(400, '循环块不得嵌套');
  }
  return { hasBlock: true, blockBody, openIdx, closeIdx };
}

/** 抽出文本中全部占位符名（`{name}` ⇒ `name`；按出现顺序、可重复） */
export function placeholdersOf(text) {
  return [...String(text == null ? '' : text).matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
}

/**
 * 校验**单串**模板的变量 / 循环块合法性（**写路径入参校验**）：
 *   · 循环块语法（0/1 个 · 闭合 · 不嵌套）—— 由 `splitLoopBlock` 抛 400；
 *   · 块**外**：出现块内专用变量 ⇒ 400；未知变量 ⇒ 400；
 *   · 块**内**：未知变量 ⇒ 400（块内允许块专用变量 + 任意位置的 3 个全局变量）。
 * 通过则返回 `true`。
 */
export function validatePostscriptTemplate(template) {
  const t = String(template == null ? '' : template);
  const { hasBlock, blockBody, openIdx, closeIdx } = splitLoopBlock(t);
  const outside = hasBlock ? t.slice(0, openIdx) + t.slice(closeIdx + LOOP_CLOSE.length) : t;
  for (const name of placeholdersOf(outside)) {
    if (ROUND_VAR_SET.has(name)) {
      throw wenpuConfigError(400, `轮段专用变量 {${name}} 只能出现在循环块 ${LOOP_OPEN}…${LOOP_CLOSE} 内`);
    }
    if (!MAIN_VAR_SET.has(name)) throw wenpuConfigError(400, `未知变量 {${name}}`);
  }
  if (hasBlock) {
    for (const name of placeholdersOf(blockBody)) {
      if (!MAIN_VAR_SET.has(name) && !ROUND_VAR_SET.has(name)) throw wenpuConfigError(400, `未知变量 {${name}}`);
    }
  }
  return true;
}

// ---- 配置读写（集合 `jiapu_wenpu_config` · 单档 `_id='global'` · `version` = CAS 乐观锁） ----

/** 读配置档（**容错读**：集合缺失 / 读失败 ⇒ `null`，绝不抛 —— 口径同 `revision-postscript` 的读容错） */
export async function loadWenpuConfigDoc() {
  try {
    return await colGet(WENPU_CONFIG_COL, WENPU_CONFIG_ID);
  } catch {
    return null;
  }
}

/** 字符串字段取「非空串否则默认」（未配置 / 非法 ⇒ 默认模板） */
function templateOr(raw, fallback) {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : fallback;
}

/**
 * `GET /revisions` 顶层新增键 `wenpu_config`（**只增不改** · **只有一个键**）：`{ postscript_template }`。
 * **未配置 ⇒ 返回默认模板**（前端零默认逻辑）。读失败 ⇒ 亦返回默认（读路径绝不 500）。
 */
export async function getWenpuConfig() {
  const doc = await loadWenpuConfigDoc();
  return {
    postscript_template: templateOr(doc?.postscript_template, DEFAULT_POSTSCRIPT_TEMPLATE),
  };
}

/**
 * `GET /admin/wenpu-config`（**仅 `chief_editor`**）出参：
 * `{ ok, postscript_template, is_default, defaults, version, updated_at, updated_by }`。
 * `is_default` = 生效值恰为默认模板（未配置 / 存了默认 ⇒ true）。
 */
export async function getAdminWenpuConfig() {
  const doc = await loadWenpuConfigDoc();
  const postscript_template = templateOr(doc?.postscript_template, DEFAULT_POSTSCRIPT_TEMPLATE);
  return {
    ok: true,
    postscript_template,
    is_default: postscript_template === DEFAULT_POSTSCRIPT_TEMPLATE,
    defaults: { postscript_template: DEFAULT_POSTSCRIPT_TEMPLATE },
    version: Number(doc?.version) || 0,
    updated_at: typeof doc?.updated_at === 'string' ? doc.updated_at : '',
    updated_by: typeof doc?.updated_by === 'string' ? doc.updated_by : '',
  };
}

/**
 * `PUT /admin/wenpu-config` 写路径（**仅 `chief_editor`**；**不进计费闸门**、**不写 `jiapu_ops_logs`**）。
 *
 * 校验顺序：字段缺失（400）→ 循环块 / 变量校验（400）→ `version` 形状（400）→ CAS 乐观锁（409）。
 * `version` 缺省 ⇒ 不做并发校验、照写；提供且 ≠ 现档 `version` ⇒ 409（并发冲突）。
 *
 * @param {object} p
 * @param {string} p.postscript_template 单串模板
 * @param {number} [p.version] 现档版本（CAS 乐观锁；缺省 = 不校验）
 * @param {string} [p.phone]   操作者手机号（写 `updated_by`）
 * @param {Date}   [p.now]     写入时刻（写 `updated_at`；纯函数化 ⇒ 由调用方传入）
 * @returns {Promise<{ok:true, version:number}>}
 */
export async function setWenpuConfig({ postscript_template, version, phone, now = new Date() } = {}) {
  if (typeof postscript_template !== 'string' || postscript_template.trim() === '') {
    throw wenpuConfigError(400, '缺少 postscript_template');
  }
  validatePostscriptTemplate(postscript_template);

  const hasVersion = version !== undefined && version !== null && String(version).trim() !== '';
  let want = null;
  if (hasVersion) {
    want = Number(version);
    if (!Number.isFinite(want) || want < 0 || Math.floor(want) !== want) {
      throw wenpuConfigError(400, '版本号 version 非法');
    }
  }

  const updated_at = (now instanceof Date ? now : new Date(now)).toISOString();

  const written = await mutateDoc(WENPU_CONFIG_COL, WENPU_CONFIG_ID, (doc) => {
    const curVersion = Number(doc?.version) || 0;
    // CAS 乐观锁：提供 version 且与现档不符 ⇒ 并发冲突（409）
    if (hasVersion && want !== curVersion) {
      throw wenpuConfigError(409, '後記文案已被他人修改（版本衝突），請重新讀取後再試');
    }
    return {
      _id: WENPU_CONFIG_ID,
      postscript_template,
      updated_at,
      updated_by: String(phone == null ? '' : phone),
    };
  });
  return { ok: true, version: Number(written?.version) || 0 };
}
