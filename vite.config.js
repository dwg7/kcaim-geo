import { defineConfig } from 'vite';

// dev: repo root is served, so open /site/viewer.html?kcaim-geo=../docs/examples/<name>.md.
// build: site/ is the root and the output goes to docs/ (served as docs/viewer.html).
// docs/examples/ holds the .md instances, so docs/ is not emptied; `npm run build` cleans docs/assets itself.
export default defineConfig(({ command }) => ({
  root: command === 'build' ? 'site' : '.',
  base: './',
  build: {
    outDir: '../docs',
    emptyOutDir: false,
    rollupOptions: { input: 'viewer.html' }
  },
  optimizeDeps: { exclude: ['maplibre-gl'] }
}));
