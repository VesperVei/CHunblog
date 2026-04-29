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

function normalizeGraphLevelValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(10, value));
  }

  const stringValue = cleanString(value);
  if (!stringValue) {
    return undefined;
  }

  const digitMatch = stringValue.match(/(\d{1,2})/);
  if (digitMatch) {
    return Math.max(0, Math.min(10, Number(digitMatch[1])));
  }

  const normalized = stringValue.replace(/\s+/g, '');
  const explicitMap = new Map([
    ['根节点', 0],
    ['零级节点', 0],
    ['一级节点', 1],
    ['二级节点', 2],
    ['三级节点', 3],
    ['四级节点', 4],
    ['五级节点', 5],
    ['六级节点', 6],
    ['七级节点', 7],
    ['八级节点', 8],
    ['九级节点', 9],
    ['十级节点', 10],
  ]);

  return explicitMap.get(normalized);
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
    normalized: {
      title,
      description: deriveDescription(frontmatter, title),
      note_id: noteId,
      note_type: cleanString(frontmatter.note_type ?? frontmatter['笔记类型']),
      created_at: createdAt,
      updated_at: normalizeDateValue(frontmatter.updated_at ?? frontmatter.modify_time),
      tags: normalizeArray(frontmatter.tags),
      aliases: normalizeArray(frontmatter.aliases),
      cssclasses: normalizeArray(frontmatter.cssclasses),
      graphLevel: normalizeGraphLevelValue(frontmatter.graphLevel ?? frontmatter.role),
    },
    preserved: Object.fromEntries(Object.entries(frontmatter).filter(([key]) => key !== 'role')),
  };
}

function serializeScalar(value) {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  return JSON.stringify(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function serializeYamlEntry(key, value, indent = 0) {
  const padding = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${padding}${key}: []`];
    }

    const lines = [`${padding}${key}:`];
    for (const item of value) {
      if (isPlainObject(item)) {
        lines.push(`${padding}  -`);
        for (const [nestedKey, nestedValue] of Object.entries(item)) {
          lines.push(...serializeYamlEntry(nestedKey, nestedValue, indent + 4));
        }
      } else {
        lines.push(`${padding}  - ${serializeScalar(item)}`);
      }
    }
    return lines;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return [`${padding}${key}: {}`];
    }

    const lines = [`${padding}${key}:`];
    for (const [nestedKey, nestedValue] of entries) {
      lines.push(...serializeYamlEntry(nestedKey, nestedValue, indent + 2));
    }
    return lines;
  }

  return [`${padding}${key}: ${serializeScalar(value)}`];
}

function serializeFrontmatter(normalized, preserved) {
  const lines = ['---'];

  for (const [key, value] of Object.entries(normalized)) {
    if (value === undefined) {
      continue;
    }
    lines.push(...serializeYamlEntry(key, value));
  }

  const normalizedKeys = new Set(Object.keys(normalized));
  for (const [key, value] of Object.entries(preserved)) {
    if (normalizedKeys.has(key)) {
      continue;
    }

    lines.push(...serializeYamlEntry(key, value));
  }

  lines.push('---', '');
  return lines.join('\n');
}

async function importOne(filePath) {
  const rawSource = await fs.readFile(filePath, 'utf8');
  const { data, content } = matter(rawSource);
  const { normalized, preserved } = buildFrontmatter(filePath, data);

  let transformedContent = content;
  transformedContent = transformMetaBindEmbeds(transformedContent);
  transformedContent = transformDataviewBlocks(transformedContent);
  transformedContent = stripHtmlComments(transformedContent);
  transformedContent = normalizeCodeFenceLanguages(transformedContent);
  transformedContent = injectRelationshipNotice(transformedContent.trimStart(), data.Link);

  const outputDir = path.join(TARGET_DIR, normalized.note_id);
  const outputFile = path.join(outputDir, 'index_zh-cn.mdx');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, `${serializeFrontmatter(normalized, preserved)}${transformedContent.trim()}\n`);

  return {
    source: filePath,
    output: outputFile,
    noteId: normalized.note_id,
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
