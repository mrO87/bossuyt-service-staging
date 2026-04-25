# Plan C Shared PostgreSQL Implementation Plan

> **Execution note:** Subagents are disabled for this repo unless the user explicitly re-enables them. Execute this plan inline task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock-only day flow with the first shared PostgreSQL-backed data slice, while also fixing route recalculation when the technician changes the day start or end address.

**Architecture:** Keep the current Next.js app, but introduce a minimal shared PostgreSQL foundation with seeded demo data and a server-side sync/read layer. The UI then reads from IndexedDB and sync endpoints instead of directly from `lib/mock-data.ts`, and the route timeline refreshes when route endpoints change.

**Tech Stack:** Next.js App Router, TypeScript, Docker Compose, PostgreSQL, Drizzle ORM, IndexedDB (`idb`)

---

### Task 1: Lock the Routing Bug Reproduction

**Files:**
- Modify: `components/DayTimeline/useRouteTimeline.ts`
- Modify: `components/DayTimeline/DayTimeline.tsx`

- [ ] **Step 1: Document the current bug trigger**

Write down the reproduction in the task notes:
- Open the day timeline.
- Change the start or end address.
- Observe that travel times do not refresh unless the order changes.

- [ ] **Step 2: Add a small verification seam**

Introduce the smallest possible internal extraction needed so the route-refresh trigger can be tested or reasoned about cleanly, for example by isolating stop-building dependencies from the effect trigger.

- [ ] **Step 3: Make the fetch trigger depend on route endpoints**

Update the route-refresh effect so it reacts to:
- `state.movableItems`
- `state.startAddress`
- `state.endAddress`
- `state.sameAsStart`

- [ ] **Step 4: Preserve safe fallback behavior**

Keep the current fallback behavior when routing fails:
- loading state clears
- existing mock values remain usable

- [ ] **Step 5: Verify behavior**

Run:
```bash
npm run lint -- components/DayTimeline/useRouteTimeline.ts components/DayTimeline/DayTimeline.tsx
```

Expected:
- lint passes
- route refresh logic remains type-safe

### Task 2: Introduce the Shared PostgreSQL Runtime

**Files:**
- Modify: `docker-compose.yml`
- Create: `drizzle.config.ts`
- Create: `.env.example` additions if needed
- Create: `lib/db/` files for database connection

- [ ] **Step 1: Define the runtime shape**

Use one PostgreSQL service in Docker with a persistent volume and clear env vars:
- database name
- user
- password
- port

- [ ] **Step 2: Add Drizzle configuration**

Create `drizzle.config.ts` with the exact schema path and connection env var to make migrations and seed scripts predictable.

- [ ] **Step 3: Add the database connection module**

Create a focused DB module that exports one reusable Postgres/Drizzle client for server-side routes and seed code.

- [ ] **Step 4: Verify static correctness**

Run:
```bash
npm run lint -- drizzle.config.ts lib/db
```

Expected:
- lint passes on the new infrastructure files

### Task 3: Model the First Shared Data Slice

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/types.ts` if useful
- Reference: `lib/mock-data.ts`
- Reference: `types/index.ts`

- [ ] **Step 1: Define the minimum relational tables**

Model only what the current app truly needs:
- technicians
- customers
- sites
- devices
- work_orders
- assignments or lead-tech metadata

- [ ] **Step 2: Map existing mock fields intentionally**

Document how the denormalized `Intervention` view maps back from relational rows, so the app can keep its existing UI shape while data moves server-side.

- [ ] **Step 3: Keep YAGNI boundaries**

Do not add tables for OCR, stock, audit logs, or Keycloak internals yet unless the current service app genuinely needs them.

- [ ] **Step 4: Verify schema correctness**

Run:
```bash
npm run lint -- lib/db/schema.ts
```

Expected:
- schema file is lint-clean and consistent with the current TypeScript domain

### Task 4: Seed the Database from the Existing Mock Data

**Files:**
- Create: `lib/db/seed.ts`
- Reference: `lib/mock-data.ts`

- [ ] **Step 1: Reuse the existing mock source**

Import the existing mock customers, sites, devices, and interventions instead of duplicating demo content.

- [ ] **Step 2: Insert in dependency order**

Seed:
1. customers
2. sites
3. devices
4. technicians or assignment metadata
5. work orders

- [ ] **Step 3: Make the seed idempotent**

Use truncate/reset or upsert semantics so repeated runs do not create duplicates.

- [ ] **Step 4: Add a runnable seed command**

Expose one command in `package.json` for seeding.

- [ ] **Step 5: Verify the seed path**

Run the seed command locally against Dockerized PostgreSQL and confirm records exist for the day view.

### Task 5: Build the Morning Sync Read Endpoint

**Files:**
- Create: `app/api/sync/today/route.ts`
- Modify: `lib/sync.ts`
- Create: `lib/server/` read helpers if useful

- [ ] **Step 1: Implement the missing endpoint**

Add `GET /api/sync/today` that accepts:
- `technicianId`
- `date`

and returns:
- `planned`
- `open`

- [ ] **Step 2: Enforce the day cap in one place**

Keep the maximum total around 10 items, with the split logic defined explicitly and not scattered across UI and sync code.

- [ ] **Step 3: Return full offline-capable records**

The payload must contain enough detail for:
- day overview
- intervention detail page
- work order form bootstrapping

- [ ] **Step 4: Align `lib/sync.ts` with the new endpoint**

Remove the current broken assumption that the route is “planned later”; make the fetch path real and keep graceful offline failure behavior.

- [ ] **Step 5: Verify endpoint wiring**

Run:
```bash
npm run build
```

Expected:
- build includes `/api/sync/today`
- no type errors from the new sync path

### Task 6: Read the Day View from Cache/Sync Instead of Mock Arrays

**Files:**
- Modify: `components/DayView/DayView.tsx`
- Possibly create: `lib/useDayData.ts` or similar focused hook
- Reference: `lib/idb.ts`
- Reference: `lib/sync.ts`

- [ ] **Step 1: Isolate day data loading**

Move day-data loading out of direct `MOCK_INTERVENTIONS` usage into a focused hook or loader path.

- [ ] **Step 2: Read from IndexedDB first**

Load cached planned/open interventions from IndexedDB so the app has an actual offline path.

- [ ] **Step 3: Trigger morning sync when appropriate**

Use `shouldSync()` and `syncToday()` to refresh when online and stale, while still rendering cached data immediately.

- [ ] **Step 4: Preserve current UI contract**

Keep `DayTimeline` and the open pool rendering using `Intervention[]` so the UI migration stays incremental.

- [ ] **Step 5: Verify UI build correctness**

Run:
```bash
npm run lint -- components/DayView/DayView.tsx lib/sync.ts lib/idb.ts
```

Expected:
- no direct mock dependency remains in the day view
- lint passes

### Task 7: Validate the Offline-First Slice

**Files:**
- Modify: `app/changenotes/page.tsx` only if needed after behavior is truly live
- No other docs required for runtime validation

- [ ] **Step 1: Start Dockerized PostgreSQL**

Run the compose stack and confirm the database container is healthy.

- [ ] **Step 2: Seed demo data**

Run the seed command and verify that the expected day records exist.

- [ ] **Step 3: Load the app and sync**

Open the day view while online and confirm:
- planned items load from the shared DB path
- open items load from the shared DB path
- route screen still renders

- [ ] **Step 4: Verify offline fallback manually**

After one successful sync:
- simulate offline mode
- reload the app
- confirm cached day data still loads

- [ ] **Step 5: Verify the 10-work-order target**

Confirm the morning sync result and IndexedDB contents support up to 10 complete work orders for the technician.

- [ ] **Step 6: Update user-facing notes only after verification**

If the functionality is really live, then and only then add a changenote entry describing the new behavior.
