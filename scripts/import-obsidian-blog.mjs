import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { getTranslationConfig, shouldTranslate, translateDocument } from './lib/translate.mjs';

const SOURCE_GLOB = 'src/content/my_md/*.md';
const TARGET_DIR = path.join(process.cwd(), 'src/content/blog');
const CACHE_DIR = path.join(process.cwd(), '.cache', 'obsidian-import');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');
const IMPORT_CONTEXT = process.env.OBSIDIAN_IMPORT_CONTEXT ?? 'build';
const SOURCE_LOCALE = 'zh-cn';
const CACHE_VERSION = 1;

function cleanString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : undefined;
}

function normalizeDateValue(value) {
  const stringValue = cleanString(value);
  return stringValue || undefined;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const stringValue = cleanString(value);
  return stringValue ? [stringValue] : [];
}

function sanitizeNoteId(value) {
  const stringValue = cleanString(value);
  if (!stringValue) {
    return undefined;
  }

  return stringValue.replace(/\s+/g, '');
}

function normalizeGraphLevelValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(10, value));
  }

  const stringValue = cleanString(value);
  if (!stringValue) {
    return undefined;
  }

  const digitMatch = stringValue.match(/(\d{1,2})/);
  if (digitMatch) {
    return Math.max(0, Math.min(10, Number(digitMatch[1])));
  }

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
  if (explicitId) {
    return explicitId;
  }

  const createdAt = normalizeDateValue(frontmatter.created_at ?? frontmatter.creation_time ?? frontmatter.createTime);
  if (!createdAt) {
    return undefined;
  }

  const digits = createdAt.replace(/\D/g, '');
  return digits || undefined;
}

function deriveTitle(frontmatter, filePath) {
  const explicitTitle = cleanString(frontmatter.title);
  if (explicitTitle) {
    return explicitTitle;
  }

  return path.basename(filePath, path.extname(filePath));
}

function deriveDescription(frontmatter, title, locale) {
  const rawDescription = cleanString(frontmatter.description);
  if (rawDescription && rawDescription.toLowerCase() !== 'null') {
    return rawDescription;
  }

  return locale === 'en' ? `Imported note for ${title}` : `${title} 的导入笔记`;
}

function transformMetaBindEmbeds(markdown) {
  return markdown.replace(/```meta-bind-embed[\s\S]*?```\n*/g, '');
}

function transformDataviewBlocks(markdown, locale) {
  const message = locale === 'en'
    ? '> [!note]\n> The Dataview query from the original note is not executed on the site yet. Replace it with a static list or graph entry later.'
    : '> [!note]\n> 原始笔记中的 Dataview 查询未在网站端执行，后续可改为静态列表或图谱入口。';
  return markdown.replace(/```dataview[\s\S]*?```/g, message);
}

function stripHtmlComments(markdown) {
  return markdown.replace(/<!--([\s\S]*?)-->/g, '');
}

function normalizeCodeFenceLanguages(markdown) {
  return markdown
    .replace(/```pwndbg\b/g, '```txt')
    .replace(/```IDA\b/g, '```txt');
}

function injectRelationshipNotice(markdown, rawLinkField, locale) {
  const links = normalizeArray(rawLinkField);
  if (links.length === 0) {
    return markdown;
  }

  const label = locale === 'en' ? 'Related entry' : '关联入口';
  const block = [
    '> [!note]',
    ...links.map((link) => `> ${label}：${link}`),
    '',
  ].join('\n');

  return `${block}${markdown}`;
}

function buildFrontmatter(sourcePath, frontmatter, locale, overrides = {}) {
  const title = cleanString(overrides.title) ?? deriveTitle(frontmatter, sourcePath);
  const noteId = deriveNoteId(frontmatter);
  const createdAt = normalizeDateValue(frontmatter.created_at ?? frontmatter.creation_time ?? frontmatter.createTime);

  if (!noteId) {
    throw new Error(`Missing note_id and unable to derive one from created_at: ${sourcePath}`);
  }

  if (!createdAt) {
    throw new Error(`Missing created_at/creation_time/createTime: ${sourcePath}`);
  }

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

function serializeScalar(value) {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  return JSON.stringify(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function serializeYamlEntry(key, value, indent = 0) {
  const padding = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${padding}${key}: []`];
    }

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
    if (entries.length === 0) {
      return [`${padding}${key}: {}`];
    }

    const lines = [`${padding}${key}:`];
    for (const [nestedKey, nestedValue] of entries) {
      lines.push(...serializeYamlEntry(nestedKey, nestedValue, indent + 2));
    }
    return lines;
  }

  return [`${padding}${key}: ${serializeScalar(value)}`];
}

function serializeFrontmatter(normalized, preserved) {
  const lines = ['---'];

  for (const [key, value] of Object.entries(normalized)) {
    if (value === undefined) {
      continue;
    }
    lines.push(...serializeYamlEntry(key, value));
  }

  const normalizedKeys = new Set(Object.keys(normalized));
  for (const [key, value] of Object.entries(preserved)) {
    if (normalizedKeys.has(key)) {
      continue;
    }

    lines.push(...serializeYamlEntry(key, value));
  }

  lines.push('---', '');
  return lines.join('\n');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.version !== CACHE_VERSION || typeof parsed.documents !== 'object' || !parsed.documents) {
      return { version: CACHE_VERSION, documents: {} };
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: CACHE_VERSION, documents: {} };
    }
    throw error;
  }
}

async function saveCache(cache) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function writeIfChanged(filePath, content) {
  const existing = await readFileIfExists(filePath);
  if (existing === content) {
    return { changed: false, hash: sha256(content) };
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return { changed: true, hash: sha256(content) };
}

function buildSourceDocument(filePath, data, content) {
  const { normalized, preserved } = buildFrontmatter(filePath, data, SOURCE_LOCALE);
  let transformedContent = content;
  transformedContent = transformMetaBindEmbeds(transformedContent);
  transformedContent = transformDataviewBlocks(transformedContent, SOURCE_LOCALE);
  transformedContent = stripHtmlComments(transformedContent);
  transformedContent = normalizeCodeFenceLanguages(transformedContent);
  transformedContent = injectRelationshipNotice(transformedContent.trimStart(), data.Link, SOURCE_LOCALE);

  return {
    noteId: normalized.note_id,
    frontmatter: { normalized, preserved },
    content: transformedContent.trim(),
  };
}

function buildLocalizedDocument({ sourcePath, sourceFrontmatter, noteId, locale, title, description, content }) {
  const { normalized, preserved } = buildFrontmatter(sourcePath, sourceFrontmatter, locale, {
    title,
    description,
  });

  normalized.note_id = noteId;
  const outputFile = path.join(TARGET_DIR, noteId, `index_${locale}.mdx`);
  const serialized = `${serializeFrontmatter(normalized, preserved)}${content.trim()}\n`;

  return {
    locale,
    noteId,
    outputFile,
    serialized,
    frontmatter: normalized,
    content: content.trim(),
  };
}

function getCachedTranslation(cacheEntry, locale, translationConfig, sourceHash) {
  const translationEntry = cacheEntry?.translations?.[locale];
  if (!translationEntry) {
    return null;
  }

  if (translationConfig.forceRetranslate) {
    return null;
  }

  if (translationEntry.sourceHash !== sourceHash) {
    return null;
  }

  if (translationConfig.model && translationEntry.model !== translationConfig.model) {
    return null;
  }

  if (!translationEntry.title || !translationEntry.description || !translationEntry.content) {
    return null;
  }

  return {
    title: translationEntry.title,
    description: translationEntry.description,
    content: translationEntry.content,
  };
}

async function importOne(filePath, cache, translationConfig) {
  const rawSource = await fs.readFile(filePath, 'utf8');
  const sourceHash = sha256(rawSource);
  const { data, content } = matter(rawSource);
  const sourceDocument = buildSourceDocument(filePath, data, content);
  const cacheEntry = cache.documents[sourceDocument.noteId] ?? { translations: {} };

  const zhDocument = buildLocalizedDocument({
    sourcePath: filePath,
    sourceFrontmatter: data,
    noteId: sourceDocument.noteId,
    locale: SOURCE_LOCALE,
    title: sourceDocument.frontmatter.normalized.title,
    description: sourceDocument.frontmatter.normalized.description,
    content: sourceDocument.content,
  });
  const zhWrite = await writeIfChanged(zhDocument.outputFile, zhDocument.serialized);

  const localeResults = [{
    locale: SOURCE_LOCALE,
    output: zhDocument.outputFile,
    changed: zhWrite.changed,
    translated: false,
    cached: cacheEntry.sourceHash === sourceHash,
  }];

  cache.documents[sourceDocument.noteId] = {
    ...cacheEntry,
    sourcePath: filePath,
    sourceHash,
    zh: {
      outputPath: zhDocument.outputFile,
      outputHash: zhWrite.hash,
    },
    translations: cacheEntry.translations ?? {},
  };

  for (const locale of translationConfig.targetLocales) {
    if (locale === SOURCE_LOCALE) {
      continue;
    }

    const canTranslateNow = shouldTranslate({ config: translationConfig, context: IMPORT_CONTEXT, targetLocale: locale });
    let translated = getCachedTranslation(cache.documents[sourceDocument.noteId], locale, translationConfig, sourceHash);
    let translatedNow = false;

    if (!translated && canTranslateNow) {
      translated = await translateDocument({
        config: translationConfig,
        sourceLocale: SOURCE_LOCALE,
        targetLocale: locale,
        title: sourceDocument.frontmatter.normalized.title,
        description: sourceDocument.frontmatter.normalized.description,
        content: sourceDocument.content,
      });
      translatedNow = true;
    }

    if (!translated) {
      continue;
    }

    const localizedDocument = buildLocalizedDocument({
      sourcePath: filePath,
      sourceFrontmatter: data,
      noteId: sourceDocument.noteId,
      locale,
      title: translated.title,
      description: translated.description,
      content: translated.content,
    });
    const localizedWrite = await writeIfChanged(localizedDocument.outputFile, localizedDocument.serialized);

    cache.documents[sourceDocument.noteId].translations[locale] = {
      sourceHash,
      model: translationConfig.model,
      title: translated.title,
      description: translated.description,
      content: translated.content,
      outputPath: localizedDocument.outputFile,
      outputHash: localizedWrite.hash,
    };

    localeResults.push({
      locale,
      output: localizedDocument.outputFile,
      changed: localizedWrite.changed,
      translated: translatedNow,
      cached: !translatedNow,
    });
  }

  return {
    source: filePath,
    noteId: sourceDocument.noteId,
    results: localeResults,
  };
}

function summarizeResults(results) {
  const localeSummaries = results.flatMap((result) => result.results);
  const written = localeSummaries.filter((result) => result.changed).length;
  const skipped = localeSummaries.length - written;
  const translated = localeSummaries.filter((result) => result.translated).length;
  const reused = localeSummaries.filter((result) => result.cached && result.locale !== SOURCE_LOCALE).length;

  return { written, skipped, translated, reused };
}

async function main() {
  const files = await fg(SOURCE_GLOB, { absolute: true });
  const results = [];
  const cache = await loadCache();
  const translationConfig = getTranslationConfig();

  if (!translationConfig.model && translationConfig.translateEnabled !== false) {
    console.log('[import-obsidian] English translation disabled: set OBSIDIAN_LLM_MODEL or LLM_MODEL to enable it.');
  }

  for (const filePath of files) {
    results.push(await importOne(filePath, cache, translationConfig));
  }

  await saveCache(cache);

  const summary = summarizeResults(results);
  console.log(`Imported ${results.length} Obsidian notes (${summary.written} written, ${summary.skipped} unchanged, ${summary.translated} translated, ${summary.reused} cached translations reused).`);
  for (const result of results) {
    for (const localized of result.results) {
      const action = localized.changed ? 'wrote' : 'kept';
      const tags = [localized.locale];
      if (localized.translated) {
        tags.push('translated');
      } else if (localized.cached && localized.locale !== SOURCE_LOCALE) {
        tags.push('cached');
      }
      console.log(`- ${path.basename(result.source)} -> ${path.relative(process.cwd(), localized.output)} [${tags.join(', ')}; ${action}]`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
