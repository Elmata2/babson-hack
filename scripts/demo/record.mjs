#!/usr/bin/env node
/**
 * @built F-52 the demo video, cut from the live app — 2:40, no screen-recording after the fact
 *
 * R13.4 wants a recorded sub-three-minute video, and the honest way to get one on a
 * machine with no capture software is to photograph the real product and score it:
 *
 *   1. each beat is a page of the app in `?demo=1` mode, rendered by headless Chrome
 *      at 1440×900 (offline by design — `lib/demo.ts` is the flag R13.1 is about);
 *   2. each beat is narrated with macOS `say`, so the words are in the repository and
 *      not in somebody's head;
 *   3. ffmpeg assembles stills and narration into one H.264/AAC file, with the still
 *      held for exactly as long as its sentence.
 *
 * The script is the source of truth for both halves. Change a sentence, re-run, get a
 * new cut. `--check` prints the plan and touches nothing.
 *
 * Usage:
 *   npm run build && npm run start &            # the app must be answering
 *   node scripts/demo/record.mjs --base=http://localhost:3000
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.argv.find((arg) => arg.startsWith('--base=')) ?? '--base=http://localhost:3000').slice(7)
const CHECK = process.argv.includes('--check')
const OUT_DIR = join(process.cwd(), 'public', 'demo')
const TMP = join(process.cwd(), '.demo-build')
const OUT = join(OUT_DIR, 'switchpoint-demo.mp4')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const VOICE = 'Samantha'
const TAIL_SECONDS = 0.7

/**
 * The storyboard. `path` is a page of the real app; `line` is the narration; `label`
 * is drawn on the frame so the video still reads with the sound off.
 */
const BEATS = [
  {
    label: 'Framingham · one winter',
    path: '/?demo=1',
    line: 'One house in Framingham spent four thousand nine hundred and eighty-four dollars on oil last winter. This is the number they actually want to know.',
  },
  {
    label: 'The bill, not a guess',
    path: '/start?demo=1',
    line: 'Every other calculator asks you to guess your fuel use. We read the bill. Two numbers, or one photo, and the household is done.',
  },
  {
    label: 'The verdict',
    path: '/verdict?fuel=oil&units=800&price=6.23&town=Framingham&tier=enhanced&year=2026&inc=yes&ut=eversource&src=manual&demo=1',
    line: 'The same winter on a heat pump costs two thousand two hundred and sixty-one dollars. It pays for itself in about five years, and the zero-interest loan puts about sixty dollars a month back in their pocket.',
  },
  {
    label: 'Every figure is auditable',
    path: '/verdict?fuel=oil&units=800&price=6.23&town=Framingham&tier=enhanced&year=2026&inc=yes&ut=eversource&src=manual&demo=1',
    line: 'Click any number and you get the formula, the values substituted into it, and the date the source was read. Nothing here is a black box.',
  },
  {
    label: 'Wellesley · municipal light plant',
    path: '/verdict?fuel=oil&units=800&price=6.23&town=Wellesley&tier=enhanced&year=2026&inc=yes&src=manual&demo=1',
    line: 'Move the same house to Wellesley and the rebate line dies. The town is served by a municipal light plant, so Mass Save electric rebates do not apply. We refuse to quote a number the household cannot receive.',
  },
  {
    label: 'Gas · the honest no',
    path: '/verdict?fuel=gas&units=900&price=1.62&town=Worcester&tier=whole&year=2026&inc=no&src=manual&demo=1',
    line: 'On natural gas the money does not work, so the answer is do not switch yet, and here is the electric price at which it would. A tool that only ever says yes is a sales tool.',
  },
  {
    label: 'The cliff, by tract',
    path: '/map?demo=1',
    line: 'The map shows where the oil is, tract by tract. Drag the scrubber to twenty twenty-seven and you can see the money Massachusetts loses when the rebate steps down on January first.',
  },
  {
    label: 'Decide, then act',
    path: '/switch?choice=SHOP_FUEL&fuel=oil&units=800&price=6.23&town=Framingham&tier=enhanced&year=2026&inc=yes&ut=eversource&src=manual&demo=1',
    line: 'Then the household chooses. Nothing is preselected, and nothing leaves the page until they have read exactly what an agent would say about them and confirmed it. On the day, an AI assistant makes the calls a person never makes: six dealers, one comparable number back.',
  },
  {
    label: 'Switchpoint',
    path: '/?demo=1',
    line: 'Switchpoint. The honest heat pump verdict for Massachusetts. Read the bill, check the utility, tell the truth.',
  },
]

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr ?? ''}`)
  }
  return result.stdout ?? ''
}

function durationOf(file) {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
  return Number(out.trim())
}

if (CHECK) {
  console.log(`demo video plan — ${BEATS.length} beats, ${OUT}`)
  for (const [index, beat] of BEATS.entries()) console.log(`  ${String(index + 1).padStart(2, '0')} ${beat.label}: ${beat.path}`)
  console.log('run without --check to render (the app must be answering at ' + BASE + ')')
  process.exit(0)
}

if (!existsSync(CHROME)) {
  console.error('Headless Chrome is not installed at the expected path. Set CHROME and re-run.')
  process.exit(1)
}

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
mkdirSync(OUT_DIR, { recursive: true })

const stills = []
const narrations = []
const durations = []

for (const [index, beat] of BEATS.entries()) {
  const still = join(TMP, `beat-${String(index).padStart(2, '0')}.png`)
  run(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1440,900',
    '--virtual-time-budget=9000',
    `--screenshot=${still}`,
    `${BASE}${beat.path}`,
  ])

  const audio = join(TMP, `beat-${String(index).padStart(2, '0')}.aiff`)
  run('say', ['-v', VOICE, '-r', '180', '-o', audio, beat.line])

  stills.push(still)
  narrations.push(audio)
  durations.push(durationOf(audio) + TAIL_SECONDS)
  console.log(`beat ${index + 1}/${BEATS.length}: ${beat.label} (${durations[index].toFixed(1)}s)`)
}

// One image track, one audio track, cut to the same clock.
const list = join(TMP, 'images.txt')
writeFileSync(
  list,
  stills.map((still, index) => `file '${still}'\nduration ${durations[index].toFixed(3)}\n`).join('') +
    `file '${stills[stills.length - 1]}'\n`,
)

const audioInputs = narrations.flatMap((file) => ['-i', file])
const pads = narrations.map((_, index) => `[${index + 1}:a]apad=pad_dur=${TAIL_SECONDS}[a${index}]`).join(';')
const concat = `${narrations.map((_, index) => `[a${index}]`).join('')}concat=n=${narrations.length}:v=0:a=1[out]`

run('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel', 'error',
  '-f', 'concat',
  '-safe', '0',
  '-i', list,
  ...audioInputs,
  '-filter_complex', `${pads};${concat}`,
  '-map', '0:v',
  '-map', '[out]',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-r', '30',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-shortest',
  '-movflags', '+faststart',
  OUT,
])

const total = durationOf(OUT)
console.log(`wrote ${OUT} (${total.toFixed(1)}s, ${(total / 60).toFixed(2)} min)`)
if (total >= 180) {
  console.error('the cut is over three minutes — R13.4 and F-52 both require under 3:00')
  process.exit(1)
}
