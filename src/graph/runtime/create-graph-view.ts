import { getActiveLayoutPreset } from '../constants';
import { buildBrainRenderableGraph } from '../data/brain-graph';
import { createGraphIndexes } from '../data/graph-build';
import { buildRenderableGraph } from '../data/graph-filter';
import { attachNodeDrag } from '../interaction/node-drag';
import { createSvgCanvas, attachZoomPan } from '../interaction/zoom-pan';
import { createSimulationForLayout, updateSimulationForLayout } from '../layout/layout-registry';
import { applyGraphAppearance, bindNodeNavigation, renderGraphScene } from '../render/svg-renderer';
import type { GraphData, GraphSettings, GraphViewOptions } from '../types';

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

function buildGraphData(fullData: GraphData, options: GraphViewOptions) {
  const preset = getActiveLayoutPreset(options.settings);
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
  let simulation = null;
  let scene = null;
  let currentData = null;
  let destroyed = false;

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

    scene.link
      .attr('x1', (edge) => edge.source.x ?? 0)
      .attr('y1', (edge) => edge.source.y ?? 0)
      .attr('x2', (edge) => edge.target.x ?? 0)
      .attr('y2', (edge) => edge.target.y ?? 0);

    scene.node.attr('cx', (node) => node.x ?? 0).attr('cy', (node) => node.y ?? 0);
    scene.label.attr('x', (node) => node.x ?? 0).attr('y', (node) => node.y ?? 0);
  };

  const stopSimulation = () => {
    simulation?.stop?.();
    simulation = null;
  };

  const rebuildScene = (nextGraphData: GraphData) => {
    stopSimulation();

    currentData = withDegrees(cloneRenderableGraph(nextGraphData) as GraphData);
    canvas.selectAll('*').remove();
    scene = renderGraphScene(canvas, currentData, currentOptions.locale, currentOptions.focusId, markerId);
    applyGraphAppearance(scene, currentOptions.settings.appearance);
    bindNodeNavigation(scene.node, currentOptions.locale, currentOptions.navigationSearch);

    const preset = getActiveLayoutPreset(currentOptions.settings);
    simulation = createSimulationForLayout(preset, currentData.nodes, currentData.links, width, height, currentOptions.settings);
    attachNodeDrag(scene.node, simulation, currentOptions.settings.forces.alphaTargetOnDrag ?? 0.25);
    simulation.on('tick', renderFrame);
    renderFrame();
    simulation.alpha(1).restart();

    root.replaceChildren(svg.node());
  };

  const setData = (nextGraphData: GraphData) => {
    if (!nextGraphData.nodes.length) {
      scene = null;
      currentData = null;
      stopSimulation();
      showEmptyState(currentOptions.mode === 'local' ? 'No related graph data yet.' : 'No graph data available.');
      return;
    }

    rebuildScene(nextGraphData);
  };

  const updateAppearance = (nextAppearance) => {
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

    applyGraphAppearance(scene, currentOptions.settings.appearance);
    updateSimulationForLayout(simulation, getActiveLayoutPreset(currentOptions.settings), currentData.nodes, width, height, currentOptions.settings);
    renderFrame();
    simulation.alpha(0.35).restart();
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

    updateSimulationForLayout(simulation, getActiveLayoutPreset(currentOptions.settings), currentData.nodes, width, height, currentOptions.settings);
    attachNodeDrag(scene.node, simulation, currentOptions.settings.forces.alphaTargetOnDrag ?? 0.25);
    simulation.alpha(0.5).restart();
  };

  const updateFilters = (nextFilters) => {
    currentOptions = {
      ...currentOptions,
      settings: {
        ...currentOptions.settings,
        filters: { ...currentOptions.settings.filters, ...nextFilters },
      },
    };

    setData(buildGraphData(fullData, currentOptions));
  };

  const updateSettings = (nextSettings: GraphSettings) => {
    const previousPreset = getActiveLayoutPreset(currentOptions.settings);
    const nextPreset = getActiveLayoutPreset(nextSettings);
    const previousFilters = JSON.stringify(currentOptions.settings.filters);
    const nextFilters = JSON.stringify(nextSettings.filters);

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
      setData(buildGraphData(fullData, currentOptions));
      return;
    }

    updateAppearance(nextSettings.appearance);
    updateForces(nextSettings.forces);
  };

  setData(buildGraphData(fullData, currentOptions));

  return {
    ...zoomControls,
    updateSettings,
    updateForces,
    updateAppearance,
    updateFilters,
    setData,
    destroy() {
      if (destroyed) {
        return;
      }

      destroyed = true;
      stopSimulation();
    },
  };
}
