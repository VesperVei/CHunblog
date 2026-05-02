import path from 'node:path';
import { SOURCE_LOCALE, TARGET_DIR } from '../config.mjs';
import { toImportError } from '../errors.mjs';
import { shouldTranslate, translateDocument } from '../../lib/translate.mjs';

export function getCachedTranslation(cacheEntry, locale, translationConfig, sourceHash) {
  const translationEntry = cacheEntry?.translations?.[locale];
  if (!translationEntry) return null;
  if (translationConfig.forceRetranslate) return null;
  if (translationEntry.sourceHash !== sourceHash) return null;
  if (translationConfig.model && translationEntry.model !== translationConfig.model) return null;
  if (!translationEntry.title || !translationEntry.description || !translationEntry.content) return null;

  return {
    title: translationEntry.title,
    description: translationEntry.description,
    content: translationEntry.content,
  };
}

export async function resolveTranslation({ locale, sourceDocument, translationConfig, context, sourceHash }) {
  if (locale === SOURCE_LOCALE) return { skipped: true };

  const canTranslateNow = shouldTranslate({ config: translationConfig, context, targetLocale: locale });
  let translated = getCachedTranslation(sourceDocument.cacheEntry, locale, translationConfig, sourceHash);
  let translatedNow = false;

  if (!translated && canTranslateNow) {
    try {
      translated = await translateDocument({
        config: translationConfig,
        sourceLocale: SOURCE_LOCALE,
        targetLocale: locale,
        title: sourceDocument.frontmatter.normalized.title,
        description: sourceDocument.frontmatter.normalized.description,
        content: sourceDocument.content,
      });
      translatedNow = true;
    } catch (error) {
      return {
        locale,
        output: path.join(TARGET_DIR, sourceDocument.noteId, `index_${locale}.mdx`),
        changed: false,
        translated: false,
        cached: false,
        error: toImportError(error),
      };
    }
  }

  if (!translated) return { skipped: true };
  return { translated, translatedNow };
}
