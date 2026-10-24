---
inclusion: manual
---

# Steering — Hackachusetts submission checklist

Pull this in with `#submission-checklist` before the 20:00 lock. Source: the official
Submission Requirements and Judging Criteria, read 2026-10-24. Run
`npm run submission` for the part the repository can answer for itself.

## Hard requirements (miss one and the entry may not be judged)

- [ ] Team of at most 4, all added on the submission form.
- [ ] Built with Kiro. "Insufficient use of Kiro" is grounds for disqualification.
- [ ] One track chosen on the form: Climate Tech (C2, cleaner and more affordable buildings).
- [ ] Text description of features and functionality.
- [ ] Demo video under 3 minutes, **public** on YouTube, Vimeo, Facebook Video or Youku,
      showing the project working. No third-party trademarks, no copyrighted music.
- [ ] Public GitHub repository with all source, assets and run instructions.
- [ ] `/.kiro` at the repository root and **not** in `.gitignore` (a hook and CI both guard this).
- [ ] Kiro write-up: `docs/KIRO.md`, linked from the README.
- [ ] A working URL for judges, free and without login: https://switchpoint-psi.vercel.app, plus `?demo=1`.
- [ ] Everything in English.
- [ ] No changes after the Submission Period ends.

## What each score rewards

| Criterion | Judges look for | Where we show it |
| --- | --- | --- |
| Potential Value | Real defined problem, accessibility, equity, adoption, how it scales | README "Who benefits and how it scales"; EJ2020 plain-language path; `docs/ACCESSIBILITY.md` |
| Implementation | Variety of Kiro features, depth, experimentation, strategy | `docs/KIRO.md`: specs, hooks, steering modes, MCP server, PBT, power |
| Quality and Design | Originality, unique public datasets, polished UI | Municipal-light-plant gate from the organisers' utility layer; 351-town bake |

"Best Use of Kiro" goes to the highest Implementation score within the top 10% overall.

## Rights and conduct

- Original work, no third-party IP, no secrets in the repo (gitleaks runs in CI).
- No project developed with financial or preferential support from the sponsor or
  administrator. Confirm with an organiser that the Babson LiteLLM gateway is fine.
- Never claim a hook, tool or power was used if it was not. Judges read the repo.
