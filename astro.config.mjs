import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import expressiveCode from 'astro-expressive-code';
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkMermaid from './src/utils/remark-mermaid.js';
import { getAstroI18nConfig } from './src/utils/site-config.ts';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';

export default defineConfig({
  site: "https://goosequill.erina.top",
  base: "/",
  trailingSlash: "ignore",
  markdown: {
    remarkPlugins: [remarkMath, remarkMermaid],
    rehypePlugins: [rehypeKatex],
  },
  integrations: [
    expressiveCode({
      themes: ['github-light', 'github-dark'],
      useDarkModeMediaQuery: true,
      themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
      plugins: [
        pluginLineNumbers(),
      ],
      defaultProps: {
        wrap: true,
        overridesByLang: {
          shellsession: {
            showLineNumbers: false,
          },
        },
      },
      styleOverrides: {
        codeFontFamily: 'var(--code-font-family)',
        borderRadius: "var(--rounded-corner)",
        frameBoxShadowCssValue: 'var(--edge-highlight), var(--shadow)',
        borderColor: "none",
        frames: {
          editorActiveTabIndicatorTopColor: "none",
          editorActiveTabIndicatorBottomColor: "var(--accent-color)",
        },
      },
    }),
    mdx(),
    sitemap(),
    pagefind(),
  ],
  i18n: getAstroI18nConfig(),
});
