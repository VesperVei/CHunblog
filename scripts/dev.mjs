import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const ASTRO_BIN = path.join(ROOT, 'node_modules/.bin/astro');

let running = false;
let queued = false;
function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        OBSIDIAN_IMPORT_CONTEXT: 'dev',
      },
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
    await runNodeScript(path.join(ROOT, 'scripts/generate-friends-data.mjs'));
    await runNodeScript(path.join(ROOT, 'scripts/generate-graph.mjs'));
    await runNodeScript(path.join(ROOT, 'scripts/build-dev-search-index.mjs'));
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

async function main() {
  await syncImportedContent();

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
