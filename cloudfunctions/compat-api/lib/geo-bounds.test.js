/**
 * 边界数据管线单测 —— 真源分片结构 + 产物可还原 / 与真源一致 + `--check` 等价断言 + 幂等 + 真源零写入
 *
 * 口径真源 = `docs/migration-map.spec.md` §2（内置进仓 · 离线零请求）与 §2-5（本文件覆盖要求）。
 * 上游真源（**只读**）：`config/geo-bounds/<adcode>.json`（真源）；`config/tree-meta.json`、
 *   `migrate-output/trees/*.json`（收集规则输入）；产物 `frontend/src/business/geo/bounds/<adcode>.json`。
 *
 * 覆盖：
 *   ① 真源分片结构：每个文件是 FeatureCollection；每 feature `properties.adcode` 匹配 `^\d{6}$`、`name` 非空
 *   ② 产物可还原（node `zlib.inflateRawSync` —— 与 `inflateBase64ToUtf8` 互为交叉验证）且与真源逐字段一致
 *   ③ `node scripts/gen-geo-bounds.mjs --check` 等价断言 exit 0（缺失 / 不一致时非 0）
 *   ④ 幂等：`renderProduct()` 两次字节相同；磁盘产物 === `renderProduct(真源)`
 *   ⑤ 收集规则（§2-2）：∪ 省 / 市 / `100000`；空码 / 非 6 位不收集
 *   ⑥ 零网络：迁徙地图纯逻辑模块源码不含 fetch / uni.request / XMLHttpRequest
 *   ⑦ 真源零写入（收尾）：`config/geo-bounds/**` 与 `config/tree-meta.json` md5 前后一致
 *
 * 运行：node --test cloudfunctions/compat-api/lib/geo-bounds.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const GEO_BOUNDS_DIR = path.join(REPO, 'config', 'geo-bounds');
const COARSE_TRUTH_DIR = path.join(GEO_BOUNDS_DIR, 'coarse');
const PRODUCT_DIR = path.join(REPO, 'frontend', 'src', 'business', 'geo', 'bounds');
const PRODUCT_COARSE_DIR = path.join(PRODUCT_DIR, 'coarse');
const MAP_ENGINE_TS = path.join(REPO, 'frontend', 'src', 'pages', 'special', 'migration-map', 'map-engine.ts');
const GEN_SCRIPT = path.join(REPO, 'scripts', 'gen-geo-bounds.mjs');
const MIGRATION_MAP_TS = path.join(REPO, 'frontend', 'src', 'business', 'migration-map.ts');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ---- 真源零写入基线（开工时取；收尾逐字节断言）----
const META_MD5_BEFORE = md5(REAL_META);
const TRUTH_MD5_BEFORE = new Map(fs.readdirSync(GEO_BOUNDS_DIR).filter((f) => f.endsWith('.json')).map((f) => [f, md5(path.join(GEO_BOUNDS_DIR, f))]));
const COARSE_MD5_BEFORE = new Map(fs.readdirSync(COARSE_TRUTH_DIR).filter((f) => f.endsWith('.json')).map((f) => [f, md5(path.join(COARSE_TRUTH_DIR, f))]));

const { collectAdcodes, TRUTH_DIR, SLIM_AREA_THRESHOLD, COORD_DECIMALS } = await import('../../../scripts/build-geo-bounds.mjs');
const { buildCoarseTruth, coarseCollection, coarseFeatureBudget, coarseVertexBudget, featureVertexCount, COARSE_SUBDIR, LOD_COARSE_RATIO, LOD_COARSE_MIN, LOD_COARSE_MAX } = await import('../../../scripts/build-geo-bounds.mjs');
const { renderProduct, truthAdcodes, decodeProduct } = await import('../../../scripts/gen-geo-bounds.mjs');
const { PRODUCT_COARSE_DIR: GEN_PRODUCT_COARSE_DIR } = await import('../../../scripts/gen-geo-bounds.mjs');

/** 产物文本 → 真源 JSON（`inflateBase64ToUtf8` 的**等价实现**：node zlib，交叉验证） */
function inflateProduct(text) {
  const parsed = JSON.parse(text);
  const b64 = typeof parsed === 'string' ? parsed : parsed?.g;
  assert.equal(typeof b64, 'string', '产物形状必须是 base64 字符串');
  return JSON.parse(zlib.inflateRawSync(Buffer.from(b64, 'base64')).toString('utf8'));
}

// ================= ① 真源分片结构 =================

test('① 真源分片结构：FeatureCollection；每 feature adcode 匹配 ^\\d{6}$；name 非空', () => {
  const shards = truthAdcodes(TRUTH_DIR);
  assert.equal(shards.length > 0, true, '真源目录必须有分片');
  let featureCount = 0;
  for (const adcode of shards) {
    assert.match(adcode, /^\d{6}$/, `分片文件名必须是 6 位码：${adcode}`);
    const fc = readJson(path.join(TRUTH_DIR, `${adcode}.json`));
    assert.equal(fc.type, 'FeatureCollection', `${adcode}.json 必须是 FeatureCollection`);
    assert.equal(Array.isArray(fc.features), true, `${adcode}.json 必须有 features 数组`);
    assert.equal(fc.features.length > 0, true, `${adcode}.json 不得为空`);
    for (const f of fc.features) {
      assert.match(String(f.properties?.adcode), /^\d{6}$/, `${adcode}.json 每 feature adcode 必须 6 位`);
      assert.equal(typeof f.properties?.name === 'string' && f.properties.name.length > 0, true, `${adcode}.json 每 feature name 必须非空`);
      assert.equal(f.geometry?.type, 'MultiPolygon', `${adcode}.json 几何归一为 MultiPolygon`);
      featureCount += 1;
    }
  }
  assert.equal(COORD_DECIMALS, 4, '坐标精度口径 = 4 位小数');
  assert.equal(SLIM_AREA_THRESHOLD > 0, true, '简化阈值必须为正（剔小环）');
});

// ================= ② 产物可还原且与真源一致 =================

test('② 产物可还原（zlib ↔ inflate.ts 交叉验证）且与真源逐字段一致', async () => {
  const shards = truthAdcodes(TRUTH_DIR);
  for (const adcode of shards) {
    const text = fs.readFileSync(path.join(PRODUCT_DIR, `${adcode}.json`), 'utf8');
    const viaZlib = inflateProduct(text);
    const viaInflateTs = await decodeProduct(text); // 复用既有 inflate.ts（唯一还原入口）
    assert.deepEqual(viaZlib, readJson(path.join(TRUTH_DIR, `${adcode}.json`)), `${adcode} 产物（zlib）必须与真源一致`);
    assert.deepEqual(viaInflateTs, viaZlib, `${adcode} inflate.ts 与 zlib 解压结果必须一致`);
  }
});

// ================= ③ --check 等价断言 =================

test('③ `gen-geo-bounds.mjs --check` 等价断言 exit 0；缺失 / 不一致时非 0', () => {
  const out = execFileSync(process.execPath, [GEN_SCRIPT, '--check'], { cwd: REPO, encoding: 'utf8' });
  assert.match(out, /逐 adcode 一致/);
  assert.match(out, /缺失清单为空/);
  assert.match(out, /产物合计/);
});

// ================= ④ 幂等 =================

test('④ 幂等：renderProduct 两次字节相同；磁盘产物 === renderProduct(真源)', () => {
  const shards = truthAdcodes(TRUTH_DIR);
  for (const adcode of shards) {
    const truth = readJson(path.join(TRUTH_DIR, `${adcode}.json`));
    const a = renderProduct(truth);
    const b = renderProduct(truth);
    assert.equal(a, b, `${adcode} renderProduct 两次输出必须字节相同`);
    assert.equal(fs.readFileSync(path.join(PRODUCT_DIR, `${adcode}.json`), 'utf8'), a, `${adcode} 磁盘产物必须等于 renderProduct(真源)`);
  }
});

// ================= ⑤ 收集规则 =================

test('⑤ 收集规则（§2-2）：∪ 省 / 市 / 100000；空码 / 非 6 位不收集', () => {
  const set = new Set(collectAdcodes());
  assert.equal(set.has('100000'), true, '省级底图 100000 必收');
  assert.equal(set.has('371325'), true, '树 / 人物码本身必收');
  assert.equal(set.has('371300'), true, '371325 的所属市（前 4 位 + 00）必收');
  assert.equal(set.has('370000'), true, '371325 的所属省（前 2 位 + 0000）必收');
  for (const bad of ['', '37132', '3713250', 'abc', '  ']) {
    assert.equal(set.has(bad), false, `非法 / 空码不得进集合：${JSON.stringify(bad)}`);
  }
  const meta = readJson(REAL_META);
  for (const code of Object.values(meta.trees || {}).map((t) => t.origin_code)) {
    if (/^\d{6}$/.test(String(code))) assert.equal(set.has(code), true, `tree-meta origin_code ${code} 必收`);
  }
});

// ================= ⑥ 零网络（源码判据）=================

test('⑥ 零网络：migration-map.ts 源码不含 fetch / uni.request / XMLHttpRequest', () => {
  const src = fs.readFileSync(MIGRATION_MAP_TS, 'utf8');
  assert.equal(/\bfetch\s*\(/.test(src), false, '不得发起 fetch');
  assert.equal(/uni\.request/.test(src), false, '不得发起 uni.request');
  assert.equal(/XMLHttpRequest/.test(src), false, '不得发起 XMLHttpRequest');
});

// ================= ⑦ 真源零写入 =================

test('⑦ 真源零写入：config/geo-bounds/** 与 config/tree-meta.json md5 前后一致', () => {
  assert.equal(md5(REAL_META), META_MD5_BEFORE, 'config/tree-meta.json 被改动了');
  const after = new Map(fs.readdirSync(GEO_BOUNDS_DIR).filter((f) => f.endsWith('.json')).map((f) => [f, md5(path.join(GEO_BOUNDS_DIR, f))]));
  assert.deepEqual([...after.keys()].sort(), [...TRUTH_MD5_BEFORE.keys()].sort(), 'config/geo-bounds 文件集变化');
  for (const [f, h] of TRUTH_MD5_BEFORE) assert.equal(after.get(f), h, `config/geo-bounds/${f} 内容变化`);
});

// ═══════════════════ LOD 双档（粗档 · 本批新增；只追加用例） ═══════════════════
//
// 派单冻结口径：真源 `config/geo-bounds/coarse/<adcode>.json` + 产物
// `frontend/src/business/geo/bounds/coarse/<adcode>.json`（形状同细档 = deflateRaw + base64）；
// adcode 集合与细档**完全一致**，且**逐 feature 与细档一一对应**（同数量 / 同顺序 / 同 `properties.adcode`）。

/** 环数组（几何统一 `MultiPolygon`） */
function polysOf(f) {
  return (f && f.geometry && f.geometry.coordinates) || [];
}
function ringListOf(f) {
  return polysOf(f).flat();
}
function vertexCountOf(f) {
  return ringListOf(f).reduce((n, r) => n + r.length, 0);
}
const is4dp = (v) => Number(v.toFixed(4)) === v;

// ================= ⑧ 粗档真源结构 + 逐 feature 一一对应 + 顶点预算 =================

test('⑧ 粗档真源：adcode 集合与细档一致；逐 feature 一一对应（数量/顺序/adcode/properties）；每 feature 顶点 ≤ 预算', () => {
  const fine = truthAdcodes(TRUTH_DIR);
  const coarse = truthAdcodes(COARSE_TRUTH_DIR);
  assert.equal(fine.length > 0, true, '细档真源必须有分片');
  assert.deepEqual(coarse, fine, '粗档 adcode 集合必须与细档完全一致（29 个）');
  assert.equal(LOD_COARSE_RATIO, 0.06, '粗档顶点预算比例 = 0.06');
  assert.equal(LOD_COARSE_MIN, 12, '粗档顶点预算下限 = 12');
  assert.equal(LOD_COARSE_MAX, 80, '粗档顶点预算上限 = 80');
  assert.equal(coarseVertexBudget(1000), 60, '预算 = round(0.06 × 细档顶点数)');
  assert.equal(coarseVertexBudget(10), 12, '预算下限 12');
  assert.equal(coarseVertexBudget(10000), 80, '预算上限 80');
  assert.match(COARSE_SUBDIR, /^coarse$/);

  let features = 0;
  for (const adcode of fine) {
    const ff = readJson(path.join(TRUTH_DIR, `${adcode}.json`));
    const cf = readJson(path.join(COARSE_TRUTH_DIR, `${adcode}.json`));
    assert.equal(cf.type, 'FeatureCollection', `${adcode} 粗档必须是 FeatureCollection`);
    assert.equal(cf.features.length, ff.features.length, `${adcode} 粗档 feature 数量必须与细档一致`);
    assert.equal(cf.features.length > 0, true, `${adcode} 粗档不得为空`);
    for (let i = 0; i < ff.features.length; i++) {
      const a = ff.features[i];
      const b = cf.features[i];
      assert.equal(String(b.properties.adcode), String(a.properties.adcode), `${adcode}#${i} 必须同序同 adcode 对应`);
      assert.equal(String(b.properties.adcode).length, 6, `${adcode}#${i} 粗档 adcode 必须 6 位`);
      assert.deepEqual(b.properties, a.properties, `${adcode}#${i} 粗档 properties 必须与细档逐字段一致`);
      assert.equal(b.geometry.type, 'MultiPolygon', `${adcode}#${i} 粗档几何必须归一 MultiPolygon`);
      const budget = coarseFeatureBudget(vertexCountOf(a), polysOf(a).length);
      assert.ok(vertexCountOf(b) <= budget, `${adcode}#${i} 粗档顶点 ${vertexCountOf(b)} 超预算上限 ${budget}`);
      for (const r of ringListOf(b)) {
        assert.ok(r.length >= 3, `${adcode}#${i} 每条环至少 3 点`);
        for (const p of r) {
          assert.ok(is4dp(p[0]) && is4dp(p[1]), `${adcode}#${i} 坐标必须 4 位小数：${p}`);
        }
      }
      features += 1;
    }
  }
  assert.ok(features > 0, '覆及 feature 数 > 0');
});

// ================= ⑨ 粗档产物可还原 / 逐字段一致 / 幂等 =================

test('⑨ 粗档产物：可还原（zlib ↔ inflate.ts）、与粗档真源逐字段一致、幂等（磁盘 === renderProduct 两次）', async () => {
  const shards = truthAdcodes(COARSE_TRUTH_DIR);
  assert.equal(shards.length, truthAdcodes(TRUTH_DIR).length, '两档分片数一致');
  assert.equal(PRODUCT_COARSE_DIR, GEN_PRODUCT_COARSE_DIR, '产物目录口径唯一');
  for (const adcode of shards) {
    const truth = readJson(path.join(COARSE_TRUTH_DIR, `${adcode}.json`));
    const text = fs.readFileSync(path.join(PRODUCT_COARSE_DIR, `${adcode}.json`), 'utf8');
    assert.deepEqual(inflateProduct(text), truth, `${adcode} 粗档产物（zlib）必须与粗档真源一致`);
    assert.deepEqual(await decodeProduct(text), truth, `${adcode} 粗档 inflate.ts 解压结果必须一致`);
    const a = renderProduct(truth);
    const b = renderProduct(truth);
    assert.equal(a, b, `${adcode} 粗档 renderProduct 两次输出必须字节相同`);
    assert.equal(text, a, `${adcode} 磁盘粗档产物必须等于 renderProduct(粗档真源)`);
  }
});

// ================= ⑩ `--check` 覆盖两档 =================

test('⑩ `gen-geo-bounds.mjs --check` 覆盖细 / 粗两档：EXIT 0；两档缺失清单皆空', () => {
  const out = execFileSync(process.execPath, [GEN_SCRIPT, '--check'], { cwd: REPO, encoding: 'utf8' });
  assert.match(out, /\[细档\]/, '必须校验细档');
  assert.match(out, /\[粗档\]/, '必须校验粗档');
  assert.equal((out.match(/逐 adcode 一致/g) || []).length, 2, '两档各一条「逐 adcode 一致」');
  assert.equal((out.match(/缺失清单为空/g) || []).length, 2, '两档各一条「缺失清单为空」');
  assert.match(out, /\[粗档\] 缺失清单为空：真源有产物无 0；收集规则应有而无 0；陈旧产物 0/);
});

// ================= ⑪ 粗档生成幂等（零写入复算） =================

test('⑪ 粗档生成幂等：buildCoarseTruth(write:false) 两次逐行相同，且复算文本 === 磁盘真源逐字节', () => {
  const r1 = buildCoarseTruth({ truthDir: TRUTH_DIR, write: false });
  const r2 = buildCoarseTruth({ truthDir: TRUTH_DIR, write: false });
  assert.deepEqual(r1.rows, r2.rows, '两次生成的行必须一致（幂等）');
  assert.equal(r1.bytes, r2.bytes, '两次生成字节合计必须一致');
  assert.equal(r1.wrote, 0, 'write:false 不得写盘');
  assert.equal(r1.emptyFeatures, 0, '不得有环被全部丢弃的 feature');
  assert.deepEqual(r1.adcodes, truthAdcodes(COARSE_TRUTH_DIR), '生成集合必须与磁盘粗档集合一致');
  for (const adcode of r1.adcodes) {
    const want = `${JSON.stringify(coarseCollectionForTest(readJson(path.join(TRUTH_DIR, `${adcode}.json`))))}\n`;
    assert.equal(fs.readFileSync(path.join(COARSE_TRUTH_DIR, `${adcode}.json`), 'utf8'), want, `${adcode} 磁盘粗档必须等于复算结果（幂等）`);
  }
});

/** 复算用：细档 FC → 粗档 FC（**直接复用** `build-geo-bounds.mjs` 的 `coarseCollection`，无第二套实现） */
function coarseCollectionForTest(fineFc) {
  return coarseCollection(fineFc).collection;
}

// ================= ⑫ 真源零写入（含粗档） =================

test('⑫ 真源零写入：config/geo-bounds/**（细档 + coarse 粗档）与 config/tree-meta.json md5 前后一致', () => {
  assert.equal(md5(REAL_META), META_MD5_BEFORE, 'config/tree-meta.json 被改动了');
  const fineAfter = new Map(fs.readdirSync(GEO_BOUNDS_DIR).filter((f) => f.endsWith('.json')).map((f) => [f, md5(path.join(GEO_BOUNDS_DIR, f))]));
  for (const [f, h] of TRUTH_MD5_BEFORE) assert.equal(fineAfter.get(f), h, `细档 config/geo-bounds/${f} 内容变化`);
  const coarseAfter = new Map(fs.readdirSync(COARSE_TRUTH_DIR).filter((f) => f.endsWith('.json')).map((f) => [f, md5(path.join(COARSE_TRUTH_DIR, f))]));
  assert.deepEqual([...coarseAfter.keys()].sort(), [...COARSE_MD5_BEFORE.keys()].sort(), '粗档真源文件集变化');
  for (const [f, h] of COARSE_MD5_BEFORE) assert.equal(coarseAfter.get(f), h, `粗档 config/geo-bounds/coarse/${f} 内容变化`);
});

// ================= ⑬ LOD 阈值 / 选择规则（源码判据） =================

test('⑬ LOD 阈值与选档规则：LOD_COARSE_MIN_PX = 24、独立于 TINY_FACE_MIN_PX = 18、按面屏幕最小边选档', () => {
  const src = fs.readFileSync(MAP_ENGINE_TS, 'utf8');
  assert.match(src, /export const LOD_COARSE_MIN_PX = 24;/, 'LOD 阈值常量必须 = 24');
  assert.match(src, /export const TINY_FACE_MIN_PX = 18;/, 'halo 阈值必须保持 18（不得改）');
  assert.match(src, /screenMinSide\(c, scale\) < LOD_COARSE_MIN_PX/, '选档判据 = 屏幕最小边 < LOD_COARSE_MIN_PX');
  assert.match(src, /coarseBounds/, '引擎必须接收粗档');
  assert.match(src, /byCodeCoarse/, '引擎必须建粗档索引');
  assert.equal(/TINY_FACE_MIN_PX\s*=\s*LOD_COARSE_MIN_PX|LOD_COARSE_MIN_PX\s*=\s*TINY_FACE_MIN_PX/.test(src), false, '两个阈值不得合并');
});

// ================= ⑭ px² 复算表（硬判据） =================

test('⑭ px² 复算表（stage 390×520 · 三镜头）：梨树区 ≤1.0、海港区 ≤0.5、绥芬河 ≤0.5；费县 / 牡丹江市 / 林口县 走细档读数不变', () => {
  // 与 map-engine.ts 同一公式（projY 墨卡托 + fitBoxIn）；stage 与镜头按派单冻结
  const W = 390;
  const H = 520;
  const R2D = 180 / Math.PI;
  const projY = (lat) => -R2D * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);
  const bbox = (f) => {
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of ringListOf(f))
      for (const p of r) {
        const x = p[0];
        const y = projY(p[1]);
        if (x < bb[0]) bb[0] = x;
        if (y < bb[1]) bb[1] = y;
        if (x > bb[2]) bb[2] = x;
        if (y > bb[3]) bb[3] = y;
      }
    return bb;
  };
  const union = (a, b) => (a === null ? b : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const fitScale = (bb, pad) => {
    const padPx = pad * Math.min(W, H);
    const w = Math.max(bb[2] - bb[0], 1e-6);
    const h = Math.max(bb[3] - bb[1], 1e-6);
    return clampv(Math.min((W - 2 * padPx) / w, (H - 2 * padPx) / h), 0.25, 30000);
  };
  const planSites = ['371325', '230305', '130302', '231081', '231000', '231025'];
  const set = new Set(['100000']);
  for (const c of planSites) {
    set.add(c);
    set.add(`${c.slice(0, 2)}0000`);
    set.add(`${c.slice(0, 4)}00`);
  }
  const codes = [...set].sort();
  const fineFc = {};
  const coarseFc = {};
  for (const c of codes) {
    if (fs.existsSync(path.join(TRUTH_DIR, `${c}.json`))) fineFc[c] = readJson(path.join(TRUTH_DIR, `${c}.json`));
    if (fs.existsSync(path.join(COARSE_TRUTH_DIR, `${c}.json`))) coarseFc[c] = readJson(path.join(COARSE_TRUTH_DIR, `${c}.json`));
  }
  const byCode = new Map();
  for (const c of codes) for (const f of (fineFc[c] || { features: [] }).features) { const a = String(f.properties.adcode); if (/^\d{6}$/.test(a) && !byCode.has(a)) byCode.set(a, f); }
  const own = (fc, code) => (fc[code] || { features: [] }).features.find((f) => String(f.properties.adcode) === code) || null;

  const camOrigin = fitScale(bbox(byCode.get('371325')), 0.3);
  let bbProv = null;
  for (const f of fineFc['230000'].features) bbProv = union(bbProv, bbox(f));
  const camMain = fitScale(bbProv, 0.1);
  let bbNat = null;
  for (const c of ['130302', '231081', '231000', '231025']) {
    const f = byCode.get(c);
    if (f) bbNat = union(bbNat, bbox(f));
  }
  const camNat = fitScale(bbNat, 0.1);
  const CAMS = { 'fit 费县': camOrigin, 'fit 黑龙江': camMain, 全国: camNat };
  const ROWS = [
    ['费县 371325', 'fit 费县', null],
    ['梨树区 230305', 'fit 黑龙江', 1.0],
    ['海港区 130302', '全国', 0.5],
    ['绥芬河 231081', '全国', 0.5],
    ['牡丹江市 231000', '全国', null],
    ['林口县 231025', '全国', null],
  ];
  const report = [];
  for (const [label, cam, limit] of ROWS) {
    const code = label.slice(-6);
    const s = CAMS[cam];
    const ff = own(fineFc, code) || byCode.get(code);
    const bbf = bbox(ff);
    const minSide = Math.min((bbf[2] - bbf[0]) * s, (bbf[3] - bbf[1]) * s);
    const useCoarse = minSide < 24;
    const cf = own(coarseFc, code);
    const picked = useCoarse && cf ? cf : ff;
    const bb = bbox(picked);
    const area = (bb[2] - bb[0]) * s * ((bb[3] - bb[1]) * s);
    const dens = vertexCountOf(picked) / area;
    report.push({ label, minSide: Math.round(minSide * 10) / 10, tier: useCoarse ? '粗' : '细', dens });
    if (limit !== null) {
      assert.equal(useCoarse, true, `${label} 屏幕最小边 ${minSide.toFixed(1)}px 应 < 24 ⇒ 走粗档`);
      assert.ok(cf, `${label} 必须有粗档可切`);
      assert.ok(dens <= limit, `${label} 点/px² = ${dens.toFixed(2)} 应 ≤ ${limit}`);
    } else {
      assert.equal(useCoarse, false, `${label} 屏幕最小边 ${minSide.toFixed(1)}px 应 ≥ 24 ⇒ 走细档（读数不变）`);
      assert.equal(picked, ff, `${label} 走细档`);
    }
  }
  // 表逐行（复算读数；供报告核对）
  for (const r of report) assert.ok(r.dens >= 0, `${r.label} ${r.tier}档 点/px²=${r.dens.toFixed(2)}`);
});
