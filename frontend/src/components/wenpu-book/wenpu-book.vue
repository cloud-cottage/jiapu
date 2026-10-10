<template>
  <view class="wenpu-book">
    <!-- 工具条（书页上方一行）：PDF 导出弱化收进右侧「⋯ 更多」菜单 -->
    <view class="book-toolbar">
      <view class="toolbar-more" @click="menuOpen = !menuOpen">
        <text class="toolbar-more-text">⋯ 更多</text>
      </view>
      <view v-if="menuOpen" class="more-menu">
        <view class="more-item" @click="onPdfExport">
          <text class="more-item-text">生成并下载 PDF</text>
        </view>
      </view>
    </view>

    <!-- 纸页外提示（简体）：加载中 / 读取失败 -->
    <view v-if="loading" class="book-tip">加载中...</view>
    <view v-else-if="loadError" class="book-tip book-error">{{ loadError }}</view>

    <!-- 窄屏不得压缩书页 ⇒ 外层横向滚动容器，纸页居中 -->
    <scroll-view v-else class="book-scroll" scroll-x :show-scrollbar="false">
      <view class="book-scroll-inner">
        <view class="book-page" :class="flipClass">
          <!-- 书口（左 / 右）：文案已是繁体、视图层零字形转换；空串 ⇒ 整条不渲染 -->
          <view v-if="leftLabel" class="side-label side-label-left">
            <text class="side-label-text">{{ leftLabel }}</text>
          </view>
          <view v-if="rightLabel" class="side-label side-label-right">
            <text class="side-label-text">{{ rightLabel }}</text>
          </view>

          <!-- 4 行（1 行 = 1 人）：行内最多 30 栏、从右往左排、未满右起留空 -->
          <view class="book-rows">
            <view
              v-for="(row, ri) in rows"
              :key="ri"
              class="book-row"
              :class="{ 'row-first': ri === 0 }"
            >
              <template v-if="row">
                <view
                  v-for="(col, ci) in row.cols"
                  :key="ci"
                  class="book-col"
                  :class="{ 'name-col': col.isName }"
                >
                  <text class="col-text">{{ col.text }}</text>
                </view>
              </template>
            </view>
          </view>

          <!-- 纸面内空态（繁体） -->
          <view v-if="isEmpty" class="book-empty">
            <text class="book-empty-text">暫無譜文</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 翻页控件（纸页外 · 文案简体）：左 = 后叶（下一页）、右 = 前叶（上一页）；首 / 末页对应按钮禁用 -->
    <view v-if="showPager" class="pager">
      <view class="pager-btn" :class="{ disabled: !canNext }" @click="nextPage">
        <text class="pager-btn-text">◀ 后叶</text>
      </view>
      <text class="page-indicator">叶 {{ pageIndex + 1 }} / {{ totalPages }}</text>
      <view class="pager-btn" :class="{ disabled: !canPrev }" @click="prevPage">
        <text class="pager-btn-text">前叶 ▶</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
// #ifdef H5
import { getCurrentInstance, onUnmounted } from 'vue';
// #endif
import { buildWenpuBook } from '@/business/wenpu';
import type { WenpuBook, WenpuPage, WenpuRow } from '@/business/wenpu';

const props = withDefaults(defineProps<{ treeId?: string }>(), { treeId: '' });

const book = ref<WenpuBook | null>(null);
const loading = ref(false);
const loadError = ref('');
/** 翻页状态由视图层持有；**分页本身由数据层完成**（每页恒 4 行） */
const pageIndex = ref(0);
/** 工具条「⋯ 更多」菜单开合 */
const menuOpen = ref(false);
/** 翻页动效 class：''（静止）/ 'flip-next'（后叶 · 向左翻）/ 'flip-prev'（前叶 · 向右翻） */
const flipClass = ref<'' | 'flip-next' | 'flip-prev'>('');
/** 动效时长（ms）：与 style 内 keyframes 的 300ms 对齐，略留余量后清 class */
const FLIP_MS = 320;
let flipTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 触发一次「拟翻书」翻页动效：**仅真翻页时**调用 —— 边界守卫在 `prevPage()` / `nextPage()` 内（首页再往前 /
 * 末页再往后不进函数体）⇒ 边界自然不播；首次加载与换树 `load()` 直接写 `pageIndex` ⇒ 也不播。
 * 同一方向连续翻页：先把 class 清空、下一帧再挂上（Vue 批处理下同值不重触发动画）；到时清 class
 * ⇒ 静止态不残留动画 class 与内联 transform（回未旋转、不透明）。
 * 实现 = `@keyframes` + class 切换（H5 与小程序 wxss 两端同源支持；**不用** Vue `<transition>` 包元素）。
 */
function playFlip(dir: 'flip-next' | 'flip-prev') {
  if (flipTimer) {
    clearTimeout(flipTimer);
    flipTimer = null;
  }
  flipClass.value = '';
  nextTick(() => {
    flipClass.value = dir;
    flipTimer = setTimeout(() => {
      flipClass.value = '';
      flipTimer = null;
    }, FLIP_MS);
  });
}

const pages = computed<WenpuPage[]>(() => book.value?.pages || []);
const totalPages = computed(() => pages.value.length);
const currentPage = computed<WenpuPage | null>(() => pages.value[pageIndex.value] || null);
/** 当前页的 4 行（数据层保证长度恒 4，不足为 null） */
const rows = computed<(WenpuRow | null)[]>(() => currentPage.value?.rows || []);
/** 书口文案已是繁体，视图层零字形转换 */
const leftLabel = computed(() => currentPage.value?.leftLabel || '');
const rightLabel = computed(() => currentPage.value?.rightLabel || '');
/** 空谱：纸面内显示繁体空态 */
const isEmpty = computed(() => !loading.value && !loadError.value && book.value?.empty === true);
/** 翻页控件仅在读成功、有页可翻时出现 */
const showPager = computed(
  () => !loading.value && !loadError.value && !isEmpty.value && totalPages.value > 0,
);
/** 首 / 末页禁用判据 */
const canPrev = computed(() => pageIndex.value > 0);
const canNext = computed(() => pageIndex.value < totalPages.value - 1);

async function load() {
  if (!props.treeId) return;
  loading.value = true;
  loadError.value = '';
  book.value = null;
  try {
    const result = await buildWenpuBook(props.treeId);
    // 数据层已区分「读失败」与「真·无人物」：读失败 ⇒ 走**纸外**失败提示、纸内不渲染空态
    if (result?.error) {
      loadError.value = '谱文读取失败';
      return;
    }
    book.value = result;
    pageIndex.value = 0;
  } catch {
    // 兜底（理论上数据层已消化）：同样按读失败处理，不落空态文案
    loadError.value = '谱文读取失败';
  } finally {
    loading.value = false;
  }
}

function prevPage() {
  if (!canPrev.value) return;
  pageIndex.value -= 1;
  playFlip('flip-prev');
}

function nextPage() {
  if (!canNext.value) return;
  pageIndex.value += 1;
  playFlip('flip-next');
}

/** PDF 导出（弱化入口）：保持既有 stub，不新增 PDF 渲染引擎 */
function onPdfExport() {
  menuOpen.value = false;

  // #ifdef H5
  uni.showToast({ title: 'PDF 生成中...', icon: 'loading' });
  // #endif

  // #ifdef MP-WEIXIN
  uni.showToast({ title: '请使用网页版导出', icon: 'none' });
  // #endif
}

onMounted(load);
// 组件内不得使用页面生命周期（onLoad / onShow 仅页面可用）：换树由 prop 驱动
watch(
  () => props.treeId,
  () => {
    menuOpen.value = false;
    load();
  },
);
// ---------------- H5 键盘左右键翻页 ----------------
// #ifdef H5
/**
 * 组件根元素（H5 DOM）。uni `<view>` 在 H5 是**渲染 `<uni-view>` 的组件**（`@dcloudio/uni-h5`），
 * `<script setup>` 里拿不到元素本身 ⇒ 与 `asset-inventory.vue` 的 `domMeasureRoot()` 同法取实例 `$el`
 * （本组件单根元素 ⇒ `$el` 即 `.wenpu-book`）。实例必须在 **setup 期就捕获**：DOM 事件回调触发时
 * `getCurrentInstance()` 已无活动实例。取不到 ⇒ 返回 null，调用方直接 return。
 */
const inst = getCurrentInstance();
function bookRootEl(): Element | null {
  const el: any = inst?.proxy?.$el;
  return el && el.nodeType === 1 ? el : null;
}

/**
 * 键盘翻页：`ArrowLeft` = 后叶（下一页）、`ArrowRight` = 前叶（上一页）。以下条件**同时**为真才响应：
 * 1. 根元素可见（`getBoundingClientRect()` 宽 > 0 且高 > 0）——本组件虽由 `tree-hall` 以 `v-if` 链渲染，
 *    但宿主页被 keep-alive 缓存 / 页被隐藏时监听仍挂着，须防「幽灵响应」；
 * 2. `showPager` 为真（加载中 / 谱文读取失败 / 空谱「暫無譜文」/ 无页 ⇒ 一律不响应）；
 * 3. 键恰为 `ArrowLeft` / `ArrowRight`；
 * 4. 无修饰键（避开 Alt+← 浏览器后退、macOS Cmd+←/→ 行首行尾等冲突）；
 * 5. 焦点不在可编辑元素上（INPUT / TEXTAREA / SELECT / contentEditable）。
 * 翻页**一律复用既有 `prevPage()` / `nextPage()`**（边界行为与按钮逐字一致：首页 ← 无操作、末页 → 无操作）；
 * `preventDefault()` **只在本次真的发生翻页时**调用，边界与不响应情形一律不拦截。
 * 长按 key repeat 按浏览器节奏逐次翻页，不做去抖。
 * 已知可接受（本批不处理）：页面遮罩弹窗（申请加入 / 编辑 / 认祖等）打开时，层下文谱仍会按键翻页（用户看不见）。
 */
function onKeydown(event: KeyboardEvent) {
  const root = bookRootEl();
  if (!root) return;
  const rect = root.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  if (showPager.value !== true) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const target = event.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (target.isContentEditable === true) return;
  }
  if (event.key === 'ArrowLeft') {
    if (!canNext.value) return;
    event.preventDefault();
    nextPage();
    return;
  }
  if (!canPrev.value) return;
  event.preventDefault();
  prevPage();
}

// handler 为具名同一引用 ⇒ 解绑必然命中（不得用匿名函数包一层）
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
// #endif
</script>

<style scoped>
.wenpu-book { width: 100%; }

/* 工具条（书页上方一行）：右侧「⋯ 更多」入口 */
.book-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.toolbar-more {
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 14px;
}
.toolbar-more-text { font-size: 12px; color: #8B4513; }
/* 展开的小菜单：PDF 导出为次级 / 弱化样式 */
.more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 20;
  min-width: 148px;
  margin-top: 4px;
  padding: 4px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}
.more-item { padding: 8px 10px; }
.more-item-text { font-size: 12px; color: #999; }

/* 纸页外提示（简体） */
.book-tip { padding: 16px 0; text-align: center; color: #999; font-size: 13px; }
.book-error { color: #C62828; }

/* 外层横向滚动容器：窄屏不压缩书页（纸页恒 960 × 720） */
.book-scroll { width: 100%; }
.book-scroll-inner {
  display: inline-flex;
  justify-content: center;
  min-width: 100%;
}

/* 纸页：固定 960 × 720、背景 #F7F3E8、1px #222、padding 17px 40px
   （上下 17px ⇒ 内容高 = 720 − 34 − 2 = 684；4 行含 3 条 1px 行线 ⇒ 行内容高 = (684−3)/4 = 170.25px
    > 10 字 × 17px = 170px，留 0.25px 余量防亚像素 / 字体回退再折行；左右 40px 不变） */
.book-page {
  position: relative;
  box-sizing: border-box;
  width: 960px;
  height: 720px;
  padding: 17px 40px;
  background: #F7F3E8;
  border: 1px solid #222;
  font-family: "Noto Serif TC", SimSun, serif;
}

/* 「拟翻书」翻页动效（轻微、有方向感）：纯 CSS @keyframes + class 切换，H5 与小程序两端同源支持
   （**不用** Vue <transition> 包元素，小程序不支持）。
   方向映射：后叶（下一页）⇒ 纸页「向左翻」；前叶（上一页）⇒「向右翻」。绕纸页竖直轴 rotateY + perspective
   卷动，叠加小幅横向位移与淡出 / 淡入 ⇒ 即便个别小程序内核不认 3D 变换，位移 + 透明度仍能表达方向
   （等价 2.5D，不静默降级成无动画）。幅度轻微：旋转峰值 16deg、位移 8px；总时长 300ms、ease-out；
   结束回 rotateY(0) / opacity 1 ⇒ 静止态外观与改动前一致（class 由 playFlip() 在 320ms 后清掉）。 */
@keyframes wenpu-flip-next {
  0% { transform: perspective(1200px) rotateY(0deg) translateX(0); opacity: 1; }
  40% { transform: perspective(1200px) rotateY(-16deg) translateX(-8px); opacity: 0.72; }
  100% { transform: perspective(1200px) rotateY(0deg) translateX(0); opacity: 1; }
}
@keyframes wenpu-flip-prev {
  0% { transform: perspective(1200px) rotateY(0deg) translateX(0); opacity: 1; }
  40% { transform: perspective(1200px) rotateY(16deg) translateX(8px); opacity: 0.72; }
  100% { transform: perspective(1200px) rotateY(0deg) translateX(0); opacity: 1; }
}
.book-page.flip-next { animation: wenpu-flip-next 300ms ease-out; }
.book-page.flip-prev { animation: wenpu-flip-prev 300ms ease-out; }

/* 书口：绝对定位、竖排、12px、字间距 2px、#333 */
.side-label {
  position: absolute;
  top: 40px;
  font-size: 12px;
  letter-spacing: 2px;
  color: #333;
  writing-mode: vertical-rl;
}
.side-label-left { left: 6px; }
.side-label-right { right: 6px; }

/* 4 行：纵向 4 等分；行间 1px #111 上边框（首行无） */
.book-rows { height: 100%; display: flex; flex-direction: column; }
.book-row {
  flex: 1;
  display: flex;
  flex-direction: row-reverse;
  justify-content: flex-start;
  align-items: stretch;
  overflow: hidden;
  border-top: 1px solid #111;
}
.row-first { border-top: none; }

/* 栏：一个竖条恰好容 10 字（17px × 10 = 170px）；栏间 1px #111 左边框 */
.book-col {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 17px;
  line-height: 1.0;
  padding: 0 1px;
  border-left: 1px solid #111;
  height: 100%;
  white-space: nowrap;
}
/* 栏内**文本节点**强制单行（兜底）：
   H5 下 `<text>` 渲染为 `<uni-text class="col-text"><span>…</span></uni-text>`，而 uni-app 基础样式
   `uni-text { white-space: pre-line }` 直接落在该元素 / 文本节点上，会把 `.book-col` 的 `nowrap` 覆盖掉
   ⇒ 满 10 字（170px）时按 9+1 折行（栏宽 20 → 37px、行盒 2）。此处把 nowrap 直接施到可直接作用的元素
   （uni `<text>` 本身 + 内层 `span`），小程序端 `<text>` 无内层 span，同样按第一条命中生效。 */
.book-col .col-text,
.book-col .col-text :deep(span) {
  white-space: nowrap;
}
/* 名称栏：稍大 + 粗体，仍为一栏 */
.name-col { font-size: 20px; font-weight: bold; }

/* 纸面内空态（繁体） */
.book-empty {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.book-empty-text { font-size: 22px; color: #555; letter-spacing: 4px; }

/* 翻页控件（纸页外 · 简体） */
.pager { display: flex; justify-content: center; gap: 20px; margin-top: 16px; font-size: 16px; }
.pager-btn {
  padding: 6px 18px;
  background: #F7F3E8;
  border: 1px solid #222;
}
.pager-btn.disabled { opacity: 0.4; }
.pager-btn-text { font-size: 16px; color: #111; }
.page-indicator { align-self: center; font-size: 18px; color: #111; }
</style>
