/**
 * casWritePlan 单测 —— cloud CAS 写入决策器（add / guarded / bootstrap 三路分派）
 *
 * 事故回归锚（2026-10-15 生产 POST /admin/create-clan 500）：
 *   云端遗留档 `jiapu_tree_meta._meta` 没有 `version` 字段。旧 `commitCloudCas` 用
 *   `curVersion === 0` 推断「档不存在」⇒ 对**已存在**的 `_meta` 档走 `add({_id,...})` ⇒
 *   CloudBase `_id` 重复必败（catch 吞掉）⇒ 读回 `versionOf(undefined)=0 ≠ 1` ⇒ 返 null
 *   ⇒ 重试耗尽 ⇒ 抛「CAS 变更失败」⇒ 新建祖谱 500。
 *   本文件锁死：**「档存在但无 version」必须走 bootstrap（一次性自举），绝不能是 add**。
 *
 * 全部用例为内存夹具的纯函数调用 + 源码静态断言：对 migrate-output / config 真源零写入。
 * 运行：node --test cloudfunctions/compat-api/lib/cas-write-plan.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 沙箱护栏（凡 import store.js 的测试必须把数据根指到副本）：本文件只用纯函数，不产生任何 IO
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-cas-plan-'));
process.env.COMPAT_META_FILE = path.join(process.env.COMPAT_OUT_DIR, 'tree-meta.json');

const { casWritePlan } = await import('./store.js');

/** 云端 `_meta` 遗留档的现场形态（只读探针实证：keys = _id/_schema/_description/storage_files，无 version） */
const LEGACY_META_DOC = {
  _id: '_meta',
  _schema: '1.1',
  _description: 'jiapu tree meta',
  storage_files: { zhonghua: 'cloud://zhonghua.json' },
};

// ---- ① 档真不存在 → add（首写行为不变） ----

test('① cur=null → add：payload = 完整新建档（含 _id），无条件值', () => {
  const next = { _id: 'jiapu_wallets:p1', version: 1, balance: 100 };
  const plan = casWritePlan(null, next);
  assert.equal(plan.kind, 'add');
  assert.deepEqual(plan.payload, { _id: 'jiapu_wallets:p1', version: 1, balance: 100 });
  assert.equal(plan.version, undefined, 'add 无条件值（按 _id 新建）');
});

// ---- ② 标准 CAS：档存在且 version 为有限数值 → guarded ----

test('② cur={version:5} → guarded：条件值=5（原始值），payload 不含 _id', () => {
  const cur = { _id: 'w1', version: 5, balance: 100, txs: ['a'] };
  const next = { _id: 'w1', version: 6, balance: 101, txs: ['a', 'b'] };
  const plan = casWritePlan(cur, next);
  assert.equal(plan.kind, 'guarded');
  assert.equal(plan.version, 5, '条件值必须是 cur 的原始 version（where({_id, version}) 用）');
  assert.deepEqual(plan.payload, { version: 6, balance: 101, txs: ['a', 'b'] }, 'update 数据体不含 _id');
});

// ---- ③ ★事故回归锚：档存在但无 version 字段（云端 _meta 遗留形态）→ bootstrap，绝不 add ----

test('③ ★事故回归锚：无 version 字段的存量档 → bootstrap（一次性自举），绝不是 add', () => {
  // next 与 mutateDoc 产出同形：curVersion = versionOf(undefined) = 0 → next.version = 0 + 1 = 1
  const next = {
    _id: '_meta',
    version: 1,
    _schema: '1.1',
    _description: 'jiapu tree meta',
    storage_files: { zhonghua: 'cloud://zhonghua.json', huang_40644: 'cloud://huang_40644.json' },
  };
  const plan = casWritePlan(LEGACY_META_DOC, next);
  assert.equal(
    plan.kind,
    'bootstrap',
    '★ 遗留档必须走一次性自举；旧行为（add）撞 _id 重复 → 重试耗尽 → create-clan 500',
  );
  assert.notEqual(plan.kind, 'add');
  assert.deepEqual(
    plan.payload,
    {
      version: 1,
      _schema: '1.1',
      _description: 'jiapu tree meta',
      storage_files: { zhonghua: 'cloud://zhonghua.json', huang_40644: 'cloud://huang_40644.json' },
    },
    'payload 不含 _id（doc(id).update 按 _id 定位），且自带 version=1 —— 自举后档即有数值 version，后续走标准 CAS',
  );
  assert.equal(plan.version, undefined, 'bootstrap 无条件值（无条件写）');
});

// ---- ④ version:0 的存量档（理论上不应存在）→ guarded（条件值=0） ----

test('④ cur={version:0}（存量理论上不应存在）→ guarded，条件值=0；不降级为 add / bootstrap', () => {
  // 归路理由（与 store.js casWritePlan JSDoc 一致）：0 是**真实落库的有限数值**，条件写照样
  // 成立且安全 —— 归 add 会撞 _id 重复（本事故同型），归 bootstrap 会白白丢掉条件保护；
  // 负数同理（条件值取原始值，读回比对 versionOf(back) === curVersion+1 不变）。
  const cur = { _id: 'w2', version: 0, balance: 0 };
  const next = { _id: 'w2', version: 1, balance: 10 };
  const plan = casWritePlan(cur, next);
  assert.equal(plan.kind, 'guarded');
  assert.equal(plan.version, 0, '条件值取原始 0');
  assert.deepEqual(plan.payload, { version: 1, balance: 10 });
});

// ---- ⑤ 非数值 version 形态 → bootstrap（不可靠条件值宁可自举自愈） ----

test('⑤ 非数值 version（string/null/NaN/Infinity）→ bootstrap，绝不 add / 不带病走条件写', () => {
  const next = { _id: 'd1', version: 1, note: 'x' };
  for (const v of ['5', null, NaN, Infinity]) {
    const plan = casWritePlan({ _id: 'd1', version: v }, next);
    assert.equal(plan.kind, 'bootstrap', `version=${String(v)} 必须走 bootstrap`);
    assert.deepEqual(plan.payload, { version: 1, note: 'x' });
  }
});

// ---- ⑥ 纯函数性：不改写入参；cur=undefined 与 null 同判 ----

test('⑥ 决策器不改写 cur / next；cur=undefined 与 null 同判 add', () => {
  const cur = { _id: 'w1', version: 5, balance: 100 };
  const next = { _id: 'w1', version: 6, balance: 101 };
  const curSnapshot = JSON.parse(JSON.stringify(cur));
  const nextSnapshot = JSON.parse(JSON.stringify(next));
  casWritePlan(cur, next);
  assert.deepEqual(cur, curSnapshot, 'cur 不得被改写');
  assert.deepEqual(next, nextSnapshot, 'next 不得被改写');
  assert.equal(casWritePlan(undefined, next).kind, 'add', 'undefined 档 = 不存在 → add');
});

// ---- ⑦ 事故现场完整重放（按 mutateDoc 的收口与 next 构造口径） ----

test('⑦ 现场重放：无 version 的 cur → versionOf 收口 0 → next.version=1 → bootstrap 且 storage_files 增量保留', () => {
  // 与 store.js 的 versionOf 同口径（收口：缺失/非法 → 0）
  const versionOf = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const cur = JSON.parse(JSON.stringify(LEGACY_META_DOC));
  const curVersion = versionOf(cur.version); // 0 —— 旧代码据此误判「档不存在」
  // mutateDoc：base = cur（深拷贝）→ mutator 增量写 storage_files → 强制覆写 _id / version
  const next = JSON.parse(JSON.stringify(cur));
  next.storage_files = { ...next.storage_files, huang_40644: 'cloud://huang_40644.json' };
  next._id = cur._id;
  next.version = curVersion + 1;
  const plan = casWritePlan(cur, next);
  assert.equal(plan.kind, 'bootstrap', '现场形态必须自举成功（不再 500）');
  assert.equal(plan.payload.version, 1, '自举落库 version=1');
  assert.ok(plan.payload.storage_files.huang_40644, 'storage_files 增量保留（新树 fileID 不丢）');
  assert.equal(plan.payload.storage_files.zhonghua, 'cloud://zhonghua.json', '既有条目原样保留');
});

// ---- ⑧ 静态锚：执行侧接线（commitCloudCas / mutateDoc） ----

test('⑧ 静态锚：commitCloudCas 按 plan.kind 分派、不再含 curVersion===0 存在性推断；mutateDoc 必须传 cur', () => {
  const src = fs.readFileSync(path.join(HERE, 'store.js'), 'utf8');
  const commit = src.slice(
    src.indexOf('async function commitCloudCas'),
    src.indexOf('export async function mutateDoc'),
  );
  assert.ok(commit.includes('casWritePlan(cur, next)'), 'commitCloudCas 必须经决策器分派');
  assert.ok(commit.includes("plan.kind === 'add'"), 'add 由档形态判定分派');
  assert.ok(commit.includes("plan.kind === 'guarded'"), 'guarded 由档形态判定分派');
  assert.ok(commit.includes('version: plan.version'), 'guarded 条件值必须用决策器给出的原始 version');
  assert.ok(
    !commit.includes('curVersion === 0'),
    '★ 不得再用 curVersion===0 推断「档不存在」（本事故根因）',
  );
  const mutate = src.slice(
    src.indexOf('export async function mutateDoc'),
    src.indexOf('// ---- 分页列举原语'),
  );
  assert.ok(
    mutate.includes('commitCloudCas(col, docId, curVersion, next, cur)'),
    'mutateDoc 必须把原始档 cur 传入 commitCloudCas',
  );
});
