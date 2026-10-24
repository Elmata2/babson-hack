# Sample bills

Synthetic Massachusetts energy bills for testing the bill reader (`/api/parse-bill`)
and for the demo. **None of these are real bills.** Each one says so in a watermark
and a footer. The customer, account and meter numbers are placeholders, and the
oil dealers and the competitive supplier are fictional.

Regenerate: `npm run bills` · check against the reader: `npm run dev`, then `npm run bills:eval`
(needs `ANTHROPIC_API_KEY` in `.env.local`).

## What they are based on

| Kind | Layout taken from | What is ours |
| --- | --- | --- |
| Electric | Eversource, *Eastern Massachusetts Sample Electric Bill*, page 2 (eversource.com › Understanding Your Electric Bill › Sample Electric Bill, read 2026-10-24) | every amount. Totals are usage × the fixture's all-in rate; the sample's per-kWh rates only set the relative size of the lines |
| Gas | Eversource, *Massachusetts Sample Gas Bill* — its three charge groups (Supply / Maintenance and Infrastructure Investment / Public Benefits), plus the Public Benefits lines the MA AG's office lists | every amount |
| Oil | A metered delivery ticket with degree days and K-factor, the fields MA automatic-delivery tickets print | dealer, ticket, every amount |

The real electric bill has these sections, and ours copy them:
- **Service band:** service address, rate, cycle, service dates, next read.
- **Meter table:** meter number, current read, previous read, current usage, reading type.
- **Monthly kWh Use grid.**
- **Payment summary.**
- **"Total Charges for Electricity":**
  - Supplier: Generation Service Charge.
  - Delivery: Customer Charge, Distribution, Transition, Transmission, Net Meter Recovery Surcharge, Revenue Decoupling, Distributed Solar, Renewable Energy, Energy Efficiency (CLC), Electric Vehicle Program, and Assistance Rate Discount on R-2.

Where the sample prints the utility's logo, ours prints the name in plain text.

## The set

| File | Use | Tests |
| --- | --- | --- |
| `a-oil-ticket-degree-days` | test | ticket with degree days → year via `degree_days` |
| `b-oil-ticket-no-degree-days` | test | will-call ticket, no degree days → needs a fill count |
| `c-electric-bill-usage-chart` | test | R-2 bill with the monthly kWh grid → year via `printed_history` |
| `d-gas-bill-july` | test | summer gas bill → refused as a summer month |
| `e-gas-bill-january` | test | January gas bill, no history → `hdd_scaled` |
| `f-electric-bill-july-baseload` | test | July electric, non-heating (`heating=false`) → `monthly_x12` |
| `g-chandler-oil-ticket` | **demo** | Boston ticket, 140 gal at $6.23, 886 degree days → about 900 gal a year (Suffolk 5,694 HDD) |
| `h-chandler-electric-competitive` | **demo** | Boston Eversource bill, 550 kWh, fictional supplier at 21.9¢ after the intro rate ended → the Basic Service switch beat |
| `i-not-a-bill-receipt` | test | café receipt → `not_a_bill` |
| `j-phone-photo-oil-ticket` | test | bill B photographed on a table: tilted, shadowed, soft JPEG |

- **Bills a–f** read their numbers from `lib/parse/__tests__/fixtures/`, so a picture and its fixture cannot drift apart.
- **Expected reader output** is in `expected/`.
- **Form fields per bill** (county, heating flag) are in `manifest.json`.

## Known gaps

- **Fixture C contradicts itself.** Current usage is 1,043 kWh (September), but its own history ends at 470 kWh for September. The bill prints what the fixture says. Fix the fixture, then rerun `npm run bills`.
- **D, E and F have no usage grid.** The real Eversource bill always prints 13 months of history. We leave it out on purpose: those fixtures exist to test the paths that have no history.
- **Grid length.** The real grid shows 13 months; ours shows 12 to match the fixtures.
- **National Grid layout.** It isn't covered: their sample-bill pages refused automated access. All utility bills here use the Eversource layout, in Eversource towns.
