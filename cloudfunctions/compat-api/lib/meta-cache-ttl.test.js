/**
 * meta 读缓存 TTL 回归（cloud metaCache 陈旧事故 · 2026-10-15）
 *
 * 事故：cloud 分支 `getMeta` 原为 `if (metaCache) return metaCache;` 的**进程生命周期级**缓存
 * （无 TTL、无失效通道）⇒ 新建祖谱写侧 CAS 落库成功后，其它常驻实例的 metaCache 仍是旧快照，
 * `GET /tree-meta` 永远少一棵树、世本挂载状态读不到，直到实例重启。
 * （local 分支早有 `statMetaFile` 指纹失效；上一批只给 `treeCache` 加了 TREE_CACHE_TTL_MS=15s，metaCache 漏盖。）
 *
 * 修法（本文件锚定）：cloud 分支加 15s 短路 TTL ——
 *   - `META_CACHE_TTL_MS = TREE_CACHE_TTL_MS`（同源同口径，单点常量）；
 *   - 模块级 `metaFetchedAt` 时间戳（**不进** metaCache 对象 —— metaCache 原样返回给调用方，出参形状不变）；
 *   - 纯函数 `metaCacheExpired(fetchedAt, now)` 单点判定（fetchedAt=0 / NaN 恒失效，失效方向安全）；
 *   - 写成功就地刷新 `metaFetchedAt = Date.now()`：getMeta 重取后、mutateTreeMeta cloud ×2（幂等命中 +
 *     CAS 写后）、removeTreeMeta cloud（同类写点）、mutateMetaDoc cloud、saveMeta cloud。
 *
 * 本文件覆盖（硬清单）：
 *   ① 纯函数 metaCacheExpired：未超龄命中（false）/ 恰满 TTL 失效（true）/ 远超龄失效（true）/ fetchedAt=0 失效（true）；
 *   ② TTL 同源 15s：META_CACHE_TTL_MS === 15000 且源码字面 `= TREE_CACHE_TTL_MS`（不许另立数值漂移）；
 *   ③ 静态锚：getMeta cloud 分支确实引用 metaCacheExpired(metaFetchedAt, Date.now()) 判定，且重取聚合后刷新 metaFetchedAt；
 *   ④ 静态锚：四个写原语（mutateTreeMeta ×2 / removeTreeMeta / mutateMetaDoc / saveMeta）的 cloud 分支各自就地刷新；
 *   ⑤ 静态锚：metaFetchedAt 为模块级 let，且不出现在 getMeta 的 metaCache 聚合对象字面量里（出参形状不变）。
 *
 * 数据安全：设置沙箱 env 后仅 import store.js（取纯函数与常量）+ 读源码文本；不写任何真源文件。
 * 运行：node --test cloudfunctions/compat-api/lib/meta-cache-ttl.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// 沙箱 env（照 anchors.test.js）：store.js import 期只做 env 解析，仍显式指到 /tmp 副本杜绝意外写真源
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-meta-cache-ttl-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const store = await import('./store.js');
const STORE_SRC = fs.readFileSync(path.join(HERE, 'store.js'), 'utf8');

/** 取「某顶层导出函数」签名行到下一个顶层 `export` 之间的源码区域（静态锚切片用） */
function fnRegion(signature) {
  const start = STORE_SRC.indexOf(signature);
  assert.notEqual(start, -1, `源码中找不到 ${signature}`);
  const next = STORE_SRC.indexOf('\nexport ', start + signature.length);
  return STORE_SRC.slice(start, next === -1 ? STORE_SRC.length : next);
}
const refreshCount = (region) => (region.match(/metaFetchedAt = Date\.now\(\)/g) || []).length;

test('① metaCacheExpired：未超龄命中 / 恰满失效 / 超龄失效 / fetchedAt=0 失效', () => {
  const { metaCacheExpired, META_CACHE_TTL_MS } = store;
  const t0 = 1_000_000;
  assert.equal(typeof metaCacheExpired, 'function');
  assert.equal(META_CACHE_TTL_MS, 15_000, 'meta TTL 必须 = 15s（与 TREE_CACHE_TTL_MS 同口径）');
  assert.equal(metaCacheExpired(t0, t0), false, '刚取完 → 未超龄（命中）');
  assert.equal(metaCacheExpired(t0, t0 + META_CACHE_TTL_MS - 1), false, 'TTL-1ms → 仍未超龄（命中）');
  assert.equal(metaCacheExpired(t0, t0 + META_CACHE_TTL_MS), true, '恰满 TTL → 失效（>= 与 cachedTree 同口径）');
  assert.equal(metaCacheExpired(t0, t0 + META_CACHE_TTL_MS * 10), true, '远超龄 → 失效');
  assert.equal(metaCacheExpired(0, t0), true, 'fetchedAt=0（从未取过）→ 失效');
});

test('② TTL 同源：META_CACHE_TTL_MS 字面取自 TREE_CACHE_TTL_MS（单点常量不漂移）', () => {
  assert.ok(
    STORE_SRC.includes('const META_CACHE_TTL_MS = TREE_CACHE_TTL_MS;'),
    'META_CACHE_TTL_MS 必须字面赋值自 TREE_CACHE_TTL_MS（同源 15s，不许另立数值）',
  );
});

test('③ 静态锚：getMeta cloud 分支引用 TTL 判定并刷新 metaFetchedAt', () => {
  const start = STORE_SRC.indexOf('export async function getMeta()');
  assert.notEqual(start, -1);
  // local 分支起点 = getMeta 内第一处裸 `if (metaCache) {`（cloud 分支已是 `metaCache && !metaCacheExpired(...)`，不再裸判空）
  const localBranchStart = STORE_SRC.indexOf('  if (metaCache) {', start);
  assert.ok(localBranchStart > start, '必须能定位 getMeta local 分支起点');
  const cloudBranch = STORE_SRC.slice(start, localBranchStart);
  assert.ok(
    /if \(metaCache && !metaCacheExpired\(metaFetchedAt, Date\.now\(\)\)\) return metaCache;/.test(cloudBranch),
    'cloud 分支必须先过 metaCacheExpired(metaFetchedAt, now) 判定再返回缓存',
  );
  assert.ok(
    cloudBranch.includes('metaFetchedAt = Date.now()'),
    'cloud 分支重取聚合后必须刷新 metaFetchedAt（否则 TTL 只生效一次）',
  );
});

test('④ 静态锚：四个写原语的 cloud 分支各自就地刷新 metaFetchedAt', () => {
  assert.equal(refreshCount(fnRegion('export async function mutateTreeMeta')), 2, 'mutateTreeMeta cloud（幂等命中 + CAS 写后）各刷一次');
  assert.equal(refreshCount(fnRegion('export async function removeTreeMeta')), 1, 'removeTreeMeta cloud（删档成功后）刷新');
  assert.equal(refreshCount(fnRegion('export async function mutateMetaDoc')), 1, 'mutateMetaDoc cloud（_meta CAS 写后）刷新');
  assert.equal(refreshCount(fnRegion('export async function saveMeta')), 1, 'saveMeta cloud（逐档写完更新 metaCache 处）刷新');
});

test('⑤ 静态锚：metaFetchedAt 为模块级时间戳，不进 metaCache 聚合对象（出参形状不变）', () => {
  assert.ok(STORE_SRC.includes('let metaFetchedAt = 0;'), 'metaFetchedAt 必须是模块级 let（时间戳不得进缓存对象）');
  const getMetaStart = STORE_SRC.indexOf('export async function getMeta()');
  const aggStart = STORE_SRC.indexOf('metaCache = {', getMetaStart);
  assert.notEqual(aggStart, -1);
  const aggEnd = STORE_SRC.indexOf('};', aggStart);
  const agg = STORE_SRC.slice(aggStart, aggEnd);
  assert.ok(agg.includes('trees'), '聚合对象应含 trees（形状锚：{_schema,_description,storage_files,trees}）');
  assert.ok(!agg.includes('metaFetchedAt'), 'metaFetchedAt 不得塞进 metaCache 对象 —— 它会原样返回给调用方');
});
