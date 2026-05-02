import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { getLangFromId, getSlugFromId } from '../src/utils/content-id.mjs';

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, '.cache', 'search');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');
const OUTPUT_FILE = path.join(ROOT, 'public', 'dev-search-index.json');
const BLOG_CONTENT_GLOB = 'src/content/blog/**/index*.{md,mdx}';
const BLOG_CONTENT_BASE = path.join(ROOT, 'src/content/blog');

function toEntryId(filePath) {
  const relativePath = path.relative(BLOG_CONTENT_BASE, filePath);
  return relativePath.replace(/\.mdx?$/i, '');
}

function buildLocalizedBlogUrl(lang, slug) {
  const suffix = slug ? `/blog/${slug}/` : '/blog/';
  return lang ? `/${lang}${suffix}` : suffix;
}

function stripMarkup(source) {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, ' $1 ')
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => ` ${alias ?? target} `)
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[\t ]*[-*+] /gm, ' ')
    .replace(/^[\t ]*\d+\. /gm, ' ')
    .replace(/^[#>]+/gm, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeIfChanged(filePath, content) {
  let previous = null;

  try {
    previous = await fs.readFile(filePath, 'utf8');
  } catch {
    previous = null;
  }

  if (previous === content) {
    return false;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return true;
}

async function main() {
  const files = await fg(BLOG_CONTENT_GLOB, { absolute: true });
  const posts = await Promise.all(files.map(async (filePath) => {
    const source = await fs.readFile(filePath, 'utf8');
    const { data, content } = matter(source);

    if (data.draft === true) {
      return null;
    }

    const entryId = toEntryId(filePath);
    const lang = getLangFromId(entryId) ?? 'en';
    const slug = getSlugFromId(entryId, getLangFromId(entryId) !== null);

    return {
      title: String(data.title ?? slug ?? entryId),
      description: String(data.description ?? ''),
      url: buildLocalizedBlogUrl(lang, slug),
      lang,
      noteId: data.note_id ? String(data.note_id) : entryId,
      tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag)) : [],
      aliases: Array.isArray(data.aliases) ? data.aliases.map((alias) => String(alias)) : [],
      createdAt: data.created_at ? new Date(data.created_at).toISOString() : null,
      updatedAt: data.updated_at ? new Date(data.updated_at).toISOString() : null,
      text: stripMarkup(String(content ?? '')),
    };
  }));

  const filteredPosts = posts
    .filter((post) => post !== null)
    .sort((first, second) => {
      const secondTime = second?.createdAt ? Date.parse(second.createdAt) : 0;
      const firstTime = first?.createdAt ? Date.parse(first.createdAt) : 0;
      return secondTime - firstTime;
    });

  const payload = {
    generatedAt: new Date().toISOString(),
    posts: filteredPosts,
  };

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(filteredPosts))
    .digest('hex');

  const previousCache = await loadCache();
  if (previousCache?.fingerprint === fingerprint) {
    console.log('[dev-search] search index unchanged, using cached output.');
    return;
  }

  const output = `${JSON.stringify(payload, null, 2)}\n`;
  const wroteOutput = await writeIfChanged(OUTPUT_FILE, output);

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify({ fingerprint, generatedAt: payload.generatedAt }, null, 2)}\n`);

  console.log(`[dev-search] indexed ${filteredPosts.length} localized blog posts${wroteOutput ? '' : ' (cache metadata refreshed only)'}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
