#!/usr/bin/env node
/**
 * 生成 `cloudfunctions/compat-api/lib/s2t-data.js` —— 后端繁体校验表（简体差异字 → 繁体差异字）。
 *
 * **单一真源 = `frontend/src/business/traditional.ts` 的 `S2T_SOURCE` / `S2T_TARGET`**（不得手抄）：
 * 本脚本只做「读前端表 → 逐字码点对齐 → 写出后端副本」三件事，运行期零依赖零联网。
 *
 * 用法（仓根执行）：
 *   node scripts/gen-s2t-backend.mjs           # 生成 / 覆盖 lib/s2t-data.js（幂等：重复运行逐字节相同）
 *   node scripts/gen-s2t-backend.mjs --check   # 只比对，不一致 ⇒ exit 1（CI / 自检用，不写盘）
 *
 * 口径：前端表内含非 BMP 目标字 ⇒ **必须按码点对齐**（`Array.from`），按 UTF-16 码元配对会整表串位。
 * 本脚本在写出前断言「源 / 目标码点数等长」，不等长直接抛错（绝不写半成品）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(__dirname);
const SRC = path.join(REPO, 'frontend', 'src', 'business', 'traditional.ts');
const OUT = path.join(REPO, 'cloudfunctions', 'compat-api', 'lib', 's2t-data.js');

/** 从 TypeScript 源码抽出 `const <name> = '…' + '…';` 的字符串字面量（拼接全部单引号片段） */
function extractLiteral(text, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?);\\n`, 'm');
  const m = text.match(re);
  if (!m) throw new Error(`在 ${SRC} 中找不到 ${name} 字面量`);
  const parts = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]);
  if (!parts.length) throw new Error(`${name} 未解析到任何字符串片段`);
  return parts.join('');
}

const src = fs.readFileSync(SRC, 'utf8');
const SOURCE = extractLiteral(src, 'S2T_SOURCE');
const TARGET = extractLiteral(src, 'S2T_TARGET');

const sourceCps = Array.from(SOURCE);
const targetCps = Array.from(TARGET);
if (sourceCps.length !== targetCps.length) {
  throw new Error(`源/目标码点数不等长：${sourceCps.length} vs ${targetCps.length}（禁止写出半成品）`);
}
let diff = 0;
for (let i = 0; i < sourceCps.length; i += 1) if (sourceCps[i] !== targetCps[i]) diff += 1;

const body = `/**
 * 后端繁体校验表（简体差异字 → 繁体差异字）—— **本文件由 \`scripts/gen-s2t-backend.mjs\` 生成，请勿手改**。
 *
 * 单一真源 = \`frontend/src/business/traditional.ts\` 的 \`S2T_SOURCE\` / \`S2T_TARGET\`（OpenCC 配置 \`s2t\`，
 * 逐字 1:1，已按**码点**对齐）。复算一行（仓根执行）：
 *   node scripts/gen-s2t-backend.mjs
 * 自检（不写盘，不一致 exit 1）：
 *   node scripts/gen-s2t-backend.mjs --check
 *
 * 判定口径（lib/revision.js 运行时建表）：逐码点遍历，\`char\` 在表中且 \`s2t[char] !== char\` ⇒ 简体字。
 * 源 / 目标码点数 = ${sourceCps.length}（差异字 ${diff} 个）。
 */

export const S2T_SOURCE = ${JSON.stringify(SOURCE)};

export const S2T_TARGET = ${JSON.stringify(TARGET)};

export const S2T_TABLE_SIZE = ${sourceCps.length};
`;

const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  let current = '';
  try {
    current = fs.readFileSync(OUT, 'utf8');
  } catch {
    console.error(`✖ --check：后端表不存在或不可读：${OUT}`);
    process.exit(1);
  }
  if (current !== body) {
    console.error('✖ --check：lib/s2t-data.js 与前端表不一致（请运行 node scripts/gen-s2t-backend.mjs 重算）');
    process.exit(1);
  }
  console.log(`✓ --check：lib/s2t-data.js 与前端传统表一致（差异字 ${diff} 个）。`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body);
console.log(`✓ 已生成 lib/s2t-data.js（源/目标码点 ${sourceCps.length}，差异字 ${diff} 个）。`);
