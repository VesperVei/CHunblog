import type { GraphNode } from '../../graph/types';
import { closeNodeOverlayPanel, setNodeOverlayPanelBusy, showNodeOverlayPanel } from '../../graph/interaction/node-overlay-panel';

type GraphLevelContextMenuOptions = {
  menuHost: HTMLElement;
  menuAnchor: HTMLElement;
  node: GraphNode;
  clientX: number;
  clientY: number;
  locale: string;
  graphUrl: string;
  controls: any;
  updateGraphCache: (graphUrl: string, snapshot: any) => void;
  setSelectedNodeId: (nodeId: string) => void;
  syncDetailDrawer: () => void;
};

const DEFAULT_ADMIN_API_BASE = 'http://127.0.0.1:4323';

function getAdminApiBase() {
  try {
    return window.localStorage.getItem('graph:admin-api-base') || DEFAULT_ADMIN_API_BASE;
  } catch {
    return DEFAULT_ADMIN_API_BASE;
  }
}

function isMissingNode(node: GraphNode) {
  return node.exists === false || node.kind === 'missing_note';
}

function getCurrentGraphLevel(node: GraphNode) {
  return typeof node.graphLevel === 'number' && Number.isFinite(node.graphLevel) ? node.graphLevel : undefined;
}

function createActionButton(label: string, onClick: () => void, options: { disabled?: boolean; danger?: boolean } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'graph-node-overlay-action';
  button.textContent = label;
  button.disabled = Boolean(options.disabled);
  if (options.danger) {
    button.classList.add('is-danger');
  }
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (button.disabled) return;
    onClick();
  });
  return button;
}

function setActionButtonsDisabled(panelBody: HTMLElement, disabled: boolean) {
  panelBody.querySelectorAll<HTMLButtonElement>('.graph-node-overlay-action').forEach((button) => {
    button.disabled = disabled;
  });
}

async function updateNodeGraphLevel(options: GraphLevelContextMenuOptions, graphLevel: number | null) {
  const { menuHost, node, graphUrl, controls, updateGraphCache, setSelectedNodeId, syncDetailDrawer } = options;
  const panelBody = menuHost.querySelector<HTMLElement>('[data-graph-node-overlay-body]');
  setNodeOverlayPanelBusy(menuHost, true);
  if (panelBody) {
    setActionButtonsDisabled(panelBody, true);
  }

  try {
    const response = await fetch(`${getAdminApiBase()}/api/blog/graph-level`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: node.id, graphLevel }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.message || 'GraphLevel update failed.');
    }

    if (payload.snapshot) {
      updateGraphCache(graphUrl, payload.snapshot);
      controls?.replaceFullData?.(payload.snapshot, {
        preserveViewport: true,
        skipAutoFit: true,
      });
      setSelectedNodeId(node.id);
      syncDetailDrawer();
    }

    closeNodeOverlayPanel(menuHost);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.alert(`更新 graphLevel 失败：${message}\n请确认 npm run admin 正在运行。`);
    setNodeOverlayPanelBusy(menuHost, false);
    if (panelBody) {
      setActionButtonsDisabled(panelBody, false);
    }
  }
}

function buildOverlayContent(options: GraphLevelContextMenuOptions) {
  const { node } = options;
  const currentLevel = getCurrentGraphLevel(node);
  const missing = isMissingNode(node);
  const baseLevel = currentLevel ?? 0;
  const wrapper = document.createElement('div');
  wrapper.className = 'graph-node-overlay-stack';

  const field = document.createElement('div');
  field.className = 'graph-node-overlay-field';
  field.innerHTML = `<span>graphLevel</span><strong>${currentLevel ?? '未设置'}</strong>`;
  wrapper.append(field);

  const actions = document.createElement('div');
  actions.className = 'graph-node-overlay-actions';
  actions.append(
    createActionButton('提升层级', () => void updateNodeGraphLevel(options, baseLevel - 1), { disabled: missing }),
    createActionButton('下沉层级', () => void updateNodeGraphLevel(options, baseLevel + 1), { disabled: missing }),
    createActionButton('设为顶层', () => void updateNodeGraphLevel(options, 0), { disabled: missing }),
    createActionButton('设为指定层级...', () => {
      const raw = window.prompt('输入 graphLevel 数字', String(currentLevel ?? 0));
      if (raw === null) return;
      const next = Number(raw);
      if (!Number.isFinite(next)) {
        window.alert('graphLevel 必须是数字。');
        return;
      }
      void updateNodeGraphLevel(options, next);
    }, { disabled: missing }),
    createActionButton('清除层级', () => void updateNodeGraphLevel(options, null), { disabled: missing, danger: true }),
  );
  wrapper.append(actions);

  const relation = document.createElement('div');
  relation.className = 'graph-node-overlay-placeholder';
  relation.textContent = '关系设置未实现';
  wrapper.append(relation);

  return wrapper;
}

export function showGraphNodeOverlay(options: GraphLevelContextMenuOptions) {
  const { menuHost, menuAnchor, node, clientX, clientY, locale } = options;
  const title = node.titles?.[locale] || node.id;

  showNodeOverlayPanel({
    host: menuHost,
    anchor: menuAnchor,
    clientX,
    clientY,
    title: String(title),
    subtitle: undefined,
    content: buildOverlayContent(options),
  });
}
