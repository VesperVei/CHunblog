import { DEFAULT_APPEARANCE_SETTINGS, GRAPH_COLORS } from '../constants';
import type { GraphAppearanceSettings, GraphNode } from '../types';
import { labelForNode } from '../data/graph-build';

export function ensureArrowMarker(canvas, markerId: string) {
  const defs = canvas.append('defs');
  defs
    .append('marker')
    .attr('id', markerId)
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 12)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', 'currentColor')
    .attr('fill-opacity', 0.65);
}

export function renderGraphScene(canvas, data, locale: string, focusId?: string, markerId = 'graph-arrowhead') {
  ensureArrowMarker(canvas, markerId);

  const link = canvas
    .append('g')
    .attr('class', 'graph-links')
    .attr('stroke', 'var(--graph-muted)')
    .attr('stroke-opacity', 0.45)
    .selectAll('line')
    .data(data.links)
    .join('line')
    .attr('class', 'graph-link-line');

  const node = canvas
    .append('g')
    .attr('class', 'graph-nodes')
    .selectAll('circle')
    .data(data.nodes)
    .join('circle')
    .attr('class', 'graph-node')
    .attr('fill', (item) => GRAPH_COLORS[item.type || 'default'] ?? GRAPH_COLORS.default)
    .attr('stroke', (item) => (item.id === focusId ? 'var(--graph-accent)' : 'transparent'))
    .attr('stroke-width', (item) => (item.id === focusId ? 2 : 0))
    .style('cursor', 'pointer');

  const label = canvas
    .append('g')
    .attr('class', 'graph-labels')
    .selectAll('text')
    .data(data.nodes)
    .join('text')
    .text((item) => labelForNode(item, locale))
    .attr('class', 'graph-node-label')
    .attr('dx', 10)
    .attr('dy', 4);

  const scene = { link, node, label, markerId, focusId };
  applyGraphAppearance(scene, DEFAULT_APPEARANCE_SETTINGS);
  return scene;
}

export function applyGraphAppearance(scene, overrides: GraphAppearanceSettings = {}) {
  const appearance = { ...DEFAULT_APPEARANCE_SETTINGS, ...overrides };

  scene.link
    .attr('stroke-width', appearance.linkWidth ?? 1.5)
    .attr('marker-end', appearance.showArrows ? `url(#${scene.markerId})` : null);

  scene.node.attr('r', (item: GraphNode) => {
    if (item.id === scene.focusId) {
      return appearance.focusNodeRadius ?? Math.max((appearance.nodeRadius ?? 6) + 3, 9);
    }

    return appearance.nodeRadius ?? 6;
  });

  scene.label
    .attr('opacity', appearance.textOpacity ?? 0.8)
    .style('font-size', `${appearance.labelSize ?? 12}px`);
}

export function bindNodeNavigation(nodeSelection, locale: string, navigationSearch?: string) {
  nodeSelection.on('click', (event, item) => {
    if (event.defaultPrevented || (item as any).__dragMoved) {
      (item as any).__dragMoved = false;
      return;
    }

    const targetUrl = item.urls?.[locale] || item.urls?.['zh-cn'] || item.urls?.['en'];
    if (!targetUrl) {
      return;
    }

    if (navigationSearch) {
      window.sessionStorage.setItem('goosequill.graphModal', navigationSearch);
    }

    const nextUrl = new URL(targetUrl, window.location.origin);
    if (navigationSearch) {
      const params = new URLSearchParams(navigationSearch);
      params.forEach((value, key) => {
        nextUrl.searchParams.set(key, value);
      });
    }

    window.location.href = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  });
}
