/**
 * 添加子女（跨树婚姻家庭子女归属）单元测试 — docs/marriage.spec.md §7-4
 *
 * 纯函数部分：镜像父母判定（mirrorParentOf）。
 * 写路径部分：COMPAT_OUT_DIR 指向 /tmp 副本目录造树（绝不写 migrate-output 真源），
 * 收尾用 md5 校验真实树文件未被改动。
 *
 * ★ 2026-10-15 口径追加（Kevin 当面拍定，优先级高于旧口径；同日主代理收窄 ①：**只认 founder**）：
 *   ① 祖谱的**认祖镜像**（**仅** `external_link_type === 'founder'`，真身在世本）名下的子嗣
 *      **建在本树**（自有段真人节点、`external_*` 为空），**不回写真身树**；
 *   ② 世本里**已作为某祖谱始祖**的节点（meta 存在 kind='clan' 且 master_handle === 该节点 handle）
 *      **不允许加子嗣** → 400 逐字文案；
 *   ③ 普通 / 姻亲镜像（marriage / child / 空）**维持原路由**（防误伤对照）；
 *      **`chain`（世系链镜像）同 ③ —— 不豁免**：照旧落真身树 + 本树留镜像子女（T4 对照用例）。
 *   夹具 = 本文件顶部写入的 meta 副本（`<COMPAT_OUT_DIR>/tree-meta.json`）+ `ancestorMirrorFixture`。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/child-write.test.js
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-child-write-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;

/**
 * meta 副本夹具（2026-10-15 口径）：store 的 meta 读写根 = `<COMPAT_OUT_DIR>/tree-meta.json`
 * （这里显式再写 `COMPAT_META_FILE`，保证同一根）。必须在 `import ./child-write.js`（→ store.js）
 * **之前**落盘：store 的 local 分支按磁盘指纹失效缓存，一旦先读过再改盘就会读到旧快照。
 * 只有本条口径用到的树进夹具 —— 两部祖谱的 `master_handle` 指向世本节点 `zh_founder` / `zh_founder2`
 * ⇒ 口径 ② 命中；`zh_plain` 不是任何祖谱的始祖 ⇒ 照常可加子。
 * 真实 `config/tree-meta.json` 由本文件收尾的 md5 断言守住（真源零写入）。
 */
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;
fs.writeFileSync(
  META_FILE,
  JSON.stringify(
    {
      _schema: '1.1',
      trees: {
        zhonghua: {
          tree_id: 'zhonghua',
          kind: 'master',
          is_master: true,
          display_title: '中华世本 · 全球华人家谱总谱',
        },
        clan_founder: {
          tree_id: 'clan_founder',
          kind: 'clan',
          display_title: '季氏祖谱',
          surname_char: '季',
          master_tree_id: 'zhonghua',
          master_handle: 'zh_founder',
          founder_handle: 'cl_own',
        },
        clan_founder2: {
          tree_id: 'clan_founder2',
          kind: 'clan',
          display_title: '季氏祖谱 · 二房',
          surname_char: '季',
          master_tree_id: 'zhonghua',
          master_handle: 'zh_founder2',
          founder_handle: 'cl2_own',
        },
      },
    },
    null,
    2,
  ),
);

const {
  addChildNode,
  mirrorParentOf,
  MIRROR_CHILD_LINK_TYPE,
  isFounderAncestorMirror,
  clanOfMasterNode,
  clanFounderChildBlockMessage,
  DEFAULT_MASTER_TREE_ID,
} = await import('./child-write.js');

// 真实树文件基线（测试结束必须一模一样）
const realBaseline = new Map(
  fs.readdirSync(REAL_TREES).map((f) => [
    f,
    crypto.createHash('md5').update(fs.readFileSync(path.join(REAL_TREES, f))).digest('hex'),
  ]),
);

function writeTree(tree) {
  const p = path.join(TMP, 'trees', `${tree.tree_id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tree, null, 2));
}
function readTree(treeId) {
  return JSON.parse(fs.readFileSync(path.join(TMP, 'trees', `${treeId}.json`), 'utf8'));
}
function readDetail(treeId, handle) {
  const p = path.join(TMP, 'details', `${treeId}:${handle}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/**
 * 造一对跨树婚姻的真身 + 镜像（形状照 shen_27784_01 / ji_23395_01 实测数据）：
 *   loc 树（沈家）：family_loc = 父 季志全(镜像) / 母 沈伟(真人)
 *   far 树（季家）：family_far = 父 季志全(真人) / 母 沈伟(镜像)
 */
function crossTreePair(tag) {
  const loc = `loc_${tag}`;
  const far = `far_${tag}`;
  const mid = `mid_${tag}`;
  const h = { locSelf: 'p_shen', locMirror: 'p_ji_mirror', farSelf: 'p_ji', farMirror: 'p_shen_mirror' };
  const mirrorOf = (handle, otherTree, otherHandle) => ({
    handle,
    gramps_id: '000500005',
    name: handle === h.locMirror ? '季志全' : '沈伟',
    surname: handle === h.locMirror ? '季' : '沈',
    given: handle === h.locMirror ? '志全' : '伟',
    gender: handle === h.locMirror ? 'M' : 'F',
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: '',
    spouse_families: [],
    external_tree: otherTree,
    external_person_handle: otherHandle,
    external_link_type: 'marriage',
    external_marriage_id: mid,
    external_marriage_no: '1',
    external_mirror: 'true',
  });
  const locTree = {
    tree_id: loc,
    version: 4,
    people: {
      [h.locSelf]: {
        handle: h.locSelf,
        gramps_id: '000000002',
        name: '沈伟',
        surname: '沈',
        given: '伟',
        gender: 'F',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: ['family_loc'],
        external_tree: far,
        external_person_handle: h.farSelf,
        external_link_type: 'marriage',
        external_marriage_id: mid,
      },
      [h.locMirror]: { ...mirrorOf(h.locMirror, far, h.farSelf), spouse_families: ['family_loc'] },
    },
    families: {
      family_loc: {
        handle: 'family_loc',
        gramps_id: 'F000001',
        father_handle: h.locMirror,
        mother_handle: h.locSelf,
        child_handles: [],
      },
    },
  };
  const farTree = {
    tree_id: far,
    version: 7,
    people: {
      [h.farSelf]: {
        handle: h.farSelf,
        gramps_id: '000000001',
        name: '季志全',
        surname: '季',
        given: '志全',
        gender: 'M',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: ['family_far'],
        external_tree: loc,
        external_person_handle: h.locSelf,
        external_link_type: 'marriage',
        external_marriage_id: mid,
      },
      [h.farMirror]: { ...mirrorOf(h.farMirror, loc, h.locSelf), spouse_families: ['family_far'] },
    },
    families: {
      family_far: {
        handle: 'family_far',
        gramps_id: 'F500020',
        father_handle: h.farSelf,
        mother_handle: h.farMirror,
        child_handles: [],
      },
    },
  };
  writeTree(locTree);
  writeTree(farTree);
  return { loc, far, mid, h };
}

/** 普通树（无跨树镜像）：夫 沈克强 / 妻 李氏 */
function plainTree(tag, { withFamily = true } = {}) {
  const id = `plain_${tag}`;
  const tree = {
    tree_id: id,
    version: 2,
    people: {
      dad: {
        handle: 'dad',
        gramps_id: '000000007',
        name: '沈克强',
        surname: '沈',
        given: '克强',
        gender: 'M',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: withFamily ? ['fam_plain'] : [],
      },
      mom: {
        handle: 'mom',
        gramps_id: '000000008',
        name: '李氏',
        surname: '李',
        given: '氏',
        gender: 'F',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: withFamily ? ['fam_plain'] : [],
      },
    },
    families: withFamily
      ? {
          fam_plain: {
            handle: 'fam_plain',
            gramps_id: 'F000003',
            father_handle: 'dad',
            mother_handle: 'mom',
            child_handles: [],
          },
        }
      : {},
  };
  writeTree(tree);
  return id;
}

// ---- 纯函数：镜像父母判定 ----

test('镜像父母判定：父为真人（或父空缺而母为真人）→ 留本树，不路由', () => {
  const people = {
    dad: { handle: 'dad', gender: 'M' },
    mom: { handle: 'mom', gender: 'F' },
    momMirror: { handle: 'momMirror', gender: 'F', external_mirror: 'true', external_tree: 'far' },
  };
  assert.equal(mirrorParentOf({ father_handle: 'dad', mother_handle: 'mom' }, people), null);
  assert.equal(mirrorParentOf({ father_handle: 'dad', mother_handle: 'momMirror' }, people), null);
  assert.equal(mirrorParentOf({ father_handle: '', mother_handle: 'mom' }, people), null);
  assert.equal(mirrorParentOf(null, people), null);
});

test('镜像父母判定：父为镜像 → 回父镜像（招赘同理）；双镜像/无父母 → 拒绝或留本树', () => {
  const people = {
    dadMirror: { handle: 'dadMirror', gender: 'M', external_mirror: 'true', external_tree: 'far' },
    mom: { handle: 'mom', gender: 'F' },
    momMirror: { handle: 'momMirror', gender: 'F', external_mirror: 'true', external_tree: 'far' },
  };
  // 父镜像 + 母真人（shen 实测形状：父 季志全(镜像) / 母 沈伟(真人)）→ 走父真身树
  assert.equal(
    mirrorParentOf({ father_handle: 'dadMirror', mother_handle: 'mom' }, people)?.handle,
    'dadMirror',
  );
  // 父空缺 + 母镜像 → 走母真身树
  assert.equal(
    mirrorParentOf({ father_handle: '', mother_handle: 'momMirror' }, people)?.handle,
    'momMirror',
  );
  // 双镜像 → 数据异常，拒绝
  assert.throws(
    () => mirrorParentOf({ father_handle: 'dadMirror', mother_handle: 'momMirror' }, people),
    /均为外树镜像节点/,
  );
  assert.equal(mirrorParentOf({ father_handle: '', mother_handle: '' }, people), null);
});

// ---- 写路径：跨树婚姻家庭的子女归属 ----

test('跨树家庭加子女：子女建到父真身树、本树只留镜像子女，两侧同事务落盘', async () => {
  const { loc, far, h } = crossTreePair('new');
  const r = await addChildNode({
    treeId: loc,
    personHandle: h.locSelf, // 在真身母亲「沈伟」名下加子女
    name: '清昆',
    gender: 'M',
  });

  assert.equal(r.cross_tree, true);
  assert.equal(r.landed_tree_id, far);
  assert.match(r.message, /真身所在家族树/);

  const farAfter = readTree(far);
  const locAfter = readTree(loc);
  const child = farAfter.people[r.child_handle];
  assert.ok(child, '真身子女必须落在父真身树');
  assert.equal(child.name, '季清昆'); // 随父姓（取真身家庭之父的姓）
  assert.equal(child.surname, '季');
  assert.equal(child.gender, 'M');
  assert.equal(child.parent_family, 'family_far');
  assert.equal(child.external_mirror, undefined);
  assert.ok(farAfter.families.family_far.child_handles.includes(r.child_handle), '真身家庭的子女列表应含新子女');

  const mirror = locAfter.people[r.mirror_handle];
  assert.ok(mirror, '本树必须留镜像子女');
  assert.equal(mirror.name, '季清昆');
  assert.equal(mirror.external_mirror, 'true');
  assert.equal(mirror.external_link_type, MIRROR_CHILD_LINK_TYPE);
  assert.equal(mirror.external_tree, far);
  assert.equal(mirror.external_person_handle, r.child_handle);
  assert.equal(mirror.parent_family, 'family_loc');
  assert.deepEqual(locAfter.families.family_loc.child_handles, [r.mirror_handle]);
  // 本树家族的父母槽位不动（镜像父仍在父位）
  assert.equal(locAfter.families.family_loc.father_handle, h.locMirror);

  // 详情文档：写在真身树名下，本树不留详情
  assert.equal(readDetail(far, r.child_handle)?.tree_id, far);
  assert.equal(readDetail(far, r.child_handle)?.name, '季清昆');
  assert.equal(readDetail(loc, r.mirror_handle), null);

  // 两侧版本各 +1（一次事务写两棵树）
  assert.equal(locAfter.version, 5);
  assert.equal(farAfter.version, 8);
});

test('父为真人、母为镜像（娶入侧）：子女仍留本树，不产生镜像', async () => {
  const { loc, far, h } = crossTreePair('local');
  const r = await addChildNode({ treeId: far, personHandle: h.farSelf, name: '清晓', gender: 'F' });

  assert.equal(r.cross_tree, false);
  assert.equal(r.mirror_handle, '');
  assert.equal(r.landed_tree_id, far);
  const farAfter = readTree(far);
  assert.equal(farAfter.people[r.child_handle].name, '季清晓');
  assert.deepEqual(farAfter.families.family_far.child_handles, [r.child_handle]);
  assert.equal(readTree(loc).families.family_loc.child_handles.length, 0, '本树（母镜像侧）不该被改动');
  assert.equal(readTree(loc).version, 4);
});

test('跨树家庭下挂接已有节点：节点整体搬到真身树（换 handle、**编号不变**），详情随迁', async () => {
  const { loc, far, h } = crossTreePair('attach');
  // 本树先有一个「未入谱」的节点（面板选人模式）
  const locBefore = readTree(loc);
  locBefore.people.orphan = {
    handle: 'orphan',
    gramps_id: '000000010',
    name: '沈清昆',
    surname: '沈',
    given: '清昆',
    gender: 'M',
    birth_date: '1990',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: '',
    spouse_families: [],
  };
  writeTree(locBefore);
  const p = path.join(TMP, 'details', `${loc}:orphan.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ _id: `${loc}:orphan`, tree_id: loc, handle: 'orphan', name: '沈清昆', events: [{ handle: 'e1', type: 'Birth' }], attributes: [], media: [], citations: [], notes: [] }, null, 2));

  const r = await addChildNode({ treeId: loc, personHandle: h.locSelf, childHandle: 'orphan', gender: 'M' });

  assert.equal(r.cross_tree, true);
  assert.notEqual(r.child_handle, 'orphan');
  const farAfter = readTree(far);
  const locAfter = readTree(loc);
  assert.equal(locAfter.people.orphan, undefined, '节点本体不得留在本树');
  assert.equal(farAfter.people[r.child_handle].name, '沈清昆');
  // 编号终身不变（docs/id-system.spec.md §2）：只换 handle 与树归属，原编号随迁
  assert.equal(farAfter.people[r.child_handle].gramps_id, '000000010');
  assert.equal(farAfter.people[r.child_handle].parent_family, 'family_far');
  assert.deepEqual(farAfter.families.family_far.child_handles, [r.child_handle]);
  // 详情随迁到真身树，本树旧详情删除
  assert.equal(readDetail(far, r.child_handle)?.events?.[0]?.handle, 'e1');
  assert.equal(readDetail(loc, 'orphan'), null);
  assert.equal(locAfter.people[r.mirror_handle].external_person_handle, r.child_handle);
});

test('跨树家庭的拒绝分支：已入谱节点 / 双镜像父母 / 对方无婚姻家族 都不写坏任何一棵树', async () => {
  // ① 已入谱（有 parent_family）的节点不能跨树挂接
  const g1 = crossTreePair('guard_a');
  const withAttached = readTree(g1.loc);
  withAttached.people.attached = {
    handle: 'attached', gramps_id: '000000011', name: '沈某', surname: '沈', given: '某', gender: 'M',
    birth_date: '', death_date: '', birth_place: '', death_place: '',
    parent_family: 'family_loc', spouse_families: [],
  };
  writeTree(withAttached);
  await assert.rejects(
    () => addChildNode({ treeId: g1.loc, personHandle: g1.h.locSelf, childHandle: 'attached', gender: 'M' }),
    /已入谱/,
  );
  assert.equal(readTree(g1.far).families.family_far.child_handles.length, 0, '拒绝时真身树不得被写');

  // ② 父母双方都是镜像 → 拒绝
  const g2 = crossTreePair('guard_b');
  const dual = readTree(g2.loc);
  dual.people.momMirror = { ...dual.people[g2.h.locSelf], handle: 'momMirror', gender: 'F', external_mirror: 'true' };
  dual.families.family_loc.mother_handle = 'momMirror';
  writeTree(dual);
  await assert.rejects(
    () => addChildNode({ treeId: g2.loc, personHandle: 'momMirror', name: '某某', gender: 'M' }),
    /均为外树镜像节点/,
  );

  // ③ 对方（真身树）里没有对应婚姻家族 → 拒绝，且两棵树都保持原样
  const g3 = crossTreePair('guard_c');
  const far3 = readTree(g3.far);
  far3.people[g3.h.farSelf].spouse_families = [];
  far3.people[g3.h.farMirror].spouse_families = [];
  delete far3.families.family_far;
  writeTree(far3);
  const locBefore3 = fs.readFileSync(path.join(TMP, 'trees', `${g3.loc}.json`), 'utf8');
  await assert.rejects(
    () => addChildNode({ treeId: g3.loc, personHandle: g3.h.locSelf, name: '某某', gender: 'M' }),
    /没有对应的婚姻家族/,
  );
  assert.equal(fs.readFileSync(path.join(TMP, 'trees', `${g3.loc}.json`), 'utf8'), locBefore3, '本树不得被写');
});

test('跨树家庭缺真身信息 / 对方树不存在 → 明确拒绝', async () => {
  const { loc, h } = crossTreePair('broken');
  const tree = readTree(loc);
  tree.people[h.locMirror].external_person_handle = '';
  writeTree(tree);
  await assert.rejects(
    () => addChildNode({ treeId: loc, personHandle: h.locSelf, name: '某某', gender: 'M' }),
    /缺少真身信息/,
  );
});

// ---- 写路径：普通家庭（老口径） ----

test('普通家庭：复用第一个配偶家族追加子女（随父姓），不新建家族', async () => {
  const id = plainTree('withfam');
  const r = await addChildNode({ treeId: id, personHandle: 'mom', name: '小明', gender: 'M' });
  assert.equal(r.cross_tree, false);
  assert.equal(r.mirror_handle, '');
  assert.equal(r.family_handle, 'fam_plain');
  const after = readTree(id);
  assert.deepEqual(after.families.fam_plain.child_handles, [r.child_handle]);
  assert.equal(after.people[r.child_handle].name, '沈小明'); // 随父姓（家族之父 沈克强）
  assert.equal(after.people[r.child_handle].parent_family, 'fam_plain');
  assert.equal(after.people['mom'].spouse_families.length, 1);
});

test('普通家庭：本人没有配偶家族 → 按本人性别槽新建家族', async () => {
  const id = plainTree('nofam', { withFamily: false });
  const r = await addChildNode({ treeId: id, personHandle: 'mom', name: '小红', gender: 'F' });
  const after = readTree(id);
  const fam = after.families[r.family_handle];
  assert.equal(fam.mother_handle, 'mom');
  assert.equal(fam.father_handle, '');
  assert.deepEqual(fam.child_handles, [r.child_handle]);
  assert.deepEqual(after.people['mom'].spouse_families, [r.family_handle]);
  assert.equal(after.people[r.child_handle].name, '李小红'); // 父不详 → 随本人姓
  assert.equal(readDetail(id, r.child_handle)?.tree_id, id);
  // 未填姓名 → 拒绝
  await assert.rejects(() => addChildNode({ treeId: id, personHandle: 'mom', gender: 'M' }), /请填写子节点姓名/);
});

// ---- 路由层：POST /admin/add-child ----

test('路由 POST /admin/add-child：鉴权通过 → 跨树结果落两棵树，返回体含 landed_tree_id', async () => {
  const { handleRequest } = await import('../index.js');
  const { signJwt } = await import('./auth.js');
  const phone = '16600000000';
  fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
  fs.writeFileSync(
    path.join(TMP, 'collections', 'jiapu_users.json'),
    JSON.stringify({ [phone]: { _id: phone, phone, nickname: '测试', role: 'tree_steward' } }),
  );
  const token = signJwt({ sub: phone, phone, role: 'tree_steward' }, 3600);

  const g = crossTreePair('route');
  const res = await handleRequest({
    path: '/admin/add-child',
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ tree_id: g.loc, person_handle: g.h.locSelf, name: '清昆', gender: 'M' }),
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.cross_tree, true);
  assert.equal(body.landed_tree_id, g.far);
  assert.equal(readTree(g.far).people[body.child_handle].name, '季清昆');
  assert.equal(readTree(g.loc).people[body.mirror_handle].external_person_handle, body.child_handle);

  // 未登录 → 401（写权限拦截生效）
  const anon = await handleRequest({
    path: '/admin/add-child',
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ tree_id: g.loc, person_handle: g.h.locSelf, name: '清昆' }),
  });
  assert.equal(anon.statusCode, 401);
});

// ---- 真实数据副本（shen/ji）复现 §7-4 纠偏场景 ----

test('真实数据副本：shen 侧「父 季志全(镜像)/母 沈伟」下加子女 → 落到 ji 真身家族，shen 只留镜像', async () => {
  const pair = ['shen_27784_01', 'ji_23395_01'];
  for (const t of pair) {
    fs.copyFileSync(path.join(REAL_TREES, `${t}.json`), path.join(TMP, 'trees', `${t}.json`));
  }
  const jiBefore = readTree('ji_23395_01');
  const shenBefore = readTree('shen_27784_01');

  // 定位一律走「姓名 + handle 指针」，不写死 gramps_id：
  // 编号会随「全站唯一编号」迁移整站变化（I500059 → I000254 之类），handle 与姓名才是不变量。
  const mother = Object.values(shenBefore.people).find((p) => p.name === '沈伟' && !p.external_mirror);
  assert.ok(mother, 'shen 副本应有真身「沈伟」（母）');
  const shenFamBefore = shenBefore.families[mother.spouse_families[0]];
  assert.ok(shenFamBefore, '「沈伟」应已有配偶家族');
  const fatherMirror = shenBefore.people[shenFamBefore.father_handle];
  assert.equal(fatherMirror.external_mirror, 'true', 'shen 侧的父亲应是镜像');
  // 镜像父的 external 指针 → ji 的真身「季志全」；子女应落到 ji 中以他为父的家庭
  const jiFather = jiBefore.people[fatherMirror.external_person_handle];
  assert.ok(jiFather, '镜像父的 external_person_handle 应在 ji 副本里命中真身');
  assert.equal(jiFather.name, '季志全');
  const jiFamHandle = Object.keys(jiBefore.families).find(
    (h) => jiBefore.families[h].father_handle === jiFather.handle,
  );
  assert.ok(jiFamHandle, 'ji 副本应有以「季志全」为父的家庭（真身家族）');
  // 存量节点快照：加子女不得改动它（含编号）
  const legacyChild = Object.values(jiBefore.people).find((p) => p.name === '季清昆');
  assert.ok(legacyChild, 'ji 副本应已存在存量节点「季清昆」');

  const r = await addChildNode({
    treeId: 'shen_27784_01',
    personHandle: mother.handle, // 沈伟（shen 侧真身）
    name: '清昆',
    gender: 'M',
  });
  assert.equal(r.cross_tree, true);
  assert.equal(r.landed_tree_id, 'ji_23395_01');

  const jiAfter = readTree('ji_23395_01');
  const shenAfter = readTree('shen_27784_01');
  assert.deepEqual(
    jiAfter.families[jiFamHandle].child_handles,
    [...jiBefore.families[jiFamHandle].child_handles, r.child_handle],
    '子女挂进 ji 的真实家庭（父 季志全 / 母 沈伟 镜像）',
  );
  assert.equal(jiAfter.people[r.child_handle].name, '季清昆');
  assert.equal(jiAfter.people[r.child_handle].surname, '季');

  const shenFam = shenAfter.families[shenFamBefore.handle];
  assert.ok(shenFam.child_handles.includes(r.mirror_handle), 'shen 侧新增的子女必须是镜像');
  assert.equal(
    Object.values(shenAfter.people).filter((x) => x.name === '季清昆' && !x.external_mirror).length,
    0,
    'shen 侧不得落真人子女',
  );
  assert.equal(shenAfter.people[r.mirror_handle].external_mirror, 'true');
  assert.equal(shenAfter.people[r.mirror_handle].external_tree, 'ji_23395_01');
  assert.equal(shenAfter.people[r.mirror_handle].external_person_handle, r.child_handle);
  assert.equal(shenFam.father_handle, fatherMirror.handle, 'shen 侧镜像父仍在父位');
  // 存量节点（ji 里已有的 季清昆）不受影响：整条记录逐字段一致（编号随之原样不变）
  assert.deepEqual(jiAfter.people[legacyChild.handle], legacyChild, '存量节点不允许被改动');
  assert.equal(jiAfter.people[legacyChild.handle].gramps_id, legacyChild.gramps_id, '存量节点编号不变');
  assert.equal(jiAfter.people[legacyChild.handle].parent_family, jiFamHandle, '存量节点仍挂在原家族');
  assert.notEqual(r.child_handle, legacyChild.handle, '新子女是另一个节点');
});

test('测试全程未写 migrate-output 真实数据（md5 一致）', () => {
  const now = fs.readdirSync(REAL_TREES);
  assert.deepEqual(now.sort(), [...realBaseline.keys()].sort(), '真实树目录文件数/文件名未变');
  for (const f of now) {
    const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(REAL_TREES, f))).digest('hex');
    assert.equal(md5, realBaseline.get(f), `${f} 被改动了`);
  }
});

// ---- 2026-09-15 追加：默认性别「男」+ 真身树深度上限 ----

/** 造一对互为镜像的跨树婚姻树（本树 a_*：父为镜像；真身树 b_*：父为真人） */
function mirrorPair(tag) {
  const a = `${tag}_a`;
  const b = `${tag}_b`;
  const mh = `${tag}_mirror_father`;
  const wh = `${tag}_mother`;
  const rh = `${tag}_real_father`;
  const mw = `${tag}_mirror_mother`;
  writeTree({
    tree_id: a,
    version: 1,
    updated_at: new Date().toISOString(),
    people: {
      [mh]: { handle: mh, gramps_id: '000000001', name: '季志全', surname: '季', given: '志全', gender: 'M', parent_family: '', spouse_families: [`${tag}_F1`], external_tree: b, external_person_handle: rh, external_link_type: 'marriage', external_mirror: 'true', is_living: true },
      [wh]: { handle: wh, gramps_id: '000000002', name: '沈伟', surname: '沈', given: '伟', gender: 'F', parent_family: '', spouse_families: [`${tag}_F1`], external_tree: '', external_person_handle: '', external_link_type: '', is_living: true },
    },
    families: {
      [`${tag}_F1`]: { handle: `${tag}_F1`, gramps_id: 'F000001', father_handle: mh, mother_handle: wh, child_handles: [] },
    },
  });
  writeTree({
    tree_id: b,
    version: 1,
    updated_at: new Date().toISOString(),
    people: {
      [rh]: { handle: rh, gramps_id: '000000001', name: '季志全', surname: '季', given: '志全', gender: 'M', parent_family: '', spouse_families: [`${tag}_G1`], external_tree: a, external_person_handle: mh, external_link_type: 'marriage', is_living: true },
      [mw]: { handle: mw, gramps_id: '000500059', name: '沈伟', surname: '沈', given: '伟', gender: 'F', parent_family: '', spouse_families: [`${tag}_G1`], external_tree: a, external_person_handle: wh, external_link_type: 'marriage', external_mirror: 'true', is_living: true },
    },
    families: {
      [`${tag}_G1`]: { handle: `${tag}_G1`, gramps_id: 'F500020', father_handle: rh, mother_handle: mw, child_handles: [] },
    },
  });
  return { a, b, mh, wh, rh, mw, famA: `${tag}_F1`, famB: `${tag}_G1` };
}

test('新建子节点不传 gender → 默认「男」（本树普通家庭）', async () => {
  const tag = 'gend';
  const treeId = `${tag}_t`;
  const ph = `${tag}_p`;
  writeTree({
    tree_id: treeId, version: 1, updated_at: new Date().toISOString(),
    people: { [ph]: { handle: ph, gramps_id: '000000001', name: '季甲', surname: '季', given: '甲', gender: 'M', parent_family: '', spouse_families: [`${tag}_F1`], is_living: true } },
    families: { [`${tag}_F1`]: { handle: `${tag}_F1`, gramps_id: 'F000001', father_handle: ph, mother_handle: '', child_handles: [] } },
  });
  const r = await addChildNode({ treeId, personHandle: ph, name: '乙' });
  const t = readTree(treeId);
  const kid = Object.values(t.people).find((p) => p.name === '季乙');
  assert.ok(kid, '应创建子节点');
  assert.equal(kid.gender, 'M', '默认性别应为 M（男）');
  assert.equal(r.child_handle, kid.handle);
});

test('跨树家庭新建子节点不传 gender → 真身树里的子女默认「男」', async () => {
  const t = mirrorPair('genx');
  await addChildNode({ treeId: t.a, personHandle: t.mh, name: '清昆' });
  const rb = readTree(t.b);
  const kid = Object.values(rb.people).find((p) => p.name === '季清昆' && !p.external_mirror);
  assert.ok(kid, '真身树应新建子女');
  assert.equal(kid.gender, 'M');
});

test('真身树已达深度上限 → 403 且两棵树都不写', async () => {
  const t = mirrorPair('depth');
  const beforeB = JSON.stringify(readTree(t.b));
  const beforeA = JSON.stringify(readTree(t.a));
  await assert.rejects(
    () => addChildNode({ treeId: t.a, personHandle: t.mh, name: '清昆', maxDepth: 72, depthOf: () => 72 }),
    (e) => e.status === 403 && /世深度上限/.test(e.message),
  );
  assert.equal(JSON.stringify(readTree(t.b)), beforeB, '真身树不应被写入');
  assert.equal(JSON.stringify(readTree(t.a)), beforeA, '本树不应被写入');
});

test('真身树未达上限 → 正常写入（depthOf 返回 71 < 72）', async () => {
  const t = mirrorPair('under');
  const r = await addChildNode({ treeId: t.a, personHandle: t.mh, name: '清昆', maxDepth: 72, depthOf: () => 71 });
  assert.equal(r.cross_tree, true);
  assert.equal(r.landed_tree_id, t.b);
  const rb = readTree(t.b);
  assert.ok(Object.values(rb.people).some((p) => p.name === '季清昆'), '真身树应落节点');
});

// ══════════════════════════════════════════════════════════════════════════════
// 2026-10-15 口径（Kevin 当面拍定；① 同日主代理收窄为**仅 founder**）：
//   ① 祖谱认祖镜像（**仅 founder**）名下的子嗣 ⇒ 建在**本树**（真人节点），不回写真身树；
//   ② 世本里「已作为某祖谱始祖」的节点 ⇒ 加子拦下（400 逐字文案，新建 / 挂接同拦）；
//   ③ 普通 / 姻亲镜像（marriage / child / 空）⇒ 维持原路由（对照，防误伤）；
//      chain（世系链镜像）⇒ 同 ③ 维持原路由（T4 对照：落真身树 + 本树留镜像子女）。
// ══════════════════════════════════════════════════════════════════════════════

const md5Of = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const treePath = (id) => path.join(TMP, 'trees', `${id}.json`);
const BLOCK_COPY = '该节点已作为《季氏祖谱》的始祖，请到该祖谱内添加子嗣';

/** 世本（zhonghua）夹具：始祖 zh_founder / 二房始祖 zh_founder2 / 普通节点 zh_plain（每例重建，用例间互不污染） */
function writeMasterTree() {
  const person = (handle, grampsId, name, given, extra = {}) => ({
    handle, gramps_id: grampsId, name, surname: '季', given, gender: 'M',
    birth_date: '', death_date: '', birth_place: '', death_place: '',
    parent_family: '', spouse_families: [], is_living: false, ...extra,
  });
  writeTree({
    tree_id: 'zhonghua',
    version: 41,
    updated_at: '2026-10-15T00:00:00.000Z',
    people: {
      zh_founder: person('zh_founder', '000000001', '季始祖公', '始祖公', { spouse_families: ['zh_fam_1'] }),
      zh_chain: person('zh_chain', '000000002', '季二世', '二世', { parent_family: 'zh_fam_1' }),
      zh_founder2: person('zh_founder2', '000000003', '季二房公', '二房公'),
      zh_plain: person('zh_plain', '000000050', '季某', '某'),
    },
    families: {
      zh_fam_1: { handle: 'zh_fam_1', gramps_id: 'F000001', father_handle: 'zh_founder', mother_handle: '', child_handles: ['zh_chain'] },
    },
  });
}

/**
 * 祖谱夹具（kind='clan'，meta 里 `master_handle='zh_founder'`）：
 *   cl_mirror_founder 顶端认祖镜像（founder，真身 zh_founder）—— **无家庭**（生产实测形状：始祖镜像 spouse_families=[]）
 *   cl_mirror_chain   世系链镜像（chain，真身 zh_chain）—— 无家庭
 *   cl_own            自有段入口（真人）
 */
function writeClanTree() {
  const mirror = (handle, grampsId, name, given, linkType, masterHandle, gender = 'M', note = '') => ({
    handle, gramps_id: grampsId, name, surname: '季', given, gender,
    birth_date: '', death_date: '', birth_place: '', death_place: '',
    parent_family: '', spouse_families: [],
    external_tree: 'zhonghua', external_person_handle: masterHandle,
    external_link_type: linkType, external_mirror: 'true',
    ...(note ? { external_relation_note: note } : {}),
  });
  writeTree({
    tree_id: 'clan_founder',
    version: 9,
    updated_at: '2026-10-15T00:00:00.000Z',
    people: {
      cl_mirror_founder: mirror('cl_mirror_founder', '000500001', '季始祖公', '始祖公', 'founder', 'zh_founder', 'M', '季始祖公（中华世本 · 第 1 世）'),
      cl_mirror_chain: mirror('cl_mirror_chain', '000500002', '季二世', '二世', 'chain', 'zh_chain', 'F'),
      cl_own: {
        handle: 'cl_own', gramps_id: '000000010', name: '季花', surname: '季', given: '花', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '',
        parent_family: '', spouse_families: ['cl_fam_own'],
      },
    },
    families: {
      cl_fam_own: { handle: 'cl_fam_own', gramps_id: 'F000010', father_handle: 'cl_own', mother_handle: '', child_handles: [] },
    },
  });
}

/** 二房祖谱夹具：认祖镜像**已占家庭父槽**（真身 zh_founder2）→ 加子应复用本树既有家庭 */
function writeClanTree2() {
  writeTree({
    tree_id: 'clan_founder2',
    version: 3,
    updated_at: '2026-10-15T00:00:00.000Z',
    people: {
      cl2_mirror_founder: {
        handle: 'cl2_mirror_founder', gramps_id: '000500011', name: '季二房公', surname: '季', given: '二房公', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '',
        parent_family: '', spouse_families: ['cl2_fam'],
        external_tree: 'zhonghua', external_person_handle: 'zh_founder2',
        external_link_type: 'founder', external_mirror: 'true',
      },
      cl2_wife: {
        handle: 'cl2_wife', gramps_id: '000000011', name: '王氏', surname: '王', given: '氏', gender: 'F',
        birth_date: '', death_date: '', birth_place: '', death_place: '',
        parent_family: '', spouse_families: ['cl2_fam'],
      },
    },
    families: {
      cl2_fam: { handle: 'cl2_fam', gramps_id: 'F000011', father_handle: 'cl2_mirror_founder', mother_handle: 'cl2_wife', child_handles: [] },
    },
  });
}

// ---- 口径 ①：认祖镜像判定（纯函数） ----

test('口径①·纯函数：**仅 founder** 认祖镜像不作真身路由（返回 null）；chain / marriage / child / 空 照旧路由', () => {
  const base = { external_mirror: 'true', external_tree: 'zhonghua', external_person_handle: 'zh_founder' };
  assert.equal(isFounderAncestorMirror({ ...base, external_link_type: 'founder' }), true);
  assert.equal(
    isFounderAncestorMirror({ ...base, external_link_type: 'chain' }),
    false,
    '收窄后 chain 不算认祖镜像（不豁免）',
  );
  assert.equal(isFounderAncestorMirror({ ...base, external_link_type: 'marriage' }), false);
  assert.equal(isFounderAncestorMirror({ ...base, external_link_type: 'child' }), false);
  assert.equal(isFounderAncestorMirror({ ...base, external_link_type: '' }), false);
  assert.equal(isFounderAncestorMirror({ ...base, external_link_type: 'branch' }), false);
  assert.equal(isFounderAncestorMirror(null), false);

  const people = {
    fm: { handle: 'fm', gender: 'M', ...base, external_link_type: 'founder' },
    cm: { handle: 'cm', gender: 'F', ...base, external_link_type: 'chain' },
    mm: { handle: 'mm', gender: 'M', ...base, external_link_type: 'marriage' },
    real: { handle: 'real', gender: 'F' },
  };
  assert.equal(mirrorParentOf({ father_handle: 'fm', mother_handle: 'real' }, people), null, 'founder 镜像（父槽）→ 不路由');
  assert.equal(
    mirrorParentOf({ father_handle: 'cm', mother_handle: 'real' }, people)?.handle,
    'cm',
    'chain 镜像（父槽）→ 照旧路由（防误伤收窄）',
  );
  assert.equal(mirrorParentOf({ father_handle: '', mother_handle: 'fm' }, people), null, '父空缺 + founder 镜像（母槽）→ 不路由');
  assert.equal(
    mirrorParentOf({ father_handle: '', mother_handle: 'cm' }, people)?.handle,
    'cm',
    '父空缺 + chain 镜像（母槽）→ 照旧路由',
  );
  assert.equal(mirrorParentOf({ father_handle: 'mm', mother_handle: 'real' }, people)?.handle, 'mm', '婚姻镜像 → 照旧路由（防误伤）');
});

// ---- 口径 ①：写路径（T1 founder / T1b 复用家庭；T4 chain **对照** = 不豁免、照旧路由） ----

test('口径①·T4（对照）：世系链镜像（chain）**不豁免** → 仍按既有路由落真身树 + 本树留镜像子女，真身分文不动地新建', async () => {
  // 既有跨树路由的完整前提（与本文件既有 mirrorPair 用例同形状）：
  //   本树 a：父 = chain 镜像（external_link_type='chain'，真身 b 的 rh）、母 = 真人；
  //   真身树 b：父 rh 真人 / 母 mw = 本树镜像；两树各有一段互为镜像的婚姻家族。
  const t = mirrorPair('t4chain');
  const a0 = readTree(t.a);
  a0.people[t.mh].external_link_type = 'chain'; // 只改 link_type：从婚姻镜像换成世系链镜像
  writeTree(a0);

  // 纯函数对照：chain **不被**认作认祖镜像（收窄后只认 founder）
  assert.equal(isFounderAncestorMirror(a0.people[t.mh]), false, 'chain 不豁免');
  const bBefore = readTree(t.b);

  const r = await addChildNode({ treeId: t.a, personHandle: t.mh, name: '清晓', gender: 'F' });

  assert.equal(r.cross_tree, true, 'chain 镜像照旧走真身路由（不再豁免）');
  assert.equal(r.landed_tree_id, t.b, '子女落真身树');
  assert.notEqual(r.mirror_handle, '', '本树留镜像子女');
  assert.match(r.message, /真身所在家族树/);

  // 真身树：新建真人子女（父 rh 的父亲姓）
  const bAfter = readTree(t.b);
  const real = bAfter.people[r.child_handle];
  assert.ok(real, '真身树必须新建真人子女');
  assert.equal(real.name, '季清晓');
  assert.equal(real.surname, '季');
  assert.equal(real.gender, 'F');
  assert.equal(real.external_tree, '');
  assert.equal(real.external_mirror, undefined, '真身子女不是镜像');
  assert.equal(real.parent_family, t.famB);
  assert.deepEqual(bAfter.families[t.famB].child_handles, [...bBefore.families[t.famB].child_handles, r.child_handle]);
  assert.equal(readDetail(t.b, r.child_handle)?.tree_id, t.b, '详情落真身树');

  // 本树：只留镜像子女（挂进本树既有家庭）
  const aAfter = readTree(t.a);
  const mirror = aAfter.people[r.mirror_handle];
  assert.equal(mirror.name, '季清晓');
  assert.equal(mirror.external_mirror, 'true');
  assert.equal(mirror.external_link_type, MIRROR_CHILD_LINK_TYPE);
  assert.equal(mirror.external_tree, t.b);
  assert.equal(mirror.external_person_handle, r.child_handle);
  assert.deepEqual(aAfter.families[t.famA].child_handles, [r.mirror_handle]);
  assert.equal(aAfter.families[t.famA].father_handle, t.mh, '本树镜像父仍在父位');
  assert.equal(
    Object.values(aAfter.people).filter((p) => p.name === '季清晓' && !p.external_mirror).length,
    0,
    '本树不得落真人子女',
  );
});

test('口径①·T1：祖谱认祖镜像（founder）加子 → 本树新建真人子 + 本树新建家庭；真身（世本）树零变化', async () => {
  writeMasterTree();
  writeClanTree();
  const zhMd5Before = md5Of(treePath('zhonghua'));
  const zhVerBefore = readTree('zhonghua').version;

  const r = await addChildNode({ treeId: 'clan_founder', personHandle: 'cl_mirror_founder', name: '清昆', gender: 'M' });

  assert.equal(r.cross_tree, false, '认祖镜像不作真身路由');
  assert.equal(r.mirror_handle, '', '本树不留镜像子女');
  assert.equal(r.landed_tree_id, 'clan_founder', '子嗣落在本树');

  const clan = readTree('clan_founder');
  const child = clan.people[r.child_handle];
  assert.ok(child, '本树必须新建真人子节点');
  assert.equal(child.name, '季清昆'); // 随父姓（认祖镜像本人姓）
  assert.equal(child.surname, '季');
  assert.equal(child.gender, 'M');
  assert.equal(child.parent_family, r.family_handle);
  // 本树真人节点：`external_*` 一律为空（不是镜像）
  assert.equal(child.external_tree, '');
  assert.equal(child.external_person_handle, '');
  assert.equal(child.external_link_type, '');
  assert.equal(child.external_mirror, undefined);
  assert.equal(child.is_living, false, '祖谱（clan）新建节点一律已故（口径 5）');
  const fam = clan.families[r.family_handle];
  assert.equal(fam.father_handle, 'cl_mirror_founder', '本树新建家庭：父槽 = 本人');
  assert.equal(fam.mother_handle, '');
  assert.deepEqual(fam.child_handles, [r.child_handle]);
  assert.deepEqual(clan.people.cl_mirror_founder.spouse_families, [r.family_handle]);
  assert.equal(readDetail('clan_founder', r.child_handle)?.tree_id, 'clan_founder', '详情落本树');

  // 真身（世本）零写入：字节 md5 / version / 节点集合 / 无新详情
  assert.equal(md5Of(treePath('zhonghua')), zhMd5Before, '世本树字节一字未改');
  const zh = readTree('zhonghua');
  assert.equal(zh.version, zhVerBefore, '世本树 version 不变');
  assert.deepEqual(Object.keys(zh.people).sort(), ['zh_chain', 'zh_founder', 'zh_founder2', 'zh_plain']);
  assert.equal(fs.existsSync(path.join(TMP, 'details', `zhonghua:${r.child_handle}.json`)), false, '世本侧无新详情');
});

test('口径①·T1b：认祖镜像已在家庭父槽 → 复用本树既有家庭追加真人子（不新建家庭、不回写真身）', async () => {
  writeMasterTree();
  writeClanTree2();
  const zhMd5Before = md5Of(treePath('zhonghua'));

  const r = await addChildNode({ treeId: 'clan_founder2', personHandle: 'cl2_mirror_founder', name: '清昆', gender: 'M' });

  assert.equal(r.cross_tree, false);
  assert.equal(r.family_handle, 'cl2_fam', '复用既有家庭');
  const clan = readTree('clan_founder2');
  const child = clan.people[r.child_handle];
  assert.equal(child.name, '季清昆');
  assert.equal(child.parent_family, 'cl2_fam');
  assert.equal(child.external_tree, '');
  assert.deepEqual(clan.families.cl2_fam.child_handles, [r.child_handle]);
  assert.equal(clan.families.cl2_fam.father_handle, 'cl2_mirror_founder', '父槽仍是认祖镜像');
  assert.equal(clan.families.cl2_fam.mother_handle, 'cl2_wife');
  assert.equal(Object.keys(clan.families).length, 1, '不得新建家庭');
  assert.equal(md5Of(treePath('zhonghua')), zhMd5Before, '世本树字节一字未改');
});

// ---- 口径 ③：防误伤对照（marriage / child / 空 link_type 仍按原路由） ----

test('口径③·T2（对照）：婚姻 / 镜像子女 / 无 link_type 的镜像父母 → 仍按原路由落真身树 + 本树留镜像子女', async () => {
  for (const [tag, linkType] of [['ctl_marriage', 'marriage'], ['ctl_child', 'child'], ['ctl_empty', '']]) {
    const { loc, far, h } = crossTreePair(tag);
    const locTree = readTree(loc);
    locTree.people[h.locMirror].external_link_type = linkType;
    writeTree(locTree);

    const r = await addChildNode({ treeId: loc, personHandle: h.locSelf, name: '清昆', gender: 'M' });

    assert.equal(r.cross_tree, true, `link_type='${linkType}' 应仍走真身路由（防误伤）`);
    assert.equal(r.landed_tree_id, far, `link_type='${linkType}' 应落真身树`);
    const farAfter = readTree(far);
    assert.equal(farAfter.people[r.child_handle].name, '季清昆');
    assert.ok(farAfter.families.family_far.child_handles.includes(r.child_handle));
    const locAfter = readTree(loc);
    assert.equal(locAfter.people[r.mirror_handle].external_link_type, MIRROR_CHILD_LINK_TYPE, '本树仍留镜像子女');
  }
});

// ---- 口径 ②：世本「已作某祖谱始祖」的节点拦加子 ----

test('口径②·T3：世本里「已作某祖谱始祖」的节点加子 → 400 逐字文案 + 树字节不变（新建 / 挂接同拦）', async () => {
  writeMasterTree();
  const zhBefore = fs.readFileSync(treePath('zhonghua'), 'utf8');
  const zhDetailCount = () =>
    fs.readdirSync(path.join(TMP, 'details')).filter((f) => f.startsWith('zhonghua:')).length;
  const detailsBefore = zhDetailCount();

  // 纯函数：谁认它作始祖 + 文案 + 缺省世本 id
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  assert.equal(clanOfMasterNode(meta.trees, 'zh_founder')?.tree_id, 'clan_founder', 'zh_founder 是 clan_founder 的始祖');
  assert.equal(clanOfMasterNode(meta.trees, 'zh_founder2')?.tree_id, 'clan_founder2');
  assert.equal(clanOfMasterNode(meta.trees, 'zh_plain'), null, '非始祖 → 无祖谱命中');
  assert.equal(clanOfMasterNode(meta.trees, ''), null);
  assert.equal(clanOfMasterNode(null, 'zh_founder'), null);
  assert.equal(
    clanFounderChildBlockMessage({ display_title: '季氏祖谱' }),
    BLOCK_COPY,
    '拦截文案逐字：该节点已作为《<祖谱名>》的始祖，请到该祖谱内添加子嗣',
  );
  assert.equal(DEFAULT_MASTER_TREE_ID, 'zhonghua', '缺省世本 tree_id 与 index.js 的 MASTER_TREE_ID 同源');

  // 新建模式（显式 masterTreeId）
  await assert.rejects(
    () => addChildNode({ treeId: 'zhonghua', masterTreeId: 'zhonghua', personHandle: 'zh_founder', name: '某某', gender: 'M' }),
    (e) => e.status === 400 && e.message === BLOCK_COPY,
    '世本始祖加子应 400 且文案逐字',
  );
  // 新建模式（不传 masterTreeId → 缺省兜底同样拦）
  await assert.rejects(
    () => addChildNode({ treeId: 'zhonghua', personHandle: 'zh_founder', name: '某某', gender: 'M' }),
    (e) => e.status === 400 && e.message === BLOCK_COPY,
  );
  assert.equal(fs.readFileSync(treePath('zhonghua'), 'utf8'), zhBefore, '拦下时世本树字节不变（零写入）');
  assert.equal(zhDetailCount(), detailsBefore, '拦下时不产生任何详情');

  // 选人挂接模式（attach）：同拦
  const zh = readTree('zhonghua');
  zh.people.zh_orphan = {
    handle: 'zh_orphan', gramps_id: '000000060', name: '季某乙', surname: '季', given: '某乙', gender: 'M',
    birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
  };
  writeTree(zh);
  const zhBeforeAttach = fs.readFileSync(treePath('zhonghua'), 'utf8');
  await assert.rejects(
    () => addChildNode({ treeId: 'zhonghua', masterTreeId: 'zhonghua', personHandle: 'zh_founder', childHandle: 'zh_orphan', gender: 'M' }),
    (e) => e.status === 400 && e.message === BLOCK_COPY,
    '选人挂接模式同样拦',
  );
  assert.equal(fs.readFileSync(treePath('zhonghua'), 'utf8'), zhBeforeAttach, '挂接被拦时世本树字节不变');
  assert.equal(zhDetailCount(), detailsBefore, '挂接被拦时不产生任何详情');

  // 路由层 POST /admin/add-child（总编辑）：400 + 同一文案
  // 用户档走 store.colSet 落副本（本文件前面的路由用例已把 jiapu_users 读进 store 的进程内集合缓存，
  // 直接改写文件不会刷新该缓存 → 会得到 401「用户不存在」）
  const { handleRequest } = await import('../index.js');
  const { signJwt } = await import('./auth.js');
  const { colSet } = await import('./store.js');
  const chief = '16600009201';
  await colSet('jiapu_users', chief, { phone: chief, nickname: '总编辑', role: 'chief_editor' });
  const token = signJwt({ sub: chief, phone: chief, role: 'chief_editor' }, 3600);
  const zhBeforeRoute = fs.readFileSync(treePath('zhonghua'), 'utf8');
  const res = await handleRequest({
    path: '/admin/add-child',
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ tree_id: 'zhonghua', person_handle: 'zh_founder', name: '某某', gender: 'M' }),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, BLOCK_COPY, '路由出参与 lib 同文案');
  assert.equal(fs.readFileSync(treePath('zhonghua'), 'utf8'), zhBeforeRoute, '路由拦截同样零写入');
});

test('口径②·T5：世本里非始祖的节点加子照常成功（拦截不误伤其它节点）', async () => {
  writeMasterTree();
  const r = await addChildNode({ treeId: 'zhonghua', masterTreeId: 'zhonghua', personHandle: 'zh_plain', name: '阿某', gender: 'M' });

  assert.equal(r.cross_tree, false);
  assert.equal(r.landed_tree_id, 'zhonghua');
  const zh = readTree('zhonghua');
  const child = zh.people[r.child_handle];
  assert.equal(child.name, '季阿某');
  assert.equal(child.is_living, false, '世本（master）新建节点一律已故（口径 5）');
  assert.equal(child.parent_family, r.family_handle);
  const fam = zh.families[r.family_handle];
  assert.equal(fam.father_handle, 'zh_plain');
  assert.equal(fam.mother_handle, '');
  assert.deepEqual(fam.child_handles, [r.child_handle]);
  assert.equal(readDetail('zhonghua', r.child_handle)?.tree_id, 'zhonghua');
  // 其它节点（含两部祖谱的始祖）不受影响
  assert.ok(zh.people.zh_founder, 'zh_founder 仍在（未被删改）');
  assert.equal(zh.people.zh_founder.spouse_families.length, 1, 'zh_founder 的家族引用未被改');
});

test('口径②附加：非世本树（祖谱 / 普通家族树）的节点不受拦截（只在 treeId === 世本 时生效）', async () => {
  writeMasterTree();
  writeClanTree();
  // 祖谱里的自有段入口照常可加子（与 meta 里的 clan 条目无关：本树不是世本）
  const r = await addChildNode({ treeId: 'clan_founder', masterTreeId: 'zhonghua', personHandle: 'cl_own', name: '某孙', gender: 'M' });
  assert.equal(r.landed_tree_id, 'clan_founder');
  const clan = readTree('clan_founder');
  assert.equal(clan.people[r.child_handle].name, '季某孙');
  assert.equal(clan.people[r.child_handle].external_tree, '');
  assert.deepEqual(clan.families.cl_fam_own.child_handles, [r.child_handle], '祖谱自有段家庭照常追加子女');
});

// ================= ★ A-2（镜像不铸号 · 甲口径 2026-10-16）：镜像子女取真身号 =================

test('A-2 跨树镜像子女不铸号：编号逐字取真身子女号（新建 / 挂接两路）+ 真身无号 → 400 零写入', async () => {
  const idSeq = await import('./id-seq.js');
  const seqOf = () => idSeq.readSeq(idSeq.SEQ_PERSON);
  // 计数器就位（若本套件此前未铸过号：按既有数据 max+1 播种，避免初始化跳变干扰 delta 读数）
  if (!(await seqOf())) await idSeq.initSeqIfMissing();

  // ── ① 跨树新建子女：真身树铸 1 个人号（真人），本树镜像子女**逐字沿用**该号（不再另铸）──
  const t1 = crossTreePair('a2_new');
  const seqB1 = await seqOf();
  const r1 = await addChildNode({ treeId: t1.loc, personHandle: t1.h.locSelf, name: '清晓', gender: 'F' });
  const seqA1 = await seqOf();
  const locAfter = readTree(t1.loc);
  const farAfter = readTree(t1.far);
  const realChild = farAfter.people[r1.child_handle];
  const mirrorChild = locAfter.people[r1.mirror_handle];
  assert.ok(realChild && mirrorChild, '真身子女 + 本树镜像子女都落库');
  assert.equal(mirrorChild.gramps_id, realChild.gramps_id, '★ A-2：镜像子女编号逐字取真身编号（同一人两记录一号）');
  assert.equal(seqA1 - seqB1, 1, `★ A-2：镜像不铸号 —— 本次只真身铸 1 个号（人号计数器 ${seqB1} → ${seqA1}）`);
  assert.equal(mirrorChild.external_tree, t1.far);
  assert.equal(mirrorChild.external_person_handle, r1.child_handle);
  assert.equal(mirrorChild.external_mirror, 'true');
  assert.notEqual(mirrorChild.handle, realChild.handle, 'A-1：handle 仍是记录级（镜像 ≠ 真身 handle）');
  for (const [tid, tree] of [
    [t1.loc, locAfter],
    [t1.far, farAfter],
  ]) {
    const list = Object.values(tree.people);
    assert.equal(
      new Set(list.map((p) => String(p.gramps_id || ''))).size,
      list.length,
      `A-3：${tid} 同树内 gramps_id 去重计数 = 人数`,
    );
  }

  // ── ② 跨树挂接存量节点：编号随迁（真身 000000010）→ 镜像子女取该号，全程**零铸号** ──
  const t2 = crossTreePair('a2_attach');
  const loc2 = readTree(t2.loc);
  loc2.people.orphan = {
    handle: 'orphan',
    gramps_id: '000000010',
    name: '沈清昆',
    surname: '沈',
    given: '清昆',
    gender: 'M',
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: '',
    spouse_families: [],
  };
  writeTree(loc2);
  const seqB2 = await seqOf();
  const r2 = await addChildNode({ treeId: t2.loc, personHandle: t2.h.locSelf, childHandle: 'orphan', gender: 'M' });
  const seqA2 = await seqOf();
  const loc2After = readTree(t2.loc);
  const far2After = readTree(t2.far);
  assert.equal(far2After.people[r2.child_handle].gramps_id, '000000010', '挂接存量节点：编号随迁（终身不变）');
  assert.equal(loc2After.people[r2.mirror_handle].gramps_id, '000000010', '★ A-2：镜像子女编号 = 真身编号（不是新铸号）');
  assert.equal(seqA2, seqB2, `★ A-2：挂接路径全程零铸号（人号计数器 ${seqB2} → ${seqA2}）`);

  // ── ③ 真身无号 ⇒ 400 拒绝创建（**绝不兜底铸号**），两棵树 + 计数器零变化 ──
  const t3 = crossTreePair('a2_noid');
  const loc3 = readTree(t3.loc);
  loc3.people.legacy = {
    handle: 'legacy',
    gramps_id: '',
    name: '沈无号',
    surname: '沈',
    given: '无号',
    gender: 'M',
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: '',
    spouse_families: [],
  };
  writeTree(loc3);
  const loc3Before = fs.readFileSync(treePath(t3.loc), 'utf8');
  const far3Before = fs.readFileSync(treePath(t3.far), 'utf8');
  const seqB3 = await seqOf();
  await assert.rejects(
    () => addChildNode({ treeId: t3.loc, personHandle: t3.h.locSelf, childHandle: 'legacy', gender: 'M' }),
    (e) => e.status === 400 && /没有全站编号/.test(e.message) && /A-2：镜像不铸号/.test(e.message),
    '真身无号 → 400（文案点明「镜像不铸号」）',
  );
  assert.equal(fs.readFileSync(treePath(t3.loc), 'utf8'), loc3Before, '400 不得写本树');
  assert.equal(fs.readFileSync(treePath(t3.far), 'utf8'), far3Before, '400 不得写真身树');
  assert.equal(await seqOf(), seqB3, '400 不得铸号');
});

