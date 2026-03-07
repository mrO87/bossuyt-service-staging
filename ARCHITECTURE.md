# Bossuyt Service — Architecture

## Stack
- **Frontend**: Next.js 16, React 19, Tailwind 4
- **Backend**: Next.js API routes
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: NextAuth (beta)
- **Offline**: next-pwa + IndexedDB (idb) + Background Sync
- **Push notifications**: web-push
- **PDF**: jsPDF (client-side)
- **Deployment**: Docker on Hetzner

## Data Model

### User
- id, name, initials, email, role (technician/office/admin)
- password_hash, active

### Customer
- id, name, phone, address, city, vat_number?
- Billing entity — address here is the invoicing address, not necessarily where the work happens
- A customer can have multiple sites (e.g. large company with multiple locations)

### Site
- id, customer_id, name, address, city
- phones[] (one or more phone numbers for this location)
- A site can have multiple devices and multiple contacts

### Contact
- id, site_id, name, phone, email?, role?
- e.g. "Verantwoordelijke", "Technieker ter plaatse"
- Contacts are per site, not per customer

### Device
- id, site_id, brand, model, serial_number
- install_date, notes
- Devices belong to a site (not directly to a customer)

### DeviceDocument
- id, device_id, type (manual/wiring/explosion/service)
- filename, url, file_size

### Article (parts catalog)
- id, code, description, unit_price
- compatible_device_ids[]

### Intervention (job)
- id, customer_id, device_id
- planned_date
- status (gepland/onderweg/bezig/wacht_onderdelen/afgewerkt/geannuleerd)
- type (warm/montage/preventief)
- description, estimated_minutes
- is_urgent (bool), source (planned/reactive)
- created_by (user_id)
- status_onderweg_at, status_arrived_at
- status_onderweg_by (user_id)

### InterventionTechnician (join table)
- id, intervention_id, technician_id
- is_lead (bool)
- accepted (bool)
- planned_order (each technician has own order)

### Werkbon
- id, intervention_id, created_by (technician_id)
- arrival_time, work_start, work_end
- description (free text)
- status (concept/ingediend/goedgekeurd)
- signature_data (base64)
- pdf_url
- submitted_at, synced_at

### WerkbonPhoto
- id, werkbon_id, filename, storage_url
- taken_at, synced (bool)

### WerkbonArticle
- id, werkbon_id, article_code, description
- quantity, to_order (bool), needs_quote (bool)

### FollowUpAction
- id, werkbon_id, description
- priority (laag/normaal/hoog/dringend)
- due_date, done, done_at

### Notification
- id, user_id, type (onderweg/aangekomen/werkbon_ingediend/nieuwe_job)
- intervention_id, message
- read (bool), created_at

## Key Flows

### Day View
- Shows all interventions for today assigned to the technician
- Plus unfinished jobs from previous days
- Technician can reorder (personal order via InterventionTechnician.planned_order)
- Multiple technicians on one job: each sees it, all assigned technicians shown

### Open Interventions View
- Technician can see ALL open interventions (not just today's)
- Filtered by status: gepland, onderweg, bezig, wacht_onderdelen
- Technician can pick up an unassigned or reactive job from this list
- Admin pre-assigns jobs but technician has freedom to add werkbonnen on-site
- Technician can swap the device on a job or create extra werkbonnen (e.g. customer asks to check other devices)

### Onderweg Flow
1. Technician taps "Onderweg" on a job
2. PATCH intervention: status + status_onderweg_at + status_onderweg_by
3. API creates Notification for all office/admin users + co-technicians
4. Web Push notification sent immediately

### Werkbon Submit Flow
1. Every field change → debounced write to IndexedDB (500ms)
2. On submit → POST to API
3. Success → mark synced, notify office
4. Fail → add to pending_queue, service worker retries on reconnect

## Offline Strategy

### Morning Sync (app open + online)
Downloads to IndexedDB:
- Today's interventions (full detail)
- Those customers + devices
- Articles catalog (weekly cache)
- Last 3 werkbonnen per device on today's schedule

### Write Queue
- All writes go to IndexedDB first
- Then attempt API call
- Failures go to pending_queue
- Service worker flushes on reconnect

### PDF Documents
- Lazy cache: cached on first open
- Proactive cache: today's device PDFs downloaded at morning sync

### Sync Indicators
- 🟢 green = synced
- 🟡 orange = pending sync
- 🔴 red = sync failed (manual retry)

## Project Structure
```
/app
  /page.tsx                           → day view (home)
  /(auth)/login/page.tsx              → login
  /customers/page.tsx                 → customer list
  /customers/[id]/page.tsx            → customer detail + devices
  /interventions/[id]/page.tsx        → job detail
  /werkbon/[id]/page.tsx              → werkbon form
  /werkbon/[id]/onderdelen/page.tsx   → parts
  /werkbon/[id]/handtekening/page.tsx → signature + submit
  /admin/page.tsx                     → office planning (later)

/app/api
  /interventions/route.ts
  /interventions/[id]/route.ts
  /interventions/[id]/order/route.ts
  /werkbon/route.ts
  /werkbon/[id]/route.ts
  /notifications/route.ts
  /sync/today/route.ts

/lib
  /db.ts         → Postgres connection (Drizzle)
  /idb.ts        → IndexedDB helpers
  /sync.ts       → sync logic
  /queue.ts      → pending queue manager
  /push.ts       → Web Push notifications
  /pdf.ts        → PDF generation

/components
  /DayView/
  /WerkbonForm/
  /ui/           → shared UI components

/types
  /index.ts      → shared TypeScript interfaces
```

## Build Order
1. Next.js base + NextAuth login
2. Day view with mock data
3. Werkbon form end-to-end
4. API routes + PostgreSQL (replace mock data)
5. Offline: IndexedDB + service worker
6. Push notifications
7. Admin/office planning view
8. Outstanding jobs + distance indicator
