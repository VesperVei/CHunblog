import { getCollection } from 'astro:content';
import { siteConfig } from '../config';
import { allLanguages } from '../i18n/runtime';
import { getDefaultLocale, isMultiLangMode } from './site-config';
import type { CollectionEntry } from 'astro:content';
import { getLangFromId, getSlugFromId } from './content-id.mjs';


export type Tag = {
  name: string;
  count: number;
};

export function getTagPathParam(tag: string): string {
  return tag;
}

export function getTagFromPathParam(tagParam?: string): string {
  if (!tagParam) {
    return '';
  }

  return tagParam
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

export function getTargetLang(requestedLang?: string): string {
  if (isMultiLangMode()) {
    return requestedLang || 'en';
  }
  return getDefaultLocale();
}

function getUnlocalizedBaseId(id: string): string {
  const withoutLangSuffix = id.replace(/_[a-z]{2}(?:-[a-z]{2})?$/i, '');

  if (withoutLangSuffix === 'index') {
    return 'index';
  }

  return withoutLangSuffix.replace(/\/index$/i, '');
}

function selectEntriesForLanguage<T extends CollectionEntry<'pages'> | CollectionEntry<'blog'>>(
  entries: T[],
  lang: string,
): T[] {
  if (isMultiLangMode()) {
    return entries.filter((entry) => getLangFromId(entry.id) === lang);
  }

  const selectedEntries = new Map<string, T>();

  entries.forEach((entry) => {
    const baseId = getUnlocalizedBaseId(entry.id);
    const entryLang = getLangFromId(entry.id);
    const current = selectedEntries.get(baseId);

    if (entryLang === lang) {
      selectedEntries.set(baseId, entry);
      return;
    }

    if (!current && entryLang === null) {
      selectedEntries.set(baseId, entry);
    }
  });

  return [...selectedEntries.values()];
}

export async function getStaticPages() {
  return getCollection('pages');
}

export async function getPageBySlug(slug: string, lang?: string): Promise<CollectionEntry<'pages'> | undefined> {
  const targetLang = getTargetLang(lang);
  const pages = selectEntriesForLanguage(await getStaticPages(), targetLang);

  if (isMultiLangMode()) {
    return pages.find(p => {
      const pageLang = getLangFromId(p.id);
      if (pageLang !== targetLang) return false;
      const pageSlug = getSlugFromId(p.id, true);
      return pageSlug === slug || (slug === 'index' && pageSlug === '');
    });
  } else {
    const matchSlug = slug === 'index' || slug === '' ? '' : slug;
    return pages.find(p => {
      const idSlug = getSlugFromId(p.id);
      return idSlug === matchSlug || idSlug === `${matchSlug}/index`;
    });
  }
}

export async function getBlogPosts(lang?: string): Promise<CollectionEntry<'blog'>[]> {
  const targetLang = getTargetLang(lang);

  return selectEntriesForLanguage(await getCollection('blog'), targetLang);
}

export async function getAllBlogPosts() {
  return getCollection('blog');
}

export function sortPostsByDate<T extends CollectionEntry<'blog'>>(posts: T[]): T[] {
  return [...posts].sort((firstPost, secondPost) =>
    secondPost.data.created_at.valueOf() - firstPost.data.created_at.valueOf()
  );
}

export async function getRenderedPageBySlug(slug: string, lang?: string) {
  const targetLang = getTargetLang(lang);
  const page = await getPageBySlug(slug, targetLang);

  if (!page) {
    return undefined;
  }


  return {
    lang: targetLang,
    page,
    title: page.data.title,
    description: page.data.description,
  };
}

export async function getBlogListPage(lang?: string) {
  return getRenderedPageBySlug('blog', lang);
}

export function getLocalizedStaticPaths() {
  return generateStaticPathsForLangs();
}

export function normalizePaginatedPaths<T extends { params: Record<string, any> }>(paths: T[]): T[] {
  return paths.map((path) => ({
    ...path,
    params: {
      ...path.params,
      page: path.params.page === 1 ? undefined : path.params.page,
    },
  }));
}

export async function getBlogPaginationPaths(
  paginate: (items: CollectionEntry<'blog'>[], options: { pageSize: number; params?: Record<string, string> }) => any[],
  lang?: string,
) {
  const posts = sortPostsByDate(await getBlogPosts(lang));

  return normalizePaginatedPaths(
    paginate(posts, {
      pageSize: siteConfig.pagination.posts_per_page,
      ...(lang ? { params: { lang } } : {}),
    }),
  );
}

export async function getLocalizedBlogPaginationPaths(
  paginate: (items: CollectionEntry<'blog'>[], options: { pageSize: number; params?: Record<string, string> }) => any[],
) {
  const paginatedByLanguage = await Promise.all(
    allLanguages.map((lang) => getBlogPaginationPaths(paginate, lang)),
  );

  return paginatedByLanguage.flat();
}

export async function getBlogPostStaticPaths(lang?: string) {
  const posts = sortPostsByDate(await getBlogPosts(lang));

  return posts.map((post, index) => ({
    params: {
      ...(lang ? { lang } : {}),
      slug: getSlugFromId(post.id, isMultiLangMode()),
    },
    props: {
      post,
      prevPost: index - 1 >= 0 ? posts[index - 1] : null,
      nextPost: index + 1 < posts.length ? posts[index + 1] : null,
    },
  }));
}

export async function getLocalizedBlogPostStaticPaths() {
  const postsByLanguage = await Promise.all(
    allLanguages.map((lang) => getBlogPostStaticPaths(lang)),
  );

  return postsByLanguage.flat();
}

export async function getRssPosts(lang?: string) {
  return sortPostsByDate(await getBlogPosts(lang));
}

export async function getTagList(lang?: string): Promise<Tag[]> {
  const posts = await getBlogPosts(lang);
  
  const countMap: { [key: string]: number } = {};
  posts.forEach((post) => {
    post.data.tags?.forEach((tag: string) => {
      if (!countMap[tag]) countMap[tag] = 0;
      countMap[tag]++;
    });
  });

  const keys: string[] = Object.keys(countMap).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export async function getPostByTag(tag: string, lang?: string): Promise<CollectionEntry<'blog'>[]> {
  const posts = await getBlogPosts(lang);
  return posts.filter(p => p.data.tags?.includes(tag))
    .sort((a, b) => b.data.created_at.valueOf() - a.data.created_at.valueOf());
}

export async function getTagStaticPaths(lang?: string) {
  const targetLang = getTargetLang(lang);
  const tags = await getTagList(targetLang);

  return tags.map((tag) => ({
    params: {
      ...(lang ? { lang: targetLang } : {}),
      tag: getTagPathParam(tag.name),
    },
  }));
}

export async function getLocalizedTagStaticPaths() {
  const tagsByLanguage = await Promise.all(
    allLanguages.map((lang) => getTagStaticPaths(lang)),
  );

  return tagsByLanguage.flat();
}

export function generateStaticPathsForLangs() {
  if (isMultiLangMode()) {
    return allLanguages.map(lang => ({ params: { lang } }));
  }
  return [];
}

export { getLangFromId, getSlugFromId } from './content-id.mjs';
export { siteConfig } from '../config';
export { isMultiLangMode } from './site-config';
