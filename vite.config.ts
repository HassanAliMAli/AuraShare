import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'es2022',
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
    // inside the project root. Without this the dev server watches those
    // files and can full-reload the page mid-transfer, which breaks any
    // browser-driven session (including the Playwright E2E suite).
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
