import type { GraphColorGroup, GraphColorGroupMatch, GraphNode } from './types';

function propertyMatch(key: string, value: string | number | boolean): GraphColorGroupMatch {
  return {
    kind: 'property',
    key,
    value,
  };
}

export const DEFAULT_GRAPH_LEVEL_COLOR_GROUPS: GraphColorGroup[] = [
  {
    id: 'level-0-root',
    name: 'Level 0 · Root',
    color: '#8B5CF6',
    enabled: true,
    priority: 100,
    builtin: true,
    match: propertyMatch('graphLevel', 0),
  },
  {
    id: 'level-1-primary',
    name: 'Level 1 · Primary',
    color: '#2563EB',
    enabled: true,
    priority: 90,
    builtin: true,
    match: propertyMatch('graphLevel', 1),
  },
  {
    id: 'level-2-secondary',
    name: 'Level 2 · Secondary',
    color: '#0891B2',
    enabled: true,
    priority: 80,
    builtin: true,
    match: propertyMatch('graphLevel', 2),
  },
  {
    id: 'level-3-tertiary',
    name: 'Level 3 · Tertiary',
    color: '#16A34A',
    enabled: true,
    priority: 70,
    builtin: true,
    match: propertyMatch('graphLevel', 3),
  },
  {
    id: 'level-4-detail',
    name: 'Level 4 · Detail',
    color: '#F59E0B',
    enabled: true,
    priority: 60,
    builtin: true,
    match: propertyMatch('graphLevel', 4),
  },
  {
    id: 'level-5-leaf',
    name: 'Level 5 · Leaf',
    color: '#EF4444',
    enabled: true,
    priority: 50,
    builtin: true,
    match: propertyMatch('graphLevel', 5),
  },
];

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function toComparableValue(rawValue: unknown) {
  if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
      return Number(trimmed);
    }

    return trimmed;
  }

  return String(rawValue ?? '').trim();
}

function normalizeLegacyRule(group: GraphColorGroup): GraphColorGroupMatch | undefined {
  const rule = group.rule;
  if (!rule?.type) {
    return undefined;
  }

  if (rule.type === 'graphLevel' && typeof rule.level === 'number') {
    return propertyMatch('graphLevel', rule.level);
  }

  if (rule.type === 'property' && rule.propertyKey) {
    return propertyMatch(rule.propertyKey, rule.propertyValue ?? '');
  }

  if (rule.type === 'tag' && rule.value) {
    return propertyMatch('tags', rule.value);
  }

  if (rule.type === 'title' && rule.value) {
    return propertyMatch('title', rule.value);
  }

  if (rule.type === 'path' && rule.value) {
    return propertyMatch('path', rule.value);
  }

  if (rule.type === 'query' && rule.value) {
    return propertyMatch('title', rule.value);
  }

  return undefined;
}

export function normalizeColorGroup(group: GraphColorGroup, index = 0): GraphColorGroup {
  const match = group.match ?? normalizeLegacyRule(group) ?? propertyMatch('graphLevel', index);

  return {
    ...group,
    id: group.id || `color-group-${index + 1}`,
    name: group.name || `Color Group ${index + 1}`,
    color: group.color || '#8B5CF6',
    enabled: group.enabled !== false,
    priority: Number.isFinite(group.priority) ? group.priority : 0,
    match: {
      kind: 'property',
      key: String(match.key || 'graphLevel').trim() || 'graphLevel',
      value: toComparableValue(match.value),
    },
  };
}

export function cloneColorGroup(group: GraphColorGroup): GraphColorGroup {
  const normalized = normalizeColorGroup(group);
  return {
    ...normalized,
    match: normalized.match ? { ...normalized.match } : undefined,
    rule: normalized.rule ? { ...normalized.rule } : undefined,
  };
}

export function cloneColorGroups(groups: GraphColorGroup[] | undefined): GraphColorGroup[] {
  return (groups ?? DEFAULT_GRAPH_LEVEL_COLOR_GROUPS).map(cloneColorGroup);
}

export function ensureColorGroups(groups?: GraphColorGroup[]) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return cloneColorGroups(DEFAULT_GRAPH_LEVEL_COLOR_GROUPS);
  }

  return groups.map((group, index) => normalizeColorGroup(group, index));
}

function readNodeProperty(node: GraphNode, key: string, locale = 'en'): unknown {
  if (key === 'title') {
    return node.titles?.[locale] || Object.values(node.titles ?? {})[0] || node.id;
  }

  if (key === 'path') {
    return node.path || Object.values(node.urls ?? {})[0] || '';
  }

  if (key === 'tags') {
    return node.tags ?? [];
  }

  return node.metadata?.[key];
}

export function matchColorGroup(node: GraphNode, group: GraphColorGroup, locale = 'en') {
  const normalized = normalizeColorGroup(group);
  const match = normalized.match;
  if (!match || match.kind !== 'property') {
    return false;
  }

  const actual = readNodeProperty(node, match.key, locale);
  if (Array.isArray(actual)) {
    return actual.some((item) => normalizeText(item) === normalizeText(match.value));
  }

  if (typeof actual === 'number' || typeof match.value === 'number') {
    return Number(actual) === Number(match.value);
  }

  if (typeof actual === 'boolean' || typeof match.value === 'boolean') {
    return Boolean(actual) === Boolean(match.value);
  }

  return normalizeText(actual) === normalizeText(match.value);
}

export function resolveNodeColor(node: GraphNode, colorGroups: GraphColorGroup[], locale = 'en', fallback = 'var(--graph-node-default)') {
  const matched = ensureColorGroups(colorGroups)
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.enabled)
    .filter(({ group }) => matchColorGroup(node, group, locale))
    .sort((left, right) => {
      if (left.group.priority !== right.group.priority) {
        return right.group.priority - left.group.priority;
      }

      return left.index - right.index;
    });

  return matched[0]?.group.color ?? fallback;
}

export function summarizeColorGroupRule(group: GraphColorGroup) {
  const normalized = normalizeColorGroup(group);
  return `["${normalized.match?.key ?? 'graphLevel'}": ${JSON.stringify(normalized.match?.value ?? '')}]`;
}
