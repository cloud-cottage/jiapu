<template>
  <view class="iv-page">
    <!-- 邀请头：`<邀请人昵称> 邀请你加入『<谱名>』` +（node 型）`建议绑定：<节点名>` -->
    <view class="iv-head">
      <text class="iv-title">{{ headTitle }}</text>
      <text v-if="suggestedLine" class="iv-suggest">{{ suggestedLine }}</text>
      <text v-if="hintLine" class="iv-hint">{{ hintLine }}</text>
    </view>

    <view v-if="loading" class="iv-loading">
      <t-loading theme="spinner" text="加载中…" />
    </view>

    <!-- 无码（普通型落地）/ 无效码 / 过期 / 已用尽：友好提示 + 仍允许注册（不阻断） -->
    <view v-else-if="noCode || invalid" class="iv-card">
      <text class="iv-card-title">{{ noCode ? INVITE_NO_CODE_TITLE : INVITE_INVALID_TITLE }}</text>
      <text class="iv-card-hint">{{ noCode ? INVITE_NO_CODE_HINT : invalidText }}</text>
      <view
        v-if="noCode ? !authed : true"
        class="iv-btn iv-btn-primary"
        @click="noCode ? goLogin() : goRegister()"
      >
        <text class="iv-btn-text">{{ noCode ? INVITE_BTN_LOGIN : INVITE_BTN_REGISTER }}</text>
      </view>
    </view>

    <template v-else>
      <!-- 未登录：先引导登录 / 注册（复用现有登录页；登录成功后该页 navigateBack 回本页，onShow 继续） -->
      <view v-if="!authed" class="iv-card">
        <text class="iv-card-hint">{{ INVITE_GUEST_HINT }}</text>
        <view class="iv-btn iv-btn-primary" @click="goLogin">
          <text class="iv-btn-text">{{ INVITE_BTN_LOGIN }}</text>
        </view>
      </view>

      <!-- 整棵家族树（只读；持邀请码 ⇒ 服务端不裁剪，D6）→ 高亮建议节点（focus-handle + focus-label） -->
      <TreePedigree
        v-if="treeId"
        :tree-id="treeId"
        :invite-code="code"
        :tree-manage="false"
        :focus-handle="suggestedHandle"
        :focus-label="INVITE_SUGGEST_MARK"
      />

      <!-- 三选（登录后；三按钮逐字 = 单点文案） -->
      <view v-if="authed && !doneText" class="iv-acts">
        <view
          class="iv-btn iv-btn-primary"
          :class="{ 'is-off': busy || !canAccept }"
          @click="onAccept"
        >
          <text class="iv-btn-text">{{ INVITE_BTN_ACCEPT }}</text>
        </view>
        <view class="iv-btn" :class="{ 'is-off': busy }" @click="openReplace">
          <text class="iv-btn-text">{{ INVITE_BTN_REPLACE }}</text>
        </view>
        <view class="iv-btn" :class="{ 'is-off': busy }" @click="onSkip">
          <text class="iv-btn-text">{{ INVITE_BTN_SKIP }}</text>
        </view>
        <text v-if="acceptBlockedReason" class="iv-reason">{{ acceptBlockedReason }}</text>
        <text v-if="errText" class="iv-err">{{ errText }}</text>
      </view>

      <!-- 三选回执（绑定成功 ⇒ 可进入家族页；skip ⇒ 明确告知已注册未入族） -->
      <view v-if="doneText" class="iv-card">
        <text class="iv-done">{{ doneText }}</text>
        <view v-if="boundTreeId" class="iv-btn iv-btn-primary" @click="goFamily">
          <text class="iv-btn-text">{{ INVITE_GO_FAMILY }}</text>
        </view>
      </view>

      <!-- 更换节点：复用共享 tree-picker（选树）+ 本树节点列表（搜索筛选） -->
      <view v-if="replacing" class="iv-mask" @click="closeReplace">
        <view class="iv-modal" @click.stop>
          <text class="iv-modal-title">{{ INVITE_REPLACE_TITLE }}</text>

          <text class="iv-field-label">{{ INVITE_REPLACE_TREE_LABEL }}</text>
          <TreePicker
            :items="pickerItems"
            :model-value="pickTreeId"
            :title="INVITE_REPLACE_TREE_LABEL"
            :placeholder="INVITE_REPLACE_TREE_LABEL"
            @update:model-value="onPickTree"
          />

          <template v-if="pickTreeId">
            <text class="iv-field-label">{{ INVITE_REPLACE_NODE_LABEL }}</text>
            <t-input
              :value="pickQuery"
              :placeholder="INVITE_REPLACE_SEARCH_PLACEHOLDER"
              class="iv-input"
              @update:value="(v: any) => (pickQuery = v)"
            />
            <view class="iv-node-list">
              <view
                v-for="p in pickNodes"
                :key="p.handle"
                class="iv-node"
                :class="{ selected: pickHandle === p.handle }"
                @click="pickHandle = p.handle"
              >
                <text class="iv-node-name">{{ p.name }}</text>
                <text class="iv-node-id">{{ personIdDisplay(p.gramps_id) }}</text>
              </view>
              <text v-if="!pickNodes.length" class="iv-empty">{{ INVITE_REPLACE_EMPTY }}</text>
            </view>
          </template>

          <text v-if="errText" class="iv-err">{{ errText }}</text>

          <view class="iv-acts">
            <view class="iv-btn" @click="closeReplace">
              <text class="iv-btn-text">{{ INVITE_CANCEL }}</text>
            </view>
            <view
              class="iv-btn iv-btn-primary"
              :class="{ 'is-off': busy || !pickHandle }"
              @click="onReplace"
            >
              <text class="iv-btn-text">{{ INVITE_REPLACE_SUBMIT }}</text>
            </view>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
/**
 * 邀请落地页（子包 `pages/invite` 的 `landing` 页；短链形态 = `#/pages/invite/landing?c=<code>`）。
 *
 * 口径（Kevin 2026-09-30 逐条拍定）：
 * - **D3** 短链 = 本页（**不做极短别名页**）；长链 = 短链 + `&invite_code=&tree_id=&person_handle=`（仅 node 型）；
 * - **D5** 双入口：节点详情页 = **node 型**（指定建议绑定节点、一次性）；【我的】页 = **plain 型**（可多次）；
 * - **D6** 落地页 **整棵家族树正常可见**（服务端按码放行、不做字段阉割）⇒ 读接口经 `invite-code` prop
 *   带 `X-Invite-Code`；无码 / 无效 / 异树 ⇒ 服务端回落既有裁剪（本页不自行裁字段）；
 * - **三选** = 【接受并绑定】/【更换节点】/【暂不绑定，仅注册】；**注册 ≠ 入族**（skip ⇒ 已登录未加入档）；
 * - 未登录 ⇒ 复用现有登录页引导（登录成功该页 `navigateBack` 回本页，`onShow` 继续；**不新写认证链路**）；
 * - 码无效 / 过期 / 已用尽 ⇒ 友好提示（后端 `reason` 原文优先）+ **仍允许【普通注册】**；
 * - 本页**全程只读**：除三选提交（`POST /invite/bind`）外不发任何写请求；文案一律取
 *   `business/asset-text.ts` 邀请域单点，页面不散落用户可见字面。
 */
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { isAuthenticated, getAuthToken } from '@/business/auth';
import {
  resolveInviteCode,
  bindInvite,
  fetchPersonList,
  fetchTreeMetaRemote,
  treeKindLabel,
  openTreeHome,
} from '@/business';
import type { InviteResolveResult, InviteDecision } from '@/business';
import type { PersonSummary } from '@/business/types';
import { personIdDisplay, treeDisplayLabel } from '@/business/format';
import TreePedigree from '@/components/tree-pedigree/tree-pedigree.vue';
import TreePicker from '@/components/tree-picker/tree-picker.vue';
import {
  INVITE_ACCEPT_BLOCKED_BOUND,
  INVITE_ACCEPT_BLOCKED_NONE,
  INVITE_BTN_ACCEPT,
  INVITE_BTN_LOGIN,
  INVITE_BTN_REGISTER,
  INVITE_BTN_REPLACE,
  INVITE_BTN_SKIP,
  INVITE_CANCEL,
  INVITE_GO_FAMILY,
  INVITE_GUEST_HINT,
  INVITE_INVALID_HINT,
  INVITE_INVALID_TITLE,
  INVITE_NODE_HINT,
  INVITE_NO_CODE_HINT,
  INVITE_NO_CODE_TITLE,
  INVITE_PLAIN_HINT,
  INVITE_REPLACE_EMPTY,
  INVITE_REPLACE_NODE_LABEL,
  INVITE_REPLACE_SEARCH_PLACEHOLDER,
  INVITE_REPLACE_SUBMIT,
  INVITE_REPLACE_TITLE,
  INVITE_REPLACE_TREE_LABEL,
  INVITE_SKIP_DONE,
  INVITE_SUGGEST_MARK,
  inviteBoundDone,
  inviteErrorText,
  inviteHeadTitle,
  inviteSuggestedLine,
} from '@/business/asset-text';

/** 邀请码（`?c=`）；无码 ⇒ 普通型落地（`noCode`，仍可注册） */
const code = ref('');
/** 无 `c`（含只带 `invite_code` 的普通型长链、或空参）⇒ 无码可解析、无树可展示，但**不阻断注册** */
const noCode = ref(false);
const loading = ref(true);
const invalid = ref(false);
const invalidText = ref('');
const resolved = ref<InviteResolveResult | null>(null);
const authed = ref(false);
const busy = ref(false);
const errText = ref('');
/** 三选回执（非空 ⇒ 已处理，按钮区收起） */
const doneText = ref('');
/** 绑定成功后要进入的家族树（`anchor.tree_id` 优先） */
const boundTreeId = ref('');

const treeId = computed(() => (resolved.value?.valid ? resolved.value.tree_id || '' : ''));
const suggestedHandle = computed(() => resolved.value?.person_handle || '');
const headTitle = computed(() =>
  inviteHeadTitle(resolved.value?.inviter_nickname || '', resolved.value?.tree_name || ''),
);
const suggestedLine = computed(() => inviteSuggestedLine(resolved.value?.person_name || ''));
const hintLine = computed(() => {
  if (!resolved.value) return '';
  return resolved.value.kind === 'node' ? INVITE_NODE_HINT : INVITE_PLAIN_HINT;
});
/** 【接受并绑定】可用判据：node 型且建议节点当前仍可绑（`can_bind !== false`） */
const canAccept = computed(() => !!suggestedHandle.value && resolved.value?.can_bind !== false);
/** 【接受并绑定】不可用时的原因行（**必显，不得静默**） */
const acceptBlockedReason = computed(() => {
  if (!authed.value || doneText.value) return '';
  if (!suggestedHandle.value) return INVITE_ACCEPT_BLOCKED_NONE;
  if (resolved.value?.can_bind === false) return INVITE_ACCEPT_BLOCKED_BOUND;
  return '';
});

// ---- 更换节点（复用 tree-picker 选树 + 本树节点列表选择） ----
const replacing = ref(false);
const pickTreeId = ref('');
const pickQuery = ref('');
const pickHandle = ref('');
const pickPeople = ref<PersonSummary[]>([]);
const pickerTrees = ref<Array<{ tree_id: string; display_title: string; surname_char: string; kind?: string }>>([]);
const pickerItems = computed(() =>
  pickerTrees.value.map((t) => ({
    tree_id: t.tree_id,
    label: treeDisplayLabel(t.display_title, t.surname_char),
    group: treeKindLabel(t.kind),
  })),
);
/** 节点列表（本地筛选；姓名 / 编号子串） */
const pickNodes = computed(() => {
  const q = pickQuery.value.trim().toLowerCase();
  if (!q) return pickPeople.value;
  return pickPeople.value.filter((p) => `${p.name} ${p.gramps_id}`.toLowerCase().includes(q));
});

onLoad((options: any) => {
  const c = String(options?.c || '').trim();
  code.value = c;
  // 无 `c`（只带 `invite_code` 的普通型长链 / 空参）⇒ 普通型落地：不调 resolve、不渲染树，仍可登录 / 注册
  noCode.value = !c;
  if (noCode.value) {
    loading.value = false;
    authed.value = isAuthenticated();
    return;
  }
  void load();
});

/** 登录页 `navigateBack` 回本页后（onShow）重取登录态，继续三选 */
onShow(() => {
  authed.value = isAuthenticated();
});

async function load(): Promise<void> {
  loading.value = true;
  errText.value = '';
  try {
    const r = await resolveInviteCode(code.value);
    resolved.value = r;
    invalid.value = !r.valid;
    invalidText.value = r.valid ? '' : r.reason || INVITE_INVALID_HINT;
  } catch (e) {
    invalid.value = true;
    invalidText.value = inviteErrorText(e, INVITE_INVALID_HINT);
  } finally {
    loading.value = false;
    authed.value = isAuthenticated();
  }
}

/** 三选提交（accept / replace / skip）——**本页唯一的写请求**；错误按状态码给域内文案（409 / 404 / 400） */
async function decide(decision: InviteDecision, targetTree = '', targetHandle = ''): Promise<void> {
  if (busy.value) return;
  if (!authed.value) {
    goLogin();
    return;
  }
  busy.value = true;
  errText.value = '';
  try {
    const payload: { c: string; decision: InviteDecision; tree_id?: string; person_handle?: string } = {
      c: code.value,
      decision,
    };
    if (decision === 'replace') {
      payload.tree_id = targetTree;
      payload.person_handle = targetHandle;
    }
    const res = await bindInvite(payload, getAuthToken());
    boundTreeId.value = res.anchor?.tree_id || treeId.value;
    doneText.value = res.bound ? inviteBoundDone(resolved.value?.tree_name || '') : INVITE_SKIP_DONE;
    replacing.value = false;
  } catch (e) {
    errText.value = inviteErrorText(e);
  } finally {
    busy.value = false;
  }
}

function onAccept(): void {
  if (!canAccept.value) return;
  void decide('accept');
}

function onSkip(): void {
  void decide('skip');
}

async function openReplace(): Promise<void> {
  if (busy.value) return;
  errText.value = '';
  pickTreeId.value = treeId.value;
  pickQuery.value = '';
  pickHandle.value = '';
  pickPeople.value = [];
  replacing.value = true;
  if (!pickerTrees.value.length) {
    try {
      const meta = await fetchTreeMetaRemote();
      pickerTrees.value = Object.values(meta.trees || {});
    } catch (e) {
      errText.value = inviteErrorText(e, INVITE_REPLACE_EMPTY);
    }
  }
  if (pickTreeId.value) await loadPickPeople(pickTreeId.value);
}

function closeReplace(): void {
  replacing.value = false;
}

async function onPickTree(treeIdPicked: string): Promise<void> {
  pickTreeId.value = treeIdPicked;
  pickQuery.value = '';
  pickHandle.value = '';
  await loadPickPeople(treeIdPicked);
}

/** 读候选节点：邀请树带码（整树可见），别的树按既有读规则（**不带**该头） */
async function loadPickPeople(targetTree: string): Promise<void> {
  pickPeople.value = [];
  try {
    const res = await fetchPersonList(targetTree, 0, 0, targetTree === treeId.value ? code.value : '');
    pickPeople.value = res.data;
  } catch (e) {
    errText.value = inviteErrorText(e, INVITE_REPLACE_EMPTY);
  }
}

function onReplace(): void {
  if (!pickHandle.value) return;
  void decide('replace', pickTreeId.value, pickHandle.value);
}

function goLogin(): void {
  uni.navigateTo({ url: '/pages/login/index' });
}

function goRegister(): void {
  uni.navigateTo({ url: '/pages/register/index' });
}

function goFamily(): void {
  openTreeHome(boundTreeId.value || treeId.value);
}
</script>

<style scoped>
.iv-page { padding: 16px; padding-bottom: 40px; }
.iv-head { margin-bottom: 12px; }
.iv-title { display: block; font-size: 16px; font-weight: bold; color: #3E2723; line-height: 1.6; }
.iv-suggest { display: block; font-size: 13px; color: #8B4513; margin-top: 6px; font-weight: bold; }
.iv-hint { display: block; font-size: 11px; color: #B5A594; line-height: 1.7; margin-top: 6px; }

.iv-loading { padding: 60px 0; text-align: center; }

.iv-card {
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE; border-radius: 12px; padding: 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05); margin-bottom: 12px;
}
.iv-card-title { display: block; font-size: 15px; font-weight: bold; color: #3E2723; }
.iv-card-hint { display: block; font-size: 12px; color: #B08D57; line-height: 1.7; margin: 6px 0 12px; }

.iv-acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; }
.iv-btn {
  padding: 8px 16px; border-radius: 8px; text-align: center;
  background: #FBF8F5; border: 1px solid #E0D6CB;
}
.iv-btn-primary { background: linear-gradient(180deg, #EFA9B4, #C4747F); border-color: #C4747F; }
.iv-btn-primary .iv-btn-text { color: #FFF6F8; }
.iv-btn.is-off { opacity: 0.5; }
.iv-btn-text { font-size: 14px; color: #5D4037; }
.iv-reason { display: block; width: 100%; font-size: 11px; color: #B08D57; line-height: 1.6; }
.iv-err { display: block; width: 100%; font-size: 12px; color: #C62828; line-height: 1.6; margin-top: 6px; }
.iv-done { display: block; font-size: 13px; color: #2E7D32; line-height: 1.7; margin-bottom: 12px; }

/* 更换节点覆盖层（自绘；遮罩 1010 / 面板 1011）——恒定低于 tree-picker 的展开选择层（1200），
   故点开「选择家族树」时选择层覆盖在面板之上；面板自身限高 86vh + 内部滚动，长列表不外溢 */
.iv-mask {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 1010;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 16px;
  overflow-y: auto;
}
.iv-modal {
  position: relative; z-index: 1011;
  width: 88%; max-width: 360px; max-height: 86vh; overflow-y: auto;
  box-sizing: border-box; padding: 16px; border-radius: 14px;
  background: linear-gradient(180deg, #FFFDF8, #F8F0E5);
  border: 1px solid #E3D3BE;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}
.iv-modal-title { display: block; font-size: 16px; font-weight: bold; color: #3E2723; margin-bottom: 10px; }
.iv-field-label { display: block; font-size: 12px; color: #8B4513; margin: 10px 0 6px; }
.iv-input { margin-bottom: 8px; }
.iv-node-list { max-height: 36vh; overflow-y: auto; border: 1px solid #EFE5D8; border-radius: 8px; background: #FFFDF8; }
.iv-node {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-bottom: 1px solid #F4EDE3;
}
.iv-node.selected { background: #F6E9D8; }
.iv-node-name { font-size: 13px; color: #3E2723; }
.iv-node-id { font-size: 11px; color: #B08D57; }
.iv-empty { display: block; font-size: 12px; color: #B5A594; padding: 12px; text-align: center; }
</style>
