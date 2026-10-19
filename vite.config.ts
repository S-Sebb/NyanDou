import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: mode === 'test' ? '.test-dist' : 'dist',
    assetsInlineLimit: 0,
    sourcemap: false,
    rolldownOptions: {
      input: mode === 'test' ? ['index.html', 'tests/browser.html', 'tests/pixel-experiment.html'] : 'index.html',
    },
  },
}));
