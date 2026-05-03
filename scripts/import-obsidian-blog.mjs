export {
  importOne,
  runObsidianImport,
  saveUploadedObsidianNote,
  scanObsidianSources,
  summarizeResults,
} from './obsidian-import/index.mjs';

import { printCliSummary } from './obsidian-import/index.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  printCliSummary().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
