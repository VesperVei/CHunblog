import path from 'node:path';
import { SOURCE_LOCALE, TARGET_DIR } from './config.mjs';
import { buildFrontmatter } from './frontmatter/normalize.mjs';
import { serializeFrontmatter } from './frontmatter/serialize.mjs';
import { transformSourceMarkdown } from './markdown/pipeline.mjs';

export function buildSourceDocument(filePath, data, content) {
  const { normalized, preserved } = buildFrontmatter(filePath, data, SOURCE_LOCALE);
  const transformed = transformSourceMarkdown(content, {
    locale: SOURCE_LOCALE,
    frontmatter: data,
    sourcePath: filePath,
  });

  return {
    noteId: normalized.note_id,
    frontmatter: { normalized, preserved },
    content: transformed.content,
    diagnostics: transformed.diagnostics,
  };
}

export function buildLocalizedDocument({ sourcePath, sourceFrontmatter, noteId, locale, title, description, content }) {
  const { normalized, preserved } = buildFrontmatter(sourcePath, sourceFrontmatter, locale, { title, description });
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
