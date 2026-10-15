#!/usr/bin/env node
/**
 * 一次性数据迁移：把 zhonghua 里「黄嘉（000000415 · handle fc4707894660e16cdff1907a）」名下的
 * **真子嗣子树 S** 整支搬进《黄氏祖谱》（`huang_40644`）—— **世本侧不留痕**、详情档随迁、
 * **handle / gramps_id 一律不变**。
 *
 * ── 用途 ───────────────────────────────────────────────────────────────────────────────
 * 背景：此前在「中华世本 zhonghua」里给 415（黄嘉）直接挂了子节点，这批节点本应存在于
 * 《黄氏祖谱》（`huang_40644` 的**祖谱自有段**）⇒ 本脚本把它们**搬进祖谱**：
 *   ① 祖谱：把**顶层家族 F0**（`8501654c8e4778f90bd843a0` / `F000256`）**整体搬进祖谱** ——
 *      `handle` 与 `gramps_id` 原样不变，**仅** `father_handle` 由 415（`fc4707894660e16cdff1907a`）
 *      改指祖谱里的镜像节点 `mir_fc4707894660e16cdff1907a`（`child_handles` 与其余字段一字不动）；
 *      祖先镜像节点 `spouse_families` += `[8501654c8e4778f90bd843a0]`；并把 S 全量节点 + 内部家族集 F
 *      原样写入祖谱（`handle` / `gramps_id` / 字段原样不变；**顶层子女的 `parent_family` 本就指向 F0**，
 *      随 F0 一并迁入 ⇒ 无需改指）；
 *   ② 世本：删 S 全量节点 + 删内部家族 F + 删顶层家族 F0 + 从 415 的 `spouse_families` 移除 F0
 *      ⇒ 415 恢复「无子、无家庭」，**世本侧一字不留**（415 本身与其它一切不动）；
 *   ③ 详情档：`jiapu_person_details` 的 `zhonghua:<handle>` 复制为 `huang_40644:<handle>`
 *      （`tree_id` / `_id` / `handle` 改指祖谱；**并删除 `attributes` 里 key 以 `external_` 开头的陈旧跨树
 *      指针** —— 实测 `external_tree=zhonghua` / `external_chain_gen=…`；真身已入祖谱，留指针会误指
 *      〔前端 `api.ts` 从详情属性读跨树指针〕）→ 删旧档。
 *
 * ── 口径来源 ───────────────────────────────────────────────────────────────────────────
 * **Kevin 2026-10-15 拍定**：「415 名下的子嗣应存在祖谱，不该留在世本」⇒ 搬进祖谱、世本侧抹净。
 * 结构口径承 `docs/clan-tree.spec.md`：
 *   - §1 / §3-1：祖谱自有段（`external_*` 为空的真人节点）才是祖谱可续编区；世本只承载世系链镜像。
 *   - §3-2 / §4-2：支系真人落祖谱自有段，**不得**跳层留在世本。
 *   - §4-1：祖谱顶端镜像段只读；本脚本**只把一个家族 push 进镜像节点的 `spouse_families`**，
 *            镜像节点自身字段（含 `external_*` 指针）**一字不动**。
 * 编号口径承 `docs/id-system.spec.md` §2：**`handle` 永不改、`gramps_id` 终身不变** ⇒
 *   跨树迁移**沿用 handle 与编号**（本脚本对 S 全量节点、以及顶层家族 F0 **原样携带 `handle` 与
 *   `gramps_id`**，**不重编号、不新建家族、不写 `jiapu_id_seq`**）。
 *
 * ── 真源（云端）───────────────────────────────────────────────────────────────────────
 * 本地仓 `migrate-output/` **已归档**（见 `AGENTS.md` §7 / `docs/PENDING_DEPLOY.md` §64-6）⇒
 * 本脚本**走 CloudBase SDK 直连云端**（与 `scripts/upload-migrated-to-cloudbase.mjs` 同类）：
 *   - 树 JSON   ：云存储 `trees/<tree_id>.json`（fileID 取自集合 `jiapu_tree_meta` 的 `_meta` 档 `storage_files`）
 *   - 人物详情  ：集合 `jiapu_person_details`（`_id = "<tree_id>:<handle>"`）
 * 凭据**只走环境变量**（`CB_ENV` / `CB_SECRET_ID` / `CB_SECRET_KEY`），运行前：
 *   `set -a; . ~/.config/jiapu/cloudbase.env; set +a`
 * **本脚本只从环境变量读凭据，绝不打印密钥、不落盘。**
 *
 * ── 已知环境事实（写后校验必须容「传播延迟」）───────────────────────────────────────────
 * CloudBase 云存储 `uploadFile` → `downloadFile` **不是强一致读**：上传成功后**立即**下载，实测在
 * **秒级~分钟级**内仍可能拿回**上传前的旧副本**（集合文档 `jiapu_person_details` 同理）。
 * ⇒ 两条硬纪律：① 写后读回校验**绝不立即断言**，一律**轮询重试**（见 §④「写后读回校验」：
 * 默认 7 轮 × 间隔 10s ≈ 最多 60s，**任一轮全部校验面通过即判成功**，超时仍不符才报失败并贴出
 * 最后一轮的差异）；② 排障时「刚上传完读回是旧值」**首先怀疑传播延迟**，不要据此判定写入失败。
 *
 * ── 用法 ──────────────────────────────────────────────────────────────────────────────
 *   node scripts/migrate-clan-founder-descendants-2026-10.mjs                        # dry-run（默认：只读 + 打印清单）
 *   node scripts/migrate-clan-founder-descendants-2026-10.mjs --apply \
 *        --backup-dir=<dir>                                                          # 写盘（**必须**同时给 --backup-dir）
 *   node scripts/migrate-clan-founder-descendants-2026-10.mjs --json=<path>           # 另存摘要 JSON
 *
 *   # --summary-dir=<dir>：summary.json 与运行日志（run.log）的落点（**仅 --apply 时创建**，dry-run 零本地写入）。
 *   #   缺省 = ~/jiazu-backups/<date>-migrate-clan-descendants-run/。
 *   #   ⚠️ summary / 日志**不再写进 --backup-dir**（备份目录只保有「备份本体 + MD5-LEDGER.txt」，与操作员交接路径解耦）。
 *
 * ── 安全护栏 ──────────────────────────────────────────────────────────────────────────
 *   - **默认 dry-run**：不给 `--apply` ⇒ **零写入、零删除**（只 `downloadFile` / 只读集合 / 只计算）。
 *   - `--apply` **必须**同时给 `--backup-dir`（缺失即拒绝，退出码 2）。
 *   - 写盘前：① 两棵树 `version` **重读比对**（与规划期读到的版本不一致 ⇒ 拒绝，
 *              **不自动重试覆盖**）；② 先落备份（两棵树 JSON + S 全部详情档 + 写前 md5 台账）。
 *   - 写序：**先祖谱、后世本**；任一步失败 ⇒ 打印已执行步骤后退出（退出码 1），
 *           **不自动回滚**（由操作员用备份回滚）。
 *   - **写后读回校验 = 轮询重试**（容传播延迟，见上「已知环境事实」）：每轮**重读全部校验面**
 *           （两棵树 + F0 + S + 镜像 spouse_families + 详情档），**任一轮全部通过即判成功**；
 *           超时（默认 7 轮 × 间隔 10s ≈ 60s）仍不符 ⇒ 贴出**最后一轮的差异**并退出码 1。
 *           轮次/间隔可用 `MIGRATE_VERIFY_ROUNDS` / `MIGRATE_VERIFY_WAIT_MS` 覆盖（仅影响等待时长）。
 *   - **summary / 日志与备份物理隔离**：二者落 `--summary-dir`（缺省 `~/jiazu-backups/<date>-migrate-clan-descendants-run/`）；
 *           `--backup-dir` **只保留备份本体 + `MD5-LEDGER.txt`**（不得再往备份目录写非备份物）。
 *   - 幂等：重跑（S 空 + 祖谱已含这批节点）⇒ 报「已迁移，无操作」并 `exit 0`。
 *   - **不在无网环境执行、不自动运行**（执行由操作员手动发起）。
 *
 * ── 回滚方式（逐条）───────────────────────────────────────────────────────────────────
 *   1. **祖谱树**：把备份副本 `files/trees/huang_40644.json` 按写前字节重传云存储：
 *      `app.uploadFile({ cloudPath: 'trees/huang_40644.json', fileContent: fs.readFileSync('<backup-dir>/files/trees/huang_40644.json') })`
 *      （副本即写前整份字节，含 `version` / `updated_at`）。
 *   2. **世本树**：同法重传 `files/trees/zhonghua.json`。
 *   3. **详情档**：`files/details/zhonghua:<handle>.json`（10 档）按
 *      `db.collection('jiapu_person_details').doc('zhonghua:<handle>').set(档体去 _id)` 写回，
 *      并 `db.collection('jiapu_person_details').doc('huang_40644:<handle>').remove()` 删掉迁过去的那 10 档。
 *   4. **家庭号计数器**：本批**不取号、不写 `jiapu_id_seq`**（F0 沿用原 handle 与编号）⇒ 无计数器需还原。
 *   ⚠️ 回滚后让 compat-api 的进程内 `treeCache` 失效（TTL 15s；等一会儿或重启进程即可）。
 *
 * 退出码：0 = dry-run 完成 / 写入成功 / 幂等无操作；1 = 前置复核 / 写后自校验失败（**绝不猜**）；
 *         2 = 用法错误 / 凭据缺失 / 目标缺失。
 */
import cloudbase from '@cloudbase/node-sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// ================= 参数 =================
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
if (flag('--help') || flag('-h')) {
  console.log('用法：node scripts/migrate-clan-founder-descendants-2026-10.mjs [--apply] [--backup-dir=<dir>] [--summary-dir=<dir>] [--json=<path>]');
  console.log('  （默认 dry-run；--apply 写盘，且必须同时给 --backup-dir）');
  console.log('  --summary-dir：summary.json + run.log 的落点（缺省 ~/jiazu-backups/<date>-migrate-clan-descendants-run/；仅 --apply 时创建）');
  process.exit(0);
}
const KNOWN = new Set(['--apply', '--dry-run']);
const unknown = argv.filter((a) => !KNOWN.has(a) && !a.startsWith('--json=') && !a.startsWith('--backup-dir') && !a.startsWith('--summary-dir'));
if (unknown.length) {
  console.error(`❌ 未知参数：${unknown.join(' ')}（仅支持 --apply / --dry-run / --backup-dir=<dir> / --summary-dir=<dir> / --json=<path>）`);
  process.exit(2);
}
const APPLY = flag('--apply');
const jsonArg = argv.find((a) => a.startsWith('--json='));
const JSON_OUT = jsonArg ? path.resolve(jsonArg.slice('--json='.length)) : '';
// --backup-dir=<dir> 与 --backup-dir <dir> 两种写法都收
let BAK_DIR_ARG = '';
{
  const eq = argv.find((a) => a.startsWith('--backup-dir='));
  if (eq) BAK_DIR_ARG = path.resolve(eq.slice('--backup-dir='.length));
  else {
    const i = argv.indexOf('--backup-dir');
    if (i >= 0) {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) {
        console.error('❌ --backup-dir 缺少目录参数（写法：--backup-dir=<dir> 或 --backup-dir <dir>）');
        process.exit(2);
      }
      BAK_DIR_ARG = path.resolve(v);
    }
  }
}

/**
 * summary / 运行日志的**独立落点**（与 --backup-dir 物理隔离）。
 * 缺省 = `~/jiazu-backups/<date>-migrate-clan-descendants-run/`（仓外、持久、名字与备份目录可区分）。
 * **只在 --apply 时创建**（dry-run 零本地写入）。
 */
let SUMMARY_DIR_ARG = '';
{
  const eq = argv.find((a) => a.startsWith('--summary-dir='));
  if (eq) SUMMARY_DIR_ARG = path.resolve(eq.slice('--summary-dir='.length));
  else {
    const i = argv.indexOf('--summary-dir');
    if (i >= 0) {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) {
        console.error('❌ --summary-dir 缺少目录参数（写法：--summary-dir=<dir> 或 --summary-dir <dir>）');
        process.exit(2);
      }
      SUMMARY_DIR_ARG = path.resolve(v);
    }
  }
}
const SUMMARY_DIR =
  SUMMARY_DIR_ARG || path.join(os.homedir(), 'jiazu-backups', `${new Date().toISOString().slice(0, 10)}-migrate-clan-descendants-run`);

// ================= 本批常量（口径见文件头） =================
const SRC_TREE = 'zhonghua';                          // 世本（迁出方）
const DST_TREE = 'huang_40644';                       // 黄氏祖谱（迁入方）
const FOUNDER_HANDLE = 'fc4707894660e16cdff1907a';    // 黄嘉（000000415）在世本里的真身 handle
const FOUNDER_GRAMPS_ID = '000000415';
const MIRROR_HANDLE = 'mir_fc4707894660e16cdff1907a'; // 祖谱里该真身的镜像节点 handle
const MIRROR_LINK_TYPE = 'founder';
const TOP_FAMILY_HANDLE = '8501654c8e4778f90bd843a0'; // 顶层家族 F0（世本里 father=415 的家族）→ **整体搬进祖谱**，handle/编号原样不变
const TOP_FAMILY_GRAMPS_ID = 'F000256';               // F0 的人读编号（沿用，不重编、不取新号）
const EXTERNAL_ATTR_PREFIX = 'external_';             // 详情档陈旧跨树指针前缀：搬迁后一律删除

/**
 * 本批**实测基线清单**（纯只读探针实测；脚本仍逐条复核 `gramps_id` / `name`，不符即拒绝、零写入）。
 * 用途：① 前置复核（遍历结果必须**包含**这 10 个 handle）；② 重跑时的「已迁移」识别
 *      （此时世本侧已无 415 的家族 ⇒ 遍历得空集，靠本清单在祖谱里认形态）。
 * **S 的发现仍以遍历为准**（见 collectSubtree），本清单不参与写盘内容。
 */
const EXPECTED = [
  { handle: 'd7f71e9cb797e3b4aca2b8ad', gramps_id: '000000418', name: '黄黄奇' },
  { handle: '72e3cd45c10661dc4b06ce68', gramps_id: '000000419', name: '黄黄最' },
  { handle: '2e17224915dca6f188f92b2d', gramps_id: '000000420', name: '黄黄舒' },
  { handle: '08a5016cc5e1de2510c114a6', gramps_id: '000000421', name: '黄黄厚' },
  { handle: 'd4defa46254fa7f12fc3d0c1', gramps_id: '000000422', name: '黄黄冕' },
  { handle: 'd2dc963db355ee2cc401db16', gramps_id: '000000423', name: '黄黄凯' },
  { handle: 'f0973dcb5a133abe62317974', gramps_id: '000000424', name: '黄黄函' },
  { handle: '75959ffcf93a704e8c0b3a31', gramps_id: '000000425', name: '黄黄俞' },
  { handle: 'cf77838ddcfe9447a5684360', gramps_id: '000000426', name: '黄黄寿' },
  { handle: 'c11f002785b115fe44e02120', gramps_id: '000000427', name: '黄黄所' },
];
const EXPECTED_HANDLES = new Set(EXPECTED.map((t) => t.handle));

// ================= 凭据 / SDK =================
const ENV = process.env.CB_ENV;
const SECRET_ID = process.env.CB_SECRET_ID;
const SECRET_KEY = process.env.CB_SECRET_KEY;
if (!ENV) { console.error('❌ 缺少环境变量 CB_ENV（先 `set -a; . ~/.config/jiapu/cloudbase.env; set +a`）'); process.exit(2); }
if (!SECRET_ID || !SECRET_KEY) { console.error('❌ 缺少环境变量 CB_SECRET_ID / CB_SECRET_KEY（凭据只走环境变量，绝不入 argv）'); process.exit(2); }
const app = cloudbase.init({ env: ENV, secretId: SECRET_ID, secretKey: SECRET_KEY });
const db = app.database();

// ================= 工具 =================
const md5buf = (b) => crypto.createHash('md5').update(b).digest('hex');
const md5text = (t) => crypto.createHash('md5').update(t).digest('hex');
/** 树 JSON 的**上传字节**（与 `lib/store.js` 的 cloud 写路径同形：`JSON.stringify(tree)`、无缩进） */
const treeBytes = (tree) => Buffer.from(JSON.stringify(tree));
const treeMd5 = (tree) => md5buf(treeBytes(tree));
const isMirror = (p) => String(p?.external_mirror ?? '') === 'true';
const nowIso = () => new Date().toISOString();
/** 详情档 attribute 的 key 归一化（真源两种写法：`{key}` 或 `{type}`；前端 api.ts 同源读 `type`.string） */
const attrKeyOf = (a) =>
  typeof a?.key === 'string' ? a.key
  : typeof a?.type === 'string' ? a.type
  : typeof a?.type?.string === 'string' ? a.type.string
  : '';
/** 详情档里「陈旧跨树指针」= key 以 `external_` 开头的属性（真身已入祖谱，指针失效） */
const externalAttrsOf = (doc) =>
  (Array.isArray(doc?.attributes) ? doc.attributes : []).filter((a) => attrKeyOf(a).startsWith(EXTERNAL_ATTR_PREFIX));
/** 剥离全部 `external_*` 属性后的详情档（其余字段与属性一字不动） */
const stripExternalAttrs = (doc) => ({
  ...doc,
  attributes: (Array.isArray(doc?.attributes) ? doc.attributes : []).filter(
    (a) => !attrKeyOf(a).startsWith(EXTERNAL_ATTR_PREFIX),
  ),
});

const errors = [];
const checks = [];
const notes = [];
const err = (m) => errors.push(m);
const ok = (m) => checks.push(m);
const note = (m) => notes.push(m);

// ================= 云端读写 =================
async function readMeta() {
  const r = await db.collection('jiapu_tree_meta').doc('_meta').get();
  const d = Array.isArray(r?.data) ? r.data[0] : r?.data;
  if (!d || !d.storage_files) throw new Error('jiapu_tree_meta/_meta 缺失或没有 storage_files');
  return d;
}
async function loadTree(tid, meta) {
  const fileId = meta.storage_files[tid];
  if (!fileId) throw new Error(`tree-meta.storage_files 缺少 ${tid}`);
  const r = await app.downloadFile({ fileID: fileId });
  if (!r || !r.fileContent) throw new Error(`云存储下载失败：trees/${tid}.json`);
  return { tree: JSON.parse(Buffer.from(r.fileContent).toString('utf8')), fileId };
}
async function uploadTree(tid, tree) {
  const r = await app.uploadFile({ cloudPath: `trees/${tid}.json`, fileContent: treeBytes(tree) });
  return r?.fileID || '';
}
async function getDetailDoc(id) {
  const r = await db.collection('jiapu_person_details').doc(id).get();
  return (Array.isArray(r?.data) ? r.data[0] : r?.data) || null;
}
/** 写详情：`_id` 由 doc(id) 指定，档体剥离 `_id`（与 lib/store.js#saveDetail 同形） */
async function setDetailDoc(id, body) {
  const { _id, ...data } = body || {};
  await db.collection('jiapu_person_details').doc(id).set(data);
}
async function delDetailDoc(id) {
  await db.collection('jiapu_person_details').doc(id).remove();
}
/**
 * 本批**不新建家族、不取号、不写 `jiapu_id_seq`**（Kevin 2026-10-15 收正）：
 * 顶层家族 F0 整体搬进祖谱 ⇒ `handle` 与 `gramps_id` 沿用（承 `docs/id-system.spec.md` §2
 * 「跨树迁移沿用 handle 与编号」）⇒ 少一次 `jiapu_id_seq` 集合写、不烧号。
 */

// ================= 1. 圈定子树 S（纯读） =================
/**
 * 从一组**起始家族**出发，沿 `child_handles` 递归收集后代（每个子节点自己的 `spouse_families` 里的家族再取子女）；
 * **排除镜像节点**（`external_mirror === 'true'`，不随迁、也不计入覆盖判据）。
 * 同一原语两处复用：世本侧「圈定 S」（起点 = 父/母为 415 的家族）、祖谱侧「已迁移识别」（起点 = 镜像节点的 spouse_families）。
 * @returns {{people:Set<string>, families:Set<string>}} people = 非镜像后代 handle；families = 被触达的家族（含起始家族）
 */
function walkFromFamilies(tree, startFamHandles) {
  const P = tree.people || {};
  const F = tree.families || {};
  const people = new Set();
  const families = new Set();
  const queue = [...startFamHandles];
  while (queue.length) {
    const fh = queue.shift();
    if (families.has(fh)) continue;
    families.add(fh);
    const fam = F[fh];
    if (!fam) continue;
    for (const c of fam.child_handles || []) {
      if (!c || people.has(c) || isMirror(P[c])) continue;
      people.add(c);
      for (const sf of P[c]?.spouse_families || []) if (!families.has(sf)) queue.push(sf);
    }
  }
  return { people, families };
}

/**
 * 圈定子树 S：起点 = 世本里「`father_handle` / `mother_handle` === FOUNDER_HANDLE」的顶层家族 F0；
 * 递归下钻、排除镜像（见 walkFromFamilies）。
 * @returns {{S:Set<string>, F0:Set<string>, F:Set<string>, topChildren:string[], touched:Set<string>, order:string[], seenFam:Set<string>}}
 */
function collectSubtree(tree) {
  const P = tree.people || {};
  const F = tree.families || {};
  const F0 = new Set(
    Object.entries(F)
      .filter(([, f]) => f && (f.father_handle === FOUNDER_HANDLE || f.mother_handle === FOUNDER_HANDLE))
      .map(([fh]) => fh),
  );
  const { people: S, families: seenFam } = walkFromFamilies(tree, [...F0]);
  const order = []; // 稳定插入序（按源树 people 键序）
  for (const h of Object.keys(P)) if (S.has(h)) order.push(h);
  // 内部家族 F：father / mother / child **全在 S 内**（F0 不算内部）；其余触达家族记入 touched 供人工过目
  const Fint = new Set();
  const touched = new Set();
  for (const fh of seenFam) {
    if (F0.has(fh)) continue;
    const fam = F[fh];
    if (!fam) continue;
    const slotsOk =
      (!fam.father_handle || S.has(fam.father_handle)) && (!fam.mother_handle || S.has(fam.mother_handle));
    const kidsOk = (fam.child_handles || []).every((c) => S.has(c));
    if (slotsOk && kidsOk) Fint.add(fh);
    else touched.add(fh);
  }
  // 顶层子女 = F0 里、且 ∈ S 的子女（顺序按 F0 家族 child_handles 序）
  const topChildren = [];
  for (const fh of F0) for (const c of F[fh]?.child_handles || []) if (S.has(c)) topChildren.push(c);
  return { S, F0, F: Fint, topChildren, touched, order, seenFam };
}

// ================= 主流程 =================
const t0 = Date.now();
let meta;
try {
  meta = await readMeta();
} catch (e) {
  console.error(`❌ 读 tree-meta 失败：${e.message}`);
  process.exit(2);
}

let srcLoaded, dstLoaded;
try {
  srcLoaded = await loadTree(SRC_TREE, meta);
  dstLoaded = await loadTree(DST_TREE, meta);
} catch (e) {
  console.error(`❌ 读树失败：${e.message}`);
  process.exit(2);
}
const srcTree = srcLoaded.tree;
const dstTree = dstLoaded.tree;

console.log('═'.repeat(120));
console.log('把黄嘉（415）名下真子嗣子树迁入《黄氏祖谱》 —— scripts/migrate-clan-founder-descendants-2026-10.mjs');
console.log(`环境     ：${ENV}    凭据路径：CB_SECRET_ID/CB_SECRET_KEY（环境变量，脚本不打印密钥）`);
console.log(`世本     ：${SRC_TREE}  people=${Object.keys(srcTree.people || {}).length}  families=${Object.keys(srcTree.families || {}).length}  version=${srcTree.version}  updated_at=${srcTree.updated_at}`);
console.log(`祖谱     ：${DST_TREE}  kind=${dstTree.kind ?? ''}  people=${Object.keys(dstTree.people || {}).length}  families=${Object.keys(dstTree.families || {}).length}  version=${dstTree.version}  updated_at=${dstTree.updated_at}`);
console.log(`模式     ：${APPLY ? '--apply（写盘）' : 'dry-run（只读，不写盘）'}`);
console.log('═'.repeat(120));

// ---- 前置复核 ①：415 在世本存在 ----
const founder = (srcTree.people || {})[FOUNDER_HANDLE];
if (!founder) err(`世本 ${SRC_TREE} 找不到 415（handle ${FOUNDER_HANDLE}）`);

// ---- 前置复核 ②：祖谱里对应镜像节点存在且形态正确 ----
const mirror = (dstTree.people || {})[MIRROR_HANDLE];
if (!mirror) err(`祖谱 ${DST_TREE} 找不到镜像节点（handle ${MIRROR_HANDLE}）`);
else {
  if (String(mirror.external_person_handle || '') !== FOUNDER_HANDLE)
    err(`祖谱镜像节点 external_person_handle ≠ ${FOUNDER_HANDLE}（实为 ${mirror.external_person_handle}）`);
  if (String(mirror.external_link_type || '') !== MIRROR_LINK_TYPE)
    err(`祖谱镜像节点 external_link_type ≠ '${MIRROR_LINK_TYPE}'（实为 ${mirror.external_link_type}）`);
  if (!isMirror(mirror)) err(`祖谱镜像节点 external_mirror ≠ 'true'`);
}

// ---- 圈定 S（纯读） ----
const sub = collectSubtree(srcTree);
const { S, F0, order, topChildren } = sub;
const F = sub.F;
const srcPeopleBefore = Object.keys(srcTree.people || {}).length;
const srcFamiliesBefore = Object.keys(srcTree.families || {}).length;
const dstPeopleBefore = Object.keys(dstTree.people || {}).length;
const dstFamiliesBefore = Object.keys(dstTree.families || {}).length;

const dstHasAllExpected = EXPECTED.every((t) => !!(dstTree.people || {})[t.handle]);
const srcHasAnyExpected = EXPECTED.some((t) => !!(srcTree.people || {})[t.handle]);
const mirrorHasFamily = Array.isArray(mirror?.spouse_families) && mirror.spouse_families.length > 0;

// ---- 状态判定（三态） ----
let STATE;
if (!founder || !mirror) STATE = '异常';
else if (S.size > 0 && !dstHasAllExpected) STATE = '待迁移';
else if (S.size === 0 && !srcHasAnyExpected && dstHasAllExpected && mirrorHasFamily) STATE = '已迁移';
else STATE = '异常';

// dry/apply 通用的「基线复核」：待迁移态必须覆盖实测基线
if (STATE === '待迁移') {
  for (const t of EXPECTED) {
    if (!S.has(t.handle)) { err(`基线节点未在遍历结果中：${t.gramps_id}（handle ${t.handle}）—— 数据已变，拒绝`); continue; }
    const p = srcTree.people[t.handle];
    if (String(p?.gramps_id || '') !== t.gramps_id) err(`编号不符：${t.handle} 期望 ${t.gramps_id} 实为 ${p?.gramps_id}`);
    if (String(p?.name || '') !== t.name) err(`姓名不符：${t.handle} 期望「${t.name}」实为「${p?.name}」`);
    if (isMirror(p)) err(`基线节点竟是镜像（不应随迁）：${t.handle}`);
  }
  for (const h of order) if (!EXPECTED_HANDLES.has(h)) notes.push(`⚠️ 遍历发现基线外的新节点：${h}（gramps_id=${srcTree.people[h]?.gramps_id}、name=${srcTree.people[h]?.name}）—— 一并随迁`);
  if (topChildren.length === 0) err('顶层子女为空（F0 无 ∈ S 的子女）—— 拒绝');
  // F0 必须恰是「父/母 = 415 且子女 ∈ S」的家族
  for (const fh of F0) {
    const fam = (srcTree.families || {})[fh];
    const bad = (fam?.child_handles || []).filter((c) => !S.has(c));
    if (bad.length) err(`F0 ${fh} 含非 S 子女：${bad.join(', ')}`);
  }
  // F0 必须是实测基线那**一个**顶层家族（整体搬进祖谱：handle / 编号原样，仅 father_handle 改指镜像）
  if (!F0.has(TOP_FAMILY_HANDLE)) {
    err(`F0 不含实测基线顶层家族 ${TOP_FAMILY_HANDLE}（实测 ${[...F0].join(', ') || '空'}）—— 数据已变，拒绝`);
  } else {
    const tf = srcTree.families[TOP_FAMILY_HANDLE];
    if (String(tf?.gramps_id || '') !== TOP_FAMILY_GRAMPS_ID)
      err(`顶层家族 ${TOP_FAMILY_HANDLE} 编号不符：期望 ${TOP_FAMILY_GRAMPS_ID} 实为 ${tf?.gramps_id}`);
    if (String(tf?.father_handle || '') !== FOUNDER_HANDLE)
      err(`顶层家族 ${TOP_FAMILY_HANDLE} 的 father_handle ≠ 415（实为 ${tf?.father_handle}）—— 无法改指镜像`);
  }
  if (F0.size !== 1) err(`F0 家族数 ≠ 1（实测 ${F0.size} 个：${[...F0].join(', ')}）—— 本批口径只搬实测那一个，拒绝`);
  // 415 的 spouse_families 必须恰含 F0（迁后移除 ⇒ 无子无家庭）
  for (const fh of F0) {
    if (!(founder?.spouse_families || []).includes(fh)) err(`415 的 spouse_families 不含 F0 ${fh}（迁后无法「不留痕」）`);
  }
  // 内部家族 F 的槽位完整性（father/mother 非空必须在 S 内）
  for (const fh of F) {
    const fam = srcTree.families[fh];
    if (fam.father_handle && !S.has(fam.father_handle)) err(`内部家族 ${fh} 的 father 不在 S：${fam.father_handle}`);
    if (fam.mother_handle && !S.has(fam.mother_handle)) err(`内部家族 ${fh} 的 mother 不在 S：${fam.mother_handle}`);
  }
  // S 每个节点在祖谱中**尚不存在**（迁入前）
  const alreadyInDst = [...S].filter((h) => dstTree.people[h]);
  if (alreadyInDst.length) err(`以下节点已在祖谱中（拒绝覆盖）：${alreadyInDst.join(', ')}`);
  // F / F0 的 handle 在祖谱中不得占用
  const famClash = [...F, ...F0].filter((h) => dstTree.families[h]);
  if (famClash.length) err(`以下家族 handle 已在祖谱中：${famClash.join(', ')}`);
  // 415 的其它结构不得被本批牵连：415 的 parent_family 不变、除 F0 外 spouse_families 不变
  ok(`状态判定：待迁移（S ${S.size} 人 / 内部家族 F ${F.size} 个 / 顶层家族 F0 ${F0.size} 个）`);
}
if (STATE === '已迁移') {
  const mf = Array.isArray(mirror.spouse_families) ? mirror.spouse_families : [];
  const reach = walkFromFamilies(dstTree, mf).people; // 祖谱侧从镜像节点旗下重走一遍
  if (mf.length === 0) err('祖谱镜像节点没有 spouse_families（无承载子嗣的家族）');
  const missReach = EXPECTED.filter((t) => !reach.has(t.handle));
  if (missReach.length) err(`祖谱镜像节点旗下未覆盖基线节点：${missReach.map((t) => `${t.gramps_id}/${t.handle}`).join('、')}`);
  for (const t of EXPECTED) {
    const p = (dstTree.people || {})[t.handle];
    if (!p) { err(`祖谱缺基线节点：${t.gramps_id}（handle ${t.handle}）`); continue; }
    if (String(p.gramps_id || '') !== t.gramps_id) err(`祖谱编号不符：${t.handle} 期望 ${t.gramps_id} 实为 ${p.gramps_id}`);
    if (String(p.name || '') !== t.name) err(`祖谱姓名不符：${t.handle} 期望「${t.name}」实为「${p.name}」`);
  }
  if (!dstTree.families?.[(dstTree.people?.[EXPECTED[0].handle] || {}).parent_family]) err('祖谱顶层子女的 parent_family 不存在');
  if ((founder?.spouse_families || []).length > 0) err('世本 415 仍有 spouse_families（世本侧未抹净）');
  const famOfChild = (dstTree.people || {})[EXPECTED[0].handle]?.parent_family;
  if (famOfChild && !mf.includes(famOfChild)) err('祖谱顶层子女的 parent_family 不在镜像节点的 spouse_families 里');
}
if (STATE === '异常') {
  if (S.size > 0 && dstHasAllExpected) err('世本侧待迁子树仍在，且祖谱已含这批节点 ⇒ 半迁移残局，拒绝');
  else if (S.size === 0 && !dstHasAllExpected) err('世本侧已无 415 子树，祖谱却缺这批节点 ⇒ 数据不一致，拒绝');
  else err(`状态异常（S=${S.size} / 祖谱已含基线=${dstHasAllExpected} / 世本仍含基线=${srcHasAnyExpected} / 镜像有家族=${mirrorHasFamily}）`);
}
// ---- 打印 S 清单 ----
console.log(`\n【子树 S 清单】（${S.size} 个真人节点 · 排除镜像 · 来源 = 世本 ${SRC_TREE}）`);
for (const h of order) {
  const p = srcTree.people[h];
  console.log(`  ${String(p?.gramps_id ?? '').padEnd(11)}${h}  「${p?.name ?? ''}」  parent_family=${p?.parent_family ?? ''}  spouse_families=${JSON.stringify(p?.spouse_families ?? [])}`);
}
console.log(`\n【内部家族集 F】（${F.size} 个 · father/mother/child 全在 S 内 · 原样写入祖谱）`);
for (const fh of F) {
  const fam = srcTree.families[fh];
  console.log(`  ${fh}  ${fam?.gramps_id ?? ''}  father=${fam?.father_handle ?? ''}  mother=${fam?.mother_handle ?? ''}  children=${JSON.stringify(fam?.child_handles ?? [])}`);
}
console.log(`\n【顶层家族 F0】（${F0.size} 个 · 父/母 = 415 且子女 ∈ S · **整体搬进祖谱**、世本侧删除）`);
for (const fh of F0) {
  const fam = srcTree.families[fh];
  console.log(`  ${fh}  ${fam?.gramps_id ?? ''}  father=${fam?.father_handle ?? ''}  children=${JSON.stringify(fam?.child_handles ?? [])}`);
}
console.log(`\n【顶层子女】（${topChildren.length} 个 → 由搬入祖谱的 F0 承载，parent_family 原样指向 F0）`);
for (const c of topChildren) console.log(`  ${srcTree.people[c]?.gramps_id ?? ''}  ${c}  「${srcTree.people[c]?.name ?? ''}」`);
if (sub.touched.size) console.log(`\n⚠️ 遍历触达但未纳入 F 的家族（非内部，需人工过目）：${[...sub.touched].join(', ')}`);
for (const m of notes) console.log(`  ${m}`);

// ---- 前置不合格 ⇒ 报错退出、零写入 ----
if (STATE === '待迁移' && errors.length) {
  for (const e of errors) console.error(`  ❌ ${e}`);
  console.error('❌ 前置复核失败，**未写入任何云端对象**（退出码 1）。');
  process.exit(1);
}
if (STATE === '异常') {
  for (const e of errors) console.error(`  ❌ ${e}`);
  console.error('❌ 状态异常，**未写入任何云端对象**（退出码 1）。');
  process.exit(1);
}
// 任何前置报错 ⇒ 一律零写入（含「已迁移」态：形态不符也拒绝放行）
if (errors.length) {
  for (const e of errors) console.error(`  ❌ ${e}`);
  console.error('❌ 前置复核失败，**未写入任何云端对象**（退出码 1）。');
  process.exit(1);
}

// ================= 规划写入内容（内存构造，dry-run 只打印） =================
const now = nowIso();

// 祖谱树（next）：F0 整体搬入（仅 father_handle → 镜像）；镜像节点 spouse_families += F0；
//                   S 全量 people 原样（顶层子女 parent_family 本就指向 F0）；内部家族 F 原样
const dstPeopleNext = { ...(dstTree.people || {}) };
for (const h of order) dstPeopleNext[h] = { ...srcTree.people[h] };
const dstFamiliesNext = { ...(dstTree.families || {}) };
for (const fh of F) dstFamiliesNext[fh] = { ...srcTree.families[fh] };
for (const fh of F0) {
  const fam = srcTree.families[fh];
  const moved = { ...fam }; // handle / gramps_id / child_handles / 其余字段原样
  if (fam.father_handle === FOUNDER_HANDLE) moved.father_handle = MIRROR_HANDLE;
  if (fam.mother_handle === FOUNDER_HANDLE) moved.mother_handle = MIRROR_HANDLE;
  dstFamiliesNext[fh] = moved;
}
const dstPeopleNextObj = { ...mirror, spouse_families: [...(mirror.spouse_families || []), ...F0] };
dstPeopleNext[MIRROR_HANDLE] = dstPeopleNextObj;
const dstTreeNext = {
  ...dstTree,
  people: dstPeopleNext,
  families: dstFamiliesNext,
  version: (Number(dstTree.version) || 0) + 1,
  updated_at: now,
};

// 世本树（next）：删 S + 删 F + 删 F0 + 415 的 spouse_families 移除 F0
const srcPeopleNext = {};
for (const [h, p] of Object.entries(srcTree.people || {})) if (!S.has(h)) srcPeopleNext[h] = p;
srcPeopleNext[FOUNDER_HANDLE] = { ...founder, spouse_families: (founder.spouse_families || []).filter((fh) => !F0.has(fh)) };
const srcFamiliesNext = {};
for (const [fh, fam] of Object.entries(srcTree.families || {})) if (!F.has(fh) && !F0.has(fh)) srcFamiliesNext[fh] = fam;
const srcTreeNext = {
  ...srcTree,
  people: srcPeopleNext,
  families: srcFamiliesNext,
  version: (Number(srcTree.version) || 0) + 1,
  updated_at: now,
};

// 详情档迁移计划
const detailPlan = [];
for (const h of order) detailPlan.push({ handle: h, srcId: `${SRC_TREE}:${h}`, dstId: `${DST_TREE}:${h}`, gramps_id: srcTree.people[h]?.gramps_id, name: srcTree.people[h]?.name });

// 详情档「陈旧跨树指针」清理计划：逐档实测 `attributes` 里 key 以 `external_` 开头的属性（只读；dry-run 逐档列出）
const detailExtPlan = [];
for (const t of EXPECTED) {
  const id = STATE === '已迁移' ? `${DST_TREE}:${t.handle}` : `${SRC_TREE}:${t.handle}`;
  const doc = await getDetailDoc(id).catch(() => null);
  detailExtPlan.push({
    id,
    handle: t.handle,
    gramps_id: t.gramps_id,
    present: !!doc,
    external_keys: doc ? externalAttrsOf(doc).map(attrKeyOf) : [],
  });
}
const extKeyCount = detailExtPlan.reduce((n, d) => n + d.external_keys.length, 0);

// 期望计数（写后）
const expDstPeople = dstPeopleBefore + S.size;
const expDstFamilies = dstFamiliesBefore + F.size + F0.size; // F0 整体搬入祖谱（不新建家族、不取号）
const expSrcPeople = srcPeopleBefore - S.size;
const expSrcFamilies = srcFamiliesBefore - F.size - F0.size;

const md5 = {
  src: { before: treeMd5(srcTree), after_expected: treeMd5(srcTreeNext) },
  dst: { before: treeMd5(dstTree), after_expected: treeMd5(dstTreeNext) },
};

if (STATE !== '已迁移') {
console.log(`\n【计划写入 · 祖谱 ${DST_TREE}】version ${dstTree.version} → ${dstTreeNext.version}`);
console.log(`  搬入顶层家族 F0  handle=${TOP_FAMILY_HANDLE}  gramps_id=${TOP_FAMILY_GRAMPS_ID}（handle / 编号原样、不取新号）  father ${FOUNDER_HANDLE} → ${MIRROR_HANDLE}  children=${JSON.stringify(srcTree.families[TOP_FAMILY_HANDLE]?.child_handles ?? [])}`);
console.log(`  镜像节点 ${MIRROR_HANDLE}  spouse_families：${JSON.stringify(mirror.spouse_families || [])} → ${JSON.stringify(dstPeopleNextObj.spouse_families)}`);
console.log(`  写入 S 节点 ${S.size} 个（handle/gramps_id/字段原样，parent_family 原样指向 F0）+ 内部家族 ${F.size} 个（原样）+ 搬入 F0 ${F0.size} 个`);
console.log(`  计数：people ${dstPeopleBefore} → ${expDstPeople}   families ${dstFamiliesBefore} → ${expDstFamilies}`);
console.log(`  md5：${md5.dst.before} → ${md5.dst.after_expected}`);
console.log(`【计划写入 · 世本 ${SRC_TREE}】version ${srcTree.version} → ${srcTreeNext.version}`);
console.log(`  删 S 节点 ${S.size} 个 + 内部家族 ${F.size} 个 + 顶层家族 F0 ${F0.size} 个（F0 已搬进祖谱）；415 的 spouse_families：${JSON.stringify(founder?.spouse_families || [])} → ${JSON.stringify(srcPeopleNext[FOUNDER_HANDLE].spouse_families)}`);
console.log(`  计数：people ${srcPeopleBefore} → ${expSrcPeople}   families ${srcFamiliesBefore} → ${expSrcFamilies}`);
console.log(`  md5：${md5.src.before} → ${md5.src.after_expected}`);
console.log(`【计划详情档】${detailPlan.length} 档：${SRC_TREE}:<handle> → ${DST_TREE}:<handle>（仅 tree_id/_id/handle 改指祖谱；随后删旧档）`);
console.log(`  并删除陈旧跨树属性（key 以 ${EXTERNAL_ATTR_PREFIX} 开头，实测共 ${extKeyCount} 条）—— 逐档：`);
for (const d of detailExtPlan) {
  const shown = !d.present ? '⚠️ 详情档缺失' : d.external_keys.length ? d.external_keys.join(', ') : '（无 external_* 属性）';
  console.log(`    ${d.id.padEnd(46)} → ${shown}`);
}
}

// ================= dry-run / 幂等：到此为止（零写入） =================
// 「已迁移」态：dry-run 与 --apply 都只报形态、零写入、退出码 0（幂等）。
// 注：本块必须放在「计划写入内容」之后 —— buildSummary 会读 md5 / 计数等 const（前置会踩 TDZ）。
if (STATE === '已迁移') {
  const mf = Array.isArray(mirror.spouse_families) ? mirror.spouse_families : [];
  const reach = walkFromFamilies(dstTree, mf).people;
  console.log('\n' + '─'.repeat(120));
  console.log(`✅ 已迁移，无操作：世本 ${SRC_TREE} 里已无 415 名下子树（S 空），祖谱 ${DST_TREE} 已含全部 ${EXPECTED.length} 个基线节点` +
    `（镜像节点 spouse_families=${JSON.stringify(mf)}、旗下覆盖 ${reach.size} 个非镜像节点）。`);
  console.log('   零写入、零删除；两棵树与详情档一字未动（幂等）。退出码 0。');
  const summary = buildSummary({ state: STATE, applied: false, backupDir: '', agg: null, written: [] });
  console.log(JSON.stringify(summary, null, 2));
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  process.exit(0);
}

// ================= dry-run：到此为止（零写入） =================
if (!APPLY) {
  console.log('\n' + '─'.repeat(120));
  console.log('dry-run：**未写入 / 未删除任何云端对象**。');
  console.log(`  · 世本 md5 现盘复算 = ${treeMd5(srcTree)}（未写盘）`);
  console.log(`  · 祖谱 md5 现盘复算 = ${treeMd5(dstTree)}（未写盘）`);
  console.log('  加 --apply --backup-dir=<dir> 才真正写入（先备份、先祖谱后世本、写后读回校验）。');
  const summary = buildSummary({ state: STATE, applied: false, backupDir: '', agg: null, written: [] });
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  process.exit(0);
}

// ================= --apply：护栏 + 备份 + 写入 =================
const executedSteps = [];
if (!BAK_DIR_ARG) {
  console.error('❌ --apply 必须同时提供 --backup-dir=<dir>（拒绝在无备份的前提下写盘，退出码 2）。');
  process.exit(2);
}
const bakDir = BAK_DIR_ARG;

// ---- 运行日志 / summary 落**独立目录**（红线：--backup-dir 只保有备份本体 + MD5-LEDGER.txt） ----
fs.mkdirSync(SUMMARY_DIR, { recursive: true });
const RUN_LOG = path.join(SUMMARY_DIR, 'run.log');
const toLogLine = (a) => {
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch { return String(a); }
};
const origLog = console.log.bind(console);
const origErr = console.error.bind(console);
// 用 appendFileSync（同步）而非 WriteStream：process.exit() 会丢弃未 flush 的流缓冲 ⇒ 日志被截断。
const tee = (orig) => (...args) => {
  try { fs.appendFileSync(RUN_LOG, args.map(toLogLine).join('\n') + '\n'); } catch { /* 日志失败不阻断迁移 */ }
  return orig(...args);
};
console.log = tee(origLog);
console.error = tee(origErr);
console.log(`【独立目录】summary.json / 运行日志落 ${SUMMARY_DIR}（--summary-dir；--backup-dir 只保有备份本体 + MD5-LEDGER.txt）`);
console.log(`【运行日志】${RUN_LOG}`);

fs.mkdirSync(bakDir, { recursive: true });
fs.mkdirSync(path.join(bakDir, 'files', 'trees'), { recursive: true });
fs.mkdirSync(path.join(bakDir, 'files', 'details'), { recursive: true });

// ---- 护栏：写盘前重读两棵树 version（与规划期读到的比对；漂移 ⇒ 拒绝、不自动重试覆盖） ----
let srcRe, dstRe;
try {
  srcRe = await loadTree(SRC_TREE, meta);
  dstRe = await loadTree(DST_TREE, meta);
} catch (e) {
  console.error(`❌ 写前重读失败（放弃写盘）：${e.message}`);
  process.exit(1);
}
console.log(`\n【写前 version 重读】世本=${srcRe.tree.version}（规划期 ${srcTree.version}）  祖谱=${dstRe.tree.version}（规划期 ${dstTree.version}）`);
if (Number(srcRe.tree.version) !== Number(srcTree.version)) {
  console.error(`❌ 世本 version 已漂移（${srcTree.version} → ${srcRe.tree.version}）⇒ 拒绝覆盖，退出码 1。请重跑 dry-run 重新规划。`);
  process.exit(1);
}
if (Number(dstRe.tree.version) !== Number(dstTree.version)) {
  console.error(`❌ 祖谱 version 已漂移（${dstTree.version} → ${dstRe.tree.version}）⇒ 拒绝覆盖，退出码 1。请重跑 dry-run 重新规划。`);
  process.exit(1);
}
if (treeMd5(srcRe.tree) !== md5.src.before || treeMd5(dstRe.tree) !== md5.dst.before) {
  console.error('❌ 写前重读的树字节与规划期不一致（md5 不符）⇒ 拒绝覆盖，退出码 1。');
  process.exit(1);
}

// ---- 备份（先落盘成功，才继续） ----
const ledgerBefore = [];
const writeBackup = (rel, buf) => {
  const dest = path.join(bakDir, 'files', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  const m = md5buf(fs.readFileSync(dest));
  if (m !== md5buf(buf)) throw new Error(`备份副本 md5 不符：${rel}`);
  return m;
};
try {
  const mSrc = writeBackup(path.join('trees', `${SRC_TREE}.json`), treeBytes(srcTree));
  const mDst = writeBackup(path.join('trees', `${DST_TREE}.json`), treeBytes(dstTree));
  ledgerBefore.push(`${mSrc}  trees/${SRC_TREE}.json  (version=${srcTree.version})`);
  ledgerBefore.push(`${mDst}  trees/${DST_TREE}.json  (version=${dstTree.version})`);
  for (const d of detailPlan) {
    const doc = await getDetailDoc(d.srcId);
    if (!doc) throw new Error(`详情档缺失：${d.srcId}`);
    const m = writeBackup(path.join('details', `${d.srcId}.json`), Buffer.from(JSON.stringify(doc)));
    ledgerBefore.push(`${m}  details/${d.srcId}.json  (gramps_id=${d.gramps_id})`);
  }
} catch (e) {
  console.error(`❌ 备份失败，**未写任何云端对象**：${e.message}`);
  process.exit(1);
}
console.log(`\n📦 备份已落：${bakDir}（files/trees/ 2 份 + files/details/ ${detailPlan.length} 档 + MD5-LEDGER.txt）`);

// ---- ① 写祖谱（先；F0 整体搬入，不取号、不写 jiapu_id_seq） ----
try {
  const fid = await uploadTree(DST_TREE, dstTreeNext);
  executedSteps.push(`① 写祖谱 ${DST_TREE}（version ${dstTree.version}→${dstTreeNext.version}、搬入 F0 handle=${TOP_FAMILY_HANDLE} gramps_id=${TOP_FAMILY_GRAMPS_ID}、uploadFile fileID=${fid || '(未返回)'}）`);
  console.log(`✅ ① 已写祖谱 ${DST_TREE}：搬入 F0 handle=${TOP_FAMILY_HANDLE}  gramps_id=${TOP_FAMILY_GRAMPS_ID}  version→${dstTreeNext.version}`);
} catch (e) {
  console.error(`\n❌ 写祖谱失败：${e.message}`);
  for (const s of executedSteps) console.error(`   已执行：${s}`);
  console.error('   未写世本、未动详情档。**不自动回滚** —— 请用备份回滚祖谱（见文件头「回滚方式」）。退出码 1。');
  process.exit(1);
}

// ---- ② 写世本（后） ----
try {
  const fid = await uploadTree(SRC_TREE, srcTreeNext);
  executedSteps.push(`② 写世本 ${SRC_TREE}（version ${srcTree.version}→${srcTreeNext.version}、删 S ${S.size} + F ${F.size} + F0 ${F0.size}、uploadFile fileID=${fid || '(未返回)'}）`);
  console.log(`✅ ② 已写世本 ${SRC_TREE}：删 S ${S.size} 人 / 内部家族 ${F.size} 个 / 顶层家族 ${F0.size} 个；version→${srcTreeNext.version}`);
} catch (e) {
  console.error(`\n❌ 写世本失败：${e.message}`);
  for (const s of executedSteps) console.error(`   已执行：${s}`);
  console.error('   ⇒ 半成品：祖谱已写入、世本未变（同一批人暂时两侧都有）。**不自动回滚** —— 请用备份回滚祖谱后重试（见文件头「回滚方式」）。退出码 1。');
  process.exit(1);
}

// ---- ③ 详情档迁移（读旧 → 剥离 external_* → 写新 → 删旧） ----
let detailsMoved = 0;
let extRemoved = 0;
const detailSnapshot = new Map(); // dstId → 写前 attributes（供写后读回逐字比对）
try {
  for (const d of detailPlan) {
    const doc = await getDetailDoc(d.srcId);
    if (!doc) throw new Error(`详情档缺失：${d.srcId}`);
    detailSnapshot.set(d.dstId, Array.isArray(doc.attributes) ? doc.attributes : []);
    extRemoved += externalAttrsOf(doc).length; // 本次实际删掉的陈旧跨树属性条数
    const body = { ...stripExternalAttrs(doc), _id: d.dstId, tree_id: DST_TREE, handle: d.handle };
    await setDetailDoc(d.dstId, body);
    await delDetailDoc(d.srcId);
    detailsMoved += 1;
  }
  executedSteps.push(`③ 详情档迁移 ${detailsMoved} 档（${SRC_TREE}:* → ${DST_TREE}:*，删旧）+ 删陈旧 external_* 属性 ${extRemoved} 条`);
  console.log(`✅ ③ 已迁详情档 ${detailsMoved} 档（仅 tree_id/_id/handle 改指祖谱；已删陈旧 external_* 属性 ${extRemoved} 条；旧档已删）`);
} catch (e) {
  console.error(`\n❌ 详情档迁移失败（已迁 ${detailsMoved}/${detailPlan.length}）：${e.message}`);
  for (const s of executedSteps) console.error(`   已执行：${s}`);
  console.error('   ⇒ 半成品：结构已两侧一致、详情档部分迁完。**不自动回滚** —— 请用备份回滚（见文件头「回滚方式」）。退出码 1。');
  process.exit(1);
}

// ================= ④ 写后读回校验（轮询重试：容云存储传播延迟） =================
// 已知环境事实：云存储 `uploadFile` → `downloadFile` **不是强一致读** —— 上传成功后立即下载，实测在
// 秒级~分钟级内仍可能拿回**上传前的旧副本**（详情档集合同理）⇒ **绝不立即断言**。
// 本段每轮**重读全部校验面**（两棵树 + F0 + S + 镜像 spouse_families + 详情档），
// **任一轮全部通过即判成功**；超时（默认 7 轮 × 间隔 10s ≈ 60s）才失败，并贴出**最后一轮的差异**。
// 轮次 / 间隔可用 MIGRATE_VERIFY_ROUNDS / MIGRATE_VERIFY_WAIT_MS 覆盖（首轮立即执行、不等待）。
const VERIFY_ROUNDS = Math.max(1, Number(process.env.MIGRATE_VERIFY_ROUNDS || 7));
const VERIFY_WAIT_MS = Math.max(0, Number(process.env.MIGRATE_VERIFY_WAIT_MS || 10000));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 「每个上传对象」首次读回可见（传播完成）的轮次：0 = 截至末轮仍不可见 —— 供失败定位 */
const objVisibleAt = { dst_tree: 0, src_tree: 0, details: 0 };

/**
 * 跑**一轮**写后读回校验（纯只读；每轮重读全部校验面）。
 * 校验条目与加固前**逐字相同**，只是把「即时断言」改为「按上传对象分组收集」：
 * 分组通过 ⇒ 该上传对象已可读回；任一轮 bad === 0 ⇒ 整批判成功。
 * @returns {{bad:number, lines:string[], dstTreeOk:boolean, srcTreeOk:boolean, detailsOk:boolean, md5SrcAfter:string, md5DstAfter:string}}
 */
async function runPostWriteVerify() {
  const lines = [];
  let bad = 0;
  const vcheck = (label, cond) => { if (!cond) bad += 1; lines.push(`  ${cond ? '✅' : '❌'} ${label}`); };

  const dstAfter = (await loadTree(DST_TREE, meta)).tree;
  const srcAfter = (await loadTree(SRC_TREE, meta)).tree;
  const md5SrcAfter = treeMd5(srcAfter);
  const md5DstAfter = treeMd5(dstAfter);

  const dstP = dstAfter.people || {};
  const dstF = dstAfter.families || {};
  const srcP = srcAfter.people || {};
  const srcF = srcAfter.families || {};

  // ── 上传对象 ①：祖谱树（trees/<DST_TREE>.json）的校验面 ──
  // 祖谱：S 全在、F 全在、F0 整体搬入（仅父改指镜像）、镜像 push 了 F0、字段原样
  vcheck(`祖谱 people 含 S 全部 ${S.size} 个节点`, order.every((h) => !!dstP[h]));
  vcheck(`祖谱 families 含 F 全部 ${F.size} 个（原样）+ 搬入 F0 ${F0.size} 个`, [...F].every((fh) => !!dstF[fh]) && [...F0].every((fh) => !!dstF[fh]));
  // —— 新增校验①（收正口径）：祖谱里 F0 存在且 father_handle=mir_…、child_handles 含 d7f71e9cb797e3b4aca2b8ad ——
  vcheck(`祖谱 F0（${TOP_FAMILY_HANDLE}）在位：father_handle=${MIRROR_HANDLE} 且 child_handles 含 ${EXPECTED[0].handle}`,
    !!dstF[TOP_FAMILY_HANDLE] && dstF[TOP_FAMILY_HANDLE].father_handle === MIRROR_HANDLE &&
    (dstF[TOP_FAMILY_HANDLE].child_handles || []).includes(EXPECTED[0].handle));
  vcheck(`祖谱 F0 形态：handle / gramps_id / child_handles 原样，仅 father_handle → 镜像`,
    [...F0].every((fh) => {
      const before = srcTree.families[fh];
      const after = dstF[fh];
      return !!after && after.handle === fh && String(after.gramps_id || '') === String(before.gramps_id || '') &&
        JSON.stringify(after.child_handles || []) === JSON.stringify(before.child_handles || []) &&
        after.father_handle === MIRROR_HANDLE && String(after.mother_handle || '') === String(before.mother_handle || '');
    }));
  vcheck(`祖谱 F0 编号原样 = ${TOP_FAMILY_GRAMPS_ID}（不重编、未取新号）`, String(dstF[TOP_FAMILY_HANDLE]?.gramps_id || '') === TOP_FAMILY_GRAMPS_ID);
  vcheck(`祖谱镜像节点 spouse_families 已 push F0 且其余字段一字不动`,
    JSON.stringify(dstP[MIRROR_HANDLE]?.spouse_families || []) === JSON.stringify(dstPeopleNextObj.spouse_families) &&
    JSON.stringify({ ...dstP[MIRROR_HANDLE], spouse_families: [] }) === JSON.stringify({ ...mirror, spouse_families: [] }));
  vcheck(`祖谱 S 节点字段原样（逐字节同世本源，含 parent_family 原样指向搬入的 F0）`,
    order.every((h) => JSON.stringify(dstP[h]) === JSON.stringify(srcTree.people[h])));
  vcheck(`祖谱 S 节点 handle/gramps_id 不变`, order.every((h) => dstP[h]?.handle === h && String(dstP[h]?.gramps_id || '') === String(srcTree.people[h]?.gramps_id || '')));
  vcheck(`祖谱顶层子女的 parent_family = 搬入的 F0 且 F0 ∈ 镜像 spouse_families`,
    topChildren.every((h) => dstP[h]?.parent_family === TOP_FAMILY_HANDLE) &&
    (dstP[MIRROR_HANDLE]?.spouse_families || []).includes(TOP_FAMILY_HANDLE));
  vcheck(`祖谱内部家族 F 原样（逐字节同世本源）`, [...F].every((fh) => JSON.stringify(dstF[fh]) === JSON.stringify(srcTree.families[fh])));
  vcheck(`祖谱计数自洽：people = ${expDstPeople}（1+|S| 口径 ${1 + S.size}）· families = ${expDstFamilies}（|F|+|F0| = ${F.size + F0.size}）`,
    Object.keys(dstP).length === expDstPeople && Object.keys(dstF).length === expDstFamilies);
  vcheck(`祖谱 version +1 且 updated_at 刷新`, Number(dstAfter.version) === (Number(dstTree.version) || 0) + 1 && String(dstAfter.updated_at) === now);
  // md5 台账：祖谱写后与写前**不同**
  vcheck(`祖谱 md5 写前≠写后（${md5.dst.before} → ${md5DstAfter}）`, md5DstAfter !== md5.dst.before && md5DstAfter === md5.dst.after_expected);
  const dstTreeOk = bad === 0; // 本组（祖谱树）无不符 ⇒ 该上传对象已可读回

  // ── 上传对象 ②：世本树（trees/<SRC_TREE>.json）的校验面 ──
  const badAfterDst = bad;
  // 世本：S 全无、F 全无、F0 全无、415 无 F0、415 其余字段不动
  vcheck(`世本 people 已无 S 全部 ${S.size} 个节点`, order.every((h) => !srcP[h]));
  vcheck(`世本 families 已无 F（${F.size} 个）+ F0（${F0.size} 个）`, [...F, ...F0].every((fh) => !srcF[fh]));
  vcheck(`世本 415 的 spouse_families 已移除 F0（⇒ 无子无家庭）`, F0.size === 0 || (srcP[FOUNDER_HANDLE]?.spouse_families || []).every((fh) => !F0.has(fh)));
  vcheck(`世本 415 仍在、且除 spouse_families 外字段一字不动`,
    !!srcP[FOUNDER_HANDLE] &&
    JSON.stringify({ ...srcP[FOUNDER_HANDLE], spouse_families: [] }) === JSON.stringify({ ...founder, spouse_families: [] }));
  vcheck(`世本其余 people 逐字节不变（除 S 与 415 的 spouse_families）`,
    Object.keys(srcTree.people).filter((h) => !S.has(h) && h !== FOUNDER_HANDLE).every((h) => JSON.stringify(srcP[h]) === JSON.stringify(srcTree.people[h])));
  vcheck(`世本其余 families 逐字节不变（除 F 与 F0）`,
    Object.keys(srcTree.families).filter((fh) => !F.has(fh) && !F0.has(fh)).every((fh) => JSON.stringify(srcF[fh]) === JSON.stringify(srcTree.families[fh])));
  vcheck(`世本计数自洽：people = ${expSrcPeople}（${srcPeopleBefore}−|S|）· families = ${expSrcFamilies}（${srcFamiliesBefore}−|F|−|F0|）`,
    Object.keys(srcP).length === expSrcPeople && Object.keys(srcF).length === expSrcFamilies);
  vcheck(`世本 version +1 且 updated_at 刷新`, Number(srcAfter.version) === (Number(srcTree.version) || 0) + 1 && String(srcAfter.updated_at) === now);
  // md5 台账：世本写后与写前**不同**
  vcheck(`世本 md5 写前≠写后（${md5.src.before} → ${md5SrcAfter}）`, md5SrcAfter !== md5.src.before && md5SrcAfter === md5.src.after_expected);
  const srcTreeOk = bad === badAfterDst; // 本组（世本树）无不符 ⇒ 该上传对象已可读回

  // ── 上传对象 ③：详情档（jiapu_person_details，detailPlan.length 档）的校验面 ──
  const badAfterSrc = bad;
  // 详情档：新档在、旧档无、字段原样；—— 新增校验②（收正口径）：已迁详情档不含任何 external_* 属性 key ——
  for (const d of detailPlan) {
    const nd = await getDetailDoc(d.dstId);
    const od = await getDetailDoc(d.srcId);
    vcheck(`详情档 ${d.dstId} 在位（tree_id/handle/gramps_id/name 正确）`,
      !!nd && String(nd.tree_id) === DST_TREE && String(nd.handle) === d.handle && String(nd.gramps_id || '') === String(d.gramps_id || '') && String(nd.name || '') === String(d.name || ''));
    vcheck(`详情档 ${d.dstId} 不含任何 ${EXTERNAL_ATTR_PREFIX}* 属性 key`, !!nd && externalAttrsOf(nd).length === 0);
    const beforeAttrs = detailSnapshot.get(d.dstId) || [];
    const expectAttrs = beforeAttrs.filter((a) => !attrKeyOf(a).startsWith(EXTERNAL_ATTR_PREFIX));
    vcheck(`详情档 ${d.dstId} 其余属性原样（仅删 external_*：${beforeAttrs.length} → ${expectAttrs.length} 条）`,
      !!nd && JSON.stringify(nd.attributes || []) === JSON.stringify(expectAttrs));
    vcheck(`详情档旧档 ${d.srcId} 已删`, !od);
  }
  const detailsOk = bad === badAfterSrc; // 本组（详情档）无不符 ⇒ 该上传对象已可读回

  return { bad, lines, dstTreeOk, srcTreeOk, detailsOk, md5SrcAfter, md5DstAfter };
}

// ---- 轮询：**任一轮全部校验面通过即判成功**；超时（仍不符）才失败并贴出**最后一轮的差异** ----
console.log('\n' + '─'.repeat(120));
console.log(`【写后读回校验】轮询重试：最多 ${VERIFY_ROUNDS} 轮 × 间隔 ${VERIFY_WAIT_MS}ms（≈${Math.round(((VERIFY_ROUNDS - 1) * VERIFY_WAIT_MS) / 1000)}s）—— 容云存储 uploadFile→downloadFile 传播延迟`);
let lastVerify = null;
let passedAtRound = 0;
for (let round = 1; round <= VERIFY_ROUNDS; round += 1) {
  if (round > 1) await sleep(VERIFY_WAIT_MS);
  lastVerify = await runPostWriteVerify();
  if (lastVerify.dstTreeOk && !objVisibleAt.dst_tree) objVisibleAt.dst_tree = round;
  if (lastVerify.srcTreeOk && !objVisibleAt.src_tree) objVisibleAt.src_tree = round;
  if (lastVerify.detailsOk && !objVisibleAt.details) objVisibleAt.details = round;
  if (lastVerify.bad === 0) { passedAtRound = round; break; }
  if (round < VERIFY_ROUNDS) {
    console.log(`  ⏳ 第 ${round}/${VERIFY_ROUNDS} 轮：${lastVerify.bad} 项尚不符（疑为传播延迟，非写入失败）⇒ ${VERIFY_WAIT_MS}ms 后重读全部校验面`);
  }
}
const bad = lastVerify ? lastVerify.bad : 1;
const md5SrcAfter = lastVerify?.md5SrcAfter || '';
const md5DstAfter = lastVerify?.md5DstAfter || '';
const objShown = (n) => (n ? `第 ${n} 轮` : `>${VERIFY_ROUNDS} 轮（截至末轮仍不可见）`);
if (passedAtRound) {
  console.log(`  ✅ 第 ${passedAtRound}/${VERIFY_ROUNDS} 轮**全部通过**（0 项不符）—— 逐条：`);
} else {
  console.log(`  ❌ 超过 ${VERIFY_ROUNDS} 轮仍有 ${bad} 项不符 —— 以下为**最后一轮**的差异（逐条）：`);
}
for (const l of (lastVerify?.lines || [])) console.log(l);
console.log(`  对象读回可见轮次（传播完成）：祖谱树=${objShown(objVisibleAt.dst_tree)}  世本树=${objShown(objVisibleAt.src_tree)}  详情档=${objShown(objVisibleAt.details)}`);

// ================= 台账 + 摘要 =================
console.log(`\n📦 备份：${bakDir}`);
console.log('回滚（逐条）：');
console.log(`  1) 祖谱树  ：重传 ${path.join(bakDir, 'files', 'trees', `${DST_TREE}.json`)} → trees/${DST_TREE}.json`);
console.log(`  2) 世本树  ：重传 ${path.join(bakDir, 'files', 'trees', `${SRC_TREE}.json`)} → trees/${SRC_TREE}.json`);
console.log(`  3) 详情档  ：files/details/*.json（${detailPlan.length} 档）写回 ${SRC_TREE}:<handle>（含被删的 external_* 属性，备份即写前整份），删 ${DST_TREE}:<handle>`);
console.log(`  4) 家庭号  ：本批不取号、不写 jiapu_id_seq（F0 沿用 handle 与编号）⇒ 无计数器需还原`);

const summary = buildSummary({
  state: 'applied',
  applied: true,
  backupDir: bakDir,
  agg: { src: { before: md5.src.before, after: md5SrcAfter }, dst: { before: md5.dst.before, after: md5DstAfter } },
  written: executedSteps,
  extra: {
    moved_family: { handle: TOP_FAMILY_HANDLE, gramps_id: TOP_FAMILY_GRAMPS_ID, father_handle: MIRROR_HANDLE, id_seq_written: false },
    details_moved: detailsMoved,
    details_external_removed: extRemoved,
    top_children: topChildren,
    summary_dir: SUMMARY_DIR,
    run_log: RUN_LOG,
    verify_polling: {
      rounds_max: VERIFY_ROUNDS,
      wait_ms: VERIFY_WAIT_MS,
      passed_at_round: passedAtRound || null,
      object_readback_visible_at_round: { ...objVisibleAt },
    },
  },
});
fs.writeFileSync(path.join(bakDir, 'MD5-LEDGER.txt'), [
  `# 批次：黄嘉（415）真子嗣子树迁入《黄氏祖谱》（${SRC_TREE} → ${DST_TREE}）`,
  `# 时间：${now}`,
  `# 口径：Kevin 2026-10-15 拍定（docs/clan-tree.spec.md §1/§3/§4-1/§4-2 · docs/id-system.spec.md §2）`,
  `# 世本 md5：${md5.src.before} → ${md5SrcAfter}`,
  `# 祖谱 md5：${md5.dst.before} → ${md5DstAfter}`,
  `# 搬入顶层家族 F0：handle=${TOP_FAMILY_HANDLE} gramps_id=${TOP_FAMILY_GRAMPS_ID}（沿用）father → ${MIRROR_HANDLE}；不取号、未写 jiapu_id_seq`,
  `# 详情档删除陈旧 external_* 属性：${extRemoved} 条（${detailPlan.length} 档）`,
  `# 写后读回校验（轮询，容云存储传播延迟）：最多 ${VERIFY_ROUNDS} 轮 × 间隔 ${VERIFY_WAIT_MS}ms ⇒ 第 ${passedAtRound || VERIFY_ROUNDS} 轮全部通过`,
  `# 摘要 / 运行日志落独立目录（非本备份目录）：${SUMMARY_DIR}`,
  '',
  '[写前 md5 台账（files/ 下即为写前整份字节）]',
  ...ledgerBefore,
  '',
  '[S 清单（迁入祖谱的真人节点）]',
  ...order.map((h) => `${srcTree.people[h]?.gramps_id}  ${h}  ${srcTree.people[h]?.name}`),
  '',
  '[内部家族 F]',
  ...[...F].map((fh) => `${srcTree.families[fh]?.gramps_id}  ${fh}  children=${JSON.stringify(srcTree.families[fh]?.child_handles || [])}`),
  '',
  '[搬入祖谱的顶层家族 F0（handle/编号原样，仅 father_handle → 镜像）]',
  ...[...F0].map((fh) => `${srcTree.families[fh]?.gramps_id}  ${fh}  father ${srcTree.families[fh]?.father_handle} → ${MIRROR_HANDLE}`),
  '',
  '[详情档已删除的陈旧 external_* 属性（写前备份中仍可还原）]',
  ...detailExtPlan.map((d) => `${d.id}  →  ${d.external_keys.length ? d.external_keys.join(', ') : '（无）'}`),
  '',
  '[已删除（世本侧）]',
  ...[...F0].map((fh) => `${srcTree.families[fh]?.gramps_id}  ${fh}  （F0 · 顶层家族 · 已整体搬进祖谱）`),
  '',
  '[回滚]',
  `重传 ${path.join(bakDir, 'files', 'trees', `${DST_TREE}.json`)} → trees/${DST_TREE}.json`,
  `重传 ${path.join(bakDir, 'files', 'trees', `${SRC_TREE}.json`)} → trees/${SRC_TREE}.json`,
  `详情档：files/details/*.json 写回 ${SRC_TREE}:<handle>，删 ${DST_TREE}:<handle>`,
  '',
].join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(SUMMARY_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(`📄 summary.json / run.log 已落**独立目录**（非备份目录）：${SUMMARY_DIR}`);
console.log(JSON.stringify(summary, null, 2));

if (bad) {
  console.log(`\n❌ 写后读回校验失败：轮询 ${VERIFY_ROUNDS} 轮 × 间隔 ${VERIFY_WAIT_MS}ms 后仍有 ${bad} 项不符（退出码 1）。`);
  console.log('   ⇒ 若差异面与「传播延迟」相符（如旧档仍在 / version 未变），可加大 MIGRATE_VERIFY_ROUNDS 后重跑复核；');
  console.log('     若不符项指向真实写入问题，**不自动回滚** —— 请用备份回滚（见文件头「回滚方式」）。');
  console.log('     最后一轮的差异已打印在上方，并写入本目录 run.log。');
  process.exit(1);
}
console.log('\n✅ 全部写后读回校验通过（第 ' + (passedAtRound || VERIFY_ROUNDS) + '/' + VERIFY_ROUNDS + ' 轮，' + (Date.now() - t0) + 'ms）。');

// ================= 摘要 =================
function buildSummary({ state, applied, backupDir, agg, written, extra = {} }) {
  return {
    script: 'scripts/migrate-clan-founder-descendants-2026-10.mjs',
    ruling: 'Kevin 2026-10-15：415（黄嘉）名下真子嗣子树应存在《黄氏祖谱》⇒ 搬进祖谱、世本侧不留痕',
    at: nowIso(),
    env: ENV,
    source_mode: 'cloudbase（直连云端真源）',
    tree_ids: { src: SRC_TREE, dst: DST_TREE },
    founder: { handle: FOUNDER_HANDLE, gramps_id: FOUNDER_GRAMPS_ID },
    mirror_handle: MIRROR_HANDLE,
    state,
    applied,
    backup_dir: backupDir,
    subtree: {
      S: order.map((h) => ({ handle: h, gramps_id: srcTree.people[h]?.gramps_id, name: srcTree.people[h]?.name, parent_family: srcTree.people[h]?.parent_family })),
      F: [...F],
      F0: [...F0],
      top_children: topChildren,
      size: { S: S.size, F: F.size, F0: F0.size },
      touched_not_in_F: [...sub.touched],
    },
    plan: {
      dst_version: [Number(dstTree.version) || 0, (Number(dstTree.version) || 0) + 1],
      src_version: [Number(srcTree.version) || 0, (Number(srcTree.version) || 0) + 1],
      counts: {
        dst: { people: [dstPeopleBefore, expDstPeople], families: [dstFamiliesBefore, expDstFamilies] },
        src: { people: [srcPeopleBefore, expSrcPeople], families: [srcFamiliesBefore, expSrcFamilies] },
      },
      md5: { src: md5.src, dst: md5.dst },
      moved_family: {
        handle: TOP_FAMILY_HANDLE,
        gramps_id: TOP_FAMILY_GRAMPS_ID,
        gramps_id_reassigned: false,
        father_handle: MIRROR_HANDLE,
        child_handles: srcTree.families[TOP_FAMILY_HANDLE]?.child_handles || [],
        moved_from: SRC_TREE,
        moved_to: DST_TREE,
        id_seq_written: false,
      },
      details: detailPlan,
      details_external_stripped: detailExtPlan,
    },
    aggregate_md5: agg,
    written_steps: written,
    checks,
    notes,
    errors,
    ...extra,
  };
}
