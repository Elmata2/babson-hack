/**
 * @built F-50 the source walker the display-edge guards share
 *
 * R15.1 (no analytics, no third-party cookie) and R14.2 (a keyboard path that is
 * not accidentally deleted) are claims about the source, not about a component's
 * output. There is no DOM in this test setup, so the honest check is to read the
 * files the browser would run and assert the shape of what is in them.
 *
 * The walk skips test files themselves — a guard that scans its own pattern list
 * would always find a match.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root, from `lib/a11y/__tests__/`. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export interface SourceFile {
  /** Path relative to the repository root, with forward slashes. */
  path: string
  text: string
}

/** Scanned once per directory set; the tree does not change during a test run. */
const CACHE = new Map<string, SourceFile[]>()

function walk(directory: string, out: string[]): void {  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(full)
  }
}

/** Every shipped source file under the given top-level directories. */
export function sourceFiles(directories: readonly string[] = ['app', 'components', 'lib']): SourceFile[] {
  const key = directories.join(',')
  const cached = CACHE.get(key)
  if (cached) return cached

  const files: string[] = []
  for (const directory of directories) walk(join(ROOT, directory), files)

  const scanned = files
    .filter((file) => !file.includes('__tests__') && !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
    .map((file) => ({
      path: relative(ROOT, file).split('\\').join('/'),
      text: readFileSync(file, 'utf8'),
    }))

  CACHE.set(key, scanned)
  return scanned
}

/** The text of one file, for the structural assertions. */
export function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

/** Every file whose text matches `pattern`, with the matched line. */
export function filesMatching(pattern: RegExp): { path: string; line: string }[] {
  const hits: { path: string; line: string }[] = []
  for (const file of sourceFiles()) {
    for (const line of file.text.split('\n')) {
      if (pattern.test(line)) hits.push({ path: file.path, line: line.trim() })
      pattern.lastIndex = 0
    }
  }
  return hits
}
