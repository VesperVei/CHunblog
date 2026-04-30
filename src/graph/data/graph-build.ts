import type { GraphData, GraphNode } from '../types';

export function hasLocaleGraphEntry(node: GraphNode, locale: string) {
  return Boolean(node.titles?.[locale] && node.urls?.[locale]);
}

export function labelForNode(node: GraphNode, locale: string) {
  return node.titles?.[locale] || node.id;
}

export function filterGraphDataByLocale(data: GraphData, locale: string): GraphData {
  const nodes = data.nodes.filter((node) => hasLocaleGraphEntry(node, locale));
  const visibleIds = new Set(nodes.map((node) => node.id));

  return {
    ...data,
    nodes,
    links: data.links.filter((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return visibleIds.has(sourceId) && visibleIds.has(targetId);
    }),
  };
}

export function createGraphIndexes(data: GraphData) {
  const validLinks = data.links.filter((item) => item.exists);
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const directLinkSet = new Set<string>();

  for (const link of validLinks) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;

    outgoing.set(sourceId, [...(outgoing.get(sourceId) ?? []), targetId]);
    incoming.set(targetId, [...(incoming.get(targetId) ?? []), sourceId]);
    directLinkSet.add(`${sourceId}::${targetId}`);
  }

  return {
    nodeById: new Map(data.nodes.map((node) => [node.id, node])),
    validLinks,
    outgoing,
    incoming,
    directLinkSet,
  };
}
