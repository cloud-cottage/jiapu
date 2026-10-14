<template>
  <!-- 窗：`leaf='both'`（阅读器「展开」）= 960×720 整幅；`leaf='left' | 'right'`（打印「单叶」）= 480×720 裁切窗 -->
  <view
    class="sheet-window"
    :class="[leaf === 'both' ? 'sheet-window-both' : 'sheet-window-leaf', flip]"
  >
    <!-- 书页（**页式模板唯一一份** = 960 宽，即「一个展开」）：
         阅读器整幅上屏；打印单叶 = 外层 480 裁切窗取左半（`margin-left: 0`）/ 右半（`margin-left: -480px`）。
         封面 / 封底页额外挂 `page-cover`（**留白半叶彻底留白** · Kevin 2026-10-15 拍定）：
         该页纸壳**去纸色底、去 1px `#222` 外框、padding 归零**，留白的那半叶**不渲染任何元素**
         （无占位块 / 空 view / 伪元素）⇒ 真的露出背后的东西；深棕半叶的边由自身 `.cover-half`
         的 1px `#222` 边框承担；`overflow: hidden` 兼作半叶色块的溢出兜底。 -->
    <view class="book-page" :class="[{ 'leaf-right': leaf === 'right' }, { 'page-cover': isHalfLeafPage }]">
      <!-- 书口（左 / 右）：文案已是繁体、视图层零字形转换；空串 ⇒ 整条不渲染 -->
      <view v-if="leftLabel" class="side-label side-label-left">
        <text class="side-label-text">{{ leftLabel }}</text>
      </view>
      <view v-if="rightLabel" class="side-label side-label-right">
        <text class="side-label-text">{{ rightLabel }}</text>
      </view>

      <!-- 修谱卷首（`kind === 'cover'`）：整幅大图占满纸页、**保留左右书口**（不走栏格；整体分列重构后仍独立整页、不入列） -->
      <image v-if="isCover" class="book-cover" :src="coverUrl" mode="aspectFit" />

      <!-- 封面页（`kind === 'frontcover'` · 全书第一页 · Kevin 2026-10-14 拍定半叶化；
           2026-10-15 拍定「留白半叶彻底留白」）：
           **只占左半 480×720**（深棕 `#4A3629` 铺满、自带宽 1px `#222` 边框）、**右半不渲染任何元素**
           （不留空 view / 占位块 / 伪元素；纸页本体在本页也去底色去边框 ⇒ 右半真的什么都没有、露出背后的东西）；
           左半正中一块**米色题签**（`#F7F3E8` 底 + 2px `#8B7355` 边框 · 150×430），谱名竖排
           **36px / 字距 6px / 色 `#222`（字色一字不改）**；**不写任何书口**（数据层两书口均空）、不占叶序。
           逐字对照 `mockup-v2.html` 变体 A（`.label` 150×430 · `border:2px solid #8B7355`）。
           类名 `book-front-cover` 保留在同一元素上（= 该页的半叶块本体，不再另套整幅空容器）。 -->
      <view v-else-if="isFrontCover" class="cover-half cover-half-left book-front-cover">
        <view class="cover-label">
          <text class="front-cover-title">{{ frontTitle }}</text>
        </view>
      </view>

      <!-- 封底页（`kind === 'backcover'` · 全书最后一页（后记之后）· 与封面镜像）：
           **左半不渲染任何元素**（同封面口径：纸页本体去底色去边框 ⇒ 彻底留白）、
           **只占右半 480×720**（深棕 `#4A3629` 铺满、自带 1px `#222` 边框）；
           右半正中一枚**印章**（暖白 `#F1E7D6` · 约 300×300 居中）；资产 = `icons.ts` 的 `ICON.WENPU_SEAL`
           （**SVG**；印文「中华数字家谱」）；**不写任何书口**、不占叶序。 -->
      <view v-else-if="isBackCover" class="cover-half cover-half-right book-back-cover">
        <image class="cover-seal" :src="sealSrc" mode="aspectFit" />
      </view>

      <!-- 第一部分修谱页 + 末尾后记页（`kind ∈ article|roster|donation|postscript`）：
           **整页是个整体、整体上分列** —— 无 4 行结构与行分隔线，栏从右向左连续排满整页。
           **族務紀文（`article`）与后记（`postscript`）= 乌丝栏双轨竖排**：栏格分
           「字列轨（左 · 26px）」+「标点列轨（右 · 14px，真占版宽）」两轨 —— 仅当该栏带
           `puncts`（数据层已把 `，`⇒`·` / `。`⇒`○` 挂到其前面紧邻那个汉字、空格不占位）时渲染；
           名录（`roster`）/ 樂捐（`donation`）栏不带 `puncts` ⇒ 单轨渲染，与改动前**逐字一致**。 -->
      <view v-else-if="isFlow" class="book-flow">
        <view
          v-for="(col, ci) in flowCols"
          :key="ci"
          class="book-col"
          :class="{ 'name-col': col.isName, 'dual-col': !!col.puncts }"
        >
          <text class="col-text">{{ col.text }}</text>
          <!-- 标点列轨：与字列轨同格的标点（`puncts` 与 `text` 码点数组同长逐位对齐；`''` ⇒ 留白） -->
          <view v-if="col.puncts" class="col-punct">
            <view v-for="(p, pi) in col.puncts" :key="pi" class="punct-slot">
              <text class="punct-text">{{ p }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 人物名录页（缺省 `genealogy`，**排版与字号一字不动**）：4 行（1 行 = 1 人）、行内最多 30 栏、从右往左排、未满右起留空 -->
      <view v-else class="book-rows">
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
      <view v-if="empty" class="book-empty">
        <text class="book-empty-text">暫無譜文</text>
      </view>
      <!-- 书脊（**仅阅读器「展开」态且** `leaf='both'` **且非半叶页**（封面 / 封底）渲染）：正中一条 1px 竖线 + 线两侧各 14px 柔和渐隐阴影
           （模拟书脊凹陷）；`pointer-events: none` ⇒ 不拦点击；色为半透明 ⇒ **不遮文字**。
           **打印单叶一律不渲染**（`v-if` 挡掉 ⇒ 不把缝印在纸上）；
           **封面页 / 封底页整体不渲染**（Kevin 2026-10-15 拍定：半叶化页的留白半叶要**彻底留白** ⇒ 不留书脊线 / 阴影）。 -->
      <view v-if="leaf === 'both' && !isHalfLeafPage" class="book-spine">
        <view class="spine-shadow spine-shadow-left"></view>
        <view class="spine-line"></view>
        <view class="spine-shadow spine-shadow-right"></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WenpuCol, WenpuPage, WenpuRow } from '@/business/wenpu';
import { ICON } from '@/business/icons';

/**
 * 书页子组件 = **页式模板唯一真源**（`wenpu-book.vue` 的阅读器与打印视图共用同一份，零复制）。
 *
 * 入参：
 * - `page`：数据层单页（`WenpuPage`；缺省 `null` ⇒ 无数据纸页）；
 * - `leaf`（缺省 `'both'`）：`'both'` = 阅读器「展开」整幅 **960×720**；
 *   `'left'` / `'right'` = 打印「单叶」**480×720** 裁切窗（右叶把 960 纸页整体左移 480px 取右半）；
 * - `empty`：纸面内渲染繁体空态「暫無譜文」（阅读器空谱态）；
 * - `flip`：翻页动效（`''` / `'flip-next'` / `'flip-prev'`，由宿主 `playFlip()` 控时；打印恒 `''`）。
 *
 * 视图层零字形转换：书口 / 封面谱名 / 栏文本**一律取数据层已处理好的字面**。
 */
const props = withDefaults(
  defineProps<{
    page?: WenpuPage | null;
    leaf?: 'both' | 'left' | 'right';
    empty?: boolean;
    flip?: '' | 'flip-next' | 'flip-prev';
  }>(),
  { page: null, leaf: 'both', empty: false, flip: '' },
);

/** 人物名录页的 4 行（数据层保证长度恒 4，不足为 null） */
const rows = computed<(WenpuRow | null)[]>(() => props.page?.rows ?? []);
/** 第一部分（修谱三类内容页）与后记页 ⇒ **整页整体分列**（无 4 行结构与行分隔线） */
const isFlow = computed(() =>
  ['article', 'roster', 'donation', 'postscript'].includes(props.page?.kind ?? ''),
);
/** 整体分列页的栏序列（数据层已按每栏重分栏；空数组 ⇒ 纸面留白） */
const flowCols = computed<WenpuCol[]>(() => props.page?.flowCols ?? []);
/** 书口（数据层产出，已是繁体；空串 ⇒ 整条不渲染） */
const leftLabel = computed(() => props.page?.leftLabel ?? '');
const rightLabel = computed(() => props.page?.rightLabel ?? '');
/** 修谱卷首页（`kind === 'cover'`）与卷首图地址（数据层产出，视图层零转换） */
const isCover = computed(() => props.page?.kind === 'cover');
const coverUrl = computed(() => props.page?.cover?.url ?? '');
/** 封面页（`kind === 'frontcover'` · 全书第一页 · 只占左半；不写书口 / 不占叶序） */
const isFrontCover = computed(() => props.page?.kind === 'frontcover');
const frontTitle = computed(() => props.page?.frontTitle ?? '');
/** 封底页（`kind === 'backcover'` · 全书最后一页 · 只占右半；不写书口 / 不占叶序） */
const isBackCover = computed(() => props.page?.kind === 'backcover');
/** 封底印章资产（统一经 `business/icons.ts` 引用，组件内**不手写** `/static/icons/...` 路径） */
const sealSrc = computed(() => ICON.WENPU_SEAL);
/** 半叶页（封面 / 封底）：纸页需 `overflow: hidden`（半叶色块按 480×720 铺设、超出部分裁掉） */
const isHalfLeafPage = computed(() => isFrontCover.value || isBackCover.value);
</script>

<style scoped>
/* ---- 窗（**一套模板、两种用法**）----
   - 阅读器「展开」（`leaf='both'`）：整幅 **960 × 720**（与既有纸页同尺寸 ⇒ 外层尺寸 / 居中与改动前一致）；
     `position: relative` ⇒ 书脊绝对定位的包含块（960 宽 ⇒ 50% = x=480，正对版心）。
   - 打印「单叶」（`leaf='left' | 'right'`）：**480 × 720** 裁切窗（2:3 竖 ＝ 实际单页；缩放见
     `wenpu-book.vue` 的打印 CSS：按 A4 可印高 277mm 等比适配），内部纸页仍 960 宽 ⇒ `overflow: hidden` 取半。 */
.sheet-window-both { position: relative; width: 960px; height: 720px; }
.sheet-window-leaf { width: 480px; height: 720px; overflow: hidden; }
/* 右叶：纸页整体左移 480px ⇒ 裁切窗内显示 960 展开的**右半**；左叶 = `margin-left: 0` ⇒ 显示左半 */
.book-page.leaf-right { margin-left: -480px; }

/* ---- 书脊（**仅阅读器「展开」态**渲染；打印单叶由 `v-if` 挡掉）----
   正中 x=480 一条 **1px `#8B7355` 竖线** + 线两侧各 **14px 柔和渐隐阴影**（`0 → 16%` 的 `#5B4636`，
   朝书脊方向加深）；半透明 + `pointer-events: none` ⇒ **不遮文字、不拦交互**。 */
.book-spine {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  pointer-events: none;
}
.spine-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(50% - 0.5px);
  width: 1px;
  background: #8B7355;
}
.spine-shadow {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14px;
}
.spine-shadow-left {
  left: calc(50% - 14px);
  background: linear-gradient(to right, rgba(91, 70, 54, 0), rgba(91, 70, 54, 0.16));
}
.spine-shadow-right {
  left: calc(50% + 0.5px);
  background: linear-gradient(to left, rgba(91, 70, 54, 0), rgba(91, 70, 54, 0.16));
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
/* 半叶页（**仅封面 / 封底** · Kevin 2026-10-15 拍定「留白半叶彻底留白」）：**纸页本体去纸色底、去 1px `#222` 外框**
   —— 该页不再有任何纸色底 / 外框，留白的那半叶**真的什么都不渲染**（露出背后的东西）。
   深棕半叶的边界改由 `.cover-half` **自身的 1px `#222` 边框**承担（见下）。
   半叶色块仍按 480×720 绝对铺设：纸页定位包含块 = padding box（此处 = border box 960×720，因 padding 归零）
   ⇒ 色块与纸页左上重合、`overflow: hidden` 兼作溢出兜底。
   其余页（谱文 / 修谱 / 后记）**不加本类** ⇒ 现有版式与读数零变化。 */
.book-page.page-cover {
  padding: 0;
  background: transparent;
  border: none;
  overflow: hidden;
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
.sheet-window.flip-next { animation: wenpu-flip-next 300ms ease-out; }
.sheet-window.flip-prev { animation: wenpu-flip-prev 300ms ease-out; }

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
/* 书口抬到纸面内容之上（修谱卷首大图占满纸页时仍须「保留左右书口」；普通谱文页无视觉变化） */
.book-page .side-label { z-index: 2; }

/* 修谱卷首（`kind === 'cover'`）：整幅图占满纸页（绝对定位铺满版心外的可绘区），
   书口在左右页边距内、由上面的 z-index 压在图之上 */
.book-cover {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #F7F3E8;
}

/* ---- 封面页 / 封底页（半叶化 · Kevin 2026-10-14 拍定；**留白半叶彻底留白** · 2026-10-15 拍定 ·
   逐字对照 `mockup-v2.html` 变体 A）----
   口径：**一个展开 960×720 的左右各半 480×720 各归其主** —— 封面**只占左半**（深棕 `#4A3629`
   铺满、自带 1px `#222` 边框），**右半什么都不渲染**（纸页本体已去底色去边框 ⇒ 留白半叶完全空、
   露出背后的东西；不留占位块 / 空 view / 伪元素）；封底**只占右半**深棕，左半同样彻底留白（与封面镜像）。
   半叶块按 480×720 绝对铺设（`.book-page` 本页 `padding: 0` ⇒ 包含块 = 960×720 的 padding box，
   与纸页左上重合），`.book-page.page-cover` 的 `overflow: hidden` 兼作溢出兜底；
   元素盒子读数恒为 **480×720**（`getBoundingClientRect()` 不受裁剪影响）。
   注：`.book-front-cover` / `.book-back-cover` 两个类名仍挂在半叶块本体上（语义标记，无独立样式）。 */
/* 半叶色块：深棕 #4A3629 铺满 480×720、内容（题签 / 印章）在色块正中；
   **自带 1px `#222` 边框**（Kevin 2026-10-15：纸页壳已去边框 ⇒ 深棕区必须有自己的边，不得无边）——
   `box-sizing: border-box` ⇒ 边框画在 480×720 盒内、读数仍是 480×720。
   若日后裁定「不要左右半叶之间那条中缝线」，改法一句话：`border-top/right/bottom` 三条 / 去掉与中缝重合的那一边。 */
.cover-half {
  position: absolute;
  top: 0;
  box-sizing: border-box;
  width: 480px;
  height: 720px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #4A3629;
  border: 1px solid #222;
}
.cover-half-left { left: 0; }
.cover-half-right { left: 480px; }

/* 题签（封面 · 米色底 + 边框）：150×430 居中于左半深棕区 —— 尺寸 / 边框色 / 底色逐字照 mockup
   （`.label{width:150px;height:430px;background:#F7F3E8;border:2px solid #8B7355;box-sizing:border-box}`） */
.cover-label {
  box-sizing: border-box;
  width: 150px;
  height: 430px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F7F3E8;
  border: 2px solid #8B7355;
}
/* 封面谱名（谱名竖排居中 · 36px · 字距 6px · **色 #222 一字不改**） */
.front-cover-title {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 36px;
  letter-spacing: 6px;
  line-height: 1.0;
  color: #222;
  white-space: nowrap;
  font-family: "Noto Serif TC", SimSun, serif;
}

/* 封底印章（暖白 `#F1E7D6` · 约 300×300 居中于右半深棕区；资产 = `ICON.WENPU_SEAL` 的 SVG） */
.cover-seal {
  width: 300px;
  height: 300px;
}

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

/* 整页整体分列（第一部分修谱页 + 后记页）：去 4 行结构与行分隔线 —— 整页一个容器，
   栏从右向左连续排满（栏间 1px #111 左边框保留）；字号 26px / name-col 30px（**一句话可改**）；
   人物名录页（缺省 `genealogy`）不受影响（仍走上方 17px / 20px 基础值） */
.book-flow {
  height: 100%;
  display: flex;
  flex-direction: row-reverse;
  justify-content: flex-start;
  align-items: stretch;
  overflow: hidden;
}
.book-flow .book-col { font-size: 26px; }
.book-flow .name-col { font-size: 30px; }

/* ---- 乌丝栏双轨竖排（**仅 `article` 族務紀文 / `postscript` 后记**；名录与樂捐页零变化）----
   栏格 = 字列轨（左 · 26px，字号 26px 不变）+ 标点列轨（右 · 14px，标点字号 14px，**真占版宽**）
   ⇒ 栏格宽 = 26 + 14 + 2×1px padding + 1px 栏线 = 43px（与 `wenpu.ts` 的 `WENPU_DUAL_COL_WIDTH`
   同口径 ⇒ 每页 20 栏，**一句话可改**）。父容器改横排（非 `row-reverse`，写作默认模式）：
   DOM 顺序 = 字列在左、标点在右 ⇒ 竖排「字在左、标点在右」。 */
.book-flow .dual-col {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  writing-mode: horizontal-tb;
}
/* 字列轨：宽恒 = 字号 26px（各栏格宽一律 43px ⇒ 标点轨起点一致；满 26 字 = 676px ≤ 内容高 684px） */
.book-flow .dual-col .col-text {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  flex: 0 0 26px;
  width: 26px;
}
/* 标点列轨：宽恒 14px（真占版宽）；每格高度 = 字列一字的纵向步进 26px ⇒ 标点与所画之字同格同 y 带 */
.book-flow .dual-col .col-punct {
  flex: 0 0 14px;
  width: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  font-size: 14px;
  line-height: 1;
  overflow: hidden;
}
/* 标点格：与字列轨同一格的标点（格内水平 + 垂直居中 ⇒ 与所属字同 y 对齐）；无标点 ⇒ 空格留白 */
.punct-slot {
  flex: 0 0 26px;
  width: 14px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.punct-text { font-size: 14px; line-height: 1; white-space: nowrap; }

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

</style>
