export const linkCategories = ["blog", "friends", "tech", "other"] as const;

export type LinkCategory = (typeof linkCategories)[number];

export type FriendLink = {
  name: string;
  url: string;
  description: string;
  avatar?: string;
  githubId?: string;
  site?: string;
  tags: string[];
  category: LinkCategory;
};

export function getSiteLabel(url: string, site?: string): string {
  if (site) {
    return site;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function getSiteFavicon(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

export function getGitHubAvatarUrl(githubId?: string): string | undefined {
  if (!githubId) {
    return undefined;
  }

  return `https://github.com/${githubId}.png?size=96`;
}

export function getPrimaryAvatar(link: FriendLink): string | undefined {
  return link.avatar ?? getGitHubAvatarUrl(link.githubId) ?? getSiteFavicon(link.url);
}

export const links: FriendLink[] = [
  {
    name: "SEZUVEM='s Blog",
    url: "https://idcm-svg.github.io/HFTTC.github.io",
    description: "一位志同道合的 Pwn 友，他的 WP 也很出色。",
    githubId: "idcm-svg",
    tags: ["博客", "Pwn"],
    category: "blog",
  },
  {
    name: "拾页台灯",
    url: "https://example.com/desk-lamp",
    description: "写作与摄影并行的个人空间，常有安静但耐读的生活观察。",
    tags: ["博客", "个人", "写作"],
    category: "blog",
  },
  {
    name: "Northbound",
    url: "https://example.com/northbound",
    description: "偏前端与开发工具的长期记录，内容扎实，更新克制。",
    tags: ["技术", "前端", "工具"],
    category: "tech",
  },
  {
    name: "Stack Window",
    url: "https://example.com/stack-window",
    description: "专注漏洞利用、调试和二进制学习路径整理的技术小站。",
    tags: ["技术", "Pwn", "笔记"],
    category: "tech",
  },
  {
    name: "Paper Window",
    url: "https://example.com/paper-window",
    description: "记录网页设计、排版实验与小而美的交互灵感。",
    tags: ["设计", "排版", "灵感"],
    category: "other",
  },
  {
    name: "小岛说明书",
    url: "https://example.com/island-manual",
    description: "收藏阅读、电影与城市碎片，也偶尔写一点缓慢的思考。",
    tags: ["阅读", "随笔", "收藏"],
    category: "other",
  },
];
