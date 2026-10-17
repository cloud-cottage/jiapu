<template>
  <view v-if="hasAnyPermission" class="manage-panel">
    <view class="mp-head">
      <text class="mp-title">谱系管理</text>
      <text class="mp-sub">仅影响家族树结构，请谨慎操作</text>
    </view>

    <!-- 操作按钮（按角色/节点上下文显示） -->
    <view class="mp-actions">
      <!-- 中华世本总谱：源流链续编（新建节点 / 挂接已有节点） -->
      <template v-if="isMasterChain">
        <!-- 口径 ②（Kevin 2026-10-15）：本节点已作为某祖谱的始祖 → 世本内一律不得添加子嗣，
             子嗣类入口就地换成引导文案（文案与后端 lib/child-write.js 的 clanFounderChildBlockMessage 同字面） -->
        <text v-if="childAddBlocked" class="mp-hint">{{ childBlockMessage }}</text>
        <template v-else-if="canAppendChain">
          <t-button
            size="small"
            variant="outline"
            theme="primary"
            @click="openAddNode('child', 'new')"
          >＋ 续编第 {{ nextGen }} 世</t-button>
          <t-button
            size="small"
            variant="outline"
            theme="primary"
            @click="openAddNode('child', 'pick')"
          >＋ 挂接已有节点为第 {{ nextGen }} 世</t-button>
          <!-- 批量添加子孙：一次按「一条线单传」依次续编最多 10 代（姓随父姓，不可改姓） -->
          <t-button
            size="small"
            variant="outline"
            theme="primary"
            @click="openAddNode('child', 'batch')"
          >＋ 批量添加子孙</t-button>
        </template>
        <text v-else class="mp-hint">{{ chainBlockedHint }}</text>
      </template>

      <!-- 普通家族树：加父/加子/加配偶 + 拆分（始祖挂载「认祖」见 docs/founder-attach.spec.md §6） -->
      <template v-else>
        <t-button
          v-if="canAddNode"
          size="small"
          variant="outline"
          theme="primary"
          @click="openAddNode('parent', 'new')"
        >＋ 添加父节点</t-button>
        <!-- 口径 ② 的子嗣类闸门对本档案树（= 中华世本）生效；本分支下恒不触发（同口径守卫，防回归） -->
        <t-button
          v-if="canAddNode && !childAddBlocked"
          size="small"
          variant="outline"
          theme="primary"
          @click="openAddNode('child', 'new')"
        >＋ 添加子节点</t-button>
        <t-button
          v-if="canSplit"
          size="small"
          variant="outline"
          theme="danger"
          :loading="splitting"
          @click="confirmSplit"
        >{{ splitting ? '处理中...' : '⛔ 移除并新建家族树' }}</t-button>
        <!-- 立支（docs/branch-clan-ops.spec.md §6-1 / §9-1）：本树普通节点 N → 新家族树始祖（一次 BRANCH_FEE_SEEDS 石榴籽，量词单点见 asset-text.ts 的 SEED_QTY_UNIT）
             显示条件 = canEstablishBranch（写权 + 树 kind='family' + 非始祖位 + 非镜像节点）；L1/L2/L3 文案 = §9-2 定稿 -->
        <t-button
          v-if="canEstablishBranch"
          size="small"
          variant="outline"
          theme="warning"
          :loading="establishing"
          @click="confirmEstablishBranch"
        >{{ establishing ? '处理中...' : '🌱 立支（新家族树）' }}</t-button>
        <!-- 祖谱（clan）：批量添加子孙——自有段节点可用（世系链镜像节点不可作父节点，故不显示） -->
        <t-button
          v-if="canAppendClanBatch && !childAddBlocked"
          size="small"
          variant="outline"
          theme="primary"
          @click="openAddNode('child', 'batch')"
        >＋ 批量添加子孙</t-button>
        <text v-else-if="clanBatchBlockedHint" class="mp-hint">{{ clanBatchBlockedHint }}</text>
      </template>

      <!-- 口径 ①（Kevin 2026-10-15）：由认祖镜像（external_link_type='founder'）开入本真身档案时，
           子嗣建在镜像所在的本树内 —— 入口仅在宿主带下本树坐标（localTreeId）时出现；
           提交一律带本树 tree_id / handle，真身树零写入。 -->
      <t-button
        v-if="canAddChildLocal"
        size="small"
        variant="outline"
        theme="primary"
        @click="openAddNode('child', 'new', true)"
      >＋ 在《{{ localTreeTitle }}》内添加子节点</t-button>

      <!-- 加配偶（总谱/普通树通用）：同树配偶；已有家族补空位，已满则新建家族（非子嗣操作，不受口径 ② 拦截） -->
      <t-button
        v-if="canAddNode"
        size="small"
        variant="outline"
        theme="success"
        @click="openAddNode('spouse', 'new')"
      >＋ 添加配偶</t-button>
    </view>
    <!-- 计费口径提示（docs/economy-fee.spec.md §7 / §3-1 #9–#18）：新增类一律 0 片，避免用户因删改计费而不敢新增 -->
    <text v-if="canAddNode || canAddChildLocal" class="mp-hint">新增类操作（加父 / 加子 / 加配偶 / 挂接已有节点 / 续编 / 批量添加子孙）不消耗竹片</text>
    <text v-if="panelError" class="mp-error">{{ panelError }}</text>

    <!-- 加父/加子/续编/加配偶 内联面板 -->
    <view v-if="showAddNode" class="mp-panel">
      <view class="mp-panel-head">
        <text class="mp-panel-title">{{ panelTitle }}</text>
        <text class="mp-panel-close" @click="closeAddNode">✕</text>
      </view>
      <view class="mp-sub">{{ panelHint }}</view>

      <!-- 新建 / 挂接切换：批量档不渲染（批量内容绝不会走单节点表单提交路径） -->
      <view v-if="addPickMode !== 'batch'" class="mode-switch">
        <view
          class="mode-btn"
          :class="{ active: addPickMode === 'new' }"
          @click="switchAddPickTab('new')"
        >新建节点</view>
        <view
          class="mode-btn"
          :class="{ active: addPickMode === 'pick' && addPickTab !== 'ref' }"
          @click="switchAddPickTab('pick')"
        >{{ (isMasterChain && !addLocalTree) || addMode === 'spouse' ? '挂接已有节点' : '从树中选择' }}</view>
        <!-- 第三档「指定 ID」（F-1）：填全局编号 / handle → 解析出既有节点 → 按「挂接已有节点」提交（只挂接、不新建） -->
        <view
          class="mode-btn"
          :class="{ active: addPickTab === 'ref' }"
          @click="switchToRef"
        >指定 ID</view>
      </view>

      <!-- 「承母嗣」特例：只在「加子女 + 本人为女性（以母亲为家长）」形态显示；
           世本 / 祖谱不显示（后端守卫也不套用这两层）。勾选后请求带 maternal_succession: true -->
      <view v-if="showMaternalSuccession" class="ms-row" @click="addMaternalSuccession = !addMaternalSuccession">
        <view class="ms-box" :class="{ 'ms-box-on': addMaternalSuccession }">
          <text v-if="addMaternalSuccession" class="ms-tick">✓</text>
        </view>
        <text class="ms-label">承母嗣（本族已婚女性后代）</text>
      </view>
      <view v-if="showMaternalSuccession" class="ms-hint">
        <text class="sh-text">本族女性一旦婚配，其后代默认不入本树；勾选「承母嗣」才会挂在本树女性名下（已婚配女性添子女未勾选会被服务端拒绝）。未婚配女性添子女无需勾选。</text>
      </view>

      <template v-if="addPickMode === 'new'">
        <!-- 姓 + 名：姓默认随父姓（锁定），「改姓」才解锁为特例 -->
        <view class="name-row">
          <t-input
            :value="addSurname"
            :disabled="surnameLocked"
            placeholder="姓"
            class="search-input surname-input"
            @update:value="(v: any) => addSurname = v"
          />
          <t-input
            :value="addName"
            placeholder="名"
            class="search-input"
            @update:value="(v: any) => addName = v"
          />
        </view>
        <view class="surname-hint">
          <text class="sh-text">{{ surnameHintText }}</text>
          <text v-if="showSurnameToggle" class="sh-link" @click="surnameLocked = !surnameLocked">
            {{ surnameLocked ? '改姓' : '恢复随父姓' }}
          </text>
        </view>
        <view class="gender-row">
          <t-radio-group :value="addGender" placement="horizontal" @update:value="(v: any) => addGender = v">
            <t-radio value="M">男</t-radio>
            <t-radio value="F">女</t-radio>
            <t-radio value="U">未知</t-radio>
          </t-radio-group>
        </view>
        <!-- 称号（选填）：封号 → 谥号 → 号（顺序同人物名称显示） -->
        <view class="title-row">
          <t-input
            :value="addFeng"
            placeholder="封号（选填）"
            class="search-input"
            @update:value="(v: any) => addFeng = v"
          />
          <t-input
            :value="addShi"
            placeholder="谥号（选填）"
            class="search-input"
            @update:value="(v: any) => addShi = v"
          />
        </view>
        <view class="title-row">
          <t-input
            :value="addHao"
            placeholder="号（选填）"
            class="search-input"
            @update:value="(v: any) => addHao = v"
          />
        </view>
      </template>
      <!-- 「指定 ID」档（F-1~F-7）：填全局编号 / handle → 解析出**本树既有节点** → 写进既有 addSelected
           选中槽 → 提交完全复用「从树中选择」的挂接路径（本档只挂接、绝不新建节点） -->
      <template v-else-if="addPickTab === 'ref'">
        <view class="search-row" style="margin-top: 8px;">
          <t-input
            :value="addRefInput"
            :placeholder="PERSON_REF_PLACEHOLDER"
            class="search-input"
            @update:value="onRefInputChange"
            @enter="doResolveRef"
          />
          <t-button size="small" theme="primary" :loading="addRefResolving" @click="doResolveRef">解析</t-button>
        </view>
        <!-- ① 本树命中：确认行「已定位：」+ 姓名·编号（编号展示 = format.ts 单点 personIdDisplayOf：
             真身不带标注；镜像带「（镜像 · 源自 <来源树名>）」），提交按钮随之可用 -->
        <view v-if="addRefSelected" class="batch-preview">
          <text class="batch-preview-line">已定位：{{ addRefSelected.name }}·{{ personIdDisplayOf(addRefSelected, addRefSourceTitle) }}</text>
        </view>
        <!-- ①′ 同一编号命中多条（甲口径 A-5：同人 = 1 条真身 + N 条镜像，镜像与真身同号）：
             逐条标出真身 / 镜像 · 源自 <树名>，供用户看清后自选；择一默认按「真身 > 登记镜像 > 其它镜像」，
             点行只切换既有 addSelected 槽，提交路径与「从树中选择」档完全一致（一字未改）。 -->
        <view v-if="addRefHits.length > 1" class="attach-results">
          <view
            v-for="r in addRefHits"
            :key="r.handle"
            class="attach-item"
            :class="{ selected: addSelected?.handle === r.handle }"
            @click="selectRefHit(r)"
          >
            <text class="attach-name">{{ r.name }}</text>
            <text class="attach-id">{{ personIdDisplayOf(r, addRefSourceTitles[r.handle] || '') }}</text>
          </view>
        </view>
      </template>
      <template v-else-if="addPickMode === 'pick'">
        <view class="search-row" style="margin-top: 8px;">
          <t-input
            :value="addQuery"
            placeholder="输入姓名搜索"
            class="search-input"
            @update:value="(v: any) => addQuery = v"
            @enter="doSearchAddNode"
          />
          <t-button size="small" theme="primary" @click="doSearchAddNode">搜索</t-button>
        </view>
        <view v-if="addSearching" class="join-tip">搜索中...</view>
        <view v-else-if="addResults.length" class="attach-results">
          <view
            v-for="r in addResults"
            :key="r.handle"
            class="attach-item"
            :class="{ selected: addSelected?.handle === r.handle }"
            @click="addSelected = r"
          >
            <text class="attach-name">{{ r.name }}</text>
            <text class="attach-id">{{ personIdDisplay(r.gramps_id) }}</text>
          </view>
        </view>
        <view v-else-if="addSearched" class="join-tip">未找到匹配节点</view>
      </template>

      <!-- 批量添加子孙（总谱续编）：粘贴文本 → 实时解析预览 → 确认后按一条线依次续编 -->
      <template v-else>
        <view class="batch-tip">
          请输入一条线单传的后代（每代一人）：只填「名」，用「、」「，」或空格分隔，可带序号（如 1、2、3、）。不要填写分支（同辈多人）。
        </view>
        <!-- 姓：随父姓继承 + 锁定（批量录入不允许改姓，故无任何「改姓」开关/链接） -->
        <view class="name-row">
          <t-input
            :value="batchSurname"
            :disabled="true"
            placeholder="姓"
            class="search-input surname-input"
          />
        </view>
        <view class="surname-hint">
          <text class="sh-text">{{ batchSurnameHint }}</text>
        </view>
        <textarea
          v-model="batchText"
          class="batch-textarea"
          placeholder="例如：1、明远 2、承志 3、守拙（也可用「、」「，」或换行分隔）"
        />
        <view v-if="batchError" class="batch-error">{{ batchError }}</view>
        <view v-else-if="batchNames.length" class="batch-preview">
          <text class="batch-preview-line">{{ batchPreview }}</text>
        </view>
      </template>

      <view class="mp-panel-actions">
        <!-- 批量档独立的提交按钮：不复用单节点表单，避免把批量内容当单节点提交 -->
        <t-button
          v-if="addPickMode === 'batch'"
          theme="primary"
          block
          :loading="batchAdding"
          :disabled="!batchCanSubmit"
          @click="doBatchAdd"
        >确认添加</t-button>
        <t-button
          v-else
          theme="primary"
          block
          :loading="addingNode"
          :disabled="!addCanSubmit"
          @click="doAddNode"
        >确认添加</t-button>
        <t-button variant="outline" block @click="closeAddNode">取消</t-button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  splitTree,
  searchPeople,
  searchPeopleGlobal,
  addParentNode,
  addChildNode,
  appendChainNode,
  appendChainBatch,
  addSpouseNode,
  postEstablishBranch,
  fetchAssetsSummary,
  fetchTreeMetaRemote,
} from '@/business/api';
import { clanFounderOfMasterNode, clanFounderChildBlockMessage, treeDisplayTitleOf } from '@/business';
import type { MasterClanFounder } from '@/business';
import { isAssetInsufficientError, goMyAssets } from '@/business/asset-guide';
import { shortageLine, SEED_QTY_UNIT } from '@/business/asset-text';
import { isAuthenticated, authState, getAuthToken } from '@/business/auth';
import {
  personIdDisplay,
  personIdDisplayOf,
  pickPreferredPerson,
  isMirrorRecord,
  PERSON_REF_PLACEHOLDER,
} from '@/business/format';
import {
  BATCH_MAX_GEN,
  buildBatchConfirmContent,
  formatBatchPreview,
  parseBatchNames,
} from '@/business/chain-batch';
import type { PersonSummary } from '@/business/types';

/**
 * 谱系管理操作面板（档案弹窗内的次级操作区）
 * 承载树图管理操作：
 * - 普通家族树：添加父/子节点、添加配偶、移除并新建家族树
 * - 中华世本总谱：源流链续编下一世（新建节点 / 挂接已有节点），需 chainGen 传入当前节点世数
 * 全程内联于所在弹窗，不产生新的整屏弹窗层。
 * 所有操作成功后 emit('tree-changed')，由宿主刷新树图与档案。
 *
 * 注：把祖先链并入总谱并删源的旧入口已按 docs/founder-attach.spec.md §6 移除，
 * 改走始祖挂载的「认祖」（不删源，见 person-archive.vue）。
 */
const props = defineProps<{
  treeId: string;
  /** 当前人物的档案摘要（name/gramps_id 用于展示与确认文案） */
  personName: string;
  /** 当前人物的树内 handle（空 = 虚拟/占位，不可执行树操作） */
  handle: string;
  /** 总谱源流链世数（>=1 = 在链上；0/缺省 = 不在链上，不可续编） */
  chainGen?: number;
  /** 当前节点是链上聚合虚位节点（代表多世，如「伏羲氏诸世」2–44 世） */
  chainAggregate?: boolean;
  /** 当前节点本人的姓（加父时默认随子姓） */
  personSurname?: string;
  /** 当前节点本人性别（加配偶时默认选相反性别） */
  personGender?: 'M' | 'F' | 'U';
  /** 新增子节点的默认姓（随父姓：父方姓优先，父不详取本人姓） */
  childSurnameDefault?: string;
  /** 本树层级（tree-meta.kind；'family' 才可立支，总谱 / 祖谱节点不可立支，§6-1-2） */
  treeKind?: string;
  /** 当前节点是否本树始祖位（始祖节点本身不可立支，§3-5） */
  isFounder?: boolean;
  /**
   * 当前节点是否**外树镜像节点** → 不可立支（docs/branch-clan-ops.spec.md §9-1 显示条件）。
   * **语义 = 任何 `link_type` 的 `external_mirror === 'true'`**（founder / chain / marriage / child 一视同仁），
   * 由宿主按节点 `attributes` 原始标记传入。
   * ⚠️ **不得**改用「R3 只读判据」（`external_link_type ∈ {founder, chain}`）：那会把 marriage / child
   * 镜像漏判为可立支、错露「🌱 立支」按钮。marriage / child 镜像的**可编辑性**沿用既存口径（本批不扩）。
   */
  isMirror?: boolean;
  /**
   * 当前节点是否**顶端世系链镜像**（external_link_type='chain'）：
   * 祖谱里该镜像段的真身在中华世本、本层只读 → 不可作批量的父节点；
   * 注意 `founder` 镜像**可以**（祖谱自有段就从始祖之下长出来）。
   */
  isChainMirror?: boolean;
  /**
   * 口径 ①（Kevin 2026-10-15）：由**认祖镜像**（口径收窄后仅 `external_link_type === 'founder'`）
   * 开入本真身档案时，宿主带下的镜像节点在**本树**的坐标。非空 ⇒ 谱系管理区多出
   * 「在《本树名》内添加子节点」入口，提交带本树 `tree_id` / `handle`（子嗣建在本树，真身树零写入）。
   * 缺省 '' = 无本树上下文，行为与既有完全一致（chain 镜像保持现状，不带下）。
   */
  localTreeId?: string;
  localHandle?: string;
  /** 本树（祖谱）展示名，**仅供「在《…》内添加子节点」文案**用；缺省 '' → 回落 tree_id */
  masterClanTitle?: string;
}>();

const emit = defineEmits<{
  /** 树结构已被修改（加父/加子/加配偶/拆分/续编），宿主刷新 */
  (e: 'tree-changed'): void;
}>();

const panelError = ref('');

// 角色权限：拆分为 chief_editor；加父/加子/加配偶为 tree_steward/chief_editor（总谱仅 chief）
const canAddNode = computed(() => {
  if (!isAuthenticated()) return false;
  const role = authState.role;
  if (role !== 'tree_steward' && role !== 'chief_editor') return false;
  if (props.treeId === 'zhonghua' && role !== 'chief_editor') return false;
  return !!props.handle;
});
const canSplit = computed(
  () => isAuthenticated() && authState.role === 'chief_editor' && props.treeId !== 'zhonghua' && !!props.handle,
);

/**
 * 口径 ① 本树入口可用性：**只看宿主带下的本树坐标**（`localTreeId` / `localHandle`，由宿主在
 * `external_link_type === 'founder'` 的认祖镜像开入时带下）—— 与**目标树自身**的层级规则绑定，
 * 不受本档案树（中华世本）规则影响：真身档案在总谱，若复用 `canAddNode` 会被「总谱须总编」挡住
 * ⇒ 祖谱管家根本看不到入口。写权档位与 `canAddNode` 一致（tree_steward / chief_editor），
 * zhonghua 规则按**目标树**复制一份（localTreeId 恒为镜像所在的自有树）。
 */
const canAddChildLocal = computed(() => {
  if (!isAuthenticated()) return false;
  const role = authState.role;
  if (role !== 'tree_steward' && role !== 'chief_editor') return false;
  if (props.localTreeId === 'zhonghua' && role !== 'chief_editor') return false;
  return !!(props.localTreeId && props.localHandle);
});

// ---- 口径 ②（Kevin 2026-10-15）：世本里「已作为某祖谱始祖」的节点不得添加子嗣 ----
/**
 * 命中的祖谱（本节点已作为其始祖）。**与后端 `lib/child-write.js` 的 `assertMasterChildAddAllowed`
 * 同口径：只在本档案树 = 中华世本时解析**（handle 仅树内唯一，别的树可能撞号）。
 * tree-meta 走 cross-tree 模块级缓存（一次请求全仓复用，不按节点请求）。
 */
const masterClanFounder = ref<MasterClanFounder | null>(null);
watch(
  [() => props.treeId, () => props.handle],
  async ([tid, h]) => {
    masterClanFounder.value = tid === 'zhonghua' && h ? await clanFounderOfMasterNode(h) : null;
  },
  { immediate: true },
);
/** 子嗣类入口闸门（世本内本节点已作为某祖谱始祖 → 一律拦住；「添加配偶」非子嗣操作，不受拦） */
const childAddBlocked = computed(() => isMasterChain.value && !!masterClanFounder.value);
/** 就地引导文案（**逐字**与后端 `clanFounderChildBlockMessage` 同字面，页面不自拼） */
const childBlockMessage = computed(() =>
  childAddBlocked.value ? clanFounderChildBlockMessage(masterClanFounder.value?.title || '') : '',
);

// ---- 总谱源流链续编（zhonghua）----
const isMasterChain = computed(() => props.treeId === 'zhonghua');
const chainGen = computed(() => props.chainGen);
const nextGen = computed(() => (props.chainGen === undefined ? 0 : props.chainGen + 1));
/** 可续编：总谱 + 有写权限 + 该节点在源流链上（世数 0 = 原始节点也算在链上；非聚合虚位节点） */
const canAppendChain = computed(
  () => canAddNode.value && props.chainGen !== undefined && props.chainGen >= 0 && !props.chainAggregate,
);
const chainBlockedHint = computed(() => {
  if (!canAddNode.value) return '仅总编辑（chief_editor）可续编中华世本';
  if (props.chainAggregate) return '聚合虚位节点代表多世（如「伏羲氏诸世」2–44 世），请在其后继节点上续编';
  return '该节点不在源流链上（无世数），无法续编下一世';
});

// ---- 祖谱（kind='clan'）：批量添加子孙适用面（口径 B）----
/** 本树是否祖谱 */
const isClanTree = computed(() => (props.treeKind || 'family') === 'clan');
/**
 * 祖谱可批量添加子孙：本树写权（canAddNode，tree_steward/chief_editor）
 * 且该节点**不是**顶端世系链镜像（external_link_type='chain' 的真身在世本、本层只读；
 * founder 镜像可以——祖谱自有段正是从始祖之下长出来）。普通家族树不显示（只有世本与祖谱可以）。
 */
const canAppendClanBatch = computed(() => isClanTree.value && canAddNode.value && !props.isChainMirror);
/** 祖谱批量被阻断的唯一情形提示（链镜像节点；无权限时整面板不渲染） */
const clanBatchBlockedHint = computed(() =>
  isClanTree.value && canAddNode.value && props.isChainMirror
    ? '该节点是中华世本世系链镜像（只读）：请在祖谱自有段的节点上批量添加子孙'
    : '',
);
/** 本树（祖谱）展示名（仅供「在《…》内添加子节点」文案；缺省回落 tree_id） */
const localTreeTitle = computed(() => props.masterClanTitle || props.localTreeId || '');
/** 本次表单是否由「在《本树名》内添加子节点」入口打开（口径 ①；addLocalTree 只由该入口置位） */
const addLocalTree = ref(false);

const panelTitle = computed(() => {
  if (addPickMode.value === 'batch') return `为「${props.personName}」批量添加子孙`;
  // 口径 ①：本树入口不写「第 N 世」（子嗣建在镜像所在的自有树，不带世本链标记）
  if (addLocalTree.value) return `为「${props.personName}」在《${localTreeTitle.value}》内添加子节点`;
  if (isMasterChain.value && addMode.value !== 'spouse') return `为「${props.personName}」续编第 ${nextGen.value} 世`;
  if (addMode.value === 'spouse') return `为「${props.personName}」添加配偶`;
  return `为「${props.personName}」添加${addMode.value === 'parent' ? '父节点' : '子节点'}`;
});
const panelHint = computed(() => {
  // 「指定 ID」档（F-1）专属说明：本档既无新建表单、也不渲染候选列表（模板为独立档位块），
  // 放在分支链最前；addPickTab === 'ref' 与 'batch' 互斥，故既有分支文案与先后关系零改动。
  if (addPickTab.value === 'ref') {
    return '填全局编号（如 000000052）或 handle 解析出本树已有节点，解析成功后按「挂接」提交（本档不新建节点）；编号属于别的家族树时不能挂接。';
  }
  if (addPickMode.value === 'batch') {
    // 祖谱：拿不到结构世数（后端才推），文案按「相对序号」口径，不猜世数
    if (isClanTree.value) {
      return `按「一条线单传」依次续编：最多 1 次添加 ${BATCH_MAX_GEN} 代；姓随父姓继承，批量录入不可改姓；新建节点均为已故（与世本同口径）。`;
    }
    return `按「一条线单传」依次续编：第 1 个名字为第 ${nextGen.value} 世，最多 1 次添加 ${BATCH_MAX_GEN} 代；姓随父姓继承，批量录入不可改姓。`;
  }
  if (addMode.value === 'spouse') {
    return '配偶将与本人同属一个家族：本人已有家族则补上空位，家族已满则新建家族（再婚/多配偶）。';
  }
  if (addLocalTree.value) {
    return `新节点将建在《${localTreeTitle.value}》内（本树），不加「第 N 世」标记；中华世本（真身）树不被写入。`;
  }
  if (isMasterChain.value) {
    return `新节点将带「第 ${nextGen.value} 世」标记写入源流链，总谱时间轴立即可见；也可把总谱内已有节点挂接为第 ${nextGen.value} 世。`;
  }
  return '新建节点后自动挂接到世系中；也可从树中选择已有节点。';
});

/** 是否有任一管理权限（决定整个操作区是否显示）＋口径 ① 本树入口（祖谱管家在总谱真身档案里只有它） */
const hasAnyPermission = computed(() => canAddNode.value || canSplit.value || canAddChildLocal.value);

// ---- 添加父/子/配偶节点 ----
const showAddNode = ref(false);
const addMode = ref<'parent' | 'child' | 'spouse'>('parent');
/**
 * 档位状态（UI 侧）：新增第三档 `ref` =「指定 ID」（F-1）；模板渲染与按钮激活态读它。
 * `ref` 档是**挂接档的一种输入方式**（编号 → 解析出既有节点 → 写既有 addSelected 槽），
 * 故提交侧见下方 addPickMode 的口径说明。
 */
const addPickTab = ref<'new' | 'pick' | 'batch' | 'ref'>('new');
/**
 * 提交侧档位（F-7）：既有提交分支与提交判定一律读它，`ref` 档在此**归一到 `'pick'`**：
 * - doAddNode 的四条分支（配偶挂接 / 世本挂接 / 加父传 handle / 加子传 child_handle）判据
 *   为 `addPickMode.value === 'pick'` → 本档因此**一字不改**地走既有挂接路径（只挂接、不新建）；
 * - addCanSubmit 的 `=== 'pick'` 分支在新档下等于「已定位成功」（addSelected 非空）→ 可直接复用。
 * 取值域含 'ref' 仅为模板侧赋值（@click / openAddNode）通过类型检查；get 恒不返回 'ref'。
 */
const addPickMode = computed({
  get: (): 'new' | 'pick' | 'batch' | 'ref' => (addPickTab.value === 'ref' ? 'pick' : addPickTab.value),
  set: (v: 'new' | 'pick' | 'batch' | 'ref') => { addPickTab.value = v; },
});
const addName = ref('');
const addSurname = ref('');
/** 姓默认随（父/子）姓锁定；点「改姓」解锁为特例姓氏 */
const surnameLocked = ref(true);
const addGender = ref<'M' | 'F' | 'U'>('M');
/** 「承母嗣」勾选：本族已婚女性的后代要挂在本树女性名下时手动声明（请求带 maternal_succession: true） */
const addMaternalSuccession = ref(false);
const addHao = ref('');
const addFeng = ref('');
const addShi = ref('');
const addQuery = ref('');
const addResults = ref<PersonSummary[]>([]);
const addSearching = ref(false);
const addSearched = ref(false);
const addSelected = ref<PersonSummary | null>(null);
/** 「指定 ID」档（F-2）：输入的编号 / handle 原文（报错文案要原文代入，故不 trim 存储） */
const addRefInput = ref('');
/** 「指定 ID」档：已定位命中的既有节点（= addSelected 槽的镜像，仅用于渲染确认行） */
const addRefSelected = ref<PersonSummary | null>(null);
/**
 * 「指定 ID」档：同一编号**命中多条**记录时的全部命中（甲口径：同一编号可对应 1 条真身 + N 条镜像；
 * 立支形态下同一棵树内可有两镜像同号）。**仅 >1 时渲染列表**（1 条时确认行已足够），
 * 每行按 `format.ts` 的显示单点标出「真身 / 镜像 · 源自 <树名>」，点行即切换既有 `addSelected` 槽。
 * 择一规则 = format.ts `pickPreferredPerson`（真身 > 登记镜像 > 其它镜像），**绝不取第一条**。
 */
const addRefHits = ref<PersonSummary[]>([]);
/** 「指定 ID」档：命中记录 handle → 来源树名（镜像才有；真身 / 取不到 = ''，供确认行与列表行共用） */
const addRefSourceTitles = ref<Record<string, string>>({});
/** 「指定 ID」档：当前选中命中（addRefSelected）的来源树名 */
const addRefSourceTitle = computed(() => addRefSourceTitles.value[addRefSelected.value?.handle || ''] || '');
const addRefResolving = ref(false);
/**
 * 「指定 ID」档解析的**请求代次**（R-2）：每次发起解析前自增并捕获本次值，两段 await 之后
 * 与 catch 落地前都再核一次 —— 同一输入连发两次解析（连点按钮 / 回车与点击叠发）时，
 * 只有最后一次说的话算，前一次的落地（回填 / 报错）整段丢弃。
 * 模板不读它（非响应式需求），故用普通计数而非 ref。
 */
let addRefResolveSeq = 0;
const addingNode = ref(false);

// ---- 批量添加子孙（总谱续编）状态 ----
/** 粘贴的文本（只填「名」，姓随父姓继承） */
const batchText = ref('');
const batchAdding = ref(false);
/** 批量档展示的姓：预填父姓（来源同单节点表单：childSurnameDefault，父不详取本人姓）并锁定 */
const batchSurname = computed(() => props.childSurnameDefault || props.personSurname || '');
/** 姓提示：批量录入**不允许改姓**，故无「改姓」开关/链接 */
const batchSurnameHint = computed(() =>
  batchSurname.value
    ? `姓随父姓「${batchSurname.value}」继承（批量录入不可改姓）`
    : '姓随父姓继承（批量录入不可改姓；父姓不详时由服务端按父节点继承）',
);
/** 实时解析（纯函数；空文本 → names=[] + error「请粘贴要添加的子孙名字」） */
const batchParsed = computed(() => parseBatchNames(batchText.value, BATCH_MAX_GEN));
const batchNames = computed(() => batchParsed.value.names);
const batchError = computed(() => batchParsed.value.error);
/** 可提交：无解析错误、至少 1 个名字、且没有正在提交 */
const batchCanSubmit = computed(() => !batchError.value && batchNames.value.length > 0 && !batchAdding.value);
/** 预览：「将按顺序添加 N 代：第 49 世 → 甲；…」（起始世数 = nextGen）；祖谱档用相对序号（口径 C） */
const batchPreview = computed(() =>
  isClanTree.value
    ? formatClanBatchPreview(batchNames.value)
    : formatBatchPreview(batchNames.value, nextGen.value),
);

/**
 * 祖谱档预览（相对序号）：祖谱拿不到结构世数（世数由后端按父节点推算后才返回），
 * 故不猜世数，只按顺序展示「后代 N → 名」。世本文案见 business/chain-batch.ts 的 formatBatchPreview。
 */
function formatClanBatchPreview(names: string[]): string {
  if (!names.length) return '';
  return `将按顺序添加 ${names.length} 代：${names.map((n, i) => `后代 ${i + 1} → ${n}`).join('；')}`;
}

/**
 * 祖谱档二次确认正文（与世本同口径：前 5 项 + 「…等共 N 代」+ 姓氏/已故说明；
 * 唯一差异是不写「第 A–B 世」——祖谱世数由后端推）。
 */
function buildClanBatchConfirmContent(names: string[]): string {
  if (!names.length) return '';
  const head = names.slice(0, 5).map((n, i) => `后代 ${i + 1} → ${n}`).join('\n');
  const more = names.length > 5 ? `\n…等共 ${names.length} 代` : '';
  return `请输入一条线单传的后代，确认按序添加：\n${head}${more}\n姓随父姓继承（批量录入不可改姓）。新建节点均为已故（与世本同口径）。`;
}

/** 姓继承提示文案（父姓不详时提示手填；配偶姓不继承） */
const surnameHint = computed(() => {
  if (addMode.value === 'spouse') return '配偶姓氏与本人可不同，请直接填写';
  if (addMode.value === 'parent') {
    return props.personSurname ? `默认随子姓「${props.personSurname}」` : '子节点姓氏不详，请点「改姓」填写';
  }
  return props.childSurnameDefault ? `默认随父姓「${props.childSurnameDefault}」` : '父姓不详，请点「改姓」填写';
});

/** 姓提示文案（配偶模式无「改姓」概念，恒显示自由填写提示） */
const surnameHintText = computed(() =>
  addMode.value === 'spouse' ? surnameHint.value : surnameLocked.value ? surnameHint.value : '已改为特例姓氏（不再随父姓）',
);
/** 是否显示「改姓/恢复随父姓」开关（配偶模式不需要） */
const showSurnameToggle = computed(() => addMode.value !== 'spouse');

/**
 * 「承母嗣」勾选框可见性：**只在「加子女 + 本人为女性（以母亲为家长）」形态显示**。
 * 世本（`isMasterChain`）/ 祖谱（`isClanTree`）不显示 —— 后端守卫也不套用这两层。
 */
const showMaternalSuccession = computed(
  () => addMode.value === 'child' && props.personGender === 'F' && !isMasterChain.value && !isClanTree.value,
);

/** 称号等档案属性（仅新建时，非空才提交） */
function titleAttributes(): Array<{ key: string; value: string }> {
  return [
    { key: '号', value: addHao.value.trim() },
    { key: '封号', value: addFeng.value.trim() },
    { key: '谥号', value: addShi.value.trim() },
  ].filter((a) => a.value);
}

/**
 * 打开内联表单。
 * @param localTree 口径 ①：true = 「在《本树名》内添加子节点」入口（提交带本树 tree_id / handle）
 */
function openAddNode(mode: 'parent' | 'child' | 'spouse', pickMode: 'new' | 'pick' | 'batch' = 'new', localTree = false) {
  panelError.value = '';
  addMode.value = mode;
  addPickMode.value = pickMode;
  addLocalTree.value = localTree;
  addName.value = '';
  // 姓：加子随父姓 / 加父随子姓（默认锁定跟随，改姓才解锁）；配偶姓不继承 → 空 + 可编辑
  addSurname.value = (mode === 'parent' ? props.personSurname : mode === 'child' ? props.childSurnameDefault : '') || '';
  surnameLocked.value = mode !== 'spouse';
  // 配偶性别默认选与本人相反（本人男 → 女），减少一次点击
  addGender.value = mode === 'spouse' ? (props.personGender === 'F' ? 'M' : 'F') : 'U';
  addHao.value = '';
  addFeng.value = '';
  addShi.value = '';
  addQuery.value = '';
  addResults.value = [];
  addSearched.value = false;
  addSelected.value = null;
  // 「指定 ID」档：每次打开都清空输入与解析结论（不给上一次的定位结果留痕）
  addRefInput.value = '';
  addRefSelected.value = null;
  addRefHits.value = [];
  addRefSourceTitles.value = {};
  // 「承母嗣」每次打开都复位（不给上一次的勾选留痕）
  addMaternalSuccession.value = false;
  // 批量档：每次打开都清空粘贴文本与解析结果（不复用上次输入）
  batchText.value = '';
  batchAdding.value = false;
  showAddNode.value = true;
}
function closeAddNode() {
  showAddNode.value = false;
}

/**
 * 本次提交是否走「本树上下文」（口径 ①）：由本树入口打开 **且** 宿主带下了本树坐标。
 * 无本树坐标（普通打开 / chain 镜像）⇒ 恒 false ⇒ 原路径一字不变。
 */
const useLocalTreeContext = computed(() => addLocalTree.value && !!props.localTreeId && !!props.localHandle);
/** 选择已有节点的搜索目标树：本树入口 → 搜本树（祖谱），否则搜本档案树 */
const searchTreeId = computed(() => (useLocalTreeContext.value ? props.localTreeId : props.treeId));

const addCanSubmit = computed(() => {
  if (addPickMode.value === 'pick') return !!addSelected.value;
  // 姓（继承值或手填）与名都必填
  return !!addName.value.trim() && !!addSurname.value.trim();
});

async function doSearchAddNode() {
  const q = addQuery.value.trim();
  if (!q) {
    panelError.value = '请输入姓名关键字';
    return;
  }
  addSearching.value = true;
  addSearched.value = true;
  panelError.value = '';
  addSelected.value = null;
  try {
    const res = await searchPeople({ query: q, tree_id: searchTreeId.value });
    addResults.value = res.people;
  } catch (e: any) {
    panelError.value = e.message || '搜索失败';
    addResults.value = [];
  } finally {
    addSearching.value = false;
  }
}

// ---- 「指定 ID」档：按全局编号 / handle 解析本树内的既有节点（F-2~F-7）----

/**
 * F-3 编号等价归一（R-3：**纯字符串**实现，不经过 parseInt —— 超过 21 位的数字串会被
 * parseInt 塌缩成科学计数法（26 个 9 → `1e+26`），两个不同数字因此得到同一个键）：
 * 去空白 → 去可选字母 I 前缀（大小写均算）→ 剩余全为数字则去掉前导零（全零保留单个 0）→ 返回；
 * 非纯数字形态（handle）原样返回。
 * 故 `000000052` / `I000052` / `52` / `I52` / `0052` / `i52` 视为同一个编号，
 * 且现网 9 位编号的行为与旧实现逐例一致。
 */
function normalizePersonRef(raw: string): string {
  const s = (raw || '').replace(/\s+/g, '');
  const m = s.match(/^[Ii]?(\d+)$/);
  if (!m) return s;
  return m[1].replace(/^0+(?=\d)/, '');
}

/**
 * 某条搜索结果是否与输入等价（F-3 冻结口径，R-4 **按形态分工**：
 * **编号形态按数值等价比对，handle 形态按去空白全等比对**）：
 * 输入归一后为纯数字 ⇒ 只比候选的**编号**（归一后等值）；非纯数字 ⇒ 只比候选的 **handle**
 * （归一后全等）。不再用或关系并列 —— 否则纯数字输入会命中一条 handle 恰为纯数字的节点。
 */
function isRefHit(raw: string, r: PersonSummary): boolean {
  const key = normalizePersonRef(raw);
  if (!key) return false;
  if (/^\d+$/.test(key)) return key === normalizePersonRef(r.gramps_id || '');
  return key === normalizePersonRef(r.handle || '');
}

/** F-6 自身防护：解析出的 handle === 当前档案节点 handle → 按档位给报错文案（'' = 通过） */
function refSelfError(handle: string): string {
  if (!handle) return '';
  const isSelf = handle === props.handle || (useLocalTreeContext.value && handle === props.localHandle);
  if (!isSelf) return '';
  const what = addMode.value === 'parent' ? '父节点' : addMode.value === 'child' ? '子节点' : '配偶';
  return `不能把本人指定为自己的${what}`;
}

/** 输入变更：定位结论随输入作废（改字即回到「未定位」→ 提交按钮不可用，F-2） */
function onRefInputChange(v: any) {
  addRefInput.value = typeof v === 'string' ? v : '';
  addRefSelected.value = null;
  addRefHits.value = [];
  addRefSourceTitles.value = {};
  addSelected.value = null;
}

/** 切到「指定 ID」档：清掉别的档（或本档上一次解析）留下的选中槽，保证「解析成功前不可提交」 */
function switchToRef() {
  addPickMode.value = 'ref';
  addRefSelected.value = null;
  addRefHits.value = [];
  addRefSourceTitles.value = {};
  addSelected.value = null;
  panelError.value = '';
}

/**
 * 切到「新建节点」/「从树中选择」档（单点控制：模板该两颗按钮共用本函数）。
 * 仅当**当前正处于「指定 ID」档**（UI 档位 addPickTab === 'ref'）时清掉该档留下的选中槽：
 * 该档的定位结果写入的就是既有 addSelected 槽，而这两档下界面并无与之对应的候选列表/选中态
 * （addResults 为空），留着会出现「界面无选中态、提交按钮却可用」的错配 —— 会把刚解析出的
 * 那个节点当成本档选中的节点挂接上去。在 pick 档内部重复点该按钮不清槽（用户已选候选保持）。
 * 同一 if 内一并**复位面板报错区**（与进入本档的 switchToRef 清错误区对称）：否则本档留下的
 * 报错（如「编号「…」属于《某树》家族树」）会跟着串到另一档的面板上；同样只在本档离开时清，
 * 「从树中选择」档内部重复点按钮不得误清本档自己的搜索报错。
 */
function switchAddPickTab(tab: 'new' | 'pick') {
  if (addPickTab.value === 'ref') {
    addSelected.value = null;
    addRefSelected.value = null;
    addRefHits.value = [];
    addRefSourceTitles.value = {};
    panelError.value = '';
  }
  addPickMode.value = tab;
}

/**
 * 解析是否仍然「说了算」（F-4 异步守卫）：本档解析有**两段 await**，用户在请求在飞时可能已切到
 * 别的档、或在输入框里改了字 —— 此时任何回填（选中槽 / 渲染镜像）与报错都不得落地：否则会出现
 * 「选中槽被写上、界面却停在别的档」的错配（该档候选列表为空、无任何选中态，提交按钮却变可用），
 * 可能把刚解析出的节点当成本档选中的节点挂接上去。
 * 判据：**当前 UI 档位仍是「指定 ID」档**（`addPickTab === 'ref'`）**且** 输入框内容自本次解析
 * 发起后未变（与发起时的原文全等）。不满足 ⇒ 本次解析**整段丢弃**（不写选中槽、不写渲染镜像、
 * 不写 panelError），`finally` 里的 addRefResolving 复位照常执行。
 * 注意：同输入连发两次解析时本守卫**两次都通过**（档位没切、输入没变），故另有 R-2 的请求代次
 * 判据（`addRefResolveSeq === seq`）作平行守卫 —— 前一次解析整段丢弃，见 addRefResolveSeq 注释。
 */
function refResolveStillCurrent(raw: string): boolean {
  return addPickTab.value === 'ref' && addRefInput.value === raw;
}

/**
 * 命中记录的**来源树名**（甲口径 A-5「镜像 · 源自 <树名>」标注里的树名取处）：
 * 仅镜像取 `external_tree` → tree-meta 的 `display_title`（`treeDisplayTitleOf`，模块级缓存一次全仓复用）；
 * 真身 / 指针缺失 / meta 取不到 → `''`（显示端标注退化为「镜像」，绝不拼半截空树名）。
 */
async function resolveRefSourceTitle(r: PersonSummary): Promise<string> {
  if (!isMirrorRecord(r)) return '';
  const src = String(r.external_tree || '').trim();
  if (!src) return '';
  try {
    return await treeDisplayTitleOf(src);
  } catch {
    return '';
  }
}

/** 命中列表行点击：只切换既有 `addSelected` 槽（提交路径与「从树中选择」档共用，一字未改） */
function selectRefHit(r: PersonSummary) {
  addRefSelected.value = r;
  addSelected.value = r;
}

/**
 * 解析「指定 ID」档（F-4 / F-5 三态）：
 * ① 本树 `searchPeople`（tree_id = 既有 searchTreeId 计算值）返回集合里按 F-3 **恰好一个**命中
 *    （**绝不取第一条**——该通道会掺入按姓名模糊命中的无关节点）→ 写既有 addSelected 槽，
 *    走与「从树中选择」完全相同的提交路径；
 * ①′ 甲口径 A-5（取记录 = 真身优先 + 镜像标注）：同一编号可命中**多条**等值记录（镜像不铸号
 *    ⇒ 镜像与真身同号，立支形态下同树内可有两条登记镜像同号）⇒ 择一按「真身 > 登记镜像 > 其它镜像」
 *    的稳定规则（`format.ts` `pickPreferredPerson`，**仍绝不取第一条**），命中 >1 时另渲染候选列表
 *    逐条标出「真身 / 镜像 · 源自 <树名>」；命中 ≥2 条**真身** = 违规（同一人只允许 1 条真身）⇒ 报错不静默择一。
 *    来源树名取 `external_tree` → tree-meta `display_title`（跨树模块级缓存），取不到 → 标注退化「镜像」。
 * ② 本树未中、但全站 `searchPeopleGlobal` 有 `matched === 'id'` 的命中**且命中树 ≠ 本档搜索
 *    目标树**（R-1）→ 报「属于《树名》家族树」（不允许跨树挂接）；命中树就是本树目标树
 *    （树内旧编号形态）则不报跨树，落 ③；
 * ③ 全站也没有（或只有本树命中，见 R-1）→ 报「找不到编号为「…」的节点」。
 * 命中后仍要过 F-6 自身防护（本人不可作自己的父 / 子 / 配偶）。
 * 两条 await 之后的四处落地（命中回填 / 跨树报错 / 找不到报错 / catch 报错）均先过两重守卫再写：
 * ① `refResolveStillCurrent`（切档或改字 ⇒ 整段丢弃，见该函数注释）；
 * ② R-2 请求代次 `addRefResolveSeq === seq`（同输入连发两次解析 ⇒ 只有最后一次说的话算，
 *    前一次的落地含报错整段丢弃）。
 */
async function doResolveRef() {
  const raw = addRefInput.value;
  const q = raw.trim();
  addRefSelected.value = null;
  addRefHits.value = [];
  addRefSourceTitles.value = {};
  addSelected.value = null;
  panelError.value = '';
  if (!q) {
    panelError.value = '请输入编号或 handle';
    return;
  }
  addRefResolving.value = true;
  // R-2 请求代次：自增后捕获本次值；两段 await 之后与 catch 落地前都要复核它仍是当前代次
  addRefResolveSeq += 1;
  const seq = addRefResolveSeq;
  try {
    const res = await searchPeople({ query: q, tree_id: searchTreeId.value });
    // 守卫 ①：本树搜索回来后（命中回填 / 自身防护报错都在其下游）先确认本次解析仍有效
    if (!refResolveStillCurrent(raw)) return;
    // 守卫 ①′（R-2）：本次须仍是最后一次发起的解析 —— 同输入连发两次时前一次整段丢弃
    if (addRefResolveSeq !== seq) return;
    const hits = res.people.filter((r) => isRefHit(q, r));
    if (hits.length) {
      // R-1 / R-3（甲口径 A-5）：同一编号可命中**多条**记录（镜像不铸号 ⇒ 镜像与真身同号）⇒ 按
      // 「真身 > 登记镜像 > 其它镜像」稳定择一（format.ts `pickPreferredPerson`，**绝不取第一条**）；
      // 命中 ≥2 条真身 = 违规（同一人只允许 1 条真身）⇒ 报错，不静默取首条。
      const reals = hits.filter((r) => !isMirrorRecord(r));
      if (reals.length > 1) {
        panelError.value = `编号「${raw}」在本树命中 ${reals.length} 条真身记录（同一人只允许 1 条真身），请巡检修正后再挂接`;
        return;
      }
      const hit = pickPreferredPerson(hits) || hits[0];
      const selfMsg = refSelfError(hit.handle || '');
      if (selfMsg) {
        panelError.value = selfMsg;
        return;
      }
      // 镜像的来源树名（真身不标注）：tree-meta 走 cross-tree 模块级缓存；取不到 → ''（标注退化「镜像」）
      const titles: Record<string, string> = {};
      const wantTitles = hits.length > 1 ? hits : [hit];
      for (const r of wantTitles) titles[r.handle || ''] = await resolveRefSourceTitle(r);
      // 守卫：来源树名解析是第三段 await —— 落地前仍须确认本次解析说了算（切档 / 改字 / 又问一次）
      if (!refResolveStillCurrent(raw)) return;
      if (addRefResolveSeq !== seq) return;
      addRefHits.value = hits.length > 1 ? hits : [];
      addRefSourceTitles.value = titles;
      addSelected.value = hit;
      addRefSelected.value = hit;
      return;
    }
    const globalHits = await searchPeopleGlobal(q);
    // 守卫 ②：全站搜索回来后（跨树报错 / 找不到报错都在其下游）再确认一次
    if (!refResolveStillCurrent(raw)) return;
    // 守卫 ②′（R-2）：同理，前一次解析的全站结论不得落地
    if (addRefResolveSeq !== seq) return;
    const idHit = globalHits.find((h) => h.matched === 'id');
    // R-1 前提：全站命中若就落在**本档搜索目标树**（= 本树搜索用的 searchTreeId），不得输出跨树
    // 文案 —— 真实形态是树内旧编号：本树搜索能定位到节点、前端按现编号比不出来 ⇒ 落入本分支，
    // 而全站把命中树如实报为本树；此时输出跨树文案会把本树节点说成别树节点、把本可成功的输入
    // 变成硬失败。故只命中**别树**才报跨树，命中本树则落到下一支「找不到编号」。
    if (idHit && idHit.tree_id !== searchTreeId.value) {
      panelError.value = `编号「${raw}」属于《${idHit.tree_title}》家族树，不能作为本树的节点`;
      return;
    }
    panelError.value = `找不到编号为「${raw}」的节点`;
  } catch (e: any) {
    // 守卫 ③：报错同样只在本次解析仍有效时落地（切档 / 改字后失败不得污染面板报错区）
    if (!refResolveStillCurrent(raw)) return;
    // 守卫 ③′（R-2）：前一次解析的失败报错也不得落地（同输入连发时只有最后一次算）
    if (addRefResolveSeq !== seq) return;
    panelError.value = e?.message || '解析失败';
  } finally {
    addRefResolving.value = false;
  }
}

async function doAddNode() {
  // 防御：批量档有独立提交按钮（doBatchAdd），绝不把批量内容当单节点表单提交
  if (addPickMode.value === 'batch') {
    await doBatchAdd();
    return;
  }
  const token = getAuthToken();
  if (!token) {
    panelError.value = '登录已过期，请重新登录';
    return;
  }
  addingNode.value = true;
  panelError.value = '';
  // 口径 ②：世本里「已作为某祖谱始祖」的节点不得添加子嗣（入口已隐藏；此处兜住异步/重放，
  // 与后端 assertMasterChildAddAllowed 同字面）；「添加配偶」不拦，本树入口（口径 ①）不拦。
  if (childAddBlocked.value && addMode.value !== 'spouse' && !useLocalTreeContext.value) {
    panelError.value = childBlockMessage.value;
    addingNode.value = false;
    return;
  }
  try {
    // 姓：锁定时提交空串 → 服务端按「随父姓」继承；点过「改姓」才提交显式姓
    const surname = surnameLocked.value ? '' : addSurname.value.trim();
    // 口径 ①：本树入口 → 子嗣建在镜像所在的本树（祖谱）；其余一律按本档案树
    const targetTreeId = useLocalTreeContext.value ? props.localTreeId || '' : props.treeId;
    const targetHandle = useLocalTreeContext.value ? props.localHandle || '' : props.handle;
    // 添加配偶（同树）：新建或挂接已有节点
    if (addMode.value === 'spouse') {
      const r = await addSpouseNode(
        props.treeId,
        props.handle,
        {
          mode: addPickMode.value === 'pick' ? 'attach' : 'new',
          name: addName.value.trim(),
          surname,
          gender: addGender.value,
          child_handle: addSelected.value?.handle,
          attributes: titleAttributes(),
        },
        token,
      );
      uni.showToast({
        title: r.filled_existing_family ? `配偶已补入现有家族：${r.spouse_name}` : `已添加配偶：${r.spouse_name}`,
        icon: 'none',
      });
      closeAddNode();
      emit('tree-changed');
      return;
    }
    // 总谱源流链续编：世数由服务端按父节点世数 +1 计算并写入链属性
    // 口径 ①：本树入口（祖谱内添加子节点）走一般 addChildNode，不带世本链标记 → 由本树上下文绕开本分支
    if (isMasterChain.value && !useLocalTreeContext.value) {
      const res = await appendChainNode(
        props.treeId,
        props.handle,
        {
          mode: addPickMode.value === 'pick' ? 'attach' : 'new',
          name: addName.value.trim(),
          surname,
          gender: addGender.value,
          child_handle: addSelected.value?.handle,
          attributes: titleAttributes(),
        },
        token,
      );
      uni.showToast({ title: `已续编第 ${res.gen} 世`, icon: 'success' });
      closeAddNode();
      emit('tree-changed');
      // 注：同世并列分支（res.branch）不再弹「第 N 世已有节点」提示——属确认类信息，非报错，
      // 且时间轴已在卡片上打「分支」tag（产品决策：该弹窗不必要，已移除）。
      return;
    }
    const input =
      addPickMode.value === 'pick'
        ? { handle: addSelected.value?.handle, gender: addSelected.value?.gender || 'U' }
        : { name: addName.value.trim(), surname, gender: addGender.value, attributes: titleAttributes() };
    let toastTitle = addMode.value === 'parent' ? '父节点已添加' : '子节点已添加';
    let toastIcon: 'success' | 'none' = 'success';
    if (addMode.value === 'parent') {
      await addParentNode(props.treeId, props.handle, input, token);
    } else {
      // 「承母嗣」：勾选才随请求提交（未勾选不带该字段 → 已婚配本族女性会被服务端 400 拒绝）
      const childInput =
        addPickMode.value === 'pick'
          ? { handle: addSelected.value?.handle, gender: addSelected.value?.gender || 'U' }
          : { name: addName.value.trim(), surname, gender: addGender.value, attributes: titleAttributes() };
      const childPayload = addMaternalSuccession.value
        ? { ...childInput, maternal_succession: true }
        : childInput;
      const res = await addChildNode(targetTreeId, targetHandle, childPayload, token);
      // 跨树婚姻家庭（父/母为外树镜像）：子女真身落到对方树，本地只留镜像子女（marriage.spec §7-4）
      if (res.cross_tree) {
        toastTitle = res.message || `子节点已建到「${res.landed_tree_id}」，本树留镜像`;
        toastIcon = 'none';
      }
    }
    uni.showToast({ title: toastTitle, icon: toastIcon });
    closeAddNode();
    emit('tree-changed');
  } catch (e: any) {
    panelError.value = e.message || '添加失败';
  } finally {
    addingNode.value = false;
  }
}

// ---- 批量添加子孙（总谱续编；契约见 api.ts 的 appendChainBatch）----

/**
 * 批量添加子孙：「确认添加」→ 二次确认弹窗（前 5 项 + 共 N 代 + 第 A–B 世）→ `POST /admin/chain-append-batch`。
 * 只提交「名」序列（姓随父姓继承）；请求中按钮 loading 防重复提交；
 * 成功 toast 优先用后端 message（缺失时回落「已续编第 A–B 世，共 N 代」）。
 */
async function doBatchAdd() {
  const token = getAuthToken();
  if (!token) {
    panelError.value = '登录已过期，请重新登录';
    return;
  }
  const names = batchNames.value;
  if (batchError.value || !names.length) {
    // 解析未通过时不允许发请求（预览区也据此不展示可提交状态）
    panelError.value = batchError.value || '请粘贴要添加的子孙名字';
    return;
  }
  const startGen = nextGen.value;
  const endGen = startGen + names.length - 1;
  // 口径 ②：世本内「已作为某祖谱始祖」的节点同样不得批量添加子孙（入口已隐藏，此处兜住）
  if (childAddBlocked.value) {
    panelError.value = childBlockMessage.value;
    return;
  }

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '批量添加子孙确认',
      content: isClanTree.value ? buildClanBatchConfirmContent(names) : buildBatchConfirmContent(names, startGen),
      confirmText: '确认添加',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  batchAdding.value = true;
  panelError.value = '';
  try {
    const res = await appendChainBatch(props.treeId, props.handle, names, token);
    const a = res.start_gen ?? startGen;
    const b = res.end_gen ?? endGen;
    const n = res.count ?? names.length;
    uni.showToast({
      // 统一用后端返回的 message（祖谱形如「已续编第 2–4 世，共 3 代」）；缺失时按档位回落
      title:
        res.message
        || (isClanTree.value ? `已按顺序添加 ${n} 代` : `已续编第 ${a}–${b} 世，共 ${n} 代`),
      icon: 'success',
      duration: 3000,
    });
    closeAddNode();
    emit('tree-changed');
  } catch (e: any) {
    // 失败不静默：文案落面板错误区（资产不足沿用既有弹窗 + 「去我的资产」分支）
    const msg = e?.message || '批量添加失败';
    panelError.value = msg;
    if (isAssetInsufficientError(e)) {
      uni.showModal({
        title: '⚠️ 批量添加失败',
        content: msg,
        confirmText: '去我的资产',
        cancelText: '稍后再说',
        success: (r) => { if (r.confirm) goMyAssets(); },
      });
      return;
    }
    uni.showModal({ title: '批量添加失败', content: msg, showCancel: false });
  } finally {
    batchAdding.value = false;
  }
}

// ---- 移除并新建家族树（拆分） ----
const splitting = ref(false);

async function confirmSplit() {
  const token = getAuthToken();
  if (!token) {
    panelError.value = '登录已过期，请重新登录';
    return;
  }
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '移除并新建家族树',
      content: `以「${props.personName}」为始祖新建一支家族树？\n新树姓氏：${(props.personName || '?')[0]}氏。此操作不可撤销！`,
      confirmText: '确认拆分',
      cancelText: '取消',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  splitting.value = true;
  panelError.value = '';
  try {
    const res = await splitTree(token, {
      tree_id: props.treeId,
      ancestor_handle: props.handle,
      ancestor_name: props.personName,
    });
    uni.showModal({
      title: '拆分成功',
      content: `已创建新家族树「${res.newTreeId}」\n${res.message}`,
      showCancel: false,
      confirmText: '刷新查看',
      success: () => emit('tree-changed'),
    });
  } catch (e: any) {
    panelError.value = e.message || '拆分失败';
  } finally {
    splitting.value = false;
  }
}

// ---- 立支（普通节点 → 新家族树始祖；docs/branch-clan-ops.spec.md §6-1 / §9-1 / §9-2）----

/**
 * 立支单价默认值（石榴籽；量词**不写死** —— 一律经 `asset-text.ts` 的 `SEED_QTY_UNIT`）：真源在后端 `jiapu_wallets.config.branch_fee_seeds`（默认 9999，§5-4），
 * 前端只用于**提交前**确认文案的明示数字；实际扣费以后端响应 `fee.amount` 为准。
 */
const BRANCH_FEE_SEEDS = 9999;

/** 籽不足时的附注清单（§9-2 L3 定稿：签到 / 邀请 / 贡献 / 玉分解返还） */
const HOW_TO_GET_SEEDS = '签到 / 邀请 / 贡献 / 玉分解返还';

const establishing = ref(false);

/**
 * 可立支（§9-1 显示条件）：本树写权（`tree_steward` / `chief_editor`，即 canAddNode）
 * 且树 `kind='family'`（总谱 / 祖谱节点不可立支）且该节点非始祖位、非镜像节点
 * （`isMirror` = **任何** `link_type` 的 `external_mirror==='true'`，见上方 prop 口径）。
 * ⚠️ L1 确认与 L2 / L3 反馈**文案**为 §9-2 定稿（逐字不得改写）→ 本处只维护显示条件，不动字面。
 */
const canEstablishBranch = computed(
  () =>
    canAddNode.value &&
    (props.treeKind || 'family') === 'family' &&
    !props.isFounder &&
    !props.isMirror,
);

/** 预读当前石榴籽可用量（L1 的「当前可用【XX】<量词>」，量词经 `asset-text.ts` 的 `SEED_QTY_UNIT`；读失败 → 占位写「以实际扣费为准」，不阻塞） */
async function readSeedBalance(): Promise<number | null> {
  try {
    const summary = await fetchAssetsSummary();
    return summary.seeds_total;
  } catch {
    return null;
  }
}

/**
 * L1 立支确认（**定稿文案逐字使用**，§9-2；` / ` = 换行，【】内为运行时填值）。
 * 一次性写清：原树保留 N 及其全部后代 / 祖先链上移并入宗谱 / 新树以 N 为始祖 / 费用与不可退回。
 */
function establishConfirmText(name: string, balance: number | null): string {
  const balanceText = balance === null ? '以实际扣费为准' : String(balance);
  return [
    '⚠️ 立支确认',
    `本次将把「${name}」立为新家族树的始祖：其上级祖先链将整体上移并入本家族宗谱；原家族树保留「${name}」及其全部后代（始祖改为「${name}」）。`,
    `本次操作将消耗${BRANCH_FEE_SEEDS}${SEED_QTY_UNIT}石榴籽，消耗时优先扣除您账户内即将最先到期的石榴籽，消耗后不可退回（当前可用${balanceText}${SEED_QTY_UNIT}）。`,
    '是否确认立支？',
  ].join('\n');
}

/** 新树展示名：立支出参无该字段（§8-1）→ 用 tree-meta 现查；查不到回落 tree_id */
async function resolveNewTreeTitle(newTreeId: string): Promise<string> {
  try {
    const meta = await fetchTreeMetaRemote();
    const hit = Object.values(meta.trees || {}).find((t: any) => t.tree_id === newTreeId);
    return hit?.display_title || newTreeId;
  } catch {
    return newTreeId;
  }
}

/** 籽不足时的明细行（`ASSET_INSUFFICIENT` 的 need / current / unit / how_to_get **带到 UI**） */
function seedShortageLines(e: unknown): string[] {
  const err = e as { need?: number; current?: number; unit?: string; howToGet?: string[] } | undefined;
  const lines: string[] = [];
  if (err?.need !== undefined || err?.current !== undefined || err?.unit !== undefined) {
    // 量词一律走后端 `unit` 键 → `asset-text.ts` 单点（本组件不写量词字面、不展示英文键）
    lines.push(shortageLine(err?.need, err?.current, err?.unit));
  }
  const provided = err?.howToGet;
  const items = Array.isArray(provided) && provided.length ? provided.join(' / ') : HOW_TO_GET_SEEDS;
  lines.push(`如何获得石榴籽：${items}`);
  return lines;
}

/**
 * 立支：二次强确认（L1）→ 提交 `{ tree_id, person_handle }` → L2 成功 toast（含新树名 / 上移人数 / 余量）。
 * 取消一律**不发请求**（§9-1）；失败 L3「立支失败：【后端 error 原文】」（籽不足附「如何获得石榴籽」）。
 */
async function confirmEstablishBranch() {
  const token = getAuthToken();
  if (!token) {
    panelError.value = '登录已过期，请重新登录';
    return;
  }
  panelError.value = '';
  const name = props.personName || '本节点';
  const balance = await readSeedBalance();
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '⚠️ 立支确认',
      content: establishConfirmText(name, balance),
      confirmText: '确认立支',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  establishing.value = true;
  try {
    const res = await postEstablishBranch(props.treeId, props.handle);
    const newTitle = await resolveNewTreeTitle(res.new_tree_id);
    // L2 立支成功（定稿文案逐字；数字取本次响应）
    uni.showToast({
      title: `立支成功：新家族树「${newTitle}」（${res.new_tree_id}）已建立，共上移${res.moved_ancestors}位祖先、${res.moved_families}个家族，本次消耗 ${res.fee?.amount ?? BRANCH_FEE_SEEDS} ${SEED_QTY_UNIT}石榴籽，余 ${res.fee?.balance_after ?? '—'} ${SEED_QTY_UNIT}`,
      icon: 'none',
      duration: 4000,
    });
    // 树图与档案刷新（R5：原树始祖为真身则保持真身、为镜像时按既有口径；新树始祖 = N 的镜像，并多出一棵新树）
    emit('tree-changed');
  } catch (e: any) {
    // L3 立支失败（定稿文案逐字：直出后端 error 原文，不改写、不自造错误码文案）
    const msg = e?.message || '请求失败';
    panelError.value = `立支失败：${msg}`;
    if (isAssetInsufficientError(e)) {
      const lines = [`立支失败：${msg}`, ...seedShortageLines(e)];
      uni.showModal({
        title: '⚠️ 立支失败',
        content: lines.join('\n'),
        confirmText: '去我的资产',
        cancelText: '稍后再说',
        success: (r) => { if (r.confirm) goMyAssets(); },
      });
      return;
    }
    uni.showModal({ title: '立支失败', content: `立支失败：${msg}`, showCancel: false });
  } finally {
    establishing.value = false;
  }
}
</script>

<style scoped>
.manage-panel {
  margin-top: 18px;
  border-top: 1px dashed #E8DCCB;
  padding-top: 12px;
}
.mp-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.mp-title { font-size: 15px; font-weight: bold; color: #3E2723; }
.mp-sub { font-size: 12px; color: #999; flex: 1; }
.mp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mp-error { display: block; text-align: center; color: #C62828; font-size: 13px; margin: 8px 0; }
.mp-hint { font-size: 12px; color: #999; line-height: 1.6; }

.mp-panel {
  margin-top: 12px; padding: 12px;
  background: #FBF8F4; border-radius: 10px;
}
.mp-panel-head { display: flex; align-items: center; justify-content: space-between; }
.mp-panel-title { font-size: 14px; font-weight: bold; color: #3E2723; }
.mp-panel-close {
  width: 28px; height: 28px; line-height: 28px; text-align: center;
  font-size: 15px; color: #999; border-radius: 50%;
}
.mp-panel-close:active { background: #F0E8DE; }
.mp-panel-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }

.mode-switch { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 4px; }
.mode-btn {
  padding: 6px 14px; border-radius: 8px; font-size: 13px;
  border: 1px solid #F0E8DE; color: #5D4037;
}
.mode-btn.active { border-color: #8B4513; background: #FBF6EF; color: #8B4513; }
.search-row { display: flex; gap: 8px; align-items: center; }
.search-input { flex: 1; }
.name-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.surname-input { max-width: 30%; }
.surname-hint { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.sh-text { font-size: 12px; color: #999; flex: 1; }
.sh-link { font-size: 12px; color: #8B4513; text-decoration: underline; }
.title-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.gender-row { margin-top: 8px; }
/* 「承母嗣」勾选框（本族已婚女性的后代挂在本树女性名下；见后端 lib/family-write-guard.js） */
.ms-row { display: flex; align-items: center; margin-top: 10px; }
.ms-box {
  width: 18px;
  height: 18px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ms-box-on { background: #0052d9; border-color: #0052d9; }
.ms-tick { color: #fff; font-size: 12px; line-height: 14px; }
.ms-label { font-size: 13px; color: #333; }
.ms-hint { margin-top: 4px; display: flex; }
.join-tip { text-align: center; color: #999; font-size: 13px; padding: 12px 0; }

/* 批量添加子孙：提示 / 文本域 / 解析预览（沿用原生 textarea，与 hall 页 .textarea 同风格，不引新依赖） */
.batch-tip {
  font-size: 12px; color: #5D4037; line-height: 1.7;
  background: #FBF6EF; border-radius: 8px; padding: 8px 10px; margin-top: 8px;
}
.batch-textarea {
  min-height: 88px; width: 100%; box-sizing: border-box;
  border: 1px solid #E0D5C8; border-radius: 8px;
  padding: 10px 12px; font-size: 14px; background: #FBF8F4;
  margin-top: 8px; color: #3E2723;
}
.batch-error { color: #C62828; font-size: 12px; margin-top: 8px; line-height: 1.6; }
.batch-preview {
  margin-top: 8px; padding: 8px 10px;
  background: #F4F9F4; border: 1px solid #DCEBDC; border-radius: 8px;
}
.batch-preview-line { font-size: 12px; color: #2E5D34; line-height: 1.7; }

/* ================= 夜间模式（html[data-theme='dark']）=================
   与 styles/td-dark-warm.css 同一套暖调夜间值（底 #211A14 / 卡面 #2A2219 / 次容器 #241D16 /
   格位·chip #332A20 / 主字 #EDE3D6 / 次字 #B8A894 / 更淡 #8A7A66 / 边框 #3A3027 / 暖棕 #C98850）。
   风险操作（删除 / 解绑 / 移除并新建树）由 t-button theme="danger" 走 --td-error-color（= #E0675F），
   此处只补自绘「承母嗣」勾选框与批量预览块；**只改颜色、零几何改动、无 filter / invert**；
   全部 H5 条件编译 ⇒ 小程序零改动。 */
/* #ifdef H5 */
html[data-theme='dark'] .manage-panel { border-top-color: #4A3D31; }
html[data-theme='dark'] .mp-title { color: #EDE3D6; }
html[data-theme='dark'] .mp-sub { color: #B8A894; }
html[data-theme='dark'] .mp-hint { color: #B8A894; }
html[data-theme='dark'] .mp-error { color: #E0675F; }

/* —— 内联表单面板 —— */
html[data-theme='dark'] .mp-panel { background: #241D16; }
html[data-theme='dark'] .mp-panel-title { color: #EDE3D6; }
html[data-theme='dark'] .mp-panel-close { color: #B8A894; }
html[data-theme='dark'] .mp-panel-close:active { background: #332A20; }

/* —— 新建 / 挂接 / 指定 ID 三档切换 —— */
html[data-theme='dark'] .mode-btn { color: #B8A894; border-color: #3A3027; }
html[data-theme='dark'] .mode-btn.active { color: #E5BE93; border-color: #C98850; background: #332A20; }

/* —— 姓 / 名提示与「改姓」链接 —— */
html[data-theme='dark'] .sh-text { color: #B8A894; }
html[data-theme='dark'] .sh-link { color: #C98850; }
html[data-theme='dark'] .join-tip { color: #B8A894; }

/* —— 「承母嗣」自绘勾选框（品牌蓝 → 暖棕；勾号用深字压亮底）—— */
html[data-theme='dark'] .ms-box { border-color: #4A3D31; }
html[data-theme='dark'] .ms-box-on { background: #C98850; border-color: #C98850; }
html[data-theme='dark'] .ms-tick { color: #211A14; }
html[data-theme='dark'] .ms-label { color: #EDE3D6; }

/* —— 批量添加子孙：提示 / 文本域 / 解析预览 —— */
html[data-theme='dark'] .batch-tip { background: #241D16; color: #B8A894; }
html[data-theme='dark'] .batch-textarea {
  background: #241D16; border-color: #3A3027; color: #EDE3D6;
}
html[data-theme='dark'] .batch-error { color: #E0675F; }
html[data-theme='dark'] .batch-preview { background: #26301F; border-color: #3E4A33; }
html[data-theme='dark'] .batch-preview-line { color: #9BD1A4; }
/* #endif */
</style>
