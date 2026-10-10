/**
 * 站点 SEO 单一真源（标题 / 描述 / 关键词 / 路由→页面名 / 路由→关键词组）
 *
 * - 静态首页值由构建模板 frontend/index.html 直接输出（title / description / keywords / og）
 * - 本文件负责运行时按路由改写 document.title 与 head 内 description / keywords
 * - 运行时（DOM）部分用条件编译 `#ifdef H5` 仅在 H5 生效，小程序不跑 DOM
 * - applySeo() 幂等：同一路由重复调用结果一致，不会重复创建 meta、不会累加标题后缀
 */

import { nextTick } from 'vue';

/** A · 全站标题（首页全称，不拼后缀） */
export const SITE_TITLE = '家谱 100｜家族历史数字馆，多姓氏家谱数字化珍藏平台';

/** B · 全站描述（所有页面同一份） */
export const SITE_DESCRIPTION =
  '家谱 100（https://jiapu100.com）家族历史数字馆，多姓氏、多支派家谱数字化珍藏平台。汇聚百家家乘，典藏宗族史料；千秋祖脉绵世泽，万卷家乘振宗风，助族人寻根溯源，永续家族文脉。';

/** C · 首页 keywords（全站词） */
export const SITE_KEYWORDS =
  '家谱,族谱,宗谱,家乘,家谱数字化,家族历史,家族数字馆,多姓氏家谱,寻根溯源,修谱,家族史料,家谱珍藏,支派世系,宗族文化,祖脉传承,家谱100,jiapu100';

/** E · 内页标题后缀（全角竖线） */
export const TITLE_SUFFIX = '｜家谱 100';

/** 首页路由 */
export const HOME_ROUTE = 'pages/index/index';

/** E · 取不到页面名时的回退名 */
export const FALLBACK_PAGE_NAME = '家谱 100';

/** D · G2 谱系/家族类 */
export const KEYWORDS_PEDIGREE = '家族世系查询,各姓氏家谱查阅,家族族谱数字化归档,宗族支派源流考证';
/** D · G3 修谱工具类 */
export const KEYWORDS_TOOLS = '修谱平台,线上家谱制作,家谱线上保存';
/** D · G4 史料/介绍类 */
export const KEYWORDS_HISTORY = '家族历史档案馆,修谱平台';
/** D · G5 默认（其余所有路由） */
export const KEYWORDS_DEFAULT = '线上家谱制作,家谱线上保存';

/**
 * 路由 → 页面名（逐字取自 frontend/src/pages.json 的 navigationBarTitleText）
 * 注意：首页 pages/index/index 在导航栏叫「家族历史数字馆」，但文档标题用 A 全称，不拼后缀。
 */
export const ROUTE_TITLE: Record<string, string> = {
  'pages/index/index': '家族历史数字馆',
  'pages/family/index': '我的家族',
  'pages/mine/index': '我的',
  'pages/login/index': '登录',
  'pages/register/index': '注册',
  'pages/wallet/index': '我的钱包',
  'pages/assets/index': '我的资产',
  'pages/about/about': '关于本站',
  'pages/hall/index': '数字馆',
  'pages/person/detail': '人物详情',
  'pages/pedigree/index': '世系图谱',
  'pages/media/index': '文献地址',
  'pages/admin/index': '角色管理',
  'pages/spirit/index': '时流子域',
  'pages/market/index': '竹简市集',
  'pages/friend/list/index': '好友',
  'pages/friend/invite/index': '邀请好友',
  'pages/invite/landing': '邀请加入',
  'pages/task/index': '领取今日奖励',
  'pages/special/generation-poem/index': '字辈检索',
  'pages/special/migration-map/index': '迁徙地图',
  'pages/special/pdf-export/index': '族谱PDF导出',
};

/**
 * 路由 → keywords 组（D）
 * 未列出的路由一律走 G5 缺省 KEYWORDS_DEFAULT（我的 / 资产 / 钱包 / 市集 / 登录 / 注册 /
 * 时流子域 / 任务 / 文献地址 / 好友系列 / 邀请系列 / 后台系列）。
 */
export const ROUTE_KEYWORDS: Record<string, string> = {
  // G2 谱系/家族类
  'pages/hall/index': KEYWORDS_PEDIGREE,
  'pages/family/index': KEYWORDS_PEDIGREE,
  'pages/person/detail': KEYWORDS_PEDIGREE,
  'pages/pedigree/index': KEYWORDS_PEDIGREE,
  'pages/special/migration-map/index': KEYWORDS_PEDIGREE,
  // G3 修谱工具类
  'pages/special/generation-poem/index': KEYWORDS_TOOLS,
  'pages/special/pdf-export/index': KEYWORDS_TOOLS,
  // G4 史料/介绍类
  'pages/about/about': KEYWORDS_HISTORY,
};

// #ifdef H5
/** 当前页面路由（取 getCurrentPages() 最后一个元素的 route） */
function currentRoute(): string {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const cur = pages[pages.length - 1] as { route?: string } | undefined;
  return cur && cur.route ? cur.route : '';
}

/** 幂等取 head 内 meta[name]，缺失则创建 */
function ensureMeta(name: string): HTMLMetaElement | null {
  if (typeof document === 'undefined' || !document.head) return null;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  return el;
}

/** 幂等写 meta[name] 的 content（值相同不重复写） */
function setMetaContent(name: string, content: string): void {
  const el = ensureMeta(name);
  if (el && el.getAttribute('content') !== content) {
    el.setAttribute('content', content);
  }
}

/** 某路由的页面名（取不到回退「家谱 100」） */
export function pageNameOf(route: string): string {
  return ROUTE_TITLE[route] || FALLBACK_PAGE_NAME;
}

/** 某路由的完整标题（首页 = A 全称；内页 = 页面名｜家谱 100） */
export function titleOf(route: string): string {
  if (!route || route === HOME_ROUTE) return SITE_TITLE;
  return pageNameOf(route) + TITLE_SUFFIX;
}

/** 某路由的 keywords（首页 = C；内页按 D 分组，缺省 G5） */
export function keywordsOf(route: string): string {
  if (!route || route === HOME_ROUTE) return SITE_KEYWORDS;
  return ROUTE_KEYWORDS[route] || KEYWORDS_DEFAULT;
}

/**
 * 将当前路由的 SEO 应用到 document（幂等）
 * - 首页：document.title = A，keywords = C
 * - 内页：document.title = 页面名｜家谱 100，keywords = D 分组（缺省 G5）
 * - description 所有页面同一份 = B
 */
export function applySeo(): void {
  if (typeof document === 'undefined') return;
  const route = currentRoute();
  document.title = titleOf(route);
  setMetaContent('description', SITE_DESCRIPTION);
  setMetaContent('keywords', keywordsOf(route));
}
// #endif

/**
 * 动态标题（家族树 / 祖谱）：把浏览器标签页标题设为 `base + TITLE_SUFFIX`（幂等）。
 *
 * 为什么写三次：`uni.setNavigationBarTitle` 改的是**响应式**的 `pageMeta.navigationBar.titleText`，
 * uni-h5 的 `useDocumentTitle` 通过 `watchEffect` / `onActivated` 在**同一 tick 的后续 flush** 里把
 * `document.title` 同步过去 —— 在调用行之后同步写一次不足以胜出（会被写回纯树名）。故：
 *   ① 立即写一次；
 *   ② `nextTick`（微任务，晚于 watchEffect 的 flush）再写一次；
 *   ③ `setTimeout(…, 0)`（宏任务兜底）再写一次。
 * 函数体仅 H5 生效（小程序无 document）；`base` 为空串时直接 return（不写）。
 */
export function setDynamicTitle(base: string): void {
  // #ifdef H5
  if (!base) return;
  const write = () => {
    document.title = base + TITLE_SUFFIX;
  };
  write();
  nextTick(() => {
    write();
  });
  setTimeout(() => {
    write();
  }, 0);
  // #endif
}
