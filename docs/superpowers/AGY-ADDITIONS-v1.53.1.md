# Additions & Delta Review: v1.53.1 & Remediation Plan

> **Scope:** Exact additions introduced between `170355a` (v1.53) and `HEAD` (`9a878ae` on `feature/service-bon-v1.53`)  
> **Author:** AGY (Google Antigravity) — Teaching & Review Architecture  
> **Context:** Integration of commit `be567df`, `31d941b`, and Claude Opus 5's remediation plan `2026-09-09-agy-remediation.md`.

---

## 1. Executive Summary of Additions

| Commit | Component | Type | What was added |
|---|---|---|---|
| `be567df` | `lib/pdf.ts` | **Fix / Refactor** | Physical ruling facsimile at 105 DPI (outer frame, stacked contact block, 3 report rules, 7 part rows) |
| `31d941b` | `lib/releases.ts`, `scripts/bump-version.js` | **Release** | Version bump to `v1.53.1`; regex support for patch semver |
| `9a878ae` | `docs/superpowers/plans/2026-09-09-agy-remediation.md` | **Plan** | Claude's remediation roadmap re-rating AGY's findings with real-world staging DB insights |

---

## 2. Deep Dive: What Changed in Code & Architecture

### A. The PDF Layout Overhaul (`be567df` in `lib/pdf.ts`)

#### Educational Concept: Coordinate Systems in Absolute Document Geometry
jsPDF renders documents on an absolute cartesian plane where $(0,0)$ is top-left. When refactoring layout grids to match physical scans, boundary constraints and relative offsets must be recalculated simultaneously.

#### The Additions:
1. **Margins & Column Split:**
   - Right margin `MR` decreased: `12mm → 6mm`. Total content width `CW` increased: `186mm → 192mm`.
   - Grid split shifted: `SPLIT` moved from `118mm → 127mm`, expanding the left column by 9mm.
2. **Continuous Outer Frame:**
   - Added continuous vertical border lines down both sides from header top ($y=26$) to remarks bottom ($y=266$):
     ```ts
     line(ML, HB_TOP, ML, OP_BOTTOM)
     line(PAGE_W - MR, HB_TOP, PAGE_W - MR, OP_BOTTOM)
     ```
3. **Contact Block Stacking:**
   - In v1.53, `CONTACT` and `Tel & GSM` placed values horizontally beside labels.
   - In v1.53.1, labels and values are stacked vertically:
     - `CONTACT` label at $y=47$, value at $y=52$.
     - `Tel & GSM` label at $y=59$, value at $y=64$.
     - `SLUITINGSDAG` label at $y=71$, value at $y=76$.
4. **Report Section Compression:**
   - `REPORT_ROWS` reduced: `5 → 3`.
   - Rationale: Matches scanned bon ruling.
   - Side Effect: Any technician report longer than 3 lines now triggers an overflow to page 2 earlier.
5. **Materialen Table Shift & New Truncation Threshold:**
   - `PART_ROWS` increased: `6 → 7`.
   - **Crucial New Finding:** Description column width was tightened from `70mm → 62mm` ([`lib/pdf.ts:L254`](file:///mnt/data/bossuyt_service_next_staging/lib/pdf.ts#L254)):
     ```ts
     value((doc.splitTextToSize(desc, 62) as string[])[0] ?? '', ML + 22, y - 1.2, 8.5)
     ```
     Because width shrunk by 8mm, description truncation under `[0]` now happens at **~30 characters** instead of ~38 characters!

---

### B. Versioning Pipeline Enhancement (`31d941b` in `scripts/bump-version.js`)

#### Educational Concept: Semantic Versioning Regex Mechanics
Pre-release scripts frequently assume 2-segment versions (`vX.Y`). When deploying emergency patch releases (`vX.Y.Z`), rigid regexes break automated CI/CD pipelines.

#### The Addition:
In `scripts/bump-version.js`, the version regex was enhanced to optionally parse patch segments:
```diff
- const match = currentVersion.match(/^v(\d+)\.(\d+)$/)
+ const match = currentVersion.match(/^v(\d+)\.(\d+)(?:\.(\d+))?$/)
```
- **How it works:** `(?:\.(\d+))?` is a non-capturing group with an optional trailing quantifier. If `v1.53.1` is read, the next minor bump still targets `v1.54`.

---

### C. Claude's Staging Database Discovery (`9a878ae` in `2026-09-09-agy-remediation.md`)

#### Educational Concept: Primary Keys vs Natural/Business Keys
In database migration projects, newly introduced unique business columns (e.g., `customers.customer_number`) remain unpopulated (`NULL`) on historical records. If application logic exclusively queries the new business key, existing records become invisible to lookup logic.

#### The Real-World Discovery:
- Claude audited the staging PostgreSQL database and revealed:
  ```sql
  SELECT count(*) FROM customers WHERE customer_number IS NULL;
  -- Result: 16 out of 17 customers have NULL customer_number!
  ```
- **Consequence:** In v1.53, when office staff picks an existing customer in the wizard, `customerNumber ?? id` passes `customer-uuid`. `findOrCreateCustomer` queries:
  ```sql
  SELECT id FROM customers WHERE customer_number = 'customer-uuid';
  ```
  Because `customer_number` is null, this query returns zero rows. PostgreSQL then executes an `INSERT`, creating a clone of the customer, along with duplicate sites and devices.
- **Severity Escalation:** AGY initially classified this as **Important**. With the discovery that 94% of customers have no `customer_number`, this was correctly upgraded to **CRITICAL**.

---

## 3. Spec & Fixture Divergence: `KLANT N° L` and `F`

#### Educational Concept: Authoritative Specification vs Physical Artifact Ground Truth
A key challenge in legacy digitization is reconciling written requirements with legacy sample artifacts.

1. **The Written Spec ([`docs/superpowers/specs/2026-09-08-service-bon-work-orders-design.md:L22`](file:///mnt/data/bossuyt_service_next_staging/docs/superpowers/specs/2026-09-08-service-bon-work-orders-design.md#L22)):**
   > *"Store both as optional fields. Print F only when it differs from L. Meaning to be confirmed with Bossuyt later."*
2. **The Scanned Paper Bon ([`tests/fixtures/sauna-molenhoeve.pdf`](file:///mnt/data/bossuyt_service_next_staging/tests/fixtures/sauna-molenhoeve.pdf)):**
   - The actual paper bon for Molenhoeve prints:
     `L: K04647 | F: K04647` (Both identical).
3. **Resolution in Remediation Plan:**
   - Left untouched in code (`lib/pdf.ts:L196` prints both).
   - Logged as a formal open question for Bossuyt stakeholders.

---

## 4. Specific Action Items to Implement from this Addition

### 1. Fix 62mm Part Description Truncation (`lib/pdf.ts:L254`)
With column width down to 62mm, implement multi-line auto-sizing so descriptions up to 60 characters don't lose text:
```ts
// Calculate line splits
const descLines = doc.splitTextToSize(desc, 62) as string[]
if (descLines.length === 1) {
  value(descLines[0], ML + 22, y - 1.2, 8.5)
} else {
  // Stack two 7pt lines inside the 6.7mm row
  value(descLines[0], ML + 22, y - 2.4, 7)
  value(descLines[1], ML + 22, y + 0.6, 7)
}
```

### 2. Dual-Key Customer Lookup (`lib/server/work-orders.ts:L225`)
Solve the 16/17 customer duplication bug by querying both `customer_number` and primary key `id`:
```ts
const [existing] = await tx
  .select({ id: customers.id, customerNumber: customers.customerNumber })
  .from(customers)
  .where(or(eq(customers.customerNumber, input.number), eq(customers.id, input.number)))

if (existing) {
  await tx.update(customers).set({
    name: input.name,
    address: input.address,
    city: cityLine(input.postalCode, input.city),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.invoiceNumber ? { invoiceCustomerNumber: input.invoiceNumber } : {}),
    ...(!existing.customerNumber ? { customerNumber: input.number } : {}),
  }).where(eq(customers.id, existing.id))
  return existing.id
}
```

### 3. Continuation Page Headers (`lib/pdf.ts:L347`)
In v1.53.1, `REPORT_ROWS` was reduced to 3, meaning more jobs spill onto page 2. Ensure page 2 renders explicit table headers:
```ts
label('MATERIALEN | MATÉRIAUX (vervolg)', ML + 2, y); y += 5
label('ART. N°', ML + 2, y, 7.5)
label('Omschrijving', ML + 22, y, 7.5)
doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
doc.text('AANTAL | NOMBRE', PAGE_W - MR - 4, y, { align: 'right' }); y += 3
```

---

## 5. Summary Checklist for Engineers & Subagents

- [x] Verified `npx tsc --noEmit` exits 0.
- [x] Verified `npm run lint` is clean.
- [x] Verified `tests/pdf.test.ts` passes with the 62mm ruling.
- [ ] Implement dual-key customer lookup in `lib/server/work-orders.ts`.
- [ ] Implement multi-line stacked part descriptions in `lib/pdf.ts`.
- [ ] Implement dirty-state tracking and submit timer cleanup in `components/WerkbonForm/index.tsx`.
- [ ] Render global banner for unmapped 400 errors in `components/NewWorkOrder/TicketForm.tsx`.
