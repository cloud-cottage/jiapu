/**
 * 迁徙地图 · 边界产物**按需加载器**（**仅 H5**；运行期零网络请求）
 *
 * 产物 = `frontend/src/business/geo/bounds/<adcode>.json`（**细档**）与
 * `frontend/src/business/geo/bounds/coarse/<adcode>.json`（**粗档 · LOD 第二档**），
 * 内容 = `base64(deflateRaw(UTF-8 GeoJSON))` 字符串；解压**复用既有** `./inflate.ts` 的
 * `inflateBase64ToUtf8`（**不得另写解压器**）。
 * 真源 = `config/geo-bounds/<adcode>.json`（细）/ `config/geo-bounds/coarse/<adcode>.json`（粗）；
 * 产物由 `scripts/gen-geo-bounds.mjs` 生成（禁止手改）；两档 adcode 集合**完全一致**，
 * 且**逐 feature 一一对应**（同数量 / 同顺序 / 同 `properties.adcode`）⇒ 渲染器可**按单个面选档**。
 *
 * ⚠️ 本文件静态 import 两档全部分片（细档 ≈ 690 KB + 粗档 ≈ 60 KB）；**只允许在 `#ifdef H5`
 * 分支被 import**，使小程序构建经条件编译剥离 ⇒ 不占主包（微信主包上限 2 MiB）。
 */
import { inflateBase64ToUtf8 } from './inflate';

import b100000 from './bounds/100000.json';
import b130000 from './bounds/130000.json';
import b130200 from './bounds/130200.json';
import b130208 from './bounds/130208.json';
import b130229 from './bounds/130229.json';
import b130300 from './bounds/130300.json';
import b130302 from './bounds/130302.json';
import b210000 from './bounds/210000.json';
import b210900 from './bounds/210900.json';
import b230000 from './bounds/230000.json';
import b230100 from './bounds/230100.json';
import b230300 from './bounds/230300.json';
import b230302 from './bounds/230302.json';
import b230303 from './bounds/230303.json';
import b230305 from './bounds/230305.json';
import b231000 from './bounds/231000.json';
import b231025 from './bounds/231025.json';
import b231081 from './bounds/231081.json';
import b231085 from './bounds/231085.json';
import b231200 from './bounds/231200.json';
import b231281 from './bounds/231281.json';
import b370000 from './bounds/370000.json';
import b370100 from './bounds/370100.json';
import b371300 from './bounds/371300.json';
import b371323 from './bounds/371323.json';
import b371325 from './bounds/371325.json';
import b610000 from './bounds/610000.json';
import b610100 from './bounds/610100.json';
import b610122 from './bounds/610122.json';
import c100000 from './bounds/coarse/100000.json';
import c130000 from './bounds/coarse/130000.json';
import c130200 from './bounds/coarse/130200.json';
import c130208 from './bounds/coarse/130208.json';
import c130229 from './bounds/coarse/130229.json';
import c130300 from './bounds/coarse/130300.json';
import c130302 from './bounds/coarse/130302.json';
import c210000 from './bounds/coarse/210000.json';
import c210900 from './bounds/coarse/210900.json';
import c230000 from './bounds/coarse/230000.json';
import c230100 from './bounds/coarse/230100.json';
import c230300 from './bounds/coarse/230300.json';
import c230302 from './bounds/coarse/230302.json';
import c230303 from './bounds/coarse/230303.json';
import c230305 from './bounds/coarse/230305.json';
import c231000 from './bounds/coarse/231000.json';
import c231025 from './bounds/coarse/231025.json';
import c231081 from './bounds/coarse/231081.json';
import c231085 from './bounds/coarse/231085.json';
import c231200 from './bounds/coarse/231200.json';
import c231281 from './bounds/coarse/231281.json';
import c370000 from './bounds/coarse/370000.json';
import c370100 from './bounds/coarse/370100.json';
import c371300 from './bounds/coarse/371300.json';
import c371323 from './bounds/coarse/371323.json';
import c371325 from './bounds/coarse/371325.json';
import c610000 from './bounds/coarse/610000.json';
import c610100 from './bounds/coarse/610100.json';
import c610122 from './bounds/coarse/610122.json';

/** 单个要素（`properties` 已被瘦身到 `adcode/name/centroid/center`；几何统一 `MultiPolygon`） */
export interface BoundFeature {
  type: 'Feature';
  properties: {
    adcode: number;
    name: string;
    centroid?: [number, number];
    center?: [number, number];
  };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

/** 一个 adcode 分片 = 该码的「全子级」边界（叶级 = 自身单要素） */
export interface BoundFeatureCollection {
  type: 'FeatureCollection';
  features: BoundFeature[];
}

/** adcode → 压缩载荷（base64）· **细档** */
const RAW: Record<string, string> = {
  '100000': b100000,
  '130000': b130000,
  '130200': b130200,
  '130208': b130208,
  '130229': b130229,
  '130300': b130300,
  '130302': b130302,
  '210000': b210000,
  '210900': b210900,
  '230000': b230000,
  '230100': b230100,
  '230300': b230300,
  '230302': b230302,
  '230303': b230303,
  '230305': b230305,
  '231000': b231000,
  '231025': b231025,
  '231081': b231081,
  '231085': b231085,
  '231200': b231200,
  '231281': b231281,
  '370000': b370000,
  '370100': b370100,
  '371300': b371300,
  '371323': b371323,
  '371325': b371325,
  '610000': b610000,
  '610100': b610100,
  '610122': b610122,
};

/** adcode → 压缩载荷（base64）· **粗档**（LOD 第二档；与细档逐 feature 一一对应） */
const RAW_COARSE: Record<string, string> = {
  '100000': c100000,
  '130000': c130000,
  '130200': c130200,
  '130208': c130208,
  '130229': c130229,
  '130300': c130300,
  '130302': c130302,
  '210000': c210000,
  '210900': c210900,
  '230000': c230000,
  '230100': c230100,
  '230300': c230300,
  '230302': c230302,
  '230303': c230303,
  '230305': c230305,
  '231000': c231000,
  '231025': c231025,
  '231081': c231081,
  '231085': c231085,
  '231200': c231200,
  '231281': c231281,
  '370000': c370000,
  '370100': c370100,
  '371300': c371300,
  '371323': c371323,
  '371325': c371325,
  '610000': c610000,
  '610100': c610100,
  '610122': c610122,
};

/** 随包内可用的 adcode（升序；**两档集合一致**） */
export const BOUND_ADCODES: string[] = Object.keys(RAW).sort();
/** 随包内可用的**粗档** adcode（升序；与 `BOUND_ADCODES` 一致） */
export const BOUND_COARSE_ADCODES: string[] = Object.keys(RAW_COARSE).sort();

/**
 * 解压单个分片；缺失 → `null`。载荷 = `base64(deflateRaw(UTF-8 GeoJSON))`。
 * @throws JSON / 解压损坏时抛出（调用方按「地图数据加载失败」处理）
 */
export function loadBound(code: string): BoundFeatureCollection | null {
  const b64 = RAW[code];
  if (!b64) return null;
  return JSON.parse(inflateBase64ToUtf8(b64)) as BoundFeatureCollection;
}

/**
 * 解压单个**粗档**分片；缺失 → `null`（调用方回退细档）。
 * 载荷形状与 `loadBound` 完全一致（同一 `inflateBase64ToUtf8` 入口）。
 */
export function loadBoundCoarse(code: string): BoundFeatureCollection | null {
  const b64 = RAW_COARSE[code];
  if (!b64) return null;
  return JSON.parse(inflateBase64ToUtf8(b64)) as BoundFeatureCollection;
}
