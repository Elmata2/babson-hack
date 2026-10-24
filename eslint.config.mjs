import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

/**
 * @built F-05 lint contract — Next.js rules, TypeScript rules, zero warnings on a clean tree
 *
 * Scoped to what ships: `app/`, `components/`, `lib/`. Build scripts, baked data
 * and dependencies are not source we lint.
 */
const config = [
  {
    ignores: [
      '.next/**',
      '.vercel/**',
      '.claude/**',
      'node_modules/**',
      'public/**',
      'data/**',
      'coverage/**',
      'scripts/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // Apostrophes in copy are typographic, not syntax errors.
      'react/no-unescaped-entities': 'off',
    },
  },
]

export default config
