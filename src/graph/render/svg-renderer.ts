import { DEFAULT_APPEARANCE_SETTINGS } from '../constants';
import { formatThemeHueOffsetColor, getGraphArrowColor } from '../color';
import {
  deriveHalo,
  deriveStroke,
  getObsidianThemePalette,
  getVisualWeight,
  normalizeForceRelationDepth,
  type ForceRelationKey,
  type ThemeMode,
} from '../color/force';
import type { GraphAppearanceSettings, GraphData, GraphHoverState, GraphLayoutMode, GraphNode, GraphSettings, GraphViewMode } from '../types';
import { labelForNode } from '../data/graph-build';

type GraphAppearanceContext = {
  layout: GraphLayoutMode;
  mode: GraphViewMode;
  isDarkTheme: boolean;
};

function isDarkThemeActive() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }

  const explicitTheme = document.documentElement.getAttribute('data-theme');
  if (explicitTheme === 'dark') return true;
  if (explicitTheme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getThemeMode(isDarkTheme: boolean): ThemeMode {
  return isDarkTheme ? 'dark' : 'light';
}

function resolveRelationDepth(node: GraphNode, focusId?: string) {
  if (node.id === focusId) {
    return 0;
  }

  const explicitDepth = typeof node.relationDepth === 'number'
    ? node.relationDepth
    : typeof node.metadata?.relationDepth === 'number'
      ? Number(node.metadata.relationDepth)
      : typeof node.metadata?.relation_depth === 'number'
        ? Number(node.metadata.relation_depth)
        : typeof node.metadata?.depth === 'number'
          ? Number(node.metadata.depth)
          : undefined;

  if (typeof explicitDepth === 'number' && Number.isFinite(explicitDepth)) {
    return explicitDepth;
  }

  return typeof node.depthFromFocus === 'number' ? node.depthFromFocus : undefined;
}

function resolveForceRelationKey(node: GraphNode, focusId?: string): ForceRelationKey {
  if (node.id === focusId) {
    return 'root';
  }

  const explicitRole = typeof node.role === 'string' ? node.role.trim().toLowerCase() : '';
  if (explicitRole === 'root' || explicitRole === 'current') return 'root';
  if (explicitRole === 'depth1') return 'depth1';
  if (explicitRole === 'depth2') return 'depth2';
  if (explicitRole === 'depth3') return 'depth3';
  if (explicitRole === 'depth4') return 'depth4';
  if (explicitRole === 'depth5') return 'depth5';
  if (explicitRole === 'orphan') return 'orphan';

  return normalizeForceRelationDepth(resolveRelationDepth(node, focusId));
}

function shouldUseObsidianLocalColors(context: GraphAppearanceContext) {
  return context.mode === 'local' && context.layout === 'force';
}

function getForceRelationStyle(node: GraphNode, focusId: string | undefined, themeMode: ThemeMode) {
  const config = getObsidianThemePalette(themeMode);
  const relationKey = resolveForceRelationKey(node, focusId);
  return {
    key: relationKey,
    style: config.node[relationKey],
  };
}

function getNodeVisualWeight(node: GraphNode, focusId?: string) {
  return getVisualWeight(resolveRelationDepth(node, focusId), node.graphLevel);
}

function getEdgeNodeId(edgeSide: string | GraphNode) {
  return typeof edgeSide === 'string' ? edgeSide : edgeSide.id;
}

function getReverseEdgeKey(edge) {
  const sourceId = getEdgeNodeId(edge.source);
  const targetId = getEdgeNodeId(edge.target);
  return `${targetId}::${sourceId}`;
}

function isFocusEdge(edge, focusId?: string) {
  if (!focusId) {
    return false;
  }

  return getEdgeNodeId(edge.source) === focusId || getEdgeNodeId(edge.target) === focusId;
}

function getDimmedOpacity(baseOpacity: number, isDimmed: boolean) {
  return isDimmed ? Math.max(0.12, baseOpacity * 0.22) : baseOpacity;
}

function getObsidianNodeStyle(node: GraphNode, appearance: GraphAppearanceSettings, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  const themeMode = getThemeMode(context.isDarkTheme);
  const visualWeight = getNodeVisualWeight(node, focusId);
  const { key, style } = getForceRelationStyle(node, focusId, themeMode);
  const isSelected = isSelectedNode(node, focusId);
  const isHovered = hoverState.hoveredNodeId === node.id;
  const isDimmed = Boolean(hoverState.hoveredNodeId) && !isSelected && !isHovered && !hoverState.connectedNodeIds.has(node.id);
  const radiusOffset = (appearance.nodeRadius ?? DEFAULT_APPEARANCE_SETTINGS.nodeRadius ?? 6) - 6;
  const baseRadius = 4.5 + (visualWeight * 7) + radiusOffset;
  const radius = isSelected ? baseRadius + 3 : isHovered ? baseRadius + 1.5 : baseRadius;
  const opacity = getDimmedOpacity(0.5 + (visualWeight * 0.5), isDimmed);
  const strong = isSelected || isHovered;
  const strokeRule = deriveStroke(style, themeMode, strong);
  const haloRule = deriveHalo(style, themeMode);
  const strokeWidth = isSelected ? 3 : isHovered ? 2 : 1 + (visualWeight * 0.6);

  return {
    role: key,
    fill: formatThemeHueOffsetColor(style.h, style.s, style.l, (style.a ?? 1) * opacity),
    stroke: formatThemeHueOffsetColor(strokeRule.h, strokeRule.s, strokeRule.l, strokeRule.a ?? 1),
    strokeWidth,
    opacity: 1,
    radius,
    filter: isSelected || isHovered
      ? `drop-shadow(0 0 ${isSelected ? 10 : 6}px ${formatThemeHueOffsetColor(haloRule.h, haloRule.s, haloRule.l, haloRule.a ?? 1)})`
      : null,
    isRootLike: isSelected || key === 'root',
  };
}

function getObsidianLabelStyle(node: GraphNode, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  const themeMode = getThemeMode(context.isDarkTheme);
  const palette = getObsidianThemePalette(themeMode).label;
  const relationDepth = resolveRelationDepth(node, focusId);
  const visualWeight = getVisualWeight(relationDepth, node.graphLevel);
  const isSelected = isSelectedNode(node, focusId);
  const isHovered = hoverState.hoveredNodeId === node.id;
  const isConnected = hoverState.connectedNodeIds.has(node.id);
  const isStrong = isSelected || relationDepth === 0 || isHovered;
  const isDimmed = Boolean(hoverState.hoveredNodeId) && !isSelected && !isHovered && !isConnected;
  const opacity = getDimmedOpacity(0.35 + (visualWeight * 0.65), isDimmed);

  return {
    text: formatThemeHueOffsetColor((isStrong ? palette.text : palette.textMuted).h, (isStrong ? palette.text : palette.textMuted).s, (isStrong ? palette.text : palette.textMuted).l, (isStrong ? palette.text : palette.textMuted).a ?? 1),
    background: formatThemeHueOffsetColor((isStrong ? palette.bgActive : palette.bg).h, (isStrong ? palette.bgActive : palette.bg).s, (isStrong ? palette.bgActive : palette.bg).l, (isStrong ? palette.bgActive : palette.bg).a ?? 1),
    border: formatThemeHueOffsetColor(palette.border.h, palette.border.s, palette.border.l, palette.border.a ?? 1),
    opacity,
    fontWeight: isStrong ? '700' : visualWeight > 0.76 ? '650' : '550',
  };
}

function getObsidianEdgeStyle(edge, linkId: string, hoverState: GraphHoverState, focusId: string | undefined, context: GraphAppearanceContext) {
  const themeMode = getThemeMode(context.isDarkTheme);
  const palette = getObsidianThemePalette(themeMode).edge;
  const sourceNode = typeof edge.source === 'string' ? undefined : edge.source;
  const targetNode = typeof edge.target === 'string' ? undefined : edge.target;
  const sourceDepth = sourceNode ? resolveRelationDepth(sourceNode, focusId) : undefined;
  const targetDepth = targetNode ? resolveRelationDepth(targetNode, focusId) : undefined;
  const isHovered = hoverState.connectedLinkIds.has(linkId);
  const isActive = isHovered || isFocusEdge(edge, focusId);
  const isWeak = !isActive && typeof sourceDepth === 'number' && typeof targetDepth === 'number' && sourceDepth >= 4 && targetDepth >= 4;
  const rule = isActive ? palette.active : isWeak ? palette.weak : palette.normal;

  return {
    stroke: formatThemeHueOffsetColor(rule.h, rule.s, rule.l, rule.a ?? 1),
    strokeWidth: isActive ? 1.8 : 1.05,
  };
}

function ensureSingleArrowMarker(defs, markerId: string) {
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
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#111111')
    .style('fill', '#111111')
    .attr('stroke', '#111111')
    .style('stroke', '#111111')
    .attr('stroke-width', 0)
    .attr('fill-opacity', 1)
    .attr('stroke-opacity', 1);
}

export function ensureArrowMarker(canvas, markerId: string) {
  const defs = canvas.select('defs').empty() ? canvas.append('defs') : canvas.select('defs');
  ensureSingleArrowMarker(defs, markerId);
}

function updateArrowMarkerColor(scene, markerId: string, color: string) {
  const defs = scene.linkLayer?.select(function () {
    return this instanceof SVGGElement ? this.ownerSVGElement?.querySelector('defs') ?? null : null;
  });
  if (!defs || defs.empty()) {
    return;
  }

  defs.select(`#${markerId}`)
    .select('path')
    .attr('fill', color)
    .style('fill', color)
    .attr('stroke', color)
    .style('stroke', color);
}

export function edgeKey(edge) {
  const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
  const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
  return `${sourceId}::${targetId}::${edge.targetHeading ?? ''}::${edge.relation ?? ''}`;
}

function edgeNodePairKey(edge) {
  return `${getEdgeNodeId(edge.source)}::${getEdgeNodeId(edge.target)}`;
}

function hasReverseEdge(edge, edgeKeys: Set<string>) {
  return edgeKeys.has(getReverseEdgeKey(edge));
}

function getRenderedNodeRadius(node: GraphNode, appearance: GraphAppearanceSettings, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  return getNodeRadius(node, appearance, focusId, hoverState, context);
}

export function resolveLinkEndpoints(edge, appearance: GraphAppearanceSettings, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext, options: { hasStartArrow: boolean; hasEndArrow: boolean }) {
  const source = typeof edge.source === 'string' ? undefined : edge.source;
  const target = typeof edge.target === 'string' ? undefined : edge.target;
  const sourceX = source?.x ?? 0;
  const sourceY = source?.y ?? 0;
  const targetX = target?.x ?? 0;
  const targetY = target?.y ?? 0;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy);

  if (!source || !target || distance < 0.0001) {
    return {
      x1: sourceX,
      y1: sourceY,
      x2: targetX,
      y2: targetY,
    };
  }

  const unitX = dx / distance;
  const unitY = dy / distance;
  const sourceRadius = getRenderedNodeRadius(source, appearance, focusId, hoverState, context);
  const targetRadius = getRenderedNodeRadius(target, appearance, focusId, hoverState, context);
  const startInset = sourceRadius + (options.hasStartArrow ? 10 : 2);
  const endInset = targetRadius + (options.hasEndArrow ? 10 : 2);
  const clampedStart = Math.min(startInset, Math.max(0, distance / 2 - 1));
  const clampedEnd = Math.min(endInset, Math.max(0, distance / 2 - 1));

  return {
    x1: sourceX + unitX * clampedStart,
    y1: sourceY + unitY * clampedStart,
    x2: targetX - unitX * clampedEnd,
    y2: targetY - unitY * clampedEnd,
  };
}

function isSelectedNode(node: GraphNode, focusId?: string) {
  return node.id === focusId;
}

function isMissingNode(node: GraphNode) {
  return node.exists === false || node.kind === 'missing_note';
}

function getBaseNodeRadius(node: GraphNode, appearance: GraphAppearanceSettings, focusId?: string, context?: GraphAppearanceContext) {
  if (context && shouldUseObsidianLocalColors(context)) {
    return getObsidianNodeStyle(node, appearance, focusId, createEmptyHoverState(), context).radius;
  }

  if (isSelectedNode(node, focusId)) {
    return appearance.focusNodeRadius ?? Math.max((appearance.nodeRadius ?? 6) + 3, 9);
  }

  return appearance.nodeRadius ?? 6;
}

function getNodeRadius(node: GraphNode, appearance: GraphAppearanceSettings, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  if (shouldUseObsidianLocalColors(context)) {
    return getObsidianNodeStyle(node, appearance, focusId, hoverState, context).radius;
  }

  const baseRadius = getBaseNodeRadius(node, appearance, focusId, context);
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

function getNodeOpacity(node: GraphNode, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  if (shouldUseObsidianLocalColors(context)) {
    return getObsidianNodeStyle(node, DEFAULT_APPEARANCE_SETTINGS, focusId, hoverState, context).opacity;
  }

  if (!hoverState.hoveredNodeId) {
    return 1;
  }

  if (node.id === hoverState.hoveredNodeId || hoverState.connectedNodeIds.has(node.id) || isSelectedNode(node, focusId)) {
    return 1;
  }

  return 0.18;
}

function getNodeFill(node: GraphNode, settings: GraphSettings, _locale: string, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  if (shouldUseObsidianLocalColors(context)) {
    return getObsidianNodeStyle(node, settings.appearance, focusId, hoverState, context).fill;
  }

  if (isSelectedNode(node, focusId)) {
    return 'var(--graph-node-selected)';
  }

  if (hoverState.hoveredNodeId === node.id) {
    return 'var(--graph-node-hover)';
  }

  if (isMissingNode(node)) {
    return 'var(--graph-node-missing)';
  }

  return 'var(--graph-node-default)';
}

function getNodeStroke(node: GraphNode, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  if (shouldUseObsidianLocalColors(context)) {
    return getObsidianNodeStyle(node, DEFAULT_APPEARANCE_SETTINGS, focusId, hoverState, context).stroke;
  }

  if (isSelectedNode(node, focusId) || hoverState.hoveredNodeId === node.id) {
    return 'var(--graph-accent)';
  }

  if (hoverState.connectedNodeIds.has(node.id)) {
    return 'var(--graph-node-stroke)';
  }

  if (isMissingNode(node)) {
    return 'var(--graph-node-missing-stroke)';
  }

  return 'transparent';
}

function getNodeStrokeWidth(node: GraphNode, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  if (shouldUseObsidianLocalColors(context)) {
    return getObsidianNodeStyle(node, DEFAULT_APPEARANCE_SETTINGS, focusId, hoverState, context).strokeWidth;
  }

  if (isSelectedNode(node, focusId) || hoverState.hoveredNodeId === node.id) {
    return 2.4;
  }

  if (hoverState.connectedNodeIds.has(node.id)) {
    return 1.35;
  }

  return 0;
}

function getLinkOpacity(linkId: string, hoverState: GraphHoverState, context: GraphAppearanceContext, appearance: GraphAppearanceSettings) {
  const opacityScale = appearance.linkOpacity ?? DEFAULT_APPEARANCE_SETTINGS.linkOpacity ?? 1;

  if (shouldUseObsidianLocalColors(context)) {
    if (!hoverState.hoveredNodeId) {
      return opacityScale;
    }

    return hoverState.connectedLinkIds.has(linkId)
      ? opacityScale
      : Math.max(0.08, opacityScale * 0.28);
  }

  if (!hoverState.hoveredNodeId) {
    return 0.45 * opacityScale;
  }

  return hoverState.connectedLinkIds.has(linkId)
    ? Math.min(1, Math.max(0.45 * opacityScale, 0.9))
    : Math.min(0.45 * opacityScale, 0.08);
}

function getLabelOpacity(node: GraphNode, appearance: GraphAppearanceSettings, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  const baseOpacity = appearance.textOpacity ?? DEFAULT_APPEARANCE_SETTINGS.textOpacity ?? 0.8;
  if (shouldUseObsidianLocalColors(context)) {
    return getObsidianLabelStyle(node, focusId, hoverState, context).opacity * baseOpacity;
  }

  if (!hoverState.hoveredNodeId) {
    return baseOpacity;
  }

  if (node.id === hoverState.hoveredNodeId || hoverState.connectedNodeIds.has(node.id) || isSelectedNode(node, focusId)) {
    return 1;
  }

  return Math.min(baseOpacity, 0.18);
}

function getLabelFontWeight(_node: GraphNode, context: GraphAppearanceContext) {
  if (shouldUseObsidianLocalColors(context)) {
    return '550';
  }

  return '500';
}

function getNodeFilter(node: GraphNode, focusId: string | undefined, hoverState: GraphHoverState, context: GraphAppearanceContext) {
  if (!shouldUseObsidianLocalColors(context)) {
    return null;
  }

  return getObsidianNodeStyle(node, DEFAULT_APPEARANCE_SETTINGS, focusId, hoverState, context).filter;
}

export function createEmptyHoverState(): GraphHoverState {
  return {
    hoveredNodeId: undefined,
    connectedNodeIds: new Set<string>(),
    connectedLinkIds: new Set<string>(),
  };
}

function updateLabelBackgrounds(scene) {
  if (!scene?.labelGroup) {
    return;
  }

  scene.labelGroup.each(function () {
    const group = this as SVGGElement;
    const text = group.querySelector('text');
    const rect = group.querySelector('rect');
    if (!(text instanceof SVGTextElement) || !(rect instanceof SVGRectElement)) {
      return;
    }

    try {
      const box = text.getBBox();
      const padX = 6;
      const padY = 3;
      rect.setAttribute('x', String(box.x - padX));
      rect.setAttribute('y', String(box.y - padY));
      rect.setAttribute('width', String(box.width + (padX * 2)));
      rect.setAttribute('height', String(box.height + (padY * 2)));
      rect.setAttribute('rx', '6');
      rect.setAttribute('ry', '6');
    } catch {
      // Skip labels that are not measurable yet.
    }
  });
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

  scene.labelGroup = scene.labelLayer
    .selectAll('g')
    .data(data.nodes, (item) => item.id)
    .join((enter) => {
      const group = enter.append('g').attr('class', 'graph-label-group graph-label');
      group.append('rect').attr('class', 'graph-node-label-bg graph-label-bg');
      group.append('text').attr('class', 'graph-node-label graph-label');
      return group;
    })
    .style('pointer-events', 'none');

  scene.label = scene.labelGroup
    .select('text')
    .text((item) => labelForNode(item, locale))
    .attr('dx', 10)
    .attr('dy', 4);

  scene.labelBg = scene.labelGroup.select('rect');

  return scene;
}

export function renderGraphScene(canvas, data, locale: string, focusId?: string, markerId = 'graph-arrowhead') {
  ensureArrowMarker(canvas, markerId);

  const scene = {
    linkLayer: canvas.append('g').attr('class', 'graph-links'),
    labelLayer: canvas.append('g').attr('class', 'graph-labels'),
    nodeLayer: canvas.append('g').attr('class', 'graph-nodes'),
    link: null,
    node: null,
    labelGroup: null,
    labelBg: null,
    label: null,
    markerId,
    focusId,
    locale,
  };

  syncGraphScene(scene, data, locale, focusId);
  return scene;
}

export function applyGraphAppearance(scene, _data: GraphData, settings: GraphSettings, hoverState: GraphHoverState, _locale: string, focusId?: string) {
  const appearance = { ...DEFAULT_APPEARANCE_SETTINGS, ...settings.appearance };
  const context: GraphAppearanceContext = {
    layout: scene.layout ?? 'force',
    mode: scene.mode ?? 'global',
    isDarkTheme: isDarkThemeActive(),
  };
  const edgeNodePairs = new Set(scene.link.data().map((edge) => edgeNodePairKey(edge)));

  updateArrowMarkerColor(scene, scene.markerId, getGraphArrowColor(getThemeMode(context.isDarkTheme)));

  scene.link
    .classed('is-missing', (edge) => edge.exists === false)
    .classed('is-connected', (edge) => hoverState.connectedLinkIds.has(edgeKey(edge)))
    .classed('is-dimmed', (edge) => Boolean(hoverState.hoveredNodeId) && !hoverState.connectedLinkIds.has(edgeKey(edge)))
    .style('stroke', (edge) => shouldUseObsidianLocalColors(context)
      ? getObsidianEdgeStyle(edge, edgeKey(edge), hoverState, focusId, context).stroke
      : (hoverState.connectedLinkIds.has(edgeKey(edge)) ? 'var(--graph-link-highlight)' : 'var(--graph-link-default)'))
    .style('color', (edge) => shouldUseObsidianLocalColors(context)
      ? getObsidianEdgeStyle(edge, edgeKey(edge), hoverState, focusId, context).stroke
      : (hoverState.connectedLinkIds.has(edgeKey(edge)) ? 'var(--graph-link-highlight)' : 'var(--graph-link-default)'))
    .attr('stroke-opacity', (edge) => getLinkOpacity(edgeKey(edge), hoverState, context, appearance))
    .attr('stroke-width', (edge) => shouldUseObsidianLocalColors(context)
      ? getObsidianEdgeStyle(edge, edgeKey(edge), hoverState, focusId, context).strokeWidth * ((appearance.linkWidth ?? 1.5) / 1.5)
      : (hoverState.connectedLinkIds.has(edgeKey(edge)) || isFocusEdge(edge, focusId)) ? (appearance.linkWidth ?? 1.5) * 1.4 : appearance.linkWidth ?? 1.5)
    .attr('marker-start', (edge) => appearance.showArrows && hasReverseEdge(edge, edgeNodePairs) ? `url(#${scene.markerId})` : null)
    .attr('marker-end', (edge) => appearance.showArrows ? `url(#${scene.markerId})` : null);

  scene.node
    .classed('is-missing', (node) => isMissingNode(node))
    .classed('is-selected', (node) => isSelectedNode(node, focusId))
    .classed('is-hovered', (node) => hoverState.hoveredNodeId === node.id)
    .classed('is-connected', (node) => hoverState.connectedNodeIds.has(node.id))
    .classed('is-dimmed', (node) => Boolean(hoverState.hoveredNodeId) && node.id !== hoverState.hoveredNodeId && !hoverState.connectedNodeIds.has(node.id) && !isSelectedNode(node, focusId))
    .style('fill', (node) => getNodeFill(node, settings, _locale, focusId, hoverState, context))
    .style('stroke', (node) => getNodeStroke(node, focusId, hoverState, context))
    .style('filter', (node) => getNodeFilter(node, focusId, hoverState, context))
    .attr('stroke-width', (node) => getNodeStrokeWidth(node, focusId, hoverState, context))
    .attr('opacity', (node) => getNodeOpacity(node, focusId, hoverState, context))
    .attr('r', (node) => getNodeRadius(node, appearance, focusId, hoverState, context));

  scene.label
    .classed('is-selected', (node) => isSelectedNode(node, focusId))
    .classed('is-hovered', (node) => hoverState.hoveredNodeId === node.id)
    .classed('is-connected', (node) => hoverState.connectedNodeIds.has(node.id))
    .classed('is-dimmed', (node) => Boolean(hoverState.hoveredNodeId) && node.id !== hoverState.hoveredNodeId && !hoverState.connectedNodeIds.has(node.id) && !isSelectedNode(node, focusId))
    .attr('opacity', (node) => getLabelOpacity(node, appearance, focusId, hoverState, context))
    .style('font-weight', (node) => shouldUseObsidianLocalColors(context) ? getObsidianLabelStyle(node, focusId, hoverState, context).fontWeight : getLabelFontWeight(node, context))
    .style('font-size', `${appearance.labelSize ?? 12}px`)
    .style('fill', (node) => shouldUseObsidianLocalColors(context) ? getObsidianLabelStyle(node, focusId, hoverState, context).text : 'var(--fg-color)');

  scene.labelBg
    .attr('opacity', (node) => getLabelOpacity(node, appearance, focusId, hoverState, context))
    .style('fill', (node) => shouldUseObsidianLocalColors(context) ? getObsidianLabelStyle(node, focusId, hoverState, context).background : 'transparent')
    .style('stroke', (node) => shouldUseObsidianLocalColors(context) ? getObsidianLabelStyle(node, focusId, hoverState, context).border : 'none')
    .attr('stroke-width', shouldUseObsidianLocalColors(context) ? 0.8 : 0);

  updateLabelBackgrounds(scene);
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
  onNodeContextMenu?: (event: MouseEvent, item: GraphNode) => void;
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

  nodeSelection.on('contextmenu', (event, item) => {
    if (event.defaultPrevented || (item as any).__dragMoved) {
      (item as any).__dragMoved = false;
      return;
    }

    options.onNodeContextMenu?.(event, item);
  });
}
