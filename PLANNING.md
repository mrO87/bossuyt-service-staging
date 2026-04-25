# Bossuyt Service — Planning

## Current State (v1.20)

The app is a mobile-first field service PWA for Bossuyt technicians.
Staging: https://staging.bossuyt.fixassistant.com

### What is built and working
- [x] Next.js 16 App Router + React 19 + TypeScript
- [x] Tailwind CSS v4 — mobile-first, high-contrast, large touch targets
- [x] PostgreSQL + Drizzle ORM — full relational schema
- [x] Day overview: planned jobs + open pool, drag & drop reorder
- [x] Route timeline with real travel times (OpenRouteService)
- [x] Werkbon form: status, time registration, work description, parts, follow-up actions, signature
- [x] PDF generation (jsPDF, client-side download + server upload)
- [x] Werkbon persistence: every save creates a new `werkbonnen` record — no overwriting
- [x] Device panel: collapsible card with serial number, install date, documents (schema/exploded/manual) and history
- [x] Device history: all `werkbonnen` per device, showing problem / solution / parts / PDF link
- [x] Audit log: PostgreSQL triggers on all tables — every INSERT/UPDATE/DELETE logged with who/when/old/new
- [x] Offline-first: IndexedDB cache + pending write queue + morning sync via /api/sync/today
- [x] Push notifications infrastructure (web-push)
- [x] PWA service worker (next-pwa)

---

## Build Phases

### Phase 1 — Foundation ✅ Complete
- [x] Next.js base + layout
- [x] Day view with live data from PostgreSQL
- [x] Werkbon form UI (parts, follow-up, signature, PDF)
- [x] Tailwind design tokens (no inline styles)
- [x] Werkbon data persisted to DB on save

### Phase 2 — Database & API ✅ Complete
- [x] Drizzle ORM + PostgreSQL schema
- [x] `werkbonnen` table — one record per submission, no overwriting
- [x] `audit_log` table — full change history via triggers
- [x] API: GET interventions (list + by id)
- [x] API: POST /api/work-orders/[id]/complete
- [x] API: GET /api/devices/[id]/history (reads from werkbonnen)
- [x] API: GET /api/devices/[id] (device detail)
- [x] API: GET+POST /api/devices/documents (device docs per brand+model)
- [x] API: GET /api/sync/today (morning sync)
- [x] API: GET /api/uploads/[...path] (serve runtime-uploaded files)
- [ ] Fix: Remove denormalized fields from `Intervention` type
        → fetch related data via joins (currently customerName, siteName etc. still embedded)

### Phase 3 — Offline First 🔄 Partial
- [x] `lib/idb.ts` — IndexedDB helpers (interventions, werkbonnen, pendingWrites, dayMeta)
- [x] `lib/sync.ts` — morning sync (downloads today's jobs to IndexedDB)
- [x] Pending write queue — offline writes queued and replayed on reconnect
- [ ] Service worker background sync (next-pwa configured, not yet tested end-to-end)
- [ ] Sync status indicators in UI (🟢 synced / 🟡 pending / 🔴 failed)

### Phase 4 — Push Notifications 🔄 Infrastructure ready
- [x] `lib/push.ts` — Web Push server-side (VAPID keys configured)
- [x] `/api/push/subscribe` — store subscription
- [x] `/api/push/send` — send notification
- [ ] "Onderweg" flow: status change → push to dispatcher
- [ ] "Nieuwe job" notification when admin assigns a job

### Phase 5 — Admin / Office View 🔲 Not started
- [ ] Auth: enforce NextAuth session on all pages (currently unauthenticated in staging)
- [ ] Planning view: see all interventions per day, assign technicians
- [ ] Open interventions board: all non-afgewerkt jobs, filterable by status
- [ ] Follow-up actions board: office can see and close open follow-up actions
- [ ] Audit log viewer: admin can browse change history per record
- [ ] Werkbon edit: admin can correct workStart/workEnd, notes, parts after submission

### Phase 6 — Production Hardening 🔲 Not started
- [ ] Auth enforced everywhere (technician + admin roles)
- [ ] Real customers, devices, sites imported (replace staging seed data)
- [ ] Error boundaries and loading states throughout
- [ ] GDPR: data retention policy, right-to-erasure
- [ ] End-to-end offline test (airplane mode full day simulation)

---

## New Server Setup Checklist

When deploying to a new server, run these in order:

```bash
# 1. Clone repo
git clone git@github.com:mrO87/bossuyt-service-staging.git
cd bossuyt-service-staging

# 2. Copy environment files
cp .env.staging.example .env.staging   # fill in DB password, VAPID keys, ORS key

# 3. Start containers
docker compose -f docker-compose.staging.yml up --build -d

# 4. Push schema to DB (run from host, not container)
DATABASE_URL="postgresql://bossuyt:<password>@localhost:5433/bossuyt_staging" npm run db:push

# 5. Apply audit triggers (must run after db:push)
DATABASE_URL_HOST="postgresql://bossuyt:<password>@localhost:5433/bossuyt_staging" npm run db:triggers

# 6. Seed staging data
DATABASE_URL_HOST="postgresql://bossuyt:<password>@localhost:5433/bossuyt_staging" npm run db:seed
```

> Note: `db:push` and `db:triggers` use `localhost:<port>` (host-side connection).
> The app container uses the internal Docker hostname `db`.

---

## Known Issues & Tech Debt

| # | Issue | Priority |
|---|-------|----------|
| 1 | Auth not enforced — no session check, anyone can access staging | High |
| 2 | `Intervention` type has denormalized fields (customerName, siteName, etc.) | Medium |
| 3 | Concurrent werkbon conflict: 2 technicians submit same job → both create werkbon records | Medium |
| 4 | Service worker background sync not tested end-to-end | Medium |
| 5 | `changed_by` in audit log is empty until auth is wired up | Low |
| 6 | Old historical seed data (pre-v1.13) has no `werkbonnen` records → won't show in history | Low |
| 7 | No error boundaries or loading states in most components | Low |
| 8 | GDPR: no data retention policy, no right-to-erasure | Legal |
