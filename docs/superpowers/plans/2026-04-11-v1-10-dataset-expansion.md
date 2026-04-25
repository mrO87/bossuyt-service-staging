# v1.10 Dataset Expansion Plan

Date: 2026-04-11
Execution: inline only, no subagents

## Steps

1. Expand `lib/mock-data.ts`
- grow customers to about 15
- add more sites where useful
- add more devices, especially for current planning customers
- add historical old work orders as database-ready records

2. Align seeding
- keep `lib/db/seed.ts` reusing the mock dataset
- make sure the expanded work orders seed cleanly

3. Release metadata
- add `v1.10` to `lib/releases.ts`

4. Verify locally
- lint touched files
- build

5. Roll out to staging
- reseed staging DB
- verify staging API returns richer data

6. Update plan-site changenotes
- keep homepage pointer on old demo release
- add `v1.10` changelog entry on the plan-site changenotes page only
