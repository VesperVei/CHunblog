import { defaultGraphSettings } from './constants';
import { cloneColorGroups, ensureColorGroups } from './color-groups';
import type { GraphSettings } from './types';

export type GraphViewPreset = {
  id: string;
  name: string;
  description?: string;
  version: number;
  builtin?: boolean;
  layout: Partial<GraphSettings['layout']>;
  appearance: Partial<GraphSettings['appearance']>;
  forces: Partial<GraphSettings['forces']>;
  colorGroups?: GraphSettings['colorGroups'];
  filters?: Partial<GraphSettings['filters']>;
  createdAt?: string;
  updatedAt?: string;
};

export const BUILTIN_GRAPH_PRESETS: GraphViewPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: '项目默认推荐方案',
    version: 1,
    builtin: true,
    layout: { preset: 'force', brainAnchorStrength: 0.35, preserveSelectedPreset: true },
    appearance: { ...defaultGraphSettings.appearance },
    forces: { ...defaultGraphSettings.forces },
    colorGroups: cloneColorGroups(defaultGraphSettings.colorGroups),
  },
  {
    id: 'obsidian-like',
    name: 'Obsidian-like',
    description: '接近 Obsidian Graph View 的基础手感',
    version: 1,
    builtin: true,
    layout: { preset: 'force', brainAnchorStrength: 0.35, preserveSelectedPreset: true },
    appearance: { showArrows: true, textOpacity: 0.8, nodeRadius: 6, focusNodeRadius: 9, linkWidth: 1.5, labelSize: 12 },
    forces: { centerStrength: 0.518713248970312, localGravityStrength: 0.1, repelStrength: 10, linkStrength: 1, linkDistance: 250, collisionStrength: 0.75, collisionPadding: 8, velocityDecay: 0.4, alphaDecay: 0.0228, alphaTargetOnDrag: 0.28, alphaOnSettingsChange: 0.6, chargeDistanceMin: 12, chargeDistanceMax: 900, linkIterations: 1, collideIterations: 1 },
    colorGroups: cloneColorGroups(defaultGraphSettings.colorGroups),
  },
  {
    id: 'compact',
    name: 'Compact',
    description: '更适合小屏幕与低密度图谱',
    version: 1,
    builtin: true,
    layout: { preset: 'force', brainAnchorStrength: 0.4, preserveSelectedPreset: true },
    appearance: { nodeRadius: 5, focusNodeRadius: 8, linkWidth: 1.3, labelSize: 11, textOpacity: 0.76 },
    forces: { centerStrength: 0.58, localGravityStrength: 0.12, repelStrength: 8, linkStrength: 1, linkDistance: 180, collisionStrength: 0.78, collisionPadding: 6 },
    colorGroups: cloneColorGroups(defaultGraphSettings.colorGroups),
  },
  {
    id: 'spacious',
    name: 'Spacious',
    description: '更适合大屏幕与复杂图谱',
    version: 1,
    builtin: true,
    layout: { preset: 'force', brainAnchorStrength: 0.32, preserveSelectedPreset: true },
    appearance: { nodeRadius: 7, focusNodeRadius: 10, linkWidth: 1.6, labelSize: 12, textOpacity: 0.82 },
    forces: { centerStrength: 0.46, localGravityStrength: 0.08, repelStrength: 12, linkStrength: 1, linkDistance: 320, collisionStrength: 0.72, collisionPadding: 10 },
    colorGroups: cloneColorGroups(defaultGraphSettings.colorGroups),
  },
];

export function getGraphPresetById(presets: GraphViewPreset[], presetId?: string) {
  if (!presetId) {
    return undefined;
  }

  return presets.find((preset) => preset.id === presetId);
}

export function mergePresetIntoSettings(settings: GraphSettings, preset: GraphViewPreset) {
  return {
    ...settings,
    layout: {
      ...settings.layout,
      ...preset.layout,
    },
    appearance: {
      ...settings.appearance,
      ...preset.appearance,
    },
    forces: {
      ...settings.forces,
      ...preset.forces,
    },
    colorGroups: ensureColorGroups(preset.colorGroups ?? settings.colorGroups),
    filters: settings.filters,
  };
}

function normalizePresetId(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '') || 'custom-preset';
}

export function createPresetFromSettings(name: string, settings: GraphSettings): GraphViewPreset {
  const now = new Date().toISOString();

  return {
    id: normalizePresetId(name),
    name,
    version: 1,
    builtin: false,
    layout: { ...settings.layout },
    appearance: { ...settings.appearance },
    forces: { ...settings.forces },
    colorGroups: cloneColorGroups(settings.colorGroups),
    createdAt: now,
    updatedAt: now,
  };
}
