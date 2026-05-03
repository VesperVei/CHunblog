import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_FILE = path.join(ROOT, 'src/data/friends.json');
const LINKS_FILE = path.join(ROOT, 'src/data/links.ts');
const GRAPH_FILE = path.join(ROOT, 'src/data/friends-graph.json');

const linkCategories = new Set(['blog', 'friends', 'tech', 'other']);
const categoryOrder = ['blog', 'friends', 'tech', 'other'];
const tagTitles = {
  Pwn: 'Pwn',
  博客: 'Blog',
  开发: 'Development',
  技术: 'Tech',
  写作: 'Writing',
  工具: 'Tools',
  工程: 'Engineering',
  日常: 'Everyday',
  分享: 'Sharing',
  个人: 'Personal',
  前端: 'Frontend',
  笔记: 'Notes',
  设计: 'Design',
  排版: 'Typography',
  灵感: 'Inspiration',
  阅读: 'Reading',
  随笔: 'Essays',
  收藏: 'Collection',
};

function cleanString(value) {
  if (value === undefined || value === null) return undefined;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : undefined;
}

function normalizeId(value, fallback) {
  const source = cleanString(value ?? fallback);
  if (!source) return undefined;

  const asciiId = source
    ?.replace(/^friend:/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '');

  if (asciiId) return asciiId;

  return encodeURIComponent(source)
    .replace(/%/g, '')
    .toLowerCase();
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => cleanString(item)).filter(Boolean))];
  }
  const stringValue = cleanString(value);
  return stringValue ? stringValue.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeOrder(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const stringValue = cleanString(value);
  if (!stringValue) return undefined;
  const numberValue = Number(stringValue);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function slugifyTag(tag) {
  const mapped = tag.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]/g, '');
  return mapped || encodeURIComponent(tag).replace(/%/g, '').toLowerCase();
}

function friendNodeId(friend) {
  return `friend:${friend.id}`;
}

function tagNodeId(tag) {
  return `tag:${tag}`;
}

function normalizeFriend(raw, index) {
  const name = cleanString(raw.name);
  const url = cleanString(raw.url ?? raw.blog);
  const id = normalizeId(raw.id ?? raw.githubId, name ?? `friend-${index + 1}`);
  const category = cleanString(raw.category) ?? 'blog';

  if (!id) throw new Error(`Friend #${index + 1} is missing id/name.`);
  if (!name) throw new Error(`Friend ${id} is missing name.`);
  if (!url) throw new Error(`Friend ${id} is missing url/blog.`);
  if (!linkCategories.has(category)) throw new Error(`Friend ${id} has invalid category: ${category}`);

  return {
    id,
    name,
    titleZh: cleanString(raw.titleZh) ?? name,
    titleEn: cleanString(raw.titleEn) ?? cleanString(raw.titleZh) ?? name,
    url,
    blog: cleanString(raw.blog),
    description: cleanString(raw.description) ?? '',
    avatar: cleanString(raw.avatar),
    githubId: cleanString(raw.githubId),
    tags: normalizeTags(raw.tags),
    category,
    order: normalizeOrder(raw.order),
    graph: Boolean(raw.graph),
    hidden: Boolean(raw.hidden),
    relation: cleanString(raw.relation),
    relationWith: normalizeId(raw.relationWith),
  };
}

export async function readFriendsSource() {
  const raw = await fs.readFile(SOURCE_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const friends = Array.isArray(parsed.friends) ? parsed.friends : [];
  return {
    friends: friends.map(normalizeFriend),
  };
}

export async function writeFriendsSource(friends) {
  const normalized = friends.map(normalizeFriend);
  await fs.writeFile(SOURCE_FILE, `${JSON.stringify({ friends: normalized }, null, 2)}\n`);
  return { friends: normalized };
}

function buildLinksTs(friends) {
  const visibleLinks = friends
    .map((friend, index) => ({ friend, index }))
    .filter(({ friend }) => !friend.hidden)
    .sort((a, b) => {
      const categoryDiff = categoryOrder.indexOf(a.friend.category) - categoryOrder.indexOf(b.friend.category);
      if (categoryDiff !== 0) return categoryDiff;

      const aOrder = a.friend.order ?? Number.POSITIVE_INFINITY;
      const bOrder = b.friend.order ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;

      return a.index - b.index;
    })
    .map(({ friend }) => friend)
    .map((friend) => ({
      name: friend.name,
      url: friend.blog ?? friend.url,
      description: friend.description,
      ...(friend.avatar ? { avatar: friend.avatar } : {}),
      ...(friend.githubId ? { githubId: friend.githubId } : {}),
      ...(friend.blog ? { blog: friend.blog } : {}),
      tags: friend.tags,
      category: friend.category,
    }));

  return `export const linkCategories = ["blog", "friends", "tech", "other"] as const;\n\nexport type LinkCategory = (typeof linkCategories)[number];\n\nexport type FriendLink = {\n  name: string;\n  url: string;\n  description: string;\n  avatar?: string;\n  githubId?: string;\n  blog?: string;\n  tags: string[];\n  category: LinkCategory;\n};\n\nexport function getSiteLabel(url: string, site?: string): string {\n  if (site) {\n    return site;\n  }\n\n  try {\n    return new URL(url).hostname.replace(/^www\\./, "");\n  } catch {\n    return url;\n  }\n}\n\nexport function getSiteFavicon(url: string): string | undefined {\n  try {\n    const parsed = new URL(url);\n    return \`${'${parsed.origin}'}/favicon.ico\`;\n  } catch {\n    return undefined;\n  }\n}\n\nexport function getGitHubAvatarUrl(githubId?: string): string | undefined {\n  if (!githubId) {\n    return undefined;\n  }\n\n  return \`https://github.com/${'${githubId}'}.png?size=96\`;\n}\n\nexport function getPrimaryAvatar(link: FriendLink): string | undefined {\n  return link.avatar ?? getGitHubAvatarUrl(link.githubId) ?? getSiteFavicon(link.blog || link.url);\n}\n\nexport const links: FriendLink[] = ${JSON.stringify(visibleLinks, null, 2)};\n`;
}

function buildFriendsGraph(friends) {
  const graphFriends = friends.filter((friend) => friend.graph);
  const graphFriendIds = new Set(graphFriends.map((friend) => friend.id));
  const tags = [...new Set(graphFriends.flatMap((friend) => friend.tags))];
  const nodes = [];
  const links = [];

  for (const friend of graphFriends) {
    nodes.push({
      id: friendNodeId(friend),
      type: 'friend',
      titles: {
        en: friend.titleEn,
        'zh-cn': friend.titleZh,
      },
      urls: {
        en: friend.url,
        'zh-cn': friend.url,
      },
      tags: friend.tags,
      aliases: [],
      metadata: {
        description: friend.description,
        ...(friend.githubId ? { githubId: friend.githubId } : {}),
        ...(friend.blog ? { blog: friend.blog } : {}),
        ...(friend.avatar ? { avatar: friend.avatar } : {}),
      },
    });
  }

  for (const tag of tags) {
    const slug = slugifyTag(tag);
    nodes.push({
      id: tagNodeId(tag),
      type: 'friend-tag',
      titles: {
        en: tagTitles[tag] ?? tag,
        'zh-cn': tag,
      },
      urls: {
        en: `/en/links/#friend-tag-${slug}`,
        'zh-cn': `/zh-cn/links/#friend-tag-${slug}`,
      },
      tags: [],
      aliases: [],
    });
  }

  for (const friend of graphFriends) {
    for (const tag of friend.tags) {
      links.push({
        source: friendNodeId(friend),
        target: tagNodeId(tag),
        exists: true,
        relation: tag,
      });
    }
  }

  for (const friend of graphFriends) {
    const targetId = friend.relationWith && graphFriendIds.has(friend.relationWith)
      ? friend.relationWith
      : friend.id !== 'vespervei' && graphFriendIds.has('vespervei')
        ? 'vespervei'
        : undefined;

    if (friend.relation && targetId) {
      links.push({
        source: friendNodeId(friend),
        target: `friend:${targetId}`,
        exists: true,
        relation: friend.relation,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    links,
  };
}

export async function generateFriendsData() {
  const { friends } = await readFriendsSource();
  await fs.writeFile(LINKS_FILE, buildLinksTs(friends));
  await fs.writeFile(GRAPH_FILE, `${JSON.stringify(buildFriendsGraph(friends), null, 2)}\n`);
  return {
    source: SOURCE_FILE,
    links: LINKS_FILE,
    graph: GRAPH_FILE,
    friends: friends.length,
    graphFriends: friends.filter((friend) => friend.graph).length,
    visibleLinks: friends.filter((friend) => !friend.hidden).length,
  };
}

async function main() {
  const result = await generateFriendsData();
  console.log(`Generated friend data (${result.visibleLinks} visible links, ${result.graphFriends} graph friends).`);
  console.log(`- ${path.relative(ROOT, result.links)}`);
  console.log(`- ${path.relative(ROOT, result.graph)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
