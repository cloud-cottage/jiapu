<template>
  <view class="page-root">
    <!-- 未登录 -->
    <view v-if="!isAuthenticated()" class="container">
      <view class="empty-state">
        <text class="empty-icon">🌳</text>
        <text class="empty-text">登录后查看您加入的家族树</text>
        <t-button theme="primary" size="small" @click="goLogin">去登录</t-button>
      </view>
    </view>

    <!-- 已登录但未绑定 -->
    <view v-else-if="!anchor" class="container">
      <view class="empty-state">
        <text class="empty-icon">🏡</text>
        <text class="empty-text">您尚未加入任何家族树</text>
        <text class="empty-sub">加入后这里将显示您家族树的世系与档案</text>
        <t-button theme="primary" size="small" @click="goHome">去家谱列表加入</t-button>
      </view>
    </view>

    <!--
      已绑定：整页只渲染同一份 <TreeHall>（单真源，禁止复制第二份模板 ——
      docs/home-sort-search.spec.md §11）；:key 绑定 tree_id（换树触发子树重建）、
      sync-nav-title 传 false（导航栏标题由 pages.json 决定，本页不调 setNavigationBarTitle）；
      未登录 / 未绑定走上面两组空态。
    -->
    <TreeHall
      v-else
      :key="boundTreeId"
      :tree-id="boundTreeId"
      :sync-nav-title="false"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { isAuthenticated, getAuthToken } from '@/business/auth';
import { fetchMyAnchor } from '@/business';
import TreeHall from '@/components/tree-hall/tree-hall.vue';

const anchor = ref<{ tree_id: string; person_handle: string; updated_at: string } | null>(null);

/** 锚点所在家族树（空串 = 未加入，不渲染家族树内容） */
const boundTreeId = computed(() => anchor.value?.tree_id || '');

/**
 * 解析锚点树：tab 页没有 onLoad 参数，故按登录态拉 /admin/get-anchor。
 * 取不到（无 token / 未加入 / 请求失败）保持 null ⇒ 渲染未加入空态。
 */
async function loadMyTree() {
  const token = getAuthToken();
  if (!token) {
    anchor.value = null;
    return;
  }
  try {
    anchor.value = await fetchMyAnchor(token);
  } catch {
    /* 读不到绑定状态：保持上一次结果（首次即 null ⇒ 空态），不打扰用户 */
  }
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function goHome() {
  uni.switchTab({ url: '/pages/index/index' });
}

onMounted(loadMyTree);
// tabbar 页面切换回来时刷新（绑定状态可能变化；换树时 :key 变化触发子树重建）
onShow(() => {
  void loadMyTree();
});
</script>

<style scoped>
/* 底部安全间距（**仅 H5**）：本页根容器包住三态（未登录空态 / 未加入空态 / TreeHall），
   tabBar 是 `position:fixed` 的 50px 条（+ 刘海屏安全区）⇒ 根容器自身留
   「50px + env(safe-area-inset-bottom) + 12px」，滚到底时最后一块内容不会被 tabBar 压住。
   只加底内距：内容位置/尺寸/间距不动；仅 H5 生效 ⇒ 小程序零改动。 */
/* #ifdef H5 */
.page-root { padding-bottom: calc(50px + env(safe-area-inset-bottom, 0px) + 12px); }
/* #endif */

.container { padding: 20px; padding-bottom: 40px; }

/* 空态 */
.empty-state {
  text-align: center; padding: 80px 30px;
}
.empty-icon { font-size: 48px; display: block; }
.empty-text { font-size: 16px; color: #2F3A33; display: block; margin: 14px 0 6px; }
.empty-sub { font-size: 12px; color: #999; display: block; margin-bottom: 18px; }

/* ---- 夜间模式（html[data-theme='dark']）：本页两组空态文案 ----
   已绑定态整页由 tree-hall 渲染，暗色落在组件内；本页只管未登录 / 未加入两组空态。
   只改颜色；H5 条件编译 ⇒ 小程序零改动。 */
/* #ifdef H5 */
html[data-theme='dark'] .empty-text { color: #DFE9E4; }
html[data-theme='dark'] .empty-sub { color: #7A8B83; }
/* #endif */
</style>
