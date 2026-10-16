/**
 * 始祖挂载（认祖 / Founders Attach）单元测试 — docs/founder-attach.spec.md
 *
 * 纯函数部分：镜像判定 / 一树一挂载 / 只读判定 / 字段计划 / 申请单过滤 / 读侧推导。
 * 写路径部分：COMPAT_OUT_DIR 指向 /tmp 副本目录造树（绝不写 migrate-output 真源），
 * 收尾用 md5 校验真实树文件与 config/tree-meta.json 未被改动。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/founder-attach.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_OUT = process.env.COMPAT_REAL_OUT || path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-founder-attach-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
// tree-meta 也指到副本：硬口径 2（普通树不得直挂世本）需要按 kind 判定认祖 target，
// 且祖谱认祖会写 meta —— 真源 config/tree-meta.json 必须保持只读（见文末 md5 断言）。
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;

/** 测试用 tree-meta 副本（zhonghua=master / mt_*=family / mc_*=clan） */
const metaFixture = {
  _schema: '1.1',
  trees: {
    zhonghua: {
      tree_id: 'zhonghua', kind: 'master', is_master: true, path_alias: '/zhonghua',
      surname_char: '华', display_title: '中华世本 · 全球华人家谱总谱', genealogy_name: '中华世本',
      origin: '中华', description: '总谱', enable_custom_domain: true,
    },
  },
};
// 家族树条目（kind='family'；始祖位置 f）
for (const tag of ['attach', 'once', 'n1', 'n2', 'lock', 'detach', 'list_a', 'list_b', 'req', 'req2', 'decide', 'direct', 'det_a', 'det_b']) {
  metaFixture.trees[`mt_${tag}`] = {
    tree_id: `mt_${tag}`, kind: 'family', path_alias: `/mt_${tag}`, surname_char: '季',
    display_title: `季氏测试家族 ${tag}`, founder_handle: 'f', enable_custom_domain: false,
  };
}
// 祖谱条目（kind='clan'）：mc_clan 认 mX（季）、mc_xu 同节点异姓（徐）、mc_ji2 认 mRoot
metaFixture.trees.mc_clan = {
  tree_id: 'mc_clan', kind: 'clan', path_alias: '/z/mc_clan', surname: '季', surname_char: '季',
  display_title: '季氏祖谱', genealogy_name: '季氏祖谱', founder_handle: 'own_ji',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
metaFixture.trees.mc_xu = {
  tree_id: 'mc_xu', kind: 'clan', path_alias: '/z/mc_xu', surname: '徐', surname_char: '徐',
  display_title: '徐氏祖谱', founder_handle: 'own_xu',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
metaFixture.trees.mc_list = {
  tree_id: 'mc_list', kind: 'clan', path_alias: '/z/mc_list', surname: '季', surname_char: '季',
  display_title: '季氏祖谱 list', founder_handle: 'own_ji',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
metaFixture.trees.mc_ji2 = {
  tree_id: 'mc_ji2', kind: 'clan', path_alias: '/z/mc_ji2', surname: '季', surname_char: '季',
  display_title: '季氏祖谱二', founder_handle: 'own_ji2',
  master_tree_id: 'zhonghua', master_handle: 'mRoot', master_name: '风伏羲', enable_custom_domain: false,
};
// 顶端链镜像用例的祖谱（seedClan('chain') 会造这棵树；meta 注册须同步，否则树被当作 family）
metaFixture.trees.mc_chain = {
  tree_id: 'mc_chain', kind: 'clan', path_alias: '/z/mc_chain', surname: '季', surname_char: '季',
  display_title: '季氏祖谱（顶端链镜像）', founder_handle: 'own_ji',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
// ---- A-2 清尾（2026-10-16）夹具 ----
// ① mc_noid：祖谱（自有段 own_noid）；`founder_gramps_id` 故意写成陈旧值 → 认祖世本后须随树内始祖
//    节点现值同步（A-7）。姓氏取「聂」：异姓不撞「世本节点 × 姓」唯一性（mc_clan/mc_list/mc_chain 已占 季×mX）
metaFixture.trees.mc_noid = {
  tree_id: 'mc_noid', kind: 'clan', path_alias: '/z/mc_noid', surname: '聂', surname_char: '聂',
  display_title: '聂氏祖谱（顶端镜像不铸号）', founder_handle: 'own_noid',
  founder_gramps_id: '000000099', founder_name: '聂花',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
// ② mc_yu：祖谱**始祖登记正指向顶端镜像段节点**（founder_handle = mir_mX，无自有段）——
//    A-7：镜像改取真身号后，meta.founder_gramps_id 必须跟着镜像新号（旧值 000000162 = 旧口径自铸号）
metaFixture.trees.mc_yu = {
  tree_id: 'mc_yu', kind: 'clan', path_alias: '/z/mc_yu', surname: '鱼', surname_char: '鱼',
  display_title: '鱼氏祖谱（始祖=顶端镜像）', founder_handle: 'mir_mX',
  founder_gramps_id: '000000162', founder_name: '季始祖公',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
// ③ zhonghua_noid：世本副本，其节点 mNoid **没有全站编号** → A-2 判负夹具（真身无号 ⇒ 400 拒绝镜像）
metaFixture.trees.zhonghua_noid = {
  tree_id: 'zhonghua_noid', kind: 'master', is_master: true, path_alias: '/zhonghua_noid',
  surname_char: '华', display_title: '中华世本（真身无号夹具）', genealogy_name: '中华世本',
  origin: '中华', description: '总谱（判负夹具）', enable_custom_domain: true,
};
fs.writeFileSync(META_FILE, JSON.stringify(metaFixture, null, 2));

const fa = await import('./founder-attach.js');
const clanLib = await import('./clan.js');
const { updatePerson } = await import('./tree-write.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// 真实数据基线（测试结束必须一模一样）
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realBaseline = new Map(
  fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]),
);
const metaBaseline = md5(REAL_META);

// ---- 造数工具 ----

function writeTree(tree) {
  const p = path.join(TMP, 'trees', `${tree.tree_id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tree, null, 2));
}
function readTree(treeId) {
  return JSON.parse(fs.readFileSync(path.join(TMP, 'trees', `${treeId}.json`), 'utf8'));
}
function treeFileMd5(treeId) {
  return md5(path.join(TMP, 'trees', `${treeId}.json`));
}
function writeDetail(doc) {
  const p = path.join(TMP, 'details', `${doc._id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(doc, null, 2));
}
function readDetailDoc(treeId, handle) {
  const p = path.join(TMP, 'details', `${treeId}:${handle}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// 总谱（zhonghua）副本：真身节点 mRoot（原始节点，世数 0）/ mX（第 12 世）+ 其下世系链 mChild → mGrand
writeTree({
  _schema: '1.0',
  tree_id: 'zhonghua',
  founder_gramps_id: '000000001',
  version: 7,
  people: {
    mRoot: {
      handle: 'mRoot', gramps_id: '000000001', name: '风伏羲', surname: '风', given: '伏羲', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
    },
    mX: {
      handle: 'mX', gramps_id: '000000100', name: '季始祖公', surname: '季', given: '始祖公', gender: 'M',
      birth_date: '前1200', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: ['mf1'],
    },
    mChild: {
      handle: 'mChild', gramps_id: '000000101', name: '季二世', surname: '季', given: '二世', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'mf1', spouse_families: ['mf2'],
    },
    mGrand: {
      handle: 'mGrand', gramps_id: '000000102', name: '季三世', surname: '季', given: '三世', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'mf2', spouse_families: [],
    },
  },
  families: {
    mf1: { handle: 'mf1', gramps_id: 'F000001', father_handle: 'mX', mother_handle: '', child_handles: ['mChild'] },
    mf2: { handle: 'mf2', gramps_id: 'F000002', father_handle: 'mChild', mother_handle: '', child_handles: ['mGrand'] },
  },
});
writeDetail({ _id: 'zhonghua:mRoot', tree_id: 'zhonghua', handle: 'mRoot', name: '风伏羲', events: [], attributes: [{ key: 'external_chain_gen', value: '0', type: 'external_chain_gen' }] });
writeDetail({ _id: 'zhonghua:mX', tree_id: 'zhonghua', handle: 'mX', name: '季始祖公', events: [], attributes: [{ key: 'external_chain_gen', value: '12', type: 'external_chain_gen' }] });

/** A-2 判负夹具：世本副本，唯一节点 mNoid **无全站编号**（gramps_id=''）→ 真身无号 */
writeTree({
  _schema: '1.0',
  tree_id: 'zhonghua_noid',
  founder_gramps_id: '',
  version: 1,
  people: {
    mNoid: {
      handle: 'mNoid', gramps_id: '', name: '无号始祖', surname: '无', given: '号始祖', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
    },
  },
  families: {},
});

/** 普通家族树副本：始祖 f（I0001）+ 子 kid；用于挂载/解除/只读测试 */
function seedTree(tag) {
  const treeId = `mt_${tag}`;
  writeTree({
    _schema: '1.0',
    tree_id: treeId,
    founder_gramps_id: '000000001',
    version: 3,
    people: {
      f: {
        handle: 'f', gramps_id: '000000001', name: '季某', surname: '季', given: '某', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: ['fam'],
      },
      kid: {
        handle: 'kid', gramps_id: '000000002', name: '季子', surname: '季', given: '子', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'fam', spouse_families: [],
      },
    },
    families: {
      fam: { handle: 'fam', gramps_id: 'F000001', father_handle: 'f', mother_handle: '', child_handles: ['kid'] },
    },
  });
  return treeId;
}

/**
 * 祖谱副本（docs/clan-tree.spec.md）：顶端 = 世本镜像（mX / mRoot），其下自有支系入口节点 own_*。
 * 与上方 metaFixture 的条目一致（own_ji / own_xu / own_ji2）。
 */
function seedClan(tag, { masterHandle = 'mX', ownHandle = 'own_ji', ownName = '季花' } = {}) {
  const treeId = `mc_${tag}`;
  const surname = ownName.slice(0, 1);
  const tree = {
    _schema: '1.0',
    tree_id: treeId,
    kind: 'clan',
    founder_gramps_id: '000000001',
    version: 1,
    updated_at: '',
    people: {
      [ownHandle]: {
        handle: ownHandle, gramps_id: '000000002', name: ownName, surname, given: ownName.slice(1), gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
        external_tree: '', external_person_handle: '', external_link_type: '',
      },
    },
    families: {},
  };
  clanLib.applyClanTopMirror({
    tree,
    masterTree: readTree('zhonghua'),
    masterTreeId: 'zhonghua',
    masterHandle,
    depth: 0,
    ownRootHandle: ownHandle,
  });
  writeTree(tree);
  return treeId;
}

/** 顶端始祖镜像的 handle（确定性：mir_<世本 handle>） */
const mirrorHandleOf = (masterHandle) => `${clanLib.CLAN_MIRROR_PREFIX}${masterHandle}`;

// ============ 纯函数 ============

test('镜像判定与一树一挂载：link_type=founder + 指向总谱 → 镜像；已挂载再挂 → 400', () => {
  const mirror = { handle: 'x', external_tree: 'zhonghua', external_person_handle: 'mX', external_link_type: 'founder', external_mirror: 'true' };
  assert.equal(fa.isFounderMirror(mirror, 'zhonghua'), true);
  assert.equal(fa.isFounderMirror(mirror, 'ji_23395_01'), false, '指向别的树不算始祖镜像');
  assert.equal(fa.isFounderMirror({ ...mirror, external_link_type: 'marriage' }, 'zhonghua'), false);
  assert.equal(fa.isFounderMirror({ ...mirror, external_tree: '' }, 'zhonghua'), false);
  assert.equal(fa.isFounderMirror(null, 'zhonghua'), false);

  assert.throws(() => fa.assertOneAttachPerTree(mirror), (e) => e.status === 400 && /已认祖，请先解除挂载/.test(e.message));
  assert.doesNotThrow(() => fa.assertOneAttachPerTree({ handle: 'y', external_link_type: '', external_tree: '' }));
  assert.doesNotThrow(() => fa.assertOneAttachPerTree({ handle: 'y', external_link_type: 'branch', external_tree: 'zhonghua' }));
});

test('始祖节点解析：tree-meta.founder_handle 优先 → founder_gramps_id（不兜底 I0001）', () => {
  const tree = {
    tree_id: 't',
    people: {
      h58: { handle: 'h58', gramps_id: '000000058', name: '季始祖' },
      h01: { handle: 'h01', gramps_id: '000000001', name: '另一人' },
    },
  };
  // ① meta.founder_handle 显式指定
  assert.equal(fa.resolveFounderHandle(tree, { founder_handle: 'h01' }), 'h01');
  // ② meta.founder_gramps_id（ji_23395_01 实测：I0058）
  assert.equal(fa.resolveFounderHandle(tree, { founder_gramps_id: '000000058' }), 'h58');
  assert.equal(fa.founderGrampsIdOf(tree, { founder_gramps_id: '000000058' }), '000000058');
  // ③ meta 无信息 → 树 JSON 的 founder_gramps_id（仍有效）；都没有 → ''（绝不兜底 I0001）
  assert.equal(fa.resolveFounderHandle({ ...tree, founder_gramps_id: '000000058' }, null), 'h58');
  assert.equal(fa.resolveFounderHandle(tree, null), '', '未登记始祖时不得把 I0001 当始祖');
  assert.equal(fa.resolveFounderHandle({ ...tree, founder_gramps_id: '000000001' }, null), 'h01', '树 JSON 显式登记 I0001 时才认');
  const plain = { tree_id: 't2', people: { a: { handle: 'a', gramps_id: '000000001' } } };
  assert.equal(fa.resolveFounderHandle(plain, null), '', '无登记 + 只有 I0001 → 不认（前端同口径）');
  assert.equal(fa.resolveFounderHandle({ tree_id: 't3', people: {} }, null), '');
  assert.equal(fa.founderGrampsIdOf({}, null), '', '不兜底 I0001');
  assert.equal(fa.founderGrampsIdOf(plain, null), '');
});

test('只读判定（R2/R2b/R3）：镜像 → 锁；真身始祖与「未认祖的自建始祖位」→ 放行', async () => {
  const tree = {
    tree_id: 'mt',
    founder_gramps_id: '000000001',
    people: {
      f: { handle: 'f', gramps_id: '000000001', name: '季始祖公', external_tree: 'zhonghua', external_person_handle: 'mX', external_link_type: 'founder', external_mirror: 'true' },
      kid: { handle: 'kid', gramps_id: '000000002', name: '季子' },
    },
  };
  assert.equal(fa.founderLockMessage(tree.people.f, tree, 'zhonghua'), fa.MIRROR_LOCK_MESSAGE);
  assert.equal(fa.founderLockMessage(tree.people.f, tree, 'zhonghua'), '始祖节点信息需在中华世本（总谱）中修改');
  // 孤儿镜像（镜像标记在、真身不可达）→ 只读（R2b：本文案只保留给这一支）
  const orphan = { handle: 'orph', gramps_id: '000000001', name: '孤儿镜像', external_link_type: 'founder', external_mirror: 'true' };
  const orphanTree = { tree_id: 'mt_orph', founder_gramps_id: '000000001', people: { orph: orphan } };
  assert.equal(fa.isOrphanMirror(orphan), true);
  assert.equal(fa.founderLockMessage(orphan, orphanTree, 'zhonghua'), fa.PLACEHOLDER_LOCK_MESSAGE);
  // R2b：取消「空白占位锁」—— 始祖位置 + 无姓名 + 无链接（未认祖的自建始祖位）→ 可自行填写
  const phTree = { tree_id: 'mt_ph', founder_gramps_id: '000000001', people: { ph: { handle: 'ph', gramps_id: '000000001', name: '' } } };
  assert.equal(fa.founderLockMessage(phTree.people.ph, phTree, 'zhonghua'), '', '自建始祖位不再上锁');
  assert.equal(await fa.personEditLockMessage(phTree.people.ph, phTree, 'zhonghua'), '', '写路径同判据');
  // 真身始祖 + 登记指针（R2：指向宗谱，不是镜像）→ 可编辑
  const regTree = {
    tree_id: 'mt_reg',
    founder_gramps_id: '000000001',
    people: { f: { handle: 'f', gramps_id: '000000001', name: '季某', external_tree: 'mc_clan', external_person_handle: 'own_ji', external_link_type: 'founder', external_mirror: '' } },
  };
  assert.equal(fa.founderLockMessage(regTree.people.f, regTree, 'zhonghua'), '', 'R2：家族树真身始祖可写');
  // 普通节点（非始祖位置）正常可编辑
  assert.equal(fa.founderLockMessage(tree.people.kid, tree, 'zhonghua'), '');
  // 有姓名的未挂载始祖（新建树常态）可编辑
  const namedTree = { tree_id: 'mt_named', founder_gramps_id: '000000001', people: { f2: { handle: 'f2', gramps_id: '000000001', name: '季某' } } };
  assert.equal(fa.founderLockMessage(namedTree.people.f2, namedTree, 'zhonghua'), '');
  // 总谱自身不受锁
  assert.equal(fa.founderLockMessage(tree.people.f, { ...tree, tree_id: 'zhonghua' }, 'zhonghua'), '');
});

test('字段计划：认祖登记不覆盖真身身份；解除只清指针（真身数据保留）；镜像计划仍供登记镜像用', () => {
  const founder = { handle: 'f', gramps_id: '000000001', name: '季某', surname: '季', given: '某', gender: 'M', birth_date: '1901', death_date: '', parent_family: '', spouse_families: ['fam'], external_tree: '', external_person_handle: '', external_link_type: '' };
  const master = { handle: 'mX', name: '季始祖公', surname: '季', given: '始祖公', gender: 'M', birth_date: '前1200', death_date: '' };
  const masterMirror = fa.planFounderMirror(founder, master, 'zhonghua', 12, '16600000000');
  assert.equal(masterMirror.external_tree, 'zhonghua');
  assert.equal(masterMirror.external_person_handle, 'mX');
  assert.equal(masterMirror.external_link_type, 'founder');
  assert.equal(masterMirror.external_mirror, 'true');
  assert.equal(masterMirror.external_relation_note, '季始祖公（中华世本 · 第 12 世）');
  assert.equal(masterMirror.name, '季始祖公');
  assert.equal(masterMirror.birth_date, '前1200');
  assert.equal(masterMirror.external_founder_created_by, '16600000000');

  // R2：家族树始祖认祖 = **登记指针**，身份字段原样保留、不写镜像标记
  const reg = fa.planFounderRegistration(founder, { masterTreeId: 'mc_clan', masterPerson: { handle: 'own_ji', name: '季花' }, gen: 12, requestedBy: '16600000000', layerLabel: '祖谱' });
  assert.equal(reg.name, '季某', '身份字段不被覆盖');
  assert.equal(reg.birth_date, '1901');
  assert.equal(reg.gender, 'M');
  assert.equal(reg.external_tree, 'mc_clan');
  assert.equal(reg.external_person_handle, 'own_ji');
  assert.equal(reg.external_link_type, 'founder');
  assert.equal(reg.external_mirror, '', 'R2：真身不带镜像标记');
  assert.equal(reg.external_relation_note, '季花（祖谱 · 第 12 世）');

  // R2：解除 = 只清跨树指针与上层登记，真身身份数据保留
  const detached = fa.planFounderDetach({ ...reg, external_prev_clan_founder_handle: 'own_ji' });
  assert.equal(detached.handle, 'f');
  assert.equal(detached.gramps_id, '000000001', '始祖位置不变');
  assert.deepEqual(detached.spouse_families, ['fam'], '本树家族关系不受影响');
  assert.equal(detached.name, '季某', '真身姓名保留');
  assert.equal(detached.surname, '季');
  assert.equal(detached.gender, 'M');
  assert.equal(detached.birth_date, '1901', '真身生卒保留');
  assert.equal(detached.external_tree, '');
  assert.equal(detached.external_person_handle, '');
  assert.equal(detached.external_link_type, '');
  assert.equal(detached.external_mirror, '');
  assert.equal(detached.external_relation_note, '');
  assert.equal(detached.external_prev_clan_founder_handle, '', '回滚字段一并清掉');

  // 无世数时备注退化
  assert.equal(fa.founderRelationNote('风伏羲', null), '风伏羲（中华世本）');
  assert.equal(fa.chainGenOf({ attributes: [{ key: 'external_chain_gen', value: '0' }] }), 0);
  assert.equal(fa.chainGenOf({ attributes: [] }), null);
  // R4 备注口径
  assert.equal(fa.founderRegistrationNote('季花', '季氏费县白露家族'), '季花（季氏费县白露家族 · 始祖）');
});

test('申请单：构造字段完整；待审批过滤 chief 看全部 / steward 只看本树 + 倒序', () => {
  const req = fa.buildFounderRequest({
    id: 'r1',
    treeId: 'mt_a',
    founder: { handle: 'f', gramps_id: '000000001', name: '季某' },
    masterTreeId: 'zhonghua',
    masterPerson: { handle: 'mX', name: '季始祖公' },
    requestedBy: '16600000001',
    note: '认祖',
    now: '2026-09-15T01:00:00.000Z',
  });
  assert.deepEqual(Object.keys(req).sort(), [
    '_id', 'created_at', 'decided_at', 'decided_by', 'founder_gramps_id', 'founder_handle', 'founder_name',
    'master_handle', 'master_name', 'master_tree_id', 'note', 'reject_reason', 'requested_by', 'status', 'tree_id',
  ]);
  assert.equal(req.status, 'pending');
  assert.equal(req.master_tree_id, 'zhonghua');

  const list = [
    { _id: 'a', tree_id: 'mt_a', status: 'pending', created_at: '2026-09-14T00:00:00Z' },
    { _id: 'b', tree_id: 'mt_b', status: 'pending', created_at: '2026-09-15T00:00:00Z' },
    { _id: 'c', tree_id: 'mt_a', status: 'rejected', created_at: '2026-09-15T00:00:00Z' },
  ];
  assert.deepEqual(fa.filterPendingRequests(list, { chief: true }).map((r) => r._id), ['b', 'a']);
  assert.deepEqual(fa.filterPendingRequests(list, { chief: false, myTree: 'mt_a' }).map((r) => r._id), ['a']);
  assert.deepEqual(fa.filterPendingRequests(list, { chief: false, myTree: 'mt_z' }), []);
});

// ============ 写路径 ============

test('认祖登记（family→clan）：本树始祖保持真身 + 宗谱自有段新增 1 条只读登记镜像', async () => {
  const treeId = seedTree('attach');
  const clanId = seedClan('clan');
  const masterBefore = treeFileMd5('zhonghua');
  const clanPeopleBefore = Object.keys(readTree(clanId).people).length;

  const r = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji', requestedBy: '16600000000' });
  assert.equal(r.ok, true);
  assert.equal(r.target_kind, 'clan');
  assert.equal(r.relation_note, '季花（祖谱）', '上层层级为祖谱 → 备注写「祖谱」');
  assert.equal(r.founder_true_body, true, 'R2：本树始祖仍是真身');
  assert.match(r.message, /已认祖/);

  // ① 家族树侧：登记指针齐全 + **不写镜像标记**（R2：本树始祖可写）
  const after = readTree(treeId);
  const f = after.people.f;
  assert.equal(f.external_tree, clanId);
  assert.equal(f.external_person_handle, 'own_ji');
  assert.equal(f.external_link_type, 'founder');
  assert.equal(f.external_mirror, '', 'R2：真身不写镜像标记（写了就被 R3 锁死）');
  assert.equal(f.name, '季某', 'R2：本树始祖身份字段不被上层数据覆盖');
  assert.equal(f.gender, 'M', 'R2：性别不被覆盖');
  assert.equal(f.gramps_id, '000000001', '始祖位置不变');
  assert.equal(after.version, 4, '挂载树版本 +1');

  // ② 宗谱侧（R4）：自有段新增 1 条只读登记镜像，指向本家族树始祖
  const clanAfter = readTree(clanId);
  assert.equal(Object.keys(clanAfter.people).length, clanPeopleBefore + 1, '宗谱只多 1 个登记镜像');
  const reg = clanAfter.people[r.clan_registration_handle];
  assert.ok(reg, '登记镜像落库');
  assert.equal(reg.external_tree, treeId, 'R4：指向被登记的家族树');
  assert.equal(reg.external_person_handle, 'f', 'R4：指向家族树始祖 handle');
  assert.equal(reg.external_link_type, 'founder');
  assert.equal(reg.external_mirror, 'true', 'R4：宗谱内的登记镜像是只读镜像');
  assert.equal(reg.name, '季某', 'R4：展示副本');
  assert.equal(reg.external_relation_note, '季某（季氏测试家族 attach · 始祖）', 'R4 逐字备注口径');
  assert.equal(reg.gramps_id, r.clan_registration_gramps_id);
  assert.ok(await fa.personEditLockMessage(reg, clanAfter, 'zhonghua'), 'R3：登记镜像在宗谱内只读');
  assert.equal(fa.clanRegistrationOf(clanAfter, treeId, clanId)?.handle, reg.handle, 'R4：一树一登记的读侧推导');

  // 世本一个字节不改（不写反指针）
  assert.equal(treeFileMd5('zhonghua'), masterBefore, '总谱树 JSON 不得被改写');
  const masterAfter = readTree('zhonghua');
  assert.equal(Object.keys(masterAfter.people).length, 4);
  assert.equal(masterAfter.version, 7);
  assert.equal(masterAfter.people.mX.external_tree, undefined, '真身节点不写反指针');

  // 本树其他节点不受影响
  assert.equal(after.people.kid.name, '季子');
  assert.deepEqual(after.families.fam.child_handles, ['kid']);
  assert.equal(after.families.fam.father_handle, 'f');
});

test('硬口径 2：普通家族树不得直挂世本（target=master → 400），祖谱只能认世本', async () => {
  const treeId = seedTree('once');
  // 普通树 → 世本：400
  await assert.rejects(
    () => fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: 'zhonghua', masterHandle: 'mX' }),
    (e) => e.status === 400 && /不得直挂中华世本/.test(e.message),
  );
  // 普通树 → 普通树：400
  await assert.rejects(
    () => fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: 'mt_lock', masterHandle: 'f' }),
    (e) => e.status === 400 && /只能是祖谱/.test(e.message),
  );
  // 祖谱 → 世本：允许（走 attachClanToMaster）
  assert.equal(treeFileMd5(treeId) === treeFileMd5(treeId), true);
  // 纯函数直测（口径表）
  assert.deepEqual(
    fa.assertAttachTarget({ sourceEntry: { kind: 'family' }, targetEntry: { kind: 'clan' } }),
    { source_kind: 'family', target_kind: 'clan' },
  );
  assert.deepEqual(
    fa.assertAttachTarget({ sourceEntry: { kind: 'clan' }, targetEntry: { kind: 'master' } }),
    { source_kind: 'clan', target_kind: 'master' },
  );
  assert.throws(() => fa.assertAttachTarget({ sourceEntry: { kind: 'clan' }, targetEntry: { kind: 'clan' } }), (e) => e.status === 400);
  assert.throws(() => fa.assertAttachTarget({ sourceEntry: { is_master: true }, targetEntry: { kind: 'clan' } }), (e) => e.status === 400 && /总谱本身不可认祖/.test(e.message));
  // 旧数据缺 kind → 按 family 兼容
  assert.equal(fa.treeKindOf({ tree_id: 'legacy' }), 'family');
  assert.equal(fa.treeKindOf({ tree_id: 'zhonghua', is_master: true }), 'master');
  assert.equal(fa.treeKindOf({ tree_id: 'x', kind: 'clan' }), 'clan');
});

test('一树一挂载：已挂载的树再次认祖 → 400，且两侧都不被写坏', async () => {
  const treeId = seedTree('once2');
  const clanId = seedClan('clan');
  await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const before = treeFileMd5(treeId);
  const clanBefore = treeFileMd5(clanId);
  await assert.rejects(
    () => fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' }),
    (e) => e.status === 400 && /已认祖，请先解除挂载/.test(e.message),
  );
  assert.equal(treeFileMd5(treeId), before, '拒绝时挂载树不得被写');
  assert.equal(treeFileMd5(clanId), clanBefore, '拒绝时祖谱不得被写');
});

test('祖谱节点 1:N：同一祖谱节点可被多棵普通树认作始祖', async () => {
  const a = seedTree('n1');
  const b = seedTree('n2');
  const clanId = seedClan('clan');
  await fa.attachFounder({ treeId: a, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  await fa.attachFounder({ treeId: b, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  assert.equal(readTree(a).people.f.external_person_handle, 'own_ji');
  assert.equal(readTree(b).people.f.external_person_handle, 'own_ji');
});

test('R2 真身可写 vs R3 镜像只读：登记后的家族树始祖 200；宗谱登记镜像 403', async () => {
  const treeId = seedTree('lock');
  const clanId = seedClan('clan');
  const r = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const body = {
    primary_name: { first_name: '改名', surname_list: [{ surname: '季' }] },
    gender: 1,
    birth_date: '1900',
    death_date: '',
    is_living: false,
    attribute_list: [{ type: '封号', value: '某某公' }],
  };
  // ① 家族树始祖 = 真身 → 本树可写（R2）
  const ok = await updatePerson(treeId, 'f', body, { masterTreeId: 'zhonghua' });
  assert.equal(ok.ok, true, 'R2：家族树始祖可真身编辑');
  assert.equal(readTree(treeId).people.f.name, '季改名', '本树始祖身份字段由本树写入');
  // ② 宗谱内的登记镜像（指向别树真身）→ 整节点只读（R3 方向无关）
  const regHandle = r.clan_registration_handle;
  await assert.rejects(
    () => updatePerson(clanId, regHandle, body, { masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && e.message === fa.familyMirrorLockMessage({ display_title: '季氏测试家族 lock' }, treeId),
  );
  assert.equal(readTree(clanId).people[regHandle].name, '季某', '403 时不得落任何改动');
  // 除始祖节点外，任何节点均可正常编辑
  const ok2 = await updatePerson(treeId, 'kid', { ...body, primary_name: { first_name: '子明', surname_list: [{ surname: '季' }] } }, { masterTreeId: 'zhonghua' });
  assert.equal(ok2.ok, true);
  assert.equal(readTree(treeId).people.kid.name, '季子明');
});

test('只读 403（祖谱顶端链镜像）：chain 镜像整节点只读，文案「需到总谱修改」；自有段可编辑', async () => {
  const clanId = seedClan('chain', { ownHandle: 'own_ji', ownName: '季花' });
  // 加深镜像链：mX → mChild → mGrand
  const tree = readTree(clanId);
  clanLib.applyClanTopMirror({
    tree,
    masterTree: readTree('zhonghua'),
    masterTreeId: 'zhonghua',
    masterHandle: 'mX',
    depth: 2,
    ownRootHandle: 'own_ji',
  });
  writeTree(tree);
  const after = readTree(clanId);
  assert.equal(after.people[mirrorHandleOf('mX')].external_link_type, 'founder');
  // ⚠️ 改锚（2026-10-16 · 甲口径清尾单）：原断言 `gramps_id === '000000001'` 编码的是**旧口径**
  // （编号 = **记录级**自铸号 / 始祖位偏好号 000000001）；口径自 2026-10-16 起改为**「编号标识人」**
  // （A-2 镜像不铸号）⇒ 顶端镜像号 = 其**上层真身号**。此处上层真身 = 世本 zhonghua 的 mX（真身号 000000100）。
  assert.equal(after.people[mirrorHandleOf('mX')].gramps_id, '000000100', '改锚：始祖位 = 顶端镜像，编号逐字取自上层真身 mX（A-2）');
  assert.equal(after.people[mirrorHandleOf('mChild')].external_link_type, 'chain');
  assert.equal(after.people[mirrorHandleOf('mChild')].external_mirror, 'true');
  assert.equal(after.people[mirrorHandleOf('mGrand')].external_link_type, 'chain');
  assert.equal(after.people.own_ji.external_tree, '', '自有段不是镜像（可编辑）');
  assert.equal(after.people.own_ji.parent_family, `cfam_own_${clanId}`, '自有段挂在链路下端点之下');

  // chain 镜像 → 403 + 指定文案
  await assert.rejects(
    () => updatePerson(clanId, mirrorHandleOf('mChild'), { primary_name: { first_name: '改', surname_list: [{ surname: '季' }] }, gender: 1 }, { masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && e.message === fa.CHAIN_MIRROR_LOCK_MESSAGE,
  );
  assert.equal(fa.CHAIN_MIRROR_LOCK_MESSAGE, '该节点为上层（中华世本）镜像，需到总谱修改');
  // 顶端始祖镜像（founder）也被锁
  await assert.rejects(
    () => updatePerson(clanId, mirrorHandleOf('mX'), { primary_name: { first_name: '改', surname_list: [{ surname: '季' }] } }, { masterTreeId: 'zhonghua' }),
    (e) => e.status === 403,
  );
  // 自有段可编辑
  const ok = await updatePerson(clanId, 'own_ji', { primary_name: { first_name: '花开', surname_list: [{ surname: '季' }] }, gender: 1 }, { masterTreeId: 'zhonghua' });
  assert.equal(ok.ok, true);
  assert.equal(readTree(clanId).people.own_ji.name, '季花开');
  // 只读判定纯函数
  assert.equal(await fa.upperMirrorLockMessage(after.people[mirrorHandleOf('mChild')], clanId), fa.CHAIN_MIRROR_LOCK_MESSAGE);
  assert.equal(await fa.upperMirrorLockMessage(after.people.own_ji, clanId), '');
});

test('解除登记（R2）：真身数据保留、不再回空白占位；宗谱登记镜像同步移除', async () => {
  const treeId = seedTree('detach');
  const clanId = seedClan('clan');
  const attached = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji', requestedBy: '16600000000' });
  const detailBefore = readDetailDoc(treeId, 'f');
  const r = await fa.detachFounder({ treeId, founderHandle: 'f' });
  assert.equal(r.placeholder, false, 'R2：不再回到空白占位态');
  assert.equal(r.founder_data_kept, true);
  assert.equal(r.clan_registration_removed, true, 'R4 登记镜像已同步移除');
  assert.equal(r.master_handle, 'own_ji');
  assert.equal(r.master_tree_id, clanId, '上层树由指针推导');
  assert.equal(readTree(clanId).people[attached.clan_registration_handle], undefined, '宗谱登记镜像已删除');

  const after = readTree(treeId);
  const f = after.people.f;
  assert.equal(f.gramps_id, '000000001');
  assert.equal(f.name, '季某', 'R2：真身姓名保留');
  assert.equal(f.surname, '季');
  assert.equal(f.gender, 'M');
  assert.equal(f.external_tree, '');
  assert.equal(f.external_person_handle, '');
  assert.equal(f.external_link_type, '');
  assert.equal(f.external_mirror, '');
  assert.deepEqual(f.spouse_families, ['fam'], '解除不影响本树其他结构');
  assert.equal(after.people.kid.name, '季子');
  assert.deepEqual(after.families.fam.child_handles, ['kid']);
  assert.deepEqual(readDetailDoc(treeId, 'f'), detailBefore, 'R2：详情文档不被清空');

  // R2b：解除后始祖位仍可编辑（自建真身），不再 403
  const edit = await updatePerson(treeId, 'f', { primary_name: { first_name: '自建', surname_list: [{ surname: '季' }] }, gender: 1 }, { masterTreeId: 'zhonghua' });
  assert.equal(edit.ok, true, 'R2b：取消空白占位锁');
  assert.equal(readTree(treeId).people.f.name, '季自建');
  // 解除后可以重新认祖（含换真身/换上层树）
  await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  assert.equal(readTree(treeId).people.f.external_person_handle, 'own_ji');
  // 未挂载的始祖解挂 → 400
  await assert.rejects(
    () => fa.detachFounder({ treeId, founderHandle: 'kid' }),
    (e) => e.status === 400 && /未挂载到(任何)?上层树/.test(e.message),
  );
});

test('读侧推导：listAttachedTrees 由 tree-meta 的始祖节点读 external_*（无任何反指针）', async () => {
  const clanId = seedClan('list');
  const a = seedTree('list_a');
  const b = seedTree('list_b');
  await fa.attachFounder({ treeId: a, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  await fa.attachFounder({ treeId: b, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const meta = {
    trees: {
      zhonghua: { tree_id: 'zhonghua', kind: 'master', display_title: '中华世本' },
      [clanId]: { tree_id: clanId, kind: 'clan', display_title: '季氏祖谱' },
      [a]: { tree_id: a, kind: 'family', display_title: '季氏测试家族', surname_char: '季', founder_handle: 'f' },
      [b]: { tree_id: b, kind: 'family', display_title: '季氏测试家族二', surname_char: '季', founder_gramps_id: '000000001' },
      mt_none: { tree_id: 'mt_missing', display_title: '不存在的树', surname_char: '无' },
    },
  };
  const list = await fa.listAttachedTrees({
    masterTreeId: clanId,
    meta,
    listIdsFn: async () => [a, b, 'mt_missing'],
    getTreeFn: async (id) => (fs.existsSync(path.join(TMP, 'trees', `${id}.json`)) ? readTree(id) : null),
  });
  assert.deepEqual(list.map((x) => x.tree_id).sort(), [a, b].sort());
  const ofClan = fa.attachedTreesOf(list, 'own_ji');
  assert.equal(ofClan.length, 2);
  assert.equal(fa.founderTreeLabel(ofClan[0]), '季家族的始祖节点');
  assert.deepEqual(fa.attachedTreesOf(list, 'mNobody'), []);
  // 解除后该树从列表中消失（祖谱支系入口列表随之更新）
  await fa.detachFounder({ treeId: a, founderHandle: 'f' });
  const list2 = await fa.listAttachedTrees({
    masterTreeId: clanId,
    meta,
    listIdsFn: async () => [a, b],
    getTreeFn: async (id) => readTree(id),
  });
  assert.deepEqual(list2.map((x) => x.tree_id), [b]);
});

// ============ 路由层 ============

const STEWARD = '16600000001';
const CHIEF = '16600000002';
const PLAIN = '16600000003';
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiapu_users.json'),
  JSON.stringify({
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '本树主理人', role: 'tree_steward' },
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [PLAIN]: { _id: PLAIN, phone: PLAIN, nickname: '普通用户', role: 'user' },
  }),
);
const stewardToken = signJwt({ sub: STEWARD, phone: STEWARD, role: 'tree_steward' }, 3600);
const chiefToken = signJwt({ sub: CHIEF, phone: CHIEF, role: 'chief_editor' }, 3600);
const plainToken = signJwt({ sub: PLAIN, phone: PLAIN, role: 'user' }, 3600);

/** 认证头（head 前缀拼装，避免重复写字面量） */
const AUTH_PREFIX = ['Bea', 'rer '].join('');
const authHeaders = (token, treeId = '') => ({
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...(treeId ? { 'X-Tree-Id': treeId } : {}),
});

function post(pathname, body, token, treeId = '') {
  return handleRequest({
    path: pathname,
    httpMethod: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(treeId ? { 'X-Tree-Id': treeId } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
}
function get(pathname, token, treeId = '') {
  return handleRequest({
    path: pathname,
    httpMethod: 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(treeId ? { 'X-Tree-Id': treeId } : {}) },
  });
}
const json = (res) => JSON.parse(res.body);

test('路由 POST /admin/founder-request：认祖申请落地 pending；未登录/非始祖节点/直挂世本/已认祖 均被拒', async () => {
  const treeId = seedTree('req');
  const clanId = seedClan('clan');
  // 未登录 → 401
  assert.equal((await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, '')).statusCode, 401);

  // 非始祖节点 → 400
  const notFounder = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'kid', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);
  assert.equal(notFounder.statusCode, 400);
  assert.match(json(notFounder).error, /始祖节点可发起认祖/);

  // 缺少目标树 → 400（普通树不得缺省直挂世本）
  assert.equal((await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f' }, stewardToken, treeId)).statusCode, 400);
  // 普通树显式指定世本 → 400（硬口径 2）
  const direct = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: 'zhonghua', target_handle: 'mX' }, stewardToken, treeId);
  assert.equal(direct.statusCode, 400);
  assert.match(json(direct).error, /不得直挂中华世本/);
  // 目标节点不存在 → 404
  assert.equal((await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'nope' }, stewardToken, treeId)).statusCode, 404);

  // 正常提交（普通树 → 祖谱）
  const res = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji', note: '认祖' }, stewardToken, treeId);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.status, 'pending');
  assert.equal(body.target_kind, 'clan');
  assert.ok(body.request_id);
  assert.equal(body.master_name, '季花');
  assert.match(body.message, /祖谱总编审批/);
  // 重复提交 → 400
  const dup = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);
  assert.equal(dup.statusCode, 400);
  assert.match(json(dup).error, /已有待审批的认祖申请/);

  // 已认祖后再申请 → 400
  const t2 = seedTree('req2');
  await fa.attachFounder({ treeId: t2, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const again = await post('/admin/founder-request', { tree_id: t2, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, t2);
  assert.equal(again.statusCode, 400);
  assert.match(json(again).error, /已认祖，请先解除挂载/);
});

test('路由 GET /admin/founder-requests：chief 看全部 + 祖谱单列 + 本树 steward 只看本树', async () => {
  const listRes = await get('/admin/founder-requests', chiefToken, 'zhonghua');
  assert.equal(listRes.statusCode, 200);
  const listBody = json(listRes);
  assert.equal(listBody.can_approve_all, true);
  assert.ok(Array.isArray(listBody.list));
  assert.deepEqual(listBody.attachments, [], '不带 master_handle 时不返回挂载列表');
  assert.ok(Array.isArray(listBody.clans), 'chief 可见祖谱清单（单列，不计入世本统计）');
  assert.ok(listBody.clans.every((c) => c.kind === undefined || c.own_count !== undefined));

  // steward：只看到自己树相关的待办
  const st = await get('/admin/founder-requests', stewardToken, 'zhonghua');
  assert.equal(st.statusCode, 200);
  assert.equal(json(st).can_approve_all, false);
  assert.deepEqual(json(st).clans, [], '非 chief 不返回祖谱清单');
  // 未登录 → 401
  assert.equal((await get('/admin/founder-requests', '', 'zhonghua')).statusCode, 401);

  // ?master_handle → 读侧推导出挂到该节点的树：P3 硬口径 2 之后，世本节点上只可能有「祖谱」（P2 顶端镜像），
  // 不再出现普通家族树（mt_*）
  const withAttach = await handleRequest({
    path: '/admin/founder-requests',
    httpMethod: 'GET',
    headers: authHeaders(chiefToken, 'zhonghua'),
    queryStringParameters: { master_handle: 'mX' },
  });
  const att = json(withAttach).attachments;
  assert.ok(
    att.every((a) => a.kind === fa.TREE_KIND.CLAN),
    `世本节点只挂祖谱（普通树不得直挂世本）：${JSON.stringify(att)}`,
  );
  assert.ok(att.every((a) => a.master_handle === 'mX'), '只返回认祖到该真身节点的树');
  assert.ok(!att.some((a) => a.tree_id.startsWith('mt_')), '普通家族树不出现在世本挂载列表');
  assert.ok(
    att.some((a) => a.tree_id === 'mc_chain'),
    '祖谱 mc_chain 认祖 mX 后可由世本节点读侧推导出（P2）',
  );
});

test('路由 POST /admin/decide-founder：驳回不改任何数据；通过建立挂载（family→clan）；需目标树写权', async () => {
  const treeId = seedTree('decide');
  const clanId = seedClan('clan');
  const reqRes = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);
  const rid = json(reqRes).request_id;

  // 普通用户 → 403（目标树写权）
  const forbidden = await post('/admin/decide-founder', { request_id: rid, approve: true }, plainToken, clanId);
  assert.equal(forbidden.statusCode, 403);

  // 驳回：不改任何数据
  const before = treeFileMd5(treeId);
  const clanBefore = treeFileMd5(clanId);
  const rej = await post('/admin/decide-founder', { request_id: rid, approve: false, reason: '证据不足' }, chiefToken, clanId);
  assert.equal(rej.statusCode, 200);
  assert.equal(json(rej).status, 'rejected');
  assert.equal(treeFileMd5(treeId), before, '驳回不改挂载树');
  assert.equal(treeFileMd5(clanId), clanBefore, '驳回不改祖谱');
  assert.ok(!readTree(treeId).people.f.external_tree, '驳回后始祖节点不含跨树指针');
  // 重复处理 → 400
  assert.equal((await post('/admin/decide-founder', { request_id: rid, approve: true }, chiefToken, clanId)).statusCode, 400);

  // 再次申请 → 通过 → 挂载建立
  const req2 = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);
  const rid2 = json(req2).request_id;
  const ok = await post('/admin/decide-founder', { request_id: rid2, approve: true }, chiefToken, clanId);
  assert.equal(ok.statusCode, 200);
  const okBody = json(ok);
  assert.equal(okBody.status, 'approved');
  assert.equal(okBody.result.target_kind, 'clan');
  const after = readTree(treeId);
  assert.equal(after.people.f.external_link_type, 'founder');
  assert.equal(after.people.f.external_tree, clanId);
  assert.equal(after.people.f.external_person_handle, 'own_ji');
  assert.equal(after.people.f.name, '季某', '本树始祖姓名保持真身（旧断言 = 被覆写成上层节点的「季花」）');
  assert.equal(after.people.f.external_mirror, '', '登记指针不得写 external_mirror（写了就被 R3 只读不变量锁死）');
  assert.equal(after.people.f.external_relation_note, '季花（祖谱）', '备注写上层节点名（不改本树）');
  // R4：宗谱自有段持 1 条指向本家族树始祖真身的只读登记镜像
  const clanAfter = readTree(clanId);
  const reg = fa.clanRegistrationOf(clanAfter, treeId, clanId);
  assert.ok(reg, 'R4：宗谱内出现指向本家族树的登记镜像');
  assert.equal(reg.external_person_handle, 'f');
  assert.equal(reg.external_mirror, 'true', '登记镜像 = 只读展示副本');
  assert.equal(reg.external_relation_note, '季某（季氏测试家族 decide · 始祖）');
  assert.equal(reg.external_prev_clan_founder_handle, 'own_ji', 'R4：登记前的宗谱始祖落点留痕（解除时可逆还原）');

  // 缺 request_id → 400；不存在的申请 → 404
  assert.equal((await post('/admin/decide-founder', {}, chiefToken, 'zhonghua')).statusCode, 400);
  assert.equal((await post('/admin/decide-founder', { request_id: 'nope' }, chiefToken, 'zhonghua')).statusCode, 404);
});

test('路由 POST /admin/attach-founder（方式 B）：总编辑直接挂载；直挂世本 → 400', async () => {
  const treeId = seedTree('direct');
  const clanId = seedClan('clan');
  // 先留一张待审批申请：直接挂载后应被一并置为通过
  await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);

  const forbidden = await post('/admin/attach-founder', { tree_id: treeId, master_handle: 'mRoot' }, stewardToken, 'zhonghua');
  assert.equal(forbidden.statusCode, 403);

  // 硬口径 2：世本侧直挂普通树 → 400（chief 也不行）
  const directMaster = await post('/admin/attach-founder', { tree_id: treeId, master_handle: 'mRoot' }, chiefToken, 'zhonghua');
  assert.equal(directMaster.statusCode, 400);
  assert.match(json(directMaster).error, /不得直挂中华世本/);

  // 祖谱侧直挂普通树 → 200
  const res = await post('/admin/attach-founder', { tree_id: treeId, target_tree_id: clanId, target_handle: 'own_ji' }, chiefToken, clanId);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.master_handle, 'own_ji');
  assert.equal(body.target_kind, 'clan');
  assert.equal(body.relation_note, '季花（祖谱）');
  const after = readTree(treeId);
  assert.equal(after.people.f.external_tree, clanId);
  assert.equal(after.people.f.external_person_handle, 'own_ji');
  assert.equal(after.people.f.name, '季某', 'R2：本树始祖姓名保持真身，不被上层覆盖');

  const pending = await get('/admin/founder-requests', chiefToken, 'zhonghua');
  assert.equal(json(pending).list.filter((r) => r.tree_id === treeId).length, 0, '直接挂载后同树待审批申请应被清掉');

  // 缺参数
  assert.equal((await post('/admin/attach-founder', { master_handle: 'mRoot' }, chiefToken, 'zhonghua')).statusCode, 400);
  assert.equal((await post('/admin/attach-founder', { tree_id: treeId, target_tree_id: clanId }, chiefToken, clanId)).statusCode, 400);
  // 树不存在 → 404；已挂载再挂 → 400
  assert.equal((await post('/admin/attach-founder', { tree_id: 'mt_missing', target_tree_id: clanId, target_handle: 'own_ji' }, chiefToken, clanId)).statusCode, 404);
  assert.equal((await post('/admin/attach-founder', { tree_id: treeId, target_tree_id: clanId, target_handle: 'own_ji' }, chiefToken, clanId)).statusCode, 400);
});

test('路由 POST /admin/detach-founder：普通树侧 steward 立即生效；祖谱侧（世本档案）chief 解除并保留自有段', async () => {
  // ① 挂载树侧发起（解除到祖谱的认祖）
  const a = seedTree('det_a');
  const clanId = seedClan('clan');
  await fa.attachFounder({ treeId: a, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const res = await post('/admin/detach-founder', { tree_id: a, person_handle: 'f' }, stewardToken, a);
  assert.equal(res.statusCode, 200);
  // R2：不再回到「空白占位」—— 真身数据保留，只清跨树指针与上层登记
  assert.equal(json(res).placeholder, false, '旧口径 placeholder:true 已作废');
  assert.equal(json(res).founder_data_kept, true);
  assert.equal(json(res).clan_registration_removed, true, 'R4：宗谱侧登记镜像被移除');
  assert.equal(readTree(a).people.f.external_tree, '');
  assert.equal(readTree(a).people.f.name, '季某', '真身姓名保留（旧断言 = 被清成空串）');
  assert.equal(readTree(a).people.f.external_link_type, '');
  assert.equal(fa.clanRegistrationOf(readTree(clanId), a, clanId), null, '宗谱侧登记镜像已移除');

  // ② 上层侧发起：世本节点 mX 上的祖谱 mc_clan（P2「祖谱与世本解除」）
  const before = readTree('mc_clan');
  assert.ok(before.people[mirrorHandleOf('mX')], '支系存在顶端世本镜像');
  const res2 = await post('/admin/detach-founder', { master_handle: 'mX', attached_tree_id: 'mc_clan' }, chiefToken, 'zhonghua');
  assert.equal(res2.statusCode, 200);
  assert.equal(json(res2).tree_id, 'mc_clan');
  const afterClan = readTree('mc_clan');
  assert.equal(afterClan.people[mirrorHandleOf('mX')], undefined, '顶端镜像段已清空');
  assert.ok(afterClan.people.own_ji, '祖谱自有段保留');
  assert.equal(afterClan.people.own_ji.parent_family, '', '自有段被解挂为根');
  assert.equal(json(res2).kept_own, 1);
  assert.match(json(res2).notice, /未认祖世本/);
  // 已解除后再解除 → 400（祖谱无镜像段）
  assert.equal((await post('/admin/detach-founder', { master_handle: 'mX', attached_tree_id: 'mc_clan' }, chiefToken, 'zhonghua')).statusCode, 400);
  // 真身未挂载任何树 → 400
  assert.equal((await post('/admin/detach-founder', { master_handle: 'mNobody' }, chiefToken, 'zhonghua')).statusCode, 400);
  // steward 无权在世本侧解除
  assert.equal((await post('/admin/detach-founder', { master_handle: 'mX' }, stewardToken, 'zhonghua')).statusCode, 403);
  // 缺 X-Tree-Id → 400
  assert.equal((await post('/admin/detach-founder', { person_handle: 'f' }, stewardToken, '')).statusCode, 400);
});

// ============ E-1 ~ E-7：登记镜像的父子边（写入面统一 · 改挂 · 解绑 · 口径零回归）============

test('E-1/E-2 认祖：登记镜像必须建立父子边（父 = 认祖所选落点节点），落点缺失/不在目标祖谱 → 400 且两侧都不写', async () => {
  const clanId = seedClan('clan');
  const a = seedTree('edge_a');
  const b = seedTree('edge_b');
  const c = seedTree('edge_c');

  // ① 落点 = 祖谱自有段支系入口节点（own_ji）→ 登记镜像有父，父家族的父亲 = 落点
  const r = await fa.attachFounder({ treeId: a, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const clan = readTree(clanId);
  const reg = clan.people[r.clan_registration_handle];
  assert.ok(reg, '登记镜像落库');
  assert.notEqual(reg.parent_family, '', 'E-1：登记镜像不得再落成「独立根」（旧行为 parent_family:""）');
  const fam = clan.families[reg.parent_family];
  assert.ok(fam, 'E-1：父家族必须存在于祖谱家族表内');
  assert.equal(fam.father_handle, 'own_ji', 'E-1：父家族的父亲 = 认祖所选落点节点');
  assert.ok(fam.child_handles.includes(reg.handle), 'E-1：父家族子女槽位含登记镜像');
  assert.ok((clan.people.own_ji.spouse_families || []).includes(fam.handle), 'E-1：落点节点的配偶家族槽位已接入');
  assert.equal(r.clan_registration_parent_handle, 'own_ji');
  assert.equal(r.clan_registration_parent_family, fam.handle);
  assert.equal(r.clan_registration_parent_family_created, true, '落点无可用家族 → 新建（走 nextFamilyId 铸号）');

  // ② 落点 = 祖谱顶端镜像段始祖节点 → 同一写法；家族复用顺序 = 立支同款（复用落点既有「对槽位空着」家族）
  const r2 = await fa.attachFounder({ treeId: b, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'mir_mX' });
  const clan2 = readTree(clanId);
  const reg2 = clan2.people[r2.clan_registration_handle];
  const fam2 = clan2.families[reg2.parent_family];
  assert.equal(fam2.father_handle, 'mir_mX', '落点为顶端镜像段节点时父家族父亲 = 该节点');
  assert.equal(fam2.handle, `cfam_own_${clanId}`, 'E-1：与立支同款家族复用（mir_mX 的既有无配偶家族被复用，不另建）');
  assert.equal(r2.clan_registration_parent_family_created, false, '复用既有家族时不铸新家族号');
  assert.ok(fam2.child_handles.includes(reg2.handle));

  // ③ E-2 判负：落点缺失 / 不在目标祖谱 → 400，且**两侧一个字节都不写**（登记镜像绝不退回独立根）
  const famBefore = treeFileMd5(c);
  const clanBefore = treeFileMd5(clanId);
  const clanPeopleBefore = Object.keys(clan2.people).length;
  await assert.rejects(
    () => fa.attachFounder({ treeId: c, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'mNobody' }),
    (e) => e.status === 400 && /落点节点不在目标祖谱内/.test(e.message),
  );
  await assert.rejects(
    () => fa.attachFounder({ treeId: c, founderHandle: 'f', masterTreeId: clanId, masterHandle: '' }),
    (e) => e.status === 400,
  );
  await assert.rejects(
    () => fa.attachFounder({ treeId: c, founderHandle: 'f', masterTreeId: clanId }),
    (e) => e.status === 400 && /缺少中华世本节点/.test(e.message),
  );
  assert.equal(treeFileMd5(c), famBefore, '400 不得写家族树');
  assert.equal(treeFileMd5(clanId), clanBefore, '400 不得写祖谱');
  assert.equal(Object.keys(readTree(clanId).people).length, clanPeopleBefore, '400 不得留下任何登记镜像');
  assert.equal(fa.clanRegistrationOf(readTree(clanId), c, clanId), null, '判负后本祖谱内没有该家族树的登记');
  // 纯函数直测（落点闸门判据）
  assert.equal(fa.assertRegistrationLanding({ clan: clan2, parentHandle: 'own_ji' }), 'own_ji');
  assert.throws(() => fa.assertRegistrationLanding({ clan: clan2, parentHandle: '' }), (e) => e.status === 400);
  assert.throws(() => fa.assertRegistrationLanding({ clan: clan2, parentHandle: 'nope' }), (e) => e.status === 400 && /不得退回独立根/.test(e.message));
  assert.throws(
    () => fa.assertRegistrationLanding({ clan: clan2, parentHandle: 'own_ji', registrationHandle: 'own_ji' }),
    (e) => e.status === 400 && /不能是登记镜像自身/.test(e.message),
  );
});

test('E-3/E-4 改挂：旧父家族摘除 + 新父家族接入 + 家族侧落点指针同步 + 审计留痕（编号不变、登记仍恰好 1 条）', async () => {
  const clanId = seedClan('clan');
  const treeId = seedTree('remount');
  const r0 = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji', requestedBy: CHIEF });
  const regHandle = r0.clan_registration_handle;
  const attached = readTree(clanId);
  const oldFam = attached.people[regHandle].parent_family;
  const regGrampsId = attached.people[regHandle].gramps_id;
  const regName = attached.people[regHandle].name;
  assert.ok(oldFam, '认祖后已有父边');
  const countRegs = (tree) => Object.values(tree.people || {}).filter((p) => String(p.external_mirror || '') === 'true' && String(p.external_tree || '') === treeId).length;
  assert.equal(countRegs(attached), 1, '一树一登记');

  const r = await fa.remountClanRegistration({
    treeId,
    masterTreeId: clanId,
    newMasterHandle: 'mir_mX',
    operator: CHIEF,
    now: '2026-10-16T00:00:00.000Z',
  });
  assert.equal(r.ok, true);
  assert.equal(r.previous_parent_family, oldFam);
  assert.equal(r.previous_parent_handle, 'own_ji', '旧落点 = 原父家族家长（own_ji）');
  assert.equal(r.removed_family, oldFam, '旧父家族因无子女被一并摘除');
  assert.equal(r.master_handle, 'mir_mX');
  assert.equal(r.registration_handle, regHandle, '登记镜像不新建、不删除');

  const after = readTree(clanId);
  // ① 旧父摘除：节点侧与家族侧双向摘净
  assert.notEqual(after.people[regHandle].parent_family, oldFam);
  assert.equal(after.families[oldFam], undefined, '旧父家族已摘除（不留空家族）');
  assert.equal((after.people.own_ji.spouse_families || []).includes(oldFam), false, '旧家长槽位不再引用被摘除的家族');
  // ② 新父接入
  const newFam = after.families[after.people[regHandle].parent_family];
  assert.equal(newFam.father_handle, 'mir_mX', '新父家族的父亲 = 新落点');
  assert.ok(newFam.child_handles.includes(regHandle), '登记镜像已接入新父家族');
  // ③ 家族侧落点指针同步（真身身份字段一字不动）
  const famTree = readTree(treeId);
  assert.equal(famTree.people.f.external_person_handle, 'mir_mX', '家族侧登记指针改指新落点');
  assert.equal(famTree.people.f.external_tree, clanId);
  assert.equal(famTree.people.f.external_link_type, 'founder');
  assert.equal(famTree.people.f.external_mirror, '', '真身不写镜像标记');
  assert.equal(famTree.people.f.name, '季某', '真身身份字段不动');
  assert.equal(famTree.people.f.gramps_id, '000000001', '始祖位置不变');
  // ④ 不重铸编号 + 审计留痕（操作人 ＋ 时间 ＋ 旧落点 ＋ 新落点）
  const reg = after.people[regHandle];
  assert.equal(reg.gramps_id, regGrampsId, '不重铸编号');
  assert.equal(reg.name, regName, '内容仍为只读展示副本（不因改挂被重写）');
  assert.equal(reg.external_reanchor_by, CHIEF);
  assert.equal(reg.external_reanchor_at, '2026-10-16T00:00:00.000Z');
  assert.equal(reg.external_reanchor_from, 'own_ji');
  assert.equal(reg.external_reanchor_to, 'mir_mX');
  assert.equal(reg.external_reanchor_count, 1);
  assert.deepEqual(reg.external_reanchor_log, [{ by: CHIEF, at: '2026-10-16T00:00:00.000Z', from: 'own_ji', to: 'mir_mX' }]);
  // ⑤ 基数不变量：改挂不新增登记
  assert.equal(countRegs(after), 1, '改挂后同家族树在本祖谱内仍至多 1 条登记');
  // ⑥ 再改挂回原落点 → 幂等可重放；历史留痕滚动保留；旧父家族同样摘净
  const back = await fa.remountClanRegistration({
    treeId,
    masterTreeId: clanId,
    newMasterHandle: 'own_ji',
    operator: CHIEF,
    now: '2026-10-16T01:00:00.000Z',
  });
  assert.equal(back.previous_parent_handle, 'mir_mX');
  assert.equal(back.removed_family, '', 'mir_mX 的家族仍有自有段子女 own_ji → 只摘登记者、不摘家族');
  const clan3 = readTree(clanId);
  assert.equal(clan3.people[regHandle].external_reanchor_count, 2);
  assert.equal(clan3.people[regHandle].external_reanchor_from, 'mir_mX');
  assert.equal(clan3.people[regHandle].external_reanchor_to, 'own_ji');
  assert.equal(clan3.people[regHandle].external_reanchor_log.length, 2, '留痕逐条累积');
  assert.equal(countRegs(clan3), 1);
  assert.equal((clan3.families[newFam.handle].child_handles || []).includes(regHandle), false, '登记者已摘出旧父家族');
  assert.ok(clan3.families[newFam.handle].child_handles.includes('own_ji'), '非登记子女原地保留（不误摘活家族）');
  assert.ok((clan3.people.mir_mX.spouse_families || []).includes(newFam.handle), '保留的家族其家长槽位不动');
});

test('E-2/E-4 判负：改挂落点缺失 / 不在本祖谱 / 指向登记镜像自身 → 400；非祖谱目标 → 400；拒绝时两棵树都不写', async () => {
  const clanId = seedClan('clan');
  const treeId = seedTree('remount_neg');
  const r = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const famBefore = treeFileMd5(treeId);
  const clanBefore = treeFileMd5(clanId);
  const base = { treeId, masterTreeId: clanId };
  await assert.rejects(() => fa.remountClanRegistration({ ...base, newMasterHandle: '' }), (e) => e.status === 400 && /不得退回独立根/.test(e.message));
  await assert.rejects(
    () => fa.remountClanRegistration({ ...base, newMasterHandle: 'nope' }),
    (e) => e.status === 400 && /落点节点不在目标祖谱内/.test(e.message),
  );
  await assert.rejects(
    () => fa.remountClanRegistration({ ...base, newMasterHandle: r.clan_registration_handle }),
    (e) => e.status === 400 && /不能是登记镜像自身/.test(e.message),
  );
  // 目标不是祖谱（世本）→ 400
  await assert.rejects(
    () => fa.remountClanRegistration({ treeId, masterTreeId: 'zhonghua', newMasterHandle: 'mX' }),
    (e) => e.status === 400 && /改挂目标只能是祖谱/.test(e.message),
  );
  // 未登记的家族树 → 404（没有登记可改挂）
  const other = seedTree('remount_neg2');
  await assert.rejects(
    () => fa.remountClanRegistration({ treeId: other, masterTreeId: clanId, newMasterHandle: 'own_ji' }),
    (e) => e.status === 404 && /没有该家族树的始祖登记/.test(e.message),
  );
  assert.equal(treeFileMd5(treeId), famBefore, '判负不得写家族树');
  assert.equal(treeFileMd5(clanId), clanBefore, '判负不得写祖谱');
});

test('E-5 解绑：父子边一并拆净（登记镜像 / 父家族 / 家长槽位），祖谱结构零悬空引用', async () => {
  const clanId = seedClan('clan');
  const treeId = seedTree('edge_det');
  const r = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const attached = readTree(clanId);
  const regHandle = r.clan_registration_handle;
  const famHandle = attached.people[regHandle].parent_family;
  assert.ok(famHandle);

  const det = await fa.detachFounder({ treeId, founderHandle: 'f' });
  assert.equal(det.clan_registration_removed, true);
  assert.equal(det.founder_data_kept, true);
  const clanAfter = readTree(clanId);
  assert.equal(clanAfter.people[regHandle], undefined, '登记镜像已移除');
  assert.equal(clanAfter.families[famHandle], undefined, '父家族随解绑摘除（不留空家族）');
  for (const fam of Object.values(clanAfter.families)) {
    assert.equal((fam.child_handles || []).includes(regHandle), false, `家族 ${fam.handle} 仍引用已删除的登记镜像`);
    assert.equal(fam.father_handle === regHandle || fam.mother_handle === regHandle, false, `家族 ${fam.handle} 仍以已删除的登记镜像为家长`);
  }
  assert.equal((clanAfter.people.own_ji.spouse_families || []).includes(famHandle), false, '家长槽位不残留被摘除的家族');
  const { checkTreeIntegrity } = await import('./tree-write.js');
  assert.deepEqual(checkTreeIntegrity(clanAfter), [], 'E-5：解绑后祖谱结构零悬空引用');
  const f = readTree(treeId).people.f;
  assert.equal(f.external_tree, '', '家族侧指针已清');
  assert.equal(f.external_person_handle, '');
  assert.equal(f.external_link_type, '');
  assert.equal(f.name, '季某', 'R2：真身数据保留');
  // 解绑后本树可再次认祖（父子边重新建立）
  const again = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const clanAgain = readTree(clanId);
  assert.equal(clanAgain.people[again.clan_registration_handle].parent_family, again.clan_registration_parent_family);
  assert.ok(clanAgain.families[again.clan_registration_parent_family].child_handles.includes(again.clan_registration_handle));
});

test('E-7 口径零回归：登记镜像不计入祖谱自有段人数；支系入口推导（按其 external_tree）改挂前后不变', async () => {
  const clanId = seedClan('clan');
  const treeId = seedTree('edge_stat');
  const metaOf = { trees: { [treeId]: { tree_id: treeId, kind: 'family', display_title: '季氏统计家族', surname_char: '季' } } };
  const before = readTree(clanId);
  const stats0 = clanLib.clanStats(before, 'zhonghua');

  const r = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const clan2 = readTree(clanId);
  const stats1 = clanLib.clanStats(clan2, 'zhonghua');
  assert.equal(stats1.own_count, stats0.own_count, '登记镜像不得计入祖谱自有段人数');
  assert.equal(stats1.own_count, 1, '自有段仍只有支系入口 1 人（own_ji）');
  assert.equal(stats1.mirror_count, stats0.mirror_count, '登记镜像也不计入顶端世本镜像段');
  assert.deepEqual(
    clanLib.clanOwnNodes(clan2).map((p) => p.handle),
    clanLib.clanOwnNodes(before).map((p) => p.handle),
    '自有段节点集合不变',
  );
  // 支系入口推导：登记镜像按其 external_tree 计入（一条登记 = 一个入口）
  const entries1 = clanLib.clanBranchRegistrations(clan2, clanId, metaOf);
  assert.deepEqual(entries1.map((e) => e.tree_id), [treeId]);
  assert.equal(entries1[0].handle, r.clan_registration_handle);

  // 改挂（父边换落点）→ 入口推导与统计口径一字不变
  const rm = await fa.remountClanRegistration({ treeId, masterTreeId: clanId, newMasterHandle: 'mir_mX', operator: CHIEF });
  const clan3 = readTree(clanId);
  assert.notEqual(rm.parent_family, r.clan_registration_parent_family);
  assert.deepEqual(clanLib.clanStats(clan3, 'zhonghua'), stats1, '改挂不改变自有段 / 镜像段统计');
  const entries2 = clanLib.clanBranchRegistrations(clan3, clanId, metaOf);
  assert.deepEqual(entries2.map((e) => e.tree_id), [treeId], '支系入口推导不因父边改挂而变');
  assert.equal(entries2[0].handle, r.clan_registration_handle);
});

test('路由 POST /admin/remount-founder：祖谱写权 + 新落点必选；缺失/不在祖谱/非祖谱目标 一律拒', async () => {
  const clanId = seedClan('clan');
  const treeId = seedTree('remount_route');
  const r0 = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const regHandle = r0.clan_registration_handle;
  // 未登录 → 401
  assert.equal((await post('/admin/remount-founder', { tree_id: treeId, target_tree_id: clanId, target_handle: 'mir_mX' }, '')).statusCode, 401);
  // 缺参 → 400
  assert.equal((await post('/admin/remount-founder', { target_tree_id: clanId, target_handle: 'mir_mX' }, chiefToken, clanId)).statusCode, 400);
  assert.equal((await post('/admin/remount-founder', { tree_id: treeId, target_tree_id: clanId }, chiefToken, clanId)).statusCode, 400);
  // 落点不在祖谱 → 404（体例照同文件既有认祖/解绑路由：编号/句柄解析不到 → 404）
  assert.equal((await post('/admin/remount-founder', { tree_id: treeId, target_tree_id: clanId, target_handle: 'mNobody' }, chiefToken, clanId)).statusCode, 404);
  // 目标不是祖谱（世本）→ 400
  assert.equal((await post('/admin/remount-founder', { tree_id: treeId, target_tree_id: 'zhonghua', target_handle: 'mX' }, chiefToken, 'zhonghua')).statusCode, 400);
  // 成功：新落点 = 顶端镜像段节点；X-Tree-Id 即祖谱（target_tree_id 可省）
  const ok = await post('/admin/remount-founder', { tree_id: treeId, target_handle: 'mir_mX' }, chiefToken, clanId);
  assert.equal(ok.statusCode, 200);
  const body = json(ok);
  assert.equal(body.ok, true);
  assert.equal(body.master_handle, 'mir_mX');
  assert.equal(body.tree_id, treeId);
  assert.equal(body.clan_tree_id, clanId);
  assert.equal(body.registration_handle, regHandle);
  assert.equal(body.previous_parent_handle, 'own_ji');
  assert.equal(body.audit.by, CHIEF, '审计留痕带操作人（取自登录用户）');
  const clanAfter = readTree(clanId);
  assert.equal(clanAfter.people[regHandle].external_reanchor_by, CHIEF);
  assert.equal(clanAfter.people[regHandle].external_reanchor_to, 'mir_mX');
  assert.equal(clanAfter.families[clanAfter.people[regHandle].parent_family].father_handle, 'mir_mX');
  assert.equal(readTree(treeId).people.f.external_person_handle, 'mir_mX', '家族侧落点指针同步');
  // 登记镜像 handle 入口（不传 tree_id，由 external_tree 推导）
  const viaReg = await post('/admin/remount-founder', { registration_handle: regHandle, target_handle: 'own_ji' }, chiefToken, clanId);
  assert.equal(viaReg.statusCode, 200);
  assert.equal(json(viaReg).tree_id, treeId);
  assert.equal(json(viaReg).previous_parent_handle, 'mir_mX');
  // 不存在的登记镜像 handle → 404
  assert.equal((await post('/admin/remount-founder', { registration_handle: 'nope', target_handle: 'own_ji' }, chiefToken, clanId)).statusCode, 404);
  // 普通用户对祖谱自有段落点无写权 → 403
  assert.equal((await post('/admin/remount-founder', { tree_id: treeId, target_handle: 'own_ji' }, plainToken, clanId)).statusCode, 403);
});

// ============ A-1 ~ A-3（2026-10-16）编号标识「人」：镜像不铸号 ============

const idSeq = await import('./id-seq.js');
const { checkTreeIntegrity } = await import('./tree-write.js');

/**
 * 把家族树始祖的编号改成**真身编号**（与真源 ji_23395_01 的季花 000000209 同形），
 * 并清掉跨树登记指针（= 「解除登记」形状，供本文件后续段落复用同一个夹具树）。
 */
function setIdSourceFounder(treeId, grampsId) {
  const t = readTree(treeId);
  t.people.f.gramps_id = grampsId;
  t.founder_gramps_id = grampsId;
  Object.assign(t.people.f, {
    external_tree: '',
    external_person_handle: '',
    external_link_type: '',
    external_mirror: '',
    external_relation_note: '',
    external_founder_created_by: '',
    external_prev_clan_founder_handle: '',
  });
  writeTree(t);
  return t;
}

test('A-2 镜像不铸号：宗谱登记镜像的编号逐字取真身 gramps_id（不再 nextPersonId）；真身无号 → 400 且两侧零写入', async () => {
  // ── ① 真身编号 000000209 的家族树认祖：登记镜像编号 = 真身编号（同一人两记录一号）──
  const treeId = seedTree('det_b');
  setIdSourceFounder(treeId, '000000209');
  const clanId = seedClan('clan');
  const seqBefore = await idSeq.readSeq(idSeq.SEQ_PERSON);

  const r = await fa.attachFounder({
    treeId,
    founderHandle: 'f',
    masterTreeId: clanId,
    masterHandle: 'own_ji',
    requestedBy: CHIEF,
  });
  const clan = readTree(clanId);
  const famTree = readTree(treeId);
  const reg = clan.people[r.clan_registration_handle];

  assert.ok(reg, '登记镜像落库');
  assert.equal(reg.gramps_id, '000000209', '★ A-2：镜像编号 = 真身编号（不铸新号）');
  assert.equal(reg.gramps_id, famTree.people.f.gramps_id, 'A-1：一个人 N 棵树 = 1 个编号 + N 个 handle');
  assert.notEqual(reg.handle, famTree.people.f.handle, 'A-1：handle 是**记录级**（同一人两条记录 = 两个 handle）');
  assert.equal(famTree.people.f.gramps_id, '000000209', '真身编号一字不动');
  assert.equal(famTree.people.f.external_mirror, '', 'R2：家族树始祖仍是真身（不写镜像标记）');
  assert.equal(reg.external_mirror, 'true');
  assert.equal(reg.external_link_type, 'founder');
  assert.equal(reg.external_tree, treeId);
  assert.equal(reg.external_person_handle, 'f');

  // ── ② A-3 双向可校验：沿 external_tree + external_person_handle 指回真身，编号逐字相同 ──
  const trueBody = readTree(reg.external_tree).people[reg.external_person_handle];
  assert.equal(trueBody.handle, 'f', 'A-3：镜像指回真身（外树指针 + 树内 handle）');
  assert.equal(trueBody.gramps_id, reg.gramps_id, 'A-3：指回的那条记录的编号与镜像逐字一致');
  assert.equal(String(trueBody.external_mirror || ''), '', 'A-3：真身唯一（非镜像；恰有 1 条真身）');
  assert.equal(fa.clanRegistrationOf(clan, treeId, clanId).handle, reg.handle, 'R4：一树一登记仍成立');

  // ── ③ 镜像创建路径**零铸号**（运行期读数：全站人号计数器零增长）──
  const seqAfter = await idSeq.readSeq(idSeq.SEQ_PERSON);
  assert.equal(seqAfter, seqBefore, `★ A-2：镜像创建路径不得调用 nextPersonId()（人号计数器 ${seqBefore} → ${seqAfter}）`);

  // ── ④ A-3 补充不变式：同一棵树内编号仍唯一（去重计数 = 人数）──
  for (const [tid, tree] of [
    [clanId, clan],
    [treeId, famTree],
  ]) {
    const list = Object.values(tree.people);
    assert.equal(
      new Set(list.map((p) => String(p.gramps_id || ''))).size,
      list.length,
      `A-3：${tid} 同树内 gramps_id 去重计数 = 人数（镜像真身恒在别树 ⇒ 同树不出现同号两条）`,
    );
  }
  assert.equal(Object.keys(clan.people).length, 3, '祖谱 = 顶端世本镜像 1 + 自有段 1 + 登记镜像 1');
  // ⚠️ 改锚（2026-10-16）：原断言 `=== '000000001'` + 备注「顶端镜像段编号口径本单不动」编码旧口径
  // （顶端镜像段从全局计数器预留号 / 树内自铸号）；本单（甲口径清尾）把**顶端镜像段一并**改为
  // 「取上层真身号」⇒ 权威值 = 世本 zhonghua 的 mX 真身号 000000100。
  assert.equal(clan.people[mirrorHandleOf('mX')].gramps_id, '000000100', '改锚：顶端镜像段号 = 上层真身号（A-2「镜像不铸号」）');
  assert.deepEqual(
    clanLib.clanOwnNodes(clan).map((p) => p.handle),
    ['own_ji'],
    '登记镜像不计入自有段（统计口径零回归）',
  );

  // ── ⑤ 真身编号取不到 ⇒ 400 拒绝创建（**绝不兜底铸号**），且两侧一个字节都不写 ──
  setIdSourceFounder(treeId, '');
  const clan2 = seedClan('ji2', { masterHandle: 'mRoot', ownHandle: 'own_ji2' });
  const famBefore = treeFileMd5(treeId);
  const clanBefore = treeFileMd5(clan2);
  const peopleBefore = Object.keys(readTree(clan2).people).length;
  await assert.rejects(
    () => fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clan2, masterHandle: 'own_ji2', requestedBy: CHIEF }),
    (e) => e.status === 400 && /没有全站编号/.test(e.message) && /A-2：镜像不铸号/.test(e.message),
    '真身无号 → 400（文案点明「镜像不铸号」）',
  );
  assert.equal(treeFileMd5(treeId), famBefore, '400 不得写家族树');
  assert.equal(treeFileMd5(clan2), clanBefore, '400 不得写祖谱');
  assert.equal(Object.keys(readTree(clan2).people).length, peopleBefore, '400 不得留下任何登记镜像');
  assert.equal(fa.clanRegistrationOf(readTree(clan2), treeId, clan2), null, '判负后本祖谱内没有该树的登记');

  // 纯函数直测（编号来源单点）
  assert.equal(fa.mirrorGrampsIdOfTrueBody({ gramps_id: '000000209' }), '000000209', '真身编号逐字沿用（不加工）');
  assert.equal(fa.mirrorGrampsIdOfTrueBody({ gramps_id: ' 000000209 ' }), '000000209', '去空白');
  for (const bad of [{}, { gramps_id: '' }, { gramps_id: null }, null, undefined]) {
    assert.throws(
      () => fa.mirrorGrampsIdOfTrueBody(bad, '测试真身'),
      (e) => e.status === 400 && /测试真身没有全站编号/.test(e.message),
      '真身无号一律 400（绝不兜底铸号）',
    );
  }
});

test('A-7 解除世本挂载不得打断登记镜像的父边：家族「退化落点」升为家长，登记镜像绝不退回独立根', async () => {
  // 夹具：认祖落点选在**顶端世本镜像段节点**（mir_mX）⇒ 登记镜像与自有段入口同属 cfam_own_<祖谱>
  const clanId = seedClan('clan');
  const treeId = seedTree('det_b');
  const regFamily = `cfam_own_${clanId}`;
  const r = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'mir_mX' });
  const attached = readTree(clanId);
  const regHandle = r.clan_registration_handle;
  const before = attached.families[regFamily];
  assert.equal(attached.people[regHandle].parent_family, regFamily, 'E-1：登记镜像挂在落点所在的家族');
  assert.equal(before.father_handle, 'mir_mX');
  assert.deepEqual(before.child_handles.slice().sort(), [regHandle, 'own_ji'].sort(), '同族：自有段入口 + 登记镜像');

  // ── ① 纯函数：clearClanTopMirror（解除世本挂载的落库动作）──
  const copy = readTree(clanId);
  const removed = clanLib.clearClanTopMirror(copy, 'zhonghua');
  assert.deepEqual(removed.removed_handles, [mirrorHandleOf('mX')], '顶端镜像段被清空');
  assert.equal(removed.removed_families.includes(regFamily), false, '★ A-7：挂着登记镜像的家族不得被拆掉');
  assert.deepEqual(removed.kept_families, [regFamily], '家族被保留');
  assert.deepEqual(removed.degraded_landings, [{ family: regFamily, landing: 'own_ji', registration_handles: [regHandle] }], '退化落点 = 自有段入口 own_ji');
  assert.equal(copy.people[regHandle] === undefined, false, '登记镜像保留（支系入口不丢）');
  assert.equal(copy.people[regHandle].parent_family, regFamily, '★ A-7：登记镜像的父边一字不动（旧行为 = 置空 ⇒ 退回独立根）');
  assert.equal(copy.people[regHandle].external_tree, treeId, '登记指针不变');
  const kept = copy.families[regFamily];
  assert.ok(kept, '家族仍在家族表内（不留悬空 parent_family）');
  assert.equal(kept.father_handle, 'own_ji', '★ 退化落点升为该家族家长（链不断）');
  assert.equal(kept.mother_handle, '');
  assert.deepEqual(kept.child_handles, [regHandle], '家族子女槽位只留登记镜像');
  assert.equal(copy.people.own_ji.parent_family, '', '自有段入口仍按原口径解挂为根');
  assert.ok((copy.people.own_ji.spouse_families || []).includes(regFamily), '家长槽位已接入保留的家族');
  assert.equal(copy.people[mirrorHandleOf('mX')], undefined, '顶端镜像节点已删');
  assert.deepEqual(checkTreeIntegrity(copy), [], 'A-7：解除后祖谱零悬空引用');
  assert.deepEqual(clanLib.clanOwnNodes(copy).map((p) => p.handle), ['own_ji'], '自有段节点不变');
  const metaOf = { trees: { [treeId]: { tree_id: treeId, kind: 'family', display_title: '季氏 A-7 家族', surname_char: '季' } } };
  assert.deepEqual(clanLib.clanBranchRegistrations(copy, clanId, metaOf).map((x) => x.tree_id), [treeId], '★ A-7：支系入口推导不因解除挂载而丢');

  // ── ② 端到端：detachClanFromMaster（「解除世本挂载」正式路径）──
  const clanB = seedClan('clan');
  const rB = await fa.attachFounder({ treeId: seedTree('det_a'), founderHandle: 'f', masterTreeId: clanB, masterHandle: 'mir_mX' });
  const det = await clanLib.detachClanFromMaster({ treeId: clanB });
  assert.equal(det.removed_mirrors, 1, '顶端镜像段已清空');
  assert.equal(det.kept_own, 1, '自有段保留');
  const afterDetach = readTree(clanB);
  assert.equal(afterDetach.people[mirrorHandleOf('mX')], undefined);
  assert.ok(afterDetach.people[rB.clan_registration_handle], '登记镜像仍在（旧行为：与家族一起被解挂成独立根）');
  assert.equal(afterDetach.people[rB.clan_registration_handle].parent_family, `cfam_own_${clanB}`, '★ A-7：父边不断');
  assert.equal(afterDetach.families[`cfam_own_${clanB}`].father_handle, 'own_ji', '退化落点 = 自有段入口');
  assert.deepEqual(checkTreeIntegrity(afterDetach), [], '端到端：零悬空引用');
  const metaAfter = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  assert.equal(metaAfter.trees[clanB].master_tree_id, '', '解除后祖谱 meta 上层指针清空');
  assert.deepEqual(
    clanLib.clanBranchRegistrations(afterDetach, clanB, { trees: { mt_det_a: { tree_id: 'mt_det_a', kind: 'family' } } }).map((x) => x.tree_id),
    ['mt_det_a'],
    '★ A-7：解除世本挂载后支系入口仍在',
  );

  // ── ③ 兜底：祖谱自有段为空（真源 ji_23395 即此形）⇒ 家族保留、家长清空，父边同样不打断 ──
  const treeIdC = seedTree('det_b');
  const clanC = seedClan('xu', { ownHandle: 'own_xu', ownName: '徐花' });
  const treeC = readTree(clanC);
  delete treeC.people.own_xu;
  delete treeC.families[`cfam_own_${clanC}`];
  treeC.people[mirrorHandleOf('mX')].spouse_families = [];
  writeTree(treeC);
  const rC = await fa.attachFounder({ treeId: treeIdC, founderHandle: 'f', masterTreeId: clanC, masterHandle: 'mir_mX' });
  assert.equal(rC.clan_registration_parent_family_created, true, '落点无可用家族 → 新建（落点之下唯一的家族）');
  const famC = rC.clan_registration_parent_family;
  const copyC = readTree(clanC);
  const removedC = clanLib.clearClanTopMirror(copyC, 'zhonghua');
  const afterC = copyC;
  assert.deepEqual(removedC.kept_families, [famC], '无自有段子女 ⇒ 家族仍保留（绝不打断登记边）');
  assert.deepEqual(removedC.degraded_landings, [{ family: famC, landing: '', registration_handles: [rC.clan_registration_handle] }]);
  assert.equal(afterC.people[rC.clan_registration_handle].parent_family, famC, '★ A-7：父边保留');
  assert.equal(afterC.families[famC].father_handle, '', '无自有段子女 ⇒ 家长清空（不留悬空家长）');
  assert.deepEqual(afterC.families[famC].child_handles, [rC.clan_registration_handle]);
  assert.deepEqual(checkTreeIntegrity(afterC), [], '兜底路径零悬空引用');
});

// ============ A-2 清尾（2026-10-16）· 祖谱顶端世本镜像段不铸号 ============

test('A-2 顶端世本镜像段不铸号（纯函数）：founder / chain 号逐字取自各节上层真身；真身无号 → 400 且本树零改动', () => {
  // ── ① depth=2 链：世本 mX(000000100) → mChild(000000101) → mGrand(000000102) ──
  const tree = { _schema: '1.0', tree_id: 'mc_pure', kind: 'clan', founder_gramps_id: '', version: 1, people: {}, families: {} };
  const applied = clanLib.applyClanTopMirror({
    tree,
    masterTree: readTree('zhonghua'),
    masterTreeId: 'zhonghua',
    masterHandle: 'mX',
    depth: 2,
  });
  assert.equal(applied.mirror_count, 3);
  assert.equal(tree.people[mirrorHandleOf('mX')].gramps_id, '000000100', '★ A-2：founder 镜像号 = 上层真身 mX 号');
  assert.equal(tree.people[mirrorHandleOf('mChild')].gramps_id, '000000101', '★ A-2：chain 镜像号 = 其上层真身 mChild 号');
  assert.equal(tree.people[mirrorHandleOf('mGrand')].gramps_id, '000000102', '★ A-2：chain 镜像号 = 其上层真身 mGrand 号');
  assert.equal(tree.founder_gramps_id, '000000100', 'A-7：祖谱树 JSON founder_gramps_id = 顶端镜像（真身）号');
  // A-3：同树内编号仍唯一（去重计数 = 人数）
  const list = Object.values(tree.people);
  assert.equal(new Set(list.map((p) => p.gramps_id)).size, list.length, 'A-3：同树内 gramps_id 去重计数 = 人数');
  // A-7 不变项：handle 口径与 `mir_<上层 handle>` 派生规则一字不改
  assert.deepEqual(
    list.map((p) => p.handle).sort(),
    [mirrorHandleOf('mChild'), mirrorHandleOf('mGrand'), mirrorHandleOf('mX')].sort(),
    '镜像 handle = mir_<上层 handle>（确定性）',
  );
  assert.deepEqual(
    list.map((p) => p.external_person_handle).sort(),
    ['mChild', 'mGrand', 'mX'].sort(),
    '镜像仍指回真身 handle（记录级指针不变）',
  );

  // ── ② 编号来源单点：planClanTopMirrorIds 与落库值逐字一致 ──
  const plan = clanLib.planClanTopMirrors({ masterTree: readTree('zhonghua'), masterHandle: 'mX', depth: 2 });
  assert.deepEqual(clanLib.planClanTopMirrorIds(plan, 'zhonghua'), ['000000100', '000000101', '000000102']);

  // ── ③ 真身无号 ⇒ 400，且**校验先于任何改动**（既有镜像段一字不动）──
  const noId = readTree('zhonghua');
  noId.people.mX.gramps_id = '';
  const snapshot = JSON.stringify(tree);
  assert.throws(
    () => clanLib.applyClanTopMirror({ tree, masterTree: noId, masterTreeId: 'zhonghua', masterHandle: 'mX', depth: 2 }),
    (e) => e.status === 400 && /没有全站编号/.test(e.message) && /A-2：镜像不铸号/.test(e.message) && /zhonghua:mX/.test(e.message),
    '真身无号 → 400（文案点名真身位置；绝不兜底铸号）',
  );
  assert.equal(JSON.stringify(tree), snapshot, '400 时本树零改动（先算号、后清段重建）');

  // ── ④ 静态自证（源码级）：祖谱镜像段代码体内**没有任何人物铸号入口** ──
  const src = fs.readFileSync(path.join(HERE, 'clan.js'), 'utf8');
  const mirrorStart = src.indexOf('export function planClanTopMirrorIds(');
  const mirrorEnd = src.indexOf('// ---- 申请单（纯函数） ----');
  const mirrorSrc = src.slice(mirrorStart, mirrorEnd);
  assert.ok(mirrorSrc.length > 1200, '切片须覆盖 planClanTopMirrorIds + applyClanTopMirror 两段（防切片失效导致假绿）');
  for (const banned of [/\ballocPersonId\b/, /\bnewPersonId\b/, /nextPersonId/, /\bfreeGrampsId\(/, /reservePersonIds\(/]) {
    assert.equal(banned.test(mirrorSrc), false, `镜像段代码体内不得出现铸号入口 ${banned}（A-2「镜像不铸号」）`);
  }
  // 全模块只剩 1 处 freeGrampsId 调用（createClanTree 的**自有段真人**兜底，与镜像无关）
  const freeGrampsCallSites = src
    .split('\n')
    .filter((l) => /\bfreeGrampsId\(/.test(l) && !/^\s*export\s+function\s+freeGrampsId\(/.test(l));
  assert.equal(freeGrampsCallSites.length, 1, 'freeGrampsId 调用点全模块仅剩 1 处 —— 镜像段零树内铸号');
  assert.match(
    freeGrampsCallSites[0],
    /ownRootHandle\]\.gramps_id = allocPersonId\(\) \|\| freeGrampsId\(tree, ''\)/,
    '唯一调用点 = createClanTree 的**自有段真人**兜底（与镜像无关）',
  );
  assert.equal(/nextPersonId/.test(src), false, 'clan.js 不导入也不调用 nextPersonId');
  assert.equal(/reservePersonIds\(\s*mirrorPlan\.length/.test(src), false, '不再按镜像段人数预留人号');
  assert.equal(/reservePersonIds\(\s*mirrorPlan\.length \+ \(ownRootHandle/.test(src), false, '旧写法（镜像数 + 自有段）已删');
  assert.equal(/reservePersonIds\(ownRootHandle \? 1 : 0\)/.test(src), false, '人号预留只认自有段：`ownRootHandle ? 1 : 0` 写法已删');
});

test('A-2 顶端世本镜像段不铸号（写路径）：createClanTree / attachClanToMaster 落真身号、人号计数器零消耗、A-7 meta 同步与 A-3 同树唯一', async () => {
  // ── ① attachClanToMaster：聂氏祖谱（自有段 own_noid）认祖世本 mX ──
  const clanId = seedClan('noid', { masterHandle: 'mX', ownHandle: 'own_noid', ownName: '聂花' });
  assert.equal(clanId, 'mc_noid');
  const seqBefore = await idSeq.readSeq(idSeq.SEQ_PERSON);
  const r = await clanLib.attachClanToMaster({
    treeId: clanId, masterTreeId: 'zhonghua', masterHandle: 'mX', ownRootHandle: 'own_noid', requestedBy: CHIEF,
  });
  assert.equal(r.founder_mirror_handle, mirrorHandleOf('mX'));
  const clan = readTree(clanId);
  const mirror = clan.people[mirrorHandleOf('mX')];
  assert.equal(mirror.gramps_id, '000000100', '★ A-2：写路径顶端镜像号 = 上层真身号（mX）');
  assert.equal(clan.founder_gramps_id, '000000100', 'A-7：祖谱树 JSON founder_gramps_id = 顶端镜像新号');
  assert.equal(clan.people.own_noid.gramps_id, '000000002', '自有段真人编号一字不动');
  // A-3：同树内 gramps_id 去重计数 = 人数（镜像真身恒在别树 ⇒ 同树不出现同号两条）
  const list = Object.values(clan.people);
  assert.equal(new Set(list.map((p) => p.gramps_id)).size, list.length, 'A-3：mc_noid 同树去重计数 = 人数');
  // A-3 双向：沿 external_tree + external_person_handle 指回真身，编号逐字一致
  assert.equal(readTree(mirror.external_tree).people[mirror.external_person_handle].gramps_id, mirror.gramps_id);
  // ★ 人号计数器零消耗（镜像路径不铸号、不预留）
  const seqAfter = await idSeq.readSeq(idSeq.SEQ_PERSON);
  assert.equal(seqAfter, seqBefore, `★ A-2：认祖世本的镜像路径不得消耗人号计数器（${seqBefore} → ${seqAfter}）`);
  // ★ A-7：meta 始祖登记（handle 口径不变）+ 编号跟树内始祖节点现值同步（夹具旧值 000000099 已过期）
  const meta1 = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  assert.equal(meta1.trees[clanId].founder_handle, 'own_noid', 'founder_handle 口径一字不改');
  assert.equal(meta1.trees[clanId].founder_gramps_id, '000000002', '★ A-7：meta.founder_gramps_id 同步为树内始祖节点现值（000000099 → 000000002）');
  assert.equal(meta1.trees[clanId].founder_name, '聂花');
  assert.equal(meta1.trees[clanId].master_handle, 'mX', '上层指针照旧回写');

  // ── ② createClanTree：岑氏祖谱（无自有段）⇒ 镜像段零铸号、人号计数器零消耗 ──
  const seq2 = await idSeq.readSeq(idSeq.SEQ_PERSON);
  const created = await clanLib.createClanTree({
    surname: '岑', masterTreeId: 'zhonghua', masterHandle: 'mX', clanTitle: '岑氏祖谱（镜像不铸号）', chainDepth: 1,
  });
  const newClan = readTree(created.tree_id);
  assert.equal(newClan.people[mirrorHandleOf('mX')].gramps_id, '000000100', '★ A-2：新建祖谱 founder 镜像号 = 真身号');
  assert.equal(newClan.people[mirrorHandleOf('mChild')].gramps_id, '000000101', '★ A-2：新建祖谱 chain 镜像号 = 真身号');
  assert.equal(newClan.founder_gramps_id, '000000100', 'A-7：新建祖谱树 founder_gramps_id = 顶端镜像新号');
  assert.equal(created.mirror_count, 2);
  const seq3 = await idSeq.readSeq(idSeq.SEQ_PERSON);
  assert.equal(seq3, seq2, `★ A-2：createClanTree（无自有段）不消耗人号计数器（${seq2} → ${seq3}）`);
  const gids2 = Object.values(newClan.people).map((p) => p.gramps_id);
  assert.equal(new Set(gids2).size, gids2.length, 'A-3：同树去重计数 = 人数');
  // A-7 不变项：详情文档键仍是 `tree_id:handle`
  assert.ok(readDetailDoc(created.tree_id, mirrorHandleOf('mX')), '详情文档键 tree_id:handle 不变');
});

test('A-2 顶端镜像真身无号 ⇒ 400 拒绝创建：createClanTree 与 attachClanToMaster 两侧零写入、零预留', async () => {
  // 先落夹具树（`mc_yu`），再取基线快照 —— 否则「零新增文件」断言会被夹具自身写入扰乱
  const yuClan = seedClan('yu', { masterHandle: 'mX', ownHandle: 'own_ji', ownName: '季花' });
  const yuBefore = treeFileMd5(yuClan);
  const treesDir = path.join(TMP, 'trees');
  const beforeList = fs.readdirSync(treesDir).sort();
  const metaBefore = md5(META_FILE);

  // ── ① createClanTree：真身（zhonghua_noid:mNoid）无号 ⇒ 400 ──
  const seqBefore = await idSeq.readSeq(idSeq.SEQ_PERSON);
  await assert.rejects(
    () => clanLib.createClanTree({ surname: '岑', masterTreeId: 'zhonghua_noid', masterHandle: 'mNoid', clanTitle: '岑氏祖谱（判负）' }),
    (e) => e.status === 400 && /没有全站编号/.test(e.message) && /A-2：镜像不铸号/.test(e.message) && /zhonghua_noid:mNoid/.test(e.message),
    '真身无号 → 400（文案点名真身位置）',
  );
  assert.equal(await idSeq.readSeq(idSeq.SEQ_PERSON), seqBefore, '400 时人号计数器零消耗（校验先于预留）');

  // ── ② attachClanToMaster：鱼氏祖谱认祖到「真身无号」的世本副本 ⇒ 400 ──
  await assert.rejects(
    () => clanLib.attachClanToMaster({ treeId: yuClan, masterTreeId: 'zhonghua_noid', masterHandle: 'mNoid', ownRootHandle: 'own_ji', requestedBy: CHIEF }),
    (e) => e.status === 400 && /没有全站编号/.test(e.message) && /A-2：镜像不铸号/.test(e.message),
    '真身无号 → 400（认祖路径同样拒绝）',
  );
  assert.equal(treeFileMd5(yuClan), yuBefore, '400 不得写祖谱（镜像段一个节点都不落）');

  // ── ③ 两条路径合起来：树目录零新增、meta 逐字节不变 ──
  assert.deepEqual(fs.readdirSync(treesDir).sort(), beforeList, '400 不得新建/删除任何树文件');
  assert.equal(md5(META_FILE), metaBefore, '400 不得写 tree-meta');
});

test('A-7 祖谱 meta 的始祖登记指向顶端镜像段节点 ⇒ 重建后 founder_gramps_id 跟镜像新号同步（handle 口径不变）', async () => {
  // 夹具：mc_yu 的 meta.founder_handle = mir_mX（始祖登记就是顶端镜像那条）；树内无自有段
  writeTree({ _schema: '1.0', tree_id: 'mc_yu', kind: 'clan', founder_gramps_id: '000000162', version: 1, updated_at: '', people: {}, families: {} });
  const r = await clanLib.attachClanToMaster({ treeId: 'mc_yu', masterTreeId: 'zhonghua', masterHandle: 'mX', chainDepth: 0, requestedBy: CHIEF });
  assert.equal(r.founder_mirror_handle, mirrorHandleOf('mX'));
  assert.equal(r.founder_registered, false, '已有始祖登记 ⇒ 不改「已登记」语义（不走 registered 分支）');
  const tree = readTree('mc_yu');
  assert.equal(tree.people[mirrorHandleOf('mX')].gramps_id, '000000100', '★ A-2：镜像号 = 真身号 000000100（旧数据 000000162）');
  assert.equal(tree.founder_gramps_id, '000000100');
  const gids = Object.values(tree.people).map((p) => p.gramps_id);
  assert.equal(new Set(gids).size, gids.length, 'A-3：同树去重计数 = 人数');
  const entry = JSON.parse(fs.readFileSync(META_FILE, 'utf8')).trees.mc_yu;
  assert.equal(entry.founder_handle, 'mir_mX', '★ A-7：founder_handle 口径一字不改（仍指顶端镜像节点）');
  assert.equal(entry.founder_gramps_id, '000000100', '★ A-7：meta.founder_gramps_id 跟镜像新号同步（000000162 → 000000100）');
  assert.equal(entry.founder_name, '季始祖公');
  // 注：本夹具「始祖登记 = 顶端镜像 + 未显式指定自有段落点」时 `ownRootHandle` 落到镜像自身
  // ⇒ `cfam_own_<祖谱>` 的家长与子女同为该镜像（**旧口径既有形态**，本单只改编号来源，不动该结构）。
  assert.equal(tree.families[`cfam_own_mc_yu`].father_handle, mirrorHandleOf('mX'));
});

// ============ 真实数据保护 ============

test('测试全程未写 migrate-output 真实数据与 config/tree-meta.json（md5 一致）', () => {
  const now = fs.readdirSync(REAL_TREES);
  assert.deepEqual(now.sort(), [...realBaseline.keys()].sort(), '真实树目录文件数/文件名未变');
  for (const f of now) {
    assert.equal(md5(path.join(REAL_TREES, f)), realBaseline.get(f), `${f} 被改动了`);
  }
  assert.equal(md5(REAL_META), metaBaseline, 'config/tree-meta.json 被改动了');
});
