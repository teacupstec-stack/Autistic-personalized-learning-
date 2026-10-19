import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      contracts: path.resolve(__dirname, './contracts'),
      content: path.resolve(__dirname, './content'),
      models: path.resolve(__dirname, './models'),
      eval: path.resolve(__dirname, './eval')
    }
  },
  server: {
    port: 3000,
    open: false
  },
  build: {
    outDir: 'build',
    emptyOutDir: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
});
