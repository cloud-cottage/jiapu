/**
 * 在线文谱 —— 谱文生成**纯逻辑**（数据层；无 uni / 无 DOM / 不引组件）
 *
 * 口径 = Zang 定稿（「在线文谱」批 · 2026-09-26）· 与视图层**冰结契约**（签名 / 字段名不得改）：
 *   WENPU_COLS_PER_ROW = 30 / WENPU_ROWS_PER_PAGE = 4 / WENPU_CHARS_PER_COL = 10
 *
 * 1) **世系序 = 世代优先（层序 / BFS）+ 配偶紧随本人**（Kevin 已当面裁定 · 2026-09-26）：
 *    起点 = tree-meta `founder_handle`（缺失 → 以 `founder_gramps_id` 在树内反查 handle）；
 *    逐代推进（**队列**），处理当前代时**按入队顺序**逐人：
 *    ① 输出**本人行** → ② 若为**本人行**且其配偶在本树内可见且未被输出 ⇒ **立即输出配偶行**
 *    （配偶 = 与其共处同一 family 的另一方；**配偶紧随本人 = 硬口径**；**配偶行不输出「行第」**）
 *    → ③ 把其可见子女按 `families.child_handles` **位次**追加到**下一代队列**
 *    （**同一辈的人全部排完才进下一辈**）。配偶行**也**把其可见子女追加到下一代队列 ——
 *    靠 `visited` 去重 ⇒ 常见情形（子女与配偶同源）实际顺序与「仅本人行入队」相同，
 *    保留此支只为配偶另有前婚子女时不回退。
 *    不可达孤立节点**照旧**追加在**全部可达内容之后**、按 `gramps_id` 升序（`handle` 作 tie-break），
 *    **不另起空页、不丢内容**。
 * 2) **栏顺序**（一栏 = 一条数据；一条超 10 字只在**该条内部**续栏，绝不跨条拼接；缺项**整条跳过**）：
 *    ① 姓名（**姓名书写口径** `displayName()` 的产物，`isName: true`）② 行第（`行` + 汉字序；序 = 父家族 child_handles 位次，配偶行无）
 *    ③ 生于 <农历>（**W-20**：有值但非 ISO ⇒ `生年不详`）④ 在世 / 卒于 <农历>（**W-20**：有值但非 ISO、
 *    或缺卒年且 `is_living === false` ⇒ `卒年不详`）⑤ 葬于 <death_place> ⑥ 子女数串「子N女M」（**只数 'M' / 'F'**、
 *    只写非 0 项；无 M / F ⇒ 计数归零 ⇒ 整条计数串跳过）
 *    ⑦ 子女逐条（顺序 = child_handles 位次；标签 = **按性别各自计数**：长子/次子/三子…、长女/次女…，
 *    女儿不占儿子序号），后接**姓名书写口径**产物（形如「长子 X」）；**性别未知（gender 非 'M' / 'F'）的子女
 *    不参与「子N女M」计数、不加「长/次」标签，其条目只输出**姓名书写口径**产物**（不自造「子女」「幼」类标签）。
 *    **姓名书写口径**（Kevin 已当面裁定 · 2026-09-26）—— 单一纯函数 `displayName(p, rootSurname)`，
 *    **姓名栏与「子女」栏共用**（**不得**两处各自拼串）；规则先出**简体**串、随后统一繁体化（`氏` 简繁同形）：
 *      R1 **本姓**（`surname` === 本树姓氏）⇒ **只写名**不体现姓氏（「季清昆」→「清昆」）；
 *      R2 **外姓**（`surname` 非空且 ≠ 本树姓氏）⇒ `姓` + `氏` + 空格 + 名（「顾景月」→「顾氏 景月」）；
 *      R3 **姓氏字段为空**（`surname === ''`）⇒ `氏` + 空格 + 名（**无前导空格**；「三婶」→「氏 三婶」）。
 *      名的取法 = `surname` 非空且 `name.startsWith(surname)` ⇒ `name.slice(surname.length)`，否则 = `name`
 *      （**禁止**按固定宽度切字 / 「去首字」）。
 *      本树姓氏取值链（`rootSurnameOf`）= ① tree-meta `surname` → ② **始祖节点**（`founder_handle`，缺失则以
 *      `founder_gramps_id` 反查）的 `surname` → ③ `genealogy_name` 首字；**三者皆取不到 ⇒ 姓名一律原样输出
 *      （不套规则）**。适用范围 = **书页内全部出现姓名处**（姓名栏 + 「子女」栏逐条子女名 + 配偶行）。
 *      真源边缘**如实保留、不得自行「修好」**：`季四婶`（本姓）⇒「四婶」（与空姓节点 `四婶` ⇒「氏 四婶」并存）、
 *      `季？` ⇒「？」、`辛本荣 六婶` ⇒「辛氏 本荣 六婶」（含空格，数据原样）。
 * 3) 日期一律农历（`lunar.ts` 的 `solarToLunarText`；「只有年月」档 = 该公历月 15 日所在农历月）。
 * 4) 分页：每页固定 4 行、不足补 `null`；某人栏数 > 30 时多余栏**挤占下一行**（同样占行位、不丢内容）。
 * 5) 书口：`leftLabel` = `▲ <谱名> 葉<汉字序>`（谱名 = `genealogy_name`，空则 `display_title`）、
 *    `rightLabel` = `▲ <堂号> 葉<汉字序>`（堂号 = `hall_name`）；**`hall_name` 空或字面「暂无」⇒ `rightLabel = ''`**。
 *    页码：第 k 页（0 起）左 = `2k+1`、右 = `2k+2`（**汉字序**，两侧各 +2 / 翻一页 ⇒ 一组书口内两页连号）。
 * 6) 繁体：所有栏文本 + 两侧书口**一律繁体**（`traditional.ts` 的 `toTraditional`，OpenCC s2t 纯字形）；
 *    **只在渲染派生**：零回写、不进请求参数、不落真源。
 * 7) 空态：**真·无人物** ⇒ `empty: true` / `pages: []` / `rowCount: 0` / `error` 不为 true；
 *    **读失败**（网络错误 / 非 2xx / 树不存在 404）⇒ `error: true` / `empty: false` / `pages: []` / `rowCount: 0`
 *    —— 二者**不得渲染同一文案**：无人物 = 纸面繁体「暫無譜文」、读失败 = 纸外简体「谱文读取失败」（视图层判 `error`）。
 *    只渲染读 API 返回的集合（服务端节点级裁剪后的可见集；前端**不自行裁剪、不绕过裁剪**）。
 * 8) **始祖回退链（W-17）**：取起点时**依次尝试** ① tree-meta `founder_handle` → ② tree-meta `founder_gramps_id`
 *    在树内反查 → ③ 树内**本姓**（= 下条**初步本姓**）且**无父家族**的节点（多个取 `gramps_id` 升序最小、
 *    `handle` 兜底）→ ④ 树内**无父家族**的节点（多个同样取最小）→ ⑤ 仍无 ⇒ **无起点**（全员皆孤立，现状保持）。
 *    前端可见面**没有** `parent_family` 字段 ⇒ 「无父家族」以**不被任何家族 `child_handles` 收录**判定
 *    （真源实测两树 **0 不符**：`parent_family` 非空 ⇔ 被某家族 `child_handles` 收录；见 W-19 同款判据）。
 * 9) **本姓取值链（W-18）** = `surname` → `surname_char` → **推断出的始祖节点的 `surname`** → `genealogy_name` 首字
 *    → `display_title` 首字 → 空串（空串 ⇒ 姓名一律原样输出）。**不得成环**：始祖推断（W-17③）只用
 *    **初步本姓** = `surname` → `surname_char` → `genealogy_name` 首字 → `display_title` 首字（**不含**始祖那一级）。
 * 10) **女儿线整支终止（W-19）**：**女儿**判据（硬）= 本姓 且 `gender === 'F'` 且**本人被某家族 `child_handles` 收录**
 *    —— **不得**用「本姓 F 且是某个家族的母亲」判（**媳妇**会被误判 ⇒ 连带删掉其本姓丈夫；
 *    反例：季氏树 `季凤伶` 是媳妇、`parent_family=''` 且不在任何 `child_handles` 里）；
 *    **排除集合 E** = 各女儿的**配偶** + **女儿线后代**（沿 `child_handles` 向下：女儿 → 子女 → 孙辈…）**及其配偶**
 *    —— **女儿本人不入 E**、姻亲（配偶）**不再向外延伸**；
 *    **可见集 = 全部节点 − E**，层序遍历、孤立补尾、子女数串与子女逐条**一律在可见集内进行**
 *    ⇒ E 内成员**不得出现在书页任何位置**（含尾部孤立节点）。女儿本人（不在 E 内时）照常渲染（含行第），
 *    **媳妇与本姓男性成员一律不受影响**。（本条的「可见集」= 减 E 后的集合，与第 7 条「服务端裁剪后的可见集」是两件事。）
 * 11) **生卒栏「不詳」口径（W-20 · Kevin 已当面拍定 · 2026-09-26）**：日期判定一律用 **ISO 形状**
 *    （`^\d{4}$` / `^\d{4}-\d{2}$` / `^\d{4}-\d{2}-\d{2}$`，见 `isIsoDate()`）：
 *    **生於栏**：① 命中 ISO ⇒ **既有农历口径不动**；② **有值但非 ISO** ⇒ `生年不详`；③ 缺失 / 空串 ⇒ **既有「整条跳过」不动**。
 *    **卒於栏**（与「在世」**同一栏位**）：① 命中 ISO ⇒ **既有农历口径不动**；② **有值但非 ISO** ⇒ `卒年不详`（**不再原样印原字面**）；
 *    ③ 缺失 / 空串 **且 `is_living === false`（严格等值）** ⇒ `卒年不详`；④ 缺失 / 空串 **且 `is_living !== false`**
 *    （`true` / `null` / 缺字段）⇒ **既有 `在世` 不动**（非真值时维持原有「无输出」）。
 *    出口 = **简体**串（`详` 由 `traditional.ts` 产 `詳`）；**栏序 / 行第 / 世系序 / E 剔除集 / 页数 / 书口 / 姓名口径一律不动**。
 * 12) **第一部分修谱页排版 = 整页整体分列（Kevin 2026-10-12 拍定）**：族務紀文 / 譜司襄事 / 樂捐名錄
 *    **不再整页四行** —— 去 4 行结构与行分隔线，各条文本以空格相接成**整页连续文流**，按每栏
 *    `WENPU_FLOW_CHARS_PER_COL`（26）字 × 每页 `WENPU_FLOW_COLS_PER_PAGE`（30）栏重分栏分页，
 *    纵向列从右向左连续排满整页（**一句话可改**）；视图层对 `kind ∈ article|roster|donation|postscript`
 *    走 `.book-flow` 分支（26px / name-col 30px）。**人物名录页（缺省 `genealogy`）一字不动**
 *    （17px / 每页 4 行 / 每行 ≤30 栏 / 每栏恰 10 字 / name-col 20px / 行间 1px #111 上边框全保留）；
 *    昭範正圖（`cover`）仍独立整页大图、**不入列**。
 * 13) **后记页（新增 · `kind = 'postscript'` · 平台自动生成、读者不可编辑）**：**独立整页置于全书最末**
 *    （仅当全书已有页面时追加；书口沿用 `finishBook()` 同一套连号）。
 *    **文案 = Kevin 2026-10-12 定稿（繁体 · 逐字上屏；标点一字不改）**；仅**最终整段过一次** `toTraditional`（补齐月名简体字 `闰`/`腊`）：
 *      多轮（**每轮各出一句**「其後…主司…」；Kevin 例文只给 1 轮 ⇒ 逐轮句 **一句话可改**，本句按「一經 / 二經 / 三經…」逐轮各写一句）：
 *        `本族家譜，肇創於{Y1}，由{C1}始纂。其後{N}經修輯於{Y}，主司{M}。今為最新釐正版，是為{Ylast}訂本。願後之族人、續而增修之。`
 *      无修订（省「其後…主司…」句）：
 *        `本族家譜，肇創於{Y1}，由{C1}始纂。今為最新釐正版，是為{Y1}訂本。願後之族人、續而增修之。`
 *    取值来源 = 后端并行批 `GET /revisions` 顶层**新增** `postscript`（只增不改）+ tree-meta + `revisions[]`：
 *      `{C1}` = `postscript.created_by_name`；`{M}` = `postscript.masters[]` 里 `seq` 匹配该轮的 `name`；
 *      `{Y1}` = 创建农历**年月**位 = tree-meta `created_at`（复用 `lunar.ts`；值如「丙午年七月」/「乙酉年」）；
 *      `{Y}` = 该轮 `effective_at` 优先、缺则 `started_at` 的同形年月位；`{Ylast}` = 最后一轮者（无修订 ⇒ 创建年位）。
 *    **兜底（`postscript` 缺失 / 字段缺失 / 请求失败 ⇒ 不改前两部分、不报错；全部「一句话可改」）**：
 *      · `postscript` 缺失 或 `created_by_name` 空串 ⇒ 省「由{C1}」半句 ⇒ `肇創於{Y1}。`；
 *      · `masters` 缺失 或该轮无名 ⇒ 省「，主司{M}」半句 ⇒ `其後{N}經修輯於{Y}。`；
 *      · `created_at` 非 ISO / 缺失 ⇒ 年位用 `不詳`（**仍保持句形完整**）；各轮年位同理。
 *    revisions 读取失败或空 ⇒ 按「无修订」态渲染、不报错、不影响前两部分。
 *    **（已被取代 · 2026-10-12 定稿批）** 旧草拟文案（`本譜於{Y1}年由{creator}創建，…，今為創建本。`）+
 *    创建者 = 手机号打码（`166****1656`）+ 兜底「本平台」已整体废弃（不再有 `creator` 概念）。
 * 14) **封面页（W-26 · Kevin 2026-10-12 拍定）**：新增页别 `WenpuPage.kind = 'frontcover'`
 *    （**不复用既有 `'cover'`** —— 那是修谱昭範正圖整页大图）。
 *    ① **位置 = 全书第一页**（在「第一部分·修谱卷」之前），翻页时首页即封面；
 *    ② **内容 = 只有【谱名】**（`genealogy_name`，为空 ⇒ `display_title`）—— 走既有 `titleOf()`
 *    ⇒ **与书口谱名同口径**（已 `toTraditional`，繁体上屏；视图层零字形转换）；
 *    ③ **不参与叶序**：封面页**不写任何书口**（`leftLabel` / `rightLabel` 均空），`finishBook()` 计数**跳过封面**
 *    ⇒ 其后各页书口与「不加封面」时**逐字一致**（仍从 `葉一` 起）；
 *    ④ **排版**（Kevin 2026-10-14 改定 · 半叶化）：**只占左半 480×720**（深棕 `#4A3629` 铺满、边到边），
 *    **右半留白**（纸色 `#F7F3E8`）；左半正中一块**米色题签**（`#F7F3E8` 底 + 2px `#8B7355` 边框、
 *    150×430 居中），谱名竖排 36px / 字距 6px / 色 `#222`（**字色一字不改**）；纸页仍 960×720、
 *    1px `#222` 外框与书脊不变（**视图层 `.book-front-cover` 分支**）；
 *    ⑤ **空书不渲染封面**（无谱文、无修谱 ⇒ 保持既有「暫無譜文」空态单页）；`empty` 判定**只看非封面/封底页数**；
 *    ⑥ 零后端改动、零新增请求（谱名已在既有 tree-meta 读取里）。
 *
 * 15) **乌丝栏双轨竖排（Kevin 2026-10-12 拍定 · 仅 `article` 族務紀文 / `postscript` 后记两页）**：
 *    每个栏格拆 **字列轨（左 26px，字号 26px 不变）+ 标点列轨（右 14px，字号 14px，真占版宽）**；
 *    **转译仅在渲染时**（底层存储保留原文含标点、零回写、后端零改动）：`，` ⇒ `·`、`。` ⇒ `○`，
 *    标点字符**从字列剔除**（不占字位）、改画在**其前面紧邻那个汉字**同一格的标点轨内
 *    （竖排字在左 / 标点在右，格内垂直居中 ⇒ 与所属字同 y 带）；无标点 ⇒ 标点轨留白；
 *    **空格一律不占字位**（三字段拼接空格 + 存量旧数据折出的空格，两轨皆不进）。
 *    栏格宽 = 26 + 14 + 2 + 1 = **43px** ⇒ 每页栏数 878 ÷ 43 ≈ 20.4 ⇒ **20 栏**
 *    （原单轨 29px / 30 栏 ⇒ 栏格变宽、每页栏数减少；常量见 `WENPU_DUAL_*`，**一句话可改**）。
 *    `roster` / `donation` / `genealogy` / `frontcover` / `cover` **一律保持单轨现状、字字不变**
 *    （单轨栏不设 `puncts` 字段 ⇒ 视图层不渲染标点轨）。
 *
 * 16) **封底页（Kevin 2026-10-14 拍定 · 与封面成对）**：新增页别 `WenpuPage.kind = 'backcover'`。
 *    ① **位置 = 全书最后一页**（在**后记 `postscript` 之后**）；
 *    ② **内容 = 只有一枚印章**（印文「中华数字家谱」；**暖白 `#F1E7D6`**、约 300×300 居中）；
 *    ③ **不参与叶序**：与封面同口径（`leftLabel` / `rightLabel` 均空、`finishBook()` 计数同样跳过）
 *    ⇒ 其后不存在页，**已有任何页的书口逐字不变**；
 *    ④ **排版（半叶化 · 与封面镜像）**：**只占右半 480×720**（深棕 `#4A3629` 铺满、边到边），
 *    **左半留白**（纸色 `#F7F3E8`）；纸页仍 960×720、1px `#222` 外框与书脊不变
 *    （**视图层 `.book-back-cover` 分支**）；印章资产 = `static/icons/wenpu-seal.svg`（**SVG**，经 `icons.ts` 引用）；
 *    ⑤ **空书不渲染**（与封面同口径：整本无页 ⇒ 不插封面也不插封底，保持「暫無譜文」空态单页）。
 *
 * 取数（既有 API，零新增后端调用）：`fetchPersonList(treeId, 0, 0)` 全量人物 +
 * `fetchFamilyList(treeId)` 家族（含 `father_handle` / `mother_handle` / `child_handles[]`）+
 * `fetchTreeMetaRemote()` 谱名 / 堂号 / 始祖。
 */

import { fetchFamilyList, fetchPersonList, fetchTreeMetaRemote } from './api';
import type { FamilySummary } from './api';
import type { PersonSummary, TreeMeta, TreeEntry, WenpuConfig } from './types';
import { ganZhiOf, LUNAR_FIRST_YEAR, LUNAR_LAST_YEAR, lunarMonthName, solarToLunarFields, solarToLunarText } from './lunar';
import { toTraditional } from './traditional';
import type { RevisionRecord, RevisionView } from './revision';

/** 每行栏数（= 每行 30 条数据栏） */
export const WENPU_COLS_PER_ROW = 30;
/** 每页行数（固定 4 行，不足补 `null`） */
export const WENPU_ROWS_PER_PAGE = 4;
/** 每栏字数上限（一条数据超此长度 → 在**该条内部**续栏） */
export const WENPU_CHARS_PER_COL = 10;

/** 第一部分修谱页 / 后记页（**整页整体分列**）：每栏字数（内容高 684px ÷ 26px 字号 ≈ 26.3 ⇒ 26；**一句话可改**） */
export const WENPU_FLOW_CHARS_PER_COL = 26;
/** 第一部分修谱页 / 后记页（**整页整体分列**）：每页栏数（内容宽 878px ÷ 29px（26px 栏宽 + 左右 1px padding + 1px 栏线）≈ 30.3 ⇒ 30；**一句话可改**） */
export const WENPU_FLOW_COLS_PER_PAGE = 30;

/**
 * **乌丝栏双轨竖排**（**仅 `article`（族務紀文）/ `postscript`（后记）两页**；Kevin 2026-10-12 拍定）：
 * 每个栏格拆为 **字列轨（左）** + **标点列轨（右）** —— 标点列**真占版宽**（不再是「标点也吃一个 26px 字位」）。
 *
 * 转译规则（**仅渲染时派生**：底层存储保留原文含标点，本层**零回写、不改后端**）：
 *   `，` ⇒ `●`（实心圆点）/ `。` ⇒ `○`（空心圆）；标点字符**从字列中剔除**（不占字位），改画在
 *   **它前面紧邻那个汉字**同一格的标点轨内（竖排：字在左、标点在右，格内垂直居中 ⇒ 与所属字**同 y 带**）；
 *   无标点的格 ⇒ 标点轨留白。空格（三字段拼接空格 / 存量数据折出的空格）**一律不占字位**（两轨皆不进）。
 *
 * 栏格宽（**一句话可改**）= 字列轨 26px + 标点列轨 14px + 左右各 1px padding + 1px 栏线 = 43px。
 * 视图层同口径：`wenpu-book.vue` 的 `.book-flow .dual-col` / `.col-punct`（H5 实测 offsetWidth = 43px）。
 */
export const WENPU_DUAL_CHAR_TRACK_WIDTH = 26;
/** 标点列轨宽（= 标点字号 14px；**一句话可改**） */
export const WENPU_DUAL_PUNCT_TRACK_WIDTH = 14;
/** 双轨栏格宽 = 26 + 14 + 2×1px padding + 1px 栏线 = 43px（**一句话可改**） */
export const WENPU_DUAL_COL_WIDTH = WENPU_DUAL_CHAR_TRACK_WIDTH + WENPU_DUAL_PUNCT_TRACK_WIDTH + 3;
/**
 * 双轨竖排页每页栏数（**一句话可改**）：内容宽 878px（纸页 960 − 左右 padding 40×2 − 左右边框 1×2）
 * ÷ 43px ≈ 20.4 ⇒ **20 栏**。原单轨口径 = 878 ÷ 29 = 30.3 ⇒ 30 栏 ⇒ 栏格变宽后每页栏数由 30 降到 20
 * （H5 真机实测：栏格 offsetWidth = 43px、`.book-flow` clientWidth = 878px、满页 20 栏 = 860px ≤ 878px）。
 */
export const WENPU_DUAL_COLS_PER_PAGE = 20;

export interface WenpuCol {
  text: string;
  isName: boolean;
  /**
   * **乌丝栏双轨竖排**（仅 `article` / `postscript` 页的栏）：标点列轨逐位对齐数组 ——
   * 与 `text` 的**码点数组同长且逐位对齐**（`puncts[i]` = `text` 第 i 个字右侧标点轨内的字面，
   * 无标点 = `''` 留白）。**标点字符已从 `text` 剔除**（`，` ⇒ `●` / `。` ⇒ `○`）+ **空格不占位**。
   * 缺省（`undefined`）= 单轨栏（`roster` / `donation` / `genealogy` 一律不设该字段 ⇒ 行为字字不变）。
   */
  puncts?: string[];
}
export interface WenpuRow {
  handle: string;
  grampsId: string;
  name: string;
  isSpouse: boolean;
  cols: WenpuCol[];
}
export interface WenpuPage {
  /** 长度恒 = `WENPU_ROWS_PER_PAGE`，不足补 `null` */
  rows: (WenpuRow | null)[];
  leftLabel: string;
  rightLabel: string;
  /**
   * 页类别 —— **缺省语义 = `'genealogy'`**（既有谱文页；⇒ 既有行为零变化）。
   * 修谱卷的四类内容取 `cover` / `article` / `roster` / `donation`（视图层只对 `cover` 走大图分支）；
   * **后记页 = `'postscript'`**（平台自动生成、读者不可编辑、独立整页置于全书最末）；
   * **封面页 = `'frontcover'`**（W-26 · 全书**第一页**、只占**左半**、只有繁体谱名、
   * **不写任何书口**、**不占叶序**）；
   * **封底页 = `'backcover'`**（Kevin 2026-10-14 · 全书**最后一页**（后记之后）、只占**右半**、
   * 只有一枚暖白印章、**不写任何书口**、**不占叶序**；与封面成对）。
   */
  kind?: 'genealogy' | 'frontcover' | 'backcover' | 'cover' | 'article' | 'roster' | 'donation' | 'postscript';
  /**
   * **封面页（`kind === 'frontcover'`）的谱名**（**已是繁体**、视图层零字形转换）：
   * 只占**左半**深棕 **`#4A3629`**（480×720）内的**米色题签**（150×430 · 2px `#8B7355` 边框）里，
   * 竖排居中 · 36px · 字距 6px · 色 `#222`（**字色一字不改**）。
   */
  frontTitle?: string;
  /** 卷首大图（**仅 `kind === 'cover'`**）：整幅图占满纸页、**保留左右书口** */
  cover?: { url: string; width?: number; height?: number };
  /**
   * **整页整体分列页**（`kind ∈ article|roster|donation|postscript`）的栏序列：
   * 各条文本以空格相接成整页连续文流后按每栏 `WENPU_FLOW_CHARS_PER_COL` 字重分栏（视图层走
   * `.book-flow` 分支、26px）；此时 `rows` 恒为空数组 ⇒ 该页 `.book-row` 结构 **0 个**。
   */
  flowCols?: WenpuCol[];
}
export interface WenpuBook {
  pages: WenpuPage[];
  title: string;
  hall: string;
  rowCount: number;
  /** **真·无人物**空态（该树有谱可见但集合为空）为 true；**读失败另走 `error`** */
  empty: boolean;
  /** **读失败**（网络错误 / 非 2xx / 树不存在 404）：true ⇒ 视图层**必须**走纸外失败提示，不得渲染空态 */
  error?: boolean;
}

/** 堂号占位字面：**逐字**照真源「暂无」⇒ 视为无堂号（`rightLabel = ''`） */
const HALL_PLACEHOLDER = '暂无';

/** 生卒栏「不詳」字面（W-20 · **简体源串**，繁体化由 `pushRecord` 统一做 ⇒ 上屏 `生年不詳` / `卒年不詳`） */
const BIRTH_UNKNOWN = '生年不详';
const DEATH_UNKNOWN = '卒年不详';

/** **ISO 日期形状**（W-20）：`^\d{4}$` / `^\d{4}-\d{2}$` / `^\d{4}-\d{2}-\d{2}$` 三档（严格等长；宽松度同 `lunar.ts`） */
function isIsoDate(s: string): boolean {
  return /^\d{4}$/.test(s) || /^\d{4}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 正整数 → 汉字序（1–9999；用于行第 / 子女数 / 页码；超范围退回阿拉伯数字，不猜） */
function chineseNum(n: number): string {
  const v = Math.floor(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  if (v < 10) return DIGITS[v];
  if (v < 20) return '十' + (v % 10 ? DIGITS[v % 10] : '');
  if (v < 100) return DIGITS[Math.floor(v / 10)] + '十' + (v % 10 ? DIGITS[v % 10] : '');
  if (v < 1000) {
    const r = v % 100;
    return DIGITS[Math.floor(v / 100)] + '百' + (r === 0 ? '' : r < 10 ? '零' + DIGITS[r] : chineseNum(r));
  }
  if (v < 10000) {
    const r = v % 1000;
    return DIGITS[Math.floor(v / 1000)] + '千' + (r === 0 ? '' : r < 100 ? '零' + chineseNum(r) : chineseNum(r));
  }
  return String(v);
}

/** **大写数字字形**（修譜序次口径；**繁体**：2 = `貳`、3 = `參` —— 不是「贰 / 叁」；**一句话可改**） */
const UPPER_DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
/** 大写数字位名（万位以内：仟 / 佰 / 拾；个位位名为空串） */
const UPPER_UNITS = ['', '拾', '佰', '仟'];

/**
 * 正整数 → **繁体大写数字**（`{修譜序次}` 专用；与 `chineseNum()`（小写 一/二/三）**两套并存、互不替换**）：
 *   1–9 ⇒ 壹貳參肆伍陸柒捌玖；10 ⇒ 壹拾；11 ⇒ 壹拾壹；100 ⇒ 壹佰；101 ⇒ 壹佰零壹；110 ⇒ 壹佰壹拾；
 *   1000 ⇒ 壹仟；1001 ⇒ 壹仟零壹（`拾/佰/仟` 位 + **缺位补一个 `零`**、末尾缺位不写）。
 * **兜底**：超 1–9999 ⇒ 退回阿拉伯数字串；非有限数 ⇒ `''` —— **与后端 `bigNumOf()` 逐字同口径**
 * （同一序次 ⇒ 同一字形；前后端不得各写一套）。
 */
function chineseUpperNum(n: number): string {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return '';
  if (v < 1 || v > 9999) return String(v); // 兜底：退回阿拉伯数字串（**不静默丢内容**；同后端 `bigNumOf()`）
  const s = String(v);
  let out = '';
  let pendingZero = false;
  for (let i = 0; i < s.length; i += 1) {
    const d = Number(s[i]);
    const unit = UPPER_UNITS[s.length - 1 - i];
    if (d === 0) {
      pendingZero = true;
      continue;
    }
    if (pendingZero && out) out += UPPER_DIGITS[0]; // 缺位补**一个** `零`
    pendingZero = false;
    out += UPPER_DIGITS[d] + unit;
  }
  return out;
}

/** 子女标签：同性别内**各自**计数（长子 / 次子 / 三子…；长女 / 次女 / 三女…） */
function childLabel(sex: '子' | '女', order: number): string {
  if (order === 1) return '长' + sex;
  if (order === 2) return '次' + sex;
  return chineseNum(order) + sex;
}

/** 名的取法：`surname` 非空且 `name.startsWith(surname)` ⇒ 去该前缀，否则取全串（**禁止**按固定宽度切字） */
function givenNameOf(name: string, surname: string): string {
  return surname && name.startsWith(surname) ? name.slice(surname.length) : name;
}

/** `gramps_id` 升序（同号 `handle` 升序兜底）—— 孤立补尾与始祖回退链的 ③ / ④ 共用同一口径 */
function compareByGrampsId(a: PersonSummary, b: PersonSummary): number {
  const x = a.gramps_id || '';
  const y = b.gramps_id || '';
  if (x !== y) return x < y ? -1 : 1;
  const hx = a.handle || '';
  const hy = b.handle || '';
  return hx === hy ? 0 : hx < hy ? -1 : 1;
}

/** **被某家族 `child_handles` 收录**的 handle 集合 —— 前端可见面没有 `parent_family` 字段，
 *  该集合即「有父家族」的等价判据（W-17 ③/④ 与 W-19 女儿判据共用） */
function childHandlesSet(families: FamilySummary[]): Set<string> {
  const asChild = new Set<string>();
  for (const fam of families) for (const ch of fam.child_handles) asChild.add(ch);
  return asChild;
}

/** **初步本姓**（W-17③ 的判据 / W-18 取值链的**前两级**）：tree-meta `surname` → `surname_char` →
 *  `genealogy_name` 首字 → `display_title` 首字；**不含**「推断出的始祖 `surname`」那一级 ⇒ **与始祖推断互不依赖、不成环** */
function preliminaryRootSurname(entry: TreeEntry | undefined): string {
  const fromSurname = (entry?.surname || '').trim();
  if (fromSurname) return fromSurname;
  const fromChar = (entry?.surname_char || '').trim();
  if (fromChar) return fromChar;
  const genealogy = (entry?.genealogy_name || '').trim();
  if (genealogy) return Array.from(genealogy)[0];
  const title = (entry?.display_title || '').trim();
  return title ? Array.from(title)[0] : '';
}

/** **起点（始祖）回退链**（W-17）：① tree-meta `founder_handle`（须在本集合内）→ ② tree-meta
 *  `founder_gramps_id` 树内反查 → ③ **初步本姓且无父家族**（多个取 `gramps_id` 升序最小、`handle` 兜底）→
 *  ④ **无父家族**（多个同样取最小）→ ⑤ 皆无 ⇒ 空串（**无起点**）。 */
export function founderHandleOf(
  entry: TreeEntry | undefined,
  people: PersonSummary[],
  families: FamilySummary[] = [],
): string {
  const fromMeta = (entry?.founder_handle || '').trim();
  if (fromMeta && people.some((p) => p.handle === fromMeta)) return fromMeta;
  const founderGid = (entry?.founder_gramps_id || '').trim();
  if (founderGid) {
    const hit = people.find((p) => !!p.gramps_id && p.gramps_id === founderGid);
    if (hit) return hit.handle;
  }
  if (!families.length) return '';
  const asChild = childHandlesSet(families);
  const parentless = people.filter((p) => !asChild.has(p.handle));
  const surname = preliminaryRootSurname(entry);
  if (surname) {
    const sameSurname = parentless.filter((p) => (p.surname || '').trim() === surname);
    if (sameSurname.length) return [...sameSurname].sort(compareByGrampsId)[0].handle;
  }
  return parentless.length ? [...parentless].sort(compareByGrampsId)[0].handle : '';
}

/** **本树姓氏**取值链（W-18）：① tree-meta `surname` → ② tree-meta `surname_char` →
 *  ③ **推断出的始祖节点**（`founderHandleOf`）的 `surname` → ④ `genealogy_name` 首字 →
 *  ⑤ `display_title` 首字；**皆取不到 ⇒ 空串**（⇒ 姓名一律原样输出）。
 *  `families` 缺省为空数组 ⇒ ③/④ 无法判定「无父家族」⇒ 退回 ①/②/⑤ 那一支（既有调用方零改动）。 */
export function rootSurnameOf(
  entry: TreeEntry | undefined,
  people: PersonSummary[],
  families: FamilySummary[] = [],
): string {
  const fromMeta = (entry?.surname || '').trim();
  if (fromMeta) return fromMeta;
  const fromChar = (entry?.surname_char || '').trim();
  if (fromChar) return fromChar;
  const founderHandle = founderHandleOf(entry, people, families);
  const fromFounder = (
    founderHandle ? people.find((p) => p.handle === founderHandle)?.surname || '' : ''
  ).trim();
  if (fromFounder) return fromFounder;
  const genealogy = (entry?.genealogy_name || '').trim();
  if (genealogy) return Array.from(genealogy)[0];
  const title = (entry?.display_title || '').trim();
  return title ? Array.from(title)[0] : '';
}

/**
 * **姓名书写口径**（Kevin 已当面裁定 · 2026-09-26）—— 单一纯函数，书页内**姓名栏与「子女」栏共用**。
 *
 * 出口 = **简体**串（繁体化由 `pushRecord` 统一做；`氏` 简繁同形）：
 *   R1 本姓（`surname` === `rootSurname`）⇒ **只写名**（「季清昆」→「清昆」）
 *   R2 外姓（`surname` 非空且 ≠ `rootSurname`）⇒ `姓` + `氏` + 空格 + 名（「顾景月」→「顾氏 景月」）
 *   R3 姓氏字段为空（`surname === ''`）⇒ `氏` + 空格 + 名（**无前导空格**；「三婶」→「氏 三婶」）
 *   `rootSurname` 为空（三链皆取不到）⇒ **原样输出**（不套规则）
 */
export function displayName(p: PersonSummary, rootSurname: string): string {
  const name = p.name || '';
  if (!name || !rootSurname) return name;
  const surname = p.surname || '';
  const given = givenNameOf(name, surname);
  if (!surname) return '氏 ' + given;
  if (surname === rootSurname) return given;
  return surname + '氏 ' + given;
}

/** 一条数据 → 栏（超 10 字**只在本条内部**续栏；空条跳过）；**出口一律繁体** */
function pushRecord(cols: WenpuCol[], text: string, isName = false): void {
  const chars = Array.from(text || '');
  if (!chars.length) return;
  for (let i = 0; i < chars.length; i += WENPU_CHARS_PER_COL) {
    cols.push({ text: toTraditional(chars.slice(i, i + WENPU_CHARS_PER_COL).join('')), isName });
  }
}

/** 生卒日期 → 农历文本（空 / 非法 → 空串 ⇒ 该条整条跳过） */
function lunarOf(date: string | undefined): string {
  const s = (date || '').trim();
  if (!s) return '';
  return solarToLunarText(s);
}

function hallOf(entry: TreeEntry | undefined): string {
  const raw = (entry?.hall_name || '').trim();
  if (!raw || raw === HALL_PLACEHOLDER) return '';
  return toTraditional(raw);
}

function titleOf(entry: TreeEntry | undefined): string {
  const raw = (entry?.genealogy_name || '').trim() || (entry?.display_title || '').trim();
  return raw ? toTraditional(raw) : '';
}

/** 空态（**真·无人物**）：pages 空、rowCount 0、empty true、**error 不为 true** */
function emptyBook(title: string, hall: string): WenpuBook {
  return { pages: [], title, hall, rowCount: 0, empty: true };
}

/** **读失败**（网络错误 / 非 2xx / 树不存在 404）：empty false、pages 空、rowCount 0、error true
 *  —— 视图层据此走**纸外**失败提示（与「真·无人物」不得渲染同一文案） */
function errorBook(title: string, hall: string): WenpuBook {
  return { pages: [], title, hall, rowCount: 0, empty: false, error: true };
}

// ---- 修谱卷（卷首 + 三类内容页 · **整页整体分列**）→ 页 + 后记页 ----------------------------------
//
// 口径（Kevin 2026-10-12 拍定「整页是个整体、整体上分列」；字段名逐字对齐
// `cloudfunctions/compat-api/lib/revision.js` 的 `getRevisionView()`）：
// - **内容 kind → 页面 kind**：`cover` ⇒ `'cover'` 页、`article` ⇒ `'article'` 页、
//   `helpers`（内容）⇒ `'roster'` 页、`donations`（内容）⇒ `'donation'` 页；**后记页 = `'postscript'`**。
// - **排版（第一部分 / 后记）**：**不再整页四行** —— 去 4 行结构与行分隔线，各条文本以空格相接成
//   **整页连续文流**，按每栏 `WENPU_FLOW_CHARS_PER_COL`（26）字 × 每页 `WENPU_FLOW_COLS_PER_PAGE`（30）
//   栏重分栏分页，纵向列从右向左连续排满整页；视图层对 `article|roster|donation|postscript` 走
//   `.book-flow` 分支（26px / name-col 30px）。
// - **昭範正圖（`cover`）**：仍**独立整页大图、不入列**（整体分列重构不改变它）。
// - **人物名录页（缺省 `genealogy`）一字不动**：17px / 每页 4 行 / 每行 ≤30 栏 / 每栏恰 10 字 /
//   name-col 20px / 行间 1px #111 上边框全保留（本节不产 genealogy 页）。
// - **繁体例外**：修谱卷内容**存储即繁体** ⇒ 此处**不经 `toTraditional`**（避免 s2t 表非幂等 quirk
//   造成字形漂移）；后记文案按繁体逐字给出，**仅对其最终文本过一次** `toTraditional`（单次；补齐
//   `lunar.ts` 月名简体字 `闰`/`腊`，见 `buildPostscriptPages` ⑤）；书口文案仍走 `toTraditional`（`titleOf` / `hallOf`）。
// - **同一套连号**：修谱页插在谱文页**之前**、后记页**置于全书最末**，页码由 `finishBook()` 按
//   **全书页序**统一分配（第 k 页左 `2k+1` / 右 `2k+2`，汉字序）⇒ 全书连号、**不重起编号**。
// - **历次全部并列**：`revision.revisions` 按 `seq` 升序累加（第 1 次在前），不分组、不折叠；
//   每个（次 × 类）**仍另起一页**（页级结构不变，变的只是页内排版）。
// - **缺项整条跳过**：空条不进文流（该类全部为空 ⇒ 不产页）。

/** 文本 → 栏（每栏 ≤ `per` 字；**不做简繁转换** —— 调用方决定是否已繁） */
function chunkCols(text: string, per: number): WenpuCol[] {
  const cols: WenpuCol[] = [];
  const chars = Array.from(text || '');
  for (let i = 0; i < chars.length; i += per) {
    cols.push({ text: chars.slice(i, i + per).join(''), isName: false });
  }
  return cols;
}

/** 各条文本 → **整页连续文流**（条间以一个空格相接；空条跳过） */
function flowTextOf(texts: string[]): string {
  return texts.map((t) => (t || '').trim()).filter(Boolean).join(' ');
}

/** 整页连续文流 → 分列栏（每栏 ≤ `WENPU_FLOW_CHARS_PER_COL` 字） */
function flowColsOf(texts: string[]): WenpuCol[] {
  return chunkCols(flowTextOf(texts), WENPU_FLOW_CHARS_PER_COL);
}

// ---- 乌丝栏双轨竖排（**仅 `article`（族務紀文）/ `postscript`（后记）**）------------------------------------
// 转译规则（**仅渲染时派生**：底层存储保留原文含标点，本层零回写、不改后端 / 存储口径）：
//   `，` ⇒ `●`（实心圆点）、`。` ⇒ `○`（空心圆）；**标点字符从字列剔除**（不占字位），
//   改挂到**它前面紧邻那个汉字**的标点轨（竖排：字在左、标点在右，格内垂直居中 ⇒ 与所属字同 y 带）。
//   空格（三字段拼接空格 / 存量旧数据折出的空格）**两轨皆不进**（不占字位）。

/** 双轨标点映射（**仅渲染时**）：`，` ⇒ `●`（实心圆点）/ `。` ⇒ `○`（空心圆）—— 未列出的字符一律原样进字列 */
const DUAL_PUNCT_MAP: Record<string, string> = { '，': '●', '。': '○' };

/** 双轨「字 + 其标点」对：`char` 进**字列轨**、`punct` 进**标点列轨**（`''` = 该格标点轨留白） */
interface DualChar {
  char: string;
  punct: string;
}

/**
 * 原文（含标点）→ 双轨字列 / 标点列对序列（**仅渲染派生、零回写**）：
 * - 空格（`\s`：三字段**拼接空格** / 存量旧数据折出的空格 / 制表符 / 换行 / 全角空格）**一律跳过**；
 * - `，` / `。` **从字列剔除**，挂到**前面紧邻那个汉字**的标点轨（同一格）；
 *   前导标点（其前无汉字可挂）与同一格重复标点 ⇒ **丢弃**（无宿主格可画，**一句话可改**）；
 * - 其余字符（含 `、` 等**未在映射表内**的标点）**原样进字列**（只映射 `，`/`。`，不自造第三套字形）。
 */
function dualCharsOf(text: string): DualChar[] {
  const out: DualChar[] = [];
  for (const cp of Array.from(text || '')) {
    if (/\s/.test(cp)) continue;
    const mark = DUAL_PUNCT_MAP[cp];
    if (mark !== undefined) {
      const host = out.length ? out[out.length - 1] : null;
      if (host && !host.punct) host.punct = mark;
      continue;
    }
    out.push({ char: cp, punct: '' });
  }
  return out;
}

/** 双轨字列 / 标点列对 → 栏（每栏 ≤ `per` 字；`puncts` 与 `text` 的**码点数组同长逐位对齐**） */
function dualColsOf(chars: DualChar[], per: number): WenpuCol[] {
  const cols: WenpuCol[] = [];
  for (let i = 0; i < chars.length; i += per) {
    const slice = chars.slice(i, i + per);
    cols.push({
      text: slice.map((c) => c.char).join(''),
      isName: false,
      puncts: slice.map((c) => c.punct),
    });
  }
  return cols;
}

/** 各条文本 → **双轨竖排分列栏**（条间以空格相接 —— 空格不占位 ⇒ 实际等价于各条字符直接相接） */
function dualFlowColsOf(texts: string[]): WenpuCol[] {
  return dualColsOf(dualCharsOf(flowTextOf(texts)), WENPU_FLOW_CHARS_PER_COL);
}

/**
 * **双轨竖排页**（`article` / `postscript` 两页专用；每页 `WENPU_DUAL_COLS_PER_PAGE` 栏）——
 * 视图层凭 `col.puncts` 存在与否走双轨分支（名录 / 人物的单轨栏不设该字段 ⇒ 零变化）。
 */
function dualFlowPagesOf(texts: string[], kind: 'article' | 'postscript'): WenpuPage[] {
  return flowPagesOf(dualFlowColsOf(texts), kind, WENPU_DUAL_COLS_PER_PAGE);
}

/** 分列栏 → 页（每页 `colsPerPage` 栏；`rows` 恒空数组 ⇒ 该页 `.book-row` 结构 0 个）
 *  缺省 = `WENPU_FLOW_COLS_PER_PAGE`（30，单轨口径 ⇒ `roster` / `donation` 字字不变）；
 *  `article` / `postscript` 传 `WENPU_DUAL_COLS_PER_PAGE`（20，双轨栏格 43px 口径）。 */
function flowPagesOf(
  cols: WenpuCol[],
  kind: 'article' | 'roster' | 'donation' | 'postscript',
  colsPerPage: number = WENPU_FLOW_COLS_PER_PAGE,
): WenpuPage[] {
  const pages: WenpuPage[] = [];
  for (let i = 0; i < cols.length; i += colsPerPage) {
    pages.push({
      rows: [],
      flowCols: cols.slice(i, i + colsPerPage),
      leftLabel: '',
      rightLabel: '',
      kind,
    });
  }
  return pages;
}

/**
 * 后记：日期（公历 ISO，含 `YYYY-MM-DDTHH:mm:ss…Z` 带时刻形态）→ **农历「年 + 月」位**：
 * 完整日期 / 只有年月 ⇒ 如「丙午年七月」、闰月「丙午年闰七月」；**只有年 ⇒ 仅到年**，如「乙酉年」
 * （值**自带「年」字**，故模板写 `肇創於{肇創年份}`、**不再补「之年」**；复用 `lunar.ts`，跨春节前属上一年）。
 * 只有年月 ⇒ 取该月 15 日所在农历月（沿 W-7 既有口径）；
 * 非 ISO / 超 1–2100 / 表外 ⇒ **空串**（调用方按「年位用 `不詳`」兜底 —— **一句话可改**；不印原字面）。
 */
function lunarYearTextOf(iso: string | undefined): string {
  const s = (iso || '').trim();
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?(?:[T\s].*)?$/.exec(s);
  if (!m) return '';
  const y = Number(m[1]);
  if (y < LUNAR_FIRST_YEAR || y > LUNAR_LAST_YEAR) return '';
  const mo = m[2] ? Number(m[2]) : 0;
  const d = m[3] ? Number(m[3]) : 0;
  if (mo && (mo < 1 || mo > 12)) return '';
  if (!mo) return ganZhiOf(y) + '年';
  const f = solarToLunarFields(y + '-' + mo + '-' + (d >= 1 && d <= 31 ? d : 15));
  return f ? ganZhiOf(f.year) + '年' + lunarMonthName(f.month, f.isLeap) : '';
}

/**
 * 后端并行批：`GET /revisions` 顶层**新增** `postscript`（**只增不改**；`RevisionView` 未登该键 ⇒ 就地窄化，
 * 不碰 `revision.ts` / `types.ts`）。**缺失 / 字段缺失一律走兜底**（见 `buildPostscriptPages`）。
 *
 * ⚠️ 字段名由后端契约定死，**不得自造**：`created_by` / `created_by_name` / `masters[{seq,name}]`。
 */
interface PostscriptMaster {
  seq?: number;
  name?: string;
}
interface PostscriptView {
  created_by?: string;
  /** 始纂人名（**本批唯一使用的新字段**；缺失 / 空串 ⇒ 省「由{C1}」半句） */
  created_by_name?: string;
  /** 各轮主司（按该轮 `seq` 匹配；缺该轮 / 无名 ⇒ 省「，主司{M}」半句） */
  masters?: PostscriptMaster[];
}

/**
 * **模板变量名（六个）** —— 模板里逐字写作 `{变量}`；模板本体**不做 s2t 转换**（后台直接输繁体；
 * 月名等少数简体字由渲染末尾**单次** `toTraditional` 补齐）。
 * - `{肇創年份}` = 创建农历干支年（tree-meta `created_at`；解析不出 ⇒ `不詳`）——**任意位置**；
 * - `{肇創人}`   = `postscript.created_by_name`（始纂人；缺失 / 空串 ⇒ 省片段）——**任意位置**；
 * - `{當前年份}` = 最后一轮的农历年（无修订 ⇒ 创建年）——**任意位置**；
 * - `{修譜序次}` / `{修譜年份}` / `{主司}` = **`{{{…}}}` 块内专用（随轮）**：该轮繁体大写序次 / 该轮年位 /
 *   该轮主司；写在块**外**由**管理面**判 400（本层只管渲染，不自造校验文案）。
 */
const WENPU_TPL_VARS: readonly string[] = [
  '肇創年份', '肇創人', '當前年份', '修譜序次', '修譜年份', '主司',
];

/** 占位符 token（**由上表生成** = 单一真源；其它 `{…}` 一律当字面保留 —— 不自造、不清空） */
const WENPU_TPL_TOKEN = new RegExp('\\{(' + WENPU_TPL_VARS.join('|') + ')\\}', 'g');

/**
 * **逐轮重复块**符号 `{{{ … }}}`（**恰 0 或 1 个**）：块体按轮（`seq` 升序）逐轮渲染后**拼接**，
 * 再整体替换掉 `{{{…}}}`；**缺失 / 无修订 ⇒ 空串**（轮段不展开）。
 * 「恰 0 或 1 个 · 须闭合 · 不得嵌套 · 块专用变量不得出块」由**管理面**判 400；
 * 渲染层**容错**（违规模板视作「无块」⇒ 原样上屏，**不抛、不空白**）。
 */
const WENPU_BLOCK_OPEN = '{{{';
const WENPU_BLOCK_CLOSE = '}}}';

/**
 * 后记文案**默认模板** —— **与后端 `DEFAULT_POSTSCRIPT_TEMPLATE` 逐字一致；双处，改一处须同步另一处**。
 * 仅作**兜底 / 后台「恢复默认」填回**用：读谱主路径一律用后端 `wenpu_config.postscript_template`。
 * 变量：`{肇創年份}` `{肇創人}` `{當前年份}`（任意位置）+ `{{{…}}}` 块内 `{修譜序次}` `{修譜年份}` `{主司}`（随轮）。
 */
export const DEFAULT_POSTSCRIPT_TEMPLATE =
  '本族家譜，肇創於{肇創年份}，由{肇創人}始纂。{{{其後{修譜序次}經修輯於{修譜年份}，主司{主司}。}}}今為最新釐正版，是為{當前年份}訂本。願後之族人、續而增修之。';

/** 空值标记（渲染期临时插在文本里；**输出前一律剥除** —— 与后端 `applyVars()` 同口径） */
const WENPU_EMPTY_MARK = '\u0000E';
/** 非空值标记（同上） */
const WENPU_NONEMPTY_MARK = '\u0000N';

/**
 * 占位符 → **带标记值**（空值打空标记、非空值打非空标记；**未登记 / 未知的 `{…}` 原样保留**）。
 * 标记随文本一路带到最后的「缺项省片段」⇒ **块内块外同规则、只扫一遍**（与后端逐字同口径）。
 */
function markWenpuVars(raw: string, values: Record<string, string>): string {
  return raw.replace(WENPU_TPL_TOKEN, (token, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return token;
    const v = String(values[name] ?? '');
    return v === '' ? WENPU_EMPTY_MARK : WENPU_NONEMPTY_MARK + v;
  });
}

/** 剥除标记（**输出前**） */
function stripWenpuMarks(s: string): string {
  return s.split(WENPU_EMPTY_MARK).join('').split(WENPU_NONEMPTY_MARK).join('');
}

/** `sub` 在 `t` 中的**全部**出现下标（步进 1、含重叠 —— 用于枚举候选块边界） */
function wenpuPositionsOf(t: string, sub: string): number[] {
  const out: number[] = [];
  let i = 0;
  for (;;) {
    const j = t.indexOf(sub, i);
    if (j < 0) break;
    out.push(j);
    i = j + 1;
  }
  return out;
}

/** 花括号是否**完全配对**（`{` 与 `}` 数量相等且无提前闭合 —— 占位符 `{name}` 天然配对）。**纯函数** */
function wenpuBracesBalanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * 切出循环块（**纯函数** · 与后端 `splitLoopBlock()` 同口径）：
 * - 0 个块 ⇒ `hasBlock:false`；恰 1 个块 ⇒ 块体 + 下标（`close` 指向 `}}}` 首字符）；
 * - 收尾 `}}}` 取**第一个能使块体花括号完全配对**者 —— 块体形如 `…{主司}` 紧贴块尾时不会误判；
 * - **≥2 个块 / 单边未闭合 / 嵌套**（管理面已判 400）⇒ **容错**：视作「无块」（原样上屏，不抛）。
 */
function splitWenpuLoopBlock(
  template: string,
): { hasBlock: boolean; body: string; open: number; close: number } {
  const none = { hasBlock: false, body: '', open: -1, close: -1 };
  const opens = wenpuPositionsOf(template, WENPU_BLOCK_OPEN);
  const closes = wenpuPositionsOf(template, WENPU_BLOCK_CLOSE);
  if (!opens.length && !closes.length) return none;
  if (opens.length !== 1) return none; // ≥2 个块 / 有 `}}}` 无 `{{{`（未闭合）⇒ 容错
  const open = opens[0];
  let close = -1;
  for (const c of closes) {
    if (c <= open) continue;
    if (wenpuBracesBalanced(template.slice(open + WENPU_BLOCK_OPEN.length, c))) {
      close = c;
      break;
    }
  }
  if (close < 0) return none; // 未闭合 ⇒ 容错
  const body = template.slice(open + WENPU_BLOCK_OPEN.length, close);
  if (body.includes(WENPU_BLOCK_OPEN) || body.includes(WENPU_BLOCK_CLOSE)) return none; // 嵌套 ⇒ 容错
  return { hasBlock: true, body, open, close };
}

/** 句读符（切句；与后端 `SENTENCE_DELIMS` 同体例）—— 句读符**留在句内** */
const WENPU_SENTENCE_DELIMS = '。！？';
/** 片段分隔符（句内切片；**分隔符归其后的片段** ⇒ 即该片段的「前置分隔符」） */
const WENPU_FRAGMENT_DELIMS = '，、；';

/**
 * 清理一个「句」（尾句读符已剥离）：按 `，、；` 切片段，**占位符全空**的片段**连其前置分隔符一起删**；
 * 不含占位符的片段**恒保留**；**跨句互不影响**（只在本句内删，句读符 / 相邻句一概不动）。
 * （与后端 `cleanSentence()` 同口径）
 */
function cleanWenpuSentence(sentence: string): string {
  let body = sentence;
  let tail = '';
  const last = sentence.slice(-1);
  if (WENPU_SENTENCE_DELIMS.includes(last)) {
    tail = last;
    body = sentence.slice(0, -1);
  }
  const frags: Array<{ delim: string; content: string }> = [];
  let cur = '';
  let delim = '';
  for (const ch of body) {
    if (WENPU_FRAGMENT_DELIMS.includes(ch)) {
      frags.push({ delim, content: cur });
      cur = '';
      delim = ch;
    } else {
      cur += ch;
    }
  }
  frags.push({ delim, content: cur });

  let kept = '';
  for (const f of frags) {
    const hasEmpty = f.content.includes(WENPU_EMPTY_MARK);
    const hasNonEmpty = f.content.includes(WENPU_NONEMPTY_MARK);
    // 片段含占位符且其占位符**全为空** ⇒ 连前置分隔符一起删（不含占位符 ⇒ 恒保留）
    if ((hasEmpty || hasNonEmpty) && !hasNonEmpty) continue;
    kept += f.delim + stripWenpuMarks(f.content);
  }
  return kept + tail;
}

/**
 * **缺项省片段**（入参 = 已把占位符替换成「带标记值」的文本；出参 = 最终正文，**标记已剥除**）：
 * 每**句**（按 `。！？` 切）内按 `，、；` 切片段 ⇒ 规则见 `cleanWenpuSentence()`；
 * 年位占位符**永不空**（缺 / 非 ISO ⇒ `不詳`）⇒ 年位片段恒不省；**块内块外同规则、只扫这一遍**。
 */
function pruneWenpuEmptyFragments(marked: string): string {
  const out: string[] = [];
  let sentence = '';
  for (const ch of marked) {
    sentence += ch;
    if (WENPU_SENTENCE_DELIMS.includes(ch)) {
      out.push(cleanWenpuSentence(sentence));
      sentence = '';
    }
  }
  if (sentence !== '') out.push(cleanWenpuSentence(sentence));
  return out.join('');
}

/**
 * 后记页（`kind = 'postscript'`；**纯函数** · 平台自动生成、读者不可编辑 · **独立整页置于全书最末**，
 * 由 `buildWenpuBook()` 在全书页序末尾追加、仅当全书已有页面时）。
 *
 * 文案（繁体 · 纸内 · **Kevin 2026-10-12 定稿**；标点一字不改）：模板 / 后台变量**逐字上屏**，
 * 仅**最终整段过一次** `toTraditional`（单次；补齐 `lunar.ts` 月名简体字 `闰`/`腊`，见函数内 ⑤）。
 *   多轮（**每轮各出一句**「其後…主司…」；Kevin 例文只给 1 轮 ⇒ 逐轮句 **一句话可改**）：
 *     `本族家譜，肇創於{Y1}，由{C1}始纂。其後{N}經修輯於{Y}，主司{M}。今為最新釐正版，是為{Ylast}訂本。願後之族人、續而增修之。`
 *   无修订（省「其後…主司…」句）：
 *     `本族家譜，肇創於{Y1}，由{C1}始纂。今為最新釐正版，是為{Y1}訂本。願後之族人、續而增修之。`
 *
 * - `{N}` = 该轮 `seq` 的**汉字序**（一 / 二 / 三…，与书口 / 行第同一体例）；各轮按 `seq` 升序。
 * - `{C1}` = `postscript.created_by_name`（始纂人名）；`{M}` = `postscript.masters[]` 里 `seq` 匹配该轮的 `name`（主司）。
 * - `{Y1}` = 创建农历**年月**位（tree-meta `created_at`；值如「丙午年七月」/「乙酉年」）；`{Y}` = 该轮
 *   `effective_at` 优先、缺则 `started_at` 的同形年月位；`{Ylast}` = 最后一轮者（无修订 ⇒ 创建年位）。
 * - **兜底（`postscript` 缺失 / 字段缺失 / 请求失败 ⇒ 不改前两部分、不报错；每条均「一句话可改」）**：
 *   ① 名称空串 ⇒ 省「由{C1}」半句（⇒ `肇創於{Y1}。`）/ 省「，主司{M}」半句（⇒ `其後{N}經修輯於{Y}。`）；
 *   ② `created_at` 非 ISO / 缺失 ⇒ 年位用 `不詳`（**仍保持句形完整**；各轮年位同理）。
 * - revisions 读取失败或空 ⇒ 按「无修订」态渲染、不报错、不影响前两部分。
 *
 * **模板驱动（本批）** —— 文案真源 = **后端** `wenpu_config.postscript_template`（**单一模板**；
 * 变量名见 `WENPU_TPL_VARS`；本层只兜底）。渲染四步（**与后端 `renderPostscript()` 逐字同口径** ——
 * 同一模板、同一域数据 ⇒ **同一正文**）：
 *   ① 循环块体（`{{{…}}}`，恰 0 或 1 个）按轮（`seq` 升序）**逐轮渲染**（块专用三变量随轮绑定；
 *      全局变量块内亦可用、值恒为全局）⇒ **拼接**（**无修订 / 无块 ⇒ 空串**）；
 *   ② 用拼接结果**替换** `{{{…}}}`（`splitWenpuLoopBlock()`）；
 *   ③ 块外**全局变量替换**；④ **缺项省片段**（`pruneWenpuEmptyFragments()`：空占位符所在片段连前置分隔符
 *      一并删）—— ③④ 由**标记**驱动、**块内块外同规则 ⇒ 只扫一遍**（`markWenpuVars()` ⇒ 标记 ⇒ 剥除）；
 *   ⑤ 模板**逐字用**（后台直接输繁体）；`{修譜序次}` = 该轮**繁体大写数字**（壹貳參…）。
 *   （渲染末尾对**最终整段**过一次 `toTraditional` —— 本层唯一 s2t 应用点，见函数体 ⑤。）
 * - `postscriptTemplate` **缺省（undefined）⇒ 用兜底常量 `DEFAULT_POSTSCRIPT_TEMPLATE`**
 *   （= 与后端默认逐字一致；**不报错、不空白**）。
 *
 * @param entry 树 tree-meta 条目（`created_at` ⇒ `{肇創年份}`）
 * @param revision 修谱视图（`revisions` ⇒ 逐轮；`postscript` ⇒ 始纂人 / 各轮主司）
 * @param postscriptTemplate 后端 `wenpu_config.postscript_template`（缺省 ⇒ 兜底常量）
 */
export function buildPostscriptPages(
  entry: TreeEntry | undefined,
  revision: RevisionView | null | undefined,
  postscriptTemplate?: string,
): WenpuPage[] {
  /** 后端 `postscript`（**只增不改**；缺失 ⇒ 全兜底，不改前两部分、不报错） */
  const postscript = (revision as (RevisionView & { postscript?: PostscriptView }) | null | undefined)
    ?.postscript;

  const rounds = [...(revision?.revisions || [])].filter(Boolean);
  rounds.sort((a, b) => (a.seq || 0) - (b.seq || 0));

  /** 年位兜底字面：`created_at` 非 ISO / 缺失 ⇒ `不詳`（**仍保持句形完整**；**一句话可改**） */
  const UNKNOWN_YEAR = '不詳';
  const y1 = lunarYearTextOf(entry?.created_at) || UNKNOWN_YEAR;
  /** 各轮年 = `effective_at` 优先、缺则 `started_at` 的农历干支年；皆解析不出 ⇒ `不詳`（**一句话可改**） */
  const roundYears = rounds.map((r) => {
    const rec = r as RevisionRecord & { started_at?: string };
    return lunarYearTextOf(rec.effective_at) || lunarYearTextOf(rec.started_at) || UNKNOWN_YEAR;
  });
  /** 最终版本年 = 最后一轮的农历年；无修订 ⇒ 创建年 */
  const yLast = roundYears.length ? roundYears[roundYears.length - 1] : y1;

  /** 始纂人名 = `postscript.created_by_name`；缺失 / 空串 ⇒ 省「由{C1}」半句（**一句话可改**） */
  const founder = (postscript?.created_by_name || '').trim();
  /** 主司名 = `postscript.masters[]` 里 `seq` 匹配该轮者；缺该轮 / 空串 ⇒ 省「，主司{M}」半句（**一句话可改**） */
  const masterOf = (seq: number): string => {
    const hit = (postscript?.masters || []).find((m) => (m?.seq || 0) === seq);
    return (hit?.name || '').trim();
  };

  // 后记文案同样走**乌丝栏双轨竖排**（`，`⇒`●` / `。`⇒`○`、空格不占位；每页 20 栏）
  //
  /** 模板：**后端下发优先**；**缺省（undefined）⇒ 兜底常量**（与后端 `DEFAULT_POSTSCRIPT_TEMPLATE` 逐字一致） */
  const template = postscriptTemplate === undefined ? DEFAULT_POSTSCRIPT_TEMPLATE : postscriptTemplate;
  /** 全局变量（**块外**填；块内亦可用、值恒为全局）：年位恒非空（缺 / 非 ISO ⇒ `不詳`） */
  const mainValues: Record<string, string> = {
    '肇創年份': y1,
    '肇創人': founder,
    '當前年份': yLast,
  };
  const block = splitWenpuLoopBlock(template);
  /** ① 循环块体：`seq` 升序**逐轮**渲染（块专用三变量随轮绑定）⇒ 拼接（**无修订 / 无块 ⇒ 空串**） */
  const expanded = block.hasBlock
    ? rounds
        .map((r, i) =>
          markWenpuVars(block.body, {
            ...mainValues,
            '修譜序次': chineseUpperNum(r.seq || 0),
            '修譜年份': roundYears[i],
            '主司': masterOf(r.seq || 0),
          }),
        )
        .join('')
    : '';
  /** ② 替换 `{{{…}}}` */
  const assembled = block.hasBlock
    ? template.slice(0, block.open) + expanded + template.slice(block.close + WENPU_BLOCK_CLOSE.length)
    : template;
  /** ③ 块外全局变量替换 + ④ 缺项省片段（标记驱动、块内块外同规则 ⇒ 只扫一遍） */
  const pruned = pruneWenpuEmptyFragments(markWenpuVars(assembled, mainValues));
  /**
   * ⑤ **整段过 `toTraditional`（本函数仅此一次）** —— 模板 / 后台变量已按繁体给出（逐字上屏），
   * 但**月名字面取自 `lunar.ts` 的 `MONTHS`（简体：`闰` / `腊`）** ⇒ 后记会印出「庚子年闰四月」
   * 「腊月」，是纸内**唯一的简体字**（违背「纸内一律繁体」）；此处对**最终文本**统一转一次补齐。
   * ⚠️ **单次应用、不得重复套用**：本仓 s2t 表对个别字**非幂等**（如 `苎→苧→薴`）。
   * `，` / `。`（双轨切分依据）与干支字在 s2t 下不变 ⇒ **不改变双轨切分**，其余字**逐字不变**。
   */
  const text = toTraditional(pruned);

  return dualFlowPagesOf([text], 'postscript');
}

/**
 * 修谱视图 → 页（**纯函数**；卷首 + 由内容派生的三类页，按 `seq` 升序**历次全部并列**）。
 *
 * 字段口径（逐字对齐后端 `getRevisionView()` 出参）：历次列表 = `revision.revisions`（**非** `rounds`）；
 * 每轮 `helpers`（内容 kind）⇒ 派生 **`roster` 页**、`donations`（内容 kind）⇒ 派生 **`donation` 页**；
 * `cover` ⇒ `cover` 页、`article` ⇒ `article` 页。
 *
 * 出参页的 `leftLabel` / `rightLabel` **一律空串** —— 书口文案与连号一律由 `buildWenpuBook()` 的
 * 统一分页循环（`finishBook()`）按**全书页序**分配 ⇒ 修谱页与谱文页**共用同一套连号**。
 */
export function buildRevisionPages(revision: RevisionView | null | undefined): WenpuPage[] {
  const out: WenpuPage[] = [];
  const records = [...(revision?.revisions || [])].filter(Boolean);
  records.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  for (const rec of records) {
    // ① 卷首（昭範正圖 = `cover` 内容）：**独立整页大图、不入列**（整体分列重构不改变它；保留左右书口）
    const coverUrl = (rec.cover?.url || '').trim();
    if (coverUrl) {
      out.push({
        rows: [],
        leftLabel: '',
        rightLabel: '',
        kind: 'cover',
        cover: { url: coverUrl, width: rec.cover?.width ?? undefined, height: rec.cover?.height ?? undefined },
      });
    }
    // ② 族務紀文（`article` 内容）：标题 / 正文 / 落款 → **乌丝栏双轨竖排**
    //    （`，`⇒`●` / `。`⇒`○` 走标点列轨、空格不占位；字列 26px + 标点列 14px ⇒ 栏格 43px、每页 20 栏）
    out.push(
      ...dualFlowPagesOf(
        [rec.article?.title || '', rec.article?.body || '', rec.article?.signature || ''],
        'article',
      ),
    );
    // ③ 譜司襄事页（由 `helpers` 内容派生）：一人一条「姓名 + 空格 + 職務」（缺项整条跳过）
    out.push(
      ...flowPagesOf(
        flowColsOf(
          (rec.helpers || []).map((item) => {
            const name = (item?.name || '').trim();
            const duty = (item?.duty || '').trim();
            return name && duty ? name + ' ' + duty : '';
          }),
        ),
        'roster',
      ),
    );
    // ④ 樂捐名錄页（由 `donations` 内容派生）：一人一条「姓名 + 空格 + 金額漢字大寫」
    //    （`amount_text` = 后端出参，前端零转换；缺项整条跳过）
    out.push(
      ...flowPagesOf(
        flowColsOf(
          (rec.donations || []).map((item) => {
            const name = (item?.name || '').trim();
            const amountText = (item?.amount_text || '').trim();
            return name && amountText ? name + ' ' + amountText : '';
          }),
        ),
        'donation',
      ),
    );
  }
  return out;
}

/** 统一分页收口：按**全书页序**写书口 —— 左 `▲ <谱名> 葉<2k+1>` / 右 `▲ <堂号> 葉<2k+2>`（汉字序）。
 *
 *  **封面页（`kind === 'frontcover'`）与封底页（`kind === 'backcover'`）不参与计数、不写任何书口**
 *  （leftLabel / rightLabel 均空）：叶序计数器只在其余页上递增 ⇒ 封面 / 封底**不占用叶序**，
 *  其后各页的书口与「不加封面/封底」时**逐字一致**（新增封面页的下一叶仍为 `葉一` / `葉二`）。 */
function finishBook(allPages: WenpuPage[], title: string, hall: string, rowCount: number): WenpuBook {
  let leafIndex = 0;
  for (const page of allPages) {
    if (page.kind === 'frontcover' || page.kind === 'backcover') {
      page.leftLabel = '';
      page.rightLabel = '';
      continue;
    }
    page.leftLabel = '▲ ' + title + ' 葉' + chineseNum(2 * leafIndex + 1);
    page.rightLabel = hall ? '▲ ' + hall + ' 葉' + chineseNum(2 * leafIndex + 2) : '';
    leafIndex += 1;
  }
  return {
    pages: allPages,
    title,
    hall,
    rowCount,
    // 空态**只按非封面 / 非封底页数**判定 ⇒ 空书不得仅因封面 / 封底而由 `empty:true` 变假
    //（与「暫無譜文」单页并存）
    empty: allPages.filter((p) => p.kind !== 'frontcover' && p.kind !== 'backcover').length === 0,
  };
}

/**
 * 生成整本「在线文谱」。
 *
 * @param treeId 家族树 id（读 `/people/` 与 `/families/` 的 `X-Tree-Id`）
 * @param revision 修谱视图（`可选`；缺省 / `null` / 无修谱记录 ⇒ 与**非修谱批完全一致**：谱文页零变化）
 * @returns 纯数据书稿（已繁体化；视图层零转换）
 */
export async function buildWenpuBook(
  treeId: string,
  revision?: RevisionView | null,
): Promise<WenpuBook> {
  let title = '';
  let hall = '';
  try {
    const [meta, list, families] = await Promise.all([
      fetchTreeMetaRemote(),
      fetchPersonList(treeId, 0, 0),
      fetchFamilyList(treeId),
    ]);
    const entry: TreeEntry | undefined = (meta as TreeMeta)?.trees?.[treeId];
    title = titleOf(entry);
    hall = hallOf(entry);
    /** 修谱页（卷首 + 三类内容）：插在谱文页**之前**；无修谱记录 ⇒ 空数组（零变化） */
    const revisionPages = buildRevisionPages(revision);
    /** 家谱内容设定（`GET /revisions` 顶层**新增** `wenpu_config` —— **同一份出参取用、不新增请求**）：
     *  两模板缺失 ⇒ 皆 `undefined` ⇒ 后记走**既有硬编码文案**（零回归）。 */
    const wenpuConfig = (revision as (RevisionView & { wenpu_config?: WenpuConfig }) | null | undefined)
      ?.wenpu_config;
    /** 后记页（`postscript` · 平台自动生成 · 文案由 `wenpu_config` 模板驱动）：置于**全书最末**；
     *  仅当全书已有页面时追加（空谱保持「暫無譜文」空态） */
    const appendPostscript = (pages: WenpuPage[]): WenpuPage[] =>
      pages.length
        ? [...pages, ...buildPostscriptPages(entry, revision, wenpuConfig?.postscript_template)]
        : pages;
    /** 封面页（W-26 · Kevin 2026-10-12）：**全书第一页**（在「第一部分·修谱卷」之前），
     *  整页**只有谱名** —— 取 `genealogy_name`（空 ⇒ `display_title`）经既有 `titleOf()`
     *  ⇒ **与书口谱名同口径**（已 `toTraditional`，视图层零转换）。
     *  **不占叶序 / 不写任何书口** 由 `finishBook()` 统一处置（封面页 `leftLabel` / `rightLabel` 均空，
     *  且叶序计数跳过它 ⇒ 其后各页书口与「不加封面」时逐字一致，仍从 `葉一` 起）。 */
    const frontCoverPages = (): WenpuPage[] =>
      title ? [{ rows: [], leftLabel: '', rightLabel: '', kind: 'frontcover', frontTitle: title }] : [];
    /** 封底页（Kevin 2026-10-14 · 与封面成对）：**全书最后一页**（在**后记之后**），
     *  整页**只有一枚印章**（印文「中华数字家谱」· 暖白 `#F1E7D6` · 约 300×300 居中于右半）；
     *  **不占叶序 / 不写任何书口** 同由 `finishBook()` 统一处置（与封面同一判据）。
     *  无文本内容 ⇒ 不依赖 `title`（印文来自资产，与谱名无关）。 */
    const backCoverPages = (): WenpuPage[] => [{ rows: [], leftLabel: '', rightLabel: '', kind: 'backcover' }];
    /** 全书页序 = 【封面】+（修谱卷 + 谱文页 + 后记）+【封底】；**整本无页 ⇒ 封面 / 封底皆不插**
     *  （空书保持既有「暫無譜文」空态单页；`empty` 判定不得因封面 / 封底由真变假）。 */
    const assemble = (core: WenpuPage[]): WenpuPage[] =>
      core.length ? [...frontCoverPages(), ...core, ...backCoverPages()] : core;

    const people: PersonSummary[] = (list?.data || []).filter(Boolean);
    if (!people.length) {
      const pages = assemble(appendPostscript(revisionPages));
      return pages.length ? finishBook(pages, title, hall, 0) : emptyBook(title, hall);
    }

    /** **起点（始祖）handle** —— W-17 回退链（tree-meta 缺 founder 时按本姓 + 无父家族逐级回退） */
    const founderHandle = founderHandleOf(entry, people, families);
    /** 本树姓氏（姓名书写口径 R1 / R2 的判据）—— W-18 取值链（第 ③ 级 = 上一步推断出的始祖 `surname`） */
    const rootSurname = rootSurnameOf(entry, people, families);

    // ---- 索引（全部来自读 API 的可见集合）----
    const byHandle = new Map<string, PersonSummary>();
    for (const p of people) byHandle.set(p.handle, p);

    /** 父家族 + 行第（该家族 `child_handles` 位次，1 起）：首见为准 */
    const parentPos = new Map<string, number>();
    /** 作为父母（父 / 母）所在的家族，按服务端返回序 */
    const asParentFams = new Map<string, FamilySummary[]>();
    for (const fam of families) {
      fam.child_handles.forEach((ch, idx) => {
        if (!parentPos.has(ch)) parentPos.set(ch, idx + 1);
      });
      for (const ph of [fam.father_handle, fam.mother_handle]) {
        if (!ph) continue;
        const arr = asParentFams.get(ph);
        if (arr) arr.push(fam);
        else asParentFams.set(ph, [fam]);
      }
    }

    /** 某人的**配偶** handle（共处同一 family 的另一方；仅本树内可见者） */
    const spousesOf = (handle: string): string[] => {
      const out: string[] = [];
      for (const fam of asParentFams.get(handle) || []) {
        const other = fam.father_handle === handle ? fam.mother_handle : fam.father_handle;
        if (other && other !== handle && byHandle.has(other)) out.push(other);
      }
      return out;
    };

    /** 某人的**子女** handle（按各家族 `child_handles` 位次；仅本树内可见者） */
    const childHandlesOf = (handle: string): string[] => {
      const out: string[] = [];
      for (const fam of asParentFams.get(handle) || []) {
        for (const ch of fam.child_handles) if (byHandle.has(ch)) out.push(ch);
      }
      return out;
    };

    // ---- W-19 女儿线整支终止：女儿 = 本姓 + `gender === 'F'` + **本人被某家族 `child_handles` 收录** ----
    //      **不得**用「本姓 F 且是某家族的母亲」判（媳妇会被误判 ⇒ 连带删掉其本姓丈夫 ——
    //      例：季氏树 季凤伶 `parent_family=''` 且不在任何 `child_handles` 里 ⇒ 媳妇、不是女儿）。
    //      E = 各女儿的**配偶** + **女儿线后代**（沿 `child_handles` 向下：女儿 → 子女 → 孙辈…）**及其配偶**；
    //      **女儿本人不入 E**、姻亲（配偶）**不再向外延伸**；**可见集 = 全部节点 − E**。
    const excluded = new Set<string>();
    if (rootSurname) {
      const asChildHandle = childHandlesSet(families);
      const bloodQueue: string[] = [];
      const seenBlood = new Set<string>();
      /** 女儿线**后代**（血亲）：入 E，并顺带纳入其**配偶**（姻亲、不再延伸） */
      const addDescendant = (handle: string): void => {
        if (seenBlood.has(handle)) return;
        seenBlood.add(handle);
        excluded.add(handle);
        for (const s of spousesOf(handle)) excluded.add(s);
        bloodQueue.push(handle);
      };
      for (const p of people) {
        if (p.gender !== 'F' || p.surname !== rootSurname || !asChildHandle.has(p.handle)) continue;
        for (const s of spousesOf(p.handle)) excluded.add(s); // 女儿的配偶（**女儿本人不排除**）
        for (const c of childHandlesOf(p.handle)) addDescendant(c);
      }
      while (bloodQueue.length) {
        const handle = bloodQueue.pop() as string;
        for (const c of childHandlesOf(handle)) addDescendant(c);
      }
    }

    /** 配偶 handle（共处同一 family 的另一方；本树内可见且**不在 E 内**者优先，空串 = 无） */
    const spouseOf = (handle: string): string =>
      spousesOf(handle).find((h) => !excluded.has(h)) || '';

    /** 子女（顺序 = child_handles 位次；服务端裁剪后不可见者 / **E 内者**一律**不渲染、不计数**） */
    const childrenOf = (handle: string): PersonSummary[] => {
      const out: PersonSummary[] = [];
      const seen = new Set<string>();
      for (const ch of childHandlesOf(handle)) {
        if (seen.has(ch) || excluded.has(ch)) continue;
        seen.add(ch);
        const child = byHandle.get(ch);
        if (child) out.push(child);
      }
      return out;
    };

    // ---- 世系序 = 世代优先（层序 / BFS）+ 配偶紧随本人（同一辈排完才进下一辈）----
    //      起点 = W-17 回退链（`founderHandle`）；逐代队列按入队顺序处理：
    //      ① 输出本人行 → ② 本人行的配偶立即紧随（配偶行不输出「行第」）
    //      → ③ 本人行与配偶行都把可见子女（child_handles 位次）追加到下一代队列（visited 去重）
    const ordered: Array<{ person: PersonSummary; isSpouse: boolean }> = [];
    const visited = new Set<string>();
    /** 收集某人的可见子女（按 child_handles 位次）追加到下一代队列；已输出者跳过 */
    const enqueueChildren = (
      handle: string,
      next: Array<{ handle: string; isSpouse: boolean }>,
    ): void => {
      for (const child of childrenOf(handle)) {
        if (!visited.has(child.handle)) next.push({ handle: child.handle, isSpouse: false });
      }
    };
    // 起点若落在 E 内（本姓男性始祖不可能落在女儿线闭包里，此为**防御性空转**）⇒ 视为无起点
    let generation: Array<{ handle: string; isSpouse: boolean }> =
      founderHandle && !excluded.has(founderHandle) ? [{ handle: founderHandle, isSpouse: false }] : [];
    while (generation.length) {
      const nextGeneration: Array<{ handle: string; isSpouse: boolean }> = [];
      for (const item of generation) {
        if (!item.handle || visited.has(item.handle)) continue;
        const person = byHandle.get(item.handle);
        if (!person) continue;
        visited.add(item.handle);
        ordered.push({ person, isSpouse: item.isSpouse });
        if (!item.isSpouse) {
          const sp = spouseOf(item.handle);
          if (sp && !visited.has(sp)) {
            const spouse = byHandle.get(sp);
            if (spouse) {
              visited.add(sp);
              ordered.push({ person: spouse, isSpouse: true });
              enqueueChildren(sp, nextGeneration);
            }
          }
        }
        enqueueChildren(item.handle, nextGeneration);
      }
      generation = nextGeneration;
    }

    // ---- 不可达孤立节点：追加在全部可达内容之后，按 gramps_id 升序（不丢内容；**E 内成员一概不出现**）----
    const rest = people
      .filter((p) => !visited.has(p.handle) && !excluded.has(p.handle))
      .sort(compareByGrampsId);
    for (const p of rest) ordered.push({ person: p, isSpouse: false });

    // ---- 每人一条栏序（一栏 = 一条数据）----
    const colsOf = (person: PersonSummary, isSpouse: boolean): WenpuCol[] => {
      const cols: WenpuCol[] = [];
      // ① 姓名（**姓名书写口径**：本姓只写名 / 外姓「姓氏 名」/ 空姓「氏 名」）
      pushRecord(cols, displayName(person, rootSurname), true);
      // ② 行第（配偶行不输出）
      if (!isSpouse) {
        const pos = parentPos.get(person.handle) || 0;
        if (pos > 0) pushRecord(cols, '行' + chineseNum(pos));
      }
      // ③ 生于 <农历>（**W-20**：命中 ISO ⇒ 既有农历口径；**有值但非 ISO** ⇒ `生年不详`；缺项 ⇒ 整条跳过）
      const bornDate = (person.birth_date || '').trim();
      if (bornDate) pushRecord(cols, isIsoDate(bornDate) ? '生于' + lunarOf(bornDate) : BIRTH_UNKNOWN);
      // ④ 在世 / 卒于 <农历>（**W-20**：命中 ISO ⇒ 既有农历口径；**有值但非 ISO** ⇒ `卒年不详`；
      //    缺卒年且 `is_living === false` ⇒ `卒年不详`；缺卒年且非 `false` ⇒ 既有 `在世` 不动）
      const diedDate = (person.death_date || '').trim();
      if (diedDate) {
        pushRecord(cols, isIsoDate(diedDate) ? '卒于' + lunarOf(diedDate) : DEATH_UNKNOWN);
      } else if (person.is_living === false) {
        pushRecord(cols, DEATH_UNKNOWN);
      } else if (person.is_living) {
        pushRecord(cols, '在世');
      }
      // ⑤ 葬于 <death_place>
      const buried = (person.death_place || '').trim();
      if (buried) pushRecord(cols, '葬于' + buried);
      // ⑥ 子女数串「子N女M」（**只数 'M' / 'F'**、只写非 0 项、汉字数字；无 M / F ⇒ 计数归零 ⇒ 整条跳过）
      const kids = childrenOf(person.handle);
      const sons = kids.filter((c) => c.gender === 'M');
      const daughters = kids.filter((c) => c.gender === 'F');
      const countText =
        (sons.length ? '子' + chineseNum(sons.length) : '') +
        (daughters.length ? '女' + chineseNum(daughters.length) : '');
      if (countText) pushRecord(cols, countText);
      // ⑦ 子女逐条（顺序 = child_handles 位次；标签按性别各自计数）
      //    性别未知（gender 非 'M' / 'F'）⇒ **不计数、不加标签**，只输出**姓名书写口径**产物（不自造「子女」「幼」类标签）
      let sonOrder = 0;
      let daughterOrder = 0;
      for (const child of kids) {
        if (child.gender === 'M') {
          sonOrder += 1;
          pushRecord(cols, childLabel('子', sonOrder) + ' ' + displayName(child, rootSurname));
        } else if (child.gender === 'F') {
          daughterOrder += 1;
          pushRecord(cols, childLabel('女', daughterOrder) + ' ' + displayName(child, rootSurname));
        } else {
          pushRecord(cols, displayName(child, rootSurname));
        }
      }
      return cols;
    };

    // ---- 行（栏数 > 30 → 多余栏挤占下一行，同样占行位）----
    const rows: WenpuRow[] = [];
    for (const item of ordered) {
      const cols = colsOf(item.person, item.isSpouse);
      const rowBase = {
        handle: item.person.handle,
        grampsId: item.person.gramps_id || '',
        name: toTraditional(item.person.name),
        isSpouse: item.isSpouse,
      };
      if (!cols.length) {
        rows.push({ ...rowBase, cols: [] });
        continue;
      }
      for (let i = 0; i < cols.length; i += WENPU_COLS_PER_ROW) {
        rows.push({ ...rowBase, cols: cols.slice(i, i + WENPU_COLS_PER_ROW) });
      }
    }
    if (!rows.length) {
      const pages = assemble(appendPostscript(revisionPages));
      return pages.length ? finishBook(pages, title, hall, 0) : emptyBook(title, hall);
    }

    // ---- 分页（每页 4 行、不足补 null）----
    const genealogyPages: WenpuPage[] = [];
    for (let i = 0; i < rows.length; i += WENPU_ROWS_PER_PAGE) {
      const slice: (WenpuRow | null)[] = rows.slice(i, i + WENPU_ROWS_PER_PAGE);
      while (slice.length < WENPU_ROWS_PER_PAGE) slice.push(null);
      genealogyPages.push({ rows: slice, leftLabel: '', rightLabel: '' });
    }
    // 封面页**置于全书最前**、修谱页插在谱文页之前、后记页置于后段、封底页**置于全书最末**；书口与叶序由
    // `finishBook()` 按**全书页序**统一分配、**封面 / 封底页跳过计数**（修谱页占前几葉、谱文顺延、后记收尾、封底压轴、不重起编号）
    return finishBook(assemble(appendPostscript([...revisionPages, ...genealogyPages])), title, hall, rows.length);
  } catch {
    // 读失败（网络错误 / 非 2xx / **树不存在 404**）⇒ **不得**静默当作 `empty:true`：
    // 以 `error:true` + `empty:false` 交视图层走**纸外**失败提示（与「真·无人物」可分辨）
    return errorBook(title, hall);
  }
}
