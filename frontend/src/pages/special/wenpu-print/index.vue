<template>
  <view class="wenpu-print">
    <!-- 屏上工具条（**打印时隐藏**）：主按钮 + 说明文案（逐字）—— 屏上导出视图即打印预览 -->
    <view class="print-toolbar">
      <view class="print-btn" @click="onPrint">
        <text class="print-btn-text">🖨 打印 / 保存为 PDF</text>
      </view>
      <text class="print-hint">A4 竖排 · 每张纸一张书页 · 在打印对话框里选「另存为 PDF」即可保存文件</text>
    </view>

    <!-- 文谱全书（**打印模式** `print-all`）：顺序渲染全部页（封面 / 修谱卷首 / 族務紀文 / 名录 /
         樂捐 / 后记 / 人物名录），每页一个 `@page A4` 分页容器；**页式模板与阅读器同一份**
         （本页不复制任何书页模板，只做薄壳）。 -->
    <WenpuBook :tree-id="treeId" print-all />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import WenpuBook from '@/components/wenpu-book/wenpu-book.vue';

/**
 * 【导出文谱 PDF】薄壳页（**仅 H5**，见 pages.json 的条件编译条目）：
 * 入口 = 在线文谱工具条「⋯ 更多 ⇒ 生成并下载 PDF」（文案一字不改）。
 * 路线 = **浏览器打印**：不引任何 PDF 库 / 不嵌字体 / 不新造排版 —— 屏上所见即打印所见，
 * 点主按钮调起浏览器打印对话框，选「另存为 PDF」即得文件。
 */

/** 家族树 id（`?tree_id=`；缺省空串 ⇒ 组件按无数据纸页渲染） */
const treeId = ref('');

onLoad((options): void => {
  treeId.value = (options && options.tree_id) || '';
});

/** 调起浏览器打印对话框（`window.print()` 仅 H5 存在；小程序不打包本页） */
function onPrint(): void {
  // #ifdef H5
  window.print();
  // #endif
}
</script>

<style scoped>
.wenpu-print {
  min-height: 100vh;
  padding: 12px;
  background: #fffdf8;
}

/* 屏上工具条：主按钮 + 一行说明（简体） */
.print-toolbar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 12px;
}
.print-btn {
  padding: 8px 16px;
  background: #8B4513;
  border-radius: 16px;
}
.print-btn-text { font-size: 14px; color: #fff; }
.print-hint { font-size: 12px; color: #8B4513; }

/* ================= 夜间模式（html[data-theme='dark']）=================
   本页 = 「文谱打印纸页」的外壳 + 屏上控制条。**纸页本体（wenpu-sheet 仿真古籍页面 /
   书口 / 版心 / 纸内文字）保持浅色原样**（它是古籍本体，反色就不是仿真书页了），只暗外壳与控制条：
   外壳底 #211A14、主按钮 #C98850 + 深字 #211A14、说明文字 #C4B4A0。只改颜色、零几何改动。
   注：夜间规则的特异性高于下方 `@media print` 里的同名选择器 ⇒ 必须显式钉回白纸，否则
   夜间模式下「打印 / 另存为 PDF」会打出深色页面。 */
/* #ifdef H5 */
html[data-theme='dark'] .wenpu-print { background: #211A14; }
html[data-theme='dark'] .print-btn { background: #C98850; }
html[data-theme='dark'] .print-btn-text { color: #211A14; }
html[data-theme='dark'] .print-hint { color: #C4B4A0; }
@media print {
  html[data-theme='dark'] .wenpu-print { background: #fff; }
}
/* #endif */

@media print {
  /* 工具条不打印（书页分页由组件内的 `@page` / `.print-sheet` 规则控制） */
  .print-toolbar { display: none !important; }
  /* 本页容器：去掉屏上留白 / 底色，避免多出空白纸 */
  .wenpu-print {
    min-height: 0;
    padding: 0;
    background: #fff;
  }
  /* uni H5 自带导航栏是 `position: fixed` 的页面外 DOM（含 44px 占位块）⇒ 打印时隐藏
     （`uni-page-head` 在页组件根之外，scoped 样式够不到 ⇒ 用 `:global()` 解除作用域） */
  :global(.uni-page-head),
  :global(.uni-page-head ~ .uni-placeholder) { display: none !important; }
}
</style>
