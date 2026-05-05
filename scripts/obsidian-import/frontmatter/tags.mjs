import { cleanString, normalizeArray } from '../utils.mjs';

const MAX_TAGS = 5;

const TAG_ALIASES = new Map([
  ['复盘', 'writeup'],
  ['wp', 'writeup'],
  ['writeup', 'writeup'],
  ['write-up', 'writeup'],
  ['题解', 'writeup'],
  ['pwn', 'pwn'],
  ['web', 'web'],
  ['rev', 'rev'],
  ['reverse', 'rev'],
  ['re', 'rev'],
  ['逆向', 'rev'],
  ['crypto', 'crypto'],
  ['密码', 'crypto'],
  ['密码学', 'crypto'],
  ['misc', 'misc'],
  ['杂项', 'misc'],
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

const TAG_PRIORITY = new Map([
  ['writeup', 0],
  ['pwn', 1],
  ['web', 1],
  ['rev', 1],
  ['crypto', 1],
  ['misc', 1],
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

  const prioritized = [...accepted].sort((left, right) => {
    const leftPriority = TAG_PRIORITY.get(left) ?? 10;
    const rightPriority = TAG_PRIORITY.get(right) ?? 10;
    return leftPriority - rightPriority;
  });
  const normalized = prioritized.slice(0, MAX_TAGS);
  const overflow = prioritized.slice(MAX_TAGS);

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
