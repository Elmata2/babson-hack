import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * The app and the library both import through the `@/` alias that `tsconfig.json`
 * declares. Vitest does not read tsconfig `paths`, so the same mapping has to be
 * declared here or an `@/` import in a route file resolves to a package that does
 * not exist.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    reporters: ['default'],
  },
})
