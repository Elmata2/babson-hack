# Switchpoint — Profile onboarding, best-case switch, and dashboard

**Status:** draft for approval · 2026-10-24
**Owner:** Alexander · **Ships:** demo at 20:00 tonight, built to keep
**Builds on:** `.kiro/specs/switchpoint/` (R1–R16), Addendum A on branch
`spec/agent-and-ci-addendum` (R17–R25: switch choice, consent, quote agent,
comparison, switch kit, watch), `docs/energy-dashboard-spec.md` (`/map`, Your bill),
`.kiro/steering/*` (the rules for numbers, voice and privacy).

---

## 1. Intent

Today Switchpoint is a one-shot calculator. You arrive, type a bill, get a verdict
and leave, and nothing remembers you. This turns it into a product a household
signs up for once:

1. They create a profile.
2. They hand over a bill (photo, PDF or manual).
3. They confirm what we read.
4. We show the best case across electricity supply and heating, including the
   government options.
5. If switching beats what they have, an agent does the legwork (published prices
   first, then email or phone for quotes) and the household says yes or no at the end.
6. They come back to a dashboard that shows where they stand, and we tell them
   when something changes.

**Why now:** the hackathon demo is tonight, and the product continues after it.
"Build it for the demo but make it real": real accounts, real storage, real
outreach, not a mock.

## 2. Goals, non-goals, anti-goals

**Goals**
- One clear path: home → profile → bill → verify → best case → switch (agent or
  manual) → dashboard.
- Bill intake that works with what an American household actually has: a phone
  photo of the paper bill, or the PDF from their utility's online account.
- A best-case answer that says **"you're already on the best option, don't switch"**
  when that's true.
- Agent-assisted switching with a human in the loop: the user consents to outreach,
  sees every quote with its evidence, and makes the final yes or no.
- A dashboard, a profile, `/map` and settings (notifications on by default, opt-out).

**Non-goals (tonight)**
- Executing a contract or enrolment on the user's behalf. The agent gathers and
  compares, then hands over a switch kit (and an intro email if the user wants).
  The user signs.
- Payments, installer scheduling, lead sales or referral fees (R20.9 holds).
- States other than Massachusetts (see `docs/energy-dashboard-spec.md` §7).

**Anti-goals: things that make this a failure even if it works**
- An agent that says a user's name, address, phone, email or account number to a
  provider before the user has picked that provider.
- A "best deal" the model computed, or a number with no source on screen.
- Steering a household into competitive supply when Basic Service or aggregation is
  cheaper. The AG's $738.7M overpayment figure is the reason this product exists.
- Storing bill images.

## 3. The flow

```
/ (home) ─ CTA "Create profile" (header, top-right, and hero, centre)
  └─ /onboarding
       1 Account     name · email · phone → email one-time code → signed in
       2 Bill        take a photo / upload (PDF, JPG, PNG, HEIC) / "enter manually"
       3 Details     manual form, or the fields read from the bill, editable
       4 Verify      "Your electricity profile". Every field has a source badge; confirm
       5 Best case   per category: stay / switch, with the numbers and sources
       6 Switch      agent-assisted (consent → outreach → quotes → yes/no)
                     or manual (all options + switch kit)
  └─ /dashboard      current situation · best case · switch status · map · profile
  └─ /settings       profile details · notifications (on, opt-out) · delete account
  └─ /map            existing master view, preselected on the user's town
```

### 3.1 Home
- A header button, top-right: **Create profile** (signed out) / **Dashboard** (signed in).
- A hero CTA in the middle of the page, with the same action.
- The anonymous `/start` → `/verdict` path stays as "Try it without an account".

### 3.2 Account (step 1)
- Fields: name, email, phone. Phone is optional at signup; it's required only for
  SMS notifications.
- Sign-in by **email one-time code** (no passwords).
- Consent checkbox with the privacy summary: what's stored, what's never stored
  (bill images), who sees what (§6).

### 3.3 Bill (step 2)
- US utility bills arrive as **paper** (photo) or as a **PDF** from the utility's
  online account. Accept `application/pdf`, `image/jpeg`, `image/png`, `image/webp`,
  `image/heic` (iPhone default). Convert HEIC client-side or reject it with
  "export as JPG". On mobile, offer the camera directly (`capture="environment"`).
- Reuse the team's `/api/parse-bill` (F-26/F-76/F-77): one vision call, in memory,
  discarded. **The builder must confirm the route accepts PDFs** (Claude takes PDF
  document blocks). If it doesn't, add PDF to it.
- A gas or oil bill is accepted too. Heating fuel feeds the heat-pump verdict.
- "Enter manually instead" is always one tap away.

### 3.4 Details and verify (steps 3–4)
- The electricity profile:
  - utility (from address → MassGIS; asks for mixed towns)
  - supplier line and supply type: Basic Service, aggregation or competitive
  - supply rate ¢/kWh, delivery charges, monthly kWh (and 12-month history if printed)
  - contract end and termination fee (competitive only)
  - rate class
- Heating: fuel, annual units, unit price (oil/propane delivery, gas bill, or none).
- Home: address (optional but recommended), home type, year built (parcel prefill,
  F-11), solar, EV, income-eligible (yes / no / not sure).
- Verify screen: one card per group. Every value carries `bill` / `you` /
  `assessor` / `MassGIS` badges (R1.2). Low-confidence OCR fields are amber and block
  "Confirm" until touched (R2.4).

### 3.5 Best case (step 5)
Three categories, each with **STAY** or **SWITCH** and a reason. All of it comes from
deterministic code that already exists or is specified:

| Category | Options compared | Code |
|---|---|---|
| Electricity supply | Basic Service · town aggregation (link, never claimed) · competitive offers | `lib/supply` + published offers (R17.4) |
| Heating fuel (oil/propane) | current dealer price vs local dealer quotes | Addendum A R20 (`lib/quotes`) |
| Heat pump | verdict SWITCH_NOW / BEFORE_DEC31 / DO_NOT_SWITCH_YET | `lib/calc` `computeVerdict` |
| Programs | Mass Save rebates, enhanced/Turnkey, HEAT Loan, Seasonal HP Rate | `mass-save-rules.md` |

- Municipal-light-plant towns get no supply category and no Mass Save rebate (R3.6).
- If every category says STAY: "You're already on the best option. We'll tell you
  if that changes." Then the dashboard.
- The choices follow Addendum A R17: `STAY · SHOP_SUPPLY · SHOP_FUEL ·
  SWITCH_HEAT_PUMP`, nothing preselected, STAY with equal weight.

### 3.6 Switch (step 6)

**Manual:** every option, ranked by annual cost at the user's usage, plus the switch
kit (R20.8): who to contact, what to say, what to have ready, and the rescission
window where one applies.

**Agent-assisted (human in the loop):**
1. **Published first.** Supply offers come from published data (R17.4: "calling
   for a published number is theatre"). Quotes are only sought where no published
   price fits: oil/propane dealers and heat-pump installers.
2. **Consent screen** (R18): the provider list (name, contact, source, date, one
   checkbox each), the exact facts the agent may share (town, ZIP, fuel, volume
   rounded, home size, tons; never name/address/phone/email/account), and the
   channel per provider: **email** or **phone**.
3. **Outreach:**
   - Email from a Switchpoint sending address. A templated request with the same
     allowed facts; replies go to a Switchpoint inbox and are parsed into
     `ProviderQuote` (the model extracts, code ranks).
   - Phone via ElevenLabs + Twilio, exactly per `voice-agent-rules.md` and R19
     (verbatim disclosure, 4-minute cap, business hours, no voicemail).
   - Real businesses only when `PROVIDER_OUTREACH_ENABLED=true`. Otherwise the team
     allowlist (R19.8), so the demo is real calls and emails to our own lines.
4. **Quotes screen:** live status per provider, ranked by code (R20), each figure
   linked to its evidence (email excerpt or transcript turns).
5. **Decision:** the user picks one or declines all. On "yes":
   - the switch kit for that provider, and
   - optionally (a second, separate consent): "Send {provider} an intro email with
     my name, phone and email so they can contact me." This is the only point where
     PII reaches a provider.
6. Status shows on the dashboard: `consented → contacting → quotes ready → decided
   → introduced / switched (user-confirmed)`.

### 3.7 Dashboard
- **Now:** utility, supply type and rate, monthly kWh, heating fuel and price, and
  the estimated annual energy cost from these inputs (formula shown).
- **Best case:** the categories from §3.5 with STAY/SWITCH and the delta.
- **Switch status:** the request timeline and its quotes.
- **Map:** a card linking to `/map` with the user's town selected and the profile
  feeding Your bill.
- **Deadlines:** days to 2026-12-31 (rebate step-down), next Basic Service reset,
  contract end.

### 3.8 Settings and notifications
- Edit any profile field. "Add more details" prompts for missing fields that would
  sharpen the answer (year built, sqft, 12-month kWh).
- **Notifications, on by default, per-type opt-out:**
  - quote arrived
  - Basic Service reset (Feb 1 / Aug 1) with the new comparison
  - competitive contract ending (60 / 14 days)
  - rebate step-down (Dec 1, Dec 20)
  - DOER oil price move > 5% (R24.1)
  Email is the default channel. SMS only if phone is verified and SMS is turned on.
  Every message carries a one-click unsubscribe.
- Delete account: removes the profile, requests, quotes and notification log.

## 4. Constraints

- **Stack stays:** Next.js 16 app router, React 19, Tailwind v4 tokens, the existing
  `lib/*` modules. New pages use the paper/ink design language.
- **Rules that still bind:** no invented numbers; sources and dates on every
  figure; the model extracts and writes prose but never ranks or computes;
  `mass-save-rules.md` / `supply-market.md` are the only sources of program and
  supply numbers; `voice-agent-rules.md` binds the phone agent.
- **Rules this changes (needs a team ADR, see §8):** product non-negotiable #4
  ("no accounts, no PII"), ADR-003 ("no database") and Addendum A's ADR-004 / R22.1
  ("server is stateless"). Accounts and stored profiles replace them for signed-in
  users. The anonymous path keeps the old guarantees.
- **Never stored:** bill images, call audio (Twilio recording off, ElevenLabs
  retention minimised, per R22.2), card or bank details, account numbers.
- **Deadline:** 20:00. Everything has a degraded path that still demos (§7).

## 5. How it gets made (my calls, mark if you disagree)

| Concern | Choice | Why |
|---|---|---|
| Auth + database | **Supabase**: email OTP auth, Postgres, row-level security | One service for auth, data and RLS. Works on Vercel. Free tier. Fastest path to "real" today |
| Email out + inbound replies | **Resend** (send + inbound webhook) | Simple API, inbound parsing, works on Vercel functions |
| Phone calls | **ElevenLabs Agents + Twilio** | Already chosen in Addendum A |
| SMS | Twilio (same account), off until phone verified | Reuse |
| Scheduled notifications | Vercel Cron → `/api/cron/notify` | Basic Service resets, deadlines, DOER moves |
| Bill reading | existing `/api/parse-bill` (Anthropic) | Already built and tested |

Data model (tables, all RLS by `user_id`):
- `profiles`: name, email, phone, address, town, utility, profile fields, `updated_at`
- `bills`: parsed fields + confidence + source (`ocr | manual`), **no image**
- `switch_requests`: category, status, consent snapshot (facts + providers + channel + timestamp)
- `provider_contacts`: request, provider, channel, status, evidence ref
- `quotes`: request, provider, typed `ProviderQuote`, evidence excerpt, `unverified` flag
- `notification_prefs`: per type and channel, default on
- `notification_log`

## 6. Privacy

| Data | Where it goes |
|---|---|
| Name, email, phone, address | Supabase (encrypted at rest). A provider sees them only after the user's second consent (§3.6 step 5) |
| Bill image | Anthropic for one parse, then discarded. Never stored |
| Allowed call/email facts (town, ZIP, fuel, volume, size) | Providers, ElevenLabs, Twilio, Resend |
| Street address | Census geocoder (existing), Supabase. Never in outreach |

The privacy page and `product.md` get rewritten to say exactly this.

## 7. Degraded paths (the demo must survive the room)

| Missing | Behaviour |
|---|---|
| Supabase keys / outage | "Continue without an account": the flow runs on local storage and the dashboard reads it. The banner says so |
| Anthropic key | manual entry (already the case) |
| Resend / ElevenLabs keys or `PROVIDER_OUTREACH_ENABLED=false` | outreach goes to the team allowlist only; if no allowlist either, the agent step shows published options and the switch kit |
| No published offers | manual comparison against Basic Service only |

No fake quotes, ever. If nothing came back, the screen says nothing came back.

## 8. Decisions settled during review (Claude's calls; flag any you disagree with)

- **PDF bills:** `/api/parse-bill` already accepts PDF. Only HEIC handling is new.
- **Categories by household:** gas and electric-resistance homes get no heating-fuel
  category (there's no dealer to shop), only supply, heat pump and programs. Oil and
  propane homes get all four.
- **Annual energy cost and deltas** come from the existing `lib/calc` cost
  functions and `lib/supply.monthlyDifferenceUsd`, with the formula shown. No new maths.
- **Local fallback scope:** "Continue without an account" covers profile, bill,
  verify and best case only. Outreach, quotes and notifications need an account. No
  migration into an account later; the user re-enters or re-uploads.
- **Consent:** this design overrides Addendum A R18.5. The consent snapshot is stored
  with the request, so the user can see later exactly what they agreed to.
- **Inbound email:** replies go to a per-request alias (`req-<id>@<inbound domain>`),
  the Resend webhook signature is verified, and parsed quotes stay `unverified` until
  they pass the R20.3 plausibility gate.
- **Auth email:** Supabase sends OTP codes through Resend SMTP, because the default
  sender's rate limit would fail a room of judges signing up. Phone verification
  (and therefore SMS) is out of scope tonight; phone is stored for the
  intro email only.
- **Where conflicts arise, this document wins over Addendum A**: email outreach
  added; `PROVIDER_OUTREACH_ENABLED` replaces `PROVIDER_CALLS_ENABLED`.
- **ADR:** the builder writes the accounts ADR and the `product.md` privacy rewrite as
  part of the build. Team sign-off happens at review, not before.
- **Webhooks need a public URL:** the demo runs on the team's Vercel deployment, not
  localhost, so Resend inbound, ElevenLabs/Twilio callbacks and the Supabase redirect
  allow-list all point there.

## 9. Open questions (need an answer before building)

1. **Accounts and keys.** Do Supabase, Resend (with a verified sending domain and an
   inbound address), a Twilio number and an ElevenLabs agent already exist, and who
   holds the keys? If not ready by ~14:00: accounts, profile, best case and dashboard
   ship for real; outreach runs in degraded mode (team allowlist + switch kit).
2. **Cut line.** Proposed: signup → bill → verify → best case → dashboard solid; one
   live outreach channel (phone *or* email); notifications limited to "quote
   arrived". Which channel matters more for the demo?
3. **Addendum A and provider lists.** Is Addendum A (R17–R21) approved to build on?
   Who supplies the real oil-dealer and heat-pump-installer lists (name, contact,
   source, date)? None exist in the repo, and inventing them breaks the
   no-invented-numbers rule.
4. **Competitive supply offers.** Is a dated snapshot of Energy Switch Massachusetts
   acceptable as the source? Without one, the supply comparison is Basic Service vs
   "check your town's aggregation" only.

## 10. Left to the builder
- Page and component structure, form library (or none), state management.
- Supabase schema details, migrations, RLS policies, and the client/server split.
- The exact email template wording (within `voice-agent-rules.md` limits), the
  Resend inbound address, parsing strategy.
- Which Addendum A tasks (P8–P9) to pull forward, and in what order.
- A short ADR in `.kiro/specs/switchpoint/design.md` recording the accounts
  decision, and the `product.md` privacy rewrite.
