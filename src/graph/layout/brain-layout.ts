import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { DEFAULT_FORCE_SETTINGS, getEffectiveCollisionRadius } from '../constants';
import { toPhysicalForces } from './physical-forces';
import type { BrainGraphNode, GraphEdge, GraphSettings } from '../types';

const RELATION_ORDER = ['parent', 'child', 'sibling', 'jump'] as const;

function distribute(count: number, center: number, spacing: number) {
  if (count <= 1) {
    return [center];
  }

  const start = center - ((count - 1) * spacing) / 2;
  return Array.from({ length: count }, (_, index) => start + index * spacing);
}

export function assignBrainTargets(nodes: BrainGraphNode[], width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const groups = {
    parent: nodes.filter((node) => node.brainRelation === 'parent'),
    child: nodes.filter((node) => node.brainRelation === 'child'),
    sibling: nodes.filter((node) => node.brainRelation === 'sibling'),
    jump: nodes.filter((node) => node.brainRelation === 'jump'),
  };

  for (const node of nodes) {
    if (node.brainRelation === 'current') {
      node.targetX = centerX;
      node.targetY = centerY;
      node.x = centerX;
      node.y = centerY;
    }

    node.fx = null;
    node.fy = null;
  }

  const parentXs = distribute(groups.parent.length, centerX, Math.max(width * 0.12, 72));
  groups.parent.forEach((node, index) => {
    node.targetX = parentXs[index];
    node.targetY = height * 0.22;
  });

  const parentTargetById = new Map(
    groups.parent.map((node) => [node.id, { x: node.targetX ?? centerX, y: node.targetY ?? centerY }]),
  );

  const childXs = distribute(groups.child.length, centerX, Math.max(width * 0.12, 72));
  groups.child.forEach((node, index) => {
    node.targetX = childXs[index];
    node.targetY = height * 0.78;
  });

  const siblingSpacing = Math.max(height * 0.1, 54);
  const siblingOffsetX = Math.max(width * 0.16, 120);
  const anchoredSiblingGroups = new Map<string, BrainGraphNode[]>();
  const unanchoredSiblings: BrainGraphNode[] = [];

  groups.sibling.forEach((node) => {
    const anchorParentId = node.brainAnchorParentId;
    if (anchorParentId && parentTargetById.has(anchorParentId)) {
      anchoredSiblingGroups.set(anchorParentId, [...(anchoredSiblingGroups.get(anchorParentId) ?? []), node]);
      return;
    }

    unanchoredSiblings.push(node);
  });

  const sortedAnchoredSiblingGroups = [...anchoredSiblingGroups.entries()].sort(([leftId], [rightId]) => {
    const leftTarget = parentTargetById.get(leftId);
    const rightTarget = parentTargetById.get(rightId);

    if (!leftTarget || !rightTarget) {
      return leftId.localeCompare(rightId);
    }

    return leftTarget.x - rightTarget.x;
  });

  sortedAnchoredSiblingGroups.forEach(([parentId, siblingNodes]) => {
    const parentTarget = parentTargetById.get(parentId);
    if (!parentTarget) {
      return;
    }

    const siblingYs = distribute(siblingNodes.length, parentTarget.y, siblingSpacing);
    siblingNodes.forEach((node, index) => {
      node.targetX = Math.min(width - 72, parentTarget.x + siblingOffsetX);
      node.targetY = siblingYs[index];
    });
  });

  const fallbackSiblingYs = distribute(unanchoredSiblings.length, centerY, siblingSpacing);
  unanchoredSiblings.forEach((node, index) => {
    node.targetX = width * 0.78;
    node.targetY = fallbackSiblingYs[index];
  });

  const jumpYs = distribute(groups.jump.length, centerY, Math.max(height * 0.1, 54));
  groups.jump.forEach((node, index) => {
    node.targetX = width * 0.22;
    node.targetY = jumpYs[index];
  });

  for (const relation of RELATION_ORDER) {
    for (const node of groups[relation]) {
      node.x ??= node.targetX;
      node.y ??= node.targetY;
    }
  }
}

export function createBrainSimulation(
  nodes: BrainGraphNode[],
  links: GraphEdge[],
  width: number,
  height: number,
  settings: GraphSettings,
) {
  assignBrainTargets(nodes, width, height);

  const physical = toPhysicalForces({ ...DEFAULT_FORCE_SETTINGS.brain, ...settings.forces });
  const collisionRadius = getEffectiveCollisionRadius(settings) + physical.collisionPadding;
  const anchorStrength = settings.layout.brainAnchorStrength ?? 0.35;

  return d3
    .forceSimulation(nodes)
    .velocityDecay(physical.velocityDecay)
    .alphaDecay(physical.alphaDecay)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(physical.linkDistance).strength(physical.linkStrength).iterations(physical.linkIterations))
    .force('charge', d3.forceManyBody().strength(physical.chargeStrength).distanceMin(physical.chargeDistanceMin).distanceMax(physical.chargeDistanceMax))
    .force('collision', d3.forceCollide().radius(collisionRadius).strength(physical.collisionStrength).iterations(physical.collideIterations))
    .force('brain-anchor-x', d3.forceX((node: BrainGraphNode) => node.targetX ?? width / 2).strength(anchorStrength))
    .force('brain-anchor-y', d3.forceY((node: BrainGraphNode) => node.targetY ?? height / 2).strength(anchorStrength))
    .force('weak-center-x', d3.forceX(width / 2).strength(physical.physicalCenterStrength * 0.35))
    .force('weak-center-y', d3.forceY(height / 2).strength(physical.physicalCenterStrength * 0.35));
}

export function updateBrainSimulation(simulation, nodes: BrainGraphNode[], width: number, height: number, settings: GraphSettings) {
  assignBrainTargets(nodes, width, height);

  const physical = toPhysicalForces(settings.forces);
  const collisionRadius = getEffectiveCollisionRadius(settings) + physical.collisionPadding;
  const anchorStrength = settings.layout.brainAnchorStrength ?? 0.35;

  simulation.velocityDecay(physical.velocityDecay);
  simulation.alphaDecay(physical.alphaDecay);
  simulation.force('link')?.distance(physical.linkDistance).strength(physical.linkStrength).iterations(physical.linkIterations);
  simulation.force('charge')?.strength(physical.chargeStrength).distanceMin(physical.chargeDistanceMin).distanceMax(physical.chargeDistanceMax);
  simulation.force('collision')?.radius(collisionRadius).strength(physical.collisionStrength).iterations(physical.collideIterations);
  simulation.force('brain-anchor-x')?.strength(anchorStrength).x((node: BrainGraphNode) => node.targetX ?? width / 2);
  simulation.force('brain-anchor-y')?.strength(anchorStrength).y((node: BrainGraphNode) => node.targetY ?? height / 2);
  simulation.force('weak-center-x')?.strength(physical.physicalCenterStrength * 0.35).x(width / 2);
  simulation.force('weak-center-y')?.strength(physical.physicalCenterStrength * 0.35).y(height / 2);

  return physical;
}
