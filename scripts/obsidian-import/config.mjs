import path from 'node:path';

export const ROOT = process.cwd();
export const SOURCE_GLOB = 'src/content/my_md/*.md';
export const SOURCE_DIR = path.join(ROOT, 'src/content/my_md');
export const TARGET_DIR = path.join(ROOT, 'src/content/blog');
export const CACHE_DIR = path.join(ROOT, '.cache', 'obsidian-import');
export const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');
export const IMPORT_CONTEXT = process.env.OBSIDIAN_IMPORT_CONTEXT ?? 'build';
export const SOURCE_LOCALE = 'zh-cn';
export const CACHE_VERSION = 1;
