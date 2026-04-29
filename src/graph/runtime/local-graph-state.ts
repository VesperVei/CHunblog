import type { GraphSettings } from '../types';

const LAST_LOCAL_GRAPH_NAVIGATION_KEY = 'goosequill.localGraph:navigation';
const LOCAL_GRAPH_NAVIGATION_MAX_AGE_MS = 30 * 60 * 1000;

type LocalGraphSharedState = {
  noteId: string;
  settings: GraphSettings;
  activePresetId?: string;
  updatedAt: number;
};

const listeners = new Map<string, Map<string, (state: LocalGraphSharedState) => void>>();
const runtimeStates = new Map<string, LocalGraphSharedState>();

function isBrowser() {
  return typeof window !== 'undefined';
}

function cloneLocalGraphState(state: LocalGraphSharedState): LocalGraphSharedState {
  return {
    ...state,
    settings: {
      filters: { ...state.settings.filters },
      appearance: { ...state.settings.appearance },
      forces: { ...state.settings.forces },
      layout: { ...state.settings.layout },
      colorGroups: state.settings.colorGroups.map((group) => ({
        ...group,
        match: group.match ? { ...group.match } : undefined,
        rule: group.rule ? { ...group.rule } : undefined,
      })),
    },
  };
}

function parseStoredState(raw: string | null) {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as LocalGraphSharedState;
  } catch {
    return undefined;
  }
}

function isFreshNavigationState(state?: LocalGraphSharedState) {
  return Boolean(state && (Date.now() - state.updatedAt) <= LOCAL_GRAPH_NAVIGATION_MAX_AGE_MS);
}

export function readNavigationLocalGraphState() {
  if (!isBrowser()) {
    return undefined;
  }

  const state = parseStoredState(window.sessionStorage.getItem(LAST_LOCAL_GRAPH_NAVIGATION_KEY));
  return isFreshNavigationState(state) ? cloneLocalGraphState(state) : undefined;
}

export function consumeLastNavigationLocalGraphState() {
  if (!isBrowser()) {
    return undefined;
  }

  const state = readNavigationLocalGraphState();
  if (state) {
    window.sessionStorage.removeItem(LAST_LOCAL_GRAPH_NAVIGATION_KEY);
  }

  return state;
}

export function writeLastNavigationLocalGraphState(state: LocalGraphSharedState) {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.setItem(LAST_LOCAL_GRAPH_NAVIGATION_KEY, JSON.stringify(state));
}

export function subscribeLocalGraphState(noteId: string, subscriberId: string, listener: (state: LocalGraphSharedState) => void) {
  const noteListeners = listeners.get(noteId) ?? new Map<string, (state: LocalGraphSharedState) => void>();
  noteListeners.set(subscriberId, listener);
  listeners.set(noteId, noteListeners);

  return () => {
    const current = listeners.get(noteId);
    current?.delete(subscriberId);
    if (current && current.size === 0) {
      listeners.delete(noteId);
    }
  };
}

export function readRuntimeLocalGraphState(noteId: string) {
  const state = runtimeStates.get(noteId);
  return state ? cloneLocalGraphState(state) : undefined;
}

export function writeRuntimeLocalGraphState(state: LocalGraphSharedState) {
  runtimeStates.set(state.noteId, cloneLocalGraphState(state));
}

export function clearRuntimeLocalGraphState(noteId: string) {
  runtimeStates.delete(noteId);
}

export function publishLocalGraphState(state: LocalGraphSharedState, sourceSubscriberId?: string) {
  writeRuntimeLocalGraphState(state);
  const noteListeners = listeners.get(state.noteId);
  if (!noteListeners) {
    return;
  }

  for (const [subscriberId, listener] of noteListeners.entries()) {
    if (subscriberId === sourceSubscriberId) {
      continue;
    }

    listener(cloneLocalGraphState(state));
  }
}

export function createLocalGraphSharedState(noteId: string, settings: GraphSettings, activePresetId?: string): LocalGraphSharedState {
  return {
    noteId,
    settings: cloneLocalGraphState({ noteId, settings, activePresetId, updatedAt: Date.now() }).settings,
    activePresetId,
    updatedAt: Date.now(),
  };
}
