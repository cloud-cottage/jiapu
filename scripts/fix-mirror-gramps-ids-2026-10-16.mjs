#!/usr/bin/env node
/**
 * 存量修正：把**镜像记录**的 `gramps_id` 从其自铸号改为**真身号**（A-6 · 2026-10-16）
 *
 * ── 口径（本脚本逐条照做 · 不得自行扩充）──────────────────────────────────────────────────
 *   A-1 `gramps_id` 标识**人**（跨树同人同号）；`handle` 标识**记录**（全站唯一、永不变）
 *       ⇒ 一个人 N 棵树 = 1 个编号 + N 个 handle。
 *   A-2 **镜像不铸号**：镜像记录的 `gramps_id` 一律取自 `external_person_handle` 所指的**真身**。
 *       代码侧落地点：① 宗谱登记镜像 = `lib/founder-attach.js#attachFounder`（→ `mirrorGrampsIdOfTrueBody`）；
 *       ② 祖谱顶端世本镜像段 = `lib/clan.js#applyClanTopMirror`（→ `planClanTopMirrorIds`）；
 *       ③ 镜像子女 = `lib/child-write.js` 跨树镜像子女路径；④ 跨树婚姻镜像 = `lib/marriage.js#buildMirror`；
 *       ⑤ 立支 = `lib/branch-clan-ops.js#planBranchFounderMirror` / `planBranchRegistrationMirrors`。
 *       本脚本负责**存量**对齐（四类镜像一并纳面；立支若快照中存在按同口径纳面）。
 *   A-3 唯一性为「人级」：同一 `gramps_id` 可对应多条记录（恰 1 条真身 + N 条镜像），
 *       每条镜像须能沿 `external_tree` / `external_person_handle` 指回真身；**同一棵树内编号仍唯一**
 *       （因镜像真身恒在别树）。
 *   A-4 `jiapu_id_seq` 只抬不降、已铸号**不回收**（本脚本**绝不碰**计数器）。
 *   A-6 存量修正：镜像记录的 `gramps_id` 从自铸号改为真身号，并同步两处祖谱档案字段：
 *       ① `tree-meta.founder_gramps_id`（**唯一权威面** · `docs/three-tier-founder.spec.md`）；
 *       ② **树 JSON 顶层** `founder_gramps_id`（与 ① **是两个字段**，不是同一个）——仅当该值**恰等于
 *          本次被改号镜像的旧号**（同树内）时同步为新号（旧号会被改掉 ⇒ 顶层字段不得继续指旧号，
 *          本质是**消除悬空引用**，不新增权威）。既非本次改号旧号、也不等于本树任何现存记录编号者
 *          = **历史漂移 ⇒ 只单列清点并标注「历史漂移 · 不动」，绝不自行推断目标号**。
 *   A-7 不变项：`handle` 口径与 `mir_<上层 handle>` 派生规则不变；详情文档键 `tree_id:handle` 不变；
 *       家庭编号 `F` + 6 位体系不变；「编号终身不变」不变。
 *
 * ── ⚠️ 撞号口径（硬 · 本脚本注释与 dry-run 输出均显式声明）──────────────────────────────────
 *   本脚本的断言是「**同一棵树内不同人不得撞号**」（A-3）。**同一棵树内同一个人出现 2 条记录**
 *   （真身 + 镜像，或同真身的 2 条镜像）**属甲口径已知形态 ⇒ 允许放行**，脚本只按「身份键」
 *   逐条列出并在 ⑤ 段标注「同人双记录 · 允许」；**判违规的红线 = 同号两条记录指向不同身份键**。
 *
 * ── 覆盖范围与判据（四类镜像 + 立支 · 逐类）────────────────────────────────────────────────
 *   统一扫描口径：某树内 `external_mirror === 'true'` 的**人物记录**。其中：
 *   ① **祖谱顶端世本镜像段**：本树 `kind==='clan'` 且 `external_tree` 指向一棵 `kind==='master'`
 *      的树（中华世本），`external_link_type ∈ {founder, chain}`。创建点 = `lib/clan.js#applyClanTopMirror`。
 *   ② **宗谱登记镜像**：本树 `kind==='clan'`、`external_link_type==='founder'`、`external_tree`
 *      指向一棵 `kind==='family'` 的树（`external_relation_note` 形如「姓名（族树 · 始祖）」）。
 *      创建点 = `lib/founder-attach.js#attachFounder`。
 *   ③ **镜像子女**：`external_link_type==='child'`。创建点 = `lib/child-write.js`（跨树镜像子女路径）。
 *   ④ **跨树婚姻镜像**：`external_link_type==='marriage'`（带 `external_marriage_id`）。
 *      创建点 = `lib/marriage.js#buildMirror`。
 *   ⑤ **立支**：`external_link_type==='founder'` 且**本树非 clan**（新树始祖镜像），或
 *      `external_relation_note` 含「立支」。创建点 = `lib/branch-clan-ops.js`。**快照中不存在时**，
 *      脚本在 ③ 段逐字打印「未在快照中发现」并复述本条扫描口径（**不得**因此把该路径移出范围）。
 *   ⑥ **树 JSON 顶层 `founder_gramps_id`**：与 `tree-meta.founder_gramps_id` 并列的**第二个字段**
 *      （两者不是同一个字段）。判据逐条：值 = 本次改号镜像的旧号（同树内）⇒ 同步为新号；
 *      值 = 本树现存记录编号 ⇒ 已一致、无操作；两者皆非 ⇒ **历史漂移**（实测：`ji_23395` /
 *      `gu_39038` 顶层值为 `000000001`，早于本批即已漂移）⇒ **只清点、标「历史漂移 · 不动」**。
 *   【仅清点·不可修正】= 孤儿镜像（`external_mirror==='true'` 但无 `external_tree`）/ 其它镜像：
 *      真身不可达 ⇒ 逐条读数照给，**绝不猜号、绝不铸号**。
 *
 * ── 安全护栏（硬边界）────────────────────────────────────────────────────────────────────
 *   - **默认 dry-run**：不给 `--apply` ⇒ **零写入**（只读文件 + 只计算 + 只打印逐条 diff）。
 *   - `--apply` **必须**同时给 `--backup-dir=<dir>`，否则拒绝（退出码 2）。
 *   - `--apply` 写前**重读复核**该树 `version`（与**规划期**读到的不一致 ⇒ 终止，不覆盖写）——
 *     CAS 重放安全：同一份快照重复 `--apply` 时第二次读到 `version` 已变或 `changed` 归零 ⇒ 幂等退出。
 *   - `--apply` 写前先落备份（整份写前字节 → `<backup-dir>/trees/<tree_id>.json` 与
 *     `<backup-dir>/tree-meta.json`），写后**逐条读回校验** + **重跑同树撞号断言**。
 *   - **只对「快照目录」作业**（`--out-dir` / `--meta`）：`--source=snapshot`（**默认**）下**绝不直连云端真源**。
 *     真源作业链路由操作员按既有路径执行：① 导出快照 → ② 本脚本 dry-run 复核逐条 diff →
 *     ③ `--apply --backup-dir=<dir>` 写快照 → ④ 用既有上传路径回写真源 → ⑤ 写后读回校验。
 *
 * ── 两种数据源（`--source=` · **默认仍为快照模式**）────────────────────────────────────────────────
 *   · `--source=snapshot`（**默认**）：作业对象 = 快照目录（`--out-dir` / `--meta`），行为与上文一字不变。
 *   · `--source=cloud`：**直连云端真源**（本地 `migrate-output/` 已归档 ⇒ 生产真源 = CloudBase）。
 *     - 读：① 树 JSON = 云存储 `trees/<tree_id>.json`，fileID 取自集合 `jiapu_tree_meta` 的 `_meta` 档
 *       `storage_files`；② `tree-meta` = 集合 `jiapu_tree_meta` 的**每树一档**（`_id = tree_id`）。
 *       **口径与先例同源（照搬，不自创第二套）**：
 *         `scripts/migrate-clan-founder-descendants-2026-10.mjs#readMeta`（:229-234）／`#loadTree`（:235-241）
 *         `scripts/upload-id-core-to-cloudbase.mjs#readCloudMeta`（:60-66）／`#uploadTreeMeta`（:106-123，每树一档）
 *     - 凭据：**环境变量优先**（`CB_ENV` / `CB_SECRET_ID` / `CB_SECRET_KEY` —— 与先例同源：先例运行前
 *       `set -a; . ~/.config/jiapu/cloudbase.env; set +a`）；**环境变量缺失时回退**读
 *       `~/.config/jiapu/cloudbase.env` 文件（脚本自己读，调用方无需 export）。凭据**绝不打印 / 绝不写日志 /
 *       绝不进任何输出**，只允许键名级自证（「已加载键名：CB_ENV / CB_SECRET_ID / CB_SECRET_KEY」）。
 *     - 写（仅 `--apply` 时 · **统一走生产写路径 · 方案 A**）：**不自写上传 / 不自拼版本化路径 /
 *       不手动改 `_meta.storage_files`** —— 直接 `import` `cloudfunctions/compat-api/lib/store.js` 的**现有导出**，
 *       由生产路径自己完成「版本化新对象上传 + CAS 重指 + `version+1` + `updated_at` 刷新 + metaCache 失效 + 清扫」：
 *         · 树 JSON  = `saveTree(tree, expectedVersion)`（现证 `lib/store.js` :1109；cloud 链路 :1135-1157
 *           = 上传 `cloudTreeObjectPath(tree_id, version)` → `mutateMetaDoc` 重指 `_meta.storage_files[tree_id]`
 *           → `sweepSupersededTreeObjects` 清扫上上版）；
 *         · tree-meta 树档 = `mutateTreeMeta(tree_id, mutator)`（现证 `lib/store.js` :794；对每树档
 *           `_id = tree_id` 走 CAS ＋ 重试 ＋ `version+1` ＋ metaCache 就地失效）。
 *       **为何不再「按 fileID 反解 cloudPath → `uploadFile` 同路径覆盖」**：`docs/data-model.md` §11.11
 *       （:555-565 · 现证 `lib/store.js` :956-1031）已查明并根治 —— CloudBase 云存储对**同一对象路径**有
 *       **服务端读缓存**（TTL 分钟级，用户体感 ~10 分钟）⇒ **同路径覆盖写不立即生效**（写后读回仍是旧副本）。
 *       方案 A 每次保存都写**从未被读过的新对象** `trees/<id>/v<N>.json` ⇒ 写后立即可读即真值。
 *       本脚本沿用该路径，**绝不自写第二套上传**。
 *     - **凭据桥（仅 apply 时）**：生产 `store.js` 自 `process.env` 取环境与凭据（现证 :79 `ENV` /
 *       :216-233 `getApp`：`CB_ENV` / `CB_SECRET_ID` / `CB_SECRET_KEY`）⇒ 本脚本把**已解析**的凭据**只补缺**
 *       写进 `process.env`（**shell 侧无需 `export`**；值**绝不打印 / 绝不落盘 / 绝不进任何输出**，
 *       仍只允许键名级自证），并把 `COMPAT_SOURCE` 显式钉为 `cloud`（生产 store 的 local 分支会写
 *       `migrate-output` —— 本脚本硬边界禁止）。
 *     - 写序（`--apply`）：① **写前 CAS 重读**（重取 `_meta.storage_files` **现值 fileID** → 重新 `downloadFile`，
 *       `fileID` / md5 / `version` 三面同规划期比对，任一漂移即拒绝、不自动重试覆盖）；
 *       ② **备份 = 云端原件**（写前字节逐字 → `<backup-dir>/trees/<tree_id>.json` +
 *       `tree-meta/<tree_id>.json` + `MD5-LEDGER.txt` + `summary.json`，并记**写前 fileID** 供精确回滚）；
 *       ③ 逐树 `saveTree(next, 规划期 version)` ＋ 逐处 `mutateTreeMeta`（写前值在 CAS 的 mutator 内**再核一次**）；
 *       ④ 写完**逐条读回**（按 `_meta.storage_files` 的**现值 fileID**（方案 A 必已换新对象）重新 `downloadFile`，
 *       比对每条 `gramps_id`、树 JSON 顶层 `founder_gramps_id`、`version`，并断言「fileID 已换新且路径 = 生产
 *       模板 `cloudTreeObjectPath`」；tree-meta 用 `doc(tree_id).get()` 比对 `founder_gramps_id`）；⑤ 写后重跑撞号断言。
 *     - **写后读回预期（方案 A · 硬）**：写的是**全新对象路径** ⇒ **第 1 轮即应全部读回通过**（新路径从未被读过，
 *       服务端路径级读缓存不可能命中旧内容）。轮询重试（默认 7 轮 × 间隔 10s；`FIX_VERIFY_ROUNDS` /
 *       `FIX_VERIFY_WAIT_MS` 可覆盖）**仅作安全网保留** —— 多轮才通过不再是「传播延迟」的理所当然解释，须查明。
 *       **绝不把「刚写完读回旧值」当写入失败乱报**（超时仍不符才失败，并贴出最后一轮差异）。
 *     - 版本口径（**cloud 独有 · 交给生产写路径**）：树的 `version` **+1** / `updated_at` 刷新由 `saveTree`
 *       完成（现证 :1124-1127）；tree-meta 树档 `version` **+1** 由 `mutateTreeMeta` 完成（现证 :794-822）
 *       —— 本脚本**不再自算**这两处。
 *       快照模式**不动**版本（作业对象是副本）—— 二者差异是有意的。
 *     - 其余护栏**一字不变**：默认 dry-run（零写入）、幂等可重放、逐条 diff、`--apply` 必须同时给 `--backup-dir`、
 *       撞号断言（同树不同人 0 违规，同人双记录允许）、**已铸号不回收 · `jiapu_id_seq` 只抬不降（零计数器写入）**。
 *
 * ── 用法 ─────────────────────────────────────────────────────────────────────────────
 *   # 快照模式（默认）
 *   node scripts/fix-mirror-gramps-ids-2026-10-16.mjs \
 *        --out-dir=<快照>/migrate-output --meta=<快照或仓库>/tree-meta.json      # dry-run（默认）
 *   node scripts/fix-mirror-gramps-ids-2026-10-16.mjs --out-dir=… --meta=… \
 *        --apply --backup-dir=<dir> [--clan=<tree_id>] [--json=<path>]
 *   # 云端模式（真源 = CloudBase；dry-run 只读）
 *   node scripts/fix-mirror-gramps-ids-2026-10-16.mjs --source=cloud [--clan=<tree_id>] [--json=<path>]
 *   node scripts/fix-mirror-gramps-ids-2026-10-16.mjs --source=cloud \
 *        --apply --backup-dir=<dir>   # ⚠️ 必须双守卫；凭据取环境变量，缺失回退 ~/.config/jiapu/cloudbase.env
 *                                     # 写**走生产写路径**（lib/store.js：saveTree / mutateTreeMeta · 方案 A）
 *
 * 退出码：0 = dry-run 完成 / apply 成功 / 幂等无操作；1 = 前置复核、撞号断言或写后校验失败；2 = 用法 / 参数错误。
 */
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
/** 生产写路径（方案 A）所在文件：树写 `saveTree` / tree-meta 树档写 `mutateTreeMeta` 均由此导出 */
const STORE_FILE = path.join(REPO, 'cloudfunctions', 'compat-api', 'lib', 'store.js');

// ================= 参数 =================
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const valueOf = (n) => {
  const hit = argv.find((a) => a.startsWith(`${n}=`));
  return hit ? hit.slice(n.length + 1) : '';
};

if (flag('--help') || flag('-h')) {
  console.log('用法：node scripts/fix-mirror-gramps-ids-2026-10-16.mjs [--source=snapshot|cloud] --out-dir=<dir> [--meta=<file>] [--clan=<tree_id>] [--json=<path>]');
  console.log('      node scripts/fix-mirror-gramps-ids-2026-10-16.mjs [--source=snapshot|cloud] [--out-dir=<dir>] [--meta=<file>] --apply --backup-dir=<dir>');
  console.log('  默认 dry-run（零写入）、默认 --source=snapshot。');
  console.log('  --source=snapshot：只写快照目录（--out-dir/--meta），绝不直连云端真源。');
  console.log('  --source=cloud   ：直连云端真源（云存储 trees/<tree_id>.json + 集合 jiapu_tree_meta 每树一档）。');
  console.log('                     凭据：环境变量 CB_ENV / CB_SECRET_ID / CB_SECRET_KEY 优先，缺失回退 ~/.config/jiapu/cloudbase.env。');
  console.log('  --apply 必须同时给 --backup-dir；覆盖 = 四类镜像 + 立支（快照/云端中存在时）。');
  process.exit(0);
}
const KNOWN = new Set(['--apply', '--dry-run', '--help', '-h']);
const unknown = argv.filter((a) => !KNOWN.has(a) && !/^--(out-dir|meta|clan|json|backup-dir|source)=/.test(a));
if (unknown.length) {
  console.error(`❌ 未知参数：${unknown.join(' ')}（仅支持 --source= / --apply / --dry-run / --out-dir= / --meta= / --clan= / --json= / --backup-dir=）`);
  process.exit(2);
}
const APPLY = flag('--apply');
/** 数据源：snapshot（默认，作业对象 = 快照目录）｜cloud（直连云端真源 CloudBase） */
const SOURCE = (valueOf('--source') || process.env.FIX_MIRROR_SOURCE || 'snapshot').trim();
if (SOURCE !== 'snapshot' && SOURCE !== 'cloud') {
  console.error(`❌ --source 只支持 snapshot / cloud（实得：${SOURCE}）`);
  process.exit(2);
}
const OUT_DIR = path.resolve(valueOf('--out-dir') || process.env.COMPAT_OUT_DIR || path.join(REPO, 'migrate-output'));
const META_FILE = path.resolve(valueOf('--meta') || path.join(REPO, 'config', 'tree-meta.json'));
const ONLY_CLAN = valueOf('--clan').trim();
const JSON_OUT = valueOf('--json') ? path.resolve(valueOf('--json')) : '';
const BACKUP_DIR = valueOf('--backup-dir') ? path.resolve(valueOf('--backup-dir')) : '';
if (SOURCE === 'snapshot' && !fs.existsSync(OUT_DIR)) {
  console.error(`❌ 快照目录不存在：${OUT_DIR}（用 --out-dir=<dir> 指向已导出的快照）`);
  process.exit(2);
}
if (SOURCE === 'snapshot' && !fs.existsSync(META_FILE)) {
  console.error(`❌ tree-meta 不存在：${META_FILE}（用 --meta=<file> 指定）`);
  process.exit(2);
}
if (APPLY && !BACKUP_DIR) {
  console.error('❌ --apply 必须同时给 --backup-dir=<dir>（写前备份，缺失即拒绝）');
  process.exit(2);
}

// ================= 读侧（纯读，零写入） =================
const TREES_DIR = path.join(OUT_DIR, 'trees');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const treePath = (treeId) => path.join(TREES_DIR, `${treeId}.json`);
const md5buf = (b) => crypto.createHash('md5').update(b).digest('hex');
/**
 * 云端树扫描时的 JSON 形态（缩进宽度；0 = 紧凑）—— **只读观测量，仅用于 ⑥ 段读数打印**。
 * 实测：**版本化路径**树（`trees/<id>/v<N>.json`）为紧凑（`lib/store.js#saveTree` :1144
 * `Buffer.from(JSON.stringify(tree))`），**遗留路径**树（`trees/<id>.json`）为 2 空格缩进（更早的上传路径）。
 * ⚠️ 写侧**不再**据此渲染回写：方案 A 下写路径由生产 `saveTree` 承担，恒为紧凑新对象（写回形态由生产路径定，
 * 本脚本不干预、也不得自拼）。
 */
function jsonStyleOf(bytes) {
  const s = bytes.toString('utf8');
  const m = s.match(/^\{\n( +)"/);
  return m ? m[1].length : 0;
}

// ---- 云端模式（--source=cloud）：凭据 / 云存储下载 / 集合读（口径照搬仓内既有 cloud-direct 先例，不自创第二套）----
const CLOUD_ENV_FILE = path.join(os.homedir(), '.config', 'jiapu', 'cloudbase.env');
/** 解析 `KEY=VALUE` 形式的凭据文件（只读；返回值**绝不打印 / 绝不写日志 / 绝不进输出**） */
function parseEnvFile(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    if (raw.trim().startsWith('#')) continue;
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
/** `cloud://<env>.<bucket>/trees/x.json` → `trees/x.json`（照搬 upload-id-core-to-cloudbase.mjs :53-58） */
function pathFromFileId(fileID) {
  const s = String(fileID);
  const i = s.indexOf('/trees/');
  if (i < 0) throw new Error(`unexpected fileID（不含 /trees/）：${s.slice(0, 32)}…`);
  return s.slice(i + 1);
}
/**
 * 预载云端真源（**纯只读**：`downloadFile` + 集合读，零写入）。
 * 读口径照搬先例：① `jiapu_tree_meta/_meta.storage_files`（migrate-clan-founder-descendants-2026-10.mjs
 * #readMeta :229-234）；② 每树一档（upload-id-core-to-cloudbase.mjs #uploadTreeMeta :106-123）；
 * ③ 云存储下载（migrate-clan-founder-descendants-2026-10.mjs#loadTree :235-241）。
 */
async function loadCloud() {
  // 凭据：**环境变量优先**（与先例同源）；环境变量缺失时**回退**读凭据文件（脚本自己读 ⇒ 调用方无需 export）
  const KEYS = ['CB_ENV', 'CB_SECRET_ID', 'CB_SECRET_KEY'];
  const fromEnv = Object.fromEntries(KEYS.map((k) => [k, String(process.env[k] || '').trim()]));
  const missingEnv = KEYS.filter((k) => !fromEnv[k]);
  const hasFile = fs.existsSync(CLOUD_ENV_FILE);
  const fileEnv = missingEnv.length && hasFile ? parseEnvFile(CLOUD_ENV_FILE) : {};
  const cred = Object.fromEntries(KEYS.map((k) => [k, fromEnv[k] || fileEnv[k] || '']));
  const stillMissing = KEYS.filter((k) => !cred[k]);
  if (stillMissing.length) {
    console.error(
      `❌ 缺少凭据键：${stillMissing.join(' / ')}（环境变量优先，缺失回退 ${CLOUD_ENV_FILE}${hasFile ? '' : ' —— 该文件不存在'}）`,
    );
    process.exit(2);
  }
  const credSource =
    missingEnv.length === 0
      ? '环境变量（CB_ENV / CB_SECRET_ID / CB_SECRET_KEY；与先例同源：`set -a; . ~/.config/jiapu/cloudbase.env; set +a`）'
      : `环境变量 ${KEYS.filter((k) => fromEnv[k]).join('/') || '（无）'} + 凭据文件回退 ${missingEnv.join('/')}（${CLOUD_ENV_FILE}）`;
  const { default: cloudbase } = await import('@cloudbase/node-sdk'); // 先例同源：import cloudbase from '@cloudbase/node-sdk'
  const app = cloudbase.init({ env: cred.CB_ENV, secretId: cred.CB_SECRET_ID, secretKey: cred.CB_SECRET_KEY });
  const db = app.database();
  const col = db.collection('jiapu_tree_meta');
  // ① `_meta` 单档 → `storage_files`（树 JSON 的 fileID 权威映射）
  const rMeta = await col.doc('_meta').get();
  const metaEntry = Array.isArray(rMeta?.data) ? rMeta.data[0] : rMeta?.data;
  if (!metaEntry || !metaEntry.storage_files) {
    console.error('❌ 云端 `jiapu_tree_meta/_meta.storage_files` 缺失 ⇒ 无法定位树 JSON（退出码 1）');
    process.exit(1);
  }
  // ② 每树一档（`_id = tree_id`）→ 与快照模式 `tree-meta.json` 的 `trees{}` 同形，供后续代码零改动复用
  const all = await col.limit(200).get();
  const entriesById = {};
  for (const doc of all?.data || []) {
    const { _id, ...rest } = doc || {};
    if (String(_id) === '_meta') continue;
    const tid = String(rest.tree_id || _id || '');
    if (!tid) continue;
    entriesById[tid] = { ...rest, tree_id: tid };
  }
  // ③ 云存储下载全部树（按 `storage_files` 逐棵）
  const trees = new Map();
  for (const tid of Object.keys(metaEntry.storage_files).sort()) {
    const fileId = metaEntry.storage_files[tid];
    let rr;
    try {
      rr = await app.downloadFile({ fileID: fileId });
    } catch (e) {
      console.error(`❌ 云存储下载失败：trees/${tid}.json（${e?.message || e}）`);
      process.exit(1);
    }
    if (!rr || !rr.fileContent) {
      console.error(`❌ 云存储下载无内容：trees/${tid}.json`);
      process.exit(1);
    }
    const bytes = Buffer.from(rr.fileContent);
    let tree;
    try {
      tree = JSON.parse(bytes.toString('utf8'));
    } catch {
      console.error(`❌ 云端树 JSON 解析失败：trees/${tid}.json`);
      process.exit(1);
    }
    trees.set(tid, { tree, bytes, md5: md5buf(bytes), fileId, cloudPath: pathFromFileId(fileId), indent: jsonStyleOf(bytes) });
  }
  if (!trees.size) {
    console.error('❌ 云端 `storage_files` 为空 ⇒ 无树可扫（退出码 1）');
    process.exit(1);
  }
  // ⚠️ `cred` 仅供**本进程内**转交给生产写路径（`loadStore()` 凭据桥，只补缺）：**绝不打印 / 绝不落盘**
  return { app, db, col, env: cred.CB_ENV, cred, credSource, metaEntry, entries: entriesById, trees };
}
const CLOUD = SOURCE === 'cloud' ? await loadCloud() : null;

const readTree =
  SOURCE === 'cloud'
    ? (treeId) => CLOUD.trees.get(String(treeId))?.tree ?? null
    : (treeId) => (fs.existsSync(treePath(treeId)) ? readJson(treePath(treeId)) : null);
const metaDoc = SOURCE === 'cloud' ? { trees: CLOUD.entries } : readJson(META_FILE);
const entries = Object.values(metaDoc.trees || {});

const kindOf = (entry) => {
  const k = String(entry?.kind || '').trim();
  if (k === 'master' || k === 'clan' || k === 'family') return k;
  return entry?.is_master ? 'master' : 'family';
};
const entryOf = (treeId) => entries.find((e) => String(e?.tree_id || '') === String(treeId || '')) || null;
const titleOf = (treeId) => entryOf(treeId)?.display_title || treeId;

/**
 * 镜像记录判据（**不**限定 `external_link_type` —— 四类镜像一律纳入扫描。
 * 只保留与 `lib/founder-attach.js#isReadonlyMirror` 同源的两条：镜像标记 + 外指别树）
 */
function isMirrorRecord(p, treeId) {
  if (!p) return false;
  if (String(p.external_mirror || '') !== 'true') return false;
  const tid = String(p.external_tree || '');
  if (!tid || tid === String(treeId || '')) return false;
  return true;
}

/** 孤儿镜像（历史脏数据）：镜像标记在、真身不可达（无 external_tree）⇒ 只清点 */
function isOrphanMirror(p, treeId) {
  if (!p) return false;
  if (String(p.external_mirror || '') !== 'true') return false;
  const tid = String(p.external_tree || '');
  return !tid || tid === String(treeId || '');
}

/** 真身解析（快照内）：镜像的 `external_tree` 树里、`external_person_handle` 指向的节点 */
function resolveTrueBody(mirror) {
  const treeId = String(mirror.external_tree || '');
  const handle = String(mirror.external_person_handle || '');
  if (!treeId) return { ok: false, reason: '镜像无 external_tree（孤儿镜像）' };
  if (!handle) return { ok: false, reason: '镜像无 external_person_handle' };
  const tree = readTree(treeId);
  if (!tree?.people) return { ok: false, reason: `真身树 JSON 缺失（${treeId}）` };
  const person = tree.people[handle];
  if (!person) return { ok: false, reason: `真身在 ${treeId} 内找不到（handle=${handle}）` };
  return { ok: true, tree_id: treeId, handle, person };
}

/** 守护：真身自身不得是镜像（A-3：恰有 1 条真身；镜像的真身恒在别树且非镜像） */
function trueBodyIsMirror(trueBodyTreeId, trueBody) {
  if (String(trueBody.external_mirror || '') !== 'true') return false;
  return String(trueBody.external_tree || '') !== String(trueBodyTreeId || '');
}

/** 镜像分类（判据逐类固定；顺序即优先级）＋ 人类可读标签 */
const CLASS_LABEL = {
  top: '祖谱顶端世本镜像段（自铸预留号 → 世本真身号）',
  registration: '宗谱登记镜像',
  child: '镜像子女',
  marriage: '跨树婚姻镜像',
  branch: '立支（新树始祖镜像 / 立支登记镜像）',
  chain: '世系链镜像',
  other: '其它镜像（分类未命中）',
};
function classifyMirror({ selfKind, linkType, bodyKind, note }) {
  const n = String(note || '');
  if (linkType === 'child') return 'child';
  if (linkType === 'marriage') return 'marriage';
  if (/立支/.test(n)) return 'branch';
  if (linkType === 'founder' || linkType === 'chain') {
    if (selfKind === 'clan' && bodyKind === 'master') return 'top';
    if (selfKind === 'clan' && bodyKind === 'family') return 'registration';
    if (selfKind !== 'clan') return 'branch'; // 家族树内、指向别树真身的始祖镜像 = 立支新树始祖镜像
    return linkType === 'chain' ? 'chain' : 'other';
  }
  return 'other';
}

// ================= 扫描与计划 =================
const planRows = []; // 计划修正（四类镜像 + 立支）
const inventory = []; // 仅清点（孤儿 / 其它，不可修正）
const metaRows = []; // tree-meta 同步计划
const skips = [];
const scannedMirrors = [];
const changedByTree = new Map(); // tree_id → 该树内被改号的镜像行（供 apply 分组写 + tree-meta 同步）
let scannedTrees = 0;
const PLAN_VERSION = new Map(); // tree_id → 规划期 version（apply 的 CAS 复核用）

const treeIds =
  SOURCE === 'cloud'
    ? [...CLOUD.trees.keys()].sort()
    : fs
        .readdirSync(TREES_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort();
if (!treeIds.length) {
  console.error(
    SOURCE === 'cloud'
      ? '❌ 云端无树（`jiapu_tree_meta/_meta.storage_files` 为空）'
      : `❌ 快照里没有树 JSON：${TREES_DIR}`,
  );
  process.exit(2);
}
if (ONLY_CLAN && !treeIds.includes(ONLY_CLAN)) {
  console.error(SOURCE === 'cloud' ? `❌ 云端没有该树：${ONLY_CLAN}` : `❌ 快照里没有该树：${ONLY_CLAN}`);
  process.exit(2);
}

for (const treeId of treeIds) {
  if (ONLY_CLAN && treeId !== ONLY_CLAN) continue;
  const tree = readTree(treeId);
  if (!tree?.people) {
    skips.push({ tree_id: treeId, reason: '树 JSON 不可读' });
    continue;
  }
  scannedTrees += 1;
  const selfKind = kindOf(entryOf(treeId));
  const selfVersion = tree.version;
  for (const p of Object.values(tree.people)) {
    if (!isMirrorRecord(p, treeId)) {
      if (isOrphanMirror(p, treeId)) {
        scannedMirrors.push({ tree_id: treeId, handle: p.handle, class: 'orphan' });
        inventory.push({
          tree_id: treeId,
          tree_kind: selfKind,
          handle: p.handle,
          class: 'orphan',
          class_label: '孤儿镜像（无 external_tree ⇒ 真身不可达）',
          link_type: String(p.external_link_type || ''),
          name: p.name || '',
          current_gramps_id: String(p.gramps_id || ''),
          true_gramps_id: '',
          note: '只清点：真身不可达 ⇒ 绝不猜号、绝不铸号，待人工核',
        });
      }
      continue;
    }
    const body = resolveTrueBody(p);
    const current = String(p.gramps_id || '');
    const base = {
      tree_id: treeId,
      tree_kind: selfKind,
      plan_version: selfVersion,
      handle: p.handle,
      link_type: String(p.external_link_type || ''),
      name: p.name || '',
      current_gramps_id: current,
      true_body_tree: String(p.external_tree || ''),
      true_body_handle: String(p.external_person_handle || ''),
      note_text: String(p.external_relation_note || ''),
    };
    if (!body.ok) {
      scannedMirrors.push({ tree_id: treeId, handle: p.handle, class: 'unreachable' });
      skips.push({ ...base, reason: `真身不可达：${body.reason}` });
      continue;
    }
    const trueId = String(body.person.gramps_id || '');
    const bodyKind = kindOf(entryOf(body.tree_id));
    const cls = classifyMirror({
      selfKind,
      linkType: base.link_type,
      bodyKind,
      note: base.note_text,
    });
    scannedMirrors.push({ tree_id: treeId, handle: p.handle, class: cls });
    const row = {
      ...base,
      true_body_kind: bodyKind,
      true_body_title: titleOf(body.tree_id),
      true_body_name: body.person.name || '',
      true_gramps_id: trueId,
      class: cls,
      class_label: CLASS_LABEL[cls] || cls,
      changed: trueId !== '' && current !== trueId,
    };
    // 守护（四类一律适用）：真身不得是镜像 ／ 真身必须有全站编号
    if (trueBodyIsMirror(body.tree_id, body.person)) {
      skips.push({ ...row, reason: `真身（${body.tree_id}:${body.handle}）自身是镜像 ⇒ 指回的不是真身，待人工核` });
      continue;
    }
    if (!trueId) {
      skips.push({ ...row, reason: `真身无全站编号（${body.tree_id}:${body.handle}）⇒ 不得铸号，待人工核` });
      continue;
    }
    row.plan = row.changed ? 'rename' : 'noop';
    planRows.push(row);
    if (row.changed) {
      const list = changedByTree.get(treeId) || [];
      list.push(row);
      changedByTree.set(treeId, list);
      if (!PLAN_VERSION.has(treeId)) PLAN_VERSION.set(treeId, selfVersion);
    }
  }
}

// tree-meta 同步计划：某祖谱 `founder_handle` 指向**被改号的镜像** ⇒ 同步 `founder_gramps_id`（A-6 明写同步面）
for (const [clanId, rows] of changedByTree) {
  const entry = entryOf(clanId);
  if (!entry) {
    skips.push({ tree_id: clanId, reason: 'tree-meta 无该树档，无法同步 founder_gramps_id' });
    continue;
  }
  const fh = String(entry.founder_handle || '');
  const hit = rows.find((r) => r.handle === fh);
  if (!hit) {
    if (String(entry.founder_gramps_id || '') && !fh) {
      skips.push({ tree_id: clanId, reason: 'tree-meta founder_handle 为空但 founder_gramps_id 非空，待人工核' });
    }
    continue;
  }
  metaRows.push({
    tree_id: clanId,
    founder_handle: fh,
    from: String(entry.founder_gramps_id || ''),
    to: hit.true_gramps_id,
    changed: String(entry.founder_gramps_id || '') !== hit.true_gramps_id,
  });
}

// ── 树 JSON 顶层 `founder_gramps_id` 同步计划（**与 tree-meta.founder_gramps_id 是两个字段**）──
// 判据（逐条 diff）：值**恰等于本次被改号镜像的旧号**（同树内）⇒ 同步为新号（消除悬空引用）。
// 值 = 本树现存记录编号 ⇒ 已一致、无操作。两者皆非 ⇒ **历史漂移：只清点、标「历史漂移 · 不动」**，
// 绝不推断目标号（派单硬边界）。
const oldIdByTree = new Map(); // `${tree_id}|旧号` → 改号行（同树命中）
const oldIdAnyTree = new Map(); // 旧号 → 改号行列表（跨树，仅用于歧义守护）
for (const rows of changedByTree.values()) {
  for (const r of rows) {
    oldIdByTree.set(`${r.tree_id}|${r.current_gramps_id}`, r);
    const l = oldIdAnyTree.get(r.current_gramps_id) || [];
    l.push(r);
    oldIdAnyTree.set(r.current_gramps_id, l);
  }
}
const treeJsonRows = []; // 同步面计划（逐条 diff：修正 / 无操作）
const treeJsonDrift = []; // 历史漂移 · 不动（仅清点）
const treeJsonGuarded = []; // 跨树同号歧义 ⇒ 待人工核，绝不改
for (const treeId of treeIds) {
  if (ONLY_CLAN && treeId !== ONLY_CLAN) continue;
  const tree = readTree(treeId);
  if (!tree?.people) continue;
  if (tree.founder_gramps_id === undefined) continue; // 该树档无此顶层字段 ⇒ 不在同步面
  const cur = String(tree.founder_gramps_id ?? '');
  const recordIds = new Set(Object.values(tree.people).map((p) => String(p.gramps_id || '')));
  if (!cur) {
    treeJsonDrift.push({
      tree_id: treeId,
      tree_kind: kindOf(entryOf(treeId)),
      field: 'founder_gramps_id',
      value: cur,
      note: '顶层字段为空值 · 不动（不推断目标号）',
    });
    continue;
  }
  const sameTreeHit = oldIdByTree.get(`${treeId}|${cur}`);
  if (sameTreeHit) {
    treeJsonRows.push({
      tree_id: treeId,
      tree_kind: kindOf(entryOf(treeId)),
      field: 'founder_gramps_id',
      from: cur,
      to: sameTreeHit.true_gramps_id,
      source_handle: sameTreeHit.handle,
      source_class: sameTreeHit.class,
      changed: cur !== sameTreeHit.true_gramps_id,
    });
    continue;
  }
  if (recordIds.has(cur)) {
    treeJsonRows.push({
      tree_id: treeId,
      tree_kind: kindOf(entryOf(treeId)),
      field: 'founder_gramps_id',
      from: cur,
      to: cur,
      source_handle: '',
      source_class: '',
      changed: false,
    });
    continue;
  }
  const cross = (oldIdAnyTree.get(cur) || []).filter((r) => r.tree_id !== treeId);
  if (cross.length) {
    treeJsonGuarded.push({
      tree_id: treeId,
      field: 'founder_gramps_id',
      value: cur,
      note: `跨树同号（该旧号亦属其它树：${cross.map((r) => r.tree_id).join('/')}）⇒ 目标号有歧义，待人工核，绝不改`,
    });
    continue;
  }
  treeJsonDrift.push({
    tree_id: treeId,
    tree_kind: kindOf(entryOf(treeId)),
    field: 'founder_gramps_id',
    value: cur,
    note: '既非本次改号镜像的旧号，也不等于本树任何现存记录编号 ⇒ 不推断目标号',
  });
}
const treeJsonWillChange = treeJsonRows.filter((r) => r.changed);
const treeJsonByTree = new Map(treeJsonWillChange.map((r) => [r.tree_id, r]));
for (const r of treeJsonWillChange) {
  if (!changedByTree.has(r.tree_id)) {
    console.error(
      `❌ 规划异常：树 JSON 顶层 ${r.tree_id}.founder_gramps_id 待同步，但该树无镜像改号 ⇒ 拒绝（备份/CAS 覆盖不到）`,
    );
    process.exit(1);
  }
}

const willRename = planRows.filter((r) => r.changed);
const metaWillChange = metaRows.filter((r) => r.changed);
const countByClass = (cls) => willRename.filter((r) => r.class === cls).length;

// ================= ⑤ 撞号断言（改号后预演 · 同树内「不同人」不得撞号） =================
/** 身份键：真身身份 = 树:handle；镜像身份 = 其真身的身份（镜像的真身恒非镜像，单跳即稳定） */
function identityOf(treeId, person, depth = 0) {
  const isMir = String(person?.external_mirror || '') === 'true';
  const et = String(person?.external_tree || '');
  const ph = String(person?.external_person_handle || '');
  if (!isMir || !et || et === treeId || !ph || depth > 4) return `${treeId}:${person?.handle || ''}`;
  const other = readTree(et);
  const body = other?.people?.[ph];
  if (!body) return `${treeId}:${person?.handle || ''}`;
  return identityOf(et, body, depth + 1);
}
/** 由计划行得到的「改后编号」：被改号的镜像取真身号；其余取现值 */
function collisionScan() {
  const groups = [];
  const violations = [];
  const planned = new Map();
  for (const r of willRename) planned.set(`${r.tree_id}|${r.handle}`, r.true_gramps_id);
  for (const treeId of treeIds) {
    if (ONLY_CLAN && treeId !== ONLY_CLAN) continue;
    const tree = readTree(treeId);
    if (!tree?.people) continue;
    const byId = new Map();
    for (const [h, p] of Object.entries(tree.people)) {
      const id = planned.get(`${treeId}|${h}`) ?? String(p.gramps_id || '');
      if (!id) continue;
      const list = byId.get(id) || [];
      list.push({ handle: h, name: p.name || '', identity: identityOf(treeId, p) });
      byId.set(id, list);
    }
    for (const [id, list] of byId) {
      if (list.length < 2) continue;
      const identities = new Set(list.map((x) => x.identity));
      const rec = { tree_id: treeId, gramps_id: id, records: list };
      if (identities.size > 1) violations.push(rec);
      else groups.push(rec);
    }
  }
  return { groups, violations };
}
const COLLISION = collisionScan();

// ================= 输出（逐条 diff） =================
const line = (tag, s) => console.log(`${tag} ${s}`);
console.log(`# 存量镜像编号修正（A-6 / §12-9 · 2026-10-16）${APPLY ? ' 【APPLY】' : ' 【DRY-RUN·零写入】'}`);
if (SOURCE === 'cloud') {
  console.log('# 数据源：cloud —— CloudBase 真源（云存储 trees/<tree_id>.json + 集合 jiapu_tree_meta 每树一档）');
  console.log(`# 云端环境：${CLOUD.env}`);
  console.log(`# 凭据：${CLOUD.credSource}`);
  console.log('# 凭据自证（仅键名，**值绝不打印**）：已加载键名 = CB_ENV / CB_SECRET_ID / CB_SECRET_KEY');
  console.log(`# 云端树：${CLOUD.trees.size} 棵（fileID 全部取自 jiapu_tree_meta/_meta.storage_files）`);
  console.log(`# tree-meta：集合 jiapu_tree_meta 树档 ${Object.keys(CLOUD.entries).length} 档（_id = tree_id）`);
} else {
  console.log(`# 快照树目录：${TREES_DIR}`);
  console.log(`# tree-meta：${META_FILE}`);
}
console.log(`# 扫描：${scannedTrees} 棵树 / ${scannedMirrors.length} 条镜像记录`);
console.log('# 口径声明（A-1）：`gramps_id` 标识「人」——镜像记录的 `gramps_id` 必等于其**真身**的 `gramps_id`；');
console.log('#   `handle` 仍是**记录级**唯一（`mir_<上层 handle>` 派生不变，A-7）；`jiapu_id_seq` 只抬不降、');
console.log('#   **已铸号不回收**（本脚本零计数器写入，A-4）。');
console.log('# 撞号口径声明（A-3）：断言 =「**同一棵树内不同人不得撞号**」；**同一棵树内同一人出现 2 条记录**');
console.log('#   （真身 + 镜像，或同真身的 2 条镜像）**属甲口径已知形态 ⇒ 允许**，见 ⑤ 段逐组标注。');
console.log('');

// ① 计划修正（逐条 diff）
console.log('## ① 计划修正：镜像 `gramps_id` ← 真身 `gramps_id`（四类镜像 + 立支）');
console.log(
  `   条数：祖谱顶端世本镜像段 ${countByClass('top')} · 宗谱登记镜像 ${countByClass('registration')} · ` +
    `镜像子女 ${countByClass('child')} · 跨树婚姻镜像 ${countByClass('marriage')} · 立支 ${countByClass('branch')} · ` +
    `世系链镜像 ${countByClass('chain')} · 其它 ${countByClass('other')} · 无操作 ${planRows.length - willRename.length}`,
);
if (!planRows.length) console.log('  （无）');
for (const cls of ['top', 'registration', 'chain', 'child', 'marriage', 'branch', 'other']) {
  const rows = planRows.filter((r) => r.class === cls);
  if (!rows.length) continue;
  console.log(`  ── ${CLASS_LABEL[cls]}（${rows.length} 条）`);
  for (const r of rows) {
    if (!r.changed) {
      line('    [无操作]', `${r.tree_id}:${r.handle} ${r.current_gramps_id}（已等于真身号，幂等）`);
      continue;
    }
    line(
      '    [修正]  ',
      `${r.tree_id}:${r.handle} ${r.current_gramps_id} → ${r.true_gramps_id} · ` +
        `真身=${r.true_body_tree}:${r.true_body_handle}（${r.true_body_title} · kind=${r.true_body_kind} · 「${r.true_body_name}」）`,
    );
  }
}
console.log('');

// ② tree-meta 同步
console.log('## ② 计划同步：祖谱 tree-meta.founder_gramps_id（A-6 明写同步面）');
if (!metaRows.length) console.log('  （无）');
for (const r of metaRows) {
  line(
    r.changed ? '  [修正]  ' : '  [无操作]',
    `tree-meta.trees[${r.tree_id}].founder_gramps_id ${r.from} → ${r.to}（founder_handle=${r.founder_handle}）`,
  );
}
console.log('');

// ②-2 树 JSON 顶层 founder_gramps_id（与 tree-meta 是两个字段 · 消除悬空引用）
console.log('## ②-2 计划同步：树 JSON **顶层** `founder_gramps_id`（与 tree-meta.founder_gramps_id 是两个字段）');
console.log('   判据：值恰等于本次被改号镜像的旧号（同树内）⇒ 同步为新号；值 = 本树现存记录编号 ⇒ 无操作；');
console.log('        两者皆非 ⇒ 「历史漂移 · 不动」（只清点，**不推断目标号**）。');
if (!treeJsonRows.length && !treeJsonDrift.length && !treeJsonGuarded.length) console.log('  （无：快照内无树 JSON 顶层 founder_gramps_id）');
for (const r of treeJsonRows) {
  line(
    r.changed ? '  [修正]  ' : '  [无操作]',
    `${r.tree_id}.founder_gramps_id（树 JSON 顶层）${r.from} → ${r.to}` +
      (r.changed
        ? `（旧号 = 本树改号镜像 ${r.source_handle} · ${r.source_class}；消除悬空引用，权威面仍是 tree-meta）`
        : '（已等于本树现存记录编号，幂等）'),
  );
}
for (const r of treeJsonDrift) {
  line('  [历史漂移 · 不动]', `${r.tree_id}.founder_gramps_id（树 JSON 顶层）= ${r.value} —— ${r.note}`);
}
for (const r of treeJsonGuarded) {
  line('  [跳过]  ', `${r.tree_id}.founder_gramps_id（树 JSON 顶层）= ${r.value} —— ${r.note}`);
}
console.log('');

// ③ 清点 / 未在快照中发现（含扫描口径）
console.log('## ③ 清点（未纳入修正 · 真身不可达者）与「未在快照中发现」逐类声明');
console.log('   扫描口径（逐类判据，与脚本头部一致）：');
console.log('     ① 祖谱顶端世本镜像段：本树 kind=clan 且 external_tree→kind=master 的树，external_link_type ∈ {founder, chain}');
console.log('     ② 宗谱登记镜像：本树 kind=clan、link=founder、external_tree→kind=family 的树');
console.log('     ③ 镜像子女：external_link_type === "child"');
console.log('     ④ 跨树婚姻镜像：external_link_type === "marriage"（带 external_marriage_id）');
console.log('     ⑤ 立支：link=founder 且（本树非 clan ⇒ 新树始祖镜像，或 external_relation_note 含「立支」）');
console.log('   （全站人物记录域：<快照>/trees/*.json 的每个 people 键；同批统计见 ① 段条数行）');
for (const cls of ['top', 'registration', 'child', 'marriage', 'branch', 'chain', 'other']) {
  const n = countByClass(cls) + planRows.filter((r) => r.class === cls && !r.changed).length;
  if (!n) console.log(`   [未在快照中发现] ${CLASS_LABEL[cls]}（命中 0 条）`);
}
if (!inventory.length) console.log('  （无不可修正的镜像：孤儿镜像 0 条）');
for (const r of inventory) {
  line('  [清点]  ', `${r.tree_id}:${r.handle} link=${r.link_type} 现号=${r.current_gramps_id} 类别=${r.class_label} —— ${r.note}`);
}
if (treeJsonDrift.length) {
  console.log(`   （另见 ②-2：树 JSON 顶层 founder_gramps_id「历史漂移 · 不动」${treeJsonDrift.length} 条 ⇒ 单列清点，未纳入修正）`);
}
console.log('');

// ④ 跳过 / 待人工核
console.log('## ④ 跳过 / 待人工核');
if (!skips.length) console.log('  （无）');
for (const s of skips) {
  line('  [跳过]  ', `${s.tree_id}${s.handle ? `:${s.handle}` : ''} ${s.reason}`);
}
console.log('');

// ⑤ 撞号断言
console.log('## ⑤ 撞号断言（改号后预演 · 同树内「不同人」不得撞号）');
console.log(`   同人双记录（**允许** · 甲口径已知形态）：${COLLISION.groups.length} 组`);
for (const g of COLLISION.groups) {
  console.log(
    `     [同人·允许] ${g.tree_id} 编号 ${g.gramps_id} 共 ${g.records.length} 条记录：` +
      g.records.map((x) => `${x.handle}「${x.name}」→${x.identity}`).join(' / '),
  );
}
console.log(`   违规撞号（不同人同号 · **必须为 0**）：${COLLISION.violations.length} 组`);
for (const v of COLLISION.violations) {
  console.error(
    `     ❌ [违规·撞号] ${v.tree_id} 编号 ${v.gramps_id} 指向不同身份：` +
      v.records.map((x) => `${x.handle}「${x.name}」→${x.identity}`).join(' / '),
  );
}
console.log('');

console.log(
  `# 汇总：计划修正 ${willRename.length} 条镜像（＝${countByClass('top')} 顶端世本段 + ${countByClass('registration')} 登记镜像 + ` +
    `${countByClass('chain')} 世系链 + ${countByClass('child')} 镜像子女 + ${countByClass('marriage')} 跨树婚姻 + ${countByClass('branch')} 立支 + ${countByClass('other')} 其它）` +
    ` + tree-meta ${metaWillChange.length} 处 + 树 JSON 顶层 ${treeJsonWillChange.length} 处` +
    `（顶层已在树 JSON 内同步，不额外写 tree-meta 字段）；无操作 ${planRows.length - willRename.length} 条；` +
    `仅清点 ${inventory.length} 条；历史漂移 · 不动 ${treeJsonDrift.length} 条；` +
    `跳过 ${skips.length} 条；撞号违规 ${COLLISION.violations.length} 组`,
);

// ⑥ 云端只读自证（仅 cloud 模式 · 证明本次运行零写入）
if (SOURCE === 'cloud') {
  console.log('');
  console.log('## ⑥ 云端只读自证（cloud 模式 · 本次运行零写入）');
  console.log('   云存储写调用：0（未调用 `uploadFile`）· 集合写调用：0（未调用 `doc().set()` / `update()` / `remove()`）');
  console.log(`   云存储读调用：${CLOUD.trees.size} 次（downloadFile，按 _meta.storage_files 逐棵）· 集合读调用：2 次（_meta 单档 + 树档列表）`);
  console.log('   云端树 md5（= 本次运行下载到的字节；连跑两次同值 ⇒ 只读零写入自证）：');
  for (const tid of [...CLOUD.trees.keys()].sort()) {
    const t = CLOUD.trees.get(tid);
    console.log(`     ${t.md5}  trees/${tid}.json  (version=${JSON.stringify(t.tree?.version ?? null)} · indent=${t.indent} · cloudPath=${t.cloudPath})`);
  }
  const metaFingerprint = md5buf(
    Buffer.from(
      JSON.stringify(
        Object.keys(CLOUD.entries)
          .sort()
          .map((k) => [
            k,
            String(CLOUD.entries[k]?.founder_handle || ''),
            String(CLOUD.entries[k]?.founder_gramps_id || ''),
            JSON.stringify(CLOUD.entries[k]?.version ?? null),
          ]),
      ),
    ),
  );
  console.log(`   tree-meta 树档指纹 md5（tree_id/founder_handle/founder_gramps_id/version 聚合）：${metaFingerprint}`);
}

if (JSON_OUT) {
  fs.writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        generated_for: 'A-6 存量镜像编号修正（四类镜像 + 立支）',
        apply: APPLY,
        out_dir: OUT_DIR,
        meta_file: META_FILE,
        counts: {
          trees: scannedTrees,
          mirrors: scannedMirrors.length,
          rename: willRename.length,
          rename_by_class: {
            top: countByClass('top'),
            registration: countByClass('registration'),
            chain: countByClass('chain'),
            child: countByClass('child'),
            marriage: countByClass('marriage'),
            branch: countByClass('branch'),
            other: countByClass('other'),
          },
          meta_rename: metaWillChange.length,
          tree_json_rename: treeJsonWillChange.length,
          tree_json_drift: treeJsonDrift.length,
          tree_json_guarded: treeJsonGuarded.length,
          noop: planRows.length - willRename.length,
          inventory: inventory.length,
          skipped: skips.length,
          collision_same_person: COLLISION.groups.length,
          collision_violations: COLLISION.violations.length,
        },
        plan: planRows,
        meta_plan: metaRows,
        tree_json_plan: treeJsonRows,
        tree_json_drift: treeJsonDrift,
        tree_json_guarded: treeJsonGuarded,
        inventory,
        skips,
        collision: { same_person: COLLISION.groups, violations: COLLISION.violations },
      },
      null,
      2,
    ),
  );
  console.log(`# 计划 JSON 已写出：${JSON_OUT}`);
}

if (COLLISION.violations.length) {
  console.error(`❌ 撞号断言失败：${COLLISION.violations.length} 组「同树内不同人撞号」⇒ 拒绝继续（dry-run 亦以退出码 1 报警）`);
  process.exit(1);
}

// ================= apply（显式开关 · 人工放行后执行） =================
if (!APPLY) {
  console.log('');
  console.log('# DRY-RUN 结束：零写入。`--apply --backup-dir=<dir>` 由派单方在人类放行后执行。');
  process.exit(0);
}

// 云端模式：写回云存储真源（备份云端原件 → CAS → 覆盖注册 cloudPath → 写后逐条读回）
if (SOURCE === 'cloud') await applyCloud();

if (!willRename.length && !metaWillChange.length && !treeJsonWillChange.length) {
  console.log('');
  console.log('# 幂等：无需修正（本次 apply 无写入）');
  process.exit(0);
}

fs.mkdirSync(path.join(BACKUP_DIR, 'trees'), { recursive: true });
fs.writeFileSync(path.join(BACKUP_DIR, 'tree-meta.json'), fs.readFileSync(META_FILE));

let wrote = 0;
for (const [treeId, rows] of changedByTree) {
  const before = fs.readFileSync(treePath(treeId));
  // CAS：写前重读复核 version 与**规划期**一致（同一快照重放时第二次即读到已变的 version ⇒ 拒绝覆盖写）
  const planVersion = PLAN_VERSION.get(treeId);
  const nowTree = readTree(treeId);
  if (JSON.stringify(nowTree?.version) !== JSON.stringify(planVersion)) {
    console.error(`❌ 写前复核失败：${treeId} version 已变（规划期 ${JSON.stringify(planVersion)}，现值 ${JSON.stringify(nowTree?.version)}）⇒ 拒绝该条`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(BACKUP_DIR, 'trees', `${treeId}.json`), before);
  const next = JSON.parse(before.toString('utf8'));
  for (const r of rows) {
    if (next.people?.[r.handle]) next.people[r.handle].gramps_id = r.true_gramps_id;
  }
  // 树 JSON **顶层** `founder_gramps_id` 同步（与 tree-meta.founder_gramps_id 是两个字段 · 消除悬空引用）
  const tj = treeJsonByTree.get(treeId);
  if (tj) next.founder_gramps_id = tj.to;
  fs.writeFileSync(treePath(treeId), JSON.stringify(next, null, 2));
  // 写后逐条读回校验
  const back = readTree(treeId);
  for (const r of rows) {
    if (String(back.people?.[r.handle]?.gramps_id || '') !== r.true_gramps_id) {
      console.error(`❌ 写后校验失败：${treeId}:${r.handle} 期望 ${r.true_gramps_id} 实得 ${back.people?.[r.handle]?.gramps_id}`);
      process.exit(1);
    }
  }
  if (tj && String(back.founder_gramps_id ?? '') !== tj.to) {
    console.error(`❌ 写后校验失败：${treeId}.founder_gramps_id（树 JSON 顶层）期望 ${tj.to} 实得 ${back.founder_gramps_id}`);
    process.exit(1);
  }
  wrote += rows.length;
  console.log(
    `[已写] ${treeId}：${rows.length} 条镜像改号（逐条读回通过）` +
      (tj ? ` + 树 JSON 顶层 founder_gramps_id ${tj.from} → ${tj.to}（读回通过）` : ''),
  );
}

// 写后重跑撞号断言（现盘状态）
const after = collisionScan();
if (after.violations.length) {
  console.error(`❌ 写后撞号断言失败：${after.violations.length} 组同树内不同人撞号（备份在 ${BACKUP_DIR}）`);
  process.exit(1);
}
console.log(`[校验] 写后撞号断言通过：同人双记录 ${after.groups.length} 组 · 违规 ${after.violations.length} 组`);

if (metaWillChange.length) {
  const nextMeta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  for (const r of metaWillChange) {
    const entry = Object.values(nextMeta.trees || {}).find((e) => String(e?.tree_id || '') === r.tree_id);
    if (entry) entry.founder_gramps_id = r.to;
  }
  fs.writeFileSync(META_FILE, JSON.stringify(nextMeta, null, 2));
  const backMeta = readMetaCheck(metaWillChange);
  console.log(`[已写] tree-meta：${backMeta} 处 founder_gramps_id 同步（逐条读回通过）`);
}

console.log('');
console.log(`# APPLY 完成：镜像 ${wrote} 条 + tree-meta ${metaWillChange.length} 处 + 树 JSON 顶层 ${treeJsonWillChange.length} 处；备份在 ${BACKUP_DIR}`);
process.exit(0);

/** 写后读回校验 tree-meta（返回实际同步条数；不符即退出码 1） */
function readMetaCheck(rows) {
  const doc = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  let n = 0;
  for (const r of rows) {
    const entry = Object.values(doc.trees || {}).find((e) => String(e?.tree_id || '') === r.tree_id);
    if (String(entry?.founder_gramps_id || '') !== r.to) {
      console.error(`❌ tree-meta 写后校验失败：${r.tree_id} 期望 ${r.to} 实得 ${entry?.founder_gramps_id}`);
      process.exit(1);
    }
    n += 1;
  }
  return n;
}

// ================= 云端 apply（--source=cloud · 仅 --apply） =================
/**
 * 只读：`_meta` 单档 → `storage_files` **现值**（方案 A 下每次保存都会把该树重指到**新对象** fileID
 * ⇒ 写前/写后的「当前对象」都必须现场取，**绝不复用扫描期的旧 fileID**；旧 fileID 恒回写前内容）。
 */
async function readStorageFilesNow() {
  const r = await CLOUD.col.doc('_meta').get();
  const doc = Array.isArray(r?.data) ? r.data[0] : r?.data;
  return doc?.storage_files || {};
}

/**
 * 载入**生产写路径**（方案 A）：`cloudfunctions/compat-api/lib/store.js` 的**现有导出** ——
 * 树写 = `saveTree`（现证 :1109，cloud 链路 :1135-1157）；tree-meta 树档写 = `mutateTreeMeta`（现证 :794）；
 * 版本化路径模板 = `cloudTreeObjectPath`（现证 :982，**路径字面单点产出在 store，不在本脚本**）。
 * **不自写第二套上传 / 不自拼版本化路径 / 不手动改 `_meta.storage_files`**：
 * 版本化新对象、CAS 重指、`version+1`、`updated_at` 刷新、metaCache 失效、清扫全部由生产路径完成。
 *
 * 凭据桥（**仅 apply 时调用**）：生产 `store.js` 自 `process.env` 取环境与凭据（现证 :79 `ENV` /
 * :216-233 `getApp` 读 `CB_SECRET_ID` + `CB_SECRET_KEY`（或 `CB_KEY`））⇒ 本脚本把**已解析**的凭据
 * **只补缺**写进 `process.env`（键已由环境变量提供则不动；**shell 侧无需 `export`**），
 * 值**绝不打印 / 绝不落盘 / 绝不进任何输出**。`COMPAT_SOURCE` 显式钉为 `cloud`
 * （生产 store 的 local 分支会写 `migrate-output` 目录 —— 本脚本硬边界禁止）。
 */
async function loadStore() {
  for (const k of ['CB_ENV', 'CB_SECRET_ID', 'CB_SECRET_KEY']) {
    if (!String(process.env[k] || '').trim() && CLOUD.cred?.[k]) process.env[k] = CLOUD.cred[k];
  }
  process.env.COMPAT_SOURCE = 'cloud';
  let mod;
  try {
    mod = await import(pathToFileURL(STORE_FILE).href);
  } catch (e) {
    console.error(`❌ 载入生产写路径失败（${STORE_FILE}）：${e?.message || e} ⇒ 零云端写入（退出码 1）`);
    process.exit(1);
  }
  const need = ['saveTree', 'mutateTreeMeta', 'cloudTreeObjectPath'];
  const missing = need.filter((fn) => typeof mod[fn] !== 'function');
  if (missing.length) {
    console.error(
      `❌ 生产写路径缺导出：lib/store.js 无 ${missing.join(' / ')} ⇒ **无法按方案 A 写入**（本脚本不自写第二套上传）` +
        '；零云端写入（退出码 1）。请人工评估最小改动后再派单（不得由本脚本改 lib/store.js）。',
    );
    process.exit(1);
  }
  if (mod.SOURCE !== 'cloud') {
    console.error(`❌ 生产 store 未处于 cloud 模式（COMPAT_SOURCE=${JSON.stringify(mod.SOURCE)}）⇒ 拒绝写（退出码 1，零云端写入）`);
    process.exit(1);
  }
  return mod;
}

/**
 * 云端写路径（**只在 `--source=cloud --apply --backup-dir=<dir>` 时执行** · **一律走生产 store 写路径**）：
 *   ① 写前 CAS 重读（取 `_meta.storage_files` **现值 fileID** → 重下载受影响树：fileID + md5 + `version`
 *      三面同规划期比对；tree-meta 档比对 `founder_gramps_id`）；
 *   ② 备份**云端原件**（写前字节逐字）→ `<backup-dir>/trees/<tree_id>.json` + `tree-meta/<tree_id>.json`
 *      + `MD5-LEDGER.txt` + `summary.json`（先例备份/台账形：migrate-clan-founder-descendants-2026-10.mjs
 *      #writeBackup :670-695、MD5 台账 :683-684；**另记写前 fileID** ⇒ 回滚可精确重指回旧对象）；
 *   ③ 写：逐树 `store.saveTree(next, 规划期 version)`（版本化新对象 + CAS 重指 + `version+1` + `updated_at`
 *      + metaCache 失效 + 清扫）+ 逐处 `store.mutateTreeMeta(tid, mutator)`（每树档 CAS + `version+1`）；
 *   ④ 写后**逐条读回**（按 `_meta.storage_files` **现值 fileID** —— 方案 A 必然已换新对象；轮询仅作安全网，
 *      **预期第 1 轮即全通过**）；
 *   ⑤ 写后重跑撞号断言（以读回树为准）。
 * 退出码：0 = 写成功 / 幂等无操作；1 = CAS 漂移、备份失败、写失败或写后校验超时。
 */
async function applyCloud() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const affectedTrees = [...changedByTree.keys()].sort();
  if (!affectedTrees.length && !metaWillChange.length && !treeJsonWillChange.length) {
    console.log('');
    console.log('# 幂等：无需修正（本次 apply 无写入）');
    process.exit(0);
  }
  /** 生产写路径（方案 A）：树 = saveTree；tree-meta 树档 = mutateTreeMeta */
  const store = await loadStore();
  console.log(
    '# 写路径：生产 store（cloudfunctions/compat-api/lib/store.js）—— 树 = saveTree（现证 :1109）· ' +
      'tree-meta = mutateTreeMeta（现证 :794）；版本化新对象 + CAS 重指 + version+1 + 清扫均由生产路径完成。',
  );

  // ── ① 写前 CAS 重读（重取现值 fileID → 重下载；漂移即拒绝，不自动重试覆盖） ──
  let sfNowBefore = {};
  try {
    sfNowBefore = await readStorageFilesNow();
  } catch (e) {
    console.error(`❌ 写前重读失败：jiapu_tree_meta/_meta（${e?.message || e}）⇒ 拒绝写、零云端写入`);
    process.exit(1);
  }
  for (const tid of affectedTrees) {
    const planned = CLOUD.trees.get(tid);
    const planVersion = PLAN_VERSION.get(tid);
    const fidNow = String(sfNowBefore[tid] || '');
    if (!fidNow) {
      console.error(`❌ 写前重读失败：_meta.storage_files 缺 ${tid}（该树可能已被删除）⇒ 拒绝写、零云端写入`);
      process.exit(1);
    }
    if (fidNow !== planned.fileId) {
      console.error(
        `❌ 写前 CAS 复核失败：trees/${tid}.json 的 fileID 已变（规划期 …${String(planned.fileId).slice(-28)} → 现值 …${fidNow.slice(-28)}）` +
          '—— 方案 A 下每次保存必换新对象 ⇒ fileID 变 = 该树已被别处改写 ⇒ 拒绝覆盖写（退出码 1）',
      );
      process.exit(1);
    }
    let rr;
    try {
      rr = await CLOUD.app.downloadFile({ fileID: fidNow });
    } catch (e) {
      console.error(`❌ 写前重读失败：trees/${tid}.json（${e?.message || e}）⇒ 拒绝写、零云端写入`);
      process.exit(1);
    }
    if (!rr || !rr.fileContent) {
      console.error(`❌ 写前重读无内容：trees/${tid}.json ⇒ 拒绝写、零云端写入`);
      process.exit(1);
    }
    const bytes = Buffer.from(rr.fileContent);
    const nowMd5 = md5buf(bytes);
    let nowTree = null;
    try {
      nowTree = JSON.parse(bytes.toString('utf8'));
    } catch {
      nowTree = null;
    }
    if (!nowTree) {
      console.error(`❌ 写前重读解析失败：trees/${tid}.json ⇒ 拒绝写、零云端写入`);
      process.exit(1);
    }
    if (nowMd5 !== planned.md5) {
      console.error(
        `❌ 写前 CAS 复核失败：trees/${tid}.json 云端字节 md5 已变（规划期 ${planned.md5} → 现值 ${nowMd5}）⇒ 拒绝覆盖写（退出码 1）`,
      );
      process.exit(1);
    }
    if (JSON.stringify(nowTree.version) !== JSON.stringify(planVersion)) {
      console.error(
        `❌ 写前 CAS 复核失败：trees/${tid}.json version 已变（规划期 ${JSON.stringify(planVersion)} → 现值 ${JSON.stringify(nowTree.version)}）⇒ 拒绝覆盖写（退出码 1）`,
      );
      process.exit(1);
    }
    console.log(`【写前 CAS 复核】trees/${tid}.json md5=${nowMd5} · version=${JSON.stringify(nowTree.version)}（同规划期）✓`);
  }
  const metaBefore = new Map();
  for (const r of metaWillChange) {
    const got = await CLOUD.col.doc(r.tree_id).get();
    const doc = Array.isArray(got?.data) ? got.data[0] : got?.data;
    if (!doc) {
      console.error(`❌ 写前重读失败：jiapu_tree_meta/${r.tree_id} 档不存在 ⇒ 拒绝写、零云端写入`);
      process.exit(1);
    }
    if (String(doc.founder_gramps_id || '') !== String(r.from)) {
      console.error(
        `❌ 写前 CAS 复核失败：jiapu_tree_meta/${r.tree_id}.founder_gramps_id 已变（规划期 ${r.from} → 现值 ${doc.founder_gramps_id}）⇒ 拒绝写（退出码 1）`,
      );
      process.exit(1);
    }
    metaBefore.set(r.tree_id, doc);
  }

  // ── ② 备份云端原件（写前字节逐字落盘；失败 ⇒ 零云端写入） ──
  fs.mkdirSync(path.join(BACKUP_DIR, 'trees'), { recursive: true });
  const ledger = [];
  const md5Before = {};
  const fileIdBefore = {}; // 写前 fileID（方案 A 回滚用：把 _meta.storage_files 重指回旧对象；被替换的**上一版必保留**）
  try {
    for (const tid of affectedTrees) {
      const src = CLOUD.trees.get(tid);
      const dest = path.join(BACKUP_DIR, 'trees', `${tid}.json`);
      fs.writeFileSync(dest, src.bytes); // 写前整份字节（含 version / updated_at），逐字
      const m = md5buf(fs.readFileSync(dest));
      if (m !== src.md5) throw new Error(`备份副本 md5 不符：trees/${tid}.json`);
      md5Before[tid] = m;
      fileIdBefore[tid] = src.fileId;
      ledger.push(
        `${m}  trees/${tid}.json  (version=${JSON.stringify(src.tree?.version ?? null)} · ${src.cloudPath} · fileID=${src.fileId})`,
      );
    }
    if (metaWillChange.length) {
      fs.mkdirSync(path.join(BACKUP_DIR, 'tree-meta'), { recursive: true });
      for (const [tid, doc] of metaBefore) {
        const { _id, ...rest } = doc;
        const buf = Buffer.from(JSON.stringify(rest, null, 2));
        fs.writeFileSync(path.join(BACKUP_DIR, 'tree-meta', `${tid}.json`), buf);
        ledger.push(
          `${md5buf(buf)}  tree-meta/${tid}.json  (founder_gramps_id=${rest.founder_gramps_id} · version=${JSON.stringify(rest.version ?? null)})`,
        );
      }
    }
    fs.writeFileSync(path.join(BACKUP_DIR, 'MD5-LEDGER.txt'), `${ledger.join('\n')}\n`);
    fs.writeFileSync(
      path.join(BACKUP_DIR, 'summary.json'),
      `${JSON.stringify(
        {
          script: 'scripts/fix-mirror-gramps-ids-2026-10-16.mjs',
          source: 'cloud',
          env: CLOUD.env,
          backup_trees: affectedTrees,
          cloud_paths: Object.fromEntries(affectedTrees.map((tid) => [tid, CLOUD.trees.get(tid).cloudPath])),
          rename_rows: willRename.length,
          rename_by_class: {
            top: countByClass('top'),
            registration: countByClass('registration'),
            chain: countByClass('chain'),
            child: countByClass('child'),
            marriage: countByClass('marriage'),
            branch: countByClass('branch'),
            other: countByClass('other'),
          },
          meta_sync: metaWillChange.map((r) => r.tree_id),
          tree_json_top_sync: treeJsonWillChange.map((r) => r.tree_id),
          md5_before: md5Before,
          file_id_before: fileIdBefore,
          write_path:
            '生产写路径（方案 A · docs/data-model.md §11.11）：树 = lib/store.js#saveTree（版本化新对象 + CAS 重指 ' +
            '_meta.storage_files + version+1 + updated_at + 清扫）；tree-meta 树档 = lib/store.js#mutateTreeMeta。' +
            '本脚本不自写上传、不自拼版本化路径、不手动改 _meta.storage_files。',
          rollback:
            '① 树 JSON（**首选**）：把 `_meta.storage_files[tree_id]` 用 store.mutateMetaDoc 重指回 file_id_before[tree_id]' +
            '（方案 A 清扫只删上上版 v(N-2) 与已沦为上上版的遗留路径 ⇒ 被替换的上一版对象**必保留**，重指即回滚）；' +
            '若该对象已被后续保存清扫，改用备份字节经生产写路径重落：store.saveTree(备份树, 当前在线版本)（version 再 +1）；' +
            '② tree-meta：store.mutateTreeMeta(tree_id, (e) => ({ ...e, founder_gramps_id: <备份文件里的原值> }))（备份在 ' +
            '<backup-dir>/tree-meta/<tree_id>.json）；③ 本脚本零计数器写入 ⇒ 无 jiapu_id_seq 需还原。',
        },
        null,
        2,
      )}\n`,
    );
  } catch (e) {
    console.error(`❌ 云端备份失败，**未写任何云端对象**：${e?.message || e}`);
    process.exit(1);
  }
  console.log('');
  console.log(
    `📦 云端原件备份已落：${BACKUP_DIR}（trees/ ${affectedTrees.length} 份 + tree-meta/ ${metaWillChange.length} 份 + MD5-LEDGER.txt + summary.json）`,
  );

  // ── ③ 写：**交给生产写路径**（方案 A） ──
  // 树 JSON：`store.saveTree(next, 规划期 version)` —— 生产路径自己完成：上传全新对象
  // `cloudTreeObjectPath(tree_id, version)`（version 已 +1）→ `mutateMetaDoc` 把 `_meta.storage_files[tree_id]`
  // CAS 重指到新 fileID → best-effort 清扫上上版；`updated_at` 刷新与 metaCache 失效同在其中。
  // **本脚本不自写 uploadFile、不自拼版本化路径、不手动改 `_meta.storage_files`。**
  let wrote = 0;
  const uploaded = [];
  for (const tid of affectedTrees) {
    const src = CLOUD.trees.get(tid);
    const rows = changedByTree.get(tid) || [];
    const next = JSON.parse(src.bytes.toString('utf8'));
    for (const r of rows) {
      if (next.people?.[r.handle]) next.people[r.handle].gramps_id = r.true_gramps_id;
    }
    const tj = treeJsonByTree.get(tid);
    if (tj) next.founder_gramps_id = tj.to;
    let written;
    try {
      // expectedVersion = 规划期版本；saveTree 内部**无条件**从真源重读权威 version 再核一次
      // （lib/store.js :1114-1120）⇒ 漂移由生产 CAS 兜住（比本脚本按 fileID 比字节更强），冲突即抛 409。
      written = await store.saveTree(next, src.tree.version);
    } catch (e) {
      console.error(
        `❌ 树写失败（生产路径 saveTree）：trees/${tid}.json（${e?.message || e}${e?.status ? ` · status=${e.status}` : ''}）` +
          `—— 已写：${uploaded.map((u) => u.tid).join(', ') || '（无）'}；**不自动回滚**，请用备份回滚（${BACKUP_DIR}）。退出码 1。`,
      );
      process.exit(1);
    }
    uploaded.push({ tid, rows: rows.length, version: written?.version });
    wrote += rows.length;
    console.log(
      `[已写] trees/${tid}/v${written?.version}.json（生产路径 saveTree · 新对象）：${rows.length} 条镜像改号` +
        (tj ? ` + 树 JSON 顶层 founder_gramps_id ${tj.from} → ${tj.to}` : '') +
        `（version → ${written?.version} · _meta.storage_files 已重指 · 待写后读回）`,
    );
  }
  const metaUploaded = [];
  for (const r of metaWillChange) {
    let entry;
    try {
      // tree-meta 树档：`store.mutateTreeMeta` —— 每树档（_id = tree_id）CAS + 重试 + version+1 + metaCache 失效。
      // 写前值在同一 CAS 的 mutator 内**再核一次**（真源现值 ≠ 规划期 from ⇒ 抛错拒绝写，绝不用陈旧值覆盖）。
      entry = await store.mutateTreeMeta(r.tree_id, (cur) => {
        const nowFrom = String(cur?.founder_gramps_id || '');
        if (nowFrom !== String(r.from)) {
          throw new Error(
            `写前 CAS 复核失败：jiapu_tree_meta/${r.tree_id}.founder_gramps_id 已变（规划期 ${r.from} → 真源现值 ${nowFrom}）⇒ 拒绝写`,
          );
        }
        return { ...cur, founder_gramps_id: r.to };
      });
    } catch (e) {
      console.error(
        `❌ tree-meta 写失败（生产路径 mutateTreeMeta）：jiapu_tree_meta/${r.tree_id}（${e?.message || e}）` +
          `—— 树已写 ${uploaded.length} 棵；**不自动回滚**，请用备份回滚（${BACKUP_DIR}）。退出码 1。`,
      );
      process.exit(1);
    }
    metaUploaded.push({ tid: r.tree_id, from: r.from, to: r.to, version: entry?.version });
    console.log(
      `[已写] jiapu_tree_meta/${r.tree_id}.founder_gramps_id ${r.from} → ${r.to}（生产路径 mutateTreeMeta · version → ${entry?.version} · 待写后读回）`,
    );
  }

  // ── ④ 写后逐条读回（方案 A：**新对象路径 ⇒ 预期第 1 轮即全通过**；轮询仅作安全网） ──
  const VERIFY_ROUNDS = Math.max(1, Number(process.env.FIX_VERIFY_ROUNDS || 7));
  const VERIFY_WAIT_MS = Math.max(0, Number(process.env.FIX_VERIFY_WAIT_MS || 10000));
  console.log('');
  console.log(
    `【写后逐条读回】方案 A：写的是**全新对象**（trees/<id>/v<N>.json）⇒ **预期第 1 轮即全部通过**` +
      `（新路径从未被读过 ⇒ 服务端路径级读缓存不可能命中旧内容）。` +
      `轮询重试最多 ${VERIFY_ROUNDS} 轮 × 间隔 ${VERIFY_WAIT_MS}ms（≈${Math.round(((VERIFY_ROUNDS - 1) * VERIFY_WAIT_MS) / 1000)}s）**仅作安全网**保留` +
      '（FIX_VERIFY_ROUNDS / FIX_VERIFY_WAIT_MS 可覆盖）；多轮才通过须查明，不再归因「传播延迟」。',
  );
  let last = null;
  let passedAt = 0;
  for (let round = 1; round <= VERIFY_ROUNDS; round += 1) {
    if (round > 1) await sleep(VERIFY_WAIT_MS);
    last = await cloudVerify(store, affectedTrees, uploaded);
    if (last.bad === 0) {
      passedAt = round;
      break;
    }
    if (round < VERIFY_ROUNDS) {
      console.log(
        `  ⏳ 第 ${round}/${VERIFY_ROUNDS} 轮：${last.bad} 项尚不符（方案 A 下**不应发生**：新对象路径无缓存可命中 ⇒ 须查明；${VERIFY_WAIT_MS}ms 后重读全部校验面）`,
      );
    }
  }
  if (passedAt) {
    console.log(`  ✅ 第 ${passedAt}/${VERIFY_ROUNDS} 轮**全部通过**（0 项不符）—— 逐条：`);
  } else {
    console.log(`  ❌ 超过 ${VERIFY_ROUNDS} 轮仍有 ${last ? last.bad : '?'} 项不符 —— 以下为**最后一轮**差异（逐条）：`);
  }
  for (const l of last?.lines || []) console.log(l);
  if (!passedAt) {
    console.error(`❌ 写后逐条读回校验超时未通过（备份在 ${BACKUP_DIR}；**不自动回滚**，请用备份回滚）。退出码 1。`);
    process.exit(1);
  }

  // ── ⑤ 写后重跑撞号断言（以**读回的树**为准：先刷新内存树） ──
  for (const tid of affectedTrees) {
    const fresh = last.fresh.get(tid);
    if (fresh?.tree) CLOUD.trees.get(tid).tree = fresh.tree;
  }
  const after = collisionScan();
  if (after.violations.length) {
    console.error(`❌ 写后撞号断言失败：${after.violations.length} 组同树内不同人撞号（备份在 ${BACKUP_DIR}）。退出码 1。`);
    process.exit(1);
  }
  console.log(
    `[校验] 写后撞号断言通过（以读回树为准）：同人双记录 ${after.groups.length} 组 · 违规 ${after.violations.length} 组`,
  );

  console.log('');
  console.log(
    `# 云端 APPLY 完成：镜像 ${wrote} 条 + tree-meta ${metaUploaded.length} 处 + 树 JSON 顶层 ${treeJsonWillChange.length} 处；` +
      `写路径 = 生产 store（saveTree / mutateTreeMeta · 方案 A：每次保存 = 全新对象 + CAS 重指）；` +
      `备份在 ${BACKUP_DIR}（MD5-LEDGER.txt / summary.json · 含写前 fileID）；**未写 jiapu_id_seq**（已铸号不回收）。`,
  );
  process.exit(0);
}

/**
 * 云端**写后逐条读回校验**（纯只读；每轮重读全部校验面）。
 * ⚠️ 方案 A 关键差异：**必须按 `_meta.storage_files` 的现值 fileID 读回**（每次保存都重指到**新对象**）
 * —— 用扫描期的旧 fileID 下载只会拿回**写前内容**（这正是「同路径覆盖写读不回新值」被根治的那件事）。
 * 校验面 = ① 受影响树：fileID 已换新（≠ 写前）且路径 = 生产模板 `store.cloudTreeObjectPath(id, 新版本)`；
 * 按现值 fileID 下载后比对每条 `gramps_id` + 树 JSON 顶层 `founder_gramps_id` + `version`（规划值 +1）
 * + md5（≠ 写前 ⇒ 写确实生效）；② tree-meta：`doc(tree_id).get()` 比对 `founder_gramps_id`。
 * 任一轮 `bad === 0` ⇒ 判成功（方案 A 下**预期第 1 轮**；轮询仅作安全网）。
 * @returns {{bad:number, lines:string[], fresh:Map<string,{bytes:Buffer,md5:string,tree:object|null}>}}
 */
async function cloudVerify(store, affectedTrees, uploaded) {
  const lines = [];
  let bad = 0;
  const vcheck = (label, cond) => {
    if (!cond) bad += 1;
    lines.push(`  ${cond ? '✅' : '❌'} ${label}`);
  };
  const fresh = new Map();
  const versionAfter = new Map((uploaded || []).map((u) => [u.tid, u.version]));
  // 现值 fileID 来源 = `_meta.storage_files`（方案 A：写后必已重指到新对象）
  let sfNow = {};
  try {
    sfNow = await readStorageFilesNow();
  } catch (e) {
    vcheck(`_meta.storage_files 读回可得（${e?.message || e}）`, false);
  }
  for (const tid of affectedTrees) {
    const src = CLOUD.trees.get(tid);
    const rows = changedByTree.get(tid) || [];
    const expectVersion = Number(versionAfter.get(tid));
    // 期望路径 = **生产模板**（store 单点产出，本脚本不自拼）
    const expectPath = store.cloudTreeObjectPath(tid, expectVersion);
    const fid = String(sfNow[tid] || '');
    vcheck(`trees/${tid}.json 已换新对象（_meta.storage_files 现值 fileID ≠ 写前 fileID）`, !!fid && fid !== src.fileId);
    vcheck(`trees/${tid}.json 现值 fileID 路径 = 生产模板 ${expectPath}`, !!fid && fid.endsWith(`/${expectPath}`));
    if (!fid) continue;
    const rr = await CLOUD.app.downloadFile({ fileID: fid }).catch(() => null);
    if (!rr || !rr.fileContent) {
      vcheck(`trees/${tid}.json 读回可得（按现值 fileID）`, false);
      continue;
    }
    const bytes = Buffer.from(rr.fileContent);
    const md5now = md5buf(bytes);
    let tree = null;
    try {
      tree = JSON.parse(bytes.toString('utf8'));
    } catch {
      tree = null;
    }
    fresh.set(tid, { bytes, md5: md5now, tree });
    if (!tree) {
      vcheck(`trees/${tid}.json 读回可解析`, false);
      continue;
    }
    for (const r of rows) {
      vcheck(
        `${tid}:${r.handle} gramps_id 读回 = ${r.true_gramps_id}`,
        String(tree.people?.[r.handle]?.gramps_id || '') === r.true_gramps_id,
      );
    }
    const tj = treeJsonByTree.get(tid);
    if (tj) {
      vcheck(`${tid}.founder_gramps_id（树 JSON 顶层）读回 = ${tj.to}`, String(tree.founder_gramps_id ?? '') === tj.to);
    }
    vcheck(
      `trees/${tid}.json version 读回 = ${versionAfter.get(tid)}（规划值 +1）`,
      Number(tree.version) === Number(versionAfter.get(tid)),
    );
    vcheck(`trees/${tid}.json 读回字节 md5 ≠ 写前（写已生效）`, md5now !== src.md5);
  }
  for (const r of metaWillChange) {
    const got = await CLOUD.col.doc(r.tree_id).get().catch(() => null);
    const doc = Array.isArray(got?.data) ? got.data[0] : got?.data;
    vcheck(
      `jiapu_tree_meta/${r.tree_id}.founder_gramps_id 读回 = ${r.to}`,
      String(doc?.founder_gramps_id || '') === r.to,
    );
  }
  return { bad, lines, fresh };
}
