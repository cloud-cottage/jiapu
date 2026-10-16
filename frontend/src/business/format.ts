/**
 * 展示层格式化工具。
 *
 * 编号前缀约定：Gramps 记录类型前缀 I=Individual（个人）/ F=Family（家庭）。
 * **全站唯一编号**（docs/id-system.spec.md；2026-10-10 新口径）：
 * - 人：**存储 = 9 位纯数字**（`000000052`，无 `I`）；**展示 = 九位纯数字**（`000000052`，无前缀）。
 * - 家庭：`F` + 6 位（`F000012`），展示原样。
 * 过渡期新旧形态互认（输入兼容）：入参 `I0052`（旧）/ `I000052` / `000000052` 一律归一化后按九位纯数字展示。
 * 存储/引用层不得带 `I` 前缀（人号靠纯数字 + 家庭号靠 `F` 前缀区分）。
 */
const PERSON_ID_WIDTH = 9;

export function personIdDisplay(id?: string | null): string {
  const s = (id || '').trim();
  if (!s) return '';
  const m = s.match(/^([IiFf]?)(\d+)$/);
  // 异常 / 含其它字母（handle 等）→ 原样展示（既有兜底不丢）
  if (!m) return s;
  // 家庭编号：原样展示（F 前缀保留）
  if (m[1].toUpperCase() === 'F') return s;
  // 人：去可选前缀 + 去前导零后补零为九位纯数字 → 000000052（不带 I 前缀）
  return String(parseInt(m[2], 10)).padStart(PERSON_ID_WIDTH, '0');
}

/**
 * 「编号」输入框的统一提示（docs/id-system.spec.md §5）：
 * 全局编号（如 000000052）或 handle —— 全局编号全站唯一定位，**无需再选目标家族树**。
 * 输入兼容不变：`I0052` / `0052` / `000000052` 三种形态均可定位同一人节点。
 */
export const PERSON_REF_HINT = '全局编号（如 000000052）或 handle';
export const PERSON_REF_PLACEHOLDER = '全局编号（如 000000052）或 handle';

/**
 * 生卒日期展示统一格式化（档案/列表共用，避免各处手写转换不一致）。
 * - 纯 4 位年份 "1957" / "1920" → 按年份展示（原样）
 * - 完整日期 "1957-12-04" / "1957/12/04" → 统一为 YYYY-MM-DD 展示
 * - 其它（含月份无日等少见形态 / 脏数据）→ 去除空白后原样展示，绝不臆造
 */
export function dateDisplay(date?: string | null): string {
  const s = (date || '').trim();
  if (!s) return '';
  // 纯 4 位年份
  if (/^\d{4}$/.test(s)) return s;
  // YYYY-MM-DD 或 YYYY/MM/DD（含分隔符变体）→ 统一连字符
  const m = s.match(/^(\d{4})[/\-.](\d{1,2})(?:[/\-.](\d{1,2}))?$/);
  if (m) {
    const mm = m[2].padStart(2, '0');
    return m[3] ? `${m[1]}-${mm}-${m[3].padStart(2, '0')}` : `${m[1]}-${mm}`;
  }
  return s;
}

/**
 * 称号类属性（详情文档 attributes 的 key）的**展示顺序**：封号 → 谥号 → 号。
 * 约定：人物名称统一显示为「姓 + 名 + 封号 + 谥号 + 号」（节点卡片/档案/编辑表单字段顺序同此）。
 * 存储仍在详情文档 attributes；GEDCOM 导出映射 TITL(封号) / NICK(号) / _ATTR(谥号)。
 */
export const TITLE_DISPLAY_ORDER = ['封号', '谥号', '号'] as const;
/** 称号三字段（key 集合，顺序无关的遍历/清理场景用它） */
export const TITLE_ATTR_KEYS = TITLE_DISPLAY_ORDER;

/** 属性数组 → {key: value}（同 key 后者覆盖前者） */
export function attrMapOf(attributes?: Array<{ key: string; value: string }> | null): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of attributes || []) map[a.key] = a.value;
  return map;
}

/**
 * 称号串：按「封号 → 谥号 → 号」取全部已录入项，用 · 连接；全空返回 ''（调用方据此决定是否渲染）。
 * 例：封号=毕公 → 「毕公」；封号=毕公 + 谥号=文 → 「毕公·文」。
 */
export function titleLabel(attributes?: Array<{ key: string; value: string }> | null): string {
  const map = attrMapOf(attributes);
  return TITLE_DISPLAY_ORDER.map((k) => (map[k] || '').trim())
    .filter(Boolean)
    .join('·');
}

/**
 * 人物名称 = 姓+名 + 封号 + 谥号 + 号（展示统一走这里，避免各处自行拼接顺序不一）。
 * 例：姬高 + 封号毕公 → 「姬高·毕公」；无称号时原样返回姓名。
 */
export function nameWithTitles(name?: string | null, titles?: string | null): string {
  const n = (name || '').trim();
  const t = (titles || '').trim();
  if (!t) return n;
  return n ? `${n}·${t}` : t;
}

/**
 * 家族树展示名：有姓氏 → 「X氏 · 树名」；姓氏缺失（tree-meta 里 surname_char / surname 为 null）
 * → 只显示树名，不留下「氏 · 」空姓前缀。
 * 例：('沈氏临沂家族', null) → 「沈氏临沂家族」（旧写法会拼成「氏 · 沈氏临沂家族」）。
 */
export function treeDisplayLabel(
  title?: string | null,
  surname?: string | null,
): string {
  const t = (title || '').trim();
  const s = (surname || '').trim();
  return s ? `${s}氏 · ${t}` : t;
}

// ---- 编号展示：镜像标注（编号口径「甲」A-5 · **展示构造单点**；组件里不得再各写一套）----

/**
 * 取记录候选 / 节点的编号 + 镜像指针形状。`PersonSummary`（读响应派生）、树图节点、搜索命中均结构兼容。
 * ⚠️ 真身自身也会带 `external_*`（配偶 / 认祖指针）⇒ 判据只能是 `external_mirror === 'true'`
 * 且 `external_person_handle` 非空（与后端 `lib/id-resolve.js#isMirrorRecord` 同判据）。
 */
export interface PersonIdSourceFields {
  gramps_id?: string | null;
  handle?: string | null;
  external_mirror?: string | null;
  external_person_handle?: string | null;
  external_tree?: string | null;
  external_link_type?: string | null;
}

/** 是否镜像记录（口径 A-2；与后端 `isMirrorRecord` 同判据） */
export function isMirrorRecord(f: PersonIdSourceFields | null | undefined): boolean {
  return String(f?.external_mirror ?? '').trim() === 'true' && !!String(f?.external_person_handle ?? '').trim();
}

/**
 * 择一档位（R-1 / R-3，与后端 `mirrorRankOf` 同口径；数值越小越优先）：
 * `0` 真身（非镜像）/ `1` 登记镜像（`external_link_type === 'founder'`）/ `2` 其它镜像。
 */
export function mirrorPriorityOf(f: PersonIdSourceFields | null | undefined): number {
  if (!isMirrorRecord(f)) return 0;
  return String(f?.external_link_type ?? '').trim() === 'founder' ? 1 : 2;
}

/**
 * 同一编号命中多条记录时的**稳定择一**（R-1 / R-3）：真身 > 登记镜像 > 其它镜像 → `handle` 字典序。
 * **绝不**依赖数组顺序（`find` / `[0]` 取首条）—— 甲口径下同一编号可对应 1 条真身 + N 条镜像。
 * 无候选 → `null`（调用方的报错文案口径不变）。
 */
export function pickPreferredPerson<T extends PersonIdSourceFields>(items: T[] | null | undefined): T | null {
  const list = (items || []).filter((x) => !!x);
  if (!list.length) return null;
  return list
    .slice()
    .sort((a, b) => {
      const r = mirrorPriorityOf(a) - mirrorPriorityOf(b);
      if (r !== 0) return r;
      const ha = String(a?.handle ?? '');
      const hb = String(b?.handle ?? '');
      return ha < hb ? -1 : ha > hb ? 1 : 0;
    })[0];
}

/**
 * 镜像标注字面（A-5 / `docs/PENDING_DEPLOY.md` §80-2 判据 3 逐字）：`镜像 · 源自 <来源树名>`。
 * 来源树名取不到（tree-meta 缺该树 / 云端未重启）→ 退化为「镜像」，绝不拼出半截空树名。
 */
export function mirrorSourceLabel(sourceTreeTitle?: string | null): string {
  const t = (sourceTreeTitle || '').trim();
  return t ? `镜像 · 源自 ${t}` : '镜像';
}

/**
 * 编号展示（含镜像标注 · R-4 显示单点）：
 * - 真身：`000000100` —— 与 `personIdDisplay` **逐字一致**（宽度 9 位与去前缀口径不变）；
 * - 镜像：`000000100（镜像 · 源自 中华世本）`（编号 = 镜像自身那一条的编号，即甲口径下的真身号）。
 */
export function personIdDisplayWithSource(
  id?: string | null,
  opts?: { is_mirror?: boolean; source_tree_title?: string | null } | null,
): string {
  const base = personIdDisplay(id);
  if (!opts?.is_mirror) return base;
  const note = mirrorSourceLabel(opts.source_tree_title);
  return base ? `${base}（${note}）` : `（${note}）`;
}

/**
 * 由记录形状直接构造编号展示串（列表行 / 确认行共用；镜像自动带来源标注）。
 * `sourceTreeTitle` 由调用方用 `treeDisplayTitleOf(external_tree)`（cross-tree.ts 模块级缓存）解析后传入
 * —— 本模块保持纯函数，不做 IO。
 */
export function personIdDisplayOf(
  f: PersonIdSourceFields | null | undefined,
  sourceTreeTitle?: string | null,
): string {
  return personIdDisplayWithSource(f?.gramps_id ?? '', {
    is_mirror: isMirrorRecord(f),
    source_tree_title: sourceTreeTitle,
  });
}

