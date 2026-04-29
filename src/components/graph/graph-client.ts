import { DEFAULT_LAYOUT, defaultGraphSettings, resolveGraphSettings } from '../../graph/constants';
import { createGraphView } from '../../graph/runtime/create-graph-view';
import type { GraphLayoutMode, GraphSettings, GraphViewMode } from '../../graph/types';

const graphDataCache = new Map<string, Promise<any>>();

type GraphClientState = {
  graphUrl: string;
  mode: GraphViewMode;
  locale: string;
  focusId?: string;
  settings: GraphSettings;
  navigationSearch?: string;
};

type FieldScope = 'filters' | 'appearance' | 'forces' | 'layout';
type FieldControl = 'search' | 'slider' | 'toggle' | 'select';
type FieldConfig = {
  scope: FieldScope;
  control: FieldControl;
  visible?: (state: GraphClientState) => boolean;
  read: (state: GraphClientState) => string | boolean;
  write: (state: GraphClientState, rawValue: string | boolean) => GraphClientState;
  format?: (value: string | boolean) => string;
  debounceMs?: number;
};

const formatFloat = (value: string | boolean) => Number(value).toFixed(2);
const formatInteger = (value: string | boolean) => String(Math.round(Number(value)));

const FIELD_CONFIG: Record<string, FieldConfig> = {
  searchQuery: {
    scope: 'filters',
    control: 'search',
    read: (state) => state.settings.filters.searchQuery ?? '',
    write: (state, rawValue) => updateScope(state, 'filters', { searchQuery: String(rawValue) }),
    debounceMs: 150,
  },
  depth: {
    scope: 'filters',
    control: 'slider',
    visible: (state) => state.mode === 'local' && state.settings.layout.preset !== 'brain',
    read: (state) => String(state.settings.filters.depth ?? 1),
    write: (state, rawValue) => updateScope(state, 'filters', { depth: Number(rawValue) }),
    format: formatInteger,
    debounceMs: 150,
  },
  showBacklinks: {
    scope: 'filters',
    control: 'toggle',
    read: (state) => Boolean(state.settings.filters.showBacklinks),
    write: (state, rawValue) => updateScope(state, 'filters', { showBacklinks: Boolean(rawValue) }),
  },
  showForwardLinks: {
    scope: 'filters',
    control: 'toggle',
    read: (state) => Boolean(state.settings.filters.showForwardLinks),
    write: (state, rawValue) => updateScope(state, 'filters', { showForwardLinks: Boolean(rawValue) }),
  },
  showCrossLinks: {
    scope: 'filters',
    control: 'toggle',
    read: (state) => Boolean(state.settings.filters.showCrossLinks),
    write: (state, rawValue) => updateScope(state, 'filters', { showCrossLinks: Boolean(rawValue) }),
  },
  showTags: {
    scope: 'filters',
    control: 'toggle',
    read: (state) => Boolean(state.settings.filters.showTags),
    write: (state, rawValue) => updateScope(state, 'filters', { showTags: Boolean(rawValue) }),
  },
  showAttachments: {
    scope: 'filters',
    control: 'toggle',
    read: (state) => Boolean(state.settings.filters.showAttachments),
    write: (state, rawValue) => updateScope(state, 'filters', { showAttachments: Boolean(rawValue) }),
  },
  onlyExistingNotes: {
    scope: 'filters',
    control: 'toggle',
    read: (state) => Boolean(state.settings.filters.onlyExistingNotes),
    write: (state, rawValue) => updateScope(state, 'filters', { onlyExistingNotes: Boolean(rawValue) }),
  },
  showArrows: {
    scope: 'appearance',
    control: 'toggle',
    read: (state) => Boolean(state.settings.appearance.showArrows),
    write: (state, rawValue) => updateScope(state, 'appearance', { showArrows: Boolean(rawValue) }),
  },
  textOpacity: {
    scope: 'appearance',
    control: 'slider',
    read: (state) => String(state.settings.appearance.textOpacity ?? 0.8),
    write: (state, rawValue) => updateScope(state, 'appearance', { textOpacity: Number(rawValue) }),
    format: formatFloat,
  },
  nodeRadius: {
    scope: 'appearance',
    control: 'slider',
    read: (state) => String(state.settings.appearance.nodeRadius ?? 6),
    write: (state, rawValue) => updateScope(state, 'appearance', { nodeRadius: Number(rawValue) }),
    format: formatInteger,
  },
  linkWidth: {
    scope: 'appearance',
    control: 'slider',
    read: (state) => String(state.settings.appearance.linkWidth ?? 1.5),
    write: (state, rawValue) => updateScope(state, 'appearance', { linkWidth: Number(rawValue) }),
    format: formatFloat,
  },
  labelSize: {
    scope: 'appearance',
    control: 'slider',
    read: (state) => String(state.settings.appearance.labelSize ?? 12),
    write: (state, rawValue) => updateScope(state, 'appearance', { labelSize: Number(rawValue) }),
    format: formatInteger,
  },
  centerStrength: {
    scope: 'forces',
    control: 'slider',
    read: (state) => String(state.settings.forces.centerStrength ?? 0.08),
    write: (state, rawValue) => updateScope(state, 'forces', { centerStrength: Number(rawValue) }),
    format: formatFloat,
  },
  repelStrength: {
    scope: 'forces',
    control: 'slider',
    read: (state) => String(state.settings.forces.repelStrength ?? 120),
    write: (state, rawValue) => updateScope(state, 'forces', { repelStrength: Number(rawValue) }),
    format: formatInteger,
  },
  linkStrength: {
    scope: 'forces',
    control: 'slider',
    read: (state) => String(state.settings.forces.linkStrength ?? 0.7),
    write: (state, rawValue) => updateScope(state, 'forces', { linkStrength: Number(rawValue) }),
    format: formatFloat,
  },
  linkDistance: {
    scope: 'forces',
    control: 'slider',
    read: (state) => String(state.settings.forces.linkDistance ?? 120),
    write: (state, rawValue) => updateScope(state, 'forces', { linkDistance: Number(rawValue) }),
    format: formatInteger,
  },
  collisionStrength: {
    scope: 'forces',
    control: 'slider',
    read: (state) => String(state.settings.forces.collisionStrength ?? 0.7),
    write: (state, rawValue) => updateScope(state, 'forces', { collisionStrength: Number(rawValue) }),
    format: formatFloat,
  },
  alphaTargetOnDrag: {
    scope: 'forces',
    control: 'slider',
    read: (state) => String(state.settings.forces.alphaTargetOnDrag ?? 0.25),
    write: (state, rawValue) => updateScope(state, 'forces', { alphaTargetOnDrag: Number(rawValue) }),
    format: formatFloat,
  },
  preset: {
    scope: 'layout',
    control: 'select',
    read: (state) => state.settings.layout.preset ?? DEFAULT_LAYOUT,
    write: (state, rawValue) => updateScope(state, 'layout', { preset: rawValue as GraphLayoutMode }),
  },
  brainAnchorStrength: {
    scope: 'layout',
    control: 'slider',
    visible: (state) => state.settings.layout.preset === 'brain',
    read: (state) => String(state.settings.layout.brainAnchorStrength ?? 0.35),
    write: (state, rawValue) => updateScope(state, 'layout', { brainAnchorStrength: Number(rawValue) }),
    format: formatFloat,
  },
  preserveSelectedPreset: {
    scope: 'layout',
    control: 'toggle',
    read: (state) => Boolean(state.settings.layout.preserveSelectedPreset),
    write: (state, rawValue) => updateScope(state, 'layout', { preserveSelectedPreset: Boolean(rawValue) }),
  },
};

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

function resolveFocusId(root: HTMLElement) {
  const explicit = root.dataset.focusId;
  if (explicit) {
    return explicit;
  }

  const queryFocus = new URLSearchParams(window.location.search).get('focus');
  return queryFocus || undefined;
}

function readGraphState(root: HTMLElement): GraphClientState {
  const mode = (root.dataset.mode as GraphViewMode) || 'global';
  const settings = root.dataset.graphSettings ? JSON.parse(root.dataset.graphSettings) as GraphSettings : resolveGraphSettings(mode, DEFAULT_LAYOUT, defaultGraphSettings);

  return {
    graphUrl: root.dataset.graphUrl || '/graph.json',
    mode,
    locale: root.dataset.locale || 'en',
    focusId: resolveFocusId(root),
    settings,
    navigationSearch: root.dataset.navigationSearch,
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

function syncSettingsUI(shell: HTMLElement, root: HTMLElement) {
  const state: GraphClientState = (root as any).__graphState ?? readGraphState(root);

  shell.querySelectorAll<HTMLElement>('[data-graph-setting-field]').forEach((field) => {
    const key = field.dataset.graphSettingField || '';
    const config = FIELD_CONFIG[key];
    field.hidden = config ? !(config.visible?.(state) ?? true) : false;
  });

  shell.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-graph-setting-input]').forEach((input) => {
    const key = input.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) {
      return;
    }

    const value = config.read(state);
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      input.checked = Boolean(value);
      return;
    }

    input.value = String(value);
  });

  shell.querySelectorAll<HTMLOutputElement>('[data-graph-setting-value]').forEach((output) => {
    const key = output.dataset.graphSettingValue || '';
    const config = FIELD_CONFIG[key];
    if (!config) {
      return;
    }

    const value = config.read(state);
    const text = config.format ? config.format(value) : String(value);
    output.value = text;
    output.textContent = text;
  });
}

function updateGraphSettings(root: HTMLElement, nextSettings: GraphSettings) {
  const controls = (root as any).__graphControls;
  const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
  const nextState = { ...currentState, settings: nextSettings };
  writeGraphState(root, nextState);
  (root as any).__graphState = nextState;
  controls?.updateSettings?.(nextSettings);
}

function dispatchFieldUpdate(root: HTMLElement, shell: HTMLElement, key: string, nextState: GraphClientState) {
  const config = FIELD_CONFIG[key];
  if (!config) {
    return;
  }

  writeGraphState(root, nextState);
  (root as any).__graphState = nextState;
  syncSettingsUI(shell, root);

  const controls = (root as any).__graphControls;
  const run = () => {
    if (config.scope === 'forces') {
      controls?.updateForces?.(nextState.settings.forces);
      return;
    }

    if (config.scope === 'appearance') {
      controls?.updateAppearance?.(nextState.settings.appearance);
      return;
    }

    if (config.scope === 'filters') {
      controls?.updateFilters?.(nextState.settings.filters);
      return;
    }

    updateGraphSettings(root, nextState.settings);
  };

  if (config.debounceMs) {
    const timers = ((root as any).__graphDebounceTimers ??= new Map<string, number>());
    window.clearTimeout(timers.get(key));
    timers.set(key, window.setTimeout(run, config.debounceMs));
    return;
  }

  run();
}

function bindSectionToggles(shell: HTMLElement) {
  if ((shell as any).__graphSectionsBound) {
    return;
  }

  (shell as any).__graphSectionsBound = true;
  shell.querySelectorAll<HTMLButtonElement>('[data-graph-section-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const content = button.nextElementSibling as HTMLElement | null;
      if (!content) {
        return;
      }

      const isOpen = button.getAttribute('aria-expanded') !== 'false';
      button.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      content.classList.toggle('is-collapsed', isOpen);
    });
  });
}

function bindGraphSettings(root: HTMLElement) {
  const shell = root.closest<HTMLElement>('[data-graph-shell]');
  if (!shell || (shell as any).__graphSettingsBound) {
    return;
  }

  (shell as any).__graphSettingsBound = true;
  bindSectionToggles(shell);

  const toggle = shell.querySelector<HTMLButtonElement>('[data-graph-settings-toggle]');
  const panel = shell.querySelector<HTMLElement>('[data-graph-settings-panel]');
  if (!toggle || !panel) {
    return;
  }

  const setOpen = (isOpen: boolean) => {
    panel.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const isOpen = panel.hidden;
    setOpen(isOpen);
    if (isOpen) {
      syncSettingsUI(shell, root);
    }
  });

  shell.querySelector('[data-graph-settings-reset]')?.addEventListener('click', () => {
    const state = readGraphState(root);
    const resetSettings = resolveGraphSettings(state.mode, DEFAULT_LAYOUT, defaultGraphSettings);
    updateGraphSettings(root, resetSettings);
    syncSettingsUI(shell, root);
  });

  const handleControlUpdate = (target: HTMLInputElement | HTMLSelectElement) => {
    const key = target.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) {
      return;
    }

    const currentState: GraphClientState = (root as any).__graphState ?? readGraphState(root);
    const rawValue = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
    const nextState = config.write(currentState, rawValue);
    dispatchFieldUpdate(root, shell, key, nextState);
  };

  shell.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const key = target.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) {
      return;
    }

    if (config.control === 'search' || config.control === 'slider') {
      handleControlUpdate(target);
    }
  });

  shell.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const key = target.dataset.graphSettingInput || '';
    const config = FIELD_CONFIG[key];
    if (!config) {
      return;
    }

    if (config.control === 'toggle' || config.control === 'select') {
      handleControlUpdate(target);
    }
  });

  document.addEventListener('click', (event) => {
    if (!shell.contains(event.target as Node)) {
      setOpen(false);
    }
  });

  syncSettingsUI(shell, root);
}

function initAllGraphs() {
  const roots = document.querySelectorAll<HTMLElement>('[data-graph-root]');
  roots.forEach((root) => {
    bindGraphSettings(root);
    void initGraph(root).then(() => {
      const shell = root.closest<HTMLElement>('[data-graph-shell]');
      if (shell) {
        syncSettingsUI(shell, root);
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllGraphs, { once: true });
} else {
  initAllGraphs();
}

document.addEventListener('astro:page-load', initAllGraphs);
