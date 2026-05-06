import { DEFAULT_LAYOUT, defaultGraphSettings, getEffectiveLayoutPreset, getLayoutCapabilities, normalizeGraphSettingsForMode, resolveGraphSettings } from '../../graph/constants';
import { getForceRelationColor } from '../../graph/color';
import { forceLegendOrder, getForceLegendLabel } from '../../graph/color/force';
import { closeNodeOverlayPanel } from '../../graph/interaction/node-overlay-panel';
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
import type { GraphLayoutMode, GraphNode, GraphSettings, GraphViewMode } from '../../graph/types';
import { showGraphNodeOverlay } from './graph-node-overlay';

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

type VisibilityMap = Set<string> | null;

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

function parseVisibilityMap(raw?: string): VisibilityMap {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return null;
  }
}

function isVisibleByMap(map: VisibilityMap, key: string) {
  return map ? map.has(key) : true;
}

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

function normalizeStateForMode(state: GraphClientState): GraphClientState {
  return {
    ...state,
    settings: normalizeGraphSettingsForMode(state.mode, {
      ...state.settings,
      filters: { ...state.settings.filters },
      appearance: { ...state.settings.appearance },
      forces: { ...state.settings.forces },
      layout: { ...state.settings.layout },
    }),
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
    visible: ({ state }) => getLayoutCapabilities(state.mode, state.settings).showDepthControl,
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
  linkOpacity: { scope: 'appearance', control: 'slider', updateMode: 'appearance', read: (s) => String(s.settings.appearance.linkOpacity ?? 1), write: (s, v) => updateScope(s, 'appearance', { linkOpacity: Number(v) }), format: formatFloat },
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
  preset: {
    scope: 'layout',
    control: 'select',
    updateMode: 'settings',
    read: (s) => getLayoutCapabilities(s.mode, s.settings).effectivePreset ?? DEFAULT_LAYOUT,
    write: (s, v) => updateScope(s, 'layout', { preset: v as GraphLayoutMode }),
  },
  brainAnchorStrength: { scope: 'layout', control: 'slider', updateMode: 'settings', visible: ({ state }) => getLayoutCapabilities(state.mode, state.settings).showBrainAnchorStrength, read: (s) => String(s.settings.layout.brainAnchorStrength ?? 0.35), write: (s, v) => updateScope(s, 'layout', { brainAnchorStrength: Number(v) }), format: formatFloat },
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

function getGraphControls(root: HTMLElement) {
  return (root as any).__graphControls;
}

function getContextMenuHost(root: HTMLElement) {
  return root.closest<HTMLElement>('.graph-workspace') ?? root;
}

function getContextMenuAnchor(root: HTMLElement) {
  return root;
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

function isMissingNode(node: GraphNode) {
  return node.exists === false || node.kind === 'missing_note';
}

function readGraphState(root: HTMLElement): GraphClientState {
  const mode = (root.dataset.mode as GraphViewMode) || 'global';
  const debug = isGraphDebugMode();
  const { presets, activePresetId } = getAllPresets();
  const resolvedActivePresetId = getGraphPresetById(presets, activePresetId)?.id ?? getFallbackPresetId(presets);
  const baseSettings = root.dataset.graphSettings
    ? JSON.parse(root.dataset.graphSettings) as GraphSettings
    : resolveGraphSettings(mode, DEFAULT_LAYOUT, defaultGraphSettings);
  let settings = resolvePresetBackedSettings(baseSettings, resolvedActivePresetId);
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

  return normalizeStateForMode({
    graphUrl: root.dataset.graphUrl || '/graph.json',
    mode,
    locale: root.dataset.locale || 'en',
    focusId,
    settings,
    navigationSearch: root.dataset.navigationSearch,
    debug,
    activePresetId: nextActivePresetId,
  });
}

function writeGraphState(root: HTMLElement, state: GraphClientState) {
  root.dataset.graphSettings = JSON.stringify(normalizeStateForMode(state).settings);
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
  const controls = await createGraphView(root, {
    ...currentState,
    graphUrl: currentState.graphUrl,
    onNodeContextMenu: (event, node) => {
      const state: GraphClientState = (root as any).__graphState ?? readGraphState(root);
      if (getEffectiveLayoutPreset(state.mode, state.settings) !== 'brain') {
        return;
      }

      event.preventDefault();
      root.dispatchEvent(new CustomEvent('graph:node-contextmenu', {
        detail: { node, clientX: event.clientX, clientY: event.clientY },
      }));
    },
  }, fullData);
  (root as any).__graphControls = controls;
  (root as any).__graphState = currentState;
  bindGraphThemeSync(root);

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

function bindGraphThemeSync(root: HTMLElement) {
  if ((root as any).__graphThemeSyncBound) {
    return;
  }

  const shell = root.closest<HTMLElement>('[data-graph-shell]');
  const controls = getGraphControls(root);
  if (!shell || !controls) {
    return;
  }

  const refreshTheme = () => {
    controls.refreshAppearance?.();
    syncSettingsUI(shell, root);
  };

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.attributeName === 'data-theme')) {
      refreshTheme();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleMediaChange = () => {
    if (!document.documentElement.getAttribute('data-theme')) {
      refreshTheme();
    }
  };
  media.addEventListener('change', handleMediaChange);

  (root as any).__graphThemeObserver = observer;
  (root as any).__graphThemeMedia = media;
  (root as any).__graphThemeHandler = handleMediaChange;
  (root as any).__graphThemeSyncBound = true;
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

function syncLegendUI(shell: HTMLElement, state: GraphClientState) {
  const capabilities = getLayoutCapabilities(state.mode, state.settings);
  const effectiveLayout = getEffectiveLayoutPreset(state.mode, state.settings);
  const legendPanel = shell.querySelector<HTMLElement>('[data-graph-legend-panel]');
  const legendToggle = shell.querySelector<HTMLButtonElement>('[data-graph-legend-toggle]');
  const legendItems = shell.querySelector<HTMLElement>('[data-graph-legend-items]');
  const filtersHeader = shell.querySelector<HTMLElement>('[data-graph-global-filters-header]');
  const filtersList = shell.querySelector<HTMLElement>('[data-graph-global-filters-list]');
  if (!legendPanel || !legendItems) {
    return;
  }

  const legendEnabled = shell.dataset.graphLegendEnabled !== 'false';
  const visibleGroups = parseVisibilityMap(shell.dataset.graphVisibleSettingsGroups);
  const filtersVisible = isVisibleByMap(visibleGroups, 'filters');

  if (legendToggle) {
    legendToggle.hidden = !legendEnabled || !capabilities.showGlobalLegend;
  }
  legendPanel.hidden = !legendEnabled || !capabilities.showGlobalLegend;
  if (!legendEnabled || !capabilities.showGlobalLegend) {
    legendPanel.classList.remove('is-open');
    legendPanel.setAttribute('aria-hidden', 'true');
    legendToggle?.setAttribute('aria-expanded', 'false');
    return;
  }

  if (filtersHeader) {
    filtersHeader.hidden = !filtersVisible;
  }

  if (filtersList) {
    filtersList.hidden = !filtersVisible;
  }

  const isOpen = getLegendOpenState(shell);
  legendPanel.classList.toggle('is-open', isOpen);
  legendPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  legendToggle?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

  if (effectiveLayout !== 'force') {
    legendItems.replaceChildren();
    return;
  }

  const explicitTheme = document.documentElement.getAttribute('data-theme');
  const isDarkTheme = explicitTheme === 'dark'
    || (!explicitTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);

  legendItems.replaceChildren(...forceLegendOrder.map((key) => {
    const item = document.createElement('div');
    item.className = 'graph-legend-item';

    const dot = document.createElement('span');
    dot.className = 'graph-legend-dot';
    dot.style.background = getForceRelationColor(key, isDarkTheme);

    const label = document.createElement('span');
    label.textContent = getForceLegendLabel(key, state.locale);

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
  const isMissingNode = node.exists === false || node.kind === 'missing_note';
  const subtitle = isMissingNode ? 'missing note' : node.type || node.metadata?.note_type || 'note';
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
        ${isMissingNode ? '' : `<button type="button" class="graph-settings-action" data-graph-open-article="${escapeHtml(node.id)}">${escapeHtml(openArticleLabel)}</button>`}
        <button type="button" class="graph-settings-action" data-graph-focus-related="${escapeHtml(node.id)}">${escapeHtml(focusRelatedLabel)}</button>
      </div>
    </article>
  `;
}

function syncSettingsUI(shell: HTMLElement, root: HTMLElement) {
  const state: GraphClientState = (root as any).__graphState ?? readGraphState(root);
  const ctx: GraphSidebarContext = { state, debug: state.debug };
  const visibleGroups = parseVisibilityMap(shell.dataset.graphVisibleSettingsGroups);
  const visibleFields = parseVisibilityMap(shell.dataset.graphVisibleSettingsFields);

  syncDebugVisibility(shell, state.debug);
  syncPresetUI(shell, state);
  syncLegendUI(shell, state);
  syncDetailDrawer(shell, root);

  shell.querySelectorAll<HTMLElement>('[data-graph-settings-group-id]').forEach((group) => {
    const key = group.dataset.graphSettingsGroupId || '';
    group.hidden = !isVisibleByMap(visibleGroups, key);
  });

  shell.querySelectorAll<HTMLElement>('[data-graph-setting-field]').forEach((field) => {
    const key = field.dataset.graphSettingField || '';
    const config = FIELD_CONFIG[key];
    const visible = isVisibleByMap(visibleFields, key)
      && (config ? (!config.debugOnly || ctx.debug) && (config.visible?.(ctx) ?? true) : true);
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
  nextState = normalizeStateForMode(nextState);
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
  controls.updateSettings?.(nextState.settings);
}

function dispatchFieldUpdate(root: HTMLElement, shell: HTMLElement, key: string, nextState: GraphClientState) {
  const config = FIELD_CONFIG[key];
  if (!config) return;
  nextState = normalizeStateForMode(nextState);
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

  root.addEventListener('graph:node-contextmenu', ((event: Event) => {
    const customEvent = event as CustomEvent<{ node?: GraphNode; clientX?: number; clientY?: number }>;
    const node = customEvent.detail?.node;
    if (!node) {
      return;
    }

    setSelectedNodeId(shell, node.id);
    const state: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const menuHost = getContextMenuHost(root);
    const menuAnchor = getContextMenuAnchor(root);
    showGraphNodeOverlay({
      menuHost,
      menuAnchor,
      node,
      clientX: customEvent.detail.clientX ?? 0,
      clientY: customEvent.detail.clientY ?? 0,
      locale: state.locale,
      graphUrl: state.graphUrl,
      controls: getGraphControls(root),
      updateGraphCache: (graphUrl, snapshot) => graphDataCache.set(graphUrl, Promise.resolve(snapshot)),
      setSelectedNodeId: (nodeId) => setSelectedNodeId(shell, nodeId),
      syncDetailDrawer: () => syncDetailDrawer(shell, root),
    });
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

  shell.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (!target.closest('[data-graph-node-overlay-panel]')) {
      closeNodeOverlayPanel(getContextMenuHost(root));
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

  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNodeOverlayPanel(getContextMenuHost(root));
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
