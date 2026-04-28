[![Please don't upload to GitHub](https://nogithub.codeberg.page/badge.svg)](https://nogithub.codeberg.page) [![MIT license](https://img.shields.io/badge/License-MIT-blue)](https://mit-license.org)

> [!NOTE]
> **Styles & No GitHub Initiative**
> Most of the Scss styles in this project are directly copied from [Duckquill](https://duckquill.daudix.one). To respect the original project's philosophy, this repository also strictly follows the **No GitHub** initiative. Please do not upload or mirror this project to GitHub.

# Goosequill

Goosequill is a clean and modern Astro blog theme. It is based on the [Duckquill](https://duckquill.daudix.one/) theme for Zola.

You can change a few settings and quickly build a nice blog.

## Features

- Light, dark, and system theme modes
- Accent color control in the header
- MDX support for alerts, images, videos, and Mermaid diagrams
- Built-in shortcodes for YouTube, Bilibili, Spotify, and Steam
- Better code blocks with syntax highlighting, line numbers, and optional CRT style
- Built-in i18n support for English and Chinese
- RSS, search, and pagination support

## Configuration

Most settings are in `src/config.ts`, including:

- Site title and description
- Default language and routing
- Navigation and footer links
- Theme color, fonts, and table of contents
- Pagination, search, and RSS options

## Content Structure

- Blog posts are in `src/content/blog/` and use MDX
- Pages are in `src/content/`, such as the home page, about page, and tags page
- The home page content comes from `src/content/index.mdx` and `src/content/index_zh-cn.mdx`

## Local Development

```bash
pnpm install
pnpm dev
```

## Build and Preview

```bash
pnpm build
pnpm preview
```

`pnpm build` runs the Astro build and then generates the Pagefind search index in `dist`.

## Credits

- [Duckquill](https://duckquill.daudix.one/) by [daudix](https://codeberg.org/daudix), the original Zola theme behind this project
- [Fuwari](https://github.com/saicaca/fuwari), a helpful reference for Astro content collections, i18n routing, and structure
- [Astro](https://astro.build/), the framework used in this project
- [Pagefind](https://pagefind.app/), for static search
- [Expressive Code](https://expressive-code.com/), for code block styling
