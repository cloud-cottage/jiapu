/**
 * 迁徙地图 —— 页面视图模型（**纯逻辑**，H5 / 小程序共用；零 IO、零 DOM、零请求）
 *
 * 口径真源 = `docs/migration-map.spec.md`。本模块只做两件事：
 *   ① 把 `buildMigrationSites()` 的出参整理成「时间轴 4 个节点」的页面计划（`MigrationMapPlan`）；
 *   ② 按页面需要算出要加载哪些 adcode 边界产物（`collectBoundAdcodes`）。
 *
 * 几何 / 投影 / 相机 / SVG 渲染一律在页面侧的 `map-engine.ts`（**仅 H5**），本模块不碰 DOM。
 */
import { resolveNames } from './geo';
import type { MigrationSites } from './migration-map';

const CODE_RE = /^\d{6}$/;

/** 一个上图站点（起点 / 主居地 / 再分迁点） */
export interface MigrationSiteRef {
  code: string;
  /** 短名（县 > 市 > 省；查无 → 码本身），时间轴与站点标签用 */
  name: string;
  /** 去重后命中人数 */
  count: number;
  /** 命中者世数（升序） */
  gens: number[];
}

/** 一个「再分迁」波（= 一个时间轴节点） */
export interface MigrationGenWave {
  /** 世（波 key = `gen:<gen>`） */
  gen: number;
  /** 波内站点（码升序） */
  sites: MigrationSiteRef[];
}

/** 页面计划：时间轴 4 节点 + 角标数据 */
export interface MigrationMapPlan {
  /** 起点（树 `origin_code`；无 ⇒ `null`） */
  origin: MigrationSiteRef | null;
  /** 主居地（`waves` 里 `key='main'` 的站点；无 ⇒ `null`） */
  main: MigrationSiteRef | null;
  /** 再分迁波（按世升序） */
  genWaves: MigrationGenWave[];
  /** 无码文字记录条数（角标「另有文字记载 N 处」） */
  textOnlyCount: number;
  /** 无码文字记录样本串 */
  textOnlySamples: string[];
  /**
   * 时间轴节点文案（逐字；本树 = 「起点 · 费县 · 4 人」「主居地 · 梨树区 · 3 人」
   * 「第24世 · 再分迁 · 2 处」「第25世 · 再分迁 · 2 处」）。
   * 顺序 = 时间轴从左到右，与渲染步骤 1:1。
   */
  timeline: string[];
  /** 是否存在任何可上图的站点 */
  hasSites: boolean;
}

/** 码 → 短名（县 > 市 > 省 > 码本身） */
export function shortNameOf(code: string): string {
  if (!CODE_RE.test(code)) return code;
  const n = resolveNames(code);
  return n.county || n.city || n.province || code;
}

/** 码的所属省（前 2 位 + `0000`） */
export function provinceOf(code: string): string {
  return CODE_RE.test(code) ? code.slice(0, 2) + '0000' : '';
}

/** 码的所属市（前 4 位 + `00`） */
export function cityOf(code: string): string {
  return CODE_RE.test(code) ? code.slice(0, 4) + '00' : '';
}

const toRef = (code: string, count: number, gens: number[]): MigrationSiteRef => ({
  code,
  name: shortNameOf(code),
  count,
  gens: gens.slice(),
});

/**
 * `buildMigrationSites()` → 时间轴节点 + 站点清单。
 * 主居地波取 `key='main'`（波内首站）；再分迁波按 `key='gen:<gen>'` 解析世数并升序。
 */
export function buildMigrationMapPlan(sites: MigrationSites): MigrationMapPlan {
  const origin = sites.origin
    ? toRef(sites.origin.code, sites.origin.count, sites.origin.gens)
    : null;

  const mainWave = sites.waves.find((w) => w.key === 'main') || null;
  const main = mainWave && mainWave.sites[0]
    ? toRef(mainWave.sites[0].code, mainWave.sites[0].count, mainWave.sites[0].gens)
    : null;

  const genWaves: MigrationGenWave[] = [];
  for (const w of sites.waves) {
    if (!w.key.startsWith('gen:')) continue;
    const gen = Number(w.key.slice(4));
    if (!Number.isFinite(gen)) continue;
    genWaves.push({ gen, sites: w.sites.map((s) => toRef(s.code, s.count, s.gens)) });
  }
  genWaves.sort((a, b) => a.gen - b.gen);

  const timeline: string[] = [];
  if (origin) timeline.push(`起点 · ${origin.name} · ${origin.count} 人`);
  if (main) timeline.push(`主居地 · ${main.name} · ${main.count} 人`);
  for (const g of genWaves) timeline.push(`第${g.gen}世 · 再分迁 · ${g.sites.length} 处`);

  return {
    origin,
    main,
    genWaves,
    textOnlyCount: sites.textOnlyCount,
    textOnlySamples: sites.textOnlySamples.slice(),
    timeline,
    hasSites: !!(origin || main || genWaves.length),
  };
}

/**
 * 需加载的边界产物 adcode 集合：每个码 ∪ 其省（前 2 + `0000`）∪ 其市（前 4 + `00`），
 * 并**固定含全国省级底图 `100000`**（第 24 / 25 世镜头所需）。返回升序去重数组。
 */
export function collectBoundAdcodes(codes: Array<string | undefined | null>): string[] {
  const set = new Set<string>(['100000']);
  for (const c of codes) {
    if (!c || !CODE_RE.test(c)) continue;
    set.add(c);
    set.add(provinceOf(c));
    set.add(cityOf(c));
  }
  return [...set].sort();
}

/** 计划涉及的站点码（起点 + 主居地 + 全部再分迁站，按需去重） */
export function planSiteCodes(plan: MigrationMapPlan): string[] {
  const out: string[] = [];
  if (plan.origin) out.push(plan.origin.code);
  if (plan.main) out.push(plan.main.code);
  for (const g of plan.genWaves) for (const s of g.sites) out.push(s.code);
  return out;
}
