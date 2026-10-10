/**
 * 镜像内容读侧派生（方案 A）—— 契约 docs/mirror-content-derivation.spec.md
 *
 * 口径（Kevin 2026-10-10 拍定）：镜像节点（`String(external_mirror) === 'true'` 且 `external_person_handle`
 * 齐备）在**读路径**上把**身份类 7 字段**（name/surname/given/gender/birth_date/death_date/is_living）与
 * **称号类 5 属性**（封号/谥号/号/称号/称号色）**以真身为准**合并；**不派生**出生地 / 居住地（契约 v2 C6
 * 本树自填）、external_* 指针、handle/gramps_id/parent_family/spouse_families（结构以本树为准）；
 * 真身不可达（孤儿镜像）⇒ 回退镜像本树副本（现状行为）；**只读不写回**（树 version / updated_at 不变）。
 *
 * 覆盖（≥6 例）：
 *   D1 marriage 型镜像 + 真身有值 ⇒ 读出 name / birth_date / 称号 == 真身；
 *   D2 镜像 birth_place / residence_places == 镜像本树值（不派生）；
 *   D3 孤儿镜像（无 external_tree / 真身树缺 / 真身 handle 不在）⇒ 回退镜像副本（不报错）；
 *   D4 真身值为空 ⇒ 派生后为空（严格以真身为准）；
 *   D5 真身日期非 ISO（`3月13,1958` / `BET EST 2005 AND 2010`）⇒ 照真身原文；
 *   D6 只读：调读接口后真源树 JSON md5 / version 不变（副本 + 真源双向体检）。
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本；真源只读复制，文末断言真源未变。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/mirror-derive.test.js
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
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-mirror-derive-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

// ---- 沙箱目录 ----
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2));
const writeTree = (tree) => writeJson(path.join(TMP, 'trees', `${tree.tree_id}.json`), tree);
const writeDetail = (tree_id, handle, obj) =>
  writeJson(path.join(TMP, 'details', `${tree_id}:${handle}.json`), { _id: `${tree_id}:${handle}`, tree_id, handle, ...obj });
const writeCol = (col, docs) => {
  const obj = {};
  for (const d of docs) obj[d._id || `k_${Object.keys(obj).length}`] = d;
  writeJson(path.join(TMP, 'collections', `${col}.json`), obj);
};

// ---- 真源只读副本：ji_23395_01（镜像 I000253 → 真身 shen_27784_01，非 ISO 日期）----
for (const tid of ['ji_23395_01', 'shen_27784_01']) {
  fs.copyFileSync(path.join(REAL_TREES, `${tid}.json`), path.join(TMP, 'trees', `${tid}.json`));
  for (const f of fs.readdirSync(REAL_DETAILS)) {
    if (f.startsWith(`${tid}:`)) fs.copyFileSync(path.join(REAL_DETAILS, f), path.join(TMP, 'details', f));
  }
}
const REAL_JI = 'ji_23395_01';
const JI_MIRROR_HANDLE = '4fb0172be158d263afc1319d'; // I000253 沈伟（marriage 型镜像）
const SHEN_TREE = 'shen_27784_01';

// ---- 夹具：真身树 mreal（含一个「值为空」的真身 hr2）----
writeTree({
  tree_id: 'mreal',
  version: 7,
  updated_at: '2026-01-01T00:00:00.000Z',
  people: {
    hr1: {
      handle: 'hr1', gramps_id: 'R1', name: '真身甲', surname: '甄', given: '甲', gender: 'M',
      // 非 ISO + BET 形态（裁定：照真身原文派生，不转换 / 不校验）
      birth_date: '3月13,1958', death_date: 'BET EST 2005 AND 2010', is_living: false,
      birth_place: { origin_code: '230305', note: '真身出生地' },
      residence_places: [{ origin_code: '110000' }],
    },
    hr2: {
      handle: 'hr2', gramps_id: 'R2', name: '', surname: '', given: '', gender: '', is_living: true,
    },
  },
  families: {},
});
writeDetail('mreal', 'hr1', {
  attributes: [
    { key: '谥号', value: '真谥', type: '谥号' },
    { key: '称号', value: '真称号', type: '称号' },
    { key: '称号色', value: 'red', type: '称号色' },
    { key: 'RIN', value: 'RIN-REAL', type: 'RIN' },
  ],
});
writeDetail('mreal', 'hr2', { attributes: [] });

// ---- 夹具：镜像所在树 mtest ----
writeTree({
  tree_id: 'mtest',
  version: 3,
  updated_at: '2026-01-02T00:00:00.000Z',
  people: {
    // hm1：marriage 型镜像 → 真身 hr1（真身有值）
    hm1: {
      handle: 'hm1', gramps_id: '000900001', name: '镜像甲', surname: '镜', given: '甲', gender: 'F',
      birth_date: '1958-03-13', death_date: '2010-02-02', is_living: false,
      birth_place: { origin_code: '310000', note: '镜像出生地' },
      residence_places: [{ origin_code: '310000' }, { origin_code: '440000' }],
      external_mirror: 'true', external_tree: 'mreal', external_person_handle: 'hr1',
      external_link_type: 'marriage', external_marriage_no: '1',
    },
    // hm2：镜像 → 真身 hr2（真身值全空）
    hm2: {
      handle: 'hm2', gramps_id: '000900002', name: '镜像乙', surname: '镜', given: '乙', gender: 'M',
      birth_date: '1990-01-01', death_date: '2000', is_living: false,
      residence_places: [{ origin_code: '310000' }],
      external_mirror: 'true', external_tree: 'mreal', external_person_handle: 'hr2',
      external_link_type: 'marriage',
    },
    // hm3：孤儿镜像（无 external_tree）
    hm3: {
      handle: 'hm3', gramps_id: '000900003', name: '孤儿丙', surname: '孤', given: '丙', gender: 'M',
      birth_date: '1900-01-01', is_living: true,
      external_mirror: 'true', external_tree: '', external_person_handle: 'X9',
      external_link_type: 'marriage',
    },
    // hm4：真身树缺（external_tree 指向不存在的树）
    hm4: {
      handle: 'hm4', gramps_id: '000900004', name: '幽灵丁', surname: '幽', given: '丁', gender: 'M',
      birth_date: '1901-01-01', is_living: true,
      external_mirror: 'true', external_tree: 'no_such_tree', external_person_handle: 'ZZ',
      external_link_type: 'marriage',
    },
    // hm5：真身 handle 不在（真身树在，但节点不存在）
    hm5: {
      handle: 'hm5', gramps_id: '000900005', name: '缺身戊', surname: '缺', given: '戊', gender: 'M',
      birth_date: '1902-01-01', is_living: true,
      external_mirror: 'true', external_tree: 'mreal', external_person_handle: 'NOT_THERE',
      external_link_type: 'marriage',
    },
  },
  families: {},
});
writeDetail('mtest', 'hm1', {
  attributes: [
    { key: '号', value: '镜像号', type: '号' },
    { key: '封号', value: '镜像封', type: '封号' },
    { key: 'RIN', value: 'RIN-MIRROR', type: 'RIN' },
    { key: '_UID', value: 'UID-MIRROR', type: '_UID' },
  ],
});
writeDetail('mtest', 'hm2', { attributes: [{ key: '号', value: '镜像号乙', type: '号' }] });
writeDetail('mtest', 'hm3', { attributes: [{ key: '号', value: '孤儿号', type: '号' }] });

// ---- meta 副本（现有读数用真源 + 夹具登记；getTree local 不查 meta，登记仅求稳妥）----
const metaCopy = JSON.parse(fs.readFileSync(REAL_META, 'utf8'));
metaCopy.trees.mtest = { tree_id: 'mtest', kind: 'clan', display_title: '镜像测试谱' };
metaCopy.trees.mreal = { tree_id: 'mreal', kind: 'clan', display_title: '真身测试谱' };
writeJson(process.env.COMPAT_META_FILE, metaCopy);

// ---- 权限夹具：chief_editor（对任意非总谱树 full 可见，绕开 guest 裁剪）----
const CHIEF = '13800007001';
writeCol('jiapu_users', [{ _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' }]);

const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');
const bearer = (phone = CHIEF, role = 'chief_editor') => ({
  authorization: 'Bearer ' + signJwt({ sub: phone, phone, role }, 3600),
});
const call = (p, { method = 'GET', headers = {}, query, body } = {}) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: query,
    body: body ? JSON.stringify(body) : undefined,
  });
const getPerson = async (treeId, handle) => {
  const res = await call(`/people/${handle}`, { headers: { 'X-Tree-Id': treeId, ...bearer() } });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};
const listPeople = async (treeId) => {
  const res = await call('/people', { headers: { 'X-Tree-Id': treeId, ...bearer() } });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};
/** 属性表 → { key: value }（`attribute_list` 是 [{ type, value }]） */
const attrMap = (raw) => {
  const m = {};
  for (const a of raw.attribute_list || []) m[a.type] = a.value;
  return m;
};
const findGid = (arr, gid) => arr.find((p) => p.gramps_id === gid);

// ================= D1. marriage 型镜像 + 真身有值 ⇒ 读出 == 真身 =================

test('D1 marriage 型镜像 + 真身有值：name / birth_date / 称号 均以真身为准', async () => {
  const { status, body } = await getPerson('mtest', 'hm1');
  assert.equal(status, 200);
  // 姓名：真身「甄甲」覆盖镜像「镜像甲 / 镜甲」
  assert.equal(body.primary_name.first_name, '甲');
  assert.equal(body.primary_name.surname_list.find((s) => s.primary).surname, '甄');
  // 性别：真身 'M' ⇒ 1（镜像原为 'F' ⇒ 2）
  assert.equal(body.gender, 1);
  // 生卒：照真身原文（非 ISO；D5 同源断言见下）
  assert.equal(body.profile.birth.date, '3月13,1958');
  assert.equal(body.profile.death.date, 'BET EST 2005 AND 2010');
  assert.equal(body.is_living, false);
  // 称号：删镜像的 号/封号（真身无此二项）→ 插真身的 谥号/称号/称号色
  const m = attrMap(body);
  assert.equal(m['谥号'], '真谥');
  assert.equal(m['称号'], '真称号');
  assert.equal(m['称号色'], 'red');
  assert.equal(m['号'], undefined, '镜像自有「号」应被删除（真身无「号」）');
  assert.equal(m['封号'], undefined, '镜像自有「封号」应被删除（真身无「封号」）');
  // 其它 key 保留镜像本树值（不得整数组覆盖）
  assert.equal(m['RIN'], 'RIN-MIRROR');
  assert.equal(m['_UID'], 'UID-MIRROR');
  // 结构 / 指针字段不动
  assert.equal(body.gramps_id, '000900001');
  assert.equal(m['external_tree'], 'mreal');
  assert.equal(m['external_person_handle'], 'hr1');
  assert.equal(m['external_link_type'], 'marriage');
});

// ================= D2. 出生地 / 居住地 == 镜像本树值（不派生）=================

test('D2 出生地 / 居住地取镜像本树值，不派生（契约 v2 C6）', async () => {
  // 合成：真身 hr1 birth_place=230305 / residence=[110000]；镜像 hm1 = 310000 / [310000,440000]
  const s = await getPerson('mtest', 'hm1');
  assert.equal(s.body.profile.birth.place_code, '310000', '出生地取镜像本树值');
  assert.equal(s.body.profile.birth.place_note, '镜像出生地');
  assert.deepEqual(
    s.body.residence_places.map((r) => r.place_code),
    ['310000', '440000'],
    '居住地取镜像本树值（顺序不变）',
  );
  // 真源：ji 镜像 I000253 residence = [{230305},{130302}]（非真身 shen 的 [130302]）
  const l = await listPeople(REAL_JI);
  const jiMirror = findGid(l.body, '000000253');
  assert.ok(jiMirror, 'ji_23395_01 应含镜像 I000253');
  assert.deepEqual(
    jiMirror.residence_places.map((r) => r.place_code),
    ['230305', '130302'],
    'I000253 居住地仍为镜像本树值',
  );
  assert.equal(jiMirror.profile.birth.place_code, '230305', 'I000253 出生地仍为镜像本树值');
});

// ================= D3. 孤儿镜像 ⇒ 回退镜像本树副本 =================

test('D3 孤儿镜像（无 external_tree / 真身树缺 / 真身 handle 不在）⇒ 回退镜像副本，不报错', async () => {
  // hm3 无 external_tree
  const a = await getPerson('mtest', 'hm3');
  assert.equal(a.status, 200);
  assert.equal(a.body.primary_name.surname_list.find((s) => s.primary).surname, '孤');
  assert.equal(a.body.profile.birth.date, '1900-01-01');
  assert.equal(attrMap(a.body)['号'], '孤儿号', '回退保留镜像自有「号」');

  // hm4 真身树缺
  const b = await getPerson('mtest', 'hm4');
  assert.equal(b.status, 200);
  assert.equal(b.body.primary_name.first_name, '丁');
  assert.equal(b.body.profile.birth.date, '1901-01-01');

  // hm5 真身 handle 不在
  const c = await getPerson('mtest', 'hm5');
  assert.equal(c.status, 200);
  assert.equal(c.body.primary_name.first_name, '戊');
  assert.equal(c.body.profile.birth.date, '1902-01-01');

  // 列表出口同样不因孤儿镜像而失败
  const l = await listPeople('mtest');
  assert.equal(l.status, 200);
  assert.ok(Array.isArray(l.body) && l.body.length === 5);
});

// ================= D4. 真身值为空 ⇒ 派生后为空（严格以真身为准）=================

test('D4 真身值为空 ⇒ 严格以真身为准（该空就空）', async () => {
  // hm2 → 真身 hr2 全部为空：姓名空、无生卒、无称号、性别未知(0)、健在 true
  const { status, body } = await getPerson('mtest', 'hm2');
  assert.equal(status, 200);
  assert.equal(body.primary_name.first_name, '');
  assert.equal(body.primary_name.surname_list.find((s) => s.primary).surname, '');
  assert.equal(body.profile.birth, undefined, '真身无生年 ⇒ 无 profile.birth');
  assert.equal(body.profile.death, undefined, '真身无卒年 ⇒ 无 profile.death');
  assert.equal(body.is_living, true);
  assert.equal(body.gender, 0, "真身 gender 空 ⇒ 未知(0)");
  assert.equal(attrMap(body)['号'], undefined, '真身无「号」⇒ 镜像「号」被清');
});

// ================= D5. 真身日期非 ISO ⇒ 照真身原文 =================

test('D5 真身日期非 ISO（3月13,1958 / BET EST 2005 AND 2010）⇒ 照真身原文，不转换不校验', async () => {
  // 真源：ji 镜像 I000253 → 真身 shen I000276（原 1958-03-13 / 2010-02-02，真身非 ISO）
  const l = await listPeople(REAL_JI);
  const jiMirror = findGid(l.body, '000000253');
  assert.ok(jiMirror, 'ji_23395_01 应含镜像 I000253');
  assert.equal(jiMirror.profile.birth.date, '3月13,1958');
  assert.equal(jiMirror.profile.death.date, '2月2,2010');
  // 单对象出口同样派生（同一 toRawPerson）
  const one = await getPerson(REAL_JI, JI_MIRROR_HANDLE);
  assert.equal(one.status, 200);
  assert.equal(one.body.profile.birth.date, '3月13,1958');
  assert.equal(one.body.profile.death.date, '2月2,2010');
  // 真身称号（谥号=小炜）随派生出现；镜像原有「号=和平」由真身同值补回
  const m = attrMap(one.body);
  assert.equal(m['谥号'], '小炜');
  assert.equal(m['号'], '和平');
  // 合成夹具：BET 形态
  const s = await getPerson('mtest', 'hm1');
  assert.equal(s.body.profile.death.date, 'BET EST 2005 AND 2010');
});

// ================= D6. 只读：读接口后树 md5 / version 不变 =================

test('D6 只读铁律：调读接口后（副本 + 真源）树 JSON md5 / version 均不变', async () => {
  const sandboxJi = path.join(TMP, 'trees', `${REAL_JI}.json`);
  const sandboxShen = path.join(TMP, 'trees', `${SHEN_TREE}.json`);
  const realJi = path.join(REAL_TREES, `${REAL_JI}.json`);
  const realShen = path.join(REAL_TREES, `${SHEN_TREE}.json`);
  const snap = (p) => ({ md5: md5(p), version: JSON.parse(fs.readFileSync(p, 'utf8')).version });
  const before = {
    sandboxJi: snap(sandboxJi), sandboxShen: snap(sandboxShen),
    realJi: snap(realJi), realShen: snap(realShen),
  };

  // 三个读出口（列表 / 单对象 / 搜索）各调一次，覆盖派生路径
  await listPeople(REAL_JI);
  await getPerson(REAL_JI, JI_MIRROR_HANDLE);
  await call('/search', { headers: { 'X-Tree-Id': REAL_JI, ...bearer() }, query: { query: '沈伟', profile: 'all' } });
  await listPeople('mtest');
  await getPerson('mtest', 'hm1');

  const after = {
    sandboxJi: snap(sandboxJi), sandboxShen: snap(sandboxShen),
    realJi: snap(realJi), realShen: snap(realShen),
  };
  assert.deepEqual(after, before, '读接口后副本与真源树 md5 / version 均不得变');
  assert.equal(after.sandboxJi.version, before.sandboxJi.version, 'version 不变');
});

// ================= D7. 真源体检（末位）=================

test('D7 真源未被改动：config/tree-meta.json + migrate-output/{trees,details,collections} 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 真源 md5 不得变化');
  const trees = dirBaseline(REAL_TREES);
  const details = dirBaseline(REAL_DETAILS);
  const cols = dirBaseline(REAL_COLLECTIONS);
  for (const [f, h] of realTreeBaseline) assert.equal(trees.get(f), h, `trees/${f} 不得变化`);
  for (const [f, h] of realDetailBaseline) assert.equal(details.get(f), h, `details/${f} 不得变化`);
  for (const [f, h] of realColBaseline) assert.equal(cols.get(f), h, `collections/${f} 不得变化`);
  assert.ok(TMP.startsWith(os.tmpdir()), '沙箱目录必须在 /tmp 下');
});
