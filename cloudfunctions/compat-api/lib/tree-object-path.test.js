/**
 * 树对象云路径版本化回归（方案 A · 2026-10-15）
 *
 * 环境事实（主代理对照实验钉死）：腾讯云存储对**同一对象路径**有服务端读缓存（CDN/对象缓存），
 * **同路径覆盖写不立即生效，TTL ≈ 分钟级（用户体感 ~10 分钟）**；downloadFile 每次签名的临时
 * URL 都不同 ⇒ 换 URL 无效，问题在**路径级**。这就是「新增节点后要等 ~10 分钟才可见」的根源。
 *
 * 修法（本文件锚定）：
 *   - **写路径版本化**：saveTree cloud 分支上传全新对象 `trees/<id>/v<N>.json`（N = 写入前已 +1
 *     的新版本号），createTreeFile cloud 分支 = v1 —— 每次保存都是从未被读过的新对象 ⇒ 任何
 *     路径级缓存都不可能命中旧内容；
 *   - **storage_files 重指**：上传成功后经 `mutateMetaDoc`（_meta 单档 CAS + 重试）把
 *     `storage_files[tree_id]` 指到新 fileID；meta 写失败 ⇒ 视为保存失败（还原版本号 +
 *     失效缓存 + 抛错，已上传对象留作孤儿，无害）；
 *   - **读路径零改动**：getTree / readAuthoritativeVersion 仍按 storage_files 的 fileID 下载；
 *   - **清扫**：上一版必保留（其它实例 metaCache ≤15s 内还指着它）；best-effort 删上上版
 *     v(N-2) 与已沦为上上版的遗留旧路径 `trees/<id>.json`（纯函数 sweepTargets）。
 *
 * 本文件覆盖（硬清单）：
 *   ① 纯函数 cloudTreeObjectPath / legacyTreeObjectPath：路径形状（含 v1 / 高版本）；
 *   ② 纯函数 sweepTargets：v1/v2 空；上上版 v(N-2) ≥ v1 时入选（对象可能不存在也照含 —— 删除侧
 *      best-effort 兜底）；版本号 < 3 绝不含遗留旧路径；≥ 3 且 hasLegacy 才含；上一版绝不入选；
 *   ③ 纯函数 isVersionedTreeFileId：遗留 fileID / 空值 ⇒ false；恰为该版本的版本化路径 ⇒ true；
 *      版本号不符 ⇒ false（保守：宁可留孤儿，不误判「遗留已上上版」）；
 *   ④ 静态锚：saveTree cloud 分支 = 版本化上传 + fileID 校验 + mutateMetaDoc 重指 + 其后清扫，
 *      全部位于 try 内（catch 还原版本号 + 失效缓存）；
 *   ⑤ 静态锚：createTreeFile cloud 分支 = v1 版本化上传 + fileID 校验 + mutateMetaDoc 重指；
 *   ⑥ 静态锚：读路径零改动 —— getTree / readAuthoritativeVersion 仍从 storage_files 取 fileID
 *      downloadFile，且不含任何版本化路径逻辑；
 *   ⑦ 静态锚：遗留同路径覆盖写绝迹 —— 旧上传模板 `trees/${tree.tree_id}.json` 全文 0 次；
 *      遗留路径仅由 legacyTreeObjectPath 单点产出（全文恰 1 次）；
 *   ⑧ 静态锚：清扫 best-effort —— sweepSupersededTreeObjects 内部吞错、deleteFile 用
 *      { fileList }（SDK 正确签名）、fileID 前缀由本次上传返回的 fileID 推导；
 *   ⑨ 静态锚：deleteTree 删当前 fileID 用 SDK 正确签名 `{ fileList: [fileId] }`，且按返回体
 *      `fileList[0].code === 'SUCCESS'` 判成败（非 SUCCESS / 缺 fileList ⇒ 抛错）；写序
 *      「先删对象成功 → 摘 storage_files → 失效缓存」与 local 分支行为不变；注释仍注明历史
 *      版本对象由 saveTree 清扫规则逐步回收；
 *   ⑩ 实跑（local 沙箱）：deleteTree 真删盘上树文件 + 失效树缓存（删后 getTree 回 null，不返
 *      幻影）+ 幂等（重删 / 空 id 不抛）。
 *
 * 数据安全：设置沙箱 env 后仅 import store.js（取纯函数与常量）+ 读源码文本；local 实跑（⑩）
 * 只写沙箱 /tmp 副本目录，不写任何真源文件。
 * 运行：node --test cloudfunctions/compat-api/lib/tree-object-path.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// 沙箱 env（照 meta-cache-ttl.test.js）：store.js import 期只做 env 解析，仍显式指到 /tmp 副本杜绝意外写真源
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-tree-object-path-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const store = await import('./store.js');
const STORE_SRC = fs.readFileSync(path.join(HERE, 'store.js'), 'utf8');

/** 取「startMarker 所在处」到「其后的 endMarker」之间的源码区域（静态锚切片用） */
function regionBetween(startMarker, endMarker) {
  const s = STORE_SRC.indexOf(startMarker);
  assert.notEqual(s, -1, `源码中找不到 ${startMarker}`);
  const e = STORE_SRC.indexOf(endMarker, s + startMarker.length);
  assert.ok(e > s, `源码中找不到结束标记 ${endMarker}`);
  return STORE_SRC.slice(s, e);
}

test('① cloudTreeObjectPath / legacyTreeObjectPath：路径形状', () => {
  const { cloudTreeObjectPath, legacyTreeObjectPath } = store;
  assert.equal(typeof cloudTreeObjectPath, 'function');
  assert.equal(cloudTreeObjectPath('t_demo', 1), 'trees/t_demo/v1.json', '首写 = v1');
  assert.equal(cloudTreeObjectPath('t_demo', 58), 'trees/t_demo/v58.json', '高版本同形状');
  assert.equal(legacyTreeObjectPath('t_demo'), 'trees/t_demo.json', '遗留旧路径形状不变（读侧兼容）');
  // 版本化路径必须落在「目录 <id>/」下：与遗留路径 trees/<id>.json 不同键 ⇒ 永不撞同路径
  assert.notEqual(cloudTreeObjectPath('t_demo', 1), legacyTreeObjectPath('t_demo'));
});

test('② sweepTargets：上上版入选 / 上一版绝不入选 / 遗留路径 v≥3 且 hasLegacy 才入选', () => {
  const { sweepTargets } = store;
  // 首两轮：无 v(N-2)（v0/v-1 不存在），遗留路径也至多是上一版 ⇒ 空（无论 hasLegacy）
  assert.deepEqual(sweepTargets('t_demo', 1, false), []);
  assert.deepEqual(sweepTargets('t_demo', 1, true), [], '版本号 < 3 时绝不含遗留旧路径');
  assert.deepEqual(sweepTargets('t_demo', 2, true), [], '版本号 < 3 时绝不含遗留旧路径');
  // v3：上上版 v1 入选；hasLegacy ⇒ 遗留旧路径入选
  assert.deepEqual(sweepTargets('t_demo', 3, false), ['trees/t_demo/v1.json']);
  assert.deepEqual(sweepTargets('t_demo', 3, true), ['trees/t_demo/v1.json', 'trees/t_demo.json']);
  // 高版本：上上版入选、上一版绝不入选、遗留路径仍按 hasLegacy 把关
  assert.deepEqual(sweepTargets('t_demo', 59, false), ['trees/t_demo/v57.json']);
  assert.deepEqual(sweepTargets('t_demo', 59, true), ['trees/t_demo/v57.json', 'trees/t_demo.json']);
  const high = sweepTargets('t_demo', 59, true);
  assert.ok(!high.includes('trees/t_demo/v58.json'), '上一版 v(N-1) 必须保留（其它实例 metaCache ≤15s 内还指着它）');
  // 「上上版不存在时也安全」的契约面：目标数组照含 v(N-2)（迁移后前两轮的 v(N-2) 从未写过），
  // 删除侧 best-effort（⑧ 锚定其吞错）—— 数组完整性与删除尽力而为分离。
  assert.ok(sweepTargets('t_demo', 3, false).includes('trees/t_demo/v1.json'));
});

test('③ isVersionedTreeFileId：只有「恰为该版本的版本化路径」才为真（保守判定）', () => {
  const { isVersionedTreeFileId } = store;
  assert.equal(isVersionedTreeFileId('cloud://env.bucket/trees/t_demo.json', 't_demo', 58), false, '遗留 fileID ⇒ false');
  assert.equal(isVersionedTreeFileId('cloud://env.bucket/trees/t_demo/v58.json', 't_demo', 58), true, '恰为 v58 ⇒ true');
  assert.equal(isVersionedTreeFileId('cloud://env.bucket/trees/t_demo/v58.json', 't_demo', 57), false, '版本号不符 ⇒ false（不误判遗留已上上版）');
  assert.equal(isVersionedTreeFileId('', 't_demo', 58), false, '空 fileID ⇒ false');
  assert.equal(isVersionedTreeFileId(undefined, 't_demo', 58), false, 'undefined ⇒ false');
  assert.equal(isVersionedTreeFileId('cloud://env.bucket/trees/t_other/v58.json', 't_demo', 58), false, '别的树的版本化对象 ⇒ false');
});

test('④ 静态锚：saveTree cloud 分支 = 版本化上传 + 重指 storage_files + 其后清扫，全在 try 内', () => {
  const region = regionBetween('export async function saveTree(tree, expectedVersion)', 'export async function createTreeFile');
  // 版本化上传：cloudPath 必须来自 helper，且用「写入前已 +1 的新版本号」tree.version
  assert.ok(
    region.includes('cloudPath: cloudTreeObjectPath(tree.tree_id, tree.version),'),
    'saveTree cloud 分支必须用 cloudTreeObjectPath(tree.tree_id, tree.version) 作上传路径',
  );
  assert.ok(!region.includes('`trees/${tree.tree_id}.json`'), 'saveTree cloud 分支不得再写遗留同路径');
  assert.ok(region.includes("if (!r?.fileID) throw new Error('云存储上传未返回 fileID');"), '上传结果必须校验 fileID');
  // 重指 storage_files → 新 fileID（mutateMetaDoc = CAS + 重试）
  const upIdx = region.indexOf('cloudPath: cloudTreeObjectPath');
  const repointIdx = region.indexOf('await mutateMetaDoc((cfg) => ({');
  const sweepIdx = region.indexOf('await sweepSupersededTreeObjects(tree.tree_id, tree.version, fileId);');
  assert.ok(repointIdx > upIdx, '上传之后必须 mutateMetaDoc 重指 storage_files');
  assert.ok(
    region.includes('[tree.tree_id]: r.fileID'),
    '重指必须把 storage_files[tree_id] 指到本次上传返回的 fileID',
  );
  assert.ok(sweepIdx > repointIdx, '重指成功之后才允许清扫（顺序：上传 → 重指 → 清扫）');
  assert.ok(sweepIdx > -1, 'saveTree 必须调用 sweepSupersededTreeObjects');
  // meta 写失败 ⇒ 保存失败：上传/重指/清扫都必须在 try 内，由 catch 还原版本号 + 失效缓存
  const tryIdx = region.indexOf('try {');
  const catchIdx = region.indexOf('} catch (e) {');
  assert.ok(tryIdx > -1 && catchIdx > tryIdx && upIdx > tryIdx && sweepIdx < catchIdx, '上传/重指/清扫必须位于 try 内');
  const catchRegion = region.slice(catchIdx);
  assert.ok(catchRegion.includes('tree.version = prevVersion;'), 'catch 必须还原版本号');
  assert.ok(catchRegion.includes('treeCache.delete(tree.tree_id);'), 'catch 必须失效树缓存');
  assert.ok(catchRegion.includes('throw e;'), 'catch 必须把失败抛给调用方（meta 写失败 = 保存失败）');
});

test('⑤ 静态锚：createTreeFile cloud 分支 = v1 版本化上传 + 重指 storage_files', () => {
  const region = regionBetween('export async function createTreeFile(tree)', 'export async function deleteTree');
  assert.ok(
    region.includes('cloudPath: cloudTreeObjectPath(tree.tree_id, tree.version || 1),'),
    'createTreeFile cloud 分支必须用 cloudTreeObjectPath（首写 v1）',
  );
  assert.ok(!region.includes('`trees/${tree.tree_id}.json`'), 'createTreeFile cloud 分支不得再写遗留同路径');
  assert.ok(region.includes("if (!r?.fileID) throw new Error('云存储上传未返回 fileID');"), '上传结果必须校验 fileID');
  const upIdx = region.indexOf('cloudPath: cloudTreeObjectPath');
  const repointIdx = region.indexOf('await mutateMetaDoc((cfg) => ({');
  assert.ok(repointIdx > upIdx, '上传之后必须 mutateMetaDoc 重指 storage_files');
  assert.ok(region.includes('[tree.tree_id]: r.fileID'), '重指必须指向本次上传返回的 fileID');
});

test('⑥ 静态锚：读路径零改动 —— getTree / readAuthoritativeVersion 仍按 fileID 下载', () => {
  const getTreeRegion = regionBetween('export async function getTree(treeId)', 'async function readAuthoritativeVersion');
  assert.ok(getTreeRegion.includes('const fileId = meta?.storage_files?.[treeId];'), 'getTree 仍从 storage_files 取 fileID');
  assert.ok(getTreeRegion.includes('downloadFile({ fileID: fileId })'), 'getTree 仍按 fileID downloadFile');
  assert.ok(!getTreeRegion.includes('cloudTreeObjectPath'), 'getTree 不得引入版本化路径逻辑（读路径零改动）');
  const ravRegion = regionBetween('async function readAuthoritativeVersion(treeId)', 'function treeConflictError');
  assert.ok(ravRegion.includes('const fileId = meta?.storage_files?.[treeId];'), 'readAuthoritativeVersion 仍从 storage_files 取 fileID');
  assert.ok(ravRegion.includes('downloadFile({ fileID: fileId })'), 'readAuthoritativeVersion 仍按 fileID downloadFile');
  assert.ok(!ravRegion.includes('cloudTreeObjectPath'), 'readAuthoritativeVersion 不得引入版本化路径逻辑');
});

test('⑦ 静态锚：遗留同路径覆盖写绝迹；遗留路径单点产出', () => {
  assert.ok(
    !STORE_SRC.includes('trees/${tree.tree_id}.json'),
    '旧上传模板 trees/${tree.tree_id}.json 必须全文 0 次（两处 cloud 上传已全部版本化）',
  );
  assert.equal(
    STORE_SRC.split('trees/${treeId}.json').length - 1,
    1,
    '遗留路径字面必须仅由 legacyTreeObjectPath 单点产出（local 模式磁盘路径走 path.join，不含此模板）',
  );
  assert.ok(
    STORE_SRC.includes('export function legacyTreeObjectPath(treeId)') && STORE_SRC.includes('export function cloudTreeObjectPath(treeId, version)') && STORE_SRC.includes('export function sweepTargets(treeId, newVersion, hasLegacy)') && STORE_SRC.includes('export function isVersionedTreeFileId(fileId, treeId, version)'),
    '四个纯函数必须存在且导出（单测面）',
  );
});

test('⑧ 静态锚：清扫 best-effort —— 吞错 + SDK 正确签名 + fileID 前缀推导', () => {
  const region = regionBetween('async function sweepSupersededTreeObjects', 'export async function getTree');
  assert.ok(region.includes('try {') && /} catch \{/.test(region), '清扫必须整体 try/catch 吞错（含对象不存在）');
  assert.ok(!region.includes('throw '), '清扫不得抛错（best-effort，绝不影响保存成功语义）');
  assert.ok(region.includes("getApp().deleteFile({ fileList: targets })"), '必须用 SDK 正确签名 deleteFile({ fileList })（批量）');
  assert.ok(region.includes("sweepTargets(treeId, newVersion, hasLegacy)"), '删除目标必须来自纯函数 sweepTargets');
  assert.ok(region.includes('isVersionedTreeFileId(fid, treeId, Number(newVersion) - 1)'), 'hasLegacy 必须由「被替换 fileID 是否为上一版的版本化对象」判定');
  assert.ok(region.includes("fid.slice(0, fid.lastIndexOf('/') + 1)"), '完整 fileID 必须由本次上传返回的 fileID 前缀推导（不依赖裸路径删除）');
});

test('⑨ 静态锚：deleteTree 用 SDK 正确签名 { fileList } 并按返回体 SUCCESS 判成败；写序与 local 分支不变', () => {
  const region = regionBetween('* 删除树 JSON（与', 'export async function listTreeIds');
  // cloud：正确签名 + 数组参数（旧写法参数只带 fileID ⇒ SDK 判参数非法（默认下抛 `INVALID_PARAM`）、两条路都拿不到「删除成功」凭据 ⇒ 静默无效）
  assert.ok(
    region.includes('getApp().deleteFile({ fileList: [fileId] })'),
    'deleteTree 必须用 SDK 正确签名 deleteFile({ fileList: [fileId] })',
  );
  assert.ok(!/deleteFile\(\{\s*fileID/.test(region), 'deleteTree 不得再出现参数只带 fileID 的旧写法');
  // 按返回体核对成败：只有 fileList[0].code === 'SUCCESS' 才算删成功，否则抛错
  assert.ok(
    region.includes("dr?.fileList?.[0]?.code !== 'SUCCESS'"),
    '必须按返回体逐条核对：非 SUCCESS / 缺 fileList 视为删除失败',
  );
  const failIdx = region.indexOf("!== 'SUCCESS'");
  assert.ok(
    region.slice(failIdx).includes('throw new Error('),
    '删除失败必须抛错（让调用方感知；保住「先删成功再动缓存/meta」的写序）',
  );
  // 写序不变：删对象 → 摘 storage_files → 失效缓存（缓存那句取最后一次出现，即 cloud 段的收尾）
  const delIdx = region.indexOf('deleteFile({ fileList: [fileId] })');
  const metaIdx = region.indexOf('await mutateMetaDoc((cfg) => {');
  const cacheIdx = region.lastIndexOf('treeCache.delete(id);');
  assert.ok(delIdx > -1 && delIdx < metaIdx && metaIdx < cacheIdx, '写序必须保持：先删对象成功 → 摘 storage_files → 失效缓存');
  // local 分支行为未变：仍删磁盘文件（unlink）+ 失效两处缓存，且不含任何云删除调用
  const localRegion = region.slice(region.indexOf("if (SOURCE === 'local')"), region.indexOf('const meta = await getMeta();'));
  assert.ok(localRegion.includes('if (fs.existsSync(p)) fs.unlinkSync(p);'), 'local 分支仍删 trees/<id>.json 文件');
  assert.ok(
    localRegion.includes('treeCache.delete(id);') && localRegion.includes('eventIndexCache.delete(id);'),
    'local 分支仍失效两处缓存',
  );
  assert.ok(localRegion.includes('return;'), 'local 分支仍在 SDK 段之前返回（模式隔离不变）');
  assert.ok(!localRegion.includes('deleteFile'), 'local 分支不得出现任何云删除调用');
  // 版本化历史对象的回收口径不变（本批不动）
  assert.ok(
    region.includes('由 saveTree 的清扫规则逐步回收'),
    'deleteTree 注释必须保留：版本化历史对象由 saveTree 清扫规则逐步回收（本批不引入列目录/定时清理）',
  );
});

test('⑩ 实跑（local 沙箱）：deleteTree 真删树文件 + 失效树缓存 + 幂等', async () => {
  const { deleteTree, getTree } = store;
  const p = path.join(TMP, 'trees', 't_del_real.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ tree_id: 't_del_real', version: 1, people: {} }));
  // 先读一次 ⇒ 进程内 treeCache 里有该树（删后不回幻影 = 缓存确被失效的必要前提）
  assert.equal((await getTree('t_del_real'))?.tree_id, 't_del_real', '前置：树可读且已进缓存');
  await deleteTree('t_del_real');
  assert.equal(fs.existsSync(p), false, 'local：trees/<id>.json 必须被真删');
  assert.equal(
    await getTree('t_del_real'),
    null,
    '删除后缓存必须失效（cachedTree 在盘上取不到指纹时会沿用缓存 ⇒ 不失效就会回幻影树）',
  );
  // 幂等：再删一次 / 空 id 不抛错（与既有「缓存未命中视为已删」口径一致）
  await deleteTree('t_del_real');
  assert.equal(await deleteTree(''), undefined, '空 treeId 直接返回（不抛错）');
});
