import { defineConfig } from 'vite';

// Relativ bas så att bygget fungerar från valfri undermapp (t.ex. GitHub Pages)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
