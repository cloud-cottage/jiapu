#!/usr/bin/env node
/**
 * 存量迁移：给「宗谱登记镜像」补**父子边**（E-6 · 2026-10-16）
 *
 * ── 背景（为什么要补）───────────────────────────────────────────────────────────────────
 * 普通家族树认祖到祖谱时，祖谱自有段会新增 1 条只读**登记镜像**（`external_tree` = 家族树、
 * `external_link_type='founder'`、`external_mirror='true'`，R4）。旧写法把该镜像落成**独立根**
 * （`parent_family: ''`）——「认祖时选的落点节点」只记在家族侧指针里，**不形成父子边**，
 * 于是祖谱里「顶端镜像链 → 桥接代 → 家族始祖登记镜像」的链**连不起来**。
 * 根除口径（E-1）：同一件事一律用**父子边**一种形态（与立支 / 汇宗路径同款：复用
 * `ensureParentFamily` 的家族复用顺序）。本脚本为**存量**登记补上这条边。
 *
 * ── 落点取值链（E-6 逐条）────────────────────────────────────────────────────────────
 *   ① 家族树**始祖的登记指针** `external_person_handle` 所指的祖谱节点
 *      （认祖时写入的即「认祖所选落点」；同一家族树的登记镜像与它一一对应）；
 *   ② ① 缺失 / 取值非法 / 不在本祖谱内 ⇒ 回退到**祖谱顶端镜像段始祖节点**
 *      （`external_tree` = 本祖谱的世本 `master_tree_id`，按 `gramps_id` 升序取首个；无 `master_tree_id`
 *       时按确定性句柄口径 `handle === 'mir_' + external_person_handle`）。
 *   取值非法 = 空值 / 指向登记镜像自身 / 指向家族树始祖自身（历史脏数据），一律不算命中。
 *   ② 也取不到 ⇒ **跳过并计入「无法定落点」**（绝不猜一个落点，绝不写成独立根）。
 *
 * ── 幂等 / 可重放 ───────────────────────────────────────────────────────────────────
 *   已有父边（`parent_family` 指向本祖谱内存在的家族）⇒ 判「无操作」；重跑读数不变。
 *   同一家族树在本祖谱内**至多 1 条**登记：只对第一条（按 `gramps_id` 升序）补边，其余计入异常提示。
 *
 * ── 安全护栏（硬边界）────────────────────────────────────────────────────────────────
 *   - **默认 dry-run**：不给 `--apply` ⇒ **零写入**（只读文件 + 只计算 + 只打印逐条 diff）。
 *   - `--apply` **必须**同时给 `--backup-dir=<dir>`，否则拒绝（退出码 2）。
 *   - `--apply` 前**重读复核 `version`**（与规划期读到的版本不一致 ⇒ 拒绝该条，不覆盖写）。
 *   - `--apply` 写前先落备份（整份写前字节 → `<backup-dir>/trees/<tree_id>.json`），写后**读回校验**。
 *   - **本脚本只对「快照目录」作业**（`--out-dir` / `--meta`）：**绝不直连云端真源**。
 *     云端真源的作业链路由操作员按既有路径执行：
 *       ① 从真源导出相关祖谱 + 家族树 JSON 与 tree-meta 为快照目录；
 *       ② 本脚本 `--dry-run` 复核逐条 diff；
 *       ③ `--apply --backup-dir=<dir>` 写快照；
 *       ④ 用既有上传路径回写真源（`scripts/upload-migrated-to-cloudbase.mjs` 或运维手工 uploadFile）；
 *       ⑤ 写后读回校验（云存储 uploadFile→downloadFile 有秒级~分钟级传播延迟，**不得立即断言**）。
 *   - 新家族需要**真源铸号器**分配的编号：`--apply` 时若某条要新建家族，而 `--family-id=` 未提供
 *     对应个数 ⇒ 拒绝该条（**绝不自行拼一个编号**，避免与真源计数冲突）。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────────────
 *   node scripts/migrate-clan-registration-edge-2026-10-16.mjs \
 *        --out-dir=<快照>/migrate-output --meta=<快照>/tree-meta.json            # dry-run（默认）
 *   node scripts/migrate-clan-registration-edge-2026-10-16.mjs --out-dir=… --meta=… \
 *        --apply --backup-dir=<dir> [--family-id=F000901 --family-id=F000902]     # 写快照（需人工放行）
 *   其它：`--clan=<tree_id>` 只扫单个祖谱；`--json=<path>` 另存计划 JSON（dry-run 亦可）。
 *
 * 退出码：0 = dry-run 完成 / apply 成功 / 幂等无操作；1 = 前置复核或写后校验失败；2 = 用法 / 参数错误。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// ================= 参数 =================
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const valueOf = (n) => {
  const hit = argv.find((a) => a.startsWith(`${n}=`));
  return hit ? hit.slice(n.length + 1) : '';
};
const valuesOf = (n) => argv.filter((a) => a.startsWith(`${n}=`)).map((a) => a.slice(n.length + 1));

if (flag('--help') || flag('-h')) {
  console.log('用法：node scripts/migrate-clan-registration-edge-2026-10-16.mjs --out-dir=<dir> [--meta=<file>] [--clan=<tree_id>] [--json=<path>]');
  console.log('      node scripts/migrate-clan-registration-edge-2026-10-16.mjs --out-dir=<dir> [--meta=<file>] --apply --backup-dir=<dir> [--family-id=F000901 …]');
  console.log('  默认 dry-run（零写入）；--apply 写快照目录，且必须同时给 --backup-dir；本脚本绝不直连云端真源。');
  process.exit(0);
}
const KNOWN = new Set(['--apply', '--dry-run', '--help', '-h']);
const unknown = argv.filter(
  (a) => !KNOWN.has(a) && !/^--(out-dir|meta|clan|json|backup-dir|family-id)=/.test(a),
);
if (unknown.length) {
  console.error(`❌ 未知参数：${unknown.join(' ')}（仅支持 --apply / --dry-run / --out-dir= / --meta= / --clan= / --json= / --backup-dir= / --family-id=）`);
  process.exit(2);
}
const APPLY = flag('--apply');
const OUT_DIR = path.resolve(valueOf('--out-dir') || process.env.COMPAT_OUT_DIR || path.join(REPO, 'migrate-output'));
const META_FILE = path.resolve(valueOf('--meta') || path.join(REPO, 'config', 'tree-meta.json'));
const ONLY_CLAN = valueOf('--clan').trim();
const JSON_OUT = valueOf('--json') ? path.resolve(valueOf('--json')) : '';
const BACKUP_DIR = valueOf('--backup-dir') ? path.resolve(valueOf('--backup-dir')) : '';
const FAMILY_IDS = valuesOf('--family-id').map((s) => s.trim()).filter(Boolean);
if (!fs.existsSync(OUT_DIR)) {
  console.error(`❌ 快照目录不存在：${OUT_DIR}（用 --out-dir=<dir> 指向已导出的快照）`);
  process.exit(2);
}
if (!fs.existsSync(META_FILE)) {
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
const readTree = (treeId) => (fs.existsSync(treePath(treeId)) ? readJson(treePath(treeId)) : null);
const meta = readJson(META_FILE);
const entries = Object.values(meta.trees || {});

const kindOf = (entry) => {
  const k = String(entry?.kind || '').trim();
  if (k === 'master' || k === 'clan' || k === 'family') return k;
  return entry?.is_master ? 'master' : 'family';
};
const entryOf = (treeId) => entries.find((e) => String(e?.tree_id || '') === String(treeId || '')) || null;
const titleOf = (treeId) => entryOf(treeId)?.display_title || treeId;

/** 家族树始祖节点（meta.founder_handle → meta.founder_gramps_id → 树顶层 founder_gramps_id） */
function founderNodeOf(tree, entry) {
  if (!tree?.people) return null;
  const byHandle = String(entry?.founder_handle || '');
  if (byHandle && tree.people[byHandle]) return tree.people[byHandle];
  const want = String(entry?.founder_gramps_id || tree.founder_gramps_id || '');
  if (!want) return null;
  return Object.values(tree.people).find((p) => String(p?.gramps_id || '') === want) || null;
}

/** 宗谱自有段的**登记镜像**（一条登记 = 一棵普通家族树；按 gramps_id 升序，稳定） */
function registrationsOf(clanTree, clanTreeId) {
  return Object.values(clanTree?.people || {})
    .filter((p) => {
      if (String(p?.external_mirror || '') !== 'true') return false;
      if (p.external_link_type !== 'founder') return false;
      const tid = String(p.external_tree || '');
      if (!tid || tid === clanTreeId) return false;
      return kindOf(entryOf(tid)) === 'family';
    })
    .sort((a, b) => String(a.gramps_id || '').localeCompare(String(b.gramps_id || '')));
}

/** 祖谱顶端镜像段始祖节点（外部镜像段；自有段登记镜像不算） */
function clanTopFounderOf(clanTree, clanTreeId, masterTreeId) {
  const isTop = (p) => {
    if (String(p?.external_mirror || '') !== 'true') return false;
    if (p.external_link_type !== 'founder' && p.external_link_type !== 'chain') return false;
    const tid = String(p.external_tree || '');
    if (!tid || tid === clanTreeId) return false;
    if (masterTreeId) return tid === String(masterTreeId);
    return String(p.handle || '') === `mir_${String(p.external_person_handle || '')}`;
  };
  return Object.values(clanTree?.people || {})
    .filter(isTop)
    .sort((a, b) => String(a.gramps_id || '').localeCompare(String(b.gramps_id || '')))[0] || null;
}

/** 落点取值链（E-6）：① 家族树始祖登记指针 → ② 祖谱顶端镜像段始祖节点 */
function resolveLanding({ clanTree, clanTreeId, entry, reg, familyTree, familyEntry }) {
  const founder = founderNodeOf(familyTree, familyEntry);
  const candidates = [];
  const ptr = String(founder?.external_person_handle || '');
  if (ptr) {
    if (ptr === String(reg.handle)) candidates.push({ handle: ptr, source: '①', reject: '指向登记镜像自身' });
    else if (founder && ptr === String(founder.handle)) candidates.push({ handle: ptr, source: '①', reject: '指向家族树始祖自身' });
    else if (!clanTree.people?.[ptr]) candidates.push({ handle: ptr, source: '①', reject: '不在本祖谱内' });
    else return { handle: ptr, source: '①', name: String(clanTree.people[ptr].name || ''), note: '' };
  } else {
    candidates.push({ handle: '', source: '①', reject: '家族树始祖无登记指针' });
  }
  const top = clanTopFounderOf(clanTree, clanTreeId, String(entry?.master_tree_id || ''));
  const why = candidates.map((c) => `${c.source} ${c.reject}`).join('；');
  if (top) return { handle: top.handle, source: '②', name: String(top.name || ''), note: why };
  return { handle: '', source: '②', name: '', note: `${why}；且祖谱顶端镜像段无可作落点的始祖节点` };
}

/** 家族复用顺序（**与 `ensureParentFamily` 同款**）：落点对槽位空着的家族 → 同槽位家族 → 无 */
function reusableFamilyOf(clanTree, parentHandle) {
  const par = clanTree?.people?.[parentHandle];
  if (!par) return null;
  const slotKey = par.gender === 'F' ? 'mother_handle' : 'father_handle';
  const otherKey = slotKey === 'father_handle' ? 'mother_handle' : 'father_handle';
  const fams = (par.spouse_families || []).map((h) => clanTree.families?.[h]).filter(Boolean);
  return (
    fams.find((f) => f[slotKey] === parentHandle && !f[otherKey]) ||
    fams.find((f) => f[slotKey] === parentHandle) ||
    null
  );
}

/** 下一个未用家庭编号（**离线估算**，仅供 dry-run 展示；apply 必须由 --family-id 给真源编号） */
function nextFamilyIdInTree(clanTree) {
  let max = 0;
  for (const f of Object.values(clanTree?.families || {})) {
    const m = /^F?(\d+)$/.exec(String(f?.gramps_id || ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `F${String(max + 1).padStart(6, '0')}`;
}

const hasEdge = (clanTree, reg) =>
  !!reg.parent_family && !!clanTree.families?.[reg.parent_family];

// ================= 扫描与计划 =================
const clanIds = entries
  .filter((e) => kindOf(e) === 'clan' && e.tree_id)
  .map((e) => e.tree_id)
  .filter((id) => !ONLY_CLAN || id === ONLY_CLAN)
  .sort();
if (ONLY_CLAN && !clanIds.length) {
  console.error(`❌ meta 中没有 kind='clan' 的祖谱：${ONLY_CLAN}`);
  process.exit(2);
}

const plan = [];
const clanReadings = [];
const skips = [];
let scannedClans = 0;

for (const clanId of clanIds) {
  const entry = entryOf(clanId);
  const clanTree = readTree(clanId);
  if (!clanTree?.people) {
    skips.push({ clan_tree_id: clanId, reason: '祖谱树 JSON 缺失（快照不完整）' });
    continue;
  }
  scannedClans += 1;
  const regs = registrationsOf(clanTree, clanId);
  const byFamilyTree = new Map();
  for (const reg of regs) {
    const tid = String(reg.external_tree);
    if (!byFamilyTree.has(tid)) byFamilyTree.set(tid, []);
    byFamilyTree.get(tid).push(reg);
  }
  let dupWarn = 0;
  for (const [tid, list] of byFamilyTree) {
    if (list.length > 1) {
      dupWarn += list.length - 1;
      skips.push({
        clan_tree_id: clanId,
        family_tree_id: tid,
        reason: `同一家族树在本祖谱内有 ${list.length} 条登记（基数 1 被破坏）——只处理第一条，其余待人工核`,
      });
    }
    const reg = list[0];
    if (hasEdge(clanTree, reg)) continue; // 幂等：已有父边
    const familyTree = readTree(tid);
    if (!familyTree?.people) {
      skips.push({ clan_tree_id: clanId, family_tree_id: tid, registration_handle: reg.handle, reason: '家族树 JSON 缺失' });
      continue;
    }
    const landing = resolveLanding({
      clanTree,
      clanTreeId: clanId,
      entry,
      reg,
      familyTree,
      familyEntry: entryOf(tid),
    });
    if (!landing.handle) {
      skips.push({
        clan_tree_id: clanId,
        family_tree_id: tid,
        registration_handle: reg.handle,
        reason: `无法定落点（${landing.note}）`,
      });
      continue;
    }
    const reuse = reusableFamilyOf(clanTree, landing.handle);
    plan.push({
      clan_tree_id: clanId,
      clan_title: titleOf(clanId),
      family_tree_id: tid,
      family_title: titleOf(tid),
      registration_handle: reg.handle,
      registration_gramps_id: String(reg.gramps_id || ''),
      registration_name: String(reg.name || ''),
      current_parent_family: String(reg.parent_family || ''),
      landing_handle: landing.handle,
      landing_name: landing.name,
      landing_source: landing.source,
      landing_note: landing.note,
      action: reuse ? 'reuse_family' : 'create_family',
      parent_family: reuse ? reuse.handle : '',
      parent_family_gramps_id: reuse ? String(reuse.gramps_id || '') : nextFamilyIdInTree(clanTree),
      clan_version: clanTree.version,
    });
  }
  clanReadings.push({
    clan_tree_id: clanId,
    clan_title: titleOf(clanId),
    people: Object.keys(clanTree.people).length,
    families: Object.keys(clanTree.families || {}).length,
    registrations: regs.length,
    already_edged: regs.filter((r) => hasEdge(clanTree, r)).length,
    to_add: plan.filter((p) => p.clan_tree_id === clanId).length,
    duplicate_registrations: dupWarn,
    master_tree_id: String(entry?.master_tree_id || ''),
  });
}

// ================= 输出：逐条 diff =================
const line = (s) => console.log(s);
line('════════ 宗谱登记镜像补父子边（E-6 · 2026-10-16）════════');
line(`模式：${APPLY ? '★ APPLY（写快照目录）' : 'dry-run（默认，零写入）'}`);
line(`快照根：${OUT_DIR}`);
line(`tree-meta：${META_FILE}`);
line(`作业范围：${scannedClans} 个祖谱${ONLY_CLAN ? `（--clan=${ONLY_CLAN}）` : '（meta 中全部 kind=clan）'}${APPLY ? ` · 备份目录 ${BACKUP_DIR}` : ''}`);
line('');
line('── 逐祖谱读数 ─────────────────────────────────────────────');
for (const r of clanReadings) {
  line(
    `${r.clan_tree_id}（${r.clan_title}）：节点 ${r.people} · 家族 ${r.families} · 登记镜像 ${r.registrations} 条` +
      `（已有父边 ${r.already_edged}）· **待补边 ${r.to_add}**` +
      `${r.duplicate_registrations ? ` · ⚠️ 重复登记 ${r.duplicate_registrations} 条` : ''}` +
      ` · 世本 ${r.master_tree_id || '(未登记 master_tree_id)'}`,
  );
}
line('');
line('── 逐条 diff ───────────────────────────────────────────────');
if (!plan.length) {
  line('（无待补边：存量登记均已有父边，或无可定落点者见下表）');
}
for (const p of plan) {
  line(
    [
      `祖谱 ${p.clan_tree_id}`,
      `家族树 ${p.family_tree_id}（${p.family_title}）`,
      `登记镜像 ${p.registration_handle}（${p.registration_gramps_id} ${p.registration_name}）`,
      `旧 = ${p.current_parent_family ? `父家族 ${p.current_parent_family}` : '独立根（无父边，parent_family=""）'}`,
      `新 = 挂到 ${p.landing_handle}（${p.landing_name}）之下${p.landing_source === '②' ? '（落点②：祖谱顶端镜像段始祖）' : '（落点①：家族树始祖登记指针）'}`,
      p.action === 'reuse_family'
        ? `家族 = 复用 ${p.parent_family}（${p.parent_family_gramps_id}）`
        : `家族 = 新建（预计编号 ${p.parent_family_gramps_id}；apply 须由 --family-id 提供真源铸号）`,
    ].join(' · '),
  );
  if (p.landing_note) line(`    ↳ 落点①不采用的原因：${p.landing_note}`);
}
line('');
line('── 跳过 / 待人工核 ─────────────────────────────────────────');
if (!skips.length) line('（无）');
for (const s of skips) {
  line(`祖谱 ${s.clan_tree_id}${s.family_tree_id ? ` · 家族树 ${s.family_tree_id}` : ''}${s.registration_handle ? ` · 登记镜像 ${s.registration_handle}` : ''}：${s.reason}`);
}
line('');
line(`【预计补边】${plan.length} 条（其中复用既有家族 ${plan.filter((p) => p.action === 'reuse_family').length} 条 / 需新建家族 ${plan.filter((p) => p.action === 'create_family').length} 条）`);
line(`【已具父边（无操作）】${clanReadings.reduce((a, r) => a + r.already_edged, 0)} 条 · 【跳过】${skips.length} 条`);

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(
    JSON_OUT,
    JSON.stringify({ generated_at: new Date().toISOString(), apply: APPLY, out_dir: OUT_DIR, meta_file: META_FILE, clan_readings: clanReadings, plan, skips }, null, 2),
  );
  line(`计划 JSON 已另存：${JSON_OUT}`);
}

// ================= APPLY（需 --apply + --backup-dir；本单未执行） =================
if (!APPLY) {
  line('');
  line('（dry-run 结束：未写任何文件。apply 需 --apply --backup-dir=<dir>，且必须由派单方在人类放行后执行。）');
  process.exit(0);
}
if (!plan.length) {
  line('');
  line('【幂等】无待补边 ⇒ 无操作（退出码 0）');
  process.exit(0);
}
line('');
line('── 执行（写快照目录）───────────────────────────────────────');
fs.mkdirSync(path.join(BACKUP_DIR, 'trees'), { recursive: true });
let familyIdCursor = 0;
let failed = 0;
for (const p of plan) {
  const file = treePath(p.clan_tree_id);
  const fresh = readJson(file);
  if (fresh.version !== p.clan_version) {
    line(`✗ 祖谱 ${p.clan_tree_id}：version ${fresh.version} ≠ 规划期 ${p.clan_version} ⇒ 拒绝该条（不覆盖写）`);
    failed += 1;
    continue;
  }
  const reg = fresh.people?.[p.registration_handle];
  if (!reg) {
    line(`✗ 登记镜像 ${p.registration_handle} 已不存在 ⇒ 跳过`);
    failed += 1;
    continue;
  }
  if (reg.parent_family && fresh.families?.[reg.parent_family]) {
    line(`= 登记镜像 ${p.registration_handle} 已有父边 ⇒ 无操作（幂等）`);
    continue;
  }
  // 备份（整份写前字节）
  fs.writeFileSync(path.join(BACKUP_DIR, 'trees', `${p.clan_tree_id}.json`), JSON.stringify(fresh, null, 2));
  // 新家族编号：apply 一律用操作员给出的真源铸号（避免与真源计数器冲突）
  let famHandle = p.parent_family;
  if (p.action === 'create_family') {
    const given = FAMILY_IDS[familyIdCursor];
    familyIdCursor += 1;
    if (!given) {
      line(`✗ 祖谱 ${p.clan_tree_id}：需新建家族但 --family-id 不足（已给 ${FAMILY_IDS.length} 个）⇒ 拒绝该条`);
      failed += 1;
      continue;
    }
    p.parent_family_gramps_id = given;
    famHandle = `cfam_reg_${p.registration_handle}`;
    // 落点槽位（男 → 父亲位，女 → 母亲位；未知按父亲位，与 tree-write.parentSlot 同口径）
    const parent = fresh.people[p.landing_handle];
    const parentIsMother = String(parent?.gender || '') === 'F';
    fresh.families[famHandle] = {
      handle: famHandle,
      gramps_id: given,
      father_handle: parentIsMother ? '' : p.landing_handle,
      mother_handle: parentIsMother ? p.landing_handle : '',
      child_handles: [p.registration_handle],
    };
    parent.spouse_families = [...(parent.spouse_families || []), famHandle];
  } else {
    const fam = fresh.families[famHandle];
    if (!fam) {
      line(`✗ 祖谱 ${p.clan_tree_id}：复用家族 ${famHandle} 不存在 ⇒ 拒绝该条`);
      failed += 1;
      continue;
    }
    fam.child_handles = [...(fam.child_handles || []).filter((h) => h !== p.registration_handle), p.registration_handle];
  }
  reg.parent_family = famHandle;
  fresh.version = Number(fresh.version || 0) + 1;
  fresh.updated_at = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
  // 写后读回校验
  const back = readJson(file);
  const ok =
    String(back.people?.[p.registration_handle]?.parent_family || '') === famHandle &&
    (back.families?.[famHandle]?.child_handles || []).includes(p.registration_handle);
  line(`${ok ? '✓' : '✗'} 祖谱 ${p.clan_tree_id} · 登记镜像 ${p.registration_handle} → 家族 ${famHandle}（${p.parent_family_gramps_id}）version→${back.version}${ok ? '（读回校验通过）' : '（读回校验失败）'}`);
  if (!ok) failed += 1;
}
line('');
line(failed ? `❌ 有 ${failed} 条未完成 / 校验失败（退出码 1，未自动回滚：用 ${BACKUP_DIR} 备份逐条回退）` : `✅ 全部完成（备份在 ${BACKUP_DIR}）；回写云端真源请走既有上传路径，并做写后读回校验（容传播延迟）`);
process.exit(failed ? 1 : 0);
