import type { GraphNode } from '../types';

export function getNodeRole(node: GraphNode) {
  return node.role || (typeof node.metadata?.role === 'string' ? node.metadata.role : undefined);
}

export function getNodeLayer(node: GraphNode) {
  const role = getNodeRole(node);
  if (!role) {
    return undefined;
  }

  if (role.includes('根')) return 0;
  if (role.includes('一级')) return 1;
  if (role.includes('二级')) return 2;
  if (role.includes('三级')) return 3;
  return undefined;
}
