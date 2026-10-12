# 竹片扣费闸门 — 规格（economy-fee.spec.md）

> 状态：**设计已确认（Kevin 2026-09-16）· 待实施**
> 真源级别：规格文件。实施（compat-api / frontend）必须与本文件一致；与 `docs/data-model.md`、`docs/permission-tier.spec.md`、`docs/marriage.spec.md`、`docs/clan-tree.spec.md` 冲突时以本文件为准并同步修订彼文件。**与 docs/economy.spec.md（总纲）冲突时，一律以总纲为准并回改本册。**
> 本册是**经济总册 `docs/economy.spec.md` 的扣费分册**：只规定「哪些写操作扣多少竹片 / 石榴籽、在哪一步扣、失败怎么回滚、前端怎么提示」。
> **存储契约（集合与批次结构）、有效期常量、FIFO/sweep 算法、`Tx.type` 枚举由总册唯一权威定义**（`docs/economy.spec.md` §3–§5、§4-6）；本册逐字引用、不改字段、不改算法契约；本册需总册补内容时只在实施报告里提出、不擅自动手改总册（本册曾提出的 5 项已由总册终审裁定同步，见 §13）。
> 本分册落盘文件名 `docs/economy-fee.spec.md`；总册中曾出现的多一个字母 s 的笔误写法，已由总册终审裁定统一为 `docs/economy-fee.spec.md`（本册不改总册）。
>
> **本册与总册的固定对齐表（实施时逐条照抄，不得自创）**
>
> | 项 | 总册出处 | 本册一律采用 |
> |---|---|---|
> | 存储契约 / 批次字段 | 总册 §4-1 | 集合 `jiazu_assets`（`_id='global'`），字段名逐字一致 |
> | `Tx.type` 枚举 | 总册 §4-6 | **一律取总册枚举，本册不自造类型**：人物内容修改 / 同树改父 = **`edit_fee`**；删除节点 = **`delete_fee`**；跨树迁移（带 `new_parent_tree_id`）= **`move_fee`**；建树扣 9 籽 = **`tree_create`**；冲正返还 = **`fee_refund`**；签到 `signin`；过期 `expire`；运营发放 `admin_grant` |
> | 有效期 | 总册 §5-3 | 籽 **365 天**、竹片 **365 天**（到期作废、不返还、不折算）；碎片**无期限**；玉 `expires_at = null` 恒不过期 |
> | 惰性结算 | 总册 §5-4 | **任何资产读/写入口先 `sweep(now)`**，再执行业务逻辑；`qty=0` 的批次由 sweep 移除 |
> | 扣减优先级 | 总册 §5-2 | FIFO by `expires_at` 升序 + **整单拒绝 409**，绝不部分扣、绝不透支 |
> | 建树扣 9 籽 | 总册 §5-5 | 校验通过后落库前扣；失败不扣；已扣而落库失败 → **原路返还同一批次**；删树不退 |
> | 无豁免通道 | 总册 §5-6-3 | 管理员 / `chief_editor` 同样不例外 |
> | 资产读接口 | 总册 §6-1 | **`GET /assets/summary`**（本册不另造 `/assets/balance`） |
> | 路由挂载位置 | 总册 §6 注 | 资产路由必须挂在 `index.js` 树编辑闸门（约 1586 行 `缺少 X-Tree-Id`）**之前** |
> | **调整同胞排行单价（本册追加 · 2026-09-23）** | 总册 §4-6（`Tx.type` 枚举）；本册 §3-1 #36 / **§15** | **1 片竹片 / 次**；`Tx.type` **复用既有枚举 `edit_fee`**（不自造类型）；**no-op = 0 片**；`ref.tree_id` + `ref.person_handle` = **被拖动的子女节点**；业务域规格见 `docs/sibling-order.spec.md` |
> 关联：`cloudfunctions/compat-api/lib/wallet.js`（既有 ¥ 建树费）、`lib/tree-write.js`（updatePerson / reparentNode / deleteNode / createTree / appendChainNode / addSpouseNode / splitTree / removeBranchLink）、`lib/child-write.js`（add-child 跨树）、`lib/store.js`（updateTree / updateTrees）。

---

## 1. 已确认口径（Kevin，逐条写死）

| # | 口径 | 对设计的影响 |
|---|---|---|
| 1 | **新增类一律 0 片**：加父、加子、加配偶、挂接已有节点、总谱续编（chain-append）、认祖、建谱、跨树嫁娶（嫁出/娶入/绝婚/合离）及其审批、解除挂载、绑定类、`POST /people` 与 `POST /families` 新增 | 这些路由**不接扣费闸门**；本册在矩阵里逐行标 0 片，杜绝实施时"顺手加一刀" |
| 2 | **总谱续编属新增 → 不扣**（明确口径） | `POST /admin/chain-append` 两个模式（new / attach）都是 0 片 |
| 3 | **修改删除类扣费**：人物节点内容修改 1 片 / 节点；同树改父 1 片 / 节点；跨树改父（整体迁移）**9 片 / 次**；删除节点 **3 片 / 节点**（两模式同价，subtree 模式 N 人 = 3N 片） | 只有 4 个操作计费，全部走同一闸门模块 |
| 4 | 跨树改父 **9 片 / 次，与带多少后代无关**（用户明确覆盖了"按迁移人数计费"的建议） | 不得实现为 `9 × 人数`；迁移 1 人和迁移 200 人同价 |
| 5 | 删除节点：**批量删除多条人物节点，每条节点独立扣费，不合并计费** | subtree 模式 = `3 × people_count`；promote 模式 = 3 片；永不"打包折扣" |
| 6 | 扣费范围：**所有树都扣**（含中华世本 `zhonghua` 与祖谱 `kind='clan'`），**无豁免通道** | 不按 `treeId === MASTER_TREE_ID` 或 `kind` 免单；但始祖 / 上层镜像本就是只读节点，写不进去 → 403，不存在扣费 |
| 7 | 建树：`POST /admin/create-tree` 由原 ¥9.90 **改为扣 9颗石榴籽**；成功才扣，失败不扣 / 原路返还；**删树不退** | 替换 `wallet.deductTreeCreateFee(u.phone)` 钩子；`jiazu_wallets` 保留（充值 / 转账仍用它） |
| 8 | 扣减优先级：籽 / 竹片一律 **FIFO by `expires_at` 升序**；不足 → **整单拒绝 409**「资产不足，需 X 片竹片，当前 Y 片」 | 绝不部分扣、绝不透支、绝不先扣一部分再报错 |
| 9 | 闸门必须**先扣费成功再落库**，且与既有写入同事务语义：跨树迁移的扣费要与 `store.updateTrees` 的双树事务一致（**扣费失败 → 两棵树都不写**；**写入失败 → 扣费回滚**） | 禁止出现「扣了片但没改数据」与「改了数据但没扣片」两种脏态 |
| 10 | 未登录 / 无权限 → **401 / 403，且不得先扣费**（权限校验必须在扣费之前） | 路由内固定顺序：鉴权 → 只读预检 → 余额预检 → 扣费 → 落库 |

---

## 2. 存储契约（唯一权威：总册；本册逐字一致，不得更名）

集合 `jiazu_assets`（`_id='global'`）：

```
{ users: { <手机号>: { fragments, seeds: SeedLot[], bamboos: BambooLot[], jades: Jade[], txs: Tx[], signin_date } } }
```

- `SeedLot = { id, qty, expires_at, source, created_at }`
- `BambooLot = { id, qty(片), expires_at, source, created_at }`
- `Tx = { id, ts, type, delta:{fragments?,seeds?,bamboos?,jades?}, fee_seeds?, ref:{tree_id?,listing_id?,trade_id?,person_handle?}, desc, operator? }`
- 竹片最小单位 = **片**（1 束 = 100 片）。

本册**不新增任何字段**，只按总册 §4-1 的既有字段写入：

| 用途 | 写法（类型名一律取总册 §4-6 枚举） |
|---|---|
| 扣竹片（修改 / 删除 / 迁移） | `BambooLot.qty -= n`（按 `expires_at` 升序逐批）；`Tx.type` 取总册枚举（人物内容修改 / 同树改父 `edit_fee`、删除节点 `delete_fee`、跨树迁移 `move_fee`）、`delta.bamboos = -n`、`ref.tree_id` / `ref.person_handle`、`desc` 写人类可读说明（如「修改节点 季志全」）、`operator` 写发起人手机号 |
| 扣石榴籽（建树） | `SeedLot.qty -= n`；`Tx.type='tree_create'`、`delta.seeds = -n`、`fee_seeds` 留作市集手续费字段（**本册只登记口径、不实现**：市集手续费 = **floor(标价 × 1/100) 籽**、**0 则免收**、**扣籽不扣竹片**（标价 199 → 买方 199 / 卖方 198）；细则见 `docs/economy.spec.md` 市集章节） |
| 冲正（回滚） | 追加一条 `Tx.type='fee_refund'`、`delta` 取原 Tx 反向值、`ref` 沿用原 `ref`、`desc` 写明原 Tx id；**原路返还同一批次**（恢复该 lot 的原 `qty` 与 `expires_at`，**不新造批次**，总册 §5-5-3） |
| 余额口径 | 先 `sweep(now)`（总册 §5-4）：剔除 `expires_at <= now` 的籽 / 竹片批次并各写一条 `type='expire'` 流水；随后**只计剩余批次**。碎片无期限、玉 `expires_at = null` 恒不过期 |
| 碎片 | 按总册 §3-1：**永不参与扣费**（本册任何一行都不读 `fragments` 做扣减）、永不过期、不可交易 |

---

## 3. 扣费矩阵总表

### 3-1 主表（穷举本轮列出的全部现有写路由，无空项、无「待定」）

`片数` 列一律以**竹片**为单位；唯一例外是第 8 行（建树，石榴籽）与第 34 行（立支，石榴籽）。

| # | 操作 | 路由 | 类别 | 片数 | dry_run 豁免 | 备注 |
|---|---|---|---|---|---|---|
| 1 | 人物节点内容修改（姓名/性别/生卒/健在/称号三字段） | `PUT /people/<handle>` | 修改 | **1 片 / 节点** | 无 | 一次 PUT = 一个节点 = 1 片；总谱节点同价（口径 6）；始祖 / 上层镜像只读 → 403 不扣 |
| 2 | 同树改父 | `POST /admin/reparent`（**不带** `new_parent_tree_id`） | 修改 | **1 片 / 节点** | 无 | 只改本节点挂靠 + 原家族清理；后代不动，不按后代计费；总谱世数平移不额外计费 |
| 3 | 跨树改父 / 整体迁移 | `POST /admin/reparent`（**带** `new_parent_tree_id`） | 迁移 | **9 片 / 次** | 无 | **定稿：与带多少后代无关**（口径 4）；不得写成按迁移人数递增计费；源树 / 目标树都写，一次计一次 |
| 4 | 删除节点 · 整支（subtree）正式提交 | `POST /admin/delete-node`（`mode='subtree'`，`dry_run≠true`） | 删除 | **3 片 × N**（N = `people_count`） | — | 需求原文：批量删除多条人物节点，**每条节点独立扣费，不合并计费** |
| 5 | 删除节点 · 仅本节点（promote）正式提交 | `POST /admin/delete-node`（`mode='promote'`，`dry_run≠true`） | 删除 | **3 片** | — | 两模式同价；子女上提一级不额外计费 |
| 6 | 删除节点 · 预演 | `POST /admin/delete-node`（`dry_run=true`） | 删除 | **0 片** | ✅ dry_run | 只算不写；响应须带 `fee` 供前端拼确认文案 |
| 7 | 删除节点 · 确认数不符 | `POST /admin/delete-node`（`confirm_count` 与实际 `people_count` 不符 → 409） | 删除 | **0 片**（409 前不扣） | — | 校验在扣费之前；重跑 dry_run 后重新提交才扣 |
| 8 | 新建家族树 | `POST /admin/create-tree` | 建树 | **9颗石榴籽**（非竹片） | 无 | 原 ¥9.90 改口径；**成功才扣**，失败不扣 / 原路返还；**删树不退** |
| 9 | 添加子节点（父母均在本树） | `POST /admin/add-child` | 新增 | **0 片** | — | 新增类 |
| 10 | 添加子节点（跨树婚姻家庭 → 子女落父真身树） | `POST /admin/add-child`（父为镜像，`cross_tree=true`） | 新增 | **0 片** | — | 跨树也不扣：一次操作只新增节点 |
| 11 | 添加父节点（前端 `addParentNode`） | `POST /people/` + `POST /families/` | 新增 · 绑定 | **0 片** | — | 加父 = 新建 person + 建家族绑定，两步都属新增 / 绑定 |
| 12 | 添加配偶（同树 · 新建） | `POST /admin/add-spouse`（`mode='new'`） | 新增 · 关系 | **0 片** | — | 补空位与"家族已满再建新家族（再婚）"同价 0 |
| 13 | 挂接已有节点为配偶 | `POST /admin/add-spouse`（`mode='attach'`） | 关系 | **0 片** | — | 挂接类 |
| 14 | 新建人物 | `POST /people/` | 新增 | **0 片** | — | 用户明确列入 0 片清单 |
| 15 | 新建家族（关系绑定） | `POST /families/` | 新增 · 绑定 | **0 片** | — | 用户明确列入 0 片清单 |
| 16 | 更新家族（父/母/子女槽位改组） | `PUT /families/<handle>` | 修改 · 绑定 | **0 片** | — | 绑定类；不在修改删除类扣费清单内（见 §11-5） |
| 17 | 总谱续编 · 新建 | `POST /admin/chain-append`（`mode='new'`） | 新增 | **0 片** | — | 口径 2：总谱续编属新增，不扣 |
| 18 | 总谱续编 · 挂接 | `POST /admin/chain-append`（`mode='attach'`） | 新增 · 挂接 | **0 片** | — | 同上 |
| 19 | 认祖发起 | `POST /admin/founder-request` | 新增 · 关系 | **0 片** | — | |
| 20 | 认祖审批（回写始祖） | `POST /admin/decide-founder` | 新增 · 审批 | **0 片** | — | 审批类不扣（口径 1） |
| 21 | 始祖挂载（直接挂） | `POST /admin/attach-founder` | 新增 · 关系 | **0 片** | — | 挂接已有节点 |
| 22 | 解除挂载（下层树侧） | `POST /admin/detach-founder` | 关系解除 | **0 片** | — | 用户明确：解除挂载 0 片 |
| 23 | 分迁链接清除 | `POST /admin/remove-branch-link` | 解除挂载 | **0 片** | — | 同类动作同价 |
| 24 | 重置始祖 | `POST /admin/reset-founder` | 修改 · 治理 | **0 片** | — | 只写 `tree-meta`，不属人物节点 |
| 25 | 建谱申请 | `POST /admin/clan-request` | 新增 | **0 片** | — | |
| 26 | 建谱审批（建 `kind='clan'` 树） | `POST /admin/decide-clan` | 新增 · 审批 | **0 片** | — | 祖谱建树**不走**建树费：建谱是新增类且是审批产物（口径 1、2） |
| 27 | 跨树嫁娶申请（嫁出 / 娶入 / 合离） | `POST /marriage-request` | 新增 · 关系 | **0 片** | — | |
| 28 | 嫁娶审批通过（双侧写入） | `POST /admin/approve-marriage` | 新增 · 关系 | **0 片** | — | 即使走 `updateTrees` 双树事务也不扣 |
| 29 | 嫁娶驳回 | `POST /admin/reject-marriage` | 审批 | **0 片** | — | 不改数据 |
| 30 | 绝婚（男方单方生效） | `POST /admin/marry-end` | 关系解除 | **0 片** | — | 关系解除 ≠ 删除节点；明确列入 0 片 |
| 31 | 拆分家族树 | `POST /admin/split-tree` | 建树 · 迁移 | **0 片**（默认口径，见 §11-3） | — | 不新增节点、不删节点内容 |
| 33 | 树元信息修改（标题 / 堂号 / 郡望等） | `PUT /tree-meta` | 修改 · 治理 | **0 片** | — | 见 §11-6；治理类，非人物节点 |
| 34 | 立支（普通家族树的普通节点立为新家族树的始祖；祖先链上移并入宗谱） | `POST /admin/establish-branch` | 建树 · 迁移 | **9999 颗石榴籽 / 次**（**不是竹片**） | 不适用（**无 `dry_run`**） | 扣费内核引用总册（存储契约 / 扣减算法）的籽扣减：从**发起人个人**资产 FIFO by 最早到期扣、整单不足 409 `ASSET_INSUFFICIENT`、绝不部分扣；与建树费（第 8 行）同档口径但**金额不同**（9999 ≠ 9）；在权限校验与全部结构校验通过后、写库前扣，**失败原路返还同一批次**（`fee_refund`）；后台可配（`jiazu_wallets.config.branch_fee_seeds`，默认 9999）；完整口径见 `docs/branch-clan-ops.spec.md` |
| 35 | 汇宗（家族树整体并入另一棵普通树的普通节点之下） | `POST /admin/converge-clan` | 迁移 · 并入 | **0 片 + 0 籽** | 不适用（用 `confirm_people` 二次强确认，**无 `dry_run`**） | 整树并入类：**不接竹片闸门、不扣籽**（与新增 / 迁移类同价）；`confirm_people` 不符 409 范围变化时同样不扣不写；**资产折损并入**（源树灵气剩余有效期 × 比例累加至目标树）见 `docs/branch-clan-ops.spec.md` §3-10 与 §6-2-6（比例键 `converge_spirit_ratio`，默认 0.5） |
| 36 | 调整同胞排行（子女标签拖曳排序：重排 `family.child_handles[]` 的**数组位次**） | `POST /admin/sibling-reorder` | 修改 | **1 片 / 次** | 不适用（**无 `dry_run`**；no-op 由后端裁定 → 0 片） | **本册追加 · 2026-09-23**（报价 / 闸门 / no-op / 错误码逐字见 **§15**）：`Tx.type` **复用既有枚举 `edit_fee`**（**不自造类型**）；`ref.tree_id` + `ref.person_handle` = **被拖动的子女节点**，`desc` 例「调整排行：<姓名> 第 N 位」；**与被动移位的兄弟数量无关** —— 一次「确定保存」= 一次计费；**no-op（提交序与现值逐位相同，含拖回原位）= 0 片 + 不写库 + 无流水**；**只扣竹片、不扣籽**；业务域规格 = `docs/sibling-order.spec.md` |

| 37 | **好友续约确认**（双边各消耗 **1 枚成品兰帖**） | 好友续约确认（**拟定字面** `POST /friends/renew-confirm`；**路由字面以落地实现为准** —— 属 `docs/friend-domain.spec.md` §15-6 的**未裁字面**，**不得据本行推定路由**） | 扣费（**道具**，非竹片） | **0 片（不走竹片）** + **每侧 1 枚成品兰帖** | 不适用（**无 `dry_run`**） | **本册追加 · 2026-09-25（Z-10a）**：**扣的是成品兰帖（行囊道具），不是竹片** ⇒ 本行的「片数」列恒 **0 片**、**不接竹片闸门**；**`Tx` 类型取值以实现为准**（引述 `docs/friend-domain.spec.md` §9-3 的拟定值 `friend_renew`，**未裁前不得据任一名判负**）；**发起时只锁定、不扣除**（**锁定真源 = 关系文档 pending 对象**；**解锁路径零流水**）、**确认时双边各扣 1 枚**（**各写一条**）—— 完整口径 = `docs/friend-domain.spec.md` **§17-9-B（Z-2）**；**余额不足 ⇒ 整单拒绝**（沿用本册 §4-2 / §4-3 事务语义；**不得部分扣**）；**成品兰帖本轮不可交易 / 不可转赠**（**Z-6** ⇒ 该册 §17-9-C-6）；业务域规格 = `docs/friend-domain.spec.md` **§8 / §17-9-B** |
| 38 | 谱名修改（【在线文谱】工具条【✎ 修谱】左侧【修改谱名】） | `POST /admin/tree-rename` | 修改 · 治理（**非人物节点**） | **999 / 9999 / 99999 片**（三档；按 Δ = now − `genealogy_name_updated_at` 判定） | 不适用（**无 `dry_run`**；**no-op 同值 ⇒ 0 片**） | **本册追加 · 2026-10-12**：首次（无历史）/ Δ≥360 天 ⇒ **999**（`first_or_expired`）、30 ≤ Δ < 360 ⇒ **9999**（`within_360d`）、Δ < 30 ⇒ **99999**（`within_30d`）；天数 = `Math.ceil(Δ/86400000)`；**无免费档**、**不退**（唯一例外 = 系统失败原路返还）、不足 **409 `ASSET_INSUFFICIENT`** 整单不写；`Tx.type` **复用既有枚举**（取值见 §17-8 第 1 条）；**实扣写 `jiapu_ops_logs`（`op='tree_rename_fee'`）**；逐字口径见 **§17** |

> **移除说明（本表唯一的移除项）**：原 **#32 晋宗（祖先链并入世本）| `POST /admin/promote`** 整行已随功能下线**移除**（2026-09-17 产品决策：该操作整体移除，路由与 `promoteTree()` 一并删除，由新的【立支】/【汇宗】两条操作取代）；**表内其余编号保持不变、不重排**（即编号 #32 在本表中空缺，后续新增行续编 #34、#35），本行只作留痕、不再有单价与闸门口径。

**合计口径**：主表 **34 行**（编号排到 #35，其中 **#32 空缺**），其中 **扣费行 7 行**（#1–#5、#8、#34），**0 片行 27 行**（#6、#7 及 #9–#31、#33、#35）。

> **合计口径（本册追加 · 2026-09-23 · 取代上一行，上一行原文保留）**：新增 **#36 调整同胞排行（1 片 / 次）** 一行后 —— 主表 **35 行**（编号排到 **#36**，其中 **#32 空缺**），**扣费行 8 行**（#1–#5、**#8**、**#34**、**#36**），**0 片行 27 行**（#6、#7 及 #9–#31、#33、#35）；**校验 = 8 + 27 = 35**。上一行的 **34 行 / 扣费 7 行 / 0 片 27 行** 系 **#36 落盘前** 读数、**已陈旧**（**该行不改写**，此处只追加取代登记）。**编号不重排**（延续 §3-1 移除说明的制度：新行续编，**#32 空缺保留**）。

> **合计口径（本册追加 · 2026-09-25 · Z-10a · 取代上方两行，**前两行原文保留、不改写**）**：新增 **#37 好友续约确认（**0 片**；**消耗成品兰帖 1 枚 / 侧**）** 一行后 —— 主表 **36 行**（编号排到 **#37**，其中 **#32 空缺**），**扣费行 9 行**（#1–#5、**#8**、**#34**、**#36**、**#37**），**0 片行 27 行**（#6、#7 及 #9–#31、#33、#35）；**校验 = 9 + 27 = 36**。**#37 计入「扣费行」**（**消耗的是成品兰帖道具**，**竹片 0 片**）；上方两行的 **34 行 / 扣费 7 行 / 0 片 27 行** 与 **35 行 / 扣费 8 行 / 0 片 27 行** 系 **#36 / #37 落盘前** 读数、**已陈旧**（**那两行不改写**，此处只追加取代登记）。**编号不重排**（延续 §3-1 移除说明的制度：新行续编，**#32 空缺保留**）。

> **合计口径（本册追加 · 2026-10-12 · 取代上方各行，上方各行原文保留、不改写）**：新增 **#38 谱名修改（999 / 9999 / 99999 片 · 三档）** 一行后 —— 主表 **37 行**（编号排到 **#38**，其中 **#32 空缺**），**扣费行 10 行**（#1–#5、**#8**、**#34**、**#36**、**#37**、**#38**），**0 片行 27 行**（#6、#7 及 #9–#31、#33、#35）；**校验 = 10 + 27 = 37**。**编号不重排**（延续 §3-1 移除说明制度：新行续编，**#32 空缺保留**）。

### 3-2 附录：其余写路由（本册一律 0 片，不受扣费闸门约束）

| 路由 | 类别 | 片数 |
|---|---|---|
| `POST /join-request`（发起） / `GET /admin/join-requests`（列待办） / `POST /admin/approve-join`（审批通过；需 `id` + `person_handle`） / `POST /admin/reject-join`（驳回；可带 `reason`） | 加入申请 · 审批 | 0 |
| `POST /leave-request`（发起） / `GET /admin/leave-requests`（列待办） / `POST /admin/approve-leave`（审批；**传 `approve:false` 即驳回**） | 退出申请 · 审批 | 0 |
| `POST /admin/set-role` / `POST /admin/set-anchor` | 治理 | 0 |
| `PUT /admin/wallet-fee` | 治理（¥ 费率配置） | 0 |
| `POST /wallet/recharge` / `POST /wallet/transfer` | ¥ 钱包 | 0（走 `jiazu_wallets`，与竹片互不换算） |
| `POST /auth/send-code` / `/auth/login` / `/auth/register` | 账号 | 0 |
| `POST /admin/chain-append-batch`（总谱**批量**续编「一条线单传」，≤ 10 代 / 批；`docs/chain-batch-append.spec.md`） | 新增 · 总谱批量续编 | 0（与 #17/#18 单节点续编同口径：新增类不扣） |

> **本附录条数变更（2026-09-18）**：本批新增 `POST /admin/chain-append-batch` 一条 0 片路由 → 单测 `economy-fee.test.js` 的 **`ZERO_FEE_ROUTES` 清单条数由 29 → 30**，
> 断言行同步为 `assert.equal(ZERO_FEE_ROUTES.length, 30, '0 片清单条数固定（矩阵即契约）')`（测试标题也从「29 条」改为「30 条」）。
> §3-1 主表**不重排、不复编**：批量续编按本册既有惯例（新增路由续入附录、主表编号纪律见 §3-1 移除说明）只登记在本附录，主表的合计口径（34 行 / 扣费 7 行 / 0 片 27 行）**保持不变**。
> **本清单必须与 `compat-api/index.js` 实际路由一致；不得列幽灵路由**（实施与复审时逐条核对 `index.js` 中 `pathname ===` 的分支判断；示例：leave 类驳回走 `POST /admin/approve-leave` 传 `approve:false`，**没有** `POST /admin/reject-leave`）。

---

## 4. 扣减算法（**算法本体在总册**；本册只规定闸门顺序）

### 4-1 FIFO 扣减（引用总册 §5-2）
- **算法唯一实现在总册规定的资产模块**（总册 §10 的 `lib/assets.js` 口径）；本册的 `lib/economy-fee.js` 只做薄封装（单价表 + 闸门顺序 + 冲正编排），**不自写第二套 FIFO**。
- 取该用户 `bamboos[]` 中未过期批次，按 `expires_at` **升序**排列，逐批扣到需求量用尽。
- 扣减后恰好耗尽的批次 `qty = 0` → **由 `sweep` 移除**（总册 §5-2-3、§5-4），**不在列表里留 0 批次**，也不在扣费函数内直接 `delete`。
- 石榴籽同规则，但最小单位是**颗**：`qty` 必须整数；「完整石榴籽」= 整颗（不拆分、不接受小数尾巴）。

### 4-2 整单拒绝（引用总册 §5-2、§5-6-3）
- **入口先 `sweep(now)`**，再算可扣总量；可扣总量 `< 需求量` → **抛 409，一个批次都不动**。
- 禁止实现：先扣能扣的、再报错；或允许余额为负。
- **无任何豁免通道**：管理员、`chief_editor`、总谱、祖谱一律同价同拦截（总册 §5-6-3）；本册不设"内部账号免单"。

### 4-3 事务语义（本册的核心闸门）
固定顺序，任何一步失败都不产生脏态：

```
① requireWriteUser(...)                  → 401 / 403（不读资产、不扣费）
② 只读性预检（assertFounderEditable 等）  → 403（不扣费）
③ 余额预检 quoteBamboo(phone, need)       → 不足 → 409（不写任何一棵树）
④ 扣费 chargeBamboo(...)                  → 写 jiazu_assets + Tx
⑤ 落库（updateTree / updateTrees 闭包体内执行）
⑥ 落库失败 → refundAssets(phone, txn_id)  → 追加 fee_refund 冲正
```

- **单树路由（1 / 2 / 4 / 5 / 8 行）**：④ 在调用 `tw.*` 之前；⑤ 抛错时在路由 `catch` 里先冲正再把原错误抛出。
- **删除节点（`tw.deleteNode`）**：④ 必须在 `updateTrees([treeId], …)` **闭包体的第一步**（`removePeopleFromTree` 之前）——闭包抛错 → `updateTrees` 不写树，同时由 `deleteNode` 在自身失败路径里调 `refundAssets`。
- **跨树迁移（`tw.reparentAcrossTrees`）**：④ 必须在 `updateTrees([treeId, targetTreeId], async (trees) => { … })` 闭包体的第一步（`moveLineage(...)` 之前）。效果：
  - 扣费失败（409）→ 闭包抛错 → `updateTrees` 两棵树都不写 ✅
  - `moveLineage` 或 `checkTreeIntegrity` 或 `saveTree` 抛错 → 事务回滚树快照 + 闭包外 `refundAssets` 冲正 ✅
  - 详情文档随迁是 best-effort（既有语义），**不因它失败而冲正**（结构真源已落库）。
- **建树（第 8 行）**：`onBeforeWrite` 钩子内扣籽（`treeId` 在 `onBeforeWrite` 之前已由 `nextTreeId` 生成，可写进 `ref.tree_id`）；`createTreeFile` / `saveMeta` 失败 → 路由 `catch` 冲正。
- **详情后写（`PUT /people/<handle>`，2026-09-18 缺陷 B 修正）**：`lib/tree-write.js` 的 `updatePerson` 改为**树 JSON 落盘成功之后才写详情文档**；详情写失败 → **不回滚树、不冲正**（已提交的树改动不得被撕成失败并退费，否则等于送一次免费更改），只在返回里带 `detailSaved:false` → 路由响应 `200 {ok:true, fee:…, detail_warning:'称号/档案信息未保存，请重试'}`。
  - 反向（树落盘失败 / 业务校验抛错）→ **详情字节不变**（详情在闭包内只组装、不落盘）→ 冲正 + 原错误出码。
- **失败侧缓存不变量（缺陷 B · 单树写路径）**：`lib/store.js` 的 `saveTree` 落盘失败 → **原地回滚 `version` / `updated_at`** 且**失效 `treeCache` / `eventIndexCache`**；`updateTree` 闭包（含业务校验）抛错 → 同样失效 `treeCache` / `eventIndexCache`（与 `updateTrees` 的失败处理同口径）→ 任何调用方下一次 `getTree` 都从磁盘读真值，**盘上没有的幻影结构不得留在进程内缓存**（完整规则见 `docs/data-model.md` §7）。
- **系统级失败出码**：错误出口统一 `errorStatusOf` —— **业务错误沿用自身 status**（404 / 400 / 403 / 409…），**系统级失败（EACCES / ENOENT / EPERM 等 errno 类 code/name）一律 500 + 通用文案**（不吐本机路径）；已扣费的成功路径失败时同响应带 `fee_refunded:true`。
- **绝不出现**：先改数据后扣费；或扣费与落库之间夹着第二个 `await` 才做的权限校验。

### 4-4 惰性结算与过期批次（引用总册 §5-4）
- **本册不设"过期清理定时任务"**：所有扣费与余额读数前一律先 `sweep(now)`（总册 §5-4-1、§5-4-5），由 sweep 剔除过期批次并写 `type='expire'` 流水。
- 过期批次在扣费与余额口径里**一律视为 0**（sweep 之后本就不在列表内）。
- 冲正回填时保留原 `expires_at`（不因冲正而"续命"；总册 §5-5-3 的"同一批次"口径）。

### 4-5 冲正还原与批次数组顺序（非契约）

- **冲正按原 `lot_id` / `qty` / `expires_at` 复原**：只恢复该批次的原 `qty` 与到期时间（总册 §5-5-3「原路返还同一批次」口径），不新造批次，也不改 `source` / `created_at`。
- **批次在数组中的位置可能与扣费前不同**：扣减时被扣尽的批次（`qty = 0`）已由 `sweep` 移除（§4-1），冲正复原时该批次 **append 回 `bamboos[]` / `seeds[]` 的数组尾**，不会回到原下标。
- **FIFO 只依赖 `expires_at` 升序，批次数组顺序不是契约**：任何调用方（含前端展示、流水核对、快照 diff）**不得依赖 `bamboos[]` / `seeds[]` 的元素顺序**；需要稳定展示时由调用方自行按 `expires_at` 升序（同到期再按 `lot.id`）排序。
- **对比冲正前后的一致性应使用按 `lot.id` 排序后的指纹**（按 `lot.id` 升序排序后再序列化取 JSON / md5）：直接对批次数组做逐元素 diff 会因位置变化而误报差异；§9-1 第 8 条的「资产总分还原」断言即属此类顺序无关口径。

### 4-6 no-op 编辑不扣费（缺陷 A 修正 · 2026-09-18 · 已拍板）

**适用路由**：`PUT /people/<handle>`（§3-1 第 3 行，单价 1 片）。**值级比对**发生在 ④ 扣费**之前**（②′，紧随只读预检）；判为 no-op 则**完全不进扣费闸门**。

**判定实现**：`lib/economy-fee.js` 的 `personValueDiff(body, person, detail)` → `{changed, fields}`；`isPersonUnchanged(body, person, detail)` = `!changed`（两者与 `hasPersonChanges` 同为**纯函数、无 IO**）。

**字段清单（候选值一律按写入语义 `tree-write.updatePerson` 推导）**

| # | 字段 | 候选值 / 现值口径 |
|---|---|---|
| 1 | `name` / `surname` / `given` | 只认 `primary_name`（`name` = surname + given，空则「未知」）；**body 未带任何姓名字段 → 不参与比对** |
| 2 | `gender` | **仅** body 为 `0/1/2` 数字枚举才参与；规范化 `1/2/0 ≡ M/F/U`（字符串形态写入侧不写 → 不比对） |
| 3 | `birth_date` / `birth_place` / `death_place` | body 未提供该键 → 不比对；提供则与现值规范化后比 |
| 4 | `death_date` | `is_living === true` → 候选值取 `''`（写入侧会清空卒年） |
| 5 | `is_living` | 统一布尔；**树内缺失取展示层隐含值**；未给布尔但给了非空卒年（写入侧置 `false`）→ 可能产生差异 |
| 6 | 详情 `attributes`（称号三字段等，**全量替换**语义） | 键值表整体比对；**硬口径：请求体未提供 `attribute_list` → 该维度不判变更**（未提供 ≠ 提供空表；显式 `[]` 仍算真实清空 → 照旧计费）；排除 `STRUCTURAL_ATTR_KEYS`（`EXTERNAL_KEYS` + `CHAIN_ATTR_KEYS`） |
| 7 | `external_*` / `external_chain_gen` | 现值基准改用**有效现值** `effectivePersonValues(person, detail)` = 树节点 ∪ 详情 `attributes`（与**读路径** `index.js` 的 `toRawPerson` 同口径，树节点非空值后写优先）；**body 未提供的键一律不比对**；显式给了且值不同才保守判差异 |

**规范化（两侧同口径）**：`trim`；`'' ≡ undefined ≡ null`；`gender` `1/2/0 ≡ M/F/U`；`is_living` 树内缺失取展示层隐含值；**有效现值须合并详情 `attributes` 里的称号与 `external_*`**（否则总谱链节点「原样回传」会被判成变更 → 误扣 1 片；真 HTTP 已复现并修复）。

**硬口径**：请求体**未提供**的键**一律不判变更**（未提供 ≠ 变更；绝不静默吞掉一次真实写入）。

**响应形状（no-op）**

```
200 { ok: true, unchanged: true,
      fee: { unit: 'bamboos', pieces: 0, balance: <当前余额>, balance_after: <当前余额> } }
```

- **不写树**（`version` / `updated_at` 不动）、**不写详情**、**零流水**（无 `edit_fee`、无 `fee_refund`）。

**反向对照（仍按 §3-1 扣 1 片）**：改 `birth_date` / 改 `is_living` / 改姓名 / 改称号（`attribute_list` 显式变更）→ **各扣 1 片**；`hasPersonChanges` 为假（请求体不含任何可修改内容）→ 仍 400、不扣费。

**前端**：`frontend/src/components/person-archive/person-archive.vue` 增加 **dirty 比对**（与后端同一口径）；**「父节点编号」变更不在本口径内** —— 改父仍照常执行 `reparent`（另有 1 片 / 跨树 9 片口径），绝不因「内容未改」而吞掉改父。

**测试**：`cloudfunctions/compat-api/lib/noop-edit-integrity.test.js`（10 例，含链节点 no-op、窄 body、反向对照、变异有效性）。

---

## 5. 复用点与实现锚点

### 5-1 新增模块 `cloudfunctions/compat-api/lib/economy-fee.js`（**薄封装，不重复实现算法**）

本模块只做三件事：**单价表** + **闸门顺序编排** + **冲正编排**；FIFO / 整单拒绝 / sweep / 批次读写全部复用总册口径的资产模块（`lib/assets.js`，总册 §5、§10），本册**不自写第二套扣减算法**。

导出（命名固定，index.js 按此调用）：

| 导出 | 签名 | 职责 |
|---|---|---|
| `FEE` | `{ person_update: 1, reparent_same_tree: 1, reparent_cross_tree: 9, delete_node_per_person: 3, tree_create_seeds: 9 }` | 全部单价的**唯一真源**（禁止在路由里写魔法数字） |
| `chargeBamboo` | `chargeBamboo(phone, pieces, ref) → { txn_id, spent:[{lot_id, qty}], balance }` | 写 `Tx.type`（取总册枚举：修改类 `edit_fee` / 删除 `delete_fee` / 迁移 `move_fee`）；不足抛 409（带 `need` / `current` / `how_to_get`） |
| `chargeSeeds` | `chargeSeeds(phone, seeds, ref) → { txn_id, spent, balance }` | 建树用，写 `Tx.type='tree_create'`；不足抛 409 |
| `quoteBamboo` / `quoteSeeds` | `quote*(phone, need) → { need, current, enough }` | 只读预检（不写），**内部先 sweep** |
| `getAssetSummary` | `getAssetSummary(phone)` | 直接转发总册 `GET /assets/summary` 的数据口径（`fragments` / `seeds_total` / `bamboos_total_pieces` / `jades` / 批次 / `expiring` / `txs`），本册不另立字段名 |
| `refundAssets` | `refundAssets(phone, txn_id, reason) → { ok }` | 按原 Tx 反向冲正：**原路返还同一批次**（恢复原 `qty` 与 `expires_at`）、写 `Tx.type='fee_refund'`（总册 §5-5-3） |
| `HOW_TO_GET` | 常量数组（§8 四条文案） | 409 响应与前端弹窗**共用**的唯一文案真源 |

- 底层读写走 `store.colGet('jiazu_assets','global')` / `colSet`（与 `lib/wallet.js` 同模式），保证 `COMPAT_SOURCE=local` 时落 `migrate-output/collections/jiazu_assets.json`、`cloud` 时落云集合；**禁止绕过业务接口直写**（总册 §5-7-1）。
- 并发：按手机号串行化（互斥队列），禁止读改写竞态、禁止重复扣费（总册 §5-7-2、§5-7-4）。

### 5-2 `index.js` 各写路由的调用位置

| 路由 | 调用点 | 写法要点 |
|---|---|---|
| `PUT /people/<handle>` | `requireWriteUser`（401/403）之后、`tw.updatePerson(...)` **之前** | 先 `fa.assertFounderEditable` 类只读预检；`chargeBamboo(phone, FEE.person_update, { tree_id, person_handle })`；`tw.updatePerson` 抛错 → `refundAssets` 后原样抛 |
| `POST /admin/reparent` | 由 `tw.reparentNode` / `tw.reparentAcrossTrees` 内部承担 | 路由把 `charge` 回调（含 `phone`）透传进 `tw.reparentNode`；同树分支在 `updateTree` 闭包首步扣 1，跨树分支在 `updateTrees` 闭包首步扣 9（**由 lib 层决定单价**，路由不判价） |
| `POST /admin/delete-node` | 由 `tw.deleteNode` 内部承担 | `deleteNode({ …, charge })`：`dry_run` 分支**不调** `charge`（天然免费）；正式分支在 `updateTrees([treeId], …)` 闭包首步扣 `FEE.delete_node_per_person × deleted.size`；`confirm_count` 不符在闭包外先抛 409（不扣） |
| `POST /admin/create-tree` | `onBeforeWrite` 钩子 | `onBeforeWrite: () => eco.chargeSeeds(u.phone, FEE.tree_create_seeds, { tree_id: plannedTreeId })`，**替换**现有 `wallet.deductTreeCreateFee(u.phone)`；路由 `catch` 里对冲正 |
| `POST /admin/add-spouse` / `add-child` / `chain-append` / `remove-branch-link` / `split-tree` / `founder-*` / `detach-founder` / `reset-founder` / `clan-*` / `marriage-request` / `approve-marriage` / `marry-end` / `POST /people` / `POST /families` / `PUT /families/<handle>` / `PUT /tree-meta` | **不接闸门** | 0 片；实施时禁止在这些路由里调 `chargeBamboo`（矩阵即契约） |

### 5-3 读接口（余额提示用）

- 前端余额提示**只用总册既定的 `GET /assets/summary`**（总册 §6-1，Bearer 必填，401 未登录），返回 `{ fragments, seeds_total, bamboos_total_pieces, jades:[…], seed_lots:[SeedLot], bamboo_lots:[BambooLot], expiring:[…], txs:[Tx] }`；**本册不新增 `/assets/balance` 之类的重复接口**。
- 前端取「余 M 片」用 `bamboos_total_pieces`；`how_to_get` 文案来自本册 `HOW_TO_GET` 常量（前端本地常量，不要求后端另开字段）。
- ⚠️ **实现位置**：`GET /assets/summary` 与 `GET /assets/expiring` 等资产路由必须挂在 `index.js` 树编辑闸门（约 1586 行 `if (!treeId) return send(400, { error: '缺少 X-Tree-Id' })`）**之前**（总册 §6 注），否则无 `X-Tree-Id` 的账号级请求会先被 400 拦掉。

---

## 6. 错误码与前端回显

| 场景 | 状态码 | 响应体（要点） |
|---|---|---|
| 竹片不足 | **409** | `{ error: '资产不足，需 X 片竹片，当前 Y 片', code: 'ASSET_INSUFFICIENT', need: X, current: Y, unit: 'bamboos', how_to_get: ['官方 9.9 元/束', '每日 21 点限量发售', '市集购买', '蓄能档位赠送（季度 1 束 / 半年度 2 束 / 年度 8 束）'] }` |
| 石榴籽不足（建树） | **409** | `{ error: '资产不足，需 9颗石榴籽，当前 N 颗', code: 'ASSET_INSUFFICIENT', need: 9, current: N, unit: 'seeds', how_to_get: [同上四条] }` |
| 删除范围变化 | **409** | `{ error: '删除范围已变化（当前 N 人，确认时 M 人），请重新确认', code: 'DELETE_SCOPE_CHANGED' }` —— 沿用既有 `confirm_count` 语义，**先于扣费**判定，不扣费 |
| 未登录 | **401** | `{ error: '请先登录后再进行编辑操作' }`（沿用 `requireWriteUser` 文案），**不扣费** |
| 无权限 / 无写权 / 游客 / 权限范围外 / 总谱仅总编 | **403** | 沿用既有文案（`游客无编辑权限，请注册后编辑` / `您的权限范围仅限本人及向下节点` / `中华世本总谱仅总编辑（chief_editor）可编辑` 等），**不扣费** |
| 只读节点（始祖 / 上层镜像 / 总谱删除） | **403** | 沿用既有 `assertFounderEditable` / 镜像锁文案，**不扣费**（结构上不可写，不存在扣费） |
| 落库后冲正成功 | 原始错误状态码 | 响应里带 `{ fee_refunded: true }`（可选，便于排查），`error` 仍是落库失败原因 |

**错误体码口径（强约束）**

- **响应体只允许出现域名错误码**：本册登记的 `ASSET_INSUFFICIENT`、`DELETE_SCOPE_CHANGED`，以及本册 / 总册已列的同域名业务码；`code` 字段一律取登记过的枚举值，不得临时新造。
- **系统级错误码与底层异常原文一律不得回显**：`EACCES` / `ENOENT` / `ERR_*` 等 Node 系统错误码，以及 `err.stack`、`err.message` 原文（含本机绝对路径、内部函数名、内部实现细节）**不得透出到响应体**；应**统一为通用文案 + 对应状态码**（例如落库失败统一为 500 `{ error: '服务器开小差了，请稍后重试' }`），避免泄露本机路径与内部实现。
- **`ASSET_INSUFFICIENT` 必须继续带 `need` / `current` / `unit` / `how_to_get` 四个字段**：前端全靠它们渲染「差多少 / 怎么获得」提示，实施时**不得删减**、不得改名（`how_to_get` 文案真源为 §8 的 `HOW_TO_GET` 常量）。

前端识别统一按 `err.code`（`ASSET_INSUFFICIENT` / `DELETE_SCOPE_CHANGED`），**不要**用中文文案正则匹配；现有 `person-archive.vue` 里的中文正则兜底保留但降级为备份路径。

---

## 7. 前端落点

| 位置 | 变更 |
|---|---|
| `frontend/src/components/person-archive/person-archive.vue` → `doSave()`（宿主页 `frontend/src/pages/person/detail.vue`，总册 §9「人物档案」落点） | 提交前：`fetchAssetSummary()` 预检，`bamboos_total_pieces < 1` → 弹「本次消耗 1 片竹片，当前 M 片，竹片不足」+「如何获得竹片」；成功后 toast `已保存（本次消耗 1 片竹片，余 M 片）`。跨树迁移成功（`migratedTo` 非空）toast 追加 `（本次消耗 9 片竹片，余 M 片）` |
| 同上 → 编辑表单「父节点编号(改挂上级)」块 | 填的编号**属别的家族树**时，提交前先弹「本次为跨树整体迁移，消耗 **9 片竹片**（与迁移人数无关），是否继续？」；确认后带 `new_parent_tree_id` 提交 |
| 同上 → `startDelete()`（删除节点两段式） | 第一段 `dry_run` 响应新增 `fee: { unit:'bamboos', pieces, balance, balance_after }`；强确认弹窗文案追加一行「本次消耗 N 片竹片，余 M 片（N = 待删人数 × 3）」；第二段收到 409 资产不足 → `deleteError` + `showModal`「资产不足」并给「如何获得竹片」清单，保持在弹窗内可重试 |
| 同上 → 删除 / 保存的 409 处理 | 文案与 `how_to_get` 直出，不自行改写；用户可获得「9.9 元/束购买」入口（跳钱包页） |
| `frontend/src/components/person-manage-panel/person-manage-panel.vue` | 「＋ 添加父节点 / ＋ 添加子节点 / ＋ 添加配偶」面板加一行灰字提示 **「新增类操作不消耗竹片」**，避免用户因删改计费而不敢新增 |
| `frontend/src/business/api.ts` | 新增 `fetchAssetSummary(token)` → `GET /assets/summary`（总册 §6-1，不新增重复接口）；`NodeDeleteResult` 增加 `fee: { unit, pieces, balance, balance_after }`；`reparentNode()` 返回类型增加 `fee`；错误对象透出 `code` / `need` / `current` / `how_to_get`（供弹窗） |
| 钱包 / 资产页（总册 §9 落点 `frontend/src/pages/wallet/index.vue`、新增 `pages/assets/index.vue`） | 竹片区块展示：当前折算「N 束 M 片」、最近流水（`Tx.type` 取总册枚举：`edit_fee` / `delete_fee` / `move_fee` / `tree_create` / `fee_refund` / `official_buy` / `market_buy` / `spirit_charge` / `admin_grant` / `expire`）、入口「官方竹简 · 每日 21:00 限量」「去市集」；建树费文案由「¥9.90」改为「**9颗石榴籽**」（总册 §9） |

---

## 8. 竹片来源提示（`how_to_get` 唯一文案真源）

四条渠道按总册 §3-3「竹片获取方式」与 §7 官方发售口径列出：

| 来源 | 说明 | 单位换算 |
|---|---|---|
| 官方购买（官方竹简） | **¥9.90 / 束**，只扣**既有人民币钱包**（`jiazu_wallets`）余额；只用于买竹片，人民币不可直接购买籽 / 碎片 / 玉 | 1 束 = 100 片 |
| 每日限量发售 | **每日 21:00** 释放当日配额（`daily_stock`，运营配置）；21:00 前购买 409「未到发售时间」；售罄即止、当日不结转 | 按 `bundles` 整束购买（`qty = bundles × 100` 片，`source='official_purchase'`） |
| 市集购买 | 向其他用户购买（**仅整束可交易**）；买方所得竹片**继承卖方原批次 `expires_at`**（不因交易续命） | 按挂单 `bundles`（≥1 整数） |
| 蓄能档位赠送（家族灵气充值） | 家族灵气充值套餐随赠竹片（`gift_bamboos`，**唯一版本**）：`daily` = 1 籽 / 1 天 / **赠 0 束**；`monthly` = 29 籽 / 30 天 / **赠 0 束**；`quarterly` = 109 籽 / 90 天 / **赠 1 束**；`half_year` = 149 籽 / 180 天 / **赠 2 束**；`yearly` = 299 籽 / 365 天 / **赠 8 束** | 1 / 2 / 8 束 = 100 / 200 / 800 片；`daily` / `monthly` 两档**不赠**竹片 |

> 本节数值为**唯一版本**（需求原文，终审裁定确认）：季度 **1 束 = 100 片** / 半年度 **2 束 = 200 片** / 年度 **8 束 = 800 片**，`daily` 与 `monthly` 两档**不赠**竹片。总册套餐表（`gift_bamboos`）已按终审裁定同步为同一数值，两册一致；曾出现的「季度 2 束 / 半年度 4 束」写法**作废**。实施与文案均以本节数值出数（详见 §13 同步记录）。
>
> 文案在 `lib/economy-fee.js` 导出为 `HOW_TO_GET` 常量数组（409 响应与前端弹窗**共用**），禁止前后端各写一套。

---

## 9. 测试与约束

### 9-1 单测 `cloudfunctions/compat-api/lib/economy-fee.test.js`
必须覆盖（每条一个 `test`）：

1. **矩阵穷举**：§3-1 的 7 个扣费行逐一断言单价（1 / 1 / 9 / 3N / 3 / 9 籽 / 9999 籽），且**不随人数变化**（跨树 9 片：迁移 1 人与迁移 30 人同价；立支 9999 籽：上移 1 位祖先与上移 30 位祖先同价）；
2. **0 片行穷举**：§3-1 的 27 个 0 片行逐一断言"操作成功后资产总分**逐字节不变**"（含总谱 `zhonghua`、祖谱 `kind='clan'` 各至少一例）；
3. **整单不足拦截**：余额 = X-1 → 409，`need` / `current` 正确，且**所有批次 qty 不变**；
4. **dry_run 免费**：`delete-node dry_run=true` 不写任何树、不产生任何 `Tx`；
5. **`confirm_count` 不符**：409，不写树、不扣费；
6. **FIFO by `expires_at`**：三个乱序到期批次 → 扣减命中最早到期的（与总册 `lib/assets.test.js` 同口径，本册只断言闸门调到同一个函数）；
7. **sweep 先于扣费**：入口先 `sweep(now)`——过期批次被剔除并各写一条 `type='expire'` 流水后，再判可扣量；
8. **失败回滚**：注入落库失败 → 资产总分还原 + 存在一条 `type='fee_refund'` 的 `Tx`，且**返还到原批次**（原 `qty` 与 `expires_at` 一致，不新造批次）；**不存在**"扣了片但树没变"或"树变了但没扣片"；
9. **权限优先**：未登录 401 / 游客 403 / 范围外 403 → 资产总分逐字节不变（**证明扣费在权限校验之后**）；
10. **跨树迁移双树一致**：扣费失败 → 两棵树 md5 不变；`moveLineage` 抛错 → 两棵树 md5 不变且资产还原；
11. **建树改口径**：成功扣 9 籽、树已建；`createTreeFile` 失败 → 籽原路返还同一批次；删树不退籽；
12. **总谱续编 0 片**：`chain-append` 两模式跑通后资产不变；
13. **真源未变**：文末断言真实数据 md5 逐字节一致（照 `lib/node-delete.test.js` 既有模式）：
    - `migrate-output/config/tree-meta.json`
    - `migrate-output/trees/*.json` 全量
    - `migrate-output/details/*.json` 全量
    测试数据一律写 `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 `/tmp` 副本；真实 `jiazu_assets` 真源同样纳 md5 断言。

### 9-2 注册与约束
- 该文件必须注册进仓库根 `package.json` 的 `scripts.test`（追加到现有 `node --test …` 列表；当前 14 个文件、150/150 全绿，**本轮不得打破**）。
- 与总册测试的分工：总册 §10 的 `lib/assets.test.js` 测**资产算法本体**（碎片合成 / FIFO / sweep / 玉）；本册 `lib/economy-fee.test.js` 测**闸门与单价**（矩阵、顺序、冲正）。两者都注册进 `scripts.test`，互不重复断言。
- 断言原则：**"资产总分不变" 比 "某个字段没被写" 更可靠**——0 片行一律断言 `fragments/seeds/bamboos/jades` 总分逐字节一致，而不是只看 `txs` 长度。
- 前端 `npx vue-tsc --noEmit` 必须 exit 0（总册 §10）。
- 禁止在测试里修改真实数据 / 重启服务 / 跑迁库脚本。

---

## 10. 实施清单

**后端 compat-api**
1. 新建 `lib/economy-fee.js`（§5-1 全部导出：`FEE` / `chargeBamboo` / `chargeSeeds` / `quote*` / `getAssetSummary` / `refundAssets` / `HOW_TO_GET`），底层复用总册口径的资产模块 `lib/assets.js`（**不重写 FIFO / sweep**）。
2. `lib/tree-write.js`：`deleteNode` / `reparentAcrossTrees` / `reparentNode` 增加 `charge` / `refund` 注入参数，并在对应 `updateTree` / `updateTrees` 闭包**首步**调用；`createTree` 的 `onBeforeWrite` 契约保持不变（只在 `index.js` 侧换成扣籽）。
3. `index.js`：`PUT /people/<handle>` 接闸门；`/admin/reparent`、`/admin/delete-node` 透传 `charge`；`/admin/create-tree` 换 `onBeforeWrite`；**资产读接口用总册既定的 `GET /assets/summary`**（挂在树编辑闸门之前，总册 §6 注），本册**不再新增** `/assets/balance`；其余路由**保持不接闸门**。
4. `lib/wallet.js`：`deductTreeCreateFee` 保留但不再被 `create-tree` 调用（总册 §12-3：¥ 钱包收缩为「只用于购买官方竹简」；`trees[tree_id]` 与 `transferToTree` 下线属总册范围，本册不越界）。

**前端**
5. `business/api.ts`：`fetchAssetSummary`（`GET /assets/summary`）、响应类型补 `fee`、错误对象透出 `code/need/current/how_to_get`。
6. `person-archive.vue`：`doSave()` 预检 + 成功文案；删除两段式确认文案 + 409 引导；改父跨树确认弹窗。
7. `person-manage-panel.vue`：新增类「不消耗竹片」提示。
8. 竹片展示落进总册 §9 的资产页 / 钱包页（`pages/assets/index.vue`、`pages/wallet/index.vue`）。

**文档**
9. 本文件状态改「已实施」；`docs/PENDING_DEPLOY.md` 补本批（§12）；总册 `docs/economy.spec.md` **已落盘**，本册按它对齐；本册曾提出的 5 项已**由总册终审裁定同步（R12/R13）**，清单见 §13（本册不擅改总册）。

---

## 11. 待确认默认口径（一句话可改，不阻塞实施）

实施按下列**默认值**执行；Kevin 若要改，逐条给一句话即可，改动点都收敛在 `FEE` 常量或单条判断里。

| # | 默认口径 | 改成什么要动哪里 |
|---|---|---|
| 1 | **删除 subtree 模式按待删节点数计费**：`3 片 × people_count`（每节点独立扣费，不合并） | 若改"整支一口价"，只改 `FEE.delete_node_per_person` 的用法（乘数去掉） |
| 2 | **同树改父按 1 片 / 节点**（不随后代数放大） | 改 `FEE.reparent_same_tree` |
| 3 | **`POST /admin/split-tree` = 0 片**（拆分不新增人物、不删人物内容；建树费只对 `create-tree` 收） | 若要求收费：改 §3-1 #31 行为 **9 片 / 次**（与跨树迁移同价），或按 1 片 / 分出的树；只需改该路由的 `charge` 调用 |
| 4 | **已作废：晋宗 `POST /admin/promote` 已整体移除**（2026-09-17 产品决策：该操作整体移除，路由与 `promoteTree()` 一并删除，由【立支】/【汇宗】取代；原 §3-1 #32 行已同批移除，本行只作留痕、不再有收费口径） | —（无单价可改） |
| 5 | **`PUT /families/<handle>` = 0 片**（绑定类；不在用户列明的修改删除扣费清单内） | 若要求收费：改 §3-1 #16 行为 **1 片 / 家族** |
| 6 | **`PUT /tree-meta` = 0 片**（治理类，非人物节点） | 若要求收费：改 §3-1 #33 行为 **1 片 / 次** |
| 7 | **石榴籽最小单位 = 颗**（不拆分，"完整"= 整颗）；建树扣 9 颗 | 若籽可分割：需总册同步改 `SeedLot.qty` 语义 |
| 8 | **服务端不做幂等键**：重复提交 = 各自扣费（前端用 `saving` / `deleting` loading 态防抖动） | 若要幂等：加客户端 `request_id` → `Tx.ref.trade_id` 去重 |
| 9 | **本册与总册同价的三个单价**：同树改父 **1 片**、跨树改父 **9 片/次**、删除节点 **3 片/节点**（总册的修改类「可否消耗」章节与扣减章节已按终审裁定同步这三行，见 §13） | 改单价只改 `FEE` 一处（两册同批同步） |
| 10 | **`POST /admin/split-tree` / `PUT /tree-meta` / `PUT /families/<handle>` 均为 0 片**（见 #3、#5、#6；原 `POST /admin/promote` 一项已随功能整体移除，见 #4） | 若总册后续为它们定单价，本册三行同步改 |
| 11 | **响应新增 `fee` 字段**（`PUT /people` / `/admin/reparent` / `/admin/delete-node` 的 `dry_run`）：只做**新增**，不改既有字段语义 | 若不愿改响应形状：前端改为**提交前单独调 `GET /assets/summary`** 自算余量（`fee` 字段可去掉） |
| 12 | **建树「完整」口径**：只扣整颗籽，`SeedLot.qty` 不接受小数尾巴 | 若籽可分割：同 #7 |

---

## 12. 部署要点

**新增 / 变更路由（本批）**

| 路由 | 变更 |
|---|---|
| `PUT /people/<handle>` | **变更**：接竹片闸门（1 片 / 节点），响应新增 `fee` |
| `POST /admin/reparent` | **变更**：同树 1 片、跨树 9 片；响应新增 `fee`；跨树路径接入 `updateTrees` 闭包内扣费 + 冲正 |
| `POST /admin/delete-node` | **变更**：正式提交 3 片 / 节点；`dry_run` 响应新增 `fee`（免费）；409 不扣 |
| `POST /admin/create-tree` | **变更**：扣费由 ¥9.90 改为 **9颗石榴籽**（`onBeforeWrite` 钩子替换） |
| `GET /assets/summary` | **不新增**：沿用总册 §6-1 既定接口作为前端余额提示的数据源（挂树编辑闸门之前） |
| 其余全部写路由 | **不变**（0 片，不接闸门） |
| **`POST /admin/sibling-reorder`** | **本册追加 · 2026-09-23**：**新增** 1 条写路由（挂竹片闸门 **1 片 / 次**，`Tx.type='edit_fee'`；no-op 0 片）；云函数**必须重打包**，否则云端 404；前端 H5 / 小程序**必须重打**（新增「调整排行」入口 + 次级模态框）；**无集合 / 无真源数据动作** —— 逐字口径见 **§15** + `docs/sibling-order.spec.md`；部署登记见 `docs/PENDING_DEPLOY.md` **§31** |
| **`POST /admin/tree-rename`** | **本册追加 · 2026-10-12**：**新增** 1 条写路由（挂竹片闸门 **三档 999 / 9999 / 99999 片**；**no-op 同值 0 片**；**无免费档**）；`Tx.type` **不新增枚举**；**`tree-meta` 新增 `genealogy_name_updated_at`** + **`GET /tree-meta` 每树 entry 增 `genealogy_name_updated_at` / `rename_fee_pieces`**；云函数**必须重打包**（否则云端 404）；H5 / 小程序**必须重打**；**部署顺序 = H5 先行 → 云函数**；逐字口径见 **§17** |

> 本册**不新增任何路由**：只改 4 条既有写路由的扣费行为。总册 §12-2 的 19 条新增路由与本节互不重叠；总册的「既有路由改语义」清单已按终审裁定补齐第 4 条 `POST /admin/delete-node`（见 §13 同步记录）。
> **上句的适用范围（本册追加 · 2026-09-23 · 只指向，不改上句原文）**：上句是 **P1 竹片闸门批**的口径；**2026-09-23 批新增 1 条路由**（`POST /admin/sibling-reorder`，见上表末行）⇒ 上句「不新增任何路由」**自本批起不再成立**；本册**只以新增行落地**，不改写上句与 §12-1 既有行。

**新增文件 / 集合**

- 新增模块：`cloudfunctions/compat-api/lib/economy-fee.js`（+ `lib/economy-fee.test.js`）。
- 新增集合 **`jiazu_assets`** → **必须并入 `scripts/upload-migrated-to-cloudbase.mjs` 的 `COLLECTIONS`**（当前只有 7 个基础集合：`jiazu_person_details` / `jiazu_tree_meta` / `jiazu_users` / `jiazu_wallets` / `jiazu_anchors` / `jiazu_leave_requests` / `jiazu_sms_codes`；总册 §12-1 另有 `jiazu_spirit` / `jiazu_market` / `jiazu_messages` / `jiazu_ops_logs` 与四个申请集合一起补），否则云端扣费写入报错。
- `PENDING_DEPLOY.md` §2 需补本批：新增集合 `jiazu_assets`、新增模块 `lib/economy-fee.js`、4 条既有写路由改语义（§12-2 表）。
- 建议顺带加索引：`jiazu_assets` 按 `_id='global'` 单点读写，无需额外索引。

**打包与部署（沿用现有流程）**

```bash
frontend/node_modules/.bin/esbuild cloudfunctions/compat-api/index.js \
  --bundle --platform=node --format=cjs --external:@cloudbase/node-sdk \
  --outfile=cloudfunctions/deploy/compat-api/index.js
tcb fn deploy compat-api -e liwu-d8gek6jjdab1d087c
```

**部署后冒烟**

1. `GET /assets/summary`（带 Bearer）→ 200 且返回 `bamboos_total_pieces`（总册 §6-1 形状）；
2. 无竹片账号 `PUT /people/<handle>` → **409**「资产不足，需 1 片竹片，当前 0 片」，且树 JSON 未变；
3. 有竹片账号同请求 → 200，`jiazu_assets` 里出现 `type='edit_fee'` 的 `Tx`（总册 §4-6 枚举），树 JSON 已变；
4. 未登录同请求 → 401，且**未产生任何 `Tx`**（证明扣费在鉴权之后）；
5. `POST /admin/delete-node`（`dry_run:true`）→ 200 且 `fee.pieces = 3 × people_count`、资产未变；
6. `POST /admin/delete-node`（正式，带 `confirm_count`）→ 200，扣 `3N` 片；
7. 跨树改父 1 人 / 30 人各一次 → 两次都只扣 **9 片**（与后代人数无关），各写一条 `move_fee`；8. 删除 5 人后代子树（`subtree`，带 `confirm_count:5`）→ 扣 **15 片**，`Tx` 一条 `delete_fee`（`delta.bamboos=-15`）。

---

## 13. 与总册的同步记录（**已由总册终审裁定同步（R12/R13）**）

本册原登记的 5 处「需总册补写」事项，**已由总册终审裁定同步（R12/R13）**，总册已按下表口径落盘；本节只作对照记录，**不再要求总册补写**，本册不擅改总册。

| # | 位置（总册） | 同步后的口径（两册一致） |
|---|---|---|
| 1 | 修改类「可否消耗」章节与扣减章节 | 已补写四类单价：人物内容修改 **1 片 / 节点**、同树改父 **1 片 / 节点**、跨树改父 **9 片 / 次**（与后代人数无关）、删除节点 **3 片 / 节点**（subtree = 3N、promote = 3），与本册 §3-1 逐行一致 |
| 2 | 「既有路由改语义」清单 | 已补齐 4 条：`POST /admin/create-tree`、`POST /admin/reparent`、`PUT /people/<handle>`、`POST /admin/delete-node`（正式提交 3 片 / 节点；`dry_run` 免、409 范围变化免） |
| 3 | 本分册文件名交叉引用 | 多一个字母 s 的笔误写法已统一为 `docs/economy-fee.spec.md`（本册仅文首一处说明） |
| 4 | 套餐表 `gift_bamboos` | 已同步为**季度 1 束（100 片）/ 半年度 2 束（200 片）/ 年度 8 束（800 片）**，`daily` / `monthly` 两档不赠；与本册 §8 完全一致（曾出现的 200 片 / 400 片写法作废） |
| 5 | 接口清单 | 已声明写路由扣费闸门顺序（鉴权 → 只读预检 → 余额预检 → 扣费 → 落库 → 失败冲正）以 `docs/economy-fee.spec.md` §4-3 为准；`fee` 为新增响应字段，不改既有字段语义 |

> 除上述 5 处外，本册与总册在**集合名 / 字段名 / 有效期常量 / `Tx.type` 枚举 / FIFO+sweep 算法 / 整单拒绝 / 建树 9 籽口径 / 无豁免通道**上**完全一致**，实施时直接照抄，无需二次判断。

---

## 14. 与既有规格文件的交叉引用

| 文件 | 关系 |
|---|---|
| `docs/economy.spec.md`（总册） | 字段与算法唯一权威；本册 §1 对齐表 + §13 同步记录（已由总册终审裁定同步，R12/R13） |
| `docs/marriage.spec.md` | 跨树嫁娶（嫁出/娶入/绝婚/合离）及其审批 = **0 片**（§3-1 #27–#30）；本册不介入其事务 |
| `docs/clan-tree.spec.md` | 祖谱（`kind='clan'`）**不豁免扣费**（§1 口径 6）；建谱 / 建谱审批 = 0 片 |
| `docs/founder-attach.spec.md` | 认祖 / 挂载 / 解除挂载 / 重置始祖 = 0 片；只读节点（始祖 / 上层镜像）403 且不扣 |
| `docs/id-system.spec.md` | 跨树迁移的编号「终身不变」口径（§3-1 #3 备注：编号不变，与人数无关） |
| `docs/permission-tier.spec.md` | 权限阶梯与 `requireWriteUser` 语义；本册只规定「校验必须在扣费之前」 |
| `docs/PENDING_DEPLOY.md` | 本批部署项按 §12 补入 |
| `docs/PENDING_DEPLOY.md`（2026-09-23 追加） | 本批「子女排行」部署项见该册 §31 |

---

## 15. 本册追加 · 2026-09-23：调整同胞排行（`POST /admin/sibling-reorder` · **1 片 / 次**）

> **追加说明（`AGENTS.md` §0-4 纪律）**：本节为**追加章节** —— 本册 **§1–§14 的既有行一律原文保留、不机械改写**；本批新口径只通过 **本节** + **§3-1 主表 #36** + **头部对齐表新增行** + **§12-1 路由清单新增行** 落地。
> **裁定 / 实现**：裁定 = **Zang v1（2026-09-23）**；实现 = **Kong 已实测落盘**（工作区在途、未提交）；本册字段 / 文案 / 单价**一律取实测值，不推算**。
> **业务域规格**：`docs/sibling-order.spec.md`（术语 / 路由契约 / 前端交互 / 错误码表 / 已接受差异 / 未决项）；本册只登记**计费与闸门口径**。
> **时点**：2026-09-23 13:30 CST（Jing 制度员实测）。

### 15-1 单价与流水（逐字）

| 项 | 值 | 锚点 / 实测 |
|---|---|---|
| 单价 | **1 片竹片 / 次**（`unit: 'bamboos'`） | `FEE.sibling_reorder = 1`（`lib/economy-fee.js:53`）；`feeOf('sibling_reorder')` = `{ unit:'bamboos', pieces:1, tx_type:'edit_fee' }`（`:104-105`） |
| `Tx.type` | **`edit_fee`**（**复用总册 §4-6 既有枚举**，本册**不自造类型**） | `TX_TYPE_OF_OP.sibling_reorder = 'edit_fee'`（`:75`） |
| `Tx.delta` | `{ bamboos: -1 }` | `lib/economy-fee.js:443` |
| `Tx.ref` | `{ tree_id, person_handle, lots[] }`；**`ref.person_handle` = 被拖动的那个子女节点** | `lib/economy-fee.js:382-389`；实测 `lib/sibling-reorder.test.js:281-282` |
| `Tx.desc` | **「调整排行：<姓名> 第 N 位」**（写路径显式传入；实测字面 `调整排行：甲三 第 2 位`） | `lib/tree-write.js:533`；实测 `sibling-reorder.test.js:283` |
| `Tx.operator` | 发起人手机号 | `lib/economy-fee.js:446` |
| 计费次数 | **一次「确定保存」= 一次计费**，**与被动移位的兄弟数量无关**（不受 `people_count` / `mode` 等入参影响） | 实测 `economy-fee.test.js:255-256` |
| 单位 | **只扣竹片**（不扣籽、不涉建树费 / 立支费） | — |
| 响应 `fee` | 成功 = `{ unit:'bamboos', pieces:1, balance:<扣费前>, balance_after:<扣费后> }`（实测 `{…, balance:5, balance_after:4}`） | `lib/economy-fee.js:451`；实测 `sibling-reorder.test.js:252` |
| 算法复用 | FIFO by `expires_at` 升序 + **整单拒绝 409** + `sweep(now)` **一律复用既有资产内核**（本册 §4-1 – §4-4），**不另写第二套** | 同上 |

### 15-2 no-op（**0 片**）

- 判定（后端裁定）= 提交的 `child_handles` 与**现盘数组逐位相同**（含「拖走又拖回原位」）：`lib/tree-write.js:515-516`。
- 回执 `noop:true` + `changed:false`；**路由把 `fee` 覆盖为 `{ unit:'bamboos', pieces:0, balance, balance_after }`**（`balance` / `balance_after` = 当前余额，`index.js:1987-1989`）。
- **不写树**（`version` / `updated_at` 不动）、**零流水**（无 `edit_fee`、无 `fee_refund`）、**连 `sweep` 都不落盘**（实测 `sibling-reorder.test.js:316-319`）。
- 与 §4-6（缺陷 A：no-op 编辑不扣费）**同一制度口径**（判据各自独立：本路由比对**数组位次**，`PUT /people` 比对**值级字段**）。
- **no-op 双路径（追加 · 2026-09-23 终校 · 补登前端短路一侧；上列各行原文保留）**：本路由的 no-op 有**两条互不替代的路径**，**均为 0 片**：
  1. **前端短路**：前端对「本地顺序与基线**逐位相同**」（`dirty=false`）做**零请求短路** —— **不发 HTTP**、toast 逐字 = **「排行未改动，无需保存」**。⇒ 未发请求 ⇒ 不产生任何流水，**也不进扣费**（口径不变）。
  2. **后端 `noop:true`**：提交的 `child_handles` 与**现盘**数组逐位相同（含「拖走又拖回原位」）⇒ 200 + `noop:true` + **`fee.pieces:0`**、不写库、无流水（本节上列各行）；UI 文案逐字 = **「排行未变化，未消耗竹片」**。
  - 分工：① 面向「与**本地基线**相同」、② 面向「**服务端现盘**未改动」；前端**不复制**后端判定（② 分支**保留且在 API 层可达**）。
- **二次确认层为交互层、不动计费（追加 · 2026-09-23 终校）**：前端二次确认层**已由 `uni.showModal` 改为自绘层**（`.som-confirm-mask` z-index = **1010** > `.som-mask` = **1000**；弃用成因 = `uni.showModal` 的 `.uni-modal` z-index = **999** 被遮罩完全盖住）—— **单价 / `Tx.type` / no-op 判定 / 闸门顺序一律不因此改变**（本册 §15-1 / §15-2 / §4-3 与 §3-1 #36 **口径一律不变**）。逐字文案与实测证据 = `docs/sibling-order.spec.md` **§9-2-1** / `docs/sibling-order.qa.md` **§4.2**。

### 15-3 余额不足 → **409 整单拒绝**（文字原文）

| 项 | 值 |
|---|---|
| 状态码 / 文案 | **409** · **`资产不足，需 1 片竹片，当前 0 片`** |
| 附加字段 | `code:'ASSET_INSUFFICIENT'`、`need:1`、`current:0`、`unit:'bamboos'`、`how_to_get[]`（四条文案真源 = 本册 §8 的 `HOW_TO_GET`） |
| 原子性 | **一个批次都不动**：树 **一个字节都不写**（`version` 未脏）、资产集合**逐字节不变**、**不留任何流水 / 冲正记录** |
| 实测 | `lib/sibling-reorder.test.js:457-467`（文案逐字断言 `:461`） |
| 语义 | 沿用本册 §4-2「整单拒绝、绝不部分扣、绝不透支」；**无豁免通道**（管理员 / `chief_editor` 同价同拦） |

### 15-4 闸门与冲正（沿用本册 §4-3，**不新造流程**）

```
① requireWriteUser（401 / 403，不读资产不扣费）                index.js:1972
② fa.assertFounderEditable 只读预检（403，必须拦在扣费之前）   index.js:1974
③ 集合校验（family 404 / 不等价 400 / person 不在列表 400）     tree-write.js:478-489
④ 余额预检 + 扣费（409 整单拒绝；no-op 不进扣费）              tree-write.js:524-535
⑤ 落库 store.updateTree（乐观锁；失败原地回滚）                tree-write.js:536-538
⑥ 落库失败 → 原路返还同一批次 + 500 + fee_refunded:true        tree-write.js:541 + index.js:1993-1995
```

- **扣费位于 `updateTree` 闭包内**（与 §4-3「单树路由：④ 在调用 `tw.*` 之前」的**同一条制度**的另一种落点）：闭包首步是**家族竞态复查**（并发删家族 → 404，**此时尚未扣费**），第二步才是扣费。
- **被拒请求零资产痕迹**：401 / 403 / 400 / 404 / 409 五类均实测「资产集合逐字节不变 + 无任何流水」。
- **冲正 = 原路返还同一批次**（`lot_id` / `qty` / `expires_at` 复原，不新造批次）：实测树文件 `0444` → **500 + `fee_refunded:true`** + 资产**逐字节复原** + 流水 `['edit_fee','fee_refund']` 各一条（`sibling-reorder.test.js:472-497`）。
- ⚠️ **落库失败的状态码 = 500**（**不是 400**）：系统级 IO 失败经 `errorStatusOf`（`index.js:370-375`）**一律 500** + 通用文案。

### 15-5 错误码（本路由口径）

| 场景 | 状态码 | 响应体（逐字） |
|---|---|---|
| 缺参（`family_handle` / `person_handle` / `child_handles` 非数组 / 无 `tree_id`） | 400 | `缺少 family_handle` / `缺少 person_handle` / `缺少 child_handles（须为数组）` / `缺少 tree_id` |
| 子女集合不等价 | 400 | `子女列表须与现有子女完全一致（等长 / 同元素 / 无重复）` |
| `person_handle` 不在该 family 子女列表 | 400 | `person_handle 不在该家族的子女列表中` |
| family 不存在 | 404 | `家族记录不存在` |
| 未登录 / 只读节点 / 游客 / 越权 | 401 / 403 | 沿用既有文案（`请先登录后再进行编辑操作` / 只读节点文案 / `游客无编辑权限，请注册后编辑` …），**不扣费** |
| 余额不足 | 409 | **`资产不足，需 1 片竹片，当前 0 片`**（+ `code` / `need` / `current` / `unit` / `how_to_get`） |
| **落库失败（系统级）** | **500** | **`服务内部错误`**（`eco.INTERNAL_ERROR_TEXT`；**不吐本机路径 / 不吐底层异常原文**）+ **`fee_refunded:true`** |

> 逐字全表（含权限文案三态、结构校验失败项）= `docs/sibling-order.spec.md` **§6**。

### 15-6 同址登记：与本册既有行的差异（**历史行不改写**）

| # | 既有行（原文保留） | 现盘实测 | 处置 |
|---|---|---|---|
| 1 | **§5-1 `FEE` 导出表**列 **5 项**（`person_update` / `reparent_same_tree` / `reparent_cross_tree` / `delete_node_per_person` / `tree_create_seeds`） | 现盘 `FEE` = **7 项**（另含 **`sibling_reorder: 1`**（`:53`）与 **`branch_fee_seeds: 9999`**（`:57`，立支批产物）） | **该表不改写**；本行即同址追加登记（**单价真源仍只有一处 = `lib/economy-fee.js` 的 `FEE`**） |
| 2 | **§6「错误体码口径」**把系统级失败的通用文案**举例**为「服务器开小差了，请稍后重试」 | 本路由系统级失败**实测字面** = **`服务内部错误`**（`lib/economy-fee.js:649`；实测 `sibling-reorder.test.js:486`） | **示例行不改写**；实现字面以 `eco.INTERNAL_ERROR_TEXT` 为准 |
| 3 | **§3-2 附录**（0 片路由清单）+ 其「条数由 29 → 30」登记 + 单测 `ZERO_FEE_ROUTES.length === 30` | **不变**：本路由是**扣费行**（1 片），**不进附录、不改 30 条**（实测 `economy-fee.test.js:1125`） | 无需改动 |
| 4 | **§12-1「本册不新增任何路由」** | **自 2026-09-23 批起不再成立**（本批新增 1 条路由） | 已在 §12-1 追加**新增行 + 适用范围追加行**（上句原文保留） |
| 5 | **§3-1 合计口径「34 行 / 扣费 7 行 / 0 片 27 行」** | **35 行 / 扣费 8 行 / 0 片 27 行**（8 + 27 = 35） | 已在 §3-1 追加**取代行**（原行原文保留） |

### 15-7 请求总册同步（**本册不擅改总册** · 见本册 §6 头 / §13 制度）

- 请求 `docs/economy.spec.md`（总纲）在**修改类单价表**与**「既有路由改语义」清单**中**补登记本行**：`POST /admin/sibling-reorder` = **1 片竹片 / 次**、`Tx.type='edit_fee'`、**no-op = 0 片**。
- 本条为**请求**，**本册不代改总纲**；在总纲落盘前，本路由的单价**唯一真源仍 = `lib/economy-fee.js` 的 `FEE.sibling_reorder`**（代码即事实）。

### 15-8 本批部署要点（**上云动作登记在 `docs/PENDING_DEPLOY.md` §31**）

- 云函数 `compat-api` **必须重打包 + `tcb fn deploy`**（否则云端 `/admin/sibling-reorder` **404**）；判据 = 产物 `cloudfunctions/deploy/compat-api/index.js` 内命中字符串 **`sibling-reorder` ≥ 1**（2026-09-23 13:30 实测 = **0** ⇒ **未重打包**）。
- 前端 H5 **必须重打包 + hosting 部署**、小程序**同批重打 + 开发者工具上传**（新增入口 + 次级模态框）。
- **集合 / 云端数据：本轮无**（不新建集合、`COLLECTIONS` 保持 12 项；`migrate-output/**` 与 `config/tree-meta.json` 本批未触碰）。

### 15-9 终校收口核对（**追加 · 2026-09-23 18:20 CST** · Jing 只读核对；**§15-1 – §15-8 既有行原文保留**）

**核对范围**：本册 **§3-1 新增行（#36）** 与 **§15-1 – §15-8** 各节，逐项对照**整改后的前端实现手段**是否与**计费口径**一致。

| 节 | 核对项 | 结论 |
|---|---|---|
| §3-1 #36 | 单价 **1 片 / 次**、`Tx.type='edit_fee'`（复用既有枚举）、no-op 0 片、`ref.person_handle` = 被拖动的子女 | **一致**，无需改动 |
| §15-1 | 单价 / 流水 / `desc` / `ref` / 计费次数 / 响应 `fee` | **一致**；**`ref.person_handle` 的「被拖动子女」语义**与现盘前端 `movedHandle` 选取规则（`docs/sibling-order.spec.md` **§3-1-1**）**吻合** |
| §15-2 | no-op **0 片** | **一致**；**已补登 no-op 双路径（前端短路 + 后端 `noop:true`）与两条文案**（见 §15-2 追加行）—— **计费口径未变**（两条路径均 0 片） |
| §15-3 | 409 原文 **`资产不足，需 1 片竹片，当前 0 片`** + `code`/`need`/`current`/`unit`/`how_to_get[]` | **一致**；前端「资产不足」仍走既有 `isAssetInsufficientError` / `showAssetInsufficientGuide`，**未改文案**（Neng-4 复检未见异常） |
| §15-4 | 闸门六步 + 冲正（原路返还同一批次） | **一致**；整改只动**交互层**（自绘确认层），**未动闸门顺序 / 扣费位置** |
| §15-5 | 错误码表（400 / 401 / 403 / 404 / 409 / 500） | **一致**；整改未新增 / 未改变任何状态码或文案 |
| §15-6 | 同址差异登记（`FEE` 7 项 / 内部错误文案 / 0 片清单 30 条 / §12-1 适用范围 / 合计口径） | **一致**，无需改动 |
| **二次确认层** | 是否影响计费 | **不影响**（已写入 §15-2 追加行）—— 确认层仅「明示单价 + 被移动子女姓名」 |
| **前端短路** | 是否构成「漏计费」 | **不构成**：短路 = **不发请求** ⇒ 无 `Tx`、无 `fee_refund`，与后端 no-op 同价 **0 片** |

**结论：§3-1 新增行与 §15 各节与整改后的前端实现手段一致 —— 计费与闸门口径零变化**；本批**只补登**（§15-2 追加行 + 本节），**未改写任何既有行**。证据 = `docs/sibling-order.qa.md`（三轮汇编）+ `docs/sibling-order.spec.md` §14；部署项 = `docs/PENDING_DEPLOY.md` §31（含 §31-7 追加）。

---

## 16. 本册追加 · 2026-10-09：新建祖谱 99 籽（`create-clan` 直建 ＋ `clan-request` 预扣返还）（**只追加 · 不改 §0–§15 任何历史行 · 删除行 = 0 · 本册无任何字面替换**）（Jing 制度员）

### 16-1 新计费项：`POST /admin/create-clan`（直建祖谱 · **99 籽 / 次**）

- **单价单点**：`CLAN_CREATE_FEE_SEEDS = 99` —— 现证 `cloudfunctions/compat-api/lib/clan.js` `:64-66`（**一句话可改**）。
- **计费时序**：**校验全过后、落库前**从**操作者**扣（`createClanTree` 的 `onBeforeWrite` 钩子）—— 现证 `index.js` `:2233-2239`（路由 `:2207`，钩子注释 `:2204-2206`）；**与 §3-1 #8 建树费同形态**（`chargeSeeds` / `refundQuietly`，路由 `catch` 里对冲正）。
- **冲正**：落库失败 → **原路返还同一批次**，错误体带 `fee_refunded:true` —— 现证 `index.js` `:2242-2245`。
- **不足 409 整单不建不挂**：`ASSET_INSUFFICIENT`（`need` / `current` / `unit` / `how_to_get` 四字段），未扣费时不带 `fee_refunded`，**零写入**（tree-meta 不注册 / 籽一字节不动 / 零流水）—— 测试现证 `lib/economy-fee.test.js` `:1321-1336`。
- **流水类型**：复用既有枚举 **`tree_create`**，**不新增 `Tx.type`** —— 现证测试 `:1306-1308`（`delta {seeds:-99}`、`operator` = 操作者本人）；两枚举（`tree_create` / `fee_refund`）均在本册既有枚举清单内（本册 §7 前端落点表 **现证 `:302`**）。
- 业务域口径（表单 / 唯一性 / 建后即挂 / 文案）= `docs/clan-tree.spec.md` **§12**（本册不复写）。

### 16-2 计费变更：`POST /admin/clan-request`（建谱申请）**移出 0 片清单 → 预扣 99 籽**

- **发起预扣**：全部校验（含重复 pending / 资格 / 唯一性 / 发源地）通过后、落申请前，从**发起人**预扣 99 籽 —— 现证 `index.js` `:2423-2435`；**`fee_ref = { txn_id, unit:'seeds', seeds, charged_at, lots }` 落申请单** `:2436-2442`；落库失败 → 原路返还 + `fee_refunded` `:2445-2448`。
- **不足 409 不落申请**（资产一字节不动）—— 测试现证 `economy-fee.test.js` `:1413-1425`；**重复 pending 409 不扣** `:1404-1411`。
- **驳回 = 先返还再落 rejected**：按 `fee_ref.lots` **原路同批次全额返还**（同 lot_id / 同 qty，不新造批次）—— 现证 `index.js` `:2496-2518`；**幂等重放检查** = 发起人账上按原流水 id 查 `fee_refund` `:2504-2507` + `status !== 'pending'` 400 闸 `:2492-2494`；返还失败 → **500 且申请保持 pending 可重试** `:2519-2521`；**复用既有 `fee_refund` 流水类型，不新增枚举**（测试 `:1442-1444`）。
- **通过不扣不退**：发起时预扣即最终扣，审批通过无二次扣费、无返还流水 —— 现证测试 `:1451-1468`。
- **竹片矩阵含义**：该路由**仍不接竹片闸门**（99 籽走籽域 `chargeSeeds`，与竹片互不换算）；「移出 0 片路由清单」= 该路由不再是**零费用**路由（`ZERO_FEE_ROUTES` 契约 30 → 29，见 16-3）。

### 16-3 矩阵条数读数（**现证**）

- **`ZERO_FEE_ROUTES` 清单：30 → 29** —— 移出注释 `economy-fee.test.js` `:1092-1093`（「Kevin 2026-10-09：/admin/clan-request 移出 0 片清单（预扣 99 籽）→ 30 - 1 = 29」）；断言 **`assert.equal(ZERO_FEE_ROUTES.length, 29, '0 片清单条数固定（矩阵即契约）')`** 现证 `:1133-1134`；正向计费清单新增 `/admin/create-clan` 现证 `:1136-1137`。
- §3-1 主表**不重排、不复编**（延续 §3-1 移除说明制度）：`clan-request` 原行 **#25** 保留原文，由本节 16-4 标注取代。

### 16-4 受影响既有行清单（**一律「已被取代 / 相关注记 · 原文保留」· 现证 grep 行号**）

- **§3-1 #25「建谱申请 · `POST /admin/clan-request` · 0 片」**（**现证 `:101`**）—— **「0 片」已被本批取代**（预扣 99 籽；竹片仍 0 片、不接竹片闸门）；旧行原文保留。
- **§3-1 #26「建谱审批（建 `kind='clan'` 树）· `POST /admin/decide-clan` · 0 片」**（**现证 `:102`**）—— **继续有效**（审批路由不接竹片闸门；「祖谱建树**不走**建树费」成立 —— 费用在**发起侧**预扣，通过不另扣）；本节 16-2 为其注记。
- **§5-2 「不接闸门」行中 `clan-*`**（**现证 `:260`**）—— `clan-request` 部分已被取代（该路由现收 99 籽；`decide-clan` 仍不接闸门，冲正走 `eco.refund` / `refundAssets` 而非闸门 `refund`）。
- **§14 交叉引用「建谱 / 建谱审批 = 0 片」**（**现证 `:462`**）—— 「建谱」半句已被取代；「建谱审批 = 0 片」继续。
- **§3-2 附录注「ZERO_FEE_ROUTES 29 → 30」**（**现证 `:135-136`**）—— 历史读数原文保留；现行 = **29**（16-3）。

### 16-5 测试（现证 · `cloudfunctions/compat-api/lib/economy-fee.test.js`）

- 本批新增 = **⑯** 全链路块（头注 `:26-29`；块标 `:1279`；直建用例 `:1289-1379`；申请-审批用例 `:1381-1469`；**现证无 ⑰ 编号用例** —— `grep '⑰'` 本文件 0 命中）。
- **基线（Jing 2026-10-09 CST 实测）**：`npm test` → **674 tests / 674 pass / 0 fail / 0 skipped**（exit 0）；`cd frontend && npm run type-check` → **EXIT 0**。

### 16-6 上云面（**只指向**）

- 云函数 `compat-api` 重打包 + H5 / 小程序两产物重打；判据与冒烟 = `docs/PENDING_DEPLOY.md` **§56**。

### 16-7 本节未做项（**如实登记**）

- **真源零写入**；**未打包 / 未部署**；**未 `git` 任何写操作**；**未碰任何 `.qa.md`**（`AGENTS.md` §0-5）。
- **一句话可改**：单价改档（≠99）时只改 `lib/clan.js` `:66` 一处常量，并同步本节 16-1 与 `docs/clan-tree.spec.md` §12-0 第 3 条读数。

---

## 17. 本册追加 · 2026-10-12：谱名修改（tree-rename）计费（**只追加 · 不改 §1–§16 任何历史行 · 删除行 = 0 · 本册无任何字面替换**）（Jing 制度员）

> **追加说明（`AGENTS.md` §0-4 纪律）**：本节为**追加章节** —— 本册 **§1–§16 的既有行一律原文保留、不机械改写**；本批新口径**只通过本节**落地。**§3-1 主表 / 合计口径 / §12-1 路由清单的对应新增行本批未落盘**：拟追加**原文**见 **§17-9**（理由 = 本批为**待实现批**、且流水枚举未定 ⇒ 见 **§17-8** 第 1 条）。
> **裁定行**：**Zang 裁定 v1 · Kevin 已拍定 2026-10-12**（其中「**口径澄清（B）**」= Kevin **当面确认**，**效力高于原始原话（A）**，逐字见 **§17-1**）。
> **实现状态**：**待实现批**（本册**不预填行号 / md5 / 字节**；实现批落盘后由质检批就地补登实测锚点）。
> ⚠️ **状态词升级 · 加注（Zang 裁定 · 2026-10-12）**：本行「**待实现批**」**自本行起读作**「**已实现（Kong）· 待独立质检（Neng）**」（**旧行原文一字不改、不回改**）；**实现面 = `cloudfunctions/compat-api/lib/tree-rename.js` / `cloudfunctions/compat-api/index.js` / `frontend/src/components/wenpu-book/wenpu-book.vue` / `frontend/src/components/clan-hall/clan-hall.vue`**（**文件名 = 派单 / 裁定给定**）；**不得写成「已通过」/「已上线」**；裁定原文 = **§18-6**（承 **§17 头**）。
> **本章登记面**：**计费 / 闸门 / 路由契约 / 字段与读面 / 入口边界 / 部署顺序 / 待澄清项 / 未落盘项**；前端形态（表单去字段、按钮与弹窗的具体落点）与业务域文案**由实现批按前端现状确定**，本册不复写。

### 17-1 原话照录（Kevin · 逐字，不改写）

- **(A) 原始原话（2026-10-12）**：「【编辑家族信息】表单中的【谱名】一栏，移动至按钮【修谱】左侧，按钮名称为【修改谱名】，360 天内再次修改谱名花费 999 竹片，30 天内再次修改谱名花费 9999 竹片。」
- **(B) 后续口径澄清（Kevin 当面确认 · 以此为准）**：「**首次及 ≥360 消耗 999 片；＜360 消耗 9999 片；＜30 消耗 99999 片**」
- **效力顺序（硬）**：A 与 B 冲突处**一律以 B 为准** —— 三档按 B 执行 **999 / 9999 / 99999**；**A 原文保留、不改写**（同 §15-6、§16-4 体例）。

### 17-2 三档矩阵（逐字）

判据量：**`Δ = now − tree-meta[tree_id].genealogy_name_updated_at`**；**天数 = `Math.ceil(Δ / 86400000)`**（自然日**向上取整**）。判定**自上而下、先命中即定格**。

| 档 | 判据（逐字） | 片数（竹片） | `tier` |
|---|---|---|---|
| **首次（无历史）或 Δ ≥ 360 天** | `genealogy_name_updated_at` 为空 / `null`（首次）**或** `Math.ceil(Δ / 86400000) >= 360` | **999** | `first_or_expired` |
| **30 ≤ Δ < 360 天** | `30 <= Math.ceil(Δ / 86400000) < 360` | **9999** | `within_360d` |
| **Δ < 30 天** | `Math.ceil(Δ / 86400000) < 30` | **99999** | `within_30d` |

- **无免费档**：任何一次**实际改名**都 ≥ **999** 片（**与修谱开轮恒 999 同构**）；**不存在 0 片档**；唯一 0 片情形 = **no-op（同值，未改名）**（§17-5）。
- **不退**：**费用一律不退**；唯一例外 = **系统落库失败 → 原路返还同一批次**（沿用本册 §4-3 / §4-5 冲正制度：追加一条 `fee_refund` + 响应带 `fee_refunded:true`）。
- **不足 ⇒ 409 `ASSET_INSUFFICIENT`，整单不写**（`need` / `current` / `unit` / `how_to_get` 四字段齐，本册 §6）：**树 JSON 一字节不写、tree-meta 不写、零流水**。
- **计费走既有竹片机器**：入口先 `sweep(now)` → FIFO by `expires_at` 升序 → 整单拒绝（本册 §4-1 – §4-4）；**不新增 `Tx.type`**（具体取哪个既有枚举 = §17-8 第 1 条未定项）。
- **档位唯一真源 = 服务端纯函数**（读面同步出数，§17-4）⇒ **前端不得重算档位**。

### 17-3 路由契约（逐字）

**`POST /admin/tree-rename`**（新增路由）

| 项 | 逐字契约 |
|---|---|
| 入参 | `{ tree_id, genealogy_name }` |
| 出参 | `{ ok, tree_id, genealogy_name, fee: { pieces, tier }, log_warning? }` |
| 权限 | **本树 `tree_steward` 及以上 + `chief_editor`**；口径 = **本树主理人锚点归属**（先例 = `lib/revision.js` 的 `assertRevisionWritable`）⇒ **只看全局 role 档位 = 越树写权缺陷**，必须校验锚点树归属 |
| no-op（同值） | **200 且 0 片**；**不写库**、**不记流水**、**不刷新 `genealogy_name_updated_at`**（末半句 = 本册必然读法，见 §17-8 第 7 条） |
| 值校验 | **非空** + **长度 ≤ 30 字符（按码点）**；不满足 ⇒ 400 |
| 留痕（实扣时） | 写一条 **`jiapu_ops_logs`**（`op = 'tree_rename_fee'`）；**写失败不阻断主流程**，出参带 **`log_warning: true`**（对齐既有 `detail_warning` 体例） |
| 计费内核 | 既有竹片机器（`chargeBamboo` 同族，本册 §5-1）；**不新增 `Tx.type`** |
| 闸门顺序 | 沿用本册 §4-3：鉴权（401 / 403）→ 只读预检 → 余额预检（**409**）→ 扣费 → 落库 → 落库失败冲正 |
| 落库写面 | `tree-meta[tree_id].genealogy_name` + **`genealogy_name_updated_at` = 本次成功时刻（ISO）** |

### 17-4 字段与读面（逐字）

- **`tree-meta` 新增字段 `genealogy_name_updated_at`**：类型 = **ISO 字符串 / `null`**；**缺省 `null`**（= 从未改过 ⇒ 首次档）。
- **`GET /tree-meta` 每树 entry 只增两个键**（**不增其它键**）：
  1. **`genealogy_name_updated_at`**（上列字段原值）；
  2. **`rename_fee_pieces`** = **服务端纯函数**按 §17-2 矩阵算出的**本次应扣片数**（999 / 9999 / 99999）。
- **前端不得重算档位**：弹窗「本次消耗 N 片」一律读 `rename_fee_pieces`。

### 17-5 no-op（同值 ⇒ 0 片）

- `genealogy_name` 与**现值同值** ⇒ **200 且 0 片**：**不写库**、**不记流水**、**不刷新 `genealogy_name_updated_at`**（本册注：否则可用同值提交把计费时钟刷回 999 档，与「无免费档 / 不退」冲突 —— 见 §17-8 第 7 条）。
- 出参仍按 §17-3 的逐字形（`fee.pieces = 0`；no-op 时 `tier` 取值 = §17-8 第 2 条未定项）。
- 与 **§4-6（缺陷 A：no-op 编辑不扣费）**属**同一制度口径**（判据各自独立：本条比对**单个字段是否同值**）。

### 17-6 入口与边界（逐字）

- **谱名从【编辑家族信息】表单移出**：该表单**不再发 `genealogy_name`**。
- **新入口** = 【在线文谱】工具条 **【✎ 修谱】按钮左侧**的 **【修改谱名】按钮 + 弹窗**；**弹窗内明示本次消耗**（读 `rename_fee_pieces`，§17-4）。
- **通用更新路由的 400 闸**：通用更新路由收到 **`genealogy_name` 且与现值不同** ⇒ **400**，文案逐字 = **`請使用【修改譜名】修改譜名`**。
  - 按字面：**仅「与现值不同」才 400**；**同值不触发该闸**（同 §4-6 制度：未变更不拒、不扣）—— 见 §17-8 第 7 条。

### 17-7 部署顺序（硬）

**顺序 = H5 先行（表单先去字段）→ 云函数（加 400 闸）**，**不可颠倒**。

- 本册注（推论）：顺序颠倒（云函数先行）⇒ **旧 H5 仍从表单发 `genealogy_name`** ⇒ 撞新 400 闸、用户连其它家族信息都改不了。
- 本册注（推论）：顺序窗口内（H5 已发 / 云函数未发）**【修改谱名】按钮调 `POST /admin/tree-rename` 会 404**（新路由未部署）—— 是否需临时兜底见 §17-8 第 6 条。

### 17-8 待澄清 / 未定项（**一律标「一句话可改」**）

| # | 项 | 登记值 | 备注 |
|---|---|---|---|
| 1 | **`Tx.type` 具体取值** | **未定**（已拍定「**不新增 `Tx.type`**」） | 自然候选 = **`edit_fee`**（本册 §7 落款表「修改类」枚举；同 §15-1 体例）；**本册不代定** —— 一句话可改；单价常量落点（`FEE` 常量？独立纯函数？）同批定（见 §17-9 #4） |
| 2 | **出参 `fee` 形状** | 逐字 = **`{ pieces, tier }`** | 与既有 **`fee: { unit, pieces, balance, balance_after }`**（如 §15-1）**形状不同** ⇒ 是否并入 `unit` / `balance` / `balance_after`、**no-op 时 `tier` 取何值** —— 未定，一句话可改 |
| 3 | **权限口径** | **本树 `tree_steward` 及以上 + `chief_editor`**（本树主理人锚点归属） | **是否只应限 `chief_editor`** —— 未定，一句话可改 |
| 4 | **长度上限** | **≤ 30 字符（按码点）** | = **派单方定的实现值**，一句话可改 |
| 5 | **天数粒度 · no-op · 留痕 op 名** | **`Math.ceil(Δ / 86400000)`**（自然日向上取整）· **no-op = 0 片** · **`op = 'tree_rename_fee'`** | 均**按本节登记**；改 `floor` / 改 no-op 收费 / 改 op 名 —— 一句话可改 |
| 6 | **顺序窗口内的表现** | **未定** | H5 已发、云函数未发窗口内按钮 **404**；是否临时兜底 / 加提示 —— 一句话可改 |
| 7 | **本册按字面 / 必然读法登记的边界**（**未经逐字确认**） | ① 通用更新路由**同值不 400**（§17-6）；② **no-op 不刷新 `genealogy_name_updated_at`**（§17-5） | 为可执行性而落的两条读法；如需改按一句话 |

### 17-9 同址登记：受影响的既有行（**原文一律保留 · 本节只追加注记**）

| # | 既有行（原文保留） | 本批关系 | 处置 |
|---|---|---|---|
| 1 | **§1 口径 1 / 口径 3**（新增类 0 片清单 + 修改删除类四条 · 「只有 4 个操作计费」） | 本批新增**第 5 个扣费操作**（**非人物节点**） | **原文保留**；本节即追加注记（同 §15-6 体例：§15 批亦未改写该行） |
| 2 | **§3-1 主表 + 合计口径**（现行：主表 36 行 / 扣费 9 行 / 0 片 27 行；编号排到 #37、**#32 空缺**） | 应新增 **1 个扣费行**（编号**续编 #38**） | **本批未落盘**；拟追加**原文**见下（届时另追加**取代行**：主表 **37 行** / 扣费 **10 行** / 0 片 **27 行**；校验 = **10 + 27 = 37**） |
| 3 | **§3-2 附录（0 片路由清单）**（现行 **29** 条，见 §16-3） | 本路由是**扣费路由**：**不进附录、不改 29 条** | 无需改动 |
| 4 | **§5-1 `FEE` 导出表**（历史行，现盘已 7 项 —— 见 §15-6 第 1 条） | 本批三档单价（999 / 9999 / 99999）**落点未定** | **原文保留**；落点由实现批定（与 §17-8 第 1 条同一事） |
| 5 | **§5-2 调用位置表**（末行「其余路由保持不接闸门」类清单） | 本批新增 **1 条接闸门路由** | **原文保留**；实现批按本节 §17-3 登记 |
| 6 | **§12-1 路由清单**（含「本册不新增任何路由」上句 + §15 批的适用范围追加行） | 本批再**新增 1 条写路由** | **本批未落盘**；拟追加**原文**见下 |
| 7 | **§14 交叉引用表** | 本批未新增跨册引用 | 无需改动 |

**拟追加原文（本批未落盘，供实现批 / 裁定后直接粘贴）**

- **§3-1 主表新增行**：

```
| 38 | 谱名修改（【在线文谱】工具条【✎ 修谱】左侧【修改谱名】） | `POST /admin/tree-rename` | 修改 · 治理（**非人物节点**） | **999 / 9999 / 99999 片**（三档；按 Δ = now − `genealogy_name_updated_at` 判定） | 不适用（**无 `dry_run`**；**no-op 同值 ⇒ 0 片**） | **本册追加 · 2026-10-12**：首次（无历史）/ Δ≥360 天 ⇒ **999**（`first_or_expired`）、30 ≤ Δ < 360 ⇒ **9999**（`within_360d`）、Δ < 30 ⇒ **99999**（`within_30d`）；天数 = `Math.ceil(Δ/86400000)`；**无免费档**、**不退**（唯一例外 = 系统失败原路返还）、不足 **409 `ASSET_INSUFFICIENT`** 整单不写；`Tx.type` **复用既有枚举**（取值见 §17-8 第 1 条）；**实扣写 `jiapu_ops_logs`（`op='tree_rename_fee'`）**；逐字口径见 **§17** |
```

- **§3-1 合计口径取代行**：

```
> **合计口径（本册追加 · 2026-10-12 · 取代上方各行，上方各行原文保留、不改写）**：新增 **#38 谱名修改（999 / 9999 / 99999 片 · 三档）** 一行后 —— 主表 **37 行**（编号排到 **#38**，其中 **#32 空缺**），**扣费行 10 行**（#1–#5、**#8**、**#34**、**#36**、**#37**、**#38**），**0 片行 27 行**（#6、#7 及 #9–#31、#33、#35）；**校验 = 10 + 27 = 37**。**编号不重排**（延续 §3-1 移除说明制度：新行续编，**#32 空缺保留**）。
```

- **§12-1 路由清单新增行**：

```
| **`POST /admin/tree-rename`** | **本册追加 · 2026-10-12**：**新增** 1 条写路由（挂竹片闸门 **三档 999 / 9999 / 99999 片**；**no-op 同值 0 片**；**无免费档**）；`Tx.type` **不新增枚举**；**`tree-meta` 新增 `genealogy_name_updated_at`** + **`GET /tree-meta` 每树 entry 增 `genealogy_name_updated_at` / `rename_fee_pieces`**；云函数**必须重打包**（否则云端 404）；H5 / 小程序**必须重打**；**部署顺序 = H5 先行 → 云函数**；逐字口径见 **§17** |
```

### 17-10 本批未落盘项（**如实登记**）

| # | 项 | 状态 | 原因 / 拟稿落点 |
|---|---|---|---|
| 1 | **`AGENTS.md`（受保护文件）**：§0 文档索引表拟追加 1 行 + §9 常见任务速查表拟追加 1 行 | **未落盘（拟稿 + 停手）** | `AGENTS.md` 为**受保护文件**；本单纪律 = **禁止写入**、**被拦即登记「未落盘 + 拟稿」并停手、不重试、不绕道** ⇒ 拟稿落本节（见下「`AGENTS.md` 拟稿」）；**落盘需用户明确批准**（先例 = `AGENTS.md` 勘误 19 的「§0 索引表末追加 1 行 · 拟稿留在册内 · 批复后落盘」） |
| 2 | **§3-1 主表 #38 行 / 合计口径取代行 / §12-1 路由行** | **未追加**（拟稿见 §17-9） | 本批为**待实现批**；表行随实现批落盘（原文可直接粘贴） |
| 3 | **`docs/PENDING_DEPLOY.md` 上云登记节** | **未落盘** | 白名单外文件。**拟稿要点**：① 云函数 `compat-api` **重打包 + `tcb fn deploy`**（新增 `POST /admin/tree-rename`，否则云端 **404**）；② **H5 / 小程序两产物重打**（表单去字段 + 新增按钮 / 弹窗）；③ **部署顺序 = H5 先行 → 云函数**；④ **无新集合、无真源数据动作**（留痕走既有 `jiapu_ops_logs`；`genealogy_name_updated_at` 落既有 `jiapu_tree_meta`） |
| 4 | **测试与实现**（`lib/economy-fee.test.js` 等） | **未落盘** | 待实现批；本册**不预填**行号 / 条数 / md5 / 字节 |
| 5 | **真源 / 代码 / `git` / 技能库 / 记忆** | **零触碰** | 本批未改代码、未改真源数据、**未做任何 `git` 写操作**、未写技能库与记忆 |

**`AGENTS.md` 拟稿（未落盘 · 格式以 `AGENTS.md` 现盘为准 · 落盘需用户明确批准）**

- **§0 文档索引表末追加 1 行**（拟稿）：

```
| 谱名修改（tree-rename）计费（**追加 · 2026-10-12 · Zang 裁定 v1 · Kevin 已拍定**） | `docs/economy-fee.spec.md` **§17** | 谱名从【编辑家族信息】表单移出 → 【在线文谱】工具条【✎ 修谱】左侧【修改谱名】按钮 + 弹窗；新路由 `POST /admin/tree-rename`（入参 `{tree_id, genealogy_name}`，出参 `{ok, tree_id, genealogy_name, fee:{pieces,tier}, log_warning?}`）；**三档 = 999 / 9999 / 99999 片**（首次 / 无历史 / Δ≥360 天 ⇒ **999** `first_or_expired`；30≤Δ<360 ⇒ **9999** `within_360d`；Δ<30 ⇒ **99999** `within_30d`；天数 = `Math.ceil(Δ/86400000)`，Δ = now − `tree-meta.genealogy_name_updated_at`）；**无免费档 · 不退**（唯一例外 = 系统失败原路返还）· 不足 **409 `ASSET_INSUFFICIENT`** 整单不写；`tree_meta` 新增 `genealogy_name_updated_at`、`GET /tree-meta` 每树增 `rename_fee_pieces`（**前端不得重算档位**）；**留痕** `jiapu_ops_logs` `op='tree_rename_fee'`（写失败 `log_warning:true` 不阻断）；通用更新路由收到变更 `genealogy_name` ⇒ **400**「請使用【修改譜名】修改譜名」；**部署顺序 = H5 先行 → 云函数**（**待实现批**） |
```

- **§9 常见任务速查表末追加 1 行**（拟稿）：

```
| **查谱名修改计价（追加 · 2026-10-12）** | 「改谱名扣多少」= `docs/economy-fee.spec.md` **§17**：三档 **999 / 9999 / 99999 片**（首次 / 无历史 / ≥360 天 ⇒ 999；30–360 天 ⇒ 9999；<30 天 ⇒ 99999；天数 = `Math.ceil(Δ/86400000)`）；**无免费档 · 不退**（唯一例外 = 系统失败原路返还）、不足 409 整单不写；**no-op 同值 0 片**；入口 = 【在线文谱】工具条【修改谱名】（**待实现批**） |
```

---

## 18. 本册追加 · 2026-10-12：谱名修改计费 · 落盘与边界补充（祖谱同规则覆盖 ＋ 通用更新路由闸 ＋ 部署顺序）（**只追加 · 不改 §1–§17 任何历史行 · 删除行 = 0 · 本册无任何字面替换**）（Jing 制度员）

> **追加说明（`AGENTS.md` §0-4 纪律）**：本节为**追加章节** —— 本册 **§1–§17 的既有行一律原文保留、不机械改写**；本批边界口径**只通过本节**落地。**（A）§17-9 拟追加的两处主表追补已按只追加形式补登**（**§3-1 主表 #38 行** ＋ **§3-1 合计口径取代行**；**§12-1 路由清单新增行** —— 落盘清单见 **§18-5**）；**（B）§17 头部「实现状态 = 待实现批」已就地加注升级**（**§18-6**）。
> **裁定行**：**Zang 裁定 · 2026-10-12**（本批 = 边界补充；**承 §17 的 Kevin 拍定口径**，**不改 §17 任何字面**）。
> **实现状态（本节 · 硬）**：**已实现（Kong）· 待独立质检（Neng）** —— **不得写成「已通过」/「已上线」**（承本册如实登记口径）。**实现面 = `cloudfunctions/compat-api/lib/tree-rename.js` / `cloudfunctions/compat-api/index.js` / `frontend/src/components/wenpu-book/wenpu-book.vue` / `frontend/src/components/clan-hall/clan-hall.vue`**（**文件名 = 派单 / 裁定给定**；**本册不预填行号 / md5 / 字节**）。
> **本章登记面**：**祖谱页同规则覆盖（§18-1）/ 通用更新路由的闸（§18-2）/ 部署顺序（硬）（§18-3）/ 实现面（§18-4）/ §17-9 落盘清单（§18-5）/ 状态词升级（§18-6）/ 未落盘项（§18-7）**。

### 18-1 边界补充 ①：祖谱页（`clan-hall`）同规则覆盖（**本批实现**）

| # | 项 | 口径 |
|---|---|---|
| **①** | **谱名同样从该页【编辑家族信息】表单移出** | 祖谱页 `frontend/src/components/clan-hall/clan-hall.vue` 的【编辑家族信息】表单**不再发 `genealogy_name`**（**与家族树页同处置**，承 §17-6） |
| **②** | **祖谱页新增【修改谱名】入口** | `clan-hall.vue` 新增 **【修改谱名】按钮 ＋ 弹窗**（**本批实现**） |
| **③** | **共用同一弹窗组件** | 祖谱页与家族树页**共用同一弹窗组件**（**单真源 · 禁止复制第二份弹窗**；与家族树页**同价同规则**） |
| **④** | **同价同规则** | 三档 **999 / 9999 / 99999 片**、天数 = **`Math.ceil(Δ / 86400000)`**、**无免费档 · 不退**（唯一例外 = 系统落库失败原路返还同一批次）、**no-op 同值 = 0 片**、不足 **409 `ASSET_INSUFFICIENT`** 整单不写 —— **与 §17-2 / §17-3 / §17-5 逐字同档**（**本批不另定单价、不另造档**） |
| **⑤** | **路由不变** | 仍走 **`POST /admin/tree-rename`**（**入参 / 出参 / 权限 / 留痕 / 闸门顺序一律承 §17-3**）；**祖谱 `kind='clan'` 不豁免扣费**（承本册 §1 口径 6） |

- **口径含义（硬）**：「**同规则覆盖**」= **计费与闸门一字不另定** —— 两页**只有入口落点不同**（家族树页 = 【在线文谱】工具条【✎ 修谱】左侧；祖谱页 = 该页【修改谱名】）；**弹窗组件、单价、档位、no-op、错误码、留痕、部署顺序全部共用一处**。

### 18-2 边界补充 ②：通用更新路由的闸（逐字）

| # | 情形 | 口径 |
|---|---|---|
| **①** | 收到 **`genealogy_name`** 且**与现值不同** | **400**，文案逐字 = **`請使用【修改譜名】修改譜名`** |
| **②** | 收到 **`genealogy_name`** 且**与现值相同** | **忽略**（**不报错**、**不 400**、**不写库**、**不计费**） |

- **读法（硬）**：该闸**只在「实际变更谱名」时拒**；**同值提交静默忽略**（承 §17-6 第 3 条 bullet / §17-8 第 7 条① 的同一读法，**本批予以确认**）。
- **闸面 = §17-6 所称「通用更新路由」**（**本册不另指其路由字面**）；**非 `genealogy_name` 字段不受该闸影响**（**其余家族信息仍照旧可改**）。

### 18-3 边界补充 ③：部署顺序（**硬**）

**顺序 = H5 先行（表单先去字段）→ 云函数（加 400 闸）**，**不可颠倒**（**与 §17-7 一致**，**本节重述为硬口径**）。

- **本册注（推论 · 承 §17-7）**：顺序颠倒（云函数先行）⇒ **旧 H5 仍从表单发 `genealogy_name`** ⇒ 撞新 400 闸、用户连其它家族信息都改不了。
- **H5 侧 = 家族树页 ＋ 祖谱页两处的表单去字段与新增入口（§18-1）**；**云函数侧 = 400 闸（§18-2）**。

### 18-4 实现面登记（**只指向 · 不预填行号**）

| # | 面 | 落点文件（**派单 / 裁定给定**） |
|---|---|---|
| **①** | **计费内核 / 档位 / 闸门** | `cloudfunctions/compat-api/lib/tree-rename.js` |
| **②** | **路由 / 400 闸 / 留痕** | `cloudfunctions/compat-api/index.js` |
| **③** | **家族树页入口与弹窗** | `frontend/src/components/wenpu-book/wenpu-book.vue` |
| **④** | **祖谱页入口与弹窗（共用组件）** | `frontend/src/components/clan-hall/clan-hall.vue` |

- **本册不预填行号 / md5 / 字节**（承 §16 / §17 纪律）；**实测锚点由独立质检批（Neng）就地补登**。

### 18-5 §17-9 两处主表追补 · 落盘清单（**只追加形式**）

| # | 落盘项 | 落点 | 形式 | 原文来源 |
|---|---|---|---|---|
| **①** | **§3-1 主表 #38 行** | **§3-1 主表**（**#37 行之后**） | **只追加 1 行**（**原行一字未改**） | **§17-9「拟追加原文」逐字** |
| **②** | **§3-1 合计口径取代行** | **§3-1 合计口径链**（**Z-10a 行之后**） | **只追加 1 行**（**上方各行原文保留**） | 同上 |
| **③** | **§12-1 路由清单新增行** | **§12-1「新增 / 变更路由（本批）」表**（**sibling-reorder 行之后**） | **只追加 1 行**（**原行一字未改**） | 同上 |

- **落盘文本逐字取自 §17-9 的「拟追加原文」**（**不改意、不增删**）；**本册无任何字面替换**（承 §15 / §16 / §17 体例）。
- **有意未加注（登记备查 · 防止误判为遗漏）**：**§17-9 各行与 §17-10 表 #2 行的「未落盘 / 待实现批」字面一律原文保留、不加注** —— 其时效**自本批起止**（**读法 = 已按 §18-5 落盘**）；**不得**据「此处无加注」推定「表行未落盘」或「实现未落地」。
- **§17-10 表 #1 / #3 行的未落盘状态**（`AGENTS.md` / `docs/PENDING_DEPLOY.md`）**自本批起仍成立**（见 §18-7）。

### 18-6 状态词升级（承 §17 头 · **就地加注**）

- **§17 头「实现状态 = 待实现批」** **自本批起读作** = **已实现（Kong）· 待独立质检（Neng）**；**旧行原文一字不改、不回改**（**已于该行下方就地加注一行**）。
- **实现面** = §18-4 四文件（**文件名 = 派单 / 裁定给定**）。
- **不得写成「已通过」/「已上线」**；**独立质检（Neng）与部署另单**（承 §17-7 / §17-10）。

### 18-7 未落盘项与原因（**如实登记 · 不重试不绕道**）

| # | 未落盘项 | 原因 / 拟稿落点 |
|---|---|---|
| **①** | **`AGENTS.md`（受保护文件）**：§0 文档索引表 / §9 常见任务速查表拟**更新版**行（**状态改「已实现（Kong）· 待独立质检（Neng）」＋ 补登祖谱页同规则覆盖与「两页共用同一弹窗组件」＋ 部署顺序**） | **受保护文件 · 本单硬禁写** ⇒ **停手、不重试、不绕道**；拟稿见下（**§17-10 的旧拟稿原文保留、不回改**） |
| **②** | **`docs/PENDING_DEPLOY.md` 上云登记节**（**白名单外**） | **未落盘**；拟稿要点 = ① 云函数 `compat-api` 重打包（`POST /admin/tree-rename` 否则 404）；② **H5 / 小程序两产物重打**（家族树页 ＋ 祖谱页两处表单去字段与新增入口）；③ **部署顺序 = H5 先行 → 云函数**；④ **无新集合、无真源动作**（留痕走既有 `jiapu_ops_logs`；`genealogy_name_updated_at` 落既有 `jiapu_tree_meta`） |
| **③** | **独立质检（Neng）与部署** | **本单 = 制度登记单**：**未改任何代码 / `config/**` / 真源**；**未 commit / 未 push / 未部署** |
| **④** | **`docs/*.qa.md`** | **一字未动**（`AGENTS.md` §0-5） |

**`AGENTS.md` 拟稿（更新版 · 未落盘 · 受保护文件 · 待授权）**

> **纪律（硬）**：**本单硬禁写 `AGENTS.md`** ⇒ **停手、不重试、不绕道**；本子节**只登记拟稿文本、不落盘**。**§17-10 的旧拟稿原文保留、不回改**。

- **§0 文档索引表末追加行（拟稿 · 更新版 · 逐字）**：

```
| 谱名修改（tree-rename）计费（**追加 · 2026-10-12 · Zang 裁定 v1 · Kevin 已拍定**） | `docs/economy-fee.spec.md` **§17 ＋ §18** | 谱名从【编辑家族信息】表单移出 → 【在线文谱】工具条【✎ 修谱】左侧【修改谱名】按钮 ＋ 弹窗；新路由 `POST /admin/tree-rename`；三档 **999 / 9999 / 99999 片**（天数 = `Math.ceil(Δ/86400000)`，Δ = now − `tree-meta.genealogy_name_updated_at`）；**无免费档 · 不退**（唯一例外 = 系统失败原路返还）· 不足 **409 `ASSET_INSUFFICIENT`** 整单不写；`tree_meta` 新增 `genealogy_name_updated_at`、`GET /tree-meta` 每树增 `rename_fee_pieces`（前端不得重算档位）；留痕 `jiapu_ops_logs` `op='tree_rename_fee'`；通用更新路由收到变更 `genealogy_name` ⇒ **400**「請使用【修改譜名】修改譜名」（同值忽略不报错）；**部署顺序 = H5 先行 → 云函数**；**§18 边界补充：祖谱页 `clan-hall` 同规则覆盖（谱名同样自【编辑家族信息】表单移出 ＋ 新增【修改谱名】入口；与家族树页共用同一弹窗组件、同价同规则）**；状态 = **已实现（Kong）· 待独立质检（Neng）** |
```

- **§9 常见任务速查表末追加行（拟稿 · 更新版 · 逐字）**：

```
| **查谱名修改计价（追加 · 2026-10-12）** | 「改谱名扣多少」= `docs/economy-fee.spec.md` **§17 ＋ §18**：三档 **999 / 9999 / 99999 片**（首次 / 无历史 / ≥360 天 ⇒ 999；30–360 天 ⇒ 9999；<30 天 ⇒ 99999；天数 = `Math.ceil(Δ/86400000)`）；**无免费档 · 不退**（唯一例外 = 系统失败原路返还）、不足 409 整单不写；**no-op 同值 0 片**；入口 = 【在线文谱】工具条 / **祖谱页** 的【修改谱名】（**已实现（Kong）· 待独立质检（Neng）**） |
```
