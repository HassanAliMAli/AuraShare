import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Type-aware rules for both runtimes.
 *
 * `no-floating-promises` is the reason for the parser service: this code is
 * async-heavy (fetch, WebRTC, clipboard), and a promise that is neither
 * awaited nor deliberately voided is a lost error path. Keep the rest of the
 * type-checked preset off for now — enabling it wholesale would bury this
 * rule in a large, unrelated diff.
 */
const typeAware = {
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
  },
}

export default defineConfig([
  globalIgnores(['dist']),

  {
    // The React app runs in a browser environment.
    files: ['frontend/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      typeAware,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The Worker runs on the Cloudflare runtime, not a browser — no `window`,
    // no `document`. Keep the two runtimes separate so a browser-only global
    // slipping into backend/ is caught by the linter, not by production.
    files: ['backend/**/*.ts', 'shared/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended, typeAware],
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
