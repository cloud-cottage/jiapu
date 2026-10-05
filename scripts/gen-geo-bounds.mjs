#!/usr/bin/env node
/**
 * 由**唯一真源** `config/geo-bounds/<adcode>.json`（细档）与 `config/geo-bounds/coarse/<adcode>.json`
 * （粗档 · LOD 第二档）生成前端随包产物
 * `frontend/src/business/geo/bounds/<adcode>.json` 与 `frontend/src/business/geo/bounds/coarse/<adcode>.json`
 * （**deflateRaw + base64**，一码一分片，**两档同形状**）。
 *
 * 为什么压缩：小程序主包上限 2 MiB（`docs/geo-origin.spec.md` §13-11-2），边界几何是纯死重增长源；
 *   `src/business/**` 走 bundler（压缩后并入 JS）⇒ 数据产物必须放源码目录。
 *   形状与生成口径承 `scripts/gen-geo-divisions.mjs`（同族「真源 → 紧凑 + deflateRaw + base64 产物」）。
 *
 * 产物形状（**逐字冻接口径**）：载荷 = `base64(deflateRaw(UTF-8 明文 JSON))` **字符串**
 *   （文件内容 = 该字符串的 JSON 字面量，即 `"<base64>"`；**不含**版本字段包装）。
 *   还原入口 = **既有** `frontend/src/business/geo/inflate.ts` 的 `inflateBase64ToUtf8`
 *   （**不得另写第二套解压器**）—— 本脚本用 `frontend/node_modules/.bin/esbuild` 就地转译后 import。
 *
 * 口径（勿造第二套真源）：
 *   · 只有 `config/geo-bounds/<adcode>.json`（细档）与 `config/geo-bounds/coarse/<adcode>.json`（粗档）
 *     是人工 / 构建维护的真源；产物是**生成物**，禁止手改。
 *   · 两档 **adcode 集合完全一致**（`collectAdcodes()` 的收集规则），且粗档**逐 feature 与细档一一对应**
 *     （同数量 / 同顺序 / 同 `properties.adcode`）。
 *   · **幂等**：真源不变 ⇒ 产物字节不变（`deflateRawSync(level=9)` 输出确定）。
 *   · `--check` 只校验不写，**覆盖两档**：
 *       ① 逐 adcode 校验产物可还原且与真源逐字段一致；
 *       ② 输出**缺失清单**（真源有、产物无；或按收集规则应有而无）⇒ 缺失 / 不一致时 **exit 非 0**；
 *       ③ 两档 adcode 集合互相一致（细档 ≡ 粗档）。
 *
 * 用法：
 *   node scripts/gen-geo-bounds.mjs            # 生成 / 更新两档全部产物
 *   node scripts/gen-geo-bounds.mjs --check    # 只校验（不写盘）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectAdcodes, TRUTH_DIR, COARSE_SUBDIR } from './build-geo-bounds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/** 前端产物目录（随包；`src/business/**` 走 bundler） */
export const PRODUCT_DIR = path.join(REPO, 'frontend', 'src', 'business', 'geo', 'bounds');
/** 前端**粗档**产物目录（LOD 第二档；同形状） */
export const PRODUCT_COARSE_DIR = path.join(PRODUCT_DIR, COARSE_SUBDIR);
/** 粗档真源目录 */
export const COARSE_TRUTH_DIR = path.join(TRUTH_DIR, COARSE_SUBDIR);

/** 两档（细 / 粗）；adcode 集合必须完全一致 */
export const TIERS = [
  { key: 'fine', label: '细档', truthDir: TRUTH_DIR, productDir: PRODUCT_DIR },
  { key: 'coarse', label: '粗档', truthDir: COARSE_TRUTH_DIR, productDir: PRODUCT_COARSE_DIR },
];

const INFLATE_TS = path.join(REPO, 'frontend', 'src', 'business', 'geo', 'inflate.ts');
const ESBUILD = path.join(REPO, 'frontend', 'node_modules', '.bin', 'esbuild');

/** 真源目录里的 adcode（升序；非 `.json` / 子目录忽略） */
export function truthAdcodes(dir = TRUTH_DIR) {
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -'.json'.length))
        .sort()
    : [];
}

/** 产物目录里的 adcode（升序） */
export function productAdcodes(dir = PRODUCT_DIR) {
  return truthAdcodes(dir);
}

/** 真源 GeoJSON → 产物文本（`deflateRaw(level=9)` → base64 → JSON 字面量） */
export function renderProduct(truth) {
  const plain = JSON.stringify(truth);
  const g = zlib.deflateRawSync(Buffer.from(plain, 'utf8'), { level: 9 }).toString('base64');
  return `${JSON.stringify(g)}\n`;
}

/** 复用既有 inflate.ts：esbuild 转译 inflate.ts → 临时 ESM → import（进程内缓存一次） */
let _inflate = null;
async function getInflate() {
  if (_inflate) return _inflate;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-bounds-inflate-'));
  execFileSync(
    ESBUILD,
    [INFLATE_TS, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${path.join(tmp, 'inflate.mjs')}`],
    { cwd: REPO, stdio: 'pipe' },
  );
  const mod = await import(pathToFileURL(path.join(tmp, 'inflate.mjs')).href);
  _inflate = mod.inflateBase64ToUtf8;
  return _inflate;
}

/** 产物文本 → 真源 GeoJSON（**唯一还原入口** reuse `inflateBase64ToUtf8`） */
export async function decodeProduct(text) {
  const inflate = await getInflate();
  const parsed = JSON.parse(text);
  const b64 = typeof parsed === 'string' ? parsed : parsed?.g;
  if (typeof b64 !== 'string') throw new Error(`产物形状不合契约（期望 deflateRaw+base64 字符串）：${String(text).slice(0, 48)}…`);
  return JSON.parse(inflate(b64));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const check = process.argv.slice(2).includes('--check');
  const truth = truthAdcodes(TRUTH_DIR);
  if (!truth.length) {
    console.error(`❌ 真源目录为空：${TRUTH_DIR}\n   请先运行 node scripts/build-geo-bounds.mjs`);
    process.exit(1);
  }
  const expected = collectAdcodes();

  // ══ 生成（不写 --check） ══
  if (!check) {
    let bad = false;
    for (const tier of TIERS) {
      const adcodes = truthAdcodes(tier.truthDir);
      let wrote = 0;
      for (const adcode of adcodes) {
        const truthText = fs.readFileSync(path.join(tier.truthDir, `${adcode}.json`), 'utf8');
        const want = renderProduct(JSON.parse(truthText));
        const file = path.join(tier.productDir, `${adcode}.json`);
        const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        if (cur === want) continue;
        fs.mkdirSync(tier.productDir, { recursive: true });
        fs.writeFileSync(file, want, 'utf8');
        wrote += 1;
      }
      const missingTruth = expected.filter((c) => !adcodes.includes(c));
      if (missingTruth.length) {
        console.error(`❌ [${tier.label}] 按收集规则应有而无真源（先跑 build-geo-bounds.mjs）：${missingTruth.join(', ')}`);
        bad = true;
        continue;
      }
      const staleProduct = productAdcodes(tier.productDir).filter((c) => !adcodes.includes(c));
      if (staleProduct.length) console.error(`⚠️  [${tier.label}] 产物无对应真源（陈旧，未自动删除）：${staleProduct.join(', ')}`);
      console.log(`✅ [${tier.label}] 生成 ${adcodes.length} 份前端产物 → ${tier.productDir}（本次改写 ${wrote} 份）`);
    }
    if (bad) process.exit(1);
    const fineSet = truthAdcodes(TRUTH_DIR);
    const coarseSet = truthAdcodes(COARSE_TRUTH_DIR);
    if (fineSet.join(',') !== coarseSet.join(',')) {
      console.error(`❌ 两档 adcode 集合不一致：细档 ${fineSet.length} 个 / 粗档 ${coarseSet.length} 个`);
      process.exit(1);
    }
    console.log(`✅ 两档 adcode 集合完全一致（细档 ${fineSet.length} 个 ≡ 粗档 ${coarseSet.length} 个）`);
    process.exit(0);
  }

  // ---- --check：只校验不写（覆盖两档）----
  const bad = [];
  const fineSet = truthAdcodes(TRUTH_DIR);
  const coarseSet = truthAdcodes(COARSE_TRUTH_DIR);
  if (fineSet.join(',') !== coarseSet.join(',')) {
    console.error(`❌ 两档 adcode 集合不一致：细档 [${fineSet.join(', ')}] / 粗档 [${coarseSet.join(', ')}]`);
    bad.push('tier-set');
  }
  for (const tier of TIERS) {
    const adcodes = truthAdcodes(tier.truthDir);
    const product = productAdcodes(tier.productDir);
    const missingProduct = adcodes.filter((c) => !product.includes(c));
    const missingTruth = expected.filter((c) => !adcodes.includes(c));
    const staleProduct = product.filter((c) => !adcodes.includes(c));
    const tierBad = [];
    for (const adcode of adcodes) {
      const truthText = fs.readFileSync(path.join(tier.truthDir, `${adcode}.json`), 'utf8');
      const file = path.join(tier.productDir, `${adcode}.json`);
      if (!fs.existsSync(file)) continue; // 已进 missingProduct
      let got;
      try {
        got = await decodeProduct(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        console.error(`❌ [${tier.label}] 产物无法还原：${file}（${e.message}）`);
        tierBad.push(adcode);
        continue;
      }
      if (JSON.stringify(got) !== JSON.stringify(JSON.parse(truthText))) {
        console.error(`❌ [${tier.label}] 产物与真源不一致：${file}`);
        tierBad.push(adcode);
      }
    }
    if (missingProduct.length) console.error(`❌ [${tier.label}] 真源有、产物无（缺失清单）：${missingProduct.join(', ')}`);
    if (missingTruth.length) console.error(`❌ [${tier.label}] 收集规则应有而无真源（缺失清单）：${missingTruth.join(', ')}`);
    if (staleProduct.length) console.error(`❌ [${tier.label}] 产物无对应真源（陈旧清单）：${staleProduct.join(', ')}`);
    let truthBytes = 0;
    let productBytes = 0;
    for (const adcode of adcodes) {
      if (fs.existsSync(path.join(tier.truthDir, `${adcode}.json`))) truthBytes += fs.statSync(path.join(tier.truthDir, `${adcode}.json`)).size;
      if (fs.existsSync(path.join(tier.productDir, `${adcode}.json`))) productBytes += fs.statSync(path.join(tier.productDir, `${adcode}.json`)).size;
    }
    if (tierBad.length) bad.push(`${tier.key}:${tierBad.length}`);
    console.log(
      `✅ [${tier.label}] 真源（唯一真源，不参与比对、只作基准）：${tier.truthDir}（${adcodes.length} 分片，合计 ${truthBytes} 字节）`,
    );
    console.log(
      `✅ [${tier.label}] 逐 adcode 一致（${adcodes.length} 份）：产物 = deflateRaw + base64，可经 inflateBase64ToUtf8 还原，与真源逐字段一致`,
    );
    console.log(
      `✅ [${tier.label}] 缺失清单为空：真源有产物无 ${missingProduct.length}；收集规则应有而无 ${missingTruth.length}；陈旧产物 ${staleProduct.length}（收集规则共 ${expected.length} 个码）`,
    );
    console.log(`— [${tier.label}] 产物合计 ${productBytes} 字节（${tier.productDir}）`);
  }
  if (bad.length) {
    console.error('   请运行 node scripts/gen-geo-bounds.mjs');
    process.exit(1);
  }
  process.exit(0);
}
