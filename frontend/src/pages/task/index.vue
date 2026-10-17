<template>
  <view class="task-page">
    <view class="tp-head">
      <text class="tp-title">领取今日奖励</text>
      <text class="tp-sub">每日任务 · 北京时间自然日重置 · 每条每日可领 1 次</text>
    </view>
    <!-- 与家谱页 tab「领取今日奖励」面板**同一份组件**（单真源；本页为子包独立入口） -->
    <TaskList />
  </view>
</template>

<script setup lang="ts">
import TaskList from '@/components/task-center/task-list.vue';
</script>

<style scoped>
.task-page { padding: 16px 0 40px; }
.tp-head { padding: 0 16px; }
.tp-title { font-size: 16px; font-weight: bold; color: #3E2723; letter-spacing: 2px; }
.tp-sub { display: block; margin-top: 6px; font-size: 11px; color: #B5A594; }

/* ================= 夜间模式（html[data-theme='dark']）=================
   本页只负责**自己的页头**（`.tp-title` / `.tp-sub`）；任务卡本体的暗色规则已下沉到
   `components/task-center/task-list.vue` 自身（实现处拥有自己的暗色，页面不再用 `:deep()` 穿透）。
   色板同 styles/td-dark-warm.css（主字 #EDE3D6 / 次字 #8A7A66）。
   **只改颜色**，零布局属性、零 `filter` / `invert`；H5 条件编译 ⇒ 小程序端零改动。 */
/* #ifdef H5 */
html[data-theme='dark'] .tp-title { color: #EDE3D6; }
html[data-theme='dark'] .tp-sub { color: #8A7A66; }
/* #endif */
</style>
