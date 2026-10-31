import { defineConfig } from 'vite';

// dev: repo root is served, so open /site/viewer.html and `../examples/*.md` resolves.
// build: site/ is the root and the output goes to docs/ (served as docs/viewer.html).
export default defineConfig(({ command }) => ({
  root: command === 'build' ? 'site' : '.',
  base: './',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    rollupOptions: { input: 'viewer.html' }
  },
  optimizeDeps: { exclude: ['maplibre-gl'] }
}));
