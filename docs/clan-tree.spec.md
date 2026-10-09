# 祖谱（Clan Tree）规格

> 内部代号 clan = 产品术语【祖谱】（标识符 / 文件名 / 路由 / 集合名 / kind 值保持不变）

状态：**设计已确认 Kevin 2026-09-15 · 待实施**
> 关联：`docs/founder-attach.spec.md`（同一原语）、`docs/marriage.spec.md`、`docs/data-model.md`、`docs/tree-id.spec.md`（tree_id 生成口径）、`docs/PENDING_DEPLOY.md`

## 1. 一句话

在「中华世本（总谱）」与「普通家族树」之间新增一层 **祖谱**（按姓 / 支系，可多个）：
祖谱始祖是**世本节点的镜像**，祖谱顶端是**世本世系链的镜像段**（只读），
其下为祖谱**自有世代**；普通家族树的始祖是**祖谱节点的镜像**。
**普通树不得跳过祖谱直挂世本。**

```
中华世本 zhonghua
   │  祖谱始祖 = 世本节点镜像（link_type='founder'）
   ▼
祖谱（kind='clan'）  例：季氏祖谱 ji_23395
   ├─ 顶端链镜像段：季孙子 → … （link_type='chain'，只读）
   └─ 自有支系段：季花 及以下（祖谱自有真人，可编辑/续编）
   ▼  普通树始祖 = 祖谱节点镜像（link_type='founder'）
普通家族树（kind='family'） ji_23395_01 …
```

## 2. 术语与层级字段

| 项 | 值 |
|---|---|
| `tree-meta.trees[*].kind` | `'master'`（zhonghua）/ `'clan'`（祖谱）/ `'family'`（普通树）；缺省按 `'family'` 兼容旧数据 |
| 祖谱字段 | `surname`（如 `季`）、`master_tree_id='zhonghua'`、`master_handle`（始祖指向的世本节点）、`founder_handle`（祖谱自有支系的下端点 = 各普通树认祖的落点，如 `季花`） |
| 普通树字段 | `clan_tree_id`、`clan_handle`（其始祖指向的祖谱节点） |

## 3. 已确认口径（Kevin 2026-09-15）

1. **顶端链中间节点 = 世本镜像、只读**（世本唯一真相）；祖谱的自有真实数据从链路下端点（如 `季花`）开始，此后可自行向下续编支系。
2. **普通树不可跳过祖谱直挂世本**：必须先建立祖谱（内容再少也要建），认祖 target 只能是 `kind='clan'` 的树。
3. **始祖唯一性按"世本节点 × 姓"**：同一世本节点在**同姓**祖谱中只能被**一支**认作始祖；**不同姓**的祖谱可多支共享同一世本节点（赐姓/改姓等，不罕见）。
4. **祖谱创建 = 申请制**：该姓现有树 steward / chief_editor 发起 → chief_editor 审批 → 建树。
5. **祖谱页面版式**（独立于普通树首页）：顶部「世系链（世本镜像段，只读）」→ 中部「本宗自有世代」→ 底部「**支系入口列表**」（所有认此祖谱为祖的普通家族树，可点进）。
6. 统计口径：祖谱的人**不计入**世本人数/世数；普通树的人**不计入**祖谱；支系列表可显示各树人数。
7. 镜像与只读：位于任一层上方的镜像节点在本层内**整节点只读**（沿用 `founder-attach.spec` §5），要改到其真身所在层。

## 4. 数据结构

### 4-1 祖谱顶端（镜像段）

```
person: { gramps_id, external_tree: 'zhonghua', external_person_handle: <世本 handle>,
          external_link_type: 'founder' | 'chain', external_mirror: 'true',
          external_relation_note: '<真身姓名>（中华世本 · 第 N 世）' }
```
- 首个（最高）节点 = 始祖，`link_type='founder'`；其下链路节点 = `'chain'`。
- 均为只读镜像，本层不落独立身份数据（姓名/生卒为展示副本，真身为准）。

### 4-2 祖谱自有段

`季花` 及以下为祖谱自有真人节点（`external_*` 为空），可编辑、可续编、可再被普通树认祖。

### 4-3 普通树始祖

始祖节点 = 指向祖谱节点的镜像（`external_tree='<祖谱 tree_id>'`、`external_link_type='founder'`、`external_mirror='true'`），整节点只读；除始祖外本树任何节点可编辑。

### 4-4 集合

- `jiazu_clan_requests`（新建，需并入部署清单）：`{ _id, surname, tree_id?, master_handle, master_name, clan_title, requested_by, status: 'pending'|'approved'|'rejected', decided_by, reject_reason, created_at, decided_at }`

## 5. 操作

| 操作 | 入口 | 权限 | 规则 |
|---|---|---|---|
| 建谱申请 | 「我的 / 家族树管理」或该姓现有树档案 →「申请建立祖谱」 | 该姓现有树 steward / chief | 写 pending；审批通过后建树（`kind='clan'`），并写入始祖镜像 |
| 建谱审批 | 「家族消息」/ 管理工作台 | chief_editor | 通过 → 校验 §3-3 唯一性 → 建树 + `updateTrees`；驳回不改数据 |
| 祖谱认祖（对世本） | 祖谱始祖节点 →「认祖（挂到中华世本）」 | 祖谱 steward / chief | 复用 `founder-attach` 申请制；target 必须是 `kind='master'` |
| 普通树认祖（对祖谱） | 普通树始祖节点 →「认祖（挂到祖谱）」 | 本树 steward / chief | 复用 `founder-attach`；target 必须是 `kind='clan'`；**禁止** target=`kind='master'` |
| 解除挂载 | 双方均可 | 本层 steward / chief | 无需申请，立即生效；解除后始祖回到**空白占位**态（不可直挂世本，需重新认祖到某祖谱） |
| 祖谱与世本解除 | 祖谱始祖节点 / 世本真身节点 | 同上 | 顶端镜像段清空、祖谱**自有段保留**；页面提示「该祖谱未认祖世本」 |

## 6. URL 与 tree_id

- 祖谱 URL：`/z/<tree_id>`；普通树保持现状（`/<tree_id>`）。
- `kind` 决定前端版式；路由只认 `tree_id`，层级由 tree-meta 判定。
- **`tree_id` 生成口径**：`<姓氏拼音>_<汉字 Unicode 十进制码点>_<两位支派序号>`（例 `ji_23395_01`）；祖谱为**无序号基形** `<拼音>_<码点>`（例 `ji_23395`），冲突时才追加 `_NN`。注音唯一真源 = `cloudfunctions/compat-api/lib/tree-write.js` 的 `surnamePinyin()`（`pinyin-pro` 姓氏模式：曾→zeng、单→shan；`v:true` → 吕→lv），**任何情况不得兜底**（空串 / 非单个汉字 / 取不到拼音一律 **400 抱错拒绝**，绝不生成伪前缀）；tree-meta 条目另存 `surname_pinyin` 记录实际采用的拼音。
  → **完整口径（含 3 棵树原地迁移不留别名、遗留注音副本登记、未完成口径）见 `docs/tree-id.spec.md`；本册不重述。**

## 7. 实施清单

- **P1** `tree-meta.kind` + 建谱申请/审批 + 祖谱建树（始祖镜像 + tree_id 规范 + `/z/<id>` 路由与页面骨架）
- **P2** 祖谱认祖世本（顶端链镜像段：`founder` + `chain`，只读校验）
- **P3** 普通树认祖祖谱（`founder-attach` 的 target 泛化为"任意上层树"，加 §3-2/§3-3 校验）
- **P4** 祖谱页面三段版式（镜像链只读 / 自有世代 / 支系入口列表）+ 统计口径 + 文档与部署清单
- **并入 P3 一起做**（`founder-attach` 剩余项）：认祖**选择器**（按 target 层级搜索：祖谱/世本）、`family-messages` 的**认祖 + 建谱**待办、`tree-pedigree` 隐藏规则收紧（仅孤立占位隐藏）

## 8. 测试与约束

- 单测/路由测：建谱唯一性（同姓同世本节点第二次 → 400；异姓可共享）、禁止直挂世本（target=master → 400）、镜像只读 403、解除回空白占位、统计不计入。
- 写测试只用 `COMPAT_OUT_DIR` → `/tmp` 副本，并断言 `migrate-output/` 真实树与 `config/tree-meta.json` 的 md5 未变。
- 保持 `npm test` 全绿（当前 92 pass / 0 fail），新测试文件需注册进 `package.json` 的 `scripts.test`。
- 前端 `npx vue-tsc --noEmit` 必须 exit 0。

## 9. 待确认的默认口径（按此实现，如不符一句话即可改）

- 祖谱与世本解除挂载后：**保留祖谱自有段**，仅清空顶端镜像段（不整树清空）。
- 建谱申请通过后，祖谱的 `founder_handle` 可暂为空（此时"支系入口列表"为空，允许后续在祖谱内续编后再被认祖）。

## 10. 与【立支】/【汇宗】的关系（引用，2026-09-17）

> 本节只作**引用**：两条操作的完整口径（前置、结构动作、宗谱登记、扣费与折损、权限、拒绝矩阵、接口契约）一律以 `docs/branch-clan-ops.spec.md` 为准，本节不重述数值、不另立契约。

- **支系入口列表的推导扩展**：除「某普通树始祖镜像的 `external_tree` = 本祖谱」这条既有推导外，宗谱**自有段**里 `external_link_type='founder'` 的**宗谱登记镜像**（立支写入，见 `docs/branch-clan-ops.spec.md` §5-3 / §6-1-6）也按其 `external_tree` 计入支系入口 —— 否则立支后原树与新树不会出现在列表里。
- **普通树始祖可以是真实节点**：立支后原树始祖 = **N 真身**（非镜像、无 `external_*`），§4-3「始祖节点 = 镜像」只描述**认祖后的镜像态**；镜像是只读态、真实节点始祖仍可编辑。立支还要求本树已有宗谱归属且祖谱 `founder_handle` 非空（否则 400）。

---

## 11. 始祖真源反转（v2 —— **家族树始祖 = 真身**）对本册的影响（Zang 裁定 2026-09-20 · **只追加**）

> **性质**：本节由 **Jing（制度员）** 追加（2026-09-20）—— **只写文档**（未改代码、未写真源、未打包 / 未部署）。§1–§10 历史行**原文保留**；被取代者**不回改正文**，取代关系由本节表给出。
> **裁定来源**：Zang 终审 v1「始祖真源反转」**变体 A** = 始祖**真身在家族树**；宗谱 / 世本各持**只读镜像**；**世系链镜像方向不变**。完整口径与代码锚点 = `docs/founder-attach.spec.md` **§9**；部署登记 = `docs/PENDING_DEPLOY.md` **§29**。
> **未落盘声明**：实现**尚未落盘**（Kong 实现轮）⇒ 本册**不得**据此认为已按新口径运行。

### 11-1 §4-3 被取代（**普通树 / 家族树始祖 = 真身，不再是镜像**）

| 旧位置 | 旧口径（**原文保留**） | v2 处置 |
|---|---|---|
| §1 一行话第 3 句 | 「普通家族树的始祖是**祖谱节点的镜像**」 | **已被取代** → 家族树始祖 = **真身**（本树可写） |
| §2 普通树字段行 | `clan_tree_id` / `clan_handle`（其始祖指向的祖谱节点） | 指针语义保留（**祖谱侧持只读登记镜像**，见 §11-2） |
| **§4-3（普通树始祖）** | 「始祖节点 = **指向祖谱节点的镜像**（`external_tree='<祖谱 tree_id>'`…）、整节点只读」 | **已被取代**：家族树始祖 = **真身**（承载真实数据、本树 `tree_steward` / `chief_editor` 可写）；「镜像 = 只读」改由**方向无关只读不变量**判定（`docs/founder-attach.spec.md` §9-5） |
| §5 操作表「解除挂载」行 | 「解除后始祖回到**空白占位**态（不可直挂世本，需重新认祖到某祖谱）」 | **已被取代**：**取消「空白占位锁」**（`docs/founder-attach.spec.md` §9-4 R2b）——未挂载时本树 steward / chief 可**自填**姓名 / 生卒（自建真身） |
| §3-7 | 「位于任一层**上方**的镜像节点在本层内整节点只读」 | **已被取代**为**方向无关**（`external_mirror==='true'` 且 `external_tree` 非空且 ≠ 本树 → 一律只读；唯一例外 = 出生地 / 居住地，契约 v2 C6） |

### 11-2 **祖谱顶端镜像段方向不变**（本册 §4-1 / §3-1 保持有效）

- 祖谱 `kind='clan'` 顶端仍是**世本世系链的镜像段**（`external_tree='zhonghua'`、`external_link_type='founder'|'chain'`、`external_mirror='true'`）；**方向 = 祖谱 → 世本，不变**。
- **实测（2026-09-20）**：`ji_23395` 顶端 **I000162 季行父**（handle `mir_103ff661b13b19b0f44c89cbe2f7`）→ `zhonghua`；`gu_39038` 顶端 **I000138 姒期视**（`mir_a824b97dab17c3f590b4e3fc`）→ `zhonghua`；对应世本真身 = `zhonghua` **I0100 季行父**（handle `103ff661b13b19b0f44c89cbe2f7`）/ **I0137 姒期视**（`a824b97dab17c3f590b4e3fc`）**保持真身**。
- 因此本册 §3-1 / §4-1 / §4-2 的**顶端镜像段写法不变**；受影响的只是「普通树始祖」那一层（§4-3）。

### 11-3 宗谱登记镜像 = **所有认祖关系的通用口径**（R4）

- **立支专用产物 → 通用口径**：原为立支专用（`docs/branch-clan-ops.spec.md` §5-3 / §6-1-6 的「宗谱登记镜像」），v2 起推广为**所有认祖关系**的通用形态：**宗谱自有段持 1 个指向家族树始祖（真身）的只读镜像** —— `external_link_type='founder'`、`external_mirror='true'`、`external_tree='<家族树 tree_id>'`，宗谱内只读，**同一家族树至多 1 条**，**宗谱 `tree-meta.founder_handle` 指向它**。
- 推广口径的落地细节（旧行处置、§3-8 放宽）= **`docs/branch-clan-ops.spec.md` §16**；本节**只做引用**，不重述数值。
- **本册 §10 的关系**：§10 是**引用小节**（立支 / 汇宗口径一律以 `docs/branch-clan-ops.spec.md` 为准）。v2 下 §10 的两条**仍然有效**，其中「**普通树始祖可以是真实节点**」一条**由 v2 升格为默认形态**（不再只是立支后的例外）；「支系入口列表的推导扩展」一条**保持**（宗谱自有段里 `external_link_type='founder'` 的登记镜像按其 `external_tree` 计入支系入口）。
- **现状偏差（如实登记 · 未落盘）**：真源 `ji_23395` / `gu_39038` 的 `tree-meta.founder_handle` 当前指向的是**宗谱自有段的真身节点**（`ji_23395` → `3c95530f8bd4f84dc0b87edc` = 季花 I000163；`gu_39038` → `5ae4c6e505c90d290f71f66b` = 顾清学 I000139，**均为实测值**），尚未指向「家族树始祖登记镜像」；该反转 = 存量数据就地反转，**待 Kong 落地**（动作面与旧详情键清单登记 = `docs/PENDING_DEPLOY.md` §29）。

### 11-4 本册测试基线口径（本节时点实测）

- **本轮校正实测（2026-09-20 **18:22:53** CST · **取代**下方旧读数）**：`cd /Users/kevin/bistro/jiazu && npm test` → **454 tests / 447 pass / 7 fail / 0 skipped**（**exit 1** = **红**）。7 红项 = `not ok` **42 / 52 / 228 / 229 / 230 / 234 / 236**（`node --test` TAP 输出，Jing 实测）—— **失败归属**：**Kong 未完成的旧断言改写**（测试端尚未跟改本批新口径；例：`not ok 52` 断言的正是 R5 已放宽掉的旧文案「…不是上层镜像，无法汇宗」，另一处 Kong 正在收尾）。
  ⇒ **本册不得据此写成绿**；**待全绿后由本册追加一行**（本册**不推算、不预填**，最终数仍由 Kong 交付后以实测补登）。
- **已作废读数（原文保留）**：`npm test` **454 tests / 454 pass / 0 fail / 0 skipped**（`cd /Users/kevin/bistro/jiazu && npm test`，exit 0，**2026-09-20** 本节初稿时点）—— 该读数**已作废 / 已陈旧**（Kong 于 17:51–17:56 在途落盘实现后即为红，同一日 17:44 的绿读数是**落盘前**值）。
- **全绿读数（**本节追加 · 2026-09-20 **18:38:20** CST 实测 · **取代上条红读数**）**：`cd /Users/kevin/bistro/jiazu && npm test` → **454 tests / 454 pass / 0 fail / 0 skipped**（**exit 0** = **全绿**，`node --test` TAP 汇总实测）。Kong 已在 **18:31–18:36** 完成测试端收尾（`lib/founder-attach.test.js` / `lib/branch-clan-ops.test.js` / `lib/founder-reattach.test.js` 同批改毕）⇒ 上条 **454 / 447 / 7（红）** 为**收尾前**读数、**已被取代**。**`npm test` 全绿 = 本批交付门槛，现已达标**（仍以**冻结时点的最终一次实测**为准；本册下次不再追加重复行）。
- **v1.2 读数刷新（本节追加 · 2026-09-20 **19:18:14–19:18:17** CST 实测 · **取代上条 454 基数**）**：`cd /Users/kevin/bistro/jiazu && npm test` → **464 tests / 464 pass / 0 fail / 0 skipped**（TAP 逐字 `1..464` / `# tests 464` / `# pass 464` / `# fail 0` / `# skipped 0`，**exit 0** = **全绿**，`not ok` **0 条**）。增量成因 = **专测文件 `cloudfunctions/compat-api/lib/founder-source-reversal.test.js` 落地并注册**（**44,276 B**，mtime **2026-09-20 19:04**；`package.json` 的 `scripts.test` 注册数 = **28** = 磁盘 `cloudfunctions/compat-api/lib/*.test.js` **28**）⇒ **+10 tests**（454 → 464）。**`npm test` 全绿 = 本批交付门槛，仍达标**。
- **A6 回退（裁定 D1 · 本节追加 · Jing · 2026-09-20 **19:19** CST 实测 · 只登记）**：`/tree/rank` **已回退为「只读本树详情」、不接线 `resolveChainGen`**（`cloudfunctions/compat-api/index.js` md5 **`f1f40096323de98f1f2b3d9188c2bac5`** = **与 HEAD 字节相同**；`grep -c 'resolveChainGen' cloudfunctions/compat-api/index.js` = **0**）；**R6 的唯一落点 = `lib/tree-write.js` `clanSelfGenMap`（`:772` 定义 / `:781` 调用点）**，**保留不变**。⇒ 本册 §11-3 的宗谱登记镜像口径**不受影响**（回退属 `/tree/rank` 读数层，不改登记镜像判定）。逐项读数与裁定理由见 `docs/PENDING_DEPLOY.md` **§29-9「v1.2 裁定 D1 校正」**。
- 本册 §8「保持 `npm test` 全绿（当前 92 pass / 0 fail）」是**历史行（原文保留）**，其数值已陈旧；**本节不重写该行**。本轮「始祖真源反转」的**新增测试会再改基线**，最终数由 Kong 交付后以实测补登。
- 测试写入纪律不变：只用 `COMPAT_OUT_DIR` → `/tmp` 副本 + 断言真源 md5 未变（本节**未写任何测试**，仅登记读数）。

### 11-5 复现命令（**只读**）

```bash
cd /Users/kevin/bistro/jiazu
grep -n '## 4-3\|### 4-3\|## 11' docs/clan-tree.spec.md
python3 -c "import json;t=json.load(open('config/tree-meta.json'))['trees'];print(len(t));print({k:(v.get('kind'),v.get('founder_handle')) for k,v in t.items() if v.get('kind')=='clan'})"
npm test 2>&1 | tail -8        # 本节复测（2026-09-20 18:22:53 CST）：454 tests / 447 pass / 7 fail（exit 1 · 红；旧读数 454 / 454 / 0 已作废）
```

> **v1.2 追加（Jing · 2026-09-20 **19:18:14–19:18:17** CST 实测 · 只追加）**：上列 `npm test` 注释中的读数**已陈旧** —— 本轮复测 = **464 tests / 464 pass / 0 fail / 0 skipped**（**exit 0**）；**A6 已回退（裁定 D1）**，复核命令：`md5 -q cloudfunctions/compat-api/index.js`（= `f1f40096323de98f1f2b3d9188c2bac5`，与 HEAD 同）· `grep -c resolveChainGen cloudfunctions/compat-api/index.js`（= **0**）· `grep -n "clanSelfGenMap\|resolveChainGen" cloudfunctions/compat-api/lib/tree-write.js`（= **`:772` / `:781`**，R6 唯一落点保留）。

---

### 11-6 **R7 真源迁移「已落盘」状态行 ＋ E1 / E2 裁定登记**（Jing 制度员 · 2026-09-20 **21:31–21:36** CST 实测 · **只追加 · 只标注取代 · §11-1～§11-5 历史行原文保留**）

> **取代标注（不改历史行）**：本节 **§11-3 末条「现状偏差（如实登记 · 未落盘）」** 与 **§11 开头「未落盘声明」** 的措辞 —— **R7 存量就地反转已于 2026-09-20 21:31:28 CST 对真源执行完毕**（`node scripts/migrate-founder-inversion-2026-09.mjs --apply` · 7 改 2 删 · 幂等已验证 · `migrate-output/**` **319 → 317** · 备份 `/Users/kevin/jiazu-backups/2026-09-20-founder-inversion/`）。**逐项事实 = `docs/PENDING_DEPLOY.md` §29-10**；**运维口径与 E1/E2 = `docs/founder-attach.spec.md` §9-11**（本节只登记状态与裁定行）。

**（a）「R7 已落盘」状态行（带日期 · 实测）**

| 项 | 状态（2026-09-20 **21:31–21:36** CST 实测） |
|---|---|
| **宗谱侧（§11-3 口径）** | **✅ 已成事实态**：`ji_23395` / `gu_39038` 的 `tree-meta.founder_handle` **仍指向宗谱自有段的登记镜像节点**（`3c95530f8bd4f84dc0b87edc` / `5ae4c6e505c90d290f71f66b`），而该节点**已转为「指向家族树始祖真身」的只读登记镜像**（`external_tree=ji_23395_01` / `gu_39038_01`、`external_person_handle=` 家族树始祖 handle、`external_mirror='true'`）⇒ §11-3 第 1 条的通用口径**在存量数据上成立**（§11-3 末条的「尚未指向」偏差**已消除**） |
| **家族树侧（§4-3 取代）** | **✅ 已成事实态**：`ji_23395_01` / `gu_39038_01` 始祖 = **真身**（`external_*` 6 个字段**全为空串**，含 `external_founder_created_by`）；`tree-meta` 家族树条目补 `clan_tree_id` / `clan_handle` ⇒ §11-2 / §11-3 的判定链读侧可推导 |
| **宗谱顶端镜像段（§11-2）** | **✅ 方向不变**（`ji_23395` I000162 季行父 / `gu_39038` I000138 姒期视 → `zhonghua`），R7 未动 |
| **云端 / 部署** | **❌ 未执行**：树 JSON 重传 + 旧详情键删除（`ji_23395:3c95530f8bd4f84dc0b87edc`、`gu_39038:5ae4c6e505c90d290f71f66b`）+ 云函数重打包 + 前端重打；顺序仍「**先重传、再删旧键**」 |
| **运维前置（必须）** | **改真源后必须重启 compat-api** —— **树 JSON 无磁盘指纹**（`lib/store.js:358-374` `getTree()` 仅查进程内 `treeCache`，`:359` 命中即返回；对比 meta 有指纹 `:272` / `:282` / `:313-315`）；口径全文与实测回读证据 = `docs/founder-attach.spec.md` **§9-11 (b)** |

**（b）E1 登记行（裁定：不算缺陷 · Zang · 2026-09-20）**：「口径 A（点镜像节点 = 打开真身档案）」在新口径下仍会把镜像坐标 **`replaceState` 收敛到真身**（实测 `?tree_id=ji_23395_01&handle=10400594…` → `?tree_id=ji_23395&handle=3c95530f…`，页面显示 `mirrorNote`「本节点为 季氏祖谱 000163 的镜像 · 内容取自真身」）⇒ **镜像自身的只读档案在正常点击流不可达**；镜像只读判据（`founder-lock` =「始祖节点 · 祖谱镜像」/ `founder-hint` =「始祖节点信息需在本姓祖谱中修改」）**只在内层弹窗 / 不可收敛分支可见**。**Zang 裁定：不算缺陷** —— ① 与 R1 单一真源同向；② **R3 仍是后端防线 + 不可收敛态兜底**；③ **R7 后家族树始祖变真身、不再触发收敛**（本节 §11-2 / §11-3 的两条口径**均不受影响**）。

**（c）E2 登记行（取证路径 · 次优但已获接受）**：上述证据由 **`PersonDetailModal.open(treeId, handle)`**（公开 API，与 `clan-hall.vue:411-419` `openOwnFounder` 的 catch 回退**同调用形状**）取得、**非真实鼠标点击** ⇒ **必须写明理据**，避免后续会话误读为「正常路径可达」；Jing 本轮**尝试**真实点击流复现**未成**（浏览器后端被 Chrome profile 写锁拦下）⇒ **未补证**。**完整理据 / 代码锚点 / 独立结构侧证据 = `docs/founder-attach.spec.md` §9-11 (c) (d)**。

> **本节（§11-6）边界**：**只改 `docs/**`**；**未改代码、未跑迁移脚本（含 dry-run）、未写真源、未重传 / 部署 / 打包、未提交、未尝试写 `AGENTS.md`**。真源现值 = `config/tree-meta.json` **`13616a89db2782256c3f33260aa32470`**（9,814 B）、`migrate-output/**` **317 文件**。

---

## 12. 直建祖谱（方式 C）＋ 申请-审批路径同价 99 籽（**追加章节 · Kevin 2026-10-09 三次拍定 + 修正 · 只追加 · 不改 §0–§11 任何历史行 · 删除行 = 0 · 本册无任何字面替换**）

### 12-0 拍定口径（**照录 · 逐条**）

1. **zhonghua 节点「⛩ 挂载祖谱」弹窗新增就地新建祖谱（方式 C，仅 chief_editor）**；**建后即挂**（复用 `createClanTree`，出生即带该节点世本镜像段）。
2. **表单最简 = 祖谱名称（必填）+ 姓氏（必填 · 单汉字 · 预填当前节点姓但可改 —— Kevin 修正）**；`tree_id` 由**表单姓**经 `genClanTreeId` 生成；唯一性照旧「**世本节点 × 表单姓**」（不同姓可共享节点）。
3. **直建计费**：校验全过后、落库前从**操作者**扣 **99 籽**（单点常量 `CLAN_CREATE_FEE_SEEDS = 99` 落 `lib/clan.js`，**一句话可改**）；落库失败**原路返还** + `fee_refunded:true`；不足 **409 整单不建不挂**。
4. **既有申请-审批路径同样收 99 籽**：发起时从发起人**预扣**（`fee_ref = txn_id + lots` 落申请单）、不足 409 **不落申请**；**驳回原路同批次全额返还（复用既有 `fee_refund` 流水类型 + 幂等重放检查）再落 rejected**；**通过不扣不退**。
5. **clan-request 移出 0 片路由清单**（economy-fee 矩阵 30 → 29 条；计费口径细目 = `docs/economy-fee.spec.md` **§16**，本节不复写）。

### 12-1 后端路由契约（现证 · `cloudfunctions/compat-api/index.js` / `lib/clan.js`）

- **头注登记**：`index.js` `:43-44`（clan-request 预扣 / decide-clan 驳回返还 / create-clan 直建 99 籽 · Kevin 2026-10-09）。
- **`POST /admin/create-clan`（直建）** —— 现证 `:2207-2246`：入参 `surname` / `clan_title` / `master_handle` / `target_tree_id?`（缺省 `MASTER_TREE_ID`）；校验 = 姓氏必填 `:2213` → **单汉字 `:2214`** → 名称必填 `:2215` → `master_handle` 必填 `:2216` → `resolveNode` 解析 `:2217-2221`；权限 = `requireWriteUser`（`:2225`；目标树 zhonghua ⇒ 既有写权阶梯 = 总谱仅 chief_editor，用例 ⑯ 以 CHIEF 发起）；**扣费 = `createClanTree` 的 `onBeforeWrite` 钩子**（校验全过后、落库前；`chargeSeeds` 现证 `:2233-2239`）；成功回显 `fee` `:2241`；**落库失败 → `refundQuietly` 原路返还 + `fee_refunded:true`** `:2242-2245`。
- **`tree_id` 生成**：`genClanTreeId(meta, 表单姓)` —— 现证 `lib/clan.js` `:108-111`（`<姓拼音>_<十进制码点>`，冲突追加 `_01/_02…`），`createClanTree` 内调用 `:659`。
- **唯一性**：`assertClanFounderUnique`「同姓同世本节点唯一（异姓可共享）」—— 现证 `lib/clan.js` `:125-140`（400 文案 `:136`）；直建侧**不复制第二份**（`index.js` 注释 `:2203`）。
- **单价单点**：`CLAN_CREATE_FEE_SEEDS = 99` —— 现证 `lib/clan.js` `:64-66`（**一句话可改**）。
- **`POST /admin/clan-request`（申请 · 预扣）** —— 现证 `:2362`（路由）/ `:2423-2448`：预扣注释 `:2423-2426`（**全部校验（含重复 pending / 资格 / 唯一性 / 发源地）通过后、落申请前**）；`chargeSeeds` `:2430-2435`；**`request.fee_ref = { txn_id, unit:'seeds', seeds, charged_at, lots }` 落申请单** `:2436-2442`；落申请 `:2443-2444`；落库失败 → 返还 + `fee_refunded` `:2445-2448`；**不足 409 → 不落申请**（测试现证 `:1413-1425`，见 12-4）。
- **`POST /admin/decide-clan`（审批）** —— 现证 `:2480-2558`：仅 chief_editor `:2489`；`status !== 'pending'` 400 闸 `:2492-2494`；**驳回先返还** `:2496-2524`（注释 `:2497-2500`「杜绝已驳回钱未退」；**幂等重放检查** = 发起人账上按 `type === 'fee_refund' && ref.txn_id === feeRef.txn_id` 查重 `:2504-2507`；**同批次原路全额返还** = 有 `lots` 走 `eco.refund`（同 lot_id / 同 qty，不新造批次）`:2509-2517`、无 `lots` 走 `eco.refundAssets` `:2518`；**返还失败 → 500 且申请保持 pending 可重试** `:2519-2521`）；**返还成功后才落 `rejected`**（`fee_refund` 回执落申请单 `:2525-2532`）；**通过 = `createClanTree` 建树，不扣不退** `:2535-2554`。

### 12-2 前端口径与文案（**逐字 · 现证 `frontend/src/components/person-archive/person-archive.vue`**）

- **入口位置**：zhonghua 真身节点「⛩ 挂载祖谱」按钮 `:270` → 挂载弹窗（标题 `⛩ 挂载祖谱` `:770`）；弹窗内 TreePicker / 空态之下**常驻一行直建入口** `:789-793`；空态提示渲染 `:777-779`。
- **文案常量单点**（现证 `:986-1000`，逐字；`:988` 注明「后端为唯一权威，此处仅文案用」）：
  - 入口 **「＋ 新建祖谱」**（`:990`）；费用行 **「消耗 99 颗石榴籽」**（`:991`，随 `:989` 单价常量插值）；
  - 空态 **「暂无祖谱可挂载：可在下方就地新建祖谱（消耗 99 颗石榴籽，立即生效），或由本姓现有家族树先申请建立祖谱。」**（`:993`）；
  - 即挂说明 **「新建后即挂载到节点「X」」**（`:995`，X = 当前真身节点名；说明行渲染 `:799`）；
  - 确认标题 **「确认新建祖谱」**（`:996`）/ 确认正文 **「将消耗 99 颗石榴籽，在节点「X」上新建祖谱「Y」并立即挂载。是否继续？」**（`:997-998`）；
  - 成功标题 **「祖谱已建立并挂载」**（`:999`）/ 兜底 **「新建祖谱已挂载到当前节点」**（`:1000`）。
- **表单最简两字段**（现证 `:794-804`）：祖谱名称（`:795-796`）+ 姓氏，标签**「姓氏（必填 · 单汉字 · 可改）」**（`:797-798`）；**预填当前节点姓但可改** = `openClanCreate` 里 `clanCreateSurname.value = person.value?.surname || ''`（**现证 `:1334-1339`，预填 `:1336`**）。
- **API 封装**：`createClan()` —— 现证 `frontend/src/business/api.ts` `:1827-1835`（注释 `:1828-1829`「建后即挂」「后端校验全过后、落库前扣 99 籽」；出参类型 `ClanCreateResult` `:1806`；`business/index.ts` 同步导出 —— 本批在途 diff 现证）。

### 12-3 已知边界与**待观察**（**如实登记 · 不得写成已解决**）

- **已修复（收尾单）**：`store.mutateTreeMeta` local 分支**不回填调用方持有的 meta 快照** ⇒ `createClanTree` 末尾读 `meta.trees[treeId].display_title` 必炸（连带 decide-clan approve 同炸；**路 B v2 后一直存在，非本批引入**）。修法 = `message` 改读**本函数刚写出的 `clanEntry`** —— 现证 `lib/clan.js` `:775-777`（注释 `:775-776`「local 模式 mutateTreeMeta 只落盘…不回填调用方持有的 meta 快照 → 读旧快照必 undefined」+ `message` 取 `clanEntry.display_title` `:777`）。
- **待观察（硬 · 未审计）**：**其余 `mutateTreeMeta` 生产调用点未逐一审计**是否同样存在「调用方在写后回读旧 meta 快照」模式 —— 现证调用点清单（`grep mutateTreeMeta`，lib 生产码，不含测试）：`lib/tree-write.js` `:1198 / :1287 / :2589`；`lib/clan.js` `:760 / :836 / :890`；`lib/branch-clan-ops.js` `:711 / :723 / :971`；`lib/founder-attach.js` `:872 / :894 / :983 / :1026`（共 **13 处**）。**未审计前不得据任一调用点判「已解决 / 无同类缺陷」**。

### 12-4 测试与基线（现证 · `cloudfunctions/compat-api/lib/economy-fee.test.js`）

- 本批新增用例编号 = **⑯**（头注条目 `:26-29`；块标 `:1279`）。**现证无 ⑰ 编号用例**（`grep '⑰'` 于本文件 = 0 命中）。
- 用例 1「POST /admin/create-clan：99 籽建谱扣籽…」`:1289-1379`：① 200 扣籽（`tree_create` / `delta {seeds:-99}` / 从操作者扣）+ `kind='clan'` 注册 + 顶端镜像段指向 `master_handle`（**建后即挂**）`:1293-1319`；② 不足 409 零写入（tree-meta 不注册 / 籽一字节不动 / 零流水 / 不带 `fee_refunded`）`:1321-1336`；③ 同姓同节点重复 400（**先于扣费**，零流水）`:1338-1345`；④ 落库失败原路返还**同一批次**（同 id / 同 expires_at / 同 qty）+ `fee_refunded:true` `:1347-1370`；⑤ **姓氏可改 → tree_id 随表单姓** `:1372-1378`。
- 用例 2「/admin/clan-request 预扣… + /admin/decide-clan…」`:1381-1469`：① 预扣 + `fee_ref` 落档 `:1384-1402`；② 重复 pending 409 不扣不落第二张 `:1404-1411`；③ 不足 409 不落申请 `:1413-1425`；④ 驳回同批次原路全额返还（**资产袋逐字节还原**）→ 落 rejected + 回执 `:1427-1444`；⑤ 再驳 400 不重复返还 `:1446-1449`；⑥ 通过不重复扣（无二次扣费、无返还流水）`:1451-1468`。
- 0 片清单断言：clan-request 移出注释 `:1092-1093`；**`ZERO_FEE_ROUTES.length = 29`** `:1133-1134`；正向计费清单含 `/admin/create-clan` `:1136-1137`。
- **基线（Jing 2026-10-09 CST 实测）**：`npm test` → **674 tests / 674 pass / 0 fail / 0 skipped**（exit 0）；`cd frontend && npm run type-check` → **EXIT 0**。

### 12-5 上云面（**只指向**）

- 云函数 `compat-api` 重打包 + H5 / 小程序两产物重打；判据与冒烟 = `docs/PENDING_DEPLOY.md` **§56**（本册不复写）。

### 12-6 本节未做项（**如实登记**）

- **真源零写入**：未改任何代码 / `config/` / `migrate-output/`；**未打包 / 未部署 / 未上传**；**未 `git` 任何写操作**；**未碰任何 `.qa.md`**（`AGENTS.md` §0-5）；**未尝试写 `AGENTS.md`**（§0 索引行以草稿交主代理落盘）。
- 本册为**口径与实现锚点登记**；`mutateTreeMeta` 其余调用点审计（§12-3 待观察项）**未做**，归后续单。
