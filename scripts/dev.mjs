import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const IMPORT_SOURCE_DIR = path.join(ROOT, 'src/content/my_md');
const ASTRO_BIN = path.join(ROOT, 'node_modules/.bin/astro');

let running = false;
let queued = false;
let debounceTimer;

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptPath} exited with code ${code}`));
    });
  });
}

async function syncImportedContent() {
  if (running) {
    queued = true;
    return;
  }

  running = true;

  try {
    await runNodeScript(path.join(ROOT, 'scripts/import-obsidian-blog.mjs'));
    await runNodeScript(path.join(ROOT, 'scripts/generate-graph.mjs'));
  } catch (error) {
    console.error('[dev-sync] sync failed:', error.message);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      await syncImportedContent();
    }
  }
}

function scheduleSync(reason) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`[dev-sync] detected ${reason}, re-importing Obsidian sources...`);
    void syncImportedContent();
  }, 150);
}

function watchImportSources() {
  if (!fs.existsSync(IMPORT_SOURCE_DIR)) {
    return;
  }

  fs.watch(IMPORT_SOURCE_DIR, { recursive: true }, (_eventType, filename) => {
    if (!filename || !filename.endsWith('.md')) {
      return;
    }

    scheduleSync(filename);
  });
}

async function main() {
  await syncImportedContent();
  watchImportSources();

  const astro = spawn(ASTRO_BIN, ['dev'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  astro.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
