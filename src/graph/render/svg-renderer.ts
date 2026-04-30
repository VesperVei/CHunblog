import { DEFAULT_APPEARANCE_SETTINGS } from '../constants';
import { resolveNodeColor } from '../color-groups';
import type { GraphAppearanceSettings, GraphData, GraphHoverState, GraphNode, GraphSettings } from '../types';
import { labelForNode } from '../data/graph-build';

export function ensureArrowMarker(canvas, markerId: string) {
  const defs = canvas.select('defs').empty() ? canvas.append('defs') : canvas.select('defs');
  const marker = defs.select(`#${markerId}`);
  if (!marker.empty()) {
    return;
  }

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

export function edgeKey(edge) {
  const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
  const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
  return `${sourceId}::${targetId}::${edge.targetHeading ?? ''}::${edge.relation ?? ''}`;
}

function isSelectedNode(node: GraphNode, focusId?: string) {
  return node.id === focusId;
}

function getBaseNodeRadius(node: GraphNode, appearance: GraphAppearanceSettings, focusId?: string) {
  if (isSelectedNode(node, focusId)) {
    return appearance.focusNodeRadius ?? Math.max((appearance.nodeRadius ?? 6) + 3, 9);
  }

  return appearance.nodeRadius ?? 6;
}

function getNodeRadius(node: GraphNode, appearance: GraphAppearanceSettings, focusId: string | undefined, hoverState: GraphHoverState) {
  const baseRadius = getBaseNodeRadius(node, appearance, focusId);
  const isHovered = hoverState.hoveredNodeId === node.id;
  const isConnected = hoverState.connectedNodeIds.has(node.id);

  if (isHovered) {
    return baseRadius * (isSelectedNode(node, focusId) ? 1.14 : 1.25);
  }

  if (isConnected) {
    return baseRadius * 1.08;
  }

  return baseRadius;
}

function getNodeOpacity(node: GraphNode, focusId: string | undefined, hoverState: GraphHoverState) {
  if (!hoverState.hoveredNodeId) {
    return 1;
  }

  if (node.id === hoverState.hoveredNodeId || hoverState.connectedNodeIds.has(node.id) || isSelectedNode(node, focusId)) {
    return 1;
  }

  return 0.18;
}

function getNodeFill(node: GraphNode, settings: GraphSettings, locale: string, focusId: string | undefined, hoverState: GraphHoverState) {
  if (isSelectedNode(node, focusId)) {
    return 'var(--graph-node-selected)';
  }

  if (hoverState.hoveredNodeId === node.id) {
    return 'var(--graph-node-hover)';
  }

  return resolveNodeColor(node, settings.colorGroups, locale, 'var(--graph-node-default)');
}

function getNodeStroke(node: GraphNode, focusId: string | undefined, hoverState: GraphHoverState) {
  if (isSelectedNode(node, focusId) || hoverState.hoveredNodeId === node.id) {
    return 'var(--graph-accent)';
  }

  if (hoverState.connectedNodeIds.has(node.id)) {
    return 'var(--graph-node-stroke)';
  }

  return 'transparent';
}

function getNodeStrokeWidth(node: GraphNode, focusId: string | undefined, hoverState: GraphHoverState) {
  if (isSelectedNode(node, focusId) || hoverState.hoveredNodeId === node.id) {
    return 2.4;
  }

  if (hoverState.connectedNodeIds.has(node.id)) {
    return 1.35;
  }

  return 0;
}

function getLinkOpacity(linkId: string, hoverState: GraphHoverState) {
  if (!hoverState.hoveredNodeId) {
    return 0.45;
  }

  return hoverState.connectedLinkIds.has(linkId) ? 0.9 : 0.08;
}

function getLabelOpacity(node: GraphNode, appearance: GraphAppearanceSettings, focusId: string | undefined, hoverState: GraphHoverState) {
  const baseOpacity = appearance.textOpacity ?? 0.8;
  if (!hoverState.hoveredNodeId) {
    return baseOpacity;
  }

  if (node.id === hoverState.hoveredNodeId || hoverState.connectedNodeIds.has(node.id) || isSelectedNode(node, focusId)) {
    return 1;
  }

  return Math.min(baseOpacity, 0.18);
}

export function createEmptyHoverState(): GraphHoverState {
  return {
    hoveredNodeId: undefined,
    connectedNodeIds: new Set<string>(),
    connectedLinkIds: new Set<string>(),
  };
}

export function syncGraphScene(scene, data, locale: string, focusId?: string) {
  scene.focusId = focusId;
  scene.locale = locale;

  scene.link = scene.linkLayer
    .selectAll('line')
    .data(data.links, edgeKey)
    .join('line')
    .attr('class', 'graph-link-line graph-link');

  scene.node = scene.nodeLayer
    .selectAll('circle')
    .data(data.nodes, (item) => item.id)
    .join('circle')
    .attr('class', 'graph-node')
    .style('cursor', 'pointer');

  scene.label = scene.labelLayer
    .selectAll('text')
    .data(data.nodes, (item) => item.id)
    .join('text')
    .text((item) => labelForNode(item, locale))
    .attr('class', 'graph-node-label graph-label')
    .attr('dx', 10)
    .attr('dy', 4);

  return scene;
}

export function renderGraphScene(canvas, data, locale: string, focusId?: string, markerId = 'graph-arrowhead') {
  ensureArrowMarker(canvas, markerId);

  const scene = {
    linkLayer: canvas.append('g').attr('class', 'graph-links'),
    nodeLayer: canvas.append('g').attr('class', 'graph-nodes'),
    labelLayer: canvas.append('g').attr('class', 'graph-labels'),
    link: null,
    node: null,
    label: null,
    markerId,
    focusId,
    locale,
  };

  syncGraphScene(scene, data, locale, focusId);
  return scene;
}

export function applyGraphAppearance(scene, data: GraphData, settings: GraphSettings, hoverState: GraphHoverState, locale: string, focusId?: string) {
  const appearance = { ...DEFAULT_APPEARANCE_SETTINGS, ...settings.appearance };

  scene.link
    .classed('is-connected', (edge) => hoverState.connectedLinkIds.has(edgeKey(edge)))
    .classed('is-dimmed', (edge) => Boolean(hoverState.hoveredNodeId) && !hoverState.connectedLinkIds.has(edgeKey(edge)))
    .style('stroke', (edge) => hoverState.connectedLinkIds.has(edgeKey(edge)) ? 'var(--graph-link-highlight)' : 'var(--graph-link-default)')
    .attr('stroke-opacity', (edge) => getLinkOpacity(edgeKey(edge), hoverState))
    .attr('stroke-width', (edge) => hoverState.connectedLinkIds.has(edgeKey(edge)) ? (appearance.linkWidth ?? 1.5) * 1.4 : appearance.linkWidth ?? 1.5)
    .attr('marker-end', appearance.showArrows ? `url(#${scene.markerId})` : null);

  scene.node
    .classed('is-selected', (node) => isSelectedNode(node, focusId))
    .classed('is-hovered', (node) => hoverState.hoveredNodeId === node.id)
    .classed('is-connected', (node) => hoverState.connectedNodeIds.has(node.id))
    .classed('is-dimmed', (node) => Boolean(hoverState.hoveredNodeId) && node.id !== hoverState.hoveredNodeId && !hoverState.connectedNodeIds.has(node.id) && !isSelectedNode(node, focusId))
    .style('fill', (node) => getNodeFill(node, settings, locale, focusId, hoverState))
    .style('stroke', (node) => getNodeStroke(node, focusId, hoverState))
    .attr('stroke-width', (node) => getNodeStrokeWidth(node, focusId, hoverState))
    .attr('opacity', (node) => getNodeOpacity(node, focusId, hoverState))
    .attr('r', (node) => getNodeRadius(node, appearance, focusId, hoverState));

  scene.label
    .classed('is-selected', (node) => isSelectedNode(node, focusId))
    .classed('is-hovered', (node) => hoverState.hoveredNodeId === node.id)
    .classed('is-connected', (node) => hoverState.connectedNodeIds.has(node.id))
    .classed('is-dimmed', (node) => Boolean(hoverState.hoveredNodeId) && node.id !== hoverState.hoveredNodeId && !hoverState.connectedNodeIds.has(node.id) && !isSelectedNode(node, focusId))
    .attr('opacity', (node) => getLabelOpacity(node, appearance, focusId, hoverState))
    .style('font-size', `${appearance.labelSize ?? 12}px`);
}

function navigateToNode(item, locale: string, navigationSearch?: string, beforeNavigate?: () => void) {
  const targetUrl = item.urls?.[locale];
  if (!targetUrl) {
    return;
  }

  beforeNavigate?.();

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
}

export function bindNodeNavigation(nodeSelection, locale: string, navigationSearch?: string, options: {
  beforeNavigate?: () => void;
  onNodeClick?: (item: GraphNode) => void;
  onNodeDoubleClick?: (item: GraphNode) => void;
  navigateOnClick?: boolean;
  navigateOnDoubleClick?: boolean;
} = {}) {
  let clickTimer: number | undefined;

  nodeSelection.on('click', (event, item) => {
    if (event.defaultPrevented || (item as any).__dragMoved) {
      (item as any).__dragMoved = false;
      return;
    }

    const runSingleClick = () => {
      options.onNodeClick?.(item);
      if (options.navigateOnClick !== false) {
        navigateToNode(item, locale, navigationSearch, options.beforeNavigate);
      }
    };

    if (options.onNodeDoubleClick || options.navigateOnDoubleClick) {
      window.clearTimeout(clickTimer);
      clickTimer = window.setTimeout(runSingleClick, 220);
      return;
    }

    runSingleClick();
  });

  nodeSelection.on('dblclick', (event, item) => {
    if (event.defaultPrevented || (item as any).__dragMoved) {
      return;
    }

    window.clearTimeout(clickTimer);
    options.onNodeDoubleClick?.(item);
    if (options.navigateOnDoubleClick) {
      navigateToNode(item, locale, navigationSearch, options.beforeNavigate);
    }
  });
}
