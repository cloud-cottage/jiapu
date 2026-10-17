import { createSSRApp } from 'vue';
import App from './App.vue';

// TDesign 组件库样式（rpx 单位，与小程序一致）
import '@tdesign/uniapp/theme.css';
// 喰色 token 锁定：theme.css 的 prefers-color-scheme: dark 块会把文字色翻白（白字压米白底 →
// 输入内容与 placeholder 均不可见）。本站只做喰色主题，故在 dark 偏好下用 :root:root 钉回喰色值。
// 顺序不可反：必须晚于 theme.css 才能覆盖。
import '@/styles/td-light-pin.css';

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
