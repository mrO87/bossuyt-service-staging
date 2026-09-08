# Service Bon work orders — design

Date: 2026-09-08
Target version: v1.53 (new version, confirmed by user)
Status: approved in brainstorm, awaiting spec review

## Goal

Make the app able to receive, create, fill in and print a work order that carries
every field of the paper Bossuyt "SERVICE BON | BON DE SERVICE" (reference:
`tests/fixtures/sauna-molenhoeve.pdf`, ticket TKT20/12752 for Molenhoeve group
bvba). Two entry doors: an inbound ERP API route and a manual wizard for office.
The mobile werkbon form gets every paper field in paper order, stacked in one
column. The generated PDF becomes a one-to-one replica of the paper bon.

## Decisions taken during brainstorm

| Question | Decision |
|---|---|
| Who owns the ticket number (TKT20/12752)? | The external ERP. The app stores it. |
| Who owns the bon number (TKT20/12752-01)? | The app. Suffix is a per-work-order sequence, generated server-side on werkbon submit. |
| Klant nr L and F | Store both as optional fields. Print F only when it differs from L. Meaning to be confirmed with Bossuyt later. |
| Entry path before ERP is connected | Both: inbound API route and finished manual wizard, sharing one server function. |
| Work order without a device | Device becomes optional on `work_orders`. Technician picks or adds the device on-site. |
| Approach | Extend the existing model in place (proper columns, no side table, no JSON blob). |
| Mobile layout | Not a visual copy of the A4 form. Same fields, same order, same labels, stacked. |

## Paper field to data field mapping

| Paper field | Table.column | Filled by |
|---|---|---|
| KLANT N° L | `customers.customer_number` | office / ERP |
| KLANT N° F | `customers.invoice_customer_number` | office / ERP |
| NAAM | `customers.name` | office / ERP |
| ADRES | `sites.address`, `sites.city` (postal code stored inside `city` as "2520 Broechem") | office / ERP |
| CONTACT | `contacts.name` (first contact of the site) | office / ERP |
| Tel & GSM | `sites.phone_primary`, `sites.phone_secondary` | office / ERP |
| SLUITINGSDAG | `sites.closing_day` | office / ERP |
| TICKET N° | `work_orders.ticket_number` | ERP |
| SERVICE BON N° | `werkbonnen.bon_number` | app (server) |
| DATUM TICKET | `work_orders.ticket_date` | office / ERP |
| UNIT N° | `devices.unit_number` | office / ERP / technician |
| OMSCHRIJVING (device) | `devices.brand` + `devices.model` | office / ERP / technician |
| LEVERDATUM | `devices.delivery_date` | office / ERP / technician |
| GARANTIE | `devices.warranty_until` | office / ERP / technician |
| OMSCHRIJVING KLANT | `work_orders.description` | office / ERP |
| TECHNICUS RAPPORT | `werkbonnen.notes` | technician |
| MATERIALEN: ART. N°, Omschrijving, AANTAL | `werkbonnen.parts[]` (`code`, `description`, `quantity`) | technician |
| TECHNICUS | `werkbonnen.technician_id` | technician (default: lead assignment) |
| BEZOEKDATUM | `werkbonnen.visit_date` | technician (default: today) |
| AANKOMSTUUR | `werkbonnen.arrival_time` | technician |
| VERTREKUUR | `werkbonnen.departure_time` | technician |
| INTERVENTIE WEEK / WEEKEND | `werkbonnen.intervention_kind` (`week` or `weekend`) | technician (preset from visit date) |
| AANTAL RITTEN | `werkbonnen.trip_count` | technician (default 1) |
| AANTAL PERSONEN | `werkbonnen.person_count` | technician (default: number of assigned technicians) |
| OPMERKINGEN | `werkbonnen.remarks` | technician |
| AKKOORD VAN KLANT | `werkbonnen.signature_data` (base64 PNG) | customer |
| Logo, bank lines, company footer | constants in `lib/pdf.ts` | — |

## Section 1 — Data model

All changes are additive except `work_orders.device_id` becoming nullable.
Schema is applied with `npm run db:push` (drizzle-kit push), as today.

### customers
- `customer_number text` — unique index. ERP matches on this.
- `invoice_customer_number text` — nullable.

### sites
- `closing_day text` — nullable, free text.

### devices
- `unit_number text` — nullable.
- `delivery_date text` — nullable, ISO date string (same style as `install_date`).
- `warranty_until text` — nullable, ISO date string.

### work_orders
- `ticket_number text` — unique index, nullable (legacy rows have none).
- `ticket_date timestamp with time zone` — nullable.
- `created_at timestamp with time zone not null default now()`.
- `device_id` — becomes nullable. FK stays `on delete restrict`.

### werkbonnen
- `bon_number text` — nullable for legacy rows; always set for new rows. Format `${ticket_number}-${NN}`; when the work order has no ticket number, format `${work_order_id}-${NN}`.
- `technician_id text` — FK to `technicians.id`, `on delete set null`.
- `device_id text` — FK to `devices.id`, `on delete set null`.
- `visit_date timestamp with time zone`.
- `arrival_time timestamp with time zone`.
- `departure_time timestamp with time zone`.
- `intervention_kind text` — TypeScript type `'week' | 'weekend'`.
- `trip_count integer`.
- `person_count integer`.
- `remarks text`.
- `signature_data text` — base64 data URL.

Existing `work_start` and `work_end` stay. Arrival is not the same as starting work.

### Consequences of the optional device
- `lib/server/interventions.ts` and `app/api/warehouse/queue/route.ts`: `innerJoin(devices, …)` becomes `leftJoin`; `deviceBrand`/`deviceModel` are already optional on `Intervention`.
- `Intervention.deviceId` becomes `string | null`.
- `DevicePanel` receives `deviceId: string | null` and renders the "Toestel kiezen" button when null.
- `tests/setup.ts` keeps creating a device by default; one new test creates a work order without one.

### TypeScript types (`types/index.ts`)
- `Customer` gains `customerNumber?`, `invoiceCustomerNumber?`.
- `Site` gains `closingDay?`.
- `Device` gains `unitNumber?`, `deliveryDate?`, `warrantyUntil?`.
- `Intervention` gains `ticketNumber?`, `ticketDate?`, `createdAt?`, `customerNumber?`, `invoiceCustomerNumber?`, `contactName?`, `sitePhones?`, `closingDay?`; `deviceId` becomes nullable.
- New `WerkbonSubmission` interface mirroring the new `werkbonnen` columns, used by form, complete route and PDF.
- The stale `Werkbon` interface (with `status: 'concept' | …`) that matches nothing in the DB is removed.

## Section 2 — Server logic and API routes

### `lib/server/work-orders.ts`
```ts
export interface CreateWorkOrderInput {
  ticketNumber: string
  ticketDate?: string          // ISO date
  plannedDate: string          // ISO date or datetime
  description: string
  isUrgent?: boolean
  type?: InterventionType      // default 'warm'
  customer: {
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
  site?: { name?: string; address?: string; postalCode?: string; city?: string }  // defaults to customer address
  device?: {
    unitNumber?: string
    brand: string
    model: string
    serialNumber?: string
    deliveryDate?: string
    warrantyUntil?: string
  } | null
  createdBy?: string
}

export async function createWorkOrder(input: CreateWorkOrderInput): Promise<{ id: string; ticketNumber: string }>
```
Runs in one `withAudit` transaction:
1. Customer: select by `customer_number`; insert when missing; update name/phone/address/invoice number when present in input.
2. Site: select by `(customer_id, address, city)`; insert when missing. `closing_day` and phones updated when present.
3. Contact: when `contact` given and no contact with that name exists for the site, insert one.
4. Device: only when `input.device` is given. Select by `(site_id, unit_number)` when unit number given, else by `(site_id, brand, model, serial_number)`; insert when missing.
5. Work order: insert. `status = 'gepland'`, `source = 'planned'`, `visible_in_pool = true`. Throws `DuplicateTicketError` when `ticket_number` already exists (unique violation caught and rethrown).

Validation lives in `lib/server/work-orders.ts` as `parseCreateWorkOrderBody(json): CreateWorkOrderInput` which accepts the snake_case wire shape and throws `ValidationError(field, message)`. Both routes call it. No new dependency; hand-written checks like the other routes.

### `POST /api/erp/work-orders` (new, in existing `app/api/erp/work-orders/route.ts`)
- Auth: existing `requireErpKey` (`x-erp-key` header).
- Body: snake_case, shape below. Fixture `tests/fixtures/sauna-molenhoeve.json`:
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
- Responses: `201 { id, ticket_number }`; `400 { error, field }` on validation; `409 { error: 'Ticket bestaat al', id }` on duplicate; `401` on bad key; `500` otherwise.
- Empty strings in optional fields are treated as absent.

### `GET /api/erp/work-orders` (existing, extended)
Adds `ticket_number`, `ticket_date`, `created_at`, `customer_number` to each row, and the werkbon object gains `bon_number`, `technician_id`, `visit_date`, `arrival_time`, `departure_time`, `intervention_kind`, `trip_count`, `person_count`, `remarks`, `pdf_path`. Signature is not exported (size); the PDF path is.

### `POST /api/work-orders` (new, `app/api/work-orders/route.ts`)
Same body and responses as the ERP POST, without the ERP key. Used by the wizard. When auth is enforced later, this route gets the office/planner role check. Accepts an optional `technician_ids: string[]` to create assignments (lead = first).

### Lookup routes for the wizard (new)
- `GET /api/customers?q=` — name or customer number contains `q`, case-insensitive, max 50, ordered by name.
- `GET /api/customers/[id]/sites` — sites with contacts.
- `GET /api/sites/[id]/devices` — devices for a site.
- `POST /api/sites/[id]/devices` — create a device for a site (used by the on-site device picker in section 4).
- `GET /api/technicians` — active technicians, ordered by name.

### `POST /api/work-orders/[id]/complete` (existing, extended)
- New form fields: `visitDate`, `arrivalTime`, `departureTime`, `interventionKind`, `tripCount`, `personCount`, `remarks`, `signature`, `technicianId`, `deviceId`.
- Bon number: inside the transaction, `SELECT count(*) FROM werkbonnen WHERE work_order_id = $1` plus one, zero-padded to two digits, prefixed with `ticket_number` (or work order id when missing). The `work_orders` row is locked with `FOR UPDATE` first so two concurrent submits cannot get the same suffix.
- Malformed `completionParts` or `followUp` JSON returns `400 { error: 'Ongeldige onderdelenlijst' }` instead of storing null (fixes the April review finding).
- When `deviceId` is given and the work order has none, the work order's `device_id` is set too.
- Response gains `bonNumber`.

### `GET /api/interventions/[id]` and `GET /api/sync/today` (existing)
`toIntervention` in `lib/server/interventions.ts` adds the new header fields (ticket, customer number, contact, phones, closing day) so the form and the offline cache have them without an extra request.

## Section 3 — Manual wizard (`app/werkbon/nieuw/page.tsx`)

Keep the four-step structure and header. Changes:

1. **Customer step**: search input (debounced 300 ms) calling `/api/customers?q=`. List shows name, customer number, city. Button "Nieuwe klant" opens an inline form: customer number (required), invoice number, name (required), address (required), postal code, city (required), phone, contact, closing day. Creating a customer here does not hit the database yet; it is carried in wizard state and created by `createWorkOrder` on submit.
2. **Site step**: fetched from `/api/customers/[id]/sites`. Button "Nieuwe locatie" (name, address, postal code, city, phone). For a brand-new customer this step is skipped and the customer address is used as site.
3. **Device step**: fetched from `/api/sites/[id]/devices`. Two extra options: "Nieuw toestel" (unit nr, merk, model, serienummer, leverdatum, garantie) and "Geen toestel gekend".
4. **Ticket step** (replaces the placeholder): ticket number (required), datum ticket (default today), geplande datum (required), omschrijving klant (required, textarea), dringend toggle, technieker(s) multi-select from a new `GET /api/technicians` route (returns `technicians where active`, ordered by name; no such route exists today).
   Submit → `POST /api/work-orders` → on 201 `router.push('/interventions/' + id)`. On 409 show "Ticket bestaat al" with a link to the existing job. On 400 show the field message under the field.

Mock-data imports are removed from this page. `components/CustomerSelect`, `SiteSelect`, `DeviceSelect` keep their props but receive server data.

## Section 4 — Werkbon form (`components/WerkbonForm/index.tsx` and siblings)

One column, paper order, paper labels. New sub-components so `index.tsx` stays small:

| Order | Section title (as on paper) | Component | Notes |
|---|---|---|---|
| 1 | SERVICE BON | `BonHeaderCard.tsx` | read-only: ticket nr, bon nr preview (`TKT…-NN` where NN = existing werkbonnen + 1), datum ticket, klant nr L/F, naam, adres, contact, tel & GSM, sluitingsdag. Status chips shrink to a compact strip under it. |
| 2 | TOESTEL | existing `DevicePanel` + new `DevicePicker.tsx` | picker shows when `deviceId` is null: list from `/api/sites/[id]/devices` + "Nieuw toestel" form (`POST /api/sites/[id]/devices`, new tiny route). Selection stored in form state as `deviceId`. |
| 3 | OMSCHRIJVING KLANT | inline | read-only text. |
| 4 | TECHNICUS RAPPORT | inline textarea | existing `description` state → `notes`. |
| 5 | MATERIALEN | existing `PartsSection` | unchanged. |
| 6 | BEZOEK | `VisitSection.tsx` | technicus select, bezoekdatum (date, default today), aankomstuur / vertrekuur with "Nu" buttons and editable `type="time"`, week/weekend toggle preset from visit date (Sat/Sun → weekend), aantal ritten (number, default 1), aantal personen (number, default assigned count), plus existing werk start / werk einde. |
| 7 | OPMERKINGEN | inline textarea | `remarks`. |
| 8 | FOTO'S, ACTIVITEITEN | existing `PhotoUploadSection`, `TaskManager` | unchanged. |
| 9 | AKKOORD VAN KLANT | existing `SignaturePad` | unchanged. |
| 10 | submit | button "Bon afsluiten & PDF" | disabled while saving. |

### Form state
```ts
interface FormState {
  status: string
  deviceId: string | null
  technicianId: string | null
  visitDate: string          // ISO date
  arrivalTime: string        // ISO datetime or ''
  departureTime: string
  workStart: string
  workEnd: string
  interventionKind: 'week' | 'weekend'
  tripCount: number
  personCount: number
  notes: string
  remarks: string
  parts: PdfPart[]
  signature: string | null
}
```

### Draft autosave (offline-first)
- `lib/idb.ts`: `WerkbonCache` is replaced by `WerkbonDraft = FormState & { interventionId: string; lastSavedAt: string }`. `saveWerkbon` / `loadWerkbon` keep their names. The IndexedDB store version bumps by one with an upgrade step that clears the old unused store.
- Form: every `setForm` is followed by a 500 ms debounced `saveWerkbon`. On mount, `loadWerkbon(intervention.id)` seeds the state when a draft exists. After a successful submit the draft is deleted.

### Submit
`handlePDF` becomes `handleSubmit`: builds the PDF from a `WerkbonSubmission` object (same shape the server stores), posts the multipart form with all new fields, then queues the warehouse `order_part` tasks exactly as today.

## Section 5 — PDF replica, tests, rollout

### PDF (`lib/pdf.ts`)
- `generateWerkbonPDF(data: PdfData)` keeps its name; `PdfData` is replaced by a shape with all header + werkbon fields (customer numbers, ticket, bon number, ticket date, contact, phones, closing day, device unit/description/delivery/warranty, technician name, visit fields, remarks, signature).
- Layout, A4 portrait, single page (overflow in rapport or materialen continues on page 2 with the same header):
  1. Logo `public/bossuyt-logo.png` top-left (extracted from the sample PDF with PyMuPDF during implementation).
  2. Left column: "SERVICE BON | BON DE SERVICE", TICKET N°, SERVICE BON N° BON DE SERVICE, DATUM TICKET. Right column: KLANT N° CLIENT with L and F, NAAM | NOM, ADRES | ADRESSE, CONTACT, Tel & GSM, SLUITINGSDAG | FERMÉ.
  3. Device row: UNIT N°, OMSCHRIJVING | DÉSIGNATION, LEVERDATUM, GARANTIE.
  4. OMSCHRIJVING KLANT | OBSERVATIONS CLIENT.
  5. TECHNICUS RAPPORT TECHNICIEN with ruled lines.
  6. Left: MATERIALEN | MATÉRIAUX table (ART. N°, Omschrijving, AANTAL | NOMBRE) with dotted rows. Right: TECHNICUS | TECHNICIEN, BEZOEKDATUM | DATE DE LA VISITE, AANKOMSTUUR | HEURE D'ARRIVÉE, VERTREKUUR | HEURE DE DÉPART, INTERVENTIE | INTERVENTION WEEK | WEEKEND (chosen one underlined), AANTAL RITTEN | NOMBRE DE TRAJETS, AANTAL PERSONEN | NOMBRE DES PERS.
  7. Left: OPMERKINGEN | REMARQUES with ruled lines. Right: AKKOORD VAN KLANT | ACCORD DU CLIENT with signature image.
  8. Footer: three bank lines (KBC, BNP Paribas Fortis, ING), company line, registration line, copied verbatim from the sample.
- Dates print as `dd/mm/yy`, times as `HH:MM`, matching the paper.
- Parts marked `toOrder` print a "(te bestellen)" suffix in the description column; the app-only "Gebruikt/Bestellen/DRINGEND" status column disappears.
- The ACTIVITEITEN and OPVOLGACTIES sections of the current PDF are dropped from the bon (they remain visible in the app).
- Filename: `ServiceBon_${bonNumber with / replaced by -}.pdf`.

### Tests (vitest, real Postgres, existing `tests/setup.ts` pattern)
- `tests/api.work-orders.create.test.ts`
  - ERP POST with the Molenhoeve fixture → 201, work order exists with ticket, customer K04647 created, site created, no device.
  - Same fixture again → 409, no second row.
  - Missing `ticket_number` → 400 with `field: 'ticket_number'`.
  - Existing customer number → customer reused, not duplicated.
  - Device given with unit number → device created and linked; second post with same unit → reused.
  - Wrong `x-erp-key` → 401.
  - Internal `POST /api/work-orders` with `technician_ids` → assignment rows created.
- `tests/api.complete.test.ts`
  - Submit twice → `bon_number` ends `-01` then `-02`.
  - Malformed parts JSON → 400.
  - New fields round-trip into `werkbonnen`.
  - `deviceId` on submit fills the work order's empty `device_id`.
- `tests/api.erp.test.ts` (existing) gains an assertion that the GET export returns `ticket_number` and the werkbon `bon_number`.
- `tests/schema.test.ts` (existing) updated for new columns.
- Manual check on phone: wizard → job → form → PDF, using the Molenhoeve order.

### Example order script
`scripts/load-example-order.ts`: reads `tests/fixtures/sauna-molenhoeve.json`, posts it to `${BASE_URL}/api/erp/work-orders` with `ERP_API_KEY` from env, prints the result. `npm run load-example` alias.

### Rollout order (each step leaves the app working)
0. Commit the currently uncommitted work on `main` as its own commit (user has approved committing as part of this work). Move the 22 stray `*_hotspots.json` / `*_parts.json` files out of the repo root into `docs/parts-data/` or delete them after asking.
1. Schema + types + `createWorkOrder` + ERP POST + internal POST + tests.
2. Lookup routes + wizard.
3. Complete route extension + form restructure + draft autosave + device picker.
4. PDF replica + logo asset.
5. Version bump to v1.53 in `lib/releases.ts` with change notes; `STAGING-TODO.md` entry.
6. `make staging-up` on user go; run `load-example` against staging.

## Out of scope
- Auth / role enforcement (Phase 5 in PLANNING.md). The internal create route is open like every other route today.
- Editing a submitted werkbon.
- Tablet two-column layout.
- Pushing completed bons to the ERP (the ERP polls the existing GET).
- Confirming the business meaning of L and F with Bossuyt.
