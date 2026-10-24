# Base case — 106 Chandler St, Boston

**Status:** worked example · 2026-10-24
**Purpose:** one household, end to end: what they can choose, what it costs, what
switching saves now vs in 2027. Use it to sanity-check the engine, the demo script
and the spec addendum (R17–R25).

**What is real and what is not**

| Kind | Items |
| --- | --- |
| **Real, from the repo's sourced files** | utility, rates, rebate tables |
| **Real engine output** (`lib/calc` `computeVerdict`, run 2026-10-24) | heat pump numbers |
| **Invented** | the bills, the $5.79 oil quote |
| **Rough estimate, not the engine** | solar figures |
| **Unverified** | anything marked *verify*. It does not go into the app until it is in a steering file with a dated source. |

---

## 1. The address

Run through the app's own lookups (`lib/geocode`, `lib/parcel`, `mvp/utilities.json`):

| Step | Result |
| --- | --- |
| Geocode `106 Chandler St, Boston, MA` | `106 CHANDLER ST, BOSTON, MA, 02116` · tract `25025070301` · Suffolk |
| Geocode `106 Chandler St, Worcester, MA` | also exists: `01609` · tract `25027731400` |
| Geocode `106 Chandler Street, MA` (no town) | **silently picks Boston** |
| Parcel, 15 m buffer, Boston | returned **56 Clarendon St #2** (a 1997 condo), not the house |
| Parcel, 15 m buffer, Worcester | returned use code `930V` (city-owned vacant land) |
| Electric utility | Boston → **Eversource (NSTAR Electric)**; Worcester → National Grid |

**Findings for the build**
1. A street that exists in two towns needs a "which town?" prompt. The intake must
   not accept the geocoder's silent pick.
2. A buffered parcel hit can be the neighbour. Show it as *nearby*, never as "your
   house", and never take `yearBuilt` from it silently (R1.3).

Boston is used below.

## 2. The test bills (invented)

| Bill | Figures |
| --- | --- |
| Heating oil, last winter | **900 gal × $6.23 = $5,607** · old brick rowhouse, oil boiler |
| Eversource electric | **550 kWh/month** · supplier "XYZ Energy" at **21.9¢/kWh** (intro rate expired, rolled to variable) |
| Gas variant of the same house | **1,000 therms × $2.10 = $2,100/yr**, delivered by National Grid |

Rates used (from `.kiro/steering/`):
- Eversource all-in electricity is **30.5¢/kWh**.
- The seasonal heat pump rate is **23.5¢** (−7¢, Nov 1 – Apr 30).
- Eversource Basic Service supply is **17.3¢/kWh**, valid Aug 2026 – Jan 2027.
- HDD65 is 5,600 (Boston).

## 3. What this household can choose

### 3.1 Who supplies the electricity (delivery is fixed: Eversource)

| Option | Price | Notes |
| --- | --- | --- |
| Basic Service (Eversource) | 17.3¢/kWh supply | resets every 6 months (next: Feb 1) |
| Boston's city program (municipal aggregation) | *verify* | enrolled by default, no fee to opt out |
| Competitive supplier | 21.9¢ on this bill | MA households paid **$738.7M** more than Basic Service, Jul 2024 – Jun 2025 (AG report) |

Back to Basic Service: `(21.9 − 17.3)¢ × 550 kWh = $25.30/month ≈ $304/yr`.
Check the contract for an early-termination fee first.

### 3.2 Keep oil, buy it cheaper

Cash/COD prices vary by dealer and are only given by phone (the job of the agent
in Addendum A). Hypothetical quote $5.79 vs $6.23: `900 × $0.44 = $396/yr`.

### 3.3 Heat pump — engine output, oil house

Inputs:

```ts
heating = { fuel: 'oil', annualUnits: 900, unitPrice: 6.23, hdd65: 5600 }
upgrade = { tier: 'whole', installYear: 2026 | 2027, heatPumpRate: 0.235, standardRate: 0.305 }
// installCost defaults to $22,000 (Mass Save average), SCOP 2.7
```

| | Install 2026 | Install 2027 |
| --- | --- | --- |
| Size | 3.5 tons | 3.5 tons |
| Electricity added | 10,824 kWh/yr | 10,824 kWh/yr |
| Heating cost | $5,607 → **$2,544** | same |
| Savings, seasonal rate | **$3,063/yr** | same |
| Savings, standard rate | $2,306/yr | same |
| Rebate | **$8,500** (cap hit) | $7,500 (cap hit) |
| Net cost | $13,500 | $14,500 |
| Payback | **4.4 yr** | 4.7 yr |
| HEAT Loan 0% / 84 mo | $161/mo vs $255/mo saved → **+$94/mo** | $173/mo → +$82/mo |
| Verdict | **`SWITCH_BEFORE_DEC31`** | `SWITCH_NOW` |
| Cost of waiting | — | **$1,000** |

With the cheaper oil quote ($5.79):

| Measure | Result |
| --- | --- |
| Savings | $2,667/yr (seasonal rate), $1,910/yr (standard rate) |
| Payback | 5.1 yr in 2026, 5.4 yr in 2027 |
| Verdict | unchanged |

Cheaper oil weakens the heat pump case, and the screen must show that (R20.7).

### 3.4 Heat pump — engine output, gas house

| | Install 2026 | Install 2027 |
| --- | --- | --- |
| Size | 3.0 tons | 3.0 tons |
| Heating cost | $2,100 → $2,168 | same |
| Savings, seasonal rate | **−$68/yr** | same |
| Savings, standard rate | **−$714/yr** | same |
| Rebate | $7,950 | $7,050 |
| Break-even electricity price | **22.8¢/kWh** | same |
| Verdict | **`DO_NOT_SWITCH_YET`** | `DO_NOT_SWITCH_YET` |

For this household the useful moves are the supply switch, insulation, and
revisiting the heat pump when the boiler or AC needs replacing.

### 3.5 Summary — oil household

| Action | Effort | Saves |
| --- | --- | --- |
| Back to Basic Service | one phone call | ~$304/yr |
| Cheaper oil dealer (this winter) | agent calls | ~$396/yr |
| Heat pump before Dec 31 | assessment, then install | ~$3,063/yr; +$94/mo on the loan |
| Waiting until 2027 instead | — | −$1,000 once |

---

## 4. Renewables

**The 2026 change:** the federal 30% residential credit (25D) ended on
2025-12-31. In 2026 the support comes from Massachusetts programs.

### 4.1 Options

| Option | What you do | Money | Best for |
| --- | --- | --- | --- |
| Community solar | Subscribe to a solar farm; credits on the Eversource bill | typically ~10% off subscribed kWh, more for low income (*verify*) | renters, condos, shaded or historic roofs |
| Rooftop solar, owned | Buy the panels | see 4.2 | sunny roof you control |
| Solar lease / PPA | Third party owns the panels | no upfront cost; owner may still get a federal business credit for a while (*verify* the deadline) | no capital |
| Home battery | Usually paired with solar | Mass Save ConnectedSolutions: **$275/kW** of average summer-event output, up to **$1,375/yr** for 5 kW, rate locked 5 summers; +4¢/kWh SMART adder with solar; 0% financing | solar homes, backup |
| Greener supply | Higher-renewable plan | costs more, not less; Boston's city program has a greener tier (*verify*) | anyone |
| Heat pump | Electrify heating | §3.3 | oil and propane homes |

### 4.2 Rooftop solar incentives

| Incentive | Value |
| --- | --- |
| Net metering | Full retail credit for exported power, residential systems ≤ 25 kW AC (Eversource, National Grid, Unitil) |
| SMART 3.0 | **3¢/kWh**, or **6¢** low-income, for 20 years, residential < 25 kW |
| State tax credit | **15%, capped at $1,000**; also sales and property tax exemptions |

### 4.3 Rough rooftop numbers (estimate, not engine)

| Item | Value |
| --- | --- |
| System | 5 kW → ~6,000 kWh/yr in Boston |
| Bill credits | ~$1,830/yr at ~30.5¢ |
| SMART payment | ~$180/yr |
| **Total value** | **~$2,000/yr** |
| Install cost | ~$17,500 at ~$3.50/W, −$1,000 state credit → ~$16,500 |
| **Payback** | **~8 yr** (about 6 yr in 2025, when the federal credit cut ~$5,250) |

With the heat pump, use rises from 6,600 to ~17,400 kWh/yr. 5 kW covers about a
third of it.

### 4.4 Street reality

- The South End Landmark District likely requires review for panels visible from
  the street; flat roofs behind parapets usually pass (*verify*).
- Condo associations must approve.
- Narrow streets mean shade.

**Community solar is the realistic default here.** A ~$2,000/yr bill at 10% off is
~$200/yr, with no roof and no upfront cost.

### 4.5 Order of operations

1. Supply back to Basic Service (~$300/yr, today).
2. Heat pump before Dec 31 (~$3,060/yr; waiting costs $1,000).
3. Solar or community solar against the larger electric bill.

---

## 5. Sources

**Program and price figures used in §1–§3:** `.kiro/steering/mass-save-rules.md`,
`.kiro/steering/supply-market.md`, `.kiro/steering/data-sources.md`.

**Renewables (§4).** Mostly secondary and vendor sources; confirm against DOER and
the utility before use:

| Source | Covers |
| --- | --- |
| [Mass Save — ConnectedSolutions batteries](https://masssave.com/saving/residential-rebates/connectedsolutions-batteries) | battery payments |
| [National Grid — battery program](https://www.nationalgridus.com/MA-Home/Connected-Solutions/BatteryProgram) | battery payments |
| [Solect — SMART 3.0](https://solect.com/inside-smart-3-0-how-massachusetts-revamped-its-solar-energy-storage-policy/) | SMART 3.0 rates |
| [solargardens.org — MA solar incentives 2026](https://solargardens.org/massachusetts-solar-incentives-2026-credits-and-savings/) | state incentives |
| [NuWatt — solar without the tax credit, 2026](https://nuwattenergy.com/en/massachusetts/solar-without-tax-credit-2026) | federal credit expiry |
| [EnergySage — MA incentives](https://www.energysage.com/solar/net-metering-massachusetts-top-solar-incentive/) | net metering, state credit |

**Estimate only. Not a quote. A Home Energy Assessment determines eligibility and
sizing.**
