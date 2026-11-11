import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// This config lives in frontend/, so the Vite root is this directory and the
// production bundle is emitted to the repository-level dist/ that the Worker
// serves (see backend/wrangler.toml → assets.directory).
const root = import.meta.dirname

export default defineConfig({
  root,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(root, './src'),
    },
  },
  build: {
    target: 'es2022',
    // Relative to `root` (frontend/), so the bundle lands in <repo>/dist.
    outDir: path.resolve(root, '../dist'),
    // The outDir sits outside the Vite root — without this Vite refuses to
    // clear it and prints a warning on every build.
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor';
          if (id.includes('node_modules/framer-motion')) return 'motion';
        },
      },
    },
  },
  server: {
    // Wrangler writes Durable Object state and build output into .wrangler/
    // (backend/.wrangler/ when running from the backend config). Without this
    // the dev server watches those files and can full-reload the page
    // mid-transfer, which breaks any browser-driven session (including the
    // Playwright E2E suite).
    watch: {
      ignored: ['**/.wrangler/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
