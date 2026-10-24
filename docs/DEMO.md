# The demo video

Rules this has to satisfy, quoted from the submission requirements:

- **under three minutes** — judges are not required to watch past 3:00;
- **footage that shows the Project functioning on the device for which it was built**;
- publicly visible on YouTube, Vimeo, Facebook Video or Youku, linked on the submission form;
- **no third-party trademarks, copyrighted music or other material** without permission;
- English (or an English translation).

## What exists now

`npm run demo:video` renders `public/demo/switchpoint-demo.mp4` from `scripts/demo/record.mjs`. It is not a
screen recording — each beat is a real page of the app served with `?demo=1`, photographed by headless Chrome at
1440×900, held for exactly as long as its narration, and assembled with ffmpeg. The narration is macOS `say`, so
the script is in the repo and a changed sentence is a re-run, not a re-record.

Current cut: **1:37 (96.7s), H.264/AAC, 1440×900, 2.65 MB, nine beats.**

```
npm run demo:plan     # print the beats, touch nothing
npm run build && npm run start &
npm run demo:video    # render
```

| # | Beat | Page |
| --- | --- | --- |
| 01 | Framingham · one winter | `/?demo=1` |
| 02 | The bill, not a guess | `/start?demo=1` |
| 03 | The verdict | `/verdict?…&demo=1` |
| 04 | Every figure is auditable | `/verdict?…&demo=1` |
| 05 | Wellesley · municipal light plant | `/verdict?…Wellesley…` |
| 06 | Gas · the honest no | `/verdict?…gas…` |
| 07 | The cliff, by tract | `/map?demo=1` |
| 08 | Decide, then act | `/switch?…` |
| 09 | Switchpoint | `/?demo=1` |

That covers the product. It does **not** cover the half of the judging criteria that is about Kiro. The app can
win Quality and Design on product alone; Best Use of Kiro needs the tooling on screen.

## The gap: 40 seconds of Kiro

The current cut is 1:37, so there is ~1:20 of headroom before the 3:00 cap. Spend 40 seconds of it on the layer
judges cannot see from the product, and leave the rest as slack.

Record these live in the IDE — real screen capture, not stills, because the claim is that the tooling *runs*.

| Seconds | On screen | Say |
| --- | --- | --- |
| 0:00–0:08 | File tree with `.kiro/` open: `specs/switchpoint/{requirements,design,tasks}.md` | "The spec came before the engine. Twenty-five numbered requirements, and the code cites them." |
| 0:08–0:18 | `requirements.md`, scroll to an EARS clause; then the matching test in `lib/calc` | "R17.2 says a rebate never exceeds the install cost. That sentence is a property test, not a comment." |
| 0:18–0:28 | Agent chat: ask a verdict question, the agent calls the MCP tool, the answer comes back with a source | "The agent never types a payback from memory — it calls our own MCP server, which calls the engine the UI calls." |
| 0:28–0:40 | Save a file in `lib/calc` with the agent; the `pbt-guard` hook fires; the property suite runs green | "Saving an engine file triggers the property suite. If a property fails, the engine is wrong — the hook says so explicitly." |

Two rules while recording:

1. **Nothing off-limits on screen.** No other editors, no other assistants, no browser tabs with another vendor's
   product. The trademark clause is a real disqualification path, and an incidental logo in a tab strip is the
   usual way it happens.
2. **No music.** Narration only. `say` output is generated, not licensed material.

## If the hook does not visibly fire on camera

Do not fake it and do not stall the recording. Hooks load at session start, and file triggers respond to the
*agent's* writes rather than yours. If it will not fire on cue, cut to the terminal and run the same command the
hook runs:

```
printf '%s' '{"hook_event_name":"SessionStart","cwd":"'$PWD'","session_id":"demo"}' | node scripts/buildlog.mjs status
```

Say the accurate sentence — "the hook runs this same command; here it is by hand" — and move on. That is a
stronger beat than a staged one, and it matches what `docs/KIRO.md` claims.

## Upload checklist

- [ ] Export/cut is under 3:00 (`ffprobe -show_entries format=duration`)
- [ ] Product footage is the real app, running
- [ ] Kiro segment captured live, in the IDE
- [ ] Audible narration, English, sound-off readable labels
- [ ] No third-party trademarks, no music
- [ ] Uploaded public (not unlisted — the rules say publicly visible)
- [ ] Link pasted into the submission form
- [ ] Same link in `README.md` and `docs/KIRO.md`
