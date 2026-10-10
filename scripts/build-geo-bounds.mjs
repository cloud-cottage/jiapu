#!/usr/bin/env node
/**
 * 构建 `config/geo-bounds/<adcode>.json`（迁徙地图 · 边界数据**真源** · 按需增量内置）
 *
 * 用途：把 DataV 行政区划边界（`https://geo.datav.aliyun.com/areas_v3/bound/<adcode>_full.json`）
 *       抓取、**瘦身**、**按需分片**落成 jiazu 的边界真源。真源进 Git（受版本管理），
 *       本脚本只是它的可复现构建过程（运行期不读它；运行期零请求 —— Q1=B）。
 *
 * 与 `scripts/build-geo-divisions.mjs` 的分工：
 *   · 后者产出「码表」（谁叫什么、隶属谁）；本脚本产出「几何」（谁画成什么形状）。
 *   · 两者都**只读**上游、**只写**自己的真源（`config/geo-bounds/` 是**新增目录**，
 *     `config/` 下任何既有文件**一字不改**）。
 *
 * 分片语义（同 DataV `areas_v3/bound/<adcode>_full.json`）：
 *   · 每个文件 = **一个 adcode 的「全子级」边界 FeatureCollection**（省级=其地级 / 地级=其县级）。
 *   · 叶级 adcode（县/区，`_full.json` 返回 404）**回退**抓 `<adcode>.json`（= 该码自身的边界单要素），
 *     否则「起点 / 节点画到县级」会没有几何可画。
 *
 * 瘦身口径（**只保留展示必需**；`docs/migration-map.spec.md` §2）：
 *   · `properties` 只留 `adcode` / `name` / `centroid`（`center` 保留 = 可用锚点）；
 *   · 坐标精度降到 **4 位小数**（`COORD_DECIMALS`）；
 *   · **剔除面积过小的环 / 岛屿**（shoelace 面积 < `SLIM_AREA_THRESHOLD` 平方度）；
 *   · 相邻重复点 / 首尾闭合重复点去重；几何统一归一为 `MultiPolygon`。
 *     阈值标定（前后实测对比）见 `--analyze`（只抓不算写），README / 派单报告另附。
 *
 * 用法：
 *   node scripts/build-geo-bounds.mjs                 # 联网抓取 → 写 config/geo-bounds/
 *   node scripts/build-geo-bounds.mjs --analyze       # 只抓取 + 打印瘦身阈值对比表（不写盘）
 *   node scripts/build-geo-bounds.mjs --out /tmp/x    # 写别处（演练；收集规则不变）
 *   GEO_BOUNDS_SRC_DIR=/tmp/geo-bounds-src node scripts/build-geo-bounds.mjs   # 用本地已下载源（离线）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/** 边界真源目录（**新增目录**；进 Git） */
export const TRUTH_DIR = path.join(REPO, 'config', 'geo-bounds');
const TREE_META = path.join(REPO, 'config', 'tree-meta.json');
/** 数据真源根（`migrate-output/`）：本地已归档，可用 `COMPAT_REAL_OUT` 覆盖指向归档 / 副本 */
const REAL_OUT = process.env.COMPAT_REAL_OUT || path.join(REPO, 'migrate-output');
const TREES_DIR = path.join(REAL_OUT, 'trees');

const DATAV = 'https://geo.datav.aliyun.com/areas_v3/bound';
/** 合法 `origin_code` 形状（与 `lib/geo.js` / `build-geo-divisions.mjs` 的 `CODE_RE` 逐字一致） */
const CODE_RE = /^\d{6}$/;

/** 坐标精度（位小数） */
export const COORD_DECIMALS = 4;
/** 环 / 岛屿剔除阈值（shoelace 面积，平方度）；≈ 0.1 km²（标定见 `--analyze` 输出） */
export const SLIM_AREA_THRESHOLD = 1e-5;

const round = (n) => Number(Number(n).toFixed(COORD_DECIMALS));

/** 环面积（shoelace，平方度；返回绝对值） */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a / 2);
}

/** 环去重（相邻重复点 + 首尾闭合重复点） */
function dedupeRing(ring) {
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

/** 坐标环 → 4 位小数 + 去重 */
function slimRing(ring) {
  return dedupeRing((Array.isArray(ring) ? ring : []).map((p) => [round(p[0]), round(p[1])]));
}

/**
 * 单要素瘦身：`properties` 瘦身 + 坐标降精度 + 剔小环 + 归一 `MultiPolygon`。
 * 返回 `{ feature, dropped }`（`dropped` = 被剔除的外环 / 孔洞数，供标定统计）。
 */
export function slimFeature(feature, areaThreshold = SLIM_AREA_THRESHOLD) {
  const props = feature?.properties || {};
  const slim = { adcode: props.adcode, name: props.name };
  if (Array.isArray(props.centroid)) slim.centroid = [round(props.centroid[0]), round(props.centroid[1])];
  if (Array.isArray(props.center)) slim.center = [round(props.center[0]), round(props.center[1])];

  const geom = feature?.geometry || {};
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  const out = [];
  let dropped = 0;
  for (const poly of Array.isArray(polys) ? polys : []) {
    if (!Array.isArray(poly) || !Array.isArray(poly[0])) continue;
    const outer = slimRing(poly[0]);
    if (!outer.length) continue;
    if (areaThreshold > 0 && ringArea(outer) < areaThreshold) {
      dropped += 1; // 过小岛屿：整块剔除
      continue;
    }
    const rings = [outer];
    for (let k = 1; k < poly.length; k++) {
      const hole = slimRing(poly[k]);
      if (!hole.length) continue;
      if (areaThreshold > 0 && ringArea(hole) < areaThreshold) {
        dropped += 1; // 过小孔洞
        continue;
      }
      rings.push(hole);
    }
    out.push(rings);
  }
  return { feature: { type: 'Feature', properties: slim, geometry: { type: 'MultiPolygon', coordinates: out } }, dropped };
}

/** FeatureCollection 瘦身（供生成端与标定复用）；**剔除 adcode 非 6 位的要素**（如 `100000_JD` 九段线） */
export function slimCollection(fc, areaThreshold = SLIM_AREA_THRESHOLD) {
  let dropped = 0;
  let pruned = 0;
  const features = [];
  for (const f of fc?.features || []) {
    if (!CODE_RE.test(String(f?.properties?.adcode))) {
      pruned += 1; // 非 6 位码要素（DataV 的 `100000_JD`）不符合「每 feature adcode = 6 位」真源契约 ⇒ 剔除、不编造码
      continue;
    }
    const r = slimFeature(f, areaThreshold);
    dropped += r.dropped;
    features.push(r.feature);
  }
  return { collection: { type: 'FeatureCollection', features }, dropped, pruned };
}

// ══════════════════════════════════════════════════════════════════════════════
// 粗档（LOD 第二档）：`config/geo-bounds/coarse/<adcode>.json`
//
// 口径（本批派单逐字冻结）：
//   · **只新增**；既有细档真源与产物**一动不动**（不得重生成、不得改形状）。
//   · `adcode` 集合与细档**完全一致**（既有 29 + 本批新增天津 `120000` = 30 个），且**逐 feature 与细档一一对应**
//     （同数量、同顺序、同 `properties.adcode`）—— 不得整个分片统一简化，否则渲染器
//     无法「按单个面选档」。
//   · 生成手段：对细档**每个 feature 独立**做 Douglas–Peucker；顶点预算
//     ≈ `clamp(round(0.06 × 该 feature 细档顶点数), 12, 80)`，迭代加大 epsilon 直至落进预算。
//   · 坐标仍 **4 位小数**；环丢弃规则**同细档**（shoelace 面积 < `SLIM_AREA_THRESHOLD`）；
//     几何统一归一为 `MultiPolygon`；`properties` 原样继承细档。
//   · **幂等**：细档不变 ⇒ 粗档逐字节不变（DP 确定性 + 抖动无随机）。
// ══════════════════════════════════════════════════════════════════════════════

/** 粗档子目录名（真源 = `config/geo-bounds/coarse/`） */
export const COARSE_SUBDIR = 'coarse';
/** 粗档真源目录 */
export const COARSE_TRUTH_DIR = path.join(TRUTH_DIR, COARSE_SUBDIR);

/** 粗档顶点预算比例（× 该 feature 的细档顶点数） */
export const LOD_COARSE_RATIO = 0.06;
/** 粗档顶点预算下限（个；小面也至少留这么多点，保住基本形状） */
export const LOD_COARSE_MIN = 12;
/** 粗档顶点预算上限（个） */
export const LOD_COARSE_MAX = 80;
/** DP 起始 epsilon（低于 4 位小数分辨率）与放大倍率 */
const DP_EPS_START = 1e-5;
const DP_EPS_GROW = 1.6;
const DP_MAX_ITER = 48;

/** 单个 feature 的粗档顶点预算 = `clamp(round(ratio × 细档顶点数), 12, 80)` */
export function coarseVertexBudget(fineVertexCount) {
  return Math.max(LOD_COARSE_MIN, Math.min(LOD_COARSE_MAX, Math.round(LOD_COARSE_RATIO * fineVertexCount)));
}

/**
 * feature 的**可达**顶点预算下限：每条多边形环退化后仍至少 3 点 ⇒ 多岛 feature 的下限是 `3 × 多边形数`。
 * 预算是硬上限（测试断言「每 feature 顶点数 ≤ 预算」），故取 `max(比例预算, 3 × 多边形数)`；
 * 单环 / 少环 feature 仍严格等于 `clamp(round(0.06 × 细档顶点数), 12, 80)`。
 */
export function coarseFeatureBudget(fineVertexCount, polyCount) {
  return Math.max(coarseVertexBudget(fineVertexCount), 3 * Math.max(1, polyCount));
}

/** feature 顶点总数（全部环坐标点；细 / 粗同口径） */
export function featureVertexCount(feature) {
  const geom = feature?.geometry || {};
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  let n = 0;
  for (const poly of Array.isArray(polys) ? polys : []) {
    for (const ring of Array.isArray(poly) ? poly : []) n += Array.isArray(ring) ? ring.length : 0;
  }
  return n;
}

/** 点 `p` 到线段 `a→b` 的垂距（DP 判据） */
function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 <= 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker（首末点固定；输入点列 → 简化点列） */
function dpSimplify(points, eps) {
  const n = points.length;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let maxD = -1;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = perpDist(points[k], points[i], points[j]);
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (idx >= 0 && maxD > eps) {
      keep[idx] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(points[k]);
  return out;
}

/** 环 → 3 点近似（退化兜底：首点 + 距首点最远点 + 距该弦最远点） */
function triangleOf(ring) {
  const p0 = ring[0];
  let p1 = ring[0];
  let best = -1;
  for (const p of ring) {
    const d = (p[0] - p0[0]) ** 2 + (p[1] - p0[1]) ** 2;
    if (d > best) {
      best = d;
      p1 = p;
    }
  }
  let p2 = p0;
  let best2 = -1;
  for (const p of ring) {
    const d = perpDist(p, p0, p1);
    if (d > best2) {
      best2 = d;
      p2 = p;
    }
  }
  return [p0, p1, p2];
}

/** 单环粗化：闭环保留首点参与 DP → 4 位小数 → 去重；退化（< 3 点）⇒ 3 点近似兜底 */
function coarseRing(ring, eps) {
  const src = Array.isArray(ring) ? ring : [];
  if (src.length < 3) return [];
  const closed = [...src, [src[0][0], src[0][1]]];
  let out = dedupeRing(dpSimplify(closed, eps).map((p) => [round(p[0]), round(p[1])]));
  if (out.length < 3) out = dedupeRing(triangleOf(src).map((p) => [round(p[0]), round(p[1])]));
  return out.length >= 3 ? out : [];
}

/**
 * 单要素粗化（**逐 feature 独立**，与细档一一对应）。
 * 迭代加大 epsilon 直至全部环顶点合计 ≤ 预算（兜底：迭代上限后取最后一轮）。
 * `properties` 原样继承细档（`adcode` / `name` / `centroid` / `center`）。
 */
export function coarseFeature(fineFeature, areaThreshold = SLIM_AREA_THRESHOLD) {
  const geom = fineFeature?.geometry || {};
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  const list = Array.isArray(polys) ? polys : [];
  const budget = coarseFeatureBudget(featureVertexCount(fineFeature), list.length);
  const props = fineFeature?.properties || {};
  const slim = { adcode: props.adcode, name: props.name };
  if (Array.isArray(props.centroid)) slim.centroid = [props.centroid[0], props.centroid[1]];
  if (Array.isArray(props.center)) slim.center = [props.center[0], props.center[1]];

  let eps = DP_EPS_START;
  let out = [];
  for (let iter = 0; iter < DP_MAX_ITER; iter++) {
    out = [];
    for (const poly of list) {
      if (!Array.isArray(poly) || !Array.isArray(poly[0])) continue;
      const outer = coarseRing(poly[0], eps);
      if (!outer.length) continue;
      if (areaThreshold > 0 && ringArea(outer) < areaThreshold) continue; // 环丢弃规则同细档
      const rings = [outer];
      for (let k = 1; k < poly.length; k++) {
        const hole = coarseRing(poly[k], eps);
        if (!hole.length) continue;
        if (areaThreshold > 0 && ringArea(hole) < areaThreshold) continue;
        rings.push(hole);
      }
      out.push(rings);
    }
    let total = 0;
    for (const poly of out) for (const ring of poly) total += ring.length;
    if (total <= budget) break;
    eps *= DP_EPS_GROW;
  }
  return { type: 'Feature', properties: slim, geometry: { type: 'MultiPolygon', coordinates: out } };
}

/**
 * FeatureCollection 粗化（**保持 features 数量 / 顺序 / adcode 与细档一一对应**）。
 * 返回 `{ collection, emptyFeatures }`（`emptyFeatures` = 环被全部丢弃的 feature 数，供守卫统计）。
 */
export function coarseCollection(fineFc, areaThreshold = SLIM_AREA_THRESHOLD) {
  const features = [];
  let emptyFeatures = 0;
  for (const f of fineFc?.features || []) {
    const c = coarseFeature(f, areaThreshold);
    if (!c.geometry.coordinates.length) emptyFeatures += 1;
    features.push(c);
  }
  return { collection: { type: 'FeatureCollection', features }, emptyFeatures };
}

/** 真源目录里的 adcode（升序；**只认 6 位码文件名** —— `_unsourceable.json` 等清单文件 / 子目录一律忽略） */
export function listTruthAdcodes(dir = TRUTH_DIR) {
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => /^\d{6}\.json$/.test(f))
        .map((f) => f.slice(0, -'.json'.length))
        .sort()
    : [];
}

/**
 * 由**磁盘上的细档真源**生成粗档真源（零网络、幂等）。
 * `write=false` 时只计算不落盘（供核对 / 幂等探针）。
 */
export function buildCoarseTruth({ truthDir = TRUTH_DIR, write = true, areaThreshold = SLIM_AREA_THRESHOLD } = {}) {
  const adcodes = listTruthAdcodes(truthDir);
  const outDir = path.join(truthDir, COARSE_SUBDIR);
  const rows = [];
  let wrote = 0;
  let emptyFeatures = 0;
  let bytes = 0;
  for (const adcode of adcodes) {
    const fine = JSON.parse(fs.readFileSync(path.join(truthDir, `${adcode}.json`), 'utf8'));
    const built = coarseCollection(fine, areaThreshold);
    const text = `${JSON.stringify(built.collection)}\n`;
    const size = Buffer.byteLength(text);
    bytes += size;
    emptyFeatures += built.emptyFeatures;
    rows.push({ adcode, bytes: size, features: built.collection.features.length });
    if (!write) continue;
    const file = path.join(outDir, `${adcode}.json`);
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (cur === text) continue;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    wrote += 1;
  }
  return { adcodes, outDir, rows, wrote, bytes, emptyFeatures };
}

/**
 * 所需 adcode 集合（**收集规则 · 逐字**，`docs/migration-map.spec.md` §2-2）：
 *   tree-meta 全部 origin_code ∪ 全部树 JSON 里 person 的
 *   birth_place.origin_code / residence_places[].origin_code / death_place.origin_code，
 *   每码再加其所属省（前 2 位 + 0000）与所属市（前 4 位 + 00），最后加省级底图 100000。
 * 空码 / 非 6 位（含历史字符串形态）**一律跳过**（不编造 6 位码）。
 * 返回去重后的升序数组（供 build 与 gen **两个脚本共用**）。
 */
export function collectAdcodes({ metaFile = TREE_META, treesDir = TREES_DIR } = {}) {
  const set = new Set();
  const add = (code) => {
    if (typeof code !== 'string' || !CODE_RE.test(code)) return; // 空码 / 非 6 位 / 历史字符串 ⇒ 跳过
    set.add(code);
    set.add(`${code.slice(0, 2)}0000`); // 所属省
    set.add(`${code.slice(0, 4)}00`); // 所属市（若该码本身即市级 ⇒ 与码本身重合，Set 天然去重）
  };

  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  for (const entry of Object.values(meta?.trees || {})) add(entry?.origin_code);

  const files = fs.existsSync(treesDir) ? fs.readdirSync(treesDir).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) {
    let tree;
    try {
      tree = JSON.parse(fs.readFileSync(path.join(treesDir, f), 'utf8'));
    } catch {
      continue; // 坏文件不该拖垮收集；键形状校验交给 build 阶段的真源形状断言
    }
    for (const p of Object.values(tree?.people || {})) {
      const bp = p?.birth_place;
      if (bp && typeof bp === 'object') add(bp.origin_code);
      if (Array.isArray(p?.residence_places)) {
        for (const r of p.residence_places) if (r && typeof r === 'object') add(r.origin_code);
      }
      const dp = p?.death_place;
      if (dp && typeof dp === 'object') add(dp.origin_code);
    }
  }
  set.add('100000'); // 省级底图
  return [...set].sort();
}

/** 抓单个 adcode：优先 `_full.json`（全子级），叶级 404 ⇒ 回退 `<adcode>.json`（自身边界） */
async function fetchBoundary(adcode) {
  const localDir = process.env.GEO_BOUNDS_SRC_DIR;
  if (localDir) {
    for (const name of [`${adcode}_full.json`, `${adcode}.json`]) {
      const local = path.join(localDir, name);
      if (fs.existsSync(local)) return { json: JSON.parse(fs.readFileSync(local, 'utf8')), source: name };
    }
    throw new Error(`GEO_BOUNDS_SRC_DIR 里找不到 ${adcode}（期望 ${adcode}_full.json 或 ${adcode}.json）`);
  }
  for (const name of [`${adcode}_full.json`, `${adcode}.json`]) {
    const res = await fetch(`${DATAV}/${name}`);
    if (res.ok) return { json: await res.json(), source: name };
    if (res.status !== 404) throw new Error(`抓取上游失败：${DATAV}/${name} → HTTP ${res.status}`);
  }
  throw new Error(`上游无该码的分片：${adcode}（_full.json 与 .json 均 404）`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const analyze = argv.includes('--analyze');
  const coarseOnly = argv.includes('--coarse-only');
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : TRUTH_DIR;

  // ---- `--coarse-only`：零网络，只由**磁盘上的细档真源**（重新）生成粗档（幂等） ----
  if (coarseOnly) {
    const r = buildCoarseTruth({ truthDir: outDir, write: true });
    if (!r.adcodes.length) {
      console.error(`❌ 细档真源目录为空：${outDir}\n   请先运行 node scripts/build-geo-bounds.mjs`);
      process.exit(1);
    }
    console.log(`— 粗档：由 ${r.adcodes.length} 份细档真源生成 → ${r.outDir}（本次改写 ${r.wrote} 份，合计 ${r.bytes} 字节）`);
    if (r.emptyFeatures) console.error(`⚠️  环被全部丢弃的 feature 数：${r.emptyFeatures}`);
    process.exit(0);
  }

  const adcodes = collectAdcodes();
  const STATS = [0, 1e-6, 1e-5, 3e-5, 1e-4];
  const fetched = [];
  let rawTotal = 0;
  for (const adcode of adcodes) {
    const { json, source } = await fetchBoundary(adcode);
    const raw = Buffer.byteLength(JSON.stringify(json));
    rawTotal += raw;
    fetched.push({ adcode, json, source, raw });
  }

  if (analyze) {
    console.log(`抓取 ${adcodes.length} 个 adcode（raw 合计 ${rawTotal} 字节）；瘦身阈值标定（shoelace 面积，平方度）：`);
    console.log('  areaThr        瘦身后合计字节   剔除环/岛屿数');
    for (const thr of STATS) {
      let bytes = 0;
      let dropped = 0;
      for (const { json } of fetched) {
        const r = slimCollection(json, thr);
        bytes += Buffer.byteLength(JSON.stringify(r.collection));
        dropped += r.dropped;
      }
      console.log(`  ${String(thr).padEnd(12)}  ${String(bytes).padStart(14)}   ${String(dropped).padStart(6)}`);
    }
    console.log(`\n选定 SLIM_AREA_THRESHOLD=${SLIM_AREA_THRESHOLD}（COORD_DECIMALS=${COORD_DECIMALS}）；未选阈值不写盘。`);
    process.exit(0);
  }

  fs.mkdirSync(outDir, { recursive: true });
  let slimTotal = 0;
  let wrote = 0;
  let prunedTotal = 0;
  for (const { adcode, json, source } of fetched) {
    const { collection, dropped, pruned } = slimCollection(json);
    prunedTotal += pruned;
    const text = `${JSON.stringify(collection)}\n`;
    slimTotal += Buffer.byteLength(text);
    const file = path.join(outDir, `${adcode}.json`);
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (cur === text) continue;
    fs.writeFileSync(file, text, 'utf8');
    wrote += 1;
    console.log(`✅ 已写 ${file}（${collection.features.length} 要素 / 来源 ${source} / 剔小环 ${dropped}${pruned ? ` / 剔非 6 位码要素 ${pruned}` : ''}）`);
  }
  console.log(`— 真源 ${adcodes.length} 个分片 → ${outDir}（本次改写 ${wrote} 份）`);
  if (prunedTotal) console.log(`— 剔除 adcode 非 6 位要素合计 ${prunedTotal}（DataV 的 100000_JD 九段线，不编造 6 位码）`);
  console.log(`— 瘦身前后：raw 合计 ${rawTotal} 字节 → 真源合计 ${slimTotal} 字节（−${(100 * (1 - slimTotal / rawTotal)).toFixed(1)}%）`);

  // ---- 粗档：由刚落盘的细档真源派生（逐 feature 一一对应；零额外网络请求） ----
  const coarse = buildCoarseTruth({ truthDir: outDir, write: true });
  const staleCoarse = coarse.adcodes.filter((c) => !adcodes.includes(c));
  console.log(`— 粗档：由 ${coarse.adcodes.length} 份细档真源生成 → ${coarse.outDir}（本次改写 ${coarse.wrote} 份，合计 ${coarse.bytes} 字节）`);
  if (coarse.emptyFeatures) console.error(`⚠️  环被全部丢弃的 feature 数：${coarse.emptyFeatures}`);
  const missingCoarse = adcodes.filter((c) => !coarse.adcodes.includes(c));
  if (missingCoarse.length || staleCoarse.length) {
    console.error(`❌ 粗档 adcode 集合与细档不一致：缺 ${missingCoarse.join(', ') || '无'}；多余 ${staleCoarse.join(', ') || '无'}`);
    process.exit(1);
  }
  console.log(`✅ 粗档 adcode 集合与细档完全一致（${coarse.adcodes.length} 个，逐 feature 一一对应）`);
}
