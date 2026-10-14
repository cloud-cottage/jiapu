/**
 * 在线文谱 · 后记文案「后台可配」单测 —— `lib/wenpu-config.test.js`（node:test 体例）
 *
 * 覆盖（本单冻结契约 · Kevin 2026-10-13 裁定：農曆/渲染只在前端）：
 *   · 默认模板**单串逐字**（含循环块 `{{{…}}}` 与**繁体变量标签** · 去「之年」）；
 *   · **导出面收窄**：后端**无渲染、无農曆**（`renderPostscript` / `pruneEmptyFragments` /
 *     `bigNumOf` / `BIG_NUM_*` / `UNKNOWN_YEAR` 一律不再导出）；
 *   · **校验矩阵**（PUT 必做）：≥2 块 / 未闭合 / 嵌套 / 块外轮段变量 / 未知变量 / **简体标签** ⇒ 400；
 *     块缺失 / 空块 ⇒ **合法**；
 *   · 配置读写：未配置 ⇒ 默认；`setWenpuConfig` CAS 乐观锁（版本冲突 ⇒ 409）；写路径不产 `jiapu_ops_logs`。
 *
 * 数据安全（硬护栏）：`COMPAT_SOURCE=local` + `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 `/tmp` 副本
 * （`lib/store.js` 的沙箱写保护会拒绝写真实 `migrate-output/` 与 `config/tree-meta.json`）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/wenpu-config.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiapu-wenpu-config-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const WPC = await import('./wenpu-config.js');
const store = await import('./store.js');

/** 默认模板逐字（单一真源；含循环块 `{{{…}}}` 与繁体标签；肇创年位后**去「之年」**） */
const DEF = '本族家譜，肇創於{肇創年份}，由{肇創人}始纂。{{{其後{修譜序次}經修輯於{修譜年份}，主司{主司}。}}}今為最新釐正版，是為{當前年份}訂本。願後之族人、續而增修之。';

// ══ ① 默认模板（逐字 · 后端单点真源）+ 导出面收窄 ═══════════════════════════════

test('①-1 默认模板单串逐字（循环块 + 繁体标签 · 去「之年」）', () => {
  assert.equal(WPC.DEFAULT_POSTSCRIPT_TEMPLATE, DEF);
  assert.ok(!DEF.includes('{肇創年份}之年'), '不得残留旧「之年」文');
  assert.ok(DEF.includes('肇創於{肇創年份}，'), '肇创年位后直接接逗号（Kevin 拍定）');
});

test('①-2 循环块常量 + 变量标签（繁体 · 共 6 个）', () => {
  assert.equal(WPC.LOOP_OPEN, '{{{');
  assert.equal(WPC.LOOP_CLOSE, '}}}');
  assert.equal(DEF.split('{{{').length, 2, '默认模板恰含 1 个 `{{{`');
  assert.equal(DEF.split('}}}').length, 2, '默认模板恰含 1 个 `}}}`');
  assert.deepEqual(WPC.POSTSCRIPT_MAIN_VARS, ['肇創年份', '肇創人', '當前年份']);
  assert.deepEqual(WPC.POSTSCRIPT_ROUND_VARS, ['修譜年份', '主司', '修譜序次']);
  assert.equal(WPC.POSTSCRIPT_MAIN_VARS.length + WPC.POSTSCRIPT_ROUND_VARS.length, 6);
});

test('①-3 默认模板自校验通过（默认即合法）', () => {
  assert.equal(WPC.validatePostscriptTemplate(WPC.DEFAULT_POSTSCRIPT_TEMPLATE), true);
});

test('①-4 后端**无渲染、无農曆**：相关导出面一律已移除', () => {
  for (const k of [
    'renderPostscript', 'pruneEmptyFragments', 'bigNumOf',
    'BIG_NUM_DIGITS', 'BIG_NUM_UNITS', 'UNKNOWN_YEAR',
    'ganZhiOf', 'solarToLunarFields', 'lunarYearTextOf',
  ]) {
    assert.equal(WPC[k], undefined, `${k} 不得再导出（渲染/農曆已移出后端）`);
  }
});

// ══ ② 校验矩阵（PUT 必做 · 400） ═════════════════════════════════════════════════

const status400 = (e) => e && e.status === 400;

test('②-1 循环块 ≥2 个 ⇒ 400', () => {
  assert.throws(() => WPC.validatePostscriptTemplate('{{{a}}} 中間 {{{b}}}'), status400);
});

test('②-2 `{{{` / `}}}` 未闭合 ⇒ 400', () => {
  assert.throws(() => WPC.validatePostscriptTemplate('本族家譜{{{其後{修譜序次}。'), status400, '缺 `}}}`');
  assert.throws(() => WPC.validatePostscriptTemplate('本族家譜其後{修譜序次}。}}}'), status400, '多余 `}}}`');
});

test('②-3 循环块嵌套 ⇒ 400', () => {
  assert.throws(() => WPC.validatePostscriptTemplate('{{{A{{{B}}}C}}}'), status400);
});

test('②-4 块内专用变量出现在**块外** ⇒ 400（块内合法）', () => {
  for (const bad of ['{修譜年份}', '{修譜序次}', '{主司}']) {
    assert.throws(() => WPC.validatePostscriptTemplate('本族家譜' + bad + '。'), status400, `块外 ${bad} ⇒ 400`);
  }
  // 同一个块内变量：在块内合法
  assert.equal(WPC.validatePostscriptTemplate('{{{其後{修譜序次}經修輯於{修譜年份}，主司{主司}。}}}'), true);
});

test('②-5 未知变量名 ⇒ 400（两处：块外 / 块内）', () => {
  assert.throws(() => WPC.validatePostscriptTemplate('本族家譜{張三}。'), status400);
  assert.throws(() => WPC.validatePostscriptTemplate('{{{其後{李四}。}}}'), status400);
});

test('②-6 **简体标签 ⇒ 400「未知变量」**（只认繁体 · 不做简繁归一）', () => {
  // 默认串改写：把「肇創人」写简体「肇创人」⇒ 必须 400（不得静默接受）
  assert.throws(() => WPC.validatePostscriptTemplate(DEF.replace('{肇創人}', '{肇创人}')), status400);
  for (const bad of ['{肇创年份}', '{肇创人}', '{当前年份}', '{修谱年份}', '{修谱序次}']) {
    assert.throws(() => WPC.validatePostscriptTemplate('本族家譜' + bad + '。{{{}}}'), status400, `简体 ${bad} ⇒ 400`);
  }
});

test('②-7 循环块缺失 / 为空 ⇒ **合法**（不展开轮段）', () => {
  assert.equal(
    WPC.validatePostscriptTemplate('本族家譜，肇創於{肇創年份}，由{肇創人}始纂。是為{當前年份}訂本。'),
    true,
    '无块 ⇒ 合法',
  );
  assert.equal(WPC.validatePostscriptTemplate('本族家譜，肇創於{肇創年份}。{{{}}}末{肇創人}。'), true, '空块 ⇒ 合法');
});

// ══ ③ 配置读写（`jiapu_wenpu_config` 单档 `global` · CAS） ═══════════════════════

test('③-1 未配置 ⇒ `getWenpuConfig` 返回默认；`getAdminWenpuConfig.is_default = true`（**单键**）', async () => {
  assert.deepEqual(await WPC.getWenpuConfig(), { postscript_template: DEF });
  const admin = await WPC.getAdminWenpuConfig();
  assert.equal(admin.ok, true);
  assert.equal(admin.is_default, true);
  assert.equal(admin.version, 0);
  assert.equal(admin.updated_at, '');
  assert.equal(admin.updated_by, '');
  assert.deepEqual(Object.keys(admin).sort(), [
    'defaults', 'is_default', 'ok', 'postscript_template', 'updated_at', 'updated_by', 'version',
  ].sort());
  assert.deepEqual(admin.defaults, { postscript_template: DEF });
});

test('③-2 `setWenpuConfig` 写入 ⇒ version 自 1 起；读回与出参一致；写路径不产 ops 日志', async () => {
  const custom = '本族家譜，肇創於{肇創年份}，由{肇創人}始纂。{{{其後{修譜序次}修於{修譜年份}，主司{主司}。}}}是為{當前年份}訂本。';
  const r1 = await WPC.setWenpuConfig({
    postscript_template: custom,
    phone: '16601061656',
    now: new Date('2026-10-13T00:00:00.000Z'),
  });
  assert.deepEqual(r1, { ok: true, version: 1 });

  assert.deepEqual(await WPC.getWenpuConfig(), { postscript_template: custom });
  const admin = await WPC.getAdminWenpuConfig();
  assert.equal(admin.version, 1);
  assert.equal(admin.is_default, false);
  assert.equal(admin.updated_at, '2026-10-13T00:00:00.000Z');
  assert.equal(admin.updated_by, '16601061656');
  // 非资产类设定改动 ⇒ **不得写 `jiapu_ops_logs`**
  assert.ok(!fs.existsSync(path.join(TMP, 'collections', 'jiapu_ops_logs.json')), '写路径不得落 `jiapu_ops_logs`');
});

test('③-3 CAS 乐观锁：`version` 与现档不符 ⇒ 409；相符 ⇒ 成功且 version+1；缺省 ⇒ 不校验', async () => {
  const custom = '本族家譜，肇創於{肇創年份}，由{肇創人}始纂。{{{其後{修譜序次}修於{修譜年份}，主司{主司}。}}}是為{當前年份}訂本。';
  // 现档 version = 1（上一用例写入）；用过期 version=0 ⇒ 409
  await assert.rejects(
    () => WPC.setWenpuConfig({ postscript_template: custom, version: 0, phone: 'x' }),
    (e) => e && e.status === 409,
    'version 与现档不符 ⇒ 409 并发冲突',
  );
  // 正确 version=1 ⇒ 成功、version=2
  assert.deepEqual(await WPC.setWenpuConfig({ postscript_template: custom, version: 1, phone: '16601061656' }), { ok: true, version: 2 });
  // 缺省 version ⇒ 不校验、照写（version=3）
  assert.deepEqual(await WPC.setWenpuConfig({ postscript_template: custom }), { ok: true, version: 3 });
  assert.equal((await WPC.getAdminWenpuConfig()).version, 3);
});

test('③-4 写路径入参校验：缺字段 / 空模板 / 块非法 / 简体 ⇒ 400（且不落库）', async () => {
  const before = (await WPC.getAdminWenpuConfig()).version;
  await assert.rejects(() => WPC.setWenpuConfig({}), status400, '缺 postscript_template ⇒ 400');
  await assert.rejects(() => WPC.setWenpuConfig({ postscript_template: '' }), status400, '空模板 ⇒ 400');
  await assert.rejects(() => WPC.setWenpuConfig({ postscript_template: '{{{a}}} {{{b}}}' }), status400, '≥2 块 ⇒ 400');
  await assert.rejects(() => WPC.setWenpuConfig({ postscript_template: '本族家譜{主司}。' }), status400, '块外轮段变量 ⇒ 400');
  await assert.rejects(() => WPC.setWenpuConfig({ postscript_template: '本族家譜{张三}。' }), status400, '未知变量 ⇒ 400');
  await assert.rejects(() => WPC.setWenpuConfig({ postscript_template: '本族家譜{肇创人}。' }), status400, '简体标签 ⇒ 400');
  assert.equal((await WPC.getAdminWenpuConfig()).version, before, '被拒请求不得改动现档');
});

// ══ 附 沙箱自证 ══════════════════════════════════════════════════════════════════

test('附 沙箱自证：测试根在 /tmp 副本，配置档写在副本内、未触真源', () => {
  assert.ok(TMP.startsWith(os.tmpdir()), '测试根必须是 /tmp 副本');
  assert.equal(store.PATHS.out, TMP);
  assert.equal(store.PATHS.metaFile, path.join(TMP, 'tree-meta.json'));
  const cfgFile = path.join(TMP, 'collections', `${WPC.WENPU_CONFIG_COL}.json`);
  assert.ok(fs.existsSync(cfgFile), '配置档应写入副本 collections/');
  assert.ok(cfgFile.startsWith(TMP), '配置档必须在 /tmp 副本内');
});
