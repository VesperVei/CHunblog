import type { BrainGraphNode, BrainRelationKind, GraphData, GraphFilterSettings, GraphNode } from '../types';
import { filterGraphDataByLocale, labelForNode, createGraphIndexes } from './graph-build';

function hasDirectLink(indexes: ReturnType<typeof createGraphIndexes>, sourceId: string, targetId: string) {
  return indexes.directLinkSet.has(`${sourceId}::${targetId}`);
}

function hasAnyDirectLink(indexes: ReturnType<typeof createGraphIndexes>, leftId: string, rightId: string) {
  return hasDirectLink(indexes, leftId, rightId) || hasDirectLink(indexes, rightId, leftId);
}

function hasBidirectionalLink(indexes: ReturnType<typeof createGraphIndexes>, leftId: string, rightId: string) {
  return hasDirectLink(indexes, leftId, rightId) && hasDirectLink(indexes, rightId, leftId);
}

function getDirectNeighbors(indexes: ReturnType<typeof createGraphIndexes>, nodeId: string) {
  return new Set([...(indexes.outgoing.get(nodeId) ?? []), ...(indexes.incoming.get(nodeId) ?? [])]);
}

function getParentIdsForNode(indexes: ReturnType<typeof createGraphIndexes>, node: GraphNode) {
  if (typeof node.graphLevel !== 'number') {
    return new Set<string>();
  }

  const neighbors = getDirectNeighbors(indexes, node.id);
  const parents = new Set<string>();

  for (const neighborId of neighbors) {
    const neighbor = indexes.nodeById.get(neighborId);
    if (!neighbor || typeof neighbor.graphLevel !== 'number') {
      continue;
    }

    if (neighbor.graphLevel === node.graphLevel - 1) {
      parents.add(neighborId);
    }
  }

  return parents;
}

function getSortedParentIds(parentIds: Set<string>, indexes: ReturnType<typeof createGraphIndexes>, locale: string) {
  return [...parentIds].sort((leftId, rightId) => {
    const leftNode = indexes.nodeById.get(leftId);
    const rightNode = indexes.nodeById.get(rightId);

    if (!leftNode || !rightNode) {
      return leftId.localeCompare(rightId);
    }

    return compareBrainNodes(leftNode, rightNode, locale);
  });
}

function getSiblingAnchorParentId(
  indexes: ReturnType<typeof createGraphIndexes>,
  focusNode: GraphNode,
  candidate: GraphNode,
  locale: string,
) {
  const focusParents = getParentIdsForNode(indexes, focusNode);
  if (focusParents.size === 0) {
    return undefined;
  }

  const candidateParents = getParentIdsForNode(indexes, candidate);
  const sharedParents = getSortedParentIds(
    new Set([...candidateParents].filter((parentId) => focusParents.has(parentId))),
    indexes,
    locale,
  );

  if (sharedParents.length > 0) {
    return sharedParents[0];
  }

  return getSortedParentIds(focusParents, indexes, locale)[0];
}

function shareParent(indexes: ReturnType<typeof createGraphIndexes>, focusNode: GraphNode, candidate: GraphNode) {
  if (typeof focusNode.graphLevel !== 'number' || typeof candidate.graphLevel !== 'number') {
    return false;
  }

  if (candidate.graphLevel !== focusNode.graphLevel) {
    return false;
  }

  const focusParents = getParentIdsForNode(indexes, focusNode);
  if (focusParents.size === 0) {
    return false;
  }

  const candidateParents = getParentIdsForNode(indexes, candidate);
  for (const parentId of candidateParents) {
    if (focusParents.has(parentId)) {
      return true;
    }
  }

  return false;
}

function compareBrainNodes(left: GraphNode, right: GraphNode, locale: string) {
  const leftLevel = typeof left.graphLevel === 'number' ? left.graphLevel : Number.POSITIVE_INFINITY;
  const rightLevel = typeof right.graphLevel === 'number' ? right.graphLevel : Number.POSITIVE_INFINITY;

  if (leftLevel !== rightLevel) {
    return leftLevel - rightLevel;
  }

  return labelForNode(left, locale).localeCompare(labelForNode(right, locale), locale);
}

function classifyRelation(indexes: ReturnType<typeof createGraphIndexes>, focusNode: GraphNode, candidate: GraphNode): BrainRelationKind | null {
  const directlyLinked = hasAnyDirectLink(indexes, focusNode.id, candidate.id);
  const focusLevel = focusNode.graphLevel;
  const candidateLevel = candidate.graphLevel;

  if (typeof focusLevel === 'number' && typeof candidateLevel === 'number' && directlyLinked) {
    if (candidateLevel === focusLevel - 1) {
      return 'parent';
    }

    if (candidateLevel === focusLevel + 1) {
      return 'child';
    }

    if (candidateLevel === focusLevel && hasBidirectionalLink(indexes, focusNode.id, candidate.id)) {
      return 'sibling';
    }
  }

  if (shareParent(indexes, focusNode, candidate)) {
    return 'sibling';
  }

  if (directlyLinked) {
    return 'jump';
  }

  return null;
}

export function buildBrainRenderableGraph(data: GraphData, focusId?: string, filters: GraphFilterSettings = {}, locale = 'en') {
  const localizedData = filterGraphDataByLocale(data, locale, { onlyExistingNotes: filters.onlyExistingNotes });
  if (!focusId) {
    return {
      nodes: [],
      links: [],
    };
  }

  const indexes = createGraphIndexes(localizedData, { onlyExistingNotes: filters.onlyExistingNotes });
  const focusNode = indexes.nodeById.get(focusId);
  if (!focusNode) {
    return {
      nodes: [],
      links: [],
    };
  }

  const includedIds = new Set<string>([focusId]);
  const nodeRelations = new Map<string, BrainRelationKind>([[focusId, 'current']]);
  const siblingAnchorParentIds = new Map<string, string>();

  const directNeighbors = getDirectNeighbors(indexes, focusId);
  const focusParents = getParentIdsForNode(indexes, focusNode);
  const searchQuery = (filters.searchQuery ?? '').trim().toLowerCase();

  const matchesSearch = (node: GraphNode) => {
    if (!searchQuery || node.id === focusId) {
      return true;
    }

    const haystacks = [node.id, labelForNode(node, locale), ...Object.values(node.titles ?? {}), ...Object.values(node.urls ?? {})];
    return haystacks.some((value) => String(value).toLowerCase().includes(searchQuery));
  };

  for (const neighborId of directNeighbors) {
    const isOutgoing = hasDirectLink(indexes, focusId, neighborId);
    const isIncoming = hasDirectLink(indexes, neighborId, focusId);
    if (filters.showForwardLinks === false && isOutgoing && !isIncoming) {
      continue;
    }

    if (filters.showBacklinks === false && isIncoming && !isOutgoing) {
      continue;
    }

    const candidate = indexes.nodeById.get(neighborId);
    if (!candidate) {
      continue;
    }

    const relation = classifyRelation(indexes, focusNode, candidate);
    if (!relation) {
      continue;
    }

    includedIds.add(candidate.id);
    nodeRelations.set(candidate.id, relation);
    if (relation === 'sibling') {
      const anchorParentId = getSiblingAnchorParentId(indexes, focusNode, candidate, locale);
      if (anchorParentId) {
        siblingAnchorParentIds.set(candidate.id, anchorParentId);
      }
    }
  }

  if (focusParents.size > 0) {
    for (const node of localizedData.nodes) {
      if (includedIds.has(node.id) || node.id === focusId) {
        continue;
      }

      if (!shareParent(indexes, focusNode, node)) {
        continue;
      }

      includedIds.add(node.id);
      nodeRelations.set(node.id, 'sibling');
      const anchorParentId = getSiblingAnchorParentId(indexes, focusNode, node, locale);
      if (anchorParentId) {
        siblingAnchorParentIds.set(node.id, anchorParentId);
      }
    }
  }

  const nodes = localizedData.nodes
    .filter((node) => includedIds.has(node.id))
    .filter(matchesSearch)
    .sort((left, right) => compareBrainNodes(left, right, locale))
    .map((node) => ({
      ...node,
      brainRelation: nodeRelations.get(node.id) ?? 'jump',
      brainAnchorParentId: siblingAnchorParentIds.get(node.id),
    }) satisfies BrainGraphNode);

  return {
    nodes,
    links: indexes.validLinks.filter((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      if (!includedIds.has(sourceId) || !includedIds.has(targetId)) {
        return false;
      }

      if (filters.showCrossLinks === false && sourceId !== focusId && targetId !== focusId) {
        return false;
      }

      return nodes.some((node) => node.id === sourceId) && nodes.some((node) => node.id === targetId);
    }),
  };
}
