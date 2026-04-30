import { createBrainSimulation, updateBrainSimulation } from './brain-layout';
import { createForceSimulation, updateForceSimulation } from './force-layout';
import { createRadialSimulation, updateRadialSimulation } from './radial-layout';
import { createTreeSimulation, updateTreeSimulation } from './tree-layout';
import type { BrainGraphNode, GraphEdge, GraphLayoutMode, GraphNode, GraphSettings } from '../types';

export function createSimulationForLayout(
  layout: GraphLayoutMode,
  nodes: GraphNode[],
  links: GraphEdge[],
  width: number,
  height: number,
  settings: GraphSettings,
  focusId?: string,
  locale = 'en',
) {
  if (layout === 'brain') {
    return createBrainSimulation(nodes as BrainGraphNode[], links, width, height, settings);
  }

  if (layout === 'radial') {
    return createRadialSimulation(nodes, links, width, height, settings, focusId, locale);
  }

  if (layout === 'tree') {
    return createTreeSimulation(nodes, links, width, height, settings, focusId, locale);
  }

  return createForceSimulation(nodes, links, layout, width, height, settings, focusId);
}

export function updateSimulationForLayout(
  simulation,
  layout: GraphLayoutMode,
  nodes: GraphNode[],
  width: number,
  height: number,
  settings: GraphSettings,
  focusId?: string,
  locale = 'en',
) {
  if (layout === 'brain') {
    return updateBrainSimulation(simulation, nodes as BrainGraphNode[], width, height, settings);
  }

  if (layout === 'radial') {
    return updateRadialSimulation(simulation, nodes, width, height, settings, focusId, locale);
  }

  if (layout === 'tree') {
    return updateTreeSimulation(simulation, nodes, width, height, settings, focusId, locale);
  }

  return updateForceSimulation(simulation, width, height, settings, focusId);
}
