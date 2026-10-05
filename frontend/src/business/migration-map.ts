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
 */

/** 波次合并窗口（世差 ≤ 此值 ⇒ 并波）；**默认 0 = 严格一世一波**（人类 2026-10-05 裁定） */
export const MIG_WAVE_GEN_WINDOW = 0;

/** 无码样本串上限 N（「另有文字记载 N 处」清单只列去重后的前 N 条） */
export const TEXT_ONLY_SAMPLE_LIMIT = 5;

const CODE_RE = /^\d{6}$/;

/** 参与迁徙推导的人物（= `PersonSummary` 的只读子集；`location` 三来源口径见文件头） */
export interface MigrationPerson {
  handle?: string;
  gramps_id?: string;
  birth_place?: string;
  birth_place_code?: string;
  birth_place_note?: string;
  death_place?: string;
  death_place_code?: string;
  residence_places?: Array<{ place?: string; place_code?: string; place_note?: string }>;
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

  const samples: string[] = [];
  const sampleSeen = new Set<string>();
  let textOnlyCount = 0;
  let unplacedCount = 0;

  for (const p of people) {
    const g = p?.handle !== undefined ? gen.get(p.handle) : undefined;
    if (g === undefined) unplacedCount += 1;

    // 同人三来源命中的码去重（§1-3）；无码文本按「条数」累计（§1-6，内容不去重）
    const hits = new Set<string>();
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

    note(p?.birth_place_code, text(p?.birth_place_note) || text(p?.birth_place));
    if (Array.isArray(p?.residence_places)) {
      for (const r of p.residence_places) note(r?.place_code, text(r?.place_note) || text(r?.place));
    }
    note(p?.death_place_code, text(p?.death_place));

    if (g === undefined) continue; // 无世数 ⇒ 不入站点
    for (const code of hits) {
      count.set(code, (count.get(code) ?? 0) + 1);
      const arr = gens.get(code) ?? [];
      arr.push(g);
      gens.set(code, arr);
    }
  }

  const siteOf = (code: string): MigrationWaveSite => ({
    code,
    count: count.get(code) ?? 0,
    gens: (gens.get(code) ?? []).slice().sort((a, b) => a - b),
  });
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
    count.delete(input.origin_code);
    gens.delete(input.origin_code);
  }

  const restCodes = [...count.keys()];

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

  // ③ 再分迁波：其余站点按「最早出现的世」升序，相邻世（世差 ≤ MIG_WAVE_GEN_WINDOW）合并；波内码升序
  const migrationCodes = restCodes
    .filter((code) => code !== mainCode)
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
  for (const code of migrationCodes) {
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

  return { origin, waves, textOnlyCount, textOnlySamples: samples, unplacedCount };
}
