type NodeOverlayPanelContent = string | HTMLElement | HTMLElement[];

type ShowNodeOverlayPanelOptions = {
  host: HTMLElement;
  anchor: HTMLElement;
  clientX: number;
  clientY: number;
  title: string;
  subtitle?: string;
  content?: NodeOverlayPanelContent;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getNodeOverlayPanel(host: HTMLElement) {
  const panel = host.querySelector<HTMLElement>('[data-graph-node-overlay-panel]');
  if (!panel) {
    throw new Error('Missing static graph node overlay panel host.');
  }

  const title = panel.querySelector<HTMLElement>('[data-graph-node-overlay-title]');
  const subtitle = panel.querySelector<HTMLElement>('[data-graph-node-overlay-subtitle]');
  const body = panel.querySelector<HTMLElement>('[data-graph-node-overlay-body]');
  if (!title || !subtitle || !body) {
    throw new Error('Incomplete static graph node overlay panel structure.');
  }

  return { panel, title, subtitle, body };
}

function normalizeContent(content?: NodeOverlayPanelContent) {
  if (!content) return [] as HTMLElement[];
  if (typeof content === 'string') {
    const body = document.createElement('div');
    body.className = 'graph-node-overlay-panel-body';
    body.textContent = content;
    return [body];
  }

  return Array.isArray(content) ? content : [content];
}

export function closeNodeOverlayPanel(host: HTMLElement) {
  const overlay = host.querySelector<HTMLElement>('[data-graph-node-overlay-panel]');
  if (!overlay) return;
  const body = overlay.querySelector<HTMLElement>('[data-graph-node-overlay-body]');
  const title = overlay.querySelector<HTMLElement>('[data-graph-node-overlay-title]');
  const subtitle = overlay.querySelector<HTMLElement>('[data-graph-node-overlay-subtitle]');

  body?.replaceChildren();
  if (title) title.textContent = '';
  if (subtitle) {
    subtitle.textContent = '';
    subtitle.hidden = true;
  }

  const panel = overlay;
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.classList.remove('is-open');
  panel.classList.remove('is-busy');
}

export function setNodeOverlayPanelBusy(host: HTMLElement, isBusy: boolean) {
  const panel = host.querySelector<HTMLElement>('[data-graph-node-overlay-panel]');
  if (!panel) return;
  panel.classList.toggle('is-busy', isBusy);
}

export function showNodeOverlayPanel(options: ShowNodeOverlayPanelOptions) {
  const { host, anchor, clientX, clientY, title, subtitle, content } = options;
  const overlay = getNodeOverlayPanel(host);
  const bodyNodes = normalizeContent(content);

  overlay.title.innerHTML = escapeHtml(title);
  overlay.subtitle.textContent = subtitle ?? '';
  overlay.subtitle.hidden = !subtitle;
  overlay.body.replaceChildren(...bodyNodes);

  const panel = overlay.panel;
  panel.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('is-open');

  const hostRect = host.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const desiredLeft = clientX - hostRect.left + 18;
  const desiredTop = clientY - hostRect.top;
  const minLeft = Math.max(8, anchorRect.left - hostRect.left + 8);
  const maxLeft = Math.max(minLeft, anchorRect.right - hostRect.left - panelRect.width - 8);
  const minTop = Math.max(8, anchorRect.top - hostRect.top + 8);
  const maxTop = Math.max(minTop, anchorRect.bottom - hostRect.top - panelRect.height - 8);
  const left = Math.min(Math.max(minLeft, desiredLeft), maxLeft);
  const top = Math.min(Math.max(minTop, desiredTop), maxTop);

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}
