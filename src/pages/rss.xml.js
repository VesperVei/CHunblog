import rss from '@astrojs/rss';
import { siteConfig } from '../config';
import { getRssPosts, getSlugFromId } from '../utils/pages';

function stripAnsiCodes(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export async function GET(context) {
  const sortedPosts = await getRssPosts();

  return rss({
    title: siteConfig.title,
    description: siteConfig.description,
    site: context.site,
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.created_at,
      description: post.data.description || "",
      link: `/blog/${getSlugFromId(post.id)}`,
      content: stripAnsiCodes(post.body),
    })),
  });
}

export async function getStaticPaths() {
  return [{ params: {} }];
}
