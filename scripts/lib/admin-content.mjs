import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { getLangFromId, getSlugFromId } from '../../src/utils/content-id.mjs';
import { getTranslationConfig, shouldTranslate, translateDocument } from './translate.mjs';

const ROOT = process.cwd();
const ADMIN_CACHE_DIR = path.join(ROOT, '.cache', 'admin-dev');
const BLOG_CONTENT_BASE = path.join(ROOT, 'src/content/blog');
const BLOG_CONTENT_GLOB = 'src/content/blog/**/index*.{md,mdx}';
const OBSIDIAN_SOURCE_GLOB = 'src/content/my_md/*.md';
const GRAPH_FILE = path.join(ROOT, 'public/graph.json');
const GRAPH_DIAGNOSTICS_FILE = path.join(ADMIN_CACHE_DIR, 'graph-diagnostics.json');
const GRAPH_PRESETS_FILE = path.join(ROOT, 'src/data/graph-presets.json');
const TRANSLATION_CONFIG_FILE = path.join(ADMIN_CACHE_DIR, 'translation-config.json');

function toEntryId(filePath) {
  return path.relative(BLOG_CONTENT_BASE, filePath).replace(/\.mdx?$/i, '');
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map((item) => String(item)) : [String(value)];
}

function normalizeDate(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildBlogUrl(lang, slug) {
  const suffix = slug ? `/blog/${slug}/` : '/blog/';
  return lang ? `/${lang}${suffix}` : suffix;
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeIfChanged(filePath, content) {
  const existing = await readFileIfExists(filePath);
  if (existing === content) return { changed: false };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return { changed: true };
}

function normalizeGraphLevelInput(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('graphLevel must be a finite number or null.');
  }

  return parsed;
}

async function updateGraphLevelInFile(filePath, graphLevel) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = matter(raw);
  const nextData = { ...parsed.data };
  if (graphLevel === null) {
    delete nextData.graphLevel;
  } else {
    nextData.graphLevel = graphLevel;
  }

  const next = matter.stringify(parsed.content, nextData);
  const normalized = next.endsWith('\n') ? next : `${next}\n`;
  const write = await writeIfChanged(filePath, normalized);
  return {
    filePath,
    relativePath: path.relative(ROOT, filePath),
    changed: write.changed,
  };
}

function toAdminError(error) {
  const message = error instanceof Error ? error.message : String(error);
  let details;
  const jsonMatch = message.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      details = JSON.parse(jsonMatch[0]);
    } catch {
      details = undefined;
    }
  }
  return {
    message,
    details,
    retryAfterSeconds: details?.error?.reset_seconds ?? details?.error?.resets_in_seconds,
    code: details?.error?.code ?? details?.error?.type,
  };
}

export async function scanBlogPosts() {
  const files = await fg(BLOG_CONTENT_GLOB, { absolute: true });
  const entries = await Promise.all(files.map(async (filePath) => {
    const raw = await fs.readFile(filePath, 'utf8');
    const { data } = matter(raw);
    const entryId = toEntryId(filePath);
    const lang = getLangFromId(entryId) ?? null;
    const slug = getSlugFromId(entryId, lang !== null);
    const noteId = data.note_id ? String(data.note_id) : slug;

    return {
      filePath,
      relativePath: path.relative(ROOT, filePath),
      entryId,
      lang: lang ?? 'default',
      slug,
      noteId,
      title: String(data.title ?? slug ?? noteId),
      description: data.description ? String(data.description) : '',
      createdAt: normalizeDate(data.created_at),
      updatedAt: normalizeDate(data.updated_at),
      tags: toArray(data.tags),
      draft: data.draft === true,
      noteType: data.note_type ?? data.type,
      graphLevel: data.graphLevel,
      url: buildBlogUrl(lang, slug),
    };
  }));

  const postsByNoteId = new Map();
  for (const entry of entries) {
    const current = postsByNoteId.get(entry.noteId) ?? {
      noteId: entry.noteId,
      slug: entry.slug,
      title: entry.title,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      tags: [],
      draft: false,
      graphLevel: entry.graphLevel,
      languages: {},
      files: [],
    };
    current.slug = current.slug || entry.slug;
    current.title = current.title || entry.title;
    current.createdAt = current.createdAt ?? entry.createdAt;
    current.updatedAt = current.updatedAt ?? entry.updatedAt;
    current.tags = [...new Set([...current.tags, ...entry.tags])];
    current.draft = current.draft || entry.draft;
    current.graphLevel = current.graphLevel ?? entry.graphLevel;
    current.languages[entry.lang] = {
      title: entry.title,
      url: entry.url,
      relativePath: entry.relativePath,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      draft: entry.draft,
    };
    current.files.push(entry.relativePath);
    postsByNoteId.set(entry.noteId, current);
  }

  const posts = [...postsByNoteId.values()].sort((first, second) => {
    const firstTime = Date.parse(first.createdAt ?? '') || 0;
    const secondTime = Date.parse(second.createdAt ?? '') || 0;
    return secondTime - firstTime;
  });
  const tagSet = new Set(posts.flatMap((post) => post.tags));
  const missingEnglish = posts.filter((post) => !post.languages.en).length;

  return {
    posts,
    entries,
    summary: {
      posts: posts.length,
      entries: entries.length,
      zhCn: entries.filter((entry) => entry.lang === 'zh-cn').length,
      en: entries.filter((entry) => entry.lang === 'en').length,
      missingEnglish,
      drafts: posts.filter((post) => post.draft).length,
      tags: tagSet.size,
      graphLevel: posts.filter((post) => post.graphLevel !== undefined && post.graphLevel !== null).length,
    },
  };
}

export async function updateBlogPostGraphLevel({ noteId, graphLevel } = {}) {
  const targetNoteId = String(noteId ?? '').trim();
  if (!targetNoteId) {
    throw new Error('noteId is required.');
  }

  const nextGraphLevel = normalizeGraphLevelInput(graphLevel);
  const blogFiles = await fg(BLOG_CONTENT_GLOB, { absolute: true });
  const matchedBlogFiles = [];

  for (const filePath of blogFiles) {
    const raw = await fs.readFile(filePath, 'utf8');
    const { data } = matter(raw);
    const entryId = toEntryId(filePath);
    const lang = getLangFromId(entryId) ?? null;
    const slug = getSlugFromId(entryId, lang !== null);
    const currentNoteId = data.note_id ? String(data.note_id) : slug;
    if (currentNoteId === targetNoteId) {
      matchedBlogFiles.push(filePath);
    }
  }

  if (matchedBlogFiles.length === 0) {
    throw new Error(`No blog content found for note_id: ${targetNoteId}`);
  }

  const blogUpdates = [];
  for (const filePath of matchedBlogFiles) {
    blogUpdates.push(await updateGraphLevelInFile(filePath, nextGraphLevel));
  }

  const sourceUpdates = [];
  const sourceFiles = await fg(OBSIDIAN_SOURCE_GLOB, { absolute: true });
  for (const filePath of sourceFiles) {
    const raw = await fs.readFile(filePath, 'utf8');
    const { data } = matter(raw);
    if (data.note_id && String(data.note_id) === targetNoteId) {
      sourceUpdates.push(await updateGraphLevelInFile(filePath, nextGraphLevel));
    }
  }

  return {
    noteId: targetNoteId,
    graphLevel: nextGraphLevel,
    updated: [...blogUpdates, ...sourceUpdates],
    changed: [...blogUpdates, ...sourceUpdates].some((item) => item.changed),
  };
}

function translationConfigToEnv(config = {}) {
  return {
    ...(config.baseUrl ? { OBSIDIAN_LLM_BASE_URL: normalizeOpenAiBaseUrl(config.baseUrl) } : {}),
    ...(config.apiKey ? { OBSIDIAN_LLM_API_KEY: String(config.apiKey) } : {}),
    ...(config.model !== undefined ? { OBSIDIAN_LLM_MODEL: String(config.model) } : {}),
    ...(config.translateEnabled !== undefined ? { OBSIDIAN_TRANSLATE: config.translateEnabled ? 'true' : 'false' } : {}),
    ...(config.translateInDev !== undefined ? { OBSIDIAN_TRANSLATE_IN_DEV: config.translateInDev ? 'true' : 'false' } : {}),
    ...(config.forceRetranslate !== undefined ? { OBSIDIAN_FORCE_RETRANSLATE: config.forceRetranslate ? 'true' : 'false' } : {}),
    ...(Array.isArray(config.targetLocales) ? { OBSIDIAN_TRANSLATION_TARGET_LOCALES: config.targetLocales.join(',') } : {}),
  };
}

function normalizeOpenAiBaseUrl(value) {
  const raw = String(value ?? '').trim().replace(/\/+$/g, '');
  if (!raw) return raw;

  try {
    const url = new URL(raw);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/v1';
      return url.toString().replace(/\/+$/g, '');
    }
    return raw;
  } catch {
    return raw.endsWith('/v1') ? raw : `${raw}/v1`;
  }
}

export async function readAdminTranslationConfig() {
  const saved = await readJsonFile(TRANSLATION_CONFIG_FILE, {});
  const envConfig = getTranslationConfig({ ...process.env, ...translationConfigToEnv(saved) });
  return {
    file: TRANSLATION_CONFIG_FILE,
    relativeFile: path.relative(ROOT, TRANSLATION_CONFIG_FILE),
    config: envConfig,
    saved,
  };
}

export async function writeAdminTranslationConfig(config) {
  const normalized = {
    baseUrl: normalizeOpenAiBaseUrl(config.baseUrl),
    apiKey: String(config.apiKey ?? '').trim(),
    model: String(config.model ?? '').trim(),
    translateEnabled: Boolean(config.translateEnabled),
    translateInDev: Boolean(config.translateInDev),
    forceRetranslate: Boolean(config.forceRetranslate),
    targetLocales: Array.isArray(config.targetLocales)
      ? config.targetLocales.map((locale) => String(locale).trim().toLowerCase()).filter(Boolean)
      : String(config.targetLocales ?? 'en').split(',').map((locale) => locale.trim().toLowerCase()).filter(Boolean),
  };
  await writeJsonFile(TRANSLATION_CONFIG_FILE, normalized);
  return readAdminTranslationConfig();
}

export async function withAdminTranslationEnv(overrides, callback) {
  const { saved } = await readAdminTranslationConfig();
  const envPatch = translationConfigToEnv({ ...saved, ...overrides });
  const keys = Object.keys(envPatch);
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envPatch)) process.env[key] = value;
  try {
    return await callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

export async function translateMissingEnglishPosts({ noteIds } = {}) {
  const { posts } = await scanBlogPosts();
  const noteIdSet = new Set((Array.isArray(noteIds) ? noteIds : []).map((noteId) => String(noteId)));
  const targets = posts.filter((post) => {
    if (noteIdSet.size > 0 && !noteIdSet.has(post.noteId)) return false;
    return post.languages?.['zh-cn'] && !post.languages?.en;
  });
  const config = getTranslationConfig();
  const results = [];

  if (!shouldTranslate({ config, context: 'dev', targetLocale: 'en' })) {
    return {
      results: targets.map((post) => ({
        noteId: post.noteId,
        title: post.title,
        skipped: true,
        error: { message: 'LLM translation is disabled for dev context or target locale en.' },
      })),
      summary: { total: targets.length, translated: 0, skipped: targets.length, failed: 0, written: 0 },
      translationConfig: config,
    };
  }

  for (const post of targets) {
    const zhPath = path.join(ROOT, post.languages['zh-cn'].relativePath);
    const outputFile = path.join(path.dirname(zhPath), 'index_en.mdx');
    try {
      const raw = await fs.readFile(zhPath, 'utf8');
      const { data, content } = matter(raw);
      const translated = await translateDocument({
        config,
        sourceLocale: 'zh-cn',
        targetLocale: 'en',
        title: String(data.title ?? post.title),
        description: String(data.description ?? post.description ?? ''),
        content,
      });
      const serialized = matter.stringify(`${translated.content.trim()}\n`, {
        ...data,
        title: translated.title,
        description: translated.description,
      });
      const write = await writeIfChanged(outputFile, serialized.endsWith('\n') ? serialized : `${serialized}\n`);
      results.push({
        noteId: post.noteId,
        title: post.title,
        output: outputFile,
        relativeOutput: path.relative(ROOT, outputFile),
        translated: true,
        changed: write.changed,
      });
    } catch (error) {
      results.push({
        noteId: post.noteId,
        title: post.title,
        output: outputFile,
        translated: false,
        changed: false,
        error: toAdminError(error),
      });
    }
  }

  return {
    results,
    summary: {
      total: results.length,
      translated: results.filter((result) => result.translated).length,
      skipped: results.filter((result) => result.skipped).length,
      failed: results.filter((result) => result.error).length,
      written: results.filter((result) => result.changed).length,
    },
    translationConfig: config,
  };
}

export async function readGraphSnapshot() {
  const graph = await readJsonFile(GRAPH_FILE, { generatedAt: null, nodes: [], links: [], missing: [] });
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const links = Array.isArray(graph.links) ? graph.links : [];
  const missing = Array.isArray(graph.missing) ? graph.missing : [];
  const typeCounts = Object.fromEntries([...nodes.reduce((map, node) => {
    const key = node.type || 'unknown';
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map()).entries()].sort((a, b) => b[1] - a[1]));
  const graphLevelCounts = Object.fromEntries([...nodes.reduce((map, node) => {
    const key = node.graphLevel ?? 'unset';
    map.set(String(key), (map.get(String(key)) ?? 0) + 1);
    return map;
  }, new Map()).entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

  return {
    file: path.relative(ROOT, GRAPH_FILE),
    generatedAt: graph.generatedAt,
    nodes,
    links,
    missing,
    summary: {
      nodes: nodes.length,
      links: links.length,
      missing: missing.length,
      types: typeCounts,
      graphLevels: graphLevelCounts,
    },
  };
}

export async function readGraphDiagnostics() {
  return readJsonFile(GRAPH_DIAGNOSTICS_FILE, { runs: [] });
}

export async function recordGraphDiagnostics({ graph, stdout = '', stderr = '' } = {}) {
  const snapshot = graph ?? await readGraphSnapshot();
  const diagnostics = await readGraphDiagnostics();
  const runs = Array.isArray(diagnostics.runs) ? diagnostics.runs : [];
  runs.unshift({
    createdAt: new Date().toISOString(),
    generatedAt: snapshot.generatedAt,
    nodes: snapshot.summary.nodes,
    links: snapshot.summary.links,
    missing: snapshot.summary.missing,
    missingItems: snapshot.missing,
    stdout,
    stderr,
  });
  const next = { runs: runs.slice(0, 30) };
  await writeJsonFile(GRAPH_DIAGNOSTICS_FILE, next);
  return next;
}

function normalizePreset(preset, index) {
  const id = String(preset.id ?? '').trim();
  const name = String(preset.name ?? '').trim();
  if (!id) throw new Error(`Graph preset #${index + 1} is missing id.`);
  if (!name) throw new Error(`Graph preset ${id} is missing name.`);
  return {
    id,
    name,
    ...(preset.description ? { description: String(preset.description) } : {}),
    version: Number.isFinite(Number(preset.version)) ? Number(preset.version) : 1,
    builtin: preset.builtin !== false,
    layout: preset.layout && typeof preset.layout === 'object' ? preset.layout : {},
    appearance: preset.appearance && typeof preset.appearance === 'object' ? preset.appearance : {},
    forces: preset.forces && typeof preset.forces === 'object' ? preset.forces : {},
    ...(preset.filters && typeof preset.filters === 'object' ? { filters: preset.filters } : {}),
    ...(preset.createdAt ? { createdAt: String(preset.createdAt) } : {}),
    ...(preset.updatedAt ? { updatedAt: String(preset.updatedAt) } : {}),
  };
}

export async function readGraphPresets() {
  const presets = await readJsonFile(GRAPH_PRESETS_FILE, []);
  return {
    file: path.relative(ROOT, GRAPH_PRESETS_FILE),
    presets: Array.isArray(presets) ? presets.map(normalizePreset) : [],
  };
}

export async function writeGraphPresets(presets) {
  const normalized = Array.isArray(presets) ? presets.map(normalizePreset) : [];
  await writeJsonFile(GRAPH_PRESETS_FILE, normalized);
  return readGraphPresets();
}
