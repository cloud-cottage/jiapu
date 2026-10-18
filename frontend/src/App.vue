<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { resolveTreeIdByHost, applyTheme } from '@/business';
// 日夜模式（2026-10-17）：onLaunch 里把持久化的模式打到 <html data-theme>；
// 默认 light（不跟随系统），故首屏观感与本批之前完全一致。

// #ifdef H5
/** 首页入口别名路径：history 模式下被导航到该路径时收敛回裸域 */
const HOME_ALIAS_PATH = '/pages/index/index';

/** 首页地址归一：地址栏停在 /pages/index/index 时替换为裸域（保留 query / hash） */
function normalizeHomeUrl() {
  if (location.pathname === HOME_ALIAS_PATH) {
    history.replaceState(history.state, '', '/' + location.search + location.hash);
  }
}

// 包装 pushState / replaceState：任意一次路由提交后都尝试把首页地址收敛为裸域
const __origPushState = history.pushState;
const __origReplaceState = history.replaceState;
history.pushState = function (...args: Parameters<History['pushState']>) {
  __origPushState.apply(history, args);
  normalizeHomeUrl();
};
history.replaceState = function (...args: Parameters<History['replaceState']>) {
  __origReplaceState.apply(history, args);
  normalizeHomeUrl();
};
normalizeHomeUrl();

/**
 * popstate 别名兜底：history 前进/后退回到可读别名地址（/ji_23395_01、/z/ 等）时，
 * vue-router 的 popstate 处理是从 URL 解析路由（createCurrentLocation(base, location)，
 * 不用 state.current），而可读别名并不是 vue-router 路由（入口路由为 '/' alias '/pages/index/index'，
 * 其余为 /pages/...）⇒ 匹配不到、渲染空白；且浏览器前进/后退不触发 onPageNotFound，
 * 别名重派无人接管。故在此监听 popstate，复用已有 resolveTreeAlias() 重派。
 * - 根路径 '/'（去斜杠后为空串）交给路由与 normalizeHomeUrl，直接返回；
 * - '/pages/' 开头为内部路由，交给 vue-router，直接返回；
 * - 其余（可读别名形态，如 ji_23395_01、z、z/ji_23395）统一交给 resolveTreeAlias()
 *   （已处理 /z/、/z/<tree_id>、旧 /zhonghua、单段别名、RESERVED_PATHS 与 CLAN_PATH_RE）。
 * 仅在模块作用域注册一次；用 setTimeout(…, 0) 让先注册的 vue-router popstate 处理跑完后再重派。
 */
let aliasRepopPending = false;
function onPopStateAlias() {
  if (aliasRepopPending) return;
  const seg = location.pathname.replace(/^\/+|\/+$/g, '');
  if (!seg) return; // 根路径 '/'：交给路由与 normalizeHomeUrl
  if (location.pathname.startsWith('/pages/')) return; // 内部路由：交给 vue-router
  aliasRepopPending = true;
  setTimeout(() => {
    aliasRepopPending = false;
    resolveTreeAlias();
  }, 0);
}
window.addEventListener('popstate', onPopStateAlias);

/** 非家族树路径保留段（避免误解析静态资源/页面路径） */
const RESERVED_PATHS = new Set([
  'pages', 'static', 'assets', 'api', 'index.html', 'favicon.ico', 'node_modules', 'z',
]);

/** 祖谱可读 uri：/z/<tree_id>（仅表示 kind='clan' 的树，页面内按 kind 切三段版式） */
const CLAN_PATH_RE = /^\/z\/([a-z0-9_]+)$/;
/** hash 形式祖谱别名：#/z/<tree_id> */
const CLAN_HASH_RE = /^z\/([a-z0-9_]+)$/;

/** 中华世本（总谱）tree_id 与其**独立**可读 uri：/z/（原 /zhonghua 弃用） */
const MASTER_TREE_ID = 'zhonghua';
const MASTER_PATH = '/z/';
/** 旧世本地址（path 形式 /zhonghua、hash 形式 #/zhonghua）→ 客户端重定向到 /z/，不留旧地址 */
const LEGACY_MASTER_PATH_RE = /^\/zhonghua$/;
const LEGACY_MASTER_HASH_RE = /^zhonghua$/;

/**
 * 家族树可读 uri 解析：
 * - 路径形式  /ji_23395_01          → 家族树首页（地址栏保持可读 uri）
 * - 路径形式  /z/ji_23395           → 祖谱首页（kind='clan'）
 * - hash 形式 #/ji_23395_01 / #/z/ji_23395 → 同上
 */
function resolveTreeAlias() {
  // 旧 hash 分享链接兼容（如 #/pages/hall/index?tree_id=X、#/pages/person/detail?...）：
  // 转成等价 path 形态交给 history 路由；reLaunch 后 hash 清空，不会重入。
  if (location.hash.startsWith('#/pages/')) {
    const legacyHashPath = location.hash.replace(/^#\/?/, '');
    uni.reLaunch({ url: '/' + legacyHashPath });
    return;
  }
  const pathname = location.pathname.replace(/\/+$/, '');
  const hashPath = location.hash.replace(/^#\/?/, '');
  const onInternalRoute = hashPath.startsWith('pages/') || pathname.startsWith('/pages/');

  // 中华世本独立地址：/z/（含 /z、#/z、#/z/）与 /z/zhonghua（等价）→ 世本首页，地址栏保持 /z/
  // ⚠️ 必须先于祖谱正则判定：/z/zhonghua 也命中 CLAN_PATH_RE（会被当成 tree_id='zhonghua' 的祖谱）
  if (pathname === '/z' || pathname === `/z/${MASTER_TREE_ID}`) {
    if (!onInternalRoute) openMasterHome();
    return;
  }
  const clanPath = pathname.match(CLAN_PATH_RE);
  if (clanPath) {
    // 已有内部路由 hash（如 #/pages/pedigree/index）时尊重该路由，不劫持
    if (!onInternalRoute) openAlias(clanPath[1], false, true);
    return;
  }
  // 旧世本地址 /zhonghua（path 形式）→ 重定向到 /z/，不留旧地址
  if (LEGACY_MASTER_PATH_RE.test(pathname)) {
    if (!onInternalRoute) openMasterHome();
    return;
  }
  // hash 形式：#/z、#/z/、#/z/zhonghua 及旧 #/zhonghua —— 须先于祖谱 hash 判定（/z/zhonghua 含在祖谱正则里）
  const hashAlias = hashPath.replace(/\/+$/, '');
  if (hashAlias === 'z' || hashAlias === `z/${MASTER_TREE_ID}` || LEGACY_MASTER_HASH_RE.test(hashAlias)) {
    if (!onInternalRoute) openMasterHome();
    return;
  }
  const clanHash = hashPath.match(CLAN_HASH_RE);
  if (clanHash && !onInternalRoute) {
    openAlias(clanHash[1], true, true);
    return;
  }

  const m = pathname.match(/^\/([a-z0-9_]+)$/);
  if (m && !RESERVED_PATHS.has(m[1])) {
    if (!onInternalRoute) {
      openAlias(m[1], false);
    }
    return;
  }
  if (/^[a-z0-9_]+$/.test(hashPath) && !RESERVED_PATHS.has(hashPath)) {
    openAlias(hashPath, true);
  }
}

/**
 * 平台子域定位（商业化核心）：shiben.jiapu100.com 等 → 直接打开对应家族树首页
 * 仅当未命中显式路径/hash 内部路由时触发，避免劫持站内跳转
 */
function resolveHostTree() {
  fetch('/api/tree-meta')
    .then((r) => (r.ok ? r.json() : null))
    .then((meta: any) => {
      if (!meta) return;
      const treeId = resolveTreeIdByHost(location.host, meta);
      if (!treeId) return;
      // 已有内部路由（hash 模式 #/pages/... / history 模式 /pages/...）时不劫持
      const hashPath = location.hash.replace(/^#\/?/, '');
      if (hashPath.startsWith('pages/')) return;
      const pathname = location.pathname.replace(/\/+$/, '');
      if (pathname.startsWith('/pages/')) return;
      // 显式路径别名（如 /ji_23395_01、祖谱 /z/ji_23395）优先于子域
      if (CLAN_PATH_RE.test(pathname)) return;
      const m = pathname.match(/^\/([a-z0-9_]+)$/);
      if (m && !RESERVED_PATHS.has(m[1])) return;
      uni.reLaunch({ url: `/pages/hall/index?tree_id=${treeId}` });
    })
    .catch(() => {});
}

/** 按别名跳转家族树 / 祖谱首页（isClan=true 时地址栏保持 /z/<tree_id>） */
function openAlias(alias: string, isHash: boolean, isClan = false) {
  // 常见形态：path_alias 即 /tree_id（ji_23395_01）或祖谱 /z/ji_23395，按规则直接跳转，零等待
  let treeId = /^[a-z]+_\d+(?:_\d{2})?$/.test(alias) ? alias : '';
  if (!treeId) {
    fetch('/api/tree-meta')
      .then((r) => (r.ok ? r.json() : null))
      .then((meta: any) => {
        const entry: any = meta?.trees
          ? Object.values(meta.trees).find(
              (t: any) =>
                t.tree_id === alias ||
                (t.path_alias || '').replace(/^\/?(z\/)?/, '') === alias,
            )
          : null;
        const id = entry?.tree_id || '';
        if (id) gotoAlias(id, alias, isHash, isClan);
      })
      .catch(() => {});
    return;
  }
  gotoAlias(treeId, alias, isHash, isClan);
}

function gotoAlias(treeId: string, alias: string, _isHash: boolean, isClan = false) {
  // history 模式：hash 与 path 形态统一走 reLaunch（同文档 hash 变更不被 history 路由监听），
  // 再等待内部路由提交后把地址栏改写为可读 uri（_isHash 仅保留形参以兼容调用点）。
  uni.reLaunch({ url: `/pages/hall/index?tree_id=${treeId}` });
  const readablePath = treeId === MASTER_TREE_ID ? MASTER_PATH : isClan ? `/z/${alias}` : `/${alias}`;
  keepAliasUrl(alias, treeId, readablePath);
}

/**
 * 打开中华世本（总谱）首页：内部路由 + 地址栏改写为独立地址 /z/
 * （与 /z/ 直达、首页卡片点击同一条路径，保证「世本地址 /z/」口径一致）
 */
function openMasterHome() {
  uni.reLaunch({ url: `/pages/hall/index?tree_id=${MASTER_TREE_ID}` });
  keepMasterUrl();
}

/** 等待内部路由提交后把地址栏改写为 /z/（旧地址 /zhonghua 至此被替换掉） */
function keepMasterUrl(tries = 0) {
  if (
    location.pathname === '/pages/hall/index' &&
    location.search.includes('tree_id=' + MASTER_TREE_ID)
  ) {
    history.replaceState(history.state, '', MASTER_PATH);
    return;
  }
  if (tries < 30) {
    setTimeout(() => keepMasterUrl(tries + 1), 60);
  }
}

/** 等待内部路由提交后，把地址栏改写为可读 uri（/ji_23395_01 或祖谱 /z/ji_23395） */
function keepAliasUrl(alias: string, treeId: string, readablePath: string, tries = 0) {
  if (
    location.pathname === '/pages/hall/index' &&
    location.search.includes('tree_id=' + treeId)
  ) {
    history.replaceState(history.state, '', readablePath);
    return;
  }
  if (tries < 30) {
    setTimeout(() => keepAliasUrl(alias, treeId, readablePath, tries + 1), 60);
  }
}
// #endif

onLaunch(() => {
  console.log('家族历史数字馆 App Launch');
  // 必须在任何页面渲染前打标记：App.onLaunch 先于首屏页面 mount。
  // H5 才写 <html data-theme>（函数体内 #ifdef H5），小程序零改动。
  applyTheme();
  // #ifdef H5
  resolveTreeAlias();
  resolveHostTree();
  // 兜底：hash 形式别名（#/ji_23395_01）未命中内部路由时重定向
  uni.onPageNotFound(() => {
    // history 模式：以 pathname（去首尾斜杠后）兜底别名，形如 /ji_23395_01
    const seg = location.pathname.replace(/^\/+|\/+$/g, '');
    if (/^[a-z0-9_]+$/.test(seg) && !RESERVED_PATHS.has(seg)) {
      openAlias(seg, true);
    }
  });
  // #endif
});

onShow(() => {
  console.log('App Show');
});

onHide(() => {
  console.log('App Hide');
});
</script>

<style>
/* ---- H5 全站内容列（唯一宽度真源：--jiapu-column · Kevin 2026-10-17） ----
   只在 H5 生效（条件编译），小程序版式一字不动。改列宽**只改这一处**变量：
   页面主体列 / 底部 tabBar / 页面内 fixed 浮层（如首页浮动切换按钮）全部引用它。
   列宽 1440：**超宽屏（>1440）居中 1440，以下（≤1440）铺满视口**。
   母容器（uni-page-body / 各页 .container）**一律不设 overflow:hidden**，
   首页三层 banner 才能用 `width:100vw; margin-left:calc(50% - 50vw)` 出血到视口两边。 */
/* #ifdef H5 */
:root {
  --jiapu-column: 1440px;
}

/* 页面主体列：居中收窄，两侧露出页面底色 */
uni-page-body {
  max-width: var(--jiapu-column);
  margin-left: auto;
  margin-right: auto;
}

/* 底部 tabBar：uni-app H5 里**可见条是内层 `.uni-tabbar`**（它自己 `position:fixed;
   left/right: var(--window-*)` + `bottom:0`），外层 `uni-tabbar` 只是个 0 内容的壳
   ⇒ 列宽必须打在**内层**上，否则条子仍铺满整视口。
   ⚠ 绝不能用 `transform: translateX(-50%)` 居中外层：transform 会让外层成为内层 fixed 元素的
   **包含块** ⇒ 内层被定位到外层盒子的底部（实测视口 844 时整条 tabBar 落到 y=844，完全看不见）。
   这里只用 left/right 内缩，不产生新的包含块。 */
uni-tabbar.uni-tabbar-bottom .uni-tabbar {
  left: max(0px, calc((100vw - var(--jiapu-column)) / 2));
  right: max(0px, calc((100vw - var(--jiapu-column)) / 2));
}
/* #endif */

/* 全局样式 */
page {
  background-color: #EEF1EF;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  color: #333;
  font-size: 14px;
}

/* ---- H5 页面底色：青瓷纸色（Kevin 2026-10-17 视觉修正单「背景图片的范围扩大」/ 2026-10 换色）
   窄栏两侧原先露纯白/浅灰白、显空；改成与首页 banner 宣纸同族的青瓷纸 #EDF1EA，
   让三层 banner 自然「渗」到页面上。**只在 H5 生效（条件编译），小程序版式零改动**。
   ① html / body 管 1440px 列**之外**的两侧；② uni-page-body（= H5 里的 page）管列内。
   注意：`page` 选择器会被 uni-app 的 postcss 重写成 `uni-page-body`，两条都留以对齐。
   **必须写在上面的 `page` 基础规则之后**（同特异性，靠顺序覆盖）。 */
/* #ifdef H5 */
html,
body,
page,
uni-page-body {
  background-color: #EDF1EA;
}
/* #endif */

/* ---- TDesign 主题覆盖：古籍棕 ---- */
/* #ifdef H5 */
:root,
/* #endif */
page,
.page {
  --td-brand-color-1: #fdf6ec;
  --td-brand-color-2: #f9e8d0;
  --td-brand-color-3: #f0d0a8;
  --td-brand-color-4: #e4b27e;
  --td-brand-color-5: #d49355;
  --td-brand-color-6: #b06e33;
  --td-brand-color-7: #4E6B57;
  --td-brand-color-8: #7a3a0e;
  --td-brand-color-9: #5c2d0a;
  --td-brand-color-10: #2F3A33;

  --td-primary-color: #4E6B57;
  --td-primary-color-1: var(--td-brand-color-1);
  --td-primary-color-2: var(--td-brand-color-2);
  --td-primary-color-3: var(--td-brand-color-3);
  --td-primary-color-4: var(--td-brand-color-4);
  --td-primary-color-5: var(--td-brand-color-5);
  --td-primary-color-6: var(--td-brand-color-6);
  --td-primary-color-7: var(--td-brand-color-7);
  --td-primary-color-8: var(--td-brand-color-8);
  --td-primary-color-9: var(--td-brand-color-9);
  --td-primary-color-10: var(--td-brand-color-10);

  --td-success-color: #2e7d32;
  --td-warning-color: #e65100;
  --td-error-color: #c62828;
}

/* ---- 夜间模式（html[data-theme='dark']）全局落点 ----
   这里只放**不读 `--td-*` token 的硬编码色**：页面底色 / H5 页头 / 底部 tabBar / 滚动条。
   组件 token 在 `styles/td-dark-warm.css`（生成物）；页内硬编码色在各页 scoped <style> 的
   `html[data-theme='dark']` 段。全部 H5 条件编译 ⇒ 小程序零改动。
   tabBar / 页头的颜色是 uni-h5 用**内联 style** 打上去的（取自 pages.json 的 #ffffff / #EEF1EF），
   故这里的覆盖必须带 `!important`，否则被内联样式压住。 */
/* #ifdef H5 */
html[data-theme='dark'],
html[data-theme='dark'] body,
html[data-theme='dark'] page,
html[data-theme='dark'] uni-page-body {
  background-color: #1B2422 !important;
}
html[data-theme='dark'] page,
html[data-theme='dark'] uni-page-body { color: #DFE9E4 !important; }

/* H5 页头（导航条）：亮条 → 深暖底，标题/返回键转浅字 */
html[data-theme='dark'] uni-page-head .uni-page-head { background-color: #1E2825 !important; }
html[data-theme='dark'] uni-page-head .uni-page-head__title { color: #DFE9E4 !important; }
html[data-theme='dark'] uni-page-head .uni-page-head-btn { color: #DFE9E4 !important; }

/* 底部 tabBar：白底 → 深暖底；未选中 #A5B6AE、选中暖棕 #D9A96B（与夜间主色同族） */
html[data-theme='dark'] .uni-tabbar { background-color: #1E2825 !important; }
html[data-theme='dark'] .uni-tabbar-border { background-color: #36453F !important; }
html[data-theme='dark'] .uni-tabbar__label { color: #A5B6AE !important; }
html[data-theme='dark'] .uni-tabbar__item--active .uni-tabbar__label,
html[data-theme='dark'] .uni-tabbar__item-active .uni-tabbar__label { color: #D9A96B !important; }

/* 滚动条：只改颜色、**不改宽度**（改宽度会动几何，违反 T3 口径） */
html[data-theme='dark'] ::-webkit-scrollbar-thumb { background: rgba(223, 233, 228, 0.18); border-radius: 6px; }
html[data-theme='dark'] ::-webkit-scrollbar-thumb:hover { background: rgba(223, 233, 228, 0.32); }
html[data-theme='dark'] ::-webkit-scrollbar-track { background: #1E2825; }
/* #endif */

/* ---- 浅色（html[data-theme='light']）显式钉底 ----
   修 2026-10-17 实测 bug：日间模式（html[data-theme='light']）下 `body` 被涂成夜间底色 #1B2422，
   窄栏两侧/底部露出黑块（html 与 uni-page-body 均为 #EDF1EA，只有 body 错）。
   根因（产物取证）：uni-app H5 的 postcss 插件
   `@dcloudio/uni-cli-shared/dist/postcss/plugins/uniapp.js` → createBodyBackgroundRule()
   会把**任何含 `page` 选择器的规则**里的 background-* 声明克隆成一条**裸 `body{...}` 规则**
   （克隆时丢掉原选择器的全部前缀）。上面暗色块的 `html[data-theme='dark'] page` 因此被克隆成
   无条件的 `body{background-color:#1B2422}`，在产物里排在浅色 `body{#EDF1EA}` 之后
   ⇒ 与 data-theme 无关，body 恒为夜间色。
   对策（不改依赖）：① 浅色侧加 html[data-theme='light'] 前缀 + !important 显式钉住
   html / body / page / uni-page-body；② 暗色侧同法加 !important。两侧前缀选择器特异性
   (0,1,2) 都高于克隆出来的裸 `body`(0,0,1)，两态各自压得住那条泄漏规则。
   无 data-theme 的短暂首屏窗口：本块在暗色块之后，其克隆出的裸 `body` 也带 !important 且更晚
   ⇒ 落在暖纸色，与 theme.ts 的默认 light 一致。
   只写颜色、不动几何；整段 H5 条件编译 ⇒ 小程序零改动。 */
/* #ifdef H5 */
html[data-theme='light'],
html[data-theme='light'] body,
html[data-theme='light'] page,
html[data-theme='light'] uni-page-body {
  background-color: #EDF1EA !important;
  color: #2F3A33 !important;
}
/* #endif */

/* 声明文本样式 */
.disclaimer {
  font-size: 12px;
  color: #999;
  line-height: 1.6;
}
</style>
