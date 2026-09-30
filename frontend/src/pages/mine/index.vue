<template>
  <view class="container">
    <!-- 用户卡片 -->
    <view class="user-card">
      <view class="avatar">👤</view>
      <view class="user-info">
        <text v-if="isAuthenticated()" class="user-name">{{ authState.nickname }}</text>
        <text v-else class="user-name">未登录</text>
        <text v-if="isAuthenticated()" class="user-phone">{{ maskPhone(authState.phone) }}</text>
        <t-tag
          v-if="isAuthenticated()"
          :theme="roleTagTheme(authState.role)"
          variant="light"
          size="small"
          class="role-tag"
        >{{ roleName(authState.role) }}</t-tag>
        <!-- 绑定信息降级为用户卡内一行：已绑定 ⇒ 树名 + 我的节点；未绑定 ⇒ 可点「去家谱列表」（tabBar 切换） -->
        <text v-if="isAuthenticated() && anchor" class="bind-line">🌳 {{ boundTreeName }} · 我的节点 {{ anchorPersonName || anchor.person_handle }}</text>
        <text v-else-if="isAuthenticated()" class="bind-line">尚未加入任何家族树 · <text class="bind-line-link" @click="goHall">去家谱列表</text></text>
      </view>
      <view class="user-action">
        <t-button
          v-if="!isAuthenticated()"
          size="small"
          theme="primary"
          @click="goLogin"
        >登录 / 注册</t-button>
        <t-button
          v-else
          size="small"
          variant="outline"
          theme="danger"
          @click="doLogout"
        >退出</t-button>
      </view>
    </view>

    <!-- 行囊（游戏背包样式 · 6×6 = 36 栏位）：位于「用户卡正下方」（未登录亦同址渲染 36 空格 + 提示）；
         占格（整堆 / 余数 / 碎片）/ 默认序 / 溢出 / 玉只计未镶嵌见 business/inventory.ts；
         操作成功（合成 / 分解）由组件 emit('refresh') 就地重拉 summary -->
    <asset-inventory
      :summary="inventorySummary"
      :error="inventoryError"
      :loading="inventoryLoading"
      :authenticated="isAuthenticated()"
      :scroll-lock="scrollLock"
      @refresh="refreshInventory"
    />

    <!-- 每日签到（独立卡 · 古风印章式）：置于行囊卡下方；**不展示碎片进度（N/9）**，签到结果只走 toast。
         本批新增：7 天签到日历条（**真实道具图标 + 数量角标 + 状态色 + 第 7 天金边大奖**）、连签行、
         漏签格二次确认后**花竹片补签**；日历数据来自 `GET /assets/summary` 的 `signin_calendar`（**不新增请求**） -->
    <view v-if="isAuthenticated()" class="sign-card">
      <view class="sign-top">
        <view
          class="sign-seal"
          :class="{ 'sign-seal-done': signedToday, 'sign-seal-busy': signing }"
          @click="doSignin"
        >签</view>
        <view class="sign-body">
          <text class="sign-title">{{ SIGNIN_TITLE }}</text>
          <text class="sign-hint">{{ signedToday ? SIGNIN_HINT_DONE : SIGNIN_HINT_PENDING }}</text>
          <!-- 连签行：`streak` 缺失（后端未重启）⇒ 空串 = 整行不渲染，不显 NaN、不臆造 -->
          <text v-if="streakText" class="sign-streak">{{ streakText }}</text>
          <text v-if="signError" class="sign-error">{{ signError }}</text>
        </view>
      </view>

      <!-- 签到 7 天日历条（7 格横排）：口径 = 只标**固定基础** + 「随机」标记（方案乙，Kevin 2026-09-28 拍定）——
           格内逐项出**真实道具图标**（business/icons.ts 单点；`qty > 1` 才出 `×N` 角标）；
           底部短 chip = 当天还会随机掉一件（**不预标**随机品种）；第 7 天另出大奖图标 + `×N`（金边）；
           日序标签 `第 N 天` / `第 7 天 · 大奖`；状态色 = 已签（置淡 + 打勾）/ 今天（朱红描边）/ 漏签（虚线边 · 可点击补签）/ 未来（灰）；
           缺键 / 非 7 长（旧后端）⇒ 整条不渲染（**不臆造格子**）；`base` / `bonus` 缺键 ⇒ 回退单件渲染（不崩、不显 NaN） -->
      <view v-if="signinCalendar.length" class="sign-cal">
        <view
          v-for="c in signinCalendar"
          :key="c.cycle_day"
          class="cal-cell"
          :class="[`cal-${c.state}`, { 'cal-bonus': c.is_bonus, 'cal-tappable': c.state === 'missed' && !makeupBusy }]"
          @click="onCalendarCell(c)"
        >
          <view class="cal-slot">
            <view class="cal-items">
              <view v-for="(it, i) in c.baseItems" :key="`base-${i}`" class="cal-item">
                <image v-if="assetKindIconSrc(it.kind)" class="cal-ico" :src="assetKindIconSrc(it.kind)" mode="aspectFit" />
                <text v-if="it.qty > 1" class="cal-qty">{{ signinQtyBadge(it.qty) }}</text>
              </view>
              <!-- 第 7 天大奖（缺失 ⇒ 空项 `qty === 0` ⇒ 不渲染，不显 NaN） -->
              <view v-if="c.bonusItem.qty > 0" class="cal-item">
                <image v-if="assetKindIconSrc(c.bonusItem.kind)" class="cal-ico" :src="assetKindIconSrc(c.bonusItem.kind)" mode="aspectFit" />
                <text class="cal-qty">{{ signinQtyBadge(c.bonusItem.qty) }}</text>
              </view>
            </view>
            <text v-if="c.state === 'signed'" class="cal-check">{{ SIGNIN_CELL_CHECK }}</text>
          </view>
          <text class="cal-day">{{ signinDayLabel(c.cycle_day, c.is_bonus) }}</text>
          <text v-if="c.random" class="cal-chip">{{ SIGNIN_RANDOM_CHIP }}</text>
        </view>
      </view>

      <!-- 今日奖励入口（子包页 pages/task/index）：不显示 x/3 进度，本行不新增取数；
           位置 = 日历条**之下**（与「签到读数在下、领奖入口最后」的阅读顺序一致） -->
      <text class="sign-reward" @click="goTaskCenter">{{ SIGNIN_REWARD_LINK }}</text>
    </view>

    <!-- 家族互动（好友域入口 · 子包 pages/friend）：位置 = 每日签到卡之后、功能菜单卡之前 -->
    <view v-if="isAuthenticated()" class="interact-card">
      <text class="interact-title">🤝 家族互动</text>
      <view class="friend-entry">
        <view class="fe-item" @click="goFriends">
          <text class="fe-icon">👥</text>
          <text class="fe-text">好友列表</text>
        </view>
        <view class="fe-item" @click="goInviteFriend">
          <text class="fe-icon">＋</text>
          <text class="fe-text">邀请好友</text>
        </view>
        <!-- 邀请族人加入（批 C-2 **入口二 · 普通型**）：不针对任何节点、可多次使用；
             本页为唯一「新写请求」点：POST /invite/code {kind:'plain'} → 就地展示短链 + 复制 -->
        <view class="fe-item fe-item-wide" @click="goInviteClan">
          <text class="fe-icon">🏮</text>
          <text class="fe-text">{{ INVITE_PLAIN_ENTRY }}</text>
        </view>
      </view>
    </view>

    <!-- 普通型邀请链接（就地覆盖层：短链 + 复制；文案取邀请域单点） -->
    <view v-if="inviteOpen" class="modal-mask" @click="inviteOpen = false">
      <view class="modal" @click.stop>
        <text class="modal-title">{{ INVITE_PLAIN_ENTRY }}</text>
        <text class="modal-sub">{{ INVITE_PLAIN_HINT }}</text>
        <text v-if="inviteError" class="bind-error">{{ inviteError }}</text>
        <template v-else-if="inviteShort">
          <text class="invite-label">{{ INVITE_SHORT_LABEL }}</text>
          <text class="invite-link">{{ inviteShort }}</text>
          <view class="invite-copy" @click="copyInviteShort">
            <text class="invite-copy-text">{{ INVITE_COPY_BTN }}</text>
          </view>
          <text v-if="inviteExpiry" class="invite-expiry">{{ inviteExpiry }}</text>
        </template>
        <view class="modal-actions">
          <t-button variant="text" block @click="inviteOpen = false">{{ INVITE_CANCEL }}</t-button>
        </view>
      </view>
    </view>

    <!-- 解绑申请弹窗 -->
    <view v-if="showLeaveModal" class="modal-mask" @click="showLeaveModal = false">
      <view class="modal" @click.stop>
        <text class="modal-title">申请解绑</text>
        <text class="modal-sub">解绑后需主理人审批通过，才能加入其他家族树</text>
        <t-input
          :value="leaveReason"
          placeholder="解绑原因（选填）"
          class="field"
          @update:value="(v: any) => leaveReason = v"
        />
        <view v-if="leaveError" class="bind-error">{{ leaveError }}</view>
        <view class="modal-actions">
          <t-button theme="primary" block :loading="leaving" @click="doLeave">提交申请</t-button>
          <t-button variant="text" block @click="showLeaveModal = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="menu-card">
      <t-cell-group :bordered="false">
        <t-cell
          :title="messagesCellTitle"
          description="资产到期 / 家族灵气通知"
          arrow
          @click="goMessages"
        />
        <t-cell
          title="🧺 我的资产"
          description="碎片 / 石榴籽 / 竹片 · 收支流水"
          arrow
          @click="go('/pages/assets/index')"
        />
        <t-cell
          title="🏪 竹简市集"
          description="官方发售 · 挂单买卖 · 石榴籽标价"
          arrow
          @click="go('/pages/market/index')"
        />
        <t-cell
          title="🕰 时流子域"
          description="家族专属空间 · 灵气状态 / 蓄能"
          arrow
          @click="goSpirit"
        />
        <t-cell
          title="💰 我的钱包"
          description="余额 / 充值 / 交易流水"
          arrow
          @click="go('/pages/wallet/index')"
        />
        <t-cell
          v-if="canManage"
          title="⚙️ 角色管理"
          description="用户角色 / 锚点 / 解绑审批"
          arrow
          @click="go('/pages/admin/index')"
        />
        <t-cell
          title="📖 关于本站"
          description="声明 / 隐私 / 联系"
          arrow
          @click="go('/pages/about/about')"
        />
        <t-cell
          v-if="isAuthenticated() && anchor"
          title="🔓 申请解绑"
          description="一人一树终身制 · 解绑需主理人审批"
          arrow
          @click="openLeaveModal"
        />
      </t-cell-group>
    </view>

    <!-- 账号注销（docs/economy-ops.spec.md §7）：清空六类资产、不可恢复；存在未成交挂单 → 后端 409 拒绝 -->
    <view v-if="isAuthenticated()" class="menu-card danger-card">
      <t-cell-group :bordered="false">
        <t-cell
          title="🚪 注销账号"
          description="清空碎片 / 石榴籽 / 竹片 / 玉 / 兰帖 / 兰帖残页 · 不可恢复"
          arrow
          @click="openDeleteAccount"
        />
      </t-cell-group>
      <view v-if="deleteError" class="danger-error">{{ deleteError }}</view>
    </view>

    <view class="footer">
      <text class="version">家族历史数字馆 v0.3 · 手机号验证码登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { isAuthenticated, authState, clearAuth, getAuthToken } from '@/business/auth';
import { fetchMyAnchor, requestLeave, fetchTreeMetaRemote, fetchMessages, deleteAccount, ApiStatusError, createInviteCode, inviteShortUrl } from '@/business';
import { fetchAssetsSummary, postSignin, postSigninMakeup } from '@/business/api';
import type { AssetsSummary } from '@/business/api';
import { fetchFriends, scrollLockOf, type ScrollLockView } from '@/business/friends';
/** 道具 kind → 图标 URL（**单点** = `business/icons.ts`；日历格内为**真实道具图标**，不用 emoji 代替） */
import { assetKindIconSrc } from '@/business/icons';
import type { SigninCalendarDay, SigninCalendarState, SigninItem } from '@/business/types';
import type { SigninCellAsset } from '@/business/asset-text';
// 注销确认弹窗的六类品类名 + 签到卡全部文案 / toast 拼装引用单点常量（asset-text.ts：
// `SCROLL_NAME='兰帖'` / `SCROLL_FRAGMENT_NAME='兰帖残页'` / `signinToastText()` 等，本页**不散落签到字面**）
import {
  SCROLL_NAME,
  SCROLL_FRAGMENT_NAME,
  SIGNIN_TITLE,
  SIGNIN_HINT_PENDING,
  SIGNIN_HINT_DONE,
  SIGNIN_REWARD_LINK,
  SIGNIN_CELL_CHECK,
  SIGNIN_FAIL,
  SIGNIN_RANDOM_CHIP,
  SIGNIN_MAKEUP_TITLE,
  SIGNIN_MAKEUP_FAIL,
  SIGNIN_MAKEUP_CONFIRM_TEXT,
  SIGNIN_MAKEUP_CANCEL_TEXT,
  signinQtyBadge,
  signinDayLabel,
  signinCellBaseItems,
  signinCellBonusItem,
  signinStreakText,
  signinToastText,
  signinMakeupConfirmText,
  signinMakeupToastText,
  INVITE_PLAIN_ENTRY,
  INVITE_PLAIN_HINT,
  INVITE_SHORT_LABEL,
  INVITE_COPY_BTN,
  INVITE_CANCEL,
  INVITE_COPIED,
  INVITE_FAIL,
  inviteErrorText,
  inviteExpiryLine,
} from '@/business/asset-text';
import AssetInventory from '@/components/asset-inventory/asset-inventory.vue';

const anchor = ref<{ tree_id: string; person_handle: string; updated_at: string } | null>(null);
const anchorPersonName = ref('');
const boundTreeName = ref('未绑定');
const showLeaveModal = ref(false);
const leaveReason = ref('');
const leaveError = ref('');
const leaving = ref(false);

// ---- 邀请族人加入（批 C-2 **入口二 · 普通型**）：不针对任何节点、可多次使用 ----
// 唯一写请求 = `POST /invite/code {kind:'plain'}`（点击入口时才发；成功后就地展示短链 + 复制）
const inviteOpen = ref(false);
const inviteBusy = ref(false);
const inviteShort = ref('');
const inviteExpiry = ref('');
const inviteError = ref('');

// 站内信未读角标（GET /messages 的 unread；0 时不显示）
const unreadCount = ref(0);
// 行囊（GET /assets/summary）：取数在页面侧完成，组件只收 prop（数据流单一，组件内不二次请求）
const inventorySummary = ref<AssetsSummary | null>(null);
const inventoryError = ref('');
const inventoryLoading = ref(false);
/**
 * 兰帖锁定态（好友域续约申请：本人发起、等待对方确认期间那张兰帖被占用）——
 * 由 `GET /friends` 的 `pending` 推导后交给行囊组件渲染；`null` = 无锁定态。
 */
const scrollLock = ref<ScrollLockView | null>(null);
// 每日签到（POST /assets/signin）：独立印章卡；已签到状态以服务端 signin_date（UTC+8 自然日）为准
const signing = ref(false);
/** 本次会话内已签到（签到成功 / 同自然日 409 均置位） */
const signedLocal = ref(false);
const signError = ref('');
/**
 * 日历格视图（= `SigninCalendarDay` + 渲染派生项）：
 * `baseItems` / `bonusItem` 由 `asset-text.ts` **单点**推导（含旧后端兜底），页面不自行拼。
 * `bonusItem` 恒非空（缺失 ⇒ `{ kind:'', qty:0 }`）⇒ 模板只需判 `qty > 0`，无需空值断言。
 */
interface CalCell extends SigninCalendarDay {
  /** 固定基础项（逐项；旧后端无 `base` ⇒ 单件兜底） */
  baseItems: SigninCellAsset[];
  /** 第 7 天大奖（缺失 ⇒ 空项） */
  bonusItem: SigninCellAsset;
}

/** 空道具项（`bonus` 缺失 / 非法时的占位：`qty === 0` ⇒ 不渲染） */
const EMPTY_CELL_ASSET: SigninCellAsset = { kind: '', qty: 0 };

/**
 * 签到 7 天日历条（`GET /assets/summary` 的 `signin_calendar`，**不新增请求**）：
 * 缺键 / 非 7 长（后端未重启）⇒ 空数组 = 整条不渲染（**不臆造格子**）。
 */
const signinCalendar = ref<CalCell[]>([]);
/** 连签天数（`GET /assets/summary` 的 `signin_streak`）；缺键 / 非法 ⇒ `null` = 不渲染连签行（不显 NaN） */
const signinStreak = ref<number | null>(null);
/** 补签成本（竹片；`GET /assets/summary` 的 `signin_makeup_cost_bamboos`）；缺键 / 非法 ⇒ `null` = 确认文案回退无数字版 */
const makeupCostBamboos = ref<number | null>(null);
/** 补签进行中（防重复提交；进行中漏签格不可再点） */
const makeupBusy = ref(false);
// 账号注销（docs/economy-ops.spec.md §7）
const deleting = ref(false);
const deleteError = ref('');

const ROLE_LABELS: Record<string, string> = {
  guest: '游客',
  user: '普通用户',
  branch_curator: '支系记录官',
  tree_steward: '族谱主理人',
  chief_editor: '总编辑',
};

const canManage = computed(() => {
  if (!isAuthenticated()) return false;
  return authState.role === 'tree_steward' || authState.role === 'chief_editor';
});

/** 消息中心入口标题：未读为 0 时不显示角标（docs/economy.spec.md 「前端落点与入口」消息行） */
const messagesCellTitle = computed(() =>
  unreadCount.value ? `📮 消息中心（${unreadCount.value} 条未读）` : '📮 消息中心',
);

/** 当日（北京时间自然日）是否已签到：以服务端 `signin_date` 为准（本会话签到成功 / 409 亦置位） */
const signedToday = computed(
  () =>
    signedLocal.value ||
    (inventorySummary.value?.signin_date || '') === cnDateOf(Date.now()),
);

/**
 * 今日是否已签（**判据只取后端出参**，不新增请求）：`GET /assets/summary` 的 `signin_calendar` 内
 * **存在 `state === 'today'` 的格 ⇒ 今日未签（`false`）**；日历非空且无该格 ⇒ 今日已签（`true`）；
 * **日历缺失 / 为空（后端未重启或字段漂移）⇒ `undefined` = 不可判定** ⇒ 连签行回退旧口径。
 * ⚠️ **不得**在此自算「今天」的日期串、不得硬编时区（`signedToday` 是另一条链路的判据，不用于此处）。
 */
const signedTodayOfCalendar = computed<boolean | undefined>(() =>
  signinCalendar.value.length ? !signinCalendar.value.some((c) => c.state === 'today') : undefined,
);

/**
 * 连签行文本（`streak` 缺失 ⇒ 空串 = 该行不渲染；0 ⇒「今日还未签到」；
 * 今日已签 / 未签由日历出参判定，日历不可用 ⇒ 回退只出「已连签 N 天」）。
 */
const streakText = computed(() =>
  signinStreak.value === null ? '' : signinStreakText(signinStreak.value, signedTodayOfCalendar.value),
);

/** 日历格状态白名单（后端给未知值 ⇒ 按 `future` 渲染，**绝不臆造成「已签」**） */
const SIGNIN_STATES: readonly string[] = ['signed', 'missed', 'today', 'future'];

/**
 * 后端日历 → 页面视图：**长度恒 7**（非 7 长 ⇒ 空数组 = 不渲染整条），逐格做数值 / 枚举校验
 * （`cycle_day` / `qty` 非法值就地兜底）⇒ 后端未重启、字段缺失或漂移时**不崩、不显 NaN**。
 * 新契约（**只增不删**）`base` / `random` / `bonus` 逐格原样收下，再由 `asset-text.ts` 单点推导
 * 渲染项：`base` 缺失 ⇒ 回退旧单件渲染；`bonus` 缺失 ⇒ 不渲染；`random` 非 true ⇒ 不显 chip。
 */
function normalizeCalendar(raw: unknown): CalCell[] {
  if (!Array.isArray(raw) || raw.length !== 7) return [];
  return raw.map((item, i) => {
    const c = (item || {}) as Record<string, unknown>;
    const cycleDay = Math.floor(Number(c.cycle_day));
    const qty = Math.floor(Number(c.qty));
    const state = String(c.state ?? '');
    const day: SigninCalendarDay = {
      cycle_day: Number.isFinite(cycleDay) && cycleDay > 0 ? cycleDay : i + 1,
      kind: String(c.kind ?? ''),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
      is_bonus: c.is_bonus === true,
      state: (SIGNIN_STATES.includes(state) ? state : 'future') as SigninCalendarState,
      date: String(c.date ?? ''),
      base: Array.isArray(c.base) ? (c.base as SigninItem[]) : undefined,
      random: c.random === true,
      bonus: c.bonus && typeof c.bonus === 'object' ? (c.bonus as SigninItem) : null,
    };
    return {
      ...day,
      baseItems: signinCellBaseItems(day),
      bonusItem: signinCellBonusItem(day) || EMPTY_CELL_ASSET,
    };
  });
}

/** 把 `GET /assets/summary` 的签到读数落到页面（缺键 ⇒ 清空旧值，**不保留、不臆造**） */
function applySummarySigninReadings(s: AssetsSummary | null) {
  signinCalendar.value = normalizeCalendar(s?.signin_calendar);
  const raw = Number(s?.signin_streak);
  signinStreak.value = Number.isFinite(raw) ? raw : null;
  // 补签成本新出参（旧后端无 ⇒ null）—— 只用于二次确认文案，**不臆造数字**
  const cost = Number(s?.signin_makeup_cost_bamboos);
  makeupCostBamboos.value = Number.isFinite(cost) && cost >= 0 ? cost : null;
}

/**
 * 把**签到 / 补签出参**里更新的读数覆盖到页面（仅覆盖出参**确有**的字段；缺失 ⇒ 沿用 summary 读数）。
 * 复用体例：出参比 summary 更新，故在 `loadInventory(true)` 之后调用。
 */
function applySigninPayloadReadings(res: { streak?: number; calendar?: SigninCalendarDay[] } | null) {
  const cal = normalizeCalendar(res?.calendar);
  if (cal.length) signinCalendar.value = cal;
  const raw = Number(res?.streak);
  if (Number.isFinite(raw)) signinStreak.value = raw;
}

function roleName(role: string): string {
  return ROLE_LABELS[role] || role;
}

function roleTagTheme(role: string): string {
  switch (role) {
    case 'chief_editor': return 'danger';
    case 'tree_steward': return 'warning';
    case 'branch_curator': return 'primary';
    default: return 'default';
  }
}

function maskPhone(phone: string): string {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '';
}

async function loadAnchor() {
  const token = getAuthToken();
  if (!token) return;
  try {
    anchor.value = await fetchMyAnchor(token);
  } catch {
    /* 读不到绑定状态：保持 null（绑定行按未绑定渲染），不打扰用户 */
    anchor.value = null;
  }
  if (!anchor.value) return;
  // 树名（tree-meta）
  try {
    const meta = await fetchTreeMetaRemote();
    for (const [, entry] of Object.entries(meta.trees)) {
      if (entry.tree_id === anchor.value.tree_id) {
        boundTreeName.value = entry.display_title || entry.tree_id;
        break;
      }
    }
  } catch {
    boundTreeName.value = anchor.value.tree_id;
  }
  // 节点名（读该树 person）
  try {
    const res = await fetch(`/api/people/${anchor.value.person_handle}?profile=all`, {
      headers: { 'X-Tree-Id': anchor.value.tree_id },
    });
    if (res.ok) {
      const p = await res.json();
      const pn = p.primary_name || {};
      anchorPersonName.value =
        (pn.surname_list?.[0]?.surname || '') + (pn.first_name || '') || anchor.value.person_handle;
    }
  } catch {
    /* 读不到节点名则显示 handle */
  }
}

function openLeaveModal() {
  leaveError.value = '';
  leaveReason.value = '';
  showLeaveModal.value = true;
}

async function doLeave() {
  const token = getAuthToken();
  if (!token) {
    leaveError.value = '登录已过期，请重新登录';
    return;
  }
  leaving.value = true;
  leaveError.value = '';
  try {
    await requestLeave(token, leaveReason.value);
    showLeaveModal.value = false;
    uni.showToast({ title: '解绑申请已提交，等待审批', icon: 'none' });
  } catch (e: any) {
    leaveError.value = e.message || '申请失败';
  } finally {
    leaving.value = false;
  }
}

function goHall() {
  uni.switchTab({ url: '/pages/index/index' });
}

/** 家族互动入口：两个页面都在子包 `pages/friend`（与家谱页两格同形同文案） */
function goFriends() {
  uni.navigateTo({ url: '/pages/friend/list/index' });
}

function goInviteFriend() {
  uni.navigateTo({ url: '/pages/friend/invite/index' });
}

/**
 * 【邀请族人加入】（批 C-2 **入口二 · 普通型**）：签发**普通型**邀请码（不含建议节点、可多次使用），
 * 成功后就地弹覆盖层展示短链 + 复制。url 由前端拼（`business/api.ts` 的 `inviteShortUrl`，形态唯一）。
 * 失败 ⇒ 覆盖层内出邀请域文案（`inviteErrorText` 优先透出后端原文），**不静默、不臆造链接**。
 */
async function goInviteClan() {
  if (inviteBusy.value) return;
  inviteOpen.value = true;
  if (inviteShort.value) return; // 已签发过 ⇒ 复用同一张普通型邀请（可多次使用）
  const token = getAuthToken();
  if (!token) {
    // 极端态：入口仅在已登录时渲染，走到这里只可能是登录态刚好过期 ⇒ 回登录页（不新写认证链路）
    inviteOpen.value = false;
    uni.navigateTo({ url: '/pages/login/index' });
    return;
  }
  inviteBusy.value = true;
  inviteError.value = '';
  try {
    const res = await createInviteCode({ kind: 'plain' }, token);
    inviteShort.value = inviteShortUrl(res.code);
    inviteExpiry.value = inviteExpiryLine(res.expires_at);
  } catch (e) {
    inviteError.value = inviteErrorText(e, INVITE_FAIL);
  } finally {
    inviteBusy.value = false;
  }
}

/** 复制普通型邀请短链（剪贴板走本仓既有 `uni.setClipboardData`，与入口一同一体例） */
function copyInviteShort(): void {
  if (!inviteShort.value) return;
  uni.setClipboardData({
    data: inviteShort.value,
    success: () => uni.showToast({ title: INVITE_COPIED, icon: 'success' }),
  });
}

/** 今日奖励入口（子包页 pages/task/index，标题「领取今日奖励」） */
function goTaskCenter() {
  uni.navigateTo({ url: '/pages/task/index' });
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}

function go(path: string) {
  uni.navigateTo({ url: path });
}

/** 时流子域：按本人锚点树进入本家族子域；无锚点树 → toast 提示并回到数字馆（不报错） */
function goSpirit() {
  const treeId = anchor.value?.tree_id;
  if (!treeId) {
    uni.showToast({ title: '请先加入家族树', icon: 'none' });
    goHall();
    return;
  }
  uni.navigateTo({ url: `/pages/spirit/index?tree_id=${treeId}` });
}

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号吗？',
    success: (res) => {
      if (res.confirm) {
        clearAuth();
        uni.showToast({ title: '已退出', icon: 'success' });
        setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 500);
      }
    },
  });
}

/** 未读角标（GET /messages）：失败不阻塞页面，仅不显示角标 */
async function loadUnread() {
  if (!isAuthenticated()) return;
  try {
    const res = await fetchMessages();
    unreadCount.value = res?.unread || 0;
  } catch {
    unreadCount.value = 0;
  }
}

/** 消息中心（本批消息列表落在资产页「消息提醒」区） */
function goMessages() {
  go('/pages/assets/index');
}

/**
 * 兰帖锁定态取数（好友域只读）：判据全在 `business/friends.ts`（`scrollLockOf`），
 * 页面只把结果交给行囊组件。失败静默置空 ⇒ 不显示锁定文案（宁可少显示，不臆造状态）。
 */
async function loadFriendLock() {
  if (!isAuthenticated()) {
    scrollLock.value = null;
    return;
  }
  try {
    const payload = await fetchFriends();
    scrollLock.value = scrollLockOf(payload.friends);
  } catch {
    scrollLock.value = null;
  }
}

/** 行囊取数（GET /assets/summary）：失败不阻塞页面，容器内显示错误行（同消息角标口径）；
 *  `silent = true`（页内操作就地重拉，如签到 / 合成 / 分解）时不闪「行囊加载中…」 */
async function loadInventory(silent = false) {
  if (!isAuthenticated()) {
    scrollLock.value = null;
    applySummarySigninReadings(null); // 未登录 ⇒ 清空签到读数（不留上一账号的日历 / 连签）
    return;
  }
  void loadFriendLock(); // 锁定态与行囊同一入口刷新（不新增刷新按钮）
  if (!silent) inventoryLoading.value = true;
  inventoryError.value = '';
  try {
    inventorySummary.value = await fetchAssetsSummary();
    // 签到读数与行囊**同一入口**：签到 / 补签「就地重拉」即刷新日历条与连签行（**不新增请求、不新增刷新按钮**）
    applySummarySigninReadings(inventorySummary.value);
  } catch (e: any) {
    inventorySummary.value = null;
    applySummarySigninReadings(null);
    inventoryError.value = e?.message || '加载行囊失败';
  } finally {
    inventoryLoading.value = false;
  }
}

/** 行囊卡内操作（合成 / 分解）成功后的就地重拉（组件 emit('refresh')；不靠 onShow 刷新） */
function refreshInventory() {
  loadInventory(true);
}

/**
 * 每日签到（POST /assets/signin）：**奖励清单由后端 `items` 逐件下发**（基础 + 随机 + 第 7 天大奖）。
 * 回执口径（文案单点 = `asset-text.ts` 的 `signinToastText()`）：
 * - 有 `items` ⇒ **逐件列举**（`获得 石榴籽碎片 ×1、竹片 ×1…`）—— 本批修掉「**竹片静默到账**」；
 * - 无 `items`（旧后端）⇒ 退回既有逐字句「获得石榴籽碎片 +1」；
 * - `cycle_day === 7` ⇒ 追加第 7 天大奖句；`synthesized > 0` ⇒ 追加「满 10 已合成 N 颗石榴籽」（**逐字保留**）；
 * - 同自然日重复 → 409「今日已签到」⇒ 印章置灰 + 文案「今日已签到」（不弹错误）。
 */
async function doSignin() {
  if (!isAuthenticated() || signedToday.value || signing.value) return;
  signing.value = true;
  signError.value = '';
  try {
    const res = await postSignin();
    signedLocal.value = true;
    uni.showToast({ title: signinToastText(res), icon: 'none', duration: 3000 });
    await loadInventory(true); // 就地更新行囊（碎片 / 籽 / 竹片格）与签到读数
    applySigninPayloadReadings(res); // 出参若带更新的日历 / 连签 ⇒ 覆盖 summary 读数（字段缺失则沿用）
  } catch (e: any) {
    if (e instanceof ApiStatusError && e.status === 409) {
      // 同自然日重复：置灰 + 文案提示，不弹错误
      signedLocal.value = true;
      uni.showToast({ title: SIGNIN_HINT_DONE, icon: 'none' });
    } else {
      signError.value = e?.message || SIGNIN_FAIL;
    }
  } finally {
    signing.value = false;
  }
}

/**
 * 日历格点击：**只有 `missed` 格可补签**（`signed` / `today` / `future` 点击无操作）。
 * 补签前**二次确认**（文案 = 文案单点 `signinMakeupConfirmText()`），确认后才调接口。
 */
function onCalendarCell(c: SigninCalendarDay) {
  if (c.state !== 'missed' || makeupBusy.value) return;
  uni.showModal({
    title: SIGNIN_MAKEUP_TITLE,
    // 成本取 `GET /assets/summary` 的 `signin_makeup_cost_bamboos`（后端新出参）⇒ 文案为
    //「补签将消耗 N 片竹片，确认继续？」；旧后端无该出参 ⇒ 自动回退到不带数字的形态（不假报数字）
    content: signinMakeupConfirmText(makeupCostBamboos.value),
    confirmText: SIGNIN_MAKEUP_CONFIRM_TEXT,
    cancelText: SIGNIN_MAKEUP_CANCEL_TEXT,
    success: (r) => {
      if (r.confirm) doMakeup(c.date);
    },
  });
}

/**
 * 补签（POST /assets/signin/makeup`{ date }`）：成功后就地重拉行囊 + 签到读数
 * （复用既有 `loadInventory(true)` 体例，**不新增刷新按钮 / 不新增请求**）；
 * 成功 toast = 文案单点 `signinMakeupToastText()` ⇒ **只出「补签成功」**：
 * 补签**不补发任何道具**（后端现证），故不再逐件列举「获得 …」，避免谎报发放；
 * 失败**一律透出后端 `error` 原文**（不吞、不自造）。
 */
async function doMakeup(date: string) {
  if (!date || makeupBusy.value) return;
  makeupBusy.value = true;
  try {
    const res = await postSigninMakeup(date);
    uni.showToast({ title: signinMakeupToastText(res), icon: 'none', duration: 3000 });
    await loadInventory(true);
    applySigninPayloadReadings(res);
  } catch (e: any) {
    uni.showToast({ title: e?.message || SIGNIN_MAKEUP_FAIL, icon: 'none', duration: 3000 });
  } finally {
    makeupBusy.value = false;
  }
}

/** 北京时间（UTC+8）日历日（与服务端 `signin_date` 同口径） */
function cnDateOf(ts: number): string {
  const d = new Date(ts + 8 * 3600 * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** 注销入口：先二次确认（明示不可恢复与挂单前置），确认后才调接口 */
function openDeleteAccount() {
  if (deleting.value) return;
  deleteError.value = '';
  uni.showModal({
    title: '注销账号',
    content:
      `注销后本账号的碎片、石榴籽、竹片、石榴籽玉、${SCROLL_NAME}、${SCROLL_FRAGMENT_NAME}将全部清空，且不可恢复；历史审计与流水保留。若账号存在未成交的市集挂单，需先自行撤销，否则注销会被拒绝。是否确认注销？`,
    confirmText: '确认注销',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) confirmDeleteAccount();
    },
  });
}

/** 注销：409（存在未成交挂单）直出后端原文并引导去市集页撤单；成功则登出回首页 */
async function confirmDeleteAccount() {
  deleting.value = true;
  deleteError.value = '';
  try {
    await deleteAccount();
    clearAuth();
    uni.showToast({ title: '账号已注销', icon: 'success' });
    setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 600);
  } catch (e: any) {
    const status = e instanceof ApiStatusError ? e.status : 0;
    const message = e?.message || '注销失败';
    deleteError.value = message;
    if (status === 409) {
      uni.showModal({
        title: '暂时无法注销',
        content: message,
        confirmText: '去撤单',
        cancelText: '知道了',
        success: (res) => {
          if (res.confirm) uni.navigateTo({ url: '/pages/market/index' });
        },
      });
    } else {
      uni.showModal({ title: '注销失败', content: message, showCancel: false });
    }
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  if (isAuthenticated()) {
    loadAnchor();
    loadUnread();
    loadInventory();
  }
});
</script>

<style scoped>
.container { padding: 20px; }
.user-card {
  display: flex; align-items: center; gap: 14px;
  background: linear-gradient(135deg, #8B4513, #A66B32);
  border-radius: 14px; padding: 20px; color: #fff; margin-bottom: 16px;
}
.avatar {
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(255,255,255,0.2); font-size: 28px;
  display: flex; align-items: center; justify-content: center;
}
.user-info { flex: 1; }
.user-name { font-size: 18px; font-weight: bold; display: block; }
.user-phone { font-size: 12px; color: #E8D5C0; display: block; margin-top: 2px; }
.role-tag { margin-top: 4px; }
/* 绑定信息行（用户卡内、角色标签之下）：暖色系小字，不与角色标签抢视觉 */
.bind-line { font-size: 12px; color: #E8D5C0; display: block; margin-top: 6px; line-height: 1.5; }
.bind-line-link { color: #FFF6EA; text-decoration: underline; }
.user-action { flex-shrink: 0; }

/* 每日签到（古风印章式独立卡；位于行囊卡下方；不展示碎片进度） */
.sign-card {
  display: flex; flex-direction: column; align-items: stretch;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE; border-radius: 14px; padding: 16px;
  margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
/* 印章 + 文案行（视觉与改动前一致：印章在左、文案在右；整卡改为纵向以容纳日历条横排） */
.sign-top { display: flex; align-items: center; gap: 16px; }
/* 朱红方印（点击区）；已签到 → 整体置灰 */
.sign-seal {
  width: 56px; height: 56px; flex-shrink: 0; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, #B2352C, #8C1F18);
  box-shadow: inset 0 0 0 2px rgba(255, 240, 220, 0.75), 0 2px 6px rgba(139, 69, 19, 0.25);
  color: #FFF6EA; font-size: 26px; font-weight: bold; transform: rotate(-4deg);
  user-select: none; -webkit-user-select: none;
  cursor: pointer;
}
.sign-seal-done {
  background: linear-gradient(160deg, #C9BEB2, #A79A8C);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.6);
  color: #F7F1E8; transform: none;
}
.sign-seal-busy { opacity: 0.6; }
.sign-body { flex: 1; }
.sign-title { font-size: 16px; font-weight: bold; color: #3E2723; letter-spacing: 2px; display: block; }
.sign-hint { font-size: 12px; color: #B08D57; display: block; margin-top: 4px; }
/* 连签行（streak；0 天 = 今日还未签到） */
.sign-streak { font-size: 12px; color: #A8322D; display: block; margin-top: 4px; }

/* 签到 7 天日历条（7 格横排 · 卡内全宽） */
.sign-cal { display: flex; gap: 6px; margin-top: 12px; }
.cal-cell {
  flex: 1; min-width: 0; padding: 6px 2px 4px; border-radius: 10px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: #FFFDF8; border: 1px solid #E3D3BE;
}
/* 图标 + 数量角标 + 打勾的叠放容器（多件基础项 ⇒ `cal-items` 自动换行；角标压在各自图标右下角） */
.cal-slot { position: relative; width: 100%; min-height: 26px; display: flex; align-items: center; justify-content: center; }
/* 固定基础项 + 第 7 天大奖项的横排容器（一格可能 2–3 件，窄屏自动折行，不撑破格子） */
.cal-items { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2px; }
.cal-item { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.cal-ico { width: 15px; height: 15px; }
.cal-qty { position: absolute; right: -5px; bottom: -3px; font-size: 9px; line-height: 1; color: #8B4513; }
/* 随机掉落短 chip（格子最底部）：当天还会随机掉一件，**不预标**品种（方案乙口径） */
.cal-chip {
  font-size: 9px; line-height: 1.2; color: #8B4513; padding: 0 4px;
  border: 1px solid #E3D3BE; border-radius: 8px; background: #FFF7EC;
}
.cal-day { font-size: 10px; color: #B08D57; text-align: center; line-height: 1.2; word-break: break-all; }
/* 状态 ①：已签 = 置淡 + 右上打勾叠标 */
.cal-signed { opacity: 0.55; }
.cal-check { position: absolute; left: -5px; top: -4px; font-size: 12px; line-height: 1; color: #2E7D32; }
/* 状态 ②：今天 = 朱红描边高亮（与既有印章同色系 #A8322D） */
.cal-today { border: 2px solid #A8322D; box-shadow: 0 0 0 2px rgba(168, 50, 45, 0.12); background: #FFF7F5; }
/* 状态 ③：漏签 = 虚线边 + 可点击补签（点击后二次确认） */
.cal-missed { border-style: dashed; border-color: #C08A3E; background: #FFFBF4; }
.cal-tappable { cursor: pointer; }
/* 状态 ④：未来 = 灰 */
.cal-future { opacity: 0.45; background: #F5F5F5; border-color: #DDDDDD; }
/* 第 7 天大奖格 = 金边（用 outline 与状态边框并存，故「未来态的大奖格」金边也照样可见） */
.cal-bonus { outline: 2px solid #C9A227; outline-offset: 1px; }

/* 今日奖励入口行（不显示 x/3 进度） */
.sign-reward { font-size: 12px; color: #8B4513; display: block; margin-top: 6px; }
.sign-error { font-size: 12px; color: #C62828; display: block; margin-top: 4px; }

/* 家族互动（白底暖描边卡，与 sign-card 同族 14 圆角 / 轻投影；两格入口样式迁自家谱页 .friend-entry / .fe-*） */
.interact-card {
  background: #fff; border: 1px solid #E3D3BE; border-radius: 14px; padding: 16px;
  margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.interact-title { font-size: 16px; font-weight: bold; color: #3E2723; display: block; }
.friend-entry { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.fe-item {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 10px 0; border-radius: 12px;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.fe-icon { font-size: 16px; margin-right: 6px; }
.fe-text { font-size: 13px; color: #8B4513; }
/* 「邀请族人加入」（普通型）入口条：.friend-entry 是横排 flex，故按 100% 基宽独占一行（另两格仍均分首行） */
.fe-item-wide { flex: 1 0 100%; }

/* 普通型邀请链接覆盖层（就地展示短链 + 复制；样式与入口一 person-archive 的同名类逐值一致） */
.invite-label { display: block; font-size: 11px; color: #8B4513; margin-top: 10px; }
.invite-link {
  display: block; font-size: 11px; color: #5D4037; line-height: 1.6;
  margin-top: 4px; word-break: break-all;
}
.invite-copy {
  display: inline-block; margin-top: 6px; padding: 4px 14px; border-radius: 6px;
  background: #FBF8F5; border: 1px solid #E0D6CB;
}
.invite-copy-text { font-size: 12px; color: #5D4037; }
.invite-expiry { display: block; font-size: 11px; color: #B08D57; margin-top: 8px; }

/* 弹窗 */
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 86%; max-width: 380px; background: #fff; border-radius: 14px;
  padding: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}
.modal-title { font-size: 17px; font-weight: bold; color: #3E2723; display: block; text-align: center; }
.modal-sub { font-size: 12px; color: #999; display: block; text-align: center; margin: 6px 0 14px; }
.field { margin-bottom: 10px; }
.modal-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.bind-error { font-size: 12px; color: #C62828; margin-top: 8px; }

.menu-card :deep(.t-cell-group) { border-radius: 12px; overflow: hidden; }
.danger-card { margin-top: 16px; }
.danger-error { padding: 10px 16px; font-size: 12px; color: #C62828; line-height: 1.5; }
.footer { text-align: center; margin-top: 30px; }
.version { font-size: 12px; color: #B5A594; }
</style>
