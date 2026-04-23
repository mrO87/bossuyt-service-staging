# Bossuyt Service — Project Conventions

Mobile-first field service PWA for Bossuyt technicians (Next.js 16 + PostgreSQL + offline-first).
Current version: **v1.20** (see `lib/releases.ts` — `CURRENT_RELEASE_VERSION`).

## Read First
Before working on this project, read:
- `ARCHITECTURE.md` — data model, sync strategy, project structure
- `PLANNING.md` — feature list, build phases, known tech debt
- `datastructuretemp.txt` — most recent structural audit of task + work-order system

## Tech Stack
- **Framework**: Next.js 16 (App Router, Turbopack dev, `output: "standalone"`, React Compiler on)
- **UI**: React 19 + Tailwind CSS v4 (PostCSS)
- **DB**: PostgreSQL 16 + Drizzle ORM (`drizzle-kit` for migrations)
- **Auth**: NextAuth v5 (beta) — *not yet enforced, see PLANNING.md issue #1*
- **Offline**: `idb` (IndexedDB) + pending-write queue; `next-pwa` service worker is configured but not yet wired end-to-end
- **Drag & drop**: `@dnd-kit/core` + `sortable` (day planning reorder)
- **PDF**: `jsPDF` (client-side generation, server-side upload)
- **Push**: `web-push` with VAPID
- **Routing/geocoding**: OpenRouteService (ORS) + Nominatim — see `lib/routing/`
- **Testing**: Vitest 4 (node environment, single fork)

## Commands
```bash
# Dev / build
npm run dev                 # Turbopack dev server on :3000
npm run build               # production build (standalone)
npm run start               # run the built standalone server
npm run lint                # eslint (next/core-web-vitals)

# Database (run from host — uses localhost connection)
npm run db:push             # push schema.ts → Postgres (drizzle-kit)
npm run db:seed             # seed staging data (lib/db/seed.ts)
npm run db:triggers         # apply audit-log triggers (lib/db/apply-triggers.ts)

# Tests (Vitest, config: vitest.config.test.ts)
npm run test                # one-shot run of tests/**/*.test.ts
npm run test:watch          # watch mode
```

`db:push`, `db:seed`, and `db:triggers` require `DATABASE_URL` (or `DATABASE_URL_HOST`) pointing at `localhost:<port>`. The app container itself uses the internal Docker hostname `db`. See `PLANNING.md` → "New Server Setup Checklist".

## Tooling Preferences
Pick the cheapest layer that answers the question:

- **leanCTX — default context layer.** Use it for looking, not changing: shell-output compression, file reads, directory/tree overview, grep/find/ls, light diffs, session context and checkpoints. Reach for it before raw `Bash`/`Read` whenever the answer is "show me" rather than "edit this".
- **jCodeMunch — surgical code intelligence.** Use it for questions *about* the code graph: symbol search, find references, importers, call hierarchy, rename blast radius, refactor planning, hotspots, dead code, architecture questions. Don't hand-roll `grep` for these — jCodeMunch is what knows the graph.
- **superpowers — design-doc workflow.** New initiatives get a dated plan under `docs/superpowers/plans/` and (when needed) a matching design under `docs/superpowers/specs/`. Follow the existing naming (`YYYY-MM-DD-<slug>.md`) instead of dropping ad-hoc markdown elsewhere.
- **OMC — local tool state only.** `.omc/` is gitignored; never commit it, never rely on its contents being present for another session.

Rule of thumb: leanCTX for *reading*, jCodeMunch for *reasoning about structure*, superpowers for *writing down a plan*, built-in tools (`Edit`/`Write`/`Bash`) for *actually changing* the repo.

## Project Rules
- **UI language**: Dutch (Belgium) — `nl-BE`. Status values, roles, and user-facing strings stay Dutch (`gepland`, `onderweg`, `bezig`, `afgewerkt`, `geannuleerd`, `warm`, `montage`, `preventief`).
- **Code, comments, filenames, variable names**: English.
- **Mobile-first** — design for a phone in the field.
- **High contrast, large touch targets** — app is used with dirty hands and gloves.
- **Offline-first** — every write goes to IndexedDB before the API. Failed writes go to `pendingWrites` and replay on reconnect.

## Branch Strategy — CRITICAL
- `main` — active development. All new features go here. Never deployed to production without explicit user approval.
- `production` — what Bossuyt sees at `bossuyt-service.fixassistant.com`. Only updated when the user explicitly says "deploy to production" or "push to production".
- **Never** suggest running `docker compose up --build` on the production server from `main`. Always ask which branch first.
- To promote a version to production: `git checkout production && git merge <commit> && git push origin production`, then rebuild on the server.

## Release & Versioning Workflow
- For visible changes on `staging.bossuyt.fixassistant.com`, first ask whether the work is a **new version** or a **refinement of the current version**.
- `/architecture`-only edits and hidden-route edits do not require a version question by themselves.
- **Do not bump versions on your own.** Version changes must be user-directed.
- Version metadata lives in **`lib/releases.ts`** — every visible staging release must add a `ReleaseEntry` here, and `CURRENT_RELEASE_VERSION` at the bottom must be kept in sync. The badge (`components/VersionBadge.tsx`) and the `/changenotes` page both read from this file.
- When a version is finished, ask whether to commit and push it to GitHub.

## Deployment
- Docker + Traefik on Hetzner.
- **Production** (`bossuyt-service.fixassistant.com`): `docker-compose.yml`, deploys from `production` branch only, port 3000 behind Traefik.
- **Staging** (`staging.bossuyt.fixassistant.com`): `docker-compose.staging.yml`, deploys from `main`, separate Postgres (`db-staging` on host port 5433).
- Public envs (`NEXT_PUBLIC_*`) are **build args** in the Dockerfile — they're baked into the client bundle and cannot be injected at runtime.
- Local compose: `docker compose up --build` runs the full app on :3000 (staging compose exposes :3000 too; do not run both at once).
- Staging version check: `curl https://staging.bossuyt.fixassistant.com/api/version`.

## Project Structure
```
/app                          → Next.js App Router
  layout.tsx                  → <html lang="nl-BE"> + AppProviders + VersionBadge
  page.tsx                    → day view (home)
  /interventions/[id]         → job detail
  /werkbon/nieuw              → new werkbon (ad-hoc, not tied to planned intervention)
  /activiteiten               → task list (Dutch UI, client-side store for now)
  /taken                      → redirect / legacy alias for activiteiten
  /architecture               → hidden dev page
  /changenotes                → release notes (reads lib/releases.ts)
  /lessons                    → in-app teaching content
  /api                        → see "API Surface" below

/components
  AppProviders.tsx            → context providers (tasks, settings, push, …)
  VersionBadge.tsx            → bottom-right badge (orange on staging)
  AvatarMenu.tsx              → top-right user menu + open task count
  DayView/                    → home screen (planning + open pool, dnd reorder)
  DayTimeline/                → vertical route timeline with real travel times
  WerkbonForm/                → werkbon form (parts, follow-up, signature, PDF)
  DevicePanel/                → collapsible device card (serial, docs, history)
  DeviceDocuments/            → per-device PDF viewer (schema/exploded/manual)
  CustomerSelect/ SiteSelect/ DeviceSelect/
  SettingsSheet/              → bottom-sheet settings
  SignaturePad/               → canvas signature capture

/lib
  db/
    schema.ts                 → Drizzle schema (source of truth for all tables)
    client.ts                 → postgres.js client
    index.ts                  → drizzle() wrapper
    with-audit.ts             → sets app.current_user per transaction
    audit-triggers.sql        → INSERT/UPDATE/DELETE triggers for every table
    apply-triggers.ts         → runs the .sql file
    seed.ts                   → staging seed data
  idb.ts                      → IndexedDB schema + helpers
  sync.ts                     → morning sync (GET /api/sync/today → IDB)
  releases.ts                 → release registry + CURRENT_VERSION
  mock-data.ts                → legacy mock dataset (being phased out)
  parts-catalog.ts            → article/parts reference data
  pdf.ts                      → jsPDF werkbon renderer
  pdf-parts-order.ts          → parts-order PDF
  lessons.ts                  → /lessons content
  task-store.tsx              → React Context (client-side task list in localStorage)
  task-meta.ts                → task type/role/priority labels & icons
  useDayData.ts               → hook wrapping sync + IDB read
  usePushNotifications.ts     → VAPID subscribe + test send
  hooks/useSettings.ts        → shared settings (start time, depot, home address)
  routing/
    IRoutingService.ts        → provider-agnostic routing interface
    OrsRoutingService.ts      → OpenRouteService implementation
    NominatimGeocoder.ts      → address → lat/lon via OpenStreetMap
    travelMargin.ts
  tasks/                      → DB-backed task system (new, alongside task-store.tsx)
    queue.ts sync.ts dependencies.ts migrate.ts transitions.ts
  server/interventions.ts     → server-only intervention helpers

/types
  index.ts                    → shared TS interfaces (Intervention, Werkbon, Task, DbTask, …)
  planning.ts                 → planning-view types

/tests                        → Vitest suites
  schema.test.ts api.tasks.test.ts api.erp.test.ts
  dependencies.test.ts transitions.test.ts queue.test.ts
  scenario.test.ts staging-compose.test.ts setup.ts

/docs
  releases/                   → release handoff notes
  superpowers/plans/ specs/   → design docs per initiative (dated)

/public                       → static assets + /uploads mount target
```

### API Surface (app/api)
```
GET  /api/version                               → build/version info
GET  /api/sync/today                            → morning sync (max 8 planned + 4 open)
POST /api/sync/write                            → reorder with planning_version check

GET  /api/interventions/[id]                    → full intervention detail
POST /api/interventions/[id]                    → update fields (status, etc.)

POST /api/work-orders/[id]/complete             → upload PDF + create werkbonnen record
GET  /api/work-orders/[id]/timeline             → work-order events feed
GET  /api/work-orders/[id]/links                → linked work orders
POST /api/work-orders/[id]/link                 → create link
POST /api/work-orders/[id]/photos               → upload photo
DELETE /api/work-orders/[id]/photos/[photoId]

GET  /api/devices/[id]                          → device detail
GET  /api/devices/[id]/history                  → werkbonnen per device
GET  /api/devices/documents                     → per brand+model (schema/exploded/manual)
POST /api/devices/documents                     → upload a device PDF

GET  /api/tasks                  POST /api/tasks
GET  /api/tasks/[id]             PATCH /api/tasks/[id]
POST /api/tasks/[id]/transition                 → status transition
POST /api/tasks/queue                           → queued task commands (offline replay)

POST /api/push/subscribe                        → store VAPID subscription
POST /api/push/send                             → test push

POST /api/route            POST /api/route/daily → ORS stops → distance/travel times

GET  /api/erp/work-orders                       → ERP export feed
POST /api/erp/work-orders/[id]/external-ref     → attach ERP id
GET  /api/erp/parts-pending                     → pending part-order tasks
POST /api/erp/parts-pending/[task_id]/fulfil    → mark as fulfilled

GET  /api/uploads/[...path]                     → serve runtime-uploaded files
```

## Data Model Notes
- **Werkbon model**: every "PDF Genereren & Opslaan" creates a **new** `werkbonnen` row — never overwrite. Device history reads from this table.
- **Audit log**: PostgreSQL triggers on every table log INSERT/UPDATE/DELETE into `audit_log` (jsonb old/new). API routes set `app.current_user` per transaction (see `lib/db/with-audit.ts`); the trigger reads that variable as `changed_by`. Until auth is wired up, `changed_by` is empty.
- **Two task systems currently coexist**:
  - Legacy client-side store (`lib/task-store.tsx`, `localStorage`, Dutch status values `open|gepland|bezig|wacht_op_info|klaar|geannuleerd`) — used by `/activiteiten`.
  - New DB-backed system (`lib/tasks/`, `types/DbTask`, English status values `pending|ready|in_progress|done|skipped|cancelled|blocked`) with dependencies and templates.
- **Planning conflict control**: `work_orders.planning_version` integer is incremented on every reorder; `/api/sync/write` rejects stale writes.
- **Denormalized fields** (`customerName`, `siteName`, etc.) still live on `Intervention` — flagged for removal in PLANNING.md.

## Environment Variables
See `.env.example`. Key ones:
- `DATABASE_URL` (host), `DATABASE_URL_DOCKER` (app container), `DATABASE_URL_STAGING_DOCKER`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — Web Push VAPID pair
- `ORS_API_KEY` — OpenRouteService (free tier, 2000 req/day)
- `NEXT_PUBLIC_STAGING` (build arg) — turns the version badge orange
- `NEXT_PUBLIC_GIT_SHA` (build arg) — surfaced via `/api/version`

## Testing Conventions
- Vitest in `node` environment, single-fork pool. Tests read `.env.test` / `.env.test.local` (loaded manually in `vitest.config.test.ts`).
- DB-touching tests expect a real Postgres; see `tests/setup.ts` and `staging-compose.test.ts` for the compose-based setup.
- Alias: `@` → project root.

## Teaching Mode — ALWAYS ACTIVE
This project is a learning exercise. The user is learning to code.
Treat every session like a live classroom or Udemy course:

- **Before writing a function**, briefly explain what it's going to do and why we need it.
- **After writing a function**, explain every part of it — what each line does, why we wrote it that way, and what would happen if we did it differently.
- **If the next function is similar** to one we just wrote, say "this one is almost the same as X, the only difference is..." — don't repeat the full explanation from scratch.
- **Explain concepts** (React hooks, TypeScript types, async/await, etc.) the moment they appear — don't assume the user knows them.
- **Use simple language** — no jargon without explanation.
- **Be encouraging** — this is a safe learning environment.
- Never just silently write code and move on. Every piece of code we write together gets explained.
