import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, SOURCE_DIR } from './config.mjs';

export async function saveUploadedObsidianNote({ filename, content }) {
  const safeName = path.basename(String(filename || '')).replace(/[^\w.\-\u4e00-\u9fa5]/g, '-');
  if (!safeName || !safeName.endsWith('.md')) {
    throw new Error('Uploaded note filename must end with .md');
  }

  await fs.mkdir(SOURCE_DIR, { recursive: true });
  const outputFile = path.join(SOURCE_DIR, safeName);
  await fs.writeFile(outputFile, String(content ?? ''));
  return {
    outputFile,
    relativeOutput: path.relative(ROOT, outputFile),
  };
}
