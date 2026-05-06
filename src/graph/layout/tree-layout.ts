import * as d3 from 'd3';
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

function distribute(count: number, center: number, spacing: number) {
  if (count <= 1) {
    return [center];
  }

  const start = center - ((count - 1) * spacing) / 2;
  return Array.from({ length: count }, (_, index) => start + index * spacing);
}

export function assignTreeTargets(nodes: GraphNode[], width: number, height: number, focusId?: string, locale = 'en') {
  const centerX = width / 2;
  const topY = Math.max(height * 0.14, 72);
  const bottomPadding = 72;
  const maxDepth = Math.max(...nodes.map((node) => node.depthFromFocus ?? 0), 0);
  const levelGap = maxDepth > 0
    ? Math.max(Math.min((height - topY - bottomPadding) / maxDepth, 156), 92)
    : 0;
  const nodeSpacing = Math.max(width * 0.09, 92);
  const siblingGap = Math.max(width * 0.03, 28);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, GraphNode[]>();
  const sortedNodes = [...nodes].sort((left, right) => compareGraphNodes(left, right, locale));

  for (const node of sortedNodes) {
    node.fx = null;
    node.fy = null;
    if (!node.primaryParentId || !nodeById.has(node.primaryParentId)) {
      continue;
    }

    childrenByParent.set(node.primaryParentId, [...(childrenByParent.get(node.primaryParentId) ?? []), node]);
  }

  for (const [parentId, children] of childrenByParent.entries()) {
    childrenByParent.set(parentId, [...children].sort((left, right) => compareGraphNodes(left, right, locale)));
  }

  const root = (focusId ? nodeById.get(focusId) : undefined)
    ?? sortedNodes.find((node) => (node.depthFromFocus ?? 1) === 0)
    ?? sortedNodes[0];
  if (!root) {
    return;
  }

  const subtreeWidth = new Map<string, number>();
  const measureSubtree = (node: GraphNode): number => {
    const children = childrenByParent.get(node.id) ?? [];
    if (children.length === 0) {
      subtreeWidth.set(node.id, nodeSpacing);
      return nodeSpacing;
    }

    const widths = children.map((child) => measureSubtree(child));
    const widthSum = widths.reduce((sum, value) => sum + value, 0) + (siblingGap * Math.max(0, children.length - 1));
    const totalWidth = Math.max(nodeSpacing, widthSum);
    subtreeWidth.set(node.id, totalWidth);
    return totalWidth;
  };

  measureSubtree(root);

  const assignSubtree = (node: GraphNode, leftX: number, rightX: number) => {
    node.targetX = (leftX + rightX) / 2;
    node.targetY = topY + ((node.depthFromFocus ?? 0) * levelGap);
    node.x ??= node.targetX;
    node.y ??= node.targetY;

    const children = childrenByParent.get(node.id) ?? [];
    if (children.length === 0) {
      return;
    }

    const totalChildrenWidth = children.reduce((sum, child) => sum + (subtreeWidth.get(child.id) ?? nodeSpacing), 0)
      + (siblingGap * Math.max(0, children.length - 1));
    let cursor = ((leftX + rightX) / 2) - (totalChildrenWidth / 2);

    children.forEach((child) => {
      const childWidth = subtreeWidth.get(child.id) ?? nodeSpacing;
      assignSubtree(child, cursor, cursor + childWidth);
      cursor += childWidth + siblingGap;
    });
  };

  const rootWidth = subtreeWidth.get(root.id) ?? nodeSpacing;
  assignSubtree(root, centerX - (rootWidth / 2), centerX + (rootWidth / 2));

  const positioned = nodes.filter((node) => Number.isFinite(node.targetX) && Number.isFinite(node.targetY));
  const minX = Math.min(...positioned.map((node) => node.targetX ?? centerX));
  const maxX = Math.max(...positioned.map((node) => node.targetX ?? centerX));
  const shiftX = centerX - ((minX + maxX) / 2);
  positioned.forEach((node) => {
    node.targetX = (node.targetX ?? centerX) + shiftX;
    node.x ??= node.targetX;
  });

  const positionedIds = new Set(positioned.map((node) => node.id));
  const fallbackByDepth = new Map<number, GraphNode[]>();
  sortedNodes.forEach((node) => {
    if (positionedIds.has(node.id)) {
      return;
    }

    const depth = Math.max(0, node.depthFromFocus ?? 0);
    fallbackByDepth.set(depth, [...(fallbackByDepth.get(depth) ?? []), node]);
  });

  for (const [depth, group] of fallbackByDepth.entries()) {
    const xs = distribute(group.length, centerX, nodeSpacing);
    group.forEach((node, index) => {
      node.targetX = xs[index];
      node.targetY = topY + (depth * levelGap);
      node.x ??= node.targetX;
      node.y ??= node.targetY;
    });
  }
}

export function createTreeSimulation(
  nodes: GraphNode[],
  links: GraphEdge[],
  width: number,
  height: number,
  settings: GraphSettings,
  focusId?: string,
  locale = 'en',
) {
  assignTreeTargets(nodes, width, height, focusId, locale);

  const physical = toPhysicalForces({ ...DEFAULT_FORCE_SETTINGS.tree, ...settings.forces });
  const collisionRadius = getEffectiveCollisionRadius(settings) + physical.collisionPadding;

  return d3
    .forceSimulation(nodes)
    .velocityDecay(physical.velocityDecay)
    .alphaDecay(physical.alphaDecay)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(physical.linkDistance).strength(physical.linkStrength * 0.95).iterations(physical.linkIterations))
    .force('charge', d3.forceManyBody().strength(physical.chargeStrength * 0.92).distanceMin(physical.chargeDistanceMin).distanceMax(physical.chargeDistanceMax))
    .force('collision', d3.forceCollide().radius(collisionRadius).strength(physical.collisionStrength).iterations(physical.collideIterations))
    .force('tree-anchor-x', d3.forceX((node: GraphNode) => node.targetX ?? width / 2).strength(physical.localGravityStrength * 2.1))
    .force('tree-anchor-y', d3.forceY((node: GraphNode) => node.targetY ?? height / 2).strength(physical.localGravityStrength * 2.35))
    .force('weak-center-x', d3.forceX(width / 2).strength(physical.physicalCenterStrength * 0.12))
    .force('weak-center-y', d3.forceY(height / 2).strength(physical.physicalCenterStrength * 0.08));
}

export function updateTreeSimulation(simulation, nodes: GraphNode[], width: number, height: number, settings: GraphSettings, focusId?: string, locale = 'en') {
  assignTreeTargets(nodes, width, height, focusId, locale);

  const physical = toPhysicalForces(settings.forces);
  const collisionRadius = getEffectiveCollisionRadius(settings) + physical.collisionPadding;

  simulation.velocityDecay(physical.velocityDecay);
  simulation.alphaDecay(physical.alphaDecay);
  simulation.force('link')?.distance(physical.linkDistance).strength(physical.linkStrength * 0.95).iterations(physical.linkIterations);
  simulation.force('charge')?.strength(physical.chargeStrength * 0.92).distanceMin(physical.chargeDistanceMin).distanceMax(physical.chargeDistanceMax);
  simulation.force('collision')?.radius(collisionRadius).strength(physical.collisionStrength).iterations(physical.collideIterations);
  simulation.force('tree-anchor-x')?.strength(physical.localGravityStrength * 2.1).x((node: GraphNode) => node.targetX ?? width / 2);
  simulation.force('tree-anchor-y')?.strength(physical.localGravityStrength * 2.35).y((node: GraphNode) => node.targetY ?? height / 2);
  simulation.force('weak-center-x')?.strength(physical.physicalCenterStrength * 0.12).x(width / 2);
  simulation.force('weak-center-y')?.strength(physical.physicalCenterStrength * 0.08).y(height / 2);

  return physical;
}
