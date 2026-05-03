# Goosequill Agent Notes

## 先读这些
- `package.json`：只有 3 个常用脚本，仓库不是 monorepo。
- `astro.config.mjs`：MDX、Pagefind、Expressive Code、数学公式、Mermaid、i18n 都在这里接线。
- `src/config.ts`：站点级行为入口；导航、页脚、评论、主题色、分页、RSS、搜索都应优先改这里，不要散落到组件里。
- `src/content.config.ts`：内容 schema 和 `blog`/`pages` collection 的真实约束。
- `src/utils/pages.ts`：语言选择、slug 解析、分页、标签、静态路径的中心逻辑。
- `src/utils/content-index.mjs`、`src/utils/wiki.mjs`、`src/utils/remark-obsidian-wikilink.mjs`：Obsidian 双链与关系图谱的核心入口。
- `docs/agent-guide.md`：已有维护约定，尤其是多语言、主题、文档同步规则。

## 仓库事实
- 单包 Astro 站点，不是 workspace；核心命令只有 `pnpm dev`、`pnpm build`、`pnpm preview`。
- `pnpm dev` / `pnpm build` 前都会先执行 `scripts/generate-graph.mjs`，生成统一的 `public/graph.json`。
- `scripts/import-obsidian-blog.mjs` 是 Obsidian 导入的兼容入口；真实分层逻辑在 `scripts/obsidian-import/`。它会把 `src/content/my_md/*.md` 导入到 `src/content/blog/<note_id>/`，缓存写到 `.cache/obsidian-import/`；dev 模式默认跳过新的 LLM 翻译请求，只复用未过期缓存并避免重写未变化文件。Obsidian 插件语法清洗走 transform 管线，Dataview 当前只保守转换为静态提示并记录诊断，不执行查询。导入 frontmatter 会把站点 tags 归一为少量稳定 slug，并将比赛/题目/难度/保护机制等中文字段映射到结构化元数据；未发布或超量标签会进入诊断。正文清洗会移除 Obsidian 进度条和内联 style，规范图片 alt/尺寸语法，并对未导入的本地图片嵌入记录诊断。Shiki Highlighter/Expressive Code 代码块 meta 会被保留，`IDA`/伪代码归一为 `cpp`，纯反汇编归一为 `asm`，`gdb`/`pwndbg`/十六进制 dump 归一为 `txt`。
- `npm run admin` 启动本地后台，默认 `http://127.0.0.1:4323`；包含 `友邻管理`、`Blog 管理`、`Graph 管理`。Blog 管理可配置本地 LLM 导入参数（写入 `.cache/admin-dev/translation-config.json`），Graph 管理读取 `public/graph.json`、记录 missing wikilink 诊断并维护 `src/data/graph-presets.json` 内置模板。
- `pnpm build` 实际执行 `astro build && pagefind --site dist`。搜索索引不是 Astro 自动产物，改搜索或构建逻辑时必须记住 Pagefind 这一步。
- 部署工作流在 `.forgejo/workflows/deploy.yml`，CI 只跑 `pnpm install` 和 `pnpm run build`，Node 版本固定为 `20`。
- `public/icons` 是 git submodule，来自 `.gitmodules`。不要把它当普通本地目录处理；缺图标时先确认 submodule 是否已初始化。
- README 明确要求遵守 “No GitHub” 原则：不要把此仓库上传或镜像到 GitHub。

## 多语言与路由
- `siteConfig.defaultLocale === undefined` 时是多语言模式；设置后才是单语言模式。这个开关在 `src/utils/site-config.ts`，不要自行推断。
- 多语言模式下，真实页面在 `src/pages/[lang]/...`；许多无前缀路由会重定向到 `/en` 或直接返回 `/404`。改路由时需要同时检查有前缀和无前缀两套页面文件。
- 内容语言靠文件名后缀解析，规则在 `getLangFromId()` / `getSlugFromId()`：如 `_en`、`_zh-cn`。后缀写错会让内容直接从对应语言路由里消失。
- `src/content/blog` 只收 `**/*/index*.{md,mdx}`；博客文章应放在 `src/content/blog/<slug>/index*.mdx`，不是任意文件名。
- `src/content/` 下页面内容也走 collection；页面或文章的语言选择、slug 生成、分页、tag 路由都应复用 `src/utils/pages.ts`，不要在页面里重新实现。
- 双链和图谱统一使用 `note_id` 作为内容主键；`created_at` / `updated_at` 取代旧的 `pubDate` / `updatedDate`。
- 图谱节点模型按 `note_id` 聚合同一内容，并在单个节点上保留 `titles[lang]` 与 `urls[lang]` 的多语言映射；处理 wikilink、多语言导入或图谱跳转时，不要误以为一个节点只能对应单语标题或单一路径。
- 站点 Graph 设置里的内置模板来自 `src/data/graph-presets.json`，会影响所有访客；浏览器 localStorage 里的用户模板只是个人本地状态。
- 第一版双链只做 `[[target]]`、`[[target|alias]]`、`[[target#heading|alias]]`；`![[embed]]` 仍不做真实嵌入。

## 主题与渲染
- 主题切换逻辑集中在 `src/utils/theme-script.ts`；`data-theme="light"` / `"dark"` 和“无属性表示 system mode”是既有约定，改主题时不要破坏。
- 主题色模式由 `siteConfig.theme_color` 决定；如果要改主题色行为，先看 `src/config.ts`，再看 `src/utils/theme-script.ts`。
- Markdown/MDX 扩展由 `astro.config.mjs` 接线：`remark-math`、`rehype-katex`、`remark-mermaid`、Expressive Code。改 Markdown 表现时不要只改组件。
- 评论系统是配置驱动的，当前 `src/config.ts` 启用了 Waline；评论 provider 切换入口在 `src/components/blog/Comments.astro`。

## 验证
- 最小有效验证通常是 `pnpm build`，因为它会同时暴露 Astro 内容编译错误和 Pagefind 索引问题。
- 只改局部 UI/文案时可用 `pnpm dev`；需要检查构建产物或搜索时再跑 `pnpm build` / `pnpm preview`。

## 变更约定
- 若改动影响路由、内容命名、多语言行为、主题行为、构建流程或 agent 工作流，同步更新 `docs/` 下对应文档；`docs/README.md` 已把这条作为维护规则写死。
- 仓库可能存在无关改动；`docs/agent-guide.md` 已注明 `.codex` 和 `public/icons/` 可能出现在 worktree 中，不要顺手回滚或提交无关文件。
