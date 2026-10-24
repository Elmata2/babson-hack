#!/usr/bin/env node
/**
 * @built F-155 PreToolUse guard — refuses any edit that would gitignore /.kiro
 *
 * The hackathon rules disqualify a submission whose /.kiro is not in the repository.
 * CI catches it after the push (scripts/ci-guard.mjs --kiro); this hook catches it
 * before the write, which is cheaper than a failed build at 19:55.
 *
 * Reads the hook's JSON from stdin. Exit 2 blocks the tool call and forwards stderr
 * to the agent; exit 0 lets it through. Deliberately conservative: it only blocks
 * when the call targets a .gitignore AND the new text contains an ignoring `.kiro`
 * line (a leading `!` negation is the safe form and is allowed).
 */
import { readFileSync } from 'node:fs'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/** A line that ignores .kiro: `.kiro`, `.kiro/`, `/.kiro`, `.kiro/*`, `.kiro/**`, not `!.kiro`. */
const IGNORING_KIRO_LINE = /^\/?\.kiro(\/(\*{1,2})?)?\s*$/m

const raw = readStdin()
let payload
try {
  payload = JSON.parse(raw)
} catch {
  process.exit(0)
}

const input = payload?.tool_input ?? payload?.toolInput ?? payload?.input ?? {}
const target = String(input.path ?? input.file_path ?? input.targetFile ?? '')
const text = String(input.text ?? input.newStr ?? input.new_str ?? input.content ?? '')
const command = String(input.command ?? '')

const touchesGitignore = /(^|\/)\.gitignore$/.test(target) || /\.gitignore/.test(command)
if (!touchesGitignore) process.exit(0)

// Shell edits arrive as one string with literal "\n"; normalise before matching lines.
const body = `${text}\n${command}`.replace(/\\n/g, '\n')
// `echo ".kiro" >> .gitignore` quotes the pattern; a `!` before it is the safe form.
const QUOTED_IGNORE = /["']\/?\.kiro(\/(\*{1,2})?)?["']/
if (IGNORING_KIRO_LINE.test(body) || (command !== '' && QUOTED_IGNORE.test(command))) {
  process.stderr.write(
    [
      'Blocked: this edit would add a rule that gitignores /.kiro.',
      'The hackathon rules disqualify a submission whose /.kiro directory is not committed.',
      'Keep `!.kiro/` and `!.kiro/**` in .gitignore, and do not add an ignoring .kiro line.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}
process.exit(0)
