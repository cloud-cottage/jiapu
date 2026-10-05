/**
 * 迁徙地图 —— 数据推导**纯逻辑**（H5 与小程序共用；**纯函数、零 IO、零请求**、无 DOM / uni 依赖）
 *
 * 口径真源 = `docs/migration-map.spec.md`（§1 数据推导 · §10 世 + 波次分组）：
 *   · **收面**（§1-2）：只认 `origin_code` 三来源（出生地 / 居住地 / 葬地）；**无码纯文本不定位**（Q3=A）。
 *   · **去重计数**（§1-3）：同一人的多个字段 / 多条记录命中**同一码只计 1 人**；不同码各计 1。
 *   · **起点**（§1-1 / §1-5）：树 `origin_code` 成站，**从「波内站点」剔除**（不自环），人数单独保留。
 *   · **世数**（§10-3）：根 = 树元 `founder_handle`（回退 `founder_gramps_id`），沿 `families` 的
 *     father / mother → `child_handles` BFS，根 = 第 1 世；**无世数者不入站点**（计入 `unplacedCount`）。
 *   · **波次**（§10-1）：① 起点波（= `origin`）；② 主居地波 = 非起点站点中人数最多者（并列取码升序第一）；
 *     ③ 再分迁波 = 其余站点按「最早出现的世」升序，**相邻世（世差 ≤ `MIG_WAVE_GEN_WINDOW`）合并为同一波**，
 *     波内按**码升序**。
 *   · **无码记录**（§1-6）：不计入地图，只累计 `textOnlyCount`（**条数 = 人次数**，文本内容**不去重**）
 *     与去重后的前 `TEXT_ONLY_SAMPLE_LIMIT` 条样本串（供「另有文字记载 N 处」清单）。
 *   · **年份三态**（§17 · Kevin 2026-10-05 裁定 + Zang 补定中间态）：居住地条目可选 `place_start_year`；
 *     每站 `earliestYear` = 命中该码的居住地条目年份**最小值**（无 ⇒ 字段不出现）。三态（树级 · `sites` 含起点站）：
 *     全站有年份 ⇒ **模式 C** 尾波按年份分组（同年一批 · 窗口 0）；**全无** ⇒ 世代口径**逐字不变**；**部分** ⇒ 骨架仍按世代，
 *     仅**有年份的站点**附年份。三态判定 = `yearBasisOf()`；标签 / 时间轴文案单点 = `siteYearLabel()` / `yearWaveTimeline()`。
 */

/** 波次合并窗口（世差 ≤ 此值 ⇒ 并波）；**默认 0 = 严格一世一波**（人类 2026-10-05 裁定） */
export const MIG_WAVE_GEN_WINDOW = 0;

/** 无码样本串上限 N（「另有文字记载 N 处」清单只列去重后的前 N 条） */
export const TEXT_ONLY_SAMPLE_LIMIT = 5;

/**
 * 年份口径三态（§17）：`gen` = 全站点无年份（世代骨架 · **现状逐字不变**）/ `year` = 全站点有年份（尾波按年份）
 * / `mixed` = 部分有（骨架仍按世代 · 仅有年份的站点附年份）。**新增具名导出 · 不改既有签名。**
 */
export const MIG_YEAR_BASIS = { GEN: 'gen', YEAR: 'year', MIXED: 'mixed' } as const;
export type MigrationYearBasis = (typeof MIG_YEAR_BASIS)[keyof typeof MIG_YEAR_BASIS];

/** 站点标签追加年份（§17 **单点**）：`name` → `<name> · <year> 年起`；无年份 ⇒ 原样返回（现状不变） */
export function siteYearLabel(name: string, earliestYear?: string | null): string {
  return earliestYear ? `${name} · ${earliestYear} 年起` : name;
}

/** 年份波**时间轴展示位**（§17：把「第N世」换成「<year>年」） */
export function yearWaveTimeline(year: string, siteCount: number): string {
  return `${year}年 · 再分迁 · ${siteCount} 处`;
}

/** 年份波 HUD 标题（与 `yearWaveTimeline` 同口径，去掉处数） */
export function yearWaveTitle(year: string): string {
  return `${year}年 · 再分迁`;
}

const CODE_RE = /^\d{6}$/;
/** 居住地开始年份形态 = 4 位数字字符串（`place_start_year`；契约 v3 · `person-places.spec.md` §20 F1 / F3） */
const YEAR_RE = /^\d{4}$/;

/** 参与迁徙推导的人物（= `PersonSummary` 的只读子集；`location` 三来源口径见文件头） */
export interface MigrationPerson {
  handle?: string;
  gramps_id?: string;
  birth_place?: string;
  birth_place_code?: string;
  birth_place_note?: string;
  death_place?: string;
  death_place_code?: string;
  /** 居住地（多条）；每条可选 `place_start_year`（4 位数字年份 · 契约 v3 读响应键名） */
  residence_places?: Array<{ place?: string; place_code?: string; place_note?: string; place_start_year?: string }>;
}

/** 家族（仅取 BFS 必需三槽位；与树 JSON `families.<handle>` 同形） */
export interface MigrationFamily {
  father_handle?: string;
  mother_handle?: string;
  child_handles?: string[];
}

/** 输入：全树人物 + 家族 + 树元（起点 / 始祖） */
export interface MigrationInput {
  /** 树发源地码（6 位；空 / 缺失 = 无起点） */
  origin_code?: string;
  /** 树发源地展示串（起点展示用） */
  origin?: string;
  people: MigrationPerson[];
  families?: MigrationFamily[];
  /** 树元始祖 handle（BFS 根） */
  founder_handle?: string;
  /** 树元始祖 gramps_id（`founder_handle` 缺失时的回退锚点） */
  founder_gramps_id?: string;
}

/** 波内站点 */
export interface MigrationWaveSite {
  code: string;
  /** 该码命中人数（§1-3 去重后） */
  count: number;
  /** 命中该码者的世数（升序；`gens[0]` = 最早出现的世） */
  gens: number[];
  /**
   * 该站**最早居住地年份**（§17：命中该码的居住地条目 `place_start_year` 最小值，4 位数字字符串）。
   * **条件字段**：无年份时**不出现** ⇒ 「全无年份」输出与改动前**逐字一致**。
   */
  earliestYear?: string;
}

/** 一个波次 */
export interface MigrationWave {
  /** 波标识：`main`（主居地波）/ `gen:<最早世>`（再分迁波） */
  key: string;
  /** 该波站点涉及的世区间 `[最小世, 最大世]`（无站点 ⇒ `null`） */
  genRange: [number, number] | null;
  /** 波内站点（**码升序**） */
  sites: MigrationWaveSite[];
}

/** 起点波（= ① ；不从「波内站点」自环，人数 / 世单独保留） */
export interface MigrationOrigin {
  code: string;
  display: string;
  count: number;
  /** 命中起点码者的世数（升序） */
  gens: number[];
  /** 起点站**最早居住地年份**（§17；条件字段，无年份时不出现） */
  earliestYear?: string;
}

/** 出参（字段名 = 本实现最终签名，Jing 规格按此对齐） */
export interface MigrationSites {
  /** 起点波（树 `origin_code` 为空 ⇒ `null`） */
  origin: MigrationOrigin | null;
  /** 时间轴波次：**不含起点波**（起点单独走 `origin`）；本树恰 3 波（主居地波 + 世 24 波 + 世 25 波） */
  waves: MigrationWave[];
  /** 无码记录条数（人次数；文本内容不去重） */
  textOnlyCount: number;
  /** 无码样本串（去重后前 `TEXT_ONLY_SAMPLE_LIMIT` 条） */
  textOnlySamples: string[];
  /** 无世数者人数（BFS 不可达 ⇒ 不入任何站点） */
  unplacedCount: number;
}

/**
 * 三态判定（§17）：`sites` = **全部站点（含起点站）**。
 * 全有 ⇒ `year`；全无 ⇒ `gen`；部分 ⇒ `mixed`。**纯函数 · 不改输入。**
 */
export function yearBasisOf(sites: MigrationSites): MigrationYearBasis {
  let total = 0;
  let withYear = 0;
  const tally = (y?: string | null): void => {
    total += 1;
    if (y) withYear += 1;
  };
  if (sites.origin) tally(sites.origin.earliestYear);
  for (const w of sites.waves) for (const s of w.sites) tally(s.earliestYear);
  if (withYear === 0) return MIG_YEAR_BASIS.GEN;
  return withYear === total ? MIG_YEAR_BASIS.YEAR : MIG_YEAR_BASIS.MIXED;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const isCode = (v: unknown): v is string => typeof v === 'string' && CODE_RE.test(v);

/**
 * 世数（§10-3）：根 = `founder_handle`（回退 `founder_gramps_id` 对应 handle），
 * 沿 `families` 的 father / mother → `child_handles` BFS，根 = 第 1 世。
 * 返回 `Map<handle, gen>`；不可达者不在表中。
 */
function generationsOf(input: MigrationInput): Map<string, number> {
  const people = input?.people ?? [];
  const gen = new Map<string, number>();
  const byHandle = new Set<string>();
  for (const p of people) if (p?.handle) byHandle.add(p.handle);

  let root: string | undefined;
  if (input?.founder_handle && byHandle.has(input.founder_handle)) root = input.founder_handle;
  if (!root && input?.founder_gramps_id) {
    const hit = people.find((p) => p?.handle && p.gramps_id === input.founder_gramps_id);
    root = hit?.handle;
  }
  if (!root) return gen;

  const childrenOf = new Map<string, string[]>();
  for (const f of input?.families ?? []) {
    const kids = Array.isArray(f?.child_handles) ? f.child_handles : [];
    for (const parent of [f?.father_handle, f?.mother_handle]) {
      if (!parent || typeof parent !== 'string') continue;
      const arr = childrenOf.get(parent) ?? [];
      arr.push(...kids);
      childrenOf.set(parent, arr);
    }
  }

  const queue: string[] = [root];
  gen.set(root, 1);
  while (queue.length) {
    const h = queue.shift() as string;
    const g = gen.get(h) as number;
    for (const child of childrenOf.get(h) ?? []) {
      if (gen.has(child)) continue; // 防环 / 防重复
      gen.set(child, g + 1);
      queue.push(child);
    }
  }
  return gen;
}

/** 由树级数据推导迁徙波次（**纯函数**） */
export function buildMigrationSites(input: MigrationInput): MigrationSites {
  const people = input?.people ?? [];
  const gen = generationsOf(input);

  /** 码 → 人数 / 世列表（仅计入**有世数**者） */
  const count = new Map<string, number>();
  const gens = new Map<string, number[]>();
  /** 码 → 最早居住地年份（§17；仅居住地条目 `place_start_year`，取最小值） */
  const yearByCode = new Map<string, string>();

  const samples: string[] = [];
  const sampleSeen = new Set<string>();
  let textOnlyCount = 0;
  let unplacedCount = 0;

  for (const p of people) {
    const g = p?.handle !== undefined ? gen.get(p.handle) : undefined;
    if (g === undefined) unplacedCount += 1;

    // 同人三来源命中的码去重（§1-3）；无码文本按「条数」累计（§1-6，内容不去重）
    const hits = new Set<string>();
    /** 本人各码的最早居住地年份（§17；仅居住地条目携带 `place_start_year`） */
    const hitYears = new Map<string, string>();
    const note = (code: unknown, fallback: string): void => {
      if (isCode(code)) {
        hits.add(code);
        return;
      }
      const t = text(fallback);
      if (!t) return;
      textOnlyCount += 1;
      if (!sampleSeen.has(t)) {
        sampleSeen.add(t);
        if (samples.length < TEXT_ONLY_SAMPLE_LIMIT) samples.push(t);
      }
    };
    /** 居住地条目：有码 ⇒ 入 `hits` 并记最早年份；无码 ⇒ 走文本口径（与 `note` 同） */
    const noteResidence = (r: {
      place?: string;
      place_code?: string;
      place_note?: string;
      place_start_year?: string;
    }): void => {
      const code = r?.place_code;
      if (!isCode(code)) {
        note(undefined, text(r?.place_note) || text(r?.place));
        return;
      }
      hits.add(code);
      const y = typeof r?.place_start_year === 'string' && YEAR_RE.test(r.place_start_year) ? r.place_start_year : '';
      if (y && (!hitYears.has(code) || y < (hitYears.get(code) as string))) hitYears.set(code, y);
    };

    note(p?.birth_place_code, text(p?.birth_place_note) || text(p?.birth_place));
    if (Array.isArray(p?.residence_places)) for (const r of p.residence_places) noteResidence(r ?? {});
    note(p?.death_place_code, text(p?.death_place));

    if (g === undefined) continue; // 无世数 ⇒ 不入站点
    for (const code of hits) {
      count.set(code, (count.get(code) ?? 0) + 1);
      const arr = gens.get(code) ?? [];
      arr.push(g);
      gens.set(code, arr);
      const y = hitYears.get(code);
      if (y && (!yearByCode.has(code) || y < (yearByCode.get(code) as string))) yearByCode.set(code, y);
    }
  }

  const siteOf = (code: string): MigrationWaveSite => {
    const site: MigrationWaveSite = {
      code,
      count: count.get(code) ?? 0,
      gens: (gens.get(code) ?? []).slice().sort((a, b) => a - b),
    };
    const y = yearByCode.get(code);
    if (y) site.earliestYear = y; // 条件字段：全无年份时不出现 ⇒ 现状输出逐字不变
    return site;
  };
  const earliest = (code: string): number => {
    const arr = gens.get(code) ?? [];
    return arr.length ? Math.min(...arr) : Number.POSITIVE_INFINITY;
  };

  // ① 起点波：起点码从站点中剔除（不自环），人数 / 世单独保留
  let origin: MigrationOrigin | null = null;
  if (isCode(input?.origin_code)) {
    origin = {
      code: input.origin_code,
      display: text(input?.origin),
      count: count.get(input.origin_code) ?? 0,
      gens: (gens.get(input.origin_code) ?? []).slice().sort((a, b) => a - b),
    };
    const oy = yearByCode.get(input.origin_code);
    if (oy) origin.earliestYear = oy; // 条件字段（同上）
    count.delete(input.origin_code);
    gens.delete(input.origin_code);
  }

  const restCodes = [...count.keys()];

  /** 三态判定（§17）：`sites` = 全部站点（**含起点站**）；全有 ⇒ 年份模式，全无 ⇒ 世代，部分 ⇒ 混合 */
  const allSiteCodes: string[] = [...(origin ? [origin.code] : []), ...restCodes];
  const yearSites = allSiteCodes.filter((c) => yearByCode.has(c)).length;
  const basis: MigrationYearBasis =
    yearSites === 0
      ? MIG_YEAR_BASIS.GEN
      : yearSites === allSiteCodes.length
        ? MIG_YEAR_BASIS.YEAR
        : MIG_YEAR_BASIS.MIXED;

  // ② 主居地波：非起点站点中人数最多者（并列取码升序第一个）
  let mainCode: string | null = null;
  for (const code of restCodes) {
    if (mainCode === null) {
      mainCode = code;
      continue;
    }
    const c = count.get(code) as number;
    const m = count.get(mainCode) as number;
    if (c > m || (c === m && code < mainCode)) mainCode = code;
  }

  const waves: MigrationWave[] = [];
  if (mainCode !== null) {
    const s = siteOf(mainCode);
    waves.push({
      key: 'main',
      genRange: s.gens.length ? [s.gens[0], s.gens[s.gens.length - 1]] : null,
      sites: [s],
    });
  }

  // ③ 再分迁波（尾波）：**模式 C（年份）** 按 `earliest_year` 升序、同一年一批（窗口 0）；
  //    其余（`gen` / `mixed`）= 现状世代口径（按「最早出现的世」升序，相邻世合并窗口 `MIG_WAVE_GEN_WINDOW`）；均波内码升序
  const migrationCodes = restCodes.filter((code) => code !== mainCode);

  if (basis === MIG_YEAR_BASIS.YEAR) {
    const byYear = migrationCodes.slice().sort((a, b) => {
      const ya = yearByCode.get(a) as string;
      const yb = yearByCode.get(b) as string;
      return ya < yb ? -1 : ya > yb ? 1 : a < b ? -1 : a > b ? 1 : 0;
    });
    let yearBucket: { year: string; codes: string[] } | null = null;
    const flushYear = (): void => {
      if (!yearBucket) return;
      const codes = yearBucket.codes.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const egens = codes.map(earliest).filter((v) => Number.isFinite(v));
      waves.push({
        key: `gen:${yearBucket.year}`,
        genRange: egens.length ? [Math.min(...egens), Math.max(...egens)] : null,
        sites: codes.map(siteOf),
      });
      yearBucket = null;
    };
    for (const code of byYear) {
      const y = yearByCode.get(code) as string;
      if (yearBucket && y === yearBucket.year) {
        yearBucket.codes.push(code);
      } else {
        flushYear();
        yearBucket = { year: y, codes: [code] };
      }
    }
    flushYear();
  } else {
    const sorted = migrationCodes
      .slice()
      .sort((a, b) => earliest(a) - earliest(b) || (a < b ? -1 : a > b ? 1 : 0));
    let bucket: { min: number; max: number; codes: string[] } | null = null;
    const flush = (): void => {
      if (!bucket) return;
      const codes = bucket.codes.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      waves.push({
        key: `gen:${bucket.min}`,
        genRange: [bucket.min, bucket.max],
        sites: codes.map(siteOf),
      });
      bucket = null;
    };
    for (const code of sorted) {
      const eg = earliest(code);
      if (bucket && eg - bucket.max <= MIG_WAVE_GEN_WINDOW) {
        bucket.codes.push(code);
        bucket.max = Math.max(bucket.max, eg);
      } else {
        flush();
        bucket = { min: eg, max: eg, codes: [code] };
      }
    }
    flush();
  }

  return { origin, waves, textOnlyCount, textOnlySamples: samples, unplacedCount };
}
