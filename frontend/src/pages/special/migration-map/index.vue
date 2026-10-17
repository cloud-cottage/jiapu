<template>
  <view class="mig-page">
    <!-- #ifdef H5 -->
    <MigrationMapH5 v-if="treeId" :tree-id="treeId" />
    <view v-else class="center"><text class="center-txt">未指定家族树</text></view>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <view class="center"><text class="center-txt">请在网页版查看迁徙地图</text></view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
// #ifdef H5
import MigrationMapH5 from './MigrationMapH5.vue';
// #endif

/** 家族树 id（入口 = 家族树页右浮菜单「🗺️ 迁徙地图」，`?tree_id=`） */
const treeId = ref('');

onLoad((options): void => {
  treeId.value = (options && options.tree_id) || '';
});
</script>

<style scoped>
.mig-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fffdf8;
}
.center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.center-txt {
  font-size: 15px;
  color: #6d6055;
}

/* ================= 夜间模式（html[data-theme='dark']）=================
   迁徙地图页外壳（地图底图/面/标签 = 图像本体，由 MigrationMapH5 内部 :deep 规则维持浅色，
   本页不碰）：外壳底 #211A14、占位文字 #B8A894。只改颜色、零几何改动；H5 条件编译。 */
/* #ifdef H5 */
html[data-theme='dark'] .mig-page { background: #211A14; }
html[data-theme='dark'] .center-txt { color: #B8A894; }
/* #endif */
</style>
