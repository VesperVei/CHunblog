import { cleanString, normalizeArray } from '../utils.mjs';

const MAX_TAGS = 5;

const TAG_ALIASES = new Map([
  ['格式化字符串', 'format-string'],
  ['format-string', 'format-string'],
  ['fmtstr', 'format-string'],
  ['堆题', 'heap'],
  ['堆利用', 'heap'],
  ['heap', 'heap'],
  ['uaf', 'uaf'],
  ['use-after-free', 'uaf'],
  ['double free', 'double-free'],
  ['double-free', 'double-free'],
  ['rop', 'rop'],
  ['ret2libc', 'ret2libc'],
  ['栈迁移', 'stack-pivot'],
  ['stack pivot', 'stack-pivot'],
  ['stack-pivot', 'stack-pivot'],
  ['orw', 'orw'],
  ['one_gadget', 'one-gadget'],
  ['one gadget', 'one-gadget'],
  ['one-gadget', 'one-gadget'],
  ['brop', 'brop'],
  ['ret2syscall', 'ret2syscall'],
]);

function normalizeTagKey(value) {
  return cleanString(value)?.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function resolveTag(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return undefined;

  const key = normalizeTagKey(cleaned);
  if (!key) return undefined;
  if (TAG_ALIASES.has(key)) return TAG_ALIASES.get(key);

  return undefined;
}

export function normalizeTags({ tags, extraCandidates = [] } = {}) {
  const diagnostics = [];
  const accepted = [];
  const seen = new Set();
  const rejected = [];

  for (const candidate of [...normalizeArray(tags), ...normalizeArray(extraCandidates)]) {
    const cleaned = cleanString(candidate);
    if (!cleaned) continue;

    const tag = resolveTag(cleaned);
    if (!tag) {
      rejected.push(cleaned);
      continue;
    }

    if (seen.has(tag)) continue;
    seen.add(tag);
    accepted.push(tag);
  }

  const normalized = accepted.slice(0, MAX_TAGS);
  const overflow = accepted.slice(MAX_TAGS);

  if (rejected.length > 0) {
    diagnostics.push({
      type: 'frontmatter-tags',
      severity: 'info',
      message: 'Unrecognized Obsidian tags were not published as site tags.',
      tags: rejected,
    });
  }

  if (overflow.length > 0) {
    diagnostics.push({
      type: 'frontmatter-tags',
      severity: 'info',
      message: `Site tags were limited to ${MAX_TAGS} items; extra tags were omitted.`,
      tags: overflow,
    });
  }

  return { tags: normalized, diagnostics };
}
