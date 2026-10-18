#!/usr/bin/env node
/**
 * remap-palette-2026-10.mjs —— 一次性换色（2026-10 · ② 深青墨 / 青瓷纸）
 *
 * 口径：只做**颜色字面替换**，不碰结构 / 逻辑 / 几何 / 文案。
 *   日间旧族（暖纸喙）#F6F0E4 系  →  青瓷纸 #EDF1EA 系
 *   夜间旧族（暖褐黑）#211A14 系  →  深青墨 #1B2422 系
 *
 * 替换范围：frontend/src/** 的 .vue / .ts / .css / .json（含 src/pages.json）。
 * 覆盖写法：`#AABBCC` / `#aabbcc` / `rgba(R, G, B, a)` / `rgb(R, G, B)`
 * （后两者只在三元组**恰好等于**表内某色时替换，且保持 rgb/rgba 形式与 alpha 不动）。
 *
 * 硬约束（写在代码里，不靠人记）：
 *   · 两张映射表**不重叠**；唯一历史重叠 `#C4B4A0` 由**夜间表**裁决（它只出现在
 *     `html[data-theme='dark']` 段与描述暗色的注释里），见 CATALOG 注释。
 *   · `#8B7355`（文谱纸页题签 / 书口）**整色豁免**：纸类保浅，不随日间表改。
 *   · 语义色 `#E0675F` `#7FC08A` `#D9973F` `#9BD1A4` `#26301F` `#3E4A33`、
 *     纸类 `#F7F3E8` `#8B7355`、纯白 `#FFFFFF` 一律不动（PRESERVE）。
 *
 * 用法：
 *   node scripts/remap-palette-2026-10.mjs             # dry-run（默认）：逐色计数 + 未映射清单，不落盘
 *   node scripts/remap-palette-2026-10.mjs --report     # 同上（语义别名，显式要报告）
 *   node scripts/remap-palette-2026-10.mjs --write      # 落盘
 *   node scripts/remap-palette-2026-10.mjs --write --report
 *   node scripts/remap-palette-2026-10.mjs --no-rgb     # 只换 hex 字面，不动 rgb()/rgba()
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // frontend/
const SRC = join(ROOT, 'src');
const EXTS = new Set(['.vue', '.ts', '.css', '.json']);

/* 生成物：由 gen-td-dark-warm.py 负责（本脚本不得手改它，否则「自动生成」失守） */
const SKIP_FILES = new Set([join(SRC, 'styles', 'td-dark-warm.css')]);

/* ── 夜间表（暖褐黑 → 深青墨）────────────────────────────────────────────── */
const NIGHT = [
  ['#211A14', '#1B2422'], // 页面底
  ['#2A2219', '#232E2B'], // 卡面
  ['#241D16', '#1E2825'], // 次级容器 / 页头 / tabBar
  ['#332A20', '#2A3631'], // 卡面按下
  ['#2E251C', '#212B27'], // 次级容器按下
  ['#33231D', '#242E2A'], // 暖卡变体
  ['#3A3027', '#36453F'], // 边框 / 分割
  ['#4A3D31', '#42524B'], // 强边框
  ['#5E5142', '#4C5A54'], // 禁用文字
  ['#7A6234', '#5C6E63'], // 暗金
  ['#EDE3D6', '#DFE9E4'], // 主文字
  ['#B8A894', '#A5B6AE'], // 次文字
  ['#8A7A66', '#7A8B83'], // placeholder
  ['#6E5F4D', '#5F6E67'], // 三级文字
  ['#C4B4A0', '#B4C2BB'], // 弱文字（与日间表同键，见下）
  ['#C98850', '#D9A96B'], // 暖棕 / brand
  ['#D6A57A', '#E3BF8C'],
  ['#E5BE93', '#E8CFA6'],
  ['#D8A171', '#DDAF7A'],
  ['#D6A46A', '#D9B07C'],
];

/* ── 日间表（暖纸喙 → 青瓷纸）───────────────────────────────────────────── */
const LIGHT = [
  ['#F6F0E4', '#EDF1EA'], // 页面底
  ['#FFFDF8', '#FAFCF8'], // 卡面
  ['#FFFDF7', '#FAFCF8'],
  ['#F7EFE3', '#F0F5F1'],
  ['#FBF6EF', '#F1F6F2'],
  ['#F3E9DA', '#E9F0EA'], // banner 兜底底
  ['#E0D5C8', '#CFD8CE'], // 分割 / 描边
  ['#3E2723', '#2F3A33'], // 主文字
  ['#8B4513', '#4E6B57'], // brand / tabBar 选中
  ['#A1887F', '#6E7D70'], // 次文字
  // ['#8B7355', '#6E7D70'],  ← 纸类豁免（文谱题签 / 书口），故不入表
  // #C4B4A0 在日间表里本为 #A9B5AE，但与夜间表同键；实测全部命中都在 dark 段，
  // 由 NIGHT 裁决为 #B4C2BB（见脚本顶部口径）。日间不另设。
  ['#B5A594', '#8E9A93'],
  ['#F8F8F8', '#EEF1EF'], // pages.json 导航/背景 + 少量 H5 灰白
];

/* ── 第二遍 · 日间残留暖米族 → 青瓷冷族（仅追加，不改上表）─────────────────── */
const LIGHT2 = [
  ['#795548', '#6E7D70'], // 旧「古籍棕」中段文字
  ['#F3EAE0', '#EAF0EE'],
  ['#F0E8DE', '#E6EDE7'],
  ['#F5F0EA', '#EDF2EC'],
  ['#E3D3BE', '#D5DFD4'],
  ['#F8F0E5', '#EFF4EE'],
  ['#FBF8F4', '#F6FAF6'],
  ['#FBF8F5', '#F6FAF7'],
  ['#E0D6CB', '#D2DBD2'],
  ['#EFE2D2', '#E3EBE3'],
  ['#F9F2E7', '#EDF1EA'], // = rgb(249,242,231)；rgb()/rgba() 三元组由 RGB_RE 同步覆盖
];

/* ── 第二遍 · 夜间残留暖调 → 新夜族（仅追加）─────────────────────────────── */
const NIGHT2 = [
  ['#171210', '#141C1A'], // 最深底
  ['#1C1610', '#18211F'],
  ['#6E4420', '#3A4A44'], // 暗暖棕 → 青墨
  ['#8A5A2B', '#45564F'],
  ['#B47844', '#C49A60'],
  ['#B37523', '#C9A05F'],
  ['#CE8829', '#D9B06A'],
  ['#E8C9A6', '#E3CFA4'],
  ['#E1BD9E', '#E2CFA9'],
  ['#88562A', '#8C7B4F'],
];

/* 整色豁免：命中也不换（语义色 / 纸类 / 纯白） */
const PRESERVE = new Set(
  ['#E0675F', '#7FC08A', '#D9973F', '#9BD1A4', '#26301F', '#3E4A33', '#F7F3E8', '#8B7355', '#FFFFFF']
    .map((h) => h.toLowerCase()),
);

/* ── 建表：小写键 → 新值（夜间在夜间表内唯一；日间键与夜间不冲突，除 #C4B4A0 已裁决）── */
const MAP = new Map();
const META = new Map(); // key → { table, next }
for (const [oldHex, next] of NIGHT) {
  const k = oldHex.toLowerCase();
  if (PRESERVE.has(k)) throw new Error(`表内色被豁免冲突: ${oldHex}`);
  MAP.set(k, next);
  META.set(k, { table: 'night', next });
}
for (const [oldHex, next] of LIGHT) {
  const k = oldHex.toLowerCase();
  if (PRESERVE.has(k)) throw new Error(`表内色被豁免冲突: ${oldHex}`);
  if (MAP.has(k)) throw new Error(`两表重叠且未裁决: ${oldHex}`);
  MAP.set(k, next);
  META.set(k, { table: 'light', next });
}
/* 第二遍两表：只追加，撞键/撞豁免/新值回流成旧键一律报错（幂等的硬保证） */
for (const [table, list] of [['light2', LIGHT2], ['night2', NIGHT2]]) {
  for (const [oldHex, next] of list) {
    const k = oldHex.toLowerCase();
    if (PRESERVE.has(k)) throw new Error(`表内色被豁免冲突: ${oldHex}`);
    if (MAP.has(k)) throw new Error(`表键重复: ${oldHex}（${table}）`);
    MAP.set(k, next);
    META.set(k, { table, next });
  }
}
for (const [k, next] of MAP) {
  if (MAP.has(next.toLowerCase())) throw new Error(`新值是旧键，二次运行会改色（不幂等）: ${k} → ${next}`);
}

/* ── 扫描 ──────────────────────────────────────────────────────────────── */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p).toLowerCase())) out.push(p);
  }
  return out;
}

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

const argv = new Set(process.argv.slice(2));
const WRITE = argv.has('--write');
const WITH_RGB = !argv.has('--no-rgb');

const HEX_RE = /#([0-9a-fA-F]{6})(?![0-9a-fA-F])/g;
const RGB_RE = /(rgba?)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;

const counts = new Map(); // oldKey → { hex, rgb, files:Set }
const rgbCounts = new Map(); // oldKey → count
const unmapped = new Map(); // UPPER hex → { count, files:Set, darkHits }
const changedFiles = [];
let totalHex = 0;
let totalRgb = 0;

const files = walk(SRC).filter((f) => !SKIP_FILES.has(f));
for (const f of files) {
  let text = readFileSync(f, 'utf8');
  const before = text;
  const rel = relative(ROOT, f);

  // 统计：未映射色（含"是否出现在 dark 段"的粗判）
  const darkSpans = [];
  {
    const re = /html\[data-theme=['"]dark['"]\][^{]*\{[^}]*\}/g;
    let m;
    while ((m = re.exec(text))) darkSpans.push([m.index, m.index + m[0].length]);
  }
  let m;
  HEX_RE.lastIndex = 0;
  while ((m = HEX_RE.exec(text))) {
    const up = m[1].toUpperCase();
    const k = '#' + up.toLowerCase();
    if (MAP.has(k) || PRESERVE.has(k)) continue;
    const inDark = darkSpans.some(([a, b]) => m.index >= a && m.index <= b);
    const rec = unmapped.get(up) ?? { count: 0, files: new Set(), darkHits: 0 };
    rec.count += 1;
    rec.files.add(rel);
    if (inDark) rec.darkHits += 1;
    unmapped.set(up, rec);
  }

  // hex 替换
  text = text.replace(HEX_RE, (full, hex) => {
    const k = '#' + hex.toLowerCase();
    const next = MAP.get(k);
    if (!next) return full;
    totalHex += 1;
    const rec = counts.get(k) ?? { hex: '#' + hex.toUpperCase(), hexCount: 0, rgb: 0, files: new Set() };
    rec.hexCount += 1;
    rec.files.add(rel);
    counts.set(k, rec);
    return next;
  });

  // rgb()/rgba() 三元组替换（只认表内色的精确三元组）
  if (WITH_RGB) {
    text = text.replace(RGB_RE, (full, fn, r, g, b) => {
      const hex = rgbToHex(+r, +g, +b);
      const k = hex.toLowerCase();
      const next = MAP.get(k);
      if (!next) return full;
      totalRgb += 1;
      const rec = counts.get(k) ?? { hex: hex, hexCount: 0, rgb: 0, files: new Set() };
      rec.rgb += 1;
      rec.files.add(rel);
      counts.set(k, rec);
      const [nr, ng, nb] = hexToRgb(next);
      return `${fn}(${nr}, ${ng}, ${nb}`;
    });
  }

  if (text !== before) {
    changedFiles.push(rel);
    if (WRITE) writeFileSync(f, text, 'utf8');
  }
}

/* ── 报告 ──────────────────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padEnd(n);
const order = [
  ...NIGHT.map(([o]) => o),
  ...LIGHT.map(([o]) => o),
  ...LIGHT2.map(([o]) => o),
  ...NIGHT2.map(([o]) => o),
];

console.log(`mode: ${WRITE ? 'WRITE' : 'DRY-RUN'}  files scanned: ${files.length}  files touched: ${changedFiles.length}`);
console.log(`hex replacements: ${totalHex}   rgb()/rgba() replacements: ${totalRgb}\n`);
console.log(pad('old', 10) + pad('new', 10) + pad('table', 7) + pad('hex', 6) + pad('rgb', 6) + 'files');
console.log('-'.repeat(52));
let sumHex = 0;
let sumRgb = 0;
for (const oldHex of order) {
  const k = oldHex.toLowerCase();
  const rec = counts.get(k);
  const meta = META.get(k);
  if (!rec) {
    console.log(pad(oldHex, 10) + pad(meta.next, 10) + pad(meta.table, 7) + pad(0, 6) + pad(0, 6) + '0  <-- 未命中');
    continue;
  }
  sumHex += rec.hexCount;
  sumRgb += rec.rgb;
  console.log(
    pad(oldHex, 10) + pad(meta.next, 10) + pad(meta.table, 7) + pad(rec.hexCount, 6) + pad(rec.rgb, 6) + String(rec.files.size),
  );
}
console.log('-'.repeat(52));
console.log(`sum hex=${sumHex} rgb=${sumRgb}  (changed files ${changedFiles.length})`);

if (changedFiles.length) {
  console.log('\ntouched files:');
  for (const f of changedFiles) console.log('  ' + f);
}

/* 未映射清单：按亮度分成「暗色系」「浅色系」两段，便于判断是否漏网 */
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const ch = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const unmappedArr = [...unmapped.entries()].map(([hex, v]) => ({ hex, ...v, L: lum(hex) }));
const darkish = unmappedArr.filter((u) => u.L < 0.22).sort((a, b) => b.count - a.count);
const lightish = unmappedArr.filter((u) => u.L > 0.62).sort((a, b) => b.count - a.count);
const mid = unmappedArr.filter((u) => u.L >= 0.22 && u.L <= 0.62).sort((a, b) => b.count - a.count);

const show = (title, arr, limit = 40) => {
  console.log(`\n${title} (${arr.length})`);
  for (const u of arr.slice(0, limit)) {
    console.log(
      `  #${u.hex}  x${String(u.count).padEnd(4)} files=${String(u.files.size).padEnd(3)} darkHits=${u.darkHits}  L=${u.L.toFixed(2)}`,
    );
  }
  if (arr.length > limit) console.log(`  … ${arr.length - limit} more`);
};
show('未映射 · 暗色系 (L<0.22)', darkish);
show('未映射 · 中间调 (0.22≤L≤0.62)', mid);
show('未映射 · 浅色系 (L>0.62)', lightish);
console.log(`\n未映射合计 ${unmappedArr.length} 个色值 / ${[...unmapped.values()].reduce((a, b) => a + b.count, 0)} 处命中`);
if (!WRITE) console.log('\n(dry-run：未落盘；加 --write 才写)');
