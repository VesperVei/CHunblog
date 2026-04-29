import type {
  GraphAppearanceSettings,
  GraphFilterSettings,
  GraphForceSettings,
  GraphLayoutMode,
  GraphLayoutSettings,
  GraphSettings,
  GraphViewMode,
} from './types';

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
    centerStrength: 0.08,
    repelStrength: 120,
    linkStrength: 0.7,
    linkDistance: 120,
    collisionRadius: 12,
    collisionStrength: 0.7,
    alphaTargetOnDrag: 0.25,
  },
  brain: {
    centerStrength: 0.08,
    repelStrength: 120,
    linkStrength: 0.7,
    linkDistance: 120,
    collisionRadius: 12,
    collisionStrength: 0.7,
    alphaTargetOnDrag: 0.25,
  },
  radial: {
    centerStrength: 0.08,
    repelStrength: 120,
    linkStrength: 0.7,
    linkDistance: 120,
    collisionRadius: 12,
    collisionStrength: 0.7,
    alphaTargetOnDrag: 0.25,
  },
  hierarchy: {
    centerStrength: 0.08,
    repelStrength: 120,
    linkStrength: 0.7,
    linkDistance: 120,
    collisionRadius: 12,
    collisionStrength: 0.7,
    alphaTargetOnDrag: 0.25,
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

export const defaultGraphSettings: GraphSettings = {
  filters: DEFAULT_FILTER_SETTINGS,
  appearance: DEFAULT_APPEARANCE_SETTINGS,
  forces: DEFAULT_FORCE_SETTINGS.force,
  layout: DEFAULT_LAYOUT_SETTINGS,
};

export const MODE_DEFAULTS: Record<GraphViewMode, { forces: GraphForceSettings; appearance: GraphAppearanceSettings; filters: GraphFilterSettings }> = {
  global: {
    forces: {
      centerStrength: 0.08,
      repelStrength: 120,
      linkStrength: 0.7,
      linkDistance: 140,
      collisionRadius: 14,
      collisionStrength: 0.7,
      alphaTargetOnDrag: 0.25,
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
      centerStrength: 0.08,
      repelStrength: 140,
      linkStrength: 0.72,
      linkDistance: 120,
      collisionRadius: 16,
      collisionStrength: 0.72,
      alphaTargetOnDrag: 0.25,
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
  };
}

export function getActiveLayoutPreset(settings: GraphSettings) {
  return settings.layout.preset ?? DEFAULT_LAYOUT;
}

export function getEffectiveCollisionRadius(settings: GraphSettings) {
  return Math.max(settings.forces.collisionRadius ?? 0, settings.appearance.nodeRadius ?? 0);
}
