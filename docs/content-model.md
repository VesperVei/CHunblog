# Content Model

Goosequill stores site content in `src/content/` and uses Astro content collections.

## Collections

`src/content.config.ts` defines two collections.

- `pages`: all MD or MDX files under `src/content/`.
- `blog`: files matching `src/content/blog/**/index*.{md,mdx}`.

The `pages` collection currently has an empty schema. The `blog` collection validates frontmatter and provides defaults.

## Page Content

Pages live directly under `src/content/`.

Common examples:

- `src/content/index.mdx`: default English home page content.
- `src/content/index_en.mdx`: English home page content for multilingual mode.
- `src/content/index_zh-cn.mdx`: Simplified Chinese home page content.
- `src/content/about.mdx`, `about_en.mdx`, `about_zh-cn.mdx`: about page variants.
- `src/content/tags.mdx`, `tags_en.mdx`, `tags_zh-cn.mdx`: tag page content.
- `src/content/demo.mdx`: demo page content.

Page language is inferred from the file ID suffix. For example, `index_zh-cn.mdx` maps to `zh-cn`.

## Blog Content

Blog posts live under `src/content/blog/<slug>/`.

Typical layout:

```text
src/content/blog/my-post/
  index.mdx
  index_en.mdx
  index_zh-cn.mdx
  image.jpg
```

The directory name becomes the post slug. Localized variants use suffixes such as `_en` and `_zh-cn`.

Obsidian imports currently come from `src/content/my_md/*.md` through `scripts/import-obsidian-blog.mjs`. The importer writes generated blog files into `src/content/blog/<note_id>/` and keeps a local cache under `.cache/obsidian-import/` so unchanged documents are not rewritten on every dev rebuild.

When translation is enabled, the importer always generates the Chinese source variant first, then optionally generates `index_en.mdx` from the translated result. English generation can reuse cached translations for unchanged notes.

## Blog Frontmatter

Blog posts support the following frontmatter:

```yaml
title: My Post
description: Short summary for cards and metadata.
created_at: 2026-04-21 09:30
updated_at: 2026-04-22 10:45
draft: false
toc: true
toc_inline: true
toc_depth: 3
tags:
  - Astro
  - MDX
type: post
heroImage: ./image.jpg
author: Goosequill
```

Required fields:

- `title`
- `description`
- `created_at`

Defaults:

- `draft`: `false`
- `toc`: `true`
- `toc_inline`: `true`
- `tags`: `[]`
- `author`: `siteConfig.title`

Optional metadata used by Obsidian-style content:

- `updated_at`
- `note_id`
- `note_type`
- `aliases`
- `cssclasses`

`author` can be a string or an array. It is normalized to an array by the schema.

## Language And Slugs

Language and slug behavior is centralized in `src/utils/pages.ts`.

- `getLangFromId(id)` reads a suffix like `_en` or `_zh-cn`.
- `getSlugFromId(id)` removes language suffixes and `index` endings.
- `getTargetLang(lang)` chooses the requested language in multilingual mode or the configured default locale in single-language mode.
- `selectEntriesForLanguage(...)` chooses the correct localized entries.

In multilingual mode, only entries with the requested language suffix are selected. In single-language mode, entries matching the configured language are preferred, with unsuffixed entries used as fallback.

## Multilingual Mode

`src/config.ts` controls locale mode.

```ts
// defaultLocale: "en"
```

If `siteConfig.defaultLocale` is undefined, multilingual mode is enabled. Routes are generated under locale prefixes such as `/en/` and `/zh-cn/`.

If `siteConfig.defaultLocale` is set, single-language mode is enabled. Routes are generated without a language prefix.

## Tags

Tags are read from blog frontmatter. Tag lists are computed per language with `getTagList(lang)` in `src/utils/pages.ts`. Tag detail pages filter posts by exact tag name.

Because tags are language-specific content, localized posts can use localized tag names.

## Obsidian Translation Settings

The importer supports an OpenAI-compatible translation endpoint. It is designed to work with local proxies as well as hosted providers.

- `OBSIDIAN_LLM_BASE_URL` or `LLM_BASE_URL`: translation endpoint base URL. Defaults to `http://127.0.0.1:8317/v1`.
- `OBSIDIAN_LLM_API_KEY` or `LLM_API_KEY`: API key sent as a Bearer token. Defaults to `local`.
- `OBSIDIAN_LLM_MODEL` or `LLM_MODEL`: model name. Translation stays disabled until a model is configured.
- `OBSIDIAN_TRANSLATE=false`: disable translation explicitly.
- `OBSIDIAN_TRANSLATE_IN_DEV=true`: allow live translation during `pnpm dev`. By default, dev mode skips new translation requests and only reuses cached English output.
- `OBSIDIAN_FORCE_RETRANSLATE=true`: ignore cached translations for the current run.

## Drafts

The schema supports `draft`, but not every helper currently filters drafts. Before relying on drafts in production, check the page route that renders the post list or detail and confirm whether it filters `draft !== true`.

## MDX Features

MDX content can use normal Markdown, Astro components exposed by the markdown wrapper, and project shortcodes.

Shortcode components live in `src/components/shortcodes/`:

- `alert.astro`
- `bilibili.astro`
- `crt.astro`
- `image.astro`
- `spotify.astro`
- `steam.astro`
- `video.astro`
- `youtube.astro`

Markdown processing also supports math through `remark-math` and `rehype-katex`, Mermaid through `src/utils/remark-mermaid.js`, and enhanced code blocks through Expressive Code.
