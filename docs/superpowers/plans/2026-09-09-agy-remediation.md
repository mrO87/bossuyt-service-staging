# Remediation plan — Agy review of v1.53 / v1.53.1

**Branch:** `feature/service-bon-v1.53` (pushed; `main` deliberately left clean for the investor)
**Source review:** `docs/superpowers/AGY-ADVICE-v1.53.md` (Agy / Google Antigravity)
**Baseline:** 92 tests passing, `tsc` and `lint` clean, staging live at v1.53.1

Every finding below was re-verified against the current code, not taken on
trust. Agy reviewed before the PDF ruling fix (`be567df`), so line numbers in
its document have moved; the findings themselves all still hold.

## Severity, as re-rated

| # | Finding | Agy | Mine | Why the difference |
|---|---|---|---|---|
| 1 | Existing customer gets cloned | Important | **Critical** | 16 of 17 customers have no customer number, so this fires on the normal path and corrupts the customer list |
| 2 | Draft races: stale overwrite, zombie resurrection | Critical | **Critical** | agreed — it loses or resurrects a technician's typing |
| 3 | Validation errors invisible in the ticket step | Critical | **Important** | the technician is stuck with no feedback, but nothing is lost |
| 4 | 409 promises a link that isn't clickable | Important | **Important** | agreed |
| 5 | Double submit creates a second bon | Important | **Important** | agreed |
| 6 | PDF truncates long part descriptions | Critical | **Important** | the data is safe in the database; the printed artifact is wrong |
| 7 | Bon preview frozen without a device | Important | **Minor** | cosmetic preview only; the server assigns the real number |
| 8 | `KLANT N° F` printed always | Important | **Deferred** | spec and paper disagree — see Open questions |

## Order of work

Ordered by what hurts a real user first, not by Agy's numbering.

### 1. Stop cloning existing customers — CRITICAL
`lib/server/work-orders.ts`, `app/werkbon/nieuw/page.tsx`

`findOrCreateCustomer` looks a customer up by `customer_number`. The wizard
sends `customerNumber ?? id`, and 16 of 17 rows have a null customer number, so
it sends a UUID, matches nothing, and inserts a duplicate.

Fix: look up by customer number **or** by id. When matched by id and the
customer number is null, adopt the incoming value so the row is indexed from
then on. Verify with a test that picks a legacy customer twice and asserts the
customer count does not grow.

Also worth deciding: whether the wizard should send a `customer_id` outright
when the customer already exists, rather than round-tripping through a number
that may not exist. That is the cleaner shape, and slightly larger.

### 2. Fix the draft races — CRITICAL
`components/WerkbonForm/index.tsx`

Three separate defects Agy correctly separated:

- **Stale overwrite on mount.** `loadWerkbon` is async; typing before it
  resolves gets clobbered by `setForm(draft.form)`. Guard with a dirty ref.
- **Zombie resurrection.** `handleSubmit` deletes the draft but never cancels
  the pending 500 ms timer, so an edit within half a second of submitting
  writes the draft straight back. Cancel the timer in `handleSubmit`.
- **Pristine autosave.** Opening any job saves `initialForm` even untouched,
  which can then shadow server-side assignment changes. Only save when dirty.

Agy's proposed code is sound; take it close to as written.

### 3. Show the validation errors — IMPORTANT
`components/NewWorkOrder/TicketForm.tsx`

The global error banner renders only when `serverError.field` is absent. A 400
naming a customer field is therefore invisible: the button re-enables and
nothing appears. Render a banner for any field the ticket step does not own.

Related, and worth fixing here: `ValidationError.field` carries the leaf key
only, so a bad `customer.address` arrives as `address`. The banner should name
the field, which makes the leaf-key wart visible. Consider carrying a dotted
path in `parseCreateWorkOrderBody`.

### 4. Make the 409 link real — IMPORTANT
`app/werkbon/nieuw/page.tsx`, `components/NewWorkOrder/TicketForm.tsx`

The copy already says "tik hier om te openen" but nothing is clickable, which
is worse than saying nothing. Carry the existing work order id through
`serverError` and render an anchor to `/interventions/<id>`.

### 5. Prevent the double submit — IMPORTANT
`components/WerkbonForm/index.tsx`

Disable the button once `saveStatus === 'saved'` and change its label. Today a
second tap silently produces a `-02` bon.

### 6. Fix the PDF part descriptions — IMPORTANT
`lib/pdf.ts`

- Page 1 and the continuation page both take `splitTextToSize(...)[0]`, so any
  description longer than the column is silently truncated on a document the
  customer signs.
- The continuation page has no column headers.
- The continuation page drops `, dringend` from urgent parts.
- `customerName`, `siteAddress` and `deviceDescription` are drawn without a
  width bound and can bleed past the rule.

Extend `tests/pdf.test.ts` with a long-description case that asserts the text
is not lost.

### 7. Bon number preview without a device — MINOR
`components/WerkbonForm/index.tsx`

`if (!intervention.deviceId) return` freezes the preview at `-01` for
device-less jobs. Cosmetic: the server computes the authoritative number under
a row lock. Fix by falling back to `form.deviceId`, or drop the preview.

### 8. Still outstanding from earlier, not in Agy's review
- A stale `technicianId`/`deviceId` on submit raises a foreign-key error that
  escapes as an opaque 500, after the PDF is already written. Map SQLSTATE
  `23503` to a 400.
- `werkbonnen.bon_number` has no unique index; the row lock is the only guard.
- The bon-number sequence is tested sequentially, never under contention.
- `lib/lessons.ts` still names the deleted `Werkbon` type.

## Open questions for Bossuyt

- **What do `KLANT N° L` and `F` actually mean, and should F print when it is
  the same as L?** The spec says print only when different; the scanned bon
  prints both with the same value. Left exactly as-is until Bossuyt answers.
- Should the ERP payload omit null keys or always include them? Currently every
  declared field is always present, with `null` where empty.

## Definition of done

- Findings 1 through 6 fixed, each with a test that fails without the fix.
- `npx tsc --noEmit` clean, `npm run lint` clean, full suite green.
- Redeploy staging, bump to v1.53.2 or v1.54 per the user's call.
- Merge `feature/service-bon-v1.53` into `main` only once the above holds.
