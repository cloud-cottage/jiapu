<template>
  <view class="tree-pedigree">
    <view class="stats" v-if="visibleForest.length">
      <text class="stat">共 {{ props.peopleTotal > 0 ? props.peopleTotal : totalPeople }} 人</text>
      <text class="stat">{{ founderLabel }}</text>
      <text v-if="mirrorTierText" class="stat stat-hint">{{ mirrorTierText }}</text>
      <text v-if="keyMarkerCount > 0" class="stat stat-hint">关键节点 {{ keyMarkerCount }}</text>
      <text v-if="hiddenMarkerCount > 0" class="stat stat-hint">（已隐 {{ hiddenMarkerCount }} 个外树登记）</text>
    </view>

    <view v-if="loading" class="loading">
      <text>加载中...</text>
    </view>

    <view v-else-if="error" class="error">
      <text>{{ error }}</text>
    </view>

    <!-- ECharts 世系树 -->
    <view v-else-if="visibleForest.length" class="chart-wrap">
      <view id="tree-chart" class="chart" />
      <text class="hint">💡 点击人物节点查看详情 · {{ panHint }} · 拖动平移 · ＋/－ 缩放</text>
    </view>

    <!-- 缩放控制按钮（左下角） -->
    <view v-if="visibleForest.length" class="zoom-controls">
      <view class="zoom-btn" @click="zoomIn">
        <text class="zoom-icon">＋</text>
      </view>
      <view class="zoom-btn" @click="zoomOut">
        <text class="zoom-icon">－</text>
      </view>
      <view class="zoom-btn" @click="zoomReset">
        <text class="zoom-icon">⟳</text>
      </view>
    </view>

    <!-- 图示切换按钮（右侧悬浮：纵向/横向 + 迁徙地图） -->
    <view v-if="visibleForest.length" class="layout-switcher">
      <view
        v-for="opt in layoutOptions"
        :key="opt.id"
        class="layout-btn"
        :class="{ active: opt.id !== 'migration' && currentLayout === opt.id }"
        @click="switchLayout(opt.id)"
      >
        <text class="layout-icon">{{ opt.icon }}</text>
        <text class="layout-name">{{ opt.name }}</text>
      </view>
      <!-- 跨树登记标记显隐（总谱专用：隐藏 52 个链接标签，只留血缘主链） -->
      <view
        v-if="markerTotal > 0"
        class="layout-btn"
        :class="{ active: showMarkers }"
        @click="toggleMarkers"
      >
        <text class="layout-icon">🏷️</text>
        <text class="layout-name">{{ showMarkers ? '隐藏外树' : `外树+${hiddenMarkerCount}` }}</text>
      </view>
    </view>

    <view v-else-if="!loading" class="empty">
      <text>该家族暂无世系数据</text>
    </view>

    <!-- 多支始祖列表（虚拟根「始祖」点击展开）：始祖也是具体人物，点击看档案 -->
    <view v-if="showRoots" class="modal-mask" @click="closeRootsList">
      <view class="modal" @click.stop>
        <text class="modal-name">本树共 {{ visibleForest.length }} 支始祖</text>
        <text class="promote-sub">
          始祖也是具体的人物节点，点击可查看并编辑其档案。分迁占位始祖将跳转对应新家族树。
        </text>
        <scroll-view scroll-y class="attach-results">
          <view
            v-for="r in visibleForest"
            :key="r.handle"
            class="attach-item"
            @click="goRootPerson(r)"
          >
            <text class="attach-name">{{ r.name }}</text>
            <text class="attach-id">{{ personIdDisplay(r.gramps_id) }}</text>
          </view>
        </scroll-view>
        <view class="modal-actions">
          <text class="btn-close" @click="closeRootsList">关闭</text>
        </view>
      </view>
    </view>

    <!-- 祖谱图谱节点菜单（右键 / 长按「下游支系登记镜像」节点弹出）：菜单头 = 挂靠落点，
         菜单项 = 打开支系家族树首页 / 打开真身档案。主点击行为不变（镜像 → 真身档案） -->
    <view v-if="nodeMenu" class="node-menu-mask" @click="nodeMenu = null">
      <view class="node-menu" :style="nodeMenuStyle" @click.stop>
        <text v-if="nodeMenu.anchorText" class="node-menu-note">{{ nodeMenu.anchorText }}</text>
        <text class="node-menu-item" @click="openMenuArchive">📄 打开真身档案</text>
        <text class="node-menu-item" @click="openMenuBranchTree">📂 打开「{{ nodeMenu.label }}」首页</text>
        <text class="node-menu-cancel" @click="nodeMenu = null">取消</text>
      </view>
    </view>

    <!-- 唯一人物弹窗（点击节点/支始祖直达；档案内可内联编辑 + 谱系管理，不叠弹窗） -->
    <PersonDetailModal ref="archiveModal" :tree-manage="treeManage" @tree-changed="onTreeChanged" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { fetchPersonList, fetchFamilyList, fetchTreeMetaRemote } from '@/business/api';
import type { FamilySummary } from '@/business/api';
import { buildPedigreeForest, cardChipHit } from '@/business/pedigree';
import type { PedigreeTreeKind, TreePersonNode, PedigreeNodeAnnotation } from '@/business/pedigree';
import { personIdDisplay, nameWithTitles } from '@/business/format';
import { openTreeHome, mirrorLabelOf, mirrorTargetOf, treeKindOf, themeRef } from '@/business';
import * as echarts from 'echarts';
import PersonDetailModal from '@/components/person-detail-modal/person-detail-modal.vue';

/**
 * `focusHandle` 命中节点的**卡面标记**文案（批 B 起用于锚点「我」；沿用关键节点的 ★ 前缀风格，不新造图标）。
 *
 * ⚠️ 声明在 `withDefaults` **之前**：`withDefaults` 的默认值对象在模块求值期就会求值，写在后面会 TDZ。
 * 邀请落地页（批 C-2）传 `focusLabel="★建议绑定"` —— 那里被邀请人尚未绑定，标「我」会误读。
 */
const FOCUS_MARKER = '★我';
/** 「我」标记的高亮色（卡面文字改色，与关键节点标注同一套呈现方式）——两态色值见下方 `buildPalette.focusColor` */

const props = withDefaults(
  defineProps<{
    treeId: string;
    /** 默认布局：vertical（纵向）/ horizontal（横向）；总谱树图用 vertical */
    defaultLayout?: 'vertical' | 'horizontal';
    /** 首屏展开层数（0/缺省 = 整树全展开，保持既有行为）；总谱 49 层建议 12 */
    initialDepth?: number;
    /** 默认隐藏「跨树登记标记」节点（external_tree 指向别的家族树；总谱里它们是链接标签不是血缘节点） */
    hideExternalMarkers?: boolean;
    /** handle → 世数（总谱源流链 external_chain_gen）：卡片内显示「第 N 世」 */
    genMap?: Record<string, number>;
    /**
     * handle → 关键节点标注（中华世本原「时间轴」的 KEY_NODES：人文始祖 / 五帝 / 周文王 / 元圣…）。
     * 命中节点在卡片内加一行「★标签」并把卡面文字改为主题色；缺省空对象 = 与原有行为完全一致。
     */
    keyMarkers?: Record<string, { label: string; color?: string }>;
    /**
     * 档案弹窗内是否启用「谱系管理」操作区（加父/加子/加配偶/续编/批量添加子孙；缺省 true = 与原行为一致）。
     * 宿主想在自己那层知道谱系改动（刷新人数/统计）时监听 `@tree-changed`。
     */
    treeManage?: boolean;
    /**
     * 统计栏「共 N 人」的权威人数（可选；> 0 时优先于本组件自行拉取的 people 条数）。
     * 宿主传入后端 /tree/rank 的 person_count（家族人数新口径）→ 家族页统计栏与首页卡片同口径。
     * 缺省 0 = 沿用既有 totalPeople（其它宿主行为完全不变）。
     */
    peopleTotal?: number;
    /**
     * 「我」的锚点 handle（宿主传入：当前用户在本树绑定的那个节点；只有锚点属本树时才传）。
     * ① 首屏**只居中一次**到该节点（此后用户拖动/缩放一律不被夺回；zoomReset 语义不变）；
     * ② 该节点卡面追加「我」标记行并把卡面文字改成高亮色。
     * 缺省空串 ⇒ 与原有行为完全一致。居中与标记对图元尺寸/布局零影响：
     * 标记只追加进卡面文字，不参与卡宽/卡高/世代行距的计算。
     */
    focusHandle?: string;
    /**
     * `focusHandle` 命中节点的卡面标记文案（缺省 `★我` = 批 B 行为逐字不变）。
     * 邀请落地页传 `★建议绑定`（被邀请人未绑定，标「我」会误读）。
     */
    focusLabel?: string;
    /**
     * **邀请落地页专用**（批 C-2）：持邀请码时把 `X-Invite-Code` 随 `fetchPersonList` / `fetchFamilyList`
     * 一起发出 ⇒ 服务端放行**整棵树**（不裁剪）。缺省空串 ⇒ 两个请求都不带该头，其它宿主逐字回落既有行为。
     */
    inviteCode?: string;
    /**
     * **祖谱图谱节点注记**（handle → 注记；**缺省空对象 = 其它宿主逐字不变**）。
     * 祖谱档把上游世本镜像段 + 本宗自有世代 + 下游支系登记镜像画进同一张图后，用本注记让三类节点
     * 视觉可辨并给下游登记镜像补「次级入口」——**全部落在卡面上、渲染期即画**（见 `annotationCardLines`）：
     * - `badge`：卡面次级行角标（弱化 11px，同「外树 x」角标一行）——上游镜像形如「中华世本 · 只读」，
     *   下游登记镜像形如「季氏费县白露家族 · 59 人 · 只读」；自有真实节点无 badge（= 可编辑那类）。
     * - `anchorText`：挂靠落点文案（形如「挂于 季行父（000000162）之下」）——卡面上逐行可见，不只藏在菜单里。
     * - `founderText`：**支系始祖姓名行**（形如「始祖：季花」）——支系始祖姓名在卡面上的可见落点。
     * - `chipLabel` / `openTreeId` / `openTreeLabel`：仅下游支系登记镜像填。卡面画**可见入口**
     *   chip（形如「📂 打开〈季氏费县白露家族〉」），**点它即打开该支系家族树首页**（命中判据
     *   `cardChipHit`，按 chip **实际行下标**算命中带 —— 注记行排在配偶行之前，chip 不必是末行；
     *   命中时不再下沉主点击行为）——入口**不依赖右键 / 长按**，iOS Safari H5 等无右键
     *   手势的环境同样可达。同一入口另在**节点右键 / 长按菜单**保留一份（双路径，菜单头 = 挂靠落点）。
     *   **主点击行为不变**（点卡面其余处，镜像节点仍走「打开真身档案」，见 renderChart 的 click）。
     */
    nodeAnnotations?: Record<string, PedigreeNodeAnnotation>;
  }>(),
  {
    defaultLayout: 'vertical',
    initialDepth: 0,
    hideExternalMarkers: false,
    genMap: () => ({}),
    keyMarkers: () => ({}),
    treeManage: true,
    peopleTotal: 0,
    focusHandle: '',
    focusLabel: FOCUS_MARKER,
    inviteCode: '',
    nodeAnnotations: () => ({}),
  },
);

const emit = defineEmits<{
  /** 树结构已被修改（加父/加子/加配偶/拆分/续编/批量）：宿主按需刷新自己加载的数据 */
  (e: 'tree-changed'): void;
}>();

// 完整档案弹窗（点节点/支始祖直达；档案内内联编辑 + 谱系管理，唯一弹窗层）
const archiveModal = ref<InstanceType<typeof PersonDetailModal> | null>(null);

/** 档案内谱系管理操作完成（加父加子/拆分/续编/批量）：刷新树图（PersonArchive 已自行刷新档案）+ 通知宿主 */
function onTreeChanged() {
  loadData();
  emit('tree-changed');
}

// 指定始祖 gramps_id（来自 tree-meta.json）：以始祖为根构建世系
const founderGrampsId = ref('');
/**
 * 本树种类（**单点判定**；口径 = 后端 `compat-api/lib/family-population.js` 的 `treeKind()`，
 * 经 `treeKindOf(tree-meta entry)` 取）。祖谱档（`'clan'`）在图示上**不做 founder 截断**
 * ⇒ 上游世本镜像段 / 本宗自有世代 / 下游支系登记镜像同一张图；世本档、家族树档逐字不变。
 */
const treeKind = ref<PedigreeTreeKind>('family');
const loading = ref(true);
const error = ref('');
const forest = ref<TreePersonNode[]>([]);
const totalPeople = ref(0);
const currentLayout = ref<string>(props.defaultLayout);
// 布局切换（右侧悬浮图标列）：纵向/横向 + 迁徙地图（跳转专页）
const layoutOptions = [
  { id: 'vertical', name: '纵向', icon: '📊' },
  { id: 'horizontal', name: '横向', icon: '📐' },
  { id: 'migration', name: '迁徙地图', icon: '🗺️' },
];
// 缩放状态（1 = 100%）
const zoomLevel = ref(1);

// ---- 跨树登记标记显隐（总谱：默认隐藏，避免外树登记占位把树图压糊） ----
const showMarkers = ref(!props.hideExternalMarkers);

/** 家族关系数据（用于判定「孤立占位」）：父子/配偶关系都在 families 里 */
const familyList = ref<FamilySummary[]>([]);

/** 本树内有任何家族关系（父/母/子女/配偶）的 handle 集合 */
const relatedHandles = computed(() => {
  const s = new Set<string>();
  for (const f of familyList.value) {
    if (f.father_handle) s.add(f.father_handle);
    if (f.mother_handle) s.add(f.mother_handle);
    for (const c of f.child_handles) s.add(c);
  }
  return s;
});

/** 跨树登记：external_tree 指向别的家族树（链接标签，不是血缘节点） */
function isExternalMarker(n: TreePersonNode): boolean {
  return !!n.external_tree && n.external_tree !== props.treeId;
}

/**
 * 孤立占位：本树内**无任何家族关系**（无父母、无配偶、无子女）且无下代。
 * 仅这类跨树登记节点按「外树登记」隐藏（docs/marriage.spec.md §7-3 / docs/founder-attach.spec.md §6）：
 * 带家族关系的真人或镜像（如祖谱顶端世本镜像段）**不得**整支隐藏。
 */
function isIsolatedPlaceholder(n: TreePersonNode): boolean {
  if (relatedHandles.value.has(n.handle)) return false;
  if (n.children?.length) return false;
  if (n.spouseNames?.length) return false;
  return true;
}

/** 可隐藏的外树登记：跨树登记 **且** 孤立占位（两者缺一不隐藏） */
function isHidableMarker(n: TreePersonNode): boolean {
  return isExternalMarker(n) && isIsolatedPlaceholder(n);
}

function countMarkers(nodes: TreePersonNode[]): number {
  let n = 0;
  for (const x of nodes) {
    if (isHidableMarker(x)) n += 1;
    if (x.children?.length) n += countMarkers(x.children);
  }
  return n;
}

function pruneMarkers(nodes: TreePersonNode[]): TreePersonNode[] {
  return nodes
    .filter((n) => !isHidableMarker(n))
    .map((n) => (n.children?.length ? { ...n, children: pruneMarkers(n.children) } : n));
}

/**
 * 镜像档位顺序（marriage → child → founder → chain → 其它档）：文案统一经 mirrorLabelOf 取，
 * 不在树图里写第二套「外树配偶/外树子女/…」映射（口径 A 第 6/7 条）。
 */
const MIRROR_TIER_LINK_TYPES = ['marriage', 'child', 'founder', 'chain', ''];

/**
 * 统计栏的镜像分档文案（口径 A 第 7 条）：
 * 按档分列、**只显示大于 0 的档**，形如「外树配偶 1 · 外树子女 2 · 外树始祖 1」；
 * 无镜像节点 → 空串（该项不渲染）。
 */
const mirrorTierText = computed(() => {
  const counts = new Map<string, number>();
  const walk = (nodes: TreePersonNode[]) => {
    for (const x of nodes) {
      const label = mirrorTierOf(x);
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
      if (x.children?.length) walk(x.children);
    }
  };
  walk(forest.value);
  return MIRROR_TIER_LINK_TYPES.map((lt) => mirrorLabelOf(lt))
    .map((label) => ({ label, count: counts.get(label) || 0 }))
    .filter((g) => g.count > 0)
    .map((g) => `${g.label} ${g.count}`)
    .join(' · ');
});

/** 登记标记总数（用于开关文案与显隐） */
const markerTotal = computed(() => countMarkers(forest.value));
/** 实际画进图里的森林（隐藏标记时不含它们） */
const visibleForest = computed(() => (showMarkers.value ? forest.value : pruneMarkers(forest.value)));
/** 被隐藏的标记数 */
const hiddenMarkerCount = computed(() => markerTotal.value - countMarkers(visibleForest.value));

function toggleMarkers() {
  showMarkers.value = !showMarkers.value;
  scheduleRender();
}

// 多支始祖列表（虚拟根「始祖」点击展开）：始祖也是具体人物，可查看/编辑
const showRoots = ref(false);

function openRootsList() {
  showRoots.value = true;
}
function closeRootsList() {
  showRoots.value = false;
}

/** 支始祖点击：分迁占位跳新家族树；其余弹窗内看完整档案（可编辑） */
function goRootPerson(node: TreePersonNode) {
  showRoots.value = false;
  if (node.external_link_type === 'branch' && node.external_tree) {
    openTreeHome(node.external_tree);
    return;
  }
  if (!node.handle) return;
  // 口径 A：镜像节点（external_mirror='true' + 真身指针齐备）→ 弹窗解析为真身档案
  archiveModal.value?.open(props.treeId, node.handle, node);
}

/* ---- 祖谱图谱：镜像节点的次级入口菜单（右键 / 长按；**主点击行为不变**）
 * ⚠️ 本菜单**不是**支系首页入口的唯一路径：同一入口在渲染期就画在卡面上（`annotationCardLines` 的
 * 可见入口 chip「📂 打开〈树名〉」，点击路由 = `chipTreeIdOfNode`）。菜单是**第二条路径**，供桌面右键 /
 * Android 长按顺手使用；缺了它 iOS Safari H5 等无右键手势的环境才是不可达（旧口径的缺陷）。
 * 祖谱页原「③ 支系入口列表」的**打开支系家族树首页**入口（与「挂于 …之下」落点提示）落到本菜单：
 * 主点击仍走上面的 click（镜像 → 打开真身档案），本菜单只承载次级动作，二者不冲突。
 * 仅当宿主传入 `nodeAnnotations` 且注记带 `openTreeId` 的节点才弹；其它宿主 / 其它节点一律无菜单。 */

/** 菜单状态（null = 关闭） */
const nodeMenu = ref<{ x: number; y: number; label: string; anchorText: string; node: TreePersonNode } | null>(
  null,
);

/** 菜单定位（fixed；贴鼠标点，右/下越界时退回安全边距内） */
const nodeMenuStyle = computed(() => {
  const m = nodeMenu.value;
  if (!m) return {};
  const MENU_W = 232;
  const MENU_H = 128;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const left = vw ? Math.min(m.x, Math.max(8, vw - MENU_W - 8)) : m.x;
  const top = vh ? Math.min(m.y, Math.max(8, vh - MENU_H - 8)) : m.y;
  return { left: `${left}px`, top: `${top}px` };
});

/** 右键 / 长按命中「带次级入口的注记节点」→ 弹菜单 */
function onChartContextMenu(params: any) {
  const d = params?.data as TreePersonNode | undefined;
  const note = annotationOf(d);
  if (!d || !note?.openTreeId) return;
  const native = params?.event?.event as MouseEvent | undefined;
  nodeMenu.value = {
    x: native?.clientX ?? 0,
    y: native?.clientY ?? 0,
    label: note.openTreeLabel || note.openTreeId,
    anchorText: note.anchorText || '',
    node: d,
  };
}

/** 菜单项：打开真身档案（与主点击同口径 —— 本层只读镜像，内容一律取真身） */
function openMenuArchive() {
  const m = nodeMenu.value;
  nodeMenu.value = null;
  if (!m?.node?.handle) return;
  archiveModal.value?.open(props.treeId, m.node.handle, m.node);
}

/** 菜单项：打开该支系家族树首页（原祖谱③段支系入口的图上落点） */
function openMenuBranchTree() {
  const m = nodeMenu.value;
  const tid = annotationOf(m?.node)?.openTreeId;
  nodeMenu.value = null;
  if (tid) openTreeHome(tid);
}

/** 拦截浏览器右键菜单的元素（**仅**宿主传了节点注记的祖谱图绑；其它宿主零变化） */
let ctxEl: HTMLElement | null = null;
function blockNativeContextMenu(e: Event) {
  e.preventDefault();
}
function bindNativeContextMenuBlock(el: HTMLElement) {
  if (!Object.keys(props.nodeAnnotations || {}).length) return;
  if (ctxEl === el) return;
  unbindNativeContextMenuBlock();
  el.addEventListener('contextmenu', blockNativeContextMenu);
  ctxEl = el;
}
function unbindNativeContextMenuBlock() {
  if (ctxEl) {
    ctxEl.removeEventListener('contextmenu', blockNativeContextMenu);
    ctxEl = null;
  }
}

/* ---- 祖谱图谱：**卡面可见入口 chip** 的点击路由（与上面的右键/长按菜单构成双路径） ----
 * chip 在渲染期就画在卡面上（`annotationCardLines` → 最后一行），**不需要右键 / 长按**即可看见并点到
 * ⇒ iOS Safari H5 等无右键手势的环境同样可打开支系家族树首页（旧口径只有 `contextmenu`，不可达）。
 * 判定命中后**不再下沉**主点击行为（等价 `stopPropagation`：本次点击不打开真身档案、不冒泡到宿主容器）。 */

/**
 * 本次点击是否命中该节点的**卡面可见入口 chip**；命中 ⇒ 返回目标支系 tree_id（否则空串）。
 * 判据 = ① 该节点注记带可见入口（`openTreeId` + `chipLabel`）；② 点击纵向落点在该节点卡面上
 * **chip 实际所在行**的条带内（`cardChipHit`；行下标与行数由 `decorateTree` 渲染期烘入
 * `_chipLineIndex` / `_lineCount`，卡面以节点布局点为心）。取不到节点像素 / 指针坐标 / 行序
 * ⇒ 不命中（回落到主点击行为）。
 */
function chipTreeIdOfNode(node: TreePersonNode, params: any): string {
  const note = annotationOf(node);
  if (!note?.openTreeId || !note.chipLabel) return '';
  const chipLine = node._chipLineIndex;
  const lineCount = node._lineCount;
  if (typeof chipLine !== 'number' || typeof lineCount !== 'number') return '';
  const idx = typeof params?.dataIndex === 'number' ? params.dataIndex : -1;
  const center = nodePixelOfIndex(idx);
  const y = pointerYOf(params);
  if (!center || y === null) return '';
  return cardChipHit(y - center.y, lineCount, chipLine) ? note.openTreeId : '';
}

/**
 * 本次点击的指针纵坐标（canvas 局部像素 = 与 `nodePixelOfIndex` 同一坐标系）。
 * 依次试 zrender 级 `zrY` → 事件级 `offsetY` → 原生事件 `offsetY`（鼠标 / 触摸都取得到）。
 */
function pointerYOf(params: any): number | null {
  const ev = params?.event;
  const y = ev?.zrY ?? ev?.offsetY ?? ev?.event?.offsetY;
  return typeof y === 'number' && Number.isFinite(y) ? y : null;
}

let chart: echarts.ECharts | null = null;
let renderTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * 下一次 renderChart 是否抑制补间（主题切换专用）：切主题只换颜色、坐标系与节点位置逐值不变，
 * 再播一遍入场/更新动画等于无端闪一下 ⇒ 这一次 setOption 用 animationDuration 0，渲完立刻复位。
 */
let suppressThemeAnim = false;

/**
 * 统计栏「始祖」= **数据口径**（不是图上顶端节点）：`tree-meta` 的 `founder_gramps_id` 指针所指节点，
 * 在本树 people 里现取姓名（读失败 / 指针缺省 / 本树无该节点 ⇒ 空串）。loadData 里一次性算好。
 *
 * ⚠️ **不得用图上顶端冒充始祖**：祖谱档（kind='clan'）图以全树根构图、不按 founder 截断，图上顶端
 * 可能是上游世本镜像段（如「季行父」），它**不等于**始祖（图上顶端是否 = 始祖属另一回事，统计栏不断言）。
 * 数据真源仍是 tree-meta 的 founder 指针（`founder_handle` / `founder_gramps_id`，本处**只读不改**）。
 */
const founderNameByData = ref('');

/** 统计栏文案：祖谱档按**数据口径**显示始祖；家族树 / 世本档沿用既有口径（逐字不变） */
const founderLabel = computed(() => {
  if (treeKind.value === 'clan') {
    // 祖谱档：数据口径姓名取不到（founder 指针缺省 / 本树 people 无该节点）⇒ 回落支数，不臆断姓名
    return founderNameByData.value
      ? `始祖：${founderNameByData.value}`
      : `${visibleForest.value.length} 支始祖`;
  }
  // 家族树 / 世本档：founder 截断后唯一根即数据 founder（同名同人）⇒ 与改造前逐字一致
  if (founderGrampsId.value && visibleForest.value.length === 1) {
    return `始祖：${visibleForest.value[0]?.name || ''}`;
  }
  return `${visibleForest.value.length} 支始祖`;
});


/** 加载世系数据（人物 + 家族 + 始祖指定）并渲染 */
async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const [meta, people, families] = await Promise.all([
      fetchTreeMetaRemote().catch(() => null),
      fetchPersonList(props.treeId, 0, 0, props.inviteCode),
      fetchFamilyList(props.treeId, props.inviteCode),
    ]);
    // tree-meta 仅用于 founder_gramps_id（不单独缓存）
    founderGrampsId.value = meta?.trees?.[props.treeId]?.founder_gramps_id || '';
    // 统计栏「始祖」的**数据口径**姓名（tree-meta founder 指针 → 本树 people 现取；只在统计栏文案里用，
    // 不参与任何展示数据的改写。祖谱档因此不再拿图上顶端当始祖 —— 见 founderLabel）
    founderNameByData.value = founderGrampsId.value
      ? people.data.find((p) => p.gramps_id === founderGrampsId.value)?.name || ''
      : '';
    totalPeople.value = people.data.length;
    // 家族关系（用于「孤立占位」判定：仅无任何家族关系的外树登记才隐藏）
    familyList.value = families;
    // 本树是否家族树 / 祖谱（**单点判定**）：口径 = 后端 compat-api lib/family-population.js treeKind()
    // —— is_master===true || kind==='master' → 世本；kind==='clan' → 祖谱；其余含 kind 缺省 → 家族树。
    // meta 取不到 → treeKindOf 返 family，即按家族树处理（与后端 kind 缺省口径一致）。
    // 分面一：**只有家族树**的树图不绘制「外树子女镜像」（该节点连同其子树整支不入图）；
    //   世本 / 祖谱照旧绘制（顶端链镜像 chain、始祖镜像 founder、祖谱登记镜像不动）。
    // 分面二：**只有祖谱档**在图示上关闭 founder 截断（全树根构图），使上游世本镜像段 + 本宗自有
    //   世代 + 下游支系登记镜像进同一张图并连成一条链（P-1）；世本 / 家族树保持 founder 截断。
    const kind = treeKindOf(meta?.trees?.[props.treeId]);
    treeKind.value = kind;
    forest.value = buildPedigreeForest(people.data, families, {
      founderGrampsId: founderGrampsId.value || undefined,
      excludeChildMirrors: kind === 'family',
      treeKind: kind,
    });
    if (chart) {
      chart.dispose();
      chart = null;
    }
    // 换树/重载：图元与装饰树一起重建 ⇒ 清掉补标记与「已居中」闸门（新树允许再首屏居中一次）
    lastChartRoot = null;
    markedHandle = '';
    renderedMarkers = {};
    focusCentered = false;
    scheduleRender();
  } catch (e: any) {
    error.value = `加载失败: ${e.message || e}`;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!props.treeId) {
    error.value = '缺少 tree_id 参数';
    loading.value = false;
    return;
  }
  loadData();
});

// tree_id 变化时重载（组件复用场景）
watch(
  () => props.treeId,
  (val) => {
    if (val && val !== '') {
      loadData();
    }
  },
);

onUnmounted(() => {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  // 卸载时停掉可能还在跑的首屏居中补间（不留 rAF 循环）
  if (centerTween !== null) {
    // #ifdef H5
    cancelAnimationFrame(centerTween);
    // #endif
    centerTween = null;
  }
  unbindWheel();
  unbindNativeContextMenuBlock();
  if (chart) {
    chart.dispose();
    chart = null;
  }
});

/** 等待图表容器完成布局后再初始化（容器隐藏/0 宽时 ECharts 会渲染空白） */
function scheduleRender(attempt = 0) {
  if (!visibleForest.value.length) return;
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!el || el.clientWidth === 0 || el.clientHeight === 0) {
    if (attempt < 50) {
      renderTimer = setTimeout(() => scheduleRender(attempt + 1), 100);
    }
    return;
  }
  renderTimer = null;
  renderChart();
}

/** ---- 方案 B：矩形名卡（传统谱系方框） ----
 * 汉字姓名是 ~3:1 的宽矩形，塞进小圆形必然字号被压小。
 * 改为「节点即名卡」：卡片宽按姓名宽度自适应，字号恒定可读（14px），
 * 性别用卡面底色区分（男浅蓝/女浅粉，见 genderFillColor），矩形边框另有严格约定
 * （见 decorateTree：默认 0 宽，仅已故者黑框）。
 * 注意：ECharts tree 布局按叶子数均分宽度、不感知 symbolSize，
 * 因此卡宽设上限、靠 roam 缩放承载密集区。
 * 说明：未用 roundRect —— ECharts 的 roundRect 圆角按 symbol 本地 2x2 再非等比
 * 放大，宽扁卡会变成椭圆角/胶囊形；直角方框视觉最可控、最贴近传统谱牒。
 */
const CARD_FONT = 14;
const CARD_PAD_X = 8; // 单侧内边距
const CARD_H = 28;
const CARD_MAX_W = 128; // 含 padding，约 8 个汉字 / 17 个拉丁字符
const CARD_MAX_W_TITLED = 216; // 带称号卡（姓+名+封号+谥号+号）放宽上限，避免称号被截断
const WEAK_FONT = 11;

/**
 * **名卡配色槽位（夜间模式补丁）**：ECharts 的颜色写在 JS option / series data 里，读不到 CSS 变量
 * ⇒ 由 `themeRef` 现取值（见 `palette`）。**浅色列 = 改造前逐字原值**（浅色观感零变化）；
 * 暗色列取暖调 token：底 #211A14 / 卡面 #2A2219 / 次容器 #241D16 / 主字 #EDE3D6 / 次字 #B8A894 /
 * 边框·连线 #3A3027–#4A3D31 / 强调 #C98850。
 * ⚠️ 只换颜色：卡宽/卡高/行距/symbolSize/盒子尺寸/布局参数一律与浅色同值 ⇒ 两态节点数与坐标逐值一致。
 */
function buildPalette(dark: boolean) {
  const nameColor = dark ? '#EDE3D6' : '#3E2723';
  const weakColor = dark ? '#B8A894' : '#9E8F80';
  /** 主色（浅色 #8B4513 棕 / 暗色 #C98850 暖棕）：虚拟根、占位卡边框、hover 边框、chip 文字 */
  const accent = dark ? '#C98850' : '#8B4513';
  /** 次级行 rich 样式（配偶行 / 第N世 / 外树镜像角标）：视觉上弱于姓名（14px / 主字） */
  const weakRich = { w: { fontSize: WEAK_FONT, color: weakColor } };
  /**
   * 卡面可见入口 chip 的 rich 样式（祖谱图谱：下游支系登记镜像的「📂 打开〈树名〉」）：
   * 弱化行内画成一个圆角小按钮（米底 + 浅棕边，暗色 = 次容器底 + 暗边框）。尺寸/内边距两态同值。
   */
  const chipRich = {
    fontSize: WEAK_FONT,
    color: accent,
    backgroundColor: dark ? '#241D16' : '#FBF6EF',
    borderColor: dark ? '#3A3027' : '#E0D5C8',
    borderWidth: 1,
    borderRadius: 8,
    padding: [2, 6] as [number, number],
  };
  return {
    nameColor,
    weakColor,
    /** 卡面 label 的 rich 样式集合（`w` 次级行 + `chip` 可见入口；系列默认与 per-node 覆盖共用） */
    cardRich: { ...weakRich, chip: chipRich },
    /**
     * 卡面底色：按性别区分（男冷 / 女暖 / 未知中性）。暗色不是把浅色变暗（那样会亮成一块白卡），
     * 而是「同一色相压到卡面色阶」：男 #232B31 / 女 #2E242A / 未知 #2A2219 —— 性别一眼可辨且整体偏暗。
     */
    cardFill: (g: string | undefined): string =>
      dark
        ? g === 'M' ? '#232B31' : g === 'F' ? '#2E242A' : '#2A2219'
        : g === 'M' ? '#EDF3F8' : g === 'F' ? '#FCEFF1' : '#F2F2F2',
    /** 已故者「明显边框」：浅色 = 黑；暗色 = 次字色（黑边在暗底上看不见） */
    deceasedBorder: dark ? '#B8A894' : '#000000',
    /** 虚拟根 / 占位卡（非人物卡）底色 */
    artifactFill: dark ? '#241D16' : '#F7EFE3',
    artifactBorder: accent,
    /** 世代连线（ECharts lineStyle） */
    lineColor: dark ? '#4A3D31' : '#A1887F',
    tooltipBg: dark ? '#2A2219' : '#FFFDF7',
    tooltipBorder: dark ? '#4A3D31' : '#8B4513',
    tooltipTextColor: nameColor,
    /** hover 强调边框 + 虚拟根卡面 */
    emphasisBorder: accent,
    rootFill: accent,
    /** 「我 / 建议绑定」标记色：浅色 #C62828 → 暗色 #E0675F（暗底可读的红） */
    focusColor: dark ? '#E0675F' : '#C62828',
  };
}

/** 当前主题的名卡色板（`themeRef` 变化 → 自动重算；纯色值，不含任何几何参数） */
const palette = computed(() => buildPalette(themeRef.value === 'dark'));


/** 近似测量字符串渲染宽度（全角≈fontSize，半角≈0.62em，空格≈0.5em） */
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 0;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x20000;
    w += wide ? fontSize : ch === ' ' ? fontSize * 0.5 : fontSize * 0.62;
  }
  return w;
}

/** 卡内文本：按最大内宽截断并补省略号（tooltip 仍显全名） */
function cardText(name: string, cardW: number, fontSize = CARD_FONT): string {
  const inner = cardW - CARD_PAD_X * 2;
  let t = name || '';
  while (t && estimateTextWidth(t, fontSize) > inner) t = t.slice(0, -1);
  return t === name ? name : `${t}…`;
}

/** 性别 → 卡面底色（两态色值见 `buildPalette.cardFill`：浅色浅蓝/浅粉，暗色同色相压暗） */
function genderFillColor(g: string | undefined): string {
  return palette.value.cardFill(g);
}

/** 递归生成名卡节点树（返回克隆，不改业务数据）：写入自适应卡宽/卡高 + 名卡样式。
 * 夫妇卡：节点有配偶（嫁入成员）时卡体加高，第二行起每行一个「娶 XX / 嫁 XX」（性别未知仍「配XX」），
 * 子女连线仍挂在整卡下方 —— 谱式“夫 + 配某氏”一格并列。
 * 次级行（配偶行/第N世/外树镜像角标）弱化 = 11px/#9E8F80，弱于姓名行（14px/#3E2723）。 */
const CARD_LINE_STEP = 22; // 每增一行的卡高增量（单行 CARD_H=28）；**与 business/pedigree.ts 的 CARD_CHIP_LINE_STEP 同值**（chip 命中判据按它算）
const CARD_GAP = 12; // 世代行距：卡高之外每层再留的间距（整树展开时按卡高铺开）
/** 卡片行数（与 decorateTree 的行构成一致）：姓名 / 关键节点标签 / 第N世 / 每位配偶各一行 / 祖谱节点注记行 */
function cardLines(node: TreePersonNode, artifact = false): number {
  let n = 1;
  if (!artifact && keyMarkerOf(node)) n++;
  if (!artifact && props.genMap?.[node.handle] !== undefined) n++;
  if (isMirrorNode(node) && !artifact) n++;
  if (!artifact) n += annotationCardLines(node).length;
  n += (node.spouseNames || []).filter(Boolean).length;
  return n;
}

/**
 * 外树镜像节点（嫁娶 / 跨树子女 / 认祖 / 上层链生成的「对方在本树的代表」）。
 * 判据集中在 `mirrorTargetOf`（口径 A 第 1 条：external_mirror='true' + 真身 handle + 真身树 三者齐备）。
 */
function isMirrorNode(node: TreePersonNode): boolean {
  return mirrorTargetOf(node) !== null;
}

/** 镜像档位文案（口径 A 第 6/7 条：卡片角标与统计栏同源）；非镜像 → null */
function mirrorTierOf(node: TreePersonNode): string | null {
  const t = mirrorTargetOf(node);
  return t ? mirrorLabelOf(t.linkType) : null;
}

/**
 * 宿主传入的节点注记（祖谱图谱：三类节点视觉可辨 + 下游登记镜像的次级入口）。
 * 缺省空对象 ⇒ 家族树 / 世本 / 总谱等宿主取不到任何注记，卡面与点击行为逐字不变。
 */
function annotationOf(node: TreePersonNode | undefined | null) {
  if (!node?.handle) return undefined;
  return props.nodeAnnotations?.[node.handle];
}

/**
 * 宿主注记在卡面上的次级行（祖谱图谱）——**渲染期现算、与任何事件无关**：
 * 角标（`badge`）→ **支系始祖姓名行**（`founderText`）→ 挂靠落点文案（`anchorText`）→
 * **卡面可见入口 chip**（`chipLabel`）。
 * 缺省（其它宿主 / 无注记节点 / 虚拟根与占位卡）⇒ 空数组 ⇒ 卡面与改造前**逐字一致**。
 * 下游支系登记镜像的「打开支系家族树首页」入口因此**画在卡面上**（不依赖右键 / 长按，iOS 可达），
 * 点击路由见 `chipTreeIdOfNode`（命中 chip **行**则打开该树，否则维持主点击 = 打开真身档案）。
 * ⚠️ 本数组整体排在**配偶行之前** ⇒ chip **不是**末行；命中带按 `decorateTree` 烘入的
 * **实际行下标**算（见 `cardChipHit`），不按「末行」估算。
 */
function annotationCardLines(node: TreePersonNode): { text: string; chip?: boolean }[] {
  const note = annotationOf(node);
  if (!note) return [];
  const out: { text: string; chip?: boolean }[] = [];
  if (note.badge) out.push({ text: note.badge });
  if (note.founderText) out.push({ text: note.founderText });
  if (note.anchorText) out.push({ text: note.anchorText });
  if (note.openTreeId && note.chipLabel) out.push({ text: note.chipLabel, chip: true });
  return out;
}

/**
 * 关键节点标注（宿主传入 keyMarkers 时命中；虚拟根/占位节点无标注）。
 * 用于卡片内「★标签」行与统计栏计数 —— 与「外树配偶」「第N世」行同一套行内排版。
 */
function keyMarkerOf(node: TreePersonNode): { label: string; color?: string } | null {
  if (!node.handle || !node.gramps_id) return null;
  return props.keyMarkers?.[node.handle] || null;
}

/** 命中关键节点标注的可见卡片数（统计栏提示） */
const keyMarkerCount = computed(() => {
  let n = 0;
  const walk = (nodes: TreePersonNode[]) => {
    for (const x of nodes) {
      if (keyMarkerOf(x)) n += 1;
      if (x.children?.length) walk(x.children);
    }
  };
  walk(visibleForest.value);
  return n;
});

/** 可见森林里最高的一张卡（决定世代行距；总谱卡带「第N世/配X」行会更高） */
const maxCardHeight = computed(() => {
  let h = CARD_H;
  const walk = (nodes: TreePersonNode[]) => {
    for (const n of nodes) {
      h = Math.max(h, CARD_H + (cardLines(n) - 1) * CARD_LINE_STEP);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(visibleForest.value);
  return h;
});

/**
 * 整树展开时的「世代行距」：ECharts 默认把 depth 层压进容器尺寸
 * （48 层的总谱 → 每层 ~7px，卡片全部压叠、文字看不清）。
 * → 按「层数 ×（最高卡高 + 行距）」铺开（TB/BT 撑 height、LR/RL 撑 width），
 *   超出容器的部分靠滚轮/拖动平移 + ＋/－ 缩放浏览；容器装得下则等于容器尺寸（= 原自适应行为）。
 * 注意：**两个维度都必须显式给出** —— setOption 是合并语义，切换布局时若只给一个维度，
 * 另一维度会残留上一次的值（曾因此横向模式套着纵向的 height → 画面近乎空白）。
 */
function layerBox(stretch: 'height' | 'width', depth: number): { width: number; height: number } | Record<string, never> {
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!el) return {};
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return {};
  const span = depth * (maxCardHeight.value + CARD_GAP);
  return {
    width: stretch === 'width' && span > w ? span : w,
    height: stretch === 'height' && span > h ? span : h,
  };
}

/** 当前布局下要撑开的维度：纵向撑高、横向撑宽 */
function stretchAxis(): 'height' | 'width' {
  return currentLayout.value === 'horizontal' ? 'width' : 'height';
}

function decorateTree(node: TreePersonNode, isVirtualRoot = false): TreePersonNode {
  const pal = palette.value;
  const artifact = isVirtualRoot || !node.gramps_id; // 虚拟根/占位节点（可点入口），非人物卡
  // 边框严格约定：人物卡默认 0 宽；仅已故（is_living===false = 有死亡记录）→ 明显边框
  // （浅色黑框 / 暗色次字色）；性别只由卡面底色区分。占位/虚拟根保留主色细框以示可点。
  // ⚠️ 只换颜色：borderWidth 与卡宽高两态同值（几何红线）。
  const border = artifact ? pal.artifactBorder : node.is_living === false ? pal.deceasedBorder : 'transparent';
  const borderWidth = artifact ? 1.5 : node.is_living === false ? 2 : 0;
  const fill = artifact ? pal.artifactFill : genderFillColor(node.gender);
  /** 宿主注记（祖谱图谱）：`badge` / `founderText` / `anchorText` / 卡面可见入口 `chipLabel`（见 annotationCardLines） */
  const note = artifact ? undefined : annotationOf(node);
  const lines: string[] = [];
  /** chip 在 `lines` 里的 0 基下标（-1 = 本卡无 chip）；渲染期烘进节点，供 `cardChipHit` 按实际行序算命中带 */
  let chipLineIndex = -1;
  /** 每行的卡面样式（与 lines 等长）：'' = 姓名行（14px/#3E2723）；'w' = 次级行（11px 弱化）；'chip' = 可见入口 */
  const styles: string[] = [];
  /** 加一行卡面文本；style = ''（姓名行）/ 'w'（次级行）/ 'chip'（卡面可见入口小按钮） */
  const pushLine = (text: string, style = '') => { lines.push(text); styles.push(style); };
  pushLine(nameWithTitles(node.name, node.titles));
  // 关键节点标注（世本 KEY_NODES：人文始祖 / 五帝 / 元圣 / 得姓始祖 / 宗主）：
  // 姓名下一行加「★标签」角标，卡面文字改主题色（与「外树配偶」「第N世」同款行，不新造图标）
  const km = artifact ? null : keyMarkerOf(node);
  if (km) pushLine(`★${km.label}`);
  // 总谱：卡片内显示世数（源流链 external_chain_gen，由宿主传入 genMap）；世数 0 = 原始节点
  const gen = props.genMap?.[node.handle];
  if (gen !== undefined && !artifact) pushLine(gen === 0 ? '原始' : `第${gen}世`, 'w');
  // 外树镜像节点按 external_link_type 分档加角标行（口径 A 第 6 条），与真人区分
  if (isMirrorNode(node) && !artifact) pushLine(mirrorLabelOf(node.external_link_type), 'w');
  // 宿主注记卡面行（祖谱图谱；**渲染期即画在卡面上** ⇒ 不靠右键/长按就能看见）：
  //   角标「中华世本 · 只读」/「<支系树> · N 人 · 只读」—— 与无角标的「本宗自有世代」真实节点构成三类可辨；
  //   挂靠落点文案「挂于 X（编号）之下」—— 原「③ 支系入口列表」的落点提示，不得只藏在右键菜单里；
  //   可见入口 chip「📂 打开〈树名〉」—— 下游支系家族树首页入口（点它 = 打开该树，见 click 内路由）；
  if (note) {
    for (const l of annotationCardLines(node)) {
      // 记录 chip 的**实际行下标**（注记行排在配偶行之前 ⇒ chip 不必是末行；命中带按此下标算）
      if (l.chip) chipLineIndex = lines.length;
      pushLine(l.text, l.chip ? 'chip' : 'w');
    }
  }
  // 配偶行文案按本节点性别分叉（2026-10 口径）：男「娶 某某」/ 女「嫁 某某」/ 性别未知仍「配某某」。
  // 一对夫妻在各自家族树图上互为「娶」「嫁」（如 季志全「娶 沈伟」↔ 沈伟「嫁 季志全」）。
  const spouseVerb = node.gender === 'M' ? '娶 ' : node.gender === 'F' ? '嫁 ' : '配';
  for (const s of node.spouseNames || []) if (s) pushLine(`${spouseVerb}${s}`, 'w');
  const rawW =
    Math.max(...lines.map((l, i) => estimateTextWidth(l, styles[i] === '' ? CARD_FONT : WEAK_FONT))) +
    CARD_PAD_X * 2;
  // 带称号（姓+名+封号+谥号+号）的卡允许更宽，避免称号被截断；带宿主注记角标（祖谱：来源树 · 人数）
  // 的卡同理放宽，避免「季氏费县白露家族 · 59 人 · 只读」被截成省略号。
  const maxW = node.titles || note?.badge ? CARD_MAX_W_TITLED : CARD_MAX_W;
  const w = Math.max(34, Math.min(maxW, rawW));
  const h = CARD_H + (cardLines(node, artifact) - 1) * CARD_LINE_STEP;
  const card: TreePersonNode = {
    ...node,
    itemStyle: { color: fill, borderColor: border, borderWidth },
    symbolSize: [w, h],
    // 卡面行序烘入（`cardChipHit` 的命中带按**实际行序**算：chip 不是末行时旧「末行」阈值会错位）
    _lineCount: lines.length,
    ...(chipLineIndex >= 0 ? { _chipLineIndex: chipLineIndex } : {}),
    _cardText: lines
      .map((l, i) =>
        styles[i] === ''
          ? cardText(l, w)
          : styles[i] === 'chip'
            ? `{chip|${cardText(l, w, WEAK_FONT)}}`
            : `{w|${cardText(l, w, WEAK_FONT)}}`,
      )
      .join('\n'),
  };
  // 关键节点：卡面文字用标注主题色（ECharts per-node label 覆盖；不命中则沿用系列默认深棕）
  if (km?.color) card.label = { color: km.color, rich: pal.cardRich };
  // 「我」/「建议绑定」标记（宿主传入的 focusHandle 节点）：卡面姓名下追加一行标记 + 卡面文字改高亮色。
  // 标记文案由 `focusLabel` 决定（缺省 ★我 = 批 B 既有行为逐字不变；邀请落地页传 ★建议绑定）。
  // 只写 _cardText（渲染文字），**不进 lines / cardLines**：卡宽、卡高、世代行距一律按未标记时的
  // 原值计算 ⇒ 图元尺寸（symbolSize）与树布局零影响（本仓红线）；占位/虚拟根同 keyMarkers 不标记。
  if (!artifact && props.focusHandle && node.handle === props.focusHandle) {
    card._cardText = `${card._cardText}\n${props.focusLabel}`;
    card.label = { color: pal.focusColor, rich: pal.cardRich };
  }
  if (node.children) card.children = node.children.map((c) => decorateTree(c));
  return card;
}

/**
 * 树数据最大深度（根=1）。用于 initialTreeDepth —— 首次渲染即整树全展开，
 * 深层节点不再默认折叠（想看第 N 世直接靠 roam 缩放定位，而非逐层点击展开）。
 */
function treeMaxDepth(node: TreePersonNode): number {
  let d = 1;
  if (node.children && node.children.length) {
    for (const c of node.children) d = Math.max(d, 1 + treeMaxDepth(c));
  }
  return d;
}

/**
 * 当前漫游平移量（屏幕像素）。ECharts 未公开该状态，走内部 API 读取；
 * 每个调用点都做防御（失败返回 null → 调用方跳过限制）。
 */
function roamOffset(): { x: number; y: number } | null {
  const inst = chart as any;
  if (!inst) return null;
  const t = inst
    .getViewOfSeriesModel?.(inst.getModel?.().getSeriesByIndex(0))
    ?.group?.getComputedTransform?.();
  return t ? { x: t[4], y: t[5] } : null;
}

/**
 * 把滚轮平移量限制在内容边界内（长树滑到底/顶后不要再滑出去变成整屏空白）；
 * 返回本次实际可用的位移。仅对撑开尺寸的纵向/横向长树生效。
 */
function clampPan(dx: number, dy: number): { dx: number; dy: number } {
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!chart || !el) return { dx, dy };
  const o: any = (chart.getOption() as any).series?.[0];
  const off = roamOffset();
  if (!o || !off) return { dx, dy };
  const SLACK = 120; // 允许越过末尾一点，避免最后一张卡贴边
  if (o.orient === 'TB' || o.orient === 'BT') {
    const limit = Math.max(0, (o.height || 0) - el.clientHeight) + SLACK;
    return { dx, dy: Math.max(-limit - off.y, Math.min(-off.y, dy)) };
  }
  const limit = Math.max(0, (o.width || 0) - el.clientWidth) + SLACK;
  return { dx: Math.max(-limit - off.x, Math.min(-off.x, dx)), dy };
}

/** 视野复位：把漫游平移量归零（否则长树平移后回不到树顶） */
function resetViewport() {
  const off = roamOffset();
  if (!chart || !off) return;
  chart.dispatchAction({ type: 'treeRoam', seriesIndex: 0, dx: -off.x, dy: -off.y });
}

/* ---- 「我」的节点（focusHandle）：首屏只居中一次 ---- */

/** 树图数据里 focusHandle 命中的下标（虚拟根 / 未画进图里的节点 ⇒ -1） */
function focusDataIndex(): number {
  const inst = chart as any;
  const data = inst?.getModel?.()?.getSeriesByIndex?.(0)?.getData?.();
  if (!data || !props.focusHandle) return -1;
  const count = typeof data.count === 'function' ? data.count() : 0;
  for (let i = 0; i < count; i++) {
    if (data.getRawDataItem?.(i)?.handle === props.focusHandle) return i;
  }
  return -1;
}

/**
 * 数据下标 `idx` 的节点当前的画布像素位置（供 treeRoam 求平移量 / 卡面 chip 命中判据）。口径 = 节点布局点
 * （series 数据 layout）经 view 坐标系变换（`coordinateSystem.dataToPoint`，已含当前漫游/缩放）+ 正交
 * 布局下 _mainGroup 的组偏移 `layoutInfo`（ECharts TreeView.render：`group.x = layoutInfo.x /
 * group.y = layoutInfo.y` —— 该偏移不在 coordinateSystem 内）。**不读图元自身位置**：首屏入场动画
 * 期间图元仍在移动，读数会偏。`idx < 0` 或取不到（未传 handle / 节点不在本图）→ null。
 */
function nodePixelOfIndex(idx: number): { x: number; y: number } | null {
  if (idx < 0) return null;
  const model = (chart as any)?.getModel?.()?.getSeriesByIndex?.(0);
  const layout = model?.getData?.()?.getItemLayout?.(idx);
  if (!layout || !isFinite(layout.x) || !isFinite(layout.y)) return null;
  const cs = model?.coordinateSystem;
  const p = cs?.dataToPoint ? cs.dataToPoint([layout.x, layout.y]) : [layout.x, layout.y];
  if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
  const box = model?.layoutInfo || { x: 0, y: 0 };
  return { x: p[0] + (box.x || 0), y: p[1] + (box.y || 0) };
}

/** 「我」节点当前的画布像素位置（= `nodePixelOfIndex(focusDataIndex())`，口径同上） */
function focusNodePixel(): { x: number; y: number } | null {
  return nodePixelOfIndex(focusDataIndex());
}

/** 首屏居中是否已执行（**只做一次**：用户后续拖动/缩放不再被夺回；zoomReset 既有语义不变） */
let focusCentered = false;
/** 首屏居中补间的 rAF 句柄（非 null = 补间进行中；仅 H5 赋值） */
let centerTween: number | null = null;
/** 被打断后的静默期截止时间戳：2s 内不再发生任何自动位移（防「拽回」） */
let centerQuietUntil = 0;
/** 首屏居中补间总时长（ms） */
const CENTER_TWEEN_MS = 420;

/** 缓动：ease-out cubic（末段减速） */
function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/**
 * 打断首屏居中补间（用户滚轮 / 拖动 / 点缩放按钮时调用）。
 * 选择**停在中途**（不补到终点）：用户已经接管视野，硬落到终点等于把视野「拽回去」，
 * 违反 §12-3「不夺回拖动」。随后 2s 内不再有任何自动位移。
 */
function cancelCenterTween(): void {
  if (centerTween === null) return;
  // #ifdef H5
  cancelAnimationFrame(centerTween);
  // #endif
  centerTween = null;
  centerQuietUntil = Date.now() + 2000;
}

// #ifdef H5
/**
 * 首屏居中补间（420ms / ease-out cubic）：逐帧 `treeRoam` 增量位移。
 * 每帧按「目标 - 当前」重算剩余量（实测读数经 `coordinateSystem.dataToPoint`，不累加固定步长 ⇒ 无误差堆积），
 * 只动画面整体变换，不碰节点尺寸 / 卡宽卡高 / 行距 / 树布局。
 */
function startCenterTween(targetX: number, targetY: number): void {
  if (!chart) return;
  let startTs = 0;
  let prevEased = 0;
  const frame = (ts: number) => {
    if (!chart) {
      centerTween = null;
      return;
    }
    if (!startTs) startTs = ts;
    const raw = Math.min(1, (ts - startTs) / CENTER_TWEEN_MS);
    const eased = easeOutCubic(raw);
    const cur = focusNodePixel();
    if (!cur) {
      centerTween = null;
      return;
    }
    const remainX = targetX - cur.x;
    const remainY = targetY - cur.y;
    // 本帧应走的「剩余比例」：treeRoam 吃的是增量，不能直接写真值
    const k = raw >= 1 ? 1 : (eased - prevEased) / (1 - prevEased);
    chart.dispatchAction({ type: 'treeRoam', seriesIndex: 0, dx: remainX * k, dy: remainY * k });
    prevEased = eased;
    if (raw >= 1) {
      // 末帧补齐余量（浮点 / 亚像素取整误差）
      const fin = focusNodePixel();
      if (fin && chart) {
        chart.dispatchAction({
          type: 'treeRoam',
          seriesIndex: 0,
          dx: targetX - fin.x,
          dy: targetY - fin.y,
        });
      }
      centerTween = null;
      return;
    }
    centerTween = requestAnimationFrame(frame);
  };
  centerTween = requestAnimationFrame(frame);
}
// #endif

/**
 * 把「我」的节点移到树图容器中心（**仅首屏一次**）。走与滚轮/拖动同一机制
 * （treeRoam 的 dx/dy 是屏幕像素位移，只动「画面整体变换」）⇒ 不触碰节点尺寸与树布局，
 * 且位移会同步回 series 的 center/zoom，后续 setOption 不会把它拽回初始视图。
 *
 * 补间（420ms ease-out cubic）可被用户操作打断：滚轮 / 拖动 / 缩放按钮 ⇒ `cancelCenterTween`
 * （停在中途 + 2s 静默）。`prefers-reduced-motion: reduce` ⇒ 瞬时居中（仅 H5；小程序侧一贯瞬时）。
 */
function centerOnFocusOnce() {
  if (focusCentered || !props.focusHandle || !chart) return;
  if (Date.now() < centerQuietUntil) return;
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  const p = focusNodePixel();
  if (!el || !p) return;
  focusCentered = true;
  const targetX = el.clientWidth / 2;
  const targetY = el.clientHeight / 2;
  const dx = targetX - p.x;
  const dy = targetY - p.y;
  if (!dx && !dy) return;
  // #ifdef H5
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    startCenterTween(targetX, targetY);
    return;
  }
  // #endif
  chart.dispatchAction({ type: 'treeRoam', seriesIndex: 0, dx, dy });
}

/* ---- 锚点迟到：只补卡面标记，不重算布局 ---- */

/** 上次 renderChart 喂给 ECharts 的装饰树（补标记时原地改它的卡面字段） */
let lastChartRoot: TreePersonNode | null = null;
/** 已经带上「★我」标记的 handle（空串 = 没有标记任何节点） */
let markedHandle = '';
/** 上次渲染时用的 keyMarkers 引用（内容相同 ⇒ 不重复整树重渲） */
let renderedMarkers: Record<string, { label: string; color?: string }> = {};

/** 在装饰树里按 handle 找节点（补标记用；找不到 ⇒ null = 该节点不在本图） */
function findDecoratedNode(node: TreePersonNode | null, handle: string): TreePersonNode | null {
  if (!node) return null;
  if (node.handle === handle) return node;
  for (const c of node.children || []) {
    const hit = findDecoratedNode(c, handle);
    if (hit) return hit;
  }
  return null;
}

/**
 * 锚点**迟到**（树已经画出来之后才拿到 focusHandle）的补标记路径。
 *
 * 走整树重渲（`scheduleRender`）会把入场动画重放一遍、并在动画中途跳视野（线上「先出树 → 闪一下 → 跳走」）。
 * 这里只改该节点在 series 数据里的**卡面文本 + 高亮色**，然后抑制本次更新动画的 setOption：
 * 卡宽 / 卡高 / 行距 / 树布局按未标记时的值算好（见 decorateTree：标记不进 cardLines）⇒ 图元尺寸与
 * `getItemLayout` 序列逐值不变（§12-3「居中不改变图元尺寸/布局」）。
 * 返回 true = 已补（或本来就已标记）；false = 走不了补标记路径（宿主按整树重渲兜底）。
 */
function patchFocusMarker(): boolean {
  if (!chart || !lastChartRoot) return false;
  const handle = props.focusHandle;
  if (!handle) return false;
  if (markedHandle === handle) return true;
  // 换锚点（锚点本身变了）：交给整树重渲（既有路径，一次性）
  if (markedHandle) return false;
  const node = findDecoratedNode(lastChartRoot, handle);
  if (!node) return false;
  node._cardText = `${node._cardText ?? ''}\n${props.focusLabel}`;
  node.label = { color: palette.value.focusColor, rich: palette.value.cardRich };
  markedHandle = handle;
  // 只更新 series 数据（卡面文本/颜色）：本次更新动画置 0 ⇒ 不重放入场动画，再恢复默认更新时长
  chart.setOption({ series: [{ data: [lastChartRoot], animationDurationUpdate: 0 }] });
  chart.setOption({ series: [{ animationDurationUpdate: 750 }] });
  return true;
}

/**
 * 夜间模式（补丁 §canvas 配色）：CSS 面由 `<html data-theme>` 自动翻转，但树图的节点卡底/字/边框、
 * 连线、tooltip、hover 边框全在 ECharts option / series data 里（canvas 读不到 CSS 变量）⇒
 * **主题一变就地重建 option**（`renderChart`：decorateTree 用新色板 → setOption），不整页刷新。
 * 几何红线：色板只含颜色，卡宽/卡高/行距/symbolSize/盒子尺寸/布局参数两态同值 ⇒ 节点数与坐标逐值不变。
 * 首屏/无图时直接返回（下一次 renderChart 自然用新色板）。
 */
watch(themeRef, () => {
  if (!chart || !visibleForest.value.length) return;
  suppressThemeAnim = true;
  renderChart();
});

// 宿主按数据现算 keyMarkers（带色称号；契约 docs/person-badge.spec.md §4-1），可能在组件**首次渲染之后**
// 才到（宿主异步取数）⇒ 变化时补渲一次（同下方 focusHandle 的「迟到补渲」理由；只重算 series 数据，
// 不触碰图元尺寸/布局红线）。清空（换树 reload）由 loadData 的正常重载路径覆盖。
// **内容相同就不重渲**：宿主派生的 keyMarkers 恒为新对象，绝大多数树（无 `称号`）空集到空集，
// 照旧重渲等于在首屏居中前后多一次整树重绘（入场动画重放）。
watch(
  () => props.keyMarkers,
  (val) => {
    if (sameMarkers(renderedMarkers, val)) return;
    scheduleRender();
  },
);

/** 两组称号标注是否等价（逐节点 label/color 比对；只用于「要不要重渲」，不影响渲染内容） */
function sameMarkers(
  a: Record<string, { label: string; color?: string }> | undefined,
  b: Record<string, { label: string; color?: string }> | undefined,
): boolean {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = (a as any)[k] || {};
    const y = (b as any)?.[k];
    if (!y || x.label !== y.label || (x.color || '') !== (y.color || '')) return false;
  }
  return true;
}

// 宿主按数据现算 nodeAnnotations（祖谱：四类卡片角标 + 下游登记镜像的次级入口）同样可能迟到 ⇒
// 变化时补绑右键拦截 + 补渲一次（角标走卡面次级行，卡宽/卡高/行距按新行数重算，仍在既有机制内）。
// 缺省空对象（家族树 / 世本 / 总谱）⇒ 本 watch 触发一次与既有等价的渲染，行为逐字不变。
watch(
  () => props.nodeAnnotations,
  () => {
    const el = document.getElementById('tree-chart') as HTMLDivElement | null;
    if (el) bindNativeContextMenuBlock(el);
    scheduleRender();
  },
);

// 宿主可能在本组件渲染之后才拿到锚点（fetchMyAnchor 异步）。
// 卡面「★我」标记与高亮色是在 renderChart → decorateTree 时按**当时的** props.focusHandle
// 烘进 series 数据的 ⇒ 只在 watch 里 centerOnFocusOnce()（只改画布平移、不重算 series）
// 会让标记永远缺失（线上就是这条，见 permission-tier.spec.md §12-3）。
// 反向时序（handle 先到、数据后到）由 renderChart 末尾那次 centerOnFocusOnce 覆盖。
//
// 迟到路径**不再整树重渲**（重渲会重放入场动画 + 在动画中跳视野 = 「先出树 → 闪一下 → 跳走」）：
// 只经 `patchFocusMarker()` 补该节点的卡面文本/颜色（尺寸与布局逐值不变），再居中。
// 宿主侧已把锚点请求提到最前面（tree-hall 的 loadAll），正常时序下这里是「无图表 / 无根」直接返回。
watch(
  () => props.focusHandle,
  (val) => {
    if (!val) return;
    // 目标变了 ⇒ 允许居中一次（focusCentered 是「只居一次」的一次性闸门；此处重置仅针对
    // 「锚点本身变化」或「树还没画出来就拿到锚点」，用户拖动/缩放不经过这里）
    focusCentered = false;
    if (!chart || !lastChartRoot) return;
    if (!patchFocusMarker()) {
      // 补不上（目标节点不在本图 / 换锚点）⇒ 走既有整树重渲兜底
      scheduleRender();
      return;
    }
    centerOnFocusOnce();
  },
);

/** 滚轮提示文案（随布局变化：纵向上下 / 横向左右） */
const panHint = computed(() => {
  if (currentLayout.value === 'vertical') return '滚轮上下滑动视野';
  if (currentLayout.value === 'horizontal') return '滚轮左右滑动视野';
  return '滚轮平移视野';
});

/** 缩放已锁死（roam:'move'）→ 滚轮改为平移视野：纵向模式上下滑、横向模式左右滑 */
function onWheel(e: WheelEvent) {
  if (!chart) return;
  // 用户开始接管视野 ⇒ 立刻停掉首屏居中补间（停在中途 + 2s 静默，不夺回拖动）
  cancelCenterTween();
  // 触控板横向滑动（deltaX）优先；鼠标滚轮只有 deltaY
  const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!raw) return;
  e.preventDefault();
  // deltaMode===1 是「行」单位（Firefox），换算成像素；并限制单次步长
  const step = Math.max(-180, Math.min(180, e.deltaMode === 1 ? raw * 16 : raw));
  // treeRoam 的 dx/dy 是屏幕像素位移（正 = 内容右/下移）；滚轮下滑 = 看更下方内容 = 内容上移
  const layout = currentLayout.value;
  const dx0 = layout === 'horizontal' ? -step : layout === 'vertical' ? 0 : -(e.deltaX || 0);
  const dy0 = layout === 'vertical' ? -step : layout === 'horizontal' ? 0 : -(e.deltaY || 0);
  const { dx, dy } = clampPan(dx0, dy0);
  if (!dx && !dy) return; // 已到内容边界
  chart.dispatchAction({ type: 'treeRoam', seriesIndex: 0, dx, dy });
}

// 滚轮监听绑定的元素（只绑一次；卸载时解绑）
let wheelEl: HTMLElement | null = null;

/** 用户按下指针（拖动视野）/ 触摸开始 ⇒ 停掉首屏居中补间（拖拽由 ECharts roam 自己处理，这里只做打断） */
function onPanStart() {
  cancelCenterTween();
}

/** 绑定滚轮平移（passive:false —— 需 preventDefault 阻止页面跟着滚） */
function bindWheel(el: HTMLElement) {
  if (wheelEl === el) return;
  if (wheelEl) {
    wheelEl.removeEventListener('wheel', onWheel);
    wheelEl.removeEventListener('pointerdown', onPanStart);
    wheelEl.removeEventListener('touchstart', onPanStart);
  }
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onPanStart);
  el.addEventListener('touchstart', onPanStart, { passive: true });
  wheelEl = el;
}

/** 解绑滚轮平移 */
function unbindWheel() {
  if (wheelEl) {
    wheelEl.removeEventListener('wheel', onWheel);
    wheelEl.removeEventListener('pointerdown', onPanStart);
    wheelEl.removeEventListener('touchstart', onPanStart);
    wheelEl = null;
  }
}

function renderChart() {
  const el = document.getElementById('tree-chart') as HTMLDivElement | null;
  if (!el) return;
  /** 本次渲染的色板快照（与 decorateTree 同一份；切主题时 palette 先更新再走到这里） */
  const layoutPalette = palette.value;
  // 重渲/切布局会重建图元：先把可能还在跑的首屏居中补间停掉（避免对旧坐标系继续发位移）
  cancelCenterTween();
  // 祖谱图（宿主传节点注记）拦截浏览器右键菜单：右键改为弹节点次级入口菜单
  bindNativeContextMenuBlock(el);

  if (!chart) {
    chart = echarts.init(el);
    bindWheel(el);
    // 右键 / 长按 → 带次级入口的注记节点弹菜单（其它节点 / 其它宿主无菜单，行为不变）
    chart.on('contextmenu', onChartContextMenu);
    chart.on('click', (params: any) => {
      const d = params?.data as TreePersonNode | undefined;
      if (!d) return;
      // 祖谱图谱：命中下游支系登记镜像**卡面可见入口 chip**（📂 打开〈树名〉）⇒ 打开该支系家族树首页，
      // 且**不再下沉**到主点击行为（等价 stopPropagation）。chip 渲染期即画在卡面上 ⇒ **不依赖右键 /
      // 长按**即可点到（iOS Safari H5 可点；右键/长按菜单作为同入口的第二条路径保留）。
      const chipTree = chipTreeIdOfNode(d, params);
      if (chipTree) {
        params?.event?.event?.stopPropagation?.();
        openTreeHome(chipTree);
        return;
      }
      // 虚拟根（无 gramps_id）：多支始祖入口 —— 展开支始祖列表
      if (!d.gramps_id) {
        openRootsList();
        return;
      }
      // 分迁占位节点：点击直接跳转新家族树（无自身数据可看）
      if (d.external_link_type === 'branch' && d.external_tree) {
        openTreeHome(d.external_tree);
        return;
      }
      // 普通人物节点：直接打开唯一档案弹窗（内联编辑 + 谱系管理，不再经过摘要弹窗）
      // 口径 A：镜像节点（external_mirror='true' + 真身树/真身 handle 齐备）→ 打开真身档案
      if (!d.handle) return;
      archiveModal.value?.open(props.treeId, d.handle, d);
    });
  }

  // 单根森林 → 以真实始祖为根（始祖本身是具体的人，可点击查看/编辑）；
  // 多根森林 → 包虚拟根「始祖」避免布局下根节点全部重叠，点击虚拟根展开支始祖列表
  const roots = visibleForest.value;
  const rawRoot: TreePersonNode =
    roots.length === 1
      ? roots[0]
      : {
          name: '始祖',
          handle: '__root__',
          gramps_id: '',
          gender: 'U',
          is_living: false,
          itemStyle: { color: layoutPalette.rootFill },
          children: roots,
        };

  // 方案B：把业务节点树克隆为「圆角矩形名卡」树（卡宽自适应姓名宽度）
  const chartRoot = decorateTree(rawRoot, roots.length !== 1);
  // 首屏展开层数（ECharts 口径，见 TreeSeries.js）：
  // - props.initialDepth <= 0（缺省值 / 普通家族树）→ 走「整树全展开」分支：initialTreeDepth 传 -1。
  //   依据 TreeSeries.js:90 `expandTreeDepth = expandAndCollapse && option.initialTreeDepth >= 0
  //   ? option.initialTreeDepth : treeDepth;` —— initialTreeDepth < 0 时 expandTreeDepth = 真实树深，
  //   第 94 行 `node.isExpand = node.depth <= expandTreeDepth` 对全部节点成立。
  //   不能传正数 treeDepth：TreeSeries.js:66-70 ECharts 会在 series.data 外再包一层虚拟根
  //   （root = {name: option.name, children: option.data}），你传的真实根深度为 1 → 少展开一层，
  //   最深一层的节点（如镜像节点）不建图形元素 → getItemGraphicEl() 为 null，不可见也不可点。
  // - props.initialDepth > 0（总谱 48+ 层等）→ 保持既有逐层展开语义（点开下一层）。
  const treeDepth = treeMaxDepth(chartRoot);
  const expandDepth = props.initialDepth > 0 ? Math.min(props.initialDepth, treeDepth) : -1;

  const labelFmt = (params: any) => {
    const d = params.data as TreePersonNode;
    return d._cardText ?? (d.name ? d.name.slice(0, 4) : '');
  };
  // hover 摘要：名卡上只放得下姓名（可能截断），这里补全「完整姓名 + 生卒 + 身份标签」。
  // 重要：uni-app H5 注入全局 wx → ECharts 判定 wxa 环境，tooltip 只能走 richText 渲染模式
  // （renderMode:'html' 下 TooltipHTMLContent 构造直接返回 null 会崩）。richText 不解析 HTML，
  // 因此 formatter 必须返回纯文本，用 '\n' 换行，由 tooltip 背景/边框配置呈现卡片观感。
  // 信息策略：只呈现可靠事实。guest 视角列表常缺生卒字段（is_living 由「无死亡记录」推断，
  // 会把无考远祖误判为在世），故不在 hover 里显示「在世」状态；性别/跨树标记/可考生卒才展示。
  const tooltipFmt = (params: any) => {
    const d = params.data as TreePersonNode;
    if (!d) return '';
    // 虚拟根「始祖」：多支汇总入口，引导点击展开
    if (!d.gramps_id) return `${d.name}\n点击查看各支始祖`;
    const name = d.name || '';
    // 身份标签：性别 / 关键节点（世本源流链锚点）/ 分迁链接 / 出嫁联姻（确定性信息，不含易误判的在世推断）
    const tags: string[] = [];
    if (d.gender === 'M') tags.push('♂');
    else if (d.gender === 'F') tags.push('♀');
    const km = keyMarkerOf(d);
    if (km) tags.push(km.label);
    if (d.external_link_type === 'branch') tags.push('分迁 → 他族');
    else if (d.external_link_type === 'marriage') tags.push('出嫁联姻');
    // 生卒摘要：有一方数据才显示，避免空行
    const life = d.birth_date || d.death_date
      ? `${d.birth_date || '?'} — ${d.death_date || '?'}`
      : '';
    const spouseLine =
      d.spouseNames && d.spouseNames.length
        ? `配偶：${d.spouseNames.join('、')}`
        : '';
    const lines = [
      `${name}${tags.length ? `（${tags.join(' · ')}）` : ''}`,
      `编号 ${personIdDisplay(d.gramps_id) || ''}`,
    ];
    if (spouseLine) lines.push(spouseLine);
    if (life) lines.push(life);
    return lines.join('\n');
  };

  const base = {
    tooltip: {
      trigger: 'item' as const,
      triggerOn: 'mousemove' as const,
      formatter: tooltipFmt,
      // richText 模式同样吃这些视觉配置：卡面底 + 主色边 + 主字，呼应名卡配色（两态取 layoutPalette）
      backgroundColor: layoutPalette.tooltipBg,
      borderColor: layoutPalette.tooltipBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: layoutPalette.tooltipTextColor, fontSize: 13 },
    },
  };

  const orient =
    currentLayout.value === 'horizontal' ? 'LR' : 'TB';

  chart.setOption({
    ...base,
    series: [
      {
        type: 'tree',
        data: [chartRoot],
        // 纵向/横向 = 正交布局
        layout: 'orthogonal',
        orient,
        // 整树展开：按卡高铺开世代行距（否则 ECharts 会把 48 层压进容器 → 卡片叠死）。
        // 盒子尺寸必须用真实树深 treeDepth（不能用 expandDepth：整树全展开时它是 -1，会算错高度）
        ...layerBox(stretchAxis(), treeDepth),
        symbol: 'rect',
        // -1 = 整树全展开（props.initialDepth<=0）；正数 = 首屏展开到第 N 层（逐层点开）
        initialTreeDepth: expandDepth,
        // 整树全展开模式（props.initialDepth<=0）下禁用点击折叠：ECharts TreeView.js:169 只在
        // expandAndCollapse === true 时给卡片绑 treeExpandAndCollapse 点击 → 否则「点卡片」会同时
        // 开档案 + 折叠该节点子树（后代静默消失）。关掉后 TreeSeries.js:90 的
        // `expandTreeDepth = expandAndCollapse && initialTreeDepth >= 0 ? … : treeDepth`
        // 取内部真实树深 → 整树依然全展开，只是不再绑点击折叠。
        // 逐层展开模式（props.initialDepth>0）保持 true，保留点开/折叠能力。
        expandAndCollapse: props.initialDepth > 0,
        // roam:'move' = 只允许平移（缩放锁死，走 ＋/－ 按钮；滚轮改为平移视野）
        roam: 'move',
        zoom: zoomLevel.value,
        // 主题切换触发的那次重建：同坐标系里只换颜色 ⇒ 不重播补间（suppressThemeAnim 用完即复位）
        animationDuration: suppressThemeAnim ? 0 : 550,
        animationDurationUpdate: suppressThemeAnim ? 0 : 750,
        lineStyle: { color: layoutPalette.lineColor, width: 1.2, curveness: 0.5 },
        label: {
          position: 'inside',
          rotate: 0,
          fontSize: CARD_FONT,
          color: layoutPalette.nameColor,
          rich: layoutPalette.cardRich,
          formatter: labelFmt,
        },
        emphasis: {
          focus: 'descendant',
          itemStyle: { borderColor: layoutPalette.emphasisBorder, borderWidth: 2 },
        },
      },
    ],
  });
  suppressThemeAnim = false;

  lastChartRoot = chartRoot;
  // decorateTree 已按当前 props.focusHandle 烘入标记（节点不在本图 ⇒ 不记）
  markedHandle = props.focusHandle && findDecoratedNode(chartRoot, props.focusHandle) ? props.focusHandle : '';
  renderedMarkers = props.keyMarkers || {};

  // 首屏把视野中心移到「我」的节点（内部只执行一次：用户后续拖动/缩放不被夺回）
  centerOnFocusOnce();
}

/** 切换图示布局；迁徙地图为跳转专页 */
function switchLayout(id: string) {
  if (id === 'migration') {
    uni.navigateTo({ url: `/pages/special/migration-map/index?tree_id=${props.treeId}` });
    return;
  }
  if (currentLayout.value === id) return;
  currentLayout.value = id;
  renderChart();
}

/** 放大 */
function zoomIn() {
  // 用户点缩放 = 接管视野 ⇒ 停掉首屏居中补间（不夺回）
  cancelCenterTween();
  zoomLevel.value = Math.min(zoomLevel.value * 1.25, 4);
  applyZoom();
}

/** 缩小 */
function zoomOut() {
  cancelCenterTween();
  zoomLevel.value = Math.max(zoomLevel.value / 1.25, 0.2);
  applyZoom();
}

/** 重置缩放 + 视野复位（回到 100% 且回到树顶） */
function zoomReset() {
  cancelCenterTween();
  zoomLevel.value = 1;
  applyZoom(true);
  // setOption 生效后再把漫游平移量归零（否则只复位缩放，平移仍停在原处）
  setTimeout(resetViewport, 80);
}

/** 将缩放应用到图表 */
function applyZoom(resetCenter = false) {
  if (!chart) return;
  chart.setOption({
    series: [
      {
        zoom: zoomLevel.value,
        ...(resetCenter ? { center: null } : {}),
      },
    ],
  });
}
</script>

<style scoped>
.stats { text-align: center; margin: 16px 0; padding: 10px; background: #FFF8E1; border-radius: 8px; }
.stat { font-size: 14px; color: #5D4037; margin: 0 12px; display: inline-block; }
.stat-hint { font-size: 12px; color: #A1887F; }
.loading, .error, .empty { text-align: center; padding: 40px; color: #999; }
.error { color: #C62828; }
.chart-wrap { margin-top: 8px; }
.chart { width: 100%; height: 68vh; min-height: 420px; }
.hint { display: block; text-align: center; font-size: 12px; color: #999; margin-top: 8px; }

/* 图示切换按钮（右侧悬浮：纵向/横向 + 迁徙地图） */
.layout-switcher {
  position: fixed;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 900;
}
.layout-btn {
  width: 52px;
  padding: 8px 4px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.layout-btn.active {
  background: #8B4513;
  border-color: #8B4513;
}
.layout-icon { font-size: 16px; }
.layout-name { font-size: 10px; color: #8B4513; margin-top: 2px; }
.layout-btn.active .layout-name { color: #fff; }

/* 缩放控制（左下角悬浮） */
.zoom-controls {
  position: fixed;
  left: 12px;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 900;
}
.zoom-btn {
  width: 40px;
  height: 40px;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.zoom-icon { font-size: 18px; color: #8B4513; font-weight: bold; }

/* 模态框 */
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 82%; max-width: 360px; background: #fff; border-radius: 14px;
  padding: 24px 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}
.modal-name { font-size: 20px; font-weight: bold; color: #3E2723; display: block; text-align: center; }
.modal-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.btn-close { text-align: center; color: #999; font-size: 14px; padding: 4px 0; }

/* 祖谱图谱节点菜单（右键 / 长按支系登记镜像）：透明遮罩吃外部点击，菜单本体贴鼠标点定位 */
.node-menu-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 995; }
.node-menu {
  position: fixed; min-width: 200px; max-width: 260px;
  background: #FFFDF7; border: 1px solid #E0D5C8; border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.18); padding: 10px 12px;
}
.node-menu-note { font-size: 11px; color: #A1887F; display: block; line-height: 1.5; margin-bottom: 8px; }
.node-menu-item { font-size: 14px; color: #3E2723; display: block; padding: 8px 0; }
.node-menu-cancel { font-size: 13px; color: #999; display: block; padding: 6px 0 2px; text-align: center; }

/* 始祖列表 */
.promote-sub { font-size: 12px; color: #666; line-height: 1.7; display: block; margin: 8px 0 14px; }
.attach-results { max-height: 32vh; overflow-y: auto; margin-top: 8px; }
.attach-item {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border: 1px solid #F0E8DE; border-radius: 8px;
  margin-bottom: 8px;
}
.attach-item.selected { border-color: #8B4513; background: #FBF6EF; }
.attach-name { font-size: 14px; color: #3E2723; font-weight: 500; }
.attach-id { font-size: 11px; color: #999; margin-left: auto; }

/* 添加父/子节点弹窗 */
.mode-switch {
  display: flex; gap: 8px; margin-bottom: 4px;
}
.mode-btn {
  flex: 1; text-align: center; padding: 8px 0;
  border: 1px solid #E0D5C8; border-radius: 8px;
  font-size: 13px; color: #666;
}
.mode-btn.active {
  background: #8B4513; border-color: #8B4513; color: #fff;
}
.gender-row { margin-top: 10px; }
</style>
