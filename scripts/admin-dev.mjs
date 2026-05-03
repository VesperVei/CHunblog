import http from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import path from 'node:path';
import { generateFriendsData, readFriendsSource, writeFriendsSource } from './generate-friends-data.mjs';
import { runObsidianImport, saveUploadedObsidianNote, scanObsidianSources } from './import-obsidian-blog.mjs';
import {
  readAdminTranslationConfig,
  readGraphDiagnostics,
  readGraphPresets,
  readGraphSnapshot,
  scanBlogPosts,
  translateMissingEnglishPosts,
  withAdminTranslationEnv,
  writeAdminTranslationConfig,
  writeGraphPresets,
} from './lib/admin-content.mjs';

const ROOT = process.cwd();
const HOST = '127.0.0.1';
const PORT = Number(process.env.ADMIN_DEV_PORT ?? 4323);

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function htmlResponse(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: {
        ...process.env,
        OBSIDIAN_IMPORT_CONTEXT: 'dev',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${path.relative(ROOT, scriptPath)} exited with code ${code}\n${stderr || stdout}`));
    });
  });
}

function pageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Goosequill Dev Admin</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #111318;
      --panel: rgba(24, 28, 36, 0.82);
      --panel-strong: rgba(30, 35, 46, 0.95);
      --line: rgba(255, 255, 255, 0.12);
      --muted: #9aa4b2;
      --text: #eef2f8;
      --accent: #8fb7ff;
      --accent-2: #98f5d4;
      --danger: #ff8b8b;
      --shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(143, 183, 255, 0.18), transparent 30rem),
        radial-gradient(circle at 85% 10%, rgba(152, 245, 212, 0.14), transparent 26rem),
        var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 100vh;
    }
    button, input, textarea, select { font: inherit; }
    button {
      border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
      border-radius: 999px;
      background: linear-gradient(135deg, rgba(143, 183, 255, 0.18), rgba(152, 245, 212, 0.1));
      color: var(--text);
      padding: 0.65rem 1rem;
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
    }
    button:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 80%, white 8%); box-shadow: 0 8px 24px rgba(143, 183, 255, 0.14); }
    button:active { transform: translateY(0); }
    button.secondary { border-color: var(--line); background: rgba(255, 255, 255, 0.05); }
    button.danger { border-color: color-mix(in srgb, var(--danger) 55%, var(--line)); color: #ffdada; }
    button:disabled { cursor: wait; opacity: 0.55; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 0.85rem;
      background: rgba(255, 255, 255, 0.055);
      color: var(--text);
      padding: 0.72rem 0.8rem;
      outline: none;
    }
    textarea { min-height: 8rem; resize: vertical; line-height: 1.55; }
    label { display: grid; gap: 0.42rem; color: var(--muted); font-size: 0.86rem; }
    .app { width: min(1480px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 48px; }
    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      margin-bottom: 1.2rem;
    }
    .eyebrow { margin: 0 0 0.4rem; color: var(--accent-2); letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.76rem; }
    h1 { margin: 0; font-size: clamp(2rem, 4vw, 4.2rem); letter-spacing: -0.06em; }
    .subtitle { max-width: 760px; color: var(--muted); line-height: 1.7; }
    .grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 1rem; align-items: start; }
    .panel {
      border: 1px solid var(--line);
      border-radius: 1.35rem;
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
      overflow: hidden;
    }
    .panel-header { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 1rem 1.1rem; border-bottom: 1px solid var(--line); }
    .panel-title { margin: 0; font-size: 1rem; }
    .panel-body { padding: 1.1rem; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .metric { display: block; border: 1px solid var(--line); border-radius: 1rem; padding: 1rem; background: rgba(255, 255, 255, 0.045); text-align: left; box-shadow: none; }
    .metric.active { border-color: color-mix(in srgb, var(--accent) 72%, var(--line)); background: rgba(143, 183, 255, 0.12); }
    .metric strong { display: block; font-size: 1.85rem; }
    .metric span { color: var(--muted); font-size: 0.82rem; }
    .actions { display: flex; gap: 0.65rem; flex-wrap: wrap; align-items: center; }
    .nav-tabs { display: flex; gap: 0.55rem; flex-wrap: wrap; align-items: center; }
    .nav-tab { border-color: var(--line); background: rgba(255, 255, 255, 0.045); }
    .nav-tab.active { border-color: color-mix(in srgb, var(--accent) 72%, var(--line)); background: rgba(143, 183, 255, 0.16); box-shadow: 0 8px 30px rgba(143, 183, 255, 0.12); }
    .page { display: none; }
    .page.active { display: block; }
    .subgrid { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 1rem; align-items: start; }
    .mini-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
    .json-editor { min-height: 24rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .compact-list { display: grid; gap: 0.65rem; max-height: 680px; overflow: auto; }
    .info-card { border: 1px solid var(--line); border-radius: 1rem; padding: 0.85rem; background: rgba(255, 255, 255, 0.04); }
    .info-card h3 { margin: 0 0 0.35rem; font-size: 0.98rem; }
    .info-card p { margin: 0.25rem 0; color: var(--muted); line-height: 1.5; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; }
    .full { grid-column: 1 / -1; }
    .required { color: var(--accent-2); font-size: 0.75rem; letter-spacing: 0.04em; }
    .hint { color: var(--muted); font-size: 0.78rem; line-height: 1.5; }
    .toast { position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 20; transform: translateY(1rem); opacity: 0; border: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); border-radius: 1rem; background: var(--panel-strong); box-shadow: var(--shadow); padding: 0.8rem 1rem; color: var(--text); pointer-events: none; transition: opacity 180ms ease, transform 180ms ease; }
    .toast.show { transform: translateY(0); opacity: 1; }
    .check-row { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
    .check-row label { display: flex; grid-template-columns: none; align-items: center; gap: 0.45rem; color: var(--text); }
    .check-row input { width: auto; }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 1rem; }
    table { width: 100%; border-collapse: collapse; min-width: 850px; }
    th, td { padding: 0.75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
    td { font-size: 0.9rem; }
    tr:last-child td { border-bottom: 0; }
    tr.is-selected td { background: rgba(143, 183, 255, 0.08); }
    .row-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .row-actions button { padding: 0.42rem 0.68rem; font-size: 0.78rem; }
    .tag-list { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .tag { border: 1px solid var(--line); border-radius: 999px; padding: 0.2rem 0.48rem; color: var(--muted); background: rgba(255, 255, 255, 0.04); }
    .card-groups { display: grid; gap: 1rem; }
    .card-group { border: 1px solid var(--line); border-radius: 1rem; overflow: hidden; background: rgba(255, 255, 255, 0.035); }
    .card-group-header { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.8rem 0.9rem; border-bottom: 1px solid var(--line); color: var(--muted); }
    .card-list { display: grid; gap: 0.55rem; padding: 0.75rem; }
    .managed-card { border: 1px solid var(--line); border-radius: 0.95rem; padding: 0.75rem; background: rgba(255, 255, 255, 0.04); }
    .managed-card-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
    .managed-card h3 { margin: 0 0 0.25rem; font-size: 0.98rem; }
    .managed-card p { margin: 0.35rem 0 0; color: var(--muted); line-height: 1.5; }
    .managed-card-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; justify-content: flex-end; }
    .managed-card-actions button, .managed-card-actions select { width: auto; padding: 0.42rem 0.64rem; font-size: 0.78rem; }
    .empty-state { color: var(--muted); border: 1px dashed var(--line); border-radius: 1rem; padding: 1rem; }
    .status { min-height: 9rem; margin: 0; white-space: pre-wrap; color: #dce7f7; background: rgba(0, 0, 0, 0.28); border: 1px solid var(--line); border-radius: 1rem; padding: 1rem; overflow: auto; }
    .drop { border: 1px dashed color-mix(in srgb, var(--accent) 50%, var(--line)); border-radius: 1rem; padding: 1rem; background: rgba(143, 183, 255, 0.06); }
    .note-list { display: grid; gap: 0.65rem; max-height: 520px; overflow: auto; }
    .note-card { border: 1px solid var(--line); border-radius: 1rem; padding: 0.85rem; background: rgba(255, 255, 255, 0.04); cursor: pointer; transition: transform 160ms ease, border-color 160ms ease, background 160ms ease; }
    .note-card:hover, .note-card.is-selected { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 65%, var(--line)); background: rgba(143, 183, 255, 0.08); }
    .note-card h3 { margin: 0 0 0.35rem; font-size: 0.98rem; }
    .note-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; color: var(--muted); font-size: 0.78rem; }
    .pill { border-radius: 999px; padding: 0.18rem 0.5rem; background: rgba(255, 255, 255, 0.07); }
    @media (max-width: 980px) {
      .grid, .subgrid, .form-grid, .metrics, .mini-grid { grid-template-columns: 1fr; }
      .topbar { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <main class="app">
    <header class="topbar">
      <div>
        <p class="eyebrow">Local Dev Backend</p>
        <h1>Goosequill Admin</h1>
        <p class="subtitle">宽屏本地仪表盘，分开维护友邻、Blog 内容与站点 Graph 数据；导入、文章列表、异常和模板不再混在一个面板里。</p>
      </div>
      <div class="actions">
        <nav class="nav-tabs" aria-label="后台页面">
          <button class="nav-tab active" type="button" data-page-target="relation">友邻管理</button>
          <button class="nav-tab" type="button" data-page-target="blog">Blog 管理</button>
          <button class="nav-tab" type="button" data-page-target="graph">Graph 管理</button>
        </nav>
        <button id="refreshCurrent">刷新当前页</button>
        <button class="secondary" id="devSync">重建图谱和搜索</button>
      </div>
    </header>

    <section class="page active" data-page="relation">
      <section class="metrics">
        <button class="metric" type="button" data-relation-view="source"><strong id="metricFriends">-</strong><span>友链源数据</span></button>
        <button class="metric" type="button" data-relation-view="graph"><strong id="metricGraph">-</strong><span>图谱节点</span></button>
        <button class="metric" type="button" data-relation-view="cards"><strong id="metricVisible">-</strong><span>前台卡片</span></button>
        <button class="metric" type="button" data-relation-view="tags"><strong id="metricTags">-</strong><span>关系标签</span></button>
      </section>
      <div class="grid">
      <section class="panel" data-relation-panel="source">
        <div class="panel-header">
          <h2 class="panel-title">友链管理</h2>
          <div class="actions">
            <button class="secondary" id="generateFriends">仅重新生成展示和图谱</button>
          </div>
        </div>
        <div class="panel-body">
          <form id="friendForm" class="form-grid">
            <label>名称 <span class="required">必填</span><input name="name" required placeholder="朋友或站点名称" /></label>
            <label>唯一 ID<input name="id" placeholder="默认由名称生成" /></label>
            <label>GitHub ID<input name="githubId" placeholder="VesperVei" /></label>
            <label>博客 URL<input name="blog" placeholder="https://example.com" /></label>
            <label>主 URL <span class="required">必填：可由博客 URL 或 GitHub ID 自动推导</span><input name="url" placeholder="默认使用博客 URL 或 GitHub URL" /></label>
            <label>分类<select name="category"><option value="blog">blog</option><option value="tech">tech</option><option value="other">other</option><option value="friends">friends</option></select></label>
            <label class="full">描述 <span class="required">必填</span><textarea name="description" required placeholder="一句话说明"></textarea></label>
            <label>标签 <span class="required">建议填写，图谱节点靠标签聚类</span><input name="tags" placeholder="Pwn, 博客, 开发" /></label>
            <label>头像 URL<input name="avatar" placeholder="可选" /></label>
            <label>关系文本<input name="relation" placeholder="例如：兄弟、队友" /></label>
            <label>关系目标 ID<input name="relationWith" placeholder="默认连向 vespervei" /></label>
            <div class="check-row full">
              <label><input name="graph" type="checkbox" checked /> 加入朋友关系图谱</label>
              <label><input name="hidden" type="checkbox" /> 不显示为普通链接卡片</label>
            </div>
            <div class="actions full">
              <button type="submit" id="friendSubmit">新增友链</button>
              <button type="button" class="secondary" id="cancelEdit" hidden>取消编辑</button>
              <button type="button" class="secondary" id="saveJson">保存 JSON 编辑器</button>
            </div>
            <p class="hint full">提示：点击“仅重新生成展示和图谱”只会读取已保存的友链源数据，不会保存当前表单。新增或编辑请使用“新增友链 / 保存修改”。</p>
          </form>
          <div style="height: 1rem"></div>
          <div class="table-wrap"><table><thead><tr><th>名称</th><th>分类</th><th>URL</th><th>标签</th><th>图谱</th><th>显示</th><th>操作</th></tr></thead><tbody id="friendsTable"></tbody></table></div>
          <div style="height: 1rem"></div>
          <label>源数据 JSON 编辑器<textarea id="friendsJson" style="min-height: 22rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;"></textarea></label>
        </div>
      </section>

      <section class="panel" data-relation-panel="cards" hidden>
        <div class="panel-header">
          <h2 class="panel-title">前台卡片排序</h2>
          <p class="hint">只管理 Links 页面普通卡片：可上移、下移、调整分类、隐藏或恢复显示。</p>
        </div>
        <div class="panel-body">
          <div id="frontCardsView"></div>
        </div>
      </section>

      <section class="panel" data-relation-panel="graph" hidden>
        <div class="panel-header">
          <h2 class="panel-title">图谱节点</h2>
          <p class="hint">只显示加入朋友关系图谱的友邻，包含标签边和友邻关系边。</p>
        </div>
        <div class="panel-body">
          <div id="graphNodesView"></div>
        </div>
      </section>

      <section class="panel" data-relation-panel="tags" hidden>
        <div class="panel-header">
          <h2 class="panel-title">关系标签</h2>
          <p class="hint">按使用人数汇总标签；后续可在这里接入“博客”等上下层级分组。</p>
        </div>
        <div class="panel-body">
          <div id="tagsView"></div>
        </div>
      </section>

      <div style="display: grid; gap: 1rem;">
        <section class="panel">
          <div class="panel-header"><h2 class="panel-title">友邻管理日志</h2><button class="secondary" id="clearRelationLog">清空</button></div>
          <div class="panel-body">
            <pre class="status" id="relationLog">等待操作...</pre>
          </div>
        </section>
      </div>
      </div>
    </section>

    <section class="page" data-page="blog">
      <section class="metrics">
        <button class="metric" type="button" data-blog-view="import"><strong id="metricNotes">-</strong><span>导入源文</span></button>
        <button class="metric" type="button" data-blog-view="list"><strong id="metricBlogPosts">-</strong><span>Blog 列表</span></button>
        <button class="metric" type="button" data-blog-view="list"><strong id="metricMissingEnglish">-</strong><span>缺英文</span></button>
        <button class="metric" type="button" data-blog-view="llm"><strong id="metricCachedTranslations">-</strong><span>LLM/缓存</span></button>
      </section>
      <div class="grid">
        <section class="panel" data-blog-panel="import">
          <div class="panel-header">
            <h2 class="panel-title">导入</h2>
            <div class="actions"><button class="secondary" id="scanNotes">扫描 my_md</button></div>
          </div>
          <div class="panel-body">
            <div class="drop">
              <label>上传 Markdown 文件 <span class="required">必填：选择至少一个 .md 文件</span><input id="mdFiles" type="file" accept=".md,text/markdown" multiple /></label>
              <div class="actions" style="margin-top: 0.8rem;"><button id="uploadNotes">上传到 src/content/my_md</button></div>
            </div>
            <div style="height: 1rem"></div>
            <div class="check-row">
              <label><input id="translate" type="checkbox" checked /> 允许 LLM 英文翻译</label>
              <label><input id="forceRetranslate" type="checkbox" /> 强制重翻</label>
            </div>
            <p class="hint">导入时会读取“LLM 配置”面板保存的 baseUrl / apiKey / model，再叠加这里的临时开关。</p>
            <div class="actions" style="margin: 1rem 0;">
              <button id="runImport">清洗并导入 MDX</button>
              <button class="secondary" id="runImportNoTranslate">只生成中文 + 复用英文缓存</button>
              <button class="secondary" id="selectAllNotes">全选</button>
              <button class="secondary" id="clearSelectedNotes">清空选择</button>
            </div>
            <p class="hint" id="selectedNotesHint">已选 0 / 0。未选择时会提示是否导入全部源文。</p>
            <div class="note-list" id="noteList"></div>
          </div>
        </section>

        <section class="panel" data-blog-panel="list" hidden>
          <div class="panel-header">
            <h2 class="panel-title">Blog 列表</h2>
            <div class="actions"><button class="secondary" id="scanBlogPosts">扫描 content/blog</button></div>
          </div>
          <div class="panel-body">
            <div class="compact-list" id="blogPostList"></div>
            <div style="height: 1rem"></div>
            <section class="card-group">
              <div class="card-group-header">
                <strong>缺英文文章</strong>
                <span id="missingEnglishHint">已选 0 / 0</span>
              </div>
              <div class="panel-body">
                <p class="hint">这里列出已有 zh-cn 但缺少 en 的文章，可多选后转发到 LLM 翻译接口生成 index_en.mdx。</p>
                <div class="actions" style="margin: 0.8rem 0;">
                  <button class="secondary" id="selectAllMissingEnglish">全选缺英文</button>
                  <button class="secondary" id="clearSelectedMissingEnglish">清空选择</button>
                  <button id="translateMissingEnglish">翻译选中为英文</button>
                </div>
                <div class="compact-list" id="missingEnglishList"></div>
              </div>
            </section>
          </div>
        </section>

        <section class="panel" data-blog-panel="llm" hidden>
          <div class="panel-header">
            <h2 class="panel-title">LLM 配置</h2>
            <div class="actions"><button class="secondary" id="reloadLlmConfig">重新读取</button></div>
          </div>
          <div class="panel-body">
            <form id="llmConfigForm" class="form-grid">
              <label>Base URL<input name="baseUrl" placeholder="http://127.0.0.1:8317/v1" /></label>
              <label>Model<input name="model" placeholder="gpt-5.4" /></label>
              <label class="full">API Key<input name="apiKey" placeholder="translated-language" /></label>
              <label>目标语言<input name="targetLocales" placeholder="en" /></label>
              <div class="check-row full">
                <label><input name="translateEnabled" type="checkbox" /> 启用翻译</label>
                <label><input name="translateInDev" type="checkbox" /> dev 允许新翻译请求</label>
                <label><input name="forceRetranslate" type="checkbox" /> 默认强制重翻</label>
              </div>
              <div class="actions full">
                <button type="submit" id="saveLlmConfig">保存 LLM 配置</button>
              </div>
              <p class="hint full">配置保存在 .cache/admin-dev/translation-config.json，不会提交。Base URL 会自动补齐根路径上的 /v1；如果你的代理不是 OpenAI 兼容路径，请直接填写完整接口前缀。</p>
            </form>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header"><h2 class="panel-title">Blog 管理日志</h2><button class="secondary" id="clearBlogLog">清空</button></div>
          <div class="panel-body"><pre class="status" id="blogLog">等待操作...</pre></div>
        </section>
      </div>
    </section>

    <section class="page" data-page="graph">
      <section class="metrics">
        <button class="metric" type="button" data-graph-view="overview"><strong id="metricGraphNodes">-</strong><span>Graph 节点</span></button>
        <button class="metric" type="button" data-graph-view="overview"><strong id="metricGraphLinks">-</strong><span>Graph 边</span></button>
        <button class="metric" type="button" data-graph-view="issues"><strong id="metricGraphMissing">-</strong><span>Missing 异常</span></button>
        <button class="metric" type="button" data-graph-view="presets"><strong id="metricGraphPresets">-</strong><span>内置模板</span></button>
      </section>
      <div class="grid">
        <section class="panel" data-graph-panel="overview">
          <div class="panel-header"><h2 class="panel-title">Graph 概览</h2><button class="secondary" id="reloadGraph">读取 graph.json</button></div>
          <div class="panel-body"><div id="graphOverview"></div></div>
        </section>

        <section class="panel" data-graph-panel="issues" hidden>
          <div class="panel-header"><h2 class="panel-title">异常记录</h2><button class="secondary" id="generateGraph">重新生成 graph</button></div>
          <div class="panel-body"><div id="graphIssues"></div></div>
        </section>

        <section class="panel" data-graph-panel="presets" hidden>
          <div class="panel-header"><h2 class="panel-title">模板管理</h2><button class="secondary" id="reloadGraphPresets">重新读取</button></div>
          <div class="panel-body">
            <p class="hint">这里管理的是前台 Graph 设置里的内置模板，保存后会写入 src/data/graph-presets.json，并影响所有访客看到的内置模板。</p>
            <label>内置模板 JSON<textarea id="graphPresetsJson" class="json-editor"></textarea></label>
            <div class="actions" style="margin-top: 1rem;"><button id="saveGraphPresets">保存内置模板</button></div>
            <div style="height: 1rem"></div>
            <div id="graphPresetList"></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header"><h2 class="panel-title">Graph 管理日志</h2><button class="secondary" id="clearGraphLog">清空</button></div>
          <div class="panel-body"><pre class="status" id="graphLog">等待操作...</pre></div>
        </section>
      </div>
    </section>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const categoryLabels = { blog: '博客 blog', friends: '朋友 friends', tech: '技术 tech', other: '其他 other' };
    const categoryKeys = ['blog', 'friends', 'tech', 'other'];
    const state = {
      friends: [],
      notes: [],
      blogPosts: [],
      blogSummary: null,
      graph: null,
      graphDiagnostics: { runs: [] },
      graphPresets: [],
      translationConfig: null,
      editingFriendIndex: null,
      selectedNoteIds: new Set(),
      selectedMissingEnglishIds: new Set(),
      activePage: 'relation',
      relationView: 'source',
      blogView: 'import',
      graphView: 'overview',
      formDirty: false,
    };

    function log(message, data, scope = state.activePage) {
      const lines = [new Date().toLocaleTimeString() + ' ' + message];
      if (data !== undefined) lines.push(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
      const target = scope === 'blog' ? $('blogLog') : scope === 'graph' ? $('graphLog') : $('relationLog');
      target.textContent = lines.join('\\n') + '\\n\\n' + target.textContent;
    }

    function toast(message) {
      const target = $('toast');
      target.textContent = message;
      target.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => target.classList.remove('show'), 2200);
    }

    async function withBusy(button, label, task) {
      const originalText = button.textContent;
      button.disabled = true;
      if (button.tagName === 'BUTTON') button.textContent = label;
      try {
        return await task();
      } catch (error) {
        log('操作失败', error.message);
        throw error;
      } finally {
        button.disabled = false;
        if (button.tagName === 'BUTTON') {
          button.textContent = button.id === 'friendSubmit'
            ? (state.editingFriendIndex === null ? '新增友链' : '保存修改')
            : originalText;
        }
      }
    }

    async function api(path, options = {}) {
      const res = await fetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error('后台 API 返回了非 JSON 响应，可能访问到了 Astro dev 服务或端口被占用：' + text.slice(0, 120));
      }
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Request failed');
      return payload;
    }

    function renderFriends() {
      $('metricFriends').textContent = state.friends.length;
      $('metricGraph').textContent = state.friends.filter((friend) => friend.graph).length;
      $('metricVisible').textContent = state.friends.filter((friend) => !friend.hidden).length;
      $('metricTags').textContent = new Set(state.friends.flatMap((friend) => friend.tags || [])).size;
      $('friendsJson').value = JSON.stringify({ friends: state.friends }, null, 2);
      $('friendSubmit').textContent = state.editingFriendIndex === null ? '新增友链' : '保存修改';
      $('cancelEdit').hidden = state.editingFriendIndex === null;
      $('friendsTable').innerHTML = state.friends.map((friend, index) => '<tr class="' + (state.editingFriendIndex === index ? 'is-selected' : '') + '">' +
        '<td><strong>' + escapeHtml(friend.name) + '</strong><br><span class="pill">' + escapeHtml(friend.id) + '</span></td>' +
        '<td>' + escapeHtml(friend.category || '') + '</td>' +
        '<td>' + escapeHtml(friend.blog || friend.url || '') + '</td>' +
        '<td><div class="tag-list">' + (friend.tags || []).map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join('') + '</div></td>' +
        '<td>' + (friend.graph ? '是' : '否') + '</td>' +
        '<td>' + (friend.hidden ? '隐藏' : '显示') + '</td>' +
        '<td><div class="row-actions"><button class="secondary" data-edit-friend="' + index + '">编辑</button><button class="danger" data-delete-friend="' + index + '">删除</button></div></td>' +
      '</tr>').join('');
      document.querySelectorAll('[data-edit-friend]').forEach((button) => {
        button.addEventListener('click', () => editFriend(Number(button.dataset.editFriend)));
      });
      document.querySelectorAll('[data-delete-friend]').forEach((button) => {
        button.addEventListener('click', () => deleteFriend(Number(button.dataset.deleteFriend), button));
      });
      renderRelationViews();
    }

    function visibleFriendEntries(category) {
      return state.friends
        .map((friend, index) => ({ friend, index }))
        .filter(({ friend }) => !friend.hidden && (!category || friend.category === category))
        .sort((a, b) => {
          const aOrder = a.friend.order ?? Number.POSITIVE_INFINITY;
          const bOrder = b.friend.order ?? Number.POSITIVE_INFINITY;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.index - b.index;
        });
    }

    function renderRelationViews() {
      renderFrontCards();
      renderGraphNodes();
      renderTagsView();
    }

    function renderFrontCards() {
      const visibleGroups = categoryKeys.map((category) => ({ category, entries: visibleFriendEntries(category) }));
      const hiddenEntries = state.friends.map((friend, index) => ({ friend, index })).filter(({ friend }) => friend.hidden);
      $('frontCardsView').innerHTML = '<div class="card-groups">' + visibleGroups.map(({ category, entries }) =>
        '<section class="card-group"><div class="card-group-header"><strong>' + escapeHtml(categoryLabels[category]) + '</strong><span>' + entries.length + ' 张</span></div><div class="card-list">' +
        (entries.length ? entries.map((entry, position) => renderManagedCard(entry, position, entries.length, false)).join('') : '<p class="empty-state">这个分类暂无前台卡片。</p>') +
        '</div></section>'
      ).join('') + '<section class="card-group"><div class="card-group-header"><strong>已隐藏</strong><span>' + hiddenEntries.length + ' 条</span></div><div class="card-list">' +
        (hiddenEntries.length ? hiddenEntries.map((entry) => renderManagedCard(entry, 0, 0, true)).join('') : '<p class="empty-state">没有隐藏的友邻。</p>') +
        '</div></section></div>';

      document.querySelectorAll('[data-card-move]').forEach((button) => {
        button.addEventListener('click', () => moveFrontCard(Number(button.dataset.cardIndex), button.dataset.cardMove, button));
      });
      document.querySelectorAll('[data-card-hide]').forEach((button) => {
        button.addEventListener('click', () => setCardHidden(Number(button.dataset.cardIndex), true, button));
      });
      document.querySelectorAll('[data-card-show]').forEach((button) => {
        button.addEventListener('click', () => setCardHidden(Number(button.dataset.cardIndex), false, button));
      });
      document.querySelectorAll('[data-card-category]').forEach((select) => {
        select.addEventListener('change', () => changeCardCategory(Number(select.dataset.cardIndex), select.value, select));
      });
    }

    function renderManagedCard({ friend, index }, position, total, hidden) {
      const categoryOptions = categoryKeys.map((category) => '<option value="' + category + '" ' + (friend.category === category ? 'selected' : '') + '>' + category + '</option>').join('');
      return '<article class="managed-card">' +
        '<div class="managed-card-head"><div><h3>' + escapeHtml(friend.name) + '</h3><div class="note-meta"><span class="pill">' + escapeHtml(friend.id) + '</span><span class="pill">' + escapeHtml(friend.blog || friend.url || '') + '</span></div></div>' +
        '<div class="managed-card-actions">' +
          (hidden ? '<button data-card-show data-card-index="' + index + '">显示</button>' : '<button data-card-move="up" data-card-index="' + index + '" ' + (position === 0 ? 'disabled' : '') + '>↑ 上移</button><button data-card-move="down" data-card-index="' + index + '" ' + (position === total - 1 ? 'disabled' : '') + '>↓ 下移</button><button class="secondary" data-card-hide data-card-index="' + index + '">隐藏</button>') +
          '<select data-card-category data-card-index="' + index + '">' + categoryOptions + '</select>' +
        '</div></div>' +
        '<p>' + escapeHtml(friend.description || '暂无描述') + '</p>' +
        '<div class="tag-list" style="margin-top: 0.55rem;">' + (friend.tags || []).map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join('') + '</div>' +
      '</article>';
    }

    function renderGraphNodes() {
      const graphEntries = state.friends.map((friend, index) => ({ friend, index })).filter(({ friend }) => friend.graph);
      $('graphNodesView').innerHTML = graphEntries.length ? '<div class="card-list">' + graphEntries.map(({ friend }) =>
        '<article class="managed-card"><h3>' + escapeHtml(friend.name) + '</h3><div class="note-meta"><span class="pill">friend:' + escapeHtml(friend.id) + '</span><span class="pill">' + (friend.hidden ? '前台隐藏' : '前台显示') + '</span><span class="pill">关系：' + escapeHtml(friend.relation || '无') + '</span></div><div class="tag-list" style="margin-top: 0.55rem;">' + (friend.tags || []).map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join('') + '</div></article>'
      ).join('') + '</div>' : '<p class="empty-state">暂无图谱节点。</p>';
    }

    function renderTagsView() {
      const tagMap = new Map();
      for (const friend of state.friends) {
        for (const tag of friend.tags || []) {
          if (!tagMap.has(tag)) tagMap.set(tag, []);
          tagMap.get(tag).push(friend.name);
        }
      }
      const tags = [...tagMap.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh-CN'));
      $('tagsView').innerHTML = tags.length ? '<div class="card-list">' + tags.map(([tag, names]) =>
        '<article class="managed-card"><h3>' + escapeHtml(tag) + '</h3><div class="note-meta"><span class="pill">' + names.length + ' 位友邻</span></div><p>' + names.map(escapeHtml).join('、') + '</p></article>'
      ).join('') + '</div>' : '<p class="empty-state">暂无关系标签。</p>';
    }

    function renderNotes() {
      $('metricNotes').textContent = state.notes.length;
      $('metricCachedTranslations').textContent = state.notes.filter((note) => note.translations?.en?.cachedForCurrentSource).length;
      $('selectedNotesHint').textContent = '已选 ' + state.selectedNoteIds.size + ' / ' + state.notes.length + '。未选择时会提示是否导入全部源文。';
      $('noteList').innerHTML = state.notes.map((note, index) => '<article class="note-card ' + (state.selectedNoteIds.has(note.noteId) ? 'is-selected' : '') + '" data-note-index="' + index + '">' +
        '<h3>' + escapeHtml(note.title) + '</h3>' +
        '<div class="note-meta">' +
          '<span class="pill">' + (state.selectedNoteIds.has(note.noteId) ? '已选' : '未选') + '</span>' +
          '<span class="pill">' + escapeHtml(note.filename) + '</span>' +
          '<span class="pill">note_id: ' + escapeHtml(note.noteId) + '</span>' +
          '<span class="pill">zh: ' + (note.hasZhOutput ? '已生成' : '未生成') + '</span>' +
          '<span class="pill">en: ' + (note.translations?.en?.cachedForCurrentSource ? '缓存可用' : '缺缓存') + '</span>' +
          '<span class="pill">缓存: ' + (note.changedSinceCache ? '需更新' : '已匹配') + '</span>' +
        '</div>' +
      '</article>').join('') || '<p style="color: var(--muted);">没有扫描到 Markdown 文件。</p>';
      document.querySelectorAll('[data-note-index]').forEach((card) => {
        card.addEventListener('click', () => selectNote(Number(card.dataset.noteIndex)));
      });
    }

    function renderBlogPosts() {
      const summary = state.blogSummary || { posts: 0, missingEnglish: 0 };
      $('metricBlogPosts').textContent = summary.posts ?? state.blogPosts.length;
      $('metricMissingEnglish').textContent = summary.missingEnglish ?? 0;
      const missingEnglish = state.blogPosts.filter((post) => post.languages?.['zh-cn'] && !post.languages?.en);
      $('missingEnglishHint').textContent = '已选 ' + state.selectedMissingEnglishIds.size + ' / ' + missingEnglish.length;
      $('blogPostList').innerHTML = state.blogPosts.length ? state.blogPosts.map((post) => {
        const langs = Object.keys(post.languages || {}).sort();
        return '<article class="info-card"><h3>' + escapeHtml(post.title) + '</h3>' +
          '<div class="note-meta"><span class="pill">note_id: ' + escapeHtml(post.noteId) + '</span><span class="pill">slug: ' + escapeHtml(post.slug) + '</span><span class="pill">语言: ' + escapeHtml(langs.join(', ') || '无') + '</span>' +
          '<span class="pill">' + (post.languages?.en ? 'en 已生成' : '缺 en') + '</span><span class="pill">graphLevel: ' + escapeHtml(post.graphLevel ?? '未设置') + '</span></div>' +
          '<p>' + escapeHtml((post.tags || []).join('、') || '无标签') + '</p>' +
          '<p>' + escapeHtml((post.files || []).join('\\n')) + '</p></article>';
      }).join('') : '<p class="empty-state">没有扫描到 Blog 内容。</p>';
      $('missingEnglishList').innerHTML = missingEnglish.length ? missingEnglish.map((post) => '<article class="note-card ' + (state.selectedMissingEnglishIds.has(post.noteId) ? 'is-selected' : '') + '" data-missing-english-note-id="' + escapeHtml(post.noteId) + '"><h3>' + escapeHtml(post.title) + '</h3><div class="note-meta"><span class="pill">' + (state.selectedMissingEnglishIds.has(post.noteId) ? '已选' : '未选') + '</span><span class="pill">note_id: ' + escapeHtml(post.noteId) + '</span><span class="pill">zh-cn 来源</span><span class="pill">缺 en</span></div><p>' + escapeHtml((post.tags || []).join('、') || '无标签') + '</p></article>').join('') : '<p class="empty-state">没有缺英文的文章。</p>';
      document.querySelectorAll('[data-missing-english-note-id]').forEach((card) => {
        card.addEventListener('click', () => toggleMissingEnglish(card.dataset.missingEnglishNoteId));
      });
    }

    function fillLlmConfigForm() {
      const config = state.translationConfig || {};
      const form = $('llmConfigForm');
      form.elements.baseUrl.value = config.baseUrl || '';
      form.elements.apiKey.value = config.apiKey || '';
      form.elements.model.value = config.model || '';
      form.elements.targetLocales.value = (config.targetLocales || ['en']).join(', ');
      form.elements.translateEnabled.checked = Boolean(config.translateEnabled);
      form.elements.translateInDev.checked = Boolean(config.translateInDev);
      form.elements.forceRetranslate.checked = Boolean(config.forceRetranslate);
    }

    function configFromLlmForm() {
      const form = $('llmConfigForm');
      return {
        baseUrl: form.elements.baseUrl.value,
        apiKey: form.elements.apiKey.value,
        model: form.elements.model.value,
        targetLocales: form.elements.targetLocales.value.split(',').map((item) => item.trim()).filter(Boolean),
        translateEnabled: form.elements.translateEnabled.checked,
        translateInDev: form.elements.translateInDev.checked,
        forceRetranslate: form.elements.forceRetranslate.checked,
      };
    }

    function renderGraph() {
      const summary = state.graph?.summary || { nodes: 0, links: 0, missing: 0, types: {}, graphLevels: {} };
      $('metricGraphNodes').textContent = summary.nodes;
      $('metricGraphLinks').textContent = summary.links;
      $('metricGraphMissing').textContent = summary.missing;
      $('metricGraphPresets').textContent = state.graphPresets.length;
      const types = Object.entries(summary.types || {}).map(([key, value]) => '<span class="pill">' + escapeHtml(key) + ': ' + value + '</span>').join('');
      const levels = Object.entries(summary.graphLevels || {}).map(([key, value]) => '<span class="pill">' + escapeHtml(key) + ': ' + value + '</span>').join('');
      $('graphOverview').innerHTML = '<div class="card-list"><article class="info-card"><h3>public/graph.json</h3><p>生成时间：' + escapeHtml(state.graph?.generatedAt || '未生成') + '</p><div class="note-meta"><span class="pill">nodes: ' + summary.nodes + '</span><span class="pill">links: ' + summary.links + '</span><span class="pill">missing: ' + summary.missing + '</span></div></article><article class="info-card"><h3>类型分布</h3><div class="tag-list">' + (types || '<span class="tag">暂无</span>') + '</div></article><article class="info-card"><h3>GraphLevel 分布</h3><div class="tag-list">' + (levels || '<span class="tag">暂无</span>') + '</div></article></div>';
      renderGraphIssues();
      renderGraphPresets();
    }

    function renderGraphIssues() {
      const missing = state.graph?.missing || [];
      const runs = state.graphDiagnostics?.runs || [];
      $('graphIssues').innerHTML = '<div class="card-list"><article class="info-card"><h3>当前 Missing Wikilinks</h3><p>这些就是 pnpm dev / generate-graph 输出的 missing 信息，来源为 public/graph.json。</p></article>' +
        (missing.length ? missing.map((item) => '<article class="info-card"><h3>' + escapeHtml(item.source || 'unknown') + ' -> ' + escapeHtml(item.rawTarget || '') + '</h3><div class="note-meta"><span class="pill">normalized: ' + escapeHtml(item.normalizedTarget || '') + '</span><span class="pill">reason: ' + escapeHtml(item.reason || '') + '</span><span class="pill">heading: ' + escapeHtml(item.targetHeading || '无') + '</span></div></article>').join('') : '<p class="empty-state">当前没有 missing wikilink。</p>') +
        '<article class="info-card"><h3>最近生成记录</h3>' + (runs.length ? runs.slice(0, 8).map((run) => '<p>' + escapeHtml(run.createdAt) + '：nodes ' + run.nodes + ' / links ' + run.links + ' / missing ' + run.missing + '</p>').join('') : '<p>暂无历史。</p>') + '</article></div>';
    }

    function renderGraphPresets() {
      $('graphPresetsJson').value = JSON.stringify(state.graphPresets, null, 2);
      $('graphPresetList').innerHTML = state.graphPresets.length ? '<div class="card-list">' + state.graphPresets.map((preset) => '<article class="info-card"><h3>' + escapeHtml(preset.name) + '</h3><div class="note-meta"><span class="pill">' + escapeHtml(preset.id) + '</span><span class="pill">layout: ' + escapeHtml(preset.layout?.preset || 'force') + '</span><span class="pill">' + (preset.builtin === false ? 'custom' : 'builtin') + '</span></div><p>' + escapeHtml(preset.description || '无描述') + '</p></article>').join('') + '</div>' : '<p class="empty-state">没有模板。</p>';
    }

    function friendFromForm(formElement) {
      const form = new FormData(formElement);
      const githubId = form.get('githubId')?.toString().trim();
      const blog = form.get('blog')?.toString().trim();
      const url = form.get('url')?.toString().trim() || blog || (githubId ? 'https://github.com/' + githubId : '');
      return {
        id: form.get('id')?.toString().trim() || undefined,
        name: form.get('name')?.toString().trim(),
        url,
        blog: blog || undefined,
        description: form.get('description')?.toString().trim(),
        avatar: form.get('avatar')?.toString().trim() || undefined,
        githubId: githubId || undefined,
        tags: form.get('tags')?.toString().split(',').map((tag) => tag.trim()).filter(Boolean) || [],
        category: form.get('category')?.toString() || 'blog',
        graph: form.get('graph') === 'on',
        hidden: form.get('hidden') === 'on',
        relation: form.get('relation')?.toString().trim() || undefined,
        relationWith: form.get('relationWith')?.toString().trim() || undefined,
      };
    }

    function fillFriendForm(friend) {
      const form = $('friendForm');
      form.elements.name.value = friend.name || '';
      form.elements.id.value = friend.id || '';
      form.elements.githubId.value = friend.githubId || '';
      form.elements.blog.value = friend.blog || '';
      form.elements.url.value = friend.url || '';
      form.elements.category.value = friend.category || 'blog';
      form.elements.description.value = friend.description || '';
      form.elements.tags.value = (friend.tags || []).join(', ');
      form.elements.avatar.value = friend.avatar || '';
      form.elements.relation.value = friend.relation || '';
      form.elements.relationWith.value = friend.relationWith || '';
      form.elements.graph.checked = Boolean(friend.graph);
      form.elements.hidden.checked = Boolean(friend.hidden);
    }

    function editFriend(index) {
      state.editingFriendIndex = index;
      state.formDirty = false;
      fillFriendForm(state.friends[index]);
      renderFriends();
      $('friendForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
      log('正在编辑友链', { id: state.friends[index].id, name: state.friends[index].name });
    }

    function resetFriendForm() {
      state.editingFriendIndex = null;
      state.formDirty = false;
      $('friendForm').reset();
      renderFriends();
    }

    async function saveFriends(friends) {
      const payload = await api('/api/friends', { method: 'PUT', body: JSON.stringify({ friends }) });
      state.friends = payload.friends;
      return payload;
    }

    function selectRelationView(view) {
      state.relationView = view;
      document.querySelectorAll('[data-relation-view]').forEach((button) => {
        button.classList.toggle('active', button.dataset.relationView === view);
      });
      document.querySelectorAll('[data-relation-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.relationPanel !== view;
      });
      renderRelationViews();
    }

    function normalizeCategoryOrders(friends, category) {
      friends
        .map((friend, index) => ({ friend, index }))
        .filter(({ friend }) => !friend.hidden && friend.category === category)
        .sort((a, b) => {
          const aOrder = a.friend.order ?? Number.POSITIVE_INFINITY;
          const bOrder = b.friend.order ?? Number.POSITIVE_INFINITY;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.index - b.index;
        })
        .forEach(({ friend }, index) => {
          friend.order = (index + 1) * 10;
        });
    }

    async function saveFrontCardChange(friends, message, button) {
      await withBusy(button, '保存中...', async () => {
        const payload = await saveFriends(friends);
        renderFriends();
        selectRelationView('cards');
        log(message, payload.generated);
        toast(message);
      });
    }

    async function moveFrontCard(index, direction, button) {
      const nextFriends = structuredClone(state.friends);
      const friend = nextFriends[index];
      const entries = nextFriends
        .map((item, itemIndex) => ({ friend: item, index: itemIndex }))
        .filter((entry) => !entry.friend.hidden && entry.friend.category === friend.category)
        .sort((a, b) => {
          const aOrder = a.friend.order ?? Number.POSITIVE_INFINITY;
          const bOrder = b.friend.order ?? Number.POSITIVE_INFINITY;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.index - b.index;
        });
      const current = entries.findIndex((entry) => entry.index === index);
      const target = direction === 'up' ? current - 1 : current + 1;
      if (current < 0 || target < 0 || target >= entries.length) return;
      const currentOrder = entries[current].friend.order ?? (current + 1) * 10;
      const targetOrder = entries[target].friend.order ?? (target + 1) * 10;
      entries[current].friend.order = targetOrder;
      entries[target].friend.order = currentOrder;
      normalizeCategoryOrders(nextFriends, friend.category);
      await saveFrontCardChange(nextFriends, (direction === 'up' ? '已上移：' : '已下移：') + friend.name, button);
    }

    async function setCardHidden(index, hidden, button) {
      const nextFriends = structuredClone(state.friends);
      const friend = nextFriends[index];
      friend.hidden = hidden;
      if (!hidden) {
        const maxOrder = Math.max(0, ...nextFriends.filter((item) => !item.hidden && item.category === friend.category && item.order !== undefined).map((item) => item.order));
        friend.order = maxOrder + 10;
      }
      normalizeCategoryOrders(nextFriends, friend.category);
      await saveFrontCardChange(nextFriends, (hidden ? '已隐藏前台卡片：' : '已显示到当前分类末尾：') + friend.name, button);
    }

    async function changeCardCategory(index, category, select) {
      const nextFriends = structuredClone(state.friends);
      const friend = nextFriends[index];
      const oldCategory = friend.category;
      friend.category = category;
      friend.hidden = false;
      const maxOrder = Math.max(0, ...nextFriends.filter((item, itemIndex) => itemIndex !== index && !item.hidden && item.category === category && item.order !== undefined).map((item) => item.order));
      friend.order = maxOrder + 10;
      normalizeCategoryOrders(nextFriends, oldCategory);
      normalizeCategoryOrders(nextFriends, category);
      await saveFrontCardChange(nextFriends, '已将 ' + friend.name + ' 移动到 ' + category, select);
    }

    async function deleteFriend(index, button) {
      const friend = state.friends[index];
      if (!confirm('删除友链：' + friend.name + '？')) return;
      await withBusy(button, '删除中...', async () => {
        const nextFriends = state.friends.filter((_, itemIndex) => itemIndex !== index);
        const payload = await saveFriends(nextFriends);
        state.editingFriendIndex = null;
        renderFriends();
        log('已删除友链并重新生成数据', payload.generated);
        toast('已删除：' + friend.name);
      });
    }

    function selectNote(index) {
      const note = state.notes[index];
      if (!note) return;
      if (state.selectedNoteIds.has(note.noteId)) {
        state.selectedNoteIds.delete(note.noteId);
      } else {
        state.selectedNoteIds.add(note.noteId);
      }
      renderNotes();
      log('已选中 Obsidian 源文件', {
        filename: note.filename,
        noteId: note.noteId,
        title: note.title,
        output: note.zhOutput,
        selected: state.selectedNoteIds.has(note.noteId),
      }, 'blog');
    }

    function toggleMissingEnglish(noteId) {
      if (!noteId) return;
      if (state.selectedMissingEnglishIds.has(noteId)) {
        state.selectedMissingEnglishIds.delete(noteId);
      } else {
        state.selectedMissingEnglishIds.add(noteId);
      }
      renderBlogPosts();
    }

    function selectedNoteIdsOrAllConfirmed() {
      if (state.selectedNoteIds.size > 0) {
        return [...state.selectedNoteIds];
      }
      if (!confirm('当前没有选择源文件，将导入全部 Obsidian Markdown，是否继续？')) {
        return null;
      }
      return [];
    }

    function confirmLlmTranslation(scope, count) {
      return confirm(scope + '会把 ' + count + ' 篇文章的完整正文发送给 LLM，并产生输入和输出 token 消耗。是否继续？');
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    }

    async function refreshFriends() {
      const payload = await api('/api/friends');
      state.friends = payload.friends;
      renderFriends();
    }

    async function scanNotes() {
      const payload = await api('/api/obsidian/scan');
      state.notes = payload.notes;
      const available = new Set(state.notes.map((note) => note.noteId));
      state.selectedNoteIds = new Set([...state.selectedNoteIds].filter((noteId) => available.has(noteId)));
      renderNotes();
    }

    async function scanBlog() {
      const payload = await api('/api/blog/posts');
      state.blogPosts = payload.posts;
      state.blogSummary = payload.summary;
      const availableMissing = new Set(state.blogPosts.filter((post) => post.languages?.['zh-cn'] && !post.languages?.en).map((post) => post.noteId));
      state.selectedMissingEnglishIds = new Set([...state.selectedMissingEnglishIds].filter((noteId) => availableMissing.has(noteId)));
      renderBlogPosts();
    }

    async function loadLlmConfig() {
      const payload = await api('/api/blog/translation-config');
      state.translationConfig = payload.config;
      fillLlmConfigForm();
    }

    async function loadGraph() {
      const [snapshot, diagnostics, presets] = await Promise.all([
        api('/api/graph/snapshot'),
        api('/api/graph/diagnostics'),
        api('/api/graph/presets'),
      ]);
      state.graph = snapshot;
      state.graphDiagnostics = diagnostics;
      state.graphPresets = presets.presets;
      renderGraph();
    }

    function showPage(page) {
      state.activePage = page;
      document.querySelectorAll('[data-page]').forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.page === page);
      });
      document.querySelectorAll('[data-page-target]').forEach((button) => {
        button.classList.toggle('active', button.dataset.pageTarget === page);
      });
      location.hash = page === 'blog' ? 'blog' : page === 'graph' ? 'graph' : 'relation';
    }

    function selectBlogView(view) {
      state.blogView = view;
      document.querySelectorAll('[data-blog-view]').forEach((button) => {
        button.classList.toggle('active', button.dataset.blogView === view);
      });
      document.querySelectorAll('[data-blog-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.blogPanel !== view;
      });
    }

    function selectGraphView(view) {
      state.graphView = view;
      document.querySelectorAll('[data-graph-view]').forEach((button) => {
        button.classList.toggle('active', button.dataset.graphView === view);
      });
      document.querySelectorAll('[data-graph-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.graphPanel !== view;
      });
    }

    function hasUnsavedFriendForm() {
      if (!state.formDirty) return false;
      const form = $('friendForm');
      return Array.from(form.elements).some((element) => {
        if (!element.name) return false;
        if (element.type === 'checkbox') return element.checked !== element.defaultChecked;
        return String(element.value || '').trim().length > 0;
      });
    }

    document.querySelectorAll('[data-page-target]').forEach((button) => {
      button.addEventListener('click', () => showPage(button.dataset.pageTarget || 'relation'));
    });

    document.querySelectorAll('[data-relation-view]').forEach((button) => {
      button.addEventListener('click', () => selectRelationView(button.dataset.relationView || 'source'));
    });

    document.querySelectorAll('[data-blog-view]').forEach((button) => {
      button.addEventListener('click', () => selectBlogView(button.dataset.blogView || 'import'));
    });

    document.querySelectorAll('[data-graph-view]').forEach((button) => {
      button.addEventListener('click', () => selectGraphView(button.dataset.graphView || 'overview'));
    });

    $('friendForm').addEventListener('input', () => {
      state.formDirty = true;
    });

    $('friendForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      await withBusy($('friendSubmit'), state.editingFriendIndex === null ? '新增中...' : '保存中...', async () => {
        const friend = friendFromForm(event.currentTarget);
        const nextFriends = [...state.friends];
        if (state.editingFriendIndex === null) {
          const maxOrder = Math.max(0, ...nextFriends.filter((item) => !item.hidden && item.category === friend.category && item.order !== undefined).map((item) => item.order));
          friend.order = maxOrder + 10;
          nextFriends.push(friend);
        } else {
          friend.order = state.friends[state.editingFriendIndex].order;
          nextFriends[state.editingFriendIndex] = friend;
        }
        const payload = await saveFriends(nextFriends);
        const action = state.editingFriendIndex === null ? '已新增友链并重新生成数据' : '已保存友链并重新生成数据';
        const savedName = friend.name;
        resetFriendForm();
        log(action, payload.generated);
        toast((action.startsWith('已新增') ? '已新增：' : '已保存：') + savedName + '，目前共 ' + state.friends.length + ' 条');
      });
    });

    $('cancelEdit').addEventListener('click', resetFriendForm);

    $('saveJson').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '保存中...', async () => {
        const parsed = JSON.parse($('friendsJson').value);
        const payload = await saveFriends(Array.isArray(parsed.friends) ? parsed.friends : []);
        state.editingFriendIndex = null;
        state.formDirty = false;
        renderFriends();
        log('已保存友链 JSON 并重新生成数据', payload.generated);
        toast('已保存友链 JSON，目前共 ' + state.friends.length + ' 条');
      });
    });

    $('generateFriends').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '生成中...', async () => {
        if (hasUnsavedFriendForm() && !confirm('当前友链表单有未保存内容。重新生成不会新增或保存这条友链，是否继续？')) {
          log('已取消重新生成：表单有未保存内容');
          return;
        }
        const payload = await api('/api/friends/generate', { method: 'POST', body: '{}' });
        log('已生成友链展示和图谱数据', payload);
        toast('已重新生成展示和图谱');
        await refreshFriends();
      });
    });

    $('uploadNotes').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '上传中...', async () => {
        const files = Array.from($('mdFiles').files || []);
        if (files.length === 0) {
          log('没有选择 Markdown 文件', undefined, 'blog');
          return;
        }
        for (const file of files) {
          const content = await file.text();
          const payload = await api('/api/obsidian/upload', { method: 'POST', body: JSON.stringify({ filename: file.name, content }) });
          log('已上传 ' + file.name, payload, 'blog');
        }
        await scanNotes();
        toast('Markdown 上传完成');
      });
    });

    $('scanNotes').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '扫描中...', async () => {
        await scanNotes();
        log('Obsidian 源文件扫描完成', { count: state.notes.length }, 'blog');
        toast('扫描完成：' + state.notes.length + ' 篇');
      });
    });
    $('selectAllNotes').addEventListener('click', () => {
      state.selectedNoteIds = new Set(state.notes.map((note) => note.noteId));
      renderNotes();
      log('已全选 Obsidian 源文件', { count: state.selectedNoteIds.size }, 'blog');
    });
    $('clearSelectedNotes').addEventListener('click', () => {
      state.selectedNoteIds.clear();
      renderNotes();
      log('已清空 Obsidian 源文件选择', undefined, 'blog');
    });
    $('runImport').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '导入中...', async () => {
        const noteIds = selectedNoteIdsOrAllConfirmed();
        if (noteIds === null) return;
        if ($('translate').checked && !confirmLlmTranslation('Obsidian 导入翻译', noteIds.length || state.notes.length)) return;
        const payload = await api('/api/obsidian/import', { method: 'POST', body: JSON.stringify({ noteIds, translate: $('translate').checked, forceRetranslate: $('forceRetranslate').checked }) });
        log('Obsidian 导入完成', { selected: noteIds.length || '全部', summary: payload.summary, results: payload.results }, 'blog');
        await scanNotes();
        await scanBlog();
        toast('Obsidian 导入完成，失败 ' + (payload.summary?.failed || 0) + ' 项');
      });
    });
    $('runImportNoTranslate').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '导入中...', async () => {
        const noteIds = selectedNoteIdsOrAllConfirmed();
        if (noteIds === null) return;
        const payload = await api('/api/obsidian/import', { method: 'POST', body: JSON.stringify({ noteIds, translate: false, forceRetranslate: false }) });
        log('Obsidian 中文导入完成', { selected: noteIds.length || '全部', summary: payload.summary, results: payload.results }, 'blog');
        await scanNotes();
        await scanBlog();
        toast('中文导入完成');
      });
    });
    $('scanBlogPosts').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '扫描中...', async () => {
        await scanBlog();
        log('Blog 列表扫描完成', state.blogSummary, 'blog');
        toast('Blog 列表已刷新');
      });
    });
    $('selectAllMissingEnglish').addEventListener('click', () => {
      state.selectedMissingEnglishIds = new Set(state.blogPosts.filter((post) => post.languages?.['zh-cn'] && !post.languages?.en).map((post) => post.noteId));
      renderBlogPosts();
      log('已全选缺英文文章', { count: state.selectedMissingEnglishIds.size }, 'blog');
    });
    $('clearSelectedMissingEnglish').addEventListener('click', () => {
      state.selectedMissingEnglishIds.clear();
      renderBlogPosts();
      log('已清空缺英文文章选择', undefined, 'blog');
    });
    $('translateMissingEnglish').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '翻译中...', async () => {
        if (state.selectedMissingEnglishIds.size === 0) {
          log('没有选择缺英文文章', undefined, 'blog');
          toast('请先选择缺英文文章');
          return;
        }
        if (!confirmLlmTranslation('缺英文批量翻译', state.selectedMissingEnglishIds.size)) return;
        const payload = await api('/api/blog/translate-missing', { method: 'POST', body: JSON.stringify({ noteIds: [...state.selectedMissingEnglishIds] }) });
        log('缺英文文章批量翻译完成', { summary: payload.summary, results: payload.results }, 'blog');
        await scanBlog();
        toast('批量翻译完成，失败 ' + (payload.summary?.failed || 0) + ' 项');
      });
    });
    $('reloadLlmConfig').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '读取中...', async () => {
        await loadLlmConfig();
        log('LLM 配置已读取', state.translationConfig, 'blog');
        toast('LLM 配置已读取');
      });
    });
    $('llmConfigForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      await withBusy($('saveLlmConfig'), '保存中...', async () => {
        const payload = await api('/api/blog/translation-config', { method: 'PUT', body: JSON.stringify(configFromLlmForm()) });
        state.translationConfig = payload.config;
        fillLlmConfigForm();
        log('LLM 配置已保存', { file: payload.relativeFile, config: payload.config }, 'blog');
        toast('LLM 配置已保存');
      });
    });
    $('reloadGraph').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '读取中...', async () => {
        await loadGraph();
        log('Graph 快照已读取', state.graph.summary, 'graph');
        toast('Graph 已刷新');
      });
    });
    $('generateGraph').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '生成中...', async () => {
        const payload = await api('/api/graph/generate', { method: 'POST', body: '{}' });
        state.graph = payload.snapshot;
        state.graphDiagnostics = payload.diagnostics;
        renderGraph();
        log('Graph 已重新生成', { summary: state.graph.summary, stdout: payload.stdout, stderr: payload.stderr }, 'graph');
        toast('Graph 已重新生成');
      });
    });
    $('reloadGraphPresets').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '读取中...', async () => {
        const payload = await api('/api/graph/presets');
        state.graphPresets = payload.presets;
        renderGraph();
        log('Graph 模板已读取', { count: state.graphPresets.length }, 'graph');
        toast('Graph 模板已读取');
      });
    });
    $('saveGraphPresets').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '保存中...', async () => {
        const presets = JSON.parse($('graphPresetsJson').value);
        const payload = await api('/api/graph/presets', { method: 'PUT', body: JSON.stringify({ presets }) });
        state.graphPresets = payload.presets;
        renderGraph();
        log('Graph 内置模板已保存', { file: payload.file, count: payload.presets.length }, 'graph');
        toast('Graph 内置模板已保存');
      });
    });
    $('devSync').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '重建中...', async () => {
        const payload = await api('/api/dev-sync', { method: 'POST', body: '{}' });
        log('开发数据重建完成', payload, state.activePage);
        toast('图谱和搜索已重建');
      });
    });
    $('refreshCurrent').addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, '刷新中...', async () => {
        if (state.activePage === 'blog') {
          log('开始刷新 Blog 管理状态...', undefined, 'blog');
          await scanNotes();
          await scanBlog();
          await loadLlmConfig();
          log('Blog 管理状态已刷新', { notes: state.notes.length, blog: state.blogSummary }, 'blog');
          toast('Blog 状态已刷新');
          return;
        }

        if (state.activePage === 'graph') {
          log('开始刷新 Graph 管理状态...', undefined, 'graph');
          await loadGraph();
          log('Graph 管理状态已刷新', state.graph.summary, 'graph');
          toast('Graph 状态已刷新');
          return;
        }

        log('开始刷新友邻管理状态...');
        await refreshFriends();
        log('友邻管理状态已刷新', {
          friends: state.friends.length,
          graph: state.friends.filter((friend) => friend.graph).length,
          visible: state.friends.filter((friend) => !friend.hidden).length,
          tags: new Set(state.friends.flatMap((friend) => friend.tags || [])).size,
        });
        toast('友邻状态已刷新');
      });
    });
    $('clearRelationLog').addEventListener('click', () => { $('relationLog').textContent = ''; });
    $('clearBlogLog').addEventListener('click', () => { $('blogLog').textContent = ''; });
    $('clearGraphLog').addEventListener('click', () => { $('graphLog').textContent = ''; });

    showPage(location.hash === '#blog' || location.hash === '#md-auto-blog' ? 'blog' : location.hash === '#graph' ? 'graph' : 'relation');
    selectRelationView('source');
    selectBlogView('import');
    selectGraphView('overview');
    log('友邻管理页面已加载，正在拉取初始状态...', undefined, 'relation');
    refreshFriends()
      .then(() => {
        log('友链初始状态已加载', {
          friends: state.friends.length,
          graph: state.friends.filter((friend) => friend.graph).length,
          visible: state.friends.filter((friend) => !friend.hidden).length,
        }, 'relation');
        return Promise.all([scanNotes(), scanBlog(), loadLlmConfig(), loadGraph()]);
      })
      .then(() => {
        log('Blog 初始状态已加载', { notes: state.notes.length, blog: state.blogSummary }, 'blog');
        log('Graph 初始状态已加载', state.graph?.summary, 'graph');
      })
      .catch((error) => log('初始化失败', error.message, state.activePage));
  </script>
</body>
</html>`;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/friends') {
    jsonResponse(res, 200, await readFriendsSource());
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/friends') {
    const body = await readJsonBody(req);
    const source = await writeFriendsSource(Array.isArray(body.friends) ? body.friends : []);
    const generated = await generateFriendsData();
    jsonResponse(res, 200, { ...source, generated });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/friends/add') {
    const friend = await readJsonBody(req);
    const source = await readFriendsSource();
    source.friends.push(friend);
    const saved = await writeFriendsSource(source.friends);
    const generated = await generateFriendsData();
    jsonResponse(res, 200, { ...saved, generated });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/friends/generate') {
    jsonResponse(res, 200, await generateFriendsData());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/obsidian/scan') {
    jsonResponse(res, 200, { notes: await scanObsidianSources() });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/obsidian/upload') {
    jsonResponse(res, 200, await saveUploadedObsidianNote(await readJsonBody(req)));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/obsidian/import') {
    const body = await readJsonBody(req);
    const result = await withAdminTranslationEnv({
      translateEnabled: body.translate,
      forceRetranslate: body.forceRetranslate,
    }, () => runObsidianImport({
      context: 'dev',
      sources: body.sources,
      noteIds: body.noteIds,
    }));
    jsonResponse(res, 200, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/blog/posts') {
    jsonResponse(res, 200, await scanBlogPosts());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/blog/translation-config') {
    jsonResponse(res, 200, await readAdminTranslationConfig());
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/blog/translation-config') {
    jsonResponse(res, 200, await writeAdminTranslationConfig(await readJsonBody(req)));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/blog/translate-missing') {
    const body = await readJsonBody(req);
    const result = await withAdminTranslationEnv({
      translateEnabled: true,
      forceRetranslate: body.forceRetranslate,
    }, () => translateMissingEnglishPosts({ noteIds: body.noteIds }));
    jsonResponse(res, 200, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/graph/snapshot') {
    jsonResponse(res, 200, await readGraphSnapshot());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/graph/diagnostics') {
    jsonResponse(res, 200, await readGraphDiagnostics());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/graph/presets') {
    jsonResponse(res, 200, await readGraphPresets());
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/graph/presets') {
    const body = await readJsonBody(req);
    jsonResponse(res, 200, await writeGraphPresets(body.presets));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/graph/generate') {
    const output = await runNodeScript(path.join(ROOT, 'scripts/generate-graph.mjs'));
    jsonResponse(res, 200, {
      ...output,
      snapshot: await readGraphSnapshot(),
      diagnostics: await readGraphDiagnostics(),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/dev-sync') {
    const friends = await generateFriendsData();
    const graph = await runNodeScript(path.join(ROOT, 'scripts/generate-graph.mjs'));
    const search = await runNodeScript(path.join(ROOT, 'scripts/build-dev-search-index.mjs'));
    jsonResponse(res, 200, { friends, graph, search });
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  try {
    if (url.pathname === '/') {
      htmlResponse(res, pageHtml());
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    jsonResponse(res, 404, { error: 'Not found' });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Goosequill dev admin: http://${HOST}:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Goosequill dev admin port ${PORT} is already in use. Set ADMIN_DEV_PORT to another port, for example: ADMIN_DEV_PORT=4324 npm run admin`);
    process.exit(1);
  }

  throw error;
});
