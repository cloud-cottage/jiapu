/**
 * 统一图标引用（固化位置：frontend/src/static/icons/，uni-app 静态目录随包发布）
 *
 * 约定：禁止在组件里散落手写 '/static/icons/xx.svg' 路径——一律经本模块引用，
 * 便于统一改图标、避免引用随组件重构丢失（历史教训：性别徽章曾因弹窗层删除而失联）。
 */
export const ICON = {
  /** 性别徽章：男 / 女（黑底白字圆章） */
  GENDER_MALE: '/static/icons/male.svg',
  GENDER_FEMALE: '/static/icons/female.svg',
  /** 石榴籽（资产计量 / 市集标价「N 籽」） */
  SEED: '/static/icons/seed.png',
  /** 石榴籽玉（家族树凹槽镶玉 / 玉操作） */
  JADE: '/static/icons/jade.png',
  /** 竹简（行囊竹简格 / 资产页竹简行） */
  BAMBOO: '/static/icons/bamboo.png',
  /** 石榴籽碎片（签到碎片 · 行囊碎片格 / 资产页碎片行；不规则三角形） */
  FRAGMENT: '/static/icons/fragment.png',
  /** 兰帖（市集 / 行囊中的兰帖藏品） */
  SCROLL: '/static/icons/scroll.png',
  /** 兰帖碎片（兰帖碎裂产物） */
  SCROLL_SHARD: '/static/icons/scroll-shard.png',
} as const;

/** 按资产种类取图标 URL（seed→石榴籽 / jade→石榴籽玉 / 其它→空串不显示） */
export function assetIconSrc(kind: 'seed' | 'jade'): string {
  if (kind === 'seed') return ICON.SEED;
  if (kind === 'jade') return ICON.JADE;
  return '';
}

/** 按性别取图标 URL（M→男章 / F→女章 / 其它→空串不显示） */
export function genderIconSrc(gender?: 'M' | 'F' | 'U' | string | null): string {
  if (gender === 'M') return ICON.GENDER_MALE;
  if (gender === 'F') return ICON.GENDER_FEMALE;
  return '';
}

/**
 * 按**道具种类**（`kind`）取图标 URL —— 六类道具的**唯一映射点**（签到日历条 / 后续按 kind 出图处一律引用本函数）。
 * 键与 `business/inventory.ts` 的 `InventoryKind`、后端签到出参 `kind` 取值**同集**（逐字：
 * `fragment` / `bamboo` / `scrollFragment` / `scroll` / `seed` / `jade`）—— 本模块**不反向 import** 任何业务模块。
 * 未知 `kind` ⇒ 空串（调用方不渲染 `<image>`，**绝不回退到某个具体道具图标**以免指鹿为马）。
 */
export function assetKindIconSrc(kind: string): string {
  switch (kind) {
    case 'fragment': return ICON.FRAGMENT;
    case 'bamboo': return ICON.BAMBOO;
    case 'scrollFragment': return ICON.SCROLL_SHARD;
    case 'scroll': return ICON.SCROLL;
    case 'seed': return ICON.SEED;
    case 'jade': return ICON.JADE;
    default: return '';
  }
}
