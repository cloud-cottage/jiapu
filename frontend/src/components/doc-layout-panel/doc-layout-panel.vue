<template>
  <view class="doc-layout-panel">
    <view class="config-section">
      <text class="section-title">导出选项</text>

      <label class="option">
        <checkbox :checked="includePreface" @click="includePreface = !includePreface" />
        <text>谱序</text>
      </label>
      <label class="option">
        <checkbox :checked="includeTanghao" @click="includeTanghao = !includeTanghao" />
        <text>堂号</text>
      </label>
      <label class="option">
        <checkbox :checked="includeGeneration" @click="includeGeneration = !includeGeneration" />
        <text>字辈</text>
      </label>
      <label class="option">
        <checkbox :checked="includeLineage" @click="includeLineage = !includeLineage" />
        <text>世系图</text>
      </label>
      <label class="option">
        <checkbox :checked="includeBiography" @click="includeBiography = !includeBiography" />
        <text>人物小传</text>
      </label>
      <label class="option">
        <checkbox :checked="includeMigration" @click="includeMigration = !includeMigration" />
        <text>迁徙备注</text>
      </label>
    </view>

    <view class="preview-section">
      <text class="section-title">格式说明</text>
      <text class="desc">
        完整印刷级竖排中式族谱，使用 paged.js 渲染。
        包含谱序、堂号、字辈、世系、人物小传、迁徙备注等内容。
        竖排格式符合传统中式族谱排版规范。
      </text>
    </view>

    <t-button theme="primary" block class="export-btn" @click="doExport">生成并下载 PDF</t-button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ treeId?: string }>();

const includePreface = ref(true);
const includeTanghao = ref(true);
const includeGeneration = ref(true);
const includeLineage = ref(true);
const includeBiography = ref(true);
const includeMigration = ref(true);

function doExport() {
  // #ifdef H5
  // 使用 paged.js 渲染后导出 PDF
  uni.showToast({ title: 'PDF 生成中...', icon: 'loading' });
  // TODO: 调用 paged.js 渲染引擎
  // #endif

  // #ifdef MP-WEIXIN
  uni.showToast({ title: '请使用网页版导出', icon: 'none' });
  // #endif
}
</script>

<style scoped>
.config-section { margin-top: 4px; }
.section-title { font-size: 16px; font-weight: bold; color: #8B4513; display: block; margin-bottom: 12px; }
.option { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 14px; }
.preview-section { margin-top: 20px; padding: 16px; background: #FFF8E1; border-radius: 8px; }
.desc { font-size: 13px; color: #666; line-height: 1.6; display: block; }
.export-btn { margin-top: 24px; background: #8B4513; color: #fff; font-size: 16px; border-radius: 8px; }

/* ================= 夜间模式（html[data-theme='dark']）=================
   导出选项面板 = 纯配置 UI（无纸页本体：真正的 PDF 由 paged.js 另页渲染，本组件不出纸），
   故整体转暗：壳底由页面统一 #211A14、说明块 #241D16、主按钮 #C98850 + 深字 #211A14。
   只改颜色、零几何改动、无 filter / invert；全部 H5 条件编译 ⇒ 小程序零改动。 */
/* #ifdef H5 */
html[data-theme='dark'] .section-title { color: #C98850; }
html[data-theme='dark'] .option { color: #EDE3D6; }
html[data-theme='dark'] .preview-section { background: #241D16; }
html[data-theme='dark'] .desc { color: #B8A894; }
html[data-theme='dark'] .export-btn { background: #C98850; color: #211A14; }
/* #endif */
</style>
