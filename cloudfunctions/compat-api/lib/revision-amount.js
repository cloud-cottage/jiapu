/**
 * 修谱域 · 金额繁体汉字大写（**纯函数，零 IO**）—— `lib/revision-amount.js`
 *
 * 用途：`GET /revisions` 出参里 `donations[].amount_text` = 捐输金额的**繁体汉字大写**（尾缀固定「元」）。
 * 字形集逐字（冻结）：`零壹貳參肆伍陸柒捌玖拾佰仟萬` —— **不含** `億`（故 ≥ 10^8 以重复 `萬` 分组表达）。
 *
 * 样例（冻结契约）：`0→零元`、`10→壹拾元`、`100→壹佰元`、`1234→壹仟貳佰參拾肆元`、`10000→壹萬元`。
 */

/** 数字字形（下标 = 0..9；**繁体大写**） */
const DIGITS = '零壹貳參肆伍陸柒捌玖';
/** 组内（万以下）位权：下标 = 位次（0=个 1=拾 2=佰 3=仟） */
const UNITS = ['', '拾', '佰', '仟'];

/**
 * 0..9999 的汉字大写（无尾缀）。零的处理：连续零折叠为一个「零」，且**只在非零位之后、且其后还有非零位**时补零。
 * 例：1001 → 壹仟零壹；1234 → 壹仟貳佰參拾肆；10 → 壹拾；100 → 壹佰。
 */
function groupOf4(d) {
  const s = String(d).padStart(4, '0');
  let out = '';
  let zeroPending = false;
  for (let i = 0; i < 4; i += 1) {
    const v = Number(s[i]);
    if (v === 0) {
      if (out) zeroPending = true;
      continue;
    }
    if (zeroPending) {
      out += '零';
      zeroPending = false;
    }
    out += DIGITS[v] + UNITS[3 - i];
  }
  return out;
}

/** ≥1 的汉字大写（按 4 位一组、每组尾缀「萬」递归；本域金额远小于 10^8，不引入「億」） */
function core(n) {
  if (n < 10000) return groupOf4(n);
  const high = Math.floor(n / 10000);
  const low = n % 10000;
  let out = `${core(high)}萬`;
  if (low) out += (low < 1000 ? '零' : '') + groupOf4(low);
  return out;
}

/**
 * 金额 → 繁体汉字大写（尾缀固定「元」）。
 * @param {number} value 非负整数（元）
 * @returns {string} 例：`1234` → `壹仟貳佰參拾肆元`
 * @throws {Error} 非非负整数 / 非有限值 → 抛错（调用方应已在入参处校验为正整数）
 */
export function amountToChineseUpper(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`金额必须为非负整数：${value}`);
  }
  if (n === 0) return '零元';
  return `${core(n)}元`;
}

export default amountToChineseUpper;
