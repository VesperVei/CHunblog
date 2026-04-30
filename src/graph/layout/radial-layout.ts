import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { DEFAULT_FORCE_SETTINGS, getEffectiveCollisionRadius } from '../constants';
import { labelForNode } from '../data/graph-build';
import { toPhysicalForces } from './physical-forces';
import type { GraphEdge, GraphNode, GraphSettings } from '../types';

function compareGraphNodes(left: GraphNode, right: GraphNode, locale: string) {
  const leftType = left.type ?? '';
  const rightType = right.type ?? '';
  if (leftType !== rightType) {
    return leftType.localeCompare(rightType, locale);
  }

  const labelOrder = labelForNode(left, locale).localeCompare(labelForNode(right, locale), locale);
  if (labelOrder !== 0) {
    return labelOrder;
  }

  return left.id.localeCompare(right.id, locale);
}

export function assignRadialTargets(nodes: GraphNode[], width: number, height: number, focusId?: string, locale = 'en') {
  const centerX = width / 2;
  const centerY = height / 2;
  const sortedNodes = [...nodes].sort((left, right) => compareGraphNodes(left, right, locale));
  const nodesByDepth = new Map<number, GraphNode[]>();

  for (const node of sortedNodes) {
    const depth = Math.max(0, node.depthFromFocus ?? (node.id === focusId ? 0 : 1));
    nodesByDepth.set(depth, [...(nodesByDepth.get(depth) ?? []), node]);
    node.fx = null;
    node.fy = null;
  }

  const focusNode = (focusId ? sortedNodes.find((node) => node.id === focusId) : undefined) ?? nodesByDepth.get(0)?.[0];
  if (focusNode) {
    focusNode.targetX = centerX;
    focusNode.targetY = centerY;
    focusNode.x ??= centerX;
    focusNode.y ??= centerY;
  }

  const baseRadius = Math.max(Math.min(width, height) * 0.16, 96);
  const ringGap = Math.max(Math.min(width, height) * 0.14, 88);
  const minArcGap = 54;
  let previousRadius = 0;

  const depths = [...nodesByDepth.keys()].filter((depth) => depth > 0).sort((left, right) => left - right);
  for (const depth of depths) {
    const group = nodesByDepth.get(depth) ?? [];
    if (group.length === 0) {
      continue;
    }

    const targetRadius = baseRadius + ((depth - 1) * ringGap);
    const circumferenceRadius = group.length <= 1 ? targetRadius : (group.length * minArcGap) / (2 * Math.PI);
    const radius = Math.max(targetRadius, previousRadius + ringGap * 0.75, circumferenceRadius);
    previousRadius = radius;
    const angleStep = (2 * Math.PI) / group.length;
    const startAngle = -Math.PI / 2;

    group.forEach((node, index) => {
      const angle = startAngle + (index * angleStep);
      node.targetX = centerX + (Math.cos(angle) * radius);
      node.targetY = centerY + (Math.sin(angle) * radius);
      node.x ??= node.targetX;
      node.y ??= node.targetY;
    });
  }
}

export function createRadialSimulation(
  nodes: GraphNode[],
  links: GraphEdge[],
  width: number,
  height: number,
  settings: GraphSettings,
  focusId?: string,
  locale = 'en',
) {
  assignRadialTargets(nodes, width, height, focusId, locale);

  const physical = toPhysicalForces({ ...DEFAULT_FORCE_SETTINGS.radial, ...settings.forces });
  const collisionRadius = getEffectiveCollisionRadius(settings) + physical.collisionPadding;

  return d3
    .forceSimulation(nodes)
    .velocityDecay(physical.velocityDecay)
    .alphaDecay(physical.alphaDecay)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(physical.linkDistance).strength(physical.linkStrength).iterations(physical.linkIterations))
    .force('charge', d3.forceManyBody().strength(physical.chargeStrength).distanceMin(physical.chargeDistanceMin).distanceMax(physical.chargeDistanceMax))
    .force('collision', d3.forceCollide().radius(collisionRadius).strength(physical.collisionStrength).iterations(physical.collideIterations))
    .force('radial-anchor-x', d3.forceX((node: GraphNode) => node.targetX ?? width / 2).strength(physical.localGravityStrength * 1.85))
    .force('radial-anchor-y', d3.forceY((node: GraphNode) => node.targetY ?? height / 2).strength(physical.localGravityStrength * 1.85))
    .force('weak-center-x', d3.forceX(width / 2).strength(physical.physicalCenterStrength * 0.22))
    .force('weak-center-y', d3.forceY(height / 2).strength(physical.physicalCenterStrength * 0.22));
}

export function updateRadialSimulation(simulation, nodes: GraphNode[], width: number, height: number, settings: GraphSettings, focusId?: string, locale = 'en') {
  assignRadialTargets(nodes, width, height, focusId, locale);

  const physical = toPhysicalForces(settings.forces);
  const collisionRadius = getEffectiveCollisionRadius(settings) + physical.collisionPadding;

  simulation.velocityDecay(physical.velocityDecay);
  simulation.alphaDecay(physical.alphaDecay);
  simulation.force('link')?.distance(physical.linkDistance).strength(physical.linkStrength).iterations(physical.linkIterations);
  simulation.force('charge')?.strength(physical.chargeStrength).distanceMin(physical.chargeDistanceMin).distanceMax(physical.chargeDistanceMax);
  simulation.force('collision')?.radius(collisionRadius).strength(physical.collisionStrength).iterations(physical.collideIterations);
  simulation.force('radial-anchor-x')?.strength(physical.localGravityStrength * 1.85).x((node: GraphNode) => node.targetX ?? width / 2);
  simulation.force('radial-anchor-y')?.strength(physical.localGravityStrength * 1.85).y((node: GraphNode) => node.targetY ?? height / 2);
  simulation.force('weak-center-x')?.strength(physical.physicalCenterStrength * 0.22).x(width / 2);
  simulation.force('weak-center-y')?.strength(physical.physicalCenterStrength * 0.22).y(height / 2);

  return physical;
}
