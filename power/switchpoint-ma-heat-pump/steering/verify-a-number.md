# Verify a number before it goes anywhere

Use this whenever you are about to write a rebate, rate, payback, price or utility into
code, a test fixture, documentation or a reply.

1. Is it a program number (rebate per ton, cap, deadline)? Call `get_program_rule` for the year and tier.
2. Is it a fuel price? Call `get_fuel_snapshot` and quote its `asOf` date.
3. Is it about a town? Call `lookup_sponsor`. Treat `null` as a question for the user.
4. Is it a verdict, savings, payback or break-even? Call `compute_verdict` with the real inputs.
5. Is it none of these? Say you do not have a sourced figure. Do not estimate one.

When a test needs a fixture, assert a property (sign, bounds, monotonicity) rather than
pasting the engine's output, unless the number is a documented anchor.

If a tool result contradicts `.kiro/steering/mass-save-rules.md`, stop and report both.
