import type { GraphLayoutMode } from '../types';
import { brainLayoutColors } from './brain';
import { getArrowMarkerColor, getObsidianThemePalette, type ForceRelationKey, type ThemeMode } from './force';
import { radialLayoutColors } from './radial';
import { treeLayoutColors } from './tree';
import type { GraphLayoutVisualConfig } from './types';

const layoutVisualConfigs: Record<Exclude<GraphLayoutMode, 'force'>, GraphLayoutVisualConfig> = {
  brain: brainLayoutColors,
  radial: radialLayoutColors,
  tree: treeLayoutColors,
};

export function getGraphLayoutVisualConfig(layout: Exclude<GraphLayoutMode, 'force'>) {
  return layoutVisualConfigs[layout];
}

export function formatThemeHueOffsetColor(hueOffset: number, saturation: number, lightness: number, alpha: number) {
  return `hsl(calc(var(--accent-h, var(--hue, 20)) + ${hueOffset}) ${saturation}% ${lightness}% / ${alpha})`;
}

export function getForceRelationColor(key: ForceRelationKey, isDarkTheme: boolean, alphaOverride?: number) {
  const relation = getObsidianThemePalette(isDarkTheme ? 'dark' : 'light').node[key];
  return formatThemeHueOffsetColor(relation.h, relation.s, relation.l, alphaOverride ?? relation.a ?? 1);
}

export function getGraphArrowColor(themeMode: ThemeMode) {
  return getArrowMarkerColor(themeMode);
}
