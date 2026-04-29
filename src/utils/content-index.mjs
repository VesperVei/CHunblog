import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { getLangFromId, getSlugFromId } from './content-id.mjs';
import { normalizeWikiTarget } from './wiki.mjs';

const BLOG_CONTENT_GLOB = 'src/content/blog/**/index*.{md,mdx}';
const BLOG_CONTENT_BASE = path.join(process.cwd(), 'src/content/blog');
const DEFAULT_LOCALE = 'en';
const PREFERRED_LOCALES = ['en', 'zh-cn'];
const NODE_METADATA_EXCLUDE_KEYS = new Set([
  'title',
  'description',
  'note_id',
  'note_type',
  'created_at',
  'updated_at',
  'tags',
  'aliases',
  'cssclasses',
  'author',
  'type',
  'draft',
  'toc',
  'toc_inline',
  'toc_depth',
  'comment',
  'archive',
  'trigger',
  'disclaimer',
  'heroImage',
]);

function toEntryId(filePath) {
  const relativePath = path.relative(BLOG_CONTENT_BASE, filePath);
  return relativePath.replace(/\.mdx?$/i, '');
}

function toArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  return [String(value)];
}

function buildLocalizedBlogUrl(lang, slug) {
  const suffix = slug ? `/blog/${slug}/` : '/blog/';
  return lang ? `/${lang}${suffix}` : suffix;
}

function preferredLocaleEntry(entriesByLocale, preferredLang) {
  if (preferredLang && entriesByLocale[preferredLang]) {
    return entriesByLocale[preferredLang];
  }

  for (const locale of PREFERRED_LOCALES) {
    if (entriesByLocale[locale]) {
      return entriesByLocale[locale];
    }
  }

  return Object.values(entriesByLocale)[0];
}

function indexTarget(map, rawKey, noteId) {
  if (!rawKey) {
    return;
  }

  const key = normalizeWikiTarget(rawKey);
  if (!key) {
    return;
  }

  const existing = map.get(key) ?? new Set();
  existing.add(noteId);
  map.set(key, existing);
}

function extractNodeMetadata(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !NODE_METADATA_EXCLUDE_KEYS.has(key)),
  );
}

function normalizeGraphLevel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export async function buildContentIndex() {
  const files = await fg(BLOG_CONTENT_GLOB, { absolute: true });
  const entries = [];
  const warnings = [];

  for (const filePath of files) {
    const source = await fs.readFile(filePath, 'utf8');
    const { data, content } = matter(source);

    if (data.draft === true) {
      continue;
    }

    const entryId = toEntryId(filePath);
    const lang = getLangFromId(entryId) ?? null;
    const slug = getSlugFromId(entryId, lang !== null);
    const noteId = data.note_id ? String(data.note_id) : null;

    if (!noteId) {
      continue;
    }

    entries.push({
      filePath,
      entryId,
      lang,
      slug,
      noteId,
      data,
      content,
      url: buildLocalizedBlogUrl(lang, slug),
    });
  }

  const nodesById = new Map();
  const aliasIndex = new Map();
  const titleIndex = new Map();

  for (const entry of entries) {
    const aliases = toArray(entry.data.aliases);
    const tags = toArray(entry.data.tags);
    const langKey = entry.lang ?? DEFAULT_LOCALE;
    const metadata = extractNodeMetadata(entry.data);
    const graphLevel = normalizeGraphLevel(entry.data.graphLevel);
    const existingNode = nodesById.get(entry.noteId) ?? {
      id: entry.noteId,
      title: entry.data.title || entry.slug || entry.noteId,
      titles: {},
      url: entry.url,
      urls: {},
      createdAt: entry.data.created_at,
      updatedAt: entry.data.updated_at,
      tags,
      type: entry.data.note_type || entry.data.type || 'blog_post',
      lang: langKey,
      aliases,
      role: typeof entry.data.role === 'string' ? entry.data.role : undefined,
      graphLevel,
      metadata,
      entriesByLocale: {},
    };

    existingNode.urls[langKey] = entry.url;
    existingNode.titles[langKey] = entry.data.title || existingNode.titles[langKey] || existingNode.title;
    existingNode.entriesByLocale[langKey] = entry;
    existingNode.createdAt = existingNode.createdAt ?? entry.data.created_at;
    existingNode.updatedAt = existingNode.updatedAt ?? entry.data.updated_at;
    existingNode.tags = [...new Set([...(existingNode.tags ?? []), ...tags])];
    existingNode.aliases = [...new Set([...(existingNode.aliases ?? []), ...aliases])];
    existingNode.role = existingNode.role || (typeof entry.data.role === 'string' ? entry.data.role : undefined);
    existingNode.graphLevel = existingNode.graphLevel ?? graphLevel;
    existingNode.metadata = { ...(existingNode.metadata ?? {}), ...metadata };

    nodesById.set(entry.noteId, existingNode);
  }

  for (const node of nodesById.values()) {
    const preferred = preferredLocaleEntry(node.entriesByLocale, DEFAULT_LOCALE);
    if (preferred) {
      node.title = preferred.data.title || node.title;
      node.url = preferred.url;
      node.lang = preferred.lang ?? DEFAULT_LOCALE;
      node.type = preferred.data.note_type || preferred.data.type || node.type;
      node.createdAt = preferred.data.created_at ?? node.createdAt;
      node.updatedAt = preferred.data.updated_at ?? node.updatedAt;
    }

    indexTarget(aliasIndex, node.id, node.id);
    indexTarget(titleIndex, node.title, node.id);

    for (const alias of node.aliases) {
      indexTarget(aliasIndex, alias, node.id);
    }
  }

  function resolveWikiTarget(target, preferredLang) {
    const normalizedTarget = normalizeWikiTarget(target);
    const candidateIds = [
      ...(aliasIndex.get(normalizedTarget) ?? []),
      ...(titleIndex.get(normalizedTarget) ?? []),
    ];
    const uniqueIds = [...new Set(candidateIds)];

    if (uniqueIds.length === 0) {
      return {
        status: 'missing',
        normalizedTarget,
        reason: 'not_found',
      };
    }

    if (uniqueIds.length > 1) {
      warnings.push(`[content-index] Ambiguous wikilink target: ${target} -> ${uniqueIds.join(', ')}`);
      return {
        status: 'ambiguous',
        normalizedTarget,
        reason: 'ambiguous',
        candidates: uniqueIds,
      };
    }

    const noteId = uniqueIds[0];
    const node = nodesById.get(noteId);
    if (!node) {
      return {
        status: 'missing',
        normalizedTarget,
        reason: 'not_found',
      };
    }

    return {
      status: 'resolved',
      normalizedTarget,
      noteId,
      node,
      url: getCanonicalUrlForNoteId(noteId, preferredLang),
      title: getLocalizedTitleForNoteId(noteId, preferredLang),
    };
  }

  function getCanonicalUrlForNoteId(noteId, preferredLang) {
    const node = nodesById.get(noteId);
    if (!node) {
      return null;
    }

    if (preferredLang && node.urls[preferredLang]) {
      return node.urls[preferredLang];
    }

    return preferredLocaleEntry(node.entriesByLocale, DEFAULT_LOCALE)?.url ?? node.url;
  }

  function getLocalizedTitleForNoteId(noteId, preferredLang) {
    const node = nodesById.get(noteId);
    if (!node) {
      return null;
    }

    if (preferredLang && node.titles[preferredLang]) {
      return node.titles[preferredLang];
    }

    return node.titles[DEFAULT_LOCALE] ?? node.title;
  }

  return {
    entries,
    nodesById,
    aliasIndex,
    titleIndex,
    warnings,
    resolveWikiTarget,
    getCanonicalUrlForNoteId,
    getLocalizedTitleForNoteId,
  };
}
