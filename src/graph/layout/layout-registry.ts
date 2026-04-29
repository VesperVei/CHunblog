import { createBrainSimulation, updateBrainSimulation } from './brain-layout';
import { createForceSimulation, updateForceSimulation } from './force-layout';
import type { BrainGraphNode, GraphEdge, GraphLayoutMode, GraphNode, GraphSettings } from '../types';

export function createSimulationForLayout(
  layout: GraphLayoutMode,
  nodes: GraphNode[],
  links: GraphEdge[],
  width: number,
  height: number,
  settings: GraphSettings,
  focusId?: string,
) {
  if (layout === 'brain') {
    return createBrainSimulation(nodes as BrainGraphNode[], links, width, height, settings);
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
) {
  if (layout === 'brain') {
    return updateBrainSimulation(simulation, nodes as BrainGraphNode[], width, height, settings);
  }

  return updateForceSimulation(simulation, width, height, settings, focusId);
}
