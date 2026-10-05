/**
 * 出生地 / 居住地（结构化）—— 归一、比对与展示的**唯一真源**（纯函数，零 IO，零 npm 依赖）
 *
 * 契约 v2（Zang 冻结，逐条对应；实现不得自行改口径）：
 *   C1 `people.<handle>.birth_place` = `{ origin_code: '<6 位码或空串>', note: '<备注文本>' }`（两段都存）；
 *   C2 `people.<handle>.residence_places` = `[{ origin_code, note }]`，**上限 9 条**，顺序即展示顺序，无则 `[]`；
 *   C3 读侧容错：历史字符串 → `{ origin_code:'', note:<原串> }`；`null` / 未定义 / 非法类型 →
 *      `{ origin_code:'', note:'' }`；`residence_places` 非数组 → `[]`。**任何输入都不得抛错**；
 *   C5 计费/无改动判定按**规范化后**逐字段比对（数组逐项 + 长度）；
 *   C7 展示串一律走 `lib/geo.js` 的 `resolveOrigin()`（本模块**不另写一套**行政区划反查）；
 *   C8 tree-meta 镜像回写的 `origin_code` / `origin` 由 `treeOriginPatchOf()` 统一给出；
 *   C10 第 10 条由写路径 400 拒绝（文案见 `RESIDENCE_LIMIT_MESSAGE`）；
 *   C1′/C2′ 写路径**形状闸门**：显式提供（非 `undefined` / 非 `null`）的 `residence_places` 必须是数组、
 *      `birth_place` 必须是对象 → 否则 400（见 `assertPlaceFieldShapes`）。C3 的归一只是**读侧容错**，
 *      不得被写路径当「清洗」用：归一后的 `[]` / 空对象会把原值静默清空（且照收 1 片）。
 *   R1 非空 `origin_code` 必须是已登记码 —— 未知码 → 400「出生地行政区划代码无效：<码>」
 *      （`birth_place` 与 `residence_places` 每条同判；见 `assertKnownOriginCodes`）。
 *
 * —— 契约 v3（2026-10-05 追加；规格 = `docs/person-places.spec.md` §20；**v2 条文字面一字不改**）——
 *   F1 `residence_places[]` 每条新增 `start_year`（字符串，同 `birth_date` 口径：`''` 或 `'1960'`；
 *      缺键 / 空串 = 未填，**老数据零迁移**）；`birth_place` **不加**此字段（F2）。
 *   F3 非空 `start_year` 必须 `^\d{4}$` 且 `1000 <= N <= 2100` → 否则 400
 *      （`startYearFormatMessage` / `startYearRangeMessage`；见 `assertStartYears`）。
 *   F4 非空 `start_year` 且**卒年有值时**不得晚于卒年 → 否则 400（`startYearAfterDeathMessage`）；
 *      卒年取值 = `body.death_date` 显式传入则用它、否则节点现值；年份 = 前 4 位数字；
 *      卒年缺失 / 取不到 4 位 ⇒ **放行**；**不做出生年下限校验**（见 `assertStartYearNotAfterDeath`）。
 *   F5 读响应逐项新增 `place_start_year`（缺值 → `''`）—— 由 `placeViewOf` 输出；
 *      出生地响应处（`index.js` `profile.birth`）按**显式逐键**构造剥离该键（不得改 spread）。
 *   F7 `sameResidencePlaces` 纳入 `start_year`（**逐项 + 顺序敏感不变**）—— 否则「只改年份」被判无改动。
 *   F8 `PERSON_PLACE_FIELDS` / `isPlaceFieldsOnly` / 上限 / 码校验**一律不变**（`start_year` 在**条目内**，不新增顶层键）。
 *
 * 展示串口径（C7）：`place` = 码反查展示串，**空码则空串**（备注落在 `place_note`，不冒充展示串）；
 * tree-meta 的 `origin`（C8）另有兜底口径：无码时用备注兜底（`note || ''`）。
 */
import { isKnownOriginCode, resolveOrigin } from './geo.js';

/** 居住地上限（C2 / C10） */
export const MAX_RESIDENCE_PLACES = 9;

/** 第 10 条拒绝文案（C10；后端 400，不得只靠前端） */
export const RESIDENCE_LIMIT_MESSAGE = '居住地最多 9 条';

/** 居住地形状拒绝文案（写路径 C2′：显式提供但非数组 → 400） */
export const RESIDENCE_SHAPE_MESSAGE = '居住地格式无效，应为数组';

/** 出生地形状拒绝文案（写路径 C1′：显式提供但非对象 → 400） */
export const BIRTH_PLACE_SHAPE_MESSAGE = '出生地格式无效，应为对象';

/** 居住地开始年份范围（契约 v3 F3） */
const START_YEAR_MIN = 1000;
const START_YEAR_MAX = 2100;

/** 居住地开始年份「格式」拒绝文案（契约 v3 F3）：非空但非 4 位数字 → 400 */
export function startYearFormatMessage(value) {
  return `居住地开始年份格式无效：${value}`;
}

/** 居住地开始年份「范围」拒绝文案（契约 v3 F3）：4 位但不在 1000–2100 → 400 */
export function startYearRangeMessage(value) {
  return `居住地开始年份超出范围（1000–2100）：${value}`;
}

/** 居住地开始年份「不得晚于卒年」拒绝文案（契约 v3 F4） */
export function startYearAfterDeathMessage(startYear, deathYear) {
  return `居住地开始年份不得晚于卒年：${startYear}（卒年 ${deathYear}）`;
}

/** 树 JSON 里参与出生地 / 居住地的字段名（写路径白名单 / 始祖放行白名单共用同一份） */
export const PERSON_PLACE_FIELDS = ['birth_place', 'residence_places'];

/** 文本归一：`null` / `undefined` → `''`，其余 trim（码与备注同一口径） */
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * 单个地点项归一 → 恒为 `{ origin_code, note }`（C1 / C3）：
 *   · 字符串（历史形态）→ `{ origin_code:'', note:<原串> }`；
 *   · 对象 → 取 `origin_code` / `note` 字段（缺字段 / 非法值 → 空串）；
 *   · `null` / 未定义 / 数字 / 布尔 / 数组 → `{ origin_code:'', note:'' }`。
 *
 * 契约 v3 §20-2：「**出生地不加** `start_year`」 ⇒ 本函数（出生地归一 + 居住地条目归一的公共部分）
 * **恒不产出 `start_year` 键**（否则 `tree-write` 落库的 `birth_place` 会多出该键，违反 §20-2）；
 * `start_year` 只在 `normalizeResidencePlaces()` 的**居住地条目**上附加。
 */
export function normalizeBirthPlace(raw) {
  if (typeof raw === 'string') return { origin_code: '', note: raw.trim() };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { origin_code: '', note: '' };
  return { origin_code: text(raw.origin_code), note: text(raw.note) };
}

/**
 * 居住地数组归一 → 恒为数组（非数组 → `[]`，逐项归一同上）；**不截断**（上限由 assertResidencePlacesLimit 拦）。
 * 契约 v3 F1：**每条附加 `start_year`**（同 `text()` 口径；`null` / 缺键 → `''`，即「未填」）。
 */
export function normalizeResidencePlaces(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({ ...normalizeBirthPlace(item), start_year: text(item?.start_year) }));
}

/** C10：第 10 条 → `status=400` 抛错（写路径与路由共用同一判据与文案） */
export function assertResidencePlacesLimit(raw) {
  if (Array.isArray(raw) && raw.length > MAX_RESIDENCE_PLACES) {
    const err = new Error(RESIDENCE_LIMIT_MESSAGE);
    err.status = 400;
    throw err;
  }
  return true;
}

/** `birth_place` 合法形状 = 非空对象且非数组（`{ origin_code, note }` 两段） */
const isBirthPlaceShape = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** 形状拒绝错误（`status=400`；路由用 `errorStatusOf(e, 400)` 落 400） */
function shapeError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * 写路径形状闸门（C1′/C2′；**路由预检与写路径共用同一判据**）：
 * 显式提供（非 `undefined` / 非 `null`）的 `residence_places` 必须是数组、
 * `birth_place` 必须是对象 → 否则 `status=400` 抛错，**不扣费、不落盘、不动原值**。
 *
 * 存在的理由（实测缺陷）：非数组 `residence_places` 经 `normalizeResidencePlaces` 归一为 `[]`，
 * 写路径会把它当成「清空居住地」照常落盘并收 1 片；非对象 `birth_place`（历史字符串 / 数字 / 数组）
 * 归一后丢掉 `origin_code`，同样静默覆盖原出生地。归一是**读侧**容错口径，不是写侧清洗。
 * `undefined` / `null`（未提供）一律放行 —— 等同不改写，与既有口径一致。
 * @returns {true} 通过
 * @throws {Error} `status=400`
 */
export function assertPlaceFieldShapes(body) {
  const b = body || {};
  if (b.residence_places !== undefined && b.residence_places !== null && !Array.isArray(b.residence_places)) {
    throw shapeError(RESIDENCE_SHAPE_MESSAGE);
  }
  if (b.birth_place !== undefined && b.birth_place !== null && !isBirthPlaceShape(b.birth_place)) {
    throw shapeError(BIRTH_PLACE_SHAPE_MESSAGE);
  }
  return true;
}

/** 出生地内容是否非空（码或备注任一有值）—— 读侧决定是否输出 `profile.birth` 用 */
export function hasPlaceContent(raw) {
  const p = normalizeBirthPlace(raw);
  return !!p.origin_code || !!p.note;
}

/** 出生地是否相同（规范化后逐字段；历史字符串与对象同一口径） */
export function sameBirthPlace(a, b) {
  const x = normalizeBirthPlace(a);
  const y = normalizeBirthPlace(b);
  return x.origin_code === y.origin_code && x.note === y.note;
}

/** 居住地是否相同（规范化后**逐项 + 长度**，顺序敏感 —— 顺序即展示顺序）。
 * 契约 v3 F7：纳入 `start_year` —— 否则「只改年份」会被判**无改动**（不落库、不扣费）。 */
export function sameResidencePlaces(a, b) {
  const x = normalizeResidencePlaces(a);
  const y = normalizeResidencePlaces(b);
  if (x.length !== y.length) return false;
  return x.every((v, i) => v.origin_code === y[i].origin_code && v.note === y[i].note && v.start_year === y[i].start_year);
}

/**
 * 读响应形状（C7 / v3 F5）：`{ place, place_code, place_note, place_start_year }`。
 * `place` = 码反查展示串（`resolveOrigin().display`），**空码 / 未知码 → 空串**（备注不冒充展示串）。
 * `place_start_year`（v3）：条目 `start_year`，缺值 → `''`。**出生地响应处由 index.js 显式逐键构造剥离此键。**
 */
export function placeViewOf(raw) {
  const p = normalizeBirthPlace(raw);
  return {
    place: p.origin_code ? resolveOrigin(p.origin_code).display : '',
    place_code: p.origin_code,
    place_note: p.note,
    place_start_year: text(raw?.start_year),
  };
}

/** 读响应形状数组（C7）：居住地逐项转 `{ place, place_code, place_note }`，顺序不变 */
export function residenceViewOf(raw) {
  return normalizeResidencePlaces(raw).map((item) => placeViewOf(item));
}

/**
 * tree-meta 镜像补丁（C8）：`{ origin_code, origin }`。
 * `origin` = `code ? resolveOrigin(code).display : (note || '')`（无码时用备注兜底）。
 */
export function treeOriginPatchOf(raw) {
  const p = normalizeBirthPlace(raw);
  return {
    origin_code: p.origin_code,
    origin: p.origin_code ? resolveOrigin(p.origin_code).display : p.note || '',
  };
}

/** 未知码拒绝文案（R1；与 `PUT /tree-meta` **逐字同口径**，不得另起措辞） */
export function unknownOriginCodeMessage(code) {
  return `出生地行政区划代码无效：${code}`;
}

/**
 * R1（Zang 2026-09-20 裁定）：请求体里**非空**的 `origin_code` 必须是已登记的 6 位码。
 *
 * 覆盖 `birth_place.origin_code` 与 `residence_places[]` **每一条**（含历史字符串形态：归一后无码 ⇒ 放行）。
 * 空码 = 合法「未结构化」，一律放行；未知码 / 非 6 位 → `status=400` + 逐字文案。
 * 目的：脏码不得从**节点**渗进树（进而被 C8′ 镜像到 tree-meta），与 `PUT /tree-meta` 同闸门。
 * @returns {true} 通过
 * @throws {Error} `status=400`（路由用 `errorStatusOf(e, 400)` 落 400）
 */
export function assertKnownOriginCodes(body) {
  const b = body || {};
  const bad = [];
  if (b.birth_place !== undefined && b.birth_place !== null) {
    const code = normalizeBirthPlace(b.birth_place).origin_code;
    if (code && !isKnownOriginCode(code)) bad.push(code);
  }
  if (b.residence_places !== undefined && b.residence_places !== null) {
    for (const item of normalizeResidencePlaces(b.residence_places)) {
      if (item.origin_code && !isKnownOriginCode(item.origin_code)) bad.push(item.origin_code);
    }
  }
  if (bad.length) {
    const err = new Error(unknownOriginCodeMessage(bad[0]));
    err.status = 400;
    throw err;
  }
  return true;
}

/** 取字符串前 4 位数字（`'2020'` / `'2020-05-01'` → `'2020'`；取不到 4 位数字 → `''`） */
function leadingYear(v) {
  const m = text(v).match(/^\d{4}/);
  return m ? m[0] : '';
}

/**
 * 契约 v3 F3：`residence_places` 每条非空 `start_year` 必须 `^\d{4}$` 且 `1000 <= N <= 2100`。
 * 失败 → `status=400`，逐字文案见 `startYearFormatMessage`（格式）/ `startYearRangeMessage`（越界）。
 * **出生地不参与**（§20-2 出生地不加此字段）；`residence_places` 未提供 / `null` → 放行。
 * @returns {true} 通过
 * @throws {Error} `status=400`
 */
export function assertStartYears(body) {
  const b = body || {};
  if (b.residence_places === undefined || b.residence_places === null) return true;
  for (const item of normalizeResidencePlaces(b.residence_places)) {
    const y = item.start_year;
    if (!y) continue;
    if (!/^\d{4}$/.test(y)) throw shapeError(startYearFormatMessage(y));
    const n = Number(y);
    if (n < START_YEAR_MIN || n > START_YEAR_MAX) throw shapeError(startYearRangeMessage(y));
  }
  return true;
}

/**
 * 契约 v3 F4：非空 `start_year` 且**卒年有值时**，`start_year <= 卒年`；否则 → `status=400`（文案逐字）。
 * 卒年取值 = `body.death_date` **显式传入**（非 `undefined` / 非 `null`）则用它，否则 `fallbackDeathDate`（节点现值）；
 * 年份 = 该值**前 4 位数字**（`'2020'` 与 `'2020-05-01'` 都取到 `2020`）；**取不到 4 位 → 放行（不判）**。
 * **不做出生年下限校验**。校验依赖节点现值 ⇒ 在写路径中**最后**执行。
 * @param {object} body 请求体
 * @param {string} [fallbackDeathDate] 节点现值 `death_date`（请求体未显式提供时用）
 * @returns {true} 通过
 * @throws {Error} `status=400`
 */
export function assertStartYearNotAfterDeath(body, fallbackDeathDate) {
  const b = body || {};
  const deathRaw = b.death_date !== undefined && b.death_date !== null ? b.death_date : fallbackDeathDate;
  const deathYear = leadingYear(deathRaw);
  if (!deathYear) return true;
  for (const item of normalizeResidencePlaces(b.residence_places)) {
    const y = item.start_year;
    if (!y) continue;
    if (Number(y) > Number(deathYear)) throw shapeError(startYearAfterDeathMessage(y, deathYear));
  }
  return true;
}

/**
 * 请求体是否**只**含出生地 / 居住地两项（C6 始祖放行判据）：
 * 显式提供（非 `undefined` / 非 `null`）的键必须非空且全在白名单内 —— 空 body → `false`（照旧 403）。
 */
export function isPlaceFieldsOnly(body) {
  const b = body || {};
  const keys = Object.keys(b).filter((k) => b[k] !== undefined && b[k] !== null);
  return keys.length > 0 && keys.every((k) => PERSON_PLACE_FIELDS.includes(k));
}
