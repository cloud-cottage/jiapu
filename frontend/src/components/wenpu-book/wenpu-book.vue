<template>
  <view class="wenpu-book">
    <!-- 工具条（书页上方一行）：PDF 导出弱化收进右侧「⋯ 更多」菜单。
         **打印模式（`printAll` true）整条不渲染** ⇒ 修改谱名 / ✎ 修谱 / ⋯ 更多 与其菜单一并消失（屏上即打印预览） -->
    <view v-if="!printAll" class="book-toolbar">
      <!-- 修改谱名入口（**与修谱入口同可见性**：既有 `canManageRevision`；视觉上排在「✎ 修谱」左侧）：
           谱名已从【编辑家族信息】表单移出 ⇒ 改名统一在本按钮的弹窗内完成（含本次消耗明示） -->
      <view v-if="canManageRevision" class="toolbar-rename" @click="openRenameDialog">
        <text class="toolbar-rename-text">修改谱名</text>
      </view>
      <!-- 修谱入口（**仅家族管理员 / 总编辑可见**；修谱四类内容只落在【在线文谱】视图内） -->
      <view v-if="canManageRevision" class="toolbar-revision" @click="openRevisionPanel">
        <text class="toolbar-revision-text">✎ 修谱</text>
      </view>
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

    <!-- 打印模式（`printAll` true）：**一个展开（960×720）= 两张单页（480×720）**、**一张纸一张单页**；
         顺序 = **左叶 → 右叶**（按数据层页码口径：左 = 2k+1 先、右 = 2k+2 后 ⇒ 打印页序 1,2,3,… 连续递增、
         不倒序、不跳号）。每页一个分页容器 `.print-sheet`（分页 / 缩放见下方打印 CSS）。
         ⚠️ 结构性事实（Kevin 已知情、正在裁定，**本单不修**）：「每人一行」的行宽最多 30 栏、**横跨 960 展开的
         左右两半** ⇒ 竖切后每张单页上只有**该展开 4 个人的半行**（前半截 / 后半截）。这是书籍翻开的固有形态
         （行越过版心换叶），**不是缺陷**；若 Kevin 裁定改为「单页装完整内容」或「打印单位改回展开」，那是
         **另一批**（要动 `wenpu.ts` 版式真源）——**本单不改版式真源、不改栏数 / 分页**。 -->
    <view v-else-if="printAll" class="print-book">
      <view v-for="leaf of printLeaves" :key="leaf.key" class="print-sheet">
        <view class="print-scale">
          <WenpuSheet :page="leaf.page" :leaf="leaf.leaf" />
        </view>
      </view>
    </view>

    <!-- 阅读器模式（缺省）：横向滚动容器内**当前叶 1 张展开（960×720）**（窄屏不得压缩书页，纸页居中）。
         页式模板 = 子组件 `wenpu-sheet.vue`（`leaf` 缺省 `both` ⇒ 整幅展开 + 书脊分割） -->
    <scroll-view v-else class="book-scroll" scroll-x :show-scrollbar="false">
      <view class="book-scroll-inner">
        <WenpuSheet :page="currentPage" :empty="isEmpty" :flip="flipClass" />
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

    <!-- 修谱管理弹窗（编辑态 = 弹窗；**不新增页面 / 路由**） -->
    <RevisionPanel
      v-if="showRevisionPanel"
      :tree-id="treeId"
      @changed="onRevisionChanged"
      @close="showRevisionPanel = false"
    />

    <!-- 修改谱名弹窗（**共享组件** `rename-genealogy-modal`，与祖谱页复用同一套 UI + 提交逻辑；
         **不新增页面 / 路由**）。入参 = 树 id + 当前谱名 + `rename_fee_pieces`（缺失 ⇒ 不显价格行）；
         成功 ⇒ 通知宿主刷页眉谱名 + 本组件重拉文谱（书口 `▲ <谱名> 葉<N>` 立即更新）。 -->
    <RenameGenealogyModal
      v-if="showRenameDialog"
      :tree-id="treeId"
      :current-name="renameCurrent"
      :fee-pieces="renameFeePieces"
      @close="showRenameDialog = false"
      @renamed="onGenealogyRenamed"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
// #ifdef H5
import { getCurrentInstance, onUnmounted } from 'vue';
// #endif
import { buildWenpuBook } from '@/business/wenpu';
import type { WenpuBook, WenpuPage } from '@/business/wenpu';
import { fetchRevisions, fetchTreeMetaRemote } from '@/business/api';
import { canManageRevision as canManageRevisionOf } from '@/business/revision';
import type { RevisionView } from '@/business/revision';
import { authState } from '@/business/auth';
import RevisionPanel from '@/components/revision-panel/revision-panel.vue';
import RenameGenealogyModal from '@/components/rename-genealogy-modal/rename-genealogy-modal.vue';
import WenpuSheet from '@/components/wenpu-book/wenpu-sheet.vue';

/**
 * 入参：
 * - `treeId`：家族树 id（家谱 tab / 打印页均传本树）；
 * - `printAll`（缺省 false = 阅读器模式，**既有调用方零影响**）：true ⇒ 打印模式 —— ① 不渲染工具条
 *   （修改谱名 / ✎ 修谱 / ⋯ 更多 与其菜单）；② 不渲染翻页控件、键盘翻页同判据失效；③ **一个展开出两张单页**
 *   （左叶 → 右叶），每页一个分页容器 `.print-sheet` + 缩放层 `.print-scale`（见下方打印 CSS）。
 *   两种模式的**页式模板同一份** = 子组件 `wenpu-sheet.vue`（`leaf` = `both` / `left` / `right`）。
 */
const props = withDefaults(defineProps<{ treeId?: string; printAll?: boolean }>(), {
  treeId: '',
  printAll: false,
});

/** 改名成功 ⇒ 通知宿主（`tree-hall`）重取 tree-meta 刷新页眉谱名（书口由本组件自行重拉） */
const emit = defineEmits<{ (e: 'renamed'): void }>();

const book = ref<WenpuBook | null>(null);
const loading = ref(false);
const loadError = ref('');
/** 翻页状态由视图层持有；**分页本身由数据层完成**（每页恒 4 行） */
const pageIndex = ref(0);
/** 工具条「⋯ 更多」菜单开合 */
const menuOpen = ref(false);
/** 修谱管理弹窗开合（编辑态 = 弹窗；入口仅家族管理员 / 总编辑可见） */
const showRevisionPanel = ref(false);
/** 修谱入口可见性（纯前端单点判据 `canManageRevision(role, treeId)`） */
const canManageRevision = computed(() => canManageRevisionOf(authState.role, props.treeId));

// ---------------- 修改谱名（`POST /admin/tree-rename`） ----------------
//
// 口径（Kevin 2026-10-12 拍定）：谱名已从【编辑家族信息】表单移出 ⇒ 改名统一在本组件工具条的
// 【修改谱名】按钮（与「✎ 修谱」同可见性、排其左侧）内完成。
// **弹窗 + 提交逻辑 = 共享组件 `rename-genealogy-modal`**（与祖谱页 `clan-hall.vue` 复用同一套，
// 避免第二份实现）：本组件只负责 ① 打开时读本树 tree-meta 的谱名与 `rename_fee_pieces`、
// ② 成功后通知宿主刷页眉谱名 + **重拉文谱**（书口 `▲ <谱名> 葉<N>` 取 `genealogy_name`，故必须重拉）。

/** 弹窗开合（弹窗本体 = 共享组件，见模板） */
const showRenameDialog = ref(false);
/** 当前谱名（tree-meta entry 的 `genealogy_name`；未设置 ⇒ 空串）—— 共享组件的入参 */
const renameCurrent = ref('');
/** 本次消耗（`rename_fee_pieces`；缺失 / 未加载 / 非法 ⇒ `null` ⇒ 价格行整条不渲染）—— 共享组件的入参 */
const renameFeePieces = ref<number | null>(null);

/**
 * 读本树 tree-meta 的谱名与改名费（`GET /tree-meta`，与文谱数据层同源）—— 作为共享弹窗的入参。
 * 读失败一律静默：不显示价格行（**不臆造数字**）、当前谱名留空，弹窗仍可提交（后端为准）。
 */
async function readRenameMeta() {
  try {
    const meta = await fetchTreeMetaRemote();
    for (const entry of Object.values(meta.trees)) {
      if (entry?.tree_id !== props.treeId) continue;
      renameCurrent.value = (entry.genealogy_name || '').trim();
      const fee = entry.rename_fee_pieces;
      renameFeePieces.value =
        typeof fee === 'number' && Number.isFinite(fee) && fee >= 0 ? fee : null;
      break;
    }
  } catch {
    // 读失败：无价格行、当前谱名留空（仍可提交，后端为准）
  }
}

/** 打开弹窗（先清上次残留的谱名 / 价格），顺带收起「⋯ 更多」菜单；弹窗由共享组件渲染 */
async function openRenameDialog() {
  menuOpen.value = false;
  renameCurrent.value = '';
  renameFeePieces.value = null;
  showRenameDialog.value = true;
  await readRenameMeta();
}

/**
 * 共享弹窗改名成功（`@renamed`）⇒ ① 通知宿主（`tree-hall`）重取 tree-meta 刷页眉谱名；
 * ② 本组件重拉文谱（书口 `▲ <谱名> 葉<N>` 取 `genealogy_name`，故必须重拉）。
 */
function onGenealogyRenamed() {
  emit('renamed');
  void load();
}

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
/** 空谱：纸面内显示繁体空态 */
const isEmpty = computed(() => !loading.value && !loadError.value && book.value?.empty === true);
/** 翻页控件仅在读成功、有页可翻时出现（**打印模式无翻页 ⇒ 恒不出现**；键盘翻页共用同一判据） */
const showPager = computed(
  () =>
    !props.printAll &&
    !loading.value &&
    !loadError.value &&
    !isEmpty.value &&
    totalPages.value > 0,
);

// ---------------- 打印单叶序列（**一个展开 = 两张单页**） ----------------

/** 打印用单叶（页式模板 = 同一份子组件 `wenpu-sheet.vue`，零复制） */
interface PrintLeaf {
  /** v-for key */
  key: string;
  /** 本叶所属展开（数据层页对象；书口 / 版式一字不改） */
  page: WenpuPage;
  /** 左叶（2k+1）先、右叶（2k+2）后 */
  leaf: 'left' | 'right';
}

/**
 * 打印单叶序列：**每个展开出两张**（左叶 → 右叶），展开之间按数据层页序
 * ⇒ 打印页序 1,2,3,… 连续递增、不倒序、不跳号（**只做取页与排序，不改任何版式真源**）。
 */
const printLeaves = computed<PrintLeaf[]>(() =>
  pages.value.flatMap((page, spread) => [
    { key: 's' + spread + '-left', page, leaf: 'left' as const },
    { key: 's' + spread + '-right', page, leaf: 'right' as const },
  ]),
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
    // 修谱视图（**读失败 ⇒ null**：修谱读不到不得改变文谱 —— 无修谱记录 ⇒ 与现状完全一致）
    const rev = await fetchRevisions(props.treeId).catch(() => null);
    const result = await buildWenpuBook(props.treeId, rev);
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

/**
 * 菜单项【生成并下载 PDF】（文案一字不改）—— **不引任何 PDF 库、不嵌字体、不新造排版**：
 * 走**浏览器打印路线**（H5 跳【导出文谱 PDF】薄壳页 `/pages/special/wenpu-print/index?tree_id=`——
 * 该页用本组件的 `printAll` 模式按 A4 逐张单页预览（所见即打印所见；**一个展开 = 两张单页**），
 * 点「🖨 打印 / 保存为 PDF」后在浏览器对话框里选「另存为 PDF」即得文件）。
 * **小程序保持既有 stub 提示逐字不变。**
 */
function onPdfExport() {
  menuOpen.value = false;

  // #ifdef H5
  uni.navigateTo({ url: '/pages/special/wenpu-print/index?tree_id=' + props.treeId });
  // #endif

  // #ifdef MP-WEIXIN
  uni.showToast({ title: '请使用网页版导出', icon: 'none' });
  // #endif
}

/** 打开修谱管理弹窗（入口仅管理员可见；顺带收起「⋯ 更多」菜单） */
function openRevisionPanel() {
  menuOpen.value = false;
  showRevisionPanel.value = true;
}

/** 修谱内容变更（弹窗 `@changed`）⇒ 宿主重新拉取文谱（修谱页与谱文页共用同一套连号） */
function onRevisionChanged() {
  void load();
}

onMounted(load);
// 组件内不得使用页面生命周期（onLoad / onShow 仅页面可用）：换树由 prop 驱动
watch(
  () => props.treeId,
  () => {
    menuOpen.value = false;
    showRevisionPanel.value = false;
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
 * 2. `showPager` 为真（加载中 / 谱文读取失败 / 空谱「暫無譜文」/ 无页 / **打印模式（`printAll`）** ⇒ 一律不响应）；
 * 3. 键恰为 `ArrowLeft` / `ArrowRight`；
 * 4. 无修饰键（避开 Alt+← 浏览器后退、macOS Cmd+←/→ 行首行尾等冲突）；
 * 5. 焦点不在可编辑元素上（INPUT / TEXTAREA / SELECT / contentEditable）。
 * 翻页**一律复用既有 `prevPage()` / `nextPage()`**（边界行为与按钮逐字一致：首页 ← 无操作、末页 → 无操作）；
 * `preventDefault()` **只在本次真的发生翻页时**调用，边界与不响应情形一律不拦截。
 * 长按 key repeat 按浏览器节奏逐次翻页，不做去抖。
 * 已知可接受（本批不处理）：页面遮罩弹窗（申请加入 / 编辑 / 认祖等）打开时，层下文谱仍会按键翻页（用户看不见）。
 */
function onKeydown(event: KeyboardEvent) {
  // 打印模式（`printAll`）：本组件按 A4 顺序渲染全部页、无翻页概念 ⇒ 键盘翻页一律不生效
  // （`showPager` 已因 `printAll` 恒假，此处再显式挡一层，防判据被后续改动松动）
  if (props.printAll) return;
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
/* 修谱入口（与「⋯ 更多」同一行、其左侧；仅家族管理员 / 总编辑渲染） */
.toolbar-revision {
  margin-right: 8px;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 14px;
}
.toolbar-revision-text { font-size: 12px; color: #8B4513; }
/* 【修改谱名】入口（**与修谱入口同体例**、仍排在其左侧；可见性同 `canManageRevision`） */
.toolbar-rename {
  margin-right: 8px;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 14px;
}
.toolbar-rename-text { font-size: 12px; color: #8B4513; }
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

/* ---- 打印（浏览器打印路线；屏上导出视图 = 打印预览：见 pages/special/wenpu-print/index.vue）----
   口径（**Kevin 2026-10-13 修正，取代 2026-10-11 的 960 宽适配**）：
   **960×720 = 「两页并排的展开」，实际单页 = 480×720**（2:3 竖）⇒ **一个展开印两张纸**，
   顺序 = **左叶 → 右叶**（按数据层页码口径：左 = 2k+1 先、右 = 2k+2 后 ⇒ 打印页序 1,2,3,… 连续递增）。
   纸张 = A4 竖排、`@page { size: A4 portrait; margin: 10mm }` ⇒ 可印 **190 × 277mm**；
   缩放 = **按高度适配**（**不再**按 190mm 宽适配）：单页 480×720 等比缩放后 = **184.6667 × 277mm**
   （277 × 2/3 = 184.6667 ≤ 190 ✓）；缩放系数 = 277mm ÷ 720px = 1046.92913px ÷ 720px = **1.4535127**
   （1mm = 96 ÷ 25.4 px，CSS 物理像素恒定）。
   `transform` **不占位** ⇒ 分页容器 `.print-sheet` 显式占**缩放后**尺寸（184.6667mm × 277mm）、
   `transform-origin: top left` ⇒ 二者左上重合；`margin: 0 auto` ⇒ 在 190mm 可印宽内横向居中。
   分页：**每张单页之后**分页（`break-after: page`），**末页撤销分页点**（`:last-child`）⇒
   **末页之后不多出空白纸**；并保留「其后每页另起一纸」的同义兜底规则（相邻两条强制分页点按
   CSS Fragmentation 只解析为**一次**分页，实测 4 / 6 页 = 4 / 6 张）。
   ⚠️ 实测（headless Chrome `--print-to-pdf`，复刻同尺寸结构）：`transform: scale()` 的**绘制区**
   比布局盒大（480px 布局盒 → 697.7px 绘制区），浏览器会把这份溢出**排到下一张纸** ⇒ 每页多出一张
   **幽灵白纸**（实测 1 页 = 2 张、4 页 = 5 张）；`.print-sheet` 加 `overflow: hidden` 夹回绘制区后
   = 张数 = 纸数（实测 4 / 6 页 → 4 / 6 张，末页无空白）。底色保留：`print-color-adjust: exact`（含 `-webkit-` 前缀）。
   ⚠️ 结构性事实（Kevin 已知情、正在裁定，**本单不修**）：「每人一行」的行宽最多 30 栏、**横跨 960 展开的
   左右两半** ⇒ 竖切后每张单页上只有**该展开 4 个人的半行**（前半截 / 后半截）。这是书籍翻开的固有形态
   （行越过版心换叶），**不是缺陷**；若 Kevin 裁定改为「单页装完整内容」或「打印单位改回展开」，那是**另一批**
   （要动 `wenpu.ts` 版式真源）——**本单不要自行改版式、不要自行改栏数/分页**。 */
@page {
  size: A4 portrait;
  margin: 10mm;
}

@media print {
  /* 屏上工具条 / 纸外提示（加载中 · 读取失败）/ 翻页控件：一律不打印 */
  .book-toolbar,
  .book-tip,
  .pager { display: none !important; }

  /* 分页容器（**一张纸一张单页**）：占缩放后尺寸、不跨页拆分、在可印宽内横向居中；
     `overflow: hidden` = 夹住缩放层的绘制溢出 ⇒ 不再多出幽灵白纸
     （容器已按缩放后尺寸略留 0.4px 余量 ⇒ 纸页边框不被裁掉） */
  .print-sheet {
    width: 184.6667mm;
    height: 277mm;
    margin: 0 auto;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
    /* 每张单页**之后**分页 */
    break-after: page;
    page-break-after: always;
  }
  /* 末页：撤销分页点 ⇒ **末页之后不得产生额外空白纸** */
  .print-sheet:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  /* 同义兜底：其后每页另起一张纸（与上面「之后分页」只解析为一次分页） */
  .print-sheet + .print-sheet {
    break-before: page;
    page-break-before: always;
  }

  /* 缩放层：480×720 单页 → 277mm 高（左上对齐 ⇒ 与分页容器左上重合）、保留纸页底色 */
  .print-scale {
    width: 480px;
    height: 720px;
    transform: scale(1.4535127);
    transform-origin: top left;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>
