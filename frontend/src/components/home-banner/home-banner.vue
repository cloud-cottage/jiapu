<template>
  <!--
    首页顶部「三层古风 banner」（Kevin 2026-10-17 设计实现单）。

    · 三层（仅 H5）：底＝模糊宣纸古籍（铺满 + blur）｜左＝做旧线装书｜右＝石榴树插画；
      左右两层各占 ≤44% 宽、贴边、向内以 mask 渐隐，中段整片留给文字。
    · 纸底**不再止于 banner**：`.banner__paper` 是一层连续纸面，从 banner 顶边一直铺到
      banner 下方 `--extend-h`（260px，即搜索框 / 排序条 / 首张卡片上半部所在的高度），
      末端渐隐进页面底色 #EDF1EA ⇒ 背景「侵占」搜索区，不再在 banner 下缘硬切一刀。
    · 小程序（`#ifndef H5`）**完全保持**原文字 hero：同一份 title / subtitle，
      字号 / 字重 / 颜色 / 间距与改版前逐值一致（模板与样式均原样搬迁）。
    · 三张素材**只在本文件的 H5 分支引用**（全仓唯一引用点）：小程序编译时该分支被条件编译整段
      移除，产物内零字符串引用 ⇒ `vite.config.ts` 的 `jiapu:main-package-slim` 死重清单据此剔除，
      不占主包体积。故路径**故意写在这里**、不经 `business/icons.ts`（那里是图标，且会被小程序一并打进）。
  -->
  <view class="home-banner">
    <!-- #ifdef H5 -->
    <!-- 连续纸面层：从 banner 顶边铺到 banner 下方 --extend-h（搜索框 / 排序条 / 首张卡片上半部
         都坐在这层上）；末端渐隐进页面底色。纯装饰：不接点击、不参与布局。 -->
    <view class="banner__paper">
      <img class="banner__paper-img" src="/static/images/home/banner-paper.jpg" alt="" />
      <view class="banner__paper-fade"></view>
    </view>
    <view class="banner">
      <img class="banner__left" src="/static/images/home/banner-book.jpg" alt="" />
      <img class="banner__right" src="/static/images/home/banner-tree.jpg" alt="" />
      <view class="banner__content">
        <text class="banner__title">{{ title }}</text>
        <text class="banner__subtitle">{{ subtitle }}</text>
      </view>
    </view>
    <!-- #endif -->

    <!-- #ifndef H5 -->
    <view class="header">
      <text class="title">{{ title }}</text>
      <text class="subtitle">{{ subtitle }}</text>
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
/**
 * 首页 banner（纯展示组件：文案由父页面经 props 传入，组件内不写字面文案）。
 * `title` / `subtitle` 两端同一份——小程序仍是原来的文字 hero。
 */
defineProps<{
  /** 主标题（对句） */
  title: string;
  /** 副标题（一句话定位） */
  subtitle: string;
}>();
</script>

<style scoped>
.home-banner { display: block; }

/* ---- H5：三层古风 banner（照 Kevin 给的参考 CSS，已适配 uni-app） ---- */
/* #ifdef H5 */

/* banner / 纸面层高度真源：--banner-h = banner 高；--extend-h = 纸面向下延展高（260px，
   ⇒ 盖住搜索框 44px + 排序条 + 首张卡片上半部，不再在 banner 下缘切断）。
   ⚠ 这段只在 H5 生效：小程序产物里 `.home-banner` 仍只有 `display: block`（版式零改动）。 */
.home-banner {
  position: relative;
  --banner-h: min(520px, 48vh);
  --banner-min-h: 300px;
  --extend-h: 260px;
}

/* 连续纸面层：从 banner 顶边一直铺到 banner 下方 --extend-h（搜索框 / 排序条 / 首张卡片上半部
   就坐在这一层上）。100vw 出血沿用与 .banner 同一套负 margin 公式 ⇒ 左右与 banner 严格对齐、
   不产生横向溢出；overflow:hidden 吃掉模糊毛边。pointer-events:none ⇒ 底下内容照常可点。 */
.banner__paper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  height: calc(var(--banner-h) + var(--extend-h));
  min-height: calc(var(--banner-min-h) + var(--extend-h));
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  background: #E9F0EA; /* 素材未加载时的青瓷纸兜底色（与宣纸同族·2026-10 换色） */
}

/* 纸面纹理：宣纸古籍铺满整层（含 banner 区），8px 模糊 + scale 吃毛边 */
.banner__paper-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  /* 2026-10 转冷：模糊值 8px 不变，只叠 saturate 降饱和 + 极轻 hue-rotate 把暖米黄往青瓷靠
     （纸面素材本身是暖棕调，单靠上层青瓷薄纱压不住饱和度 ⇒ 先在图片这一环掉色）。
     saturate 取 0.45（低于任务书建议的 0.6–0.7）：实测纸面中心区暖色像素 0.6→18%、0.45→3.8%，
     0.6 在视觉上仍读作暖米黄（截图 + 色温判读复核），0.45 才真正落到青瓷灰绿；纸纹仍可辨。 */
  filter: blur(8px) saturate(0.45) hue-rotate(-4deg);
  transform: scale(1.06);
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

/* 纸面顶端轻渐入：banner 上沿与白色导航条之间不要出现一刀深色纸边
   （纸面素材顶部本身是深棕的装帧区，压在最上层会读成一条「分割线」）
   —— 只在纸面层内生效，两侧叠图在纸面层之上，不受影响。 */
.banner__paper::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 56px;
  z-index: 1;
  background: linear-gradient(to bottom, rgba(237, 241, 234, 0.92), rgba(237, 241, 234, 0));
  pointer-events: none;
}

/* 纸面末端渐隐到页面底色 #EDF1EA（= App.vue H5 `page` 暖纸底色）。
   起点落在 banner 下缘之后约 50px ⇒ 搜索框坐在接近满强度的纸面上，排序条 / 首张卡片处逐格淡出。 */
.banner__paper-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 210px;
  background: linear-gradient(
    to bottom,
    rgba(237, 241, 234, 0) 0%,
    rgba(237, 241, 234, 0.38) 40%,
    rgba(237, 241, 234, 0.85) 74%,
    #EDF1EA 100%
  );
  pointer-events: none;
}

/* 青瓷薄纱（2026-10 转冷）：纸面图降饱和后仍偏暖米黄 ⇒ 在纸面层上再压一层青瓷纸色薄纱，
   把整片纸面（含 banner 区与下方延展段）拉回 #EDF1EA 一族。
   · 层序：图片 < ::before(顶端渐入) < ::after(薄纱) 同属纸面层，被上方 .banner 内容整层压住；
   · 颜色 = 页面底色 #EDF1EA 本身，故末端渐隐终点仍是 #EDF1EA（薄纱同为该色，叠上去颜色不变）；
   · 夜间由下面 html[data-theme='dark'] 规则整层摘掉 ⇒ 夜间观感逐像素不变。 */
.banner__paper::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background: rgba(237, 241, 234, 0.34);
  pointer-events: none;
}

.banner {
  position: relative;
  z-index: 1; /* 压在纸面层之上：纸面向下延展的那一段不会盖住 banner 自身内容 */
  /* 出血：100vw 铺满视口；负 margin 抵掉父容器的 20px 内距，并让 banner 在窄栏里仍左右顶边 */
  width: 100vw;
  margin-left: calc(50% - 50vw);
  /* 高：桌面封顶 520px；窄/矮屏按视口高度收（手机约 320–400px），不低于 300px 以免压扁插画 */
  height: var(--banner-h);
  min-height: var(--banner-min-h);
  overflow: hidden;
}

/* 桌面按参考稿 520px 钉死；窄/矮屏仍按视口高度收（手机约 320–400px） */
@media (min-width: 768px) {
  .home-banner { --banner-h: 520px; }
}

/* 两侧图片：绝对定位、垂直居中、统一高度；纯装饰，不接点击、不可拖选。
   · height 90%（+ scale 1.045 ⇒ 可见 ≈94%）：高度略收，观感从「两根高柱」变成「宽扁横幅」；
   · transform scale 吃掉 blur 外扩的毛边（超出 banner 的部分被 overflow:hidden 裁掉，不会出现模糊白边）；
   · 横向占比 max-width 44%（原 65%）⇒ 中段留白显著加大。
   ⚠ width:auto + max-width 而**不是** width:44% + contain：contain 会把画幅缩在 44% 盒子里、
   上下露出空白 ⇒ 一条硬水平接缝。width:auto 时盒宽=实际画幅宽（max-width 夹紧时由 cover 横向
   裁切，也不留白、不降分辨率、不变形）。 */
.banner img {
  position: absolute;
  top: 50%;
  height: 90%;
  transform: translateY(-50%) scale(1.045);
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

/* 左层：线装书，贴左缘；右缘向内渐隐进纸面。
   · 模糊 3px（中部纸底 8px ⇒ 仍留层次，但两侧不再糊成一团）；
   · 遮罩 = **二维**（水平 × 垂直，mask-composite: intersect）：水平朝内渐隐，
     垂直上下两侧都渐隐 —— banner 上沿贴导航条、下沿接纸面延展层，故**下侧比上侧更深**
     （顶部 12%、底部 18%），下边缘与纸面无缝融合、不再有一条硬界限。
     ⚠ 该二维遮罩**全宽度通用**（旧版只在 ≤1100px 生效，>1100px 桌面只有水平一维 ⇒
     下边缘裸切一刀）。
     ⚠ mask-image 不支持「部分覆盖」：任何媒体查询里改水平那条，必须把垂直那条一起重写。 */
.banner__left {
  left: 0;
  width: auto;
  max-width: 44%;
  object-fit: cover;
  object-position: left center;
  /* 转冷：模糊值仍 3px（层次不变），叠 saturate 收掉书页 / 卷轴的暖棕饱和度 */
  filter: blur(3px) saturate(0.75);
  -webkit-mask-image: linear-gradient(to right, #000 58%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 12%, #000 82%, transparent 100%);
  mask-image: linear-gradient(to right, #000 58%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 12%, #000 82%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}

/* 右层：石榴树，贴右缘；左缘向内渐隐（树在插画右侧、左半留白，恰好朝中线淡出）。
   垂直方向与左层同值（顶部 12% / 底部 18% 渐隐），两图下边缘在同一高度同步消隐。 */
.banner__right {
  right: 0;
  width: auto;
  max-width: 44%;
  object-fit: cover;
  object-position: right center;
  filter: blur(3px) saturate(0.75);
  -webkit-mask-image: linear-gradient(to left, #000 58%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 12%, #000 82%, transparent 100%);
  mask-image: linear-gradient(to left, #000 58%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 12%, #000 82%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}

/* 中段柔光：在文字背后铺一层极淡的暖纸径向光，把标题从叠图里“托”出来
   （不引入新色块，与宣纸同族；图层在图片之上、文案之下） */
.banner::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 78%;
  max-width: 560px;
  transform: translateX(-50%);
  z-index: 5;
  pointer-events: none;
  background: radial-gradient(closest-side, rgba(237, 241, 234, 0.62), rgba(237, 241, 234, 0) 100%);
}

/* 文案层：三维叠图之上（z-index 10），垂直居中；文案色沿用现有（#2F3A33 / 暖棕） */
.banner__content {
  position: relative;
  z-index: 10;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
  box-sizing: border-box;
  text-align: center;
}

/* 主标题：单行款（480px 列内 14 字对句正好一行）；浅色纸底上用暖白描边 + 柔光把字托起来 */
.banner__title {
  display: block;
  font-size: clamp(18px, 4.6vw, 24px);
  font-weight: 700;
  color: #2F3A33;
  letter-spacing: 2px;
  line-height: 1.7;
  text-shadow: 0 1px 0 rgba(250, 252, 248, 0.7), 0 2px 12px rgba(250, 252, 248, 0.9);
}

/* 副标题：原暖棕 #5D4638（7.66:1）⇒ 转冷为深青墨 #3A4A44（对 #EDF1EA 约 8.19:1，对比度反升），
   与标题 #2F3A33 同族但略浅一档；三层浅色柔光托底不变（不加描边、不显脏）。文案一字未改。 */
.banner__subtitle {
  display: block;
  margin-top: 10px;
  font-size: 14px;
  color: #3A4A44;
  letter-spacing: 0.5px;
  line-height: 1.6;
  text-shadow: 0 1px 0 rgba(250, 252, 248, 0.85), 0 0 6px rgba(250, 252, 248, 0.85),
    0 0 14px rgba(250, 252, 248, 0.6);
}

/* ---- 窄屏 / 平板（≤1100px）：两侧层改为 cover 填满盒子 ----
   为什么 cover：`width:auto` 在窄视口会被 max-width 夹紧 ⇒ contain 会缩掉高度、上下露出纸面
   ⇒ 一条硬水平接缝（已截图复现）。cover 让画幅永远填满 42%×90% 的盒子（无空白边、不降分辨率）。
   遮罩（水平 × 垂直二维相交）已在 base 里全宽度通用，这里**不再重复声明**。 */
@media (max-width: 1100px) {
  .banner__left,
  .banner__right {
    width: 42%;
    max-width: 42%;
    object-fit: cover;
  }
  .banner__left { object-position: left center; }
  /* 右层水平方向反向已在 base 声明，此处只调 object-position（树在插画右侧、左半留白） */
  .banner__right { object-position: right center; }
}

/* 窄屏（≤520px）：文案几乎占满整宽，两侧叠图横向再让一档（42%）、渐隐提前，并加厚中段柔光，
   保证对句始终压在“淡下去”的区域上（宽屏不受影响，仍是 44% / 58%）。
   ⚠ 这里必须**重新写全两个 mask 值**（不能只写水平那条）：mask-image 不支持部分覆盖。 */
@media (max-width: 520px) {
  .banner__left,
  .banner__right { width: 42%; max-width: 42%; }
  .banner__left {
    -webkit-mask-image: linear-gradient(to right, #000 42%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 12%, #000 82%, transparent 100%);
    mask-image: linear-gradient(to right, #000 42%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 12%, #000 82%, transparent 100%);
  }
  .banner__right {
    -webkit-mask-image: linear-gradient(to left, #000 42%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 12%, #000 82%, transparent 100%);
    mask-image: linear-gradient(to left, #000 42%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 12%, #000 82%, transparent 100%);
  }
  .banner::after {
    width: 94%;
    max-width: none;
    background: radial-gradient(closest-side, rgba(237, 241, 234, 0.8), rgba(237, 241, 234, 0) 100%);
  }
}

/* 超窄屏（≤360px）：字再收一档、内距收紧，保证对句仍单行 */
@media (max-width: 360px) {
  .banner__content { padding: 0 16px; }
  .banner__title { font-size: 17px; letter-spacing: 1px; }
  .banner__subtitle { font-size: 12px; }
}

/* ---- 夜间模式（html[data-theme='dark']）：三层图统一压暗 ----
   · 三层各自**保留原模糊值**（纸面 8px / 两侧 3px），只在 filter 链尾叠加 brightness ⇒ 模糊观感不变、
     只是变暗；saturate 略收，避免压暗后纸纹发花。
   · 纸面层同时换深青墨底 #1E2825（图片未加载时不露白），末端渐隐改到夜间页面底色 #1B2422。
   · 中段柔光（.banner::after）在浅色下是「提亮托字」，夜间**反向**成一层暗纱 ⇒ 文字落在更暗的底上。
   · 文案转亮系（标题 #DFE9E4 / 副标题 #B4C2BB），文字阴影由浅色柔光改为深色投影（反之）。
   · 选择器带 html[data-theme='dark'] 前缀，特异性高于上面 base / 媒体查询里的同名规则，无需 !important。 */
html[data-theme='dark'] .banner__paper { background: #1E2825; }
/* 青瓷薄纱只在日间存在：夜间整层摘掉 ⇒ 夜间三层观感与本次改色前逐像素一致 */
html[data-theme='dark'] .banner__paper::after { background: none; }
html[data-theme='dark'] .banner__paper-img { filter: blur(8px) brightness(0.42) saturate(0.7); }
html[data-theme='dark'] .banner__paper::before {
  background: linear-gradient(to bottom, rgba(30, 40, 37, 0.9), rgba(30, 40, 37, 0));
}
html[data-theme='dark'] .banner__paper-fade {
  background: linear-gradient(
    to bottom,
    rgba(27, 36, 34, 0) 0%,
    rgba(27, 36, 34, 0.38) 40%,
    rgba(27, 36, 34, 0.85) 74%,
    #1B2422 100%
  );
}
html[data-theme='dark'] .banner__left,
html[data-theme='dark'] .banner__right {
  filter: blur(3px) brightness(0.5) saturate(0.75);
}
html[data-theme='dark'] .banner::after {
  background: radial-gradient(closest-side, rgba(27, 36, 34, 0.78), rgba(27, 36, 34, 0) 100%);
}
html[data-theme='dark'] .banner__title {
  color: #DFE9E4;
  text-shadow: 0 1px 0 rgba(24, 18, 13, 0.7), 0 2px 12px rgba(24, 18, 13, 0.9);
}
html[data-theme='dark'] .banner__subtitle {
  color: #B4C2BB;
  text-shadow: 0 1px 0 rgba(24, 18, 13, 0.85), 0 0 6px rgba(24, 18, 13, 0.85),
    0 0 14px rgba(24, 18, 13, 0.6);
}
/* #endif */

/* ---- 小程序：原文字 hero（与改版前逐值一致：19/700 深棕 → 13 辅助棕） ---- */
/* #ifndef H5 */
.header { text-align: center; margin-bottom: 22px; }
.title {
  font-size: 19px;
  font-weight: 700;
  color: #2F3A33;
  letter-spacing: 1px;
  line-height: 1.5;
  display: block;
}
.subtitle {
  font-size: 13px;
  color: #6E7D70;
  line-height: 1.5;
  margin-top: 8px;
  display: block;
}
/* #endif */
</style>
