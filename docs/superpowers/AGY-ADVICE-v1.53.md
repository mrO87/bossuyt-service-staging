# Prompt for Copilot / Claude: v1.53 Remediation & AGY Review Advice

> **Source:** Independent Code Review by AGY (Google Antigravity)  
> **Repository:** `/mnt/data/bossuyt_service_next_staging` (git worktree, branch `main`)  
> **Target:** Fix Critical & Important findings on v1.53 (Service Bon werkorders) before staging deployment  

---

## Instructions for Copilot / Claude

You are tasked with implementing the fixes identified during the independent review conducted by **AGY**. 
Review each section below, understand the **why** (underlying root cause and software engineering principle) and the **how** (concrete implementation and verification steps), and implement the fixes in order.

Maintain all existing code style: Next.js 16 App Router, React 19, TypeScript strict, Drizzle ORM 0.45, jsPDF 4. Do not perform `npm run build` or Docker builds (host is memory constrained); verify with `npx vitest run` and `npx tsc --noEmit`.

---

## Action Plan Overview

| # | File(s) | Category | Summary |
|---|---|---|---|
| 1 | `lib/pdf.ts` | **Critical** | Fix part description truncation and continuation page formatting |
| 2 | `components/WerkbonForm/index.tsx` | **Critical** | Fix autosave race conditions, stale overwrite on mount, and post-submit zombie draft resurrection |
| 3 | `components/NewWorkOrder/TicketForm.tsx` | **Critical** | Render global/field errors for customer/site validation failures |
| 4 | `app/werkbon/nieuw/page.tsx`, `TicketForm.tsx` | **Important / Spec** | Make 409 duplicate ticket prompt clickable with direct link to existing job |
| 5 | `lib/server/work-orders.ts`, `app/werkbon/nieuw/page.tsx` | **Important** | Check customer lookup fallback by `id` or `customerNumber` to prevent cloning legacy customers |
| 6 | `lib/pdf.ts` | **Important / Spec** | Respect Spec Decision #22: only print `KLANT N° F` when it differs from `L` |
| 7 | `components/WerkbonForm/index.tsx` | **Important** | Disable submit button when `saveStatus === 'saved'`; decouple bon preview from `intervention.deviceId` |

---

## Detailed Tasks & Engineering Guidance

### Task 1: Fix PDF Truncation & Facsimile Fidelity (`lib/pdf.ts`)

#### 1. The Why (Problem & Concept)
- **Root Cause:** In `lib/pdf.ts` lines 255 and 336, part descriptions use `(doc.splitTextToSize(desc, 70) as string[])[0]`. If a part description exceeds ~35 characters (e.g. 60-character descriptions), any text that wraps past line 0 is silently dropped.
- Furthermore, on the continuation page (lines 331–339), table headers (`ART. N°`, `Omschrijving`, `AANTAL | NOMBRE`) are missing, and line 335 drops `, dringend` on urgent parts.
- On lines 200, 202, and 213, `customerName`, `siteAddress`, and `deviceDescription` use raw `doc.text()` without column boundaries, risking text bleeding off the page edge.

#### 2. The How (Implementation)
1. **Multi-line or auto-sized part descriptions:**
   - In the Materialen table on page 1, determine whether description fits in 1 line. If multi-line, reduce font size slightly (e.g. 7pt) or allow description to use 2 lines of 3mm each within the 6mm row height:
   ```ts
   const descLines = doc.splitTextToSize(desc, 72) as string[]
   if (descLines.length === 1) {
     value(descLines[0], ML + 24, y - 1, 8.5)
   } else {
     value(descLines[0], ML + 24, y - 2.2, 7)
     value(descLines[1], ML + 24, y + 0.8, 7)
   }
   ```
2. **Continuation Page Headers:**
   - When `partsOverflow.length > 0` on line 331, print table column labels before looping through rows:
   ```ts
   label('MATERIALEN | MATÉRIAUX (vervolg)', ML + 2, y); y += 5
   label('ART. N°', ML + 2, y, 7)
   label('Omschrijving', ML + 24, y, 7)
   doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
   doc.text('AANTAL | NOMBRE', PAGE_W - MR - 2, y, { align: 'right' }); y += 3
   ```
3. **Keep `, dringend` on continuation page:**
   - In `lib/pdf.ts` line 335, update to match page 1:
   ```ts
   const desc = p.toOrder ? `${p.description} (te bestellen${p.urgent ? ', dringend' : ''})` : p.description
   ```
4. **Wrap long header fields:**
   - In `lib/pdf.ts` line 200, wrap `customerName` within `CW - SPLIT` (77mm max width):
   ```ts
   const nameLines = (doc.splitTextToSize(data.customerName || '', 74) as string[]).slice(0, 2)
   doc.text(nameLines, RX, HB_TOP + 21.5)
   ```

---

### Task 2: Fix IndexedDB Draft Autosave & Race Conditions (`components/WerkbonForm/index.tsx`)

#### 1. The Why (Problem & Concept)
- **Race condition on mount:** `loadWerkbon(intervention.id)` is async. If the technician starts typing into `notes` before IndexedDB responds, `setForm(draft.form)` executes and unconditionally overwrites user input.
- **Pristine autosave:** Opening any job triggers the debounced save after 500ms even if no field was touched, storing `initialForm` in IndexedDB. If dispatcher later modifies assignments on the server, local draft overrides server truth.
- **Zombie draft resurrection:** `handleSubmit()` calls `await deleteWerkbon(intervention.id)`. However, `saveTimer.current` is not cleared before submit, nor does autosave check `saveStatus === 'saved'`. If a technician makes any edit and clicks submit within 500ms, the timer fires after submit, writing the draft right back into IndexedDB.

#### 2. The How (Implementation)
1. In `components/WerkbonForm/index.tsx`:
   - Add a dirty tracking ref: `const isDirty = useRef(false)`.
   - Update `update()` and form modifiers to set `isDirty.current = true`.
   - In the mount effect:
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
2. Only autosave when dirty and not already saved:
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
3. Cancel timer inside `handleSubmit()`:
   ```ts
   if (saveTimer.current) {
     window.clearTimeout(saveTimer.current)
     saveTimer.current = null
   }
   ```

---

### Task 3: Expose All Validation Errors in Ticket Step (`components/NewWorkOrder/TicketForm.tsx`)

#### 1. The Why (Problem & Concept)
- If the server rejects `POST /api/work-orders` with 400 (e.g. missing customer address or city), `TicketForm` only binds errors for `ticket_number`, `planned_date`, and `description`.
- Line 91 checks `{serverError && !serverError.field && <p>...}`. Since `serverError.field` is set to `'customer.address'`, the banner is suppressed. The technician sees the submit button re-enable with no error displayed.

#### 2. The How (Implementation)
- In `components/NewWorkOrder/TicketForm.tsx`:
  - Show a global error alert whenever `serverError` is present and doesn't belong to one of the 3 local ticket fields:
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

### Task 4: Interactive Link for 409 Duplicate Ticket (`app/werkbon/nieuw/page.tsx` & `TicketForm.tsx`)

#### 1. The Why (Problem & Concept)
- Spec section 3 requires: *"On 409 show 'Ticket bestaat al' with a link to the existing job."*
- Currently, `serverError.message` is set to `'Ticket bestaat al — tik hier om te openen'`, but rendered as static text.

#### 2. The How (Implementation)
- In `TicketForm.tsx`, receive `duplicateJobId?: string` or pass `{ field, message, existingId }` in `serverError`.
- If `serverError.existingId` or `duplicateJobId` is present:
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

### Task 5: Prevent Duplicate Customer on Legacy Data (`lib/server/work-orders.ts`)

#### 1. The Why (Problem & Concept)
- In `app/werkbon/nieuw/page.tsx` line 125, when choosing an existing customer, it sends `number: customer.value.customerNumber ?? customer.value.id`.
- Legacy rows in database have `customer_number IS NULL`. When picked, `number` is `'customer-uuid'`.
- `findOrCreateCustomer` queries `where(eq(customers.customerNumber, input.number))`. Because no customer has that string in `customer_number`, it inserts a new duplicate customer row.

#### 2. The How (Implementation)
- In `lib/server/work-orders.ts` `findOrCreateCustomer`:
  - Query by `customerNumber` OR by `id`:
  ```ts
  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(or(eq(customers.customerNumber, input.number), eq(customers.id, input.number)))
  ```
  - If found by `id` and `customerNumber` is currently null, update `customerNumber: input.number` so it is indexed going forward.

---

### Task 6: Comply with Spec Decision #22 for Klant Nr F (`lib/pdf.ts`)

#### 1. The Why (Problem & Concept)
- Decision table in spec: *"Klant nr L and F: Store both as optional fields. Print F only when it differs from L."*
- In `lib/pdf.ts` line 195: `const fNumber = data.invoiceCustomerNumber || data.customerNumber` prints F unconditionally.

#### 2. The How (Implementation)
- In `lib/pdf.ts`:
  - Only draw the divider line and `F` block when `data.invoiceCustomerNumber` is truthy and differs from `data.customerNumber`:
  ```ts
  const hasDistinctF = Boolean(data.invoiceCustomerNumber && data.invoiceCustomerNumber !== data.customerNumber)
  if (hasDistinctF) {
    line(RX + 38, HB_TOP + 7.5, RX + 38, HB_TOP + 12)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('F', RX + 41, HB_TOP + 11)
    value(data.invoiceCustomerNumber, RX + 45, HB_TOP + 11)
  }
  ```

---

### Task 7: Idempotency & Bon Number Preview Decoupling (`components/WerkbonForm/index.tsx`)

#### 1. The Why (Problem & Concept)
- Line 353 submit button only checks `disabled={saving}`. Once `saveStatus === 'saved'`, the button remains active. Tapping it again submits another werkbon (`-02`).
- Line 103 `if (!intervention.deviceId) return` prevents calculating `existingCount` for work orders created without a device.

#### 2. The How (Implementation)
1. **Disable submit after completion:**
   ```tsx
   <button
     type="button"
     onClick={handleSubmit}
     disabled={saving || saveStatus === 'saved'}
     className="..."
   >
     {saving ? 'Bon afsluiten...' : saveStatus === 'saved' ? '✓ Bon afgesloten' : 'Bon afsluiten & PDF'}
   </button>
   ```
2. **Preview count:**
   - Fetch history using `intervention.deviceId ?? form.deviceId`, or if no device endpoint is suitable, ensure preview gracefully handles absence without permanently freezing.

---

## Verification & Test Checklist

Run the following test commands after implementing changes:
```bash
# 1. Type-check all files
npx tsc --noEmit

# 2. Run PDF generation tests
npx vitest run tests/pdf.test.ts

# 3. Run work order creation tests
npx vitest run tests/api.work-orders.create.test.ts

# 4. Run completion route tests
npx vitest run tests/api.complete.test.ts

# 5. Run full test suite
npm test
```
Confirm all 92+ tests pass with zero lint errors (`npm run lint`).
