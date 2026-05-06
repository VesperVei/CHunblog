import fs from 'node:fs/promises';
import path from 'node:path';
import { readGraphSnapshot, recordGraphDiagnostics } from './lib/admin-content.mjs';
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

function pushUnique(list, value) {
  if (value && !list.includes(value)) {
    list.push(value);
  }
}

function getMissingNodeId(normalizedTarget) {
  return `missing:${normalizedTarget}`;
}

async function main() {
  const contentIndex = await buildContentIndex();
  const nodes = [...contentIndex.nodesById.values()].map((node) => ({
    id: node.id,
    kind: 'note',
    path: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    titles: node.titles,
    urls: node.urls,
    tags: node.tags,
    type: node.type,
    lang: node.lang,
    aliases: node.aliases,
    role: node.role,
    graphLevel: node.graphLevel,
    metadata: node.metadata,
  }));

  const links = [];
  const missing = [];
  const missingNodesById = new Map();
  const seenLinks = new Set();

  for (const entry of contentIndex.entries) {
    const sourceId = entry.noteId;
    const sourceLang = entry.lang ?? 'en';
    for (const parsed of extractWikiLinks(entry.content)) {
      const resolved = contentIndex.resolveWikiTarget(parsed.target, entry.lang ?? 'en');
      if (resolved.status !== 'resolved') {
        const missingNodeId = getMissingNodeId(resolved.normalizedTarget);
        const existingMissingNode = missingNodesById.get(missingNodeId) ?? {
          id: missingNodeId,
          kind: 'missing_note',
          exists: false,
          unresolvedKey: resolved.normalizedTarget,
          titles: {},
          urls: {},
          tags: [],
          type: 'missing_note',
          lang: sourceLang,
          aliases: [],
          metadata: {},
          missing: {
            rawTargets: [],
            normalizedTarget: resolved.normalizedTarget,
            sources: [],
            reason: resolved.reason,
          },
        };

        existingMissingNode.titles[sourceLang] = existingMissingNode.titles[sourceLang] || parsed.target;
        pushUnique(existingMissingNode.aliases, parsed.target);
        pushUnique(existingMissingNode.missing.rawTargets, parsed.target);
        pushUnique(existingMissingNode.missing.sources, sourceId);
        missingNodesById.set(missingNodeId, existingMissingNode);

        missing.push({
          source: sourceId,
          rawTarget: parsed.target,
          normalizedTarget: resolved.normalizedTarget,
          targetHeading: parsed.heading ? slugifyHeading(parsed.heading) : undefined,
          reason: resolved.reason,
        });

        const edge = {
          source: sourceId,
          target: missingNodeId,
          exists: false,
          targetHeading: parsed.heading ? slugifyHeading(parsed.heading) : undefined,
        };
        const edgeKey = `${edge.source}::${edge.target}::${edge.targetHeading ?? ''}`;
        if (!seenLinks.has(edgeKey)) {
          seenLinks.add(edgeKey);
          links.push(edge);
        }
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

  nodes.push(...missingNodesById.values());

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

  await recordGraphDiagnostics({ graph: await readGraphSnapshot() });

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
