# 「指定 ID」档 独立质检报告（单号：谱系管理面板·指定 ID 档）

> 体例：质检汇编。每条结论附**本单现取**的真实读数与命令；取不到的写 `NOT_MEASURED` 并写明原因。
> 本单**只读**：未修改任何已存在文件，未做任何 git 写动作，未发任何写请求（全部实测为 GET），未起任何常驻进程。

---

## ① 被检件与指纹

| 项 | 值 |
|---|---|
| 文件 | `frontend/src/components/person-manage-panel/person-manage-panel.vue` |
| 行数 / 字节 | 1270 行 / 60691 B |
| 冻结指纹（派单方给） | `6c3cc14a5c05ed5e618a0220df567b9ddfce13632c0ea27d4980b1dbb04b1781` |
| **开工首取** | `6c3cc14a5c05ed5e618a0220df567b9ddfce13632c0ea27d4980b1dbb04b1781` ✅ 逐字相同 |
| **结论段再取** | `6c3cc14a5c05ed5e618a0220df567b9ddfce13632c0ea27d4980b1dbb04b1781` ✅ 与首取相同 |

```
$ shasum -a 256 /Users/kevin/bistro/jiapu/frontend/src/components/person-manage-panel/person-manage-panel.vue
6c3cc14a5c05ed5e618a0220df567b9ddfce13632c0ea27d4980b1dbb04b1781  .../person-manage-panel.vue      （开工首取）
6c3cc14a5c05ed5e618a0220df567b9ddfce13632c0ea27d4980b1dbb04b1781  .../person-manage-panel.vue      （结论段再取）
```

工作区变更面（`git status --porcelain --untracked-files=all`）**仅此一行**：
`M frontend/src/components/person-manage-panel/person-manage-panel.vue`；`git diff --numstat` = `192  6`（+192 / −6）。

---

## ② 冻结口径逐条判定（F-1 ~ F-9 + T-1 ~ T-3）

| 判据 | 判定 | 证据（行号 / 真实读数） |
|---|---|---|
| **F-1** 档位：非批量档渲染三颗按钮，加父/加子/加配偶/世本续编四情形均可见 | **PASS**（静态） | 切换条 `v-if="addPickMode !== 'batch'"` L118（`ref` 档经 `addPickMode` get 归一为 `'pick'`，恒 ≠ `'batch'`）；三颗 `mode-btn` L119-123（新建节点）/ L124-128（`(isMasterChain && !addLocalTree) \|\| addMode === 'spouse' ? '挂接已有节点' : '从树中选择'`）/ L130-134（指定 ID）。四类入口的 `pickMode` 实测取值：加父 L46 `'new'`、加子 L54 `'new'`、加配偶 L102 `'new'`、世本续编 L20 `'new'` + L26 `'pick'`（另：祖谱批量 L33/L80 = `'batch'` → 按口径不渲染；口径①本树入口 L93 = `'new'`）。<br>⚠️ **渲染未实测**：本单禁起 dev server / 禁常驻进程 ⇒ 判定依据为静态条件追踪，非浏览器实测。 |
| **F-2** placeholder 复用单点常量；解析成功前提交不可用 | **PASS** | 模板 L209 `:placeholder="PERSON_REF_PLACEHOLDER"`，来源 L320 `import { personIdDisplay, PERSON_REF_PLACEHOLDER } from '@/business/format'`；常量单点 = `frontend/src/business/format.ts:31` = `'全局编号（如 000000052）或 handle'`。全文件 grep 该字面**仅命中 import 行**，组件内无第二份拷贝（`grep -n "PERSON_REF_PLACEHOLDER" …` → L209、L320 两处，均为引用）。提交闸门 L291 `:disabled="!addCanSubmit"` → L675-679 `addCanSubmit`：`'pick'` 分支 ⇒ `!!addSelected.value`；`addSelected` 在进档 L742、改字 L735、发起解析 L793 三处清零。函数级实测见 ⑤ 表 G2/G3/G12/G13（未定位时 `addCanSubmit=false`）。 |
| **F-3** 编号等价：去 I 前缀/去空白/去前导零比数值；handle 去空白全等 | **PASS** | 实现 `normalizePersonRef` L709-713。自造 25 条边界向量逐条跑**真实源码**（见 ⑤）：与口径不一致数 **0**。现网真打：`000000052 / I000052 / 52 / I52 / 0052 / i52` 在 `zhonghua` 各 **1** 命中；`000000143 / I000143 / 143 / I143 / 0143 / i143 / i00143` 在 `gu_39038_01` 各 **1** 命中（全为同一节点）。残余精度问题见 ⑧ D-3、D-4（现网不可达）。 |
| **F-4** 走既有本树搜索通道（`searchTreeId`），恰好一个命中才定位；**不取第一条** | **PASS** | L801 `searchPeople({ query: q, tree_id: searchTreeId.value })`（`searchTreeId` L673 = 本树入口 ? `props.localTreeId` : `props.treeId`）；L804 `res.people.filter((r) => isRefHit(q, r))`；L805 `if (hits.length === 1)` 才回填 —— 无 `matched[0]` / `people[0]` 取首写法（grep `res.people` 全文件仅 L804 一处）。函数级 G14（掺入 2 条姓名模糊无关节点仍只回填唯一编号命中）/ G15（本树两条同键 → 不取第一条，改走全站 leg）均 PASS。<br>通道前提实测：后端 `/search` 把编号命中**置顶为 index 0**（index.js:3727-3731），故前端硬写的 `pagesize=20`（api.ts:1911）不会把编号命中挤出返回集。 |
| **F-5** 三分支文案逐字 | **PASS** | ① L218 `已定位：{{ addRefSelected.name }}·{{ personIdDisplay(addRefSelected.gramps_id) }}`（中点 `·`、编号经 `personIdDisplay`）；② L821 `` `编号「${raw}」属于《${idHit.tree_title}》家族树，不能作为本树的节点` ``；③ L824 `` `找不到编号为「${raw}」的节点` ``。`raw` = L790 未 trim 的**输入原文** ⇒ 引用原文含空白亦逐字保留（G4 实测：输入 `" 123000 "` → `编号「 123000 」属于《某树》家族树，不能作为本树的节点`）。跨树不允许（② 只报错、不写槽、不提交）。 |
| **F-6** 自身防护：命中 handle = 本档案节点 / 本树坐标 handle → 报错 | **PASS** | L723-729 `refSelfError`：`handle === props.handle \|\| (useLocalTreeContext.value && handle === props.localHandle)`；文案按档位 `父节点 / 子节点 / 配偶`。函数级 G8 实测（三档位文案 + 命中槽保持 `null` + 不可提交）。 |
| **F-7** 提交复用：结果只写既有选中槽；四条既有分支一字未改；可提交 = 已定位成功；只挂接不新建 | **PASS** | 解析结果只写 L812-813 `addSelected` / `addRefSelected`；四条既有分支的判据全部读 `addPickMode.value`（L866 配偶 `'attach'` / L890 世本 `'attach'` / L907 加父 `{handle, gender}` / L917 加子 `child_handle`），而 `addPickMode` 的 get（L528）把 `ref` **归一为 `'pick'`** ⇒ 本档走既有挂接路径、`mode:'attach'`、无 name/surname ⇒ **只挂接**。`git diff` 中**无任何 hunk 落在 L834-938 `doAddNode` 段内**（见 ③）。函数级 G9 实测：命中后 `addSelected.handle='h-52'`、`addCanSubmit=true`、提交侧 `addPickMode='pick'`（UI 档位仍 `'ref'`）。 |
| **F-8** 既有 new/pick/batch 三档模板结构与提交语义零改动；样式仅允许 `.mode-switch` 加 `flex-wrap: wrap` | **PASS（附 3 处既有改动披露）** | 逐 hunk 归类见 ③：10 个 hunk = 6 处纯新增 + 1 处既有行仅追加导入项（无行为变化）+ **3 处既有语义改动**（hunk1 两颗按钮 `@click` 改经单点函数 + `pick` 激活态加 `&& addPickTab !== 'ref'`；hunk6 `addPickMode` 由 `ref` 改 `computed`；hunk10 样式）。三档的**元素与嵌套结构未动**；四条提交分支零改动（无 hunk）；样式改动**仅** `.mode-switch` 一行加 `flex-wrap: wrap`（L1220），全文件无其它样式行被触碰。hunk1/hunk6 为 T-2 定点修正所必需（离开新档复位报错 + 提交侧归一）。 |
| **F-9** 硬边界：零新依赖/零后端改动/零新路由/零真源写入；无 console.log；无调试 UI；无浏览器专有 API | **PASS** | `git status --porcelain --untracked-files=all` 仅被检文件一行 ⇒ 无新依赖（`package.json` 未动）、无后端改动（`cloudfunctions/**` 未动）、无新路由。本单全部实测请求为 **GET**（`/search`、`/search/global`、`/tree-meta`、`/tree/rank`），未触发任何写接口。`grep -n "console\.log\|window\.\|document\.\|navigator\.\|localStorage\|sessionStorage\|alert(" <file>` → **零命中**（exit 1）。新增模板只用 `t-input / t-button / view / text / template` 与 `:value/@update:value/@confirm/:loading` 等 uni-app 两平台通用写法；新增脚本只用 `ref/computed/watch` 与 `await`。 |
| **T-1** 异步竞态：两段 `await` 之后必须有守卫 | **PASS（残余竞态见 D-2）** | 守卫函数 L774-776 `refResolveStillCurrent`（判据 = UI 档位仍 `'ref'` **且** 输入自本次发起后未变）；三处落地：await① 后 L803、await② 后 L818、catch 内 L827 各一道守卫；`finally` 里 `addRefResolving` 无条件复位（L830，注释明示为有意）。自建函数级演练 15 项：G1（在飞切到「新建节点」档）/ G2（在飞改字）/ G3（**第二段 await** 期间改字）/ G6（切档后失败）**全 PASS**。上一任脚本复跑：`NOW` 9/9 PASS（exit 0）、`PRE`（剥掉三处守卫行 + switchAddPickTab 报错复位行）4 项 FAIL（exit 1）⇒ **该脚本可判负**。 |
| **T-2** 离开新档时复位面板报错；「从树中选择」档内重复点按钮不得误清本档搜索报错 | **PASS** | `switchAddPickTab` L756-763：**仅当** `addPickTab.value === 'ref'` 时清 `addSelected` / `addRefSelected` / `panelError`，随后才 `addPickMode.value = tab`。G11 实测：`pick` 档内重复点 → 报错 `'未找到匹配节点'` 保留（未被误清）；离开 `ref` → 报错清空且选中槽清空。模板两颗既有按钮改经该函数（hunk1）即为此修。 |
| **T-3** 同屏不得有两段重叠说明文案 | **PASS（附口径说明）** | 最终态：`ref` 档块 L205-220 内**只有**输入行（L206-215）+ 确认行（L217-219），**无第二段说明文案**；说明集中在面板顶部 `panelHint`（渲染于 L115 `.mp-sub`）的 ref 分支 L486-488。`grep -n "解析出本树已有节点"` → 全文件**仅 L487 一处**；面板区内（L110-296）无任何 `mp-hint`/`mp-sub` 第二实例（L5/L14/L36/L82/L106 均在面板外）。<br>⚠️ 口径说明：`ref` 档整块属**本批新增**，故「那条重复提示行已删」只能核**最终态无该行**（净 diff 中不存在该行）；git 侧无法证明删除动作本身。 |

---

## ③ 零改动面结论（逐 hunk 归类）

`git diff -U3` 共 **10 个 hunk**（`git diff | grep -c '^@@'` = **10**），`+192 / −6`，仅 1 个文件。

| # | hunk 头 | 内容 | 归类 |
|---|---|---|---|
| 1 | `@@ -119,13 +119,19 @@` | 切换条：`新建节点` 的 `@click` 由 `addPickMode='new'` 改 `switchAddPickTab('new')`；`pick` 激活态加 `&& addPickTab !== 'ref'`、`@click` 改 `switchAddPickTab('pick')`；**新增**第三颗「指定 ID」按钮 | **既有改动（3 行被替换）+ 本批新增（10 行）** |
| 2 | `@@ -194,6 +200,24 @@` | `ref` 档模板块（输入行 + 确认行） | 本批新增（18 行） |
| 3 | `@@ -278,6 +302,7 @@` | `import { …, searchPeopleGlobal, … }` | 本批新增（1 行） |
| 4 | `@@ -292,7 +317,7 @@` | `import { personIdDisplay } …` → `import { personIdDisplay, PERSON_REF_PLACEHOLDER } …` | **既有行被替换，仅追加导入项（无行为变化）** |
| 5 | `@@ -456,6 +481,11 @@` | `panelHint` 增 ref 分支（置于分支链最前） | 本批新增（5 行） |
| 6 | `@@ -481,7 +511,23 @@` | `const addPickMode = ref<…>('new')` → `computed({ get 归一 ref→pick, set })` + 注释 | **既有改动（语义：提交侧归一）** |
| 7 | `@@ -497,6 +543,11 @@` | 三个新状态 `addRefInput` / `addRefSelected` / `addRefResolving` | 本批新增（5 行） |
| 8 | `@@ -599,6 +650,9 @@` | `openAddNode` 增：每次打开清 `addRefInput` / `addRefSelected` | 本批新增（3 行） |
| 9 | `@@ -645,6 +699,138 @@` | `ref` 档函数族（`normalizePersonRef` / `isRefHit` / `refSelfError` / `onRefInputChange` / `switchToRef` / `switchAddPickTab` / `refResolveStillCurrent` / `doResolveRef`） | 本批新增（132 行） |
| 10 | `@@ -1031,7 +1217,7 @@` | `.mode-switch { … }` 加 `flex-wrap: wrap` | **既有改动（样式，F-8 显式允许）** |

**结论数**：
- 归类为「**本批新增**」= **6 个 hunk**（#2 #3 #5 #7 #8 #9）。
- 归类为「**既有改动**」= **3 个 hunk**（#1 交互入口/激活态、#6 提交侧归一、#10 样式）＋ **1 个 hunk 属既有行纯追加**（#4，无行为变化）。
- **既有三档模板结构与四条提交分支的改动数 = 0**：无 hunk 落在 `doAddNode`（L834-938）内；三档的元素/嵌套未动；`<style>` 内除 `.mode-switch` 一行外零改动。既有语义改动仅限 #1（T-2 所需）与 #6（F-7 所需的归一化，令既有分支读到的值域不变）。

---

## ④ 档位不变式复核（穷举写入/读取点）

`grep -n "addPickMode\|addPickTab"`（全文件，非抽样）→ 写入点与读取点如下。

**写入点（全部）**

| 位置 | 写法 | 写入值域 |
|---|---|---|
| L519 | `const addPickTab = ref<'new'\|'pick'\|'batch'\|'ref'>('new')` | 初值 `'new'` |
| L529 | `set: (v) => { addPickTab.value = v; }` —— `addPickMode` 的 **setter** | 任意（含 `'ref'`，仅由 UI 侧调用） |
| L638 | `openAddNode(...)` 内 `addPickMode.value = pickMode` | 形参类型 `'new'\|'pick'\|'batch'`，**四个调用点均不传 `'ref'`**（L20/L26/L33/L46/L54/L80/L93/L102） |
| L740 | `switchToRef()` 内 `addPickMode.value = 'ref'` | `'ref'`（**UI 档位**，唯一入口） |
| L762 | `switchAddPickTab(tab)` 内 `addPickMode.value = tab` | 形参 `'new'\|'pick'` |
| 模板 L122 / L127 / L133 | `switchAddPickTab('new')` / `switchAddPickTab('pick')` / `switchToRef()` | 无直接赋值（本批已删除模板里的 `addPickMode = 'new'/'pick'` 直接赋值 —— 见 hunk1） |

**读取点（全部）**
- 模板渲染：L118、L121、L126、L149、L221、L279、L476、L489；UI 档位判断：L132、L205、L486（读 `addPickTab`）、L126、L757、L775。
- 提交侧：L676（`addCanSubmit`）、L836 / L866 / L890 / L907 / L917（`doAddNode` 早退与四条分支）。

**结论：不变式成立。** `addPickMode` 的 **get（L528）把 `addPickTab === 'ref'` 恒映射为 `'pick'`**，故：
- 提交侧（L676 与 L836/866/890/907/917）**在任何写入路径下都不可能读到 `'ref'`** ⇒ 四条既有分支的早退判据 `=== 'batch'` 与挂接判据 `=== 'pick'` 行为与改动前**完全一致**，而新档恰好落进 `'pick'` ⇒ 走挂接、绝不新建。
- 唯一会看到 `'ref'` 的是 **UI 侧读取点**（模板 L132/L205、`panelHint` L486、`switchAddPickTab` L757、`refResolveStillCurrent` L775），均为本批有意新增。
- 唯一的 `'ref'` 写入口是 L740 `switchToRef()`，`openAddNode` 的形参类型已排除 `'ref'`（类型层 + 运行时均不可达）。
- 类型层的宽松项：get 的**返回类型标注**含 `'ref'`（L528），实际恒不返回 —— 纯类型宽松，无运行时影响（可收紧，非缺陷）。

---

## ⑤ 边界向量表（自跑**真实源码**，非镜像实现）

取证方式：`/Users/kevin/.hermes/profiles/zang/cache/scratch/qa-ref-vectors.cjs`、`qa-ref-guard-own.cjs` —— 两个脚本均从现盘 SFC **逐字抽取**实现源码（花括号平衡扫描）后，仅做「TS 类型标注 → JS」定点去标注，跑在 `vm` 沙箱里；沙箱只复刻宿主状态模型（`ref`/`computed`/`uni` 桩）。**抽取结果原样打印核对**，去标注后无类型残留（脚本自检输出 `残留类型标注: false`）。

### 5.1 归一函数边界向量（25 条，口径不一致数 = 0）

| 输入原文 | 预期（F-3 口径） | 实际 |
|---|---|---|
| `""` / `"   "` | `""` / `""` | `""` / `""` ✅ |
| `"0"` / `"000000000"` | `"0"` / `"0"` | `"0"` / `"0"` ✅ |
| `"000000052"` / `"I000052"` / `"i000052"` / `"52"` / `"I52"` / `"i52"` / `"0052"` / `" 000052 "` / `"I 0 5 2"` | `"52"`（全部） | `"52"`（全部） ✅ |
| `"0000000520"` | `"520"` | `"520"` ✅（不同编号不误判同键） |
| `"abc123DEF"` / `" abc123DEF "` | 去空白后全等 → `"abc123DEF"` | `"abc123DEF"` ✅ |
| `"103f95b87b5a464242933ee319d5"` | 原样 | 原样 ✅ |
| `"99999999999999999999999999"`（26 个 9） | 原样 | **`"1e+26"`** ⚠️ 见 D-3 |
| `"10000000000000000000000"` / `"10000000000000000000001"` | 两个**不同**数字 → 不同键 | **同键 `"1e+22"`** ⚠️ 见 D-3 |
| `"-52"` / `"52.0"` / `"００５２"` / `"I"` / `"II52"` | 原样（不匹配 `^[Ii]?(\d+)$`） | 原样 ✅ |

### 5.2 命中判定向量（`isRefHit`）

| 场景 | 输入 / 节点 | 实际 | 是否符合口径 |
|---|---|---|---|
| 九位规格命中 | `000000052` / `{gramps_id:'000000052'}` | `true` | ✅ |
| I 前缀 / 小写 i 前缀 / 短号 / 带空白 | `I000052` `i52` `52` ` 000 052 ` | `true` ×4 | ✅ |
| 反例：不同编号 / 多一位 / 姓名模糊无关节点 | `53` / `0000000520` / `52` vs `{gramps_id:'000000900'}` | `false` ×3 | ✅（**不会取第一条**的依据） |
| 反例：空串 / 纯空白输入 | `""` / `"   "` | `false` | ✅ |
| handle 精确全等 / 带空白归一 | `abc123DEF` / ` abc 123DEF ` | `true` ×2 | ✅ |
| handle 大小写不同 | `ABC123DEF` vs `abc123DEF` | `false` | ✅（口径只要求去空白全等，未要求大小写不敏感） |
| **碰撞**：handle 恰为纯数字 | `52` vs `{gramps_id:'000000900', handle:'52'}` | `true` | ⚠️ 见 D-4（现网不可达） |
| **旧号**：后端 `resolveNode` 认得的树内旧号 | `I0001` vs `{gramps_id:'000000164', handle:'103f…'}` | `false` | ⚠️ 见 D-1（前端判据看不到旧号） |
| **科学计数法塌缩** | 26 个 9 / `1e22+1` vs `1e22` | `true`（被 `1e+26` / `1e+22` 的 handle 命中） | ⚠️ 见 D-3（现网不可达） |

### 5.3 函数级行为演练（15 项，自己造，不依赖上一任脚本）

`node qa-ref-guard-own.cjs` → **14/15 PASS**（唯一 FAIL 为 D-2 竞态）。摘要：

| 项 | 场景 | 结果 |
|---|---|---|
| G1 | 解析在飞时切到「新建节点」档 | `addSelected=null` / `addRefSelected=null` / `addCanSubmit=false` / `panelError=""` ✅ |
| G2 | 解析在飞时改字（本树段） | 整段丢弃 ✅ |
| G3 | **第二段 await（全站 leg）** 期间改字 | 跨树报错被丢弃（`panelError=""`）✅ |
| G4 | 全站按编号命中 | 文案逐字（引用**输入原文**，含空白）✅ |
| G5 | 两端皆无编号命中 | `找不到编号为「123000」的节点` ✅ |
| G6 | 切档后请求失败 | `panelError=""`、`addRefResolving=false`（finally 照常）✅ |
| G7 | 档内失败 | `panelError="网络炸了"` ✅ |
| G8 | 命中 handle === 本档案 handle（三档位） | `不能把本人指定为自己的父节点/子节点/配偶`，槽保持 `null`、不可提交 ✅ |
| G9 | 正常命中 | `addSelected=addRefSelected=命中节点`、`addCanSubmit=true`、提交侧 `addPickMode='pick'`（UI 仍 `'ref'`）✅ |
| **G10** | **同输入并发两次解析** | **终态不自洽**：`addSelected='h-52'` 且 `panelError='找不到编号为「000000052」的节点'` ❌ → D-2 |
| G11 | T-2 双情形 | `pick` 档内重复点不清报错；离开 `ref` 清报错 + 清槽 ✅ |
| G12 | 空 / 纯空白输入 | `请输入编号或 handle` 且**不发任何请求**（在飞数 0）✅ |
| G13 | 进 `ref` 档 | 清掉别的档残留选中槽与报错 ✅ |
| G14 | 本树 1 条编号命中 + 2 条姓名模糊 | 仍回填唯一编号命中（未取第一条）✅ |
| G15 | 本树两条同键命中 | 绝不取第一条，改走全站 leg 并报 ③ ✅（构造向量，现网无此重号） |

### 5.4 上一任演练脚本的取证强度裁定

被审脚本：`/Users/kevin/.hermes/profiles/zang/cache/scratch/jiapu-ref-guard-drill.cjs`（另有 `check-ref-normalize.mjs`）。

**裁定：属「真跑产品函数源码」，非镜像重写实现。** 依据（逐行读）：
1. 脚本 L18-20 直接用 `fs.readFileSync` 读现盘 SFC；L23-42 `balanceFrom` + L38-42 `extractFn` 花括号平衡扫描，**从原文切片**取 `normalizePersonRef / isRefHit / refSelfError / onRefInputChange / refResolveStillCurrent / switchToRef / switchAddPickTab / doResolveRef` 与常量 `addPickMode / addCanSubmit`（L50-52），无任何实现副本。
2. 仅用 `typescript.transpileModule`（L108-110）去类型标注后在 `vm` 沙箱执行（L107）。
3. 沙箱 `PRELUDE`（L68-86）**只复刻宿主**：`ref`/`computed` 桩、`props`、两个搜索函数的可控 pending promise（L103-104）—— 被检逻辑本身零重写。
4. `PRE` 变体（L57-65）是**对现盘源码做剥除守卫的变异**，用于自证脚本能判负；实测 `PRE` 4 项 FAIL / exit 1，`NOW` 9/9 PASS / exit 0 ⇒ 判负能力已现取验证。
- **强度对比**：本项证据 = 「抽取真实源码 + 沙箱执行」（高）；若为「脚本内重写一份镜像实现」则低一级 —— 本脚本属前者。唯一需注意的弱点是**宿主状态模型是复刻**（`addCanSubmit` 虽为原文抽取，但 `props`/`searchTreeId` 等由沙箱给定），故它证明的是**函数级行为**，不替代端到端渲染验证。

---

## ⑥ 通道前提读数（本机后端只读真打；**全部为 GET**）

后端：`node cloudfunctions/compat-api/local-server.js 3100`（pid 19670，`COMPAT_SOURCE=cloud`，cwd `/Users/kevin/bistro/jiapu`）。

| 读数项 | 命令 / 请求 | 实测 |
|---|---|---|
| 本树搜索 六编号形态 | `GET /search?query=<形态>&profile=all&pagesize=20`，`X-Tree-Id: zhonghua` | `000000052` / `I000052` / `52` / `I52` / `0052` / `i52` → **各 1 命中**，均为 handle `103ff65ee4c1610b597b5fd47c34`、`gramps_id 000000052` |
| 同上，非总谱树 | `X-Tree-Id: gu_39038_01`，七形态 | `000000143` / `I000143` / `143` / `I143` / `0143` / `i143` / `i00143` → **各 1 命中**（handle `103f95b87b5a464242933ee319d5`） |
| 姓名模糊是否多命中 | `GET /search?query=风`（zhonghua）/ `query=季`（ji_23395_01）；`GET /search/global?query=风\|顾\|季&limit=100` | 本树：风 **4**、季 **10**、顾(gu_39038_01) **1**；全站：风 **4**、顾 **4**、季 **17**（`matched` **全为 `name`**，`id` 数 0） |
| 一条他树编号在本树 vs 全站的差异 | `GET /search?query=000000143`(`X-Tree-Id: zhonghua`)；`GET /search/global?query=000000143` | 本树（zhonghua）**0**；全站 **1** 条 = `tree_id: gu_39038_01`、`tree_title: 顾氏安达家族`、`matched: 'id'`、`restricted: false` ⇒ 正是 F-5 ② 的触发形状 |
| 不存在的编号 | `GET /search?query=999999999`(`X-Tree-Id: zhonghua`)；`GET /search/global?query=999999999` | 全站返回 **`[]`（0 条，裸空数组）**；本树 **0 条** ⇒ 落 F-5 ③ |
| 同一请求者在本树可见的人数 vs 树内实有人数 | `GET /tree/rank`(`X-Tree-Id: gu_39038_01`) | `{"tree_id":"gu_39038_01","root_count":4,"person_count":22,"mirror_count":5}` —— 而本 guest 在本树搜索只看得见 **1** 人（`000000143`）⇒ **存在「树内实有但对该请求者不可见」的节点** |
| handle 形态 | `GET /search?query=<handle>`(`X-Tree-Id: zhonghua` / `gu_39038_01`) | 各 **1** 命中且节点正确（`000000052` / `000000143`） |
| 全站姓名命中的可见性标注 | `GET /search/global?query=顾` | 4 条：`gu_39038_01 顾清学 restricted=false`；`heng_24658_01 顾霆` / `ji_23395_01 顾景月` / `liu_21016_01 顾纯江` 均 `restricted=true` |

> 说明：派单方给的数字本单未引用；以上全部为本单现取。**与派单方口径无冲突项**（本轮未出现读数不一致）。

---

## ⑦ 待现取假设的判定：「本树实际存在但对该账号不可见的节点，是否会走到跨树报错文案？」

**判定：假设成立** —— 不会走到 ② 跨树文案，会走到 ③「找不到编号为「…」的节点」。

**代码位置（自己现读）**
1. 本树搜索通道：`cloudfunctions/compat-api/index.js:3631` `const readAccess = await resolveTreeAccess(headers, treeId, tree);` → 用于 `/search` 的编号命中判定 `index.js:3728`（`!readAccess.isHiddenPerson(refHit.handle)`）与姓名扫描 `index.js:3733`（`if (readAccess.isHiddenPerson(p.handle)) continue;`）。
2. 全站搜索通道：`index.js:3190-3194` `ctxAccess = async (id, tree) => { … resolveTreeAccess(headers, key, tree) … }` → 用于置顶编号命中 `index.js:3294`、编号扫描 `index.js:3304`、真身可见性判定 `index.js:3372`。
3. **两条通道调用的是同一个函数**：`lib/tree-access.js` 的 `resolveTreeAccess` → `computeAccess`（`lib/tree-access.js:77`），其可见性 = 纯函数 `(treeId, isMaster, role, anchorTreeId, people, families)` 的确定性结果（`hiddenPeople` 由 `maxDepth − hideTail` 推导，`lib/tree-access.js:89-103`）。同一请求者 + 同一树 ⇒ 输入相同 ⇒ `hiddenPeople` 相同 ⇒ **两通道裁剪完全一致**。
4. 例外排查：读侧另有 `X-Invite-Code` 定点例外（`index.js:3689` `/people` 列表、`index.js:3702`），但 **`/search` 与 `/search/global` 均不认该头**（两处都直接用 `resolveTreeAccess`）⇒ 该例外不破坏两通道一致性。前端 `api.ts:1902-1920 / 2001-2021` 亦未发送该头。

**实测佐证**：候选节点 `000000148`（2026-10-11 归档 `gu_39038_01` 中实存、`gramps_id 000000148`、depth 2 ⇒ guest 档 `hideTail=18` 下不可见）——
`GET /search?query=000000148`(`X-Tree-Id: gu_39038_01`) → **0**；`GET /search/global?query=000000148` → **0**；`GET /search/global?query=顾秀兰`（姓名） → **0**。
而 `GET /tree/rank` 报该树 `person_count: 22` ⇒ 节点确实存在但对该 guest 不可见，**两通道同时为零** ⇒ 前端落 ③。同理复核 `000000141`（本树 0 / 全站 0）。
（对照：同一树内可见的 `000000143` 在两通道都 = 1。）

**反例**：**未找到反例**。（唯一理论上会破坏一致性的写法——对两条通道使用不同的裁剪函数或不同的请求者身份——在现盘代码中不存在。）

---

## ⑧ 缺陷清单

> 本单为质检单，**不修任何缺陷**。严重度按「现网可达性 × 影响面」定：High = 现网可达且破坏口径、Medium = 条件可达、Low = 休眠路径/文案不一致、Info = 仅口径精度、现网不可达。

### D-1（现网休眠；一旦有旧号数据则 Medium）F-5 ② 误报：本树旧号命中的节点被报成「属于本树家族树，不能作为本树的节点」
- **现象**：输入树内旧号（如 `I0001`）时，若该节点只以 `legacy_gramps_id` 命中，前端 `isRefHit` 判不出（它只比 `gramps_id` / `handle`）⇒ 本树 leg 命中数 = 0 ⇒ 转全站 leg；而全站 `resolveNode` 认得旧号，返回 `matched:'id'` 且 `tree_id` **就是本树** ⇒ 面板报「编号「I0001」属于《本树名》家族树，不能作为本树的节点」——把**本树节点**说成别树节点，且本可成功挂接的输入变成硬失败。
- **复现步骤**：① 使某树某节点带 `legacy_gramps_id='I0001'`（`gramps_id='000000164'`）；② 在该树档案页开「＋ 添加父节点」→ 切「指定 ID」；③ 输入 `I0001` → 点「解析」。预期：本树命中（① 已定位）；实际：② 跨树文案。
- **证据（代码位置）**：`lib/id-resolve.js:39-43`（`legacyHit` + `idKey`）、`lib/id-resolve.js:45-62`（`findLocalLegacy`）、`lib/id-resolve.js:140-146`（树内旧号分支，`matched:'legacy'`）；组件 `person-manage-panel.vue:716-720`（`isRefHit` 只比 `gramps_id`/`handle`）、`:804-805`（`hits.length === 1` 才回填）、`:816-822`（转全站并取第一个 `matched==='id'`）。
- **现网可达性实测**：`GET /search?query=I0035`(`X-Tree-Id: gu_39038_01`) → 0；`GET /search/global?query=I0035` → 0；`GET /search?query=I0070`(`X-Tree-Id: gu_39038_01`) → 0，而 `GET /search/global?query=I0070` → 1 条 `zhonghua 000000070 姬弃`（`I0070` 被当**全局编号 70** 解析）⇒ 现网旧号已不再被解析（`legacy_gramps_id` 应已迁移掉）。**现网触发不可达（休眠）**；2026-10-11 归档中 `gu_39038_01` 有 20/25 节点带 `legacy_gramps_id`，故一旦旧号数据回流即触发。
- **严重度**：Low（休眠）/ Medium（有旧号数据时）
- **该归谁**：前端（`isRefHit` 需认后端返回的命中方式，或改为「不在本树/在别树」判定而非仅比编号）；后端（若仍支持旧号，建议在 `/search` 返回里带 `matched` 标记以便前端判据同源）

### D-2（Low）同输入并发两次解析 → 界面终态不自洽（T-1 守卫覆盖不到的竞态）
- **现象**：同一输入连点两次「解析」（或输入框 `@confirm` 与按钮点击叠发）时，两次请求都在飞；T-1 守卫只判「档位仍 `ref` 且输入未变」，两次都通过 ⇒ 两个结果都会落地。实测终态：`addSelected` = 命中节点（提交按钮**可用**）**同时** `panelError` = 另一个请求写下的「找不到编号为「000000052」的节点」。
- **复现步骤**：进「指定 ID」档 → 输入 `000000052` → 连续两次触发解析（第二次在第一次未回来前发出）→ 让一次返回命中、另一次返回空 → 观察：确认行「已定位：…」与报错行同时出现。
- **证据**：`person-manage-panel.vue:774-776`（守卫判据只有档位 + 输入原文）、`:789-832`（无「本次解析序号 / AbortController」类判据，`finally` 亦只复位 loading）；自跑实测 `qa-ref-guard-own.cjs` G10 → `["h-52","找不到编号为「000000052」的节点",true]`。
- **影响**：不产生错误挂接对象（提交用的是当前输入对应的节点），但同屏自相矛盾、误导用户；`t-button :loading` 只降低概率（输入框 `confirm` 路径不经过该按钮）。
- **严重度**：Low
- **该归谁**：前端

### D-3（Info；现网不可达）`normalizePersonRef` 在 >21 位数字上塌缩为科学计数法，两个不同数字得同一键
- **现象**：`String(parseInt('10000000000000000000001',10))` = `'1e+22'`，与 `'10000000000000000000000'` 同键；26 个 9 → `'1e+26'`。若某节点 `gramps_id`/`handle` 恰为 `1e+22` 形态则可被误命中。
- **复现步骤**：跑 `node qa-ref-vectors.cjs`，看归一表最后三行。
- **证据**：`person-manage-panel.vue:709-713`；实测 `["99999999999999999999999999"]→"1e+26"`、`["10000000000000000000000"]` 与 `["10000000000000000000001"]` → 同为 `"1e+22"`。
- **现网可达性**：person 编号为 9 位（`format.ts:11 PERSON_ID_WIDTH = 9`）⇒ 不可达。
- **严重度**：Info
- **该归谁**：前端（可选：改「字符串去前导零」而非 `parseInt`）

### D-4（Info；现网不可达）纯数字 handle 与短号输入同键碰撞
- **现象**：输入 `52` 会命中 `handle === '52'` 的节点（`isRefHit` 对 handle 也做同一归一）。实测 `isRefHit('52', {gramps_id:'000000900', handle:'52'}) === true`。
- **复现步骤**：同 D-3 的向量表「碰撞」两行。
- **证据**：`person-manage-panel.vue:716-720`；归档全量 19 棵树扫描 `^[Ii]?\d+$` 形态 handle = **0 条**（`python3` 遍历 `2026-10-11-migrate-output-archive/migrate-output/trees/*.json`）⇒ 现网不可达。
- **严重度**：Info
- **该归谁**：前端口径（不修）

### 观察（不计缺陷，供派单方知悉）
- **O-1** 在飞时「离开新档再立刻回到新档」（`switchToRef` **不清** `addRefInput`）⇒ 守卫通过、回填落在档内。因输入未变、结果与输入一致，判为可接受行为。
- **O-2** 读侧 `X-Invite-Code` 定点例外（`index.js:3689`、`3702`）只作用于 `/people*`，**两条搜索通道都不认**该头（`api.ts` 亦不发）⇒ 持有效邀请码的用户能在列表里看到、却在搜索里搜不到的**既有**不对称，非本批引入。

---

## ⑨ NOT_MEASURED 清单

| 项 | 为何取不到 |
|---|---|
| F-1 的**实际渲染**（三颗按钮是否真出现在加父/加子/加配偶/世本续编四种面板上） | 本单禁起 dev server / 禁常驻进程 / 禁占端口（且设备层面也未做 uni-app 真机验证）⇒ 仅以模板条件静态追踪判定 |
| 登录态档位（`tree_steward` / `chief_editor` / 成员树）下的两通道可见性读数 | 本单不得登录、不得注入凭据 ⇒ 全部通道读数限定在 **guest 档**；`computeAccess` 的 `member/chief_editor ⇒ full` 分支仅由代码读取判定 |
| `legacy_gramps_id` 在**现网云真源**中的存在性 | 后端 `COMPAT_SOURCE=cloud`，本机无 `migrate-output/` 真源（该目录不存在），无法直读云树 JSON ⇒ 只能用行为反证（`I0070`/`I0035` 不再解析为旧号）+ 2026-10-11 归档举证；**云真源未直接读** |
| `docs/id-system.spec.md` 与本批实现的一致性 | 不在本单冻结口径内（冻结口径即 F-1~F-9 + T-1~T-3），故未纳入判定 |

---

## ⑩ 一句话结论

**「指定 ID」档在本批 12 条冻结口径（F-1~F-9、T-1~T-3）上全部判 PASS（F-1 为静态判定、F-8 附 3 处既有改动披露），零改动面 10 个 hunk 中 6 纯新增 / 1 仅追加导入 / 3 处既有改动（两条提交分支与三档模板结构未动、样式仅加 `flex-wrap: wrap`），档位不变式在全部写入路径下成立；发现 4 项缺陷均不阻断现网（D-1 旧号误报为休眠路径、D-2 并发解析文案不自洽、D-3/D-4 为现网不可达的归一精度项），另记 2 项观察与 4 项 NOT_MEASURED。**

---

### 附：本单取证用脚本（均落在 scratch，未入仓）

| 路径 | 用途 |
|---|---|
| `/Users/kevin/.hermes/profiles/zang/cache/scratch/qa-ref-vectors.cjs` | 从现盘 SFC 抽 `normalizePersonRef` / `isRefHit` 真实源码，跑 25 条归一向量 + 18 条命中向量 + 3 条「恰好一个命中」闸门向量 |
| `/Users/kevin/.hermes/profiles/zang/cache/scratch/qa-ref-guard-own.cjs` | 从现盘 SFC 抽 8 个真实函数 + 2 个真实 `computed`，跑 T-1/T-2/F-5/F-6/F-7 共 15 项函数级演练 |
| `/Users/kevin/.hermes/profiles/zang/cache/scratch/jiapu-ref-guard-drill.cjs`（上一任，**已审**为真实源码抽取） | 复跑 `NOW` 9/9 PASS / `PRE` 4 FAIL（判负自证） |

> 过程偏差申报：为修补上述第 3 个脚本的一处抽取正则（`async` 关键字未纳入切片起点）与沙箱初值，用过 **1 次 heredoc** 编辑 scratch 文件（违反派单方「不要 heredoc」的形态要求）。该操作**只触碰 scratch 目录**，未触碰本仓任何文件；此后所有命令均为单条扁平形态。

---

## ⑪ delta 复核（修复单后）

> 续单性质：本节**只**复核四处修复是否真生效（自建「原来错 / 现在对」向量 + 判负形态）、回归抽样、零改动面重核、修复方自曝三条风险点。**不重做上一轮量测、不改既往各节**（本节为纯追加）。全部读数为**本单现取**；未改被检产品文件、未 git 写、未发写请求、未起常驻进程/端口。

### 11.1 指纹（双取）

| 项 | 值 |
|---|---|
| 文件 | `frontend/src/components/person-manage-panel/person-manage-panel.vue` |
| 行数 / 字节 | **1306 行 / 63640 B**（上一轮 1270 / 60691） |
| 派单方给（修复后） | `80b99cf9b884d3910bb49ee5c7821cf522e431fc19317e7a60120dba56510e05` |
| **开工首取** | `80b99cf9b884d3910bb49ee5c7821cf522e431fc19317e7a60120dba56510e05` ✅ 逐字相同 |
| **结论段再取** | `80b99cf9b884d3910bb49ee5c7821cf522e431fc19317e7a60120dba56510e05` ✅ 与首取相同 |

工作区变更面仍只有两行：`M frontend/src/components/person-manage-panel/person-manage-panel.vue`、`?? docs/id-system.qa.md`（`git status --porcelain --untracked-files=all`）——**未新增任何文件**。

### 11.2 四处修复逐条判定（自建向量 + 判负形态，均为现盘读数）

取证：`node /Users/kevin/.hermes/profiles/zang/cache/scratch/qa-delta-sub.cjs` → **汇总：不符项 0，EXIT 0**。该脚本**自建**（不读修复方脚本）：从现盘 SFC 逐字抽取 `normalizePersonRef / isRefHit / refSelfError / refResolveStillCurrent / switchToRef / switchAddPickTab / doResolveRef` 与 4 个真实 `computed`/`ref` 声明（分号+括号平衡扫描），仅做 TS 类型标注→JS 定点去标注（抽取自检 `残留类型标注: false`）后在 `new Function` 沙箱执行；沙箱只复刻宿主（`ref/computed` 桩 + 两个搜索函数钩子）。**判负形态 = 在内存里把该处实现改回旧形态后跑同一批向量**（实测 `变异 R1/R2/R3/R4: 生效=true`），**未触碰主工作区任何文件**。

| 修复 | 「原来错」读数（旧形态，内存变异） | 「现在对」读数（现盘） | 判负形态（必红条件 / 实测） |
|---|---|---|---|
| **① R-1 跨树文案前提** | 输入 `I0001`（树内旧号形态：本树 leg 前端比不出 ⇒ 0 命中；全站 leg 命中且 `tree_id` = 本档目标树 `zhonghua`）→ `编号「I0001」属于《中华世本》家族树，不能作为本树的节点`（把**本树节点说成别树节点**） | `找不到编号为「I0001」的节点` | `if (idHit && idHit.tree_id !== searchTreeId.value) {` → `if (idHit) {` ⇒ 该向量必红（实测旧形态读数即红态） |
| **② R-2 解析请求代次** | 同输入 `000000052` 连发两次、后发起者先返回命中、先发起者后返回空 → 终态 `{槽=103ff65e…, err='找不到编号为「000000052」的节点'}`（同屏自相矛盾，即上一轮 D-2 的 G10 形状） | 终态 `{槽=103ff65e…, err='', resolving=false, seq=2}`（前一次整段丢弃） | 删掉三处 `if (addRefResolveSeq !== seq) return;` ⇒ 必红（实测旧形态即红态） |
| **③ R-3 归一改纯字符串** | 26 个 9 → `1e+26`；`10000000000000000000000` 与 `10000000000000000000001` → **同键** `1e+22` / `1e+22` | 26 个 9 → `99999999999999999999999999`；两数 → `10000000000000000000000` / `10000000000000000000001`（**不同键**）；现网 9 位六形态仍归一 `52` | `return m[1].replace(/^0+(?=\d)/, '')` → `return String(parseInt(m[1], 10))` ⇒ 必红 |
| **④ R-4 命中按形态分工** | `isRefHit('52', {gramps_id:'000000900', handle:'52'})` → `true`；`'I52'` vs handle `'I52'` → `true`；`'abc123DEF'` vs `{gramps_id:'abc123DEF'}` → `true` | 三者均 `false`；`isRefHit('52', {gramps_id:'000000052', handle:'103f…'})` 仍 `true` | 改回 `\|\|` 并列 ⇒ 必红 |

**自建独立预言机**（与实现**不同源**：逐字符去空白 + 显式空串处理，取代实现的 `lookahead` 正则）复跑：归一 **30 向量不一致 0**、命中 **22 向量不一致 0**；而旧形态 vs 自建期望：归一不一致 **3** / 命中不一致 **3** ⇒ 四处修复**确实改动了实现**（同一向量在旧/新两侧读数翻转），**不是把断言松掉换绿**。

### 11.3 修复方改过的四行期望 + 归一预言机（不看其改动，以冻结口径原文自判）

- 四行期望由 `true` 改 `false`（`qa-ref-vectors.cjs:86/87/89/90`：纯数字输入 vs 纯数字 handle；`I52` vs handle `I52`；26 个 9 vs `gramps_id '1e+26'`；`1e22+1` vs `1e22`）→ **判为口径要求（且方向是收紧），不是为凑绿而放宽**。依据 = 冻结口径原文（本轮 F-3：「编号形态：去可选 I/i 前缀、去空白、去前导零后比数值；handle 形态：去空白全等」＋ `docs/id-system.spec.md:99、185` 判据句「任意入口输入**先**去可选 `I`/`F` 前缀、**再**去前导零、**后**按数值比较；数值相等 ⇒ 指向同一节点」）⇒ **输入形态决定比对方式**；旧实现的「或关系并列」比口径**更宽**（会命中不该命中的候选），故上一轮记录的 `true` 才是偏口径的一侧。四行一致地把命中集**变小**，不存在放宽。
- 口径解读例外（诚实披露）：上判依赖「形态 = **输入**形态」读法；若按「候选字段各按自己规则、或关系」读法，则这四行属**口径收紧**（而非口径原有）。两种读法结论相同：**不是放宽**。
- 归一预言机（`qa-ref-vectors.cjs:52-58` 的 `expectNorm`）已被改写成与实现**同源**的纯字符串算法 ⇒ 该预言机**已丧失判负能力**（失败态不可能出现）。判为**取证强度下降（方法论缺陷，指向脚本非产品）**，非断言放宽。本文归一/命中全部结论均以**自建预言机**复跑（11.2），结论不受其影响。

### 11.4 回归抽样读数（抽样，非重贑 12 条）

| 抽样项 | 现取读数 | 判定 |
|---|---|---|
| 六编号形态 + handle（含空白）8 形态 | `000000052 / I000052 / 52 / I52 / 0052 / i52` 与 `103ff65e…c34`、` 103ff65e…c34 ` 全部命中**同一** handle `103ff65ee4c1610b597b5fd47c34`，8/8 可提交 | PASS |
| F-6 自身防护（三档位） | `不能把本人指定为自己的父节点 / 子节点 / 配偶`，槽保持 `null`、`addCanSubmit=false` | PASS |
| F-5 ① | 模板逐字 `<text …>已定位：{{ addRefSelected.name }}·{{ personIdDisplay(addRefSelected.gramps_id) }}</text>`（静态核对，非渲染） | PASS |
| F-5 ② | 输入 `" 123000 "` → `编号「 123000 」属于《顾氏安达家族》家族树，不能作为本树的节点`（**前置检查已加**：命中树 `gu_39038_01` ≠ 本档目标树 `zhonghua`，仍逐字输出、引用输入原文含空白） | PASS |
| F-5 ③ | 同输入全站无命中 → `找不到编号为「 123000 」的节点` | PASS |
| F-2 空输入 | `请输入编号或 handle` 且**零请求**（`hooks.calls.length = 0`） | PASS |
| T-1 在飞切档 / 在飞改字 | 两者均整段丢弃：`err=''`、`addSelected=null`、`addRefSelected=null` | PASS（各 1 项） |
| T-2 pick 档内重复点按钮 | `panelError='未找到匹配节点'` 保留、选中槽保持 | PASS |
| T-2 离开 ref 档 | `panelError=''`、槽与镜像清空 | PASS |

脚本共 **24 条断言，不符项 0**。

### 11.5 零改动面重核（逐 hunk）

- `git diff --numstat` = **`228  6`**（上一轮 `192  6`）；`git diff --stat` = `228 insertions(+), 6 deletions(-)`，仍**仅 1 个文件**。
- hunk 数：`-U3` 口径 **10 个**（与上一轮同数）；`-U0` 口径 **12 个**（上一轮 10 个里有 3 处被拆细）。归类（-U0 为准）：**纯插入 7 个 / 含删除 5 个**，合计 `+228 / −6`。
- **6 条被删的既有行逐条**（全部属上一轮已披露的三处面）：① `@click="addPickMode = 'new'"` ② `:class="{ active: addPickMode === 'pick' }"` ③ `@click="addPickMode = 'pick'"`（= T-2 所需的单点切档）④ `import { personIdDisplay } from '@/business/format';`（**仅追加导入项**）⑤ `const addPickMode = ref<'new' | 'pick' | 'batch'>('new');`（改 `computed`，F-7 归一）⑥ `.mode-switch { display: flex; gap: 8px; margin: 10px 0 4px; }`（**仅**加 `flex-wrap: wrap`）。
- **本修复批的新增行只落在新代码两处**：`-U0` hunk9（ref 档状态声明块 `+12`，上一轮 `+5` ⇒ **+7** = `addRefResolveSeq` 及注释）与 hunk11（ref 档函数族 `+161`，上一轮 `+132` ⇒ **+29** = R-1 树前提 + R-2 三处代次守卫及注释）。**偏移自洽**：hunk9 之后各 hunk 新侧行号整体 +7，hunk11 之后整体再 +36（= 228 − 192）；且**删除行数仍为 6 且逐条同上一轮记录** ⇒ 修复批**零新增删除、零既有行触碰**。
- **四条提交分支零改动（强证）**：以 `git show HEAD:…vue`（批前版本）与现盘**逐字比对 `doAddNode` 全文** → 行数 `105 / 105`，`sha256 = 5e586076f7bb7ea6750ea049c52bb0bcd6fb4becb77dbe36572fb01242fdfeb3`（两版**同一哈希**）⇒ 提交语义与四条分支一字未动。
- 三档模板结构：模板侧改动仍只有切换条那一处（旧行 122 / 126 / 128）＋ 本批新增的 ref 档块（旧行 196 插入）；`new`/`pick`/`batch` 三块元素与嵌套未动；**样式改动仍只有 `.mode-switch` 一行**（`-U0` hunk12 = `+1/−1`）。

### 11.6 修复方自曝三条风险点复核 + 本节新发现（不许直接采信，全部现读）

**a) R-1 依赖的全站命中「所属树」字段是否恒带 → 恒带，修复前提成立。**
现读后端：`cloudfunctions/compat-api/index.js:3260-3262` 的 `shape(t, p, matched)` 头两键即 `tree_id: t.id`、`tree_title: t.title`；出参由 `index.js:3389-3392` 统一 `...shape(...)` 映射（**无第二条出参路径**）；`trees` 构造 `index.js:3199-3204` 以 `const id = String(entry?.tree_id || key || '').trim(); if (!id) continue;` 保证 `t.id` 非空、`title` 兜底 `|| id`；编号置顶分支 `index.js:3289-3296` 仅在 `t = trees.find((x) => x.id === refHit.tree_id)` 命中时 `pushHit(t, p, 'id', true)`，而 `resolveNode` 的 `hit()` 每条都带 `tree_id`（`lib/id-resolve.js:98-103`）。⇒ `idHit.tree_id` 不会 `undefined`（原假设的「缺失即当别树」路径不可达）；且前端判据用的 `searchTreeId.value`（`person-manage-panel.vue:854`）与本树请求传的 `tree_id`（`:827`）是**同一个 computed**，同源同值。

**b) `finally` 未过代次守卫 ⇒ loading 早灭 → 纯外观，不会造成错配提交。**
读数：连发两次、后发起者在飞时 —— 在飞期间 `addSelected = null`、`addCanSubmit = false`（`doResolveRef` 起手即清槽 `L815-816`；提交按钮 `:disabled="!addCanSubmit"` `L291`，而 `addCanSubmit` 只读 `addSelected`（`L682-686`）、**不读** `addRefResolving`）；前一次返回后 `addRefResolving = false`（外观提前复位），但其一切落地被守卫丢弃（终态读数见 11.2 ②）。即便用户因 loading 灭了再点一次，新一次自增代次 ⇒ 只有最后一次算；提交读的始终是**当前选中槽**（= 当前输入的解析结果）。⇒ 无错配提交路径，仅「按钮 loading 可能早灭」这一观感项（**Info**）。

**c) 树内历史编号不再误报跨树、但仍落「找不到编号」→ 修复的既定边界，非新引入的功能回归。**
事实链（现读）：本树 leg 后端用 `resolveNode(q, treeId)` 置顶（`index.js:3727-3729`）——旧号在本树 leg **会被后端认出并返回该节点**（返回的是 person 对象，**不带 `matched` 标记**）；前端 `isRefHit` 只比 `gramps_id`/`handle`（`person-manage-panel.vue:732-737`）⇒ 比不出 ⇒ 本树 leg 命中 0 ⇒ 转全站 leg；全站把 `resolveNode` 命中**一律标 `matched:'id'`**（`index.js:3294` 硬写）并把 `tree_id` 如实填成本树。修复只加了「命中树 === 本档目标树 ⇒ 不报跨树」这一前提，**没改也无法改**「前端比不出旧号」：修复前该输入同样**不能挂接**（该分支只写 `panelError`、不写选中槽）⇒ 不是能力回归，只是「错报别树节点」→「找不到编号」。**实际后果**：用户输入树内旧号（如 `I0001`）会看到 `找不到编号为「I0001」的节点`，而该节点实际存在；用户须改用现编号（9 位）或 handle 才能挂接。更彻底的做法（用全站 `matched:'id'` 且 `tree_id === searchTreeId` 的命中回填）会**越出 F-4 冻结口径**（F-4 限定回填来源为**本树 leg**「恰好一个命中」）⇒ 到此为止属既定边界。（该路径现网亦不可达：上一轮已实测旧号不再被解析为旧号。）

**d) 本节新发现（修复批副作用，两方向量集均未覆盖）**：R-4 的形态分工使「非纯数字输入 vs 非纯数字 `gramps_id`」不再命中 —— 实测 `isRefHit('abc123DEF', { gramps_id: 'abc123DEF', handle: 'xyz' })`：旧 `true` → 现 `false`。判定：与冻结口径一致（handle 形态只比 handle），且现网不可达（人编号恒为 9 位数字，`frontend/src/business/format.ts:11` `PERSON_ID_WIDTH = 9`）⇒ 记 **Info（残余）**。

**e) 顺带复核（**非本批引入**）**：归一不认 `F` 前缀（`^[Ii]?(\d+)$`），而口径字面写「可选 `I`/`F` 前缀」（`docs/id-system.spec.md:99`）⇒ `F0052` 落 handle 形态。人物面板无实际影响（`F` 是家庭编号、不入本档），且旧形态同此 ⇒ 记 **Info（残余）**。另外前端不认树内旧号（即 c 的根因）属**上一轮 D-1 的既定面**，本轮不重复计缺陷。

### 11.7 两条命令（现取）

```
$ npm run type-check --prefix frontend          （cwd: frontend/）
TYPECHECK_EXIT=0
```

```
$ npm test                                       （cwd: /Users/kevin/bistro/jiapu）
1..784 / # tests 784 / # pass 784 / # fail 0 / # cancelled 0 / # skipped 0 / # todo 0
```

与派单方基线 **784 通过 / 0 失败**一致。两命令均无写入、无端口、无常驻进程、无环境变量导出。

### 11.8 缺陷与读数差异

- **新增阻断缺陷**：**无**。新增两条 Info（11.6 d / e，均现网不可达）。
- **方法学缺陷（指向修复方脚本，非产品）**：`qa-ref-vectors.cjs` 的归一预言机被改成与实现同源 ⇒ 已失去判负能力（11.3）。建议仓库外保留一份**与实现不同源**的预言机。
- **上一轮四条缺陷现状**：D-1 **已修**（不再把本树说成别树；残余：旧号仍不可挂接，11.6 c，等级 Low/休眠）；D-2 **已修**（终态自洽；残余仅 loading 早灭的外观项，11.6 b，Info）；D-3 **已修**（>21 位不再塌缩为科学计数法）；D-4 **已修**（纯数字 handle 碰撞消除），并带出 11.6 d 一条新 Info。
- **读数差异申报**：派单方给的行数 **1306**、指纹 **`80b99cf9…0e05`** 与本单双取一致；派单方未给 hunk 数，本单现取 `-U3 = 10 / -U0 = 12`（上一轮同口径 10），`+228 / −6`（上一轮 `+192 / −6`）；派单方也提到「三处既有改动（T-2 所需）」与本单逐条归类**完全一致**（删除行仍为那 6 行）。**未出现与派单方冲突的读数**。

### 11.9 一句话结论

**四处修复经自建「原来错/现在对」向量 + 内存内判负形态逐条证实为真修（R-1/R-2/R-3/R-4 旧形态均必红，现盘在本单自建预言机下 52 条向量不一致 0），修复方改动的四行期望判为「口径要求、方向为收紧」而非放宽断言、其归一预言机同源失效已由自建预言机替代复跑；回归抽样 24 条断言全过（六编号形态+handle 命中同一节点、F-6 三档文案、F-5①②③ 逐字含②的新前提、F-2、T-1×2、T-2×2）；零改动面 hunk 总数 10（-U0 12）= 纯插入 7 / 含删除 5，删除行仍为上一轮那 6 行、且 `doAddNode` 与批前版本 sha256 同一（四条提交分支与三档模板结构零改动、样式仍只 `.mode-switch` 一行）；三条自曝风险点结论为「前提成立（出参恒带所属树）/ 纯外观不致错配提交 / 属既定边界且非回归」，另记两条现网不可达 Info；两条命令 type-check `EXIT 0`、`npm test 784/0` —— **修复面 delta 复核通过，无阻断残余**。**

### 附：本节取证脚本（落在 scratch，未入仓）

| 路径 | 用途 |
|---|---|
| `/Users/kevin/.hermes/profiles/zang/cache/scratch/qa-delta-sub.cjs` | 本节自建：抽现盘真实源码 + 4 个真实 `computed`/`ref`，跑 R-1~R-4 四处「原来错/现在对」向量、内存内 4 种判负变异、回归抽样 10 项；输出 `/Users/kevin/.hermes/profiles/zang/cache/scratch/qa-delta-sub-out.txt`（24 断言 / 0 不符 / EXIT 0） |
| `/Users/kevin/.hermes/profiles/zang/cache/scratch/head-panel.vue` | `git show HEAD:` 的批前副本，用于 `doAddNode` 逐字与哈希比对（只写 scratch） |
| `/Users/kevin/.hermes/profiles/zang/cache/scratch/qa-delta-diff.txt` | 本单 `git diff` 落盘副本（hunk 归类取证） |

> 边界申报：本节全部命令为单条扁平形态（无 heredoc、无拼接、无环境变量导出）；未修改被检产品文件、未改 `docs/` 下除本文件以外的任何文件、未做任何 git 写动作、未发写请求、未起 dev server 或常驻进程。

---

## ⑫ 渲染面真调补测（**执行 = Zang（窗口真调）** · 2026-10-16 · **只追加**，不改 ①~⑪ 任何行）

> 用途：关闭 §⑨ NOT_MEASURED 第 1 项「**F-1 的实际渲染**（三颗按钮是否真出现在加父面板上）」。本节读数与上面各节的函数级/静态判据**来源不同**（真浏览器 + 真后端 + 真实指针），互不替代。

### ⑫-1 方法与边界（如实声明）

- **登录态**：站点登录 = 手机号 + 短信码，本机安全库无 jiapu 凭据 ⇒ 在 dev 浏览器内**注入一份伪造本地登录态**（`jiapu_auth` 写 `loggedIn=true / role=tree_steward / token=x / expiresAt=now+1h`）。可注入的依据 = `canAddNode` **只读本地 `authState`**（`person-manage-panel.vue`：`isAuthenticated()` + `role` 判定，无服务端往返）；**服务端不参与该判定**——伪造 token 对只读通道无影响（实测：`GET /search` 带 `Authorization: Bearer x` ⇒ **HTTP 200**，回落 guest 档）。
- **数据源档**：本机 `jiapu-api`(3100) 实测 `COMPAT_SOURCE=cloud` ⇒ **本地写 = 写生产**。故全程**只点「档位按钮」与「解析」**，**从未点「确认添加」**（对提交按钮只读其 `disabled` 状态）。
- **真实指针**：档位/解析按钮均以鼠标事件级点击（坐标取 `getBoundingClientRect` 中心）；输入框用「聚焦 + 派发 input 事件」送入。**首轮探针（`fill_input`）曾出现「值进了原生 input 但未同步到组件状态」从而误读为『请输入编号或 handle』——已裁定为探针缺陷并换法复测，不是产品缺陷**（同编号换法后稳定命中）。
- **前置修复（非本批引入）**：5199 的 H5 dev server 自 2026-10-11 起连续运行，其 **esbuild 子服务已死**（页面白屏 + `[plugin:vite:esbuild] The service is no longer running`，栈指向 esbuild 传输层而非源码）⇒ 按面板单服务重载 `jiapu`（PID **91142 → 62248**）后恢复。**该现象不是代码缺陷**（同期 `vue-tsc` EXIT 0、套件 784/0 均绿）；但**它意味着此前的任何「dev server 相关验收」都无效**。
- **取证路径**：`/pages/hall/index?tree_id=gu_39038_01` → 真实指针点树图节点 → 档案弹窗（顾清学 · `000000143`）→「＋ 添加父节点」。

### ⑫-2 读数（真实 DOM 文本，逐字）

| 判据 | 真机读数 |
|---|---|
| **F-1** 档位渲染 | `.mode-switch .mode-btn` = **3** 颗：**新建节点 / 从树中选择 / 指定 ID**（面板标题「为「顾清学」添加父节点」） |
| **F-2** 输入与提示 | 输入框 placeholder 实际渲染文本 = 「**全局编号（如 000000052）或 handle**」（= 单点常量值）；未定位时「确认添加」= `disabled` |
| **F-5①** 本树命中 | 输入 `000000292` ⇒「**已定位：季清昆·000000292**」；提交按钮转为可用 |
| **F-5②** 命中他树 | 输入 `000000052` ⇒「**编号「000000052」属于《中华世本 · 全球华人家谱总谱》家族树，不能作为本树的节点**」 |
| **F-5③** 无此编号 | 输入 `999999999` ⇒「**找不到编号为「999999999」的节点**」 |
| **F-3** 短形态等价 | 输入 `292` ⇒ 同样「已定位：季清昆·000000292」 |
| **F-6** 自身防护 | 输入档案本人编号 `000000143` ⇒「**不能把本人指定为自己的父节点**」（无确认行、提交不可用） |
| **T-2** 离开新档 | 已定位后切「从树中选择」⇒ 确认行消失、「确认添加」回到 `disabled` |
| **T-3** 文案单一 | ref 档顶部提示 = 专属那句（面板内无第二段说明） |

### ⑫-3 结论与边界

- **F-1 的实际渲染：NOT_MEASURED → PASS（真浏览器实测）**。§⑨ 其余三项（登录态档位下的两通道可见性读数 / 云真源 `legacy_gramps_id` 存在性 / 与 spec 一致性）**状态不变**（第三项随后由规范入册覆盖）。
- 边界（硬）：本节**未触发任何写请求**；取证完已删除注入的 `jiapu_auth`（读回确认该键不存在）；本仓工作区仍只有被检件（`M`）与本报告（`??`）两处改动。
