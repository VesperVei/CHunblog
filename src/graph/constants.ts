import type {
  GraphColorGroup,
  GraphAppearanceSettings,
  GraphFilterSettings,
  GraphForceSettings,
  GraphLayoutMode,
  GraphLayoutSettings,
  GraphSettings,
  GraphViewMode,
} from './types';
import { DEFAULT_GRAPH_LEVEL_COLOR_GROUPS, ensureColorGroups } from './color-groups';

export const GRAPH_COLORS: Record<string, string> = {
  project_note: '#f97316',
  concept_note: '#8b5cf6',
  blog_post: '#14b8a6',
  default: '#94a3b8',
};

export const DEFAULT_LAYOUT: GraphLayoutMode = 'force';
export const DEFAULT_DEPTH = 1;

export const DEFAULT_FORCE_SETTINGS: Record<GraphLayoutMode, GraphForceSettings> = {
  force: {
    centerStrength: 0.518713248970312,
    localGravityStrength: 0.1,
    repelStrength: 35,
    linkStrength: 1,
    linkDistance: 250,
    collisionStrength: 0.75,
    collisionPadding: 8,
    velocityDecay: 0.38,
    alphaDecay: 0.022,
    alphaTargetOnDrag: 0.28,
    alphaOnSettingsChange: 0.6,
    chargeDistanceMin: 12,
    chargeDistanceMax: 900,
    linkIterations: 1,
    collideIterations: 1,
  },
  brain: {
    centerStrength: 0.518713248970312,
    localGravityStrength: 0.1,
    repelStrength: 35,
    linkStrength: 1,
    linkDistance: 250,
    collisionStrength: 0.75,
    collisionPadding: 8,
    velocityDecay: 0.38,
    alphaDecay: 0.022,
    alphaTargetOnDrag: 0.28,
    alphaOnSettingsChange: 0.6,
    chargeDistanceMin: 12,
    chargeDistanceMax: 900,
    linkIterations: 1,
    collideIterations: 1,
  },
  radial: {
    centerStrength: 0.518713248970312,
    localGravityStrength: 0.1,
    repelStrength: 35,
    linkStrength: 1,
    linkDistance: 250,
    collisionStrength: 0.75,
    collisionPadding: 8,
    velocityDecay: 0.38,
    alphaDecay: 0.022,
    alphaTargetOnDrag: 0.28,
    alphaOnSettingsChange: 0.6,
    chargeDistanceMin: 12,
    chargeDistanceMax: 900,
    linkIterations: 1,
    collideIterations: 1,
  },
  hierarchy: {
    centerStrength: 0.518713248970312,
    localGravityStrength: 0.1,
    repelStrength: 35,
    linkStrength: 1,
    linkDistance: 250,
    collisionStrength: 0.75,
    collisionPadding: 8,
    velocityDecay: 0.38,
    alphaDecay: 0.022,
    alphaTargetOnDrag: 0.28,
    alphaOnSettingsChange: 0.6,
    chargeDistanceMin: 12,
    chargeDistanceMax: 900,
    linkIterations: 1,
    collideIterations: 1,
  },
};

export const DEFAULT_APPEARANCE_SETTINGS: GraphAppearanceSettings = {
  showArrows: true,
  textOpacity: 0.8,
  nodeRadius: 6,
  focusNodeRadius: 9,
  linkWidth: 1.5,
  labelSize: 12,
};

export const DEFAULT_FILTER_SETTINGS: GraphFilterSettings = {
  searchQuery: '',
  depth: 1,
  showBacklinks: true,
  showForwardLinks: true,
  showCrossLinks: true,
  showTags: false,
  showAttachments: true,
  onlyExistingNotes: false,
};

export const DEFAULT_LAYOUT_SETTINGS: GraphLayoutSettings = {
  preset: 'force',
  brainAnchorStrength: 0.35,
  preserveSelectedPreset: true,
};

export const DEFAULT_COLOR_GROUP_SETTINGS: GraphColorGroup[] = ensureColorGroups(DEFAULT_GRAPH_LEVEL_COLOR_GROUPS);

export const defaultGraphSettings: GraphSettings = {
  filters: DEFAULT_FILTER_SETTINGS,
  appearance: DEFAULT_APPEARANCE_SETTINGS,
  forces: DEFAULT_FORCE_SETTINGS.force,
  layout: DEFAULT_LAYOUT_SETTINGS,
  colorGroups: DEFAULT_COLOR_GROUP_SETTINGS,
};

export const MODE_DEFAULTS: Record<GraphViewMode, { forces: GraphForceSettings; appearance: GraphAppearanceSettings; filters: GraphFilterSettings }> = {
  global: {
    forces: {
      centerStrength: 0.518713248970312,
      localGravityStrength: 0.1,
      repelStrength: 35,
      linkStrength: 1,
      linkDistance: 250,
      collisionStrength: 0.75,
      collisionPadding: 8,
      velocityDecay: 0.38,
      alphaDecay: 0.022,
      alphaTargetOnDrag: 0.28,
      alphaOnSettingsChange: 0.6,
      chargeDistanceMin: 12,
      chargeDistanceMax: 900,
      linkIterations: 1,
      collideIterations: 1,
    },
    appearance: {
      showArrows: true,
      textOpacity: 0.75,
      nodeRadius: 6,
      focusNodeRadius: 9,
      linkWidth: 1.4,
      labelSize: 12,
    },
    filters: {
      ...DEFAULT_FILTER_SETTINGS,
    },
  },
  local: {
    forces: {
      centerStrength: 0.518713248970312,
      localGravityStrength: 0.1,
      repelStrength: 35,
      linkStrength: 1,
      linkDistance: 250,
      collisionStrength: 0.75,
      collisionPadding: 8,
      velocityDecay: 0.38,
      alphaDecay: 0.022,
      alphaTargetOnDrag: 0.28,
      alphaOnSettingsChange: 0.6,
      chargeDistanceMin: 12,
      chargeDistanceMax: 900,
      linkIterations: 1,
      collideIterations: 1,
    },
    appearance: {
      showArrows: true,
      textOpacity: 0.8,
      nodeRadius: 6,
      focusNodeRadius: 10,
      linkWidth: 1.5,
      labelSize: 12,
    },
    filters: {
      ...DEFAULT_FILTER_SETTINGS,
      depth: DEFAULT_DEPTH,
    },
  },
};

export function resolveGraphSettings(mode: GraphViewMode, preset: GraphLayoutMode, overrides: Partial<GraphSettings> = {}): GraphSettings {
  const modeDefaults = MODE_DEFAULTS[mode];

  return {
    filters: {
      ...DEFAULT_FILTER_SETTINGS,
      ...modeDefaults.filters,
      ...(overrides.filters ?? {}),
    },
    appearance: {
      ...DEFAULT_APPEARANCE_SETTINGS,
      ...modeDefaults.appearance,
      ...(overrides.appearance ?? {}),
    },
    forces: {
      ...DEFAULT_FORCE_SETTINGS[preset],
      ...modeDefaults.forces,
      ...(overrides.forces ?? {}),
    },
    layout: {
      ...DEFAULT_LAYOUT_SETTINGS,
      preset,
      ...(overrides.layout ?? {}),
    },
    colorGroups: ensureColorGroups(overrides.colorGroups ?? DEFAULT_COLOR_GROUP_SETTINGS),
  };
}

export function getActiveLayoutPreset(settings: GraphSettings) {
  return settings.layout.preset ?? DEFAULT_LAYOUT;
}

export function getEffectiveCollisionRadius(settings: GraphSettings) {
  return settings.appearance.nodeRadius ?? 0;
}
