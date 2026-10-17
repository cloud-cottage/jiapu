<template>
  <view class="container">
    <text class="title">族谱 PDF 导出</text>
    <text class="tree-id">Tree: {{ treeId }}</text>
    <DocLayoutPanel :tree-id="treeId" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import DocLayoutPanel from '@/components/doc-layout-panel/doc-layout-panel.vue';

const treeId = ref('');

onLoad((options: any) => {
  treeId.value = options?.tree_id || '';
});
</script>

<style scoped>
.container { padding: 20px; }
.title { font-size: 20px; font-weight: bold; display: block; text-align: center; }
.tree-id { font-size: 12px; color: #aaa; display: block; text-align: center; margin-top: 4px; }

/* ================= 夜间模式（html[data-theme='dark']）=================
   本页 = 导出配置外壳（无纸页本体：PDF 由 paged.js 另页渲染），故整体转暗：
   标题 #EDE3D6、副行 #8A7A66；外壳底由页面统一 #211A14，面板颜色见 doc-layout-panel。
   只改颜色、零几何改动、无 filter / invert；H5 条件编译 ⇒ 小程序零改动。 */
/* #ifdef H5 */
html[data-theme='dark'] .title { color: #EDE3D6; }
html[data-theme='dark'] .tree-id { color: #8A7A66; }
/* #endif */
</style>
