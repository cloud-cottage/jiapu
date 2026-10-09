#!/usr/bin/env node
/**
 * R2 内部标识符改名：旧前缀（jiazu ＋ 下划线）→ 新前缀（jiapu ＋ 下划线）
 * 文件：scripts/rename-jiazu-to-jiapu-2026-10.mjs
 *
 * 本单范围：
 *   ① 内容替换：把代码 / 脚本里的「jiazu 前缀＋下划线」标识符整体改为「jiapu 前缀＋下划线」。
 *      扫描面 = cloudfunctions/**（排除 deploy 产物）、scripts/**、auth-server/**（若有）、
 *               frontend/src/**（若有），外加根 package.json 的 name 字段。
 *   ② 文件名替换：migrate-output/collections/ 下以「jiazu 前缀＋下划线」开头的 *.json
 *      改为同名 jiapu 前缀（**内容不动** —— 真源集合内容不含该前缀）。
 *
 * 用法：
 *   node scripts/rename-jiazu-to-jiapu-2026-10.mjs                # dry-run（默认，不落盘）
 *   node scripts/rename-jiazu-to-jiapu-2026-10.mjs --apply        # 落盘（内容 + 文件名）
 *   node scripts/rename-jiazu-to-jiapu-2026-10.mjs --root <dir>   # 指定仓库根（副本演练用）
 *
 * 设计要点：
 *   - 被替换字面量用字符串拼接构造（'jiazu' + '_'），使**脚本自身不含该字面量**。
 *     否则：--apply 会顺手改写脚本自身；且改完之后对 scripts/ 重新检索「jiazu 前缀＋下划线」
 *     仍会命中本文件，导致「命中 0」判据永远无法达成。
 *   - 默认 dry-run、仅 --apply 写盘 —— 遵循本仓脚本惯例。
 *   - 不跟随软链（副本演练里 node_modules 常以软链挂入）；跳过
 *     node_modules / .git / deploy / dist / __pycache__ / unpackage。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SELF_BASENAME = path.basename(__filename);

// 旧 / 新「前缀 + 下划线」。拼接构造，脚本自身不含被替换字面量。
const OLD = 'jiazu' + '_';
const NEW = 'jiapu' + '_';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ri = argv.indexOf('--root');
const ROOT = ri >= 0 && argv[ri + 1]
  ? path.resolve(argv[ri + 1])
  : path.resolve(path.dirname(__filename), '..');

const SCAN_DIRS = ['cloudfunctions', 'scripts', 'auth-server', 'frontend/src'];
const EXCLUDE_DIRNAMES = new Set(['node_modules', '.git', 'deploy', 'dist', '__pycache__', 'unpackage']);
const TEXT_EXT = new Set(['.js', '.cjs', '.mjs', '.json', '.ts', '.vue']);

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;              // 不跟随软链
    if (e.isDirectory()) {
      if (EXCLUDE_DIRNAMES.has(e.name)) continue;
      walk(p, out);
    } else if (e.isFile()) {
      if (e.name === SELF_BASENAME) continue;       // 跳过自身
      if (TEXT_EXT.has(path.extname(e.name))) out.push(p);
    }
  }
}

const targets = [];
for (const d of SCAN_DIRS) {
  const abs = path.join(ROOT, d);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walk(abs, targets);
}
const rootPkg = path.join(ROOT, 'package.json');
if (fs.existsSync(rootPkg)) targets.push(rootPkg);
const frontendPkg = path.join(ROOT, 'frontend', 'package.json');
if (fs.existsSync(frontendPkg)) targets.push(frontendPkg);
// 「name 字段特例」适用面（沿用同一段特例逻辑，不新增第二个特例函数）
const nameFieldPkgs = new Set([rootPkg, frontendPkg].map((p) => path.resolve(p)));

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tokenRe = new RegExp(escRe(OLD) + '[A-Za-z0-9_]*', 'g');

// ---- ① 内容替换 ----
const perFile = [];        // [{ rel, count }]
const tokens = new Map();  // 完整标识符 -> 出现次数
const special = [];        // 非「下划线标识符」但属本单命中面的项
let totalOcc = 0;

for (const abs of [...new Set(targets)]) {
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
  const rel = path.relative(ROOT, abs);
  let count = src.split(OLD).length - 1;

  // 特殊：package.json 的 name 字段（无下划线，但本单命中面明确点名）
  if (nameFieldPkgs.has(path.resolve(abs)) && /"name"\s*:\s*"jiazu"/.test(src)) {
    count += 1;
    special.push(`${rel}  →  "name": "jiazu" 改 "name": "jiapu"`);
    if (APPLY) src = src.replace(/"name"(\s*:\s*)"jiazu"/, '"name"$1"jiapu"');
  }

  if (count === 0) continue;
  tokenRe.lastIndex = 0;
  let m;
  while ((m = tokenRe.exec(src))) tokens.set(m[0], (tokens.get(m[0]) || 0) + 1);
  perFile.push({ rel, count });
  totalOcc += count;
  if (APPLY) fs.writeFileSync(abs, src.split(OLD).join(NEW));
}

// ---- ② 集合文件名重命名 ----
const colsDir = path.join(ROOT, 'migrate-output', 'collections');
const renames = [];
if (fs.existsSync(colsDir) && fs.statSync(colsDir).isDirectory()) {
  for (const name of fs.readdirSync(colsDir).sort()) {
    if (!name.includes(OLD)) continue;
    const fromAbs = path.join(colsDir, name);
    if (!fs.statSync(fromAbs).isFile()) continue;
    const toAbs = path.join(colsDir, name.split(OLD).join(NEW));
    renames.push({ from: path.relative(ROOT, fromAbs), to: path.relative(ROOT, toAbs) });
  }
}
if (APPLY) {
  for (const r of renames) {
    const fromAbs = path.join(ROOT, r.from);
    const toAbs = path.join(ROOT, r.to);
    if (fs.existsSync(toAbs)) {
      console.error(`✖ 目标文件已存在，拒绝覆盖：${r.to}`);
      process.exit(1);
    }
    fs.renameSync(fromAbs, toAbs);
  }
}

// ---- 报告 ----
const mode = APPLY ? 'APPLY（已落盘）' : 'DRY-RUN（未落盘）';
console.log(`=== R2 改名演练 ${mode} ===`);
console.log(`ROOT        = ${ROOT}`);
console.log(`替换        = ${OLD}  →  ${NEW}`);
console.log('');
console.log(`— ① 内容替换：${perFile.length} 个文件 / 共 ${totalOcc} 处 —`);
for (const f of perFile.sort((a, b) => b.count - a.count || a.rel.localeCompare(b.rel))) {
  console.log(`  ${String(f.count).padStart(4)}  ${f.rel}`);
}
console.log('');
console.log(`— 替换串去重清单（${tokens.size} 种完整标识符，含出现次数）—`);
for (const [t, c] of [...tokens.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  console.log(`  ${String(c).padStart(4)}  ${t}`);
}
if (special.length) {
  console.log('');
  console.log(`— 特殊命中（非「下划线标识符」，本单命中面点名项）—`);
  for (const s of special) console.log(`  ${s}`);
}
console.log('');
console.log(`— ② 集合文件名改名：${renames.length} 个 —`);
for (const r of renames) console.log(`  ${r.from}  →  ${r.to}`);
console.log('');
console.log(
  `合计：内容替换 ${totalOcc} 处 / ${perFile.length} 文件；文件改名 ${renames.length} 个` +
  `${APPLY ? '（已执行）' : '（dry-run 未执行）'}。`,
);
