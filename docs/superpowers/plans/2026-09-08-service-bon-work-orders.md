# Service Bon Work Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive, create, fill in and print work orders that carry every field of the paper Bossuyt "SERVICE BON", with an inbound ERP route, a manual wizard, a paper-ordered mobile form and a one-to-one PDF replica.

**Architecture:** Extend the existing Drizzle schema in place (customers, sites, devices, work_orders, werkbonnen), make the device optional, and put one shared `createWorkOrder()` server function behind both the ERP route and the manual wizard. The werkbon complete route grows to store every technician field plus the signature and a server-generated bon number. The PDF is rebuilt from the stored werkbon so it can be regenerated.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Drizzle ORM 0.45 + PostgreSQL 16 (`drizzle-kit push`, no migration files), jsPDF 4, idb 8, vitest 4 against a real Postgres.

**Spec:** `docs/superpowers/specs/2026-09-08-service-bon-work-orders-design.md`

## Global Constraints

- UI text is Dutch (nl-BE). Paper labels are bilingual `NL | FR` exactly as printed on the bon. Code, comments and identifiers are English.
- Mobile-first, one column, large touch targets. No visual copy of the A4 layout on screen.
- Offline-first: form state goes to IndexedDB before the API.
- Target version is **v1.53**. Never bump the version except in Task 14. `make staging-up` also bumps, so Task 14 explains how to deploy without a double bump.
- Never touch the `production` branch, `/mnt/data/bossuyt_service_next`, `bossuyt-service.fixassistant.com` or `service.bossuyt.fixassistant.com`.
- Tests: `npm test` runs vitest against `DATABASE_URL_TEST` from `.env.test`, which points at the `bossuyt-db-staging` container. Task 0 brings that container up. All tests must pass before each commit.
- Type check: `npx tsc --noEmit`. Lint: `npm run lint`. Both must be clean before each commit.
- API wire format is snake_case JSON (matches `app/api/erp/*` and `app/api/tasks`). Internal TypeScript is camelCase.
- IDs are `crypto.randomUUID()` with a table prefix: `wo-`, `customer-`, `site-`, `device-`, `contact-`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe
  ```
- Teaching mode is active for this project: when reporting a task back to the user, explain in plain language what each new function does and why.

## File structure

| File | Responsibility |
|---|---|
| `lib/db/schema.ts` | new columns, nullable `device_id`, unique indexes |
| `types/index.ts` | new optional fields, `WerkbonSubmission`, remove stale `Werkbon` |
| `lib/server/work-orders.ts` | `parseCreateWorkOrderBody`, `createWorkOrder`, error classes |
| `lib/server/interventions.ts` | left join devices, header fields, contacts |
| `app/api/erp/work-orders/route.ts` | existing GET (extended) + new POST |
| `app/api/work-orders/route.ts` | internal POST for the wizard |
| `app/api/customers/route.ts`, `app/api/customers/[id]/sites/route.ts`, `app/api/sites/[id]/devices/route.ts`, `app/api/technicians/route.ts` | wizard lookups |
| `app/api/work-orders/[id]/complete/route.ts` | new werkbon fields, bon number, 400 on bad JSON |
| `app/werkbon/nieuw/page.tsx` + `components/NewWorkOrder/*` | wizard with real data and inline "nieuw" forms |
| `components/WerkbonForm/index.tsx` | orchestration only; sections in siblings |
| `components/WerkbonForm/BonHeaderCard.tsx`, `VisitSection.tsx`, `DevicePicker.tsx` | new form sections |
| `lib/idb.ts` | `WerkbonDraft` store v3 |
| `lib/pdf.ts` | Service Bon replica |
| `scripts/extract-logo.py`, `public/bossuyt-logo.png` | logo asset |
| `scripts/load-example-order.ts`, `tests/fixtures/sauna-molenhoeve.json` | example order |
| `tests/work-orders.create.test.ts`, `tests/api.lookups.test.ts`, `tests/api.complete.test.ts` | new tests |

---

### Task 0: Baseline — commit WIP, tidy root, start the test database

**Files:**
- Modify: nothing in code. Git and Docker only.
- Move: 22 `*_hotspots.json` / `*_parts.json` files from repo root to `docs/parts-data/`

**Interfaces:** none.

- [ ] **Step 1: Confirm branch and see the uncommitted state**

Run: `git status --short --branch | head -40`
Expected: `## main...origin/main [ahead 4]`, 25 ` M` files, 22 `??` JSON files, `lib/tasks/storage.ts`, `PORTAL-SSO-PLAN.md`.

- [ ] **Step 2: Move the stray parts JSON files out of the root**

```bash
mkdir -p docs/parts-data
git mv -k "6000W 1N (elettronica) 230V 1N (1301)_hotspots.json" docs/parts-data/ 2>/dev/null || mv "6000W 1N (elettronica) 230V 1N (1301)_hotspots.json" docs/parts-data/
for f in *_hotspots.json *_parts.json; do [ -f "$f" ] && mv "$f" docs/parts-data/; done
ls docs/parts-data | wc -l
```
Expected: `22`.

- [ ] **Step 3: Commit the pre-existing work-in-progress as its own commit**

```bash
git add -A
git commit -m "chore: commit pending staging work before Service Bon feature

Includes task-store, queue and warehouse refinements that were left
uncommitted after v1.52, plus PORTAL-SSO-PLAN.md and lib/tasks/storage.ts.
Moves 22 parts-data JSON files from the repo root to docs/parts-data/.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
git status --short | wc -l
```
Expected: `0`.

- [ ] **Step 4: Start the staging database container (tests use it)**

```bash
docker compose --env-file .env.staging.local -f docker-compose.staging.yml up -d db-staging
docker inspect bossuyt-db-staging --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'
```
Expected: container `bossuyt-db-staging` running; an IP such as `172.20.0.2`. If the IP differs from the one in `.env.test`, edit `DATABASE_URL_TEST` in `.env.test` to the new IP (keep user, password, port 5432 and database `bossuyt_staging`).

- [ ] **Step 5: Make sure the schema is applied and the baseline suite is green**

```bash
set -a; . ./.env.test; set +a
DATABASE_URL="$DATABASE_URL_TEST" npm run db:push
npm test 2>&1 | tail -15
```
Expected: `db:push` reports no changes or applies pending ones; vitest ends with `Test Files  N passed`, `Tests  M passed`. If a pre-existing test fails, stop and report it to the user before continuing. Do not fix unrelated failures inside this plan.

- [ ] **Step 6: Type check and lint baseline**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0. Record any pre-existing warnings in the task report.

---

### Task 1: Schema — new columns, optional device, unique indexes

**Files:**
- Modify: `lib/db/schema.ts` (customers L36-43, sites L45-56, devices L67-77, workOrders L84-115, werkbonnen L207-221, imports L1-14)
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces new Drizzle columns used by every later task: `customers.customerNumber`, `customers.invoiceCustomerNumber`, `sites.closingDay`, `devices.unitNumber`, `devices.deliveryDate`, `devices.warrantyUntil`, `workOrders.ticketNumber`, `workOrders.ticketDate`, `workOrders.createdAt`, `workOrders.deviceId` (nullable), `werkbonnen.bonNumber`, `werkbonnen.technicianId`, `werkbonnen.deviceId`, `werkbonnen.visitDate`, `werkbonnen.arrivalTime`, `werkbonnen.departureTime`, `werkbonnen.interventionKind`, `werkbonnen.tripCount`, `werkbonnen.personCount`, `werkbonnen.remarks`, `werkbonnen.signatureData`.

- [ ] **Step 1: Write the failing schema test**

Append to `tests/schema.test.ts` inside the `describe('database schema validation', …)` block, after the `work_orders includes external_ref…` test:

```ts
  it('service bon columns exist on customers, sites, devices, work_orders and werkbonnen', async () => {
    expect(await getColumns('customers')).toEqual(expect.arrayContaining([
      'customer_number', 'invoice_customer_number',
    ]))
    expect(await getColumns('sites')).toEqual(expect.arrayContaining(['closing_day']))
    expect(await getColumns('devices')).toEqual(expect.arrayContaining([
      'unit_number', 'delivery_date', 'warranty_until',
    ]))
    expect(await getColumns('work_orders')).toEqual(expect.arrayContaining([
      'ticket_number', 'ticket_date', 'created_at',
    ]))
    expect(await getColumns('werkbonnen')).toEqual(expect.arrayContaining([
      'bon_number', 'technician_id', 'device_id', 'visit_date', 'arrival_time',
      'departure_time', 'intervention_kind', 'trip_count', 'person_count',
      'remarks', 'signature_data',
    ]))
  })

  it('work_orders.device_id is nullable', async () => {
    const rows = await testSql<{ is_nullable: string }[]>`
      select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'work_orders' and column_name = 'device_id'
    `
    expect(rows[0]?.is_nullable).toBe('YES')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.test.ts tests/schema.test.ts 2>&1 | tail -20`
Expected: FAIL, the `arrayContaining` assertions report missing `customer_number` etc.

- [ ] **Step 3: Add the columns to the schema**

In `lib/db/schema.ts`, change the import block to include `uniqueIndex`:

```ts
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
```

Add `InterventionKind` to the type import from `@/types` (Task 2 defines it; for now add it to `types/index.ts` right away so the file compiles):

In `types/index.ts`, directly under `export type InterventionSource = 'planned' | 'reactive'` add:

```ts
export type InterventionKind = 'week' | 'weekend'
```

and in `lib/db/schema.ts` add `InterventionKind,` to the `import type { … } from '@/types'` list.

Replace the `customers` table:

```ts
export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    city: text('city').notNull(),
    vatNumber: text('vat_number'),
    customerNumber: text('customer_number'),                 // KLANT N° L  (e.g. K04647)
    invoiceCustomerNumber: text('invoice_customer_number'),  // KLANT N° F  (invoice customer, optional)
  },
  (tbl) => ({
    byCustomerNumber: uniqueIndex('customers_customer_number_unique').on(tbl.customerNumber),
  }),
)
```

Replace the `sites` table body by adding one column after `lon`:

```ts
  lon: doublePrecision('lon'),
  closingDay: text('closing_day'),                          // SLUITINGSDAG | FERMÉ
```

Replace the `devices` table body by adding after `notes`:

```ts
  notes: text('notes'),
  unitNumber: text('unit_number'),                         // UNIT N°
  deliveryDate: text('delivery_date'),                     // LEVERDATUM, ISO date
  warrantyUntil: text('warranty_until'),                   // GARANTIE, ISO date
```

Replace the `workOrders` table. `deviceId` loses `.notNull()`, three columns are added, and a unique index on `ticket_number`:

```ts
export const workOrders = pgTable(
  'work_orders',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'restrict' }),
    // Optional: a ticket can arrive before the technician knows which unit is broken.
    deviceId: text('device_id')
      .references(() => devices.id, { onDelete: 'restrict' }),
    plannedDate: timestamp('planned_date', { withTimezone: true }).notNull(),
    status: text('status').$type<InterventionStatus>().notNull(),
    type: text('type').$type<InterventionType>().notNull(),
    source: text('source').$type<InterventionSource>().notNull(),
    description: text('description'),
    estimatedMinutes: integer('estimated_minutes'),
    isUrgent: boolean('is_urgent').notNull().default(false),
    planningVersion: integer('planning_version').notNull().default(1),
    statusOnderwegAt: timestamp('status_onderweg_at', { withTimezone: true }),
    statusArrivedAt: timestamp('status_arrived_at', { withTimezone: true }),
    statusOnderwegBy: text('status_onderweg_by'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    ticketNumber: text('ticket_number'),                   // TICKET N° — owned by the ERP
    ticketDate: timestamp('ticket_date', { withTimezone: true }), // DATUM TICKET
    // Completion data — written when technician saves the werkbon
    workStart:         timestamp('work_start', { withTimezone: true }),
    workEnd:           timestamp('work_end',   { withTimezone: true }),
    completionNotes:   text('completion_notes'),
    completionParts:   jsonb('completion_parts').$type<PdfPart[]>(),
    completionPdfPath: text('completion_pdf_path'), // /uploads/werkbonnen/{id}.pdf
    completedAt:       timestamp('completed_at', { withTimezone: true }),
    externalRef:       text('external_ref'),    // stamped back by Navision/Odoo via ERP API
    prefillParts:      jsonb('prefill_parts').$type<PdfPart[]>(),
    visibleInPool:     boolean('visible_in_pool').notNull().default(true),
  },
  (tbl) => ({
    byTicketNumber: uniqueIndex('work_orders_ticket_number_unique').on(tbl.ticketNumber),
  }),
)
```

Replace the `werkbonnen` table:

```ts
export const werkbonnen = pgTable('werkbonnen', {
  id:          text('id').primaryKey(),                    // crypto.randomUUID()
  workOrderId: text('work_order_id')
    .notNull()
    .references(() => workOrders.id, { onDelete: 'cascade' }),
  bonNumber:   text('bon_number'),                         // SERVICE BON N°: `${ticket}-NN`
  technicianId: text('technician_id')
    .references(() => technicians.id, { onDelete: 'set null' }),
  deviceId:    text('device_id')
    .references(() => devices.id, { onDelete: 'set null' }),
  visitDate:     timestamp('visit_date',     { withTimezone: true }), // BEZOEKDATUM
  arrivalTime:   timestamp('arrival_time',   { withTimezone: true }), // AANKOMSTUUR
  departureTime: timestamp('departure_time', { withTimezone: true }), // VERTREKUUR
  workStart:   timestamp('work_start',  { withTimezone: true }),
  workEnd:     timestamp('work_end',    { withTimezone: true }),
  interventionKind: text('intervention_kind').$type<InterventionKind>(), // WEEK | WEEKEND
  tripCount:   integer('trip_count'),                      // AANTAL RITTEN
  personCount: integer('person_count'),                    // AANTAL PERSONEN
  notes:       text('notes'),                              // TECHNICUS RAPPORT
  remarks:     text('remarks'),                            // OPMERKINGEN
  parts:       jsonb('parts').$type<PdfPart[]>(),          // MATERIALEN
  followUp:    jsonb('follow_up').$type<PdfFollowUp[]>(),
  signatureData: text('signature_data'),                   // AKKOORD VAN KLANT, base64 PNG data URL
  pdfPath:     text('pdf_path'),                           // /api/uploads/werkbonnen/{id}.pdf
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy:   text('changed_by'),
})
```

- [ ] **Step 4: Push the schema to the test database**

```bash
set -a; . ./.env.test; set +a
DATABASE_URL="$DATABASE_URL_TEST" npm run db:push
```
Expected: drizzle-kit lists the added columns and the two unique indexes, and the `device_id` NOT NULL drop. Answer any interactive prompt with the option that alters the existing column (no data loss). If drizzle-kit asks whether `customer_number` is a new column or a rename, choose "create column".

- [ ] **Step 5: Run the schema test to verify it passes**

Run: `npx vitest run --config vitest.config.test.ts tests/schema.test.ts 2>&1 | tail -10`
Expected: PASS, 4 tests.

- [ ] **Step 6: Type check (expect errors that Task 2 fixes)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: errors only in `lib/server/interventions.ts` (deviceId `string | null` not assignable to `string`) and `tests/setup.ts` (`deviceId` in cleanup). Nothing else. If other files error, fix them here.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts types/index.ts tests/schema.test.ts
git commit -m "feat(schema): Service Bon columns and optional device on work orders

Adds customer numbers (L/F), closing day, device unit/delivery/warranty,
ticket number + date + created_at on work_orders, and the technician
visit fields, bon number and stored signature on werkbonnen.
work_orders.device_id becomes nullable.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 2: Optional device ripple — types, joins, cleanup

**Files:**
- Modify: `types/index.ts` (`Customer` L14-21, `Site` L23-32, `Device` L43-51, `Intervention` L79-106, remove `Werkbon` L117-130)
- Modify: `lib/server/interventions.ts` (`InterventionCoreRow` L16-42, `toIntervention` L69-101, `fetchInterventionRows` L149-193)
- Modify: `app/api/warehouse/queue/route.ts` L80-93
- Modify: `app/api/work-orders/[id]/follow-up/route.ts` L73 (no change needed if it copies `original.deviceId`, which is now nullable; verify it compiles)
- Modify: `tests/setup.ts` (`cleanup` L104-182, `deleteWorkOrderById` L223-239, add `createTestWorkOrderWithoutDevice`)
- Modify: `components/DevicePanel/index.tsx` L6-11 (prop type only; the picker UI is Task 11)
- Test: `tests/interventions.optional-device.test.ts` (new)

**Interfaces:**
- Produces: `Intervention.deviceId: string | null`; new optional fields on `Intervention`: `ticketNumber`, `ticketDate`, `createdAt`, `customerNumber`, `invoiceCustomerNumber`, `contactName`, `contactPhone`, `sitePhones`, `closingDay`, `deviceUnitNumber`, `deviceSerial`, `deviceDeliveryDate`, `deviceWarrantyUntil` (all populated in Task 7; declared here so later tasks compile).
- Produces: `createTestWorkOrderWithoutDevice(): Promise<string>` in `tests/setup.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/interventions.optional-device.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getInterventionById } from '@/lib/server/interventions'
import type { CleanupIds } from './setup'
import { cleanup, createTestWorkOrder, createTestWorkOrderWithoutDevice } from './setup'

describe('interventions with an optional device', () => {
  let ids: CleanupIds

  beforeEach(() => { ids = { work_order_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('returns a work order that has no device with deviceId null', async () => {
    const workOrderId = await createTestWorkOrderWithoutDevice()
    ids.work_order_ids?.push(workOrderId)

    const intervention = await getInterventionById(workOrderId)

    expect(intervention).not.toBeNull()
    expect(intervention?.deviceId).toBeNull()
    expect(intervention?.deviceBrand).toBeUndefined()
    expect(intervention?.deviceModel).toBeUndefined()
  })

  it('still returns brand and model when a device is present', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const intervention = await getInterventionById(workOrderId)

    expect(intervention?.deviceId).toMatch(/^device-/)
    expect(intervention?.deviceBrand).toBe('Bossuyt')
    expect(intervention?.deviceModel).toBe('Service Unit')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config vitest.config.test.ts tests/interventions.optional-device.test.ts 2>&1 | tail -15`
Expected: FAIL, `createTestWorkOrderWithoutDevice is not a function` (or a TypeScript error from setup).

- [ ] **Step 3: Update the TypeScript types**

In `types/index.ts` replace `Customer`, `Site`, `Device` and `Intervention`, and delete the stale `Werkbon` interface (lines 117-130, the one with `status: 'concept' | 'ingediend' | 'goedgekeurd'`). Nothing imports `Werkbon`; confirm with `grep -rn "Werkbon\b" --include=*.ts --include=*.tsx . | grep -v node_modules | grep "import"` (expected: no hits for the type).

```ts
export interface Customer {
  id: string
  name: string
  phone: string           // main company phone
  address: string         // billing address
  city: string            // billing city
  vatNumber?: string      // BTW nummer — optional for now
  customerNumber?: string          // KLANT N° L (e.g. K04647)
  invoiceCustomerNumber?: string   // KLANT N° F — invoice customer when different
}

export interface Site {
  id: string
  customerId: string      // which customer this site belongs to
  name: string            // e.g. "Hoofdkantoor", "Vestiging Gent" — can be same as customer name
  address: string
  city: string
  phones: string[]        // one or more phone numbers for this location
  lat?: number            // GPS latitude (WGS84)
  lon?: number            // GPS longitude (WGS84)
  closingDay?: string     // SLUITINGSDAG, free text
}

export interface Device {
  id: string
  siteId: string          // devices belong to a site, not directly to a customer
  brand: string
  model: string
  serialNumber?: string
  installDate?: string
  notes?: string
  unitNumber?: string     // UNIT N°
  deliveryDate?: string   // LEVERDATUM (ISO date)
  warrantyUntil?: string  // GARANTIE (ISO date)
}
```

```ts
export interface Intervention {
  id: string
  customerId: string
  customerName: string    // denormalized for display in day view
  customerNumber?: string          // KLANT N° L
  invoiceCustomerNumber?: string   // KLANT N° F
  siteId: string
  siteName: string        // denormalized for display
  siteAddress: string     // denormalized for display
  siteCity: string        // denormalized for display
  siteLat?: number        // denormalized GPS latitude
  siteLon?: number        // denormalized GPS longitude
  sitePhones?: string[]   // Tel & GSM
  closingDay?: string     // SLUITINGSDAG
  contactName?: string    // CONTACT (first contact of the site)
  contactPhone?: string
  deviceId: string | null // null when the ticket has no known unit yet
  deviceBrand?: string
  deviceModel?: string
  deviceUnitNumber?: string
  deviceSerial?: string
  deviceDeliveryDate?: string
  deviceWarrantyUntil?: string
  ticketNumber?: string   // TICKET N° (ERP)
  ticketDate?: string     // DATUM TICKET (ISO)
  createdAt?: string
  plannedDate: string
  status: InterventionStatus
  type: InterventionType
  description?: string    // reported problem (OMSCHRIJVING KLANT)
  estimatedMinutes?: number
  isUrgent: boolean
  source: InterventionSource
  technicians: InterventionTechnician[]
  statusOnderwegAt?: string
  statusArrivedAt?: string
  statusOnderwegBy?: string
  createdBy?: string
  planningVersion?: number
  visibleInPool?: boolean
}
```

- [ ] **Step 4: Left-join devices in the interventions server module**

In `lib/server/interventions.ts`:

Change `InterventionCoreRow` lines 26-28 to:

```ts
  deviceId: string | null
  deviceBrand: string | null
  deviceModel: string | null
```

Change `toIntervention` lines 83-85 to:

```ts
    deviceId: row.deviceId,
    deviceBrand: row.deviceBrand ?? undefined,
    deviceModel: row.deviceModel ?? undefined,
```

Change line 185 from `.innerJoin(devices, eq(workOrders.deviceId, devices.id))` to:

```ts
    .leftJoin(devices, eq(workOrders.deviceId, devices.id))
```

- [ ] **Step 5: Left-join devices in the warehouse queue**

In `app/api/warehouse/queue/route.ts` change line 93 from `.innerJoin(devices,   eq(workOrders.deviceId,   devices.id))` to:

```ts
      .leftJoin(devices,    eq(workOrders.deviceId,   devices.id))
```

Then find every use of `deviceBrand` / `deviceModel` from `woMap` further down in that file (`grep -n "deviceBrand\|deviceModel" app/api/warehouse/queue/route.ts`) and make each one null-safe with `?? ''` where a `string` is expected (the `WarehouseQueueResponse` type expects strings).

- [ ] **Step 6: Make the test helpers device-aware**

In `tests/setup.ts` add after `createTestWorkOrder`:

```ts
export async function createTestWorkOrderWithoutDevice(): Promise<string> {
  const suffix = randomUUID()
  const customerId = `customer-${suffix}`
  const siteId = `site-${suffix}`
  const workOrderId = `wo-${suffix}`

  await testDb.insert(customers).values({
    id: customerId,
    name: `Test Customer ${suffix.slice(0, 8)}`,
    phone: '0123456789',
    address: 'Teststraat 1',
    city: 'Gent',
  })

  await testDb.insert(sites).values({
    id: siteId,
    customerId,
    name: `Test Site ${suffix.slice(0, 8)}`,
    address: 'Teststraat 1',
    city: 'Gent',
  })

  await testDb.insert(workOrders).values({
    id: workOrderId,
    customerId,
    siteId,
    deviceId: null,
    plannedDate: new Date('2026-04-17T09:00:00.000Z'),
    status: 'gepland',
    type: 'warm',
    source: 'planned',
    isUrgent: false,
    planningVersion: 1,
  })

  return workOrderId
}
```

In `cleanup`, line 121, filter out nulls:

```ts
  const deviceIds = [...new Set([
    ...(ids.device_ids ?? []),
    ...workOrderRows.map(row => row.deviceId).filter((id): id is string => id !== null),
  ])]
```

In `deleteWorkOrderById`, line 237:

```ts
    device_ids: workOrder?.deviceId ? [workOrder.deviceId] : [],
```

- [ ] **Step 7: Widen the DevicePanel prop type**

In `components/DevicePanel/index.tsx` change line 7 to `deviceId: string | null` and guard the fetch: at the top of `loadDevicePanelData` (line 291) add as the first line:

```ts
      if (!deviceId) { setDetail({ serialNumber: null, installDate: null }); setHistory([]); setLoadingDetail(false); return }
```

and in `components/WerkbonForm/index.tsx` no change is needed yet (it passes `intervention.deviceId`, now `string | null`).

- [ ] **Step 8: Type check, run the new test and the whole suite**

```bash
npx tsc --noEmit
npx vitest run --config vitest.config.test.ts tests/interventions.optional-device.test.ts 2>&1 | tail -10
npm test 2>&1 | tail -8
```
Expected: tsc clean; 2 tests pass; full suite green.

- [ ] **Step 9: Commit**

```bash
git add types/index.ts lib/server/interventions.ts app/api/warehouse/queue/route.ts tests/setup.ts tests/interventions.optional-device.test.ts components/DevicePanel/index.tsx
git commit -m "feat(work-orders): allow work orders without a device

Left-joins devices in the interventions and warehouse queries, widens
Intervention.deviceId to string | null and adds Service Bon header
fields to the Intervention type.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 3: `createWorkOrder` server function with find-or-create

**Files:**
- Create: `lib/server/work-orders.ts`
- Create: `tests/fixtures/sauna-molenhoeve.json`
- Modify: `lib/db/with-audit.ts` (export the `Tx` type)
- Test: `tests/work-orders.create.test.ts`

**Interfaces:**
- Consumes: schema columns from Task 1; `withAudit` from `lib/db/with-audit.ts`.
- Produces:
  ```ts
  export class ValidationError extends Error { field: string }
  export class DuplicateTicketError extends Error { existingId: string }
  export interface CreateWorkOrderInput { … }           // camelCase, see below
  export function parseCreateWorkOrderBody(json: unknown): CreateWorkOrderInput   // snake_case wire → camelCase, throws ValidationError
  export async function createWorkOrder(input: CreateWorkOrderInput): Promise<{ id: string; ticketNumber: string }>
  ```

- [ ] **Step 1: Save the example bon as a JSON fixture**

Create `tests/fixtures/sauna-molenhoeve.json`:

```json
{
  "ticket_number": "TKT20/12752",
  "ticket_date": "2026-09-04",
  "planned_date": "2026-09-05",
  "description": "Nazicht/ herstel 2 friteuses Berner - controleren op lekken",
  "is_urgent": false,
  "customer": {
    "number": "K04647",
    "invoice_number": "K04647",
    "name": "Molenhoeve group bvba",
    "address": "Van den nestlaan 132",
    "postal_code": "2520",
    "city": "Broechem",
    "phone": "",
    "contact": "",
    "closing_day": ""
  },
  "device": null
}
```

- [ ] **Step 2: Export the transaction type from with-audit**

In `lib/db/with-audit.ts` change line `type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]` to:

```ts
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
```

- [ ] **Step 3: Write the failing tests**

Create `tests/work-orders.create.test.ts`:

```ts
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DuplicateTicketError,
  ValidationError,
  createWorkOrder,
  parseCreateWorkOrderBody,
} from '@/lib/server/work-orders'
import { contacts, customers, devices, sites, workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, testDb } from './setup'

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8'),
) as Record<string, unknown>

/** Fresh copy of the fixture with a unique ticket + customer number so tests never collide. */
function molenhoeve(overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID().slice(0, 8)
  const customer = { ...(fixture.customer as Record<string, unknown>), number: `K-${suffix}`, invoice_number: `K-${suffix}` }
  return { ...fixture, ticket_number: `TKT-${suffix}`, customer, ...overrides }
}

describe('parseCreateWorkOrderBody', () => {
  it('maps the snake_case fixture to camelCase input and treats empty strings as absent', () => {
    const input = parseCreateWorkOrderBody(fixture)

    expect(input.ticketNumber).toBe('TKT20/12752')
    expect(input.ticketDate).toBe('2026-09-04')
    expect(input.plannedDate).toBe('2026-09-05')
    expect(input.description).toBe('Nazicht/ herstel 2 friteuses Berner - controleren op lekken')
    expect(input.customer.number).toBe('K04647')
    expect(input.customer.postalCode).toBe('2520')
    expect(input.customer.city).toBe('Broechem')
    expect(input.customer.phone).toBeUndefined()
    expect(input.customer.contact).toBeUndefined()
    expect(input.customer.closingDay).toBeUndefined()
    expect(input.device).toBeNull()
  })

  it('throws a ValidationError naming the missing field', () => {
    expect(() => parseCreateWorkOrderBody({ ...fixture, ticket_number: '' })).toThrowError(ValidationError)
    try {
      parseCreateWorkOrderBody({ ...fixture, ticket_number: '' })
    } catch (err) {
      expect((err as ValidationError).field).toBe('ticket_number')
    }
    expect(() => parseCreateWorkOrderBody({ ...fixture, customer: undefined })).toThrowError(ValidationError)
    expect(() => parseCreateWorkOrderBody({ ...fixture, planned_date: 'not-a-date' })).toThrowError(ValidationError)
    expect(() => parseCreateWorkOrderBody('nope')).toThrowError(ValidationError)
  })
})

describe('createWorkOrder', () => {
  let ids: CleanupIds

  beforeEach(() => { ids = { work_order_ids: [], customer_ids: [], site_ids: [], device_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('creates customer, site and work order for the Molenhoeve bon without a device', async () => {
    const body = molenhoeve()
    const result = await createWorkOrder(parseCreateWorkOrderBody(body))
    ids.work_order_ids?.push(result.id)

    expect(result.ticketNumber).toBe(body.ticket_number)

    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, result.id))
    expect(wo?.ticketNumber).toBe(body.ticket_number)
    expect(wo?.deviceId).toBeNull()
    expect(wo?.status).toBe('gepland')
    expect(wo?.source).toBe('planned')
    expect(wo?.description).toBe(fixture.description)
    expect(wo?.ticketDate?.toISOString().slice(0, 10)).toBe('2026-09-04')
    expect(wo?.plannedDate.toISOString().slice(0, 10)).toBe('2026-09-05')

    const [customer] = await testDb.select().from(customers).where(eq(customers.id, wo!.customerId))
    expect(customer?.customerNumber).toBe((body.customer as { number: string }).number)
    expect(customer?.name).toBe('Molenhoeve group bvba')
    expect(customer?.city).toBe('2520 Broechem')

    const [site] = await testDb.select().from(sites).where(eq(sites.id, wo!.siteId))
    expect(site?.address).toBe('Van den nestlaan 132')
    expect(site?.city).toBe('2520 Broechem')
    expect(site?.name).toBe('Molenhoeve group bvba')
  })

  it('reuses an existing customer by customer number and an existing site by address', async () => {
    const first = molenhoeve()
    const a = await createWorkOrder(parseCreateWorkOrderBody(first))
    const b = await createWorkOrder(parseCreateWorkOrderBody({ ...first, ticket_number: `${first.ticket_number}-B` }))
    ids.work_order_ids?.push(a.id, b.id)

    const rows = await testDb.select().from(workOrders).where(eq(workOrders.id, a.id))
    const rowsB = await testDb.select().from(workOrders).where(eq(workOrders.id, b.id))
    expect(rowsB[0]?.customerId).toBe(rows[0]?.customerId)
    expect(rowsB[0]?.siteId).toBe(rows[0]?.siteId)
  })

  it('creates a contact when one is given and a device when a unit number is given, then reuses the device', async () => {
    const body = molenhoeve({
      customer: { ...(molenhoeve().customer as object), contact: 'Jan Peeters', contact_phone: '0470 11 22 33', closing_day: 'maandag' },
      device: { unit_number: 'U-7', brand: 'Berner', model: 'Friteuse 2x8L', serial_number: 'SN-1', delivery_date: '2024-01-15', warranty_until: '2026-01-15' },
    })
    const a = await createWorkOrder(parseCreateWorkOrderBody(body))
    const b = await createWorkOrder(parseCreateWorkOrderBody({ ...body, ticket_number: `${body.ticket_number}-B` }))
    ids.work_order_ids?.push(a.id, b.id)

    const [woA] = await testDb.select().from(workOrders).where(eq(workOrders.id, a.id))
    const [woB] = await testDb.select().from(workOrders).where(eq(workOrders.id, b.id))
    expect(woA?.deviceId).toBeTruthy()
    expect(woB?.deviceId).toBe(woA?.deviceId)

    const [device] = await testDb.select().from(devices).where(eq(devices.id, woA!.deviceId!))
    expect(device).toMatchObject({ unitNumber: 'U-7', brand: 'Berner', model: 'Friteuse 2x8L', deliveryDate: '2024-01-15', warrantyUntil: '2026-01-15' })

    const siteContacts = await testDb.select().from(contacts).where(eq(contacts.siteId, woA!.siteId))
    expect(siteContacts).toHaveLength(1)
    expect(siteContacts[0]).toMatchObject({ name: 'Jan Peeters', phone: '0470 11 22 33' })

    const [site] = await testDb.select().from(sites).where(eq(sites.id, woA!.siteId))
    expect(site?.closingDay).toBe('maandag')
  })

  it('rejects a duplicate ticket number with DuplicateTicketError carrying the existing id', async () => {
    const body = molenhoeve()
    const first = await createWorkOrder(parseCreateWorkOrderBody(body))
    ids.work_order_ids?.push(first.id)

    await expect(createWorkOrder(parseCreateWorkOrderBody(body))).rejects.toThrowError(DuplicateTicketError)
    try {
      await createWorkOrder(parseCreateWorkOrderBody(body))
    } catch (err) {
      expect((err as DuplicateTicketError).existingId).toBe(first.id)
    }
  })

  it('creates assignments when technicianIds are given', async () => {
    const { createTestTechnician } = await import('./setup')
    const techId = await createTestTechnician()
    ids.technician_ids = [techId]

    const result = await createWorkOrder({ ...parseCreateWorkOrderBody(molenhoeve()), technicianIds: [techId] })
    ids.work_order_ids?.push(result.id)

    const { workOrderAssignments } = await import('@/lib/db/schema')
    const rows = await testDb.select().from(workOrderAssignments).where(eq(workOrderAssignments.workOrderId, result.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ technicianId: techId, isLead: true, accepted: true, plannedOrder: 1 })
  })
})
```

Note for `cleanup`: it deletes customers, sites and devices reachable from `work_order_ids`, and `work_order_assignments` cascade on work order delete. Contacts cascade on site delete. Nothing extra to add.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.config.test.ts tests/work-orders.create.test.ts 2>&1 | tail -15`
Expected: FAIL, cannot resolve `@/lib/server/work-orders`.

- [ ] **Step 5: Implement `lib/server/work-orders.ts`**

```ts
/**
 * lib/server/work-orders.ts — create a work order from a "Service Bon" ticket.
 *
 * One function, two callers: the inbound ERP route and the manual wizard.
 * Everything runs in one transaction so a half-created customer can never
 * exist without its work order.
 */
import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { customers, contacts, devices, sites, workOrderAssignments, workOrders } from '@/lib/db/schema'
import { withAudit, type Tx } from '@/lib/db/with-audit'
import type { InterventionType } from '@/types'

// ── Errors ────────────────────────────────────────────────────────────────────

export class ValidationError extends Error {
  field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

export class DuplicateTicketError extends Error {
  existingId: string
  constructor(ticketNumber: string, existingId: string) {
    super(`Ticket ${ticketNumber} bestaat al`)
    this.name = 'DuplicateTicketError'
    this.existingId = existingId
  }
}

// ── Input shape (camelCase, validated) ───────────────────────────────────────

export interface CreateWorkOrderCustomer {
  number: string
  invoiceNumber?: string
  name: string
  address: string
  postalCode?: string
  city: string
  phone?: string
  phoneSecondary?: string
  contact?: string
  contactPhone?: string
  closingDay?: string
}

export interface CreateWorkOrderSite {
  name?: string
  address?: string
  postalCode?: string
  city?: string
}

export interface CreateWorkOrderDevice {
  unitNumber?: string
  brand: string
  model: string
  serialNumber?: string
  deliveryDate?: string
  warrantyUntil?: string
}

export interface CreateWorkOrderInput {
  ticketNumber: string
  ticketDate?: string          // ISO date
  plannedDate: string          // ISO date or datetime
  description: string
  isUrgent?: boolean
  type?: InterventionType      // default 'warm'
  customer: CreateWorkOrderCustomer
  site?: CreateWorkOrderSite   // defaults to the customer address
  device?: CreateWorkOrderDevice | null
  technicianIds?: string[]     // first one becomes lead
  createdBy?: string
}

// ── Parsing the snake_case wire format ───────────────────────────────────────

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trim a string field; empty strings count as absent. */
function optionalString(obj: Json, key: string): string | undefined {
  const value = obj[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new ValidationError(key, `${key} moet tekst zijn`)
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function requiredString(obj: Json, key: string, label: string): string {
  const value = optionalString(obj, key)
  if (!value) throw new ValidationError(key, `${label} is verplicht`)
  return value
}

function optionalDate(obj: Json, key: string): string | undefined {
  const value = optionalString(obj, key)
  if (value === undefined) return undefined
  if (Number.isNaN(new Date(value).getTime())) throw new ValidationError(key, `${key} is geen geldige datum`)
  return value
}

const INTERVENTION_TYPES: InterventionType[] = ['warm', 'montage', 'preventief']

export function parseCreateWorkOrderBody(json: unknown): CreateWorkOrderInput {
  if (!isObject(json)) throw new ValidationError('body', 'Body moet een JSON-object zijn')

  const ticketNumber = requiredString(json, 'ticket_number', 'ticket_number')
  const plannedDate  = optionalDate(json, 'planned_date')
  if (!plannedDate) throw new ValidationError('planned_date', 'planned_date is verplicht')
  const description  = requiredString(json, 'description', 'description')
  const ticketDate   = optionalDate(json, 'ticket_date')

  const typeRaw = optionalString(json, 'type')
  if (typeRaw && !INTERVENTION_TYPES.includes(typeRaw as InterventionType)) {
    throw new ValidationError('type', `type moet één van ${INTERVENTION_TYPES.join(', ')} zijn`)
  }

  if (!isObject(json.customer)) throw new ValidationError('customer', 'customer is verplicht')
  const c = json.customer
  const customer: CreateWorkOrderCustomer = {
    number:         requiredString(c, 'number', 'customer.number'),
    invoiceNumber:  optionalString(c, 'invoice_number'),
    name:           requiredString(c, 'name', 'customer.name'),
    address:        requiredString(c, 'address', 'customer.address'),
    postalCode:     optionalString(c, 'postal_code'),
    city:           requiredString(c, 'city', 'customer.city'),
    phone:          optionalString(c, 'phone'),
    phoneSecondary: optionalString(c, 'phone_secondary'),
    contact:        optionalString(c, 'contact'),
    contactPhone:   optionalString(c, 'contact_phone'),
    closingDay:     optionalString(c, 'closing_day'),
  }

  let site: CreateWorkOrderSite | undefined
  if (isObject(json.site)) {
    site = {
      name:       optionalString(json.site, 'name'),
      address:    optionalString(json.site, 'address'),
      postalCode: optionalString(json.site, 'postal_code'),
      city:       optionalString(json.site, 'city'),
    }
  }

  let device: CreateWorkOrderDevice | null = null
  if (isObject(json.device)) {
    device = {
      unitNumber:    optionalString(json.device, 'unit_number'),
      brand:         requiredString(json.device, 'brand', 'device.brand'),
      model:         requiredString(json.device, 'model', 'device.model'),
      serialNumber:  optionalString(json.device, 'serial_number'),
      deliveryDate:  optionalDate(json.device, 'delivery_date'),
      warrantyUntil: optionalDate(json.device, 'warranty_until'),
    }
  }

  let technicianIds: string[] | undefined
  if (json.technician_ids !== undefined) {
    if (!Array.isArray(json.technician_ids) || json.technician_ids.some(id => typeof id !== 'string')) {
      throw new ValidationError('technician_ids', 'technician_ids moet een lijst van ids zijn')
    }
    technicianIds = json.technician_ids as string[]
  }

  return {
    ticketNumber,
    ticketDate,
    plannedDate,
    description,
    isUrgent: json.is_urgent === true,
    type: (typeRaw as InterventionType | undefined) ?? 'warm',
    customer,
    site,
    device,
    technicianIds,
    createdBy: optionalString(json, 'created_by'),
  }
}

// ── Find-or-create helpers (all inside the caller's transaction) ─────────────

function cityLine(postalCode: string | undefined, city: string): string {
  return [postalCode, city].filter(Boolean).join(' ')
}

async function findOrCreateCustomer(tx: Tx, input: CreateWorkOrderCustomer): Promise<string> {
  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerNumber, input.number))

  const values = {
    name: input.name,
    phone: input.phone ?? '',
    address: input.address,
    city: cityLine(input.postalCode, input.city),
    invoiceCustomerNumber: input.invoiceNumber ?? null,
  }

  if (existing) {
    await tx.update(customers).set(values).where(eq(customers.id, existing.id))
    return existing.id
  }

  const id = `customer-${randomUUID()}`
  await tx.insert(customers).values({ id, customerNumber: input.number, ...values })
  return id
}

async function findOrCreateSite(
  tx: Tx,
  customerId: string,
  customer: CreateWorkOrderCustomer,
  site: CreateWorkOrderSite | undefined,
): Promise<string> {
  const address = site?.address ?? customer.address
  const city    = cityLine(site?.postalCode ?? customer.postalCode, site?.city ?? customer.city)
  const name    = site?.name ?? customer.name

  const [existing] = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.customerId, customerId), eq(sites.address, address), eq(sites.city, city)))

  const optional = {
    ...(customer.phone          ? { phonePrimary: customer.phone }            : {}),
    ...(customer.phoneSecondary ? { phoneSecondary: customer.phoneSecondary } : {}),
    ...(customer.closingDay     ? { closingDay: customer.closingDay }         : {}),
  }

  if (existing) {
    if (Object.keys(optional).length > 0) {
      await tx.update(sites).set(optional).where(eq(sites.id, existing.id))
    }
    return existing.id
  }

  const id = `site-${randomUUID()}`
  await tx.insert(sites).values({ id, customerId, name, address, city, ...optional })
  return id
}

async function ensureContact(tx: Tx, siteId: string, customer: CreateWorkOrderCustomer): Promise<void> {
  if (!customer.contact) return
  const [existing] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.siteId, siteId), eq(contacts.name, customer.contact)))
  if (existing) return
  await tx.insert(contacts).values({
    id: `contact-${randomUUID()}`,
    siteId,
    name: customer.contact,
    phone: customer.contactPhone ?? customer.phone ?? '',
  })
}

async function findOrCreateDevice(tx: Tx, siteId: string, device: CreateWorkOrderDevice): Promise<string> {
  const match = device.unitNumber
    ? and(eq(devices.siteId, siteId), eq(devices.unitNumber, device.unitNumber))
    : and(
        eq(devices.siteId, siteId),
        eq(devices.brand, device.brand),
        eq(devices.model, device.model),
        device.serialNumber ? eq(devices.serialNumber, device.serialNumber) : undefined,
      )

  const [existing] = await tx.select({ id: devices.id }).from(devices).where(match)
  if (existing) return existing.id

  const id = `device-${randomUUID()}`
  await tx.insert(devices).values({
    id,
    siteId,
    brand: device.brand,
    model: device.model,
    serialNumber: device.serialNumber ?? null,
    unitNumber: device.unitNumber ?? null,
    deliveryDate: device.deliveryDate ?? null,
    warrantyUntil: device.warrantyUntil ?? null,
  })
  return id
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function createWorkOrder(input: CreateWorkOrderInput): Promise<{ id: string; ticketNumber: string }> {
  return withAudit(input.createdBy ?? null, async (tx) => {
    const [duplicate] = await tx
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(eq(workOrders.ticketNumber, input.ticketNumber))
    if (duplicate) throw new DuplicateTicketError(input.ticketNumber, duplicate.id)

    const customerId = await findOrCreateCustomer(tx, input.customer)
    const siteId     = await findOrCreateSite(tx, customerId, input.customer, input.site)
    await ensureContact(tx, siteId, input.customer)
    const deviceId   = input.device ? await findOrCreateDevice(tx, siteId, input.device) : null

    const id = `wo-${randomUUID()}`
    await tx.insert(workOrders).values({
      id,
      customerId,
      siteId,
      deviceId,
      ticketNumber: input.ticketNumber,
      ticketDate: input.ticketDate ? new Date(input.ticketDate) : null,
      plannedDate: new Date(input.plannedDate),
      status: 'gepland',
      type: input.type ?? 'warm',
      source: 'planned',
      description: input.description,
      isUrgent: input.isUrgent ?? false,
      createdBy: input.createdBy ?? null,
      visibleInPool: true,
    })

    const technicianIds = input.technicianIds ?? []
    if (technicianIds.length > 0) {
      await tx.insert(workOrderAssignments).values(
        technicianIds.map((technicianId, index) => ({
          workOrderId: id,
          technicianId,
          isLead: index === 0,
          accepted: true,
          plannedOrder: index + 1,
        })),
      )
    }

    return { id, ticketNumber: input.ticketNumber }
  })
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --config vitest.config.test.ts tests/work-orders.create.test.ts 2>&1 | tail -15`
Expected: PASS, 7 tests. If the `and(…, undefined)` in `findOrCreateDevice` upsets Drizzle's types, build the conditions array first: `const conds = [eq(...), eq(...), eq(...)]; if (device.serialNumber) conds.push(eq(...)); and(...conds)`.

- [ ] **Step 7: Type check and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/server/work-orders.ts lib/db/with-audit.ts tests/fixtures/sauna-molenhoeve.json tests/work-orders.create.test.ts
git commit -m "feat(work-orders): createWorkOrder with find-or-create customer, site, contact, device

Shared server function for the ERP route and the manual wizard. Parses
the snake_case Service Bon payload, validates it, and creates the work
order in one audited transaction. Adds the Molenhoeve bon as fixture.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 4: Inbound ERP POST and internal POST routes

**Files:**
- Modify: `app/api/erp/work-orders/route.ts` (add POST after the GET)
- Create: `app/api/work-orders/route.ts`
- Test: `tests/api.work-orders.create.test.ts`

**Interfaces:**
- Consumes: `parseCreateWorkOrderBody`, `createWorkOrder`, `ValidationError`, `DuplicateTicketError` from Task 3.
- Produces: `POST /api/erp/work-orders` (x-erp-key) and `POST /api/work-orders`; both return `201 { id, ticket_number }`, `400 { error, field }`, `409 { error, id }`.

- [ ] **Step 1: Write the failing route tests**

Create `tests/api.work-orders.create.test.ts`:

```ts
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as postErpWorkOrder } from '@/app/api/erp/work-orders/route'
import { POST as postWorkOrder } from '@/app/api/work-orders/route'
import { workOrderAssignments, workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, createTestTechnician, testDb } from './setup'

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8'),
) as Record<string, unknown>

function molenhoeve(overrides: Record<string, unknown> = {}) {
  const suffix = randomUUID().slice(0, 8)
  const customer = { ...(fixture.customer as Record<string, unknown>), number: `K-${suffix}`, invoice_number: `K-${suffix}` }
  return { ...fixture, ticket_number: `TKT-${suffix}`, customer, ...overrides }
}

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const erpKey = process.env.ERP_API_KEY as string
const ERP_URL = 'http://localhost/api/erp/work-orders'
const INTERNAL_URL = 'http://localhost/api/work-orders'

describe('POST /api/erp/work-orders', () => {
  let ids: CleanupIds
  beforeEach(() => { ids = { work_order_ids: [], technician_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('rejects a missing or wrong x-erp-key with 401', async () => {
    expect((await postErpWorkOrder(jsonReq(ERP_URL, molenhoeve()))).status).toBe(401)
    expect((await postErpWorkOrder(jsonReq(ERP_URL, molenhoeve(), { 'x-erp-key': 'wrong' }))).status).toBe(401)
  })

  it('creates the Molenhoeve work order and returns 201 with id and ticket_number', async () => {
    const body = molenhoeve()
    const res = await postErpWorkOrder(jsonReq(ERP_URL, body, { 'x-erp-key': erpKey }))
    const json = await res.json() as { id: string; ticket_number: string }
    ids.work_order_ids?.push(json.id)

    expect(res.status).toBe(201)
    expect(json.ticket_number).toBe(body.ticket_number)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, json.id))
    expect(wo?.deviceId).toBeNull()
  })

  it('returns 409 with the existing id for a duplicate ticket', async () => {
    const body = molenhoeve()
    const first = await postErpWorkOrder(jsonReq(ERP_URL, body, { 'x-erp-key': erpKey }))
    const { id } = await first.json() as { id: string }
    ids.work_order_ids?.push(id)

    const second = await postErpWorkOrder(jsonReq(ERP_URL, body, { 'x-erp-key': erpKey }))
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: 'Ticket bestaat al', id })
  })

  it('returns 400 naming the field on invalid input', async () => {
    const res = await postErpWorkOrder(jsonReq(ERP_URL, molenhoeve({ ticket_number: '' }), { 'x-erp-key': erpKey }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ field: 'ticket_number' })

    const bad = new NextRequest(ERP_URL, { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json', 'x-erp-key': erpKey } })
    expect((await postErpWorkOrder(bad)).status).toBe(400)
  })
})

describe('POST /api/work-orders (internal)', () => {
  let ids: CleanupIds
  beforeEach(() => { ids = { work_order_ids: [], technician_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('creates a work order without an ERP key and assigns technicians', async () => {
    const techId = await createTestTechnician()
    ids.technician_ids?.push(techId)

    const res = await postWorkOrder(jsonReq(INTERNAL_URL, molenhoeve({ technician_ids: [techId], created_by: techId })))
    const json = await res.json() as { id: string }
    ids.work_order_ids?.push(json.id)

    expect(res.status).toBe(201)
    const rows = await testDb.select().from(workOrderAssignments).where(eq(workOrderAssignments.workOrderId, json.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.isLead).toBe(true)
  })

  it('returns 400 and 409 like the ERP route', async () => {
    expect((await postWorkOrder(jsonReq(INTERNAL_URL, molenhoeve({ description: '' })))).status).toBe(400)
    const body = molenhoeve()
    const first = await postWorkOrder(jsonReq(INTERNAL_URL, body))
    ids.work_order_ids?.push((await first.json() as { id: string }).id)
    expect((await postWorkOrder(jsonReq(INTERNAL_URL, body))).status).toBe(409)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.config.test.ts tests/api.work-orders.create.test.ts 2>&1 | tail -15`
Expected: FAIL, `POST` is not exported / module `@/app/api/work-orders/route` not found.

- [ ] **Step 3: Add a shared response helper and the ERP POST**

Append to `lib/server/work-orders.ts`:

```ts
// ── HTTP glue shared by both POST routes ─────────────────────────────────────
// Kept here so the ERP route and the internal route answer identically.

export type CreateWorkOrderHttpResult =
  | { status: 201; body: { id: string; ticket_number: string } }
  | { status: 400; body: { error: string; field: string } }
  | { status: 409; body: { error: string; id: string } }
  | { status: 500; body: { error: string } }

export async function handleCreateWorkOrderRequest(rawBody: unknown, createdBy?: string): Promise<CreateWorkOrderHttpResult> {
  try {
    const input = parseCreateWorkOrderBody(rawBody)
    const result = await createWorkOrder({ ...input, createdBy: input.createdBy ?? createdBy })
    return { status: 201, body: { id: result.id, ticket_number: result.ticketNumber } }
  } catch (err) {
    if (err instanceof ValidationError)      return { status: 400, body: { error: err.message, field: err.field } }
    if (err instanceof DuplicateTicketError) return { status: 409, body: { error: 'Ticket bestaat al', id: err.existingId } }
    console.error('[createWorkOrder]', err)
    return { status: 500, body: { error: 'Intern serverfout' } }
  }
}
```

In `app/api/erp/work-orders/route.ts` add to the imports:

```ts
import { handleCreateWorkOrderRequest } from '@/lib/server/work-orders'
```

and append after the GET handler:

```ts
// ── POST /api/erp/work-orders ─────────────────────────────────────────────────
// The ERP pushes a new ticket ("Service Bon" header). Body is snake_case JSON,
// see tests/fixtures/sauna-molenhoeve.json. 201 on success, 409 on duplicate
// ticket_number, 400 with the offending field on validation errors.
export async function POST(req: NextRequest) {
  const authError = requireErpKey(req)
  if (authError) return authError

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON', field: 'body' }, { status: 400 })
  }

  const result = await handleCreateWorkOrderRequest(rawBody, 'erp')
  return NextResponse.json(result.body, { status: result.status })
}
```

- [ ] **Step 4: Create the internal route**

Create `app/api/work-orders/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { handleCreateWorkOrderRequest } from '@/lib/server/work-orders'

// ── POST /api/work-orders ─────────────────────────────────────────────────────
// Used by the "nieuwe werkbon" wizard. Same body and responses as the ERP
// route, without the ERP key. When auth is enforced (PLANNING.md phase 5)
// this route gets the office/planner role check.
export async function POST(req: NextRequest) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON', field: 'body' }, { status: 400 })
  }

  const result = await handleCreateWorkOrderRequest(rawBody)
  return NextResponse.json(result.body, { status: result.status })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config vitest.config.test.ts tests/api.work-orders.create.test.ts 2>&1 | tail -15`
Expected: PASS, 6 tests.

- [ ] **Step 6: Type check, lint, full suite, commit**

```bash
npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -8
git add app/api/erp/work-orders/route.ts app/api/work-orders/route.ts lib/server/work-orders.ts tests/api.work-orders.create.test.ts
git commit -m "feat(api): POST /api/erp/work-orders and POST /api/work-orders

Inbound Service Bon tickets from the ERP (x-erp-key) and from the manual
wizard share one handler: 201 created, 400 with field, 409 duplicate.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 5: Extend the ERP export with ticket and werkbon fields

**Files:**
- Modify: `app/api/erp/work-orders/route.ts` GET (result mapping, lines ~61-75)
- Test: `tests/api.erp.test.ts` (extend the `erp work orders endpoint returns…` test)

**Interfaces:**
- Produces on each exported row: `ticket_number`, `ticket_date`, `created_at`, `customer_number`; and on `werkbon`: `bon_number`, `technician_id`, `device_id`, `visit_date`, `arrival_time`, `departure_time`, `intervention_kind`, `trip_count`, `person_count`, `remarks`, `pdf_path`.

- [ ] **Step 1: Extend the existing test**

In `tests/api.erp.test.ts`, inside the test `erp work orders endpoint returns work orders with tasks, werkbon, status filtering, and nullable external_ref`, before the `const response = await getErpWorkOrders(` line, insert a werkbon row so the export has something to show:

```ts
    await testDb.insert(werkbonnen).values({
      id: randomUUID(),
      workOrderId: matchingWorkOrderId,
      bonNumber: 'TKT-TEST-01',
      notes: 'Lek gedicht',
      parts: [],
      tripCount: 1,
      personCount: 2,
      interventionKind: 'week',
      remarks: 'Klant tevreden',
    })
```

Add `werkbonnen` to the schema import at the top (`import { werkbonnen, workOrderEvents, workOrders } from '@/lib/db/schema'`). Also set the ticket on the matching work order: in the existing `testDb.update(workOrders).set({ status: 'bezig', … })` add `ticketNumber: 'TKT-TEST',`.

Replace the final two assertions of that test with:

```ts
    expect(body.work_orders[0]).toMatchObject({ ticket_number: 'TKT-TEST' })
    expect(body.work_orders[0]).toHaveProperty('customer_number')
    expect(body.work_orders[0]).toHaveProperty('created_at')
    expect(body.work_orders[0]?.werkbon).toMatchObject({
      bon_number: 'TKT-TEST-01',
      notes: 'Lek gedicht',
      trip_count: 1,
      person_count: 2,
      intervention_kind: 'week',
      remarks: 'Klant tevreden',
    })
```

`cleanup` already deletes `werkbonnen` by work order id.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config vitest.config.test.ts tests/api.erp.test.ts 2>&1 | tail -15`
Expected: FAIL on `ticket_number` / `bon_number` missing.

- [ ] **Step 3: Extend the GET mapping**

In `app/api/erp/work-orders/route.ts` GET, the `orders` query selects only `workOrders`. Change it to join customers for the number:

```ts
    const orders = await db
      .select({ wo: workOrders, customerNumber: customers.customerNumber })
      .from(workOrders)
      .innerJoin(customers, eq(workOrders.customerId, customers.id))
      .where(and(...conditions))
```

Add `customers` to the schema import. Then change the `orders.map(async wo => {` to `orders.map(async ({ wo, customerNumber }) => {`, keep the tasks and latest werkbon queries, but order the latest werkbon newest-first: `.orderBy(desc(werkbonnen.completedAt))` (import `desc` from drizzle-orm). Replace the returned object with:

```ts
      const iso = (d: Date | string | null | undefined) => (d instanceof Date ? d.toISOString() : d ?? null)
      return {
        id:              wo.id,
        external_ref:    wo.externalRef,
        ticket_number:   wo.ticketNumber,
        ticket_date:     iso(wo.ticketDate),
        created_at:      iso(wo.createdAt),
        customer_number: customerNumber,
        site_id:         wo.siteId,
        device_id:       wo.deviceId,
        status:          wo.status,
        type:            wo.type,
        planned_date:    iso(wo.plannedDate),
        completed_at:    iso(wo.completedAt),
        is_urgent:       wo.isUrgent,
        description:     wo.description,
        tasks:           woTasks,
        werkbon:         latestWerkbon
          ? {
              id:                latestWerkbon.id,
              bon_number:        latestWerkbon.bonNumber,
              technician_id:     latestWerkbon.technicianId,
              device_id:         latestWerkbon.deviceId,
              visit_date:        iso(latestWerkbon.visitDate),
              arrival_time:      iso(latestWerkbon.arrivalTime),
              departure_time:    iso(latestWerkbon.departureTime),
              work_start:        iso(latestWerkbon.workStart),
              work_end:          iso(latestWerkbon.workEnd),
              intervention_kind: latestWerkbon.interventionKind,
              trip_count:        latestWerkbon.tripCount,
              person_count:      latestWerkbon.personCount,
              notes:             latestWerkbon.notes,
              remarks:           latestWerkbon.remarks,
              parts:             latestWerkbon.parts,
              pdf_path:          latestWerkbon.pdfPath,
              completed_at:      iso(latestWerkbon.completedAt),
            }
          : null,
      }
```

The signature is deliberately not exported (size); the ERP fetches the PDF via `pdf_path`.

- [ ] **Step 4: Run to verify it passes, then the full suite**

Run: `npx vitest run --config vitest.config.test.ts tests/api.erp.test.ts 2>&1 | tail -10 && npm test 2>&1 | tail -6`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add app/api/erp/work-orders/route.ts tests/api.erp.test.ts
git commit -m "feat(erp): export ticket number and full werkbon fields

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 6: Lookup routes for the wizard and the device picker

**Files:**
- Create: `app/api/customers/route.ts`
- Create: `app/api/customers/[id]/sites/route.ts`
- Create: `app/api/sites/[id]/devices/route.ts` (GET + POST)
- Create: `app/api/technicians/route.ts`
- Test: `tests/api.lookups.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/customers?q=` → `{ customers: Customer[] }` (camelCase, matches `types/index.ts`), max 50, ordered by name.
  - `GET /api/customers/[id]/sites` → `{ sites: Array<Site & { contacts: Contact[] }> }`.
  - `GET /api/sites/[id]/devices` → `{ devices: Device[] }`.
  - `POST /api/sites/[id]/devices` body `{ brand, model, unit_number?, serial_number?, delivery_date?, warranty_until? }` → `201 { device: Device }`.
  - `GET /api/technicians` → `{ technicians: Array<{ id, name, initials, role }> }` active only, ordered by name.

- [ ] **Step 1: Write the failing tests**

Create `tests/api.lookups.test.ts`:

```ts
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET as getCustomers } from '@/app/api/customers/route'
import { GET as getCustomerSites } from '@/app/api/customers/[id]/sites/route'
import { GET as getSiteDevices, POST as postSiteDevice } from '@/app/api/sites/[id]/devices/route'
import { GET as getTechnicians } from '@/app/api/technicians/route'
import { contacts, customers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { CleanupIds } from './setup'
import { cleanup, createTestTechnician, createTestWorkOrder, testDb } from './setup'
import { workOrders } from '@/lib/db/schema'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }

describe('wizard lookup routes', () => {
  let ids: CleanupIds
  beforeEach(() => { ids = { work_order_ids: [], technician_ids: [], device_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('GET /api/customers filters on name or customer number, case-insensitive', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    const number = `K-${randomUUID().slice(0, 6)}`
    await testDb.update(customers).set({ customerNumber: number, name: 'Molenhoeve Lookup Test' }).where(eq(customers.id, wo!.customerId))

    const byName = await getCustomers(new NextRequest('http://localhost/api/customers?q=molenhoeve%20lookup'))
    const byNameJson = await byName.json() as { customers: Array<{ id: string; customerNumber?: string }> }
    expect(byName.status).toBe(200)
    expect(byNameJson.customers.some(c => c.id === wo!.customerId)).toBe(true)

    const byNumber = await getCustomers(new NextRequest(`http://localhost/api/customers?q=${number.toLowerCase()}`))
    const byNumberJson = await byNumber.json() as { customers: Array<{ id: string; customerNumber?: string }> }
    expect(byNumberJson.customers).toHaveLength(1)
    expect(byNumberJson.customers[0]?.customerNumber).toBe(number)
  })

  it('GET /api/customers/[id]/sites returns sites with their contacts and phones array', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    await testDb.insert(contacts).values({ id: `contact-${randomUUID()}`, siteId: wo!.siteId, name: 'An Contact', phone: '0470 00 00 00' })

    const res = await getCustomerSites(new NextRequest('http://localhost/x'), ctx(wo!.customerId))
    const json = await res.json() as { sites: Array<{ id: string; phones: string[]; contacts: Array<{ name: string }> }> }
    expect(res.status).toBe(200)
    expect(json.sites).toHaveLength(1)
    expect(json.sites[0]?.id).toBe(wo!.siteId)
    expect(Array.isArray(json.sites[0]?.phones)).toBe(true)
    expect(json.sites[0]?.contacts[0]?.name).toBe('An Contact')
  })

  it('GET and POST /api/sites/[id]/devices list and create devices', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))

    const before = await (await getSiteDevices(new NextRequest('http://localhost/x'), ctx(wo!.siteId))).json() as { devices: unknown[] }
    expect(before.devices).toHaveLength(1)

    const created = await postSiteDevice(new NextRequest('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ brand: 'Berner', model: 'Friteuse', unit_number: 'U-1', warranty_until: '2027-01-01' }),
      headers: { 'content-type': 'application/json' },
    }), ctx(wo!.siteId))
    const createdJson = await created.json() as { device: { id: string; brand: string; unitNumber?: string; warrantyUntil?: string } }
    ids.device_ids?.push(createdJson.device.id)
    expect(created.status).toBe(201)
    expect(createdJson.device).toMatchObject({ brand: 'Berner', unitNumber: 'U-1', warrantyUntil: '2027-01-01' })

    const after = await (await getSiteDevices(new NextRequest('http://localhost/x'), ctx(wo!.siteId))).json() as { devices: unknown[] }
    expect(after.devices).toHaveLength(2)

    const bad = await postSiteDevice(new NextRequest('http://localhost/x', {
      method: 'POST', body: JSON.stringify({ brand: 'Berner' }), headers: { 'content-type': 'application/json' },
    }), ctx(wo!.siteId))
    expect(bad.status).toBe(400)
  })

  it('GET /api/technicians returns active technicians ordered by name', async () => {
    const techId = await createTestTechnician()
    ids.technician_ids?.push(techId)

    const res = await getTechnicians()
    const json = await res.json() as { technicians: Array<{ id: string; name: string }> }
    expect(res.status).toBe(200)
    expect(json.technicians.some(t => t.id === techId)).toBe(true)
    const names = json.technicians.map(t => t.name)
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --config vitest.config.test.ts tests/api.lookups.test.ts 2>&1 | tail -10`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the four routes**

`app/api/customers/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { asc, ilike, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import type { Customer } from '@/types'

// GET /api/customers?q=  — name or customer number contains q (case-insensitive), max 50
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const pattern = `%${q}%`

  try {
    const rows = await db
      .select()
      .from(customers)
      .where(q ? or(ilike(customers.name, pattern), ilike(customers.customerNumber, pattern)) : undefined)
      .orderBy(asc(customers.name))
      .limit(50)

    const result: Customer[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      city: row.city,
      vatNumber: row.vatNumber ?? undefined,
      customerNumber: row.customerNumber ?? undefined,
      invoiceCustomerNumber: row.invoiceCustomerNumber ?? undefined,
    }))

    return NextResponse.json({ customers: result })
  } catch (error) {
    console.error('[api/customers GET]', error)
    return NextResponse.json({ error: 'Klanten konden niet geladen worden' }, { status: 500 })
  }
}
```

`app/api/customers/[id]/sites/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contacts, sites } from '@/lib/db/schema'
import type { Contact, Site } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/customers/[id]/sites — sites of a customer, each with its contacts
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const siteRows = await db.select().from(sites).where(eq(sites.customerId, id)).orderBy(asc(sites.name))
    const siteIds = siteRows.map(s => s.id)
    const contactRows = siteIds.length
      ? await db.select().from(contacts).where(inArray(contacts.siteId, siteIds)).orderBy(asc(contacts.name))
      : []

    const result: Array<Site & { contacts: Contact[] }> = siteRows.map(row => ({
      id: row.id,
      customerId: row.customerId,
      name: row.name,
      address: row.address,
      city: row.city,
      phones: [row.phonePrimary, row.phoneSecondary].filter((p): p is string => Boolean(p)),
      lat: row.lat ?? undefined,
      lon: row.lon ?? undefined,
      closingDay: row.closingDay ?? undefined,
      contacts: contactRows
        .filter(c => c.siteId === row.id)
        .map(c => ({ id: c.id, siteId: c.siteId, name: c.name, phone: c.phone, email: c.email ?? undefined, role: c.role ?? undefined })),
    }))

    return NextResponse.json({ sites: result })
  } catch (error) {
    console.error('[api/customers/[id]/sites GET]', error)
    return NextResponse.json({ error: 'Locaties konden niet geladen worden' }, { status: 500 })
  }
}
```

`app/api/sites/[id]/devices/route.ts`:

```ts
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { devices, sites } from '@/lib/db/schema'
import type { Device } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

function toDevice(row: typeof devices.$inferSelect): Device {
  return {
    id: row.id,
    siteId: row.siteId,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serialNumber ?? undefined,
    installDate: row.installDate ?? undefined,
    notes: row.notes ?? undefined,
    unitNumber: row.unitNumber ?? undefined,
    deliveryDate: row.deliveryDate ?? undefined,
    warrantyUntil: row.warrantyUntil ?? undefined,
  }
}

// GET /api/sites/[id]/devices
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const rows = await db.select().from(devices).where(eq(devices.siteId, id)).orderBy(asc(devices.brand), asc(devices.model))
    return NextResponse.json({ devices: rows.map(toDevice) })
  } catch (error) {
    console.error('[api/sites/[id]/devices GET]', error)
    return NextResponse.json({ error: 'Toestellen konden niet geladen worden' }, { status: 500 })
  }
}

// POST /api/sites/[id]/devices — body: { brand, model, unit_number?, serial_number?, delivery_date?, warranty_until? }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const str = (key: string) => (typeof body[key] === 'string' && (body[key] as string).trim()) || null
  const brand = str('brand')
  const model = str('model')
  if (!brand || !model) return NextResponse.json({ error: 'brand en model zijn verplicht' }, { status: 400 })

  try {
    const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, id))
    if (!site) return NextResponse.json({ error: 'Locatie niet gevonden' }, { status: 404 })

    const [row] = await db.insert(devices).values({
      id: `device-${randomUUID()}`,
      siteId: id,
      brand,
      model,
      serialNumber:  str('serial_number'),
      unitNumber:    str('unit_number'),
      deliveryDate:  str('delivery_date'),
      warrantyUntil: str('warranty_until'),
    }).returning()

    return NextResponse.json({ device: toDevice(row!) }, { status: 201 })
  } catch (error) {
    console.error('[api/sites/[id]/devices POST]', error)
    return NextResponse.json({ error: 'Toestel kon niet aangemaakt worden' }, { status: 500 })
  }
}
```

`app/api/technicians/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { technicians } from '@/lib/db/schema'

// GET /api/technicians — active users, ordered by name (used by the wizard's technician picker)
export async function GET() {
  try {
    const rows = await db
      .select({ id: technicians.id, name: technicians.name, initials: technicians.initials, role: technicians.role })
      .from(technicians)
      .where(eq(technicians.active, true))
      .orderBy(asc(technicians.name))
    return NextResponse.json({ technicians: rows })
  } catch (error) {
    console.error('[api/technicians GET]', error)
    return NextResponse.json({ error: 'Techniekers konden niet geladen worden' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests, type check, lint**

Run: `npx vitest run --config vitest.config.test.ts tests/api.lookups.test.ts 2>&1 | tail -10 && npx tsc --noEmit && npm run lint`
Expected: PASS 4 tests; tsc and lint clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/customers app/api/sites app/api/technicians tests/api.lookups.test.ts
git commit -m "feat(api): lookup routes for customers, sites, devices and technicians

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 7: Header fields on `Intervention` (ticket, customer number, contact, phones)

**Files:**
- Modify: `lib/server/interventions.ts` (`InterventionCoreRow`, `toIntervention`, `fetchInterventionRows`, add `fetchPrimaryContacts`)
- Test: `tests/interventions.optional-device.test.ts` (add one test)

**Interfaces:**
- Consumes: `Intervention` fields declared in Task 2.
- Produces: `getInterventionById` / `getTodayInterventions` return `ticketNumber`, `ticketDate`, `createdAt`, `customerNumber`, `invoiceCustomerNumber`, `sitePhones`, `closingDay`, `contactName`, `contactPhone`, `deviceUnitNumber`, `deviceSerial`, `deviceDeliveryDate`, `deviceWarrantyUntil`. The offline cache (`/api/sync/today`) gets them for free because it calls the same function.

- [ ] **Step 1: Write the failing test**

Append to `tests/interventions.optional-device.test.ts` inside the describe:

```ts
  it('exposes the Service Bon header fields', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const { workOrders, customers, sites, contacts, devices } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const { randomUUID } = await import('crypto')
    const { testDb } = await import('./setup')

    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    await testDb.update(workOrders).set({ ticketNumber: `TKT-${randomUUID().slice(0, 6)}`, ticketDate: new Date('2026-09-04T00:00:00Z') }).where(eq(workOrders.id, workOrderId))
    await testDb.update(customers).set({ customerNumber: 'K-HDR', invoiceCustomerNumber: 'K-INV' }).where(eq(customers.id, wo!.customerId))
    await testDb.update(sites).set({ phonePrimary: '056 12 34 56', phoneSecondary: '0470 12 34 56', closingDay: 'zondag' }).where(eq(sites.id, wo!.siteId))
    await testDb.insert(contacts).values({ id: `contact-${randomUUID()}`, siteId: wo!.siteId, name: 'Piet Contact', phone: '0499 00 11 22' })
    await testDb.update(devices).set({ unitNumber: 'U-9', deliveryDate: '2023-05-01', warrantyUntil: '2025-05-01' }).where(eq(devices.id, wo!.deviceId!))

    const intervention = await getInterventionById(workOrderId)

    expect(intervention?.ticketNumber).toMatch(/^TKT-/)
    expect(intervention?.ticketDate?.slice(0, 10)).toBe('2026-09-04')
    expect(intervention?.createdAt).toBeTruthy()
    expect(intervention?.customerNumber).toBe('K-HDR')
    expect(intervention?.invoiceCustomerNumber).toBe('K-INV')
    expect(intervention?.sitePhones).toEqual(['056 12 34 56', '0470 12 34 56'])
    expect(intervention?.closingDay).toBe('zondag')
    expect(intervention?.contactName).toBe('Piet Contact')
    expect(intervention?.contactPhone).toBe('0499 00 11 22')
    expect(intervention?.deviceUnitNumber).toBe('U-9')
    expect(intervention?.deviceSerial).toMatch(/^SN-/)
    expect(intervention?.deviceDeliveryDate).toBe('2023-05-01')
    expect(intervention?.deviceWarrantyUntil).toBe('2025-05-01')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config vitest.config.test.ts tests/interventions.optional-device.test.ts 2>&1 | tail -12`
Expected: FAIL on `ticketNumber` undefined.

- [ ] **Step 3: Extend the row type, the select and the mapper**

In `lib/server/interventions.ts`:

Add to `InterventionCoreRow`:

```ts
  customerNumber: string | null
  invoiceCustomerNumber: string | null
  sitePhonePrimary: string | null
  sitePhoneSecondary: string | null
  closingDay: string | null
  deviceUnitNumber: string | null
  deviceSerial: string | null
  deviceDeliveryDate: string | null
  deviceWarrantyUntil: string | null
  ticketNumber: string | null
  ticketDate: Date | null
  createdAt: Date | null
```

Add `contacts` to the schema import. Add after `fetchAssignmentsForWorkOrders`:

```ts
type PrimaryContact = { name: string; phone: string }

/** First contact (alphabetical) per site — printed as CONTACT on the bon. */
async function fetchPrimaryContacts(siteIds: string[]): Promise<Map<string, PrimaryContact>> {
  if (siteIds.length === 0) return new Map()
  const rows = await db
    .select({ siteId: contacts.siteId, name: contacts.name, phone: contacts.phone })
    .from(contacts)
    .where(inArray(contacts.siteId, siteIds))
    .orderBy(asc(contacts.name))
  const bySite = new Map<string, PrimaryContact>()
  for (const row of rows) {
    if (!bySite.has(row.siteId)) bySite.set(row.siteId, { name: row.name, phone: row.phone })
  }
  return bySite
}
```

Change `toIntervention` signature and body:

```ts
function toIntervention(
  row: InterventionCoreRow,
  techniciansForWorkOrder: InterventionTechnician[],
  contact: PrimaryContact | undefined,
): Intervention {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    customerNumber: row.customerNumber ?? undefined,
    invoiceCustomerNumber: row.invoiceCustomerNumber ?? undefined,
    siteId: row.siteId,
    siteName: row.siteName,
    siteAddress: row.siteAddress,
    siteCity: row.siteCity,
    siteLat: row.siteLat ?? undefined,
    siteLon: row.siteLon ?? undefined,
    sitePhones: [row.sitePhonePrimary, row.sitePhoneSecondary].filter((p): p is string => Boolean(p)),
    closingDay: row.closingDay ?? undefined,
    contactName: contact?.name,
    contactPhone: contact?.phone,
    deviceId: row.deviceId,
    deviceBrand: row.deviceBrand ?? undefined,
    deviceModel: row.deviceModel ?? undefined,
    deviceUnitNumber: row.deviceUnitNumber ?? undefined,
    deviceSerial: row.deviceSerial ?? undefined,
    deviceDeliveryDate: row.deviceDeliveryDate ?? undefined,
    deviceWarrantyUntil: row.deviceWarrantyUntil ?? undefined,
    ticketNumber: row.ticketNumber ?? undefined,
    ticketDate: row.ticketDate?.toISOString(),
    createdAt: row.createdAt?.toISOString(),
    plannedDate: row.plannedDate.toISOString(),
    status: row.status,
    type: row.type,
    description: row.description ?? undefined,
    estimatedMinutes: row.estimatedMinutes ?? undefined,
    isUrgent: row.isUrgent,
    planningVersion: row.planningVersion,
    source: row.source,
    technicians: techniciansForWorkOrder,
    statusOnderwegAt: row.statusOnderwegAt?.toISOString(),
    statusArrivedAt: row.statusArrivedAt?.toISOString(),
    statusOnderwegBy: row.statusOnderwegBy ?? undefined,
    createdBy: row.createdBy ?? undefined,
    visibleInPool: row.visibleInPool,
  }
}
```

In `fetchInterventionRows` add to the `.select({…})`:

```ts
      customerNumber: customers.customerNumber,
      invoiceCustomerNumber: customers.invoiceCustomerNumber,
      sitePhonePrimary: sites.phonePrimary,
      sitePhoneSecondary: sites.phoneSecondary,
      closingDay: sites.closingDay,
      deviceUnitNumber: devices.unitNumber,
      deviceSerial: devices.serialNumber,
      deviceDeliveryDate: devices.deliveryDate,
      deviceWarrantyUntil: devices.warrantyUntil,
      ticketNumber: workOrders.ticketNumber,
      ticketDate: workOrders.ticketDate,
      createdAt: workOrders.createdAt,
```

and replace the tail of the function:

```ts
  const assignmentsByWorkOrder = await fetchAssignmentsForWorkOrders(workOrderIds)
  const contactsBySite = await fetchPrimaryContacts([...new Set(rows.map(row => row.siteId))])

  return rows.map((row: InterventionCoreRow) =>
    toIntervention(row, assignmentsByWorkOrder.get(row.id) ?? [], contactsBySite.get(row.siteId)),
  )
```

- [ ] **Step 4: Run tests, type check, lint, commit**

```bash
npx vitest run --config vitest.config.test.ts tests/interventions.optional-device.test.ts 2>&1 | tail -10
npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -6
git add lib/server/interventions.ts tests/interventions.optional-device.test.ts
git commit -m "feat(interventions): expose Service Bon header fields on Intervention

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 8: Complete route — all werkbon fields, bon number, strict JSON

**Files:**
- Modify: `app/api/work-orders/[id]/complete/route.ts` (whole file)
- Test: `tests/api.complete.test.ts` (new)

**Interfaces:**
- Consumes: `werkbonnen` columns from Task 1.
- Produces: `POST /api/work-orders/[id]/complete` multipart fields:
  `changedBy`, `technicianId`, `deviceId`, `completionNotes`, `remarks`, `completionParts` (JSON), `followUp` (JSON), `workStart`, `workEnd`, `visitDate`, `arrivalTime`, `departureTime`, `interventionKind` (`week|weekend`), `tripCount`, `personCount`, `signature` (data URL), `pdf` (file). Response `{ ok, werkbonId, bonNumber, pdfPath }`. Malformed JSON → `400 { error: 'Ongeldige onderdelenlijst' }` / `'Ongeldige opvolglijst'`.

- [ ] **Step 1: Write the failing tests**

Create `tests/api.complete.test.ts`:

```ts
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as postComplete } from '@/app/api/work-orders/[id]/complete/route'
import { werkbonnen, workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, createTestTechnician, createTestWorkOrder, createTestWorkOrderWithoutDevice, testDb } from './setup'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }

function formReq(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new NextRequest('http://localhost/api/work-orders/x/complete', { method: 'POST', body: fd })
}

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('POST /api/work-orders/[id]/complete', () => {
  let ids: CleanupIds
  beforeEach(() => { ids = { work_order_ids: [], technician_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('stores every Service Bon field and generates bon numbers -01 then -02', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const techId = await createTestTechnician()
    ids.technician_ids?.push(techId)
    await testDb.update(workOrders).set({ ticketNumber: `TKT-${workOrderId.slice(-6)}` }).where(eq(workOrders.id, workOrderId))

    const fields = {
      changedBy: techId,
      technicianId: techId,
      completionNotes: 'Dichting vervangen',
      remarks: 'Volgende keer filter meenemen',
      completionParts: JSON.stringify([{ id: 'p1', code: 'A-1', description: 'Dichting', quantity: 2, toOrder: false, urgent: false }]),
      followUp: '[]',
      visitDate: '2026-09-05T00:00:00.000Z',
      arrivalTime: '2026-09-05T08:30:00.000Z',
      departureTime: '2026-09-05T10:15:00.000Z',
      workStart: '2026-09-05T08:40:00.000Z',
      workEnd: '2026-09-05T10:05:00.000Z',
      interventionKind: 'week',
      tripCount: '1',
      personCount: '2',
      signature: SIGNATURE,
    }

    const first = await postComplete(formReq(fields), ctx(workOrderId))
    const firstJson = await first.json() as { ok: boolean; werkbonId: string; bonNumber: string }
    expect(first.status).toBe(200)
    expect(firstJson.bonNumber).toBe(`TKT-${workOrderId.slice(-6)}-01`)

    const [row] = await testDb.select().from(werkbonnen).where(eq(werkbonnen.id, firstJson.werkbonId))
    expect(row).toMatchObject({
      bonNumber: firstJson.bonNumber,
      technicianId: techId,
      notes: 'Dichting vervangen',
      remarks: 'Volgende keer filter meenemen',
      interventionKind: 'week',
      tripCount: 1,
      personCount: 2,
      signatureData: SIGNATURE,
    })
    expect(row?.arrivalTime?.toISOString()).toBe('2026-09-05T08:30:00.000Z')
    expect(row?.departureTime?.toISOString()).toBe('2026-09-05T10:15:00.000Z')
    expect(row?.visitDate?.toISOString().slice(0, 10)).toBe('2026-09-05')
    expect(row?.parts).toHaveLength(1)

    const second = await postComplete(formReq(fields), ctx(workOrderId))
    const secondJson = await second.json() as { bonNumber: string }
    expect(secondJson.bonNumber).toBe(`TKT-${workOrderId.slice(-6)}-02`)

    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    expect(wo?.status).toBe('afgewerkt')
  })

  it('falls back to the work order id as bon prefix when there is no ticket number', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const res = await postComplete(formReq({ completionNotes: 'x' }), ctx(workOrderId))
    const json = await res.json() as { bonNumber: string }
    expect(json.bonNumber).toBe(`${workOrderId}-01`)
  })

  it('fills the work order device when the werkbon names one and the work order had none', async () => {
    const workOrderId = await createTestWorkOrderWithoutDevice()
    ids.work_order_ids?.push(workOrderId)
    const donor = await createTestWorkOrder()
    ids.work_order_ids?.push(donor)
    const [donorRow] = await testDb.select().from(workOrders).where(eq(workOrders.id, donor))

    const res = await postComplete(formReq({ deviceId: donorRow!.deviceId! }), ctx(workOrderId))
    expect(res.status).toBe(200)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    expect(wo?.deviceId).toBe(donorRow!.deviceId)
  })

  it('returns 400 on malformed parts or follow-up JSON instead of storing null', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const badParts = await postComplete(formReq({ completionParts: 'GEEN_JSON' }), ctx(workOrderId))
    expect(badParts.status).toBe(400)
    expect(await badParts.json()).toMatchObject({ error: 'Ongeldige onderdelenlijst' })

    const badFollowUp = await postComplete(formReq({ followUp: '{oops' }), ctx(workOrderId))
    expect(badFollowUp.status).toBe(400)

    const rows = await testDb.select().from(werkbonnen).where(eq(werkbonnen.workOrderId, workOrderId))
    expect(rows).toHaveLength(0)
  })

  it('returns 404 for an unknown work order', async () => {
    const res = await postComplete(formReq({ completionNotes: 'x' }), ctx('wo-does-not-exist'))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --config vitest.config.test.ts tests/api.complete.test.ts 2>&1 | tail -15`
Expected: FAIL (`bonNumber` undefined, 400 tests get 200).

- [ ] **Step 3: Rewrite the complete route**

Replace the whole of `app/api/work-orders/[id]/complete/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { db } from '@/lib/db'
import { workOrders, werkbonnen } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import type { PdfFollowUp, PdfPart } from '@/lib/pdf'
import type { InterventionKind } from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function str(fd: FormData, key: string): string | null {
  const value = fd.get(key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function date(fd: FormData, key: string): Date | null {
  const raw = str(fd, key)
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function int(fd: FormData, key: string): number | null {
  const raw = str(fd, key)
  if (raw === null) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

/** Parse a JSON list field. Returns `{ error }` when the JSON is malformed — the caller answers 400. */
function jsonList<T>(fd: FormData, key: string): { value: T[] | null } | { error: true } {
  const raw = str(fd, key)
  if (!raw) return { value: null }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? { value: parsed as T[] } : { error: true }
  } catch {
    return { error: true }
  }
}

// ── POST /api/work-orders/[id]/complete ──────────────────────────────────────
// Multipart form from the werkbon. Creates ONE new werkbonnen row per submit
// (never overwrites), numbers it `${ticket}-NN`, stores the PDF, and marks the
// work order afgewerkt.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const fd = await req.formData()

  const partsResult    = jsonList<PdfPart>(fd, 'completionParts')
  if ('error' in partsResult)    return NextResponse.json({ error: 'Ongeldige onderdelenlijst' }, { status: 400 })
  const followUpResult = jsonList<PdfFollowUp>(fd, 'followUp')
  if ('error' in followUpResult) return NextResponse.json({ error: 'Ongeldige opvolglijst' }, { status: 400 })

  const kindRaw = str(fd, 'interventionKind')
  if (kindRaw && kindRaw !== 'week' && kindRaw !== 'weekend') {
    return NextResponse.json({ error: 'interventionKind moet week of weekend zijn' }, { status: 400 })
  }

  const changedBy = str(fd, 'changedBy')
  const deviceId  = str(fd, 'deviceId')
  const pdfFile   = fd.get('pdf') as File | null
  const werkbonId = crypto.randomUUID()

  const [existing] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, id))
  if (!existing) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  let pdfPath: string | null = null
  if (pdfFile && pdfFile.size > 0) {
    const buffer    = Buffer.from(await pdfFile.arrayBuffer())
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'werkbonnen')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(join(uploadDir, `${werkbonId}.pdf`), buffer)
    pdfPath = `/api/uploads/werkbonnen/${werkbonId}.pdf`
  }

  const bonNumber = await withAudit(changedBy, async (tx) => {
    // Lock the work order row so two simultaneous submits cannot both become -01.
    const [wo] = await tx
      .select({ id: workOrders.id, ticketNumber: workOrders.ticketNumber, deviceId: workOrders.deviceId })
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .for('update')

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(werkbonnen)
      .where(eq(werkbonnen.workOrderId, id))

    const prefix = wo!.ticketNumber ?? wo!.id
    const number = `${prefix}-${String(count + 1).padStart(2, '0')}`

    await tx.insert(werkbonnen).values({
      id:               werkbonId,
      workOrderId:      id,
      bonNumber:        number,
      technicianId:     str(fd, 'technicianId'),
      deviceId:         deviceId ?? wo!.deviceId,
      visitDate:        date(fd, 'visitDate'),
      arrivalTime:      date(fd, 'arrivalTime'),
      departureTime:    date(fd, 'departureTime'),
      workStart:        date(fd, 'workStart'),
      workEnd:          date(fd, 'workEnd'),
      interventionKind: (kindRaw as InterventionKind | null),
      tripCount:        int(fd, 'tripCount'),
      personCount:      int(fd, 'personCount'),
      notes:            str(fd, 'completionNotes'),
      remarks:          str(fd, 'remarks'),
      parts:            partsResult.value,
      followUp:         followUpResult.value,
      signatureData:    str(fd, 'signature'),
      pdfPath,
      changedBy,
    })

    await tx
      .update(workOrders)
      .set({
        status: 'afgewerkt',
        ...(deviceId && !wo!.deviceId ? { deviceId } : {}),
      })
      .where(eq(workOrders.id, id))

    return number
  })

  return NextResponse.json({ ok: true, werkbonId, bonNumber, pdfPath })
}
```

- [ ] **Step 4: Run tests, then the whole suite**

Run: `npx vitest run --config vitest.config.test.ts tests/api.complete.test.ts 2>&1 | tail -12 && npm test 2>&1 | tail -6`
Expected: PASS 5 tests, suite green. If `.for('update')` is not available on the select builder in this Drizzle version, replace that select with `await tx.execute(sql\`select id, ticket_number, device_id from work_orders where id = ${id} for update\`)` and read `rows[0]` with the snake_case keys.

- [ ] **Step 5: Type check, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add "app/api/work-orders/[id]/complete/route.ts" tests/api.complete.test.ts
git commit -m "feat(werkbon): store all Service Bon fields, bon number sequence, strict JSON

The complete route now records visit date, arrival/departure, week or
weekend, trips, persons, remarks, technician, device and the signature.
Bon numbers are ticket-NN, generated under a row lock. Malformed parts or
follow-up JSON returns 400 instead of silently storing null.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 9: Manual wizard with real data and inline "nieuw" forms

**Files:**
- Rewrite: `app/werkbon/nieuw/page.tsx`
- Create: `components/NewWorkOrder/NewCustomerForm.tsx`, `NewSiteForm.tsx`, `NewDeviceForm.tsx`, `TicketForm.tsx`, `Field.tsx`
- Modify: `components/DayView/DayView.tsx` header (add "+" button to `/werkbon/nieuw`)
- No vitest for React components in this repo; verification is `tsc`, `lint`, and a manual walkthrough on `npm run dev`.

**Interfaces:**
- Consumes: `GET /api/customers?q=`, `GET /api/customers/[id]/sites`, `GET /api/sites/[id]/devices`, `GET /api/technicians` (Task 6); `POST /api/work-orders` (Task 4) with the snake_case body from Task 3.
- Produces: a working `/werkbon/nieuw` that ends on `/interventions/[id]`.

- [ ] **Step 1: Create the shared `Field` input wrapper**

`components/NewWorkOrder/Field.tsx`:

```tsx
interface Props {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

/** Label + input + optional error, styled for gloves: big text, tall rows. */
export default function Field({ label, required, error, children }: Props) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">
        {label}{required && <span className="text-brand-orange"> *</span>}
      </span>
      {children}
      {error && <span className="block mt-1 text-xs font-semibold text-brand-red">{error}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl px-3 py-3 text-base bg-surface border border-stroke text-ink outline-none focus:border-brand-orange'
```

- [ ] **Step 2: Create the three "nieuw" forms**

`components/NewWorkOrder/NewCustomerForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Field, { inputClass } from './Field'

/** Draft of a customer that does not exist yet. Created on the server by createWorkOrder. */
export interface NewCustomerDraft {
  number: string
  invoiceNumber: string
  name: string
  address: string
  postalCode: string
  city: string
  phone: string
  contact: string
  contactPhone: string
  closingDay: string
}

export const EMPTY_CUSTOMER: NewCustomerDraft = {
  number: '', invoiceNumber: '', name: '', address: '', postalCode: '', city: '',
  phone: '', contact: '', contactPhone: '', closingDay: '',
}

interface Props {
  onSubmit: (draft: NewCustomerDraft) => void
  onCancel: () => void
}

export default function NewCustomerForm({ onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<NewCustomerDraft>(EMPTY_CUSTOMER)
  const [touched, setTouched] = useState(false)

  const set = (key: keyof NewCustomerDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(prev => ({ ...prev, [key]: e.target.value }))

  const missing = (key: keyof NewCustomerDraft) => touched && !draft[key].trim() ? 'Verplicht' : undefined
  const valid = ['number', 'name', 'address', 'city'].every(k => draft[k as keyof NewCustomerDraft].trim())

  return (
    <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
      <p className="font-bold text-base text-ink">Nieuwe klant</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Klant nr L" required error={missing('number')}>
          <input className={inputClass} value={draft.number} onChange={set('number')} placeholder="K04647" />
        </Field>
        <Field label="Klant nr F">
          <input className={inputClass} value={draft.invoiceNumber} onChange={set('invoiceNumber')} placeholder="indien anders" />
        </Field>
      </div>
      <Field label="Naam" required error={missing('name')}>
        <input className={inputClass} value={draft.name} onChange={set('name')} />
      </Field>
      <Field label="Adres" required error={missing('address')}>
        <input className={inputClass} value={draft.address} onChange={set('address')} />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Field label="Postcode">
          <input className={inputClass} inputMode="numeric" value={draft.postalCode} onChange={set('postalCode')} />
        </Field>
        <Field label="Gemeente" required error={missing('city')}>
          <input className={inputClass} value={draft.city} onChange={set('city')} />
        </Field>
      </div>
      <Field label="Tel & GSM">
        <input className={inputClass} inputMode="tel" value={draft.phone} onChange={set('phone')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact">
          <input className={inputClass} value={draft.contact} onChange={set('contact')} />
        </Field>
        <Field label="Tel contact">
          <input className={inputClass} inputMode="tel" value={draft.contactPhone} onChange={set('contactPhone')} />
        </Field>
      </div>
      <Field label="Sluitingsdag">
        <input className={inputClass} value={draft.closingDay} onChange={set('closingDay')} placeholder="bv. maandag" />
      </Field>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surface text-ink border border-stroke">Annuleer</button>
        <button
          type="button"
          onClick={() => { setTouched(true); if (valid) onSubmit(draft) }}
          className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-brand-orange disabled:opacity-50"
        >
          Klant gebruiken
        </button>
      </div>
    </div>
  )
}
```

`components/NewWorkOrder/NewSiteForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Field, { inputClass } from './Field'

export interface NewSiteDraft {
  name: string
  address: string
  postalCode: string
  city: string
  phone: string
}

interface Props {
  defaultName: string
  onSubmit: (draft: NewSiteDraft) => void
  onCancel: () => void
}

export default function NewSiteForm({ defaultName, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<NewSiteDraft>({ name: defaultName, address: '', postalCode: '', city: '', phone: '' })
  const [touched, setTouched] = useState(false)
  const set = (key: keyof NewSiteDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(prev => ({ ...prev, [key]: e.target.value }))
  const missing = (key: keyof NewSiteDraft) => touched && !draft[key].trim() ? 'Verplicht' : undefined
  const valid = draft.address.trim() && draft.city.trim()

  return (
    <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
      <p className="font-bold text-base text-ink">Nieuwe locatie</p>
      <Field label="Naam locatie">
        <input className={inputClass} value={draft.name} onChange={set('name')} />
      </Field>
      <Field label="Adres" required error={missing('address')}>
        <input className={inputClass} value={draft.address} onChange={set('address')} />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Field label="Postcode"><input className={inputClass} inputMode="numeric" value={draft.postalCode} onChange={set('postalCode')} /></Field>
        <Field label="Gemeente" required error={missing('city')}><input className={inputClass} value={draft.city} onChange={set('city')} /></Field>
      </div>
      <Field label="Tel"><input className={inputClass} inputMode="tel" value={draft.phone} onChange={set('phone')} /></Field>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surface text-ink border border-stroke">Annuleer</button>
        <button type="button" onClick={() => { setTouched(true); if (valid) onSubmit(draft) }} className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-brand-blue">Locatie gebruiken</button>
      </div>
    </div>
  )
}
```

`components/NewWorkOrder/NewDeviceForm.tsx` (also used by the on-site picker in Task 11):

```tsx
'use client'

import { useState } from 'react'
import Field, { inputClass } from './Field'

export interface NewDeviceDraft {
  unitNumber: string
  brand: string
  model: string
  serialNumber: string
  deliveryDate: string   // yyyy-mm-dd
  warrantyUntil: string  // yyyy-mm-dd
}

interface Props {
  onSubmit: (draft: NewDeviceDraft) => void
  onCancel: () => void
  submitLabel?: string
}

export default function NewDeviceForm({ onSubmit, onCancel, submitLabel = 'Toestel gebruiken' }: Props) {
  const [draft, setDraft] = useState<NewDeviceDraft>({ unitNumber: '', brand: '', model: '', serialNumber: '', deliveryDate: '', warrantyUntil: '' })
  const [touched, setTouched] = useState(false)
  const set = (key: keyof NewDeviceDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(prev => ({ ...prev, [key]: e.target.value }))
  const missing = (key: keyof NewDeviceDraft) => touched && !draft[key].trim() ? 'Verplicht' : undefined
  const valid = draft.brand.trim() && draft.model.trim()

  return (
    <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
      <p className="font-bold text-base text-ink">Nieuw toestel</p>
      <Field label="Unit nr"><input className={inputClass} value={draft.unitNumber} onChange={set('unitNumber')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Merk" required error={missing('brand')}><input className={inputClass} value={draft.brand} onChange={set('brand')} placeholder="Berner" /></Field>
        <Field label="Model" required error={missing('model')}><input className={inputClass} value={draft.model} onChange={set('model')} /></Field>
      </div>
      <Field label="Serienummer"><input className={inputClass} value={draft.serialNumber} onChange={set('serialNumber')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Leverdatum"><input type="date" className={inputClass} value={draft.deliveryDate} onChange={set('deliveryDate')} /></Field>
        <Field label="Garantie tot"><input type="date" className={inputClass} value={draft.warrantyUntil} onChange={set('warrantyUntil')} /></Field>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-sm bg-surface text-ink border border-stroke">Annuleer</button>
        <button type="button" onClick={() => { setTouched(true); if (valid) onSubmit(draft) }} className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-brand-green">{submitLabel}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create the ticket step form**

`components/NewWorkOrder/TicketForm.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Field, { inputClass } from './Field'

export interface TicketDraft {
  ticketNumber: string
  ticketDate: string     // yyyy-mm-dd
  plannedDate: string    // yyyy-mm-dd
  description: string
  isUrgent: boolean
  technicianIds: string[]
}

interface TechnicianOption { id: string; name: string; initials: string; role: string }

interface Props {
  submitting: boolean
  serverError: { field?: string; message: string } | null
  onSubmit: (draft: TicketDraft) => void
}

function today(): string { return new Date().toISOString().slice(0, 10) }

export default function TicketForm({ submitting, serverError, onSubmit }: Props) {
  const [draft, setDraft] = useState<TicketDraft>({
    ticketNumber: '', ticketDate: today(), plannedDate: today(), description: '', isUrgent: false, technicianIds: [],
  })
  const [touched, setTouched] = useState(false)
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([])

  useEffect(() => {
    fetch('/api/technicians')
      .then(r => r.ok ? r.json() : { technicians: [] })
      .then((data: { technicians: TechnicianOption[] }) => setTechnicians(data.technicians.filter(t => t.role === 'technician')))
      .catch(() => setTechnicians([]))
  }, [])

  const missing = (key: 'ticketNumber' | 'plannedDate' | 'description') =>
    touched && !draft[key].trim() ? 'Verplicht' : undefined
  const fieldError = (wire: string) => serverError?.field === wire ? serverError.message : undefined
  const valid = draft.ticketNumber.trim() && draft.plannedDate && draft.description.trim()

  function toggleTechnician(id: string) {
    setDraft(prev => ({
      ...prev,
      technicianIds: prev.technicianIds.includes(id) ? prev.technicianIds.filter(t => t !== id) : [...prev.technicianIds, id],
    }))
  }

  return (
    <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
      <p className="font-bold text-base text-ink">Ticket</p>
      <Field label="Ticket nr" required error={missing('ticketNumber') ?? fieldError('ticket_number')}>
        <input className={`${inputClass} font-mono`} value={draft.ticketNumber} onChange={e => setDraft(p => ({ ...p, ticketNumber: e.target.value }))} placeholder="TKT20/12752" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Datum ticket">
          <input type="date" className={inputClass} value={draft.ticketDate} onChange={e => setDraft(p => ({ ...p, ticketDate: e.target.value }))} />
        </Field>
        <Field label="Geplande datum" required error={missing('plannedDate') ?? fieldError('planned_date')}>
          <input type="date" className={inputClass} value={draft.plannedDate} onChange={e => setDraft(p => ({ ...p, plannedDate: e.target.value }))} />
        </Field>
      </div>
      <Field label="Omschrijving klant" required error={missing('description') ?? fieldError('description')}>
        <textarea rows={4} className={`${inputClass} resize-none`} value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} placeholder="Nazicht / herstel ..." />
      </Field>
      <button
        type="button"
        onClick={() => setDraft(p => ({ ...p, isUrgent: !p.isUrgent }))}
        className={`w-full py-3 rounded-xl font-bold text-sm border ${draft.isUrgent ? 'bg-brand-red text-white border-brand-red' : 'bg-surface text-ink border-stroke'}`}
      >
        {draft.isUrgent ? '⚠ Dringend' : 'Niet dringend'}
      </button>
      {technicians.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Technieker(s)</p>
          <div className="flex flex-wrap gap-2">
            {technicians.map(t => {
              const active = draft.technicianIds.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => toggleTechnician(t.id)}
                  className={`px-3 py-2 rounded-full text-sm font-semibold border ${active ? 'bg-brand-orange text-white border-brand-orange' : 'bg-surface text-ink border-stroke'}`}>
                  {t.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {serverError && !serverError.field && (
        <p className="text-sm font-semibold text-brand-red">{serverError.message}</p>
      )}
      <button
        type="button"
        disabled={submitting}
        onClick={() => { setTouched(true); if (valid) onSubmit(draft) }}
        className="w-full py-4 rounded-xl font-bold text-white text-base bg-brand-orange disabled:opacity-60"
      >
        {submitting ? 'Aanmaken...' : 'Werkbon aanmaken'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite the wizard page**

Replace `app/werkbon/nieuw/page.tsx` entirely:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Customer, Site, Device, Contact } from '@/types'
import CustomerSelect from '@/components/CustomerSelect'
import SiteSelect from '@/components/SiteSelect'
import DeviceSelect from '@/components/DeviceSelect'
import NewCustomerForm, { type NewCustomerDraft } from '@/components/NewWorkOrder/NewCustomerForm'
import NewSiteForm, { type NewSiteDraft } from '@/components/NewWorkOrder/NewSiteForm'
import NewDeviceForm, { type NewDeviceDraft } from '@/components/NewWorkOrder/NewDeviceForm'
import TicketForm, { type TicketDraft } from '@/components/NewWorkOrder/TicketForm'
import { inputClass } from '@/components/NewWorkOrder/Field'
import { useTasks } from '@/lib/task-store'

type Screen = 'customer' | 'site' | 'device' | 'ticket'

const STEPS: Record<Screen, number> = { customer: 1, site: 2, device: 3, ticket: 4 }
const STEP_LABELS: Record<Screen, string> = {
  customer: 'Selecteer klant',
  site:     'Selecteer locatie',
  device:   'Selecteer toestel',
  ticket:   'Ticket',
}

type SiteWithContacts = Site & { contacts: Contact[] }

/** Either an existing record picked from the list, or a draft typed in the "nieuw" form. */
type Picked<T, D> = { kind: 'existing'; value: T } | { kind: 'new'; value: D }

function BossuytLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <text x="1"  y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="1"  y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
    </svg>
  )
}

export default function NieuwWerkbon() {
  const router = useRouter()
  const { currentUser } = useTasks()

  const [screen, setScreen] = useState<Screen>('customer')
  const [customer, setCustomer] = useState<Picked<Customer, NewCustomerDraft> | null>(null)
  const [site, setSite]         = useState<Picked<SiteWithContacts, NewSiteDraft> | null>(null)
  const [device, setDevice]     = useState<Picked<Device, NewDeviceDraft> | 'none' | null>(null)

  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sites, setSites] = useState<SiteWithContacts[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<{ field?: string; message: string } | null>(null)

  // Customer search, debounced 300 ms
  useEffect(() => {
    if (screen !== 'customer') return
    const handle = window.setTimeout(() => {
      setLoading(true)
      fetch(`/api/customers?q=${encodeURIComponent(query)}`)
        .then(r => r.ok ? r.json() : { customers: [] })
        .then((data: { customers: Customer[] }) => setCustomers(data.customers))
        .catch(() => setCustomers([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => window.clearTimeout(handle)
  }, [query, screen])

  // Sites for an existing customer
  useEffect(() => {
    if (screen !== 'site' || customer?.kind !== 'existing') return
    setLoading(true)
    fetch(`/api/customers/${customer.value.id}/sites`)
      .then(r => r.ok ? r.json() : { sites: [] })
      .then((data: { sites: SiteWithContacts[] }) => setSites(data.sites))
      .catch(() => setSites([]))
      .finally(() => setLoading(false))
  }, [screen, customer])

  // Devices for an existing site
  useEffect(() => {
    if (screen !== 'device' || site?.kind !== 'existing') return
    setLoading(true)
    fetch(`/api/sites/${site.value.id}/devices`)
      .then(r => r.ok ? r.json() : { devices: [] })
      .then((data: { devices: Device[] }) => setDevices(data.devices))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false))
  }, [screen, site])

  function pickCustomer(value: Picked<Customer, NewCustomerDraft>) {
    setCustomer(value)
    setShowNew(false)
    // A brand-new customer has exactly one address: skip the site step.
    if (value.kind === 'new') { setSite(null); setScreen('device') } else { setScreen('site') }
  }

  function pickSite(value: Picked<SiteWithContacts, NewSiteDraft>) {
    setSite(value); setShowNew(false); setScreen('device')
  }

  function pickDevice(value: Picked<Device, NewDeviceDraft> | 'none') {
    setDevice(value); setShowNew(false); setScreen('ticket')
  }

  function handleBack() {
    setShowNew(false)
    setServerError(null)
    if (screen === 'site')   { setCustomer(null); setScreen('customer') }
    if (screen === 'device') { setSite(null); setScreen(customer?.kind === 'new' ? 'customer' : 'site') }
    if (screen === 'ticket') { setDevice(null); setScreen('device') }
  }

  /** Build the snake_case body that POST /api/work-orders expects (same shape as the ERP route). */
  function buildBody(ticket: TicketDraft): Record<string, unknown> {
    if (!customer) throw new Error('no customer')

    const customerBody = customer.kind === 'existing'
      ? {
          number: customer.value.customerNumber ?? customer.value.id,
          invoice_number: customer.value.invoiceCustomerNumber,
          name: customer.value.name,
          address: customer.value.address,
          city: customer.value.city,
          phone: customer.value.phone,
        }
      : {
          number: customer.value.number,
          invoice_number: customer.value.invoiceNumber,
          name: customer.value.name,
          address: customer.value.address,
          postal_code: customer.value.postalCode,
          city: customer.value.city,
          phone: customer.value.phone,
          contact: customer.value.contact,
          contact_phone: customer.value.contactPhone,
          closing_day: customer.value.closingDay,
        }

    const siteBody = site?.kind === 'existing'
      ? { name: site.value.name, address: site.value.address, city: site.value.city }
      : site?.kind === 'new'
        ? { name: site.value.name, address: site.value.address, postal_code: site.value.postalCode, city: site.value.city }
        : undefined

    const deviceBody = device === 'none' || device === null
      ? null
      : device.kind === 'existing'
        ? { unit_number: device.value.unitNumber, brand: device.value.brand, model: device.value.model, serial_number: device.value.serialNumber }
        : { unit_number: device.value.unitNumber, brand: device.value.brand, model: device.value.model, serial_number: device.value.serialNumber, delivery_date: device.value.deliveryDate, warranty_until: device.value.warrantyUntil }

    return {
      ticket_number: ticket.ticketNumber,
      ticket_date: ticket.ticketDate,
      planned_date: ticket.plannedDate,
      description: ticket.description,
      is_urgent: ticket.isUrgent,
      customer: customerBody,
      site: siteBody,
      device: deviceBody,
      technician_ids: ticket.technicianIds,
      created_by: currentUser.id,
    }
  }

  async function submit(ticket: TicketDraft) {
    setSubmitting(true)
    setServerError(null)
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildBody(ticket)),
      })
      const json = await res.json() as { id?: string; error?: string; field?: string }
      if (res.status === 201 && json.id) {
        router.push(`/interventions/${json.id}`)
        return
      }
      if (res.status === 409 && json.id) {
        setServerError({ field: 'ticket_number', message: 'Ticket bestaat al — tik hier om te openen' })
        return
      }
      setServerError({ field: json.field, message: json.error ?? 'Aanmaken mislukt' })
    } catch {
      setServerError({ message: 'Geen verbinding — probeer opnieuw' })
    } finally {
      setSubmitting(false)
    }
  }

  const currentStep = STEPS[screen]
  const customerName = customer?.value.name
  const siteName = site?.value.name
  const deviceName = device && device !== 'none' ? `${device.value.brand} ${device.value.model}` : device === 'none' ? 'Geen toestel' : undefined

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-dark px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuytLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide text-white">bossuyt</p>
            <p className="text-xs leading-tight text-ink-soft">nieuwe werkbon</p>
          </div>
        </div>
        <button
          onClick={() => (screen === 'customer' ? router.push('/') : handleBack())}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-mid text-white"
        >
          ← Terug
        </button>
      </header>

      <div className="bg-brand-dark border-b border-brand-mid px-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          {([1, 2, 3, 4] as const).map(step => (
            <div key={step} className={`h-1 rounded-full flex-1 transition-all ${step <= currentStep ? 'bg-brand-orange' : 'bg-brand-mid'}`} />
          ))}
        </div>
        <p className="text-xs text-ink-soft">
          Stap {currentStep} van 4 — <span className="text-white">{STEP_LABELS[screen]}</span>
        </p>
      </div>

      {(customerName || siteName || deviceName) && (
        <div className="px-4 py-2 flex items-center gap-2 text-xs flex-wrap bg-stroke">
          {customerName && <span className="font-medium text-ink">{customerName}</span>}
          {siteName && <><span className="text-ink-faint">›</span><span className="font-medium text-ink">{siteName}</span></>}
          {deviceName && <><span className="text-ink-faint">›</span><span className="font-medium text-ink">{deviceName}</span></>}
        </div>
      )}

      <main className="px-4 py-4 flex flex-col gap-3 pb-8">
        {screen === 'customer' && (
          <>
            <input
              className={inputClass}
              placeholder="Zoek op naam of klantnummer"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            {showNew
              ? <NewCustomerForm onSubmit={draft => pickCustomer({ kind: 'new', value: draft })} onCancel={() => setShowNew(false)} />
              : (
                <>
                  {loading && <p className="text-sm text-ink-soft px-1">Laden…</p>}
                  <CustomerSelect customers={customers} onSelect={c => pickCustomer({ kind: 'existing', value: c })} />
                  <button type="button" onClick={() => setShowNew(true)} className="w-full py-3 rounded-xl font-bold text-sm border border-dashed border-brand-orange text-brand-orange bg-white">
                    + Nieuwe klant
                  </button>
                </>
              )}
          </>
        )}

        {screen === 'site' && customer?.kind === 'existing' && (
          showNew
            ? <NewSiteForm defaultName={customer.value.name} onSubmit={draft => pickSite({ kind: 'new', value: draft })} onCancel={() => setShowNew(false)} />
            : (
              <>
                {loading && <p className="text-sm text-ink-soft px-1">Laden…</p>}
                <SiteSelect customer={customer.value} sites={sites} onSelect={s => pickSite({ kind: 'existing', value: s as SiteWithContacts })} />
                <button type="button" onClick={() => setShowNew(true)} className="w-full py-3 rounded-xl font-bold text-sm border border-dashed border-brand-blue text-brand-blue bg-white">
                  + Nieuwe locatie
                </button>
              </>
            )
        )}

        {screen === 'device' && (
          showNew
            ? <NewDeviceForm onSubmit={draft => pickDevice({ kind: 'new', value: draft })} onCancel={() => setShowNew(false)} />
            : (
              <>
                {loading && <p className="text-sm text-ink-soft px-1">Laden…</p>}
                {site?.kind === 'existing' && (
                  <DeviceSelect site={site.value} devices={devices} onSelect={d => pickDevice({ kind: 'existing', value: d })} />
                )}
                <button type="button" onClick={() => setShowNew(true)} className="w-full py-3 rounded-xl font-bold text-sm border border-dashed border-brand-green text-brand-green bg-white">
                  + Nieuw toestel
                </button>
                <button type="button" onClick={() => pickDevice('none')} className="w-full py-3 rounded-xl font-bold text-sm bg-surface text-ink border border-stroke">
                  Geen toestel gekend
                </button>
              </>
            )
        )}

        {screen === 'ticket' && (
          <TicketForm submitting={submitting} serverError={serverError} onSubmit={submit} />
        )}
      </main>
    </div>
  )
}
```

Note: `SiteSelect` expects `Site[]`; `SiteWithContacts` extends `Site`, so passing `sites` is fine, and the `onSelect` cast keeps the contacts.

- [ ] **Step 5: Add the entry point in the day view header**

In `components/DayView/DayView.tsx`, inside the header's right-hand `<div className="flex items-center gap-3">` (line ~156), insert **before** the existing settings button:

```tsx
          <button
            type="button"
            onClick={() => router.push('/werkbon/nieuw')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-mid text-white text-xl font-bold active:opacity-80"
            aria-label="Nieuwe werkbon"
          >
            +
          </button>
```

`router` is already available in DayView (`useRouter` is imported and used at line 303).

- [ ] **Step 6: Type check, lint, manual walkthrough**

```bash
npx tsc --noEmit && npm run lint
ss -tlnp | grep ':3000' || true
```
If port 3000 is free, start `npm run dev -- --hostname 0.0.0.0` in the background, then in a browser (or `curl -s localhost:3000/werkbon/nieuw | head -c 300` for a smoke check) walk through: search "Molenhoeve" (nothing yet) → "+ Nieuwe klant" → fill K04647 / Molenhoeve group bvba / Van den nestlaan 132 / 2520 / Broechem → "Geen toestel gekend" → ticket TKT20/12752, 2026-09-04, 2026-09-05, description → "Werkbon aanmaken" → lands on `/interventions/wo-…`. Then run it a second time with the same ticket and confirm the red "Ticket bestaat al" under the ticket field. Stop the dev server afterwards. Record what you saw in the task report.

- [ ] **Step 7: Commit**

```bash
git add app/werkbon/nieuw/page.tsx components/NewWorkOrder components/DayView/DayView.tsx
git commit -m "feat(wizard): create work orders from the app with real data

The nieuwe-werkbon wizard now searches customers, lists sites and
devices from the API, offers inline 'nieuw' forms on every step, adds a
ticket step and posts to /api/work-orders. Day view gets a + button.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 10: IndexedDB werkbon draft store

**Files:**
- Modify: `lib/idb.ts` (`BossuytDB.werkbonnen` L36-39, `WerkbonCache` L65-73, `getDB` version + upgrade L132-179, `saveWerkbon`/`loadWerkbon` L251-260, add `deleteWerkbon`)

**Interfaces:**
- Produces:
  ```ts
  export interface WerkbonDraft { interventionId: string; form: WerkbonFormState; lastSavedAt: string }
  export async function saveWerkbon(interventionId: string, form: WerkbonFormState): Promise<void>
  export async function loadWerkbon(interventionId: string): Promise<WerkbonDraft | undefined>
  export async function deleteWerkbon(interventionId: string): Promise<void>
  ```
  `WerkbonFormState` is declared in `types/index.ts` here and used by Task 11.

- [ ] **Step 1: Declare the form state type**

Append to `types/index.ts` (after `InterventionKind`):

```ts
/** Everything the technician fills in on the werkbon. Persisted as a draft in IndexedDB. */
export interface WerkbonFormState {
  status: InterventionStatus | string
  deviceId: string | null
  technicianId: string | null
  visitDate: string            // yyyy-mm-dd
  arrivalTime: string          // ISO datetime or ''
  departureTime: string        // ISO datetime or ''
  workStart: string            // ISO datetime or ''
  workEnd: string              // ISO datetime or ''
  interventionKind: InterventionKind
  tripCount: number
  personCount: number
  notes: string                // TECHNICUS RAPPORT
  remarks: string              // OPMERKINGEN
  parts: import('@/lib/pdf').PdfPart[]
  signature: string | null     // data URL
}
```

- [ ] **Step 2: Replace the store definition and helpers**

In `lib/idb.ts`:

Import: `import type { Intervention, WerkbonFormState, WorkOrderPhotoDraft, WorkOrderPhotoSyncStatus } from '@/types'`.

Replace the `werkbonnen` entry in `BossuytDB`:

```ts
  werkbonnen: {
    key: string                 // intervention id (1-to-1 draft)
    value: WerkbonDraft
  }
```

Replace `WerkbonCache` with:

```ts
export interface WerkbonDraft {
  interventionId: string
  form: WerkbonFormState
  lastSavedAt: string
}
```

Bump the database version from `2` to `3` in `openDB<BossuytDB>('bossuyt-service', 3, {` and change the upgrade callback signature to `upgrade(db, oldVersion) {`. Replace the `werkbonnen` block inside `upgrade` with:

```ts
        // "werkbonnen" store — one draft per intervention.
        // v3 changed the record shape (WerkbonCache → WerkbonDraft); the old
        // store was never written to, so dropping it loses nothing.
        if (oldVersion < 3 && db.objectStoreNames.contains('werkbonnen')) {
          db.deleteObjectStore('werkbonnen')
        }
        if (!db.objectStoreNames.contains('werkbonnen')) {
          db.createObjectStore('werkbonnen', { keyPath: 'interventionId' })
        }
```

Replace `saveWerkbon` and `loadWerkbon` with:

```ts
/** Save the werkbon form as a draft — called (debounced) on every change so it survives a refresh or a dead battery. */
export async function saveWerkbon(interventionId: string, form: WerkbonFormState): Promise<void> {
  const db = await getDB()
  await db.put('werkbonnen', { interventionId, form, lastSavedAt: new Date().toISOString() })
}

/** Load the saved draft for an intervention, if any */
export async function loadWerkbon(interventionId: string): Promise<WerkbonDraft | undefined> {
  const db = await getDB()
  return db.get('werkbonnen', interventionId)
}

/** Remove the draft after a successful submit */
export async function deleteWerkbon(interventionId: string): Promise<void> {
  const db = await getDB()
  await db.delete('werkbonnen', interventionId)
}
```

- [ ] **Step 3: Type check, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/idb.ts types/index.ts
git commit -m "feat(idb): werkbon draft store (v3) keyed by intervention

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 11: Werkbon form in paper order, with draft autosave and device picker

**Files:**
- Create: `components/WerkbonForm/BonHeaderCard.tsx`, `components/WerkbonForm/VisitSection.tsx`, `components/WerkbonForm/DevicePicker.tsx`
- Rewrite: `components/WerkbonForm/index.tsx`
- Consumes: `WerkbonFormState` (Task 10), `saveWerkbon`/`loadWerkbon`/`deleteWerkbon` (Task 10), `NewDeviceForm` (Task 9), `POST /api/sites/[id]/devices` (Task 6), complete route fields (Task 8), `Intervention` header fields (Task 7).
- The PDF call in this task still uses the OLD `generateWerkbonPDF(PdfData)` signature; Task 12 switches it. Keep the mapping in one function `buildPdfData()` so Task 12 only edits that function.

**Interfaces:**
- Produces: `WerkbonForm` renders sections in this order: BonHeaderCard, status strip, Toestel (DevicePanel or DevicePicker), Omschrijving klant, Technicus rapport, Materialen, Bezoek, Opmerkingen, Foto's, Activiteiten, Akkoord van klant, submit.

- [ ] **Step 1: Create `BonHeaderCard`**

`components/WerkbonForm/BonHeaderCard.tsx`:

```tsx
import type { Intervention } from '@/types'
import Section from './Section'

interface Props {
  intervention: Intervention
  /** Preview of the number the server will assign: `${ticket}-NN` */
  bonNumberPreview: string
}

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-stroke last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value || '—'}</span>
    </div>
  )
}

/** Read-only top half of the paper bon: ticket, bon number and customer block. */
export default function BonHeaderCard({ intervention, bonNumberPreview }: Props) {
  const klantNr = intervention.invoiceCustomerNumber && intervention.invoiceCustomerNumber !== intervention.customerNumber
    ? `L ${intervention.customerNumber ?? '—'} · F ${intervention.invoiceCustomerNumber}`
    : intervention.customerNumber ?? '—'

  return (
    <Section title="SERVICE BON | BON DE SERVICE">
      <div className="grid grid-cols-2 gap-x-4 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-soft">Ticket n°</p>
          <p className="font-mono font-bold text-ink">{intervention.ticketNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-soft">Service bon n°</p>
          <p className="font-mono font-bold text-brand-orange">{bonNumberPreview}</p>
        </div>
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-ink-soft">Datum ticket</p>
          <p className="text-sm text-ink">{fmtDate(intervention.ticketDate ?? intervention.createdAt)}</p>
        </div>
      </div>
      <Row label="Klant n°" value={klantNr} />
      <Row label="Naam" value={intervention.customerName} />
      <Row label="Adres" value={`${intervention.siteAddress}, ${intervention.siteCity}`} />
      <Row label="Contact" value={intervention.contactName} />
      <Row label="Tel & GSM" value={[intervention.contactPhone, ...(intervention.sitePhones ?? [])].filter(Boolean).join(' · ')} />
      <Row label="Sluitingsdag" value={intervention.closingDay} />
    </Section>
  )
}
```

- [ ] **Step 2: Create `VisitSection`**

`components/WerkbonForm/VisitSection.tsx`:

```tsx
import type { InterventionKind, InterventionTechnician, WerkbonFormState } from '@/types'
import Section from './Section'

interface Props {
  form: WerkbonFormState
  technicians: InterventionTechnician[]
  onChange: <K extends keyof WerkbonFormState>(field: K, value: WerkbonFormState[K]) => void
}

function isoToHHMM(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Combine the visit date with an HH:MM string into an ISO datetime. */
function withTime(visitDate: string, hhmm: string): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const base = visitDate ? new Date(`${visitDate}T00:00:00`) : new Date()
  base.setHours(h, m, 0, 0)
  return base.toISOString()
}

const inputClass = 'w-full rounded-xl px-3 py-3 text-base bg-surface border border-stroke text-ink outline-none text-center font-bold'

/** Right-hand block of the paper bon: technicus, bezoekdatum, uren, week/weekend, ritten, personen. */
export default function VisitSection({ form, technicians, onChange }: Props) {
  function TimeField({ label, field }: { label: string; field: 'arrivalTime' | 'departureTime' | 'workStart' | 'workEnd' }) {
    return (
      <div className="rounded-xl p-3 bg-surface flex flex-col gap-2">
        <p className="text-xs text-ink-soft text-center">{label}</p>
        <input
          type="time"
          value={isoToHHMM(form[field])}
          onChange={e => onChange(field, withTime(form.visitDate, e.target.value))}
          className="w-full text-xl font-bold text-ink bg-transparent text-center outline-none"
        />
        <button type="button" onClick={() => onChange(field, new Date().toISOString())}
          className="w-full py-2 rounded-lg text-xs font-bold text-white bg-brand-blue">
          Nu
        </button>
      </div>
    )
  }

  return (
    <Section title="BEZOEK">
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Technicus | Technicien</span>
          <select
            value={form.technicianId ?? ''}
            onChange={e => onChange('technicianId', e.target.value || null)}
            className="w-full rounded-xl px-3 py-3 text-base bg-surface border border-stroke text-ink outline-none"
          >
            <option value="">—</option>
            {technicians.map(t => <option key={t.technicianId} value={t.technicianId}>{t.name}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Bezoekdatum | Date de la visite</span>
          <input type="date" value={form.visitDate}
            onChange={e => {
              const day = new Date(`${e.target.value}T12:00:00`).getDay()
              onChange('visitDate', e.target.value)
              onChange('interventionKind', day === 0 || day === 6 ? 'weekend' : 'week')
            }}
            className={inputClass} />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <TimeField label="Aankomstuur" field="arrivalTime" />
          <TimeField label="Vertrekuur" field="departureTime" />
          <TimeField label="Werk start" field="workStart" />
          <TimeField label="Werk einde" field="workEnd" />
        </div>

        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Interventie | Intervention</span>
          <div className="flex rounded-xl overflow-hidden border border-stroke">
            {(['week', 'weekend'] as InterventionKind[]).map(kind => (
              <button key={kind} type="button" onClick={() => onChange('interventionKind', kind)}
                className={`flex-1 py-3 text-sm font-bold uppercase ${form.interventionKind === kind ? 'bg-brand-orange text-white' : 'bg-white text-ink'}`}>
                {kind}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Aantal ritten</span>
            <input type="number" min={0} inputMode="numeric" value={form.tripCount}
              onChange={e => onChange('tripCount', Math.max(0, Number(e.target.value) || 0))} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-1">Aantal personen</span>
            <input type="number" min={1} inputMode="numeric" value={form.personCount}
              onChange={e => onChange('personCount', Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
          </label>
        </div>
      </div>
    </Section>
  )
}
```

- [ ] **Step 3: Create `DevicePicker`**

`components/WerkbonForm/DevicePicker.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { Device } from '@/types'
import NewDeviceForm, { type NewDeviceDraft } from '@/components/NewWorkOrder/NewDeviceForm'
import Section from './Section'

interface Props {
  siteId: string
  onPick: (device: Device) => void
}

/** Shown instead of DevicePanel when the ticket has no device yet. */
export default function DevicePicker({ siteId, onPick }: Props) {
  const [devices, setDevices] = useState<Device[]>([])
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/sites/${siteId}/devices`)
      .then(r => r.ok ? r.json() : { devices: [] })
      .then((data: { devices: Device[] }) => setDevices(data.devices))
      .catch(() => setDevices([]))
  }, [siteId])

  async function createDevice(draft: NewDeviceDraft) {
    setError(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/devices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand: draft.brand, model: draft.model, unit_number: draft.unitNumber, serial_number: draft.serialNumber,
          delivery_date: draft.deliveryDate, warranty_until: draft.warrantyUntil,
        }),
      })
      if (!res.ok) throw new Error('create failed')
      const { device } = await res.json() as { device: Device }
      onPick(device)
    } catch {
      setError('Toestel kon niet opgeslagen worden — controleer je verbinding')
    }
  }

  return (
    <Section title="TOESTEL">
      <p className="text-sm text-ink-soft mb-3">Geen toestel gekend op dit ticket. Kies het toestel waaraan je werkt.</p>
      {showNew ? (
        <NewDeviceForm onSubmit={createDevice} onCancel={() => setShowNew(false)} submitLabel="Toestel opslaan" />
      ) : (
        <div className="flex flex-col gap-2">
          {devices.map(d => (
            <button key={d.id} type="button" onClick={() => onPick(d)}
              className="w-full text-left rounded-xl p-3 bg-surface border border-stroke">
              <p className="font-bold text-ink">{d.brand} {d.model}</p>
              <p className="text-xs text-ink-soft">{[d.unitNumber && `Unit ${d.unitNumber}`, d.serialNumber && `S/N ${d.serialNumber}`].filter(Boolean).join(' · ') || '—'}</p>
            </button>
          ))}
          <button type="button" onClick={() => setShowNew(true)}
            className="w-full py-3 rounded-xl font-bold text-sm border border-dashed border-brand-green text-brand-green bg-white">
            + Nieuw toestel
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-brand-red">{error}</p>}
    </Section>
  )
}
```

- [ ] **Step 4: Rewrite `components/WerkbonForm/index.tsx`**

Keep `getAssignmentLabel`, `STATUS_OPTIONS`, the task-fetching effects and the warehouse task queueing exactly as they are today (lines 14-22, 37-43, 78-96, 190-211). Replace the rest so the file reads:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import SignaturePad from '@/components/SignaturePad'
import DevicePanel from '@/components/DevicePanel'
import { generateWerkbonPDF } from '@/lib/pdf'
import type { PdfTaskItem } from '@/lib/pdf'
import { useTasks } from '@/lib/task-store'
import { queueTaskCommand } from '@/lib/tasks/sync'
import { getTaskStatusLabel } from '@/lib/task-meta'
import { getUserById } from '@/lib/mock-data'
import { deleteWerkbon, loadWerkbon, saveWerkbon } from '@/lib/idb'
import type { Device, Intervention, DbTask, Task, User, WerkbonFormState } from '@/types'
import type { PdfPart } from '@/lib/pdf'
import PartsSection from './PartsSection'
import PhotoUploadSection from './PhotoUploadSection'
import TaskManager from './TaskManager'
import Section from './Section'
import BonHeaderCard from './BonHeaderCard'
import VisitSection from './VisitSection'
import DevicePicker from './DevicePicker'

// (keep getAssignmentLabel and STATUS_OPTIONS from the current file here, unchanged)

function todayISODate(): string { return new Date().toISOString().slice(0, 10) }

function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T12:00:00`).getDay()
  return day === 0 || day === 6
}

function initialForm(intervention: Intervention): WerkbonFormState {
  const today = todayISODate()
  return {
    status: intervention.status,
    deviceId: intervention.deviceId,
    technicianId: intervention.technicians.find(t => t.isLead)?.technicianId ?? intervention.technicians[0]?.technicianId ?? null,
    visitDate: today,
    arrivalTime: '',
    departureTime: '',
    workStart: '',
    workEnd: '',
    interventionKind: isWeekend(today) ? 'weekend' : 'week',
    tripCount: 1,
    personCount: Math.max(1, intervention.technicians.length),
    notes: '',
    remarks: '',
    parts: [],
    signature: null,
  }
}

interface Props {
  intervention: Intervention
  initialActivityId?: string
}

export default function WerkbonForm({ intervention, initialActivityId }: Props) {
  const { tasks } = useTasks()
  const werkbonId = `wb-${intervention.id}`

  const [form, setForm] = useState<WerkbonFormState>(() => initialForm(intervention))
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [pickedDevice, setPickedDevice] = useState<Device | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [bonNumber, setBonNumber] = useState<string | null>(null)
  const [existingCount, setExistingCount] = useState(0)
  const [deviceRefresh, setDeviceRefresh] = useState(0)
  const [queuedPartIds, setQueuedPartIds] = useState<Set<string>>(new Set())
  const [orderTasks, setOrderTasks] = useState<DbTask[]>([])
  const [workflowTasks, setWorkflowTasks] = useState<DbTask[]>([])
  const [workflowRefresh, setWorkflowRefresh] = useState(0)
  const saveTimer = useRef<number | null>(null)

  // ── Draft: load once, then autosave (debounced 500 ms) ─────────────────────
  useEffect(() => {
    let cancelled = false
    loadWerkbon(intervention.id)
      .then(draft => { if (!cancelled && draft) setForm(draft.form) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDraftLoaded(true) })
    return () => { cancelled = true }
  }, [intervention.id])

  useEffect(() => {
    if (!draftLoaded) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void saveWerkbon(intervention.id, form) }, 500)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [form, draftLoaded, intervention.id])

  // How many werkbonnen already exist → bon number preview "-NN"
  useEffect(() => {
    if (!intervention.deviceId) return
    fetch(`/api/devices/${intervention.deviceId}/history`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ workOrderId: string }>) => setExistingCount(rows.filter(r => r.workOrderId === intervention.id).length))
      .catch(() => {})
  }, [intervention.id, intervention.deviceId, saveStatus])

  // (keep the two task-fetching useEffects from the current file here, unchanged)

  const update = useCallback(<K extends keyof WerkbonFormState>(field: K, value: WerkbonFormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }, [])

  function addPart(toOrder: boolean) {
    const part: PdfPart = { id: `p-${Date.now()}`, code: '', description: '', quantity: 1, toOrder, urgent: false }
    setForm(prev => ({ ...prev, parts: [...prev.parts, part] }))
  }
  function updatePart(id: string, field: keyof PdfPart, value: string | number | boolean) {
    setForm(prev => ({ ...prev, parts: prev.parts.map(p => p.id === id ? { ...p, [field]: value } : p) }))
  }
  function removePart(id: string) {
    setForm(prev => ({ ...prev, parts: prev.parts.filter(p => p.id !== id) }))
  }
  const handleSignature = useCallback((dataUrl: string | null) => update('signature', dataUrl), [update])

  function handleDevicePicked(device: Device) {
    setPickedDevice(device)
    update('deviceId', device.id)
  }

  const bonNumberPreview = bonNumber ?? `${intervention.ticketNumber ?? intervention.id}-${String(existingCount + 1).padStart(2, '0')}`
  const technicianName = intervention.technicians.find(t => t.technicianId === form.technicianId)?.name ?? ''

  /** Single place that maps form + intervention to the PDF input. Task 12 changes only this function. */
  function buildPdfData(pdfTasks: PdfTaskItem[]) {
    return {
      customerName: intervention.customerName,
      siteName: intervention.siteName,
      siteAddress: intervention.siteAddress,
      siteCity: intervention.siteCity,
      deviceBrand: pickedDevice?.brand ?? intervention.deviceBrand ?? '',
      deviceModel: pickedDevice?.model ?? intervention.deviceModel ?? '',
      deviceSerial: pickedDevice?.serialNumber ?? intervention.deviceSerial,
      status: form.status,
      workStart: form.workStart,
      workEnd: form.workEnd,
      description: form.notes,
      parts: form.parts,
      followUp: [],
      tasks: pdfTasks,
      signature: form.signature,
    }
  }

  async function handleSubmit() {
    setSaving(true)
    const linkedTasks = tasks.filter(task => task.werkbonId === werkbonId)
    const pdfTasks: PdfTaskItem[] = linkedTasks.map(task => ({
      id: task.id, title: task.title, assigneeName: getAssignmentLabel(task), priority: task.priority,
      dueDate: task.dueDate ?? '', statusLabel: getTaskStatusLabel(task.status),
    }))

    try {
      const pdfBlob = await Promise.resolve(generateWerkbonPDF(buildPdfData(pdfTasks)))

      const fd = new FormData()
      fd.append('changedBy', form.technicianId ?? intervention.technicians[0]?.technicianId ?? '')
      if (form.technicianId) fd.append('technicianId', form.technicianId)
      if (form.deviceId) fd.append('deviceId', form.deviceId)
      fd.append('completionNotes', form.notes)
      fd.append('remarks', form.remarks)
      fd.append('completionParts', JSON.stringify(form.parts))
      fd.append('followUp', JSON.stringify(linkedTasks))
      fd.append('visitDate', new Date(`${form.visitDate}T00:00:00`).toISOString())
      for (const key of ['arrivalTime', 'departureTime', 'workStart', 'workEnd'] as const) {
        if (form[key]) fd.append(key, form[key])
      }
      fd.append('interventionKind', form.interventionKind)
      fd.append('tripCount', String(form.tripCount))
      fd.append('personCount', String(form.personCount))
      if (form.signature) fd.append('signature', form.signature)
      fd.append('pdf', pdfBlob, `servicebon-${intervention.id}.pdf`)

      const res = await fetch(`/api/work-orders/${intervention.id}/complete`, { method: 'POST', body: fd })

      if (res.ok) {
        const json = await res.json() as { bonNumber: string }
        setBonNumber(json.bonNumber)
        setSaveStatus('saved')
        setDeviceRefresh(current => current + 1)
        await deleteWerkbon(intervention.id)

        // (keep the warehouse order_part queueing loop from the current file here, unchanged)
      } else {
        console.error('Complete route error:', res.status, await res.text())
        setSaveStatus('error')
      }
    } catch (err) {
      console.error('Submit error:', err)
      setSaveStatus('error')
    }
    setSaving(false)
  }

  const deviceKnown = Boolean(form.deviceId)

  return (
    <div className="flex flex-col gap-4 pb-10">
      <BonHeaderCard intervention={intervention} bonNumberPreview={bonNumberPreview} />

      <div className="flex flex-wrap gap-2 px-1">
        {STATUS_OPTIONS.map(s => (
          <button key={s.value} type="button" onClick={() => update('status', s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${form.status === s.value ? s.activeClass : s.inactiveClass}`}>
            {s.label}
          </button>
        ))}
      </div>

      {deviceKnown ? (
        <DevicePanel
          deviceId={form.deviceId}
          brand={pickedDevice?.brand ?? intervention.deviceBrand}
          model={pickedDevice?.model ?? intervention.deviceModel}
          refreshKey={deviceRefresh}
        />
      ) : (
        <DevicePicker siteId={intervention.siteId} onPick={handleDevicePicked} />
      )}

      <Section title="OMSCHRIJVING KLANT | OBSERVATIONS CLIENT">
        <p className="text-sm text-ink whitespace-pre-wrap">{intervention.description || '—'}</p>
      </Section>

      <Section title="TECHNICUS RAPPORT | RAPPORT TECHNICIEN">
        <textarea rows={5} placeholder="Wat heb je vastgesteld en gedaan?"
          value={form.notes} onChange={e => update('notes', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink" />
      </Section>

      <PartsSection parts={form.parts} onAddPart={addPart} onUpdatePart={updatePart} onRemovePart={removePart} queuedPartIds={queuedPartIds} />

      <VisitSection form={form} technicians={intervention.technicians} onChange={update} />

      <Section title="OPMERKINGEN | REMARQUES">
        <textarea rows={3} placeholder="Opmerkingen voor kantoor of volgende technieker"
          value={form.remarks} onChange={e => update('remarks', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink" />
      </Section>

      <PhotoUploadSection workOrderId={intervention.id} technicianId={form.technicianId} />

      <TaskManager
        intervention={intervention}
        werkbonId={werkbonId}
        orderTasks={orderTasks}
        workflowTasks={workflowTasks}
        onWorkflowTaskComplete={() => setWorkflowRefresh(r => r + 1)}
        initialActivityId={initialActivityId}
      />

      <Section title="AKKOORD VAN KLANT | ACCORD DU CLIENT">
        <SignaturePad signature={form.signature} onSignatureChange={handleSignature} />
        {technicianName && <p className="mt-2 text-xs text-ink-soft">Technicus: {technicianName}</p>}
      </Section>

      <button type="button" onClick={handleSubmit} disabled={saving}
        className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-60 bg-brand-orange">
        {saving ? 'Bon afsluiten...' : 'Bon afsluiten & PDF'}
      </button>

      {saveStatus === 'saved' && bonNumber && (
        <p className="text-center text-sm font-semibold text-brand-green">✓ Service bon {bonNumber} opgeslagen</p>
      )}
      {saveStatus === 'error' && (
        <p className="text-center text-sm font-semibold text-brand-red">✗ Opslaan mislukt — probeer opnieuw</p>
      )}
    </div>
  )
}
```

Where the comment says "keep … from the current file", paste those blocks verbatim from the pre-edit file (`git show HEAD:components/WerkbonForm/index.tsx`). The `PhotoUploadSection` prop `technicianId` accepts `string | null` already.

- [ ] **Step 5: Type check, lint, manual walkthrough**

```bash
npx tsc --noEmit && npm run lint
```
Then with `npm run dev -- --hostname 0.0.0.0` open the Molenhoeve job created in Task 9 on a phone-sized viewport and check, top to bottom: header card shows ticket, bon preview `TKT20/12752-01`, klant nr; the device picker appears (no device on the ticket); "+ Nieuw toestel" → Berner / Friteuse → the DevicePanel replaces the picker; type a report; add one part; set bezoek fields with "Nu"; write a remark; sign; refresh the page and confirm every field is still filled (draft); press "Bon afsluiten & PDF" → green "Service bon TKT20/12752-01 opgeslagen" and the PDF download. Stop the dev server. Record the outcome.

- [ ] **Step 6: Commit**

```bash
git add components/WerkbonForm
git commit -m "feat(werkbon): form in paper order with all Service Bon fields

Adds BonHeaderCard, VisitSection and DevicePicker, reorders sections to
follow the paper bon, autosaves a draft to IndexedDB and submits every
new field to the complete route.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 12: PDF replica of the paper Service Bon

**Files:**
- Create: `scripts/extract-logo.py`, `public/bossuyt-logo.png`
- Rewrite: `lib/pdf.ts` (keep the exported `PdfPart`, `PdfFollowUp`, `PdfTaskItem` interfaces; replace `PdfData` and `generateWerkbonPDF`)
- Modify: `components/WerkbonForm/index.tsx` `buildPdfData()` only
- Test: `tests/pdf.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ServiceBonPdfData { … }   // below
  export type PdfData = ServiceBonPdfData      // alias so old imports keep compiling
  export async function generateWerkbonPDF(data: ServiceBonPdfData, options?: { download?: boolean }): Promise<Blob>
  ```
  `download` defaults to `true` (browser save dialog) and must be `false` in tests.

- [ ] **Step 1: Extract the logo from the sample PDF**

Create `scripts/extract-logo.py`:

```python
"""Extract the Bossuyt logo bitmap from the sample Service Bon into public/bossuyt-logo.png.

Usage: python3 scripts/extract-logo.py
Requires PyMuPDF (`pip install pymupdf`). The logo is the widest image on page 1.
"""
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tests" / "fixtures" / "sauna-molenhoeve.pdf"
DST = ROOT / "public" / "bossuyt-logo.png"

doc = fitz.open(SRC)
page = doc[0]
images = page.get_images(full=True)
if not images:
    sys.exit("no images found on page 1")

# get_images tuples: (xref, smask, width, height, bpc, colorspace, ...)
logo = max(images, key=lambda img: img[2])
pix = fitz.Pixmap(doc, logo[0])
if pix.n - pix.alpha >= 4:  # CMYK → RGB
    pix = fitz.Pixmap(fitz.csRGB, pix)
pix.save(DST)
print(f"wrote {DST} ({pix.width}x{pix.height})")
```

Run: `python3 scripts/extract-logo.py && file public/bossuyt-logo.png`
Expected: `wrote …/public/bossuyt-logo.png (923x183)` and `PNG image data, 923 x 183`. Open the PNG (Read tool) and confirm it is the orange "××" mark with "BOSSUYT GROOTKEUKENS".

- [ ] **Step 2: Write the failing PDF test**

Create `tests/pdf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateWerkbonPDF, type ServiceBonPdfData } from '@/lib/pdf'

const data: ServiceBonPdfData = {
  ticketNumber: 'TKT20/12752',
  bonNumber: 'TKT20/12752-01',
  ticketDate: '2026-09-04T00:00:00.000Z',
  customerNumber: 'K04647',
  invoiceCustomerNumber: 'K04647',
  customerName: 'Molenhoeve group bvba',
  siteAddress: 'Van den nestlaan 132',
  siteCity: '2520 Broechem',
  contactName: '',
  phones: [],
  closingDay: '',
  deviceUnitNumber: '',
  deviceDescription: 'Berner Friteuse',
  deviceDeliveryDate: '',
  deviceWarrantyUntil: '',
  customerDescription: 'Nazicht/ herstel 2 friteuses Berner - controleren op lekken',
  technicianReport: 'Lek aan dichting vastgesteld. Dichting vervangen en getest.',
  parts: [{ id: 'p1', code: 'A-1', description: 'Dichting 40mm', quantity: 2, toOrder: false, urgent: false }],
  technicianName: 'Olivier Pierrard',
  visitDate: '2026-09-05T00:00:00.000Z',
  arrivalTime: '2026-09-05T08:30:00.000Z',
  departureTime: '2026-09-05T10:15:00.000Z',
  interventionKind: 'week',
  tripCount: 1,
  personCount: 1,
  remarks: 'Filter volgende keer meenemen',
  signature: null,
}

describe('generateWerkbonPDF', () => {
  it('produces a PDF blob without triggering a download', async () => {
    const blob = await generateWerkbonPDF(data, { download: false })
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(3000)
    const head = Buffer.from(await blob.arrayBuffer()).subarray(0, 8).toString('latin1')
    expect(head.startsWith('%PDF-1')).toBe(true)
  })

  it('handles empty optional fields and a long report without throwing', async () => {
    const blob = await generateWerkbonPDF({
      ...data,
      parts: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, code: `C-${i}`, description: `Onderdeel ${i}`, quantity: 1, toOrder: i % 2 === 0, urgent: false })),
      technicianReport: 'regel\n'.repeat(30),
      signature: null,
    }, { download: false })
    expect(blob.size).toBeGreaterThan(3000)
  })
})
```

Run: `npx vitest run --config vitest.config.test.ts tests/pdf.test.ts 2>&1 | tail -10`
Expected: FAIL (type errors / `ServiceBonPdfData` not exported).

- [ ] **Step 3: Rewrite `lib/pdf.ts`**

Keep lines 1-29 (`PdfPart`, `PdfFollowUp`, `PdfTaskItem`) and replace everything from `export interface PdfData` to the end of the file with:

```ts
// ── Service Bon data ─────────────────────────────────────────────────────────
// Built from the stored werkbon + work order so the PDF can be regenerated later.

export interface ServiceBonPdfData {
  ticketNumber: string
  bonNumber: string
  ticketDate: string             // ISO
  customerNumber: string         // KLANT N° L
  invoiceCustomerNumber: string  // KLANT N° F ('' when same as L)
  customerName: string
  siteAddress: string
  siteCity: string               // "2520 Broechem"
  contactName: string
  phones: string[]
  closingDay: string
  deviceUnitNumber: string
  deviceDescription: string      // "Berner Friteuse 2x8L"
  deviceDeliveryDate: string     // ISO date or ''
  deviceWarrantyUntil: string    // ISO date or ''
  customerDescription: string    // OMSCHRIJVING KLANT
  technicianReport: string       // TECHNICUS RAPPORT
  parts: PdfPart[]
  technicianName: string
  visitDate: string              // ISO
  arrivalTime: string            // ISO or ''
  departureTime: string          // ISO or ''
  interventionKind: 'week' | 'weekend'
  tripCount: number
  personCount: number
  remarks: string
  signature: string | null       // data URL
}

/** Backwards-compatible alias. */
export type PdfData = ServiceBonPdfData

// ── Constants copied verbatim from the paper bon ─────────────────────────────

const COMPANY_LINE = 'Bossuyt Grootkeuken NV | Noordlaan 19 | 8520 KUURNE | T  056/357012 |  F 056/370016 |  | BE 0476.185.470'
const REGISTRATION_LINE = 'RPR Kortrijk | ERKENNING: KLASSE 5 . CATEGORIE T3-T4 | REFERTENUMMER VAN REGISTRATIE ALS AANNEMER: 052011 | INSCHRIJVING LIJST ERKENDE AANNEMERS: 19.020'
const BANK_LINES = [
  'KBC IBAN BE35 4643 2838 2237 BIC KRED BE BB',
  'BNP PARIBAS FORTIS IBAN BE20 0014 9856 8356 BIC GEBA BE BB',
  'ING IBAN BE29 3850 1870 1764 BIC BBRU BE BB',
]
const ORANGE: [number, number, number] = [226, 105, 30]
const BLACK: [number, number, number]  = [0, 0, 0]
const GREY: [number, number, number]   = [120, 120, 120]

// ── Formatting ───────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
}

function fmtTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Fetch the logo as a data URL (browser only). Returns null in node or when missing. */
async function loadLogo(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return null
  try {
    const res = await fetch('/bossuyt-logo.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── Layout (A4 portrait, mm) ─────────────────────────────────────────────────

const PAGE_W = 210
const PAGE_H = 297
const ML = 12                    // left margin
const MR = 12
const CW = PAGE_W - ML - MR      // 186
const SPLIT = 118                // x where the header box splits into two columns
const RIGHT_X = 124              // x where the right-hand blocks (bezoek, akkoord) start

export async function generateWerkbonPDF(
  data: ServiceBonPdfData,
  options: { download?: boolean } = {},
): Promise<Blob> {
  const download = options.download ?? true
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogo()

  // ── primitives ─────────────────────────────────────────────────────────────
  const line = (x1: number, y1: number, x2: number, y2: number) => { doc.setDrawColor(...BLACK); doc.setLineWidth(0.2); doc.line(x1, y1, x2, y2) }
  const label = (text: string, x: number, y: number, size = 7.5) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(...BLACK); doc.text(text, x, y) }
  const value = (text: string, x: number, y: number, size = 9, align: 'left' | 'right' = 'left') => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...BLACK)
    doc.text(text || '', x, y, { align })
  }
  const dotted = (x1: number, x2: number, y: number) => {
    doc.setDrawColor(...GREY); doc.setLineWidth(0.15); doc.setLineDashPattern([0.4, 1.2], 0)
    doc.line(x1, y, x2, y); doc.setLineDashPattern([], 0)
  }
  const ruled = (x1: number, x2: number, y: number) => { doc.setDrawColor(...GREY); doc.setLineWidth(0.15); doc.line(x1, y, x2, y) }

  // ── page header (logo) + footer, drawn on every page ───────────────────────
  function pageChrome() {
    if (logo) {
      try { doc.addImage(logo, 'PNG', ML, 7, 62, 12.3) } catch { drawTextLogo() }
    } else {
      drawTextLogo()
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...BLACK)
    doc.text(BANK_LINES[0], ML, PAGE_H - 16)
    doc.text(BANK_LINES[1], PAGE_W / 2, PAGE_H - 16, { align: 'center' })
    doc.text(BANK_LINES[2], PAGE_W - MR, PAGE_H - 16, { align: 'right' })
    line(ML, PAGE_H - 13.5, PAGE_W - MR, PAGE_H - 13.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(COMPANY_LINE, PAGE_W / 2, PAGE_H - 9.5, { align: 'center' })
    doc.setFontSize(5.5)
    doc.text(REGISTRATION_LINE, PAGE_W / 2, PAGE_H - 6, { align: 'center' })
  }
  function drawTextLogo() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...ORANGE)
    doc.text('××', ML, 16)
    doc.setTextColor(...BLACK); doc.text('BOSSUYT', ML + 12, 15)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text('GROOTKEUKENS', ML + 12, 19)
  }

  pageChrome()

  // ── header box: y 26 → 96 ──────────────────────────────────────────────────
  const HB_TOP = 26, HB_BOTTOM = 96
  line(ML, HB_TOP, ML, HB_BOTTOM); line(PAGE_W - MR, HB_TOP, PAGE_W - MR, HB_BOTTOM)
  line(SPLIT, HB_TOP, SPLIT, HB_BOTTOM); line(ML, HB_BOTTOM, PAGE_W - MR, HB_BOTTOM)

  // left column
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...BLACK)
  doc.text('SERVICE BON | BON DE SERVICE', ML + 6, HB_TOP + 9)
  label('TICKET N°', ML + 3, 66);                    value(data.ticketNumber, ML + 3, 70.5)
  label('SERVICE BON N° BON DE SERVICE', ML + 3, 76); value(data.bonNumber, ML + 3, 80.5)
  label('DATUM TICKET', ML + 3, 86);                 value(fmtDate(data.ticketDate), ML + 3, 90.5)

  // right column
  const RX = SPLIT + 3
  label('KLANT N° CLIENT', RX, HB_TOP + 6)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('L', RX, HB_TOP + 11)
  value(data.customerNumber, RX + 4, HB_TOP + 11)
  const fNumber = data.invoiceCustomerNumber || data.customerNumber
  line(RX + 38, HB_TOP + 7.5, RX + 38, HB_TOP + 12)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('F', RX + 41, HB_TOP + 11)
  value(fNumber, RX + 45, HB_TOP + 11)

  label('NAAM | NOM', RX, HB_TOP + 17);        value(data.customerName, RX, HB_TOP + 21.5)
  label('ADRES | ADRESSE', RX, HB_TOP + 30);   value(data.siteAddress, RX, HB_TOP + 34.5); value(data.siteCity, RX, HB_TOP + 39)
  label('CONTACT', RX, HB_TOP + 44);           value(data.contactName, RX + 22, HB_TOP + 44)
  label('Tel & GSM', RX, HB_TOP + 53);         value(data.phones.join(' / '), RX + 22, HB_TOP + 53)
  label('SLUITINGSDAG | FERMÉ', RX, HB_TOP + 63); value(data.closingDay, RX + 42, HB_TOP + 63)

  // ── device row: y 96 → 118 ─────────────────────────────────────────────────
  const DR_TOP = HB_BOTTOM, DR_BOTTOM = 118
  const cols = [ML, ML + 28, ML + 118, ML + 152, PAGE_W - MR]
  for (const x of cols.slice(1, -1)) line(x, DR_TOP + 3, x, DR_BOTTOM)
  label('UNIT N°', cols[0] + 2, DR_TOP + 6);                    value(data.deviceUnitNumber, cols[0] + 2, DR_TOP + 13)
  label('OMSCHRIJVING | DÉSIGNATION', cols[1] + 2, DR_TOP + 6); value(data.deviceDescription, cols[1] + 2, DR_TOP + 13)
  label('LEVERDATUM', cols[2] + 2, DR_TOP + 6);                 value(fmtDate(data.deviceDeliveryDate), cols[2] + 2, DR_TOP + 13)
  label('GARANTIE', cols[3] + 2, DR_TOP + 6);                   value(fmtDate(data.deviceWarrantyUntil), cols[3] + 2, DR_TOP + 13)

  // ── omschrijving klant: y 120 → 140 ────────────────────────────────────────
  label('OMSCHRIJVING KLANT | OBSERVATIONS CLIENT', ML + 2, 124)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const custLines = (doc.splitTextToSize(data.customerDescription || '', CW - 6) as string[]).slice(0, 3)
  doc.text(custLines, ML + 2, 129)

  // ── technicus rapport: y 142 → 184 (5 ruled lines) ─────────────────────────
  label('TECHNICUS RAPPORT TECHNICIEN', ML + 2, 146)
  ruled(ML + 52, PAGE_W - MR, 146)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const reportLines = doc.splitTextToSize(data.technicianReport || '', CW - 6) as string[]
  const REPORT_ROWS = 5
  for (let i = 0; i < REPORT_ROWS; i++) {
    const y = 153 + i * 6.5
    if (reportLines[i]) doc.text(reportLines[i], ML + 2, y - 1.2)
    ruled(ML, PAGE_W - MR, y)
  }
  const reportOverflow = reportLines.slice(REPORT_ROWS)

  // ── materialen (left) + bezoek (right): y 186 → 240 ────────────────────────
  const MB_TOP = 186, MB_BOTTOM = 240
  line(ML, MB_TOP, PAGE_W - MR, MB_TOP)
  line(RIGHT_X - 2, MB_TOP, RIGHT_X - 2, MB_BOTTOM)

  label('MATERIALEN | MATÉRIAUX', ML + 2, MB_TOP + 5)
  label('ART. N°', ML + 2, MB_TOP + 10, 7); label('Omschrijving', ML + 24, MB_TOP + 10, 7); label('AANTAL | NOMBRE', RIGHT_X - 5, MB_TOP + 10, 7)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
  doc.text('AANTAL | NOMBRE', RIGHT_X - 5, MB_TOP + 10, { align: 'right' })
  const PART_ROWS = 6
  const partsToDraw = data.parts.slice(0, PART_ROWS)
  for (let i = 0; i < PART_ROWS; i++) {
    const y = MB_TOP + 17 + i * 6
    const p = partsToDraw[i]
    if (p) {
      value(p.code, ML + 2, y - 1, 8.5)
      const desc = p.toOrder ? `${p.description} (te bestellen${p.urgent ? ', dringend' : ''})` : p.description
      value((doc.splitTextToSize(desc, 70) as string[])[0] ?? '', ML + 24, y - 1, 8.5)
      value(String(p.quantity), RIGHT_X - 5, y - 1, 8.5, 'right')
    }
    dotted(ML + 2, RIGHT_X - 5, y)
  }
  const partsOverflow = data.parts.slice(PART_ROWS)

  const visitRows: Array<[string, string]> = [
    ['TECHNICUS | TECHNICIEN', data.technicianName],
    ['BEZOEKDATUM | DATE DE LA VISITE', fmtDate(data.visitDate)],
    ["AANKOMSTUUR | HEURE D'ARRIVÉE", fmtTime(data.arrivalTime)],
    ['VERTREKUUR | HEURE DE DÉPART', fmtTime(data.departureTime)],
    ['INTERVENTIE | INTERVENTION', ''],
    ['AANTAL RITTEN | NOMBRE DE TRAJETS', String(data.tripCount)],
    ['AANTAL PERSONEN | NOMBRE DES PERS.', String(data.personCount)],
  ]
  visitRows.forEach(([lbl, val], i) => {
    const y = MB_TOP + 8 + i * 7.3
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK)
    doc.text(lbl, RIGHT_X, y)
    if (lbl.startsWith('INTERVENTIE')) {
      // WEEK | WEEKEND with the chosen one boxed
      const wx = PAGE_W - MR - 30
      doc.setFontSize(7.5)
      doc.text('WEEK | WEEKEND', wx, y)
      const chosen = data.interventionKind === 'week' ? { x: wx - 1, w: 9 } : { x: wx + 12, w: 17 }
      doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5); doc.rect(chosen.x, y - 3.2, chosen.w, 4.2)
    } else {
      value(val, PAGE_W - MR - 1, y, 8.5, 'right')
    }
    ruled(RIGHT_X, PAGE_W - MR, y + 2)
  })

  // ── opmerkingen (left) + akkoord (right): y 242 → 276 ──────────────────────
  const OP_TOP = 242, OP_BOTTOM = 276
  line(RIGHT_X - 2, OP_TOP, RIGHT_X - 2, OP_BOTTOM)
  label('OPMERKINGEN | REMARQUES', ML + 2, OP_TOP + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  const remarkLines = (doc.splitTextToSize(data.remarks || '', RIGHT_X - ML - 10) as string[]).slice(0, 4)
  for (let i = 0; i < 4; i++) {
    const y = OP_TOP + 12 + i * 6
    if (remarkLines[i]) doc.text(remarkLines[i], ML + 2, y - 1.2)
    ruled(ML + 2, RIGHT_X - 6, y)
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLACK)
  doc.text('AKKOORD VAN KLANT | ACCORD DU CLIENT', PAGE_W - MR - 1, OP_TOP + 5, { align: 'right' })
  if (data.signature) {
    try { doc.addImage(data.signature, 'PNG', RIGHT_X + 2, OP_TOP + 8, 60, 24) } catch { /* unreadable signature: leave the box empty */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...ORANGE)
  doc.text('×', RIGHT_X + 1, OP_TOP + 14)

  // ── overflow page for long reports / many parts ─────────────────────────────
  if (reportOverflow.length > 0 || partsOverflow.length > 0) {
    doc.addPage()
    pageChrome()
    let y = 30
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BLACK)
    doc.text(`SERVICE BON ${data.bonNumber} — vervolg | suite`, ML, y); y += 8
    if (reportOverflow.length > 0) {
      label('TECHNICUS RAPPORT TECHNICIEN (vervolg)', ML + 2, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      for (const l of reportOverflow) {
        if (y > PAGE_H - 30) { doc.addPage(); pageChrome(); y = 30 }
        doc.text(l, ML + 2, y - 1.2); ruled(ML, PAGE_W - MR, y); y += 6.5
      }
      y += 4
    }
    if (partsOverflow.length > 0) {
      label('MATERIALEN | MATÉRIAUX (vervolg)', ML + 2, y); y += 6
      for (const p of partsOverflow) {
        if (y > PAGE_H - 30) { doc.addPage(); pageChrome(); y = 30 }
        value(p.code, ML + 2, y - 1, 8.5)
        value((doc.splitTextToSize(p.toOrder ? `${p.description} (te bestellen)` : p.description, 120) as string[])[0] ?? '', ML + 24, y - 1, 8.5)
        value(String(p.quantity), PAGE_W - MR - 2, y - 1, 8.5, 'right')
        dotted(ML + 2, PAGE_W - MR - 2, y); y += 6
      }
    }
  }

  const arrayBuffer = doc.output('arraybuffer')
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
  if (download) doc.save(`ServiceBon_${data.bonNumber.replace(/[\/\s]/g, '-')}.pdf`)
  return blob
}
```

Also delete the now-unused `C`, `STATUS_LABELS`, `PRIORITY_COLORS`, `fill`, `stroke`, `textColor`, `infoRow`, `sectionTitle` helpers from the old file (everything between line 49 and the old `generateWerkbonPDF`). Keep `import jsPDF from 'jspdf'` at the top.

- [ ] **Step 4: Point the form at the new data shape**

In `components/WerkbonForm/index.tsx` replace `buildPdfData` with:

```tsx
  /** Single place that maps form + intervention to the Service Bon PDF input. */
  function buildPdfData(): ServiceBonPdfData {
    return {
      ticketNumber: intervention.ticketNumber ?? '',
      bonNumber: bonNumberPreview,
      ticketDate: intervention.ticketDate ?? intervention.createdAt ?? '',
      customerNumber: intervention.customerNumber ?? '',
      invoiceCustomerNumber: intervention.invoiceCustomerNumber && intervention.invoiceCustomerNumber !== intervention.customerNumber ? intervention.invoiceCustomerNumber : '',
      customerName: intervention.customerName,
      siteAddress: intervention.siteAddress,
      siteCity: intervention.siteCity,
      contactName: intervention.contactName ?? '',
      phones: [intervention.contactPhone, ...(intervention.sitePhones ?? [])].filter((p): p is string => Boolean(p)),
      closingDay: intervention.closingDay ?? '',
      deviceUnitNumber: pickedDevice?.unitNumber ?? intervention.deviceUnitNumber ?? '',
      deviceDescription: [pickedDevice?.brand ?? intervention.deviceBrand, pickedDevice?.model ?? intervention.deviceModel].filter(Boolean).join(' '),
      deviceDeliveryDate: pickedDevice?.deliveryDate ?? intervention.deviceDeliveryDate ?? '',
      deviceWarrantyUntil: pickedDevice?.warrantyUntil ?? intervention.deviceWarrantyUntil ?? '',
      customerDescription: intervention.description ?? '',
      technicianReport: form.notes,
      parts: form.parts,
      technicianName,
      visitDate: form.visitDate ? new Date(`${form.visitDate}T00:00:00`).toISOString() : '',
      arrivalTime: form.arrivalTime,
      departureTime: form.departureTime,
      interventionKind: form.interventionKind,
      tripCount: form.tripCount,
      personCount: form.personCount,
      remarks: form.remarks,
      signature: form.signature,
    }
  }
```

Change the import to `import { generateWerkbonPDF, type PdfPart, type ServiceBonPdfData } from '@/lib/pdf'` (drop `PdfTaskItem` and the `pdfTasks` mapping if nothing else uses it; `linkedTasks` is still sent in the `followUp` form field), and change the call to `const pdfBlob = await generateWerkbonPDF(buildPdfData())`.

- [ ] **Step 5: Run tests, type check, lint**

```bash
npx vitest run --config vitest.config.test.ts tests/pdf.test.ts 2>&1 | tail -10
npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -6
```
Expected: PASS 2 tests; all clean. If jsPDF complains about `window` in node, add at the top of the test file: `// @vitest-environment node` is already the default; jsPDF's node build works without DOM for text and vector output.

- [ ] **Step 6: Visual check against the paper**

With `npm run dev`, open the Molenhoeve job, press "Bon afsluiten & PDF", open the downloaded PDF next to `tests/fixtures/sauna-molenhoeve.pdf` (render both with the Read tool after converting page 1 to PNG using PyMuPDF: `page.get_pixmap(dpi=110).save(...)`). Adjust y-offsets in `lib/pdf.ts` until the block order and proportions match. Record before/after PNG paths in the task report.

- [ ] **Step 7: Commit**

```bash
git add scripts/extract-logo.py public/bossuyt-logo.png lib/pdf.ts components/WerkbonForm/index.tsx tests/pdf.test.ts
git commit -m "feat(pdf): one-to-one Service Bon replica with logo and bank footer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 13: Example order loader script

**Files:**
- Create: `scripts/load-example-order.ts`
- Modify: `package.json` scripts

**Interfaces:**
- Consumes: `POST /api/erp/work-orders` (Task 4), `tests/fixtures/sauna-molenhoeve.json`.
- Produces: `npm run load-example` (env `BASE_URL`, `ERP_API_KEY`).

- [ ] **Step 1: Write the script**

`scripts/load-example-order.ts`:

```ts
/**
 * Post the Sauna Molenhoeve example bon to the ERP route.
 *
 *   BASE_URL=http://localhost:3000 ERP_API_KEY=... npm run load-example
 *   BASE_URL=https://staging.bossuyt.fixassistant.com ERP_API_KEY=... npm run load-example
 *
 * Exit code 0 on 201 or 409 (already loaded), 1 otherwise.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000'
const erpKey = process.env.ERP_API_KEY
if (!erpKey) {
  console.error('ERP_API_KEY ontbreekt')
  process.exit(1)
}

const body = readFileSync(resolve(process.cwd(), 'tests/fixtures/sauna-molenhoeve.json'), 'utf-8')

const res = await fetch(`${baseUrl}/api/erp/work-orders`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-erp-key': erpKey },
  body,
})
const json = await res.json().catch(() => ({}))

console.log(res.status, JSON.stringify(json))
if (res.status === 201) console.log(`→ open ${baseUrl}/interventions/${(json as { id: string }).id}`)
if (res.status === 409) console.log(`→ bestaat al: ${baseUrl}/interventions/${(json as { id: string }).id}`)
process.exit(res.status === 201 || res.status === 409 ? 0 : 1)
```

Add to `package.json` scripts: `"load-example": "npx -y tsx scripts/load-example-order.ts"`.

- [ ] **Step 2: Run it against a local dev server**

```bash
ss -tlnp | grep ':3000' || (npm run dev -- --hostname 0.0.0.0 > /dev/null 2>&1 &)
sleep 6
set -a; . ./.env.test; set +a
BASE_URL=http://localhost:3000 ERP_API_KEY="$ERP_API_KEY" npm run load-example
```
Expected: first run prints `201 {"id":"wo-…","ticket_number":"TKT20/12752"}`; second run prints `409 …bestaat al`. (Local dev uses `DATABASE_URL` from `.env`; if the local ERP key differs from `.env.test`, pass the one from `.env`.) Stop the dev server if you started it.

- [ ] **Step 3: Commit**

```bash
git add scripts/load-example-order.ts package.json
git commit -m "chore: npm run load-example posts the Molenhoeve bon to the ERP route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
```

---

### Task 14: Release v1.53 — change notes, docs, deploy

**Files:**
- Modify: `lib/releases.ts` (via `node scripts/bump-version.js`, then fill the placeholder)
- Modify: `STAGING-TODO.md` (prepend entry)
- Modify: `PLANNING.md` "What is built and working" list, `ARCHITECTURE.md` Werkbon model
- Deploy: `docker-compose.staging.yml` (no edit)

- [ ] **Step 1: Bump to v1.53 and write the change notes**

```bash
node scripts/bump-version.js
grep -n "CURRENT_RELEASE_VERSION = " lib/releases.ts
```
Expected: `✓ Versie v1.52 → v1.53` and the constant now reads `'v1.53'`.

Replace the generated placeholder entry (the first object in `RELEASES`, containing `TODO — invullen na deploy`) with:

```ts
  {
    version: 'v1.53',
    date: '8 september 2026',
    changes: [
      {
        label: 'Nieuw',
        title: 'Service Bon: alle velden van de papieren werkbon',
        body: 'De werkbon volgt nu de papieren Service Bon: ticket- en bonnummer, klantnummer L/F, contact, sluitingsdag, unit/leverdatum/garantie, technicus rapport, materialen, bezoekdatum, aankomst- en vertrekuur, week/weekend, aantal ritten en personen, opmerkingen en handtekening.',
      },
      {
        label: 'Nieuw',
        title: 'Werkbon aanmaken vanuit de app',
        body: 'De wizard onder "+" op het dagoverzicht zoekt echte klanten, locaties en toestellen, laat nieuwe aanmaken en sluit af met een ticketstap. Een toestel is niet meer verplicht bij aanmaak.',
      },
      {
        label: 'Nieuw',
        title: 'ERP-koppeling: tickets ontvangen',
        body: 'POST /api/erp/work-orders neemt een ticket aan in Service Bon-formaat. Het bestaande GET-export geeft nu ook ticketnummer en alle bonvelden terug.',
      },
      {
        label: 'Nieuw',
        title: 'PDF is een replica van de papieren bon',
        body: 'De gegenereerde PDF heeft dezelfde indeling, tweetalige labels, logo en bankgegevens als de papieren Service Bon en kan later opnieuw gegenereerd worden.',
      },
      {
        label: 'Verbeterd',
        title: 'Concept van de werkbon blijft bewaard',
        body: 'Elke wijziging wordt lokaal (IndexedDB) opgeslagen; na een refresh of lege batterij staat alles nog ingevuld.',
      },
      {
        label: 'Fix',
        title: 'Ongeldige onderdelenlijst wordt geweigerd',
        body: 'Het afsluiten van een werkbon met een kapotte onderdelenlijst geeft nu een foutmelding in plaats van stil niets op te slaan.',
      },
    ],
  },
```

- [ ] **Step 2: Prepend the STAGING-TODO entry**

Prepend to `STAGING-TODO.md` (above the v1.52 block), with today's date and the current short SHA from `git rev-parse --short HEAD`:

```markdown
## v1.53 — Service Bon werkorders  (sha: <short sha>)

### Changenotes — lib/releases.ts
- [x] Beschrijving per wijziging geschreven (zie RELEASES v1.53)
- Spec: docs/superpowers/specs/2026-09-08-service-bon-work-orders-design.md
- Plan: docs/superpowers/plans/2026-09-08-service-bon-work-orders.md

### Lessen toevoegen — lib/lessons.ts
- [ ] Lesson-items schrijven voor: createWorkOrder (find-or-create in één transactie), bonnummer met rijlock, IndexedDB draft, jsPDF replica

### Na deploy
- [ ] `npm run load-example` tegen staging en de Molenhoeve-bon op 05/09 openen op een telefoon
- [ ] Betekenis van KLANT N° L / F bevestigen met Bossuyt

---
```

- [ ] **Step 3: Update the planning and architecture docs**

In `PLANNING.md`, under "What is built and working", append:

```markdown
- [x] Service Bon: every paper field on work order + werkbon, bon number `${ticket}-NN`, stored signature
- [x] Inbound ERP route `POST /api/erp/work-orders` + manual wizard (`/werkbon/nieuw`, "+" on day view)
- [x] Device optional on a work order; technician picks or adds it on-site
- [x] PDF is a one-to-one replica of the paper Service Bon
- [x] Werkbon draft autosaved to IndexedDB
```
and change the header line `## Current State (v1.20)` to `## Current State (v1.53)`.

In `ARCHITECTURE.md`, replace the `### Werkbon` block with:

```markdown
### Werkbon (table `werkbonnen`, one row per submission)
- id, work_order_id, bon_number (`${ticket_number}-NN`, server-generated)
- technician_id, device_id (the unit actually worked on)
- visit_date, arrival_time, departure_time, work_start, work_end
- intervention_kind (week/weekend), trip_count, person_count
- notes (technicus rapport), remarks (opmerkingen), parts (jsonb), follow_up (jsonb)
- signature_data (base64 PNG), pdf_path, completed_at, changed_by
```
and add to `### Intervention (job)`: `- ticket_number (ERP-owned, unique), ticket_date, created_at` and change `- id, customer_id, device_id` to `- id, customer_id, site_id, device_id (nullable)`. Under `### Customer` add `- customer_number (KLANT N° L, unique), invoice_customer_number (F)`. Under `### Site` add `- closing_day`. Under `### Device` add `- unit_number, delivery_date, warranty_until`.

- [ ] **Step 4: Final verification and commit**

```bash
npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -8
npm run build 2>&1 | tail -15
git add lib/releases.ts STAGING-TODO.md PLANNING.md ARCHITECTURE.md
git commit -m "release: v1.53 Service Bon werkorders

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PFbxriNWt8Bveyk2k1uGbe"
git log --oneline origin/main..HEAD | wc -l
```
Expected: suite green, `next build` succeeds, and the count shows the feature commits ahead of origin.

- [ ] **Step 5: STOP — report to the user before deploying**

Deploying and pushing are user decisions. Report: the commit list, test counts, and the two deploy commands below. Do not run them until the user says go.

Deploy without a second version bump (`make staging-up` would bump to v1.54 via `scripts/pre-staging.sh`):

```bash
NEXT_PUBLIC_GIT_SHA=$(git rev-parse --short HEAD) docker compose --env-file .env.staging.local -f docker-compose.staging.yml up --build -d
curl -s https://staging.bossuyt.fixassistant.com/api/version
```
Expected: `{"version":"v1.53", …}`. The staging database already has the schema (Task 1 pushed to it) and its data survives because the `postgres_staging_data` volume is reused.

Then load the example order and verify on a phone:

```bash
set -a; . ./.env.staging.local; set +a
BASE_URL=https://staging.bossuyt.fixassistant.com ERP_API_KEY="$ERP_API_KEY" npm run load-example
```
Open the printed `/interventions/wo-…` URL, walk the form, download the PDF, compare with `tests/fixtures/sauna-molenhoeve.pdf`.

Push to GitHub only when the user confirms: `git push origin main`.

---

## Self-review against the spec

- **Section 1 data model** → Tasks 1, 2 (all columns, nullable device, unique indexes, types, stale `Werkbon` removed).
- **Section 2 server + API** → Task 3 (`createWorkOrder`, parse, errors), Task 4 (ERP POST, internal POST), Task 5 (GET export), Task 6 (lookups incl. `POST /api/sites/[id]/devices`, `GET /api/technicians`), Task 7 (`toIntervention` header fields, which also feeds `/api/sync/today`), Task 8 (complete route: fields, bon number under lock, 400 on bad JSON, device fill).
- **Section 3 wizard** → Task 9 (search, nieuw forms on every step, "Geen toestel gekend", ticket step, 409 handling, day-view entry).
- **Section 4 form** → Task 10 (draft store), Task 11 (paper-ordered sections, VisitSection defaults, DevicePicker, autosave, submit with all fields, "Bon afsluiten & PDF").
- **Section 5 PDF/tests/rollout** → Task 12 (replica, logo, bilingual labels, dd/mm/yy, overflow page, `(te bestellen)` suffix, download flag), Tasks 3/4/5/8 tests match the spec's test list, Task 13 (example script), Task 14 (version v1.53, STAGING-TODO, docs, deploy without double bump, user gate).
- **Out of scope** respected: no auth, no editing submitted bons, no tablet layout, no push to ERP.
- **Type consistency checked:** `WerkbonFormState` (Task 10) is what `VisitSection`, `index.tsx` and `saveWerkbon` use; `ServiceBonPdfData` (Task 12) matches `buildPdfData` field for field; `createTestWorkOrderWithoutDevice` (Task 2) is used in Tasks 2 and 8; `handleCreateWorkOrderRequest` (Task 4) is what both routes call; complete-route form field names in Task 8 match the `fd.append` calls in Task 11.

