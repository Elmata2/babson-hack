# Tasks — Onboarding, best case and dashboard

Feature ids match the `@built` markers in the code and the rows in
`../switchpoint/tasks.md`; the build log reads those, not this file.

## Done

- [x] F-137 `app/onboarding` four-step wizard: profile, bill, house, review (OS1)
- [x] F-138 Sample bills offered inside the upload, through the same `read()` path as a photo (OS1.5)
- [x] F-139 `bill` freshness kind: a number read from the household's own document says so (OS1.3)
- [x] F-140 Home hero and header "Create profile"; the anonymous path stays one click away (OS1.2)
- [x] F-141 `lib/onboarding/flow.ts`: profile validation, step machine, storage round-trip (OP4)
- [x] F-143 `lib/switch/choices.ts` and `best-case.ts`: the R17.2 choice gate and the best-case rows (OS3)
- [x] F-144 `lib/switch/consent.ts`: closed fact list, 50-gal rounding, Eastern hours, six-provider cap, PII refusal (OS5)
- [x] F-146 `lib/switch/session.ts`: tab-scoped request and a stage timeline that only moves forward (OS6.2)
- [x] F-147 `POST /api/switch` with a provider allowlist and typed statuses; nothing sent when outreach is off (OS5.4)
- [x] F-148 `/switch`: best case, decision gate with nothing preselected, switch kit, supply comparison (OS3, OS7)
- [x] F-149 Consent screen, contact status board, quotes and decision step
- [x] F-150 `/dashboard`: current situation, stage timeline, deadlines, forget-this-tab (OS6)
- [x] F-151 Verdict to switch link carrying the whole query, with tests
- [x] F-156 Property tests for the consent gate (OP2)

## Next

- [ ] OP3: turn the session-stage example tests into a property (random event sequences never move a stage backward)
- [ ] OP4: a round-trip property for the profile store
- [ ] Server accounts and stored profiles (needs the ADR that retires "no accounts, no PII")
- [ ] Outbound email and inbound reply parsing
- [ ] Notifications limited to "quote arrived"
