import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { ROOT, SOURCE_GLOB, TARGET_DIR } from './config.mjs';
import { loadCache } from './cache.mjs';
import { buildSourceDocument } from './documents.mjs';
import { readFileIfExists } from './fs-utils.mjs';
import { sha256 } from './utils.mjs';

export async function resolveImportFiles({ sources, noteIds } = {}) {
  const files = await fg(SOURCE_GLOB, { absolute: true });
  const sourceSet = new Set((Array.isArray(sources) ? sources : []).map((source) => String(source)));
  const noteIdSet = new Set((Array.isArray(noteIds) ? noteIds : []).map((noteId) => String(noteId)));

  if (sourceSet.size === 0 && noteIdSet.size === 0) return files;

  const selected = [];
  for (const filePath of files) {
    const relativeSource = path.relative(ROOT, filePath);
    if (sourceSet.has(filePath) || sourceSet.has(relativeSource) || sourceSet.has(path.basename(filePath))) {
      selected.push(filePath);
      continue;
    }

    if (noteIdSet.size > 0) {
      const rawSource = await fs.readFile(filePath, 'utf8');
      const { data, content } = matter(rawSource);
      const sourceDocument = buildSourceDocument(filePath, data, content);
      if (noteIdSet.has(sourceDocument.noteId)) selected.push(filePath);
    }
  }

  return selected;
}

export async function scanObsidianSources() {
  const files = await fg(SOURCE_GLOB, { absolute: true });
  const cache = await loadCache();

  return Promise.all(files.map(async (filePath) => {
    const rawSource = await fs.readFile(filePath, 'utf8');
    const sourceHash = sha256(rawSource);
    const { data, content } = matter(rawSource);
    const sourceDocument = buildSourceDocument(filePath, data, content);
    const cacheEntry = cache.documents[sourceDocument.noteId];
    const targetDir = path.join(TARGET_DIR, sourceDocument.noteId);

    return {
      source: filePath,
      relativeSource: path.relative(ROOT, filePath),
      filename: path.basename(filePath),
      noteId: sourceDocument.noteId,
      title: sourceDocument.frontmatter.normalized.title,
      description: sourceDocument.frontmatter.normalized.description,
      createdAt: sourceDocument.frontmatter.normalized.created_at,
      updatedAt: sourceDocument.frontmatter.normalized.updated_at,
      tags: sourceDocument.frontmatter.normalized.tags,
      diagnostics: sourceDocument.diagnostics,
      sourceHash,
      changedSinceCache: cacheEntry?.sourceHash !== sourceHash,
      zhOutput: path.join(targetDir, 'index_zh-cn.mdx'),
      hasZhOutput: Boolean(await readFileIfExists(path.join(targetDir, 'index_zh-cn.mdx'))),
      translations: Object.fromEntries(
        Object.entries(cacheEntry?.translations ?? {}).map(([locale, entry]) => [
          locale,
          {
            model: entry.model,
            outputPath: entry.outputPath,
            cachedForCurrentSource: entry.sourceHash === sourceHash,
          },
        ]),
      ),
    };
  }));
}
