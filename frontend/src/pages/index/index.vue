<template>
  <view class="container">
    <!-- 页头：H5 = 三层古风 banner（宣纸底 + 线装书 + 石榴树）；小程序 = 原文字 hero（组件内分端） -->
    <HomeBanner :title="UI_TEXT.heroTitle" :subtitle="UI_TEXT.heroSubtitle" />

    <!-- 双视图：家谱列表 / 中华世本（浮动按钮切换，无 t-tabs） -->
    <!-- 视图1：普通家族树列表（不含 zhonghua） -->
    <view v-if="!showMaster" class="hall-list">
      <!-- 全站搜索：人物（姓名 / 编号）+ 家族名 / 堂号；回车或点输入框内嵌「搜索」按钮触发 -->
      <!-- 同排：输入框（flex:1）→ 内嵌「搜索」按钮 → 地区胶囊（定宽 78px，见 region-filter.vue） -->
      <view class="person-search">
        <t-input
          :value="personQuery"
          :placeholder="UI_TEXT.searchPlaceholder"
          class="person-search-input"
          @update:value="onPersonQueryChange"
          @enter="doSearchPeople"
        >
          <!-- 按钮内嵌在输入框右侧内部（不单独占一列；暖棕，不用 TDesign 蓝色主题） -->
          <template #suffix>
            <view class="search-btn" @click.stop="doSearchPeople">
              <text class="search-btn-text">{{ UI_TEXT.searchButton }}</text>
            </view>
          </template>
        </t-input>

        <!-- 按地区筛选：与搜索框同排的胶囊（省级下拉；家谱 / 祖谱两档共用同一筛选状态） -->
        <RegionFilter
          v-model="regionPrefix"
          :options="regionOptions"
          :unregistered-count="regionUnregisteredCount"
          :loading="regionLoading"
          :error="regionError"
          @open="openRegionFilter"
        />
      </view>

      <view v-if="personSearched" class="person-search-panel">
        <!-- 段一：家族（纯客户端过滤已加载 tree-meta，零请求，点按即出） -->
        <view v-if="familyHits.length > 0" class="ps-section">
          <text class="ps-section-title">{{ UI_TEXT.sectionFamily }} · {{ familyHits.length }}</text>
          <view
            v-for="hit in familyHits"
            :key="hit.tree_id"
            class="ps-result"
            @click="goFamilyHit(hit)"
          >
            <text class="ps-name">{{ hit.title }}</text>
            <text v-if="familyHitSub(hit)" class="ps-tree">{{ familyHitSub(hit) }}</text>
          </view>
        </view>

        <!-- 段二：人物（既有 /search/global 异步结果） -->
        <view v-if="personSearching" class="ps-tip">{{ UI_TEXT.searching }}</view>
        <view v-else-if="personSearchError" class="ps-tip ps-error">{{ personSearchError }}</view>
        <view v-else-if="personHits.length > 0" class="ps-section">
          <text class="ps-section-title">{{ UI_TEXT.sectionPerson }} · {{ personHits.length }}</text>
          <view
            v-for="hit in personHits"
            :key="`${hit.tree_id}:${hit.handle}`"
            class="ps-result"
            :class="{ 'ps-result-restricted': hit.restricted }"
            @click="goPersonHit(hit)"
          >
            <text class="ps-name">{{ hit.name }}</text>
            <text class="ps-id">{{ personIdDisplay(hit.gramps_id) }}</text>
            <text class="ps-tree">{{ hit.tree_title }}</text>
            <text v-if="hit.restricted" class="ps-restricted">权限受限，不可见详情</text>
          </view>
        </view>

        <!-- 两段皆空：合并成一行（不再分「未找到匹配人物」两处） -->
        <view v-if="searchAllEmpty" class="ps-tip">{{ UI_TEXT.searchEmpty }}</view>
      </view>

      <!-- 一行两段：左＝排序分段控件（综合 / 人数 / 活跃度，仅「家谱」tab 有）；
           右＝列表切换（家谱 | 祖谱）。只用已加载的等级数据，不新增请求 -->
      <view class="sort-bar">
        <view v-if="listTab === 'family'" class="sort-group">
          <view
            class="sort-btn"
            :class="{ active: sortMode === 'comprehensive' }"
            @click="sortMode = 'comprehensive'"
          >
            <text class="sort-text">综合</text>
          </view>
          <view
            class="sort-btn"
            :class="{ active: sortMode === 'members' }"
            @click="sortMode = 'members'"
          >
            <text class="sort-text">人数</text>
          </view>
          <view
            class="sort-btn"
            :class="{ active: sortMode === 'activity' }"
            @click="sortMode = 'activity'"
          >
            <text class="sort-text">活跃度</text>
          </view>
        </view>
        <view class="tab-switch">
          <view
            class="tab-btn"
            :class="{ active: listTab === 'family' }"
            @click="listTab = 'family'"
          >
            <text class="tab-text">家谱</text>
          </view>
          <view
            class="tab-btn"
            :class="{ active: listTab === 'clan' }"
            @click="listTab = 'clan'"
          >
            <text class="tab-text">祖谱</text>
          </view>
        </view>
      </view>

      <!-- 加载态（与卡片同形，避免先闪「暂无」空态、避免布局跳动） -->
      <view v-if="loading" class="loading">
        <t-loading theme="spinner" text="加载中…" />
      </view>

      <t-cell-group v-else-if="visibleHalls.length > 0" :bordered="false">
        <t-cell
          v-for="card in visibleHalls"
          :key="card.tree_id"
          :title="card.title"
          :description="placeTextOf(card)"
          :border="true"
          arrow
          @click="goToHall(card)"
        >
          <template #note>
            <view class="note-line">
              <text class="note-text">{{ card.description }}</text>
              <text class="people-tag">{{ peopleText(card.tree_id) }}</text>
              <!-- 仅因居住地命中（籍贯未命中）时的绿色小标记：居 <市名> -->
              <text v-if="residenceOnlyLabel(card.tree_id)" class="live-tag">{{ residenceOnlyLabel(card.tree_id) }}</text>
              <t-tag v-if="rankLabel(card.tree_id)" :theme="rankTheme(card.tree_id)" variant="light" size="small" class="rank-tag">
                {{ rankLabel(card.tree_id) }}
              </t-tag>
            </view>
          </template>
        </t-cell>
      </t-cell-group>

      <view v-else class="empty">
        <text>{{ emptyText }}</text>
      </view>

      <!-- 新建家族树（仅总编辑；只在「家谱」tab 显示 —— 它是建家族树的入口） -->
      <view v-if="canCreateTree && listTab === 'family'" class="create-entry" @click="openCreateTree">
        <text class="create-icon">＋</text>
        <text class="create-text">新建家族树</text>
        <text class="create-hint">消耗 {{ TREE_CREATE_FEE_SEEDS }}颗石榴籽</text>
      </view>
    </view>

    <!-- 视图2：中华世本（纵向时间轴；与 /zhonghua 为同一页面组件） -->
    <ShibenTimeline v-else />

    <view class="footer">
      <text class="footer-copy">© 家谱 100</text>
      <text class="footer-dot"> · </text>
      <text class="footer-link" @click="goToPage('/pages/about/about')">关于本站 · 免责声明</text>
    </view>

    <!-- 浮动切换按钮（右侧，固定在 tabbar 上方） -->
    <view class="floating-switch" @click="toggleView">
      <text class="floating-icon">{{ showMaster ? '🏠' : '🌐' }}</text>
      <text class="floating-text">{{ showMaster ? '家谱列表' : '中华世本' }}</text>
    </view>

    <!-- 新建家族树表单（内联弹层） -->
    <view v-if="showCreate" class="ct-mask" @click="closeCreate">
      <view class="ct-modal" @click.stop>
        <view class="ct-head">
          <text class="ct-title">新建家族树</text>
          <text class="ct-close" @click="closeCreate">✕</text>
        </view>
        <view class="ct-body">
          <text class="ct-label">姓氏（单个汉字）</text>
          <t-input
            :value="form.surname"
            placeholder="如：季"
            @update:value="(v: any) => (form.surname = v)"
          />
          <text class="ct-label">始祖名（姓随家族姓氏）</text>
          <t-input
            :value="form.founder_name"
            placeholder="如：文子 → 季文子"
            @update:value="(v: any) => (form.founder_name = v)"
          />
          <text class="ct-label">始祖性别</text>
          <t-radio-group
            :value="form.gender"
            placement="horizontal"
            @update:value="(v: any) => (form.gender = v)"
          >
            <t-radio value="M">男</t-radio>
            <t-radio value="F">女</t-radio>
            <t-radio value="U">未知</t-radio>
          </t-radio-group>
          <text class="ct-label">家族显示名（选填，默认「{{ form.surname || 'X' }}氏家族」）</text>
          <t-input
            :value="form.display_title"
            placeholder="选填"
            @update:value="(v: any) => (form.display_title = v)"
          />
          <text class="ct-label">籍贯（选填）</text>
          <!-- 结构化三级行政区划（省 / 市 / 县）；只提交 origin_code，展示串由后端写路径生成 -->
          <GeoCascader v-model="form.origin_code" />
          <view class="ct-fee">
            <text class="ct-fee-text">建树消耗 {{ TREE_CREATE_FEE_SEEDS }}颗石榴籽（可用籽数见「我的资产」）</text>
            <text class="ct-fee-sub">tree_id 自动生成（姓氏拼音_码点_序号），创建后可立即新增人物</text>
          </view>
          <text v-if="createError" class="ct-error">{{ createError }}</text>
          <t-button
            theme="primary"
            block
            :loading="creating"
            :disabled="!canSubmitCreate"
            @click="doCreateTree"
          >创建家族树</t-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue';
import { fetchTreeMetaRemote, buildTreeUrl, fetchTreeRank, openTreeHome, clearMetaCache, createTree, feeText, isAssetInsufficientError, showAssetInsufficientGuide, searchPeopleGlobal, personIdDisplay, fetchGeoTreeIndex, REGION_UNREGISTERED, REGION_TEXT, hitOfEntry, isUnregisteredEntry, regionCityLabelOf, regionProvinceOptions, regionUnregisteredCountOf } from '@/business';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import type { DigitalHallCard, TreeMeta, TreeEntry, GeoTreeIndex } from '@/business/types';
import type { RegionHit } from '@/business';
import type { TreeRankInfo, GlobalPersonHit } from '@/business/api';
/**
 * 视图 2（中华世本）**按需加载**：首屏只渲染家谱列表，这条链
 * （shiben-timeline → tree-pedigree「全量 echarts」+ person-detail-modal → person-archive）
 * 只在用户点右下浮动钮切到该视图时才拉取。
 * 实测：静态 import 时首屏要多吃 ~410 KB（tree-pedigree 单块 374 KB gzip）。
 * 切换行为不变：`<ShibenTimeline v-else />` 照旧，异步加载期间渲染空位（无报错）。
 */
const ShibenTimeline = defineAsyncComponent(
  () => import('@/components/shiben-timeline/shiben-timeline.vue'),
);
import GeoCascader from '@/components/geo-cascader/geo-cascader.vue';
import RegionFilter from '@/components/region-filter/region-filter.vue';
import HomeBanner from '@/components/home-banner/home-banner.vue';

/**
 * 首页新增 / 改版文案（**唯一来源**，便于 Jing 统一入册；模板里不得再散写这些字面）。
 * 地区筛选的文案在 `business/region-filter.ts` 的 `REGION_TEXT`（组件与页面共用同一份）。
 */
const UI_TEXT = {
  /** 页头主标题（对句；H5 banner 与小程文字 hero 共用同一字串，**一个字都不得改**） */
  heroTitle: '千秋祖脉绵世泽，万卷家乘振宗风',
  /** 页头副标题（同上，两端共用） */
  heroSubtitle: '家谱 100 · 多姓氏家谱数字化珍藏平台',
  /** 搜索框占位（原「搜索人物（姓名 / 编号）」） */
  searchPlaceholder: '人物 / 家族 / 堂号',
  /** 搜索按钮（**必须是两个字**，不是「搜」/ 不是图标） */
  searchButton: '搜索',
  /** 结果分区标题前缀（渲染成「家族 · N」/「人物 · M」） */
  sectionFamily: '家族',
  sectionPerson: '人物',
  /** 两段皆空时的单行空态（待入册） */
  searchEmpty: '未找到匹配人物或家族',
  /** 人物段异步加载中 */
  searching: '搜索中…',
  /** 卡片副行无地名时的占位 */
  placeFallback: '待完善',
  /** 既有两档空态（一个字都不得改） */
  emptyFamily: '暂无已上线的家族数字馆',
  emptyClan: '暂无祖谱',
} as const;

/**
 * 建树确认弹窗文案（docs/economy-ops.spec.md §6.1 第 8.4 条 · 定稿文案，
 * **逐字使用，不得改写 / 增删标点**；原文 `/` 为换行：首行为弹窗标题，其余为正文）。
 */
const TREE_CREATE_CONFIRM = {
  title: '⚠️ 创建家族树确认',
  content:
    '本次操作将消耗9颗石榴籽，创建全新家族谱系大树。\n' +
    '消耗时将优先扣除您账户内即将最先到期的石榴籽；若后续删除家族树，本次消耗的石榴籽不予退回。\n' +
    '确认创建家族树？',
  confirmText: '确认创建',
  cancelText: '取消',
} as const;

/**
 * 建树费籽数（石榴籽）。
 * 展示口径（用户拍板）：一律写「9颗石榴籽」——不带空格、不带「完整」二字，与 8.4 定稿确认弹窗逐字一致。
 * 规格依据：`docs/economy.spec.md` §5-5（建树改扣石榴籽）+ §9 前端落点表；
 * 单价真源：`cloudfunctions/compat-api/lib/economy-fee.js` 的 `FEE.tree_create_seeds: 9`
 * （前端无可读接口，故以命名常量承载，勿在模板里散写数字）。
 * 展示口径：建树费**不再用 ¥ 展示**（人民币余额只用于购买官方竹简）。
 */
const TREE_CREATE_FEE_SEEDS = 9;

const halls = ref<DigitalHallCard[]>([]);
const meta = ref<TreeMeta | null>(null);
/** 列表加载态（纯视觉：首屏不再先闪「暂无…」空态） */
const loading = ref(true);

// ---- 双视图切换（浮动按钮） ----
const showMaster = ref(false);

/**
 * 列表 tab（家族 / 祖谱）：只切换渲染的列表与入口，不改双视图逻辑；
 * 切换 tab **不重置** sortMode（切回家族 tab 时保留用户上次选择）。
 */
const listTab = ref<'family' | 'clan'>('family');

/**
 * 普通家族树列表：排除中华世本（is_master）与祖谱（kind='clan'）。
 * 旧 meta 条目缺 kind 字段 → 按 family 兼容（`kind !== 'clan'` 天然放行 undefined）。
 */
const normalHalls = computed(() => halls.value.filter((h) => !h.isMaster && h.kind !== 'clan'));

/** 祖谱列表（kind='clan'）：只按综合分降序，没有排序切换 */
const clanHalls = computed(() => halls.value.filter((h) => h.kind === 'clan'));

// ---- 排序（综合 / 人数 / 活跃度）：数据只用 rankMap，不新增网络请求 ----

type SortMode = 'comprehensive' | 'members' | 'activity';

/** 当前排序档（默认「综合」） */
const sortMode = ref<SortMode>('comprehensive');

/** 综合分权重（写死：人数 0.4 / 活跃度 0.4 / 新近度 0.2） */
const SCORE_WEIGHT_MEMBERS = 0.4;
const SCORE_WEIGHT_ACTIVITY = 0.4;
const SCORE_WEIGHT_RECENCY = 0.2;

/** 本次列表内极值归一化；max === min 时一律记 1（不记 0、不除零） */
function norm(v: number, min: number, max: number): number {
  if (max === min) return 1;
  return (v - min) / (max - min);
}

/** 人数（rankMap 缺失 → 0） */
function membersOf(treeId: string): number {
  const n = rankMap.value[treeId]?.person_count;
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

/** 活跃度（rankMap 缺失 → 0；后端未下发该字段时同样按 0，不显示 NaN） */
function activityOf(treeId: string): number {
  const n = rankMap.value[treeId]?.activity;
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

/** 新近度：updated_at 的毫秒时间戳；缺失 / 无法解析 → 0 */
function recencyOf(treeId: string): number {
  const ts = Date.parse(rankMap.value[treeId]?.updated_at || '');
  return Number.isNaN(ts) ? 0 : ts;
}

/**
 * 综合分表（可复用于任一列表）：0.4×人数 + 0.4×活跃度 + 0.2×新近度，
 * 三项各自在该列表自身内极值归一化（同一公式、同一权重；max === min 记 1）。
 */
function scoreByList(list: DigitalHallCard[]): Record<string, number> {
  const members = list.map((h) => membersOf(h.tree_id));
  const activity = list.map((h) => activityOf(h.tree_id));
  const recency = list.map((h) => recencyOf(h.tree_id));
  const bounds = (arr: number[]) => ({ min: Math.min(...arr), max: Math.max(...arr) });
  const m = bounds(members);
  const a = bounds(activity);
  const r = bounds(recency);
  const map: Record<string, number> = {};
  list.forEach((h, i) => {
    map[h.tree_id] =
      SCORE_WEIGHT_MEMBERS * norm(members[i], m.min, m.max) +
      SCORE_WEIGHT_ACTIVITY * norm(activity[i], a.min, a.max) +
      SCORE_WEIGHT_RECENCY * norm(recency[i], r.min, r.max);
  });
  return map;
}

/** 家族列表的综合分表（归一化范围＝家族列表自身，结果与改造前逐值一致） */
const scoreMap = computed<Record<string, number>>(() => scoreByList(normalHalls.value));

/** 祖谱列表的综合分表（归一化范围＝祖谱列表自身） */
const clanScoreMap = computed<Record<string, number>>(() => scoreByList(clanHalls.value));

/**
 * 「综合」档 tie-break：综合分降序 → 人数降序 → 活跃度降序 → updated_at 降序 → tree_id 升序。
 * 家族列表与祖谱列表共用（传入各自的综合分表）。
 */
function compareByScore(
  a: DigitalHallCard,
  b: DigitalHallCard,
  scores: Record<string, number>,
): number {
  let d = (scores[b.tree_id] || 0) - (scores[a.tree_id] || 0);
  if (d) return d;
  d = membersOf(b.tree_id) - membersOf(a.tree_id);
  if (d) return d;
  d = activityOf(b.tree_id) - activityOf(a.tree_id);
  if (d) return d;
  d = recencyOf(b.tree_id) - recencyOf(a.tree_id);
  if (d) return d;
  return a.tree_id < b.tree_id ? -1 : a.tree_id > b.tree_id ? 1 : 0;
}

/**
 * 家族列表三档统一 tie-break：主指标降序 → 其余两项指标降序 → updated_at 降序 → tree_id 升序。
 * 显式写全，不依赖列表原始顺序（原始顺序随 meta 文件顺序变化）。
 */
function compareHalls(a: DigitalHallCard, b: DigitalHallCard): number {
  let d = 0;
  if (sortMode.value === 'members') {
    d = membersOf(b.tree_id) - membersOf(a.tree_id);
    if (d) return d;
    d = activityOf(b.tree_id) - activityOf(a.tree_id);
    if (d) return d;
  } else if (sortMode.value === 'activity') {
    d = activityOf(b.tree_id) - activityOf(a.tree_id);
    if (d) return d;
    d = membersOf(b.tree_id) - membersOf(a.tree_id);
    if (d) return d;
  } else {
    return compareByScore(a, b, scoreMap.value);
  }
  d = recencyOf(b.tree_id) - recencyOf(a.tree_id);
  if (d) return d;
  return a.tree_id < b.tree_id ? -1 : a.tree_id > b.tree_id ? 1 : 0;
}

/** 渲染用列表（排序只作用于渲染；卡片模板 / 等级徽章 / 新建入口 / 切换按钮均不变） */
const sortedHalls = computed(() => normalHalls.value.slice().sort(compareHalls));

/** 祖谱渲染列表：只按综合分降序（综合分归一化范围＝祖谱列表自身，无排序切换） */
const sortedClanHalls = computed(() =>
  clanHalls.value.slice().sort((a, b) => compareByScore(a, b, clanScoreMap.value)),
);

// ---- 按地区筛选（单胶囊 + 省级下拉；数据源 = GET /geo/tree-index，会话内缓存） ----

/**
 * 选中值：``''`` ＝全部地区 / 2 位省前缀（如 `'37'`）/ `REGION_UNREGISTERED` ＝未登记。
 * 两档（家谱 / 祖谱）**共用同一筛选状态**：切 tab 不清空、两档同一套命中口径。
 */
const regionPrefix = ref('');
const regionTreeIndex = ref<GeoTreeIndex | null>(null);
const regionLoading = ref(false);
const regionError = ref('');

const regionFilterActive = computed(() => !!regionPrefix.value);

/** 可筛选范围 = **当前档位**的列表（家谱档 = normalHalls 14 棵 / 祖谱档 = clanHalls 5 棵）——
 *  与 `visibleHalls` 渲染的档位、下拉里省级计数与「未登记」计数同口径（两档共用筛选状态）。 */
const regionScopedTreeIds = computed(() =>
  listTab.value === 'clan'
    ? clanHalls.value.map((h) => h.tree_id)
    : normalHalls.value.map((h) => h.tree_id),
);

const regionOptions = computed(() =>
  regionProvinceOptions(regionTreeIndex.value, regionScopedTreeIds.value),
);
const regionUnregisteredCount = computed(() =>
  regionUnregisteredCountOf(regionTreeIndex.value, regionScopedTreeIds.value),
);

/**
 * 取树索引（失败不阻断：列表照常渲染，错误只在下拉里提示）。
 * `silent` = 首屏空闲预取：失败**不写 regionError**（不打扰用户），留着打开下拉时的重试路径。
 */
async function ensureGeoIndex(silent = false) {
  if (regionTreeIndex.value || regionLoading.value) return;
  regionLoading.value = true;
  if (!silent) regionError.value = '';
  try {
    regionTreeIndex.value = await fetchGeoTreeIndex();
  } catch (e: any) {
    // 不静默吞（非预取场景）：失败文案显示在下拉里（不造兜底假数据）
    if (!silent) regionError.value = e?.message || '地区数据加载失败';
  } finally {
    regionLoading.value = false;
  }
}

/** 下拉打开：数据已在（预取命中）⇒ 立即渲染、零请求；不在 ⇒ 现取（并给出失败提示） */
function openRegionFilter() {
  if (regionTreeIndex.value) return;
  void ensureGeoIndex();
}

/**
 * 首屏空闲时**静默预取**一次地区索引（打开下拉即渲染，不再等网络）。
 * 调度：优先 `requestIdleCallback`（H5），不支持（小程序 / 旧端）则 `setTimeout 0`；
 * 纯运行时探测，**不加条件编译**（两端同一份码）。预取失败不弹错、不阻断列表。
 */
let geoPrefetchScheduled = false;
function scheduleGeoIndexPrefetch() {
  if (geoPrefetchScheduled || regionTreeIndex.value) return;
  geoPrefetchScheduled = true;
  const run = () => {
    void ensureGeoIndex(true);
  };
  const idle = (globalThis as any).requestIdleCallback;
  if (typeof idle === 'function') idle(run, { timeout: 1500 });
  else setTimeout(run, 0);
}

/** 某树在当前所选省下的命中（未选地区 / 选「未登记」→ null） */
function regionHitOf(treeId: string): RegionHit | null {
  const prefix = regionPrefix.value;
  if (!prefix || prefix === REGION_UNREGISTERED) return null;
  return hitOfEntry(regionTreeIndex.value?.trees?.[treeId], prefix);
}

/** 是否进列表：省份命中取并集（籍 ∪ 居）；「未登记」= 两码数组皆空的树（与省份集合互斥） */
function matchesRegionFilter(treeId: string): boolean {
  const prefix = regionPrefix.value;
  if (!prefix) return true;
  const entry = regionTreeIndex.value?.trees?.[treeId];
  if (prefix === REGION_UNREGISTERED) return isUnregisteredEntry(entry);
  return !!hitOfEntry(entry, prefix);
}

/** 仅因居住地命中（籍贯未命中）时的绿色标记文案：`居 <市名>`；其余情况空串 */
function residenceOnlyLabel(treeId: string): string {
  const hit = regionHitOf(treeId);
  if (!hit || hit.origin || !hit.residence) return '';
  const city = regionCityLabelOf(hit.residenceCityCode);
  return city ? `${REGION_TEXT.residencePrefix} ${city}` : '';
}

/**
 * 当前 tab 实际渲染的列表：**先按既有三档排序、再按地区筛选**（筛选只是排序结果上的后置过滤，
 * 故既有 `sortMode` / tie-break / 归一化范围一字未动）。
 */
const visibleHalls = computed(() => {
  const base = listTab.value === 'clan' ? sortedClanHalls.value : sortedHalls.value;
  if (!regionFilterActive.value) return base;
  return base.filter((h) => matchesRegionFilter(h.tree_id));
});

/** 空态文案：仅在「无地区筛选」时用既有两档文案（一个字不改）；有筛选时给地区空态 */
const emptyText = computed(() => {
  if (regionFilterActive.value) return REGION_TEXT.emptyList;
  return listTab.value === 'clan' ? UI_TEXT.emptyClan : UI_TEXT.emptyFamily;
});

/** 卡片副行：只显示地名（无地名 → 「待完善」） */
function placeTextOf(card: DigitalHallCard): string {
  const place = String(card.origin ?? '').trim();
  return place || UI_TEXT.placeFallback;
}

function toggleView() {
  showMaster.value = !showMaster.value;
}

/** 加载家族列表 + 等级徽章（建树后可重建调用） */
async function loadHalls() {
  loading.value = true;
  try {
    // 用远程数据源（tree-meta），保证拆分/建树/编辑后首页立即同步
    meta.value = await fetchTreeMetaRemote();
    halls.value = Object.entries(meta.value.trees).map(([_, entry]) => ({
      tree_id: entry.tree_id,
      title: entry.display_title,
      surname: entry.surname_char,
      origin: entry.origin,
      description: entry.description,
      isMaster: !!entry.is_master,
      kind: entry.kind,
      url: buildTreeUrl(entry.tree_id, meta.value!) || `/tree/${entry.tree_id}`,
    }));
    loadRanks();
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    await loadHalls();
  } catch (e) {
    console.error('加载元数据失败:', e);
  }
  // 地区筛选索引：首屏渲染完成后**空闲静默预取**（打开下拉即渲染、零等待；失败不弹错、不阻断列表；
  // 打开下拉仍有重试路径 ⇒ 预取不是唯一入口）
  scheduleGeoIndexPrefetch();
});

// ---- 新建家族树（仅总编辑） ----
const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const form = ref({ surname: '', founder_name: '', gender: 'M' as 'M' | 'F' | 'U', display_title: '', origin: '', origin_code: '' });

const canCreateTree = computed(() => isAuthenticated() && authState.role === 'chief_editor');
const canSubmitCreate = computed(
  () => /^[\u4e00-\u9fa5]$/.test(form.value.surname.trim()) && !!form.value.founder_name.trim(),
);

function openCreateTree() {
  createError.value = '';
  showCreate.value = true;
}

function closeCreate() {
  showCreate.value = false;
}

async function doCreateTree() {
  const token = getAuthToken();
  if (!token) {
    createError.value = '登录已过期，请重新登录';
    return;
  }
  if (creating.value) return;
  creating.value = true; // 兼作确认弹窗期间的防重复提交
  createError.value = '';
  try {
    // 建树确认弹窗（8.4 定稿文案）：取消则不发起请求
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: TREE_CREATE_CONFIRM.title,
        content: TREE_CREATE_CONFIRM.content,
        confirmText: TREE_CREATE_CONFIRM.confirmText,
        cancelText: TREE_CREATE_CONFIRM.cancelText,
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    const res = await createTree(
      {
        surname_char: form.value.surname.trim(),
        founder_name: form.value.founder_name.trim(),
        founder_gender: form.value.gender,
        display_title: form.value.display_title.trim(),
        // 籍贯地：只提交结构化码；origin 保留字段仅为 legacy 原样透传（有码时后端以码反查结果覆盖）
        // `origin_code` 归一空串：真源 `tree-meta` 老树该字段可能缺失（undefined），不得把它发给后端
        origin_code: form.value.origin_code || '',
        origin: form.value.origin.trim(),
      },
      token,
    );
    // 扣费回执（建树 = 9颗石榴籽）追加在成功提示里；后端未返回 fee 时不追加，避免自造数字
    uni.showToast({
      title: res.fee ? `${res.message}（${feeText(res.fee)}）` : res.message,
      icon: 'none',
    });
    showCreate.value = false;
    form.value = { surname: '', founder_name: '', gender: 'M', display_title: '', origin: '', origin_code: '' };
    clearMetaCache();
    await loadHalls();
    openTreeHome(res.tree_id);
  } catch (e: any) {
    // 石榴籽不足（409 ASSET_INSUFFICIENT）：后端 error 文案不隐藏 + 「如何获得」清单 + 引导「我的资产」
    if (isAssetInsufficientError(e)) {
      createError.value = e?.message || '石榴籽不足';
      showAssetInsufficientGuide(e, { title: '石榴籽不足' });
      return;
    }
    createError.value = e.message || '创建失败';
  } finally {
    creating.value = false;
  }
}

// ---- 家族等级 ----
const rankMap = ref<Record<string, TreeRankInfo>>({});

async function loadRanks() {
  const results = await Promise.allSettled(
    halls.value.map((h) => fetchTreeRank(h.tree_id)),
  );
  const map: Record<string, TreeRankInfo> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map[halls.value[i].tree_id] = r.value;
  });
  rankMap.value = map;
}

function rankLabel(treeId: string): string {
  return rankMap.value[treeId]?.rank_label || '';
}

/**
 * 人数标签文案（数据全部来自已加载的 rankMap，不新增请求；缺失 / NaN → 「— 人」）。
 * 新口径（用户 2026-09-19 拍板）：只给一个数字 —— `person_count`（后端家族人数新口径），
 * 不再输出「（含外树 M）」说明；`mirror_count` 降级为保留字段，前端不再使用。
 */
function peopleText(treeId: string): string {
  const r = rankMap.value[treeId];
  const n = r?.person_count;
  if (typeof n !== 'number' || Number.isNaN(n)) return '— 人';
  return `${n} 人`;
}

function rankTheme(treeId: string): string {
  const r = rankMap.value[treeId];
  if (!r) return 'default';
  if (r.over_limit) return 'danger';
  switch (r.rank_key) {
    case 'family_rank': return 'default';
    case 'clan_rank': return 'primary';
    case 'lineage_rank': return 'warning';
    case 'stemma_rank': return 'danger';
    default: return 'default';
  }
}

// ---- 全站搜索（人物：跨家族树 GET /search/global；家族：纯客户端过滤已加载 tree-meta，零请求） ----

const personQuery = ref('');
/**
 * 最近一次**已提交**的查询（点按钮 / 回车时快照）：
 * 两段结果同源同快照 ⇒ 未提交的输入不会让「家族」段先动、与「人物」段错位。
 */
const searchedQuery = ref('');
const personHits = ref<GlobalPersonHit[]>([]);
const personSearching = ref(false);
/** 结果区开关：输入清空即收起 */
const personSearched = ref(false);
const personSearchError = ref('');

/**
 * 谱名 / 堂号的字面空值：**「暂无」与空串一律当没有**（现盘 19 棵里 1 棵写「暂无」、4 棵为空）。
 * 口径断言：搜「暂无」时家族命中必须为 0。
 */
const EMPTY_LABELS = new Set(['', '暂无']);

/** 归一：去首尾空格 + 小写（中文天然大小写不敏感，英文 / 数字仍需） */
function normText(v?: string | null): string {
  return String(v ?? '').trim().toLowerCase();
}

/** 字面空值 → `''`（「暂无」/ 空串 / 纯空白） */
function nonEmptyLabel(v?: string | null): string {
  const t = String(v ?? '').trim();
  return EMPTY_LABELS.has(t) ? '' : t;
}

/** tree_id → tree-meta 条目（谱名 / 堂号不在 DigitalHallCard 上，从这里读，零新增请求） */
const treeEntryByTreeId = computed<Record<string, TreeEntry>>(() => {
  const map: Record<string, TreeEntry> = {};
  const trees = meta.value?.trees || {};
  for (const key of Object.keys(trees)) {
    const entry = trees[key];
    if (!entry) continue;
    map[entry.tree_id || key] = entry;
  }
  return map;
});

/**
 * 「家族 · N」段命中：**纯客户端过滤已加载的 tree-meta**（零新增请求），
 * 匹配 `display_title` / `genealogy_name` / `surname_char` / `hall_name`（均 trim + 大小写不敏感）。
 * 范围与 `normalHalls` 同口径：排除中华世本（`isMaster`）**且**排除祖谱（`kind==='clan'`）——
 * 家族段只装家族树，与首页 tab 语义一致（祖谱不另设命中段）。
 */
const familyHits = computed<DigitalHallCard[]>(() => {
  const q = normText(searchedQuery.value);
  if (!q) return [];
  return halls.value.filter((h) => {
    if (h.isMaster || h.kind === 'clan') return false;
    const entry = treeEntryByTreeId.value[h.tree_id];
    const fields = [
      h.title,
      nonEmptyLabel(entry?.genealogy_name),
      entry?.surname_char ?? h.surname,
      nonEmptyLabel(entry?.hall_name),
    ];
    return fields.some((f) => {
      const t = normText(f);
      return !!t && t.includes(q);
    });
  });
});

/** 家族命中行右侧小字：堂号优先、其次谱名（两者皆空 → 不显示） */
function familyHitSub(card: DigitalHallCard): string {
  const entry = treeEntryByTreeId.value[card.tree_id];
  return nonEmptyLabel(entry?.hall_name) || nonEmptyLabel(entry?.genealogy_name);
}

/** 两段皆空（且不在搜索中 / 无错误）→ 只显示一行合并空态 */
const searchAllEmpty = computed(
  () =>
    !personSearching.value &&
    !personSearchError.value &&
    familyHits.value.length === 0 &&
    personHits.value.length === 0,
);

/** 输入变化：清空 → 清结果并收起结果区 */
function onPersonQueryChange(v: string) {
  personQuery.value = v;
  if (!v.trim()) {
    searchedQuery.value = '';
    personHits.value = [];
    personSearchError.value = '';
    personSearched.value = false;
  }
}

async function doSearchPeople() {
  const q = personQuery.value.trim();
  if (!q) {
    onPersonQueryChange('');
    return;
  }
  // 快照已提交查询：家族段据它即时渲染（点按钮 / 回车是同一条路径）
  searchedQuery.value = q;
  personSearching.value = true;
  personSearched.value = true;
  personSearchError.value = '';
  personHits.value = [];
  try {
    personHits.value = await searchPeopleGlobal(q, 30);
  } catch (e: any) {
    // 不静默吞掉：错误文案直接显示在结果区
    personSearchError.value = e?.message || '搜索失败';
  } finally {
    personSearching.value = false;
  }
}

/** 点家族命中行 → 既有家族树首页跳转 */
function goFamilyHit(card: DigitalHallCard) {
  openTreeHome(card.tree_id);
}

/** 点结果 → 既有薄壳人物详情页；受限条（真身不可见）只提示、不跳转 */
function goPersonHit(hit: GlobalPersonHit) {
  if (hit.restricted) {
    uni.showToast({ title: '权限受限，不可见详情', icon: 'none' });
    return;
  }
  uni.navigateTo({
    url: `/pages/person/detail?tree_id=${hit.tree_id}&handle=${hit.handle}`,
  });
}

function goToHall(card: DigitalHallCard) {
  openTreeHome(card.tree_id);
}

function goToPage(path: string) {
  uni.navigateTo({ url: path });
}
</script>

<style scoped>
/* ---- 页面骨架（暖棕主题：主色 #4E6B57 / 深棕字 #2F3A33 / 暖米底 #FAFCF8 / 辅助 #6E7D70·#6E7D70） ---- */
/* 注意：**不得**给 .container 加 overflow:hidden —— H5 三层 banner 靠 100vw 负 margin 出血到视口两边 */
.container { padding: 20px; padding-bottom: 90px; }

/* H5：页头是出血 banner，页面顶部内距归零（banner 直接顶在导航条下沿） */
/* #ifdef H5 */
.container { padding-top: 0; }
/* 列表区（搜索框 / 排序条 / 卡片）必须**压在 banner 纸面延展层之上**：
   纸面层 `.banner__paper` 从 banner 顶边一直铺到 banner 下方 260px（搜索框、排序条、
   首张卡片上半部都在它上面），它是 positioned + z-index:0，会盖住未定位的流内内容 ⇒
   这里给列表区一个更高的 z-index；纸面层自身 pointer-events:none，故点击不受影响。 */
.hall-list { position: relative; z-index: 1; }
/* #endif */

/* ---- 家族馆卡片列表 ---- */
.hall-list { display: flex; flex-direction: column; gap: 12px; }

/* ---- 全站搜索（人物 / 家族 / 堂号；输入框**内嵌**暖棕「搜索」按钮，地区胶囊同排） ---- */
/* 同排硬约束：输入框 flex:1（min-width:0 才敢收缩）→ 内嵌按钮 → 定宽胶囊（flex:0 0 auto，见 region-filter.vue） */
.person-search { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; }
.person-search-input { flex: 1 1 auto; min-width: 0; }
/* 输入框本体：暖米底 + 暖棕圆角描边（组件自带的下边线隐藏，改整圈描边） */
.person-search :deep(.t-input) {
  background: #FAFCF8;
  border: 1px solid #CFD8CE;
  border-radius: 12px;
  padding: 5px 5px 5px 14px;
  height: 44px;
  box-sizing: border-box;
}
.person-search :deep(.t-input--border)::after { display: none; }
/* 内嵌按钮与文字之间留 8px，按钮贴输入框右内缘 */
.person-search :deep(.t-input__wrap--suffix) { padding-left: 8px; }
.search-btn {
  display: flex; align-items: center; justify-content: center;
  height: 34px; min-width: 64px; padding: 0 16px;
  background: #4E6B57; border-radius: 8px; box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
.search-btn:active { background: #7A3C10; }
.search-btn-text { font-size: 13px; color: #fff; line-height: 1; letter-spacing: 0.5px; }
.person-search-panel {
  background: #FAFCF8; border: 1px solid #CFD8CE; border-radius: 14px;
  padding: 6px 14px; box-shadow: 0 2px 10px rgba(47, 58, 51, 0.05);
}
/* 分区（家族在上 / 人物在下）：段标题小字，两段之间一条分割线 */
.ps-section + .ps-section { border-top: 1px solid #E6EDE7; }
.ps-section-title {
  display: block; padding: 8px 2px 2px;
  font-size: 11px; color: #6E7D70; letter-spacing: 0.5px;
}
.ps-result {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 2px; border-bottom: 1px solid #E6EDE7;
}
.ps-result:last-child { border-bottom: none; }
/* 受限条：追加一行中性辅助色小字（仅该类生效，不影响其它结果行） */
.ps-result-restricted { flex-wrap: wrap; }
.ps-restricted { flex-basis: 100%; font-size: 11px; color: #6E7D70; line-height: 1.4; }
.ps-name { font-size: 14px; font-weight: 500; color: #2F3A33; }
.ps-id { font-size: 11px; color: #6E7D70; }
.ps-tree {
  margin-left: auto; max-width: 42%;
  font-size: 11px; color: #6E7D70;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.ps-tip { text-align: center; font-size: 13px; color: #6E7D70; padding: 14px 0; }
.ps-error { color: #C62828; }

/* ---- 排序 + 列表切换（同一行：左＝综合/人数/活跃度，右＝家谱 | 祖谱） ----
   单行硬约束：nowrap 组内不换行 + min-height 钉住行高。
   垂直账：排序组 = padding 8×2 + border 1×2 = 18px；切 tab 组 = border 1×2 + padding 2×2 + 按钮 padding 6×2 = 18px；
   两组文字同字号 → 行盒等高，故「家谱」tab（有排序组）与「祖谱」tab（排序组 v-if 移除）行高严格一致，列表不再跳动。 */
.sort-bar { display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; min-height: 36px; }
.sort-group { display: flex; gap: 8px; flex-wrap: nowrap; min-width: 0; }
.sort-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 8px 14px;
  background: #FAFCF8; border: 1px solid #CFD8CE; border-radius: 999px;
}
.sort-text { font-size: 13px; color: #4E6B57; white-space: nowrap; }
.sort-btn.active { background: #4E6B57; border-color: #4E6B57; }
.sort-btn.active .sort-text { color: #fff; }

/* 列表切换组：靠右（排序组隐藏时仍停在同一行右侧，不跳位）；shrink:0 保证永不被排序组挤压 */
.tab-switch {
  display: flex; gap: 2px; margin-left: auto; flex-shrink: 0;
  padding: 2px; background: #FAFCF8;
  border: 1px solid #CFD8CE; border-radius: 999px;
}
.tab-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 6px 14px; border-radius: 999px;
}
.tab-text { font-size: 13px; color: #4E6B57; white-space: nowrap; }
.tab-btn.active { background: #4E6B57; }
.tab-btn.active .tab-text { color: #fff; }

/* 窄屏（≤370px，含 320px）：收窄水平空间，保证「三颗排序 pill + 两颗 tab」单行放得下且不溢出、不出现横向滚动 */
@media (max-width: 370px) {
  .sort-bar { gap: 6px; }
  .sort-group { gap: 6px; }
  .sort-btn { padding: 8px 9px; }
  .tab-btn { padding: 6px 10px; }
  .sort-text, .tab-text { font-size: 12px; }
}

/* 卡片容器：暖米底 + 暖棕描边 + 14 圆角 + 极轻投影（与「新建家族树」入口同族） */
.hall-list :deep(.t-cell-group) {
  background: #FAFCF8;
  border: 1px solid #CFD8CE;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(47, 58, 51, 0.05);
}

/* 卡片内节奏：名称 → 地名 → 简介 纵向堆叠（不再左右分栏与简介抢宽，
   卡片高度只由内容行数决定，节奏稳定） */
.hall-list :deep(.t-cell) {
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  padding: 13px 16px 14px;
  background: transparent;
  --td-cell-hover-color: #FBF3E9;
  --td-cell-border-color: #E6EDE7;
  --td-cell-border-left-space: 16px;
  --td-cell-border-right-space: 16px;
  --td-cell-right-icon-color: #8E9A93;
  --td-cell-right-icon-font-size: 20px;
}
/* 末张卡片不再多一条分割线（圆角内不露线） */
.hall-list :deep(.t-cell:last-child)::after { display: none; }

/* 右侧箭头：改为垂直居中定位于卡片右缘，为标题让出整行宽度 */
.hall-list :deep(.t-cell__title) { margin-right: 0; padding-right: 24px; }
.hall-list :deep(.t-cell__right) {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
}

/* 名称（一级信息）：17/700 深棕，单行截断 */
.hall-list :deep(.t-cell__title-text) {
  display: block; width: 100%;
  font-size: 17px; font-weight: 700; color: #2F3A33; line-height: 1.35;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
/* 地名（二/三级信息）：12 辅助棕，单行截断 */
.hall-list :deep(.t-cell__description) { font-size: 12px; color: #6E7D70; line-height: 1.5; }
.hall-list :deep(.t-cell__description-text) {
  margin-top: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
/* 简介（正文）：13/1.6 辅助深棕，最多两行截断（长简介不再撑高卡片）；
   右侧留出 24px 箭头位，等级标签不再与右侧箭头相压 */
.hall-list :deep(.t-cell__note) {
  display: block; margin-top: 4px; padding-right: 24px; box-sizing: border-box;
  font-size: 13px; color: #6E7D70;
}
.note-line { display: flex; align-items: flex-start; gap: 8px; }
.note-text {
  flex: 1 1 auto; min-width: 0;
  font-size: 13px; line-height: 1.6; color: #6E7D70;
  word-break: break-word;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
/* 等级标签：与简介同排、右对齐成列；家乘级等中性等级收敛为暖中性灰（语义色不变） */
.hall-list :deep(.rank-tag) {
  --td-tag-default-color: #6E7D70;
  --td-tag-default-font-color: #6E7D70;
  --td-tag-default-light-color: #EAF0EE;
  flex: 0 0 auto; margin-left: 0; margin-top: 1px;
  padding: 0 6px; height: 18px; line-height: 18px; font-size: 11px;
}
/* 人数标签：与等级标签同排同族（浅底深字、无描边，避免同排两个描边元素） */
.people-tag {
  flex: 0 0 auto; margin-top: 1px;
  padding: 0 6px; height: 18px; line-height: 18px; font-size: 11px;
  border-radius: 4px; background: #EAF0EE; color: #6E7D70;
}
/* 仅居住地命中（籍贯未命中）的绿色小标记：与人数标签同排、同尺寸（18/11/4） */
.live-tag {
  flex: 0 0 auto; margin-top: 1px;
  padding: 0 6px; height: 18px; line-height: 18px; font-size: 11px;
  border-radius: 4px; background: #EDF4EC; color: #4B6B47;
  white-space: nowrap;
}

/* 加载态（与卡片同形同宽，避免首屏空态闪烁与布局跳动） */
.loading {
  background: #FAFCF8; border: 1px solid #CFD8CE; border-radius: 14px;
  padding: 28px 0 30px; text-align: center;
}
/* 空态：暖色虚线卡片（与「新建家族树」入口同款） */
.empty {
  background: #FAFCF8; border: 1px dashed #C8A88A; border-radius: 14px;
  padding: 34px 16px; text-align: center;
  font-size: 13px; color: #6E7D70; line-height: 1.6;
}

/* 页脚降权（Kevin 拍定 A 版）：一行 11px 极淡文字并与版权合并，
   去掉底色/描边/大内距（原为 152×38 带描边底色的胶囊）。 */
.footer {
  display: flex; align-items: center; justify-content: center;
  margin-top: 26px;
  font-size: 11px; line-height: 14px;
  color: #8E9A93;
}
.footer-copy { font-size: 11px; line-height: 14px; color: #8E9A93; padding: 9px 0; }
.footer-dot { font-size: 11px; line-height: 14px; color: #8E9A93; padding: 9px 0; margin: 0 4px; }
/* 仍可点、仍跳 /pages/about/about；仅降视觉权重（1px 下边框当链接提示）。
   可点区靠 padding 撑到 33px（14 行高 + 9×2 + 1px 下边框），不低于 32px。 */
.footer-link {
  display: inline-block;
  font-size: 11px; line-height: 14px;
  color: #6E7D70;
  padding: 9px 2px;
  border: none; border-bottom: 1px solid #6E7D70;
  background: transparent;
}

/* 浮动切换按钮（右侧，固定在 tabbar 上方） */
.floating-switch {
  position: fixed;
  right: 14px;
  bottom: 108px;
  z-index: 950;
  width: 58px; height: 58px;
  border-radius: 50%;
  background: #4E6B57;
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 6px 16px rgba(47, 58, 51, 0.28), 0 1px 3px rgba(47, 58, 51, 0.18);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
/* H5 窄栏：浮动按钮 fixed 相对视口定位，宽屏时按 --jiapu-column 回收进列内
   （视口 ≤ 列宽时 max() 取 14px，即原来的贴边值，行为不变） */
/* #ifdef H5 */
.floating-switch {
  right: max(14px, calc((100% - var(--jiapu-column)) / 2 + 14px));
}
/* #endif */
/* 按压反馈（视觉，无新增交互逻辑） */
.floating-switch:active {
  transform: scale(0.94);
  box-shadow: 0 3px 9px rgba(47, 58, 51, 0.24);
}
.floating-icon { font-size: 21px; line-height: 1; }
.floating-text {
  font-size: 10px; color: #fff; margin-top: 3px;
  line-height: 1.2; letter-spacing: 0.3px; white-space: nowrap;
}

/* 新建家族树入口 + 表单弹层 */
.create-entry {
  display: flex; align-items: center; gap: 8px;
  margin-top: 14px; padding: 14px 16px;
  background: #F1F6F2; border: 1px dashed #C8A88A; border-radius: 14px;
}
.create-icon { font-size: 18px; color: #4E6B57; font-weight: bold; }
.create-text { flex: 1; font-size: 15px; color: #2F3A33; font-weight: bold; }
.create-hint { font-size: 12px; color: #999; }

.ct-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 960;
  display: flex; align-items: center; justify-content: center;
}
.ct-modal {
  width: 92%; max-width: 460px; max-height: 86vh;
  background: #fff; border-radius: 16px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}
.ct-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px 8px; border-bottom: 1px solid #E6EDE7;
}
.ct-title { font-size: 16px; font-weight: bold; color: #2F3A33; }
.ct-close { width: 30px; height: 30px; line-height: 30px; text-align: center; font-size: 16px; color: #999; }
.ct-body { padding: 12px 14px 16px; overflow-y: auto; }
.ct-label { display: block; font-size: 12px; color: #4E6B57; margin: 10px 0 4px; }
.ct-fee {
  margin: 14px 0 10px; padding: 10px 12px;
  background: #F6FAF6; border-radius: 10px;
}
.ct-fee-text { display: block; font-size: 13px; color: #2F3A33; }
.ct-fee-sub { display: block; font-size: 11px; color: #999; margin-top: 4px; line-height: 1.5; }
.ct-error { display: block; text-align: center; color: #C62828; font-size: 13px; margin-bottom: 8px; }

/* ================= 夜间模式（html[data-theme='dark']）=================
   本页**没有**任何容器级深色兜底，所有色都是逐元素硬编码喰色，故夜间必须逐元素给对偶值。
   口径（与 styles/td-dark-warm.css 同族，不另发明色）：
     卡面 #232E2B · 按下/浅底 #2A3631 · 底 #1B2422 · 边框/分割 #36453F
     主字 #DFE9E4 · 次字 #A5B6AE · 更淡 #7A8B83 · 暖棕主色 #D9A96B（字压主色时用 #1B2422）
   **不用 invert / filter 反色 hack**：反色会把 emoji、图标、阴影一起翻掉，且与 T3 几何口径冲突。
   全部 H5 条件编译 ⇒ 小程序零改动。 */
/* #ifdef H5 */
/* —— 搜索框（输入框本体：米白底 → 卡面底；描边 → 夜间分割色）—— */
html[data-theme='dark'] .person-search :deep(.t-input) {
  background: #232E2B;
  border-color: #36453F;
}
/* 内嵌搜索按钮：暖棕主色一档（#D9A96B），字取深色（对比 6.4:1，白字只有 2.1:1） */
html[data-theme='dark'] .search-btn { background: #D9A96B; }
html[data-theme='dark'] .search-btn:active { background: #C49A60; }
html[data-theme='dark'] .search-btn-text { color: #1B2422; }

/* —— 搜索结果面板 —— */
html[data-theme='dark'] .person-search-panel {
  background: #232E2B; border-color: #36453F;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
html[data-theme='dark'] .ps-section + .ps-section { border-top-color: #36453F; }
html[data-theme='dark'] .ps-result { border-bottom-color: #36453F; }
html[data-theme='dark'] .ps-section-title { color: #A5B6AE; }
html[data-theme='dark'] .ps-name { color: #DFE9E4; }
html[data-theme='dark'] .ps-id,
html[data-theme='dark'] .ps-tree,
html[data-theme='dark'] .ps-tip { color: #A5B6AE; }
html[data-theme='dark'] .ps-restricted { color: #7A8B83; }
html[data-theme='dark'] .ps-error { color: #E0675F; }

/* —— 排序条 / 家谱·祖谱切换 —— */
html[data-theme='dark'] .sort-btn { background: #232E2B; border-color: #36453F; }
html[data-theme='dark'] .sort-text { color: #D9A96B; }
html[data-theme='dark'] .sort-btn.active { background: #D9A96B; border-color: #D9A96B; }
html[data-theme='dark'] .sort-btn.active .sort-text { color: #1B2422; }
html[data-theme='dark'] .tab-switch { background: #232E2B; border-color: #36453F; }
html[data-theme='dark'] .tab-text { color: #D9A96B; }
html[data-theme='dark'] .tab-btn.active { background: #D9A96B; }
html[data-theme='dark'] .tab-btn.active .tab-text { color: #1B2422; }

/* —— 列表卡片（t-cell-group + t-cell 的 token 也在这里收口，避免只改外壳）—— */
html[data-theme='dark'] .hall-list :deep(.t-cell-group) {
  background: #232E2B;
  border-color: #36453F;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
html[data-theme='dark'] .hall-list :deep(.t-cell) {
  --td-cell-hover-color: #2A3631;
  --td-cell-border-color: #36453F;
  --td-cell-right-icon-color: #7A8B83;
  --td-cell-title-color: #DFE9E4;
  --td-cell-description-color: #A5B6AE;
}
html[data-theme='dark'] .hall-list :deep(.t-cell__title-text) { color: #DFE9E4; }
html[data-theme='dark'] .hall-list :deep(.t-cell__description) { color: #A5B6AE; }
html[data-theme='dark'] .hall-list :deep(.t-cell__note) { color: #B4C2BB; }
html[data-theme='dark'] .note-text { color: #B4C2BB; }
html[data-theme='dark'] .hall-list :deep(.rank-tag) {
  --td-tag-default-color: #B4C2BB;
  --td-tag-default-font-color: #B4C2BB;
  --td-tag-default-light-color: #2A3631;
}
html[data-theme='dark'] .people-tag { background: #2A3631; color: #B4C2BB; }
html[data-theme='dark'] .live-tag { background: #26301F; color: #A6C79A; }

/* —— 加载态 / 空态 —— */
html[data-theme='dark'] .loading { background: #232E2B; border-color: #36453F; }
html[data-theme='dark'] .empty { background: #232E2B; border-color: #4C5A54; color: #A5B6AE; }

/* —— 页脚（含「关于本站 · 免责声明」链接）—— */
html[data-theme='dark'] .footer,
html[data-theme='dark'] .footer-copy,
html[data-theme='dark'] .footer-dot { color: #7A8B83; }
html[data-theme='dark'] .footer-link { color: #A5B6AE; border-bottom-color: #7A8B83; }

/* —— 浮动切换按钮（右侧圆形）—— */
html[data-theme='dark'] .floating-switch {
  background: #D9A96B;
  border-color: rgba(27, 36, 34, 0.35);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.35);
}
html[data-theme='dark'] .floating-text { color: #1B2422; }

/* —— 新建家族树入口 + 表单弹层（入口与弹层都在本页，漏了会露白）—— */
html[data-theme='dark'] .create-entry { background: #2A3631; border-color: #4C5A54; }
html[data-theme='dark'] .create-icon { color: #D9A96B; }
html[data-theme='dark'] .create-text { color: #DFE9E4; }
html[data-theme='dark'] .create-hint { color: #7A8B83; }
html[data-theme='dark'] .ct-modal { background: #232E2B; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6); }
html[data-theme='dark'] .ct-head { border-bottom-color: #36453F; }
html[data-theme='dark'] .ct-title { color: #DFE9E4; }
html[data-theme='dark'] .ct-close { color: #A5B6AE; }
html[data-theme='dark'] .ct-label { color: #D9A96B; }
html[data-theme='dark'] .ct-fee { background: #2A3631; }
html[data-theme='dark'] .ct-fee-text { color: #DFE9E4; }
html[data-theme='dark'] .ct-fee-sub { color: #7A8B83; }
html[data-theme='dark'] .ct-error { color: #E0675F; }
/* #endif */
</style>
