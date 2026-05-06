function serializeScalar(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function serializeYamlEntry(key, value, indent = 0) {
  const padding = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${padding}${key}: []`];
    const lines = [`${padding}${key}:`];
    for (const item of value) {
      if (isPlainObject(item)) {
        lines.push(`${padding}  -`);
        for (const [nestedKey, nestedValue] of Object.entries(item)) {
          lines.push(...serializeYamlEntry(nestedKey, nestedValue, indent + 4));
        }
      } else {
        lines.push(`${padding}  - ${serializeScalar(item)}`);
      }
    }
    return lines;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${padding}${key}: {}`];
    const lines = [`${padding}${key}:`];
    for (const [nestedKey, nestedValue] of entries) {
      lines.push(...serializeYamlEntry(nestedKey, nestedValue, indent + 2));
    }
    return lines;
  }

  return [`${padding}${key}: ${serializeScalar(value)}`];
}

export function serializeFrontmatter(normalized, preserved) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(normalized)) {
    if (value !== undefined) lines.push(...serializeYamlEntry(key, value));
  }

  const normalizedKeys = new Set(Object.keys(normalized));
  for (const [key, value] of Object.entries(preserved)) {
    if (!normalizedKeys.has(key)) lines.push(...serializeYamlEntry(key, value));
  }

  lines.push('---', '');
  return lines.join('\n');
}
