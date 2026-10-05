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
</style>
