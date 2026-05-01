import {
  type SiteConfig,
  type NavBarConfig,
  type FooterConfig,
  LinkPreset,
} from "./type/config.ts";

export const siteConfig: SiteConfig = {
  title: "Vesper Vei",
  description: "Personal notes, writings, and experiments by Vesper Vei.",
  // defaultLocale: "en", // Set to undefined to enable multi-language routing, or set to a locale like "en" for single-language mode
  rss: {
    enable: true,
  },
  search: {
    enable: true,
  },
  theme_color: {
    // mode: "hue",
    // hue: 28,
    mode: "hsl",
    hsl: { h: 20, s: 95, l: 70 },
    // mode: "fixed",
    // color: "#ffa348",
  },

  // comments: {
  //   provider: "giscus",
  //   repo: "owner/repo",
  //   repoId: "R_kgDOExample",
  //   category: "Announcements",
  //   categoryId: "DIC_kwDOExample",
  //   theme_light: "light",
  //   theme_dark: "dark",
  // },

  comments: {
    provider: "waline",
    serverURL: "https://waline-for-goosequill.erina.top",
    lang: "en",
    pageview: true,
    reaction: false,
  },

  fonts: {
    body: '"Inter Variable", var(--font-system-ui), var(--font-emoji)',
    heading: '"Inter Variable", var(--font-system-ui), var(--font-emoji)',
    code: '"Maple Mono", var(--font-monospace-code)',
  },
  toc: {
    enable: true,
    inline: true,
    index: true,
    depth: 3,
  },
  pagination: {
    posts_per_page: 4,
  },
  // classic_article_list: true,
  modern_hr: true,
};

export const navBarConfig: NavBarConfig = {
  style: "default",
  home: {
    title_as_home: false,
    icon: {
      name: "house",
    },
  },
  links: [
    {
      name: "_links",
      items: [LinkPreset.Blog, LinkPreset.About],
    },
    {
      preset: LinkPreset.Demo,
      icon: { name: "book-bookmark" },
    },
    {
      name: "Vesper Vei",
      url: "/about",
    },
  ],
};

export const footerConfig: FooterConfig = {
  links: [
    LinkPreset.Home,
    LinkPreset.Blog,
    LinkPreset.About,
  ],
};
