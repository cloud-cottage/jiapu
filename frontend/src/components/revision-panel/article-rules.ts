/**
 * 族務紀文（修谱面板 ②）—— **纯函数 + 文案单点**（无 uni / 无 DOM / 无 Vue；面板与离线自证共用）。
 *
 * 口径（A 口径 · Kevin 2026-10-12 拍定 · 三字段同规则）：
 *   · **只允许「汉字 + 中文逗号 `，` + 中文句号 `。`」**；其它一切字符（顿号 `、` / 分号 / 引号 /
 *     感叹号 / 问号 / 英文标点 `,` `.` / 空格 / 阿拉伯数字 / 拉丁字母 / 换行 …）**逐字符全拒**；
 *   · **禁止连续标点**（`，。` / `。。` / `，，` … 相邻即拒）；
 *   · **存储保留原文**：前端**不做任何清洗**（旧「标点折成空格」的 `sanitizePunct` 已随本口径删除），
 *     标点原样进 `items`；标点只在【乌丝栏渲染】时剔除 + 转译（渲染单另派）。
 *
 * ⚠️ 两条拒绍文案**与后端 `cloudfunctions/compat-api/lib/revision.js` 逐字一致（繁体）**
 *    ⇒ 改字面必须先改后端，不得单侧改（同 `roster-rules.ts` 体例）。
 * ⚠️ 本文件在 `frontend/src/components/revision-panel/` 内，与面板同目录、同批交付。
 */

/** 非法字符拒绍文案（**与后端 `ARTICLE_MSG_CHARSET` 逐字一致**） */
export const ARTICLE_MSG_CHARSET = '僅允許漢字與中文逗號、句號';
/** 连续标点拒绍文案（**与后端 `ARTICLE_MSG_PUNCT_REPEAT` 逐字一致**） */
export const ARTICLE_MSG_PUNCT_REPEAT = '標點不可連續';

/** 合法标点（**只有这两个**；中文逗号 / 中文句号） */
export const ARTICLE_PUNCT: string[] = ['，', '。'];

/** 三字段（同规则） */
export type ArticleField = 'title' | 'body' | 'signature';

/** 字段顺序（校验与展示同名序） */
export const ARTICLE_FIELDS: ArticleField[] = ['title', 'body', 'signature'];

/** 字段中文标签（与后端 `ARTICLE_LABEL` 同源；本层仅用于定位，不拼进拒绍文案） */
export const ARTICLE_LABEL: Record<ArticleField, string> = {
  title: '標題',
  body: '正文',
  signature: '落款',
};

/**
 * 单个**码点**是否汉字：基本区 `U+4E00–U+9FFF` · 扩展 A `U+3400–U+4DBF` ·
 * 兼容汉字 `U+F900–U+FAFF` · 扩展 B–F / 兼容补充 `U+20000–U+2FA1F` · 扩展 G `U+30000–U+3134F`。
 * 与后端 `isHanziCodePoint` **同一口径**（增补平面汉字不被拆成两个非法字符）。
 */
export function isHanziCodePoint(cp: number): boolean {
  const n = Number(cp);
  if (!Number.isFinite(n)) return false;
  return (
    (n >= 0x3400 && n <= 0x4dbf) ||
    (n >= 0x4e00 && n <= 0x9fff) ||
    (n >= 0xf900 && n <= 0xfaff) ||
    (n >= 0x20000 && n <= 0x2fa1f) ||
    (n >= 0x30000 && n <= 0x3134f)
  );
}

/** 是否合法标点（`，` / `。`） */
export function isArticlePunct(ch: string): boolean {
  return ARTICLE_PUNCT.indexOf(ch) >= 0;
}

/** **首个非法字符**（无 ⇒ `''`）：允许集 = 汉字 ∪ {`，`, `。`}，其余全拒（逐码点遍历） */
export function firstIllegalArticleChar(text: string): string {
  const chars = Array.from(String(text == null ? '' : text));
  for (const ch of chars) {
    if (isArticlePunct(ch)) continue;
    if (isHanziCodePoint(ch.codePointAt(0) as number)) continue;
    return ch;
  }
  return '';
}

/** 是否含**连续标点**（相邻两码点皆为 `，` 或 `。`） */
export function hasConsecutiveArticlePunct(text: string): boolean {
  let prevPunct = false;
  for (const ch of Array.from(String(text == null ? '' : text))) {
    const isP = isArticlePunct(ch);
    if (isP && prevPunct) return true;
    prevPunct = isP;
  }
  return false;
}

/** 单字段校验结果 */
export interface ArticleTextCheck {
  ok: boolean;
  /** 不合格时的拒绍文案（**逐字同后端**）；合格 ⇒ `''` */
  message: string;
}

/** 单字段实时校验（**字符集 → 连续标点**，判序与后端 `assertArticleText` 一致） */
export function checkArticleText(text: string): ArticleTextCheck {
  if (firstIllegalArticleChar(text)) return { ok: false, message: ARTICLE_MSG_CHARSET };
  if (hasConsecutiveArticlePunct(text)) return { ok: false, message: ARTICLE_MSG_PUNCT_REPEAT };
  return { ok: true, message: '' };
}

/** 面板编辑态的族務紀文（提交形状的子集） */
export interface ArticleDraft {
  title?: string;
  body?: string;
  signature?: string;
}

/** 三字段整体校验结果：`field` = 首个不合格字段（`''` = 全部合格） */
export interface ArticleCheck extends ArticleTextCheck {
  field: ArticleField | '';
}

/**
 * 三字段整体校验（**标题 → 正文 → 落款**，首个不合格即返回）—— 面板实时提示与提交前拦截共用。
 * ⚠️ 本函数**不判空**（空字段的 `不得為空` 仍由后端出文案，与改动前一致）。
 */
export function checkArticle(draft: ArticleDraft): ArticleCheck {
  const d = draft || {};
  for (const f of ARTICLE_FIELDS) {
    const r = checkArticleText(String(d[f] == null ? '' : d[f]));
    if (!r.ok) return { ok: false, message: r.message, field: f };
  }
  return { ok: true, message: '', field: '' };
}
