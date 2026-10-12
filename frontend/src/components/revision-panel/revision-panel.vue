<template>
  <!-- 遮罩点击关闭 + 内层 stop 阻止冒泡（uni-app H5 **不支持** `.self` 修饰符，仓内体例） -->
  <view class="rp-mask" @click="close">
    <view class="rp-panel" @click.stop>
      <view class="rp-head">
        <text class="rp-title">修谱管理</text>
        <text class="rp-close" @click="close">✕</text>
      </view>

      <view v-if="loading" class="rp-tip">加载中...</view>
      <view v-else-if="loadError" class="rp-error">{{ loadError }}</view>

      <template v-else>
        <text class="rp-note">
          修谱内容只出现在【在线文谱】视图内。开一轮消耗 {{ feeStartBamboos }} 片竹簡；锁定期内每次保存按档位扣费
          （{{ feeLockedEditBamboos }} / {{ feeLockedLongBamboos }} 片竹簡）。
        </text>

        <!-- 开始新一轮：未开始 或 上一轮已锁定且冷却已到（进行中不显示） -->
        <view v-if="showStart" class="rp-actions">
          <template v-if="canStart">
            <view class="rp-btn rp-btn-primary" :class="{ disabled: starting }" @click="doStart">
              {{ starting ? '处理中...' : '开始本次修谱' }}
            </view>
            <text class="rp-hint">消耗 {{ feeStartBamboos }} 片竹簡</text>
          </template>
          <text v-else class="rp-hint">冷却期未到，最早可于 {{ nextStartAt }} 开始下一次修谱。</text>
        </view>

        <!-- 轮次选择：总编辑（chief_editor）可列历次并选任一轮；家族管理员只管最近一轮 -->
        <view v-if="isChief && selectableRecords.length" class="rp-block">
          <text class="rp-block-title">选择轮次（总编辑可修任意轮）</text>
          <view
            v-for="r in selectableRecords"
            :key="r.seq"
            class="rp-round"
            :class="{ 'rp-round-on': r.seq === selectedSeq }"
            @click="selectRecord(r.seq)"
          >
            <text class="rp-round-text">第 {{ r.seq }} 次{{ recordStatusLabel(r) }}</text>
            <text class="rp-round-time">{{ r.effective_at }}</text>
          </view>
        </view>

        <template v-if="selectedSeq !== null && selectedRecord">
          <!-- 档位提示：编辑期内免费（不限次数）；锁定后每次保存按档位扣费 -->
          <view class="rp-tier">
            <text class="rp-tier-line">{{ tierBannerText }}</text>
          </view>

          <text v-if="!canEdit" class="rp-hint">当前角色对本轮无写权限。</text>

          <!-- ① 昭範正圖（单张图：选择 / 替换；与其它项**同一次提交**） -->
          <view class="rp-block">
            <text class="rp-block-title">昭範正圖</text>
            <image v-if="coverPreview" class="rp-cover" :src="coverPreview" mode="aspectFit" />
            <text v-else class="rp-hint">尚未上传卷首图</text>
            <text v-if="coverNew" class="rp-hint">已选择新图片，点击「保存本次修改」后生效</text>
            <view v-if="canEdit" class="rp-actions">
              <view class="rp-btn" :class="{ disabled: picking }" @click="doPickCover">
                {{ picking ? '处理中...' : coverPreview ? '替换图片' : '选择图片' }}
              </view>
            </view>
            <text class="rp-hint">jpg / png / webp，上限 2 MB（超限自动压缩；仍超限则不上传）</text>
          </view>

          <!-- ② 族務紀文（标题 / 正文 / 落款；内容 kind = 'article'）
               字符集口径 = **只允许汉字与中文逗号、句号**，且**标点不可连续**（三字段同规则）；
               存储**保留原文**（标点原样落库，不再折成空格）；拒绍文案**与后端逐字一致**（`article-rules.ts`）。 -->
          <view class="rp-block">
            <text class="rp-block-title">族務紀文</text>
            <input
              class="rp-input"
              :value="article.title"
              :disabled="!canEdit"
              placeholder="标题（须繁体；只可汉字与，。；标点不可连续）"
              @input="onArticleInput('title', $event)"
            />
            <textarea
              class="rp-textarea"
              :value="article.body"
              :disabled="!canEdit"
              placeholder="正文（须繁体；只可汉字与，。；标点不可连续）"
              @input="onArticleInput('body', $event)"
            />
            <input
              class="rp-input"
              :value="article.signature"
              :disabled="!canEdit"
              placeholder="落款（须繁体；只可汉字与，。；标点不可连续）"
              @input="onArticleInput('signature', $event)"
            />
            <!-- 输入口径提示（常显；措辞刻意**不与两条拒绍文案字面重合**，便于真机取证区分） -->
            <text class="rp-hint">只可輸入漢字，標點限中文逗號與句號，且不可相鄰連用。</text>
            <!-- 实时校验提示（**与后端拒绍文案逐字一致**；只针对**用户编辑过**的字段，
                 故打开面板时存量旧数据（标点已折空格）不误报；提交拦截时强制显示） -->
            <text v-if="articleError" class="rp-error">{{ articleError }}</text>
            <text v-else-if="articleDirty" class="rp-hint">族務紀文有改动，将随本次保存一并提交</text>
          </view>

          <!-- ③ 譜司襄事（一人一条：姓名 + 職務；**職務二选一** 主司 / 副司 · 主司恰 1 必填 · 副司 ≤2 · 共 ≤3 · 同一族人不可重复；内容 kind = 'helpers'） -->
          <view class="rp-block">
            <text class="rp-block-title">譜司襄事</text>
            <view
              v-for="(row, i) in rosterRows"
              :key="i"
              :id="'rp-roster-' + i"
              class="rp-row"
              :class="{ 'rp-row-focus': rosterFocusIndex === i }"
            >
              <view class="rp-pick" @click="openPicker('roster', i)">
                <text class="rp-pick-name">{{ row.name || '点选族人' }}</text>
                <text class="rp-pick-id">{{ row.gramps_id }}</text>
              </view>
              <view class="rp-duty">
                <text
                  v-for="d in ROSTER_DUTIES"
                  :key="d"
                  class="rp-duty-chip"
                  :class="{ 'rp-duty-on': row.duty === d, disabled: !canEdit }"
                  @click="chooseRosterDuty(i, d)"
                >{{ d }}</text>
              </view>
              <text v-if="canEdit" class="rp-del" @click="removeRosterRow(i)">删行</text>
            </view>
            <text v-if="rowLegacyDuty" class="rp-hint">
              已有職務「{{ rowLegacyDuty }}」不在「主司 / 副司」之内，请改选后再保存。
            </text>
            <text v-if="canEdit" class="rp-hint">
              主司 1 位（必填）、副司最多 2 位、襄事最多 3 位；同一族人不可重复录入。
            </text>
            <view v-if="canEdit" class="rp-actions">
              <view class="rp-btn" :class="{ disabled: rosterFull }" @click="addRosterRow">新增行</view>
            </view>

            <!-- 族人点选（**唯一入口** = `searchPeople`，不得手输族人姓名） -->
            <view v-if="pickerKind === 'roster'" class="rp-picker">
              <view class="rp-picker-head">
                <text class="rp-picker-title">点选族人（第 {{ pickerIndex + 1 }} 行）</text>
                <text class="rp-close" @click="closePicker">✕</text>
              </view>
              <view class="rp-picker-search">
                <input
                  class="rp-input rp-input-sub"
                  :value="pickerQuery"
                  placeholder="输入姓名搜索"
                  @input="onPickerQueryInput"
                  @confirm="doPickerSearch"
                />
                <view class="rp-btn" @click="doPickerSearch">搜索</view>
              </view>
              <view v-if="pickerSearching" class="rp-hint">搜索中...</view>
              <view v-else-if="pickerResults.length" class="rp-results">
                <view
                  v-for="p in pickerResults"
                  :key="p.handle"
                  class="rp-result"
                  @click="choosePickerPerson(p)"
                >
                  <text class="rp-pick-name">{{ p.name }}</text>
                  <text class="rp-pick-id">{{ p.gramps_id }}</text>
                </view>
              </view>
              <view v-else-if="pickerSearched" class="rp-hint">未找到匹配族人</view>
            </view>
          </view>

          <!-- ④ 樂捐名錄（一人一条：姓名 + 空格 + 金額漢字大寫；内容 kind = 'donations'） -->
          <view class="rp-block">
            <text class="rp-block-title">樂捐名錄</text>
            <view v-for="(row, i) in donationRows" :key="i" class="rp-row">
              <view class="rp-pick" @click="openPicker('donation', i)">
                <text class="rp-pick-name">{{ row.name || '点选族人' }}</text>
                <text class="rp-pick-id">{{ row.gramps_id }}</text>
              </view>
              <input
                class="rp-input rp-input-sub"
                :value="row.amount"
                :disabled="!canEdit"
                type="number"
                placeholder="金额（正整数）"
                @input="onDonationAmountInput(i, $event)"
              />
              <text v-if="canEdit" class="rp-del" @click="removeDonationRow(i)">删行</text>
            </view>
            <view v-if="canEdit" class="rp-actions">
              <view class="rp-btn" @click="addDonationRow">新增行</view>
            </view>

            <view v-if="pickerKind === 'donation'" class="rp-picker">
              <view class="rp-picker-head">
                <text class="rp-picker-title">点选族人（第 {{ pickerIndex + 1 }} 行）</text>
                <text class="rp-close" @click="closePicker">✕</text>
              </view>
              <view class="rp-picker-search">
                <input
                  class="rp-input rp-input-sub"
                  :value="pickerQuery"
                  placeholder="输入姓名搜索"
                  @input="onPickerQueryInput"
                  @confirm="doPickerSearch"
                />
                <view class="rp-btn" @click="doPickerSearch">搜索</view>
              </view>
              <view v-if="pickerSearching" class="rp-hint">搜索中...</view>
              <view v-else-if="pickerResults.length" class="rp-results">
                <view
                  v-for="p in pickerResults"
                  :key="p.handle"
                  class="rp-result"
                  @click="choosePickerPerson(p)"
                >
                  <text class="rp-pick-name">{{ p.name }}</text>
                  <text class="rp-pick-id">{{ p.gramps_id }}</text>
                </view>
              </view>
              <view v-else-if="pickerSearched" class="rp-hint">未找到匹配族人</view>
            </view>
          </view>

          <!-- 唯一保存入口：本次变更的项收集为 `items` **一次提交**（含封面同次提交） -->
          <view v-if="canEdit" class="rp-actions rp-save">
            <view class="rp-btn rp-btn-primary" :class="{ disabled: saving }" @click="doSave">
              {{ saving ? '保存中...' : '保存本次修改' }}
            </view>
            <text class="rp-hint">{{ pendingText }}</text>
          </view>
        </template>

        <text v-else class="rp-hint">暂无可编辑的修谱轮次。</text>

        <!-- 后端文案原样展示（如 400「族務紀文須以繁體字錄入」+ 首个简体字位置） -->
        <text v-if="actionError" class="rp-error">{{ actionError }}</text>
      </template>

      <!-- 小程序端 canvas 2d 重绘（限最长边）用；H5 端不渲染 -->
      <!-- #ifdef MP-WEIXIN -->
      <canvas type="2d" id="revision-canvas" class="rp-canvas" />
      <!-- #endif -->
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
// #ifdef MP-WEIXIN
import { getCurrentInstance } from 'vue';
// #endif
import { fetchRevisions, startRevision, saveRevision, searchPeople } from '@/business/api';
import type { PersonSummary } from '@/business/types';
import {
  REVISION_EDIT_DAYS,
  REVISION_FEE_LOCKED_EDIT_BAMBOOS,
  REVISION_FEE_LOCKED_LONG_BAMBOOS,
  REVISION_FEE_START_BAMBOOS,
  REVISION_IMAGE_EXT,
  REVISION_IMAGE_MAX_BYTES,
  buildRevisionSaveItems,
  canEditRevision,
  canManageRevision,
  feeTierText,
  revisionSaveConfirmText,
} from '@/business/revision';
import type { RevisionArticle, RevisionRecord, RevisionView } from '@/business/revision';
import { authState } from '@/business/auth';
import {
  ROSTER_DUTIES,
  ROSTER_DUTY_MASTER,
  ROSTER_DUTY_DEPUTY,
  ROSTER_MAX_ROWS,
  ROSTER_MAX_DEPUTIES,
  ROSTER_MSG,
  checkRoster,
  isRosterDuty,
  rosterDutyCount,
  rosterHandleUsedByOther,
} from './roster-rules';
import { ARTICLE_FIELDS, checkArticle, checkArticleText } from './article-rules';

const props = defineProps<{ treeId: string }>();
const emit = defineEmits<{ (e: 'changed'): void; (e: 'close'): void }>();

const loading = ref(false);
const loadError = ref('');
/** 操作错误（**后端文案原样**：401 / `REVISION_COOLDOWN` / `REVISION_ACTIVE` / `ASSET_INSUFFICIENT` / 简体拒绝） */
const actionError = ref('');
/** 是否正在提交保存（**一次点击保存 = 一次调用**） */
const saving = ref(false);
const starting = ref(false);
const picking = ref(false);

/** 修谱视图（`GET /revisions` 出参；缺省 = 未加载） */
const view = ref<RevisionView | null>(null);
/** 历次修谱（`seq` 升序；**作废概念已取消** ⇒ 全部可列） */
const records = ref<RevisionRecord[]>([]);
/** 最近一轮的 `seq`；`null` = 无任何修谱记录 */
const activeSeq = ref<number | null>(null);
/** 可否开始新一轮修谱（`can_start.ok`） */
const canStart = ref(false);
/** 冷却未到时 = 最早可开始时刻（ISO） */
const nextStartAt = ref('');
/** 当前**选中编辑**的轮次 `seq`；`null` = 无可编辑轮次 */
const selectedSeq = ref<number | null>(null);

/** 三档费用（展示兜底；真值以后端出参为准 —— 旧键 `fee_bamboos` 已删除） */
const feeStartBamboos = ref(REVISION_FEE_START_BAMBOOS);
const feeLockedEditBamboos = ref(REVISION_FEE_LOCKED_EDIT_BAMBOOS);
const feeLockedLongBamboos = ref(REVISION_FEE_LOCKED_LONG_BAMBOOS);

const coverUrl = ref('');
const article = ref<RevisionArticle>({ title: '', body: '', signature: '' });

interface RosterRow {
  handle: string;
  name: string;
  gramps_id: string;
  duty: string;
}
interface DonationRow {
  handle: string;
  name: string;
  gramps_id: string;
  amount: string;
}
const rosterRows = ref<RosterRow[]>([]);
const donationRows = ref<DonationRow[]>([]);
/** 校验失败时聚焦（高亮 + 滚动）的襄事行下标；`null` = 无聚焦 */
const rosterFocusIndex = ref<number | null>(null);

// ---- 本次变更的项（脏标记；保存时归集为 `items` 一次提交） ----
const articleDirty = ref(false);
const helpersDirty = ref(false);
const donationsDirty = ref(false);
/** 新选中的卷首图（base64 + 本地预览；与其它项**同一次提交**、**不再单独调上传路由**） */
const coverNew = ref<{ ext: string; data_base64: string; preview: string } | null>(null);

/** 族人点选（唯一入口 = `searchPeople`；**不得手输族人姓名**） */
const pickerKind = ref<'' | 'roster' | 'donation'>('');
const pickerIndex = ref(0);
const pickerQuery = ref('');
const pickerResults = ref<PersonSummary[]>([]);
const pickerSearching = ref(false);
const pickerSearched = ref(false);

// ---- 角色与可写判据（单一函数 `canEditRevision`，与后端 `assertRevisionWritable` 同构） ----

const role = computed(() => authState.role || '');
/** 总编辑：可列历次并选任一轮 */
const isChief = computed(() => role.value === 'chief_editor');
/** 管理者（家族管理员 / 总编辑）：`✎ 修谱` 与「开始」入口可见 */
const canManage = computed(() => canManageRevision(role.value, props.treeId));

/** 可列轮次（**作废概念已取消** ⇒ 全部，无过滤） */
const selectableRecords = computed(() => records.value);
/** 最近一轮（`seq` 最大者） */
const latestRecord = computed(() =>
  records.value.length ? records.value[records.value.length - 1] : null,
);
/** 最近一轮是否仍在编辑期内（`days <= 30`；编辑期内的轮次不可再开新一轮） */
const inEditWindow = computed(() => !!latestRecord.value && latestRecord.value.fee_tier === 'edit_window');
/** 开始新一轮入口：管理者 且 不在编辑期内（未开始 / 上一轮已锁定） */
const showStart = computed(() => canManage.value && !inEditWindow.value);

/** 当前选中的轮次 */
const selectedRecord = computed(() => records.value.find((r) => r.seq === selectedSeq.value) || null);
/** 选中轮次是否已锁定（`fee_tier !== 'edit_window'`） */
const isLocked = computed(() => !!selectedRecord.value && selectedRecord.value.fee_tier !== 'edit_window');
/**
 * 选中轮次是否可写（**单一判据** = `canEditRevision`）：`tree_steward` 与 `chief_editor` **恒可写**
 * （锁定后付费即可继续写；旧「固化后家族管理员只读」已推翻），其余角色不可写。
 */
const canEdit = computed(
  () => selectedSeq.value !== null && canEditRevision(role.value, { locked: isLocked.value }),
);
/** 选中轮次档位 / 下次扣费 / 天数 */
const selTier = computed(() => selectedRecord.value?.fee_tier || '');
const selFeeNext = computed(() => Number(selectedRecord.value?.fee_next_bamboos) || 0);
const selDays = computed(() => Number(selectedRecord.value?.days) || 0);

/** 编辑期天数（真值以后端 `edit_days` 为准） */
const editDays = computed(() => Number(view.value?.edit_days) || REVISION_EDIT_DAYS);

/** 选中轮次的固化时刻（该轮为 `active` 时取后端 `lock_at`，否则按 `effective_at + edit_days` 现算） */
const selLockAt = computed(() => {
  const r = selectedRecord.value;
  if (!r) return '';
  const act = view.value?.active;
  if (act && Number(act.seq) === r.seq && act.lock_at) return act.lock_at;
  const d = new Date(r.effective_at);
  if (!Number.isFinite(d.getTime())) return '';
  d.setDate(d.getDate() + editDays.value);
  return d.toISOString();
});

/** 档位横幅文案：编辑期 ⇒ 免费提示；锁定 ⇒ 档位 + 本次扣费额 */
const tierBannerText = computed(() => {
  const r = selectedRecord.value;
  if (!r) return '';
  if (r.fee_tier === 'edit_window') {
    return `編輯期內不限次數修改，不再扣費（第 ${selDays.value} 天 / 編輯期 ${editDays.value} 天${selLockAt.value ? `，至 ${selLockAt.value.slice(0, 10)}` : ''}）`;
  }
  return `本輪${feeTierText(r.fee_tier)}（第 ${selDays.value} 天，距生效超 ${editDays.value} 天）——本次保存將扣 ${selFeeNext.value} 片竹簡`;
});

/** 卷首图预览源：新选中（本地 data URL）优先，否则后端临时链 */
const coverPreview = computed(() => coverNew.value?.preview || coverUrl.value);

/** 襄事是否已达总人数上限（⇒「新增行」置灰 / 不可点） */
const rosterFull = computed(() => rosterRows.value.length >= ROSTER_MAX_ROWS);

/** 存量自由文本職務（非「主司 / 副司」）的第一条值；`''` = 无（仅作提示，不参与判定） */
const rowLegacyDuty = computed(() => {
  const hit = rosterRows.value.find((r) => !!r.duty.trim() && !isRosterDuty(r.duty));
  return hit ? hit.duty : '';
});

/** 本次将提交的项摘要（保存按钮旁提示） */
const pendingText = computed(() => {
  const parts: string[] = [];
  if (coverNew.value) parts.push('昭範正圖');
  if (articleDirty.value) parts.push('族務紀文');
  if (helpersDirty.value) parts.push('譜司襄事');
  if (donationsDirty.value) parts.push('樂捐名錄');
  if (!parts.length) return '尚未修改任何内容';
  const fee = !isLocked.value ? '编辑期内不再扣费' : `本次将扣 ${selFeeNext.value} 片竹簡`;
  return `将提交：${parts.join(' / ')}（${fee}）`;
});

function msgOf(e: any): string {
  return (e && e.message) || '操作失败';
}

/** 轮次状态标签（`fee_tier` 判定：编辑期 ⇒ 進行中；其余显示档位标签） */
function recordStatusLabel(r: RevisionRecord): string {
  if (r.fee_tier === 'edit_window') return '（進行中）';
  return `（${feeTierText(r.fee_tier) || '已鎖定'}）`;
}

/**
 * 族務紀文**实时校验**（纯函数单点 = `./article-rules` 的 `checkArticleText`，与后端 `normalizeArticle` 同口径）：
 *   · 只校验**用户实际编辑过**的字段（`articleTouched`）⇒ 打开面板时存量旧数据
 *     （旧口径把标点折成了空格）不误报，用户改到哪个字段才要求该字段合规；
 *   · 提交前拦截（`doSave` 内的 `checkArticle`）覆盖**三字段全体**，命中时把同一文案
 *     强制显示出来（`articleSubmitError`）——提示与拦截**同一套逐字文案**。
 */
const articleTouched = ref<{ title: boolean; body: boolean; signature: boolean }>({
  title: false,
  body: false,
  signature: false,
});
/** 提交前拦截时强制显示的拒绍文案（任一输入即清空） */
const articleSubmitError = ref('');
const articleError = computed(() => {
  if (articleSubmitError.value) return articleSubmitError.value;
  for (const f of ARTICLE_FIELDS) {
    if (!articleTouched.value[f]) continue;
    const r = checkArticleText(article.value[f]);
    if (!r.ok) return r.message;
  }
  return '';
});

function inputValue(e: any): string {
  const v = e && e.detail ? e.detail.value : '';
  return typeof v === 'string' ? v : '';
}

function resetContent() {
  coverUrl.value = '';
  article.value = { title: '', body: '', signature: '' };
  rosterRows.value = [];
  donationRows.value = [];
  articleDirty.value = false;
  helpersDirty.value = false;
  donationsDirty.value = false;
  coverNew.value = null;
  rosterFocusIndex.value = null;
  closePicker();
}

/** 把选中轮次的内容载入编辑态（字段名逐字对齐后端出参：`helpers` / `donations` / `person_handle`） */
function loadSelected() {
  const rec = selectedRecord.value;
  if (!rec) {
    resetContent();
    return;
  }
  coverUrl.value = (rec.cover?.url || '').trim();
  article.value = {
    title: rec.article?.title || '',
    body: rec.article?.body || '',
    signature: rec.article?.signature || '',
  };
  rosterRows.value = (rec.helpers || []).map((h) => ({
    handle: h?.person_handle || '',
    name: h?.name || '',
    gramps_id: '',
    duty: h?.duty || '',
  }));
  donationRows.value = (rec.donations || []).map((d) => ({
    handle: d?.person_handle || '',
    name: d?.name || '',
    gramps_id: '',
    amount: d?.amount ? String(d.amount) : '',
  }));
  articleDirty.value = false;
  articleTouched.value = { title: false, body: false, signature: false };
  articleSubmitError.value = '';
  helpersDirty.value = false;
  donationsDirty.value = false;
  coverNew.value = null;
  rosterFocusIndex.value = null;
  closePicker();
}

/**
 * 应用修谱视图 → 界面状态。
 * 选中轮次：家族管理员 ⇒ 最近一轮（进行中 / 已锁定均可写）；总编辑 ⇒ 最近一轮优先、`preferredSeq` 命中则保留。
 */
function applyView(v: RevisionView | null, preferredSeq: number | null = null) {
  view.value = v;
  const list = [...((v && v.revisions) || [])]
    .filter(Boolean)
    .map((r) => ({ ...r, seq: Number(r.seq) || 0 }))
    .sort((a, b) => a.seq - b.seq);
  records.value = list;
  activeSeq.value = v && v.active ? Number(v.active.seq) || 0 : list.length ? list[list.length - 1].seq : null;
  canStart.value = !!(v && v.can_start && v.can_start.ok);
  nextStartAt.value = (v && v.can_start && v.can_start.next_start_at) || '';
  if (v && typeof v.fee_start_bamboos === 'number') feeStartBamboos.value = v.fee_start_bamboos;
  if (v && typeof v.fee_locked_edit_bamboos === 'number') feeLockedEditBamboos.value = v.fee_locked_edit_bamboos;
  if (v && typeof v.fee_locked_long_bamboos === 'number') feeLockedLongBamboos.value = v.fee_locked_long_bamboos;

  const editableSeqs = list.map((r) => r.seq);
  let pick: number | null = preferredSeq;
  if (pick !== null && !editableSeqs.includes(pick)) pick = null;
  if (pick === null) pick = activeSeq.value !== null ? activeSeq.value : null;
  selectedSeq.value = pick;
  loadSelected();
}

async function load() {
  if (!props.treeId) {
    loadError.value = '缺少家族树';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    applyView(await fetchRevisions(props.treeId));
  } catch (e: any) {
    loadError.value = msgOf(e);
  } finally {
    loading.value = false;
  }
}

/** 写操作成功后就地刷新视图并保留选中轮次（失败静默：保留当前界面状态；`null` ⇒ 不保留、按默认选中） */
async function refreshAfterWrite(seq: number | null) {
  try {
    applyView(await fetchRevisions(props.treeId), seq);
  } catch {
    /* 静默：保留当前界面状态 */
  }
}

function close() {
  emit('close');
}

/** 选中一轮编辑（总编辑）；家族管理员视角不会出现该交互 */
function selectRecord(seq: number) {
  if (!selectableRecords.value.some((r) => r.seq === seq)) return;
  selectedSeq.value = Number(seq);
  loadSelected();
}

/** 开始新一轮修谱（扣费 / 冷却 / 已有在途的失败文案一律原样展示；费用真值取 `fee.pieces`） */
async function doStart() {
  starting.value = true;
  actionError.value = '';
  try {
    const r = await startRevision(props.treeId);
    if (typeof r?.fee?.pieces === 'number') feeStartBamboos.value = r.fee.pieces;
    await refreshAfterWrite(typeof r?.seq === 'number' ? r.seq : null);
    uni.showToast({ title: '已开始本次修谱', icon: 'none' });
    emit('changed');
  } catch (e: any) {
    actionError.value = msgOf(e);
  } finally {
    starting.value = false;
  }
}

// ---- ② 族務紀文（内容 kind = 'article'）----
//
// 口径（A 口径 · Kevin 2026-10-12 拍定 · 纯函数落 `./article-rules.ts`）：
//   · 只允许「汉字 + 中文逗号 `，` + 中文句号 `。`」；其它字符逐字符拒（文案 = `ARTICLE_MSG_CHARSET`）；
//   · 禁止连续标点（`，。` / `。。` / `，，` ⇒ `ARTICLE_MSG_PUNCT_REPEAT`）；
//   · **存储保留原文** ⇒ 输入**原样入编辑态**（旧 `sanitizePunct`「标点折成空格」已随本口径删除）；
//   · 三字段同规则；提交前在 `doSave` 再拦一遍（实时提示 = `articleError`）。
function onArticleInput(key: 'title' | 'body' | 'signature', e: any) {
  article.value = { ...article.value, [key]: inputValue(e) };
  articleDirty.value = true;
  articleTouched.value = { ...articleTouched.value, [key]: true };
  articleSubmitError.value = ''; // 任一输入即清掉提交拦截提示（改后由实时校验重新判定）
}

// ---- ③ 譜司襄事（内容 kind = 'helpers'）----
//
// 口径（Kevin 2026-10-12 拍定 · 纯函数落 `./roster-rules.ts`）：
//   · **職務二选一**（`主司` / `副司` chip；默认空、必选；不再是自由文本）；
//   · 总人数 **≤ 3**（达上限「新增行」置灰且不可点）；
//   · `主司` **恰 1**（选第二位主司即时拦下）、`副司` **≤ 2**；
//   · **同一族人不得重复录入**（选人时拦、提交前再拦一遍）。
// 六条拦截文案 = `ROSTER_MSG`（**与后端逐字一致 · 繁体**）。

/** 聚焦（高亮 + 滚动到可视区）某襄事行；`i < 0` ⇒ 只清高亮 */
function focusRosterRow(i: number) {
  rosterFocusIndex.value = i >= 0 ? i : null;
  if (i < 0) return;
  // #ifdef H5
  // 面板自身可滚（`.rp-panel{overflow-y:auto}`）⇒ 用 `scrollIntoView` 把出错行带进视野
  setTimeout(() => {
    const el = document.getElementById('rp-roster-' + i);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
  }, 0);
  // #endif
}

/** 拦截：写文案 + 聚焦对应行（**不改数据**） */
function blockRoster(message: string, index: number) {
  actionError.value = message;
  focusRosterRow(index);
}

function addRosterRow() {
  if (!canEdit.value) return;
  // 上限 3 位：达上限即不可点（按钮同时置灰）
  if (rosterRows.value.length >= ROSTER_MAX_ROWS) {
    blockRoster(ROSTER_MSG.maxThree, -1);
    return;
  }
  rosterRows.value = [...rosterRows.value, { handle: '', name: '', gramps_id: '', duty: '' }];
  helpersDirty.value = true;
  actionError.value = '';
}
function removeRosterRow(i: number) {
  rosterRows.value = rosterRows.value.filter((_, idx) => idx !== i);
  helpersDirty.value = true;
  rosterFocusIndex.value = null;
  closePicker();
}

/** 选職務（二选一 chip）：主司占位已满 / 副司满 2 位 ⇒ 即时拦下并聚焦该行 */
function chooseRosterDuty(i: number, duty: string) {
  if (!canEdit.value) return;
  const row = rosterRows.value[i];
  if (!row || row.duty === duty) return;
  if (duty === ROSTER_DUTY_MASTER && rosterDutyCount(rosterRows.value, ROSTER_DUTY_MASTER) >= 1) {
    blockRoster(ROSTER_MSG.masterOneOnly, i);
    return;
  }
  if (duty === ROSTER_DUTY_DEPUTY && rosterDutyCount(rosterRows.value, ROSTER_DUTY_DEPUTY) >= ROSTER_MAX_DEPUTIES) {
    blockRoster(ROSTER_MSG.deputyMax, i);
    return;
  }
  rosterRows.value = rosterRows.value.map((r, idx) => (idx === i ? { ...r, duty } : r));
  helpersDirty.value = true;
  actionError.value = '';
  rosterFocusIndex.value = null;
}

// ---- ④ 樂捐名錄（内容 kind = 'donations'）----
function addDonationRow() {
  donationRows.value = [...donationRows.value, { handle: '', name: '', gramps_id: '', amount: '' }];
  donationsDirty.value = true;
}
function removeDonationRow(i: number) {
  donationRows.value = donationRows.value.filter((_, idx) => idx !== i);
  donationsDirty.value = true;
  closePicker();
}
function onDonationAmountInput(i: number, e: any) {
  const value = inputValue(e).replace(/[^\d]/g, '');
  donationRows.value = donationRows.value.map((row, idx) => (idx === i ? { ...row, amount: value } : row));
  donationsDirty.value = true;
}

// ---- 族人点选（复用既有 `searchPeople`） ----
function openPicker(kind: 'roster' | 'donation', index: number) {
  if (!canEdit.value) return;
  pickerKind.value = kind;
  pickerIndex.value = index;
  pickerQuery.value = '';
  pickerResults.value = [];
  pickerSearched.value = false;
}
function closePicker() {
  pickerKind.value = '';
  pickerIndex.value = 0;
  pickerQuery.value = '';
  pickerResults.value = [];
  pickerSearched.value = false;
}
function onPickerQueryInput(e: any) {
  pickerQuery.value = inputValue(e);
}
async function doPickerSearch() {
  const q = pickerQuery.value.trim();
  if (!q || !props.treeId) return;
  pickerSearching.value = true;
  pickerSearched.value = true;
  try {
    const res = await searchPeople({ query: q, tree_id: props.treeId });
    pickerResults.value = res.people || [];
  } catch (e: any) {
    actionError.value = msgOf(e);
    pickerResults.value = [];
  } finally {
    pickerSearching.value = false;
  }
}
function choosePickerPerson(p: PersonSummary) {
  const idx = pickerIndex.value;
  if (pickerKind.value === 'roster') {
    // **同一族人不得重复录入**（主司与副司之间、副司之间）：命中 ⇒ 拦下并保留选择层
    if (rosterHandleUsedByOther(rosterRows.value, p.handle, idx)) {
      actionError.value = ROSTER_MSG.duplicatePerson;
      focusRosterRow(idx);
      return;
    }
    rosterRows.value = rosterRows.value.map((row, i) =>
      i === idx ? { ...row, handle: p.handle, name: p.name, gramps_id: p.gramps_id || '' } : row,
    );
    helpersDirty.value = true;
    actionError.value = '';
  } else if (pickerKind.value === 'donation') {
    donationRows.value = donationRows.value.map((row, i) =>
      i === idx ? { ...row, handle: p.handle, name: p.name, gramps_id: p.gramps_id || '' } : row,
    );
    donationsDirty.value = true;
  }
  closePicker();
}

// ---- 卷首图（选择 → 压缩 → **随本次保存同次提交**；不再单独调上传路由） ----
//
// 口径：上限 **2 MiB**（jpg / png / webp）；H5 = canvas 重绘、小程序 = `uni.compressImage`；
// 压缩退让阶梯 = **先退质量**（0.9 → 0.4）、**再限最长边**（2048 → 800）；仍超限 ⇒
// 提示「图片请小于 2 MB」且不选图。选中后仅存 base64 + 本地预览，保存时并入 `save` 的 `cover` 项。

/** 压缩退让阶梯（最长边 px；由大到小） */
const IMAGE_EDGE_LADDER = [2048, 1600, 1280, 1024, 800];
/** 压缩退让阶梯（JPEG 质量；由高到低） */
const IMAGE_QUALITY_LADDER = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4];

function previewUrlOf(ext: string, base64: string): string {
  const mime = ext === 'jpg' ? 'jpeg' : ext === 'webp' ? 'webp' : 'png';
  return `data:image/${mime};base64,${base64}`;
}

function extOf(source: string): string {
  const s = (source || '').toLowerCase();
  if (s.indexOf('image/png') >= 0) return 'png';
  if (s.indexOf('image/webp') >= 0) return 'webp';
  if (s.indexOf('image/jpeg') >= 0 || s.indexOf('image/jpg') >= 0) return 'jpg';
  const m = s.match(/\.([a-z0-9]+)(\?|$)/);
  return m ? m[1] : '';
}

/** base64 体积估算（含 `=` 补齐扣减） */
function byteSizeOfBase64(base64: string): number {
  const b = base64 || '';
  if (!b) return 0;
  const padding = b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0;
  return Math.floor((b.length * 3) / 4) - padding;
}

/** 选择并压缩（按端分流）；返回 `null` = 未选 / 类型不符 / 仍超限（均已就地提示） */
async function pickCompressedImage(): Promise<{ base64: string; ext: string } | null> {
  // #ifdef H5
  return await pickCompressedImageH5();
  // #endif
  // #ifdef MP-WEIXIN
  return await pickCompressedImageMp();
  // #endif
}

// #ifdef H5
function chooseImageFiles(): Promise<any[]> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
      success: (res: any) => resolve(Array.isArray(res?.tempFiles) ? res.tempFiles : []),
      fail: () => resolve([]),
    });
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** canvas 重绘为 JPEG（**限最长边** + 质量） */
function drawToJpeg(img: HTMLImageElement, maxEdge: number, quality: number): string {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const long = Math.max(srcW, srcH) || 1;
  const scale = Math.min(1, maxEdge / long);
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function readFileBase64H5(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/** H5：原图已达标 ⇒ **原字节直传**（保留原扩展名）；否则 canvas 重绘压缩退让 */
async function pickCompressedImageH5(): Promise<{ base64: string; ext: string } | null> {
  const files = await chooseImageFiles();
  const file: any = files[0];
  if (!file) return null;
  const ext = extOf(file.name || file.type || '');
  if (REVISION_IMAGE_EXT.indexOf(ext) < 0) {
    actionError.value = '仅支持 jpg / png / webp';
    return null;
  }
  if (file.size && file.size <= REVISION_IMAGE_MAX_BYTES) {
    const raw = await readFileBase64H5(file as File);
    if (raw) return { base64: raw, ext };
  }
  const objectUrl = URL.createObjectURL(file as File);
  try {
    const img = await loadHtmlImage(objectUrl);
    if (!img) return null;
    for (const edge of IMAGE_EDGE_LADDER) {
      for (const quality of IMAGE_QUALITY_LADDER) {
        const dataUrl = drawToJpeg(img, edge, quality);
        const base64 = dataUrl.split(',')[1] || '';
        if (base64 && byteSizeOfBase64(base64) <= REVISION_IMAGE_MAX_BYTES) {
          return { base64, ext: 'jpg' };
        }
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  actionError.value = '图片请小于 2 MB';
  return null;
}
// #endif

// #ifdef MP-WEIXIN
const mpInst = getCurrentInstance();
/** 小程序 canvas 2d 重绘的最长边上限 */
const MP_CANVAS_MAX_EDGE = 1280;

function chooseImageFilesMp(): Promise<any[]> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
      success: (res: any) => resolve(Array.isArray(res?.tempFiles) ? res.tempFiles : []),
      fail: () => resolve([]),
    });
  });
}

function compressImageMp(src: string, quality: number): Promise<string> {
  return new Promise((resolve) => {
    uni.compressImage({
      src,
      quality,
      success: (res: any) => resolve(res?.tempFilePath || ''),
      fail: () => resolve(''),
    });
  });
}

function readFileBase64Mp(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    uni.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res: any) => resolve(String(res?.data || '')),
      fail: () => resolve(''),
    });
  });
}

/** canvas 2d 重绘（**限最长边**）；取不到节点 / 失败 ⇒ 空串 */
function resizeViaCanvasMp(src: string): Promise<string> {
  return new Promise((resolve) => {
    const query = (uni as any).createSelectorQuery().in(mpInst);
    query
      .select('#revision-canvas')
      .fields({ node: true, size: true }, () => {
        query.exec((res: any) => {
          const canvas: any = res && res[0] && res[0].node;
          if (!canvas) {
            resolve('');
            return;
          }
          const image = canvas.createImage();
          image.onload = () => {
            const long = Math.max(image.width, image.height) || 1;
            const scale = Math.min(1, MP_CANVAS_MAX_EDGE / long);
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve('');
              return;
            }
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            (uni as any).canvasToTempFilePath({
              canvas,
              fileType: 'jpg',
              quality: 0.7,
              success: (r: any) => resolve(r?.tempFilePath || ''),
              fail: () => resolve(''),
            });
          };
          image.onerror = () => resolve('');
          image.src = src;
        });
      });
  });
}

/** 小程序：先退质量（`uni.compressImage`）⇒ 再限最长边（canvas 重绘）⇒ 仍超限即提示不上传 */
async function pickCompressedImageMp(): Promise<{ base64: string; ext: string } | null> {
  const files = await chooseImageFilesMp();
  const file: any = files[0];
  const src: string = (file && (file.path || file.tempFilePath)) || '';
  if (!src) return null;
  const ext = extOf(src);
  if (REVISION_IMAGE_EXT.indexOf(ext) < 0) {
    actionError.value = '仅支持 jpg / png / webp';
    return null;
  }
  if (file.size && file.size <= REVISION_IMAGE_MAX_BYTES) {
    const raw = await readFileBase64Mp(src);
    if (raw) return { base64: raw, ext };
  }
  for (const quality of [80, 60, 40, 20]) {
    const out = await compressImageMp(src, quality);
    if (!out) continue;
    const base64 = await readFileBase64Mp(out);
    if (base64 && byteSizeOfBase64(base64) <= REVISION_IMAGE_MAX_BYTES) {
      return { base64, ext: 'jpg' };
    }
  }
  const resized = await resizeViaCanvasMp(src);
  if (resized) {
    const base64 = await readFileBase64Mp(resized);
    if (base64 && byteSizeOfBase64(base64) <= REVISION_IMAGE_MAX_BYTES) {
      return { base64, ext: 'jpg' };
    }
  }
  actionError.value = '图片请小于 2 MB';
  return null;
}
// #endif

/** 选择卷首图（仅暂存；**保存时随 `items` 同次提交** ⇒ 不在此处调用任何写路由） */
async function doPickCover() {
  if (selectedSeq.value === null || !canEdit.value || picking.value) return;
  actionError.value = '';
  picking.value = true;
  try {
    const picked = await pickCompressedImage();
    if (!picked) return;
    coverNew.value = {
      ext: picked.ext,
      data_base64: picked.base64,
      preview: previewUrlOf(picked.ext, picked.base64),
    };
    uni.showToast({ title: '图片已选择，保存后生效', icon: 'none' });
  } catch (e: any) {
    actionError.value = msgOf(e);
  } finally {
    picking.value = false;
  }
}

/** 锁定后保存的二次确认（含本次扣费额与档位；编辑期内**不弹**） */
function confirmLockedSave(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '鎖定後修改',
      content: revisionSaveConfirmText(selFeeNext.value, selTier.value),
      success: (res: any) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}

/**
 * **唯一保存入口**：把本次变更的项收集成 `items` **一次提交**（`cover` 与其它项同次）。
 * 编辑期内直接提交；锁定后先二次确认（含本次扣费额与档位）。
 */
async function doSave() {
  if (selectedSeq.value === null || !canEdit.value || saving.value) return;
  actionError.value = '';
  const seq = selectedSeq.value;

  // 逐类校验（**先于提交**：点选是否齐全 / 金额是否正整数 / 族務紀文字符集）
  if (articleDirty.value) {
    // ② 族務紀文口径（**与后端逐字一致**）：只允许汉字 + ，。· 禁连续标点。
    // 提交前覆盖**三字段全体**（含未编辑过的存量字段）⇒ 命中即拦下、**不发任何请求**；
    // 同一文案强制显示（`articleSubmitError`），与实时提示**同一套逐字文案**。
    const art = checkArticle(article.value);
    if (!art.ok) {
      actionError.value = art.message;
      articleSubmitError.value = art.message;
      return;
    }
  }
  if (helpersDirty.value) {
    const missing = rosterRows.value.find((r) => (r.name.trim() || r.duty.trim()) && !r.handle);
    if (missing) {
      actionError.value = '请为每一行点选族人';
      return;
    }
    // ③ 譜司襄事口径（**六条文案与后端逐字一致**）：总 ≤3 · 主司恰 1（必填）· 副司 ≤2 ·
    // 職務只能是主司或副司 · 同一族人不得重复（**提交前再拦一遍**，不只是选人时拦）
    const roster = checkRoster(rosterRows.value);
    if (!roster.ok) {
      blockRoster(roster.message, roster.index);
      return;
    }
  }
  if (donationsDirty.value) {
    const missing = donationRows.value.find((r) => (r.name.trim() || r.amount.trim()) && !r.handle);
    if (missing) {
      actionError.value = '请为每一行点选族人';
      return;
    }
    const bad = donationRows.value.find((r) => r.amount.trim() && !/^[1-9]\d*$/.test(r.amount.trim()));
    if (bad) {
      actionError.value = '金额须为正整数';
      return;
    }
  }

  // 归集本次变更的项（封面 + 文章 + 襄事 + 樂捐；**一次调用 = 一次计费**）
  const items = buildRevisionSaveItems({
    articleDirty: articleDirty.value,
    article: {
      title: article.value.title,
      body: article.value.body,
      signature: article.value.signature,
    },
    helpersDirty: helpersDirty.value,
    helpers: rosterRows.value
      .filter((r) => r.handle)
      .map((r) => ({ person_handle: r.handle, duty: r.duty })),
    donationsDirty: donationsDirty.value,
    donations: donationRows.value
      .filter((r) => r.handle)
      .map((r) => ({ person_handle: r.handle, amount: Number(r.amount.trim()) })),
    cover: coverNew.value
      ? { ext: coverNew.value.ext, data_base64: coverNew.value.data_base64 }
      : null,
  });
  if (!items.length) {
    uni.showToast({ title: '未做修改', icon: 'none' });
    return;
  }

  // 锁定后 ⇒ 二次确认（编辑期内不弹）
  if (isLocked.value) {
    const confirmed = await confirmLockedSave();
    if (!confirmed) return;
  }

  saving.value = true;
  try {
    await saveRevision(props.treeId, seq, items);
    await refreshAfterWrite(seq);
    uni.showToast({ title: '已保存', icon: 'success' });
    emit('changed');
  } catch (e: any) {
    actionError.value = msgOf(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
/* 遮罩 + 弹窗（编辑态 = 弹窗；**不新增页面 / 路由**） */
.rp-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
.rp-panel {
  box-sizing: border-box;
  width: 92%;
  max-width: 720px;
  max-height: 86vh;
  overflow-y: auto;
  padding: 16px;
  background: #F7F3E8;
  border: 1px solid #222;
}
.rp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.rp-title { font-size: 16px; font-weight: bold; color: #8B4513; }
.rp-close { font-size: 16px; color: #666; padding: 0 4px; }

.rp-tip { padding: 12px 0; text-align: center; color: #999; font-size: 13px; }
.rp-note { display: block; font-size: 12px; color: #666; line-height: 1.6; }
.rp-hint { display: block; margin-top: 4px; font-size: 12px; color: #999; }
.rp-error { display: block; margin-top: 6px; font-size: 13px; color: #C62828; line-height: 1.6; }

.rp-block {
  margin-top: 12px;
  padding: 10px;
  background: #fff;
  border: 1px solid #E0D5C8;
}
.rp-block-title { display: block; margin-bottom: 6px; font-size: 14px; font-weight: bold; color: #8B4513; }
.rp-cover { width: 100%; height: 160px; background: #F1ECE0; }

/* 档位横幅（编辑期免费 / 锁定后按次扣费） */
.rp-tier {
  margin-top: 10px;
  padding: 8px 10px;
  background: #FBF3E4;
  border: 1px solid #E0D5C8;
}
.rp-tier-line { display: block; font-size: 13px; color: #8B4513; line-height: 1.6; }

/* 轮次选择：总编辑可修任意轮 */
.rp-round {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  padding: 6px 8px;
  border: 1px solid #E0D5C8;
  background: #FFFDF8;
}
.rp-round-on { border-color: #8B4513; background: #FBF3E4; }
.rp-round-text { font-size: 13px; color: #111; }
.rp-round-time { font-size: 11px; color: #999; }

.rp-input {
  box-sizing: border-box;
  width: 100%;
  margin-top: 6px;
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid #E0D5C8;
  background: #FFFDF8;
}
.rp-textarea {
  box-sizing: border-box;
  width: 100%;
  height: 88px;
  margin-top: 6px;
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid #E0D5C8;
  background: #FFFDF8;
}
.rp-input-sub { flex: 1; min-width: 80px; }

.rp-row { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
/* 校验失败聚焦（高亮 + 滚动到该行） */
.rp-row-focus { outline: 2px solid #C62828; outline-offset: 1px; }
/* ③ 譜司襄事：職務二选一 chip（主司 / 副司） */
.rp-duty { display: flex; align-items: center; gap: 4px; }
.rp-duty-chip {
  padding: 3px 8px;
  font-size: 12px;
  color: #8B4513;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 12px;
}
.rp-duty-on { color: #fff; background: #8B4513; border-color: #8B4513; }
.rp-duty-chip.disabled { opacity: 0.45; }
.rp-pick {
  flex: 1;
  min-width: 96px;
  padding: 6px 8px;
  border: 1px dashed #C9B79B;
  background: #FFFDF8;
}
.rp-pick-name { display: block; font-size: 13px; color: #111; }
.rp-pick-id { display: block; font-size: 11px; color: #999; }
.rp-del { padding: 4px 6px; font-size: 12px; color: #C62828; }

.rp-picker { margin-top: 8px; padding: 8px; background: #FBF7EE; border: 1px solid #E0D5C8; }
.rp-picker-head { display: flex; align-items: center; justify-content: space-between; }
.rp-picker-title { font-size: 13px; color: #8B4513; }
.rp-picker-search { display: flex; align-items: center; gap: 6px; }
.rp-results { margin-top: 6px; max-height: 180px; overflow-y: auto; }
.rp-result { padding: 6px 8px; border-bottom: 1px solid #EFE7D8; }

.rp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
.rp-save { margin-top: 12px; padding-top: 10px; border-top: 1px solid #E0D5C8; }
.rp-btn {
  padding: 6px 12px;
  font-size: 13px;
  color: #8B4513;
  background: #fff;
  border: 1px solid #E0D5C8;
  border-radius: 14px;
}
.rp-btn-primary { color: #fff; background: #8B4513; border-color: #8B4513; }
.rp-btn.disabled { opacity: 0.45; }

/* 小程序 canvas 2d 重绘用（移出可视区，不参与布局） */
.rp-canvas { position: fixed; left: -9999px; top: -9999px; width: 300px; height: 300px; }
</style>
