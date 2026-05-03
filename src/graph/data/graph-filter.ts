import { DEFAULT_DEPTH } from '../constants';
import type { GraphData, GraphDirection, GraphFilterSettings, GraphViewMode } from '../types';
import { filterGraphDataByLocale, labelForNode, createGraphIndexes } from './graph-build';

type FilterOptions = {
  mode?: GraphViewMode;
  focusId?: string;
  locale?: string;
  filters?: GraphFilterSettings;
};

function collectNeighbors(indexes: ReturnType<typeof createGraphIndexes>, nodeId: string, direction: GraphDirection) {
  if (direction === 'outgoing') {
    return indexes.outgoing.get(nodeId) ?? [];
  }

  if (direction === 'incoming') {
    return indexes.incoming.get(nodeId) ?? [];
  }

  return [...new Set([...(indexes.outgoing.get(nodeId) ?? []), ...(indexes.incoming.get(nodeId) ?? [])])];
}

function matchesSearch(node, query: string, locale: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystacks = [
    node.id,
    labelForNode(node, locale),
    ...Object.values(node.titles ?? {}),
    ...Object.values(node.urls ?? {}),
  ];

  return haystacks.some((value) => String(value).toLowerCase().includes(needle));
}

export function buildRenderableGraph(data: GraphData, options: FilterOptions = {}) {
  const mode = options.mode ?? 'global';
  const focusId = options.focusId;
  const locale = options.locale ?? 'en';
  const filters = options.filters ?? {};
  const localizedData = filterGraphDataByLocale(data, locale, { onlyExistingNotes: filters.onlyExistingNotes });
  const depth = filters.depth ?? DEFAULT_DEPTH;
  const direction: GraphDirection = filters.showBacklinks === false
    ? 'outgoing'
    : filters.showForwardLinks === false
      ? 'incoming'
      : 'both';
  const indexes = createGraphIndexes(localizedData, { onlyExistingNotes: filters.onlyExistingNotes });
  const searchQuery = filters.searchQuery ?? '';

  if (mode !== 'local' || !focusId) {
    const nodes = localizedData.nodes.filter((node) => matchesSearch(node, searchQuery, locale));
    const visibleIds = new Set(nodes.map((node) => node.id));

    return {
      nodes,
      links: indexes.validLinks.filter((link) => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        return visibleIds.has(sourceId) && visibleIds.has(targetId);
      }),
    };
  }

  const visited = new Set<string>([focusId]);
  let frontier = new Set<string>([focusId]);

  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbor of collectNeighbors(indexes, nodeId, direction)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.add(neighbor);
        }
      }
    }

    frontier = next;
    if (frontier.size === 0) {
      break;
    }
  }

  const nodes = localizedData.nodes.filter((node) => visited.has(node.id) && (node.id === focusId || matchesSearch(node, searchQuery, locale)));
  const visibleIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    links: indexes.validLinks.filter((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      if (!visibleIds.has(sourceId) || !visibleIds.has(targetId)) {
        return false;
      }

      if (filters.showCrossLinks === false && sourceId !== focusId && targetId !== focusId) {
        return false;
      }

      return true;
    }),
  };
}
