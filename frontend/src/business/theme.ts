import { ref } from 'vue';

/**
 * 日夜模式（Kevin 2026-10-17 直接下令）：两态 `light` / `dark`，**不跟随系统**。
 *
 * 为什么要「不跟随系统」：`styles/td-light-pin.css` 已经在 `@media (prefers-color-scheme: dark)`
 * 下把 136 条 `--td-*` 钉回喰色值（docs/theme-light-pin.spec.md §3）——系统深色偏好下的既有观感
 * 必须保持「与浅色完全一致」。若这里改成跟随系统，系统深色用户会突然落到另一套色板，
 * 属未经验收的观感变化。故：**默认 light，只认用户显式选择**（本地持久化）。
 *
 * 落点（spec §3-2 的技术事实，继续有效）：H5 里 token 的实际翻转点是 `<uni-page-body>`，
 * 不是 `<html>`；所以这里只在 `<html>` 上打 `data-theme` 标记，**由
 * `styles/td-dark-warm.css` 的选择器组把值打到 `:root` / `page` / `uni-page-body` / `.page`
 * 四个落点**（选择器含 `html[data-theme='dark']` 前缀，特异性压过 light-pin 的 `:root:root`）。
 *
 * 平台：`document` 相关代码全在 `#ifdef H5` 内 ⇒ **小程序零改动**（mp 分支只剩读写 storage）。
 *
 * **响应式信号 `themeRef`**（夜间模式 §canvas）：CSS 面靠 `data-theme` 属性自动翻转，但 **canvas /
 * ECharts 等「非 CSS」绘制面读不到 CSS 变量**（颜色写在 JS option 里）⇒ 需要一条可在 JS 里
 * `watch` 的响应式主题信号。`themeRef` 就是这条信号：初值 = `getTheme()`（storage 真源），
 * `setTheme()` 写 storage 后同步更新 ⇒ 组件 `watch(themeRef)` 即可就地重建绘制参数。
 * 不写 DOM 属性 ⇒ **小程序端同样可读**（那端没有 `data-theme`）。
 */
export type ThemeMode = 'light' | 'dark';

/** 本地持久化键（`uni.setStorageSync` 的 key） */
const STORAGE_KEY = 'jiapu_theme';

/** 默认 = 浅色（= 本站在系统浅色偏好下的既有观感） */
const DEFAULT_MODE: ThemeMode = 'light';

/** 读当前模式：非法/未设置一律回退 `light`（不跟随系统） */
export function getTheme(): ThemeMode {
  try {
    const v = uni.getStorageSync(STORAGE_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch (e) {
    return DEFAULT_MODE;
  }
}

/**
 * 响应式主题信号（唯一真源 = storage，初值取 `getTheme()`）。
 *
 * - 组件侧：`watch(themeRef, () => { /* 重建 canvas 绘制参数 *\/ })`；
 * - 只读用：`themeRef.value === 'dark'`；
 * - 写入一律走 `setTheme()`（内部同步本 ref），**不要直接给 `themeRef.value` 赋值**，
 *   否则会与 storage / `<html data-theme>` 不一致（刷新后回弹）。
 * - `ref` 来自 vue：H5 / 小程序两端行为一致，不依赖 `document`。
 */
export const themeRef = ref<ThemeMode>(getTheme());

/**
 * 把模式应用到 `<html>`：`data-theme` 属性 + `color-scheme`（后者让浏览器自带的滚动条 /
 * 表单控件 / 系统 UI 跟随，避免深色页面里出现一条亮白滚动槽）。
 * 只打标记、不写任何语义值 —— 值全部在 `styles/td-dark-warm.css` 里（生成物）。
 */
export function applyTheme(mode: ThemeMode = getTheme()): void {
  // #ifdef H5
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode;
  // #endif
}

/** 切换并持久化（幂等）：先落盘再应用，刷新后 `getTheme()` 读回同一值 */
export function setTheme(mode: ThemeMode): void {
  try {
    uni.setStorageSync(STORAGE_KEY, mode);
  } catch (e) {
    /* 隐私模式 / 配额满：应用照做，只是不持久（不阻断用户操作） */
  }
  applyTheme(mode);
  // 响应式信号同步（canvas 类绘制面靠它重建颜色；CSS 面已经由 data-theme 翻好）
  themeRef.value = mode;
}
