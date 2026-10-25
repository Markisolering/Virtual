import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Versionsnamn som visas i appen, t.ex. "2026-10-25 08:30 · a764e2b"
function appVersion() {
  let sha = process.env.GITHUB_SHA?.slice(0, 7);
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = 'lokal';
    }
  }
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `${date} · ${sha}`;
}
const VERSION = appVersion();
const BUILD_ID = `${Date.now().toString(36)}-${VERSION.split(' · ')[1]}`;

// Stämplar service workern med ett unikt bygg-id så att webbläsaren upptäcker nya versioner
const stampServiceWorker = {
  name: 'stamp-service-worker',
  apply: 'build',
  writeBundle(options) {
    const file = join(options.dir, 'sw.js');
    if (existsSync(file)) writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_ID__', BUILD_ID));
  },
};

// Relativ bas så att bygget fungerar från valfri undermapp (t.ex. GitHub Pages)
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [stampServiceWorker],
  build: { chunkSizeWarningLimit: 1200 },
});
