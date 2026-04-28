import GithubSlugger from 'github-slugger';

export function normalizeWikiTarget(input) {
  return input
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.mdx?$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((segment) => slugifyLoose(segment))
    .join('/');
}

export function slugifyHeading(input) {
  const slugger = new GithubSlugger();
  return slugger.slug(input.trim());
}

export function parseWikiLink(raw) {
  const isEmbed = raw.startsWith('![[');
  const inner = raw.slice(isEmbed ? 3 : 2, -2);
  const [targetPart = '', aliasPart] = inner.split('|');
  const [filePart, ...headingParts] = targetPart.split('#');
  const target = filePart.trim();
  const heading = headingParts.join('#').trim() || undefined;
  const alias = aliasPart?.trim() || undefined;

  return {
    isEmbed,
    target,
    heading,
    alias,
  };
}

function slugifyLoose(input) {
  return input
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[?#].*$/, '')
    .toLowerCase();
}
