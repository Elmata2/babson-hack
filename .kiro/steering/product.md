---
inclusion: always
---
# Steering — Product

## What we are building

**Switchpoint** — a verdict engine for one decision: *should this Massachusetts
household replace its heating system with a heat pump, and if so, when?*

Not a calculator. A verdict. The user gets one of three answers:

- `SWITCH_NOW` — the economics work and the rebate is bigger this year.
- `SWITCH_BEFORE_DEC31` — the economics work, but the 2027 step-down costs them
  money if they wait.
- `DO_NOT_SWITCH_YET` — with a named break-even price and what would change the
  answer.

Track: **Climate Tech**, challenge **C2 — Cleaner, more affordable buildings**.

## The three facts the product exists for

1. Heating oil in Massachusetts averaged **$6.23/gal** the week of 2026-10-19,
   up **75%** from $3.55 a year earlier (MA DOER weekly survey).
2. **22.4%** of Massachusetts households heat with oil — **624,510 occupied
   units** of 2,785,042 (ACS 5-year B25040, baked statewide from 1,620 tracts).
   At ~750 gal each that is roughly **$2.9 billion a year** leaving the state's
   households in heating oil — an estimate, and labelled as one.

   *Correction, 2026-10-24: an earlier draft said 29.2% / 1.82M homes. That came
   from a Mass.gov table whose totals (6.2M) do not reconcile with Massachusetts'
   ~2.8M occupied units. The baked ACS layer is the authority: 22.4%. The map and
   the narration must quote the same number.*
3. Whole-home heat pump rebates drop from **$2,650/ton (cap $8,500)** to
   **$2,350/ton (cap $7,500)** for installs on or after **2027-01-01**. The
   federal 25C credit is already gone — $0 for 2026 installs.

That is 68 days of deadline, a doubling fuel price, and 624,510 households
holding the bill.

## The fourth fact, which nobody else checks

Mass Save rebates are paid by the utility *sponsor* serving the address, and
**municipal light plant customers are not eligible for Mass Save electric rebates
at all.** Wellesley, Belmont, Holyoke and dozens of other towns run their own
electric departments. A calculator that ignores this hands a homeowner $8,500
they will never see.

Checking it takes one public dataset. Refusing to quote an impossible number is
the most convincing thing this product does, and it is the single beat we
rehearse most.

## Non-negotiables

1. **No invented numbers.** Every figure is either computed from user input or
   read from a dated source shown in the UI. If we do not know, we say
   `check eligibility` or `verify` — never a guess.
2. **Show the math.** Any number on screen expands to its formula, its inputs,
   and its source date.
3. **Argue against ourselves.** For gas-heated homes the honest answer is often
   "don't". The product says so, loudly, with the break-even electricity price.
4. **No accounts, no PII, no retained images.** Bill photos are parsed in memory
   and discarded. We never store an address server-side.
5. **The demo must survive the room.** If the network dies, the app still
   produces the same verdict from a baked snapshot, with a visible badge.

## Voice

Plain, specific, unhurried. Numbers instead of adjectives. No exclamation
marks. No "revolutionary", "seamless", "empower", "unlock", "leverage".
Say "estimate" when it is one. Say "we don't know" when we don't.

If a sentence would survive being pasted into a LinkedIn post unedited, delete
it.

## Scope fence

| In, today | Out, always |
| --- | --- |
| Single-family + 2–4 unit homes | Commercial, new construction |
| Oil, propane, natural gas, electric resistance | Wood, pellets, district heat |
| Air-source cold-climate heat pumps | Ground-source (mention only, $25k tier) |
| One address at a time | Portfolio / municipal tools |
| Massachusetts | Every other state |
| Verdict + next steps (+ phone quotes on request, if Addendum A is approved) | Installer marketplace, scheduling, payments, lead sales |

## What we say when a judge asks "why not just ChatGPT"

> ChatGPT cannot see the bill, does not know that 25C died on 2025-12-31, mixes
> up the 2026 and 2027 Mass Save tiers, and cannot show you the arithmetic. We
> run a rules engine with property-tested math, and we use the model for exactly
> two things: reading the bill and writing the explanation.

## Success at 20:00

A judge enters their own address, uploads one bill, and gets a number they
believe — in under 90 seconds — and then says "wait, do that for my mother's
house."
