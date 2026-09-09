# Prompt for Copilot / Claude: v1.53 & v1.53.1 Remediation & AGY Review Advice

> **Source:** Independent Code Review by AGY (Google Antigravity)  
> **Repository:** `/mnt/data/bossuyt_service_next_staging` (git worktree, branch `feature/service-bon-v1.53`)  
> **Target:** Remediation of v1.53 & v1.53.1 before final staging merge and deployment  
> **Aligned with:** `docs/superpowers/plans/2026-09-09-agy-remediation.md` (Claude Opus 5)

---

## Context & Synthesis with Claude's Remediation Plan

Claude Opus 5 evaluated AGY's initial review and pushed:
1. `be567df`: PDF ruling overhaul matching `tests/fixtures/sauna-molenhoeve.pdf` at 105 DPI (`v1.53.1`).
2. `9a878ae`: Remediation plan `docs/superpowers/plans/2026-09-09-agy-remediation.md`.

### Key Agreement & Severity Calibration:
- **Cloning Existing Customers (Elevated to CRITICAL):** Claude verified against staging data that **16 of 17 existing customers have null `customer_number`**. Therefore, selecting existing customers hits the duplicate insertion path on almost every normal run. This is unquestionably **Critical**.
- **Draft Autosave Races (CRITICAL):** Full agreement on the three race conditions (stale overwrite on mount, zombie resurrection after submit, pristine autosave overriding server state).
- **PDF Description Truncation (IMPORTANT):** The ruling overhaul in `be567df` reduced description column width from 70mm to **62mm** (`lib/pdf.ts:L254`), making truncation occur even sooner (~30 chars). Must be fixed with stacked 2-line auto-sizing.
- **Spec Decision #22 (Deferred):** The paper scanned bon (`sauna-molenhoeve.pdf`) actually prints both L and F with the same customer number, conflicting with the spec. Deferred pending Bossuyt confirmation.

---

## Action Plan Overview

| # | Priority | File(s) | Defect Summary |
|---|---|---|---|
| 1 | **CRITICAL** | `lib/server/work-orders.ts`, `app/werkbon/nieuw/page.tsx` | Customer cloning on legacy records (`customer_number IS NULL`) |
| 2 | **CRITICAL** | `components/WerkbonForm/index.tsx` | Draft autosave races: stale mount overwrite, post-submit resurrection, pristine autosave |
| 3 | **IMPORTANT** | `components/NewWorkOrder/TicketForm.tsx` | Validation error banner suppressed for customer/site fields |
| 4 | **IMPORTANT** | `app/werkbon/nieuw/page.tsx`, `TicketForm.tsx` | HTTP 409 duplicate ticket link is unclickable plain text |
| 5 | **IMPORTANT** | `components/WerkbonForm/index.tsx` | Unbounded submit button causes duplicate `-02` submissions on double tap |
| 6 | **IMPORTANT** | `lib/pdf.ts` | 62mm part description truncated to line [0]; continuation page missing headers and `, dringend` |
| 7 | **MINOR** | `components/WerkbonForm/index.tsx` | Bon number preview frozen at `-01` when work order has no device |

---

## Detailed Technical Tasks & Implementation Instructions

### Task 1: Stop Cloning Existing Customers (`lib/server/work-orders.ts`) — CRITICAL

#### The Why:
In `app/werkbon/nieuw/page.tsx:L125`, picking an existing customer sends `number: customer.value.customerNumber ?? customer.value.id`. Because 16 of 17 database records have `customer_number IS NULL`, `input.number` is `customer-uuid`. `findOrCreateCustomer` queries `where(eq(customers.customerNumber, input.number))`. Finding no row, Postgres creates a duplicate customer with `customer_number = 'customer-uuid'`, duplicating associated sites and devices.

#### The How:
In `lib/server/work-orders.ts`:
```ts
// In findOrCreateCustomer(tx, input):
const [existing] = await tx
  .select({ id: customers.id, customerNumber: customers.customerNumber })
  .from(customers)
  .where(or(eq(customers.customerNumber, input.number), eq(customers.id, input.number)))

// If matched by id and customerNumber was null, backfill it so it's indexed:
if (existing) {
  const updates = {
    name: input.name,
    address: input.address,
    city: cityLine(input.postalCode, input.city),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.invoiceNumber ? { invoiceCustomerNumber: input.invoiceNumber } : {}),
    ...(!existing.customerNumber ? { customerNumber: input.number } : {}),
  }
  await tx.update(customers).set(updates).where(eq(customers.id, existing.id))
  return existing.id
}
```

---

### Task 2: Fix Draft Autosave Races (`components/WerkbonForm/index.tsx`) — CRITICAL

#### The Why:
1. `loadWerkbon()` is async; typing into `notes` before it resolves gets wiped by `setForm(draft.form)`.
2. `saveTimer.current` (500ms debounce) is not cancelled during `handleSubmit()`, resurrecting the deleted draft in IndexedDB right after submission.
3. Viewing any job automatically autosaves `initialForm` after 500ms, shadowing dispatcher server updates.

#### The How:
In `components/WerkbonForm/index.tsx`:
1. Track dirty state with `const isDirty = useRef(false)`. Set `isDirty.current = true` in `update()`, `addPart()`, `removePart()`, etc.
2. In mount effect:
```ts
useEffect(() => {
  let cancelled = false
  loadWerkbon(intervention.id)
    .then(draft => {
      if (!cancelled && draft && !isDirty.current) {
        setForm(draft.form)
      }
    })
    .catch(() => {})
    .finally(() => {
      if (!cancelled) setDraftLoaded(true)
    })
  return () => { cancelled = true }
}, [intervention.id])
```
3. In autosave effect:
```ts
useEffect(() => {
  if (!draftLoaded || !isDirty.current || saveStatus === 'saved') return
  if (saveTimer.current) window.clearTimeout(saveTimer.current)
  saveTimer.current = window.setTimeout(() => {
    void saveWerkbon(intervention.id, form)
  }, 500)
  return () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
  }
}, [form, draftLoaded, saveStatus, intervention.id])
```
4. In `handleSubmit()`:
```ts
if (saveTimer.current) {
  window.clearTimeout(saveTimer.current)
  saveTimer.current = null
}
```

---

### Task 3: Expose Customer & Site Validation Errors (`components/NewWorkOrder/TicketForm.tsx`) — IMPORTANT

#### The Why:
If `createWorkOrder` rejects input with HTTP 400 (e.g. `field: 'customer.address'`), `TicketForm` only binds error highlights to `ticket_number`, `planned_date`, and `description`. Line 91 checks `{serverError && !serverError.field && ...}`, so the banner is hidden when `field` is present.

#### The How:
In `components/NewWorkOrder/TicketForm.tsx`:
```tsx
{serverError && !['ticket_number', 'planned_date', 'description'].includes(serverError.field ?? '') && (
  <div className="p-3 rounded-xl bg-brand-red/10 border border-brand-red/30">
    <p className="text-sm font-semibold text-brand-red">
      {serverError.field ? `${serverError.field}: ${serverError.message}` : serverError.message}
    </p>
  </div>
)}
```

---

### Task 4: Interactive 409 Duplicate Ticket Link (`app/werkbon/nieuw/page.tsx` & `TicketForm.tsx`) — IMPORTANT

#### The Why:
Spec Section 3 specifies: *"On 409 show 'Ticket bestaat al' with a link to the existing job."* Currently it displays static Dutch text without an anchor or click handler.

#### The How:
In `app/werkbon/nieuw/page.tsx`:
Pass `existingId: json.id` in `serverError`.
In `components/NewWorkOrder/TicketForm.tsx`:
```tsx
{serverError?.field === 'ticket_number' && (
  <div className="flex flex-col gap-1 mt-1">
    <p className="text-xs font-semibold text-brand-red">{serverError.message}</p>
    {serverError.existingId && (
      <a
        href={`/interventions/${serverError.existingId}`}
        className="text-xs font-bold text-brand-blue underline"
      >
        Open bestaande werkbon →
      </a>
    )}
  </div>
)}
```

---

### Task 5: Prevent Duplicate Submissions (`components/WerkbonForm/index.tsx`) — IMPORTANT

#### The Why:
Line 353 only checks `disabled={saving}`. Once saved, the button stays active. Tapping it again fires `handleSubmit()` and generates an unwanted duplicate `-02` submission.

#### The How:
```tsx
<button
  type="button"
  onClick={handleSubmit}
  disabled={saving || saveStatus === 'saved'}
  className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-60 bg-brand-orange"
>
  {saving ? 'Bon afsluiten...' : saveStatus === 'saved' ? '✓ Bon afgesloten' : 'Bon afsluiten & PDF'}
</button>
```

---

### Task 6: PDF Part Description Multi-line Layout (`lib/pdf.ts`) — IMPORTANT

#### The Why:
In `v1.53.1` ([`lib/pdf.ts:L254`](file:///mnt/data/bossuyt_service_next_staging/lib/pdf.ts#L254)), the description width is 62mm. Taking only `[0]` truncates descriptions after ~30 chars. On continuation pages, table column headers are missing, and `, dringend` is omitted on urgent items.

#### The How:
1. In `lib/pdf.ts` Materialen table (Page 1):
```ts
const descLines = doc.splitTextToSize(desc, 62) as string[]
if (descLines.length === 1) {
  value(descLines[0], ML + 22, y - 1.2, 8.5)
} else {
  value(descLines[0], ML + 22, y - 2.4, 7)
  value(descLines[1], ML + 22, y + 0.6, 7)
}
```
2. On continuation page ([`lib/pdf.ts:L347`](file:///mnt/data/bossuyt_service_next_staging/lib/pdf.ts#L347)):
```ts
if (partsOverflow.length > 0) {
  label('MATERIALEN | MATÉRIAUX (vervolg)', ML + 2, y); y += 5
  label('ART. N°', ML + 2, y, 7.5)
  label('Omschrijving', ML + 22, y, 7.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  doc.text('AANTAL | NOMBRE', PAGE_W - MR - 4, y, { align: 'right' }); y += 3
  
  for (const p of partsOverflow) {
    if (y > PAGE_H - 30) { doc.addPage(); pageChrome(); y = 30 }
    value(p.code, ML + 2, y - 1.2, 8.5)
    const desc = p.toOrder ? `${p.description} (te bestellen${p.urgent ? ', dringend' : ''})` : p.description
    const pLines = doc.splitTextToSize(desc, 120) as string[]
    value(pLines[0] ?? '', ML + 22, y - 1.2, 8.5)
    value(String(p.quantity), PAGE_W - MR - 4, y - 1.2, 8.5, 'right')
    dotted(ML + 2, PAGE_W - MR - 4, y); y += 6.5
  }
}
```

---

### Task 7: Decouple Bon Preview from Device (`components/WerkbonForm/index.tsx`) — MINOR

#### The How:
In `components/WerkbonForm/index.tsx:L103`:
```ts
const targetDeviceId = form.deviceId ?? intervention.deviceId
if (!targetDeviceId) return
fetch(`/api/devices/${targetDeviceId}/history`)
```

---

## Verification Commands

```bash
npx tsc --noEmit
npx vitest run --config vitest.config.test.ts tests/pdf.test.ts
npx vitest run --config vitest.config.test.ts tests/api.work-orders.create.test.ts
npx vitest run --config vitest.config.test.ts tests/api.complete.test.ts
npm test
npm run lint
```
