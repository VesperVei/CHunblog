import path from 'node:path';
import { visit } from 'unist-util-visit';
import { buildContentIndex } from './content-index.mjs';
import { getLangFromId } from './content-id.mjs';
import { parseWikiLink, slugifyHeading } from './wiki.mjs';

let contentIndexPromise;

function getContentIndex() {
  if (!contentIndexPromise) {
    contentIndexPromise = buildContentIndex();
  }

  return contentIndexPromise;
}

function getPreferredLang(file) {
  const inputPath = file.path || file.history?.[0];
  if (!inputPath) {
    return 'en';
  }

  const entryId = path.basename(inputPath).replace(/\.mdx?$/i, '');
  return getLangFromId(entryId) ?? 'en';
}

export default function remarkObsidianWikilink() {
  return async (tree, file) => {
    const contentIndex = await getContentIndex();
    const preferredLang = getPreferredLang(file);
    const missingTargets = [];

    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === null || typeof node.value !== 'string') {
        return undefined;
      }

      const value = node.value;
      const regex = /!?\[\[[^\]]+\]\]/g;
      const children = [];
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(value)) !== null) {
        const raw = match[0];

        if (match.index > lastIndex) {
          children.push({
            type: 'text',
            value: value.slice(lastIndex, match.index),
          });
        }

        const parsed = parseWikiLink(raw);
        const fallbackLabel = parsed.alias || parsed.heading || parsed.target;

        if (parsed.isEmbed) {
          children.push({
            type: 'text',
            value: fallbackLabel,
          });
          lastIndex = match.index + raw.length;
          continue;
        }

        const resolved = contentIndex.resolveWikiTarget(parsed.target, preferredLang);
        if (resolved.status !== 'resolved' || !resolved.url) {
          missingTargets.push(parsed.target);
          children.push({
            type: 'link',
            url: '#',
            title: null,
            children: [{ type: 'text', value: fallbackLabel }],
            data: {
              hProperties: {
                className: ['internal-link', 'internal-link-missing'],
                'data-wiki-missing': parsed.target,
              },
            },
          });
          lastIndex = match.index + raw.length;
          continue;
        }

        const hash = parsed.heading ? `#${slugifyHeading(parsed.heading)}` : '';
        const label = parsed.alias || resolved.title || parsed.heading || parsed.target;
        children.push({
          type: 'link',
          url: `${resolved.url}${hash}`,
          title: null,
          children: [{ type: 'text', value: label }],
          data: {
            hProperties: {
              className: ['internal-link'],
              'data-note-id': resolved.noteId,
              'data-wiki-target': parsed.target,
            },
          },
        });

        lastIndex = match.index + raw.length;
      }

      if (children.length === 0) {
        return undefined;
      }

      if (lastIndex < value.length) {
        children.push({
          type: 'text',
          value: value.slice(lastIndex),
        });
      }

      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });

    if (missingTargets.length > 0) {
      const uniqueTargets = [...new Set(missingTargets)];
      file.message(`Unresolved wikilinks: ${uniqueTargets.join(', ')}`);
    }
  };
}
