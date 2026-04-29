import { DEFAULT_LAYOUT, defaultGraphSettings, resolveGraphSettings } from '../../graph/constants';
import { createGraphView } from '../../graph/runtime/create-graph-view';
import { BUILTIN_GRAPH_PRESETS, createPresetFromSettings, getGraphPresetById, mergePresetIntoSettings, type GraphViewPreset } from '../../graph/presets';
import type { GraphLayoutMode, GraphSettings, GraphViewMode } from '../../graph/types';

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

type FieldScope = 'filters' | 'appearance' | 'forces' | 'layout';
type FieldControl = 'search' | 'slider' | 'toggle' | 'select';
type UpdateMode = 'filters' | 'appearance' | 'forces' | 'settings';
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

function readGraphState(root: HTMLElement): GraphClientState {
  const mode = (root.dataset.mode as GraphViewMode) || 'global';
  const debug = isGraphDebugMode();
  const { presets, activePresetId } = getAllPresets();
  const resolvedActivePresetId = getGraphPresetById(presets, activePresetId)?.id ?? getFallbackPresetId(presets);
  const settings = root.dataset.graphSettings
    ? JSON.parse(root.dataset.graphSettings) as GraphSettings
    : applyPresetKeepingFilters(resolveGraphSettings(mode, DEFAULT_LAYOUT, defaultGraphSettings), getGraphPresetById(presets, resolvedActivePresetId));

  return {
    graphUrl: root.dataset.graphUrl || '/graph.json',
    mode,
    locale: root.dataset.locale || 'en',
    focusId: resolveFocusId(root),
    settings,
    navigationSearch: root.dataset.navigationSearch,
    debug,
    activePresetId: resolvedActivePresetId,
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

function syncSettingsUI(shell: HTMLElement, root: HTMLElement) {
  const state: GraphClientState = (root as any).__graphState ?? readGraphState(root);
  const ctx: GraphSidebarContext = { state, debug: state.debug };

  syncDebugVisibility(shell, state.debug);
  syncPresetUI(shell, state);

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

function applyNextState(root: HTMLElement, nextState: GraphClientState, updateMode: UpdateMode) {
  const controls = (root as any).__graphControls;
  writeGraphState(root, nextState);
  (root as any).__graphState = nextState;

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

  (shell as any).__graphSettingsBound = true;
  bindSectionToggles(shell);
  bindPresetActions(root, shell);

  const toggle = shell.querySelector<HTMLButtonElement>('[data-graph-settings-toggle]');
  const panel = shell.querySelector<HTMLElement>('[data-graph-settings-panel]');
  if (!toggle || !panel) return;

  const setOpen = (isOpen: boolean) => {
    panel.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const isOpen = panel.hidden;
    setOpen(isOpen);
    if (isOpen) syncSettingsUI(shell, root);
  });

  shell.querySelector('[data-graph-settings-reset]')?.addEventListener('click', () => {
    const state = readGraphState(root);
    const resetSettings = resolveGraphSettings(state.mode, DEFAULT_LAYOUT, defaultGraphSettings);
    applyNextState(root, { ...state, settings: resetSettings }, 'settings');
    syncSettingsUI(shell, root);
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

  shell.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const key = target.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) return;
    if (config.control === 'search' || config.control === 'slider') handleControlUpdate(target);
  });

  shell.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const key = target.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) return;
    if (config.control === 'toggle' || config.control === 'select') handleControlUpdate(target);
  });

  document.addEventListener('click', (event) => {
    if (!shell.contains(event.target as Node)) setOpen(false);
  });

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
