import { transformCodeBlocks } from '../plugins/code-blocks.mjs';
import { transformDataviewBlocks } from '../plugins/dataview.mjs';
import { transformMetaBindEmbeds } from '../plugins/meta-bind.mjs';
import { injectRelationshipNotice, normalizeCodeFenceLanguages, stripHtmlComments } from './transforms.mjs';

const SOURCE_TRANSFORMS = [
  transformMetaBindEmbeds,
  transformDataviewBlocks,
  transformCodeBlocks,
  stripHtmlComments,
  normalizeCodeFenceLanguages,
  injectRelationshipNotice,
];

export function transformSourceMarkdown(content, context) {
  let nextContent = content;
  const diagnostics = [];

  for (const transform of SOURCE_TRANSFORMS) {
    const result = transform(nextContent, context) ?? { content: nextContent };
    nextContent = result.content ?? nextContent;
    diagnostics.push(...(result.diagnostics ?? []));
  }

  return {
    content: nextContent.trim(),
    diagnostics,
  };
}
