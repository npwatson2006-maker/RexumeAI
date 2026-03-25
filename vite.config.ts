import { defineConfig } from 'vite';

export default defineConfig({
  // Serve static assets (frames/, css/, js/) from project root
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
