/**
 * 迁徙地图 · SVG 渲染引擎（**仅 H5**；DOM / SVG 全部集中在此）
 *
 * 视觉 / 时序 / 交互基准 = 已验收原型 `variant-c.html`（变体 C）：原生 SVG 自绘、统一 Web Mercator
 * 投影、一个相机（viewBox 像素空间）驱动全部层级 —— 省 / 市 / 区县面同经纬度、同投影 ⇒ 可直接混绘
 * 并对齐。**几何一律来自 `business/geo/bounds/*.json`**（运行期零网络请求）。
 *
 * 本模块依赖 DOM / SVG ⇒ **只允许在 `#ifdef H5` 分支被 import**（小程序端走降级占位，见页面）。
 * 计时全部按「本步内已过毫秒」采样 ⇒ 暂停 / 回退安全。
 */
import type { MigrationMapPlan } from '@/business/migration-map-view';
import { provinceOf, cityOf } from '@/business/migration-map-view';
import type { BoundFeature, BoundFeatureCollection } from '@/business/geo/bounds-loader';

const NS = 'http://www.w3.org/2000/svg';
const COL = {
  face: '#EAE3D6', line: '#C9BFAE', ink: '#3E2723',
  hl: '#8B4513', gold: '#C9A227', hlEdge: '#5E2F0D', goldEdge: '#8A6C12',
};
type Tone = 'neutral' | 'brown' | 'gold';
const TONE: Record<Tone, { fill: string; stroke: string }> = {
  neutral: { fill: COL.face, stroke: COL.line },
  brown: { fill: COL.hl, stroke: COL.hlEdge },
  gold: { fill: COL.gold, stroke: COL.goldEdge },
};

const R2D = 180 / Math.PI;
const projX = (lon: number): number => lon;
const projY = (lat: number): number => -R2D * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const f4 = (v: number): number => Math.round(v * 1e4) / 1e4;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeIO = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

type Ring = Array<[number, number]>;
/** 投影坐标包围盒 `[minX, minY, maxX, maxY]` */
export type BBox = [number, number, number, number];

/** 小面可读性阈值（px）：站点自身面在当前镜头下的屏幕最小边 < 本值 ⇒ 叠加指示圈 + 引线外移标签 */
export const TINY_FACE_MIN_PX = 18;
/**
 * LOD（多分辨率分档）阈值（px）：**每个面**在当前镜头下的屏幕包围盒**最小边** < 本值 ⇒ 用**粗档**，
 * ≥ 本值 ⇒ 用**细档**（`business/geo/bounds/coarse/` 与 `bounds/` **逐 feature 一一对应**）。
 * ⚠️ 与 `TINY_FACE_MIN_PX`（halo / 引线阈值）**相互独立，不得合并、不得改那个值**。
 */
export const LOD_COARSE_MIN_PX = 24;
/** 小面指示圈（halo）屏幕固定半径（px）：**固定圆环**（不随缩放 / 不扩散），与既有「扩散环（r 7→41 递增）」区分 */
export const HALO_RADIUS_PX = 16;
/** 标签字号（px）：≥ 13 = 可读下限；big = 主站标签 */
export const LABEL_FONT_PX = 13;
export const LABEL_FONT_BIG_PX = 14;
export const BADGE_FONT_PX = 13;

/** 要素 → 环数组（Polygon / MultiPolygon 统一口径） */
function ringsOf(f: BoundFeature): Ring[] {
  const geo = f.geometry;
  if (!geo || !geo.coordinates) return [];
  const c = geo.coordinates as unknown;
  const out: Ring[] = [];
  if (geo.type === 'Polygon') {
    for (const ring of c as Ring[]) out.push(ring);
  } else if (geo.type === 'MultiPolygon') {
    for (const poly of c as Ring[][]) for (const ring of poly) out.push(ring);
  }
  return out;
}

/** 要素 → SVG path `d`（投影到相机像素空间；4 位小数） */
function featurePath(f: BoundFeature): string {
  const rings = ringsOf(f);
  let d = '';
  for (const r of rings) {
    for (let k = 0; k < r.length; k++) {
      const x = f4(projX(r[k][0]));
      const y = f4(projY(r[k][1]));
      d += (k ? 'L' : 'M') + x + ' ' + y;
    }
    d += 'Z';
  }
  return d;
}

/** 要素 → 投影坐标 BBox */
function featureBBox(f: BoundFeature): BBox | null {
  const rings = ringsOf(f);
  let bb: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  let any = false;
  for (const r of rings) {
    for (const p of r) {
      const x = projX(p[0]);
      const y = projY(p[1]);
      if (x < bb[0]) bb[0] = x;
      if (y < bb[1]) bb[1] = y;
      if (x > bb[2]) bb[2] = x;
      if (y > bb[3]) bb[3] = y;
      any = true;
    }
  }
  return any ? bb : null;
}

function unionBB(a: BBox | null, b: BBox): BBox {
  if (!a) return [b[0], b[1], b[2], b[3]];
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/**
 * 纯几何出口（**零 DOM**）：供引擎内部与独立探针（`scripts` / 冒烟）共用，避免两套公式漂移。
 */
export const projectedBBox = (f: BoundFeature): BBox | null => featureBBox(f);
export const unionBBox = (a: BBox | null, b: BBox): BBox => unionBB(a, b);
export const projectLon = (lon: number): number => projX(lon);
export const projectLat = (lat: number): number => projY(lat);

/** 相机 fit：包围盒 → `{ x, y, s }`（`pad` 为短边比例留白；空盒回退 `{0,0,1}`） */
export function fitBoxIn(bb: BBox | null, pad: number, W: number, H: number): { x: number; y: number; s: number } {
  if (!bb) return { x: 0, y: 0, s: 1 };
  const padPx = pad * Math.min(W, H);
  const w = Math.max(bb[2] - bb[0], 1e-6);
  const h = Math.max(bb[3] - bb[1], 1e-6);
  const s = Math.min((W - 2 * padPx) / w, (H - 2 * padPx) / h);
  return { x: (bb[0] + bb[2]) / 2, y: (bb[1] + bb[3]) / 2, s: clamp(s, 0.25, 30000) };
}

/** 标签版心（屏幕坐标锚点 + 版心尺寸） */
export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 标签落点（`visible=false` = 无空位 ⇒ 舍弃该标签） */
export interface LabelPlacement {
  x: number;
  y: number;
  visible: boolean;
}

/**
 * 标签避让（**纯函数 · 零 DOM**，引擎与探针共用）：沿用调用方给的首选偏移；仅在与已落标签相交
 * 或出界时沿 y 微移（±16px 档，至多 5 档）；候选位用尽 ⇒ `visible=false`（**宁舍号、不重叠**）。
 * 版心口径与 `.lb rect` 一致（左偏 6px / 上偏 1px）。
 */
export function layoutLabels(items: LabelBox[], W: number, H: number): LabelPlacement[] {
  const GAP = 1;
  const STEP = 16;
  const boxOf = (x: number, y: number, w: number, h: number): BBox =>
    [x - 6, y - h / 2 - 1, x - 6 + w, y + h / 2 - 1];
  const placed: BBox[] = [];
  const hit = (a: BBox): boolean =>
    placed.some((b) => a[0] < b[2] + GAP && a[2] > b[0] - GAP && a[1] < b[3] + GAP && a[3] > b[1] - GAP);
  // 出界判据 = 既有实现同口径（按锚点，而非版心 ⇒ 贴边标签照旧可见、只是被舞台裁切）
  const inStage = (x: number, y: number): boolean => x > -40 && x < W + 40 && y > -20 && y < H + 20;
  const out: LabelPlacement[] = [];
  for (const it of items) {
    let pick: LabelPlacement | null = null;
    for (let k = 0; k <= 10; k++) {
      const dy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * STEP;
      const x = it.x;
      const y = it.y + dy;
      const bx = boxOf(x, y, it.w, it.h);
      if (!inStage(x, y) || hit(bx)) continue;
      pick = { x, y, visible: true };
      break;
    }
    if (!pick) {
      out.push({ x: it.x, y: it.y, visible: false });
      continue;
    }
    placed.push(boxOf(pick.x, pick.y, it.w, it.h));
    out.push(pick);
  }
  return out;
}

/** 层级（用于绘制顺序：粗层在前、细层在后，区县面永远压在省 / 市面之上） */
function levelOf(code: string): number {
  if (code === '100000') return 0;
  if (code.slice(2) === '0000') return 1;
  if (code.slice(4) === '00') return 2;
  return 3;
}

interface Highlight { code: string; tone: Tone; at: number; op: number; dur: number; pulse?: boolean; soft?: boolean; _on?: boolean; }
interface RingFx { code: string; at: number; n: number; dur: number; tone: Tone; _on?: boolean; }
interface DotFx { code: string; at: number; tone: Tone; _on?: boolean; }
interface ArcFx { from: string; to: string; at: number; bend: number; dash?: boolean; withDot?: boolean; _on?: boolean; }
interface LabelFx { code: string; text: string; badge: string; cls: string; at: number; off: [number, number]; }
interface CamTarget { bbox: BBox | null; pad: number; }
interface RenderStep {
  key: string;
  title: string;
  desc: string;
  timelineIndex: number; // 1..N 时间轴节点序号（0 = 不在时间轴）
  timelineText: string;
  timelineOrigin: boolean;
  dur: number;
  cam: CamTarget;
  base: string[]; // 该步可见的底图分片 adcode
  highlights: Highlight[];
  rings: RingFx[];
  dots: DotFx[];
  arcs: ArcFx[];
  labels: LabelFx[];
}

export interface MigrationMapMountOptions {
  onStep?: (index: number, title: string, desc: string) => void;
  onTick?: (progress: number, playing: boolean, index: number) => void;
}

export interface MigrationMapController {
  readonly stepCount: number;
  play(): void;
  pause(): void;
  toggle(): void;
  prev(): void;
  next(): void;
  replay(): void;
  jumpTo(index: number): void;
  destroy(): void;
}

/**
 * 挂载迁徙地图。container 需已有确定尺寸（引擎按 `getBoundingClientRect` 取 W/H）。
 * `bounds` = `collectBoundAdcodes(...)` 命中的**细档**分片（已解压）；缺失的分片在构建步骤时按 `null` 跳过。
 * `coarseBounds` = 同码的**粗档**分片（LOD 第二档；**逐 feature 与细档一一对应**）。
 * 每个面按当前镜头下的屏幕最小边选档（< `LOD_COARSE_MIN_PX` ⇒ 粗档）；粗档缺失 ⇒ 该面恒用细档。
 */
export function mountMigrationMap(
  container: HTMLElement,
  plan: MigrationMapPlan,
  bounds: Record<string, BoundFeatureCollection>,
  coarseBounds: Record<string, BoundFeatureCollection> = {},
  opts: MigrationMapMountOptions = {},
): MigrationMapController {
  // ---- 索引：adcode → 要素（扫描全部分片；同一码取先扫描到的） ----
  const byCode = new Map<string, BoundFeature>();
  for (const fc of Object.values(bounds)) {
    for (const f of fc.features) {
      const code = String(f.properties && f.properties.adcode ? f.properties.adcode : '');
      if (code && /^\d{6}$/.test(code) && !byCode.has(code)) byCode.set(code, f);
    }
  }
  // ---- 粗档索引（同口径；与细档逐 feature 一一对应） ----
  const byCodeCoarse = new Map<string, BoundFeature>();
  for (const fc of Object.values(coarseBounds)) {
    for (const f of fc.features) {
      const code = String(f.properties && f.properties.adcode ? f.properties.adcode : '');
      if (code && /^\d{6}$/.test(code) && !byCodeCoarse.has(code)) byCodeCoarse.set(code, f);
    }
  }
  /** 码 → 细 / 粗两档 SVG path `d`（无粗档 ⇒ `coarse=null`） */
  const pathD = new Map<string, { fine: string; coarse: string | null }>();
  const pathOf = (code: string): { fine: string; coarse: string | null } | null => {
    const hit = pathD.get(code);
    if (hit) return hit;
    const f = byCode.get(code);
    if (!f) return null;
    const c = byCodeCoarse.get(code);
    const e = { fine: featurePath(f), coarse: c ? featurePath(c) : null };
    pathD.set(code, e);
    return e;
  };
  const bboxOf = (code: string): BBox | null => {
    const f = byCode.get(code);
    return f ? featureBBox(f) : null;
  };
  const fileBBox = (code: string): BBox | null => {
    const fc = bounds[code];
    if (!fc) return null;
    let bb: BBox | null = null;
    for (const f of fc.features) {
      const b = featureBBox(f);
      if (b) bb = unionBB(bb, b);
    }
    return bb;
  };

  // ---- 构建渲染步骤 ----
  const steps: RenderStep[] = [];
  buildSteps();
  if (!steps.length) {
    return { stepCount: 0, play(): void {}, pause(): void {}, toggle(): void {}, prev(): void {}, next(): void {}, replay(): void {}, jumpTo(): void {}, destroy(): void {} };
  }

  function buildSteps(): void {
    let tli = 0;
    if (plan.origin) {
      tli = 1;
      const code = plan.origin.code;
      steps.push({
        key: 'origin',
        title: `起点 · ${plan.origin.name}`,
        desc: `祖籍起点 · ${plan.origin.name} · ${plan.origin.count} 人`,
        timelineIndex: tli,
        timelineText: plan.timeline[0] || '',
        timelineOrigin: true,
        dur: 4300,
        cam: { bbox: bboxOf(code), pad: 0.3 },
        base: [provinceOf(code), cityOf(code)],
        highlights: [{ code, tone: 'gold', at: 300, op: 0.85, dur: 600, soft: true }],
        rings: [{ code, at: 500, n: 2, dur: 1900, tone: 'gold' }],
        dots: [],
        arcs: [],
        labels: [{ code, text: `${plan.origin.name} · 祖籍`, badge: `${plan.origin.count} 人`, cls: 'big gold', at: 800, off: [0, -30] }],
      });
    }
    if (plan.main) {
      tli = 2;
      const code = plan.main.code;
      const city = cityOf(code);
      const hl: Highlight[] = [];
      if (city && city !== code) hl.push({ code: city, tone: 'brown', at: 300, op: 0.85, dur: 700 });
      hl.push({ code, tone: 'neutral', at: 900, op: 1, dur: 350 });
      hl.push({ code, tone: 'brown', at: 1700, op: 0.85, dur: 600, pulse: true });
      steps.push({
        key: 'main',
        title: `主居地 · ${plan.main.name}`,
        desc: `迁居主居地 · ${plan.main.name} · ${plan.main.count} 人`,
        timelineIndex: tli,
        timelineText: plan.timeline[1] || '',
        timelineOrigin: false,
        dur: 5200,
        cam: { bbox: fileBBox(provinceOf(code)), pad: 0.1 },
        base: [provinceOf(code)],
        highlights: hl,
        rings: [{ code, at: 1800, n: 3, dur: 2100, tone: 'brown' }],
        dots: [{ code, at: 1750, tone: 'brown' }],
        arcs: [],
        labels: [{ code, text: `${plan.main.name} · 迁居`, badge: `${plan.main.count} 人`, cls: 'big brown', at: 2100, off: [10, 28] }],
      });
    }
    if (plan.genWaves.length) {
      // 镜头 = 全部再分迁点的并集（各波**逐字相同** ⇒ 波间零跳变）
      let camBB: BBox | null = null;
      for (const g of plan.genWaves) {
        for (const s of g.sites) {
          const bb = bboxOf(s.code);
          if (bb) camBB = unionBB(camBB, bb);
        }
      }
      const depot = plan.main;
      const provs = new Set<string>();
      for (const g of plan.genWaves) for (const s of g.sites) {
        const p = provinceOf(s.code);
        if (p) provs.add(p);
      }
      const lit: string[] = [];
      plan.genWaves.forEach((g, gi) => {
        const hl: Highlight[] = [];
        const rings: RingFx[] = [];
        const dots: DotFx[] = [];
        const arcs: ArcFx[] = [];
        const labels: LabelFx[] = [];
        const startPrev = gi === 0 ? 500 : 0;
        for (const p of provs) hl.push({ code: p, tone: 'brown', at: gi === 0 ? 400 : 0, op: 0.45, dur: 700 });
        if (depot) hl.push({ code: depot.code, tone: 'brown', at: startPrev, op: 0.9, dur: 400 });
        for (const c of lit) {
          hl.push({ code: c, tone: 'brown', at: startPrev, op: 0.9, dur: 400 });
          dots.push({ code: c, at: startPrev, tone: 'brown' });
        }
        g.sites.forEach((s, j) => {
          const at = 900 + j * 120;
          hl.push({ code: s.code, tone: 'brown', at, op: 0.9, dur: 450, pulse: true });
          rings.push({ code: s.code, at: at + 80, n: 2, dur: 2000, tone: 'brown' });
          dots.push({ code: s.code, at, tone: 'brown' });
          if (depot) arcs.push({ from: depot.code, to: s.code, at, bend: 0.08, dash: true, withDot: true });
          labels.push({ code: s.code, text: s.name, badge: `${s.count} 人`, cls: 'big brown', at: at + 600, off: j === 0 ? [0, -34] : [56, 62] });
        });
        if (depot) {
          for (const c of lit) arcs.push({ from: depot.code, to: c, at: 0, bend: 0.08, dash: true });
          labels.push({ code: depot.code, text: `${depot.name} · 出发地`, badge: '', cls: 'brown', at: gi === 0 ? 1300 : 300, off: [-186, 14] });
        }
        lit.push(...g.sites.map((s) => s.code));
        steps.push({
          key: g.sites.map((s) => s.code).join('+'),
          title: `第 ${g.gen} 世 · 再分迁`,
          desc: `第 ${g.gen} 世：${g.sites.map((s) => s.name).join(' + ')} 同批点亮（微错峰 120ms）`,
          timelineIndex: 3 + gi,
          timelineText: plan.timeline[2 + gi] || '',
          timelineOrigin: false,
          dur: gi === 0 ? 5600 : 6600,
          cam: { bbox: camBB, pad: 0.1 },
          base: ['100000'],
          highlights: hl,
          rings,
          dots,
          arcs,
          labels,
        });
      });
    }
  }

  // ---- DOM ----
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'mig-stage-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '迁徙地图');
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = '100%';
  container.appendChild(svg);

  const mk = (tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
    parent.appendChild(e);
    return e;
  };

  const gLayers = mk('g', {}, svg);
  const gOver = mk('g', {}, svg);
  const gFx = mk('g', {}, svg);
  const gLbl = mk('g', {}, svg);

  // 底图分片：按「粗层在前、细层在后」排序；**每个面**独立持有细 / 粗两档 path（按 LOD 切换）
  const baseCodes = [...new Set(steps.flatMap((s) => s.base))].filter((c) => bounds[c]).sort((a, b) => levelOf(a) - levelOf(b) || (a < b ? -1 : 1));
  const layerEl: Record<string, SVGElement> = {};
  const baseFaces: Array<{ code: string; el: SVGElement; fine: string; coarse: string | null }> = [];
  for (const code of baseCodes) {
    const g = mk('g', { class: 'lyr' }, gLayers);
    const fineFc = bounds[code];
    const coarseFc = coarseBounds[code];
    for (let i = 0; i < fineFc.features.length; i++) {
      const f = fineFc.features[i];
      const fc = coarseFc ? coarseFc.features[i] : null;
      const fcCode = String(f.properties.adcode);
      // 逐 feature 一一对应（同序号 + 同 adcode）才认这一份粗档；否则退回同码粗档 / 细档
      const coarseFeat = fc && String(fc.properties.adcode) === fcCode ? fc : byCodeCoarse.get(fcCode) || null;
      const fineD = featurePath(f);
      const el = mk('path', { class: 'face', d: fineD, 'fill-rule': 'evenodd' }, g);
      baseFaces.push({ code: fcCode, el, fine: fineD, coarse: coarseFeat ? featurePath(coarseFeat) : null });
    }
    layerEl[code] = g;
  }

  // 高亮叠加面（在全部底图之上；用码索引取要素，缺失则跳过）
  const ovCodes = [...new Set(steps.flatMap((s) => [...s.highlights.map((h) => h.code), ...s.rings.map((r) => r.code), ...s.dots.map((d) => d.code)]))]
    .filter((c) => byCode.has(c))
    .sort((a, b) => levelOf(a) - levelOf(b) || (a < b ? -1 : 1));
  const OV: Record<string, SVGElement> = {};
  const ovD: Record<string, { fine: string; coarse: string | null }> = {};
  for (const code of ovCodes) {
    const pd = pathOf(code) as { fine: string; coarse: string | null };
    ovD[code] = pd;
    OV[code] = mk('path', { class: 'hk', d: pd.fine, 'fill-rule': 'evenodd', 'data-code': code }, gOver);
  }

  // 点 / 环 / 弧的屏幕坐标锚点（取要素质心，回退中心，再回退 BBox 中心）
  const invProjY = (y: number): number => (2 * Math.atan(Math.exp(-y / R2D)) - Math.PI / 2) * (180 / Math.PI);
  const anchorOf = (code: string): [number, number] | null => {
    const f = byCode.get(code);
    if (!f) return null;
    const c = f.properties.centroid || f.properties.center;
    if (c) return [c[0], c[1]];
    const bb = featureBBox(f);
    return bb ? [(bb[0] + bb[2]) / 2, invProjY((bb[1] + bb[3]) / 2)] : null;
  };
  const ptOf = (code: string): [number, number] => {
    const ll = anchorOf(code);
    if (!ll) return [0, 0];
    return [projX(ll[0]), projY(ll[1])];
  };

  // ---- 相机 / 尺寸 ----
  let W = 900;
  let H = 560;
  const cam = { x: 0, y: 0, s: 1 };

  function sizeUp(): void {
    const r = container.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width || 900));
    H = Math.max(240, Math.round(r.height || 560));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }
  function applyCam(): void {
    const t = `translate(${W / 2} ${H / 2}) scale(${cam.s}) translate(${-cam.x} ${-cam.y})`;
    gLayers.setAttribute('transform', t);
    gOver.setAttribute('transform', t);
  }
  const toScreen = (p: [number, number]): [number, number] => [W / 2 + (p[0] - cam.x) * cam.s, H / 2 + (p[1] - cam.y) * cam.s];
  function fitBox(bb: BBox | null, pad: number): { x: number; y: number; s: number } {
    return fitBoxIn(bb, pad, W, H);
  }

  // ---- 状态机 ----
  const st = {
    i: -1, playing: true, vt: 0, t0: 0, camFrom: { x: 0, y: 0, s: 1 }, camTo: { x: 0, y: 0, s: 1 }, camT0: 0, camDur: 1500,
    /** 当前步「小面」码集（屏幕最小边 < TINY_FACE_MIN_PX）⇒ 叠加指示圈 + 引线外移标签 */
    tiny: new Set<string>(),
    /** 当前步「用粗档」的面码集（屏幕最小边 < LOD_COARSE_MIN_PX）—— 与 `tiny` **相互独立** */
    lod: new Set<string>(),
  };
  let fxRings: Array<{ code: string; t0: number; dur: number; n: number; tone: Tone; els?: SVGElement[] }> = [];
  let fxArcs: Array<{ p0: [number, number]; p1: [number, number]; p2: [number, number]; len: number; el: SVGElement; glow: SVGElement; t0: number; dur: number; dotEl: SVGElement | null; dotDur: number }> = [];
  let fxDots: Array<{ code: string; el: SVGElement }> = [];
  let fxHalos: Array<{ code: string; el: SVGElement }> = [];
  let LBL: Array<{ el: SVGElement; code: string; off: [number, number]; w: number; h: number; on: boolean; at: number; cls: string; leader: boolean; line: SVGLineElement | null }> = [];
  let step: RenderStep = steps[0];

  /** 站点自身面在当前镜头下的屏幕最小边（px）；无几何 ⇒ `Infinity` */
  function screenMinSide(code: string, scale: number): number {
    const bb = bboxOf(code);
    if (!bb) return Infinity;
    return Math.min(bb[2] - bb[0], bb[3] - bb[1]) * scale;
  }
  /** 当前步「站点」码集（有 dot / ring 的站点；省 / 市高亮面不计）中，屏幕最小边过小者 */
  function computeTiny(scale: number): Set<string> {
    const codes = new Set<string>();
    for (const d of step.dots) codes.add(d.code);
    for (const r of step.rings) codes.add(r.code);
    const tiny = new Set<string>();
    for (const c of codes) if (screenMinSide(c, scale) < TINY_FACE_MIN_PX) tiny.add(c);
    return tiny;
  }

  /** 当前镜头的「用粗档」面码集（**每个面**屏幕包围盒最小边 < `LOD_COARSE_MIN_PX`） */
  function computeLodCoarse(scale: number): Set<string> {
    const codes = new Set<string>();
    for (const r of baseFaces) codes.add(r.code);
    for (const c of ovCodes) codes.add(c);
    const coarse = new Set<string>();
    for (const c of codes) if (screenMinSide(c, scale) < LOD_COARSE_MIN_PX) coarse.add(c);
    return coarse;
  }

  /** 按当前镜头把**每个面**切到细 / 粗档（该面没有粗档 ⇒ 恒细档） */
  function applyLod(scale: number): void {
    st.lod = computeLodCoarse(scale);
    for (const r of baseFaces) r.el.setAttribute('d', st.lod.has(r.code) && r.coarse ? r.coarse : r.fine);
    for (const code of ovCodes) {
      const pd = ovD[code];
      OV[code].setAttribute('d', st.lod.has(code) && pd.coarse ? pd.coarse : pd.fine);
    }
  }

  function setLayers(list: string[]): void {
    for (const code of baseCodes) layerEl[code].setAttribute('class', 'lyr' + (list.indexOf(code) >= 0 ? ' on' : ''));
  }
  function clearFx(): void {
    while (gFx.firstChild) gFx.removeChild(gFx.firstChild);
    while (gLbl.firstChild) gLbl.removeChild(gLbl.firstChild);
    fxRings = [];
    fxArcs = [];
    fxDots = [];
    fxHalos = [];
    LBL = [];
    for (const k in OV) {
      const e = OV[k];
      e.setAttribute('class', 'hk');
      e.style.transition = '';
      e.style.opacity = '0';
      e.style.fill = TONE.neutral.fill;
      e.style.stroke = TONE.neutral.stroke;
    }
  }

  function buildLabels(): void {
    for (const d of step.labels) {
      const g = mk('g', { class: 'lb ' + d.cls }, gLbl);
      const fs = /big/.test(d.cls) ? LABEL_FONT_BIG_PX : LABEL_FONT_PX;
      const leader = st.tiny.has(d.code);
      const w = d.text.length * fs + 12;
      const h = fs + 8;
      let wAll = w;
      // 小面 ⇒ 引线（质心 → 外移标签边缘）；置于 rect 之下
      const line = leader ? (mk('line', { class: 'leader', x1: 0, y1: 0, x2: 0, y2: 0 }, g) as SVGLineElement) : null;
      const bg = mk('rect', { x: -6, y: -h / 2 - 1, width: w, height: h, rx: 6, ry: 6 }, g);
      const t = mk('text', { x: 0, y: 0 }, g);
      t.textContent = d.text;
      if (d.badge) {
        const bt = mk('text', { x: w, y: 0, class: 'badge' }, g);
        bt.textContent = d.badge;
        wAll = w + d.badge.length * BADGE_FONT_PX + 6;
        bg.setAttribute('width', String(wAll));
      }
      // 小面标签外移（沿首选偏移方向），避免压在面 / 指示圈上
      const off: [number, number] = leader
        ? [d.off[0], d.off[1] <= 0 ? -(HALO_RADIUS_PX + 22) : HALO_RADIUS_PX + 22]
        : [d.off[0], d.off[1]];
      LBL.push({ el: g, code: d.code, off, w: wAll, h, on: false, at: d.at, cls: d.cls, leader, line });
    }
  }

  function enterStep(i: number, instant?: boolean): void {
    st.i = i;
    step = steps[i];
    st.t0 = st.vt;
    clearFx();
    setLayers(step.base);
    st.camFrom = { x: cam.x, y: cam.y, s: cam.s };
    const t = fitBox(step.cam.bbox, step.cam.pad);
    st.camTo = { x: t.x, y: t.y, s: t.s };
    st.camDur = 1500;
    st.camT0 = st.vt;
    if (instant) {
      cam.x = st.camTo.x;
      cam.y = st.camTo.y;
      cam.s = st.camTo.s;
      st.camFrom = { x: cam.x, y: cam.y, s: cam.s };
    }
    st.tiny = computeTiny(st.camTo.s);
    applyLod(st.camTo.s);
    buildLabels();
    for (const r of step.highlights) r._on = false;
    for (const r of step.dots) r._on = false;
    for (const r of step.rings) r._on = false;
    for (const r of step.arcs) r._on = false;
    applyCam();
    if (opts.onStep) opts.onStep(i, step.title, step.desc);
  }

  function applyTimed(el: number): void {
    for (const r of step.highlights) {
      if (r._on || el < r.at) continue;
      r._on = true;
      const e = OV[r.code];
      if (!e) continue;
      const tone = TONE[r.tone];
      e.style.transition = `opacity ${r.dur}ms linear, fill ${r.dur}ms linear, stroke ${r.dur}ms linear`;
      e.style.fill = tone.fill;
      e.style.stroke = tone.stroke;
      e.style.opacity = String(r.op);
      if (r.pulse) e.setAttribute('class', 'hk');
      if (r.soft) e.setAttribute('class', 'hk softpulse');
    }
    for (const r of step.dots) {
      if (r._on || el < r.at) continue;
      r._on = true;
      // 小面：先落「指示圈（固定半径圆环）」，再落站点圆点（点压环上，成准星状）
      if (st.tiny.has(r.code)) {
        const hg = mk('g', { class: 'lb on' }, gFx);
        mk('circle', { class: 'halo ' + (r.tone === 'brown' ? 'brown' : 'gold'), r: HALO_RADIUS_PX, cx: 0, cy: 0 }, hg);
        fxHalos.push({ code: r.code, el: hg });
      }
      const g = mk('g', { class: 'lb on' }, gFx);
      mk('circle', { class: 'site-dot' + (r.tone === 'brown' ? ' brown' : ''), r: 4.6, cx: 0, cy: 0 }, g);
      fxDots.push({ code: r.code, el: g });
    }
    for (const r of step.rings) {
      if (r._on || el < r.at) continue;
      r._on = true;
      fxRings.push({ code: r.code, t0: el, dur: r.dur, n: r.n, tone: r.tone });
    }
    for (const r of step.arcs) {
      if (r._on || el < r.at) continue;
      r._on = true;
      addArc(r);
    }
    for (const s of LBL) {
      if (!s.on && el >= s.at) {
        s.on = true;
        s.el.setAttribute('class', 'lb ' + s.cls + ' on');
      }
    }
  }

  function bezier(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  }
  function addArc(r: ArcFx): void {
    const p0 = ptOf(r.from);
    const p2 = ptOf(r.to);
    const dx = p2[0] - p0[0];
    const dy = p2[1] - p0[1];
    const L = Math.hypot(dx, dy) || 1e-6;
    const p1: [number, number] = [(p0[0] + p2[0]) / 2 - (dy / L) * L * r.bend, (p0[1] + p2[1]) / 2 + (dx / L) * L * r.bend];
    const g = mk('g', {}, gOver);
    const d = `M${f4(p0[0])} ${f4(p0[1])}Q${f4(p1[0])} ${f4(p1[1])} ${f4(p2[0])} ${f4(p2[1])}`;
    const glow = mk('path', { class: 'arc-glow', d, 'vector-effect': 'non-scaling-stroke' }, g);
    const path = mk('path', { class: 'arc' + (r.dash ? ' dash' : ''), d, 'vector-effect': 'non-scaling-stroke' }, g);
    let len = 0;
    let prev = p0;
    for (let i = 1; i <= 60; i++) {
      const q = bezier(p0, p1, p2, i / 60);
      len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
    }
    path.setAttribute('stroke-dasharray', `${len} ${len}`);
    path.setAttribute('stroke-dashoffset', String(len));
    const dotEl = r.withDot ? mk('circle', { class: 'dotmove', r: 5.5, cx: 0, cy: 0, opacity: 0 }, gFx) : null;
    fxArcs.push({ p0, p1, p2, len, el: path, glow, t0: st.t0 + r.at, dur: 1200, dotEl, dotDur: 1100 });
  }

  function drawFx(el: number): void {
    for (let i = fxRings.length - 1; i >= 0; i--) {
      const r = fxRings[i];
      const p = (el - r.t0) / r.dur;
      if (p > 1) {
        if (r.els) for (const e of r.els) gFx.removeChild(e);
        fxRings.splice(i, 1);
        continue;
      }
      if (p < 0) continue;
      if (!r.els) {
        r.els = [];
        for (let k = 0; k < r.n; k++) r.els.push(mk('circle', { class: 'ring' + (r.tone === 'brown' ? ' brown' : ''), r: 6 }, gFx));
      }
      const sc = toScreen(ptOf(r.code));
      for (let k = 0; k < r.els.length; k++) {
        const lp = clamp(p * (1 + r.els.length * 0.18) - k * 0.22, 0, 1);
        r.els[k].setAttribute('cx', String(f4(sc[0])));
        r.els[k].setAttribute('cy', String(f4(sc[1])));
        r.els[k].setAttribute('r', String(f4(7 + easeOut(lp) * 34)));
        r.els[k].setAttribute('opacity', String(f4(clamp(1 - lp, 0, 1) * 0.95)));
      }
    }
    for (const r of fxArcs) {
      const p = clamp((el - (r.t0 - st.t0)) / r.dur, 0, 1);
      r.el.setAttribute('stroke-dashoffset', String(f4(r.len * (1 - easeIO(p)))));
      r.glow.setAttribute('opacity', String(f4(0.14 * p)));
      if (r.dotEl) {
        const dp = clamp((p * r.dur) / r.dotDur, 0, 1);
        if (dp <= 0) {
          r.dotEl.setAttribute('opacity', '0');
        } else {
          const q = bezier(r.p0, r.p1, r.p2, easeIO(dp));
          const sc2 = toScreen(q);
          r.dotEl.setAttribute('opacity', '1');
          r.dotEl.setAttribute('cx', String(f4(sc2[0])));
          r.dotEl.setAttribute('cy', String(f4(sc2[1])));
        }
      }
    }
  }

  function placeLabels(): void {
    const items: LabelBox[] = [];
    const anchor: Array<[number, number]> = [];
    for (const o of LBL) {
      const sc = toScreen(ptOf(o.code));
      const x = sc[0] + o.off[0];
      const y = sc[1] + o.off[1];
      anchor.push(sc);
      items.push({ x, y, w: o.w, h: o.h });
    }
    const placed = layoutLabels(items, W, H);
    for (let i = 0; i < LBL.length; i++) {
      const o = LBL[i];
      const p = placed[i];
      const vis = o.on && p.visible;
      o.el.style.visibility = vis ? 'visible' : 'hidden';
      if (!vis) continue;
      o.el.setAttribute('transform', `translate(${f4(p.x)} ${f4(p.y)})`);
      if (o.leader && o.line) {
        // 引线：质心（屏幕）→ 标签版心边缘；两端随相机 / 避让实时重算
        const fx = anchor[i][0] - p.x;
        const fy = anchor[i][1] - p.y;
        const bx = o.w / 2 - 6;
        const by = -1;
        const dx = fx - bx;
        const dy = fy - by;
        const k = 1 / Math.max(Math.abs(dx) / (o.w / 2), Math.abs(dy) / (o.h / 2), 1e-6);
        o.line.setAttribute('x1', String(f4(fx)));
        o.line.setAttribute('y1', String(f4(fy)));
        o.line.setAttribute('x2', String(f4(bx + dx * k)));
        o.line.setAttribute('y2', String(f4(by + dy * k)));
      }
    }
    for (const d of fxDots) {
      const s = toScreen(ptOf(d.code));
      d.el.setAttribute('transform', `translate(${f4(s[0])} ${f4(s[1])})`);
    }
    for (const h of fxHalos) {
      const s = toScreen(ptOf(h.code));
      h.el.setAttribute('transform', `translate(${f4(s[0])} ${f4(s[1])})`);
    }
  }

  // ---- 主循环 ----
  let raf = 0;
  let lastNow = 0;
  function frame(now: number): void {
    const dt = Math.min(60, Math.max(0, now - lastNow));
    lastNow = now;
    if (st.playing) st.vt += dt;
    const el = st.vt - st.t0;
    if (st.vt >= st.camT0) {
      const cp = clamp((st.vt - st.camT0) / st.camDur, 0, 1);
      const e = easeIO(cp);
      cam.x = lerp(st.camFrom.x, st.camTo.x, e);
      cam.y = lerp(st.camFrom.y, st.camTo.y, e);
      cam.s = lerp(st.camFrom.s, st.camTo.s, e);
      applyCam();
    }
    applyTimed(el);
    drawFx(el);
    placeLabels();
    if (opts.onTick) opts.onTick(clamp(el / step.dur, 0, 1), st.playing, st.i);
    if (st.playing && el >= step.dur) {
      if (st.i < steps.length - 1) enterStep(st.i + 1);
      else {
        st.playing = false;
        if (opts.onTick) opts.onTick(1, false, st.i);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  const onResize = (): void => {
    sizeUp();
    // 尺寸变化 ⇒ 重算目标镜头与「小面」判定（标签引线 / 指示圈随之按新 W/H 生效）；LOD 分档同步重算
    const t = fitBox(step.cam.bbox, step.cam.pad);
    st.camTo = { x: t.x, y: t.y, s: t.s };
    st.tiny = computeTiny(st.camTo.s);
    applyLod(st.camTo.s);
    applyCam();
  };
  window.addEventListener('resize', onResize);

  // ---- 启动 ----
  sizeUp();
  applyCam();
  lastNow = performance.now();
  enterStep(0, true);
  raf = requestAnimationFrame(frame);

  return {
    get stepCount(): number {
      return steps.length;
    },
    play(): void {
      if (!st.playing && st.i === steps.length - 1 && st.vt - st.t0 >= step.dur) {
        this.replay();
        return;
      }
      st.playing = true;
    },
    pause(): void {
      st.playing = false;
    },
    toggle(): void {
      if (st.playing) this.pause();
      else this.play();
    },
    prev(): void {
      enterStep(Math.max(0, st.i - 1));
      st.playing = true;
    },
    next(): void {
      enterStep(Math.min(steps.length - 1, st.i + 1));
      st.playing = true;
    },
    replay(): void {
      st.vt = 0;
      enterStep(0, true);
      st.playing = true;
    },
    jumpTo(index: number): void {
      enterStep(clamp(index, 0, steps.length - 1));
      st.playing = true;
    },
    destroy(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    },
  };
}
