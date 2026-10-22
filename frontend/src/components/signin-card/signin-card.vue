<template>
  <!--
    每日签到 · 游戏化沉浸式场景卡（S-6 拟物三件套：渐变＋描边＋投影；S-9 配色固定红金羊皮，不随夜间模式反转）。
    **纯展示组件**（S-2）：props 进数据、emit 出动作；请求 / 已签判据（服务端 signin_date）/ 补签二次确认 /
    签到 409 处理全部留在「我的」页；文案字面单点 = business/asset-text.ts（本组件不散落签到中文句）；
    **仅一处图片**：石榴树插画 = **整卡背景图**（.scene-bg 层 · 240×188 12 色透明 PNG · 9,423 B（＜10 KB 硬口径）· base64 内联，
    锚点 = 背景**左上角** `left top`；见 .scene-bg 样式注释）；网格 r1c1 的 .scene-art = **纯透明占位格**（不可见，只占网格槽位）；
    其余场景仍 CSS 拟物（S-8：.scene-glow / .scene-vignette / .scene-scrim 见各层注释）。
  -->
  <view class="scene-card">
    <!-- S-8 场景底图：**全卡背景**（插画 base64 内联 ＋ 深红渐变兜底；详细规则见样式 .scene-bg） -->
    <view class="scene-bg" />
    <view class="scene-glow" />
    <view class="scene-vignette" />
    <!-- 文字可读性 scrim（**只护文字区**：顶部仅卡头文字行、底部仅按钮/读数/奖励窄带；插画中段不压暗、不碰日格） -->
    <view class="scene-scrim" />

    <!--
      标题行：文案单点（SIGNIN_TITLE / SIGNIN_HINT_PENDING / SIGNIN_HINT_DONE，零改动）＋
      连签令牌徽章（R-8 自网格移出：卡头右端；streak 缺失 ⇒ 整枚不渲染；读数行 streakText 行为不变）。
    -->
    <view class="scene-head">
      <view class="scene-head-text">
        <text class="scene-title">{{ SIGNIN_TITLE }}</text>
        <text class="scene-hint">{{ signedToday ? SIGNIN_HINT_DONE : SIGNIN_HINT_PENDING }}</text>
      </view>
      <!-- 徽章（令牌形，R-5）：文字单点 = signinStreakBadgeText；金边令牌形态见样式 -->
      <view v-if="hasStreak" class="streak-badge">
        <text class="streak-badge-text">{{ badgeText }}</text>
      </view>
    </view>

    <!--
      场景网格（S-4 · **R-8 口径**：卡内 2 行 × 5 列；第 5 列纵跨 2 行 = 「连签 7 天」大奖列）。
      左 4 列 × 2 行 = 8 槽：r1c1 = **纯透明占位格**（.scene-art，不可见、只占槽位；插画已上移为全卡背景）＋ 7 个日格；
      阅读序 r1c2→r1c4 = 第 1~3 天、r2c1→r2c4 = 第 4~7 天。实现 = 4 条 flex 纵列（mp 兼容，不用 display:grid）；
      槽位**行主序** [艺术位, d1..d7] 按 i%4 落列 ⇒ col0=[art,d4] col1=[d1,d5] col2=[d2,d6] col3=[d3,d7]。
      「已连签 N 天」徽章已移出网格 → 卡头（R-8；取代此前「徽格恒第 4 列第 2 行」口径）。
      calendar 为空（旧后端缺键 / 非 7 长）⇒ 网格整区不渲染（**不臆造格子**）。
    -->
    <view v-if="cells.length" class="scene-grid">
      <view v-for="(col, ci) in gridColumns" :key="`col-${ci}`" class="scene-col">
        <view v-for="slot in col" :key="slot.key" class="scene-slot">
          <!--
            R-8 r1c1 = **纯透明占位格（不可见，保留网格槽位，勿放内容）**：
            只撑网格位置与列高（日格对齐），不渲染图 / 渐变 / 描边 / 投影；石榴树插画已上移为全卡背景 .scene-bg。
          -->
          <view v-if="slot.art" class="scene-art" />
          <!-- 日格：状态三重编码（S-7：文案 ＋ 卡片形态 ＋ 底色，与 §15-7 逐字一致） -->
          <view
            v-else
            class="day-cell"
            :class="[`cell-${slot.day.state}`, {
              'cell-madeup': isMadeup(slot.day),
              'cell-tappable': slot.day.state === 'missed' && !makeupBusy,
            }]"
            :hover-class="slot.day.state === 'missed' && !makeupBusy ? 'cell-hover' : 'none'"
            @click="$emit('cell', slot.day)"
          >
            <!--
              顶部「页签」日标签（米黄圆角横条、深棕粗体；今日 = 橙色高亮 #FF8C1A 且**唯一强高亮**）。
              R-2：页签只报「第 N 天」，**不带大奖字样**（不传 is_bonus）——「连签 7 天大奖」语义唯一归属大奖列。
            -->
            <view class="cell-tab" :class="{ 'cell-tab-today': slot.day.state === 'today' }">
              <text class="cell-tab-text">{{ signinDayLabel(slot.day.cycle_day) }}</text>
            </view>
            <view class="cell-body">
              <view class="cell-items">
                <!-- 固定基础项：真实道具图标（business/icons.ts 单点）＋ 左上数量角标（qty > 1 才出） -->
                <view v-for="(it, i) in slot.day.baseItems" :key="`base-${i}`" class="cell-item">
                  <image v-if="assetKindIconSrc(it.kind)" class="cell-ico" :src="assetKindIconSrc(it.kind)" mode="aspectFit" />
                  <text v-if="it.qty > 1" class="cell-qty">{{ signinQtyBadge(it.qty) }}</text>
                </view>
                <!-- S-5：第 7 格 bonus **只在大奖列渲染**（防双显），日格内仅固定基础项 -->
              </view>
              <text v-if="slot.day.state === 'signed'" class="cell-check">{{ SIGNIN_CELL_CHECK }}</text>
            </view>
            <!-- 底部状态行（深棕小字）：漏签出「补签」（复用确认弹窗标题既有字面，不新造）；已补出「已补签」 -->
            <text v-if="slot.day.state === 'missed'" class="cell-state-word">{{ SIGNIN_MAKEUP_TITLE }}</text>
            <text v-else-if="isMadeup(slot.day)" class="cell-state-word">{{ SIGNIN_CELL_MADEUP }}</text>
            <!-- 格底「随机」chip（口径不变：只标随机、不预标品种，§15-7） -->
            <text v-if="slot.day.random" class="cell-chip">{{ SIGNIN_RANDOM_CHIP }}</text>
          </view>
        </view>
      </view>

      <!--
        第 5 列（纵跨 2 行）＝「连签 7 天」大奖列（S-5）：呈现**第 7 格的 bonus**（道具图标 ＋ 数量角标）
        ＋ 异形旗标「连签 7 天」＋ 第 7 格状态（与日格同一套状态语言）；R-4 红绸缎面 ＋ 鎏金描边加粗 =
        §15-7「第 7 格金边大奖」的列形态承载，大奖语义唯一归属本列（R-2）。
      -->
      <view v-if="bonusCell" class="scene-prize">
        <!--
          R-3：本列 = **纯布局列**（无 padding/border），外沿与 4 条 .scene-col 同构等宽（极差 ≤ 1px）；
          R-4 鎏金框 / 缎面 / 状态类全部在内层 .prize-frame（prize-{state} 随之内移，形态不变）。
        -->
        <view class="prize-frame" :class="`prize-${bonusCell.state}`">
        <view class="prize-flag">
          <text class="prize-flag-text">{{ SIGNIN_BONUS_FLAG }}</text>
          <view class="prize-flag-tail" />
        </view>
        <view class="prize-body">
          <view v-if="bonusCell.bonusItem.qty > 0" class="prize-item">
            <image v-if="assetKindIconSrc(bonusCell.bonusItem.kind)" class="prize-ico" :src="assetKindIconSrc(bonusCell.bonusItem.kind)" mode="aspectFit" />
            <text class="prize-qty">{{ signinQtyBadge(bonusCell.bonusItem.qty) }}</text>
          </view>
        </view>
        <text v-if="bonusCell.state === 'signed'" class="prize-check">{{ SIGNIN_CELL_CHECK }}</text>
        <text v-else-if="bonusCell.state === 'missed'" class="prize-state-word">{{ SIGNIN_MAKEUP_TITLE }}</text>
        </view>
      </view>
    </view>

    <!-- 连签读数行（三段互斥口径 §15-7 不变；拼装在页面，空串 = 整行不渲染、不显 NaN） -->
    <text v-if="streakText" class="scene-streak">{{ streakText }}</text>
    <text v-if="error" class="scene-error">{{ error }}</text>

    <!--
      主按钮（S-6：红渐变胶囊 ＋ 金描边 ＋ 底部硬投影 `0 4px 0 深红` ＋ 按压 translateY(3px)）。
      按压反馈用 hover-class（mp 无 :active）；已签 = 置淡（点击仍回页面守卫，与既有 doSignin 判据一致）。
    -->
    <view
      class="scene-cta"
      :class="{ 'scene-cta-done': signedToday, 'scene-cta-busy': signing }"
      hover-class="scene-cta-press"
      @click="$emit('signin')"
    >
      <text class="scene-cta-text">{{ CTA_GLYPH }}</text>
    </view>

    <!-- 今日奖励入口（子包 pages/task/index；文案单点不变，不新增取数） -->
    <text class="scene-reward" @click="$emit('reward')">{{ SIGNIN_REWARD_LINK }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 每日签到 · 游戏化沉浸式场景卡（**纯展示组件**，S-2 组件化落点）。
 *
 * - props 进数据、emit 出动作；**零请求、零业务判据** —— 已签判据（服务端 `signin_date`）、
 *   补签二次确认、签到 409 处理、文案/toast 拼装全部留在「我的」页（`pages/mine/index.vue`）；
 * - 文案字面**单点 = `business/asset-text.ts`**（含此前纯追加的 `SIGNIN_BONUS_FLAG` /
 *   `SIGNIN_CELL_MADEUP` / `signinStreakBadgeText`，既有字面一字未改）；
 * - 图标 = `business/icons.ts` 单点（真实道具图标，未知 kind 不渲染、不回退）；
 * - 版式 = S-4 · R-8 口径（2 行 × 5 列：r1c1 艺术位 ＋ 7 日格；第 5 列纵跨大奖列；连签徽章在卡头）；
 *   状态三重编码 = S-7；R-1 强高亮唯一性（今日格专属呼吸光晕）；R-3 五列等宽；
 * - 本批零图片（S-8 占位类）；动效 CSS-only（S-10：今日呼吸光晕 / 大奖列浮动 / 按压位移）。
 */
import { computed } from 'vue';
import type { SigninCalendarDay } from '@/business/types';
import type { SigninCellAsset } from '@/business/asset-text';
// 签到卡展示文案单点（asset-text.ts）：本组件不散落签到中文字面
import {
  SIGNIN_TITLE,
  SIGNIN_HINT_PENDING,
  SIGNIN_HINT_DONE,
  SIGNIN_REWARD_LINK,
  SIGNIN_CELL_CHECK,
  SIGNIN_RANDOM_CHIP,
  SIGNIN_MAKEUP_TITLE,
  SIGNIN_BONUS_FLAG,
  SIGNIN_CELL_MADEUP,
  signinQtyBadge,
  signinDayLabel,
  signinStreakBadgeText,
} from '@/business/asset-text';
/** 道具 kind → 图标 URL（单点 = business/icons.ts；未知 kind ⇒ 空串不渲染） */
import { assetKindIconSrc } from '@/business/icons';

/**
 * 网格单格（= 页面 `normalizeCalendar` 后的渲染格）：`SigninCalendarDay` ＋ 渲染派生项
 * （`baseItems` / `bonusItem` 由 `asset-text.ts` 单点推导，含旧后端兜底；组件不再自行拼装）。
 * `bonusItem` 恒非空（缺失 ⇒ `{ kind:'', qty:0 }`）⇒ 模板只需判 `qty > 0`，无需空值断言。
 */
interface SigninGridCell extends SigninCalendarDay {
  /** 固定基础项（逐项；旧后端无 `base` ⇒ 单件兜底） */
  baseItems: SigninCellAsset[];
  /** 第 7 天大奖（缺失 ⇒ 空项） */
  bonusItem: SigninCellAsset;
}

const props = withDefaults(defineProps<{
  /** 签到 7 格日历（页面 normalize 后的渲染格；空数组 ⇒ 网格整区不渲染） */
  calendar: SigninGridCell[];
  /** 连签读数行（三段互斥口径已在页面拼装好；空串 = 不渲染该行） */
  streakText?: string;
  /** 连签天数原值（**仅卡头徽章用**；null = 缺失 ⇒ 徽章不渲染，R-8，不臆造） */
  streak?: number | null;
  /** 今日是否已签（判据在页面：服务端 signin_date / 本会话签到成功 / 409） */
  signedToday?: boolean;
  /** 签到请求进行中（按钮防抖态） */
  signing?: boolean;
  /** 补签请求进行中（进行中漏签格不可再点） */
  makeupBusy?: boolean;
  /** 本会话已补签的自然日（**纯展示**：命中格 = 已签形态＋「已补签」词；不参与任何判据） */
  madeupDate?: string;
  /** 签到失败文案（页面透出后端原文；空串 = 不渲染） */
  error?: string;
}>(), {
  streakText: '',
  streak: null,
  signedToday: false,
  signing: false,
  makeupBusy: false,
  madeupDate: '',
  error: '',
});

defineEmits<{
  /** 主按钮（页面守卫：未登录 / 已签 / 进行中忽略） */
  (e: 'signin'): void;
  /** 日格点击（页面只对 missed 格走补签二次确认，其余无操作） */
  (e: 'cell', day: SigninCalendarDay): void;
  /** 今日奖励入口（子包 pages/task/index） */
  (e: 'reward'): void;
}>();

/** 主按钮字形：既有印章「签」字原样迁入（原内联卡模板字形，非文案句、无新增字面） */
const CTA_GLYPH = '签';

const cells = computed(() => props.calendar);

/** 卡头连签徽章渲染门控（R-8）：streak 缺失 / 非法 ⇒ 整枚不渲染（**不臆造天数**） */
const hasStreak = computed(() => {
  if (props.streak === null || props.streak === undefined) return false; // R-5：显式判缺失（Number(null)===0 会臆渲「已连签 0 天」）
  const n = Math.floor(Number(props.streak));
  return Number.isFinite(n) && n >= 0;
});

/** 卡头徽章文字（单点 = signinStreakBadgeText：恒「已连签 N 天」；渲染由 hasStreak 门控） */
const badgeText = computed(() => signinStreakBadgeText(props.streak));

/**
 * 大奖列数据源 = **第 7 格**（`cycle_day === 7`；字段漂移无 7 格时回退 `is_bonus` 格，
 * 两路皆空 ⇒ 大奖列不渲染、**不臆造**）。bonus 呈现由模板判 `bonusItem.qty > 0`。
 */
const bonusCell = computed<SigninGridCell | null>(
  () => cells.value.find((c) => c.cycle_day === 7) || cells.value.find((c) => c.is_bonus) || null,
);

/** 网格槽位（**行主序** 8 槽 = r1c1 艺术位 ＋ 7 日格，R-8；判别联合 ⇒ 模板窄化） */
type GridSlot =
  | { key: string; art: true }
  | { key: string; art: false; day: SigninGridCell };

/** 行主序 8 槽 → 4 条纵列（i%4 落列 ⇒ col0=[art,d4] col1=[d1,d5] col2=[d2,d6] col3=[d3,d7]；R-8 阅读序） */
const gridColumns = computed<GridSlot[][]>(() => {
  const slots: GridSlot[] = [{ key: 'scene-art', art: true }];
  cells.value.forEach((d) => slots.push({ key: `day-${d.cycle_day}`, art: false, day: d }));
  const cols: GridSlot[][] = [[], [], [], []];
  slots.forEach((slot, i) => cols[i % 4].push(slot));
  return cols;
});

/** 已补签显示态（**纯展示**）：本会话补签成功的那一格（服务端已翻成 signed）＝ 已签形态 ＋「已补签」词 */
function isMadeup(day: SigninCalendarDay): boolean {
  return !!props.madeupDate && day.state === 'signed' && day.date === props.madeupDate;
}
</script>

<style scoped>
/* ================= 每日签到 · 游戏化沉浸式场景卡 =================
   拟物三件套（S-6）：渐变 ＋ 描边 ＋ 投影；配色**固定红金羊皮**（S-9，不随夜间模式反转）。
   深色锚点：#5A3210（深棕）/ #4A0D0D（深红）。唯一图片 = **全卡背景**石榴树插画（.scene-bg · base64 内联），
   r1c1 的 .scene-art = 纯透明占位格（不可见）；动效 CSS-only（S-10）。
   R-6：卡底 padding-bottom 16px ⇒ 「今日奖励」行与卡底间距 ≥ 12px。 */
.scene-card {
  position: relative; overflow: hidden;
  border-radius: 16px; padding: 14px 12px 16px; margin-bottom: 16px;
  background: linear-gradient(168deg, #B3341F 0%, #8E1A12 100%); /* 深红氛围底 */
  border: 1.5px solid #E8C36A; /* 细金描边 */
  box-shadow: 0 6px 16px rgba(74, 13, 13, 0.35);
}

/* ---- S-8 场景层：底图（全卡背景）/ 右上暖光 / 四角 vignette / 可读性 scrim；r1c1 的 .scene-art = 纯透明占位格 ---- */
/* 场景底图层 = **左条带背景**（唯一图片）：石榴树插画 240×188 · 12 色透明 PNG · 9,423 B · base64 内联（12,564 字符）
   （mp-weixin wxss 不吃本地路径 background-image ⇒ data URI；不往 src/static 放位图 —— 800×626 原图 644 KB / 上一版 32 色图 53,208 字符都白吃主包）。
   两层背景：上层插画（**按宽度缩放、高度自适应** `25% auto` + **left top** ⇒ 图只占卡宽左侧 1/4 的一条带：
   宽 25% × 原图纵横比 240:188（≈1.277），右侧露出下层深红渐变；不 cover / 不居中 / 不重复），
   下层 = 现有深红渐变兜底（图片不加载也不裂，兜底仍 center）。原画透明底、无地面/树干底座 ⇒ 只作背景，不参与布局、
   不承载任何文字；卡头/底部按钮区的压暗由 .scene-scrim（局部窄带）承担。
   响应式断点（单一 token = 768px）：≥768px（PC / 宽版浏览器）图宽 25% 卡宽；<768px（H5 / 手机）图宽 50% 卡宽，
   见下方 @media 块。 */
.scene-bg {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0; pointer-events: none;
  background-image:
    url("data:image/png;base64,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"),
    linear-gradient(168deg, #B3341F 0%, #8E1A12 100%);
  background-size: 25% auto, auto;
  background-position: left top, center;
  background-repeat: no-repeat, no-repeat;
}
/* 响应式：单一断点 token = 768px（宽屏 ≥768px ⇒ 25% 卡宽左条带；窄屏 <768px ⇒ 50% 卡宽左条带）。
   改档只改这一处：把下面 767/50% 与上面 25% 成对调整即可。 */
@media (max-width: 767px) {
  .scene-bg { background-size: 50% auto, auto; }
}
/* 右上暖光占位：光晕团（建议 320×320 径向光斑 PNG；当前 = CSS radial-gradient 代位） */
.scene-glow {
  position: absolute; top: -46px; right: -34px; width: 220px; height: 220px;
  background: radial-gradient(circle, rgba(255, 214, 140, 0.42) 0%, rgba(255, 214, 140, 0) 70%);
  pointer-events: none;
}
/* 四角压暗 vignette（拟物；贴图后保留作压暗层，保证日格可读性） */
.scene-vignette {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 58%, rgba(58, 8, 8, 0.4) 100%);
  pointer-events: none;
}
/* ---- 文字可读性 scrim（**局部化：只护文字区**，不整卡铺开）
   全卡背景图垫在「卡头标题/副标题」与「底部读数/按钮/奖励行」之下，故只在两处压暗，色 = 深红锚点 #4A0D0D：
   ① 顶部窄带 `100% × 60px`（= 卡头文字行高，padding-top 14 + 两行文字）内**横向**渐变：左浓 0.80 → 48% 处 0.50
      → 84% 处 0（卡头右侧/右上暖光不压，插画树冠上部保持原亮度）；
   ② 底部窄带 `100% × 132px`（= 读数行 ＋ 主按钮 ＋ 奖励入口 ＋ 卡底留白）内**纵向**渐变（0deg = 自卡底向上）：
      底 0.76 → 55% 处 0.72 → 90% 处 0.58 → 顶 0（本版整体减档 ≈ 10~17%：0.86→0.76 / 0.84→0.72 / 0.70→0.58）；
      减档后已逐像素重测 WCAG：读数行 / 奖励行 / 卡头标题 / 卡头副标题 全部 ≥ 4.5:1（实测表见交付报告），
      只有最上 13px（≈ 网格底缘）才淡出，**不向插画中段蔓延**。
   两带用 background-size + background-position(left top / left bottom) 定位、no-repeat ⇒ 网格中段（日格与大奖列之间、
   卡面右侧）**不叠加任何遮罩**。只压背景层，**不作用于日格**（日格 = 米黄羊皮不透明卡，本身不受背景影响）。 */
.scene-scrim {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0; pointer-events: none;
  background-image:
    linear-gradient(90deg, rgba(74, 13, 13, 0.80) 0%, rgba(74, 13, 13, 0.50) 48%, rgba(74, 13, 13, 0) 84%),
    linear-gradient(0deg, rgba(74, 13, 13, 0.76) 0%, rgba(74, 13, 13, 0.72) 55%, rgba(74, 13, 13, 0.58) 90%, rgba(74, 13, 13, 0) 100%);
  background-size: 100% 60px, 100% 132px;
  background-position: left top, left bottom;
  background-repeat: no-repeat, no-repeat;
}

/* 内容层整体抬高到占位层之上（占位层无命中） */
.scene-head, .scene-grid, .scene-streak, .scene-error, .scene-cta, .scene-reward { position: relative; }

/* 标题行（金色实心＋深描边阴影；S-9：mp 无 background-clip:text 的降级即此形态，两态同款）
   ＋ 卡头右端连签令牌徽章（R-8）：标题/提示列居左、徽章居右，两端对齐 */
.scene-head { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; }
.scene-head-text { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
/* 标题/副标题文字描影：全卡背景图在其下方 ⇒ 略加投影（不新增背景块、不改字号/颜色令牌） */
.scene-title { font-size: 17px; font-weight: bold; color: #FFE9B8; letter-spacing: 3px; text-shadow: 0 1px 2px rgba(58, 8, 8, 0.85), 0 1px 0 rgba(90, 30, 10, 0.65); }
/* A 项打磨（小字对比）：副标题压在插画左条带的白/浅米色「天空」块上（窄屏 50% 条带可达卡宽一半），
   #F6D9A0 在最亮块上实测仅 3.60:1；顶部窄带遮罩本轮**不动**，故只提字色亮度到 #FFFFFF（实测 296~390 卡宽全档 ≥ 4.6:1；#FFF6EA 在 296/327 宽仅 4.36~4.40），
   并把描影加一档 0 0 3px 压住块边过渡。字号 11px 不变。 */
.scene-hint { font-size: 11px; color: #FFFFFF; text-shadow: 0 1px 2px rgba(58, 8, 8, 0.85), 0 0 3px rgba(58, 8, 8, 0.55); }

/* ---- 卡头连签令牌徽章（R-8 自网格移出 ＋ R-5 拟物化：金边令牌/胶囊形）----
   streak 缺失 ⇒ 整枚不渲染（模板 v-if）；鎏金渐变 ＋ 深棕描边 ＋ 内圈高光，呼应大奖列金边 */
.streak-badge {
  flex-shrink: 0; display: flex; align-items: center;
  padding: 3px 10px; border-radius: 999px;
  background: linear-gradient(160deg, #F6D488 0%, #D9A94E 55%, #C08E3A 100%);
  border: 1.5px solid #8A5A18;
  box-shadow: 0 2px 4px rgba(58, 8, 8, 0.35), inset 0 0 0 1px rgba(255, 246, 226, 0.55);
}
.streak-badge-text { font-size: 10px; font-weight: bold; color: #5A3210; line-height: 1.4; white-space: nowrap; }

/* ---- 场景网格（S-4 · R-8：2 行 × 5 列；第 5 列纵跨 2 行）----
   4 条 .scene-col 各叠 2 槽（flex 纵列，mp 兼容），列距 6 / 行距 12（行距＞页签上探 9px，防叠压）；
   R-3 等宽：5 列全部 flex:1（见 .scene-prize 的 border-box），列宽极差 ≤ 1px */
.scene-grid { display: flex; align-items: stretch; gap: 6px; margin-top: 18px; }
.scene-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.scene-slot { position: relative; flex: 1; display: flex; }

/* R-8 占位槽（r1c1）= **纯透明占位格（不可见，保留网格槽位，勿放内容）**：
   只占网格位置、撑列高与日格对齐；**不渲染任何内容**（无图 / 无渐变 / 无描边 / 无投影）。
   石榴树插画已上移为全卡背景 .scene-bg —— 此处不得再放 data URI 或 background-image。 */
.scene-art {
  flex: 1; border: none; box-shadow: none; background: transparent;
  pointer-events: none;
}

/* 日格 = 米黄羊皮底 ＋ 细棕描边内框 ＋ 顶部「页签」日标签（S-6 逐值）
   羊皮底为**不透明实色渐变**（背景插画不透出 ⇒ 格内小字只对羊皮取对比，不受底图干扰）＋ 极淡内阴影收边 */
.day-cell {
  position: relative; flex: 1; display: flex; flex-direction: column; align-items: center;
  padding: 12px 2px 5px; border-radius: 10px;
  background: linear-gradient(180deg, #FBF0D2 0%, #EDD49E 100%);
  border: 1px solid #B98A4E;
  box-shadow: 0 2px 4px rgba(58, 8, 8, 0.3), inset 0 0 0 1px rgba(255, 250, 235, 0.5), inset 0 0 6px rgba(120, 74, 30, 0.10);
}
/* 页签（米黄圆角横条、深棕粗体）：骑缝上探 9px；今日 = 橙色高亮 #FF8C1A（唯一强高亮，R-1） */
.cell-tab {
  position: absolute; top: -9px; left: 50%; transform: translateX(-50%);
  max-width: 96%; padding: 1px 5px; border-radius: 8px; box-sizing: border-box;
  background: linear-gradient(180deg, #FBEFD0, #F2DDA8);
  border: 1px solid #B98A4E;
}
.cell-tab-text { font-size: 10px; font-weight: bold; color: #5A3210; line-height: 1.35; word-break: break-all; text-align: center; display: block; }
.cell-tab-today { background: linear-gradient(180deg, #FFA13F, #FF8C1A); border-color: #D96F0A; }
.cell-tab-today .cell-tab-text { color: #FFF6EA; }

/* 图标 ＋ 数量角标 ＋ 打勾的叠放容器（多件基础项自动折行；角标压在各自图标左上角） */
.cell-body { position: relative; width: 100%; flex: 1; min-height: 26px; display: flex; align-items: center; justify-content: center; }
.cell-items { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2px; }
.cell-item { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.cell-ico { width: 16px; height: 16px; }
/* 左上数量角标（黄字深描边；四向 text-shadow 描边 = mp 安全的描边方案） */
.cell-qty {
  position: absolute; top: -6px; left: -8px; font-size: 10px; line-height: 1; font-weight: bold; color: #FFD34D;
  text-shadow: -1px 0 #5A3210, 1px 0 #5A3210, 0 -1px #5A3210, 0 1px #5A3210, 0 0 2px rgba(74, 13, 13, 0.9);
}
/* 状态①文案腿：已签打勾（右上叠标） */
.cell-check { position: absolute; right: 2px; top: 0; font-size: 13px; line-height: 1; font-weight: bold; color: #2E7D32; }
/* 底部状态行（深棕小字）：漏签「补签」/ 已补「已补签」（10px 下限，字号不动）。
   A 项打磨：已签/已补格整格 opacity .62 ⇒ 该词随格被洗白，故字色由 #5A3210 再深一级到 #4A0D0D，
   并加四向 1px 深色描边（rgba(74,13,13,.55) ×4）＝ mp 安全描边，抵掉置淡后的边缘发糊。 */
.cell-state-word {
  font-size: 10px; line-height: 1.3; font-weight: bold; color: #4A0D0D; margin-top: 2px;
  text-shadow: -1px 0 1px rgba(74, 13, 13, 0.55), 1px 0 1px rgba(74, 13, 13, 0.55), 0 -1px 1px rgba(74, 13, 13, 0.55), 0 1px 1px rgba(74, 13, 13, 0.55);
}
/* 「已补签」格整格 opacity .62（四态编码，冻结）⇒ 该词再深一档到 #2E0606，抵掉置淡后的洗白
   （实测：4.18:1 → 4.8x:1，墨迹极值口径） */
.cell-madeup .cell-state-word { color: #2E0606; }
/* 格底「随机」chip（口径不变：只标随机、不预标品种，§15-7）—— 实色底＋粗体，10px 起 */
.cell-chip {
  font-size: 10px; line-height: 1.3; font-weight: bold; color: #5A3210; padding: 0 6px; margin-top: 2px;
  border: 1px solid #B98A4E; border-radius: 8px; background: #FFF8EC;
}

/* 状态①：已签 = 置淡 ＋ 打勾 */
.cell-signed { opacity: 0.62; }
/* 状态②：待签（今日）= 橙描边高亮 ＋ 呼吸光晕（S-10 CSS 动效；R-1：全卡唯一动画格） */
.cell-today { border-color: #FF8C1A; animation: cell-breathe 2.2s ease-in-out infinite; }
@keyframes cell-breathe {
  0%, 100% { box-shadow: 0 2px 4px rgba(58, 8, 8, 0.3), 0 0 0 2px rgba(255, 140, 26, 0.35); }
  50% { box-shadow: 0 2px 4px rgba(58, 8, 8, 0.3), 0 0 10px 3px rgba(255, 140, 26, 0.55); }
}
/* 状态③：漏签 = 虚线描边可点补签（底色略沉；R-1：描边降为低饱和 #B08A78，不抢今日橙、无光晕；
   点击 → 页面二次确认，判据在页面） */
.cell-missed { border-style: dashed; border-color: #B08A78; background: linear-gradient(180deg, #F8E7C8, #EAD3A0); }
.cell-tappable { cursor: pointer; }
.cell-hover { transform: scale(0.97); opacity: 0.85; }
/* 状态④：未来 = 置灰 */
.cell-future { opacity: 0.55; background: linear-gradient(180deg, #E4D9C2, #D3C3A0); border-color: #A98F63; }
/* 已补签 = 已签形态 ＋ 底色转青灰羊皮 ＋ 实线边（显示态；判据仍在页面） */
.cell-madeup { background: linear-gradient(180deg, #EFE3C6, #DCC79C); border-color: #8F7B54; }

/* ---- 第 5 列：连签 7 天大奖列（纵跨 2 行；R-4：红绸缎面高光条纹 ＋ 鎏金描边；S-6）
   视觉权重**降一档**（金边 3px→2px、金色降饱和、内发光 0.28→0.18）⇒ 主按钮成为全卡唯一第一焦点；
   但保留红绸缎面＋金边＋旗标三件，可识别度不降（不与日格同形）。----
   R-3 等宽：外层 .scene-prize 为纯布局列（flex:1、无 padding/border ⇒ flex 基尺寸与 4 条
   .scene-col 同为 0，五列极差 ≤ 1px）；视觉（缎面/鎏金框/状态）全在内层 .prize-frame。
   （flex-basis:0 即便 border-box 也不会把 padding/border 吸进基尺寸 —— 内容盒钳 0 后基尺寸=PB，
   故「框内移」是等宽的唯一干净解，实测见夹具 R-3b。） */
.scene-prize { flex: 1; min-width: 0; display: flex; }
.prize-frame {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  border-radius: 12px; padding: 13px 3px 9px;
  background:
    repeating-linear-gradient(115deg, rgba(255, 236, 200, 0.10) 0 5px, rgba(255, 236, 200, 0) 5px 12px),
    linear-gradient(180deg, #C43B26 0%, #8E1A12 52%, #A02A18 100%);
  border: 2px solid #E3C283; /* 鎏金描边（降一档：3px→2px、金 #F2CE7B→#E3C283 降饱和）；仍为「第 7 格金边大奖」的列形态承载 */
  box-shadow: inset 0 0 10px rgba(255, 214, 140, 0.18), 0 2px 6px rgba(58, 8, 8, 0.32);
  animation: prize-float 3.2s ease-in-out infinite; /* S-10 轻微浮动 */
}
@keyframes prize-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
/* 异形旗标（燕尾旗：矩形 ＋ 下探三角，border 法实现 —— mp 免 clip-path）；
   R-4 加大加重：12px 粗体，窄列内自动换行（去 nowrap），两行旗标更显眼 */
.prize-flag {
  position: relative; padding: 2px 4px 3px; border-radius: 5px 5px 0 0;
  background: linear-gradient(180deg, #F6D488, #E0A94E);
  border: 1px solid #B9852E;
}
.prize-flag-text { font-size: 12px; font-weight: bold; color: #7A1610; line-height: 1.3; word-break: break-all; text-align: center; }
.prize-flag-tail {
  position: absolute; top: 100%; left: 50%; margin-left: -6px; width: 0; height: 0;
  border-top: 6px solid #C9973F; border-left: 6px solid transparent; border-right: 6px solid transparent;
}
.prize-body { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.prize-item { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.prize-ico { width: 26px; height: 26px; }
/* A 项打磨：大奖列 ×10 —— 字号 11px 与 bold 不动，描边由四向加到八向 1px（色由 #5A3210 再深到 #4A0D0D）
   ＋ 两层深色光晕（3px / 6px）⇒ 红缎面 + 缎纹条纹底上字形边缘不再被吃掉。
   （字色仍取浅金 #FFD34D：红底上「再深一级」会直接降对比，故只加深描边、不提深字色。） */
.prize-qty {
  position: absolute; top: -7px; right: -13px; font-size: 11px; line-height: 1; font-weight: bold; color: #FFD34D;
  text-shadow: -1px -1px #4A0D0D, 1px -1px #4A0D0D, -1px 1px #4A0D0D, 1px 1px #4A0D0D,
    -1px 0 #4A0D0D, 1px 0 #4A0D0D, 0 -1px #4A0D0D, 0 1px #4A0D0D,
    0 0 3px rgba(74, 13, 13, 0.95), 0 0 6px rgba(74, 13, 13, 0.7);
}
/* 第 7 格状态（与日格同一套状态语言的三重编码） */
.prize-check { font-size: 15px; line-height: 1; font-weight: bold; color: #FFE9B8; }
.prize-state-word { font-size: 10px; font-weight: bold; color: #FFE9B8; }
.prize-signed { opacity: 0.85; }
.prize-today { box-shadow: inset 0 0 10px rgba(255, 214, 140, 0.18), 0 0 0 2px rgba(255, 140, 26, 0.55), 0 2px 6px rgba(58, 8, 8, 0.32); }
.prize-missed { border-style: dashed; }
.prize-future { opacity: 0.75; }

/* 连签读数行 / 错误行（§15-7 口径；错误 = 后端原文透出） */
.scene-streak { display: block; margin-top: 10px; font-size: 12px; color: #FFE9B8; text-align: center; }
.scene-error { display: block; margin-top: 4px; font-size: 12px; color: #FFB4A6; text-align: center; }

/* 主按钮：红渐变胶囊 ＋ 金描边 ＋ 底部硬投影（S-6）；按压 = hover-class 位移（mp 无 :active） */
.scene-cta {
  display: flex; align-items: center; justify-content: center;
  width: 210px; margin: 14px auto 0; padding: 9px 0; border-radius: 999px;
  background: linear-gradient(180deg, #D8502F 0%, #A3220F 100%);
  border: 1.5px solid #F2CE7B;
  box-shadow: 0 4px 0 #4A0D0D, 0 6px 12px rgba(58, 8, 8, 0.35);
  transition: transform 0.06s ease, box-shadow 0.06s ease;
}
.scene-cta-text { font-size: 20px; font-weight: bold; color: #FFF6EA; line-height: 1.2; }
.scene-cta-press { transform: translateY(3px); box-shadow: 0 1px 0 #4A0D0D; }
/* 已签 = 置淡（与既有印章置灰同语义）；请求中 = 半透明 */
.scene-cta-done { background: linear-gradient(180deg, #C9BEB2, #A79A8C); border-color: #E5D9C2; box-shadow: 0 4px 0 #6E5A48; }
.scene-cta-busy { opacity: 0.6; }

/* 今日奖励入口行（子包入口，不显示 x/3 进度；行→卡底间距由卡 padding-bottom 16px 保证 ≥ 12px，R-6） */
.scene-reward { display: block; margin-top: 10px; font-size: 12px; color: #F6D9A0; text-align: center; text-decoration: underline; }

/* 动效降级（H5 无障碍；小程序端忽略此查询、保持动效） */
/* #ifdef H5 */
@media (prefers-reduced-motion: reduce) {
  .cell-today, .prize-frame { animation: none; }
}
/* #endif */
</style>
