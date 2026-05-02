# Project Structure

Goosequill is an Astro site with MDX content, multilingual routes, reusable Astro components, and Sass-based global styles.

## Root Files

- `astro.config.mjs`: Astro configuration. It registers MDX, sitemap, Pagefind, Expressive Code, math, Mermaid remark processing, KaTeX rendering, and i18n routing.
- `package.json`: project scripts and dependencies. Main commands are `pnpm dev`, `pnpm build`, and `pnpm preview`.
- `src/config.ts`: central site configuration for title, description, locales, navigation, footer, search, RSS, optional comments, theme color, fonts, TOC, and pagination.
- `src/content.config.ts`: content collection definitions and frontmatter schema.
- `public/`: static assets served as-is, including favicons, fonts, and icons.

## Source Layout

```text
src/
  assets/        Images imported through Astro.
  components/    Reusable Astro components.
  content/       MDX pages and blog posts.
  data/          Structured UI data such as friend links.
  i18n/          Translation keys and language strings.
  layouts/       Page-level layout shells.
  pages/         Astro filesystem routes.
  sass/          Global Sass styles and style modules.
  scripts/       Build-time helper scripts.
  type/          Shared TypeScript config types.
  utils/         Routing, content, i18n, theme, and markdown helpers.
```

## Routes

Routes are defined in `src/pages/`.

- `src/pages/index.astro`: root index. In multilingual mode it redirects to `/en`.
- `src/pages/[lang]/index.astro`: localized home page.
- `src/pages/about/index.astro` and `src/pages/[lang]/about.astro`: about pages.
- `src/pages/links.astro` and `src/pages/[lang]/links.astro`: friend links page rendered from structured data instead of MDX page content.
- `src/pages/blog/[...page].astro` and `src/pages/[lang]/blog/[...page].astro`: paginated blog lists.
- `src/pages/blog/[slug].astro` and `src/pages/[lang]/blog/[slug].astro`: blog post detail pages.
- `src/pages/tags/index.astro` and `src/pages/[lang]/tags/index.astro`: tag index pages.
- `src/pages/tags/[...tag].astro` and `src/pages/[lang]/tags/[...tag].astro`: tag detail pages. These use catch-all params so tags containing `/` continue to resolve correctly.
- `src/pages/rss.xml.js` and `src/pages/[lang]/rss.xml.js`: RSS feeds.
- `src/pages/demo/index.astro` and `src/pages/[lang]/demo/index.astro`: demo page.
- `src/pages/404.astro`: not found page.

In multilingual mode, the unprefixed pages usually redirect or return empty output, while localized pages generate real content.

## Layouts

- `src/layouts/Base.astro`: shared HTML document shell. It adds `Head`, `Header`, `Footer`, conditional styles, closeable details script, and Mermaid script.
- `src/layouts/BlogPost.astro`: wraps blog content in `Base` and adds post hero, post header, TOC controls, inline TOC, optional comments, and previous/next navigation.

## Component Groups

- `components/blog/`: blog cards, lists, post metadata, tags, TOC, pagination, comment provider components, and previous/next navigation.
- `components/common/`: icons, formatted dates, generated CSS variables, Mermaid setup, and shared scripts.
- `components/links/`: friend links page layout and link cards. The dedicated friends relationship graph now lives under `components/links/friends-graph/`.
- `components/shell/`: HTML head metadata and footer pieces used by page layouts.
- `components/markdown/`: MDX rendering wrapper.
- `components/nav/`: header, nav links, language switcher, theme switcher, accent color controls, and feed menu.
- `components/search/`: Pagefind search UI and client script.
- `components/shortcodes/`: MDX shortcodes for alerts and embedded media.
- `components/styles/`: conditional style components controlled by config flags.
- `components/theme/`: inline theme script injection.

## Styles

The global entry file is `src/sass/style.scss`. It imports the Sass modules for variables, typography, layout, markdown elements, code, articles, navigation, comments, search, and optional style mods.

Theme variables are defined in `src/sass/_variables.scss`. The project uses CSS custom properties for colors, spacing, shadows, fonts, rounded corners, and transitions. Light and dark values are generated with a Sass mixin using `data-theme` and `prefers-color-scheme`.

## Utilities

- `src/utils/pages.ts`: locale-aware content selection, slug parsing, tag list generation, blog post filtering, and static path helpers.
- `src/utils/i18n.ts`: locale detection and locale-aware URL helpers.
- `src/utils/content.ts`: older tag and post helpers. Prefer checking `src/utils/pages.ts` first because it is used by current localized pages.
- `src/utils/theme-script.ts`: client-side theme and accent color controls.
- `src/utils/remark-mermaid.js`: remark plugin for Mermaid support.
- `src/utils/link-presets.ts`: named navigation link presets.
- `src/data/friends.json`: human-maintained friend/link source data used by the local admin dashboard and friend data generator. Visible front-page cards can use `order` for per-category sorting.
- `src/data/links.ts`: generated links data for the blog, tech, and other categories on the links page. Do not hand-edit it; update `src/data/friends.json` and run `npm run generate:friends`.
- `src/data/friends-graph.json`: generated relationship graph data for the friends category, including tag anchors and optional friend-to-friend relation edges.
