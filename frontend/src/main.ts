import { createSSRApp } from 'vue';
import App from './App.vue';

// TDesign 组件库样式（rpx 单位，与小程序一致）
import '@tdesign/uniapp/theme.css';

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
