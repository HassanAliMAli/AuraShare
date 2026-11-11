import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Playwright owns test/e2e — its specs must not be collected by Vitest.
    exclude: [...configDefaults.exclude, 'test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cover the whole app, not just the pure helpers — the stores and the
      // components are where the real behaviour lives. main.tsx is the entry
      // point and is only exercised by the browser suite.
      include: ['src/**'],
      exclude: ['src/main.tsx'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
