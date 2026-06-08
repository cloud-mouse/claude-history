import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// Read version from package.json at build time
const pkgVersion = require('./package.json').version;

export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
