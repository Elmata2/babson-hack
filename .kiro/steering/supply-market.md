# Steering — Massachusetts electricity supply market (source of truth)

**Inclusion:** always

The only legal source for electricity *supply* figures on `/map` ("Your bill").
Program and rebate numbers stay in `mass-save-rules.md`. Machine-readable copy:
`data/rules/supply-2026.json`. Every value here was read on **2026-10-24**.

## 1. Delivery vs supply

- **Delivery** (poles, wires, the delivery half of the bill) is fixed by address. It is
  the utility from MassGIS *Electricity Providers*. It can't be switched.
- **Supply** (the energy itself) is a choice in Eversource, National Grid and
  Unitil towns. In the 41 municipal-light-plant towns the light plant both
  supplies and delivers: no supply choice, no Mass Save electric rebates.

## 2. The three supply options

| Option | What it is | Rules |
| --- | --- | --- |
| **Basic Service** | The utility's default supply, approved by the DPU | Resets every 6 months for residential customers. If the bill's supplier line names the utility, the customer is on Basic Service |
| **Municipal aggregation** | The town contracts supply for all residents | Enrolled unless you opt out, **no exit fee** to opt out. Availability varies by town; link to the state list, never claim a town has or lacks one |
| **Competitive supplier** | An individual contract with a retail supplier | Check contract end date, variable vs fixed rate, auto-renewal, early termination fee. Compare at Energy Switch Massachusetts |

## 3. Numbers

| Figure | Value | Source |
| --- | --- | --- |
| Eversource Basic Service, residential, supply only | **17.3¢/kWh**, Aug 1 2026 → Jan 2027 | Boston.com, 2026-07-29 |
| National Grid Basic Service, residential, supply only | **16.074¢/kWh**, Aug 1 2026 → Jan 2027 | Boston.com, 2026-07-29 |
| Unitil Basic Service, residential (R-1), fixed price, supply only | **18.921¢/kWh** ($0.18921), Aug 1 2026 → Jan 31 2027. Residential customers are placed on it automatically and may switch once to the monthly price (11.931¢ Sep 2026 to 31.010¢ Jan 2027). Includes the 0.991¢ Basic Service Costs Adder | Unitil residential rate sheet, "Effective: August 1, 2026", document date 2026-08-01, read 2026-10-24. Not a DPU order; Unitil's own pamphlet labels the same figure "Proposed August 2026" |
| Competitive supply overpayment | residential customers paid **$738.7M** more than Basic Service, Jul 2024 – Jun 2025 | MA Attorney General, 2026 Competitive Supply Report |
| Market split, Mar 2026 | **51%** aggregation · **26.6%** Basic Service · **~22%** competitive | MA AG, *The Energy Advocate*, summer 2026 |
| All-in residential average (context only) | 30.49¢/kWh, Jul 2026 | EIA (see `mass-save-rules.md` §2) |

Print a ¢/kWh Basic Service rate exactly as stored (`formatCents`), never rounded to one decimal on one surface and exact on another.

Basic Service rates are **supply-only**. Never compare them to the all-in 30.49¢.

URLs:
- Boston.com: https://boston.com/news/local-news/2026/07/29/electric-utility-rates-are-going-up-aug-1-will-your-bill-actually-increase
- Unitil rate sheet: https://unitil.com/sites/default/files/2024-01/MA-Residential-Electric-Rates.pdf
- Unitil pamphlet: https://unitil.com/sites/default/files/2026-07/2026%20FGE%20Basic%20Service%20Update-Aug26-Jan27-0928.pdf
- AG report: https://www.mass.gov/doc/2026-competitive-supply-report/download
- AG newsletter: https://www.mass.gov/doc/era-newsletter-the-energy-advocate-summer-2026/download
- Municipal aggregation: https://www.mass.gov/info-details/municipal-aggregation
- Energy Switch MA: https://www.energyswitchma.gov/

## 4. The one calculation allowed

`monthlyDifferenceUsd = (supplierRateCents − basicServiceCents) × monthlyKwh / 100`

Inputs come from the user's profile. Show the formula with the numbers substituted.
Positive means "you pay $X/month more than Basic Service". Only where a Basic Service number
exists: Eversource, National Grid and Unitil.

## 5. Do not claim

- That any specific town has, or lacks, a municipal aggregation program.
- A Nantucket Electric Basic Service rate: the Boston.com figure is Massachusetts Electric.
- That competitive supply is banned. The AG's ban bill (H 3534 / S 2255) and the
  House's April 2026 local-option language were **pending** when this was read.
- Any rate after the January 2027 reset. Say "this comparison will change at the next reset".
