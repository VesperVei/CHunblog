import { normalizeArray } from '../utils.mjs';

export function stripHtmlComments(content) {
  return { content: content.replace(/<!--([\s\S]*?)-->/g, '') };
}

export function normalizeCodeFenceLanguages(content) {
  return {
    content: content
      .replace(/```pwndbg\b/g, '```txt')
      .replace(/```IDA\b/g, '```txt')
      .replace(/```txet\b/g, '```txt'),
  };
}

export function injectRelationshipNotice(content, context) {
  const links = normalizeArray(context.frontmatter.Link);
  if (links.length === 0) return { content };

  const label = context.locale === 'en' ? 'Related entry' : '关联入口';
  const block = [
    '> [!note]',
    ...links.map((link) => `> ${label}：${link}`),
    '',
  ].join('\n');

  return { content: `${block}${content.trimStart()}` };
}
