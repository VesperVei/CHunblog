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
) {
  if (layout === 'brain') {
    return createBrainSimulation(nodes as BrainGraphNode[], links, width, height, settings);
  }

  return createForceSimulation(nodes, links, layout, width, height, settings);
}

export function updateSimulationForLayout(
  simulation,
  layout: GraphLayoutMode,
  nodes: GraphNode[],
  width: number,
  height: number,
  settings: GraphSettings,
) {
  if (layout === 'brain') {
    updateBrainSimulation(simulation, nodes as BrainGraphNode[], width, height, settings);
    return;
  }

  updateForceSimulation(simulation, width, height, settings);
}
