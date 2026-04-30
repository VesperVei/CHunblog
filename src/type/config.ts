export type ThemeColorConfig =
  | {
      mode: "fixed";
      color: string;
    }
  | {
      mode: "hue";
      hue: number;
    }
  | {
      mode: "hsl";
      hsl: {
        h: number;
        s: number;
        l: number;
      };
    };

export type GiscusCommentsConfig = {
  provider: "giscus";
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  mapping?: "pathname" | "url" | "title" | "og:title" | "specific" | "number";
  strict?: "0" | "1";
  reactionsEnabled?: "0" | "1";
  emitMetadata?: "0" | "1";
  inputPosition?: "top" | "bottom";
  theme?: string;
  theme_light?: string;
  theme_dark?: string;
  lang?: string;
  loading?: "lazy" | "eager";
};

export type WalineCommentsConfig = {
  provider: "waline";
  serverURL: string;
  lang?: "zh" | "zh-CN" | "zh-TW" | "en" | "en-US" | "jp" | "jp-JP" | "pt-BR" | "ru" | "ru-RU" | "fr-FR" | "fr" | "vi" | "vi-vn" | "es" | "es-MX";
  emoji?: string[] | false;
  meta?: ("nick" | "mail" | "link")[];
  requiredMeta?: ("nick" | "mail" | "link")[];
  login?: "enable" | "disable" | "force";
  wordLimit?: number | [number, number];
  pageSize?: number;
  search?: boolean;
  reaction?: boolean | string[];
  pageview?: boolean;
  noCopyright?: boolean;
  noRss?: boolean;
};

export type CommentsConfig = GiscusCommentsConfig | WalineCommentsConfig;

export type SiteConfig = {
  title: string;
  description: string;

  defaultLocale?:
    | "en"
    | "zh-cn"
  ;

  theme_color: ThemeColorConfig;
  comments?: CommentsConfig;

  fonts: {
    body: string;
    heading: string;
    code: string;
  };

  toc: {
    enable: boolean;
    inline?: boolean;
    index?: boolean;
    depth?: number;
  };

  pagination: {
    posts_per_page: number;
  };

  rss: {
    enable: boolean;
  };

  search: {
    enable: boolean;
  };

  classic_article_list?: boolean;
  modern_hr?: boolean;
};

export const LinkPreset = {
  Home: 0,
  Blog: 1,
  About: 2,
  Demo: 3,
  Tag: 4,
} as const;

export type LinkPreset = typeof LinkPreset[keyof typeof LinkPreset];

export type NavBarLink = {
  name: string;
  url: string;
  icon?: NavBarIconConfig;
};

export type PresetNavBarLink = {
  preset: LinkPreset;
  icon?: NavBarIconConfig;
};

export type NavBarLinkTable = {
  name: string;
  items: (NavBarLink | LinkPreset | PresetNavBarLink)[];
}

export type NavBarIconConfig = {
  name?: string;
  set?: 'phosphor' | 'simple';
};

export type NavBarHomeConfig = {
  title_as_home?: boolean;
  icon?: NavBarIconConfig;
};

export type NavBarConfig = {
  style?:
    | "default"
    | "classic"
    | "sticked"
  home?: NavBarHomeConfig;
  links: (NavBarLink | LinkPreset | PresetNavBarLink | NavBarLinkTable)[];
};

export type FooterConfig = {
  links: (NavBarLink | LinkPreset | PresetNavBarLink)[];
}
