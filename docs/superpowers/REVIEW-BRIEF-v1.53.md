# Independent review brief — Bossuyt Service Bon, v1.53

Hand this whole file to the reviewing agent. It is self-contained; the reviewer
needs no prior conversation context.

---

## Your job

You are the independent reviewer for a feature branch that was implemented
without a per-task review pass. Six commits went in unreviewed. Your job is to
find what a reviewer would have caught, and to say plainly whether this is safe
to deploy to a staging environment that real technicians will use.

You are the only reviewer this code will get before it ships. Do not assume
someone else will catch what you skip.

Work read-only. Do not modify the working tree, the index, HEAD, or branch
state. Do not commit, rebase, reset, or stash anything. If you want a change
made, describe it; do not make it.

**Repository:** `/mnt/data/bossuyt_service_next_staging` (a git worktree, branch `main`)

---

## What the project is

A mobile-first field-service app for Bossuyt Grootkeukens, a Belgian commercial
kitchen service company. Technicians use it on a phone, in a kitchen, sometimes
with gloves on. It digitises their paper "SERVICE BON | BON DE SERVICE" work
order.

- **Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4,
  Drizzle ORM 0.45 + PostgreSQL 16, jsPDF 4, idb 8, vitest 4 against a real
  database.
- **UI language is Dutch (nl-BE).** Paper labels are deliberately bilingual
  `NL | FR` because the printed form is. Code, comments and identifiers are English.
- **Wire format:** `/api/erp/*` routes use snake_case (they face an external ERP
  system). All other routes return camelCase (they feed React directly). This
  split is intentional — do not flag it as inconsistency.
- The scanned paper form this all mirrors is at
  `tests/fixtures/sauna-molenhoeve.pdf`. Look at it. It is the specification for
  the PDF and for the field list.

**Design spec:** `docs/superpowers/specs/2026-09-08-service-bon-work-orders-design.md`
**Implementation plan:** `docs/superpowers/plans/2026-09-08-service-bon-work-orders.md`

The spec is the binding authority. Where the plan and the spec disagree, the
spec wins. Where the code and the plan disagree, that is a finding — but judge
whether the deviation was an improvement before calling it a defect.

---

## Exactly what to review

Six commits, `61bd700..170355a`, 23 files, roughly 1625 insertions and 652
deletions:

| Commit | What it claims to do |
|---|---|
| `0ba5007` | Four-step wizard at `/werkbon/nieuw` that creates a work order via `POST /api/work-orders`; new `components/NewWorkOrder/*`; a "+" entry point on the day view |
| `03e6a0b` | IndexedDB draft store bumped to v3, keyed by intervention (`lib/idb.ts`, `types/index.ts`) |
| `6bd6d3f` | Werkbon form restructured into paper order; new `BonHeaderCard`, `VisitSection`, `DevicePicker`; draft autosave |
| `6e4586d` | `lib/pdf.ts` rebuilt as a facsimile of the paper bon; logo extracted from the sample PDF |
| `b611153` | `scripts/load-example-order.ts` + an npm script |
| `170355a` | Release metadata for v1.53 and documentation updates |

Get the diff with:

```
git diff --stat 61bd700..170355a
git diff -U10 61bd700..170355a
```

Everything before `61bd700` was already reviewed by another agent and is **out
of scope**. Do not re-review it. If you spot something serious in that older
code anyway, put it under "Out of scope observations" rather than in your main
findings.

---

## Current state, so you do not waste time re-deriving it

- 92 tests pass (`npm test`). `npx tsc --noEmit` exits 0. `npm run lint` is clean.
- Tests run against a database called `bossuyt_test`. **Never point tests at
  `bossuyt_staging`** — that database backs the staging site, and the suite's
  `resetTaskState()` issues unqualified DELETEs.
- A real work order exists end to end from the sample bon: ticket `TKT20/12752`,
  customer `K04647`, Molenhoeve group bvba. Posting it twice returns 409.
- The host is memory-constrained (about 1.2 GB free with ~24 containers
  running). A Next.js production build has been killed by the OOM killer three
  times. **Do not attempt `npm run build` or a Docker build.** Running
  `npm test`, `tsc` and `lint` is fine.

---

## Known and already-recorded, so you can spend your attention elsewhere

These are logged. Mention them only if you think the severity is wrong, or if
you find a consequence that was missed. Do not spend your budget rediscovering
them.

1. Submitting a werkbon with a `technicianId` or `deviceId` that no longer
   exists raises a foreign-key error that escapes as an opaque 500, after the
   PDF has already been written to disk. Fix would be mapping SQLSTATE `23503`
   to a 400. Currently unreachable from the UI, because both values come from
   server-supplied lists.
2. `werkbonnen.bon_number` has no unique index. A `SELECT ... FOR UPDATE` row
   lock is the only guard against two submissions computing the same number.
3. The bon-number sequence is only tested sequentially, never under real
   contention, so the lock itself is verified by reading rather than by test.
4. `lib/lessons.ts` around line 370 still names a `Werkbon` TypeScript type that
   was deleted.
5. The warehouse queue renders a blank gap for a job with no device.
6. `POST /api/work-orders` is unauthenticated. The whole app is currently
   unauthenticated; auth is explicitly out of scope for this release.

---

## What I most want your judgement on

Rank these above stylistic concerns.

1. **The wizard's payload.** `app/werkbon/nieuw/page.tsx` builds a snake_case body
   in `buildBody()` and posts it to `POST /api/work-orders`, which parses it in
   `parseCreateWorkOrderBody()` in `lib/server/work-orders.ts`. No test covers
   that pairing. Read both sides and confirm every key the wizard sends is a key
   the parser reads, and that every field the parser requires is one the wizard
   always supplies. A drift here fails only at runtime, in a technician's hand.

2. **The werkbon form's submit.** `components/WerkbonForm/index.tsx` posts
   seventeen multipart fields to `app/api/work-orders/[id]/complete/route.ts`.
   Same question: do the names match exactly, on both sides? Is anything sent
   that is silently dropped, or read that is never sent?

3. **Draft autosave.** `lib/idb.ts` v3 deletes and recreates the `werkbonnen`
   object store on upgrade. Confirm that cannot destroy data a technician cares
   about. Then check the debounced save and the load-once-on-mount in the form
   for races: can a stale draft overwrite fresh input, or a save land after the
   draft was deleted on submit?

4. **The PDF.** `lib/pdf.ts` is hand-laid-out in millimetres. Compare it against
   `tests/fixtures/sauna-molenhoeve.pdf`. Look for overlapping or clipped text
   with realistic data: a long customer name, a 60-character part description,
   ten parts, a two-line address. `tests/pdf.test.ts` covers overflow onto a
   continuation page; judge whether it covers enough.

5. **Anything that loses a technician's work.** This is the thing that matters
   most in this app. A technician can spend twenty minutes filling in a bon in a
   hot kitchen. Any path that discards that silently is a Critical finding, not
   an Important one.

---

## How to report

Verify claims against the code. A comment or a commit message asserting
something is not evidence. Cite `file:line` for every finding.

Do not re-run the full suite to confirm it passes; I have. Run a focused test
only when reading raises a specific doubt no existing run answers.

Severity, calibrated:

- **Critical** — loses or corrupts a technician's work, or breaks a flow they
  depend on.
- **Important** — incorrect or fragile behaviour, a missed spec requirement, or
  maintainability damage you would block a merge over.
- **Minor** — polish, broader coverage, naming.

Output in this shape:

```
### Verdict
Safe to deploy to staging | Not safe to deploy — [one line why]

### Spec compliance
[Missing / Extra / Misunderstood, against the spec, with file:line]

### Findings
#### Critical
#### Important
#### Minor
[each: file:line, what is wrong, why it matters, how to fix]

### What is done well
[be specific and honest; this calibrates the rest]

### Out of scope observations
[anything outside 61bd700..170355a]
```

End with a single sentence: would you put this in front of a technician
tomorrow morning, yes or no, and why.
