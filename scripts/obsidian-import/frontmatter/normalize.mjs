import path from 'node:path';
import { cleanString, normalizeArray, normalizeDateValue } from '../utils.mjs';

function sanitizeNoteId(value) {
  const stringValue = cleanString(value);
  return stringValue ? stringValue.replace(/\s+/g, '') : undefined;
}

function normalizeGraphLevelValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(10, value));
  }

  const stringValue = cleanString(value);
  if (!stringValue) return undefined;

  const digitMatch = stringValue.match(/(\d{1,2})/);
  if (digitMatch) return Math.max(0, Math.min(10, Number(digitMatch[1])));

  const normalized = stringValue.replace(/\s+/g, '');
  const explicitMap = new Map([
    ['根节点', 0],
    ['零级节点', 0],
    ['一级节点', 1],
    ['二级节点', 2],
    ['三级节点', 3],
    ['四级节点', 4],
    ['五级节点', 5],
    ['六级节点', 6],
    ['七级节点', 7],
    ['八级节点', 8],
    ['九级节点', 9],
    ['十级节点', 10],
  ]);

  return explicitMap.get(normalized);
}

function deriveNoteId(frontmatter) {
  const explicitId = sanitizeNoteId(frontmatter.note_id ?? frontmatter['笔记ID']);
  if (explicitId) return explicitId;

  const createdAt = normalizeDateValue(frontmatter.created_at ?? frontmatter.creation_time ?? frontmatter.createTime);
  if (!createdAt) return undefined;

  const digits = createdAt.replace(/\D/g, '');
  return digits || undefined;
}

function deriveTitle(frontmatter, filePath) {
  return cleanString(frontmatter.title) ?? path.basename(filePath, path.extname(filePath));
}

function deriveDescription(frontmatter, title, locale) {
  const rawDescription = cleanString(frontmatter.description);
  if (rawDescription && rawDescription.toLowerCase() !== 'null') return rawDescription;
  return locale === 'en' ? `Imported note for ${title}` : `${title} 的导入笔记`;
}

export function buildFrontmatter(sourcePath, frontmatter, locale, overrides = {}) {
  const title = cleanString(overrides.title) ?? deriveTitle(frontmatter, sourcePath);
  const noteId = deriveNoteId(frontmatter);
  const createdAt = normalizeDateValue(frontmatter.created_at ?? frontmatter.creation_time ?? frontmatter.createTime);

  if (!noteId) throw new Error(`Missing note_id and unable to derive one from created_at: ${sourcePath}`);
  if (!createdAt) throw new Error(`Missing created_at/creation_time/createTime: ${sourcePath}`);

  return {
    normalized: {
      title,
      description: cleanString(overrides.description) ?? deriveDescription(frontmatter, title, locale),
      note_id: noteId,
      note_type: cleanString(frontmatter.note_type ?? frontmatter['笔记类型']),
      created_at: createdAt,
      updated_at: normalizeDateValue(frontmatter.updated_at ?? frontmatter.modify_time),
      tags: normalizeArray(frontmatter.tags),
      aliases: normalizeArray(frontmatter.aliases),
      cssclasses: normalizeArray(frontmatter.cssclasses),
      graphLevel: normalizeGraphLevelValue(frontmatter.graphLevel ?? frontmatter.role),
    },
    preserved: Object.fromEntries(Object.entries(frontmatter).filter(([key]) => key !== 'role')),
  };
}
