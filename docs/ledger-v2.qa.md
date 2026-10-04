# 路 B · 账本存储形态 v2 独立质检册（`docs/ledger-v2.qa.md`）

> **承 `AGENTS.md` §2.3「质检归 `docs/*.qa.md`」**。本册 = **路 B（写一致性 v2 · 多主体文档 + `version` CAS）** 的**独立质检证据落册**（**质检人 = Neng**）。
>
> **质检环境 = `/tmp` 副本栈（真源零写）**：主仓**未改**源码 `LIB` + `V1D`（未改 v1 data root）+ `E`（已 apply 的迁移副本）；**`COMPAT_SOURCE=local`** · **`COMPAT_OUT_DIR=E`** · **`COMPAT_META_FILE=E/tree-meta.json`**。**真源 `migrate-output/**` / `config/**` 全程只读、零写入**。
>
> **规格落点 = `docs/data-model.md` §7.2**（含本批追加子条）；**上云动作面 = `docs/PENDING_DEPLOY.md` §51**；**本地真源写入登记 = `AGENTS.md` §7 追加行**。**状态 = 已实现（Kong）、已质检（Neng）**（**未上云**）。**行号 / md5 / 数值一律现取、不推算、不预填。**

## §1 结论（可直接引用）

- **`npm test` 复跑 = `649/649/0`**（`node --test` · `/tmp` 副本 · **现证 `/tmp/qa-jiazu-1791037934/npm-test.full.txt`**）⇒ **与实现单自述吻合**（详 §2）。
- **`npm test` 脚本注册清单 = 39 条 = 磁盘 `*.test.js` 39 个**（**MATCH**）（详 §2）。
- **四条反证 / 承重用例全部如期转红、无一假绿**（详 §3）。
- **五个迁移脚本：dry-run 零写 → `--apply` → 再跑幂等**；**迁移后真读回 `41/41` 同值**（详 §4）。
- **枚举型路径语义与改造前逐值一致**（日志定序 / 过滤 / limit · 市集列表 · admin 资产汇总 · `settleAllTrees`）（详 §5）。
- **未测项逐条如实**（详 §6）；**质检后补一条承重用例使反证可达可判负 ⇒ `650/650/0`**（详 §7）。

## §2 复跑吻合

- **全量复跑**：`node --test`（39 文件 · `/tmp` 副本 · 真源零写）= **`# tests 649` / `# pass 649` / `# fail 0`**（**现证 `npm-test.full.txt`**）。
- **注册 = 磁盘 MATCH**：`package.json` 的 `scripts.test` 注册的 `*.test.js` 条数 **= 39** ⇔ 现盘 `find cloudfunctions frontend/src -name '*.test.*'` **= 39**。
- **type-check**：`frontend` `vue-tsc --noEmit` **`EXIT=0`**（**现证 `/tmp/qa-jiazu-1791037934/type-check.txt`**）。
- **`meta-guard.test.js` 分组复跑** = **`16/16/0`**（含 §3 的 tree-meta 反证与「本文件全程未写真实数据：`config/tree-meta.json` 与 `migrate-output/` 逐字节一致」）（**现证 `meta-guard.txt`**）。
- **sh`shape-check.mjs`**（现证）：六集合 **`no-global=True`** 且 **逐档** `_id===k` **+** `version` 为 ≥1 整数；`tree-meta` **`trees=19` / `withVersion=19`** ⇒ **`BAD=[]`**。

## §3 反证 / 承重用例（负控 · 改坏必红）

> **判据 = 「把生产口径改坏 ⇒ 对应用例必须转红（不得假绿）」**。四条逐条：

| # | 承重对象 | 用例（现盘 `NR`） | 反证语义 | 质检结果 |
|---|---|---|---|---|
| ① | `store.mutateDoc` CAS（assets/store） | `lib/assets.test.js` **`NR==584`**「CAS 断言有效性（反证）：同序下「无条件写」丢更新 —— 证明上一条并发断言不是摆设」 | 同序并发下改用**无条件整写** ⇒ 丢更新（证明上一条 `mutateDoc` CAS 断言非摆设） | **如期转红** |
| ② | `jiazu_wallets` CAS + **同 mutator 原子** | `lib/wallet.test.js` **`NR==311`**「⑦-2 反证：同序下「无条件写（colSet）」丢更新」 | 同序并发下改用 **`colSet` 无条件写** ⇒ 丢更新 | **如期转红** |
| ③ | `jiazu_tree_meta` **定向写**（每树一档） | `lib/meta-guard.test.js` **`NR==254`**「⑥ 并发：两棵不同树并发定向改名 → 互不覆盖；反证：整份写必丢一路」 | 旧「读整份 → 改 → 整份写」同序并发 ⇒ **先写者被覆盖**（证明定向写断言非摆设） | **如期转红** |
| ④ | `jiazu_market` `open→sold` 认领守卫（`assertOpen`） | `lib/economy-market.test.js` **`NR==700`**「并发买同一挂单（败者资产充足）：open→sold 认领守卫承重 —— 只 1 单成功，另 1 个逐字 409「挂单已成交或已撤单」」 | 卖家 2 束只挂 1 束 ⇒ 败者 **`planTrade` 侧资产充足** ⇒「只 1 单成功」**只能**由 `assertOpen` 承重（去除稀缺性兜底） | **如期转红**（**质检后补 · 见 §7**） |

- **① / ② / ③ 为套内具名「反证」用例**（现盘逐条 `NR` 如上，均为生产代码谓词直击）；**④ 为质检后补的承重用例**（同一判据、把 `assertOpen` 从「被稀缺性过度决定」变为**唯一决定项**）。
- **「无一假绿」自证**：①②③ 在生产 CAS/定向写**在位**时为 **PASS**（`npm-test.full.txt` 内 `ok 32 / ok 647 / ok 458`），一旦把生产口径改坏即转 **FAIL** ⇒ **断言确实承重**。

## §4 迁移脚本与真读回

- **五个迁移脚本**（逐个）：`scripts/migrate-assets-to-per-user-2026-10.mjs` · `scripts/migrate-messaging-and-logs-to-v2-2026-10.mjs` · `scripts/migrate-market-to-v2-2026-10.mjs` · `scripts/migrate-wallets-to-per-user-2026-10.mjs` · `scripts/migrate-tree-meta-to-per-tree-2026-10.mjs`。
- **三步法复核**（每个脚本）：**① `dry-run` 零写**（副本前后聚合 md5 不变）→ **② `--apply`** → **③ 再跑幂等**（第二次零写、聚合不变）。
- **真读回 `41/41` 同值**（**现证 `readback.mjs`**，`COMPAT_SOURCE=local` + 副本根；**主仓未改源码**）：把已 apply 的副本数据经**生产读路径**读回，与 **v1 data root** 逐值比对（`canon()` 键序无关深比较、`strip()` 去 `_id`/`version`）—— 覆盖 `getAssets(手机号)` · `readSpiritEntry(树)` · `getMessages(手机号)` · `warnedKeys()` · `opsLogs({limit:200})` · `getUserBalance(手机号)` · `getMeta()`（`_schema`/`_description`/`storage_files`/`trees` 去 `version`/出参键集）· `adminUserAssets(手机号)` 九字段 · `marketListings()` · `settleAllTrees()` ⇒ **`pass=41 / fail=0`**（`process.exit(0)`）。

## §5 枚举语义（与改造前逐值一致）

- **运营日志 `opsLogs`**：**默认 `limit=50`** · **超上限 `clamp` 到 `200`** · **定序 = `ts` 倒序**、**同刻后写在前**（= 原数组下标倒序）· `operator` / `phone`（`target_phone`）过滤 · 出参**不泄漏 `_id`/`version`** ⇒ 逐值同值（`readback.mjs`）。
- **市集列表 `marketListings()`**：集合与 v1 `listings` 同值（比对时取 `2026-10-03T10:00:00+08:00` 作 `now` ⇒ 避开 21:00 惰性官方释放的写入）。
- **admin 资产汇总 `adminUserAssets(手机号)`**：`fragments` / `seeds_total` / `bamboos_total_pieces` / `jades` / `seed_lots` / `bamboo_lots` / `jade_list`（含 `permanent` 派生）/ `scroll` 域 / `signin_date` 逐值一致。
- **`settleAllTrees()`**：全树结算 **零变更**（expiries 均在未来）⇒ `changed.length === 0`。

## §6 未测项（如实登记）

- **`--cloud` 分支未实跑**：质检环境无 CloudBase 凭据 ⇒ cloud 形态（`where({_id,version})` 条件写 / 分页 `get()`）**只在 `local` 分支实测**；cloud 路径**未在真云端验证**。
- **真源 `jiazu_market` 为空集** ⇒ 市集列表比对**平凡**（v1 `listings` 0 条）；**非空挂单下的枚举未在真源样本上比对**。
- **日志无同刻样本** ⇒ 「同刻后写在前」排序**无实测触发样本**（仅人工构造的期望函数逐值一致）。
- **上云面 / 云端旧 `global` 删除 / 冒烟**：**未执行**（见 `docs/PENDING_DEPLOY.md` §51）。

## §7 质检后补（承重用例 · 使反证可判负）

- **新增用例** = `lib/economy-market.test.js` **`NR==700`**「并发买同一挂单（败者资产充足）…」（**注释 `NR==696`–`NR==699` 说明**）：旧用例卖家仅 1 束，**稀缺性（败者 `planTrade` 竹片不足 409）过度决定「只 1 单成功」** ⇒ `assertOpen` 非承重；新用例卖家 2 束只挂 1 束 ⇒ **败者资产充足** ⇒ 承重归 `assertOpen`。
  - **效果**：把该用例改坏（去 `assertOpen` / 去 CAS 认领）⇒ **必红**；据此**套内反证/承重用例合计四条**（§3 全表）。
  - **复跑读数**：加此用例后 **`# tests 650` / `# pass 650` / `# fail 0`**（**现证 `/tmp/full.log`**）。
- **陈旧注释已改**：`scripts/upload-migrated-to-cloudbase.mjs:7` 的陈旧 `tree-meta` 注释已更正（现证该行 = `collection jiazu_tree_meta（_meta 单档 + 每树一档 _id=tree_id）`）。
