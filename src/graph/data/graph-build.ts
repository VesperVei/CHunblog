import type { GraphData, GraphNode } from '../types';

export function labelForNode(node: GraphNode, locale: string) {
  return node.titles?.[locale] || node.titles?.['zh-cn'] || node.titles?.['en'] || node.id;
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
