import * as d3 from 'd3';
import { DEFAULT_FORCE_SETTINGS, getEffectiveCollisionRadius } from '../constants';
import { toPhysicalForces } from './physical-forces';
import type { GraphEdge, GraphLayoutMode, GraphNode, GraphSettings } from '../types';

function depthWeight(depth?: number) {
  if (depth === 0) return 1.2;
  if (depth === 1) return 1.0;
  if (depth === 2) return 0.85;
  if (depth === 3) return 0.75;
  return 0.7;
}

function localGravityWeight(depth?: number) {
  if (depth === 0) return 1.0;
  if (depth === 1) return 0.35;
  if (depth === 2) return 0.12;
  if (depth === 3) return 0.04;
  return 0;
}

function getDepthAwareLinkDistance(sourceDepth: number | undefined, targetDepth: number | undefined, baseDistance: number) {
  const ds = sourceDepth ?? 1;
  const dt = targetDepth ?? 1;
  const minDepth = Math.min(ds, dt);
  const maxDepth = Math.max(ds, dt);

  if (minDepth === 0 && maxDepth === 1) return baseDistance * 0.72;
  if (minDepth === 1 && maxDepth === 2) return baseDistance * 1.0;
  if (minDepth === 2 && maxDepth === 3) return baseDistance * 1.12;
  if (ds === dt) return baseDistance * 0.9;
  return baseDistance;
}

function getDepthAwareLinkStrength(sourceDepth: number | undefined, targetDepth: number | undefined, baseStrength: number) {
  const ds = sourceDepth ?? 1;
  const dt = targetDepth ?? 1;
  const minDepth = Math.min(ds, dt);
  const maxDepth = Math.max(ds, dt);

  if (minDepth === 0 && maxDepth === 1) return baseStrength * 0.75;
  if (minDepth === 1 && maxDepth === 2) return baseStrength * 1.15;
  if (minDepth === 2 && maxDepth === 3) return baseStrength * 1.05;
  if (ds === dt) return baseStrength * 0.45;
  return baseStrength * 0.35;
}

export function createForceSimulation(
  nodes: GraphNode[],
  links: GraphEdge[],
  layout: GraphLayoutMode,
  width: number,
  height: number,
  settings: GraphSettings,
  focusId?: string,
) {
  const defaults = DEFAULT_FORCE_SETTINGS[layout] ?? DEFAULT_FORCE_SETTINGS.force;
  const physical = toPhysicalForces({ ...defaults, ...settings.forces });
  const collisionRadius = getEffectiveCollisionRadius(settings) + physical.collisionPadding;

  return d3
    .forceSimulation(nodes)
    .velocityDecay(physical.velocityDecay)
    .alphaDecay(physical.alphaDecay)
    .force('link', d3.forceLink(links).id((d) => d.id).distance((link) => getDepthAwareLinkDistance(link.source.depthFromFocus, link.target.depthFromFocus, physical.linkDistance)).strength((link) => getDepthAwareLinkStrength(link.source.depthFromFocus, link.target.depthFromFocus, physical.linkStrength)).iterations(physical.linkIterations))
    .force('charge', d3.forceManyBody().strength((node: GraphNode) => physical.chargeStrength * depthWeight(node.depthFromFocus)).distanceMin(physical.chargeDistanceMin).distanceMax(physical.chargeDistanceMax))
    .force('center-x', d3.forceX(width / 2).strength(physical.physicalCenterStrength))
    .force('center-y', d3.forceY(height / 2).strength(physical.physicalCenterStrength))
    .force('local-gravity-x', d3.forceX(width / 2).strength((node: GraphNode) => (focusId ? physical.localGravityStrength * localGravityWeight(node.depthFromFocus) : 0)))
    .force('local-gravity-y', d3.forceY(height / 2).strength((node: GraphNode) => (focusId ? physical.localGravityStrength * localGravityWeight(node.depthFromFocus) : 0)))
    .force('collision', d3.forceCollide().radius(collisionRadius).strength(physical.collisionStrength).iterations(physical.collideIterations));
}

export function updateForceSimulation(simulation, width: number, height: number, settings: GraphSettings, focusId?: string) {
  const physical = toPhysicalForces(settings.forces);
  const collisionRadius = getEffectiveCollisionRadius(settings) + physical.collisionPadding;

  simulation.velocityDecay(physical.velocityDecay);
  simulation.alphaDecay(physical.alphaDecay);
  simulation.force('link')?.distance((link) => getDepthAwareLinkDistance(link.source.depthFromFocus, link.target.depthFromFocus, physical.linkDistance)).strength((link) => getDepthAwareLinkStrength(link.source.depthFromFocus, link.target.depthFromFocus, physical.linkStrength)).iterations(physical.linkIterations);
  simulation.force('charge')?.strength((node: GraphNode) => physical.chargeStrength * depthWeight(node.depthFromFocus)).distanceMin(physical.chargeDistanceMin).distanceMax(physical.chargeDistanceMax);
  simulation.force('center-x')?.strength(physical.physicalCenterStrength).x(width / 2);
  simulation.force('center-y')?.strength(physical.physicalCenterStrength).y(height / 2);
  simulation.force('local-gravity-x')?.strength((node: GraphNode) => (focusId ? physical.localGravityStrength * localGravityWeight(node.depthFromFocus) : 0)).x(width / 2);
  simulation.force('local-gravity-y')?.strength((node: GraphNode) => (focusId ? physical.localGravityStrength * localGravityWeight(node.depthFromFocus) : 0)).y(height / 2);
  simulation.force('collision')?.radius(collisionRadius).strength(physical.collisionStrength).iterations(physical.collideIterations);

  return physical;
}
