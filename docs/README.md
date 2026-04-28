# Goosequill Project Docs

This folder is the project knowledge base. It explains how Goosequill is organized, how content flows through the site, and what future agents should read before making changes.

## Start Here

- [Project Structure](./project-structure.md): main folders, routing, layouts, components, styles, and utilities.
- [Content Model](./content-model.md): MDX pages, blog posts, language suffixes, frontmatter, tags, and routing rules.
- [Theme And Runtime](./theme-and-runtime.md): theme switching, accent colors, Expressive Code, Mermaid, search, RSS, and comment providers.
- [Agent Guide](./agent-guide.md): practical rules for future coding agents working in this repository.

## Project Summary

Goosequill is a multilingual Astro blog theme inspired by Duckquill. It uses Astro content collections for pages and blog posts, MDX for rich content, Sass for global styling, and several integrations for code blocks, math, diagrams, RSS, sitemap, and static search.

The project currently supports English and Simplified Chinese. When `siteConfig.defaultLocale` is undefined, the site runs in multilingual mode and routes content under `/en/` and `/zh-cn/`. When `defaultLocale` is set, the site runs in single-language mode and unprefixed routes are used.

## Important Entry Points

- `astro.config.mjs`: Astro integrations, markdown plugins, Expressive Code setup, and i18n config.
- `src/config.ts`: site metadata, locale mode, theme color config, navigation, footer, search, RSS, optional comments, typography, TOC, and pagination.
- `src/content.config.ts`: Astro content collection schemas for pages and blog posts.
- `src/pages/`: filesystem routes.
- `src/content/`: MDX pages and blog content.
- `src/layouts/Base.astro`: base HTML shell for normal pages and blog posts.
- `src/layouts/BlogPost.astro`: blog post layout with hero, metadata, TOC, optional comments, and previous/next navigation.
- `src/utils/pages.ts`: locale-aware page, post, slug, tag, and static path helpers.
- `src/utils/theme-script.ts`: client-side theme and accent color behavior.

## Maintenance Rule

When a change affects routing, content naming, configuration, theme behavior, build behavior, or agent workflow, update these docs in the same change.
