<template>
  <view class="mig">
    <!-- 加载态 -->
    <view v-if="status === 'loading'" class="state">
      <text class="spinner">◌</text>
      <text class="state-txt">正在加载迁徙地图…</text>
    </view>

    <!-- 空态：有树但无任何站点 -->
    <view v-else-if="status === 'empty'" class="state">
      <text class="state-txt">暂无迁徙地点数据</text>
    </view>

    <!-- 错误态：边界产物缺失 / 加载失败（可重试） -->
    <view v-else-if="status === 'error'" class="state">
      <text class="state-txt">地图数据加载失败</text>
      <view class="retry" hover-class="retry-hover" @click="reload"><text class="retry-txt">重试</text></view>
    </view>

    <!-- 树不存在：树元请求成功但无该 tree_id ⇒ 不给「重试」（重试必然同样失败） -->
    <view v-else-if="status === 'not-found'" class="state">
      <text class="state-txt">未找到该家族树</text>
    </view>

    <!-- 就绪：SVG 舞台 + HUD + 时间轴 + 控制条 -->
    <view v-else class="ready">
      <view :id="stageId" class="stage"></view>

      <view class="hud">
        <text class="hud-title">{{ stepTitle }}</text>
        <text class="hud-desc">{{ stepDesc }}</text>
      </view>

      <view v-if="plan && plan.textOnlyCount > 0" class="note">
        <text class="note-main">另有文字记载 {{ plan.textOnlyCount }} 处</text>
        <text class="note-sub">（无地理编码 · 不参与地图定位{{ plan.textOnlySamples.length ? '：' + samplesText : '' }}）</text>
      </view>

      <view class="timeline">
        <view
          v-for="(t, i) in plan ? plan.timeline : []"
          :key="i"
          class="tl-node"
          :class="{ act: current === i, origin: i === 0 }"
          hover-class="tl-hover"
          @click="jump(i)"
        >
          <text class="tl-txt">{{ t }}</text>
        </view>
      </view>

      <view class="controls">
        <view class="ctrl primary" hover-class="ctrl-hover" @click="togglePlay"><text class="ctrl-txt">{{ playing ? '⏸ 暂停' : '▶ 播放' }}</text></view>
        <view class="ctrl" hover-class="ctrl-hover" @click="prev"><text class="ctrl-txt">上一步</text></view>
        <view class="ctrl" hover-class="ctrl-hover" @click="next"><text class="ctrl-txt">下一步</text></view>
        <view class="ctrl" hover-class="ctrl-hover" @click="replay"><text class="ctrl-txt">重播</text></view>
        <view class="progress"><view class="bar" :style="barStyle"></view></view>
        <text class="ind">{{ current + 1 }} / {{ stepCount }}</text>
      </view>

      <text class="footnote">提示：未登录时部分近代节点会被隐藏，站点与人数可能少于实际。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchFamilyList, fetchPersonList, fetchTreeMetaRemote } from '@/business/api';
import type { TreeEntry } from '@/business/types';
import { buildMigrationSites, MIG_YEAR_BASIS, siteYearLabel, yearBasisOf, yearWaveTimeline, yearWaveTitle, type MigrationSites, type MigrationYearBasis } from '@/business/migration-map';
import {
  buildMigrationMapPlan,
  collectBoundAdcodes,
  planSiteCodes,
  provinceOf,
  type MigrationMapPlan,
  type MigrationSiteRef,
} from '@/business/migration-map-view';
import { loadBound, loadBoundCoarse, type BoundFeatureCollection } from '@/business/geo/bounds-loader';
import { mountMigrationMap, type MigrationMapController } from './map-engine';

const props = defineProps<{ treeId: string }>();

const stageId = 'mig-map-stage';
type Status = 'loading' | 'empty' | 'error' | 'not-found' | 'ready';
const status = ref<Status>('loading');
const plan = ref<MigrationMapPlan | null>(null);
const current = ref(0);
const stepCount = ref(0);
const progress = ref(0);
const playing = ref(true);
const stepTitle = ref('');
const stepDesc = ref('');
/** 树级年份口径三态（§17）：`gen`（全无 · 现状逐字不变）/ `mixed`（部分）/ `year`（全有 · 尾波按年份） */
const yearBasis = ref<MigrationYearBasis>(MIG_YEAR_BASIS.GEN);

let controller: MigrationMapController | null = null;
let boundMap: Record<string, BoundFeatureCollection> = {};
/** **粗档**（LOD 第二档）分片；与细档同码一一对应 */
let coarseMap: Record<string, BoundFeatureCollection> = {};

const samplesText = computed(() => (plan.value ? plan.value.textOnlySamples.join(' · ') : ''));
const barStyle = computed(() => ({ width: `${Math.round(progress.value * 1000) / 10}%` }));

function resolveStageEl(): HTMLElement | null {
  return document.getElementById(stageId) as HTMLElement | null;
}

function destroyEngine(): void {
  if (controller) {
    controller.destroy();
    controller = null;
  }
}

/** 全站点的「码 → 最早年份」映射（起点站 + 全部波内站点；§17） */
function collectYears(sites: MigrationSites): Map<string, string> {
  const m = new Map<string, string>();
  if (sites.origin && sites.origin.earliestYear) m.set(sites.origin.code, sites.origin.earliestYear);
  for (const w of sites.waves) for (const s of w.sites) if (s.earliestYear) m.set(s.code, s.earliestYear);
  return m;
}

/**
 * 三态展示口径（§17）：
 *   · `gen`   ⇒ **逐字不动**（世代骨架 · 现状）；
 *   · `mixed` ⇒ 仅**有年份的站点**在标签附年份（时间轴骨架仍按世代 · 不动）；
 *   · `year`  ⇒ 全部站点标签附年份 + **时间轴展示位**把「第N世」换成「<year>年」。
 * 标签追加 = 单点 `siteYearLabel`；时间轴文案 = 单点 `yearWaveTimeline`。
 */
function applyYearDisplay(p: MigrationMapPlan, sites: MigrationSites, basis: MigrationYearBasis): void {
  if (basis === MIG_YEAR_BASIS.GEN) return;
  const years = collectYears(sites);
  const label = (ref: MigrationSiteRef | null): void => {
    if (!ref) return;
    const y = years.get(ref.code);
    if (y) ref.name = siteYearLabel(ref.name, y);
  };
  label(p.origin);
  label(p.main);
  for (const g of p.genWaves) for (const s of g.sites) label(s);
  if (basis !== MIG_YEAR_BASIS.YEAR) return;
  const tl: string[] = [];
  if (p.origin) tl.push(`起点 · ${p.origin.name} · ${p.origin.count} 人`);
  if (p.main) tl.push(`主居地 · ${p.main.name} · ${p.main.count} 人`);
  for (const g of p.genWaves) tl.push(yearWaveTimeline(String(g.gen), g.sites.length));
  p.timeline = tl;
}

/** 年份模式下第 `i` 步对应的年份波（非年份模式 / 非尾波 ⇒ `null`，走引擎原值） */
function yearWaveAt(i: number): { year: string; desc: string } | null {
  if (yearBasis.value !== MIG_YEAR_BASIS.YEAR || !plan.value) return null;
  const base = (plan.value.origin ? 1 : 0) + (plan.value.main ? 1 : 0);
  const g = plan.value.genWaves[i - base];
  if (!g) return null;
  return { year: String(g.gen), desc: `${g.gen}年：${g.sites.map((s) => s.name).join(' + ')} 同批点亮（微错峰 120ms）` };
}

function mountEngine(): void {
  const el = resolveStageEl();
  if (!el || !plan.value) {
    status.value = 'error';
    return;
  }
  destroyEngine();
  controller = mountMigrationMap(el, plan.value, boundMap, coarseMap, {
    onStep: (i, title, desc) => {
      current.value = i;
      const yw = yearWaveAt(i);
      stepTitle.value = yw ? yearWaveTitle(yw.year) : title;
      stepDesc.value = yw ? yw.desc : desc;
    },
    onTick: (p, isPlaying) => {
      progress.value = p;
      if (playing.value !== isPlaying) playing.value = isPlaying;
    },
  });
  stepCount.value = controller.stepCount;
  progress.value = 0;
  playing.value = true;
}

async function reload(): Promise<void> {
  status.value = 'loading';
  plan.value = null;
  boundMap = {};
  coarseMap = {};
  destroyEngine();
  const treeId = props.treeId;
  if (!treeId) {
    status.value = 'empty';
    return;
  }
  // ① 先读树元（独立 try）：树元读失败 / 非 2xx ⇒ 「地图数据加载失败 + 重试」；
  //    树元请求成功但无该 tree_id ⇒ 「未找到该家族树」（不给重试，因重试必然同样失败）。
  let entry: TreeEntry | undefined;
  try {
    const meta = await fetchTreeMetaRemote();
    entry = meta?.trees?.[treeId];
  } catch {
    status.value = 'error';
    return;
  }
  if (!entry) {
    status.value = 'not-found';
    return;
  }
  // ② 再读人员 / 家族：任一读失败或非 2xx ⇒ 「地图数据加载失败 + 重试」。
  try {
    const [peopleRes, families] = await Promise.all([
      fetchPersonList(treeId, 0, 0),
      fetchFamilyList(treeId),
    ]);
    const sites = buildMigrationSites({
      origin_code: String(entry.origin_code || ''),
      origin: String(entry.origin || ''),
      people: peopleRes.data,
      families: families.map((f) => ({
        father_handle: f.father_handle,
        mother_handle: f.mother_handle,
        child_handles: f.child_handles,
      })),
      founder_handle: String(entry.founder_handle || ''),
      founder_gramps_id: String(entry.founder_gramps_id || ''),
    });
    const p = buildMigrationMapPlan(sites);
    yearBasis.value = yearBasisOf(sites);
    applyYearDisplay(p, sites, yearBasis.value);
    plan.value = p;
    if (!p.hasSites) {
      status.value = 'empty';
      return;
    }
    const codes = collectBoundAdcodes(planSiteCodes(p));
    const bounds: Record<string, BoundFeatureCollection> = {};
    const coarse: Record<string, BoundFeatureCollection> = {};
    for (const code of codes) {
      const b = loadBound(code);
      if (b) bounds[code] = b;
      const cb = loadBoundCoarse(code);
      if (cb) coarse[code] = cb;
    }
    // 必需边界：全国省级底图 + 每个站点自身 + 每个站点的省
    const need = ['100000', ...planSiteCodes(p), ...planSiteCodes(p).map(provinceOf)];
    if (need.some((c) => !bounds[c])) {
      status.value = 'error';
      return;
    }
    boundMap = bounds;
    coarseMap = coarse;
    status.value = 'ready';
    await nextTick();
    mountEngine();
  } catch {
    status.value = 'error';
  }
}

function togglePlay(): void {
  if (controller) controller.toggle();
}
function prev(): void {
  if (controller) controller.prev();
}
function next(): void {
  if (controller) controller.next();
}
function replay(): void {
  if (controller) controller.replay();
}
function jump(i: number): void {
  if (controller) controller.jumpTo(i);
}

onMounted(() => {
  reload();
});
onBeforeUnmount(() => {
  destroyEngine();
});
</script>

<style scoped>
/* ============================================================================
   页面 / 布局（模板元素 ⇒ 普通 scoped 规则即可命中）
   ========================================================================== */
.mig {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  padding: 10px 12px 12px;
  background: #fffdf8;
  color: #3e2723;
  gap: 8px;
}
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.state-txt {
  font-size: 15px;
  color: #6d6055;
}
.spinner {
  font-size: 26px;
  color: #8b4513;
}
.retry {
  padding: 7px 20px;
  border: 1px solid #8b4513;
  border-radius: 9px;
  background: #fff;
}
.retry-hover {
  background: #f6efe6;
}
.retry-txt {
  font-size: 13px;
  color: #8b4513;
}
.ready {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 300px;
  background: #fffdf8;
  border: 1px solid #eae3d6;
  border-radius: 14px;
  overflow: hidden;
}
.hud {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hud-title {
  font-size: 15px;
  font-weight: 600;
  color: #8b4513;
}
.hud-desc {
  font-size: 12px;
  color: #6d6055;
}
.note {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: baseline;
}
.note-main {
  font-size: 12px;
  font-weight: 500;
  color: #8b4513;
}
.note-sub {
  font-size: 12px;
  color: #8a7b6c;
}
.timeline {
  display: flex;
  gap: 4px;
  background: #fff;
  border: 1px solid #eae3d6;
  border-radius: 12px;
  padding: 6px;
}
.tl-node {
  flex: 1;
  min-width: 0;
  border: 1px solid #eae3d6;
  border-radius: 9px;
  padding: 6px 4px;
  text-align: center;
  background: #fffdf8;
}
.tl-node.origin {
  border-color: #c9a227;
}
.tl-node.act {
  background: #8b4513;
  border-color: #8b4513;
}
.tl-node.act.origin {
  background: #c9a227;
  border-color: #8a6c12;
}
.tl-hover {
  background: #f6efe6;
}
.tl-node.act .tl-txt {
  color: #fff;
}
.tl-node.act.origin .tl-txt {
  color: #3a2c05;
}
.tl-txt {
  font-size: 12px;
  font-weight: 500;
  color: #3e2723;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  background: #fff;
  border: 1px solid #eae3d6;
  border-radius: 12px;
  padding: 7px 9px;
}
.ctrl {
  border: 1px solid #c9bfae;
  border-radius: 9px;
  padding: 6px 11px;
  background: #fffdf8;
}
.ctrl.primary {
  background: #8b4513;
  border-color: #8b4513;
}
.ctrl.primary .ctrl-txt {
  color: #fff;
  font-weight: 500;
}
.ctrl-hover {
  background: #f6efe6;
}
.ctrl-txt {
  font-size: 12px;
  color: #3e2723;
}
.progress {
  flex: 1;
  min-width: 90px;
  height: 6px;
  border-radius: 6px;
  background: #eae3d6;
  overflow: hidden;
}
.bar {
  height: 100%;
  background: #c9a227;
}
.ind {
  font-size: 12px;
  color: #8a7b6c;
}
.footnote {
  font-size: 11px;
  color: #9e8f80;
}

/* ============================================================================
   SVG 内部（map-engine.ts 用 document.createElementNS 动态创建 ⇒ 元素不带 data-v）
   ⚠️ 为什么必须是 :deep(...) 且必须从「模板里真实存在的容器」出发：
   uni-app H5 的 vite 插件 uni:css-scoped 会经由 addScoped() 给页面 / 组件 SFC 的
   每一个 <style> 块（包括显式不写 scoped 的「全局块」）强制注入 ` scoped`
   （见 @dcloudio/uni-cli-shared/dist/vite/plugins/cssScoped.js:16-32；只有 App.vue 例外）。
   故任何「拆出一个不带 scoped 的第二块」都会被编译成 `.face[data-v-…]` 而永不命中。
   唯一可行解：规则留在 scoped 块内，用 :deep() 把作用域锁到模板容器 `.stage`
   （它是模板元素，带 data-v），其后的 JS 创建元素一律不再要求 data-v。
   注意：`.mig-stage-svg`（svg 根）本身也是 JS 创建的、不带 data-v ⇒ 不能拿它当锚点。
   ========================================================================== */
.stage :deep(.mig-stage-svg) {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}
/* 高 DPR 清晰度：仅对「几何形状」启用平滑渲染（文字不受影响）；
   描边宽度一律 ≥ 1 CSS px 且带 non-scaling-stroke ⇒ 设备像素 = CSS px × DPR（DPR 1/2/3 均不发毛） */
.stage :deep(.face),
.stage :deep(.hk),
.stage :deep(.ring),
.stage :deep(.halo),
.stage :deep(.arc),
.stage :deep(.arc-glow) {
  shape-rendering: geometricPrecision;
}
.stage :deep(.lyr) {
  opacity: 0;
  transition: opacity 0.55s ease;
}
.stage :deep(.lyr.on) {
  opacity: 1;
}
.stage :deep(.face) {
  fill: #eae3d6;
  stroke: #c9bfae;
  /* ≥ 1 CSS px：DPR 1 下也不低于 1 设备像素（配合 non-scaling-stroke，不虚不毛） */
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
  fill-rule: evenodd;
}
.stage :deep(.hk) {
  opacity: 0;
  fill: #eae3d6;
  stroke: #c9bfae;
  stroke-width: 1.6px;
  vector-effect: non-scaling-stroke;
  fill-rule: evenodd;
  transition: fill 0.6s linear, stroke 0.6s linear, opacity 0.6s linear;
}
.stage :deep(.hk.pulse) {
  animation: mig-spulse 1.15s ease-out infinite;
}
.stage :deep(.hk.softpulse) {
  animation: mig-spulse2 1.6s ease-in-out infinite;
}
@keyframes mig-spulse {
  0% { stroke-width: 2px; stroke-opacity: 1; }
  70% { stroke-width: 6px; stroke-opacity: 0.3; }
  100% { stroke-width: 8px; stroke-opacity: 0; }
}
@keyframes mig-spulse2 {
  0%, 100% { stroke-opacity: 1; }
  50% { stroke-opacity: 0.45; }
}
.stage :deep(.site-dot) {
  fill: #c9a227;
  stroke: #fff;
  stroke-width: 1.4px;
}
.stage :deep(.site-dot.brown) {
  fill: #8b4513;
}
.stage :deep(.ring) {
  fill: none;
  stroke: #c9a227;
  stroke-width: 1.6px;
}
.stage :deep(.ring.brown) {
  stroke: #8b4513;
}
/* 小面指示圈（halo）：**固定半径**圆环（不扩散、不变粗），仅透明度呼吸 —— 与扩散环（r 7→41）明确区分 */
.stage :deep(.halo) {
  fill: none;
  stroke-width: 2.6px;
  stroke-opacity: 0.9;
  animation: mig-halo 2.6s ease-in-out infinite;
}
.stage :deep(.halo.gold) {
  stroke: #c9a227;
}
.stage :deep(.halo.brown) {
  stroke: #8b4513;
}
@keyframes mig-halo {
  0%,
  100% {
    stroke-opacity: 0.9;
  }
  50% {
    stroke-opacity: 0.4;
  }
}
.stage :deep(.arc) {
  fill: none;
  stroke: #c9a227;
  stroke-width: 2px;
  stroke-linecap: round;
}
.stage :deep(.arc.dash) {
  stroke-dasharray: 5 5;
  opacity: 0.75;
  stroke-width: 1.6px;
}
.stage :deep(.arc-glow) {
  fill: none;
  stroke: #c9a227;
  stroke-width: 7px;
  stroke-linecap: round;
}
.stage :deep(.dotmove) {
  fill: #fff3c4;
  stroke: #c9a227;
  stroke-width: 2px;
}
.stage :deep(.lb) {
  opacity: 0;
  transition: opacity 0.6s ease;
}
.stage :deep(.lb.on) {
  opacity: 1;
}
.stage :deep(.lb .lb-txt) {
  font-size: 13px;
  fill: #3e2723;
  paint-order: stroke;
  stroke: #fffdf8;
  stroke-width: 2px;
  stroke-linejoin: round;
}
.stage :deep(.lb.big .lb-txt) {
  font-size: 14px;
  font-weight: 500;
}
.stage :deep(.lb.gold .lb-txt) {
  fill: #7a5f10;
}
.stage :deep(.lb.gold rect) {
  fill: #fff8e2;
  stroke: #c9a227;
}
.stage :deep(.lb.brown .lb-txt) {
  fill: #fff;
  stroke: none;
}
.stage :deep(.lb.brown rect) {
  fill: #8b4513;
  stroke: #8a6c12;
}
.stage :deep(.lb rect) {
  fill: #fffdf6;
  stroke: #c9bfae;
  stroke-width: 1px;
}
/* 小面引线：质心 → 外移标签，细实线（不位移面本身几何） */
.stage :deep(.lb .leader) {
  stroke: #b9ad99;
  stroke-width: 1.1px;
}
.stage :deep(.lb.gold .leader) {
  stroke: #c9a227;
}
.stage :deep(.lb.brown .leader) {
  stroke: #8b4513;
}
.stage :deep(.lb .badge) {
  font-size: 13px;
  font-weight: 500;
}
</style>
