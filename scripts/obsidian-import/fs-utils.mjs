import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './utils.mjs';

export async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeIfChanged(filePath, content) {
  const existing = await readFileIfExists(filePath);
  if (existing === content) {
    return { changed: false, hash: sha256(content) };
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return { changed: true, hash: sha256(content) };
}
