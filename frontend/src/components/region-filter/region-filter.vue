<template>
  <!-- 按地区筛选（单选胶囊；未选中＝描边「全部地区 ▾」，选中＝实心棕 + 地区名） -->
  <view class="region-bar">
    <view class="region-pill" :class="{ 'region-pill-active': !!modelValue }" @click="toggleMenu">
      <text class="region-pill-text">{{ pillText }}</text>
      <text class="region-pill-caret">▾</text>
    </view>

    <!-- 透明遮罩：点空白处收起（不占布局、不影响页面滚动区域） -->
    <view v-if="menuOpen" class="region-mask" @click="menuOpen = false"></view>

    <view v-if="menuOpen" class="region-menu">
      <view
        class="region-item"
        :class="{ 'region-item-current': modelValue === '' }"
        @click="pick('')"
      >
        <text class="region-item-name">{{ REGION_TEXT.all }}</text>
      </view>

      <view v-if="loading" class="region-tip">{{ REGION_TEXT.loading }}</view>
      <view v-else-if="error" class="region-tip region-tip-error">{{ error }}</view>
      <template v-else>
        <view
          v-for="opt in options"
          :key="opt.prefix"
          class="region-item"
          :class="{ 'region-item-current': modelValue === opt.prefix }"
          @click="pick(opt.prefix)"
        >
          <text class="region-item-name">{{ opt.name }}</text>
          <view class="region-item-counts">
            <text class="region-count">{{ REGION_TEXT.originUnit }} {{ opt.originCount }}</text>
            <text class="region-count">{{ REGION_TEXT.residenceUnit }} {{ opt.residenceCount }}</text>
          </view>
        </view>

        <!-- 伪地区「未登记」：两码数组皆空的树（与任何省份集合互斥） -->
        <view
          class="region-item region-item-last"
          :class="{ 'region-item-current': modelValue === REGION_UNREGISTERED }"
          @click="pick(REGION_UNREGISTERED)"
        >
          <text class="region-item-name">{{ REGION_TEXT.unregistered }}</text>
          <text class="region-count">{{ unregisteredCount }} {{ REGION_TEXT.treeUnit }}</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 首页「按地区筛选」胶囊 + 省级下拉（纯展示组件：数据与命中判定都在父页面 / `business/region-filter.ts`）。
 *
 * - 单选语义：一颗胶囊，未选中＝描边「全部地区 ▾」，选中＝实心棕 + 地区名（含伪地区「未登记」）；
 *   原稿第二颗「＋ 地区」胶囊因单选冗余不实现。
 * - `modelValue` 取值：`''`＝全部 / 2 位省前缀（如 `'37'`）/ `REGION_UNREGISTERED`。
 * - 列出的省**由码前缀聚合**，地区名一律码表反查（不手写名单）；每行右侧给「籍 N / 居 N」。
 * - 点胶囊时 emit `open`，由父页面负责按需加载 / 复用会话缓存（切换筛选不再发请求）。
 */
import { computed, ref } from 'vue';
import {
  REGION_TEXT,
  REGION_UNREGISTERED,
  regionOptionOf,
  type RegionProvinceOption,
} from '@/business';

const props = defineProps<{
  /** 当前选中值（'' / 2 位省前缀 / REGION_UNREGISTERED） */
  modelValue: string;
  /** 省级条目（父页面用会话缓存的 tree-index 聚合） */
  options: RegionProvinceOption[];
  /** 伪地区「未登记」的树数 */
  unregisteredCount: number;
  /** 索引加载中 */
  loading?: boolean;
  /** 索引加载失败文案（非空即展示，不静默吞） */
  error?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'open'): void;
}>();

const menuOpen = ref(false);

/** 胶囊文案：未选 → 「全部地区」；伪地区 → 「未登记」；省前缀 → 省名（码表反查失败时退回「全部地区」） */
const pillText = computed(() => {
  if (!props.modelValue) return REGION_TEXT.all;
  if (props.modelValue === REGION_UNREGISTERED) return REGION_TEXT.unregistered;
  return regionOptionOf(props.options, props.modelValue)?.name || REGION_TEXT.all;
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) emit('open');
}

function pick(value: string) {
  menuOpen.value = false;
  if (value !== props.modelValue) emit('update:modelValue', value);
}
</script>

<style scoped>
/* 一行不换行：胶囊 + 菜单（菜单绝对定位，不参与行宽计算，故永不溢出 / 换行） */
.region-bar {
  position: relative;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  min-height: 36px;
}

/* 胶囊：未选中＝暖米底 + 暖棕描边；选中＝实心棕 + 白字（与排序 pill 同族） */
.region-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 14px;
  background: #FFFDF8;
  border: 1px solid #E0D5C8;
  border-radius: 999px;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
.region-pill-active {
  background: #8B4513;
  border-color: #8B4513;
}
.region-pill-text {
  font-size: 13px;
  color: #8B4513;
  white-space: nowrap;
}
.region-pill-active .region-pill-text { color: #fff; }
.region-pill-caret { font-size: 11px; line-height: 1; color: #8B4513; }
.region-pill-active .region-pill-caret { color: #fff; }

.region-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 940;
  background: transparent;
}

/* 下拉：贴在胶囊下方（绝对定位 → 不改变页面高度、不产生横向溢出） */
.region-menu {
  position: absolute;
  top: 40px;
  left: 0;
  z-index: 945;
  width: 240px;
  max-height: 56vh;
  overflow-y: auto;
  background: #FFFDF8;
  border: 1px solid #E0D5C8;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(62, 39, 35, 0.14);
  padding: 4px 0;
}
.region-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 40px;
  padding: 6px 14px;
  box-sizing: border-box;
}
.region-item-current { background: #FBF3E9; }
.region-item-last { border-top: 1px solid #F0E8DE; }
.region-item-name {
  font-size: 13px;
  color: #3E2723;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.region-item-counts { display: inline-flex; gap: 6px; flex: 0 0 auto; }
.region-count {
  font-size: 11px;
  color: #A1887F;
  white-space: nowrap;
}
.region-tip {
  padding: 14px 14px;
  font-size: 12px;
  color: #A1887F;
  text-align: center;
}
.region-tip-error { color: #C62828; }

@media (max-width: 370px) {
  .region-menu { width: 220px; }
}
</style>
