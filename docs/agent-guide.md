# Agent Guide

This file is the first operational document for coding agents working on Goosequill.

## First Reads

Before changing behavior, read these files:

- `docs/README.md`
- `docs/project-structure.md`
- `docs/content-model.md`
- `docs/theme-and-runtime.md`
- `src/config.ts`
- `astro.config.mjs`

For route, locale, or content behavior, also read:

- `src/utils/pages.ts`
- `src/utils/i18n.ts`
- `src/utils/content-index.mjs`
- `src/utils/wiki.mjs`
- `src/utils/remark-obsidian-wikilink.mjs`
- `src/graph/runtime/create-graph-view.ts`
- `src/graph/data/brain-graph.ts`
- `src/graph/layout/`
- the route file under `src/pages/`

For theme, style, or UI behavior, also read:

- `src/utils/theme-script.ts`
- `src/sass/_variables.scss`
- `src/sass/style.scss`
- the relevant component under `src/components/`

## Working Principles

- Preserve multilingual behavior unless the task explicitly changes it.
- In multilingual mode, treat each locale as a strict content domain for wikilinks and graph navigation. Do not fall back from `/en` to Chinese nodes or routes, or from `/zh-cn` to English nodes or routes.
- Prefer updating `src/config.ts` for site-level behavior instead of hardcoding values in components.
- Keep content routing logic centralized in `src/utils/pages.ts`.
- Keep wikilink parsing and graph target resolution centralized in `src/utils/wiki.mjs` and `src/utils/content-index.mjs`.
- Keep graph relation classification and layout selection centralized under `src/graph/`; do not couple layout rules to `local/global` view mode.
- Keep browser-side theme behavior centralized in `src/utils/theme-script.ts`.
- Use existing Sass variables and design tokens before adding new colors or constants.
- Update docs when changing routing, content structure, configuration, theme behavior, build behavior, or agent workflow.

## Git Hygiene

The repository may contain unrelated work. Do not commit or revert unrelated files.

Known unrelated items may appear in the worktree:

- `.codex`
- `public/icons/`

Check `git status --short` before editing and before committing.

## Common Tasks

### Add A Blog Post

1. Create a folder under `src/content/blog/<slug>/`.
2. Add `index_en.mdx` and/or `index_zh-cn.mdx` in multilingual mode.
3. Include required frontmatter: `title`, `description`, and `created_at`.
4. For content that should participate in wikilinks or graph generation, add a stable `note_id`; optional fields include `updated_at`, `aliases`, and `note_type`.
5. Add optional `tags`, `heroImage`, `toc`, `toc_inline`, and `author`.
6. Run `pnpm build` to verify routes, content schema, and `graph.json` generation.

### Add A Page

1. Add an MDX file under `src/content/`.
2. Use language suffixes such as `_en` and `_zh-cn` in multilingual mode.
3. Add or update a route under `src/pages/` if the page needs a new URL.
4. Use `getPageBySlug(...)` from `src/utils/pages.ts` for locale-aware lookup.

### Change Navigation

1. Edit `navBarConfig` or `footerConfig` in `src/config.ts`.
2. Prefer `LinkPreset` values from `src/utils/link-presets.ts` when possible.
3. Check language-aware links in `src/components/nav/`.

### Change Theme Behavior

1. Read `src/utils/theme-script.ts`.
2. Read `src/sass/_variables.scss`.
3. Keep `data-theme="light"` and `data-theme="dark"` behavior compatible with system mode.
4. If code block colors are involved, check the Expressive Code config in `astro.config.mjs`.

### Change Markdown Or MDX Rendering

1. Check `astro.config.mjs` for markdown plugins.
2. Check `src/components/markdown/ExtendMarkdown.astro`.
3. Check shortcode components under `src/components/shortcodes/`.
4. Run `pnpm build` because Markdown and MDX errors often appear only during content compilation.

## Verification

Use the smallest useful verification command.

- `pnpm dev`: runs `scripts/import-obsidian-blog.mjs`, then `scripts/generate-friends-data.mjs`, then `scripts/generate-graph.mjs`, then `scripts/build-dev-search-index.mjs`, then starts Astro. It does not watch `src/content/my_md/` or rerun import/search on `src/content/blog/` changes; use `npm run admin` to upload, scan, import, translate, and trigger explicit dev sync work. This avoids concurrent writes to Astro's `.astro` content store while dev server content sync is running.
- `pnpm build`: runs Obsidian import, friend data generation, graph generation, Astro build, then Pagefind index generation.
- `npm run admin`: starts the local-only admin dashboard at `http://127.0.0.1:4323`. It has separate `友邻管理`, `Blog 管理`, and `Graph 管理` pages. Blog management can upload Markdown into `src/content/my_md/`, scan Obsidian sources, trigger selected-only or full import/translation flows, list generated `src/content/blog/**/index*.mdx` entries, batch-translate missing English posts, and edit local LLM settings stored under `.cache/admin-dev/translation-config.json`. Graph management reads `public/graph.json`, displays missing wikilink diagnostics, regenerates graph data, and edits built-in graph presets in `src/data/graph-presets.json`. Port `4322` is intentionally avoided because Astro dev commonly uses it in this repository.
- Friend links should be maintained in `src/data/friends.json`. Treat `src/data/links.ts` and `src/data/friends-graph.json` as generated outputs from `scripts/generate-friends-data.mjs`. The optional `order` field controls visible Links-page card order within each category.
- Built-in graph view presets should be maintained in `src/data/graph-presets.json` or through `npm run admin`. They are imported by `src/graph/presets.ts` and affect all visitors, unlike browser-local presets stored in `localStorage`.
- `pnpm preview`: preview built output.
- Dev search cache metadata lives under `.cache/search/`, while the browser-served dev index is emitted to `public/dev-search-index.json`.

When `pnpm build` passes with warnings, report the warnings and whether they are related to the change.

## Known Risks

- Draft filtering is not consistently documented across all helpers. Check the rendering route before relying on `draft`.
- Some unprefixed routes intentionally produce empty output in multilingual mode.
- Content language selection depends on filename suffixes. Incorrect suffixes can make content disappear from localized routes.
- Pagefind runs after Astro build and can surface warnings about generated HTML shape.
- Obsidian import translation uses an OpenAI-compatible endpoint configured primarily in `scripts/lib/translate.mjs` under `LLM_TRANSLATION_CONFIG`. Environment variables still override it. If no model is configured, English generation is skipped even though Chinese import still runs.
- Obsidian import implementation is layered under `scripts/obsidian-import/`; `scripts/import-obsidian-blog.mjs` is only the compatibility entry. Keep new cleanup rules inside the transform/plugin modules instead of re-coupling them into the entry file. Dataview is intentionally not evaluated yet; fenced Dataview blocks should become static placeholders with diagnostics unless a future task explicitly implements a safe query subset. Frontmatter tag policy lives in `scripts/obsidian-import/frontmatter/tags.mjs`; keep published tags small, flat, and stable, add aliases there deliberately, and use diagnostics for tags that should not become public site tags. Do not reintroduce old nested tag families like `arch/...`, `mitigation/...`, `tech/...`, or `note/...` as public tag whitelist entries.
- Obsidian body cleanup should stay conservative: remove presentation-only HTML/style artifacts, normalize Markdown image syntax, and record diagnostics for local image embeds or unsupported plugin syntax instead of inventing attachment behavior implicitly.
