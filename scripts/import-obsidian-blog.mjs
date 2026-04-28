import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';

const SOURCE_GLOB = 'src/content/my_md/*.md';
const TARGET_DIR = path.join(process.cwd(), 'src/content/blog');

function cleanString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : undefined;
}

function normalizeDateValue(value) {
  const stringValue = cleanString(value);
  return stringValue || undefined;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const stringValue = cleanString(value);
  return stringValue ? [stringValue] : [];
}

function sanitizeNoteId(value) {
  const stringValue = cleanString(value);
  if (!stringValue) {
    return undefined;
  }

  return stringValue.replace(/\s+/g, '');
}

function deriveNoteId(frontmatter) {
  const explicitId = sanitizeNoteId(frontmatter.note_id ?? frontmatter['笔记ID']);
  if (explicitId) {
    return explicitId;
  }

  const createdAt = normalizeDateValue(frontmatter.created_at ?? frontmatter.creation_time ?? frontmatter.createTime);
  if (!createdAt) {
    return undefined;
  }

  const digits = createdAt.replace(/\D/g, '');
  return digits || undefined;
}

function deriveTitle(frontmatter, filePath) {
  const explicitTitle = cleanString(frontmatter.title);
  if (explicitTitle) {
    return explicitTitle;
  }

  return path.basename(filePath, path.extname(filePath));
}

function deriveDescription(frontmatter, title) {
  const rawDescription = cleanString(frontmatter.description);
  if (rawDescription && rawDescription.toLowerCase() !== 'null') {
    return rawDescription;
  }

  return `${title} 的导入笔记`;
}

function transformMetaBindEmbeds(markdown) {
  return markdown.replace(/```meta-bind-embed[\s\S]*?```\n*/g, '');
}

function transformDataviewBlocks(markdown) {
  return markdown.replace(/```dataview[\s\S]*?```/g, '> [!note]\n> 原始笔记中的 Dataview 查询未在网站端执行，后续可改为静态列表或图谱入口。');
}

function stripHtmlComments(markdown) {
  return markdown.replace(/<!--([\s\S]*?)-->/g, '');
}

function normalizeCodeFenceLanguages(markdown) {
  return markdown
    .replace(/```pwndbg\b/g, '```txt')
    .replace(/```IDA\b/g, '```txt');
}

function injectRelationshipNotice(markdown, rawLinkField) {
  const links = normalizeArray(rawLinkField);
  if (links.length === 0) {
    return markdown;
  }

  const block = [
    '> [!note]',
    ...links.map((link) => `> 关联入口：${link}`),
    '',
  ].join('\n');

  return `${block}${markdown}`;
}

function buildFrontmatter(sourcePath, frontmatter) {
  const title = deriveTitle(frontmatter, sourcePath);
  const noteId = deriveNoteId(frontmatter);
  const createdAt = normalizeDateValue(frontmatter.created_at ?? frontmatter.creation_time ?? frontmatter.createTime);

  if (!noteId) {
    throw new Error(`Missing note_id and unable to derive one from created_at: ${sourcePath}`);
  }

  if (!createdAt) {
    throw new Error(`Missing created_at/creation_time/createTime: ${sourcePath}`);
  }

  return {
    title,
    description: deriveDescription(frontmatter, title),
    note_id: noteId,
    note_type: cleanString(frontmatter.note_type ?? frontmatter['笔记类型']),
    created_at: createdAt,
    updated_at: normalizeDateValue(frontmatter.updated_at ?? frontmatter.modify_time),
    tags: normalizeArray(frontmatter.tags),
    aliases: normalizeArray(frontmatter.aliases),
    cssclasses: normalizeArray(frontmatter.cssclasses),
  };
}

function serializeFrontmatter(data) {
  const lines = ['---'];

  const pushArray = (key, values) => {
    if (values.length === 0) {
      lines.push(`${key}: []`);
      return;
    }

    lines.push(`${key}:`);
    for (const value of values) {
      lines.push(`  - ${JSON.stringify(value)}`);
    }
  };

  lines.push(`title: ${JSON.stringify(data.title)}`);
  lines.push(`description: ${JSON.stringify(data.description)}`);
  lines.push(`note_id: ${JSON.stringify(data.note_id)}`);
  if (data.note_type) {
    lines.push(`note_type: ${JSON.stringify(data.note_type)}`);
  }
  lines.push(`created_at: ${data.created_at}`);
  if (data.updated_at) {
    lines.push(`updated_at: ${data.updated_at}`);
  }

  pushArray('tags', data.tags);
  pushArray('aliases', data.aliases);
  pushArray('cssclasses', data.cssclasses);

  lines.push('---', '');
  return lines.join('\n');
}

async function importOne(filePath) {
  const rawSource = await fs.readFile(filePath, 'utf8');
  const { data, content } = matter(rawSource);
  const normalizedFrontmatter = buildFrontmatter(filePath, data);

  let transformedContent = content;
  transformedContent = transformMetaBindEmbeds(transformedContent);
  transformedContent = transformDataviewBlocks(transformedContent);
  transformedContent = stripHtmlComments(transformedContent);
  transformedContent = normalizeCodeFenceLanguages(transformedContent);
  transformedContent = injectRelationshipNotice(transformedContent.trimStart(), data.Link);

  const outputDir = path.join(TARGET_DIR, normalizedFrontmatter.note_id);
  const outputFile = path.join(outputDir, 'index_zh-cn.mdx');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, `${serializeFrontmatter(normalizedFrontmatter)}${transformedContent.trim()}\n`);

  return {
    source: filePath,
    output: outputFile,
    noteId: normalizedFrontmatter.note_id,
  };
}

async function main() {
  const files = await fg(SOURCE_GLOB, { absolute: true });
  const results = [];

  for (const filePath of files) {
    results.push(await importOne(filePath));
  }

  console.log(`Imported ${results.length} Obsidian notes.`);
  for (const result of results) {
    console.log(`- ${path.basename(result.source)} -> ${path.relative(process.cwd(), result.output)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
