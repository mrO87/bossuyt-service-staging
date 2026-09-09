# Agy review brief — semantic / logic review, v1.53.2

**Repo:** `mrO87/bossuyt-service-staging`
**Branch:** `feature/service-bon-v1.53`
**Commit range:** `61bd700..e486dc6` (15 commits, 36 files, ~3000 added lines)
**Only live site:** https://staging.bossuyt.fixassistant.com — never touch the
`production` branch or the two old demo hosts.

---

## What is different about this review

Your last two reviews looked for *defects in the code as written* — races,
missing indexes, error paths that return the wrong status. Those found real
bugs and they are fixed.

This review asks for something else: **code that is correct as written but
wrong about the business.** It compiles, the tests pass, the types line up,
and it still does the wrong thing because it encodes a wrong belief about how
a service company works.

Here is the bug that prompted this brief, as a worked example of the shape.

> A technician fills in a part on the service bon. There is a checkbox,
> "te bestellen". Checked means: we do not have this, buy it from the
> supplier. Unchecked means: I took it off the van, it is already fitted.
>
> The form created a task for both cases, and stored both with
> `type: 'order_part'`. It did differentiate — the title said "Stock
> aanvullen" and the payload carried `order_type: 'stock_replenish'` — so on
> screen it looked right. But every query selects on `type`. The warehouse
> screen listed the refill under "Openstaande bestellingen", and
> `/api/erp/parts-pending` filtered `type = 'order_part'`, so the refill was
> handed to Navision as a pending supplier purchase for a part that was
> already installed in the customer's machine.
>
> No test failed. No type error. Nothing in the diff looks wrong. You only
> catch it by knowing that "used from stock" and "must be bought" are two
> different facts about the world, and then noticing that the code stores
> them in one field.

That is the class. Fixed in `e486dc6`; use it to calibrate, not to report.

**Is this kind of review feasible?** Yes, but only if you are given the
business rules as ground truth, because they are not derivable from the code —
the code *is* the thing under suspicion. So section 3 below lists the rules.
Your job is to check the code against that list, not to infer the list from
the code. Where a rule is missing or ambiguous, say so: "the code assumes X,
the brief does not state X, someone should confirm X with Bossuyt" is a
first-class finding, not a cop-out.

---

## 1. What the app is

Field service software for Bossuyt, who install and repair professional
laundry and kitchen equipment across Belgium. Three kinds of user:

- **Technician** — in a van, on a phone, often with gloves on. Drives to a
  site, fixes a machine, fills in the service bon, gets the customer's
  signature, moves to the next job. Frequently has no signal.
- **Warehouse (magazijn)** — orders parts from suppliers, receives them, and
  lays out picking lists for follow-up visits.
- **Office / planner** — creates work orders, schedules revisits, talks to
  customers.

The paper artefact this replaces is the "SERVICE BON": a pre-printed A4 the
technician fills in by hand and the customer signs. The app reproduces it as a
PDF (`lib/pdf.ts`), laid out in millimetres to match the printed form.

Stack: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4,
Drizzle ORM on PostgreSQL 16, IndexedDB (`idb`) for offline drafts, jsPDF for
the bon, vitest against a real Postgres. Docker + Traefik on Hetzner.

UI language is Dutch (nl-BE). Code, identifiers and comments are English.

---

## 2. The data model, in one pass

```
customers ──< sites ──< devices
                 └──< contacts

work_orders   (an intervention: this customer, this site, this machine, this day)
   ├──< werkbonnen        (the signed service bon produced by a visit)
   ├──< tasks             (the workflow: order a part, plan a revisit, …)
   ├──< work_order_events (append-only audit log)
   └──< work_order_links  (revisit / follow_up / warranty_claim / split / related)

tasks ──< task_dependencies  (predecessor → successor, finish_to_start)
```

Names that matter:

| Field | Meaning |
| --- | --- |
| `customers.customer_number` | KLANT N° L, the business key, e.g. `K04647` |
| `customers.invoice_customer_number` | KLANT N° F, the invoicing customer when it differs |
| `work_orders.ticket_number` | TICKET N°, the ERP's identifier for the job |
| `work_orders.device_id` | **nullable** — a ticket can arrive before anyone knows which unit |
| `werkbonnen.bon_number` | the sequential number printed on the bon |
| `tasks.type` | what the task is (`order_part`, `replenish_stock`, `plan_revisit`, `pick_parts`, `load_parts`, …) |
| `tasks.role` | who does it (`technician`, `warehouse`, `office`, `admin`) |
| `tasks.status` | `pending → ready → in_progress → done`, plus `skipped`, `cancelled`, `blocked` |

---

## 3. The business rules — treat these as ground truth

Check the code against each of these. This is the core of the assignment.

### Parts

- **P1.** A part line on a bon is exactly one of two things: bought from a
  supplier, or taken from van/shelf stock and already fitted. These are
  different facts and must stay distinguishable at every layer that filters.
- **P2.** Only supplier purchases reach the ERP. A stock refill is internal
  warehouse housekeeping; exporting it as a purchase order would make Bossuyt
  buy a part twice.
- **P3.** A quantity is always a positive integer. A part with quantity 0 is
  not a part.
- **P4.** Prices on the bon are informational. Invoicing happens in the ERP,
  not here.

### Bon numbers

- **B1.** Every completed werkbon gets a bon number, unique across the whole
  system, allocated in sequence.
- **B2.** Two technicians finishing at the same second must not get the same
  number. Allocation happens under a row lock.
- **B3.** A bon number, once printed and signed, never changes.

### The task state machine

- **T1.** `pending → ready → in_progress → done`. `skipped` and `cancelled`
  are terminal. No other transitions.
- **T2.** A task is `ready` only when every predecessor is `done`. A task with
  an unfinished predecessor must never be actionable on screen.
- **T3.** Completing a task promotes its now-unblocked successors. This is how
  the warehouse's "parts are picked" unlocks the technician's "parts loaded".
- **T4.** Every transition writes a `work_order_events` row naming the actor.
  An unattributed state change is a defect.

### The follow-up flow

- **F1.** The technician cannot finish a job because a part is missing. They
  order the part and the office plans a revisit.
- **F2.** The revisit is a *new* work order, linked to the original, for the
  same customer, site and device.
- **F3.** Before the revisit, the warehouse lays out the parts
  (`pick_parts`), then the technician confirms they are in the van
  (`load_parts`). The second cannot happen before the first.
- **F4.** The revisit's pre-filled part list comes from parts that were
  *ordered* for the original job. Parts already fitted from stock are not
  brought along again.

### Offline

- **O1.** Every write goes to IndexedDB before it goes to the API. The
  technician's phone loses signal in basements and machine rooms.
- **O2.** A queued command may be retried any number of times. Retries carry a
  `client_id` and must be idempotent — a double send must not create two tasks,
  two bons, or two work orders.
- **O3.** A draft is the technician's unsent work. Nothing may silently
  discard it, and a save that succeeds must clear it.

### Identity

- **I1.** `customers.customer_number` is Bossuyt's business key. The internal
  UUID must never be written into it. (An earlier proposed patch would have
  done exactly this to 16 legacy customers.)
- **I2.** When a caller sends an `id`, they picked that row from a list. The id
  is authoritative and must not be second-guessed by name matching.
- **I3.** Creating a work order must never silently overwrite stored customer
  data with blanks. An absent field means "unchanged", not "clear it".

### Wire format

- **W1.** `/api/erp/*` speaks `snake_case`. This is deliberate — it is
  Navision's convention and the boundary is where the convention changes.
- **W2.** Internal routes speak `camelCase`.
- **W3.** ERP routes are authenticated with the `x-erp-key` header. No ERP
  route may be reachable without it.

### The bon itself

- **V1.** Arrival/departure time and work start/end are four different
  timestamps and are not interchangeable. Travel is billed differently from
  work.
- **V2.** `tripCount` counts journeys, `personCount` counts technicians. A
  two-person job is not two trips.
- **V3.** Week and weekend are different rates. `interventionKind` decides
  which, and it is not derivable from the visit date alone — Bossuyt decides.
- **V4.** The customer's signature belongs to the bon as printed. If the bon's
  content can change after signing, that is a defect.

---

## 4. The bug classes to hunt

Ordered by how much damage they have already caused in this codebase.

1. **Enum conflation.** Two different facts stored in one field value,
   distinguished only by a label or a payload key that no query filters on.
   This is the `order_part` / `replenish_stock` bug. Look for any other place
   where a display string or a `payload.*` field carries meaning that the
   schema does not.

2. **Filter asymmetry.** A write path learns a new case; a read path still
   filters on the old set. Every `eq(x.type, …)`, `inArray`, `.filter(…)`,
   `switch` and `Record<SomeUnion, …>` is a place where adding a union member
   can silently drop rows. Find the ones that were not updated.

3. **Set-collection asymmetry.** Rows are gathered from one list, then their
   related records are looked up using ids collected from a *different* list,
   and the mismatch is swallowed by a `if (!found) continue`. This exact bug
   appeared twice here. Grep for guards that skip silently.

4. **Null versus empty string.** `?? ''` on an update path overwrites stored
   data with blanks. An absent field and a cleared field are different
   intentions.

5. **Denormalized copies drifting.** `interventions` carry copies of customer
   name, site address, device brand. When the source changes, does the copy?
   Should it? A bon printed last month should keep last month's address.

6. **Defaults that assert something.** A boolean defaulting to `false` is an
   assertion about the world. `toOrder = false` means "from stock" — is that
   the right default for a technician in a hurry?

7. **Role and visibility.** A task has a `role`. Does every screen only show
   what that role should act on? Can a technician complete a warehouse task,
   or vice versa?

8. **Ordering and time.** The activity log was recently changed to
   oldest-first so the flow reads in order. Check every sort against what the
   reader needs. Also: timezone handling on `plannedDate`, `visitDate` and
   "done today" boundaries — Belgium is UTC+1/+2 and `setHours(0,0,0,0)` is
   local, while stored timestamps may not be.

9. **Idempotency key scope.** `client_id` dedupes retries. Is each key unique
   enough that two genuinely different actions cannot collide, and stable
   enough that a retry actually matches?

10. **Units and rounding.** Millimetres in the PDF, minutes in estimates,
    quantities on parts. Any place a number changes unit without a name change.

---

## 5. What to skip

Already known and deliberately deferred. Do not re-report:

- Stale `technicianId` / `deviceId` yields an opaque 500 instead of a 400.
  SQLSTATE 23503 is not yet mapped. Known.
- `werkbonnen.bon_number` has no unique index yet. Known.
- The bon-number lock is untested under real contention. Known.
- `lib/lessons.ts:370` references a `Werkbon` type that was deleted. Known.
- Two open questions for Bossuyt: what KLANT N° L versus F mean exactly, and
  whether the ERP payload should omit null keys rather than send them.

Also out of scope: formatting, naming style, test-framework preferences,
"consider extracting this into a hook", and anything about the `production`
branch or the old demo hosts.

---

## 6. Where to look first

Highest semantic risk in this range, roughly in order:

| File | Why |
| --- | --- |
| `components/WerkbonForm/index.tsx` | the technician's whole job passes through it; draft races, task creation, submit guards |
| `lib/server/work-orders.ts` | customer/site/device resolution, duplicate handling, the id-versus-name rules |
| `app/api/warehouse/queue/route.ts` | three task types, three lists, one metadata map |
| `app/api/erp/*` | the boundary where a wrong belief leaves the building |
| `lib/pdf.ts` | the bon is a legal-ish document; wrong field in wrong box is a real problem |
| `lib/idb.ts` | offline drafts and the command queue |
| `app/werkbon/nieuw/page.tsx` | the manual work-order wizard |
| `lib/tasks/` | dependencies, transitions, queue shaping |

---

## 7. How to report

One entry per finding, in this shape:

```
### L-01 — <one line, the wrong belief, not the symptom>

Rule broken: <P1 / T2 / F4 / … or "unstated, needs confirming">
Location:    path/to/file.ts:123
Severity:    blocker | serious | minor | question
Confidence:  high | medium | low

Scenario:
  <A concrete walk-through. Real names, real numbers. "Technician Bart
  fits a €340 pump he had on the van, ticks nothing, saves the bon.
  Two days later Navision has ordered a second pump.">

Why the code believes otherwise:
  <the assumption the code encodes>

Suggested fix:
  <smallest change that makes the code agree with the rule>
```

Rules for the report:

- **A finding without a scenario is not a finding.** If you cannot write the
  concrete sequence that produces a wrong outcome for a real person, it is a
  hunch — file it as `question`, low confidence, and say what you would need
  to check.
- **Say when you are not sure.** A wrong high-confidence finding costs more
  than a right low-confidence one, because it gets acted on.
- **Rank by damage to Bossuyt**, not by how clever the bug is. A part ordered
  twice costs money. A misaligned PDF line costs nothing.
- **Missing rules count.** If the code depends on something section 3 does not
  state, that gap is worth reporting on its own.
- Cap the report at roughly 15 findings. Depth beats breadth here — a shallow
  list of 40 maybes is less useful than 8 findings I can act on today.

---

## 8. Running it

```bash
git clone https://github.com/mrO87/bossuyt-service-staging
cd bossuyt-service-staging
git checkout feature/service-bon-v1.53
git diff 61bd700..e486dc6           # the range under review
```

Read whole files, not just the diff. A semantic bug usually lives in the gap
between two files that were each fine on their own.

The suite runs with `npm test` and needs a Postgres at `DATABASE_URL_TEST`.
102 tests pass on `e486dc6`; `npx tsc --noEmit` and `npm run lint` are clean.
You do not need to run any of it to do this review — nothing here is caught by
the suite, which is the point.
