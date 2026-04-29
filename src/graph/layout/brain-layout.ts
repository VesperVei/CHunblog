import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { DEFAULT_FORCE_SETTINGS, getEffectiveCollisionRadius } from '../constants';
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

  const childXs = distribute(groups.child.length, centerX, Math.max(width * 0.12, 72));
  groups.child.forEach((node, index) => {
    node.targetX = childXs[index];
    node.targetY = height * 0.78;
  });

  const siblingYs = distribute(groups.sibling.length, centerY, Math.max(height * 0.1, 54));
  groups.sibling.forEach((node, index) => {
    node.targetX = width * 0.78;
    node.targetY = siblingYs[index];
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

  const forces = { ...DEFAULT_FORCE_SETTINGS.brain, ...settings.forces };
  const collisionRadius = getEffectiveCollisionRadius(settings);
  const anchorStrength = settings.layout.brainAnchorStrength ?? 0.35;

  return d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(forces.linkDistance ?? 88).strength(forces.linkStrength ?? 0.4))
    .force('charge', d3.forceManyBody().strength(-(forces.repelStrength ?? 40)))
    .force('collision', d3.forceCollide().radius(collisionRadius).strength(forces.collisionStrength ?? 0.9))
    .force('target-x', d3.forceX((node: BrainGraphNode) => node.targetX ?? width / 2).strength(anchorStrength))
    .force('target-y', d3.forceY((node: BrainGraphNode) => node.targetY ?? height / 2).strength(anchorStrength))
    .force('center-x', d3.forceX(width / 2).strength(forces.centerStrength ?? 0.04))
    .force('center-y', d3.forceY(height / 2).strength(forces.centerStrength ?? 0.04));
}

export function updateBrainSimulation(simulation, nodes: BrainGraphNode[], width: number, height: number, settings: GraphSettings) {
  assignBrainTargets(nodes, width, height);

  const forces = settings.forces;
  const collisionRadius = getEffectiveCollisionRadius(settings);
  const anchorStrength = settings.layout.brainAnchorStrength ?? 0.35;

  simulation.force('link')?.distance(forces.linkDistance ?? 120).strength(forces.linkStrength ?? 0.7);
  simulation.force('charge')?.strength(-(forces.repelStrength ?? 120));
  simulation.force('collision')?.radius(collisionRadius).strength(forces.collisionStrength ?? 0.7);
  simulation.force('target-x')?.strength(anchorStrength).x((node: BrainGraphNode) => node.targetX ?? width / 2);
  simulation.force('target-y')?.strength(anchorStrength).y((node: BrainGraphNode) => node.targetY ?? height / 2);
  simulation.force('center-x')?.strength(forces.centerStrength ?? 0.08).x(width / 2);
  simulation.force('center-y')?.strength(forces.centerStrength ?? 0.08).y(height / 2);
}
