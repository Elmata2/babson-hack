# Explaining the 2027 step-down

The whole-home rebate falls from $2,650 per ton (cap $8,500) to $2,350 per ton (cap
$7,500) for installs on or after 2027-01-01. Confirm both with `get_program_rule`.

- The year that counts is the **install date**, not the day someone signs. Documentation
  must reach Mass Save by the deadline the rule returns.
- Only call a case `SWITCH_BEFORE_DEC31` when `compute_verdict` says so. The engine
  returns it only when the economics already work (savings above zero, payback inside 15
  years) and the 2026 rebate is larger than the 2027 one. The calendar alone never decides it.
- A gas-heated home is often `DO_NOT_SWITCH_YET`. Say so plainly and give the break-even
  electricity price the engine returns. Do not soften a loss into "savings of $0".
- Gas homes are eligible for the standard whole-home rebate where the gas sponsor is a
  Mass Save sponsor. Only the income-based enhanced tier excludes them.
- Never promise a rebate. "Likely eligible", not "you qualify".
