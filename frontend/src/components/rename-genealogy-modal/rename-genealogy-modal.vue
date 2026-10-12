<template>
  <!-- 修改谱名弹窗（**共享组件 · 两处复用同一套**）：家族树页【在线文谱】工具条 + 祖谱页头部控制区。
       遮罩点击关闭 + 内层 `@click.stop`（仓库既有弹窗体例；**不用 `@click.self`**）。
       内容 = 当前谱名 + 输入框（预填当前谱名）+ 价格行 + 取消 / 确认。 -->
  <view class="rename-mask" @click="close">
    <view class="rename-modal" @click.stop>
      <text class="rename-title">修改谱名</text>

      <view class="rename-form-item">
        <text class="rename-label">当前谱名</text>
        <text class="rename-current-text">{{ currentName || '（未设置）' }}</text>
      </view>

      <view class="rename-form-item">
        <text class="rename-label">新谱名</text>
        <input
          v-model="renameInput"
          class="rename-input"
          :maxlength="RENAME_MAX_LEN"
          placeholder="如：季氏家谱"
        />
      </view>

      <!-- 价格行（**本次消耗明示**；`feePieces` 缺失 / 未加载 ⇒ 整条不渲染，仍可提交） -->
      <view v-if="feePieces !== null" class="rename-fee">
        <text class="rename-fee-text">本次修改消耗 {{ feePieces }} 片竹简</text>
      </view>

      <view v-if="renameError" class="rename-error">
        <text>{{ renameError }}</text>
      </view>

      <view class="rename-actions">
        <button class="rename-btn-save" :disabled="renameSubmitting" @click="submitRename">
          {{ renameSubmitting ? '提交中...' : '确认' }}
        </button>
        <text class="rename-btn-cancel" @click="close">取消</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 修改谱名弹窗（**共享组件 · 单真源**）—— 由家族树页（`wenpu-book.vue` 工具条）与祖谱页
 * （`clan-hall.vue` 头部控制区）复用同一套 UI + 提交逻辑（**不得再写第二份实现**）。
 *
 * 口径（Kevin 2026-10-12 拍定；**逐字不得改**既有已验收行为）：
 *   · 入参 = 树 id（`treeId`）+ 当前谱名（`currentName`）+ 本次消耗（`feePieces` = tree-meta entry 的
 *     `rename_fee_pieces`；**缺失 / 未加载 ⇒ `null` ⇒ 价格行整条不渲染、仍可提交**）；宿主负责取数。
 *   · 出参 = 成功后 emit `renamed`（宿主据此重取 tree-meta 刷新谱名展示）+ emit `close`（宿主关弹窗）。
 *   · 预校验（与后端同口径）：`谱名不能为空` / `谱名不能超过 30 字`（按**码点**计）/ `未做修改`。
 *   · 二次确认标题 `⚠️ 修改谱名确认`；成功 toast `谱名已修改`；请求 `POST /admin/tree-rename`，
 *     body `{tree_id, genealogy_name}`（键名逐字）。
 *   · 失败：后端原文落弹窗错误行 + toast；409 竹片不足走既有资产不足引导
 *     （`need` / `current` / `unit` / `how_to_get` 全带 UI，不静默失败）。
 */
import { ref, onMounted, watch } from 'vue';
import { renameTreeGenealogy } from '@/business/api';
import { getAuthToken } from '@/business/auth';
import { isAssetInsufficientError, showAssetInsufficientGuide } from '@/business/asset-guide';
import { shortageLine } from '@/business/asset-text';

const props = withDefaults(
  defineProps<{
    /** 家族树 / 祖谱 tree_id */
    treeId: string;
    /** 当前谱名（tree-meta entry 的 `genealogy_name`；未设置 ⇒ 空串 ⇒ 展示「（未设置）」） */
    currentName?: string;
    /** 本次消耗（片竹简）；`null` / 缺失 ⇒ **整条价格行不渲染**（仍可提交，以后端为准） */
    feePieces?: number | null;
  }>(),
  { currentName: '', feePieces: null },
);

const emit = defineEmits<{ (e: 'renamed'): void; (e: 'close'): void }>();

/** 谱名长度上限（**与后端同口径**；超出由前端预校验拦下） */
const RENAME_MAX_LEN = 30;

/** 输入框内容（打开时预填当前谱名） */
const renameInput = ref('');
/** 提交失败文案（后端原文；弹窗保持打开可重试） */
const renameError = ref('');
/** 提交中（防重复提交） */
const renameSubmitting = ref(false);

/** 当前谱名（去空白；宿主传入；预览校验用同一口径） */
function currentTrimmed(): string {
  return (props.currentName || '').trim();
}

/** 预填输入框 = 当前谱名（弹窗由宿主以 `v-if` 挂载 ⇒ `onMounted` 即「打开」时刻） */
onMounted(() => {
  renameInput.value = currentTrimmed();
});
// 宿主可在弹窗挂载后再刷「当前谱名」（tree-meta 迟到）⇒ 未改动输入框时同步预填
watch(
  () => props.currentName,
  (v) => {
    if (!renameInput.value) renameInput.value = (v || '').trim();
  },
);

function close() {
  emit('close');
}

/**
 * 前端预校验（**与后端同口径**）：trim 非空 → 长度 ≤ 30 字 → 与当前值相同一律不提交。
 * 长度按**码点**计（`[...v].length`，与后端 `TREE_RENAME_MAX_NAME_LEN` 的「按码点」口径一致；
 * 直接用 `v.length` 会把 emoji / 增补平面字符算 2 ⇒ 误拦）。
 * 返回 `null` = 可提交；否则为 toast 文案。
 */
function renameInputError(): string | null {
  const v = renameInput.value.trim();
  if (!v) return '谱名不能为空';
  if ([...v].length > RENAME_MAX_LEN) return `谱名不能超过 ${RENAME_MAX_LEN} 字`;
  if (v === currentTrimmed()) return '未做修改';
  return null;
}

/** 二次确认（体例对齐修谱面板：`uni.showModal` 取 `res.confirm`；取消 ⇒ 不发请求） */
function confirmRename(next: string): Promise<boolean> {
  const feeLine = props.feePieces === null ? '' : `本次修改消耗 ${props.feePieces} 片竹简。`;
  return new Promise((resolve) => {
    uni.showModal({
      title: '⚠️ 修改谱名确认',
      content: `谱名将改为「${next}」。${feeLine}是否确认提交？`,
      confirmText: '确认修改',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}

/**
 * 提交改名：预校验 → 二次确认 → `POST /admin/tree-rename`。
 * 成功 ⇒ toast + 关弹窗 + emit `renamed`（宿主刷谱名展示；文谱宿主另重拉书口）；
 * 失败 ⇒ 后端原文落弹窗错误行 + toast；409 竹片不足走既有资产不足引导（不静默失败）。
 */
async function submitRename() {
  if (renameSubmitting.value) return;
  renameError.value = '';
  const bad = renameInputError();
  if (bad) {
    uni.showToast({ title: bad, icon: 'none' });
    return;
  }
  const token = getAuthToken();
  if (!token) {
    renameError.value = '登录已过期，请重新登录';
    return;
  }
  const next = renameInput.value.trim();
  if (!(await confirmRename(next))) return;

  renameSubmitting.value = true;
  try {
    await renameTreeGenealogy(token, { tree_id: props.treeId, genealogy_name: next });
    uni.showToast({ title: '谱名已修改', icon: 'success' });
    emit('close');
    emit('renamed');
  } catch (e) {
    const msg = (e as Error | undefined)?.message || '修改谱名失败';
    renameError.value = msg;
    // 竹片不足（409 ASSET_INSUFFICIENT）：后端原文 toast + 「本次需 X 片，当前可用 Y 片」明细行
    // + 「如何获得竹片」清单 + 「去我的资产」引导（与 person-archive / asset-inventory 同一先例）
    if (isAssetInsufficientError(e)) {
      const err = e as { need?: number; current?: number; unit?: string };
      const extra =
        err?.need !== undefined || err?.current !== undefined || err?.unit !== undefined
          ? shortageLine(err?.need, err?.current, err?.unit)
          : undefined;
      showAssetInsufficientGuide(e, { extra, title: '竹片不足' });
      return;
    }
    uni.showToast({ title: msg, icon: 'none' });
  } finally {
    renameSubmitting.value = false;
  }
}
</script>

<style scoped>
/* 修改谱名弹窗（体例对齐既有家族信息弹窗：全屏遮罩 + 居中卡片；遮罩点击关闭、内层 @click.stop） */
.rename-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.rename-modal {
  width: 86%; max-width: 380px; background: #fff; border-radius: 14px;
  padding: 24px 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
  box-sizing: border-box;
}
.rename-title {
  font-size: 18px; font-weight: bold; color: #3E2723;
  display: block; text-align: center; margin-bottom: 18px;
}
.rename-form-item { margin-bottom: 14px; }
.rename-label { font-size: 13px; color: #8B4513; font-weight: bold; display: block; margin-bottom: 6px; }
.rename-current-text { font-size: 14px; color: #555; display: block; }
.rename-input {
  height: 42px; border: 1px solid #E0D5C8; border-radius: 8px;
  padding: 0 12px; font-size: 14px; background: #FBF8F4; width: 100%;
  box-sizing: border-box;
}
/* 价格行：本次消耗明示 */
.rename-fee { margin-bottom: 6px; }
.rename-fee-text { font-size: 13px; color: #C62828; display: block; }
.rename-error { color: #C62828; font-size: 13px; text-align: center; margin-bottom: 10px; }
.rename-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.rename-btn-save {
  height: 42px; line-height: 42px; background: #8B4513; color: #fff;
  font-size: 15px; border-radius: 8px;
}
.rename-btn-cancel { text-align: center; color: #999; font-size: 14px; padding: 4px 0; }
</style>
