<template>
  <!--
    每日签到 · 游戏化沉浸式场景卡（S-6 拟物三件套：渐变＋描边＋投影；S-9 配色固定红金羊皮，不随夜间模式反转）。
    **纯展示组件**（S-2）：props 进数据、emit 出动作；请求 / 已签判据（服务端 signin_date）/ 补签二次确认 /
    签到 409 处理全部留在「我的」页；文案字面单点 = business/asset-text.ts（本组件不散落签到中文句）；
    本批**零图片**（S-8：场景全部 CSS 拟物，具名占位类 .scene-bg / .scene-glow / .scene-art 见各层注释）。
  -->
  <view class="scene-card">
    <!-- S-8 场景占位层（本批零图片、CSS 拟物代位；立绘占位已并入网格 r1c1 艺术位 .scene-art，见网格注释） -->
    <view class="scene-bg" />
    <view class="scene-glow" />
    <view class="scene-vignette" />

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
      左 4 列 × 2 行 = 8 槽：r1c1 = **空艺术位**（.scene-art，预留立绘/背景图，图片后补）＋ 7 个日格；
      阅读序 r1c2→r1c4 = 第 1~3 天、r2c1→r2c4 = 第 4~7 天。实现 = 4 条 flex 纵列（mp 兼容，不用 display:grid）；
      槽位**行主序** [艺术位, d1..d7] 按 i%4 落列 ⇒ col0=[art,d4] col1=[d1,d5] col2=[d2,d6] col3=[d3,d7]。
      「已连签 N 天」徽章已移出网格 → 卡头（R-8；取代此前「徽格恒第 4 列第 2 行」口径）。
      calendar 为空（旧后端缺键 / 非 7 长）⇒ 网格整区不渲染（**不臆造格子**）。
    -->
    <view v-if="cells.length" class="scene-grid">
      <view v-for="(col, ci) in gridColumns" :key="`col-${ci}`" class="scene-col">
        <view v-for="slot in col" :key="slot.key" class="scene-slot">
          <!--
            R-8 艺术位（r1c1）：预留立绘 / 背景图（**图片后补**，建议 ≤160×160 PNG/WebP 半透明）；
            空态 = 深红渐变装饰底，**不渲染任何文字**。
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
   深色锚点：#5A3210（深棕）/ #4A0D0D（深红）。本批零图片（S-8），动效 CSS-only（S-10）。
   R-6：卡底 padding-bottom 16px ⇒ 「今日奖励」行与卡底间距 ≥ 12px。 */
.scene-card {
  position: relative; overflow: hidden;
  border-radius: 16px; padding: 14px 12px 16px; margin-bottom: 16px;
  background: linear-gradient(168deg, #B3341F 0%, #8E1A12 100%); /* 深红氛围底 */
  border: 1.5px solid #E8C36A; /* 细金描边 */
  box-shadow: 0 6px 16px rgba(74, 13, 13, 0.35);
}

/* ---- S-8 图片占位层（本批零图片、CSS 拟物代位；立绘占位 = 网格 r1c1 的 .scene-art 格）---- */
/* 场景底图占位：整卡氛围底（建议 750×420 PNG/WebP，自带压暗；贴图后置于本层 background，CSS 渐变可撤） */
.scene-bg { position: absolute; top: 0; right: 0; bottom: 0; left: 0; pointer-events: none; }
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
/* 内容层整体抬高到占位层之上（占位层无命中） */
.scene-head, .scene-grid, .scene-streak, .scene-error, .scene-cta, .scene-reward { position: relative; }

/* 标题行（金色实心＋深描边阴影；S-9：mp 无 background-clip:text 的降级即此形态，两态同款）
   ＋ 卡头右端连签令牌徽章（R-8）：标题/提示列居左、徽章居右，两端对齐 */
.scene-head { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; }
.scene-head-text { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.scene-title { font-size: 17px; font-weight: bold; color: #FFE9B8; letter-spacing: 3px; text-shadow: 0 1px 0 rgba(90, 30, 10, 0.65); }
.scene-hint { font-size: 11px; color: #F6D9A0; }

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

/* R-8 艺术位（r1c1）：预留立绘/背景图（**图片后补**，建议 ≤160×160 PNG/WebP 半透明）；
   空态 = 深红渐变装饰底 ＋ 极弱金线内框（呼应卡描边），不渲染任何文字 */
.scene-art {
  flex: 1; border-radius: 10px;
  background: linear-gradient(165deg, #A93A24 0%, #8E1A12 58%, #7C150F 100%);
  box-shadow: inset 0 0 0 1px rgba(232, 195, 106, 0.22), inset 0 6px 14px rgba(0, 0, 0, 0.18);
}

/* 日格 = 米黄羊皮渐变底 ＋ 细棕描边内框 ＋ 顶部「页签」日标签（S-6 逐值） */
.day-cell {
  position: relative; flex: 1; display: flex; flex-direction: column; align-items: center;
  padding: 12px 2px 4px; border-radius: 10px;
  background: linear-gradient(180deg, #FBF0D2 0%, #EDD49E 100%);
  border: 1px solid #B98A4E;
  box-shadow: 0 2px 4px rgba(58, 8, 8, 0.3), inset 0 0 0 1px rgba(255, 250, 235, 0.5);
}
/* 页签（米黄圆角横条、深棕粗体）：骑缝上探 9px；今日 = 橙色高亮 #FF8C1A（唯一强高亮，R-1） */
.cell-tab {
  position: absolute; top: -9px; left: 50%; transform: translateX(-50%);
  max-width: 96%; padding: 1px 5px; border-radius: 8px; box-sizing: border-box;
  background: linear-gradient(180deg, #FBEFD0, #F2DDA8);
  border: 1px solid #B98A4E;
}
.cell-tab-text { font-size: 9px; font-weight: bold; color: #5A3210; line-height: 1.35; word-break: break-all; text-align: center; display: block; }
.cell-tab-today { background: linear-gradient(180deg, #FFA13F, #FF8C1A); border-color: #D96F0A; }
.cell-tab-today .cell-tab-text { color: #FFF6EA; }

/* 图标 ＋ 数量角标 ＋ 打勾的叠放容器（多件基础项自动折行；角标压在各自图标左上角） */
.cell-body { position: relative; width: 100%; flex: 1; min-height: 26px; display: flex; align-items: center; justify-content: center; }
.cell-items { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2px; }
.cell-item { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.cell-ico { width: 16px; height: 16px; }
/* 左上数量角标（黄字深描边；四向 text-shadow 描边 = mp 安全的描边方案） */
.cell-qty {
  position: absolute; top: -5px; left: -7px; font-size: 9px; line-height: 1; font-weight: bold; color: #FFD34D;
  text-shadow: -1px 0 #5A3210, 1px 0 #5A3210, 0 -1px #5A3210, 0 1px #5A3210;
}
/* 状态①文案腿：已签打勾（右上叠标） */
.cell-check { position: absolute; right: 2px; top: 0; font-size: 13px; line-height: 1; font-weight: bold; color: #2E7D32; }
/* 底部状态行（深棕小字）：漏签「补签」/ 已补「已补签」 */
.cell-state-word { font-size: 9px; line-height: 1.3; font-weight: bold; color: #5A3210; margin-top: 2px; }
/* 格底「随机」chip（口径不变：只标随机、不预标品种） */
.cell-chip {
  font-size: 9px; line-height: 1.3; color: #5A3210; padding: 0 5px; margin-top: 2px;
  border: 1px solid #C79A55; border-radius: 8px; background: rgba(255, 247, 236, 0.9);
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

/* ---- 第 5 列：连签 7 天大奖列（纵跨 2 行；R-4：红绸缎面高光条纹 ＋ 鎏金描边加粗；S-6）----
   R-3 等宽：外层 .scene-prize 为纯布局列（flex:1、无 padding/border ⇒ flex 基尺寸与 4 条
   .scene-col 同为 0，五列极差 ≤ 1px）；视觉（缎面/鎏金框/状态）全在内层 .prize-frame。
   （flex-basis:0 即便 border-box 也不会把 padding/border 吸进基尺寸 —— 内容盒钳 0 后基尺寸=PB，
   故「框内移」是等宽的唯一干净解，实测见夹具 R-3b。） */
.scene-prize { flex: 1; min-width: 0; display: flex; }
.prize-frame {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  border-radius: 12px; padding: 12px 3px 8px;
  background:
    repeating-linear-gradient(115deg, rgba(255, 236, 200, 0.10) 0 5px, rgba(255, 236, 200, 0) 5px 12px),
    linear-gradient(180deg, #C43B26 0%, #8E1A12 52%, #A02A18 100%);
  border: 3px solid #F2CE7B; /* 鎏金描边（R-4 加粗）= §15-7「第 7 格金边大奖」的列形态承载 */
  box-shadow: inset 0 0 12px rgba(255, 214, 140, 0.28), 0 3px 8px rgba(58, 8, 8, 0.4);
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
.prize-qty {
  position: absolute; top: -6px; right: -12px; font-size: 10px; line-height: 1; font-weight: bold; color: #FFD34D;
  text-shadow: -1px 0 #5A3210, 1px 0 #5A3210, 0 -1px #5A3210, 0 1px #5A3210;
}
/* 第 7 格状态（与日格同一套状态语言的三重编码） */
.prize-check { font-size: 15px; line-height: 1; font-weight: bold; color: #FFE9B8; }
.prize-state-word { font-size: 9px; font-weight: bold; color: #FFE9B8; }
.prize-signed { opacity: 0.85; }
.prize-today { box-shadow: inset 0 0 12px rgba(255, 214, 140, 0.28), 0 0 0 2px rgba(255, 140, 26, 0.55), 0 3px 8px rgba(58, 8, 8, 0.4); }
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
