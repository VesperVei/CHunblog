import { getEffectiveLayoutPreset } from '../constants';
import { buildBrainRenderableGraph } from '../data/brain-graph';
import { createGraphIndexes } from '../data/graph-build';
import { buildRenderableGraph } from '../data/graph-filter';
import { attachNodeDrag } from '../interaction/node-drag';
import { createSvgCanvas, attachZoomPan } from '../interaction/zoom-pan';
import { createSimulationForLayout, updateSimulationForLayout } from '../layout/layout-registry';
import { createLocalGraphSharedState, writeLastNavigationLocalGraphState } from './local-graph-state';
import { applyGraphAppearance, bindNodeNavigation, createEmptyHoverState, edgeKey, renderGraphScene, resolveLinkEndpoints, syncGraphScene } from '../render/svg-renderer';
import type { GraphData, GraphHoverState, GraphSettings, GraphViewOptions } from '../types';

function cloneRenderableGraph(data: GraphData) {
  return {
    nodes: data.nodes.map((node) => ({ ...node })),
    links: data.links.map((link) => ({
      ...link,
      source: typeof link.source === 'string' ? link.source : link.source.id,
      target: typeof link.target === 'string' ? link.target : link.target.id,
    })),
  };
}

function withDegrees(data: GraphData) {
  const indexes = createGraphIndexes(data);
  const degreeMap = new Map<string, number>();

  for (const node of data.nodes) {
    const out = indexes.outgoing.get(node.id)?.length ?? 0;
    const incoming = indexes.incoming.get(node.id)?.length ?? 0;
    degreeMap.set(node.id, out + incoming);
  }

  return {
    nodes: data.nodes.map((node) => ({ ...node, degree: degreeMap.get(node.id) ?? 0 })),
    links: data.links,
  };
}

function withDepthFromFocus(data: GraphData, focusId?: string) {
  if (!focusId) {
    return {
      nodes: data.nodes.map((node) => ({ ...node, depthFromFocus: 1 })),
      links: data.links,
    };
  }

  const adjacency = new Map<string, Set<string>>();
  for (const link of data.links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    adjacency.set(sourceId, new Set([...(adjacency.get(sourceId) ?? []), targetId]));
    adjacency.set(targetId, new Set([...(adjacency.get(targetId) ?? []), sourceId]));
  }

  const depthMap = new Map<string, number>([[focusId, 0]]);
  const parentMap = new Map<string, string | undefined>([[focusId, undefined]]);
  const queue = [focusId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthMap.get(current) ?? 0;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (depthMap.has(neighbor)) continue;
      depthMap.set(neighbor, currentDepth + 1);
      parentMap.set(neighbor, current);
      queue.push(neighbor);
    }
  }

  const childrenByParent = new Map<string, string[]>();
  for (const [nodeId, parentId] of parentMap.entries()) {
    if (!parentId) continue;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), nodeId]);
  }

  const siblingMeta = new Map<string, { siblingIndex: number; siblingCount: number }>();
  for (const childIds of childrenByParent.values()) {
    const sortedChildIds = [...childIds].sort((left, right) => left.localeCompare(right));
    sortedChildIds.forEach((childId, index) => {
      siblingMeta.set(childId, {
        siblingIndex: index,
        siblingCount: sortedChildIds.length,
      });
    });
  }

  return {
    nodes: data.nodes.map((node) => ({
      ...node,
      depthFromFocus: depthMap.get(node.id) ?? 1,
      primaryParentId: parentMap.get(node.id),
      siblingIndex: siblingMeta.get(node.id)?.siblingIndex,
      siblingCount: siblingMeta.get(node.id)?.siblingCount,
    })),
    links: data.links,
  };
}

function buildGraphData(fullData: GraphData, options: GraphViewOptions) {
  const preset = getEffectiveLayoutPreset(options.mode, options.settings);
  if (preset === 'brain') {
    return buildBrainRenderableGraph(fullData, options.focusId, options.settings.filters, options.locale);
  }

  return buildRenderableGraph(fullData, {
    mode: options.mode,
    focusId: options.focusId,
    locale: options.locale,
    filters: options.settings.filters,
  });
}

function filtersEqualExceptDepth(left, right) {
  const { depth: _leftDepth, ...leftRest } = left ?? {};
  const { depth: _rightDepth, ...rightRest } = right ?? {};
  return JSON.stringify(leftRest) === JSON.stringify(rightRest);
}

function seedIncrementalNodePositions(previousData: GraphData | null, nextData: GraphData, focusId: string | undefined, width: number, height: number) {
  const previousNodes = new Map((previousData?.nodes ?? []).map((node) => [node.id, node]));

  for (const node of nextData.nodes) {
    const previousNode = previousNodes.get(node.id);
    if (!previousNode) {
      continue;
    }

    node.x = previousNode.x;
    node.y = previousNode.y;
    node.vx = previousNode.vx;
    node.vy = previousNode.vy;
    node.fx = previousNode.fx;
    node.fy = previousNode.fy;
  }

  const nextNodeById = new Map(nextData.nodes.map((node) => [node.id, node]));
  const focusNode = focusId ? nextNodeById.get(focusId) : undefined;
  const centerX = focusNode?.x ?? width / 2;
  const centerY = focusNode?.y ?? height / 2;
  const adjacency = new Map<string, string[]>();

  for (const link of nextData.links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    adjacency.set(sourceId, [...(adjacency.get(sourceId) ?? []), targetId]);
    adjacency.set(targetId, [...(adjacency.get(targetId) ?? []), sourceId]);
  }

  for (const node of nextData.nodes) {
    if (typeof node.x === 'number' && typeof node.y === 'number') {
      continue;
    }

    const positionedNeighbors = (adjacency.get(node.id) ?? [])
      .map((neighborId) => nextNodeById.get(neighborId))
      .filter((neighbor) => neighbor && typeof neighbor.x === 'number' && typeof neighbor.y === 'number');

    if (positionedNeighbors.length > 0) {
      const averageX = positionedNeighbors.reduce((sum, neighbor) => sum + (neighbor?.x ?? 0), 0) / positionedNeighbors.length;
      const averageY = positionedNeighbors.reduce((sum, neighbor) => sum + (neighbor?.y ?? 0), 0) / positionedNeighbors.length;
      node.x = averageX + (Math.random() - 0.5) * 18;
      node.y = averageY + (Math.random() - 0.5) * 18;
      continue;
    }

    node.x = centerX + (Math.random() - 0.5) * 24;
    node.y = centerY + (Math.random() - 0.5) * 24;
  }
}

function createHoverStateForNode(data: GraphData, hoveredNodeId?: string): GraphHoverState {
  if (!hoveredNodeId) {
    return createEmptyHoverState();
  }

  const connectedNodeIds = new Set<string>();
  const connectedLinkIds = new Set<string>();

  for (const link of data.links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;

    if (sourceId !== hoveredNodeId && targetId !== hoveredNodeId) {
      continue;
    }

    connectedLinkIds.add(edgeKey(link));
    if (sourceId !== hoveredNodeId) connectedNodeIds.add(sourceId);
    if (targetId !== hoveredNodeId) connectedNodeIds.add(targetId);
  }

  return {
    hoveredNodeId,
    connectedNodeIds,
    connectedLinkIds,
  };
}

function resolveGraphBounds(nodes, padding = 24) {
  const positioned = nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
  if (!positioned.length) {
    return undefined;
  }

  const xs = positioned.map((node) => node.x ?? 0);
  const ys = positioned.map((node) => node.y ?? 0);
  return {
    minX: Math.min(...xs) - padding,
    maxX: Math.max(...xs) + padding,
    minY: Math.min(...ys) - padding,
    maxY: Math.max(...ys) + padding,
  };
}

function resolveNodeNeighborhoodBounds(data: GraphData, nodeId: string, padding = 48) {
  const included = new Set<string>([nodeId]);
  for (const link of data.links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    if (sourceId === nodeId) included.add(targetId);
    if (targetId === nodeId) included.add(sourceId);
  }

  return resolveGraphBounds(data.nodes.filter((node) => included.has(node.id)), padding);
}

function expandBounds(bounds, minWidth: number, minHeight: number) {
  if (!bounds) {
    return undefined;
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const extraWidth = Math.max(0, minWidth - width) / 2;
  const extraHeight = Math.max(0, minHeight - height) / 2;
  return {
    minX: bounds.minX - extraWidth,
    maxX: bounds.maxX + extraWidth,
    minY: bounds.minY - extraHeight,
    maxY: bounds.maxY + extraHeight,
  };
}

export async function createGraphView(root: HTMLElement, options: GraphViewOptions & { graphUrl: string }, fullData: GraphData) {
  const rect = root.getBoundingClientRect();
  const width = Math.max(rect.width, 320);
  const height = Math.max(rect.height, 288);
  const { svg, canvas } = createSvgCanvas(width, height);
  const zoomControls = attachZoomPan(svg, canvas, width, height);
  const markerId = `graph-arrowhead-${Math.random().toString(36).slice(2, 8)}`;

  let currentOptions = {
    ...options,
    settings: {
      ...options.settings,
      filters: { ...options.settings.filters },
      appearance: { ...options.settings.appearance },
      forces: { ...options.settings.forces },
      layout: { ...options.settings.layout },
    },
  };
  let currentFullData = fullData;
  let simulation = null;
  let scene = null;
  let currentData = null;
  let hoverState = createEmptyHoverState();
  let destroyed = false;
  let hasAutoFitted = false;
  let autoFitTimer = 0;

  const showEmptyState = (message: string) => {
    const empty = document.createElement('div');
    empty.className = 'graph-empty';
    empty.textContent = message;
    root.replaceChildren(empty);
  };

  const renderFrame = () => {
    if (!scene) {
      return;
    }

    const appearance = { ...currentOptions.settings.appearance };
    const context = {
      layout: scene.layout ?? 'force',
      mode: scene.mode ?? 'global',
      isDarkTheme: typeof document !== 'undefined'
        ? document.documentElement.getAttribute('data-theme') === 'dark'
          || (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
        : false,
    };
    const edgeNodePairs = new Set((currentData?.links ?? []).map((edge) => `${typeof edge.source === 'string' ? edge.source : edge.source.id}::${typeof edge.target === 'string' ? edge.target : edge.target.id}`));
    const hasStartArrow = (edge) => Boolean(
      currentOptions.settings.appearance.showArrows
      && edgeNodePairs.has(`${typeof edge.target === 'string' ? edge.target : edge.target.id}::${typeof edge.source === 'string' ? edge.source : edge.source.id}`),
    );
    const getEndpoints = (edge) => resolveLinkEndpoints(
      edge,
      appearance,
      currentOptions.focusId,
      hoverState,
      context,
      {
        hasStartArrow: hasStartArrow(edge),
        hasEndArrow: Boolean(currentOptions.settings.appearance.showArrows),
      },
    );

    scene.link
      .attr('x1', (edge) => getEndpoints(edge).x1)
      .attr('y1', (edge) => getEndpoints(edge).y1)
      .attr('x2', (edge) => getEndpoints(edge).x2)
      .attr('y2', (edge) => getEndpoints(edge).y2);

    scene.node.attr('cx', (node) => node.x ?? 0).attr('cy', (node) => node.y ?? 0);
    scene.labelGroup?.attr('transform', (node) => `translate(${node.x ?? 0}, ${node.y ?? 0})`);
  };

  const stopSimulation = () => {
    simulation?.stop?.();
    simulation = null;
  };

  const scheduleAutoFit = () => {
    if (currentOptions.mode !== 'global' || hasAutoFitted || !currentData?.nodes?.length) {
      return;
    }

    window.clearTimeout(autoFitTimer);
    autoFitTimer = window.setTimeout(() => {
      const bounds = expandBounds(resolveGraphBounds(currentData?.nodes ?? [], 36), width * 0.68, height * 0.68);
      if (bounds) {
        zoomControls.fitView(bounds, 84, { force: true, updateOverview: true, maxScale: 1.2 });
        hasAutoFitted = true;
      }
    }, 360);
  };

  const refreshSceneAppearance = () => {
    if (!scene || !currentData) {
      return;
    }

    scene.layout = getEffectiveLayoutPreset(currentOptions.mode, currentOptions.settings);
    scene.mode = currentOptions.mode;
    applyGraphAppearance(scene, currentData, currentOptions.settings, hoverState, currentOptions.locale, currentOptions.focusId);
  };

  const setHoverNode = (nodeId?: string) => {
    if (!currentData) {
      return;
    }

    hoverState = createHoverStateForNode(currentData, nodeId);
    refreshSceneAppearance();
  };

  const bindSceneInteractions = () => {
    if (!scene || !simulation) {
      return;
    }

    bindNodeNavigation(scene.node, currentOptions.locale, currentOptions.navigationSearch, currentOptions.mode === 'global'
      ? {
        onNodeClick: (node) => {
          root.dispatchEvent(new CustomEvent('graph:node-select', {
            detail: { node },
          }));
        },
        navigateOnClick: false,
        navigateOnDoubleClick: true,
        onNodeContextMenu: currentOptions.onNodeContextMenu,
      }
      : {
        beforeNavigate: () => {
          if (currentOptions.mode !== 'local' || !currentOptions.focusId) {
            return;
          }

          writeLastNavigationLocalGraphState(
            createLocalGraphSharedState(currentOptions.focusId, currentOptions.settings, currentOptions.activePresetId),
          );
        },
        navigateOnClick: true,
        onNodeContextMenu: currentOptions.onNodeContextMenu,
      });
    attachNodeDrag(scene.node, simulation, currentOptions.settings.forces.alphaTargetOnDrag ?? 0.25);
    scene.node
      .on('pointerenter.graph-hover', (event, node) => {
        if (event.buttons > 0) {
          return;
        }

        setHoverNode(node.id);
      })
      .on('pointerleave.graph-hover', () => {
        setHoverNode(undefined);
      });
  };

  const rebuildScene = (nextGraphData: GraphData) => {
    stopSimulation();

    currentData = withDegrees(withDepthFromFocus(cloneRenderableGraph(nextGraphData) as GraphData, currentOptions.focusId) as GraphData);
    hoverState = createEmptyHoverState();
    canvas.selectAll('*').remove();
    scene = renderGraphScene(canvas, currentData, currentOptions.locale, currentOptions.focusId, markerId);

    const preset = getEffectiveLayoutPreset(currentOptions.mode, currentOptions.settings);
    scene.layout = preset;
    scene.mode = currentOptions.mode;
    simulation = createSimulationForLayout(preset, currentData.nodes, currentData.links, width, height, currentOptions.settings, currentOptions.focusId, currentOptions.locale);
    bindSceneInteractions();
    refreshSceneAppearance();
    simulation.on('tick', renderFrame);
    renderFrame();
    simulation.alpha(1).restart();
    scheduleAutoFit();

    root.replaceChildren(svg.node());
  };

  const incrementallyUpdateDepth = (nextGraphData: GraphData) => {
    if (!scene || !simulation) {
      rebuildScene(nextGraphData);
      return;
    }

    const previousData = currentData;
    currentData = withDegrees(withDepthFromFocus(cloneRenderableGraph(nextGraphData) as GraphData, currentOptions.focusId) as GraphData);
    seedIncrementalNodePositions(previousData, currentData, currentOptions.focusId, width, height);
    hoverState = createHoverStateForNode(currentData, hoverState.hoveredNodeId);
    syncGraphScene(scene, currentData, currentOptions.locale, currentOptions.focusId);

    simulation.nodes(currentData.nodes);
    simulation.force('link')?.links?.(currentData.links);
    const physical = updateSimulationForLayout(
      simulation,
      getEffectiveLayoutPreset(currentOptions.mode, currentOptions.settings),
      currentData.nodes,
      width,
      height,
      currentOptions.settings,
      currentOptions.focusId,
      currentOptions.locale,
    );

    bindSceneInteractions();
    refreshSceneAppearance();
    renderFrame();
    simulation.alpha(Math.max(simulation.alpha(), Math.min(0.45, physical?.alphaOnSettingsChange ?? 0.4))).restart();
    scheduleAutoFit();
  };

  const setData = (nextGraphData: GraphData) => {
    if (!nextGraphData.nodes.length) {
      scene = null;
      currentData = null;
      hoverState = createEmptyHoverState();
      stopSimulation();
      showEmptyState(currentOptions.mode === 'local' ? 'No related graph data yet.' : 'No graph data available.');
      return;
    }

    rebuildScene(nextGraphData);
  };

  const updateAppearance = (nextAppearance) => {
    const shouldRefreshCollision = Object.prototype.hasOwnProperty.call(nextAppearance, 'nodeRadius')
      || Object.prototype.hasOwnProperty.call(nextAppearance, 'focusNodeRadius');

    currentOptions = {
      ...currentOptions,
      settings: {
        ...currentOptions.settings,
        appearance: { ...currentOptions.settings.appearance, ...nextAppearance },
      },
    };

    if (!scene || !simulation) {
      return;
    }

    refreshSceneAppearance();

    if (shouldRefreshCollision) {
      const physical = updateSimulationForLayout(simulation, getEffectiveLayoutPreset(currentOptions.mode, currentOptions.settings), currentData.nodes, width, height, currentOptions.settings, currentOptions.focusId, currentOptions.locale);
      simulation.alpha(Math.min(0.35, physical?.alphaOnSettingsChange ?? 0.35)).restart();
    }

    renderFrame();
  };

  const updateForces = (nextForces) => {
    currentOptions = {
      ...currentOptions,
      settings: {
        ...currentOptions.settings,
        forces: { ...currentOptions.settings.forces, ...nextForces },
      },
    };

    if (!simulation || !currentData) {
      return;
    }

    const physical = updateSimulationForLayout(simulation, getEffectiveLayoutPreset(currentOptions.mode, currentOptions.settings), currentData.nodes, width, height, currentOptions.settings, currentOptions.focusId, currentOptions.locale);
    bindSceneInteractions();
    const nextAlpha = physical?.alphaOnSettingsChange ?? currentOptions.settings.forces.alphaOnSettingsChange ?? 0.6;
    simulation.alpha(Math.max(simulation.alpha(), nextAlpha)).restart();
  };

  const updateFilters = (nextFilters) => {
    const previousFilters = currentOptions.settings.filters;
    currentOptions = {
      ...currentOptions,
      settings: {
        ...currentOptions.settings,
        filters: { ...currentOptions.settings.filters, ...nextFilters },
      },
    };

    const nextGraphData = buildGraphData(currentFullData, currentOptions);
    const layoutPreset = getEffectiveLayoutPreset(currentOptions.mode, currentOptions.settings);
    const isLocalDepthOnlyUpdate = currentOptions.mode === 'local'
      && layoutPreset !== 'brain'
      && filtersEqualExceptDepth(previousFilters, currentOptions.settings.filters);

    if (isLocalDepthOnlyUpdate) {
      incrementallyUpdateDepth(nextGraphData);
      return;
    }

    setData(nextGraphData);
  };

  const updateSettings = (nextSettings: GraphSettings) => {
    const previousPreset = getEffectiveLayoutPreset(currentOptions.mode, currentOptions.settings);
    const nextPreset = getEffectiveLayoutPreset(currentOptions.mode, nextSettings);
    const previousFilters = JSON.stringify(currentOptions.settings.filters);
    const nextFilters = JSON.stringify(nextSettings.filters);
    const previousAppearance = JSON.stringify(currentOptions.settings.appearance);
    const nextAppearance = JSON.stringify(nextSettings.appearance);
    const previousForces = JSON.stringify(currentOptions.settings.forces);
    const nextForces = JSON.stringify(nextSettings.forces);
    const previousLayout = JSON.stringify(currentOptions.settings.layout);
    const nextLayout = JSON.stringify(nextSettings.layout);

    currentOptions = {
      ...currentOptions,
      settings: {
        filters: { ...nextSettings.filters },
        appearance: { ...nextSettings.appearance },
        forces: { ...nextSettings.forces },
        layout: { ...nextSettings.layout },
      },
    };

    if (previousPreset !== nextPreset || previousFilters !== nextFilters) {
      setData(buildGraphData(currentFullData, currentOptions));
      return;
    }

    if (previousAppearance !== nextAppearance) {
      updateAppearance(nextSettings.appearance);
    }

    if (previousForces !== nextForces) {
      updateForces(nextSettings.forces);
    }

    if (previousLayout !== nextLayout && previousForces === nextForces) {
      updateForces(currentOptions.settings.forces);
    }
  };

  setData(buildGraphData(currentFullData, currentOptions));

  return {
    ...zoomControls,
    resetView() {
      const bounds = expandBounds(resolveGraphBounds(currentData?.nodes ?? [], 36), width * 0.68, height * 0.68);
      if (bounds) {
        zoomControls.fitView(bounds, 84, { force: true, updateOverview: true, maxScale: 1.2 });
        return;
      }

      zoomControls.resetView();
    },
    fitView(padding = 64) {
      const bounds = expandBounds(resolveGraphBounds(currentData?.nodes ?? [], 36), width * 0.68, height * 0.68);
      if (bounds) {
        zoomControls.fitView(bounds, padding, { force: true, updateOverview: true, maxScale: 1.2 });
      }
    },
    focusNode(nodeId: string, padding = 88) {
      if (!currentData) {
        return;
      }

      if (currentOptions.mode === 'local') {
        currentOptions = {
          ...currentOptions,
          focusId: nodeId,
        };
        hoverState = createHoverStateForNode(currentData, nodeId);
        refreshSceneAppearance();
      }

      const bounds = expandBounds(resolveNodeNeighborhoodBounds(currentData, nodeId, 96), width * 0.42, height * 0.42);
      if (bounds) {
        zoomControls.fitView(bounds, padding, { force: true, updateOverview: false, maxScale: 0.95 });
      }
    },
    getCurrentGraphData() {
      return currentData;
    },
    refreshAppearance() {
      refreshSceneAppearance();
      renderFrame();
    },
    updateSettings,
    updateForces,
    updateAppearance,
    updateFilters,
    setData,
    replaceFullData(nextFullData: GraphData) {
      currentFullData = nextFullData;
      setData(buildGraphData(currentFullData, currentOptions));
    },
    destroy() {
      if (destroyed) {
        return;
      }

      destroyed = true;
      window.clearTimeout(autoFitTimer);
      stopSimulation();
    },
  };
}
