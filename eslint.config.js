import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'test-results', 'playwright-report']),

  {
    // The React app and its tests run in a browser (jsdom) environment.
    files: ['frontend/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The Worker runs on the Cloudflare runtime, not a browser — no `window`,
    // no `document`. Keep the two runtimes separate so a browser-only global
    // slipping into backend/ is caught by the linter, not by production.
    files: ['backend/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    // React Fast Refresh only applies to the React app.
    files: ['frontend/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite],
  },
])
