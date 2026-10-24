# Steering — Units, constants, conventions

**Inclusion:** always

## Units

| Quantity | Unit | Notes |
| --- | --- | --- |
| Energy | `MMBtu` | 1 MMBtu = 1,000,000 BTU |
| Electricity | `kWh` | 1 kWh = 3,412.14 BTU |
| Heat output | `BTU/hr` | design load, equipment capacity |
| Capacity | `ton` | 12,000 BTU/hr cooling |
| Price — liquid fuel | `$/gal` | never convert to $/MMBtu in the UI |
| Price — gas | `$/therm` | 1 therm = 100,000 BTU |
| Price — electricity | `$/kWh` | store as dollars, display as cents |
| Money | USD, no cents above $100 | `$4,984` not `$4,983.72` |

Never display two price bases side by side ($/gal next to $/kWh) without a
labelled conversion. Users read that as a mistake.

## Physical constants

```
BTU_PER_GAL_OIL        = 138,500
BTU_PER_GAL_PROPANE    = 91,500
BTU_PER_THERM_GAS      = 100,000
BTU_PER_KWH            = 3,412.14
BTU_PER_TON_COOLING    = 12,000

AFUE_OIL               = 0.80   // range 0.78–0.86
AFUE_GAS               = 0.85   // condensing 0.90–0.96, atm 0.80
AFUE_PROPANE           = 0.85
AFUE_RESISTANCE        = 1.00

SCOP_HEAT_PUMP         = 2.70   // default; range 2.30–3.20
                                // field average in MA ≈ 2.5, nameplate 3.0+

HDD65_BOSTON           = 5,600
HDD65_WORCESTER        = 6,500
HDD65_SPRINGFIELD      = 6,200
DESIGN_TEMP_F_BOSTON   = 7      // 99% heating design condition
```

Every constant is exported from `lib/calc/constants.ts` and carries its unit in
the identifier. No magic numbers anywhere else — a bare `138500` in a component
is a review failure.

## Conventions

- **Signed savings.** `annualSavings = oldCost − newCost`. Negative is allowed
  and must render as a loss, not as `$0`.
- **Round once, at the edge.** Full precision through the engine; round for
  display only.
- **`null` beats a lie.** Missing input → `null`, and the UI asks for it. Never
  substitute a default silently. Every default used must appear in
  `assumptions[]` on the result object and be visible in the UI.
- **Time.** All timestamps ISO 8601 UTC in data, `America/New_York` for display.
  The rebate year is decided by the **install date**, not today's date.
- **Confidence.** Parsed bill fields carry `confidence: 0–1`. `< 0.75` renders
  the field flagged, named in a "Check before you use them" line; one click on
  "Use these numbers" confirms every flagged field.
- **Deterministic core.** `lib/calc/**` imports nothing. No `Date.now()`, no
  `fetch`, no `process.env`. Time is always injected. This is what makes the
  property tests meaningful and the demo reproducible.

## Naming

- Feature ids are `F-NN` and appear in code as `@built F-NN <what>`. The build
  log reads them. No marker, no credit.
- Files: `kebab-case.ts`. Types: `PascalCase`. Result objects:
  `VerdictResult`, `BillParse`, `FuelSnapshot`.
- Every exported function in `lib/calc` has a one-line doc comment stating
  inputs, units, and the invariant it guarantees.
