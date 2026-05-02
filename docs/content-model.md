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

Obsidian imports currently come from `src/content/my_md/*.md` through `scripts/import-obsidian-blog.mjs`. That file is a compatibility entry; the layered implementation lives under `scripts/obsidian-import/`. The importer writes generated blog files into `src/content/blog/<note_id>/` and keeps a local cache under `.cache/obsidian-import/` so unchanged documents are not rewritten on every dev rebuild.

Obsidian plugin cleanup is handled by the import transform pipeline. Dataview blocks are not executed yet; fenced `dataview` and `dataviewjs` blocks are converted to static callout placeholders and recorded as diagnostics so dynamic content loss is visible instead of silent. Meta Bind embed blocks are removed with diagnostics because they represent Obsidian-local UI modules.

Code block cleanup targets Shiki Highlighter / Expressive Code syntax. Compatible meta such as `showLineNumbers`, `startLineNumber=10`, `{3-4,8-9}`, `title="..."`, `ins={...}`, and `del={...}` is preserved. Language aliases are normalized for the generated site: IDA pseudocode (`IDA`, `ida`, `pseudocode`) becomes `cpp`, explicit disassembly (`ida-asm`, `disasm`, `assembly`) becomes `asm`, and mixed debugger or dump output (`gdb`, `pwndbg`, `hex`, `hexdump`) becomes `txt`. Unknown code block meta is preserved but recorded as diagnostics.

For local editing, `npm run admin` starts a dashboard at `http://127.0.0.1:4323`. Its `Blog 管理` page can upload Markdown files into `src/content/my_md/`, scan existing sources, trigger the same importer with optional LLM translation or forced retranslation, and scan generated `src/content/blog/**/index*.mdx` entries as a grouped Blog list. The import source list supports multi-select and selected-only imports; the Blog list also exposes missing-English posts for selected batch translation to `index_en.mdx`.

When translation is enabled, the importer always generates the Chinese source variant first, then optionally generates `index_en.mdx` from the translated result. English generation can reuse cached translations for unchanged notes.

Translation failures such as model cooldown, 429, or usage limits are reported per document/locale. They should not prevent Chinese output from being written or stop the rest of a batch import.

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
- `contest`
- `challenge`
- `difficulty`
- `architecture`
- `protections`
- `vulnerability`
- `techniques`
- `affected_area`

`author` can be a string or an array. It is normalized to an array by the schema.

## Language And Slugs

Language and slug behavior is centralized in `src/utils/pages.ts`.

- `getLangFromId(id)` reads a suffix like `_en` or `_zh-cn`.
- `getSlugFromId(id)` removes language suffixes and `index` endings.
- `getTargetLang(lang)` chooses the requested language in multilingual mode or the configured default locale in single-language mode.
- `selectEntriesForLanguage(...)` chooses the correct localized entries.

In multilingual mode, only entries with the requested language suffix are selected. In single-language mode, entries matching the configured language are preferred, with unsuffixed entries used as fallback.

Wikilinks and graph navigation follow the same rule in multilingual mode: `/en` resolves only to English-localized targets, and `/zh-cn` resolves only to Simplified Chinese-localized targets. Missing localized variants should stay unresolved rather than falling back across locales.

## Multilingual Mode

`src/config.ts` controls locale mode.

```ts
// defaultLocale: "en"
```

If `siteConfig.defaultLocale` is undefined, multilingual mode is enabled. Routes are generated under locale prefixes such as `/en/` and `/zh-cn/`.

If `siteConfig.defaultLocale` is set, single-language mode is enabled. Routes are generated without a language prefix.

## Tags

Tags are read from blog frontmatter. Tag lists are computed per language with `getTagList(lang)` in `src/utils/pages.ts`. Tag detail pages filter posts by exact tag name.

Obsidian imports intentionally publish only a small set of stable flat tag slugs. `scripts/obsidian-import/frontmatter/tags.mjs` owns the alias table. Current public tags are focused on core exploitation techniques, such as `format-string`, `heap`, `uaf`, `double-free`, `rop`, `ret2libc`, `stack-pivot`, `orw`, `one-gadget`, `brop`, and `ret2syscall`. Import diagnostics record unrecognized tags and tags omitted by the per-post tag limit, instead of silently polluting the public tag list.

Do not turn one-off Obsidian labels, contest names, challenge names, architecture labels, protection mechanisms, difficulty strings, or old nested tags such as `arch/...`, `mitigation/...`, `tech/...`, and `note/...` into public tags. Use structured fields such as `contest`, `challenge`, `difficulty`, `architecture`, `protections`, `vulnerability`, and `techniques` for that metadata.

## Obsidian Translation Settings

The importer supports an OpenAI-compatible translation endpoint. It is designed to work with local proxies as well as hosted providers. The default translation settings live at the top of `scripts/lib/translate.mjs` in `LLM_TRANSLATION_CONFIG`.

- `LLM_TRANSLATION_CONFIG.baseUrl`: translation endpoint base URL. Defaults to `http://127.0.0.1:8317/v1`.
- `LLM_TRANSLATION_CONFIG.apiKey`: API key sent as a Bearer token. Defaults to `local`.
- `LLM_TRANSLATION_CONFIG.model`: model name. Translation stays disabled until a model is configured.
- `LLM_TRANSLATION_CONFIG.enabledInDev`: allow live translation during `pnpm dev`. By default, dev mode skips new translation requests and only reuses cached English output.
- `LLM_TRANSLATION_CONFIG.forceRetranslate`: ignore cached translations for the current run.
- `LLM_TRANSLATION_CONFIG.targetLocales`: output locales generated by the importer.
- Environment variables such as `OBSIDIAN_LLM_MODEL`, `OBSIDIAN_LLM_BASE_URL`, and `OBSIDIAN_LLM_API_KEY` still override the file config when set.
- The local admin dashboard can save development translation settings to `.cache/admin-dev/translation-config.json`. Those settings are applied when triggering imports from `Blog 管理`, but they are intentionally not committed. When saving a root endpoint such as `http://127.0.0.1:8317`, admin normalizes it to `http://127.0.0.1:8317/v1` for OpenAI-compatible `/chat/completions` calls.
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
