import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Multi-page: both the landing page and dashboard are entry points
      input: {
        main:           resolve(__dirname, 'index.html'),
        dashboard:      resolve(__dirname, 'dashboard.html'),
        resetPassword:  resolve(__dirname, 'reset-password.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@lib': resolve(__dirname, 'src/lib'),
    },
  },
});
