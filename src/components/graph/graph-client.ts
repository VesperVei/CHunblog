import { DEFAULT_LAYOUT, defaultGraphSettings, resolveGraphSettings } from '../../graph/constants';
import { DEFAULT_GRAPH_LEVEL_COLOR_GROUPS, cloneColorGroups, ensureColorGroups } from '../../graph/color-groups';
import { createGraphView } from '../../graph/runtime/create-graph-view';
import {
  consumeLastNavigationLocalGraphState,
  createLocalGraphSharedState,
  publishLocalGraphState,
  readRuntimeLocalGraphState,
  subscribeLocalGraphState,
  writeRuntimeLocalGraphState,
} from '../../graph/runtime/local-graph-state';
import { BUILTIN_GRAPH_PRESETS, createPresetFromSettings, getGraphPresetById, mergePresetIntoSettings, type GraphViewPreset } from '../../graph/presets';
import type { GraphColorGroup, GraphLayoutMode, GraphNode, GraphSettings, GraphViewMode } from '../../graph/types';

const GRAPH_PRESETS_STORAGE_KEY = 'graph:view-presets';
const GRAPH_ACTIVE_PRESET_KEY = 'graph:active-preset-id';
const graphDataCache = new Map<string, Promise<any>>();

type GraphClientState = {
  graphUrl: string;
  mode: GraphViewMode;
  locale: string;
  focusId?: string;
  settings: GraphSettings;
  navigationSearch?: string;
  debug: boolean;
  activePresetId?: string;
};

type GraphSidebarContext = {
  state: GraphClientState;
  debug: boolean;
};

type ApplyStateOptions = {
  skipLocalGraphSync?: boolean;
};

type FieldScope = 'filters' | 'appearance' | 'forces' | 'layout';
type FieldControl = 'search' | 'slider' | 'toggle' | 'select';
type UpdateMode = 'filters' | 'appearance' | 'forces' | 'settings' | 'colorGroups';
type FieldConfig = {
  scope: FieldScope;
  control: FieldControl;
  updateMode: UpdateMode;
  visible?: (ctx: GraphSidebarContext) => boolean;
  debugOnly?: boolean;
  read: (state: GraphClientState) => string | boolean;
  write: (state: GraphClientState, rawValue: string | boolean) => GraphClientState;
  format?: (value: string | boolean) => string;
  debounceMs?: number;
};

const formatFloat = (value: string | boolean) => Number(value).toFixed(2);
const formatFloat3 = (value: string | boolean) => Number(value).toFixed(3);
const formatInteger = (value: string | boolean) => String(Math.round(Number(value)));

function updateScope(state: GraphClientState, scope: FieldScope, patch: Record<string, unknown>): GraphClientState {
  return {
    ...state,
    settings: {
      ...state.settings,
      [scope]: {
        ...state.settings[scope],
        ...patch,
      },
    },
  };
}

function replaceColorGroups(state: GraphClientState, colorGroups: GraphColorGroup[]): GraphClientState {
  return {
    ...state,
    settings: {
      ...state.settings,
      colorGroups: ensureColorGroups(colorGroups),
    },
  };
}

const FIELD_CONFIG: Record<string, FieldConfig> = {
  searchQuery: {
    scope: 'filters', control: 'search', updateMode: 'filters', debounceMs: 150,
    read: (state) => state.settings.filters.searchQuery ?? '',
    write: (state, rawValue) => updateScope(state, 'filters', { searchQuery: String(rawValue) }),
  },
  depth: {
    scope: 'filters', control: 'slider', updateMode: 'filters', debounceMs: 150,
    visible: ({ state }) => state.mode === 'local' && state.settings.layout.preset !== 'brain',
    read: (state) => String(state.settings.filters.depth ?? 1),
    write: (state, rawValue) => updateScope(state, 'filters', { depth: Number(rawValue) }),
    format: formatInteger,
  },
  showBacklinks: { scope: 'filters', control: 'toggle', updateMode: 'filters', read: (s) => Boolean(s.settings.filters.showBacklinks), write: (s, v) => updateScope(s, 'filters', { showBacklinks: Boolean(v) }) },
  showForwardLinks: { scope: 'filters', control: 'toggle', updateMode: 'filters', read: (s) => Boolean(s.settings.filters.showForwardLinks), write: (s, v) => updateScope(s, 'filters', { showForwardLinks: Boolean(v) }) },
  showCrossLinks: { scope: 'filters', control: 'toggle', updateMode: 'filters', read: (s) => Boolean(s.settings.filters.showCrossLinks), write: (s, v) => updateScope(s, 'filters', { showCrossLinks: Boolean(v) }) },
  showTags: { scope: 'filters', control: 'toggle', updateMode: 'filters', read: (s) => Boolean(s.settings.filters.showTags), write: (s, v) => updateScope(s, 'filters', { showTags: Boolean(v) }) },
  showAttachments: { scope: 'filters', control: 'toggle', updateMode: 'filters', read: (s) => Boolean(s.settings.filters.showAttachments), write: (s, v) => updateScope(s, 'filters', { showAttachments: Boolean(v) }) },
  onlyExistingNotes: { scope: 'filters', control: 'toggle', updateMode: 'filters', read: (s) => Boolean(s.settings.filters.onlyExistingNotes), write: (s, v) => updateScope(s, 'filters', { onlyExistingNotes: Boolean(v) }) },
  showArrows: { scope: 'appearance', control: 'toggle', updateMode: 'appearance', read: (s) => Boolean(s.settings.appearance.showArrows), write: (s, v) => updateScope(s, 'appearance', { showArrows: Boolean(v) }) },
  textOpacity: { scope: 'appearance', control: 'slider', updateMode: 'appearance', read: (s) => String(s.settings.appearance.textOpacity ?? 0.8), write: (s, v) => updateScope(s, 'appearance', { textOpacity: Number(v) }), format: formatFloat },
  nodeRadius: { scope: 'appearance', control: 'slider', updateMode: 'appearance', read: (s) => String(s.settings.appearance.nodeRadius ?? 6), write: (s, v) => updateScope(s, 'appearance', { nodeRadius: Number(v) }), format: formatInteger },
  linkWidth: { scope: 'appearance', control: 'slider', updateMode: 'appearance', read: (s) => String(s.settings.appearance.linkWidth ?? 1.5), write: (s, v) => updateScope(s, 'appearance', { linkWidth: Number(v) }), format: formatFloat },
  labelSize: { scope: 'appearance', control: 'slider', updateMode: 'appearance', read: (s) => String(s.settings.appearance.labelSize ?? 12), write: (s, v) => updateScope(s, 'appearance', { labelSize: Number(v) }), format: formatInteger },
  centerStrength: { scope: 'forces', control: 'slider', updateMode: 'forces', read: (s) => String(s.settings.forces.centerStrength ?? 0.518713248970312), write: (s, v) => updateScope(s, 'forces', { centerStrength: Number(v) }), format: formatFloat },
  repelStrength: { scope: 'forces', control: 'slider', updateMode: 'forces', read: (s) => String(s.settings.forces.repelStrength ?? 35), write: (s, v) => updateScope(s, 'forces', { repelStrength: Number(v) }), format: formatInteger },
  linkStrength: { scope: 'forces', control: 'slider', updateMode: 'forces', read: (s) => String(s.settings.forces.linkStrength ?? 1), write: (s, v) => updateScope(s, 'forces', { linkStrength: Number(v) }), format: formatFloat },
  linkDistance: { scope: 'forces', control: 'slider', updateMode: 'forces', read: (s) => String(s.settings.forces.linkDistance ?? 250), write: (s, v) => updateScope(s, 'forces', { linkDistance: Number(v) }), format: formatInteger },
  collisionStrength: { scope: 'forces', control: 'slider', updateMode: 'forces', debugOnly: true, read: (s) => String(s.settings.forces.collisionStrength ?? 0.75), write: (s, v) => updateScope(s, 'forces', { collisionStrength: Number(v) }), format: formatFloat },
  collisionPadding: { scope: 'forces', control: 'slider', updateMode: 'forces', debugOnly: true, read: (s) => String(s.settings.forces.collisionPadding ?? 8), write: (s, v) => updateScope(s, 'forces', { collisionPadding: Number(v) }), format: formatInteger },
  velocityDecay: { scope: 'forces', control: 'slider', updateMode: 'forces', debugOnly: true, read: (s) => String(s.settings.forces.velocityDecay ?? 0.38), write: (s, v) => updateScope(s, 'forces', { velocityDecay: Number(v) }), format: formatFloat },
  alphaDecay: { scope: 'forces', control: 'slider', updateMode: 'forces', debugOnly: true, read: (s) => String(s.settings.forces.alphaDecay ?? 0.022), write: (s, v) => updateScope(s, 'forces', { alphaDecay: Number(v) }), format: formatFloat3 },
  localGravityStrength: { scope: 'forces', control: 'slider', updateMode: 'forces', debugOnly: true, read: (s) => String(s.settings.forces.localGravityStrength ?? 0.1), write: (s, v) => updateScope(s, 'forces', { localGravityStrength: Number(v) }), format: formatFloat },
  preset: { scope: 'layout', control: 'select', updateMode: 'settings', read: (s) => s.settings.layout.preset ?? DEFAULT_LAYOUT, write: (s, v) => updateScope(s, 'layout', { preset: v as GraphLayoutMode }) },
  brainAnchorStrength: { scope: 'layout', control: 'slider', updateMode: 'settings', visible: ({ state }) => state.settings.layout.preset === 'brain', read: (s) => String(s.settings.layout.brainAnchorStrength ?? 0.35), write: (s, v) => updateScope(s, 'layout', { brainAnchorStrength: Number(v) }), format: formatFloat },
  preserveSelectedPreset: { scope: 'layout', control: 'toggle', updateMode: 'settings', debugOnly: true, read: (s) => Boolean(s.settings.layout.preserveSelectedPreset), write: (s, v) => updateScope(s, 'layout', { preserveSelectedPreset: Boolean(v) }) },
};

function isGraphDebugMode() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('graphDebug') === '1' || window.localStorage.getItem('graphDebug') === '1';
}

function resolveFocusId(root: HTMLElement) {
  const explicit = root.dataset.focusId;
  if (explicit) return explicit;
  const queryFocus = new URLSearchParams(window.location.search).get('focus');
  return queryFocus || undefined;
}

function isLocalGraphState(state: Pick<GraphClientState, 'mode' | 'focusId'>): state is Pick<GraphClientState, 'mode' | 'focusId'> & { focusId: string } {
  return state.mode === 'local' && typeof state.focusId === 'string' && state.focusId.length > 0;
}

function createRootSubscriberId(root: HTMLElement) {
  const existing = root.dataset.graphSubscriberId;
  if (existing) {
    return existing;
  }

  const next = `graph-root-${Math.random().toString(36).slice(2, 10)}`;
  root.dataset.graphSubscriberId = next;
  return next;
}

function syncSharedLocalGraphState(root: HTMLElement, state: GraphClientState, options: { publish?: boolean } = {}) {
  if (!isLocalGraphState(state)) {
    return;
  }

  const sharedState = createLocalGraphSharedState(state.focusId, state.settings, state.activePresetId);
  if (options.publish !== false) {
    publishLocalGraphState(sharedState, createRootSubscriberId(root));
  }
}

function loadStoredPresetState() {
  try {
    const rawPresets = window.localStorage.getItem(GRAPH_PRESETS_STORAGE_KEY);
    const presets = rawPresets ? JSON.parse(rawPresets) : [];
    const activePresetId = window.localStorage.getItem(GRAPH_ACTIVE_PRESET_KEY) || undefined;
    return {
      presets: Array.isArray(presets) ? presets : [],
      activePresetId,
    };
  } catch {
    return { presets: [], activePresetId: undefined };
  }
}

function saveStoredPresetState(presets: GraphViewPreset[], activePresetId?: string) {
  try {
    window.localStorage.setItem(GRAPH_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    if (activePresetId) {
      window.localStorage.setItem(GRAPH_ACTIVE_PRESET_KEY, activePresetId);
    } else {
      window.localStorage.removeItem(GRAPH_ACTIVE_PRESET_KEY);
    }
  } catch {
    // Ignore storage failures so graph runtime stays usable.
  }
}

function getAllPresets() {
  const stored = loadStoredPresetState();
  return {
    activePresetId: stored.activePresetId,
    presets: [...BUILTIN_GRAPH_PRESETS, ...stored.presets],
    userPresets: stored.presets,
  };
}

function getFallbackPresetId(presets: GraphViewPreset[]) {
  return getGraphPresetById(presets, 'balanced')?.id ?? getGraphPresetById(presets, 'obsidian-like')?.id ?? presets[0]?.id;
}

function applyPresetKeepingFilters(settings: GraphSettings, preset?: GraphViewPreset) {
  if (!preset) {
    return settings;
  }

  return mergePresetIntoSettings(settings, preset);
}

function resolvePresetBackedSettings(baseSettings: GraphSettings, activePresetId?: string) {
  const { presets } = getAllPresets();
  return applyPresetKeepingFilters(baseSettings, getGraphPresetById(presets, activePresetId));
}

function createColorGroupId() {
  return `color-group-${Math.random().toString(36).slice(2, 10)}`;
}

function getGraphControls(root: HTMLElement) {
  return (root as any).__graphControls;
}

function getLegendOpenState(shell: HTMLElement) {
  return Boolean((shell as any).__graphLegendOpen);
}

function getDrawerOpenState(shell: HTMLElement) {
  return Boolean((shell as any).__graphDrawerOpen);
}

function setLegendOpenState(shell: HTMLElement, isOpen: boolean) {
  (shell as any).__graphLegendOpen = isOpen;
}

function setDrawerOpenState(shell: HTMLElement, isOpen: boolean) {
  (shell as any).__graphDrawerOpen = isOpen;
}

function setSelectedNodeId(shell: HTMLElement, nodeId?: string) {
  (shell as any).__graphSelectedNodeId = nodeId;
}

function getSelectedNodeId(shell: HTMLElement) {
  return (shell as any).__graphSelectedNodeId as string | undefined;
}

function resolveNodeById(root: HTMLElement, nodeId?: string) {
  if (!nodeId) return undefined;
  const data = getGraphControls(root)?.getCurrentGraphData?.();
  return data?.nodes?.find((node) => node.id === nodeId) as GraphNode | undefined;
}

function formatGraphDate(value: unknown, locale: string) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(locale === 'zh-cn' ? 'zh-CN' : locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatLegendLabel(group: GraphColorGroup, locale: string) {
  const key = group.match?.key;
  const value = group.match?.value;
  if (key === 'graphLevel') {
    if (Number(value) === 0) {
      return locale === 'zh-cn' ? '根节点' : 'Root';
    }

    return `L${String(value)}`;
  }

  return group.name;
}

function createPromptedColorGroup() {
  const name = window.prompt('颜色组名称', 'Custom Group');
  if (!name) return undefined;

  const propertyKey = window.prompt('Frontmatter 字段名', 'role');
  if (!propertyKey) return undefined;

  const propertyValue = window.prompt('字段值', '根节点');
  if (propertyValue === null || propertyValue === '') return undefined;

  const color = window.prompt('颜色（HEX）', '#F97316') || '#F97316';
  const priorityInput = window.prompt('优先级（数字越大优先级越高）', '40') || '40';
  const priority = Number(priorityInput);

  return {
    id: createColorGroupId(),
    name,
    color,
    enabled: true,
    priority: Number.isFinite(priority) ? priority : 40,
    builtin: false,
    match: {
      kind: 'property',
      key: propertyKey,
      value: Number.isNaN(Number(propertyValue)) || propertyValue.trim() === '' ? propertyValue : Number(propertyValue),
    },
  } satisfies GraphColorGroup;
}

function normalizeHexColor(color: string) {
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return '#8B5CF6';
}

function clampChannel(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((channel) => clampChannel(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = clampChannel(r, 0, 255) / 255;
  const gn = clampChannel(g, 0, 255) / 255;
  const bn = clampChannel(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) };
  }

  const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
  let hue = 0;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = ((bn - rn) / delta) + 2;
  else hue = ((rn - gn) / delta) + 4;

  return {
    h: Math.round((((hue * 60) + 360) % 360)),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hslToRgb(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clampChannel(s, 0, 100) / 100;
  const lightness = clampChannel(l, 0, 100) / 100;
  const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - (chroma / 2);
  let r = 0; let g = 0; let b = 0;
  if (hue < 60) [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function readGraphState(root: HTMLElement): GraphClientState {
  const mode = (root.dataset.mode as GraphViewMode) || 'global';
  const debug = isGraphDebugMode();
  const { presets, activePresetId } = getAllPresets();
  const resolvedActivePresetId = getGraphPresetById(presets, activePresetId)?.id ?? getFallbackPresetId(presets);
  const baseSettings = root.dataset.graphSettings
    ? JSON.parse(root.dataset.graphSettings) as GraphSettings
    : resolveGraphSettings(mode, DEFAULT_LAYOUT, defaultGraphSettings);
  let settings = resolvePresetBackedSettings({ ...baseSettings, colorGroups: ensureColorGroups(baseSettings.colorGroups) }, resolvedActivePresetId);
  let nextActivePresetId = resolvedActivePresetId;
  const focusId = resolveFocusId(root);

  if (mode === 'local' && focusId) {
    const runtimeState = readRuntimeLocalGraphState(focusId);
    const navigationState = runtimeState ? undefined : consumeLastNavigationLocalGraphState();
    const restoredState = runtimeState
      ?? (navigationState
        ? createLocalGraphSharedState(focusId, navigationState.settings, navigationState.activePresetId ?? nextActivePresetId)
        : undefined);
    if (restoredState) {
      writeRuntimeLocalGraphState(restoredState);
      settings = restoredState.settings;
      nextActivePresetId = restoredState.activePresetId ?? nextActivePresetId;
    }
  }

  return {
    graphUrl: root.dataset.graphUrl || '/graph.json',
    mode,
    locale: root.dataset.locale || 'en',
    focusId,
    settings,
    navigationSearch: root.dataset.navigationSearch,
    debug,
    activePresetId: nextActivePresetId,
  };
}

function writeGraphState(root: HTMLElement, state: GraphClientState) {
  root.dataset.graphSettings = JSON.stringify(state.settings);
}

async function loadGraphData(graphUrl: string) {
  if (!graphDataCache.has(graphUrl)) {
    graphDataCache.set(graphUrl, fetch(graphUrl).then((response) => response.json()));
  }

  return graphDataCache.get(graphUrl)!;
}

async function initGraph(root: HTMLElement) {
  const currentState = readGraphState(root);
  const fullData = await loadGraphData(currentState.graphUrl);
  const controls = await createGraphView(root, { ...currentState, graphUrl: currentState.graphUrl }, fullData);
  (root as any).__graphControls = controls;
  (root as any).__graphState = currentState;

  if (isLocalGraphState(currentState)) {
    if (!(root as any).__graphLocalGraphUnsubscribe) {
      (root as any).__graphLocalGraphUnsubscribe = subscribeLocalGraphState(
        currentState.focusId,
        createRootSubscriberId(root),
        (sharedState) => {
          const rootState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
          const nextState: GraphClientState = {
            ...rootState,
            settings: sharedState.settings,
            activePresetId: sharedState.activePresetId ?? rootState.activePresetId,
          };
          applyNextState(root, nextState, 'settings', { skipLocalGraphSync: true });
          const shell = root.closest<HTMLElement>('[data-graph-shell]');
          if (shell) {
            syncSettingsUI(shell, root);
          }
        },
      );
    }

    syncSharedLocalGraphState(root, currentState, { publish: true });
  }
}

function syncDebugVisibility(shell: HTMLElement, debug: boolean) {
  shell.querySelectorAll<HTMLElement>('[data-graph-debug-only]').forEach((element) => {
    element.hidden = !debug;
  });
}

function syncPresetUI(shell: HTMLElement, state: GraphClientState) {
  const select = shell.querySelector<HTMLSelectElement>('[data-graph-preset-select]');
  if (!select) return;

  const { presets } = getAllPresets();
  select.replaceChildren(...presets.map((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    return option;
  }));
  select.value = state.activePresetId ?? getFallbackPresetId(presets) ?? '';
}

function getColorGroupEditorState(shell: HTMLElement) {
  return ((shell as any).__graphColorEditors ??= new Set<number>()) as Set<number>;
}

function getColorGroupModeState(shell: HTMLElement) {
  return ((shell as any).__graphColorModes ??= new Map<number, 'hex' | 'rgb' | 'hsl'>()) as Map<number, 'hex' | 'rgb' | 'hsl'>;
}

function syncColorGroupUI(shell: HTMLElement, state: GraphClientState) {
  const container = shell.querySelector<HTMLElement>('[data-graph-color-groups]');
  if (!container) return;

  const deleteLabel = shell.dataset.graphDeleteColorGroupLabel || 'Delete';
  const colorGroups = ensureColorGroups(state.settings.colorGroups);
  const openEditors = getColorGroupEditorState(shell);
  const modeState = getColorGroupModeState(shell);

  container.replaceChildren(...colorGroups.map((group, index) => {
    const match = group.match;
    const colorValue = normalizeHexColor(group.color);
    const rgb = hexToRgb(colorValue);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const colorMode = modeState.get(index) ?? 'hex';

    const card = document.createElement('article');
    card.className = 'graph-color-group';
    card.dataset.graphColorGroupIndex = String(index);
    card.setAttribute('aria-disabled', group.enabled ? 'false' : 'true');
    card.classList.toggle('is-editor-open', openEditors.has(index));

    const header = document.createElement('div');
    header.className = 'graph-color-group-header';

    const colorButton = document.createElement('button');
    colorButton.type = 'button';
    colorButton.className = 'graph-color-group-color';
    colorButton.dataset.graphColorGroupEditorToggle = String(index);
    colorButton.style.background = colorValue;
    colorButton.setAttribute('aria-expanded', openEditors.has(index) ? 'true' : 'false');

    const meta = document.createElement('div');
    meta.className = 'graph-color-group-meta';

    const name = document.createElement('strong');
    name.className = 'graph-color-group-name';
    name.textContent = group.name;

    const rule = document.createElement('div');
    rule.className = 'graph-color-group-rule';
    rule.textContent = `["${match?.key ?? 'graphLevel'}": ${JSON.stringify(match?.value ?? '')}]`;

    meta.append(name, rule);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'graph-switch';
    toggle.checked = group.enabled;
    toggle.dataset.graphColorGroupToggle = String(index);

    header.append(colorButton, meta, toggle);
    card.append(header);

    const matchRow = document.createElement('div');
    matchRow.className = 'graph-color-group-match-row';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'graph-color-group-input';
    keyInput.value = String(match?.key ?? 'graphLevel');
    keyInput.placeholder = 'yaml_name';
    keyInput.dataset.graphColorGroupMatchKey = String(index);

    const separator = document.createElement('span');
    separator.className = 'graph-color-group-separator';
    separator.textContent = ':';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'graph-color-group-input';
    valueInput.value = String(match?.value ?? '');
    valueInput.placeholder = 'value';
    valueInput.dataset.graphColorGroupMatchValue = String(index);

    matchRow.append(keyInput, separator, valueInput);
    card.append(matchRow);

    const editor = document.createElement('div');
    editor.className = 'graph-color-group-editor';
    editor.hidden = !openEditors.has(index);

    const preview = document.createElement('div');
    preview.className = 'graph-color-group-preview';
    preview.style.background = colorValue;
    editor.append(preview);

    const modeTabs = document.createElement('div');
    modeTabs.className = 'graph-color-group-modes';
    for (const mode of ['hex', 'rgb', 'hsl'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'graph-color-mode-button';
      button.dataset.graphColorGroupMode = String(index);
      button.dataset.graphColorMode = mode;
      button.textContent = mode.toUpperCase();
      if (mode === colorMode) button.classList.add('is-active');
      modeTabs.append(button);
    }
    editor.append(modeTabs);

    const nativePicker = document.createElement('input');
    nativePicker.type = 'color';
    nativePicker.className = 'graph-color-group-native-picker';
    nativePicker.value = colorValue;
    nativePicker.dataset.graphColorGroupColor = String(index);
    editor.append(nativePicker);

    const hexRow = document.createElement('div');
    hexRow.className = 'graph-color-group-editor-row';
    hexRow.hidden = colorMode !== 'hex';
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'graph-color-group-input';
    hexInput.value = colorValue;
    hexInput.dataset.graphColorGroupHex = String(index);
    hexRow.append(hexInput);
    editor.append(hexRow);

    const rgbRow = document.createElement('div');
    rgbRow.className = 'graph-color-group-editor-grid';
    rgbRow.hidden = colorMode !== 'rgb';
    for (const [channel, value] of [['r', rgb.r], ['g', rgb.g], ['b', rgb.b]] as const) {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'graph-color-group-input';
      input.min = '0';
      input.max = '255';
      input.value = String(value);
      input.dataset.graphColorGroupRgb = String(index);
      input.dataset.graphColorChannel = channel;
      rgbRow.append(input);
    }
    editor.append(rgbRow);

    const hslRow = document.createElement('div');
    hslRow.className = 'graph-color-group-editor-grid';
    hslRow.hidden = colorMode !== 'hsl';
    for (const [channel, value, max] of [['h', hsl.h, 360], ['s', hsl.s, 100], ['l', hsl.l, 100]] as const) {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'graph-color-group-input';
      input.min = '0';
      input.max = String(max);
      input.value = String(value);
      input.dataset.graphColorGroupHsl = String(index);
      input.dataset.graphColorChannel = channel;
      hslRow.append(input);
    }
    editor.append(hslRow);

    card.append(editor);

    if (!group.builtin) {
      const actions = document.createElement('div');
      actions.className = 'graph-color-group-actions';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'graph-color-group-delete';
      remove.textContent = deleteLabel;
      remove.dataset.graphColorGroupDelete = String(index);
      actions.append(remove);
      card.append(actions);
    }

    return card;
  }));
}

function syncLegendUI(shell: HTMLElement, state: GraphClientState) {
  const legendPanel = shell.querySelector<HTMLElement>('[data-graph-legend-panel]');
  const legendToggle = shell.querySelector<HTMLButtonElement>('[data-graph-legend-toggle]');
  const legendItems = shell.querySelector<HTMLElement>('[data-graph-legend-items]');
  if (!legendPanel || !legendItems) {
    return;
  }

  const isOpen = getLegendOpenState(shell);
  legendPanel.classList.toggle('is-open', isOpen);
  legendPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  legendToggle?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

  const groups = ensureColorGroups(state.settings.colorGroups).filter((group) => group.enabled);
  legendItems.replaceChildren(...groups.map((group) => {
    const item = document.createElement('div');
    item.className = 'graph-legend-item';

    const dot = document.createElement('span');
    dot.className = 'graph-legend-dot';
    dot.style.background = group.color;

    const label = document.createElement('span');
    label.textContent = formatLegendLabel(group, state.locale);

    item.append(dot, label);
    return item;
  }));
}

function syncDetailDrawer(shell: HTMLElement, root: HTMLElement) {
  const drawer = shell.querySelector<HTMLElement>('[data-graph-detail-drawer]');
  const content = shell.querySelector<HTMLElement>('[data-graph-detail-content]');
  if (!drawer || !content) {
    return;
  }

  const isOpen = getDrawerOpenState(shell);
  drawer.classList.toggle('is-open', isOpen);
  drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

  const state: GraphClientState = (root as any).__graphState ?? readGraphState(root);
  const node = resolveNodeById(root, getSelectedNodeId(shell));
  const selectHint = shell.dataset.graphSelectNodeHint || 'Select a node';
  const openArticleLabel = shell.dataset.graphOpenArticleLabel || 'Open Article';
  const focusRelatedLabel = shell.dataset.graphFocusRelatedLabel || 'Focus Related Nodes';
  const typeLabel = shell.dataset.graphTypeLabel || 'Type';
  const tagsLabel = shell.dataset.graphTagsLabel || 'Tags';
  const createdLabel = shell.dataset.graphCreatedLabel || 'Created';
  const updatedLabel = shell.dataset.graphUpdatedLabel || 'Updated';

  if (!node) {
    content.innerHTML = `<div class="graph-detail-empty">${escapeHtml(selectHint)}</div>`;
    return;
  }

  const title = node.titles?.[state.locale] || node.id;
  const subtitle = node.type || node.metadata?.note_type || 'note';
  const tags = Array.isArray(node.tags) && node.tags.length > 0
    ? node.tags.map((tag) => `<span class="graph-detail-tag">${escapeHtml(String(tag))}</span>`).join('')
    : '<span class="graph-detail-tag">—</span>';

  content.innerHTML = `
    <article class="graph-detail-card">
      <div class="graph-detail-title">
        <strong>${escapeHtml(String(title))}</strong>
        <div class="graph-detail-subtitle">${escapeHtml(String(subtitle))}</div>
      </div>
      <div class="graph-detail-meta">
        <div class="graph-detail-meta-row">
          <span class="graph-detail-meta-label">${escapeHtml(typeLabel)}</span>
          <span>${escapeHtml(String(subtitle))}</span>
        </div>
        <div class="graph-detail-meta-row">
          <span class="graph-detail-meta-label">${escapeHtml(createdLabel)}</span>
          <span>${escapeHtml(formatGraphDate(node.createdAt, state.locale))}</span>
        </div>
        <div class="graph-detail-meta-row">
          <span class="graph-detail-meta-label">${escapeHtml(updatedLabel)}</span>
          <span>${escapeHtml(formatGraphDate(node.updatedAt, state.locale))}</span>
        </div>
        <div class="graph-detail-meta-row">
          <span class="graph-detail-meta-label">${escapeHtml(tagsLabel)}</span>
          <div class="graph-detail-tags">${tags}</div>
        </div>
      </div>
      <div class="graph-detail-actions">
        <button type="button" class="graph-settings-action" data-graph-open-article="${escapeHtml(node.id)}">${escapeHtml(openArticleLabel)}</button>
        <button type="button" class="graph-settings-action" data-graph-focus-related="${escapeHtml(node.id)}">${escapeHtml(focusRelatedLabel)}</button>
      </div>
    </article>
  `;
}

function syncSettingsUI(shell: HTMLElement, root: HTMLElement) {
  const state: GraphClientState = (root as any).__graphState ?? readGraphState(root);
  const ctx: GraphSidebarContext = { state, debug: state.debug };

  syncDebugVisibility(shell, state.debug);
  syncPresetUI(shell, state);
  syncColorGroupUI(shell, state);
  syncLegendUI(shell, state);
  syncDetailDrawer(shell, root);

  shell.querySelectorAll<HTMLElement>('[data-graph-setting-field]').forEach((field) => {
    const key = field.dataset.graphSettingField || '';
    const config = FIELD_CONFIG[key];
    const visible = config ? (!config.debugOnly || ctx.debug) && (config.visible?.(ctx) ?? true) : true;
    field.hidden = !visible;
  });

  shell.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-graph-setting-input]').forEach((input) => {
    const key = input.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) return;
    const value = config.read(state);
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      input.checked = Boolean(value);
    } else {
      input.value = String(value);
    }
  });

  shell.querySelectorAll<HTMLOutputElement>('[data-graph-setting-value]').forEach((output) => {
    const key = output.dataset.graphSettingValue || '';
    const config = FIELD_CONFIG[key];
    if (!config) return;
    const value = config.read(state);
    const text = config.format ? config.format(value) : String(value);
    output.value = text;
    output.textContent = text;
  });
}

function applyNextState(root: HTMLElement, nextState: GraphClientState, updateMode: UpdateMode, options: ApplyStateOptions = {}) {
  const controls = (root as any).__graphControls;
  writeGraphState(root, nextState);
  (root as any).__graphState = nextState;

  if (!options.skipLocalGraphSync) {
    syncSharedLocalGraphState(root, nextState);
  }

  if (!controls) return;
  if (updateMode === 'forces') {
    controls.updateForces?.(nextState.settings.forces);
    return;
  }
  if (updateMode === 'appearance') {
    controls.updateAppearance?.(nextState.settings.appearance);
    return;
  }
  if (updateMode === 'filters') {
    controls.updateFilters?.(nextState.settings.filters);
    return;
  }
  if (updateMode === 'colorGroups') {
    controls.updateColorGroups?.(nextState.settings.colorGroups);
    return;
  }
  controls.updateSettings?.(nextState.settings);
}

function dispatchFieldUpdate(root: HTMLElement, shell: HTMLElement, key: string, nextState: GraphClientState) {
  const config = FIELD_CONFIG[key];
  if (!config) return;
  writeGraphState(root, nextState);
  (root as any).__graphState = nextState;
  syncSettingsUI(shell, root);

  const run = () => applyNextState(root, nextState, config.updateMode);
  if (config.debounceMs) {
    const timers = ((root as any).__graphDebounceTimers ??= new Map<string, number>());
    window.clearTimeout(timers.get(key));
    timers.set(key, window.setTimeout(run, config.debounceMs));
    return;
  }

  run();
}

function bindSectionToggles(shell: HTMLElement) {
  if ((shell as any).__graphSectionsBound) return;
  (shell as any).__graphSectionsBound = true;
  shell.querySelectorAll<HTMLButtonElement>('[data-graph-section-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const content = button.nextElementSibling as HTMLElement | null;
      if (!content) return;
      const isOpen = button.getAttribute('aria-expanded') !== 'false';
      button.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      content.classList.toggle('is-collapsed', isOpen);
    });
  });
}

function bindPresetActions(root: HTMLElement, shell: HTMLElement) {
  shell.querySelector('[data-graph-preset-save]')?.addEventListener('click', () => {
    const name = window.prompt('请输入模板名称');
    if (!name) return;

    const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const preset = createPresetFromSettings(name, currentState.settings);
    const { userPresets } = getAllPresets();
    const nextUserPresets = [...userPresets.filter((item) => item.id !== preset.id), preset];
    saveStoredPresetState(nextUserPresets, preset.id);
    const nextState = { ...currentState, activePresetId: preset.id };
    (root as any).__graphState = nextState;
    syncSettingsUI(shell, root);
  });

  shell.querySelector('[data-graph-preset-reset]')?.addEventListener('click', () => {
    const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const { presets } = getAllPresets();
    const preset = getGraphPresetById(presets, currentState.activePresetId);
    const nextSettings = applyPresetKeepingFilters(currentState.settings, preset);
    const nextState = { ...currentState, settings: nextSettings };
    applyNextState(root, nextState, 'settings');
    syncSettingsUI(shell, root);
  });

  shell.querySelector('[data-graph-preset-overwrite]')?.addEventListener('click', () => {
    const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const { presets, userPresets } = getAllPresets();
    const preset = getGraphPresetById(presets, currentState.activePresetId);
    if (!preset || preset.builtin) {
      window.alert('内置模板不能覆盖，请先另存为模板。');
      return;
    }

    const nextPreset = {
      ...createPresetFromSettings(preset.name, currentState.settings),
      id: preset.id,
      createdAt: preset.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const nextUserPresets = [...userPresets.filter((item) => item.id !== preset.id), nextPreset];
    saveStoredPresetState(nextUserPresets, nextPreset.id);
    syncSettingsUI(shell, root);
  });

  shell.querySelector('[data-graph-preset-export]')?.addEventListener('click', async () => {
    const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const payload = JSON.stringify(createPresetFromSettings('exported-preset', currentState.settings), null, 2);
    await navigator.clipboard.writeText(payload).catch(() => undefined);
  });

  shell.querySelector('[data-graph-preset-import]')?.addEventListener('click', () => {
    const raw = window.prompt('粘贴模板 JSON');
    if (!raw) return;
    try {
      const preset = JSON.parse(raw) as GraphViewPreset;
      if (!preset?.id || !preset?.name) return;
      const { userPresets } = getAllPresets();
      const normalized = { ...preset, builtin: false, updatedAt: new Date().toISOString(), createdAt: preset.createdAt ?? new Date().toISOString() };
      const nextUserPresets = [...userPresets.filter((item) => item.id !== normalized.id), normalized];
      saveStoredPresetState(nextUserPresets, normalized.id);
      const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
      const nextSettings = applyPresetKeepingFilters(currentState.settings, normalized);
      applyNextState(root, { ...currentState, settings: nextSettings, activePresetId: normalized.id }, 'settings');
      syncSettingsUI(shell, root);
    } catch {
      window.alert('模板 JSON 无效。');
    }
  });
}

function bindGraphSettings(root: HTMLElement) {
  const shell = root.closest<HTMLElement>('[data-graph-shell]');
  if (!shell || (shell as any).__graphSettingsBound) return;

  const updateFullscreenButtonState = () => {
    const fullscreenButton = shell.querySelector<HTMLButtonElement>('[data-graph-toolbar-fullscreen]');
    if (!fullscreenButton) return;
    const isFullscreen = document.fullscreenElement === shell;
    const enterLabel = shell.dataset.graphEnterFullscreenLabel || 'Enter fullscreen';
    const exitLabel = shell.dataset.graphExitFullscreenLabel || 'Exit fullscreen';
    const label = isFullscreen ? exitLabel : enterLabel;
    fullscreenButton.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
    fullscreenButton.setAttribute('aria-label', label);
    fullscreenButton.title = label;
  };

  shell.querySelector('[data-graph-toolbar-reset]')?.addEventListener('click', () => {
    (root as any).__graphControls?.resetView?.();
  });

  shell.querySelector('[data-graph-toolbar-fullscreen]')?.addEventListener('click', async () => {
    if (document.fullscreenElement === shell) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    await shell.requestFullscreen?.().catch(() => undefined);
  });

  document.addEventListener('fullscreenchange', updateFullscreenButtonState);
  updateFullscreenButtonState();

  const toggle = shell.querySelector<HTMLButtonElement>('[data-graph-settings-toggle]');
  const panel = shell.querySelector<HTMLElement>('[data-graph-settings-panel]');
  if (toggle && panel) {
    const setOpen = (isOpen: boolean) => {
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      panel.classList.toggle('is-open', isOpen);
    };

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const isOpen = !panel.classList.contains('is-open');
      setOpen(isOpen);
      if (isOpen) syncSettingsUI(shell, root);
    });
  }

  bindSectionToggles(shell);
  bindPresetActions(root, shell);

  root.addEventListener('graph:node-select', ((event: Event) => {
    const customEvent = event as CustomEvent<{ node?: GraphNode }>;
    const node = customEvent.detail?.node;
    if (!node) {
      return;
    }

    setSelectedNodeId(shell, node.id);
    setDrawerOpenState(shell, true);
    getGraphControls(root)?.focusNode?.(node.id);
    syncDetailDrawer(shell, root);
  }) as EventListener);

  shell.querySelector('[data-graph-settings-reset]')?.addEventListener('click', () => {
    const state = readGraphState(root);
    const resetSettings = resolvePresetBackedSettings(
      resolveGraphSettings(state.mode, DEFAULT_LAYOUT, defaultGraphSettings),
      state.activePresetId,
    );
    applyNextState(root, { ...state, settings: resetSettings }, 'settings');
    syncSettingsUI(shell, root);
  });

  shell.querySelector('[data-graph-legend-toggle]')?.addEventListener('click', () => {
    setLegendOpenState(shell, !getLegendOpenState(shell));
    syncSettingsUI(shell, root);
  });

  shell.querySelector('[data-graph-detail-close]')?.addEventListener('click', () => {
    setDrawerOpenState(shell, false);
    syncDetailDrawer(shell, root);
  });

  shell.querySelector('[data-graph-preset-select]')?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const { presets, userPresets } = getAllPresets();
    const preset = getGraphPresetById(presets, target.value);
    const nextSettings = applyPresetKeepingFilters(currentState.settings, preset);
    saveStoredPresetState(userPresets, preset?.id);
    applyNextState(root, { ...currentState, settings: nextSettings, activePresetId: preset?.id }, 'settings');
    syncSettingsUI(shell, root);
  });

  const handleControlUpdate = (target: HTMLInputElement | HTMLSelectElement) => {
    const key = target.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) return;

    const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const rawValue = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
    const nextState = config.write(currentState, rawValue);
    dispatchFieldUpdate(root, shell, key, nextState);
  };

  const applyColorGroupState = (nextState: GraphClientState) => {
    writeGraphState(root, nextState);
    (root as any).__graphState = nextState;
    syncSettingsUI(shell, root);
    applyNextState(root, nextState, 'colorGroups');
  };

  const patchColorGroup = (index: number, updater: (group: GraphColorGroup) => GraphColorGroup) => {
    const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const nextGroups = cloneColorGroups(currentState.settings.colorGroups);
    if (!nextGroups[index]) return;
    nextGroups[index] = updater(nextGroups[index]);
    applyColorGroupState(replaceColorGroups(currentState, nextGroups));
  };

  const updateColorGroupHex = (index: number, color: string) => {
    patchColorGroup(index, (group) => ({ ...group, color: normalizeHexColor(color) }));
  };

  shell.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

    if (target.dataset.graphColorGroupColor) {
      updateColorGroupHex(Number(target.dataset.graphColorGroupColor), target.value);
      return;
    }

    const key = target.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) return;
    if (config.control === 'search' || config.control === 'slider') handleControlUpdate(target);
  });

  shell.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

    if (target.dataset.graphColorGroupToggle) {
      const index = Number(target.dataset.graphColorGroupToggle);
      patchColorGroup(index, (group) => ({ ...group, enabled: target.checked }));
      return;
    }

    if (target.dataset.graphColorGroupHex) {
      updateColorGroupHex(Number(target.dataset.graphColorGroupHex), target.value);
      return;
    }

    if (target.dataset.graphColorGroupMatchKey) {
      const index = Number(target.dataset.graphColorGroupMatchKey);
      patchColorGroup(index, (group) => ({
        ...group,
        match: {
          kind: 'property',
          key: target.value.trim() || 'graphLevel',
          value: group.match?.value ?? '',
        },
      }));
      return;
    }

    if (target.dataset.graphColorGroupMatchValue) {
      const index = Number(target.dataset.graphColorGroupMatchValue);
      patchColorGroup(index, (group) => ({
        ...group,
        match: {
          kind: 'property',
          key: group.match?.key || 'graphLevel',
          value: target.value,
        },
      }));
      return;
    }

    if (target.dataset.graphColorGroupRgb) {
      const index = Number(target.dataset.graphColorGroupRgb);
      const editor = target.closest<HTMLElement>('.graph-color-group-editor');
      if (!editor) return;
      const r = Number((editor.querySelector('[data-graph-color-channel="r"]') as HTMLInputElement | null)?.value ?? 0);
      const g = Number((editor.querySelector('[data-graph-color-channel="g"]') as HTMLInputElement | null)?.value ?? 0);
      const b = Number((editor.querySelector('[data-graph-color-channel="b"]') as HTMLInputElement | null)?.value ?? 0);
      updateColorGroupHex(index, rgbToHex(r, g, b));
      return;
    }

    if (target.dataset.graphColorGroupHsl) {
      const index = Number(target.dataset.graphColorGroupHsl);
      const editor = target.closest<HTMLElement>('.graph-color-group-editor');
      if (!editor) return;
      const h = Number((editor.querySelector('[data-graph-color-channel="h"]') as HTMLInputElement | null)?.value ?? 0);
      const s = Number((editor.querySelector('[data-graph-color-channel="s"]') as HTMLInputElement | null)?.value ?? 0);
      const l = Number((editor.querySelector('[data-graph-color-channel="l"]') as HTMLInputElement | null)?.value ?? 0);
      const rgb = hslToRgb(h, s, l);
      updateColorGroupHex(index, rgbToHex(rgb.r, rgb.g, rgb.b));
      return;
    }

    const key = target.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) return;
    if (config.control === 'toggle' || config.control === 'select') handleControlUpdate(target);
  });

  shell.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const editorToggle = target.closest<HTMLElement>('[data-graph-color-group-editor-toggle]');
    if (editorToggle) {
      const index = Number(editorToggle.dataset.graphColorGroupEditorToggle);
      const openEditors = getColorGroupEditorState(shell);
      if (openEditors.has(index)) openEditors.delete(index);
      else openEditors.add(index);
      syncSettingsUI(shell, root);
      return;
    }

    const modeButton = target.closest<HTMLElement>('[data-graph-color-group-mode]');
    if (modeButton) {
      const index = Number(modeButton.dataset.graphColorGroupMode);
      const mode = modeButton.dataset.graphColorMode as 'hex' | 'rgb' | 'hsl';
      getColorGroupModeState(shell).set(index, mode);
      getColorGroupEditorState(shell).add(index);
      syncSettingsUI(shell, root);
      return;
    }

    if (target.closest('[data-graph-color-group-add]')) {
      const group = createPromptedColorGroup();
      if (!group) return;
      const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
      const nextGroups = [...cloneColorGroups(currentState.settings.colorGroups), group];
      applyColorGroupState(replaceColorGroups(currentState, nextGroups));
      return;
    }

    if (target.closest('[data-graph-color-group-reset]')) {
      const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
      applyColorGroupState(replaceColorGroups(currentState, cloneColorGroups(DEFAULT_GRAPH_LEVEL_COLOR_GROUPS)));
      return;
    }

    const openArticleButton = target.closest<HTMLElement>('[data-graph-open-article]');
    if (openArticleButton) {
      const node = resolveNodeById(root, openArticleButton.dataset.graphOpenArticle);
      const state: GraphClientState = (root as any).__graphState ?? readGraphState(root);
      const targetUrl = node?.urls?.[state.locale];
      if (targetUrl) {
        window.location.href = targetUrl;
      }
      return;
    }

    const focusRelatedButton = target.closest<HTMLElement>('[data-graph-focus-related]');
    if (focusRelatedButton) {
      const nodeId = focusRelatedButton.dataset.graphFocusRelated;
      if (nodeId) {
        getGraphControls(root)?.focusNode?.(nodeId);
      }
      return;
    }

    const deleteButton = target.closest<HTMLElement>('[data-graph-color-group-delete]');
    if (deleteButton) {
      const index = Number(deleteButton.dataset.graphColorGroupDelete);
      const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
      const nextGroups = cloneColorGroups(currentState.settings.colorGroups).filter((_, itemIndex) => itemIndex !== index);
      applyColorGroupState(replaceColorGroups(currentState, nextGroups));
    }
  });

  (shell as any).__graphSettingsBound = true;
  syncSettingsUI(shell, root);
}

function initAllGraphs() {
  const roots = document.querySelectorAll<HTMLElement>('[data-graph-root]');
  roots.forEach((root) => {
    bindGraphSettings(root);
    void initGraph(root).then(() => {
      const shell = root.closest<HTMLElement>('[data-graph-shell]');
      if (shell) syncSettingsUI(shell, root);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllGraphs, { once: true });
} else {
  initAllGraphs();
}

document.addEventListener('astro:page-load', initAllGraphs);
