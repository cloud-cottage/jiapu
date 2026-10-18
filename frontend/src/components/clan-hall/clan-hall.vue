<template>
  <view class="clan-hall">
    <view class="clan-hero">
      <text class="clan-title">{{ info?.title || treeId }}</text>
      <view class="clan-meta">
        <t-tag theme="primary" variant="light" size="small">祖谱</t-tag>
        <text v-if="info?.surname" class="clan-surname">{{ info.surname }}氏</text>
        <text v-if="info?.genealogy_name" class="clan-genealogy">谱名：{{ info.genealogy_name }}</text>
      </view>
      <text v-if="info?.notice" class="clan-notice">⚠️ {{ info?.notice }}</text>
      <!-- 【修改谱名】入口（**与家族树页 / 在线文谱工具条同规则同价**：既有 `canManageRevision` 判据、
           `rename_fee_pieces` 价目、共享弹窗 `rename-genealogy-modal`）—— 谱名已从【编辑祖谱信息】
           表单移出（同家族树页口径），改名统一在本弹窗内完成（含本次消耗明示） -->
      <view v-if="canRenameGenealogy" class="clan-edit-entry clan-rename-entry" @click="openRename">
        <text class="clan-edit-text">修改谱名</text>
      </view>
      <!-- 编辑祖谱信息（复用普通树的编辑表单 + PUT /tree-meta；该接口限总编辑） -->
      <view v-if="isAdmin" class="clan-edit-entry" @click="openEdit">
        <text class="clan-edit-text">✏️ 编辑祖谱信息</text>
      </view>
    </view>

    <view v-if="loading" class="clan-loading">
      <t-loading theme="spinner" text="加载祖谱..." />
    </view>
    <view v-else-if="error" class="clan-error">
      <text>{{ error }}</text>
      <t-button size="small" variant="outline" @click="load">重试</t-button>
    </view>

    <template v-else>
      <!-- 左侧功能按钮（与普通家族树首页对齐）：血脉图示 / 版式文档（占位）/ 祖谱消息（管理权限） -->
      <view class="view-toggle">
        <view class="view-btn" :class="{ active: view === 'pedigree' }" @click="view = 'pedigree'">
          <text class="view-text">血脉图示</text>
        </view>
        <view class="view-btn" :class="{ active: view === 'doc' }" @click="view = 'doc'">
          <text class="view-text">版式文档</text>
        </view>
        <view
          v-if="canManageTree"
          class="view-btn"
          :class="{ active: view === 'msg' }"
          @click="view = 'msg'"
        >
          <text class="view-text">祖谱消息</text>
        </view>
      </view>

      <view v-if="view === 'pedigree'">
      <!-- 上游未认祖提示：原①段「世系链」空态文案**逐字保留**（①段镜像卡片列表已按 2026-10-16 裁定
           并入②段图谱，不再重复列出；本行留作认祖入口的提示，避免该提示静默消失） -->
      <view v-if="!upstreamMirrors.length" class="segment seg-note">
        <text class="seg-hint">
          该祖谱未认祖世本：请在本祖谱始祖节点发起「认祖（挂到中华世本）」。
        </text>
      </view>

      <!-- ② 中部：本宗自有世代（真实数据，可编辑/续编）——图示 = **全树根构图**：
           上游世本镜像段 + 本宗自有世代 + 下游支系登记镜像在**同一张图**上连成一条链（承上启下可见） -->
      <view class="segment">
        <view class="seg-head">
          <text class="seg-title">本宗自有世代</text>
          <text class="seg-count">自有 {{ ownCount }} 人 · 镜像 {{ allMirrors.length }} · 合计 {{ totalCount }}</text>
        </view>
        <text class="seg-hint">
          自有世代是本宗真实数据（可编辑、可续编、可被普通家族树认祖）；祖谱人数不计入世本统计。
        </text>
        <!-- 三类节点图例：同一张图上按卡面角标区分；只读镜像与可编辑自有节点的点击行为不同 -->
        <view class="pedigree-legend">
          <text class="legend-item">上游镜像（世本/上层）· 只读 · 点开真身档案</text>
          <text class="legend-item">本宗自有世代 · 可编辑</text>
          <text class="legend-item">下游支系登记镜像 · 只读 · 点卡面「📂 打开…」进支系（右键/长按同）</text>
        </view>
        <view v-if="info?.founder_handle" class="seg-actions">
          <t-button size="small" variant="outline" theme="primary" @click="openOwnFounder">
            📄 本宗支系入口节点档案
          </t-button>
        </view>
        <!-- tree-manage：本段节点档案内启用「谱系管理」（加父 / 加子 / 加配偶 / 批量添加子孙）；
             @tree-changed：谱系结构变动后刷新本祖谱信息（自有/镜像人数等）。
             node-annotations：图上三类节点的来源/人数角标 + 下游登记镜像的次级入口（支系首页） -->
        <TreePedigree
          :tree-id="treeId"
          default-layout="vertical"
          tree-manage
          :key-markers="keyMarkers"
          :node-annotations="nodeAnnotations"
          @tree-changed="load"
        />
        <!-- 图下方：原③段计数文案与原③段空态文案**逐字保留**（③段条目并入图谱后不再重复列出） -->
        <view class="seg-foot">
          <text class="foot-line">支系 {{ branches.length }} 支 · 登记镜像 {{ registrationMirrors.length }}</text>
          <text v-if="!branches.length && !registrationMirrors.length" class="foot-line">暂无家族树认本祖谱为祖。</text>
          <text v-else class="foot-line">支系家族树与其始祖登记镜像已并入上方图谱；支系首页入口 = 图上该登记镜像节点卡面的「📂 打开〈树名〉」入口（右键 / 长按菜单同）。</text>
        </view>
        <!-- 兜底：数据上存在但**画不进图谱**的只读条目（如被「配偶姻亲根」规则排除的孤立占位镜像，
             或认祖指向本祖谱但自有段无登记镜像的支系）——两个入口不静默消失 -->
        <view v-if="offGraphEntries.length" class="off-graph">
          <text class="off-graph-title">未画进图谱的只读条目（{{ offGraphEntries.length }}）</text>
          <view
            v-for="r in offGraphEntries"
            :key="r.key"
            class="branch-row"
            @click="r.kind === 'mirror' ? openUpperPerson(r.mirror) : goBranch(r.branch)"
          >
            <view class="branch-body">
              <text class="branch-name">{{ r.name }}</text>
              <!-- 支系始祖姓名（原③段支系行内可见；2026-10-16 缺陷修正：并入图谱后该姓名一度全页无显示面） -->
              <text v-if="r.founderText" class="branch-founder">{{ r.founderText }}</text>
              <text class="branch-sub">{{ r.sub }}</text>
            </view>
            <text class="branch-arrow">›</text>
          </view>
        </view>
      </view>
      </view>

      <!-- 版式文档（占位：祖谱版式文档尚未开放） -->
      <view v-else-if="view === 'doc'" class="doc-placeholder">
        <text class="doc-ph-title">版式文档</text>
        <text class="doc-ph-text">祖谱版式文档（印刷版式 / 排版导出）尚未开放，敬请期待。</text>
      </view>

      <!-- 祖谱消息（审批入口）：复用 family-messages，文案按层级 = 「祖谱消息」 -->
      <view v-else class="clan-msg-body">
        <FamilyMessages :tree-id="treeId" level="clan" />
      </view>
    </template>

    <!-- 编辑祖谱信息弹窗（字段与普通家族树首页一致；PUT /tree-meta） -->
    <view v-if="showEdit" class="modal-mask" @click="showEdit = false">
      <view class="modal" @click.stop>
        <text class="modal-title">编辑祖谱信息</text>
        <view class="form-item">
          <text class="label">祖谱名称</text>
          <input v-model="editForm.display_title" class="input" placeholder="如：季氏祖谱" />
        </view>
        <!-- 谱名**已从本表单移出**（Kevin 2026-10-12 拍定，与家族树页同口径）：改名统一走本页
             【修改谱名】按钮 + 共享弹窗（含本次消耗明示），本表单不再有该字段、提交载荷亦不带
             `genealogy_name`（后端通用路由收到异值会 400，防绕过计费） -->
        <!-- 文献地址（tree-meta.archive_url）：**只在编辑祖谱信息弹窗内**（原①段本无此卡，页头不渲染 ——
             派单方 2026-10-16 裁定：页头那行属新增可见元素，非「原位保留」⇒ 撤回） -->
        <view class="form-item">
          <text class="label">文献地址（线上网盘 uri）</text>
          <input v-model="editForm.archive_url" class="input" placeholder="如：https://pan.baidu.com/s/xxxx" />
        </view>
        <view class="form-item">
          <text class="label">祠堂名（堂号 / 宗祠）</text>
          <input v-model="editForm.hall_name" class="input" placeholder="如：季氏宗祠" />
        </view>
        <view class="form-item">
          <text class="label">发源地</text>
          <!-- 契约 v2 C8′：发源地 = 由本树始祖三代内**某节点的出生地**人工指定（不再直接选行政区划） -->
          <OriginPicker :tree-id="treeId" @updated="onOriginUpdated" />
        </view>
        <view class="form-item">
          <text class="label">简介</text>
          <textarea v-model="editForm.description" class="textarea" placeholder="祖谱简介" />
        </view>
        <view v-if="editError" class="edit-error">{{ editError }}</view>
        <view class="modal-actions">
          <t-button theme="primary" block :loading="saving" @click="saveEdit">保存</t-button>
          <t-button variant="text" block @click="showEdit = false">取消</t-button>
        </view>
      </view>
    </view>

    <!-- 修改谱名弹窗（**共享组件**：与家族树页在线文谱工具条复用同一套 UI + 提交逻辑） -->
    <RenameGenealogyModal
      v-if="showRename"
      :tree-id="treeId"
      :current-name="renameCurrentName"
      :fee-pieces="renameFeePieces"
      @close="showRename = false"
      @renamed="onGenealogyRenamed"
    />

    <!-- 人物档案（镜像节点 → 打开真身档案；自有节点 → 常规档案） -->
    <PersonDetailModal ref="archiveModal" />
  </view>
</template>

<script setup lang="ts">
/**
 * 祖谱首页（docs/clan-tree.spec.md §3-5 / §7 P4；2026-10-16 派单方裁定后版式）：
 *   ① 顶端「世系链（世本镜像段 · 只读）」的**镜像卡片列表不再单独渲染**——上游世本镜像段 +
 *      本宗自有世代 + 下游支系登记镜像**并入同一张谱系图**（②段图谱 = 全树根构图，见
 *      `business/pedigree.ts` 的 `treeKind==='clan'` 分面）⇒「承上启下」在页面上是一条可见的链。
 *      ①段的「只读 · 来源树」语义落到图上镜像节点的卡面角标（如「中华世本 · 只读」）；①段空态
 *      文案（未认祖世本的提示）原位保留在图上方。
 *   ② 中部「本宗自有世代」—— 真实数据，可编辑/续编（树图复用 TreePedigree，`tree-manage` 只对自有节点生效；
 *      镜像节点点击一律打开真身档案、本层只读）。图下方保留原③段计数与空态文案，并兜底列出「画不进图谱」
 *      的只读条目（入口不静默消失）。
 *   ③ 底部「支系入口列表」的**卡片列表不再单独渲染**——各支系由其在自有段的**登记镜像节点**表示在图上；
 *      支系**打开入口**落到该节点的**卡面可见入口 chip**（「📂 打开〈树名〉」；点它 = 进该支系家族树首页，
 *      主点击仍是「打开真身档案」，与只读镜像口径一致）+ 同入口的**右键 / 长按菜单**（第二条路径；旧口径
 *      只有右键 ⇒ iOS Safari H5 不可达，2026-10-16 裁定为缺陷必修），
 *      支系**人数统计**落到该节点的卡面角标（形如「季氏费县白露家族 · 59 人 · 只读」）。
 * 路由：/z/<tree_id>（App.vue 解析）；数据：GET /admin/clan-info
 * 统计口径：祖谱人数不计入世本；普通树人数不计入祖谱。
 * ⚠️ 两处**数据源/句柄口径**（2026-10-16 缺陷修正，勿回退）：
 *   ① 支系登记镜像 = `clanRegistrationMirrors(ownPeople, …)`（**本祖谱自有段 people** + tree-meta kind），
 *      **不是** `clanInfo.mirrors`（后者只含顶端世本镜像段 ⇒ 真源上登记镜像恒为空）；
 *   ② 「某支系是否已画进图谱」= 比对**登记镜像自身 handle**（祖谱 handle 集），
 *      **不是** `ClanBranch.founder_handle`（家族树内真身的 handle，恒不命中）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { fetchClanInfo, openTreeHome, updateTreeMeta, fetchTreeMetaRemote, fetchMyAnchor, fetchPerson, fetchPersonList, fetchFamilyList, treeKindOf, buildPedigreeForest, flattenForest } from '@/business';
import { clanRegistrationMirrors, buildClanNodeAnnotations, buildClanOffGraphEntries, clanAnchorTextOf } from '@/business/pedigree';
import type { PedigreeNodeAnnotation, ClanRegistrationMirror, ClanOffGraphRow } from '@/business/pedigree';
import type { ClanInfo, ClanMirrorNode, ClanBranch, FamilySummary } from '@/business/api';
import type { PersonSummary, TreeEntry, SetTreeOriginResult } from '@/business/types';
import { authState, isAuthenticated, getAuthToken } from '@/business/auth';
import { canManageRevision as canManageRevisionOf } from '@/business/revision';
import { setDynamicTitle } from '@/business/seo';
import TreePedigree from '@/components/tree-pedigree/tree-pedigree.vue';
import PersonDetailModal from '@/components/person-detail-modal/person-detail-modal.vue';
import FamilyMessages from '@/components/family-messages/family-messages.vue';
import OriginPicker from '@/components/origin-picker/origin-picker.vue';
import RenameGenealogyModal from '@/components/rename-genealogy-modal/rename-genealogy-modal.vue';

const props = defineProps<{ treeId: string }>();

const archiveModal = ref<InstanceType<typeof PersonDetailModal> | null>(null);

const info = ref<ClanInfo | null>(null);
const loading = ref(true);
const error = ref('');

// ---- 视图切换与功能入口（与普通家族树首页对齐） ----
/** 血脉图示（默认）/ 版式文档（占位）/ 祖谱消息（管理权限） */
const view = ref<'pedigree' | 'doc' | 'msg'>('pedigree');
/** 祖谱消息入口可见性：chief_editor 全局；tree_steward 仅本祖谱（锚点树 == 本树） */
const canManageTree = ref(false);
/** 总编辑（PUT /tree-meta 限 chief_editor）→ 编辑祖谱信息入口 */
const isAdmin = computed(() => isAuthenticated() && authState.role === 'chief_editor');
/** 本祖谱 tree-meta 条目（编辑表单回填） */
const clanEntry = ref<TreeEntry | null>(null);
/**
 * tree-meta 树索引（R4 分流判据用；与 `clanEntry` 同批取自 `load()`）。
 * 取不到（请求失败）→ 空对象 ⇒ **不分流**：全部镜像回退「世系链段」（保持最简现字段行为）。
 */
const treeMetaByTree = ref<Record<string, TreeEntry>>({});
const showEdit = ref(false);
const saving = ref(false);
const editError = ref('');
/** 谱名**不在本表单内**（Kevin 2026-10-12 拍定，与家族树页同口径）：改名走本页【修改谱名】按钮 +
 *  共享弹窗；提交载荷亦不带 `genealogy_name`（后端通用路由收到异值会 400，防绕过计费） */
const editForm = ref({ display_title: '', archive_url: '', hall_name: '', description: '' });

// ---- 修改谱名（共享弹窗 `rename-genealogy-modal`；口径与家族树页【在线文谱】工具条同规则同价） ----
/** 弹窗开合 */
const showRename = ref(false);
/** 入口可见性 = **家族树页同规则**（纯前端单点判据 `canManageRevision(role, treeId)`） */
const canRenameGenealogy = computed(() => canManageRevisionOf(authState.role, props.treeId));
/** 当前谱名（tree-meta entry 的 `genealogy_name`；缺失回退 clan-info 的展示值）—— 共享弹窗入参 */
const renameCurrentName = computed(() =>
  (clanEntry.value?.genealogy_name || info.value?.genealogy_name || '').trim(),
);
/** 本次消耗（tree-meta entry 的 `rename_fee_pieces`；**缺失 / 未加载 / 非法 ⇒ `null` ⇒ 不显价格行**） */
const renameFeePieces = computed<number | null>(() => {
  const fee = clanEntry.value?.rename_fee_pieces;
  return typeof fee === 'number' && Number.isFinite(fee) && fee >= 0 ? fee : null;
});

/** 打开修改谱名弹窗（弹窗本体 = 共享组件；价格与当前谱名取自本页已读的 tree-meta 条目） */
function openRename() {
  showRename.value = true;
}

/**
 * 改名成功（共享弹窗 `@renamed`）⇒ **重取 tree-meta / clan-info**（`load()`）刷新头部「谱名：…」
 * 展示行；读失败按 `load()` 既有失败面处理（不静默吞）。
 */
async function onGenealogyRenamed() {
  showRename.value = false;
  await load();
}

/**
 * 打开编辑弹窗（字段：祖谱名称/文献地址/祠堂名/简介；**发源地不在本表单内** —— 由弹窗内的
 * `OriginPicker` 走 `POST /admin/set-tree-origin` 单独指定并即时落库，契约 v2 C8′）。
 * **谱名亦不在本表单内**（Kevin 2026-10-12 拍定，与家族树页同口径）：改名走本页【修改谱名】按钮 +
 * 共享弹窗 ⇒ 本表单与提交载荷都不带 `genealogy_name`。
 * 表单**不含 `origin` / `origin_code`**：回传旧显示串会被 `PUT /tree-meta` 的 legacy 直写分支
 * 覆盖掉刚指定的发源地。
 */
function openEdit() {
  const e: any = clanEntry.value || {};
  editForm.value = {
    display_title: e.display_title || info.value?.title || '',
    archive_url: e.archive_url || '',
    hall_name: e.hall_name || '',
    description: e.description || '',
  };
  editError.value = '';
  showEdit.value = true;
}

/**
 * 发源地指定成功（`OriginPicker` 内部已重拉候选）→ 就地刷新本地祖谱元条目。
 * 后端已即时落库；本表单**不回传**发源地，故此处只作展示缓存。本页 hero 原不展示发源地，无展示改动。
 */
function onOriginUpdated(r: SetTreeOriginResult) {
  if (clanEntry.value) {
    clanEntry.value = { ...clanEntry.value, origin: r.origin, origin_code: r.origin_code };
  }
}

/** 管理权限判定（口径与普通家族树首页一致：chief_editor 全局 / 本树 tree_steward） */
async function loadManageRights() {
  if (!isAuthenticated()) {
    canManageTree.value = false;
    return;
  }
  if (authState.role === 'chief_editor') {
    canManageTree.value = true;
    return;
  }
  try {
    const anchor = await fetchMyAnchor(getAuthToken());
    canManageTree.value = !!anchor && anchor.tree_id === props.treeId;
  } catch {
    canManageTree.value = false;
  }
}

/** 保存祖谱信息（复用现有 updateTreeMeta；成功后就地刷新祖谱信息） */
async function saveEdit() {
  const token = getAuthToken();
  if (!token) {
    editError.value = '登录已过期，请重新登录';
    return;
  }
  saving.value = true;
  editError.value = '';
  try {
    await updateTreeMeta(token, { tree_id: props.treeId, ...editForm.value });
    showEdit.value = false;
    uni.showToast({ title: '保存成功', icon: 'success' });
    await load();
  } catch (e: any) {
    editError.value = e?.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

/**
 * 镜像段全部节点（后端 `clanInfo.mirrors`）。
 * ⚠️ 口径（2026-10-16 缺陷修正）：后端该字段 = `clanMirrorNodes(tree, master_tree_id)`
 * = **只含顶端世本镜像段**（`external_tree === 世本 tree_id`，或句柄口径 `mir_<真身handle>`）；
 * **自有段支系登记镜像不在其中** —— 后者改由 `clanRegistrationMirrors(ownPeople, …)` 从
 * **本祖谱自有段 people** 现算（见 `registrationMirrors`）。本字段**只**作顶端段用。
 */
const allMirrors = computed(() => info.value?.mirrors || []);

/** 树展示名（tree-meta；取不到 → tree_id 原样） */
function treeTitleOf(treeId: string): string {
  const id = String(treeId || '').trim();
  return treeMetaByTree.value[id]?.display_title || id;
}

/** 本祖谱自有 people（与 keyMarkers 同一次拉取；登记镜像「挂靠落点」与「是否已画进图谱」判定用） */
const ownPeople = ref<PersonSummary[]>([]);
/** 本祖谱自有 families（父子边；同上） */
const clanFamilies = ref<FamilySummary[]>([]);

/**
 * 目标树是否为**普通家族树**（判据 = tree-meta 的 `kind`，经既有 `treeKindOf`；**不在本页另造第三套**）。
 * 缺该条 tree-meta（含 meta 整个取不到）⇒ false ⇒ 该镜像不算支系入口（回退：不给支系落点）。
 */
function isFamilyTree(treeId: string): boolean {
  const id = String(treeId || '').trim();
  const entry = treeMetaByTree.value[id];
  return !!entry && treeKindOf(entry) === 'family';
}

/**
 * **支系登记镜像**（自有段上指向某普通家族树始祖真身的只读登记节点；一条登记 = 一个入口）。
 * 数据源 = **本祖谱自有段 people**（`ownPeople`）+ tree-meta 的 `kind`，与后端
 * `cloudfunctions/compat-api/lib/clan.js` 的 `clanBranchRegistrations()` 同口径。
 * ⚠️ **不得**取 `clanInfo.mirrors`：后者 = 顶端世本镜像段（`clanMirrorNodes(tree, master_tree_id)`），
 * 自有段登记镜像**不在其中**（真源实测：季/顾/秦三谱的 季花 / 顾清学 / 秦老太爷 均不在 `mirrors` 内）
 * ⇒ 取 `mirrors` 会让本集合**恒为空**，卡面角标 / 来源树 / 人数 / 落点 / 入口 chip 全部拿不到。
 */
const registrationMirrors = computed<ClanRegistrationMirror[]>(() =>
  clanRegistrationMirrors(ownPeople.value, isFamilyTree, props.treeId),
);
/** 顶端世本镜像段（= `clanInfo.mirrors`；后端已按 master_tree_id 单点分流 ⇒ 本页不再二次过滤） */
const upstreamMirrors = computed(() => allMirrors.value);

/* ---- 图上落点（①/③段卡片并入②段图谱后，仍**不得静默消失**的信息在此现算） ---- */

const branches = computed(() => info.value?.branches || []);
const ownCount = computed(() => info.value?.own_count ?? 0);
const totalCount = computed(() => ownCount.value + allMirrors.value.length);

/**
 * 祖谱图森林（**与 TreePedigree 同一纯函数、同一入参**：`treeKind='clan'` ⇒ 全树根构图）。
 * 本处只用于判定「某条目是否真的画进了那张图」（未上图者不重复给角标/菜单，另在图下方兜底列出）；
 * 不参与任何展示数据的改写（图谱本身由 TreePedigree 自行取数渲染）。
 */
const clanForest = computed(() =>
  buildPedigreeForest(ownPeople.value, clanFamilies.value, { treeKind: 'clan' }),
);
/** 图上已绘制节点的 handle 集合 */
const graphHandles = computed(() => new Set(flattenForest(clanForest.value).map((n) => n.handle)));

/**
 * 登记镜像的**挂靠落点**文案（原单 P-4）：落点 = 该**登记镜像节点**（祖谱内 handle）在本祖谱
 * families 里的父节点（父槽优先，缺 → 母槽；取不到 ⇒「未挂落点」）。③段条目并入图谱后本文案落到
 * 图谱节点注记行（不只藏在右键菜单里）。纯函数在 `business/pedigree.ts`（可离线自证）。
 */
function anchorTextOf(mirrorHandle: string): string {
  return clanAnchorTextOf(ownPeople.value, clanFamilies.value, mirrorHandle);
}

/** 支系行（`clanInfo.branches` 里 tree_id 命中者）—— 树名 / 人数 / 始祖姓名的取值点 */
function branchOf(treeId: string): ClanBranch | undefined {
  const id = String(treeId || '').trim();
  return branches.value.find((x) => x.tree_id === id);
}

/**
 * 图谱节点注记（传 TreePedigree 的 `nodeAnnotations`；**仅对真的画进了图**的节点给注记）。
 * 现算逻辑整体下沉到 `business/pedigree.ts` 的 `buildClanNodeAnnotations`（纯函数，可离线自证）：
 * 三类节点的图上一句话标识 + 下游登记镜像的次级信息**全部落在卡面、渲染期即算**：
 * - 上游镜像（真身在世本 / 上层祖谱）：角标 =「<来源树> · 只读」（原①段「只读 · 来源树」语义的图上落点）；
 * - 下游支系登记镜像（**判据 = 登记镜像自身 handle**）：角标 =「<支系家族树> · <N> 人 · 只读」
 *   （原③段**人数统计**的图上落点）、**始祖姓名行**「始祖：X」（原③段支系行信息的图上落点）、
 *   卡面**可见入口 chip**「📂 打开〈<支系家族树>〉」（原③段**打开入口**的图上落点；点击路由见
 *   TreePedigree 的 `chipTreeIdOfNode`）、卡面上另有挂靠落点文案（P-4）；
 * - 本宗自有世代真实节点：**无注记**（= 可编辑的那一类，`tree-manage` 只对它生效）。
 *
 * ⚠️ 入参数据（树名 / 人数 / 始祖姓名 / 落点）在**渲染期**由纯函数算出（不吃事件）
 * ⇒ 支系首页入口**不依赖右键 / 长按**即可看见并点到（iOS Safari H5 可达）；右键 / 长按菜单（同一入口的
 * 第二条路径）另在 TreePedigree 内保留。
 */
const nodeAnnotations = computed<Record<string, PedigreeNodeAnnotation>>(() =>
  buildClanNodeAnnotations({
    upstreamMirrors: upstreamMirrors.value,
    registrations: registrationMirrors.value,
    drawnHandles: graphHandles.value,
    treeTitleOf,
    branchOf,
    anchorTextOf,
  }),
);

/**
 * 数据上存在、但**画不进图谱**的只读条目（兜底列出，两个入口不静默消失；现算逻辑见
 * `business/pedigree.ts` 的 `buildClanOffGraphEntries`）：
 * - 镜像：被多根构建的「配偶姻亲根」规则排除且无人将其列为子女 ⇒ 图上到不了（如孤立占位镜像）；
 * - 支系：认祖指向本祖谱、但**自有段无登记镜像节点**（`via` 缺省那条推导路径）⇒ 图上无落点。
 * ⚠️ 支系判据 = **该支系在本祖谱内的登记镜像 handle 是否在图上**（不是 `branch.founder_handle`：
 * 那是**家族树内真身**的 handle，与祖谱 handle 集不同源 ⇒ 恒 false ⇒ 每个支系都会误落本列表，
 * 与上方「支系…已并入上方图谱」文案自相矛盾）。修后同一支系**不得**同时出现在图谱与兜底列表。
 * 正常形态（登记镜像挂在自有段父节点之下）此列表中**无支系行**。
 */
const offGraphEntries = computed<ClanOffGraphRow[]>(() =>
  buildClanOffGraphEntries({
    upstreamMirrors: upstreamMirrors.value,
    registrations: registrationMirrors.value,
    branches: branches.value,
    drawnHandles: graphHandles.value,
    treeTitleOf,
  }),
);

/**
 * 带色称号标注（传 TreePedigree 的 `keyMarkers`）：从**本祖谱自有世代 people 的 `badge`** 现算。
 * 契约 docs/person-badge.spec.md §4-1（祖谱亦显示；数据来源 = `GET /people/?profile=all` 的既有
 * `attribute_list`）。无 `称号` 的节点行为与改造前完全一致。
 */
const keyMarkers = ref<Record<string, { label: string; color?: string }>>({});

/**
 * 本祖谱自有数据现算两样（同一次拉取，失败不阻塞页面）：
 * ① `keyMarkers` = 带色称号标注（数据驱动；契约 docs/person-badge.spec.md §4-1，数据来源 = `GET /people/?profile=all`
 *    的既有 `attribute_list`）；
 * ② `ownPeople` / `clanFamilies` = 登记镜像「挂靠落点」与「是否已画进图谱」的判定数据（①/③段并入图谱后的落点现算）。
 * 失败 → 三者皆空（图谱本身由 TreePedigree 自行取数渲染，不受影响）。
 */
async function loadOwnTreeData() {
  if (!props.treeId) {
    keyMarkers.value = {};
    ownPeople.value = [];
    clanFamilies.value = [];
    return;
  }
  try {
    const [res, fams] = await Promise.all([
      fetchPersonList(props.treeId, 0, 0),
      // 家族关系读失败只影响「落点文案」，不拖垮称号标注 ⇒ 单独兜底为空
      fetchFamilyList(props.treeId).catch(() => [] as FamilySummary[]),
    ]);
    ownPeople.value = res.data;
    clanFamilies.value = fams;
    const markers: Record<string, { label: string; color?: string }> = {};
    for (const p of res.data) {
      if (p.handle && p.badge) markers[p.handle] = { label: p.badge.label, color: p.badge.color };
    }
    keyMarkers.value = markers;
  } catch {
    keyMarkers.value = {};
    ownPeople.value = [];
    clanFamilies.value = [];
  }
}

async function load() {
  if (!props.treeId) {
    error.value = '缺少 tree_id 参数';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    info.value = await fetchClanInfo(props.treeId);
    if (info.value.title) {
      uni.setNavigationBarTitle({ title: info.value.title });
      // #ifdef H5
      // 仅 H5：uni.setNavigationBarTitle 会连浏览器标签页一起改写（盖掉 mixin applySeo 的标题），此处补回「树名 + 品牌后缀」
      // 用 setDynamicTitle 三连写（立即 + nextTick + setTimeout 0）跑赢 uni-h5 同 tick 后续 flush 的覆盖
      setDynamicTitle(info.value.title);
      // #endif
    }
    // 祖谱 tree-meta 条目（编辑表单回填；读不到就以 clan-info 为准）
    try {
      const m = await fetchTreeMetaRemote();
      const trees = Object.values(m.trees) as TreeEntry[];
      treeMetaByTree.value = Object.fromEntries(trees.map((t) => [t.tree_id, t]));
      clanEntry.value = trees.find((t) => t.tree_id === props.treeId) || null;
    } catch {
      treeMetaByTree.value = {};
      clanEntry.value = null;
    }
    // 带色称号标注 + 落点判定数据（数据驱动；契约 docs/person-badge.spec.md §4-1）
    await loadOwnTreeData();
  } catch (e: any) {
    error.value = e?.message || '加载祖谱失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 镜像节点 → 打开真身档案（**方向无关**：世系链段真身在世本 / 祖谱；宗谱登记镜像真身在家族树）。
 * 本层只读，修改须到真身所在层（R3）。三段的镜像行共用本入口。
 * 口径 A：镜像指针齐备（external_mirror='true' + upper_handle + upper_tree_id）→ 传镜像指针给弹窗，
 * 由弹窗统一按 external_tree / external_person_handle 口径解析真身并加顶部标注（第 3/5 条）。
 */
function openUpperPerson(m: ClanMirrorNode) {
  if (!m.upper_handle) {
    uni.showToast({ title: '该镜像节点未记录真身 handle', icon: 'none' });
    return;
  }
  const upperTree = m.upper_tree_id || 'zhonghua';
  archiveModal.value?.open(upperTree, m.upper_handle, {
    external_mirror: 'true',
    external_person_handle: m.upper_handle,
    external_tree: upperTree,
    external_link_type: m.link_type,
  });
}

/**
 * 本宗自有支系入口节点（普通树认祖的落点）。
 * 口径 A：该节点自身也可能是镜像（认祖/跨树子女产物）→ 先取节点判定，是镜像则打开真身档案；
 * 拉取失败（404/权限/网络）时维持原行为 —— 直接打开本树副本（弹窗内不再二次解析）。
 */
async function openOwnFounder() {
  const h = info.value?.founder_handle;
  if (!h) return;
  try {
    const p = await fetchPerson(props.treeId, h);
    archiveModal.value?.open(props.treeId, h, p);
  } catch {
    archiveModal.value?.open(props.treeId, h);
  }
}

/** 支系入口：进入该普通家族树首页 */
function goBranch(b: { tree_id: string }) {
  if (!b?.tree_id) return;
  openTreeHome(b.tree_id);
}

onMounted(() => {
  load();
  loadManageRights();
});
watch(
  () => props.treeId,
  (v) => {
    if (v) load();
  },
);
</script>

<style scoped>
.clan-hall { padding: 12px 12px 32px; }

/* 编辑祖谱信息入口 */
.clan-edit-entry {
  display: inline-block; margin-top: 10px; padding: 7px 16px;
  background: #FFF3E0; border: 1px solid #E8C9A0; border-radius: 18px;
}
.clan-edit-text { font-size: 13px; color: #4E6B57; }
/* 【修改谱名】入口：与「✏️ 编辑祖谱信息」同体例、同一行（同规则同价，共享弹窗） */
.clan-rename-entry { margin-left: 8px; }

/* 左侧功能按钮（与普通家族树首页同款：固定悬浮正方按钮） */
.view-toggle {
  position: fixed; left: 10px; top: 50%; transform: translateY(-50%);
  display: flex; flex-direction: column; gap: 10px; z-index: 950;
}
/* H5 窄栏：同 tree-hall，fixed 浮层按 --jiapu-column 回收进列内 */
/* #ifdef H5 */
.view-toggle {
  left: max(10px, calc((100% - var(--jiapu-column)) / 2 + 10px));
}
/* #endif */
.view-btn {
  width: 56px; height: 56px; background: #fff; border: 1px solid #CFD8CE;
  border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  display: flex; align-items: center; justify-content: center; padding: 2px;
}
.view-text { font-size: 11px; color: #4E6B57; line-height: 1.3; text-align: center; }
.view-btn.active { background: #4E6B57; border-color: #4E6B57; }
.view-btn.active .view-text { color: #fff; }

/* 版式文档占位 */
.doc-placeholder {
  background: #FAFCF8; border: 1px dashed #CFD8CE; border-radius: 12px;
  padding: 30px 16px; text-align: center; margin-bottom: 12px;
}
.doc-ph-title { font-size: 15px; font-weight: bold; color: #4E6B57; display: block; }
.doc-ph-text { font-size: 12px; color: #6E7D70; display: block; margin-top: 8px; line-height: 1.6; }

/* 祖谱消息视图（左侧按钮留位） */
.clan-msg-body { margin-left: 8px; }

/* 编辑弹窗 */
.modal-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 86%; max-width: 380px; background: #fff; border-radius: 14px;
  padding: 24px 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
  max-height: 85vh; overflow-y: auto;
}
.modal-title { font-size: 18px; font-weight: bold; color: #2F3A33; display: block; text-align: center; margin-bottom: 18px; }
.form-item { margin-bottom: 14px; }
.label { font-size: 13px; color: #4E6B57; font-weight: bold; display: block; margin-bottom: 6px; }
.input {
  height: 42px; border: 1px solid #CFD8CE; border-radius: 8px;
  padding: 0 12px; font-size: 14px; background: #F6FAF6; width: 100%;
}
.textarea {
  min-height: 80px; border: 1px solid #CFD8CE; border-radius: 8px;
  padding: 10px 12px; font-size: 14px; background: #F6FAF6; width: 100%;
}
.edit-error { color: #C62828; font-size: 13px; text-align: center; margin-bottom: 10px; }
.modal-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }

.clan-hero {
  background: #FAFCF8;
  border: 1px solid #EFE3D3;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.clan-title { font-size: 18px; font-weight: bold; color: #2F3A33; display: block; }
.clan-meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.clan-surname { font-size: 13px; color: #4E6B57; }
.clan-genealogy { font-size: 12px; color: #6E7D70; }
.clan-notice { font-size: 12px; color: #C62828; display: block; margin-top: 8px; }

.clan-loading { text-align: center; padding: 40px 0; }
.clan-error { text-align: center; color: #C62828; font-size: 13px; padding: 24px 0; }

.segment {
  background: #FAFCF8;
  border: 1px solid #EFE3D3;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}
.seg-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.seg-title { font-size: 15px; font-weight: bold; color: #4E6B57; }
.seg-count { font-size: 12px; color: #6E7D70; }
.seg-hint { font-size: 11px; color: #6E7D70; line-height: 1.6; display: block; margin-top: 6px; }
.seg-actions { display: flex; gap: 8px; margin-top: 10px; }

/* 上游未认祖提示块（原①段空态文案的落点；比常规 segment 轻量） */
.seg-note { padding: 8px 12px; }
.seg-note .seg-hint { margin-top: 0; }

/* 图谱三类节点图例 + 图下方说明/计数（原③段计数与空态文案的落点） */
.pedigree-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.legend-item {
  font-size: 11px; color: #4E6B57; background: #F1F6F2;
  border: 1px solid #EFE3D3; border-radius: 10px; padding: 2px 8px;
}
.seg-foot { margin-top: 10px; }
.foot-line { font-size: 11px; color: #6E7D70; line-height: 1.6; display: block; }

/* 未画进图谱的只读条目（兜底入口：镜像 → 真身档案；支系 → 家族树首页） */
.off-graph { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #EFE3D3; }
.off-graph-title { font-size: 11px; color: #6E7D70; display: block; margin-bottom: 4px; }

.branch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 2px;
  border-bottom: 1px solid #F3EBE0;
}
.branch-row:last-child { border-bottom: none; }
.branch-body { flex: 1; min-width: 0; }
.branch-name { font-size: 14px; font-weight: bold; color: #2F3A33; display: block; }
.branch-founder { font-size: 12px; color: #4E6B57; display: block; margin-top: 4px; }
.branch-sub { font-size: 11px; color: #6E7D70; display: block; margin-top: 4px; }
.branch-arrow { font-size: 16px; color: #C7B299; }

/* ---- 夜间模式（html[data-theme='dark']）：祖谱页外壳（页头卡 / 三段 segment / 图例 /
   版式文档占位 / 左侧浮动按钮 / 编辑弹窗）；选中与主色态一律 #D9A96B。
   只改颜色，不改几何（T3：两态 rect 差 ≤0.5px）。H5 条件编译 ⇒ 小程序零改动。 */
/* #ifdef H5 */
html[data-theme='dark'] .clan-edit-entry {
  background: #2A3631;
  border-color: #5C6E63;
}
html[data-theme='dark'] .clan-edit-text { color: #D9A96B; }

/* 左侧功能按钮（血脉图示 / 版式文档 / 祖谱消息） */
html[data-theme='dark'] .view-btn {
  background: #232E2B;
  border-color: #36453F;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}
html[data-theme='dark'] .view-text { color: #D9A96B; }
html[data-theme='dark'] .view-btn.active {
  background: #D9A96B;
  border-color: #D9A96B;
}
html[data-theme='dark'] .view-btn.active .view-text { color: #1B2422; }

/* 版式文档占位（空态） */
html[data-theme='dark'] .doc-placeholder {
  background: #232E2B;
  border-color: #42524B;
}
html[data-theme='dark'] .doc-ph-title { color: #D9A96B; }
html[data-theme='dark'] .doc-ph-text { color: #7A8B83; }

/* 页头卡 */
html[data-theme='dark'] .clan-hero {
  background: #232E2B;
  border-color: #36453F;
}
html[data-theme='dark'] .clan-title { color: #DFE9E4; }
html[data-theme='dark'] .clan-surname { color: #D9A96B; }
html[data-theme='dark'] .clan-genealogy { color: #7A8B83; }
html[data-theme='dark'] .clan-notice { color: #E0675F; }
html[data-theme='dark'] .clan-error { color: #E0675F; }

/* 三段 segment 卡 */
html[data-theme='dark'] .segment {
  background: #232E2B;
  border-color: #36453F;
}
html[data-theme='dark'] .seg-title { color: #D9A96B; }
html[data-theme='dark'] .seg-count { color: #7A8B83; }
html[data-theme='dark'] .seg-hint { color: #7A8B83; }
html[data-theme='dark'] .legend-item {
  color: #D9A96B;
  background: #2A3631;
  border-color: #42524B;
}
html[data-theme='dark'] .foot-line { color: #7A8B83; }
html[data-theme='dark'] .off-graph { border-top-color: #42524B; }
html[data-theme='dark'] .off-graph-title { color: #7A8B83; }
html[data-theme='dark'] .branch-row { border-bottom-color: #36453F; }
html[data-theme='dark'] .branch-name { color: #DFE9E4; }
html[data-theme='dark'] .branch-founder { color: #D9A96B; }
html[data-theme='dark'] .branch-sub { color: #7A8B83; }
html[data-theme='dark'] .branch-arrow { color: #7A8B83; }

/* 编辑祖谱信息弹窗 */
html[data-theme='dark'] .modal {
  background: #232E2B;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55);
}
html[data-theme='dark'] .modal-title { color: #DFE9E4; }
html[data-theme='dark'] .label { color: #D9A96B; }
html[data-theme='dark'] .input,
html[data-theme='dark'] .textarea {
  background: #1E2825;
  border-color: #36453F;
  color: #DFE9E4;
}
html[data-theme='dark'] .edit-error { color: #E0675F; }

/* 树图浮层（由子组件 tree-pedigree 渲染，故用 :deep 从本宿主落色；**不改该组件文件**）：
   统计条 / ＋－⟳ 缩放圆钮 / 右侧「纵向·横向·迁徙地图」图例栏 / 图下提示 / 加载空态。只改颜色。 */
html[data-theme='dark'] .clan-hall :deep(.stats) {
  background: #1E2825;
  border-color: #36453F;
  color: #DFE9E4;
}
html[data-theme='dark'] .clan-hall :deep(.stats .stat) { color: #DFE9E4; }
html[data-theme='dark'] .clan-hall :deep(.stat.stat-hint) { color: #D9A96B; }
html[data-theme='dark'] .clan-hall :deep(.hint) { color: #7A8B83; }
html[data-theme='dark'] .clan-hall :deep(.loading),
html[data-theme='dark'] .clan-hall :deep(.empty) { color: #7A8B83; }
html[data-theme='dark'] .clan-hall :deep(.error) { color: #E0675F; }
html[data-theme='dark'] .clan-hall :deep(.zoom-btn),
html[data-theme='dark'] .clan-hall :deep(.layout-btn) {
  background: #232E2B;
  border-color: #36453F;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}
html[data-theme='dark'] .clan-hall :deep(.zoom-icon),
html[data-theme='dark'] .clan-hall :deep(.layout-name) { color: #D9A96B; }
html[data-theme='dark'] .clan-hall :deep(.layout-btn.active) {
  background: #D9A96B;
  border-color: #D9A96B;
}
html[data-theme='dark'] .clan-hall :deep(.layout-btn.active .layout-name) { color: #1B2422; }
/* #endif */
</style>
