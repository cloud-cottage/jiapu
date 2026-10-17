import { createSSRApp } from 'vue';
import App from './App.vue';

// TDesign 组件库样式（rpx 单位，与小程序一致）
import '@tdesign/uniapp/theme.css';

/*
 * 主题 token 补丁层 —— **H5 专用**（外围 `#ifdef H5` 条件编译，勿在本注释里写条件编译指令字面量：
 * 两份文件都建立在 H5 才有的机制上，小程序端无用且白占主包字节：
 *   · td-light-pin.css → `@media (prefers-color-scheme: dark)` 钉回喰色（小程序无系统偏好通道，
 *     app.json 也未开 `darkmode`，该块永不可达；实测 mp 产物里本文件已被编译器整块丢弃）；
 *   · td-dark-warm.css → `html[data-theme='dark']` 暖调 token 表（小程序没有 html 根节点与 data-theme 标记）。
 * 顺序不可反：light-pin 先（钉喰色、特异性低），dark-warm 后（夜间、特异性高）。
 * 夜间态由暗色标记驱动，标记本身也只在 H5 打（business/theme.ts）。
 */
// #ifdef H5
// 喰色 token 锁定：theme.css 的 prefers-color-scheme: dark 块会把文字色翻白（白字压米白底 →
// 输入内容与 placeholder 均不可见）。本站只做喰色主题，故在 dark 偏好下用 :root:root 钉回喰色值。
// 顺序不可反：必须晚于 theme.css 才能覆盖。
import '@/styles/td-light-pin.css';
// 夜间模式暖调 token 表（生成物 · 勿手改；生成器 scripts/gen-td-dark-warm.py）。
// 只在 html[data-theme='dark'] 下生效，选择器带 html[...] 前缀 ⇒ 特异性高于上面的 light-pin（含包
// uni-page-body:not(#jp-theme-pin) 的 (1,0,1)），故夜间能压过 light-pin 的喰色钉值。
// 顺序不可反：必须晚于 td-light-pin.css（同源 token，靠特异性 + 后置双保险）。
import '@/styles/td-dark-warm.css';
// #endif

// #ifdef H5
import { applySeo } from '@/business/seo';
// #endif

export function createApp() {
  const app = createSSRApp(App);
  // #ifdef H5
  // 全局混入：所有页面 onShow 时按当前路由刷新 SEO 标题 / 关键词（仅 H5 生效）
  app.mixin({
    onShow() {
      applySeo();
    },
  });
  // #endif
  return { app };
}
