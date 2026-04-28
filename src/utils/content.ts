import { type CollectionEntry, getCollection } from "astro:content";

export type Tag = {
  name: string;
  count: number;
};

function getPostLang(id: string): string {
  const langMatch = id.match(/_([a-z]{2}-[a-z]{2})$/);
  return langMatch ? langMatch[1] : 'en';
}

function filterByLang(items: CollectionEntry<"blog">[], lang?: string): CollectionEntry<"blog">[] {
  if (!lang) return items;
  return items.filter(item => getPostLang(item.id) === lang);
}

export async function getTagList(lang?: string): Promise<Tag[]> {
  const allBlogPosts = await getCollection<"blog">("blog", ({ data }) => {
    return data.draft !== true;
  });

  const filteredPosts = filterByLang(allBlogPosts, lang);

  const countMap: { [key: string]: number } = {};
  filteredPosts.forEach((post: { data: { tags: string[] } }) => {
    post.data.tags.forEach((tag: string) => {
      if (!countMap[tag]) countMap[tag] = 0;
      countMap[tag]++;
    });
  });

  const keys: string[] = Object.keys(countMap).sort((a, b) => {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export async function getPostByTag(tag: string, lang?: string): Promise<CollectionEntry<"blog">[]> {
  const allBlogPosts = await getCollection<"blog">("blog", ({ data }) => {
    return data.draft !== true
      && data.tags
      && data.tags.includes(tag);
  });

  const filteredPosts = filterByLang(allBlogPosts, lang);

  return filteredPosts.sort((a, b) => {
    return b.data.created_at.valueOf() - a.data.created_at.valueOf();
  });
}
