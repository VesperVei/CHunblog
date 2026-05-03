import presets from '../data/graph-presets.json';
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
  filters?: Partial<GraphSettings['filters']>;
  createdAt?: string;
  updatedAt?: string;
};

export const BUILTIN_GRAPH_PRESETS: GraphViewPreset[] = presets as GraphViewPreset[];

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
    createdAt: now,
    updatedAt: now,
  };
}
