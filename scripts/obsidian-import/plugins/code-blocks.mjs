const LANGUAGE_ALIASES = new Map([
  ['ida', 'cpp'],
  ['ida-c', 'cpp'],
  ['ida-cpp', 'cpp'],
  ['pseudocode', 'cpp'],
  ['pseudo-c', 'cpp'],
  ['pseudo-cpp', 'cpp'],
  ['ida-asm', 'asm'],
  ['disasm', 'asm'],
  ['disassembly', 'asm'],
  ['assembly', 'asm'],
  ['pwndbg', 'txt'],
  ['gdb', 'txt'],
  ['hex', 'txt'],
  ['hexdump', 'txt'],
  ['plain', 'txt'],
  ['text', 'txt'],
  ['txet', 'txt'],
]);

const KNOWN_FLAG_PROPS = new Set([
  'showLineNumbers',
  'wrap',
]);

const KNOWN_VALUE_PROPS = new Set([
  'title',
  'startLineNumber',
  'ins',
  'del',
  'mark',
]);

function normalizeLanguage(rawLanguage) {
  const language = String(rawLanguage ?? '').trim();
  if (!language) return '';
  return LANGUAGE_ALIASES.get(language.toLowerCase()) ?? language;
}

function splitMeta(meta) {
  const tokens = [];
  const pattern = /[A-Za-z][\w-]*="(?:\\.|[^"\\])*"|[A-Za-z][\w-]*='(?:\\.|[^'\\])*'|[A-Za-z][\w-]*=\{[^}]+\}|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\{[^}]+\}|\S+/g;
  let match;
  while ((match = pattern.exec(meta)) !== null) tokens.push(match[0]);
  return tokens;
}

function isLineRange(value) {
  return /^\{\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*\}$/.test(value);
}

function classifyMetaToken(token) {
  if (isLineRange(token)) return { known: true };
  if (KNOWN_FLAG_PROPS.has(token)) return { known: true };

  const assignment = token.match(/^([A-Za-z][\w-]*)=(.+)$/);
  if (!assignment) return { known: false };

  const [, key, value] = assignment;
  if (!KNOWN_VALUE_PROPS.has(key)) return { known: false };
  if ((key === 'ins' || key === 'del' || key === 'mark') && !isLineRange(value)) return { known: false };
  if (key === 'startLineNumber' && !/^\d+$/.test(value)) return { known: false };
  return { known: true };
}

function normalizeFenceOpening(opening, diagnostics) {
  const match = opening.match(/^(\s*`{3,})([^`\s]*)\s*([^`]*)$/);
  if (!match) return opening;

  const [, fence, rawLanguage, rawMeta] = match;
  const normalizedLanguage = normalizeLanguage(rawLanguage);
  const metaTokens = splitMeta(rawMeta.trim());
  const unknownTokens = metaTokens.filter((token) => !classifyMetaToken(token).known);

  if (rawLanguage && normalizedLanguage !== rawLanguage) {
    diagnostics.push({
      type: 'code-block',
      severity: 'info',
      message: `Code block language normalized from ${rawLanguage} to ${normalizedLanguage}.`,
      from: rawLanguage,
      to: normalizedLanguage,
    });
  }

  for (const token of unknownTokens) {
    diagnostics.push({
      type: 'code-block',
      severity: 'warning',
      message: 'Unknown Expressive Code meta option preserved.',
      language: normalizedLanguage || rawLanguage,
      meta: token,
    });
  }

  const info = [normalizedLanguage, metaTokens.join(' ')].filter(Boolean).join(' ');
  return info ? `${fence}${info}` : fence;
}

function stripPasteArtifactLine(line, diagnostics) {
  const trimmed = line.trim();
  if (/^\[Pasted\s+~?\d+\s+lines?\]$/i.test(trimmed) || /^[A-Za-z]?\s*~\d+\s+lines?\]$/i.test(trimmed)) {
    diagnostics.push({
      type: 'code-block',
      severity: 'info',
      message: 'Removed Obsidian paste artifact line.',
      value: trimmed,
    });
    return '';
  }
  return line;
}

export function transformCodeBlocks(content) {
  const diagnostics = [];
  const lines = content.split('\n');
  const output = [];
  let inFence = false;
  let fenceMarker = '';

  for (const line of lines) {
    const opening = line.match(/^\s*(`{3,})(.*)$/);
    if (opening && !inFence) {
      inFence = true;
      fenceMarker = opening[1];
      output.push(normalizeFenceOpening(line, diagnostics));
      continue;
    }

    if (inFence && line.trim() === fenceMarker) {
      inFence = false;
      fenceMarker = '';
      output.push(line);
      continue;
    }

    output.push(inFence ? line : stripPasteArtifactLine(line, diagnostics));
  }

  return { content: output.join('\n'), diagnostics };
}
