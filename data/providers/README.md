# Provider directory — what may be in here

`fuel.json` and `installers.json` are the seed the call flow reads (design §12.4).
Every row is a `SwitchProvider` (`lib/switch/types.ts`):

```json
{
  "id": "test-fuel-a",
  "name": "Team test line — fuel A",
  "kind": "fuel",
  "channels": ["phone"],
  "phone": "+15550100001",
  "email": null,
  "towns": ["Framingham", "Natick"],
  "source": "Team allowlist · reserved fiction range",
  "asOf": "2026-10-24",
  "allowlist": true
}
```

## The two rules

1. **A real business needs a `source` and an `asOf`.** The source is where the
   business line was read (the company's own contact page, the Mass Save
   participating-contractor list, the DOER dealer list). R22.3: no scraping review
   sites, no number without a date.
2. **Nothing here is dialled unless the deployment says so.** R19.8: a row with
   `allowlist: false` is only called when the server has
   `PROVIDER_CALLS_ENABLED=true`. Otherwise the row is shown as context and the
   switch kit is the path.

## Why the committed seed is test lines only

The seed ships the team's own test lines and nothing else, because publishing a
business's phone number that we did not verify from that business's own page is
exactly the invented-data problem R19.8 exists to prevent. The numbers above are
in the 555-0100–555-0199 range, which is reserved for fiction, so no reader can
mistake them for a real dealer.

Operators add real rows on the deployment that will call them:

```bash
# On the deployment, not in the repository:
PROVIDER_ALLOWLIST_JSON='[{"id":"metrowest-oil","name":"…","kind":"fuel", …}]'
```

`lib/switch/__tests__/directory.test.ts` enforces both rules on the committed
files: a row without `source`/`asOf` fails, and a real row fails the allowlist
check when it carries no source url.
