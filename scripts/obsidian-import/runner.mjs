import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { getTranslationConfig } from '../lib/translate.mjs';
import { IMPORT_CONTEXT, ROOT, SOURCE_LOCALE, TARGET_DIR } from './config.mjs';
import { loadCache, saveCache } from './cache.mjs';
import { buildLocalizedDocument, buildSourceDocument } from './documents.mjs';
import { toImportError } from './errors.mjs';
import { writeIfChanged } from './fs-utils.mjs';
import { transformCodeBlocks } from './plugins/code-blocks.mjs';
import { resolveImportFiles } from './scanner.mjs';
import { sha256 } from './utils.mjs';
import { resolveTranslation } from './translation/import-translation.mjs';

export async function importOne(filePath, cache, translationConfig, context = IMPORT_CONTEXT) {
  const rawSource = await fs.readFile(filePath, 'utf8');
  const sourceHash = sha256(rawSource);
  const { data, content } = matter(rawSource);
  const sourceDocument = buildSourceDocument(filePath, data, content);
  const cacheEntry = cache.documents[sourceDocument.noteId] ?? { translations: {} };
  sourceDocument.cacheEntry = cacheEntry;

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
  sourceDocument.cacheEntry = cache.documents[sourceDocument.noteId];

  for (const locale of translationConfig.targetLocales) {
    const resolved = await resolveTranslation({ locale, sourceDocument, translationConfig, context, sourceHash });
    if (resolved.skipped) continue;
    if (resolved.error) {
      localeResults.push(resolved);
      continue;
    }

    const translatedCodeBlocks = transformCodeBlocks(resolved.translated.content);
    sourceDocument.diagnostics.push(...translatedCodeBlocks.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      locale,
    })));

    const localizedDocument = buildLocalizedDocument({
      sourcePath: filePath,
      sourceFrontmatter: data,
      noteId: sourceDocument.noteId,
      locale,
      title: resolved.translated.title,
      description: resolved.translated.description,
      content: translatedCodeBlocks.content,
    });
    const localizedWrite = await writeIfChanged(localizedDocument.outputFile, localizedDocument.serialized);

    cache.documents[sourceDocument.noteId].translations[locale] = {
      sourceHash,
      model: translationConfig.model,
      title: resolved.translated.title,
      description: resolved.translated.description,
      content: translatedCodeBlocks.content,
      outputPath: localizedDocument.outputFile,
      outputHash: localizedWrite.hash,
    };

    localeResults.push({
      locale,
      output: localizedDocument.outputFile,
      changed: localizedWrite.changed,
      translated: resolved.translatedNow,
      cached: !resolved.translatedNow,
    });
  }

  return {
    source: filePath,
    noteId: sourceDocument.noteId,
    diagnostics: sourceDocument.diagnostics,
    results: localeResults,
  };
}

export function summarizeResults(results) {
  const localeSummaries = results.flatMap((result) => result.results ?? []);
  const written = localeSummaries.filter((result) => result.changed).length;
  const skipped = localeSummaries.length - written;
  const translated = localeSummaries.filter((result) => result.translated).length;
  const reused = localeSummaries.filter((result) => result.cached && result.locale !== SOURCE_LOCALE).length;
  const failed = results.filter((result) => result.error).length + localeSummaries.filter((result) => result.error).length;
  return { written, skipped, translated, reused, failed };
}

export async function runObsidianImport({ context = IMPORT_CONTEXT, sources, noteIds } = {}) {
  const files = await resolveImportFiles({ sources, noteIds });
  const results = [];
  const cache = await loadCache();
  const translationConfig = getTranslationConfig();

  for (const filePath of files) {
    try {
      results.push(await importOne(filePath, cache, translationConfig, context));
    } catch (error) {
      results.push({
        source: filePath,
        noteId: null,
        results: [],
        error: toImportError(error),
      });
    }
  }

  await saveCache(cache);
  return { results, summary: summarizeResults(results), translationConfig, context };
}

export async function printCliSummary() {
  const { results, summary, translationConfig } = await runObsidianImport();

  if (!translationConfig.model && translationConfig.translateEnabled !== false) {
    console.log('[import-obsidian] English translation disabled: set LLM_TRANSLATION_CONFIG.model in scripts/lib/translate.mjs, or override it with OBSIDIAN_LLM_MODEL / LLM_MODEL.');
  }

  console.log(`Imported ${results.length} Obsidian notes (${summary.written} written, ${summary.skipped} unchanged, ${summary.translated} translated, ${summary.reused} cached translations reused).`);
  for (const result of results) {
    for (const diagnostic of result.diagnostics ?? []) {
      console.log(`- ${path.basename(result.source)} diagnostic: ${diagnostic.type} - ${diagnostic.message}`);
    }
    for (const localized of result.results ?? []) {
      const action = localized.changed ? 'wrote' : 'kept';
      const tags = [localized.locale];
      if (localized.error) tags.push('failed');
      if (localized.translated) tags.push('translated');
      else if (localized.cached && localized.locale !== SOURCE_LOCALE) tags.push('cached');
      console.log(`- ${path.basename(result.source)} -> ${path.relative(ROOT, localized.output)} [${tags.join(', ')}; ${action}]`);
    }
    if (result.error) console.log(`- ${path.basename(result.source)} failed: ${result.error.message}`);
  }
}
