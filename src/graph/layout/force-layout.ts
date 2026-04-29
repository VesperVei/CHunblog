import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { DEFAULT_FORCE_SETTINGS, getEffectiveCollisionRadius } from '../constants';
import type { GraphEdge, GraphLayoutMode, GraphNode, GraphSettings } from '../types';

export function createForceSimulation(
  nodes: GraphNode[],
  links: GraphEdge[],
  layout: GraphLayoutMode,
  width: number,
  height: number,
  settings: GraphSettings,
) {
  const defaults = DEFAULT_FORCE_SETTINGS[layout] ?? DEFAULT_FORCE_SETTINGS.force;
  const forces = { ...defaults, ...settings.forces };
  const collisionRadius = getEffectiveCollisionRadius(settings);

  return d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(forces.linkDistance ?? 110).strength(forces.linkStrength ?? 0.28))
    .force('charge', d3.forceManyBody().strength(-(forces.repelStrength ?? 220)))
    .force('center-x', d3.forceX(width / 2).strength(forces.centerStrength ?? 0.16))
    .force('center-y', d3.forceY(height / 2).strength(forces.centerStrength ?? 0.16))
    .force('collision', d3.forceCollide().radius(collisionRadius).strength(forces.collisionStrength ?? 0.7));
}

export function updateForceSimulation(simulation, width: number, height: number, settings: GraphSettings) {
  const forces = settings.forces;
  const collisionRadius = getEffectiveCollisionRadius(settings);

  simulation.force('link')?.distance(forces.linkDistance ?? 120).strength(forces.linkStrength ?? 0.7);
  simulation.force('charge')?.strength(-(forces.repelStrength ?? 120));
  simulation.force('center-x')?.strength(forces.centerStrength ?? 0.08).x(width / 2);
  simulation.force('center-y')?.strength(forces.centerStrength ?? 0.08).y(height / 2);
  simulation.force('collision')?.radius(collisionRadius).strength(forces.collisionStrength ?? 0.7);
}
