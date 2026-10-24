# Demo walkthrough notes, 2026-10-24 (afternoon)

Spoken feedback from Alexander while clicking through the full flow on the local
production build. Notes only: nothing here is built yet. The aim for the demo is
one straight line where every screen element adds measurable value for the
user; anything that does not is cut.

Status key: **Cut**, **Change**, **Keep**, **Decide** (needs a call before building).

## 1. Profile onboarding

| # | What | Status | Note |
|---|---|---|---|
| 1.1 | Upload electricity bill (photo/PDF), "here's what we found", check the numbers, "use these numbers" | Keep | Liked. |
| 1.2 | Second bill: the heating bill (gas or oil) goes through the same upload → check → use flow. Continue only when both bills are in | Change | Today only one bill is required. |
| 1.3 | "Where is the house?" | Change | Read the service address from the bill (it is always printed). Pre-fill it; ask only if the parser could not read it. |
| 1.4 | "What do you burn?" | Change | Set automatically from the heating bill (a gas bill means natural gas). Ask only if no heating bill was read. |
| 1.5 | Therms/units and price | Keep | Pre-filled from the heating bill. |
| 1.6 | Year built, heated area (sq ft), other optional fields | Cut | No optional fields for the demo. |
| 1.7 | "Is the household under the Mass Save income limit?" | Change | Determine it automatically where we can. See §6.1. |
| 1.8 | Whole-system vs partial-system choice | Cut | Default: review the household's existing situation (whole heating system). Mention partial only in the verdict if it would change the answer. |
| 1.9 | Install year 2026 vs 2027 choice | Cut | Assume "now". The verdict says when waiting until 2027 is better (or worse: the rebate step-down). |

## 2. Review screen

| # | What | Status | Note |
|---|---|---|---|
| 2.1 | Summary of everything the user entered | Keep | |
| 2.2 | Notes: "profile stays only in this browser", further links | Cut | |
| 2.3 | "Change the bill", "Change the numbers" links | Cut | The user can go back. |
| 2.4 | "Forget my profile" | Cut | From the review screen. Keep it reachable from the profile menu. |

## 3. Verdict

| # | What | Status | Note |
|---|---|---|---|
| 3.1 | Money headline ("You'd pay $267 a year more. Stay with what you have.") | Keep | "Very good." |
| 3.2 | Speedometer dial | Keep | Liked. |
| 3.3 | Header: "351 Massachusetts towns", Map / Dashboard / Source links | Cut | Replace with one profile icon top right. |
| 3.4 | "Prices · Snapshot · 19 Oct" badge | Decide | Alexander: assume real time. Honesty catch: the fuel prices are a weekly MA DOER survey, so they aren't real time. Proposal: drop the badge from the header and keep the date in each figure's source drawer. Never call it real time. |
| 3.5 | "Electricity rate · your bill · you entered" line | Cut | |
| 3.6 | "The money" and "How we worked it out" | Keep, explain | Alexander wants to review them later. See §6.2. |
| 3.7 | "What to do next" → "See your options" | Change | Don't make the user compare options. Give **one recommendation** based on their numbers, with a proactive, agent-backed action. **Stay** (pays more): recommend doing nothing now and set a re-check for early 2027, when prices and rebates reset. **Switch now** or **before 31 Dec**: offer to get heat pump quotes from installers, with consent, so the agent does the work. Show the other options only as a small "other options" line. |
| 3.8 | `/switch` page | Cut | Fold the single recommendation and its action into the verdict. The page isn't needed for the demo. |
| 3.9 | "What could change it" (price or quote changes) | Change | Do the research before the verdict, not after. Price changes become a notification ("the oil price changed, here's your new answer"). Notifications need the signed-in profile from Addendum B. |
| 3.10 | Switch kit (do-it-yourself contact list and script) | Decide | It goes away with `/switch` unless it moves into the verdict's recommended action. See §6.5. |

## 4. Map

| # | What | Status | Note |
|---|---|---|---|
| 4.1 | Verdict → map zooms in on the address | Keep | |
| 4.2 | User's address shown top left by default | Change | Search box pre-filled with the profile address. |
| 4.3 | Energy and Heat lenses | Keep | |
| 4.4 | Town tab: heating oil in town, "oil at risk", grid clock | Decide | Is it relevant? See §6.4. Proposal: replace it with **how you compare with your town**. |
| 4.5 | Your bill tab | Keep | Belongs here. |
| 4.6 | Next steps tab | Cut | It repeats the verdict. |
| 4.7 | Heat lens: "$X lost on Jan 1" | Explain | See §6.3. |

## 5. Overall direction

- One straight demo path with no side doors: bills → review → verdict with one recommendation and its action → map as the "you vs your town" wow moment.
- Cut every control, link or caveat that doesn't change what the user decides or does.
- Honesty stays non-negotiable: cutting clutter must not cut sources. Sources move into the drawers; they don't disappear.

## 6. Answers to the questions raised

### 6.1 Can we determine Mass Save income eligibility automatically?

Partly, and never with certainty:

- **From the bill (strongest signal).** A low-income discount rate is printed on the bill: rate class R-2 (electric) or R-4 (gas heat), or a line such as "Discount 25%" or "Assistance Rate Discount". The parser already reads this (`lib/parse/contract.ts`, the discount flag). Households on the discount rate are already enrolled through an income-verified program. We can treat that as "likely eligible" and say so. The code comments call it "a signal of income eligibility, never proof".
- **Thresholds aren't published.** The team rule (`mass-save-rules.md` §5) is: never invent an income threshold, say "check eligibility" and give the verification line 888-714-3990.
- **Otherwise, one question.** If the bill shows no discount rate, ask one yes/no question with the verification number, or leave it as "unsure". Nothing else from the bills reveals income honestly. Census tract income describes the neighbourhood, not the household, so we shouldn't use it to decide.
- **Proposal:** remove the question when the bill shows R-2/R-4 or a discount line, and pre-fill "likely eligible, confirm with Mass Save". Otherwise keep a single yes/no/unsure question.

### 6.2 What "The money" and "How we worked it out" show

- **The money:** the cost side of the decision.
  - **Rebate:** Mass Save per-ton rebate × system size, capped. In 2026 that's $2,650 a ton up to $8,500, falling to $2,350 a ton up to $7,500 from 1 Jan 2027. The enhanced tier pays up to $16,000.
  - **Net cost:** install cost minus the rebate. The install cost is the user's quote if they enter one, otherwise the team's default (editable).
  - **Payback:** net cost ÷ yearly saving.
  - **Cash flow:** what a 0% HEAT Loan payment would be each month next to the monthly saving.
- **How we worked it out:** the inputs behind the numbers.
  - **Defaults used:** design temperature, AFUE, SCOP and tier, each with the reason it was chosen.
  - **Rebate stack:** which rebate lines were added.
  - **Utility and climate:** heating degree days, system size in tons, the bill used.
  - **Arithmetic:** every formula, with sources and dates.

### 6.3 Heat lens "$X lost on Jan 1": what it means

It is **not** "dollars lost if they don't switch to a heat pump". It is the **rebate money that disappears if those oil-heated homes install in 2027 instead of 2026**:

- Per home, it's the 2026 cap minus the 2027 cap: $8,500 − $7,500 = $1,000. That's multiplied by the number of oil-heated homes in each area (`lib/map/heat.ts`, `CLIFF_USD_PER_HOME`).
- In 2026 the map shows $0 because nothing has been lost yet. Move the slider to 2027 to see the drop.
- Caveat: $1,000 is the most a home can lose, because it assumes every home reaches the cap. A smaller home loses $300 a ton, for example $750 for 2.5 tons. Label it "up to" or compute it per ton.

### 6.4 Is the Town tab (oil in town, oil at risk, grid) relevant?

The oil figures are relevant on the Heat lens. The grid clock isn't relevant to a heating decision. Proposal: replace the tab with **"You vs your town"**:

- **Your monthly electricity use vs the average home in your town.** Average = Mass Save residential use per town (2023) ÷ households per town (Census ACS, county subdivisions = MA towns). The baked tract data already counts occupied households, and an exact per-town count comes from ACS table B11001 by county subdivision (`CENSUS_API_KEY` is already in `.env.example`).
- **Mass Save incentives paid in your town (2023)** and **installed solar**, which are already shown.
- **Share of homes heating with oil** in your area, from the Heat lens data.

Caveat: Mass Save covers utility accounts. In mixed or light-plant towns the average isn't meaningful, so we'd hide it there.

### 6.5 "Is the plant kit being called out?"

Unclear from the recording. If this meant the **switch kit** (the do-it-yourself contact list and call script on `/switch`), it goes with the page unless we move it into the verdict's recommended action as the "do it myself" alternative to the agent. Proposal: keep it as a small link under the agent action.

## 7. Decisions (Alexander, 15:05)

1. Price badge: **removed**. Dates stay in the figure drawers.
2. Income: **auto-detect** from the bill's discount rate; ask one yes/no/unsure question only when unclear.
3. Town tab: **"You vs your town"**. Households come from the keyless Census ACS bulk file.
4. Switch kit: **small "do it myself" link** under the agent action.
5. Price-change notifications: **roadmap** (needs sign-in, Addendum B).
