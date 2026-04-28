import rss from '@astrojs/rss';
import { siteConfig } from '../../config';
import { isMultiLangMode } from '../../utils/site-config';
import { getLocalizedStaticPaths, getRssPosts, getSlugFromId } from '../../utils/pages';

function stripAnsiCodes(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export async function GET(context) {
  const currentLang = context.params.lang || 'en';
  const sortedPosts = await getRssPosts(currentLang);

  return rss({
    title: siteConfig.title,
    description: siteConfig.description,
    site: context.site,
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.created_at,
      description: post.data.description || "",
      link: isMultiLangMode()
        ? `/${currentLang}/blog/${getSlugFromId(post.id, true)}/`
        : `/blog/${getSlugFromId(post.id)}`,
      content: stripAnsiCodes(post.body),
    })),
  });
}

export async function getStaticPaths() {
  return getLocalizedStaticPaths();
}
