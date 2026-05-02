import path from 'node:path';
import { cleanString, normalizeArray, normalizeDateValue } from '../utils.mjs';
import { normalizeTags, resolveTag } from './tags.mjs';

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

function normalizeNullish(value) {
  const cleaned = cleanString(value);
  if (!cleaned || cleaned.toLowerCase() === 'null') return undefined;
  return cleaned;
}

function normalizeDifficulty(value) {
  const cleaned = normalizeNullish(value);
  if (!cleaned) return undefined;

  const starCount = [...cleaned].filter((char) => char === '★').length;
  if (starCount > 0) return Math.max(1, Math.min(5, starCount));

  const digitMatch = cleaned.match(/\d+/);
  if (digitMatch) return Math.max(1, Math.min(5, Number(digitMatch[0])));

  return cleaned;
}

function normalizeMetadataArray(value) {
  return normalizeArray(value).map(normalizeNullish).filter(Boolean);
}

function normalizeControlledArray(value) {
  const items = normalizeMetadataArray(value).map((item) => resolveTag(item) ?? item);
  return items.length > 0 ? [...new Set(items)] : undefined;
}

function buildExtraTagCandidates(frontmatter) {
  return [
    frontmatter.note_type,
    frontmatter['笔记类型'],
    ...normalizeMetadataArray(frontmatter['漏洞类型']),
    ...normalizeMetadataArray(frontmatter['利用技术']),
    ...normalizeMetadataArray(frontmatter['利用路线']),
    ...normalizeMetadataArray(frontmatter['保护机制']),
  ];
}

const MAPPED_KEYS = new Set([
  '比赛',
  '题目',
  '难度',
  '架构',
  '保护机制',
  '漏洞类型',
  '利用技术',
  '利用路线',
  '涉及区域',
  'role',
  '笔记ID',
  '笔记类型',
  '创建时间',
  '阐述日期',
]);

function shouldPreserveEntry(key, value) {
  if (MAPPED_KEYS.has(key)) return false;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned.length > 0 && cleaned.toLowerCase() !== 'null';
  }
  if (Array.isArray(value)) {
    return value.some((item) => normalizeNullish(item));
  }
  return true;
}

export function buildFrontmatter(sourcePath, frontmatter, locale, overrides = {}) {
  const title = cleanString(overrides.title) ?? deriveTitle(frontmatter, sourcePath);
  const noteId = deriveNoteId(frontmatter);
  const createdAt = normalizeDateValue(frontmatter.created_at ?? frontmatter.creation_time ?? frontmatter.createTime);
  const tagResult = normalizeTags({
    tags: frontmatter.tags,
    extraCandidates: buildExtraTagCandidates(frontmatter),
  });

  if (!noteId) throw new Error(`Missing note_id and unable to derive one from created_at: ${sourcePath}`);
  if (!createdAt) throw new Error(`Missing created_at/creation_time/createTime: ${sourcePath}`);

  const normalized = {
    title,
    description: cleanString(overrides.description) ?? deriveDescription(frontmatter, title, locale),
    note_id: noteId,
    note_type: normalizeNullish(frontmatter.note_type ?? frontmatter['笔记类型']),
    created_at: createdAt,
    updated_at: normalizeDateValue(frontmatter.updated_at ?? frontmatter.modify_time),
    tags: tagResult.tags,
    aliases: normalizeArray(frontmatter.aliases),
    cssclasses: normalizeArray(frontmatter.cssclasses),
    graphLevel: normalizeGraphLevelValue(frontmatter.graphLevel ?? frontmatter.role),
    contest: normalizeNullish(frontmatter['比赛']),
    challenge: normalizeNullish(frontmatter['题目']),
    difficulty: normalizeDifficulty(frontmatter['难度']),
    architecture: normalizeNullish(frontmatter['架构']),
    protections: normalizeControlledArray(frontmatter['保护机制']),
    vulnerability: normalizeControlledArray(frontmatter['漏洞类型']),
    techniques: normalizeControlledArray([
      ...normalizeMetadataArray(frontmatter['利用技术']),
      ...normalizeMetadataArray(frontmatter['利用路线']),
    ]),
    affected_area: normalizeControlledArray(frontmatter['涉及区域']),
  };

  return {
    normalized,
    preserved: Object.fromEntries(Object.entries(frontmatter).filter(([key, value]) => shouldPreserveEntry(key, value))),
    diagnostics: tagResult.diagnostics,
  };
}
