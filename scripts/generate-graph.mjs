import fs from 'node:fs/promises';
import path from 'node:path';
import { buildContentIndex } from '../src/utils/content-index.mjs';
import { parseWikiLink, slugifyHeading } from '../src/utils/wiki.mjs';

const OUTPUT_FILE = path.join(process.cwd(), 'public/graph.json');

function extractWikiLinks(markdown) {
  const regex = /!?\[\[[^\]]+\]\]/g;
  const links = [];
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const parsed = parseWikiLink(match[0]);
    if (parsed.isEmbed || !parsed.target) {
      continue;
    }

    links.push(parsed);
  }

  return links;
}

async function main() {
  const contentIndex = await buildContentIndex();
  const nodes = [...contentIndex.nodesById.values()].map((node) => ({
    id: node.id,
    titles: node.titles,
    urls: node.urls,
    tags: node.tags,
    type: node.type,
    lang: node.lang,
    aliases: node.aliases,
  }));

  const links = [];
  const missing = [];
  const seenLinks = new Set();

  for (const entry of contentIndex.entries) {
    const sourceId = entry.noteId;
    for (const parsed of extractWikiLinks(entry.content)) {
      const resolved = contentIndex.resolveWikiTarget(parsed.target, entry.lang ?? 'en');
      if (resolved.status !== 'resolved') {
        missing.push({
          source: sourceId,
          rawTarget: parsed.target,
          normalizedTarget: resolved.normalizedTarget,
          targetHeading: parsed.heading ? slugifyHeading(parsed.heading) : undefined,
          reason: resolved.reason,
        });
        continue;
      }

      const edge = {
        source: sourceId,
        target: resolved.noteId,
        exists: true,
        targetHeading: parsed.heading ? slugifyHeading(parsed.heading) : undefined,
      };
      const edgeKey = `${edge.source}::${edge.target}::${edge.targetHeading ?? ''}`;
      if (!seenLinks.has(edgeKey)) {
        seenLinks.add(edgeKey);
        links.push(edge);
      }
    }
  }

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        nodes,
        links,
        missing,
      },
      null,
      2,
    ),
  );

  for (const warning of contentIndex.warnings) {
    console.warn(warning);
  }

  if (missing.length > 0) {
    console.warn(`Missing wikilinks: ${missing.length}`);
    for (const item of missing) {
      console.warn(`- ${item.source} -> ${item.rawTarget}`);
    }
  }

  console.log(`Generated ${OUTPUT_FILE}`);
  console.log(`nodes: ${nodes.length}`);
  console.log(`links: ${links.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
