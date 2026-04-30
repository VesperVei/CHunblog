export type ForceRelationKey = 'root' | 'depth1' | 'depth2' | 'depth3' | 'depth4' | 'depth5' | 'orphan';

export type ThemeMode = 'light' | 'dark';

export type HslaRule = {
  h: number;
  s: number;
  l: number;
  a?: number;
};

type ForceRelationPalette = Record<ForceRelationKey, HslaRule>;

type ForceLabelPalette = {
  text: HslaRule;
  textMuted: HslaRule;
  bg: HslaRule;
  bgActive: HslaRule;
  border: HslaRule;
};

type ForceEdgePalette = {
  normal: HslaRule;
  weak: HslaRule;
  active: HslaRule;
};

type ForceThemePalette = {
  node: ForceRelationPalette;
  label: ForceLabelPalette;
  edge: ForceEdgePalette;
};

export const obsidianNodePaletteLight: ForceRelationPalette = {
  root: { h: 0, s: 82, l: 42, a: 1 },
  depth1: { h: -42, s: 86, l: 56, a: 1 },
  depth2: { h: 42, s: 76, l: 45, a: 1 },
  depth3: { h: 88, s: 72, l: 45, a: 0.96 },
  depth4: { h: 145, s: 68, l: 58, a: 0.9 },
  depth5: { h: 200, s: 56, l: 72, a: 0.86 },
  orphan: { h: 0, s: 10, l: 72, a: 0.5 },
};

export const obsidianNodePaletteDark: ForceRelationPalette = {
  root: { h: 0, s: 88, l: 68, a: 1 },
  depth1: { h: -42, s: 88, l: 66, a: 1 },
  depth2: { h: 42, s: 82, l: 64, a: 1 },
  depth3: { h: 88, s: 78, l: 66, a: 0.96 },
  depth4: { h: 145, s: 74, l: 70, a: 0.92 },
  depth5: { h: 200, s: 66, l: 76, a: 0.88 },
  orphan: { h: 0, s: 8, l: 48, a: 0.42 },
};

export const obsidianLabelPalette: Record<ThemeMode, ForceLabelPalette> = {
  light: {
    text: { h: 0, s: 14, l: 20, a: 0.88 },
    textMuted: { h: 0, s: 10, l: 36, a: 0.62 },
    bg: { h: 0, s: 36, l: 96, a: 0.68 },
    bgActive: { h: 0, s: 68, l: 92, a: 0.82 },
    border: { h: 0, s: 24, l: 72, a: 0.32 },
  },
  dark: {
    text: { h: 0, s: 16, l: 88, a: 0.9 },
    textMuted: { h: 0, s: 10, l: 68, a: 0.64 },
    bg: { h: 0, s: 18, l: 14, a: 0.7 },
    bgActive: { h: 0, s: 42, l: 20, a: 0.82 },
    border: { h: 0, s: 20, l: 42, a: 0.34 },
  },
};

export const obsidianEdgePalette: Record<ThemeMode, ForceEdgePalette> = {
  light: {
    normal: { h: 0, s: 12, l: 42, a: 0.24 },
    weak: { h: 0, s: 10, l: 62, a: 0.12 },
    active: { h: 0, s: 78, l: 40, a: 0.58 },
  },
  dark: {
    normal: { h: 0, s: 12, l: 72, a: 0.3 },
    weak: { h: 0, s: 8, l: 58, a: 0.16 },
    active: { h: 0, s: 88, l: 70, a: 0.72 },
  },
};

export const graphArrowPalette: Record<ThemeMode, string> = {
  light: 'hsl(0 0% 10% / 0.96)',
  dark: 'hsl(0 0% 70% / 0.92)',
};

export const forceLegendOrder: ForceRelationKey[] = ['root', 'depth1', 'depth2', 'depth3', 'depth4', 'depth5'];

const depthWeightTable = [1.0, 0.88, 0.76, 0.64, 0.53, 0.44] as const;
const graphLevelWeightTable = [1.0, 0.95, 0.89, 0.81, 0.73, 0.65] as const;

export function normalizeGraphLevel(level?: number) {
  if (typeof level !== 'number' || Number.isNaN(level)) {
    return 3 as const;
  }

  return Math.max(0, Math.min(Math.round(level), 5)) as 0 | 1 | 2 | 3 | 4 | 5;
}

export function normalizeForceRelationDepth(depth?: number): ForceRelationKey {
  if (typeof depth !== 'number' || Number.isNaN(depth)) {
    return 'orphan';
  }

  if (depth <= 0) return 'root';
  if (depth === 1) return 'depth1';
  if (depth === 2) return 'depth2';
  if (depth === 3) return 'depth3';
  if (depth === 4) return 'depth4';
  return 'depth5';
}

export function normalizeRelationDepthIndex(depth?: number) {
  if (typeof depth !== 'number' || Number.isNaN(depth)) {
    return 5 as const;
  }

  return Math.max(0, Math.min(Math.round(depth), 5)) as 0 | 1 | 2 | 3 | 4 | 5;
}

export function getVisualWeight(relationDepth?: number, graphLevel?: number) {
  const depthWeight = depthWeightTable[normalizeRelationDepthIndex(relationDepth)];
  const levelWeight = graphLevelWeightTable[normalizeGraphLevel(graphLevel)];
  return depthWeight * 0.72 + levelWeight * 0.28;
}

export function deriveStroke(rule: HslaRule, themeMode: ThemeMode, strong = false): HslaRule {
  if (themeMode === 'dark') {
    return {
      h: rule.h,
      s: Math.min(rule.s + 8, 96),
      l: Math.min(rule.l + 10, 86),
      a: strong ? 0.95 : 0.72,
    };
  }

  return {
    h: rule.h,
    s: Math.min(rule.s + 6, 96),
    l: Math.max(rule.l - 18, 22),
    a: strong ? 0.92 : 0.68,
  };
}

export function deriveHalo(rule: HslaRule, themeMode: ThemeMode): HslaRule {
  return {
    h: rule.h,
    s: rule.s,
    l: themeMode === 'dark' ? Math.min(rule.l + 4, 84) : rule.l,
    a: themeMode === 'dark' ? 0.3 : 0.22,
  };
}

export function getObsidianThemePalette(themeMode: ThemeMode): ForceThemePalette {
  return {
    node: themeMode === 'dark' ? obsidianNodePaletteDark : obsidianNodePaletteLight,
    label: obsidianLabelPalette[themeMode],
    edge: obsidianEdgePalette[themeMode],
  };
}

export function getArrowMarkerColor(themeMode: ThemeMode) {
  return graphArrowPalette[themeMode];
}

export function getForceLegendLabel(key: ForceRelationKey, locale: string) {
  const isChinese = locale.toLowerCase() === 'zh-cn';
  const labels = {
    root: isChinese ? '当前节点' : 'Current Node',
    depth1: isChinese ? '一级节点' : 'Depth 1',
    depth2: isChinese ? '二级节点' : 'Depth 2',
    depth3: isChinese ? '三级节点' : 'Depth 3',
    depth4: isChinese ? '四级节点' : 'Depth 4',
    depth5: isChinese ? '五级节点+' : 'Depth 5+',
    orphan: isChinese ? '孤立节点' : 'Orphan',
  } satisfies Record<ForceRelationKey, string>;

  return labels[key];
}
