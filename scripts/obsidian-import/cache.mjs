import fs from 'node:fs/promises';
import { CACHE_DIR, CACHE_FILE, CACHE_VERSION } from './config.mjs';

export async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.version !== CACHE_VERSION || typeof parsed.documents !== 'object' || !parsed.documents) {
      return { version: CACHE_VERSION, documents: {} };
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: CACHE_VERSION, documents: {} };
    throw error;
  }
}

export async function saveCache(cache) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}
