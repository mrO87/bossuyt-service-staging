# Bossuyt Service — Planning

## Build Phases

### Phase 1 — Foundation (in progress)
- [x] Next.js base + layout
- [x] Day view with mock data
- [x] Werkbon form UI (parts, follow-up, signature, PDF)
- [ ] **Fix: Replace inline styles with Tailwind design tokens** ← current
- [ ] Fix: Auth — add `useSession` check and redirect to login if unauthenticated
- [ ] Fix: Werkbon form must persist data to IndexedDB on every change (not lost on refresh)

### Phase 2 — Database & API
- [ ] Drizzle ORM setup + PostgreSQL schema (all models from ARCHITECTURE.md)
- [ ] Fix: Remove denormalized fields from `Intervention` type (customerName, siteName, etc.)
        → fetch related data via joins instead of embedding it on the intervention
- [ ] API: interventions (GET list, GET by id, PATCH status)
- [ ] API: werkbon (POST create, PATCH update, POST submit)
- [ ] API: notifications (GET unread, PATCH mark read)
- [ ] API: sync/today (bulk endpoint for morning sync)
- [ ] Replace all mock data imports with real API calls

### Phase 3 — Offline First
- [ ] `lib/idb.ts` — IndexedDB helpers (read/write interventions, werkbonnen, articles)
- [ ] `lib/sync.ts` — morning sync logic (download today's data to IndexedDB)
- [ ] `lib/queue.ts` — pending write queue manager
- [ ] Service worker setup (next-pwa) with background sync on reconnect
- [ ] Sync status indicators (🟢 synced / 🟡 pending / 🔴 failed)

### Phase 4 — Push Notifications
- [ ] `lib/push.ts` — Web Push server-side sending
- [ ] "Onderweg" flow: PATCH status → create Notification records → send Web Push
- [ ] "Nieuwe job" notification when admin assigns a job

### Phase 5 — Admin / Office View
- [ ] Planning view: see all interventions per day, assign technicians
- [ ] Open interventions view: all non-afgewerkt jobs, filterable by status
- [ ] FollowUpActions board: office can see and close open follow-up actions

---

## Known Issues & Tech Debt

| # | Issue | Priority |
|---|-------|----------|
| 1 | **No database** — app runs entirely on mock data | Critical |
| 2 | **Werkbon data lost on refresh** — no IndexedDB persistence yet | Critical |
| 3 | ~~Inline styles instead of Tailwind tokens~~ | Done |
| 4 | `Intervention` type has denormalized fields (customerName, siteName, etc.) | High |
| 5 | Auth not enforced — no session check in any page or component | High |
| 6 | PDF "opslaan" generates but never uploads to storage — button label is misleading | Medium |
| 7 | Concurrent werkbon conflict: 2 technicians on same job, both submit → undefined behaviour | Medium |
| 8 | No error boundaries or loading states anywhere | Medium |
| 9 | `Article.compatibleDeviceIds[]` is a JSON array — should be a join table | Low |
| 10 | GDPR: no data retention policy, no right-to-erasure mechanism | Legal |
