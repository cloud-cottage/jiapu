# 祖谱支系入口落点（clan-tree）—— 独立质检报告汇编（Neng · 两轮）

- **质检对象**：祖谱（clan）「支系入口列表」落点呈现面 —— 前端 `frontend/src/business/pedigree.ts`、`frontend/src/components/clan-hall/clan-hall.vue`、`frontend/src/components/tree-pedigree/tree-pedigree.vue`；后端具名变更面 `cloudfunctions/compat-api/lib/{founder-attach.js,child-write.js,marriage.js,branch-clan-ops.js,clan.js,id-resolve.js}` 及 `cloudfunctions/compat-api/index.js`；存量脚本 `scripts/fix-mirror-gramps-ids-2026-10-16.mjs`、`scripts/migrate-clan-registration-edge-2026-10-16.mjs`。
- **质检方**：Neng（独立质检 —— 结论一律由真源归档 + 真身数据 + 独立复算 + 自建判负变异得出，不接受源码扫描 / mock 层覆盖当结论）。
- **本册性质**：历史质检证据汇编，**只追加、不回改**（`AGENTS.md` §0-5）。本册为**首次落盘（新建）**；后续轮次一律追加新节，不改本节任何行。
- **体例**：分节 ① ② ③；每节标明「轮次 + 快照路径 + 数据来源」。

---

## ① 第一轮 —— 预修快照（HEAD `608333734d333bc4e2ce4c684f660d9ca78b44fc` · `git status` 19 项）

**快照路径**：`/tmp/jiapu-qa-snap/jiapu`（副本）；判负变异副本 `/tmp/jiapu-qa-snap/mut`。
**数据来源**：`npm test` / `type-check` 日志（`/tmp/jiapu-qa-snap/npm-test-snap.log`、`/tmp/jiapu-qa-snap/type-check-snap.log`）、真源归档副本、`/tmp/jiapu-qa-snap/probe/` 探针。

### 1.1 交付门槛

| 项 | 命令（快照内） | 读数 |
|---|---|---|
| 套件 | `npm test` | **799 tests / 799 pass / 0 fail / 0 skipped**，**EXIT 0** |
| 类型 | `cd frontend && npm run type-check` | **EXIT 0** |

### 1.2 判负 4 处变异（副本 `/tmp/jiapu-qa-snap/mut`）

- **① 祖谱档回退 founder 截断** ⇒ 探针拓扑 **2 节点 → 1 节点（链断）** ⇒ **必红**。
- **②③④ 三处镜像取真身号回退为铸号**（`founder-attach` / `child-write` / `marriage` / `branch-clan-ops`）⇒ `npm test` **15 红**（立支 8 + 婚姻 5 + A-2 镜像子女 1 + A-2 宗谱登记镜像 1），**全部落在本批具名变更面、零旁溢**。

### 1.3 归因式不动面

14 棵家族树 + `zhonghua`：NEW(`treeKind`) vs OLD(HEAD) `JSON.stringify` 对拍 ⇒ **IDENTICAL ×15，差异树数 = 0**。

### 1.4 A-2 不变量端到端（真源归档副本）

- 认祖 `ji_23395_02 → ji_23395`；镜像号 `000000384` **逐字 = 真身号**；
- 父子边成立（父 = 落点 `mir_103ff661…`，复用既有家族 `1814c122…`，`created=false`）；
- **人号计数器 md5 零变化**（`person.next` 仍 **414**）；
- 同树第二人 `000000277 ≠ 000000384`；
- 落点缺失 / 不在祖谱 ⇒ **400 且两侧零写入**；真身无号 ⇒ **400 且零写入**。

### 1.5 存量脚本 dry-run（副本）

- `fix-mirror-gramps-ids` **EXIT 0**；19 棵树 / 32 条镜像；计划修正 **32 条**（顶端世本段 4 + 登记镜像 3 + 镜像子女 3 + 跨树婚姻 22）+ `tree-meta` 3 处 + 树档顶层 2 处；**撞号违规 0**；重跑输出逐字相同（**幂等**）；目录 md5 前后同值（`d11514ffdcc954b423c4fc71a2249793`）**零写入**；独立复算全站 **324 条人物记录** ⇒ 镜像 32 条、号≠真身号 32 条与脚本逐条一致、**真身不可达 0**。
- `migrate-clan-registration-edge` dry-run **EXIT 0**，待补边 **0**。

### 1.6 真源零写入开工读数

- `config/tree-meta.json` = **`4728046764516172d8e6d584c2b3d7cc`**；
- 归档 `migrate-output` 汇总（`find … -type f -exec md5 -q {} \; | sort | md5`）= **`d35138a4ca8a666dffd82e4488bd287c`**。

### 1.7 残留读数

- `A2NEG-PROBE` **0 命中**；
- `console.log` 仅 `branch-clan-ops.js:982`（**不在本批 diff 内**，预存在）；
- 未用 import **0**；
- 死 CSS **2 条**（`clan-hall.vue:710 .seg-empty` / `:739 .branch-name-line`）。

### 1.8 本轮缺陷（呈现面）· **差集 = 3**

| 级别 | 项 | 判据 |
|---|---|---|
| **阻塞 1** | `registrationMirrors` 数据源取 `info.mirrors`（真源上只含顶端段） | ⇒ **恒空** |
| **阻塞 2** | 兜底判据 `drawn.has(b.founder_handle)`（家族树真身 handle vs 祖谱 handle 集） | ⇒ **恒 false** ⇒ 每支系恒进兜底列表且与 foot-line 自相矛盾 |
| 非阻塞 1 | 支系始祖姓名 `founder_name` 全页无呈现 | 全页无该字段输出 |
| 非阻塞 2 | 死 CSS ×2 | 见 1.7 |

### 1.9 本轮未测面

guest 视角看不到 depth≥2 登记镜像 ⇒ 链的目视验收只能在生产 / 登录态；iOS 长按与真机触屏；小程序产物与主包体积；云函数据包与部署读数；前端**零自动化回归网**（判负①无用例可红）；收工 md5 未复取。

---

## ② 第二轮 —— 修后快照（HEAD 同上 · `git status` **25 项**）

**快照路径**：`/tmp/jiapu-qa-r2/repo`。
**数据来源**：`/tmp/jiapu-qa-r2/probe/{probe-landing-audit.mjs, pedigree-new.mjs, pedigree-mut1..4.mjs}`；输出 `/tmp/jiapu-qa-r2/out-{new,mut1,mut2,mut3,mut4,old}.txt`；`/tmp/jiapu-qa-r2/npm-test.log`、`/tmp/jiapu-qa-r2/type-check.log`。

### 2.1 落地审计探针（按修后现证形状重建）

打包 `pedigree-new.mjs` md5 **`3ac9c68b6622c287fe9496a2e32e5109`** + 真源归档 4 祖谱 + 真源 `config/tree-meta.json` ⇒ `node probe-landing-audit.mjs --variant=new` = **66/66 断言通过，差集合计 = 0，EXIT 0** ⇒ **阻塞 1 / 阻塞 2 关账**。

### 2.2 逐项现证

- `registrationMirrors` 逐树 = **gu / ji / qin 各 1、liu 0**（= 支系行数），且 `tree_id` 集 = 后端 `clanBranchRegistrations` 集。
- 三条登记镜像注记**五要素齐**（逐字）：
  - 顾清学 `badge 顾氏安达家族 · 25 人 · 只读` / `founderText 始祖：顾清学` / `openTreeId gu_39038_01` / `anchorText 挂于 姒期视（000000138）之下` / `chipLabel 📂 打开〈顾氏安达家族〉`；
  - 季花「季氏费县白露家族 · 58 人 · 始祖：季花 · 挂于 季行父（000000162）之下」；
  - 秦老太爷「秦氏鸡西家族 · 2 人 · 始祖：秦老太爷 · 挂于 秦某（000000290）之下」。
  - 人数经**独立复算相符**。
- `offGraphEntries` branch 行 = **0**（不再恒等支系数），与 foot-line 互斥断言通过。

### 2.3 判负 5 变异体（全必红）

| 变异 | 含义 | 读数 |
|---|---|---|
| `mut1` | 数据源回退（`info.mirrors`） | **20 红 / 差集 3** |
| `mut2` | 兜底判据回退 `branch.founder_handle` | **3 红** |
| `mut3` | 注记判据回退句柄 | **7 红 / 差集 3** |
| `mut4` | chip 末行阈值回退 | **2 红** |
| `old` | 上轮原证形状 | **12 红**，复现 `registrationMirrors=0` / 兜底 branch=1 / 差集 3 |

### 2.4 口径边界（**必写**）

chip 命中带修正（按实际行序）在真源 4 谱上**不可观测**（3 张登记镜像卡均 6 行、chip 恰末行，旧阈值 43 与新口径 `dy=55` 皆命中）⇒ 判别力来自**合成卡**（7 行 = 真源卡 + 1 配偶行：旧口径 chip 行行心 `dy=44` 点不中、配偶行 `dy=66` 被误判命中；新口径两者皆正）⇒ 该缺陷属**潜伏 / 预防性**，非现网可观测。

### 2.5 交付门槛（修后）

`npm test` = **807 tests / 807 pass / 0 fail**，**EXIT 0**（`/tmp/jiapu-qa-r2/npm-test.log`）；`type-check` **EXIT 0**（`/tmp/jiapu-qa-r2/type-check.log`）。

### 2.6 残留读数

死 CSS **0**；`A2NEG-PROBE` **0**；被检三件 `console.*` **0**。映射保真：真源扁平 `external_*` **6 键**；前端 `PersonSummary` 声明 **4 项 ⊆ 真源、0 缺项**；7 字段投影 **0 失真**。

---

## ③ 缺陷分级 / 收工自证 / 未测面

### 3.1 缺陷分级（两轮合并）

| 级别 | 项 | 现状 |
|---|---|---|
| **阻塞 1** | `registrationMirrors` 恒空 | **关账**（§2.1，66/66） |
| **阻塞 2** | 兜底判据恒 false | **关账**（§2.1，66/66） |
| 非阻塞 1 | 支系始祖姓名 `founder_name` 无呈现 | 已并入注记五要素（`founderText`） |
| 非阻塞 2 | 死 CSS ×2 | **关账**（§2.6 死 CSS = 0） |
| **潜伏（预防性）** | chip 命中带口径 | 已修（§2.4，真源不可观测，判别力来自合成卡） |

### 3.2 收工真源 md5 复取（与 ① 开工值同值 ⇒ 真源零写入自证）

| 项 | 开工（§1.6） | 收工复取 | 结论 |
|---|---|---|---|
| `config/tree-meta.json` | `4728046764516172d8e6d584c2b3d7cc` | `4728046764516172d8e6d584c2b3d7cc` | **同值** |
| 归档 `migrate-output` 汇总 | `d35138a4ca8a666dffd82e4488bd287c` | `d35138a4ca8a666dffd82e4488bd287c` | **同值** |

### 3.3 未用 import 自查（补跑，闭合 §2 未测项）

命令：`node /tmp/jiapu-qa-r2/probe/check-imports.mjs frontend/src/business/pedigree.ts frontend/src/components/clan-hall/clan-hall.vue frontend/src/components/tree-pedigree/tree-pedigree.vue`

| 被检件 | import 标识符 | 未被使用 |
|---|---|---|
| `frontend/src/business/pedigree.ts` | 5 | **0** |
| `frontend/src/components/clan-hall/clan-hall.vue` | 34 | **0** |
| `frontend/src/components/tree-pedigree/tree-pedigree.vue` | 20 | **0** |

**EXIT 0** ⇒ 静态级未用 import = 0。**边界**：该脚本为文本级启发式（非编译器），与 `vue-tsc` / eslint 不等价 —— `frontend/tsconfig.json` 无 `noUnusedLocals`、仓内无 eslint ⇒ `type-check` 不覆盖未用 import，本自查为其**替代读数**（脚本 md5 `cbfaa1ad8755d92cfbc55747e9747a8e`）。

### 3.4 未测面（跨两轮合并登记）

- guest 视角 depth≥2 登记镜像**目视**（链的目视验收只能在生产 / 登录态）；
- iOS 长按 / 真机触屏；小程序产物与主包体积；云函数据包与部署读数；
- 前端**零自动化回归网** —— 判负 ②③④ 的 15 个红点由**后端套件**覆盖，非前端用例；chip 口径判别力来自**合成卡**而非真源现证（§2.4）。

---

> **复现入口（只读）**：`node /tmp/jiapu-qa-r2/probe/probe-landing-audit.mjs --variant=new`（66/66）；`npm test`（807/0）；`cd frontend && npm run type-check`。
> **本册不回改**：新结论一律追加新节；与实现冲突时**以实现为准**（`AGENTS.md` §0-1）。
